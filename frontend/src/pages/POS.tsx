import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ShoppingCart, Search, Plus, Minus, Trash2, Send,
  User, Hash, ChevronDown, CheckCircle2, Package, X,
  Stethoscope, AlertTriangle
} from 'lucide-react';
import { api, getErrorMessage } from '../api/client';
import { InventoryItem } from '../types';
import toast from 'react-hot-toast';

// ── Fuzzy filter (same logic as ItemSearchSelect) ────────────────────────────
function itemMatches(item: InventoryItem, query: string): boolean {
  if (!query) return true;
  const haystack = [item.name, item.sku, item.category_name, item.unit]
    .filter(Boolean).join(' ').toLowerCase();
  return query.toLowerCase().split(/\s+/).filter(Boolean).every(w => haystack.includes(w));
}

// ── Basket item ───────────────────────────────────────────────────────────────
interface BasketEntry {
  item: InventoryItem;
  qty: number;
}

// ── Qty selector pill ─────────────────────────────────────────────────────────
const QtyControl: React.FC<{
  qty: number;
  step: number;
  max: number;
  onChange: (n: number) => void;
  onRemove: () => void;
}> = ({ qty, step, max, onChange, onRemove }) => {
  const dec = () => {
    const next = Math.max(0, parseFloat((qty - step).toFixed(3)));
    next === 0 ? onRemove() : onChange(next);
  };
  const inc = () => {
    const next = Math.min(max, parseFloat((qty + step).toFixed(3)));
    onChange(next);
  };
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
        max={max}
        step={step}
        onChange={e => {
          const v = parseFloat(e.target.value);
          if (!isNaN(v) && v > 0 && v <= max) onChange(parseFloat(v.toFixed(3)));
        }}
        className="w-14 text-center text-sm font-semibold border border-slate-200 rounded-md py-0.5 focus:outline-none focus:border-indigo-400"
      />
      <button type="button" onClick={inc}
        className="w-7 h-7 rounded-full bg-slate-100 hover:bg-indigo-100 hover:text-indigo-600 flex items-center justify-center transition-colors">
        <Plus size={12} />
      </button>
    </div>
  );
};

// ── Success overlay ────────────────────────────────────────────────────────────
const SuccessOverlay: React.FC<{ chargeNum: string; total: number; onDone: () => void }> = ({ chargeNum, total, onDone }) => (
  <div className="fixed inset-0 bg-slate-900/70 z-50 flex items-center justify-center p-4">
    <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-sm w-full text-center space-y-4">
      <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto">
        <CheckCircle2 size={32} className="text-emerald-500" />
      </div>
      <h2 className="text-xl font-bold text-slate-900">Charge Recorded</h2>
      <p className="text-slate-500 text-sm">The receipt has been sent to the doctor.</p>
      <div className="bg-slate-50 rounded-xl p-4 space-y-1">
        <p className="text-xs text-slate-400 uppercase tracking-wide">Reference</p>
        <p className="font-mono font-bold text-slate-900">{chargeNum}</p>
        <p className="text-2xl font-bold text-emerald-600 mt-2">${total.toFixed(2)}</p>
      </div>
      <button onClick={onDone} className="btn-primary w-full">New Charge</button>
    </div>
  </div>
);

// ── Main POS page ─────────────────────────────────────────────────────────────
const POS: React.FC = () => {
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<string | 'all'>('all');
  const [basket, setBasket] = useState<BasketEntry[]>([]);
  const [patientName, setPatientName] = useState('');
  const [patientRef, setPatientRef] = useState('');
  const [doctorId, setDoctorId] = useState('');
  const [notes, setNotes] = useState('');
  const [showBasket, setShowBasket] = useState(false);
  const [successResult, setSuccessResult] = useState<{ chargeNum: string; total: number } | null>(null);

  // Fetch all active inventory items
  const { data: inventoryData, isLoading: itemsLoading } = useQuery({
    queryKey: ['inventory', 'pos'],
    queryFn: async () => (await api.get('/inventory?limit=500&active=true')).data,
    staleTime: 60_000,
  });

  // Fetch doctors for selector
  const { data: doctorsData } = useQuery({
    queryKey: ['users', 'doctors'],
    queryFn: async () => (await api.get('/users?role=doctor&active=true')).data,
  });

  const allItems: InventoryItem[] = inventoryData?.items ?? [];
  const doctors: Array<{ id: string; name: string }> = doctorsData?.users ?? [];

  // Build category list from items
  const categories = useMemo(() => {
    const map = new Map<string, { id: string; name: string; color: string }>();
    for (const item of allItems) {
      if (item.category_id && item.category_name) {
        map.set(item.category_id, { id: item.category_id, name: item.category_name, color: item.category_color || '#94a3b8' });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [allItems]);

  // Filtered items (by search + active category)
  const visibleItems = useMemo(() => {
    return allItems.filter(item =>
      item.is_active &&
      (activeCategory === 'all' || item.category_id === activeCategory) &&
      itemMatches(item, search)
    );
  }, [allItems, activeCategory, search]);

  // Basket helpers
  const addToBasket = (item: InventoryItem) => {
    setBasket(prev => {
      const existing = prev.find(e => e.item.id === item.id);
      if (existing) {
        const step = Number(item.dispense_unit) || 1;
        const max = item.quantity_on_hand;
        const newQty = Math.min(max, parseFloat((existing.qty + step).toFixed(3)));
        return prev.map(e => e.item.id === item.id ? { ...e, qty: newQty } : e);
      }
      const step = Number(item.dispense_unit) || 1;
      return [...prev, { item, qty: step }];
    });
  };

  const updateQty = (itemId: string, qty: number) => {
    setBasket(prev => prev.map(e => e.item.id === itemId ? { ...e, qty } : e));
  };

  const removeFromBasket = (itemId: string) => {
    setBasket(prev => prev.filter(e => e.item.id !== itemId));
  };

  const basketTotal = basket.reduce((sum, e) => sum + (Number(e.item.internal_price) || 0) * e.qty, 0);
  const basketCount = basket.reduce((sum, e) => sum + e.qty, 0);

  // Submit
  const { mutate: submitCharge, isPending: submitting } = useMutation({
    mutationFn: async () => {
      if (!doctorId) throw new Error('Please select a doctor');
      if (basket.length === 0) throw new Error('Add at least one item');
      const res = await api.post('/requests/quick-charge', {
        doctor_id: doctorId,
        patient_name: patientName || null,
        patient_ref: patientRef || null,
        notes: notes || null,
        items: basket.map(e => ({
          inventory_item_id: e.item.id,
          quantity_used: e.qty,
        })),
      });
      return res.data;
    },
    onSuccess: (data) => {
      setSuccessResult({ chargeNum: data.requestNum, total: data.totalCharge });
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const resetAfterSuccess = () => {
    setBasket([]);
    setPatientName('');
    setPatientRef('');
    setNotes('');
    setSuccessResult(null);
  };

  const inBasket = (id: string) => basket.find(e => e.item.id === id);

  return (
    <div className="flex h-[calc(100vh-4rem)] overflow-hidden bg-slate-50">
      {/* ── Left: Item Grid ─────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Search + category bar */}
        <div className="bg-white border-b border-slate-200 px-4 py-3 space-y-2 flex-shrink-0">
          <div className="flex items-center gap-3">
            <h1 className="font-bold text-slate-900 text-lg flex items-center gap-2">
              <ShoppingCart size={20} className="text-indigo-500" /> Quick Charge
            </h1>
            {/* Mobile basket toggle */}
            <button
              className="ml-auto lg:hidden btn-primary btn-sm relative"
              onClick={() => setShowBasket(true)}
            >
              <ShoppingCart size={14} /> Basket
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
              className={`px-3 py-1 rounded-full text-xs font-medium flex-shrink-0 transition-colors ${activeCategory === 'all' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
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

        {/* Item grid */}
        <div className="flex-1 overflow-y-auto p-4">
          {itemsLoading ? (
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
                    disabled={outOfStock}
                    onClick={() => addToBasket(item)}
                    className={`relative flex flex-col items-start text-left rounded-xl p-3 border-2 transition-all ${
                      outOfStock
                        ? 'opacity-40 cursor-not-allowed border-slate-100 bg-slate-50'
                        : entry
                        ? 'border-indigo-500 bg-indigo-50 shadow-sm'
                        : 'border-slate-200 bg-white hover:border-indigo-300 hover:shadow-sm'
                    }`}
                  >
                    {/* Category dot */}
                    <div
                      className="w-2 h-2 rounded-full mb-2 flex-shrink-0"
                      style={{ background: item.category_color || '#94a3b8' }}
                    />
                    <span className="text-sm font-semibold text-slate-900 leading-snug line-clamp-2 mb-1">
                      {item.name}
                    </span>
                    {item.sku && (
                      <span className="text-xs text-slate-400 mb-1">{item.sku}</span>
                    )}
                    <div className="flex items-center justify-between w-full mt-auto pt-1.5">
                      <span className={`text-xs font-medium ${outOfStock ? 'text-red-500' : lowStock ? 'text-amber-600' : 'text-emerald-600'}`}>
                        {outOfStock ? 'Out of stock' : `${item.quantity_on_hand} ${item.unit}`}
                      </span>
                      {item.internal_price != null && (
                        <span className="text-xs font-bold text-slate-700">${Number(item.internal_price).toFixed(2)}</span>
                      )}
                    </div>
                    {/* In-basket badge */}
                    {entry && (
                      <div className="absolute top-2 right-2 bg-indigo-600 text-white rounded-full w-5 h-5 text-xs font-bold flex items-center justify-center">
                        {entry.qty % 1 === 0 ? entry.qty : entry.qty.toFixed(1)}
                      </div>
                    )}
                    {/* Step label */}
                    {step !== 1 && !outOfStock && (
                      <div className="absolute bottom-2 right-2">
                        <span className="text-xs text-slate-400">×{step}</span>
                      </div>
                    )}
                    {lowStock && (
                      <AlertTriangle size={11} className="absolute top-2 right-2 text-amber-500" />
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Right: Basket / Checkout ──────────────────────────────────────────── */}
      {/* Mobile overlay */}
      {showBasket && (
        <div className="fixed inset-0 bg-black/40 z-40 lg:hidden" onClick={() => setShowBasket(false)} />
      )}
      <div className={`
        fixed right-0 top-0 h-full w-80 z-50 lg:static lg:z-auto
        bg-white border-l border-slate-200 flex flex-col shadow-xl lg:shadow-none
        transition-transform duration-200
        ${showBasket ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'}
      `}>
        {/* Basket header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 flex-shrink-0">
          <h2 className="font-semibold text-slate-900 flex items-center gap-2">
            <ShoppingCart size={16} className="text-indigo-500" />
            Basket
            {basket.length > 0 && (
              <span className="bg-indigo-100 text-indigo-700 rounded-full text-xs px-2 py-0.5 font-medium">
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
              <ShoppingCart size={24} />
              <p className="text-sm text-center">Tap items on the left to add them</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-50">
              {basket.map(({ item, qty }) => {
                const step = Number(item.dispense_unit) || 1;
                const lineTotal = (Number(item.internal_price) || 0) * qty;
                return (
                  <div key={item.id} className="px-4 py-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-900 truncate">{item.name}</p>
                        <p className="text-xs text-slate-400">{item.unit} · step {step}</p>
                      </div>
                      <span className="text-sm font-semibold text-slate-900 flex-shrink-0">
                        ${lineTotal.toFixed(2)}
                      </span>
                    </div>
                    <QtyControl
                      qty={qty}
                      step={step}
                      max={item.quantity_on_hand}
                      onChange={n => updateQty(item.id, n)}
                      onRemove={() => removeFromBasket(item.id)}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Checkout form */}
        <div className="border-t border-slate-200 flex-shrink-0 p-4 space-y-3 bg-slate-50">
          {/* Doctor */}
          <div>
            <label className="label flex items-center gap-1">
              <Stethoscope size={12} /> Doctor *
            </label>
            <div className="relative">
              <select
                value={doctorId}
                onChange={e => setDoctorId(e.target.value)}
                className="input appearance-none pr-8"
              >
                <option value="">— Select doctor —</option>
                {doctors.map(d => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
              <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            </div>
          </div>

          {/* Patient */}
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
            <label className="label">Notes</label>
            <textarea
              rows={1}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              className="input resize-none"
              placeholder="Optional notes…"
            />
          </div>

          {/* Total + submit */}
          <div className="pt-1">
            <div className="flex items-baseline justify-between mb-3">
              <span className="text-sm font-medium text-slate-600">Total ({basketCount.toFixed(basketCount % 1 ? 2 : 0)} units)</span>
              <span className="text-xl font-bold text-slate-900">${basketTotal.toFixed(2)}</span>
            </div>
            <button
              type="button"
              disabled={submitting || basket.length === 0 || !doctorId}
              onClick={() => submitCharge()}
              className="btn-primary w-full flex items-center justify-center gap-2"
            >
              {submitting ? (
                <>Processing…</>
              ) : (
                <><Send size={15} /> Send Receipt to Doctor</>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Success overlay */}
      {successResult && (
        <SuccessOverlay
          chargeNum={successResult.chargeNum}
          total={successResult.total}
          onDone={resetAfterSuccess}
        />
      )}
    </div>
  );
};

export default POS;
