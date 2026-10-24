import { describe, expect, it } from 'vitest';
import { addDefaultMidweekCounseling } from './workbookPdfDefaults';

describe('addDefaultMidweekCounseling', () => {
  it('adds a one-minute Counseling timer at the top of the second section for every schedule', () => {
    const result = addDefaultMidweekCounseling([
      {
        week: 'Week A',
        sections: [
          { title: 'Treasures', color: '#3C6674', parts: [{ title: 'Talk', minutes: 10, section: 'Treasures' }] },
          { title: 'Ministry', color: '#946F2B', parts: [{ title: 'First Part', minutes: 3, section: 'Ministry' }] },
        ],
      },
      {
        week: 'Week B',
        sections: [
          { title: 'Treasures', color: '#3C6674', parts: [{ title: 'Talk', minutes: 10, section: 'Treasures' }] },
          { title: 'Ministry', color: '#946F2B', parts: [{ title: 'Second Part', minutes: 4, section: 'Ministry' }] },
        ],
      },
    ]);

    expect(result.map((schedule) => schedule.sections[1].parts[0])).toEqual([
      { title: 'Counseling', minutes: 1, section: 'Ministry' },
      { title: 'Counseling', minutes: 1, section: 'Ministry' },
    ]);
  });

  it('moves an existing Counseling timer to the top and normalizes it to one minute without duplicating it', () => {
    const result = addDefaultMidweekCounseling([{
      week: 'Week A',
      sections: [
        { title: 'Treasures', color: '#3C6674', parts: [] },
        {
          title: 'Ministry',
          color: '#946F2B',
          parts: [
            { title: 'Other Part', minutes: 3, section: 'Ministry' },
            { title: 'Counseling', minutes: 5, section: 'Ministry' },
            { title: 'counseling', minutes: 1, section: 'Ministry' },
          ],
        },
      ],
    }]);

    expect(result[0].sections[1].parts).toEqual([
      { title: 'Counseling', minutes: 1, section: 'Ministry' },
      { title: 'Other Part', minutes: 3, section: 'Ministry' },
    ]);
  });
});
