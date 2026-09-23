export const getTimeOfDayTimestamp = (date = new Date()): number => date.getTime() / 1000;

export const formatTimeOfDay = (timestampSeconds: number, timeZone: string): string => {
  const timestamp = Number.isFinite(timestampSeconds) ? timestampSeconds * 1000 : Date.now();
  return new Date(timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZone,
  });
};
