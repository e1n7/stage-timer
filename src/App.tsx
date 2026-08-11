import { useTimer } from './hooks/useTimer';

const pad = (value: number) => value.toString().padStart(2, '0');

const formatClock = (seconds: number) => {
  const total = Math.max(0, seconds);
  const minutes = Math.floor(total / 60);
  const secs = total % 60;
  return `${pad(minutes)}:${pad(secs)}`;
};

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
  } = useTimer();

  const currentTime = formatClock(seconds);
  const progress = Math.min(100, (seconds / Math.max(DEFAULT_TIME, 1)) * 100);

  const adjustTime = (delta: number) => {
    setTime(Math.max(0, seconds + delta));
  };

  return (
    <div className="h-screen bg-[#f3f3f3] text-black antialiased">
      <div className="flex h-full w-full overflow-hidden">
        <aside className="w-[360px] border-r border-black/40 bg-[#f5f5f5] px-3 py-3">
          <div className="mb-3 inline-flex items-center gap-2 border border-black/80 bg-[#efefef] px-2 py-1 text-[13px] font-medium leading-none text-black">
            <span className="inline-block h-3 w-3 border border-black bg-white" />
            Dashboard
          </div>

          <div className="mt-5 text-[17px] font-bold tracking-[0.12em] text-black">STAGETIMER.IO</div>
          <div className="mt-5 text-[17px] text-black">Timer 1</div>
          <div className="digit mt-2 text-[64px] font-bold leading-none tracking-[-0.06em] text-black">{currentTime}</div>

          <div className="mt-4 flex items-center justify-between text-[13px] text-black">
            <span>On Air</span>
            <span>{currentTime}</span>
          </div>
          <div className="mt-2 h-3 w-full overflow-hidden border border-black/70 bg-[#d9d9d9]">
            <div
              className="h-full bg-[#38b548]"
              style={{ width: `${Math.max(0, Math.min(100, 100 - progress))}%` }}
            />
          </div>

          <div className="mt-3 flex items-center justify-between text-[10px] text-black/80">
            <span>0:00</span>
            <span>7:30</span>
            <span>5:00</span>
            <span>2:30</span>
          </div>

          <div className="mt-6 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => adjustTime(-60)}
              className="flex h-12 w-[92px] items-center justify-center border border-black/80 bg-[#efefef] text-[14px] font-medium text-black hover:bg-[#e9e9e9]"
            >
              -1m
            </button>
            <button
              type="button"
              onClick={isRunning ? pauseTimer : startTimer}
              className="flex h-12 w-[92px] items-center justify-center border border-black/80 bg-[#efefef] text-[18px] text-black hover:bg-[#e9e9e9]"
            >
              {isRunning ? '❚❚' : '▶'}
            </button>
            <button
              type="button"
              onClick={() => adjustTime(60)}
              className="flex h-12 w-[92px] items-center justify-center border border-black/80 bg-[#efefef] text-[14px] font-medium text-black hover:bg-[#e9e9e9]"
            >
              +1m
            </button>
          </div>

          <div className="mt-8 flex items-center gap-2 text-[14px] text-black">
            <span className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-black text-[9px]">◉</span>
            <span>08:50 AM Asia / Shanghai (CST)</span>
          </div>

          <div className="mt-4 text-[15px] text-black">Cue finish</div>
          <div className="mt-1 text-[15px] text-black">Over/Under</div>
          <div className="mt-6 text-[16px] font-medium text-black">Live Connections 1/3</div>

          <div className="mt-2 flex items-center justify-between gap-2">
            <div className="h-2 flex-1 overflow-hidden border border-black/70 bg-[#dfdfdf]">
              <div className="h-full w-1/3 bg-[#2b2b2b]" />
            </div>
          </div>
        </aside>

        <main className="flex flex-1 flex-col px-6 pt-4">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="flex gap-2">
              {['Timers', 'Select'].map(label => (
                <button
                  key={label}
                  type="button"
                  className="border border-black/70 bg-[#efefef] px-3 py-1 text-[13px] text-black hover:bg-[#e6e6e6]"
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="flex gap-2">
              {['Blackout', 'Flash', 'Messages', 'Select'].map(label => (
                <button
                  key={label}
                  type="button"
                  className="border border-black/70 bg-[#efefef] px-3 py-1 text-[13px] text-black hover:bg-[#e6e6e6]"
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1">
            <div className="mb-4 flex items-center gap-3 border border-black/70 bg-[#0e72d8] px-3 py-3 text-white">
              <div className="flex h-7 w-7 items-center justify-center border border-white/80 bg-white/10 text-[12px] font-medium">1</div>
              <button
                type="button"
                onClick={() => adjustTime(60)}
                className="text-[13px] font-medium text-white hover:opacity-90"
              >
                Add time
              </button>
              <div className="mx-auto text-center text-[30px] font-bold tracking-[-0.06em]">{currentTime}</div>
              <div className="text-[15px] font-medium">Timer 1</div>
              <div className="ml-2 flex items-center gap-2">
                <button type="button" onClick={() => setTime(0)} className="h-8 w-8 border border-white/70 bg-white/10 text-[12px] hover:bg-white/15">⏮</button>
                <button type="button" onClick={() => setTime(Math.max(0, seconds - 5))} className="h-8 w-8 border border-white/70 bg-white/10 text-[12px] hover:bg-white/15">⏸</button>
                <button type="button" onClick={isRunning ? pauseTimer : startTimer} className="h-8 w-8 border border-white/70 bg-white/10 text-[12px] hover:bg-white/15">▶</button>
              </div>
            </div>

            <div className="flex justify-center">
              <button
                type="button"
                onClick={() => setTime(Math.max(0, seconds + 60))}
                className="border border-black/70 bg-[#efefef] px-4 py-2 text-[14px] text-black hover:bg-[#e6e6e6]"
              >
                + Add Timer
              </button>
            </div>
          </div>
        </main>

        <aside className="w-[320px] border-l border-black/40 bg-[#f5f5f5] px-3 py-3">
          <div className="mb-3 flex items-center justify-between gap-2">
            <button type="button" className="border border-black/70 bg-[#efefef] px-3 py-1 text-[13px] text-black">Room</button>
            <button type="button" className="border border-black/70 bg-[#efefef] px-3 py-1 text-[13px] text-black">Save</button>
          </div>

          <div className="mt-1 flex items-center justify-between text-[13px] uppercase tracking-[0.08em] text-black">
            <span>Messages</span>
            <span>Flash</span>
          </div>

          <div className="mt-4 border border-black/70 bg-[#f0f0f0] p-2">
            <div className="mb-3 h-28 border border-black/70 bg-white/80 p-2 text-[14px] text-black/50">
              Enter message ...
            </div>

            <div className="mb-4 flex gap-2">
              {['A', 'A', 'A', 'aA'].map((tag, index) => (
                <button key={index} type="button" className="border border-black/70 bg-[#efefef] px-2 py-1 text-[12px] text-black hover:bg-[#e7e7e7]">
                  {tag}
                </button>
              ))}
            </div>

            <div className="mt-6 flex justify-center">
              <button type="button" className="border border-black/70 bg-[#efefef] px-4 py-2 text-[14px] text-black hover:bg-[#e7e7e7]">
                + Add Message
              </button>
            </div>

            <div className="mt-6 text-center text-[13px] text-black/70">Submit questions link</div>
          </div>
        </aside>
      </div>

      <footer className="absolute bottom-0 left-0 right-0 flex items-center justify-between border-t border-black/50 bg-[#f2f2f2] px-3 py-1 text-[11px] text-black/70">
        <div className="flex items-center gap-3">
          <span>stagemtimer.io</span>
          <span>v3.5.9</span>
          <span>•</span>
          <span>Docs</span>
          <span>•</span>
          <span>783 ms</span>
        </div>

        <div className="flex items-center gap-2">
          <span>0:00</span>
          <div className="h-2 w-28 overflow-hidden border border-black/70 bg-[#ddd]">
            <div className="h-full w-full bg-black/60" />
          </div>
          <span>-10:00</span>
        </div>
      </footer>
    </div>
  );
}

export default App;