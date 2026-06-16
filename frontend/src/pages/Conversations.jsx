import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import apiClient from '../api/client';
import useSocket from '../hooks/useSocket';
import ChannelIcon from '../components/ui/ChannelIcon';
import { useAuthStore } from '../store/authStore';
import {
  Search,
  Send,
  User,
  Bot,
  UserPlus,
  Power,
  PowerOff,
  CheckCircle,
  RotateCcw,
  MessageSquare,
  Loader2,
  Phone,
  Mail,
  Calendar,
  Hash,
  Globe,
  Info,
  ArrowLeft,
} from 'lucide-react';

export default function Conversations() {
  const { user: currentUser } = useAuthStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedInboxId = searchParams.get('inbox_id') || '';

  // State
  const [conversations, setConversations] = useState([]);
  const [selectedConversationId, setSelectedConversationId] = useState(null);
  const [currentConversation, setCurrentConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [operators, setOperators] = useState([]);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingChat, setLoadingChat] = useState(false);
  const [messageText, setMessageText] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);

  // Filters
  const [statusFilter, setStatusFilter] = useState('open'); // 'open' or 'resolved'
  const [assignmentFilter, setAssignmentFilter] = useState('all'); // 'all', 'me', 'unassigned'
  const [searchQuery, setSearchQuery] = useState('');

  const chatEndRef = useRef(null);

  // 1. Fetch operators for assignment dropdown
  useEffect(() => {
    const fetchOperators = async () => {
      try {
        const response = await apiClient.get('/auth/operators');
        setOperators(response.data);
      } catch (err) {
        console.error('Error fetching operators:', err);
      }
    };
    fetchOperators();
  }, []);

  // 2. Fetch conversations list
  const fetchConversations = async () => {
    setLoadingList(true);
    try {
      const params = {
        status: statusFilter,
        page: 1,
        limit: 100
      };
      if (selectedInboxId) {
        params.inbox_id = selectedInboxId;
      }
      if (assignmentFilter === 'me') {
        params.assigned_to = 'me';
      } else if (assignmentFilter === 'unassigned') {
        params.assigned_to = 'unassigned';
      }
      if (searchQuery.trim()) {
        params.search = searchQuery;
      }

      const response = await apiClient.get('/conversations', { params });
      const items = response.data?.items || [];
      setConversations(items);
    } catch (err) {
      console.error('Error fetching conversations:', err);
    } finally {
      setLoadingList(false);
    }
  };

  useEffect(() => {
    fetchConversations();
  }, [statusFilter, assignmentFilter, selectedInboxId, searchQuery]);

  // 3. Fetch specific conversation details & messages
  const fetchConversationDetails = async (id) => {
    setLoadingChat(true);
    try {
      const response = await apiClient.get(`/conversations/${id}`);
      setCurrentConversation(response.data?.conversation || null);
      setMessages(response.data?.messages || []);
    } catch (err) {
      console.error('Error fetching conversation details:', err);
      setSelectedConversationId(null);
    } finally {
      setLoadingChat(false);
    }
  };

  useEffect(() => {
    if (selectedConversationId) {
      fetchConversationDetails(selectedConversationId);
    } else {
      setCurrentConversation(null);
      setMessages([]);
    }
  }, [selectedConversationId]);

  // Scroll chat to bottom
  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // 4. Real-time event socket map
  const onEventMap = useMemo(() => {
    return {
      'message:new': (payload) => {
        const { message, conversationId } = payload;
        
        // If message is in the currently active conversation
        if (message.conversation_id === selectedConversationId || conversationId === selectedConversationId) {
          setMessages((prev) => {
            // Avoid duplicates
            if (prev.some((m) => m.id === message.id)) return prev;
            return [...prev, message];
          });
        }

        // Update list conversation last message & trigger reorder
        setConversations((prev) => {
          const targetId = message.conversation_id || conversationId;
          const exists = prev.some((c) => c.id === targetId);
          
          if (!exists) {
            // Refetch to pull new conversation into view if it satisfies current filters
            fetchConversations();
            return prev;
          }

          return prev.map((c) => {
            if (c.id === targetId) {
              return {
                ...c,
                last_message_content: message.content,
                last_message_type: message.message_type,
                last_message_at: message.created_at
              };
            }
            return c;
          }).sort((a, b) => new Date(b.last_message_at) - new Date(a.last_message_at));
        });
      },
      'conversation:updated': (payload) => {
        const { conversationId, status, assigned_to, bot_paused } = payload;

        // If it's the current open conversation, update details
        if (conversationId === selectedConversationId) {
          setCurrentConversation((prev) => {
            if (!prev) return null;
            return {
              ...prev,
              status: status !== undefined ? status : prev.status,
              assigned_to: assigned_to !== undefined ? assigned_to : prev.assigned_to,
              bot_paused: bot_paused !== undefined ? bot_paused : prev.bot_paused,
              assignee_name: assigned_to === 'unassigned' || assigned_to === null 
                ? null 
                : (operators.find((op) => op.id === assigned_to)?.name || prev.assignee_name)
            };
          });
        }

        // Update in conversation list
        setConversations((prev) => {
          // If the status has changed and no longer matches current list filter, remove it
          if (status !== undefined && status !== statusFilter) {
            return prev.filter((c) => c.id !== conversationId);
          }
          
          // If assignment changed and no longer matches filter, remove it
          if (assigned_to !== undefined) {
            if (assignmentFilter === 'me' && assigned_to !== currentUser.id) {
              return prev.filter((c) => c.id !== conversationId);
            }
            if (assignmentFilter === 'unassigned' && assigned_to !== null) {
              return prev.filter((c) => c.id !== conversationId);
            }
          }

          return prev.map((c) => {
            if (c.id === conversationId) {
              return {
                ...c,
                status: status !== undefined ? status : c.status,
                assigned_to: assigned_to !== undefined ? assigned_to : c.assigned_to,
                bot_paused: bot_paused !== undefined ? bot_paused : c.bot_paused,
                assignee_name: assigned_to === 'unassigned' || assigned_to === null 
                  ? null 
                  : (operators.find((op) => op.id === assigned_to)?.name || c.assignee_name)
              };
            }
            return c;
          });
        });
      }
    };
  }, [selectedConversationId, statusFilter, assignmentFilter, operators, currentUser]);

  const socket = useSocket(onEventMap);

  // Connect / Join rooms via Socket.IO
  useEffect(() => {
    if (socket) {
      // Join inbox-specific room
      if (selectedInboxId) {
        socket.emit('join:inbox', { inboxId: selectedInboxId });
      }
      
      // Join conversation room
      if (selectedConversationId) {
        socket.emit('join:conversation', { conversationId: selectedConversationId });
      }
    }

    return () => {
      if (socket) {
        if (selectedConversationId) {
          socket.emit('leave:conversation', { conversationId: selectedConversationId });
        }
      }
    };
  }, [socket, selectedInboxId, selectedConversationId]);

  // Actions
  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!messageText.trim() || sendingMessage || !selectedConversationId) return;

    setSendingMessage(true);
    try {
      const response = await apiClient.post(`/conversations/${selectedConversationId}/messages`, {
        content: messageText,
        message_type: 'text'
      });
      
      const newMsg = response.data.message;
      setMessages((prev) => {
        if (prev.some((m) => m.id === newMsg.id)) return prev;
        return [...prev, newMsg];
      });

      setMessageText('');
    } catch (err) {
      console.error('Error sending message:', err);
    } finally {
      setSendingMessage(false);
    }
  };

  const handleUpdateAssignment = async (assigneeId) => {
    if (!selectedConversationId) return;
    try {
      await apiClient.patch(`/conversations/${selectedConversationId}`, {
        assigned_to: assigneeId
      });
    } catch (err) {
      console.error('Error assigning conversation:', err);
    }
  };

  const handleToggleBot = async (pause) => {
    if (!selectedConversationId) return;
    try {
      await apiClient.patch(`/conversations/${selectedConversationId}`, {
        bot_paused: pause
      });
    } catch (err) {
      console.error('Error toggling AI bot:', err);
    }
  };

  const handleUpdateStatus = async (status) => {
    if (!selectedConversationId) return;
    try {
      await apiClient.patch(`/conversations/${selectedConversationId}`, {
        status: status
      });
      // Deselect conversation if it leaves the current status list view
      setSelectedConversationId(null);
    } catch (err) {
      console.error('Error updating status:', err);
    }
  };

  // Helper to format date relative to now
  const formatTime = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const now = new Date();
    
    if (date.toDateString() === now.toDateString()) {
      return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    }
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  };

  return (
    <div className="flex-1 flex overflow-hidden bg-platform-bg h-full">
      {/* 3-Column 1: Conversations List — hidden on mobile when chat open */}
      <div className={`${selectedConversationId ? 'hidden md:flex' : 'flex'} w-full md:w-[300px] border-r border-platform-border flex-col h-full bg-platform-surface/30`}>
        {/* Header filters */}
        <div className="p-3 border-b border-platform-border/60 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-platform-text-primary uppercase tracking-wider">Conversations</h2>
            <div className="flex bg-platform-surface border border-platform-border p-0.5 rounded-[6px]">
              <button
                onClick={() => setStatusFilter('open')}
                className={`px-2 py-1 text-[11px] font-semibold rounded-[4px] transition-all duration-150 ${
                  statusFilter === 'open' 
                    ? 'bg-platform-accent/15 text-platform-accent' 
                    : 'text-platform-text-secondary hover:text-platform-text-primary'
                }`}
              >
                Open
              </button>
              <button
                onClick={() => setStatusFilter('resolved')}
                className={`px-2 py-1 text-[11px] font-semibold rounded-[4px] transition-all duration-150 ${
                  statusFilter === 'resolved' 
                    ? 'bg-platform-accent/15 text-platform-accent' 
                    : 'text-platform-text-secondary hover:text-platform-text-primary'
                }`}
              >
                Closed
              </button>
            </div>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 text-platform-text-muted" size={14} />
            <input
              type="text"
              placeholder="Search by contact..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-platform-surface border border-platform-border text-xs rounded-input pl-8 pr-3 py-2 text-platform-text-primary placeholder-platform-text-muted focus:outline-none focus:border-platform-accent transition-colors"
            />
          </div>

          {/* User assignments filter */}
          <div className="grid grid-cols-3 gap-1">
            {['all', 'me', 'unassigned'].map((opt) => (
              <button
                key={opt}
                onClick={() => setAssignmentFilter(opt)}
                className={`py-1 text-[10px] font-bold text-center border rounded-[4px] transition-all duration-150 capitalize ${
                  assignmentFilter === opt
                    ? 'bg-platform-surface-raised border-platform-accent text-platform-accent'
                    : 'bg-platform-surface/30 border-platform-border text-platform-text-secondary hover:text-platform-text-primary'
                }`}
              >
                {opt === 'all' ? 'All' : opt === 'me' ? 'Mine' : 'Free'}
              </button>
            ))}
          </div>
        </div>

        {/* Scrollable list */}
        <div className="flex-1 overflow-y-auto divide-y divide-platform-border/20">
          {loadingList ? (
            <div className="flex flex-col items-center justify-center py-12 text-platform-text-muted gap-2">
              <Loader2 className="animate-spin text-platform-accent" size={20} />
              <span className="text-xs">Loading...</span>
            </div>
          ) : conversations.length === 0 ? (
            <div className="py-12 text-center text-xs text-platform-text-muted italic">
              No conversations found
            </div>
          ) : (
            conversations.map((conv) => {
              const isActive = conv.id === selectedConversationId;
              return (
                <div
                  key={conv.id}
                  onClick={() => setSelectedConversationId(conv.id)}
                  className={`p-3 cursor-pointer transition-all duration-150 hover:bg-platform-surface-raised/40 relative flex gap-3 ${
                    isActive ? 'bg-platform-surface-raised/80' : ''
                  }`}
                >
                  {/* Left indicator bar */}
                  {isActive && <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-platform-accent" />}
                  
                  {/* Avatar */}
                  <div className="relative shrink-0">
                    {conv.contact_avatar ? (
                      <img
                        src={conv.contact_avatar}
                        alt={conv.contact_name}
                        className="w-9 h-9 rounded-full object-cover border border-platform-border"
                      />
                    ) : (
                      <div className="w-9 h-9 rounded-full bg-platform-border border border-platform-border/40 flex items-center justify-center text-platform-accent text-xs font-semibold">
                        {conv.contact_name ? conv.contact_name.charAt(0).toUpperCase() : 'C'}
                      </div>
                    )}
                    <div className="absolute -bottom-0.5 -right-0.5 p-0.5 bg-platform-bg rounded-full">
                      <ChannelIcon channelType={conv.contact_channel || 'website'} size={10} />
                    </div>
                  </div>

                  {/* Conv details */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <h4 className="text-xs font-bold text-platform-text-primary truncate">
                        {conv.contact_name || 'Unknown'}
                      </h4>
                      <span className="text-[9px] text-platform-text-muted shrink-0">
                        {formatTime(conv.last_message_at)}
                      </span>
                    </div>

                    <p className="text-[11px] text-platform-text-secondary truncate mt-0.5">
                      {conv.last_message_content || 'No messages'}
                    </p>

                    <div className="flex items-center gap-1.5 mt-1">
                      {conv.assignee_name ? (
                        <span className="text-[8px] bg-platform-surface px-1.5 py-0.5 rounded text-platform-text-secondary border border-platform-border/30 truncate max-w-[120px]">
                          {conv.assignee_name}
                        </span>
                      ) : (
                        <span className="text-[8px] bg-yellow-500/10 text-yellow-400/80 px-1.5 py-0.5 rounded border border-yellow-500/20 font-medium">
                          Unassigned
                        </span>
                      )}

                      {!conv.bot_paused && (
                        <span className="text-[8px] bg-platform-accent/15 text-platform-accent px-1.5 py-0.5 rounded font-medium border border-platform-accent/10">
                          AI active
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* 3-Column 2: Active Chat Area — hidden on mobile when no chat selected */}
      <div className={`${selectedConversationId ? 'flex' : 'hidden md:flex'} flex-1 flex-col h-full bg-platform-bg border-r border-platform-border`}>
        {selectedConversationId && currentConversation ? (
          <>
            {/* Chat header */}
            <div className="p-3 border-b border-platform-border flex items-center justify-between bg-platform-surface/10 panel-glass">
              <div className="flex items-center gap-3">
                {/* Back button — mobile only */}
                <button
                  className="md:hidden flex items-center justify-center w-8 h-8 rounded-button text-platform-text-secondary hover:text-platform-text-primary hover:bg-platform-surface-raised transition-colors shrink-0"
                  onClick={() => setSelectedConversationId(null)}
                  aria-label="Back"
                >
                  <ArrowLeft size={18} />
                </button>
                <div className="relative">
                  {currentConversation.contact_avatar ? (
                    <img
                      src={currentConversation.contact_avatar}
                      alt={currentConversation.contact_name}
                      className="w-10 h-10 rounded-full object-cover border border-platform-border"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-platform-border flex items-center justify-center text-platform-accent font-semibold">
                      {currentConversation.contact_name ? currentConversation.contact_name.charAt(0).toUpperCase() : 'C'}
                    </div>
                  )}
                  <div className="absolute -bottom-0.5 -right-0.5 p-0.5 bg-platform-bg rounded-full">
                    <ChannelIcon channelType={currentConversation.contact_channel} size={12} />
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-bold text-platform-text-primary">
                    {currentConversation.contact_name || 'Unknown'}
                  </h3>
                  <div className="flex items-center gap-2 mt-0.5 text-xs">
                    <span className="text-platform-text-secondary flex items-center gap-1">
                      <span className="capitalize">{currentConversation.inbox_name}</span>
                    </span>
                    <span className="text-platform-text-muted">•</span>
                    <span className="text-[10px] text-platform-text-muted">
                      ID: {currentConversation.id.substring(0, 8)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Header Controls */}
              <div className="flex items-center gap-2">
                {/* Bot control */}
                {currentConversation.bot_paused ? (
                  <button
                    onClick={() => handleToggleBot(false)}
                    className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold bg-green-500/10 text-green-400 hover:bg-green-500/20 border border-green-500/20 rounded-button transition-all"
                    title="Enable bot"
                  >
                    <Power size={13} />
                    <span>Enable AI</span>
                  </button>
                ) : (
                  <button
                    onClick={() => handleToggleBot(true)}
                    className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold bg-yellow-500/15 text-yellow-400 hover:bg-yellow-500/25 border border-yellow-500/25 rounded-button transition-all"
                    title="Pause AI"
                  >
                    <PowerOff size={13} />
                    <span>Pause AI</span>
                  </button>
                )}

                {/* Operator select */}
                <div className="flex items-center gap-1 bg-platform-surface border border-platform-border px-2 py-1 rounded-button">
                  <UserPlus size={13} className="text-platform-text-secondary" />
                  <select
                    value={currentConversation.assigned_to || ''}
                    onChange={(e) => handleUpdateAssignment(e.target.value || 'unassigned')}
                    className="bg-transparent text-xs text-platform-text-primary focus:outline-none cursor-pointer pr-1"
                  >
                    <option value="" className="bg-platform-surface text-platform-text-primary">
                      Assign to...
                    </option>
                    {operators.map((op) => (
                      <option
                        key={op.id}
                        value={op.id}
                        className="bg-platform-surface text-platform-text-primary"
                      >
                        {op.name} {op.id === currentUser.id ? '(You)' : ''}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Resolve button */}
                {currentConversation.status === 'open' ? (
                  <button
                    onClick={() => handleUpdateStatus('resolved')}
                    className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold bg-platform-accent/15 text-platform-accent hover:bg-platform-accent/25 border border-platform-accent/35 rounded-button transition-all"
                  >
                    <CheckCircle size={13} />
                    <span>Resolve</span>
                  </button>
                ) : (
                  <button
                    onClick={() => handleUpdateStatus('open')}
                    className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold bg-platform-surface hover:bg-platform-surface-raised border border-platform-border rounded-button text-platform-text-primary transition-all"
                  >
                    <RotateCcw size={13} />
                    <span>Reopen</span>
                  </button>
                )}
              </div>
            </div>

            {/* Message Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3.5 bg-platform-bg">
              {loadingChat ? (
                <div className="flex flex-col items-center justify-center h-full text-platform-text-muted gap-2">
                  <Loader2 className="animate-spin text-platform-accent" size={24} />
                  <span className="text-xs">Loading messages...</span>
                </div>
              ) : messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-platform-text-muted gap-2 py-12">
                  <MessageSquare size={32} className="opacity-40" />
                  <span className="text-xs italic">No messages yet</span>
                </div>
              ) : (
                messages.map((msg, index) => {
                  const isAgent = msg.sender_type === 'agent';
                  const isBot = msg.sender_type === 'bot';
                  const isContact = msg.sender_type === 'contact';
                  
                  let senderLabel = 'Customer';
                  if (isAgent) senderLabel = msg.sender_name || 'Agent';
                  if (isBot) senderLabel = 'AI Assistant';

                  return (
                    <div
                      key={msg.id || index}
                      className={`flex flex-col max-w-[80%] ${
                        isAgent ? 'ml-auto items-end' : 'mr-auto items-start'
                      }`}
                    >
                      {/* Sender metadata row */}
                      <span className="text-[10px] text-platform-text-secondary mb-1 px-1 flex items-center gap-1 font-semibold">
                        {isBot && <Bot size={10} className="text-platform-accent" />}
                        {senderLabel}
                        <span className="text-platform-text-muted font-normal">•</span>
                        <span className="text-platform-text-muted font-normal">{formatTime(msg.created_at)}</span>
                      </span>

                      {/* Bubble */}
                      <div
                        className={`p-3 rounded-[12px] text-sm break-words leading-relaxed border ${
                          isAgent
                            ? 'bg-platform-accent/10 border-platform-accent/20 text-platform-text-primary rounded-tr-none'
                            : isBot
                            ? 'bg-platform-surface-raised border-platform-accent/15 text-platform-text-primary rounded-tl-none'
                            : 'bg-platform-surface border-platform-border text-platform-text-primary rounded-tl-none'
                        }`}
                      >
                        {msg.content}
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Input area */}
            <div className="p-3 border-t border-platform-border bg-platform-surface/20">
              <form onSubmit={handleSendMessage} className="flex gap-2">
                <input
                  type="text"
                  placeholder={
                    currentConversation.status === 'resolved'
                      ? 'Conversation resolved. Reopen it to send messages.'
                      : 'Type a message to the customer...'
                  }
                  disabled={currentConversation.status === 'resolved' || sendingMessage}
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                  className="flex-1 bg-platform-surface border border-platform-border text-xs rounded-input px-3.5 py-2.5 text-platform-text-primary placeholder-platform-text-muted focus:outline-none focus:border-platform-accent disabled:opacity-40"
                />
                <button
                  type="submit"
                  disabled={currentConversation.status === 'resolved' || !messageText.trim() || sendingMessage}
                  className="flex items-center justify-center p-2.5 bg-platform-accent hover:bg-platform-accent-hover text-white rounded-button transition-all duration-150 disabled:opacity-40 disabled:hover:bg-platform-accent hover:shadow-md hover:shadow-platform-accent/10"
                >
                  {sendingMessage ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                </button>
              </form>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-platform-text-muted gap-3">
            <div className="p-4 bg-platform-surface border border-platform-border rounded-full text-platform-accent/80">
              <MessageSquare size={36} />
            </div>
            <h3 className="font-bold text-sm text-platform-text-secondary">Select a conversation</h3>
            <p className="text-xs text-center max-w-xs leading-relaxed text-platform-text-muted">
              Select a conversation from the list to start chatting.
            </p>
          </div>
        )}
      </div>

      {/* 3-Column 3: Contact details card — hidden below xl */}
      <div className="hidden xl:flex w-[280px] bg-platform-surface/30 flex-col h-full overflow-y-auto select-none">
        {selectedConversationId && currentConversation ? (
          <div className="p-4 space-y-6">
            {/* Profile widget */}
            <div className="text-center pb-5 border-b border-platform-border/40">
              <div className="inline-block relative">
                {currentConversation.contact_avatar ? (
                  <img
                    src={currentConversation.contact_avatar}
                    alt={currentConversation.contact_name}
                    className="w-16 h-16 rounded-full object-cover mx-auto border-2 border-platform-border"
                  />
                ) : (
                  <div className="w-16 h-16 rounded-full bg-platform-border flex items-center justify-center text-platform-accent text-2xl font-bold mx-auto border-2 border-platform-border/40">
                    {currentConversation.contact_name ? currentConversation.contact_name.charAt(0).toUpperCase() : 'C'}
                  </div>
                )}
                <div className="absolute bottom-0 right-0 p-1 bg-platform-bg rounded-full border border-platform-border">
                  <ChannelIcon channelType={currentConversation.contact_channel} size={14} />
                </div>
              </div>

              <h3 className="font-bold text-platform-text-primary mt-2">
                {currentConversation.contact_name || 'Unknown'}
              </h3>
              <span className="text-[10px] text-platform-text-secondary uppercase font-semibold bg-platform-surface border border-platform-border/45 px-2 py-0.5 rounded-full mt-1.5 inline-block">
                {currentConversation.contact_channel}
              </span>
            </div>

            {/* Details information list */}
            <div className="space-y-4">
              <h4 className="text-[10px] font-bold text-platform-text-muted uppercase tracking-wider flex items-center gap-1.5">
                <Info size={11} />
                <span>Details</span>
              </h4>

              <div className="space-y-3.5 text-xs">
                {currentConversation.contact_email && (
                  <div className="flex items-start gap-2.5">
                    <Mail size={14} className="text-platform-text-secondary mt-0.5" />
                    <div className="min-w-0">
                      <span className="text-[10px] text-platform-text-muted block">Email</span>
                      <a href={`mailto:${currentConversation.contact_email}`} className="text-platform-text-primary hover:text-platform-accent hover:underline break-all">
                        {currentConversation.contact_email}
                      </a>
                    </div>
                  </div>
                )}

                {currentConversation.contact_phone && (
                  <div className="flex items-start gap-2.5">
                    <Phone size={14} className="text-platform-text-secondary mt-0.5" />
                    <div className="min-w-0">
                      <span className="text-[10px] text-platform-text-muted block">Phone</span>
                      <a href={`tel:${currentConversation.contact_phone}`} className="text-platform-text-primary hover:text-platform-accent hover:underline">
                        {currentConversation.contact_phone}
                      </a>
                    </div>
                  </div>
                )}

                <div className="flex items-start gap-2.5">
                  <Hash size={14} className="text-platform-text-secondary mt-0.5" />
                  <div className="min-w-0">
                    <span className="text-[10px] text-platform-text-muted block">External ID</span>
                    <span className="text-platform-text-secondary font-mono text-[10px] select-all break-all">
                      {currentConversation.contact_metadata?.external_id || 'Not set'}
                    </span>
                  </div>
                </div>

                <div className="flex items-start gap-2.5">
                  <Calendar size={14} className="text-platform-text-secondary mt-0.5" />
                  <div className="min-w-0">
                    <span className="text-[10px] text-platform-text-muted block">Added to CRM</span>
                    <span className="text-platform-text-secondary">
                      {new Date(currentConversation.contact_created_at || currentConversation.created_at).toLocaleDateString('en-GB', {
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric'
                      })}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Custom metadata breakdown */}
            {currentConversation.contact_metadata && Object.keys(currentConversation.contact_metadata).filter(k => k !== 'external_id').length > 0 && (
              <div className="space-y-2.5 pt-4 border-t border-platform-border/40">
                <h4 className="text-[10px] font-bold text-platform-text-muted uppercase tracking-wider">
                  Additional data
                </h4>
                <div className="bg-platform-surface/40 border border-platform-border/40 rounded-[6px] p-2.5 space-y-2">
                  {Object.entries(currentConversation.contact_metadata)
                    .filter(([key]) => key !== 'external_id')
                    .map(([key, val]) => (
                      <div key={key} className="text-[11px] min-w-0">
                        <span className="text-platform-text-secondary block font-medium capitalize">{key.replace(/_/g, ' ')}</span>
                        <span className="text-platform-text-primary break-all">
                          {typeof val === 'object' ? JSON.stringify(val) : String(val)}
                        </span>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-4 text-center text-platform-text-muted italic text-xs py-12">
            No contact selected
          </div>
        )}
      </div>
    </div>
  );
}
