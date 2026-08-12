import { useEffect } from 'react';
import { useTimer } from './hooks/useTimer';
import { ProgressBar } from './components/ProgressBar';

const pad = (value: number) => value.toString().padStart(2, '0');

const formatClock = (seconds: number) => {
  const total = Math.max(0, seconds);
  const minutes = Math.floor(total / 60);
  const secs = total % 60;
  return `${pad(minutes)}:${pad(secs)}`;
};

const CHANNEL_NAME = 'stage-timer-sync';

function App() {
  const {
    seconds,
    isRunning,
    mode,
    DEFAULT_TIME,
    setMode,
    setTime,
    startTimer,
    pauseTimer,
    resetTimer,
    settings,
    updateSettings,
  } = useTimer();

  const currentTime = formatClock(seconds);
  const progress = Math.min(100, (seconds / Math.max(DEFAULT_TIME, 1)) * 100);

  const adjustTime = (delta: number) => {
    setTime(Math.max(0, seconds + delta));
  };

  // Keep any host-facing output window (opened via Output Links)
  // in sync with this dashboard in real time.
  const syncOutput = (payload: Record<string, unknown>) => {
    try {
      const channel = new BroadcastChannel(CHANNEL_NAME);
      channel.postMessage(payload);
      channel.close();
    } catch {
      /* BroadcastChannel unavailable */
    }
    try {
      localStorage.setItem('timerState', JSON.stringify({ seconds, isRunning, totalTime: DEFAULT_TIME }));
    } catch {
      /* storage unavailable */
    }
  };

  // Broadcast state changes every time seconds or isRunning updates
  useEffect(() => {
    syncOutput({ seconds, isRunning, totalTime: DEFAULT_TIME, segments: settings.segments });
  }, [seconds, isRunning, DEFAULT_TIME, settings.segments]);

  // Listen for handshake from late-joining output windows
  useEffect(() => {
    let channel: BroadcastChannel | null = null;
    try {
      channel = new BroadcastChannel(CHANNEL_NAME);
      channel.onmessage = (event) => {
        if (event.data?.type === 'handshake') {
          channel?.postMessage({ seconds, isRunning, totalTime: DEFAULT_TIME, segments: settings.segments });
        }
      };
    } catch { /* ignore */ }
    return () => channel?.close();
  }, [seconds, isRunning, DEFAULT_TIME, settings.segments]);

  // Publish every state change so output windows stay mirrored.
  const wrappedSetTime = (value: number) => {
    setTime(value);
  };

  const wrappedStart = () => {
    startTimer();
  };

  const wrappedPause = () => {
    pauseTimer();
  };

  const wrappedReset = () => {
    resetTimer();
  };

  const openOutput = () => {
    window.open('/output', '_blank');
  };

  const sendOutputAction = (action: 'flash' | 'blackout', value: boolean) => {
    syncOutput({ [action]: value });
  };

  return (
    <div className="h-screen bg-[#1a1a1a] text-white antialiased">
      {/* Top bar */}
      <div className="flex items-center justify-between px-3 py-2">
        <div className="text-[20px] font-bold text-[#8a8a8a]">Unnamed</div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="flex h-9 items-center gap-2 rounded-md bg-[#2d2d2d] px-4 text-[13px] text-white"
          >
            Room
            <span className="text-[10px]">▾</span>
          </button>
          <button
            type="button"
            className="flex h-9 items-center gap-2 rounded-md border border-[#444] bg-[#2d2d2d] px-4 text-[13px] text-white"
          >
            🔒 Save
          </button>
        </div>
      </div>

      <div className="flex w-full overflow-hidden pb-12">
        {/* Left: Dashboard panel */}
        <aside className="flex h-[calc(100vh-84px)] w-[380px] flex-col px-3 py-2">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="inline-flex items-center gap-2 text-[17px] font-bold text-white">
              Dashboard
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="flex h-8 items-center gap-2 rounded-md bg-[#2d2d2d] px-3 text-[12px] text-white"
              >
                ▾
              </button>
              <button
                type="button"
                onClick={openOutput}
                className="flex h-8 items-center gap-2 rounded-md border border-[#444] bg-[#2d2d2d] px-3 text-[12px] text-white hover:bg-[#383838]"
              >
                🖵 Output Links
              </button>
            </div>
          </div>

          <div className="rounded-md border border-[#333] bg-[#141414] p-3">
            <div className="flex items-center justify-between text-[12px]">
              <span className="font-bold text-[#22c55e]">⌂ stagetimer.io</span>
              <span className="font-bold text-[#7eb8ff]">Timer 1</span>
            </div>
            <div className="digit mt-2 text-center text-[84px] font-bold leading-none tracking-[-0.02em] text-white">{currentTime}</div>

            <ProgressBar 
              currentSeconds={seconds} 
              totalSeconds={DEFAULT_TIME} 
              segments={settings.segments} 
              height="h-4"
              className="mt-3"
            />

            <div className="mt-2 flex items-center justify-between text-[12px]">
              <span className="inline-block rounded-sm bg-[#333] px-2 py-[2px] text-[11px] font-bold tracking-wider text-white">ON AIR</span>
              <span className="text-white">● {currentTime}.0</span>
            </div>
            <div className="h-1" />

            <div className="mt-2 grid grid-cols-4 gap-[1px] overflow-hidden rounded-sm border border-[#2a2a2a] text-[11px]">
              <div className="bg-[#1c1c1c] p-1 text-[#fa5252]">0:00</div>
              <div className="bg-[#1c1c1c] p-1 text-[#22c55e]">7:30</div>
              <div className="bg-[#1c1c1c] p-1 text-[#22c55e]">5:00</div>
              <div className="bg-[#1c1c1c] p-1 text-[#22c55e]">2:30</div>
            </div>
            <ProgressBar 
              currentSeconds={seconds} 
              totalSeconds={DEFAULT_TIME} 
              segments={settings.segments} 
              height="h-2"
              className="mt-1 border-none"
            />
          </div>

          <div className="mt-3 flex items-center justify-between gap-2">
            <button
              type="button"
              className="flex h-10 items-center justify-center rounded-md border border-[#333] bg-[#2d2d2d] px-4 text-[13px] text-white hover:bg-[#383838]"
            >
              ▾
            </button>
            <button
              type="button"
              onClick={() => adjustTime(-60)}
              className="flex h-10 items-center justify-center rounded-md border border-[#333] bg-[#2d2d2d] px-4 text-[13px] text-white hover:bg-[#383838]"
            >
              -1m
            </button>
            <button
              type="button"
              onClick={() => resetTimer()}
              className="flex h-10 w-14 items-center justify-center rounded-md border border-[#333] bg-[#2d2d2d] text-[14px] text-white hover:bg-[#383838]"
            >
              ⏮
            </button>
            <button
              type="button"
              onClick={isRunning ? pauseTimer : startTimer}
              className="flex h-10 w-14 items-center justify-center rounded-md border border-[#333] bg-[#2d2d2d] text-[14px] text-white hover:bg-[#383838]"
            >
              {isRunning ? '⏸' : '▶'}
            </button>
            <button
              type="button"
              onClick={() => adjustTime(60)}
              className="flex h-10 items-center justify-center rounded-md border border-[#333] bg-[#2d2d2d] px-4 text-[13px] text-white hover:bg-[#383838]"
            >
              +1m
            </button>
            <button
              type="button"
              className="flex h-10 items-center justify-center rounded-md border border-[#333] bg-[#2d2d2d] px-4 text-[13px] text-white hover:bg-[#383838]"
            >
              ▾
            </button>
          </div>

          <div className="mt-4 flex flex-col items-center text-[13px] text-[#c9c9c9]">
            <div className="flex items-center gap-2">
              <span>◷ {currentTime}</span>
              <span className="text-white">PM</span>
              <span className="text-[#8a8a8a]">Asia / Shanghai (CST)</span>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2 text-center text-[12px] text-[#8a8a8a]">
            <div className="flex flex-col items-center">
              <span>Cue finish</span>
              <span className="digit mt-1 text-[13px] text-white">--:--</span>
            </div>
            <div className="flex flex-col items-center">
              <span>Over/Under</span>
              <span className="mt-1 text-[13px] text-white">-</span>
            </div>
          </div>



          <button
            type="button"
            className="mt-2 flex items-center justify-between rounded-md border border-[#333] bg-[#2d2d2d] px-4 py-3 text-[14px] text-white"
          >
            <span>Live Connections 1/3</span>
            <span>›</span>
          </button>

          <div className="mt-4 rounded-md border border-[#333] bg-[#141414] p-3">
            <div className="mb-3 text-[14px] font-bold text-white">Progress Bar Segments</div>
            <div className="space-y-2">
              {settings.segments.map((seg, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className="flex-1">
                    <label className="text-[10px] text-[#8a8a8a] uppercase block mb-1">Threshold (s)</label>
                    <input 
                      type="number" 
                      value={seg.threshold} 
                      onChange={(e) => {
                        const newSegments = [...settings.segments];
                        newSegments[i] = { ...seg, threshold: parseInt(e.target.value) || 0 };
                        updateSettings({ segments: newSegments });
                      }}
                      className="w-full bg-[#2d2d2d] border border-[#444] rounded px-2 py-1 text-[12px] text-white focus:outline-none focus:border-[#555]"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-[#8a8a8a] uppercase block mb-1">Color</label>
                    <input 
                      type="color" 
                      value={seg.color} 
                      onChange={(e) => {
                        const newSegments = [...settings.segments];
                        newSegments[i] = { ...seg, color: e.target.value };
                        updateSettings({ segments: newSegments });
                      }}
                      className="w-10 h-[26px] bg-[#2d2d2d] border border-[#444] rounded p-0 cursor-pointer"
                    />
                  </div>
                  <button 
                    onClick={() => {
                      const newSegments = settings.segments.filter((_, index) => index !== i);
                      updateSettings({ segments: newSegments });
                    }}
                    className="mt-4 text-[#fa5252] hover:text-[#ff6b6b] p-1"
                    title="Remove segment"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
            <button 
              onClick={() => {
                const minThreshold = settings.segments.length > 0 
                  ? Math.min(...settings.segments.map(s => s.threshold)) 
                  : 60;
                updateSettings({ 
                  segments: [...settings.segments, { threshold: Math.max(0, minThreshold - 10), color: '#fcc419' }] 
                });
              }}
              className="mt-3 w-full rounded border border-[#444] bg-[#2d2d2d] py-1 text-[12px] text-[#8a8a8a] hover:bg-[#383838] hover:text-white transition-colors"
            >
              + Add Segment
            </button>
          </div>
        </aside>

        {/* Center: Timers panel */}
        <main className="flex h-[calc(100vh-84px)] flex-1 flex-col px-6 pt-2">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="text-[18px] font-bold text-white">Timers</span>
              <span className="text-[14px] text-[#8a8a8a]">Select</span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                className="flex h-8 items-center gap-2 rounded-md border border-[#444] bg-[#2d2d2d] px-3 text-[12px] text-white"
              >
                ● Blackout
              </button>
              <button
                type="button"
                className="flex h-8 items-center gap-2 rounded-md border border-[#444] bg-[#2d2d2d] px-3 text-[12px] text-white"
              >
                ⚡ Flash
              </button>
              <button
                type="button"
                className="flex h-8 items-center justify-center rounded-md border border-[#444] bg-[#2d2d2d] px-2 text-[12px] text-white"
              >
                ⋯
              </button>
            </div>
          </div>

          <div className="flex-1">
            <div className="flex items-center gap-3 rounded-md bg-[#2546c9] px-4 py-3 text-white">
              <div className="text-[15px] font-bold">1</div>
              <button
                type="button"
                onClick={() => adjustTime(60)}
                className="text-[14px] font-medium text-[#9db8ff] hover:opacity-90"
              >
                Add time
              </button>
              <div className="mx-auto text-center text-[24px] font-bold tracking-[-0.02em]">{currentTime}</div>
              <div className="text-[15px] font-bold">Timer 1</div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => resetTimer()} className="flex h-9 w-9 items-center justify-center rounded-md border border-[#4a64c9] bg-[#3253cc] text-[13px] hover:bg-[#3d5ed8]">⏮</button>
                <button type="button" className="flex h-9 w-9 items-center justify-center rounded-md border border-[#4a64c9] bg-[#3253cc] text-[13px] hover:bg-[#3d5ed8]">⚙</button>
                <button type="button" onClick={isRunning ? pauseTimer : startTimer} className="flex h-9 w-9 items-center justify-center rounded-md border border-[#4a64c9] bg-[#228b3a] text-[13px] hover:bg-[#2aa346]">▶</button>
                <button type="button" className="flex h-9 w-9 items-center justify-center rounded-md border border-[#4a64c9] bg-[#3253cc] text-[13px] hover:bg-[#3d5ed8]">⋯</button>
              </div>
            </div>

            <div className="mt-4 flex justify-center">
              <button
                type="button"
                onClick={() => setTime(Math.max(0, seconds + 60))}
                className="flex items-center gap-2 rounded-md border border-[#444] bg-[#2d2d2d] px-5 py-2 text-[14px] text-white hover:bg-[#383838]"
              >
                + Add Timer
              </button>
            </div>
          </div>
        </main>

        {/* Right: Messages panel */}
        <aside className="flex h-[calc(100vh-84px)] w-[360px] flex-col px-3 py-2">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="flex items-center gap-3">
              <span className="text-[17px] font-bold text-white">Messages</span>
              <span className="text-[14px] text-[#8a8a8a]">Select</span>
            </div>
            <button
              type="button"
              onClick={() => syncOutput({ flash: true })}
              className="flex h-8 items-center gap-2 rounded-md border border-[#444] bg-[#2d2d2d] px-3 text-[12px] text-white hover:bg-[#383838]"
            >
              ⚡ Flash
            </button>
          </div>

          <div className="rounded-md border border-[#333] bg-[#2d2d2d] p-3">
            <div className="flex gap-2">
              <span className="text-[13px] text-[#8a8a8a]">1</span>
              <div className="flex-1 rounded-md border border-[#444] bg-[#1c1c1c] p-2 text-[13px] text-[#8a8a8a]">
                Enter message ...
              </div>
            </div>

            <div className="mt-3 flex gap-2">
              {[
                { tag: 'A', color: '#ffffff' },
                { tag: 'A', color: '#22c55e' },
                { tag: 'A', color: '#fa5252' },
                { tag: 'B', color: '#ffffff' },
                { tag: 'āA', color: '#ffffff' },
              ].map((item, index) => (
                <button
                  key={index}
                  type="button"
                  className="border-b-2 bg-transparent px-1 pb-1 text-[14px] font-bold"
                  style={{ color: item.color, borderBottomColor: item.color }}
                >
                  {item.tag}
                </button>
              ))}
            </div>

            <div className="mt-3 flex justify-end">
              <button type="button" className="rounded-md border border-[#444] bg-[#1c1c1c] px-4 py-1 text-[12px] text-white">
                Show
              </button>
              <button type="button" className="rounded-md border border-[#444] bg-[#1c1c1c] px-3 py-1 text-[12px] text-white">
                ⛶
              </button>
            </div>
          </div>

          <div className="mt-4 flex justify-center">
            <button
              type="button"
              className="flex items-center gap-2 rounded-md border border-[#444] bg-[#2d2d2d] px-5 py-2 text-[14px] text-white hover:bg-[#383838]"
            >
              + Add Message
            </button>
          </div>

          <div className="mt-4 text-center text-[13px] text-[#8a8a8a]">Submit questions link</div>
        </aside>
      </div>

      {/* Footer */}
      <footer className="fixed bottom-0 left-0 right-0 z-10 flex items-center justify-between border-t border-[#333] bg-[#1a1a1a] px-3 py-2 text-[11px] text-[#8a8a8a]">
        <div className="flex items-center gap-2">
          <span className="text-[#555]">stagetimer.io · v3.5.9 · Docs · ■ 783 ms</span>
        </div>

        <div className="flex items-center gap-2">
          <span>0:00</span>
          <input
            type="range"
            min="0"
            max="100"
            defaultValue="0"
            className="h-1 w-[60vw] cursor-pointer appearance-none rounded-full bg-[#555] [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[#3b82f6]"
          />
          <span>-10:00</span>
        </div>
      </footer>
    </div>
  );
}

export default App;
