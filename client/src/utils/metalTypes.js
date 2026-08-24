// Mirrors server/src/utils/metalTypes.js — kept as one small shared list so
// every dropdown/filter/tag color across Inventory pages and reports agrees
// on the same four values instead of drifting.
export const METAL_TYPES = ['Gold', 'Silver', 'Platinum', 'Diamond'];

// Purity (karat/fineness) doesn't apply to a Diamond stock item.
export const METAL_TYPES_WITH_PURITY = ['Gold', 'Silver', 'Platinum'];

export const METAL_TYPE_COLORS = {
  Gold: 'gold',
  Silver: 'default',
  Platinum: 'blue',
  Diamond: 'purple',
};
