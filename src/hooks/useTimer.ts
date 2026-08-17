import { useState, useEffect, useRef, useCallback } from 'react';
import { postSharedMessage, subscribeSharedChannel } from '../lib/sharedChannel';
import { readJsonStorage } from '../lib/storage';
import { useLocalStorage } from './useLocalStorage';

const DEFAULT_TIME = 0;
const DEFAULT_SETTINGS: TimerSettings = {
  title: 'Timer 1',
  speaker: '',
  notes: '',
  audioVolume: 0.5,
  beepOnReach: true,
  beepOnHalfTime: true,
  beepOnOneMinute: true,
  warningThreshold: 60,
  dangerThreshold: 0,
  historyLimit: 10,
  targetDuration: 0, // Default to 0:00 as requested
  mode: 'countdown',
  fontHeight: 1.6,
  fontWidth: 1.0,
  scheduledStart: null,
  segments: [
    { threshold: 60, color: '#f08c00' },
    { threshold: 10, color: '#fa5252' }
  ]
};

export type TimerMode = 'countdown' | 'countup' | 'time';

export interface ProgressSegment {
  threshold: number;
  color: string;
}

export interface TimerSettings {
  title: string;
  speaker: string;
  notes: string;
  audioVolume: number;
  beepOnReach: boolean;
  beepOnHalfTime: boolean;
  beepOnOneMinute: boolean;
  warningThreshold: number;
  dangerThreshold: number;
  historyLimit: number;
  targetDuration: number;
  mode: TimerMode;
  fontHeight: number;
  fontWidth: number;
  scheduledStart: number | null;
  segments: ProgressSegment[];
}

interface LogEntry {
  id: string;
  date: string;
  duration: number;
  mode: TimerMode;
  notes?: string;
}

export interface SyncState {
  startTime: number | null;
  initialSeconds: number;
  isRunning: boolean;
  mode: TimerMode;
  lastUpdated: number;
}

export const useTimer = (id: string = 'default') => {
  const secondsKey = `timerSeconds_${id}`;
  const settingsKey = `timerSettings_${id}`;
  const logKey = `timerLog_${id}`;
  const syncKey = `timerSync_${id}`;

  const [seconds, setSeconds] = useState<number>(() => readJsonStorage<number>(secondsKey, DEFAULT_TIME));
  const secondsRef = useRef(seconds);
  useEffect(() => { secondsRef.current = seconds; }, [seconds]);
  
  const [settings, setSettings] = useLocalStorage<TimerSettings>(settingsKey, DEFAULT_SETTINGS);
  const settingsRef = useRef(settings);
  useEffect(() => { settingsRef.current = settings; }, [settings]);
  const [log, setLog] = useLocalStorage<LogEntry[]>(logKey, []);
  const [selectedTimeZone, setSelectedTimeZone] = useLocalStorage<string>('stage-timer-global-timezone', Intl.DateTimeFormat().resolvedOptions().timeZone);
  const [now, setNow] = useState(new Date());

  const suppressSyncBroadcastRef = useRef(false);
  const syncStateRef = useRef<SyncState | null>(null);

  const [syncState, setSyncState] = useState<SyncState>(() => readJsonStorage<SyncState>(syncKey, {
    startTime: null,
    initialSeconds: settings.mode === 'countup' ? DEFAULT_TIME : settings.targetDuration,
    isRunning: false,
    mode: settings.mode || 'countdown',
    lastUpdated: Date.now()
  }));

  const lastBeepsRef = useRef<{ halfTime: boolean; oneMinute: boolean; reach: boolean }>({
    halfTime: false,
    oneMinute: false,
    reach: false
  });

  const audioRef = useRef<{ beep: HTMLAudioElement } | null>(null);

  useEffect(() => {
    const nextMode = settings.mode || 'countdown';
    const countupNeedsBaseline = nextMode === 'countup' && settings.targetDuration > 0 && syncState.initialSeconds === settings.targetDuration;
    if (syncState.mode !== nextMode || countupNeedsBaseline) {
      setSyncState(prev => ({
        ...prev,
        startTime: prev.isRunning ? Date.now() : null,
        initialSeconds: nextMode === 'countup' ? DEFAULT_TIME : settings.targetDuration,
        mode: nextMode,
        lastUpdated: Date.now(),
      }));
      return;
    }
    syncStateRef.current = syncState;
    localStorage.setItem(syncKey, JSON.stringify(syncState));
    if (suppressSyncBroadcastRef.current) {
      suppressSyncBroadcastRef.current = false;
    } else {
      postSharedMessage('stage-timer-control', {
        command: 'TIMER_STATE_CHANGED',
        targetId: id,
        payload: syncState,
      });
    }
  }, [id, settings.mode, settings.targetDuration, syncState, syncKey]);

  useEffect(() => subscribeSharedChannel('stage-timer-control', (event) => {
    const data = event.data;
    if (!data || data.command !== 'TIMER_STATE_CHANGED' || data.targetId !== id || !data.payload) return;
    const incoming = data.payload as SyncState;
    const current = syncStateRef.current;
    if (!current || (incoming.lastUpdated || 0) > (current.lastUpdated || 0)) {
      suppressSyncBroadcastRef.current = true;
      setSyncState(incoming);
    }
  }), [id]);

  useEffect(() => {
    const wallTimer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(wallTimer);
  }, []);

  useEffect(() => {
    const beep = new Audio(
      'data:audio/wav;base64,UklGRl9vT19XQVZLWW9tBhnwP/mBiJhAf3uP/APr/jD//3v/iL//4H//+//8L///kP/9/8D///rP/7n/9P//7v///8L'
    );
    beep.volume = settings.audioVolume;
    audioRef.current = { beep };
  }, [settings.audioVolume]);

  const formatTime = useCallback((secs: number, allowNegative = false): string => {
    const neg = allowNegative && secs < 0;
    const total = Math.max(0, Math.floor(Math.abs(secs)));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const s = total % 60;
    const padNum = (num: number): string => num.toString().padStart(2, '0');
    const base = hours > 0 ? `${hours}:${padNum(minutes)}:${padNum(s)}` : `${padNum(minutes)}:${padNum(s)}`;
    return neg ? `-${base}` : base;
  }, []);

  const formatDuration = useCallback((secs: number): string => {
    const total = Math.floor(secs);
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const s = total % 60;
    if (hours > 0) return `${hours}h ${minutes}m ${s}s`;
    if (minutes > 0) return `${minutes}m ${s}s`;
    return `${s}s`;
  }, []);

  const formatLogDate = useCallback((isoDate: string): string => {
    const date = new Date(isoDate);
    return date.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }, []);

  const checkWarnings = useCallback((currentSeconds: number) => {
    if (syncState.mode !== 'countdown') return;

    const playBeep = () => {
      if (!audioRef.current) return;
      audioRef.current.beep.currentTime = 0;
      audioRef.current.beep.play().catch(() => {});
    };
    const targetDuration = settings.targetDuration || 0;
    const halfTime = targetDuration / 2;
    const oneMinute = 60;

    if (settings.beepOnHalfTime && targetDuration > 0 && currentSeconds <= halfTime) {
      if (!lastBeepsRef.current.halfTime) {
        playBeep();
        lastBeepsRef.current.halfTime = true;
      }
    } else if (currentSeconds > halfTime) {
      lastBeepsRef.current.halfTime = false;
    }

    if (settings.beepOnOneMinute && targetDuration >= oneMinute && currentSeconds <= oneMinute) {
      if (!lastBeepsRef.current.oneMinute) {
        playBeep();
        lastBeepsRef.current.oneMinute = true;
      }
    } else if (currentSeconds > oneMinute) {
      lastBeepsRef.current.oneMinute = false;
    }

    const rounded = Math.floor(currentSeconds);
    if (Math.abs(currentSeconds - rounded) < 0.05 && audioRef.current && settings.beepOnReach && rounded === 0) {
      if (!lastBeepsRef.current.reach) {
        playBeep();
        lastBeepsRef.current.reach = true;
      }
    } else if (currentSeconds > 0) {
      lastBeepsRef.current.reach = false;
    }
  }, [settings.beepOnHalfTime, settings.beepOnOneMinute, settings.beepOnReach, settings.targetDuration, syncState.mode]);

  useEffect(() => {
    const tick = () => {
      const { isRunning, startTime, initialSeconds, mode } = syncState;
      let currentSeconds: number;
      if (!isRunning || startTime === null) {
        currentSeconds = initialSeconds;
      } else {
        const elapsed = (Date.now() - startTime) / 1000;
        if (mode === 'countdown') {
          currentSeconds = initialSeconds - elapsed;
        } else if (mode === 'countup') {
          currentSeconds = initialSeconds + elapsed;
        } else {
          currentSeconds = Date.now() / 1000;
        }
      }
      const rounded = Math.round(currentSeconds * 10) / 10;
      setSeconds(rounded);
      localStorage.setItem(secondsKey, JSON.stringify(rounded));
      checkWarnings(currentSeconds);
    };
    tick();
    const interval = setInterval(tick, 100);
    return () => clearInterval(interval);
  }, [syncState, secondsKey, checkWarnings]);

  const recordLog = useCallback(() => {
    const currentSettings = settingsRef.current;
    const currentSeconds = secondsRef.current;
    const currentSyncState = syncStateRef.current;
    if (!currentSyncState?.isRunning && currentSeconds === currentSettings.targetDuration) return;
    const duration = currentSettings.mode === 'countdown'
      ? Math.max(0, currentSettings.targetDuration - currentSeconds)
      : Math.max(0, currentSeconds);
    if (duration <= 0 || currentSettings.historyLimit <= 0) return;
    const entry: LogEntry = {
      id: `log_${typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now()}_${Math.random().toString(36).slice(2)}`}`,
      date: new Date().toISOString(),
      duration,
      mode: currentSettings.mode,
      notes: currentSettings.notes,
    };
    setLog(previous => [entry, ...previous].slice(0, Math.max(1, currentSettings.historyLimit)));
  }, [setLog]);

  const startTimer = useCallback(() => {
    setSyncState({
      startTime: Date.now(),
      initialSeconds: secondsRef.current,
      isRunning: true,
      mode: settingsRef.current.mode || 'countdown',
      lastUpdated: Date.now()
    });
  }, []);

  const pauseTimer = useCallback(() => {
    recordLog();
    setSyncState(prev => ({
      ...prev,
      isRunning: false,
      startTime: null,
      initialSeconds: secondsRef.current,
      lastUpdated: Date.now()
    }));
  }, [recordLog]);

  const resetTimer = useCallback(() => {
    recordLog();
    const mode = settingsRef.current.mode || 'countdown';
    setSyncState({
      startTime: null,
      initialSeconds: mode === 'countup' ? DEFAULT_TIME : settingsRef.current.targetDuration,
      isRunning: false,
      mode,
      lastUpdated: Date.now()
    });
    lastBeepsRef.current = { halfTime: false, oneMinute: false, reach: false };
  }, []);

  const setTime = useCallback((newTime: number) => {
    setSyncState(prev => ({
      ...prev,
      startTime: prev.isRunning ? Date.now() : null,
      initialSeconds: newTime,
      lastUpdated: Date.now()
    }));
  }, []);

  const updateSettings = useCallback((newSettings: Partial<TimerSettings>) => {
    setSettings(prev => ({ ...prev, ...newSettings }));
    if (newSettings.mode && newSettings.mode !== syncStateRef.current?.mode) {
      const nextMode = newSettings.mode;
      const nextDuration = Number(newSettings.targetDuration ?? settingsRef.current.targetDuration) || 0;
      setSyncState(prev => ({
        ...prev,
        startTime: prev.isRunning ? Date.now() : null,
        initialSeconds: nextMode === 'countup' ? DEFAULT_TIME : nextDuration,
        mode: nextMode,
        lastUpdated: Date.now(),
      }));
    }
  }, [setSettings]);

  const clearLog = useCallback(() => setLog([]), [setLog]);

  const wallClock = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true, timeZone: selectedTimeZone });
  const timeZone = selectedTimeZone.replace('_', ' ');
  const timeZoneOffset = new Intl.DateTimeFormat('en-US', { timeZoneName: 'shortOffset', timeZone: selectedTimeZone }).formatToParts(now).find(p => p.type === 'timeZoneName')?.value || '';

  const cueFinishDate = new Date(now.getTime() + seconds * 1000);
  const cueFinish = cueFinishDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true, timeZone: selectedTimeZone });
  const overUnder = seconds < 0 ? `+${formatTime(Math.abs(seconds))}` : `-${formatTime(seconds)}`;

  return {
    seconds,
    isRunning: syncState.isRunning,
    status: syncState.isRunning ? 'running' : (syncState.initialSeconds !== seconds ? 'paused' : 'idle'),
    settings,
    wallClock,
    timeZone: `${timeZone} (${timeZoneOffset})`,
    selectedTimeZone,
    setSelectedTimeZone,
    cueFinish,
    overUnder,
    setTime,
    startTimer,
    pauseTimer,
    resetTimer,
    updateSettings,
    log,
    clearLog,
    formatDuration,
    formatLogDate,
    DEFAULT_TIME,
    syncState
  };
};
