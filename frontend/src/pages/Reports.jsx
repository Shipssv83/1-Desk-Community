import React, { useState, useEffect, useCallback, useMemo } from 'react';
import apiClient from '../api/client';
import ChannelIcon from '../components/ui/ChannelIcon';
import {
  MessageSquare, Star, TrendingUp, TrendingDown,
  Download, BarChart3, PieChart, Loader2, Users, CheckCircle2
} from 'lucide-react';

// ── helpers ──────────────────────────────────────────────────────────────────
const isoDate = (d) => d.toISOString().slice(0, 10);
const PRESETS = { today: 'Сегодня', d7: '7 дней', d30: '30 дней', d90: '90 дней' };
const PRESET_DAYS = { today: 1, d7: 7, d30: 30, d90: 90 };

function rangeFor(key) {
  const now = new Date();
  const to = isoDate(now);
  const days = PRESET_DAYS[key];
  return { from: isoDate(new Date(+now - (days - 1) * 86400000)), to, days };
}
// Previous equal-length window, immediately before `from`.
function prevRange(from, days) {
  const f = new Date(from + 'T00:00:00');
  return { from: isoDate(new Date(+f - days * 86400000)), to: isoDate(new Date(+f - 86400000)) };
}

const BAR_PALETTE = ['#3B82F6', '#38BDF8', '#14B8A6', '#22C55E', '#F59E0B', '#A855F7', '#EF4444', '#6366F1'];
const DONUT_PALETTE = ['#3B82F6', '#22C55E', '#171717', '#F59E0B', '#A855F7', '#EF4444', '#14B8A6'];
const WD = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

function pctChange(cur, prev) {
  if (!prev) return cur > 0 ? 100 : 0;
  return Math.round(((cur - prev) / prev) * 100);
}

// ── KPI card ─────────────────────────────────────────────────────────────────
function Kpi({ label, value, unit, delta, deltaLabel, good, icon, tone }) {
  const tones = {
    teal:  'text-teal-500 bg-teal-500/10 border-teal-500/20',
    blue:  'text-blue-500 bg-blue-500/10 border-blue-500/20',
    amber: 'text-amber-500 bg-amber-500/10 border-amber-500/20',
    red:   'text-red-500 bg-red-500/10 border-red-500/20',
  };
  const up = delta >= 0;
  const positive = good === undefined ? up : (good ? up : !up);
  return (
    <div className={`relative p-5 bg-platform-surface border rounded-[14px] overflow-hidden ${tones[tone]?.split(' ')[2] || 'border-platform-border'}`}>
      <div className="flex items-start justify-between">
        <span className="text-[11px] font-bold uppercase tracking-wider text-platform-text-muted">{label}</span>
        <div className={`p-2 rounded-[10px] border ${tones[tone] || 'text-platform-accent bg-platform-accent/10 border-platform-border'}`}>{icon}</div>
      </div>
      <div className="mt-3 flex items-baseline gap-1">
        <span className={`text-[32px] leading-none font-bold ${tones[tone]?.split(' ')[0] || 'text-platform-text-primary'}`}>{value}</span>
        {unit && <span className="text-sm font-semibold text-platform-text-muted">{unit}</span>}
      </div>
      <div className={`mt-2.5 flex items-center gap-1 text-xs font-semibold ${positive ? 'text-emerald-500' : 'text-red-500'}`}>
        {up ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
        {up ? '+' : ''}{delta}% <span className="text-platform-text-muted font-normal">{deltaLabel}</span>
      </div>
    </div>
  );
}

// ── colorful bar chart ───────────────────────────────────────────────────────
function BarChart({ series }) {
  const [hover, setHover] = useState(null);
  const max = Math.max(1, ...series.map((d) => d.new_conversations));
  if (series.length === 0) return <div className="h-56 flex items-center justify-center text-xs text-platform-text-muted italic">Нет данных за период.</div>;
  return (
    <div className="relative">
      <div className="flex items-end justify-between gap-2 h-56 pt-4">
        {series.map((d, i) => {
          const h = Math.max(4, (d.new_conversations / max) * 100);
          const color = BAR_PALETTE[i % BAR_PALETTE.length];
          const wd = WD[new Date(d.day + 'T00:00:00').getDay()];
          return (
            <div key={d.day} className="flex-1 flex flex-col items-center justify-end h-full min-w-0"
              onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              {hover === i && (
                <div className="mb-1 px-2 py-1 rounded-md bg-platform-text-primary text-platform-bg text-[10px] font-bold whitespace-nowrap">
                  {d.new_conversations}
                </div>
              )}
              <div className="w-full max-w-[44px] rounded-t-[8px] transition-all duration-300"
                style={{ height: `${h}%`, background: color, opacity: hover === null || hover === i ? 1 : 0.55 }} />
              <span className="text-[10px] text-platform-text-muted mt-2">{wd}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── donut ────────────────────────────────────────────────────────────────────
function Donut({ data, total }) {
  const R = 52, C = 2 * Math.PI * R;
  let offset = 0;
  return (
    <div className="flex items-center gap-6">
      <div className="relative shrink-0">
        <svg width="140" height="140" viewBox="0 0 140 140" className="-rotate-90">
          <circle cx="70" cy="70" r={R} fill="none" stroke="rgb(var(--platform-border-rgb))" strokeWidth="16" />
          {data.map((seg, i) => {
            const frac = total > 0 ? seg.value / total : 0;
            const dash = frac * C;
            const el = (
              <circle key={i} cx="70" cy="70" r={R} fill="none"
                stroke={DONUT_PALETTE[i % DONUT_PALETTE.length]} strokeWidth="16"
                strokeDasharray={`${dash} ${C - dash}`} strokeDashoffset={-offset}
                className="transition-all duration-500" />
            );
            offset += dash;
            return el;
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xl font-bold text-platform-text-primary">100%</span>
        </div>
      </div>
      <div className="space-y-2.5 flex-1 min-w-0">
        {data.map((seg, i) => (
          <div key={i} className="flex items-center justify-between gap-2 text-sm">
            <div className="flex items-center gap-2 min-w-0">
              <span className="w-3 h-3 rounded-[3px] shrink-0" style={{ background: DONUT_PALETTE[i % DONUT_PALETTE.length] }} />
              <span className="text-platform-text-secondary truncate">{seg.label}</span>
            </div>
            <span className="font-bold text-platform-text-primary">{total > 0 ? Math.round((seg.value / total) * 100) : 0}%</span>
          </div>
        ))}
        {data.length === 0 && <span className="text-xs text-platform-text-muted italic">Нет источников.</span>}
      </div>
    </div>
  );
}

// ── main ─────────────────────────────────────────────────────────────────────
export default function Reports() {
  const [preset, setPreset] = useState('d7');
  const [stats, setStats] = useState(null);
  const [prev, setPrev] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async (key) => {
    setLoading(true);
    const r = rangeFor(key);
    const p = prevRange(r.from, r.days);
    try {
      const [cur, old] = await Promise.all([
        apiClient.get('/dashboard/stats', { params: { from: r.from, to: r.to } }),
        apiClient.get('/dashboard/stats', { params: { from: p.from, to: p.to } }),
      ]);
      setStats(cur.data);
      setPrev(old.data);
    } catch (err) {
      console.error('Reports fetch error:', err);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAll(preset); }, [preset, fetchAll]);

  const s = stats?.summary ?? {};
  const ps = prev?.summary ?? {};
  const series = stats?.time_series ?? [];
  const inboxes = stats?.inbox_breakdown ?? [];
  const days = PRESET_DAYS[preset];

  const convsPerDay = useMemo(() => (s.total_conversations ? (s.total_conversations / days).toFixed(1) : '0'), [s, days]);
  const prevPerDay = ps.total_conversations ? ps.total_conversations / days : 0;
  const resolutionRate = s.total_conversations ? Math.round((s.resolved_conversations / s.total_conversations) * 100) : 0;
  const prevResolution = ps.total_conversations ? Math.round((ps.resolved_conversations / ps.total_conversations) * 100) : 0;

  const donutData = [...inboxes]
    .filter((i) => i.total_conversations > 0)
    .sort((a, b) => b.total_conversations - a.total_conversations)
    .map((i) => ({ label: i.name, value: i.total_conversations }));
  const donutTotal = donutData.reduce((a, b) => a + b.value, 0);

  return (
    <div className="flex-1 overflow-y-auto bg-platform-bg">
      <div className="max-w-7xl mx-auto p-6 lg:p-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-7">
          <div>
            <h1 className="text-[26px] font-bold tracking-tight text-platform-text-primary">Отчёты</h1>
            <p className="text-sm text-platform-text-secondary mt-1">Анализ эффективности работы службы поддержки</p>
          </div>
          <button onClick={() => window.print()}
            className="flex items-center gap-2 px-4 py-2.5 bg-platform-surface border border-platform-border text-sm font-semibold rounded-[10px] text-platform-text-primary hover:border-platform-accent hover:text-platform-accent transition-colors shrink-0">
            <Download size={16} /> Экспорт PDF
          </button>
        </div>

        {/* Period tabs */}
        <div className="flex items-center gap-1 mb-7 border-b border-platform-border">
          {Object.entries(PRESETS).map(([k, label]) => (
            <button key={k} onClick={() => setPreset(k)}
              className={`px-4 py-2.5 text-sm font-semibold -mb-px border-b-2 transition-colors ${
                preset === k ? 'border-platform-accent text-platform-text-primary' : 'border-transparent text-platform-text-muted hover:text-platform-text-secondary'
              }`}>
              {label}
            </button>
          ))}
          {loading && <Loader2 size={15} className="animate-spin text-platform-text-muted ml-2" />}
        </div>

        {/* KPI cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <Kpi label="Диалогов в день" value={convsPerDay} delta={pctChange(+convsPerDay, prevPerDay)} deltaLabel="к прошлому периоду"
            tone="blue" icon={<MessageSquare size={18} />} good />
          <Kpi label="Всего диалогов" value={s.total_conversations ?? 0} delta={pctChange(s.total_conversations, ps.total_conversations)} deltaLabel="к прошлому периоду"
            tone="teal" icon={<TrendingUp size={18} />} good />
          <Kpi label="Решено" value={resolutionRate} unit="%" delta={resolutionRate - prevResolution} deltaLabel="п.п."
            tone="amber" icon={<CheckCircle2 size={18} />} good />
          <Kpi label="Сообщений" value={s.total_messages ?? 0} delta={pctChange(s.total_messages, ps.total_messages)} deltaLabel="к прошлому периоду"
            tone="red" icon={<Star size={18} />} good />
        </div>

        {/* Bars + donut */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-5">
          <div className="lg:col-span-2 bg-platform-surface border border-platform-border rounded-[14px] p-6">
            <h3 className="text-base font-bold text-platform-text-primary mb-1 flex items-center gap-2"><BarChart3 size={17} className="text-platform-accent" /> Динамика входящих обращений</h3>
            <p className="text-xs text-platform-text-muted mb-2">Новые диалоги по дням</p>
            <BarChart series={series} />
          </div>
          <div className="bg-platform-surface border border-platform-border rounded-[14px] p-6">
            <h3 className="text-base font-bold text-platform-text-primary mb-5 flex items-center gap-2"><PieChart size={17} className="text-platform-accent" /> Обращения по источникам</h3>
            <Donut data={donutData} total={donutTotal} />
          </div>
        </div>

        {/* Channel breakdown + resolution */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2 bg-platform-surface border border-platform-border rounded-[14px] p-6">
            <h3 className="text-base font-bold text-platform-text-primary mb-5 flex items-center gap-2"><Users size={17} className="text-platform-accent" /> Трафик по каналам</h3>
            {inboxes.length === 0 ? (
              <div className="py-8 text-center text-platform-text-muted italic text-xs">Каналы не настроены.</div>
            ) : (
              <div className="space-y-4">
                {[...inboxes].sort((a, b) => b.total_conversations - a.total_conversations).map((ib, i) => {
                  const pct = donutTotal > 0 ? Math.round((ib.total_conversations / donutTotal) * 100) : 0;
                  return (
                    <div key={ib.id} className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <ChannelIcon channelType={ib.channel_type} size={14} />
                          <span className="font-medium text-platform-text-primary">{ib.name}</span>
                        </div>
                        <span className="font-semibold text-platform-text-primary">{ib.total_conversations} <span className="text-platform-accent">({pct}%)</span></span>
                      </div>
                      <div className="w-full bg-platform-bg h-2 rounded-full overflow-hidden border border-platform-border/40">
                        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: BAR_PALETTE[i % BAR_PALETTE.length] }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="bg-platform-surface border border-platform-border rounded-[14px] p-6 flex flex-col">
            <h3 className="text-base font-bold text-platform-text-primary mb-4 flex items-center gap-2"><CheckCircle2 size={17} className="text-platform-accent" /> Решённость</h3>
            <div className="flex-1 flex flex-col items-center justify-center">
              <div className="relative">
                <svg className="w-32 h-32 -rotate-90">
                  <circle cx="64" cy="64" r="48" stroke="rgb(var(--platform-border-rgb))" strokeWidth="10" fill="none" />
                  <circle cx="64" cy="64" r="48" stroke="rgb(var(--platform-accent-rgb))" strokeWidth="10" fill="none"
                    strokeDasharray={2 * Math.PI * 48} strokeDashoffset={2 * Math.PI * 48 * (1 - resolutionRate / 100)}
                    strokeLinecap="round" className="transition-all duration-500" />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-2xl font-bold text-platform-text-primary">{resolutionRate}%</span>
                  <span className="text-[9px] uppercase font-bold text-platform-text-muted">решено</span>
                </div>
              </div>
              <div className="w-full space-y-2 mt-5 pt-4 border-t border-platform-border/30">
                <div className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-2 text-platform-text-secondary"><span className="w-2.5 h-2.5 rounded-full bg-emerald-400" /> Открытых</span>
                  <span className="font-semibold text-platform-text-primary">{s.open_conversations ?? 0}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-2 text-platform-text-secondary"><span className="w-2.5 h-2.5 rounded-full bg-platform-accent" /> Решено</span>
                  <span className="font-semibold text-platform-text-primary">{s.resolved_conversations ?? 0}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
