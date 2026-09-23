import { describe, expect, it } from 'vitest';
import { formatTimeOfDay } from './time';

describe('formatTimeOfDay', () => {
  const timestamp = Date.parse('2024-01-01T12:34:56.000Z') / 1000;

  it('formats a wall-clock timestamp in UTC without treating it as a duration', () => {
    expect(formatTimeOfDay(timestamp, 'UTC')).toBe('12:34:56');
  });

  it('formats the same timestamp in the requested timezone', () => {
    expect(formatTimeOfDay(timestamp, 'America/Los_Angeles')).toBe('04:34:56');
  });
});
