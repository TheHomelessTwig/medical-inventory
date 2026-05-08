import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, ArrowRightLeft, CheckCircle, Send, XCircle, ChevronDown, ChevronUp, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { useForm, useFieldArray } from 'react-hook-form';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import Modal from '../components/Modal';
import Badge from '../components/Badge';
import { PageErrorBoundary } from '../components/ErrorBoundary';

interface Site { id: string; name: string }
interface Transfer {
  id: string; transfer_number: string;
  from_site_name: string; to_site_name: string;
  status: 'draft' | 'in_transit' | 'received' | 'cancelled';
  item_count: number; created_at: string; created_by_name: string;
}
interface TransferDetail extends Transfer {
  items: Array<{ id: string; item_name: string; unit: string; quantity_sent: number; quantity_received: number; batch_number?: string }>;
  notes?: string;
}

const STATUS_COLOR: Record<string, 'slate' | 'blue' | 'green'> = {
  draft: 'slate', in_transit: 'blue', received: 'green', cancelled: 'slate',
};

export default function StockTransfers() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const canManage = ['admin','nurse','practice_manager'].includes(user?.role ?? '');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);

  const { data } = useQuery<{ transfers: Transfer[]; total: number }>({
    queryKey: ['transfers'],
    queryFn: async () => (await api.get('/api/transfers?limit=50')).data,
  });

  const dispatchMutation = useMutation({
    mutationFn: (id: string) => api.post(`/api/transfers/${id}/dispatch`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['transfers'] }); toast.success('Transfer dispatched — stock deducted'); },
    onError: () => toast.error('Dispatch failed'),
  });
  const receiveMutation = useMutation({
    mutationFn: (id: string) => api.post(`/api/transfers/${id}/receive`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['transfers'] }); toast.success('Transfer received — stock added'); },
    onError: () => toast.error('Receive failed'),
  });
  const cancelMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/transfers/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['transfers'] }); toast.success('Transfer cancelled'); },
    onError: () => toast.error('Cancel failed'),
  });

  const transfers = data?.transfers ?? [];

  return (
    <PageErrorBoundary context="Stock Transfers">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Stock Transfers</h1>
            <p className="text-sm text-slate-500 mt-0.5">Move stock between clinic locations</p>
          </div>
          {canManage && (
            <button onClick={() => setShowNew(true)} className="btn-primary flex items-center gap-2">
              <Plus className="w-4 h-4" /> New Transfer
            </button>
          )}
        </div>

        {transfers.length === 0 ? (
          <div className="card p-12 text-center">
            <ArrowRightLeft className="w-12 h-12 mx-auto mb-3 text-slate-300 dark:text-slate-600" />
            <p className="text-slate-500 dark:text-slate-400">No transfers yet</p>
          </div>
        ) : (
          <div className="space-y-3">
            {transfers.map(t => (
              <div key={t.id} className="card">
                <div className="p-4 flex items-center gap-4 cursor-pointer" onClick={() => setExpanded(expanded === t.id ? null : t.id)}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-sm font-semibold text-blue-600 dark:text-blue-400">{t.transfer_number}</span>
                      <Badge color={STATUS_COLOR[t.status] ?? 'slate'}>{t.status.replace('_',' ')}</Badge>
                    </div>
                    <p className="text-sm text-slate-600 dark:text-slate-300 mt-0.5">
                      {t.from_site_name} → {t.to_site_name}
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {t.item_count} item{t.item_count !== 1 ? 's' : ''} · {new Date(t.created_at).toLocaleDateString()} by {t.created_by_name}
                    </p>
                  </div>
                  {expanded === t.id ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                </div>

                {expanded === t.id && (
                  <TransferDetail
                    id={t.id} status={t.status} canManage={canManage}
                    onDispatch={() => dispatchMutation.mutate(t.id)}
                    onReceive={() => receiveMutation.mutate(t.id)}
                    onCancel={() => { if (confirm('Cancel this transfer?')) cancelMutation.mutate(t.id); }}
                  />
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {showNew && canManage && <NewTransferModal onClose={() => setShowNew(false)} />}
    </PageErrorBoundary>
  );
}

function TransferDetail({ id, status, canManage, onDispatch, onReceive, onCancel }: {
  id: string; status: string; canManage: boolean;
  onDispatch: () => void; onReceive: () => void; onCancel: () => void;
}) {
  const { data } = useQuery<TransferDetail>({
    queryKey: ['transfer', id],
    queryFn: async () => (await api.get(`/api/transfers/${id}`)).data,
  });

  return (
    <div className="border-t border-slate-100 dark:border-slate-700 p-4 space-y-4">
      {data?.notes && <p className="text-sm text-slate-500 dark:text-slate-400">{data.notes}</p>}
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-slate-500 dark:text-slate-400 text-left">
            <th className="pb-2">Item</th><th className="pb-2 text-right">Sent</th>
            <th className="pb-2 text-right">Received</th><th className="pb-2">Batch</th>
          </tr>
        </thead>
        <tbody>
          {(data?.items ?? []).map(item => (
            <tr key={item.id} className="border-t border-slate-100 dark:border-slate-700">
              <td className="py-2 text-slate-700 dark:text-slate-300">{item.item_name}</td>
              <td className="py-2 text-right">{item.quantity_sent} {item.unit}</td>
              <td className={`py-2 text-right font-medium ${item.quantity_received >= item.quantity_sent ? 'text-green-600 dark:text-green-400' : 'text-slate-500'}`}>
                {item.quantity_received}
              </td>
              <td className="py-2 text-slate-400 text-xs">{item.batch_number || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {canManage && (
        <div className="flex gap-2 flex-wrap">
          {status === 'draft' && (
            <button onClick={onDispatch} className="btn-primary text-sm flex items-center gap-1.5">
              <Send className="w-3.5 h-3.5" /> Dispatch (deduct source)
            </button>
          )}
          {status === 'in_transit' && (
            <button onClick={onReceive} className="btn-primary text-sm flex items-center gap-1.5">
              <CheckCircle className="w-3.5 h-3.5" /> Receive (add destination)
            </button>
          )}
          {status === 'draft' && (
            <button onClick={onCancel} className="btn-danger text-sm flex items-center gap-1.5">
              <XCircle className="w-3.5 h-3.5" /> Cancel
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function NewTransferModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const { register, control, handleSubmit } = useForm({
    defaultValues: { from_site_id: '', to_site_id: '', notes: '', items: [{ inventory_item_id: '', quantity_sent: 1, batch_number: '' }] },
  });
  const { fields, append, remove } = useFieldArray({ control, name: 'items' });

  const { data: sites = [] } = useQuery<Site[]>({
    queryKey: ['sites'],
    queryFn: async () => (await api.get('/api/sites')).data,
  });
  const { data: invData } = useQuery<{ items: Array<{ id: string; name: string; unit: string }> }>({
    queryKey: ['inventory-active'],
    queryFn: async () => (await api.get('/api/inventory?limit=500&active=true')).data,
  });
  const items = invData?.items ?? [];

  const createMutation = useMutation({
    mutationFn: (data: object) => api.post('/api/transfers', data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['transfers'] }); toast.success('Transfer created'); onClose(); },
    onError: () => toast.error('Failed to create transfer'),
  });

  return (
    <Modal isOpen title="New Stock Transfer" onClose={onClose}>
      <form onSubmit={handleSubmit(d => createMutation.mutate(d))} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">From Site *</label>
            <select {...register('from_site_id', { required: true })} className="input">
              <option value="">Select…</option>
              {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">To Site *</label>
            <select {...register('to_site_id', { required: true })} className="input">
              <option value="">Select…</option>
              {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className="label">Notes</label>
          <input {...register('notes')} className="input" placeholder="Optional" />
        </div>
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="label mb-0">Items *</label>
            <button type="button" onClick={() => append({ inventory_item_id: '', quantity_sent: 1, batch_number: '' })} className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1">
              <Plus className="w-3 h-3" /> Add item
            </button>
          </div>
          <div className="space-y-2">
            {fields.map((field, idx) => (
              <div key={field.id} className="grid grid-cols-12 gap-2 items-center">
                <select className="input text-sm col-span-6" {...register(`items.${idx}.inventory_item_id`, { required: true })}>
                  <option value="">Select item…</option>
                  {items.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                </select>
                <input type="number" min="0.001" step="any" className="input text-sm col-span-2" placeholder="Qty" {...register(`items.${idx}.quantity_sent`, { valueAsNumber: true, required: true })} />
                <input type="text" className="input text-sm col-span-3" placeholder="Batch #" {...register(`items.${idx}.batch_number`)} />
                <button type="button" onClick={() => remove(idx)} className="col-span-1 text-red-400 hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            ))}
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-4 border-t border-slate-100 dark:border-slate-700">
          <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
          <button type="submit" disabled={createMutation.isPending} className="btn-primary">
            {createMutation.isPending ? 'Creating…' : 'Create Transfer'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
