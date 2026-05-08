import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertOctagon, Plus, ChevronDown, ChevronUp, Download, Lock, ShieldAlert } from 'lucide-react';
import toast from 'react-hot-toast';
import { useForm } from 'react-hook-form';
import { api } from '../api/client';
import Modal from '../components/Modal';
import Badge from '../components/Badge';
import { PageErrorBoundary } from '../components/ErrorBoundary';

interface Recall {
  id: string; recall_number: string; title: string;
  severity: 'low' | 'moderate' | 'high' | 'critical';
  status: 'active' | 'quarantined' | 'disposed' | 'closed';
  batch_numbers: string[]; created_at: string; created_by_name: string;
  supplier_name?: string;
}
interface RecallDetail extends Recall {
  description?: string; regulatory_ref?: string; action_required?: string;
  affected_batches: Array<{ id: string; item_name: string; batch_number: string; expiry_date: string; quantity: number; unit: string }>;
  dispensed_to: Array<{ patient_name?: string; patient_ref?: string; completed_at: string; quantity_used: number; batch_number: string; item_name: string; doctor_name: string }>;
}

const SEV_COLOR: Record<string, 'slate' | 'blue' | 'green'> = {
  low: 'slate', moderate: 'blue', high: 'blue', critical: 'blue',
};
const SEV_LABEL: Record<string, string> = { low: 'Low', moderate: 'Moderate', high: 'High', critical: 'CRITICAL' };

interface RecallForm {
  title: string; description?: string;
  supplier_name?: string; batch_numbers: string;
  severity: 'low' | 'moderate' | 'high' | 'critical';
  regulatory_ref?: string; action_required?: string;
}

export default function Recalls() {
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);

  const { data: recalls = [], isLoading } = useQuery<Recall[]>({
    queryKey: ['recalls'],
    queryFn: async () => (await api.get('/api/recalls')).data,
  });

  const quarantineMutation = useMutation({
    mutationFn: (id: string) => api.post(`/api/recalls/${id}/quarantine`),
    onSuccess: (res) => { qc.invalidateQueries({ queryKey: ['recalls'] }); toast.success(`${(res.data as { batches_quarantined: number }).batches_quarantined} batch(es) quarantined`); },
    onError: () => toast.error('Quarantine failed'),
  });
  const closeMutation = useMutation({
    mutationFn: (id: string) => api.post(`/api/recalls/${id}/close`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['recalls'] }); toast.success('Recall closed'); },
    onError: () => toast.error('Close failed'),
  });

  return (
    <PageErrorBoundary context="Recalls">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Recall Management</h1>
            <p className="text-sm text-slate-500 mt-0.5">Supplier batch recalls and affected patient tracking</p>
          </div>
          <button onClick={() => setShowNew(true)} className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" /> New Recall
          </button>
        </div>

        {isLoading ? (
          <div className="card p-8 text-center text-slate-400">Loading…</div>
        ) : recalls.length === 0 ? (
          <div className="card p-12 text-center">
            <AlertOctagon className="w-12 h-12 mx-auto mb-3 text-slate-300 dark:text-slate-600" />
            <p className="text-slate-500 dark:text-slate-400">No recalls on record</p>
          </div>
        ) : (
          <div className="space-y-3">
            {recalls.map(r => (
              <div key={r.id} className={`card border-l-4 ${
                r.severity === 'critical' ? 'border-l-purple-500' :
                r.severity === 'high'     ? 'border-l-red-500' :
                r.severity === 'moderate' ? 'border-l-amber-500' : 'border-l-slate-300'
              }`}>
                <div className="p-4 flex items-center gap-4 cursor-pointer" onClick={() => setExpanded(expanded === r.id ? null : r.id)}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-sm font-semibold text-red-600 dark:text-red-400">{r.recall_number}</span>
                      <Badge color={SEV_COLOR[r.severity] ?? 'slate'}>{SEV_LABEL[r.severity]}</Badge>
                      <Badge color={r.status === 'closed' ? 'slate' : r.status === 'quarantined' ? 'green' : 'blue'}>{r.status}</Badge>
                    </div>
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mt-0.5">{r.title}</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Batches: {r.batch_numbers.join(', ')} · {new Date(r.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  {expanded === r.id ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                </div>

                {expanded === r.id && (
                  <RecallDetailView
                    id={r.id} status={r.status} recallNumber={r.recall_number}
                    onQuarantine={() => { if (confirm('Quarantine all affected batches? This will write off affected stock.')) quarantineMutation.mutate(r.id); }}
                    onClose={() => { if (confirm('Close this recall?')) closeMutation.mutate(r.id); }}
                  />
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {showNew && <NewRecallModal onClose={() => setShowNew(false)} />}
    </PageErrorBoundary>
  );
}

function RecallDetailView({ id, status, recallNumber, onQuarantine, onClose }: {
  id: string; status: string; recallNumber: string;
  onQuarantine: () => void; onClose: () => void;
}) {
  const { data } = useQuery<RecallDetail>({
    queryKey: ['recall', id],
    queryFn: async () => (await api.get(`/api/recalls/${id}`)).data,
  });

  if (!data) return <div className="border-t border-slate-100 dark:border-slate-700 p-4 text-slate-400">Loading…</div>;

  return (
    <div className="border-t border-slate-100 dark:border-slate-700 p-4 space-y-4">
      {data.description && <p className="text-sm text-slate-600 dark:text-slate-300">{data.description}</p>}
      {data.action_required && (
        <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg text-sm text-amber-800 dark:text-amber-200">
          <strong>Action required:</strong> {data.action_required}
        </div>
      )}
      {data.regulatory_ref && <p className="text-xs text-slate-400">Regulatory ref: {data.regulatory_ref}</p>}

      <div>
        <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Affected batches in stock ({data.affected_batches.length})</h4>
        {data.affected_batches.length === 0 ? (
          <p className="text-xs text-slate-400">None in stock</p>
        ) : (
          <table className="w-full text-xs">
            <thead><tr className="text-slate-500"><th className="text-left pb-1">Item</th><th className="text-left pb-1">Batch</th><th className="text-left pb-1">Expiry</th><th className="text-right pb-1">Qty</th></tr></thead>
            <tbody>
              {data.affected_batches.map(b => (
                <tr key={b.id} className={`border-t border-slate-100 dark:border-slate-700 ${b.quantity > 0 ? 'text-red-600 dark:text-red-400' : 'text-slate-400'}`}>
                  <td className="py-1">{b.item_name}</td><td>{b.batch_number}</td>
                  <td>{b.expiry_date ? String(b.expiry_date).slice(0,10) : '—'}</td>
                  <td className="text-right">{b.quantity} {b.unit}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div>
        <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Dispensed to patients ({data.dispensed_to.length})</h4>
        {data.dispensed_to.length === 0 ? (
          <p className="text-xs text-slate-400">No dispensing records found for these batches</p>
        ) : (
          <table className="w-full text-xs">
            <thead><tr className="text-slate-500"><th className="text-left pb-1">Patient</th><th className="text-left pb-1">Item</th><th className="text-left pb-1">Date</th><th className="text-left pb-1">Doctor</th></tr></thead>
            <tbody>
              {data.dispensed_to.map((d, i) => (
                <tr key={i} className="border-t border-slate-100 dark:border-slate-700 text-slate-700 dark:text-slate-300">
                  <td className="py-1">{d.patient_name || '—'} {d.patient_ref ? `(${d.patient_ref})` : ''}</td>
                  <td>{d.item_name}</td>
                  <td>{String(d.completed_at).slice(0,10)}</td>
                  <td>{d.doctor_name}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="flex gap-2 flex-wrap">
        {status === 'active' && (
          <button onClick={onQuarantine} className="btn-danger text-sm flex items-center gap-1.5">
            <ShieldAlert className="w-3.5 h-3.5" /> Quarantine Affected Stock
          </button>
        )}
        {status !== 'closed' && (
          <button onClick={onClose} className="btn-secondary text-sm flex items-center gap-1.5">
            <Lock className="w-3.5 h-3.5" /> Close Recall
          </button>
        )}
        <a href={`/api/recalls/${id}/export`} download className="btn-secondary text-sm flex items-center gap-1.5">
          <Download className="w-3.5 h-3.5" /> Export Patient List (CSV)
        </a>
      </div>
    </div>
  );
}

function NewRecallModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const { register, handleSubmit, formState: { errors } } = useForm<RecallForm>({
    defaultValues: { severity: 'moderate' },
  });

  const createMutation = useMutation({
    mutationFn: (data: RecallForm) => api.post('/api/recalls', {
      ...data,
      batch_numbers: data.batch_numbers.split(',').map(b => b.trim()).filter(Boolean),
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['recalls'] }); toast.success('Recall created — admins notified'); onClose(); },
    onError: () => toast.error('Failed to create recall'),
  });

  return (
    <Modal isOpen title="New Recall" onClose={onClose}>
      <form onSubmit={handleSubmit(d => createMutation.mutate(d))} className="space-y-4">
        <div>
          <label className="label">Recall Title *</label>
          <input {...register('title', { required: 'Title is required' })} className="input" placeholder="e.g. Lot 12345 — Amoxicillin 500mg" />
          {errors.title && <p className="text-red-500 text-xs mt-1">{errors.title.message}</p>}
        </div>
        <div>
          <label className="label">Description</label>
          <textarea {...register('description')} className="input" rows={3} placeholder="Details of the recall…" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Severity *</label>
            <select {...register('severity')} className="input">
              <option value="low">Low</option>
              <option value="moderate">Moderate</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </div>
          <div>
            <label className="label">Supplier</label>
            <input {...register('supplier_name')} className="input" placeholder="Supplier name" />
          </div>
        </div>
        <div>
          <label className="label">Affected Batch Numbers * <span className="font-normal text-slate-400">(comma separated)</span></label>
          <input {...register('batch_numbers', { required: 'At least one batch number is required' })} className="input" placeholder="LOT123, LOT124" />
          {errors.batch_numbers && <p className="text-red-500 text-xs mt-1">{errors.batch_numbers.message}</p>}
        </div>
        <div>
          <label className="label">Regulatory Reference</label>
          <input {...register('regulatory_ref')} className="input" placeholder="TGA recall number, ARTG etc." />
        </div>
        <div>
          <label className="label">Action Required</label>
          <textarea {...register('action_required')} className="input" rows={2} placeholder="What staff should do…" />
        </div>
        <div className="flex justify-end gap-2 pt-4 border-t border-slate-100 dark:border-slate-700">
          <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
          <button type="submit" disabled={createMutation.isPending} className="btn-danger">
            {createMutation.isPending ? 'Creating…' : 'Create Recall'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
