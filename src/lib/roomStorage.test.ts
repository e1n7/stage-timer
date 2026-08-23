import { describe, expect, it } from 'vitest';
import { mergeItemById, mergeItemsById } from './roomStorage';

type TestRoom = {
  id: string;
  name: string;
  timerIds: string[];
};

const room = (id: string, name: string, timerIds: string[] = []): TestRoom => ({ id, name, timerIds });

describe('room save merge behavior', () => {
  it('preserves a room created by another tab when saving from a stale tab', () => {
    const staleTabRooms = [room('room-a', 'Original')];
    const latestStorageRooms = [room('room-a', 'Original'), room('room-b', 'Created in tab B')];
    const savedByTabA = room('room-a', 'Updated in tab A', ['timer-a']);

    const result = mergeItemById(latestStorageRooms, savedByTabA);

    expect(result).toEqual([
      room('room-a', 'Updated in tab A', ['timer-a']),
      room('room-b', 'Created in tab B'),
    ]);
    expect(staleTabRooms).toEqual([room('room-a', 'Original')]);
  });

  it('updates only the matching room ID and preserves unrelated rooms', () => {
    const latestStorageRooms = [
      room('room-a', 'Room A'),
      room('room-b', 'Room B', ['timer-b']),
      room('room-c', 'Room C'),
    ];

    const result = mergeItemById(latestStorageRooms, room('room-b', 'Updated Room B', ['timer-b2']));

    expect(result).toEqual([
      room('room-a', 'Room A'),
      room('room-b', 'Updated Room B', ['timer-b2']),
      room('room-c', 'Room C'),
    ]);
  });

  it('appends a new room without merging it by name', () => {
    const latestStorageRooms = [room('room-a', 'Show')];

    const result = mergeItemById(latestStorageRooms, room('room-b', 'Show', ['timer-b']));

    expect(result).toEqual([
      room('room-a', 'Show'),
      room('room-b', 'Show', ['timer-b']),
    ]);
  });

  it('applies multiple tab operations in order without losing existing rooms', () => {
    const latestStorageRooms = [room('room-a', 'Room A')];
    const result = mergeItemsById(latestStorageRooms, [
      room('room-b', 'Room B'),
      room('room-a', 'Updated Room A'),
    ]);

    expect(result).toEqual([
      room('room-a', 'Updated Room A'),
      room('room-b', 'Room B'),
    ]);
  });
});
