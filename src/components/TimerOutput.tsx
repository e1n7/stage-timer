import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ProgressBar, ProgressSegment } from './ProgressBar';

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
  const flashIntervalRef = useRef<any>(null);

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
        setMessageFlashing(false);
      }
    }, 150);
  }, []);
  const [messageSize, setMessageSize] = useState<number>(1.0);
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
    let channel: BroadcastChannel | null = null;

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
        if ('messageShown' in data) setMessageVisible(hasMsg && !!data.messageShown);
      }
      if ('messageShown' in data) setMessageVisible(!!data.messageShown);
      if ('messageFlash' in data && data.messageFlash) {
        setMessageFlashing(true);
        if (data.messageText) setMessageText(data.messageText);
        if (data.messageColor) setMessageColor(data.messageColor);
        if ('messageBold' in data) setMessageBold(!!data.messageBold);
        if ('messageUppercase' in data) setMessageUppercase(!!data.messageUppercase);
        if (typeof data.messageSize === 'number') setMessageSize(data.messageSize);
        setMessageMaximize(true);
        triggerFlash();
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

          if (newIsRunning && data.startTime) {
            const elapsed = (Date.now() - data.startTime) / 1000;
            const next = data.mode === 'countdown'
              ? data.initialSeconds - elapsed
              : data.initialSeconds + elapsed;
            setSeconds(Math.round(next * 10) / 10);
          } else {
            setSeconds(data.initialSeconds ?? DEFAULT_TIME);
          }
        }
      }
    };

    try {
      channel = new BroadcastChannel(CHANNEL_NAME);
      channel.onmessage = (event) => updateFromData(event.data);
      channel.postMessage({ type: 'handshake' });
    } catch { /* ignore */ }

    const storageSync = () => {
      const stored = localStorage.getItem('timerState');
      if (stored) {
        try {
          updateFromData(JSON.parse(stored));
        } catch { /* ignore */ }
      }
    };

    window.addEventListener('storage', storageSync);
    storageSync();

    return () => {
      channel?.close();
      window.removeEventListener('storage', storageSync);
    };
  }, []);

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
          if (mode === 'countup') return Math.round((initialSeconds + elapsed) * 10) / 10;
          return Date.now() / 1000;
        });
      } else {
        setSeconds(initialSeconds);
      }
    };

    const interval = setInterval(tick, 100);
    return () => clearInterval(interval);
  }, [isRunning]);

  const currentMode = syncStateRef.current.mode;

  const getTextColor = () => {
    if (isEmpty) return '#000000';
    const rounded = Math.floor(seconds);
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
      className="group relative flex h-screen w-screen flex-col items-center justify-center overflow-hidden transition-all duration-300"
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
        <div className="relative flex h-full w-full flex-col items-center justify-between px-[1vw] pt-0 pb-[2vh]">
          {/* Background Timer Layer (Blurred out when message is active) */}
          <div className={`flex h-full w-full flex-col items-center justify-between transition-all duration-300 ${messageMaximize && messageText && !isEmpty ? 'filter blur-[16px] brightness-50 select-none pointer-events-none' : ''}`}>
            <div className="flex min-h-0 flex-1 w-full flex-col items-center justify-center overflow-visible">
              <div
                className="text-center font-bold tabular-nums tracking-tighter whitespace-nowrap transition-all duration-75"
                style={{
                  color: getTextColor(),
                  fontSize: 'min(92vw, 42vh)',
                  lineHeight: 1,
                  fontFamily: 'Inter, system-ui, sans-serif',
                  fontStretch: 'ultra-expanded',
                  letterSpacing: '0.01em',
                  opacity: (isFlashing && !flash) ? 0 : 1,
                  textShadow: isFlashing && flash 
                    ? `0 0 15px #fff, 0 0 30px ${getTextColor()}, 0 0 50px ${getTextColor()}, 0 0 80px ${getTextColor()}` 
                    : 'none',
                  transform: `scale(${fontWidth}, ${fontHeight})`,
                  transformOrigin: 'center center'
                }}
              >
                {isEmpty ? '00:00' : (seconds < 0 ? '+' + formatClock(Math.abs(seconds)) : formatClock(seconds))}
              </div>
            </div>
            <div className="w-full shrink-0 mb-[2vh] mt-[8vh]">
              <ProgressBar currentSeconds={seconds} totalSeconds={totalTime} segments={segments} mode={currentMode} height="h-[6vh]" className="rounded-xl shadow-2xl border border-white/5" />
            </div>
          </div>

          {/* Foreground Message Overlay Box */}
          {messageMaximize && messageText && !isEmpty && (() => {
            const lines = messageText.split('\n').length;
            const lengthFactor = Math.max(3, 18 - (messageText.length / 6));
            const lineFactor = 65 / (lines * 1.5); 
            const fontSizeVh = Math.min(lengthFactor, lineFactor);
            
            return (
              <div className="absolute inset-0 z-40 flex items-center justify-center p-[2vh] px-[2vw] overflow-hidden">
                <div className="flex h-full w-full max-w-[96vw] max-h-[94vh] items-center justify-center rounded-[28px] border border-white/20 bg-[#141414]/80 pt-[10vh] pb-[1vh] px-[4vw] shadow-2xl backdrop-blur-xl overflow-hidden">
                  <div
                    className="w-full text-center transition-opacity duration-75"
                    style={{
                      color: messageColor,
                      fontSize: `calc(${fontSizeVh}vh * ${messageSize})`,
                      fontWeight: messageBold ? 900 : 400,
                      textTransform: messageUppercase ? 'uppercase' : 'none',
                      fontFamily: 'Inter, system-ui, sans-serif',
                      lineHeight: 1.3,
                      textShadow: messageFlashing && flash 
                        ? `0 0 10px #fff, 0 0 20px #fff, 0 0 40px ${messageColor}, 0 0 70px ${messageColor}, 0 0 100px ${messageColor}` 
                        : `0 4px 20px rgba(0,0,0,0.8), 0 0 60px ${messageColor}55`,
                      letterSpacing: '0.01em',
                      transform: `scale(0.9, 1.5)`,
                      transformOrigin: 'center',
                      whiteSpace: 'pre-wrap',
                      wordWrap: 'break-word',
                      overflowWrap: 'anywhere',
                      maxWidth: '92vw',
                      maxHeight: '54vh', // Recalibrated: 54vh * 1.5 stretch = 81vh visual height (safely fits in 83vh usable space)
                      opacity: messageFlashing ? (flash ? 1 : 0.1) : 1,
                      transition: 'none'
                    }}
                  >
                    {messageText}
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
};

export { CHANNEL_NAME };
