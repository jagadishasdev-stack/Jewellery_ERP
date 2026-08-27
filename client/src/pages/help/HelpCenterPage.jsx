/**
 * HelpCenterPage — "How to Use" hub covering every module in the ERP.
 * Each row sends the user to the real screen and auto-starts that screen's
 * interactive walkthrough (see components/PageTour.jsx) — the same tour is
 * also reachable anytime from the floating "?" button on that screen.
 */
import React from 'react';
import { Collapse, Typography, Button, Tag, Space, Steps, Alert, Divider } from 'antd';
import { useNavigate } from 'react-router-dom';
import {
  ShoppingCartOutlined, BarcodeOutlined, GoldOutlined, SwapOutlined,
  ToolOutlined, TeamOutlined, ApartmentOutlined, FileTextOutlined,
  BarChartOutlined, WalletOutlined, SettingOutlined, RightOutlined,
  DatabaseOutlined, ShoppingOutlined, RocketOutlined,
} from '@ant-design/icons';

const { Title, Text } = Typography;

const GROUPS = [
  {
    key: 'billing',
    title: '💎 Billing & Sales',
    icon: <ShoppingCartOutlined style={{ color: '#B8860B' }} />,
    items: [
      { title: 'Billing Hub', desc: 'Retail, wholesale, GST invoice, estimate, order booking — pick a bill type.', path: '/billing' },
      { title: 'Retail POS', desc: 'Scan items, apply adjustments, split payments, checkout & print.', path: '/pos' },
    ],
  },
  {
    key: 'inventory',
    title: '📦 Inventory & Catalog',
    icon: <BarcodeOutlined style={{ color: '#B8860B' }} />,
    items: [
      { title: 'Stock Management & Barcode Printing', desc: 'Add stock, scan barcodes, print barcode/RFID tags to your label printer.', path: '/inventory' },
      { title: 'Add Stock', desc: 'Dedicated form for adding a single new stock item.', path: '/inventory/add' },
      { title: 'Legacy Inventory View', desc: 'Older inventory list screen.', path: '/inventory/old' },
      { title: 'Product Catalog', desc: 'Image catalog, exhibition view, by-design browsing, sold report.', path: '/catalog' },
    ],
  },
  {
    key: 'purchase-bin',
    title: '🛍️ Purchase & Master Bin',
    icon: <DatabaseOutlined style={{ color: '#B8860B' }} />,
    items: [
      { title: 'Purchase Hub', desc: 'Gold, silver, diamond, and vendor purchase bills.', path: '/purchase/hub' },
      { title: 'Purchase History', desc: 'Browse and search past purchase entries.', path: '/purchase' },
      { title: 'Master Bin Management', desc: 'Purchase / Sales Return / Orders / Pure Gold holding bins before items become stock.', path: '/bin' },
    ],
  },
  {
    key: 'karigar',
    title: '🥇 Karigar / Goldsmith',
    icon: <GoldOutlined style={{ color: '#B8860B' }} />,
    items: [
      { title: 'Karigar List', desc: 'Overview of all karigars and their open issues.', path: '/karigar' },
      { title: 'Issue Gold', desc: 'Send gold out to a goldsmith for making.', path: '/karigar/issue' },
      { title: 'Return Goods', desc: 'Record finished goods coming back and check quality.', path: '/karigar/return' },
      { title: 'Settlement', desc: 'Calculate and settle a karigar\'s wages account.', path: '/karigar/settlement' },
    ],
  },
  {
    key: 'approval',
    title: '🔄 Approval Out',
    icon: <SwapOutlined style={{ color: '#B8860B' }} />,
    items: [
      { title: 'Pending Approvals', desc: 'Everything currently out with a customer/party on approval.', path: '/approval' },
      { title: 'Issue on Approval', desc: 'Send tagged items out to a customer/party on approval.', path: '/approval/issue' },
      { title: 'Receive Against Voucher', desc: 'Bring approval items back or convert to a sale.', path: '/approval/receive' },
      { title: 'Completed / History', desc: 'Closed approval vouchers.', path: '/approval/completed' },
      { title: 'Non-Tagged Issue', desc: 'Issue on approval for items without a barcode tag.', path: '/approval/non-tag/issue' },
      { title: 'Non-Tagged Receive', desc: 'Receive back non-tagged approval items.', path: '/approval/non-tag/receive' },
      { title: 'Party Master', desc: 'Manage the customers/parties approval goods go out to.', path: '/approval/parties' },
    ],
  },
  {
    key: 'repair',
    title: '🔧 Repair',
    icon: <ToolOutlined style={{ color: '#B8860B' }} />,
    items: [
      { title: 'Repair Orders', desc: 'Create and track customer repair jobs.', path: '/repair' },
      { title: 'Job Card Report', desc: 'Report/listing of repair job cards.', path: '/repair/job-cards' },
    ],
  },
  {
    key: 'customers',
    title: '👥 Customers',
    icon: <TeamOutlined style={{ color: '#B8860B' }} />,
    items: [
      { title: 'Customers', desc: 'Search, add, and view a customer\'s purchase history & loyalty.', path: '/customers' },
    ],
  },
  {
    key: 'floors',
    title: '🏬 Floors & Stock Transfer',
    icon: <ApartmentOutlined style={{ color: '#B8860B' }} />,
    items: [
      { title: 'Floors & Counters', desc: 'Set up floors, counters and trays to track where stock physically sits.', path: '/floors' },
      { title: 'Stock Transfer', desc: 'Move stock between branches, floors, or counters.', path: '/transfer' },
      { title: 'Hidden Stock', desc: 'Unofficial-mode-only view of hidden stock (admin).', path: '/floors/hidden-stock' },
    ],
  },
  {
    key: 'invoice',
    title: '📄 Invoice Templates',
    icon: <FileTextOutlined style={{ color: '#B8860B' }} />,
    intro: <InvoiceStudioFlow />,
    items: [
      { title: 'Invoice Studio', desc: 'Drag-and-drop designer for your printed invoice layout.', path: '/invoice/studio' },
      { title: 'Quick Template (legacy)', desc: 'Older editor — not used by real printing. Use Invoice Studio above instead.', path: '/invoice/template' },
    ],
  },
  {
    key: 'accounting',
    title: '🏦 Accounting, Ledger & Reports',
    icon: <BankOutlinedIcon />,
    intro: <AccountingPostingFlow />,
    items: [
      { title: 'Accounting Dashboard', desc: 'Live KPI strip — cash, bank, receivables, payables, net GST payable, stock value. Every number is a real ledger read, nothing cached.', path: '/accounting' },
      { title: 'Chart of Accounts', desc: 'Every ledger this tenant\'s books use, grouped Assets/Liabilities/Capital/Income/Expenses. Add one by hand or let it auto-create on first use.', path: '/accounting/chart-of-accounts' },
      { title: 'Ledger', desc: 'Any single account\'s full transaction history with a running balance — the real double-entry drill-down.', path: '/accounting/ledger' },
      { title: 'Trial Balance', desc: 'Every account\'s net Dr or Cr balance as of a date. The two columns must always sum to the same total — that\'s the actual proof the books balance.', path: '/accounting/trial-balance' },
      { title: 'Day Book', desc: 'Every voucher posted on one day, expandable to its exact Dr/Cr lines.', path: '/accounting/day-book' },
      { title: 'Voucher Entry (Receipt / Payment / Contra / Journal)', desc: 'Manually record money received, money paid, a transfer between your own accounts, or any other adjustment. Reverse (never delete) a mistake here too.', path: '/accounting/vouchers' },
      { title: 'Reports Hub', desc: 'Entry point to every report category in the system.', path: '/reports' },
      { title: 'Sales Bill History', desc: 'Every sales bill ever created — search, view details, and reprint any past invoice.', path: '/reports/sales-bill-history' },
      { title: 'Financial Reports (Cash Book / Bank Book / Ledger / P&L)', desc: 'All account postings — automatic from every sale, purchase & payment. No manual journal entries.', path: '/reports/financial-reports' },
      { title: 'Day Close', desc: 'End-of-day cash verification and closing.', path: '/reports/day-close' },
      { title: 'Sales Reports', desc: 'Daily, item-wise, counter-wise, branch-wise sales.', path: '/reports/sales-reports' },
      { title: 'Inventory Reports', desc: 'Current/dead/fast/slow moving stock, item movement.', path: '/reports/inventory-reports' },
      { title: 'Customer Reports', desc: 'Customer ledger, purchase history, outstanding balances.', path: '/reports/customer-reports' },
      { title: 'Scheme Reports', desc: 'Savings scheme collection & maturity reports.', path: '/reports/scheme-reports' },
      { title: 'Management Reports (MIS)', desc: 'Analytics and target vs achievement.', path: '/reports/management-reports' },
      { title: 'Approval Reports', desc: 'Reports on the Approval-Out module.', path: '/reports/approval' },
      { title: 'Closing Report', desc: 'Date-wise inventory reconciliation — Opening → Additions → Sales → Approval → Closing Stock, by metal & item type.', path: '/reports/closing-report' },
      { title: 'Legacy Sales History', desc: 'Older sales history list/search.', path: '/reports/sales' },
    ],
  },
  {
    key: 'savings',
    title: '🪙 Savings Club',
    icon: <WalletOutlined style={{ color: '#B8860B' }} />,
    intro: <SchemeAdjustmentFlow />,
    items: [
      { title: 'Savings Dashboard', desc: 'Overview of the whole savings club module.', path: '/savings' },
      { title: 'Scheme Master', desc: 'Define scheme types — Gold/Silver/Digi Gold, tenure, bonus rules.', path: '/savings/schemes' },
      { title: 'Groups', desc: 'Batches/cohorts of members under a scheme.', path: '/savings/groups' },
      { title: 'Members', desc: 'Enroll customers, and — from a member\'s detail view — adjust their balance against an existing bill or foreclose a scheme that\'s stopping early. Both post to the real ledger automatically.', path: '/savings/members' },
      { title: 'Collection', desc: 'Collect a member\'s monthly installment at the counter — this also posts straight to the real ledger.', path: '/savings/collect' },
      { title: 'PDC Management', desc: 'Track post-dated cheques for scheme payments.', path: '/savings/pdc' },
      { title: 'Draw & Reports', desc: 'Run a lucky draw and view scheme reports.', path: '/savings/reports' },
      { title: 'Agent Management', desc: 'Manage field collection agents (mobile OTP login).', path: '/savings/agents' },
    ],
  },
  {
    key: 'new-modules',
    title: '🆕 New Modules (Pawnbroking, HR, CRM & More)',
    icon: <RocketOutlined style={{ color: '#B8860B' }} />,
    items: [
      { title: 'Pawnbroking / Gold Loans', desc: 'Pledge items against a loan, track interest owed, record payments, redeem or auction.', path: '/pawnbroking' },
      { title: 'Insurance & AMC', desc: 'Sell jewellery insurance and annual maintenance contracts; log service visits.', path: '/insurance-amc' },
      { title: 'HR, Attendance & Payroll', desc: 'Mark daily attendance, set salary structures, and generate a full computed payroll run.', path: '/hr-payroll' },
      { title: 'CRM — Leads & Feedback', desc: 'Capture walk-in enquiries, log follow-ups, convert leads to customers, track feedback.', path: '/crm' },
      { title: 'Bank Accounts & Cheque Register', desc: 'Track your own bank accounts and every cheque received/issued through deposit → clear/bounce.', path: '/bank-cheque' },
      { title: 'Rate Booking & Agent Commission', desc: 'Lock today\'s gold rate for a customer\'s future purchase; calculate and pay referral agent commission.', path: '/rate-agent' },
      { title: 'Compliance: HSN, e-Invoice & Loyalty', desc: 'Manage HSN/GST codes, e-invoice attempts, and loyalty point earn-rate slabs.', path: '/compliance' },
      { title: 'Manufacturing Efficiency / BOM', desc: 'Department routing, Bills of Material, production tracking with real wastage %, melting/refining, mould stock.', path: '/manufacturing' },
      { title: 'Certification, Reorder & RFID', desc: 'Log gem certificates, auto-scan for low stock, track RFID scans, and card surcharge rules.', path: '/inventory-ops' },
      { title: 'Tally Accounting Bridge', desc: 'Configure and queue vouchers/ledgers/stock items for your own Tally integration.', path: '/tally' },
      { title: 'Permission Overrides', desc: 'Grant a specific staff member extra access to a module beyond their normal role.', path: '/permissions' },
    ],
  },
  {
    key: 'admin',
    title: '⚙️ Admin',
    icon: <SettingOutlined style={{ color: '#B8860B' }} />,
    items: [
      { title: 'Analytics Dashboard', desc: 'Tenant-level analytics and audit overview.', path: '/admin/dashboard' },
      { title: 'Audit & Security', desc: 'Login history, session log, change trail.', path: '/admin/audit' },
      { title: 'Master Dashboard (Super Admin)', desc: 'Cross-tenant overview.', path: '/admin/sa-dashboard' },
      { title: 'Tenants (Super Admin)', desc: 'Create/manage tenants, the new-tenant wizard, license keys.', path: '/admin/tenants' },
      { title: 'All Masters', desc: 'Item types, purity, designs, gemstones, making charges — everything.', path: '/admin/masters' },
      { title: 'Master Setup Hub', desc: 'Quick links to each master data category.', path: '/masters' },
      { title: 'Users', desc: 'Add staff users and assign roles.', path: '/admin/users' },
      { title: 'Role Management', desc: 'Permission matrix per role.', path: '/admin/roles' },
      { title: 'Display Settings', desc: 'Screen × action visibility per role/user.', path: '/admin/display' },
      { title: 'Policies', desc: 'Business policy configuration.', path: '/admin/policies' },
      { title: 'Printer Settings', desc: 'Connect QZ Tray and assign your barcode/receipt/regular printers.', path: '/admin/printer-settings' },
      { title: 'Theme Settings', desc: 'Set the font, font weight, primary color, and text case for the whole tenant — applies to every user.', path: '/admin/theme-settings' },
      { title: 'Module Management (Super Admin)', desc: 'Enable/disable ERP modules per tenant.', path: '/admin/modules' },
      { title: 'SMS Settings (Super Admin)', desc: 'SMS provider and template configuration.', path: '/admin/sms-settings' },
      { title: 'Label Designer (Super Admin)', desc: 'Design the barcode/RFID tag layout used when printing labels.', path: '/admin/label-designer' },
    ],
  },
];

// Small inline icon so we don't need an extra top-level import name clash with BankOutlined used elsewhere.
function BankOutlinedIcon() {
  return <span role="img" aria-label="bank" style={{ color: '#B8860B' }}>🏦</span>;
}

// ── Three distinct situations a scheme member's balance/bonus gets used in ─────
function SchemeAdjustmentFlow() {
  return (
    <div style={{ background: '#FFFBF0', border: '1px solid #F0E0B0', borderRadius: 8, padding: '16px 20px', marginBottom: 16 }}>
      <Text strong style={{ fontSize: 14, color: '#8B6914' }}>🪙 Three Ways to Use a Member's Scheme Balance</Text>
      <div style={{ marginTop: 4, marginBottom: 12 }}>
        <Text type="secondary" style={{ fontSize: 12 }}>
          Every one of these posts a real, balanced entry to the ledger automatically — none of them need a separate Accounting entry afterwards.
        </Text>
      </div>
      <Steps
        direction="vertical" size="small" status="finish"
        items={[
          {
            title: <Text strong style={{ fontSize: 13 }}>1. Live, at the counter — during a sale</Text>,
            description: <Text style={{ fontSize: 12 }}>The "🪙 Scheme Adjustment" card on the POS billing screen. Search the member, apply their balance/bonus — it reduces the bill you're creating right now, before it's even saved.</Text>,
          },
          {
            title: <Text strong style={{ fontSize: 13 }}>2. Against a bill that's already been created</Text>,
            description: <Text style={{ fontSize: 12 }}>Savings Club → Members → open the member → <Text strong>"Adjust Against a Bill"</Text>. Enter the invoice number — if it still owes something, this settles it; if it was already paid in full, the amount is refunded straight back to the customer instead.</Text>,
          },
          {
            title: <Text strong style={{ fontSize: 13 }}>3. Foreclosing — a scheme stopping before it matures</Text>,
            description: <Text style={{ fontSize: 12 }}>Same member detail view → <Text strong>"Foreclose (Stop Early)"</Text> — only shown for schemes still Active (not yet matured). Enter any deduction (kept as your business's income) or a goodwill bonus, then settle the net amount via Cash, Bank, or against a sale bill.</Text>,
          },
        ]}
      />
    </div>
  );
}

// ── The full posting flow, one transaction → the books → GST payable ───────────
// This is documentation, not a screen — every step names the real screen
// where you'd actually see it, so it's not just theory.
function AccountingPostingFlow() {
  return (
    <div style={{ background: '#FFFBF0', border: '1px solid #F0E0B0', borderRadius: 8, padding: '16px 20px', marginBottom: 16 }}>
      <Text strong style={{ fontSize: 14, color: '#8B6914' }}>📘 How One Transaction Becomes a GST Return — The Full Flow</Text>
      <div style={{ marginTop: 4, marginBottom: 12 }}>
        <Text type="secondary" style={{ fontSize: 12 }}>
          You never type a journal entry for a normal sale or purchase — this is what happens automatically the moment you save one.
        </Text>
      </div>
      <Steps
        direction="vertical" size="small" status="finish"
        items={[
          {
            title: <Text strong style={{ fontSize: 13 }}>1. You enter a Sale, Purchase, or Payment — once</Text>,
            description: <Text style={{ fontSize: 12 }}>POS/Billing, Purchase Hub, Day Close, or Voucher Entry — whichever screen matches what actually happened. Nothing else needs re-entering.</Text>,
          },
          {
            title: <Text strong style={{ fontSize: 13 }}>2. A balanced Dr/Cr journal posts itself</Text>,
            description: <Text style={{ fontSize: 12 }}>Every entry is checked — Debit must equal Credit — <Text code>before</Text> anything is written. A sale Dr's the payment mode's ledger (Cash / a <Text strong>specific</Text> bank you picked / UPI / Cheque In Hand) and Cr's Sales Account; a purchase Dr's Stock + Input GST and Cr's the Supplier's Payable account.</Text>,
          },
          {
            title: <Text strong style={{ fontSize: 13 }}>3. GST splits itself — CGST+SGST or IGST, automatically</Text>,
            description: <Text style={{ fontSize: 12 }}>Your registered state vs. the customer's/supplier's state decides it: same state → <Text strong>Output/Input CGST + SGST</Text> (half each); different state → <Text strong>Output/Input IGST</Text> (full amount). Sales use the Output ledgers, Purchases use the Input ones — four separate ledgers per tax type, never blended into one "GST" bucket.</Text>,
          },
          {
            title: <Text strong style={{ fontSize: 13 }}>4. It's immediately visible — Ledger, Trial Balance, Day Book</Text>,
            description: <Text style={{ fontSize: 12 }}>Open any of those three screens (above) right after saving — the same posting shows up there, with a running balance, no delay and no separate "sync" step.</Text>,
          },
          {
            title: <Text strong style={{ fontSize: 13 }}>5. Net GST Payable is a live number, not a month-end calculation</Text>,
            description: <Text style={{ fontSize: 12 }}><Text code>(Output CGST + Output SGST + Output IGST) − (Input CGST + Input SGST + Input IGST)</Text> — shown on the Accounting Dashboard's KPI strip right now, current as of the last transaction saved.</Text>,
          },
          {
            title: <Text strong style={{ fontSize: 13 }}>6. Filing GSTR-1 / 3B / 2B — the numbers are ready, filing itself is not automatic</Text>,
            description: (
              <>
                <Text style={{ fontSize: 12 }}>
                  <Text strong>GSTR-1</Text> (outward supplies) — pull invoice-wise sales + their CGST/SGST/IGST split from Sales Bill History / Sales Reports.{' '}
                  <Text strong>GSTR-3B</Text> (summary payable) — the Trial Balance's CGST/SGST/IGST ledger balances give you the exact figures.{' '}
                  <Text strong>GSTR-2B</Text> (purchase ITC reconciliation) — the Input CGST/SGST/IGST ledgers plus Purchase Reports.
                </Text>
                <div style={{ marginTop: 8 }}>
                  <Alert
                    type="warning" showIcon
                    message="This system does not generate the GSTN return JSON or file it for you."
                    description="It gets you every number the return needs, correctly split and always current — the actual filing on the GST portal (or through your CA/GSP) is still a separate, manual step."
                    style={{ fontSize: 12 }}
                  />
                </div>
              </>
            ),
          },
        ]}
      />
      <Divider style={{ margin: '12px 0' }} />
      <Text type="secondary" style={{ fontSize: 11 }}>
        💡 If Tally sync is enabled (Tally Bridge, under New Modules below), step 2's posting also auto-queues for Tally — same books, still zero double entry.
      </Text>
    </div>
  );
}

// ── Every Invoice Studio document type that's actually wired to real
// printing right now, and exactly which screen/action uses it — kept in
// sync by hand with the real print call sites (grep
// `printFromInvoiceStudio(` across client/src for the source of truth).
const INVOICE_WIRED = [
  { type: 'SALES_BILL', usedIn: 'POS checkout, and Sales Bill History → reprint any past bill' },
  { type: 'ESTIMATE', usedIn: 'Billing Hub → Estimate' },
  { type: 'ORDER_BOOKING', usedIn: 'Billing Hub → Order Booking' },
  { type: 'PURCHASE_BILL', usedIn: 'Purchase Hub → Gold / Silver / Diamond / Vendor Purchase' },
  { type: 'OLD_GOLD_PURCHASE', usedIn: 'Purchase Hub → Old Gold Purchase, Gold Exchange, Silver Exchange' },
  { type: 'ADVANCE', usedIn: 'Purchase Hub → Advance Receipt, Advance Adjustment' },
  { type: 'GIFT_VOUCHER', usedIn: 'Purchase Hub → Gift Voucher Bill' },
  { type: 'SCHEME_RECEIPT', usedIn: 'Purchase Hub → Scheme Receipt, and Savings Club → Collection' },
  { type: 'SALES_RETURN', usedIn: 'Sales Bill History → Return (issues the credit note)' },
  { type: 'APPROVAL_ISSUE', usedIn: 'Approval → Issue on Approval, and Non-Tagged Issue' },
  { type: 'APPROVAL_RECEIVE', usedIn: 'Approval → Receive Against Voucher, and Non-Tagged Receive' },
  { type: 'KARIGAR_SETTLEMENT', usedIn: 'Karigar → Settlement → Print Bill' },
  { type: 'REPAIR_RECEIPT', usedIn: 'Repair → Job Card Report → reprint' },
  { type: 'PLATFORM_SAAS_INVOICE', usedIn: 'Tenants (Super Admin) → "Generate GST Invoice" on any tenant row — isolated, Super Admin only' },
  { type: 'BARCODE_LABEL', usedIn: 'Every barcode/RFID tag print — designed separately in Label Designer, not this list' },
];
const INVOICE_UNWIRED_NOTE = 'Purchase Return, Karigar Issue/Receive (the standalone module, separate from Approval), Pawnbroking, Delivery Note, Stock Transfer/Adjustment/Verification, the Manufacturing types, Scheme Enrollment/Maturity, Digi Gold, the Accounts voucher types, Tax Invoice/Debit Note/Credit Note, and the Reports group';

function InvoiceStudioFlow() {
  return (
    <div style={{ background: '#FFFBF0', border: '1px solid #F0E0B0', borderRadius: 8, padding: '16px 20px', marginBottom: 16 }}>
      <Text strong style={{ fontSize: 14, color: '#8B6914' }}>📄 How to Design an Invoice — and How It Actually Gets Used</Text>
      <div style={{ marginTop: 4, marginBottom: 12 }}>
        <Text type="secondary" style={{ fontSize: 12 }}>
          There is no separate "import" step. Designing it and saving it <Text strong>is</Text> what puts it into real use — nothing else to do afterwards.
        </Text>
      </div>
      <Steps
        direction="vertical" size="small" status="finish"
        items={[
          {
            title: <Text strong style={{ fontSize: 13 }}>1. Design it — Invoice Studio</Text>,
            description: (
              <Text style={{ fontSize: 12 }}>
                Open Invoice Studio (below) → <Text strong>Create New Template</Text> → pick the document type (Sales Bill, Purchase Bill, Estimate, etc. — see the full list below for which ones matter) →
                choose how to start: <Text strong>Blank</Text>, a <Text strong>Ready-Made</Text> design, <Text strong>Upload</Text> your existing invoice image/PDF, or let <Text strong>AI Generate</Text> a layout from that upload →
                drag components onto the canvas (Shop Header, Items Table, Totals, GST, Signature, an Excel-style grid for anything custom) → click <Text strong>Save</Text>.
              </Text>
            ),
          },
          {
            title: <Text strong style={{ fontSize: 13 }}>2. It goes live automatically — no extra step</Text>,
            description: (
              <Text style={{ fontSize: 12 }}>
                The <Text strong>first</Text> template you save for a document type becomes the one real printing uses immediately — Save already says so ("saved and set as your default"). You only ever need <Text strong>Set Default</Text>
                if you design a <Text strong>second, alternate</Text> version of the same document type and want to switch which one prints. If the design still doesn't show up when you print, it almost always means the document type
                you saved under isn't actually wired to that print action yet — check the table below before assuming it's a bug.
              </Text>
            ),
          },
          {
            title: <Text strong style={{ fontSize: 13 }}>3. Where each document type is actually used when you print</Text>,
            description: (
              <div>
                <Text style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>
                  Invoice Studio lets you design far more document types than are wired to a real print action today. These <Text strong>are</Text> — design one of these and it's used the moment you print from the screen listed:
                </Text>
                <div style={{ borderRadius: 6, overflow: 'hidden', border: '1px solid #F0E0B0' }}>
                  {INVOICE_WIRED.map((row, i) => (
                    <div key={row.type} style={{
                      display: 'flex', gap: 10, padding: '6px 10px', fontSize: 11,
                      background: i % 2 ? '#fff' : '#FFFBF0',
                    }}>
                      <Tag color="gold" style={{ minWidth: 150, textAlign: 'center', margin: 0 }}>{row.type}</Tag>
                      <Text style={{ fontSize: 11 }}>{row.usedIn}</Text>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 10 }}>
                  <Alert
                    type="warning" showIcon
                    message="Everything else is designable but not yet wired to a real print action"
                    description={<Text style={{ fontSize: 11 }}>{INVOICE_UNWIRED_NOTE} — you can design a template for these today, but no screen prints through it yet. Ask for one to be wired up if you need it.</Text>}
                    style={{ fontSize: 11 }}
                  />
                </div>
              </div>
            ),
          },
        ]}
      />
    </div>
  );
}

export default function HelpCenterPage() {
  const navigate = useNavigate();

  return (
    <div className="page-wrapper">
      <div className="page-header">
        <div>
          <div className="page-header-title">❓ Help / How to Use</div>
          <div className="page-header-sub">
            Every module in one place — pick a screen below, it opens for real and walks you through it step by step.
          </div>
        </div>
      </div>

      <Collapse
        defaultActiveKey={['billing', 'invoice', 'accounting', 'savings', 'new-modules']}
        items={GROUPS.map((g) => ({
          key: g.key,
          label: <Space>{g.icon}<Text strong>{g.title}</Text><Tag color="gold" style={{ marginLeft: 4 }}>{g.items.length}</Tag></Space>,
          children: (
            <Space direction="vertical" style={{ width: '100%' }} size={8}>
              {g.intro}
              {g.items.map((it) => (
                <div
                  key={it.path}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                    padding: '10px 14px', borderRadius: 8, background: '#fafafa', border: '1px solid #f0f0f0',
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <Text strong style={{ fontSize: 13 }}>{it.title}</Text>
                    <div><Text type="secondary" style={{ fontSize: 12 }}>{it.desc}</Text></div>
                  </div>
                  <Button
                    size="small"
                    type="primary"
                    icon={<RightOutlined />}
                    style={{ background: '#B8860B', borderColor: '#B8860B', fontWeight: 600, flexShrink: 0 }}
                    onClick={() => navigate(it.path, { state: { startTour: true } })}
                  >
                    Start
                  </Button>
                </div>
              ))}
            </Space>
          ),
        }))}
      />

      <div style={{ marginTop: 20 }}>
        <Tag color="gold" style={{ padding: '4px 10px' }}>Tip</Tag>
        <Text type="secondary" style={{ fontSize: 12, marginLeft: 6 }}>
          Every screen listed above also has a floating "?" button in the bottom-right corner —
          click it anytime to replay that screen's walkthrough.
        </Text>
      </div>
    </div>
  );
}
