import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { useDebounce } from '../hooks/useDebounce';
import { useForm } from 'react-hook-form';
import {
  Plus, Search, Download, Upload, Package, Edit2, Archive,
  AlertTriangle, Filter, RefreshCw, ChevronLeft, ChevronRight,
  BarChart2, X, Sliders, Barcode, Trash2, CheckSquare, Square
} from 'lucide-react';
import WastageModal from '../components/WastageModal';
import { useBarcodeScan } from '../hooks/useBarcodeScan';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { format, parseISO } from 'date-fns';
import { api, getErrorMessage } from '../api/client';
import { InventoryItem, Category, Supplier } from '../types';
import { useAuth } from '../context/AuthContext';
import Modal from '../components/Modal';
import Badge from '../components/Badge';
import LoadingSpinner from '../components/LoadingSpinner';
import ConfirmDialog from '../components/ConfirmDialog';
import toast from 'react-hot-toast';

// ── Inventory item form ────────────────────────────────────────────────────
interface ItemFormData {
  name: string; description?: string; category_id?: string; sku?: string;
  barcode?: string; supplier_id?: string; unit: string;
  reorder_threshold: number; internal_price?: number; supplier_cost?: number;
  gst_applicable: boolean; gst_rate: number; storage_location?: string;
  requires_batch_tracking: boolean; dispense_unit: number; notes?: string;
}

const ItemForm: React.FC<{
  defaultValues?: Partial<ItemFormData>;
  onSubmit: (data: ItemFormData) => Promise<void>;
  categories: Category[];
  suppliers: Supplier[];
  isLoading: boolean;
}> = ({ defaultValues, onSubmit, categories, suppliers, isLoading }) => {
  const { register, handleSubmit, setValue, formState: { errors } } = useForm<ItemFormData>({
    defaultValues: { unit: 'unit', gst_applicable: true, gst_rate: 10, requires_batch_tracking: false, dispense_unit: 1, reorder_threshold: 0, ...defaultValues },
  });
  return (
    <form id="item-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="sm:col-span-2">
          <label className="label">Item Name *</label>
          <input {...register('name', { required: 'Required' })} className="input" />
          {errors.name && <p className="mt-1 text-xs text-red-600">{errors.name.message}</p>}
        </div>
        <div className="sm:col-span-2">
          <label className="label">Description</label>
          <textarea {...register('description')} rows={2} className="input" />
        </div>
        <div>
          <label className="label">Category</label>
          <select {...register('category_id')} className="input">
            <option value="">— Select —</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Unit</label>
          <input {...register('unit')} className="input" placeholder="unit, dose, box…" />
        </div>
        <div>
          <label className="label">SKU / Internal Code</label>
          <input {...register('sku')} className="input" />
        </div>
        <div>
          <label className="label">Barcode</label>
          <input {...register('barcode')} className="input" />
        </div>
        <div>
          <label className="label">Supplier</label>
          <select {...register('supplier_id')} className="input">
            <option value="">— Select —</option>
            {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Storage Location</label>
          <input {...register('storage_location')} className="input" placeholder="Fridge A, Cabinet 2…" />
        </div>
        <div>
          <label className="label">Internal Price ($)</label>
          <input {...register('internal_price', { valueAsNumber: true })} type="number" step="0.01" min="0" className="input" />
        </div>
        <div>
          <label className="label">Supplier Cost ($)</label>
          <input {...register('supplier_cost', { valueAsNumber: true })} type="number" step="0.01" min="0" className="input" />
        </div>
        <div>
          <label className="label">Reorder Threshold</label>
          <input {...register('reorder_threshold', { valueAsNumber: true })} type="number" step="0.1" min="0" className="input" />
        </div>
        <div>
          <label className="label">GST Rate (%)</label>
          <input {...register('gst_rate', { valueAsNumber: true })} type="number" step="0.1" min="0" className="input" />
        </div>
        <div className="sm:col-span-2 flex gap-6 flex-wrap">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input {...register('gst_applicable')} type="checkbox" className="rounded border-slate-300 text-blue-600" />
            <span>GST Applicable</span>
          </label>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input {...register('requires_batch_tracking')} type="checkbox" className="rounded border-slate-300 text-blue-600" />
            <span>Requires Batch/Lot Tracking</span>
          </label>
        </div>
        <div>
          <label className="label">Dispense Step</label>
          <div className="flex gap-2 items-center">
            <input
              {...register('dispense_unit', { valueAsNumber: true, min: 0.001 })}
              type="number"
              step="any"
              min="0.001"
              className="input w-28"
            />
            <div className="flex gap-1 flex-wrap">
              {[0.5, 1, 2, 5, 10, 25].map(v => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setValue('dispense_unit', v)}
                  className="px-2 py-1 text-xs rounded bg-slate-100 hover:bg-indigo-100 hover:text-indigo-700 transition-colors"
                >
                  {v}
                </button>
              ))}
            </div>
          </div>
          <p className="mt-1 text-xs text-slate-400">Controls the +/− step in the POS screen. Default: 1</p>
        </div>
        <div className="sm:col-span-2">
          <label className="label">Notes</label>
          <textarea {...register('notes')} rows={2} className="input" />
        </div>
      </div>
      <button type="submit" form="item-form" disabled={isLoading} className="hidden" />
    </form>
  );
};

// ── Adjust stock modal ─────────────────────────────────────────────────────
const AdjustModal: React.FC<{
  item: InventoryItem;
  onClose: () => void;
  onSuccess: () => void;
}> = ({ item, onClose, onSuccess }) => {
  const { register, handleSubmit, watch, formState: { errors } } = useForm({
    defaultValues: { quantity_change: 0, adjustment_type: 'correction', reason: '', override_negative: false },
  });
  const [isLoading, setIsLoading] = useState(false);
  const change = watch('quantity_change', 0);

  const onSubmit = async (data: Record<string, unknown>) => {
    setIsLoading(true);
    try {
      await api.post(`/inventory/${item.id}/adjust`, { ...data, quantity_change: Number(data.quantity_change) });
      toast.success('Stock adjusted');
      onSuccess();
      onClose();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  };

  const newQty = Number(item.quantity_on_hand) + Number(change);

  return (
    <Modal isOpen title="Adjust Stock" onClose={onClose} size="md"
      footer={
        <div className="flex justify-end gap-3">
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button form="adjust-form" type="submit" disabled={isLoading} className="btn-primary">
            {isLoading ? 'Saving...' : 'Apply Adjustment'}
          </button>
        </div>
      }>
      <form id="adjust-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="p-3 bg-slate-50 rounded-lg text-sm">
          <div className="flex justify-between">
            <span className="text-slate-600">Current stock:</span>
            <span className="font-semibold">{item.quantity_on_hand} {item.unit}</span>
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-slate-600">After adjustment:</span>
            <span className={`font-bold ${newQty < 0 ? 'text-red-600' : 'text-emerald-600'}`}>{newQty.toFixed(2)} {item.unit}</span>
          </div>
        </div>
        <div>
          <label className="label">Adjustment Type *</label>
          <select {...register('adjustment_type')} className="input">
            {['increase', 'decrease', 'correction', 'damage', 'expiry', 'return', 'other'].map(t => (
              <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Quantity Change * <span className="text-slate-400 text-xs">(positive = add, negative = remove)</span></label>
          <input {...register('quantity_change', { required: 'Required', valueAsNumber: true })} type="number" step="0.001" className="input" />
          {errors.quantity_change && <p className="mt-1 text-xs text-red-600">{String(errors.quantity_change.message)}</p>}
        </div>
        <div>
          <label className="label">Reason *</label>
          <textarea {...register('reason', { required: 'Required' })} rows={2} className="input" placeholder="Explain the reason for this adjustment…" />
          {errors.reason && <p className="mt-1 text-xs text-red-600">{String(errors.reason.message)}</p>}
        </div>
        {newQty < 0 && (
          <label className="flex items-center gap-2 text-sm text-red-600 cursor-pointer p-2 bg-red-50 rounded-lg">
            <input {...register('override_negative')} type="checkbox" className="rounded border-red-300 text-red-600" />
            <span>Override: Allow negative stock (will be logged)</span>
          </label>
        )}
      </form>
    </Modal>
  );
};

// ── Main Inventory page ────────────────────────────────────────────────────
const Inventory: React.FC = () => {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  const [showAdd, setShowAdd] = useState(false);
  const [editItem, setEditItem] = useState<InventoryItem | null>(null);
  const [adjustItem, setAdjustItem] = useState<InventoryItem | null>(null);
  const [wastageItem, setWastageItem] = useState<InventoryItem | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkMenu, setShowBulkMenu] = useState(false);
  const [archiveItem, setArchiveItem] = useState<InventoryItem | null>(null);
  const [formLoading, setFormLoading] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  const page = parseInt(searchParams.get('page') || '1');
  const [searchInput, setSearchInput] = useState(searchParams.get('search') || '');
  const [scanMode, setScanMode] = useState(false);
  const [barcodeSearch, setBarcodeSearch] = useState<string | null>(null);
  const scanStartRef = useRef<number | null>(null);
  const lastKeyTimeRef = useRef<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const debouncedSearch = useDebounce(searchInput, 350);
  // barcodeSearch bypasses the debounce so scanned results appear immediately
  const search = barcodeSearch ?? debouncedSearch;
  const category = searchParams.get('category') || '';
  const lowStock = searchParams.get('low_stock') || '';

  // Sync debounced search into URL params
  useEffect(() => {
    const p = new URLSearchParams(searchParams);
    if (search) { p.set('search', search); p.delete('page'); }
    else p.delete('search');
    setSearchParams(p, { replace: true });
  }, [search]); // eslint-disable-line react-hooks/exhaustive-deps

  const setParam = (key: string, val: string) => {
    const p = new URLSearchParams(searchParams);
    if (val) p.set(key, val); else p.delete(key);
    if (key !== 'page') p.delete('page');
    setSearchParams(p);
  };

  const toggleScanMode = useCallback(() => {
    setScanMode(prev => {
      if (prev) {
        setBarcodeSearch(null);
        scanStartRef.current = null;
        lastKeyTimeRef.current = null;
      } else {
        setTimeout(() => inputRef.current?.focus(), 0);
      }
      return !prev;
    });
  }, []);

  // Detects rapid keystroke bursts (< 100 ms first-char → Enter) produced by
  // USB/Bluetooth barcode scanners and resolves them as immediate lookups.
  const handleScanKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!scanMode) return;

    const now = Date.now();

    if (e.key === 'Escape') {
      setScanMode(false);
      setBarcodeSearch(null);
      scanStartRef.current = null;
      lastKeyTimeRef.current = null;
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      const elapsed = scanStartRef.current !== null ? now - scanStartRef.current : Infinity;
      const scanned = (e.target as HTMLInputElement).value.trim();
      if (elapsed < 100 && scanned) {
        setBarcodeSearch(scanned);
        setSearchInput(scanned);
      }
      scanStartRef.current = null;
      lastKeyTimeRef.current = null;
      return;
    }

    if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
      const gap = lastKeyTimeRef.current !== null ? now - lastKeyTimeRef.current : Infinity;
      if (gap > 150 || scanStartRef.current === null) {
        // New typing burst — start timer and clear any previous barcode override
        scanStartRef.current = now;
        if (barcodeSearch !== null) setBarcodeSearch(null);
      }
      lastKeyTimeRef.current = now;
    }
  }, [scanMode, barcodeSearch]);

  const { data: categoriesData } = useQuery<Category[]>({
    queryKey: ['categories'],
    queryFn: async () => (await api.get('/categories')).data,
  });
  const { data: suppliersData } = useQuery<Supplier[]>({
    queryKey: ['suppliers'],
    queryFn: async () => (await api.get('/suppliers')).data,
  });

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['inventory', page, search, category, lowStock],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), limit: '50' });
      if (search) params.set('search', search);
      if (category) params.set('category', category);
      if (lowStock) params.set('low_stock', lowStock);
      const { data } = await api.get(`/inventory?${params}`);
      return data;
    },
  });

  const categories = categoriesData || [];
  const suppliers = suppliersData || [];
  const items: InventoryItem[] = data?.items || [];
  const total: number = data?.total || 0;
  const pages: number = data?.pages || 1;

  const handleCreate = async (formData: ItemFormData) => {
    setFormLoading(true);
    try {
      await api.post('/inventory', formData);
      toast.success('Item created');
      qc.invalidateQueries({ queryKey: ['inventory'] });
      setShowAdd(false);
    } catch (err) { toast.error(getErrorMessage(err)); }
    finally { setFormLoading(false); }
  };

  const handleUpdate = async (formData: ItemFormData) => {
    if (!editItem) return;
    setFormLoading(true);
    try {
      await api.put(`/inventory/${editItem.id}`, formData);
      toast.success('Item updated');
      qc.invalidateQueries({ queryKey: ['inventory'] });
      setEditItem(null);
    } catch (err) { toast.error(getErrorMessage(err)); }
    finally { setFormLoading(false); }
  };

  const archiveMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/inventory/${id}`),
    onSuccess: () => {
      toast.success('Item archived');
      qc.invalidateQueries({ queryKey: ['inventory'] });
      setArchiveItem(null);
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const handleExport = async () => {
    try {
      const res = await api.get('/inventory/export', { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `inventory_${format(new Date(), 'yyyy-MM-dd')}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) { toast.error(getErrorMessage(err)); }
  };

  const isAdmin = user?.role === 'admin';

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Inventory</h1>
          <p className="text-sm text-slate-500 mt-0.5">{total} item{total !== 1 ? 's' : ''}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => refetch()} className="btn-secondary btn-sm">
            <RefreshCw size={14} />
          </button>
          {isAdmin && (
            <>
              <button onClick={handleExport} className="btn-secondary btn-sm">
                <Download size={14} /> Export CSV
              </button>
              <button onClick={() => setShowAdd(true)} className="btn-primary btn-sm">
                <Plus size={14} /> Add Item
              </button>
            </>
          )}
        </div>
      </div>

      {/* Search + filters */}
      <div className="card p-4 space-y-3">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search size={15} className={`absolute left-3 top-1/2 -translate-y-1/2 ${scanMode ? 'text-blue-400' : 'text-slate-400'}`} />
            <input
              ref={inputRef}
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              onKeyDown={handleScanKeyDown}
              placeholder={scanMode ? 'Ready to scan barcode…' : 'Search by name, SKU, or barcode…'}
              className={`input pl-9 w-full transition-shadow ${scanMode ? 'ring-2 ring-blue-400 border-blue-300' : ''}`}
            />
          </div>
          <button
            onClick={toggleScanMode}
            title={scanMode ? 'Exit scan mode (Esc)' : 'Enable barcode scan mode'}
            className={`btn-secondary btn-sm flex items-center gap-1 ${scanMode ? 'bg-blue-600 border-blue-600 text-white hover:bg-blue-700 ring-2 ring-blue-300 ring-offset-1' : ''}`}
          >
            <Barcode size={14} />
            {scanMode && <span className="text-xs font-medium">Scan</span>}
          </button>
          <button onClick={() => setShowFilters(!showFilters)} className={`btn-secondary btn-sm ${showFilters || category || lowStock ? 'bg-blue-50 border-blue-300 text-blue-700' : ''}`}>
            <Filter size={14} /> Filters {(category || lowStock) ? '•' : ''}
          </button>
        </div>
        {showFilters && (
          <div className="flex flex-wrap gap-3 pt-1 border-t border-slate-100">
            <div className="flex items-center gap-2">
              <label className="text-sm text-slate-600">Category:</label>
              <select value={category} onChange={e => setParam('category', e.target.value)} className="input py-1 text-sm w-40">
                <option value="">All</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={lowStock === 'true'} onChange={e => setParam('low_stock', e.target.checked ? 'true' : '')} className="rounded border-slate-300 text-blue-600" />
              <span className="text-slate-700">Low stock only</span>
            </label>
            {(category || lowStock) && (
              <button onClick={() => { setParam('category', ''); setParam('low_stock', ''); }} className="text-xs text-red-500 hover:text-red-700 flex items-center gap-1">
                <X size={12} /> Clear filters
              </button>
            )}
          </div>
        )}
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        {isLoading ? (
          <LoadingSpinner />
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16">
            <Package size={40} className="text-slate-300" />
            <p className="text-slate-500">No items found</p>
            {isAdmin && <button onClick={() => setShowAdd(true)} className="btn-primary btn-sm"><Plus size={14} /> Add First Item</button>}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="table-th">Item</th>
                  <th className="table-th">Category</th>
                  <th className="table-th">SKU</th>
                  <th className="table-th text-right">On Hand</th>
                  <th className="table-th text-right">Reserved</th>
                  <th className="table-th text-right">Price</th>
                  <th className="table-th">Expiry</th>
                  <th className="table-th">Status</th>
                  {(isAdmin || user?.role === 'nurse') && <th className="table-th">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map(item => {
                  const isLow = item.is_low_stock;
                  const expiringDays = item.nearest_expiry
                    ? Math.round((new Date(item.nearest_expiry).getTime() - Date.now()) / 86400000)
                    : null;
                  return (
                    <tr key={item.id} className={`hover:bg-slate-50 transition-colors ${!item.is_active ? 'opacity-50' : ''}`}>
                      <td className="table-td">
                        <div>
                          <p className="font-medium text-slate-900">{item.name}</p>
                          {item.storage_location && <p className="text-xs text-slate-400">{item.storage_location}</p>}
                        </div>
                      </td>
                      <td className="table-td">
                        {item.category_name ? (
                          <span className="badge" style={{ background: `${item.category_color}20`, color: item.category_color }}>
                            {item.category_name}
                          </span>
                        ) : <span className="text-slate-400">—</span>}
                      </td>
                      <td className="table-td"><span className="font-mono text-xs text-slate-500">{item.sku || '—'}</span></td>
                      <td className="table-td text-right">
                        <span className={`font-semibold ${isLow ? 'text-red-600' : 'text-slate-900'}`}>
                          {Number(item.quantity_on_hand).toFixed(item.unit === 'unit' ? 0 : 2)}
                        </span>
                        <span className="text-xs text-slate-400 ml-1">{item.unit}</span>
                        {isLow && <AlertTriangle size={12} className="inline ml-1 text-amber-500" />}
                      </td>
                      <td className="table-td text-right">
                        <span className="text-slate-600">{Number(item.quantity_reserved).toFixed(0)}</span>
                      </td>
                      <td className="table-td text-right">
                        {item.internal_price != null
                          ? <span className="font-medium">${Number(item.internal_price).toFixed(2)}</span>
                          : <span className="text-slate-400">—</span>}
                      </td>
                      <td className="table-td">
                        {expiringDays !== null ? (
                          <span className={`text-xs font-medium ${expiringDays <= 14 ? 'text-red-600' : expiringDays <= 30 ? 'text-amber-600' : 'text-slate-500'}`}>
                            {expiringDays <= 0 ? 'EXPIRED' : `${expiringDays}d`}
                          </span>
                        ) : <span className="text-slate-400 text-xs">—</span>}
                      </td>
                      <td className="table-td">
                        {item.is_active
                          ? (item.requires_batch_tracking ? <Badge color="cyan">Batch</Badge> : <Badge color="emerald">Active</Badge>)
                          : <Badge color="slate">Archived</Badge>}
                      </td>
                      {(isAdmin || user?.role === 'nurse') && (
                        <td className="table-td">
                          <div className="flex items-center gap-1">
                            {(isAdmin || user?.role === 'nurse') && (
                              <>
                                <button onClick={() => setWastageItem(item)} className="p-1.5 rounded text-slate-400 hover:text-red-600 hover:bg-red-50" title="Record wastage">
                                  <Trash2 size={13} />
                                </button>
                                <button onClick={() => setAdjustItem(item)} className="p-1.5 rounded text-slate-400 hover:text-blue-600 hover:bg-blue-50" title="Adjust stock">
                                  <BarChart2 size={15} />
                                </button>
                              </>
                            )}
                            {isAdmin && (
                              <>
                                <button onClick={() => setEditItem(item)} className="p-1.5 rounded text-slate-400 hover:text-blue-600 hover:bg-blue-50" title="Edit">
                                  <Edit2 size={15} />
                                </button>
                                <button onClick={() => setArchiveItem(item)} className="p-1.5 rounded text-slate-400 hover:text-red-600 hover:bg-red-50" title="Archive">
                                  <Archive size={15} />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {pages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200">
            <p className="text-sm text-slate-500">Page {page} of {pages} ({total} items)</p>
            <div className="flex gap-2">
              <button disabled={page <= 1} onClick={() => setParam('page', String(page - 1))} className="btn-secondary btn-sm disabled:opacity-40">
                <ChevronLeft size={14} />
              </button>
              <button disabled={page >= pages} onClick={() => setParam('page', String(page + 1))} className="btn-secondary btn-sm disabled:opacity-40">
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Add modal */}
      <Modal isOpen={showAdd} onClose={() => setShowAdd(false)} title="Add Inventory Item" size="2xl"
        footer={
          <div className="flex justify-end gap-3">
            <button onClick={() => setShowAdd(false)} className="btn-secondary">Cancel</button>
            <button form="item-form" type="submit" disabled={formLoading} className="btn-primary">
              {formLoading ? 'Saving...' : 'Create Item'}
            </button>
          </div>
        }>
        <ItemForm onSubmit={handleCreate} categories={categories} suppliers={suppliers} isLoading={formLoading} />
      </Modal>

      {/* Edit modal */}
      {editItem && (
        <Modal isOpen onClose={() => setEditItem(null)} title={`Edit: ${editItem.name}`} size="2xl"
          footer={
            <div className="flex justify-end gap-3">
              <button onClick={() => setEditItem(null)} className="btn-secondary">Cancel</button>
              <button form="item-form" type="submit" disabled={formLoading} className="btn-primary">
                {formLoading ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          }>
          <ItemForm
            defaultValues={editItem}
            onSubmit={handleUpdate}
            categories={categories}
            suppliers={suppliers}
            isLoading={formLoading}
          />
        </Modal>
      )}

      {/* Adjust modal */}
      {adjustItem && (
        <AdjustModal
          item={adjustItem}
          onClose={() => setAdjustItem(null)}
          onSuccess={() => qc.invalidateQueries({ queryKey: ['inventory'] })}
        />
      )}

      {/* Wastage modal */}
      {wastageItem && (
        <WastageModal
          item={wastageItem}
          onClose={() => setWastageItem(null)}
          onSuccess={() => qc.invalidateQueries({ queryKey: ['inventory'] })}
        />
      )}

      {/* Archive confirm */}
      <ConfirmDialog
        isOpen={!!archiveItem}
        onClose={() => setArchiveItem(null)}
        onConfirm={() => archiveItem && archiveMutation.mutate(archiveItem.id)}
        title="Archive Item"
        message={`Archive "${archiveItem?.name}"? It will be hidden from active inventory but all history is preserved.`}
        confirmLabel="Archive"
        danger
        isLoading={archiveMutation.isPending}
      />
    </div>
  );
};

export default Inventory;
