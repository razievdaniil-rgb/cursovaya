import { Inject, Injectable, Logger } from '@nestjs/common';

import { Problems } from '../common/problem';
import { PrismaService } from '../prisma/prisma.service';
import { RoszdravnadzorNomenclatureProvider } from './nomenclature/roszdravnadzor-nomenclature.provider';
import {
  REGISTRY_PROVIDER,
  type RegistryFetchScenario,
  type RegistryProvider,
} from './registry-provider';
import type { SyncQueryInput, SyncRunInput } from './sync.schema';

/** Старше этого срока последняя успешная загрузка считается устаревшей. */
const STALE_AFTER_HOURS = 24;

/**
 * Журнал загрузок и запуск синхронизации.
 *
 * Статус изделия обновляется только вместе с добавлением события в
 * registry_status_history — одной транзакцией. История не перезаписывается,
 * поэтому каждая загрузка оставляет проверяемый след.
 */
@Injectable()
export class SyncService {
  private readonly logger = new Logger(SyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(REGISTRY_PROVIDER) private readonly provider: RegistryProvider,
  ) {}

  // -------------------------------------------------------------------------
  // Журнал
  // -------------------------------------------------------------------------

  async getStatus(query: SyncQueryInput) {
    const source = this.provider.describe();

    const sourceRow = await this.prisma.syncSource.findUnique({
      where: { code: source.code },
      select: { id: true, code: true, name: true, baseUrl: true, isEnabled: true },
    });

    const runs = await this.prisma.syncRun.findMany({
      ...(sourceRow ? { where: { syncSourceId: sourceRow.id } } : {}),
      orderBy: { startedAt: 'desc' },
      take: query.limit,
      select: {
        id: true,
        startedAt: true,
        finishedAt: true,
        recordsRead: true,
        recordsChanged: true,
        errorCount: true,
        errorMessage: true,
        status: { select: { code: true, name: true } },
        initiatedByUser: { select: { id: true, displayName: true } },
        _count: { select: { errors: true } },
      },
    });

    const lastSuccessful = runs.find((run) => run.status.code === 'success');
    const lastRun = runs[0];

    return {
      source: {
        code: sourceRow?.code ?? source.code,
        name: sourceRow?.name ?? source.name,
        baseUrl: sourceRow?.baseUrl ?? source.baseUrl,
        isEnabled: sourceRow?.isEnabled ?? false,
        // Честное указание, что внешний реестр не подключён (ADR 0008).
        isReal: source.isReal,
      },
      state: this.deriveState(lastRun, lastSuccessful),
      lastUpdatedAt: lastSuccessful?.finishedAt ?? null,
      records: lastSuccessful?.recordsRead ?? 0,
      changes: lastSuccessful?.recordsChanged ?? 0,
      // Источников два, и у них разный статус: демонстрационный реестр и
      // настоящая номенклатура из открытых данных (ADR 0009). Интерфейс
      // обязан различать их, поэтому список отдаётся целиком.
      sources: await this.listSources(),
      runs: runs.map((run) => ({
        id: run.id,
        status: run.status.code,
        statusName: run.status.name,
        startedAt: run.startedAt,
        finishedAt: run.finishedAt,
        recordsRead: run.recordsRead,
        recordsChanged: run.recordsChanged,
        errorCount: run.errorCount,
        errorMessage: run.errorMessage,
        loggedErrorCount: run._count.errors,
        initiatedBy: run.initiatedByUser,
      })),
    };
  }

  /**
   * Все зарегистрированные источники с их последними загрузками.
   *
   * `isReal` берётся из описания провайдера, а не из базы: признак
   * «подключён настоящий источник» — свойство кода, а не данных, и подменить
   * его записью в таблице нельзя.
   */
  private async listSources() {
    const real = new Set([RoszdravnadzorNomenclatureProvider.CODE]);

    const sources = await this.prisma.syncSource.findMany({
      orderBy: { code: 'asc' },
      select: {
        id: true,
        code: true,
        name: true,
        baseUrl: true,
        isEnabled: true,
        runs: {
          orderBy: { startedAt: 'desc' },
          take: 1,
          select: {
            startedAt: true,
            finishedAt: true,
            recordsRead: true,
            recordsChanged: true,
            errorCount: true,
            status: { select: { code: true } },
          },
        },
      },
    });

    return sources.map((source) => {
      const last = source.runs[0];
      return {
        code: source.code,
        name: source.name,
        baseUrl: source.baseUrl,
        isEnabled: source.isEnabled,
        isReal: real.has(source.code),
        lastRun: last
          ? {
              status: last.status.code,
              startedAt: last.startedAt,
              finishedAt: last.finishedAt,
              recordsRead: last.recordsRead,
              recordsChanged: last.recordsChanged,
              errorCount: last.errorCount,
            }
          : null,
      };
    });
  }

  /**
   * Состояние журнала для интерфейса.
   *
   * `error` — последняя загрузка упала; `stale` — успешной загрузки давно не
   * было; `current` — данные свежие. Состояние выводится из журнала, а не
   * хранится отдельным полем.
   */
  private deriveState(
    lastRun: { status: { code: string } } | undefined,
    lastSuccessful: { finishedAt: Date | null } | undefined,
  ): 'current' | 'stale' | 'error' | 'empty' {
    if (!lastRun) return 'empty';
    if (lastRun.status.code === 'failed') return 'error';
    if (!lastSuccessful?.finishedAt) return 'stale';

    const ageHours =
      (Date.now() - lastSuccessful.finishedAt.getTime()) / (1000 * 60 * 60);

    return ageHours > STALE_AFTER_HOURS ? 'stale' : 'current';
  }

  async getRunErrors(runId: string) {
    const run = await this.prisma.syncRun.findUnique({
      where: { id: runId },
      select: { id: true },
    });
    if (!run) throw Problems.notFound('Запуск загрузки');

    const errors = await this.prisma.syncRunError.findMany({
      where: { syncRunId: runId },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        externalRecordId: true,
        errorCode: true,
        message: true,
        payloadChecksum: true,
        createdAt: true,
      },
    });

    return errors;
  }

  // -------------------------------------------------------------------------
  // Запуск
  // -------------------------------------------------------------------------

  async run(userId: string, input: SyncRunInput) {
    const source = this.provider.describe();

    const sourceRow = await this.prisma.syncSource.upsert({
      where: { code: source.code },
      update: { name: source.name, baseUrl: source.baseUrl },
      create: {
        code: source.code,
        name: source.name,
        baseUrl: source.baseUrl,
        isEnabled: true,
      },
      select: { id: true, isEnabled: true },
    });

    if (!sourceRow.isEnabled) throw Problems.syncSourceDisabled();

    const runningStatus = await this.prisma.syncRunStatus.findUniqueOrThrow({
      where: { code: 'running' },
      select: { id: true },
    });

    const run = await this.prisma.syncRun.create({
      data: {
        syncSourceId: sourceRow.id,
        statusId: runningStatus.id,
        initiatedByUserId: userId,
      },
      select: { id: true, startedAt: true },
    });

    try {
      const result = await this.provider.fetchRecords(
        input.scenario as RegistryFetchScenario | undefined,
      );

      const changed = await this.applyRecords(run.id, result.records);

      const statusCode =
        result.errors.length === 0
          ? 'success'
          : result.records.length === 0
            ? 'failed'
            : 'partial';

      const status = await this.prisma.syncRunStatus.findUniqueOrThrow({
        where: { code: statusCode },
        select: { id: true },
      });

      await this.prisma.$transaction([
        this.prisma.syncRun.update({
          where: { id: run.id },
          data: {
            statusId: status.id,
            finishedAt: new Date(),
            recordsRead: result.recordsRead,
            recordsChanged: changed,
            errorCount: result.errors.length,
            errorMessage:
              result.errors.length > 0 ? (result.errors[0]?.message ?? null) : null,
          },
        }),
        this.prisma.syncRunError.createMany({
          data: result.errors.map((error) => ({
            syncRunId: run.id,
            externalRecordId: error.externalRecordId ?? null,
            errorCode: error.errorCode,
            message: error.message,
            payloadChecksum: error.payloadChecksum ?? null,
          })),
        }),
      ]);

      // Аналитика обновляется только после загрузки, завершившейся без
      // полного отказа (ADR 0006).
      if (statusCode !== 'failed') {
        await this.prisma.refreshAnalyticsViews(true);
      }

      return {
        runId: run.id,
        status: statusCode,
        recordsRead: result.recordsRead,
        recordsChanged: changed,
        errorCount: result.errors.length,
        // Повторяется в ответе на каждый запуск, чтобы интерфейс не мог
        // показать демонстрационную загрузку как реальную.
        source: { code: source.code, isReal: source.isReal },
      };
    } catch (error) {
      const failedStatus = await this.prisma.syncRunStatus.findUniqueOrThrow({
        where: { code: 'failed' },
        select: { id: true },
      });

      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Загрузка ${run.id} завершилась ошибкой: ${message}`);

      await this.prisma.syncRun.update({
        where: { id: run.id },
        data: {
          statusId: failedStatus.id,
          finishedAt: new Date(),
          errorCount: 1,
          errorMessage: message.slice(0, 1024),
        },
      });

      throw error;
    }
  }

  /**
   * Применение записей: статус изделия и событие истории пишутся вместе.
   *
   * Запись без изменения статуса не создаёт события — иначе история росла бы
   * на каждую загрузку, не сообщая ничего нового.
   */
  private async applyRecords(
    runId: string,
    records: { registrationNumber: string; statusCode: string; effectiveAt: Date; comment?: string }[],
  ): Promise<number> {
    let changed = 0;

    for (const record of records) {
      const product = await this.prisma.product.findUnique({
        where: { registrationNumber: record.registrationNumber },
        select: { id: true, currentRegistryStatusId: true },
      });
      if (!product) continue;

      const status = await this.prisma.registryStatus.findUnique({
        where: { code: record.statusCode },
        select: { id: true },
      });
      if (!status) continue;

      if (status.id === product.currentRegistryStatusId) continue;

      await this.prisma.$transaction([
        this.prisma.product.update({
          where: { id: product.id },
          data: { currentRegistryStatusId: status.id },
        }),
        this.prisma.registryStatusHistory.create({
          data: {
            productId: product.id,
            registryStatusId: status.id,
            effectiveAt: record.effectiveAt,
            sourceRunId: runId,
            comment: record.comment ?? null,
          },
        }),
      ]);

      changed += 1;
    }

    return changed;
  }
}
