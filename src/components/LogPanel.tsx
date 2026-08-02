import React from 'react';
import { useTimer } from '../hooks/useTimer';

interface LogEntry {
  id: string;
  date: string;
  duration: number;
  mode: string;
  notes?: string;
}

const LogPanel: React.FC = () => {
  const { log, clearLog, formatDuration, formatLogDate } = useTimer();

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-center text-gray-800">
        Session Log
      </h2>

      {log.length === 0 ? (
        <p className="text-center text-gray-500 py-8">
          No sessions recorded yet
        </p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-gray-100">
                  <th className="p-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Time
                  </th>
                  <th className="p-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Duration
                  </th>
                  <th className="p-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Mode
                  </th>
                  <th className="p-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-16">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {log.map((entry: LogEntry) => (
                  <tr key={entry.id} className="hover:bg-gray-50">
                    <td className="p-3 text-sm text-gray-700">
                      {formatLogDate(entry.date)}
                    </td>
                    <td className="p-3 text-sm font-mono text-gray-700">
                      {formatDuration(entry.duration)}
                    </td>
                    <td className="p-3 text-sm text-gray-700 capitalize">
                      {entry.mode}
                    </td>
                    <td className="p-3 text-center space-x-2">
                      <button
                        onClick={() => {
                          alert(`Notes: ${entry.notes || 'No notes'}`);
                        }}
                        className="px-2 py-1 bg-blue-500 text-white text-xs rounded hover:bg-blue-600"
                      >
                        Notes
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex justify-center mt-4">
            <button
              onClick={clearLog}
              className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
              disabled={log.length === 0}
            >
              Clear Log
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default LogPanel; 