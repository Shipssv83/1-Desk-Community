import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import apiClient from '../api/client';
import {
  ArrowLeft, Users, Plus, Loader2, CheckCircle, AlertCircle,
  UserCheck, UserX, Mail
} from 'lucide-react';

function Alert({ type, children }) {
  const isErr = type === 'error';
  return (
    <div className={`flex items-center gap-2 px-3 py-2.5 rounded-[8px] text-xs border ${
      isErr ? 'bg-red-500/8 border-red-500/25 text-red-400'
            : 'bg-green-500/8 border-green-500/25 text-green-400'
    }`}>
      {isErr ? <AlertCircle size={14} /> : <CheckCircle size={14} />}
      <span>{children}</span>
    </div>
  );
}

export default function Operators() {
  const navigate = useNavigate();
  const [operators, setOperators] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [status, setStatus] = useState(null); // null | 'saving' | 'saved' | {error}

  const fetchOperators = async () => {
    try {
      const res = await apiClient.get('/auth/operators', { params: { include_inactive: 1 } });
      // Show operator accounts only (admins are managed elsewhere).
      setOperators((res.data || []).filter((u) => u.role === 'operator'));
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchOperators(); }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (form.password.length < 8) { setStatus({ error: 'Password must be at least 8 characters' }); return; }
    setStatus('saving');
    try {
      await apiClient.post('/auth/operators', form);
      setForm({ name: '', email: '', password: '' });
      setStatus('saved');
      fetchOperators();
      setTimeout(() => setStatus(null), 2500);
    } catch (err) {
      setStatus({ error: err.response?.data?.error || 'Failed to create operator' });
    }
  };

  const toggleActive = async (op) => {
    try {
      await apiClient.patch(`/auth/operators/${op.id}`, { is_active: !op.is_active });
      fetchOperators();
    } catch {
      // ignore
    }
  };

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
          <h1 className="text-2xl font-bold tracking-tight text-platform-text-primary flex items-center gap-2">
            <Users size={22} className="text-platform-accent" /> Operators
          </h1>
          <p className="text-sm text-platform-text-secondary mt-0.5">
            Create operator accounts — they can view chats and reply, but cannot change system settings.
          </p>
        </div>
      </div>

      <div className="max-w-2xl space-y-6">
        {/* Create form */}
        <form onSubmit={handleCreate} className="bg-platform-surface border border-platform-border rounded-[12px] p-6 space-y-4">
          <h2 className="text-sm font-bold text-platform-text-primary flex items-center gap-2">
            <Plus size={16} className="text-platform-accent" /> New operator
          </h2>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="block text-[11px] font-semibold uppercase tracking-wide text-platform-text-muted">Name</label>
              <input
                type="text" value={form.name} required
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                className="w-full h-9 px-3 bg-platform-bg border border-platform-border rounded-input text-sm text-platform-text-primary focus:outline-none focus:border-platform-accent transition-colors"
              />
            </div>
            <div className="space-y-1.5">
              <label className="block text-[11px] font-semibold uppercase tracking-wide text-platform-text-muted">Email</label>
              <input
                type="email" value={form.email} required
                onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                className="w-full h-9 px-3 bg-platform-bg border border-platform-border rounded-input text-sm text-platform-text-primary focus:outline-none focus:border-platform-accent transition-colors"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block text-[11px] font-semibold uppercase tracking-wide text-platform-text-muted">Password</label>
            <input
              type="password" value={form.password} required minLength={8}
              autoComplete="new-password"
              onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
              className="w-full h-9 px-3 bg-platform-bg border border-platform-border rounded-input text-sm text-platform-text-primary focus:outline-none focus:border-platform-accent transition-colors"
            />
            <p className="text-[11px] text-platform-text-muted">Minimum 8 characters. Share these credentials with the operator.</p>
          </div>

          {status && typeof status === 'object' && <Alert type="error">{status.error}</Alert>}
          {status === 'saved' && <Alert type="success">Operator created</Alert>}

          <button
            type="submit" disabled={status === 'saving'}
            className="flex items-center gap-2 px-4 py-2 bg-platform-accent hover:bg-platform-accent-hover text-white text-sm font-semibold rounded-button transition-all disabled:opacity-50"
          >
            {status === 'saving'
              ? <><Loader2 size={15} className="animate-spin" />Creating…</>
              : <><Plus size={15} />Create operator</>}
          </button>
        </form>

        {/* List */}
        <div className="bg-platform-surface border border-platform-border rounded-[12px] p-6">
          <h2 className="text-sm font-bold text-platform-text-primary mb-4">Existing operators</h2>
          {loading ? (
            <div className="flex items-center gap-2 text-platform-text-muted text-sm">
              <Loader2 size={15} className="animate-spin" /> Loading…
            </div>
          ) : operators.length === 0 ? (
            <p className="text-sm text-platform-text-muted italic">No operators yet.</p>
          ) : (
            <ul className="divide-y divide-platform-border/40">
              {operators.map((op) => (
                <li key={op.id} className="flex items-center justify-between py-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-platform-text-primary truncate">{op.name}</div>
                    <div className="text-xs text-platform-text-muted flex items-center gap-1 truncate">
                      <Mail size={11} /> {op.email}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full border ${
                      op.is_active === false
                        ? 'bg-red-500/10 border-red-500/25 text-red-400'
                        : 'bg-green-500/10 border-green-500/25 text-green-400'
                    }`}>
                      {op.is_active === false ? 'Disabled' : 'Active'}
                    </span>
                    <button
                      onClick={() => toggleActive(op)}
                      title={op.is_active === false ? 'Enable' : 'Disable'}
                      className="p-1.5 rounded-button border border-platform-border text-platform-text-secondary hover:text-platform-accent hover:border-platform-accent transition-colors"
                    >
                      {op.is_active === false ? <UserCheck size={15} /> : <UserX size={15} />}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
