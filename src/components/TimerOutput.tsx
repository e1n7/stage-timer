import { useEffect, useState } from 'react';
import { ProgressBar, ProgressSegment } from './ProgressBar';

const CHANNEL_NAME = 'stage-timer-sync';
const DEFAULT_TIME = 5 * 60; // 5 minutes

const formatClock = (seconds: number) => {
  const total = Math.max(0, seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  
  if (hours > 0) {
    return `${hours}:${pad(minutes)}:${pad(secs)}`;
  }
  return `${pad(minutes)}:${pad(secs)}`;
};

export const TimerOutput = () => {
  const [seconds, setSeconds] = useState<number>(DEFAULT_TIME);
  const [totalTime, setTotalTime] = useState<number>(DEFAULT_TIME);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [flash, setFlash] = useState<boolean>(false);
  const [blackout, setBlackout] = useState<boolean>(false);
  const [segments, setSegments] = useState<ProgressSegment[]>([
    { threshold: 60, color: '#f08c00' }, // Warning: Orange
    { threshold: 10, color: '#fa5252' }  // Danger: Red
  ]);

  useEffect(() => {
    let channel: BroadcastChannel | null = null;
    let timerInterval: number | null = null;

    try {
      channel = new BroadcastChannel(CHANNEL_NAME);
      channel.onmessage = (event) => {
        const data = event.data;
        if (!data || typeof data !== 'object') return;
        
        if ('seconds' in data) setSeconds(data.seconds);
        if ('totalTime' in data) setTotalTime(data.totalTime);
        if ('isRunning' in data) setIsRunning(data.isRunning);
        if ('segments' in data) setSegments(data.segments);
        if ('flash' in data) {
          setFlash(true);
          setTimeout(() => setFlash(false), 600);
        }
        if ('blackout' in data) setBlackout(data.blackout);
      };
      // Request current state
      channel.postMessage({ type: 'handshake' });
    } catch {
      // Fallback to localStorage if BroadcastChannel fails
      const stored = localStorage.getItem('timerState');
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          if (typeof parsed.seconds === 'number') setSeconds(parsed.seconds);
          if (typeof parsed.totalTime === 'number') setTotalTime(parsed.totalTime);
          if (typeof parsed.isRunning === 'boolean') setIsRunning(parsed.isRunning);
        } catch { /* ignore */ }
      }
      const storedSettings = localStorage.getItem('timerSettings');
      if (storedSettings) {
        try {
          const parsed = JSON.parse(storedSettings);
          if (parsed.segments) setSegments(parsed.segments);
        } catch { /* ignore */ }
      }
    }

    if (isRunning) {
      timerInterval = window.setInterval(() => {
        setSeconds(prev => Math.max(0, prev - 1));
      }, 1000);
    }

    return () => {
      channel?.close();
      if (timerInterval) clearInterval(timerInterval);
    };
  }, [isRunning]);

  // Determine text color based on thresholds
  const getTextColor = () => {
    if (flash) return '#ffffff';
    if (seconds <= 0) return '#fa5252';
    
    // Find matching segment color
    const sorted = [...segments].sort((a, b) => a.threshold - b.threshold);
    for (const seg of sorted) {
      if (seconds <= seg.threshold) return seg.color;
    }
    return '#ffffff';
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(err => {
        console.error(`Error attempting to enable full-screen mode: ${err.message}`);
      });
    } else {
      document.exitFullscreen();
    }
  };

  return (
    <div
      className="group relative flex h-screen w-screen flex-col items-center justify-center overflow-hidden bg-[#0a0a0a]"
      style={{
        transition: 'background-color 0.6s ease',
      }}
    >
      {/* Invisible Fullscreen Button */}
      <button 
        onClick={toggleFullscreen}
        className="absolute right-0 top-0 h-20 w-20 cursor-default opacity-0"
        aria-label="Toggle Fullscreen"
      />

      {blackout ? (
        <div className="h-full w-full bg-black" />
      ) : (
        <div className="flex w-full flex-col items-center px-[8vw]">
          {/* Timer display */}
          <div
            className="text-center font-bold tabular-nums tracking-tighter"
            style={{
              color: getTextColor(),
              fontSize: 'min(35vw, 50vh)',
              lineHeight: 0.9,
              fontFamily: 'Inter, system-ui, sans-serif',
              transition: flash ? 'none' : 'color 0.3s ease',
            }}
          >
            {formatClock(seconds)}
          </div>

          {/* Progress bar */}
          <div className="mt-[5vh] w-full">
            <ProgressBar 
              currentSeconds={seconds} 
              totalSeconds={totalTime} 
              segments={segments}
              height="h-[4vh]"
              className="rounded-md"
            />
          </div>
        </div>
      )}
    </div>
  );
};

export { CHANNEL_NAME };
