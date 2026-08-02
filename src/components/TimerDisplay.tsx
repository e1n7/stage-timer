import { useTimer } from '../hooks/useTimer';
import clsx from 'clsx';

type TimerProps = {
  time: number;
  mode: string;
  warnings: string[];
  settings: any;
  onTimeChange?: (seconds: number) => void;
};

const bgClass = {
  safe: 'bg-green-500',
  warning: 'bg-yellow-500',
  danger: 'bg-red-500',
};

const formatTime = (seconds: number): string => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(secs)}` : `${pad(minutes)}:${pad(secs)}`;
};

const TimerDisplay: React.FC<TimerProps> = ({ time, mode, warnings, settings, onTimeChange }) => {
  const displayValue = formatTime(time);
  const colorClass = bgClass[warnings.join('') as keyof typeof bgClass] || bgClass.safe;

  return (
    <div className={`text-center flex flex-col items-center justify-center h-32 w-36 rounded-lg p-4 text-3xl font-bold transition-all duration-500 $${colorClass.replace('-', '')}`}>
      {displayValue}
      <div className="mt-2">
        {mode === 'countdown' && (
          <span className="text-sm font-medium text-gray-600">
            Time remaining
          </span>
        )}
        {mode === 'countup' && (
          <span className="text-sm font-medium text-gray-600">
            Elapsed time
          </span>
        )}
        {mode === 'time' && (
          <span className="text-sm font-medium text-gray-600">
            System time
          </span>
        )}
      </div>
    </div>
  );
};

export default TimerDisplay;