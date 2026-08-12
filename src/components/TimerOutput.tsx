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

  const startTimeRef = useRef<number | null>(null);
  const initialSecondsRef = useRef<number>(DEFAULT_TIME);

  useEffect(() => {
    let channel: BroadcastChannel | null = null;
    let timerInterval: number | null = null;

    try {
      channel = new BroadcastChannel(CHANNEL_NAME);
      channel.onmessage = (event) => {
        const data = event.data;
        if (!data || typeof data !== 'object') return;
        
        if ('totalTime' in data) setTotalTime(data.totalTime);
        if ('segments' in data) setSegments(data.segments);
        if ('flash' in data) {
          setFlash(true);
          setTimeout(() => setFlash(false), 600);
        }
        if ('blackout' in data) setBlackout(data.blackout);

        // Sync seconds and running state
        if ('seconds' in data || 'isRunning' in data) {
          const newSeconds = data.seconds ?? seconds;
          const newIsRunning = data.isRunning ?? isRunning;
          
          setSeconds(newSeconds);
          setIsRunning(newIsRunning);
          
          if (newIsRunning) {
            startTimeRef.current = Date.now();
            initialSecondsRef.current = newSeconds;
          } else {
            startTimeRef.current = null;
          }
        }
      };
      // Request current state
      channel.postMessage({ type: 'handshake' });
    } catch {
      // Fallback to localStorage
      const stored = localStorage.getItem('timerState');
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          if (typeof parsed.seconds === 'number') setSeconds(parsed.seconds);
          if (typeof parsed.totalTime === 'number') setTotalTime(parsed.totalTime);
          if (typeof parsed.isRunning === 'boolean') {
            setIsRunning(parsed.isRunning);
            if (parsed.isRunning) {
              startTimeRef.current = Date.now();
              initialSecondsRef.current = parsed.seconds;
            }
          }
        } catch { /* ignore */ }
      }
    }

    // High-precision local timer for smoothness and background reliability
    timerInterval = window.setInterval(() => {
      if (isRunning && startTimeRef.current !== null) {
        const elapsed = (Date.now() - startTimeRef.current) / 1000;
        setSeconds(() => {
          const next = initialSecondsRef.current - elapsed;
          return next <= 0 ? 0 : Math.round(next * 10) / 10;
        });
      }
    }, 100);

    return () => {
      channel?.close();
      if (timerInterval) clearInterval(timerInterval);
    };
  }, [isRunning]); // Re-run effect when running state changes to reset interval/refs

  // Determine text color based on thresholds
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
      style={{ transition: 'background-color 0.6s ease' }}
    >
      <button 
        onClick={toggleFullscreen}
        className="absolute right-0 top-0 h-20 w-20 cursor-default opacity-0"
        aria-label="Toggle Fullscreen"
      />

      {blackout ? (
        <div className="h-full w-full bg-black" />
      ) : (
        <div className="flex w-full flex-col items-center px-[8vw]">
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
