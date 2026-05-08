import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { Lock, ShieldCheck } from 'lucide-react';
import { api, getErrorMessage } from '../api/client';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';

interface Form {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

const ChangePassword: React.FC = () => {
  const { refreshUser, user } = useAuth();
  const navigate = useNavigate();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { register, handleSubmit, watch, formState: { errors } } = useForm<Form>();
  const newPwd = watch('newPassword', '');

  const onSubmit = async (data: Form) => {
    setIsSubmitting(true);
    try {
      await api.post('/auth/change-password', {
        currentPassword: data.currentPassword,
        newPassword: data.newPassword,
      });
      await refreshUser();
      toast.success('Password changed successfully');
      navigate('/');
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-blue-600 rounded-2xl mb-3">
            <ShieldCheck size={28} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Change Your Password</h1>
          {user?.must_change_password && (
            <p className="text-sm text-amber-600 mt-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              Your password must be changed before continuing.
            </p>
          )}
        </div>

        <div className="card p-8">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            <div>
              <label className="label">Current Password</label>
              <div className="relative">
                <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  {...register('currentPassword', { required: 'Required' })}
                  type="password"
                  className="input pl-9"
                  autoFocus
                />
              </div>
              {errors.currentPassword && <p className="mt-1 text-xs text-red-600">{errors.currentPassword.message}</p>}
            </div>

            <div>
              <label className="label">New Password</label>
              <div className="relative">
                <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  {...register('newPassword', {
                    required: 'Required',
                    minLength: { value: 8, message: 'Minimum 8 characters' },
                    pattern: {
                      value: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
                      message: 'Must contain uppercase, lowercase, and a number',
                    },
                  })}
                  type="password"
                  className="input pl-9"
                />
              </div>
              {errors.newPassword && <p className="mt-1 text-xs text-red-600">{errors.newPassword.message}</p>}
            </div>

            <div>
              <label className="label">Confirm New Password</label>
              <div className="relative">
                <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  {...register('confirmPassword', {
                    required: 'Required',
                    validate: v => v === newPwd || 'Passwords do not match',
                  })}
                  type="password"
                  className="input pl-9"
                />
              </div>
              {errors.confirmPassword && <p className="mt-1 text-xs text-red-600">{errors.confirmPassword.message}</p>}
            </div>

            <button type="submit" disabled={isSubmitting} className="btn-primary w-full justify-center py-2.5">
              {isSubmitting ? 'Changing...' : 'Change Password'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default ChangePassword;
