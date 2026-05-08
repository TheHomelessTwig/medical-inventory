import React, { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, CheckCircle, XCircle, Search, AlertTriangle,
  Save, BarChart2, Filter, Download, Printer
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { api, getErrorMessage } from '../api/client';
import { Stocktake, StocktakeItem } from '../types';
import Badge, { statusColors } from '../components/Badge';
import ConfirmDialog from '../components/ConfirmDialog';
import Modal from '../components/Modal';
import LoadingSpinner from '../components/LoadingSpinner';
import toast from 'react-hot-toast';

const StocktakeSession: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [search, setSearch] = useState('');
  const [filterUncounted, setFilterUncounted] = useState(false);
  const [showComplete, setShowComplete] = useState(false);
  const [showCancel, setShowCancel] = useState(false);
  const [applyAdjustments, setApplyAdjustments] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [localCounts, setLocalCounts] = useState<Record<string, string>>({});

  const { data: stocktake, isLoading } = useQuery<Stocktake>({
    queryKey: ['stocktake', id],
    queryFn: async () => (await api.get(`/stocktakes/${id}`)).data,
    refetchInterval: (query) => {
      const data = query.state.data as Stocktake | undefined;
      return data?.status === 'in_progress' ? 30_000 : false;
    },
  });

  const completeMutation = useMutation({
    mutationFn: () => api.post(`/stocktakes/${id}/complete`, { apply_adjustments: applyAdjustments }),
    onSuccess: () => {
      toast.success('Stocktake completed');
      qc.invalidateQueries({ queryKey: ['stocktake', id] });
      qc.invalidateQueries({ queryKey: ['stocktakes'] });
      qc.invalidateQueries({ queryKey: ['inventory'] });
      setShowComplete(false);
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const cancelMutation = useMutation({
    mutationFn: () => api.post(`/stocktakes/${id}/cancel`),
    onSuccess: () => {
      toast.success('Stocktake cancelled');
      qc.invalidateQueries({ queryKey: ['stocktakes'] });
      navigate('/stocktakes');
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const saveCount = async (item: StocktakeItem) => {
    const val = localCounts[item.id];
    if (val === undefined || val === '') return;
    const counted = parseFloat(val);
    if (isNaN(counted) || counted < 0) {
      toast.error('Please enter a valid count');
      return;
    }
    setSavingId(item.id);
    try {
      await api.put(`/stocktakes/${id}/items/${item.id}`, { counted_quantity: counted });
      qc.invalidateQueries({ queryKey: ['stocktake', id] });
      toast.success(`Count saved for ${item.item_name}`);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setSavingId(null);
    }
  };

  const filteredItems = useMemo(() => {
    if (!stocktake?.items) return [];
    return stocktake.items.filter(item => {
      const matchSearch = !search ||
        item.item_name.toLowerCase().includes(search.toLowerCase()) ||
        (item.sku || '').toLowerCase().includes(search.toLowerCase()) ||
        (item.storage_location || '').toLowerCase().includes(search.toLowerCase());
      const matchUncounted = !filterUncounted || item.counted_quantity == null;
      return matchSearch && matchUncounted;
    });
  }, [stocktake?.items, search, filterUncounted]);

  const progress = stocktake?.progress;
  const variantItems = (stocktake?.items || []).filter(i => i.counted_quantity != null && i.variance !== null && Math.abs(Number(i.variance)) > 0.001);

  if (isLoading) return <LoadingSpinner />;
  if (!stocktake) return <div className="card p-8 text-center text-slate-500">Stocktake not found</div>;

  const isActive = stocktake.status === 'in_progress';

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start gap-3">
        <button onClick={() => navigate('/stocktakes')} className="btn-secondary btn-sm mt-1"><ArrowLeft size={14} /></button>
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="page-title">{stocktake.name}</h1>
            <Badge color={statusColors[stocktake.status] || 'slate'}>{stocktake.status.replace('_', ' ')}</Badge>
            <Badge color="slate">{stocktake.type}</Badge>
          </div>
          <p className="text-sm text-slate-500 mt-0.5">
            Started {format(parseISO(stocktake.started_at), 'dd MMM yyyy, HH:mm')} by {stocktake.created_by_name}
          </p>
        </div>
        <div className="flex gap-2">
          {/* Print count sheet */}
          <button
            onClick={async () => {
              try {
                const { data: st } = await api.get(`/stocktakes/${id}`);
                const items: Array<{
                  item_name: string; sku?: string; category_name?: string;
                  storage_location?: string; unit: string; expected_quantity?: number;
                }> = st.items ?? [];
                const sorted = [...items].sort((a, b) => {
                  const cmp = (a.category_name ?? '').localeCompare(b.category_name ?? '');
                  return cmp !== 0 ? cmp : a.item_name.localeCompare(b.item_name);
                });
                const rows = sorted.map((item, i) => `
                  <tr class="${i % 2 === 0 ? 'even' : ''}">
                    <td class="cat">${item.category_name ?? ''}</td>
                    <td class="name">${item.item_name}</td>
                    <td class="sku">${item.sku ?? ''}</td>
                    <td class="loc">${item.storage_location ?? ''}</td>
                    <td class="num">${item.expected_quantity ?? ''}</td>
                    <td class="unit">${item.unit}</td>
                    <td class="counted"></td>
                    <td class="notes"></td>
                  </tr>`).join('');
                const now = format(new Date(), 'dd MMM yyyy HH:mm');
                const win = window.open('', '_blank');
                if (!win) { toast.error('Allow pop-ups to print'); return; }
                win.document.write(`<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Count Sheet</title><style>
                  *{box-sizing:border-box;margin:0;padding:0}body{font-family:Arial,sans-serif;font-size:11px;color:#000;padding:16mm 14mm}
                  h1{font-size:15px;margin-bottom:2px}.meta{font-size:10px;color:#555;margin-bottom:10px}.meta span{margin-right:16px}
                  table{width:100%;border-collapse:collapse}th{background:#222;color:#fff;padding:5px 6px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.04em}
                  td{padding:5px 6px;border-bottom:1px solid #ddd;vertical-align:middle}tr.even td{background:#f9f9f9}
                  .cat{width:12%}.name{width:26%;font-weight:600}.sku{width:10%;color:#555}.loc{width:12%;color:#555}
                  .num{width:8%;text-align:right}.unit{width:7%;color:#555}.counted{width:13%;border-bottom:1px solid #000!important;background:#fffde7!important}.notes{width:12%}
                  @media print{.no-print{display:none}}.print-btn{position:fixed;top:12px;right:12px;padding:8px 16px;background:#1e40af;color:#fff;border:none;border-radius:6px;font-size:13px;cursor:pointer}
                </style></head><body>
                  <button class="print-btn no-print" onclick="window.print()">🖨 Print</button>
                  <h1>Count Sheet — ${st.name}</h1>
                  <div class="meta"><span>Type: ${st.type}</span><span>Items: ${items.length}</span><span>Printed: ${now}</span></div>
                  <table><thead><tr>
                    <th class="cat">Category</th><th class="name">Item Name</th><th class="sku">SKU</th><th class="loc">Location</th>
                    <th class="num">Expected</th><th class="unit">Unit</th><th class="counted">Counted ✏️</th><th class="notes">Notes</th>
                  </tr></thead><tbody>${rows}</tbody></table>
                </body></html>`);
                win.document.close();
                setTimeout(() => win.print(), 400);
              } catch (err) { toast.error(getErrorMessage(err)); }
            }}
            className="btn-secondary btn-sm"
            title="Print count sheet"
          >
            <Printer size={14} /> Count Sheet
          </button>
          {/* CSV export — available on completed stocktakes too */}
          <button
            onClick={async () => {
              try {
                const res = await api.get(`/stocktakes/${id}?format=csv`, { responseType: 'blob' });
                const url = URL.createObjectURL(res.data);
                const a = document.createElement('a');
                a.href = url;
                a.download = `stocktake_${id}_${format(new Date(), 'yyyy-MM-dd')}.csv`;
                a.click();
                URL.revokeObjectURL(url);
              } catch (err) { toast.error(getErrorMessage(err)); }
            }}
            className="btn-secondary btn-sm"
          >
            <Download size={14} /> Export CSV
          </button>
          {isActive && (
            <>
              <button onClick={() => setShowCancel(true)} className="btn-secondary btn-sm text-red-600 border-red-200 hover:bg-red-50">
                <XCircle size={14} /> Cancel
              </button>
              <button onClick={() => setShowComplete(true)} className="btn-success btn-sm">
                <CheckCircle size={14} /> Complete
              </button>
            </>
          )}
        </div>
      </div>

      {/* Progress bar */}
      {isActive && progress && (
        <div className="card p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-slate-700">Progress</span>
            <span className="text-sm text-slate-500">{progress.counted} / {progress.total} items counted</span>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden">
            <div
              className="h-3 rounded-full bg-gradient-to-r from-blue-500 to-emerald-500 transition-all duration-500"
              style={{ width: `${progress.percentage}%` }}
            />
          </div>
          <div className="flex items-center justify-between mt-2">
            <span className="text-xs text-slate-400">{progress.percentage}% complete</span>
            {variantItems.length > 0 && (
              <span className="text-xs text-amber-600 font-medium">{variantItems.length} variance{variantItems.length !== 1 ? 's' : ''} found</span>
            )}
          </div>
        </div>
      )}

      {/* Completed summary */}
      {stocktake.status === 'completed' && (
        <div className="card p-5 bg-emerald-50 border-emerald-200">
          <div className="flex items-start gap-3">
            <CheckCircle size={20} className="text-emerald-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-emerald-900">Stocktake Completed</p>
              <p className="text-sm text-emerald-700 mt-1">
                Completed by {stocktake.completed_by_name} on {stocktake.completed_at ? format(parseISO(stocktake.completed_at), 'dd MMM yyyy, HH:mm') : '—'}
              </p>
              {stocktake.total_variance != null && (
                <p className="text-sm text-emerald-700">
                  Total variance: <strong>{Number(stocktake.total_variance).toFixed(2)} units</strong> across {variantItems.length} item{variantItems.length !== 1 ? 's' : ''}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Variances highlight */}
      {variantItems.length > 0 && (
        <div className="card overflow-hidden">
          <div className="px-5 py-3 border-b border-amber-200 bg-amber-50 flex items-center gap-2">
            <AlertTriangle size={16} className="text-amber-600" />
            <h3 className="font-semibold text-amber-900">Variances Found ({variantItems.length})</h3>
          </div>
          <table className="w-full text-sm">
            <thead><tr className="border-b border-slate-100">
              <th className="table-th">Item</th>
              <th className="table-th text-right">Expected</th>
              <th className="table-th text-right">Counted</th>
              <th className="table-th text-right">Variance</th>
            </tr></thead>
            <tbody>
              {variantItems.map(item => (
                <tr key={item.id} className="border-b border-slate-50 hover:bg-slate-50">
                  <td className="table-td font-medium">{item.item_name}</td>
                  <td className="table-td text-right text-slate-500">{Number(item.expected_quantity ?? 0).toFixed(2)} {item.unit}</td>
                  <td className="table-td text-right">{Number(item.counted_quantity).toFixed(2)} {item.unit}</td>
                  <td className={`table-td text-right font-semibold ${Number(item.variance) < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                    {Number(item.variance) > 0 ? '+' : ''}{Number(item.variance).toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Count sheet */}
      <div className="card overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-200">
          <div className="flex items-center gap-3 flex-wrap">
            <h3 className="font-semibold text-slate-900 flex-1">Count Sheet ({filteredItems.length} items)</h3>
            <div className="relative">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={search} onChange={e => setSearch(e.target.value)}
                className="input pl-8 py-1.5 text-sm w-48" placeholder="Search items…" />
            </div>
            <label className="flex items-center gap-1.5 text-sm cursor-pointer">
              <input type="checkbox" checked={filterUncounted} onChange={e => setFilterUncounted(e.target.checked)}
                className="rounded border-slate-300 text-blue-600" />
              <span className="text-slate-600">Uncounted only</span>
            </label>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="table-th">Item</th>
                <th className="table-th">Location</th>
                <th className="table-th text-right">Expected</th>
                <th className="table-th text-right">Counted</th>
                <th className="table-th text-right">Variance</th>
                {isActive && <th className="table-th">Action</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filteredItems.map(item => {
                const localVal = localCounts[item.id] ?? '';
                const hasCount = item.counted_quantity != null;
                const variance = item.variance;
                return (
                  <tr key={item.id} className={`hover:bg-slate-50 ${hasCount ? '' : 'bg-amber-50/30'}`}>
                    <td className="table-td">
                      <p className="font-medium text-slate-900">{item.item_name}</p>
                      {item.sku && <p className="text-xs font-mono text-slate-400">{item.sku}</p>}
                    </td>
                    <td className="table-td text-slate-500 text-xs">{item.storage_location || '—'}</td>
                    <td className="table-td text-right text-slate-500">
                      {item.expected_quantity != null ? `${Number(item.expected_quantity).toFixed(2)} ${item.unit}` : '—'}
                    </td>
                    <td className="table-td text-right">
                      {isActive ? (
                        <input
                          type="number"
                          step="0.001"
                          min="0"
                          value={localVal !== '' ? localVal : item.counted_quantity ?? ''}
                          onChange={e => setLocalCounts(prev => ({ ...prev, [item.id]: e.target.value }))}
                          onKeyDown={e => e.key === 'Enter' && saveCount(item)}
                          className="input py-1 text-sm text-right w-28"
                          placeholder="Count…"
                        />
                      ) : (
                        <span className={hasCount ? 'font-medium text-slate-900' : 'text-slate-400'}>
                          {hasCount ? `${Number(item.counted_quantity).toFixed(2)} ${item.unit}` : 'Not counted'}
                        </span>
                      )}
                    </td>
                    <td className="table-td text-right">
                      {variance != null ? (
                        <span className={`font-semibold ${Math.abs(Number(variance)) < 0.001 ? 'text-emerald-600' : Number(variance) < 0 ? 'text-red-600' : 'text-amber-600'}`}>
                          {Number(variance) > 0 ? '+' : ''}{Number(variance).toFixed(2)}
                        </span>
                      ) : <span className="text-slate-300">—</span>}
                    </td>
                    {isActive && (
                      <td className="table-td">
                        <button
                          onClick={() => saveCount(item)}
                          disabled={savingId === item.id || localVal === ''}
                          className="btn-secondary btn-sm disabled:opacity-40"
                        >
                          {savingId === item.id ? '…' : <Save size={13} />}
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Complete modal */}
      <Modal isOpen={showComplete} onClose={() => setShowComplete(false)} title="Complete Stocktake" size="md"
        footer={
          <div className="flex justify-end gap-3">
            <button onClick={() => setShowComplete(false)} className="btn-secondary">Back</button>
            <button onClick={() => completeMutation.mutate()} disabled={completeMutation.isPending} className="btn-success">
              {completeMutation.isPending ? 'Processing...' : 'Complete Stocktake'}
            </button>
          </div>
        }>
        <div className="space-y-4">
          <div className="p-4 bg-slate-50 rounded-lg space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-slate-600">Total items:</span><strong>{progress?.total}</strong></div>
            <div className="flex justify-between"><span className="text-slate-600">Items counted:</span><strong>{progress?.counted}</strong></div>
            <div className="flex justify-between"><span className="text-slate-600">Items with variance:</span><strong className={variantItems.length > 0 ? 'text-amber-600' : 'text-emerald-600'}>{variantItems.length}</strong></div>
          </div>
          {progress && progress.counted < progress.total && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
              <strong>Warning:</strong> {progress.total - progress.counted} item{progress.total - progress.counted !== 1 ? 's' : ''} have not been counted yet.
            </div>
          )}
          <label className="flex items-start gap-3 cursor-pointer p-3 border border-slate-200 rounded-lg hover:bg-slate-50">
            <input type="checkbox" checked={applyAdjustments} onChange={e => setApplyAdjustments(e.target.checked)}
              className="mt-0.5 rounded border-slate-300 text-blue-600" />
            <div>
              <p className="font-medium text-slate-900 text-sm">Apply stock adjustments</p>
              <p className="text-xs text-slate-500 mt-0.5">Update inventory quantities to match counted amounts. All changes will be logged in the audit trail.</p>
            </div>
          </label>
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={showCancel}
        onClose={() => setShowCancel(false)}
        onConfirm={() => cancelMutation.mutate()}
        title="Cancel Stocktake"
        message="Cancel this stocktake session? No adjustments will be applied and the session will be marked as cancelled."
        confirmLabel="Cancel Stocktake"
        danger
        isLoading={cancelMutation.isPending}
      />
    </div>
  );
};

export default StocktakeSession;
