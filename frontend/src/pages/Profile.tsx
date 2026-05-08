import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  UserCircle, Mail, Lock, Bell, Moon, Sun,
  Save, ChevronRight, Shield, Palette, Smartphone, CheckCircle2, XCircle
} from 'lucide-react';
import { api, getErrorMessage } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useTheme, ACCENT_PRESETS } from '../context/ThemeContext';
import toast from 'react-hot-toast';

interface ProfileForm { name: string; email: string }

// ── Section wrapper ────────────────────────────────────────────────────────────
const Section: React.FC<{ title: string; icon: React.ReactNode; children: React.ReactNode }> = ({ title, icon, children }) => (
  <div className="card overflow-hidden">
    <div className="flex items-center gap-2 px-5 py-4 border-b border-slate-200 dark:border-slate-700">
      <span className="text-slate-400">{icon}</span>
      <h2 className="font-semibold text-slate-900 dark:text-slate-100">{title}</h2>
    </div>
    <div className="p-5">{children}</div>
  </div>
);

// ── Toggle row ─────────────────────────────────────────────────────────────────
const ToggleRow: React.FC<{ label: string; description: string; checked: boolean; onChange: (v: boolean) => void; icon?: React.ReactNode }> = ({
  label, description, checked, onChange, icon,
}) => (
  <div className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
    <div className="flex items-start gap-3">
      {icon && <span className="mt-0.5 text-slate-400 dark:text-slate-500">{icon}</span>}
      <div>
        <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{label}</p>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{description}</p>
      </div>
    </div>
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${checked ? 'bg-blue-600' : 'bg-slate-200 dark:bg-slate-600'}`}
      style={checked ? { backgroundColor: 'var(--accent)' } : {}}
    >
      <span className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transform transition duration-200 ease-in-out ${checked ? 'translate-x-5' : 'translate-x-0'}`} />
    </button>
  </div>
);

// ── 2FA section ───────────────────────────────────────────────────────────────
const TwoFactorSection: React.FC = () => {
  const { user, refreshUser } = useAuth();
  const [step, setStep] = useState<'idle' | 'setup' | 'disable'>('idle');
  const [qrData, setQrData] = useState<{ qr_data_url: string; secret: string } | null>(null);
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);

  const isEnabled = user?.totp_enabled;

  const startSetup = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/auth/totp/setup');
      setQrData(data);
      setStep('setup');
    } catch (err) { toast.error(getErrorMessage(err)); }
    finally { setLoading(false); }
  };

  const verifyCode = async () => {
    setLoading(true);
    try {
      await api.post('/auth/totp/verify', { code });
      toast.success('2FA enabled! Your account is now protected.');
      await refreshUser?.();
      setStep('idle'); setQrData(null); setCode('');
    } catch (err) { toast.error(getErrorMessage(err)); }
    finally { setLoading(false); }
  };

  const disableTotp = async () => {
    setLoading(true);
    try {
      await api.delete('/auth/totp/disable', { data: { code } });
      toast.success('2FA disabled');
      await refreshUser?.();
      setStep('idle'); setCode('');
    } catch (err) { toast.error(getErrorMessage(err)); }
    finally { setLoading(false); }
  };

  return (
    <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
      <div className="flex items-center justify-between p-4">
        <div className="flex items-center gap-3">
          <Smartphone size={16} className="text-slate-400" />
          <div>
            <p className="text-sm font-medium text-slate-900 dark:text-slate-100">Two-Factor Authentication</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {isEnabled ? 'Enabled — your account requires an authenticator code on login' : 'Add an authenticator app for extra security'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isEnabled
            ? <><CheckCircle2 size={16} className="text-emerald-500" />
                <button onClick={() => setStep('disable')} className="btn-secondary btn-sm text-red-600 border-red-200 hover:bg-red-50">Disable</button></>
            : <button onClick={startSetup} disabled={loading} className="btn-primary btn-sm"><Smartphone size={13} /> Enable 2FA</button>
          }
        </div>
      </div>

      {step === 'setup' && qrData && (
        <div className="border-t border-slate-200 dark:border-slate-700 p-4 space-y-4 bg-slate-50 dark:bg-slate-700/30">
          <p className="text-sm text-slate-700 dark:text-slate-300 font-medium">Scan this QR code with your authenticator app</p>
          <div className="flex gap-6 items-start">
            <img src={qrData.qr_data_url} alt="2FA QR code" className="w-40 h-40 border border-slate-200 rounded-lg bg-white p-1" />
            <div className="flex-1 space-y-2">
              <p className="text-xs text-slate-500 dark:text-slate-400">Can't scan? Enter this key manually:</p>
              <code className="block text-xs font-mono bg-slate-100 dark:bg-slate-700 px-3 py-2 rounded break-all">{qrData.secret}</code>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">Then enter the 6-digit code from your app to confirm:</p>
              <div className="flex gap-2">
                <input type="text" maxLength={6} value={code} onChange={e => setCode(e.target.value.replace(/\D/g,''))}
                  placeholder="000000" className="input w-32 text-center font-mono text-lg tracking-widest" />
                <button onClick={verifyCode} disabled={code.length !== 6 || loading} className="btn-primary">
                  {loading ? 'Verifying…' : 'Confirm'}
                </button>
                <button onClick={() => { setStep('idle'); setQrData(null); setCode(''); }} className="btn-secondary">Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {step === 'disable' && (
        <div className="border-t border-slate-200 dark:border-slate-700 p-4 space-y-3 bg-red-50 dark:bg-red-900/20">
          <p className="text-sm font-medium text-red-800 dark:text-red-300">Enter your authenticator code to disable 2FA</p>
          <div className="flex gap-2">
            <input type="text" maxLength={6} value={code} onChange={e => setCode(e.target.value.replace(/\D/g,''))}
              placeholder="000000" className="input w-32 text-center font-mono text-lg tracking-widest" />
            <button onClick={disableTotp} disabled={code.length !== 6 || loading} className="btn-danger btn-sm">
              {loading ? 'Disabling…' : 'Disable 2FA'}
            </button>
            <button onClick={() => { setStep('idle'); setCode(''); }} className="btn-secondary btn-sm">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
};

// ── Main page ──────────────────────────────────────────────────────────────────
const Profile: React.FC = () => {
  const { user, refreshUser } = useAuth();
  const { mode, toggleMode, accent, setAccent, accentPresets, notificationSound, setNotificationSound } = useTheme();
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);

  const { register, handleSubmit, formState: { errors, isDirty } } = useForm<ProfileForm>({
    defaultValues: { name: user?.name ?? '', email: user?.email ?? '' },
  });

  const saveProfile = async (data: ProfileForm) => {
    setSaving(true);
    try {
      await api.put('/auth/profile', data);
      await refreshUser?.();
      qc.invalidateQueries({ queryKey: ['auth-me'] });
      toast.success('Profile updated');
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const roleLabel: Record<string, string> = {
    admin: 'Administrator',
    doctor: 'Doctor',
    nurse: 'Nurse',
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="page-title">My Account</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
          Manage your profile, preferences, and security settings.
        </p>
      </div>

      {/* ── Profile details ─────────────────────────────────────────────── */}
      <Section title="Profile" icon={<UserCircle size={17} />}>
        <form onSubmit={handleSubmit(saveProfile)} className="space-y-4">
          {/* Avatar */}
          <div className="flex items-center gap-4 pb-4 border-b border-slate-100 dark:border-slate-700">
            <div
              className="w-14 h-14 rounded-full flex items-center justify-center text-white text-2xl font-bold flex-shrink-0"
              style={{ backgroundColor: 'var(--accent)' }}
            >
              {user?.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <p className="font-semibold text-slate-900 dark:text-slate-100">{user?.name}</p>
              <span className="inline-block mt-1 text-xs font-medium px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                {roleLabel[user?.role ?? ''] ?? user?.role}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Display name</label>
              <input
                {...register('name', { required: 'Name is required' })}
                className="input"
              />
              {errors.name && <p className="mt-1 text-xs text-red-600">{errors.name.message}</p>}
            </div>
            <div>
              <label className="label flex items-center gap-1"><Mail size={12} /> Email address</label>
              <input
                {...register('email', {
                  required: 'Email is required',
                  pattern: { value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: 'Invalid email' },
                })}
                type="email"
                className="input"
              />
              {errors.email && <p className="mt-1 text-xs text-red-600">{errors.email.message}</p>}
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving || !isDirty}
              className="btn-primary btn-sm"
            >
              <Save size={14} />
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </form>
      </Section>

      {/* ── Appearance ──────────────────────────────────────────────────── */}
      <Section title="Appearance" icon={<Palette size={17} />}>
        <div className="space-y-5">
          {/* Dark mode toggle */}
          <ToggleRow
            label="Dark mode"
            description="Switch between light and dark interface"
            checked={mode === 'dark'}
            onChange={() => toggleMode()}
            icon={mode === 'dark' ? <Moon size={16} /> : <Sun size={16} />}
          />

          {/* Accent colour */}
          <div className="pt-3 border-t border-slate-100 dark:border-slate-700">
            <p className="text-sm font-medium text-slate-900 dark:text-slate-100 mb-1">Accent colour</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
              Changes buttons, active navigation, and highlights across the app.
            </p>
            <div className="flex flex-wrap gap-2">
              {accentPresets.map(preset => (
                <button
                  key={preset.value}
                  type="button"
                  title={preset.name}
                  onClick={() => setAccent(preset.value)}
                  className={`w-8 h-8 rounded-full border-4 transition-transform hover:scale-110 ${
                    accent === preset.value ? 'border-slate-900 dark:border-white scale-110' : 'border-transparent'
                  }`}
                  style={{ backgroundColor: preset.value }}
                />
              ))}
              {/* Custom colour picker */}
              <label title="Custom colour" className="relative w-8 h-8 rounded-full border-4 border-dashed border-slate-300 dark:border-slate-600 hover:border-slate-500 cursor-pointer flex items-center justify-center overflow-hidden transition-colors">
                <span className="text-slate-400 text-xs">+</span>
                <input
                  type="color"
                  value={accent}
                  onChange={e => setAccent(e.target.value)}
                  className="absolute opacity-0 inset-0 cursor-pointer w-full h-full"
                />
              </label>
            </div>
          </div>
        </div>
      </Section>

      {/* ── Notifications ───────────────────────────────────────────────── */}
      <Section title="Notifications" icon={<Bell size={17} />}>
        <ToggleRow
          label="Notification sound"
          description="Play a chime when a new request or receipt arrives"
          checked={notificationSound}
          onChange={setNotificationSound}
          icon={<Bell size={16} />}
        />
      </Section>

      {/* ── Security ────────────────────────────────────────────────────── */}
      <Section title="Security" icon={<Shield size={17} />}>
        <div className="space-y-3">
          {/* 2FA */}
          <TwoFactorSection />

          <Link
            to="/change-password"
            className="flex items-center justify-between p-3 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors group"
          >
            <div className="flex items-center gap-3">
              <Lock size={16} className="text-slate-400" />
              <div>
                <p className="text-sm font-medium text-slate-900 dark:text-slate-100">Change password</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">Update your login password</p>
              </div>
            </div>
            <ChevronRight size={16} className="text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300" />
          </Link>

          <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-700/30 border border-slate-200 dark:border-slate-700">
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              <strong className="text-slate-700 dark:text-slate-300">Session timeout:</strong> You are automatically logged out after 30 minutes of inactivity, with a 2-minute warning.
              <br />
              <strong className="text-slate-700 dark:text-slate-300">Account lockout:</strong> Accounts lock for 15 minutes after 5 failed login attempts.
            </p>
          </div>
        </div>
      </Section>
    </div>
  );
};

export default Profile;
