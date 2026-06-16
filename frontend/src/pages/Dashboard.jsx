import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import apiClient from '../api/client';
import { useAuthStore } from '../store/authStore';
import ChannelIcon from '../components/ui/ChannelIcon';
import {
  MessageSquare, Users, Inbox, Clock, RefreshCw, Bot, Plug, Database,
  UserCog, Target, CheckCircle2, ChevronRight, BarChart3, Workflow, Sparkles
} from 'lucide-react';

const KIND_META = {
  crm:            { label: 'CRM', icon: Database, color: 'text-emerald-400' },
  agent:          { label: 'AI-агенты', icon: Sparkles, color: 'text-violet-400' },
  conversational: { label: 'Чат-боты', icon: Bot, color: 'text-teal-400' },
  workflow:       { label: 'Автоматизации', icon: Workflow, color: 'text-amber-400' },
  channel:        { label: 'Каналы', icon: Inbox, color: 'text-blue-400' },
};

export default function Dashboard() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'admin';
  const [ov, setOv] = useState(null);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [o, s] = await Promise.all([
        apiClient.get('/dashboard/overview'),
        apiClient.get('/dashboard/stats'),
      ]);
      setOv(o.data);
      setStats(s.data);
    } catch (err) {
      console.error('Error fetching dashboard:', err);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-platform-bg">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-platform-accent border-t-transparent" />
      </div>
    );
  }

  const c = ov?.counts || {};
  const breakdown = stats?.inbox_breakdown || [];
  const byKind = ov?.integrations_by_kind || {};
  const bots = ov?.bots || [];

  // KPI cards — each navigates to the relevant page. adminOnly hidden for operators.
  const cards = [
    { label: 'Диалоги', value: c.conversations, sub: `${c.open || 0} открытых`, icon: MessageSquare, tone: 'accent', to: '/app/conversations' },
    { label: 'Контакты', value: c.contacts, sub: 'клиентов в базе', icon: Users, tone: 'blue', to: '/app/contacts' },
    { label: 'Сообщения', value: c.messages, sub: 'всего обработано', icon: Inbox, tone: 'purple', to: '/app/reports' },
    { label: 'Решено', value: c.resolved, sub: `${c.pending || 0} в ожидании`, icon: CheckCircle2, tone: 'green', to: '/app/conversations' },
    { label: 'Команда', value: c.operators, sub: `${c.admins || 0} админ.`, icon: UserCog, tone: 'amber', to: '/app/settings/operators', adminOnly: true },
    { label: 'AI-боты', value: c.bots, sub: 'подключено', icon: Bot, tone: 'teal', to: '/app/bots', adminOnly: true },
    { label: 'Каналы', value: c.channels, sub: 'источников', icon: Inbox, tone: 'blue', to: '/app/inboxes', adminOnly: true },
  ].filter((card) => !card.adminOnly || isAdmin);

  const tones = {
    accent: 'bg-platform-accent/10 text-platform-accent',
    blue: 'bg-blue-500/10 text-blue-400',
    purple: 'bg-purple-500/10 text-purple-400',
    green: 'bg-emerald-500/10 text-emerald-400',
    amber: 'bg-amber-500/10 text-amber-400',
    teal: 'bg-teal-500/10 text-teal-400',
  };

  return (
    <div className="flex-1 overflow-y-auto bg-platform-bg">
      <div className="max-w-7xl mx-auto p-6 lg:p-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-7">
          <div>
            <h1 className="text-[26px] font-bold tracking-tight text-platform-text-primary">Дашборд</h1>
            <p className="text-sm text-platform-text-secondary mt-1">Обзор платформы — нажмите карточку, чтобы перейти к разделу</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => navigate('/app/reports')}
              className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-platform-surface border border-platform-border rounded-button text-platform-text-primary hover:text-platform-accent hover:border-platform-accent transition-colors">
              <BarChart3 size={14} /> Аналитика
            </button>
            <button onClick={fetchAll}
              className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-platform-surface hover:bg-platform-surface-raised border border-platform-border rounded-button text-platform-text-primary hover:text-platform-accent transition-all active:scale-95">
              <RefreshCw size={14} /> Обновить
            </button>
          </div>
        </div>

        {/* KPI cards — clickable */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {cards.map((card) => (
            <button key={card.label} onClick={() => navigate(card.to)}
              className="group text-left p-5 bg-platform-surface border border-platform-border rounded-[14px] hover:border-platform-accent/40 hover:-translate-y-0.5 transition-all duration-150 active:scale-[0.99]">
              <div className="flex items-start justify-between">
                <span className="text-xs font-semibold text-platform-text-secondary">{card.label}</span>
                <div className={`p-2 rounded-[10px] ${tones[card.tone]}`}><card.icon size={17} /></div>
              </div>
              <h3 className="text-[28px] leading-none font-bold text-platform-text-primary mt-3 group-hover:text-platform-accent transition-colors">{card.value ?? 0}</h3>
              <span className="text-[11px] text-platform-text-muted mt-1.5 block">{card.sub}</span>
            </button>
          ))}
        </div>

        {/* Connected systems (admin) */}
        {isAdmin && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-6">
            {/* Integrations by kind */}
            <div className="bg-platform-surface border border-platform-border rounded-[14px] p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-bold text-platform-text-primary flex items-center gap-2"><Plug size={17} className="text-platform-accent" /> Подключённые системы</h2>
                <button onClick={() => navigate('/app/integrations')} className="text-xs text-platform-text-muted hover:text-platform-accent flex items-center gap-0.5">Все <ChevronRight size={13} /></button>
              </div>
              {Object.keys(byKind).length === 0 ? (
                <button onClick={() => navigate('/app/integrations')} className="w-full py-8 text-center text-platform-text-muted italic text-sm border border-dashed border-platform-border rounded-[10px] hover:border-platform-accent hover:text-platform-accent transition-colors">
                  Ничего не подключено — добавить интеграцию +
                </button>
              ) : (
                <div className="space-y-3">
                  {Object.entries(byKind).map(([kind, data]) => {
                    const meta = KIND_META[kind] || { label: kind, icon: Plug, color: 'text-platform-text-muted' };
                    const to = '/app/integrations';
                    return (
                      <button key={kind} onClick={() => navigate(to)}
                        className="w-full flex items-center justify-between p-3 bg-platform-bg/50 border border-platform-border/60 rounded-[10px] hover:border-platform-accent/40 transition-colors group">
                        <div className="flex items-center gap-3 min-w-0">
                          <meta.icon size={18} className={meta.color} />
                          <div className="min-w-0 text-left">
                            <div className="text-sm font-semibold text-platform-text-primary">{meta.label}</div>
                            <div className="text-[11px] text-platform-text-muted truncate">{data.providers.map((p) => p.provider).join(', ')}</div>
                          </div>
                        </div>
                        <span className="text-xs font-bold text-platform-text-secondary shrink-0">{data.active}/{data.total} <span className="text-emerald-400">akt.</span></span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* AI bots */}
            <div className="bg-platform-surface border border-platform-border rounded-[14px] p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-bold text-platform-text-primary flex items-center gap-2"><Bot size={17} className="text-teal-400" /> AI-боты</h2>
                <button onClick={() => navigate('/app/bots')} className="text-xs text-platform-text-muted hover:text-platform-accent flex items-center gap-0.5">Управление <ChevronRight size={13} /></button>
              </div>
              {bots.length === 0 ? (
                <button onClick={() => navigate('/app/bots')} className="w-full py-8 text-center text-platform-text-muted italic text-sm border border-dashed border-platform-border rounded-[10px] hover:border-platform-accent hover:text-platform-accent transition-colors">
                  Ботов нет — добавить +
                </button>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {bots.map((b) => (
                    <button key={b.id} onClick={() => navigate('/app/bots')}
                      className="flex items-center gap-2 p-2.5 bg-platform-bg/50 border border-platform-border/60 rounded-[10px] hover:border-platform-accent/40 transition-colors min-w-0">
                      <div className="w-7 h-7 rounded-full bg-teal-500/12 text-teal-400 flex items-center justify-center shrink-0"><Bot size={14} /></div>
                      <span className="text-xs font-medium text-platform-text-primary truncate">{b.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Channels table */}
        <div className="bg-platform-surface border border-platform-border rounded-[14px] p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-bold text-platform-text-primary flex items-center gap-2"><Inbox size={17} className="text-blue-400" /> Активные каналы</h2>
            {isAdmin && <button onClick={() => navigate('/app/inboxes')} className="text-xs text-platform-text-muted hover:text-platform-accent flex items-center gap-0.5">Настроить <ChevronRight size={13} /></button>}
          </div>
          {breakdown.length === 0 ? (
            <button onClick={() => isAdmin && navigate('/app/inboxes')} className="w-full py-10 text-center text-platform-text-muted italic text-sm">
              Каналы не настроены{isAdmin ? ' — добавить +' : ''}.
            </button>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-platform-border/40 text-platform-text-muted text-[11px] uppercase font-bold tracking-wider">
                    <th className="py-3 px-3">Канал</th>
                    <th className="py-3 px-3">Тип</th>
                    <th className="py-3 px-3">Диалогов</th>
                    <th className="py-3 px-3">Открытых</th>
                    <th className="py-3 px-3">Решено</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-platform-border/30 text-sm">
                  {breakdown.map((ib) => (
                    <tr key={ib.id} onClick={() => navigate(`/app/conversations?inbox_id=${ib.id}`)}
                      className="hover:bg-platform-surface-raised/40 transition-colors cursor-pointer">
                      <td className="py-3.5 px-3 font-medium text-platform-text-primary">{ib.name}</td>
                      <td className="py-3.5 px-3">
                        <div className="flex items-center gap-2"><ChannelIcon channelType={ib.channel_type} size={16} /><span className="capitalize text-platform-text-secondary">{ib.channel_type}</span></div>
                      </td>
                      <td className="py-3.5 px-3 text-platform-text-primary font-semibold">{ib.total_conversations}</td>
                      <td className="py-3.5 px-3"><span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-teal-500/10 text-teal-400">{ib.open_conversations}</span></td>
                      <td className="py-3.5 px-3 text-platform-text-muted">{ib.resolved_conversations}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
