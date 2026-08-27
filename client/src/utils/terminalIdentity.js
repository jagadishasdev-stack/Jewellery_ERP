/**
 * Terminal identity (Printer Setup spec §18) — a stable id for THIS
 * specific computer/browser, so it can have its own printer assignments
 * separate from other computers at the same branch ("Billing Computer 1"
 * printing Sales Bills to a different printer than "Accounts Computer").
 *
 * The server has no way to recognize "the same browser" across requests
 * on its own — this id is generated once, here, and persisted in
 * localStorage, exactly the same pattern erp_branch_id (BranchContext.jsx)
 * already uses for "this browser's chosen branch." crypto.randomUUID() is
 * a standard Web Crypto API call, available identically in every modern
 * browser on both macOS and Windows — nothing platform-specific.
 */
const STORAGE_KEY = 'erp_terminal_id';

const generateId = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  // Fallback for a browser without crypto.randomUUID (very old) — not
  // cryptographically strong, but this is a local device label, not a
  // security token, so that's fine.
  return `term-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
};

/** Returns this browser's terminal id, generating and persisting one on first use. */
export const getTerminalId = () => {
  try {
    let id = localStorage.getItem(STORAGE_KEY);
    if (!id) {
      id = generateId();
      localStorage.setItem(STORAGE_KEY, id);
    }
    return id;
  } catch {
    // localStorage unavailable (private browsing edge cases, etc.) — fall
    // back to an in-memory id for this page load only; terminal-level
    // config just won't persist across reloads, tenant/branch config
    // still works exactly as before.
    return generateId();
  }
};
