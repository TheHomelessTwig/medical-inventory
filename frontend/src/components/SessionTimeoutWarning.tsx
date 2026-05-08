import React, { useEffect, useState } from 'react';
import { Clock, LogOut, RefreshCw } from 'lucide-react';

interface Props {
  isOpen: boolean;
  secondsRemaining: number;
  onStayLoggedIn: () => void;
  onLogout: () => void;
}

const SessionTimeoutWarning: React.FC<Props> = ({
  isOpen, secondsRemaining, onStayLoggedIn, onLogout,
}) => {
  if (!isOpen) return null;

  const mins = Math.floor(secondsRemaining / 60);
  const secs = secondsRemaining % 60;
  const timeStr = mins > 0
    ? `${mins}:${String(secs).padStart(2, '0')}`
    : `${secs}s`;

  const urgency = secondsRemaining <= 30;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/70 backdrop-blur-sm" />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-8 text-center">
        <div className={`inline-flex items-center justify-center w-16 h-16 rounded-full mb-5 ${urgency ? 'bg-red-100' : 'bg-amber-100'}`}>
          <Clock size={32} className={urgency ? 'text-red-600' : 'text-amber-600'} />
        </div>

        <h2 className="text-xl font-bold text-slate-900 mb-2">Session Expiring</h2>
        <p className="text-slate-500 text-sm mb-4">
          You've been inactive. Your session will end automatically.
        </p>

        <div className={`text-4xl font-mono font-bold mb-6 tabular-nums ${urgency ? 'text-red-600' : 'text-amber-600'}`}>
          {timeStr}
        </div>

        <div className="flex gap-3">
          <button
            onClick={onLogout}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 text-sm font-medium transition-colors"
          >
            <LogOut size={15} />
            Log out now
          </button>
          <button
            onClick={onStayLoggedIn}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 text-sm font-medium transition-colors"
          >
            <RefreshCw size={15} />
            Stay logged in
          </button>
        </div>
      </div>
    </div>
  );
};

export default SessionTimeoutWarning;
