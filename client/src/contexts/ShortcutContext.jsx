/**
 * ShortcutContext — the tenant's resolved keyboard-shortcut map.
 *
 * Fetched from GET /api/tenant/shortcuts (server merges this tenant's
 * overrides onto the system defaults — see server/src/utils/shortcuts.js).
 * Pages never hardcode a key combo themselves; they call
 * useActionShortcuts() (hooks/useActionShortcuts.js) with their
 * Save/New/Search/Print/Cancel handlers, and that hook reads the CURRENT
 * tenant's keys from here — so when a Super Admin remaps a tenant's
 * shortcuts (superAdmin.js), every page that uses the hook picks up the
 * new keys with no per-page change needed.
 *
 * refetchInterval polls every 60s and refetchOnWindowFocus catches the
 * common case (tab was in the background while an admin changed keys) —
 * an already-open session picks up a change within ~1 minute rather than
 * waiting for the next login. Not instant, but close enough for an
 * admin-managed setting nobody's expected to change mid-transaction.
 */
import React, { createContext, useContext } from 'react';
import { useQuery } from '@tanstack/react-query';
import { shortcutsApi } from '../api/modules';
import { DEFAULT_SHORTCUTS } from '../utils/shortcuts';
import { useAuthStore } from '../store/authStore';

const ShortcutContext = createContext({ shortcuts: DEFAULT_SHORTCUTS, isLoading: false });

export const ShortcutProvider = ({ children }) => {
  const { token } = useAuthStore();
  const { data, isLoading } = useQuery({
    queryKey: ['tenant-shortcuts'],
    queryFn: () => shortcutsApi.get().then((r) => r.data.data),
    enabled: !!token,
    staleTime: 60 * 1000,
    refetchInterval: 60 * 1000,
    refetchOnWindowFocus: true,
    // A tenant with no row/overrides yet still needs SOMETHING to render
    // with before the first fetch resolves — the same defaults the
    // server itself would return in that case.
    placeholderData: DEFAULT_SHORTCUTS,
  });

  return (
    <ShortcutContext.Provider value={{ shortcuts: data || DEFAULT_SHORTCUTS, isLoading }}>
      {children}
    </ShortcutContext.Provider>
  );
};

export const useShortcuts = () => useContext(ShortcutContext);
