import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import apiClient from '../api/client';
import { useAuthStore } from '../store/authStore';
import { Plus, Trash2, Edit, Save, X, Bot, RefreshCw, Key, Link2, Settings, ArrowLeft } from 'lucide-react';

export default function Bots() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'admin';

  const [bots, setBots] = useState([]);
  const [inboxes, setInboxes] = useState([]);
  const [loading, setLoading] = useState(true);

  // Form States
  const [isAdding, setIsAdding] = useState(false);
  const [editingBotId, setEditingBotId] = useState(null);

  // Add Form fields
  const [name, setName] = useState('');
  const [webhookUrl, setWebhookUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [config, setConfig] = useState('{}');

  const fetchBotsAndInboxes = async () => {
    setLoading(true);
    try {
      const [botsRes, inboxesRes] = await Promise.all([
        apiClient.get('/bots'),
        apiClient.get('/inboxes')
      ]);
      setBots(botsRes.data || []);
      setInboxes(inboxesRes.data || []);
    } catch (err) {
      console.error('Error fetching bots page data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBotsAndInboxes();
  }, []);

  const handleCreateBot = async (e) => {
    e.preventDefault();
    if (!name.trim() || !webhookUrl.trim()) return;

    let parsedConfig = {};
    try {
      if (config.trim()) {
        parsedConfig = JSON.parse(config);
      }
    } catch (err) {
      alert('Invalid JSON configuration!');
      return;
    }

    try {
      const payload = {
        name,
        webhook_url: webhookUrl,
        api_key: apiKey || null,
        config: parsedConfig
      };

      const response = await apiClient.post('/bots', payload);
      setBots((prev) => [response.data, ...prev]);

      setIsAdding(false);
      setName('');
      setWebhookUrl('');
      setApiKey('');
      setConfig('{}');
    } catch (err) {
      console.error('Error creating bot:', err);
      alert('Failed to create bot');
    }
  };

  const handleUpdateBot = async (id) => {
    const botToUpdate = bots.find((b) => b.id === id);
    if (!botToUpdate) return;

    let parsedConfig = {};
    try {
      if (typeof botToUpdate.config === 'string') {
        parsedConfig = JSON.parse(botToUpdate.config);
      } else {
        parsedConfig = botToUpdate.config;
      }
    } catch (err) {
      alert('Invalid JSON configuration!');
      return;
    }

    try {
      const payload = {
        name: botToUpdate.name,
        webhook_url: botToUpdate.webhook_url,
        api_key: botToUpdate.api_key,
        config: parsedConfig
      };

      await apiClient.put(`/bots/${id}`, payload);
      setEditingBotId(null);
      fetchBotsAndInboxes();
    } catch (err) {
      console.error('Error updating bot:', err);
      alert('Failed to save changes');
    }
  };

  const handleDeleteBot = async (id) => {
    // Check if bot is linked to any active channel
    const linkedInboxes = inboxes.filter((i) => i.bot_id === id);
    if (linkedInboxes.length > 0) {
      const names = linkedInboxes.map((i) => `"${i.name}"`).join(', ');
      alert(`Cannot delete bot. It is used in channels: ${names}. Unlink the bot from those channels first.`);
      return;
    }

    if (!confirm('Delete this AI bot?')) return;

    try {
      await apiClient.delete(`/bots/${id}`);
      setBots((prev) => prev.filter((b) => b.id !== id));
    } catch (err) {
      console.error('Error deleting bot:', err);
      alert('Failed to delete bot');
    }
  };

  const handleEditFieldChange = (id, key, val) => {
    setBots((prev) =>
      prev.map((b) => {
        if (b.id === id) {
          return { ...b, [key]: val };
        }
        return b;
      })
    );
  };

  return (
    <div className="flex-1 overflow-y-auto bg-platform-bg p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3.5">
          <button
            onClick={() => navigate('/settings')}
            className="p-2 bg-platform-surface hover:bg-platform-surface-raised border border-platform-border rounded-button text-platform-text-secondary hover:text-platform-accent transition-all active:scale-95"
            title="Back to settings"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-platform-text-primary">AI Assistants (Dify Bots)</h1>
            <p className="text-sm text-platform-text-secondary mt-0.5">Manage AI bots and Dify.ai integrations for your channels</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchBotsAndInboxes}
            className="p-2 bg-platform-surface hover:bg-platform-surface-raised border border-platform-border rounded-button text-platform-text-secondary hover:text-platform-accent transition-colors"
          >
            <RefreshCw size={14} />
          </button>
          {isAdmin && !isAdding && (
            <button
              onClick={() => setIsAdding(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-platform-accent hover:bg-platform-accent-hover text-white rounded-button transition-colors active:scale-95"
            >
              <Plus size={14} />
              <span>Add bot</span>
            </button>
          )}
        </div>
      </div>

      {/* Add Bot Panel */}
      {isAdding && isAdmin && (
        <div className="mb-8 p-5 bg-platform-surface border border-platform-border rounded-[12px] max-w-2xl panel-glass">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-sm text-platform-text-primary">Register AI bot</h3>
            <button onClick={() => setIsAdding(false)} className="text-platform-text-secondary hover:text-red-400">
              <X size={16} />
            </button>
          </div>

          <form onSubmit={handleCreateBot} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-[11px] font-bold text-platform-text-secondary uppercase mb-1">Bot name</label>
                <input
                  type="text"
                  placeholder="e.g. Dify Sales & Support"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-platform-bg border border-platform-border rounded-input px-3 py-2 text-xs text-platform-text-primary focus:outline-none focus:border-platform-accent"
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-platform-text-secondary uppercase mb-1">Dify Webhook URL</label>
                <input
                  type="url"
                  placeholder="https://api.dify.ai/v1/chat-messages или кастомный url"
                  value={webhookUrl}
                  onChange={(e) => setWebhookUrl(e.target.value)}
                  className="w-full bg-platform-bg border border-platform-border rounded-input px-3 py-2 text-xs text-platform-text-primary focus:outline-none focus:border-platform-accent"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-platform-text-secondary uppercase mb-1">API Key / Token (Authorization)</label>
              <input
                type="password"
                placeholder="app-xxxxxxxxxxxxxxxxxxxxxxxx"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                className="w-full bg-platform-bg border border-platform-border rounded-input px-3 py-2 text-xs text-platform-text-primary focus:outline-none focus:border-platform-accent"
              />
              <span className="text-[10px] text-platform-text-muted mt-1 block">
                API token for Dify API authorization (sent as Authorization: Bearer token header).
              </span>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-platform-text-secondary uppercase mb-1">Additional configuration (JSON)</label>
              <textarea
                rows={3}
                placeholder='{ "temperature": 0.7, "system_prompt": "..." }'
                value={config}
                onChange={(e) => setConfig(e.target.value)}
                className="w-full bg-platform-bg border border-platform-border rounded-input px-3 py-2 text-xs font-mono text-platform-text-primary focus:outline-none focus:border-platform-accent"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsAdding(false)}
                className="px-3.5 py-2 text-xs font-semibold bg-platform-bg hover:bg-platform-surface-raised border border-platform-border text-platform-text-primary rounded-button"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-3.5 py-2 text-xs font-semibold bg-platform-accent hover:bg-platform-accent-hover text-white rounded-button"
              >
                Register
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Bots Grid */}
      {loading ? (
        <div className="flex justify-center items-center h-48">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-platform-accent border-t-transparent" />
        </div>
      ) : bots.length === 0 ? (
        <div className="py-12 text-center text-platform-text-muted italic text-sm border border-dashed border-platform-border rounded-card">
          No AI bots registered. Add a bot to enable automated chat handling.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 max-w-4xl">
          {bots.map((bot) => {
            const isEditing = editingBotId === bot.id;
            const activeUsage = inboxes.filter((i) => i.bot_id === bot.id);
            return (
              <div
                key={bot.id}
                className="p-5 bg-platform-surface border border-platform-border rounded-[12px] hover:border-platform-border-strong transition-all duration-150"
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  {/* Left content */}
                  <div className="flex items-start gap-4 flex-1 min-w-0">
                    <div className="p-3 bg-platform-bg border border-platform-border rounded-[10px] shrink-0 text-teal-400">
                      <Bot size={24} />
                    </div>

                    <div className="flex-1 min-w-0">
                      {isEditing ? (
                        <div className="space-y-3 max-w-2xl">
                          <input
                            type="text"
                            value={bot.name}
                            onChange={(e) => handleEditFieldChange(bot.id, 'name', e.target.value)}
                            className="w-full bg-platform-bg border border-platform-border rounded-input px-3 py-1.5 text-xs text-platform-text-primary focus:outline-none"
                            placeholder="Bot name"
                          />
                          <input
                            type="url"
                            value={bot.webhook_url}
                            onChange={(e) => handleEditFieldChange(bot.id, 'webhook_url', e.target.value)}
                            className="w-full bg-platform-bg border border-platform-border rounded-input px-3 py-1.5 text-xs text-platform-text-primary focus:outline-none"
                            placeholder="Webhook URL"
                          />
                          <input
                            type="password"
                            value={bot.api_key || ''}
                            onChange={(e) => handleEditFieldChange(bot.id, 'api_key', e.target.value)}
                            className="w-full bg-platform-bg border border-platform-border rounded-input px-3 py-1.5 text-xs text-platform-text-primary focus:outline-none"
                            placeholder="API Token (leave blank to keep current)"
                          />
                          <textarea
                            rows={2}
                            value={typeof bot.config === 'object' ? JSON.stringify(bot.config, null, 2) : bot.config}
                            onChange={(e) => handleEditFieldChange(bot.id, 'config', e.target.value)}
                            className="w-full bg-platform-bg border border-platform-border rounded-input px-3 py-1.5 text-xs font-mono text-platform-text-primary focus:outline-none"
                            placeholder="Config JSON"
                          />
                        </div>
                      ) : (
                        <>
                          <h3 className="font-bold text-sm text-platform-text-primary">{bot.name}</h3>
                          
                          <div className="mt-2 space-y-1 text-xs text-platform-text-secondary">
                            <div className="flex items-center gap-1">
                              <Link2 size={12} className="text-platform-text-muted shrink-0" />
                              <span className="truncate max-w-md">Endpoint: {bot.webhook_url}</span>
                            </div>
                            {bot.api_key && (
                              <div className="flex items-center gap-1 text-[11px] text-platform-accent">
                                <Key size={12} className="text-platform-accent/70 shrink-0" />
                                <span>Auth token configured</span>
                              </div>
                            )}
                            <div className="text-[10px] text-platform-text-muted font-mono select-all">
                              ID: {bot.id}
                            </div>
                          </div>

                          {/* Linkage stats */}
                          <div className="mt-3 flex flex-wrap items-center gap-1.5">
                            {activeUsage.length > 0 ? (
                              activeUsage.map((i) => (
                                <span
                                  key={i.id}
                                  className="text-[9px] font-bold bg-teal-500/10 text-teal-400 border border-teal-500/20 px-2 py-0.5 rounded-full"
                                >
                                  Channel: {i.name}
                                </span>
                              ))
                            ) : (
                              <span className="text-[9px] font-bold bg-platform-bg text-platform-text-muted border border-platform-border px-2 py-0.5 rounded-full">
                                Not linked to any channel
                              </span>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Actions column */}
                  {isAdmin && (
                    <div className="flex items-center justify-end gap-2">
                      {isEditing ? (
                        <>
                          <button
                            onClick={() => handleUpdateBot(bot.id)}
                            className="p-2 bg-green-500/10 hover:bg-green-500/20 text-green-400 border border-green-500/20 rounded-button transition-colors"
                            title="Save"
                          >
                            <Save size={14} />
                          </button>
                          <button
                            onClick={() => {
                              setEditingBotId(null);
                              fetchBotsAndInboxes();
                            }}
                            className="p-2 bg-platform-surface hover:bg-platform-surface-raised border border-platform-border text-platform-text-secondary rounded-button transition-colors"
                            title="Cancel"
                          >
                            <X size={14} />
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => setEditingBotId(bot.id)}
                            className="px-2.5 py-1.5 text-xs font-semibold bg-platform-surface hover:bg-platform-surface-raised border border-platform-border text-platform-text-secondary hover:text-platform-text-primary rounded-button transition-all"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDeleteBot(bot.id)}
                            className="p-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 rounded-button transition-colors"
                            title="Удалить"
                          >
                            <Trash2 size={14} />
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
