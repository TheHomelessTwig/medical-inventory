import React, { useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { Stethoscope, Eye, EyeOff, Lock, Mail } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { getErrorMessage } from '../api/client';
import toast from 'react-hot-toast';

interface LoginForm {
  email: string;
  password: string;
}

const Login: React.FC = () => {
  const { login, user, isLoading } = useAuth();
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serverError, setServerError] = useState('');

  const { register, handleSubmit, formState: { errors } } = useForm<LoginForm>();

  if (!isLoading && user) return <Navigate to="/" replace />;

  const onSubmit = async (data: LoginForm) => {
    setIsSubmitting(true);
    setServerError('');
    try {
      await login(data.email, data.password);
      toast.success('Welcome back!');
      navigate('/');
    } catch (err) {
      const msg = getErrorMessage(err);
      setServerError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-600 rounded-2xl mb-4 shadow-lg shadow-blue-500/30">
            <Stethoscope size={32} className="text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white">MedInventory</h1>
          <p className="text-slate-400 mt-2">Clinic Inventory Management</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <h2 className="text-xl font-semibold text-slate-900 mb-6">Sign in to your account</h2>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            {serverError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                {serverError}
              </div>
            )}

            {/* Email */}
            <div>
              <label className="label">Email address</label>
              <div className="relative">
                <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  {...register('email', {
                    required: 'Email is required',
                    pattern: { value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: 'Invalid email' }
                  })}
                  type="email"
                  autoComplete="email"
                  autoFocus
                  className="input pl-10"
                  placeholder="you@clinic.com"
                />
              </div>
              {errors.email && <p className="mt-1 text-xs text-red-600">{errors.email.message}</p>}
            </div>

            {/* Password */}
            <div>
              <label className="label">Password</label>
              <div className="relative">
                <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  {...register('password', { required: 'Password is required' })}
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  className="input pl-10 pr-10"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {errors.password && <p className="mt-1 text-xs text-red-600">{errors.password.message}</p>}
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="btn-primary w-full justify-center py-2.5 text-base mt-2"
            >
              {isSubmitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Signing in...
                </>
              ) : 'Sign in'}
            </button>
          </form>
        </div>

        {/* Demo credentials */}
        <div className="mt-6 p-4 bg-slate-800/50 rounded-xl border border-slate-700">
          <p className="text-slate-400 text-xs text-center mb-3 font-medium uppercase tracking-wide">Demo accounts</p>
          <div className="grid grid-cols-3 gap-2 text-xs">
            {[
              { role: 'Admin', email: 'admin@clinic.local', password: 'Admin123!' },
              { role: 'Doctor', email: 'doctor@clinic.local', password: 'Doctor123!' },
              { role: 'Nurse', email: 'nurse@clinic.local', password: 'Nurse123!' },
            ].map(({ role, email, password }) => (
              <div key={role} className="text-center">
                <div className="text-slate-300 font-medium">{role}</div>
                <div className="text-slate-500 truncate">{email}</div>
                <div className="text-slate-500">{password}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
