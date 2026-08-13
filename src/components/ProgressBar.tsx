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

  // Keep the original full-duration thresholds for reference, but anchor the
  // visible bar to the REMAINING window [0, currentSeconds] so the leftmost
  // edge is always green and warning colors only appear near the end.
  const viewTotal = Math.max(currentSeconds, 0);

  if (viewTotal > 0 && segments.length > 0) {
    // Scale each warning threshold proportionally to the remaining window.
    // Example: red at 10s of 600s total => 1.67% of remaining width. This way
    // the bar always starts green at the left, with orange/red shrinking toward
    // the right edge as the countdown approaches zero.
    const scaledSegments = segments
      .map(seg => ({ ...seg, threshold: Math.max(0, (seg.threshold / safeTotal) * viewTotal) }))
      .sort((a, b) => b.threshold - a.threshold);

    let last = viewTotal;

    // Green zone from the remaining window down to the largest scaled threshold.
    if (scaledSegments.length > 0 && scaledSegments[0].threshold < last) {
      zones.push({
        width: ((last - scaledSegments[0].threshold) / viewTotal) * 100,
        color: '#22c55e'
      });
      last = scaledSegments[0].threshold;
    }

    // Warning zones moving toward zero, largest scaled threshold first.
    for (const seg of scaledSegments) {
      if (seg.threshold < last) {
        zones.push({
          width: ((last - seg.threshold) / viewTotal) * 100,
          color: seg.color
        });
        last = seg.threshold;
      }
    }

    // Red zone from the smallest scaled threshold down to zero.
    if (last > 0) {
      zones.push({
        width: (last / viewTotal) * 100,
        color: '#fa5252'
      });
    }
  } else {
    // No time left to display — full bar is red (overtime).
    zones.push({ width: 100, color: '#fa5252' });
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
