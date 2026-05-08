import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import {
  Tag, Truck, Plus, Edit2, Trash2, Save, X,
  Palette, Building2, Phone, Mail, MapPin,
  Server, Database, Clock, RefreshCw, Copy, Check,
  Terminal, AlertTriangle, Wifi, Paintbrush, Shield, Eye, EyeOff
} from 'lucide-react';
import { useTheme, ACCENT_PRESETS } from '../context/ThemeContext';
import { api, getErrorMessage } from '../api/client';
import { Category, Supplier } from '../types';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
import LoadingSpinner from '../components/LoadingSpinner';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';

// ─── Category colours ────────────────────────────────────────────────────────
const PRESET_COLORS = [
  '#6366f1', '#3b82f6', '#10b981', '#f59e0b', '#ef4444',
  '#8b5cf6', '#06b6d4', '#f97316', '#ec4899', '#64748b',
];

// ─── Category management ─────────────────────────────────────────────────────
interface CatForm { name: string; description?: string; color: string }

const CategorySection: React.FC = () => {
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [editCat, setEditCat] = useState<Category | null>(null);
  const [deleteCat, setDeleteCat] = useState<Category | null>(null);
  const [saving, setSaving] = useState(false);

  const { data: categories = [], isLoading } = useQuery<Category[]>({
    queryKey: ['categories'],
    queryFn: async () => (await api.get('/categories')).data,
  });

  const { register, handleSubmit, watch, setValue, reset, formState: { errors } } =
    useForm<CatForm>({ defaultValues: { color: '#6366f1' } });

  const selectedColor = watch('color');

  const openEdit = (cat: Category) => {
    setEditCat(cat);
    reset({ name: cat.name, description: cat.description || '', color: cat.color || '#6366f1' });
  };

  const openAdd = () => {
    setShowAdd(true);
    reset({ name: '', description: '', color: '#6366f1' });
  };

  const handleSave = async (data: CatForm) => {
    setSaving(true);
    try {
      if (editCat) {
        await api.put(`/categories/${editCat.id}`, data);
        toast.success('Category updated');
        setEditCat(null);
      } else {
        await api.post('/categories', data);
        toast.success('Category created');
        setShowAdd(false);
      }
      qc.invalidateQueries({ queryKey: ['categories'] });
      reset();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/categories/${id}`),
    onSuccess: () => {
      toast.success('Category deleted');
      qc.invalidateQueries({ queryKey: ['categories'] });
      setDeleteCat(null);
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const CategoryForm = () => (
    <form id="cat-form" onSubmit={handleSubmit(handleSave)} className="space-y-4">
      <div>
        <label className="label">Name *</label>
        <input {...register('name', { required: 'Required' })} className="input" autoFocus />
        {errors.name && <p className="mt-1 text-xs text-red-600">{errors.name.message}</p>}
      </div>
      <div>
        <label className="label">Description</label>
        <input {...register('description')} className="input" />
      </div>
      <div>
        <label className="label flex items-center gap-2">
          <Palette size={14} /> Colour
        </label>
        <div className="flex flex-wrap gap-2 mt-1">
          {PRESET_COLORS.map(c => (
            <button
              key={c}
              type="button"
              onClick={() => setValue('color', c)}
              className={`w-7 h-7 rounded-full border-2 transition-transform hover:scale-110 ${selectedColor === c ? 'border-slate-900 scale-110' : 'border-transparent'}`}
              style={{ background: c }}
            />
          ))}
        </div>
        <div className="flex items-center gap-2 mt-2">
          <input {...register('color')} type="color" className="w-8 h-8 rounded cursor-pointer border border-slate-300" />
          <span className="text-xs text-slate-500">Or pick custom colour</span>
        </div>
      </div>
    </form>
  );

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
        <h3 className="font-semibold text-slate-900 flex items-center gap-2">
          <Tag size={17} className="text-indigo-500" /> Categories
        </h3>
        <button onClick={openAdd} className="btn-primary btn-sm">
          <Plus size={13} /> Add
        </button>
      </div>

      {isLoading ? <LoadingSpinner size="sm" /> : (
        <div className="divide-y divide-slate-100">
          {categories.length === 0 ? (
            <p className="text-slate-400 text-sm py-8 text-center">No categories yet</p>
          ) : categories.map(cat => (
            <div key={cat.id} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50">
              <div className="w-4 h-4 rounded-full flex-shrink-0" style={{ background: cat.color || '#6366f1' }} />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-slate-900 text-sm">{cat.name}</p>
                {cat.description && <p className="text-xs text-slate-400 truncate">{cat.description}</p>}
              </div>
              <span className="text-xs text-slate-400">{cat.item_count ?? 0} items</span>
              <div className="flex gap-1">
                <button onClick={() => openEdit(cat)} className="p-1.5 rounded text-slate-400 hover:text-blue-600 hover:bg-blue-50">
                  <Edit2 size={13} />
                </button>
                <button
                  onClick={() => setDeleteCat(cat)}
                  disabled={Number(cat.item_count) > 0}
                  title={Number(cat.item_count) > 0 ? 'Remove all items from this category first' : 'Delete'}
                  className="p-1.5 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add modal */}
      <Modal isOpen={showAdd} onClose={() => setShowAdd(false)} title="New Category" size="sm"
        footer={
          <div className="flex justify-end gap-3">
            <button onClick={() => setShowAdd(false)} className="btn-secondary">Cancel</button>
            <button form="cat-form" type="submit" disabled={saving} className="btn-primary">
              {saving ? 'Saving…' : 'Create'}
            </button>
          </div>
        }>
        <CategoryForm />
      </Modal>

      {/* Edit modal */}
      {editCat && (
        <Modal isOpen onClose={() => setEditCat(null)} title={`Edit: ${editCat.name}`} size="sm"
          footer={
            <div className="flex justify-end gap-3">
              <button onClick={() => setEditCat(null)} className="btn-secondary">Cancel</button>
              <button form="cat-form" type="submit" disabled={saving} className="btn-primary">
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          }>
          <CategoryForm />
        </Modal>
      )}

      <ConfirmDialog
        isOpen={!!deleteCat}
        onClose={() => setDeleteCat(null)}
        onConfirm={() => deleteCat && deleteMutation.mutate(deleteCat.id)}
        title="Delete Category"
        message={`Delete "${deleteCat?.name}"? This cannot be undone.`}
        confirmLabel="Delete"
        danger
        isLoading={deleteMutation.isPending}
      />
    </div>
  );
};

// ─── Supplier management ─────────────────────────────────────────────────────
interface SupForm {
  name: string; contact_name?: string; email?: string;
  phone?: string; address?: string; notes?: string;
}

const SupplierSection: React.FC = () => {
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [editSup, setEditSup] = useState<Supplier | null>(null);
  const [saving, setSaving] = useState(false);

  const { data: suppliers = [], isLoading } = useQuery<Supplier[]>({
    queryKey: ['suppliers'],
    queryFn: async () => (await api.get('/suppliers')).data,
  });

  const { register, handleSubmit, reset, formState: { errors } } = useForm<SupForm>();

  const openEdit = (sup: Supplier) => {
    setEditSup(sup);
    reset({ name: sup.name, contact_name: sup.contact_name || '', email: sup.email || '', phone: sup.phone || '', address: sup.address || '', notes: sup.notes || '' });
  };

  const openAdd = () => {
    setShowAdd(true);
    reset({ name: '', contact_name: '', email: '', phone: '', address: '', notes: '' });
  };

  const handleSave = async (data: SupForm) => {
    setSaving(true);
    try {
      if (editSup) {
        await api.put(`/suppliers/${editSup.id}`, data);
        toast.success('Supplier updated');
        setEditSup(null);
      } else {
        await api.post('/suppliers', data);
        toast.success('Supplier created');
        setShowAdd(false);
      }
      qc.invalidateQueries({ queryKey: ['suppliers'] });
      reset();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const archiveMutation = useMutation({
    mutationFn: (sup: Supplier) => api.put(`/suppliers/${sup.id}`, { is_active: !sup.is_active }),
    onSuccess: (_, sup) => {
      toast.success(`${sup.name} ${sup.is_active ? 'deactivated' : 'activated'}`);
      qc.invalidateQueries({ queryKey: ['suppliers'] });
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const SupplierForm = () => (
    <form id="sup-form" onSubmit={handleSubmit(handleSave)} className="space-y-4">
      <div>
        <label className="label">Supplier Name *</label>
        <input {...register('name', { required: 'Required' })} className="input" autoFocus />
        {errors.name && <p className="mt-1 text-xs text-red-600">{errors.name.message}</p>}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Contact Name</label>
          <input {...register('contact_name')} className="input" />
        </div>
        <div>
          <label className="label flex items-center gap-1"><Phone size={12} /> Phone</label>
          <input {...register('phone')} type="tel" className="input" />
        </div>
      </div>
      <div>
        <label className="label flex items-center gap-1"><Mail size={12} /> Email</label>
        <input {...register('email')} type="email" className="input" />
      </div>
      <div>
        <label className="label flex items-center gap-1"><MapPin size={12} /> Address</label>
        <textarea {...register('address')} rows={2} className="input" />
      </div>
      <div>
        <label className="label">Notes</label>
        <textarea {...register('notes')} rows={2} className="input" />
      </div>
    </form>
  );

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
        <h3 className="font-semibold text-slate-900 flex items-center gap-2">
          <Truck size={17} className="text-blue-500" /> Suppliers
        </h3>
        <button onClick={openAdd} className="btn-primary btn-sm">
          <Plus size={13} /> Add
        </button>
      </div>

      {isLoading ? <LoadingSpinner size="sm" /> : (
        <div className="divide-y divide-slate-100">
          {suppliers.length === 0 ? (
            <p className="text-slate-400 text-sm py-8 text-center">No suppliers yet</p>
          ) : suppliers.map(sup => (
            <div key={sup.id} className={`flex items-start gap-3 px-5 py-3 hover:bg-slate-50 ${!sup.is_active ? 'opacity-50' : ''}`}>
              <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center">
                <Building2 size={16} className="text-blue-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-slate-900 text-sm">{sup.name}</p>
                <div className="flex flex-wrap gap-x-3 mt-0.5 text-xs text-slate-400">
                  {sup.contact_name && <span>{sup.contact_name}</span>}
                  {sup.phone && <span className="flex items-center gap-1"><Phone size={10} />{sup.phone}</span>}
                  {sup.email && <span className="flex items-center gap-1"><Mail size={10} />{sup.email}</span>}
                </div>
              </div>
              <div className="flex gap-1 flex-shrink-0">
                <button onClick={() => openEdit(sup)} className="p-1.5 rounded text-slate-400 hover:text-blue-600 hover:bg-blue-50">
                  <Edit2 size={13} />
                </button>
                <button
                  onClick={() => archiveMutation.mutate(sup)}
                  title={sup.is_active ? 'Deactivate' : 'Activate'}
                  className={`p-1.5 rounded text-slate-400 ${sup.is_active ? 'hover:text-red-600 hover:bg-red-50' : 'hover:text-emerald-600 hover:bg-emerald-50'}`}
                >
                  {sup.is_active ? <X size={13} /> : <Save size={13} />}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add modal */}
      <Modal isOpen={showAdd} onClose={() => setShowAdd(false)} title="New Supplier" size="md"
        footer={
          <div className="flex justify-end gap-3">
            <button onClick={() => setShowAdd(false)} className="btn-secondary">Cancel</button>
            <button form="sup-form" type="submit" disabled={saving} className="btn-primary">
              {saving ? 'Saving…' : 'Create'}
            </button>
          </div>
        }>
        <SupplierForm />
      </Modal>

      {/* Edit modal */}
      {editSup && (
        <Modal isOpen onClose={() => setEditSup(null)} title={`Edit: ${editSup.name}`} size="md"
          footer={
            <div className="flex justify-end gap-3">
              <button onClick={() => setEditSup(null)} className="btn-secondary">Cancel</button>
              <button form="sup-form" type="submit" disabled={saving} className="btn-primary">
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          }>
          <SupplierForm />
        </Modal>
      )}
    </div>
  );
};

// ─── Copy-to-clipboard button ─────────────────────────────────────────────────
const CopyButton: React.FC<{ text: string }> = ({ text }) => {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Could not copy to clipboard');
    }
  };
  return (
    <button
      onClick={handleCopy}
      title="Copy to clipboard"
      className="p-1.5 rounded text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors flex-shrink-0"
    >
      {copied ? <Check size={13} className="text-emerald-500" /> : <Copy size={13} />}
    </button>
  );
};

// ─── Code block with copy ─────────────────────────────────────────────────────
const CodeBlock: React.FC<{ code: string; label?: string }> = ({ code, label }) => (
  <div className="rounded-lg overflow-hidden border border-slate-200 text-sm">
    {label && (
      <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 border-b border-slate-200">
        <Terminal size={12} className="text-slate-400" />
        <span className="text-xs font-medium text-slate-500">{label}</span>
      </div>
    )}
    <div className="flex items-center bg-slate-800 px-3 py-2.5 gap-2">
      <code className="flex-1 text-emerald-300 font-mono text-xs whitespace-pre-wrap break-all">{code}</code>
      <CopyButton text={code} />
    </div>
  </div>
);

// ─── Format uptime ────────────────────────────────────────────────────────────
function formatUptime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h < 24) return `${h}h ${m}m`;
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h`;
}

// ─── System info panel ────────────────────────────────────────────────────────
const SystemInfo: React.FC = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const { data: health, isFetching: healthFetching } = useQuery({
    queryKey: ['health'],
    queryFn: async () => {
      const res = await fetch(`${import.meta.env.VITE_API_URL || ''}/health`);
      return res.json();
    },
    refetchInterval: 60_000,
  });

  const { data: version } = useQuery({
    queryKey: ['system-version'],
    queryFn: async () => (await api.get('/system/version')).data,
    staleTime: 5 * 60_000,
  });

  const { data: status, isLoading: statusLoading, refetch: refetchStatus } = useQuery({
    queryKey: ['system-status'],
    queryFn: async () => (await api.get('/system/status')).data,
    enabled: isAdmin,
    staleTime: 30_000,
  });

  const StatCell: React.FC<{ label: string; value: React.ReactNode; icon?: React.ReactNode }> = ({ label, value, icon }) => (
    <div className="flex flex-col gap-0.5">
      <p className="text-xs text-slate-500 uppercase tracking-wide flex items-center gap-1">
        {icon}{label}
      </p>
      <p className="font-medium text-slate-900 text-sm">{value}</p>
    </div>
  );

  return (
    <div className="card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-slate-900 flex items-center gap-2">
          <Server size={16} className="text-indigo-500" /> System Information
        </h3>
        <div className="flex items-center gap-1.5">
          <span className={`inline-block w-2 h-2 rounded-full ${health ? 'bg-emerald-500' : 'bg-red-500'}`} />
          <span className={`text-xs font-medium ${health ? 'text-emerald-600' : 'text-red-600'}`}>
            {health ? 'Online' : 'Offline'}
          </span>
          {healthFetching && <RefreshCw size={11} className="text-slate-400 animate-spin ml-1" />}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <StatCell
          label="Version"
          value={version ? `v${version.version}` : '—'}
          icon={<Wifi size={11} />}
        />
        <StatCell
          label="Backend"
          value={health ? '✓ Running' : '✗ Not responding'}
          icon={<Server size={11} />}
        />
        {health?.timestamp && (
          <StatCell
            label="Server time"
            value={new Date(health.timestamp).toLocaleTimeString()}
            icon={<Clock size={11} />}
          />
        )}
        {version?.description && (
          <div className="col-span-2 sm:col-span-3">
            <p className="text-xs text-slate-500 uppercase tracking-wide mb-0.5">Release notes</p>
            <p className="text-sm text-slate-700">{version.description}</p>
          </div>
        )}
      </div>

      {/* Admin-only: detailed status */}
      {isAdmin && (
        <div className="border-t border-slate-100 pt-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
              Infrastructure (admin)
            </p>
            <button
              onClick={() => refetchStatus()}
              disabled={statusLoading}
              className="p-1 rounded text-slate-400 hover:text-indigo-600 hover:bg-indigo-50"
              title="Refresh"
            >
              <RefreshCw size={12} className={statusLoading ? 'animate-spin' : ''} />
            </button>
          </div>
          {statusLoading ? (
            <LoadingSpinner size="sm" />
          ) : status ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <StatCell
                label="Uptime"
                value={formatUptime(status.uptime_seconds)}
                icon={<Clock size={11} />}
              />
              <StatCell
                label="Database size"
                value={status.db_size ?? '—'}
                icon={<Database size={11} />}
              />
              <StatCell
                label="Tables"
                value={status.table_count ?? '—'}
                icon={<Database size={11} />}
              />
              <StatCell
                label="Users"
                value={
                  status.users
                    ? `${status.users.active ?? status.users} active`
                    : '—'
                }
                icon={<Server size={11} />}
              />
            </div>
          ) : (
            <p className="text-xs text-slate-400">Could not load infrastructure details.</p>
          )}
        </div>
      )}

      <div className="pt-3 border-t border-slate-100">
        <p className="text-xs text-slate-400">
          All software is free and open-source. No external services or paid APIs are used.
          Data is stored entirely on your local infrastructure.
        </p>
      </div>
    </div>
  );
};

// ─── Update guide (admin-only) ────────────────────────────────────────────────
const UpdateGuide: React.FC = () => {
  const [expanded, setExpanded] = useState(false);

  const windowsCmd = `cd C:\\MedInventory\npowershell -ExecutionPolicy Bypass -File update.ps1`;
  const windowsCmdNoGit = `powershell -ExecutionPolicy Bypass -File update.ps1 -SkipGitPull`;
  const linuxCmd = `cd /opt/medinv && bash update.sh`;
  const dockerLogsCmd = `docker compose logs -f`;

  return (
    <div className="card overflow-hidden">
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50 transition-colors"
      >
        <span className="font-semibold text-slate-900 flex items-center gap-2">
          <RefreshCw size={16} className="text-indigo-500" /> Remote Update Guide
        </span>
        <span className="text-xs text-slate-400">{expanded ? '▲ Collapse' : '▼ Expand'}</span>
      </button>

      {expanded && (
        <div className="px-5 pb-5 space-y-5 border-t border-slate-100">
          <p className="text-sm text-slate-600 mt-4">
            Run the update script directly on the server (via RDP, SSH, or any remote terminal).
            The script backs up the database, pulls the latest code, rebuilds containers, and
            verifies the app is healthy — all without manual steps.
          </p>

          {/* What the update does */}
          <div className="rounded-lg bg-indigo-50 border border-indigo-100 p-4 text-sm text-indigo-800 space-y-1">
            <p className="font-semibold text-indigo-900 mb-2">What the update script does:</p>
            <ol className="list-decimal list-inside space-y-1">
              <li>Creates a pre-update database backup (saved to <code className="bg-indigo-100 px-1 rounded">backups/</code>)</li>
              <li>Pulls the latest code from git (if available)</li>
              <li>Rebuilds Docker containers with the new version</li>
              <li>Restarts services with zero-downtime rolling restart</li>
              <li>Waits up to 60 seconds for the health check to pass</li>
            </ol>
          </div>

          {/* Windows */}
          <div>
            <p className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
              <Terminal size={14} className="text-blue-500" /> Windows (PowerShell / RDP)
            </p>
            <div className="space-y-2">
              <CodeBlock label="Run from the install directory (default C:\MedInventory)" code={windowsCmd} />
              <p className="text-xs text-slate-500 pl-1">
                If files were manually copied instead of using git:
              </p>
              <CodeBlock label="Skip git pull (manual file copy)" code={windowsCmdNoGit} />
            </div>
          </div>

          {/* Linux / macOS */}
          <div>
            <p className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
              <Terminal size={14} className="text-emerald-500" /> Linux / macOS (SSH)
            </p>
            <CodeBlock label="Run from the install directory" code={linuxCmd} />
          </div>

          {/* Troubleshooting */}
          <div>
            <p className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
              <AlertTriangle size={14} className="text-amber-500" /> If something goes wrong
            </p>
            <div className="space-y-2">
              <CodeBlock label="View live container logs" code={dockerLogsCmd} />
              <p className="text-xs text-slate-500 leading-relaxed">
                Pre-update backups are stored in the <code className="bg-slate-100 px-1 rounded">backups/</code> folder
                as <code className="bg-slate-100 px-1 rounded">.sql.gz</code> files.
                To restore: <code className="bg-slate-100 px-1 rounded">gunzip -c backups/pre_update_YYYYMMDD_HHMM.sql.gz | docker exec -i medinv_postgres psql -U medinv medical_inventory</code>
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Clinic-wide theme picker (admin only) ────────────────────────────────────
const ClinicTheme: React.FC = () => {
  const { accent, setAccent, accentPresets, mode, toggleMode } = useTheme();

  return (
    <div className="card p-5 space-y-4">
      <h3 className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
        <Paintbrush size={16} className="text-indigo-500" /> Clinic Theme
      </h3>
      <p className="text-xs text-slate-500 dark:text-slate-400">
        Set the accent colour for the whole app. This is stored per-device; each user can also change it on their profile page.
      </p>

      <div>
        <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Accent colour</p>
        <div className="flex flex-wrap gap-2 items-center">
          {ACCENT_PRESETS.map(preset => (
            <button
              key={preset.value}
              type="button"
              title={preset.name}
              onClick={() => setAccent(preset.value)}
              className={`w-9 h-9 rounded-full border-4 transition-transform hover:scale-110 ${
                accent === preset.value
                  ? 'border-slate-900 dark:border-white scale-110'
                  : 'border-transparent'
              }`}
              style={{ backgroundColor: preset.value }}
            />
          ))}
          <label title="Custom colour" className="relative w-9 h-9 rounded-full border-4 border-dashed border-slate-300 dark:border-slate-600 hover:border-slate-500 cursor-pointer flex items-center justify-center overflow-hidden transition-colors">
            <span className="text-slate-400 dark:text-slate-500 text-sm font-bold">+</span>
            <input
              type="color"
              value={accent}
              onChange={e => setAccent(e.target.value)}
              className="absolute opacity-0 inset-0 cursor-pointer w-full h-full"
            />
          </label>
          <span className="text-xs text-slate-400 dark:text-slate-500 ml-1">Current: {accent}</span>
        </div>
      </div>

      <div className="pt-3 border-t border-slate-100 dark:border-slate-700 flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Interface mode</p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Currently <span className="font-medium">{mode}</span> mode
          </p>
        </div>
        <button
          onClick={toggleMode}
          className="btn-secondary btn-sm"
        >
          Switch to {mode === 'dark' ? 'light' : 'dark'} mode
        </button>
      </div>
    </div>
  );
};

// ─── Branding section ─────────────────────────────────────────────────────────
const BrandingSection: React.FC = () => {
  const qc = useQueryClient();
  const { register, handleSubmit, reset, formState: { isDirty } } = useForm<{ practice_name: string; practice_tagline: string }>();
  const [saving, setSaving] = useState(false);

  const { data: branding, isLoading } = useQuery<{ practice_name: string; practice_tagline: string }>({
    queryKey: ['branding'],
    queryFn: async () => (await api.get('/system/branding')).data,
    staleTime: 60_000,
  });

  // Pre-fill form once data arrives
  React.useEffect(() => {
    if (branding) reset(branding);
  }, [branding, reset]);

  const handleSave = async (data: { practice_name: string; practice_tagline: string }) => {
    setSaving(true);
    try {
      await api.put('/system/branding', data);
      qc.invalidateQueries({ queryKey: ['branding'] });
      toast.success('Branding updated');
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) return null;

  return (
    <div className="card overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-700">
        <h3 className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
          <Paintbrush size={16} className="text-slate-400" />
          Branding
        </h3>
        <p className="text-xs text-slate-500 mt-0.5">
          Customise the name shown on the login screen and in the sidebar.
        </p>
      </div>
      <form onSubmit={handleSubmit(handleSave)} className="p-5 space-y-4">
        <div>
          <label className="label">Display name</label>
          <input
            {...register('practice_name', { required: true })}
            className="input"
            placeholder="e.g. City Medical Inventory"
          />
          <p className="text-xs text-slate-400 mt-1">Shown large on the login screen and in the sidebar header.</p>
        </div>
        <div>
          <label className="label">Tagline <span className="text-slate-400 font-normal">(optional)</span></label>
          <input
            {...register('practice_tagline')}
            className="input"
            placeholder="e.g. City Medical Practice"
          />
          <p className="text-xs text-slate-400 mt-1">Smaller subtitle shown below the display name. Leave blank to hide.</p>
        </div>
        <div className="flex items-center justify-between pt-1">
          <p className="text-xs text-slate-400">
            Changes take effect immediately — no restart required.
          </p>
          <button
            type="submit"
            disabled={saving || !isDirty}
            className="btn-primary flex items-center gap-2 text-sm"
          >
            <Save size={14} />
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </div>
  );
};

// ─── Admin Settings (email, security, backup, timezone) ──────────────────────
interface AdminSettings {
  smtp_host: string | null;
  smtp_port: number;
  smtp_secure: boolean;
  smtp_user: string | null;
  smtp_pass: string | null;
  smtp_from: string;
  app_url: string;
  session_timeout_minutes: number;
  max_login_attempts: number;
  lockout_minutes: number;
  report_timezone: string;
  backup_enabled: boolean;
  backup_schedule: 'daily' | 'weekly';
  backup_retain_days: number;
  backup_dir: string;
}

const AdminSettingsSection: React.FC = () => {
  const qc = useQueryClient();
  const [testingEmail, setTestingEmail] = useState(false);
  const [testEmailResult, setTestEmailResult] = useState<{ ok: boolean; error?: string } | null>(null);
  const [runningBackup, setRunningBackup] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const { register, handleSubmit, reset, watch, formState: { isDirty } } = useForm<AdminSettings>();

  const { data: settings, isLoading } = useQuery<AdminSettings>({
    queryKey: ['admin-settings'],
    queryFn: async () => (await api.get('/admin-settings')).data,
  });

  React.useEffect(() => { if (settings) reset(settings); }, [settings, reset]);

  const saveMutation = useMutation({
    mutationFn: (data: AdminSettings) => api.put('/admin-settings', data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-settings'] }); toast.success('Settings saved'); },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });

  const handleTestEmail = async () => {
    setTestingEmail(true); setTestEmailResult(null);
    try {
      const res = await api.post('/admin-settings/test-email', {});
      setTestEmailResult(res.data);
    } catch (e) {
      setTestEmailResult({ ok: false, error: getErrorMessage(e) });
    } finally { setTestingEmail(false); }
  };

  const handleBackupNow = async () => {
    setRunningBackup(true);
    try {
      const res = await api.post('/admin-settings/backup-now', {});
      toast.success(`Backup created: ${(res.data as { file: string }).file}`);
    } catch (e) {
      toast.error(`Backup failed: ${getErrorMessage(e)}`);
    } finally { setRunningBackup(false); }
  };

  if (isLoading) return null;

  const backupEnabled = watch('backup_enabled');

  const SectionCard: React.FC<{ title: string; icon: React.ReactNode; children: React.ReactNode }> = ({ title, icon, children }) => (
    <div className="card overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-700 flex items-center gap-2">
        <span className="text-slate-400">{icon}</span>
        <h3 className="font-semibold text-slate-900 dark:text-slate-100 text-sm">{title}</h3>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );

  return (
    <form onSubmit={handleSubmit(d => saveMutation.mutate(d))} className="space-y-4">
      {/* Email / SMTP */}
      <SectionCard title="Email (SMTP)" icon={<Mail size={15} />}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className="label">SMTP Host <span className="font-normal text-slate-400">(leave blank to disable email)</span></label>
            <input {...register('smtp_host')} className="input" placeholder="smtp.gmail.com" />
          </div>
          <div>
            <label className="label">Port</label>
            <input type="number" {...register('smtp_port', { valueAsNumber: true })} className="input" placeholder="587" />
          </div>
          <div className="flex items-center gap-2 mt-5">
            <input type="checkbox" id="smtp_secure" {...register('smtp_secure')} className="rounded" />
            <label htmlFor="smtp_secure" className="text-sm text-slate-700 dark:text-slate-300">TLS/SSL (port 465)</label>
          </div>
          <div>
            <label className="label">Username</label>
            <input {...register('smtp_user')} className="input" placeholder="your@email.com" />
          </div>
          <div>
            <label className="label">Password</label>
            <div className="relative">
              <input
                {...register('smtp_pass')}
                type={showPass ? 'text' : 'password'}
                className="input pr-10"
                placeholder="App password or SMTP password"
              />
              <button type="button" onClick={() => setShowPass(p => !p)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                {showPass ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>
          <div>
            <label className="label">From Address</label>
            <input {...register('smtp_from')} className="input" placeholder="S.H.I.T. <noreply@clinic.com>" />
          </div>
          <div>
            <label className="label">App URL <span className="font-normal text-slate-400">(used in email links)</span></label>
            <input {...register('app_url')} className="input" placeholder="http://192.168.1.100:3000" />
          </div>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <button type="button" onClick={handleTestEmail} disabled={testingEmail} className="btn-secondary text-sm flex items-center gap-1.5">
            <Mail size={13} />{testingEmail ? 'Sending…' : 'Send Test Email'}
          </button>
          {testEmailResult && (
            <span className={`text-sm ${testEmailResult.ok ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
              {testEmailResult.ok ? '✓ Email sent successfully' : `✗ ${testEmailResult.error}`}
            </span>
          )}
        </div>
      </SectionCard>

      {/* Security */}
      <SectionCard title="Security" icon={<Shield size={15} />}>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="label">Session timeout <span className="font-normal text-slate-400">(minutes)</span></label>
            <input type="number" min="5" max="480" {...register('session_timeout_minutes', { valueAsNumber: true })} className="input" />
          </div>
          <div>
            <label className="label">Max login attempts</label>
            <input type="number" min="1" max="20" {...register('max_login_attempts', { valueAsNumber: true })} className="input" />
          </div>
          <div>
            <label className="label">Lockout duration <span className="font-normal text-slate-400">(minutes)</span></label>
            <input type="number" min="1" max="60" {...register('lockout_minutes', { valueAsNumber: true })} className="input" />
          </div>
        </div>
      </SectionCard>

      {/* Scheduled jobs timezone */}
      <SectionCard title="Timezone" icon={<Clock size={15} />}>
        <div className="max-w-xs">
          <label className="label">IANA timezone for all scheduled jobs</label>
          <input {...register('report_timezone')} className="input" placeholder="Australia/Sydney" />
          <p className="text-xs text-slate-400 mt-1">
            Examples: <code>UTC</code>, <code>Australia/Sydney</code>, <code>America/New_York</code>, <code>Europe/London</code>
          </p>
        </div>
      </SectionCard>

      {/* Backup */}
      <SectionCard title="Automatic Database Backup" icon={<Database size={15} />}>
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <input type="checkbox" id="backup_enabled" {...register('backup_enabled')} className="rounded" />
            <label htmlFor="backup_enabled" className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Enable automatic backups
            </label>
          </div>
          {backupEnabled && (
            <div className="grid grid-cols-2 gap-4 pl-6">
              <div>
                <label className="label">Schedule</label>
                <select {...register('backup_schedule')} className="input">
                  <option value="daily">Daily (2:00 AM)</option>
                  <option value="weekly">Weekly (Sunday 2:00 AM)</option>
                </select>
              </div>
              <div>
                <label className="label">Keep backups for <span className="font-normal text-slate-400">(days)</span></label>
                <input type="number" min="1" max="3650" {...register('backup_retain_days', { valueAsNumber: true })} className="input" />
              </div>
              <div className="col-span-2">
                <label className="label">Backup directory</label>
                <input {...register('backup_dir')} className="input" placeholder="/opt/medinv/backups" />
                <p className="text-xs text-slate-400 mt-1">
                  Linux/macOS: absolute path on the server. Windows: configure via Task Scheduler (see Deployment Guide).
                </p>
              </div>
            </div>
          )}
          <div className="flex items-center gap-3 pt-1">
            <button type="button" onClick={handleBackupNow} disabled={runningBackup} className="btn-secondary text-sm flex items-center gap-1.5">
              <Database size={13} />{runningBackup ? 'Backing up…' : 'Run Backup Now'}
            </button>
            <span className="text-xs text-slate-400">Creates a compressed pg_dump immediately.</span>
          </div>
        </div>
      </SectionCard>

      {/* Save bar */}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={() => reset(settings ?? undefined)} disabled={!isDirty} className="btn-secondary text-sm">
          Reset
        </button>
        <button type="submit" disabled={saveMutation.isPending || !isDirty} className="btn-primary text-sm flex items-center gap-2">
          <Save size={13} />{saveMutation.isPending ? 'Saving…' : 'Save all changes'}
        </button>
      </div>
    </form>
  );
};

// ─── Main Settings page ───────────────────────────────────────────────────────
const Settings: React.FC = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="page-title">Settings</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Manage categories, suppliers, and system configuration.
        </p>
      </div>

      <SystemInfo />

      {isAdmin && <AdminSettingsSection />}
      {isAdmin && <BrandingSection />}
      {isAdmin && <UpdateGuide />}
      {isAdmin && <ClinicTheme />}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <CategorySection />
        <SupplierSection />
      </div>

      {/* Security settings reminder */}
      <div className="card p-5 bg-amber-50 border-amber-200">
        <h3 className="font-semibold text-amber-900 mb-2">Security Reminders</h3>
        <ul className="text-sm text-amber-800 space-y-1.5 list-disc list-inside">
          <li>Change all default passwords immediately after deployment</li>
          <li>Rotate JWT secrets in <code className="bg-amber-100 px-1 rounded">.env</code> before going to production</li>
          <li>Set up automated PostgreSQL backups on a regular schedule</li>
          <li>Use HTTPS (TLS) in production — configure a reverse proxy like nginx</li>
          <li>Review the audit log regularly for unexpected activity</li>
        </ul>
      </div>
    </div>
  );
};

export default Settings;
