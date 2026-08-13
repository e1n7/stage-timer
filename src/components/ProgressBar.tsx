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
 * A countdown progress bar whose colored fill grows from the LEFT edge and
 * shrinks toward the right as time runs out (matching a "fill bar" reading).
 *
 * Layout:
 * - Left edge = most remaining time (green), then warning colors (orange,
 *   red) at the RIGHT end of the colored fill, in order toward zero.
 * - The dark area on the right represents elapsed time.
 * - As the countdown runs, the whole fill visibly shrinks from right to left,
 *   so the bar always reads green-first at the left with the warning sliver
 *   at the leading (right) edge of the fill.
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

  // Build the colored zones across the FULL timeline [0, totalSeconds],
  // ordered left-to-right as: green (from total down to the largest warning
  // threshold), then warning zones in descending threshold order, ending
  // with red at the far right (zero). The visible fill is the leftmost
  // `remainingPercent`, so it always starts green at the left and the
  // orange/red sliver sits at the right end of the fill.
  const zones: { width: number; color: string }[] = [];

  const descendingSegments = [...segments].sort((a, b) => b.threshold - a.threshold);

  let lastThreshold = safeTotal;

  // Green zone from total down to the largest warning threshold.
  if (descendingSegments.length > 0) {
    zones.push({
      width: ((lastThreshold - descendingSegments[0].threshold) / safeTotal) * 100,
      color: '#22c55e'
    });
    lastThreshold = descendingSegments[0].threshold;
  }

  // Warning zones moving toward zero, largest threshold first.
  for (const seg of descendingSegments) {
    if (seg.threshold < lastThreshold) {
      zones.push({
        width: ((lastThreshold - seg.threshold) / safeTotal) * 100,
        color: seg.color
      });
      lastThreshold = seg.threshold;
    }
  }

  // Red zone from the smallest threshold down to zero.
  if (lastThreshold > 0) {
    zones.push({
      width: (lastThreshold / safeTotal) * 100,
      color: '#fa5252'
    });
  }

  // Overtime: nothing remaining — fill the whole bar red.
  const overtime = currentSeconds < 0;
  if (overtime) {
    zones.length = 0;
    zones.push({ width: 100, color: '#fa5252' });
  }

  return (
    <div className={`relative w-full overflow-hidden bg-[#1c1c1c] ${height} ${className}`}>
      {/* The full colored timeline: green on the left -> warning colors on the right */}
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
