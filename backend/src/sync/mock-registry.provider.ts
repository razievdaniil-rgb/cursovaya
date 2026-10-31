import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import type {
  RegistryFetchResult,
  RegistryFetchScenario,
  RegistryProvider,
  RegistrySourceDescription,
} from './registry-provider';

/**
 * Демонстрационная реализация RegistryProvider.
 *
 * Данные не выдумываются и не имитируют формат чужого API: провайдер читает
 * изделия из собственной базы и возвращает их текущие статусы. Это даёт
 * журналу загрузок правдоподобные цифры, не утверждая, что где-то есть
 * внешний источник (ADR 0008).
 *
 * `isReal: false` — единственно возможное значение для этого класса.
 */
@Injectable()
export class MockRegistryProvider implements RegistryProvider {
  static readonly CODE = 'mock-registry';

  constructor(private readonly prisma: PrismaService) {}

  describe(): RegistrySourceDescription {
    return {
      code: MockRegistryProvider.CODE,
      name: 'Демонстрационный источник (MockRegistryProvider)',
      // URL нет: обращаться никуда не нужно и не к чему.
      baseUrl: null,
      isReal: false,
    };
  }

  async fetchRecords(
    scenario: RegistryFetchScenario = 'success',
  ): Promise<RegistryFetchResult> {
    if (scenario === 'failed') {
      return {
        records: [],
        recordsRead: 0,
        errors: [
          {
            errorCode: 'SOURCE_UNAVAILABLE',
            message: 'Демонстрационный источник недоступен',
          },
        ],
      };
    }

    const products = await this.prisma.product.findMany({
      orderBy: { registrationNumber: 'asc' },
      select: {
        registrationNumber: true,
        currentRegistryStatus: { select: { code: true } },
        registrationExpiresAt: true,
      },
    });

    const now = new Date();
    const records = products.map((product) => ({
      registrationNumber: product.registrationNumber,
      // Единственное «вычисление» источника: истёкший срок регистрации
      // переводит запись в статус expired. Это проверяемое правило, а не
      // выдуманные данные.
      statusCode:
        product.registrationExpiresAt !== null &&
        product.registrationExpiresAt.getTime() < now.getTime()
          ? 'expired'
          : product.currentRegistryStatus.code,
      effectiveAt: now,
      comment: 'Загрузка из демонстрационного источника',
    }));

    if (scenario === 'partial') {
      // Одна запись намеренно не обрабатывается, чтобы в журнале было
      // состояние «частично».
      const skipped = records.pop();
      return {
        records,
        recordsRead: products.length,
        errors: [
          {
            externalRecordId: skipped?.registrationNumber,
            errorCode: 'CHECKSUM_MISMATCH',
            message: 'Контрольная сумма записи не совпала с ожидаемой',
          },
        ],
      };
    }

    return { records, recordsRead: products.length, errors: [] };
  }
}
