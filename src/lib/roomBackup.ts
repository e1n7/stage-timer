export interface BackupValidationResult {
  valid: boolean;
  reason?: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

const isStringArray = (value: unknown): value is string[] => (
  Array.isArray(value) && value.every((item) => typeof item === 'string')
);

export const validateRoomBackup = (value: unknown): BackupValidationResult => {
  if (!isRecord(value) || !Array.isArray(value.rooms)) {
    return { valid: false, reason: 'Backup must contain a rooms array.' };
  }
  for (const [index, room] of value.rooms.entries()) {
    if (!isRecord(room)) return { valid: false, reason: `Room ${index + 1} is invalid.` };
    if (typeof room.id !== 'string' || typeof room.name !== 'string') {
      return { valid: false, reason: `Room ${index + 1} has an invalid identity.` };
    }
    if (!isStringArray(room.timerIds)) return { valid: false, reason: `Room ${index + 1} has invalid timer IDs.` };
    if (!Array.isArray(room.messages) || !room.messages.every((message) => isRecord(message) && typeof message.id === 'string' && typeof message.text === 'string' && typeof message.color === 'string')) {
      return { valid: false, reason: `Room ${index + 1} has invalid messages.` };
    }
    if (room.timerHeaders !== undefined && (!Array.isArray(room.timerHeaders) || !room.timerHeaders.every((header) => isRecord(header) && typeof header.id === 'string' && isStringArray(header.timerIds)))) {
      return { valid: false, reason: `Room ${index + 1} has invalid sections.` };
    }
    if (room.timerTopLevelItems !== undefined && !isStringArray(room.timerTopLevelItems)) {
      return { valid: false, reason: `Room ${index + 1} has invalid layout items.` };
    }
    if (room.linkedTimerIds !== undefined && !isStringArray(room.linkedTimerIds)) {
      return { valid: false, reason: `Room ${index + 1} has invalid links.` };
    }
    if (room.timerSettings !== undefined && !isRecord(room.timerSettings)) {
      return { valid: false, reason: `Room ${index + 1} has invalid timer settings.` };
    }
  }
  return { valid: true };
};
