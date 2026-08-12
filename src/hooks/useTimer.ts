import { useState, useEffect, useRef, useCallback } from 'react';
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

  const [seconds, setSeconds] = useState<number>(() => {
    const saved = localStorage.getItem(secondsKey);
    return saved ? JSON.parse(saved) : DEFAULT_TIME;
  });
  const secondsRef = useRef(seconds);
  useEffect(() => { secondsRef.current = seconds; }, [seconds]);
  
  const [settings, setSettings] = useLocalStorage<TimerSettings>(settingsKey, DEFAULT_SETTINGS);
  const settingsRef = useRef(settings);
  useEffect(() => { settingsRef.current = settings; }, [settings]);
  const [log, setLog] = useLocalStorage<LogEntry[]>(logKey, []);
  const [selectedTimeZone, setSelectedTimeZone] = useLocalStorage<string>('stage-timer-global-timezone', Intl.DateTimeFormat().resolvedOptions().timeZone);
  const [now, setNow] = useState(new Date());

  const [syncState, setSyncState] = useState<SyncState>(() => {
    const saved = localStorage.getItem(syncKey);
    return saved ? JSON.parse(saved) : {
      startTime: null,
      initialSeconds: DEFAULT_TIME,
      isRunning: false,
      mode: 'countdown',
      lastUpdated: Date.now()
    };
  });

  const lastBeepsRef = useRef<{ halfTime: boolean; oneMinute: boolean; reach: boolean }>({
    halfTime: false,
    oneMinute: false,
    reach: false
  });

  const audioRef = useRef<{ beep: HTMLAudioElement } | null>(null);

  useEffect(() => {
    localStorage.setItem(syncKey, JSON.stringify(syncState));
  }, [syncState, syncKey]);

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
    const rounded = Math.floor(currentSeconds);
    if (Math.abs(currentSeconds - rounded) < 0.05) {
      if (audioRef.current && settings.beepOnReach && rounded === 0 && syncState.mode === 'countdown') {
        if (!lastBeepsRef.current.reach) {
          audioRef.current.beep.currentTime = 0;
          audioRef.current.beep.play().catch(() => {});
          lastBeepsRef.current.reach = true;
        }
      } else if (rounded !== 0) {
        lastBeepsRef.current.reach = false;
      }
    }
  }, [settings.beepOnReach, syncState.mode]);

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
    setSyncState(prev => ({
      ...prev,
      isRunning: false,
      startTime: null,
      initialSeconds: secondsRef.current,
      lastUpdated: Date.now()
    }));
  }, []);

  const resetTimer = useCallback(() => {
    setSyncState({
      startTime: null,
      initialSeconds: settingsRef.current.targetDuration,
      isRunning: false,
      mode: settingsRef.current.mode || 'countdown',
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
