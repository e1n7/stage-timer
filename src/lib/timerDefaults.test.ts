import { describe, expect, it } from 'vitest';
import {
  getDefaultTimerSegments,
  getDisplayedTimerThreshold,
  getDefaultOrangeThresholdSeconds,
  getStoredTimerThreshold,
  withCountUpTimerDefaults,
} from './timerDefaults';

describe('timer defaults', () => {
  it('uses orange at the configured warning threshold and red at the timer target', () => {
    expect(getDefaultTimerSegments()).toEqual([
      { threshold: 120, color: '#f08c00' },
      { threshold: 0, color: '#fa5252' },
    ]);
    expect(getDefaultTimerSegments(5 * 60)[0].threshold).toBe(120);
    expect(getDefaultTimerSegments(2 * 60)[0].threshold).toBe(60);
    expect(getDefaultTimerSegments(60)[0].threshold).toBe(30);
  });

  it('uses part-specific orange defaults for supported timer durations', () => {
    expect(getDefaultOrangeThresholdSeconds(60 * 60)).toBe(10 * 60);
    expect(getDefaultOrangeThresholdSeconds(30 * 60)).toBe(5 * 60);
    expect(getDefaultOrangeThresholdSeconds(15 * 60)).toBe(2 * 60);
    expect(getDefaultOrangeThresholdSeconds(10 * 60)).toBe(2 * 60);
    expect(getDefaultOrangeThresholdSeconds(5 * 60)).toBe(2 * 60);
    expect(getDefaultOrangeThresholdSeconds(4 * 60)).toBe(60);
    expect(getDefaultOrangeThresholdSeconds(3 * 60)).toBe(60);
    expect(getDefaultOrangeThresholdSeconds(2 * 60)).toBe(60);
    expect(getDefaultOrangeThresholdSeconds(60)).toBe(30);
  });

  it('stores red at the target boundary for all supported durations', () => {
    const durations = [60, 30, 15, 10, 5, 4, 3, 2, 1].map((minutes) => minutes * 60);
    for (const duration of durations) {
      expect(getDefaultTimerSegments(duration)[1]).toEqual({ threshold: 0, color: '#fa5252' });
    }
  });

  it('translates mode-aware thresholds to and from stored time remaining', () => {
    expect(getDisplayedTimerThreshold(10 * 60, 60 * 60, 'countup')).toBe(50 * 60);
    expect(getStoredTimerThreshold(55 * 60, 60 * 60, 'countup')).toBe(5 * 60);
    expect(getDisplayedTimerThreshold(5 * 60, 30 * 60, 'countdown')).toBe(5 * 60);
    expect(getStoredTimerThreshold(3 * 60, 5 * 60, 'countdown')).toBe(3 * 60);
  });

  it('shows Count-Up Red at the target duration and Count-Down Red at zero', () => {
    expect(getDisplayedTimerThreshold(0, 10 * 60, 'countup')).toBe(10 * 60);
    expect(getDisplayedTimerThreshold(0, 10 * 60, 'countdown')).toBe(0);
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
