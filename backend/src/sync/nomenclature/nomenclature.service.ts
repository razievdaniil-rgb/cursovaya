import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { Problems } from '../../common/problem';
import { PrismaService } from '../../prisma/prisma.service';
import type { NomenclatureQueryInput } from './nomenclature.schema';

/** Чтение номенклатурной классификации (ADR 0009). */
@Injectable()
export class NomenclatureService {
  constructor(private readonly prisma: PrismaService) {}

  /** Дерево разделов целиком: 591 узел, строится одним запросом. */
  async getSectionTree() {
    const sections = await this.prisma.nomenclatureSection.findMany({
      orderBy: { number: 'asc' },
      select: {
        id: true,
        number: true,
        name: true,
        parentId: true,
        _count: { select: { types: true } },
      },
    });

    interface Node {
      id: string;
      number: string;
      name: string;
      typeCount: number;
      children: Node[];
    }

    const nodes = new Map<string, Node>();
    for (const section of sections) {
      nodes.set(section.id, {
        id: section.id,
        number: section.number,
        name: section.name,
        typeCount: section._count.types,
        children: [],
      });
    }

    const roots: Node[] = [];
    for (const section of sections) {
      const node = nodes.get(section.id)!;
      const parent = section.parentId ? nodes.get(section.parentId) : undefined;
      if (parent) parent.children.push(node);
      else roots.push(node);
    }

    return { total: sections.length, roots };
  }

  async findTypes(query: NomenclatureQueryInput) {
    const conditions: Prisma.NomenclatureTypeWhereInput[] = [];

    if (query.search) {
      // Поиск по названию и описанию вида; код ищется отдельным условием,
      // потому что он числовой.
      const numericCode = Number.parseInt(query.search, 10);
      conditions.push({
        OR: [
          { name: { contains: query.search, mode: 'insensitive' } },
          { description: { contains: query.search, mode: 'insensitive' } },
          ...(Number.isSafeInteger(numericCode) ? [{ code: numericCode }] : []),
        ],
      });
    }

    if (query.sectionNumber) {
      // Раздел и все его дочерние: номера образуют префиксное дерево.
      conditions.push({
        sections: {
          some: {
            section: {
              OR: [
                { number: query.sectionNumber },
                { number: { startsWith: `${query.sectionNumber}.` } },
              ],
            },
          },
        },
      });
    }

    const where: Prisma.NomenclatureTypeWhereInput =
      conditions.length > 0 ? { AND: conditions } : {};

    const offset = (query.page - 1) * query.limit;

    const [types, total] = await Promise.all([
      this.prisma.nomenclatureType.findMany({
        where,
        orderBy: { code: 'asc' },
        skip: offset,
        take: query.limit,
        select: {
          id: true,
          code: true,
          name: true,
          description: true,
          sections: {
            select: { section: { select: { number: true, name: true } } },
          },
        },
      }),
      this.prisma.nomenclatureType.count({ where }),
    ]);

    return {
      data: types.map((type) => ({
        id: type.id,
        code: type.code,
        name: type.name,
        description: type.description,
        sections: type.sections.map((link) => link.section),
      })),
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.limit)),
      },
    };
  }

  /** Вид с полным путём разделов, восстановленным обходом дерева. */
  async findTypeByCode(code: number) {
    const type = await this.prisma.nomenclatureType.findUnique({
      where: { code },
      select: {
        id: true,
        code: true,
        name: true,
        description: true,
        sections: { select: { sectionId: true } },
      },
    });

    if (!type) throw Problems.notFound('Вид медицинского изделия');

    const paths = await Promise.all(
      type.sections.map((link) => this.buildPath(link.sectionId)),
    );

    return {
      id: type.id,
      code: type.code,
      name: type.name,
      description: type.description,
      // Полный путь не хранится: он выводится из дерева по parent_id.
      sectionPaths: paths,
    };
  }

  private async buildPath(sectionId: string) {
    const path: { number: string; name: string }[] = [];
    let currentId: string | null = sectionId;

    // Глубина дерева в данных — три уровня; ограничение страхует от цикла.
    for (let depth = 0; currentId !== null && depth < 16; depth += 1) {
      const section: { number: string; name: string; parentId: string | null } | null =
        await this.prisma.nomenclatureSection.findUnique({
          where: { id: currentId },
          select: { number: true, name: true, parentId: true },
        });
      if (!section) break;
      path.unshift({ number: section.number, name: section.name });
      currentId = section.parentId;
    }

    return path;
  }

  /** Сводка для раздела аналитики и журнала загрузок. */
  async getSummary() {
    const [types, sections, links, lastRun] = await Promise.all([
      this.prisma.nomenclatureType.count(),
      this.prisma.nomenclatureSection.count(),
      this.prisma.nomenclatureTypeSection.count(),
      this.prisma.syncRun.findFirst({
        where: { syncSource: { code: 'roszdravnadzor-nomenclature' } },
        orderBy: { startedAt: 'desc' },
        select: {
          id: true,
          startedAt: true,
          finishedAt: true,
          recordsRead: true,
          errorCount: true,
          status: { select: { code: true } },
        },
      }),
    ]);

    return {
      types,
      sections,
      typeSectionLinks: links,
      lastRun: lastRun
        ? {
            id: lastRun.id,
            status: lastRun.status.code,
            startedAt: lastRun.startedAt,
            finishedAt: lastRun.finishedAt,
            recordsRead: lastRun.recordsRead,
            errorCount: lastRun.errorCount,
          }
        : null,
    };
  }
}
