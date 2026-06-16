import { useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { useAuthStore } from '../store/authStore';

export default function useSocket(onEventMap) {
  const socketRef = useRef(null);
  const { user } = useAuthStore();

  useEffect(() => {
    if (!user) return;

    // Prod: nginx proxies /socket.io/ to the backend on the same origin, so
    // window.location.origin works. Local dev needs VITE_SOCKET_URL set to
    // the backend's own port (e.g. http://localhost:4000) since frontend and
    // backend run on different ports without a shared proxy.
    const socketUrl = import.meta.env.VITE_SOCKET_URL || window.location.origin;
    const socket = io(socketUrl, {
      auth: {
        // Fallback to handshake auth payload if cookie is not sent
        token: document.cookie.split('; ').find(row => row.startsWith('access_token='))?.split('=')[1] || ''
      },
      withCredentials: true
    });

    socketRef.current = socket;

    if (onEventMap) {
      Object.entries(onEventMap).forEach(([event, handler]) => {
        socket.on(event, handler);
      });
    }

    return () => {
      if (onEventMap) {
        Object.keys(onEventMap).forEach((event) => {
          socket.off(event);
        });
      }
      socket.disconnect();
    };
  }, [user, onEventMap]);

  return socketRef.current;
}
