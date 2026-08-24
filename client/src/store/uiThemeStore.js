/**
 * uiThemeStore — the tenant-wide UI theme (font family/weight, primary
 * color, text case), set by an admin on ThemeSettingsPage.jsx and applied
 * for every user of the tenant (fetched fresh on load, not a personal
 * per-device preference — see server/src/routes/tenant.js's /ui-theme
 * routes and tbl_tenant_ui_theme).
 *
 * Applying the theme is just CSS custom properties on <html> — index.css's
 * rules read these variables, so setting them here is enough to repaint the
 * whole app instantly, no per-component wiring needed.
 */
import { create } from 'zustand';

export const FONT_OPTIONS = [
  { key: 'Inter', label: 'Inter (Default)', googleFont: null },
  { key: 'Roboto', label: 'Roboto', googleFont: 'Roboto:wght@300;400;500;600;700;800' },
  { key: 'Poppins', label: 'Poppins', googleFont: 'Poppins:wght@300;400;500;600;700;800' },
  { key: 'Montserrat', label: 'Montserrat', googleFont: 'Montserrat:wght@300;400;500;600;700;800' },
  { key: 'Lato', label: 'Lato', googleFont: 'Lato:wght@300;400;700;900' },
  { key: 'Playfair Display', label: 'Playfair Display (Elegant Serif)', googleFont: 'Playfair+Display:wght@400;500;600;700;800' },
  { key: 'Georgia', label: 'Georgia (System Serif)', googleFont: null },
  { key: 'Arial', label: 'Arial (System Sans)', googleFont: null },
];

export const FONT_WEIGHT_OPTIONS = [
  { key: 300, label: 'Light (300)' },
  { key: 400, label: 'Normal (400)' },
  { key: 500, label: 'Medium (500)' },
  { key: 600, label: 'Semibold (600)' },
  { key: 700, label: 'Bold (700)' },
  { key: 800, label: 'Extra Bold (800)' },
];

export const TEXT_CASE_OPTIONS = [
  { key: 'none', label: 'Normal (as typed)' },
  { key: 'uppercase', label: 'UPPERCASE' },
  { key: 'lowercase', label: 'lowercase' },
];

const GOOGLE_FONT_LINK_ID = 'dynamic-google-font';

const ensureGoogleFontLoaded = (fontKey) => {
  const opt = FONT_OPTIONS.find((f) => f.key === fontKey);
  let link = document.getElementById(GOOGLE_FONT_LINK_ID);
  if (!opt?.googleFont) {
    if (link) link.remove();
    return;
  }
  const href = `https://fonts.googleapis.com/css2?family=${opt.googleFont}&display=swap`;
  if (!link) {
    link = document.createElement('link');
    link.id = GOOGLE_FONT_LINK_ID;
    link.rel = 'stylesheet';
    document.head.appendChild(link);
  }
  if (link.href !== href) link.href = href;
};

// Lightens a #RRGGBB hex color by `amount` (0-1) toward white — used to
// derive the secondary gradient shade (--gold-light) from one chosen color.
const lightenColor = (hex, amount = 0.2) => {
  const n = hex.replace('#', '');
  if (n.length !== 6) return hex;
  const r = parseInt(n.slice(0, 2), 16), g = parseInt(n.slice(2, 4), 16), b = parseInt(n.slice(4, 6), 16);
  const mix = (c) => Math.round(c + (255 - c) * amount);
  return `#${[mix(r), mix(g), mix(b)].map((c) => c.toString(16).padStart(2, '0')).join('')}`;
};

export const applyThemeToDocument = (theme) => {
  if (!theme) return;
  const root = document.documentElement;
  const primary = theme.Primary_Color || '#B8860B';
  root.style.setProperty('--gold', primary);
  root.style.setProperty('--gold-light', lightenColor(primary, 0.18));
  root.style.setProperty('--app-font-family', `'${theme.Font_Family || 'Inter'}', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`);
  root.style.setProperty('--app-font-weight', String(theme.Font_Weight || 400));
  root.style.setProperty('--app-text-case', theme.Text_Case && theme.Text_Case !== 'none' ? theme.Text_Case : 'none');
  ensureGoogleFontLoaded(theme.Font_Family || 'Inter');
};

export const useUiThemeStore = create((set) => ({
  theme: null, // { Font_Family, Font_Weight, Primary_Color, Text_Case }

  setTheme: (theme) => {
    applyThemeToDocument(theme);
    set({ theme });
  },
}));
