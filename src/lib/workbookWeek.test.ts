import { describe, expect, it } from 'vitest';
import { getCurrentOrNextWorkbookWeek, getWorkbookWeekDateRange } from './workbookWeek';

const localDateKey = (date: Date | undefined) => date
  ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  : null;

describe('workbook week rollover', () => {
  it('parses ISO and English month date ranges', () => {
    expect(localDateKey(getWorkbookWeekDateRange('Week of 2026-10-19 – 2026-10-25')?.end)).toBe('2026-10-25');
    expect(localDateKey(getWorkbookWeekDateRange('Week of Oct 26 – Nov 1, 2026')?.end)).toBe('2026-11-01');
  });

  it('parses Spanish, Tagalog, and Arabic month labels', () => {
    expect(localDateKey(getWorkbookWeekDateRange('Week of Semana del 7 al 13 de septiembre de 2026')?.end)).toBe('2026-09-13');
    expect(localDateKey(getWorkbookWeekDateRange('Week of 28 DE SEPTIEMBRE A 4 DE OCTUBRE, 2026')?.end)).toBe('2026-10-04');
    expect(localDateKey(getWorkbookWeekDateRange('Week of SETYEMBRE 7-13, 2026')?.end)).toBe('2026-09-13');
    expect(localDateKey(getWorkbookWeekDateRange('Week of أيلول 7-13, 2026')?.end)).toBe('2026-09-13');
  });

  it('advances an expired selection to the earliest week that has not ended', () => {
    const weeks = [
      'Week of Oct 12 – Oct 18, 2026',
      'Week of Oct 19 – Oct 25, 2026',
      'Week of Oct 26 – Nov 1, 2026',
    ];

    expect(getCurrentOrNextWorkbookWeek(weeks, weeks[0], new Date(2026, 9, 24))).toBe(weeks[1]);
    expect(getCurrentOrNextWorkbookWeek(weeks, weeks[0], new Date(2026, 9, 26))).toBe(weeks[2]);
  });

  it('selects the week containing today and keeps the latest imported week if all are past', () => {
    const weeks = [
      'Week of 2026-10-19 – 2026-10-25',
      'Week of 2026-10-26 – 2026-11-01',
    ];

    expect(getCurrentOrNextWorkbookWeek(weeks, weeks[1], new Date(2026, 9, 24))).toBe(weeks[0]);
    expect(getCurrentOrNextWorkbookWeek(weeks, weeks[0], new Date(2026, 9, 26))).toBe(weeks[1]);
    expect(getCurrentOrNextWorkbookWeek(weeks, weeks[0], new Date(2026, 10, 10))).toBe(weeks[1]);
  });

  it('falls forward to the next imported week when there is a gap in coverage', () => {
    const weeks = [
      'Week of 2026-10-19 – 2026-10-25',
      'Week of 2026-11-02 – 2026-11-08',
    ];

    expect(getCurrentOrNextWorkbookWeek(weeks, weeks[0], new Date(2026, 9, 28))).toBe(weeks[1]);
  });
});
