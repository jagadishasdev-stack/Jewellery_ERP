// The metal-type LIST itself is no longer hardcoded here — it's live,
// admin-editable data (Master Management > Metal & Purity > Metal Type
// Master, backed by tbl_metal_type_master) fetched via useMetalTypes()
// (client/src/hooks/useMetalTypes.js). This file now only keeps the
// display-only color mapping, which isn't part of "is this a valid metal
// type" at all — a custom metal type with no entry here just falls back to
// the default tag color wherever it's rendered.
export const METAL_TYPE_COLORS = {
  Gold: 'gold',
  Silver: 'default',
  Platinum: 'blue',
  Diamond: 'purple',
};
