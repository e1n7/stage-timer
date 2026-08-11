import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { TimerOutput } from './components/TimerOutput';
import './style.css';

const isOutput = window.location.pathname === '/output';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    {isOutput ? <TimerOutput /> : <App />}
  </React.StrictMode>
);
