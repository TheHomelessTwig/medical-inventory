import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CheckCircle, Truck, Printer } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { api, getErrorMessage } from '../api/client';
import { Invoice } from '../types';
import Badge, { statusColors } from '../components/Badge';
import ConfirmDialog from '../components/ConfirmDialog';
import LoadingSpinner from '../components/LoadingSpinner';
import toast from 'react-hot-toast';

const InvoiceDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [showPost, setShowPost] = React.useState(false);

  const { data: invoice, isLoading } = useQuery<Invoice>({
    queryKey: ['invoice', id],
    queryFn: async () => (await api.get(`/invoices/${id}`)).data,
  });

  const postMutation = useMutation({
    mutationFn: () => api.post(`/invoices/${id}/post`),
    onSuccess: () => {
      toast.success('Invoice posted — stock levels updated');
      qc.invalidateQueries({ queryKey: ['invoice', id] });
      qc.invalidateQueries({ queryKey: ['invoices'] });
      qc.invalidateQueries({ queryKey: ['inventory'] });
      setShowPost(false);
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  if (isLoading) return <LoadingSpinner />;
  if (!invoice) return <div className="card p-8 text-center text-slate-500">Invoice not found</div>;

  const canPost = ['received', 'verified'].includes(invoice.status);
  const linkedItems = (invoice.items || []).filter(i => i.inventory_item_id);

  return (
    <div className="space-y-5 max-w-4xl">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/invoices')} className="btn-secondary btn-sm"><ArrowLeft size={14} /></button>
        <div className="flex-1 flex items-center gap-3 flex-wrap">
          <h1 className="page-title font-mono">{invoice.invoice_number}</h1>
          <Badge color={statusColors[invoice.status] || 'slate'}>{invoice.status}</Badge>
        </div>
        <div className="flex gap-2 no-print">
          <button onClick={() => window.print()} className="btn-secondary btn-sm"><Printer size={14} /> Print</button>
          {canPost && (
            <button onClick={() => setShowPost(true)} className="btn-success btn-sm">
              <Truck size={14} /> Post &amp; Update Stock
            </button>
          )}
        </div>
      </div>

      {/* Info grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Supplier', value: invoice.supplier_name },
          { label: 'Invoice Date', value: invoice.invoice_date ? format(parseISO(invoice.invoice_date), 'dd MMM yyyy') : '—' },
          { label: 'Date Received', value: format(parseISO(invoice.received_date), 'dd MMM yyyy') },
          { label: 'Entered By', value: invoice.entered_by_name },
        ].map(({ label, value }) => (
          <div key={label} className="card p-4">
            <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">{label}</p>
            <p className="font-semibold text-slate-900">{value}</p>
          </div>
        ))}
      </div>

      {invoice.status === 'posted' && (
        <div className="card p-4 bg-emerald-50 border-emerald-200 flex items-center gap-3">
          <CheckCircle size={18} className="text-emerald-600" />
          <div>
            <p className="font-semibold text-emerald-900">Posted — Stock Updated</p>
            <p className="text-sm text-emerald-700">
              Posted by {invoice.posted_by_name} on {invoice.posted_at ? format(parseISO(invoice.posted_at), 'dd MMM yyyy, HH:mm') : '—'}
            </p>
          </div>
        </div>
      )}

      {linkedItems.length < (invoice.items || []).length && canPost && (
        <div className="card p-4 bg-amber-50 border-amber-200 text-sm text-amber-800">
          <strong>Note:</strong> {(invoice.items || []).length - linkedItems.length} line item{(invoice.items || []).length - linkedItems.length !== 1 ? 's are' : ' is'} not linked to an inventory item and will not update stock when posted.
        </div>
      )}

      {/* Line items */}
      <div className="card overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-200 bg-slate-50">
          <h3 className="font-semibold text-slate-900">Line Items</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="table-th">Item</th>
                <th className="table-th">Batch #</th>
                <th className="table-th">Expiry</th>
                <th className="table-th text-right">Qty</th>
                <th className="table-th text-right">Unit Cost</th>
                <th className="table-th text-right">GST</th>
                <th className="table-th text-right">Total</th>
                <th className="table-th">Linked</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(invoice.items || []).map(item => (
                <tr key={item.id} className="hover:bg-slate-50">
                  <td className="table-td font-medium">{item.item_name}</td>
                  <td className="table-td font-mono text-xs text-slate-500">{item.batch_number || '—'}</td>
                  <td className="table-td text-xs text-slate-500">{item.expiry_date || '—'}</td>
                  <td className="table-td text-right">{item.quantity}</td>
                  <td className="table-td text-right">${Number(item.unit_cost).toFixed(4)}</td>
                  <td className="table-td text-right text-slate-500">{item.gst_applicable ? `$${Number(item.gst_amount || 0).toFixed(2)}` : '—'}</td>
                  <td className="table-td text-right font-semibold">${Number(item.total_cost || 0).toFixed(2)}</td>
                  <td className="table-td">
                    {item.inventory_item_id
                      ? <span className="text-xs text-emerald-600 font-medium">✓ Linked</span>
                      : <span className="text-xs text-slate-400">No link</span>}
                    {item.stock_updated && <span className="ml-2 text-xs text-blue-600">Updated</span>}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-200 bg-slate-50">
                <td colSpan={5} className="table-td text-right font-semibold text-slate-700">Subtotal:</td>
                <td className="table-td text-right text-slate-600">${Number(invoice.gst_amount).toFixed(2)}</td>
                <td className="table-td text-right font-bold text-slate-900">${Number(invoice.total_value).toFixed(2)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {invoice.notes && (
        <div className="card p-4">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">Notes</p>
          <p className="text-sm text-slate-700">{invoice.notes}</p>
        </div>
      )}

      <ConfirmDialog
        isOpen={showPost}
        onClose={() => setShowPost(false)}
        onConfirm={() => postMutation.mutate()}
        title="Post Invoice & Update Stock"
        message={`Post invoice ${invoice.invoice_number}? This will update stock quantities for all linked inventory items and cannot be undone.`}
        confirmLabel="Post Invoice"
        isLoading={postMutation.isPending}
      />
    </div>
  );
};

export default InvoiceDetail;
