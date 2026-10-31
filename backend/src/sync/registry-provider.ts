/**
 * Точка расширения для интеграции с внешним реестром медицинских изделий.
 *
 * Реальной реализации нет и не будет до появления официальной документации и
 * доступа (ADR 0008). Любая реализация обязана честно сообщать о себе через
 * `describe()`: поле `isReal` доходит до API и до интерфейса, поэтому выдать
 * демонстрационные данные за государственный источник нельзя.
 */

export const REGISTRY_PROVIDER = Symbol('REGISTRY_PROVIDER');

/** Запись реестра в том виде, в каком её отдаёт источник. */
export interface RegistryRecord {
  /** Регистрационный номер — естественный ключ записи в реестре. */
  registrationNumber: string;
  /** Код статуса из registry_statuses. */
  statusCode: string;
  /** Дата, с которой статус действует. */
  effectiveAt: Date;
  comment?: string;
  /** Контрольная сумма полезной нагрузки, если источник её сообщает. */
  payloadChecksum?: string;
}

/** Запись, которую источник отдать не смог. */
export interface RegistryRecordError {
  externalRecordId?: string;
  errorCode: string;
  message: string;
  payloadChecksum?: string;
}

export interface RegistryFetchResult {
  records: RegistryRecord[];
  errors: RegistryRecordError[];
  /** Сколько записей источник просмотрел, включая неизменившиеся. */
  recordsRead: number;
}

export interface RegistrySourceDescription {
  /** Код строки в sync_sources. */
  code: string;
  name: string;
  /** Базовый URL источника; у демонстрационного источника его нет. */
  baseUrl: string | null;
  /**
   * Подключён ли настоящий внешний реестр.
   *
   * Значение доходит до `GET /government/sync` и до ответа на запуск
   * загрузки. У mock-реализации всегда false.
   */
  isReal: boolean;
}

export interface RegistryProvider {
  describe(): RegistrySourceDescription;

  /**
   * Выборка записей реестра.
   *
   * `scenario` позволяет вызывающей стороне явно запросить сценарий с
   * ошибками — это нужно журналу загрузок, где интерфейс показывает
   * состояния success, partial и failed.
   */
  fetchRecords(scenario?: RegistryFetchScenario): Promise<RegistryFetchResult>;
}

export type RegistryFetchScenario = 'success' | 'partial' | 'failed';
