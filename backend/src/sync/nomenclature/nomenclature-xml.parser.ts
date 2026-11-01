import { SaxesParser } from 'saxes';
import type { Readable } from 'node:stream';
import { StringDecoder } from 'node:string_decoder';

import type {
  NomenclatureIssue,
  NomenclatureParseResult,
  NomenclatureSectionRecord,
  NomenclatureTypeRecord,
} from './nomenclature.types';

/**
 * Потоковый разбор номенклатурной классификации.
 *
 * Распакованный файл весит около 52 МБ, поэтому документ не загружается в
 * память целиком. Разбор по строкам не подходит: в данных есть многострочные
 * значения `name` и `description`, и текст тега приходит несколькими частями.
 *
 * Расхождения источника с его же схемой не прерывают разбор, а собираются в
 * `issues` — вызывающая сторона пишет их в журнал загрузок (ADR 0009).
 */

/** Ограничения, выведенные из фактических данных, с запасом. */
const MAX_TYPE_NAME = 512;
const MAX_DESCRIPTION = 4096;
const MAX_SECTION_NUMBER = 32;
const MAX_SECTION_NAME = 512;

const LOOKS_LIKE_NUMBER = /^[\d.]+$/;

interface SectionDraft {
  number: string;
  name: string;
  parentNumber: string;
}

export async function parseNomenclatureXml(
  input: Readable,
): Promise<NomenclatureParseResult> {
  const parser = new SaxesParser({ fragment: false });

  const issues: NomenclatureIssue[] = [];
  const addIssue = (issue: NomenclatureIssue) => {
    // Журнал не должен раздуваться из-за одного системного дефекта данных.
    if (issues.length < 500) issues.push(issue);
  };

  /** Виды по коду: код определяет название, поэтому повторы объединяются. */
  const typesByCode = new Map<number, NomenclatureTypeRecord>();
  /** Разделы по номеру. */
  const sectionsByNumber = new Map<string, SectionDraft>();

  let recordsRead = 0;

  // Состояние текущей записи.
  let code: number | null = null;
  let rawCode = '';
  let name = '';
  let description = '';
  let sectionNumber = '';
  let sectionName = '';
  let parentNumber = '';
  let pathSections: SectionDraft[] = [];

  // Какой текстовый узел сейчас наполняется.
  let current: 'code' | 'name' | 'description' | 'section_number' | 'section_name' | 'parent_number' | null =
    null;
  let insideSection = false;

  const resetRecord = () => {
    code = null;
    rawCode = '';
    name = '';
    description = '';
    pathSections = [];
  };

  parser.on('opentag', (tag) => {
    switch (tag.name) {
      case 'classificator':
        resetRecord();
        break;
      case 'code':
      case 'name':
      case 'description':
        current = tag.name;
        break;
      case 'section':
        insideSection = true;
        sectionNumber = '';
        sectionName = '';
        parentNumber = '';
        break;
      case 'section_number':
      case 'section_name':
      case 'parent_number':
        current = tag.name;
        break;
      default:
        current = null;
    }
  });

  parser.on('text', (text) => {
    switch (current) {
      case 'code':
        rawCode += text;
        break;
      case 'name':
        name += text;
        break;
      case 'description':
        description += text;
        break;
      case 'section_number':
        sectionNumber += text;
        break;
      case 'section_name':
        sectionName += text;
        break;
      case 'parent_number':
        parentNumber += text;
        break;
      default:
        break;
    }
  });

  parser.on('closetag', (tag) => {
    switch (tag.name) {
      case 'code': {
        const parsed = Number.parseInt(rawCode.trim(), 10);
        code = Number.isSafeInteger(parsed) ? parsed : null;
        if (code === null) {
          addIssue({
            code: 'INVALID_CODE',
            message: `Код «${rawCode.trim().slice(0, 40)}» не является целым числом`,
          });
        }
        break;
      }

      case 'section': {
        insideSection = false;
        const number = sectionNumber.trim().slice(0, MAX_SECTION_NUMBER);
        const sectionTitle = collapse(sectionName).slice(0, MAX_SECTION_NAME);
        const parent = parentNumber.trim().slice(0, MAX_SECTION_NUMBER);

        if (number === '') {
          // В данных 9 таких записей: вид остаётся, привязки к разделу нет.
          addIssue({
            code: 'EMPTY_SECTION_NUMBER',
            message: 'У раздела пустой номер, вид не привязан к разделу',
            reference: code === null ? undefined : String(code),
          });
          break;
        }

        if (sectionTitle === '') {
          addIssue({
            code: 'EMPTY_SECTION_NAME',
            message: 'У раздела пустое название',
            reference: number,
          });
        } else if (LOOKS_LIKE_NUMBER.test(sectionTitle)) {
          // Например, раздел с номером «67» и названием «5.04»: в источнике
          // поля перепутаны. Данные сохраняются как есть, искажать их нельзя.
          addIssue({
            code: 'SECTION_NAME_LOOKS_LIKE_NUMBER',
            message: `Название раздела «${sectionTitle}» выглядит номером`,
            reference: number,
          });
        }

        const draft: SectionDraft = { number, name: sectionTitle, parentNumber: parent };
        mergeSection(sectionsByNumber, draft, addIssue);
        pathSections.push(draft);
        break;
      }

      case 'classificator': {
        recordsRead += 1;

        if (code === null) break;

        // В путь попадает только самый глубокий раздел: остальные
        // восстанавливаются обходом дерева (ADR 0009).
        const leaf = deepestSection(pathSections);

        const existing = typesByCode.get(code);
        const typeName = collapse(name).slice(0, MAX_TYPE_NAME);

        if (existing) {
          if (existing.name !== typeName) {
            addIssue({
              code: 'DUPLICATE_TYPE_NAME',
              message:
                `Код ${code} встречается с разными названиями: ` +
                `«${existing.name.slice(0, 60)}» и «${typeName.slice(0, 60)}»`,
              reference: String(code),
            });
          }
          if (leaf && !existing.sectionNumbers.includes(leaf.number)) {
            existing.sectionNumbers.push(leaf.number);
          }
        } else {
          typesByCode.set(code, {
            code,
            name: typeName,
            description: collapse(description).slice(0, MAX_DESCRIPTION),
            sectionNumbers: leaf ? [leaf.number] : [],
          });
        }
        break;
      }

      default:
        break;
    }

    current = null;
    void insideSection;
  });

  // Декодирование через StringDecoder обязательно: кириллица в UTF-8
  // занимает два байта, и буфер может оборваться посередине символа.
  // Прямой chunk.toString('utf8') на каждом чанке превращал такие символы в
  // «замену» и портил названия разделов.
  const decoder = new StringDecoder('utf8');

  await new Promise<void>((resolve, reject) => {
    parser.on('error', reject);
    input.on('error', reject);
    input.on('data', (chunk: Buffer | string) => {
      try {
        parser.write(typeof chunk === 'string' ? chunk : decoder.write(chunk));
      } catch (error) {
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
    input.on('end', () => {
      try {
        const tail = decoder.end();
        if (tail !== '') parser.write(tail);
        parser.close();
        resolve();
      } catch (error) {
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  });

  const sections = [...sectionsByNumber.values()];

  // Родитель, которого нет среди разделов, оставил бы висячую ссылку.
  const numbers = new Set(sections.map((section) => section.number));
  for (const section of sections) {
    if (section.parentNumber !== '' && !numbers.has(section.parentNumber)) {
      addIssue({
        code: 'UNKNOWN_PARENT_SECTION',
        message: `Родительский раздел «${section.parentNumber}» отсутствует в наборе`,
        reference: section.number,
      });
      section.parentNumber = '';
    }
  }

  return {
    types: [...typesByCode.values()],
    sections: sections as NomenclatureSectionRecord[],
    issues,
    recordsRead,
  };
}

/** Многострочные значения склеиваются в одну строку. */
function collapse(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

/**
 * Самый глубокий раздел пути.
 *
 * Глубина определяется числом уровней в номере («12.08.05» — три), а не
 * порядком элементов: порядок в файле не гарантирован схемой.
 */
function deepestSection(path: SectionDraft[]): SectionDraft | null {
  let deepest: SectionDraft | null = null;
  let maxDepth = -1;

  for (const section of path) {
    const depth = section.number.split('.').length;
    if (depth > maxDepth) {
      maxDepth = depth;
      deepest = section;
    }
  }

  return deepest;
}

/**
 * Объединение повторов раздела.
 *
 * Один и тот же номер приходит много раз. Если значения расходятся,
 * выбирается непустое: в данных конфликт всегда имеет вид «значение против
 * пустой строки».
 */
function mergeSection(
  sections: Map<string, SectionDraft>,
  draft: SectionDraft,
  addIssue: (issue: NomenclatureIssue) => void,
): void {
  const existing = sections.get(draft.number);

  if (!existing) {
    sections.set(draft.number, { ...draft });
    return;
  }

  if (existing.name !== draft.name) {
    if (existing.name === '') {
      existing.name = draft.name;
    } else if (draft.name !== '') {
      addIssue({
        code: 'CONFLICTING_SECTION_NAME',
        message:
          `Раздел «${draft.number}» встречается с разными названиями: ` +
          `«${existing.name.slice(0, 50)}» и «${draft.name.slice(0, 50)}»`,
        reference: draft.number,
      });
    }
  }

  if (existing.parentNumber !== draft.parentNumber) {
    if (existing.parentNumber === '') {
      existing.parentNumber = draft.parentNumber;
    } else if (draft.parentNumber !== '') {
      addIssue({
        code: 'CONFLICTING_SECTION_PARENT',
        message:
          `Раздел «${draft.number}» встречается с разными родителями: ` +
          `«${existing.parentNumber}» и «${draft.parentNumber}»`,
        reference: draft.number,
      });
    }
  }
}
