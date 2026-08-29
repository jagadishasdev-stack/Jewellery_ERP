/**
 * MainLayout — Responsive ERP Shell
 * ─────────────────────────────────
 * Desktop : Fixed sidebar (240px) + sticky header + content
 * Tablet  : Collapsible sidebar (80px collapsed) + header
 * Mobile  : Hidden sidebar → hamburger opens Drawer + bottom navigation bar
 *
 * Zero functionality changes — only UI/UX improvements.
 */
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import {
  Layout, Menu, Avatar, Dropdown, Badge, Typography, Space,
  Tag, Tooltip, Drawer, Button, Grid, Modal, Input, Empty, Form, message,
} from 'antd';
import {
  DashboardOutlined, ShoppingCartOutlined, AppstoreOutlined,
  TeamOutlined, BarChartOutlined, FileTextOutlined, SettingOutlined,
  UserOutlined, LogoutOutlined, GoldOutlined, KeyOutlined,
  MenuFoldOutlined, MenuUnfoldOutlined,
  ApartmentOutlined, ToolOutlined, SafetyOutlined,
  MenuOutlined, CloseOutlined, HomeOutlined, ShopOutlined,
  WalletOutlined, PieChartOutlined, SearchOutlined, SwapOutlined,
  QuestionCircleOutlined, BankOutlined, ContactsOutlined, LineChartOutlined,
  FileProtectOutlined, BuildOutlined, SyncOutlined, SafetyCertificateOutlined,
  DesktopOutlined,
} from '@ant-design/icons';
import { useMutation } from '@tanstack/react-query';
import { useAuthStore } from '../../store/authStore';
import { useModules } from '../../hooks/useModules';
import { useDataMode } from '../../contexts/DataModeContext';
import BranchSelector from './BranchSelector';
import { authApi } from '../../api/modules';
import GoldRateBar from '../GoldRateBar';
import RecentWindows from '../RecentWindows';
import NotificationBell from '../NotificationBell';
import { useRecentWindowsStore } from '../../store/recentWindowsStore';
import { useUiThemeStore } from '../../store/uiThemeStore';
import { useNavLayoutStore } from '../../store/navLayoutStore';
import SplashGate from '../SplashGate';

const { Sider, Header, Content } = Layout;
const { Text } = Typography;
const { useBreakpoint } = Grid;

// ── Menu items builder ─────────────────────────────────────────────────────────
// Every operational/transactional group below is built EXACTLY as before —
// same key, icon, label, children, same permission/module guard — the only
// change from the pre-reorg version is that each one is now assembled into
// `transactionChildren` instead of being pushed straight into the top-level
// `items` array. Nothing was renamed, merged, or given a new destination;
// this is a pure regrouping under one collapsible "Transaction" menu so the
// sidebar isn't ~15 permanently-expanded top-level groups at once. Genuinely
// ambiguous items (which existing group folds where, whether a module like
// Dealer Transaction gets built at all) were deliberately left OUT of this
// pass — see the Transaction Menu Audit — so nothing here invents a new
// route or resolves a duplicate without sign-off.
const buildMenuItems = (permissions = {}, isEnabled = () => true, isUnofficial = false) => {
  const items = [
    { key: '/dashboard', icon: <DashboardOutlined />, label: 'Dashboard' },
    { key: '/help', icon: <QuestionCircleOutlined style={{ color: '#B8860B' }} />, label: '❓ Help / How to Use' },
  ];

  // ── Groups that fold into the new Transaction menu (built here, pushed below) ──
  let billingGroup = null;
  if (permissions.sales && (isEnabled('retail_sales') || isEnabled('wholesale_sales') || isEnabled('estimate') || isEnabled('order_booking'))) {
    const children = [];
    if (isEnabled('retail_sales') || isEnabled('wholesale_sales')) children.push({ key: '/billing', label: '💎 Billing Center' });
    if (isEnabled('retail_sales')) children.push({ key: '/pos', label: '🛒 Retail POS' });
    if (children.length) billingGroup = { key: 'billing-group', icon: <ShoppingCartOutlined />, label: 'Billing', children };
  }

  let inventoryGroup = null;
  if (permissions.inventory && isEnabled('inventory')) {
    const inventoryChildren = [
      { key: '/inventory', label: 'Stock' },
      { key: '/inventory/add', label: 'Add Stock' },
    ];
    // Special Stock is an operational classification (in-house karigar
    // production, special collections, reserved pieces), NOT a tax/
    // accounting concept — visible in both Official and Unofficial mode,
    // unlike Hidden Stock below which is deliberately mode-gated.
    if (permissions.tenant_management) {
      inventoryChildren.push({ key: '/inventory/special-stock', label: '⭐ Special Stock' });
    }
    inventoryGroup = { key: 'inventory-group', icon: <AppstoreOutlined />, label: 'Inventory', children: inventoryChildren };
  }

  if (isEnabled('inventory')) {
    items.push({
      key: 'catalog-group', icon: <AppstoreOutlined style={{ color: '#B8860B' }} />, label: '🖼️ Product Catalog',
      children: [
        { key: '/catalog', label: '🔍 Barcode Search' },
        { key: '/catalog?tab=exhibition', label: '🏪 Exhibition' },
        { key: '/catalog?tab=designs', label: '💍 By Design' },
        { key: '/catalog?tab=sold', label: '📊 Sold Report' },
      ],
    });
  }

  let purchaseGroup = null;
  if (isEnabled('purchase') || isEnabled('old_gold')) {
    purchaseGroup = {
      key: 'purchase-group', icon: <ShoppingCartOutlined style={{ color: '#B8860B' }} />, label: '🛍️ Purchase',
      children: [
        { key: '/purchase/hub', label: '🥇 Purchase Hub' },
        { key: '/purchase', label: '📜 Purchase History' },
        // The only page that can create/edit a Supplier record was
        // gated behind the Karigar menu below, which needs Goldsmith or
        // Manufacturing enabled — a pure Retailer/Wholesaler tenant with
        // just Purchase on could never reach it. Same page, reachable
        // from here too now.
        { key: '/karigar', label: '🏭 Suppliers / Vendors' },
      ],
    };
  }

  let karigarGroup = null;
  if (permissions.karigar_management && (isEnabled('goldsmith') || isEnabled('manufacturing'))) {
    karigarGroup = {
      key: 'karigar-group', icon: <GoldOutlined />, label: 'Karigar / Goldsmith',
      children: [
        { key: '/karigar', label: 'Karigar List' },
        { key: '/karigar/issue', label: 'Issue Gold' },
        { key: '/karigar/return', label: 'Return Goods' },
        { key: '/karigar/settlement', label: 'Settlement' },
      ],
    };
  }

  let approvalGroup = null;
  if (permissions.approval_management && isEnabled('approval_module')) {
    approvalGroup = {
      key: 'approval-group', icon: <SwapOutlined style={{ color: '#B8860B' }} />, label: '🔄 Approval Out',
      children: [
        { key: '/approval', label: 'Pending Approvals' },
        { key: '/approval/issue', label: 'Issue on Approval' },
        { key: '/approval/receive', label: 'Receive Against Voucher' },
        { key: '/approval/completed', label: 'Completed / History' },
        { key: '/approval/non-tag/issue', label: 'Non-Tagged Issue' },
        { key: '/approval/non-tag/receive', label: 'Non-Tagged Receive' },
        { key: '/approval/parties', label: 'Party Master' },
      ],
    };
  }

  let repairGroup = null;
  if (isEnabled('repair')) {
    repairGroup = {
      key: 'repair-group', icon: <ToolOutlined />, label: 'Repair',
      children: [
        { key: '/repair', label: 'Repair Orders' },
        { key: '/repair/job-cards', label: '🔧 Job Cards' },
      ],
    };
  }

  if (isEnabled('pawnbroking')) {
    items.push({ key: '/pawnbroking', icon: <BankOutlined />, label: 'Pawnbroking' });
  }

  let insuranceItem = null;
  if (isEnabled('insurance_amc')) {
    insuranceItem = { key: '/insurance-amc', icon: <SafetyOutlined />, label: 'Insurance & AMC' };
  }

  if (isEnabled('hr_payroll')) {
    items.push({ key: '/hr-payroll', icon: <TeamOutlined />, label: 'HR & Payroll' });
  }

  if (isEnabled('crm')) {
    items.push({ key: '/crm', icon: <ContactsOutlined />, label: 'CRM' });
  }

  if (isEnabled('bank_cheque')) {
    items.push({ key: '/bank-cheque', icon: <BankOutlined />, label: 'Bank & Cheques' });
  }

  // Real double-entry books (Chart of Accounts, Ledger, Trial Balance, Day
  // Book, manual Vouchers) — gated on the Accounts & Finance permission
  // only, same as the reports-group's own accounts check, since this is
  // core bookkeeping rather than an optional add-on module.
  let accountingGroup = null;
  if (permissions.accounts) {
    accountingGroup = {
      key: 'accounting-group', icon: <BankOutlined style={{ color: '#1890ff' }} />, label: '📘 Accounting',
      children: [
        { key: '/accounting', label: '📊 Dashboard' },
        { key: '/accounting/chart-of-accounts', label: '📒 Chart of Accounts' },
        { key: '/accounting/ledger', label: '📖 Ledger' },
        { key: '/accounting/trial-balance', label: '⚖️ Trial Balance' },
        { key: '/accounting/cash-book', label: '💵 Cash Book' },
        { key: '/accounting/bank-book', label: '🏦 Bank Book' },
        { key: '/accounting/profit-loss', label: '📈 Profit & Loss' },
        { key: '/accounting/balance-sheet', label: '📐 Balance Sheet' },
        { key: '/accounting/branch-opening-balances', label: '🏢 Branch Opening Balances' },
        { key: '/accounting/day-book', label: '📅 Day Book' },
        { key: '/accounting/vouchers', label: '✍️ Voucher Entry' },
        { key: '/accounting/financial-year-close', label: '🔒 Financial Year Close' },
      ],
    };
  }

  if (isEnabled('rate_booking_agent_commission')) {
    items.push({ key: '/rate-agent', icon: <LineChartOutlined />, label: 'Rate Booking & Agents' });
  }

  if (isEnabled('hsn_einvoice_loyalty')) {
    items.push({ key: '/compliance', icon: <FileProtectOutlined />, label: 'Compliance' });
  }

  let manufacturingItem = null;
  if (isEnabled('manufacturing_bom')) {
    manufacturingItem = { key: '/manufacturing', icon: <BuildOutlined />, label: 'Manufacturing / BOM' };
  }

  if (isEnabled('guarantor_certification') || isEnabled('reorder_rfid_card_charges')) {
    items.push({ key: '/inventory-ops', icon: <GoldOutlined />, label: 'Cert., Reorder & RFID' });
  }

  if (isEnabled('tally_bridge')) {
    items.push({ key: '/tally', icon: <SyncOutlined />, label: 'Tally Bridge' });
  }

  if (isEnabled('user_permission_overrides')) {
    items.push({ key: '/permissions', icon: <SafetyCertificateOutlined />, label: 'Permission Overrides' });
  }

  let customersItem = null;
  if (isEnabled('customers') || isEnabled('dealers')) {
    customersItem = { key: '/customers', icon: <TeamOutlined />, label: isEnabled('dealers') && !isEnabled('customers') ? 'Dealers' : 'Customers' };
  }

  items.push({ key: '/masters', icon: <SettingOutlined style={{ color: '#B8860B' }} />, label: '⚙️ Master Setup' });

  // ── Master Bin Management ────────────────────────────────────────────────────
  // Each bin is its own module key now — a tenant that never does, say,
  // manufacturing can turn off Pure Gold Bin from Module Management instead
  // of seeing a shortcut to a bin they never use. Dashboard link only shows
  // if at least one bin type is actually enabled (nothing to dash-board otherwise).
  const binChildren = [];
  if (isEnabled('bin_purchase')) binChildren.push({ key: '/bin?tab=purchase', label: '📦 Purchase Bin' });
  if (isEnabled('bin_sales_return')) binChildren.push({ key: '/bin?tab=sales-return', label: '↩️ Sales Return Bin' });
  if (isEnabled('bin_orders')) binChildren.push({ key: '/bin?tab=orders', label: '📋 Order Bin' });
  if (isEnabled('bin_pure_gold')) binChildren.push({ key: '/bin?tab=pure-gold', label: '🥇 Pure Gold Bin' });
  let binGroup = null;
  if (binChildren.length) {
    binGroup = {
      key: 'bin-group',
      icon: <AppstoreOutlined style={{ color: '#B8860B' }} />,
      label: '🗄️ Master Bin',
      children: [{ key: '/bin', label: '📊 Bin Dashboard' }, ...binChildren],
    };
  }

  let savingsGroup = null;
  if (isEnabled('savings_scheme') || isEnabled('digi_gold') || isEnabled('lucky_draw')) {
    savingsGroup = {
      key: 'savings-group', icon: <GoldOutlined style={{ color: '#FFD700' }} />, label: '🪙 Savings Club',
      children: [
        { key: '/savings', label: '📊 Dashboard' },
        { key: '/savings/schemes', label: '📋 Scheme Master' },
        { key: '/savings/groups', label: '👥 Groups' },
        { key: '/savings/members', label: '👤 Members' },
        { key: '/savings/collect', label: '💰 Collection' },
        { key: '/savings/adjustment', label: '🔁 Scheme Adjustment' },
        { key: '/savings/pdc', label: '🏦 PDC Management' },
        { key: '/savings/reports', label: '📈 Reports & Draw' },
        { key: '/savings/agents', label: '🤝 Agent Management' },
      ],
    };
  }

  let floorGroup = null;
  if (isEnabled('floors') || isEnabled('stock_transfer')) {
    const floorChildren = [
      { key: '/floors', label: 'Floors & Counters' },
      { key: '/transfer', label: 'Stock Transfer' },
    ];
    // Hidden Stock only ever appears in the sidebar while in Unofficial mode —
    // it disappears entirely in Official mode, even for admins.
    if (permissions.tenant_management && isUnofficial) {
      floorChildren.push({ key: '/floors/hidden-stock', label: '🔒 Hidden Stock' });
    }
    floorGroup = { key: 'floor-group', icon: <ApartmentOutlined />, label: 'Floor Management', children: floorChildren };
  }

  let reportsGroup = null;
  if ((permissions.accounts || permissions.sales) && isEnabled('reports')) {
    reportsGroup = {
      key: 'reports-group', icon: <BarChartOutlined />, label: '📊 Reports',
      children: [
        { key: '/reports', label: '🏠 Reports Hub' },
        { key: '/reports/sales-bill-history', label: '🧾 Sales Bill History' },
        { key: 'reports-div', type: 'divider' },
        { key: '/reports/sales-reports', label: '📈 Sales Reports' },
        { key: '/reports/inventory-reports', label: '📦 Inventory Reports' },
        { key: '/reports/financial-reports', label: '🏦 Financial Reports' },
        { key: '/reports/customer-reports', label: '👥 Customer Reports' },
        { key: '/reports/gift-vouchers', label: '🎁 Gift Vouchers' },
        { key: '/reports/gst-returns', label: '📄 GST Returns (GSTR-1/3B)' },
        // Both existed and worked (real routes, real pages) but had no
        // menu entry anywhere — unreachable except by typing the URL.
        ...((isEnabled('purchase') || isEnabled('old_gold')) ? [{ key: '/reports/purchase', label: '🛍️ Purchase Reports' }] : []),
        ...((isEnabled('goldsmith') || isEnabled('manufacturing')) ? [{ key: '/reports/karigar', label: '🔨 Karigar Reports' }] : []),
        ...(isEnabled('savings_scheme') ? [{ key: '/reports/scheme-reports', label: '🪙 Scheme Reports' }] : []),
        ...(isEnabled('approval_module') ? [{ key: '/reports/approval', label: '🔄 Approval Reports' }] : []),
        { key: '/reports/management-reports', label: '🎯 Management Reports' },
        { key: '/reports/branch-performance', label: '🏢 Branch Performance' },
        { key: '/reports/closing-report', label: '📊 Closing Report' },
        { key: '/reports/barcode-report', label: '🏷️ Barcode Report' },
        { key: '/reports/vendor-ledger', label: '🏭 Vendor Ledger' },
        { key: 'reports-div2', type: 'divider' },
        { key: '/reports/sales', label: '📜 Legacy Sales' },
        { key: '/reports/day-close', label: '🔒 Day Close' },
      ],
    };
  }

  // ── Assemble the Transaction menu — every operational group above,
  // organized under the section labels from the Transaction Menu spec.
  // A `type: 'group'` entry is just a non-clickable section label in antd's
  // Menu — its children render inline the moment Transaction itself is
  // opened, no extra click needed; it does not change what any item does,
  // only how it's visually grouped.
  const transactionChildren = [];
  if (reportsGroup) transactionChildren.push(reportsGroup);
  // "Window" — workspace controls (recent screens, fullscreen, second
  // screen, keyboard shortcuts). Real content behind this now (see
  // WindowPage.jsx) reusing the same recent-windows tracking the floating
  // tab already had — not an empty placeholder.
  transactionChildren.push({ key: '/window', icon: <DesktopOutlined />, label: '🪟 Window' });
  // "Utility" — deliberately scoped to genuinely NEW capability (Sync
  // Status) this pass, not a relocation of the existing Printer
  // Settings/Label Designer/Excel Import pages already living under Admin
  // — those stay put, matching the earlier sign-off to leave Admin
  // untouched. A fuller Utility consolidation is a separate follow-up.
  if (permissions.tenant_management) {
    transactionChildren.push({ key: '/admin/sync-status', icon: <SyncOutlined />, label: '🛠 Utility (Sync Status)' });
  }

  const salesChildren = [billingGroup, repairGroup].filter(Boolean);
  if (salesChildren.length) transactionChildren.push({ key: 'txn-sales-group', type: 'group', label: 'SALES', children: salesChildren });

  if (approvalGroup) transactionChildren.push({ key: 'txn-approval-group', type: 'group', label: 'APPROVAL', children: [approvalGroup] });

  // Packet Stock — genuinely new (Missing Feature Report), gated the same
  // way as Inventory itself since it's the same permission surface.
  const packetStockItem = permissions.inventory ? { key: '/packet-stock', label: '📦 Packet Stock' } : null;
  // Branch Orders — genuinely new (Missing Feature Report), gated the
  // same way as Floor Management/Transfer since it's the same permission
  // surface (branch stock movement).
  const branchOrdersItem = (isEnabled('floors') || isEnabled('stock_transfer')) ? { key: '/branch-orders', label: '🔀 Branch Orders' } : null;
  const stockChildren = [inventoryGroup, binGroup, floorGroup, packetStockItem, branchOrdersItem].filter(Boolean);
  if (stockChildren.length) transactionChildren.push({ key: 'txn-stock-group', type: 'group', label: 'STOCK', children: stockChildren });

  // Dealer Transaction — genuinely new (Missing Feature Report), same
  // gate as Karigar since dealers live in the same vendor master/permission
  // surface.
  const dealerTransactionItem = (permissions.karigar_management && (isEnabled('goldsmith') || isEnabled('manufacturing')))
    ? { key: '/dealer-transaction', label: '🤝 Dealer Transaction' } : null;
  const purchaseChildren = [purchaseGroup, karigarGroup, dealerTransactionItem].filter(Boolean);
  if (purchaseChildren.length) transactionChildren.push({ key: 'txn-purchase-group', type: 'group', label: 'PURCHASE', children: purchaseChildren });

  // Jobcard Prediction — genuinely new (Missing Feature Report), same gate
  // as Manufacturing since it's planning for the same workflow.
  const jobcardPredictionItem = isEnabled('manufacturing_bom') ? { key: '/jobcard-prediction', label: '📐 Jobcard Prediction' } : null;
  const workshopChildren = [jobcardPredictionItem, manufacturingItem].filter(Boolean);
  if (workshopChildren.length) transactionChildren.push({ key: 'txn-workshop-group', type: 'group', label: 'WORKSHOP', children: workshopChildren });

  if (accountingGroup) transactionChildren.push({ key: 'txn-accounts-group', type: 'group', label: 'ACCOUNTS', children: [accountingGroup] });

  if (savingsGroup) transactionChildren.push(savingsGroup);

  const otherChildren = [insuranceItem, customersItem].filter(Boolean);
  if (otherChildren.length) transactionChildren.push({ key: 'txn-other-group', type: 'group', label: 'OTHER', children: otherChildren });

  if (transactionChildren.length) {
    items.splice(2, 0, { key: 'transaction-group', icon: <ShoppingCartOutlined style={{ color: '#B8860B' }} />, label: 'Transaction', children: transactionChildren });
  }

  if (permissions.edit_invoice_template && isEnabled('invoice_studio')) {
    items.push({ key: '/invoice/studio', icon: <FileTextOutlined />, label: '💎 Invoice Studio' });
    items.push({ key: '/invoice/template', icon: <FileTextOutlined />, label: 'Quick Template (legacy)' });
  }

  if (permissions.global_master || permissions.tenant_management) {
    const adminChildren = [];
    if (permissions.global_master || permissions.tenant_management) {
      if (isEnabled('advanced_analytics_dashboard')) adminChildren.push({ key: '/admin/dashboard', label: '📊 Analytics Dashboard' });
      if (isEnabled('audit_logs')) adminChildren.push({ key: '/admin/audit', label: '🔐 Audit & Security' });
      if (adminChildren.length) adminChildren.push({ key: 'admin-div', type: 'divider' });
    }
    if (permissions.global_master) {
      adminChildren.push({ key: '/admin/sa-dashboard', label: '🏢 Master Dashboard' });
      adminChildren.push({ key: '/admin/tenants',      label: 'Tenants' });
      adminChildren.push({ key: '/admin/device-licenses', label: '📱 Image App Devices' });
      adminChildren.push({ key: '/admin/masters',      label: '📋 All Masters' });
      adminChildren.push({ key: '/admin/master',       label: 'Quick Master' });
    }
    if (permissions.tenant_management) {
      adminChildren.push({ key: '/admin/users',   label: '👤 Users' });
      adminChildren.push({ key: '/admin/roles',   label: '🔑 Role Management' });
      adminChildren.push({ key: '/admin/display', label: '🖥️ Display Settings' });
      adminChildren.push({ key: '/admin/policies', label: '📜 Policies' });
      adminChildren.push({ key: '/admin/printer-settings', label: '🖨️ Printer Settings' });
      adminChildren.push({ key: '/admin/print-history', label: '🧾 Print History' });
      adminChildren.push({ key: '/admin/excel-import', label: '📊 Excel Bulk Import' });
      adminChildren.push({ key: '/admin/theme-settings', label: '🎨 Theme Settings' });
      adminChildren.push({ key: '/admin/company-settings', label: '🏢 Company Settings' });
      // Every tenant now designs their own barcode tag here — moved out of
      // the global_master-only block below (Super Admin still reaches the
      // same page, just also sees a tenant picker + the global default).
      adminChildren.push({ key: '/admin/label-designer', label: '🏷️ Label Designer' });
    }
    if (permissions.global_master) {
      adminChildren.push({ key: '/admin/modules', label: '📦 Module Management' });
      if (isEnabled('sms_whatsapp_integration')) adminChildren.push({ key: '/admin/sms-settings', label: '💬 SMS Settings' });
    }
    items.push({ key: 'admin-group', icon: <SettingOutlined />, label: 'Admin', children: adminChildren });
  }

  return items;
};

// ── Flatten the menu tree into navigable {key, label, group} entries ─────────
// Used to power the global search — group entries (children) / dividers are
// skipped, only real routes (key starts with '/') are searchable.
const flattenMenuItems = (items, group = null) => {
  const flat = [];
  for (const item of items) {
    if (item.type === 'divider') continue;
    if (item.children?.length) {
      flat.push(...flattenMenuItems(item.children, item.label));
    } else if (typeof item.key === 'string' && item.key.startsWith('/')) {
      flat.push({ key: item.key, label: item.label, group });
    }
  }
  return flat;
};

// ── Global search box (header) ────────────────────────────────────────────────
// Self-contained list rendered inside the Modal body (no portal-based dropdown)
// so nothing can linger on the page once the modal closes.
function GlobalSearch({ searchableItems, onNavigate, open, setOpen }) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIndex(0);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  // Global Ctrl+K / Cmd+K shortcut
  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [setOpen]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matches = q
      ? searchableItems.filter(i => i.label.toLowerCase().includes(q) || i.group?.toLowerCase().includes(q))
      : searchableItems;
    return matches.slice(0, 30);
  }, [query, searchableItems]);

  useEffect(() => { setActiveIndex(0); }, [query]);

  const goTo = (item) => {
    if (!item) return;
    onNavigate(item.key);
    setOpen(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIndex(i => Math.min(i + 1, results.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIndex(i => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); goTo(results[activeIndex]); }
    else if (e.key === 'Escape') { setOpen(false); }
  };

  return (
    <Modal
      open={open}
      onCancel={() => setOpen(false)}
      footer={null}
      closable={false}
      destroyOnClose
      centered
      width={560}
      style={{ maxWidth: '92vw' }}
      styles={{ body: { padding: 0 }, content: { borderRadius: 12, overflow: 'hidden' } }}
    >
      <div style={{ borderBottom: '1px solid #f0f0f0', padding: '4px 8px' }}>
        <Input
          ref={inputRef}
          size="large"
          bordered={false}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          prefix={<SearchOutlined style={{ color: '#999', marginRight: 8, fontSize: 16 }} />}
          suffix={query && (
            <Button type="text" size="small" icon={<CloseOutlined />} onClick={() => setQuery('')}
              style={{ color: '#bbb' }} />
          )}
          placeholder="Search pages — e.g. Groups, Agents, Reports..."
          style={{ fontSize: 15 }}
        />
      </div>

      <div style={{ maxHeight: '55vh', overflowY: 'auto', padding: '6px' }}>
        {results.length === 0 ? (
          <Empty
            description="No pages found"
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            style={{ padding: '32px 0' }}
          />
        ) : (
          results.map((item, idx) => {
            const isActive = idx === activeIndex;
            return (
              <div
                key={item.key}
                onMouseEnter={() => setActiveIndex(idx)}
                onClick={() => goTo(item)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 12px',
                  borderRadius: 8,
                  cursor: 'pointer',
                  background: isActive ? '#FDF6E3' : 'transparent',
                  borderLeft: isActive ? '3px solid #B8860B' : '3px solid transparent',
                  transition: 'background 0.12s, border-color 0.12s',
                }}
              >
                <Text style={{ fontSize: 14, fontWeight: isActive ? 600 : 500, color: '#1a1a2e' }}>
                  {item.label}
                </Text>
                {item.group && (
                  <Tag style={{ margin: 0, fontSize: 11, background: '#f5f5f5', border: 'none', color: '#888' }}>
                    {item.group}
                  </Tag>
                )}
              </div>
            );
          })
        )}
      </div>

      <div style={{
        borderTop: '1px solid #f0f0f0', padding: '8px 14px',
        display: 'flex', gap: 16, fontSize: 11, color: '#999',
      }}>
        <span>↑↓ Navigate</span>
        <span>↵ Select</span>
        <span>Esc Close</span>
      </div>
    </Modal>
  );
}

// ── Mobile bottom nav items (5 most-used routes) ──────────────────────────────
const BOTTOM_NAV = [
  { key: '/dashboard',  label: 'Home',     icon: <HomeOutlined /> },
  { key: '/pos',        label: 'POS',      icon: <ShoppingCartOutlined /> },
  { key: '/inventory',  label: 'Stock',    icon: <AppstoreOutlined /> },
  { key: '/customers',  label: 'Customers',icon: <TeamOutlined /> },
  { key: '/reports',    label: 'Reports',  icon: <PieChartOutlined /> },
];

// ── Sidebar content ────────────────────────────────────────────────────────────
// menuItems is computed once by the caller (MainLayout) and shared with the
// horizontal header-mode Menu below — both render the exact same items,
// just in different Ant Design Menu `mode`s.
function SidebarContent({ collapsed, onNavigate, currentPath, menuItems }) {
  const theme = useUiThemeStore((s) => s.theme);
  const logoUrl = theme?.Logo_URL || '/logo.png';
  const logoScale = (theme?.Logo_Size || 100) / 100;
  return (
    <>
      {/* Logo */}
      <div className="erp-logo-bar" style={{ justifyContent: 'center', padding: 0 }}>
        {collapsed ? (
          <div style={{ width: 52 * logoScale, height: 52 * logoScale, overflow: 'hidden', borderRadius: 10 }}>
            <img
              src={logoUrl}
              alt="Logo"
              style={{ width: '100%', height: '190%', objectFit: 'cover', objectPosition: 'top' }}
            />
          </div>
        ) : (
          <img src={logoUrl} alt="Logo" style={{ height: 56 * logoScale, width: 'auto', maxWidth: '100%' }} />
        )}
      </div>

      {/* Menu */}
      <div className="sidebar-scroll">
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[currentPath]}
          // Everything that used to be auto-open here now lives one level
          // deeper, inside the (deliberately collapsed) Transaction menu —
          // that's the actual complexity reduction: previously ~11 groups
          // were permanently expanded at once. 'admin-group' is the one
          // group NOT folded into Transaction, so it keeps its old behavior.
          defaultOpenKeys={collapsed ? [] : ['admin-group']}
          style={{ background: '#1A1A1A', borderRight: 0, paddingTop: 8 }}
          items={menuItems}
          onClick={({ key }) => { if (!key.includes('-group') && !key.includes('-div')) onNavigate(key); }}
          inlineCollapsed={collapsed}
        />
      </div>
    </>
  );
}

// ── Fallback label for a route that isn't in the sidebar menu (e.g. a deep
// child page reached by a link rather than the menu itself) ──────────────────
const prettifyPath = (pathname) => {
  const parts = pathname.split('/').filter(Boolean);
  if (!parts.length) return 'Home';
  return parts.map((p) => p.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())).join(' / ');
};

// ── Main export ───────────────────────────────────────────────────────────────
export default function MainLayout() {
  const [siderCollapsed, setSiderCollapsed] = useState(false);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const navigate    = useNavigate();
  const location    = useLocation();
  // A few sidebar sub-items (Bin, Catalog) are distinguished only by query
  // string (/bin?tab=orders vs /bin?tab=purchase) — matching selectedKeys
  // against pathname alone would highlight every one of them identically,
  // or none of them. Safe to include search unconditionally since no other
  // menu key uses one.
  const currentFullPath = location.pathname + location.search;
  const { user, logout, impersonation, endImpersonation } = useAuthStore();
  const { isEnabled, businessType } = useModules();
  const { config: modeConfig, isOfficial, isDummy, isUnofficial } = useDataMode();
  const screens = useBreakpoint();
  const navLayout = useNavLayoutStore((s) => s.layout);
  const uiTheme = useUiThemeStore((s) => s.theme);
  const headerLogoUrl = uiTheme?.Logo_URL || '/logo.png';

  const isMobile = !screens.md;  // <768px
  const isTablet = screens.md && !screens.lg; // 768–1024px
  // Header-mode navigation only applies on desktop/tablet — mobile always
  // keeps its own drawer + bottom nav regardless of this preference, same
  // as before this feature existed.
  const isHeaderLayout = !isMobile && navLayout === 'header';

  // Auto-collapse on tablet
  useEffect(() => {
    if (isTablet) setSiderCollapsed(true);
    if (!isMobile && !isTablet) setSiderCollapsed(false);
  }, [isMobile, isTablet]);

  // Close drawer on navigation
  useEffect(() => {
    setMobileDrawerOpen(false);
  }, [location.pathname]);

  const handleLogout = async () => { await logout(); navigate('/login'); };
  const handleEndImpersonation = async () => { await endImpersonation(); navigate('/admin/tenants'); };

  // ── Change Password (self-service) ──────────────────────────────────────────
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const [changePasswordForm] = Form.useForm();
  const changePasswordMutation = useMutation({
    mutationFn: ({ currentPassword, newPassword }) => authApi.changePassword(currentPassword, newPassword),
    onSuccess: () => {
      message.success('Password changed. Use it next time you log in.');
      setChangePasswordOpen(false);
      changePasswordForm.resetFields();
    },
    onError: (err) => message.error(err.response?.data?.message || 'Failed to change password.'),
  });

  const handleNavigate = (key) => {
    navigate(key);
    setMobileDrawerOpen(false);
  };

  // Computed once and shared by the sidebar Menu (mode="inline"), the
  // header-layout Menu (mode="horizontal"), and global search below —
  // all three are the exact same items, just three different views of them.
  const menuItems = useMemo(
    () => buildMenuItems(user?.permissions || {}, isEnabled, isUnofficial),
    [user?.permissions, isEnabled, isUnofficial]
  );

  // ── Global search — flattened list of every page this user can see ─────────
  const searchableItems = useMemo(
    () => flattenMenuItems(menuItems),
    [menuItems]
  );

  // ── Record this visit for the Recent Windows panel ──────────────────────────
  const { recordVisit } = useRecentWindowsStore();
  useEffect(() => {
    const fullPath = location.pathname + location.search;
    const match = searchableItems.find((i) => i.key === fullPath) || searchableItems.find((i) => i.key === location.pathname);
    recordVisit(fullPath, match?.label || prettifyPath(location.pathname), match?.group);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, location.search]);

  // ── User dropdown ────────────────────────────────────────────────────────────
  const userMenu = {
    items: [
      {
        key: 'user-info',
        label: (
          <div style={{ padding: '8px 0', minWidth: 180 }}>
            <div style={{ fontWeight: 600, color: '#1a1a2e' }}>{user?.fullName || user?.username}</div>
            <div style={{ fontSize: 11, color: '#888' }}>{user?.roleName} · {user?.companyName}</div>
          </div>
        ),
        disabled: true,
      },
      { key: 'change-password', icon: <KeyOutlined />, label: 'Change Password' },
      { type: 'divider' },
      { key: 'logout', icon: <LogoutOutlined />, label: 'Logout', danger: true },
    ],
    onClick: ({ key }) => {
      if (key === 'logout') handleLogout();
      if (key === 'change-password') setChangePasswordOpen(true);
    },
  };


  // ── Header dynamic style for data mode ──────────────────────────────────────
  const headerBg    = isOfficial ? '#ffffff' : modeConfig.headerBg;
  const headerBorder = isOfficial ? '1px solid #f0f0f0' : `2px solid ${modeConfig.borderColor}`;

  // ── Sidebar width ─────────────────────────────────────────────────────────────
  const siderWidth    = 240;
  const collapsedWidth = 72;
  // No fixed sidebar reserves space in header-layout mode — the horizontal
  // Menu sits inline in the content flow instead (see below).
  const effectiveWidth = isMobile || isHeaderLayout ? 0 : (siderCollapsed ? collapsedWidth : siderWidth);

  return (
    <Layout style={{ minHeight: '100vh', marginTop: impersonation?.active ? 30 : 0 }}>

      {/* ── Desktop / Tablet Sidebar (only in sidebar-layout mode) ──────────── */}
      {!isMobile && !isHeaderLayout && (
        <Sider
          collapsible
          collapsed={siderCollapsed}
          onCollapse={setSiderCollapsed}
          width={siderWidth}
          collapsedWidth={collapsedWidth}
          style={{
            background: '#1A1A1A',
            position: 'fixed',
            height: '100vh',
            left: 0, top: 0,
            zIndex: 100,
            overflow: 'hidden',
            boxShadow: '2px 0 8px rgba(0,0,0,0.15)',
          }}
          trigger={null}
        >
          <SidebarContent
            collapsed={siderCollapsed}
            onNavigate={handleNavigate}
            currentPath={currentFullPath}
            menuItems={menuItems}
          />
        </Sider>
      )}

      {/* ── Mobile Drawer Sidebar — always the drawer on mobile, regardless
           of the sidebar/header preference (that preference is desktop-only) ── */}
      {isMobile && (
        <Drawer
          placement="left"
          open={mobileDrawerOpen}
          onClose={() => setMobileDrawerOpen(false)}
          width={260}
          styles={{ body: { padding: 0, background: '#1A1A1A', overflowY: 'auto' }, header: { display: 'none' }, wrapper: { boxShadow: '4px 0 20px rgba(0,0,0,0.3)' } }}
          maskStyle={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(2px)' }}
        >
          <SidebarContent
            collapsed={false}
            onNavigate={handleNavigate}
            currentPath={currentFullPath}
            menuItems={menuItems}
          />
        </Drawer>
      )}

      {/* ── Main Area ────────────────────────────────────────────────────────── */}
      <Layout style={{ marginLeft: effectiveWidth, transition: 'margin-left 0.2s cubic-bezier(.4,0,.2,1)' }}>

        {/* Live Rates bar — confined to the content area, never overlaps the sidebar */}
        <GoldRateBar />

        {/* Data Mode Banner */}
        {!isOfficial && (
          <div className="data-mode-banner" style={{
            background: modeConfig.badgeBg,
            borderBottom: `2px solid ${modeConfig.borderColor}`,
            color: modeConfig.badgeColor,
          }}>
            <span style={{ fontSize: 14 }}>{modeConfig.emoji}</span>
            <span>{modeConfig.label.toUpperCase()}</span>
            <span style={{ opacity: 0.7, fontWeight: 400, display: isMobile ? 'none' : 'inline' }}>
              — {modeConfig.description}
            </span>
            {!isMobile && (
              <span style={{ marginLeft: 'auto', fontWeight: 400, fontSize: 11, opacity: 0.6 }}>
                {isDummy ? 'Ctrl+F12' : 'Ctrl+F5'} to switch back to Official
              </span>
            )}
          </div>
        )}

        {/* Header */}
        <Header style={{
          background:    headerBg,
          borderBottom:  headerBorder,
          padding:       '0 16px',
          height:        60,
          lineHeight:    '60px',
          display:       'flex',
          alignItems:    'center',
          justifyContent:'space-between',
          position:      'sticky',
          top:           0,
          zIndex:        150,
          boxShadow:     '0 1px 4px rgba(0,0,0,.06)',
          gap:           8,
        }}>
          {/* Left: toggle button (sidebar mode) or logo (header mode) */}
          <Space size={8}>
            {isHeaderLayout ? (
              <img src={headerLogoUrl} alt="Logo" style={{ height: 32, width: 'auto', maxWidth: 140, objectFit: 'contain' }} />
            ) : (
              <Button
                type="text"
                icon={isMobile
                  ? (mobileDrawerOpen ? <CloseOutlined /> : <MenuOutlined />)
                  : (siderCollapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />)
                }
                onClick={() => isMobile ? setMobileDrawerOpen(v => !v) : setSiderCollapsed(v => !v)}
                style={{ fontSize: 18, color: '#555', width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              />
            )}
            {/* Company name on desktop */}
            {!isMobile && (
              <Text style={{ fontSize: 13, color: '#888', fontWeight: 500 }}>
                {user?.companyName}
              </Text>
            )}
            <BranchSelector />
          </Space>

          {/* Right: actions */}
          <Space size={isMobile ? 6 : 12}>
            {/* Global search */}
            <Tooltip title="Search pages (Ctrl+K)">
              <Button
                type="text"
                icon={<SearchOutlined />}
                onClick={() => setSearchOpen(true)}
                style={{ fontSize: 16, color: '#555', width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              />
            </Tooltip>

            {/* Role + business type — hidden on mobile */}
            {!isMobile && (
              <>
                <Tag color="gold" style={{ margin: 0 }}>{user?.roleName}</Tag>
                <Tag color={
                  businessType === 'RETAILER' ? 'orange' :
                  businessType === 'WHOLESALER' ? 'blue' :
                  businessType === 'MANUFACTURER' ? 'green' : 'purple'
                } style={{ fontSize: 10, margin: 0 }}>{businessType}</Tag>
              </>
            )}

            {/* Bell — previously a dead placeholder (Badge count={0} always) */}
            <NotificationBell />

            {/* User avatar + dropdown */}
            <Dropdown menu={userMenu} trigger={['click']} placement="bottomRight">
              <Space style={{ cursor: 'pointer', gap: 6 }}>
                <Avatar
                  style={{ background: 'linear-gradient(135deg, #B8860B, #D4A017)', fontSize: 13, fontWeight: 700 }}
                  size={34}
                >
                  {(user?.fullName || user?.username || 'U').charAt(0).toUpperCase()}
                </Avatar>
                {!isMobile && (
                  <Text style={{ fontSize: 13, fontWeight: 500, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {user?.fullName || user?.username}
                  </Text>
                )}
              </Space>
            </Dropdown>
          </Space>
        </Header>

        {/* ── Header-layout mode: the same menu items as the sidebar, just
             as a horizontal bar instead. Ant Design's horizontal Menu
             collapses overflow items into a "More" (…) submenu on its own —
             no extra work needed for the large item count here. ──────────── */}
        {isHeaderLayout && (
          <div style={{ background: '#1A1A1A', position: 'sticky', top: 60, zIndex: 140, boxShadow: '0 1px 4px rgba(0,0,0,.1)' }}>
            <Menu
              theme="dark"
              mode="horizontal"
              selectedKeys={[currentFullPath]}
              items={menuItems}
              onClick={({ key }) => { if (!key.includes('-group') && !key.includes('-div')) handleNavigate(key); }}
              style={{ background: '#1A1A1A', borderBottom: 0 }}
            />
          </div>
        )}

        {/* Content */}
        <Content
          className="erp-content"
          style={{
            padding:    isMobile ? '12px' : '20px 24px',
            background: isOfficial ? '#F4F5F7' : modeConfig.headerBg,
            minHeight:  isHeaderLayout ? 'calc(100vh - 106px)' : 'calc(100vh - 60px)',
            // Extra bottom padding on mobile for bottom nav
            paddingBottom: isMobile ? 'calc(70px + env(safe-area-inset-bottom, 0px))' : undefined,
          }}
        >
          <Outlet />
        </Content>
      </Layout>

      {/* ── Mobile Bottom Navigation ─────────────────────────────────────────── */}
      {isMobile && (
        <nav className="mobile-bottom-nav" aria-label="Main navigation">
          <div className="mobile-bottom-nav-inner">
            {BOTTOM_NAV.map((item) => {
              const isActive = location.pathname === item.key || location.pathname.startsWith(item.key + '/');
              return (
                <button
                  key={item.key}
                  className={`mobile-nav-item ${isActive ? 'active' : ''}`}
                  onClick={() => navigate(item.key)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: isActive ? '#B8860B' : '#888',
                  }}
                  aria-label={item.label}
                  aria-current={isActive ? 'page' : undefined}
                >
                  <span className="nav-icon" style={{ color: isActive ? '#B8860B' : '#888' }}>{item.icon}</span>
                  <span className="nav-label">{item.label}</span>
                </button>
              );
            })}
          </div>
        </nav>
      )}

      {/* ── Global Search ────────────────────────────────────────────────────── */}
      <GlobalSearch
        searchableItems={searchableItems}
        onNavigate={handleNavigate}
        open={searchOpen}
        setOpen={setSearchOpen}
      />

      {/* ── Recent Windows — right-edge tab, jump back to any recent page ──── */}
      <RecentWindows />

      {/* ── Post-login splash + "press any key" welcome gate ─────────────────
           Only ever shows right after a real login (authStore.justLoggedIn),
           never on a plain page refresh. Renders null otherwise. ──────────── */}
      <SplashGate />

      {/* ── "Log in as tenant" banner — always visible while impersonating,
           on every screen regardless of layout, so this never reads as a
           real, silent login. See authStore's startImpersonation. ────────── */}
      {impersonation?.active && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, zIndex: 1001,
          background: '#722ed1', color: '#fff', padding: '6px 16px',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
          fontSize: 12, boxShadow: '0 2px 8px rgba(0,0,0,.15)',
        }}>
          <span>🔑 Viewing as <b>{user?.companyName}</b> ({user?.fullName}) — logged in by Super Admin "{impersonation.byUsername}"</span>
          <Button size="small" ghost icon={<LogoutOutlined />} onClick={handleEndImpersonation}>
            Exit — Back to Super Admin
          </Button>
        </div>
      )}

      {/* ── Change Password (self-service, any logged-in user) ──────────────── */}
      <Modal
        title={<Space><KeyOutlined style={{ color: '#B8860B' }} />Change Password</Space>}
        open={changePasswordOpen}
        onCancel={() => { setChangePasswordOpen(false); changePasswordForm.resetFields(); }}
        footer={null} destroyOnClose width={400}
      >
        <Form
          form={changePasswordForm} layout="vertical" style={{ marginTop: 12 }}
          onFinish={(v) => changePasswordMutation.mutate(v)}
        >
          <Form.Item name="currentPassword" label="Current Password" rules={[{ required: true, message: 'Enter your current password' }]}>
            <Input.Password placeholder="Current password" autoFocus />
          </Form.Item>
          <Form.Item name="newPassword" label="New Password" rules={[{ required: true, min: 8, message: 'Min 8 characters' }]}>
            <Input.Password placeholder="New password (min 8 characters)" />
          </Form.Item>
          <Form.Item name="confirmPassword" label="Confirm New Password" dependencies={['newPassword']}
            rules={[
              { required: true, message: 'Re-enter your new password' },
              ({ getFieldValue }) => ({
                validator: (_, value) => (!value || value === getFieldValue('newPassword'))
                  ? Promise.resolve() : Promise.reject(new Error('Passwords do not match')),
              }),
            ]}>
            <Input.Password placeholder="Re-enter new password" />
          </Form.Item>
          <Button type="primary" htmlType="submit" block size="large" loading={changePasswordMutation.isPending}
            style={{ background: '#B8860B', border: 'none', fontWeight: 700 }}>
            Update Password
          </Button>
        </Form>
      </Modal>
    </Layout>
  );
}
