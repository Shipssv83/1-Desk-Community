import React, { useState, useEffect } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import apiClient from '../../api/client';
import ChannelIcon from '../ui/ChannelIcon';
import { useTheme } from '../../hooks/useTheme';
import { useLang } from '../../hooks/useLang';
import {
  LayoutDashboard, Users, Bot, Inbox, BarChart3, Plug,
  Settings, MessageSquare, ChevronsLeft, ChevronsRight, ChevronDown, ChevronRight,
  Building2, LogOut, Sun, Moon, User
} from 'lucide-react';

const COLLAPSE_KEY = 'onedesk_sidebar_collapsed';

const i18n = {
  en: {
    dashboard: 'Dashboard', contacts: 'Contacts', bots: 'Bots', channels: 'Channels',
    automations: 'Automations', analytics: 'Analytics', integrations: 'Integrations',
    widget: 'Widget builder',
    billing: 'Billing', settings: 'Settings', conversations: 'Conversations',
    crm: 'External CRM', noCrm: 'No CRM connected',
    chats: 'Chats & Channels', noSources: 'No channels', lightMode: 'Light mode',
    darkMode: 'Dark mode', logout: 'Sign out', admin: 'Admin', operator: 'Operator',
  },
  ru: {
    dashboard: 'Дашборд', contacts: 'Контакты', bots: 'Боты', channels: 'Каналы',
    automations: 'Автоматизации', analytics: 'Аналитика', integrations: 'Интеграции',
    widget: 'Конструктор виджета',
    billing: 'Биллинг', settings: 'Настройки', conversations: 'Диалоги',
    crm: 'Внешние CRM', noCrm: 'Нет CRM',
    chats: 'Чаты и каналы', noSources: 'Нет каналов', lightMode: 'Светлая тема',
    darkMode: 'Тёмная тема', logout: 'Выйти', admin: 'Админ', operator: 'Оператор',
  },
};

export default function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, clearUser } = useAuthStore();
  const { theme, toggleTheme } = useTheme();
  const { lang } = useLang();
  const t = i18n[lang] || i18n.en;
  const isAdmin = user?.role === 'admin';

  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(COLLAPSE_KEY) === '1');
  const [inboxes, setInboxes] = useState([]);
  const [org, setOrg] = useState(null);
  const [chatsOpen, setChatsOpen] = useState(true);

  useEffect(() => { localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0'); }, [collapsed]);

  useEffect(() => {
    if (!user) return;
    apiClient.get('/inboxes')
      .then((r) => setInboxes(Array.isArray(r.data) ? r.data : (r.data.items || [])))
      .catch(() => {});
    apiClient.get('/organizations/me')
      .then((r) => setOrg(r.data))
      .catch(() => {});
  }, [user, location.pathname, isAdmin]);

  const handleLogout = async () => {
    try { await apiClient.post('/auth/logout'); } catch { /* ignore */ }
    clearUser();
    navigate('/login');
  };

  // Main work-tool sections. adminOnly hidden from operators.
  const mainNav = [
    { key: 'dashboard', label: t.dashboard, icon: LayoutDashboard, path: '/app', end: true },
    { key: 'conversations', label: t.conversations, icon: MessageSquare, path: '/app/conversations' },
    { key: 'contacts', label: t.contacts, icon: Users, path: '/app/contacts' },
    { key: 'bots', label: t.bots, icon: Bot, path: '/app/bots', adminOnly: true },
    { key: 'channels', label: t.channels, icon: Inbox, path: '/app/inboxes', adminOnly: true },
    { key: 'analytics', label: t.analytics, icon: BarChart3, path: '/app/reports', adminOnly: true },
    { key: 'integrations', label: t.integrations, icon: Plug, path: '/app/integrations', adminOnly: true },
  ].filter((i) => !i.adminOnly || isAdmin);

  const width = collapsed ? 'w-[64px]' : 'w-[232px]';

  const NavItem = ({ item }) => (
    <NavLink
      to={item.path}
      end={item.end}
      title={collapsed ? item.label : undefined}
      className={({ isActive }) =>
        `flex items-center rounded-button transition-all duration-150 relative ${
          collapsed ? 'justify-center px-0 py-2.5' : 'gap-3 px-3 py-2.5'
        } ${
          isActive
            ? 'bg-platform-accent/10 text-platform-accent active-nav-border'
            : 'text-platform-text-secondary hover:bg-platform-surface-raised hover:text-platform-text-primary'
        }`
      }
    >
      <item.icon size={20} strokeWidth={1.75} className="shrink-0" />
      {!collapsed && <span className="text-[13px] font-medium truncate">{item.label}</span>}
    </NavLink>
  );

  return (
    <aside className={`flex flex-col h-full ${width} bg-platform-sidebar border-r border-platform-border shrink-0 select-none transition-[width] duration-200`}>
      {/* ── Workspace / org switcher ─────────────────────────── */}
      <div className={`flex items-center border-b border-platform-border/40 ${collapsed ? 'justify-center px-2 py-3' : 'gap-2.5 px-3 py-3'}`}>
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] bg-platform-accent text-white font-bold text-sm">
          O
        </div>
        {!collapsed && (
          <button
            onClick={() => isAdmin && navigate('/app/settings')}
            className="flex items-center gap-1.5 min-w-0 flex-1 text-left group"
            title={org?.name || '1-Desk'}
          >
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-semibold text-platform-text-primary truncate">
                {org?.name || '1-Desk'}
              </div>
              <div className="text-[10px] text-platform-text-muted capitalize truncate">
                {org?.plan_key ? `${org.plan_key} plan` : ''}
              </div>
            </div>
            <Building2 size={14} className="text-platform-text-muted group-hover:text-platform-accent shrink-0" />
          </button>
        )}
      </div>

      {/* ── Main navigation ──────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden px-2 py-3 space-y-1">
        <nav className="space-y-1">
          {mainNav.map((item) => <NavItem key={item.key} item={item} />)}
        </nav>

        {/* ── Chats & channels (grouped lower) ───────────────── */}
        <div className="pt-3 mt-2 border-t border-platform-border/30">
          {!collapsed ? (
            <button
              onClick={() => setChatsOpen(!chatsOpen)}
              className="flex items-center justify-between w-full px-2.5 py-1.5 text-[10px] font-bold tracking-wider text-platform-text-muted uppercase hover:text-platform-text-secondary transition-colors"
            >
              <span>{t.chats}</span>
              {chatsOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            </button>
          ) : (
            <div className="flex justify-center py-1.5" title={t.chats}>
              <MessageSquare size={16} className="text-platform-text-muted" />
            </div>
          )}

          {chatsOpen && (
            <div className={`space-y-0.5 ${collapsed ? '' : 'pl-1'}`}>
              {inboxes.map((inbox) => (
                <button
                  key={inbox.id}
                  onClick={() => navigate(`/app/conversations?inbox_id=${inbox.id}`)}
                  title={collapsed ? inbox.name : undefined}
                  className={`flex items-center w-full rounded-button text-platform-text-secondary hover:bg-platform-surface-raised hover:text-platform-text-primary transition-colors ${
                    collapsed ? 'justify-center px-0 py-2' : 'gap-2 px-2.5 py-1.5 text-xs text-left'
                  }`}
                >
                  <ChannelIcon channelType={inbox.channel_type} size={collapsed ? 18 : 15} className="shrink-0" />
                  {!collapsed && <span className="truncate">{inbox.name}</span>}
                </button>
              ))}
              {inboxes.length === 0 && !collapsed && (
                <span className="block px-2.5 py-1.5 text-[10px] text-platform-text-muted italic">{t.noSources}</span>
              )}
            </div>
          )}
        </div>

      </div>

      {/* ── Bottom: profile + theme + settings + collapse ────── */}
      <div className="border-t border-platform-border/40 p-2 space-y-1">
        {user && (
          <button
            onClick={() => navigate('/app/settings/profile')}
            title={collapsed ? user.name : undefined}
            className={`flex items-center w-full rounded-button hover:bg-platform-surface-raised transition-colors ${
              collapsed ? 'justify-center px-0 py-2' : 'gap-2 px-2 py-2'
            }`}
          >
            {user.avatarUrl ? (
              <img src={user.avatarUrl} alt={user.name} className="h-7 w-7 shrink-0 rounded-full object-cover border border-platform-border" />
            ) : (
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-platform-border text-platform-accent">
                <User size={14} />
              </div>
            )}
            {!collapsed && (
              <div className="flex flex-col min-w-0 text-left">
                <span className="text-[11px] font-semibold text-platform-text-primary truncate">{user.name}</span>
                <span className="text-[9px] text-platform-text-muted capitalize">{isAdmin ? t.admin : t.operator}</span>
              </div>
            )}
          </button>
        )}

        <NavLink
          to="/app/settings"
          end
          title={collapsed ? t.settings : undefined}
          className={({ isActive }) =>
            `flex items-center rounded-button transition-colors ${collapsed ? 'justify-center px-0 py-2.5' : 'gap-3 px-3 py-2.5'} ${
              isActive ? 'bg-platform-accent/10 text-platform-accent' : 'text-platform-text-secondary hover:bg-platform-surface-raised hover:text-platform-text-primary'
            }`
          }
        >
          <Settings size={20} strokeWidth={1.75} className="shrink-0" />
          {!collapsed && <span className="text-[13px] font-medium">{t.settings}</span>}
        </NavLink>

        <button
          onClick={toggleTheme}
          title={collapsed ? (theme === 'dark' ? t.lightMode : t.darkMode) : undefined}
          className={`flex items-center w-full rounded-button text-platform-text-secondary hover:bg-platform-surface-raised hover:text-platform-text-primary transition-colors ${collapsed ? 'justify-center px-0 py-2.5' : 'gap-3 px-3 py-2.5'}`}
        >
          {theme === 'dark' ? <Sun size={20} strokeWidth={1.75} /> : <Moon size={20} strokeWidth={1.75} />}
          {!collapsed && <span className="text-[13px] font-medium">{theme === 'dark' ? t.lightMode : t.darkMode}</span>}
        </button>

        <button
          onClick={handleLogout}
          title={collapsed ? t.logout : undefined}
          className={`flex items-center w-full rounded-button text-red-400 hover:bg-red-500/10 transition-colors ${collapsed ? 'justify-center px-0 py-2.5' : 'gap-3 px-3 py-2.5'}`}
        >
          <LogOut size={20} strokeWidth={1.75} />
          {!collapsed && <span className="text-[13px] font-medium">{t.logout}</span>}
        </button>

        <button
          onClick={() => setCollapsed((c) => !c)}
          className={`flex items-center w-full rounded-button text-platform-text-muted hover:bg-platform-surface-raised hover:text-platform-text-primary transition-colors ${collapsed ? 'justify-center px-0 py-2' : 'gap-3 px-3 py-2'}`}
          title={collapsed ? 'Expand' : 'Collapse'}
        >
          {collapsed ? <ChevronsRight size={18} /> : <ChevronsLeft size={18} />}
          {!collapsed && <span className="text-[12px]">Collapse</span>}
        </button>
      </div>
    </aside>
  );
}
