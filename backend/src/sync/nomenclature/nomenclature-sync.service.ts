import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { RoszdravnadzorNomenclatureProvider } from './roszdravnadzor-nomenclature.provider';
import type {
  NomenclatureIssue,
  NomenclatureParseResult,
} from './nomenclature.types';

/**
 * Загрузка номенклатурной классификации в базу (ADR 0009).
 *
 * Разделы и виды пишутся порциями: 25 708 видов и 591 раздел по одному
 * запросу на запись дали бы десятки тысяч обращений к базе.
 *
 * Дерево разделов создаётся в два прохода: сначала узлы без родителей, затем
 * расставляются ссылки. Иначе порядок записей в файле определял бы, удастся
 * ли вставить дочерний раздел раньше родительского.
 */

const CHUNK = 1000;

export interface NomenclatureSyncResult {
  runId: string;
  status: 'success' | 'partial' | 'failed';
  recordsRead: number;
  sectionsUpserted: number;
  typesUpserted: number;
  linksUpserted: number;
  issueCount: number;
  source: { code: string; isReal: boolean };
}

@Injectable()
export class NomenclatureSyncService {
  private readonly logger = new Logger(NomenclatureSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly provider: RoszdravnadzorNomenclatureProvider,
  ) {}

  async run(userId: string | null): Promise<NomenclatureSyncResult> {
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
      select: { id: true },
    });

    const running = await this.prisma.syncRunStatus.findUniqueOrThrow({
      where: { code: 'running' },
      select: { id: true },
    });

    const run = await this.prisma.syncRun.create({
      data: {
        syncSourceId: sourceRow.id,
        statusId: running.id,
        initiatedByUserId: userId,
      },
      select: { id: true },
    });

    try {
      const parsed = await this.provider.fetchNomenclature();

      const sectionsUpserted = await this.upsertSections(parsed);
      const { typesUpserted, linksUpserted } = await this.upsertTypes(parsed);

      await this.recordIssues(run.id, parsed.issues);

      // Замечания означают дефекты источника, а не отказ загрузки: данные
      // приняты, поэтому статус partial, а не failed.
      const status = parsed.issues.length > 0 ? 'partial' : 'success';

      const statusRow = await this.prisma.syncRunStatus.findUniqueOrThrow({
        where: { code: status },
        select: { id: true },
      });

      await this.prisma.syncRun.update({
        where: { id: run.id },
        data: {
          statusId: statusRow.id,
          finishedAt: new Date(),
          recordsRead: parsed.recordsRead,
          recordsChanged: typesUpserted + sectionsUpserted,
          errorCount: parsed.issues.length,
          errorMessage:
            parsed.issues.length > 0
              ? `Источник вернул ${parsed.issues.length} записей с расхождениями`
              : null,
        },
      });

      this.logger.log(
        `Номенклатура загружена: ${parsed.types.length} видов, ` +
          `${parsed.sections.length} разделов, ${parsed.issues.length} замечаний`,
      );

      return {
        runId: run.id,
        status,
        recordsRead: parsed.recordsRead,
        sectionsUpserted,
        typesUpserted,
        linksUpserted,
        issueCount: parsed.issues.length,
        source: { code: source.code, isReal: source.isReal },
      };
    } catch (error) {
      const failed = await this.prisma.syncRunStatus.findUniqueOrThrow({
        where: { code: 'failed' },
        select: { id: true },
      });

      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Загрузка номенклатуры ${run.id} не удалась: ${message}`);

      await this.prisma.syncRun.update({
        where: { id: run.id },
        data: {
          statusId: failed.id,
          finishedAt: new Date(),
          errorCount: 1,
          errorMessage: message.slice(0, 1024),
        },
      });

      await this.prisma.syncRunError.create({
        data: {
          syncRunId: run.id,
          errorCode: 'SOURCE_UNAVAILABLE',
          message: message.slice(0, 1024),
        },
      });

      throw error;
    }
  }

  /** Разделы: сначала узлы, затем связи с родителями. */
  private async upsertSections(parsed: NomenclatureParseResult): Promise<number> {
    if (parsed.sections.length === 0) return 0;

    for (const chunk of chunked(parsed.sections, CHUNK)) {
      await this.prisma.$transaction(
        chunk.map((section) =>
          this.prisma.nomenclatureSection.upsert({
            where: { number: section.number },
            update: { name: section.name },
            create: { number: section.number, name: section.name },
          }),
        ),
      );
    }

    const stored = await this.prisma.nomenclatureSection.findMany({
      select: { id: true, number: true },
    });
    const idByNumber = new Map(stored.map((row) => [row.number, row.id]));

    const withParent = parsed.sections.filter((section) => section.parentNumber !== '');

    for (const chunk of chunked(withParent, CHUNK)) {
      await this.prisma.$transaction(
        chunk.flatMap((section) => {
          const id = idByNumber.get(section.number);
          const parentId = idByNumber.get(section.parentNumber);
          if (!id || !parentId) return [];
          return [
            this.prisma.nomenclatureSection.update({
              where: { id },
              data: { parentId },
            }),
          ];
        }),
      );
    }

    return parsed.sections.length;
  }

  /** Виды и их связи с разделами. */
  private async upsertTypes(
    parsed: NomenclatureParseResult,
  ): Promise<{ typesUpserted: number; linksUpserted: number }> {
    if (parsed.types.length === 0) return { typesUpserted: 0, linksUpserted: 0 };

    for (const chunk of chunked(parsed.types, CHUNK)) {
      await this.prisma.$transaction(
        chunk.map((type) =>
          this.prisma.nomenclatureType.upsert({
            where: { code: type.code },
            update: { name: type.name, description: type.description || null },
            create: {
              code: type.code,
              name: type.name,
              description: type.description || null,
            },
          }),
        ),
      );
    }

    const [sections, types] = await Promise.all([
      this.prisma.nomenclatureSection.findMany({ select: { id: true, number: true } }),
      this.prisma.nomenclatureType.findMany({ select: { id: true, code: true } }),
    ]);

    const sectionIdByNumber = new Map(sections.map((row) => [row.number, row.id]));
    const typeIdByCode = new Map(types.map((row) => [row.code, row.id]));

    const links: { typeId: string; sectionId: string }[] = [];
    for (const type of parsed.types) {
      const typeId = typeIdByCode.get(type.code);
      if (!typeId) continue;
      for (const number of type.sectionNumbers) {
        const sectionId = sectionIdByNumber.get(number);
        if (sectionId) links.push({ typeId, sectionId });
      }
    }

    for (const chunk of chunked(links, CHUNK)) {
      await this.prisma.nomenclatureTypeSection.createMany({
        data: chunk,
        skipDuplicates: true,
      });
    }

    return { typesUpserted: parsed.types.length, linksUpserted: links.length };
  }

  /**
   * Расхождения источника попадают в журнал загрузок.
   *
   * Их десятки на каждую выгрузку, поэтому в sync_run_errors пишется сводка по
   * видам замечаний и ограниченное число примеров: иначе журнал заполнялся бы
   * повторяющимися записями об одном и том же системном дефекте.
   */
  private async recordIssues(runId: string, issues: NomenclatureIssue[]): Promise<void> {
    if (issues.length === 0) return;

    const byCode = new Map<string, NomenclatureIssue[]>();
    for (const issue of issues) {
      if (!byCode.has(issue.code)) byCode.set(issue.code, []);
      byCode.get(issue.code)!.push(issue);
    }

    const rows: { syncRunId: string; errorCode: string; message: string; externalRecordId: string | null }[] =
      [];

    for (const [code, list] of byCode) {
      rows.push({
        syncRunId: runId,
        errorCode: code,
        message: `Всего таких записей: ${list.length}. ${list[0]!.message}`,
        externalRecordId: list[0]!.reference ?? null,
      });

      for (const issue of list.slice(1, 5)) {
        rows.push({
          syncRunId: runId,
          errorCode: code,
          message: issue.message.slice(0, 1024),
          externalRecordId: issue.reference ?? null,
        });
      }
    }

    await this.prisma.syncRunError.createMany({ data: rows });
  }
}

function chunked<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}
