/**
 * Unit-тесты разбора номенклатуры. Сеть и база не нужны: используется
 * фикстура, повторяющая особенности настоящей выгрузки (ADR 0009).
 */

import { createReadStream } from 'node:fs';
import { resolve } from 'node:path';
import { Readable } from 'node:stream';
import { describe, expect, it } from 'vitest';

import { parseNomenclatureXml } from '../../src/sync/nomenclature/nomenclature-xml.parser';
import type { NomenclatureParseResult } from '../../src/sync/nomenclature/nomenclature.types';

const FIXTURE = resolve(__dirname, '../fixtures/nomenclature-sample.xml');

async function parseFixture(): Promise<NomenclatureParseResult> {
  return parseNomenclatureXml(createReadStream(FIXTURE, { encoding: 'utf8' }));
}

function issueCodes(result: NomenclatureParseResult): string[] {
  return result.issues.map((issue) => issue.code);
}

describe('parseNomenclatureXml', () => {
  it('читает все записи файла, включая повторы кода', async () => {
    const result = await parseFixture();

    // Шесть элементов classificator при пяти различных кодах.
    expect(result.recordsRead).toBe(6);
    expect(result.types).toHaveLength(5);
  });

  it('объединяет повторы кода в один вид с несколькими разделами', async () => {
    const result = await parseFixture();
    const densitometer = result.types.find((type) => type.code === 100260);

    expect(densitometer?.name).toBe('Система ультразвуковой костной денситометрии');
    // Две записи с одним кодом дают один вид и два раздела.
    expect(densitometer?.sectionNumbers.sort()).toEqual(['12.07', '12.08.05']);
  });

  it('привязывает вид только к самому глубокому разделу пути', async () => {
    const result = await parseFixture();
    const type = result.types.find((item) => item.code === 100010);

    // Путь 5 → 5.04 → 5.04.02 даёт одну связь: остальные выводятся из дерева.
    expect(type?.sectionNumbers).toEqual(['5.04.02']);
  });

  it('склеивает многострочные название и описание', async () => {
    const result = await parseFixture();
    const type = result.types.find((item) => item.code === 200100);

    expect(type?.name).toBe('Монитор пациента многопараметрический');
    expect(type?.description).toBe(
      'Прибор для непрерывного наблюдения за физиологическими показателями пациента.',
    );
  });

  it('собирает дерево разделов с родителями', async () => {
    const result = await parseFixture();
    const byNumber = new Map(result.sections.map((section) => [section.number, section]));

    expect(byNumber.get('5')?.parentNumber).toBe('');
    expect(byNumber.get('5.04')?.parentNumber).toBe('5');
    expect(byNumber.get('5.04.02')?.parentNumber).toBe('5.04');
    expect(byNumber.get('12.08.05')?.name).toBe('Денситометры радионуклидные');
  });

  it('при расхождении названий раздела выбирает непустое', async () => {
    const result = await parseFixture();
    const section = result.sections.find((item) => item.number === '5.04');

    // Раздел 5.04 встречается с названием и с пустой строкой.
    expect(section?.name).toBe('Реагенты/наборы для определения аналитов ИВД');
  });

  it('при расхождении родителей выбирает непустого', async () => {
    const result = await parseFixture();
    const section = result.sections.find((item) => item.number === '5.04');

    expect(section?.parentNumber).toBe('5');
  });

  it('пустой номер раздела оставляет вид без привязки и даёт замечание', async () => {
    const result = await parseFixture();
    const type = result.types.find((item) => item.code === 300100);

    expect(type).toBeDefined();
    expect(type?.sectionNumbers).toEqual([]);
    expect(issueCodes(result)).toContain('EMPTY_SECTION_NUMBER');
  });

  it('отмечает название раздела, которое выглядит номером', async () => {
    const result = await parseFixture();

    // В источнике есть разделы вроде номера «67» с названием «5.04».
    const issue = result.issues.find(
      (item) => item.code === 'SECTION_NAME_LOOKS_LIKE_NUMBER',
    );
    expect(issue?.reference).toBe('67');

    // Данные при этом сохраняются как есть, а не «исправляются».
    const section = result.sections.find((item) => item.number === '67');
    expect(section?.name).toBe('5.04');
  });

  it('отмечает пустое название раздела', async () => {
    const result = await parseFixture();
    expect(issueCodes(result)).toContain('EMPTY_SECTION_NAME');
  });

  it('не падает на пустом документе', async () => {
    const result = await parseNomenclatureXml(
      Readable.from(['<?xml version="1.0"?><classificator_list></classificator_list>']),
    );

    expect(result.types).toEqual([]);
    expect(result.sections).toEqual([]);
    expect(result.recordsRead).toBe(0);
  });

  it('сообщает о нечисловом коде и пропускает запись', async () => {
    const xml =
      '<classificator_list><classificator>' +
      '<code>не-число</code><name>Имя</name><description>Описание</description>' +
      '<sections></sections>' +
      '</classificator></classificator_list>';

    const result = await parseNomenclatureXml(Readable.from([xml]));

    expect(result.types).toEqual([]);
    expect(issueCodes(result)).toContain('INVALID_CODE');
  });

  it('обнуляет ссылку на отсутствующий родительский раздел', async () => {
    const xml =
      '<classificator_list><classificator>' +
      '<code>1</code><name>Имя</name><description>Описание</description>' +
      '<sections><section>' +
      '<section_number>9.99</section_number><section_name>Раздел</section_name>' +
      '<parent_number>9</parent_number>' +
      '</section></sections>' +
      '</classificator></classificator_list>';

    const result = await parseNomenclatureXml(Readable.from([xml]));

    expect(issueCodes(result)).toContain('UNKNOWN_PARENT_SECTION');
    // Висячая ссылка не должна дойти до базы.
    expect(result.sections[0]?.parentNumber).toBe('');
  });

  it('не портит кириллицу, разорванную на границе буфера', async () => {
    const xml =
      '<classificator_list><classificator>' +
      '<code>7</code><name>Денситометры радионуклидные</name>' +
      '<description>Описание с кириллицей</description>' +
      '<sections><section><section_number>1</section_number>' +
      '<section_name>Медицинские изделия для диагностики</section_name>' +
      '<parent_number></parent_number>' +
      '</section></sections></classificator></classificator_list>';

    // Буферы по одному байту: каждый двухбайтовый символ рвётся надвое.
    // Склейка через chunk.toString('utf8') давала здесь символы замены и
    // ломала названия разделов на настоящей выгрузке.
    const bytes = Buffer.from(xml, 'utf8');
    const chunks = [...bytes].map((byte) => Buffer.from([byte]));

    const result = await parseNomenclatureXml(Readable.from(chunks));

    expect(result.types[0]?.name).toBe('Денситометры радионуклидные');
    expect(result.types[0]?.description).toBe('Описание с кириллицей');
    expect(result.sections[0]?.name).toBe('Медицинские изделия для диагностики');
    expect(result.issues).toEqual([]);
    // Символ замены означал бы испорченное декодирование.
    expect(JSON.stringify(result)).not.toContain('�');
  });

  it('разбирает документ, приходящий мелкими частями', async () => {
    const xml =
      '<classificator_list><classificator>' +
      '<code>42</code><name>Разрезанное имя</name>' +
      '<description>Описание</description>' +
      '<sections><section><section_number>1</section_number>' +
      '<section_name>Раздел</section_name><parent_number></parent_number>' +
      '</section></sections></classificator></classificator_list>';

    // Поток по одному символу: проверяет, что текст тега собирается из частей.
    const result = await parseNomenclatureXml(Readable.from([...xml]));

    expect(result.types).toHaveLength(1);
    expect(result.types[0]?.name).toBe('Разрезанное имя');
  });
});
