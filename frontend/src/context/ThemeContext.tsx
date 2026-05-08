import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

// ── Accent colour presets ─────────────────────────────────────────────────────
export const ACCENT_PRESETS = [
  { name: 'Blue',    value: '#2563eb', dark: '#1d4ed8', ring: '#93c5fd' },
  { name: 'Indigo',  value: '#4f46e5', dark: '#4338ca', ring: '#a5b4fc' },
  { name: 'Violet',  value: '#7c3aed', dark: '#6d28d9', ring: '#c4b5fd' },
  { name: 'Rose',    value: '#e11d48', dark: '#be123c', ring: '#fda4af' },
  { name: 'Amber',   value: '#d97706', dark: '#b45309', ring: '#fcd34d' },
  { name: 'Emerald', value: '#059669', dark: '#047857', ring: '#6ee7b7' },
  { name: 'Cyan',    value: '#0891b2', dark: '#0e7490', ring: '#67e8f9' },
  { name: 'Slate',   value: '#475569', dark: '#334155', ring: '#94a3b8' },
] as const;

export type ThemeMode = 'light' | 'dark';

interface ThemeContextValue {
  mode: ThemeMode;
  toggleMode: () => void;
  setMode: (m: ThemeMode) => void;
  accent: string;
  setAccent: (hex: string) => void;
  accentPresets: typeof ACCENT_PRESETS;
  notificationSound: boolean;
  setNotificationSound: (on: boolean) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

// ── Apply accent to CSS custom properties ─────────────────────────────────────
function applyAccent(hex: string) {
  const preset = ACCENT_PRESETS.find(p => p.value === hex);
  document.documentElement.style.setProperty('--accent', hex);
  document.documentElement.style.setProperty(
    '--accent-dark',
    preset?.dark ?? shadeHex(hex, -20)
  );
  document.documentElement.style.setProperty(
    '--accent-ring',
    preset?.ring ?? hex + '80'
  );
}

// Simple hex darkener for custom colours
function shadeHex(hex: string, pct: number): string {
  const num = parseInt(hex.replace('#', ''), 16);
  const amt = Math.round(2.55 * pct);
  const r = Math.min(255, Math.max(0, (num >> 16) + amt));
  const g = Math.min(255, Math.max(0, ((num >> 8) & 0xff) + amt));
  const b = Math.min(255, Math.max(0, (num & 0xff) + amt));
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

const LS_MODE   = 'shit-theme-mode';
const LS_ACCENT = 'shit-theme-accent';
const LS_SOUND  = 'shit-notif-sound';

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [mode, setModeState] = useState<ThemeMode>(() =>
    (localStorage.getItem(LS_MODE) as ThemeMode) || 'light'
  );
  const [accent, setAccentState] = useState<string>(
    () => localStorage.getItem(LS_ACCENT) || ACCENT_PRESETS[0].value
  );
  const [notificationSound, setNotificationSoundState] = useState<boolean>(
    () => localStorage.getItem(LS_SOUND) !== 'false'
  );

  // Apply mode class to <html>
  useEffect(() => {
    const root = document.documentElement;
    if (mode === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem(LS_MODE, mode);
  }, [mode]);

  // Apply accent CSS variables
  useEffect(() => {
    applyAccent(accent);
    localStorage.setItem(LS_ACCENT, accent);
  }, [accent]);

  const toggleMode = useCallback(() =>
    setModeState(m => m === 'light' ? 'dark' : 'light'), []);

  const setMode = useCallback((m: ThemeMode) => setModeState(m), []);

  const setAccent = useCallback((hex: string) => setAccentState(hex), []);

  const setNotificationSound = useCallback((on: boolean) => {
    setNotificationSoundState(on);
    localStorage.setItem(LS_SOUND, String(on));
  }, []);

  return (
    <ThemeContext.Provider value={{
      mode, toggleMode, setMode,
      accent, setAccent, accentPresets: ACCENT_PRESETS,
      notificationSound, setNotificationSound,
    }}>
      {children}
    </ThemeContext.Provider>
  );
};

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
