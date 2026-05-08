import React from 'react';
import { AlertTriangle } from 'lucide-react';
import Modal from './Modal';

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  isLoading?: boolean;
}

const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen, onClose, onConfirm, title, message,
  confirmLabel = 'Confirm', danger = false, isLoading = false,
}) => (
  <Modal isOpen={isOpen} onClose={onClose} title={title} size="sm"
    footer={
      <div className="flex justify-end gap-3">
        <button onClick={onClose} className="btn-secondary" disabled={isLoading}>Cancel</button>
        <button
          onClick={onConfirm}
          className={danger ? 'btn-danger' : 'btn-primary'}
          disabled={isLoading}
        >
          {isLoading ? 'Processing...' : confirmLabel}
        </button>
      </div>
    }
  >
    <div className="flex gap-4">
      {danger && (
        <div className="flex-shrink-0 w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
          <AlertTriangle size={20} className="text-red-600" />
        </div>
      )}
      <p className="text-sm text-slate-600 leading-relaxed">{message}</p>
    </div>
  </Modal>
);

export default ConfirmDialog;
