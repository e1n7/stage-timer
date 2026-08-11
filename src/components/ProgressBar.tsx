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

export const ProgressBar: React.FC<ProgressBarProps> = ({
  currentSeconds,
  totalSeconds,
  segments,
  className = '',
  height = 'h-4',
}) => {
  // Sort segments by threshold descending (e.g., 60s, then 10s)
  const sortedSegments = [...segments].sort((a, b) => b.threshold - a.threshold);
  
  const progressPercent = (currentSeconds / Math.max(totalSeconds, 1)) * 100;

  // We want to render a bar that is divided into segments.
  // The total width is totalSeconds.
  // Segment 1 (Safe): from totalSeconds down to sortedSegments[0].threshold
  // Segment 2: from sortedSegments[0].threshold down to sortedSegments[1].threshold
  // ...
  // Last Segment: from sortedSegments[last].threshold down to 0
  
  const barSegments = [];
  let currentTop = totalSeconds;

  // Safe segment (Green)
  const firstThreshold = sortedSegments.length > 0 ? sortedSegments[0].threshold : 0;
  if (currentTop > firstThreshold) {
    barSegments.push({
      width: ((currentTop - firstThreshold) / totalSeconds) * 100,
      color: '#40c057', // Green
      startPercent: (firstThreshold / totalSeconds) * 100,
      endPercent: (currentTop / totalSeconds) * 100
    });
    currentTop = firstThreshold;
  }

  // Warning/Danger segments
  for (let i = 0; i < sortedSegments.length; i++) {
    const threshold = sortedSegments[i].threshold;
    const nextThreshold = i + 1 < sortedSegments.length ? sortedSegments[i + 1].threshold : 0;
    
    if (threshold > nextThreshold) {
      barSegments.push({
        width: ((threshold - nextThreshold) / totalSeconds) * 100,
        color: sortedSegments[i].color,
        startPercent: (nextThreshold / totalSeconds) * 100,
        endPercent: (threshold / totalSeconds) * 100
      });
    }
    currentTop = nextThreshold;
  }

  // If there's still space down to 0 (e.g. if the last threshold wasn't 0)
  if (currentTop > 0) {
      // This part would normally be covered by the last segment's color if threshold was 0.
      // But if not, we can default it to the last segment's color or a default red.
      const lastColor = sortedSegments.length > 0 ? sortedSegments[sortedSegments.length - 1].color : '#fa5252';
      barSegments.push({
          width: (currentTop / totalSeconds) * 100,
          color: lastColor,
          startPercent: 0,
          endPercent: (currentTop / totalSeconds) * 100
      });
  }

  return (
    <div className={`w-full overflow-hidden rounded-sm bg-[#1c1c1c] ${height} ${className}`}>
      <div className="relative h-full w-full flex">
        {barSegments.map((seg, i) => {
          // How much of this segment is "active" (remaining time)
          // progressPercent is 0 to 100
          const activeWidth = Math.min(seg.width, Math.max(0, progressPercent - seg.startPercent));
          const activePercent = (activeWidth / seg.width) * 100;

          return (
            <div 
              key={i} 
              style={{ width: `${seg.width}%` }} 
              className="h-full bg-[#2a2a2a] relative"
            >
              <div 
                className="h-full transition-all duration-300"
                style={{ 
                  width: `${activePercent}%`,
                  backgroundColor: seg.color 
                }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
};
