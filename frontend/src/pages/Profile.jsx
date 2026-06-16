import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import apiClient from '../api/client';
import { getNotificationPrefs, setNotificationPrefs } from '../lib/notificationPrefs';
import {
  ArrowLeft, Camera, Save, Key, User, Mail, FileText,
  Loader2, CheckCircle, AlertCircle, Eye, EyeOff, Bell, ShieldCheck, ShieldOff, Copy, KeyRound
} from 'lucide-react';

const i18n = {
  en: {
    title: 'Profile & Security',
    sub: 'Manage your personal information and account security',
    avatarHint: 'JPG, PNG or GIF · max 5 MB',
    uploadBtn: 'Upload photo',
    sectionProfile: 'Personal information',
    firstName: 'First name',
    lastName: 'Last name',
    email: 'Email address',
    emailOAuth: 'Email is managed by your OAuth provider',
    bio: 'Bio',
    bioPlaceholder: 'A short description about yourself…',
    save: 'Save changes',
    saving: 'Saving…',
    saved: 'Saved',
    sectionSecurity: 'Change password',
    currentPass: 'Current password',
    newPass: 'New password',
    newPassHint: 'Minimum 8 characters',
    confirmPass: 'Confirm new password',
    changePass: 'Change password',
    passMismatch: 'Passwords do not match',
    passMin: 'Minimum 8 characters',
    passChanged: 'Password changed',
    noPassword: 'Your account uses OAuth login. You can set a password to also enable email sign-in.',
    setPass: 'Set password',
    role: { admin: 'Admin', operator: 'Operator' },
    sectionNotif: 'Notifications',
    notifSub: 'Alerts for new incoming messages (saved in this browser)',
    notifEnabled: 'Enable notifications',
    notifSound: 'Sound',
    notifDesktop: 'Desktop push',
    notifTab: 'Tab counter',
    notifToast: 'In-app toast',
    notifBlocked: 'Desktop notifications are blocked in your browser settings.',
  },
};

function Toggle({ checked, onChange, disabled }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:opacity-40 ${
        checked ? 'bg-platform-accent' : 'bg-platform-border'
      }`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
          checked ? 'translate-x-[18px]' : 'translate-x-[3px]'
        }`}
      />
    </button>
  );
}

function Alert({ type, children }) {
  const isErr = type === 'error';
  return (
    <div className={`flex items-center gap-2 px-3 py-2.5 rounded-[8px] text-xs border ${
      isErr
        ? 'bg-red-500/8 border-red-500/25 text-red-400'
        : 'bg-green-500/8 border-green-500/25 text-green-400'
    }`}>
      {isErr ? <AlertCircle size={14} /> : <CheckCircle size={14} />}
      <span>{children}</span>
    </div>
  );
}

export default function Profile() {
  const navigate = useNavigate();
  const { user, updateUser } = useAuthStore();
  const t = i18n.en;
  const avatarInputRef = useRef(null);

  // Profile form
  const [form, setForm] = useState({
    name:      user?.name      || '',
    lastName:  user?.lastName  || '',
    email:     user?.email     || '',
    bio:       user?.bio       || '',
    avatarUrl: user?.avatarUrl || '',
  });
  const [profileStatus, setProfileStatus] = useState(null); // null | 'saving' | 'saved' | {error}
  const [avatarUploading, setAvatarUploading] = useState(false);

  // Password form
  const [passForm, setPassForm] = useState({ current: '', next: '', confirm: '' });
  const [passStatus, setPassStatus] = useState(null);
  const [showPass, setShowPass] = useState({ current: false, next: false, confirm: false });

  const isOAuth = !!user?.oauthProvider;
  const hasPassword = !!user?.hasPassword;

  // ── Two-factor auth (TOTP) ──────────────────────────────────
  const [twofaEnabled, setTwofaEnabled] = useState(!!user?.twofaEnabled);
  const [twofaSetup, setTwofaSetup] = useState(null); // { qr, secret }
  const [twofaCode, setTwofaCode] = useState('');
  const [twofaBusy, setTwofaBusy] = useState(false);
  const [twofaErr, setTwofaErr] = useState(null);
  const [disarm, setDisarm] = useState(false); // showing disable code input
  const [recoveryCodes, setRecoveryCodes] = useState(null); // shown once after enable/regen
  const [regen, setRegen] = useState(false); // showing regenerate code input
  const recoveryRemaining = user?.recoveryRemaining ?? 0;

  const copyRecovery = () => {
    if (recoveryCodes) navigator.clipboard.writeText(recoveryCodes.join('\n'));
  };

  const startTwofaSetup = async () => {
    setTwofaBusy(true); setTwofaErr(null);
    try {
      const res = await apiClient.post('/auth/2fa/setup');
      setTwofaSetup({ qr: res.data.qr, secret: res.data.secret });
      setTwofaCode('');
    } catch (err) {
      setTwofaErr(err.response?.data?.error || 'Не удалось начать настройку');
    } finally { setTwofaBusy(false); }
  };

  const confirmTwofa = async () => {
    setTwofaBusy(true); setTwofaErr(null);
    try {
      const res = await apiClient.post('/auth/2fa/enable', { code: twofaCode });
      setTwofaEnabled(true); setTwofaSetup(null); setTwofaCode('');
      setRecoveryCodes(res.data.recovery_codes || []);
      updateUser({ ...user, twofaEnabled: true, recoveryRemaining: (res.data.recovery_codes || []).length });
    } catch (err) {
      setTwofaErr(err.response?.data?.error || 'Неверный код');
    } finally { setTwofaBusy(false); }
  };

  const regenerateRecovery = async () => {
    setTwofaBusy(true); setTwofaErr(null);
    try {
      const res = await apiClient.post('/auth/2fa/recovery/regenerate', { code: twofaCode });
      setRecoveryCodes(res.data.recovery_codes || []);
      setRegen(false); setTwofaCode('');
      updateUser({ ...user, recoveryRemaining: (res.data.recovery_codes || []).length });
    } catch (err) {
      setTwofaErr(err.response?.data?.error || 'Неверный код');
    } finally { setTwofaBusy(false); }
  };

  const disableTwofa = async () => {
    setTwofaBusy(true); setTwofaErr(null);
    try {
      await apiClient.post('/auth/2fa/disable', { code: twofaCode });
      setTwofaEnabled(false); setDisarm(false); setTwofaCode('');
      updateUser({ ...user, twofaEnabled: false });
    } catch (err) {
      setTwofaErr(err.response?.data?.error || 'Неверный код');
    } finally { setTwofaBusy(false); }
  };

  // Notification preferences (per-browser, localStorage)
  const [notif, setNotif] = useState(getNotificationPrefs());
  const desktopBlocked = typeof Notification !== 'undefined' && Notification.permission === 'denied';

  const updateNotif = (patch) => {
    const next = { ...notif, ...patch };
    // Turning desktop push on prompts for browser permission.
    if (patch.desktop && typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }
    setNotif(next);
    setNotificationPrefs(next);
  };

  const handleAvatarClick = () => avatarInputRef.current?.click();

  const handleAvatarFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setProfileStatus({ error: 'File too large (max 5 MB)' });
      return;
    }
    setAvatarUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await apiClient.post('/media/upload', fd, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      const url = res.data.url;
      setForm(p => ({ ...p, avatarUrl: url }));
    } catch {
      setProfileStatus({ error: 'Upload failed' });
    } finally {
      setAvatarUploading(false);
      e.target.value = '';
    }
  };

  const handleProfileSave = async (e) => {
    e.preventDefault();
    setProfileStatus('saving');
    try {
      const payload = {
        name:      form.name,
        lastName:  form.lastName,
        bio:       form.bio,
        avatarUrl: form.avatarUrl,
      };
      if (!isOAuth) payload.email = form.email;

      const res = await apiClient.put('/auth/profile', payload);
      updateUser(res.data.user);
      setProfileStatus('saved');
      setTimeout(() => setProfileStatus(null), 2500);
    } catch (err) {
      setProfileStatus({ error: err.response?.data?.error || 'Save failed' });
    }
  };

  const handlePassChange = async (e) => {
    e.preventDefault();
    if (passForm.next.length < 8) { setPassStatus({ error: t.passMin }); return; }
    if (passForm.next !== passForm.confirm) { setPassStatus({ error: t.passMismatch }); return; }
    setPassStatus('saving');
    try {
      await apiClient.post('/auth/change-password', {
        currentPassword: hasPassword ? passForm.current : undefined,
        newPassword: passForm.next,
      });
      updateUser({ hasPassword: true });
      setPassForm({ current: '', next: '', confirm: '' });
      setPassStatus('saved');
      setTimeout(() => setPassStatus(null), 2500);
    } catch (err) {
      setPassStatus({ error: err.response?.data?.error || 'Error' });
    }
  };

  const initials = (user?.name || 'U').charAt(0).toUpperCase();

  return (
    <div className="flex-1 overflow-y-auto bg-platform-bg p-6">
      {/* Header */}
      <div className="flex items-center gap-3.5 mb-8">
        <button
          onClick={() => navigate('/app/settings')}
          className="p-2 bg-platform-surface hover:bg-platform-surface-raised border border-platform-border rounded-button text-platform-text-secondary hover:text-platform-accent transition-all active:scale-95"
        >
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-platform-text-primary">{t.title}</h1>
          <p className="text-sm text-platform-text-secondary mt-0.5">{t.sub}</p>
        </div>
      </div>

      <div className="max-w-2xl space-y-6">
        {/* ── Profile card ─────────────────────────────────── */}
        <form onSubmit={handleProfileSave} className="bg-platform-surface border border-platform-border rounded-[12px] p-6 space-y-6">
          <h2 className="text-sm font-bold text-platform-text-primary flex items-center gap-2">
            <User size={16} className="text-platform-accent" />
            {t.sectionProfile}
          </h2>

          {/* Avatar row */}
          <div className="flex items-center gap-5">
            <div className="relative shrink-0">
              {form.avatarUrl ? (
                <img
                  src={form.avatarUrl}
                  alt="avatar"
                  className="w-20 h-20 rounded-full object-cover border-2 border-platform-border"
                />
              ) : (
                <div className="w-20 h-20 rounded-full bg-platform-border flex items-center justify-center text-platform-accent text-3xl font-bold border-2 border-platform-border/40">
                  {initials}
                </div>
              )}
              <button
                type="button"
                onClick={handleAvatarClick}
                disabled={avatarUploading}
                className="absolute bottom-0 right-0 w-7 h-7 bg-platform-accent text-white rounded-full flex items-center justify-center border-2 border-platform-bg hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {avatarUploading ? <Loader2 size={13} className="animate-spin" /> : <Camera size={13} />}
              </button>
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleAvatarFile}
              />
            </div>
            <div>
              <button
                type="button"
                onClick={handleAvatarClick}
                disabled={avatarUploading}
                className="px-3 py-1.5 text-xs font-medium bg-platform-surface-raised border border-platform-border rounded-button text-platform-text-primary hover:border-platform-accent hover:text-platform-accent transition-colors"
              >
                {t.uploadBtn}
              </button>
              <p className="text-[11px] text-platform-text-muted mt-1.5">{t.avatarHint}</p>
              <span className="mt-1.5 inline-block text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-platform-bg border border-platform-border text-platform-text-secondary">
                {t.role[user?.role] || user?.role}
              </span>
            </div>
          </div>

          {/* Name row */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="block text-[11px] font-semibold uppercase tracking-wide text-platform-text-muted">
                {t.firstName}
              </label>
              <input
                type="text"
                value={form.name}
                onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                required
                className="w-full h-9 px-3 bg-platform-bg border border-platform-border rounded-input text-sm text-platform-text-primary placeholder-platform-text-muted focus:outline-none focus:border-platform-accent transition-colors"
              />
            </div>
            <div className="space-y-1.5">
              <label className="block text-[11px] font-semibold uppercase tracking-wide text-platform-text-muted">
                {t.lastName}
              </label>
              <input
                type="text"
                value={form.lastName}
                onChange={e => setForm(p => ({ ...p, lastName: e.target.value }))}
                className="w-full h-9 px-3 bg-platform-bg border border-platform-border rounded-input text-sm text-platform-text-primary placeholder-platform-text-muted focus:outline-none focus:border-platform-accent transition-colors"
              />
            </div>
          </div>

          {/* Email */}
          <div className="space-y-1.5">
            <label className="block text-[11px] font-semibold uppercase tracking-wide text-platform-text-muted">
              {t.email}
            </label>
            {isOAuth ? (
              <div className="flex items-center gap-2 h-9 px-3 bg-platform-bg/50 border border-platform-border/50 rounded-input opacity-60">
                <Mail size={14} className="text-platform-text-muted shrink-0" />
                <span className="text-sm text-platform-text-secondary truncate">{form.email || '—'}</span>
              </div>
            ) : (
              <div className="relative">
                <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-platform-text-muted pointer-events-none" />
                <input
                  type="email"
                  value={form.email}
                  onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                  className="w-full h-9 pl-8 pr-3 bg-platform-bg border border-platform-border rounded-input text-sm text-platform-text-primary placeholder-platform-text-muted focus:outline-none focus:border-platform-accent transition-colors"
                />
              </div>
            )}
            {isOAuth && (
              <p className="text-[11px] text-platform-text-muted">{t.emailOAuth}</p>
            )}
          </div>

          {/* Bio */}
          <div className="space-y-1.5">
            <label className="block text-[11px] font-semibold uppercase tracking-wide text-platform-text-muted">
              {t.bio}
            </label>
            <div className="relative">
              <FileText size={14} className="absolute left-3 top-2.5 text-platform-text-muted pointer-events-none" />
              <textarea
                rows={3}
                value={form.bio}
                onChange={e => setForm(p => ({ ...p, bio: e.target.value }))}
                placeholder={t.bioPlaceholder}
                className="w-full pl-8 pr-3 py-2 bg-platform-bg border border-platform-border rounded-input text-sm text-platform-text-primary placeholder-platform-text-muted focus:outline-none focus:border-platform-accent transition-colors resize-none"
              />
            </div>
          </div>

          {profileStatus && typeof profileStatus === 'object' && (
            <Alert type="error">{profileStatus.error}</Alert>
          )}
          {profileStatus === 'saved' && (
            <Alert type="success">{t.saved}</Alert>
          )}

          <button
            type="submit"
            disabled={profileStatus === 'saving'}
            className="flex items-center gap-2 px-4 py-2 bg-platform-accent hover:bg-platform-accent-hover text-white text-sm font-semibold rounded-button transition-all disabled:opacity-50"
          >
            {profileStatus === 'saving'
              ? <><Loader2 size={15} className="animate-spin" />{t.saving}</>
              : <><Save size={15} />{t.save}</>
            }
          </button>
        </form>

        {/* ── Security card ─────────────────────────────────── */}
        <form onSubmit={handlePassChange} className="bg-platform-surface border border-platform-border rounded-[12px] p-6 space-y-5">
          <h2 className="text-sm font-bold text-platform-text-primary flex items-center gap-2">
            <Key size={16} className="text-platform-accent" />
            {t.sectionSecurity}
          </h2>

          {!hasPassword && (
            <p className="text-xs text-platform-text-secondary bg-platform-surface-raised border border-platform-border/60 rounded-[8px] px-3 py-2.5">
              {t.noPassword}
            </p>
          )}

          {hasPassword && (
            <div className="space-y-1.5">
              <label className="block text-[11px] font-semibold uppercase tracking-wide text-platform-text-muted">
                {t.currentPass}
              </label>
              <div className="relative">
                <input
                  type={showPass.current ? 'text' : 'password'}
                  value={passForm.current}
                  onChange={e => setPassForm(p => ({ ...p, current: e.target.value }))}
                  autoComplete="current-password"
                  className="w-full h-9 px-3 pr-9 bg-platform-bg border border-platform-border rounded-input text-sm text-platform-text-primary focus:outline-none focus:border-platform-accent transition-colors"
                />
                <button type="button" onClick={() => setShowPass(p => ({ ...p, current: !p.current }))}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-platform-text-muted hover:text-platform-text-primary transition-colors">
                  {showPass.current ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="block text-[11px] font-semibold uppercase tracking-wide text-platform-text-muted">
                {t.newPass}
              </label>
              <div className="relative">
                <input
                  type={showPass.next ? 'text' : 'password'}
                  value={passForm.next}
                  onChange={e => setPassForm(p => ({ ...p, next: e.target.value }))}
                  autoComplete="new-password"
                  minLength={8}
                  className="w-full h-9 px-3 pr-9 bg-platform-bg border border-platform-border rounded-input text-sm text-platform-text-primary focus:outline-none focus:border-platform-accent transition-colors"
                />
                <button type="button" onClick={() => setShowPass(p => ({ ...p, next: !p.next }))}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-platform-text-muted hover:text-platform-text-primary transition-colors">
                  {showPass.next ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
              <p className="text-[11px] text-platform-text-muted">{t.newPassHint}</p>
            </div>

            <div className="space-y-1.5">
              <label className="block text-[11px] font-semibold uppercase tracking-wide text-platform-text-muted">
                {t.confirmPass}
              </label>
              <div className="relative">
                <input
                  type={showPass.confirm ? 'text' : 'password'}
                  value={passForm.confirm}
                  onChange={e => setPassForm(p => ({ ...p, confirm: e.target.value }))}
                  autoComplete="new-password"
                  className="w-full h-9 px-3 pr-9 bg-platform-bg border border-platform-border rounded-input text-sm text-platform-text-primary focus:outline-none focus:border-platform-accent transition-colors"
                />
                <button type="button" onClick={() => setShowPass(p => ({ ...p, confirm: !p.confirm }))}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-platform-text-muted hover:text-platform-text-primary transition-colors">
                  {showPass.confirm ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>
          </div>

          {passStatus && typeof passStatus === 'object' && (
            <Alert type="error">{passStatus.error}</Alert>
          )}
          {passStatus === 'saved' && (
            <Alert type="success">{t.passChanged}</Alert>
          )}

          <button
            type="submit"
            disabled={passStatus === 'saving' || !passForm.next}
            className="flex items-center gap-2 px-4 py-2 bg-platform-accent hover:bg-platform-accent-hover text-white text-sm font-semibold rounded-button transition-all disabled:opacity-50"
          >
            {passStatus === 'saving'
              ? <><Loader2 size={15} className="animate-spin" />{t.saving}</>
              : <><Key size={15} />{hasPassword ? t.changePass : t.setPass}</>
            }
          </button>
        </form>

        {/* ── Two-factor auth card ──────────────────────────── */}
        <div className="bg-platform-surface border border-platform-border rounded-[12px] p-6 space-y-4">
          <div>
            <h2 className="text-sm font-bold text-platform-text-primary flex items-center gap-2">
              {twofaEnabled ? <ShieldCheck size={16} className="text-emerald-500" /> : <ShieldCheck size={16} className="text-platform-accent" />}
              Двухфакторная аутентификация (2FA)
            </h2>
            <p className="text-[11px] text-platform-text-muted mt-1">
              Защита входа кодом из приложения-аутентификатора (Google Authenticator, Authy, 1Password).
            </p>
          </div>

          {/* One-time recovery codes (shown once after enable/regenerate) */}
          {recoveryCodes && (
            <div className="bg-amber-500/8 border border-amber-500/30 rounded-[10px] p-4 space-y-3">
              <div className="flex items-center gap-2 text-xs font-bold text-amber-500">
                <KeyRound size={15} /> Резервные коды — сохраните сейчас!
              </div>
              <p className="text-[11px] text-platform-text-muted">Каждый код одноразовый. Используйте при потере телефона. Больше они не покажутся.</p>
              <div className="grid grid-cols-2 gap-1.5 font-mono text-xs">
                {recoveryCodes.map((c) => (
                  <span key={c} className="px-2 py-1 bg-platform-bg border border-platform-border rounded-[6px] text-platform-text-primary select-all text-center tracking-wide">{c}</span>
                ))}
              </div>
              <div className="flex gap-2">
                <button onClick={copyRecovery} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-platform-bg border border-platform-border rounded-button text-platform-text-secondary hover:text-platform-accent transition-colors"><Copy size={13} /> Копировать</button>
                <button onClick={() => setRecoveryCodes(null)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-platform-accent text-white rounded-button"><CheckCircle size={13} /> Я сохранил</button>
              </div>
            </div>
          )}

          {twofaEnabled ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs text-emerald-500 font-semibold">
                  <ShieldCheck size={15} /> 2FA включена
                </div>
                <span className="text-[11px] text-platform-text-muted">Резервных кодов: {recoveryRemaining}</span>
              </div>

              {/* Regenerate recovery codes */}
              {!regen ? (
                <button onClick={() => { setRegen(true); setDisarm(false); setTwofaErr(null); setTwofaCode(''); }}
                  className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold bg-platform-bg border border-platform-border text-platform-text-secondary rounded-button hover:text-platform-accent hover:border-platform-accent transition-colors">
                  <KeyRound size={13} /> Перегенерировать резервные коды
                </button>
              ) : (
                <div className="space-y-2 max-w-xs">
                  <p className="text-[11px] text-platform-text-muted">Введите код из приложения, чтобы выпустить новые коды (старые перестанут работать):</p>
                  <input value={twofaCode} inputMode="numeric" maxLength={6} placeholder="000000"
                    onChange={(e) => setTwofaCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    className="w-full h-10 px-3 bg-platform-bg border border-platform-border rounded-input text-sm tracking-[0.3em] text-platform-text-primary focus:outline-none focus:border-platform-accent" />
                  {twofaErr && <p className="text-[11px] text-red-400">{twofaErr}</p>}
                  <div className="flex gap-2">
                    <button onClick={regenerateRecovery} disabled={twofaBusy || twofaCode.length !== 6}
                      className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold bg-platform-accent text-white rounded-button disabled:opacity-50">
                      {twofaBusy ? <Loader2 size={13} className="animate-spin" /> : <KeyRound size={13} />} Выпустить
                    </button>
                    <button onClick={() => { setRegen(false); setTwofaErr(null); }} className="px-3 py-2 text-xs font-semibold bg-platform-bg border border-platform-border rounded-button text-platform-text-secondary">Отмена</button>
                  </div>
                </div>
              )}

              {!disarm ? (
                <button onClick={() => { setDisarm(true); setRegen(false); setTwofaErr(null); setTwofaCode(''); }}
                  className="flex items-center gap-2 px-4 py-2 text-xs font-semibold bg-red-500/10 border border-red-500/25 text-red-400 rounded-button hover:bg-red-500/15 transition-colors">
                  <ShieldOff size={14} /> Отключить 2FA
                </button>
              ) : (
                <div className="space-y-2 max-w-xs">
                  <p className="text-[11px] text-platform-text-muted">Введите код из приложения или резервный код, чтобы отключить:</p>
                  <input value={twofaCode} maxLength={13} placeholder="000000 или резервный код"
                    onChange={(e) => setTwofaCode(e.target.value.replace(/[^a-zA-Z0-9-]/g, '').slice(0, 13))}
                    className="w-full h-10 px-3 bg-platform-bg border border-platform-border rounded-input text-sm tracking-wide text-platform-text-primary focus:outline-none focus:border-platform-accent" />
                  {twofaErr && <p className="text-[11px] text-red-400">{twofaErr}</p>}
                  <div className="flex gap-2">
                    <button onClick={disableTwofa} disabled={twofaBusy || twofaCode.length < 6}
                      className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold bg-red-500 text-white rounded-button disabled:opacity-50">
                      {twofaBusy ? <Loader2 size={13} className="animate-spin" /> : <ShieldOff size={13} />} Отключить
                    </button>
                    <button onClick={() => { setDisarm(false); setTwofaErr(null); }} className="px-3 py-2 text-xs font-semibold bg-platform-bg border border-platform-border rounded-button text-platform-text-secondary">Отмена</button>
                  </div>
                </div>
              )}
            </div>
          ) : !twofaSetup ? (
            <button onClick={startTwofaSetup} disabled={twofaBusy}
              className="flex items-center gap-2 px-4 py-2 text-xs font-semibold bg-platform-accent hover:bg-platform-accent-hover text-white rounded-button transition-colors disabled:opacity-50">
              {twofaBusy ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />} Включить 2FA
            </button>
          ) : (
            <div className="flex flex-col sm:flex-row gap-5">
              <div className="shrink-0">
                <img src={twofaSetup.qr} alt="QR" className="w-40 h-40 rounded-[10px] border border-platform-border bg-white p-1" />
              </div>
              <div className="space-y-3 flex-1 min-w-0">
                <ol className="text-[11px] text-platform-text-secondary list-decimal pl-4 space-y-1">
                  <li>Отсканируйте QR в приложении-аутентификаторе.</li>
                  <li>Или введите ключ вручную:</li>
                </ol>
                <code className="block text-[11px] font-mono bg-platform-bg border border-platform-border rounded-[6px] px-2.5 py-1.5 text-platform-text-primary select-all break-all">{twofaSetup.secret}</code>
                <div className="space-y-1.5 max-w-xs">
                  <label className="text-[11px] text-platform-text-muted">Введите 6-значный код для подтверждения:</label>
                  <input value={twofaCode} inputMode="numeric" maxLength={6} placeholder="000000" autoFocus
                    onChange={(e) => setTwofaCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    className="w-full h-10 px-3 bg-platform-bg border border-platform-border rounded-input text-sm tracking-[0.3em] text-platform-text-primary focus:outline-none focus:border-platform-accent" />
                </div>
                {twofaErr && <p className="text-[11px] text-red-400">{twofaErr}</p>}
                <div className="flex gap-2">
                  <button onClick={confirmTwofa} disabled={twofaBusy || twofaCode.length !== 6}
                    className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-platform-accent hover:bg-platform-accent-hover text-white rounded-button transition-colors disabled:opacity-50">
                    {twofaBusy ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle size={13} />} Подтвердить и включить
                  </button>
                  <button onClick={() => { setTwofaSetup(null); setTwofaErr(null); setTwofaCode(''); }} className="px-3 py-2 text-xs font-semibold bg-platform-bg border border-platform-border rounded-button text-platform-text-secondary">Отмена</button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── Notifications card ────────────────────────────── */}
        <div className="bg-platform-surface border border-platform-border rounded-[12px] p-6 space-y-5">
          <div>
            <h2 className="text-sm font-bold text-platform-text-primary flex items-center gap-2">
              <Bell size={16} className="text-platform-accent" />
              {t.sectionNotif}
            </h2>
            <p className="text-[11px] text-platform-text-muted mt-1">{t.notifSub}</p>
          </div>

          {/* Master switch */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-platform-text-primary">{t.notifEnabled}</span>
            <Toggle checked={notif.enabled} onChange={(v) => updateNotif({ enabled: v })} />
          </div>

          {/* Per-type switches */}
          <div className={`space-y-3 pl-1 ${notif.enabled ? '' : 'opacity-40 pointer-events-none'}`}>
            <div className="flex items-center justify-between">
              <span className="text-sm text-platform-text-secondary">{t.notifSound}</span>
              <Toggle checked={notif.sound} disabled={!notif.enabled} onChange={(v) => updateNotif({ sound: v })} />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-platform-text-secondary">{t.notifDesktop}</span>
              <Toggle checked={notif.desktop && !desktopBlocked} disabled={!notif.enabled || desktopBlocked} onChange={(v) => updateNotif({ desktop: v })} />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-platform-text-secondary">{t.notifTab}</span>
              <Toggle checked={notif.tabCounter} disabled={!notif.enabled} onChange={(v) => updateNotif({ tabCounter: v })} />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-platform-text-secondary">{t.notifToast}</span>
              <Toggle checked={notif.toast} disabled={!notif.enabled} onChange={(v) => updateNotif({ toast: v })} />
            </div>
            {desktopBlocked && (
              <p className="text-[11px] text-red-400">{t.notifBlocked}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
