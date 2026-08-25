import React, { useMemo } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ConfigProvider, App as AntApp } from 'antd';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import App from './App';
import { DataModeProvider } from './contexts/DataModeContext';
import { BranchProvider } from './contexts/BranchContext';
import { ShortcutProvider } from './contexts/ShortcutContext';
import { useUiThemeStore } from './store/uiThemeStore';
import './index.css';

dayjs.extend(relativeTime);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 5 * 60 * 1000, retry: 1 },
  },
});

// ── Premium JewelSphere theme ─────────────────────────────────────────────────
// A function, not a static object — ThemedApp below rebuilds it whenever the
// tenant's saved theme (uiThemeStore, set from tbl_tenant_ui_theme) changes,
// so antd's own components (which read tokens at render time, not CSS vars)
// pick up the admin's font/color choice too.
const buildErpTheme = (theme) => {
  const primary = theme?.Primary_Color || '#B8860B';
  const fontFamily = theme?.Font_Family
    ? `'${theme.Font_Family}', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`
    : "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
  const fontWeightStrong = theme?.Font_Weight ? Math.min(800, theme.Font_Weight + 100) : 600;
  return {
  token: {
    colorPrimary:        primary,
    colorLink:           primary,
    colorLinkHover:      '#D4A017',
    fontFamily,
    fontSize:            14,
    fontSizeSM:          12,
    fontSizeLG:          16,
    fontWeightStrong,
    borderRadius:        8,
    borderRadiusLG:      10,
    borderRadiusSM:      6,
    borderRadiusXS:      4,
    colorBgBase:         '#ffffff',
    colorBgLayout:       '#F4F5F7',
    colorBgContainer:    '#ffffff',
    colorBorder:         '#E8E8E8',
    colorBorderSecondary:'#F0F0F0',
    colorText:           '#1a1a2e',
    colorTextSecondary:  '#666666',
    colorTextTertiary:   '#999999',
    controlHeight:       36,
    controlHeightLG:     42,
    controlHeightSM:     28,
    padding:             16,
    paddingLG:           24,
    paddingSM:           12,
    margin:              16,
    marginLG:            24,
    marginSM:            12,
  },
  components: {
    Layout: {
      siderBg:  '#1A1A1A',
      headerBg: '#ffffff',
      bodyBg:   '#F4F5F7',
    },
    Menu: {
      darkItemBg:            '#1A1A1A',
      darkSubMenuItemBg:     '#222222',
      darkItemSelectedBg:    primary,
      darkItemSelectedColor: '#ffffff',
      darkItemHoverBg:       '#2A2A2A',
      darkItemHoverColor:    '#FFD700',
      darkItemColor:         '#CCCCCC',
      itemBorderRadius:       6,
    },
    Card: {
      borderRadiusLG: 10,
      boxShadow:      '0 1px 3px rgba(0,0,0,.08)',
    },
    Button: { borderRadius: 8, fontWeight: 500 },
    Table:  {
      borderRadius:  10,
      headerBg:      '#FAFAFA',
      headerColor:   '#555555',
      fontSize:       13,
      rowHoverBg:    '#FFF8E7',
    },
    Modal:      { borderRadiusLG: 12 },
    Drawer:     { borderRadiusLG: 12 },
    Input:      { borderRadius: 8 },
    Select:     { borderRadius: 8 },
    DatePicker: { borderRadius: 8 },
    Tag:        { borderRadius: 4, fontSize: 11 },
    Form:       { labelFontSize: 12, itemMarginBottom: 14 },
    Alert:      { borderRadius: 8 },
  },
  };
};

// Rebuilds the antd theme whenever the tenant's saved UI theme changes —
// antd components read theme tokens at render time, so this must be a real
// React re-render, unlike index.css's CSS-variable-driven styling.
function ThemedApp() {
  const theme = useUiThemeStore((s) => s.theme);
  const erpTheme = useMemo(() => buildErpTheme(theme), [theme]);

  return (
    <ConfigProvider theme={erpTheme}>
      <AntApp>
        <BrowserRouter>
          <DataModeProvider>
            <BranchProvider>
              <ShortcutProvider>
                <App />
              </ShortcutProvider>
            </BranchProvider>
          </DataModeProvider>
        </BrowserRouter>
      </AntApp>
    </ConfigProvider>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemedApp />
    </QueryClientProvider>
  </React.StrictMode>
);
