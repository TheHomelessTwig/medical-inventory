/**
 * Detects USB/Bluetooth barcode scanner input.
 * Scanners typically emit keystrokes very quickly and end with Enter.
 * A human typing is too slow to trigger this; a scan completes in < 100ms.
 */

import { useEffect, useRef, useCallback } from 'react';

interface Options {
  onScan: (code: string) => void;
  /** Minimum characters for a valid scan (default: 3) */
  minLength?: number;
  /** Max ms between keystrokes (default: 50) */
  timeoutMs?: number;
  enabled?: boolean;
}

export function useBarcodeScan({ onScan, minLength = 3, timeoutMs = 50, enabled = true }: Options) {
  const bufferRef  = useRef<string>('');
  const timerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastKeyRef = useRef<number>(0);

  const flush = useCallback(() => {
    const code = bufferRef.current.trim();
    bufferRef.current = '';
    if (code.length >= minLength) onScan(code);
  }, [onScan, minLength]);

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Skip if focus is inside a form field (user is typing manually)
      const target = e.target as HTMLElement;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;

      const now = Date.now();
      const gap = now - lastKeyRef.current;
      lastKeyRef.current = now;

      if (e.key === 'Enter') {
        if (timerRef.current) clearTimeout(timerRef.current);
        flush();
        return;
      }

      // If the gap is too large, reset the buffer (user is typing manually)
      if (bufferRef.current.length > 0 && gap > timeoutMs * 3) {
        bufferRef.current = '';
      }

      if (e.key.length === 1) {
        bufferRef.current += e.key;
      }

      // Auto-flush after timeout (some scanners don't send Enter)
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(flush, timeoutMs * 4);
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [enabled, timeoutMs, flush]);
}
