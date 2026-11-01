import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readFile } from 'node:fs/promises';
import { z } from 'zod';

import type { RegistryEntry, RegistryPage } from './registry.types';

/**
 * Государственный реестр медицинских изделий — настоящий источник (ADR 0010).
 *
 * Публичный REST API виджета Росздравнадзора: авторизация не нужна,
 * пагинация Spring Data (`content`, `totalElements`, `totalPages`).
 *
 * Хост отдаёт сертификат национального УЦ Минцифры, которого нет в наборе
 * доверенных корней Node. Поэтому процессу нужно передать
 * `NODE_EXTRA_CA_CERTS=certs/russian-trusted-ca.pem` — это добавляет корень к
 * доверенным, а не отключает проверку. Без него загрузка падает, и провайдер
 * сообщает об этом понятным сообщением, а не «fetch failed».
 */

const DEFAULT_BASE_URL = 'https://elk.roszdravnadzor.gov.ru';
const FILTER_PATH =
  '/public-gateway/registered-med-product/api/v1/med-product/filter-public';

/** Источник отдаёт до 1000 записей за запрос. */
const MAX_PAGE_SIZE = 1000;

/**
 * Сколько раз запрашивать страницу, прежде чем считать загрузку сорванной.
 *
 * Полный обход реестра идёт около двадцати минут, и за это время случаются
 * минутные провалы связи: первая версия с четырьмя попытками (26 секунд
 * терпения) на таком провале теряла загрузку целиком на 102-й странице из
 * 164. Шесть попыток с ограничением паузы сверху дают около двух с половиной
 * минут — соразмерно длительности обхода.
 */
const RETRY_ATTEMPTS = 6;
const RETRY_BASE_DELAY_MS = 2000;
const RETRY_FACTOR = 3;
const RETRY_MAX_DELAY_MS = 60_000;


const sourceDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(
  (value) => {
    const date = new Date(value);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
  },
  'Invalid calendar date',
).nullish();
const partySchema = z.object({
  name: z.string().trim().max(512).nullish(),
  actualAddress: z.string().trim().max(1024).nullish(),
});
const entrySchema = z.object({
  id: z.number().int().positive().max(2147483647),
  noRu: z.string().trim().min(1).max(64),
  name: z.string().nullish(),
  status: z.object({ code: z.string().trim().min(1), name: z.string().nullish() }),
  legalSystem: z.string().max(16).nullish(),
  dateRegistrationRu: sourceDate,
  dateRu: sourceDate,
  endDateRu: sourceDate,
  producer: partySchema.nullish(),
  modelsDescription: z.string().nullish(),
  frnsiId: z.string().trim().max(64).nullish(),
  nomClassifierMedicalRfIds: z.array(z.string()).nullish(),
});
const pageSchema = z.object({
  content: z.array(z.unknown()),
  totalElements: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
  last: z.boolean(),
  number: z.number().int().nonnegative(),
});
type ApiEntry = z.infer<typeof entrySchema>;

export interface RegistrySourceDescription {
  code: string;
  name: string;
  baseUrl: string;
  /** Подключён ли настоящий внешний источник. Здесь — да. */
  isReal: boolean;
}

@Injectable()
export class RoszdravnadzorRegistryProvider {
  static readonly CODE = 'roszdravnadzor-registry';

  private readonly logger = new Logger(RoszdravnadzorRegistryProvider.name);

  constructor(private readonly config: ConfigService) {}

  describe(): RegistrySourceDescription {
    return {
      code: RoszdravnadzorRegistryProvider.CODE,
      name: 'Государственный реестр медицинских изделий (Росздравнадзор)',
      baseUrl: this.baseUrl(),
      isReal: true,
    };
  }

  private baseUrl(): string {
    return (
      this.config.get<string>('REGISTRY_SOURCE_URL') ?? DEFAULT_BASE_URL
    ).replace(/\/+$/, '');
  }

  /** Локальный файл со страницей ответа: используется тестами. */
  private localPath(): string | undefined {
    return this.config.get<string>('REGISTRY_LOCAL_FILE');
  }

  /**
   * Одна страница реестра.
   *
   * Полный обход — это 164 запроса подряд, и источник периодически рвёт
   * соединение на середине («other side closed»). Один такой разрыв не должен
   * обесценивать уже загруженные десятки тысяч записей, поэтому страница
   * запрашивается повторно с возрастающей паузой.
   */
  async fetchPage(page: number, size = 200, attempts = RETRY_ATTEMPTS): Promise<RegistryPage> {
    if (!Number.isInteger(page) || page < 0 || !Number.isInteger(size) || size <= 0 ||
        !Number.isInteger(attempts) || attempts <= 0) throw new RangeError('Invalid registry page options');
    const local = this.localPath();

    if (local) {
      const raw: unknown = JSON.parse(await readFile(local, 'utf8'));
      return this.toPage(raw, page);
    }

    const pageSize = Math.min(size, MAX_PAGE_SIZE);
    const url = `${this.baseUrl()}${FILTER_PATH}?page=${page}&size=${pageSize}`;

    let lastError = '';

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      let response: Response;
      const controller = new AbortController();
      // Includes response body consumption, not just receipt of headers.
      const timeout = setTimeout(() => controller.abort(), 30_000);
      try {
        response = await fetch(url, {
          signal: controller.signal,
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          // Пустой фильтр означает «весь реестр».
          body: '{}',
        });
        if (response.ok) {
          const raw: unknown = await response.json();
          return this.toPage(raw, page);
        }
        await response.body?.cancel();
      } catch (error) {
        if (error instanceof z.ZodError || error instanceof RegistryPageError) throw error;
        lastError = this.explainNetworkError(error);
        // Недоверие к сертификату повтором не лечится: вторая попытка даст
        // ту же ошибку, а оператор ждёт сообщения, а не задержки.
        if (this.isCertificateProblem(error)) throw new Error(lastError);
        if (attempt === attempts) break;
        clearTimeout(timeout);
        await this.pauseBeforeRetry(page, attempt, attempts, lastError);
        continue;
      } finally {
        clearTimeout(timeout);
      }

      lastError = `Реестр ответил ${response.status} на ${FILTER_PATH} (страница ${page})`;
      // 4xx — это ответ по существу: повтор даст то же самое.
      if (response.status < 500 || attempt === attempts) break;
      await this.pauseBeforeRetry(page, attempt, attempts, lastError);
    }

    throw new Error(lastError);
  }

  private async pauseBeforeRetry(
    page: number,
    attempt: number,
    attempts: number,
    reason: string,
  ): Promise<void> {
    const delay = Math.min(
      RETRY_BASE_DELAY_MS * RETRY_FACTOR ** (attempt - 1),
      RETRY_MAX_DELAY_MS,
    );
    this.logger.warn(
      `Страница ${page}: попытка ${attempt} из ${attempts} не удалась ` +
        `(${reason}). Повтор через ${Math.round(delay / 1000)} с`,
    );
    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  /** Сообщение ошибки вместе с её cause: причина часто лежит именно там. */
  private describeError(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error);
    const cause =
      error instanceof Error && error.cause instanceof Error ? error.cause.message : '';

    return `${message} ${cause}`;
  }

  private isCertificateProblem(error: unknown): boolean {
    return /certificate|CERT|SELF_SIGNED|unable to (get|verify)/i.test(
      this.describeError(error),
    );
  }

  /**
   * Ошибка доверия к сертификату выглядит как обычный сбой fetch, поэтому
   * причина поясняется явно: иначе в журнале остаётся «fetch failed».
   */
  private explainNetworkError(error: unknown): string {
    const combined = this.describeError(error);

    if (this.isCertificateProblem(error)) {
      return (
        'Сертификат elk.roszdravnadzor.gov.ru выдан национальным УЦ Минцифры, ' +
        'которому процесс не доверяет. Запустите API с ' +
        'NODE_EXTRA_CA_CERTS=certs/russian-trusted-ca.pem — это добавит корень ' +
        `к доверенным, не отключая проверку. Исходная ошибка: ${combined.trim()}`
      );
    }

    return `Не удалось обратиться к реестру: ${combined.trim()}`;
  }


  private toPage(raw: unknown, requestedPage: number): RegistryPage {
    const page = pageSchema.parse(raw);
    if (
      page.number !== requestedPage ||
      (page.totalPages === 0
        ? page.number !== 0 || !page.last || page.totalElements !== 0 || page.content.length !== 0
        : page.number >= page.totalPages || page.last !== (page.number === page.totalPages - 1)) ||
      page.content.length > page.totalElements ||
      (!page.last && page.content.length === 0)
    ) throw new RegistryPageError('Inconsistent registry pagination');
    const entries: RegistryEntry[] = [];
    const rejected: RegistryPage['rejected'] = [];
    for (const [index, item] of page.content.entries()) {
      const parsed = entrySchema.safeParse(item);
      if (!parsed.success) {
        rejected.push({
          index,
          message: parsed.error.issues.map((issue) => issue.path.join('.') + ': ' + issue.message).join('; ').slice(0, 1024),
        });
      } else {
        entries.push(this.toEntry(parsed.data));
      }
    }
    return {
      entries, rejected, rawCount: page.content.length,
      page: page.number, totalElements: page.totalElements,
      totalPages: page.totalPages, last: page.last,
    };
  }

  /** A validated source entry; rejected rows are accounted for separately. */
  private toEntry(item: ApiEntry): RegistryEntry {
    const registrationNumber = (item.noRu ?? '').trim();

    const producerName = (item.producer?.name ?? '').trim();

    return {
      externalId: item.id,
      registrationNumber,
      name: (item.name ?? '').trim() || registrationNumber,
      statusCode: (item.status?.code ?? '').trim(),
      statusName: (item.status?.name ?? '').trim(),
      legalSystem: item.legalSystem ?? null,
      // В проверенных выборках dateRegistrationRu заполнен всегда, но он
      // продублирован полем dateRu, поэтому запасной вариант оставлен.
      registrationDate: item.dateRegistrationRu ?? item.dateRu ?? null,
      expiresAt: item.endDateRu ?? null,
      producer: producerName
        ? {
            name: producerName,
            actualAddress: (item.producer?.actualAddress ?? '').trim() || null,
          }
        : null,
      modelsDescription: (item.modelsDescription ?? '').trim() || null,
      frnsiId: (item.frnsiId ?? '').trim() || null,
      nomenclatureIds: item.nomClassifierMedicalRfIds ?? [],
    };
  }

  /** Полный обход реестра постранично. */
  async *iterate(pageSize = 500, maxPages?: number): AsyncGenerator<RegistryPage> {
    if (maxPages !== undefined && (!Number.isInteger(maxPages) || maxPages <= 0)) {
      throw new RangeError('maxPages must be a positive integer');
    }
    let page = 0;

    for (;;) {
      const result = await this.fetchPage(page, pageSize);
      yield result;

      if (result.last) return;
      page += 1;
      if (maxPages !== undefined && page >= maxPages) {
        this.logger.log(`Остановка на странице ${page}: задан предел maxPages`);
        return;
      }
    }
  }
}

class RegistryPageError extends Error {}
