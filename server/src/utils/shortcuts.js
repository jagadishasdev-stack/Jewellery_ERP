/**
 * Single source of truth for the app's keyboard-shortcut system — mirrored
 * by client/src/utils/shortcuts.js so the same action names/keys mean the
 * same thing on both sides (same drift risk/lesson as PAYMENT_LEDGER and
 * METAL_TYPES elsewhere in this codebase).
 *
 * STANDARD_ACTIONS is the fixed set of actions every page wires the SAME
 * way (Save/New/Search/Print/Cancel), plus 'lookup' — the F2 contextual
 * lookup that opens whatever master-data list the focused field points to.
 * A tenant can remap any of these (see tbl_tenant_shortcuts /
 * routes/superAdmin.js's shortcut endpoints) — everything else about how
 * a page wires its Save/New/etc. handler stays exactly the same, only the
 * key combo that triggers it changes.
 */
const STANDARD_ACTIONS = ['save', 'new', 'search', 'print', 'cancel', 'lookup'];

const DEFAULT_SHORTCUTS = {
  save: 'F10',
  new: 'Alt+N',
  search: 'Ctrl+F',
  print: 'Ctrl+P',
  cancel: 'Escape',
  lookup: 'F2',
};

/**
 * Merges a tenant's stored overrides (only the keys they've actually
 * changed) on top of the defaults — a tenant with no row, or a row with
 * an empty object, behaves identically to system defaults.
 */
function resolveShortcuts(overrides) {
  return { ...DEFAULT_SHORTCUTS, ...(overrides || {}) };
}

/**
 * A combo string looks like "Ctrl+F", "Alt+N", "F10", "Escape" — one
 * optional modifier (Ctrl/Alt/Shift, case-insensitive) plus a key name.
 * Loose validation on purpose: this only guards against empty/garbage
 * values reaching storage, not against every conceivable typo.
 */
function isValidCombo(combo) {
  return typeof combo === 'string' && /^([A-Za-z]+\+)?[A-Za-z0-9]+$/.test(combo.trim());
}

module.exports = { STANDARD_ACTIONS, DEFAULT_SHORTCUTS, resolveShortcuts, isValidCombo };
