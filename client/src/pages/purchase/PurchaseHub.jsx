/**
 * Purchase Hub — All purchase & exchange bill types
 * Gold Purchase | Silver | Diamond | Vendor | Old Gold | Exchanges | Additional Bills
 */
import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Row, Col, Card, Typography, Tag, Space, Button, Modal, Form,
  Input, InputNumber, Select, DatePicker, message, Divider, Table,
  Tabs, Statistic, Alert, Radio,
} from 'antd';
import {
  ShoppingCartOutlined, GoldOutlined, PrinterOutlined, PlusOutlined,
  SwapOutlined, WalletOutlined, FileTextOutlined, ReconciliationOutlined,
  DollarOutlined, RollbackOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { purchaseApi, karigarApi, masterApi, dayCloseApi, savingsApi, customersApi, customerAdvanceApi } from '../../api/modules';
import api from '../../api/axios';
import { formatCurrency } from '../../utils/calculations';
import { useGoldRate } from '../../hooks/useGoldRate';
import PageTour from '../../components/PageTour';
import dayjs from 'dayjs';
import { METAL_TYPES } from '../../utils/metalTypes';
import { useActionShortcuts } from '../../hooks/useActionShortcuts';
import { useF2Lookup } from '../../hooks/useF2Lookup';

// Which Metal Type a line item defaults to, based on which Purchase Bill
// card was opened — Vendor Purchase has no single obvious metal, so it's
// left for the user to pick per item instead of guessing.
const DEFAULT_METAL_BY_MODAL = { gold: 'Gold', silver: 'Silver', diamond: 'Diamond' };

const { Title, Text } = Typography;
const { Option } = Select;
const { TabPane } = Tabs;

// ── Purchase Bill Type Definitions ────────────────────────────────────────────
const PURCHASE_TYPES = [
  { key: 'gold', icon: '🥇', title: 'Gold Purchase', subtitle: 'Buy gold stock from supplier', color: '#B8860B', badge: 'Gold', badgeColor: 'gold' },
  { key: 'silver', icon: '🥈', title: 'Silver Purchase', subtitle: 'Buy silver items from supplier', color: '#888', badge: 'Silver', badgeColor: 'default' },
  { key: 'diamond', icon: '💎', title: 'Diamond Purchase', subtitle: 'Buy diamond jewellery/stones', color: '#1890ff', badge: 'Diamond', badgeColor: 'blue' },
  { key: 'vendor', icon: '🏭', title: 'Vendor Purchase', subtitle: 'General vendor/supplier purchase', color: '#52c41a', badge: 'Vendor', badgeColor: 'green' },
];

const EXCHANGE_TYPES = [
  { key: 'old_gold', icon: '🔄', title: 'Old Gold Purchase', subtitle: 'Buy old gold from customer', color: '#fa8c16', badge: 'Old Gold', badgeColor: 'orange' },
  { key: 'gold_exchange', icon: '↔️', title: 'Gold Exchange', subtitle: 'Exchange old gold for new', color: '#722ed1', badge: 'Exchange', badgeColor: 'purple' },
  { key: 'silver_exchange', icon: '🔃', title: 'Silver Exchange', subtitle: 'Exchange old silver items', color: '#555', badge: 'Silver Exch', badgeColor: 'default' },
];

const ADDITIONAL_TYPES = [
  { key: 'advance_receipt', icon: '💰', title: 'Advance Receipt', subtitle: 'Collect advance from customer', color: '#52c41a', badge: 'Advance', badgeColor: 'green' },
  { key: 'advance_adj', icon: '📋', title: 'Advance Adjustment', subtitle: 'Adjust advance against bill', color: '#1890ff', badge: 'Adjustment', badgeColor: 'blue' },
  { key: 'gift_voucher', icon: '🎁', title: 'Gift Voucher Bill', subtitle: 'Issue a gift voucher to customer', color: '#eb2f96', badge: 'Voucher', badgeColor: 'magenta' },
  { key: 'scheme_receipt', icon: '🪙', title: 'Scheme Receipt', subtitle: 'Scheme installment receipt', color: '#B8860B', badge: 'Scheme', badgeColor: 'gold' },
  { key: 'scheme_refund', icon: '↩️', title: 'Scheme Refund', subtitle: 'Opens Scheme Adjustment — payout a member', color: '#ff4d4f', badge: 'Refund', badgeColor: 'red' },
  { key: 'scheme_maturity', icon: '✅', title: 'Scheme Maturity Adj.', subtitle: 'Opens Scheme Adjustment — apply to a bill', color: '#13c2c2', badge: 'Maturity', badgeColor: 'cyan' },
];

// ── Print helpers ─────────────────────────────────────────────────────────────
const printBill = (title, rows, footer = '') => {
  const win = window.open('', '_blank', 'width=700,height=650');
  win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
    body{font-family:Arial,sans-serif;padding:20px;font-size:11pt}
    h2{color:#B8860B;text-align:center;margin-bottom:4px}.sub{text-align:center;color:#666;font-size:10pt;margin-bottom:12px}
    .line{border-top:2px solid #B8860B;margin:10px 0}.dline{border-top:1px dashed #ccc;margin:6px 0}
    table{width:100%;border-collapse:collapse}
    th{background:#B8860B;color:#fff;padding:6px 8px;text-align:left;font-size:10pt}
    td{padding:5px 8px;border-bottom:1px solid #f0f0f0;font-size:10pt}
    .row{display:flex;justify-content:space-between;padding:4px 0}
    .label{color:#888}.val{font-weight:bold}
    .total{font-size:14pt;font-weight:bold;color:#B8860B}
    .footer{text-align:center;font-size:9pt;color:#888;margin-top:16px}
    @media print{body{padding:4mm}}
  </style></head><body>
  <h2>${title}</h2>
  <div class="sub">Receipt No: RCP-${Date.now().toString().slice(-7)} &nbsp;|&nbsp; Date: ${dayjs().format('DD-MMM-YYYY HH:mm')}</div>
  <div class="line"></div>
  ${rows}
  <div class="line"></div>
  ${footer}
  <div class="footer">💎 Thank you for your business!</div>
  </body></html>`);
  win.document.close();
  setTimeout(() => { win.print(); win.close(); }, 400);
};

export default function PurchaseHub() {
  const navigate = useNavigate();
  const { goldRate, rates } = useGoldRate();
  const qc = useQueryClient();
  const [activeModal, setActiveModal] = useState(null);
  const [form] = Form.useForm();
  const [purchaseItems, setPurchaseItems] = useState([{ id: 1 }]);
  const [activeTab, setActiveTab] = useState('purchase');

  // ── Walkthrough tour refs ───────────────────────────────────────────────────
  const tabsRef = useRef(null);
  const purchaseCardsRef = useRef(null);
  const exchangeCardsRef = useRef(null);
  const additionalCardsRef = useRef(null);
  const historyBtnRef = useRef(null);
  const tourSteps = [
    { title: '1. Purchase Tabs', description: 'This hub is organised into tabs — Purchase Bills, Exchange, Additional Bills, and Purchase History — switch between them for different kinds of transactions.', target: () => tabsRef.current },
    { title: '2. Purchase Bills', description: 'Click a card here (Gold/Silver/Diamond/Vendor) to record new stock bought from a supplier — the items get added straight into inventory.', target: () => purchaseCardsRef.current },
    { title: '3. Exchange', description: 'Use these cards when a customer brings in old gold or silver — either to sell it outright or exchange it towards a new purchase.', target: () => exchangeCardsRef.current },
    { title: '4. Additional Bills', description: 'Advance receipts, gift vouchers, and savings-scheme installment/refund/maturity entries are all recorded here.', target: () => additionalCardsRef.current },
    { title: '5. Purchase History', description: 'Click here (or the History tab) to see every past purchase entry with supplier, amount, and payment status.', target: () => historyBtnRef.current },
  ];

  const { data: suppliers } = useQuery({
    queryKey: ['vendors-suppliers'],
    queryFn: () => karigarApi.getVendors({ type: 'Supplier' }).then(r => r.data.data || []),
  });
  const { data: itemTypes } = useQuery({
    queryKey: ['item-types'],
    queryFn: () => masterApi.getItemTypes().then(r => r.data.data || []),
  });
  const { data: purities } = useQuery({
    queryKey: ['purities'],
    queryFn: () => masterApi.getPurities().then(r => r.data.data || []),
  });
  const { data: purchases, isLoading } = useQuery({
    queryKey: ['purchases'],
    queryFn: () => purchaseApi.getAll().then(r => r.data.data?.items || []),
  });

  const createMutation = useMutation({
    mutationFn: (data) => purchaseApi.create(data),
    onSuccess: () => {
      message.success('Purchase entry created & added to inventory!');
      qc.invalidateQueries(['purchases']);
      setActiveModal(null); form.resetFields(); setPurchaseItems([{ id: 1 }]);
    },
    onError: (err) => message.error(err.response?.data?.message || 'Failed to create purchase.'),
  });

  // Scheme Refund and Scheme Maturity Adjustment both need real member
  // lookup + invoice/payout handling that already exists, fully built and
  // tested, on the dedicated Scheme Adjustment page — rather than
  // building a second, divergent copy of that logic in a small modal
  // here, these two cards jump straight there.
  const openModal = (key) => {
    if (key === 'scheme_refund' || key === 'scheme_maturity') { navigate('/savings/adjustment'); return; }
    setActiveModal(key); form.resetFields(); setPurchaseItems([{ id: 1 }]);
  };
  const closeModal = () => { setActiveModal(null); form.resetFields(); setMemberQuery(''); setCustomerQuery(''); };

  // ── Member lookup for Scheme Receipt (savings/collect needs a real
  // Member_ID, not a free-text member number) ────────────────────────────────
  const [memberQuery, setMemberQuery] = useState('');
  const { data: memberResults, isFetching: memberSearching } = useQuery({
    queryKey: ['scheme-member-search-hub', memberQuery],
    queryFn: () => savingsApi.searchForPos(memberQuery).then((r) => r.data.data || []),
    enabled: activeModal === 'scheme_receipt' && memberQuery.trim().length >= 2,
  });

  // ── Customer lookup for Advance Receipt / Advance Adjustment (both need
  // a real Customer_ID — there is no walk-in-only concept for a ledger
  // that has to be looked up again later) ────────────────────────────────
  const [customerQuery, setCustomerQuery] = useState('');
  const { data: customerResults, isFetching: customerSearching } = useQuery({
    queryKey: ['customer-search-hub', customerQuery],
    queryFn: () => customersApi.search({ mobile: customerQuery, name: customerQuery }).then((r) => r.data.data || []),
    enabled: ['advance_receipt', 'advance_adj'].includes(activeModal) && customerQuery.trim().length >= 2,
  });
  const selectedAdvanceCustomerId = Form.useWatch('Customer_ID', form);
  const { data: advanceBalance } = useQuery({
    queryKey: ['customer-advance-balance', selectedAdvanceCustomerId],
    queryFn: () => customerAdvanceApi.getBalance(selectedAdvanceCustomerId).then((r) => r.data.data),
    enabled: activeModal === 'advance_adj' && !!selectedAdvanceCustomerId,
  });

  // No single "onNew" here — the hub's own cards ARE the "new entry"
  // choice (Gold/Silver/.../Scheme Maturity), so Save/Cancel are the only
  // shortcuts that make sense globally: whichever of the 11 modals above
  // is currently open, both act on it via the one shared `form` instance.
  const supplierLookup = useF2Lookup();
  useActionShortcuts({
    onSave: () => activeModal && form.submit(),
    onCancel: () => activeModal && closeModal(),
  });

  // ── Submit purchase bill (Gold/Silver/Diamond/Vendor) ─────────────────────
  // GST was never captured here either — Subtotal_Amount always equalled
  // Total_Amount, even though purchase.js has fully supported Input
  // CGST/SGST/IGST posting since the COGS batch (see PurchasePage.jsx for
  // the same fix and reasoning).
  const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
  const computePurchaseTotals = () => {
    const subtotal = purchaseItems.reduce((s, item, idx) => {
      const gross = parseFloat(form.getFieldValue(`gross_${idx}`) || 0);
      const stone = parseFloat(form.getFieldValue(`stone_${idx}`) || 0);
      const rate = parseFloat(form.getFieldValue(`rate_${idx}`) || goldRate || 0);
      const making = parseFloat(form.getFieldValue(`making_${idx}`) || 0);
      return s + (gross - stone) * rate + making;
    }, 0);
    const gstPercent = parseFloat(form.getFieldValue('GST_Percentage')) || 0;
    const gstAmount = round2(subtotal * gstPercent / 100);
    return { subtotal: round2(subtotal), gstAmount, total: round2(subtotal + gstAmount) };
  };
  const onSubmitPurchase = (values) => {
    const lineItems = purchaseItems.map((_, idx) => {
      const gross = parseFloat(values[`gross_${idx}`] || 0);
      const stone = parseFloat(values[`stone_${idx}`] || 0);
      const rate = parseFloat(values[`rate_${idx}`] || goldRate);
      const making = parseFloat(values[`making_${idx}`] || 0);
      const purCode = (purities || []).find(p => p.Purity_ID === values[`purity_${idx}`])?.Purity_Code || '';
      const lineVal = (gross - stone) * rate + making;
      return {
        Type_ID: values[`type_${idx}`], Purity_ID: values[`purity_${idx}`],
        Metal_Type: values[`metal_${idx}`] || DEFAULT_METAL_BY_MODAL[activeModal] || 'Gold',
        Purity_Code: purCode, Item_Description: values[`desc_${idx}`] || '',
        Quantity: 1, Gross_Weight: gross, Stone_Weight: stone,
        Gold_Rate: rate, Making_Charge: making,
        Purchase_Rate: lineVal, Total_Line_Value: lineVal, Create_Inventory: true,
      };
    });
    const subtotal = lineItems.reduce((s, i) => s + i.Total_Line_Value, 0);
    const gstAmount = round2(subtotal * (parseFloat(values.GST_Percentage) || 0) / 100);
    const purchaseTypeMap = { gold: 'Gold', silver: 'Silver', diamond: 'Diamond', vendor: 'Stock' };
    createMutation.mutate({
      Supplier_ID: values.Supplier_ID || null,
      Purchase_Type: purchaseTypeMap[activeModal] || 'Stock',
      Purchase_Date: values.Purchase_Date?.toISOString() || new Date().toISOString(),
      Supplier_Invoice_No: values.Supplier_Invoice_No,
      Subtotal_Amount: round2(subtotal), GST_Amount: gstAmount, Total_Amount: round2(subtotal + gstAmount),
      Payment_Mode: values.Payment_Mode || 'Cash',
      Payment_Status: 'Pending', Notes: values.Notes, items: lineItems,
    });
  };

  // ── Submit old gold / exchange ─────────────────────────────────────────────
  // This used to only print a paper receipt — nothing was ever saved, so
  // the gold/silver bought here never entered stock and no money ever
  // moved on the books. It's a real purchase (we pay the walk-in seller
  // cash for their old metal), so it now books through the same
  // purchase.js route the Purchase Bill modal uses — Create_Inventory:
  // false since it's raw melt-down material, not a resalable ornament
  // with its own design/article number.
  const round2Hub = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
  const onSubmitExchange = async (values) => {
    const w = parseFloat(values.weight || 0);
    const purity = parseFloat(values.purity_pct || 91.67) / 100;
    const melt = parseFloat(values.melt_deduct || 2) / 100;
    const rate = parseFloat(values.gold_rate || goldRate);
    const pureWt = w * purity;
    const netWt = pureWt * (1 - melt);
    const value = round2Hub(netWt * rate);
    const titleMap = { old_gold: 'OLD GOLD PURCHASE', gold_exchange: 'GOLD EXCHANGE', silver_exchange: 'SILVER EXCHANGE' };
    const purchaseTypeMap = { old_gold: 'Old Gold', gold_exchange: 'Gold Exchange', silver_exchange: 'Silver Exchange' };
    const metalMap = { old_gold: 'Gold', gold_exchange: 'Gold', silver_exchange: 'Silver' };

    try {
      await createMutation.mutateAsync({
        Supplier_Name: values.customer_name || 'Walk-in',
        Purchase_Type: purchaseTypeMap[activeModal],
        Purchase_Date: new Date().toISOString(),
        Subtotal_Amount: value, Total_Amount: value,
        Amount_Paid: value, Payment_Mode: values.payment_mode || 'Cash',
        Notes: `${values.item_desc || 'Old metal'} — ${values.mobile ? `Mobile ${values.mobile}, ` : ''}Gross ${w}g @ ${values.purity_label || values.purity_pct + '%'} purity, ${values.melt_deduct || 2}% melting deduction`,
        items: [{
          Item_Description: values.item_desc || `${metalMap[activeModal]} exchange`, Metal_Type: metalMap[activeModal],
          Gross_Weight: w, Stone_Weight: 0, Gold_Rate: rate, Making_Charge: 0,
          Purchase_Rate: value, Total_Line_Value: value, Create_Inventory: false,
        }],
      });
    } catch (err) {
      message.error(err.response?.data?.message || 'Failed to save this purchase.');
      return;
    }

    const rows = `
      <div class="row"><span class="label">Customer Name</span><span class="val">${values.customer_name || 'Walk-in'}</span></div>
      <div class="row"><span class="label">Mobile</span><span class="val">${values.mobile || '-'}</span></div>
      <div class="dline"></div>
      <div class="row"><span class="label">Item Description</span><span class="val">${values.item_desc || '-'}</span></div>
      <div class="row"><span class="label">Gross Weight</span><span class="val">${w}g</span></div>
      <div class="row"><span class="label">Purity</span><span class="val">${values.purity_label || values.purity_pct + '%'}</span></div>
      <div class="row"><span class="label">Pure Gold Weight</span><span class="val">${pureWt.toFixed(3)}g</span></div>
      <div class="row"><span class="label">After Melting Deduction (${values.melt_deduct || 2}%)</span><span class="val">${netWt.toFixed(3)}g</span></div>
      <div class="row"><span class="label">Gold Rate Applied</span><span class="val">₹${rate.toLocaleString('en-IN')}/g</span></div>
      <div class="dline"></div>
      <div class="row"><span class="label">Payment Mode</span><span class="val">${values.payment_mode || 'Cash'}</span></div>`;
    const footer = `<div class="row"><span class="total">NET PAYABLE: ₹${value.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span></div>
      <div style="margin-top:20px">Customer Signature: ___________________________</div>`;
    printBill(titleMap[activeModal], rows, footer);
    message.success(`${titleMap[activeModal]} saved & receipt printed!`);
    closeModal();
  };

  // ── Submit additional bills ───────────────────────────────────────────────
  // All four cards now actually persist. advance_receipt/advance_adj were
  // the last two — there was no generic (not order-tied) customer-advance
  // ledger anywhere in the backend; POST /api/customer-advance and its
  // /apply route (built for exactly this) are what they call now.
  const onSubmitAdditional = async (values) => {
    const titleMap = {
      advance_receipt: 'ADVANCE RECEIPT', advance_adj: 'ADVANCE ADJUSTMENT',
      gift_voucher: 'GIFT VOUCHER', scheme_receipt: 'SCHEME INSTALLMENT RECEIPT',
    };
    const title = titleMap[activeModal] || 'RECEIPT';
    let rows = `<div class="row"><span class="label">Customer Name</span><span class="val">${values.customer_label || values.customer_name || 'Walk-in'}</span></div>
      <div class="dline"></div>`;
    let voucherCode = values.voucher_code;

    if (activeModal === 'advance_receipt') {
      if (!values.Customer_ID) { message.error('Search and select a customer first.'); return; }
      try {
        await customerAdvanceApi.create({
          Customer_ID: values.Customer_ID, Amount: values.amount,
          Payment_Mode: values.payment_mode || 'Cash', Purpose: values.purpose || null,
        });
      } catch (err) {
        message.error(err.response?.data?.message || 'Failed to record advance.');
        return;
      }
      rows += `<div class="row"><span class="label">Purpose</span><span class="val">${values.purpose || 'Advance'}</span></div>
        <div class="row"><span class="label">Payment Mode</span><span class="val">${values.payment_mode || 'Cash'}</span></div>`;
    } else if (activeModal === 'advance_adj') {
      if (!values.Customer_ID) { message.error('Search and select a customer first.'); return; }
      let applyResult;
      try {
        const res = await customerAdvanceApi.apply(values.Customer_ID, { Invoice_Number: values.invoice_no, Amount: values.advance_amount });
        applyResult = res.data.data;
      } catch (err) {
        message.error(err.response?.data?.message || 'Failed to apply advance.');
        return;
      }
      rows += `<div class="row"><span class="label">Invoice No</span><span class="val">${values.invoice_no}</span></div>
        <div class="row"><span class="label">Applied To Invoice</span><span class="val">₹${applyResult.applied_to_invoice.toLocaleString('en-IN')}</span></div>
        ${applyResult.refund_amount > 0 ? `<div class="row"><span class="label">Refunded (bill already covered)</span><span class="val">₹${applyResult.refund_amount.toLocaleString('en-IN')}</span></div>` : ''}
        <div class="row"><span class="label">Invoice Balance Remaining</span><span class="val">₹${applyResult.invoice_balance_remaining.toLocaleString('en-IN')}</span></div>`;
    } else if (activeModal === 'gift_voucher') {
      // Best-effort link to an existing customer by mobile — the voucher
      // still issues fine (Issued_To_Customer_ID is nullable) if nothing
      // matches or the lookup fails.
      let customerId = null;
      if (values.mobile) {
        try {
          const found = await customersApi.search({ mobile: values.mobile });
          customerId = found.data.data?.[0]?.Customer_ID || null;
        } catch { /* non-fatal — issue unlinked */ }
      }
      try {
        const res = await dayCloseApi.createVoucher({
          value: values.voucher_amount,
          expiry_date: values.valid_till?.toISOString() || null,
          customer_id: customerId,
        });
        voucherCode = res.data.data.Voucher_Code;
      } catch (err) {
        message.error(err.response?.data?.message || 'Failed to issue gift voucher.');
        return;
      }
      rows += `<div class="row"><span class="label">Voucher Code</span><span class="val">${voucherCode}</span></div>
        <div class="row"><span class="label">Valid Till</span><span class="val">${values.valid_till?.format('DD-MMM-YYYY') || 'No expiry'}</span></div>
        <div class="row"><span class="label">Payment Mode</span><span class="val">${values.payment_mode || 'Cash'}</span></div>`;
    } else if (activeModal === 'scheme_receipt') {
      if (!values.Member_ID) { message.error('Search and select a scheme member first.'); return; }
      try {
        await savingsApi.collect({ Member_ID: values.Member_ID, Amount: values.amount, Payment_Mode: values.payment_mode || 'Cash' });
      } catch (err) {
        message.error(err.response?.data?.message || 'Failed to collect installment.');
        return;
      }
      rows += `<div class="row"><span class="label">Member</span><span class="val">${values.member_label || '-'}</span></div>
        <div class="row"><span class="label">Payment Mode</span><span class="val">${values.payment_mode || 'Cash'}</span></div>`;
    }

    const net = parseFloat(values.amount || values.advance_amount || values.voucher_amount || 0);
    const footer = `<div class="row"><span class="total">AMOUNT: ₹${net.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span></div>`;
    printBill(title, rows, footer);
    message.success(`${title} saved & printed!`);
    closeModal();
  };

  const columns = [
    { title: 'Purchase #', dataIndex: 'Purchase_Number', render: v => <Text code style={{ fontSize: 11 }}>{v}</Text> },
    { title: 'Date', dataIndex: 'Purchase_Date', render: v => dayjs(v).format('DD-MMM-YYYY') },
    { title: 'Supplier', dataIndex: 'Supplier_Name_Resolved', render: v => v || '-' },
    { title: 'Type', dataIndex: 'Purchase_Type', render: v => <Tag color="blue">{v}</Tag> },
    { title: 'Amount', dataIndex: 'Total_Amount', render: v => <Text strong style={{ color: '#B8860B' }}>{formatCurrency(v)}</Text> },
    { title: 'Status', dataIndex: 'Payment_Status', render: v => <Tag color={v === 'Paid' ? 'green' : 'orange'}>{v}</Tag> },
  ];

  // ── Shared item rows form ─────────────────────────────────────────────────
  const PurchaseItemRows = () => (
    <>
      {purchaseItems.map((item, idx) => (
        <Card key={item.id} size="small" style={{ background: '#fafafa', borderRadius: 6, marginBottom: 10 }}
          extra={purchaseItems.length > 1 && <Button size="small" danger onClick={() => setPurchaseItems(p => p.filter(i => i.id !== item.id))}>Remove</Button>}>
          <Row gutter={10}>
            <Col xs={5}>
              <Form.Item name={`metal_${idx}`} label="Metal" initialValue={DEFAULT_METAL_BY_MODAL[activeModal] || 'Gold'} rules={[{required:true, message:'Required'}]}>
                <Select size="small" onChange={() => form.setFieldValue(`purity_${idx}`, undefined)}>
                  {METAL_TYPES.map(m => <Option key={m} value={m}>{m}</Option>)}
                </Select>
              </Form.Item>
            </Col>
            <Col xs={5}><Form.Item name={`type_${idx}`} label="Item Type"><Select size="small" placeholder="Type" allowClear>{(itemTypes||[]).map(t=><Option key={t.Type_ID} value={t.Type_ID}>{t.Type_Name}</Option>)}</Select></Form.Item></Col>
            <Col xs={5}>
              {/* Purity narrows to whatever Metal was picked above — a
                  Diamond line item has no purity concept, so it's hidden. */}
              <Form.Item shouldUpdate={(prev, cur) => prev[`metal_${idx}`] !== cur[`metal_${idx}`]} noStyle>
                {() => {
                  const m = form.getFieldValue(`metal_${idx}`);
                  if (m === 'Diamond') return null;
                  const filtered = (purities||[]).filter(p => !m || p.Metal_Type === m);
                  return (
                    <Form.Item name={`purity_${idx}`} label="Purity">
                      <Select size="small" allowClear>{filtered.map(p=><Option key={p.Purity_ID} value={p.Purity_ID}>{p.Purity_Code}</Option>)}</Select>
                    </Form.Item>
                  );
                }}
              </Form.Item>
            </Col>
            <Col xs={4}><Form.Item name={`gross_${idx}`} label="Gross Wt(g)" rules={[{required:true}]}><InputNumber size="small" style={{width:'100%'}} step={0.001} min={0.001} /></Form.Item></Col>
            <Col xs={4}><Form.Item name={`stone_${idx}`} label="Stone Wt(g)" initialValue={0}><InputNumber size="small" style={{width:'100%'}} step={0.001} min={0} /></Form.Item></Col>
            <Col xs={5}><Form.Item name={`rate_${idx}`} label="Rate(₹/g)" initialValue={goldRate}><InputNumber size="small" style={{width:'100%'}} min={0} /></Form.Item></Col>
          </Row>
          <Row gutter={10}>
            <Col xs={5}><Form.Item name={`making_${idx}`} label="Making(₹)" initialValue={0}><InputNumber size="small" style={{width:'100%'}} min={0} /></Form.Item></Col>
            <Col xs={19}><Form.Item name={`desc_${idx}`} label="Description"><Input size="small" placeholder="e.g. 22K Gold Necklace" /></Form.Item></Col>
          </Row>
        </Card>
      ))}
      <Button block icon={<PlusOutlined />} onClick={() => setPurchaseItems(p=>[...p,{id:Date.now()}])} style={{marginBottom:12}}>Add Item</Button>
    </>
  );

  // ── Exchange form ────────────────────────────────────────────────────────
  const ExchangeForm = () => (
    <>
      <Row gutter={12}><Col xs={12}><Form.Item name="customer_name" label="Customer Name" rules={[{required:true}]}><Input /></Form.Item></Col>
        <Col xs={12}><Form.Item name="mobile" label="Mobile"><Input /></Form.Item></Col></Row>
      <Form.Item name="item_desc" label="Item Description"><Input placeholder="e.g. Old 22K Necklace, broken bangles" /></Form.Item>
      <Row gutter={12}>
        <Col xs={8}><Form.Item name="weight" label="Gross Weight (g)" rules={[{required:true}]}><InputNumber style={{width:'100%'}} step={0.001} min={0.001} /></Form.Item></Col>
        <Col xs={8}><Form.Item name="purity_pct" label="Purity %" initialValue={91.67}>
          <Select onChange={(v,opt) => form.setFieldValue('purity_label', opt.children)}>
            <Option value={99.9}>24K (99.9%)</Option><Option value={91.67}>22K (91.67%)</Option>
            <Option value={75}>18K (75%)</Option><Option value={70}>Mixed (70%)</Option><Option value={58.5}>14K (58.5%)</Option>
          </Select></Form.Item></Col>
        <Col xs={8}><Form.Item name="melt_deduct" label="Melt Deduct %" initialValue={2}><InputNumber style={{width:'100%'}} min={0} max={10} /></Form.Item></Col>
      </Row>
      <Row gutter={12}>
        <Col xs={12}><Form.Item name="gold_rate" label="Gold Rate (₹/g)" initialValue={goldRate}><InputNumber style={{width:'100%'}} min={1} /></Form.Item></Col>
        <Col xs={12}><Form.Item name="payment_mode" label="Payment Mode" initialValue="Cash">
          <Select><Option value="Cash">💵 Cash</Option><Option value="UPI">📱 UPI</Option><Option value="NEFT">🏦 NEFT</Option><Option value="Cheque">📋 Cheque</Option></Select></Form.Item></Col>
      </Row>
    </>
  );

  // ── Render card grid ─────────────────────────────────────────────────────
  const renderCards = (types, onClickFn) => (
    <Row gutter={[14, 14]}>
      {types.map(t => (
        <Col xs={24} sm={12} lg={8} xl={6} key={t.key}>
          <Card hoverable onClick={() => onClickFn(t.key)}
            style={{ borderRadius: 10, border: `2px solid ${t.color}22`, cursor: 'pointer' }}
            bodyStyle={{ padding: 18 }}>
            <Space direction="vertical" size={6} style={{ width: '100%' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 28 }}>{t.icon}</span>
                <Tag color={t.badgeColor} style={{ fontSize: 10 }}>{t.badge}</Tag>
              </div>
              <Title level={5} style={{ margin: 0, color: t.color, fontSize: 13 }}>{t.title}</Title>
              <Text type="secondary" style={{ fontSize: 11 }}>{t.subtitle}</Text>
              <Button type="primary" block size="small"
                style={{ background: t.color, borderColor: t.color, fontWeight: 600, fontSize: 11 }}>
                Open {t.title}
              </Button>
            </Space>
          </Card>
        </Col>
      ))}
    </Row>
  );

  return (
    <div className="page-wrapper">
      <div className="page-header">
        <div>
          <Title level={4} style={{ margin: 0 }}><ShoppingCartOutlined style={{ color: '#B8860B', marginRight: 8 }} />Purchase & Exchange Hub</Title>
          <Text type="secondary" style={{ fontSize: 12 }}>Gold, Silver, Diamond, Vendor purchases · Old Gold · Exchanges · Advance & Scheme bills</Text>
        </div>
        <Button ref={historyBtnRef} icon={<GoldOutlined />} onClick={() => setActiveTab('history')} style={{ borderColor: '#B8860B', color: '#B8860B' }}>Purchase History</Button>
      </div>

      <div ref={tabsRef}>
      <Tabs activeKey={activeTab} onChange={setActiveTab} type="card">
        <TabPane tab="🥇 Purchase Bills" key="purchase">
          <Title level={5} style={{ color: '#B8860B', marginBottom: 12 }}>Stock Purchase from Suppliers</Title>
          <div ref={purchaseCardsRef}>{renderCards(PURCHASE_TYPES, openModal)}</div>
        </TabPane>

        <TabPane tab="🔄 Exchange" key="exchange">
          <Title level={5} style={{ color: '#fa8c16', marginBottom: 12 }}>Old Gold & Exchange Transactions</Title>
          <div ref={exchangeCardsRef}>{renderCards(EXCHANGE_TYPES, openModal)}</div>
        </TabPane>

        <TabPane tab="📋 Additional Bills" key="additional">
          <Title level={5} style={{ color: '#722ed1', marginBottom: 12 }}>Advance, Voucher & Scheme Transactions</Title>
          <div ref={additionalCardsRef}>{renderCards(ADDITIONAL_TYPES, openModal)}</div>
        </TabPane>

        <TabPane tab="📜 Purchase History" key="history">
          <Card style={{ borderRadius: 8 }} bodyStyle={{ padding: 0 }}>
            <Table
            scroll={{ x: "max-content" }} columns={columns} dataSource={purchases || []} loading={isLoading}
              rowKey="Purchase_ID" size="small" pagination={{ pageSize: 20 }} />
          </Card>
        </TabPane>
      </Tabs>
      </div>

      {/* ── Purchase Bill Modal (Gold/Silver/Diamond/Vendor) ─────────── */}
      <Modal
        title={`${PURCHASE_TYPES.find(t=>t.key===activeModal)?.icon || '📦'} ${PURCHASE_TYPES.find(t=>t.key===activeModal)?.title || 'Purchase Entry'}`}
        open={['gold','silver','diamond','vendor'].includes(activeModal)}
        onCancel={closeModal} footer={null} width={780} destroyOnClose>
        <Form form={form} layout="vertical" onFinish={onSubmitPurchase}>
          <Row gutter={14}>
            <Col xs={12}><Form.Item name="Supplier_ID" label="Supplier"><Select allowClear placeholder="Select supplier (F2 for full list)" showSearch optionFilterProp="children"
              open={supplierLookup.open} onDropdownVisibleChange={supplierLookup.onOpenChange} onKeyDown={supplierLookup.onKeyDown}>
              {(suppliers||[]).map(s=><Option key={s.Vendor_ID} value={s.Vendor_ID}>{s.Vendor_Name}</Option>)}</Select></Form.Item></Col>
            <Col xs={12}><Form.Item name="Purchase_Date" label="Purchase Date" initialValue={dayjs()}><DatePicker style={{width:'100%'}} /></Form.Item></Col>
          </Row>
          <Row gutter={14}>
            <Col xs={12}><Form.Item name="Supplier_Invoice_No" label="Supplier Invoice No"><Input placeholder="Supplier's bill number" /></Form.Item></Col>
            <Col xs={12}><Form.Item name="Payment_Mode" label="Payment Mode" initialValue="Cash">
              <Select><Option value="Cash">💵 Cash</Option><Option value="Cheque">📋 Cheque</Option><Option value="NEFT">🏦 NEFT</Option><Option value="UPI">📱 UPI</Option><Option value="Credit">🏷️ Credit</Option></Select></Form.Item></Col>
          </Row>
          <Divider style={{ margin: '10px 0' }}>Items Received</Divider>
          <PurchaseItemRows />
          <Row gutter={14}>
            <Col xs={10}>
              <Form.Item name="GST_Percentage" label="GST % (Input Tax Credit)" initialValue={3}>
                <Select>
                  <Option value={0}>0% (unregistered / exempt)</Option>
                  <Option value={0.25}>0.25% (rough diamonds)</Option>
                  <Option value={3}>3% (gold/silver jewellery — standard)</Option>
                  <Option value={5}>5%</Option>
                  <Option value={12}>12%</Option>
                  <Option value={18}>18%</Option>
                </Select>
              </Form.Item>
            </Col>
            <Col xs={14}>
              <Form.Item shouldUpdate noStyle>
                {() => {
                  const { subtotal, gstAmount, total } = computePurchaseTotals();
                  return (
                    <div style={{ display: 'flex', gap: 20, alignItems: 'center', height: '100%', paddingTop: 30, justifyContent: 'flex-end' }}>
                      <Text type="secondary" style={{ fontSize: 12 }}>Subtotal: <Text strong>{formatCurrency(subtotal)}</Text></Text>
                      <Text type="secondary" style={{ fontSize: 12 }}>GST: <Text strong>{formatCurrency(gstAmount)}</Text></Text>
                      <Text style={{ fontSize: 12 }}>Total: <Text strong style={{ color: '#B8860B', fontSize: 15 }}>{formatCurrency(total)}</Text></Text>
                    </div>
                  );
                }}
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="Notes" label="Notes"><Input.TextArea rows={2} /></Form.Item>
          <Button type="primary" htmlType="submit" block size="large" loading={createMutation.isPending}
            style={{ background: '#B8860B', borderColor: '#B8860B', fontWeight: 700 }}>
            💾 Save Purchase & Add to Inventory
          </Button>
        </Form>
      </Modal>

      {/* ── Exchange Modal ────────────────────────────────────────────── */}
      <Modal
        title={`${EXCHANGE_TYPES.find(t=>t.key===activeModal)?.icon || '🔄'} ${EXCHANGE_TYPES.find(t=>t.key===activeModal)?.title || 'Exchange'}`}
        open={['old_gold','gold_exchange','silver_exchange'].includes(activeModal)}
        onCancel={closeModal} footer={null} width={560} destroyOnClose>
        <Alert message={`Current Gold Rate: ₹${parseFloat(goldRate||0).toLocaleString('en-IN')}/g (22K)`} type="info" showIcon style={{ marginBottom: 14, fontSize: 11 }} />
        <Form form={form} layout="vertical" onFinish={onSubmitExchange}>
          <ExchangeForm />
          <Button type="primary" htmlType="submit" block size="large"
            style={{ background: '#fa8c16', borderColor: '#fa8c16', fontWeight: 700 }}>
            <PrinterOutlined /> Calculate & Print Receipt
          </Button>
        </Form>
      </Modal>

      {/* ── Additional Bills Modals ───────────────────────────────────── */}
      {/* Advance Receipt — now really posts via customerAdvanceApi.create
          (POST /customer-advance), which needs a real Customer_ID —
          replaced the old free-text Customer Name/Mobile with a proper
          search against existing customers, same pattern as Scheme
          Receipt's member search above. */}
      <Modal title="💰 Advance Receipt" open={activeModal==='advance_receipt'} onCancel={closeModal} footer={null} width={480} destroyOnClose>
        <Form form={form} layout="vertical" onFinish={onSubmitAdditional}>
          <Form.Item label="Customer" required>
            <Select
              showSearch placeholder="Search by name or mobile"
              filterOption={false} loading={customerSearching}
              onSearch={setCustomerQuery}
              notFoundContent={customerQuery.trim().length < 2 ? 'Type at least 2 characters' : (customerSearching ? 'Searching…' : 'No match — add them under Customers first')}
              onChange={(id, opt) => form.setFieldsValue({ Customer_ID: id, customer_label: opt?.label })}
            >
              {(customerResults || []).map((c) => (
                <Option key={c.Customer_ID} value={c.Customer_ID} label={`${c.Customer_Name} (${c.Mobile_1})`}>
                  {c.Customer_Name} — {c.Mobile_1}
                </Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item name="Customer_ID" hidden rules={[{ required: true, message: 'Select a customer.' }]}><Input /></Form.Item>
          <Form.Item name="customer_label" hidden><Input /></Form.Item>
          <Form.Item name="purpose" label="Purpose / Against"><Input placeholder="e.g. Against Order No. ORD-001234" /></Form.Item>
          <Row gutter={12}><Col xs={12}><Form.Item name="amount" label="Amount (₹)" rules={[{required:true}]}><InputNumber style={{width:'100%'}} min={1} formatter={v=>`₹ ${v}`} /></Form.Item></Col>
            <Col xs={12}><Form.Item name="payment_mode" label="Payment Mode" initialValue="Cash"><Select><Option value="Cash">Cash</Option><Option value="UPI">UPI</Option><Option value="Card">Card</Option><Option value="Cheque">Cheque</Option></Select></Form.Item></Col></Row>
          <Button type="primary" htmlType="submit" block size="large" style={{background:'#52c41a',borderColor:'#52c41a',fontWeight:700}}><PrinterOutlined /> Collect & Print Advance Receipt</Button>
        </Form>
      </Modal>

      {/* Advance Adjustment — now really posts via customerAdvanceApi.apply
          (POST /customer-advance/:customerId/apply), which settles the
          invoice's real outstanding balance first and refunds any excess.
          Bill Amount/Advance Collected On were never real inputs the
          backend could use — dropped; available balance now shows live
          once a customer is picked. */}
      <Modal title="📋 Advance Adjustment" open={activeModal==='advance_adj'} onCancel={closeModal} footer={null} width={480} destroyOnClose>
        <Form form={form} layout="vertical" onFinish={onSubmitAdditional}>
          <Form.Item label="Customer" required>
            <Select
              showSearch placeholder="Search by name or mobile"
              filterOption={false} loading={customerSearching}
              onSearch={setCustomerQuery}
              notFoundContent={customerQuery.trim().length < 2 ? 'Type at least 2 characters' : (customerSearching ? 'Searching…' : 'No match')}
              onChange={(id, opt) => form.setFieldsValue({ Customer_ID: id, customer_label: opt?.label })}
            >
              {(customerResults || []).map((c) => (
                <Option key={c.Customer_ID} value={c.Customer_ID} label={`${c.Customer_Name} (${c.Mobile_1})`}>
                  {c.Customer_Name} — {c.Mobile_1}
                </Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item name="Customer_ID" hidden rules={[{ required: true, message: 'Select a customer.' }]}><Input /></Form.Item>
          <Form.Item name="customer_label" hidden><Input /></Form.Item>
          {selectedAdvanceCustomerId && (
            <Alert type="info" showIcon style={{ marginBottom: 12 }}
              message={`Available advance: ₹${(advanceBalance?.total_available ?? 0).toLocaleString('en-IN')}`} />
          )}
          <Form.Item name="invoice_no" label="Sale Invoice No" rules={[{required:true, message:'Invoice number is required.'}]}>
            <Input placeholder="e.g. INV-DLJ-20260811-0001" />
          </Form.Item>
          <Form.Item name="advance_amount" label="Advance to Apply (₹)" rules={[{required:true}]}>
            <InputNumber style={{width:'100%'}} min={1} max={advanceBalance?.total_available} formatter={v=>`₹ ${v}`} />
          </Form.Item>
          <Button type="primary" htmlType="submit" block size="large" style={{background:'#1890ff',borderColor:'#1890ff',fontWeight:700}}><PrinterOutlined /> Apply & Print Adjustment Receipt</Button>
        </Form>
      </Modal>

      {/* Gift Voucher — now really issues a tbl_gift_vouchers row via the
          existing dayCloseApi.createVoucher route; the code is always
          server-generated (real, unique, checked at redemption), so a
          client-typed one would only ever have been discarded silently
          before — removed rather than left as a misleading no-op field. */}
      <Modal title="🎁 Gift Voucher Bill" open={activeModal==='gift_voucher'} onCancel={closeModal} footer={null} width={480} destroyOnClose>
        <Form form={form} layout="vertical" onFinish={onSubmitAdditional}>
          <Row gutter={12}><Col xs={12}><Form.Item name="customer_name" label="Issued To" rules={[{required:true}]}><Input /></Form.Item></Col>
            <Col xs={12}><Form.Item name="mobile" label="Mobile" extra="Used to link this voucher to an existing customer, if found."><Input /></Form.Item></Col></Row>
          <Row gutter={12}><Col xs={12}><Form.Item name="voucher_amount" label="Voucher Amount (₹)" rules={[{required:true}]}><InputNumber style={{width:'100%'}} min={1} formatter={v=>`₹ ${v}`} /></Form.Item></Col>
            <Col xs={12}><Form.Item name="valid_till" label="Valid Till"><DatePicker style={{width:'100%'}} disabledDate={d=>d&&d<dayjs()} /></Form.Item></Col></Row>
          <Form.Item name="payment_mode" label="Payment Mode" initialValue="Cash"><Select><Option value="Cash">Cash</Option><Option value="UPI">UPI</Option><Option value="Card">Card</Option></Select></Form.Item>
          <Button type="primary" htmlType="submit" block size="large" style={{background:'#eb2f96',borderColor:'#eb2f96',fontWeight:700}}><PrinterOutlined /> Issue Gift Voucher</Button>
        </Form>
      </Modal>

      {/* Scheme Receipt — now really posts via savingsApi.collect (POST
          /savings/collect), which needs a real Member_ID, not the free-
          text member number the old print-only form took. Member Number/
          Scheme Name/Installment # were also never real inputs the
          backend could use — replaced with a proper member search
          (same GET /savings/members/search-for-pos POS itself uses). */}
      <Modal title="🪙 Scheme Installment Receipt" open={activeModal==='scheme_receipt'} onCancel={closeModal} footer={null} width={480} destroyOnClose>
        <Form form={form} layout="vertical" onFinish={onSubmitAdditional}>
          <Form.Item label="Member" required>
            <Select
              showSearch placeholder="Search by name, mobile, or member number"
              filterOption={false} loading={memberSearching}
              onSearch={setMemberQuery}
              notFoundContent={memberQuery.trim().length < 2 ? 'Type at least 2 characters' : (memberSearching ? 'Searching…' : 'No match')}
              onChange={(memberId, opt) => { form.setFieldsValue({ Member_ID: memberId, member_label: opt?.label }); }}
            >
              {(memberResults || []).map((m) => (
                <Option key={m.Member_ID} value={m.Member_ID} label={`${m.Member_Name} (${m.Member_Number})`}>
                  {m.Member_Name} — {m.Member_Number} · {m.Mobile} <Tag color={m.Status === 'Matured' ? 'gold' : 'blue'} style={{marginLeft:4}}>{m.Status}</Tag>
                </Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item name="Member_ID" hidden rules={[{ required: true, message: 'Select a member.' }]}><Input /></Form.Item>
          <Form.Item name="member_label" hidden><Input /></Form.Item>
          <Row gutter={12}>
            <Col xs={12}><Form.Item name="amount" label="Amount (₹)" rules={[{required:true}]}><InputNumber style={{width:'100%'}} min={1} formatter={v=>`₹ ${v}`} /></Form.Item></Col>
            <Col xs={12}><Form.Item name="payment_mode" label="Mode" initialValue="Cash"><Select><Option value="Cash">Cash</Option><Option value="UPI">UPI</Option><Option value="Cheque">Cheque</Option></Select></Form.Item></Col>
          </Row>
          <Button type="primary" htmlType="submit" block size="large" style={{background:'#B8860B',borderColor:'#B8860B',fontWeight:700}}><PrinterOutlined /> Collect & Print Scheme Receipt</Button>
        </Form>
      </Modal>

      <PageTour steps={tourSteps} />
    </div>
  );
}
