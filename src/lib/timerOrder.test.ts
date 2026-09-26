import { describe, expect, it } from 'vitest';
import { getCanonicalTimerOrder } from './timerOrder';

describe('getCanonicalTimerOrder', () => {
  it('keeps section children together in their visible order', () => {
    expect(getCanonicalTimerOrder(
      ['orphan', 'a', 'b', 'top'],
      [{ id: 'section', timerIds: ['b', 'a'] }],
      ['header:section', 'top'],
    )).toEqual(['b', 'a', 'top', 'orphan']);
  });

  it('recovers missing top-level entries without duplicating timers', () => {
    expect(getCanonicalTimerOrder(
      ['a', 'b'],
      [],
      ['a', 'a', 'missing'],
    )).toEqual(['a', 'b']);
  });
});
