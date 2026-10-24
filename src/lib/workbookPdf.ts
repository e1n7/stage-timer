import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

export type MeetingType = 'Midweek' | 'Weekend';

export interface WorkbookPart {
  title: string;
  minutes: number;
  section: string;
}

export interface WorkbookSection {
  title: string;
  color: string;
  parts: WorkbookPart[];
}

export interface WorkbookSchedule {
  week: string;
  sections: WorkbookSection[];
}

const SECTION_DEFINITIONS = [
  { fallbackTitle: 'Section 1', color: '#3C6674' },
  { fallbackTitle: 'Section 2', color: '#946F2B' },
  { fallbackTitle: 'Section 3', color: '#842F2A' },
] as const;
const TEXT_GAP_MARKER = '␟';

const DECIMAL_DIGIT_BASES = [0x0030, 0x0660, 0x06f0, 0x07c0, 0x0966, 0x09e6, 0x0a66, 0x0ae6, 0x0b66, 0x0be6, 0x0c66, 0x0ce6, 0x0d66, 0x0e50, 0x0ed0, 0x0f20, 0x1040, 0x1090, 0x17e0, 0x1810, 0x1946, 0x19d0, 0x1a80, 0x1a90, 0x1b50, 0x1bb0, 0x1c40, 0x1c50, 0xa620, 0xa8d0, 0xa900, 0xa9d0, 0xa9f0, 0xaa50, 0xabf0, 0xff10, 0x104a0, 0x10d30, 0x11066, 0x110f0, 0x11136, 0x111d0, 0x112f0, 0x11450, 0x114d0, 0x11650, 0x116c0, 0x11730, 0x118e0, 0x11950, 0x11c50, 0x11d50, 0x11da0, 0x11f50, 0x16a60, 0x16ac0, 0x16b50, 0x1d7ce, 0x1d7d8, 0x1d7e2, 0x1d7ec, 0x1d7f6, 0x1e140, 0x1e2f0, 0x1e4f0, 0x1e950, 0x1fbf0];
const normalizeDecimalDigits = (value: string) => value.normalize('NFKC').replace(/\p{Nd}/gu, (digit) => {
  const codePoint = digit.codePointAt(0) || 0;
  for (const base of DECIMAL_DIGIT_BASES) {
    if (codePoint >= base && codePoint < base + 10) return String(codePoint - base);
  }
  return digit;
});
const ISO_NUMERIC_WEEK_PATTERN = /(20\p{Nd}{2})[-/.](\p{Nd}{1,2})[-/.](\p{Nd}{1,2})\s*[-–—~至〜]\s*(?:(20\p{Nd}{2})[-/.])?(\p{Nd}{1,2})[-/.](\p{Nd}{1,2})/u;
const SLASH_NUMERIC_WEEK_PATTERN = /(\p{Nd}{1,2})[./](\p{Nd}{1,2})[./](20\p{Nd}{2})\s*[-–—~～〜]\s*(\p{Nd}{1,2})[./](\p{Nd}{1,2})(?:[./](20\p{Nd}{2}))?/u;
const EAST_ASIAN_NUMERIC_WEEK_PATTERN = /(?:(20\p{Nd}{2})年)?(\p{Nd}{1,2})月(\p{Nd}{1,2})日?\s*[-–—至〜]\s*(?:(\p{Nd}{1,2})月)?(\p{Nd}{1,2})日?(?:[^\p{N}]{0,24}(20\p{Nd}{2})年?)?/u;
const UNIVERSAL_DAY_RANGE_PATTERN = /(?<!\p{N})(\p{Nd}{1,2})([\p{L}\p{M}\p{P}\s]{0,48}?)(\p{Nd}{1,2})(?!\p{N})/u;

function normalizeSplitDateHeader(value: string): string {
  const connectorWords = new Set(['A', 'AL', 'DE', 'DEL', 'OF', 'THE', 'WEEK']);
  const joinUppercaseFragments = (line: string) => line.replace(/\b[A-Z]+\b(?:\s+\b[A-Z]+\b)+/g, (run) => {
    const sourceWords = run.split(/\s+/);
    const words: string[] = [];
    for (let index = 0; index < sourceWords.length;) {
      if (sourceWords[index].length === 1) {
        let end = index;
        while (end < sourceWords.length && sourceWords[end].length === 1) end += 1;
        const combined = sourceWords.slice(index, end).join('');
        const connectorPrefix = [...connectorWords]
          .filter((word) => combined.startsWith(word))
          .sort((left, right) => right.length - left.length)[0];
        if (connectorPrefix) {
          words.push(connectorPrefix);
          const remainder = combined.slice(connectorPrefix.length);
          if (remainder && end < sourceWords.length && sourceWords[end].length >= 3) {
            words.push(`${remainder}${sourceWords[end]}`);
            index = end + 1;
          } else if (remainder) {
            words.push(remainder);
            index = end;
          } else {
            index = end;
          }
          continue;
        }
        if (end < sourceWords.length && sourceWords[end].length >= 3) {
          words.push(`${combined}${sourceWords[end]}`);
          index = end + 1;
          continue;
        }
        words.push(combined);
        index = end;
        continue;
      }
      words.push(sourceWords[index]);
      index += 1;
    }
    const joined: string[] = [];
    for (const word of words) {
      const previous = joined[joined.length - 1];
      const joinsPrevious = Boolean(previous && (
        (word.length <= 2 && previous.length >= 3 && !connectorWords.has(word))
        || (previous.length <= 2 && word.length >= 3 && !connectorWords.has(previous))
      ));
      if (joinsPrevious) joined[joined.length - 1] = `${previous}${word}`;
      else joined.push(word);
    }
    return joined.join(' ');
  });
  let normalized = normalizeDecimalDigits(value)
    .replace(/(\p{Nd})\s+(?=\p{Nd})/gu, '$1')
    .split(/\r?\n/)
    .map(joinUppercaseFragments)
    .join('\n');
  let previous = '';
  while (previous !== normalized) {
    previous = normalized;
    normalized = normalized
      .replace(/(^|[^\p{L}\p{M}])(\p{L})\s+(?=\p{L}(?:\s|[^\p{L}\p{M}]|$))/gu, '$1$2');
  }
  return normalized;
}

const cleanLine = (value: string) => value
  .normalize('NFKC')
  .replace(/(?<!\p{L})\p{M}+(?!\p{L})/gu, '')
  .replace(/[\u0000-\u001f]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

function normalizeDateHeaderSpacing(value: string): string {
  // PDF.js may expose a single uppercase month as several text fragments.
  // Only repair all-uppercase date lines, so ordinary mixed-case language
  // phrases (for example Spanish or French words) keep their word spaces.
  if ([...value].some((character) => /\p{Ll}/u.test(character))) return value;
  return value
    .replace(/\bWEEK\s+OF\b/gu, 'WEEK␞OF')
    .replace(/(\p{Nd})\s+(\p{Lu}{1,2})\s+(?=\p{Lu}{3,})/gu, '$1 $2␟')
    .replace(/(\p{Lu}{1,2})\s+(?=\p{Lu}{1,2}\s+\p{Lu}{3,})/gu, '$1␟')
    .replace(/(\p{Lu}{2,})\s+(?=\p{Lu}\s+\p{Nd})/gu, '$1␟')
    .replace(/(\p{Lu}{1,2})\s+(?=\p{Nd})/gu, '$1␟')
    .replace(/([A-Z])\s+(?=[A-Z])/g, '$1')
    .replaceAll('␟', ' ')
    .replaceAll('␞', ' ');
}

const isStandalonePageNumber = (line: string | undefined) => Boolean(line && /^\p{Nd}{1,4}$/u.test(normalizeDecimalDigits(line.replace(/^\s*\[[LR]\]\s*/u, '').trim())));

const normalize = (value: string) => cleanLine(value)
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLocaleUpperCase();

const canonical = (value: string) => normalize(value).replace(/[^\p{L}\p{N}]/gu, '');

const isUppercaseHeading = (value: string) => {
  const letters = [...value.matchAll(/\p{L}/gu)].map((match) => match[0]);
  return letters.length >= 5 && letters.every((letter) => letter === letter.toLocaleUpperCase());
};

function reconstructPageLines(items: Array<{ str: string; transform: number[]; width: number }>, pageWidth: number): string[] {
  const rows: Array<{ y: number; items: Array<{ x: number; y: number; width: number; str: string }> }> = [];
  for (const item of items) {
    const str = item.str.normalize('NFKC').replace(/\u0002/g, '').trim();
    if (!str) continue;
    const x = item.transform[4];
    const y = item.transform[5];
    let row = rows.find((candidate) => Math.abs(candidate.y - y) < 1.4);
    if (!row) {
      row = { y, items: [] };
      rows.push(row);
    }
    row.items.push({ x, y, width: item.width, str });
  }

  rows.sort((a, b) => b.y - a.y);
  return rows.map((row) => {
    row.items.sort((a, b) => a.x - b.x);
    const columns: string[] = [];
    let current = '';
    let end = Number.NEGATIVE_INFINITY;
    let currentSide: 'L' | 'R' = 'L';
    for (const item of row.items) {
      const gap = item.x - end;
      if (current && gap > 22) {
        columns.push(`[${currentSide}] ${cleanLine(current)}`);
        current = '';
        currentSide = item.x > pageWidth * 0.52 ? 'R' : 'L';
      } else if (current && gap > 12) {
        current += ` ${TEXT_GAP_MARKER} `;
      } else if (current && gap > 1.8) {
        current += ' ';
      } else if (!current) {
        currentSide = item.x > pageWidth * 0.52 ? 'R' : 'L';
      }
      current += item.str;
      end = item.x + item.width;
    }
    if (cleanLine(current)) columns.push(`[${currentSide}] ${cleanLine(current)}`);
    return columns.join(' | ');
  }).filter(Boolean);
}

export async function readWorkbookPdf(file: File): Promise<string> {
  if (typeof window !== 'undefined') pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
  const bytes = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjsLib.getDocument({ data: bytes, useWorkerFetch: false }).promise;
  const pages = await Promise.all(Array.from({ length: pdf.numPages }, async (_, index) => {
    const page = await pdf.getPage(index + 1);
    const content = await page.getTextContent();
    return reconstructPageLines(content.items.filter((item): item is typeof item & { str: string; transform: number[]; width: number } => 'str' in item), page.view[2] - page.view[0])
      .join('\n');
  }));
  return pages.join('\n\f\n');
}

const localizedParenthesizedDurationPattern = /[\(\[\{（【]\s*(\p{Nd}{1,3})\s*[\p{L}.\s]*[\)\]\}）】]/u;
const trailingLocalizedDurationPattern = /(?:^|[^\p{N}])(\p{Nd}{1,3})\s*[\p{L}]+\.?(?:\s*[).])?\s*$/u;
const numberedPartPattern = /^\s*(\p{Nd}{1,2})[.)]\s*(.+?)\s*$/u;

function getDuration(value: string): number | null {
  const normalizedValue = normalizeDecimalDigits(value);
  const match = normalizedValue.match(localizedParenthesizedDurationPattern)
    || normalizedValue.match(trailingLocalizedDurationPattern);
  if (!match) return null;
  const minutes = Number(match[1]);
  return Number.isFinite(minutes) && minutes >= 1 && minutes <= 60 ? minutes : null;
}

function cleanPartTitle(value: string): string {
  let title = cleanLine(value.replaceAll(TEXT_GAP_MARKER, ' '));
  const parenthesizedDuration = localizedParenthesizedDurationPattern.exec(title);
  if (parenthesizedDuration) title = title.slice(0, parenthesizedDuration.index);
  else title = title.replace(trailingLocalizedDurationPattern, '');
  return cleanLine(title.replace(/^[\s:–—-]+|[\s:–—-]+$/g, ''));
}

function parseWeekHeader(value: string, fallbackYear: number): string | null {
  const sourceHeader = normalizeSplitDateHeader(value.replaceAll(TEXT_GAP_MARKER, ' '));
  const normalizedHeader = normalizeDecimalDigits(sourceHeader);
  const isoNumeric = ISO_NUMERIC_WEEK_PATTERN.exec(normalizedHeader);
  if (isoNumeric) {
    const startMonth = Number(isoNumeric[2]);
    const endMonth = Number(isoNumeric[5]);
    const startDay = Number(isoNumeric[3]);
    const endDay = Number(isoNumeric[6]);
    if (startMonth >= 1 && startMonth <= 12 && endMonth >= 1 && endMonth <= 12 && startDay >= 1 && startDay <= 31 && endDay >= 1 && endDay <= 31) {
      return `Week of ${isoNumeric[1]}-${String(startMonth).padStart(2, '0')}-${String(startDay).padStart(2, '0')} – ${isoNumeric[4] || isoNumeric[1]}-${String(endMonth).padStart(2, '0')}-${String(endDay).padStart(2, '0')}`;
    }
  }

  const slashNumeric = SLASH_NUMERIC_WEEK_PATTERN.exec(normalizedHeader);
  if (slashNumeric) {
    return `Week of ${slashNumeric[1]}/${slashNumeric[2]}/${slashNumeric[3]} – ${slashNumeric[4]}/${slashNumeric[5]}/${slashNumeric[6] || slashNumeric[3]}`;
  }

  const eastAsianNumeric = EAST_ASIAN_NUMERIC_WEEK_PATTERN.exec(normalizedHeader);
  if (eastAsianNumeric) {
    const startMonth = Number(eastAsianNumeric[2]);
    const endMonth = Number(eastAsianNumeric[4] || eastAsianNumeric[2]);
    const startDay = Number(eastAsianNumeric[3]);
    const endDay = Number(eastAsianNumeric[5]);
    if (startMonth >= 1 && startMonth <= 12 && endMonth >= 1 && endMonth <= 12 && startDay >= 1 && startDay <= 31 && endDay >= 1 && endDay <= 31) {
      const year = eastAsianNumeric[1] || eastAsianNumeric[6] || String(fallbackYear);
      return `Week of ${year}-${String(startMonth).padStart(2, '0')}-${String(startDay).padStart(2, '0')} – ${year}-${String(endMonth).padStart(2, '0')}-${String(endDay).padStart(2, '0')}`;
    }
  }

  for (const line of sourceHeader.split(/\r?\n/).slice(0, 8)) {
    const normalizedLine = normalizeDecimalDigits(normalizeDateHeaderSpacing(line));
    if (getDuration(normalizedLine) !== null || numberedPartPattern.test(normalizedLine)) continue;
    for (const column of normalizedLine.split('|')) {
      const normalizedColumn = column.replace(/^\s*\[[LR]\]\s*/u, '').trim();
      if (isStandalonePageNumber(normalizedColumn) || numberedPartPattern.test(normalizedColumn)) continue;
      const rawRange = UNIVERSAL_DAY_RANGE_PATTERN.exec(normalizedColumn);
      if (!rawRange || /20\p{Nd}{2}/u.test(rawRange[0]) || !/[\p{L}\p{M}\p{P}]/u.test(rawRange[2])) continue;
      const startDay = Number(rawRange[1]);
      const endDay = Number(rawRange[3]);
      if (startDay < 1 || startDay > 31 || endDay < 1 || endDay > 31) continue;
      const prefix = normalizedColumn.slice(0, rawRange.index);
      const suffix = normalizedColumn.slice(rawRange.index + rawRange[0].length);
      const dateLabel = cleanLine(`${prefix} ${rawRange[1]}${rawRange[2]}${rawRange[3]} ${suffix}`)
        .replaceAll(TEXT_GAP_MARKER, ' ')
        .replace(/\s+([,.;:!?])/gu, '$1');
      if (dateLabel) {
        const normalizedLabel = dateLabel.replace(/^week of\s+/iu, '');
        return `Week of ${normalizedLabel}${/20\p{Nd}{2}/u.test(normalizedLabel) ? '' : `, ${fallbackYear}`}`;
      }
    }
  }

  return null;
}

function parseWeekendDateBanner(value: string, fallbackYear: number): string | null {
  const source = normalizeSplitDateHeader(value.replaceAll(TEXT_GAP_MARKER, ' '));
  const normalizedLine = normalizeDecimalDigits(normalizeDateHeaderSpacing(source));
  const hasStructuredNumericDate = [ISO_NUMERIC_WEEK_PATTERN, SLASH_NUMERIC_WEEK_PATTERN, EAST_ASIAN_NUMERIC_WEEK_PATTERN]
    .some((pattern) => pattern.test(normalizedLine));
  if (hasStructuredNumericDate) return parseWeekHeader(value, fallbackYear);
  if (normalizedLine.length > 80) return null;

  const numericTokens: string[] = normalizedLine.match(/\p{Nd}+/gu) || [];
  const dayTokens = numericTokens.filter((token) => token.length <= 2);
  const yearTokens = numericTokens.filter((token) => /^20\p{Nd}{2}$/u.test(token));
  if (dayTokens.length !== 2 || numericTokens.length !== dayTokens.length + yearTokens.length) return null;

  const range = UNIVERSAL_DAY_RANGE_PATTERN.exec(normalizedLine);
  if (!range || !/[-–—~～〜/]|[\p{L}]{2,}/u.test(range[2])) return null;
  return parseWeekHeader(value, fallbackYear);
}

function getYear(text: string): number {
  const year = normalizeDecimalDigits(text).match(/(?<!\p{N})(20\p{Nd}{2})(?!\p{N})/u)?.[1];
  return year ? Number(year) : new Date().getFullYear();
}

function parseSectionsFromPages(pages: string[], year: number): WorkbookSchedule[] {
  const schedules: WorkbookSchedule[] = [];
  let activeSchedule: WorkbookSchedule | null = null;
  let activeBySide: Record<string, WorkbookSection | null> = {};
  let recentLinesBySide: Record<string, string[]> = {};
  let pendingBySide: Record<string, { title: string; section: WorkbookSection } | null> = {};
  const openingCommentsBySchedule = new Map<WorkbookSchedule, string>();

  const extractOpeningCommentsTitle = (line: string) => {
    const fragments = line.split(TEXT_GAP_MARKER);
    const candidate = fragments.length > 1
      ? fragments.slice(1).map(cleanPartTitle).filter(Boolean).join(' ')
      : line;
    return cleanPartTitle(candidate) || cleanPartTitle(line);
  };

  const getOrCreateSchedule = () => {
    if (!activeSchedule) {
      activeSchedule = { week: '', sections: [] };
      schedules.push(activeSchedule);
    }
    return activeSchedule;
  };

  const getOrCreateSection = (title: string, color: string) => {
    const schedule = getOrCreateSchedule();
    let section = schedule.sections.find((candidate) => candidate.color === color)
      || schedule.sections.find((candidate) => candidate.title === title);
    if (!section) {
      section = { title, color, parts: [] };
      schedule.sections.push(section);
    } else if (section.title.startsWith('Section ') && title && !title.startsWith('Section ')) {
      section.title = title;
    } else if (title && isUppercaseHeading(title) && !isUppercaseHeading(section.title)) {
      section.title = title;
    }
    return section;
  };

  const resetPageContext = () => {
    activeBySide = {};
    recentLinesBySide = {};
    pendingBySide = {};
  };

  const hasParts = (schedule: WorkbookSchedule | null) => Boolean(schedule?.sections.some((section) => section.parts.length));

  const inferHeadingTitle = (recent: string[], fallbackTitle: string) => {
    const candidates: string[] = [];
    let skippedDecoration = false;
    for (const line of recent.slice(0, -1).slice(-16).reverse()) {
      const normalizedLine = normalizeDecimalDigits(line);
      if (/\p{N}/u.test(normalizedLine)) {
        if (!skippedDecoration && !numberedPartPattern.test(normalizedLine) && getDuration(line) === null) {
          skippedDecoration = true;
          continue;
        }
        break;
      }
      if (getDuration(line) !== null || numberedPartPattern.test(normalizedLine) || line.length > 100) break;
      const candidate = cleanLine(line.replace(/\[[LR]\]/gu, ' ').replaceAll(TEXT_GAP_MARKER, ' '));
      if (!/\p{L}{2,}/u.test(candidate)) continue;
      candidates.unshift(candidate);
      if (candidates.length === 3) break;
    }
    const uppercaseTitle = candidates.filter(isUppercaseHeading).join(' ');
    return cleanLine(uppercaseTitle || candidates.join(' ')) || fallbackTitle;
  };

  const flushPending = (side: string, minutes: number) => {
    const pending = pendingBySide[side];
    if (!pending) return;
    const title = cleanPartTitle(pending.title);
    if (title) {
      pending.section.parts.push({ title, minutes, section: pending.section.title });
    }
    pendingBySide[side] = null;
  };

  for (const page of pages) {
    const lines = page.split(/\r?\n/).map(cleanLine).filter(Boolean);
    const header = lines.slice(0, 8).join('\n');
    const foundWeek = isStandalonePageNumber(lines[0]) ? null : parseWeekHeader(header, year);
    if (foundWeek) {
      activeSchedule = { week: foundWeek, sections: [] };
      schedules.push(activeSchedule);
      resetPageContext();
    }
    if (!activeSchedule) getOrCreateSchedule();

    for (const line of lines) {
      const columns = line.split(/\s+\|\s+/).map(cleanLine).filter(Boolean);
      for (let columnIndex = 0; columnIndex < columns.length; columnIndex += 1) {
        const labeledColumn = columns[columnIndex].match(/^\[([LR])\]\s*(.*)$/);
        const side = labeledColumn?.[1] || String(columnIndex);
        const partLine = cleanLine(labeledColumn?.[2] || columns[columnIndex]);
        const normalizedPartLine = normalizeDecimalDigits(partLine);
        if (getDuration(partLine) === 1 && !numberedPartPattern.test(normalizedPartLine) && !activeBySide[side]) {
          const schedule = getOrCreateSchedule();
          if (!openingCommentsBySchedule.has(schedule)) {
          openingCommentsBySchedule.set(schedule, extractOpeningCommentsTitle(partLine) || 'Opening Comments');
          }
          continue;
        }
        recentLinesBySide[side] = [...(recentLinesBySide[side] || []), partLine].slice(-20);

        const numbered = normalizedPartLine.match(numberedPartPattern);
        if (numbered) {
          pendingBySide[side] = null;
          const partNumber = Number(numbered[1]);
          const definitionIndex = partNumber <= 3 ? 0 : partNumber <= 6 ? 1 : 2;
          const definition = SECTION_DEFINITIONS[definitionIndex];
          const recent = recentLinesBySide[side] || [];
          const sourceTitle = inferHeadingTitle(recent, definition.fallbackTitle);
          if (partNumber === 1 && !foundWeek && hasParts(activeSchedule)) {
            activeSchedule = { week: `Week ${schedules.length + 1}`, sections: [] };
            schedules.push(activeSchedule);
            resetPageContext();
            recentLinesBySide[side] = [sourceTitle, partLine];
          } else if (!foundWeek && activeSchedule && !activeSchedule.week) {
            activeSchedule.week = `Week ${Math.max(1, schedules.indexOf(activeSchedule) + 1)}`;
          }
          const section = getOrCreateSection(sourceTitle, definition.color);
          if (isUppercaseHeading(sourceTitle)) section.title = sourceTitle;
          activeBySide[side] = section;
          const title = cleanLine(numbered[2]);
          const minutes = getDuration(title);
          pendingBySide[side] = { title: cleanPartTitle(title), section };
          if (minutes !== null) flushPending(side, minutes);
          continue;
        }

        const pending = pendingBySide[side];
        if (!pending) {
          if (side === 'L' || side === 'R') continue;
          const minutes = getDuration(partLine);
          const title = cleanPartTitle(partLine);
          if (minutes !== null && title) {
            const schedule = getOrCreateSchedule();
            const existingSection = activeBySide[side];
            const headingTitle = inferHeadingTitle(recentLinesBySide[side] || [], `Section ${Math.min(3, schedule.sections.length + 1)}`);
            const sectionIndex = existingSection && canonical(existingSection.title) === canonical(headingTitle)
              ? SECTION_DEFINITIONS.findIndex((definition) => definition.color === existingSection.color)
              : Math.min(2, schedule.sections.length);
            const definition = SECTION_DEFINITIONS[Math.max(0, sectionIndex)];
            const section = existingSection && canonical(existingSection.title) === canonical(headingTitle)
              ? existingSection
              : getOrCreateSection(headingTitle, definition.color);
            activeBySide[side] = section;
            section.parts.push({ title, minutes, section: section.title });
          }
          continue;
        }
        const minutes = getDuration(partLine);
        if (minutes !== null) {
          pending.title = cleanLine(`${pending.title} ${cleanPartTitle(partLine)}`);
          flushPending(side, minutes);
        } else if (!trailingLocalizedDurationPattern.test(normalizeDecimalDigits(partLine))) {
          pending.title = cleanLine(`${pending.title} ${partLine}`);
        }
      }
    }
  }

  return schedules
    .map((schedule) => {
      const sections = schedule.sections
        .filter((section) => section.parts.length > 0)
        .sort((left, right) => {
          const leftOrder = SECTION_DEFINITIONS.findIndex((definition) => definition.color === left.color);
          const rightOrder = SECTION_DEFINITIONS.findIndex((definition) => definition.color === right.color);
          return (leftOrder < 0 ? SECTION_DEFINITIONS.length : leftOrder) - (rightOrder < 0 ? SECTION_DEFINITIONS.length : rightOrder);
        });
      const openingTitle = openingCommentsBySchedule.get(schedule);
      if (!openingTitle || !sections.length) return { ...schedule, sections };
      const [firstSection, ...remainingSections] = sections;
      return {
        ...schedule,
        sections: [
          { ...firstSection, parts: [{ title: openingTitle, minutes: 1, section: firstSection.title }, ...firstSection.parts] },
          ...remainingSections,
        ],
      };
    })
    .filter((schedule) => schedule.sections.length > 0)
    .map((schedule, index) => ({ ...schedule, week: schedule.week || `Week ${index + 1}` }));
}

export function parseWorkbookSchedules(text: string): WorkbookSchedule[] {
  const pages = text.split(/\f/);
  return parseSectionsFromPages(pages, getYear(text));
}

export type MidweekWorkbookIssue = 'none' | 'no-text' | 'no-agenda' | 'missing-headings';

export function inspectMidweekWorkbook(text: string): { schedules: WorkbookSchedule[]; issue: MidweekWorkbookIssue } {
  if (!text.trim()) return { schedules: [], issue: 'no-text' };

  const schedules = parseWorkbookSchedules(text);
  if (!schedules.some((schedule) => schedule.sections.some((section) => section.parts.length > 0))) {
    return { schedules, issue: 'no-agenda' };
  }

  const hasMissingHeadings = schedules.some((schedule) => schedule.sections.some((section) => /^Section [1-3]$/iu.test(section.title.trim())));
  return { schedules, issue: hasMissingHeadings ? 'missing-headings' : 'none' };
}

export function parseMidweekWorkbook(text: string): WorkbookSection[] {
  return parseWorkbookSchedules(text)[0]?.sections || [];
}

export function makeWeekendSections(talkTitle = 'Public Talk', studyTitle = 'Watchtower Study') {
  return [
    { title: 'Public Talk', color: '#3C6674', parts: [{ title: talkTitle, minutes: 30, section: 'Public Talk' }] },
    { title: 'Watchtower Study', color: '#842F2A', parts: [{ title: studyTitle, minutes: 60, section: 'Watchtower Study' }] },
  ] satisfies WorkbookSection[];
}

export function extractWorkbookWeekPageNumbers(text: string): Array<{ week: string; pageNumber: number }> {
  const year = getYear(text);
  return text.split(/\f/)
    .map((page, pageIndex) => {
      const lines = page.split(/\r?\n/).map(cleanLine).filter(Boolean);
      const week = isStandalonePageNumber(lines[0]) ? null : parseWeekHeader(lines.slice(0, 8).join('\n'), year);
      return week ? { week, pageNumber: pageIndex + 1 } : null;
    })
    .filter((entry): entry is { week: string; pageNumber: number } => Boolean(entry));
}

export function extractWorkbookWeeks(text: string): string[] {
  return [...new Set(extractWorkbookWeekPageNumbers(text).map(({ week }) => week))];
}

export function extractWeekendWeeks(text: string): string[] {
  const year = getYear(text);
  const pageWeeks = text.split(/\f/)
    .map((page) => {
      const firstLine = page.split(/\r?\n/).map(cleanLine).find((line) => line && !isStandalonePageNumber(line));
      if (!firstLine) return null;
      return parseWeekendDateBanner(firstLine, year);
    })
    .filter((week): week is string => Boolean(week));
  return [...new Set(pageWeeks)];
}

export function getWorkbookSectionColor(title: string, sectionIndex = 0): string {
  const key = canonical(title);
  const explicitFallback = SECTION_DEFINITIONS.find((section) => canonical(section.fallbackTitle) === key);
  return explicitFallback?.color || SECTION_DEFINITIONS[Math.max(0, Math.min(2, sectionIndex))].color;
}
