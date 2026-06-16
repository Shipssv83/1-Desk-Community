import React, { useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import apiClient from '../api/client';
import { useTheme } from '../hooks/useTheme';
import { MessageSquare, Mail, Lock, AlertCircle, Loader, Sun, Moon } from 'lucide-react';

export default function Login() {
  const navigate = useNavigate();
  const { user, setUser } = useAuthStore();
  const [error, setError] = useState('');
  const { theme, toggleTheme } = useTheme();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [twofaStep, setTwofaStep] = useState(false);
  const [pending, setPending] = useState('');
  const [totp, setTotp] = useState('');

  if (user) return <Navigate to="/app" replace />;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email || !password) { setError('Fill in all fields'); return; }
    setError('');
    setIsSubmitting(true);
    try {
      const res = await apiClient.post('/auth/login', { email, password });
      setUser(res.data.user);
      navigate('/app');
    } catch (err) {
      // 2FA enabled: switch to the code step.
      if (err.response?.status === 401 && err.response.data?.twofa_required) {
        setPending(err.response.data.pending);
        setTwofaStep(true);
        setError('');
      } else {
        setError(err.response?.data?.error || 'Invalid credentials');
      }
    } finally { setIsSubmitting(false); }
  };

  const handle2faSubmit = async (e) => {
    e.preventDefault();
    if (totp.replace(/-/g, '').length < 6) { setError('Enter your code or a recovery code'); return; }
    setError('');
    setIsSubmitting(true);
    try {
      const res = await apiClient.post('/auth/2fa/login', { pending, code: totp });
      setUser(res.data.user);
      navigate('/app');
    } catch (err) {
      setError(err.response?.data?.error || 'Invalid 2FA code');
      setTotp('');
    } finally { setIsSubmitting(false); }
  };

  return (
    <div className="login-root">
      <div className="login-controls">
        <button className="login-theme-toggle" onClick={toggleTheme} aria-label="Toggle theme">
          {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
        </button>
      </div>

      <div className="login-card">
        <div className="login-brand">
          <div className="login-brand-icon">
            <MessageSquare size={17} />
          </div>
          <span className="login-brand-name">1-Desk</span>
        </div>

        <h1 className="login-title">Sign in</h1>
        <p className="login-subtitle">Sign in to your 1-Desk workspace.</p>

        {error && (
          <div className="login-error" role="alert">
            <AlertCircle size={14} />
            <span>{error}</span>
          </div>
        )}

        {!twofaStep && (
          <form onSubmit={handleSubmit} className="login-form" noValidate>
            <div className="login-field">
              <label htmlFor="adm-email">Email address</label>
              <div className="login-input-wrap">
                <Mail size={14} />
                <input id="adm-email" type="email" autoComplete="email"
                  placeholder="admin@example.com" value={email}
                  onChange={e => setEmail(e.target.value)} />
              </div>
            </div>
            <div className="login-field">
              <label htmlFor="adm-pass">Password</label>
              <div className="login-input-wrap">
                <Lock size={14} />
                <input id="adm-pass" type="password" autoComplete="current-password"
                  placeholder="••••••••" value={password}
                  onChange={e => setPassword(e.target.value)} />
              </div>
            </div>
            <button type="submit" disabled={isSubmitting} className="login-submit">
              {isSubmitting ? <Loader size={15} className="login-spinner" /> : 'Sign in'}
            </button>
          </form>
        )}

        {twofaStep && (
          <form onSubmit={handle2faSubmit} className="login-form" noValidate>
            <div className="login-field">
              <label htmlFor="adm-2fa">2FA or recovery code</label>
              <div className="login-input-wrap">
                <Lock size={14} />
                <input id="adm-2fa" type="text" autoComplete="one-time-code"
                  maxLength={13} placeholder="000000" value={totp} autoFocus
                  onChange={e => setTotp(e.target.value.replace(/[^a-zA-Z0-9-]/g, '').slice(0, 13))} />
              </div>
            </div>
            <button type="submit" disabled={isSubmitting || totp.replace(/-/g, '').length < 6} className="login-submit">
              {isSubmitting ? <Loader size={15} className="login-spinner" /> : 'Verify'}
            </button>
            <button type="button" className="login-link" style={{ marginTop: 8, background: 'none', border: 'none', cursor: 'pointer' }}
              onClick={() => { setTwofaStep(false); setTotp(''); setPending(''); setError(''); }}>
              ← Back
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
