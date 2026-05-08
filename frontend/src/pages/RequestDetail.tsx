import React, { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, useFieldArray } from 'react-hook-form';
import {
  ArrowLeft, CheckCircle, XCircle, Clock, Printer,
  AlertTriangle, Package, User, CalendarDays, FileText, Trash2,
  Copy, Check as CheckIcon, ClipboardList
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { api, getErrorMessage } from '../api/client';
import { StockRequest, InventoryItem, InventoryBatch } from '../types';
import { useAuth } from '../context/AuthContext';
import Badge, { statusColors, priorityColors } from '../components/Badge';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
import LoadingSpinner from '../components/LoadingSpinner';
import toast from 'react-hot-toast';

// ── Stock-used note (copyable) ────────────────────────────────────────────────
interface NoteItem { item_name: string; quantity_used: number; unit: string }

const StockNote: React.FC<{ items: NoteItem[]; nurseName: string }> = ({ items, nurseName }) => {
  const [copied, setCopied] = useState(false);

  const noteText = [
    'Stock used',
    ...items.map(fi => {
      const qty = Number(fi.quantity_used);
      const qtyStr = qty % 1 === 0 ? String(qty) : qty.toFixed(2).replace(/\.?0+$/, '');
      return `${qtyStr}x ${fi.item_name}`;
    }),
  ].join('\n');

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(noteText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: select the textarea
      const el = document.getElementById(`stock-note-${nurseName.replace(/\s/g, '')}`) as HTMLTextAreaElement;
      el?.select();
    }
  };

  return (
    <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-emerald-200 bg-emerald-100/60">
        <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-800">
          <ClipboardList size={12} /> Copy to clinical notes
        </span>
        <button
          onClick={handleCopy}
          className={`flex items-center gap-1 text-xs font-medium px-2 py-1 rounded transition-colors ${
            copied
              ? 'bg-emerald-600 text-white'
              : 'bg-white text-emerald-700 border border-emerald-300 hover:bg-emerald-50'
          }`}
        >
          {copied ? <><CheckIcon size={11} /> Copied!</> : <><Copy size={11} /> Copy</>}
        </button>
      </div>
      <textarea
        id={`stock-note-${nurseName.replace(/\s/g, '')}`}
        readOnly
        value={noteText}
        rows={Math.min(items.length + 1, 8)}
        onClick={e => (e.target as HTMLTextAreaElement).select()}
        className="w-full bg-transparent px-3 py-2 text-xs font-mono text-emerald-900 resize-none focus:outline-none cursor-text"
      />
    </div>
  );
};

interface FulfillFormData {
  notes?: string;
  items: Array<{
    request_item_id?: string;
    inventory_item_id: string;
    batch_id?: string;
    quantity_used: number;
    batch_number?: string;
    lot_number?: string;
    expiry_date?: string;
    internal_price?: number;
    is_substitution: boolean;
    substitution_reason?: string;
  }>;
}

const FulfillModal: React.FC<{
  request: StockRequest;
  onClose: () => void;
  onSuccess: () => void;
}> = ({ request, onClose, onSuccess }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [batchOptions, setBatchOptions] = useState<Record<string, InventoryBatch[]>>({});

  const defaultItems = (request.items || []).map(item => ({
    request_item_id: item.id,
    inventory_item_id: item.inventory_item_id,
    batch_id: '',
    quantity_used: item.quantity_requested,
    batch_number: '',
    lot_number: '',
    expiry_date: '',
    internal_price: item.internal_price,
    is_substitution: false,
    substitution_reason: '',
  }));

  const { register, handleSubmit, control, watch, setValue } = useForm<FulfillFormData>({
    defaultValues: { items: defaultItems },
  });
  const { fields } = useFieldArray({ control, name: 'items' });
  const watchedItems = watch('items');

  const loadBatches = async (itemId: string, idx: number) => {
    if (batchOptions[itemId]) return;
    try {
      const { data } = await api.get(`/inventory/${itemId}/batches`);
      setBatchOptions(prev => ({ ...prev, [itemId]: data }));
      // FEFO: auto-select the batch expiring soonest that still has stock
      const today = new Date().toISOString().split('T')[0];
      const best = (data as InventoryBatch[]).find(b =>
        b.quantity > 0 && (!b.expiry_date || b.expiry_date >= today)
      );
      if (best) {
        setValue(`items.${idx}.batch_id`, best.id);
        setValue(`items.${idx}.batch_number`, best.batch_number);
        if (best.lot_number) setValue(`items.${idx}.lot_number`, best.lot_number);
        if (best.expiry_date) setValue(`items.${idx}.expiry_date`, best.expiry_date);
      }
    } catch {/* ignore */}
  };

  const handleBatchChange = (idx: number, batchId: string) => {
    const itemId = watchedItems[idx].inventory_item_id;
    const batches = batchOptions[itemId] || [];
    const batch = batches.find(b => b.id === batchId);
    if (batch) {
      setValue(`items.${idx}.batch_number`, batch.batch_number);
      setValue(`items.${idx}.lot_number`, batch.lot_number || '');
      setValue(`items.${idx}.expiry_date`, batch.expiry_date || '');
    }
  };

  const onSubmit = async (data: FulfillFormData) => {
    setIsLoading(true);
    try {
      const payload = {
        ...data,
        items: data.items.map(item => ({
          ...item,
          batch_id: item.batch_id || null,
          quantity_used: Number(item.quantity_used),
          internal_price: item.internal_price ? Number(item.internal_price) : null,
        })),
      };
      await api.post(`/requests/${request.id}/fulfill`, payload);
      toast.success('Request fulfilled successfully');
      onSuccess();
      onClose();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal isOpen title={`Fulfil Request ${request.request_number}`} onClose={onClose} size="2xl"
      footer={
        <div className="flex justify-end gap-3">
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button form="fulfill-form" type="submit" disabled={isLoading} className="btn-success">
            {isLoading ? 'Processing...' : 'Complete Fulfilment'}
          </button>
        </div>
      }>
      <form id="fulfill-form" onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        {fields.map((field, idx) => {
          const reqItem = (request.items || [])[idx];
          const itemId = watchedItems[idx]?.inventory_item_id;
          const batches = batchOptions[itemId] || [];
          const isSubstitution = watchedItems[idx]?.is_substitution;

          return (
            <div key={field.id} className="p-4 border border-slate-200 rounded-xl space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="font-medium text-slate-900">{reqItem?.item_name}</h4>
                <span className="text-sm text-slate-500">
                  Requested: <strong>{reqItem?.quantity_requested} {reqItem?.unit}</strong>
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div>
                  <label className="label text-xs">Qty Used *</label>
                  <input {...register(`items.${idx}.quantity_used`, { required: true, valueAsNumber: true, min: 0.001 })}
                    type="number" step="0.001" min="0.001" className="input" />
                </div>
                <div>
                  <label className="label text-xs">Price per unit ($)</label>
                  <input {...register(`items.${idx}.internal_price`, { valueAsNumber: true })}
                    type="number" step="0.01" min="0" className="input" />
                </div>
                <div>
                  <label className="label text-xs">
                    Batch
                    <button type="button" onClick={() => loadBatches(itemId, idx)}
                      className="ml-2 text-blue-500 text-xs hover:underline">Load batches</button>
                  </label>
                  {batches.length > 0 ? (
                    <select {...register(`items.${idx}.batch_id`)} onChange={e => handleBatchChange(idx, e.target.value)} className="input">
                      <option value="">— Manual entry —</option>
                      {batches.map(b => (
                        <option key={b.id} value={b.id}>
                          {b.batch_number} {b.expiry_date ? `(exp ${b.expiry_date})` : ''} — {b.quantity} left
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input {...register(`items.${idx}.batch_number`)} className="input" placeholder="Batch number" />
                  )}
                </div>
                <div>
                  <label className="label text-xs">Lot Number</label>
                  <input {...register(`items.${idx}.lot_number`)} className="input" />
                </div>
                <div>
                  <label className="label text-xs">Expiry Date</label>
                  <input {...register(`items.${idx}.expiry_date`)} type="date" className="input" />
                </div>
              </div>

              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input {...register(`items.${idx}.is_substitution`)} type="checkbox" className="rounded border-slate-300 text-blue-600" />
                <span className="text-slate-700">This is a substitution (different item used)</span>
              </label>

              {isSubstitution && (
                <div>
                  <label className="label text-xs">Substitution Reason *</label>
                  <input {...register(`items.${idx}.substitution_reason`)} className="input" placeholder="Why was a different item used?" />
                </div>
              )}
            </div>
          );
        })}

        <div>
          <label className="label">Nurse Notes</label>
          <textarea {...register('notes')} rows={2} className="input" placeholder="Any notes about the administration…" />
        </div>
      </form>
    </Modal>
  );
};

const RequestDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [showFulfill, setShowFulfill] = useState(false);
  const [showCancel, setShowCancel] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

  const { data: request, isLoading } = useQuery<StockRequest>({
    queryKey: ['request', id],
    queryFn: async () => (await api.get(`/requests/${id}`)).data,
    refetchInterval: 15_000,
  });

  const acceptMutation = useMutation({
    mutationFn: () => api.put(`/requests/${id}/accept`),
    onSuccess: () => {
      toast.success('Request accepted');
      qc.invalidateQueries({ queryKey: ['request', id] });
      qc.invalidateQueries({ queryKey: ['requests'] });
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const cancelMutation = useMutation({
    mutationFn: () => api.put(`/requests/${id}/cancel`, { reason: cancelReason }),
    onSuccess: () => {
      toast.success('Request cancelled');
      qc.invalidateQueries({ queryKey: ['request', id] });
      qc.invalidateQueries({ queryKey: ['requests'] });
      setShowCancel(false);
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const handlePrint = () => window.print();

  if (isLoading) return <LoadingSpinner />;
  if (!request) return <div className="card p-8 text-center text-slate-500">Request not found</div>;

  const canAccept = user?.role !== 'doctor' && request.status === 'pending';
  const canFulfil = user?.role !== 'doctor' && ['pending', 'accepted', 'in_progress'].includes(request.status);
  const canCancel = user?.role !== 'nurse' && ['pending', 'accepted'].includes(request.status) &&
    (user?.role === 'admin' || request.doctor_id === user?.id);

  const totalCharge = (request.fulfillments || []).reduce((sum, f) => sum + Number(f.total_charge), 0);

  return (
    <div className="space-y-5 max-w-4xl">
      {/* Back + header */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/requests')} className="btn-secondary btn-sm">
          <ArrowLeft size={14} />
        </button>
        <div className="flex-1 flex items-center gap-3 flex-wrap">
          <h1 className="page-title">{request.request_number}</h1>
          <Badge color={statusColors[request.status] || 'slate'}>{request.status.replace(/_/g, ' ')}</Badge>
          <Badge color={priorityColors[request.priority] || 'slate'}>{request.priority}</Badge>
        </div>
        <div className="flex gap-2 no-print">
          <button onClick={handlePrint} className="btn-secondary btn-sm"><Printer size={14} /> Print</button>
          {canAccept && <button onClick={() => acceptMutation.mutate()} disabled={acceptMutation.isPending} className="btn-primary btn-sm"><CheckCircle size={14} /> Accept</button>}
          {canFulfil && <button onClick={() => setShowFulfill(true)} className="btn-success btn-sm"><Package size={14} /> Fulfil</button>}
          {canCancel && <button onClick={() => setShowCancel(true)} className="btn-danger btn-sm"><XCircle size={14} /> Cancel</button>}
        </div>
      </div>

      {/* Info cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="card p-4">
          <div className="flex items-center gap-2 text-slate-500 mb-2"><User size={15} /> <span className="text-xs font-medium uppercase tracking-wide">Doctor</span></div>
          <p className="font-semibold text-slate-900">{request.doctor_name}</p>
          {request.doctor_email && <p className="text-xs text-slate-400">{request.doctor_email}</p>}
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-2 text-slate-500 mb-2"><User size={15} /> <span className="text-xs font-medium uppercase tracking-wide">Patient</span></div>
          <p className="font-semibold text-slate-900">{request.patient_name || '—'}</p>
          {request.patient_ref && <p className="text-xs text-slate-400">{request.patient_ref}</p>}
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-2 text-slate-500 mb-2"><CalendarDays size={15} /> <span className="text-xs font-medium uppercase tracking-wide">Created</span></div>
          <p className="font-semibold text-slate-900">{format(parseISO(request.created_at), 'dd MMM yyyy')}</p>
          <p className="text-xs text-slate-400">{format(parseISO(request.created_at), 'HH:mm')}</p>
        </div>
      </div>

      {request.notes && (
        <div className="card p-4 flex gap-3">
          <FileText size={16} className="text-slate-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">Notes</p>
            <p className="text-sm text-slate-700">{request.notes}</p>
          </div>
        </div>
      )}

      {/* Requested items */}
      <div className="card overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-200 bg-slate-50">
          <h3 className="font-semibold text-slate-900">Requested Items</h3>
        </div>
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-100">
              <th className="table-th">Item</th>
              <th className="table-th">Category</th>
              <th className="table-th text-right">Qty Requested</th>
              <th className="table-th text-right">Unit Price</th>
              <th className="table-th text-right">Est. Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {(request.items || []).map(item => (
              <tr key={item.id}>
                <td className="table-td font-medium">{item.item_name}</td>
                <td className="table-td"><span className="text-slate-500 text-xs">{item.category_name || '—'}</span></td>
                <td className="table-td text-right">{item.quantity_requested} {item.unit}</td>
                <td className="table-td text-right">{item.internal_price != null ? `$${Number(item.internal_price).toFixed(2)}` : '—'}</td>
                <td className="table-td text-right font-medium">
                  {item.internal_price != null
                    ? `$${(Number(item.internal_price) * Number(item.quantity_requested)).toFixed(2)}`
                    : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Fulfilment records */}
      {(request.fulfillments || []).length > 0 && (
        <div className="card overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-200 bg-emerald-50 flex items-center justify-between">
            <h3 className="font-semibold text-emerald-900 flex items-center gap-2">
              <CheckCircle size={16} className="text-emerald-600" /> Fulfilment Record
            </h3>
            <span className="text-emerald-700 font-semibold">Total: ${totalCharge.toFixed(2)}</span>
          </div>
          {(request.fulfillments || []).map(f => (
            <div key={f.id} className="p-5 border-b border-slate-100 last:border-0">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <p className="font-mono font-semibold text-slate-800">{f.fulfillment_number}</p>
                  <p className="text-xs text-slate-500">
                    by {f.nurse_name} • {format(parseISO(f.completed_at), 'dd MMM yyyy, HH:mm')}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-emerald-700 text-lg">${Number(f.total_charge).toFixed(2)}</p>
                  <p className="text-xs text-slate-400">Total charge</p>
                </div>
              </div>
              <table className="w-full text-sm">
                <thead><tr className="border-b border-slate-100">
                  <th className="text-left py-1 text-xs text-slate-500">Item</th>
                  <th className="text-right py-1 text-xs text-slate-500">Qty Used</th>
                  <th className="text-left py-1 text-xs text-slate-500">Batch</th>
                  <th className="text-left py-1 text-xs text-slate-500">Expiry</th>
                  <th className="text-right py-1 text-xs text-slate-500">Price</th>
                  <th className="text-right py-1 text-xs text-slate-500">Charge</th>
                </tr></thead>
                <tbody>
                  {(f.items || []).map(fi => (
                    <tr key={fi.id} className="border-b border-slate-50">
                      <td className="py-1.5">
                        {fi.item_name}
                        {fi.is_substitution && <Badge color="orange" className="ml-2">Sub</Badge>}
                      </td>
                      <td className="text-right py-1.5">{fi.quantity_used} {fi.unit}</td>
                      <td className="py-1.5 font-mono text-xs text-slate-500">{fi.batch_number || '—'}</td>
                      <td className="py-1.5 text-xs text-slate-500">{fi.expiry_date || '—'}</td>
                      <td className="text-right py-1.5">{fi.internal_price != null ? `$${Number(fi.internal_price).toFixed(2)}` : '—'}</td>
                      <td className="text-right py-1.5 font-medium">{fi.total_charge != null ? `$${Number(fi.total_charge).toFixed(2)}` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {f.notes && <p className="text-xs text-slate-500 mt-2 italic">{f.notes}</p>}

              {/* Copyable stock note for clinical records */}
              {(f.items || []).length > 0 && (
                <StockNote
                  items={f.items!}
                  nurseName={f.nurse_name}
                />
              )}
            </div>
          ))}
        </div>
      )}

      {/* Fulfil modal */}
      {showFulfill && request && (
        <FulfillModal
          request={request}
          onClose={() => setShowFulfill(false)}
          onSuccess={() => {
            qc.invalidateQueries({ queryKey: ['request', id] });
            qc.invalidateQueries({ queryKey: ['requests'] });
            qc.invalidateQueries({ queryKey: ['inventory'] });
          }}
        />
      )}

      {/* Cancel dialog */}
      <Modal isOpen={showCancel} onClose={() => setShowCancel(false)} title="Cancel Request" size="sm"
        footer={
          <div className="flex justify-end gap-3">
            <button onClick={() => setShowCancel(false)} className="btn-secondary">Back</button>
            <button onClick={() => cancelMutation.mutate()} disabled={cancelMutation.isPending || !cancelReason.trim()} className="btn-danger">
              {cancelMutation.isPending ? 'Cancelling...' : 'Confirm Cancel'}
            </button>
          </div>
        }>
        <div className="space-y-3">
          <p className="text-sm text-slate-600">Please provide a reason for cancellation.</p>
          <textarea
            value={cancelReason}
            onChange={e => setCancelReason(e.target.value)}
            rows={3}
            className="input w-full"
            placeholder="Reason for cancellation…"
          />
        </div>
      </Modal>
    </div>
  );
};

export default RequestDetail;
