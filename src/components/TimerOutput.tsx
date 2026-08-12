import { useEffect, useState, useRef } from 'react';
import { ProgressBar, ProgressSegment } from './ProgressBar';

const CHANNEL_NAME = 'stage-timer-sync';
const DEFAULT_TIME = 5 * 60; // 5 minutes

const formatClock = (seconds: number) => {
  const total = Math.max(0, Math.floor(seconds));
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

  const syncStateRef = useRef({
    startTime: null as number | null,
    initialSeconds: DEFAULT_TIME,
    mode: 'countdown' as 'countdown' | 'countup' | 'time'
  });

  useEffect(() => {
    let channel: BroadcastChannel | null = null;
    let timerInterval: number | null = null;

    const updateFromData = (data: any) => {
      if (!data || typeof data !== 'object') return;
      
      if ('totalTime' in data) setTotalTime(data.totalTime);
      if ('segments' in data) setSegments(data.segments);
      if ('flash' in data) {
        setFlash(true);
        setTimeout(() => setFlash(false), 600);
      }
      if ('blackout' in data) setBlackout(data.blackout);

      // Core sync logic: use startTime as the single reference point
      if ('startTime' in data || 'initialSeconds' in data || 'isRunning' in data) {
        setIsRunning(!!data.isRunning);
        syncStateRef.current = {
          startTime: data.startTime,
          initialSeconds: data.initialSeconds ?? DEFAULT_TIME,
          mode: data.mode ?? 'countdown'
        };
        
        // Initial jump to correct time
        if (data.isRunning && data.startTime) {
          const elapsed = (Date.now() - data.startTime) / 1000;
          const next = data.mode === 'countdown' 
            ? Math.max(0, data.initialSeconds - elapsed)
            : data.initialSeconds + elapsed;
          setSeconds(Math.round(next * 10) / 10);
        } else {
          setSeconds(data.initialSeconds ?? DEFAULT_TIME);
        }
      }
    };

    try {
      channel = new BroadcastChannel(CHANNEL_NAME);
      channel.onmessage = (event) => updateFromData(event.data);
      channel.postMessage({ type: 'handshake' });
    } catch {
      const stored = localStorage.getItem('timerState');
      if (stored) {
        try {
          updateFromData(JSON.parse(stored));
        } catch { /* ignore */ }
      }
    }

    timerInterval = window.setInterval(() => {
      const { startTime, initialSeconds, mode } = syncStateRef.current;
      if (isRunning && startTime !== null) {
        const elapsed = (Date.now() - startTime) / 1000;
        setSeconds(() => {
          let next: number;
          if (mode === 'countdown') {
            next = initialSeconds - elapsed;
            return next <= 0 ? 0 : Math.round(next * 10) / 10;
          } else if (mode === 'countup') {
            next = initialSeconds + elapsed;
            return Math.round(next * 10) / 10;
          } else {
            return Date.now() / 1000;
          }
        });
      }
    }, 100);

    return () => {
      channel?.close();
      if (timerInterval) clearInterval(timerInterval);
    };
  }, [isRunning]);

  const getTextColor = () => {
    if (flash) return '#ffffff';
    const rounded = Math.floor(seconds);
    if (rounded <= 0) return '#fa5252';
    const sorted = [...segments].sort((a, b) => a.threshold - b.threshold);
    for (const seg of sorted) {
      if (rounded <= seg.threshold) return seg.color;
    }
    return '#ffffff';
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen();
    }
  };

  return (
    <div className="group relative flex h-screen w-screen flex-col items-center justify-center overflow-hidden bg-[#0a0a0a]" style={{ transition: 'background-color 0.6s ease' }}>
      <button onClick={toggleFullscreen} className="absolute right-0 top-0 h-20 w-20 cursor-default opacity-0" aria-label="Toggle Fullscreen" />
      {blackout ? (
        <div className="h-full w-full bg-black" />
      ) : (
        <div className="flex w-full flex-col items-center px-[8vw]">
          <div className="text-center font-bold tabular-nums tracking-tighter" style={{ color: getTextColor(), fontSize: 'min(35vw, 50vh)', lineHeight: 0.9, fontFamily: 'Inter, system-ui, sans-serif', transition: flash ? 'none' : 'color 0.3s ease' }}>
            {formatClock(seconds)}
          </div>
          <div className="mt-[5vh] w-full">
            <ProgressBar currentSeconds={seconds} totalSeconds={totalTime} segments={segments} height="h-[4vh]" className="rounded-md" />
          </div>
        </div>
      )}
    </div>
  );
};

export { CHANNEL_NAME };
