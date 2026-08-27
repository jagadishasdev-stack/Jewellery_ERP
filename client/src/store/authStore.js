import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import api from '../api/axios';
import { authApi, superAdminApi } from '../api/modules';

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

      // ── Super Admin "log in as tenant" ────────────────────────────────────
      // Not in partialize below (session-only, deliberately never persisted
      // across a refresh) — stashes the Super Admin's own real session
      // before switching so endImpersonation() can restore it exactly,
      // rather than forcing a re-login. Server mints a genuinely separate,
      // short-lived (2h) token for the target tenant's own user — see
      // superAdmin.js's /impersonate route.
      impersonation: null,
      impersonatorSession: null,
      startImpersonation: async (tenantId, userId) => {
        const { data } = await superAdminApi.impersonate(tenantId, userId);
        if (!data.success) throw new Error(data.message);
        const { token, user, impersonation } = data.data;
        const current = get();
        set({
          impersonatorSession: {
            token: current.token, refreshToken: current.refreshToken,
            sessionId: current.sessionId, user: current.user,
          },
          token, user, impersonation,
        });
        api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
        return data.data;
      },
      endImpersonation: async () => {
        try { await superAdminApi.endImpersonation(); } catch (_) { /* best-effort — the audit note, not the restore, is what can fail silently */ }
        const { impersonatorSession } = get();
        if (!impersonatorSession) return;
        const { token, refreshToken, sessionId, user } = impersonatorSession;
        set({ token, refreshToken, sessionId, user, impersonation: null, impersonatorSession: null });
        api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
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
        // impersonation/impersonatorSession deliberately excluded — an
        // impersonation session should never survive a page refresh as if
        // it were a normal login; refreshing mid-impersonation just means
        // logging in again for real.
      }),
    }
  )
);
