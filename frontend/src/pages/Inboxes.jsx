import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import apiClient from '../api/client';
import ChannelIcon from '../components/ui/ChannelIcon';
import { useAuthStore } from '../store/authStore';
import { Plus, Trash2, Edit, Save, X, Settings, RefreshCw, Key, HelpCircle, Code, ArrowLeft } from 'lucide-react';

export default function Inboxes() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'admin';

  const [inboxes, setInboxes] = useState([]);
  const [bots, setBots] = useState([]);
  const [loading, setLoading] = useState(true);

  // Form States
  const [isAdding, setIsAdding] = useState(false);
  const [editingInboxId, setEditingInboxId] = useState(null);

  // Form fields
  const [name, setName] = useState('');
  const [channelType, setChannelType] = useState('telegram');
  const [botId, setBotId] = useState('none');
  
  // Dynamic channel configs depending on channelType
  const [configFields, setConfigFields] = useState({});

  const fetchInboxesAndBots = async () => {
    setLoading(true);
    try {
      const [inboxesRes, botsRes] = await Promise.all([
        apiClient.get('/inboxes'),
        apiClient.get('/bots')
      ]);
      setInboxes(inboxesRes.data || []);
      setBots(botsRes.data || []);
    } catch (err) {
      console.error('Error fetching data in Inboxes page:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInboxesAndBots();
  }, []);

  const handleCreateInbox = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;

    try {
      const payload = {
        name,
        channel_type: channelType,
        channel_config: configFields,
        bot_id: botId === 'none' ? null : botId
      };

      const response = await apiClient.post('/inboxes', payload);
      setInboxes((prev) => [response.data, ...prev]);
      
      // Reset form
      setIsAdding(false);
      setName('');
      setChannelType('website');
      setBotId('none');
      setConfigFields({});
    } catch (err) {
      console.error('Error creating inbox:', err);
      alert('Failed to create channel');
    }
  };

  const handleUpdateInbox = async (id) => {
    const inboxToUpdate = inboxes.find(i => i.id === id);
    if (!inboxToUpdate) return;

    try {
      const payload = {
        name: inboxToUpdate.name,
        channel_config: inboxToUpdate.channel_config,
        bot_id: inboxToUpdate.bot_id === 'none' ? null : inboxToUpdate.bot_id,
        is_active: inboxToUpdate.is_active
      };
      
      await apiClient.put(`/inboxes/${id}`, payload);
      setEditingInboxId(null);
      fetchInboxesAndBots(); // reload list
    } catch (err) {
      console.error('Error updating inbox:', err);
      alert('Failed to save channel');
    }
  };

  const handleDeleteInbox = async (id) => {
    if (!confirm('Delete this channel? All related conversations will be removed.')) return;

    try {
      await apiClient.delete(`/inboxes/${id}`);
      setInboxes((prev) => prev.filter((i) => i.id !== id));
    } catch (err) {
      console.error('Error deleting inbox:', err);
      alert('Failed to delete channel');
    }
  };

  const handleFieldChange = (key, value) => {
    setConfigFields(prev => ({ ...prev, [key]: value }));
  };

  const handleEditFieldChange = (id, key, value) => {
    setInboxes(prev => prev.map(i => {
      if (i.id === id) {
        return {
          ...i,
          channel_config: { ...i.channel_config, [key]: value }
        };
      }
      return i;
    }));
  };

  const handleEditNameChange = (id, value) => {
    setInboxes(prev => prev.map(i => {
      if (i.id === id) {
        return { ...i, name: value };
      }
      return i;
    }));
  };

  const handleEditBotChange = (id, value) => {
    setInboxes(prev => prev.map(i => {
      if (i.id === id) {
        return { ...i, bot_id: value };
      }
      return i;
    }));
  };

  const handleEditActiveToggle = (id, currentVal) => {
    setInboxes(prev => prev.map(i => {
      if (i.id === id) {
        return { ...i, is_active: !currentVal };
      }
      return i;
    }));
  };

  // Helper to render configuration fields inputs
  const renderConfigInputs = (type, isEditMode = false, editingId = null) => {
    const getValue = (key) => {
      if (isEditMode) {
        const item = inboxes.find(i => i.id === editingId);
        return item?.channel_config?.[key] || '';
      }
      return configFields[key] || '';
    };

    const updateValue = (key, val) => {
      if (isEditMode) {
        handleEditFieldChange(editingId, key, val);
      } else {
        handleFieldChange(key, val);
      }
    };

    switch (type) {
      case 'telegram':
      default:
        return (
          <div className="space-y-3.5">
            <div>
              <label className="block text-[11px] font-bold text-platform-text-secondary uppercase mb-1">Telegram Bot Token</label>
              <input
                type="password"
                placeholder="123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ"
                value={getValue('bot_token')}
                onChange={(e) => updateValue('bot_token', e.target.value)}
                className="w-full bg-platform-bg border border-platform-border rounded-input px-3 py-2 text-xs text-platform-text-primary focus:outline-none focus:border-platform-accent"
                required
              />
              <span className="text-[10px] text-platform-text-muted mt-1 block">
                Get your token from @BotFather on Telegram. The webhook will be configured automatically.
              </span>
            </div>
          </div>
        );
    }
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
            <h1 className="text-2xl font-bold tracking-tight text-platform-text-primary">Channels</h1>
            <p className="text-sm text-platform-text-secondary mt-0.5">Manage connected channels and integrations</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchInboxesAndBots}
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
              <span>Add channel</span>
            </button>
          )}
        </div>
      </div>

      {/* Add Inbox Panel */}
      {isAdding && isAdmin && (
        <div className="mb-8 p-5 bg-platform-surface border border-platform-border rounded-[12px] max-w-2xl panel-glass">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-sm text-platform-text-primary">Connect new channel</h3>
            <button onClick={() => setIsAdding(false)} className="text-platform-text-secondary hover:text-red-400">
              <X size={16} />
            </button>
          </div>

          <form onSubmit={handleCreateInbox} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-[11px] font-bold text-platform-text-secondary uppercase mb-1">Channel name</label>
                <input
                  type="text"
                  placeholder="e.g. Main Support Bot"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-platform-bg border border-platform-border rounded-input px-3 py-2 text-xs text-platform-text-primary focus:outline-none focus:border-platform-accent"
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-platform-text-secondary uppercase mb-1">Channel type</label>
                <select
                  value={channelType}
                  onChange={(e) => {
                    setChannelType(e.target.value);
                    setConfigFields({});
                  }}
                  className="w-full bg-platform-bg border border-platform-border rounded-input px-3 py-2 text-xs text-platform-text-primary focus:outline-none"
                >
                  <option value="telegram">Telegram Bot</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-platform-text-secondary uppercase mb-1">Default AI bot</label>
              <select
                value={botId}
                onChange={(e) => setBotId(e.target.value)}
                className="w-full bg-platform-bg border border-platform-border rounded-input px-3 py-2 text-xs text-platform-text-primary focus:outline-none"
              >
                <option value="none">No AI (agents only)</option>
                {bots.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} (AI Assistant)
                  </option>
                ))}
              </select>
            </div>

            {/* Config Fields */}
            <div className="pt-2 border-t border-platform-border/30">
              {renderConfigInputs(channelType, false)}
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
                Connect channel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Inboxes List */}
      {loading ? (
        <div className="flex justify-center items-center h-48">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-platform-accent border-t-transparent" />
        </div>
      ) : inboxes.length === 0 ? (
        <div className="py-12 text-center text-platform-text-muted italic text-sm border border-dashed border-platform-border rounded-card">
          No active channels. Add a channel to get started.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 max-w-4xl">
          {inboxes.map((inbox) => {
            const isEditing = editingInboxId === inbox.id;
            return (
              <div
                key={inbox.id}
                className="p-5 bg-platform-surface border border-platform-border rounded-[12px] hover:border-platform-border-strong transition-all duration-150"
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  {/* Left Column: Icon & Info */}
                  <div className="flex items-start gap-4 flex-1 min-w-0">
                    <div className="p-3 bg-platform-bg border border-platform-border rounded-[10px] shrink-0 text-platform-accent">
                      <ChannelIcon channelType={inbox.channel_type} size={24} />
                    </div>

                    <div className="flex-1 min-w-0">
                      {isEditing ? (
                        <div className="space-y-3 max-w-md">
                          <input
                            type="text"
                            value={inbox.name}
                            onChange={(e) => handleEditNameChange(inbox.id, e.target.value)}
                            className="w-full bg-platform-bg border border-platform-border rounded-input px-3 py-1.5 text-xs text-platform-text-primary focus:outline-none"
                          />

                          <div>
                            <label className="block text-[9px] font-bold text-platform-text-muted uppercase mb-1">Linked bot</label>
                            <select
                              value={inbox.bot_id || 'none'}
                              onChange={(e) => handleEditBotChange(inbox.id, e.target.value)}
                              className="w-full bg-platform-bg border border-platform-border rounded-input px-3 py-1.5 text-xs text-platform-text-primary focus:outline-none"
                            >
                              <option value="none">No bot</option>
                              {bots.map((b) => (
                                <option key={b.id} value={b.id}>
                                  {b.name}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="pt-2">
                            {renderConfigInputs(inbox.channel_type, true, inbox.id)}
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="flex items-center gap-2">
                            <h3 className="font-bold text-sm text-platform-text-primary truncate">{inbox.name}</h3>
                            <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${inbox.is_active ? 'bg-green-500/10 text-green-400 border border-green-500/15' : 'bg-red-500/10 text-red-400 border border-red-500/15'}`}>
                              {inbox.is_active ? 'Active' : 'Inactive'}
                            </span>
                          </div>

                          <div className="flex flex-wrap items-center gap-y-1 gap-x-3.5 mt-2 text-xs text-platform-text-secondary">
                            <span className="capitalize">Type: {inbox.channel_type}</span>
                            <span className="text-platform-text-muted">•</span>
                            <span>Bot: {inbox.bot_name || <span className="italic text-platform-text-muted">None</span>}</span>
                            <span className="text-platform-text-muted">•</span>
                            <span className="font-mono text-[10px]">ID: {inbox.id}</span>
                          </div>

                          {/* Connection Webhook instructions */}
                          {inbox.channel_type !== 'website' && (
                            <div className="mt-3.5 p-2.5 bg-platform-bg border border-platform-border/50 rounded-card font-mono text-[10px] space-y-1">
                              <span className="text-platform-text-muted block font-bold text-[9px] uppercase tracking-wide">Webhook Callback URL</span>
                              <div className="flex items-center justify-between gap-2">
                                <span className="select-all truncate text-platform-text-secondary">
                                  {window.location.origin}/api/webhooks/{inbox.channel_type}/{inbox.id}
                                </span>
                                <span className="px-1.5 py-0.5 rounded bg-platform-surface border border-platform-border/70 text-platform-text-muted text-[8px]">POST</span>
                              </div>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>

                  {/* Right Column: Actions */}
                  {isAdmin && (
                    <div className="flex items-center justify-end gap-2">
                      {isEditing ? (
                        <>
                          <button
                            onClick={() => handleUpdateInbox(inbox.id)}
                            className="p-2 bg-green-500/10 hover:bg-green-500/20 text-green-400 border border-green-500/20 rounded-button transition-colors"
                            title="Save"
                          >
                            <Save size={14} />
                          </button>
                          <button
                            onClick={() => {
                              setEditingInboxId(null);
                              fetchInboxesAndBots(); // reload from db
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
                            onClick={() => {
                              handleEditActiveToggle(inbox.id, inbox.is_active);
                              // We wait and let them save manually, or save it now
                              setEditingInboxId(inbox.id);
                            }}
                            className="px-2.5 py-1.5 text-xs font-semibold bg-platform-surface hover:bg-platform-surface-raised border border-platform-border text-platform-text-secondary hover:text-platform-text-primary rounded-button transition-all"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDeleteInbox(inbox.id)}
                            className="p-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 rounded-button transition-colors"
                            title="Delete"
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
