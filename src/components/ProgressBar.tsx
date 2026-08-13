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
 * A stage progress bar with fixed colored zones.
 * Green is the "safe" zone (start to warning threshold).
 * Orange is the "warning" zone.
 * Red is the "danger" zone (near zero).
 * 
 * For a countdown: The bar starts full and shrinks from left to right,
 * uncovering the background as time elapses. The colored zones stay fixed
 * at the right end of the bar.
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

  // Percentage of time REMAINING
  const remainingPercent = (clampedCurrent / safeTotal) * 100;
  // Percentage of time ELAPSED
  const elapsedPercent = 100 - remainingPercent;

  // Build the colored background zones (fixed relative to the total duration)
  // We want: [ Green (Total -> T1) ] [ Orange (T1 -> T2) ] [ Red (T2 -> 0) ]
  // These are ordered from left to right.
  const normalizedSegments = [...(segments || [])]
    .map((s) => ({
      threshold: Math.max(0, Math.min(safeTotal, Number(s.threshold) || 0)),
      color: s.color,
    }))
    .sort((a, b) => b.threshold - a.threshold); // Descending (e.g., 60s, then 10s)

  const zones: { width: number; color: string }[] = [];
  let lastThreshold = safeTotal;

  // 1. Green Zone (from total down to first threshold)
  if (normalizedSegments.length > 0 && lastThreshold > normalizedSegments[0].threshold) {
    zones.push({
      width: ((lastThreshold - normalizedSegments[0].threshold) / safeTotal) * 100,
      color: '#22c55e',
    });
    lastThreshold = normalizedSegments[0].threshold;
  } else if (normalizedSegments.length === 0) {
    zones.push({ width: 100, color: '#22c55e' });
    lastThreshold = 0;
  }

  // 2. Middle Zones (e.g., Orange)
  for (let i = 0; i < normalizedSegments.length; i++) {
    const currentSeg = normalizedSegments[i];
    const nextThreshold = i + 1 < normalizedSegments.length ? normalizedSegments[i+1].threshold : 0;
    
    if (currentSeg.threshold > nextThreshold) {
      zones.push({
        width: ((currentSeg.threshold - nextThreshold) / safeTotal) * 100,
        color: currentSeg.color
      });
      lastThreshold = nextThreshold;
    }
  }

  // 3. Final Zone if any (should already be covered by loop above, but for safety)
  if (lastThreshold > 0 && zones.length > 0) {
     // This part is actually handled by the loop (last segment to 0)
  }

  // For countup, we reverse the logic: the bar grows from left to right.
  const isCountup = mode === 'countup';

  return (
    <div className={`relative w-full overflow-hidden bg-[#1c1c1c] ${height} ${className}`}>
      {/* Background layer: All colored zones in their fixed positions */}
      <div className="absolute inset-0 flex h-full w-full">
        {zones.map((zone, index) => (
          <div
            key={`${zone.color}-${index}`}
            style={{ width: `${zone.width}%`, backgroundColor: zone.color }}
            className="h-full shrink-0"
          />
        ))}
      </div>

      {/* Mask layer: Covers the "elapsed" or "future" part */}
      {/* For Countdown: Mask starts at 0 width on the left and grows to the right */}
      {!isCountup ? (
        <div
          className="absolute inset-y-0 left-0 bg-[#141414] transition-[width] duration-100 ease-linear z-10"
          style={{ width: `${Math.max(0, Math.min(100, elapsedPercent))}%` }}
        />
      ) : (
        /* For Countup: Mask starts at 100 width and shrinks to the left */
        <div
          className="absolute inset-y-0 right-0 bg-[#141414] transition-[width] duration-100 ease-linear z-10"
          style={{ width: `${Math.max(0, Math.min(100, 100 - remainingPercent))}%` }}
        />
      )}
    </div>
  );
};

export default ProgressBar;
