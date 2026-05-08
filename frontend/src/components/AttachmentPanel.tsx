/**
 * Reusable attachment panel for invoices, returns, and purchase orders.
 * Shows existing attachments and provides a drag-drop / click-to-upload UI.
 */

import React, { useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Paperclip, Upload, Trash2, FileText, Image, Download } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../api/client';

interface Attachment {
  id: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  created_at: string;
  uploaded_by_name: string;
}

interface Props {
  entityType: 'invoice' | 'return' | 'purchase_order';
  entityId: string;
  canUpload?: boolean;
  canDelete?: boolean;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function FileIcon({ mime }: { mime: string }) {
  if (mime.startsWith('image/')) return <Image className="w-4 h-4 text-blue-500" />;
  return <FileText className="w-4 h-4 text-slate-400" />;
}

export function AttachmentPanel({ entityType, entityId, canUpload = true, canDelete = true }: Props) {
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const { data: attachments = [], isLoading } = useQuery<Attachment[]>({
    queryKey: ['attachments', entityType, entityId],
    queryFn: async () => {
      const res = await api.get(`/api/attachments/${entityType}/${entityId}`);
      return res.data;
    },
    enabled: !!entityId,
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append('file', file);
      await api.post(`/api/attachments/${entityType}/${entityId}`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['attachments', entityType, entityId] });
      toast.success('File uploaded');
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Upload failed';
      toast.error(msg);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/api/attachments/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['attachments', entityType, entityId] });
      toast.success('Attachment deleted');
    },
    onError: () => toast.error('Delete failed'),
  });

  const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    for (const file of Array.from(files)) {
      uploadMutation.mutate(file);
    }
  };

  const handleDownload = (att: Attachment) => {
    window.open(`/api/attachments/file/${att.id}`, '_blank');
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300">
        <Paperclip className="w-4 h-4" />
        Attachments
        {attachments.length > 0 && (
          <span className="ml-1 text-xs bg-slate-100 dark:bg-slate-700 rounded-full px-2 py-0.5">
            {attachments.length}
          </span>
        )}
      </div>

      {isLoading ? (
        <p className="text-xs text-slate-400">Loading…</p>
      ) : attachments.length === 0 ? (
        <p className="text-xs text-slate-400 dark:text-slate-500">No attachments</p>
      ) : (
        <ul className="space-y-1">
          {attachments.map(att => (
            <li key={att.id} className="flex items-center gap-2 text-sm bg-slate-50 dark:bg-slate-700/50 rounded-lg px-3 py-2">
              <FileIcon mime={att.mime_type} />
              <span className="flex-1 truncate text-slate-700 dark:text-slate-300" title={att.filename}>
                {att.filename}
              </span>
              <span className="text-xs text-slate-400">{formatBytes(att.size_bytes)}</span>
              <button onClick={() => handleDownload(att)} title="Download" className="p-1 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                <Download className="w-3.5 h-3.5" />
              </button>
              {canDelete && (
                <button
                  onClick={() => { if (confirm('Delete this attachment?')) deleteMutation.mutate(att.id); }}
                  title="Delete"
                  className="p-1 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {canUpload && (
        <>
          <div
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={e => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files); }}
            onClick={() => fileRef.current?.click()}
            className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors ${
              dragging
                ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/20'
                : 'border-slate-300 dark:border-slate-600 hover:border-blue-400 dark:hover:border-blue-500'
            }`}
          >
            <Upload className="w-5 h-5 mx-auto mb-1 text-slate-400" />
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Drag & drop or <span className="text-blue-600 dark:text-blue-400">click to upload</span>
            </p>
            <p className="text-xs text-slate-400 mt-0.5">PDF, image, CSV · max 20 MB</p>
          </div>
          <input
            ref={fileRef}
            type="file"
            multiple
            accept=".pdf,.jpg,.jpeg,.png,.webp,.csv,.xlsx"
            className="hidden"
            onChange={e => handleFiles(e.target.files)}
          />
        </>
      )}
    </div>
  );
}
