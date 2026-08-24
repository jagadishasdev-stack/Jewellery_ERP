/**
 * Wires a page's Save/New/Search/Print/Cancel handlers to the CURRENT
 * tenant's resolved key combos (ShortcutContext) — a page never hardcodes
 * "Ctrl+S" or "F10" itself, so remapping a tenant's keys (Super Admin ->
 * PUT /api/super-admin/tenant/:id/shortcuts) takes effect on every page
 * that uses this hook without touching page code.
 *
 * Usage:
 *   useActionShortcuts({
 *     onSave: () => form.submit(),         // fires on the tenant's "save" key
 *     onNew: () => setModalOpen(true),      // fires on the tenant's "new" key
 *   });
 *
 * Only pass the handlers that make sense for the current page/state (e.g.
 * omit onSave entirely while no form is open) — an action with no handler
 * simply doesn't intercept that key, so browser/OS defaults (Ctrl+P
 * printing, Ctrl+F finding, Escape closing whatever's focused) still work
 * normally wherever the page hasn't opted in.
 */
import { useEffect } from 'react';
import { useShortcuts } from '../contexts/ShortcutContext';
import { matchesShortcut } from '../utils/shortcuts';

export function useActionShortcuts({ onSave, onNew, onSearch, onPrint, onCancel, onLookup, enabled = true } = {}) {
  const { shortcuts } = useShortcuts();

  useEffect(() => {
    if (!enabled) return;
    const handlers = { save: onSave, new: onNew, search: onSearch, print: onPrint, cancel: onCancel, lookup: onLookup };

    const handleKeyDown = (e) => {
      for (const [action, combo] of Object.entries(shortcuts)) {
        const handler = handlers[action];
        if (!handler) continue;
        if (matchesShortcut(e, combo)) {
          e.preventDefault();
          handler(e);
          return; // one combo can't match two actions since each action's key differs
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shortcuts, enabled, onSave, onNew, onSearch, onPrint, onCancel, onLookup]);
}
