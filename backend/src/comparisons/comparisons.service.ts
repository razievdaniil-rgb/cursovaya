import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { Problems } from '../common/problem';
import { PrismaService } from '../prisma/prisma.service';
import { ProductsService } from '../products/products.service';
import type {
  CreateComparisonInput,
  UpdateComparisonInput,
} from './comparisons.schema';

/** Ограничение интерфейса сравнения; на уровне БД его держит CHECK на position. */
export const MAX_COMPARISON_ITEMS = 3;

/**
 * Сравнение изделий.
 *
 * Максимум три позиции обеспечивается тремя независимыми механизмами:
 *   1. CHECK (position BETWEEN 1 AND 3) в миграции 0002;
 *   2. UNIQUE (comparison_id, position) — четвёртая позиция не найдёт номер;
 *   3. транзакция ниже с блокировкой строки сравнения (SELECT ... FOR UPDATE),
 *      которая не даёт двум одновременным запросам занять один номер.
 *
 * Без блокировки оба конкурентных запроса прочитали бы одинаковый набор
 * занятых позиций, выбрали бы один и тот же свободный номер, и один из них
 * упал бы на UNIQUE уже после проверки — с 500 вместо понятного ответа.
 */
@Injectable()
export class ComparisonsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly products: ProductsService,
  ) {}

  async findMine(userId: string) {
    const comparisons = await this.prisma.comparison.findMany({
      where: { ownerUserId: userId },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        name: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { items: true } },
      },
    });

    return comparisons.map((comparison) => ({
      id: comparison.id,
      name: comparison.name,
      createdAt: comparison.createdAt,
      updatedAt: comparison.updatedAt,
      productCount: comparison._count.items,
      maxProducts: MAX_COMPARISON_ITEMS,
    }));
  }

  async findOne(comparisonId: string, userId: string) {
    const comparison = await this.loadOwned(comparisonId, userId);

    const items = await this.prisma.comparisonItem.findMany({
      where: { comparisonId },
      orderBy: { position: 'asc' },
      select: { productId: true, position: true, addedAt: true },
    });

    const products = await Promise.all(
      items.map(async (item) => ({
        position: item.position,
        addedAt: item.addedAt,
        product: await this.products.findOne(item.productId),
      })),
    );

    return {
      id: comparison.id,
      name: comparison.name,
      createdAt: comparison.createdAt,
      updatedAt: comparison.updatedAt,
      maxProducts: MAX_COMPARISON_ITEMS,
      items: products,
      productCount: products.length,
      // Характеристики, по которым изделия можно сопоставить построчно.
      comparableCharacteristics: this.buildComparisonMatrix(products),
    };
  }

  /**
   * Матрица сравнения: по строке на характеристику, помеченную
   * is_comparable, со значением каждого изделия. Строится из нормализованных
   * значений, а не из совпадения ключей JSON.
   */
  private buildComparisonMatrix(
    items: { position: number; product: Awaited<ReturnType<ProductsService['findOne']>> }[],
  ) {
    const definitions = new Map<
      string,
      { code: string; name: string; unit: unknown; sortOrder: number }
    >();

    for (const item of items) {
      for (const characteristic of item.product.characteristics) {
        if (!characteristic.isComparable) continue;
        if (!definitions.has(characteristic.code)) {
          definitions.set(characteristic.code, {
            code: characteristic.code,
            name: characteristic.name,
            unit: characteristic.unit,
            sortOrder: characteristic.sortOrder,
          });
        }
      }
    }

    return [...definitions.values()]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((definition) => ({
        code: definition.code,
        name: definition.name,
        unit: definition.unit,
        values: items.map((item) => {
          const found = item.product.characteristics.find(
            (characteristic) => characteristic.code === definition.code,
          );
          return {
            productId: item.product.id,
            position: item.position,
            // null означает «характеристика у изделия не заполнена».
            value: found?.value ?? null,
          };
        }),
      }));
  }

  async create(userId: string, input: CreateComparisonInput) {
    const comparison = await this.prisma.comparison.create({
      data: { ownerUserId: userId, name: input.name ?? null },
      select: { id: true },
    });

    return this.findOne(comparison.id, userId);
  }

  async update(comparisonId: string, userId: string, input: UpdateComparisonInput) {
    await this.loadOwned(comparisonId, userId);

    await this.prisma.comparison.update({
      where: { id: comparisonId },
      data: { ...(input.name !== undefined ? { name: input.name } : {}) },
    });

    return this.findOne(comparisonId, userId);
  }

  async remove(comparisonId: string, userId: string): Promise<void> {
    await this.loadOwned(comparisonId, userId);
    await this.prisma.comparison.delete({ where: { id: comparisonId } });
  }

  async addProduct(comparisonId: string, productId: string, userId: string) {
    await this.loadOwned(comparisonId, userId);
    await this.assertProductExists(productId);

    await this.prisma.$transaction(async (tx) => {
      // Блокировка строки сравнения: конкурентные добавления в одно и то же
      // сравнение сериализуются здесь.
      await tx.$queryRaw`
        SELECT id FROM comparisons WHERE id = ${comparisonId}::uuid FOR UPDATE
      `;

      const existing = await tx.comparisonItem.findUnique({
        where: { comparisonId_productId: { comparisonId, productId } },
        select: { productId: true },
      });
      if (existing) throw Problems.alreadyInCollection('Изделие');

      const occupied = await tx.comparisonItem.findMany({
        where: { comparisonId },
        select: { position: true },
      });

      if (occupied.length >= MAX_COMPARISON_ITEMS) {
        throw Problems.comparisonFull(MAX_COMPARISON_ITEMS);
      }

      const taken = new Set(occupied.map((item) => item.position));
      const position = [1, 2, 3].find((candidate) => !taken.has(candidate));
      if (position === undefined) {
        throw Problems.comparisonFull(MAX_COMPARISON_ITEMS);
      }

      await tx.comparisonItem.create({
        data: { comparisonId, productId, position },
      });

      await tx.comparison.update({
        where: { id: comparisonId },
        data: { updatedAt: new Date() },
      });
    });

    return this.findOne(comparisonId, userId);
  }

  async removeProduct(comparisonId: string, productId: string, userId: string) {
    await this.loadOwned(comparisonId, userId);

    const existing = await this.prisma.comparisonItem.findUnique({
      where: { comparisonId_productId: { comparisonId, productId } },
      select: { productId: true },
    });
    if (!existing) throw Problems.notFound('Изделие в сравнении');

    await this.prisma.$transaction([
      this.prisma.comparisonItem.delete({
        where: { comparisonId_productId: { comparisonId, productId } },
      }),
      this.prisma.comparison.update({
        where: { id: comparisonId },
        data: { updatedAt: new Date() },
      }),
    ]);

    return this.findOne(comparisonId, userId);
  }

  private async loadOwned(comparisonId: string, userId: string) {
    const comparison = await this.prisma.comparison.findUnique({
      where: { id: comparisonId },
      select: {
        id: true,
        name: true,
        createdAt: true,
        updatedAt: true,
        ownerUserId: true,
      },
    });

    if (!comparison) throw Problems.notFound('Сравнение');
    if (comparison.ownerUserId !== userId) throw Problems.notFound('Сравнение');

    return comparison;
  }

  private async assertProductExists(productId: string): Promise<void> {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { id: true },
    });
    if (!product) throw Problems.notFound('Изделие');
  }
}

/** Экспортируется для тестов, которым нужен тип клиента транзакции. */
export type ComparisonTransaction = Prisma.TransactionClient;
