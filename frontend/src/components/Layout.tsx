import React, { useState, useCallback, useRef } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';
import SessionTimeoutWarning from './SessionTimeoutWarning';
import { useIdleTimeout } from '../hooks/useIdleTimeout';
import { useNotifications } from '../hooks/useNotifications';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';

const WARNING_MINUTES = 28;   // show warning after this many idle minutes
const LOGOUT_MINUTES = 2;     // auto-logout this many minutes after warning

const Layout: React.FC = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showWarning, setShowWarning] = useState(false);
  const [countdown, setCountdown] = useState(LOGOUT_MINUTES * 60);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const { logout } = useAuth();
  const navigate = useNavigate();

  // Ambient notification polling (beep + toast on new requests/receipts)
  useNotifications();

  const stopCountdown = useCallback(() => {
    if (countdownRef.current) clearInterval(countdownRef.current);
    countdownRef.current = null;
  }, []);

  const startCountdown = useCallback(() => {
    setCountdown(LOGOUT_MINUTES * 60);
    countdownRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          stopCountdown();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, [stopCountdown]);

  const handleWarning = useCallback(() => {
    setShowWarning(true);
    startCountdown();
  }, [startCountdown]);

  const handleAutoLogout = useCallback(async () => {
    setShowWarning(false);
    stopCountdown();
    await logout();
    toast.error('You were logged out due to inactivity.');
    navigate('/login');
  }, [logout, navigate, stopCountdown]);

  const { stayLoggedIn } = useIdleTimeout({
    warningAfterMinutes: WARNING_MINUTES,
    logoutAfterWarningMinutes: LOGOUT_MINUTES,
    onWarning: handleWarning,
    onLogout: handleAutoLogout,
    enabled: true,
  });

  const handleStayLoggedIn = useCallback(() => {
    setShowWarning(false);
    stopCountdown();
    stayLoggedIn();
  }, [stayLoggedIn, stopCountdown]);

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 dark:bg-slate-950">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-slate-900/50 z-20 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed inset-y-0 left-0 z-30 w-64 bg-slate-900 flex-shrink-0 transition-transform duration-300
        lg:static lg:translate-x-0
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <Sidebar onClose={() => setSidebarOpen(false)} />
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Header onMenuClick={() => setSidebarOpen(true)} />
        <main className="flex-1 overflow-y-auto">
          <div className="px-4 py-6 sm:px-6 lg:px-8 max-w-[1600px] mx-auto">
            <Outlet />
          </div>
        </main>
      </div>

      {/* Session timeout warning */}
      <SessionTimeoutWarning
        isOpen={showWarning}
        secondsRemaining={countdown}
        onStayLoggedIn={handleStayLoggedIn}
        onLogout={handleAutoLogout}
      />
    </div>
  );
};

export default Layout;
