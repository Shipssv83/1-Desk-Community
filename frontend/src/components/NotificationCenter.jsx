import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import useSocket from '../hooks/useSocket';
import apiClient from '../api/client';
import { getNotificationPrefs, NOTIF_PREFS_EVENT } from '../lib/notificationPrefs';

// App-wide operator notifications for incoming contact messages. Mounted once in
// AppShell so it works on every page (Dashboard, Reports, …), not just the
// Conversations view. Listens on the operator's inbox rooms and fires:
//   • a short WebAudio beep (no audio asset needed)
//   • an in-app toast (click → open that conversation)
//   • an unread counter in the browser tab title
//   • a desktop Notification when the tab isn't focused
export default function NotificationCenter() {
  const navigate = useNavigate();
  const [toasts, setToasts] = useState([]);
  const inboxIdsRef = useRef([]);
  const unreadRef = useRef(0);
  const baseTitleRef = useRef(typeof document !== 'undefined' ? document.title : '1-Desk');
  const prefsRef = useRef(getNotificationPrefs());
  const audioCtxRef = useRef(null);
  const audioRef = useRef(null);

  // Preload the notification sound once.
  useEffect(() => {
    const a = new Audio('/notification.mp3');
    a.preload = 'auto';
    a.volume = 0.7;
    audioRef.current = a;
  }, []);

  // Browsers block audio until the user interacts with the page (autoplay
  // policy). On the first gesture, "prime" the <audio> element (play+pause
  // muted) and resume the WebAudio fallback context so sound works later when a
  // message arrives without a fresh interaction.
  useEffect(() => {
    const unlock = () => {
      try {
        const a = audioRef.current;
        if (a) {
          a.muted = true;
          a.play().then(() => { a.pause(); a.currentTime = 0; a.muted = false; })
            .catch(() => { a.muted = false; });
        }
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (Ctx) {
          if (!audioCtxRef.current) audioCtxRef.current = new Ctx();
          if (audioCtxRef.current.state === 'suspended') audioCtxRef.current.resume();
        }
      } catch {
        // ignore
      }
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  // Keep prefs in sync when changed from the Profile settings page.
  useEffect(() => {
    const onChange = (e) => { prefsRef.current = e.detail || getNotificationPrefs(); };
    window.addEventListener(NOTIF_PREFS_EVENT, onChange);
    return () => window.removeEventListener(NOTIF_PREFS_EVENT, onChange);
  }, []);

  // Ask for desktop notification permission once (only if desktop pushes are on).
  useEffect(() => {
    const p = prefsRef.current;
    if (p.enabled && p.desktop && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }
  }, []);

  // Clear the unread tab counter when the operator comes back to the tab.
  useEffect(() => {
    const onFocus = () => {
      unreadRef.current = 0;
      document.title = baseTitleRef.current;
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);

  const playSound = () => {
    // Primary: real mp3 via HTMLAudioElement. Fall back to the WebAudio beep if
    // the file fails to play (blocked, missing, decode error).
    const a = audioRef.current;
    if (a) {
      a.currentTime = 0;
      const p = a.play();
      if (p && typeof p.catch === 'function') p.catch(() => playBeep());
      return;
    }
    playBeep();
  };

  const playBeep = () => {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      if (!audioCtxRef.current) audioCtxRef.current = new Ctx();
      const ctx = audioCtxRef.current;

      // Build + fire the tone. Must read ctx.currentTime *after* the context is
      // running — scheduling against a suspended clock makes the beep silent.
      const emit = () => {
        const t0 = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = 880;
        gain.gain.setValueAtTime(0.0001, t0);
        gain.gain.exponentialRampToValueAtTime(0.2, t0 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.25);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t0);
        osc.stop(t0 + 0.26);
      };

      // resume() is async: when the autoplay policy left the context suspended
      // (e.g. message arrives while the tab is unfocused) we must wait for it to
      // actually start before scheduling, otherwise no sound is produced.
      if (ctx.state === 'suspended') {
        ctx.resume().then(emit).catch(() => {});
      } else {
        emit();
      }
    } catch {
      // Audio is best-effort; ignore failures (autoplay policy, etc.).
    }
  };

  const bumpTitle = () => {
    unreadRef.current += 1;
    document.title = `(${unreadRef.current}) ${baseTitleRef.current}`;
  };

  const pushDesktop = (name, text, inboxId, conversationId) => {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    if (document.hasFocus()) return; // tab is focused → toast is enough
    try {
      const n = new Notification(name || 'Новое сообщение', {
        body: text || '',
        tag: conversationId || inboxId,
        renotify: true
      });
      n.onclick = () => {
        window.focus();
        navigate(`/app/conversations?inbox_id=${inboxId}`);
        n.close();
      };
    } catch {
      // ignore
    }
  };

  const addToast = (toast) => {
    setToasts((prev) => [...prev, toast]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== toast.id));
    }, 6000);
  };

  const dismissToast = (id) => setToasts((prev) => prev.filter((t) => t.id !== id));

  const onEventMap = useMemo(() => ({
    'message:new': (payload) => {
      const { message, conversationId } = payload || {};
      if (!message) return;
      // Only notify on inbound messages from a contact — skip bot/operator echoes.
      if (message.sender_type !== 'contact') return;

      const prefs = prefsRef.current;
      if (!prefs.enabled) return;

      const inboxId =
        message.inbox_id ||
        inboxIdsRef.current[0] ||
        '';
      const convId = message.conversation_id || conversationId;
      const name = message.contact_name || message.sender_name || 'Клиент';
      const text = message.content || '';

      if (prefs.sound) playSound();
      if (prefs.tabCounter) bumpTitle();
      if (prefs.desktop) pushDesktop(name, text, inboxId, convId);
      if (prefs.toast) {
        addToast({
          id: `${message.id || Date.now()}`,
          name,
          text,
          inboxId,
          conversationId: convId
        });
      }
    }
  }), [navigate]);

  const socket = useSocket(onEventMap);

  // Join every inbox room the operator can see so notifications arrive on any page.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiClient.get('/inboxes');
        if (cancelled) return;
        const ids = (res.data || []).map((i) => i.id);
        inboxIdsRef.current = ids;
        if (socket) ids.forEach((id) => socket.emit('join:inbox', { inboxId: id }));
      } catch {
        // ignore — notifications just won't fire if inbox list fails
      }
    })();
    return () => { cancelled = true; };
  }, [socket]);

  const openConversation = (toast) => {
    dismissToast(toast.id);
    navigate(`/app/conversations?inbox_id=${toast.inboxId}`);
  };

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
      {toasts.map((t) => (
        <button
          key={t.id}
          onClick={() => openConversation(t)}
          className="pointer-events-auto w-80 max-w-[90vw] text-left rounded-lg bg-platform-surface border border-platform-accent/30 shadow-lg p-3 hover:border-platform-accent transition-colors"
        >
          <div className="flex items-start gap-2">
            <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-platform-accent" />
            <div className="min-w-0">
              <div className="text-sm font-semibold text-platform-text-primary truncate">
                {t.name}
              </div>
              <div className="text-xs text-platform-text-secondary truncate">
                {t.text}
              </div>
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}
