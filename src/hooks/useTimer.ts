import { useState, useEffect, useRef, useCallback } from 'react';
import { useLocalStorage } from './useLocalStorage';

const DEFAULT_TIME = 5 * 60; // 5 minutes
const DEFAULT_SETTINGS: TimerSettings = {
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
  const [seconds, setSeconds] = useState<number>(DEFAULT_TIME);
  const [mode, setMode] = useState<TimerMode>('countdown');
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [status, setStatus] = useState<'idle' | 'running' | 'paused' | 'finished'>('idle');
  const [settings, setSettings] = useLocalStorage<TimerSettings>('timerSettings', DEFAULT_SETTINGS);
  const [log, setLog] = useLocalStorage<LogEntry[]>('timerLog', []);

  const intervalRef = useRef<number | null>(null);
  const audioRef = useRef<{ beep: HTMLAudioElement } | null>(null);
  const startTimeRef = useRef<number>(0);
  const elapsedRef = useRef<number>(0);
  const lastBeepsRef = useRef<{ halfTime: boolean; oneMinute: boolean; reach: boolean }>({
    halfTime: false,
    oneMinute: false,
    reach: false
  });

  // Initialize audio - using inline data URI for beep sound
  useEffect(() => {
    const beep = new Audio(
      'data:audio/wav;base64,UklGRl9vT19XQVZLWW9tBhnwP/mBiJhAf3uP/APr/jD//3v/iL//4H//+//8L///kP/9/8D///rP/7n/9P//7v///8L'
    );
    beep.volume = settings.audioVolume;
    audioRef.current = { beep };
  }, [settings.audioVolume]);

  // Update audio volume when settings change
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.beep.volume = settings.audioVolume;
    }
  }, [settings.audioVolume]);

  // Format time as HH:MM:SS or MM:SS based on duration
  const formatTime = useCallback((secs: number): string => {
    const hours = Math.floor(secs / 3600);
    const minutes = Math.floor((secs % 3600) / 60);
    const seconds = Math.floor(secs % 60);
    const pad = (num: number): string => num.toString().padStart(2, '0');

    if (hours > 0) {
      return `${hours}:${pad(minutes)}:${pad(seconds)}`;
    }
    return `${pad(minutes)}:${pad(seconds)}`;
  }, []);

  // Format time for time-of-day mode
  const formatTimeOfDay = useCallback((secs: number): string => {
    const date = new Date(secs * 1000);
    const hours = date.getHours();
    const minutes = date.getMinutes();
    const seconds = date.getSeconds();
    const pad = (num: number): string => num.toString().padStart(2, '0');
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  }, []);

  // Get current display value
  const getDisplayValue = useCallback((): string => {
    if (mode === 'time') {
      return formatTimeOfDay(seconds);
    }
    return formatTime(seconds);
  }, [mode, seconds, formatTimeOfDay, formatTime]);

  // Check for warning states and trigger beeps
  const checkWarnings = useCallback((currentSeconds: number): string[] => {
    const newWarnings: string[] = [];

    if (mode === 'countdown') {
      if (currentSeconds <= settings.warningThreshold && currentSeconds > 0) {
        newWarnings.push('warning');
      }
      if (currentSeconds <= 0) {
        newWarnings.push('danger');
      }
    } else if (mode === 'countup') {
      if (currentSeconds >= settings.warningThreshold && settings.warningThreshold > 0) {
        newWarnings.push('warning');
      }
      if (currentSeconds >= settings.dangerThreshold && settings.dangerThreshold > 0) {
        newWarnings.push('danger');
      }
    }

    // Handle beep on reach (zero)
    if (audioRef.current && settings.beepOnReach && currentSeconds <= 0 && mode === 'countdown') {
      if (!lastBeepsRef.current.reach) {
        audioRef.current.beep.currentTime = 0;
        audioRef.current.beep.play().catch(() => {});
        lastBeepsRef.current.reach = true;
      }
    } else {
      lastBeepsRef.current.reach = false;
    }

    // Handle beep on half time
    if (audioRef.current && settings.beepOnHalfTime && mode === 'countdown') {
      const halfTime = DEFAULT_TIME / 2;
      if (currentSeconds <= halfTime && currentSeconds > halfTime - 1 && !lastBeepsRef.current.halfTime) {
        audioRef.current.beep.currentTime = 0;
        audioRef.current.beep.play().catch(() => {});
        lastBeepsRef.current.halfTime = true;
      } else if (currentSeconds > halfTime) {
        lastBeepsRef.current.halfTime = false;
      }
    }

    // Handle beep on one minute remaining
    if (audioRef.current && settings.beepOnOneMinute && mode === 'countdown') {
      if (currentSeconds <= 60 && currentSeconds > 59 && !lastBeepsRef.current.oneMinute) {
        // Play beep 3 times
        let count = 0;
        const playBeep = () => {
          if (count < 3 && audioRef.current) {
            audioRef.current.beep.currentTime = 0;
            audioRef.current.beep.play().catch(() => {});
            count++;
            setTimeout(playBeep, 300);
          }
        };
        playBeep();
        lastBeepsRef.current.oneMinute = true;
      } else if (currentSeconds > 60) {
        lastBeepsRef.current.oneMinute = false;
      }
    }

    return newWarnings;
  }, [mode, settings.warningThreshold, settings.dangerThreshold, settings.beepOnReach, settings.beepOnHalfTime, settings.beepOnOneMinute]);

  // Get color class based on time and mode
  const getColorClass = useCallback((): string => {
    if (status === 'finished' || (mode === 'countdown' && seconds <= 0)) {
      return 'danger';
    }
    if (mode === 'countdown') {
      // Find the first segment that matches the current time
      const sortedSegments = [...settings.segments].sort((a, b) => a.threshold - b.threshold);
      for (const segment of sortedSegments) {
        if (seconds <= segment.threshold) {
          return segment.color === '#fa5252' ? 'danger' : 'warning';
        }
      }
    }
    return 'safe';
  }, [mode, seconds, status, settings.segments]);

  const [warningState, setWarningState] = useState<string[]>([]);

  // Start the timer
  const startTimer = useCallback(() => {
    if (status === 'finished' && mode === 'countdown') {
      setSeconds(DEFAULT_TIME);
      setStatus('running');
    } else {
      setStatus('running');
    }
    setIsRunning(true);
    startTimeRef.current = Date.now();

    intervalRef.current = window.setInterval(() => {
      setSeconds(prev => {
        let newTime: number;

        if (mode === 'countdown') {
          newTime = prev - 1;
          if (newTime <= 0) {
            setStatus('finished');
            setIsRunning(false);
            if (intervalRef.current) {
              clearInterval(intervalRef.current);
            }
          }
        } else if (mode === 'countup') {
          newTime = prev + 1;
        } else {
          // Time of day mode
          const now = new Date();
          newTime = Math.floor(now.getTime() / 1000);
        }

        const newWarnings = checkWarnings(newTime);
        if (newWarnings.length > 0) {
          setWarningState(newWarnings);
        } else {
          setWarningState([]);
        }

        return newTime;
      });
    }, 1000);

    // Update immediately for time mode
    if (mode === 'time') {
      const now = new Date();
      setSeconds(Math.floor(now.getTime() / 1000));
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [mode, status, checkWarnings]);

  // Pause the timer
  const pauseTimer = useCallback(() => {
    setIsRunning(false);
    setStatus('paused');
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (mode !== 'time') {
      elapsedRef.current += (Date.now() - startTimeRef.current) / 1000;
    }
  }, [mode]);

  // Reset the timer
  const resetTimer = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setIsRunning(false);
    setStatus('idle');
    setWarningState([]);
    if (mode === 'countdown') {
      setSeconds(DEFAULT_TIME);
    } else {
      setSeconds(0);
    }
    lastBeepsRef.current = { halfTime: false, oneMinute: false, reach: false };
  }, [mode]);

  // Change time setting
  const setTime = useCallback((newTime: number) => {
    setSeconds(newTime);
  }, []);

  // Add entry to log
  const addToLog = useCallback((notes?: string) => {
    const entry: LogEntry = {
      id: Date.now().toString(),
      date: new Date().toISOString(),
      duration: mode === 'countdown' ? DEFAULT_TIME - seconds : seconds,
      mode,
      notes
    };
    setLog(prev => [entry, ...prev.slice(0, settings.historyLimit - 1)]);
  }, [mode, seconds, settings.historyLimit, setLog]);

  // Clear log
  const clearLog = useCallback(() => {
    setLog([]);
  }, [setLog]);

  // Update settings
  const updateSettings = useCallback((newSettings: Partial<TimerSettings>) => {
    setSettings(prev => ({ ...prev, ...newSettings }));
  }, [setSettings]);

  // Format duration for log display
  const formatDuration = useCallback((secs: number): string => {
    const hours = Math.floor(secs / 3600);
    const minutes = Math.floor((secs % 3600) / 60);
    const seconds = Math.floor(secs % 60);

    if (hours > 0) {
      return `${hours}h ${minutes}m ${seconds}s`;
    }
    if (minutes > 0) {
      return `${minutes}m ${seconds}s`;
    }
    return `${seconds}s`;
  }, []);

  // Format log date
  const formatLogDate = useCallback((isoDate: string): string => {
    const date = new Date(isoDate);
    const options: Intl.DateTimeFormatOptions = {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    };
    return date.toLocaleDateString(undefined, options);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      audioRef.current?.beep.pause();
    };
  }, []);

  return {
    // State
    seconds,
    displayValue: getDisplayValue(),
    mode,
    isRunning,
    status,
    colorClass: getColorClass(),
    warningState,
    settings,
    log,

    // Actions
    setMode,
    setTime,
    startTimer,
    pauseTimer,
    resetTimer,
    addToLog,
    clearLog,
    updateSettings,
    formatDuration,
    formatLogDate,

    // Constants
    DEFAULT_TIME
  };
};