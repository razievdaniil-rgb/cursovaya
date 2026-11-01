import { Injectable } from '@nestjs/common';

import { Problems } from '../common/problem';
import { PrismaService } from '../prisma/prisma.service';
import { ProductsService } from '../products/products.service';
import type {
  CreateSavedListInput,
  UpdateSavedListInput,
} from './saved-lists.schema';

/**
 * Сохранённые списки изделий.
 *
 * Владелец списка — пользователь; `organization_id` делает список списком
 * организации. Доступ к чужому списку запрещён даже внутри одной
 * организации: списки персональные, а organization_id нужен кабинету
 * организации для агрегатов.
 */
@Injectable()
export class SavedListsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly products: ProductsService,
  ) {}

  async findMine(userId: string) {
    const lists = await this.prisma.savedList.findMany({
      where: { ownerUserId: userId },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        name: true,
        createdAt: true,
        updatedAt: true,
        organization: { select: { id: true, name: true, shortName: true } },
        _count: { select: { items: true } },
      },
    });

    return lists.map((list) => ({
      id: list.id,
      name: list.name,
      createdAt: list.createdAt,
      updatedAt: list.updatedAt,
      organization: list.organization,
      productCount: list._count.items,
    }));
  }

  async findOne(listId: string, userId: string) {
    const list = await this.loadOwned(listId, userId);

    const items = await this.prisma.savedListItem.findMany({
      where: { savedListId: listId },
      orderBy: { addedAt: 'asc' },
      select: { productId: true, addedAt: true },
    });

    // Карточки берутся из каталожного представления, чтобы в списке были
    // актуальные цена и рейтинг, а не снимок на момент добавления.
    const products = await Promise.all(
      items.map(async (item) => ({
        addedAt: item.addedAt,
        product: await this.products.findOne(item.productId),
      })),
    );

    return {
      id: list.id,
      name: list.name,
      createdAt: list.createdAt,
      updatedAt: list.updatedAt,
      organization: list.organization,
      items: products,
      productCount: products.length,
    };
  }

  async create(userId: string, input: CreateSavedListInput) {
    if (input.organizationId) {
      await this.assertMembership(userId, input.organizationId);
    }

    const list = await this.prisma.savedList.create({
      data: {
        ownerUserId: userId,
        organizationId: input.organizationId ?? null,
        name: input.name,
      },
      select: { id: true },
    });

    return this.findOne(list.id, userId);
  }

  async update(listId: string, userId: string, input: UpdateSavedListInput) {
    await this.loadOwned(listId, userId);

    if (input.organizationId) {
      await this.assertMembership(userId, input.organizationId);
    }

    await this.prisma.savedList.update({
      where: { id: listId },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.organizationId !== undefined
          ? { organizationId: input.organizationId }
          : {}),
      },
    });

    return this.findOne(listId, userId);
  }

  async remove(listId: string, userId: string): Promise<void> {
    await this.loadOwned(listId, userId);
    // Позиции списка удаляются каскадом (onDelete: Cascade).
    await this.prisma.savedList.delete({ where: { id: listId } });
  }

  async addProduct(listId: string, productId: string, userId: string) {
    await this.loadOwned(listId, userId);
    await this.assertProductExists(productId);

    const existing = await this.prisma.savedListItem.findUnique({
      where: { savedListId_productId: { savedListId: listId, productId } },
      select: { productId: true },
    });
    if (existing) throw Problems.alreadyInCollection('Изделие');

    await this.prisma.$transaction([
      this.prisma.savedListItem.create({ data: { savedListId: listId, productId } }),
      // updated_at списка отражает последнее изменение состава.
      this.prisma.savedList.update({
        where: { id: listId },
        data: { updatedAt: new Date() },
      }),
    ]);

    return this.findOne(listId, userId);
  }

  async removeProduct(listId: string, productId: string, userId: string) {
    await this.loadOwned(listId, userId);

    const existing = await this.prisma.savedListItem.findUnique({
      where: { savedListId_productId: { savedListId: listId, productId } },
      select: { productId: true },
    });
    if (!existing) throw Problems.notFound('Изделие в списке');

    await this.prisma.$transaction([
      this.prisma.savedListItem.delete({
        where: { savedListId_productId: { savedListId: listId, productId } },
      }),
      this.prisma.savedList.update({
        where: { id: listId },
        data: { updatedAt: new Date() },
      }),
    ]);

    return this.findOne(listId, userId);
  }

  private async loadOwned(listId: string, userId: string) {
    const list = await this.prisma.savedList.findUnique({
      where: { id: listId },
      select: {
        id: true,
        name: true,
        createdAt: true,
        updatedAt: true,
        ownerUserId: true,
        organization: { select: { id: true, name: true, shortName: true } },
      },
    });

    if (!list) throw Problems.notFound('Список');
    // Чужой список не отличается от несуществующего: иначе по коду ответа
    // можно было бы перебором узнать, какие списки существуют.
    if (list.ownerUserId !== userId) throw Problems.notFound('Список');

    return list;
  }

  private async assertMembership(userId: string, organizationId: string): Promise<void> {
    const membership = await this.prisma.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId, userId } },
      select: { organizationId: true },
    });
    if (!membership) throw Problems.notOrganizationMember();
  }

  private async assertProductExists(productId: string): Promise<void> {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { id: true },
    });
    if (!product) throw Problems.notFound('Изделие');
  }
}
