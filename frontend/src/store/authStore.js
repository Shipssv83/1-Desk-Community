import { create } from 'zustand';
import apiClient from '../api/client';

export const useAuthStore = create((set) => ({
  user: null,
  isLoading: true,
  setUser: (user) => set({ user: user || null, isLoading: false }),
  updateUser: (patch) => set((s) => ({ user: s.user ? { ...s.user, ...patch } : s.user })),
  clearUser: () => set({ user: null, isLoading: false }),
  checkAuth: async () => {
    try {
      const response = await apiClient.get('/auth/me');
      set({ user: response.data.user, isLoading: false });
    } catch (err) {
      set({ user: null, isLoading: false });
    }
  }
}));
