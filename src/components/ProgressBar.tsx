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
 * Countdown progress bar that reads GREEN -> ORANGE -> RED from LEFT to RIGHT,
 * and diminishes from the GREEN (left) side as time runs out:
 *
 *   Full time : [GREEN ..................|ORANGE|RED]   (left edge = full time)
 *   Near zero :                              [RED]
 *
 * The rightmost edge is always the "zero" end (red). As the countdown runs,
 * the colored fill shrinks rightward — the green portion disappears first —
 * until only the red zone remains at the right end, then the bar empties.
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

  // The colored track spans the full bar width, ordered left-to-right:
  // green first (full time), then warning zones in descending threshold
  // order, ending with red at the far right (zero).
  const zones: { width: number; color: string }[] = [];

  const descendingSegments = [...segments].sort((a, b) => b.threshold - a.threshold);

  // Build zones left-to-right (green first, red last). The fill div is
  // right-anchored, so the first child (green) sits at the left edge of
  // the visible fill and red/orange end up at the right end of the fill.
  const zoneWidths: { width: number; color: string }[] = [];

  let lastThreshold = safeTotal;

  // Green zone from total down to the largest warning threshold.
  if (descendingSegments.length > 0) {
    zoneWidths.push({
      width: ((lastThreshold - descendingSegments[0].threshold) / safeTotal) * 100,
      color: '#22c55e'
    });
    lastThreshold = descendingSegments[0].threshold;
  }

  // Warning zones moving toward zero, largest threshold first.
  for (const seg of descendingSegments) {
    if (seg.threshold < lastThreshold) {
      zoneWidths.push({
        width: ((lastThreshold - seg.threshold) / safeTotal) * 100,
        color: seg.color
      });
      lastThreshold = seg.threshold;
    }
  }

  // Red zone from the smallest threshold down to zero (rightmost).
  if (lastThreshold > 0) {
    zoneWidths.push({
      width: (lastThreshold / safeTotal) * 100,
      color: '#fa5252'
    });
  }

  zones.push(...zoneWidths);

  // Overtime: nothing remaining — full bar red.
  const overtime = currentSeconds < 0;

  return (
    <div className={`relative w-full overflow-hidden bg-[#1c1c1c] ${height} ${className}`}>
      {/* The full colored timeline: green on the left -> red on the right.
          The visible portion is anchored to the RIGHT (the zero end), so the
          fill visibly diminishes from the left (green disappears first). */}
      <div
        className="absolute right-0 top-0 flex h-full"
        style={{ width: `${Math.min(100, remainingPercent)}%` }}
      >
        {zones.map((zone, i) => (
          <div
            key={i}
            style={{ width: `${zone.width}%`, backgroundColor: zone.color }}
            className="h-full"
          />
        ))}
      </div>
    </div>
  );
};
