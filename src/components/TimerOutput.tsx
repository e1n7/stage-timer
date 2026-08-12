import { useEffect, useState, useRef } from 'react';
import { ProgressBar, ProgressSegment } from './ProgressBar';

const CHANNEL_NAME = 'stage-timer-sync';
const DEFAULT_TIME = 0;

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
  const [isFlashing, setIsFlashing] = useState<boolean>(false);
  const [blackout, setBlackout] = useState<boolean>(false);
  const [isEmpty, setIsEmpty] = useState<boolean>(false);
  const [segments, setSegments] = useState<ProgressSegment[]>([
    { threshold: 60, color: '#f08c00' },
    { threshold: 10, color: '#fa5252' }
  ]);

  const syncStateRef = useRef({
    startTime: null as number | null,
    initialSeconds: DEFAULT_TIME,
    mode: 'countdown' as 'countdown' | 'countup' | 'time',
    lastUpdated: 0,
    isRunning: false,
    isEmpty: false
  });

  useEffect(() => {
    let channel: BroadcastChannel | null = null;

    const updateFromData = (data: any) => {
      if (!data || typeof data !== 'object') return;
      
      if ('blackout' in data) setBlackout(!!data.blackout);
      if ('flash' in data && data.flash) {
        setIsFlashing(true);
        let count = 0;
        const interval = setInterval(() => {
          setFlash(prev => !prev);
          count++;
          if (count >= 6) {
            clearInterval(interval);
            setFlash(false);
            setIsFlashing(false);
          }
        }, 150);
      }

      if ('isEmpty' in data) {
        setIsEmpty(!!data.isEmpty);
        syncStateRef.current.isEmpty = !!data.isEmpty;
      }

      if ('totalTime' in data) setTotalTime(data.totalTime);
      if ('segments' in data) setSegments(data.segments);

      if ('startTime' in data || 'initialSeconds' in data || 'isRunning' in data) {
        if (data.type === 'force-sync' || (data.lastUpdated || 0) >= syncStateRef.current.lastUpdated) {
          const newIsRunning = !!data.isRunning;
          setIsRunning(newIsRunning);
          syncStateRef.current = {
            ...syncStateRef.current,
            startTime: data.startTime,
            initialSeconds: data.initialSeconds ?? DEFAULT_TIME,
            mode: data.mode ?? 'countdown',
            lastUpdated: data.lastUpdated || Date.now(),
            isRunning: newIsRunning
          };
          
          if (newIsRunning && data.startTime) {
            const elapsed = (Date.now() - data.startTime) / 1000;
            const next = data.mode === 'countdown' 
              ? Math.max(0, data.initialSeconds - elapsed)
              : data.initialSeconds + elapsed;
            setSeconds(Math.round(next * 10) / 10);
          } else {
            setSeconds(data.initialSeconds ?? DEFAULT_TIME);
          }
        }
      }
    };

    try {
      channel = new BroadcastChannel(CHANNEL_NAME);
      channel.onmessage = (event) => updateFromData(event.data);
      channel.postMessage({ type: 'handshake' });
    } catch { /* ignore */ }

    const storageSync = () => {
      const stored = localStorage.getItem('timerState');
      if (stored) {
        try {
          updateFromData(JSON.parse(stored));
        } catch { /* ignore */ }
      }
    };
    
    window.addEventListener('storage', storageSync);
    storageSync();

    return () => {
      channel?.close();
      window.removeEventListener('storage', storageSync);
    };
  }, []);

  useEffect(() => {
    const tick = () => {
      const { isRunning: syncIsRunning, startTime, initialSeconds, mode, isEmpty: syncIsEmpty } = syncStateRef.current;
      if (syncIsEmpty) {
        setSeconds(0);
        return;
      }
      
      if (syncIsRunning && startTime !== null) {
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
      } else {
        setSeconds(initialSeconds);
      }
    };

    const interval = setInterval(tick, 100);
    return () => clearInterval(interval);
  }, [isRunning]);

  const getTextColor = () => {
    if (isEmpty) return '#000000'; // Invisible or black in empty state
    const rounded = Math.floor(seconds);
    if (rounded <= 0) return '#fa5252';
    const sorted = [...segments].sort((a, b) => a.threshold - b.threshold);
    for (const seg of sorted) {
      if (rounded <= seg.threshold) return seg.color;
    }
    return '#ffffff';
  };

  const getGlowColor = () => {
    const color = getTextColor();
    if (color === '#ffffff') return 'rgba(255, 255, 255, 0.3)';
    if (color === '#fa5252') return 'rgba(250, 82, 82, 0.4)';
    if (color === '#f08c00') return 'rgba(240, 140, 0, 0.4)';
    if (color === '#22c55e') return 'rgba(34, 197, 94, 0.4)';
    return 'transparent';
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen();
    }
  };

  return (
    <div 
      className="group relative flex h-screen w-screen flex-col items-center justify-center overflow-hidden transition-all duration-300" 
      style={{ backgroundColor: '#0a0a0a' }}
    >
      <button onClick={toggleFullscreen} className="absolute right-0 top-0 h-20 w-20 cursor-default opacity-0" aria-label="Toggle Fullscreen" />
      {blackout || isEmpty ? (
        <div className="h-full w-full bg-black" />
      ) : (
        <div className="flex w-full flex-col items-center px-[8vw]">
          <div 
            className="text-center font-bold tabular-nums tracking-tighter transition-all duration-75" 
            style={{ 
              color: getTextColor(), 
              fontSize: 'min(35vw, 50vh)', 
              lineHeight: 0.9, 
              fontFamily: 'Inter, system-ui, sans-serif',
              opacity: (isFlashing && !flash) ? 0 : 1,
              textShadow: flash ? `0 0 60px ${getGlowColor()}` : 'none'
            }}
          >
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
