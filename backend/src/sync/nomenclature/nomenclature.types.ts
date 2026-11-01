/**
 * Модель данных номенклатурной классификации медицинских изделий по видам
 * (набор открытых данных Росздравнадзора № 36, см. ADR 0009).
 */

/** Раздел классификации: узел дерева. */
export interface NomenclatureSectionRecord {
  /** Иерархический номер: «12», «12.08», «12.08.05». */
  number: string;
  name: string;
  /** Номер родительского раздела; пустая строка — раздел верхнего уровня. */
  parentNumber: string;
}

/** Вид медицинского изделия. */
export interface NomenclatureTypeRecord {
  code: number;
  name: string;
  description: string;
  /**
   * Номера самых глубоких разделов, к которым отнесён вид.
   *
   * Один вид может входить в несколько разделов: в файле он тогда встречается
   * несколько раз с одинаковыми кодом и названием, но разными путями.
   */
  sectionNumbers: string[];
}

/** Расхождение между данными источника и его схемой. */
export interface NomenclatureIssue {
  code:
    | 'EMPTY_SECTION_NUMBER'
    | 'EMPTY_SECTION_NAME'
    | 'SECTION_NAME_LOOKS_LIKE_NUMBER'
    | 'CONFLICTING_SECTION_NAME'
    | 'CONFLICTING_SECTION_PARENT'
    | 'DUPLICATE_TYPE_NAME'
    | 'INVALID_CODE'
    | 'UNKNOWN_PARENT_SECTION';
  message: string;
  /** Код вида или номер раздела, к которому относится замечание. */
  reference?: string;
}

export interface NomenclatureParseResult {
  types: NomenclatureTypeRecord[];
  sections: NomenclatureSectionRecord[];
  issues: NomenclatureIssue[];
  /** Сколько элементов `classificator` прочитано, включая повторы кодов. */
  recordsRead: number;
}
