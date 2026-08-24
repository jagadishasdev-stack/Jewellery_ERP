/**
 * Recent Windows — remembers the pages a user has actually visited (most
 * recent first) so they can jump straight back via the RecentWindows panel
 * (components/RecentWindows.jsx). Persisted in localStorage per browser —
 * intentionally NOT tenant/user scoped beyond that, same as other client-only
 * UI preferences in this app.
 */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

const MAX_ITEMS = 12;

export const useRecentWindowsStore = create(
  persist(
    (set, get) => ({
      windows: [], // [{ path, label, group, visitedAt }], most recent first

      recordVisit: (path, label, group) => {
        if (!path) return;
        const existing = get().windows.filter((w) => w.path !== path);
        const next = [{ path, label: label || path, group, visitedAt: Date.now() }, ...existing].slice(0, MAX_ITEMS);
        set({ windows: next });
      },

      removeWindow: (path) => set({ windows: get().windows.filter((w) => w.path !== path) }),

      clear: () => set({ windows: [] }),
    }),
    {
      name: 'jewellery-recent-windows',
      storage: createJSONStorage(() => localStorage),
    }
  )
);
