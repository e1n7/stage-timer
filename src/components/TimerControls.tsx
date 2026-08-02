import React from 'react';

interface TimerControlsProps {
  isRunning: boolean;
  onStart: () => void;
  onPause: () => void;
  onReset: () => void;
  onTimeChange: (seconds: number) => void;
  mode: string;
  defaultTime: number;
}

const TimerControls: React.FC<TimerControlsProps> = ({
  isRunning,
  onStart,
  onPause,
  onReset,
  onTimeChange,
  mode,
  defaultTime
}) => {
  const handlePresetClick = (minutes: number) => {
    onTimeChange(minutes * 60);
  };

  return (
    <div className="flex flex-col items-center gap-6">
      {/* Preset time buttons */}
      <div className="flex flex-wrap justify-center gap-2">
        <button
          onClick={() => handlePresetClick(1)}
          className="px-3 py-1 bg-gray-200 rounded text-sm hover:bg-gray-300 transition-colors"
        >
          1 min
        </button>
        <button
          onClick={() => handlePresetClick(3)}
          className="px-3 py-1 bg-gray-200 rounded text-sm hover:bg-gray-300 transition-colors"
        >
          3 min
        </button>
        <button
          onClick={() => handlePresetClick(5)}
          className="px-3 py-1 bg-gray-200 rounded text-sm hover:bg-gray-300 transition-colors"
        >
          5 min
        </button>
        <button
          onClick={() => handlePresetClick(10)}
          className="px-3 py-1 bg-gray-200 rounded text-sm hover:bg-gray-300 transition-colors"
        >
          10 min
        </button>
        <button
          onClick={() => handlePresetClick(15)}
          className="px-3 py-1 bg-gray-200 rounded text-sm hover:bg-gray-300 transition-colors"
        >
          15 min
        </button>
        <button
          onClick={() => handlePresetClick(30)}
          className="px-3 py-1 bg-gray-200 rounded text-sm hover:bg-gray-300 transition-colors"
        >
          30 min
        </button>
      </div>

      {/* Main control buttons */}
      <div className="flex gap-4">
        {!isRunning ? (
          <button
            onClick={onStart}
            className="px-8 py-3 bg-green-500 text-white rounded-lg font-semibold hover:bg-green-600 transition-colors shadow-lg"
          >
            Start
          </button>
        ) : (
          <button
            onClick={onPause}
            className="px-8 py-3 bg-yellow-500 text-white rounded-lg font-semibold hover:bg-yellow-600 transition-colors shadow-lg"
          >
            Pause
          </button>
        )}
        <button
          onClick={onReset}
          className="px-8 py-3 bg-gray-500 text-white rounded-lg font-semibold hover:bg-gray-600 transition-colors shadow-lg"
        >
          Reset
        </button>
      </div>

      {/* Manual time input */}
      <div className="flex items-center gap-2">
        <label htmlFor="time-input" className="text-sm text-gray-600">
          Set time (seconds):
        </label>
        <input
          id="time-input"
          type="number"
          min="0"
          defaultValue={defaultTime}
          className="w-24 px-3 py-1 border border-gray-300 rounded text-center"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              const val = parseInt(e.currentTarget.value, 10);
              if (!isNaN(val) && val >= 0) {
                onTimeChange(val);
              }
            }
          }}
        />
      </div>
    </div>
  );
};

export default TimerControls;