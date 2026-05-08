import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { Trash2 } from 'lucide-react';
import { api, getErrorMessage } from '../api/client';
import { InventoryItem } from '../types';
import Modal from './Modal';
import toast from 'react-hot-toast';

const WASTAGE_REASONS = [
  { value: 'dropped',       label: 'Dropped / spilled' },
  { value: 'contaminated',  label: 'Contaminated' },
  { value: 'opened_unused', label: 'Opened but unused' },
  { value: 'incorrect_dose',label: 'Incorrect dose drawn' },
  { value: 'expired_opened',label: 'Expired after opening' },
  { value: 'other',         label: 'Other' },
];

interface WastageForm {
  quantity_change: number;
  wastage_reason: string;
  batch_id?: string;
  reason: string;
}

interface Props {
  item: InventoryItem;
  onClose: () => void;
  onSuccess?: () => void;
}

const WastageModal: React.FC<Props> = ({ item, onClose, onSuccess }) => {
  const [saving, setSaving] = useState(false);
  const qc = useQueryClient();

  const { register, handleSubmit, watch, formState: { errors } } = useForm<WastageForm>({
    defaultValues: { wastage_reason: 'dropped', reason: '' },
  });

  const qty = watch('quantity_change', 0);

  const onSubmit = async (data: WastageForm) => {
    setSaving(true);
    try {
      await api.post(`/inventory/${item.id}/adjust`, {
        quantity_change: -Math.abs(data.quantity_change),
        adjustment_type: 'wastage',
        reason: data.reason || `Wastage: ${WASTAGE_REASONS.find(r => r.value === data.wastage_reason)?.label}`,
        wastage_reason: data.wastage_reason,
        batch_id: data.batch_id || null,
      });
      toast.success(`Wastage recorded: ${data.quantity_change} ${item.unit} of ${item.name}`);
      qc.invalidateQueries({ queryKey: ['inventory'] });
      onSuccess?.();
      onClose();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const step = Number(item.dispense_unit) || 1;

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={`Record Wastage — ${item.name}`}
      size="sm"
      footer={
        <div className="flex justify-end gap-3">
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button form="wastage-form" type="submit" disabled={saving} className="btn-danger">
            <Trash2 size={14} />
            {saving ? 'Saving…' : 'Record Wastage'}
          </button>
        </div>
      }
    >
      <form id="wastage-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {/* Current stock info */}
        <div className="p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg text-sm flex justify-between">
          <span className="text-slate-600 dark:text-slate-300">Current stock</span>
          <span className="font-semibold text-slate-900 dark:text-slate-100">
            {item.quantity_on_hand} {item.unit}
          </span>
        </div>

        {/* Quantity */}
        <div>
          <label className="label">Quantity wasted ({item.unit}) *</label>
          <input
            {...register('quantity_change', {
              required: 'Required',
              valueAsNumber: true,
              min: { value: 0.001, message: 'Must be > 0' },
              max: { value: item.quantity_on_hand, message: `Cannot exceed stock on hand (${item.quantity_on_hand})` },
            })}
            type="number"
            step={step}
            min={0}
            max={item.quantity_on_hand}
            className="input"
            autoFocus
          />
          {errors.quantity_change && (
            <p className="mt-1 text-xs text-red-600">{errors.quantity_change.message}</p>
          )}
          {qty > 0 && (
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Stock after: {(item.quantity_on_hand - qty).toFixed(3)} {item.unit}
            </p>
          )}
        </div>

        {/* Wastage reason */}
        <div>
          <label className="label">Reason for wastage *</label>
          <select {...register('wastage_reason', { required: true })} className="input">
            {WASTAGE_REASONS.map(r => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
        </div>

        {/* Batch */}
        {item.requires_batch_tracking && item.batches && item.batches.length > 0 && (
          <div>
            <label className="label">Batch</label>
            <select {...register('batch_id')} className="input">
              <option value="">— Not specified —</option>
              {item.batches.map(b => (
                <option key={b.id} value={b.id}>
                  {b.batch_number} {b.expiry_date ? `(exp ${b.expiry_date})` : ''} — {b.quantity} left
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Additional notes */}
        <div>
          <label className="label">Additional notes</label>
          <textarea {...register('reason')} rows={2} className="input"
            placeholder="Optional — e.g. vial dropped during preparation" />
        </div>

        {/* Warning */}
        <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg">
          <p className="text-xs text-amber-800 dark:text-amber-300">
            This will permanently deduct {qty || 0} {item.unit} from stock and record a wastage adjustment in the audit log.
          </p>
        </div>
      </form>
    </Modal>
  );
};

export default WastageModal;
