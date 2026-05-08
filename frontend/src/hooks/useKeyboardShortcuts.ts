/**
 * Application-wide keyboard shortcuts.
 * Skips when focus is inside an input/textarea/select.
 */

import { useEffect } from 'react';

export interface ShortcutMap {
  /** Focus a search input */
  onSearch?: () => void;
  /** Open new-item / new-request modal */
  onNew?: () => void;
  /** Close current modal / cancel */
  onClose?: () => void;
  /** Show keyboard shortcut help overlay */
  onHelp?: () => void;
}

function isTyping(): boolean {
  const el = document.activeElement as HTMLElement | null;
  if (!el) return false;
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) ||
    el.isContentEditable;
}

export function useKeyboardShortcuts(shortcuts: ShortcutMap, enabled = true) {
  useEffect(() => {
    if (!enabled) return;

    const handle = (e: KeyboardEvent) => {
      // Never fire when modifier keys are held
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      if (e.key === 'Escape') {
        shortcuts.onClose?.();
        return;
      }

      // The rest only fire when NOT typing
      if (isTyping()) return;

      if (e.key === '/' || e.key === 'f') {
        e.preventDefault();
        shortcuts.onSearch?.();
      } else if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        shortcuts.onNew?.();
      } else if (e.key === '?') {
        shortcuts.onHelp?.();
      }
    };

    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  }, [shortcuts, enabled]);
}

// ── Global shortcut list for the help overlay ─────────────────────────────────
export const SHORTCUT_DESCRIPTIONS = [
  { key: '/',   description: 'Focus search bar' },
  { key: 'N',   description: 'New item / order / request' },
  { key: 'Esc', description: 'Close modal / cancel' },
  { key: '?',   description: 'Show this help' },
] as const;
