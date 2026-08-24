/**
 * DataModeContext — Three-mode ERP workspace
 * ─────────────────────────────────────────────
 * Mode 1 = Dummy / Practice  (dark blue theme, Ctrl+F12 toggle)
 * Mode 2 = Unofficial ERP    (red theme,       Ctrl+F5 toggle)
 * Mode 3 = Official ERP      (blue theme, default)
 *
 * No on-screen button — keyboard-only by design:
 *   Ctrl+F5  → toggle Unofficial (back to Official if already non-Official)
 *   Ctrl+F12 → toggle Practice   (back to Official if already non-Official)
 *
 * Switching modes triggers an immediate hard navigation to the Dashboard so
 * every query refetches cleanly under the new X-Data-Mode header — no stale
 * state, and no risk of staying on a page that doesn't make sense in the
 * new mode.
 *
 * Every API call made through the apiClient in this context
 * automatically receives the X-Data-Mode header.
 */
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

export const DataModeContext = createContext();

export const MODE = {
  DUMMY:      1,
  UNOFFICIAL: 2,
  OFFICIAL:   3,
};

export const MODE_CONFIG = {
  [MODE.DUMMY]: {
    label:       'Practice Mode',
    shortLabel:  'PRACTICE',
    description: 'Dummy / test data. Not real.',
    headerColor: '#93c5fd',   // dark blue theme
    headerBg:    '#0b1e3f',
    badgeColor:  '#dbeafe',
    badgeBg:     '#1e3a8a',
    borderColor: '#3b82f6',
    emoji:       '🎮',
  },
  [MODE.UNOFFICIAL]: {
    label:       'Unofficial ERP',
    shortLabel:  'UNOFFICIAL',
    description: 'Unofficial business data.',
    headerColor: '#dc2626',   // red
    headerBg:    '#fef2f2',
    badgeColor:  '#991b1b',
    badgeBg:     '#fee2e2',
    borderColor: '#f87171',
    emoji:       '🔴',
  },
  [MODE.OFFICIAL]: {
    label:       'Official ERP',
    shortLabel:  'OFFICIAL',
    description: 'Official registered business.',
    headerColor: '#1d4ed8',   // blue
    headerBg:    '#eff6ff',
    badgeColor:  '#1e3a8a',
    badgeBg:     '#dbeafe',
    borderColor: '#93c5fd',
    emoji:       '🔵',
  },
};

const STORAGE_KEY = 'erp_data_mode';

export const DataModeProvider = ({ children }) => {
  // Persist mode across page refreshes (but not across browser sessions via sessionStorage)
  const [dataMode, setDataMode] = useState(() => {
    const stored = parseInt(sessionStorage.getItem(STORAGE_KEY), 10);
    return [1, 2, 3].includes(stored) ? stored : MODE.OFFICIAL;
  });

  // Persist to sessionStorage whenever mode changes
  useEffect(() => {
    sessionStorage.setItem(STORAGE_KEY, String(dataMode));
  }, [dataMode]);

  // ── Keyboard shortcut handler ────────────────────────────────────────────────
  // Writes straight to sessionStorage and reloads immediately — no on-screen
  // button, no waiting on a React re-render, mode switch takes effect instantly.
  useEffect(() => {
    const switchAndReload = (targetMode) => {
      const current = parseInt(sessionStorage.getItem(STORAGE_KEY), 10) || MODE.OFFICIAL;
      const next = current === targetMode ? MODE.OFFICIAL : targetMode;
      sessionStorage.setItem(STORAGE_KEY, String(next));
      // Hard-navigate to the Dashboard rather than reloading whatever page you're
      // on — switching modes should always land you on a fresh, mode-appropriate
      // screen, not leave you staring at a page built for the old mode.
      window.location.href = '/dashboard';
    };

    const handleKeyDown = (e) => {
      // Ctrl+F12 → toggle Practice (1) — checked first since it also holds Ctrl
      if (e.ctrlKey && e.key === 'F12') {
        e.preventDefault();
        switchAndReload(MODE.DUMMY);
        return;
      }
      // Ctrl+F5 → toggle Unofficial (2)
      if (e.ctrlKey && e.key === 'F5') {
        e.preventDefault();
        switchAndReload(MODE.UNOFFICIAL);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const switchMode = useCallback((mode) => {
    if ([1, 2, 3].includes(mode)) setDataMode(mode);
  }, []);

  const config = MODE_CONFIG[dataMode];
  const isOfficial   = dataMode === MODE.OFFICIAL;
  const isUnofficial = dataMode === MODE.UNOFFICIAL;
  const isDummy      = dataMode === MODE.DUMMY;

  return (
    <DataModeContext.Provider value={{
      dataMode,
      switchMode,
      config,
      isOfficial,
      isUnofficial,
      isDummy,
      MODE,
      MODE_CONFIG,
    }}>
      {children}
    </DataModeContext.Provider>
  );
};

export const useDataMode = () => useContext(DataModeContext);
