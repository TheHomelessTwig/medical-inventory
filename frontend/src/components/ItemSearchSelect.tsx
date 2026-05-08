import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Search, X, Package } from 'lucide-react';
import { InventoryItem } from '../types';

interface Props {
  items: InventoryItem[];
  value: InventoryItem | null;
  onChange: (item: InventoryItem | null) => void;
  placeholder?: string;
  disabled?: boolean;
  /** Only show items with stock > 0 */
  requireStock?: boolean;
}

// ── Fuzzy scoring ────────────────────────────────────────────────────────────
// Returns a score >= 0 (higher = better match), or -1 if no match at all.
// Each space-separated word in the query must appear as a substring of the
// item's searchable text (name | sku | category | unit).
function fuzzyScore(item: InventoryItem, query: string): number {
  if (!query) return 1;
  const haystack = [item.name, item.sku, item.category_name, item.unit]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return 1;

  let score = 0;
  for (const word of words) {
    const idx = haystack.indexOf(word);
    if (idx === -1) return -1;           // must contain ALL words
    // Prefer matches at the start of the item name
    if (item.name.toLowerCase().startsWith(word)) score += 3;
    else if (item.name.toLowerCase().includes(word)) score += 2;
    else score += 1;
  }
  return score;
}

const ItemSearchSelect: React.FC<Props> = ({
  items,
  value,
  onChange,
  placeholder = 'Search items…',
  disabled = false,
  requireStock = false,
}) => {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const pool = requireStock ? items.filter(i => i.quantity_on_hand > 0 && i.is_active) : items.filter(i => i.is_active);

  const filtered = pool
    .map(item => ({ item, score: fuzzyScore(item, query) }))
    .filter(r => r.score > 0)
    .sort((a, b) => b.score - a.score || a.item.name.localeCompare(b.item.name))
    .map(r => r.item);

  // Close when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Reset highlight when filtered list changes
  useEffect(() => setHighlighted(0), [query]);

  const select = useCallback((item: InventoryItem) => {
    onChange(item);
    setQuery('');
    setOpen(false);
  }, [onChange]);

  const clear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(null);
    setQuery('');
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open) { if (e.key !== 'Escape') setOpen(true); return; }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlighted(h => Math.min(h + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlighted(h => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filtered[highlighted]) select(filtered[highlighted]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  // Scroll highlighted item into view
  useEffect(() => {
    const el = listRef.current?.children[highlighted] as HTMLElement;
    el?.scrollIntoView({ block: 'nearest' });
  }, [highlighted]);

  const stockColor = (qty: number, threshold: number) => {
    if (qty <= 0) return 'text-red-600';
    if (threshold > 0 && qty <= threshold) return 'text-amber-600';
    return 'text-emerald-600';
  };

  return (
    <div ref={containerRef} className="relative">
      {/* Selected value display / search input */}
      <div
        className={`flex items-center gap-2 input pr-8 cursor-text ${disabled ? 'opacity-50 pointer-events-none' : ''}`}
        onClick={() => { if (!disabled) { setOpen(true); inputRef.current?.focus(); } }}
      >
        {value && !open ? (
          <span className="flex-1 truncate text-slate-900 text-sm">{value.name}</span>
        ) : (
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => { setQuery(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            onKeyDown={handleKeyDown}
            placeholder={value ? value.name : placeholder}
            className="flex-1 bg-transparent outline-none text-sm placeholder-slate-400 min-w-0"
          />
        )}
        {value ? (
          <button type="button" onClick={clear} className="flex-shrink-0 text-slate-400 hover:text-slate-600">
            <X size={14} />
          </button>
        ) : (
          <Search size={14} className="flex-shrink-0 text-slate-400" />
        )}
      </div>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden">
          <ul ref={listRef} className="max-h-64 overflow-y-auto divide-y divide-slate-50">
            {filtered.length === 0 ? (
              <li className="flex items-center gap-2 px-3 py-3 text-sm text-slate-400">
                <Package size={14} />
                {query ? `No items matching "${query}"` : 'No items available'}
              </li>
            ) : filtered.map((item, idx) => (
              <li
                key={item.id}
                className={`flex items-start gap-3 px-3 py-2.5 cursor-pointer transition-colors ${
                  idx === highlighted ? 'bg-indigo-50' : 'hover:bg-slate-50'
                }`}
                onMouseEnter={() => setHighlighted(idx)}
                onMouseDown={e => { e.preventDefault(); select(item); }}
              >
                {/* Category colour dot */}
                <div
                  className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0"
                  style={{ background: item.category_color || '#94a3b8' }}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2">
                    <span className="text-sm font-medium text-slate-900 truncate">{item.name}</span>
                    {item.sku && <span className="text-xs text-slate-400 flex-shrink-0">{item.sku}</span>}
                  </div>
                  <div className="flex items-center gap-3 mt-0.5">
                    {item.category_name && (
                      <span className="text-xs text-slate-400">{item.category_name}</span>
                    )}
                    <span className={`text-xs font-medium ${stockColor(item.quantity_on_hand, item.reorder_threshold)}`}>
                      {item.quantity_on_hand} {item.unit}
                    </span>
                  </div>
                </div>
                {item.internal_price != null && (
                  <span className="text-xs font-medium text-slate-700 flex-shrink-0 mt-0.5">
                    ${Number(item.internal_price).toFixed(2)}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default ItemSearchSelect;
