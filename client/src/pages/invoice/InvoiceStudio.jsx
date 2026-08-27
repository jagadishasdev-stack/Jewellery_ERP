/**
 * Invoice Studio — AI-Powered Invoice Designer
 * ─────────────────────────────────────────────
 * Features:
 * - 30+ invoice types across 8 categories
 * - 5 creation methods: Blank / Ready-Made / Upload Image / Upload PDF / AI Generate
 * - AI layout detection via Google Vision API (backend proxy)
 * - Drag-and-drop canvas with live preview
 * - Dynamic ERP field mapping ({{variable}} syntax)
 * - Multiple templates per invoice type, version history
 * - A4 / A5 / Thermal 80mm / Custom paper sizes
 * - Tenant-isolated templates
 * - Print / PDF / WhatsApp / Email ready
 */
import React, { useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Layout, Select, Button, Space, Typography, Form, Input,
  InputNumber, Switch, Tooltip, Tag, message, Modal,
  Tabs, Row, Col, Card, Divider, Alert, Badge, Upload, Steps,
  Drawer, Radio, Spin, Progress, Popconfirm, Table,
} from 'antd';
import {
  SaveOutlined, PrinterOutlined, PlusOutlined, DeleteOutlined,
  CopyOutlined, SettingOutlined, FileTextOutlined, HistoryOutlined,
  UploadOutlined, RobotOutlined, ThunderboltOutlined, EyeOutlined,
  StarOutlined, AppstoreOutlined, ArrowLeftOutlined, CheckCircleOutlined,
  CloudUploadOutlined, EditOutlined, SyncOutlined, DownloadOutlined,
  ShareAltOutlined, WarningOutlined, InfoCircleOutlined, BgColorsOutlined,
  UserOutlined, QuestionCircleOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../../store/authStore';
import { tenantApi, invoiceStudioApi } from '../../api/modules';
import PageTour from '../../components/PageTour';
import KPICard from '../../components/KPICard';
import EmptyState from '../../components/states/EmptyState';

const { Title, Text, Paragraph } = Typography;
const { Option } = Select;
const { Sider, Content } = Layout;
const { Dragger } = Upload;

// ── Invoice type categories ───────────────────────────────────────────────────
const INVOICE_CATEGORIES = [
  {
    group: 'Sales', color: '#B8860B', icon: '🛒',
    types: [
      { key: 'SALES_BILL',     label: 'Sales Bill' },
      { key: 'SALES_RETURN',   label: 'Sales Return' },
      { key: 'ESTIMATE',       label: 'Estimate / Quotation' },
      { key: 'ADVANCE',        label: 'Advance Receipt' },
      { key: 'ORDER_BOOKING',  label: 'Order Booking' },
      { key: 'DELIVERY_NOTE',  label: 'Delivery Note' },
      { key: 'GIFT_VOUCHER',   label: 'Gift Voucher' },
    ],
  },
  {
    group: 'Purchase', color: '#fa8c16', icon: '🛍️',
    types: [
      { key: 'PURCHASE_BILL',      label: 'Purchase Bill' },
      { key: 'PURCHASE_RETURN',    label: 'Purchase Return' },
      { key: 'OLD_GOLD_PURCHASE',  label: 'Old Gold Purchase / Exchange' },
    ],
  },
  {
    group: 'Approval', color: '#8c6d1f', icon: '📝',
    types: [
      { key: 'APPROVAL_ISSUE',   label: 'Approval Issue Voucher' },
      { key: 'APPROVAL_RECEIVE', label: 'Approval Receive Voucher' },
    ],
  },
  {
    group: 'Repair', color: '#eb2f96', icon: '🛠️',
    types: [
      { key: 'REPAIR_RECEIPT', label: 'Repair Job Card / Receipt' },
    ],
  },
  {
    group: 'Inventory', color: '#52c41a', icon: '📦',
    types: [
      { key: 'STOCK_TRANSFER',    label: 'Stock Transfer' },
      { key: 'STOCK_ADJUSTMENT',  label: 'Stock Adjustment' },
      { key: 'STOCK_VERIFICATION', label: 'Stock Verification' },
    ],
  },
  {
    group: 'Manufacturing', color: '#ff4d4f', icon: '⚒️',
    types: [
      { key: 'GOLDSMITH_ISSUE',    label: 'Goldsmith Issue' },
      { key: 'GOLDSMITH_RECEIPT',  label: 'Goldsmith Receipt' },
      { key: 'KARIGAR_SETTLEMENT', label: 'Karigar Settlement' },
      { key: 'MFG_RECEIPT',        label: 'Manufacturing Receipt' },
      { key: 'JOB_WORK',           label: 'Job Work Invoice' },
    ],
  },
  {
    group: 'Scheme', color: '#722ed1', icon: '🪙',
    types: [
      { key: 'SCHEME_ENROLLMENT', label: 'Scheme Enrollment' },
      { key: 'SCHEME_RECEIPT',    label: 'Scheme Receipt' },
      { key: 'SCHEME_MATURITY',   label: 'Scheme Maturity' },
      { key: 'DIGI_GOLD',         label: 'Digi Gold Receipt' },
    ],
  },
  {
    group: 'Accounts', color: '#1890ff', icon: '🏦',
    types: [
      { key: 'RECEIPT_VOUCHER',  label: 'Receipt Voucher' },
      { key: 'PAYMENT_VOUCHER',  label: 'Payment Voucher' },
      { key: 'JOURNAL_VOUCHER',  label: 'Journal Voucher' },
      { key: 'CONTRA_VOUCHER',   label: 'Contra Voucher' },
    ],
  },
  {
    group: 'GST', color: '#13c2c2', icon: '🧾',
    types: [
      { key: 'TAX_INVOICE',  label: 'Tax Invoice' },
      { key: 'DEBIT_NOTE',   label: 'Debit Note' },
      { key: 'CREDIT_NOTE',  label: 'Credit Note' },
    ],
  },
  {
    group: 'Reports', color: '#888', icon: '📊',
    types: [
      { key: 'CUSTOMER_STATEMENT', label: 'Customer Statement' },
      { key: 'LEDGER_PRINT',       label: 'Ledger Print' },
      { key: 'OUTSTANDING_REPORT', label: 'Outstanding Report' },
    ],
  },
  // Isolated from every tenant-facing category above — this is for
  // billing a TENANT (the ERP provider's own client), not for a tenant to
  // bill their own customers. Server-side, Document_Type PLATFORM_SAAS_
  // INVOICE is hard-gated to Super Admin only (see invoiceStudio.js's
  // requireSuperAdminForLabel and the /resolve/:docType check) and always
  // saved with Tenant_ID = null — it can never appear in, be resolved by,
  // or be mistaken for any tenant's own template list. `superAdminOnly`
  // below is just the matching UI-side filter (see the Type Select
  // screen) so a regular tenant admin never even sees the category exist.
  {
    group: 'Platform Billing — Super Admin Only', color: '#000000', icon: '🏢', superAdminOnly: true,
    types: [
      { key: 'PLATFORM_SAAS_INVOICE', label: 'Software / SaaS GST Invoice (JewelNexus → Tenant)' },
    ],
  },
];

const ALL_TYPES = INVOICE_CATEGORIES.flatMap(c => c.types);
const TYPE_LABEL = Object.fromEntries(ALL_TYPES.map(t => [t.key, t.label]));
const TYPE_GROUP_COLOR = Object.fromEntries(
  INVOICE_CATEGORIES.flatMap(c => c.types.map(t => [t.key, c.color]))
);

// ── Paper sizes ───────────────────────────────────────────────────────────────
const PAPER_SIZES = {
  A4:         { w: 794,  h: 1123, label: 'A4 Portrait (210×297mm)' },
  A4_L:       { w: 1123, h: 794,  label: 'A4 Landscape (297×210mm)' },
  A5:         { w: 559,  h: 794,  label: 'A5 (148×210mm)' },
  THERMAL_80: { w: 302,  h: 850,  label: 'Thermal 80mm' },
  THERMAL_58: { w: 219,  h: 850,  label: 'Thermal 58mm' },
  CUSTOM:     { w: 794,  h: 1123, label: 'Custom Size' },
};

// ── Component palette (drag onto canvas) ─────────────────────────────────────
const COMPONENTS = [
  { type: 'logo',          label: '🖼️ Shop Logo',          group: 'Header' },
  { type: 'shop_header',   label: '🏷️ Shop Name & Address', group: 'Header' },
  { type: 'invoice_meta',  label: '📋 Invoice No / Date',   group: 'Header' },
  { type: 'customer',      label: '👤 Customer Details',    group: 'Content' },
  { type: 'items_table',   label: '📊 Items Table',         group: 'Content' },
  { type: 'gold_rate',     label: '💛 Gold Rate Box',       group: 'Content' },
  { type: 'totals',        label: '💰 Bill Totals',         group: 'Content' },
  { type: 'gst_block',     label: '🧾 GST Breakdown',       group: 'Content' },
  { type: 'payment',       label: '💳 Payment Details',     group: 'Content' },
  { type: 'old_gold',      label: '🥇 Old Gold Exchange',   group: 'Content' },
  { type: 'scheme_block',  label: '🪙 Scheme Details',      group: 'Content' },
  { type: 'karigar_table', label: '⚒️ Karigar Table',       group: 'Content' },
  { type: 'excel_grid',    label: '📊 Excel-Style Grid',    group: 'Content' },
  { type: 'bank_details',  label: '🏦 Bank Details',        group: 'Footer' },
  { type: 'terms',         label: '📃 Terms & Conditions',  group: 'Footer' },
  { type: 'signature',     label: '✍️ Signature Line',      group: 'Footer' },
  { type: 'stamp',         label: '🔵 Company Stamp',       group: 'Footer' },
  { type: 'qr_code',       label: '🔲 QR Code',             group: 'Elements' },
  { type: 'barcode',       label: '📦 Barcode',             group: 'Elements' },
  { type: 'text',          label: '📄 Text Block',          group: 'Elements' },
  { type: 'line',          label: '─ Divider Line',         group: 'Elements' },
  { type: 'image',         label: '🖼️ Image',              group: 'Elements' },
  { type: 'rectangle',     label: '▭ Rectangle',           group: 'Elements' },
];

const COMP_GROUPS = ['Header', 'Content', 'Footer', 'Elements'];

// ── Excel-style grid — a free-form spreadsheet block, unlike items_table/
// karigar_table (which are bound to a fixed ERP column set). Any cell can
// hold static text or a {{variable}}, cells can be merged left-to-right
// and top-to-bottom (like Excel's Merge Cells), and every cell carries its
// own bold/align/fill/text-color. Rendered as a real HTML <table> at print
// time (invoiceRenderer.js's renderExcelGrid) — colspan/rowspan and all.
// A `covers` list on the top-left cell of a merge tracks exactly which
// other cells it currently owns, so Unmerge can restore precisely those
// cells (and only those) without guessing.
const mkGridCell = (text = '') => ({ text, colspan: 1, rowspan: 1, merged: false, bold: false, align: 'left', bg: '', color: '', covers: [] });

const buildDefaultGrid = () => {
  const numCols = 4;
  const header = ['Item', 'Qty', 'Rate', 'Amount'].map(t => ({ ...mkGridCell(t), bold: true, align: 'center', bg: '#B8860B', color: '#ffffff' }));
  const blankRow = () => Array.from({ length: numCols }, () => mkGridCell());
  return {
    numCols, showBorders: true, fontSize: 10,
    rows: [{ height: 26, cells: header }, { height: 22, cells: blankRow() }, { height: 22, cells: blankRow() }],
  };
};

const gridAddRow = (content) => ({
  ...content,
  rows: [...content.rows, { height: 22, cells: Array.from({ length: content.numCols }, () => mkGridCell()) }],
});

// Returns null (instead of throwing) when the row holds any merge —
// callers show a "Unmerge first" message rather than silently corrupting
// spans that reach into a row that no longer exists.
const gridDeleteRow = (content, rowIdx) => {
  if (content.rows.length <= 1) return null;
  const blocked = content.rows[rowIdx].cells.some(cell => cell.merged || cell.rowspan > 1 || cell.colspan > 1);
  if (blocked) return null;
  return { ...content, rows: content.rows.filter((_, i) => i !== rowIdx) };
};

const gridAddCol = (content) => ({
  ...content,
  numCols: content.numCols + 1,
  rows: content.rows.map(r => ({ ...r, cells: [...r.cells, mkGridCell()] })),
});

const gridDeleteCol = (content, colIdx) => {
  if (content.numCols <= 1) return null;
  const blocked = content.rows.some(r => { const cell = r.cells[colIdx]; return cell.merged || cell.rowspan > 1 || cell.colspan > 1; });
  if (blocked) return null;
  return { ...content, numCols: content.numCols - 1, rows: content.rows.map(r => ({ ...r, cells: r.cells.filter((_, i) => i !== colIdx) })) };
};

// Only merges with the immediately-adjacent plain (unmerged, un-spanned)
// cell — kept deliberately simple rather than supporting arbitrary
// rectangular selections, but merging twice extends the same span, so a
// 3-column header cell is still just "Merge Right" clicked twice.
const gridMergeRight = (content, r, c) => {
  const cell = content.rows[r].cells[c];
  const rightIdx = c + cell.colspan;
  if (rightIdx >= content.numCols) return null;
  const rightCell = content.rows[r].cells[rightIdx];
  if (rightCell.merged || rightCell.colspan > 1 || rightCell.rowspan > 1) return null;
  const rows = content.rows.map((row, ri) => ri !== r ? row : {
    ...row,
    cells: row.cells.map((cc, ci) => {
      if (ci === c) return { ...cc, colspan: cc.colspan + 1, covers: [...cc.covers, { r, c: rightIdx }] };
      if (ci === rightIdx) return { ...cc, merged: true };
      return cc;
    }),
  });
  return { ...content, rows };
};

const gridMergeDown = (content, r, c) => {
  const cell = content.rows[r].cells[c];
  const belowIdx = r + cell.rowspan;
  if (belowIdx >= content.rows.length) return null;
  const belowCell = content.rows[belowIdx].cells[c];
  if (belowCell.merged || belowCell.colspan > 1 || belowCell.rowspan > 1) return null;
  const rows = content.rows.map((row, ri) => {
    if (ri === r) return { ...row, cells: row.cells.map((cc, ci) => ci === c ? { ...cc, rowspan: cc.rowspan + 1, covers: [...cc.covers, { r: belowIdx, c }] } : cc) };
    if (ri === belowIdx) return { ...row, cells: row.cells.map((cc, ci) => ci === c ? { ...cc, merged: true } : cc) };
    return row;
  });
  return { ...content, rows };
};

const gridUnmerge = (content, r, c) => {
  const cell = content.rows[r].cells[c];
  if (!cell.covers?.length) return content;
  const coverSet = new Set(cell.covers.map(({ r: rr, c: cc }) => `${rr}:${cc}`));
  const rows = content.rows.map((row, ri) => ({
    ...row,
    cells: row.cells.map((cc, ci) => {
      if (ri === r && ci === c) return { ...cc, colspan: 1, rowspan: 1, covers: [] };
      if (coverSet.has(`${ri}:${ci}`)) return { ...cc, merged: false };
      return cc;
    }),
  }));
  return { ...content, rows };
};

const gridUpdateCell = (content, r, c, patch) => ({
  ...content,
  rows: content.rows.map((row, ri) => ri !== r ? row : { ...row, cells: row.cells.map((cc, ci) => ci !== c ? cc : { ...cc, ...patch }) }),
});

const gridUpdateRowHeight = (content, r, height) => ({
  ...content,
  rows: content.rows.map((row, ri) => ri === r ? { ...row, height } : row),
});

// ── Excel Grid editor — opened from the Properties panel when an
// excel_grid block is selected. Click a cell to select it (toolbar acts
// on whichever cell is selected), type directly into any cell, and use
// {{variable}} anywhere for real invoice data (see the ERP Variables
// panel for the full list) — resolved for real at print time exactly
// like every other block's text.
function ExcelGridEditorModal({ open, content, onChange, onClose }) {
  const [active, setActive] = useState(null); // { r, c }
  if (!content) return null;
  const apply = (fn) => {
    const next = fn(content);
    if (next === null) { message.warning('This row/column is part of a merge — Unmerge it first.'); return; }
    onChange(next);
  };
  const activeCell = active ? content.rows[active.r]?.cells[active.c] : null;

  return (
    <Modal title="📊 Edit Excel-Style Grid" open={open} onCancel={onClose} width={800} destroyOnClose
      footer={<Button type="primary" onClick={onClose} style={{ background: '#B8860B', borderColor: '#B8860B' }}>Done</Button>}>
      <Space wrap size={6} style={{ marginBottom: 10 }}>
        <Button size="small" onClick={() => apply(gridAddRow)}>+ Row</Button>
        <Button size="small" disabled={!active} onClick={() => apply(gc => gridDeleteRow(gc, active.r))}>− Row</Button>
        <Button size="small" onClick={() => apply(gridAddCol)}>+ Column</Button>
        <Button size="small" disabled={!active} onClick={() => apply(gc => gridDeleteCol(gc, active.c))}>− Column</Button>
        <Divider type="vertical" />
        <Button size="small" disabled={!active} onClick={() => apply(gc => gridMergeRight(gc, active.r, active.c))}>Merge Right</Button>
        <Button size="small" disabled={!active} onClick={() => apply(gc => gridMergeDown(gc, active.r, active.c))}>Merge Down</Button>
        <Button size="small" disabled={!active || !activeCell?.covers?.length} onClick={() => apply(gc => gridUnmerge(gc, active.r, active.c))}>Unmerge</Button>
        <Divider type="vertical" />
        <Switch size="small" disabled={!active} checked={!!activeCell?.bold}
          onChange={v => apply(gc => gridUpdateCell(gc, active.r, active.c, { bold: v }))} />
        <Text style={{ fontSize: 11 }}>Bold</Text>
        <Select size="small" style={{ width: 86 }} disabled={!active} value={activeCell?.align || 'left'}
          onChange={v => apply(gc => gridUpdateCell(gc, active.r, active.c, { align: v }))}>
          <Option value="left">Left</Option><Option value="center">Center</Option><Option value="right">Right</Option>
        </Select>
        <Tooltip title="Cell fill color">
          <input type="color" disabled={!active} value={activeCell?.bg || '#ffffff'}
            onChange={e => apply(gc => gridUpdateCell(gc, active.r, active.c, { bg: e.target.value }))}
            style={{ width: 26, height: 24, border: 'none', cursor: active ? 'pointer' : 'not-allowed' }} />
        </Tooltip>
        <Tooltip title="Text color">
          <input type="color" disabled={!active} value={activeCell?.color || '#1a1a2e'}
            onChange={e => apply(gc => gridUpdateCell(gc, active.r, active.c, { color: e.target.value }))}
            style={{ width: 26, height: 24, border: 'none', cursor: active ? 'pointer' : 'not-allowed' }} />
        </Tooltip>
        <Divider type="vertical" />
        <InputNumber size="small" min={14} max={80} style={{ width: 74 }} disabled={!active}
          value={active ? (content.rows[active.r]?.height || 22) : undefined}
          onChange={v => active && onChange(gridUpdateRowHeight(content, active.r, v || 22))} addonAfter="h" />
        <InputNumber size="small" min={6} max={24} style={{ width: 68 }} value={content.fontSize || 10}
          onChange={v => onChange({ ...content, fontSize: v || 10 })} addonAfter="pt" />
        <Switch size="small" checked={content.showBorders !== false} onChange={v => onChange({ ...content, showBorders: v })} />
        <Text style={{ fontSize: 11 }}>Borders</Text>
      </Space>
      <Alert type="info" showIcon style={{ marginBottom: 8, fontSize: 11 }}
        message='Click a cell, then type its content — including {{variable}} for real invoice data. The toolbar above acts on whichever cell is selected.' />
      <div style={{ border: '1px solid #eee', borderRadius: 6, overflow: 'auto', maxHeight: 400 }}>
        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <tbody>
            {content.rows.map((row, r) => (
              <tr key={r} style={{ height: row.height || 22 }}>
                {row.cells.map((cell, c) => {
                  if (cell.merged) return null;
                  const isActive = active?.r === r && active?.c === c;
                  return (
                    <td key={c} colSpan={cell.colspan} rowSpan={cell.rowspan}
                      onClick={() => setActive({ r, c })}
                      style={{
                        border: content.showBorders !== false ? '1px solid #ccc' : '1px dashed #eee',
                        background: cell.bg || '#fff',
                        boxShadow: isActive ? 'inset 0 0 0 2px #B8860B' : 'none',
                        padding: 0, minWidth: 64,
                      }}>
                      <input
                        value={cell.text}
                        onChange={e => apply(gc => gridUpdateCell(gc, r, c, { text: e.target.value }))}
                        onFocus={() => setActive({ r, c })}
                        style={{
                          width: '100%', height: '100%', border: 'none', outline: 'none', background: 'transparent',
                          padding: '4px 6px', fontSize: content.fontSize || 10, boxSizing: 'border-box',
                          fontWeight: cell.bold ? 700 : 400, textAlign: cell.align || 'left',
                          color: cell.color || '#1a1a2e',
                        }}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}

// ── ERP variables ─────────────────────────────────────────────────────────────
const ERP_VARIABLES = [
  { group: 'Shop', vars: ['{{shop_name}}','{{shop_address}}','{{shop_city}}','{{shop_phone}}','{{shop_email}}','{{shop_gst}}','{{shop_pan}}'] },
  { group: 'Invoice', vars: ['{{invoice_no}}','{{invoice_date}}','{{invoice_type}}','{{bill_time}}','{{counter_name}}','{{operator_name}}'] },
  { group: 'Customer', vars: ['{{customer_name}}','{{customer_mobile}}','{{customer_address}}','{{customer_gst}}','{{customer_pan}}','{{loyalty_points}}'] },
  { group: 'Jewellery', vars: ['{{gross_weight}}','{{net_weight}}','{{stone_weight}}','{{purity}}','{{gold_rate}}','{{making_charge}}','{{wastage}}','{{huid}}','{{hallmark}}'] },
  { group: 'Amounts', vars: ['{{gold_value}}','{{making_total}}','{{stone_value}}','{{subtotal}}','{{discount}}','{{gst_amt}}','{{cgst}}','{{sgst}}','{{igst}}','{{net_payable}}','{{round_off}}'] },
  { group: 'Adjustments', vars: ['{{old_gold_wt}}','{{old_gold_value}}','{{scheme_adj}}','{{voucher_amt}}','{{advance_adj}}'] },
  { group: 'Payment', vars: ['{{payment_mode}}','{{payment_ref}}','{{amount_paid}}','{{balance}}'] },
  { group: 'Karigar', vars: ['{{karigar_name}}','{{gold_issued}}','{{gold_returned}}','{{wastage_wt}}','{{wages}}','{{net_wages}}'] },
  { group: 'Scheme', vars: ['{{scheme_name}}','{{member_no}}','{{installment}}','{{paid_amt}}','{{maturity_val}}','{{next_due}}'] },
];

// ── Ready-made templates library ──────────────────────────────────────────────
const TEMPLATE_LIBRARY = [
  { id: 'classic',    name: 'Classic Jewellery',    desc: 'Traditional A4 with gold header and footer',  preview: '#B8860B', popular: true },
  { id: 'modern',     name: 'Modern Minimal',        desc: 'Clean layout with sidebar customer section',  preview: '#1890ff', popular: true },
  { id: 'premium',    name: 'Premium Gold',           desc: 'Luxury design with gold accents and stamp',   preview: '#FFD700', popular: false },
  { id: 'wholesale',  name: 'Wholesale Dealer',       desc: 'Bulk format with dealer terms and GST split', preview: '#52c41a', popular: false },
  { id: 'gst_std',    name: 'GST Standard',           desc: 'Government-compliant Tax Invoice format',     preview: '#13c2c2', popular: true },
  { id: 'thermal',    name: 'Thermal POS 80mm',       desc: 'Compact thermal receipt format',              preview: '#555',    popular: false },
];

// ── Default component content generators ─────────────────────────────────────
const defaultContent = (type) => {
  const map = {
    logo:          { url: '', width: 120, height: 60 },
    shop_header:   { text: '{{shop_name}}\n{{shop_address}}\nGST: {{shop_gst}} | Ph: {{shop_phone}}', align: 'center', fontSize: 14, bold: true },
    invoice_meta:  { show_no: true, show_date: true, show_type: true, label_color: '#888' },
    customer:      { show_name: true, show_mobile: true, show_address: true, show_gst: true, show_pan: true },
    items_table:   { columns: ['#','Item','Purity','Gross Wt','Net Wt','Rate','Making','GST','Amount'], show_huid: true },
    gold_rate:     { show_22k: true, show_24k: false, show_silver: true },
    totals:        { show_gold_value: true, show_making: true, show_stone: false, show_gst: true, show_old_gold: true, show_scheme: true },
    gst_block:     { show_cgst: true, show_sgst: true, show_igst: false },
    payment:       { show_mode: true, show_ref: true, show_balance: true },
    old_gold:      { show_weight: true, show_purity: true, show_value: true },
    scheme_block:  { show_name: true, show_balance: true, show_maturity: true },
    karigar_table: { columns: ['Item','Issued Wt','Return Wt','Wastage','Wages'] },
    excel_grid:    buildDefaultGrid(),
    bank_details:  { show_account: true, show_ifsc: true, show_upi: true },
    terms:         { text: '1. Goods once sold will not be taken back.\n2. Subject to local jurisdiction.\n3. E.&O.E.' },
    signature:     { label: 'Authorised Signatory', show_stamp: true },
    stamp:         { text: 'RECEIVED', color: '#B8860B' },
    qr_code:       { data: '{{invoice_no}}', size: 80 },
    barcode:       { data: '{{invoice_no}}', height: 40 },
    text:          { text: 'Double-click to edit', fontSize: 12, bold: false, align: 'left', color: '#333' },
    line:          { color: '#B8860B', thickness: 1, style: 'solid' },
    image:         { url: '', width: 100, height: 60 },
    rectangle:     { fillColor: 'transparent', borderColor: '#B8860B', borderWidth: 1, borderRadius: 0 },
  };
  return map[type] || { text: type };
};

// ── Build initial layout for a given paper size ──────────────────────────────
const buildDefaultLayout = (paperKey = 'A4') => {
  const p = PAPER_SIZES[paperKey];
  return [
    { id: 'logo',     type: 'logo',         x: 20,  y: 20,  w: 120, h: 60,  content: defaultContent('logo') },
    { id: 'header',   type: 'shop_header',  x: 160, y: 20,  w: p.w-200, h: 70,  content: defaultContent('shop_header') },
    { id: 'divider1', type: 'line',          x: 10,  y: 100, w: p.w-20, h: 2,   content: defaultContent('line') },
    { id: 'meta',     type: 'invoice_meta', x: 10,  y: 108, w: p.w-20, h: 40,  content: defaultContent('invoice_meta') },
    { id: 'customer', type: 'customer',     x: 10,  y: 155, w: p.w-20, h: 80,  content: defaultContent('customer') },
    { id: 'divider2', type: 'line',          x: 10,  y: 242, w: p.w-20, h: 2,   content: defaultContent('line') },
    { id: 'items',    type: 'items_table',  x: 10,  y: 250, w: p.w-20, h: 300, content: defaultContent('items_table') },
    { id: 'totals',   type: 'totals',       x: p.w-220, y: 560, w: 210, h: 160, content: defaultContent('totals') },
    { id: 'divider3', type: 'line',          x: 10,  y: 730, w: p.w-20, h: 2,   content: defaultContent('line') },
    { id: 'footer',   type: 'terms',        x: 10,  y: 740, w: p.w/2-20, h: 80, content: defaultContent('terms') },
    { id: 'sign',     type: 'signature',    x: p.w/2, y: 740, w: p.w/2-20, h: 60, content: defaultContent('signature') },
  ];
};

// ── Canvas component renderer (mini preview blocks) ──────────────────────────
function CanvasBlock({ block, selected, onSelect, onMove, paperW }) {
  const ref = useRef(null);

  const handleMouseDown = (e) => {
    e.stopPropagation();
    onSelect(block.id);
    const startX = e.clientX - block.x;
    const startY = e.clientY - block.y;
    const onMove_ = (me) => onMove(block.id, me.clientX - startX, me.clientY - startY);
    const onUp = () => { window.removeEventListener('mousemove', onMove_); window.removeEventListener('mouseup', onUp); };
    window.addEventListener('mousemove', onMove_);
    window.addEventListener('mouseup', onUp);
  };

  const label = {
    logo: '🖼️ Logo', shop_header: '🏷️ Shop Header', invoice_meta: '📋 Invoice No/Date',
    customer: '👤 Customer', items_table: '📊 Items Table', gold_rate: '💛 Gold Rate',
    totals: '💰 Totals', gst_block: '🧾 GST', payment: '💳 Payment',
    old_gold: '🥇 Old Gold', scheme_block: '🪙 Scheme', karigar_table: '⚒️ Karigar',
    bank_details: '🏦 Bank', terms: '📃 Terms', signature: '✍️ Signature', excel_grid: '📊 Excel Grid',
    stamp: '🔵 Stamp', qr_code: '🔲 QR', barcode: '📦 Barcode',
    text: block.content?.text?.substring(0, 20) || '📄 Text',
    line: '─────────', image: '🖼️ Image', rectangle: '▭',
  }[block.type] || block.type;

  return (
    <div ref={ref}
      onMouseDown={handleMouseDown}
      style={{
        position: 'absolute',
        left: block.x, top: block.y,
        width: block.w, height: block.h,
        border: selected ? '2px solid #B8860B' : '1px dashed #d9d9d9',
        background: block.type === 'line' ? 'transparent' : (selected ? '#FFF8E1' : 'rgba(255,255,255,0.7)'),
        cursor: 'move', borderRadius: 2,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 11, color: '#555', userSelect: 'none', overflow: 'hidden',
        boxSizing: 'border-box',
      }}>
      {block.type === 'line'
        ? <div style={{ width: '100%', height: block.content?.thickness || 1, background: block.content?.color || '#B8860B' }} />
        : <Text style={{ fontSize: 11, textAlign: 'center', padding: '0 4px' }}>{label}</Text>
      }
      {selected && (
        <div style={{ position: 'absolute', top: -8, right: -8, width: 16, height: 16, background: '#B8860B', borderRadius: '50%', cursor: 'pointer' }} />
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ════════════════════════════════════════════════════════════════════════════
export default function InvoiceStudio() {
  const { user } = useAuthStore();
  const qc = useQueryClient();
  const navigate = useNavigate();

  // Super Admin can design/import an invoice template on behalf of a
  // specific tenant client (the "we design it for them through our master
  // login" case) — everyone else just designs their own, exactly as
  // before. Backend already enforces this scoping (see invoiceStudio.js's
  // resolveTenantId — a non-super-admin can never override this regardless
  // of what's sent), this is purely the UI to drive it.
  const isSuperAdmin = user?.roleName === 'Super Admin';
  const [managedTenantId, setManagedTenantId] = useState(null);
  const tenantParam = isSuperAdmin && managedTenantId ? { tenantId: managedTenantId } : {};

  const { data: tenantsList, isLoading: tenantsLoading } = useQuery({
    queryKey: ['tenants-all'],
    queryFn: () => tenantApi.getAllTenants().then((r) => r.data.data),
    enabled: isSuperAdmin,
  });

  // ── Navigation state ──────────────────────────────────────────────────────
  const [screen, setScreen]           = useState('home');   // home | type-select | method-select | design | ai-processing
  const [selectedType, setSelectedType] = useState(null);
  const [creationMethod, setCreationMethod] = useState(null);

  // ── Designer state ─────────────────────────────────────────────────────────
  const [paperSize,   setPaperSize]   = useState('A4');
  const [blocks,      setBlocks]      = useState([]);
  const [selected,    setSelected]    = useState(null);
  const [templateName, setTemplateName] = useState('');
  const [templateVersion, setTemplateVersion] = useState(1);
  const [isDirty,     setIsDirty]     = useState(false);
  const [editingId,   setEditingId]   = useState(null);   // template being edited

  // ── AI processing state ───────────────────────────────────────────────────
  const [aiFile,       setAiFile]     = useState(null);
  const [aiProgress,   setAiProgress] = useState(0);
  const [aiStatus,     setAiStatus]   = useState('');
  const [aiResult,     setAiResult]   = useState(null);

  // ── Properties panel ──────────────────────────────────────────────────────
  const [showVars, setShowVars]       = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [gridEditorOpen, setGridEditorOpen] = useState(false);

  // ── Walkthrough tour refs (Design Canvas screen) ───────────────────────────
  const paletteRef = useRef(null);
  const canvasRef = useRef(null);
  const propertiesRef = useRef(null);
  const saveRef = useRef(null);
  const setDefaultRef = useRef(null);
  const tourSteps = [
    { title: '1. Component Palette', description: 'Click any component here — Shop Header, Customer Details, Items Table, Totals, GST, Signature and more — to drop it onto your invoice canvas.', target: () => paletteRef.current },
    { title: '2. Design Canvas', description: 'Drag a block anywhere to reposition it, and click a block to select it. This canvas is a to-scale mock-up of exactly how the printed invoice will look.', target: () => canvasRef.current },
    { title: '3. Properties Panel', description: 'With a block selected, fine-tune its position, size, text, color and other settings here.', target: () => propertiesRef.current },
    { title: '4. Save', description: 'Give your template a name at the top-left, then save any time — you can keep multiple templates per invoice type.', target: () => saveRef.current },
    { title: '5. Set as Default', description: 'Your first template for a document type is made the default automatically on Save — real bills already use it. This button only matters if you add a second, alternate design later and want to switch which one prints.', target: () => setDefaultRef.current },
  ];

  const paper = { ...PAPER_SIZES[paperSize] };
  const scale = Math.min(1, 680 / paper.w);
  const selectedBlock = blocks.find(b => b.id === selected);

  // ── Queries ───────────────────────────────────────────────────────────────
  // A Super Admin sees nothing until a tenant is picked — there's no
  // meaningful "own" invoice templates for the platform's own account.
  const canLoadTemplates = !isSuperAdmin || !!managedTenantId;
  const { data: templates, isLoading: tmplLoading } = useQuery({
    queryKey: ['invoice-studio-templates', managedTenantId],
    queryFn: () => invoiceStudioApi.getTemplates(tenantParam).then(r => r.data.data || []),
    enabled: canLoadTemplates,
  });

  const { data: versions } = useQuery({
    queryKey: ['template-versions', editingId, managedTenantId],
    queryFn: () => invoiceStudioApi.getVersions(editingId, tenantParam).then(r => r.data.data || []),
    enabled: !!editingId && showHistory,
  });

  // Platform Billing (PLATFORM_SAAS_INVOICE) is never "on behalf of a
  // tenant" — it has no managedTenantId concept at all, unlike every
  // other Super-Admin-managed template above — so it gets its own
  // always-on query (explicitly the global set, `tenantId: 'null'`) that
  // doesn't wait on canLoadTemplates/managedTenantId being picked.
  const { data: platformTemplates } = useQuery({
    queryKey: ['invoice-studio-templates-platform'],
    queryFn: () => invoiceStudioApi.getTemplates({ tenantId: 'null', docType: 'PLATFORM_SAAS_INVOICE' }).then(r => r.data.data || []),
    enabled: isSuperAdmin,
  });

  // ── Mutations ──────────────────────────────────────────────────────────────
  const saveMutation = useMutation({
    mutationFn: (data) => editingId
      ? invoiceStudioApi.updateTemplate(editingId, data, tenantParam)
      : invoiceStudioApi.createTemplate(data, tenantParam),
    onSuccess: (res) => {
      const saved = res.data.data;
      if (!editingId) setEditingId(saved.Template_ID);
      // The server auto-promotes a tenant's FIRST template for a document
      // type to Is_Default (see routes/invoiceStudio.js's POST /templates)
      // — real printing only ever uses the Is_Default one, so make it
      // obvious this one already took effect rather than leaving the
      // admin to separately discover "Set as Default" for what's already
      // their only template.
      message.success(saved.Is_Default
        ? '✅ Template saved and set as your default — real bills now use this design.'
        : '✅ Template saved.');
      qc.invalidateQueries(['invoice-studio-templates']);
      setIsDirty(false);
    },
    onError: (err) => message.error(err.response?.data?.message || 'Failed to save.'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => invoiceStudioApi.deleteTemplate(id, tenantParam),
    onSuccess: () => { message.success('Template deleted.'); qc.invalidateQueries(['invoice-studio-templates']); },
  });

  const duplicateMutation = useMutation({
    mutationFn: (id) => invoiceStudioApi.duplicateTemplate(id, tenantParam),
    onSuccess: () => { message.success('Template duplicated!'); qc.invalidateQueries(['invoice-studio-templates']); },
  });

  // ── Block manipulation ─────────────────────────────────────────────────────
  const addBlock = (type) => {
    const id = `${type}_${Date.now()}`;
    const newBlock = { id, type, x: 20, y: 20, w: 200, h: 60, content: defaultContent(type) };
    setBlocks(prev => [...prev, newBlock]);
    setSelected(id);
    setIsDirty(true);
  };

  const moveBlock = useCallback((id, x, y) => {
    setBlocks(prev => prev.map(b => b.id === id ? { ...b, x: Math.max(0, x), y: Math.max(0, y) } : b));
    setIsDirty(true);
  }, []);

  const deleteBlock = (id) => {
    setBlocks(prev => prev.filter(b => b.id !== id));
    setSelected(null);
    setIsDirty(true);
  };

  const updateBlockContent = (id, updates) => {
    setBlocks(prev => prev.map(b => b.id === id ? { ...b, content: { ...b.content, ...updates } } : b));
    setIsDirty(true);
  };

  const updateBlockSize = (id, field, value) => {
    setBlocks(prev => prev.map(b => b.id === id ? { ...b, [field]: value } : b));
    setIsDirty(true);
  };

  // ── Create flow ────────────────────────────────────────────────────────────
  const startFromBlank = () => {
    setBlocks(buildDefaultLayout(paperSize));
    setTemplateName(`${TYPE_LABEL[selectedType] || 'Invoice'} Template`);
    setScreen('design');
    setIsDirty(true);
  };

  const startFromLibrary = (libraryId) => {
    setBlocks(buildDefaultLayout(paperSize));
    setTemplateName(`${TYPE_LABEL[selectedType]} — ${TEMPLATE_LIBRARY.find(t=>t.id===libraryId)?.name || 'Template'}`);
    setScreen('design');
    setIsDirty(true);
  };

  const openExistingTemplate = (tmpl) => {
    try {
      const layout = typeof tmpl.Layout_JSON === 'string' ? JSON.parse(tmpl.Layout_JSON) : (tmpl.Layout_JSON || []);
      setBlocks(layout);
      setSelectedType(tmpl.Document_Type);
      setTemplateName(tmpl.Template_Name);
      setEditingId(tmpl.Template_ID);
      setPaperSize(tmpl.Paper_Size || 'A4');
      setTemplateVersion(tmpl.Template_Version || 1);
      setIsDirty(false);
      setScreen('design');
    } catch { message.error('Failed to load template.'); }
  };

  // ── Save ──────────────────────────────────────────────────────────────────
  const handleSave = () => {
    if (!templateName.trim()) { message.error('Please enter a template name.'); return; }
    saveMutation.mutate({
      Template_Name: templateName,
      Document_Type: selectedType,
      Paper_Size: paperSize,
      Layout_JSON: JSON.stringify(blocks),
      Template_Version: templateVersion,
      Is_Active: true,
      Is_Default: false,
    });
  };

  // ── AI Analysis ───────────────────────────────────────────────────────────
  const runAiAnalysis = async () => {
    if (!aiFile) { message.error('Please upload an invoice image or PDF.'); return; }
    setScreen('ai-processing');
    setAiProgress(0);
    setAiStatus('Uploading file...');
    try {
      const formData = new FormData();
      formData.append('file', aiFile);
      formData.append('invoiceType', selectedType || 'SALES_BILL');

      setAiProgress(20); setAiStatus('Analyzing layout with Google Vision...');
      const res = await invoiceStudioApi.aiAnalyze(formData, {
        headers: { 'Content-Type': undefined },
        onUploadProgress: (e) => setAiProgress(10 + Math.round((e.loaded / e.total) * 20)),
      });

      setAiProgress(60); setAiStatus('Detecting components and ERP fields...');
      await new Promise(r => setTimeout(r, 800));

      setAiProgress(80); setAiStatus('Generating template layout...');
      await new Promise(r => setTimeout(r, 600));

      const result = res.data.data;
      setAiResult(result);
      setAiProgress(100); setAiStatus('Template ready!');

      // Apply AI-generated layout
      if (result?.blocks?.length > 0) {
        setBlocks(result.blocks);
      } else {
        setBlocks(buildDefaultLayout(paperSize));
      }
      setTemplateName(`AI — ${TYPE_LABEL[selectedType] || 'Invoice'}`);
      setTimeout(() => setScreen('design'), 1200);
    } catch (err) {
      console.error('AI analysis error:', err);
      setAiStatus('Analysis failed. Loading default template...');
      setAiProgress(100);
      setTimeout(() => {
        setBlocks(buildDefaultLayout(paperSize));
        setTemplateName(`${TYPE_LABEL[selectedType] || 'Invoice'} Template`);
        setScreen('design');
        message.warning('AI analysis unavailable — loaded default template. You can customize it.');
      }, 1500);
    }
  };

  // ── Print / Export ────────────────────────────────────────────────────────
  const [showPreview, setShowPreview] = useState(false);
  const [logoUrl, setLogoUrl] = useState('');

  const handleLogoUpload = async (file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      setLogoUrl(e.target.result);
      // Update logo block if exists, otherwise add one
      setBlocks(prev => {
        const hasLogo = prev.find(b => b.type === 'logo');
        if (hasLogo) {
          return prev.map(b => b.type === 'logo' ? { ...b, content: { ...b.content, url: e.target.result } } : b);
        }
        return [{ id: 'logo_auto', type: 'logo', x: 20, y: 20, w: 120, h: 60, content: { url: e.target.result } }, ...prev];
      });
      setIsDirty(true);
      message.success('Logo uploaded!');
    };
    reader.readAsDataURL(file);
    return false; // prevent default upload
  };

  const setAsDefault = useMutation({
    mutationFn: (id) => invoiceStudioApi.updateTemplate(id, { Is_Default: true }, tenantParam),
    onSuccess: () => { message.success('✅ Set as default template!'); qc.invalidateQueries(['invoice-studio-templates']); },
  });

  // ── Live preview renderer ─────────────────────────────────────────────────
  const LivePreview = ({ blocks: previewBlocks, paper, logoUrl: pLogoUrl }) => {
    const previewScale = Math.min(1, 340 / paper.w);
    const sampleShop = { name: user?.companyName || 'Sample Jewellery', address: 'MG Road, Bangalore — 560001', gst: '29AABCX1234D1Z1', phone: '9876543210' };
    const sampleCustomer = { name: 'Priya Sharma', mobile: '9876543210', address: '123 Park Street' };

    const renderBlock = (b) => {
      const style = { position: 'absolute', left: b.x * previewScale, top: b.y * previewScale, width: b.w * previewScale, height: b.h * previewScale, overflow: 'hidden', fontSize: 7 };
      switch (b.type) {
        case 'logo':
          return <div key={b.id} style={style}>{(b.content?.url || pLogoUrl) ? <img src={b.content?.url || pLogoUrl} alt="logo" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} /> : <div style={{ width: '100%', height: '100%', background: '#f5f5f5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 7, color: '#aaa' }}>LOGO</div>}</div>;
        case 'shop_header':
          return <div key={b.id} style={{ ...style, textAlign: 'center' }}><div style={{ fontWeight: 700, fontSize: 8 }}>{sampleShop.name}</div><div style={{ fontSize: 6, color: '#666' }}>{sampleShop.address}</div><div style={{ fontSize: 6, color: '#666' }}>GST: {sampleShop.gst} | Ph: {sampleShop.phone}</div></div>;
        case 'invoice_meta':
          return <div key={b.id} style={{ ...style, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}><div><div style={{ fontWeight: 700 }}>Invoice No: INV-SAMPLE-001</div><div>Date: {new Date().toLocaleDateString('en-IN')}</div></div><div style={{ textAlign: 'right' }}><div>Type: {TYPE_LABEL[selectedType] || 'Sales Bill'}</div></div></div>;
        case 'customer':
          return <div key={b.id} style={style}><div style={{ fontWeight: 700, fontSize: 7 }}>Bill To:</div><div>{sampleCustomer.name}</div><div>{sampleCustomer.mobile}</div><div>{sampleCustomer.address}</div></div>;
        case 'items_table':
          return <div key={b.id} style={{ ...style, borderTop: '1px solid #B8860B' }}><table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 6 }}><thead style={{ background: '#B8860B', color: '#fff' }}><tr>{['#','Item','Purity','Gross Wt','Net Wt','Rate','Making','Amount'].map(h=><th key={h} style={{ padding: '1px 2px', textAlign: 'left' }}>{h}</th>)}</tr></thead><tbody><tr><td>1</td><td>Gold Necklace 22K</td><td>22K</td><td>25.5g</td><td>24.8g</td><td>₹6,250</td><td>₹6,200</td><td>₹1,70,826</td></tr></tbody></table></div>;
        case 'totals':
          return <div key={b.id} style={{ ...style, borderTop: '1px solid #B8860B', fontSize: 7 }}>{[['Subtotal','₹1,65,850'],['GST (3%)','₹4,976'],['NET PAYABLE','₹1,70,827']].map(([l,v])=><div key={l} style={{ display:'flex', justifyContent:'space-between', fontWeight: l==='NET PAYABLE'?700:400, marginBottom:1 }}><span>{l}</span><span style={{ color: l==='NET PAYABLE'?'#B8860B':'inherit' }}>{v}</span></div>)}</div>;
        case 'gst_block':
          return <div key={b.id} style={style}><div style={{ fontWeight: 700, marginBottom: 1 }}>GST Breakdown</div><div style={{ display: 'flex', justifyContent: 'space-between' }}><span>CGST 1.5%</span><span>₹2,488</span></div><div style={{ display: 'flex', justifyContent: 'space-between' }}><span>SGST 1.5%</span><span>₹2,488</span></div></div>;
        case 'line':
          return <div key={b.id} style={{ position: 'absolute', left: b.x * previewScale, top: b.y * previewScale, width: b.w * previewScale, height: Math.max(1, (b.content?.thickness || 1) * previewScale), background: b.content?.color || '#B8860B' }} />;
        case 'signature':
          return <div key={b.id} style={{ ...style, borderTop: '1px solid #333', paddingTop: 2 }}><div style={{ fontSize: 6, textAlign: 'center' }}>Authorised Signatory</div></div>;
        case 'terms':
          return <div key={b.id} style={{ ...style, fontSize: 6, color: '#888' }}><div style={{ fontWeight: 600 }}>Terms & Conditions:</div><div>1. Goods once sold cannot be returned.</div><div>2. E.&amp; O.E.</div></div>;
        case 'bank_details':
          return <div key={b.id} style={{ ...style, fontSize: 6 }}><div style={{ fontWeight: 700 }}>Bank Details:</div><div>HDFC Bank | A/C: 123456789 | IFSC: HDFC0001</div></div>;
        case 'qr_code':
          return <div key={b.id} style={{ ...style, border: '1px solid #d9d9d9', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f9f9f9', fontSize: 6 }}>QR Code</div>;
        case 'text':
          return <div key={b.id} style={{ ...style, fontSize: (b.content?.fontSize || 12) * previewScale, fontWeight: b.content?.bold ? 700 : 400, textAlign: b.content?.align || 'left', color: b.content?.color || '#333' }}>{b.content?.text || 'Text'}</div>;
        case 'rectangle':
          return <div key={b.id} style={{ ...style, border: `${(b.content?.borderWidth||1)*previewScale}px solid ${b.content?.borderColor||'#B8860B'}`, background: b.content?.fillColor || 'transparent', borderRadius: b.content?.borderRadius || 0 }} />;
        case 'excel_grid': {
          const gc = b.content || {};
          return (
            <div key={b.id} style={{ ...style, overflow: 'auto' }}>
              <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: (gc.fontSize || 10) * previewScale }}>
                <tbody>
                  {(gc.rows || []).map((row, ri) => (
                    <tr key={ri}>
                      {row.cells.map((cell, ci) => cell.merged ? null : (
                        <td key={ci} colSpan={cell.colspan} rowSpan={cell.rowspan}
                          style={{
                            border: gc.showBorders !== false ? '1px solid #ccc' : 'none', padding: 2 * previewScale,
                            background: cell.bg || 'transparent', fontWeight: cell.bold ? 700 : 400,
                            textAlign: cell.align || 'left', color: cell.color || '#333',
                          }}>
                          {cell.text}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }
        default:
          return <div key={b.id} style={{ ...style, background: '#f9f9f9', border: '1px dashed #d9d9d9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 6, color: '#aaa' }}>{b.type}</div>;
      }
    };

    return (
      <div style={{ width: paper.w * previewScale, height: paper.h * previewScale, background: '#fff', position: 'relative', boxShadow: '0 2px 12px rgba(0,0,0,0.15)', margin: '0 auto', overflow: 'hidden' }}>
        {previewBlocks.map(b => renderBlock(b))}
      </div>
    );
  };

  // ══════════════════════════════════════════════════════════════════════════
  // SCREEN: HOME — list existing templates + create new
  // ══════════════════════════════════════════════════════════════════════════
  if (screen === 'home') {
    const byType = {};
    (templates || []).forEach(t => {
      if (!byType[t.Document_Type]) byType[t.Document_Type] = [];
      byType[t.Document_Type].push(t);
    });

    return (
      <div className="page-wrapper">
        <div className="page-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div className="icon-badge" style={{ width: 42, height: 42, fontSize: 19, color: 'var(--gold)', background: 'var(--gold-pale)' }}>💎</div>
            <div>
              <div className="h2">Invoice Studio</div>
              <Text className="caption">Design, manage and deploy invoice templates — no coding required</Text>
            </div>
          </div>
          <Space>
            <Button icon={<QuestionCircleOutlined />} style={{ borderRadius: 'var(--radius-sm)' }}
              onClick={() => navigate('/help')}>
              How does this work?
            </Button>
            <Button type="primary" icon={<PlusOutlined />}
              style={{ background: 'var(--gold)', borderColor: 'var(--gold)', fontWeight: 700, borderRadius: 'var(--radius-sm)' }}
              onClick={() => setScreen('type-select')}
              disabled={isSuperAdmin && !managedTenantId}>
              Create New Template
            </Button>
          </Space>
        </div>

        {/* Super Admin only: design/import a specific tenant's invoices through the master login */}
        {isSuperAdmin && (
          <div className="erp-card-elevated" style={{ background: '#fff', borderRadius: 'var(--radius-md)', padding: '12px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <Text strong style={{ fontSize: 'var(--fs-body)', color: 'var(--ink-900)' }}>Designing for:</Text>
            <Select
              showSearch allowClear
              placeholder="Select a customer (tenant)…"
              style={{ width: 340 }}
              loading={tenantsLoading}
              value={managedTenantId}
              onChange={(v) => setManagedTenantId(v || null)}
              optionFilterProp="label"
              filterOption={(input, option) => (option?.label ?? '').toLowerCase().includes(input.toLowerCase())}
              options={(tenantsList || [])
                .filter((t) => t.Tenant_ID !== 'SA_MASTER')
                .map((t) => ({ value: t.Tenant_ID, label: `${t.Company_Name} (${t.Tenant_ID})` }))}
            />
            {managedTenantId && <Text className="caption">Every template below belongs only to this customer.</Text>}
          </div>
        )}

        {/* Platform Billing — isolated from the "Designing for" picker above
            on purpose: this is JewelNexus's own template for billing a
            tenant, not something designed on behalf of one, so it doesn't
            wait on a managed-tenant pick the way everything below does. */}
        {isSuperAdmin && (
          <div style={{
            borderRadius: 'var(--radius-md)', marginBottom: 16, padding: 16,
            background: 'linear-gradient(135deg, var(--dark) 0%, var(--dark-2) 100%)',
            boxShadow: 'var(--shadow-md)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <div className="icon-badge" style={{ width: 30, height: 30, fontSize: 14, color: '#FFD700', background: 'rgba(255,215,0,0.15)' }}>🏢</div>
              <Text strong style={{ fontSize: 'var(--fs-h4)', color: '#fff' }}>Platform Billing — JewelNexus → Tenant</Text>
              <Tag style={{ background: 'rgba(255,215,0,0.15)', color: '#FFD700', border: 'none', fontSize: 10, borderRadius: 4 }}>Super Admin Only</Tag>
            </div>
            <Text style={{ fontSize: 'var(--fs-caption)', color: 'rgba(255,255,255,0.6)', display: 'block', marginBottom: 12 }}>
              The GST invoice YOU send a tenant for their software/subscription — isolated from every tenant-facing template above, never mixed with what a tenant designs for their own customers.
            </Text>
            <Space wrap size={8}>
              {(platformTemplates || []).map(t => (
                <Tag key={t.Template_ID}
                  style={{
                    cursor: 'pointer', padding: '5px 12px', fontSize: 11, borderRadius: 6, border: 'none',
                    background: t.Is_Default ? '#FFD700' : 'rgba(255,255,255,0.1)',
                    color: t.Is_Default ? '#1A1A1A' : '#fff', fontWeight: t.Is_Default ? 700 : 400,
                  }}
                  onClick={() => openExistingTemplate(t)}>
                  {t.Template_Name}{t.Is_Default ? ' ★ Default' : ''}
                </Tag>
              ))}
              <Button size="small" style={{ borderColor: '#FFD700', color: '#FFD700', background: 'transparent', borderRadius: 6 }}
                onClick={() => { setSelectedType('PLATFORM_SAAS_INVOICE'); setScreen('method-select'); }}>
                + {platformTemplates?.length ? 'New Design' : 'Design Platform Invoice'}
              </Button>
            </Space>
          </div>
        )}

        {isSuperAdmin && !managedTenantId ? (
          <Card className="erp-card-elevated" style={{ borderRadius: 'var(--radius-md)' }}>
            <EmptyState icon={<UserOutlined />} title="Pick a customer to get started"
              hint="Select a customer above to design or manage their invoice templates." />
          </Card>
        ) : (
        <>
        {/* Stats bar */}
        <Row gutter={[12, 12]} style={{ marginBottom: 18 }}>
          <KPICard title="Total Templates" value={(templates||[]).length} icon={<FileTextOutlined />} color="var(--gold)" span={{ xs: 8 }} />
          <KPICard title="Invoice Types Used" value={Object.keys(byType).length} icon={<AppstoreOutlined />} color="var(--info)" span={{ xs: 8 }} />
          <KPICard title="Published" value={(templates||[]).filter(t=>t.Is_Active).length} icon={<CheckCircleOutlined />} color="var(--success)" span={{ xs: 8 }} />
        </Row>

        {(templates||[]).length === 0 ? (
          <Card className="erp-card-elevated" style={{ borderRadius: 'var(--radius-md)' }}>
            <EmptyState icon={<FileTextOutlined />} title="No templates yet"
              hint="Create your first invoice template in minutes — pick a document type, then start blank, from a ready-made design, or let AI build one from an existing invoice."
              actionLabel="Create First Template" onAction={() => setScreen('type-select')} />
          </Card>
        ) : (
          Object.entries(byType).map(([docType, tmplList]) => (
            <Card key={docType} className="erp-card-elevated" style={{ borderRadius: 'var(--radius-md)', marginBottom: 16 }}
              title={
                <Space>
                  <Tag color={TYPE_GROUP_COLOR[docType] || 'default'} style={{ borderRadius: 4 }}>{TYPE_LABEL[docType] || docType}</Tag>
                  <Text className="caption">{tmplList.length} template{tmplList.length > 1 ? 's' : ''}</Text>
                </Space>
              }
              extra={<Button size="small" icon={<PlusOutlined />} style={{ borderRadius: 6 }} onClick={() => { setSelectedType(docType); setScreen('method-select'); }}>Add Template</Button>}>
              <Row gutter={[14, 14]}>
                {tmplList.map(tmpl => (
                  <Col xs={24} sm={12} lg={8} key={tmpl.Template_ID}>
                    <Card hoverable bodyStyle={{ padding: 16 }}
                      style={{
                        borderRadius: 'var(--radius-md)',
                        border: tmpl.Is_Default ? '1.5px solid var(--gold)' : '1px solid var(--ink-100)',
                        boxShadow: tmpl.Is_Default ? '0 0 0 3px var(--gold-pale)' : 'none',
                        transition: 'box-shadow .15s, transform .15s',
                      }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                        <Text strong style={{ fontSize: 'var(--fs-body)', color: 'var(--ink-900)' }}>{tmpl.Template_Name}</Text>
                        {tmpl.Is_Default && <Tag color="gold" style={{ fontSize: 9, borderRadius: 4, flexShrink: 0, marginLeft: 6 }}>★ Default</Tag>}
                      </div>
                      <Space size={4} style={{ marginBottom: 12 }}>
                        <Tag style={{ fontSize: 10, borderRadius: 4 }}>{tmpl.Paper_Size || 'A4'}</Tag>
                        <Tag style={{ fontSize: 10, borderRadius: 4 }}>v{tmpl.Template_Version || 1}</Tag>
                        <Tag color={tmpl.Is_Active ? 'green' : 'red'} style={{ fontSize: 10, borderRadius: 4 }}>{tmpl.Is_Active ? 'Active' : 'Draft'}</Tag>
                      </Space>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <Button size="small" icon={<EditOutlined />} style={{ flex: 1, borderRadius: 6 }} onClick={() => openExistingTemplate(tmpl)}>Edit</Button>
                        <Tooltip title="Duplicate"><Button size="small" icon={<CopyOutlined />} style={{ borderRadius: 6 }} onClick={() => duplicateMutation.mutate(tmpl.Template_ID)} /></Tooltip>
                        <Tooltip title="Download JSON"><Button size="small" icon={<DownloadOutlined />} style={{ borderRadius: 6 }} onClick={() => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(tmpl, null, 2)], {type:'application/json'})); a.download = `${tmpl.Template_Name}.json`; a.click(); }} /></Tooltip>
                        <Popconfirm title="Delete this template?" onConfirm={() => deleteMutation.mutate(tmpl.Template_ID)} okText="Delete" okButtonProps={{ danger: true }}>
                          <Button size="small" danger icon={<DeleteOutlined />} style={{ borderRadius: 6 }} />
                        </Popconfirm>
                      </div>
                    </Card>
                  </Col>
                ))}
              </Row>
            </Card>
          ))
        )}
        </>
        )}
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SCREEN: TYPE SELECT
  // ══════════════════════════════════════════════════════════════════════════
  if (screen === 'type-select') {
    return (
      <div className="page-wrapper">
        <div className="page-header">
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => setScreen('home')} style={{ marginRight: 4 }}>Back</Button>
            <div className="h2">Select Invoice Type</div>
          </div>
        </div>
        <Alert message="Select the type of document you want to design. Each type has its own field set and default layout." type="info" showIcon style={{ marginBottom: 18, borderRadius: 'var(--radius-sm)' }} />
        {INVOICE_CATEGORIES.filter(cat => !cat.superAdminOnly || isSuperAdmin).map(cat => (
          <div key={cat.group} style={{ marginBottom: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <span style={{ fontSize: 16 }}>{cat.icon}</span>
              <Text strong style={{ fontSize: 'var(--fs-h4)', color: cat.color }}>{cat.group}</Text>
            </div>
            <Row gutter={[12, 12]}>
              {cat.types.map(t => (
                <Col xs={24} sm={12} md={8} lg={6} key={t.key}>
                  <Card hoverable onClick={() => { setSelectedType(t.key); setScreen('method-select'); }}
                    className="erp-card-elevated"
                    style={{ borderRadius: 'var(--radius-md)', borderTop: `3px solid ${cat.color}`, cursor: 'pointer', height: '100%' }}
                    bodyStyle={{ padding: '12px 16px' }}>
                    <Tag color={cat.color} style={{ marginBottom: 6, fontSize: 9, borderRadius: 4 }}>{cat.group}</Tag>
                    <div style={{ fontSize: 'var(--fs-body)', fontWeight: 600, color: 'var(--ink-900)' }}>{t.label}</div>
                  </Card>
                </Col>
              ))}
            </Row>
          </div>
        ))}
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SCREEN: METHOD SELECT (5 creation methods)
  // ══════════════════════════════════════════════════════════════════════════
  if (screen === 'method-select') {
    const methods = [
      { key: 'blank',    icon: '📄', title: 'Start from Blank',         desc: 'Start with a default layout and customize everything', color: '#888', time: '10–20 min' },
      { key: 'library',  icon: '⭐', title: 'Ready-Made Template',       desc: 'Choose from pre-built jewellery invoice designs',        color: '#B8860B', time: '2–5 min', popular: true },
      { key: 'img',      icon: '🖼️', title: 'Upload Invoice Image',      desc: 'Upload JPG/PNG of your existing invoice',               color: '#1890ff', time: '5–10 min' },
      { key: 'pdf',      icon: '📄', title: 'Upload Invoice PDF',        desc: 'Upload a PDF of your existing invoice format',          color: '#52c41a', time: '5–10 min' },
      { key: 'ai',       icon: '🤖', title: 'AI Generate from Image',    desc: 'Let AI analyze your invoice and auto-build the template', color: '#722ed1', time: '2–5 min', popular: true, badge: 'AI' },
    ];

    return (
      <div className="page-wrapper">
        <div className="page-header">
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => setScreen('type-select')} style={{ marginRight: 4 }}>Back</Button>
            <div className="h2">Create {TYPE_LABEL[selectedType]} Template</div>
          </div>
        </div>

        {/* Paper size selection */}
        <Card size="small" className="erp-card-elevated" style={{ borderRadius: 'var(--radius-md)', marginBottom: 18 }}>
          <Row gutter={12} align="middle">
            <Col xs={24} sm={4}><Text strong style={{ fontSize: 'var(--fs-body)', color: 'var(--ink-900)' }}>Paper Size:</Text></Col>
            <Col xs={24} sm={20}>
              <Radio.Group value={paperSize} onChange={e => setPaperSize(e.target.value)}>
                {Object.entries(PAPER_SIZES).map(([k, v]) => (
                  <Radio.Button key={k} value={k} style={{ fontSize: 11 }}>{v.label}</Radio.Button>
                ))}
              </Radio.Group>
            </Col>
          </Row>
        </Card>

        <Row gutter={[16, 16]}>
          {methods.map(m => (
            <Col xs={24} sm={12} lg={8} key={m.key}>
              <Card hoverable
                onClick={() => {
                  setCreationMethod(m.key);
                  if (m.key === 'blank') startFromBlank();
                  else if (m.key === 'library') setScreen('library');
                  else if (m.key === 'ai' || m.key === 'img' || m.key === 'pdf') setScreen('upload');
                }}
                className="erp-card-elevated"
                style={{ borderRadius: 'var(--radius-lg)', cursor: 'pointer', height: '100%' }}
                bodyStyle={{ padding: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                  <div className="icon-badge" style={{ width: 46, height: 46, fontSize: 22, color: m.color, background: `${m.color}1A` }}>{m.icon}</div>
                  <Space size={4}>
                    {m.popular && <Tag color="gold" style={{ fontSize: 9, borderRadius: 4 }}>Popular</Tag>}
                    {m.badge && <Tag color="purple" style={{ fontSize: 9, borderRadius: 4 }}>{m.badge}</Tag>}
                  </Space>
                </div>
                <Text strong style={{ color: m.color, fontSize: 'var(--fs-h4)' }}>{m.title}</Text>
                <div style={{ fontSize: 'var(--fs-caption)', color: 'var(--ink-500)', marginTop: 4, minHeight: 32 }}>{m.desc}</div>
                <Tag style={{ marginTop: 10, fontSize: 10, borderRadius: 4 }}>⏱ {m.time}</Tag>
              </Card>
            </Col>
          ))}
        </Row>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SCREEN: LIBRARY — ready-made templates
  // ══════════════════════════════════════════════════════════════════════════
  if (screen === 'library') {
    return (
      <div className="page-wrapper">
        <div className="page-header">
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => setScreen('method-select')} style={{ marginRight: 4 }}>Back</Button>
            <div className="h2">Template Library</div>
          </div>
        </div>
        <Alert message="Choose a ready-made template. You can fully customize it after selecting." type="info" showIcon style={{ marginBottom: 18, borderRadius: 'var(--radius-sm)' }} />
        <Row gutter={[16, 16]}>
          {TEMPLATE_LIBRARY.map(lib => (
            <Col xs={24} sm={12} lg={8} key={lib.id}>
              <Card hoverable className="erp-card-elevated" style={{ borderRadius: 'var(--radius-lg)', overflow: 'hidden' }} bodyStyle={{ padding: 0 }}>
                {/* Preview area */}
                <div style={{ height: 160, background: `linear-gradient(135deg, ${lib.preview}22, ${lib.preview}44)`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', borderBottom: '1px solid var(--ink-100)' }}>
                  <div style={{ width: 120, height: 16, background: lib.preview, borderRadius: 2, marginBottom: 8 }} />
                  <div style={{ width: 100, height: 10, background: lib.preview + '88', borderRadius: 2, marginBottom: 4 }} />
                  <div style={{ width: 140, height: 60, border: `1px solid ${lib.preview}`, borderRadius: 2, margin: 4 }} />
                  <div style={{ width: 120, height: 20, background: lib.preview + '44', borderRadius: 2 }} />
                </div>
                <div style={{ padding: '14px 16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <Text strong style={{ fontSize: 'var(--fs-body)', color: 'var(--ink-900)' }}>{lib.name}</Text>
                    {lib.popular && <Tag color="gold" style={{ fontSize: 9, borderRadius: 4 }}>Popular</Tag>}
                  </div>
                  <Text className="caption">{lib.desc}</Text>
                  <Button type="primary" block size="small" style={{ marginTop: 12, background: lib.preview, borderColor: lib.preview, borderRadius: 6, fontWeight: 600 }}
                    onClick={() => startFromLibrary(lib.id)}>
                    Use This Template →
                  </Button>
                </div>
              </Card>
            </Col>
          ))}
        </Row>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SCREEN: UPLOAD — image/PDF/AI
  // ══════════════════════════════════════════════════════════════════════════
  if (screen === 'upload') {
    const isAI = creationMethod === 'ai';
    return (
      <div className="page-wrapper">
        <div className="page-header">
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => setScreen('method-select')} style={{ marginRight: 4 }}>Back</Button>
            <div className="h2">{isAI ? '🤖 AI Invoice Generator' : '📄 Upload Invoice'}</div>
          </div>
        </div>

        {isAI && (
          <Alert
            message={<span><RobotOutlined /> AI-Powered Template Generation</span>}
            description="Upload a JPG, PNG or PDF of your existing invoice. Google Vision API will analyze the layout, detect components (header, table, totals, footer), map ERP fields automatically, and generate an editable template in 5–10 minutes."
            type="info" showIcon style={{ marginBottom: 18, borderRadius: 'var(--radius-sm)' }} />
        )}

        <Card className="erp-card-elevated" style={{ borderRadius: 'var(--radius-lg)', maxWidth: 600, margin: '0 auto' }}>
          <Dragger
            accept={creationMethod === 'pdf' ? '.pdf' : '.jpg,.jpeg,.png,.pdf'}
            beforeUpload={(file) => { setAiFile(file); return false; }}
            maxCount={1}
            style={{ borderRadius: 'var(--radius-md)', padding: '20px 0', background: 'var(--gold-pale)', border: '1.5px dashed var(--gold)' }}>
            <div style={{ padding: 20 }}>
              <CloudUploadOutlined style={{ fontSize: 48, color: 'var(--gold)' }} />
              <div className="h3" style={{ marginTop: 12 }}>
                {creationMethod === 'pdf'
                  ? 'Drop your invoice PDF here'
                  : 'Drop your invoice image or PDF here'}
              </div>
              <Text className="caption">
                {creationMethod === 'pdf'
                  ? 'Supported: PDF files'
                  : 'Supported: JPG, PNG, PDF · Max 10MB'}
              </Text>
              <br /><br />
              <Button icon={<UploadOutlined />} style={{ borderColor: 'var(--gold)', color: 'var(--gold)', borderRadius: 6 }}>
                Browse File
              </Button>
            </div>
          </Dragger>

          {aiFile && (
            <Alert style={{ marginTop: 14, borderRadius: 'var(--radius-sm)' }}
              message={<span>✅ File selected: <Text strong>{aiFile.name}</Text> ({(aiFile.size/1024).toFixed(1)} KB)</span>}
              type="success" showIcon />
          )}

          {isAI && (
            <div style={{ marginTop: 18 }}>
              <Text strong style={{ fontSize: 'var(--fs-body)', color: 'var(--ink-900)' }}>What AI will detect:</Text>
              <Row gutter={[8, 8]} style={{ marginTop: 8 }}>
                {['Shop Header & Logo', 'Customer Section', 'Items Table', 'Totals Block', 'GST Breakdown', 'Footer & Terms', 'Signature Line', 'ERP Field Mapping'].map(item => (
                  <Col xs={12} key={item}>
                    <CheckCircleOutlined style={{ color: 'var(--success)', marginRight: 4 }} />
                    <Text style={{ fontSize: 'var(--fs-caption)', color: 'var(--ink-700)' }}>{item}</Text>
                  </Col>
                ))}
              </Row>
            </div>
          )}

          <div style={{ marginTop: 22, display: 'flex', gap: 10 }}>
            {isAI ? (
              <Button type="primary" block size="large"
                icon={<RobotOutlined />}
                disabled={!aiFile}
                onClick={runAiAnalysis}
                style={{ background: '#722ed1', borderColor: '#722ed1', fontWeight: 700, borderRadius: 8 }}>
                🤖 Start AI Analysis
              </Button>
            ) : (
              <Button type="primary" block size="large"
                icon={<ThunderboltOutlined />}
                onClick={() => {
                  setBlocks(buildDefaultLayout(paperSize));
                  setTemplateName(`${TYPE_LABEL[selectedType]} Template`);
                  setScreen('design');
                }}
                style={{ background: 'var(--gold)', borderColor: 'var(--gold)', fontWeight: 700, borderRadius: 8 }}>
                Continue to Designer →
              </Button>
            )}
          </div>
        </Card>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SCREEN: AI PROCESSING
  // ══════════════════════════════════════════════════════════════════════════
  if (screen === 'ai-processing') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 440 }}>
        <Card className="erp-card-elevated" style={{ borderRadius: 'var(--radius-lg)', width: 480, textAlign: 'center', padding: '36px 28px' }}>
          <div className="icon-badge" style={{ width: 64, height: 64, fontSize: 30, color: '#722ed1', background: '#722ed11A', margin: '0 auto' }}>
            <RobotOutlined />
          </div>
          <div className="h3" style={{ marginTop: 18, color: '#722ed1' }}>AI Analyzing Your Invoice</div>
          <Text className="caption" style={{ display: 'block', marginBottom: 26, marginTop: 4 }}>
            Using Google Vision API to detect layout, components and map ERP fields
          </Text>
          <Progress percent={aiProgress} strokeColor="#722ed1" style={{ marginBottom: 16 }} />
          <Text strong style={{ fontSize: 'var(--fs-body)', color: '#722ed1' }}>{aiStatus}</Text>
          <div style={{ marginTop: 26, textAlign: 'left' }}>
            {['Uploading invoice file', 'Running Vision API layout detection', 'Identifying header, table, footer sections', 'Mapping ERP field variables', 'Generating editable template'].map((step, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', padding: '5px 0' }}>
                {aiProgress >= (i+1)*20
                  ? <CheckCircleOutlined style={{ color: 'var(--success)', marginRight: 8 }} />
                  : aiProgress >= i*20
                    ? <SyncOutlined spin style={{ color: '#722ed1', marginRight: 8 }} />
                    : <div style={{ width: 14, height: 14, borderRadius: '50%', border: '1px solid var(--ink-300)', marginRight: 8, flexShrink: 0 }} />
                }
                <Text style={{ fontSize: 'var(--fs-caption)', color: aiProgress >= (i+1)*20 ? 'var(--ink-900)' : 'var(--ink-500)' }}>{step}</Text>
              </div>
            ))}
          </div>
        </Card>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SCREEN: DESIGN CANVAS — split designer + live preview
  // ══════════════════════════════════════════════════════════════════════════
  return (
    <div style={{ height: 'calc(100vh - 128px)', display: 'flex', flexDirection: 'column' }}>

      {/* ── Top toolbar ─────────────────────────────────────────────────── */}
      <div style={{ background: 'linear-gradient(135deg, var(--dark) 0%, var(--dark-2) 100%)', padding: '8px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderRadius: 'var(--radius-md)', marginBottom: 8, flexShrink: 0, boxShadow: 'var(--shadow-sm)' }}>
        <Space size={6}>
          <Button type="text" icon={<ArrowLeftOutlined />} style={{ color: '#aaa' }} onClick={() => { if (isDirty) { Modal.confirm({ title: 'Unsaved changes', content: 'Leave without saving?', onOk: () => setScreen('home') }); } else setScreen('home'); }} />
          <Input value={templateName} onChange={e => { setTemplateName(e.target.value); setIsDirty(true); }}
            style={{ width: 200, background: 'rgba(255,255,255,0.08)', border: 'none', color: '#fff', fontWeight: 600, borderRadius: 6 }} size="small" />
          <Tag color={TYPE_GROUP_COLOR[selectedType] || 'default'} style={{ fontSize: 10, borderRadius: 4 }}>{TYPE_LABEL[selectedType] || 'Invoice'}</Tag>
          <Select value={paperSize} onChange={v => { setPaperSize(v); setIsDirty(true); }} size="small" style={{ width: 140 }}>
            {Object.entries(PAPER_SIZES).map(([k, v]) => <Option key={k} value={k}>{v.label}</Option>)}
          </Select>
          {isDirty && <Tag color="orange" style={{ fontSize: 10, borderRadius: 4 }}>● Unsaved</Tag>}
        </Space>
        <Space size={6}>
          {/* Logo Upload */}
          <Upload beforeUpload={handleLogoUpload} accept=".png,.jpg,.jpeg,.svg" showUploadList={false}>
            <Button size="small" icon={<UploadOutlined />} style={{ borderColor: '#fa8c16', color: '#fa8c16', borderRadius: 6 }}>
              {logoUrl ? 'Change Logo' : 'Upload Logo'}
            </Button>
          </Upload>
          {logoUrl && <Button size="small" danger style={{ borderRadius: 6 }} onClick={() => { setLogoUrl(''); setBlocks(prev => prev.map(b => b.type==='logo' ? {...b, content:{...b.content, url:''}} : b)); }}>Remove Logo</Button>}

          <Button size="small" icon={<EyeOutlined />}
            style={{ borderColor: showPreview ? 'var(--success)' : '#555', color: showPreview ? 'var(--success)' : '#aaa', borderRadius: 6 }}
            onClick={() => setShowPreview(p => !p)}>
            {showPreview ? 'Hide Preview' : 'Show Preview'}
          </Button>
          <Button size="small" icon={<HistoryOutlined />} style={{ color: '#aaa', borderColor: '#555', borderRadius: 6 }} onClick={() => setShowHistory(true)}>History</Button>
          {editingId && (
            (templates || []).find(t => t.Template_ID === editingId)?.Is_Default ? (
              // Already the default — no button to click here at all, since
              // clicking Set Default again used to silently wipe the saved
              // design (a real bug: it sent { Is_Default: true } alone, no
              // Layout_JSON, which the server used to read as "save an
              // empty layout"). Fixed server-side too, but removing the
              // temptation to re-click is the safer fix.
              <Tag ref={setDefaultRef} color="gold" style={{ margin: 0, borderRadius: 4 }}>★ This is the default</Tag>
            ) : (
              <Tooltip title="Set this as the default template for this invoice type — real bills print using this one instead">
                <Button ref={setDefaultRef} size="small" icon={<StarOutlined />} style={{ borderColor: '#FFD700', color: '#FFD700', borderRadius: 6 }}
                  onClick={() => setAsDefault.mutate(editingId)}>Set Default</Button>
              </Tooltip>
            )
          )}
          <Button size="small" icon={<PrinterOutlined />} style={{ borderColor: 'var(--success)', color: 'var(--success)', borderRadius: 6 }}
            onClick={() => {
              const win = window.open('', '_blank', 'width=900,height=700');
              const paper_ = PAPER_SIZES[paperSize];
              const sc = Math.min(1, 800 / paper_.w);
              const html = `<!DOCTYPE html><html><head><title>${templateName}</title><style>body{margin:0;background:#e8e8e8;display:flex;justify-content:center;padding:20px;} .page{width:${paper_.w}px;height:${paper_.h}px;background:#fff;position:relative;box-shadow:0 4px 20px rgba(0,0,0,.3);}</style></head><body><div class="page">${blocks.map(b=>`<div style="position:absolute;left:${b.x}px;top:${b.y}px;width:${b.w}px;height:${b.h}px;border:1px dashed #eee;font-size:11px;display:flex;align-items:center;justify-content:center;background:#fafafa">${b.type}</div>`).join('')}</div></body></html>`;
              win.document.write(html); win.document.close();
              setTimeout(() => win.print(), 400);
            }}>Print</Button>
          <Button ref={saveRef} type="primary" size="small" icon={<SaveOutlined />}
            loading={saveMutation.isPending}
            style={{ background: 'var(--gold)', borderColor: 'var(--gold)', fontWeight: 700, borderRadius: 6 }}
            onClick={handleSave}>
            Save
          </Button>
        </Space>
      </div>

      {/* ── Main workspace ──────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0, gap: 6 }}>

        {/* LEFT: Component palette */}
        <div ref={paletteRef} className="erp-card-elevated" style={{ width: 190, background: '#fff', borderRadius: 'var(--radius-md)', overflow: 'auto', padding: 10, flexShrink: 0 }}>
          <Text style={{ fontSize: 10, color: 'var(--ink-500)', fontWeight: 700, letterSpacing: '0.3px', display: 'block', marginBottom: 6 }}>COMPONENTS</Text>
          {COMP_GROUPS.map(group => (
            <div key={group} style={{ marginBottom: 10 }}>
              <Text style={{ fontSize: 9, color: 'var(--ink-500)', fontWeight: 700 }}>{group.toUpperCase()}</Text>
              {COMPONENTS.filter(c => c.group === group).map(comp => (
                <div key={comp.type} onClick={() => addBlock(comp.type)}
                  style={{ padding: '5px 8px', marginTop: 3, background: 'var(--ink-100)', borderRadius: 6, cursor: 'pointer', fontSize: 11, border: '1px solid transparent', userSelect: 'none', transition: 'background .12s, border-color .12s' }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--gold-pale)'; e.currentTarget.style.borderColor = 'var(--gold)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'var(--ink-100)'; e.currentTarget.style.borderColor = 'transparent'; }}>
                  {comp.label}
                </div>
              ))}
            </div>
          ))}
          <Divider style={{ margin: '8px 0' }} />
          <Button size="small" block icon={<AppstoreOutlined />} onClick={() => setShowVars(true)}
            style={{ borderColor: 'var(--gold)', color: 'var(--gold)', fontSize: 11, borderRadius: 6 }}>
            {'{{ERP Variables}}'}
          </Button>
          {logoUrl && (
            <div style={{ marginTop: 10, textAlign: 'center' }}>
              <img src={logoUrl} alt="logo" style={{ maxWidth: '100%', maxHeight: 50, objectFit: 'contain', border: '1px solid var(--ink-100)', borderRadius: 6 }} />
              <div className="caption" style={{ marginTop: 3 }}>Current Logo</div>
            </div>
          )}
        </div>

        {/* CENTER: Design canvas */}
        <div ref={canvasRef} style={{ flex: 1, overflow: 'auto', background: '#e0e0e0', borderRadius: 'var(--radius-md)', padding: 14 }}>
          <div
            style={{ width: paper.w * scale, height: paper.h * scale, background: '#fff', position: 'relative', margin: '0 auto', boxShadow: 'var(--shadow-lg)', borderRadius: 2, transform: `scale(${scale})`, transformOrigin: 'top center' }}
            onClick={() => setSelected(null)}>
            {blocks.map(b => (
              <CanvasBlock key={b.id} block={b} selected={selected === b.id}
                onSelect={setSelected} onMove={moveBlock} paperW={paper.w} />
            ))}
            {blocks.length === 0 && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#d9d9d9', pointerEvents: 'none' }}>
                <AppstoreOutlined style={{ fontSize: 40 }} />
                <Text style={{ color: '#d9d9d9', marginTop: 8, fontSize: 12 }}>Click components from the left panel to add them</Text>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT: Live Preview (only when showPreview = true) */}
        {showPreview && (
          <div className="erp-card-elevated" style={{ width: 380, background: '#fff', borderRadius: 'var(--radius-md)', overflow: 'auto', padding: 12, flexShrink: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <Text strong style={{ fontSize: 11, color: 'var(--success)' }}>🟢 LIVE PREVIEW</Text>
              <Tag color="green" style={{ fontSize: 9, borderRadius: 4 }}>Updates instantly</Tag>
            </div>
            <div style={{ background: 'var(--ink-100)', borderRadius: 'var(--radius-sm)', padding: 8, overflow: 'auto' }}>
              <LivePreview blocks={blocks} paper={paper} logoUrl={logoUrl} />
            </div>
            <Alert message="This preview uses sample data. Actual invoices will show real values." type="info" showIcon style={{ marginTop: 8, fontSize: 10, borderRadius: 6 }} />
          </div>
        )}

        {/* RIGHT: Properties panel (always shown, but narrower when preview is open) */}
        <div ref={propertiesRef} className="erp-card-elevated" style={{ width: showPreview ? 200 : 220, background: '#fff', borderRadius: 'var(--radius-md)', overflow: 'auto', padding: 12, flexShrink: 0 }}>
          <Text style={{ fontSize: 10, color: 'var(--ink-500)', fontWeight: 700, letterSpacing: '0.3px', display: 'block', marginBottom: 8 }}>PROPERTIES</Text>
          {selectedBlock ? (
            <div>
              <div style={{ background: 'var(--gold-pale)', borderRadius: 6, padding: '6px 10px', marginBottom: 10 }}>
                <Text strong style={{ fontSize: 11, color: 'var(--gold)' }}>
                  {COMPONENTS.find(c => c.type === selectedBlock.type)?.label || selectedBlock.type}
                </Text>
              </div>
              <Text style={{ fontSize: 9, color: 'var(--ink-500)', fontWeight: 700 }}>POSITION & SIZE</Text>
              <Row gutter={4} style={{ marginTop: 4, marginBottom: 8 }}>
                {[['x','X',selectedBlock.x],['y','Y',selectedBlock.y],['w','W',selectedBlock.w],['h','H',selectedBlock.h]].map(([f,l,v]) => (
                  <Col xs={12} key={f}>
                    <div style={{ fontSize: 9, color: '#888', marginBottom: 1 }}>{l}</div>
                    <InputNumber size="small" style={{ width: '100%' }} value={v} onChange={val => updateBlockSize(selectedBlock.id, f, val || 0)} />
                  </Col>
                ))}
              </Row>
              {selectedBlock.type === 'text' && (
                <>
                  <Text style={{ fontSize: 9, color: 'var(--ink-500)', fontWeight: 700 }}>TEXT</Text>
                  <Input.TextArea rows={3} style={{ marginTop: 3, fontSize: 11 }} value={selectedBlock.content?.text}
                    onChange={e => updateBlockContent(selectedBlock.id, { text: e.target.value })} />
                  <Row gutter={4} style={{ marginTop: 4 }}>
                    <Col xs={12}><InputNumber size="small" style={{ width: '100%' }} placeholder="Size"
                      value={selectedBlock.content?.fontSize || 12} onChange={v => updateBlockContent(selectedBlock.id, { fontSize: v })} /></Col>
                    <Col xs={12}><Select size="small" style={{ width: '100%' }} value={selectedBlock.content?.align || 'left'} onChange={v => updateBlockContent(selectedBlock.id, { align: v })}>
                      <Option value="left">Left</Option><Option value="center">Center</Option><Option value="right">Right</Option>
                    </Select></Col>
                  </Row>
                  <div style={{ marginTop: 4, display: 'flex', gap: 4, alignItems: 'center' }}>
                    <Switch size="small" checked={!!selectedBlock.content?.bold} onChange={v => updateBlockContent(selectedBlock.id, { bold: v })} />
                    <Text style={{ fontSize: 11 }}>Bold</Text>
                    <input type="color" style={{ width: 24, height: 24, border: 'none', cursor: 'pointer', marginLeft: 4 }}
                      value={selectedBlock.content?.color || '#333333'} onChange={e => updateBlockContent(selectedBlock.id, { color: e.target.value })} />
                  </div>
                </>
              )}
              {selectedBlock.type === 'line' && (
                <>
                  <Text style={{ fontSize: 9, color: 'var(--ink-500)', fontWeight: 700 }}>LINE</Text>
                  <div style={{ marginTop: 4, display: 'flex', gap: 6, alignItems: 'center' }}>
                    <input type="color" value={selectedBlock.content?.color || '#B8860B'}
                      onChange={e => updateBlockContent(selectedBlock.id, { color: e.target.value })}
                      style={{ width: 28, height: 26, cursor: 'pointer', border: 'none', borderRadius: 3 }} />
                    <InputNumber size="small" min={1} max={10} value={selectedBlock.content?.thickness || 1}
                      onChange={v => updateBlockContent(selectedBlock.id, { thickness: v })} style={{ width: 70 }} addonAfter="px" />
                  </div>
                </>
              )}
              {selectedBlock.type === 'logo' && (
                <>
                  <Text style={{ fontSize: 9, color: 'var(--ink-500)', fontWeight: 700 }}>LOGO</Text>
                  <Upload beforeUpload={handleLogoUpload} accept=".png,.jpg,.jpeg,.svg" showUploadList={false}>
                    <Button size="small" block icon={<UploadOutlined />} style={{ marginTop: 4 }}>
                      {(selectedBlock.content?.url || logoUrl) ? 'Change Logo' : 'Upload Logo'}
                    </Button>
                  </Upload>
                  {(selectedBlock.content?.url || logoUrl) && (
                    <img src={selectedBlock.content?.url || logoUrl} alt="logo" style={{ width: '100%', maxHeight: 50, objectFit: 'contain', marginTop: 4, border: '1px solid #f0f0f0' }} />
                  )}
                </>
              )}
              {selectedBlock.type === 'excel_grid' && (
                <>
                  <Text style={{ fontSize: 9, color: 'var(--ink-500)', fontWeight: 700 }}>EXCEL-STYLE GRID</Text>
                  <div style={{ fontSize: 11, color: '#666', margin: '4px 0 6px' }}>
                    {selectedBlock.content?.rows?.length || 0} rows × {selectedBlock.content?.numCols || 0} columns
                  </div>
                  <Button size="small" block icon={<AppstoreOutlined />} style={{ borderColor: '#B8860B', color: '#B8860B' }}
                    onClick={() => setGridEditorOpen(true)}>
                    Edit Grid
                  </Button>
                </>
              )}
              {(selectedBlock.type === 'shop_header' || selectedBlock.type === 'terms') && (
                <>
                  <Text style={{ fontSize: 9, color: 'var(--ink-500)', fontWeight: 700 }}>CONTENT</Text>
                  <Input.TextArea rows={3} style={{ marginTop: 3, fontSize: 11 }} value={selectedBlock.content?.text}
                    onChange={e => updateBlockContent(selectedBlock.id, { text: e.target.value })} />
                </>
              )}
              <Divider style={{ margin: '8px 0' }} />
              <Button danger size="small" block icon={<DeleteOutlined />} style={{ borderRadius: 6 }} onClick={() => deleteBlock(selectedBlock.id)}>Remove</Button>
            </div>
          ) : (
            <>
              <div style={{ textAlign: 'center', padding: '16px 0', color: 'var(--ink-300)' }}>
                <InfoCircleOutlined style={{ fontSize: 24 }} />
                <div className="caption" style={{ marginTop: 6 }}>Click a block to edit</div>
              </div>
              <Divider style={{ margin: '8px 0' }} />
              <Text style={{ fontSize: 9, color: 'var(--ink-500)', fontWeight: 700 }}>CANVAS</Text>
              <Select size="small" style={{ width: '100%', marginTop: 4 }} value={paperSize} onChange={v => { setPaperSize(v); setIsDirty(true); }}>
                {Object.entries(PAPER_SIZES).map(([k, v]) => <Option key={k} value={k}>{v.label}</Option>)}
              </Select>
              <div className="caption" style={{ marginTop: 8 }}>Blocks: {blocks.length}</div>
              <Button size="small" block danger style={{ marginTop: 8, borderRadius: 6 }}
                onClick={() => Modal.confirm({ title: 'Clear canvas?', onOk: () => { setBlocks([]); setIsDirty(true); } })}>
                Clear All
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Excel-Style Grid editor */}
      <ExcelGridEditorModal
        open={gridEditorOpen}
        content={selectedBlock?.type === 'excel_grid' ? selectedBlock.content : null}
        onChange={(patch) => updateBlockContent(selectedBlock.id, patch)}
        onClose={() => setGridEditorOpen(false)}
      />

      {/* ERP Variables Drawer */}
      <Drawer title="📊 ERP Field Variables" open={showVars} onClose={() => setShowVars(false)} width={360} placement="right">
        <Alert message="Click any variable to copy. Paste into text block content." type="info" showIcon style={{ marginBottom: 12, fontSize: 11 }} />
        {ERP_VARIABLES.map(({ group, vars }) => (
          <div key={group} style={{ marginBottom: 12 }}>
            <Text strong style={{ fontSize: 12, color: '#B8860B' }}>{group}</Text>
            <Divider style={{ margin: '3px 0 6px' }} />
            <Row gutter={[4, 4]}>
              {vars.map(v => (
                <Col xs={12} key={v}>
                  <Tag style={{ cursor: 'pointer', fontSize: 10, width: '100%', textAlign: 'center' }}
                    onClick={() => { navigator.clipboard?.writeText(v); message.success(`Copied: ${v}`); }}>
                    {v}
                  </Tag>
                </Col>
              ))}
            </Row>
          </div>
        ))}
      </Drawer>

      {/* Version History Drawer */}
      <Drawer title="📜 Version History" open={showHistory} onClose={() => setShowHistory(false)} width={340} placement="right">
        {!editingId
          ? <Alert message="Save the template first to see version history." type="info" showIcon />
          : (versions || []).length === 0
            ? <Text type="secondary">No version history yet. Save the template to start tracking.</Text>
            : (versions || []).map((v, i) => (
              <Card key={i} size="small" style={{ marginBottom: 8, borderRadius: 6 }}>
                <Row justify="space-between" align="middle">
                  <Col><Text strong>Version {v.version}</Text><br /><Text type="secondary" style={{ fontSize: 11 }}>{v.saved_at ? new Date(v.saved_at).toLocaleString('en-IN') : '-'}</Text></Col>
                  <Col><Button size="small" onClick={() => { try { setBlocks(typeof v.layout === 'string' ? JSON.parse(v.layout) : v.layout); setTemplateVersion(v.version); message.success(`Restored v${v.version}`); setShowHistory(false); } catch { message.error('Restore failed.'); } }}>Restore</Button></Col>
                </Row>
              </Card>
            ))
        }
      </Drawer>

      <PageTour steps={tourSteps} />
    </div>
  );
}
