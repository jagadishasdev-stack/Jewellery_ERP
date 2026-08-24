// Mirrors server/src/utils/shortcuts.js — same action names and default
// keys on both sides, so a tenant's stored override always means the same
// thing whether it's being validated on write (server) or matched on a
// real keydown (here).
export const STANDARD_ACTIONS = ['save', 'new', 'search', 'print', 'cancel', 'lookup'];

export const DEFAULT_SHORTCUTS = {
  save: 'F10',
  new: 'Alt+N',
  search: 'Ctrl+F',
  print: 'Ctrl+P',
  cancel: 'Escape',
  lookup: 'F2',
};

export const ACTION_LABELS = {
  save: 'Save',
  new: 'New / Add',
  search: 'Search',
  print: 'Print',
  cancel: 'Cancel / Close',
  lookup: 'Lookup (open list for the focused field)',
};

/**
 * Does this KeyboardEvent match a combo string like "Ctrl+F", "Alt+N",
 * "F10", "Escape"? One optional modifier plus a key name, same format
 * isValidCombo() on the server accepts.
 */
export function matchesShortcut(event, combo) {
  if (!combo) return false;
  const parts = combo.split('+').map((p) => p.trim());
  const key = parts.pop();
  const mods = parts.map((p) => p.toLowerCase());

  const wantCtrl = mods.includes('ctrl');
  const wantAlt = mods.includes('alt');
  const wantShift = mods.includes('shift');

  // event.ctrlKey/altKey/shiftKey must match exactly — a plain "F2" combo
  // must NOT fire while some other modifier is also held, otherwise it'd
  // steal keystrokes from combos that happen to end in the same key.
  if (event.ctrlKey !== wantCtrl) return false;
  if (event.altKey !== wantAlt) return false;
  if (event.shiftKey !== wantShift) return false;

  return event.key.toLowerCase() === key.toLowerCase();
}
