import { useEffect, useState } from 'react';
import { useTimer } from './hooks/useTimer';
import { ProgressBar } from './components/ProgressBar';

const pad = (value: number) => value.toString().padStart(2, '0');

const formatClock = (seconds: number) => {
  const total = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(total / 60);
  const secs = total % 60;
  return `${pad(minutes)}:${pad(secs)}`;
};

const CHANNEL_NAME = 'stage-timer-sync';
const DECREASE_OPTIONS = [-2, -5, -10, -20, -30];
const INCREASE_OPTIONS = [2, 5, 10, 20, 30];

// SVG Icons
const IconChevronDown = () => (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M7 10l5 5 5-5H7z"/></svg>
);
const IconSkipBack = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/></svg>
);
const IconSkipForward = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M6 18l8.5-6L6 6zm9-12h2v12h-2z"/></svg>
);
const IconPlay = ({ className = "" }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className={className}><path d="M8 5v14l11-7z"/></svg>
);
const IconPause = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
);
const IconSettings = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2 2.01 2.01 0 0 1-2.02 2 2 2 0 0 0-2 2 2.01 2.01 0 0 1-2 2.02 2 2 0 0 0-2 2v.44a2 2 0 0 0 2 2 2.01 2.01 0 0 1 2.02 2 2 2 0 0 0 2 2 2.01 2.01 0 0 1 2 2.02 2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2 2.01 2.01 0 0 1 2.02-2 2 2 0 0 0 2-2 2.01 2.01 0 0 1 2-2.02 2 2 0 0 0 2-2v-.44a2 2 0 0 0-2-2 2.01 2.01 0 0 1-2.02-2 2 2 0 0 0-2-2 2.01 2.01 0 0 1-2-2.02 2 2 0 0 0-2-2Z"/><circle cx="12" cy="12" r="3"/></svg>
);
const IconLock = ({ className = "" }) => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
);
const IconExternalLink = ({ className = "" }) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
);

interface TimeAdjustMenuProps {
  direction: 'decrease' | 'increase';
  onSelect: (minutes: number) => void;
}

const TimeAdjustMenu = ({ direction, onSelect }: TimeAdjustMenuProps) => {
  const options = direction === 'decrease' ? DECREASE_OPTIONS : INCREASE_OPTIONS;

  return (
    <div className={`absolute bottom-full z-20 mb-2 w-28 rounded-md border border-[#444] bg-[#242424] p-1 shadow-xl ${direction === 'decrease' ? 'left-0' : 'right-0'}`}>
      <div className="px-2 py-1 text-[10px] uppercase tracking-wide text-[#777]">
        {direction === 'decrease' ? 'Subtract time' : 'Add time'}
      </div>
      {options.map((minutes) => (
        <button
          key={minutes}
          type="button"
          onClick={() => onSelect(minutes)}
          className="block w-full rounded px-2 py-1.5 text-left text-[12px] text-white hover:bg-[#383838]"
        >
          {direction === 'decrease' ? `${minutes}m` : `+${minutes}m`}
        </button>
      ))}
    </div>
  );
};

interface TimerSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: any;
  updateSettings: (s: any) => void;
}

const TimerSettingsModal = ({ isOpen, onClose, settings, updateSettings }: TimerSettingsModalProps) => {
  if (!isOpen) return null;

  const yellowSegment = settings.segments.find((s: any) => s.color === '#f08c00') || { threshold: 60, color: '#f08c00' };
  const redSegment = settings.segments.find((s: any) => s.color === '#fa5252') || { threshold: 10, color: '#fa5252' };

  const formatMMSS = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${pad(m)} : ${pad(s)}`;
  };

  const parseMMSS = (val: string) => {
    const parts = val.split(':').map(p => parseInt(p.trim()) || 0);
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    return 0;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md">
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-lg border border-[#333] bg-[#1a1a1a] p-6 shadow-2xl custom-scrollbar">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between border-b border-[#333] pb-4">
          <div className="flex items-center gap-3">
            <div className="rounded bg-[#2d2d2d] p-2 text-white"><IconSettings /></div>
            <h2 className="text-lg font-bold text-white">Settings for Timer 1 »Timer 1«</h2>
          </div>
          <button onClick={onClose} className="text-xl text-[#8a8a8a] hover:text-white">✕</button>
        </div>

        {/* Basic Info */}
        <div className="space-y-4">
          <div className="flex gap-4">
            <label className="w-20 text-[13px] text-[#8a8a8a] pt-2">Title</label>
            <input 
              type="text" 
              value={settings.title || 'Timer 1'}
              onChange={(e) => updateSettings({ title: e.target.value })}
              className="flex-1 rounded border border-[#333] bg-[#141414] px-3 py-2 text-[14px] text-white focus:border-[#444] focus:outline-none"
            />
          </div>
          <div className="flex gap-4">
            <label className="w-20 text-[13px] text-[#8a8a8a] pt-2">Speaker</label>
            <input 
              type="text" 
              placeholder="Speaker (optional)"
              value={settings.speaker || ''}
              onChange={(e) => updateSettings({ speaker: e.target.value })}
              className="flex-1 rounded border border-[#333] bg-[#141414] px-3 py-2 text-[14px] text-white focus:border-[#444] focus:outline-none"
            />
          </div>
          <div className="flex gap-4">
            <label className="w-20 text-[13px] text-[#8a8a8a] pt-2">Notes</label>
            <textarea 
              placeholder="Notes (optional)"
              value={settings.notes || ''}
              onChange={(e) => updateSettings({ notes: e.target.value })}
              className="flex-1 h-24 rounded border border-[#333] bg-[#141414] px-3 py-2 text-[14px] text-white focus:border-[#444] focus:outline-none resize-none"
            />
          </div>
          <div className="flex gap-4">
            <label className="w-20 text-[13px] text-[#8a8a8a] pt-1">Labels</label>
            <button className="rounded border border-[#333] bg-[#2d2d2d] px-3 py-1 text-[12px] text-white hover:bg-[#383838]">
              + Add label
            </button>
          </div>
        </div>

        <div className="my-8 border-t border-[#333]" />

        {/* Start & Duration */}
        <div className="grid grid-cols-2 gap-12">
          <div className="space-y-4">
            <h3 className="text-[14px] font-bold text-white">Start</h3>
            <select className="w-full rounded border border-[#333] bg-[#141414] px-3 py-2 text-[14px] text-white focus:outline-none">
              <option>Manual</option>
            </select>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[12px] text-[#8a8a8a]">Time ⓘ</span>
              <div className="flex flex-1 items-center justify-between rounded border border-[#333] bg-[#2d2d2d] px-3 py-1.5 text-[13px] text-[#8a8a8a]">
                <span>Select time</span>
                <span>🕒</span>
              </div>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[12px] text-[#8a8a8a]">Date ⓘ</span>
              <div className="flex flex-1 items-center justify-between rounded border border-[#333] bg-[#2d2d2d] px-3 py-1.5 text-[13px] text-[#8a8a8a]">
                <span>Select date</span>
                <span>📅</span>
              </div>
            </div>
            <p className="text-[11px] text-[#666]">No start time given. Triggered manually.</p>
          </div>

          <div className="space-y-4">
            <h3 className="text-[14px] font-bold text-white">Duration</h3>
            <select className="w-full rounded border border-[#333] bg-[#141414] px-3 py-2 text-[14px] text-white focus:outline-none">
              <option>Duration</option>
            </select>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[12px] text-[#8a8a8a]">Duration ⓘ</span>
              <div className="flex flex-1 items-center justify-center gap-2 rounded border border-[#333] bg-[#141414] px-3 py-1.5 text-[14px] font-mono text-white">
                <span>00</span> : <span>10</span> : <span>00</span>
              </div>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[12px] text-[#8a8a8a]">Appearance</span>
              <select className="flex-1 rounded border border-[#333] bg-[#141414] px-3 py-1.5 text-[13px] text-white focus:outline-none">
                <option>Countdown</option>
              </select>
            </div>
            <div className="flex justify-end">
              <button className="text-[11px] text-[#4a9eff] hover:underline">Apply to all</button>
            </div>
            <p className="text-[11px] text-[#666]">Counting down from 10 mins.</p>
          </div>
        </div>

        <div className="my-8 border-t border-[#333]" />

        {/* Wrap-up times & actions */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h3 className="text-[14px] font-bold text-white">Wrap-up times & actions</h3>
              <span className="text-[12px] text-[#666]">ⓘ Chimes caveats</span>
            </div>
            <button className="rounded border border-[#333] bg-[#2d2d2d] px-3 py-1 text-[12px] text-[#8a8a8a] hover:text-white">
              Actions <IconChevronDown />
            </button>
          </div>

          <div className="h-2 w-full overflow-hidden rounded-full bg-[#333]">
            <div className="flex h-full w-full">
              <div className="h-full w-[80%] bg-[#22c55e]" />
              <div className="h-full w-[15%] bg-[#f08c00]" />
              <div className="h-full w-[5%] bg-[#fa5252]" />
            </div>
          </div>

          <div className="space-y-6 pt-2">
            {/* Start */}
            <div className="flex items-center gap-4">
              <div className="h-3 w-3 rounded-full bg-[#22c55e]" />
              <span className="w-16 text-[13px] text-[#8a8a8a]">Start</span>
              <select className="w-32 rounded border border-[#333] bg-[#141414] px-2 py-1 text-[12px] text-[#8a8a8a]">
                <option>None</option>
              </select>
              <button className="text-[#8a8a8a]">🔊</button>
              <select className="rounded border border-[#333] bg-[#141414] px-2 py-1 text-[12px] text-[#8a8a8a]">
                <option>Flash ×0 ▾</option>
              </select>
            </div>

            {/* Yellow */}
            <div className="flex items-center gap-4">
              <div className="h-3 w-3 rounded-full bg-[#f08c00]" />
              <span className="w-16 text-[13px] text-white">Yellow</span>
              <input 
                type="text" 
                value={formatMMSS(yellowSegment.threshold)}
                onChange={(e) => {
                  const val = parseMMSS(e.target.value);
                  const newSegments = settings.segments.map((s: any) => 
                    s.color === '#f08c00' ? { ...s, threshold: val } : s
                  );
                  updateSettings({ segments: newSegments });
                }}
                className="w-24 rounded border border-[#333] bg-[#141414] px-2 py-1 text-center font-mono text-[14px] text-white focus:outline-none"
              />
              <select className="w-32 rounded border border-[#333] bg-[#141414] px-2 py-1 text-[12px] text-[#8a8a8a]">
                <option>None</option>
              </select>
              <button className="text-[#8a8a8a]">🔊</button>
              <select className="rounded border border-[#333] bg-[#141414] px-2 py-1 text-[12px] text-[#8a8a8a]">
                <option>Flash ×0 ▾</option>
              </select>
            </div>

            {/* Red */}
            <div className="flex items-center gap-4">
              <div className="h-3 w-3 rounded-full bg-[#fa5252]" />
              <span className="w-16 text-[13px] text-white">Red</span>
              <input 
                type="text" 
                value={formatMMSS(redSegment.threshold)}
                onChange={(e) => {
                  const val = parseMMSS(e.target.value);
                  const newSegments = settings.segments.map((s: any) => 
                    s.color === '#fa5252' ? { ...s, threshold: val } : s
                  );
                  updateSettings({ segments: newSegments });
                }}
                className="w-24 rounded border border-[#333] bg-[#141414] px-2 py-1 text-center font-mono text-[14px] text-white focus:outline-none"
              />
              <select className="w-32 rounded border border-[#333] bg-[#141414] px-2 py-1 text-[12px] text-[#8a8a8a]">
                <option>None</option>
              </select>
              <button className="text-[#8a8a8a]">🔊</button>
              <select className="rounded border border-[#333] bg-[#141414] px-2 py-1 text-[12px] text-[#8a8a8a]">
                <option>Flash ×0 ▾</option>
              </select>
            </div>

            {/* 0:00 */}
            <div className="flex items-center gap-4">
              <div className="h-3 w-3 rounded-full bg-[#666]" />
              <span className="w-16 text-[13px] text-[#8a8a8a]">0:00</span>
              <select className="ml-[108px] w-32 rounded border border-[#333] bg-[#141414] px-2 py-1 text-[12px] text-[#8a8a8a]">
                <option>None</option>
              </select>
              <button className="text-[#8a8a8a]">🔊</button>
              <select className="rounded border border-[#333] bg-[#141414] px-2 py-1 text-[12px] text-[#8a8a8a]">
                <option>Flash ×0 ▾</option>
              </select>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-12 flex gap-4">
          <button 
            onClick={onClose}
            className="flex-1 rounded border border-[#333] bg-[#2d2d2d] py-3 text-[14px] font-bold text-white hover:bg-[#383838]"
          >
            Cancel
          </button>
          <button 
            onClick={onClose}
            className="flex-1 rounded border border-[#228b3a] bg-[#141414] py-3 text-[14px] font-bold text-[#22c55e] hover:bg-[#1a1a1a]"
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
};

function App() {
  const {
    seconds,
    isRunning,
    DEFAULT_TIME,
    setTime,
    startTimer,
    pauseTimer,
    resetTimer,
    settings,
    updateSettings,
    colorClass,
    wallClock,
    timeZone,
    cueFinish,
    overUnder,
  } = useTimer();

  const [openAdjustMenu, setOpenAdjustMenu] = useState<'decrease' | 'increase' | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const currentTime = formatClock(seconds);

  const adjustTime = (delta: number) => {
    setTime(Math.max(0, seconds + delta));
  };

  const handleMenuSelection = (minutes: number) => {
    adjustTime(minutes * 60);
    setOpenAdjustMenu(null);
  };

  const syncOutput = (payload: Record<string, unknown>) => {
    try {
      const channel = new BroadcastChannel(CHANNEL_NAME);
      channel.postMessage(payload);
      channel.close();
    } catch { /* ignore */ }
    try {
      localStorage.setItem('timerState', JSON.stringify({ seconds, isRunning, totalTime: DEFAULT_TIME }));
    } catch { /* ignore */ }
  };

  useEffect(() => {
    syncOutput({ seconds, isRunning, totalTime: DEFAULT_TIME, segments: settings.segments });
  }, [seconds, isRunning, DEFAULT_TIME, settings.segments]);

  useEffect(() => {
    let channel: BroadcastChannel | null = null;
    try {
      channel = new BroadcastChannel(CHANNEL_NAME);
      channel.onmessage = (event) => {
        if (event.data?.type === 'handshake') {
          channel?.postMessage({ seconds, isRunning, totalTime: DEFAULT_TIME, segments: settings.segments });
        }
      };
    } catch { /* ignore */ }
    return () => channel?.close();
  }, [seconds, isRunning, DEFAULT_TIME, settings.segments]);

  const openOutput = () => {
    window.open('/output', '_blank');
  };

  return (
    <div className="flex h-screen flex-col bg-[#1a1a1a] text-white antialiased">
      {/* Top bar */}
      <header className="flex items-center justify-between px-3 py-2 border-b border-[#333]">
        <div className="text-[20px] font-bold text-[#8a8a8a]">Unnamed</div>
        <div className="flex items-center gap-2">
          <button type="button" className="flex h-9 items-center gap-2 rounded-md bg-[#2d2d2d] px-4 text-[13px] text-white">Room <IconChevronDown /></button>
          <button type="button" className="flex h-9 items-center gap-2 rounded-md border border-[#444] bg-[#2d2d2d] px-4 text-[13px] text-white shadow-sm"><IconLock className="mr-1" /> Save</button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Left: Dashboard panel */}
        <aside className="flex w-[420px] flex-col border-r border-[#333] px-4 py-3">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[17px] font-bold text-white">Dashboard</h2>
            <div className="flex items-center gap-2">
              <button type="button" className="flex h-8 w-12 items-center justify-center rounded-md bg-[#2d2d2d] text-white"><IconChevronDown /></button>
              <button type="button" onClick={openOutput} className="flex h-8 items-center gap-2 rounded-md border border-[#444] bg-[#2d2d2d] px-3 text-[12px] text-white hover:bg-[#383838]"><IconExternalLink className="mr-1" /> Output Links</button>
            </div>
          </div>

          {/* DASHBOARD PREVIEW CARD */}
          <div className="rounded-lg border border-[#333] bg-[#141414] p-4 shadow-xl">
            <div className="flex items-center justify-between text-[12px]">
              <div className="flex items-center gap-1.5 text-[#22c55e]">
                <div className="h-3.5 w-3.5 rounded-full border-2 border-[#22c55e] flex items-center justify-center"><div className="h-1 w-1 bg-[#22c55e] rounded-full"></div></div>
                <span className="font-bold tracking-tight">stagetimer.io</span>
              </div>
              <span className="font-bold text-[#7eb8ff]">{settings.title || 'Timer 1'}</span>
            </div>
            
            <div 
              className="digit mt-2 text-center text-[110px] font-bold leading-none tracking-tighter transition-colors duration-300"
              style={{ color: colorClass === '#22c55e' ? '#ffffff' : colorClass }}
            >
              {currentTime}
            </div>

            <ProgressBar 
              currentSeconds={seconds} 
              totalSeconds={DEFAULT_TIME || 600} 
              segments={settings.segments} 
              height="h-6"
              className="mt-3 rounded-sm"
            />

            <div className="mt-4 flex items-center gap-4 text-[13px]">
              <span className="inline-block rounded border border-[#333] px-2 py-[2px] text-[10px] font-bold tracking-wider text-[#8a8a8a]">ON AIR</span>
              <div className="flex items-center gap-2 text-white">
                <div className="h-2 w-2 rounded-full bg-[#444]"></div>
                <span className="font-mono text-[15px]">{currentTime}.0</span>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-4 gap-[1px] overflow-hidden rounded-sm border border-[#2a2a2a] text-[11px] bg-[#2a2a2a]">
              <div className="bg-[#1c1c1c] p-2 text-left text-[#8a8a8a] border-r border-[#2a2a2a]">{formatClock(DEFAULT_TIME || 600)}</div>
              <div className="bg-[#1c1c1c] p-2 text-left text-[#8a8a8a] border-r border-[#2a2a2a]">7:30</div>
              <div className="bg-[#1c1c1c] p-2 text-left text-[#8a8a8a] border-r border-[#2a2a2a]">5:00</div>
              <div className="bg-[#1c1c1c] p-2 text-left text-[#8a8a8a]">2:30</div>
            </div>
            <ProgressBar 
              currentSeconds={seconds} 
              totalSeconds={DEFAULT_TIME || 600} 
              segments={settings.segments} 
              height="h-1.5"
              className="mt-1 border-none rounded-b-sm"
            />
          </div>

          {/* DASHBOARD CONTROLS */}
          <div className="mt-4 grid grid-cols-7 gap-2">
            <div className="relative col-span-1">
              <button onClick={() => setOpenAdjustMenu(openAdjustMenu === 'decrease' ? null : 'decrease')} className="flex h-10 w-full items-center justify-center rounded border border-[#333] bg-[#2d2d2d] hover:bg-[#383838]"><IconChevronDown /></button>
              {openAdjustMenu === 'decrease' && <TimeAdjustMenu direction="decrease" onSelect={handleMenuSelection} />}
            </div>
            <button onClick={() => adjustTime(-60)} className="col-span-1 flex h-10 items-center justify-center rounded border border-[#333] bg-[#2d2d2d] text-[14px] font-bold hover:bg-[#383838]">-1m</button>
            <button onClick={resetTimer} className="col-span-1 flex h-10 items-center justify-center rounded border border-[#333] bg-[#2d2d2d] hover:bg-[#383838]"><IconSkipBack /></button>
            <button onClick={isRunning ? pauseTimer : startTimer} className="col-span-1 flex h-10 items-center justify-center rounded border border-[#333] bg-[#2d2d2d] hover:bg-[#383838]">
              {isRunning ? <IconPause /> : <IconPlay className="text-[#22c55e]" />}
            </button>
            <button className="col-span-1 flex h-10 items-center justify-center rounded border border-[#333] bg-[#2d2d2d] hover:bg-[#383838] opacity-50"><IconSkipForward /></button>
            <button onClick={() => adjustTime(60)} className="col-span-1 flex h-10 items-center justify-center rounded border border-[#333] bg-[#2d2d2d] text-[14px] font-bold hover:bg-[#383838]">+1m</button>
            <div className="relative col-span-1">
              <button onClick={() => setOpenAdjustMenu(openAdjustMenu === 'increase' ? null : 'increase')} className="flex h-10 w-full items-center justify-center rounded border border-[#333] bg-[#2d2d2d] hover:bg-[#383838]"><IconChevronDown /></button>
              {openAdjustMenu === 'increase' && <TimeAdjustMenu direction="increase" onSelect={handleMenuSelection} />}
            </div>
          </div>

          <div className="mt-6 flex flex-col items-center">
            <div className="flex items-center gap-2 text-[14px] font-medium text-[#c9c9c9]">
              <span className="text-[#8a8a8a]">🕒</span>
              <span>{wallClock}</span>
              <span className="text-[#8a8a8a]">{timeZone}</span>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-4 text-center">
            <div className="flex flex-col items-center">
              <span className="text-[12px] uppercase tracking-wider text-[#8a8a8a]">Cue finish</span>
              <span className="mt-1 text-[15px] font-bold text-white">{cueFinish}</span>
            </div>
            <div className="flex flex-col items-center">
              <span className="text-[12px] uppercase tracking-wider text-[#8a8a8a]">Over/Under</span>
              <span className="mt-1 text-[15px] font-bold text-white">{overUnder}</span>
            </div>
          </div>

          <div className="mt-auto pt-4">
            <button type="button" className="flex w-full items-center justify-between rounded-lg bg-[#2d2d2d] px-4 py-3 text-[14px] font-bold text-white shadow-md">
              <span>Live Connections 1/3</span>
              <IconChevronDown />
            </button>
          </div>
        </aside>

        {/* Center: Timers panel */}
        <main className="flex flex-1 flex-col px-8 py-4 bg-[#141414]">
          <div className="mb-6 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <h2 className="text-[20px] font-bold text-white">Timers</h2>
              <span className="text-[14px] text-[#8a8a8a] cursor-pointer">Select</span>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" className="flex h-9 items-center gap-2 rounded-md border border-[#444] bg-[#2d2d2d] px-4 text-[13px] text-white">● Blackout</button>
              <button type="button" className="flex h-9 items-center gap-2 rounded-md border border-[#444] bg-[#2d2d2d] px-4 text-[13px] text-white">⚡ Flash</button>
              <button type="button" className="flex h-9 items-center justify-center rounded-md border border-[#444] bg-[#2d2d2d] px-3 text-[13px] text-white">⋯</button>
            </div>
          </div>

          <div className="space-y-4">
            {/* TIMER ROW */}
            <div className="flex items-center gap-4 rounded-lg bg-[#2546c9] px-6 py-5 text-white shadow-2xl">
              <div className="text-[18px] font-bold opacity-80">1</div>
              <div className="text-[15px] font-bold opacity-60 border-b border-dotted border-white/40 cursor-pointer">Add time</div>
              <div className="mx-auto text-center text-[32px] font-bold tracking-tight tabular-nums">{currentTime}</div>
              <div className="text-[17px] font-bold">{settings.title || 'Timer 1'}</div>
              
              <div className="flex items-center gap-2">
                <button type="button" onClick={resetTimer} className="flex h-10 w-11 items-center justify-center rounded border border-white/20 bg-white/10 hover:bg-white/20"><IconSkipBack /></button>
                <button type="button" onClick={() => setIsSettingsOpen(true)} className="flex h-10 w-11 items-center justify-center rounded border border-white/20 bg-white/10 hover:bg-white/20"><IconSettings /></button>
                <button type="button" onClick={isRunning ? pauseTimer : startTimer} className="flex h-10 w-14 items-center justify-center rounded bg-[#228b3a] hover:bg-[#2aa346] shadow-lg transition-colors">
                  {isRunning ? <IconPause /> : <IconPlay />}
                </button>
                <button type="button" className="flex h-10 w-11 items-center justify-center rounded border border-white/20 bg-white/10 hover:bg-white/20"><IconSkipForward /></button>
              </div>
            </div>

            <div className="mt-8 flex justify-center">
              <button
                type="button"
                onClick={() => setTime(0)}
                className="flex items-center gap-2 rounded-lg border border-[#444] bg-[#2d2d2d] px-8 py-3 text-[15px] font-bold text-white hover:bg-[#383838] transition-all shadow-lg"
              >
                + Add Timer
              </button>
            </div>
          </div>
        </main>

        {/* Right: Messages panel */}
        <aside className="flex w-[380px] flex-col border-l border-[#333] px-4 py-3">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <h2 className="text-[17px] font-bold text-white">Messages</h2>
              <span className="text-[14px] text-[#8a8a8a] cursor-pointer">Select</span>
            </div>
            <button type="button" className="flex h-8 items-center gap-2 rounded-md border border-[#444] bg-[#2d2d2d] px-3 text-[12px] text-white hover:bg-[#383838]">⚡ Flash</button>
          </div>
          
          <div className="rounded-lg border border-[#333] bg-[#2d2d2d] p-4 shadow-lg">
            <div className="flex gap-3">
              <span className="text-[14px] font-bold text-[#8a8a8a] pt-1">1</span>
              <div className="flex-1 rounded-md border border-[#444] bg-[#1c1c1c] p-2.5 text-[14px] text-[#555] italic">Enter message ...</div>
            </div>
            <div className="mt-4 flex items-center justify-between border-b border-[#444] pb-2">
              <div className="flex gap-4">
                {['A', 'A', 'A', 'B', 'āA'].map((tag, index) => (
                  <button key={index} type="button" className="pb-1 text-[15px] font-bold transition-all border-b-2" style={{ color: index === 1 ? '#22c55e' : index === 2 ? '#fa5252' : '#ffffff', borderColor: index === 1 ? '#22c55e' : index === 2 ? '#fa5252' : '#ffffff' }}>{tag}</button>
                ))}
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="rounded-md border border-[#444] bg-[#1c1c1c] px-5 py-1.5 text-[13px] font-bold text-white hover:bg-[#252525]">Show</button>
              <button type="button" className="flex items-center justify-center rounded-md border border-[#444] bg-[#1c1c1c] px-3 py-1.5 text-[13px] text-white">⛶</button>
            </div>
          </div>

          <div className="mt-6 space-y-4">
            <button type="button" className="flex w-full items-center justify-center rounded-lg border border-[#444] bg-[#2d2d2d] px-6 py-2.5 text-[14px] font-bold text-white hover:bg-[#383838] shadow-md">+ Add Message</button>
            <div className="text-center text-[13px] text-[#666] cursor-pointer hover:text-[#888]">Submit questions link</div>
          </div>
        </aside>
      </div>

      <TimerSettingsModal 
        isOpen={isSettingsOpen} 
        onClose={() => setIsSettingsOpen(false)} 
        settings={settings}
        updateSettings={updateSettings}
      />

      {/* Footer */}
      <footer className="flex items-center justify-between border-t border-[#333] bg-[#1a1a1a] px-4 py-2 text-[11px] text-[#666]">
        <div className="flex items-center gap-4">
          <span className="hover:text-[#888] cursor-pointer font-medium">stagetimer.io v3.5.9 · Docs</span>
          <span>■ 395 ms</span>
        </div>
        <div className="flex flex-1 max-w-[50%] items-center gap-4 px-12">
          <span>0:00</span>
          <div className="group relative flex-1">
            <div className="absolute inset-0 flex items-center">
              <div className="h-1 w-full rounded-full bg-[#333]"></div>
            </div>
            <div className="relative flex h-4 items-center">
              <div className="h-4 w-4 rounded-full bg-[#3b82f6] shadow-lg cursor-pointer hover:scale-110 transition-transform"></div>
            </div>
          </div>
          <span>-10:00</span>
        </div>
      </footer>
    </div>
  );
}

export default App;
