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
    { threshold: 60, color: '#f08c00' },
    { threshold: 10, color: '#fa5252' }
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
      channel.postMessage({ type: 'handshake' });
    } catch {
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

  const isDanger = seconds <= 0;
  const textColor = isDanger ? '#fa5252' : '#ffffff';

  return (
    <div
      className="flex h-screen w-screen flex-col items-center justify-center overflow-hidden bg-[#141414]"
      style={{
        transition: 'background-color 0.6s ease',
      }}
    >
      {blackout ? (
        <div className="h-full w-full bg-[#000000]" />
      ) : (
        <div className="flex flex-col items-center w-full px-[5vw]">
          {/* Timer display on top */}
          <div
            key={flash ? 'flash' : 'normal'}
            className="digit text-center select-none font-bold"
            style={{
              color: flash ? '#ffffff' : textColor,
              fontSize: 'min(45vw, 60vh)',
              lineHeight: 1.1,
              fontFamily: "Inter, system-ui, -apple-system, sans-serif",
              fontVariantNumeric: 'tabular-nums',
              letterSpacing: '-0.02em',
              transition: flash ? 'none' : 'color 0.6s ease',
            }}
          >
            {formatClock(seconds)}
          </div>

          {/* Progress bar below the timer */}
          <div className="w-full mt-4">
            <ProgressBar 
              currentSeconds={seconds} 
              totalSeconds={totalTime} 
              segments={segments}
              height="h-[6vh]"
              className="rounded-lg border-none"
            />
          </div>
        </div>
      )}
    </div>
  );
};

export { CHANNEL_NAME };
