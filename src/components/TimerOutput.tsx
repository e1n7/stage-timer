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
  const [seconds, setSeconds] = useState<number>(5 * 60);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [flash, setFlash] = useState<boolean>(false);
  const [blackout, setBlackout] = useState<boolean>(false);

  useEffect(() => {
    let channel: BroadcastChannel | null = null;
    try {
      channel = new BroadcastChannel(CHANNEL_NAME);
      channel.onmessage = (event) => {
        const data = event.data;
        if (!data || typeof data !== 'object') return;
        if ('seconds' in data) setSeconds(data.seconds);
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
        } catch {
          /* ignore */
        }
      }
    }

    return () => {
      channel?.close();
    };
  }, []);

  // Color derived from remaining time, matching the dashboard's
  // warning/danger thresholds (60s warning, 0s danger).
  const isDanger = seconds <= 0;
  const isWarning = seconds > 0 && seconds <= 60;

  const color = isDanger ? '#fa5252' : isWarning ? '#f08c00' : '#40c057';
  const textColor = isDanger ? '#fa5252' : '#ffffff';

  return (
    <div
      className="flex h-screen w-screen items-center justify-center overflow-hidden bg-[#141414]"
      style={{
        transition: 'background-color 0.6s ease',
      }}
    >
      {blackout ? (
        <div className="h-full w-full bg-[#000000]" />
      ) : (
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
      )}
    </div>
  );
};

export { CHANNEL_NAME };
