import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import {
  Plus, Activity, ChevronRight, CheckCircle, XCircle,
  Clock, RefreshCw, AlertCircle, Printer
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { api, getErrorMessage } from '../api/client';
import { Stocktake, Category } from '../types';
import Modal from '../components/Modal';
import Badge, { statusColors } from '../components/Badge';
import LoadingSpinner from '../components/LoadingSpinner';
import toast from 'react-hot-toast';

// ── Print count sheet ─────────────────────────────────────────────────────────
async function printCountSheet(stocktakeId: string) {
  try {
    const { data: st } = await api.get(`/stocktakes/${stocktakeId}`);
    const items: Array<{
      item_name: string; sku?: string; category_name?: string;
      storage_location?: string; unit: string; expected_quantity?: number;
    }> = st.items ?? [];

    const rows = items
      .sort((a, b) => {
        const cmp = (a.category_name ?? '').localeCompare(b.category_name ?? '');
        return cmp !== 0 ? cmp : a.item_name.localeCompare(b.item_name);
      })
      .map((item, i) => `
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
    if (!win) { toast.error('Pop-ups blocked — allow pop-ups for this site'); return; }

    win.document.write(`<!DOCTYPE html><html lang="en"><head>
      <meta charset="UTF-8">
      <title>Count Sheet — ${st.name}</title>
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: Arial, sans-serif; font-size: 11px; color: #000; padding: 16mm 14mm; }
        h1 { font-size: 15px; margin-bottom: 2px; }
        .meta { font-size: 10px; color: #555; margin-bottom: 10px; }
        .meta span { margin-right: 16px; }
        table { width: 100%; border-collapse: collapse; }
        th { background: #222; color: #fff; padding: 5px 6px; text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: .04em; }
        td { padding: 5px 6px; border-bottom: 1px solid #ddd; vertical-align: middle; }
        tr.even td { background: #f9f9f9; }
        .cat { width: 12%; }
        .name { width: 26%; font-weight: 600; }
        .sku { width: 10%; color: #555; }
        .loc { width: 12%; color: #555; }
        .num { width: 8%; text-align: right; }
        .unit { width: 7%; color: #555; }
        .counted { width: 13%; border-bottom: 1px solid #000 !important; background: #fffde7 !important; }
        .notes { width: 12%; }
        @media print {
          body { padding: 12mm 10mm; }
          .no-print { display: none; }
        }
        .print-btn { position: fixed; top: 12px; right: 12px; padding: 8px 16px; background: #1e40af; color: #fff; border: none; border-radius: 6px; font-size: 13px; cursor: pointer; }
      </style>
    </head><body>
      <button class="print-btn no-print" onclick="window.print()">🖨 Print</button>
      <h1>Count Sheet — ${st.name}</h1>
      <div class="meta">
        <span>Type: ${st.type}</span>
        <span>Status: ${st.status}</span>
        <span>Items: ${items.length}</span>
        <span>Printed: ${now}</span>
      </div>
      <table>
        <thead><tr>
          <th class="cat">Category</th>
          <th class="name">Item Name</th>
          <th class="sku">SKU</th>
          <th class="loc">Location</th>
          <th class="num">Expected</th>
          <th class="unit">Unit</th>
          <th class="counted">Counted ✏️</th>
          <th class="notes">Notes</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </body></html>`);
    win.document.close();
    setTimeout(() => win.print(), 400);
  } catch (err) {
    toast.error(getErrorMessage(err));
  }
}

interface StocktakeFormData {
  name: string;
  type: 'full' | 'cycle' | 'partial';
  scope_description?: string;
  scope_category_id?: string;
  scope_location?: string;
  notes?: string;
}

const statusIcons: Record<string, React.ReactNode> = {
  in_progress: <Clock size={16} className="text-blue-500" />,
  completed: <CheckCircle size={16} className="text-emerald-500" />,
  cancelled: <XCircle size={16} className="text-slate-400" />,
};

const Stocktakes: React.FC = () => {
  const qc = useQueryClient();
  const [showNew, setShowNew] = useState(false);
  const [formLoading, setFormLoading] = useState(false);

  const { data: categories } = useQuery<Category[]>({
    queryKey: ['categories'],
    queryFn: async () => (await api.get('/categories')).data,
  });

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['stocktakes'],
    queryFn: async () => (await api.get('/stocktakes?limit=50')).data,
  });

  const stocktakes: Stocktake[] = data?.stocktakes || [];

  const { register, handleSubmit, watch, reset, formState: { errors } } = useForm<StocktakeFormData>({
    defaultValues: { type: 'full', name: `Stocktake ${format(new Date(), 'dd MMM yyyy')}` },
  });
  const watchType = watch('type');

  const onSubmit = async (form: StocktakeFormData) => {
    setFormLoading(true);
    try {
      const { data: created } = await api.post('/stocktakes', form);
      toast.success('Stocktake session created');
      qc.invalidateQueries({ queryKey: ['stocktakes'] });
      setShowNew(false);
      reset();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setFormLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="page-header">
        <div>
          <h1 className="page-title">Stocktakes</h1>
          <p className="text-sm text-slate-500 mt-0.5">{data?.total || 0} session{data?.total !== 1 ? 's' : ''}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => refetch()} className="btn-secondary btn-sm"><RefreshCw size={14} /></button>
          <button onClick={() => setShowNew(true)} className="btn-primary btn-sm">
            <Plus size={14} /> New Stocktake
          </button>
        </div>
      </div>

      {/* Active stocktakes callout */}
      {stocktakes.filter(s => s.status === 'in_progress').length > 0 && (
        <div className="card p-4 border-blue-200 bg-blue-50 flex items-center gap-3">
          <AlertCircle size={18} className="text-blue-600 flex-shrink-0" />
          <p className="text-sm text-blue-800">
            {stocktakes.filter(s => s.status === 'in_progress').length} stocktake session{stocktakes.filter(s => s.status === 'in_progress').length > 1 ? 's are' : ' is'} currently in progress.
          </p>
        </div>
      )}

      {/* List */}
      <div className="card overflow-hidden">
        {isLoading ? (
          <LoadingSpinner />
        ) : stocktakes.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16">
            <Activity size={40} className="text-slate-300" />
            <p className="text-slate-500">No stocktakes yet</p>
            <button onClick={() => setShowNew(true)} className="btn-primary btn-sm">
              <Plus size={14} /> Start First Stocktake
            </button>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {stocktakes.map(st => (
              <div key={st.id} className="flex items-center gap-2 px-5 py-4 hover:bg-slate-50 transition-colors group">
                <Link to={`/stocktakes/${st.id}`} className="flex items-center gap-4 flex-1 min-w-0">
                  <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center">
                    {statusIcons[st.status] || <Activity size={16} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-slate-900">{st.name}</span>
                      <Badge color={statusColors[st.status] || 'slate'}>{st.status.replace('_', ' ')}</Badge>
                      <Badge color="slate">{st.type}</Badge>
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 text-sm text-slate-500 flex-wrap">
                      <span>{st.total_items} items</span>
                      <span>• by {st.created_by_name}</span>
                      <span>• {format(parseISO(st.started_at), 'dd MMM yyyy')}</span>
                      {st.status === 'completed' && st.total_variance != null && (
                        <span className={Number(st.total_variance) > 0 ? 'text-amber-600' : 'text-emerald-600'}>
                          • Variance: {Number(st.total_variance).toFixed(2)} units
                        </span>
                      )}
                    </div>
                  </div>
                  {st.status === 'in_progress' && (
                    <div className="text-xs text-blue-600 font-medium bg-blue-50 px-2 py-1 rounded-full flex-shrink-0">
                      In Progress
                    </div>
                  )}
                  <ChevronRight size={16} className="text-slate-300 group-hover:text-slate-500 flex-shrink-0" />
                </Link>
                <button
                  onClick={e => { e.preventDefault(); printCountSheet(st.id); }}
                  title="Print count sheet"
                  className="flex-shrink-0 p-2 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                >
                  <Printer size={15} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* New stocktake modal */}
      <Modal isOpen={showNew} onClose={() => setShowNew(false)} title="New Stocktake Session" size="md"
        footer={
          <div className="flex justify-end gap-3">
            <button onClick={() => setShowNew(false)} className="btn-secondary">Cancel</button>
            <button form="stocktake-form" type="submit" disabled={formLoading} className="btn-primary">
              {formLoading ? 'Creating...' : 'Create & Start'}
            </button>
          </div>
        }>
        <form id="stocktake-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className="label">Stocktake Name *</label>
            <input {...register('name', { required: 'Required' })} className="input" />
            {errors.name && <p className="mt-1 text-xs text-red-600">{errors.name.message}</p>}
          </div>

          <div>
            <label className="label">Type *</label>
            <div className="grid grid-cols-3 gap-2">
              {(['full', 'cycle', 'partial'] as const).map(t => (
                <label key={t} className={`flex flex-col items-center gap-1 p-3 rounded-lg border-2 cursor-pointer transition-all ${watchType === t ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:border-slate-300'}`}>
                  <input {...register('type')} type="radio" value={t} className="sr-only" />
                  <span className="font-medium text-sm capitalize">{t}</span>
                  <span className="text-xs text-slate-500 text-center">
                    {t === 'full' ? 'All items' : t === 'cycle' ? 'Rotating subset' : 'By category/location'}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {watchType === 'partial' && (
            <>
              <div>
                <label className="label">Filter by Category</label>
                <select {...register('scope_category_id')} className="input">
                  <option value="">— All categories —</option>
                  {(categories || []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Filter by Location</label>
                <input {...register('scope_location')} className="input" placeholder="e.g. Vaccine Fridge A" />
              </div>
            </>
          )}

          <div>
            <label className="label">Description / Scope Notes</label>
            <textarea {...register('scope_description')} rows={2} className="input" />
          </div>

          <div>
            <label className="label">Notes</label>
            <textarea {...register('notes')} rows={2} className="input" />
          </div>

          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
            <strong>Note:</strong> Starting a stocktake will snapshot current expected quantities. Count all items before completing.
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default Stocktakes;
