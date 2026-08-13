import React from 'react';

export interface ProgressSegment {
  threshold: number; // seconds
  color: string;
}

interface ProgressBarProps {
  currentSeconds: number;
  totalSeconds: number;
  segments: ProgressSegment[];
  className?: string;
  height?: string;
}

/**
 * A flexible progress bar that shows colored segments based on time thresholds
 * and shrinks the remaining-time fill from RIGHT to LEFT as a countdown runs.
 *
 * Layout (countdown semantics, seconds remaining as `currentSeconds`):
 * - Full-length colored track: green = from largest threshold up to total,
 *   then orange/red warning zones closest to zero.
 * - A dark mask covers the RIGHT portion representing ELAPSED time, so the
 *   colored remaining portion starts at the left edge and visibly shrinks
 *   toward the right as the timer counts down.
 */
export const ProgressBar: React.FC<ProgressBarProps> = ({
  currentSeconds,
  totalSeconds,
  segments,
  className = '',
  height = 'h-4',
}) => {
  const safeTotal = Math.max(totalSeconds, 1);
  // Percentage of time REMAINING — the colored portion width.
  const remainingPercent = (Math.min(Math.max(currentSeconds, 0), safeTotal) / safeTotal) * 100;

  // Build color zones from 0 to totalSeconds, smallest threshold first.
  // The mask placed on the right keeps the visual reading consistent:
  // left edge = most remaining time, colors approach zero at the right.
  const zones: { width: number; color: string }[] = [];
  let lastThreshold = 0;

  const ascendingSegments = [...segments].sort((a, b) => a.threshold - b.threshold);

  for (const seg of ascendingSegments) {
    if (seg.threshold > lastThreshold) {
      zones.push({
        width: ((seg.threshold - lastThreshold) / safeTotal) * 100,
        color: seg.color
      });
      lastThreshold = seg.threshold;
    }
  }

  // Add the remaining "safe" zone from the largest threshold to total.
  if (lastThreshold < safeTotal) {
    zones.push({
      width: ((safeTotal - lastThreshold) / safeTotal) * 100,
      color: '#22c55e' // Default Green
    });
  }

  return (
    <div className={`relative w-full overflow-hidden bg-[#1c1c1c] ${height} ${className}`}>
      {/* The full colored timeline, green on the left (full time) to warning colors on the right (near zero) */}
      <div className="flex h-full w-full">
        {zones.map((zone, i) => (
          <div
            key={i}
            style={{ width: `${zone.width}%`, backgroundColor: zone.color }}
            className="h-full"
          />
        ))}
      </div>

      {/* The mask that covers the ELAPSED portion on the right side, so the
          colored remaining-time fill visibly shrinks as the timer counts down */}
      <div
        className="absolute inset-0 bg-[#141414] transition-all duration-1000 ease-linear"
        style={{
          width: `${100 - remainingPercent}%`,
          left: `${remainingPercent}%`
        }}
      />
    </div>
  );
};
