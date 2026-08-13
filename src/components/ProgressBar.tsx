import React from 'react';

export interface ProgressSegment {
  threshold: number;
  color: string;
}

interface ProgressBarProps {
  currentSeconds: number;
  totalSeconds: number;
  segments: ProgressSegment[];
  mode?: 'countdown' | 'countup' | 'time';
  className?: string;
  height?: string;
}

/**
 * Shared stage progress bar. Thresholds are remaining seconds, so the full
 * track is ordered green -> warning -> danger from left to right. Both the
 * dashboard and output view use this component and the same assigned duration.
 */
export const ProgressBar: React.FC<ProgressBarProps> = ({
  currentSeconds,
  totalSeconds,
  segments,
  mode = 'countdown',
  className = '',
  height = 'h-4',
}) => {
  const total = Math.max(0, Number.isFinite(totalSeconds) ? totalSeconds : 0);
  const safeTotal = Math.max(total, 1);
  const current = Number.isFinite(currentSeconds) ? currentSeconds : 0;
  const clampedCurrent = total > 0 ? Math.max(0, Math.min(current, total)) : 0;

  const normalizedSegments = [...(segments || [])]
    .map((segment) => ({
      threshold: Math.max(0, Math.min(safeTotal, Number(segment.threshold) || 0)),
      color: segment.color,
    }))
    .filter((segment) => Boolean(segment.color))
    .sort((a, b) => a.threshold - b.threshold);

  const zones: { width: number; color: string }[] = [];
  let cursor = 0;
  for (const segment of normalizedSegments) {
    if (segment.threshold > cursor) {
      zones.push({
        width: ((segment.threshold - cursor) / safeTotal) * 100,
        color: segment.color,
      });
      cursor = segment.threshold;
    }
  }
  if (cursor < safeTotal) {
    zones.push({
      width: ((safeTotal - cursor) / safeTotal) * 100,
      color: '#22c55e',
    });
  }

  const displayZones = [...zones].reverse();
  const ratio = total > 0 ? clampedCurrent / safeTotal : 0;
  const visiblePercent = (mode === 'countup' ? ratio : 1 - ratio) * 100;
  const isCountup = mode === 'countup';

  return (
    <div className={`relative w-full overflow-hidden bg-[#1c1c1c] ${height} ${className}`}>
      <div
        className={`absolute top-0 flex h-full ${isCountup ? 'left-0' : 'right-0'}`}
        style={{ width: `${Math.max(0, Math.min(100, visiblePercent))}%` }}
      >
        {displayZones.map((zone, index) => (
          <div
            key={`${zone.color}-${index}`}
            style={{ width: `${zone.width}%`, backgroundColor: zone.color }}
            className="h-full shrink-0"
          />
        ))}
      </div>
    </div>
  );
};

export default ProgressBar;
