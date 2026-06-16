import React from 'react';
import { NavLink } from 'react-router-dom';
import { useLang } from '../../hooks/useLang';
import { MessageSquare, Users, BarChart3, Settings } from 'lucide-react';

const NAV_DEFS = [
  { to: '/app/conversations', icon: MessageSquare, key: 'conversations' },
  { to: '/app/contacts',      icon: Users,         key: 'contacts'      },
  { to: '/app/reports',       icon: BarChart3,     key: 'reports'       },
  { to: '/app/settings',      icon: Settings,      key: 'settings'      },
];

const labels = {
  en: { conversations: 'Chats', contacts: 'Contacts', reports: 'Reports', settings: 'Settings' },
  ru: { conversations: 'Диалоги', contacts: 'Контакты', reports: 'Отчёты', settings: 'Настройки' },
};

export default function MobileBottomNav() {
  const { lang } = useLang();
  const t = labels[lang] || labels.en;

  return (
    <nav
      className="flex items-stretch bg-platform-sidebar border-t border-platform-border shrink-0"
      style={{ height: 56 }}
    >
      {NAV_DEFS.map(({ to, icon: Icon, key }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) =>
            `flex flex-1 flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors ${
              isActive
                ? 'text-platform-accent'
                : 'text-platform-text-muted hover:text-platform-text-secondary'
            }`
          }
        >
          {({ isActive }) => (
            <>
              <Icon size={20} strokeWidth={isActive ? 2.5 : 2} />
              <span>{t[key]}</span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}
