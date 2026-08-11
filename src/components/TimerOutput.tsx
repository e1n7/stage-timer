import { useEffect, useState } from 'react';

/**
 * Host-facing timer output view.
 * This is the page that opens in a new window/tab when the
 * "Output Links" button is clicked. It displays ONLY the current
 * timer value in large digits so the host on stage can read it.
 * It stays in sync with the dashboard via a BroadcastChannel, so
 * start/pause/reset/time changes made on the dashboard are
 * reflected here in real time.
 */

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
        if ('flash' in data) {
          setFlash(true);
          setTimeout(() => setFlash(false), 600);
        }
        if ('blackout' in data) setBlackout(data.blackout);
      };
      // Ask the dashboard for its current state so a late-joining
      // output window starts in sync.
      channel.postMessage({ type: 'handshake' });
    } catch {
      // BroadcastChannel unavailable; fall back to reading localStorage
      const stored = localStorage.getItem('timerState');
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          if (typeof parsed.seconds === 'number') setSeconds(parsed.seconds);
          if (typeof parsed.totalTime === 'number') setTotalTime(parsed.totalTime);
          if (typeof parsed.isRunning === 'boolean') setIsRunning(parsed.isRunning);
        } catch {
          /* ignore */
        }
      }
    }

    // If timer is running, update the display every second
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

  // Color derived from remaining time, matching the dashboard's
  // warning/danger thresholds (60s warning, 0s danger).
  const isDanger = seconds <= 0;
  const isWarning = seconds > 0 && seconds <= 60;

  const color = isDanger ? '#fa5252' : isWarning ? '#f08c00' : '#40c057';
  const textColor = isDanger ? '#fa5252' : '#ffffff';

  // Calculate progress bar widths
  const progress = Math.min(100, (seconds / Math.max(totalTime, 1)) * 100);
  const warningThreshold = 60;
  const dangerThreshold = 0;
  
  const safeWidth = Math.max(0, ((totalTime - warningThreshold) / totalTime) * 100);
  const warningWidth = Math.max(0, ((warningThreshold - dangerThreshold) / totalTime) * 100);
  const dangerWidth = Math.max(0, (dangerThreshold / totalTime) * 100);

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
        <>
          {/* Progress bar at the top */}
          <div className="w-full px-8 pt-8">
            <div className="h-2 w-full overflow-hidden rounded-sm border border-[#2a2a2a] bg-[#1c1c1c]">
              <div className="flex h-full">
                <div
                  className="bg-[#40c057] transition-all duration-300"
                  style={{ width: `${Math.min(safeWidth, progress)}%` }}
                />
                <div
                  className="bg-[#f08c00] transition-all duration-300"
                  style={{
                    width: `${Math.max(0, Math.min(warningWidth, progress - safeWidth))}%`,
                  }}
                />
                <div
                  className="bg-[#fa5252] transition-all duration-300"
                  style={{
                    width: `${Math.max(0, progress - safeWidth - warningWidth)}%`,
                  }}
                />
              </div>
            </div>
          </div>

          {/* Timer display */}
          <div className="flex-1 flex items-center justify-center">
            <div
              key={flash ? 'flash' : 'normal'}
              className="digit text-center select-none"
              style={{
                color: flash ? '#ffffff' : textColor,
                fontSize: 'min(65vw, 65vh)',
                fontWeight: 700,
                lineHeight: 1,
                fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
                fontVariantNumeric: 'tabular-nums',
                letterSpacing: '-0.02em',
                transition: flash ? 'none' : 'color 0.6s ease',
              }}
            >
              {formatClock(seconds)}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export { CHANNEL_NAME };
