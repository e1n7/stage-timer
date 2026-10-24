export const DEFAULT_ORANGE_THRESHOLD_SECONDS = 2 * 60;
export const DEFAULT_RED_THRESHOLD_SECONDS = 0;

export function getDefaultOrangeThresholdSeconds(targetDuration = 0) {
  const duration = Math.max(0, Number(targetDuration) || 0);
  if (duration >= 60 * 60) return 10 * 60;
  if (duration >= 30 * 60) return 5 * 60;
  if (duration >= 10 * 60) return 2 * 60;
  if (duration >= 5 * 60) return 2 * 60;
  if (duration >= 2 * 60) return 60;
  if (duration >= 60) return 30;
  return duration > 0 ? Math.floor(duration / 2) : DEFAULT_ORANGE_THRESHOLD_SECONDS;
}

export function getDisplayedTimerThreshold(
  warningSecondsRemaining: number,
  targetDuration: number,
  mode: 'countdown' | 'countup',
) {
  const duration = Math.max(0, Number(targetDuration) || 0);
  const warning = Math.max(0, Number(warningSecondsRemaining) || 0);
  if (duration <= 0) return warning;
  const displayed = mode === 'countup' ? duration - warning : warning;
  return Math.max(0, Math.min(duration, displayed));
}

export function getStoredTimerThreshold(
  displayedThreshold: number,
  targetDuration: number,
  mode: 'countdown' | 'countup',
) {
  const duration = Math.max(0, Number(targetDuration) || 0);
  const displayed = Math.max(0, Number(displayedThreshold) || 0);
  if (duration <= 0) return displayed;
  const warningSecondsRemaining = mode === 'countup' ? duration - displayed : displayed;
  return Math.max(0, Math.min(duration, warningSecondsRemaining));
}

export function getDefaultTimerSegments(targetDuration = 0) {
  const duration = Math.max(0, Number(targetDuration) || 0);
  const orangeThreshold = getDefaultOrangeThresholdSeconds(duration);
  return [
    { threshold: orangeThreshold, color: '#f08c00' },
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
