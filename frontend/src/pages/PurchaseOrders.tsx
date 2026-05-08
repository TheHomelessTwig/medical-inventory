import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, ShoppingCart, CheckCircle, Send, XCircle, Package, ChevronDown, ChevronUp, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { useForm, useFieldArray } from 'react-hook-form';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import Modal from '../components/Modal';
import Badge from '../components/Badge';
import { AttachmentPanel } from '../components/AttachmentPanel';
import { PageErrorBoundary } from '../components/ErrorBoundary';

interface PO {
  id: string;
  po_number: string;
  supplier_name: string;
  status: 'draft' | 'sent' | 'partial' | 'received' | 'cancelled';
  total_value: number;
  item_count: number;
  expected_date: string | null;
  created_at: string;
  created_by_name: string;
}

interface POItem {
  inventory_item_id?: string;
  item_name: string;
  quantity_ordered: number;
  unit_cost?: number;
  gst_applicable: boolean;
  notes?: string;
}

interface POForm {
  supplier_name: string;
  supplier_id?: string;
  notes?: string;
  expected_date?: string;
  items: POItem[];
}

const STATUS_COLORS: Record<string, 'slate' | 'blue' | 'green'> = {
  draft: 'slate',
  sent: 'blue',
  partial: 'blue',
  received: 'green',
  cancelled: 'slate',
};

const STATUS_ICONS: Record<string, React.ReactNode> = {
  draft: <Package className="w-3 h-3" />,
  sent:  <Send className="w-3 h-3" />,
  partial: <ChevronDown className="w-3 h-3" />,
  received: <CheckCircle className="w-3 h-3" />,
  cancelled: <XCircle className="w-3 h-3" />,
};

export default function PurchaseOrders() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const canManage = user?.role === 'admin' || (user?.role as string) === 'practice_manager';

  const [showNew, setShowNew] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('');

  const { data, isLoading } = useQuery<{ orders: PO[]; total: number }>({
    queryKey: ['purchase-orders', statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: '50' });
      if (statusFilter) params.set('status', statusFilter);
      const res = await api.get(`/api/purchase-orders?${params}`);
      return res.data;
    },
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/purchase-orders/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['purchase-orders'] }); toast.success('Order cancelled'); },
    onError: () => toast.error('Failed to cancel'),
  });

  const sendMutation = useMutation({
    mutationFn: (id: string) => api.post(`/api/purchase-orders/${id}/send`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['purchase-orders'] }); toast.success('Order marked as sent'); },
    onError: () => toast.error('Failed to send'),
  });

  const orders = data?.orders ?? [];

  return (
    <PageErrorBoundary context="Purchase Orders">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Purchase Orders</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
              {data?.total ?? 0} orders
            </p>
          </div>
          {canManage && (
            <button onClick={() => setShowNew(true)} className="btn-primary flex items-center gap-2">
              <Plus className="w-4 h-4" /> New Order
            </button>
          )}
        </div>

        {/* Filters */}
        <div className="flex gap-2 flex-wrap">
          {['', 'draft', 'sent', 'partial', 'received', 'cancelled'].map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                statusFilter === s
                  ? 'bg-blue-600 text-white'
                  : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-blue-400'
              }`}
            >
              {s === '' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>

        {/* Orders list */}
        {isLoading ? (
          <div className="card p-8 text-center text-slate-400">Loading…</div>
        ) : orders.length === 0 ? (
          <div className="card p-12 text-center">
            <ShoppingCart className="w-12 h-12 mx-auto mb-3 text-slate-300 dark:text-slate-600" />
            <p className="text-slate-500 dark:text-slate-400">No purchase orders yet</p>
          </div>
        ) : (
          <div className="space-y-3">
            {orders.map(po => (
              <div key={po.id} className="card">
                <div
                  className="p-4 flex items-center gap-4 cursor-pointer"
                  onClick={() => setExpanded(expanded === po.id ? null : po.id)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-sm font-semibold text-blue-600 dark:text-blue-400">{po.po_number}</span>
                      <Badge color={STATUS_COLORS[po.status] ?? 'slate'}>
                        <span className="flex items-center gap-1">{STATUS_ICONS[po.status]} {po.status}</span>
                      </Badge>
                    </div>
                    <p className="text-sm text-slate-600 dark:text-slate-300 mt-0.5">{po.supplier_name}</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {po.item_count} item{po.item_count !== 1 ? 's' : ''} · ${Number(po.total_value).toFixed(2)}
                      {po.expected_date && ` · Expected ${po.expected_date}`}
                      {' · '}{new Date(po.created_at).toLocaleDateString()} by {po.created_by_name}
                    </p>
                  </div>
                  {expanded === po.id ? <ChevronUp className="w-4 h-4 text-slate-400 flex-shrink-0" /> : <ChevronDown className="w-4 h-4 text-slate-400 flex-shrink-0" />}
                </div>

                {expanded === po.id && (
                  <div className="border-t border-slate-100 dark:border-slate-700 p-4 space-y-4">
                    <PODetail poId={po.id} status={po.status} canManage={canManage}
                      onSend={() => sendMutation.mutate(po.id)}
                      onCancel={() => { if (confirm('Cancel this order?')) cancelMutation.mutate(po.id); }}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {showNew && canManage && (
        <NewPOModal onClose={() => setShowNew(false)} />
      )}
    </PageErrorBoundary>
  );
}

function PODetail({ poId, status, canManage, onSend, onCancel }: {
  poId: string; status: string; canManage: boolean;
  onSend: () => void; onCancel: () => void;
}) {
  const qc = useQueryClient();
  const [showReceive, setShowReceive] = useState(false);

  const { data } = useQuery<{ items: PODetailItem[]; attachments: unknown[] }>({
    queryKey: ['purchase-order-detail', poId],
    queryFn: async () => { const res = await api.get(`/api/purchase-orders/${poId}`); return res.data; },
  });

  const items = data?.items ?? [];

  return (
    <div className="space-y-4">
      {/* Line items */}
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-slate-500 dark:text-slate-400 text-left">
            <th className="pb-2">Item</th>
            <th className="pb-2 text-right">Ordered</th>
            <th className="pb-2 text-right">Received</th>
            <th className="pb-2 text-right">Unit Cost</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item: PODetailItem) => (
            <tr key={item.id} className="border-t border-slate-100 dark:border-slate-700">
              <td className="py-2 text-slate-700 dark:text-slate-300">{item.item_name}</td>
              <td className="py-2 text-right text-slate-600 dark:text-slate-400">{item.quantity_ordered}</td>
              <td className={`py-2 text-right font-medium ${
                item.quantity_received >= item.quantity_ordered ? 'text-green-600 dark:text-green-400' : 'text-slate-600 dark:text-slate-400'
              }`}>{item.quantity_received}</td>
              <td className="py-2 text-right text-slate-600 dark:text-slate-400">
                {item.unit_cost ? `$${Number(item.unit_cost).toFixed(2)}` : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Action buttons */}
      {canManage && (
        <div className="flex gap-2 flex-wrap">
          {status === 'draft' && (
            <button onClick={onSend} className="btn-secondary text-sm flex items-center gap-1.5">
              <Send className="w-3.5 h-3.5" /> Mark as Sent
            </button>
          )}
          {(status === 'sent' || status === 'partial') && (
            <button onClick={() => setShowReceive(true)} className="btn-primary text-sm flex items-center gap-1.5">
              <CheckCircle className="w-3.5 h-3.5" /> Record Receipt
            </button>
          )}
          {(status === 'draft' || status === 'sent') && (
            <button onClick={onCancel} className="btn-danger text-sm flex items-center gap-1.5">
              <XCircle className="w-3.5 h-3.5" /> Cancel
            </button>
          )}
        </div>
      )}

      <AttachmentPanel entityType="purchase_order" entityId={poId} canUpload={canManage} canDelete={canManage} />

      {showReceive && (
        <ReceiveModal poId={poId} items={items} onClose={() => { setShowReceive(false); qc.invalidateQueries({ queryKey: ['purchase-orders'] }); }} />
      )}
    </div>
  );
}

interface PODetailItem {
  id: string;
  item_name: string;
  quantity_ordered: number;
  quantity_received: number;
  unit_cost?: number;
}

function ReceiveModal({ poId, items, onClose }: { poId: string; items: PODetailItem[]; onClose: () => void }) {
  const qc = useQueryClient();
  const [receiving, setReceiving] = useState<Record<string, { qty: string; batch: string; expiry: string }>>(() =>
    Object.fromEntries(items.map(i => [i.id, { qty: String(i.quantity_ordered - i.quantity_received), batch: '', expiry: '' }]))
  );

  const receiveMutation = useMutation({
    mutationFn: (data: object) => api.post(`/api/purchase-orders/${poId}/receive`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['purchase-orders'] });
      qc.invalidateQueries({ queryKey: ['purchase-order-detail', poId] });
      toast.success('Receipt recorded and stock updated');
      onClose();
    },
    onError: () => toast.error('Failed to record receipt'),
  });

  const handleSubmit = () => {
    const recvItems = items.map(i => ({
      po_item_id: i.id,
      quantity_received: parseFloat(receiving[i.id]?.qty || '0') || 0,
      batch_number: receiving[i.id]?.batch || null,
      expiry_date: receiving[i.id]?.expiry || null,
    })).filter(r => r.quantity_received > 0);
    if (recvItems.length === 0) { toast.error('Enter at least one received quantity'); return; }
    receiveMutation.mutate({ items: recvItems });
  };

  return (
    <Modal isOpen title="Record Goods Receipt" onClose={onClose}>
      <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
        {items.filter(i => i.quantity_received < i.quantity_ordered).map(item => (
          <div key={item.id} className="card p-3 space-y-2">
            <p className="font-medium text-sm text-slate-700 dark:text-slate-300">{item.item_name}</p>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="label">Qty Received</label>
                <input type="number" min="0" className="input text-sm"
                  value={receiving[item.id]?.qty ?? ''}
                  onChange={e => setReceiving(r => ({ ...r, [item.id]: { ...r[item.id], qty: e.target.value } }))}
                />
              </div>
              <div>
                <label className="label">Batch #</label>
                <input type="text" className="input text-sm"
                  value={receiving[item.id]?.batch ?? ''}
                  onChange={e => setReceiving(r => ({ ...r, [item.id]: { ...r[item.id], batch: e.target.value } }))}
                />
              </div>
              <div>
                <label className="label">Expiry Date</label>
                <input type="date" className="input text-sm"
                  value={receiving[item.id]?.expiry ?? ''}
                  onChange={e => setReceiving(r => ({ ...r, [item.id]: { ...r[item.id], expiry: e.target.value } }))}
                />
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="flex justify-end gap-2 mt-4 pt-4 border-t border-slate-100 dark:border-slate-700">
        <button onClick={onClose} className="btn-secondary">Cancel</button>
        <button onClick={handleSubmit} disabled={receiveMutation.isPending} className="btn-primary">
          {receiveMutation.isPending ? 'Saving…' : 'Record Receipt'}
        </button>
      </div>
    </Modal>
  );
}

function NewPOModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const { register, control, handleSubmit, formState: { errors } } = useForm<POForm>({
    defaultValues: { supplier_name: '', items: [{ item_name: '', quantity_ordered: 1, gst_applicable: true }] },
  });
  const { fields, append, remove } = useFieldArray({ control, name: 'items' });

  const { data: suppliers } = useQuery<{ id: string; name: string }[]>({
    queryKey: ['suppliers-active'],
    queryFn: async () => { const r = await api.get('/api/suppliers?active=true&limit=200'); return r.data.suppliers ?? r.data; },
  });

  const createMutation = useMutation({
    mutationFn: (data: POForm) => api.post('/api/purchase-orders', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['purchase-orders'] });
      toast.success('Purchase order created');
      onClose();
    },
    onError: () => toast.error('Failed to create order'),
  });

  return (
    <Modal isOpen title="New Purchase Order" onClose={onClose}>
      <form onSubmit={handleSubmit(d => createMutation.mutate(d))} className="space-y-4">
        <div>
          <label className="label">Supplier *</label>
          <input
            {...register('supplier_name', { required: 'Supplier name is required' })}
            list="supplier-list"
            className="input"
            placeholder="Supplier name"
          />
          <datalist id="supplier-list">
            {suppliers?.map(s => <option key={s.id} value={s.name} />)}
          </datalist>
          {errors.supplier_name && <p className="text-red-500 text-xs mt-1">{errors.supplier_name.message}</p>}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Expected Delivery</label>
            <input type="date" {...register('expected_date')} className="input" />
          </div>
          <div>
            <label className="label">Notes</label>
            <input {...register('notes')} className="input" placeholder="Optional" />
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="label mb-0">Items *</label>
            <button type="button" onClick={() => append({ item_name: '', quantity_ordered: 1, gst_applicable: true })}
              className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1">
              <Plus className="w-3 h-3" /> Add item
            </button>
          </div>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {fields.map((field, idx) => (
              <div key={field.id} className="grid grid-cols-12 gap-2 items-center">
                <input className="input text-sm col-span-5" placeholder="Item name" {...register(`items.${idx}.item_name`, { required: true })} />
                <input type="number" min="0.001" step="any" className="input text-sm col-span-2" placeholder="Qty" {...register(`items.${idx}.quantity_ordered`, { valueAsNumber: true, required: true })} />
                <input type="number" min="0" step="0.01" className="input text-sm col-span-2" placeholder="$ cost" {...register(`items.${idx}.unit_cost`, { valueAsNumber: true })} />
                <label className="col-span-2 flex items-center gap-1 text-xs text-slate-600 dark:text-slate-400">
                  <input type="checkbox" className="rounded" {...register(`items.${idx}.gst_applicable`)} />
                  GST
                </label>
                <button type="button" onClick={() => remove(idx)} className="col-span-1 text-red-400 hover:text-red-600">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-4 border-t border-slate-100 dark:border-slate-700">
          <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
          <button type="submit" disabled={createMutation.isPending} className="btn-primary">
            {createMutation.isPending ? 'Creating…' : 'Create Order'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
