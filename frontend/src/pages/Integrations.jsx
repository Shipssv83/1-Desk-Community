import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import apiClient from '../api/client';
import {
  ArrowLeft, Plug, Plus, Loader2, Trash2, CheckCircle, AlertCircle, Power
} from 'lucide-react';

// Provider catalog: declares kind + which fields map to config vs credentials.
// Community edition ships a single AI brain — Dify.
const PROVIDERS = {
  dify: { kind: 'conversational', fields: [{ k: 'api_url', store: 'config', label: 'API URL', ph: 'https://dify…/v1/chat-messages' }, { k: 'api_key', store: 'cred', label: 'API key', secret: true }] },
};

function Alert({ type, children }) {
  const isErr = type === 'error';
  return (
    <div className={`flex items-center gap-2 px-3 py-2.5 rounded-[8px] text-xs border ${isErr ? 'bg-red-500/8 border-red-500/25 text-red-400' : 'bg-green-500/8 border-green-500/25 text-green-400'}`}>
      {isErr ? <AlertCircle size={14} /> : <CheckCircle size={14} />}<span>{children}</span>
    </div>
  );
}

export default function Integrations() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [provider, setProvider] = useState('dify');
  const [name, setName] = useState('');
  const [values, setValues] = useState({});
  const [status, setStatus] = useState(null);

  const fetchItems = async () => {
    try {
      const res = await apiClient.get('/integrations');
      setItems(res.data || []);
    } catch { /* ignore */ } finally { setLoading(false); }
  };
  useEffect(() => { fetchItems(); }, []);

  const spec = PROVIDERS[provider];

  const handleCreate = async (e) => {
    e.preventDefault();
    setStatus('saving');
    const config = {}; const credentials = {};
    for (const f of spec.fields) {
      const v = values[f.k];
      if (v === undefined || v === '') continue;
      (f.store === 'cred' ? credentials : config)[f.k] = v;
    }
    try {
      await apiClient.post('/integrations', { provider, kind: spec.kind, name, config, credentials });
      setName(''); setValues({}); setStatus('saved');
      fetchItems();
      setTimeout(() => setStatus(null), 2500);
    } catch (err) {
      setStatus({ error: err.response?.data?.error || 'Failed to create integration' });
    }
  };

  const toggleActive = async (it) => {
    try { await apiClient.put(`/integrations/${it.id}`, { is_active: !it.is_active }); fetchItems(); } catch { /* ignore */ }
  };
  const remove = async (it) => {
    if (!window.confirm(`Delete integration "${it.name}"?`)) return;
    try { await apiClient.delete(`/integrations/${it.id}`); fetchItems(); } catch { /* ignore */ }
  };

  return (
    <div className="flex-1 overflow-y-auto bg-platform-bg p-6">
      <div className="flex items-center gap-3.5 mb-8">
        <button onClick={() => navigate('/app/settings')} className="p-2 bg-platform-surface hover:bg-platform-surface-raised border border-platform-border rounded-button text-platform-text-secondary hover:text-platform-accent transition-all active:scale-95">
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-platform-text-primary flex items-center gap-2"><Plug size={22} className="text-platform-accent" /> Integrations</h1>
          <p className="text-sm text-platform-text-secondary mt-0.5">Connect your Dify AI app. Secrets are encrypted at rest.</p>
        </div>
      </div>

      <div className="max-w-3xl space-y-6">
        {/* Create */}
        <form onSubmit={handleCreate} className="bg-platform-surface border border-platform-border rounded-[12px] p-6 space-y-4">
          <h2 className="text-sm font-bold text-platform-text-primary flex items-center gap-2"><Plus size={16} className="text-platform-accent" /> Add integration</h2>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="block text-[11px] font-semibold uppercase tracking-wide text-platform-text-muted">Provider</label>
              <select value={provider} onChange={(e) => { setProvider(e.target.value); setValues({}); }}
                className="w-full h-9 px-3 bg-platform-bg border border-platform-border rounded-input text-sm text-platform-text-primary focus:outline-none focus:border-platform-accent">
                {Object.keys(PROVIDERS).map((p) => <option key={p} value={p}>{p} — {PROVIDERS[p].kind}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="block text-[11px] font-semibold uppercase tracking-wide text-platform-text-muted">Name</label>
              <input value={name} required onChange={(e) => setName(e.target.value)}
                className="w-full h-9 px-3 bg-platform-bg border border-platform-border rounded-input text-sm text-platform-text-primary focus:outline-none focus:border-platform-accent" />
            </div>
          </div>

          {spec.fields.map((f) => (
            <div key={f.k} className="space-y-1.5">
              <label className="block text-[11px] font-semibold uppercase tracking-wide text-platform-text-muted">{f.label}</label>
              <input
                type={f.secret ? 'password' : 'text'}
                value={values[f.k] || ''}
                placeholder={f.ph || ''}
                autoComplete="off"
                onChange={(e) => setValues((p) => ({ ...p, [f.k]: e.target.value }))}
                className="w-full h-9 px-3 bg-platform-bg border border-platform-border rounded-input text-sm text-platform-text-primary placeholder-platform-text-muted focus:outline-none focus:border-platform-accent" />
            </div>
          ))}

          {status && typeof status === 'object' && <Alert type="error">{status.error}</Alert>}
          {status === 'saved' && <Alert type="success">Integration added</Alert>}

          <button type="submit" disabled={status === 'saving'} className="flex items-center gap-2 px-4 py-2 bg-platform-accent hover:bg-platform-accent-hover text-white text-sm font-semibold rounded-button transition-all disabled:opacity-50">
            {status === 'saving' ? <><Loader2 size={15} className="animate-spin" />Saving…</> : <><Plus size={15} />Add integration</>}
          </button>
        </form>

        {/* List */}
        <div className="bg-platform-surface border border-platform-border rounded-[12px] p-6">
          <h2 className="text-sm font-bold text-platform-text-primary mb-4">Connected</h2>
          {loading ? (
            <div className="flex items-center gap-2 text-platform-text-muted text-sm"><Loader2 size={15} className="animate-spin" /> Loading…</div>
          ) : items.length === 0 ? (
            <p className="text-sm text-platform-text-muted italic">No integrations yet.</p>
          ) : (
            <ul className="divide-y divide-platform-border/40">
              {items.map((it) => (
                <li key={it.id} className="flex items-center justify-between py-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-platform-text-primary truncate">{it.name}</div>
                    <div className="text-xs text-platform-text-muted">{it.provider} · {it.kind}</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full border ${it.is_active ? 'bg-green-500/10 border-green-500/25 text-green-400' : 'bg-red-500/10 border-red-500/25 text-red-400'}`}>
                      {it.is_active ? 'Active' : 'Disabled'}
                    </span>
                    <button onClick={() => toggleActive(it)} title={it.is_active ? 'Disable' : 'Enable'} className="p-1.5 rounded-button border border-platform-border text-platform-text-secondary hover:text-platform-accent hover:border-platform-accent transition-colors"><Power size={15} /></button>
                    <button onClick={() => remove(it)} title="Delete" className="p-1.5 rounded-button border border-platform-border text-platform-text-secondary hover:text-red-400 hover:border-red-400 transition-colors"><Trash2 size={15} /></button>
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
