import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import api from '../api/axios';

export const useAuthStore = create(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      refreshToken: null,
      sessionId: null,
      isAuthenticated: false,

      initAuth: () => {
        const { token, user } = get();
        if (token && user) {
          api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
          set({ isAuthenticated: true });
        }
      },

      login: async (credentials) => {
        const { data } = await api.post('/auth/login', credentials);
        if (data.success) {
          const { token, refreshToken, sessionId, user } = data.data;
          api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
          set({ token, refreshToken, sessionId, user, isAuthenticated: true });
          return data.data;
        }
        throw new Error(data.message);
      },

      logout: async () => {
        try {
          const { sessionId } = get();
          await api.post('/auth/logout', { sessionId });
        } catch (_) {}
        delete api.defaults.headers.common['Authorization'];
        set({ user: null, token: null, refreshToken: null, sessionId: null, isAuthenticated: false });
      },

      refreshAuth: async () => {
        const { refreshToken } = get();
        if (!refreshToken) return;
        try {
          const { data } = await api.post('/auth/refresh', { refreshToken });
          if (data.success) {
            api.defaults.headers.common['Authorization'] = `Bearer ${data.data.token}`;
            set({ token: data.data.token });
          }
        } catch (_) {
          get().logout();
        }
      },
    }),
    {
      name: 'jewellery-erp-auth',
      partialize: (state) => ({
        user: state.user,
        token: state.token,
        refreshToken: state.refreshToken,
        sessionId: state.sessionId,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);
