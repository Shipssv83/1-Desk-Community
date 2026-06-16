import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import apiClient from '../../api/client';
import { useTheme } from '../../hooks/useTheme';
import { MessageSquare, Sun, Moon, User, LogOut } from 'lucide-react';

export default function MobileTopbar() {
  const navigate = useNavigate();
  const { user, clearUser } = useAuthStore();
  const { theme, toggleTheme } = useTheme();

  const handleLogout = async () => {
    try {
      await apiClient.post('/auth/logout');
    } catch (err) {
      console.error('Error during logout:', err);
    } finally {
      clearUser();
      navigate('/login');
    }
  };

  return (
    <header
      className="flex items-center justify-between px-4 shrink-0 bg-platform-sidebar border-b border-platform-border"
      style={{ height: 50 }}
    >
      {/* Logo */}
      <div className="flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-[6px] bg-platform-accent text-white font-bold text-sm">
          O
        </div>
        <span className="font-sans text-sm font-semibold tracking-wide text-platform-text-primary">
          1-Desk
        </span>
      </div>

      {/* Right controls */}
      <div className="flex items-center gap-1">
        <button
          onClick={toggleTheme}
          className="flex h-8 w-8 items-center justify-center rounded-button text-platform-text-secondary hover:bg-platform-surface-raised transition-colors"
          aria-label="Toggle theme"
        >
          {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        </button>

        {user && (
          <div className="flex items-center gap-1 ml-1">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-platform-border text-platform-accent">
              <User size={14} />
            </div>
            <button
              onClick={handleLogout}
              className="flex h-8 w-8 items-center justify-center rounded-button text-red-400 hover:bg-red-500/10 transition-colors"
              aria-label="Logout"
            >
              <LogOut size={16} />
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
