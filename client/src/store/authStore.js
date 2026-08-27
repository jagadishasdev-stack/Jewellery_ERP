import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import api from '../api/axios';
import { authApi } from '../api/modules';

export const useAuthStore = create(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      refreshToken: null,
      sessionId: null,
      isAuthenticated: false,
      // Deliberately NOT in partialize below — set true only by a real
      // login() call, so it resets to false on every page refresh/rehydrate
      // rather than persisting. This is what tells SplashGate.jsx to show
      // the post-login splash/welcome screen once per actual login, not
      // every time the app reloads.
      justLoggedIn: false,
      dismissSplash: () => set({ justLoggedIn: false }),

      initAuth: () => {
        const { token, user } = get();
        if (token && user) {
          api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
          set({ isAuthenticated: true });
        }
      },

      login: async (credentials) => {
        const { data } = await authApi.login(credentials);
        if (data.success) {
          const { token, refreshToken, sessionId, user } = data.data;
          api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
          set({ token, refreshToken, sessionId, user, isAuthenticated: true, justLoggedIn: true });
          return data.data;
        }
        throw new Error(data.message);
      },

      logout: async () => {
        try {
          const { sessionId } = get();
          await authApi.logout(sessionId);
        } catch (_) {}
        delete api.defaults.headers.common['Authorization'];
        set({ user: null, token: null, refreshToken: null, sessionId: null, isAuthenticated: false });
      },

      refreshAuth: async () => {
        const { refreshToken } = get();
        if (!refreshToken) return;
        try {
          const { data } = await authApi.refresh(refreshToken);
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
