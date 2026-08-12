import { useEffect, useState, useCallback, useRef } from 'react';
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
const IconDownload = ({ className = "" }) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
);
const IconUpload = ({ className = "" }) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
);
const IconScreen = ({ className = "" }) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
);
const IconClock = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
);
const IconCalendar = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
);
const IconSpeaker = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
);
const IconFlash = ({ className = "" }) => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" className={className}><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
);
const IconCircle = () => (
  <svg width="8" height="8" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="10"/></svg>
);
const IconMore = ({ className = "" }) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className={className}><circle cx="12" cy="12" r="2"/><circle cx="5" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>
);
const IconMaximize = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>
);
const IconSquare = () => (
  <svg width="8" height="8" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="16" height="16" rx="1"/></svg>
);

interface TimeAdjustMenuProps {
  direction: 'decrease' | 'increase';
  onSelect: (seconds: number) => void;
  onClose: () => void;
}

const TimeAdjustMenu = ({ direction, onSelect, onClose }: TimeAdjustMenuProps) => {
  const options = direction === 'decrease' ? DECREASE_OPTIONS : INCREASE_OPTIONS;

  return (
    <div className={`absolute bottom-full z-50 mb-2 w-32 rounded-md border border-[#444] bg-[#242424] p-1 shadow-xl ${direction === 'decrease' ? 'left-0' : 'right-0'}`}>
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
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-lg border border-[#333] bg-[#1a1a1a] p-6 shadow-2xl custom-scrollbar" onClick={(e) => e.stopPropagation()}>
        <div className="mb-6 flex items-center justify-between border-b border-[#333] pb-4">
          <div className="flex items-center gap-3">
            <div className="rounded bg-[#2d2d2d] p-2 text-white"><IconSettings /></div>
            <h2 className="text-lg font-bold text-white">Settings for {settings.title || 'Timer 1'}</h2>
          </div>
          <button onClick={onClose} className="text-xl text-[#8a8a8a] hover:text-white">✕</button>
        </div>

        <div className="space-y-4">
          <div className="flex gap-4">
            <label className="w-20 text-[13px] text-[#8a8a8a] pt-2">Title</label>
            <input type="text" value={settings.title || 'Timer 1'} onChange={(e) => updateSettings({ title: e.target.value })} className="flex-1 rounded border border-[#333] bg-[#141414] px-3 py-2 text-[14px] text-white focus:border-[#444] focus:outline-none" />
          </div>
          <div className="flex gap-4">
            <label className="w-20 text-[13px] text-[#8a8a8a] pt-2">Speaker</label>
            <input type="text" placeholder="Speaker (optional)" value={settings.speaker || ''} onChange={(e) => updateSettings({ speaker: e.target.value })} className="flex-1 rounded border border-[#333] bg-[#141414] px-3 py-2 text-[14px] text-white focus:border-[#444] focus:outline-none" />
          </div>
          <div className="flex gap-4">
            <label className="w-20 text-[13px] text-[#8a8a8a] pt-2">Notes</label>
            <textarea placeholder="Notes (optional)" value={settings.notes || ''} onChange={(e) => updateSettings({ notes: e.target.value })} className="flex-1 h-24 rounded border border-[#333] bg-[#141414] px-3 py-2 text-[14px] text-white focus:border-[#444] focus:outline-none resize-none" />
          </div>
          <div className="flex gap-4"><label className="w-20 text-[13px] text-[#8a8a8a] pt-1">Labels</label><button className="rounded border border-[#333] bg-[#2d2d2d] px-3 py-1 text-[12px] text-white hover:bg-[#383838]">+ Add label</button></div>
        </div>

        <div className="my-8 border-t border-[#333]" />

        <div className="grid grid-cols-2 gap-12">
          <div className="space-y-4">
            <h3 className="text-[14px] font-bold text-white">Start</h3>
            <select className="w-full rounded border border-[#333] bg-[#141414] px-3 py-2 text-[14px] text-white focus:outline-none"><option>Manual</option></select>
            <div className="flex items-center justify-between gap-2"><span className="text-[12px] text-[#8a8a8a]">Time ⓘ</span><div className="flex flex-1 items-center justify-between rounded border border-[#333] bg-[#2d2d2d] px-3 py-1.5 text-[13px] text-[#8a8a8a]"><span>Select time</span><IconClock /></div></div>
            <div className="flex items-center justify-between gap-2"><span className="text-[12px] text-[#8a8a8a]">Date ⓘ</span><div className="flex flex-1 items-center justify-between rounded border border-[#333] bg-[#2d2d2d] px-3 py-1.5 text-[13px] text-[#8a8a8a]"><span>Select date</span><IconCalendar /></div></div>
            <p className="text-[11px] text-[#666]">No start time given. Triggered manually.</p>
          </div>
          <div className="space-y-4">
            <h3 className="text-[14px] font-bold text-white">Duration</h3>
            <select className="w-full rounded border border-[#333] bg-[#141414] px-3 py-2 text-[14px] text-white focus:outline-none"><option>Duration</option></select>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[12px] text-[#8a8a8a]">Duration ⓘ</span>
              <input 
                type="text" 
                value={formatHHMMSS(settings.targetDuration || 0)} 
                onChange={(e) => updateSettings({ targetDuration: parseHHMMSS(e.target.value) })}
                className="flex-1 rounded border border-[#333] bg-[#141414] px-3 py-1.5 text-[14px] font-mono text-white text-center focus:outline-none focus:border-[#555]"
              />
            </div>
            <div className="flex items-center justify-between gap-2"><span className="text-[12px] text-[#8a8a8a]">Appearance</span><select className="flex-1 rounded border border-[#333] bg-[#141414] px-3 py-1.5 text-[13px] text-white focus:outline-none"><option>Countdown</option></select></div>
            <div className="flex justify-end"><button className="text-[11px] text-[#4a9eff] hover:underline">Apply to all</button></div>
            <p className="text-[11px] text-[#666]">Counting down from {Math.floor((settings.targetDuration || 0) / 60)} mins.</p>
          </div>
        </div>

        <div className="my-8 border-t border-[#333]" />

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2"><h3 className="text-[14px] font-bold text-white">Wrap-up times & actions</h3><span className="text-[12px] text-[#666]">ⓘ Chimes caveats</span></div>
            <button className="rounded border border-[#333] bg-[#2d2d2d] px-3 py-1 text-[12px] text-[#8a8a8a] hover:text-white">Actions <IconChevronDown /></button>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-[#333]"><div className="flex h-full w-full"><div className="h-full w-[80%] bg-[#22c55e]" /><div className="h-full w-[15%] bg-[#f08c00]" /><div className="h-full w-[5%] bg-[#fa5252]" /></div></div>
          <div className="space-y-6 pt-2">
            <div className="flex items-center gap-4"><div className="h-3 w-3 rounded-full bg-[#22c55e]" /><span className="w-16 text-[13px] text-[#8a8a8a]">Start</span><select className="w-32 rounded border border-[#333] bg-[#141414] px-2 py-1 text-[12px] text-[#8a8a8a]"><option>None</option></select><button className="text-[#8a8a8a]"><IconSpeaker /></button><select className="rounded border border-[#333] bg-[#141414] px-2 py-1 text-[12px] text-[#8a8a8a]"><option>Flash ×0 ▾</option></select></div>
            <div className="flex items-center gap-4"><div className="h-3 w-3 rounded-full bg-[#f08c00]" /><span className="w-16 text-[13px] text-white">Yellow</span><input type="text" value={formatMMSS(yellowSegment.threshold)} onChange={(e) => { const val = parseMMSS(e.target.value); const newSegments = settings.segments.map((s: any) => s.color === '#f08c00' ? { ...s, threshold: val } : s); updateSettings({ segments: newSegments }); }} className="w-24 rounded border border-[#333] bg-[#141414] px-2 py-1 text-center font-mono text-[14px] text-white focus:outline-none" /><select className="w-32 rounded border border-[#333] bg-[#141414] px-2 py-1 text-[12px] text-white focus:outline-none"><option>None</option></select><button className="text-[#8a8a8a]"><IconSpeaker /></button><select className="rounded border border-[#333] bg-[#141414] px-2 py-1 text-[12px] text-[#8a8a8a]"><option>Flash ×0 ▾</option></select></div>
            <div className="flex items-center gap-4"><div className="h-3 w-3 rounded-full bg-[#fa5252]" /><span className="w-16 text-[13px] text-white">Red</span><input type="text" value={formatMMSS(redSegment.threshold)} onChange={(e) => { const val = parseMMSS(e.target.value); const newSegments = settings.segments.map((s: any) => s.color === '#fa5252' ? { ...s, threshold: val } : s); updateSettings({ segments: newSegments }); }} className="w-24 rounded border border-[#333] bg-[#141414] px-2 py-1 text-center font-mono text-[14px] text-white focus:outline-none" /><select className="w-32 rounded border border-[#333] bg-[#141414] px-2 py-1 text-[12px] text-white focus:outline-none"><option>None</option></select><button className="text-[#8a8a8a]"><IconSpeaker /></button><select className="rounded border border-[#333] bg-[#141414] px-2 py-1 text-[12px] text-[#8a8a8a]"><option>Flash ×0 ▾</option></select></div>
            <div className="flex items-center gap-4"><div className="h-3 w-3 rounded-full bg-[#666]" /><span className="w-16 text-[13px] text-[#8a8a8a]">0:00</span><select className="ml-[108px] w-32 rounded border border-[#333] bg-[#141414] px-2 py-1 text-[12px] text-[#8a8a8a]"><option>None</option></select><button className="text-[#8a8a8a]"><IconSpeaker /></button><select className="rounded border border-[#333] bg-[#141414] px-2 py-1 text-[12px] text-[#8a8a8a]"><option>Flash ×0 ▾</option></select></div>
          </div>
        </div>

        <div className="mt-12 flex gap-4"><button onClick={onClose} className="flex-1 rounded border border-[#333] bg-[#2d2d2d] py-3 text-[14px] font-bold text-white hover:bg-[#383838]">Cancel</button><button onClick={onClose} className="flex-1 rounded border border-[#228b3a] bg-[#141414] py-3 text-[14px] font-bold text-[#22c55e] hover:bg-[#1a1a1a]">Confirm</button></div>
      </div>
    </div>
  );
};

interface TimerRowProps {
  id: string;
  index: number;
  isActive: boolean;
  onActivate: () => void;
  onSync: (state: any) => void;
  onAddAbove: () => void;
  onAddBelow: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}

const TimerRow = ({ id, index, isActive, onActivate, onSync, onAddAbove, onAddBelow, onDuplicate, onDelete }: TimerRowProps) => {
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
  const [isActionsOpen, setIsActionsOpen] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const currentTime = formatClock(seconds);

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });

  const style = { transform: CSS.Transform.toString(transform), transition, zIndex: isDragging || isActionsOpen || isSettingsOpen ? 100 : 1, position: 'relative' as const };

  useEffect(() => {
    const channel = new BroadcastChannel(CONTROL_CHANNEL);
    channel.onmessage = (event) => {
      const { targetId, command, payload } = event.data;
      if (targetId === id) {
        switch (command) {
          case 'START': startTimer(); break;
          case 'PAUSE': pauseTimer(); break;
          case 'RESET': resetTimer(); break;
          case 'ADJUST': setTime(Math.max(0, seconds + payload)); break;
          case 'SET': setTime(payload); break;
        }
      }
    };
    return () => channel.close();
  }, [id, startTimer, pauseTimer, resetTimer, setTime, seconds]);

  useEffect(() => {
    if (isActive) {
      onSync({ seconds, isRunning, settings, syncState, DEFAULT_TIME });
    }
  }, [isActive, seconds, isRunning, settings, syncState, DEFAULT_TIME, onSync]);

  return (
    <div ref={setNodeRef} style={style} onClick={onActivate} onMouseEnter={() => setIsHovered(true)} onMouseLeave={() => setIsHovered(false)} className={`flex items-center gap-4 rounded-lg px-6 py-5 text-white shadow-2xl transition-all cursor-pointer ${isRunning ? 'bg-[#991b1b]' : isActive ? 'bg-[#2546c9]' : 'bg-[#2d2d2d] hover:bg-[#383838]'} ${isDragging ? 'opacity-50' : ''}`}>
      <div {...attributes} {...listeners} className="flex w-8 items-center justify-center text-[18px] font-bold opacity-80 cursor-grab active:cursor-grabbing -ml-2">{isHovered || isDragging ? <span className="text-[28px] font-light leading-none tracking-tighter">=</span> : index + 1}</div>
      <div className="text-[15px] font-bold opacity-60 border-b border-dotted border-white/40">Add time</div>
      <div className="mx-auto text-center text-[32px] font-bold tracking-tight tabular-nums">{currentTime}</div>
      <div className="text-[17px] font-bold truncate max-w-[150px]">{settings.title || `Timer ${index + 1}`}</div>
      <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
        <button type="button" onClick={resetTimer} className="flex h-10 w-11 items-center justify-center rounded border border-white/20 bg-white/10 hover:bg-white/20" title="Reset to assigned time"><IconSkipBack /></button>
        <button type="button" onClick={() => setIsSettingsOpen(true)} className="flex h-10 w-11 items-center justify-center rounded border border-white/20 bg-white/10 hover:bg-white/20"><IconSettings /></button>
        <button type="button" onClick={isRunning ? pauseTimer : startTimer} className="flex h-10 w-14 items-center justify-center rounded bg-[#228b3a] hover:bg-[#2aa346] shadow-lg transition-colors">{isRunning ? <IconPause /> : <IconPlay />}</button>
        
        <div className="relative">
          <button type="button" onClick={() => setIsActionsOpen(!isActionsOpen)} className="flex h-10 w-11 items-center justify-center text-white/60 hover:text-white transition-colors"><IconMore /></button>
          {isActionsOpen && (
            <div className="absolute right-0 top-full z-50 mt-2 w-48 rounded-md border border-[#444] bg-[#242424] p-1 shadow-2xl">
              <button onClick={() => { onAddAbove(); setIsActionsOpen(false); }} className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-[13px] text-white hover:bg-[#383838]"><span>↑</span> Add timer above</button>
              <button onClick={() => { onAddBelow(); setIsActionsOpen(false); }} className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-[13px] text-white hover:bg-[#383838]"><span>↓</span> Add timer below</button>
              <button onClick={() => { onDuplicate(); setIsActionsOpen(false); }} className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-[13px] text-white hover:bg-[#383838]">Duplicate</button>
              <div className="my-1 border-t border-[#333]" />
              <button onClick={() => { onDelete(); setIsActionsOpen(false); }} className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-[13px] text-[#fa5252] hover:bg-red-500/10">Delete</button>
            </div>
          )}
        </div>
      </div>
      <TimerSettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} settings={settings} updateSettings={updateSettings} />
    </div>
  );
};

interface Room {
  id: string;
  name: string;
  timerIds: string[];
  activeTimerId: string;
  messages: Array<{ id: string; text: string; color: string; }>;
}

function App() {
  const [rooms, setRooms] = useLocalStorage<Room[]>('stage-timer-rooms', []);
  const [currentRoomName, setCurrentRoomName] = useLocalStorage<string>('stage-timer-current-name', 'Unnamed');
  const [timerIds, setTimerIds] = useLocalStorage<string[]>('stage-timer-timer-ids', []);
  const [activeTimerId, setActiveTimerId] = useLocalStorage<string>('stage-timer-active-id', '');
  const [messages, setMessages] = useLocalStorage<any[]>('stage-timer-messages', [{ id: '1', text: '', color: '#ffffff' }]);
  const [activeTimerState, setActiveTimerState] = useState<any>(null);
  const [isRoomMenuOpen, setIsRoomMenuOpen] = useState(false);
  const [isTimersMenuOpen, setIsTimersMenuOpen] = useState(false);
  const [isTimeZoneMenuOpen, setIsTimeZoneMenuOpen] = useState(false);
  const [openAdjustMenu, setOpenAdjustMenu] = useState<'decrease' | 'increase' | null>(null);
  const [isBlackout, setIsBlackout] = useState(false);
  const [isFlash, setIsFlash] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    setActiveTimerId(newId);
  };

  const deleteTimer = (id: string) => {
    const newIds = timerIds.filter(tid => tid !== id);
    setTimerIds(newIds);
    if (newIds.length === 0) {
      setActiveTimerId('');
      setActiveTimerState(null);
    } else if (activeTimerId === id) {
      setActiveTimerId(newIds[0]);
    }
  };

  const deleteAllTimers = () => {
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
    setCurrentRoomName(room.name);
    setTimerIds(room.timerIds || []);
    setActiveTimerId(room.activeTimerId || (room.timerIds?.[0] || ''));
    setMessages(room.messages || [{ id: '1', text: '', color: '#ffffff' }]);
    setIsRoomMenuOpen(false);
  }, [setCurrentRoomName, setTimerIds, setActiveTimerId, setMessages]);

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
        totalTime: activeTimerState.settings.targetDuration || activeTimerState.DEFAULT_TIME, 
        segments: activeTimerState.settings.segments,
        blackout: isBlackout,
        flash: isFlash,
        isEmpty: false
      });
    } else if (timerIds.length === 0) {
      syncOutput({ 
        isEmpty: true,
        blackout: isBlackout,
        flash: isFlash
      });
    }
  }, [activeTimerId, activeTimerState, syncOutput, isBlackout, isFlash, timerIds.length]);

  const openOutput = () => {
    if (activeTimerId && activeTimerState) {
      syncOutput({ 
        ...activeTimerState.syncState,
        totalTime: activeTimerState.settings.targetDuration || activeTimerState.DEFAULT_TIME, 
        segments: activeTimerState.settings.segments,
        blackout: isBlackout,
        flash: isFlash,
        type: 'force-sync',
        isEmpty: false
      });
    } else if (timerIds.length === 0) {
      syncOutput({ 
        isEmpty: true,
        blackout: isBlackout,
        flash: isFlash,
        type: 'force-sync'
      });
    }
    window.open('/output', '_blank');
  };

  const handleFlash = () => { setIsFlash(true); setTimeout(() => setIsFlash(false), 600); };
  const updateMessage = (id: string, text: string) => setMessages(prev => prev.map(m => m.id === id ? { ...m, text } : m));
  const addMessage = () => setMessages(prev => [...prev, { id: Date.now().toString(), text: '', color: '#ffffff' }]);

  const currentTime = activeTimerState ? formatClock(activeTimerState.seconds) : '--:--';
  const displaySeconds = activeTimerState ? activeTimerState.seconds : 0;
  const displaySettings = activeTimerState ? activeTimerState.settings : { title: 'No Active Timer', segments: [] };

  const { wallClock, timeZone, selectedTimeZone, setSelectedTimeZone, cueFinish, overUnder } = useTimer('global-helper');

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
          <div className="relative">
            <button type="button" onClick={() => setIsRoomMenuOpen(!isRoomMenuOpen)} className="flex h-9 items-center gap-2 rounded-md bg-[#2d2d2d] px-4 text-[13px] text-white hover:bg-[#383838]">Room <IconChevronDown /></button>
            {isRoomMenuOpen && (
              <div className="absolute right-0 top-full z-50 mt-1 w-64 rounded-md border border-[#444] bg-[#242424] p-1 shadow-xl">
                <div className="px-2 py-1.5 text-[10px] uppercase tracking-wide text-[#777]">Saved Rooms</div>
                {rooms.map((room) => (
                  <div key={room.id} onClick={() => loadRoom(room)} className="group flex items-center justify-between rounded px-2 py-2 text-left text-[13px] text-white hover:bg-[#383838] cursor-pointer">
                    <span className="truncate">{room.name}</span>
                    <button onClick={(e) => { e.stopPropagation(); setRooms(rooms.filter(r => r.id !== room.id)); }} className="opacity-0 group-hover:opacity-100 text-[#fa5252] hover:text-red-400 p-1">✕</button>
                  </div>
                ))}
                <div className="mt-1 border-t border-[#333] pt-1"><button onClick={() => { setCurrentRoomName('New Room'); setIsRoomMenuOpen(false); }} className="w-full rounded px-2 py-2 text-left text-[12px] text-[#22c55e] hover:bg-[#383838]">+ Create New Room</button></div>
              </div>
            )}
          </div>
          <input type="file" ref={fileInputRef} onChange={(e) => { const file = e.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = (event) => { try { const imported = JSON.parse(event.target?.result as string); if (imported.rooms && Array.isArray(imported.rooms)) { setRooms(imported.rooms); if (imported.activeRoomName) { const activeRoom = imported.rooms.find((r: Room) => r.name === imported.activeRoomName); if (activeRoom) loadRoom(activeRoom); } } } catch (err) { console.error(err); } }; reader.readAsText(file); e.target.value = ''; }} accept=".json" className="hidden" />
          <button type="button" onClick={() => fileInputRef.current?.click()} className="flex h-9 items-center gap-2 rounded-md border border-[#444] bg-[#2d2d2d] px-4 text-[13px] text-white hover:bg-[#383838]"><IconUpload className="mr-1" /> Import</button>
          <button type="button" onClick={() => { const exportData = { rooms: [...rooms, { id: Date.now().toString(), name: currentRoomName, timerIds, activeTimerId, messages }], activeRoomName: currentRoomName, exportedAt: new Date().toISOString() }; const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `stage-timer-backup-${new Date().toISOString().split('T')[0]}.json`; link.click(); URL.revokeObjectURL(url); }} className="flex h-9 items-center gap-2 rounded-md border border-[#444] bg-[#2d2d2d] px-4 text-[13px] text-white hover:bg-[#383838]"><IconDownload className="mr-1" /> Export</button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <aside className="flex w-[420px] flex-col border-r border-[#333] px-4 py-3">
          <div className="mb-3 flex items-center justify-between"><h2 className="text-[17px] font-bold text-white">Dashboard</h2><button type="button" onClick={openOutput} className="flex h-8 items-center gap-2 rounded-md border border-[#444] bg-[#2d2d2d] px-3 text-[12px] text-white hover:bg-[#383838]"><IconScreen className="mr-1" /> Output Links</button></div>
          <div className={`relative rounded-lg border border-[#333] bg-[#141414] p-4 shadow-xl transition-all duration-300 ${isFlash ? 'bg-white' : ''}`}>
            {isBlackout && <div className="absolute inset-0 z-10 rounded-lg bg-black" />}
            <div className="flex items-center justify-center text-[12px]"><span className="font-bold text-[#7eb8ff]">{displaySettings.title}</span></div>
            <div className="digit mt-2 text-center text-[110px] font-bold leading-none tracking-tighter" style={{ color: !activeTimerId ? '#333' : displaySeconds <= 0 ? '#fa5252' : isFlash ? '#000000' : '#ffffff' }}>{currentTime}</div>
            {activeTimerId && <ProgressBar currentSeconds={displaySeconds} totalSeconds={activeTimerState?.settings.targetDuration || 600} segments={displaySettings.segments} height="h-6" className="mt-3 rounded-sm" />}
          </div>

          {activeTimerId && (
            <>
              <div className="mt-4 flex items-center gap-4 text-[13px]">
                <span className="inline-block rounded border border-[#333] px-2 py-[2px] text-[10px] font-bold tracking-wider text-[#8a8a8a]">ON AIR</span>
                <div className="flex items-center gap-2 text-white">
                  <div className="h-2 w-2 rounded-full bg-[#444]"></div>
                  <span className="font-mono text-[15px]" style={{ color: isFlash ? '#000' : '#fff' }}>
                    {currentTime}.{Math.floor((displaySeconds % 1) * 10)}
                  </span>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-4 gap-[1px] overflow-hidden rounded-sm border border-[#2a2a2a] text-[11px] bg-[#2a2a2a]">
                {[1, 0.75, 0.5, 0.25].map((factor, i) => {
                  const targetTime = (activeTimerState?.settings.targetDuration || 0) * factor;
                  return (
                    <div 
                      key={i}
                      onClick={() => sendControl('SET', targetTime)}
                      className="bg-[#1c1c1c] p-2 text-left text-[#8a8a8a] border-r border-[#2a2a2a] last:border-r-0 hover:bg-[#252525] hover:text-white transition-colors cursor-pointer"
                    >
                      {formatClock(targetTime)}
                    </div>
                  );
                })}
              </div>
              <ProgressBar currentSeconds={displaySeconds} totalSeconds={activeTimerState?.settings.targetDuration || 600} segments={displaySettings.segments} height="h-1.5" className="mt-1 border-none rounded-b-sm" />
            </>
          )}
          <div className="mt-4 grid grid-cols-7 gap-2">
            <div className="relative">
              <button type="button" onClick={() => setOpenAdjustMenu(openAdjustMenu === 'decrease' ? null : 'decrease')} className={`flex h-10 w-full items-center justify-center rounded border border-[#333] bg-[#2d2d2d] hover:bg-[#383838] transition-colors ${openAdjustMenu === 'decrease' ? 'bg-[#383838] border-[#555]' : ''}`}><IconChevronDown /></button>
              {openAdjustMenu === 'decrease' && (<TimeAdjustMenu direction="decrease" onSelect={(secs) => sendControl('ADJUST', secs)} onClose={() => setOpenAdjustMenu(null)} />)}
            </div>
            <button onClick={() => sendControl('ADJUST', -60)} className="col-span-1 flex h-10 items-center justify-center rounded border border-[#333] bg-[#2d2d2d] text-[14px] font-bold hover:bg-[#383838] transition-colors">-1m</button>
            <button onClick={() => sendControl('ADJUST', -5)} className="col-span-1 flex h-10 items-center justify-center rounded border border-[#333] bg-[#2d2d2d] hover:bg-[#383838] transition-colors"><IconSkipBack /></button>
            <button onClick={() => sendControl(activeTimerState?.isRunning ? 'PAUSE' : 'START')} className="col-span-1 flex h-10 items-center justify-center rounded border border-[#333] bg-[#2d2d2d] hover:bg-[#383838] transition-colors">{activeTimerState?.isRunning ? <IconPause /> : <IconPlay className="text-[#22c55e]" />}</button>
            <button onClick={() => sendControl('ADJUST', 5)} className="col-span-1 flex h-10 items-center justify-center rounded border border-[#333] bg-[#2d2d2d] hover:bg-[#383838] transition-colors"><IconSkipForward /></button>
            <button onClick={() => sendControl('ADJUST', 60)} className="col-span-1 flex h-10 items-center justify-center rounded border border-[#333] bg-[#2d2d2d] text-[14px] font-bold hover:bg-[#383838] transition-colors">+1m</button>
            <div className="relative">
              <button type="button" onClick={() => setOpenAdjustMenu(openAdjustMenu === 'increase' ? null : 'increase')} className={`flex h-10 w-full items-center justify-center rounded border border-[#333] bg-[#2d2d2d] hover:bg-[#383838] transition-colors ${openAdjustMenu === 'increase' ? 'bg-[#383838] border-[#555]' : ''}`}><IconChevronDown /></button>
              {openAdjustMenu === 'increase' && (<TimeAdjustMenu direction="increase" onSelect={(secs) => sendControl('ADJUST', secs)} onClose={() => setOpenAdjustMenu(null)} />)}
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
                  onClick={() => setIsTimeZoneMenuOpen(!isTimeZoneMenuOpen)}
                  title="Click to change timezone"
                >
                  <span>{timeZone}</span>
                  <IconChevronDown />
                </button>
                {isTimeZoneMenuOpen && (
                  <div className="absolute bottom-full left-1/2 z-50 mb-2 max-h-64 w-64 -translate-x-1/2 overflow-y-auto rounded-md border border-[#444] bg-[#242424] p-1 shadow-xl custom-scrollbar">
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
          <div className="mt-4 grid grid-cols-2 gap-4 text-center"><div className="flex flex-col items-center"><span className="text-[12px] uppercase tracking-wider text-[#8a8a8a]">Cue finish</span><span className="mt-1 text-[15px] font-bold text-white">{activeTimerId ? cueFinish : '--:--'}</span></div><div className="flex flex-col items-center"><span className="text-[12px] uppercase tracking-wider text-[#8a8a8a]">Over/Under</span><span className="mt-1 text-[15px] font-bold text-white">{activeTimerId ? overUnder : '--:--'}</span></div></div>
        </aside>

        <main className="flex flex-1 flex-col px-8 py-4 bg-[#141414] overflow-y-auto custom-scrollbar">
          <div className="mb-6 flex items-center justify-between"><div className="flex items-center gap-4"><h2 className="text-[20px] font-bold text-white">Timers</h2><span className="text-[14px] text-[#8a8a8a] cursor-pointer">Select</span></div><div className="flex items-center gap-2"><button type="button" onClick={() => setIsBlackout(!isBlackout)} className={`flex h-9 items-center gap-2 rounded-md border px-4 text-[13px] transition-colors ${isBlackout ? 'bg-white text-black border-white' : 'bg-[#2d2d2d] text-white border-[#444]'}`}><IconCircle /> Blackout</button><button type="button" onClick={handleFlash} className="flex h-9 items-center gap-2 rounded-md border border-[#444] bg-[#2d2d2d] px-4 text-[13px] text-white hover:bg-[#383838]"><IconFlash /> Flash</button><div className="relative">
                <button 
                  type="button" 
                  onClick={() => setIsTimersMenuOpen(!isTimersMenuOpen)}
                  className={`flex h-9 items-center justify-center rounded-md border border-[#444] bg-[#2d2d2d] px-3 text-[13px] text-white hover:bg-[#383838] transition-colors ${isTimersMenuOpen ? 'bg-[#383838] border-[#555]' : ''}`}
                >
                  <IconMore />
                </button>
                {isTimersMenuOpen && (
                  <div className="absolute right-0 top-full z-50 mt-1 w-48 rounded-md border border-[#444] bg-[#242424] p-1 shadow-xl">
                    <button 
                      onClick={deleteAllTimers}
                      className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-[13px] text-[#fa5252] hover:bg-red-500/10"
                    >
                      Delete all timers
                    </button>
                  </div>
                )}
              </div></div></div>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd} modifiers={[restrictToVerticalAxis]}><SortableContext items={timerIds} strategy={verticalListSortingStrategy}><div className="space-y-4">{timerIds.map((id, index) => (<TimerRow key={id} id={id} index={index} isActive={activeTimerId === id} onActivate={() => setActiveTimerId(id)} onSync={setActiveTimerState} onAddAbove={() => addTimer(index)} onAddBelow={() => addTimer(index + 1)} onDuplicate={() => duplicateTimer(id, index)} onDelete={() => deleteTimer(id)} />))}</div></SortableContext></DndContext>
          <div className="mt-8 flex justify-center"><button type="button" onClick={() => addTimer()} className="flex items-center gap-2 rounded-lg border border-[#444] bg-[#2d2d2d] px-8 py-3 text-[15px] font-bold text-white hover:bg-[#383838] transition-all shadow-lg">+ Add Timer</button></div>
        </main>

        <aside className="flex w-[380px] flex-col border-l border-[#333] px-4 py-3">
          <div className="mb-4 flex items-center justify-between"><div className="flex items-center gap-4"><h2 className="text-[17px] font-bold text-white">Messages</h2><span className="text-[14px] text-[#8a8a8a] cursor-pointer">Select</span></div><button type="button" onClick={handleFlash} className="flex h-8 items-center gap-2 rounded-md border border-[#444] bg-[#2d2d2d] px-3 text-[12px] text-white hover:bg-[#383838]"><IconFlash /> Flash</button></div>
          <div className="space-y-3 overflow-y-auto custom-scrollbar pr-1">{messages.map((msg) => (<div key={msg.id} className="rounded-lg border border-[#333] bg-[#2d2d2d] p-4 shadow-lg"><div className="flex gap-3"><span className="text-[14px] font-bold text-[#8a8a8a] pt-1">1</span><input type="text" value={msg.text} onChange={(e) => updateMessage(msg.id, e.target.value)} placeholder="Enter message ..." className="flex-1 bg-[#1c1c1c] border border-[#444] rounded-md p-2.5 text-[14px] text-white outline-none focus:border-[#555]" /></div><div className="mt-4 flex items-center justify-between border-b border-[#444] pb-2"><div className="flex gap-4">{['A', 'A', 'A', 'B', 'āA'].map((tag, i) => (<button key={i} type="button" className="pb-1 text-[15px] font-bold transition-all border-b-2" style={{ color: i === 1 ? '#22c55e' : i === 2 ? '#fa5252' : '#ffffff', borderColor: i === 1 ? '#22c55e' : i === 2 ? '#fa5252' : '#ffffff' }}>{tag}</button>))}</div></div><div className="mt-4 flex justify-end gap-2"><button type="button" className="rounded-md border border-[#444] bg-[#1c1c1c] px-5 py-1.5 text-[13px] font-bold text-white hover:bg-[#252525]">Show</button><button type="button" className="flex items-center justify-center rounded-md border border-[#444] bg-[#1c1c1c] px-3 py-1.5 text-[13px] text-white"><IconMaximize /></button></div></div>))}</div>
          <div className="mt-6 space-y-4"><button type="button" onClick={addMessage} className="flex w-full items-center justify-center rounded-lg border border-[#444] bg-[#2d2d2d] px-6 py-2.5 text-[14px] font-bold text-white hover:bg-[#383838] shadow-md">+ Add Message</button><div className="text-center text-[13px] text-[#666] cursor-pointer hover:text-[#888]">Submit questions link</div></div>
        </aside>
      </div>

      <footer className="flex items-center justify-between border-t border-[#333] bg-[#1a1a1a] px-4 py-2 text-[11px] text-[#666]">
        <div className="flex items-center gap-4"><span className="hover:text-[#888] cursor-pointer font-medium">v3.5.9 · Docs</span><span><IconSquare /> 395 ms</span></div>
        <div className="flex flex-1 max-w-[50%] items-center gap-4 px-12"><span>0:00</span><div className="group relative flex-1"><div className="absolute inset-0 flex items-center"><div className="h-1 w-full rounded-full bg-[#333]"></div></div><div className="relative flex h-4 items-center"><div className="h-4 w-4 rounded-full bg-[#3b82f6] shadow-lg cursor-pointer hover:scale-110 transition-transform"></div></div></div><span>-10:00</span></div>
      </footer>
    </div>
  );
}

export default App;
