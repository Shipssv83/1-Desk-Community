import React from 'react';
import { useNavigate } from 'react-router-dom';
import { User, Users, ChevronRight, ArrowLeft } from 'lucide-react';
import { useAuthStore } from '../store/authStore';

// adminOnly sections are hidden from operators, who may only edit their own
// profile and otherwise just view chats and reply.
// Channels and Bots live in the left sidebar — not duplicated here.
const sections = [
  { title: 'Profile & Security', description: 'Edit your name, avatar, bio and change your password.', icon: <User className="text-blue-400" size={22} />, path: '/app/settings/profile' },
  { title: 'Operators', description: 'Create operator accounts and manage their access.', icon: <Users className="text-amber-400" size={22} />, path: '/app/settings/operators', adminOnly: true },
];

export default function Settings() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'admin';
  const visibleSections = sections.filter((s) => !s.adminOnly || isAdmin);

  return (
    <div className="flex-1 overflow-y-auto bg-platform-bg p-6">
      {/* Header */}
      <div className="flex items-center gap-3.5 mb-8">
        <button
          onClick={() => navigate(-1)}
          className="p-2 bg-platform-surface hover:bg-platform-surface-raised border border-platform-border rounded-button text-platform-text-secondary hover:text-platform-accent transition-all active:scale-95"
          title="Back"
        >
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-platform-text-primary">Settings</h1>
          <p className="text-sm text-platform-text-secondary mt-0.5">
            {isAdmin ? 'Manage your profile and operators' : 'Manage your account'}
          </p>
        </div>
      </div>

      <div className="max-w-4xl space-y-4">
        {visibleSections.map((section, idx) => (
          <div
            key={idx}
            onClick={() => navigate(section.path)}
            className="p-5 bg-platform-surface border border-platform-border rounded-[12px] flex items-center justify-between cursor-pointer hover:bg-platform-surface-raised/70 transition-all duration-150 active:scale-[0.99] group"
          >
            <div className="flex items-center gap-4">
              <div className="p-3 bg-platform-bg border border-platform-border/60 rounded-[10px] group-hover:border-platform-accent/35 transition-colors">
                {section.icon}
              </div>
              <div>
                <h3 className="text-sm font-bold text-platform-text-primary group-hover:text-platform-accent transition-colors">
                  {section.title}
                </h3>
                <p className="text-xs text-platform-text-secondary mt-1 max-w-xl">
                  {section.description}
                </p>
              </div>
            </div>
            <ChevronRight className="text-platform-text-muted group-hover:text-platform-accent transition-colors" size={18} />
          </div>
        ))}
      </div>
    </div>
  );
}
