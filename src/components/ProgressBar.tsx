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
 * A flexible progress bar that shows colored segments based on time thresholds.
 * The bar shrinks from left to right as time progresses (for countdowns),
 * meaning the "safe" (green) part disappears first, then "warning" (orange),
 * and finally "danger" (red).
 */
export const ProgressBar: React.FC<ProgressBarProps> = ({
  currentSeconds,
  totalSeconds,
  segments,
  className = '',
  height = 'h-4',
}) => {
  const safeTotal = Math.max(totalSeconds, 1);
  const progressPercent = (Math.max(0, currentSeconds) / safeTotal) * 100;

  // Sort segments by threshold descending (e.g., 60s, then 10s)
  const sortedSegments = [...segments].sort((a, b) => b.threshold - a.threshold);

  // We define the zones from 0 to totalSeconds
  // Zone 1: 0 to T_last (e.g., 0 to 10s) -> Color_last
  // Zone 2: T_last to T_prev (e.g., 10s to 60s) -> Color_prev
  // ...
  // Zone N: T_first to Total (e.g., 60s to 300s) -> Default Green

  const zones: { width: number; color: string }[] = [];
  let lastThreshold = 0;

  // Add segments from smallest threshold to largest
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

  // Add the remaining "safe" zone if any
  if (lastThreshold < safeTotal) {
    zones.push({
      width: ((safeTotal - lastThreshold) / safeTotal) * 100,
      color: '#22c55e' // Default Green
    });
  }

  // Reverse zones to display from Green (left) to Red (right)
  // Green is the largest threshold to Total
  // Red is 0 to smallest threshold
  const displayZones = [...zones].reverse();

  return (
    <div className={`relative w-full overflow-hidden bg-[#1c1c1c] ${height} ${className}`}>
      {/* The full timeline with all colors */}
      <div className="flex h-full w-full">
        {displayZones.map((zone, i) => (
          <div
            key={i}
            style={{ width: `${zone.width}%`, backgroundColor: zone.color }}
            className="h-full"
          />
        ))}
      </div>

      {/* The mask that hides the "elapsed" time from the left */}
      <div 
        className="absolute inset-0 bg-[#141414] transition-all duration-1000 ease-linear"
        style={{ 
          width: `${100 - progressPercent}%`,
          left: 0
        }}
      />
    </div>
  );
};
