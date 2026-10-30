export interface WorkbookWeekDateRange {
  start: Date;
  end: Date;
}

const makeLocalDate = (year: number, month: number, day: number): Date | null => {
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return date;
};

const getMonthNumber = (monthName: string): number | null => {
  const normalized = monthName.normalize('NFD').replace(/\p{M}/gu, '').replace(/[.]/gu, '').trim().toLocaleLowerCase();
  const localizedMonths: Record<string, number> = {
    enero: 1, janeiro: 1,
    febrero: 2, fevereiro: 2,
    marzo: 3, marco: 3, março: 3,
    abril: 4,
    mayo: 5, maio: 5,
    junio: 6, junho: 6,
    julio: 7, julho: 7,
    agosto: 8,
    septiembre: 9, setiembre: 9, setyembre: 9,
    octubre: 10, outubro: 10, oktubre: 10,
    noviembre: 11, novembro: 11, nobyembre: 11,
    diciembre: 12, dezembro: 12,
    'أيلول': 9, 'ايلول': 9, 'تشرين الأول': 10, 'تشرين الثاني': 11,
    'كانون الأول': 12, 'كانون الثاني': 1, 'نيسان': 4,
  };
  if (localizedMonths[normalized]) return localizedMonths[normalized];
  const timestamp = Date.parse(`${monthName} 1, 2000`);
  return Number.isNaN(timestamp) ? null : new Date(timestamp).getMonth() + 1;
};

export function getWorkbookWeekDateRange(week: string): WorkbookWeekDateRange | null {
  const value = week.trim().replace(/^week of\s+/iu, '');
  const isoDates = [...value.matchAll(/(20\d{2})-(\d{1,2})-(\d{1,2})/gu)];
  if (isoDates.length >= 2) {
    const first = isoDates[0];
    const last = isoDates[isoDates.length - 1];
    const start = makeLocalDate(Number(first[1]), Number(first[2]), Number(first[3]));
    const end = makeLocalDate(Number(last[1]), Number(last[2]), Number(last[3]));
    return start && end ? { start, end } : null;
  }

  const slashDates = [...value.matchAll(/(\d{1,2})[./](\d{1,2})[./](20\d{2})/gu)];
  if (slashDates.length >= 2) {
    const first = slashDates[0];
    const last = slashDates[slashDates.length - 1];
    const start = makeLocalDate(Number(first[3]), Number(first[1]), Number(first[2]));
    const end = makeLocalDate(Number(last[3]), Number(last[1]), Number(last[2]));
    return start && end ? { start, end } : null;
  }

  const spanishSameMonth = value.match(/semana\s+del\s+(\d{1,2})\s+al\s+(\d{1,2})\s+de\s+([\p{L} ]+)\s+de\s+(20\d{2})$/iu);
  if (spanishSameMonth) {
    const month = getMonthNumber(spanishSameMonth[3]);
    if (month) {
      const year = Number(spanishSameMonth[4]);
      const start = makeLocalDate(year, month, Number(spanishSameMonth[1]));
      const end = makeLocalDate(year, month, Number(spanishSameMonth[2]));
      if (start && end) return { start, end };
    }
  }

  const spanishCrossMonth = value.match(/^(\d{1,2})\s+(?:de\s+)?([\p{L} ]+?)\s+(?:a|al)\s+(\d{1,2})\s+(?:de\s+)?([\p{L} ]+?),?\s+(20\d{2})$/iu);
  if (spanishCrossMonth) {
    const startMonth = getMonthNumber(spanishCrossMonth[2]);
    const endMonth = getMonthNumber(spanishCrossMonth[4]);
    if (startMonth && endMonth) {
      const endYear = Number(spanishCrossMonth[5]);
      const startYear = startMonth > endMonth ? endYear - 1 : endYear;
      const start = makeLocalDate(startYear, startMonth, Number(spanishCrossMonth[1]));
      const end = makeLocalDate(endYear, endMonth, Number(spanishCrossMonth[3]));
      if (start && end) return { start, end };
    }
  }

  const dayRangeMonth = value.match(/^(\d{1,2})\s*[-–—]\s*(\d{1,2})\s+(?:de\s+)?([\p{L} ]+?),?\s+(20\d{2})$/iu);
  if (dayRangeMonth) {
    const month = getMonthNumber(dayRangeMonth[3]);
    if (month) {
      const year = Number(dayRangeMonth[4]);
      const start = makeLocalDate(year, month, Number(dayRangeMonth[1]));
      const end = makeLocalDate(year, month, Number(dayRangeMonth[2]));
      if (start && end) return { start, end };
    }
  }

  const monthRange = value.match(/([\p{L}.]+)\s+(\d{1,2})\s*(?:[-–—]|to)\s*([\p{L}.]+\s+)?(\d{1,2})(?:,?\s+(20\d{2}))?$/iu);
  if (!monthRange) return null;

  const startMonth = getMonthNumber(monthRange[1]);
  const endMonth = monthRange[3] ? getMonthNumber(monthRange[3].trim()) : startMonth;
  if (!startMonth || !endMonth) return null;
  const yearMatch = value.match(/\b(20\d{2})\s*$/u)?.[1];
  const endYear = Number(yearMatch || new Date().getFullYear());
  const startYear = startMonth > endMonth ? endYear - 1 : endYear;
  const start = makeLocalDate(startYear, startMonth, Number(monthRange[2]));
  const end = makeLocalDate(endYear, endMonth, Number(monthRange[4]));
  return start && end ? { start, end } : null;
}

export function getCurrentOrNextWorkbookWeek(weeks: string[], selectedWeek: string, now = new Date()): string {
  if (!weeks.length) return selectedWeek;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const datedWeeks = weeks
    .map((week) => ({ week, range: getWorkbookWeekDateRange(week) }))
    .filter((item): item is { week: string; range: WorkbookWeekDateRange } => item.range !== null)
    .sort((left, right) => left.range.start.getTime() - right.range.start.getTime());
  const currentWeek = datedWeeks.find((item) => item.range.start <= today && item.range.end >= today);
  if (currentWeek) return currentWeek.week;
  const currentOrFutureWeek = datedWeeks.find((item) => item.range.end >= today);
  if (currentOrFutureWeek) return currentOrFutureWeek.week;
  if (datedWeeks.length) return datedWeeks[datedWeeks.length - 1].week;
  return weeks.includes(selectedWeek) ? selectedWeek : weeks[0];
}
