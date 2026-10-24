import { describe, expect, it } from 'vitest';
import { getDefaultTimerSegments, withCountUpTimerDefaults } from './timerDefaults';

describe('timer defaults', () => {
  it('uses yellow at two minutes remaining and red at the timer target', () => {
    expect(getDefaultTimerSegments()).toEqual([
      { threshold: 120, color: '#f08c00' },
      { threshold: 0, color: '#fa5252' },
    ]);
    expect(getDefaultTimerSegments(5 * 60)[0].threshold).toBe(120);
    expect(getDefaultTimerSegments(2 * 60)[0].threshold).toBe(60);
    expect(getDefaultTimerSegments(60)[0].threshold).toBe(30);
  });

  it('sets the timer to count up and replaces prior wrap-up thresholds', () => {
    const result = withCountUpTimerDefaults({
      title: 'Timer 1',
      mode: 'countdown',
      segments: [{ threshold: 60, color: '#f08c00' }],
    });

    expect(result).toEqual({
      title: 'Timer 1',
      mode: 'countup',
      segments: [
        { threshold: 120, color: '#f08c00' },
        { threshold: 0, color: '#fa5252' },
      ],
    });
  });
});
