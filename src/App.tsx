import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useTimer } from './hooks/useTimer';
import { ProgressBar } from './components/ProgressBar';
import { MessageStage } from './components/MessageStage';
import { useLocalStorage } from './hooks/useLocalStorage';
import { postSharedMessage, subscribeSharedChannel } from './lib/sharedChannel';
import { readJsonStorage } from './lib/storage';
import { mergeItemById, mergeItemsById } from './lib/roomStorage';
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

const getZonedDateTimeTimestamp = (dateValue: string, secondsSinceMidnight: number, timeZone: string): number => {
  const [year, month, day] = dateValue.split('-').map(Number);
  const hours = Math.floor(secondsSinceMidnight / 3600) % 24;
  const minutes = Math.floor((secondsSinceMidnight % 3600) / 60);
  const seconds = Math.floor(secondsSinceMidnight % 60);
  const targetAsUtc = Date.UTC(year, month - 1, day, hours, minutes, seconds);
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  let timestamp = targetAsUtc;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const parts = formatter.formatToParts(new Date(timestamp));
    const values = Object.fromEntries(parts.filter(part => part.type !== 'literal').map(part => [part.type, Number(part.value)]));
    const zonedAsUtc = Date.UTC(values.year, values.month - 1, values.day, values.hour % 24, values.minute, values.second);
    timestamp = targetAsUtc - (zonedAsUtc - timestamp);
  }
  return timestamp / 1000;
};

const createId = (prefix: string) => `${prefix}_${typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now()}_${Math.random().toString(36).slice(2)}`}`;

const normalizeTimerSettingsForTransfer = (settings: Record<string, any>) => {
  const rawStart = settings.scheduledStart;
  const scheduledStart = Number.isFinite(rawStart)
    ? Math.max(0, Math.min(86399, Math.floor(rawStart)))
    : null;
  const rawDate = settings.scheduledStartDate;
  const scheduledStartDate = typeof rawDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(rawDate)
    ? rawDate
    : null;
  return { ...settings, scheduledStart, scheduledStartDate };
};

const DurationInput = ({ value, onChange }: { value: number, onChange: (val: number) => void }) => {
  const [hStr, setHStr] = useState(pad(Math.floor(value / 3600)));
  const [mStr, setMStr] = useState(pad(Math.floor((value % 3600) / 60)));
  const [sStr, setSStr] = useState(pad(value % 60));
  
  const minRef = useRef<HTMLInputElement>(null);
  const secRef = useRef<HTMLInputElement>(null);

  // Sync local state if value prop changes from outside (e.g. Apply to All)
  useEffect(() => {
    const h = Math.floor(value / 3600);
    const m = Math.floor((value % 3600) / 60);
    const s = value % 60;
    const currentLocalTotal = (parseInt(hStr) || 0) * 3600 + (parseInt(mStr) || 0) * 60 + (parseInt(sStr) || 0);
    if (value !== currentLocalTotal) {
      setHStr(pad(h));
      setMStr(pad(m));
      setSStr(pad(s));
    }
  }, [value, hStr, mStr, sStr]);

  const handleChange = (type: 'h'|'m'|'s', val: string) => {
    // Allow numbers only. Hours can be many digits, min/sec usually 2.
    const clean = val.replace(/\D/g, '');
    const limited = type === 'h' ? clean.slice(0, 3) : clean.slice(0, 2);
    
    let nextH = hStr, nextM = mStr, nextS = sStr;

    if (type === 'h') {
      nextH = limited;
      setHStr(limited);
      if (limited.length >= 2 && val.length > hStr.length) minRef.current?.focus();
    } else if (type === 'm') {
      nextM = limited;
      setMStr(limited);
      if (limited.length >= 2 && val.length > mStr.length) secRef.current?.focus();
    } else {
      nextS = limited;
      setSStr(limited);
    }

    const h = parseInt(nextH) || 0;
    const m = parseInt(nextM) || 0;
    const s = parseInt(nextS) || 0;
    // Only trigger onChange if we have a valid number, to avoid jumping during typing
    onChange(h * 3600 + m * 60 + s);
  };

  const handleBlur = () => {
    setHStr(pad(parseInt(hStr) || 0));
    setMStr(pad(parseInt(mStr) || 0));
    setSStr(pad(parseInt(sStr) || 0));
  };

  const inputClass = "w-16 rounded border border-[#333] bg-[#141414] px-2 py-2 text-[18px] font-mono text-white text-center focus:outline-none focus:border-[#4a9eff] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none transition-colors";

  return (
    <div className="flex items-center gap-2">
      <div className="flex flex-col items-center gap-1">
        <input 
          type="text" 
          inputMode="numeric"
          autoComplete="off"
          value={hStr} 
          onChange={(e) => handleChange('h', e.target.value)}
          onBlur={handleBlur}
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
          value={mStr} 
          onChange={(e) => handleChange('m', e.target.value)}
          onBlur={handleBlur}
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
          value={sStr} 
          onChange={(e) => handleChange('s', e.target.value)}
          onBlur={handleBlur}
          onFocus={(e) => e.target.select()}
          className={inputClass}
        />
        <span className="text-[10px] uppercase tracking-tighter text-[#555]">Seconds</span>
      </div>
    </div>
  );
};

const StartTimeInput = ({ value, dateValue, onChange, selectedTimeZone }: { value: number | null, dateValue?: string | null, onChange: (val: number | null, date?: string | null) => void, selectedTimeZone: string }) => {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: selectedTimeZone,
    hour12: false,
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric'
  });
  const [hNow, mNow, sNow] = formatter.format(now).split(':').map(Number);
  const secondsSinceMidnight = hNow * 3600 + mNow * 60 + sNow;
  const displayValue = value === null ? secondsSinceMidnight : value;
  const h24 = Math.floor(displayValue / 3600) % 24;
  const minute = Math.floor((displayValue % 3600) / 60);
  const second = displayValue % 60;
  const period = h24 >= 12 ? 'PM' : 'AM';
  const hour12 = h24 % 12 || 12;
  const todayInZone = new Intl.DateTimeFormat('en-CA', { timeZone: selectedTimeZone }).format(now);
  const selectedDate = dateValue || todayInZone;

  const update = (nextHour12: number, nextMinute: number, nextSecond: number, nextPeriod: string, nextDate = selectedDate) => {
    let nextHour24 = nextHour12 % 12;
    if (nextPeriod === 'PM') nextHour24 += 12;
    onChange(nextHour24 * 3600 + nextMinute * 60 + nextSecond, nextDate || null);
  };

  const selectClass = "w-[72px] rounded border border-[#333] bg-[#141414] px-2 py-2 text-center text-[16px] font-mono text-white focus:border-[#4a9eff] focus:outline-none";
  const options = (count: number, padValue = true) => Array.from({ length: count }, (_, index) => ({ value: index, label: padValue ? pad(index) : String(index) }));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="manual-start"
          checked={value !== null}
          onChange={(e) => onChange(e.target.checked ? displayValue : null, e.target.checked ? selectedDate : null)}
          className="h-4 w-4 rounded border-[#333] bg-[#141414] accent-[#4a9eff]"
        />
        <label htmlFor="manual-start" className="cursor-pointer text-[13px] text-[#8a8a8a]">Set Specific Start Time</label>
      </div>
      {value !== null && (
        <div className="ml-6 flex flex-col gap-3">
          <div className="flex items-center gap-2 rounded border border-[#333] bg-[#141414] p-2">
            <select value={hour12} onChange={(e) => update(Number(e.target.value), minute, second, period)} className={selectClass} aria-label="Start hour">
              {Array.from({ length: 12 }, (_, index) => index + 1).map(hour => <option key={hour} value={hour}>{pad(hour)}</option>)}
            </select>
            <span className="text-xl font-bold text-[#444]">:</span>
            <select value={minute} onChange={(e) => update(hour12, Number(e.target.value), second, period)} className={selectClass} aria-label="Start minute">
              {options(60).map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
            <span className="text-xl font-bold text-[#444]">:</span>
            <select value={second} onChange={(e) => update(hour12, minute, Number(e.target.value), period)} className={selectClass} aria-label="Start second">
              {options(60).map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
            <select value={period} onChange={(e) => update(hour12, minute, second, e.target.value)} className={selectClass} aria-label="Start period">
              <option value="AM">AM</option>
              <option value="PM">PM</option>
            </select>
          </div>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => update(hour12, minute, second, period, e.target.value)}
            className="w-full rounded border border-[#333] bg-[#141414] px-3 py-2 text-[14px] font-mono text-white focus:border-[#4a9eff] focus:outline-none"
            aria-label="Start date"
          />
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
  
  if (hours > 0) {
    return `${neg ? '-' : ''}${hours}:${pad(minutes)}:${pad(secs)}`;
  }
  return `${neg ? '-' : ''}${pad(minutes)}:${pad(secs)}`;
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
const IconLogo = ({ size = 20 }: IconProps) => (
  <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" id="Timer--Streamline-Radix" height={size} width={size}>
    <path fillRule="evenodd" clipRule="evenodd" d="M7.999978666666666 0.9066410666666666c-0.29456 0 -0.5333333333333333 0.2387776 -0.5333333333333333 0.5333376v2.3171839999999997c0 0.2945493333333333 0.2387733333333333 0.5333333333333333 0.5333333333333333 0.5333333333333333 0.2945493333333333 0 0.5333333333333333 -0.238784 0.5333333333333333 -0.5333333333333333V1.9965866666666665C11.611946666666666 2.266538666666667 14.026666666666667 4.8512640000000005 14.026666666666667 7.999978666666666c0 3.3284480000000003 -2.6982399999999997 6.026687999999999 -6.026687999999999 6.026687999999999 -3.3284373333333335 0 -6.026666666666667 -2.6982399999999997 -6.026666666666667 -6.026687999999999 0 -1.486784 0.5376960000000001 -2.846613333333333 1.4298773333333334 -3.8976853333333334 0.19061333333333333 -0.22455466666666668 0.16309333333333334 -0.5611200000000001 -0.061472 -0.7517333333333334 -0.22455466666666668 -0.19061333333333333 -0.5611200000000001 -0.16309333333333334 -0.7517333333333334 0.06146133333333333C1.5403200000000001 4.648618666666667 0.9066410666666666 6.250976 0.9066410666666666 7.999978666666666c0 3.9175679999999997 3.1757909333333334 7.0933546666666665 7.0933376 7.0933546666666665 3.9175679999999997 0 7.0933546666666665 -3.1757866666666668 7.0933546666666665 -7.0933546666666665 0 -3.9175466666666665 -3.1757866666666668 -7.0933376 -7.0933546666666665 -7.0933376ZM7.189856 8.619434666666667 4.5052053333333335 4.877194666666667c-0.07607466666666667 -0.10604799999999999 -0.06418133333333334 -0.2515733333333333 0.028106666666666665 -0.3438613333333333 0.09227733333333334 -0.092288 0.23781333333333335 -0.10418133333333335 0.34385066666666664 -0.028106666666666665l3.7422400000000002 2.6846506666666663c0.5136853333333333 0.368512 0.5742613333333333 1.10976 0.12724266666666667 1.5567893333333334 -0.44702933333333333 0.44702933333333333 -1.1882773333333332 0.38644266666666666 -1.5567893333333334 -0.12723199999999998Z" fill="#22c55e"></path>
  </svg>
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

  const segments = Array.isArray(localSettings.segments) ? localSettings.segments : [];
  const yellowSegment = segments.find((s: any) => s.color === '#f08c00') || { threshold: 60, color: '#f08c00' };
  const redSegment = segments.find((s: any) => s.color === '#fa5252') || { threshold: 10, color: '#fa5252' };
  const previewTotalSeconds = Math.max(1, Number(localSettings.targetDuration) || 0);
  const previewRedWidth = Math.min(100, (Math.max(0, Number(redSegment.threshold) || 0) / previewTotalSeconds) * 100);
  const previewYellowWidth = Math.min(100 - previewRedWidth, (Math.max(0, Number(yellowSegment.threshold) - Number(redSegment.threshold)) / previewTotalSeconds) * 100);
  const previewGreenWidth = Math.max(0, 100 - previewYellowWidth - previewRedWidth);
  const updateWarningSegment = (color: string, threshold: number) => {
    const index = segments.findIndex((segment: any) => segment.color === color);
    const nextSegments = index >= 0
      ? segments.map((segment: any, segmentIndex: number) => segmentIndex === index ? { ...segment, threshold } : segment)
      : [...segments, { color, threshold }];
    setLocalSettings({ ...localSettings, segments: nextSegments });
  };

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
            <h2 className="text-lg font-bold text-white">Settings{localSettings.title ? ` for ${localSettings.title}` : ''}</h2>
          </div>
          <button onClick={onClose} className="text-xl text-[#8a8a8a] hover:text-white">✕</button>
        </div>

        <div className="space-y-4">
          <div className="flex gap-4">
            <label className="w-20 text-[13px] text-[#8a8a8a]">Title</label>
            <input type="text" value={localSettings.title} onChange={(e) => setLocalSettings({ ...localSettings, title: e.target.value })} className="flex-1 rounded border border-[#333] bg-[#141414] px-3 py-1.5 text-[14px] text-white focus:border-[#444] focus:outline-none" />
          </div>

        </div>

        <div className="my-4 border-t border-[#333]" />

        <div className="grid grid-cols-1 gap-8">
          <div className="space-y-4">
            <h3 className="text-[14px] font-bold text-white">Timing</h3>
            
            <div className="flex items-start justify-between gap-6 pb-3 border-b border-[#333]">
              <span className="text-[12px] text-[#8a8a8a] pt-1" title="When enabled, this timer starts at the selected time in the chosen timezone.">Start Time ⓘ</span>
              <StartTimeInput 
                value={localSettings.scheduledStart} 
                dateValue={localSettings.scheduledStartDate}
                onChange={(val, date) => setLocalSettings({ ...localSettings, scheduledStart: val, scheduledStartDate: date })}
                selectedTimeZone={selectedTimeZone}
              />
            </div>

            <div className="flex items-center justify-between gap-6 py-2">
              <span className="text-[12px] text-[#8a8a8a]" title="The total amount of time this timer runs.">Duration ⓘ</span>
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
                  onApplyToAll?.({ 
                    mode: localSettings.mode, 
                    fontHeight: localSettings.fontHeight,
                    fontWidth: localSettings.fontWidth
                  });
                  onSettingsUpdate();
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
          <div className="h-2 w-full overflow-hidden rounded-full bg-[#333]">
            <div className="flex h-full w-full" aria-label="Configured timer color preview">
              <div className="h-full" style={{ width: `${previewGreenWidth}%`, backgroundColor: '#22c55e' }} />
              <div className="h-full" style={{ width: `${previewYellowWidth}%`, backgroundColor: yellowSegment.color }} />
              <div className="h-full" style={{ width: `${previewRedWidth}%`, backgroundColor: redSegment.color }} />
            </div>
          </div>
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
                onChange={(val) => updateWarningSegment('#f08c00', val)}
              />
            </div>
            <div className="flex items-center gap-4 py-2 border-b border-[#333]/30">
              <div className="h-3 w-3 rounded-full bg-[#fa5252]" />
              <span className="w-16 text-[13px] text-white">Red</span>
              <ThresholdInput 
                value={redSegment.threshold} 
                onChange={(val) => updateWarningSegment('#fa5252', val)}
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
              <span className="text-[13px] text-[#8a8a8a] pt-1" title="When enabled, this timer starts at the selected time in the chosen timezone.">Start Time ⓘ</span>
              <StartTimeInput 
                value={localSettings.scheduledStart} 
                dateValue={localSettings.scheduledStartDate}
                onChange={(val, date) => setLocalSettings({ ...localSettings, scheduledStart: val, scheduledStartDate: date })}
                selectedTimeZone={selectedTimeZone}
              />
            </div>

            <div className="flex items-center justify-between gap-6 py-2">
              <span className="text-[13px] text-[#8a8a8a]" title="The total amount of time this timer runs.">Duration ⓘ</span>
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

            <div className="flex items-center justify-between gap-4">
              <span className="text-[13px] text-[#8a8a8a]">Font Height</span>
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
              <span className="text-[13px] text-[#8a8a8a]">Font Width</span>
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
                  onApplyToAll?.({ 
                    mode: localSettings.mode,
                    fontHeight: localSettings.fontHeight,
                    fontWidth: localSettings.fontWidth
                  });
                  onSettingsUpdate();
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
  onActivate: (manualStart?: boolean) => void;
  onSync: (state: any) => void;
  onAddAbove: () => void;
  onAddBelow: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onApplyToAll?: (settings: any) => void;
  onSettingsUpdate: () => void;
}

interface MessageRowProps {
  msg: any;
  idx: number;
  isShown: boolean;
  messageShownId: string | null;
  onUpdate: (id: string, text: string) => void;
  onDelete: (id: string) => void;
  onUpdateColor: (id: string, color: string) => void;
  onToggleBold: (id: string) => void;
  onToggleUppercase: (id: string) => void;
  onUpdateSize: (id: string, value: number) => void;
  onShow: (id: string) => void;
  getMessageSize: (msg: any) => number;
}

const MessageRow = ({ 
  msg, idx, isShown, messageShownId, onUpdate, onDelete, onUpdateColor, 
  onToggleBold, onToggleUppercase, onUpdateSize, onShow, getMessageSize 
}: MessageRowProps) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: msg.id });
  const style = { 
    transform: CSS.Transform.toString(transform), 
    transition, 
    zIndex: isDragging ? 200 : 1, 
    position: 'relative' as const 
  };
  const mSize = getMessageSize(msg);
  const cardActive = isShown;

  return (
    <div 
      ref={setNodeRef} 
      style={style} 
      className={`group relative rounded-lg px-3 py-2 shadow-md transition-colors ${cardActive ? 'bg-[#b02a2a] border border-[#c43c3c]' : 'border border-[#333] bg-[#2d2d2d]'}`}
    >
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <div 
            {...attributes} 
            {...listeners} 
            className="group/index flex w-8 items-center justify-center text-[13px] font-bold text-[#8a8a8a] cursor-grab active:cursor-grabbing" 
            title="Drag to reorder"
          >
            <span className="group-hover/index:hidden">{idx + 1}</span>
            <span className="hidden group-hover/index:inline text-[18px] font-light leading-none">=</span>
          </div>
          <textarea
            value={msg.text}
            onChange={(e) => onUpdate(msg.id, e.target.value)}
            placeholder="Enter message ..."
            rows={2}
            className="min-h-[48px] max-h-[110px] flex-1 resize-y rounded-md border border-[#444] bg-[#1c1c1c] px-2.5 py-1.5 text-[13px] text-white outline-none focus:border-[#555]"
            style={{
              color: msg.color,
              fontWeight: msg.bold ? 700 : 400,
              textTransform: msg.uppercase ? 'uppercase' : 'none'
            }}
          />
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => onDelete(msg.id)}
              className={`flex items-center justify-center ${cardActive ? 'text-white/70 hover:text-white' : 'text-[#666] hover:text-[#fa5252]'}`}
              title="Delete message"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
            </button>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => onUpdateColor(msg.id, '#ffffff')} className={`pb-0.5 text-[14px] font-bold transition-all border-b-2 ${msg.color === '#ffffff' ? 'border-[#ffffff]' : 'border-transparent hover:border-[#888]'}`} style={{ color: '#ffffff' }} title="White text">A</button>
            <button type="button" onClick={() => onUpdateColor(msg.id, '#22c55e')} className={`pb-0.5 text-[14px] font-bold transition-all border-b-2 ${msg.color === '#22c55e' ? 'border-[#22c55e]' : 'border-transparent hover:border-[#888]'}`} style={{ color: '#22c55e' }} title="Green text">A</button>
            <button type="button" onClick={() => onUpdateColor(msg.id, '#fa5252')} className={`pb-0.5 text-[14px] font-bold transition-all border-b-2 ${msg.color === '#fa5252' ? 'border-[#fa5252]' : 'border-transparent hover:border-[#888]'}`} style={{ color: '#fa5252' }} title="Red text">A</button>
            <button type="button" onClick={() => onToggleBold(msg.id)} className={`flex h-8 w-8 items-center justify-center rounded-md transition-all ${msg.bold ? 'bg-[#4a9eff] text-white' : 'bg-[#1c1c1c] text-[#8a8a8a] hover:bg-[#252525]'}`} style={{ fontWeight: 800 }} title="Bold text">B</button>
            <button type="button" onClick={() => onToggleUppercase(msg.id)} className={`flex h-8 w-8 items-center justify-center rounded-md transition-all ${msg.uppercase ? 'bg-[#4a9eff] text-white' : 'bg-[#1c1c1c] text-[#8a8a8a] hover:bg-[#252525]'}`} style={{ fontWeight: 800 }} title="Uppercase text">AA</button>
            <div className="flex items-center gap-1 ml-2 border-l border-[#444] pl-2">
              <span className="text-[10px] uppercase text-[#666] mr-1">Size</span>
              <div className="flex items-center overflow-hidden rounded border border-[#444] bg-[#1c1c1c]">
                <button type="button" onClick={() => onUpdateSize(msg.id, Math.max(0.1, Math.round((mSize - 0.1) * 10) / 10))} className="flex h-7 w-5 items-center justify-center text-[#8a8a8a] hover:bg-[#252525] hover:text-white border-r border-[#444]">-</button>
                <input type="number" min="0.1" max="10" step="0.1" value={mSize} onChange={(e) => onUpdateSize(msg.id, parseFloat(e.target.value) || 1.0)} className="h-7 w-7 bg-transparent text-center font-mono text-[11px] text-white outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                <button type="button" onClick={() => onUpdateSize(msg.id, Math.min(10, Math.round((mSize + 0.1) * 10) / 10))} className="flex h-7 w-5 items-center justify-center text-[#8a8a8a] hover:bg-[#252525] hover:text-white border-l border-[#444]">+</button>
              </div>
            </div>
          </div>
          <div className="ml-auto flex shrink-0 items-center overflow-hidden rounded-md border border-[#444]">
            <button
              type="button"
              onClick={() => onShow(msg.id)}
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
  );
};

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

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });

  const style = { transform: CSS.Transform.toString(transform), transition, zIndex: isDragging || isActionsOpen || isSettingsOpen || isQuickSettingsOpen ? 200 : 1, position: 'relative' as const };

  useEffect(() => {
    const handleGlobalClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('.timer-row-more')) return;
      setIsActionsOpen(false);
      setIsAdjustMenuOpen(false);
    };
    const handleMenuOpen = (event: Event) => {
      const menuId = (event as CustomEvent<string>).detail;
      if (menuId !== id) setIsActionsOpen(false);
    };
    window.addEventListener('click', handleGlobalClick);
    window.addEventListener('stage-timer-menu-open', handleMenuOpen);
    return () => {
      window.removeEventListener('click', handleGlobalClick);
      window.removeEventListener('stage-timer-menu-open', handleMenuOpen);
    };
  }, [id]);

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

    // Handle local controls dispatched from the same window
    const handleLocalControl = (event: Event) => {
      const { targetId, command, payload } = (event as CustomEvent).detail;
      if (targetId === id) {
        switch (command) {
          case 'START': startTimer(); break;
          case 'PAUSE': pauseTimer(); break;
          case 'SCHEDULED_END':
            resetTimer();
            setTime(settings.mode === 'countup' ? Number(settings.targetDuration || 0) : 0);
            break;
          case 'RESET': resetTimer(); break;
          case 'ADJUST': {
            const adjustment = typeof payload === 'number' ? payload : 0;
            if (settings.mode === 'countup' && secondsRef.current <= 0 && adjustment < 0) break;
            setTime(secondsRef.current + adjustment);
            break;
          }
          case 'SET': setTime(payload); break;
          case 'RELOAD_SETTINGS': 
          case 'REFRESH_SETTINGS': {
            const newSettings = readJsonStorage<Record<string, any> | null>(`timerSettings_${id}`, null);
            if (newSettings) updateSettings(newSettings);
            break;
          }
        }
      }
    };
    window.addEventListener('stage-timer-control', handleLocalControl);

    const unsubscribe = subscribeSharedChannel(CONTROL_CHANNEL, (event) => {
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
          case 'SCHEDULED_END':
            resetTimer();
            setTime(settings.mode === 'countup' ? Number(settings.targetDuration || 0) : 0);
            break;
          case 'RESET': resetTimer(); break;
          case 'ADJUST': {
            const adjustment = typeof payload === 'number' ? payload : 0;
            if (settings.mode === 'countup' && secondsRef.current <= 0 && adjustment < 0) break;
            setTime(secondsRef.current + adjustment);
            break;
          }
          case 'SET': setTime(payload); break;
          case 'RELOAD_SETTINGS': 
          case 'REFRESH_SETTINGS': {
            const newSettings = readJsonStorage<Record<string, any> | null>(`timerSettings_${id}`, null);
            if (newSettings) updateSettings(newSettings);
            break;
          }
        }
      }
    });
    return () => {
      window.removeEventListener('stage-timer-reset-all-except', handleInWindowResetAll);
      window.removeEventListener('stage-timer-pause-all-except', handleInWindowPauseAll);
      window.removeEventListener('stage-timer-control', handleLocalControl);
      unsubscribe();
    };
  }, [id, isRunning, settings.mode, settings.targetDuration, startTimer, pauseTimer, resetTimer, setTime, updateSettings]);

  useEffect(() => {
    if (isActive) {
      onSync({ seconds, isRunning, settings, syncState, DEFAULT_TIME });
    }
  }, [isActive, seconds, isRunning, settings, syncState, DEFAULT_TIME, onSync]);

  return (
    <div 
      ref={setNodeRef} 
      style={style} 
      onClick={isActive ? () => onActivate(false) : undefined}
      className={`timer-row group flex min-w-0 overflow-hidden items-center gap-4 rounded-lg px-6 py-1.5 text-white shadow-lg transition-all max-[639px]:gap-2 max-[639px]:px-2 ${isRunning ? 'bg-[#b91c1c]' : isActive ? 'bg-[#2546c9] cursor-pointer' : 'bg-[#262626]'} ${isDragging ? 'opacity-50' : ''}`}
    >
      {/* Index / Handle - Only shows '=' when hovering the index area specifically */}
      <div 
        {...attributes} 
        {...listeners} 
        className="group/index flex w-8 shrink-0 items-center justify-center text-[16px] font-bold opacity-60 cursor-grab active:cursor-grabbing max-[639px]:w-6"
        onClick={(e) => e.stopPropagation()}
      >
        {isDragging ? (
          <span className="text-[24px] font-light leading-none">=</span>
        ) : (
          <>
            <span className="group-hover/index:hidden">{index + 1}</span>
            <span className="hidden group-hover/index:inline text-[24px] font-light leading-none">=</span>
          </>
        )}
      </div>

      {/* Scheduled Time Display */}
      <div className="timer-row-scheduled hidden sm:flex shrink-0 flex-col items-start w-auto">
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
        className={`w-auto shrink-0 text-center text-[14px] font-bold tracking-tight tabular-nums transition-colors cursor-pointer max-[639px]:text-[13px] ${seconds < 0 && settings.mode === 'countdown' ? 'text-[#fa5252] hover:text-[#ff8787]' : 'text-white hover:text-[#4a9eff]'}`}
        onMouseEnter={(e) => e.stopPropagation()}
        onMouseLeave={(e) => e.stopPropagation()}
      >
        {formatClock(settings.targetDuration)}
      </div>

      {/* Title */}
      <div className="timer-row-title ml-0 min-w-0 flex-1 flex items-center justify-center overflow-hidden text-center text-[14px] font-bold opacity-90 pr-2 max-[639px]:ml-0 max-[639px]:text-[13px]" onMouseEnter={(e) => e.stopPropagation()} onMouseLeave={(e) => e.stopPropagation()}>
        <span className="block min-w-0 max-w-full truncate">{settings.title}</span>
      </div>

      {/* Controls */}
      <div className="timer-row-controls flex shrink-0 items-center gap-2 whitespace-nowrap max-[639px]:gap-1" onClick={(e) => e.stopPropagation()} onMouseEnter={(e) => e.stopPropagation()} onMouseLeave={(e) => e.stopPropagation()}>
        {isActive ? (
          <button 
            type="button" 
            onClick={resetTimer} 
            className={`flex h-9 w-10 max-[639px]:h-8 max-[639px]:w-8 items-center justify-center rounded border border-white/10 transition-colors ${isActive ? 'bg-white/20 hover:bg-white/30' : 'bg-white/5 hover:bg-white/10'}`}
            title="Reset to assigned time"
          >
            <IconSkipBack size={16} />
          </button>
        ) : (
          <button 
            type="button" 
            onClick={() => onActivate(false)}
            className="flex h-9 w-10 max-[639px]:h-8 max-[639px]:w-8 items-center justify-center rounded border border-white/10 bg-white/5 text-white/50 hover:bg-white/10 hover:text-white transition-colors"
            title="Select this timer"
          >
            <IconSelect size={16} />
          </button>
        )}
        <button 
          type="button" 
          onClick={() => {
            setIsActionsOpen(false);
            setIsSettingsOpen(true);
          }}
          className={`flex h-9 w-10 max-[639px]:h-8 max-[639px]:w-8 items-center justify-center rounded border border-white/10 transition-colors ${isActive ? 'bg-white/20 hover:bg-white/30' : 'bg-white/5 hover:bg-white/10'}`}
        >
          <IconSettings size={16} />
        </button>
        <button 
          type="button" 
          onClick={() => {
            if (!isRunning) {
              onActivate(true);
              window.dispatchEvent(new CustomEvent('stage-timer-reset-all-except', { detail: id }));
              postSharedMessage(CONTROL_CHANNEL, { command: 'RESET_ALL_EXCEPT', payload: id });
              startTimer();
            } else {
              pauseTimer();
            }
          }}
          className="flex h-9 w-12 max-[639px]:h-8 max-[639px]:w-10 items-center justify-center rounded bg-[#16a34a] hover:bg-[#15803d] shadow-md transition-colors"
        >
          {isRunning ? <IconPause size={18} /> : <IconPlay size={18} />}
        </button>
        <div className="timer-row-more relative ml-1 max-[639px]:ml-0">
          <button 
            type="button" 
            onClick={(e) => {
              e.stopPropagation();
              window.dispatchEvent(new CustomEvent('stage-timer-menu-open', { detail: id }));
              setIsActionsOpen(!isActionsOpen);
            }}
            className="flex h-9 w-8 max-[639px]:h-8 max-[639px]:w-6 items-center justify-center text-white/40 hover:text-white transition-colors"
            title="Timer actions"
          >
            <IconMore size={18} />
          </button>
          {isActionsOpen && (
            <div onClick={(e) => e.stopPropagation()} className="absolute right-0 top-full z-[250] mt-2 w-56 rounded-lg border border-[#444] bg-[#242424] p-1 shadow-2xl">
              <button type="button" onClick={() => { onAddAbove(); setIsActionsOpen(false); }} className="flex w-full items-center gap-3 rounded-md px-4 py-2.5 text-left text-[14px] text-white hover:bg-[#383838]">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 19V5"/><path d="m5 12 7-7 7 7"/><path d="M4 21h16"/></svg>
                <span>Add timer above</span>
              </button>
              <button type="button" onClick={() => { onAddBelow(); setIsActionsOpen(false); }} className="flex w-full items-center gap-3 rounded-md px-4 py-2.5 text-left text-[14px] text-white hover:bg-[#383838]">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 5v14"/><path d="m19 12-7 7-7-7"/><path d="M4 3h16"/></svg>
                <span>Add timer below</span>
              </button>
              <button type="button" onClick={() => { onDuplicate(); setIsActionsOpen(false); }} className="flex w-full items-center gap-3 rounded-md px-4 py-2.5 text-left text-[14px] text-white hover:bg-[#383838]">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                <span>Clone timer</span>
              </button>
              <div className="my-1 border-t border-[#333]" />
              <button type="button" onClick={() => { onDelete(); setIsActionsOpen(false); }} className="flex w-full items-center gap-3 rounded-md px-4 py-2.5 text-left text-[14px] text-[#fa5252] hover:bg-red-500/10">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2 2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                <span>Delete timer</span>
              </button>
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
            setTime(newSettings.mode === 'countup' ? 0 : newSettings.targetDuration);
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
            setTime(newSettings.mode === 'countup' ? 0 : newSettings.targetDuration);
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
  messages: Array<{ id: string; text: string; color: string; bold?: boolean; uppercase?: boolean; messageSize?: number; fontHeight?: number; fontWidth?: number; }>;
  timerSettings?: Record<string, any>;
  activeRoomSettings?: any;
}

function App() {
  const [rooms, setRooms] = useLocalStorage<Room[]>('stage-timer-rooms', []);
  const [currentRoomId, setCurrentRoomId] = useLocalStorage<string | null>('stage-timer-current-id', null);
  const [currentRoomName, setCurrentRoomName] = useLocalStorage<string>('stage-timer-current-name', 'Unnamed');
  const [timerIds, setTimerIds] = useLocalStorage<string[]>('stage-timer-timer-ids', []);
  const [activeTimerId, setActiveTimerId] = useLocalStorage<string>('stage-timer-active-id', '');
  const [messages, setMessages] = useLocalStorage<any[]>('stage-timer-messages', [{ id: '1', text: '', color: '#ffffff' }]);
  const [messageShownId, setMessageShownId] = useLocalStorage<string | null>('stage-timer-message-shown-id', null);
  const [isNewRoomDraft, setIsNewRoomDraft] = useState(false);
  const completedScheduledTimersRef = useRef<Set<string>>(new Set());
  const manuallyStartedScheduledTimersRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!currentRoomId && !isNewRoomDraft) {
      const matchingRoom = rooms.find(room => room.name === currentRoomName);
      if (matchingRoom) setCurrentRoomId(matchingRoom.id);
    }
  }, [currentRoomId, currentRoomName, rooms, isNewRoomDraft, setCurrentRoomId]);

  // Fix #4: cross-tab room/message sync — when another dashboard tab updates
  // timers/messages/room, broadcast the change so other open tabs reload too.
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (!e.key) return;
      const changed = ['stage-timer-rooms', 'stage-timer-current-id', 'stage-timer-current-name', 'stage-timer-timer-ids', 'stage-timer-active-id', 'stage-timer-messages', 'stage-timer-message-shown-id'].includes(e.key);
      if (changed) {
        try {
          postSharedMessage(CONTROL_CHANNEL, { command: 'ROOM_STATE_CHANGED' });
        } catch { /* ignore */ }
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  useEffect(() => {
    try {
      const unsubscribe = subscribeSharedChannel(CONTROL_CHANNEL, (e) => {
        if (e.data && e.data.command === 'ROOM_STATE_CHANGED') {
          // Another tab changed room/message/timer list state — re-read the
          // shared state from localStorage so this tab stays in sync.
          setRooms(readJsonStorage<Room[]>('stage-timer-rooms', []));
          setCurrentRoomId(readJsonStorage<string | null>('stage-timer-current-id', null));
          setCurrentRoomName(readJsonStorage<string>('stage-timer-current-name', 'Unnamed'));
          setTimerIds(readJsonStorage<string[]>('stage-timer-timer-ids', []));
          setActiveTimerId(readJsonStorage<string>('stage-timer-active-id', ''));
          setMessages(readJsonStorage<any[]>('stage-timer-messages', [{ id: '1', text: '', color: '#ffffff' }]));
          setMessageShownId(readJsonStorage<string | null>('stage-timer-message-shown-id', null));
          setMessageFlashId(null);
        }
      });
      return unsubscribe;
    } catch { /* ignore */ }
    return undefined;
  }, [setCurrentRoomId, setCurrentRoomName, setRooms, setTimerIds, setActiveTimerId, setMessages, setMessageShownId]);
  const [messageFlashId, setMessageFlashId] = useState<string | null>(null);
  // Message-only flash state (used by the Messages Flash button). The timer
  // digits keep their own isFlashing/isFlash flags via handleFlash, so a
  // message flash never makes the timer blink.
  const [isMessageFlashing, setIsMessageFlashing] = useState(false);
  const [isMessageFlash, setIsMessageFlash] = useState(false);
  const [draggingMsgId, setDraggingMsgId] = useState<string | null>(null);
  const [activeTimerState, setActiveTimerState] = useState<any>(null);
  const [isRoomMenuOpen, setIsRoomMenuOpen] = useState(false);
  const [isTimersMenuOpen, setIsTimersMenuOpen] = useState(false);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
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
    const mode = activeTimerState.syncState?.mode || activeTimerState.settings?.mode || 'countdown';
    if (mode === 'countup') {
      const delta = s - Math.max(0, Number(activeTimerState.settings?.targetDuration ?? 0));
      return delta >= 0 ? `+${formatClock(delta, true)}` : `-${formatClock(Math.abs(delta), true)}`;
    }
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
        const settings = readJsonStorage<Record<string, any>>(`timerSettings_${id}`, { targetDuration: 0, scheduledStart: null });

      let startTime = currentEndTime;
      
      // Only apply manual start to the anchor or if explicitly set.
      // Saved dates use the selected timezone; legacy time-only settings keep
      // their existing time-of-day behavior.
      if (settings.scheduledStart !== null && (i === anchorIndex && !activeTimerState?.isRunning)) {
        startTime = settings.scheduledStartDate
          ? getZonedDateTimeTimestamp(settings.scheduledStartDate, settings.scheduledStart, selectedTimeZone)
          : midnight + settings.scheduledStart;
      }

      result[id] = { start: startTime };
      currentEndTime = startTime + (settings.targetDuration || 0);
    }

    // Backward pass
    if (anchorTime !== null && anchorIndex > 0) {
      let currentStartTime = anchorTime;
      for (let i = anchorIndex - 1; i >= 0; i--) {
        const id = timerIds[i];
        const settings = readJsonStorage(`timerSettings_${id}`, { targetDuration: 0 });
        
        const endTime = currentStartTime;
        const startTime = endTime - (settings.targetDuration || 0);
        result[id] = { start: startTime };
        currentStartTime = startTime;
      }
    }
    
    return result;
  }, [timerIds, selectedTimeZone, activeTimerId, activeTimerState]);

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

  // Start a date-selected timer when its exact local timestamp is reached.
  // This stays at the App boundary so the timer hook and progress calculation
  // remain unchanged.
  useEffect(() => {
    const nowSeconds = Date.now() / 1000;
    const scheduledDateForToday = new Intl.DateTimeFormat('en-CA', { timeZone: selectedTimeZone }).format(new Date());

    // A timer with Set Specific Start Time stops at its configured end.
    // This guard is limited to scheduled timers so ordinary timers retain
    // their existing overtime behavior.
    if (activeTimerId && activeTimerState?.isRunning) {
      const scheduledSettings = activeTimerState.settings;
      const scheduledSeconds = Number(activeTimerState.seconds);
      const scheduledTarget = Number(scheduledSettings?.targetDuration ?? 0);
      const scheduledMode = scheduledSettings?.mode || 'countdown';
      const hasScheduledStart = scheduledSettings?.scheduledStart !== null
        && Number.isFinite(Number(scheduledSettings?.scheduledStart));
      const scheduledDate = scheduledSettings?.scheduledStartDate || scheduledDateForToday;
      const scheduledAt = hasScheduledStart
        ? getZonedDateTimeTimestamp(scheduledDate, Number(scheduledSettings.scheduledStart), selectedTimeZone)
        : null;
      const scheduledKey = scheduledAt === null ? null : `${activeTimerId}:${scheduledAt}`;
      const scheduledEndReached = hasScheduledStart && (
        scheduledMode === 'countup'
          ? scheduledTarget > 0 && scheduledSeconds >= scheduledTarget
          : scheduledSeconds <= 0
      );
      if (scheduledEndReached) {
        if (scheduledKey) completedScheduledTimersRef.current.add(scheduledKey);
        const pauseCommand = { targetId: activeTimerId, command: 'SCHEDULED_END' };
        postSharedMessage(CONTROL_CHANNEL, pauseCommand);
        window.dispatchEvent(new CustomEvent('stage-timer-control', { detail: pauseCommand }));
        return;
      }
    }

    const alreadyRunningId = timerIds.find(id => {
      const state = id === activeTimerId && activeTimerState
        ? activeTimerState.syncState
        : readJsonStorage<any>(`timerSync_${id}`, null);
      return state?.isRunning;
    });

    if (alreadyRunningId) return;

    for (const id of timerIds) {
      const settings = id === activeTimerId && activeTimerState
        ? activeTimerState.settings
        : readJsonStorage<Record<string, any> | null>(`timerSettings_${id}`, null);
      if (settings?.scheduledStart === null || !Number.isFinite(settings?.scheduledStart)) continue;

      const scheduledDate = settings.scheduledStartDate || scheduledDateForToday;
      const scheduledAt = getZonedDateTimeTimestamp(scheduledDate, settings.scheduledStart, selectedTimeZone);
      const scheduledKey = `${id}:${scheduledAt}`;
      if (completedScheduledTimersRef.current.has(scheduledKey)) continue;
      if (manuallyStartedScheduledTimersRef.current.has(scheduledKey)) continue;
      const syncState = id === activeTimerId && activeTimerState
        ? activeTimerState.syncState
        : readJsonStorage<any>(`timerSync_${id}`, null);
      const seconds = id === activeTimerId && activeTimerState
        ? activeTimerState.seconds
        : Number(readJsonStorage<number>(`timerSeconds_${id}`, settings.mode === 'countup' ? 0 : settings.targetDuration));
      const wasManuallyResetAfterSchedule = Number(syncState?.manualResetAt ?? 0) >= scheduledAt;
      const targetDuration = Number(settings.targetDuration || 0);
      const isIdle = syncState?.startTime === null && (
        settings.mode === 'countup'
          ? seconds <= 0.1
          : seconds >= targetDuration - 0.1
      );
      if (nowSeconds < scheduledAt || wasManuallyResetAfterSchedule || !isIdle) continue;

      setActiveTimerId(id);
      const startCommand = { targetId: id, command: 'START' };
      postSharedMessage(CONTROL_CHANNEL, startCommand);
      window.dispatchEvent(new CustomEvent('stage-timer-control', { detail: startCommand }));
      postSharedMessage(CONTROL_CHANNEL, { command: 'RESET_ALL_EXCEPT', payload: id });
      window.dispatchEvent(new CustomEvent('stage-timer-reset-all-except', { detail: id }));
      // Apply selection again after the control events so the newly playing
      // scheduled row remains the selected row in the dashboard.
      window.setTimeout(() => setActiveTimerId(id), 0);
      break;
    }
  }, [timerIds, activeTimerId, activeTimerState, selectedTimeZone, wallClock, settingsVersion, setActiveTimerId]);

  useEffect(() => {
    const handleGlobalClick = () => {
      setIsRoomMenuOpen(false);
      setIsTimersMenuOpen(false);
      setIsTimeZoneMenuOpen(false);
      setOpenAdjustMenu(null);
    };
    const handleMenuOpen = (event: Event) => {
      const menuId = (event as CustomEvent<string>).detail;
      if (menuId !== 'header') setIsTimersMenuOpen(false);
    };
    window.addEventListener('click', handleGlobalClick);
    window.addEventListener('stage-timer-menu-open', handleMenuOpen);
    return () => {
      window.removeEventListener('click', handleGlobalClick);
      window.removeEventListener('stage-timer-menu-open', handleMenuOpen);
    };
  }, []);
  const [isBlackout, setIsBlackout] = useState(false);
  const [isFlash, setIsFlash] = useState(false);
  const [isFlashing, setIsFlashing] = useState(false);
  const [isFollowEnabled, setIsFollowEnabled] = useLocalStorage<boolean>('stage-timer-follow-active', false);
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [isDraggingGrid, setIsDraggingGrid] = useState(false);
  const gridTrackRef = useRef<HTMLDivElement>(null);



  const fileInputRef = useRef<HTMLInputElement>(null);
  const prevIsRunningRef = useRef(false);
  const prevSecondsRef = useRef<number | null>(null);
  const prevModeRef = useRef<string | null>(null);
  const autoFollowTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sequenceCompletedRef = useRef(false);

  // Follow Active Timer Logic - advance countdown timers at the zero boundary.
  // Normal timer behavior, including overtime when follow is disabled, is unchanged.
  useEffect(() => {
    if (!isFollowEnabled && autoFollowTimeoutRef.current) {
      clearTimeout(autoFollowTimeoutRef.current);
      autoFollowTimeoutRef.current = null;
    }

    const seconds = activeTimerState?.seconds;
    const previousSeconds = prevSecondsRef.current;
    const mode = activeTimerState?.settings.mode || 'countdown';
    const modeChanged = prevModeRef.current !== null && prevModeRef.current !== mode;
    const targetDuration = Math.max(0, Number(activeTimerState?.settings.targetDuration ?? 0));
    const crossedZeroWhileRunning =
      isFollowEnabled &&
      !modeChanged &&
      activeTimerState?.isRunning &&
      mode === 'countdown' &&
      typeof seconds === 'number' &&
      seconds <= 0 &&
      typeof previousSeconds === 'number' &&
      previousSeconds > 0;
    const crossedTargetWhileRunning =
      isFollowEnabled &&
      !modeChanged &&
      activeTimerState?.isRunning &&
      mode === 'countup' &&
      typeof seconds === 'number' &&
      seconds >= targetDuration &&
      typeof previousSeconds === 'number' &&
      previousSeconds < targetDuration;
    const stoppedAtZero = typeof seconds === 'number' && seconds >= 0 && seconds <= 0.1;
    const pausedAtZero = isFollowEnabled && !modeChanged && mode === 'countdown' && prevIsRunningRef.current && !activeTimerState?.isRunning && stoppedAtZero;

    if (activeTimerState?.isRunning && typeof seconds === 'number' && seconds > 0.1) {
      sequenceCompletedRef.current = false;
    }

    if (crossedZeroWhileRunning || crossedTargetWhileRunning || pausedAtZero) {
      const currentIndex = timerIds.indexOf(activeTimerId);
      if (currentIndex !== -1 && currentIndex < timerIds.length - 1) {
        const nextId = timerIds[currentIndex + 1];
        setActiveTimerId(nextId);
        if (autoFollowTimeoutRef.current) clearTimeout(autoFollowTimeoutRef.current);
        autoFollowTimeoutRef.current = setTimeout(() => {
          try {
            if (!timerIds.includes(nextId) || sequenceCompletedRef.current) return;
            const startCommand = { targetId: nextId, command: 'START' };
            postSharedMessage(CONTROL_CHANNEL, startCommand);
            window.dispatchEvent(new CustomEvent('stage-timer-control', { detail: startCommand }));
            postSharedMessage(CONTROL_CHANNEL, { command: 'RESET_ALL_EXCEPT', payload: nextId });
            window.dispatchEvent(new CustomEvent('stage-timer-reset-all-except', { detail: nextId }));
          } catch (err) { console.error('Failed to auto-start next timer:', err); }
          finally { autoFollowTimeoutRef.current = null; }
        }, 300);
      } else if (currentIndex === timerIds.length - 1) {
        sequenceCompletedRef.current = true;
        if (autoFollowTimeoutRef.current) {
          clearTimeout(autoFollowTimeoutRef.current);
          autoFollowTimeoutRef.current = null;
        }
        const pauseCommand = { targetId: activeTimerId, command: 'PAUSE' };
        postSharedMessage(CONTROL_CHANNEL, pauseCommand);
        window.dispatchEvent(new CustomEvent('stage-timer-control', { detail: pauseCommand }));
      }
    }
    prevSecondsRef.current = typeof seconds === 'number' ? seconds : null;
    prevIsRunningRef.current = activeTimerState?.isRunning || false;
    prevModeRef.current = mode;
  }, [activeTimerState?.isRunning, activeTimerState?.seconds, activeTimerState?.settings.mode, activeTimerState?.settings.targetDuration, isFollowEnabled, activeTimerId, timerIds, setActiveTimerId]);

  useEffect(() => () => {
    if (autoFollowTimeoutRef.current) clearTimeout(autoFollowTimeoutRef.current);
  }, []);

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

  const handleMessageDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setMessages((items) => {
        const oldIndex = items.findIndex(m => m.id === active.id);
        const newIndex = items.findIndex(m => m.id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  const addTimer = (atIndex?: number) => {
    const newId = createId('timer');
    // New timers inherit Apply All's visual defaults only within the current room.
    // A new or unsaved room always starts from the built-in defaults.
    try {
      const shared = currentRoomId
        ? readJsonStorage<Record<string, any>>(`timerSharedDefaults_${currentRoomId}`, {})
        : {};
      const defaults = {
        title: 'Timer',
        speaker: '',
        notes: '',
        audioVolume: 0.5,
        beepOnReach: true,
        beepOnHalfTime: true,
        beepOnOneMinute: true,
        warningThreshold: 60,
        dangerThreshold: 0,
        historyLimit: 10,
        targetDuration: 0,
        mode: 'countdown',
        fontHeight: 1.6,
        fontWidth: 1.0,
        scheduledStart: null,
        segments: [
          { threshold: 60, color: '#f08c00' },
          { threshold: 10, color: '#fa5252' }
        ]
      };
      const merged = { ...defaults, ...shared };
      localStorage.setItem(`timerSettings_${newId}`, JSON.stringify(merged));
      localStorage.setItem(`timerSeconds_${newId}`, JSON.stringify(0));
      localStorage.setItem(`timerSync_${newId}`, JSON.stringify({
        startTime: null,
        initialSeconds: 0,
        isRunning: false,
        mode: merged.mode || 'countdown',
        lastUpdated: Date.now()
      }));
    } catch { /* fall back to built-in defaults */ }
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
    try { localStorage.removeItem(`timerLog_${id}`); } catch { /* ignore */ }
    try {
      postSharedMessage(CONTROL_CHANNEL, { targetId: id, command: 'DESTROY' });
    } catch { /* ignore */ }
    const newIds = timerIds.filter(tid => tid !== id);
    setTimerIds(newIds);
    if (newIds.length === 0) {
      setActiveTimerId('');
      setActiveTimerState(null);
    } else if (activeTimerId === id) {
      // The active timer was deleted — clear its view immediately, then fall back.
      setActiveTimerState(null);
      setActiveTimerId(newIds[0]);
    }
  };

  const applyToAllSettings = (sharedSettings: any) => {
    // Only these 3 settings apply to all timers: Appearance (mode),
    // Font Height, and Font Width. Never touch time-related keys so a
    // settings change can never reset any timer's elapsed/remaining time.
    const { mode, fontHeight, fontWidth } = sharedSettings || {};
    const visualOnly = { mode, fontHeight, fontWidth };
    // Persist shared defaults only for this saved room. Never use one global
    // defaults key, so Apply All cannot leak into another room or a new room.
    if (currentRoomId) {
      localStorage.setItem(
        `timerSharedDefaults_${currentRoomId}`,
        JSON.stringify({ mode: mode || 'countdown', fontHeight: fontHeight ?? 1.6, fontWidth: fontWidth ?? 1.0 })
      );
    }
    timerIds.forEach(id => {
      const settings = readJsonStorage(`timerSettings_${id}`, {
        title: 'Timer',
        targetDuration: 0,
        mode: 'countdown',
        segments: [
          { threshold: 60, color: '#f08c00' },
          { threshold: 10, color: '#fa5252' }
        ]
      });
      localStorage.setItem(`timerSettings_${id}`, JSON.stringify({ ...settings, ...visualOnly }));
    });
    // Force a settings refresh (without resetting time) everywhere:
    // BroadcastChannel reaches other tabs/windows; the local window event
    // 'stage-timer-control' reaches timer rows in THIS tab immediately so
    // the changes apply without a page reload.
    timerIds.forEach(id => {
      const data = { targetId: id, command: 'REFRESH_SETTINGS' };
      postSharedMessage(CONTROL_CHANNEL, data);
      window.dispatchEvent(new CustomEvent('stage-timer-control', { detail: data }));
    });
    setSettingsVersion(v => v + 1);
  };

  const deleteAllTimers = () => {
    try {
      timerIds.forEach(id => {
        localStorage.removeItem(`timerSettings_${id}`);
        localStorage.removeItem(`timerSeconds_${id}`);
        localStorage.removeItem(`timerSync_${id}`);
        localStorage.removeItem(`timerLog_${id}`);
      });
      timerIds.forEach(id => postSharedMessage(CONTROL_CHANNEL, { targetId: id, command: 'DESTROY' }));
    } catch { /* ignore */ }
    setTimerIds([]);
    setActiveTimerId('');
    setActiveTimerState(null);
    setIsTimersMenuOpen(false);
  };

  const duplicateTimer = (id: string, index: number) => {
    const newId = createId('timer_dup');
    const newIds = [...timerIds];
    newIds.splice(index + 1, 0, newId);

    const originalSettings = readJsonStorage<Record<string, any> | null>(`timerSettings_${id}`, null);
    const originalSeconds = readJsonStorage<number>(`timerSeconds_${id}`, 0);
    const originalSync = readJsonStorage<any | null>(`timerSync_${id}`, null);
    if (originalSettings) {
      localStorage.setItem(`timerSettings_${newId}`, JSON.stringify(originalSettings));
    }
    localStorage.setItem(`timerSeconds_${newId}`, JSON.stringify(originalSeconds));
    localStorage.setItem(`timerSync_${newId}`, JSON.stringify(originalSync || {
      startTime: null,
      initialSeconds: originalSeconds,
      isRunning: false,
      mode: originalSettings?.mode || 'countdown',
      lastUpdated: Date.now(),
    }));

    setTimerIds(newIds);
    setActiveTimerId(newId);
  };

  const loadRoom = useCallback((room: Room) => {
    // Remove only genuinely orphaned timer state. Timer IDs can be shared by
    // legacy rooms, so loading one room must not erase another room's state.
    const knownTimerIds = new Set(rooms.flatMap(candidate => candidate.timerIds || []));
    (room.timerIds || []).forEach(id => knownTimerIds.add(id));
    Object.keys(localStorage).forEach(key => {
      if (key.startsWith('timerSettings_') || key.startsWith('timerSync_') || key.startsWith('timerSeconds_') || key.startsWith('timerLog_')) {
        const tid = key.substring(key.indexOf('_') + 1);
        if (!knownTimerIds.has(tid)) localStorage.removeItem(key);
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
        const mode = settings?.mode || 'countdown';
        const initialSeconds = mode === 'countup' ? 0 : target;
        localStorage.setItem(`timerSync_${id}`, JSON.stringify({
          startTime: null,
          initialSeconds,
          isRunning: false,
          mode,
          lastUpdated: Date.now()
        }));
        localStorage.setItem(`timerSeconds_${id}`, JSON.stringify(initialSeconds));
      });
    }
    setCurrentRoomId(room.id);
    setIsNewRoomDraft(false);
    setCurrentRoomName(room.name);
    setTimerIds(room.timerIds || []);
    setActiveTimerId(room.activeTimerId || (room.timerIds?.[0] || ''));
    setActiveTimerState(null);
    setMessages((room.messages || [{ id: '1', text: '', color: '#ffffff', bold: false, uppercase: false, messageSize: 1.0 }]).map(message => ({
      ...message,
      text: message.text || '',
      color: message.color || '#ffffff',
      bold: !!message.bold,
      uppercase: !!message.uppercase,
      messageSize: getMessageSize(message),
    })));
    setMessageShownId(null);
    setMessageFlashId(null);
    setIsRoomMenuOpen(false);
  }, [rooms, setCurrentRoomId, setCurrentRoomName, setTimerIds, setActiveTimerId, setActiveTimerState, setMessages, setMessageShownId, setMessageFlashId]);

  const saveRoom = useCallback(() => {
    const roomName = currentRoomName.trim() || 'Unnamed';
    const existingRoom = currentRoomId ? rooms.find(room => room.id === currentRoomId) : undefined;
    const roomId = existingRoom?.id || currentRoomId || createId('room');
    setCurrentRoomId(roomId);
    setIsNewRoomDraft(false);
    const timerSettings: Record<string, any> = {};
    timerIds.forEach(id => {
      const stored = localStorage.getItem(`timerSettings_${id}`);
      if (stored) timerSettings[id] = readJsonStorage(`timerSettings_${id}`, null);
    });
    const roomData: Room = { id: roomId, name: roomName, timerIds: [...timerIds], activeTimerId, messages: [...messages], timerSettings };
    // Re-read the latest room list before saving so a stale tab cannot replace
    // rooms created or updated by another tab since this tab last rendered.
    const latestRooms = readJsonStorage<Room[]>('stage-timer-rooms', []);
    const nextRooms = mergeItemById(latestRooms, roomData);
    setRooms(nextRooms);
    setSaveNotice('Room saved');
    window.setTimeout(() => setSaveNotice(null), 2200);
  }, [currentRoomId, currentRoomName, rooms, timerIds, activeTimerId, messages, setCurrentRoomId, setRooms]);

  const deleteRoom = useCallback((room: Room) => {
    const remainingTimerIds = new Set(rooms.filter(candidate => candidate.id !== room.id).flatMap(candidate => candidate.timerIds || []));
    (room.timerIds || []).forEach(timerId => {
      if (!remainingTimerIds.has(timerId)) {
        localStorage.removeItem(`timerSettings_${timerId}`);
        localStorage.removeItem(`timerSync_${timerId}`);
        localStorage.removeItem(`timerSeconds_${timerId}`);
        localStorage.removeItem(`timerLog_${timerId}`);
      }
    });
    setRooms(prev => prev.filter(candidate => candidate.id !== room.id));
    if (currentRoomId === room.id) {
      setCurrentRoomId(null);
      setIsNewRoomDraft(true);
      setCurrentRoomName('Unnamed');
      setTimerIds([]);
      setActiveTimerId('');
      setActiveTimerState(null);
      setMessages([{ id: '1', text: '', color: '#ffffff' }]);
      setMessageShownId(null);
    }
  }, [currentRoomId, rooms, setCurrentRoomId, setCurrentRoomName, setTimerIds, setActiveTimerId, setMessages, setMessageShownId, setRooms]);

  const lastOutputPersistRef = useRef({ lastPersistAt: 0, lastUpdated: null as number | null, isRunning: null as boolean | null });
  const syncOutput = useCallback((payload: Record<string, unknown>) => {
    postSharedMessage(CHANNEL_NAME, payload);
    const now = Date.now();
    const lastUpdated = typeof payload.lastUpdated === 'number' ? payload.lastUpdated : null;
    const isRunning = typeof payload.isRunning === 'boolean' ? payload.isRunning : null;
    const controlStateChanged = lastUpdated !== lastOutputPersistRef.current.lastUpdated
      || isRunning !== lastOutputPersistRef.current.isRunning;
    const shouldPersist = payload.type === 'force-sync'
      || controlStateChanged
      || now - lastOutputPersistRef.current.lastPersistAt >= 1000;
    if (!shouldPersist) return;
    try {
      localStorage.setItem('timerState', JSON.stringify(payload));
      lastOutputPersistRef.current = { lastPersistAt: now, lastUpdated, isRunning };
    } catch { /* ignore */ }
  }, []);

  const sendControl = useCallback((command: string, payload?: any) => {
    if (!activeTimerId) return;
    if (command === 'START') {
      const pauseOthersCommand = { command: 'PAUSE_ALL_EXCEPT', payload: activeTimerId };
      postSharedMessage(CONTROL_CHANNEL, pauseOthersCommand);
      window.dispatchEvent(new CustomEvent('stage-timer-pause-all-except', { detail: activeTimerId }));
    }
    const data = { targetId: activeTimerId, command, payload };
    postSharedMessage(CONTROL_CHANNEL, data);
    // Dispatch a local event so components in the same tab (like TimerRow) can respond instantly
    window.dispatchEvent(new CustomEvent('stage-timer-control', { detail: data }));
  }, [activeTimerId]);

  const handleGridAction = useCallback((clientX: number) => {
    if (!gridTrackRef.current || !activeTimerId) return;
    const rect = gridTrackRef.current.getBoundingClientRect();
    const percentage = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    
    const settings = activeTimerState?.settings || (() => {
      return readJsonStorage(`timerSettings_${activeTimerId}`, null);
    })();
    
    const targetDuration = settings?.targetDuration || 0;
    if (targetDuration <= 0) return;

    // The scrubber always uses the countdown mapping - left is the target duration and right is zero.
    const targetCountdownSeconds = targetDuration * (1 - percentage);
    const mode = settings?.mode || 'countdown';
    const targetTimerSeconds = mode === 'countup'
      ? targetDuration - targetCountdownSeconds
      : targetCountdownSeconds;

    sendControl('SET', targetTimerSeconds);
    setHoverTime(targetCountdownSeconds);
  }, [activeTimerId, activeTimerState, sendControl]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDraggingGrid) {
        handleGridAction(e.clientX);
      }
    };
    const handleMouseUp = (e: MouseEvent) => {
      setIsDraggingGrid(false);
      // Always check if we are still inside the grid to decide whether to keep hoverTime
      if (gridTrackRef.current) {
        const rect = gridTrackRef.current.getBoundingClientRect();
        const isInside = (
          e.clientX >= rect.left && e.clientX <= rect.right &&
          e.clientY >= rect.top && e.clientY <= rect.bottom
        );
        if (!isInside) {
          setHoverTime(null);
        } else {
          // Refresh hover time based on current position to ensure it's accurate
          const percentage = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
          const targetDuration = Math.max(0, Number(activeTimerState?.settings?.targetDuration ?? 0));
          setHoverTime(targetDuration * (1 - percentage));
        }
      } else {
        setHoverTime(null);
      }
    };

    if (isDraggingGrid) {
      document.body.style.cursor = 'ew-resize';
      window.addEventListener('mousemove', handleMouseMove, { passive: true });
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      document.body.style.cursor = '';
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDraggingGrid, handleGridAction, activeTimerState?.settings?.targetDuration]);

  const getActiveMessage = useCallback((): { messageText: string; messageColor: string; messageBold: boolean; messageUppercase: boolean; messageSize: number; messageShown: boolean; messageFlash: boolean; messageMaximize: boolean; messageFontHeight: number; messageFontWidth: number } => {
    // Active message priority: currently flashing > shown
    const activeId = (messageFlashId && messages.some(m => m.id === messageFlashId)) ? messageFlashId
      : messageShownId;
    const msg = activeId ? (messages.find(m => m.id === activeId) || null) : null;
    const shownText = msg ? msg.text || '' : '';
    const size = msg && typeof msg.messageSize === 'number' && msg.messageSize > 0 ? msg.messageSize : 1.0;
    return {
      messageText: shownText,
      messageColor: msg?.color || '#ffffff',
      messageBold: !!msg?.bold,
      messageUppercase: !!msg?.uppercase,
      messageSize: size,
      messageFontHeight: (msg?.fontHeight ?? msg?.messageSize) ?? 1.0,
      messageFontWidth: (msg?.fontWidth ?? msg?.messageSize) ?? 1.0,
      messageShown: !!messageShownId || !!messageFlashId,
      messageFlash: !!messageFlashId,
      // Show now acts as maximize: message only, no timer on Output
      messageMaximize: !!messageShownId || !!messageFlashId
    };
  }, [messageFlashId, messageShownId, messages]);

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
        // Only send the flash signal via explicit flash triggers, not continuous sync
        flash: false, 
        isEmpty: false,
        ...getActiveMessage()
      });
    } else if (timerIds.length === 0) {
      syncOutput({ 
        isEmpty: true,
        blackout: isBlackout,
        flash: false,
        ...getActiveMessage()
      });
    }
  }, [activeTimerId, activeTimerState, syncOutput, isBlackout, timerIds.length, getActiveMessage]);

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
    // Send a single explicit flash signal to the output view.
    // This only flashes the timer, not the message.
    syncOutput({ 
      flash: true, 
      ...getActiveMessage(),
      messageFlash: false,
      type: 'force-sync' 
    });

    let count = 0;
    const flashTicks = 3 * 2;
    const interval = setInterval(() => {
      setIsFlash(prev => !prev);
      count++;
      if (count >= flashTicks) {
        clearInterval(interval);
        setIsFlash(false);
        setIsFlashing(false);
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
  const updateMessageSize = (id: string, value: number) => {
    const nextSize = Math.min(10, Math.max(0.1, Number.isFinite(value) ? value : 1.0));
    setMessages(prev => prev.map(m => m.id === id ? { ...m, messageSize: nextSize } : m));

    // Push the new size immediately when this message is currently visible.
    // This keeps the Dashboard and already-open Output tab in sync without
    // changing any timer, timeline, or control behavior.
    if (messageShownId === id || messageFlashId === id) {
      const msg = messages.find(m => m.id === id);
      if (msg) {
        syncOutput({
          messageText: msg.text || '',
          messageColor: msg.color || '#ffffff',
          messageBold: !!msg.bold,
          messageUppercase: !!msg.uppercase,
          messageSize: nextSize,
          messageShown: true,
          messageMaximize: true,
          ...(messageFlashId === id ? { messageFlash: true } : {}),
          type: 'force-sync'
        });
      }
    }
  };
  const getMessageSize = (msg: any) => {
    const v = msg.messageSize;
    if (typeof v === 'number' && v > 0) return v;
    return 1.0;
  };
  const deleteMessage = (id: string) => {
    // Fix #1: if the deleted message is currently shown/flash, clear that state so
    // the Output doesn't stay stuck in a half-shown state. Also clear any scheduled
    // flash timeout reference by resetting the flash id immediately.
    if (messageShownId === id) {
      setMessageShownId(null);
      syncOutput({ messageText: '', messageShown: false, messageMaximize: false, type: 'force-sync' });
    }
    if (messageFlashId === id) {
      setMessageFlashId(null);
      syncOutput({ messageText: '', messageShown: false, messageFlash: false, messageMaximize: false, type: 'force-sync' });
    }
    setMessages(prev => prev.filter(m => m.id !== id));
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
      syncOutput({ messageText: msg.text || '', messageColor: msg.color || '#ffffff', messageBold: !!msg.bold, messageUppercase: !!msg.uppercase, messageSize: getMessageSize(msg), messageShown: true, messageMaximize: true, type: 'force-sync' });
    }
  };
  const flashMessage = (id: string) => {
    // Flash button: quick blink of the MESSAGE ONLY. Does not touch the
    // timer digits — those are driven by isFlashing/isFlash in handleFlash.
    setMessageFlashId(id);
    const msg = messages.find(m => m.id === id);
    if (msg) {
      syncOutput({ 
        messageText: msg.text || '', 
        messageColor: msg.color || '#ffffff', 
        messageBold: !!msg.bold, 
        messageUppercase: !!msg.uppercase, 
        messageSize: getMessageSize(msg), 
        messageFlash: true, 
        messageMaximize: true, 
        type: 'force-sync' 
      });
    }
    setIsMessageFlashing(true);
    let count = 0;
    const flashTicks = 3 * 2;
    const interval = setInterval(() => {
      setIsMessageFlash(prev => !prev);
      count += 1;
      if (count >= flashTicks) {
        clearInterval(interval);
        setIsMessageFlash(false);
        setIsMessageFlashing(false);
        setMessageFlashId(null);
      }
    }, 150);
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
  const addMessage = () => setMessages(prev => [...prev, { id: createId('message'), text: '', color: '#ffffff', bold: false, uppercase: false, messageSize: 1.0 }]);

  const goToNextTimer = () => {
    if (timerIds.length <= 1) return;
    const currentIndex = timerIds.indexOf(activeTimerId);
    if (currentIndex < 0 || currentIndex >= timerIds.length - 1) return;
    const nextIndex = currentIndex + 1;
    if (activeTimerState?.isRunning && activeTimerId) {
      const pauseCommand = { targetId: activeTimerId, command: 'PAUSE' };
      postSharedMessage(CONTROL_CHANNEL, pauseCommand);
      window.dispatchEvent(new CustomEvent('stage-timer-control', { detail: pauseCommand }));
    }
    setActiveTimerId(timerIds[nextIndex]);
  };

  const displaySeconds = activeTimerState ? activeTimerState.seconds : 0;
  const displaySettings = activeTimerState ? activeTimerState.settings : { title: 'No Active Timer', segments: [] };

  const activeTotalTime = Math.max(0, Number(activeTimerState?.settings?.targetDuration ?? 0));
  const activeMode = activeTimerState?.syncState?.mode || activeTimerState?.settings?.mode || 'countdown';
  const activeProgressTotal = activeTotalTime || 1;
  const rawCountdownSeconds = activeMode === 'countup'
    ? activeTotalTime - displaySeconds
    : displaySeconds;
  const displayProgressSeconds = Math.max(0, Math.min(activeTotalTime, rawCountdownSeconds));
  // Hover is preview-only. The primary displays always use the committed timer state.
  const renderedCountdownSeconds = displayProgressSeconds;
  const renderedDisplaySeconds = activeMode === 'countup'
    ? Math.max(0, displaySeconds)
    : displaySeconds;
  const hoverDisplaySeconds = hoverTime !== null
    ? (activeMode === 'countup' ? activeTotalTime - hoverTime : hoverTime)
    : renderedDisplaySeconds;
  const currentTime = activeTimerState ? formatClock(renderedDisplaySeconds) : '--:--';

  const getDashboardTextColor = () => {
    if (!activeTimerId) return '#333';
    const rounded = Math.floor(displayProgressSeconds);
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
    <div className="flex h-screen flex-col bg-[#1a1a1a] text-white antialiased overflow-hidden">
      {saveNotice && <div className="fixed left-1/2 top-4 z-[100] -translate-x-1/2 rounded-md border border-[#3b82f6] bg-[#1e3a8a] px-4 py-2 text-[13px] font-bold text-white shadow-xl" role="status">{saveNotice}</div>}
      <header className="flex flex-col sm:flex-row items-center justify-between gap-3 px-3 py-2 border-b border-[#333] shrink-0 z-20 bg-[#1a1a1a]">
        <input type="text" value={currentRoomName} onChange={(e) => setCurrentRoomName(e.target.value)} className="bg-transparent text-[20px] font-bold text-[#8a8a8a] outline-none focus:text-white transition-colors w-full sm:w-64 text-center sm:text-left" placeholder="Unnamed" />
        <div className="flex flex-wrap items-center justify-center gap-2">
          <button type="button" onClick={saveRoom} className="flex h-9 items-center gap-2 rounded-md bg-[#2d2d2d] px-4 text-[13px] text-white hover:bg-[#383838]"><IconSave className="mr-1" /> Save</button>
          <div className="relative">
            <button type="button" onClick={(e) => { e.stopPropagation(); setIsRoomMenuOpen(!isRoomMenuOpen); }} className="flex h-9 items-center gap-2 rounded-md bg-[#2d2d2d] px-4 text-[13px] text-white hover:bg-[#383838]">Room <IconChevronDown /></button>
            {isRoomMenuOpen && (
              <div onClick={(e) => e.stopPropagation()} className="absolute right-0 top-full z-50 mt-1 w-64 rounded-md border border-[#444] bg-[#242424] p-1 shadow-xl">
                <div className="px-2 py-1.5 text-[10px] uppercase tracking-wide text-[#777]">Saved Rooms</div>
                {rooms.map((room) => (
                  <div key={room.id} onClick={() => loadRoom(room)} className="group flex items-center justify-between rounded px-2 py-2 text-left text-[13px] text-white hover:bg-[#383838] cursor-pointer">
                    <span className="truncate">{room.name}</span>
                    <button onClick={(e) => { e.stopPropagation(); deleteRoom(room); }} className="opacity-0 group-hover:opacity-100 text-[#fa5252] hover:text-red-400 p-1">✕</button>
                  </div>
                ))}
                <div className="mt-1 border-t border-[#333] pt-1"><button onClick={() => {
                  // Reset only the active room state; preserve existing rooms and their timers.
                  localStorage.removeItem('stage-timer-message-shown-id');
                  setCurrentRoomId(createId('room-draft'));
                  setIsNewRoomDraft(true);
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
          <input type="file" ref={fileInputRef} onChange={(e) => { const file = e.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = (event) => { try { const imported = JSON.parse(event.target?.result as string); if (imported.rooms && Array.isArray(imported.rooms)) { 
  const importedRoomIdMap = new Map<string, string>();
  const importedRooms = imported.rooms.map((room: any, index: number) => {
    const sourceRoomId = room.id || `imported_${Date.now()}_${index}`;
    const importedRoomId = createId('imported_room');
    importedRoomIdMap.set(sourceRoomId, importedRoomId);
    const timerIdMap = new Map<string, string>();
    const remapTimerId = (sourceTimerId: string) => {
      if (!timerIdMap.has(sourceTimerId)) timerIdMap.set(sourceTimerId, createId('imported_timer'));
      return timerIdMap.get(sourceTimerId)!;
    };
    const sourceTimerIds = Array.isArray(room.timerIds) ? room.timerIds : [];
    const timerIds = sourceTimerIds.map((sourceTimerId: string) => remapTimerId(sourceTimerId));
    const sourceSettings = room.timerSettings && typeof room.timerSettings === 'object' ? room.timerSettings : {};
    const timerSettings = Object.fromEntries(Object.entries(sourceSettings).map(([sourceTimerId, settings]) => [
      remapTimerId(sourceTimerId),
      normalizeTimerSettingsForTransfer((settings && typeof settings === 'object') ? settings as Record<string, any> : {}),
    ]));
    return {
      ...room,
      id: importedRoomId,
      timerIds,
      activeTimerId: room.activeTimerId ? remapTimerId(room.activeTimerId) : '',
      timerSettings,
    } as Room;
  });
  const latestRooms = readJsonStorage<Room[]>('stage-timer-rooms', []);
  const nextRooms = mergeItemsById(latestRooms, importedRooms);
  setRooms(nextRooms);
  const mappedActiveRoom = imported.activeRoomId
    ? importedRooms.find((room: Room) => room.id === importedRoomIdMap.get(imported.activeRoomId))
    : undefined;
  const activeRoom = mappedActiveRoom || (imported.activeRoomName
    ? importedRooms.find((room: Room) => room.name === imported.activeRoomName)
    : undefined);
  if (activeRoom) loadRoom(activeRoom);
  setSaveNotice('Room imported');
  window.setTimeout(() => setSaveNotice(null), 2200);
} } catch (err) { console.error(err); setSaveNotice('Import failed - invalid backup file'); window.setTimeout(() => setSaveNotice(null), 2600); } }; reader.readAsText(file); e.target.value = ''; }} accept=".json" className="hidden" />
          <button type="button" onClick={() => fileInputRef.current?.click()} className="flex h-9 items-center gap-2 rounded-md border border-[#444] bg-[#2d2d2d] px-4 text-[13px] text-white hover:bg-[#383838]"><IconDownload className="mr-1" /> Import</button>
          <button type="button" onClick={() => { const exportTimerSettings: Record<string, any> = {};
            timerIds.forEach(id => {
              const settings = readJsonStorage<Record<string, any> | null>(`timerSettings_${id}`, null);
              if (settings) exportTimerSettings[id] = normalizeTimerSettingsForTransfer(settings);
            });
                        const activeRoomSnapshot: Room | null = currentRoomId ? { id: currentRoomId, name: currentRoomName.trim() || 'Unnamed', timerIds: [...timerIds], activeTimerId, messages: [...messages], timerSettings: exportTimerSettings } : null;
                        const exportedRooms = activeRoomSnapshot
                          ? mergeItemById(rooms, activeRoomSnapshot)
                          : rooms;
                        const exportData = { rooms: exportedRooms, activeRoomId: currentRoomId, activeRoomName: currentRoomName, exportedAt: new Date().toISOString() };
 const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `stage-timer-backup-${new Date().toISOString().split('T')[0]}.json`; link.click(); URL.revokeObjectURL(url); }} className="flex h-9 items-center gap-2 rounded-md border border-[#444] bg-[#2d2d2d] px-4 text-[13px] text-white hover:bg-[#383838]"><IconUpload className="mr-1" /> Export</button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto lg:overflow-hidden flex flex-col lg:flex-row">
        <aside className="flex w-full lg:w-[380px] xl:w-[420px] shrink-0 flex-col border-b lg:border-b-0 lg:border-r border-[#333] px-4 py-3 h-auto lg:h-full lg:overflow-y-auto custom-scrollbar">
          <div className="mb-3 flex items-center justify-between"><h2 className="text-[17px] font-bold text-white">Dashboard</h2><button type="button" onClick={openOutput} className="flex h-8 items-center gap-2 rounded-md border border-[#444] bg-[#2d2d2d] px-3 text-[12px] text-white hover:bg-[#383838]"><IconScreen className="mr-1" /> Output Links</button></div>
          <div className={`relative flex aspect-video w-full flex-col items-center justify-center rounded-lg border border-[#333] bg-[#141414] p-3 shadow-xl transition-all duration-300 overflow-hidden shrink-0`}>
            {isBlackout && <div className="absolute inset-0 z-10 rounded-lg bg-black" />}

            {/* Timer background layer; the shared message stage sits above it. */}
            <div className={`w-full flex flex-col items-center justify-center transition-all duration-300 ${getActiveMessage().messageShown && getActiveMessage().messageText && !isBlackout ? 'filter blur-[8px] brightness-50 select-none pointer-events-none' : ''}`}>
              <div className="flex w-full min-w-0 items-center justify-center text-center text-[13px] mb-2"><span className="block max-w-full truncate font-bold text-[#7eb8ff] uppercase tracking-wider">{displaySettings.title}</span></div>
              <div 
                className="digit flex w-full items-center justify-center text-center font-bold leading-none tracking-tighter transition-all duration-75 mb-4" 
                style={{ 
                  color: getDashboardTextColor(), 
                  fontSize: 'clamp(40px, 18vw, 90px)',
                  opacity: isFlashing ? (isFlash ? 1 : 0.45) : 1,
                  textShadow: isFlashing && isFlash
                    ? `0 0 8px ${getDashboardTextColor()}`
                    : 'none'
                }}
              >
                {renderedDisplaySeconds < 0 && activeMode === 'countdown' ? '+' + formatClock(Math.abs(renderedDisplaySeconds)) : currentTime}
              </div>
              {activeTimerId && <ProgressBar currentSeconds={displayProgressSeconds} totalSeconds={activeTotalTime} segments={displaySettings.segments} height="h-5" className="rounded-sm" />}
            </div>

            <MessageStage
              className="absolute inset-3 z-20"
              active={!isBlackout && getActiveMessage().messageShown}
              message={getActiveMessage()}
              flashActive={isMessageFlashing}
              flashVisible={isMessageFlash}
            />
          </div>

          {activeTimerId && (
            <>
              <div className="mt-4 flex items-center justify-center gap-4 text-[13px]">
                <span className="inline-block rounded border border-[#444] px-2 py-[1px] text-[10px] font-bold tracking-wider text-[#8a8a8a]">ON AIR</span>
                <div className="flex items-center gap-2 text-white">
                  <div className={`h-2 w-2 rounded-full ${hoverTime !== null ? 'bg-white shadow-[0_0_8px_rgba(255,255,255,0.8)]' : 'bg-[#444]'}`}></div>
                  <span className="font-mono text-[18px] font-bold tracking-tight">
                    {hoverDisplaySeconds < 0 && activeMode === 'countdown' ? '+' + formatClock(Math.abs(hoverDisplaySeconds)) : formatClock(hoverDisplaySeconds)}.{Math.floor(Math.abs((hoverDisplaySeconds % 1) * 10))}
                  </span>
                </div>
              </div>

              <div 
                ref={gridTrackRef}
                className={`relative mt-6 group select-none ${activeTotalTime > 0 ? 'cursor-pointer' : 'cursor-not-allowed'}`}
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
                  
                  <ProgressBar currentSeconds={displayProgressSeconds} totalSeconds={activeTotalTime} segments={displaySettings.segments} height="h-[3px]" className="absolute bottom-0 left-0 right-0" />
                  
                  {/* Red Playhead Marker */}
                  <div 
                    className="absolute top-0 bottom-0 w-[2px] bg-[#fa5252] pointer-events-none z-20"
                    style={{ 
                      left: `${Math.max(0, Math.min(100, (1 - ((isDraggingGrid && hoverTime !== null ? hoverTime : displayProgressSeconds) / activeProgressTotal)) * 100))}%`,
                      transition: (activeTimerState?.isRunning || isDraggingGrid) ? 'none' : 'left 0.1s linear'
                    }}
                  >
                    {/* The Flag Shape from the image */}
                    <div className="absolute -top-[1px] left-1/2 -translate-x-1/2 w-5 h-3.5 bg-[#fa5252] rounded-[2px]" style={{ clipPath: 'polygon(0% 0%, 100% 0%, 100% 70%, 50% 100%, 0% 70%)' }} />
                  </div>

                  {/* Hover Playhead Marker (Subtle ghost line) */}
                  {hoverTime !== null && !isDraggingGrid && (
                    <div 
                      className="absolute top-0 bottom-0 w-[1px] bg-white/20 pointer-events-none z-0"
                      style={{ 
                        left: `${Math.max(0, Math.min(100, (1 - (hoverTime / activeProgressTotal)) * 100))}%`
                      }}
                    />
                  )}

                  {/* Transparent Interaction Overlay */}
                  <div 
                    className="absolute inset-0 z-30 cursor-ew-resize"
                    style={{ touchAction: 'none' }}
                    onTouchStart={(e) => {
                      if (activeTotalTime <= 0) return;
                      e.preventDefault();
                      setIsDraggingGrid(true);
                      handleGridAction(e.touches[0].clientX);
                    }}
                    onTouchMove={(e) => {
                      if (!isDraggingGrid || activeTotalTime <= 0 || e.touches.length === 0) return;
                      e.preventDefault();
                      handleGridAction(e.touches[0].clientX);
                    }}
                    onTouchEnd={() => setIsDraggingGrid(false)}
                    onMouseDown={(e) => {
                      if (activeTotalTime <= 0 || e.button !== 0) return;
                      e.preventDefault(); 
                      setIsDraggingGrid(true);
                      handleGridAction(e.clientX);
                    }}
                    onMouseMove={(e) => {
                      if (activeTotalTime <= 0) return;
                      const rect = e.currentTarget.getBoundingClientRect();
                      const x = e.clientX - rect.left;
                      const percentage = Math.max(0, Math.min(1, x / rect.width));
                      const targetDuration = activeTotalTime;
                      const time = targetDuration * (1 - percentage);
                      setHoverTime(time);
                      
                      if (isDraggingGrid) {
                        handleGridAction(e.clientX);
                      }
                    }}
                    onMouseLeave={() => {
                      if (!isDraggingGrid) setHoverTime(null);
                    }}
                    onMouseUp={() => {
                      setIsDraggingGrid(false);
                    }}
                  />
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
            <button 
              onClick={goToNextTimer} 
              disabled={timerIds.length <= 1 || timerIds.indexOf(activeTimerId) >= timerIds.length - 1}
              className={`col-span-1 flex h-10 items-center justify-center rounded border border-[#333] bg-[#2d2d2d] transition-colors ${timerIds.length <= 1 || timerIds.indexOf(activeTimerId) >= timerIds.length - 1 ? 'opacity-30 cursor-not-allowed' : 'hover:bg-[#383838]'}`}
              title="Next timer"
            >
              <IconSkipForward />
            </button>
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

        <main className="timer-panel min-w-0 flex-1 lg:min-w-[560px] flex flex-col px-4 sm:px-6 lg:px-10 py-6 bg-[#141414] h-auto lg:h-full lg:overflow-y-auto custom-scrollbar">
          <div className="mb-8 flex items-center justify-between">
            <h2 className="text-[17px] font-bold text-white">Timers</h2>
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
                  onClick={(e) => {
                    e.stopPropagation();
                    window.dispatchEvent(new CustomEvent('stage-timer-menu-open', { detail: 'header' }));
                    setIsTimersMenuOpen(!isTimersMenuOpen);
                  }}
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
                      <span>Play in sequence</span>
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
                onActivate={(manualStart = false) => {
                  if (manualStart) {
                    const settings = id === activeTimerId && activeTimerState
                      ? activeTimerState.settings
                      : readJsonStorage<Record<string, any> | null>(`timerSettings_${id}`, null);
                    if (settings?.scheduledStart !== null && Number.isFinite(Number(settings?.scheduledStart))) {
                      const scheduledDateForToday = new Intl.DateTimeFormat('en-CA', { timeZone: selectedTimeZone }).format(new Date());
                      const scheduledDate = settings.scheduledStartDate || scheduledDateForToday;
                      const scheduledAt = getZonedDateTimeTimestamp(scheduledDate, Number(settings.scheduledStart), selectedTimeZone);
                      manuallyStartedScheduledTimersRef.current.add(`${id}:${scheduledAt}`);
                    }
                  }
                  // When a different timer is selected, stop the currently
                  // playing one so only one timer runs at a time, then move
                  // the selection to the newly chosen timer.
                  const currentlyRunning = activeTimerState?.isRunning;
                  if (currentlyRunning && activeTimerId && activeTimerId !== id) {
                    try {
                      postSharedMessage(CONTROL_CHANNEL, { targetId: activeTimerId, command: 'PAUSE' });
                      postSharedMessage(CONTROL_CHANNEL, { command: 'PAUSE_ALL_EXCEPT', payload: id });
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

        <aside className="flex w-full lg:w-[340px] xl:w-[380px] shrink-0 flex-col border-t lg:border-t-0 lg:border-l border-[#333] px-4 py-3 h-auto lg:h-full lg:overflow-y-auto custom-scrollbar">
          <div className="mb-4 flex items-center justify-between"><div className="flex items-center gap-3"><h2 className="text-[17px] font-bold text-white">Messages</h2></div><button type="button" onClick={() => { if (messageShownId) { flashMessage(messageShownId); } }} className="flex h-8 w-8 items-center justify-center rounded border border-[#555] bg-transparent text-white hover:bg-[#333]" title="Flash the currently shown message on Output"><IconFlash size={14} /></button></div>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleMessageDragEnd} modifiers={[restrictToVerticalAxis]}>
            <SortableContext items={messages.map(m => m.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-2 overflow-y-auto custom-scrollbar pr-1">
                {messages.map((msg, idx) => (
                  <MessageRow 
                    key={msg.id} 
                    msg={msg} 
                    idx={idx} 
                    isShown={messageShownId === msg.id}
                    messageShownId={messageShownId}
                    onUpdate={updateMessage}
                    onDelete={deleteMessage}
                    onUpdateColor={updateMessageColor}
                    onToggleBold={toggleMessageBold}
                    onToggleUppercase={toggleMessageUppercase}
  
                    onUpdateSize={updateMessageSize}
                    onShow={showMessage}
                    getMessageSize={getMessageSize}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
          <div className="mt-6 space-y-4"><button type="button" onClick={addMessage} className="flex w-full items-center justify-center rounded-lg border border-[#444] bg-[#2d2d2d] px-6 py-2.5 text-[14px] font-bold text-white hover:bg-[#383838] shadow-md">+ Add Message</button></div>
        </aside>
      </div>

      <footer className="flex items-center justify-between border-t border-[#333] bg-[#1a1a1a] px-4 py-2 text-[11px] text-[#666] shrink-0 z-20">
        <div className="flex items-center gap-4"></div>
        {(() => {
          const durations = timerIds.map(id => {
            if (id === activeTimerId && activeTimerState?.settings) {
              return Number(activeTimerState.settings.targetDuration || 0);
            }
            return readJsonStorage<any>(`timerSettings_${id}`, null)?.targetDuration || 0;
          });
          const total = durations.reduce((a, b) => a + b, 0);
          const activeIdx = activeTimerId ? timerIds.indexOf(activeTimerId) : -1;
          let elapsed = 0;
          for (let i = 0; i < Math.min(activeIdx, timerIds.length); i++) elapsed += durations[i];
          const activeDuration = activeIdx >= 0 ? (durations[activeIdx] || 0) : 0;
          const timelineMode = activeTimerState?.syncState?.mode || activeTimerState?.settings?.mode || 'countdown';
          if (activeIdx >= 0 && total > 0) {
            const activeProgress = timelineMode === 'countup'
              ? Math.max(0, Math.min(activeDuration, displaySeconds))
              : Math.max(0, Math.min(activeDuration, activeDuration - displaySeconds));
            elapsed += activeProgress;
          }
          const scrubberPct = total > 0 ? Math.min(1, Math.max(0, elapsed / total)) : 0;
          const lowerTimelinePct = scrubberPct;
          const endLabel = total === 0 ? '0:00' : '-' + formatClock(total);
          // Left label: elapsed position (HH:MM:SS while running), or 0:00 before start
          const leftLabel = total > 0 && activeIdx >= 0 ? formatClock(Math.min(elapsed, total)) : '0:00';
          return (
            <div className="flex flex-1 items-center gap-3 px-4">
              <span className="tabular-nums shrink-0 text-white">{leftLabel}</span>
              {/* Combined timeline: one single track layer with clipped segments on the same baseline */}
              <div className="relative flex flex-1 items-center self-center mx-2 h-6">
                {/* Base track */}
                <div className="absolute inset-y-0 my-auto h-1 w-full rounded-full bg-[#333]"></div>
                {/* Elapsed portion (dark gray) — clipped at the scrubber, same baseline as track */}
                <div className="absolute inset-y-0 my-auto h-1 w-full overflow-hidden rounded-full" style={{ clipPath: `inset(0 ${100 - lowerTimelinePct * 100}% 0 0)` }}>
                  <div className="h-full w-full rounded-full bg-[#666]"></div>
                </div>
                {/* Remaining portion (white) — clipped after the scrubber */}
                <div className="absolute inset-y-0 my-auto h-1 w-full overflow-hidden rounded-full" style={{ clipPath: `inset(0 0 0 ${lowerTimelinePct * 100}%)` }}>
                  <div className="h-full w-full rounded-full bg-white"></div>
                </div>
                {/* Thin vertical separators between stages — same height and baseline as the track */}
                {timerIds.length > 1 && durations.slice(0, -1).map((_, i) => {
                  let cum = durations[0]; for (let j = 1; j <= i; j++) cum += durations[j];
                  return <div key={`tick-${i}`} className="absolute inset-y-0 my-auto z-10 h-2.5 w-px bg-[#888]" style={{ left: `${(cum / total) * 100}%` }}></div>;
                })}
                {/* Blue position marker centered on the same baseline */}
                <div 
                  className="h-4 w-4 rounded-full bg-[#3b82f6] shadow-lg absolute my-auto -translate-x-1/2 z-20" 
                  style={{ left: `${lowerTimelinePct * 100}%` }}
                ></div>
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
// Deployment trigger for restoration to stable version 091648b
