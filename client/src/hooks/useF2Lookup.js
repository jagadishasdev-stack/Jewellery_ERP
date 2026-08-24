/**
 * Per-field F2 lookup — wires a single <Select> (bound to some master
 * list: item type, purity, branch, vendor, ...) so pressing the tenant's
 * "lookup" key (F2 by default) while it's focused opens its dropdown,
 * i.e. shows every option for that field, same as clicking it.
 *
 * Deliberately a thin hook rather than a wrapper component — it drops
 * into an EXISTING <Select> with 3 extra props, so retrofitting more
 * fields later (this pass covers the busiest transactional pages, not
 * literally every Select in the app) is a one-line change per field:
 *
 *   const purityLookup = useF2Lookup();
 *   <Select open={purityLookup.open} onDropdownVisibleChange={purityLookup.onOpenChange}
 *           onKeyDown={purityLookup.onKeyDown} ...>
 *
 * For large/paginated master data that already has its own dedicated
 * search modal (e.g. POSPage.jsx's CustomerSearchModal), wire F2 at the
 * page level instead via useActionShortcuts({ onLookup: ... }) — this
 * hook is specifically for the "the dropdown's full option list IS the
 * lookup" case.
 */
import { useState } from 'react';
import { useShortcuts } from '../contexts/ShortcutContext';
import { matchesShortcut } from '../utils/shortcuts';

export function useF2Lookup() {
  const [open, setOpen] = useState(false);
  const { shortcuts } = useShortcuts();

  const onKeyDown = (e) => {
    if (matchesShortcut(e, shortcuts.lookup)) {
      e.preventDefault();
      setOpen(true);
    }
  };

  return { open, onOpenChange: setOpen, onKeyDown };
}
