import { describe, expect, it } from 'vitest';
import { extractWeekendWeeks, extractWorkbookWeeks, getWorkbookSectionColor, parseMidweekWorkbook, parseWorkbookSchedules } from './workbookPdf';

describe('workbook PDF parsing', () => {
  it('parses Tagalog headings and minute durations into the expected colored sections', () => {
    const sections = parseMidweekWorkbook(`
      KAYAMANAN MULA SA SALITA NG DIYOS
      Awit 12
      Mga kayamanan mula sa Bibliya (10 min.)
      MAGING MAHUSAY SA PAGTITIPON AT PAGTUTURO / PAGMAMAYAPAG
      Pagpapasimula ng mga Pakikipag-usap (2 min.)
      PAMUMUHAY BILANG KRISTIYANO
      Pag-aaral ng Kongregasyon sa Bibliya
      Maging Mapagpatuloy (5 minuto)
    `);
    expect(sections.map((section) => section.title)).toEqual([
      'KAYAMANAN MULA SA SALITA NG DIYOS',
      'MAGING MAHUSAY SA PAGTITIPON AT PAGTUTURO / PAGMAMAYAPAG',
      'PAMUMUHAY BILANG KRISTIYANO',
    ]);
    expect(sections.map((section) => section.color)).toEqual(['#3C6674', '#946F2B', '#842F2A']);
    expect(sections.flatMap((section) => section.parts.map((part) => part.minutes))).toEqual([10, 2, 5]);
    expect(sections.flatMap((section) => section.parts.map((part) => part.title))).toEqual([
      'Mga kayamanan mula sa Bibliya',
      'Pagpapasimula ng mga Pakikipag-usap',
      'Maging Mapagpatuloy',
    ]);
  });

  it('recognizes the Tagalog ministry section when PDF.js splits its heading across lines', () => {
    const sections = parseMidweekWorkbook(`
      KAYAMANAN MULA SA
      SALITA NG DIYOS
      1. Espirituwal na Hiyas (10 min.)
      MAGING MAHUSAY
      SA MINISTERYO
      4. Pagpapasimula ng Pakikipag-usap (3 min.)
      PAMUMUHAY
      BILANG KRISTIYANO
      7. Lokal na Pangangailangan (15 min.)
    `);
    expect(sections.map((section) => section.title)).toEqual([
      'KAYAMANAN MULA SA SALITA NG DIYOS',
      'MAGING MAHUSAY SA MINISTERYO',
      'PAMUMUHAY BILANG KRISTIYANO',
    ]);
    expect(sections.map((section) => section.color)).toEqual(['#3C6674', '#946F2B', '#842F2A']);
    expect(sections.map((section) => section.parts.map((part) => part.minutes))).toEqual([[10], [3], [15]]);
  });

  it('recognizes the official Italian headings and keeps the middle section in Italian', () => {
    const sections = parseMidweekWorkbook(`
      TESORI DELLA PAROLA DI DIO
      1. Prima parte (10 min.)
      EFFICACI NEL MINISTERO
      4. Seconda parte (3 min.)
      VITA CRISTIANA
      7. Terza parte (15 min.)
    `);
    expect(sections.map((section) => section.title)).toEqual([
      'TESORI DELLA PAROLA DI DIO',
      'EFFICACI NEL MINISTERO',
      'VITA CRISTIANA',
    ]);
    expect(sections.map((section) => section.color)).toEqual(['#3C6674', '#946F2B', '#842F2A']);
    expect([
      getWorkbookSectionColor('Section 1'),
      getWorkbookSectionColor('Unfamiliar heading', 1),
      getWorkbookSectionColor('Unfamiliar heading', 2),
    ]).toEqual(['#3C6674', '#946F2B', '#842F2A']);
  });

  it('keeps the three recognized sections in workbook order when the PDF text layer reorders them', () => {
    const sections = parseMidweekWorkbook(`
      KAYAMANAN MULA SA SALITA NG DIYOS
      1. Espirituwal na Hiyas (10 min.)
      PAMUMUHAY BILANG KRISTIYANO
      7. Lokal na Pangangailangan (15 min.)
      MAGING MAHUSAY SA MINISTERYO
      4. Pagpapasimula ng Pakikipag-usap (3 min.)
    `);
    expect(sections.map((section) => section.title)).toEqual([
      'KAYAMANAN MULA SA SALITA NG DIYOS',
      'MAGING MAHUSAY SA MINISTERYO',
      'PAMUMUHAY BILANG KRISTIYANO',
    ]);
  });

  it('routes unfamiliar-language parts by agenda numbering and accepts localized duration labels', () => {
    const sections = parseMidweekWorkbook(`
      ملاحظات افتتاحية (1 dak.)
      未知のセクション見出し
      ١. Primera parte (10 dakika)
      2. Segunda parte (5 dakika)
      3. Tercera parte (4 dakika)
      Друг раздел
      4. Cuarta parte (3 dakika)
      5. Quinta parte (2 dakika)
      6. Sexta parte (6 dakika)
      第三部分
      7. Séptima parte (15 dakika)
      8. Octava parte (30 dakika)
      9. Novena parte (5 dakika)
    `);
    expect(sections.map((section) => section.title)).toEqual([
      '未知のセクション見出し',
      'Друг раздел',
      '第三部分',
    ]);
    expect(sections.map((section) => section.color)).toEqual(['#3C6674', '#946F2B', '#842F2A']);
    expect(sections.map((section) => section.parts.map((part) => part.minutes))).toEqual([
      [1, 10, 5, 4], [3, 2, 6], [15, 30, 5],
    ]);
    expect(sections[0].parts[0].title).toBe('ملاحظات افتتاحية');
  });

  it('adds English or Tagalog opening comments as a one-minute first timer', () => {
    for (const openingLine of ['Opening Comments (1 min.)', 'Pambungad na Komento (1 min.)']) {
      const sections = parseMidweekWorkbook(`${openingLine}\nTREASURES FROM GOD'S WORD\n1. Spiritual Gems (10 min.)`);
      expect(sections[0].parts.map((part) => [part.title, part.minutes])).toEqual([
        [openingLine.startsWith('Opening') ? 'Opening Comments' : 'Pambungad na Komento', 1],
        ['Spiritual Gems', 10],
      ]);
    }
  });

  it('keeps English section headings in English instead of substituting Tagalog labels', () => {
    const sections = parseMidweekWorkbook(`
      TREASURES FROM GOD'S WORD
      1. Spiritual Gems (10 min.)
      APPLY YOURSELF TO THE FIELD MINISTRY
      4. Starting a Conversation (2 min.)
      LIVING AS CHRISTIANS
      7. Congregation Bible Study (30 min.)
    `);
    expect(sections.map((section) => section.title)).toEqual([
      "TREASURES FROM GOD'S WORD",
      'APPLY YOURSELF TO THE FIELD MINISTRY',
      'LIVING AS CHRISTIANS',
    ]);
    expect(sections.map((section) => section.color)).toEqual(['#3C6674', '#946F2B', '#842F2A']);
  });

  it('finds week ranges in a PDF text layer', () => {
    expect(extractWorkbookWeeks('Week of October 26 – November 1, 2026')).toEqual(['Week of October 26 – November 1, 2026']);
  });

  it('preserves localized month words and date ordering without language dictionaries', () => {
    const spanish = '2026\fSemana del 7 al 13 de septiembre de 2026\nTREASURES FROM GOD\'S WORD\n1. Spiritual Gems (10 min.)';
    const tagalog = '2026\fSetyembre 7-13, 2026\nTREASURES FROM GOD\'S WORD\n1. Spiritual Gems (10 min.)';
    const japanese = '2026\f2026年9月7日-13日\nTREASURES FROM GOD\'S WORD\n1. Spiritual Gems (10 min.)';
    expect(extractWorkbookWeeks(spanish)).toEqual(['Week of Semana del 7 al 13 de septiembre de 2026']);
    expect(parseWorkbookSchedules(spanish)[0]?.week).toBe('Week of Semana del 7 al 13 de septiembre de 2026');
    expect(extractWorkbookWeeks(tagalog)).toEqual(['Week of Setyembre 7-13, 2026']);
    expect(parseWorkbookSchedules(tagalog)[0]?.week).toBe('Week of Setyembre 7-13, 2026');
    expect(extractWorkbookWeeks(japanese)).toEqual(['Week of 2026-09-07 – 2026-09-13']);
    expect(parseWorkbookSchedules(japanese)[0]?.week).toBe('Week of 2026-09-07 – 2026-09-13');
  });

  it('detects all eight Spanish workbook dates when PDF.js splits “de” and month names into letter fragments', () => {
    const headers = [
      '[L] 7-13 D E SEPTIEMB RE | [L] JER EMIAS 32, 33 | [R] 2',
      '[L] 14 -20 D E SEPTIEMB RE | [L] JER EMIAS 34, 35 | [R] 4',
      '[L] 21-27 D E SEPTIEMB RE | [L] JER EMIAS 36, 37 | [R] 6',
      '[L] 28 D E SEPTIEMB RE A 4 D E OCTU B RE | [L] JER EMIAS 38, 39 | [R] 8',
      '[L] 5-11 D E OCTU B RE | [L] JER EMIAS 40, 41 | [R] 10',
      '[L] 12-18 D E OCTU B RE | [L] JER EMIAS 42-44 | [R] 12',
      '[L] 19-25 D E OCTU B RE | [L] JER EMIAS 45, 46 | [R] 14',
      '[L] 26 D E OCTU B RE A 1 D E N OVIEMB RE | [L] JER EMIAS 47, 48 | [R] 16',
    ];
    const text = `2026\f${headers.map((header) => `${header}
[L] TESOROS DE LA BIBLIA
[L] 1. Primera parte (10 mins.)
[L] SEAMOS MEJORES MAESTROS
[L] 4. Segunda parte (3 mins.)
[L] NUESTRA VIDA CRISTIANA
[L] 7. Tercera parte (15 mins.)`).join('\f')}`;
    const expected = [
      'Week of 7-13 DE SEPTIEMBRE, 2026',
      'Week of 14 -20 DE SEPTIEMBRE, 2026',
      'Week of 21-27 DE SEPTIEMBRE, 2026',
      'Week of 28 DE SEPTIEMBRE A 4 DE OCTUBRE, 2026',
      'Week of 5-11 DE OCTUBRE, 2026',
      'Week of 12-18 DE OCTUBRE, 2026',
      'Week of 19-25 DE OCTUBRE, 2026',
      'Week of 26 DE OCTUBRE A 1 DE NOVIEMBRE, 2026',
    ];
    expect(extractWorkbookWeeks(text)).toEqual(expected);
    expect(parseWorkbookSchedules(text).map((schedule) => schedule.week)).toEqual(expected);
  });

  it('falls back to unfamiliar month words and Unicode date numerals', () => {
    const unfamiliar = '2026\f[L] 2 | [L] Lunara 7-13 | [L] JEREMIAH 32-33\nTREASURES FROM GOD\'S WORD\n1. Spiritual Gems (10 min.)';
    const arabicDigits = '2026\f[L] 2 | [L] أيلول ٧-١٣ | [L] JEREMIAH 32-33';
    const fullwidthDigits = '2026\f[L] ２０２６年９月７日-１３日 | JEREMIAH 32-33';
    const isoDates = '2026\f2026-09-07 – 2026-09-13';
    expect(extractWorkbookWeeks(unfamiliar)).toEqual(['Week of Lunara 7-13, 2026']);
    expect(parseWorkbookSchedules(unfamiliar)[0]?.week).toBe('Week of Lunara 7-13, 2026');
    expect(extractWorkbookWeeks(arabicDigits)).toEqual(['Week of أيلول 7-13, 2026']);
    expect(extractWorkbookWeeks(fullwidthDigits)).toEqual(['Week of 2026-09-07 – 2026-09-13']);
    expect(extractWorkbookWeeks(isoDates)).toEqual(['Week of 2026-09-07 – 2026-09-13']);
  });

  it('joins split Tagalog month names and day digits across all eight workbook weeks', () => {
    const headings = [
      'SETYEMBRE 7-1 3',
      'SE TYE MB RE 14 - 2 0',
      'SETYEMBRE 2 1 - 2 7',
      'S ETYEMB RE 28 – OKTUB RE 4',
      'OKTUB RE 5 -11',
      'OKTUB RE 1 2 -18',
      'OKTUB RE 19 - 2 5',
      'OKTUB RE 2 6 –N OBYEMB RE 1',
    ];
    const text = headings.map((header) => `2026\f[L] ${header} | [L] JEREMIAS 32-33\nKAYAMANAN MULA SA SALITA NG DIYOS\n1. Pag-isipan ang mga Katangian ni Jehova (10 min.)`).join('\n');
    const expectedWeeks = [
      'Week of SETYEMBRE 7-13, 2026',
      'Week of SETYEMBRE 14 - 20, 2026',
      'Week of SETYEMBRE 21 - 27, 2026',
      'Week of SETYEMBRE 28 – OKTUBRE 4, 2026',
      'Week of OKTUBRE 5 -11, 2026',
      'Week of OKTUBRE 12 -18, 2026',
      'Week of OKTUBRE 19 - 25, 2026',
      'Week of OKTUBRE 26 –NOBYEMBRE 1, 2026',
    ];
    expect(extractWorkbookWeeks(text)).toEqual(expectedWeeks);
    expect(parseWorkbookSchedules(text).map((schedule) => schedule.week)).toEqual(expectedWeeks);
  });

  it('reads only printed Weekend date banners and ignores the cover date range and article text', () => {
    const text = [
      'AGOSTO 2026\n34567\nMGA ARALING ARTIKULO PARA SA:\nOKTUBRE 5–NOBYEMBRE 1, 2026',
      '2\nOKTUBRE 5 -11, 2026\nLabanan si Satanas —Magtiwala kay Jehova',
      'At sinabi ni Jehova na maglilingkod tayo sa kaniya sa 2026.',
      'OKTUBRE 12-18, 2026\nKaya Mong Manalo!',
      'OKTUBRE 19-25, 2026\nIsang Pakiusap Salig sa Pag-ibig',
      'OKTUBRE 26–NOBYEMBRE 1, 2026\nPahalagahan ang Pribilehiyo',
      'Mauubos lang ang oras at lakas natin at sa mga demonyo. (Sant. 4:7; 1 Juan 5:4, 5)',
      'pangyarihang tagapagligtas mula sa sambahayan. (Roma 3:20; Gal. 3:10, 13) Kaya',
      'Semana del 2 al 8 de noviembre de 2026\nArtículo de estudio',
      '2026年11月9日-15日\n研究記事',
    ].join('\f');

    expect(extractWeekendWeeks(text)).toEqual([
      'Week of OKTUBRE 5 -11, 2026',
      'Week of OKTUBRE 12-18, 2026',
      'Week of OKTUBRE 19-25, 2026',
      'Week of OKTUBRE 26–NOBYEMBRE 1, 2026',
      'Week of Semana del 2 al 8 de noviembre de 2026',
      'Week of 2026-11-09 – 2026-11-15',
    ]);
  });

  it('extracts all split week headings and keeps wrapped parts in their own weekly schedule', () => {
    const text = `
2026
\f[L] 2 | [L] SEPTEMB ER 7-13 | [L] JEREMIAH 32-33
[L] TREASURES
[L] FROM GOD'S WORD
[L] 1. Reflecting on Jehovah's Qualities Builds
[L] Faith (10 min.)
[L] 2. Spiritual Gems (10 min.)
[R] APPLY YOURSELF
[R] TO THE FIELD MINISTRY
[R] 4. Starting a Conversation (3 min.)
\f[L] 3
[L] LIVING
[L] AS CHRISTIANS
[L] 7. Make Your Blows Count During the Campaign
[L] (15 min.) Discussion.
[L] 8. Congregation Bible Study (30 min.)
\f[L] 4 | [L] SEPTEMBER 14-20 | [L] JEREMIAH 34-35
[L] TREASURES FROM GOD'S WORD
[L] 1. Jehovah Rewards Faithful Obedience
[L] (10 min.)
`;
    const schedules = parseWorkbookSchedules(text);
    expect(extractWorkbookWeeks(text)).toEqual(['Week of SEPTEMBER 7-13, 2026', 'Week of SEPTEMBER 14-20, 2026']);
    expect(schedules.map((schedule) => schedule.week)).toEqual(['Week of SEPTEMBER 7-13, 2026', 'Week of SEPTEMBER 14-20, 2026']);
    expect(schedules[0].sections[0].title).toBe("TREASURES FROM GOD'S WORD");
    expect(schedules[0].sections.flatMap((section) => section.parts.map((part) => part.title))).toEqual([
      'Reflecting on Jehovah\'s Qualities Builds Faith', 'Spiritual Gems', 'Starting a Conversation',
      'Make Your Blows Count During the Campaign', 'Congregation Bible Study',
    ]);
    expect(schedules[0].sections.flatMap((section) => section.parts.map((part) => part.minutes))).toEqual([10, 10, 3, 15, 30]);
    expect(schedules[1].sections[0].parts[0].title).toBe('Jehovah Rewards Faithful Obedience');
  });

  it('imports a date-less workbook as sequential editable Week N schedules', () => {
    const text = `
      TREASURES FROM GOD'S WORD
      1. Primera parte (１０分)
      APPLY YOURSELF TO THE FIELD MINISTRY
      4. दूसरी भाग (١٠ دقيقة)
      LIVING AS CHRISTIANS
      7. 第三部分 (5分)
    `;
    expect(extractWorkbookWeeks(text)).toEqual([]);
    const schedules = parseWorkbookSchedules(text);
    expect(schedules.map((schedule) => schedule.week)).toEqual(['Week 1']);
    expect(schedules[0].sections.map((section) => section.parts[0]?.minutes)).toEqual([10, 10, 5]);
  });

  it('keeps the opening-comments phrase but excludes preceding song and prayer text', () => {
    const sections = parseMidweekWorkbook(`
      Song 12 and prayer ␟ Opening Comments ␟ (1 min.)
      TREASURES FROM GOD'S WORD
      1. Spiritual Gems (10 min.)
    `);
    expect(sections[0].parts.map((part) => [part.title, part.minutes])).toEqual([
      ['Opening Comments', 1],
      ['Spiritual Gems', 10],
    ]);
  });
});
