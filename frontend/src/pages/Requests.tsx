import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { useForm, useFieldArray } from 'react-hook-form';
import {
  Plus, Search, ClipboardList, ChevronRight, AlertTriangle,
  Clock, CheckCircle, XCircle, Filter, RefreshCw, Trash2
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { api, getErrorMessage } from '../api/client';
import { StockRequest, InventoryItem } from '../types';
import { useAuth } from '../context/AuthContext';
import Modal from '../components/Modal';
import Badge, { statusColors, priorityColors } from '../components/Badge';
import LoadingSpinner from '../components/LoadingSpinner';
import toast from 'react-hot-toast';

interface RequestFormData {
  patient_name?: string;
  patient_ref?: string;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  notes?: string;
  items: Array<{ inventory_item_id: string; quantity_requested: number; notes?: string }>;
}

const statusIcons: Record<string, React.ReactNode> = {
  pending: <Clock size={14} className="text-amber-500" />,
  accepted: <CheckCircle size={14} className="text-blue-500" />,
  in_progress: <RefreshCw size={14} className="text-cyan-500" />,
  fulfilled: <CheckCircle size={14} className="text-emerald-500" />,
  partially_fulfilled: <AlertTriangle size={14} className="text-orange-500" />,
  cancelled: <XCircle size={14} className="text-slate-400" />,
};

const priorityBadge = (p: string) => {
  const c = priorityColors[p] || 'slate';
  return <Badge color={c}>{p}</Badge>;
};

const NewRequestModal: React.FC<{ onClose: () => void; onSuccess: () => void }> = ({ onClose, onSuccess }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const { data: inventory } = useQuery<{ items: InventoryItem[] }>({
    queryKey: ['inventory', 'all-active'],
    queryFn: async () => (await api.get('/inventory?limit=200&active=true')).data,
  });

  const { register, handleSubmit, control, watch, formState: { errors } } = useForm<RequestFormData>({
    defaultValues: { priority: 'normal', items: [{ inventory_item_id: '', quantity_requested: 1 }] },
  });

  const { fields, append, remove } = useFieldArray({ control, name: 'items' });
  const watchedItems = watch('items');

  const availableItems = (inventory?.items || []).filter(i =>
    i.is_active && i.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const onSubmit = async (data: RequestFormData) => {
    if (data.items.some(i => !i.inventory_item_id)) {
      toast.error('Please select an item for each line');
      return;
    }
    setIsLoading(true);
    try {
      await api.post('/requests', data);
      toast.success('Request created successfully');
      onSuccess();
      onClose();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal isOpen title="New Stock Request" onClose={onClose} size="2xl"
      footer={
        <div className="flex justify-end gap-3">
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button form="req-form" type="submit" disabled={isLoading} className="btn-primary">
            {isLoading ? 'Submitting...' : 'Submit Request'}
          </button>
        </div>
      }>
      <form id="req-form" onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        {/* Patient info */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Patient Name</label>
            <input {...register('patient_name')} className="input" placeholder="Optional" />
          </div>
          <div>
            <label className="label">Patient Ref / DOB</label>
            <input {...register('patient_ref')} className="input" placeholder="Optional" />
          </div>
        </div>

        <div>
          <label className="label">Priority</label>
          <select {...register('priority')} className="input">
            <option value="low">Low</option>
            <option value="normal">Normal</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </select>
        </div>

        {/* Items */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="label mb-0">Items *</label>
            <button type="button" onClick={() => append({ inventory_item_id: '', quantity_requested: 1 })}
              className="btn-secondary btn-sm">
              <Plus size={13} /> Add Line
            </button>
          </div>

          {/* Search filter */}
          <div className="relative mb-2">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
              className="input pl-8 text-sm" placeholder="Filter items…" />
          </div>

          <div className="space-y-2">
            {fields.map((field, idx) => {
              const selectedId = watchedItems[idx]?.inventory_item_id;
              const selectedItem = inventory?.items.find(i => i.id === selectedId);
              const isLow = selectedItem && Number(selectedItem.quantity_on_hand) <= Number(selectedItem.reorder_threshold);
              return (
                <div key={field.id} className={`flex gap-2 p-3 rounded-lg border ${isLow ? 'border-amber-300 bg-amber-50' : 'border-slate-200 bg-slate-50'}`}>
                  <div className="flex-1">
                    <select {...register(`items.${idx}.inventory_item_id`, { required: true })} className="input text-sm">
                      <option value="">— Select item —</option>
                      {(searchTerm ? availableItems : inventory?.items || []).filter(i => i.is_active).map(i => (
                        <option key={i.id} value={i.id}>
                          {i.name} ({Number(i.quantity_on_hand).toFixed(0)} {i.unit} available)
                          {Number(i.quantity_on_hand) <= Number(i.reorder_threshold) ? ' ⚠ LOW' : ''}
                        </option>
                      ))}
                    </select>
                    {isLow && <p className="text-xs text-amber-700 mt-1">⚠ Low stock — only {Number(selectedItem.quantity_on_hand).toFixed(0)} {selectedItem.unit} remaining</p>}
                  </div>
                  <div className="w-24 flex-shrink-0">
                    <input {...register(`items.${idx}.quantity_requested`, { required: true, valueAsNumber: true, min: 0.001 })}
                      type="number" step="0.001" min="0.001" placeholder="Qty" className="input text-sm" />
                  </div>
                  <div className="flex-1">
                    <input {...register(`items.${idx}.notes`)} placeholder="Notes (optional)" className="input text-sm" />
                  </div>
                  {fields.length > 1 && (
                    <button type="button" onClick={() => remove(idx)} className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded">
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div>
          <label className="label">General Notes</label>
          <textarea {...register('notes')} rows={2} className="input" placeholder="Any special instructions…" />
        </div>
      </form>
    </Modal>
  );
};

const Requests: React.FC = () => {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [showNew, setShowNew] = useState(false);

  const status = searchParams.get('status') || '';
  const setStatus = (s: string) => {
    const p = new URLSearchParams(searchParams);
    if (s) p.set('status', s); else p.delete('status');
    setSearchParams(p);
  };

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['requests', status],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: '100' });
      if (status) params.set('status', status);
      const { data } = await api.get(`/requests?${params}`);
      return data;
    },
    refetchInterval: 30_000,
  });

  const requests: StockRequest[] = data?.requests || [];

  const tabs = [
    { label: 'All', value: '' },
    { label: 'Pending', value: 'pending' },
    { label: 'Accepted', value: 'accepted' },
    { label: 'Fulfilled', value: 'fulfilled' },
    { label: 'Cancelled', value: 'cancelled' },
  ];

  return (
    <div className="space-y-5">
      <div className="page-header">
        <div>
          <h1 className="page-title">Stock Requests</h1>
          <p className="text-sm text-slate-500 mt-0.5">{data?.total || 0} request{data?.total !== 1 ? 's' : ''}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => refetch()} className="btn-secondary btn-sm"><RefreshCw size={14} /></button>
          {user?.role !== 'nurse' && (
            <button onClick={() => setShowNew(true)} className="btn-primary btn-sm">
              <Plus size={14} /> New Request
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-slate-100 rounded-xl w-fit">
        {tabs.map(tab => (
          <button key={tab.value} onClick={() => setStatus(tab.value)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${status === tab.value ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* List */}
      <div className="card overflow-hidden">
        {isLoading ? (
          <LoadingSpinner />
        ) : requests.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16">
            <ClipboardList size={40} className="text-slate-300" />
            <p className="text-slate-500">No requests found</p>
            {user?.role !== 'nurse' && (
              <button onClick={() => setShowNew(true)} className="btn-primary btn-sm">
                <Plus size={14} /> Create First Request
              </button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {requests.map(req => (
              <Link key={req.id} to={`/requests/${req.id}`}
                className="flex items-center gap-4 px-5 py-4 hover:bg-slate-50 transition-colors group">
                <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center">
                  {statusIcons[req.status] || <ClipboardList size={16} className="text-slate-400" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-slate-900 font-mono text-sm">{req.request_number}</span>
                    <Badge color={statusColors[req.status] || 'slate'}>{req.status.replace(/_/g, ' ')}</Badge>
                    {req.priority !== 'normal' && priorityBadge(req.priority)}
                  </div>
                  <div className="flex items-center gap-3 mt-0.5 text-sm text-slate-500 flex-wrap">
                    <span>Dr. {req.doctor_name}</span>
                    {req.patient_name && <span>• {req.patient_name}</span>}
                    <span>• {Number(req.item_count)} item{Number(req.item_count) !== 1 ? 's' : ''}</span>
                    <span>• {format(parseISO(req.created_at), 'dd MMM, HH:mm')}</span>
                  </div>
                  {req.notes && <p className="text-xs text-slate-400 mt-0.5 truncate">{req.notes}</p>}
                </div>
                <ChevronRight size={16} className="text-slate-300 group-hover:text-slate-500 flex-shrink-0" />
              </Link>
            ))}
          </div>
        )}
      </div>

      {showNew && (
        <NewRequestModal
          onClose={() => setShowNew(false)}
          onSuccess={() => qc.invalidateQueries({ queryKey: ['requests'] })}
        />
      )}
    </div>
  );
};

export default Requests;
