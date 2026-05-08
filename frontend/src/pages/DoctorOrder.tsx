import React, { useState, useMemo, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ClipboardList, Search, Plus, Minus, Trash2, Send,
  User, Hash, ChevronDown, CheckCircle2, Package, X,
  AlertTriangle, Star, BookOpen, Save
} from 'lucide-react';
import { api, getErrorMessage } from '../api/client';
import { InventoryItem, RequestTemplate } from '../types';
import { useBarcodeScan } from '../hooks/useBarcodeScan';
import toast from 'react-hot-toast';

// ── Fuzzy filter ──────────────────────────────────────────────────────────────
function itemMatches(item: InventoryItem, query: string): boolean {
  if (!query) return true;
  const haystack = [item.name, item.sku, item.category_name, item.unit]
    .filter(Boolean).join(' ').toLowerCase();
  return query.toLowerCase().split(/\s+/).filter(Boolean).every(w => haystack.includes(w));
}

// ── Basket entry ──────────────────────────────────────────────────────────────
interface BasketEntry {
  item: InventoryItem;
  qty: number;
  notes?: string;
}

// ── Qty control ───────────────────────────────────────────────────────────────
const QtyControl: React.FC<{
  qty: number;
  step: number;
  onChange: (n: number) => void;
  onRemove: () => void;
}> = ({ qty, step, onChange, onRemove }) => {
  const dec = () => {
    const next = parseFloat((qty - step).toFixed(3));
    next <= 0 ? onRemove() : onChange(next);
  };
  const inc = () => onChange(parseFloat((qty + step).toFixed(3)));

  return (
    <div className="flex items-center gap-1">
      <button type="button" onClick={dec}
        className="w-7 h-7 rounded-full bg-slate-100 hover:bg-red-100 hover:text-red-600 flex items-center justify-center transition-colors">
        {qty <= step ? <Trash2 size={12} /> : <Minus size={12} />}
      </button>
      <input
        type="number"
        value={qty}
        min={step}
        step={step}
        onChange={e => {
          const v = parseFloat(e.target.value);
          if (!isNaN(v) && v > 0) onChange(parseFloat(v.toFixed(3)));
        }}
        className="w-14 text-center text-sm font-semibold border border-slate-200 rounded-md py-0.5 focus:outline-none focus:border-blue-400"
      />
      <button type="button" onClick={inc}
        className="w-7 h-7 rounded-full bg-slate-100 hover:bg-blue-100 hover:text-blue-600 flex items-center justify-center transition-colors">
        <Plus size={12} />
      </button>
    </div>
  );
};

// ── Success overlay ───────────────────────────────────────────────────────────
const SuccessOverlay: React.FC<{ requestNum: string; itemCount: number; onDone: () => void }> = ({
  requestNum, itemCount, onDone,
}) => (
  <div className="fixed inset-0 bg-slate-900/70 z-50 flex items-center justify-center p-4">
    <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-sm w-full text-center space-y-4">
      <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto">
        <CheckCircle2 size={32} className="text-blue-500" />
      </div>
      <h2 className="text-xl font-bold text-slate-900">Order Sent!</h2>
      <p className="text-slate-500 text-sm">
        Your request is now visible to all nurses and waiting to be accepted.
      </p>
      <div className="bg-slate-50 rounded-xl p-4 space-y-1">
        <p className="text-xs text-slate-400 uppercase tracking-wide">Request Number</p>
        <p className="font-mono font-bold text-slate-900">{requestNum}</p>
        <p className="text-sm text-slate-500 mt-1">{itemCount} item{itemCount !== 1 ? 's' : ''} requested</p>
      </div>
      <button onClick={onDone} className="btn-primary w-full">New Order</button>
    </div>
  </div>
);

// ── Priority selector ─────────────────────────────────────────────────────────
const PRIORITIES = [
  { value: 'low', label: 'Low', color: 'text-slate-500', bg: 'bg-slate-100', active: 'bg-slate-600 text-white' },
  { value: 'normal', label: 'Normal', color: 'text-blue-600', bg: 'bg-blue-50', active: 'bg-blue-600 text-white' },
  { value: 'high', label: 'High', color: 'text-amber-600', bg: 'bg-amber-50', active: 'bg-amber-500 text-white' },
  { value: 'urgent', label: 'Urgent', color: 'text-red-600', bg: 'bg-red-50', active: 'bg-red-600 text-white' },
] as const;
type Priority = 'low' | 'normal' | 'high' | 'urgent';

// ── Main page ─────────────────────────────────────────────────────────────────
const DoctorOrder: React.FC = () => {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<string | 'all'>('all');
  const [basket, setBasket] = useState<BasketEntry[]>([]);
  const [patientName, setPatientName] = useState('');
  const [patientRef, setPatientRef] = useState('');
  const [priority, setPriority] = useState<Priority>('normal');
  const [notes, setNotes] = useState('');
  const [showBasket, setShowBasket] = useState(false);
  const [successResult, setSuccessResult] = useState<{ requestNum: string; itemCount: number } | null>(null);
  const [showTemplates, setShowTemplates] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  // All active items
  const { data: inventoryData, isLoading } = useQuery({
    queryKey: ['inventory', 'order'],
    queryFn: async () => (await api.get('/inventory?limit=500&active=true')).data,
    staleTime: 60_000,
  });

  // Templates
  const { data: templates = [] } = useQuery<RequestTemplate[]>({
    queryKey: ['templates'],
    queryFn: async () => (await api.get('/templates')).data,
  });

  const saveTemplateMutation = useMutation({
    mutationFn: (name: string) => api.post('/templates', {
      name,
      items: basket.map(e => ({ inventory_item_id: e.item.id, item_name: e.item.name, quantity_requested: e.qty, unit: e.item.unit })),
    }),
    onSuccess: () => { toast.success('Template saved'); qc.invalidateQueries({ queryKey: ['templates'] }); setTemplateName(''); },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const allItems: InventoryItem[] = inventoryData?.items ?? [];

  // Barcode scanner — scan populates search box and auto-adds matched item
  useBarcodeScan({
    onScan: (code) => {
      const item = allItems.find(i => i.barcode === code || i.sku === code);
      if (item) { addToBasket(item); toast.success(`Added: ${item.name}`); }
      else { setSearch(code); searchRef.current?.focus(); }
    },
  });

  // Category list from items
  const categories = useMemo(() => {
    const map = new Map<string, { id: string; name: string; color: string }>();
    for (const item of allItems) {
      if (item.category_id && item.category_name) {
        map.set(item.category_id, { id: item.category_id, name: item.category_name, color: item.category_color || '#94a3b8' });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [allItems]);

  // Filtered items
  const visibleItems = useMemo(() => allItems.filter(item =>
    item.is_active &&
    (activeCategory === 'all' || item.category_id === activeCategory) &&
    itemMatches(item, search)
  ), [allItems, activeCategory, search]);

  // Basket helpers
  const addToBasket = (item: InventoryItem) => {
    setBasket(prev => {
      const existing = prev.find(e => e.item.id === item.id);
      if (existing) {
        const step = Number(item.dispense_unit) || 1;
        return prev.map(e => e.item.id === item.id
          ? { ...e, qty: parseFloat((e.qty + step).toFixed(3)) }
          : e);
      }
      return [...prev, { item, qty: Number(item.dispense_unit) || 1 }];
    });
  };

  const updateQty = (itemId: string, qty: number) =>
    setBasket(prev => prev.map(e => e.item.id === itemId ? { ...e, qty } : e));

  const removeFromBasket = (itemId: string) =>
    setBasket(prev => prev.filter(e => e.item.id !== itemId));

  const inBasket = (id: string) => basket.find(e => e.item.id === id);

  const basketCount = basket.reduce((s, e) => s + e.qty, 0);

  // Submit
  const { mutate: submitOrder, isPending: submitting } = useMutation({
    mutationFn: async () => {
      if (basket.length === 0) throw new Error('Add at least one item');
      const res = await api.post('/requests', {
        patient_name: patientName || null,
        patient_ref: patientRef || null,
        priority,
        notes: notes || null,
        items: basket.map(e => ({
          inventory_item_id: e.item.id,
          quantity_requested: e.qty,
        })),
      });
      return res.data;
    },
    onSuccess: (data) => {
      setSuccessResult({ requestNum: data.request_number, itemCount: basket.length });
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const resetAfterSuccess = () => {
    setBasket([]);
    setPatientName('');
    setPatientRef('');
    setPriority('normal');
    setNotes('');
    setSuccessResult(null);
  };

  const selectedPriority = PRIORITIES.find(p => p.value === priority)!;

  return (
    <div className="flex h-[calc(100vh-4rem)] overflow-hidden bg-slate-50">
      {/* ── Left: Item grid ─────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top bar */}
        <div className="bg-white border-b border-slate-200 px-4 py-3 space-y-2 flex-shrink-0">
          <div className="flex items-center gap-3">
            <h1 className="font-bold text-slate-900 text-lg flex items-center gap-2">
              <ClipboardList size={20} className="text-blue-500" /> New Stock Order
            </h1>
            <button
              className="ml-auto lg:hidden btn-primary btn-sm relative"
              onClick={() => setShowBasket(true)}
            >
              <ClipboardList size={14} /> Order
              {basket.length > 0 && (
                <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full w-4 h-4 text-xs flex items-center justify-center">
                  {basket.length}
                </span>
              )}
            </button>
          </div>
          {/* Search */}
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search items by name, SKU, category…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="input pl-8 w-full"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                <X size={14} />
              </button>
            )}
          </div>
          {/* Category pills */}
          <div className="flex gap-1.5 overflow-x-auto pb-0.5 scrollbar-none">
            <button
              onClick={() => setActiveCategory('all')}
              className={`px-3 py-1 rounded-full text-xs font-medium flex-shrink-0 transition-colors ${activeCategory === 'all' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
            >
              All
            </button>
            {categories.map(cat => (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium flex-shrink-0 transition-colors ${activeCategory === cat.id ? 'text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                style={activeCategory === cat.id ? { background: cat.color } : {}}
              >
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: activeCategory === cat.id ? 'rgba(255,255,255,0.7)' : cat.color }} />
                {cat.name}
              </button>
            ))}
          </div>
        </div>

        {/* Grid */}
        <div className="flex-1 overflow-y-auto p-4">
          {isLoading ? (
            <div className="flex items-center justify-center h-32 text-slate-400">Loading items…</div>
          ) : visibleItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-slate-400 gap-2">
              <Package size={24} />
              <span className="text-sm">{search ? `No items matching "${search}"` : 'No items in this category'}</span>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3">
              {visibleItems.map(item => {
                const entry = inBasket(item.id);
                const step = Number(item.dispense_unit) || 1;
                const outOfStock = item.quantity_on_hand <= 0;
                const lowStock = !outOfStock && item.reorder_threshold > 0 && item.quantity_on_hand <= item.reorder_threshold;

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => addToBasket(item)}
                    className={`relative flex flex-col items-start text-left rounded-xl p-3 border-2 transition-all ${
                      outOfStock
                        ? 'border-slate-100 bg-slate-50 opacity-50 cursor-not-allowed'
                        : entry
                        ? 'border-blue-500 bg-blue-50 shadow-sm'
                        : 'border-slate-200 bg-white hover:border-blue-300 hover:shadow-sm'
                    }`}
                    disabled={outOfStock}
                  >
                    <div className="w-2 h-2 rounded-full mb-2" style={{ background: item.category_color || '#94a3b8' }} />
                    <span className="text-sm font-semibold text-slate-900 leading-snug line-clamp-2 mb-1">
                      {item.name}
                    </span>
                    {item.sku && <span className="text-xs text-slate-400 mb-1">{item.sku}</span>}
                    <div className="flex items-center justify-between w-full mt-auto pt-1.5">
                      <span className={`text-xs font-medium ${outOfStock ? 'text-red-500' : lowStock ? 'text-amber-600' : 'text-slate-500'}`}>
                        {outOfStock ? 'Out of stock' : `${item.quantity_on_hand} ${item.unit}`}
                      </span>
                      {step !== 1 && !outOfStock && (
                        <span className="text-xs text-slate-400">×{step}</span>
                      )}
                    </div>
                    {/* In-basket badge */}
                    {entry && (
                      <div className="absolute top-2 right-2 bg-blue-600 text-white rounded-full w-5 h-5 text-xs font-bold flex items-center justify-center">
                        {entry.qty % 1 === 0 ? entry.qty : entry.qty.toFixed(1)}
                      </div>
                    )}
                    {lowStock && !entry && (
                      <AlertTriangle size={11} className="absolute top-2 right-2 text-amber-500" />
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Right: Order form / basket ────────────────────────────────────────── */}
      {showBasket && (
        <div className="fixed inset-0 bg-black/40 z-40 lg:hidden" onClick={() => setShowBasket(false)} />
      )}
      <div className={`
        fixed right-0 top-0 h-full w-80 z-50 lg:static lg:z-auto
        bg-white border-l border-slate-200 flex flex-col shadow-xl lg:shadow-none
        transition-transform duration-200
        ${showBasket ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'}
      `}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 flex-shrink-0">
          <h2 className="font-semibold text-slate-900 flex items-center gap-2">
            <ClipboardList size={16} className="text-blue-500" />
            Order
            {basket.length > 0 && (
              <span className="bg-blue-100 text-blue-700 rounded-full text-xs px-2 py-0.5 font-medium">
                {basket.length} line{basket.length !== 1 ? 's' : ''}
              </span>
            )}
          </h2>
          <button className="lg:hidden p-1 text-slate-400 hover:text-slate-700" onClick={() => setShowBasket(false)}>
            <X size={18} />
          </button>
        </div>

        {/* Basket items */}
        <div className="flex-1 overflow-y-auto">
          {basket.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-slate-400 gap-2 p-4">
              <ClipboardList size={24} />
              <p className="text-sm text-center">Tap items on the left to add them to your order</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-50">
              {basket.map(({ item, qty }) => {
                const step = Number(item.dispense_unit) || 1;
                return (
                  <div key={item.id} className="px-4 py-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-900 truncate">{item.name}</p>
                        <p className="text-xs text-slate-400">{item.unit}</p>
                      </div>
                      <button onClick={() => removeFromBasket(item.id)} className="p-1 text-slate-300 hover:text-red-500 flex-shrink-0">
                        <Trash2 size={13} />
                      </button>
                    </div>
                    <QtyControl
                      qty={qty}
                      step={step}
                      onChange={n => updateQty(item.id, n)}
                      onRemove={() => removeFromBasket(item.id)}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Order details form */}
        <div className="border-t border-slate-200 flex-shrink-0 p-4 space-y-3 bg-slate-50">
          {/* Priority */}
          <div>
            <label className="label flex items-center gap-1"><Star size={12} /> Priority</label>
            <div className="grid grid-cols-4 gap-1">
              {PRIORITIES.map(p => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => setPriority(p.value)}
                  className={`py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    priority === p.value ? p.active : `${p.bg} ${p.color}`
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Patient info */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label flex items-center gap-1"><User size={12} /> Patient</label>
              <input
                type="text"
                placeholder="Name"
                value={patientName}
                onChange={e => setPatientName(e.target.value)}
                className="input"
              />
            </div>
            <div>
              <label className="label flex items-center gap-1"><Hash size={12} /> Ref</label>
              <input
                type="text"
                placeholder="ID / DOB"
                value={patientRef}
                onChange={e => setPatientRef(e.target.value)}
                className="input"
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="label">Notes for nurses</label>
            <textarea
              rows={2}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              className="input resize-none"
              placeholder="Any special instructions…"
            />
          </div>

          {/* Templates */}
          <div className="pt-1 border-t border-slate-200 dark:border-slate-700">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <button onClick={() => setShowTemplates(t => !t)} className="btn-secondary btn-sm w-full flex items-center gap-1">
                  <BookOpen size={13} /> Load Template
                  <ChevronDown size={11} className="ml-auto" />
                </button>
                {showTemplates && (
                  <div className="absolute bottom-full left-0 mb-1 w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg shadow-lg z-10 max-h-48 overflow-y-auto">
                    {templates.length === 0 ? (
                      <p className="text-xs text-slate-400 p-3">No saved templates yet</p>
                    ) : templates.map(t => (
                      <button key={t.id} onClick={() => {
                        setBasket(t.items.map(ti => {
                          const item = allItems.find(i => i.id === ti.inventory_item_id);
                          return item ? { item, qty: ti.quantity_requested } : null;
                        }).filter(Boolean) as BasketEntry[]);
                        setShowTemplates(false);
                        toast.success(`Template "${t.name}" loaded`);
                      }} className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-700 border-b border-slate-100 dark:border-slate-700 last:border-0">
                        <p className="font-medium text-slate-900 dark:text-slate-100">{t.name}</p>
                        <p className="text-xs text-slate-400">{t.items.length} item{t.items.length !== 1 ? 's' : ''}</p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {basket.length > 0 && (
                <div className="flex gap-1 flex-1">
                  <input value={templateName} onChange={e => setTemplateName(e.target.value)}
                    placeholder="Template name…" className="input text-xs flex-1 py-1.5" />
                  <button onClick={() => templateName && saveTemplateMutation.mutate(templateName)}
                    disabled={!templateName || saveTemplateMutation.isPending}
                    className="btn-secondary btn-sm px-2" title="Save as template">
                    <Save size={12} />
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Summary + submit */}
          <div className="pt-1">
            <div className="flex items-baseline justify-between mb-3">
              <span className="text-sm font-medium text-slate-600">
                {basket.length === 0
                  ? 'No items yet'
                  : `${basket.length} item type${basket.length !== 1 ? 's' : ''}, ${basketCount} units total`}
              </span>
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${selectedPriority.active}`}>
                {selectedPriority.label}
              </span>
            </div>
            <button
              type="button"
              disabled={submitting || basket.length === 0}
              onClick={() => submitOrder()}
              className="btn-primary w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700"
            >
              {submitting ? (
                <>Sending…</>
              ) : (
                <><Send size={15} /> Send to Nurses</>
              )}
            </button>
            <p className="text-xs text-slate-400 text-center mt-2">
              Nurses will see this request and mark it when fulfilled
            </p>
          </div>
        </div>
      </div>

      {/* Success */}
      {successResult && (
        <SuccessOverlay
          requestNum={successResult.requestNum}
          itemCount={successResult.itemCount}
          onDone={resetAfterSuccess}
        />
      )}
    </div>
  );
};

export default DoctorOrder;
