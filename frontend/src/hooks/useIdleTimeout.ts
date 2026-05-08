import { useEffect, useRef, useCallback } from 'react';

interface Options {
  /** Minutes of inactivity before the warning appears. Default 28. */
  warningAfterMinutes?: number;
  /** Minutes after the warning before auto-logout. Default 2. */
  logoutAfterWarningMinutes?: number;
  onWarning: () => void;
  onLogout: () => void;
  enabled?: boolean;
}

const EVENTS = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'click'];

/**
 * Watches for user inactivity. Fires onWarning after warningAfterMinutes of idle,
 * then fires onLogout after an additional logoutAfterWarningMinutes if no activity.
 */
export function useIdleTimeout({
  warningAfterMinutes = 28,
  logoutAfterWarningMinutes = 2,
  onWarning,
  onLogout,
  enabled = true,
}: Options) {
  const warningTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const logoutTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isWarningShown = useRef(false);

  const clearTimers = useCallback(() => {
    if (warningTimer.current) clearTimeout(warningTimer.current);
    if (logoutTimer.current) clearTimeout(logoutTimer.current);
  }, []);

  const resetTimers = useCallback(() => {
    if (!enabled) return;
    clearTimers();
    isWarningShown.current = false;

    warningTimer.current = setTimeout(() => {
      isWarningShown.current = true;
      onWarning();
      logoutTimer.current = setTimeout(() => {
        onLogout();
      }, logoutAfterWarningMinutes * 60 * 1000);
    }, warningAfterMinutes * 60 * 1000);
  }, [enabled, warningAfterMinutes, logoutAfterWarningMinutes, onWarning, onLogout, clearTimers]);

  const handleActivity = useCallback(() => {
    // Don't reset if warning is already showing — user must explicitly dismiss it
    if (!isWarningShown.current) resetTimers();
  }, [resetTimers]);

  useEffect(() => {
    if (!enabled) return;
    resetTimers();
    EVENTS.forEach(e => window.addEventListener(e, handleActivity, { passive: true }));
    return () => {
      clearTimers();
      EVENTS.forEach(e => window.removeEventListener(e, handleActivity));
    };
  }, [enabled, resetTimers, handleActivity, clearTimers]);

  /** Call this when the user clicks "Stay logged in" in the warning dialog. */
  const stayLoggedIn = useCallback(() => {
    isWarningShown.current = false;
    resetTimers();
  }, [resetTimers]);

  return { stayLoggedIn };
}
