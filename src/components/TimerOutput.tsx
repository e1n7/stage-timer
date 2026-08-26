import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ProgressBar, ProgressSegment } from './ProgressBar';
import { MessageStage } from './MessageStage';
import { postSharedMessage, subscribeSharedChannel } from '../lib/sharedChannel';
import { readJsonStorage } from '../lib/storage';

const CHANNEL_NAME = 'stage-timer-sync';
const DEFAULT_TIME = 0;

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



export const TimerOutput = () => {
  const [seconds, setSeconds] = useState<number>(DEFAULT_TIME);
  const [totalTime, setTotalTime] = useState<number>(DEFAULT_TIME);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [flash, setFlash] = useState<boolean>(false);
  const [isFlashing, setIsFlashing] = useState<boolean>(false);
  const [blackout, setBlackout] = useState<boolean>(false);
  const [isEmpty, setIsEmpty] = useState<boolean>(false);
  const [fontHeight, setFontHeight] = useState<number>(1.6);
  const [fontWidth, setFontWidth] = useState<number>(1.0);
  const [messageText, setMessageText] = useState<string>('');
  const [messageColor, setMessageColor] = useState<string>('#ffffff');
  const [messageBold, setMessageBold] = useState<boolean>(false);
  const [messageUppercase, setMessageUppercase] = useState<boolean>(false);
  const [messageVisible, setMessageVisible] = useState<boolean>(false);
  const [messageFlashing, setMessageFlashing] = useState<boolean>(false);
  const [messageMaximize, setMessageMaximize] = useState<boolean>(false);
  const [messageFlashVisible, setMessageFlashVisible] = useState<boolean>(true);
  const flashIntervalRef = useRef<any>(null);
  const messageFlashIntervalRef = useRef<any>(null);

  const triggerFlash = useCallback(() => {
    if (flashIntervalRef.current) clearInterval(flashIntervalRef.current);
    setIsFlashing(true);
    let count = 0;
    flashIntervalRef.current = setInterval(() => {
      setFlash(prev => !prev);
      count++;
      if (count >= 6) {
        if (flashIntervalRef.current) clearInterval(flashIntervalRef.current);
        setFlash(false);
        setIsFlashing(false);
        flashIntervalRef.current = null;
      }
    }, 150);
  }, []);

  const triggerMessageFlash = useCallback(() => {
    // Blink loop that only drives the MESSAGE (MessageStage flashActive /
    // flashVisible). The timer digits keep their own isFlashing/flash flags
    // via triggerFlash(), so a message flash never blinks the timer.
    if (messageFlashIntervalRef.current) clearInterval(messageFlashIntervalRef.current);
    setMessageFlashing(true);
    setMessageFlashVisible(true);
    let count = 0;
    messageFlashIntervalRef.current = setInterval(() => {
      setMessageFlashVisible(prev => !prev);
      count++;
      if (count >= 6) {
        if (messageFlashIntervalRef.current) clearInterval(messageFlashIntervalRef.current);
        setMessageFlashVisible(true);
        setMessageFlashing(false);
        messageFlashIntervalRef.current = null;
      }
    }, 150);
  }, []);
  const [messageSize, setMessageSize] = useState<number>(1.0);
  const [messageFontHeight, setMessageFontHeight] = useState<number>(1.0);
  const [messageFontWidth, setMessageFontWidth] = useState<number>(1.0);
  const [title, setTitle] = useState<string>('');
  const [segments, setSegments] = useState<ProgressSegment[]>([
    { threshold: 60, color: '#f08c00' },
    { threshold: 10, color: '#fa5252' }
  ]);

  const syncStateRef = useRef({
    startTime: null as number | null,
    initialSeconds: DEFAULT_TIME,
    mode: 'countdown' as 'countdown' | 'countup' | 'time',
    lastUpdated: 0,
    isRunning: false,
    isEmpty: false
  });

  useEffect(() => {
    const updateFromData = (data: any) => {
      if (!data || typeof data !== 'object') return;

      if ('blackout' in data) setBlackout(!!data.blackout);
      if ('flash' in data && data.flash) {
        triggerFlash();
      }

      if ('isEmpty' in data) {
        setIsEmpty(!!data.isEmpty);
        syncStateRef.current.isEmpty = !!data.isEmpty;
      }

      if ('totalTime' in data) setTotalTime(Math.max(0, Number(data.totalTime) || 0));
      if ('segments' in data) setSegments(Array.isArray(data.segments) ? data.segments : []);
      if ('title' in data) setTitle(data.title || '');
      if ('fontHeight' in data) setFontHeight(data.fontHeight || 1.6);
      if ('fontWidth' in data) setFontWidth(data.fontWidth || 1.0);
      if ('messageText' in data) {
        const hasMsg = !!data.messageText;
        setMessageText(data.messageText || '');
        setMessageColor(data.messageColor || '#ffffff');
        setMessageBold(!!data.messageBold);
        setMessageUppercase(!!data.messageUppercase);
        if (typeof data.messageSize === 'number') setMessageSize(data.messageSize);
        if (typeof data.messageFontHeight === 'number') setMessageFontHeight(data.messageFontHeight);
        if (typeof data.messageFontWidth === 'number') setMessageFontWidth(data.messageFontWidth);
        if ('messageShown' in data) setMessageVisible(hasMsg && !!data.messageShown);
      }
      if ('messageShown' in data) setMessageVisible(!!data.messageShown);
      if ('messageFlash' in data && data.messageFlash) {
        // Message-only flash: blink the message, never the timer digits.
        setMessageFlashing(true);
        triggerMessageFlash();
        if (data.messageText) setMessageText(data.messageText);
        if (data.messageColor) setMessageColor(data.messageColor);
        if ('messageBold' in data) setMessageBold(!!data.messageBold);
        if ('messageUppercase' in data) setMessageUppercase(!!data.messageUppercase);
        if (typeof data.messageSize === 'number') setMessageSize(data.messageSize);
        if (typeof data.messageFontHeight === 'number') setMessageFontHeight(data.messageFontHeight);
        if (typeof data.messageFontWidth === 'number') setMessageFontWidth(data.messageFontWidth);
        setMessageMaximize(true);
      }
      if ('messageMaximize' in data) {
        const maxOn = !!data.messageMaximize;
        setMessageMaximize(maxOn);
        if (maxOn && data.messageText) {
          setMessageText(data.messageText);
          setMessageColor(data.messageColor || '#ffffff');
          setMessageBold(!!data.messageBold);
          setMessageUppercase(!!data.messageUppercase);
          if (typeof data.messageSize === 'number') setMessageSize(data.messageSize);
        }
      }

      if ('startTime' in data || 'initialSeconds' in data || 'isRunning' in data) {
        if (data.type === 'force-sync' || (data.lastUpdated || 0) >= syncStateRef.current.lastUpdated) {
          const newIsRunning = !!data.isRunning;
          setIsRunning(newIsRunning);
          syncStateRef.current = {
            ...syncStateRef.current,
            startTime: data.startTime,
            initialSeconds: data.initialSeconds ?? DEFAULT_TIME,
            mode: data.mode ?? 'countdown',
            lastUpdated: data.lastUpdated || Date.now(),
            isRunning: newIsRunning
          };

          const normalizedInitialSeconds = data.mode === 'countup'
            ? Math.max(0, Number(data.initialSeconds) || 0)
            : (data.initialSeconds ?? DEFAULT_TIME);
          syncStateRef.current.initialSeconds = normalizedInitialSeconds;

          if (newIsRunning && data.startTime) {
            const elapsed = (Date.now() - data.startTime) / 1000;
            const next = data.mode === 'countdown'
              ? normalizedInitialSeconds - elapsed
              : data.mode === 'time'
                ? Date.now() / 1000
                : normalizedInitialSeconds + elapsed;
            setSeconds(Math.round(next * 10) / 10);
          } else {
            setSeconds(normalizedInitialSeconds);
          }
        }
      }
    };

    const unsubscribe = subscribeSharedChannel(CHANNEL_NAME, (event) => updateFromData(event.data));
    postSharedMessage(CHANNEL_NAME, { type: 'handshake' });

    const storageSync = () => {
      const stored = readJsonStorage<Record<string, unknown> | null>('timerState', null);
      if (stored) updateFromData(stored);
    };

    window.addEventListener('storage', storageSync);
    storageSync();

    return () => {
      unsubscribe();
      window.removeEventListener('storage', storageSync);
    };
  }, [triggerFlash, triggerMessageFlash]);

  useEffect(() => {
    const tick = () => {
      const { isRunning: syncIsRunning, startTime, initialSeconds, mode, isEmpty: syncIsEmpty } = syncStateRef.current;
      if (syncIsEmpty) {
        setSeconds(0);
        return;
      }

      if (syncIsRunning && startTime !== null) {
        const elapsed = (Date.now() - startTime) / 1000;
        setSeconds(() => {
          if (mode === 'countdown') return Math.round((initialSeconds - elapsed) * 10) / 10;
          if (mode === 'countup') return Math.round((Math.max(0, initialSeconds) + elapsed) * 10) / 10;
          return Date.now() / 1000;
        });
      } else {
        setSeconds(initialSeconds);
      }
    };

    const interval = setInterval(tick, 100);
    return () => clearInterval(interval);
  }, [isRunning]);

  const progressSeconds = syncStateRef.current.mode === 'countup'
    ? Math.max(0, totalTime - seconds)
    : seconds;

  const getTextColor = () => {
    if (isEmpty) return '#000000';
    const rounded = Math.floor(progressSeconds);
    if (rounded <= 0) return '#fa5252';
    const sorted = [...segments].sort((a, b) => a.threshold - b.threshold);
    for (const seg of sorted) {
      if (rounded <= seg.threshold) return seg.color;
    }
    return '#ffffff';
  };

  const getGlowColor = () => {
    const color = getTextColor();
    if (color === '#ffffff') return 'rgba(255, 255, 255, 0.3)';
    if (color === '#fa5252') return 'rgba(250, 82, 82, 0.4)';
    if (color === '#f08c00') return 'rgba(240, 140, 0, 0.4)';
    if (color === '#22c55e') return 'rgba(34, 197, 94, 0.4)';
    return 'transparent';
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen();
    }
  };

  return (
    <div
      className="group relative m-0 flex h-screen w-screen flex-col items-center justify-center overflow-hidden p-0 transition-all duration-300"
      style={{ backgroundColor: '#0a0a0a' }}
    >


      <button
        onClick={toggleFullscreen}
        className="absolute right-2 top-2 z-50 flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-white opacity-0 transition-all duration-300 hover:bg-white/20 hover:opacity-100"
        aria-label="Toggle Fullscreen"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>
      </button>

      {blackout ? (
        <div className="h-full w-full bg-black" />
      ) : (
        <div className="relative flex h-full w-full flex-col items-center justify-center">
          {/* Background Timer Layer (Blurred out when message is active) */}
          <div className={`absolute inset-0 flex items-center justify-center transition-all duration-300 ${messageMaximize && messageText && !isEmpty ? 'filter blur-[8px] brightness-50 select-none pointer-events-none' : ''}`}>
            <div className="mb-[9vh] flex w-full items-center justify-center overflow-visible" style={{ transform: 'translateY(-50px)' }}>
              <div
                className="timer-output-display max-w-full text-center font-bold tabular-nums tracking-tighter whitespace-nowrap transition-all duration-75"
                style={{
                  color: getTextColor(),
                  fontSize: 'min(100vw, 50vh)',
                  lineHeight: 0.8,
                  fontFamily: 'Inter, system-ui, sans-serif',
                  fontStretch: 'normal',
                  letterSpacing: '-0.02em',
                  opacity: isFlashing ? (flash ? 1 : 0.45) : 1,
                  textShadow: isFlashing && flash
                    ? `0 0 8px ${getTextColor()}`
                    : 'none',
                  transform: `scale(${fontWidth}, ${fontHeight})`,
                  transformOrigin: 'center center'
                }}
              >
                {isEmpty ? '00:00' : (syncStateRef.current.mode === 'countup' ? formatClock(Math.max(0, seconds)) : (seconds < 0 ? '+' + formatClock(Math.abs(seconds)) : formatClock(seconds)))}
              </div>
            </div>
          </div>
          <div className="absolute bottom-0 left-0 w-full">
            <ProgressBar currentSeconds={progressSeconds} totalSeconds={totalTime} segments={segments} height="h-[6vh]" className="rounded-xl shadow-2xl border border-white/5" />
          </div>

          <MessageStage
            className="absolute inset-0 z-40"
            maxFontSize={160}
            active={messageMaximize && !!messageText && !isEmpty}
            message={{
              messageText,
              messageColor,
              messageBold,
              messageUppercase,
              messageSize,
              messageFontHeight,
              messageFontWidth,
            }}
            flashActive={messageFlashing}
            flashVisible={messageFlashVisible}
          />
        </div>
      )}
    </div>
  );
};

export { CHANNEL_NAME };
