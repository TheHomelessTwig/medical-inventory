import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import {
  Plus, Edit2, UserX, UserCheck, KeyRound, Users as UsersIcon,
  Shield, Stethoscope, Heart
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { api, getErrorMessage } from '../api/client';
import { User } from '../types';
import { useAuth } from '../context/AuthContext';
import Modal from '../components/Modal';
import Badge from '../components/Badge';
import ConfirmDialog from '../components/ConfirmDialog';
import LoadingSpinner from '../components/LoadingSpinner';
import toast from 'react-hot-toast';

const roleIcons: Record<string, React.ReactNode> = {
  admin: <Shield size={14} />,
  doctor: <Stethoscope size={14} />,
  nurse: <Heart size={14} />,
};
const roleColors: Record<string, 'purple' | 'blue' | 'emerald'> = {
  admin: 'purple', doctor: 'blue', nurse: 'emerald',
};

interface UserFormData {
  name: string;
  email: string;
  role: 'admin' | 'doctor' | 'nurse' | 'practice_manager' | 'receptionist' | 'locum_doctor';
  password?: string;
}

const UserForm: React.FC<{
  defaultValues?: Partial<UserFormData>;
  onSubmit: (data: UserFormData) => Promise<void>;
  isNew: boolean;
  isLoading: boolean;
}> = ({ defaultValues, onSubmit, isNew, isLoading }) => {
  const { register, handleSubmit, formState: { errors } } = useForm<UserFormData>({ defaultValues });
  return (
    <form id="user-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div>
        <label className="label">Full Name *</label>
        <input {...register('name', { required: 'Required' })} className="input" />
        {errors.name && <p className="mt-1 text-xs text-red-600">{errors.name.message}</p>}
      </div>
      <div>
        <label className="label">Email Address *</label>
        <input {...register('email', { required: 'Required', pattern: { value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: 'Invalid email' } })} type="email" className="input" disabled={!isNew} />
        {errors.email && <p className="mt-1 text-xs text-red-600">{errors.email.message}</p>}
      </div>
      <div>
        <label className="label">Role *</label>
        <select {...register('role', { required: 'Required' })} className="input">
          <option value="doctor">Doctor</option>
          <option value="nurse">Nurse</option>
          <option value="admin">Admin</option>
          <option value="practice_manager">Practice Manager</option>
          <option value="receptionist">Receptionist</option>
          <option value="locum_doctor">Locum Doctor</option>
        </select>
      </div>
      {isNew && (
        <div>
          <label className="label">Initial Password *</label>
          <input {...register('password', {
            required: isNew ? 'Required' : false,
            minLength: { value: 8, message: 'Min 8 characters' },
            pattern: { value: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, message: 'Must contain uppercase, lowercase and number' },
          })} type="password" className="input" placeholder="Min 8 chars, uppercase, lowercase, number" />
          {errors.password && <p className="mt-1 text-xs text-red-600">{String(errors.password.message)}</p>}
          <p className="text-xs text-slate-400 mt-1">User will be prompted to change this on first login.</p>
        </div>
      )}
    </form>
  );
};

const ResetPasswordModal: React.FC<{ user: User; onClose: () => void }> = ({ user, onClose }) => {
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleReset = async () => {
    if (password.length < 8) { toast.error('Password must be at least 8 characters'); return; }
    setIsLoading(true);
    try {
      await api.post(`/users/${user.id}/reset-password`, { password });
      toast.success(`Password reset for ${user.name}`);
      onClose();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal isOpen title={`Reset Password — ${user.name}`} onClose={onClose} size="sm"
      footer={
        <div className="flex justify-end gap-3">
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button onClick={handleReset} disabled={isLoading || password.length < 8} className="btn-primary">
            {isLoading ? 'Resetting...' : 'Reset Password'}
          </button>
        </div>
      }>
      <div className="space-y-3">
        <p className="text-sm text-slate-600">Enter a new temporary password for <strong>{user.name}</strong>. They will be required to change it on next login.</p>
        <input type="password" value={password} onChange={e => setPassword(e.target.value)} className="input w-full" placeholder="New temporary password" />
      </div>
    </Modal>
  );
};

const Users: React.FC = () => {
  const { user: currentUser } = useAuth();
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [resetUser, setResetUser] = useState<User | null>(null);
  const [toggleUser, setToggleUser] = useState<User | null>(null);
  const [formLoading, setFormLoading] = useState(false);

  const { data: users = [], isLoading } = useQuery<User[]>({
    queryKey: ['users'],
    queryFn: async () => (await api.get('/users')).data,
  });

  const handleCreate = async (data: UserFormData) => {
    setFormLoading(true);
    try {
      await api.post('/users', data);
      toast.success('User created');
      qc.invalidateQueries({ queryKey: ['users'] });
      setShowAdd(false);
    } catch (err) { toast.error(getErrorMessage(err)); }
    finally { setFormLoading(false); }
  };

  const handleUpdate = async (data: UserFormData) => {
    if (!editUser) return;
    setFormLoading(true);
    try {
      await api.put(`/users/${editUser.id}`, data);
      toast.success('User updated');
      qc.invalidateQueries({ queryKey: ['users'] });
      setEditUser(null);
    } catch (err) { toast.error(getErrorMessage(err)); }
    finally { setFormLoading(false); }
  };

  const toggleMutation = useMutation({
    mutationFn: (u: User) => api.put(`/users/${u.id}`, { is_active: !u.is_active }),
    onSuccess: (_, u) => {
      toast.success(`${u.name} ${u.is_active ? 'deactivated' : 'activated'}`);
      qc.invalidateQueries({ queryKey: ['users'] });
      setToggleUser(null);
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const byRole = (role: string) => users.filter(u => u.role === role);

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">User Management</h1>
          <p className="text-sm text-slate-500 mt-0.5">{users.length} user{users.length !== 1 ? 's' : ''}</p>
        </div>
        <button onClick={() => setShowAdd(true)} className="btn-primary btn-sm">
          <Plus size={14} /> Add User
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        {(['admin', 'doctor', 'nurse'] as const).map(role => (
          <div key={role} className="card p-4 flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${role === 'admin' ? 'bg-purple-100 text-purple-700' : role === 'doctor' ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'}`}>
              {roleIcons[role]}
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900">{byRole(role).length}</p>
              <p className="text-xs text-slate-500 capitalize">{role}{byRole(role).length !== 1 ? 's' : ''}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Users table */}
      <div className="card overflow-hidden">
        {isLoading ? <LoadingSpinner /> : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="table-th">User</th>
                <th className="table-th">Role</th>
                <th className="table-th">Status</th>
                <th className="table-th">Last Login</th>
                <th className="table-th">Created</th>
                <th className="table-th">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map(u => (
                <tr key={u.id} className={`hover:bg-slate-50 ${!u.is_active ? 'opacity-60' : ''}`}>
                  <td className="table-td">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-semibold text-sm flex-shrink-0">
                        {u.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-medium text-slate-900">{u.name}</p>
                        <p className="text-xs text-slate-400">{u.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="table-td">
                    <Badge color={roleColors[u.role]}>{u.role}</Badge>
                  </td>
                  <td className="table-td">
                    {u.is_active
                      ? <Badge color="emerald">Active</Badge>
                      : <Badge color="slate">Inactive</Badge>}
                    {u.must_change_password && <Badge color="yellow" className="ml-1">Pwd change</Badge>}
                  </td>
                  <td className="table-td text-sm text-slate-500">
                    {u.last_login ? format(parseISO(u.last_login), 'dd MMM yyyy, HH:mm') : '—'}
                  </td>
                  <td className="table-td text-sm text-slate-500">
                    {format(parseISO(u.created_at), 'dd MMM yyyy')}
                  </td>
                  <td className="table-td">
                    <div className="flex items-center gap-1">
                      <button onClick={() => setEditUser(u)} title="Edit" className="p-1.5 rounded text-slate-400 hover:text-blue-600 hover:bg-blue-50">
                        <Edit2 size={14} />
                      </button>
                      <button onClick={() => setResetUser(u)} title="Reset password" className="p-1.5 rounded text-slate-400 hover:text-amber-600 hover:bg-amber-50">
                        <KeyRound size={14} />
                      </button>
                      {u.id !== currentUser?.id && (
                        <button onClick={() => setToggleUser(u)} title={u.is_active ? 'Deactivate' : 'Activate'}
                          className={`p-1.5 rounded ${u.is_active ? 'text-slate-400 hover:text-red-600 hover:bg-red-50' : 'text-slate-400 hover:text-emerald-600 hover:bg-emerald-50'}`}>
                          {u.is_active ? <UserX size={14} /> : <UserCheck size={14} />}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Add modal */}
      <Modal isOpen={showAdd} onClose={() => setShowAdd(false)} title="Add New User" size="md"
        footer={<div className="flex justify-end gap-3"><button onClick={() => setShowAdd(false)} className="btn-secondary">Cancel</button><button form="user-form" type="submit" disabled={formLoading} className="btn-primary">{formLoading ? 'Creating...' : 'Create User'}</button></div>}>
        <UserForm onSubmit={handleCreate} isNew={true} isLoading={formLoading} />
      </Modal>

      {/* Edit modal */}
      {editUser && (
        <Modal isOpen onClose={() => setEditUser(null)} title={`Edit: ${editUser.name}`} size="md"
          footer={<div className="flex justify-end gap-3"><button onClick={() => setEditUser(null)} className="btn-secondary">Cancel</button><button form="user-form" type="submit" disabled={formLoading} className="btn-primary">{formLoading ? 'Saving...' : 'Save'}</button></div>}>
          <UserForm defaultValues={editUser} onSubmit={handleUpdate} isNew={false} isLoading={formLoading} />
        </Modal>
      )}

      {/* Reset password */}
      {resetUser && <ResetPasswordModal user={resetUser} onClose={() => setResetUser(null)} />}

      {/* Toggle active */}
      <ConfirmDialog
        isOpen={!!toggleUser}
        onClose={() => setToggleUser(null)}
        onConfirm={() => toggleUser && toggleMutation.mutate(toggleUser)}
        title={toggleUser?.is_active ? 'Deactivate User' : 'Activate User'}
        message={`${toggleUser?.is_active ? 'Deactivate' : 'Activate'} ${toggleUser?.name}? ${toggleUser?.is_active ? 'They will not be able to log in.' : 'They will be able to log in again.'}`}
        confirmLabel={toggleUser?.is_active ? 'Deactivate' : 'Activate'}
        danger={toggleUser?.is_active}
        isLoading={toggleMutation.isPending}
      />
    </div>
  );
};

export default Users;
