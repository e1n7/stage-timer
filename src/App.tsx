import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useTimer } from './hooks/useTimer';
import { ProgressBar } from './components/ProgressBar';
import { useLocalStorage } from './hooks/useLocalStorage';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';

const pad = (value: number) => value.toString().padStart(2, '0');

const DurationInput = ({ value, onChange }: { value: number, onChange: (val: number) => void }) => {
  const h = Math.floor(value / 3600);
  const m = Math.floor((value % 3600) / 60);
  const s = value % 60;
  const minRef = useRef<HTMLInputElement>(null);
  const secRef = useRef<HTMLInputElement>(null);

  const update = (newH: number, newM: number, newS: number) => {
    const total = Math.max(0, newH) * 3600 + Math.max(0, newM) * 60 + Math.max(0, newS);
    onChange(total);
  };

  const inputClass = "w-16 rounded border border-[#333] bg-[#141414] px-2 py-2 text-[18px] font-mono text-white text-center focus:outline-none focus:border-[#4a9eff] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none transition-colors";

  return (
    <div className="flex items-center gap-2">
      <div className="flex flex-col items-center gap-1">
        <input 
          type="text" 
          inputMode="numeric"
          autoComplete="off"
          value={pad(h)} 
          onChange={(e) => {
            const val = e.target.value;
            const num = clampDigits(val, 99);
            update(num, m, s);
            if (val.length >= 2) minRef.current?.focus();
          }}
          onFocus={(e) => e.target.select()}
          className={inputClass}
        />
        <span className="text-[10px] uppercase tracking-tighter text-[#555]">Hours</span>
      </div>
      <span className="text-xl font-bold text-[#444] pb-5">:</span>
      <div className="flex flex-col items-center gap-1">
        <input 
          ref={minRef}
          type="text" 
          inputMode="numeric"
          autoComplete="off"
          value={pad(m)} 
          onChange={(e) => {
            const val = e.target.value;
            const num = clampDigits(val, 59);
            update(h, num, s);
            if (val.length >= 2) secRef.current?.focus();
          }}
          onFocus={(e) => e.target.select()}
          className={inputClass}
        />
        <span className="text-[10px] uppercase tracking-tighter text-[#555]">Minutes</span>
      </div>
      <span className="text-xl font-bold text-[#444] pb-5">:</span>
      <div className="flex flex-col items-center gap-1">
        <input 
          ref={secRef}
          type="text" 
          inputMode="numeric"
          autoComplete="off"
          value={pad(s)} 
          onChange={(e) => update(h, m, clampDigits(e.target.value, 59))}
          onFocus={(e) => e.target.select()}
          className={inputClass}
        />
        <span className="text-[10px] uppercase tracking-tighter text-[#555]">Seconds</span>
      </div>
    </div>
  );
};

const StartTimeInput = ({ value, onChange, selectedTimeZone }: { value: number | null, onChange: (val: number | null) => void, selectedTimeZone: string }) => {
  const now = new Date();
  
  const formatter = new Intl.DateTimeFormat('en-US', { 
    timeZone: selectedTimeZone, 
    hour12: false, 
    hour: 'numeric', 
    minute: 'numeric', 
    second: 'numeric' 
  });
  const formatted = formatter.format(now);
  const [hNow, mNow, sNow] = formatted.split(':').map(Number);
  const secondsSinceMidnight = hNow * 3600 + mNow * 60 + sNow;

  const displayValue = value === null ? secondsSinceMidnight : value;
  
  const h = Math.floor(displayValue / 3600);
  const m = Math.floor((displayValue % 3600) / 60);
  const s = displayValue % 60;

  const update = (newH: number, newM: number, newS: number) => {
    onChange(newH * 3600 + newM * 60 + newS);
  };

  const inputClass = "w-16 rounded border border-[#333] bg-[#141414] px-2 py-2 text-[18px] font-mono text-white text-center focus:outline-none focus:border-[#555] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <input 
          type="checkbox" 
          id="manual-start"
          checked={value !== null} 
          onChange={(e) => onChange(e.target.checked ? displayValue : null)}
          className="h-4 w-4 rounded border-[#333] bg-[#141414] accent-[#4a9eff]"
        />
        <label htmlFor="manual-start" className="text-[13px] text-[#8a8a8a] cursor-pointer">Set Specific Start Time</label>
      </div>
      {value !== null && (
        <div className="flex items-center gap-3 ml-6">
          <div className="flex flex-col items-center gap-1">
            <input type="number" value={pad(h)} onChange={(e) => update(Math.max(0, parseInt(e.target.value) || 0), m, s)} onFocus={(e) => e.target.select()} className={inputClass} />
            <span className="text-[10px] uppercase tracking-tighter text-[#555]">Hours</span>
          </div>
          <span className="text-xl font-bold text-[#444] pb-5">:</span>
          <div className="flex flex-col items-center gap-1">
            <input type="number" value={pad(m)} onChange={(e) => update(h, Math.min(59, Math.max(0, parseInt(e.target.value) || 0)), s)} onFocus={(e) => e.target.select()} className={inputClass} />
            <span className="text-[10px] uppercase tracking-tighter text-[#555]">Mins</span>
          </div>
          <span className="text-xl font-bold text-[#444] pb-5">:</span>
          <div className="flex flex-col items-center gap-1">
            <input type="number" value={pad(s)} onChange={(e) => update(h, m, Math.min(59, Math.max(0, parseInt(e.target.value) || 0)))} onFocus={(e) => e.target.select()} className={inputClass} />
            <span className="text-[10px] uppercase tracking-tighter text-[#555]">Secs</span>
          </div>
        </div>
      )}
    </div>
  );
};

const clampDigits = (val: string, max: number) => {
  const digits = val.replace(/[^0-9]/g, '');
  const num = digits === '' ? 0 : Math.min(max, parseInt(digits, 10));
  return num;
};

const ThresholdInput = ({ value, onChange }: { value: number, onChange: (val: number) => void }) => {
  const m = Math.floor(value / 60);
  const s = value % 60;
  const secRef = useRef<HTMLInputElement>(null);

  const update = (newM: number, newS: number) => {
    onChange(newM * 60 + newS);
  };

  const inputClass = "w-16 rounded border border-[#333] bg-[#141414] px-2 py-2 text-[16px] font-mono text-white text-center focus:outline-none focus:border-[#555] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none";

  return (
    <div className="flex items-center gap-3">
      <div className="flex flex-col items-center gap-1">
        <input 
          type="text" 
          inputMode="numeric"
          autoComplete="off"
          spellCheck={false}
          value={pad(m)} 
          onChange={(e) => {
            const val = e.target.value;
            update(clampDigits(val, 99), s);
            if (val.length >= 2) secRef.current?.focus();
          }}
          onBlur={(e) => e.target.value = pad(clampDigits(e.target.value, 99))}
          onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
          onFocus={(e) => { e.target.select(); }}
          className={inputClass}
        />
        <span className="text-[10px] uppercase tracking-tighter text-[#555]">Min</span>
      </div>
      <span className="text-xl font-bold text-[#444] pb-5">:</span>
      <div className="flex flex-col items-center gap-1">
        <input 
          ref={secRef}
          type="text" 
          inputMode="numeric"
          autoComplete="off"
          spellCheck={false}
          value={pad(s)} 
          onChange={(e) => update(m, clampDigits(e.target.value, 59))}
          onBlur={(e) => e.target.value = pad(clampDigits(e.target.value, 59))}
          onKeyDown={(e) => { if (e.key === 'Backspace' && e.currentTarget.value === '') { /* handle if needed */ } if (e.key === 'Enter') e.currentTarget.blur(); }}
          onFocus={(e) => { e.target.select(); }}
          className={inputClass}
        />
        <span className="text-[10px] uppercase tracking-tighter text-[#555]">Sec</span>
      </div>
    </div>
  );
};

const formatClock = (seconds: number, allowNegative = false) => {
  const neg = allowNegative && seconds < 0;
  const total = Math.max(0, Math.floor(Math.abs(seconds)));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  
  const base = `${pad(hours * 60 + minutes)}:${pad(secs)}`;
  return neg ? `-${base}` : base;
};

const CHANNEL_NAME = 'stage-timer-sync';
const CONTROL_CHANNEL = 'stage-timer-controls';

const DECREASE_OPTIONS = [
  { label: '-1s', value: -1 },
  { label: '-10s', value: -10 },
  { label: '-20s', value: -20 },
  { label: '-1m', value: -60 },
  { label: '-5m', value: -300 },
  { label: '-10m', value: -600 },
];

const INCREASE_OPTIONS = [
  { label: '+1s', value: 1 },
  { label: '+10s', value: 10 },
  { label: '+20s', value: 20 },
  { label: '+1m', value: 60 },
  { label: '+5m', value: 300 },
  { label: '+10m', value: 600 },
];

// SVG Icons
interface IconProps { className?: string; size?: number; }
const IconChevronDown = ({ className = "", size = 10 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}><path d="M7 10l5 5 5-5H7z"/></svg>
);
const IconSkipBack = ({ size = 14 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/></svg>
);
const IconSkipForward = ({ size = 14 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor"><path d="M6 18l8.5-6L6 6zm9-12h2v12h-2z"/></svg>
);
const IconPlay = ({ className = "", size = 16 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}><path d="M8 5v14l11-7z"/></svg>
);
const IconPause = ({ size = 16 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
);
const IconSettings = ({ size = 14 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2 2.01 2.01 0 0 1-2.02 2 2 2 0 0 0-2 2 2.01 2.01 0 0 1-2 2.02 2 2 0 0 0-2 2v.44a2 2 0 0 0 2 2 2.01 2.01 0 0 1 2.02 2 2 2 0 0 0 2 2 2.01 2.01 0 0 1 2 2.02 2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2 2.01 2.01 0 0 1 2.02-2 2 2 0 0 0 2-2 2.01 2.01 0 0 1 2-2.02 2 2 0 0 0 2-2v-.44a2 2 0 0 0-2-2 2.01 2.01 0 0 1-2.02-2 2 2 0 0 0-2-2 2.01 2.01 0 0 1-2-2.02 2 2 0 0 0-2-2Z"/><circle cx="12" cy="12" r="3"/></svg>
);
const IconDownload = ({ className = "", size = 14 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
);
const IconUpload = ({ className = "", size = 14 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
);
const IconSave = ({ className = "", size = 14 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
);
const IconScreen = ({ className = "", size = 14 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
);
const IconClock = ({ size = 12 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
);
const IconCalendar = ({ size = 12 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
);
const IconSpeaker = ({ className = "", size = 12 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
);
const IconFlash = ({ className = "", size = 12 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
);
const IconCircle = ({ size = 8 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="10"/></svg>
);
const IconSelect = ({ size = 16 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 1.5"/><path d="M10 2h4"/><path d="M12 2v3"/><path d="m7 5 1 1.5"/><path d="m17 5-1 1.5"/></svg>
);
const IconMore = ({ className = "", size = 14 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}><circle cx="12" cy="12" r="2"/><circle cx="5" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>
);
const IconMaximize = ({ size = 12 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>
);
const IconSquare = ({ size = 8 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="16" height="16" rx="1"/></svg>
);

interface TimeAdjustMenuProps {
  direction: 'decrease' | 'increase';
  onSelect: (seconds: number) => void;
  onClose: () => void;
}

const TimeAdjustMenu = ({ direction, onSelect, onClose }: TimeAdjustMenuProps) => {
  const options = direction === 'decrease' ? DECREASE_OPTIONS : INCREASE_OPTIONS;

  return (
    <div className={`w-32 rounded-md border border-[#444] bg-[#242424] p-1 shadow-xl`}>
      <div className="px-2 py-1.5 text-[10px] uppercase tracking-wider text-[#777]">
        {direction === 'decrease' ? 'Subtract time' : 'Add time'}
      </div>
      {options.map((opt) => (
        <button
          key={opt.label}
          type="button"
          onClick={() => {
            onSelect(opt.value);
            onClose();
          }}
          className="block w-full rounded px-2 py-2 text-left text-[13px] text-white hover:bg-[#383838] transition-colors"
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
};

interface TimerSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: any;
  updateSettings: (updates: any) => void;
  onApplyToAll?: (settings: any) => void;
  onConfirm?: (settings: any) => void;
  onSettingsUpdate: () => void;
  selectedTimeZone: string;
}

const TimerSettingsModal = ({ isOpen, onClose, settings, updateSettings, onApplyToAll, onConfirm, onSettingsUpdate, selectedTimeZone }: TimerSettingsModalProps) => {
  const [localSettings, setLocalSettings] = useState(settings);

  useEffect(() => {
    if (isOpen) setLocalSettings(settings);
  }, [isOpen, settings]);

  if (!isOpen) return null;

  const yellowSegment = localSettings.segments.find((s: any) => s.color === '#f08c00') || { threshold: 60, color: '#f08c00' };
  const redSegment = localSettings.segments.find((s: any) => s.color === '#fa5252') || { threshold: 10, color: '#fa5252' };

  const formatMMSS = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${pad(m)} : ${pad(s)}`;
  };

  const formatHHMMSS = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${pad(h)} : ${pad(m)} : ${pad(s)}`;
  };

  const parseMMSS = (val: string) => {
    const parts = val.split(':').map(p => parseInt(p.trim()) || 0);
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    return 0;
  };

  const parseHHMMSS = (val: string) => {
    const parts = val.split(':').map(p => parseInt(p.trim()) || 0);
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    return 0;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md" onClick={(e) => e.stopPropagation()}>
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-lg border border-[#333] bg-[#1a1a1a] p-4 shadow-2xl custom-scrollbar" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between border-b border-[#333] pb-3">
          <div className="flex items-center gap-3">
            <div className="rounded bg-[#2d2d2d] p-2 text-white"><IconSettings /></div>
            <h2 className="text-lg font-bold text-white">Settings for {localSettings.title || 'Timer 1'}</h2>
          </div>
          <button onClick={onClose} className="text-xl text-[#8a8a8a] hover:text-white">✕</button>
        </div>

        <div className="space-y-4">
          <div className="flex gap-4">
            <label className="w-20 text-[13px] text-[#8a8a8a]">Title</label>
            <input type="text" value={localSettings.title || 'Timer 1'} onChange={(e) => setLocalSettings({ ...localSettings, title: e.target.value })} className="flex-1 rounded border border-[#333] bg-[#141414] px-3 py-1.5 text-[14px] text-white focus:border-[#444] focus:outline-none" />
          </div>

        </div>

        <div className="my-4 border-t border-[#333]" />

        <div className="grid grid-cols-1 gap-8">
          <div className="space-y-4">
            <h3 className="text-[14px] font-bold text-white">Timing</h3>
            
            <div className="flex items-start justify-between gap-6 pb-3 border-b border-[#333]">
              <span className="text-[12px] text-[#8a8a8a] pt-1">Start Time ⓘ</span>
              <StartTimeInput 
                value={localSettings.scheduledStart} 
                onChange={(val) => setLocalSettings({ ...localSettings, scheduledStart: val })}
                selectedTimeZone={selectedTimeZone}
              />
            </div>

            <div className="flex items-center justify-between gap-6 py-2">
              <span className="text-[12px] text-[#8a8a8a]">Duration ⓘ</span>
              <DurationInput 
                value={localSettings.targetDuration || 0} 
                onChange={(val) => setLocalSettings({ ...localSettings, targetDuration: val })}
              />
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[12px] text-[#8a8a8a]">Appearance</span>
              <select 
                value={localSettings.mode || 'countdown'} 
                onChange={(e) => setLocalSettings({ ...localSettings, mode: e.target.value as any })}
                className="flex-1 rounded border border-[#333] bg-[#141414] px-3 py-1.5 text-[13px] text-white focus:outline-none"
              >
                <option value="countdown">Countdown</option>
                <option value="countup">Countup</option>
              </select>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-[12px] text-[#8a8a8a]">Font Height</span>
              <div className="flex flex-1 items-center gap-3">
                <input 
                  type="range" 
                  min="0.5" 
                  max="3.0" 
                  step="0.1"
                  value={localSettings.fontHeight || 1.6} 
                  onChange={(e) => setLocalSettings({ ...localSettings, fontHeight: parseFloat(e.target.value) })}
                  className="flex-1 accent-[#4a9eff]"
                />
                <span className="w-10 text-right font-mono text-[12px] text-white">{(localSettings.fontHeight || 1.6).toFixed(1)}x</span>
              </div>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-[12px] text-[#8a8a8a]">Font Width</span>
              <div className="flex flex-1 items-center gap-3">
                <input 
                  type="range" 
                  min="0.5" 
                  max="2.0" 
                  step="0.1"
                  value={localSettings.fontWidth || 1.0} 
                  onChange={(e) => setLocalSettings({ ...localSettings, fontWidth: parseFloat(e.target.value) })}
                  className="flex-1 accent-[#4a9eff]"
                />
                <span className="w-10 text-right font-mono text-[12px] text-white">{(localSettings.fontWidth || 1.0).toFixed(1)}x</span>
              </div>
            </div>
            <div className="flex justify-end">
              <button 
                type="button"
                onClick={() => {
                  updateSettings(localSettings);
                  onApplyToAll?.({ 
                    mode: localSettings.mode, 
                    fontHeight: localSettings.fontHeight,
                    fontWidth: localSettings.fontWidth
                  });
                  onSettingsUpdate();
                  onClose();
                }}
                className="text-[11px] text-[#4a9eff] hover:underline"
              >
                Apply to all
              </button>
            </div>
          </div>
        </div>

        <div className="my-4 border-t border-[#333]" />

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-[14px] font-bold text-white">Wrap-up times & actions</h3>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-[#333]"><div className="flex h-full w-full"><div className="h-full w-[80%] bg-[#22c55e]" /><div className="h-full w-[15%] bg-[#f08c00]" /><div className="h-full w-[5%] bg-[#fa5252]" /></div></div>
          <div className="space-y-3">
            <div className="flex items-center gap-4 py-2 border-b border-[#333]/30">
              <div className="h-3 w-3 rounded-full bg-[#22c55e]" />
              <span className="w-16 text-[13px] text-[#8a8a8a]">Start</span>
            </div>
            <div className="flex items-center gap-4 py-2 border-b border-[#333]/30">
              <div className="h-3 w-3 rounded-full bg-[#f08c00]" />
              <span className="w-16 text-[13px] text-white">Yellow</span>
              <ThresholdInput 
                value={yellowSegment.threshold} 
                onChange={(val) => {
                  const newSegments = localSettings.segments.map((s: any) => s.color === '#f08c00' ? { ...s, threshold: val } : s); 
                  setLocalSettings({ ...localSettings, segments: newSegments }); 
                }}
              />
            </div>
            <div className="flex items-center gap-4 py-2 border-b border-[#333]/30">
              <div className="h-3 w-3 rounded-full bg-[#fa5252]" />
              <span className="w-16 text-[13px] text-white">Red</span>
              <ThresholdInput 
                value={redSegment.threshold} 
                onChange={(val) => {
                  const newSegments = localSettings.segments.map((s: any) => s.color === '#fa5252' ? { ...s, threshold: val } : s); 
                  setLocalSettings({ ...localSettings, segments: newSegments }); 
                }}
              />
            </div>
            <div className="flex items-center gap-4 py-2">
              <div className="h-3 w-3 rounded-full bg-[#666]" />
              <span className="w-16 text-[13px] text-[#8a8a8a]">0:00</span>
            </div>
          </div>
        </div>

        <div className="mt-12 flex gap-4"><button onClick={onClose} className="flex-1 rounded border border-[#333] bg-[#2d2d2d] py-3 text-[14px] font-bold text-white hover:bg-[#383838]">Cancel</button><button onClick={() => { onConfirm?.(localSettings); onClose(); }} className="flex-1 rounded border border-[#228b3a] bg-[#141414] py-3 text-[14px] font-bold text-[#22c55e] hover:bg-[#1a1a1a]">Confirm</button></div>
      </div>
    </div>
  );
};

const QuickSettingsModal = ({ isOpen, onClose, settings, updateSettings, onApplyToAll, onConfirm, onSettingsUpdate, selectedTimeZone }: TimerSettingsModalProps) => {
  const [localSettings, setLocalSettings] = useState(settings);

  useEffect(() => {
    if (isOpen) setLocalSettings(settings);
  }, [isOpen, settings]);

  if (!isOpen) return null;

  const formatHHMMSS = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${pad(h)} : ${pad(m)} : ${pad(s)}`;
  };

  const parseHHMMSS = (val: string) => {
    const parts = val.split(':').map(p => parseInt(p.trim()) || 0);
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    return 0;
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-md" onClick={(e) => e.stopPropagation()}>
      <div className="w-full max-w-lg rounded-lg border border-[#333] bg-[#1a1a1a] p-8 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-6">
          <h3 className="text-[16px] font-bold text-white mb-4">Timing</h3>
          
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-6 pb-3 border-b border-[#333]">
              <span className="text-[13px] text-[#8a8a8a] pt-1">Start Time ⓘ</span>
              <StartTimeInput 
                value={localSettings.scheduledStart} 
                onChange={(val) => setLocalSettings({ ...localSettings, scheduledStart: val })}
                selectedTimeZone={selectedTimeZone}
              />
            </div>

            <div className="flex items-center justify-between gap-6 py-2">
              <span className="text-[13px] text-[#8a8a8a]">Duration ⓘ</span>
              <DurationInput 
                value={localSettings.targetDuration || 0} 
                onChange={(val) => setLocalSettings({ ...localSettings, targetDuration: val })}
              />
            </div>
            
            <div className="flex items-center justify-between gap-4">
              <span className="text-[13px] text-[#8a8a8a]">Appearance</span>
              <select 
                value={localSettings.mode || 'countdown'} 
                onChange={(e) => setLocalSettings({ ...localSettings, mode: e.target.value as any })}
                className="flex-1 rounded border border-[#333] bg-[#141414] px-4 py-2 text-[14px] text-white focus:outline-none"
              >
                <option value="countdown">Countdown</option>
                <option value="countup">Countup</option>
              </select>
            </div>

            <div className="flex justify-end">
              <button 
                type="button"
                onClick={() => {
                  onConfirm?.(localSettings);
                  onApplyToAll?.({ 
                    mode: localSettings.mode,
                    fontHeight: localSettings.fontHeight,
                    fontWidth: localSettings.fontWidth
                  });
                  onClose();
                }}
                className="text-[12px] text-[#4a9eff] hover:underline"
              >
                Apply to all
              </button>
            </div>
          </div>
        </div>

        <div className="mt-10 flex gap-4 border-t border-[#333] pt-6">
          <button 
            onClick={onClose} 
            className="flex-1 rounded border border-[#333] bg-[#2d2d2d] py-2.5 text-[14px] font-bold text-white hover:bg-[#383838]"
          >
            Cancel
          </button>
          <button 
            onClick={() => { onConfirm?.(localSettings); onClose(); }} 
            className="flex-1 rounded border border-[#228b3a] bg-[#141414] py-2.5 text-[14px] font-bold text-[#22c55e] hover:bg-[#1a1a1a]"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
};

interface TimerRowProps {
  id: string;
  index: number;
  isActive: boolean;
  scheduledStart: number | null;
  formatTime: (ts: number | null) => string;
  selectedTimeZone: string;
  onActivate: () => void;
  onSync: (state: any) => void;
  onAddAbove: () => void;
  onAddBelow: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onApplyToAll?: (settings: any) => void;
  onSettingsUpdate: () => void;
}

const TimerRow = ({ id, index, isActive, scheduledStart, formatTime, selectedTimeZone, onActivate, onSync, onAddAbove, onAddBelow, onDuplicate, onDelete, onApplyToAll, onSettingsUpdate }: TimerRowProps) => {
  const {
    seconds,
    isRunning,
    startTimer,
    pauseTimer,
    resetTimer,
    setTime,
    settings,
    updateSettings,
    syncState,
    DEFAULT_TIME
  } = useTimer(id);

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isQuickSettingsOpen, setIsQuickSettingsOpen] = useState(false);
  const [isActionsOpen, setIsActionsOpen] = useState(false);
  const [isAdjustMenuOpen, setIsAdjustMenuOpen] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const currentTime = formatClock(seconds);

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });

  const style = { transform: CSS.Transform.toString(transform), transition, zIndex: isDragging || isActionsOpen || isSettingsOpen || isQuickSettingsOpen ? 200 : 1, position: 'relative' as const };

  useEffect(() => {
    const handleGlobalClick = () => {
      setIsActionsOpen(false);
      setIsAdjustMenuOpen(false);
    };
    window.addEventListener('click', handleGlobalClick);
    return () => window.removeEventListener('click', handleGlobalClick);
  }, []);

  const secondsRef = useRef(seconds);
  useEffect(() => { secondsRef.current = seconds; }, [seconds]);

  useEffect(() => {
    const handleInWindowResetAll = (event: Event) => {
      const payload = (event as CustomEvent<string>).detail;
      if (payload !== id) {
        resetTimer();
      }
    };
    window.addEventListener('stage-timer-reset-all-except', handleInWindowResetAll);
    const handleInWindowPauseAll = (event: Event) => {
      const payload = (event as CustomEvent<string>).detail;
      if (payload !== id) {
        pauseTimer();
      }
    };
    window.addEventListener('stage-timer-pause-all-except', handleInWindowPauseAll);
    const channel = new BroadcastChannel(CONTROL_CHANNEL);
    channel.onmessage = (event) => {
      const { targetId, command, payload } = event.data;
      
      // Global commands
      if (command === 'PAUSE_ALL_EXCEPT' && payload !== id) {
        pauseTimer();
        return;
      }
      if (command === 'RESET_ALL_EXCEPT' && payload !== id) {
        resetTimer();
        return;
      }

      // Targeted commands
      if (targetId === id) {
        switch (command) {
          case 'START': startTimer(); break;
          case 'PAUSE': pauseTimer(); break;
          case 'RESET': resetTimer(); break;
          case 'ADJUST': setTime(Math.max(0, secondsRef.current + payload)); break;
          case 'SET': setTime(payload); break;
          case 'RELOAD_SETTINGS': 
          case 'REFRESH_SETTINGS': {
            // Refresh visual/settings state WITHOUT touching the current time.
            // The timer must never restart or jump when only settings change.
            const stored = localStorage.getItem(`timerSettings_${id}`);
            if (stored) {
              const newSettings = JSON.parse(stored);
              const safeSettings = { ...newSettings };
              // Keep the timer's real current duration; never overwrite it from settings.
              safeSettings.targetDuration = newSettings.targetDuration;
              updateSettings(safeSettings);
            }
            break;
          }
        }
      }
    };
    return () => {
      window.removeEventListener('stage-timer-reset-all-except', handleInWindowResetAll);
      window.removeEventListener('stage-timer-pause-all-except', handleInWindowPauseAll);
      channel.close();
    };
  }, [id, startTimer, pauseTimer, resetTimer, setTime, updateSettings]);

  useEffect(() => {
    if (isActive) {
      onSync({ seconds, isRunning, settings, syncState, DEFAULT_TIME });
    }
  }, [isActive, seconds, isRunning, settings, syncState, DEFAULT_TIME, onSync]);

  return (
    <div 
      ref={setNodeRef} 
      style={style} 
      onClick={isActive ? onActivate : undefined} 
      onMouseEnter={isActive ? () => setIsHovered(true) : undefined} 
      onMouseLeave={isActive ? () => setIsHovered(false) : undefined} 
      className={`flex items-center gap-4 rounded-lg px-6 py-1.5 text-white shadow-lg transition-all ${isRunning ? 'bg-[#b91c1c]' : isActive ? 'bg-[#2546c9] cursor-pointer' : 'bg-[#262626]'} ${isDragging ? 'opacity-50' : ''}`}
    >
      {/* Index / Handle */}
      <div {...attributes} {...listeners} className="flex w-8 items-center justify-center text-[16px] font-bold opacity-60 cursor-grab active:cursor-grabbing" onClick={(e) => e.stopPropagation()} onMouseEnter={(e) => e.stopPropagation()} onMouseLeave={(e) => e.stopPropagation()}>
        {isHovered || isDragging ? <span className="text-[24px] font-light leading-none">=</span> : index + 1}
      </div>

      {/* Scheduled Time Display */}
      <div className="flex flex-col items-start w-32">
        <div 
          onClick={(e) => { 
            e.stopPropagation(); 
            setIsSettingsOpen(true); 
          }}
          className="text-[13px] font-bold transition-colors text-white/50 hover:text-white cursor-pointer"
          title="Click to set start time"
          onMouseEnter={(e) => e.stopPropagation()}
          onMouseLeave={(e) => e.stopPropagation()}
        >
          {formatTime(scheduledStart)}
        </div>
      </div>

      {/* Timer Display */}
      <div 
        onClick={(e) => { 
          e.stopPropagation(); 
          setIsQuickSettingsOpen(true); 
        }}
        className={`flex-1 text-center text-[26px] font-bold tracking-tight tabular-nums transition-colors cursor-pointer ${seconds < 0 && settings.mode === 'countdown' ? 'text-[#fa5252] hover:text-[#ff8787]' : 'text-white hover:text-[#4a9eff]'}`}
        onMouseEnter={(e) => e.stopPropagation()}
        onMouseLeave={(e) => e.stopPropagation()}
      >
        {seconds < 0 && settings.mode === 'countdown' ? '+' + formatClock(Math.abs(seconds)) : currentTime}
      </div>

      {/* Title */}
      <div className="w-32 text-right text-[15px] font-bold truncate opacity-90 pr-2" onMouseEnter={(e) => e.stopPropagation()} onMouseLeave={(e) => e.stopPropagation()}>
        {settings.title || `Timer ${index + 1}`}
      </div>

      {/* Controls */}
      <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()} onMouseEnter={(e) => e.stopPropagation()} onMouseLeave={(e) => e.stopPropagation()}>
        {isActive ? (
          <button 
            type="button" 
            onClick={resetTimer} 
            className={`flex h-9 w-10 items-center justify-center rounded border border-white/10 transition-colors ${isActive ? 'bg-white/20 hover:bg-white/30' : 'bg-white/5 hover:bg-white/10'}`}
            title="Reset to assigned time"
          >
            <IconSkipBack size={16} />
          </button>
        ) : (
          <button 
            type="button" 
            onClick={() => onActivate()}
            className="flex h-9 w-10 items-center justify-center rounded border border-white/10 bg-white/5 text-white/50 hover:bg-white/10 hover:text-white transition-colors"
            title="Select this timer"
          >
            <IconSelect size={16} />
          </button>
        )}
        <button 
          type="button" 
          onClick={() => setIsSettingsOpen(true)}
          className={`flex h-9 w-10 items-center justify-center rounded border border-white/10 transition-colors ${isActive ? 'bg-white/20 hover:bg-white/30' : 'bg-white/5 hover:bg-white/10'}`}
        >
          <IconSettings size={16} />
        </button>
        <button 
          type="button" 
          onClick={() => {
            if (!isRunning) {
              onActivate();
              window.dispatchEvent(new CustomEvent('stage-timer-reset-all-except', { detail: id }));
              const channel = new BroadcastChannel(CONTROL_CHANNEL);
              channel.postMessage({ command: 'RESET_ALL_EXCEPT', payload: id });
              channel.close();
              startTimer();
            } else {
              pauseTimer();
            }
          }}
          className="flex h-9 w-12 items-center justify-center rounded bg-[#16a34a] hover:bg-[#15803d] shadow-md transition-colors"
        >
          {isRunning ? <IconPause size={18} /> : <IconPlay size={18} />}
        </button>
        
        <div className="relative ml-1">
          <button 
            type="button" 
            onClick={(e) => { e.stopPropagation(); setIsActionsOpen(!isActionsOpen); }} 
            className="flex h-9 w-8 items-center justify-center text-white/40 hover:text-white transition-colors"
          >
            <IconMore size={18} />
          </button>
          {isActionsOpen && (
            <div onClick={(e) => e.stopPropagation()} className="absolute right-0 top-full z-50 mt-2 w-56 rounded-lg border border-[#444] bg-[#242424] p-1 shadow-2xl">
              <button onClick={() => { onAddAbove(); setIsActionsOpen(false); }} className="flex w-full items-center gap-3 rounded-md px-4 py-2.5 text-left text-[14px] text-white hover:bg-[#383838]"><span>↑</span> Add timer above</button>
              <button onClick={() => { onAddBelow(); setIsActionsOpen(false); }} className="flex w-full items-center gap-3 rounded-md px-4 py-2.5 text-left text-[14px] text-white hover:bg-[#383838]"><span>↓</span> Add timer below</button>
              <button onClick={() => { onDuplicate(); setIsActionsOpen(false); }} className="flex w-full items-center gap-3 rounded-md px-4 py-2.5 text-left text-[14px] text-white hover:bg-[#383838]">Duplicate</button>
              <div className="my-1 border-t border-[#333]" />
              <button onClick={() => { onDelete(); setIsActionsOpen(false); }} className="flex w-full items-center gap-3 rounded-md px-4 py-2.5 text-left text-[14px] text-[#fa5252] hover:bg-red-500/10">Delete</button>
            </div>
          )}
        </div>
      </div>
      <TimerSettingsModal 
        isOpen={isSettingsOpen} 
        onClose={() => setIsSettingsOpen(false)} 
        settings={settings} 
        updateSettings={updateSettings} 
        onApplyToAll={onApplyToAll}
        onSettingsUpdate={onSettingsUpdate}
        selectedTimeZone={selectedTimeZone}
        onConfirm={(newSettings) => {
          updateSettings(newSettings);
          // Only reset the timer time when the actual duration changed.
          // Pure visual changes (font height/width, appearance) must never restart the timer.
          if (newSettings.targetDuration !== settings.targetDuration) {
            setTime(newSettings.targetDuration);
          }
          onSettingsUpdate();
        }}
      />
      <QuickSettingsModal 
        isOpen={isQuickSettingsOpen} 
        onClose={() => setIsQuickSettingsOpen(false)} 
        settings={settings} 
        updateSettings={updateSettings} 
        onApplyToAll={onApplyToAll}
        onSettingsUpdate={onSettingsUpdate}
        selectedTimeZone={selectedTimeZone}
        onConfirm={(newSettings) => {
          updateSettings(newSettings);
          // Only reset the timer time when the actual duration changed.
          // Pure visual changes (font height/width, appearance) must never restart the timer.
          if (newSettings.targetDuration !== settings.targetDuration) {
            setTime(newSettings.targetDuration);
          }
          onSettingsUpdate();
        }}
      />
    </div>
  );
};

interface Room {
  id: string;
  name: string;
  timerIds: string[];
  activeTimerId: string;
  messages: Array<{ id: string; text: string; color: string; }>;
  timerSettings?: Record<string, any>;
  activeRoomSettings?: any;
}

function App() {
  const [rooms, setRooms] = useLocalStorage<Room[]>('stage-timer-rooms', []);
  const [currentRoomName, setCurrentRoomName] = useLocalStorage<string>('stage-timer-current-name', 'Unnamed');
  const [timerIds, setTimerIds] = useLocalStorage<string[]>('stage-timer-timer-ids', []);
  const [activeTimerId, setActiveTimerId] = useLocalStorage<string>('stage-timer-active-id', '');
  const [messages, setMessages] = useLocalStorage<any[]>('stage-timer-messages', [{ id: '1', text: '', color: '#ffffff' }]);
  const [messageShownId, setMessageShownId] = useLocalStorage<string | null>('stage-timer-message-shown-id', null);
  const [messageFlashId, setMessageFlashId] = useState<string | null>(null);
  const [draggingMsgId, setDraggingMsgId] = useState<string | null>(null);
  const [activeTimerState, setActiveTimerState] = useState<any>(null);
  const [isRoomMenuOpen, setIsRoomMenuOpen] = useState(false);
  const [isTimersMenuOpen, setIsTimersMenuOpen] = useState(false);
  const [isTimeZoneMenuOpen, setIsTimeZoneMenuOpen] = useState(false);
  const [openAdjustMenu, setOpenAdjustMenu] = useState<'decrease' | 'increase' | null>(null);
  const [settingsVersion, setSettingsVersion] = useState(0);

  const { wallClock, timeZone, selectedTimeZone, setSelectedTimeZone } = useTimer('global-helper');

  const cueFinish = useMemo(() => {
    if (!activeTimerState) return '--:--';
    const now = new Date();
    return new Date(now.getTime() + activeTimerState.seconds * 1000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true, timeZone: selectedTimeZone });
  }, [activeTimerState, selectedTimeZone]);

  const overUnder = useMemo(() => {
    if (!activeTimerState) return '--:--';
    const s = activeTimerState.seconds;
    return s < 0 ? `+${formatClock(Math.abs(s), true)}` : `-${formatClock(s)}`;
  }, [activeTimerState]);

  const schedule = useMemo(() => {
    const result: Record<string, { start: number | null }> = {};
    const now = new Date();
    
    const formatter = new Intl.DateTimeFormat('en-US', { 
      timeZone: selectedTimeZone, 
      hour12: false, 
      hour: 'numeric', 
      minute: 'numeric', 
      second: 'numeric' 
    });
    const formatted = formatter.format(now);
    const [h, m, s] = formatted.split(':').map(Number);
    const secondsSinceMidnight = h * 3600 + m * 60 + s;
    const midnight = (now.getTime() / 1000) - secondsSinceMidnight;

    // Anchor to active timer if it's running or has been started
    let anchorTime: number = Math.floor(now.getTime() / 1000);
    let anchorIndex = 0;

    if (activeTimerId && activeTimerState?.syncState?.startTime) {
      anchorTime = Math.floor(activeTimerState.syncState.startTime / 1000);
      anchorIndex = timerIds.indexOf(activeTimerId);
    }

    // Forward pass
    let currentEndTime = anchorTime;
    for (let i = anchorIndex; i < timerIds.length; i++) {
      const id = timerIds[i];
      const stored = localStorage.getItem(`timerSettings_${id}`);
      const settings = stored ? JSON.parse(stored) : { targetDuration: 0, scheduledStart: null };
      
      let startTime = currentEndTime;
      
      // Only apply manual start to the anchor or if explicitly set
      if (settings.scheduledStart !== null && (i === anchorIndex && !activeTimerState?.isRunning)) {
        startTime = midnight + settings.scheduledStart;
      }

      result[id] = { start: startTime };
      currentEndTime = startTime + (settings.targetDuration || 0);
    }

    // Backward pass
    if (anchorTime !== null && anchorIndex > 0) {
      let currentStartTime = anchorTime;
      for (let i = anchorIndex - 1; i >= 0; i--) {
        const id = timerIds[i];
        const stored = localStorage.getItem(`timerSettings_${id}`);
        const settings = stored ? JSON.parse(stored) : { targetDuration: 0 };
        
        const endTime = currentStartTime;
        const startTime = endTime - (settings.targetDuration || 0);
        result[id] = { start: startTime };
        currentStartTime = startTime;
      }
    }
    
    return result;
  }, [timerIds, settingsVersion, selectedTimeZone, activeTimerId, activeTimerState]);

  const formatScheduledTime = (timestamp: number | null) => {
    if (timestamp === null) return '---';
    return new Date(timestamp * 1000).toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit', 
      second: '2-digit', 
      hour12: true,
      timeZone: selectedTimeZone 
    });
  };

  useEffect(() => {
    const handleGlobalClick = () => {
      setIsRoomMenuOpen(false);
      setIsTimersMenuOpen(false);
      setIsTimeZoneMenuOpen(false);
      setOpenAdjustMenu(null);
    };
    window.addEventListener('click', handleGlobalClick);
    return () => window.removeEventListener('click', handleGlobalClick);
  }, []);
  const [isBlackout, setIsBlackout] = useState(false);
  const [isFlash, setIsFlash] = useState(false);
  const [isFlashing, setIsFlashing] = useState(false);
  const [isFollowEnabled, setIsFollowEnabled] = useLocalStorage<boolean>('stage-timer-follow-active', false);
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const prevIsRunningRef = useRef(false);

  // Follow Active Timer Logic: Auto-advance to next timer when current one finishes
  useEffect(() => {
    if (isFollowEnabled && prevIsRunningRef.current && !activeTimerState?.isRunning && activeTimerState?.seconds <= 0) {
      const currentIndex = timerIds.indexOf(activeTimerId);
      if (currentIndex !== -1 && currentIndex < timerIds.length - 1) {
        const nextId = timerIds[currentIndex + 1];
        setActiveTimerId(nextId);
        // Delay slightly to allow the next timer to become active before starting
        setTimeout(() => {
          try {
            const channel = new BroadcastChannel(CONTROL_CHANNEL);
            channel.postMessage({ targetId: nextId, command: 'START' });
            channel.postMessage({ command: 'RESET_ALL_EXCEPT', payload: nextId });
            channel.close();
            window.dispatchEvent(new CustomEvent('stage-timer-reset-all-except', { detail: nextId }));
          } catch (err) { console.error('Failed to auto-start next timer:', err); }
        }, 300);
      }
    }
    prevIsRunningRef.current = activeTimerState?.isRunning || false;
  }, [activeTimerState?.isRunning, activeTimerState?.seconds, isFollowEnabled, activeTimerId, timerIds, setActiveTimerId]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setTimerIds((items) => {
        const oldIndex = items.indexOf(active.id as string);
        const newIndex = items.indexOf(over.id as string);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  const addTimer = (atIndex?: number) => {
    const newId = `timer_${Date.now()}`;
    if (atIndex !== undefined) {
      const newIds = [...timerIds];
      newIds.splice(atIndex, 0, newId);
      setTimerIds(newIds);
    } else {
      setTimerIds([...timerIds, newId]);
    }
    // Keep the currently selected/playing timer active — adding a timer
    // must never steal the selection. If nothing is selected yet and there
    // are no timers at all, pick the newly added one as the first active.
    if (!activeTimerId && timerIds.length === 0) {
      setActiveTimerId(newId);
    }
  };

  const deleteTimer = (id: string) => {
    // Remove the timer's own stored state so it leaves no residue,
    // but never touch any other timer's state — playback of other
    // timers (including the active one) keeps running.
    try { localStorage.removeItem(`timerSettings_${id}`); } catch { /* ignore */ }
    try { localStorage.removeItem(`timerSeconds_${id}`); } catch { /* ignore */ }
    try { localStorage.removeItem(`timerSync_${id}`); } catch { /* ignore */ }
    try {
      const channel = new BroadcastChannel(CONTROL_CHANNEL);
      channel.postMessage({ targetId: id, command: 'DESTROY' });
      channel.close();
    } catch { /* ignore */ }
    const newIds = timerIds.filter(tid => tid !== id);
    setTimerIds(newIds);
    if (newIds.length === 0) {
      setActiveTimerId('');
      setActiveTimerState(null);
    } else if (activeTimerId === id) {
      // The active timer was deleted — fall back to the first available timer.
      setActiveTimerId(newIds[0]);
    }
  };

  const applyToAllSettings = (sharedSettings: any) => {
    // Only propagate the visual/appearance keys so a settings change can
    // never reset any timer's current elapsed/remaining time.
    const { mode, fontHeight, fontWidth } = sharedSettings || {};
    const visualOnly = { mode, fontHeight, fontWidth };
    timerIds.forEach(id => {
      const stored = localStorage.getItem(`timerSettings_${id}`);
      const settings = stored ? JSON.parse(stored) : {
        title: 'Timer',
        targetDuration: 0,
        mode: 'countdown',
        segments: [
          { threshold: 60, color: '#f08c00' },
          { threshold: 10, color: '#fa5252' }
        ]
      };
      localStorage.setItem(`timerSettings_${id}`, JSON.stringify({ ...settings, ...visualOnly }));
    });
    // Force a settings refresh (without resetting time) via BroadcastChannel
    const channel = new BroadcastChannel(CONTROL_CHANNEL);
    timerIds.forEach(id => {
      channel.postMessage({ targetId: id, command: 'REFRESH_SETTINGS' });
    });
    channel.close();
  };

  const deleteAllTimers = () => {
    try {
      timerIds.forEach(id => {
        localStorage.removeItem(`timerSettings_${id}`);
        localStorage.removeItem(`timerSeconds_${id}`);
        localStorage.removeItem(`timerSync_${id}`);
      });
      const channel = new BroadcastChannel(CONTROL_CHANNEL);
      timerIds.forEach(id => channel.postMessage({ targetId: id, command: 'DESTROY' }));
      channel.close();
    } catch { /* ignore */ }
    setTimerIds([]);
    setActiveTimerId('');
    setActiveTimerState(null);
    setIsTimersMenuOpen(false);
  };

  const duplicateTimer = (id: string, index: number) => {
    const newId = `timer_dup_${Date.now()}`;
    const newIds = [...timerIds];
    newIds.splice(index + 1, 0, newId);
    
    // Copy settings in localStorage
    const originalSettings = localStorage.getItem(`timerSettings_${id}`);
    if (originalSettings) {
      localStorage.setItem(`timerSettings_${newId}`, originalSettings);
    }
    
    setTimerIds(newIds);
    setActiveTimerId(newId);
  };

  const loadRoom = useCallback((room: Room) => {
    // Remove ALL per-timer state (settings, sync, seconds) that does not
    // belong to the incoming room, so no timers from a previous room leak.
    Object.keys(localStorage).forEach(key => {
      if (key.startsWith('timerSettings_') || key.startsWith('timerSync_') || key.startsWith('timerSeconds_')) {
        const tid = key.split('_').slice(1).join('_');
        if (!(room.timerIds || []).includes(tid)) {
          localStorage.removeItem(key);
        }
      }
    });
    // Remove timers that are in the room's saved timerIds but had no
    // settings snapshot, unless they match a timer created in this session.
    (room.timerIds || []).forEach(id => {
      if (!room.timerSettings || !room.timerSettings[id]) {
        localStorage.removeItem(`timerSettings_${id}`);
        localStorage.removeItem(`timerSync_${id}`);
        localStorage.removeItem(`timerSeconds_${id}`);
      }
    });
    // Apply saved per-timer settings for this room's timers, and refresh
    // each timer's sync state so it mounts fresh at its saved target
    // duration instead of a stale (e.g. 0) initialSeconds from a previous run.
    if (room.timerSettings) {
      Object.keys(room.timerSettings).forEach(id => {
        const settings = room.timerSettings![id];
        localStorage.setItem(`timerSettings_${id}`, JSON.stringify(settings));
        const target = settings?.targetDuration ?? 0;
        localStorage.setItem(`timerSync_${id}`, JSON.stringify({
          startTime: null,
          initialSeconds: target,
          isRunning: false,
          mode: settings?.mode || 'countdown',
          lastUpdated: Date.now()
        }));
        localStorage.setItem(`timerSeconds_${id}`, JSON.stringify(target));
      });
    }
    setCurrentRoomName(room.name);
    setTimerIds(room.timerIds || []);
    setActiveTimerId(room.activeTimerId || (room.timerIds?.[0] || ''));
    setActiveTimerState(null);
    setMessages(room.messages || [{ id: '1', text: '', color: '#ffffff' }]);
    setMessageShownId(null);
    setMessageFlashId(null);
    setIsRoomMenuOpen(false);
  }, [setCurrentRoomName, setTimerIds, setActiveTimerId, setActiveTimerState, setMessages, setMessageShownId, setMessageFlashId]);

  const saveRoom = useCallback(() => {
    const roomName = currentRoomName.trim() || 'Unnamed';
    const timerSettings: Record<string, any> = {};
    timerIds.forEach(id => {
      const stored = localStorage.getItem(`timerSettings_${id}`);
      if (stored) timerSettings[id] = JSON.parse(stored);
    });
    setRooms(prev => {
      const existingIndex = prev.findIndex(r => r.name === roomName);
      const roomData: Room = { id: existingIndex >= 0 ? prev[existingIndex].id : Date.now().toString(), name: roomName, timerIds: [...timerIds], activeTimerId, messages: [...messages], timerSettings };
      const next = existingIndex >= 0 ? [...prev] : [...prev];
      if (existingIndex >= 0) next[existingIndex] = roomData; else next.push(roomData);
      return next;
    });
  }, [currentRoomName, timerIds, activeTimerId, messages, setRooms]);

  const syncOutput = useCallback((payload: Record<string, unknown>) => {
    try {
      const channel = new BroadcastChannel(CHANNEL_NAME);
      channel.postMessage(payload);
      channel.close();
    } catch { /* ignore */ }
    try {
      localStorage.setItem('timerState', JSON.stringify(payload));
    } catch { /* ignore */ }
  }, []);

  const sendControl = useCallback((command: string, payload?: any) => {
    if (!activeTimerId) return;
    try {
      const channel = new BroadcastChannel(CONTROL_CHANNEL);
      channel.postMessage({ targetId: activeTimerId, command, payload });
      channel.close();
    } catch { /* ignore */ }
  }, [activeTimerId]);

  useEffect(() => {
    if (activeTimerId && activeTimerState) {
      syncOutput({ 
        ...activeTimerState.syncState,
        totalTime: Math.max(0, Number(activeTimerState.settings.targetDuration ?? 0)),
        mode: activeTimerState.syncState.mode,
        segments: activeTimerState.settings.segments,
        fontHeight: activeTimerState.settings.fontHeight || 1.6,
        fontWidth: activeTimerState.settings.fontWidth || 1.0,
        title: activeTimerState.settings.title || '',
        blackout: isBlackout,
        flash: isFlash,
        isEmpty: false,
        ...getActiveMessage()
      });
    } else if (timerIds.length === 0) {
      syncOutput({ 
        isEmpty: true,
        blackout: isBlackout,
        flash: isFlash,
        ...getActiveMessage()
      });
    }
  }, [activeTimerId, activeTimerState, syncOutput, isBlackout, isFlash, timerIds.length, messages, messageShownId, messageFlashId]);

  const openOutput = () => {
    if (activeTimerId && activeTimerState) {
      syncOutput({ 
        ...activeTimerState.syncState,
        totalTime: Math.max(0, Number(activeTimerState.settings.targetDuration ?? 0)),
        mode: activeTimerState.syncState.mode,
        segments: activeTimerState.settings.segments,
        fontHeight: activeTimerState.settings.fontHeight || 1.6,
        fontWidth: activeTimerState.settings.fontWidth || 1.0,
        title: activeTimerState.settings.title || '',
        blackout: isBlackout,
        flash: isFlash,
        type: 'force-sync',
        isEmpty: false,
        ...getActiveMessage()
      });
    } else if (timerIds.length === 0) {
      syncOutput({ 
        isEmpty: true,
        blackout: isBlackout,
        flash: isFlash,
        type: 'force-sync',
        ...getActiveMessage()
      });
    }
    window.open('/output', '_blank');
  };

  const handleFlash = () => {
    setIsFlashing(true);
    // Also flash the currently shown message (timer digits + message blink together)
    if (messageShownId) {
      const msg = messages.find(m => m.id === messageShownId);
      if (msg) {
        syncOutput({ messageText: msg.text || '', messageColor: msg.color || '#ffffff', messageBold: !!msg.bold, messageUppercase: !!msg.uppercase, messageFontHeight: getMessageFontSize(msg, 'fontHeight'), messageFontWidth: getMessageFontSize(msg, 'fontWidth'), messageFlash: true, type: 'force-sync' });
      }
    }
    let count = 0;
    const interval = setInterval(() => {
      setIsFlash(prev => !prev);
      count++;
      if (count >= 6) {
        clearInterval(interval);
        setIsFlash(false);
        setIsFlashing(false);
        syncOutput({ messageFlash: false, type: 'force-sync' });
      }
    }, 150);
  };
  const updateMessage = (id: string, text: string) => setMessages(prev => prev.map(m => m.id === id ? { ...m, text } : m));
  const updateMessageColor = (id: string, color: string) => setMessages(prev => prev.map(m => m.id === id ? { ...m, color } : m));
  const toggleMessageBold = (id: string) => setMessages(prev => prev.map(m => m.id === id ? { ...m, bold: !m.bold, text: m.text || '' } : m));
  const toggleMessageUppercase = (id: string) => setMessages(prev => prev.map(m => {
    if (m.id !== id) return m;
    return { ...m, uppercase: !m.uppercase, text: m.uppercase ? (m.text || '').toLowerCase() : (m.text || '').toUpperCase() };
  }));
  const updateMessageFontSize = (id: string, key: 'fontHeight' | 'fontWidth', value: number) => setMessages(prev => prev.map(m => m.id === id ? { ...m, [key]: value } : m));
  const getMessageFontSize = (msg: any, key: 'fontHeight' | 'fontWidth') => {
    const v = msg[key];
    if (typeof v === 'number' && v > 0) return v;
    return key === 'fontHeight' ? 1.0 : 1.0;
  };
  const deleteMessage = (id: string) => setMessages(prev => prev.length > 1 ? prev.filter(m => m.id !== id) : prev.map(m => m.id === id ? { ...m, text: '', color: '#ffffff', bold: false, uppercase: false } : m));
  const getActiveMessage = (): { messageText: string; messageColor: string; messageBold: boolean; messageUppercase: boolean; messageFontHeight: number; messageFontWidth: number; messageShown: boolean; messageFlash: boolean; messageMaximize: boolean } => {
    // Active message priority: currently flashing > shown
    const activeId = (messageFlashId && messages.some(m => m.id === messageFlashId)) ? messageFlashId
      : messageShownId;
    const msg = activeId ? (messages.find(m => m.id === activeId) || null) : null;
    const shownText = msg ? msg.text || '' : '';
    return {
      messageText: shownText,
      messageColor: msg?.color || '#ffffff',
      messageBold: !!msg?.bold,
      messageUppercase: !!msg?.uppercase,
      messageFontHeight: msg ? getMessageFontSize(msg, 'fontHeight') : 1.0,
      messageFontWidth: msg ? getMessageFontSize(msg, 'fontWidth') : 1.0,
      messageShown: !!messageShownId || !!messageFlashId,
      messageFlash: !!messageFlashId,
      // Show now acts as maximize: message only, no timer on Output
      messageMaximize: !!messageShownId || !!messageFlashId
    };
  };
  const showMessage = (id: string) => {
    // Toggle: if this message is currently shown, turn it off
    if (messageShownId === id) {
      setMessageShownId(null);
      syncOutput({ messageText: '', messageShown: false, messageMaximize: false, type: 'force-sync' });
      return;
    }
    // Show = full message on screen, no timer (on both Dashboard and Output)
    setMessageShownId(id);
    const msg = messages.find(m => m.id === id);
    if (msg) {
      syncOutput({ messageText: msg.text || '', messageColor: msg.color || '#ffffff', messageBold: !!msg.bold, messageUppercase: !!msg.uppercase, messageFontHeight: getMessageFontSize(msg, 'fontHeight'), messageFontWidth: getMessageFontSize(msg, 'fontWidth'), messageShown: true, messageMaximize: true, type: 'force-sync' });
    }
  };
  const flashMessage = (id: string) => {
    // Flash button: quick blink, does not latch the message
    setMessageFlashId(id);
    const msg = messages.find(m => m.id === id);
    if (msg) {
      syncOutput({ messageText: msg.text || '', messageColor: msg.color || '#ffffff', messageBold: !!msg.bold, messageUppercase: !!msg.uppercase, messageFontHeight: getMessageFontSize(msg, 'fontHeight'), messageFontWidth: getMessageFontSize(msg, 'fontWidth'), messageFlash: true, type: 'force-sync' });
    }
    setIsFlashing(true);
    let count = 0;
    const interval = setInterval(() => {
      setIsFlash(prev => !prev);
      count += 1;
      if (count >= 6) {
        clearInterval(interval);
        setIsFlash(false);
        setIsFlashing(false);
        setMessageFlashId(null);
        syncOutput({ messageFlash: false, type: 'force-sync' });
      }
    }, 250);
  };
  const moveMessage = (fromId: string, toId: string) => setMessages(prev => {
    const fromIdx = prev.findIndex(m => m.id === fromId);
    const toIdx = prev.findIndex(m => m.id === toId);
    if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return prev;
    const next = [...prev];
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved);
    return next;
  });
  const addMessage = () => setMessages(prev => [...prev, { id: Date.now().toString(), text: '', color: '#ffffff', bold: false, uppercase: false, fontHeight: 1.0, fontWidth: 1.0 }]);

  const goToNextTimer = () => {
    if (timerIds.length <= 1) return;
    const currentIndex = timerIds.indexOf(activeTimerId);
    const nextIndex = (currentIndex + 1) % timerIds.length;
    setActiveTimerId(timerIds[nextIndex]);
  };

  const currentTime = activeTimerState ? formatClock(activeTimerState.seconds) : '--:--';
  const displaySeconds = activeTimerState ? activeTimerState.seconds : 0;
  const displaySettings = activeTimerState ? activeTimerState.settings : { title: 'No Active Timer', segments: [] };
  // Keep every dashboard progress calculation on the same assigned duration.
  const activeTotalTime = Math.max(0, Number(activeTimerState?.settings?.targetDuration ?? 0));
  const activeProgressTotal = Math.max(activeTotalTime, 1);

  const getDashboardTextColor = () => {
    if (!activeTimerId) return '#333';
    const rounded = Math.floor(displaySeconds);
    if (rounded <= 0) return '#fa5252';
    const sorted = [...(displaySettings.segments || [])].sort((a, b) => a.threshold - b.threshold);
    for (const seg of sorted) {
      if (rounded <= seg.threshold) return seg.color;
    }
    return '#ffffff';
  };

  const getDashboardGlowColor = () => {
    if (!activeTimerId) return 'transparent';
    const color = getDashboardTextColor();
    if (color === '#ffffff') return 'rgba(255, 255, 255, 0.3)';
    if (color === '#fa5252') return 'rgba(250, 82, 82, 0.4)';
    if (color === '#f08c00') return 'rgba(240, 140, 0, 0.4)';
    if (color === '#22c55e') return 'rgba(34, 197, 94, 0.4)';
    return 'transparent';
  };

  const TIMEZONES = [
    'UTC', 'Africa/Cairo', 'Africa/Johannesburg', 'Africa/Lagos', 'Africa/Nairobi',
    'America/Anchorage', 'America/Argentina/Buenos_Aires', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'America/Mexico_City', 'America/New_York', 'America/Phoenix', 'America/Sao_Paulo',
    'Asia/Bangkok', 'Asia/Dubai', 'Asia/Hong_Kong', 'Asia/Jakarta', 'Asia/Jerusalem', 'Asia/Kolkata', 'Asia/Manila', 'Asia/Seoul', 'Asia/Shanghai', 'Asia/Singapore', 'Asia/Tokyo',
    'Australia/Adelaide', 'Australia/Brisbane', 'Australia/Melbourne', 'Australia/Perth', 'Australia/Sydney',
    'Europe/Amsterdam', 'Europe/Berlin', 'Europe/Brussels', 'Europe/London', 'Europe/Madrid', 'Europe/Moscow', 'Europe/Paris', 'Europe/Rome', 'Europe/Zurich',
    'Pacific/Auckland', 'Pacific/Honolulu', 'Pacific/Tahiti'
  ];

  return (
    <div className="flex h-screen flex-col bg-[#1a1a1a] text-white antialiased">
      <header className="flex items-center justify-between px-3 py-2 border-b border-[#333]">
        <input type="text" value={currentRoomName} onChange={(e) => setCurrentRoomName(e.target.value)} className="bg-transparent text-[20px] font-bold text-[#8a8a8a] outline-none focus:text-white transition-colors w-64" placeholder="Unnamed" />
        <div className="flex items-center gap-2">
          <button type="button" onClick={saveRoom} className="flex h-9 items-center gap-2 rounded-md bg-[#2d2d2d] px-4 text-[13px] text-white hover:bg-[#383838]"><IconSave className="mr-1" /> Save</button>
          <div className="relative">
            <button type="button" onClick={(e) => { e.stopPropagation(); setIsRoomMenuOpen(!isRoomMenuOpen); }} className="flex h-9 items-center gap-2 rounded-md bg-[#2d2d2d] px-4 text-[13px] text-white hover:bg-[#383838]">Room <IconChevronDown /></button>
            {isRoomMenuOpen && (
              <div onClick={(e) => e.stopPropagation()} className="absolute right-0 top-full z-50 mt-1 w-64 rounded-md border border-[#444] bg-[#242424] p-1 shadow-xl">
                <div className="px-2 py-1.5 text-[10px] uppercase tracking-wide text-[#777]">Saved Rooms</div>
                {rooms.map((room) => (
                  <div key={room.id} onClick={() => loadRoom(room)} className="group flex items-center justify-between rounded px-2 py-2 text-left text-[13px] text-white hover:bg-[#383838] cursor-pointer">
                    <span className="truncate">{room.name}</span>
                    <button onClick={(e) => { e.stopPropagation(); setRooms(rooms.filter(r => r.id !== room.id)); }} className="opacity-0 group-hover:opacity-100 text-[#fa5252] hover:text-red-400 p-1">✕</button>
                  </div>
                ))}
                <div className="mt-1 border-t border-[#333] pt-1"><button onClick={() => {
                  // Cleanly reset all app state so a new room starts empty:
                  // remove every per-timer key (settings/sync/seconds), clear the
                  // timer list, active id, messages, and any shown message.
                  Object.keys(localStorage).forEach(key => {
                    if (key.startsWith('timerSettings_') || key.startsWith('timerSync_') || key.startsWith('timerSeconds_')) {
                      localStorage.removeItem(key);
                    }
                  });
                  localStorage.removeItem('stage-timer-message-shown-id');
                  setCurrentRoomName('New Room');
                  setTimerIds([]);
                  setActiveTimerId('');
                  setActiveTimerState(null);
                  setMessages([{ id: '1', text: '', color: '#ffffff' }]);
                  setMessageShownId(null);
                  setMessageFlashId(null);
                  setIsRoomMenuOpen(false);
                }} className="w-full rounded px-2 py-2 text-left text-[12px] text-[#22c55e] hover:bg-[#383838]">+ Create New Room</button></div>
              </div>
            )}
          </div>
          <input type="file" ref={fileInputRef} onChange={(e) => { const file = e.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = (event) => { try { const imported = JSON.parse(event.target?.result as string); if (imported.rooms && Array.isArray(imported.rooms)) { setRooms(imported.rooms); if (imported.activeRoomName) { const activeRoom = imported.rooms.find((r: Room) => r.name === imported.activeRoomName); if (activeRoom) loadRoom(activeRoom); } } } catch (err) { console.error(err); } }; reader.readAsText(file); e.target.value = ''; }} accept=".json" className="hidden" />
          <button type="button" onClick={() => fileInputRef.current?.click()} className="flex h-9 items-center gap-2 rounded-md border border-[#444] bg-[#2d2d2d] px-4 text-[13px] text-white hover:bg-[#383838]"><IconUpload className="mr-1" /> Import</button>
          <button type="button" onClick={() => { const exportTimerSettings: Record<string, any> = {};
            timerIds.forEach(id => { const stored = localStorage.getItem(`timerSettings_${id}`); if (stored) exportTimerSettings[id] = JSON.parse(stored); });
            const exportData = { rooms: [...rooms, { id: Date.now().toString(), name: currentRoomName, timerIds, activeTimerId, messages, timerSettings: exportTimerSettings }], activeRoomName: currentRoomName, exportedAt: new Date().toISOString() }; const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `stage-timer-backup-${new Date().toISOString().split('T')[0]}.json`; link.click(); URL.revokeObjectURL(url); }} className="flex h-9 items-center gap-2 rounded-md border border-[#444] bg-[#2d2d2d] px-4 text-[13px] text-white hover:bg-[#383838]"><IconDownload className="mr-1" /> Export</button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <aside className="flex w-[420px] flex-col border-r border-[#333] px-4 py-3">
          <div className="mb-3 flex items-center justify-between"><h2 className="text-[17px] font-bold text-white">Dashboard</h2><button type="button" onClick={openOutput} className="flex h-8 items-center gap-2 rounded-md border border-[#444] bg-[#2d2d2d] px-3 text-[12px] text-white hover:bg-[#383838]"><IconScreen className="mr-1" /> Output Links</button></div>
          <div className={`relative flex w-full flex-col items-center justify-center rounded-lg border border-[#333] bg-[#141414] p-4 shadow-xl transition-all duration-300 min-h-[180px]`}>
            {isBlackout && <div className="absolute inset-0 z-10 rounded-lg bg-black" />}
            {(getActiveMessage().messageShown && getActiveMessage().messageText && !isBlackout) ? (
              <div className="flex h-full w-full items-center justify-center px-4 py-8">
                <div
                  className="text-center leading-tight break-words"
                  style={{
                    color: getActiveMessage().messageColor,
                    fontSize: `${Math.round(84 * getActiveMessage().messageFontHeight)}px`,
                    fontWeight: getActiveMessage().messageBold ? 800 : 700,
                    textTransform: getActiveMessage().messageUppercase ? 'uppercase' : 'none',
                    lineHeight: 1.1,
                    opacity: (isFlashing && !isFlash) ? 0.2 : 1,
                    textShadow: isFlash ? `0 0 20px ${getActiveMessage().messageColor}` : `0 2px 16px rgba(0,0,0,0.6), 0 0 40px ${getActiveMessage().messageColor}55`,
                    letterSpacing: '0.02em',
                    transform: `scaleX(${getActiveMessage().messageFontWidth})`,
                    transformOrigin: 'center'
                  }}
                >
                  {getActiveMessage().messageText}
                </div>
              </div>
            ) : (
              <div className="w-full">
                {displaySeconds < 0 && activeTimerState?.settings.mode === 'countdown' && (
                  <div className="flex items-center justify-center mb-2">
                    <span className="inline-block rounded bg-[#fa5252]/20 px-3 py-1 text-[12px] font-bold uppercase tracking-[0.2em] text-[#fa5252]">Overtime</span>
                  </div>
                )}
                <div className="flex items-center justify-center text-[13px] mb-2"><span className="font-bold text-[#7eb8ff] uppercase tracking-wider">{displaySettings.title}</span></div>
                <div 
                  className="digit flex w-full items-center justify-center text-center text-[100px] font-bold leading-none tracking-tighter transition-all duration-75 mb-4" 
                  style={{ 
                    color: getDashboardTextColor(), 
                    opacity: (isFlashing && !isFlash) ? 0 : 1,
                    textShadow: isFlash ? `0 0 40px ${getDashboardGlowColor()}` : 'none',
                    transform: `scale(${displaySettings.fontWidth || 1.0}, ${displaySettings.fontHeight || 1.6})`,
                    transformOrigin: 'center'
                  }}
                >
                  {displaySeconds < 0 && activeTimerState?.settings.mode === 'countdown' ? '+' + formatClock(Math.abs(displaySeconds)) : currentTime}
                </div>
                {activeTimerId && <ProgressBar currentSeconds={displaySeconds} totalSeconds={activeTotalTime} segments={displaySettings.segments} mode={activeTimerState?.syncState?.mode || displaySettings.mode} height="h-5" className="rounded-sm" />}
              </div>
            )}
          </div>

          {activeTimerId && (
            <>
              <div className="mt-4 flex items-center justify-center gap-4 text-[13px]">
                <span className="inline-block rounded border border-[#444] px-2 py-[1px] text-[10px] font-bold tracking-wider text-[#8a8a8a]">ON AIR</span>
                <div className="flex items-center gap-2 text-white">
                  <div className={`h-2 w-2 rounded-full ${hoverTime !== null ? 'bg-white shadow-[0_0_8px_rgba(255,255,255,0.8)]' : 'bg-[#444]'}`}></div>
                  <span className="font-mono text-[18px] font-bold tracking-tight">
                    {hoverTime !== null ? formatClock(hoverTime) : (displaySeconds < 0 && activeTimerState?.settings.mode === 'countdown' ? '+' + formatClock(Math.abs(displaySeconds)) : currentTime)}.{Math.floor(((hoverTime !== null ? hoverTime : displaySeconds) % 1) * 10)}
                  </span>
                </div>
              </div>

              <div className={`relative mt-6 group ${displaySeconds > 0 ? 'cursor-pointer' : 'cursor-not-allowed pointer-events-none'}`}
                onMouseMove={(e) => {
                  if (displaySeconds <= 0) return;
                  const rect = e.currentTarget.getBoundingClientRect();
                  const x = e.clientX - rect.left;
                  const percentage = Math.max(0, Math.min(1, x / rect.width));
                  const targetDuration = activeTotalTime;
                  setHoverTime(targetDuration * (1 - percentage));
                }}
                onMouseLeave={() => setHoverTime(null)}
                onClick={(e) => {
                  if (displaySeconds <= 0) return;
                  const rect = e.currentTarget.getBoundingClientRect();
                  const x = e.clientX - rect.left;
                  const percentage = Math.max(0, Math.min(1, x / rect.width));
                  const targetDuration = activeTotalTime;
                  const targetTime = targetDuration * (1 - percentage);
                  sendControl('SET', targetTime);
                }}
              >
                <div className="relative overflow-hidden rounded-md border border-[#333] bg-[#1a1a1a]">
                  <div className="grid grid-cols-7 gap-[1px] bg-[#333]">
                    {[1, 6/7, 5/7, 4/7, 3/7, 2/7, 1/7].map((factor, i) => {
                      const targetTime = (activeTimerState?.settings.targetDuration || 0) * factor;
                      return (
                        <div key={i} className="bg-[#1a1a1a] px-2 py-2 text-left text-[10px] leading-none text-[#555] border-r border-[#333] last:border-r-0 font-mono truncate h-9">
                          {formatClock(targetTime)}
                        </div>
                      );
                    })}
                  </div>
                  
                  <ProgressBar currentSeconds={displaySeconds} totalSeconds={activeTotalTime} segments={displaySettings.segments} mode={activeTimerState?.syncState?.mode || displaySettings.mode} height="h-[3px]" className="absolute bottom-0 left-0 right-0" />
                  
                  {/* Red Playhead Marker */}
                  <div 
                    className="absolute top-0 bottom-0 w-[2px] bg-[#fa5252] pointer-events-none z-20"
                    style={{ 
                      left: `${Math.max(0, Math.min(100, (1 - (displaySeconds / activeProgressTotal)) * 100))}%`,
                      transition: activeTimerState?.isRunning ? 'none' : 'left 0.1s linear'
                    }}
                  >
                    {/* The Flag Shape from the image */}
                    <div className="absolute -top-[1px] left-1/2 -translate-x-1/2 w-5 h-3.5 bg-[#fa5252] rounded-[2px]" style={{ clipPath: 'polygon(0% 0%, 100% 0%, 100% 70%, 50% 100%, 0% 70%)' }} />
                  </div>

                  {/* Hover Playhead Marker */}
                  {hoverTime !== null && (
                    <div 
                      className="absolute top-0 bottom-0 w-[1px] bg-white/50 pointer-events-none z-0"
                      style={{ 
                        left: `${Math.max(0, Math.min(100, (1 - (hoverTime / activeProgressTotal)) * 100))}%`
                      }}
                    />
                  )}
                </div>
              </div>
            </>
          )}
          <div className="mt-4 grid grid-cols-7 gap-2">
            <div className="relative">
              <button type="button" onClick={(e) => { e.stopPropagation(); setOpenAdjustMenu(openAdjustMenu === 'decrease' ? null : 'decrease'); }} className={`flex h-10 w-full items-center justify-center rounded border border-[#333] bg-[#2d2d2d] hover:bg-[#383838] transition-colors ${openAdjustMenu === 'decrease' ? 'bg-[#383838] border-[#555]' : ''}`}><IconChevronDown /></button>
              {openAdjustMenu === 'decrease' && (<div onClick={(e) => e.stopPropagation()} className="absolute bottom-full left-0 z-50 mb-1"><TimeAdjustMenu direction="decrease" onSelect={(secs) => sendControl('ADJUST', secs)} onClose={() => setOpenAdjustMenu(null)} /></div>)}
            </div>
            <button onClick={() => sendControl('ADJUST', -60)} className="col-span-1 flex h-10 items-center justify-center rounded border border-[#333] bg-[#2d2d2d] text-[14px] font-bold hover:bg-[#383838] transition-colors">-1m</button>
            <button onClick={() => sendControl('RESET')} className="col-span-1 flex h-10 items-center justify-center rounded border border-[#333] bg-[#2d2d2d] hover:bg-[#383838] transition-colors" title="Reset current timer"><IconSkipBack /></button>
            <button onClick={() => sendControl(activeTimerState?.isRunning ? 'PAUSE' : 'START')} className="col-span-1 flex h-10 items-center justify-center rounded border border-[#333] bg-[#2d2d2d] hover:bg-[#383838] transition-colors">{activeTimerState?.isRunning ? <IconPause /> : <IconPlay className="text-[#22c55e]" />}</button>
            <button onClick={goToNextTimer} className="col-span-1 flex h-10 items-center justify-center rounded border border-[#333] bg-[#2d2d2d] hover:bg-[#383838] transition-colors" title="Next timer"><IconSkipForward /></button>
            <button onClick={() => sendControl('ADJUST', 60)} className="col-span-1 flex h-10 items-center justify-center rounded border border-[#333] bg-[#2d2d2d] text-[14px] font-bold hover:bg-[#383838] transition-colors">+1m</button>
            <div className="relative">
              <button type="button" onClick={(e) => { e.stopPropagation(); setOpenAdjustMenu(openAdjustMenu === 'increase' ? null : 'increase'); }} className={`flex h-10 w-full items-center justify-center rounded border border-[#333] bg-[#2d2d2d] hover:bg-[#383838] transition-colors ${openAdjustMenu === 'increase' ? 'bg-[#383838] border-[#555]' : ''}`}><IconChevronDown /></button>
              {openAdjustMenu === 'increase' && (<div onClick={(e) => e.stopPropagation()} className="absolute bottom-full right-0 z-50 mb-1"><TimeAdjustMenu direction="increase" onSelect={(secs) => sendControl('ADJUST', secs)} onClose={() => setOpenAdjustMenu(null)} /></div>)}
            </div>
          </div>
          <div className="mt-6 flex flex-col items-center">
            <div className="flex items-center gap-2 text-[14px] font-medium text-[#c9c9c9]">
              <IconClock />
              <span>{wallClock}</span>
              <div className="relative">
                <button 
                  type="button"
                  className="flex items-center gap-1 rounded px-2 py-1 text-[#8a8a8a] transition-all hover:bg-[#2d2d2d] hover:text-white"
                  onClick={(e) => { e.stopPropagation(); setIsTimeZoneMenuOpen(!isTimeZoneMenuOpen); }}
                  title="Click to change timezone"
                >
                  <span>{timeZone}</span>
                  <IconChevronDown />
                </button>
                {isTimeZoneMenuOpen && (
                  <div className="absolute bottom-full left-1/2 z-50 mb-1 max-h-64 w-64 -translate-x-1/2 overflow-y-auto rounded-md border border-[#444] bg-[#242424] p-1 shadow-xl custom-scrollbar">
                    <div className="px-2 py-1.5 text-[10px] uppercase tracking-wide text-[#777]">Select Timezone</div>
                    {TIMEZONES.map((tz) => (
                      <div 
                        key={tz} 
                        onClick={() => { setSelectedTimeZone(tz); setIsTimeZoneMenuOpen(false); }}
                        className={`rounded px-2 py-1.5 text-left text-[12px] hover:bg-[#383838] cursor-pointer ${selectedTimeZone === tz ? 'text-[#22c55e] bg-[#2d2d2d]' : 'text-white'}`}
                      >
                        {tz.replace('_', ' ')}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-4 text-center">
            <div className="flex flex-col items-center">
              <span className="text-[12px] uppercase tracking-wider text-[#8a8a8a]">Cue finish</span>
              <span className="mt-1 text-[17px] font-bold tabular-nums text-white">{activeTimerId ? cueFinish : '--:--'}</span>
            </div>
            <div className="flex flex-col items-center">
              <span className="text-[12px] uppercase tracking-wider text-[#8a8a8a]">Over/Under</span>
              <span className="mt-1 text-[17px] font-bold tabular-nums text-white">{activeTimerId ? overUnder : '--:--'}</span>
            </div>
          </div>
        </aside>

        <main className="flex flex-1 flex-col px-10 py-6 bg-[#141414] overflow-y-auto custom-scrollbar">
          <div className="mb-8 flex items-center justify-between">
            <h2 className="text-[24px] font-bold text-white tracking-tight">Timers</h2>
            <div className="flex items-center gap-3">
              <button 
                type="button" 
                onClick={() => setIsBlackout(!isBlackout)} 
                className={`flex h-8 items-center gap-2 rounded-lg border px-4 text-[13px] font-bold transition-all ${isBlackout ? 'bg-white text-black border-white shadow-[0_0_15px_rgba(255,255,255,0.3)]' : 'bg-[#2d2d2d] text-white border-[#444] hover:bg-[#383838]'}`}
              >
                <IconCircle /> Blackout
              </button>
              <button 
                type="button" 
                onClick={handleFlash} 
                className="flex h-8 items-center gap-2 rounded-lg border border-[#444] bg-[#2d2d2d] px-4 text-[13px] font-bold text-white hover:bg-[#383838] transition-all"
              >
                <IconFlash /> Flash
              </button>
              <div className="relative">
                <button 
                  type="button" 
                  onClick={(e) => { e.stopPropagation(); setIsTimersMenuOpen(!isTimersMenuOpen); }}
                  className={`flex h-8 w-10 items-center justify-center rounded-lg border border-[#444] bg-[#2d2d2d] text-white hover:bg-[#383838] transition-all ${isTimersMenuOpen ? 'bg-[#383838] border-[#555]' : ''}`}
                >
                  <IconMore size={20} />
                </button>
                {isTimersMenuOpen && (
                  <div onClick={(e) => e.stopPropagation()} className="absolute right-0 top-full z-50 mt-1 w-56 rounded-md border border-[#444] bg-[#242424] p-1 shadow-xl">
                    <button 
                      onClick={() => setIsFollowEnabled(!isFollowEnabled)}
                      className="flex w-full items-center justify-between rounded px-3 py-2 text-left text-[13px] text-white hover:bg-[#383838]"
                    >
                      <span>Follow active timer</span>
                      <div className={`h-4 w-4 rounded border ${isFollowEnabled ? 'bg-[#22c55e] border-[#22c55e]' : 'border-[#555]'}`}>
                        {isFollowEnabled && <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>}
                      </div>
                    </button>

                  </div>
                )}
              </div></div></div>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd} modifiers={[restrictToVerticalAxis]}><SortableContext items={timerIds} strategy={verticalListSortingStrategy}><div className="space-y-4">{timerIds.map((id, index) => (              <TimerRow
                key={id}
                id={id}
                index={index}
                isActive={activeTimerId === id}
                scheduledStart={schedule[id]?.start ?? null}
                formatTime={formatScheduledTime}
                selectedTimeZone={selectedTimeZone}
                onActivate={() => {
                  // When a different timer is selected, stop the currently
                  // playing one so only one timer runs at a time, then move
                  // the selection to the newly chosen timer.
                  const currentlyRunning = activeTimerState?.isRunning;
                  if (currentlyRunning && activeTimerId && activeTimerId !== id) {
                    try {
                      const channel = new BroadcastChannel(CONTROL_CHANNEL);
                      channel.postMessage({ targetId: activeTimerId, command: 'PAUSE' });
                      channel.postMessage({ command: 'PAUSE_ALL_EXCEPT', payload: id });
                      channel.close();
                    } catch { /* ignore */ }
                    window.dispatchEvent(new CustomEvent('stage-timer-pause-all-except', { detail: id }));
                  }
                  setActiveTimerId(id);
                }}
                onSync={setActiveTimerState}
                onAddAbove={() => addTimer(index)}
                onAddBelow={() => addTimer(index + 1)}
                onDuplicate={() => duplicateTimer(id, index)}
                onDelete={() => deleteTimer(id)}
                onApplyToAll={applyToAllSettings}
                onSettingsUpdate={() => setSettingsVersion(v => v + 1)}
              />))}</div></SortableContext></DndContext>
          <div className="mt-10 flex justify-center">
            <button 
              type="button" 
              onClick={() => addTimer()} 
              className="flex items-center gap-2 rounded-lg border border-[#444] bg-[#262626] px-6 py-2 text-[14px] font-bold text-white hover:bg-[#2d2d2d] hover:border-[#555] transition-all shadow-md active:scale-95"
            >
              + Add Timer
            </button>
          </div>
        </main>

        <aside className="flex w-[380px] flex-col border-l border-[#333] px-4 py-3">
          <div className="mb-4 flex items-center justify-between"><div className="flex items-center gap-3"><h2 className="text-[17px] font-bold text-white">Messages</h2></div><button type="button" onClick={() => { if (messageShownId) { flashMessage(messageShownId); } }} className="flex h-8 w-8 items-center justify-center rounded border border-[#555] bg-transparent text-white hover:bg-[#333]" title="Flash the currently shown message on Output"><IconFlash size={14} /></button></div>
          <div className="space-y-2 overflow-y-auto custom-scrollbar pr-1">{messages.map((msg, idx) => {
            const mFontH = getMessageFontSize(msg, 'fontHeight');
            const mFontW = getMessageFontSize(msg, 'fontWidth');
            const isShown = messageShownId === msg.id;
            const cardActive = isShown;
            return (
            <div key={msg.id} className={`group relative rounded-lg px-3 py-2 shadow-md transition-colors ${cardActive ? 'bg-[#b02a2a] border border-[#c43c3c]' : 'border border-[#333] bg-[#2d2d2d]'}`}>
              {draggingMsgId === msg.id && <div className="absolute inset-0 z-20 rounded-lg bg-[#4a9eff]/10 pointer-events-none" />}
              {/* Whole card is the drag surface */}
              <div
                draggable
                onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', msg.id); setDraggingMsgId(msg.id); }}
                onDragEnd={() => setDraggingMsgId(null)}
                onDragOver={(e) => { if (draggingMsgId && draggingMsgId !== msg.id) e.preventDefault(); }}
                onDrop={(e) => { e.preventDefault(); const fromId = e.dataTransfer.getData('text/plain'); if (fromId) moveMessage(fromId, msg.id); setDraggingMsgId(null); }}
                className="flex flex-col gap-1.5"
              >
                {/* Row 1: number + live preview textarea + drag grip + delete */}
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-bold text-[#8a8a8a] cursor-grab active:cursor-grabbing" title="Drag to reorder">{idx + 1}</span>
                  <textarea
                    value={msg.text}
                    onChange={(e) => updateMessage(msg.id, e.target.value)}
                    placeholder="Enter message ..."
                    rows={2}
                    draggable={false}
                    className="min-h-[48px] max-h-[110px] flex-1 resize-y rounded-md border border-[#444] bg-[#1c1c1c] px-2.5 py-1.5 text-[13px] text-white outline-none focus:border-[#555]"
                    style={{
                      color: msg.color,
                      fontWeight: msg.bold ? 700 : 400,
                      textTransform: msg.uppercase ? 'uppercase' : 'none'
                    }}
                  />
                  {/* Drag grip + delete (always visible) */}
                  <div className="flex items-center gap-1">
                    <span className={`px-1 cursor-grab active:cursor-grabbing ${cardActive ? 'text-white/70 hover:text-white' : 'text-[#555] hover:text-[#8a8a8a]'}`} title="Drag to reorder">
                      <svg width="12" height="14" viewBox="0 0 12 14" fill="currentColor"><rect x="1" y="1" width="10" height="2" rx="1"/><rect x="1" y="6" width="10" height="2" rx="1"/><rect x="1" y="11" width="10" height="2" rx="1"/></svg>
                    </span>
                    <button
                      type="button"
                      onClick={() => deleteMessage(msg.id)}
                      className={`flex items-center justify-center ${cardActive ? 'text-white/70 hover:text-white' : 'text-[#666] hover:text-[#fa5252]'}`}
                      title="Delete message"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                    </button>
                  </div>
                </div>
                {/* Row 2: formatting + sliders (wraps) | Show/Maximize pinned right (never covered) */}
                <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                  {/* White swatch */}
                  <button type="button"                       onClick={() => updateMessageColor(msg.id, '#ffffff')} className={`pb-0.5 text-[14px] font-bold transition-all border-b-2 ${msg.color === '#ffffff' ? 'border-[#ffffff]' : 'border-transparent hover:border-[#888]'}`} style={{ color: '#ffffff' }} title="White text">A</button>
                  {/* Green swatch */}
                  <button type="button"                       onClick={() => updateMessageColor(msg.id, '#22c55e')} className={`pb-0.5 text-[14px] font-bold transition-all border-b-2 ${msg.color === '#22c55e' ? 'border-[#22c55e]' : 'border-transparent hover:border-[#888]'}`} style={{ color: '#22c55e' }} title="Green text">A</button>
                  {/* Red swatch */}
                  <button type="button"                       onClick={() => updateMessageColor(msg.id, '#fa5252')} className={`pb-0.5 text-[14px] font-bold transition-all border-b-2 ${msg.color === '#fa5252' ? 'border-[#fa5252]' : 'border-transparent hover:border-[#888]'}`} style={{ color: '#fa5252' }} title="Red text">A</button>
                  {/* Bold */}
                  <button type="button"                       onClick={() => toggleMessageBold(msg.id)} className={`pb-0.5 text-[14px] transition-all border-b-2 ${msg.bold ? 'border-[#ffffff]' : 'border-transparent hover:border-[#888]'}`} style={{ color: '#ffffff', fontWeight: 700 }} title="Bold text">B</button>
                  {/* Uppercase */}
                  <button type="button"                       onClick={() => toggleMessageUppercase(msg.id)} className={`pb-0.5 text-[14px] transition-all border-b-2 ${msg.uppercase ? 'border-[#ffffff]' : 'border-transparent hover:border-[#888]'}`} style={{ color: '#ffffff', fontWeight: 700 }} title="Uppercase text">āA</button>
                  {/* Message font height slider */}
                  <div className="flex items-center gap-1.5 ml-2 border-l border-[#444] pl-2">
                    <span className="text-[10px] uppercase text-[#666]">H</span>
                    <input type="range" min="0.5" max="3.0" step="0.1" value={mFontH} onChange={(e) => updateMessageFontSize(msg.id, 'fontHeight', parseFloat(e.target.value))} className="w-12 accent-[#4a9eff]" title="Message height (Output only)" />
                    <span className="w-6 font-mono text-[10px] text-[#8a8a8a]">{mFontH.toFixed(1)}</span>
                  </div>
                  {/* Message font width slider */}
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] uppercase text-[#666]">W</span>
                    <input type="range" min="0.5" max="3.0" step="0.1" value={mFontW} onChange={(e) => updateMessageFontSize(msg.id, 'fontWidth', parseFloat(e.target.value))} className="w-12 accent-[#4a9eff]" title="Message width (Output only)" />
                    <span className="w-6 font-mono text-[10px] text-[#8a8a8a]">{mFontW.toFixed(1)}</span>
                  </div>
                  </div>
                  {/* Show / Flash / Maximize group — pinned far right (shrink-0 so never covered) */}
                  <div className="ml-auto flex shrink-0 items-center overflow-hidden rounded-md border border-[#444]">
                    <button
                      type="button"
                      onClick={() => showMessage(msg.id)}
                      className={`flex items-center gap-1.5 px-2 py-1 text-[12px] font-bold transition-colors ${messageShownId === msg.id ? 'bg-[#e5484d]/90 text-white' : 'bg-[#1c1c1c] text-white hover:bg-[#252525]'}`}
                      title="Show message on screen (message only, no timer)"
                    >
                      <span className={`inline-block h-2 w-2 rounded-full ${messageShownId === msg.id ? 'bg-[#4a9eff]' : 'bg-[#555]'}`} />
                      Show
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );})}</div>
          <div className="mt-6 space-y-4"><button type="button" onClick={addMessage} className="flex w-full items-center justify-center rounded-lg border border-[#444] bg-[#2d2d2d] px-6 py-2.5 text-[14px] font-bold text-white hover:bg-[#383838] shadow-md">+ Add Message</button></div>
        </aside>
      </div>

      <footer className="flex items-center justify-between border-t border-[#333] bg-[#1a1a1a] px-4 py-2 text-[11px] text-[#666]">
        <div className="flex items-center gap-4"></div>
        {(() => {
          const durations = timerIds.map(id => {
            const stored = localStorage.getItem(`timerSettings_${id}`);
            return stored ? (JSON.parse(stored).targetDuration || 0) : 0;
          });
          const total = durations.reduce((a, b) => a + b, 0);
          const activeIdx = activeTimerId ? timerIds.indexOf(activeTimerId) : -1;
          let elapsed = 0;
          for (let i = 0; i < Math.min(activeIdx, timerIds.length); i++) elapsed += durations[i];
          const activeDuration = activeIdx >= 0 ? (durations[activeIdx] || 0) : 0;
          if (activeIdx >= 0 && total > 0) {
            elapsed += Math.max(0, Math.min(activeDuration, activeDuration - displaySeconds));
          }
          const scrubberPct = total > 0 ? Math.min(1, Math.max(0, elapsed / total)) : 0;
          const endLabel = total === 0 ? '0:00' : '-' + formatClock(total);
          // Left label: elapsed position (HH:MM:SS while running), or 0:00 before start
          const leftLabel = total > 0 && activeIdx >= 0 ? formatClock(Math.min(elapsed, total)) : '0:00';
          return (
            <div className="flex flex-1 items-center gap-3 px-4">
              <span className="tabular-nums shrink-0 text-white">{leftLabel}</span>
              {/* Combined timeline: one single track layer with clipped segments on the same baseline */}
              <div className="relative flex flex-1 items-center self-center mx-2">
                {/* Base track */}
                <div className="absolute inset-y-0 my-auto h-1 w-full rounded-full bg-[#333]"></div>
                {/* Elapsed portion (dark gray) — clipped at the scrubber, same baseline as track */}
                <div className="absolute inset-y-0 my-auto h-1 w-full overflow-hidden rounded-full" style={{ clipPath: `inset(0 ${100 - scrubberPct * 100}% 0 0)` }}>
                  <div className="h-1 w-full rounded-full bg-[#666]"></div>
                </div>
                {/* Remaining portion (white) — clipped after the scrubber */}
                <div className="absolute inset-y-0 my-auto h-1 w-full overflow-hidden rounded-full" style={{ clipPath: `inset(0 0 0 ${scrubberPct * 100}%)` }}>
                  <div className="h-1 w-full rounded-full bg-white"></div>
                </div>
                {/* Thin vertical separators between stages — same height and baseline as the track */}
                {timerIds.length > 1 && durations.slice(0, -1).map((_, i) => {
                  let cum = durations[0]; for (let j = 1; j <= i; j++) cum += durations[j];
                  return <div key={`tick-${i}`} className="absolute inset-y-0 my-auto z-10 h-2.5 w-px bg-[#888]" style={{ left: `${(cum / total) * 100}%` }}></div>;
                })}
                {/* Blue position marker centered on the same baseline */}
                <div className="h-4 w-4 rounded-full bg-[#3b82f6] shadow-lg cursor-pointer hover:scale-110 transition-transform duration-300 absolute my-auto -translate-x-1/2 z-20" style={{ left: `${scrubberPct * 100}%` }}></div>
              </div>
              <span className="tabular-nums shrink-0 text-white">{endLabel}</span>
            </div>
          );
        })()}
      </footer>
    </div>
  );
}

export default App;

// Fresh build trigger

// Final UI cleanup verification: sound and flash options removed from all threshold rows.
