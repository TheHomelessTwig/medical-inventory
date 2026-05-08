import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useForm, useFieldArray } from 'react-hook-form';
import {
  Plus, FileText, ChevronRight, RefreshCw, Search,
  CheckCircle, Trash2, AlertCircle
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { api, getErrorMessage } from '../api/client';
import { Invoice, Supplier, InventoryItem } from '../types';
import Modal from '../components/Modal';
import Badge, { statusColors } from '../components/Badge';
import LoadingSpinner from '../components/LoadingSpinner';
import toast from 'react-hot-toast';

interface InvoiceFormData {
  invoice_number: string;
  supplier_id?: string;
  supplier_name: string;
  invoice_date?: string;
  received_date: string;
  due_date?: string;
  notes?: string;
  items: Array<{
    inventory_item_id?: string;
    item_name: string;
    batch_number?: string;
    lot_number?: string;
    expiry_date?: string;
    quantity: number;
    unit_cost: number;
    gst_applicable: boolean;
    notes?: string;
  }>;
}

const NewInvoiceModal: React.FC<{ onClose: () => void; onSuccess: () => void }> = ({ onClose, onSuccess }) => {
  const [isLoading, setIsLoading] = useState(false);
  const GST_RATE = 0.10;

  const { data: suppliers } = useQuery<Supplier[]>({ queryKey: ['suppliers'], queryFn: async () => (await api.get('/suppliers')).data });
  const { data: inventoryData } = useQuery<{ items: InventoryItem[] }>({ queryKey: ['inventory', 'all-active'], queryFn: async () => (await api.get('/inventory?limit=200&active=true')).data });

  const { register, handleSubmit, control, watch, setValue, formState: { errors } } = useForm<InvoiceFormData>({
    defaultValues: {
      received_date: format(new Date(), 'yyyy-MM-dd'),
      items: [{ item_name: '', quantity: 1, unit_cost: 0, gst_applicable: true }],
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: 'items' });
  const watchedItems = watch('items');
  const watchedSupplier = watch('supplier_id');

  // Auto-fill supplier name when supplier selected
  React.useEffect(() => {
    if (watchedSupplier) {
      const sup = suppliers?.find(s => s.id === watchedSupplier);
      if (sup) setValue('supplier_name', sup.name);
    }
  }, [watchedSupplier, suppliers, setValue]);

  // Auto-fill item name from inventory
  const handleItemChange = (idx: number, itemId: string) => {
    const item = inventoryData?.items.find(i => i.id === itemId);
    if (item) {
      setValue(`items.${idx}.item_name`, item.name);
      if (item.supplier_cost) setValue(`items.${idx}.unit_cost`, Number(item.supplier_cost));
    }
  };

  const totals = watchedItems.reduce((acc, item) => {
    const lineTotal = (Number(item.quantity) || 0) * (Number(item.unit_cost) || 0);
    const gst = item.gst_applicable ? lineTotal * GST_RATE : 0;
    return { subtotal: acc.subtotal + lineTotal, gst: acc.gst + gst };
  }, { subtotal: 0, gst: 0 });

  const onSubmit = async (data: InvoiceFormData) => {
    setIsLoading(true);
    try {
      await api.post('/invoices', data);
      toast.success('Invoice created');
      onSuccess();
      onClose();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal isOpen title="New Invoice" onClose={onClose} size="2xl"
      footer={
        <div className="flex items-center justify-between">
          <div className="text-sm text-slate-600">
            Subtotal: <strong>${totals.subtotal.toFixed(2)}</strong> + GST: <strong>${totals.gst.toFixed(2)}</strong> = <strong>${(totals.subtotal + totals.gst).toFixed(2)}</strong>
          </div>
          <div className="flex gap-3">
            <button onClick={onClose} className="btn-secondary">Cancel</button>
            <button form="invoice-form" type="submit" disabled={isLoading} className="btn-primary">
              {isLoading ? 'Saving...' : 'Create Invoice'}
            </button>
          </div>
        </div>
      }>
      <form id="invoice-form" onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        {/* Header fields */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Invoice Number *</label>
            <input {...register('invoice_number', { required: 'Required' })} className="input" placeholder="INV-2024-001" />
            {errors.invoice_number && <p className="mt-1 text-xs text-red-600">{errors.invoice_number.message}</p>}
          </div>
          <div>
            <label className="label">Supplier</label>
            <select {...register('supplier_id')} className="input">
              <option value="">— Select or type below —</option>
              {(suppliers || []).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Supplier Name *</label>
            <input {...register('supplier_name', { required: 'Required' })} className="input" placeholder="Or type manually" />
            {errors.supplier_name && <p className="mt-1 text-xs text-red-600">{errors.supplier_name.message}</p>}
          </div>
          <div>
            <label className="label">Invoice Date</label>
            <input {...register('invoice_date')} type="date" className="input" />
          </div>
          <div>
            <label className="label">Date Received *</label>
            <input {...register('received_date', { required: 'Required' })} type="date" className="input" />
          </div>
          <div>
            <label className="label">Due Date</label>
            <input {...register('due_date')} type="date" className="input" />
          </div>
        </div>

        {/* Line items */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="label mb-0">Line Items *</label>
            <button type="button" onClick={() => append({ item_name: '', quantity: 1, unit_cost: 0, gst_applicable: true })} className="btn-secondary btn-sm">
              <Plus size={13} /> Add Line
            </button>
          </div>

          <div className="space-y-3">
            {fields.map((field, idx) => {
              const qty = Number(watchedItems[idx]?.quantity) || 0;
              const cost = Number(watchedItems[idx]?.unit_cost) || 0;
              const gstApplicable = watchedItems[idx]?.gst_applicable;
              const lineTotal = qty * cost;
              const lineGst = gstApplicable ? lineTotal * GST_RATE : 0;

              return (
                <div key={field.id} className="p-3 border border-slate-200 rounded-xl bg-slate-50 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="label text-xs">Inventory Item</label>
                      <select onChange={e => handleItemChange(idx, e.target.value)} className="input text-sm">
                        <option value="">— Link to inventory item (optional) —</option>
                        {(inventoryData?.items || []).map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                      </select>
                      <input {...register(`items.${idx}.inventory_item_id`)} type="hidden" />
                    </div>
                    <div>
                      <label className="label text-xs">Item Name *</label>
                      <input {...register(`items.${idx}.item_name`, { required: true })} className="input text-sm" placeholder="Item description" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 items-end">
                    <div>
                      <label className="label text-xs">Qty *</label>
                      <input {...register(`items.${idx}.quantity`, { required: true, valueAsNumber: true })} type="number" step="0.001" min="0.001" className="input text-sm" />
                    </div>
                    <div>
                      <label className="label text-xs">Unit Cost *</label>
                      <input {...register(`items.${idx}.unit_cost`, { required: true, valueAsNumber: true })} type="number" step="0.01" min="0" className="input text-sm" />
                    </div>
                    <div>
                      <label className="label text-xs">Batch #</label>
                      <input {...register(`items.${idx}.batch_number`)} className="input text-sm" />
                    </div>
                    <div>
                      <label className="label text-xs">Expiry</label>
                      <input {...register(`items.${idx}.expiry_date`)} type="date" className="input text-sm" />
                    </div>
                    <div className="flex items-end gap-2">
                      <div className="flex-1 text-right">
                        <p className="text-xs text-slate-500">Total</p>
                        <p className="font-semibold text-slate-900">${(lineTotal + lineGst).toFixed(2)}</p>
                      </div>
                      {fields.length > 1 && (
                        <button type="button" onClick={() => remove(idx)} className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded mb-0.5">
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                  <label className="flex items-center gap-2 text-xs cursor-pointer">
                    <input {...register(`items.${idx}.gst_applicable`)} type="checkbox" className="rounded border-slate-300 text-blue-600" />
                    <span className="text-slate-600">GST Applicable (10%)</span>
                  </label>
                </div>
              );
            })}
          </div>
        </div>

        <div>
          <label className="label">Notes</label>
          <textarea {...register('notes')} rows={2} className="input" />
        </div>
      </form>
    </Modal>
  );
};

const Invoices: React.FC = () => {
  const qc = useQueryClient();
  const [showNew, setShowNew] = useState(false);
  const [search, setSearch] = useState('');

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['invoices', search],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: '50' });
      if (search) params.set('search', search);
      return (await api.get(`/invoices?${params}`)).data;
    },
  });

  const invoices: Invoice[] = data?.invoices || [];

  return (
    <div className="space-y-5">
      <div className="page-header">
        <div>
          <h1 className="page-title">Invoices</h1>
          <p className="text-sm text-slate-500 mt-0.5">{data?.total || 0} invoice{data?.total !== 1 ? 's' : ''}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => refetch()} className="btn-secondary btn-sm"><RefreshCw size={14} /></button>
          <button onClick={() => setShowNew(true)} className="btn-primary btn-sm">
            <Plus size={14} /> New Invoice
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="card p-3">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by invoice number or supplier…"
            className="input pl-9 w-full" />
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        {isLoading ? (
          <LoadingSpinner />
        ) : invoices.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16">
            <FileText size={40} className="text-slate-300" />
            <p className="text-slate-500">No invoices yet</p>
            <button onClick={() => setShowNew(true)} className="btn-primary btn-sm"><Plus size={14} /> Add First Invoice</button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="table-th">Invoice #</th>
                  <th className="table-th">Supplier</th>
                  <th className="table-th">Date Received</th>
                  <th className="table-th">Lines</th>
                  <th className="table-th text-right">Total (inc GST)</th>
                  <th className="table-th">Status</th>
                  <th className="table-th">Entered By</th>
                  <th className="table-th"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {invoices.map(inv => (
                  <tr key={inv.id} className="hover:bg-slate-50 transition-colors">
                    <td className="table-td font-mono font-semibold text-blue-700">{inv.invoice_number}</td>
                    <td className="table-td">{inv.supplier_name}</td>
                    <td className="table-td text-slate-500">{format(parseISO(inv.received_date), 'dd MMM yyyy')}</td>
                    <td className="table-td text-center">{inv.line_count || 0}</td>
                    <td className="table-td text-right font-semibold">${Number(inv.total_value).toFixed(2)}</td>
                    <td className="table-td">
                      <Badge color={statusColors[inv.status] || 'slate'}>{inv.status}</Badge>
                    </td>
                    <td className="table-td text-slate-500 text-sm">{inv.entered_by_name}</td>
                    <td className="table-td">
                      <Link to={`/invoices/${inv.id}`} className="p-1.5 rounded text-slate-400 hover:text-blue-600 hover:bg-blue-50 inline-flex">
                        <ChevronRight size={15} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showNew && <NewInvoiceModal onClose={() => setShowNew(false)} onSuccess={() => qc.invalidateQueries({ queryKey: ['invoices'] })} />}
    </div>
  );
};

export default Invoices;
