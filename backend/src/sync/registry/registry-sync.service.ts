import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';

import { Problems } from '../../common/problem';
import { PrismaService } from '../../prisma/prisma.service';
import { RoszdravnadzorRegistryProvider } from './roszdravnadzor-registry.provider';
import type { RegistryEntry } from './registry.types';

const STATUS_MAP: Record<string, string> = {
  active: 'active',
  suspended: 'suspended',
  deadline_has_expired: 'expired',
  cancelled: 'cancelled',
  invalid: 'invalid',
};

/** Названия статусов для справочника, если значения ещё нет. */
const STATUS_NAMES: Record<string, string> = {
  active: 'Действует',
  suspended: 'Приостановлен',
  expired: 'Истёк',
  cancelled: 'Отменено',
  invalid: 'Недействительно',
};


export interface RegistrySyncResult {
  runId: string;
  status: 'success' | 'partial' | 'failed';
  totalInRegistry: number;
  recordsRead: number;
  productsCreated: number;
  productsUpdated: number;
  manufacturersCreated: number;
  statusChanges: number;
  skipped: number;
  /** Source traversal reached its last page and raw row count matched its total. */
  complete: boolean;
  pagesRead: number;
  rejected: number;
  warnings: number;
  analyticsRefreshed: boolean;
  source: { code: string; isReal: boolean };
}

class IdentityConflict extends Error {}

/** Names/addresses are exact, NFC-normalized source values, not fuzzy identities.
 * Namespace keeps registry identities separate from manually curated manufacturers.
 * Missing producers are scoped to the source record rather than merged globally.
 */
export function registryManufacturerIdentity(entry: RegistryEntry) {
  const name = (entry.producer?.name ?? 'Производитель не указан').trim().normalize('NFC');
  const actualAddress = entry.producer?.actualAddress?.trim().normalize('NFC') || null;
  const key = JSON.stringify(['roszdravnadzor-registry/manufacturer/v1',
    entry.producer ? [name, actualAddress] : ['missing', entry.externalId]]);
  const bytes = createHash('sha256').update(key).digest().subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x80; // UUID v8: namespaced SHA-256
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  const id = [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16),
    hex.slice(16, 20), hex.slice(20)].join('-');
  return { id, name, actualAddress };
}

@Injectable()
export class RegistrySyncService {
  private readonly logger = new Logger(RegistrySyncService.name);
  private readonly activeRuns = new Map<string, Promise<RegistrySyncResult>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly provider: RoszdravnadzorRegistryProvider,
  ) {}

  /** A persisted run is acknowledged before any registry network request.
   * This is process-local execution, not a durable queue: crashed workers leave
   * an unfinished row and the DB uniqueness guard requires explicit recovery.
   */
  async start(
    userId: string | null,
    options: { pageSize?: number; maxPages?: number } = {},
  ): Promise<{ runId: string; status: 'running' }> {
    return new Promise((resolve, reject) => {
      let startedRunId: string | undefined;
      // run() awaits database setup before invoking onStarted, so task has
      // been assigned by the time this callback stores it in activeRuns.
      const task = this.run(userId, options, (runId) => {
        startedRunId = runId;
        this.activeRuns.set(runId, task);
        resolve({ runId, status: 'running' });
      });
      // Attach both handlers immediately. run() owns journal finalization;
      // this handler observes every rejection without creating an unhandled job.
      void task.then(
        () => {
          if (startedRunId) this.activeRuns.delete(startedRunId);
        },
        (error: unknown) => {
          if (!startedRunId) {
            reject(error);
            return;
          }
          this.activeRuns.delete(startedRunId);
          this.logger.error('Background registry import ' + startedRunId + ' failed: ' + errorMessage(error));
        },
      );
    });
  }

  async run(
    userId: string | null,
    options: { pageSize?: number; maxPages?: number } = {},
    onStarted?: (runId: string) => void,
  ): Promise<RegistrySyncResult> {
    const source = this.provider.describe();
    const sourceRow = await this.prisma.syncSource.upsert({
      where: { code: source.code },
      update: { name: source.name, baseUrl: source.baseUrl },
      create: { code: source.code, name: source.name, baseUrl: source.baseUrl, isEnabled: true },
      select: { id: true, isEnabled: true },
    });
    if (!sourceRow.isEnabled) throw Problems.syncSourceDisabled();
    await this.ensureSyncRunStatuses();
    const running = await this.prisma.syncRunStatus.findUniqueOrThrow({
      where: { code: 'running' }, select: { id: true },
    });
    // DB partial unique index is the cross-process guard. Never reclaim by age:
    // a slow worker may still be alive. Operators must stop its worker first.
    const run = await this.prisma.syncRun.create({
      data: { syncSourceId: sourceRow.id, statusId: running.id, initiatedByUserId: userId },
      select: { id: true },
    }).catch((error: unknown) => {
      if (isPrismaCode(error, 'P2002')) {
        throw new ConflictException('An unfinished import already exists for this source; confirm its worker has stopped before recovery');
      }
      throw error;
    });
    const counters = {
      recordsRead: 0, productsCreated: 0, productsUpdated: 0,
      manufacturersCreated: 0, statusChanges: 0, skipped: 0,
      pagesRead: 0, rejected: 0, warnings: 0,
    };
    let totalInRegistry = 0;
    let complete = false;
    let analyticsRefreshed = false;
    let lastPage = false;
    let previousTotal: number | undefined;
    let previousPages: number | undefined;
    let sourceChanged = false;
    let loggedErrors = 0;
    const seenExternalIds = new Set<number>();
    const logIssue = async (errorCode: string, message: string, externalRecordId?: string) => {
      if (loggedErrors >= 100) return;
      await this.prisma.syncRunError.create({
        data: { syncRunId: run.id, errorCode, message: message.slice(0, 1024),
          externalRecordId: externalRecordId?.slice(0, 128) },
      });
      loggedErrors += 1;
    };
    const refresh = async () => {
      // Refresh partial writes even if a later page fails. Never hold a DB
      // transaction open over network I/O or the full import.
      try {
        await this.prisma.refreshAnalyticsViews(true);
        analyticsRefreshed = true;
      } catch (error) {
        counters.warnings += 1;
        await logIssue('ANALYTICS_REFRESH_FAILED', errorMessage(error));
      }
    };
    try {
      onStarted?.(run.id);
      const statusIds = await this.ensureStatuses();
      for await (const page of this.provider.iterate(options.pageSize ?? 500, options.maxPages)) {
        counters.pagesRead += 1;
        counters.recordsRead += page.rawCount;
        counters.rejected += page.rejected.length;
        counters.skipped += page.rejected.length;
        sourceChanged ||= previousTotal !== undefined &&
          (previousTotal !== page.totalElements || previousPages !== page.totalPages);
        previousTotal = page.totalElements;
        previousPages = page.totalPages;
        totalInRegistry = page.totalElements;
        lastPage = page.last;
        for (const rejection of page.rejected) {
          await logIssue('SOURCE_RECORD_REJECTED',
            'Page ' + page.page + ', row ' + rejection.index + ': ' + rejection.message);
        }
        for (const entry of page.entries) {
          if (seenExternalIds.has(entry.externalId)) {
            counters.skipped += 1;
            sourceChanged = true;
            await logIssue('DUPLICATE_SOURCE_ID',
              'Source repeated externalId=' + entry.externalId, entry.registrationNumber);
            continue;
          }
          seenExternalIds.add(entry.externalId);
          let applied: Awaited<ReturnType<RegistrySyncService['applyEntry']>>;
          try {
            applied = await this.applyEntry(entry, statusIds, run.id);
          } catch (error) {
            counters.skipped += 1;
            await logIssue(error instanceof IdentityConflict ? 'IDENTITY_CONFLICT' : 'ENTRY_IMPORT_FAILED',
              errorMessage(error), String(entry.externalId) + ': ' + entry.registrationNumber);
            continue;
          }
          counters.productsCreated += Number(applied.created);
          counters.productsUpdated += Number(!applied.created);
          counters.manufacturersCreated += Number(applied.manufacturerCreated);
          counters.statusChanges += Number(applied.statusChanged);
          if (applied.dateAnomaly) {
            counters.warnings += 1;
            await logIssue('REGISTRY_DATE_ANOMALY',
              'Expiry ' + entry.expiresAt + ' precedes registration ' + entry.registrationDate +
              '; source dates preserved', entry.registrationNumber);
          }
        }
        // Persist progress, but finished_at remains NULL until every final step completes.
        await this.prisma.syncRun.update({
          where: { id: run.id },
          data: { recordsRead: counters.recordsRead,
            recordsChanged: counters.productsCreated + counters.productsUpdated,
            errorCount: counters.skipped + counters.warnings },
        });
        this.logger.log('Registry page ' + (page.page + 1) + '/' + page.totalPages +
          ', read ' + counters.recordsRead + '/' + totalInRegistry);
      }
      complete = lastPage && !sourceChanged && counters.recordsRead === totalInRegistry;
      if (!complete) {
        counters.warnings += 1;
        await logIssue('INCOMPLETE_TRAVERSAL',
          'pagesRead=' + counters.pagesRead + '; recordsRead=' + counters.recordsRead +
          '; total=' + totalInRegistry + '; lastPage=' + lastPage + '; sourceChanged=' + sourceChanged +
          '; maxPages=' + (options.maxPages ?? 'none'));
      }
      await refresh();
      const statusCode = counters.skipped > 0 || counters.warnings > 0 || !complete ? 'partial' : 'success';
      const status = await this.prisma.syncRunStatus.findUniqueOrThrow({
        where: { code: statusCode }, select: { id: true },
      });
      await this.prisma.syncRun.update({
        where: { id: run.id },
        data: { statusId: status.id, finishedAt: new Date(),
          recordsRead: counters.recordsRead,
          recordsChanged: counters.productsCreated + counters.productsUpdated,
          errorCount: counters.skipped + counters.warnings,
          errorMessage: statusCode === 'partial'
            ? 'complete=' + complete + '; pages=' + counters.pagesRead + '; rejected=' + counters.rejected +
              '; skipped=' + counters.skipped + '; warnings=' + counters.warnings
            : null },
      });
      return { runId: run.id, status: statusCode, totalInRegistry, ...counters,
        complete, analyticsRefreshed, source: { code: source.code, isReal: source.isReal } };
    } catch (error) {
      if (counters.productsCreated + counters.productsUpdated > 0 && !analyticsRefreshed) await refresh();
      const failed = await this.prisma.syncRunStatus.findUniqueOrThrow({
        where: { code: 'failed' }, select: { id: true },
      });
      await logIssue('IMPORT_FAILED', errorMessage(error));
      await this.prisma.syncRun.update({
        where: { id: run.id },
        data: { statusId: failed.id, finishedAt: new Date(),
          recordsRead: counters.recordsRead,
          recordsChanged: counters.productsCreated + counters.productsUpdated,
          errorCount: counters.skipped + counters.warnings + 1,
          errorMessage: errorMessage(error).slice(0, 1024) },
      });
      throw error;
    }
  }

  /** Статусы запусков загрузки: нужны журналу до начала работы. */
  private async ensureSyncRunStatuses(): Promise<void> {
    const statuses: [string, string][] = [
      ['running', 'Выполняется'],
      ['success', 'Успешно'],
      ['partial', 'Частично'],
      ['failed', 'Ошибка'],
    ];

    for (const [code, name] of statuses) {
      await this.prisma.syncRunStatus.upsert({
        where: { code },
        update: {},
        create: { code, name },
      });
    }
  }

  /** Справочник статусов пополняется значениями источника без миграции. */
  private async ensureStatuses(): Promise<Map<string, string>> {
    const codes = [...new Set(Object.values(STATUS_MAP))];

    for (const code of codes) {
      await this.prisma.registryStatus.upsert({
        where: { code },
        update: {},
        create: { code, name: STATUS_NAMES[code] ?? code },
      });
    }

    const rows = await this.prisma.registryStatus.findMany({
      select: { id: true, code: true },
    });

    return new Map(rows.map((row) => [row.code, row.id]));
  }


  private async applyEntry(entry: RegistryEntry, statusIds: Map<string, string>, runId: string) {
    const statusCode = STATUS_MAP[entry.statusCode];
    const statusId = statusCode && statusIds.get(statusCode);
    if (!statusId) throw new Error('Unknown source status: ' + entry.statusCode);
    // Serializable retry handles concurrent changes from other catalogue writers.
    // All product, manufacturer and history writes commit/rollback together.
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await this.prisma.$transaction(async (tx) => {
          const existing = await tx.product.findUnique({
            where: { externalRegistryId: entry.externalId },
            select: { id: true, currentRegistryStatusId: true },
          });
          const byNumber = await tx.product.findUnique({
            where: { registrationNumber: entry.registrationNumber },
            select: { id: true },
          });
          if (byNumber && byNumber.id !== existing?.id) {
            throw new IdentityConflict('Registration number belongs to another product; externalId=' +
              entry.externalId + ', registrationNumber=' + entry.registrationNumber);
          }
          const identity = registryManufacturerIdentity(entry);
          const manufacturer = await tx.manufacturer.findUnique({ where: { id: identity.id } });
          if (manufacturer && (manufacturer.name !== identity.name ||
              manufacturer.actualAddress !== identity.actualAddress)) {
            throw new IdentityConflict('Manufacturer identity collision or curated source identity changed');
          }
          if (!manufacturer) await tx.manufacturer.create({ data: identity });
          const observedAt = new Date();
          const data = {
            manufacturerId: identity.id, currentRegistryStatusId: statusId,
            registrationNumber: entry.registrationNumber,
            name: entry.name.slice(0, 512), shortName: entry.name.slice(0, 255),
            registrationDate: entry.registrationDate ? new Date(entry.registrationDate) : null,
            registrationExpiresAt: entry.expiresAt ? new Date(entry.expiresAt) : null,
            externalRegistryId: entry.externalId, legalSystem: entry.legalSystem,
            modelsDescription: entry.modelsDescription, frnsiId: entry.frnsiId,
            verifiedAt: observedAt,
          };
          const product = existing
            ? await tx.product.update({ where: { id: existing.id }, data, select: { id: true } })
            : await tx.product.create({ data, select: { id: true } });
          const statusChanged = !!existing && existing.currentRegistryStatusId !== statusId;
          if (!existing || statusChanged) {
            const latest = await tx.registryStatusHistory.findFirst({
              where: { productId: product.id }, orderBy: { effectiveAt: 'desc' },
              select: { effectiveAt: true },
            });
            // Distinct observations must never overwrite a previous event, even
            // within the same JS millisecond or after a local clock adjustment.
            const effectiveAt = new Date(Math.max(observedAt.getTime(),
              latest ? latest.effectiveAt.getTime() + 1 : 0));
            await tx.registryStatusHistory.create({
              data: { productId: product.id, registryStatusId: statusId, effectiveAt,
                sourceRunId: runId,
                comment: 'Observed in registry (source effective date unknown): ' + entry.statusName },
            });
          }
          return {
            created: !existing, statusChanged, manufacturerCreated: !manufacturer,
            dateAnomaly: !!(data.registrationDate && data.registrationExpiresAt &&
              data.registrationExpiresAt < data.registrationDate),
          };
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      } catch (error) {
        if (attempt < 2 && isPrismaCode(error, 'P2034')) continue;
        if (isPrismaCode(error, 'P2002')) {
          throw new IdentityConflict('Concurrent identity conflict; record not merged: ' + entry.externalId);
        }
        throw error;
      }
    }
  }
}

function isPrismaCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code;
}
function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
