import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createReadStream } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { promisify } from 'node:util';
import yauzl from 'yauzl';

import { parseNomenclatureXml } from './nomenclature-xml.parser';
import type { NomenclatureParseResult } from './nomenclature.types';

/**
 * Реальный источник: набор открытых данных Росздравнадзора № 36
 * «Номенклатурная классификация медицинских изделий по видам» (ADR 0009).
 *
 * REST API у Росздравнадзора нет — набор публикуется ZIP-архивом с XML внутри,
 * поэтому «интеграция» здесь означает загрузку и разбор официальной выгрузки,
 * а не вызовы HTTP-методов.
 *
 * Адрес и имя файла берутся из окружения: схема именования
 * `data-ГГГГММДД-structure-20180615.zip` официально не описана и выведена из
 * перечня версий на странице набора.
 */

const DEFAULT_BASE_URL =
  'https://roszdravnadzor.gov.ru/opendata/7710537160-mi_types';

/** Распакованный XML около 52 МБ; предел защищает от подмены файла. */
const MAX_UNCOMPRESSED_BYTES = 512 * 1024 * 1024;
const MAX_ARCHIVE_BYTES = 64 * 1024 * 1024;

export interface NomenclatureSourceDescription {
  code: string;
  name: string;
  baseUrl: string;
  /** Подключён ли настоящий внешний источник. Здесь — да. */
  isReal: boolean;
}

@Injectable()
export class RoszdravnadzorNomenclatureProvider {
  static readonly CODE = 'roszdravnadzor-nomenclature';

  private readonly logger = new Logger(RoszdravnadzorNomenclatureProvider.name);

  constructor(private readonly config: ConfigService) {}

  describe(): NomenclatureSourceDescription {
    return {
      code: RoszdravnadzorNomenclatureProvider.CODE,
      name: 'Номенклатурная классификация медицинских изделий по видам (Росздравнадзор, открытые данные)',
      baseUrl: this.baseUrl(),
      // В отличие от MockRegistryProvider, этот источник настоящий.
      isReal: true,
    };
  }

  private baseUrl(): string {
    return (
      this.config.get<string>('NOMENCLATURE_SOURCE_URL') ?? DEFAULT_BASE_URL
    ).replace(/\/+$/, '');
  }

  /**
   * Имя файла выгрузки.
   *
   * По умолчанию берётся первое число текущего месяца — так устроены имена
   * версий на странице набора. Переменная NOMENCLATURE_FILE_NAME позволяет
   * указать конкретную версию, не меняя код.
   */
  fileName(now = new Date()): string {
    const configured = this.config.get<string>('NOMENCLATURE_FILE_NAME');
    if (configured) return configured;

    const year = now.getUTCFullYear();
    const month = String(now.getUTCMonth() + 1).padStart(2, '0');
    return `data-${year}${month}01-structure-20180615.zip`;
  }

  /** Локальный файл вместо сети: используется тестами и разбором выгрузки вручную. */
  private localPath(): string | undefined {
    return this.config.get<string>('NOMENCLATURE_LOCAL_FILE');
  }

  async fetchNomenclature(): Promise<NomenclatureParseResult> {
    const local = this.localPath();

    if (local) {
      this.logger.log(`Номенклатура читается из локального файла ${local}`);
      return local.endsWith('.zip')
        ? this.parseArchive(local)
        : parseNomenclatureXml(createReadStream(local));
    }

    const url = `${this.baseUrl()}/${this.fileName()}`;
    this.logger.log(`Загрузка номенклатуры: ${url}`);

    const response = await fetch(url, {
      headers: { Accept: 'application/zip' },
      redirect: 'follow',
      signal: AbortSignal.timeout(60_000),
    });

    if (!response.ok) {
      throw new Error(
        `Источник ответил ${response.status} на ${url}. ` +
          'Возможно, изменилось имя файла выгрузки — задайте NOMENCLATURE_FILE_NAME.',
      );
    }

    if (!response.body) throw new Error('Источник вернул пустой ответ');
    const chunks: Buffer[] = [];
    const reader = response.body.getReader();
    let bytes = 0;
    try {
      for (;;) {
        const chunk = await reader.read();
        if (chunk.done) break;
        bytes += chunk.value.byteLength;
        if (bytes > MAX_ARCHIVE_BYTES) {
          await reader.cancel();
          throw new Error('Архив больше допустимого: загрузка прервана');
        }
        chunks.push(Buffer.from(chunk.value));
      }
    } finally { reader.releaseLock(); }
    const buffer = Buffer.concat(chunks, bytes);

    // yauzl работает с файлом, поэтому архив кладётся во временный каталог и
    // удаляется после разбора.
    const directory = await mkdtemp(join(tmpdir(), 'nomenclature-'));
    const archivePath = join(directory, 'data.zip');

    try {
      await writeFile(archivePath, buffer);
      return await this.parseArchive(archivePath);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }

  /** Разбор первого XML внутри архива потоком. */
  private async parseArchive(archivePath: string): Promise<NomenclatureParseResult> {
    const open = promisify(yauzl.open) as unknown as (
      path: string,
      options: yauzl.Options,
    ) => Promise<yauzl.ZipFile>;

    const zip = await open(archivePath, { lazyEntries: true });

    try {
    const entryStream = await new Promise<Readable>((resolve, reject) => {
      let settled = false;

      zip.on('entry', (entry: yauzl.Entry) => {
        if (settled) return;

        if (!entry.fileName.toLowerCase().endsWith('.xml')) {
          zip.readEntry();
          return;
        }

        if (entry.uncompressedSize > MAX_UNCOMPRESSED_BYTES) {
          settled = true;
          reject(
            new Error(
              `Распакованный файл больше допустимого (${entry.uncompressedSize} байт)`,
            ),
          );
          return;
        }

        zip.openReadStream(entry, (error, stream) => {
          if (settled) return;
          settled = true;
          if (error || !stream) {
            reject(error ?? new Error('Не удалось открыть поток записи архива'));
            return;
          }
          resolve(stream);
        });
      });

      zip.on('end', () => {
        if (settled) return;
        settled = true;
        reject(new Error('В архиве нет XML-файла'));
      });

      zip.on('error', (error: Error) => {
        if (settled) return;
        settled = true;
        reject(error);
      });

      zip.readEntry();
    });

      return await parseNomenclatureXml(entryStream);
    } finally {
      zip.close();
    }
  }
}
