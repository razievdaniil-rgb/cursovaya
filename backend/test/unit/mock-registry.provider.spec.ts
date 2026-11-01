/**
 * Unit-тесты демонстрационного провайдера реестра.
 *
 * Главное проверяемое свойство — провайдер не выдаёт себя за реальный
 * источник (ADR 0008). Prisma подменяется заглушкой: база не нужна.
 */

import { describe, expect, it } from 'vitest';

import { MockRegistryProvider } from '../../src/sync/mock-registry.provider';
import type { PrismaService } from '../../src/prisma/prisma.service';

interface StubProduct {
  registrationNumber: string;
  currentRegistryStatus: { code: string };
  registrationExpiresAt: Date | null;
}

function providerWith(products: StubProduct[]): MockRegistryProvider {
  const prisma = {
    product: { findMany: async () => products },
  } as unknown as PrismaService;

  return new MockRegistryProvider(prisma);
}

const future = new Date(Date.now() + 1000 * 60 * 60 * 24 * 365);
const past = new Date(Date.now() - 1000 * 60 * 60 * 24);

describe('MockRegistryProvider', () => {
  it('описывает себя как демонстрационный источник', () => {
    const description = providerWith([]).describe();

    expect(description.isReal).toBe(false);
    expect(description.code).toBe('mock-registry');
    // Адреса внешнего источника нет: обращаться некуда.
    expect(description.baseUrl).toBeNull();
  });

  it('возвращает текущие статусы изделий', async () => {
    const provider = providerWith([
      {
        registrationNumber: 'РЗН 2024/00001',
        currentRegistryStatus: { code: 'active' },
        registrationExpiresAt: future,
      },
      {
        registrationNumber: 'РЗН 2024/00002',
        currentRegistryStatus: { code: 'changed' },
        registrationExpiresAt: future,
      },
    ]);

    const result = await provider.fetchRecords('success');

    expect(result.recordsRead).toBe(2);
    expect(result.errors).toEqual([]);
    expect(result.records.map((record) => record.statusCode)).toEqual(['active', 'changed']);
  });

  it('переводит изделие с истёкшим сроком в expired', async () => {
    const provider = providerWith([
      {
        registrationNumber: 'РЗН 2020/00003',
        currentRegistryStatus: { code: 'active' },
        registrationExpiresAt: past,
      },
    ]);

    const result = await provider.fetchRecords('success');

    // Единственное правило, которое провайдер применяет сам.
    expect(result.records[0]?.statusCode).toBe('expired');
  });

  it('сценарий partial пропускает одну запись и сообщает об ошибке', async () => {
    const provider = providerWith([
      {
        registrationNumber: 'РЗН 2024/00001',
        currentRegistryStatus: { code: 'active' },
        registrationExpiresAt: future,
      },
      {
        registrationNumber: 'РЗН 2024/00002',
        currentRegistryStatus: { code: 'active' },
        registrationExpiresAt: future,
      },
    ]);

    const result = await provider.fetchRecords('partial');

    expect(result.recordsRead).toBe(2);
    expect(result.records).toHaveLength(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.errorCode).toBe('CHECKSUM_MISMATCH');
    expect(result.errors[0]?.externalRecordId).toBe('РЗН 2024/00002');
  });

  it('сценарий failed не возвращает записей', async () => {
    const provider = providerWith([
      {
        registrationNumber: 'РЗН 2024/00001',
        currentRegistryStatus: { code: 'active' },
        registrationExpiresAt: future,
      },
    ]);

    const result = await provider.fetchRecords('failed');

    expect(result.records).toEqual([]);
    expect(result.recordsRead).toBe(0);
    expect(result.errors[0]?.errorCode).toBe('SOURCE_UNAVAILABLE');
  });

  it('по умолчанию работает по успешному сценарию', async () => {
    const provider = providerWith([
      {
        registrationNumber: 'РЗН 2024/00001',
        currentRegistryStatus: { code: 'active' },
        registrationExpiresAt: future,
      },
    ]);

    const result = await provider.fetchRecords();
    expect(result.errors).toEqual([]);
  });
});
