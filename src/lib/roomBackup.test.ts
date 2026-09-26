import { describe, expect, it } from 'vitest';
import { validateRoomBackup } from './roomBackup';

describe('validateRoomBackup', () => {
  it('accepts a structurally valid room backup', () => {
    expect(validateRoomBackup({
      rooms: [{ id: 'room-1', name: 'Show', timerIds: ['timer-1'], messages: [{ id: 'm1', text: '', color: '#fff' }] }],
    }).valid).toBe(true);
  });

  it('rejects malformed rooms before import', () => {
    expect(validateRoomBackup({ rooms: [{ id: 'room-1', name: 'Show', timerIds: ['timer-1'], messages: {} }] }).valid).toBe(false);
    expect(validateRoomBackup({ rooms: [{ id: 'room-1', name: 'Show', timerIds: ['timer-1'], messages: [], linkedTimerIds: [4] }] }).valid).toBe(false);
  });
});
