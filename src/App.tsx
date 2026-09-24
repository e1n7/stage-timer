import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import Image from 'next/image';
import { createPortal } from 'react-dom';
import { useTimer } from './hooks/useTimer';
import { ProgressBar } from './components/ProgressBar';
import { MessageStage } from './components/MessageStage';
import { useLocalStorage } from './hooks/useLocalStorage';
import { postSharedMessage, subscribeSharedChannel } from './lib/sharedChannel';
import { readJsonStorage } from './lib/storage';
import { mergeItemById, mergeItemsById } from './lib/roomStorage';
import { formatTimeOfDay } from './lib/time';
import {
  DndContext,
  closestCenter,
  pointerWithin,
  type CollisionDetection,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  DragEndEvent,
  DragOverEvent,
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

const collisionDetectionStrategy: CollisionDetection = (args) => {
  // The sortable section/header rectangles are larger than their visual
  // boundary and can otherwise win the collision race, causing a timer to be
  // nested while it is merely passing above or below a section. Prefer the
  // concrete Excel-like grid cells whenever the pointer is over one.
  const activeId = String(args.active.id);
  const gridContainers = args.droppableContainers.filter((container) => {
    const id = String(container.id);
    if (!id.startsWith('grid:')) return false;
    // Never let the source row's own before/inside/after cells win while the
    // item is being dragged. This is especially important when moving down:
    // otherwise the pointer remains over the source grid until it has passed
    // the entire following row.
    return !id.endsWith(`:${activeId}`);
  });
  const gridCollisions = pointerWithin({ ...args, droppableContainers: gridContainers });
  if (gridCollisions.length > 0) return gridCollisions;
  const fallbackContainers = args.droppableContainers.filter((container) => {
    const id = String(container.id);
    return id !== activeId && !id.startsWith('header:');
  });
  return closestCenter({ ...args, droppableContainers: fallbackContainers });
};

const writeStorageItem = (key: string, value: string): boolean => {
  if (typeof window === 'undefined') return false;
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
};

const removeStorageItem = (key: string): boolean => {
  if (typeof window === 'undefined') return false;
  try {
    window.localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
};

const getStorageKeys = (): string[] => {
  if (typeof window === 'undefined') return [];
  try {
    return Object.keys(window.localStorage);
  } catch {
    return [];
  }
};

const pad = (value: number) => value.toString().padStart(2, '0');

const getStoredMessageSize = (message: any): number => {
  const value = message?.messageSize;
  return typeof value === 'number' && value > 0 ? value : 1.0;
};

const InfoHint = ({ text }: { text: string }) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <span className="group relative inline-flex align-middle">
      <button
        type="button"
        aria-label={text}
        aria-expanded={isOpen}
        onClick={() => setIsOpen((open) => !open)}
        onBlur={() => setIsOpen(false)}
        className="inline-flex h-4 w-4 items-center justify-center rounded focus:outline-none focus-visible:ring-1 focus-visible:ring-[#4a9eff]"
      >
        <Image src="/info.svg" alt="" aria-hidden="true" width={14} height={14} className="h-3.5 w-3.5 invert opacity-75 transition-opacity group-hover:opacity-100" />
      </button>
      <span
        role="tooltip"
        className={`pointer-events-none absolute left-0 top-full z-20 mt-2 w-64 rounded border border-[#444] bg-[#252525] px-2.5 py-2 text-left text-[11px] leading-relaxed text-white shadow-lg transition-opacity ${isOpen ? 'visible opacity-100' : 'invisible opacity-0 group-hover:visible group-hover:opacity-100'}`}
      >
        {text}
      </span>
    </span>
  );
};

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

const StartTimeInput = ({ value, dateValue, onChange, selectedTimeZone, showToggle = true, indent = true }: { value: number | null, dateValue?: string | null, onChange: (val: number | null, date?: string | null) => void, selectedTimeZone: string, showToggle?: boolean, indent?: boolean }) => {
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
    <div className="flex flex-col items-end gap-3">
      {showToggle && (
        <div className="flex items-center gap-2 whitespace-nowrap">
          <input
            type="checkbox"
            id="manual-start"
            checked={value !== null}
            onChange={(e) => onChange(e.target.checked ? displayValue : null, e.target.checked ? selectedDate : null)}
            className="h-4 w-4 rounded border-[#333] bg-[#141414] accent-[#4a9eff]"
          />
          <label htmlFor="manual-start" className="cursor-pointer text-[13px] text-[#8a8a8a]">Set Specific Start Time</label>
        </div>
      )}
      {(showToggle ? value !== null : true) && (
        <div className={`${indent ? 'ml-6 ' : ''}flex min-w-0 flex-col gap-3`}>
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
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M15 2H5a3 3 0 0 0-3 3v14a3 3 0 0 0 3 3h14a3 3 0 0 0 3-3V7z"/><path d="M13 2v6H7V2"/><path d="M6 18h12v4H6z"/></svg>
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
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="16" height="16" rx="2" /></svg>
);
const IconCheckbox = ({ checked, size = 13 }: IconProps & { checked: boolean }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2" fill={checked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" />{checked && <path d="m7 12 3 3 7-7" fill="none" stroke="#2d2d2d" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />}</svg>
);
const IconClose = ({ size = 16 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
);
const IconTrash = ({ size = 14 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><line x1="10" y1="11" x2="10" y2="17" /><line x1="14" y1="11" x2="14" y2="17" /></svg>
);
const IconDuplicate = ({ size = 14 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
);
const IconAddTimer = ({ size = 24 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="10.5" cy="12" r="8.5" /><path d="M10.5 7.5v4l-3.5 3.5" /></svg>
);
const IconLayers = ({ size = 24 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" version="1.1" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" aria-hidden="true"><path d="m1.75 11 6.25 3.25 6.25-3.25m-12.5-3 6.25 3.25 6.25-3.25m-6.25-6.25-6.25 3.25 6.25 3.25 6.25-3.25z" /></svg>
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

const ModalPortal = ({ children }: { children: React.ReactNode }) => {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;
  return createPortal(children, document.body);
};

interface TimerTitleEditModalProps {
  isOpen: boolean;
  title: string;
  onClose: () => void;
  onSave: (title: string) => void;
}

const TimerTitleEditModal = ({ isOpen, title, onClose, onSave }: TimerTitleEditModalProps) => {
  const [draftTitle, setDraftTitle] = useState(title);

  useEffect(() => {
    if (isOpen) setDraftTitle(title);
  }, [isOpen, title]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSave = () => {
    const nextTitle = draftTitle.trim();
    if (nextTitle) onSave(nextTitle);
  };

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/70 backdrop-blur-md p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
        <div role="dialog" aria-modal="true" aria-labelledby="timer-title-edit-heading" className="w-full max-w-[520px] rounded-lg border border-[#444] bg-[#242424] p-5 shadow-2xl">
          <h2 id="timer-title-edit-heading" className="mb-4 text-[16px] font-semibold text-white">Edit timer</h2>
          <label htmlFor="timer-title-edit-input" className="mb-2 block text-[12px] font-medium text-white/60">Title</label>
          <input
            id="timer-title-edit-input"
            type="text"
            value={draftTitle}
            onChange={(event) => setDraftTitle(event.target.value)}
            onKeyDown={(event) => { if (event.key === 'Enter') handleSave(); }}
            autoFocus
            className="h-10 w-full rounded-md border border-[#444] bg-[#171717] px-3 text-[14px] text-white outline-none transition-colors focus:border-[#666]"
          />
          <div className="mt-5 flex justify-end gap-2">
            <button type="button" onClick={onClose} className="h-9 rounded-md border border-[#555] px-4 text-[13px] text-white/80 transition-colors hover:bg-[#333] hover:text-white">Cancel</button>
            <button type="button" onClick={handleSave} disabled={!draftTitle.trim()} className="h-9 rounded-md border border-[#2f9e44] px-4 text-[13px] text-[#22c55e] transition-colors hover:bg-[#2f9e44] hover:text-white disabled:cursor-not-allowed disabled:opacity-40">Save</button>
          </div>
        </div>
      </div>
    </ModalPortal>
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
  section?: 'start' | 'duration';
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
    <ModalPortal>
      <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 p-4 backdrop-blur-md" onClick={(e) => e.stopPropagation()}>
      <div role="dialog" aria-modal="true" aria-labelledby="timer-settings-title" className="relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-[#444] bg-[#242424] px-5 pb-5 pt-5 shadow-2xl custom-scrollbar" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 pr-1">
          <div className="flex items-center gap-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center text-[#9fc7ff]"><IconSettings size={21} /></span>
            <h2 id="timer-settings-title" className="text-[17px] font-bold tracking-tight text-white">Timer settings{localSettings.title ? ` for “${localSettings.title}”` : ''}</h2>
          </div>
          <button type="button" onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded text-[#999] transition-colors hover:bg-[#383838] hover:text-white" aria-label="Close timer settings" title="Close"><IconClose size={16} /></button>
        </div>
        <div className="my-4 h-px bg-[#333]" />

        <div className="space-y-4">
          <div className="flex items-center gap-4 border-b border-[#333]/60 pb-3">
            <label className="w-24 shrink-0 text-[13px] text-[#aaa]">Title</label>
            <input type="text" value={localSettings.title} onChange={(e) => setLocalSettings({ ...localSettings, title: e.target.value })} className="min-w-0 flex-1 rounded-md border border-[#444] bg-[#171717] px-3 py-2 text-[14px] text-white outline-none transition-colors focus:border-[#6b8db5]" />
          </div>

        </div>

        <div className="my-5 h-px bg-[#333]" />

        <div className="grid grid-cols-1 gap-8">
          <div className="space-y-4">
            <h3 className="text-[14px] font-bold tracking-tight text-white">Timing</h3>
            
            <div className="flex items-start justify-between gap-6 pb-3 border-b border-[#333]">
              <span className="flex items-center gap-1 text-[12px] text-[#8a8a8a] pt-1">Start Time <InfoHint text="When enabled, this timer starts at the selected time in the chosen timezone." /></span>
              <StartTimeInput 
                value={localSettings.scheduledStart} 
                dateValue={localSettings.scheduledStartDate}
                onChange={(val, date) => setLocalSettings({ ...localSettings, scheduledStart: val, scheduledStartDate: date })}
                selectedTimeZone={selectedTimeZone}
              />
            </div>

            <div className="flex items-center justify-between gap-6 py-2">
              <span className="flex items-center gap-1 text-[12px] text-[#8a8a8a]">Duration <InfoHint text="The total amount of time this timer runs." /></span>
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

        <div className="mt-8 flex flex-col gap-2 sm:flex-row sm:gap-3"><button type="button" onClick={onClose} className="h-11 flex-1 rounded-md border border-[#444] bg-[#2d2d2d] px-3 text-[14px] font-bold text-white transition-colors hover:bg-[#383838]">Cancel</button><button type="button" onClick={() => { onConfirm?.(localSettings); onClose(); }} className="h-11 flex-1 rounded-md border border-[#2f9e44] px-3 text-[14px] font-bold text-[#22c55e] transition-colors hover:bg-[#2f9e44] hover:text-white">Save Settings</button></div>
            </div>
      </div>
    </ModalPortal>
  );
};
const QuickSettingsModal = ({ isOpen, onClose, settings, onApplyToAll, onConfirm, onSettingsUpdate, selectedTimeZone, section = 'start' }: TimerSettingsModalProps) => {
  const [localSettings, setLocalSettings] = useState(settings);

  useEffect(() => {
    if (isOpen) setLocalSettings(settings);
  }, [isOpen, settings]);

  if (!isOpen) return null;

  return (
    <ModalPortal>
      <div
        className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 p-4 backdrop-blur-md"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) onClose();
        }}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="timer-duration-edit-heading"
          className="relative w-full max-w-[480px] rounded-xl border border-[#444] bg-[#242424] px-5 pb-5 pt-5 shadow-2xl"
          onMouseDown={(event) => event.stopPropagation()}
        >
          <div className="flex items-center justify-between gap-3 pr-1">
            <div className="flex items-center gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center text-[#9fc7ff]"><IconSettings size={20} /></span>
              <h2 id="timer-duration-edit-heading" className="text-[17px] font-bold tracking-tight text-white">{section === 'duration' ? 'Timer settings' : 'Edit timer'}</h2>
            </div>
            <button type="button" onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded text-[#999] transition-colors hover:bg-[#383838] hover:text-white" aria-label="Close timer settings" title="Close"><IconClose size={16} /></button>
          </div>
          <div className="my-4 h-px bg-[#333]" />

          {section === 'duration' ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-6 py-2">
                <span className="flex items-center gap-1 text-[12px] text-[#8a8a8a]">Duration <InfoHint text="The total amount of time this timer runs." /></span>
                <DurationInput
                  value={localSettings.targetDuration || 0}
                  onChange={(value) => setLocalSettings({ ...localSettings, targetDuration: value })}
                />
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[12px] text-[#8a8a8a]">Appearance</span>
                <select
                  value={localSettings.mode || 'countdown'}
                  onChange={(event) => setLocalSettings({ ...localSettings, mode: event.target.value as any })}
                  className="flex-1 rounded border border-[#333] bg-[#141414] px-3 py-1.5 text-[13px] text-white focus:outline-none"
                >
                  <option value="countdown">Countdown</option>
                  <option value="countup">Countup</option>
                </select>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-[12px] text-[#8a8a8a]">Font Height</span>
                <div className="flex flex-1 items-center gap-3">
                  <input type="range" min="0.5" max="3.0" step="0.1" value={localSettings.fontHeight || 1.6} onChange={(event) => setLocalSettings({ ...localSettings, fontHeight: parseFloat(event.target.value) })} className="flex-1 accent-[#4a9eff]" />
                  <span className="w-10 text-right font-mono text-[12px] text-white">{(localSettings.fontHeight || 1.6).toFixed(1)}x</span>
                </div>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-[12px] text-[#8a8a8a]">Font Width</span>
                <div className="flex flex-1 items-center gap-3">
                  <input type="range" min="0.5" max="2.0" step="0.1" value={localSettings.fontWidth || 1.0} onChange={(event) => setLocalSettings({ ...localSettings, fontWidth: parseFloat(event.target.value) })} className="flex-1 accent-[#4a9eff]" />
                  <span className="w-10 text-right font-mono text-[12px] text-white">{(localSettings.fontWidth || 1.0).toFixed(1)}x</span>
                </div>
              </div>
              <div className="flex justify-end">
                <button type="button" onClick={() => { onApplyToAll?.({ mode: localSettings.mode, fontHeight: localSettings.fontHeight, fontWidth: localSettings.fontWidth }); onSettingsUpdate(); }} className="text-[11px] text-[#4a9eff] hover:underline">Apply to all</button>
              </div>
            </div>
          ) : (
            <div className="mt-4 space-y-4">
              <div className="flex items-start justify-between gap-6 pb-3">
                <span className="flex items-center gap-1 pt-1 text-[13px] text-[#8a8a8a]">Start Time <InfoHint text="When enabled, this timer starts at the selected time in the chosen timezone." /></span>
                <StartTimeInput
                  value={localSettings.scheduledStart}
                  dateValue={localSettings.scheduledStartDate}
                  onChange={(value, date) => setLocalSettings({ ...localSettings, scheduledStart: value, scheduledStartDate: date })}
                  selectedTimeZone={selectedTimeZone}
                  showToggle={false}
                  indent={false}
                />
              </div>
            </div>
          )}

          <div className="mt-7 flex flex-col gap-2 border-t border-[#333] pt-4 sm:flex-row sm:justify-end sm:gap-3">
            <button
              type="button"
              onClick={onClose}
              className="h-11 flex-1 rounded-md border border-[#444] bg-[#2d2d2d] px-4 py-2 text-[14px] font-bold text-white transition-colors hover:bg-[#383838] sm:flex-none"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                onConfirm?.({
                  ...localSettings,
                  targetDuration: Math.max(0, Number(localSettings.targetDuration) || 0),
                  mode: localSettings.mode || 'countdown',
                });
                onClose();
              }}
              className="h-11 flex-1 rounded-md border border-[#2f9e44] px-4 py-2 text-[14px] font-bold text-[#22c55e] transition-colors hover:bg-[#2f9e44] hover:text-white sm:flex-none"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
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
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onApplyToAll?: (settings: any) => void;
  onSettingsUpdate: () => void;
  isActionsOpen: boolean;
  onActionsToggle: () => void;
  onCloseActions: () => void;
  openPanel: 'settings' | 'quick' | null;
  onPanelOpen: (panel: 'settings' | 'quick', section?: 'start' | 'duration') => void;
  onPanelClose: () => void;
  isSelectMode?: boolean;
  isSelected?: boolean;
  onSelect?: () => void;
}

interface TimerHeader {
  id: string;
  title: string;
  collapsed: boolean;
  timerIds: string[];
}

const TimerHeaderRow = ({ header, onToggle, onRename, onDelete, onAddTimer, isSelectMode, isSelected, onSelect }: { header: TimerHeader; onToggle: () => void; onRename: (title: string) => void; onDelete: () => void; onAddTimer: () => void; isSelectMode?: boolean; isSelected?: boolean; onSelect?: () => void }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: `header:${header.id}` });
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(header.title);
  return (
    <div ref={setNodeRef} {...attributes} {...listeners} onPointerDown={(event) => { const target = event.target as HTMLElement; if (target.closest('button, input, select, textarea')) return; listeners?.onPointerDown?.(event); event.currentTarget.setPointerCapture(event.pointerId); }} style={{ transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 200 : 1, position: 'relative' }} className="stage-grid-host stage-section-host relative touch-none rounded-lg border border-[#3b3b3b] bg-[#202020] px-3 py-2 transition-colors">
      <StructuralDropGrid beforeId={`grid:before:header:${header.id}`} afterId={`grid:after:header:${header.id}`} insideId={`grid:inside:header:${header.id}`} />
      <div className="flex items-center gap-2">
        <button type="button" onClick={onToggle} className="flex h-7 w-7 items-center justify-center rounded text-[#aaa] hover:bg-[#303030]" title={header.collapsed ? 'Expand header' : 'Collapse header'}>{header.collapsed ? '▸' : '▾'}</button>
        {editing ? (
          <input autoFocus value={draft} onChange={(event) => setDraft(event.target.value)} onBlur={() => { onRename(draft.trim() || header.title); setEditing(false); }} onKeyDown={(event) => { if (event.key === 'Enter') { onRename(draft.trim() || header.title); setEditing(false); } if (event.key === 'Escape') setEditing(false); }} className="min-w-0 flex-1 rounded border border-[#555] bg-[#151515] px-2 py-1 text-[13px] font-bold text-white outline-none focus:border-[#4a9eff]" />
        ) : <button type="button" onClick={() => { setDraft(header.title === 'New Section' || header.title === 'Untitled section' ? '' : header.title); setEditing(true); }} className="min-w-0 flex-1 truncate text-left text-[13px] font-bold text-white hover:text-[#9fc7ff] hover:underline hover:decoration-dashed hover:underline-offset-4" title="Edit section header">{header.title}</button>}
        <span className="text-[11px] text-[#888]">{header.timerIds.length}</span>
        <button type="button" onClick={onAddTimer} className="rounded border border-[#444] px-2 py-1 text-[11px] font-bold text-[#b8e6c2] hover:bg-[#263d2b]" title="Add a sub-timer">+ Add Row</button>
        <button type="button" onClick={onDelete} className="rounded px-2 py-1 text-[12px] text-[#999] hover:bg-[#3a2020] hover:text-[#ff8b8b]" title="Delete section">×</button>
      </div>
    </div>
  );
};

const StructuralDropCell = ({ id, position }: { id: string; position: 'before' | 'inside' | 'after' }) => {
  const { setNodeRef, isOver } = useDroppable({ id, data: { position } });
  return <div
    ref={setNodeRef}
    aria-hidden="true"
    className={`stage-grid-cell stage-grid-cell-${position} ${isOver ? 'stage-grid-cell-over' : ''}`}
  />;
};

/**
 * A real DOM grid (not a painted hint) that supplies stable Excel-like cells
 * for every structural row. The host's natural height is the row height, so
 * the grid automatically follows expanded sections, collapsed sections, and
 * timer rows with different responsive sizes.
 */
const StructuralDropGrid = ({ beforeId, afterId, insideId }: { beforeId: string; afterId: string; insideId?: string }) => (
  <div className="stage-drop-grid" role="grid" aria-hidden="true">
    <StructuralDropCell id={beforeId} position="before" />
    {insideId ? <StructuralDropCell id={insideId} position="inside" /> : <div className="stage-grid-cell stage-grid-cell-inside" />}
    <StructuralDropCell id={afterId} position="after" />
  </div>
);

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
  isSelectMode?: boolean;
  isSelected?: boolean;
  onSelect?: () => void;
}

const MessageRow = ({ 
  msg, idx, isShown, messageShownId, onUpdate, onDelete, onUpdateColor, 
  onToggleBold, onToggleUppercase, onUpdateSize, onShow, getMessageSize, isSelectMode, isSelected, onSelect
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
  const [isSizeOpen, setIsSizeOpen] = useState(false);
  const [sizeAnchor, setSizeAnchor] = useState<{ top: number; left: number } | null>(null);

  return (
    <div 
      ref={setNodeRef} 
      style={style} 
      onClick={(event) => {
        if (!isSelectMode || !onSelect) return;
        const target = event.target as HTMLElement;
        if (target.closest('button, textarea, input, select')) return;
        onSelect();
      }}
      className={`group relative w-full rounded-lg px-3 py-3 shadow-md transition-colors ${isSelected ? 'border border-[#22c55e] bg-[#245c3a]' : cardActive ? 'bg-[#b02a2a] border border-[#c43c3c]' : 'border border-[#333] bg-[#2d2d2d]'} ${isSelectMode ? 'cursor-pointer' : ''}`}
    >
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2">
          {isSelectMode ? (
            <button type="button" onClick={(event) => { event.stopPropagation(); onSelect?.(); }} className={`flex h-4 w-4 items-center justify-center rounded border ${isSelected ? 'border-[#22c55e] bg-[#22c55e] text-white' : 'border-[#777] bg-transparent text-transparent hover:border-white'}`} title={isSelected ? 'Selected message' : 'Select message'} aria-pressed={isSelected}><span className="text-[10px] leading-none">✓</span></button>
          ) : <div
            {...attributes}
            {...listeners}
            className="group/index flex w-8 items-center justify-center text-[13px] font-bold text-[#8a8a8a] cursor-grab active:cursor-grabbing"
            title="Drag to reorder"
          >
            <span className="group-hover/index:hidden">{idx + 1}</span>
            <span className="hidden group-hover/index:inline text-[18px] font-light leading-none">=</span>
          </div>}
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
        <div className="ml-10 flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => onUpdateColor(msg.id, '#ffffff')} className={`inline-flex h-6 w-5 items-center justify-center pb-0.5 text-[14px] font-bold transition-all border-b-2 ${msg.color === '#ffffff' ? 'border-[#ffffff]' : 'border-transparent hover:border-[#888]'}`} style={{ color: '#ffffff' }} title="White text"><span aria-hidden="true" className="h-4 w-4 bg-current" style={{ WebkitMaskImage: "url('/colored_text.svg')", maskImage: "url('/colored_text.svg')", WebkitMaskRepeat: 'no-repeat', maskRepeat: 'no-repeat', WebkitMaskPosition: 'center', maskPosition: 'center', WebkitMaskSize: 'contain', maskSize: 'contain' }} /></button>
            <button type="button" onClick={() => onUpdateColor(msg.id, '#22c55e')} className={`inline-flex h-6 w-5 items-center justify-center pb-0.5 text-[14px] font-bold transition-all border-b-2 ${msg.color === '#22c55e' ? 'border-[#22c55e]' : 'border-transparent hover:border-[#888]'}`} style={{ color: '#22c55e' }} title="Green text"><span aria-hidden="true" className="h-4 w-4 bg-current" style={{ WebkitMaskImage: "url('/colored_text.svg')", maskImage: "url('/colored_text.svg')", WebkitMaskRepeat: 'no-repeat', maskRepeat: 'no-repeat', WebkitMaskPosition: 'center', maskPosition: 'center', WebkitMaskSize: 'contain', maskSize: 'contain' }} /></button>
            <button type="button" onClick={() => onUpdateColor(msg.id, '#fa5252')} className={`inline-flex h-6 w-5 items-center justify-center pb-0.5 text-[14px] font-bold transition-all border-b-2 ${msg.color === '#fa5252' ? 'border-[#fa5252]' : 'border-transparent hover:border-[#888]'}`} style={{ color: '#fa5252' }} title="Red text"><span aria-hidden="true" className="h-4 w-4 bg-current" style={{ WebkitMaskImage: "url('/colored_text.svg')", maskImage: "url('/colored_text.svg')", WebkitMaskRepeat: 'no-repeat', maskRepeat: 'no-repeat', WebkitMaskPosition: 'center', maskPosition: 'center', WebkitMaskSize: 'contain', maskSize: 'contain' }} /></button>
            <button type="button" onClick={() => onToggleBold(msg.id)} className={`inline-flex h-6 w-5 items-center justify-center pb-0.5 transition-all border-b-2 ${msg.bold ? 'border-[#ffffff]' : 'border-transparent hover:border-[#888]'}`} title="Bold text" aria-label="Bold text" aria-pressed={msg.bold}>
              <Image src="/bold-letter.svg" alt="" width={16} height={16} className={`h-4 w-4 invert transition-opacity ${msg.bold ? 'opacity-100' : 'opacity-50 hover:opacity-100'}`} />
            </button>
            <button type="button" onClick={() => onToggleUppercase(msg.id)} className={`inline-flex h-6 w-5 items-center justify-center pb-0.5 transition-all border-b-2 ${msg.uppercase ? 'border-[#ffffff]' : 'border-transparent hover:border-[#888]'}`} title="Caps Lock text" aria-label="Caps Lock text" aria-pressed={msg.uppercase}>
              <Image src="/caps-lock.svg" alt="" width={16} height={16} className={`h-4 w-4 invert transition-opacity ${msg.uppercase ? 'opacity-100' : 'opacity-50 hover:opacity-100'}`} />
            </button>
            <button type="button" onClick={(e) => {
              if (isSizeOpen) {
                setIsSizeOpen(false);
                setSizeAnchor(null);
              } else {
                const rect = e.currentTarget.getBoundingClientRect();
                setSizeAnchor({ top: rect.top - 4, left: rect.left });
                setIsSizeOpen(true);
              }
            }} className="transition-opacity" title="Edit message size" aria-label="Edit message size" aria-expanded={isSizeOpen}>
              <Image src="/filter.svg" alt="" width={16} height={16} className="h-4 w-4 invert opacity-70 transition-opacity hover:opacity-100" />
            </button>
            {isSizeOpen && sizeAnchor && typeof document !== 'undefined' && createPortal(
              <div className="fixed z-[1000] flex items-center gap-1 rounded border border-[#444] bg-[#1c1c1c] px-2 py-1 shadow-lg" style={{ top: sizeAnchor.top, left: sizeAnchor.left, transform: 'translateY(-100%)' }}>
                <span className="mr-1 text-[10px] uppercase text-[#666]">Size</span>
                <div className="flex items-center overflow-hidden rounded border border-[#444] bg-[#1c1c1c]">
                  <button type="button" onClick={() => onUpdateSize(msg.id, Math.max(0.1, Math.round((mSize - 0.1) * 10) / 10))} className="flex h-7 w-5 items-center justify-center border-r border-[#444] text-[#8a8a8a] hover:bg-[#252525] hover:text-white">-</button>
                  <input type="number" min="0.1" max="10" step="0.1" value={mSize} onChange={(e) => onUpdateSize(msg.id, parseFloat(e.target.value) || 1.0)} className="h-7 w-7 bg-transparent text-center font-mono text-[11px] text-white outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                  <button type="button" onClick={() => onUpdateSize(msg.id, Math.min(10, Math.round((mSize + 0.1) * 10) / 10))} className="flex h-7 w-5 items-center justify-center border-l border-[#444] text-[#8a8a8a] hover:bg-[#252525] hover:text-white">+</button>
                </div>
              </div>,
              document.body
            )}
          </div>
          <div className="ml-auto flex shrink-0 items-center overflow-hidden rounded-md border border-[#444]">
            <button
              type="button"
              onClick={() => onShow(msg.id)}
              className="flex items-center gap-1.5 bg-[#1c1c1c] px-2 py-1 text-[12px] font-bold text-white transition-colors hover:bg-[#252525]"
              title="Show message on screen (message only, no timer)"
            >
              <span className={`inline-block h-2 w-2 rounded-full ${messageShownId === msg.id ? 'bg-[#fa5252] shadow-[0_0_8px_rgba(250,82,82,0.8)]' : 'bg-[#555]'}`} />
              Show
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const TimerRow = ({ id, index, isActive, scheduledStart, formatTime, selectedTimeZone, onActivate, onSync, onAddAbove, onAddBelow, onMoveUp, onMoveDown, onDuplicate, onDelete, onApplyToAll, onSettingsUpdate, isActionsOpen, onActionsToggle, onCloseActions, openPanel, onPanelOpen, onPanelClose, isSelectMode, isSelected, onSelect }: TimerRowProps) => {
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

  const isSettingsOpen = openPanel === 'settings';
  const isQuickSettingsOpen = openPanel === 'quick';
  const [isAdjustMenuOpen, setIsAdjustMenuOpen] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [isTitleEditOpen, setIsTitleEditOpen] = useState(false);
  const [quickSection, setQuickSection] = useState<'start' | 'duration'>('start');

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });

  const style = { transform: CSS.Transform.toString(transform), transition, zIndex: isDragging || isActionsOpen || isSettingsOpen || isQuickSettingsOpen ? 200 : 1, position: 'relative' as const };

  useEffect(() => {
    const handleGlobalClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('.timer-row-more')) return;
      onCloseActions();
      setIsAdjustMenuOpen(false);
    };
    window.addEventListener('click', handleGlobalClick);
    return () => {
      window.removeEventListener('click', handleGlobalClick);
    };
  }, [onCloseActions]);

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
            setTime(settings.mode === 'countup'
              ? Math.max(0, secondsRef.current + adjustment)
              : secondsRef.current + adjustment);
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
            setTime(settings.mode === 'countup'
              ? Math.max(0, secondsRef.current + adjustment)
              : secondsRef.current + adjustment);
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

  const rowTotalDuration = Math.max(0, Number(settings.targetDuration) || 0);
  const rowCurrentSeconds = Number.isFinite(seconds) ? seconds : 0;
  const rowProgressPercent = rowTotalDuration > 0
    ? settings.mode === 'countup'
      ? Math.max(0, Math.min(100, (rowCurrentSeconds / rowTotalDuration) * 100))
      : Math.max(0, Math.min(100, ((rowTotalDuration - rowCurrentSeconds) / rowTotalDuration) * 100))
    : 0;

  return (
    <div 
      ref={setNodeRef} 
      style={style} 
      onClick={(event) => {
        if (isSelectMode && onSelect) {
          const target = event.target as HTMLElement;
          if (!target.closest('button, input, select, textarea')) onSelect();
          return;
        }
        if (isActive) onActivate(false);
      }}
      className={`stage-grid-host timer-row group relative isolate flex min-w-0 overflow-visible items-center gap-4 rounded-lg px-6 py-4 text-white shadow-lg transition-all min-h-28 max-[639px]:min-h-0 max-[639px]:gap-2 max-[639px]:px-2 ${isSelected ? 'bg-[#245c3a] ring-1 ring-[#22c55e]' : isRunning ? 'bg-[#b91c1c]' : isActive ? 'bg-[#2546c9] cursor-pointer' : 'bg-[#262626]'} ${isDragging ? 'opacity-50' : ''} ${isSelectMode ? 'cursor-pointer' : ''}`}
    >
      <StructuralDropGrid beforeId={`grid:before:${id}`} afterId={`grid:after:${id}`} />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 left-0 z-0 rounded-l-lg bg-[#111827]/25 transition-[width] duration-100 ease-linear"
        style={{ width: `${rowProgressPercent}%` }}
      />
      {/* Index / Handle - Only shows '=' when hovering the index area specifically */}
      {isSelectMode ? (
        <button type="button" onClick={(event) => { event.stopPropagation(); onSelect?.(); }} className={`relative z-10 flex h-4 w-4 shrink-0 items-center justify-center rounded border ${isSelected ? 'border-[#22c55e] bg-[#22c55e] text-white' : 'border-[#777] bg-transparent text-transparent hover:border-white'}`} title={isSelected ? 'Selected timer' : 'Select timer'} aria-pressed={isSelected}><span className="text-[10px] leading-none">✓</span></button>
      ) : <div 
        {...attributes} 
        {...listeners} 
        onPointerDown={(event) => {
          listeners?.onPointerDown?.(event);
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        className="group/index relative z-10 flex w-8 shrink-0 touch-none items-center justify-center text-[16px] font-bold opacity-60 cursor-grab active:cursor-grabbing max-[639px]:w-6"
        onClick={(e) => e.stopPropagation()}
      >
        {isDragging ? <span className="text-[24px] font-light leading-none">=</span> : <><span className="group-hover/index:hidden">{index + 1}</span><span className="hidden group-hover/index:inline text-[24px] font-light leading-none">=</span></>}
      </div>}

      {/* Scheduled Time Display */}
      <div className="timer-row-scheduled relative z-10 hidden sm:flex shrink-0 flex-col items-center justify-center gap-1 w-auto text-center">
        <span className="pointer-events-none absolute left-1/2 -top-4 -translate-x-1/2 whitespace-nowrap text-[11px] font-medium leading-none text-white/55 opacity-0 transition-opacity group-hover:opacity-100">Start</span>
        <div 
          onClick={(e) => { 
            e.stopPropagation();
            setQuickSection('start');
            onPanelOpen('quick', 'start');
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
      <div className="relative z-10 hidden sm:flex shrink-0 flex-col items-center justify-center gap-1 text-center">
        <span className="pointer-events-none absolute left-1/2 -top-4 -translate-x-1/2 whitespace-nowrap text-[11px] font-medium leading-none text-white/55 opacity-0 transition-opacity group-hover:opacity-100">Duration</span>
        <div
          onClick={(e) => {
            e.stopPropagation();
            setQuickSection('duration');
            onPanelOpen('quick', 'duration');
          }}
          className="w-auto shrink-0 text-center text-[14px] font-bold tracking-tight tabular-nums transition-colors cursor-pointer text-white hover:text-[#4a9eff]"
          onMouseEnter={(e) => e.stopPropagation()}
          onMouseLeave={(e) => e.stopPropagation()}
        >
          {formatClock(settings.targetDuration)}
        </div>
        <div className="absolute left-1/2 top-full flex h-4 min-w-[92px] -translate-x-1/2 items-center justify-center pointer-events-none opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100">
          <select
            value={settings.mode || 'countdown'}
            onChange={(e) => {
              e.stopPropagation();
              updateSettings({ mode: e.target.value as 'countdown' | 'countup' });
              onSettingsUpdate();
            }}
            onClick={(e) => e.stopPropagation()}
            className="h-4 w-full appearance-none border-0 bg-transparent p-0 pr-4 text-center text-[12px] leading-none text-white/55 outline-none"
            aria-label="Timer mode"
          >
            <option value="countdown" className="bg-[#1a1a1a] text-white">Countdown</option>
            <option value="countup" className="bg-[#1a1a1a] text-white">Countup</option>
          </select>
          <Image src="/caret_down.svg" alt="" aria-hidden="true" width={12} height={12} className="pointer-events-none absolute right-0 h-3 w-3 brightness-0 invert opacity-50" />
        </div>
      </div>

      {/* Title */}
      <div className="timer-row-title relative z-10 ml-0 min-w-0 flex-1 flex items-center justify-center gap-2 overflow-hidden text-center text-[14px] font-bold opacity-90 pr-2 max-[639px]:ml-0 max-[639px]:text-[13px]" onMouseEnter={(e) => e.stopPropagation()} onMouseLeave={(e) => e.stopPropagation()}>
        <span className="block min-w-0 max-w-full truncate">{settings.title}</span>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setIsTitleEditOpen(true);
          }}
          className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
          title="Edit timer title"
          aria-label="Edit timer title"
        >
          <Image src="/edit.svg" alt="" aria-hidden="true" width={16} height={16} className="h-4 w-4 invert opacity-70 transition-opacity hover:opacity-100" />
        </button>
      </div>

      {/* Controls */}
      <div className="timer-row-controls relative z-10 flex shrink-0 items-center gap-2 whitespace-nowrap max-[639px]:gap-1" onClick={(e) => e.stopPropagation()} onMouseEnter={(e) => e.stopPropagation()} onMouseLeave={(e) => e.stopPropagation()}>
        {isActive ? (
          <button 
            type="button" 
            onClick={resetTimer} 
            className={`flex h-9 w-10 max-[639px]:h-8 max-[639px]:w-8 items-center justify-center rounded border border-white/10 bg-[#2d2d2d] transition-colors hover:bg-[#383838]`}
            title="Reset to assigned time"
          >
            <IconSkipBack size={16} />
          </button>
        ) : (
          <button 
            type="button" 
            onClick={() => onActivate(false)}
            className="flex h-9 w-10 max-[639px]:h-8 max-[639px]:w-8 items-center justify-center rounded border border-white/10 bg-[#2d2d2d] text-white hover:bg-[#383838] hover:text-white transition-colors"
            title="Select this timer"
          >
            <IconSelect size={16} />
          </button>
        )}
        <button 
          type="button" 
          onClick={() => {
            onPanelOpen('settings');
          }}
          title="Timer settings"
          className={`flex h-9 w-10 max-[639px]:h-8 max-[639px]:w-8 items-center justify-center rounded border border-white/10 bg-[#2d2d2d] transition-colors hover:bg-[#383838]`}
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
          title={isRunning ? 'Pause timer' : 'Start timer'}
          className={`group flex h-9 w-12 max-[639px]:h-8 max-[639px]:w-10 items-center justify-center rounded border border-[#333] bg-[#2d2d2d] shadow-md transition-colors ${isRunning ? 'text-[#ef4444] hover:border-[#dc2626] hover:bg-[#dc2626] hover:text-white' : 'text-[#22c55e] hover:border-[#16a34a] hover:bg-[#16a34a] hover:text-white'}`}
        >
          {isRunning ? <IconPause size={18} /> : <IconPlay size={18} />}
        </button>
        <div className="timer-row-more relative ml-1 max-[639px]:ml-0">
          <button 
            type="button" 
            onClick={(e) => {
              e.stopPropagation();
              onActionsToggle();
            }}
            className="flex h-9 w-8 max-[639px]:h-8 max-[639px]:w-6 items-center justify-center text-white/40 hover:text-white transition-colors"
            title="Timer actions"
          >
            <IconMore size={18} />
          </button>
          {isActionsOpen && (
            <div onClick={(e) => e.stopPropagation()} className={`absolute right-0 z-[250] w-56 rounded-lg border border-[#444] bg-[#242424] p-1 shadow-2xl ${index < 4 ? 'top-full mt-2' : 'bottom-full mb-2'}`}>
              <span aria-hidden="true" className={`pointer-events-none absolute right-3 z-[-1] h-4 w-4 rotate-45 bg-[#242424] ${index < 4 ? '-top-2 border-l border-t border-[#444]' : '-bottom-2 border-r border-b border-[#444]'}`} />
              <button type="button" onClick={() => { onAddAbove(); onCloseActions(); }} title="Add timer above" className="flex w-full items-center gap-3 rounded-md px-4 py-2.5 text-left text-[14px] text-white hover:bg-[#383838]">
                <Image src="/caret_down.svg" alt="" aria-hidden="true" width={16} height={16} className="h-4 w-4 brightness-0 invert rotate-180" />
                <span>Add timer above</span>
              </button>
              <button type="button" onClick={() => { onAddBelow(); onCloseActions(); }} title="Add timer below" className="flex w-full items-center gap-3 rounded-md px-4 py-2.5 text-left text-[14px] text-white hover:bg-[#383838]">
                <Image src="/caret_down.svg" alt="" aria-hidden="true" width={16} height={16} className="h-4 w-4 brightness-0 invert" />
                <span>Add timer below</span>
              </button>
              <button type="button" onClick={() => { onMoveUp(); onCloseActions(); }} title="Move timer up" className="flex w-full items-center gap-3 rounded-md px-4 py-2.5 text-left text-[14px] text-white hover:bg-[#383838]">
                <span aria-hidden="true" className="w-4 text-center text-[18px] leading-none">↑</span>
                <span>Move up</span>
              </button>
              <button type="button" onClick={() => { onMoveDown(); onCloseActions(); }} title="Move timer down" className="flex w-full items-center gap-3 rounded-md px-4 py-2.5 text-left text-[14px] text-white hover:bg-[#383838]">
                <span aria-hidden="true" className="w-4 text-center text-[18px] leading-none">↓</span>
                <span>Move down</span>
              </button>
              <button type="button" onClick={() => { onDuplicate(); onCloseActions(); }} title="Clone timer" className="flex w-full items-center gap-3 rounded-md px-4 py-2.5 text-left text-[14px] text-white hover:bg-[#383838]">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                <span>Clone timer</span>
              </button>
              <div className="my-1 border-t border-[#333]" />
              <button type="button" onClick={() => { onDelete(); onCloseActions(); }} title="Delete timer" className="flex w-full items-center gap-3 rounded-md px-4 py-2.5 text-left text-[14px] text-[#fa5252] hover:bg-red-500/10">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6v14H5V6"/><path d="M10 11v5"/><path d="M14 11v5"/></svg>
                <span>Delete timer</span>
              </button>
            </div>
          )}
        </div>
      </div>
      <TimerTitleEditModal
        isOpen={isTitleEditOpen}
        title={settings.title || ''}
        onClose={() => setIsTitleEditOpen(false)}
        onSave={(title) => {
          if (title !== (settings.title || '')) {
            updateSettings({ title });
            onSettingsUpdate();
          }
          setIsTitleEditOpen(false);
        }}
      />
      <TimerSettingsModal 
        isOpen={isSettingsOpen} 
        onClose={onPanelClose}
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
        onClose={onPanelClose}
        settings={settings} 
        updateSettings={updateSettings} 
        onApplyToAll={onApplyToAll}
        onSettingsUpdate={onSettingsUpdate}
        selectedTimeZone={selectedTimeZone}
        section={quickSection}
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
  timerHeaders?: TimerHeader[];
  timerTopLevelItems?: string[];
}

function App() {
  const [rooms, setRooms] = useLocalStorage<Room[]>('stage-timer-rooms', []);
  const [currentRoomId, setCurrentRoomId] = useLocalStorage<string | null>('stage-timer-current-id', null);
  const [currentRoomName, setCurrentRoomName] = useLocalStorage<string>('stage-timer-current-name', 'Unnamed');
  const [timerIds, setTimerIds] = useLocalStorage<string[]>('stage-timer-timer-ids', []);
  const [timerHeaders, setTimerHeaders] = useLocalStorage<TimerHeader[]>('stage-timer-timer-headers', []);
  const [timerTopLevelItems, setTimerTopLevelItems] = useLocalStorage<string[]>('stage-timer-timer-top-level-items', []);
  const [activeTimerId, setActiveTimerId] = useLocalStorage<string>('stage-timer-active-id', '');
  const [messages, setMessages] = useLocalStorage<any[]>('stage-timer-messages', [{ id: '1', text: '', color: '#ffffff' }]);
  const [messageShownId, setMessageShownId] = useLocalStorage<string | null>('stage-timer-message-shown-id', null);
  const topLevelItems = useMemo(() => [
    ...timerTopLevelItems.filter((item, index, items) => {
      if (items.indexOf(item) !== index) return false;
      if (item.startsWith('header:')) return timerHeaders.some(header => `header:${header.id}` === item);
      return timerIds.includes(item) && !timerHeaders.some(header => header.timerIds.includes(item));
    }),
    ...timerHeaders.map(header => `header:${header.id}`).filter(item => !timerTopLevelItems.includes(item)),
    ...timerIds.filter(id => !timerHeaders.some(header => header.timerIds.includes(id)) && !timerTopLevelItems.includes(id)),
  ], [timerTopLevelItems, timerHeaders, timerIds]);
  const [isNewRoomDraft, setIsNewRoomDraft] = useState(false);
  const roomNameInputRef = useRef<HTMLInputElement>(null);
  const roomNamePlaceholderRef = useRef<string | null>(null);
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
      const changed = ['stage-timer-rooms', 'stage-timer-current-id', 'stage-timer-current-name', 'stage-timer-timer-ids', 'stage-timer-timer-headers', 'stage-timer-timer-top-level-items', 'stage-timer-active-id', 'stage-timer-messages', 'stage-timer-message-shown-id'].includes(e.key);
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
          setTimerHeaders(readJsonStorage<TimerHeader[]>('stage-timer-timer-headers', []));
          setTimerTopLevelItems(readJsonStorage<string[]>('stage-timer-timer-top-level-items', []));
          setActiveTimerId(readJsonStorage<string>('stage-timer-active-id', ''));
          setMessages(readJsonStorage<any[]>('stage-timer-messages', [{ id: '1', text: '', color: '#ffffff' }]));
          setMessageShownId(readJsonStorage<string | null>('stage-timer-message-shown-id', null));
          setMessageFlashId(null);
        }
      });
      return unsubscribe;
    } catch { /* ignore */ }
    return undefined;
  }, [setCurrentRoomId, setCurrentRoomName, setRooms, setTimerIds, setTimerHeaders, setTimerTopLevelItems, setActiveTimerId, setMessages, setMessageShownId]);
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
  const [openActionsTimerId, setOpenActionsTimerId] = useState<string | null>(null);
  const [openTimerPanel, setOpenTimerPanel] = useState<{ timerId: string; panel: 'settings' | 'quick' } | null>(null);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const [isTimeZoneMenuOpen, setIsTimeZoneMenuOpen] = useState(false);
  const [timeZoneSearch, setTimeZoneSearch] = useState('');
  const [openAdjustMenu, setOpenAdjustMenu] = useState<'decrease' | 'increase' | null>(null);
  const [settingsVersion, setSettingsVersion] = useState(0);
  const [mobileSection, setMobileSection] = useState<'timers' | 'messages'>('timers');
  const [isTimerSelectMode, setIsTimerSelectMode] = useState(false);
  const [selectedTimerIds, setSelectedTimerIds] = useState<string[]>([]);
  const [isMessageSelectMode, setIsMessageSelectMode] = useState(false);
  const [selectedMessageIds, setSelectedMessageIds] = useState<string[]>([]);
  const [sectionDeleteTarget, setSectionDeleteTarget] = useState<TimerHeader | null>(null);
  const allTimersSelected = timerIds.length > 0 && selectedTimerIds.length === timerIds.length;
  const allMessagesSelected = messages.length > 0 && selectedMessageIds.length === messages.length;
  const toggleAllTimers = () => setSelectedTimerIds(allTimersSelected ? [] : timerIds);
  const toggleAllMessages = () => setSelectedMessageIds(allMessagesSelected ? [] : messages.map(message => message.id));
  const [timerChangesNeedSave, setTimerChangesNeedSave] = useState(false);
  const markTimerChanged = useCallback(() => {
    writeStorageItem('stage-timer-unsaved-draft', '1');
    setTimerChangesNeedSave(true);
  }, []);
  const draftBaselineSignatureRef = useRef<string | null>(null);
  const initialRoomRestoredRef = useRef(false);

  const currentRoomSignature = useMemo(() => {
    void settingsVersion;
    const timerSettings = Object.fromEntries(timerIds.map(id => [
      id,
      readJsonStorage<Record<string, any> | null>(`timerSettings_${id}`, null),
    ]));
    const normalizedMessages = messages.map(message => ({
      id: message.id,
      text: message.text || '',
      color: message.color || '#ffffff',
      bold: !!message.bold,
      uppercase: !!message.uppercase,
      messageSize: getStoredMessageSize(message),
    }));
    return JSON.stringify({
      name: currentRoomName.trim(),
      timerIds,
      activeTimerId,
      messages: normalizedMessages,
      timerSettings,
    });
  }, [currentRoomName, timerIds, activeTimerId, messages, settingsVersion]);

  const savedRoom = currentRoomId ? rooms.find(room => room.id === currentRoomId) : undefined;
  const savedRoomSignature = useMemo(() => {
    if (!savedRoom) return null;
    const normalizedMessages = (savedRoom.messages || []).map(message => ({
      id: message.id,
      text: message.text || '',
      color: message.color || '#ffffff',
      bold: !!message.bold,
      uppercase: !!message.uppercase,
      messageSize: getStoredMessageSize(message),
    }));
    return JSON.stringify({
      name: savedRoom.name.trim(),
      timerIds: savedRoom.timerIds || [],
      activeTimerId: savedRoom.activeTimerId || '',
      messages: normalizedMessages,
      timerSettings: savedRoom.timerSettings || {},
    });
  }, [savedRoom]);

  useEffect(() => {
    if (isNewRoomDraft) {
      if (draftBaselineSignatureRef.current === null) draftBaselineSignatureRef.current = currentRoomSignature;
    } else {
      draftBaselineSignatureRef.current = null;
    }
  }, [isNewRoomDraft, currentRoomSignature]);

  const hasUnsavedChanges = timerChangesNeedSave;

  const restoreUnsavedDraft = useCallback(() => {
    const savedTimerIds = savedRoom?.timerIds || [];
    const savedHeaders = (savedRoom?.timerHeaders || []).map(header => ({
      ...header,
      timerIds: (header.timerIds || []).filter(id => savedTimerIds.includes(id)),
    }));
    const savedTopLevelItems = savedRoom?.timerTopLevelItems || [
      ...savedTimerIds.filter(id => !savedHeaders.some(header => header.timerIds.includes(id))),
      ...savedHeaders.map(header => `header:${header.id}`),
    ];
    const knownTimerIds = new Set(rooms.flatMap(room => room.timerIds || []));
    savedTimerIds.forEach(id => knownTimerIds.add(id));

    // Remove timer state created by an unsaved add/duplicate. Never remove a
    // timer that belongs to another saved room because IDs may be shared.
    getStorageKeys().forEach(key => {
      if (key.startsWith('timerSettings_') || key.startsWith('timerSync_') || key.startsWith('timerSeconds_') || key.startsWith('timerLog_')) {
        const timerId = key.substring(key.indexOf('_') + 1);
        if (!knownTimerIds.has(timerId)) removeStorageItem(key);
      }
    });

    if (savedRoom) {
      Object.entries(savedRoom.timerSettings || {}).forEach(([id, settings]) => {
        writeStorageItem(`timerSettings_${id}`, JSON.stringify(settings));
      });
      writeStorageItem('stage-timer-current-id', JSON.stringify(savedRoom.id));
      writeStorageItem('stage-timer-current-name', JSON.stringify(savedRoom.name));
      writeStorageItem('stage-timer-timer-ids', JSON.stringify(savedTimerIds));
      writeStorageItem('stage-timer-timer-headers', JSON.stringify(savedHeaders));
      writeStorageItem('stage-timer-timer-top-level-items', JSON.stringify(savedTopLevelItems));
      writeStorageItem('stage-timer-active-id', JSON.stringify(savedRoom.activeTimerId || savedTimerIds[0] || ''));
      writeStorageItem('stage-timer-messages', JSON.stringify(savedRoom.messages || [{ id: '1', text: '', color: '#ffffff' }]));
      removeStorageItem('stage-timer-unsaved-draft');
      return;
    }

    // A new room has no saved snapshot, so discard its draft completely.
    writeStorageItem('stage-timer-current-id', JSON.stringify(null));
    writeStorageItem('stage-timer-current-name', JSON.stringify('Unnamed'));
    writeStorageItem('stage-timer-timer-ids', JSON.stringify([]));
    writeStorageItem('stage-timer-timer-headers', JSON.stringify([]));
    writeStorageItem('stage-timer-timer-top-level-items', JSON.stringify([]));
    writeStorageItem('stage-timer-active-id', JSON.stringify(''));
    writeStorageItem('stage-timer-messages', JSON.stringify([{ id: '1', text: '', color: '#ffffff' }]));
    removeStorageItem('stage-timer-unsaved-draft');
  }, [rooms, savedRoom]);

  useEffect(() => {
    if (!hasUnsavedChanges) return undefined;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      restoreUnsavedDraft();
      event.preventDefault();
      event.returnValue = '';
    };
    const handlePageHide = () => restoreUnsavedDraft();
    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('pagehide', handlePageHide);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('pagehide', handlePageHide);
    };
  }, [hasUnsavedChanges, restoreUnsavedDraft]);

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
  const [isListDragging, setIsListDragging] = useState(false);
  const gridTrackRef = useRef<HTMLDivElement>(null);
  const timerListRef = useRef<HTMLDivElement>(null);
  const [dragPreview, setDragPreview] = useState<{ top: number; left: number; width: number; height: number; placement: 'before' | 'inside' | 'after' } | null>(null);



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

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    const list = timerListRef.current;
    if (!list || !over || String(active.id) === String(over.id)) {
      setDragPreview(null);
      return;
    }
    const activeRect = active.rect.current.initial || active.rect.current.translated;
    if (!activeRect) {
      setDragPreview(null);
      return;
    }
    const listRect = list.getBoundingClientRect();
    const dropZone = String(over.id).match(/^(?:drop|grid):(before|after):(.+)$/);
    if (dropZone) {
      const position = dropZone[1];
      const targetLine = position === 'before' ? over.rect.bottom : over.rect.top;
      setDragPreview({
        top: position === 'before'
          ? targetLine - listRect.top - activeRect.height
          : targetLine - listRect.top,
        left: 0,
        width: activeRect.width,
        height: activeRect.height,
        placement: position as 'before' | 'after',
      });
      return;
    }
    const insideZone = String(over.id).match(/^grid:inside:header:(.+)$/);
    if (insideZone) {
      setDragPreview({
        top: over.rect.top - listRect.top,
        left: 0,
        width: Math.max(activeRect.width, listRect.width),
        height: over.rect.height,
        placement: 'inside',
      });
      return;
    }
    const movingDown = Boolean(active.rect.current.translated && active.rect.current.translated.top > over.rect.top + over.rect.height / 2);
    setDragPreview({
      top: (movingDown ? over.rect.bottom : over.rect.top) - listRect.top,
      left: over.rect.left - listRect.left,
      width: activeRect.width,
      height: activeRect.height,
      placement: movingDown ? 'after' : 'before',
    });
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setDragPreview(null);
    const { active, over } = event;
    const activeId = active.id as string;
    const activeIsHeader = activeId.startsWith('header:');
    const overId = over ? String(over.id) : null;
    const dropZone = overId ? overId.match(/^(?:drop|grid):(before|after):(.+)$/) : null;
    if (dropZone) {
      const insertAfter = dropZone[1] === 'after';
      const targetId = dropZone[2];
      const targetHeader = targetId.startsWith('header:')
        ? undefined
        : timerHeaders.find(header => header.timerIds.includes(targetId));
      const targetTopLevelId = targetId.startsWith('header:') || !targetHeader ? targetId : `header:${targetHeader.id}`;

      if (activeIsHeader) {
        if (activeId !== targetTopLevelId && topLevelItems.includes(targetTopLevelId)) {
          setTimerTopLevelItems(items => {
            const next = items.filter(item => item !== activeId);
            const targetIndex = next.indexOf(targetTopLevelId);
            next.splice(targetIndex + (insertAfter ? 1 : 0), 0, activeId);
            return next;
          });
          markTimerChanged();
        }
        return;
      }

      if (targetHeader) {
        setTimerHeaders(headers => headers.map(header => {
          const withoutActive = header.timerIds.filter(id => id !== activeId);
          if (header.id !== targetHeader.id) return { ...header, timerIds: withoutActive };
          const targetIndex = withoutActive.indexOf(targetId);
          withoutActive.splice(targetIndex + (insertAfter ? 1 : 0), 0, activeId);
          return { ...header, timerIds: withoutActive };
        }));
        setTimerTopLevelItems(items => items.filter(item => item !== activeId));
        markTimerChanged();
        return;
      }

      if (topLevelItems.includes(targetTopLevelId) && activeId !== targetTopLevelId) {
        setTimerHeaders(headers => headers.map(header => ({ ...header, timerIds: header.timerIds.filter(id => id !== activeId) })));
        setTimerTopLevelItems(items => {
          const next = items.filter(item => item !== activeId);
          const targetIndex = next.indexOf(targetTopLevelId);
          next.splice(targetIndex + (insertAfter ? 1 : 0), 0, activeId);
          return next;
        });
        if (!targetId.startsWith('header:')) {
          setTimerIds(items => {
            const next = items.filter(id => id !== activeId);
            const targetIndex = next.indexOf(targetTopLevelId);
            next.splice(targetIndex + (insertAfter ? 1 : 0), 0, activeId);
            return next;
          });
        }
        markTimerChanged();
      }
      return;
    }
    const insideZone = overId?.match(/^grid:inside:header:(.+)$/);
    if (insideZone && !activeIsHeader) {
      const headerId = insideZone[1];
      setTimerHeaders((headers) => headers.map(header => ({
        ...header,
        timerIds: header.id === headerId
          ? [...new Set([...header.timerIds.filter(id => id !== activeId), activeId])]
          : header.timerIds.filter(id => id !== activeId),
      })));
      setTimerTopLevelItems((items) => items.filter(item => item !== activeId));
      markTimerChanged();
      return;
    }
    if (activeIsHeader) {
      let targetItem: string | null = null;
      if (overId?.startsWith('header:')) {
        targetItem = overId;
      } else if (overId) {
        const targetHeader = timerHeaders.find(header => header.timerIds.includes(overId));
        targetItem = targetHeader ? `header:${targetHeader.id}` : overId;
      }

      if (targetItem && targetItem !== activeId && topLevelItems.includes(targetItem)) {
        setTimerTopLevelItems((items) => {
          const next = items.filter(item => item !== activeId);
          const targetIndex = next.indexOf(targetItem as string);
          const insertIndex = targetIndex === -1 ? next.length : targetIndex;
          next.splice(insertIndex, 0, activeId);
          return next;
        });
        markTimerChanged();
      }
      return;
    }
    if (over && String(over.id).startsWith('header:')) {
      const headerId = String(over.id).slice('header:'.length);
      setTimerHeaders((headers) => headers.map(header => ({ ...header, timerIds: header.id === headerId ? [...new Set([...header.timerIds, activeId])] : header.timerIds.filter(id => id !== activeId) })));
      markTimerChanged();
      return;
    }
    const targetHeader = over ? timerHeaders.find(header => header.timerIds.includes(String(over.id))) : undefined;
    if (over && targetHeader && active.id !== over.id) {
      const targetId = String(over.id);
      setTimerHeaders((headers) => headers.map(header => {
        const withoutActive = header.timerIds.filter(id => id !== activeId);
        if (header.id !== targetHeader.id) return { ...header, timerIds: withoutActive };
        const targetIndex = withoutActive.indexOf(targetId);
        const activeRect = active.rect.current.translated;
        const overRect = over.rect;
        const movingDown = !!activeRect && activeRect.top > overRect.top + overRect.height / 2;
        const insertIndex = targetIndex === -1 ? withoutActive.length : targetIndex + (movingDown ? 1 : 0);
        withoutActive.splice(insertIndex, 0, activeId);
        return { ...header, timerIds: withoutActive };
      }));
      setTimerTopLevelItems((items) => items.filter(item => item !== activeId));
      markTimerChanged();
      return;
    }
    const targetIsTopLevel = over
      && timerTopLevelItems.includes(String(over.id))
      && !timerHeaders.some(header => header.timerIds.includes(String(over.id)));
    if (over && active.id !== over.id && targetIsTopLevel) {
      markTimerChanged();
      setTimerHeaders((headers) => headers.map(header => ({ ...header, timerIds: header.timerIds.filter(id => id !== activeId) })));
      setTimerIds((items) => {
        const oldIndex = items.indexOf(active.id as string);
        const newIndex = items.indexOf(over.id as string);
        const next = arrayMove(items, oldIndex, newIndex);
        setTimerTopLevelItems((topItems) => {
          const topWithoutActive = topItems.filter(item => item !== activeId);
          const targetIndex = topWithoutActive.indexOf(over.id as string);
          if (targetIndex === -1) return [...topWithoutActive, activeId];
          topWithoutActive.splice(targetIndex, 0, activeId);
          return topWithoutActive;
        });
        return next;
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
      markTimerChanged();
    }
  };

  const addTimerHeader = () => {
    const nextSectionNumber = timerHeaders.reduce((highest, header) => {
      const match = header.title.match(/^Section\s+(\d+)$/i);
      return match ? Math.max(highest, Number(match[1])) : highest;
    }, 0) + 1;
    const header: TimerHeader = { id: createId('header'), title: `Section ${nextSectionNumber}`, collapsed: false, timerIds: [] };
    setTimerHeaders((headers) => [...headers, header]);
    setTimerTopLevelItems((items) => [...items, `header:${header.id}`]);
    markTimerChanged();
  };

  const updateTimerHeader = (id: string, updates: Partial<TimerHeader>) => {
    const currentHeader = timerHeaders.find(header => header.id === id);
    const hasActualChange = currentHeader && Object.entries(updates).some(([key, value]) => currentHeader[key as keyof TimerHeader] !== value);
    setTimerHeaders((headers) => headers.map(header => header.id === id ? { ...header, ...updates } : header));
    if (hasActualChange) markTimerChanged();
  };

  const deleteTimerHeader = (id: string, deleteTimers = false) => {
    const header = timerHeaders.find(item => item.id === id);
    if (!header) return;
    const childIds = header.timerIds.filter(timerId => timerIds.includes(timerId));
    if (deleteTimers) {
      childIds.forEach(timerId => {
        removeStorageItem(`timerSettings_${timerId}`);
        removeStorageItem(`timerSeconds_${timerId}`);
        removeStorageItem(`timerSync_${timerId}`);
        removeStorageItem(`timerLog_${timerId}`);
        try { postSharedMessage(CONTROL_CHANNEL, { targetId: timerId, command: 'DESTROY' }); } catch { /* ignore */ }
      });
      setTimerIds(ids => ids.filter(timerId => !childIds.includes(timerId)));
      setSelectedTimerIds(ids => ids.filter(timerId => !childIds.includes(timerId)));
      if (childIds.includes(activeTimerId)) {
        setActiveTimerId('');
        setActiveTimerState(null);
      }
    } else {
      setTimerTopLevelItems(items => {
        const next = items.filter(item => item !== `header:${id}`);
        const headerIndex = items.indexOf(`header:${id}`);
        next.splice(Math.max(0, Math.min(headerIndex, next.length)), 0, ...childIds);
        return next;
      });
    }
    setTimerHeaders(headers => headers.filter(item => item.id !== id));
    markTimerChanged();
    setSectionDeleteTarget(null);
  };

  const addTimer = (atIndex?: number) => {
    const newId = createId('timer');
    const nextTimerNumber = timerIds.reduce((highest, timerId) => {
      const settings = readJsonStorage<Record<string, any> | null>(`timerSettings_${timerId}`, null);
      const match = typeof settings?.title === 'string' ? settings.title.match(/^Timer\s+(\d+)$/i) : null;
      return match ? Math.max(highest, Number(match[1])) : highest;
    }, 0) + 1;
    // New timers inherit Apply All's visual defaults only within the current room.
    // A new or unsaved room always starts from the built-in defaults.
    try {
      const shared = currentRoomId
        ? readJsonStorage<Record<string, any>>(`timerSharedDefaults_${currentRoomId}`, {})
        : {};
      const defaults = {
        title: `Timer ${nextTimerNumber}`,
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
      writeStorageItem(`timerSettings_${newId}`, JSON.stringify(merged));
      writeStorageItem(`timerSeconds_${newId}`, JSON.stringify(0));
      writeStorageItem(`timerSync_${newId}`, JSON.stringify({
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
    setTimerTopLevelItems((items) => items.includes(newId) ? items : [...items, newId]);
    // Keep the currently selected/playing timer active — adding a timer
    // must never steal the selection. If nothing is selected yet and there
    // are no timers at all, pick the newly added one as the first active.
    if (!activeTimerId && timerIds.length === 0) {
      setActiveTimerId(newId);
    }
    markTimerChanged();
    return newId;
  };

  const deleteTimer = (id: string) => {
    // Remove the timer's own stored state so it leaves no residue,
    // but never touch any other timer's state — playback of other
    // timers (including the active one) keeps running.
    try { removeStorageItem(`timerSettings_${id}`); } catch { /* ignore */ }
    try { removeStorageItem(`timerSeconds_${id}`); } catch { /* ignore */ }
    try { removeStorageItem(`timerSync_${id}`); } catch { /* ignore */ }
    try { removeStorageItem(`timerLog_${id}`); } catch { /* ignore */ }
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
    markTimerChanged();
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
      writeStorageItem(
        `timerSharedDefaults_${currentRoomId}`,
        JSON.stringify({ mode: mode || 'countdown', fontHeight: fontHeight ?? 1.6, fontWidth: fontWidth ?? 1.0 })
      );
    }
    timerIds.forEach(id => {
      const settings = readJsonStorage(`timerSettings_${id}`, {
        title: 'Timer 1',
        targetDuration: 0,
        mode: 'countdown',
        segments: [
          { threshold: 60, color: '#f08c00' },
          { threshold: 10, color: '#fa5252' }
        ]
      });
      writeStorageItem(`timerSettings_${id}`, JSON.stringify({ ...settings, ...visualOnly }));
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
    markTimerChanged();
    setSettingsVersion(v => v + 1);
  };

  const deleteAllTimers = () => {
    try {
      timerIds.forEach(id => {
        removeStorageItem(`timerSettings_${id}`);
        removeStorageItem(`timerSeconds_${id}`);
        removeStorageItem(`timerSync_${id}`);
        removeStorageItem(`timerLog_${id}`);
      });
      timerIds.forEach(id => postSharedMessage(CONTROL_CHANNEL, { targetId: id, command: 'DESTROY' }));
    } catch { /* ignore */ }
    setTimerIds([]);
    setTimerHeaders([]);
    setActiveTimerId('');
    setActiveTimerState(null);
    setIsTimersMenuOpen(false);
    markTimerChanged();
  };

  const duplicateTimer = (id: string, index: number) => {
    const newId = createId('timer_dup');
    const newIds = [...timerIds];
    newIds.splice(index + 1, 0, newId);

    const originalSettings = readJsonStorage<Record<string, any> | null>(`timerSettings_${id}`, null);
    const originalSeconds = readJsonStorage<number>(`timerSeconds_${id}`, 0);
    const originalSync = readJsonStorage<any | null>(`timerSync_${id}`, null);
    if (originalSettings) {
      writeStorageItem(`timerSettings_${newId}`, JSON.stringify(originalSettings));
    }
    writeStorageItem(`timerSeconds_${newId}`, JSON.stringify(originalSeconds));
    writeStorageItem(`timerSync_${newId}`, JSON.stringify(originalSync || {
      startTime: null,
      initialSeconds: originalSeconds,
      isRunning: false,
      mode: originalSettings?.mode || 'countdown',
      lastUpdated: Date.now(),
    }));

    setTimerIds(newIds);
    setActiveTimerId(newId);
    markTimerChanged();
  };
  const duplicateSelectedTimers = () => {
    const selected = new Set(selectedTimerIds);
    const nextIds = [...timerIds];
    selectedTimerIds.forEach((id) => {
      const originalIndex = timerIds.indexOf(id);
      if (originalIndex === -1) return;
      const newId = createId('timer_dup');
      const originalSettings = readJsonStorage<Record<string, any> | null>(`timerSettings_${id}`, null);
      const originalSeconds = readJsonStorage<number>(`timerSeconds_${id}`, 0);
      const originalSync = readJsonStorage<any | null>(`timerSync_${id}`, null);
      if (originalSettings) writeStorageItem(`timerSettings_${newId}`, JSON.stringify(originalSettings));
      writeStorageItem(`timerSeconds_${newId}`, JSON.stringify(originalSeconds));
      writeStorageItem(`timerSync_${newId}`, JSON.stringify(originalSync || { startTime: null, initialSeconds: originalSeconds, isRunning: false, mode: originalSettings?.mode || 'countdown', lastUpdated: Date.now() }));
      const insertAt = Math.min(nextIds.length, nextIds.indexOf(id) + 1);
      nextIds.splice(insertAt, 0, newId);
    });
    if (selected.size > 0) {
      setTimerIds(nextIds);
      markTimerChanged();
    }
  };
  const deleteSelectedTimers = () => {
    const selected = new Set(selectedTimerIds);
    if (selected.size === 0) return;
    selected.forEach(id => {
      removeStorageItem(`timerSettings_${id}`); removeStorageItem(`timerSeconds_${id}`); removeStorageItem(`timerSync_${id}`); removeStorageItem(`timerLog_${id}`);
      try { postSharedMessage(CONTROL_CHANNEL, { targetId: id, command: 'DESTROY' }); } catch { /* ignore */ }
    });
    const newIds = timerIds.filter(id => !selected.has(id));
    setTimerIds(newIds);
    setTimerHeaders(headers => headers.map(header => ({ ...header, timerIds: header.timerIds.filter(id => !selected.has(id)) })));
    if (selected.has(activeTimerId)) {
      setActiveTimerId(newIds[0] || '');
      setActiveTimerState(null);
    }
    setSelectedTimerIds([]);
    markTimerChanged();
  };

  const loadRoom = useCallback((room: Room) => {
    // Remove only genuinely orphaned timer state. Timer IDs can be shared by
    // legacy rooms, so loading one room must not erase another room's state.
    const knownTimerIds = new Set(rooms.flatMap(candidate => candidate.timerIds || []));
    (room.timerIds || []).forEach(id => knownTimerIds.add(id));
    getStorageKeys().forEach(key => {
      if (key.startsWith('timerSettings_') || key.startsWith('timerSync_') || key.startsWith('timerSeconds_') || key.startsWith('timerLog_')) {
        const tid = key.substring(key.indexOf('_') + 1);
        if (!knownTimerIds.has(tid)) removeStorageItem(key);
      }
    });
    // Apply saved per-timer settings for this room's timers, and refresh
    // each timer's sync state so it mounts fresh at its saved target
    // duration instead of a stale (e.g. 0) initialSeconds from a previous run.
    if (room.timerSettings) {
      Object.keys(room.timerSettings).forEach(id => {
        const settings = room.timerSettings![id];
        writeStorageItem(`timerSettings_${id}`, JSON.stringify(settings));
        const target = settings?.targetDuration ?? 0;
        const mode = settings?.mode || 'countdown';
        const initialSeconds = mode === 'countup' ? 0 : target;
        writeStorageItem(`timerSync_${id}`, JSON.stringify({
          startTime: null,
          initialSeconds,
          isRunning: false,
          mode,
          lastUpdated: Date.now()
        }));
        writeStorageItem(`timerSeconds_${id}`, JSON.stringify(initialSeconds));
      });
    }
    setCurrentRoomId(room.id);
    setIsNewRoomDraft(false);
    setCurrentRoomName(room.name);
    setTimerIds(room.timerIds || []);
    const nextHeaders = (room.timerHeaders || []).map(header => ({ ...header, timerIds: (header.timerIds || []).filter(id => (room.timerIds || []).includes(id)) }));
    setTimerHeaders(nextHeaders);
    setTimerTopLevelItems(room.timerTopLevelItems || [
      ...(room.timerIds || []).filter(id => !nextHeaders.some(header => header.timerIds.includes(id))),
      ...nextHeaders.map(header => `header:${header.id}`),
    ]);
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
  }, [rooms, setCurrentRoomId, setCurrentRoomName, setTimerIds, setTimerHeaders, setTimerTopLevelItems, setActiveTimerId, setActiveTimerState, setMessages, setMessageShownId, setMessageFlashId]);

  // Live edits are kept in localStorage for cross-tab timer operation, but the
  // saved room snapshot is the source of truth across an app restart. This
  // restores rows/settings that were changed or deleted without pressing Save.
  useEffect(() => {
    if (initialRoomRestoredRef.current) return;
    if (rooms.length === 0 && !currentRoomId) {
      initialRoomRestoredRef.current = true;
      return;
    }
    const savedRoomAtStartup = currentRoomId ? rooms.find(room => room.id === currentRoomId) : undefined;
    if (savedRoomAtStartup) {
      initialRoomRestoredRef.current = true;
      loadRoom(savedRoomAtStartup);
      setTimerChangesNeedSave(false);
      return;
    }
    if (!currentRoomId) {
      initialRoomRestoredRef.current = true;
      setIsNewRoomDraft(true);
      setCurrentRoomName('Unnamed');
      setTimerIds([]);
      setTimerHeaders([]);
      setTimerTopLevelItems([]);
      setActiveTimerId('');
      setActiveTimerState(null);
      setMessages([{ id: '1', text: '', color: '#ffffff' }]);
      setTimerChangesNeedSave(false);
    }
  }, [rooms, currentRoomId, loadRoom, setCurrentRoomName, setTimerIds, setTimerHeaders, setTimerTopLevelItems, setActiveTimerId, setActiveTimerState, setMessages]);

  const saveRoom = useCallback(() => {
    const roomName = currentRoomName.trim() || 'Unnamed';
    const existingRoom = currentRoomId ? rooms.find(room => room.id === currentRoomId) : undefined;
    const roomId = existingRoom?.id || currentRoomId || createId('room');
    setCurrentRoomId(roomId);
    setIsNewRoomDraft(false);
    const timerSettings: Record<string, any> = {};
    timerIds.forEach(id => {
      const storedSettings = readJsonStorage<Record<string, any> | null>(`timerSettings_${id}`, null);
      if (storedSettings) timerSettings[id] = storedSettings;
    });
    const roomData: Room = { id: roomId, name: roomName, timerIds: [...timerIds], timerHeaders: [...timerHeaders], timerTopLevelItems: [...topLevelItems], activeTimerId, messages: [...messages], timerSettings };
    // Re-read the latest room list before saving so a stale tab cannot replace
    // rooms created or updated by another tab since this tab last rendered.
    const latestRooms = readJsonStorage<Room[]>('stage-timer-rooms', []);
    const nextRooms = mergeItemById(latestRooms, roomData);
    setRooms(nextRooms);
    removeStorageItem('stage-timer-unsaved-draft');
    setTimerChangesNeedSave(false);
    setSaveNotice('Room saved');
    window.setTimeout(() => setSaveNotice(null), 2200);
  }, [currentRoomId, currentRoomName, rooms, timerIds, timerHeaders, topLevelItems, activeTimerId, messages, setCurrentRoomId, setRooms]);

  const deleteRoom = useCallback((room: Room) => {
    // Re-read immediately before deleting so an older tab cannot overwrite
    // rooms created or updated by another tab since this tab last rendered.
    const latestRooms = readJsonStorage<Room[]>('stage-timer-rooms', []);
    const roomToDelete = latestRooms.find(candidate => candidate.id === room.id) || room;
    const nextRooms = latestRooms.filter(candidate => candidate.id !== room.id);
    const remainingTimerIds = new Set(nextRooms.flatMap(candidate => candidate.timerIds || []));
    (roomToDelete.timerIds || []).forEach(timerId => {
      if (!remainingTimerIds.has(timerId)) {
        removeStorageItem(`timerSettings_${timerId}`);
        removeStorageItem(`timerSync_${timerId}`);
        removeStorageItem(`timerSeconds_${timerId}`);
        removeStorageItem(`timerLog_${timerId}`);
      }
    });
    setRooms(nextRooms);
    if (currentRoomId === room.id) {
      setCurrentRoomId(null);
      setIsNewRoomDraft(true);
      setCurrentRoomName('Unnamed');
      setTimerIds([]);
      setTimerHeaders([]);
      setTimerTopLevelItems([]);
      setActiveTimerId('');
      setActiveTimerState(null);
      setMessages([{ id: '1', text: '', color: '#ffffff' }]);
      setMessageShownId(null);
    }
  }, [currentRoomId, setCurrentRoomId, setCurrentRoomName, setTimerIds, setTimerHeaders, setTimerTopLevelItems, setActiveTimerId, setMessages, setMessageShownId, setRooms]);

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
      writeStorageItem('timerState', JSON.stringify(payload));
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
    setHoverTime(previous => (
      previous !== null && Math.abs(previous - targetCountdownSeconds) < 0.05
        ? previous
        : targetCountdownSeconds
    ));
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
        timeZone: selectedTimeZone,
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
  }, [activeTimerId, activeTimerState, syncOutput, isBlackout, timerIds.length, getActiveMessage, selectedTimeZone]);

  const openOutput = () => {
    if (activeTimerId && activeTimerState) {
      syncOutput({ 
        ...activeTimerState.syncState,
        totalTime: Math.max(0, Number(activeTimerState.settings.targetDuration ?? 0)),
        mode: activeTimerState.syncState.mode,
        timeZone: selectedTimeZone,
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
  const updateMessage = (id: string, text: string) => {
    setMessages(prev => prev.map(m => m.id === id ? { ...m, text } : m));
    markTimerChanged();
  };
  const updateMessageColor = (id: string, color: string) => {
    setMessages(prev => prev.map(m => m.id === id ? { ...m, color } : m));
    markTimerChanged();
  };
  const syncVisibleMessageUpdate = (msg: any, updates: Record<string, unknown>) => {
    if (messageShownId !== msg.id && messageFlashId !== msg.id) return;
    syncOutput({
      messageText: updates.text ?? msg.text ?? '',
      messageColor: updates.color ?? msg.color ?? '#ffffff',
      messageBold: updates.bold ?? !!msg.bold,
      messageUppercase: updates.uppercase ?? !!msg.uppercase,
      messageSize: getMessageSize(msg),
      messageShown: true,
      messageMaximize: true,
      ...(messageFlashId === msg.id ? { messageFlash: true } : {}),
      type: 'force-sync'
    });
  };
  const toggleMessageBold = (id: string) => {
    const msg = messages.find(m => m.id === id);
    if (!msg) return;
    const nextBold = !msg.bold;
    setMessages(prev => prev.map(m => m.id === id ? { ...m, bold: nextBold, text: m.text || '' } : m));
    markTimerChanged();
    syncVisibleMessageUpdate(msg, { bold: nextBold, text: msg.text || '' });
  };
  const toggleMessageUppercase = (id: string) => {
    const msg = messages.find(m => m.id === id);
    if (!msg) return;
    const nextUppercase = !msg.uppercase;
    const nextText = nextUppercase ? (msg.text || '').toUpperCase() : (msg.text || '').toLowerCase();
    setMessages(prev => prev.map(m => m.id === id ? { ...m, uppercase: nextUppercase, text: nextText } : m));
    markTimerChanged();
    syncVisibleMessageUpdate(msg, { uppercase: nextUppercase, text: nextText });
  };
  const updateMessageSize = (id: string, value: number) => {
    const nextSize = Math.min(10, Math.max(0.1, Number.isFinite(value) ? value : 1.0));
    setMessages(prev => prev.map(m => m.id === id ? { ...m, messageSize: nextSize } : m));
    markTimerChanged();

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
    setSelectedMessageIds(current => current.filter(messageId => messageId !== id));
    markTimerChanged();
  };
  const duplicateMessage = (id: string) => {
    const index = messages.findIndex(message => message.id === id);
    if (index === -1) return;
    const original = messages[index];
    const duplicate = { ...original, id: createId('message') };
    setMessages(prev => { const next = [...prev]; next.splice(index + 1, 0, duplicate); return next; });
    setSelectedMessageIds(current => [...current, duplicate.id]);
    markTimerChanged();
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
  const moveMessage = (fromId: string, toId: string) => {
    setMessages(prev => {
      const fromIdx = prev.findIndex(m => m.id === fromId);
      const toIdx = prev.findIndex(m => m.id === toId);
      if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return prev;
      const next = [...prev];
      const [moved] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, moved);
      return next;
    });
    markTimerChanged();
  };
  const addMessage = () => {
    setMessages(prev => [...prev, { id: createId('message'), text: '', color: '#ffffff', bold: false, uppercase: false, messageSize: 1.0 }]);
    markTimerChanged();
  };

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
  const currentTime = activeTimerState
    ? activeMode === 'time'
      ? formatTimeOfDay(renderedDisplaySeconds, selectedTimeZone)
      : formatClock(renderedDisplaySeconds)
    : '--:--';

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
  const filteredTimeZones = TIMEZONES.filter((tz) => tz.toLowerCase().includes(timeZoneSearch.trim().toLowerCase()));

  const visualTimerOrder = useMemo(() => {
    const order: string[] = [];
    topLevelItems.forEach(item => {
      if (item.startsWith('header:')) {
        const header = timerHeaders.find(candidate => `header:${candidate.id}` === item);
        header?.timerIds.forEach(timerId => {
          if (timerIds.includes(timerId) && !order.includes(timerId)) order.push(timerId);
        });
      } else if (timerIds.includes(item) && !timerHeaders.some(header => header.timerIds.includes(item))) {
        if (!order.includes(item)) order.push(item);
      }
    });
    timerIds.forEach(timerId => {
      if (!order.includes(timerId)) order.push(timerId);
    });
    return order;
  }, [topLevelItems, timerHeaders, timerIds]);

  const moveTimerBy = (id: string, direction: -1 | 1) => {
    const owner = timerHeaders.find(header => header.timerIds.includes(id));
    if (owner) {
      const childIndex = owner.timerIds.indexOf(id);
      const nextIndex = childIndex + direction;
      if (nextIndex >= 0 && nextIndex < owner.timerIds.length) {
        setTimerHeaders(headers => headers.map(header => {
          if (header.id !== owner.id) return header;
          const next = [...header.timerIds];
          next.splice(childIndex, 1);
          next.splice(nextIndex, 0, id);
          return { ...header, timerIds: next };
        }));
        markTimerChanged();
        return;
      }

      // Crossing a section boundary moves the timer beside the section rather
      // than implicitly nesting it in a different container.
      const sectionItem = `header:${owner.id}`;
      setTimerHeaders(headers => headers.map(header => ({ ...header, timerIds: header.timerIds.filter(timerId => timerId !== id) })));
      setTimerTopLevelItems(items => {
        const next = items.filter(item => item !== id);
        const sectionIndex = next.indexOf(sectionItem);
        if (sectionIndex === -1) return next;
        next.splice(direction < 0 ? sectionIndex : sectionIndex + 1, 0, id);
        return next;
      });
      markTimerChanged();
      return;
    }

    const topIndex = topLevelItems.indexOf(id);
    if (topIndex === -1) return;
    const next = [...topLevelItems];
    next.splice(topIndex, 1);
    let targetIndex = topIndex + direction;
    if (direction < 0 && next[targetIndex]?.startsWith('header:')) targetIndex -= 0;
    if (direction > 0 && next[targetIndex]?.startsWith('header:')) targetIndex += 1;
    targetIndex = Math.max(0, Math.min(next.length, targetIndex));
    next.splice(targetIndex, 0, id);
    if (targetIndex === topIndex) return;
    setTimerTopLevelItems(next);
    markTimerChanged();
  };

  const renderTimerRow = (id: string, displayIndex: number, insertionIndex = timerIds.indexOf(id)) => (
    <TimerRow
      key={id}
      id={id}
      index={displayIndex}
      isActionsOpen={openActionsTimerId === id}
      onActionsToggle={() => { setOpenTimerPanel(null); setIsTimersMenuOpen(false); setOpenActionsTimerId(current => current === id ? null : id); }}
      onCloseActions={() => setOpenActionsTimerId(null)}
      openPanel={openTimerPanel?.timerId === id ? openTimerPanel.panel : null}
      onPanelOpen={(panel) => { setOpenActionsTimerId(null); setOpenTimerPanel({ timerId: id, panel }); }}
      onPanelClose={() => { setOpenTimerPanel(current => current?.timerId === id ? null : current); }}
      isSelectMode={isTimerSelectMode}
      isSelected={selectedTimerIds.includes(id)}
      onSelect={() => setSelectedTimerIds(current => current.includes(id) ? current.filter(timerId => timerId !== id) : [...current, id])}
      isActive={activeTimerId === id}
      scheduledStart={schedule[id]?.start ?? null}
      formatTime={formatScheduledTime}
      selectedTimeZone={selectedTimeZone}
      onActivate={(manualStart = false) => {
        if (manualStart) {
          const settings = id === activeTimerId && activeTimerState ? activeTimerState.settings : readJsonStorage<Record<string, any> | null>(`timerSettings_${id}`, null);
          if (settings?.scheduledStart !== null && Number.isFinite(Number(settings?.scheduledStart))) {
            const scheduledDateForToday = new Intl.DateTimeFormat('en-CA', { timeZone: selectedTimeZone }).format(new Date());
            const scheduledDate = settings.scheduledStartDate || scheduledDateForToday;
            const scheduledAt = getZonedDateTimeTimestamp(scheduledDate, Number(settings.scheduledStart), selectedTimeZone);
            manuallyStartedScheduledTimersRef.current.add(`${id}:${scheduledAt}`);
          }
        }
        const currentlyRunning = activeTimerState?.isRunning;
        if (currentlyRunning && activeTimerId && activeTimerId !== id) {
          try { postSharedMessage(CONTROL_CHANNEL, { targetId: activeTimerId, command: 'PAUSE' }); postSharedMessage(CONTROL_CHANNEL, { command: 'PAUSE_ALL_EXCEPT', payload: id }); } catch { /* ignore */ }
          window.dispatchEvent(new CustomEvent('stage-timer-pause-all-except', { detail: id }));
        }
        setActiveTimerId(id);
      }}
      onSync={setActiveTimerState}
      onAddAbove={() => addTimer(insertionIndex)}
      onAddBelow={() => addTimer(insertionIndex + 1)}
      onMoveUp={() => moveTimerBy(id, -1)}
      onMoveDown={() => moveTimerBy(id, 1)}
      onDuplicate={() => duplicateTimer(id, insertionIndex)}
      onDelete={() => { deleteTimer(id); setSelectedTimerIds(current => current.filter(timerId => timerId !== id)); setTimerHeaders(headers => headers.map(header => ({ ...header, timerIds: header.timerIds.filter(timerId => timerId !== id) }))); }}
      onApplyToAll={applyToAllSettings}
      onSettingsUpdate={() => { setSettingsVersion(v => v + 1); markTimerChanged(); }}
    />
  );

  return (
    <div className="flex h-screen flex-col bg-[#1a1a1a] text-white antialiased overflow-hidden">
      {saveNotice && <div className="fixed left-1/2 top-4 z-[100] -translate-x-1/2 rounded-md border border-[#3b82f6] bg-[#1e3a8a] px-4 py-2 text-[13px] font-bold text-white shadow-xl" role="status">{saveNotice}</div>}
      {sectionDeleteTarget && <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-labelledby="section-delete-title">
        <div className="relative w-full max-w-md rounded-xl border border-[#444] bg-[#242424] px-5 pb-5 pt-5 shadow-2xl">
          <button type="button" onClick={() => setSectionDeleteTarget(null)} className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded text-[#999] transition-colors hover:bg-[#383838] hover:text-white" aria-label="Close delete section dialog" title="Close"><IconClose size={16} /></button>
          <div className="flex items-center gap-3 pr-8">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center text-[#ff8b8b]"><IconTrash size={22} /></span>
            <h2 id="section-delete-title" className="text-[17px] font-bold tracking-tight text-white">Delete “{sectionDeleteTarget.title}”?</h2>
          </div>
          <div className="my-4 h-px bg-[#333]" />
          <p className="text-[13px] leading-5 text-[#aaa]">This section contains <strong className="font-bold text-white">{sectionDeleteTarget.timerIds.filter(id => timerIds.includes(id)).length}</strong> timer row(s). Choose what should happen to them.</p>
          <div className="mt-4 flex flex-col gap-2">
            <button type="button" onClick={() => deleteTimerHeader(sectionDeleteTarget.id, true)} className="h-10 rounded-md border border-[#8b3d3d] bg-[#542626] px-3 text-[13px] font-bold text-[#ffb0b0] transition-colors hover:bg-[#6b2d2d]">Delete Section and Timers</button>
            <button type="button" onClick={() => deleteTimerHeader(sectionDeleteTarget.id, false)} className="h-10 rounded-md border border-[#4b79a8] bg-[#263d59] px-3 text-[13px] font-bold text-white transition-colors hover:bg-[#315276]">Delete Section Only</button>
            <button type="button" onClick={() => setSectionDeleteTarget(null)} className="h-10 rounded-md border border-[#444] bg-[#2d2d2d] px-3 text-[13px] text-white transition-colors hover:bg-[#383838]">Cancel</button>
          </div>
        </div>
      </div>}
      <header className="flex flex-col sm:flex-row items-center justify-between gap-3 px-3 py-2 border-b border-[#333] shrink-0 z-20 bg-[#1a1a1a]">
        <input ref={roomNameInputRef} type="text" value={currentRoomName} onChange={(e) => { const nextName = e.target.value; setCurrentRoomName(nextName); if (savedRoom && nextName.trim() !== savedRoom.name.trim()) markTimerChanged(); }} onFocus={() => { if (currentRoomName === 'New Room' || currentRoomName === 'Unnamed') { roomNamePlaceholderRef.current = currentRoomName; setCurrentRoomName(''); } }} onBlur={() => { if (!currentRoomName.trim()) setCurrentRoomName(roomNamePlaceholderRef.current || 'Unnamed'); roomNamePlaceholderRef.current = null; }} className="min-w-0 flex-1 bg-transparent text-[20px] font-bold text-white outline-none hover:text-[#9fc7ff] hover:underline hover:decoration-dashed hover:underline-offset-4 focus:text-white transition-colors text-center sm:text-left" />
        <div className="flex flex-wrap items-center justify-center gap-2">
          <button type="button" onClick={saveRoom} title="Save room" className={`flex h-9 items-center gap-2 rounded-md px-4 text-[13px] text-white hover:bg-[#383838] ${hasUnsavedChanges ? 'border border-[#d69e2e] bg-[#4a3415]' : 'bg-[#2d2d2d]'}`}><IconSave className="mr-1" /> Save</button>
          <div className="relative">
            <button type="button" onClick={(e) => { e.stopPropagation(); setIsRoomMenuOpen(!isRoomMenuOpen); }} title="Open saved rooms" className="flex h-9 items-center gap-2 rounded-md bg-[#2d2d2d] px-4 text-[13px] text-white hover:bg-[#383838]">Room <IconChevronDown size={14} /></button>
            {isRoomMenuOpen && (
              <div onClick={(e) => e.stopPropagation()} className="absolute right-0 top-full z-50 mt-1 w-64 rounded-md border border-[#444] bg-[#242424] p-1 shadow-xl">
                <div className="px-2 py-1.5 text-[10px] uppercase tracking-wide text-[#777]">Saved Rooms</div>
                {rooms.map((room) => (
                  <div key={room.id} onClick={() => loadRoom(room)} className={`group flex items-center justify-between rounded px-2 py-2 text-left text-[13px] text-white hover:bg-[#383838] cursor-pointer ${currentRoomId === room.id ? 'bg-[#3a3a3a] text-white' : ''}`}>
                    <span className="truncate">{room.name}</span>
                    <button onClick={(e) => { e.stopPropagation(); deleteRoom(room); }} title="Delete saved room" className="opacity-0 group-hover:opacity-100 text-[#fa5252] hover:text-red-400 p-1">✕</button>
                  </div>
                ))}
                <div className="mt-1 border-t border-[#333] pt-1"><button onClick={() => {
                  // Reset only the active room state; preserve existing rooms and their timers.
                  removeStorageItem('stage-timer-message-shown-id');
                  setCurrentRoomId(createId('room-draft'));
                  setIsNewRoomDraft(true);
                  setCurrentRoomName('New Room');
                  setTimerIds([]);
                  setTimerHeaders([]);
                  setTimerTopLevelItems([]);
                  setActiveTimerId('');
                  setActiveTimerState(null);
                  setMessages([{ id: '1', text: '', color: '#ffffff' }]);
                  setMessageShownId(null);
                  setMessageFlashId(null);
                  setIsRoomMenuOpen(false);
                  requestAnimationFrame(() => {
                    roomNameInputRef.current?.focus();
                    roomNameInputRef.current?.select();
                  });
                }} title="Create a new room" className="w-full rounded px-2 py-2 text-left text-[12px] text-[#22c55e] hover:bg-[#383838]">+ Create New Room</button></div>
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
    const timerHeaders = Array.isArray(room.timerHeaders) ? room.timerHeaders.map((header: TimerHeader) => ({
      ...header,
      id: createId('imported_header'),
      timerIds: (header.timerIds || []).map(remapTimerId),
    })) : [];
    const importedHeaderIds = new Map((Array.isArray(room.timerHeaders) ? room.timerHeaders : []).map((header: TimerHeader, index: number) => [header.id, timerHeaders[index]?.id]));
    const timerTopLevelItems = Array.isArray(room.timerTopLevelItems)
      ? room.timerTopLevelItems.map((item: string) => item.startsWith('header:') ? `header:${importedHeaderIds.get(item.slice('header:'.length)) || ''}` : remapTimerId(item)).filter(Boolean)
      : [
        ...timerIds.filter(id => !timerHeaders.some(header => header.timerIds.includes(id))),
        ...timerHeaders.map(header => `header:${header.id}`),
      ];
    return {
      ...room,
      id: importedRoomId,
      timerIds,
      activeTimerId: room.activeTimerId ? remapTimerId(room.activeTimerId) : '',
      timerHeaders,
      timerTopLevelItems,
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
          <button type="button" onClick={() => fileInputRef.current?.click()} title="Import room backup" className="flex h-9 items-center gap-2 rounded-md border border-[#444] bg-[#2d2d2d] px-4 text-[13px] text-white hover:bg-[#383838]"><IconDownload className="mr-1" /> Import</button>
          <button type="button" onClick={() => { const exportTimerSettings: Record<string, any> = {};
            timerIds.forEach(id => {
              const settings = readJsonStorage<Record<string, any> | null>(`timerSettings_${id}`, null);
              if (settings) exportTimerSettings[id] = normalizeTimerSettingsForTransfer(settings);
            });
                        const activeRoomSnapshot: Room | null = currentRoomId ? { id: currentRoomId, name: currentRoomName.trim() || 'Unnamed', timerIds: [...timerIds], timerHeaders: [...timerHeaders], timerTopLevelItems: [...topLevelItems], activeTimerId, messages: [...messages], timerSettings: exportTimerSettings } : null;
                        const exportedRooms = activeRoomSnapshot
                          ? mergeItemById(rooms, activeRoomSnapshot)
                          : rooms;
                        const exportData = { rooms: exportedRooms, activeRoomId: currentRoomId, activeRoomName: currentRoomName, exportedAt: new Date().toISOString() };
 const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `stage-timer-backup-${new Date().toISOString().split('T')[0]}.json`; link.click(); URL.revokeObjectURL(url); }} title="Export room backup" className="flex h-9 items-center gap-2 rounded-md border border-[#444] bg-[#2d2d2d] px-4 text-[13px] text-white hover:bg-[#383838]"><IconUpload className="mr-1" /> Export</button>
        </div>
      </header>

      <div className="relative flex-1 overflow-y-auto lg:overflow-hidden flex flex-col lg:flex-row">
        <div className="order-last flex w-14 shrink-0 flex-col items-center gap-5 border-l border-[#333] bg-[#1a1a1a] pt-8 max-lg:hidden min-[1400px]:hidden">
          <button type="button" onClick={() => setMobileSection('timers')} className={`flex h-12 w-full items-center justify-center border-r-2 bg-transparent p-0 transition-opacity ${mobileSection === 'timers' ? 'border-white opacity-100' : 'border-transparent opacity-45 hover:opacity-80'}`} title="Show timers" aria-label="Show timers" aria-pressed={mobileSection === 'timers'}>
            <Image src="/timer_section.svg" alt="" width={20} height={20} className="h-5 w-5 invert" />
          </button>
          <button type="button" onClick={() => setMobileSection('messages')} className={`flex h-12 w-full items-center justify-center border-r-2 bg-transparent p-0 transition-opacity ${mobileSection === 'messages' ? 'border-white opacity-100' : 'border-transparent opacity-45 hover:opacity-80'}`} title="Show messages" aria-label="Show messages" aria-pressed={mobileSection === 'messages'}>
            <Image src="/message_section.svg" alt="" width={20} height={20} className="h-5 w-5 invert" />
          </button>
        </div>
        <aside className="flex w-full lg:w-[380px] xl:w-[420px] shrink-0 flex-col border-b lg:border-b-0 lg:border-r border-[#333] bg-[#1a1a1a] px-4 py-3 h-auto lg:h-full lg:overflow-y-auto custom-scrollbar">
          <div className="mb-3 flex items-center justify-between"><h2 className="text-[17px] font-bold text-white">Dashboard</h2><button type="button" onClick={openOutput} title="Open output links" className="flex h-8 items-center gap-2 rounded-md border border-[#444] bg-[#2d2d2d] px-3 text-[12px] text-white hover:bg-[#383838]"><IconScreen className="mr-1" /> Output Links</button></div>
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
                <div className="flex items-center gap-2 text-white">
                  <div className={`h-2 w-2 rounded-full ${hoverTime !== null ? 'bg-white shadow-[0_0_8px_rgba(255,255,255,0.8)]' : activeTimerState?.isRunning ? 'bg-[#fa5252] shadow-[0_0_8px_rgba(250,82,82,0.8)]' : 'bg-[#444]'}`}></div>
                  <span className="font-mono text-[18px] font-bold tracking-tight">
                    {activeMode === 'time'
                      ? formatTimeOfDay(hoverDisplaySeconds, selectedTimeZone)
                      : (hoverDisplaySeconds < 0 && activeMode === 'countdown' ? '+' + formatClock(Math.abs(hoverDisplaySeconds)) : formatClock(hoverDisplaySeconds)) + `.${Math.floor(Math.abs((hoverDisplaySeconds % 1) * 10))}`}
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
                      setHoverTime(previous => (
                        previous !== null && Math.abs(previous - time) < 0.05
                          ? previous
                          : time
                      ));
                      
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
              <button type="button" onClick={(e) => { e.stopPropagation(); setOpenAdjustMenu(openAdjustMenu === 'decrease' ? null : 'decrease'); }} title="Decrease timer adjustment options" className={`flex h-10 w-full items-center justify-center rounded border border-[#333] bg-[#2d2d2d] hover:bg-[#383838] transition-colors ${openAdjustMenu === 'decrease' ? 'bg-[#383838] border-[#555]' : ''}`}><IconChevronDown /></button>
              {openAdjustMenu === 'decrease' && (<div onClick={(e) => e.stopPropagation()} className="absolute bottom-full left-0 z-50 mb-1"><TimeAdjustMenu direction="decrease" onSelect={(secs) => sendControl('ADJUST', secs)} onClose={() => setOpenAdjustMenu(null)} /></div>)}
            </div>
            <button onClick={() => sendControl('ADJUST', -60)} title="Subtract one minute" className="col-span-1 flex h-10 items-center justify-center rounded border border-[#333] bg-[#2d2d2d] text-[14px] font-bold hover:bg-[#383838] transition-colors">-1m</button>
            <button onClick={() => sendControl('RESET')} className="col-span-1 flex h-10 items-center justify-center rounded border border-[#333] bg-[#2d2d2d] hover:bg-[#383838] transition-colors" title="Reset current timer"><IconSkipBack /></button>
            <button onClick={() => sendControl(activeTimerState?.isRunning ? 'PAUSE' : 'START')} title={activeTimerState?.isRunning ? 'Pause timer' : 'Start timer'} className={`group col-span-1 flex h-10 items-center justify-center rounded transition-colors ${activeTimerState?.isRunning ? 'border border-[#333] bg-[#2d2d2d] text-[#ef4444] hover:border-[#dc2626] hover:bg-[#dc2626] hover:text-white' : 'border border-[#333] bg-[#2d2d2d] text-[#22c55e] hover:border-[#16a34a] hover:bg-[#16a34a] hover:text-white'}`}>{activeTimerState?.isRunning ? <IconPause /> : <IconPlay />}</button>
            <button 
              onClick={goToNextTimer} 
              disabled={timerIds.length <= 1 || timerIds.indexOf(activeTimerId) >= timerIds.length - 1}
              className={`col-span-1 flex h-10 items-center justify-center rounded border border-[#333] bg-[#2d2d2d] transition-colors ${timerIds.length <= 1 || timerIds.indexOf(activeTimerId) >= timerIds.length - 1 ? 'opacity-30 cursor-not-allowed' : 'hover:bg-[#383838]'}`}
              title="Next timer"
            >
              <IconSkipForward />
            </button>
            <button onClick={() => sendControl('ADJUST', 60)} title="Add one minute" className="col-span-1 flex h-10 items-center justify-center rounded border border-[#333] bg-[#2d2d2d] text-[14px] font-bold hover:bg-[#383838] transition-colors">+1m</button>
            <div className="relative">
              <button type="button" onClick={(e) => { e.stopPropagation(); setOpenAdjustMenu(openAdjustMenu === 'increase' ? null : 'increase'); }} title="Increase timer adjustment options" className={`flex h-10 w-full items-center justify-center rounded border border-[#333] bg-[#2d2d2d] hover:bg-[#383838] transition-colors ${openAdjustMenu === 'increase' ? 'bg-[#383838] border-[#555]' : ''}`}><IconChevronDown /></button>
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
                  <div className="absolute bottom-full left-1/2 z-50 mb-1 max-h-72 w-64 -translate-x-1/2 overflow-y-auto rounded-md border border-[#444] bg-[#242424] p-1 shadow-xl custom-scrollbar">
                    <div className="px-2 py-1.5 text-[10px] uppercase tracking-wide text-[#777]">Select Timezone</div>
                    <input
                      type="search"
                      value={timeZoneSearch}
                      onChange={(event) => setTimeZoneSearch(event.target.value)}
                      onClick={(event) => event.stopPropagation()}
                      placeholder="Search timezones..."
                      aria-label="Search timezones"
                      className="mb-1 w-full rounded border border-[#444] bg-[#181818] px-2 py-1.5 text-[12px] text-white outline-none placeholder:text-[#777] focus:border-[#4a9eff]"
                    />
                    {filteredTimeZones.map((tz) => (
                      <div 
                        key={tz} 
                        onClick={() => { setSelectedTimeZone(tz); setTimeZoneSearch(''); setIsTimeZoneMenuOpen(false); }}
                        className={`rounded px-2 py-1.5 text-left text-[12px] hover:bg-[#383838] cursor-pointer ${selectedTimeZone === tz ? 'text-[#22c55e] bg-[#2d2d2d]' : 'text-white'}`}
                      >
                        {tz.replace('_', ' ')}
                      </div>
                    ))}
                    {filteredTimeZones.length === 0 && <div className="px-2 py-2 text-[12px] text-[#777]">No timezones found</div>}
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

        <main className={`timer-panel min-w-0 flex-1 lg:min-w-[560px] flex-col px-4 sm:px-6 lg:px-10 py-3 lg:py-3 bg-[#141414] h-auto lg:h-full lg:overflow-hidden ${mobileSection === 'timers' ? 'flex' : 'hidden'} max-lg:!flex min-[1400px]:flex`}>
          <div className="mb-4 flex shrink-0 items-center justify-between">
            {isTimerSelectMode ? (
              <div className="flex min-w-0 items-center gap-2">
                <button type="button" onClick={() => { setIsTimerSelectMode(false); setSelectedTimerIds([]); }} title="Exit timer selection mode" aria-label="Exit timer selection mode" className="flex h-8 w-8 shrink-0 items-center justify-center rounded border border-[#444] bg-[#2d2d2d] text-white hover:bg-[#383838]"><IconClose size={15} /></button>
                <button type="button" onClick={toggleAllTimers} title={allTimersSelected ? 'Deselect all timers' : 'Select all timers'} className="flex h-8 w-8 items-center justify-center gap-1 rounded border border-[#444] bg-[#2d2d2d] px-0 text-[13px] text-white hover:bg-[#383838] sm:w-auto sm:justify-start sm:px-2"><IconCheckbox checked={allTimersSelected} size={13} /><span className="hidden sm:inline">{allTimersSelected ? 'Deselect All' : 'Select All'}</span></button>
                <span className="whitespace-nowrap text-[13px] text-[#8a8a8a]">{selectedTimerIds.length} of {timerIds.length} selected</span>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <h2 className="text-[17px] font-bold text-white">Timers</h2>
                <button type="button" onClick={() => { setIsTimerSelectMode(true); setSelectedTimerIds([]); }} title="Select a timer" className="group relative rounded px-1 py-1 text-[13px] font-normal text-[#666] transition-colors hover:bg-[#2d2d2d] hover:text-[#aaa]">Select<span className="pointer-events-none absolute left-0 top-full z-50 mt-1 whitespace-nowrap rounded border border-[#444] bg-[#242424] px-2 py-1 text-[11px] font-normal text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100">Choose a timer</span></button>
              </div>
            )}
            <div className="flex items-center gap-3">
              <button 
                type="button" 
                onClick={() => setIsBlackout(!isBlackout)} 
                title="Toggle blackout mode"
                className={`${isTimerSelectMode ? 'hidden' : 'flex'} h-8 items-center gap-2 rounded-lg border border-[#444] bg-[#2d2d2d] px-4 text-[13px] font-bold text-white transition-all hover:bg-[#383838]`}
              >
                <span className={`inline-block h-2 w-2 rounded-full ${isBlackout ? 'bg-[#fa5252] shadow-[0_0_8px_rgba(250,82,82,0.8)]' : 'bg-[#555]'}`} /> Blackout
              </button>
              <button 
                type="button" 
                onClick={handleFlash} 
                title="Flash active timer"
                className={`${isTimerSelectMode ? 'hidden' : 'flex'} h-8 items-center gap-2 rounded-lg border border-[#444] bg-[#2d2d2d] px-4 text-[13px] font-bold transition-all hover:bg-[#383838] ${isFlashing && isFlash ? 'text-[#ffd43b]' : 'text-white'}`}
              >
                <IconFlash /> Flash
              </button>
              <div className="relative">
                <button 
                  type="button" 
                  onClick={(e) => {
                    e.stopPropagation();
                    window.dispatchEvent(new CustomEvent('stage-timer-menu-open', { detail: 'header' }));
                    setOpenActionsTimerId(null);
                    setIsTimersMenuOpen(!isTimersMenuOpen);
                  }}
                  title="Open timer options"
                  className={`${isTimerSelectMode ? 'hidden' : 'flex'} h-8 w-10 items-center justify-center rounded-lg border border-[#444] bg-[#2d2d2d] text-white hover:bg-[#383838] transition-all ${isTimersMenuOpen ? 'bg-[#383838] border-[#555]' : ''}`}
                >
                  <IconMore size={20} />
                </button>
                {isTimersMenuOpen && (
                  <div onClick={(e) => e.stopPropagation()} className="absolute right-0 top-full z-50 mt-1 w-56 rounded-md border border-[#444] bg-[#242424] p-1 shadow-xl">
                    <button 
                      onClick={() => { setIsFollowEnabled(!isFollowEnabled); markTimerChanged(); }}
                      title="Toggle play in sequence"
                      className="flex w-full items-center justify-between rounded px-3 py-2 text-left text-[13px] text-white hover:bg-[#383838]"
                    >
                      <span>Play in sequence</span>
                      <div className={`h-4 w-4 rounded border ${isFollowEnabled ? 'bg-[#22c55e] border-[#22c55e]' : 'border-[#555]'}`}>
                        {isFollowEnabled && <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>}
                      </div>
                    </button>

                  </div>
                )}
              </div>
              {isTimerSelectMode && <>
                <button type="button" disabled={selectedTimerIds.length === 0} onClick={duplicateSelectedTimers} title="Duplicate selected timers" className="flex h-8 w-8 items-center justify-center gap-0 rounded-lg border border-[#444] bg-[#2d2d2d] px-0 text-[12px] text-white hover:bg-[#383838] disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto sm:gap-1.5 sm:px-2.5"><IconDuplicate size={15} /><span className="hidden sm:inline">Duplicate</span></button>
                <button type="button" disabled={selectedTimerIds.length === 0} onClick={deleteSelectedTimers} title="Delete selected timers" className="flex h-8 w-8 items-center justify-center gap-0 rounded-lg border border-[#444] bg-[#2d2d2d] px-0 text-[12px] text-[#ff8b8b] hover:bg-[#3a2020] disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto sm:gap-1.5 sm:px-2.5"><IconTrash size={15} /><span className="hidden sm:inline">Delete</span></button>
              </>}
              </div></div>
          <div className="min-h-0 flex-1 overflow-y-auto custom-scrollbar">
          <DndContext sensors={sensors} collisionDetection={collisionDetectionStrategy} onDragStart={() => setIsListDragging(true)} onDragOver={handleDragOver} onDragCancel={() => { setIsListDragging(false); setDragPreview(null); }} onDragEnd={(event) => { setIsListDragging(false); handleDragEnd(event); }} modifiers={[restrictToVerticalAxis]}>
            <SortableContext items={topLevelItems} strategy={verticalListSortingStrategy}>
              <div ref={timerListRef} className={`timer-dnd-list relative space-y-2 ${isListDragging ? 'is-dragging' : ''}`}>
                {topLevelItems.map(item => {
                  if (item.startsWith('header:')) {
                    const header = timerHeaders.find(candidate => `header:${candidate.id}` === item);
                    if (!header) return null;
                    const sectionTimerIds = header.timerIds.filter(id => timerIds.includes(id));
                    return <div key={header.id} className="space-y-0"><TimerHeaderRow
                      header={header}
                      onToggle={() => updateTimerHeader(header.id, { collapsed: !header.collapsed })}
                      onRename={(title) => updateTimerHeader(header.id, { title })}
                      onDelete={() => setSectionDeleteTarget(header)}
                      onAddTimer={() => {
                        const newId = addTimer();
                        setTimerHeaders(headers => headers.map(current => current.id === header.id ? { ...current, timerIds: [...current.timerIds, newId] } : current));
                        setTimerTopLevelItems(items => items.filter(current => current !== newId));
                      }}
                    />{!header.collapsed && sectionTimerIds.length > 0 && <SortableContext items={sectionTimerIds} strategy={verticalListSortingStrategy}><div className="ml-4 space-y-3 border-l border-[#333] pl-3 pt-2">{sectionTimerIds.map(id => renderTimerRow(id, visualTimerOrder.indexOf(id), timerIds.indexOf(id)))}</div></SortableContext>}</div>;
                  }
                  return timerIds.includes(item) && !timerHeaders.some(header => header.timerIds.includes(item)) ? <div key={item} className="space-y-3">{renderTimerRow(item, visualTimerOrder.indexOf(item), timerIds.indexOf(item))}</div> : null;
                })}
                {dragPreview && <div aria-hidden="true" className={`timer-drag-preview pointer-events-none absolute z-40 ${dragPreview.placement === 'inside' ? 'rounded-lg border-2 border-dashed border-[#4a9eff] bg-[#4a9eff]/10 shadow-[0_0_0_1px_rgba(74,158,255,0.18),inset_0_0_18px_rgba(74,158,255,0.08)]' : 'drag-boundary-preview'}`} style={{ top: dragPreview.top, left: dragPreview.left, width: dragPreview.width, height: dragPreview.height }} />}
              </div>
            </SortableContext>
          </DndContext>
          <div className="mx-auto mt-10 flex w-[calc(100%-2rem)] max-w-[30rem] flex-nowrap items-center justify-center gap-3 rounded-lg border border-[#333] bg-[#191919]/95 p-3 shadow-inner">
            <button type="button" onClick={() => addTimer()} title="Add a new timer" className="flex h-8 min-w-0 flex-1 items-center justify-center gap-2 rounded-lg border border-[#444] bg-[#2d2d2d] px-2 text-[13px] font-bold text-white transition-all hover:bg-[#383838] active:scale-[0.99] sm:px-4"><IconAddTimer size={18} /> <span className="whitespace-nowrap">Add New Timer</span></button>
            <button type="button" onClick={addTimerHeader} title="Add a parent timer section" className="flex h-8 min-w-0 flex-1 items-center justify-center gap-2 rounded-lg border border-[#444] bg-[#2d2d2d] px-2 text-[13px] font-bold text-white transition-all hover:bg-[#383838] active:scale-[0.99] sm:px-4"><IconLayers size={18} /> <span className="whitespace-nowrap">Add New Section</span></button>
          </div>
          </div>
        </main>

        <aside className={`min-w-0 flex-1 min-[1400px]:w-[340px] min-[1400px]:flex-none 2xl:w-[380px] shrink-0 flex-col border-t lg:border-t-0 lg:border-l border-[#333] px-4 py-3 h-auto lg:h-full lg:overflow-y-auto custom-scrollbar ${mobileSection === 'messages' ? 'flex bg-[#141414] min-[1400px]:bg-transparent' : 'hidden'} max-lg:!flex min-[1400px]:flex`}>
          <div className="mb-4 flex items-center justify-between">{isMessageSelectMode ? (
            <div className="flex min-w-0 items-center gap-2">
              <button type="button" onClick={() => { setIsMessageSelectMode(false); setSelectedMessageIds([]); }} title="Exit message selection mode" aria-label="Exit message selection mode" className="flex h-8 w-8 shrink-0 items-center justify-center rounded border border-[#444] bg-[#2d2d2d] text-white hover:bg-[#383838]"><IconClose size={15} /></button>
              <button type="button" onClick={toggleAllMessages} title={allMessagesSelected ? 'Deselect all messages' : 'Select all messages'} aria-label={allMessagesSelected ? 'Deselect all messages' : 'Select all messages'} className="flex h-8 w-8 shrink-0 items-center justify-center rounded border border-[#444] bg-[#2d2d2d] text-white hover:bg-[#383838]"><IconCheckbox checked={allMessagesSelected} size={13} /></button>
              <span className="whitespace-nowrap text-[13px] text-[#8a8a8a]">{selectedMessageIds.length} of {messages.length} selected</span>
            </div>
          ) : (
            <div className="flex items-center gap-3"><h2 className="text-[17px] font-bold text-white">Messages</h2><button type="button" onClick={() => { setIsMessageSelectMode(true); setSelectedMessageIds([]); }} title="Select a message" className="group relative rounded px-1 py-1 text-[13px] font-normal text-[#666] transition-colors hover:bg-[#2d2d2d] hover:text-[#aaa]">Select<span className="pointer-events-none absolute left-0 top-full z-50 mt-1 whitespace-nowrap rounded border border-[#444] bg-[#242424] px-2 py-1 text-[11px] font-normal text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100">Choose a message</span></button></div>
          )}{isMessageSelectMode ? <div className="flex items-center gap-2"><button type="button" disabled={selectedMessageIds.length === 0} onClick={() => selectedMessageIds.forEach(id => duplicateMessage(id))} title="Duplicate selected messages" className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#444] bg-[#2d2d2d] text-white hover:bg-[#383838] disabled:cursor-not-allowed disabled:opacity-40"><IconDuplicate size={15} /></button><button type="button" disabled={selectedMessageIds.length === 0} onClick={() => { selectedMessageIds.forEach(id => deleteMessage(id)); setSelectedMessageIds([]); }} title="Delete selected messages" className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#444] bg-[#2d2d2d] text-[#ff8b8b] hover:bg-[#3a2020] disabled:cursor-not-allowed disabled:opacity-40"><IconTrash size={15} /></button></div> : <button type="button" onClick={() => { if (messageShownId) { flashMessage(messageShownId); } }} className={`flex h-8 w-8 items-center justify-center rounded border border-[#555] bg-transparent hover:bg-[#333] ${isMessageFlashing && isMessageFlash ? 'text-[#ffd43b]' : 'text-white'}`} title="Flash the currently shown message on Output"><IconFlash size={14} /></button>}</div>
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
                    isSelectMode={isMessageSelectMode}
                    isSelected={selectedMessageIds.includes(msg.id)}
                    onSelect={() => setSelectedMessageIds(current => current.includes(msg.id) ? current.filter(messageId => messageId !== msg.id) : [...current, msg.id])}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
          <div className="mt-6 space-y-4"><button type="button" onClick={addMessage} title="Add a new message" className="flex w-full items-center justify-center rounded-lg border border-[#444] bg-[#2d2d2d] px-6 py-2.5 text-[14px] font-bold text-white hover:bg-[#383838] shadow-md">+ Add Message</button></div>
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
