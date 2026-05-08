import React from 'react';
import { Keyboard, X } from 'lucide-react';
import { SHORTCUT_DESCRIPTIONS } from '../hooks/useKeyboardShortcuts';

const KeyboardHelpOverlay: React.FC<{ onClose: () => void }> = ({ onClose }) => (
  <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
    <div
      className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl p-6 w-full max-w-sm"
      onClick={e => e.stopPropagation()}
    >
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
          <Keyboard size={18} /> Keyboard Shortcuts
        </h2>
        <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
          <X size={16} />
        </button>
      </div>
      <table className="w-full text-sm">
        <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
          {SHORTCUT_DESCRIPTIONS.map(s => (
            <tr key={s.key}>
              <td className="py-2 pr-4">
                <kbd className="px-2 py-0.5 text-xs font-mono bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded border border-slate-200 dark:border-slate-600">
                  {s.key}
                </kbd>
              </td>
              <td className="py-2 text-slate-600 dark:text-slate-300">{s.description}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-xs text-slate-400 dark:text-slate-500 mt-4 text-center">
        Shortcuts are disabled while typing in fields
      </p>
    </div>
  </div>
);

export default KeyboardHelpOverlay;
