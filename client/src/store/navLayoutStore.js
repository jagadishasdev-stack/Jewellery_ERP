/**
 * navLayoutStore — personal preference: sidebar navigation (the original,
 * default layout) vs a top-header navigation bar built from the exact
 * same menu items. Set per-device via DisplaySettingsPage's "Navigation
 * Layout" tab, persisted in localStorage — this is a per-person UI
 * preference, not a tenant-wide setting (unlike uiThemeStore, which IS
 * tenant-wide and server-fetched), so plain zustand+persist is enough;
 * no backend route needed.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const useNavLayoutStore = create(
  persist(
    (set) => ({
      layout: 'sidebar', // 'sidebar' | 'header'
      setLayout: (layout) => set({ layout }),
    }),
    { name: 'jewellery-erp-nav-layout' }
  )
);
