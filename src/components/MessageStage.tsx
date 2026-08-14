import { useEffect, useRef, useState } from 'react';

export const MESSAGE_CANVAS = {
  width: 1920,
  height: 1080,
} as const;

export type MessageStageData = {
  messageText: string;
  messageColor?: string;
  messageBold?: boolean;
  messageUppercase?: boolean;
  messageSize?: number;
};

type MessageStageProps = {
  message: MessageStageData;
  active: boolean;
  flashActive?: boolean;
  flashVisible?: boolean;
  className?: string;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/**
 * A shared 1920x1080 message canvas. Dashboard and Output only scale this
 * complete stage to fit their host container; typography is never calculated
 * from the browser viewport.
 */
export const MessageStage = ({
  message,
  active,
  flashActive = false,
  flashVisible = true,
  className = '',
}: MessageStageProps) => {
  const hostRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const updateScale = () => {
      const { width, height } = host.getBoundingClientRect();
      if (!width || !height) return;
      setScale(Math.min(width / MESSAGE_CANVAS.width, height / MESSAGE_CANVAS.height));
    };

    updateScale();
    const observer = new ResizeObserver(updateScale);
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  if (!active || !message.messageText) return null;

  const text = message.messageText;
  const lines = text.split('\n');
  const longestLine = Math.max(1, ...lines.map((line) => line.length));
  const lineCount = Math.max(1, lines.length);

  // All sizing is calculated in the fixed 1920x1080 master canvas.
  // The horizontal fit preserves line breaks; the vertical fit accounts for 1.5x stretch.
  const maxTextWidth = 1760;
  const maxTextHeight = 880;
  const horizontalFit = maxTextWidth / (longestLine * 0.55);
  const verticalFit = maxTextHeight / (lineCount * 1.2 * 1.5);
  
  // Calculate base best-fit size, then apply the user's multiplier.
  // Lowered default max from 160 to 130 to keep new messages from being too big.
  const baseSize = Math.min(horizontalFit, verticalFit, 130);
  const fontSize = clamp(baseSize * (message.messageSize || 1.0), 12, 500);
  const color = message.messageColor || '#ffffff';

  return (
    <div
      ref={hostRef}
      className={`pointer-events-none overflow-hidden ${className}`}
      aria-label="Message preview"
    >
      <div
        className="absolute left-1/2 top-1/2 origin-center"
        style={{
          width: MESSAGE_CANVAS.width,
          height: MESSAGE_CANVAS.height,
          transform: `translate(-50%, -50%) scale(${scale})`,
        }}
      >
        {/* Use absolute pixel units relative to 1920x1080 stage for perfect sync */}
        <div className="relative h-full w-full overflow-hidden rounded-[28px] border-[2px] border-white/20 bg-[#141414]/80 shadow-2xl backdrop-blur-xl">
          <div className="flex h-full w-full items-center justify-center overflow-hidden p-[20px]">
            <div
              className="w-full text-center"
              style={{
                color,
                fontSize: `${fontSize}px`,
                fontWeight: message.messageBold ? 900 : 400,
                textTransform: message.messageUppercase ? 'uppercase' : 'none',
                fontFamily: 'Inter, system-ui, sans-serif',
                lineHeight: 1.2,
                letterSpacing: '0.01em',
                whiteSpace: 'pre-wrap',
                wordWrap: 'break-word',
                overflowWrap: 'anywhere',
                maxWidth: 1880,
                maxHeight: 1040,
                transform: 'scale(0.9, 1.5)',
                transformOrigin: 'center center',
                opacity: flashActive && !flashVisible ? 0.1 : 1,
                textShadow: flashActive && flashVisible
                  ? `0 0 15px #fff, 0 0 30px #fff, 0 0 50px ${color}, 0 0 80px ${color}`
                  : `0 4px 20px rgba(0,0,0,0.8), 0 0 60px ${color}55`,
              }}
            >
              {text}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
