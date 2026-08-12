import { useState, useEffect, useRef, useCallback } from 'react';
import { useLocalStorage } from './useLocalStorage';

const DEFAULT_TIME = 5 * 60; // 5 minutes
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
  segments: [
    { threshold: 60, color: '#f08c00' }, // Warning: Orange
    { threshold: 10, color: '#fa5252' }  // Danger: Red
  ]
};

export type TimerMode = 'countdown' | 'countup' | 'time';

export interface ProgressSegment {
  threshold: number; // seconds
  color: string;
}

interface TimerSettings {
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
  segments: ProgressSegment[];
}

interface LogEntry {
  id: string;
  date: string;
  duration: number;
  mode: TimerMode;
  notes?: string;
}

export const useTimer = () => {
  // Use regular state for seconds during active playback to avoid localStorage overhead every 100ms
  const [seconds, setSeconds] = useState<number>(() => {
    const saved = localStorage.getItem('timerSeconds');
    return saved ? JSON.parse(saved) : DEFAULT_TIME;
  });
  
  const [mode, setMode] = useState<TimerMode>('countdown');
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [status, setStatus] = useState<'idle' | 'running' | 'paused' | 'finished'>('idle');
  const [settings, setSettings] = useLocalStorage<TimerSettings>('timerSettings', DEFAULT_SETTINGS);
  const [log, setLog] = useLocalStorage<LogEntry[]>('timerLog', []);
  const [now, setNow] = useState(new Date());

  const intervalRef = useRef<number | null>(null);
  const audioRef = useRef<{ beep: HTMLAudioElement } | null>(null);
  const lastBeepsRef = useRef<{ halfTime: boolean; oneMinute: boolean; reach: boolean }>({
    halfTime: false,
    oneMinute: false,
    reach: false
  });

  // Periodically save seconds to localStorage (less frequently than 100ms)
  useEffect(() => {
    const saveInterval = setInterval(() => {
      localStorage.setItem('timerSeconds', JSON.stringify(seconds));
    }, 1000);
    return () => clearInterval(saveInterval);
  }, [seconds]);

  useEffect(() => {
    const wallTimer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(wallTimer);
  }, []);

  // Initialize audio
  useEffect(() => {
    const beep = new Audio(
      'data:audio/wav;base64,UklGRl9vT19XQVZLWW9tBhnwP/mBiJhAf3uP/APr/jD//3v/iL//4H//+//8L///kP/9/8D///rP/7n/9P//7v///8L'
    );
    beep.volume = settings.audioVolume;
    audioRef.current = { beep };
  }, [settings.audioVolume]);

  const formatTime = useCallback((secs: number): string => {
    const total = Math.max(0, Math.floor(secs));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const s = total % 60;
    const padNum = (num: number): string => num.toString().padStart(2, '0');

    if (hours > 0) {
      return `${hours}:${padNum(minutes)}:${padNum(s)}`;
    }
    return `${padNum(minutes)}:${padNum(s)}`;
  }, []);

  const formatTimeOfDay = useCallback((secs: number): string => {
    const date = new Date(secs * 1000);
    const hours = date.getHours();
    const minutes = date.getMinutes();
    const s = date.getSeconds();
    const padNum = (num: number): string => num.toString().padStart(2, '0');
    return `${padNum(hours)}:${padNum(minutes)}:${padNum(s)}`;
  }, []);

  const getDisplayValue = useCallback((): string => {
    if (mode === 'time') {
      return formatTimeOfDay(seconds);
    }
    return formatTime(seconds);
  }, [mode, seconds, formatTimeOfDay, formatTime]);

  const checkWarnings = useCallback((currentSeconds: number): string[] => {
    const newWarnings: string[] = [];
    const rounded = Math.floor(currentSeconds);

    if (mode === 'countdown') {
      if (rounded <= settings.warningThreshold && rounded > 0) {
        newWarnings.push('warning');
      }
      if (rounded <= 0) {
        newWarnings.push('danger');
      }
    }

    // Beep logic
    if (Math.abs(currentSeconds - rounded) < 0.05) {
      if (audioRef.current && settings.beepOnReach && rounded === 0 && mode === 'countdown') {
        if (!lastBeepsRef.current.reach) {
          audioRef.current.beep.currentTime = 0;
          audioRef.current.beep.play().catch(() => {});
          lastBeepsRef.current.reach = true;
        }
      } else if (rounded !== 0) {
        lastBeepsRef.current.reach = false;
      }
    }

    return newWarnings;
  }, [mode, settings.warningThreshold, settings.beepOnReach]);

  const getColorClass = useCallback((): string => {
    const rounded = Math.floor(seconds);
    if (status === 'finished' || (mode === 'countdown' && rounded <= 0)) {
      return '#fa5252';
    }
    if (mode === 'countdown') {
      const sortedSegments = [...settings.segments].sort((a, b) => a.threshold - b.threshold);
      for (const segment of sortedSegments) {
        if (rounded <= segment.threshold) {
          return segment.color;
        }
      }
    }
    return '#22c55e';
  }, [mode, seconds, status, settings.segments]);

  const [warningState, setWarningState] = useState<string[]>([]);

  const startTimer = useCallback(() => {
    // If starting at 0, don't just stop immediately if it's meant to be a countdown from somewhere
    // But if the user explicitly set it to 0, we'll allow it to run/stop based on mode
    setStatus('running');
    setIsRunning(true);

    if (intervalRef.current) clearInterval(intervalRef.current);
    
    intervalRef.current = window.setInterval(() => {
      setSeconds(prev => {
        let newTime: number;

        if (mode === 'countdown') {
          newTime = prev - 0.1;
          if (newTime <= 0) {
            newTime = 0;
            setStatus('finished');
            setIsRunning(false);
            if (intervalRef.current) clearInterval(intervalRef.current);
          }
        } else if (mode === 'countup') {
          newTime = prev + 0.1;
        } else {
          newTime = Date.now() / 1000;
        }

        const newWarnings = checkWarnings(newTime);
        setWarningState(newWarnings);
        return Math.round(newTime * 10) / 10;
      });
    }, 100);
  }, [mode, checkWarnings]);

  const pauseTimer = useCallback(() => {
    setIsRunning(false);
    setStatus('paused');
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const resetTimer = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setIsRunning(false);
    setStatus('idle');
    setWarningState([]);
    setSeconds(mode === 'countdown' ? DEFAULT_TIME : 0);
    lastBeepsRef.current = { halfTime: false, oneMinute: false, reach: false };
  }, [mode]);

  const setTime = useCallback((newTime: number) => {
    setSeconds(newTime);
    if (newTime > 0) {
      setStatus('idle');
    }
  }, []);

  const updateSettings = useCallback((newSettings: Partial<TimerSettings>) => {
    setSettings(prev => ({ ...prev, ...newSettings }));
  }, [setSettings]);

  const clearLog = useCallback(() => {
    setLog([]);
  }, [setLog]);

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

  const wallClock = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone.replace('_', ' ');
  const timeZoneAbbr = new Intl.DateTimeFormat('en-US', { timeZoneName: 'short' }).formatToParts(now).find(p => p.type === 'timeZoneName')?.value || '';

  const cueFinishDate = new Date(now.getTime() + seconds * 1000);
  const cueFinish = cueFinishDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });

  const overUnder = seconds < 0 ? `+${formatTime(Math.abs(seconds))}` : `-${formatTime(seconds)}`;

  return {
    seconds,
    displayValue: getDisplayValue(),
    isRunning,
    status,
    colorClass: getColorClass(),
    warningState,
    settings,
    wallClock,
    timeZone: `${timeZone} (${timeZoneAbbr})`,
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
    DEFAULT_TIME
  };
};
