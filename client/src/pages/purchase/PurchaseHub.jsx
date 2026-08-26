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
import { purchaseApi, karigarApi, masterApi } from '../../api/modules';
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
  { key: 'scheme_refund', icon: '↩️', title: 'Scheme Refund', subtitle: 'Refund scheme amount to member', color: '#ff4d4f', badge: 'Refund', badgeColor: 'red' },
  { key: 'scheme_maturity', icon: '✅', title: 'Scheme Maturity Adj.', subtitle: 'Maturity amount adjustment in sale', color: '#13c2c2', badge: 'Maturity', badgeColor: 'cyan' },
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

  const openModal = (key) => { setActiveModal(key); form.resetFields(); setPurchaseItems([{ id: 1 }]); };
  const closeModal = () => { setActiveModal(null); form.resetFields(); };

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
  const onSubmitExchange = (values) => {
    const w = parseFloat(values.weight || 0);
    const purity = parseFloat(values.purity_pct || 91.67) / 100;
    const melt = parseFloat(values.melt_deduct || 2) / 100;
    const rate = parseFloat(values.gold_rate || goldRate);
    const pureWt = w * purity;
    const netWt = pureWt * (1 - melt);
    const value = netWt * rate;
    const titleMap = { old_gold: 'OLD GOLD PURCHASE', gold_exchange: 'GOLD EXCHANGE', silver_exchange: 'SILVER EXCHANGE' };
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
    message.success(`${titleMap[activeModal]} receipt printed!`);
    closeModal();
  };

  // ── Submit additional bills ───────────────────────────────────────────────
  const onSubmitAdditional = (values) => {
    const titleMap = {
      advance_receipt: 'ADVANCE RECEIPT', advance_adj: 'ADVANCE ADJUSTMENT',
      gift_voucher: 'GIFT VOUCHER', scheme_receipt: 'SCHEME INSTALLMENT RECEIPT',
      scheme_refund: 'SCHEME REFUND', scheme_maturity: 'SCHEME MATURITY ADJUSTMENT',
    };
    const title = titleMap[activeModal] || 'RECEIPT';
    let rows = `<div class="row"><span class="label">Customer Name</span><span class="val">${values.customer_name || 'Walk-in'}</span></div>
      <div class="row"><span class="label">Mobile</span><span class="val">${values.mobile || '-'}</span></div>
      <div class="dline"></div>`;

    if (activeModal === 'advance_receipt') {
      rows += `<div class="row"><span class="label">Purpose</span><span class="val">${values.purpose || 'Advance'}</span></div>
        <div class="row"><span class="label">Payment Mode</span><span class="val">${values.payment_mode || 'Cash'}</span></div>
        <div class="row"><span class="label">Reference</span><span class="val">${values.reference || '-'}</span></div>`;
    } else if (activeModal === 'advance_adj') {
      rows += `<div class="row"><span class="label">Invoice No</span><span class="val">${values.invoice_no || '-'}</span></div>
        <div class="row"><span class="label">Advance Collected On</span><span class="val">${values.advance_date || '-'}</span></div>
        <div class="row"><span class="label">Bill Amount</span><span class="val">₹${parseFloat(values.bill_amount || 0).toLocaleString('en-IN')}</span></div>
        <div class="row"><span class="label">Advance Adjusted</span><span class="val">₹${parseFloat(values.advance_amount || 0).toLocaleString('en-IN')}</span></div>`;
    } else if (activeModal === 'gift_voucher') {
      rows += `<div class="row"><span class="label">Voucher Code</span><span class="val">${values.voucher_code || 'GV-' + Date.now().toString().slice(-6)}</span></div>
        <div class="row"><span class="label">Valid Till</span><span class="val">${values.valid_till?.format('DD-MMM-YYYY') || 'No expiry'}</span></div>
        <div class="row"><span class="label">Payment Mode</span><span class="val">${values.payment_mode || 'Cash'}</span></div>`;
    } else if (activeModal === 'scheme_receipt') {
      rows += `<div class="row"><span class="label">Member No</span><span class="val">${values.member_no || '-'}</span></div>
        <div class="row"><span class="label">Scheme Name</span><span class="val">${values.scheme_name || '-'}</span></div>
        <div class="row"><span class="label">Installment No</span><span class="val">${values.installment_no || '-'}</span></div>
        <div class="row"><span class="label">Payment Mode</span><span class="val">${values.payment_mode || 'Cash'}</span></div>`;
    } else if (activeModal === 'scheme_refund') {
      rows += `<div class="row"><span class="label">Member No</span><span class="val">${values.member_no || '-'}</span></div>
        <div class="row"><span class="label">Reason</span><span class="val">${values.reason || '-'}</span></div>
        <div class="row"><span class="label">Refund Mode</span><span class="val">${values.payment_mode || 'Cash'}</span></div>`;
    } else if (activeModal === 'scheme_maturity') {
      rows += `<div class="row"><span class="label">Member No</span><span class="val">${values.member_no || '-'}</span></div>
        <div class="row"><span class="label">Sale Invoice</span><span class="val">${values.invoice_no || '-'}</span></div>
        <div class="row"><span class="label">Bill Amount</span><span class="val">₹${parseFloat(values.bill_amount || 0).toLocaleString('en-IN')}</span></div>
        <div class="row"><span class="label">Scheme Amount Adjusted</span><span class="val">₹${parseFloat(values.scheme_amount || 0).toLocaleString('en-IN')}</span></div>`;
    }

    const net = parseFloat(values.amount || values.advance_amount || values.voucher_amount || values.scheme_amount || 0);
    const footer = `<div class="row"><span class="total">AMOUNT: ₹${net.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span></div>`;
    printBill(title, rows, footer);
    message.success(`${title} printed!`);
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
      {/* Advance Receipt */}
      <Modal title="💰 Advance Receipt" open={activeModal==='advance_receipt'} onCancel={closeModal} footer={null} width={480} destroyOnClose>
        <Form form={form} layout="vertical" onFinish={onSubmitAdditional}>
          <Row gutter={12}><Col xs={12}><Form.Item name="customer_name" label="Customer Name" rules={[{required:true}]}><Input /></Form.Item></Col>
            <Col xs={12}><Form.Item name="mobile" label="Mobile"><Input /></Form.Item></Col></Row>
          <Form.Item name="purpose" label="Purpose / Against"><Input placeholder="e.g. Against Order No. ORD-001234" /></Form.Item>
          <Row gutter={12}><Col xs={12}><Form.Item name="amount" label="Amount (₹)" rules={[{required:true}]}><InputNumber style={{width:'100%'}} min={1} formatter={v=>`₹ ${v}`} /></Form.Item></Col>
            <Col xs={12}><Form.Item name="payment_mode" label="Payment Mode" initialValue="Cash"><Select><Option value="Cash">Cash</Option><Option value="UPI">UPI</Option><Option value="Card">Card</Option><Option value="Cheque">Cheque</Option></Select></Form.Item></Col></Row>
          <Form.Item name="reference" label="Reference / UTR"><Input placeholder="UTR / Cheque No" /></Form.Item>
          <Button type="primary" htmlType="submit" block size="large" style={{background:'#52c41a',borderColor:'#52c41a',fontWeight:700}}><PrinterOutlined /> Print Advance Receipt</Button>
        </Form>
      </Modal>

      {/* Advance Adjustment */}
      <Modal title="📋 Advance Adjustment" open={activeModal==='advance_adj'} onCancel={closeModal} footer={null} width={480} destroyOnClose>
        <Form form={form} layout="vertical" onFinish={onSubmitAdditional}>
          <Row gutter={12}><Col xs={12}><Form.Item name="customer_name" label="Customer Name" rules={[{required:true}]}><Input /></Form.Item></Col>
            <Col xs={12}><Form.Item name="mobile" label="Mobile"><Input /></Form.Item></Col></Row>
          <Row gutter={12}><Col xs={12}><Form.Item name="invoice_no" label="Sale Invoice No"><Input /></Form.Item></Col>
            <Col xs={12}><Form.Item name="advance_date" label="Advance Collected On"><Input placeholder="DD-MMM-YYYY" /></Form.Item></Col></Row>
          <Row gutter={12}><Col xs={12}><Form.Item name="bill_amount" label="Bill Amount (₹)"><InputNumber style={{width:'100%'}} min={0} formatter={v=>`₹ ${v}`} /></Form.Item></Col>
            <Col xs={12}><Form.Item name="advance_amount" label="Advance Adjusted (₹)" rules={[{required:true}]}><InputNumber style={{width:'100%'}} min={1} formatter={v=>`₹ ${v}`} /></Form.Item></Col></Row>
          <Button type="primary" htmlType="submit" block size="large" style={{background:'#1890ff',borderColor:'#1890ff',fontWeight:700}}><PrinterOutlined /> Print Adjustment Receipt</Button>
        </Form>
      </Modal>

      {/* Gift Voucher */}
      <Modal title="🎁 Gift Voucher Bill" open={activeModal==='gift_voucher'} onCancel={closeModal} footer={null} width={480} destroyOnClose>
        <Form form={form} layout="vertical" onFinish={onSubmitAdditional}>
          <Row gutter={12}><Col xs={12}><Form.Item name="customer_name" label="Issued To" rules={[{required:true}]}><Input /></Form.Item></Col>
            <Col xs={12}><Form.Item name="mobile" label="Mobile"><Input /></Form.Item></Col></Row>
          <Row gutter={12}><Col xs={12}><Form.Item name="voucher_amount" label="Voucher Amount (₹)" rules={[{required:true}]}><InputNumber style={{width:'100%'}} min={1} formatter={v=>`₹ ${v}`} /></Form.Item></Col>
            <Col xs={12}><Form.Item name="valid_till" label="Valid Till"><DatePicker style={{width:'100%'}} disabledDate={d=>d&&d<dayjs()} /></Form.Item></Col></Row>
          <Row gutter={12}><Col xs={12}><Form.Item name="payment_mode" label="Payment Mode" initialValue="Cash"><Select><Option value="Cash">Cash</Option><Option value="UPI">UPI</Option><Option value="Card">Card</Option></Select></Form.Item></Col>
            <Col xs={12}><Form.Item name="voucher_code" label="Voucher Code"><Input placeholder="Auto-generated if blank" /></Form.Item></Col></Row>
          <Button type="primary" htmlType="submit" block size="large" style={{background:'#eb2f96',borderColor:'#eb2f96',fontWeight:700}}><PrinterOutlined /> Issue Gift Voucher</Button>
        </Form>
      </Modal>

      {/* Scheme Receipt */}
      <Modal title="🪙 Scheme Installment Receipt" open={activeModal==='scheme_receipt'} onCancel={closeModal} footer={null} width={480} destroyOnClose>
        <Form form={form} layout="vertical" onFinish={onSubmitAdditional}>
          <Row gutter={12}><Col xs={12}><Form.Item name="customer_name" label="Member Name" rules={[{required:true}]}><Input /></Form.Item></Col>
            <Col xs={12}><Form.Item name="mobile" label="Mobile"><Input /></Form.Item></Col></Row>
          <Row gutter={12}><Col xs={12}><Form.Item name="member_no" label="Member Number"><Input /></Form.Item></Col>
            <Col xs={12}><Form.Item name="scheme_name" label="Scheme Name"><Input /></Form.Item></Col></Row>
          <Row gutter={12}><Col xs={8}><Form.Item name="installment_no" label="Installment #"><InputNumber style={{width:'100%'}} min={1} /></Form.Item></Col>
            <Col xs={8}><Form.Item name="amount" label="Amount (₹)" rules={[{required:true}]}><InputNumber style={{width:'100%'}} min={1} formatter={v=>`₹ ${v}`} /></Form.Item></Col>
            <Col xs={8}><Form.Item name="payment_mode" label="Mode" initialValue="Cash"><Select><Option value="Cash">Cash</Option><Option value="UPI">UPI</Option><Option value="Cheque">Cheque</Option></Select></Form.Item></Col></Row>
          <Button type="primary" htmlType="submit" block size="large" style={{background:'#B8860B',borderColor:'#B8860B',fontWeight:700}}><PrinterOutlined /> Print Scheme Receipt</Button>
        </Form>
      </Modal>

      {/* Scheme Refund */}
      <Modal title="↩️ Scheme Refund" open={activeModal==='scheme_refund'} onCancel={closeModal} footer={null} width={480} destroyOnClose>
        <Form form={form} layout="vertical" onFinish={onSubmitAdditional}>
          <Row gutter={12}><Col xs={12}><Form.Item name="customer_name" label="Member Name" rules={[{required:true}]}><Input /></Form.Item></Col>
            <Col xs={12}><Form.Item name="mobile" label="Mobile"><Input /></Form.Item></Col></Row>
          <Row gutter={12}><Col xs={12}><Form.Item name="member_no" label="Member Number"><Input /></Form.Item></Col>
            <Col xs={12}><Form.Item name="amount" label="Refund Amount (₹)" rules={[{required:true}]}><InputNumber style={{width:'100%'}} min={1} formatter={v=>`₹ ${v}`} /></Form.Item></Col></Row>
          <Form.Item name="reason" label="Refund Reason"><Input.TextArea rows={2} /></Form.Item>
          <Row gutter={12}><Col xs={12}><Form.Item name="payment_mode" label="Refund Mode" initialValue="Cash"><Select><Option value="Cash">Cash</Option><Option value="UPI">UPI</Option><Option value="Cheque">Cheque</Option><Option value="NEFT">NEFT</Option></Select></Form.Item></Col></Row>
          <Button type="primary" htmlType="submit" block size="large" style={{background:'#ff4d4f',borderColor:'#ff4d4f',fontWeight:700}}><PrinterOutlined /> Print Refund Receipt</Button>
        </Form>
      </Modal>

      {/* Scheme Maturity Adjustment */}
      <Modal title="✅ Scheme Maturity Adjustment" open={activeModal==='scheme_maturity'} onCancel={closeModal} footer={null} width={480} destroyOnClose>
        <Alert message="Use this when adjusting maturity amount against a sale bill." type="info" showIcon style={{marginBottom:12,fontSize:11}} />
        <Form form={form} layout="vertical" onFinish={onSubmitAdditional}>
          <Row gutter={12}><Col xs={12}><Form.Item name="customer_name" label="Member Name" rules={[{required:true}]}><Input /></Form.Item></Col>
            <Col xs={12}><Form.Item name="member_no" label="Member Number"><Input /></Form.Item></Col></Row>
          <Row gutter={12}><Col xs={12}><Form.Item name="invoice_no" label="Sale Invoice No"><Input /></Form.Item></Col>
            <Col xs={12}><Form.Item name="bill_amount" label="Bill Amount (₹)"><InputNumber style={{width:'100%'}} min={0} formatter={v=>`₹ ${v}`} /></Form.Item></Col></Row>
          <Form.Item name="scheme_amount" label="Scheme Amount Adjusted (₹)" rules={[{required:true}]}><InputNumber style={{width:'100%'}} min={1} formatter={v=>`₹ ${v}`} /></Form.Item>
          <Button type="primary" htmlType="submit" block size="large" style={{background:'#13c2c2',borderColor:'#13c2c2',fontWeight:700}}><PrinterOutlined /> Print Maturity Adjustment Receipt</Button>
        </Form>
      </Modal>

      <PageTour steps={tourSteps} />
    </div>
  );
}
