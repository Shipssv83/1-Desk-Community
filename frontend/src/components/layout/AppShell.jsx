import React from 'react';
import Sidebar from './Sidebar';
import MobileTopbar from './MobileTopbar';
import MobileBottomNav from './MobileBottomNav';
import NotificationCenter from '../NotificationCenter';

export default function AppShell({ children }) {
  return (
    <div className="flex h-screen w-screen bg-platform-bg text-platform-text-primary overflow-hidden">
      {/* Sidebar — desktop only (≥ 768px) */}
      <div className="hidden md:flex">
        <Sidebar />
      </div>

      {/* Column: topbar + content + bottom-nav for mobile/tablet */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* Topbar — tablet + mobile (< 768px) */}
        <div className="md:hidden">
          <MobileTopbar />
        </div>

        {/* Main content */}
        <main className="flex-1 flex flex-col overflow-hidden bg-platform-bg">
          {children}
        </main>

        {/* Bottom nav — mobile only (< 768px) */}
        <div className="md:hidden">
          <MobileBottomNav />
        </div>
      </div>

      {/* App-wide operator notifications (sound, toast, tab counter, desktop push) */}
      <NotificationCenter />
    </div>
  );
}
