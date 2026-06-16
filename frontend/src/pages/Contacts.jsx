import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import apiClient from '../api/client';
import ChannelIcon from '../components/ui/ChannelIcon';
import {
  Search, Mail, Phone, Calendar, User, ExternalLink, SlidersHorizontal,
  UserPlus, Pencil, Check, X, Loader2, MessageSquare
} from 'lucide-react';

const STATUS = {
  active:   { label: 'Активен', cls: 'bg-emerald-500/12 text-emerald-500 border-emerald-500/25' },
  pending:  { label: 'Ожидает', cls: 'bg-amber-500/12 text-amber-500 border-amber-500/25' },
  inactive: { label: 'Закрыт',  cls: 'bg-platform-text-muted/12 text-platform-text-muted border-platform-border' },
};

const CHANNEL_LABEL = {
  telegram: 'Telegram', whatsapp: 'WhatsApp', website: 'Website', instagram: 'Instagram',
  facebook: 'Facebook', line: 'Line', api: 'API', manual: 'Вручную',
};

const fmtDate = (d) => new Date(d).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });

export default function Contacts() {
  const navigate = useNavigate();
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 12;

  const [showFilters, setShowFilters] = useState(false);
  const [channelFilter, setChannelFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  const [showAdd, setShowAdd] = useState(false);
  const [drawer, setDrawer] = useState(null); // selected contact (basic row)
  const [drawerDetails, setDrawerDetails] = useState(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

  const fetchContacts = useCallback(async (pageNumber = 1) => {
    setLoading(true);
    try {
      const res = await apiClient.get('/contacts', { params: { search: searchQuery, page: pageNumber, limit } });
      setContacts(res.data.items || []);
      setTotalPages(res.data.pages || 1);
      setPage(res.data.page || 1);
      setTotal(res.data.total || 0);
    } catch (err) {
      console.error('Error fetching contacts:', err);
    } finally {
      setLoading(false);
    }
  }, [searchQuery]);

  useEffect(() => { fetchContacts(1); }, [fetchContacts]);

  // Client-side channel/status filtering on top of the server page.
  const visible = contacts.filter((c) =>
    (channelFilter === 'all' || c.channel_type === channelFilter) &&
    (statusFilter === 'all' || c.status === statusFilter)
  );

  const openDrawer = async (contact) => {
    setDrawer(contact);
    setDrawerDetails(null);
    setLoadingDetails(true);
    try {
      const res = await apiClient.get(`/contacts/${contact.id}`);
      setDrawerDetails(res.data.contact);
    } catch { /* ignore */ } finally { setLoadingDetails(false); }
  };

  const onSaved = (updated) => {
    setContacts((prev) => prev.map((c) => (c.id === updated.id ? { ...c, ...updated } : c)));
    setDrawer((d) => (d && d.id === updated.id ? { ...d, ...updated } : d));
  };

  const from = total === 0 ? 0 : (page - 1) * limit + 1;
  const to = (page - 1) * limit + contacts.length;

  return (
    <div className="flex-1 overflow-y-auto bg-platform-bg">
      <div className="max-w-6xl mx-auto p-6 lg:p-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-7">
          <div>
            <h1 className="text-[26px] font-bold tracking-tight text-platform-text-primary">Контакты</h1>
            <p className="text-sm text-platform-text-secondary mt-1">Управление базой клиентов и историей взаимодействий</p>
          </div>
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-platform-text-primary text-platform-bg text-sm font-semibold rounded-[10px] hover:opacity-90 transition-all active:scale-[0.98] shadow-sm shrink-0"
          >
            <UserPlus size={16} /> Добавить контакт
          </button>
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-3 mb-5">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-platform-text-muted" size={16} />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Поиск контактов…"
              className="w-full h-11 bg-platform-surface border border-platform-border rounded-[10px] pl-11 pr-4 text-sm text-platform-text-primary placeholder-platform-text-muted focus:outline-none focus:border-platform-accent transition-colors"
            />
          </div>
          <button
            onClick={() => setShowFilters((v) => !v)}
            className={`flex items-center gap-2 h-11 px-4 border rounded-[10px] text-sm font-medium transition-colors ${
              showFilters || channelFilter !== 'all' || statusFilter !== 'all'
                ? 'bg-platform-accent/10 border-platform-accent/30 text-platform-accent'
                : 'bg-platform-surface border-platform-border text-platform-text-secondary hover:text-platform-text-primary'
            }`}
          >
            <SlidersHorizontal size={15} /> Фильтры
          </button>
        </div>

        {/* Filter row */}
        {showFilters && (
          <div className="flex flex-wrap items-center gap-3 mb-5 p-4 bg-platform-surface border border-platform-border rounded-[12px]">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold uppercase text-platform-text-muted">Источник</span>
              <select value={channelFilter} onChange={(e) => setChannelFilter(e.target.value)}
                className="h-9 px-3 bg-platform-bg border border-platform-border rounded-input text-xs text-platform-text-primary focus:outline-none focus:border-platform-accent">
                <option value="all">Все</option>
                {Object.entries(CHANNEL_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold uppercase text-platform-text-muted">Статус</span>
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
                className="h-9 px-3 bg-platform-bg border border-platform-border rounded-input text-xs text-platform-text-primary focus:outline-none focus:border-platform-accent">
                <option value="all">Все</option>
                {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            {(channelFilter !== 'all' || statusFilter !== 'all') && (
              <button onClick={() => { setChannelFilter('all'); setStatusFilter('all'); }}
                className="text-xs text-platform-text-muted hover:text-platform-accent transition-colors">Сбросить</button>
            )}
          </div>
        )}

        {/* Table */}
        <div className="bg-platform-surface border border-platform-border rounded-[14px] overflow-hidden shadow-sm">
          {/* Head */}
          <div className="grid grid-cols-[1.6fr_1.6fr_1fr_0.9fr_1fr] gap-4 px-6 py-3.5 border-b border-platform-border bg-platform-bg/40">
            {['Клиент', 'Телефон / Email', 'Источник', 'Статус', 'Создан'].map((h) => (
              <span key={h} className="text-[11px] font-bold uppercase tracking-wider text-platform-text-muted">{h}</span>
            ))}
          </div>

          {loading ? (
            <div className="flex justify-center items-center py-20">
              <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-platform-accent border-t-transparent" />
            </div>
          ) : visible.length === 0 ? (
            <div className="py-20 text-center text-platform-text-muted italic text-sm">Контакты не найдены.</div>
          ) : (
            <div className="divide-y divide-platform-border/50">
              {visible.map((c) => {
                const st = STATUS[c.status] || STATUS.inactive;
                return (
                  <button
                    key={c.id}
                    onClick={() => openDrawer(c)}
                    className="w-full grid grid-cols-[1.6fr_1.6fr_1fr_0.9fr_1fr] gap-4 px-6 py-4 items-center text-left hover:bg-platform-surface-raised/50 transition-colors group"
                  >
                    {/* Client */}
                    <div className="flex items-center gap-3 min-w-0">
                      {c.avatar_url ? (
                        <img src={c.avatar_url} alt="" className="w-9 h-9 rounded-full object-cover border border-platform-border shrink-0" />
                      ) : (
                        <div className="w-9 h-9 rounded-full bg-platform-accent/12 text-platform-accent flex items-center justify-center text-sm font-bold shrink-0">
                          {(c.name || 'C').charAt(0).toUpperCase()}
                        </div>
                      )}
                      <span className="text-sm font-semibold text-platform-text-primary truncate group-hover:text-platform-accent transition-colors">{c.name || 'Без имени'}</span>
                    </div>
                    {/* Phone / Email */}
                    <span className="text-sm text-platform-text-secondary truncate">{c.phone || c.email || '—'}</span>
                    {/* Source */}
                    <div className="flex items-center gap-2 min-w-0">
                      <ChannelIcon channelType={c.channel_type} size={15} className="shrink-0" />
                      <span className="text-sm text-platform-text-secondary truncate">{CHANNEL_LABEL[c.channel_type] || c.channel_type}</span>
                    </div>
                    {/* Status */}
                    <span className={`justify-self-start text-[11px] font-semibold px-2.5 py-1 rounded-full border ${st.cls}`}>{st.label}</span>
                    {/* Created */}
                    <span className="text-sm text-platform-text-secondary">{fmtDate(c.created_at)}</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center justify-between px-6 py-3.5 border-t border-platform-border bg-platform-bg/30">
            <span className="text-xs text-platform-text-muted">Показано {from}-{to} из {total} контактов</span>
            <div className="flex items-center gap-2">
              <button onClick={() => fetchContacts(page - 1)} disabled={page <= 1}
                className="px-3.5 py-1.5 text-xs font-medium bg-platform-surface hover:bg-platform-surface-raised border border-platform-border rounded-button text-platform-text-primary disabled:opacity-40 disabled:cursor-not-allowed transition-colors">Назад</button>
              <button onClick={() => fetchContacts(page + 1)} disabled={page >= totalPages}
                className="px-3.5 py-1.5 text-xs font-medium bg-platform-surface hover:bg-platform-surface-raised border border-platform-border rounded-button text-platform-text-primary disabled:opacity-40 disabled:cursor-not-allowed transition-colors">Вперёд</button>
            </div>
          </div>
        </div>
      </div>

      {/* Add-contact modal */}
      {showAdd && <AddContactModal onClose={() => setShowAdd(false)} onCreated={() => { setShowAdd(false); fetchContacts(1); }} />}

      {/* Detail drawer */}
      {drawer && (
        <ContactDrawer
          contact={drawer}
          details={drawerDetails}
          loadingDetails={loadingDetails}
          onClose={() => setDrawer(null)}
          onSaved={onSaved}
          onGoToChat={() => navigate(`/app/conversations?inbox_id=${drawer.inbox_id}`)}
        />
      )}
    </div>
  );
}

// ── Add-contact modal ────────────────────────────────────────────────────────
function AddContactModal({ onClose, onCreated }) {
  const [form, setForm] = useState({ name: '', email: '', phone: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { setError('Имя обязательно'); return; }
    setSaving(true); setError(null);
    try {
      await apiClient.post('/contacts', form);
      onCreated();
    } catch (err) {
      setError(err.response?.data?.error || 'Не удалось создать контакт');
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <form onClick={(e) => e.stopPropagation()} onSubmit={submit}
        className="w-full max-w-md bg-platform-surface border border-platform-border rounded-[16px] p-6 space-y-4 shadow-2xl">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-platform-text-primary flex items-center gap-2"><UserPlus size={18} className="text-platform-accent" /> Новый контакт</h2>
          <button type="button" onClick={onClose} className="p-1 text-platform-text-muted hover:text-platform-text-primary"><X size={18} /></button>
        </div>
        {[
          { k: 'name', label: 'Имя', ph: 'Иван Иванов' },
          { k: 'email', label: 'Email', ph: 'ivan@example.com' },
          { k: 'phone', label: 'Телефон', ph: '+7 900 000 00 00' },
        ].map((f) => (
          <div key={f.k} className="space-y-1.5">
            <label className="block text-[11px] font-semibold uppercase tracking-wide text-platform-text-muted">{f.label}</label>
            <input value={form[f.k]} placeholder={f.ph} onChange={(e) => setForm((p) => ({ ...p, [f.k]: e.target.value }))}
              className="w-full h-10 px-3 bg-platform-bg border border-platform-border rounded-input text-sm text-platform-text-primary focus:outline-none focus:border-platform-accent" />
          </div>
        ))}
        {error && <p className="text-xs text-red-400">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium bg-platform-bg border border-platform-border rounded-button text-platform-text-secondary hover:text-platform-text-primary transition-colors">Отмена</button>
          <button type="submit" disabled={saving} className="flex items-center gap-2 px-4 py-2 bg-platform-accent hover:bg-platform-accent-hover text-white text-sm font-semibold rounded-button transition-all disabled:opacity-50">
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} Создать
          </button>
        </div>
      </form>
    </div>
  );
}

// ── Detail drawer (slide-over) with inline edit ──────────────────────────────
function ContactDrawer({ contact, details, loadingDetails, onClose, onSaved, onGoToChat }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: contact.name || '', email: contact.email || '', phone: contact.phone || '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    setForm({ name: contact.name || '', email: contact.email || '', phone: contact.phone || '' });
    setEditing(false);
  }, [contact.id]);

  const save = async () => {
    if (!form.name.trim()) { setError('Имя не может быть пустым'); return; }
    setSaving(true); setError(null);
    try {
      const res = await apiClient.put(`/contacts/${contact.id}`, form);
      onSaved(res.data.contact);
      setEditing(false);
    } catch (err) {
      setError(err.response?.data?.error || 'Не удалось сохранить');
    } finally { setSaving(false); }
  };

  const st = STATUS[contact.status] || STATUS.inactive;

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/40" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-[380px] h-full bg-platform-surface border-l border-platform-border overflow-y-auto shadow-2xl">
        {/* Header */}
        <div className="relative p-6 border-b border-platform-border/60 text-center">
          <button onClick={onClose} className="absolute top-4 right-4 p-1.5 text-platform-text-muted hover:text-platform-text-primary"><X size={18} /></button>
          <div className="relative inline-block">
            {contact.avatar_url ? (
              <img src={contact.avatar_url} alt="" className="w-20 h-20 rounded-full object-cover border-2 border-platform-border mx-auto" />
            ) : (
              <div className="w-20 h-20 rounded-full bg-platform-accent/12 text-platform-accent flex items-center justify-center text-3xl font-bold mx-auto">
                {(contact.name || 'C').charAt(0).toUpperCase()}
              </div>
            )}
            <div className="absolute bottom-0 right-0 p-1.5 bg-platform-bg rounded-full border border-platform-border">
              <ChannelIcon channelType={contact.channel_type} size={14} />
            </div>
          </div>
          <h2 className="text-lg font-bold text-platform-text-primary mt-3">{contact.name || 'Без имени'}</h2>
          <span className={`inline-block mt-2 text-[11px] font-semibold px-2.5 py-1 rounded-full border ${st.cls}`}>{st.label}</span>
        </div>

        {/* Profile + edit */}
        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-platform-text-muted uppercase tracking-wider">Данные профиля</h3>
            {!editing && (
              <button onClick={() => setEditing(true)} className="flex items-center gap-1 text-[11px] font-semibold text-platform-text-secondary hover:text-platform-accent transition-colors">
                <Pencil size={12} /> Редактировать
              </button>
            )}
          </div>

          {editing ? (
            <div className="space-y-3">
              {[{ k: 'name', label: 'Имя' }, { k: 'email', label: 'Email' }, { k: 'phone', label: 'Телефон' }].map((f) => (
                <div key={f.k} className="space-y-1">
                  <label className="text-[10px] text-platform-text-muted block">{f.label}</label>
                  <input value={form[f.k]} onChange={(e) => setForm((p) => ({ ...p, [f.k]: e.target.value }))}
                    className="w-full h-9 px-2.5 bg-platform-bg border border-platform-border rounded-input text-xs text-platform-text-primary focus:outline-none focus:border-platform-accent" />
                </div>
              ))}
              {error && <p className="text-[10px] text-red-400">{error}</p>}
              <div className="flex items-center gap-2 pt-1">
                <button onClick={save} disabled={saving} className="flex items-center gap-1.5 px-3 py-1.5 bg-platform-accent hover:bg-platform-accent-hover text-white text-xs font-semibold rounded-button transition-all disabled:opacity-50">
                  {saving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Сохранить
                </button>
                <button onClick={() => setEditing(false)} disabled={saving} className="flex items-center gap-1.5 px-3 py-1.5 bg-platform-bg border border-platform-border text-platform-text-secondary text-xs font-semibold rounded-button hover:text-platform-text-primary transition-colors">
                  <X size={12} /> Отмена
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3.5 text-xs">
              <Row icon={<Mail size={14} />} label="Email" value={contact.email || '—'} />
              <Row icon={<Phone size={14} />} label="Телефон" value={contact.phone || '—'} />
              <Row icon={<User size={14} />} label="External ID" value={contact.external_id} mono />
              <Row icon={<Calendar size={14} />} label="Создан" value={fmtDate(contact.created_at)} />
            </div>
          )}
        </div>

        {/* Conversations */}
        <div className="px-6 pb-6 space-y-3 border-t border-platform-border/40 pt-5">
          <h3 className="text-xs font-bold text-platform-text-muted uppercase tracking-wider">История диалогов</h3>
          {loadingDetails ? (
            <div className="flex justify-center py-4"><div className="h-5 w-5 animate-spin rounded-full border-2 border-platform-accent border-t-transparent" /></div>
          ) : (details?.conversations?.length ?? 0) === 0 ? (
            <p className="text-xs text-platform-text-muted italic">Диалогов нет</p>
          ) : (
            <div className="space-y-2.5">
              {details.conversations.map((conv) => (
                <div key={conv.id} className="p-3 bg-platform-bg/60 border border-platform-border/60 rounded-[8px] flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className={`h-1.5 w-1.5 rounded-full ${conv.status === 'open' ? 'bg-emerald-400' : 'bg-platform-text-muted'}`} />
                      <span className="text-xs font-bold text-platform-text-primary capitalize">{conv.status === 'open' ? 'Открыт' : 'Закрыт'}</span>
                    </div>
                    <span className="text-[10px] text-platform-text-muted block mt-0.5">{new Date(conv.last_message_at).toLocaleDateString('ru-RU')}</span>
                  </div>
                  <button onClick={onGoToChat} className="p-1.5 bg-platform-surface border border-platform-border hover:border-platform-accent hover:text-platform-accent text-platform-text-secondary rounded-[6px] transition-colors" title="Открыть диалог">
                    <ExternalLink size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
          <button onClick={onGoToChat} className="w-full flex items-center justify-center gap-2 mt-2 px-3 py-2 bg-platform-accent/10 border border-platform-accent/25 text-platform-accent text-xs font-semibold rounded-button hover:bg-platform-accent/15 transition-colors">
            <MessageSquare size={13} /> Перейти к диалогам
          </button>
        </div>
      </div>
    </div>
  );
}

function Row({ icon, label, value, mono }) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="text-platform-text-secondary mt-0.5">{icon}</span>
      <div className="min-w-0">
        <span className="text-[10px] text-platform-text-muted block">{label}</span>
        <span className={`text-platform-text-primary break-all ${mono ? 'font-mono text-[10px] select-all' : ''}`}>{value}</span>
      </div>
    </div>
  );
}
