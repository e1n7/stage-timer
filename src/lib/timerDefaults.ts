export const DEFAULT_YELLOW_THRESHOLD_SECONDS = 2 * 60;
export const DEFAULT_RED_THRESHOLD_SECONDS = 0;

export function getDefaultTimerSegments(targetDuration = 0) {
  const duration = Math.max(0, Number(targetDuration) || 0);
  const yellowThreshold = duration > 0 && duration <= DEFAULT_YELLOW_THRESHOLD_SECONDS
    ? Math.floor(duration / 2)
    : DEFAULT_YELLOW_THRESHOLD_SECONDS;
  return [
    { threshold: yellowThreshold, color: '#f08c00' },
    { threshold: DEFAULT_RED_THRESHOLD_SECONDS, color: '#fa5252' },
  ];
}

export function withCountUpTimerDefaults<T extends Record<string, any>>(settings: T): T & {
  mode: 'countup';
  segments: ReturnType<typeof getDefaultTimerSegments>;
} {
  return {
    ...settings,
    mode: 'countup',
    segments: getDefaultTimerSegments(Number(settings.targetDuration) || 0),
  };
}
