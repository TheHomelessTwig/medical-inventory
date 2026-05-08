import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, useFieldArray } from 'react-hook-form';
import {
  ArrowLeftRight, Plus, Trash2, CheckCircle2, XCircle,
  RefreshCw, Package, ChevronRight
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { api, getErrorMessage } from '../api/client';
import { Supplier, InventoryItem } from '../types';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
import Badge from '../components/Badge';
import LoadingSpinner from '../components/LoadingSpinner';
import ItemSearchSelect from '../components/ItemSearchSelect';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';

interface ReturnLineForm {
  inventory_item_id: string;
  item_name: string;
  batch_number: string;
  quantity: number;
  unit_cost?: number;
  reason?: string;
}
interface ReturnForm {
  supplier_id: string;
  supplier_name: string;
  notes: string;
  items: ReturnLineForm[];
}

const statusColor: Record<string, 'blue' | 'green' | 'slate'> = {
  draft: 'blue', confirmed: 'green', cancelled: 'slate',
};

const Returns: React.FC = () => {
  const { user } = useAuth();
  const qc = useQueryClient();
  const isAdmin = user?.role === 'admin';
  const [showNew, setShowNew] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const { data: returns = [], isLoading, refetch } = useQuery({
    queryKey: ['returns'],
    queryFn: async () => (await api.get('/returns')).data,
  });

  const { data: suppliers = [] } = useQuery<Supplier[]>({
    queryKey: ['suppliers'],
    queryFn: async () => (await api.get('/suppliers')).data,
  });

  const { data: inventoryData } = useQuery({
    queryKey: ['inventory', 'pos'],
    queryFn: async () => (await api.get('/inventory?limit=500&active=true')).data,
  });
  const allItems: InventoryItem[] = inventoryData?.items ?? [];

  const { register, control, handleSubmit, watch, setValue, reset, formState: { errors } } = useForm<ReturnForm>({
    defaultValues: { supplier_id: '', supplier_name: '', notes: '', items: [{ inventory_item_id: '', item_name: '', batch_number: '', quantity: 1 }] },
  });
  const { fields, append, remove } = useFieldArray({ control, name: 'items' });
  const watchedItems = watch('items');

  const createMutation = useMutation({
    mutationFn: (data: ReturnForm) => api.post('/returns', {
      ...data,
      items: data.items.map(it => ({
        ...it,
        quantity: Number(it.quantity),
        unit_cost: it.unit_cost ? Number(it.unit_cost) : null,
      })),
    }),
    onSuccess: () => { toast.success('Return draft created'); qc.invalidateQueries({ queryKey: ['returns'] }); setShowNew(false); reset(); },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const confirmMutation = useMutation({
    mutationFn: (id: string) => api.post(`/returns/${id}/confirm`),
    onSuccess: () => { toast.success('Return confirmed — stock restored'); qc.invalidateQueries({ queryKey: ['returns'] }); qc.invalidateQueries({ queryKey: ['inventory'] }); setConfirmId(null); },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  return (
    <div className="space-y-5">
      <div className="page-header">
        <div>
          <h1 className="page-title">Returns to Supplier</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">{returns.length} return{returns.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => refetch()} className="btn-secondary btn-sm"><RefreshCw size={14} /></button>
          <button onClick={() => setShowNew(true)} className="btn-primary btn-sm"><Plus size={14} /> New Return</button>
        </div>
      </div>

      <div className="card overflow-hidden">
        {isLoading ? <LoadingSpinner /> : returns.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16">
            <ArrowLeftRight size={40} className="text-slate-300" />
            <p className="text-slate-500 dark:text-slate-400">No returns yet</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-700">
            {returns.map((ret: {
              id: string; return_number: string; supplier_name: string; status: string;
              item_count: number; created_by_name: string; created_at: string; confirmed_by_name?: string; confirmed_at?: string;
            }) => (
              <div key={ret.id} className="flex items-center gap-4 px-5 py-4 hover:bg-slate-50 dark:hover:bg-slate-700/30">
                <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-slate-100 dark:bg-slate-700 flex items-center justify-center">
                  <ArrowLeftRight size={16} className="text-slate-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-slate-900 dark:text-slate-100 font-mono">{ret.return_number}</span>
                    <Badge color={statusColor[ret.status] || 'slate'}>{ret.status}</Badge>
                  </div>
                  <div className="flex items-center gap-3 mt-0.5 text-sm text-slate-500 dark:text-slate-400 flex-wrap">
                    <span>{ret.supplier_name}</span>
                    <span>• {ret.item_count} item{Number(ret.item_count) !== 1 ? 's' : ''}</span>
                    <span>• by {ret.created_by_name}</span>
                    <span>• {format(parseISO(ret.created_at), 'dd MMM yyyy')}</span>
                  </div>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  {isAdmin && ret.status === 'draft' && (
                    <button onClick={() => setConfirmId(ret.id)} className="btn-success btn-sm">
                      <CheckCircle2 size={13} /> Confirm
                    </button>
                  )}
                </div>
                <ChevronRight size={16} className="text-slate-300 flex-shrink-0" />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* New return modal */}
      <Modal isOpen={showNew} onClose={() => { setShowNew(false); reset(); }} title="New Return to Supplier" size="2xl"
        footer={
          <div className="flex justify-end gap-3">
            <button onClick={() => { setShowNew(false); reset(); }} className="btn-secondary">Cancel</button>
            <button form="return-form" type="submit" disabled={createMutation.isPending} className="btn-primary">
              {createMutation.isPending ? 'Saving…' : 'Create Draft'}
            </button>
          </div>
        }>
        <form id="return-form" onSubmit={handleSubmit(d => createMutation.mutate(d))} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Supplier *</label>
              <select {...register('supplier_id')} onChange={e => {
                const sup = suppliers.find(s => s.id === e.target.value);
                if (sup) setValue('supplier_name', sup.name);
              }} className="input">
                <option value="">— Select or type below —</option>
                {suppliers.filter(s => s.is_active).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Supplier name (if not in list)</label>
              <input {...register('supplier_name', { required: 'Required' })} className="input" placeholder="Supplier name" />
              {errors.supplier_name && <p className="mt-1 text-xs text-red-600">{errors.supplier_name.message}</p>}
            </div>
          </div>

          {/* Line items */}
          <div>
            <label className="label">Items to return *</label>
            <div className="space-y-3">
              {fields.map((field, idx) => (
                <div key={field.id} className="flex items-start gap-2 p-3 border border-slate-200 dark:border-slate-600 rounded-lg">
                  <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <div className="sm:col-span-1">
                      <label className="label text-xs">Item *</label>
                      <ItemSearchSelect
                        items={allItems}
                        value={allItems.find(i => i.id === watchedItems[idx]?.inventory_item_id) || null}
                        onChange={item => {
                          if (item) {
                            setValue(`items.${idx}.inventory_item_id`, item.id);
                            setValue(`items.${idx}.item_name`, item.name);
                          }
                        }}
                        placeholder="Search item…"
                      />
                    </div>
                    <div>
                      <label className="label text-xs">Batch</label>
                      <input {...register(`items.${idx}.batch_number`)} className="input" placeholder="Batch #" />
                    </div>
                    <div>
                      <label className="label text-xs">Qty *</label>
                      <input {...register(`items.${idx}.quantity`, { required: true, valueAsNumber: true, min: 0.001 })} type="number" step="any" min="0.001" className="input" />
                    </div>
                    <div>
                      <label className="label text-xs">Unit cost ($)</label>
                      <input {...register(`items.${idx}.unit_cost`, { valueAsNumber: true })} type="number" step="0.01" min="0" className="input" placeholder="Optional" />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="label text-xs">Reason</label>
                      <input {...register(`items.${idx}.reason`)} className="input" placeholder="Damaged, wrong item, etc." />
                    </div>
                  </div>
                  <button type="button" onClick={() => remove(idx)} disabled={fields.length === 1}
                    className="mt-5 p-1.5 text-slate-400 hover:text-red-500 disabled:opacity-30">
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
            <button type="button" onClick={() => append({ inventory_item_id: '', item_name: '', batch_number: '', quantity: 1 })}
              className="mt-2 btn-secondary btn-sm">
              <Plus size={13} /> Add item
            </button>
          </div>

          <div>
            <label className="label">Notes</label>
            <textarea {...register('notes')} rows={2} className="input" placeholder="Optional notes…" />
          </div>
        </form>
      </Modal>

      {/* Confirm dialog */}
      <ConfirmDialog
        isOpen={!!confirmId}
        onClose={() => setConfirmId(null)}
        onConfirm={() => confirmId && confirmMutation.mutate(confirmId)}
        title="Confirm Return"
        message="Confirming this return will restore stock levels for all listed items. This cannot be undone."
        confirmLabel="Confirm & Restore Stock"
        isLoading={confirmMutation.isPending}
      />
    </div>
  );
};

export default Returns;
