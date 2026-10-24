import { describe, expect, it } from 'vitest';
import { getUndoBaselineTimerIds } from './undoSnapshot';

describe('getUndoBaselineTimerIds', () => {
  it('preserves the default Midweek and Weekend previews when undoing a new room save', () => {
    expect(getUndoBaselineTimerIds(
      ['midweek-preview', 'new-timer'],
      undefined,
      { Midweek: 'midweek-preview', Weekend: 'weekend-preview' },
    )).toEqual(['midweek-preview']);
  });

  it('uses the saved room timer list when undoing an existing room save', () => {
    expect(getUndoBaselineTimerIds(
      ['edited-timer', 'added-timer'],
      ['saved-timer'],
      { Midweek: 'saved-timer' },
    )).toEqual(['saved-timer']);
  });

  it('does not preserve ordinary unsaved timers as part of a new-room baseline', () => {
    expect(getUndoBaselineTimerIds(
      ['ordinary-timer'],
      undefined,
      { Midweek: 'midweek-preview', Weekend: 'weekend-preview' },
    )).toEqual([]);
  });
});
