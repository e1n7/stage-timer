import React, { useState } from 'react';
import TimerDisplay from './components/TimerDisplay';
import TimerControls from './components/TimerControls';
import LogPanel from './components/LogPanel';
import { useTimer } from './hooks/useTimer';

function App() {
  const {
    time,
    mode,
    setMode,
    setTime,
    startTimer,
    pauseTimer,
    resetTimer,
    isRunning,
    warnings,
    settings
  } = useTimer();

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white shadow-md p-6">
        <h1 className="text-3xl font-bold text-center text-gray-800">
          Stage Timer
        </h1>
        <div className="flex justify-center mt-4 space-x-4">
          <button
            onClick={() => setMode('countdown')}
            className={`px-4 py-2 rounded ${
              mode === 'countdown' ? 'bg-blue-500 text-white' : 'bg-gray-200'
            }`}
          >
            Countdown
          </button>
          <button
            onClick={() => setMode('countup')}
            className={`px-4 py-2 rounded ${
              mode === 'countup' ? 'bg-blue-500 text-white' : 'bg-gray-200'
            }`}
          >
            Count Up
          </button>
          <button
            onClick={() => setMode('time')}
            className={`px-4 py-2 rounded ${
              mode === 'time' ? 'bg-blue-500 text-white' : 'bg-gray-200'
            }`}
          >
            Time of Day
          </button>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center p-8">
        <TimerDisplay
          time={time}
          mode={mode}
          warnings={warnings}
          settings={settings}
          onTimeChange={setTime}
        />
      </main>

      <section className="bg-white shadow-md p-6 flex flex-col space-y-4">
        <TimerControls
          isRunning={isRunning}
          startTimer={startTimer}
          pauseTimer={pauseTimer}
          resetTimer={resetTimer}
          onTimeChange={setTime}
          mode={mode}
          defaultTime={settings.defaultTime ?? 0}
        />
      </section>

      <section className="bg-white shadow-md p-6">
        <LogPanel />
      </section>
    </div>
  );
}

export default App;