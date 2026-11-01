/**
 * Записи государственного реестра медицинских изделий в том виде, в каком их
 * отдаёт публичный API Росздравнадзора (ADR 0010).
 */

/** Организация в записи реестра: имя и адрес строкой, без кода страны. */
export interface RegistryParty {
  name: string;
  actualAddress: string | null;
}

export interface RegistryEntry {
  /** Идентификатор записи в реестре; ключ для повторной загрузки. */
  externalId: number;
  /** Регистрационный номер, например «ФС 022а1307/0383-04». */
  registrationNumber: string;
  name: string;
  /** Код статуса источника: active, suspended, cancelled, deadline_has_expired. */
  statusCode: string;
  statusName: string;
  /** RUSSIA или EAEU. */
  legalSystem: string | null;
  registrationDate: string | null;
  expiresAt: string | null;
  producer: RegistryParty | null;
  modelsDescription: string | null;
  frnsiId: string | null;
  /**
   * Ссылки реестра на виды номенклатуры — 19-значные идентификаторы вида
   * `3306965748378768392`. Это не коды классификатора из ADR 0009 (там
   * шестизначные числа), поэтому связать их без таблицы соответствия нельзя:
   * значения переносятся, но `products.nomenclature_type_id` не заполняют.
   */
  nomenclatureIds: string[];
}

export interface RegistryPage {
  entries: RegistryEntry[];
  /** Raw rows, including rejected entries. */
  rawCount: number;
  rejected: { index: number; message: string }[];
  page: number;
  totalElements: number;
  totalPages: number;
  last: boolean;
}
