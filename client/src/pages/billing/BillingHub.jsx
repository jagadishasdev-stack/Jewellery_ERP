/**
 * Billing Hub — Starting screen for all billing operations
 * Retail Sales | Wholesale Sales | Tax Invoice | Estimate/Quotation | Order Booking
 */
import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Row, Col, Card, Typography, Tag, Space, Button, Modal, Form,
  Input, InputNumber, Select, DatePicker, message, Divider, Table, Statistic, Alert } from 'antd';
import {
  ShoppingCartOutlined, FileTextOutlined, CalculatorOutlined,
  BookOutlined, TeamOutlined, PrinterOutlined, PlusOutlined,
  GoldOutlined, UserOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { salesApi, customersApi, ornamentsApi, masterApi } from '../../api/modules';import { formatCurrency } from '../../utils/calculations';
import { useAuthStore } from '../../store/authStore';
import { useDataMode } from '../../contexts/DataModeContext';
import { printHTML } from '../../utils/printService';
import { printFromInvoiceStudio } from '../../utils/thermalReceipt';
import api from '../../api/axios';
import PageTour from '../../components/PageTour';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { Option } = Select;

const BILL_TYPES = [
  {
    key: 'retail',
    icon: <ShoppingCartOutlined style={{ fontSize: 32, color: '#B8860B' }} />,
    title: 'Retail Sales Bill',
    subtitle: 'Walk-in customer sale with barcode scan',
    color: '#B8860B',
    description: 'Standard retail billing with old gold exchange, scheme adjustment, multi-payment',
    badge: 'Most Used',
    badgeColor: 'gold',
    route: '/pos',
  },
  {
    key: 'wholesale',
    icon: <TeamOutlined style={{ fontSize: 32, color: '#1890ff' }} />,
    title: 'Wholesale Sales Bill',
    subtitle: 'Bulk sale to dealers & wholesale customers',
    color: '#1890ff',
    description: 'Dealer billing with credit terms, GST details, quantity pricing',
    badge: 'B2B',
    badgeColor: 'blue',
    route: null, // opens modal
  },
  {
    key: 'tax_invoice',
    icon: <FileTextOutlined style={{ fontSize: 32, color: '#52c41a' }} />,
    title: 'GST Tax Invoice',
    subtitle: 'Formal GST invoice for registered customers',
    color: '#52c41a',
    description: 'Registered business billing with GSTIN, HSN codes, CGST/SGST/IGST split',
    badge: 'GST',
    badgeColor: 'green',
    route: null,
  },
  {
    key: 'estimate',
    icon: <CalculatorOutlined style={{ fontSize: 32, color: '#722ed1' }} />,
    title: 'Estimate / Quotation',
    subtitle: 'Price quote without actual sale',
    color: '#722ed1',
    description: 'Give customer a price estimate. Convert to sale when confirmed.',
    badge: 'Quote',
    badgeColor: 'purple',
    route: null,
  },
  {
    key: 'order',
    icon: <BookOutlined style={{ fontSize: 32, color: '#fa8c16' }} />,
    title: 'Order Booking',
    subtitle: 'Custom order with advance payment',
    color: '#fa8c16',
    description: 'Book custom jewellery order, collect advance, set delivery date',
    badge: 'Custom',
    badgeColor: 'orange',
    route: null,
  },
];

export default function BillingHub() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { isUnofficial } = useDataMode();
  const qc = useQueryClient();
  const [activeModal, setActiveModal] = useState(null);
  const [form] = Form.useForm();

  // ── Walkthrough tour refs ───────────────────────────────────────────────────
  const statsRef = useRef(null);
  const billTypesRef = useRef(null);
  const tourSteps = [
    { title: '1. Today\'s Quick Stats', description: 'A quick look at today\'s bill count, revenue and the cash/UPI split before you start billing.', target: () => statsRef.current },
    { title: '2. Choose a Bill Type', description: 'Retail Sales opens the POS screen for walk-in customers. Wholesale and GST Tax Invoice also use POS but preset the Sale/Invoice type. Estimate/Quotation gives a customer a price quote without a sale. Order Booking books a custom order and collects an advance.', target: () => billTypesRef.current },
    { title: '3. Estimate & Order Forms', description: 'Clicking Estimate or Order Booking opens a form — fill in the customer and item details, then print a quotation slip or an order booking card with advance payment recorded.' },
    { title: '4. Wholesale & Tax Invoice', description: 'These two simply take you to the same POS billing screen — set Sale Type to Wholesale, or Invoice Type to Tax Invoice, right there in the checkout step.' },
  ];

  const today = dayjs().format('YYYY-MM-DD');

  const { data: dailyReport } = useQuery({
    queryKey: ['daily-hub', today],
    queryFn: () => salesApi.dailyReport(today).then(r => r.data.data),
  });

  const { data: customers } = useQuery({
    queryKey: ['customers-billing'],
    queryFn: () => customersApi.getAll({ limit: 200 }).then(r => r.data.data.items),
  });

  const s = dailyReport?.summary || {};

  const handleBillTypeClick = (bt) => {
    if (bt.route) {
      navigate(bt.route);
    } else {
      setActiveModal(bt.key);
      form.resetFields();
    }
  };

  // ── Estimate / Quotation ─────────────────────────────────────────────────
  const printEstimate = async (values) => {
    const estimateNo = `EST-${Date.now().toString().slice(-6)}`;
    const studioItems = (values.items || []).map((it) => ({
      item_name: it.description, purity: it.purity, gross_weight: it.weight, net_weight: it.weight,
      rate: it.rate, making_charge: it.making,
      amount: (parseFloat(it.weight || 0) * parseFloat(it.rate || 0)) + parseFloat(it.making || 0),
    }));
    const studioData = {
      invoice_no: estimateNo, invoice_date: dayjs().format('DD-MMM-YYYY'), invoice_type: 'Estimate',
      customer_name: values.customer_name || 'Walk-in', customer_mobile: values.mobile,
      items: studioItems, net_payable: values.total_estimate,
    };
    if (await printFromInvoiceStudio('ESTIMATE', studioData)) {
      setActiveModal(null); form.resetFields(); message.success('Estimate printed!');
      return;
    }

    const html = `<!DOCTYPE html><html><head><style>
      body{font-family:Arial,sans-serif;padding:20px;font-size:11pt}
      h2{color:#B8860B;text-align:center}.line{border-top:2px solid #B8860B;margin:10px 0}
      table{width:100%;border-collapse:collapse}th{background:#B8860B;color:#fff;padding:6px}
      td{padding:5px 8px;border-bottom:1px solid #eee}.total{font-weight:bold;font-size:14pt;color:#B8860B}
      .footer{text-align:center;font-size:9pt;color:#888;margin-top:20px}
    </style></head><body>
      <h2>ESTIMATE / QUOTATION</h2>
      <div>Estimate No: <b>EST-${Date.now().toString().slice(-6)}</b> &nbsp; Date: ${dayjs().format('DD-MMM-YYYY')}</div>
      <div class="line"></div>
      <div><b>Customer:</b> ${values.customer_name || 'Walk-in'} &nbsp; <b>Mobile:</b> ${values.mobile || '-'}</div>
      <div class="line"></div>
      <table><thead><tr><th>#</th><th>Item</th><th>Purity</th><th>Wt(g)</th><th>Rate/g</th><th>Making</th><th>Amount</th></tr></thead>
      <tbody>
        ${(values.items || []).map((it, i) => `<tr>
          <td>${i+1}</td><td>${it.description || '-'}</td><td>${it.purity || '-'}</td>
          <td>${it.weight || 0}g</td><td>₹${it.rate || 0}</td><td>₹${it.making || 0}</td>
          <td>₹${((parseFloat(it.weight||0)*parseFloat(it.rate||0))+parseFloat(it.making||0)).toLocaleString('en-IN')}</td>
        </tr>`).join('')}
      </tbody></table>
      <div class="line"></div>
      <div style="text-align:right"><span class="total">Estimated Total: ₹${parseFloat(values.total_estimate||0).toLocaleString('en-IN')}</span></div>
      <p style="color:#888;font-size:9pt">* This is an estimate only. Final price may vary based on actual weight and current gold rate.<br>
      * Valid for: ${values.valid_days || 7} days from today (${dayjs().add(values.valid_days||7,'day').format('DD-MMM-YYYY')})</p>
      <div class="footer">Thank you for visiting us! 💎</div>
    </body></html>`;
    printHTML('regular', html, { windowSize: 'width=700,height=600' });
    setActiveModal(null);
    form.resetFields();
    message.success('Estimate printed!');
  };

  // ── Order Booking ────────────────────────────────────────────────────────
  const orderMutation = useMutation({
    mutationFn: (data) => api.post('/order', data),
    onSuccess: (res) => {
      message.success(`Order ${res.data.data?.Order_Number} booked!`);
      qc.invalidateQueries(['orders']);
      setActiveModal(null);
      form.resetFields();
    },
    onError: () => {
      // Order route may not exist yet — print locally
      const values = form.getFieldsValue();
      printOrderCard(values);
      setActiveModal(null);
    },
  });

  const printOrderCard = async (values) => {
    const orderNo = `ORD-${Date.now().toString().slice(-6)}`;
    const balance = parseFloat(values.estimated_total || 0) - parseFloat(values.advance_amount || 0);
    const studioData = {
      invoice_no: orderNo, invoice_date: dayjs().format('DD-MMM-YYYY'), invoice_type: 'Order Booking',
      customer_name: values.customer_name, customer_mobile: values.mobile,
      items: [{ item_name: values.item_description, gross_weight: values.estimated_weight, amount: values.estimated_total }],
      net_payable: values.estimated_total, amount_paid: values.advance_amount, balance,
      payment_mode: values.advance_mode || 'Cash',
    };
    if (await printFromInvoiceStudio('ORDER_BOOKING', studioData)) {
      message.success('Order card printed!');
      return;
    }

    const html = `<!DOCTYPE html><html><head><style>
      body{font-family:Arial,sans-serif;padding:20px}h2{color:#B8860B;text-align:center}
      .line{border:1px solid #B8860B;margin:8px 0}.row{display:flex;justify-content:space-between;padding:4px 0}
      .label{color:#888;font-size:10pt}.val{font-weight:bold}.footer{text-align:center;margin-top:20px;color:#888}
    </style></head><body>
      <h2>ORDER BOOKING CARD</h2>
      <div style="text-align:center">Order No: <b>${orderNo}</b> | Date: ${dayjs().format('DD-MMM-YYYY')}</div>
      <div class="line"></div>
      <div class="row"><span class="label">Customer</span><span class="val">${values.customer_name}</span></div>
      <div class="row"><span class="label">Mobile</span><span class="val">${values.mobile}</span></div>
      <div class="row"><span class="label">Item Required</span><span class="val">${values.item_description}</span></div>
      <div class="row"><span class="label">Est. Weight</span><span class="val">${values.estimated_weight}g</span></div>
      <div class="row"><span class="label">Delivery Date</span><span class="val">${values.delivery_date?.format('DD-MMM-YYYY') || '-'}</span></div>
      <div class="row"><span class="label">Advance Paid</span><span class="val" style="color:#52c41a">₹${parseFloat(values.advance_amount||0).toLocaleString('en-IN')}</span></div>
      <div class="row"><span class="label">Payment Mode</span><span class="val">${values.advance_mode || 'Cash'}</span></div>
      <div class="row"><span class="label">Est. Total</span><span class="val" style="color:#B8860B">₹${parseFloat(values.estimated_total||0).toLocaleString('en-IN')}</span></div>
      <div class="row"><span class="label">Balance Due on Delivery</span><span class="val" style="color:red">₹${(parseFloat(values.estimated_total||0)-parseFloat(values.advance_amount||0)).toLocaleString('en-IN')}</span></div>
      ${values.notes ? `<div class="row"><span class="label">Notes</span><span class="val">${values.notes}</span></div>` : ''}
      <div class="line"></div>
      <div class="footer">Customer Signature: _______________</div>
    </body></html>`;
    printHTML('regular', html, { windowSize: 'width=600,height=500' });
    message.success('Order card printed!');
  };

  return (
    <div className="page-wrapper">
      <div className="page-header">
        <div>
          <div className="page-header-title">💎 Billing Center</div>
          <div className="page-header-sub">Select bill type — Retail, Wholesale, Tax Invoice, Estimate, or Order Booking</div>
        </div>
      </div>

      {/* Today's Quick Stats */}
      <Row ref={statsRef} gutter={[10, 10]} style={{ marginBottom: 20 }}>
        {[
          { label: "Today's Bills", value: parseInt(s.total_bills || 0), color: '#B8860B' },
          { label: "Today's Revenue", value: parseFloat(s.total_revenue || 0), formatter: formatCurrency, color: '#52c41a' },
          { label: 'Cash', value: parseFloat(dailyReport?.byPaymentMode?.find(p => p.Payment_Mode === 'Cash')?.amount || 0), formatter: formatCurrency, color: '#1890ff' },
          { label: 'UPI', value: parseFloat(dailyReport?.byPaymentMode?.find(p => p.Payment_Mode === 'UPI')?.amount || 0), formatter: formatCurrency, color: '#722ed1' },
        ].map((s, i) => (
          <Col xs={12} sm={6} key={i}>
            <Card bodyStyle={{ padding: '12px 16px' }} style={{ borderRadius: 8, border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.07)', borderTop: `3px solid ${s.color}` }}>
              <Statistic title={<Text style={{ fontSize: 11, color: '#888' }}>{s.label}</Text>}
                value={s.value} formatter={s.formatter ? v => s.formatter(v) : undefined}
                valueStyle={{ color: s.color, fontSize: 18, fontWeight: 700 }} />
            </Card>
          </Col>
        ))}
      </Row>

      {/* Bill Type Cards */}
      <Row ref={billTypesRef} gutter={[16, 16]}>
        {BILL_TYPES.map(bt => (
          <Col xs={24} sm={12} lg={8} key={bt.key}>
            <Card
              hoverable
              onClick={() => handleBillTypeClick(bt)}
              style={{ borderRadius: 12, border: `2px solid ${bt.color}20`, cursor: 'pointer', transition: 'all 0.2s' }}
              bodyStyle={{ padding: 20 }}
            >
              <Space direction="vertical" size={8} style={{ width: '100%' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  {bt.icon}
                  <Tag color={bt.badgeColor} style={{ fontSize: 10 }}>{bt.badge}</Tag>
                </div>
                <div>
                  <Title level={5} style={{ margin: 0, color: bt.color }}>{bt.title}</Title>
                  <Text type="secondary" style={{ fontSize: 12 }}>{bt.subtitle}</Text>
                </div>
                <Text style={{ fontSize: 11, color: '#888' }}>{bt.description}</Text>
                <Button type="primary" block
                  style={{ background: bt.color, borderColor: bt.color, fontWeight: 600 }}>
                  {bt.key === 'retail' ? '🛒 Open POS Billing' :
                   bt.key === 'estimate' ? '📋 Create Estimate' :
                   bt.key === 'order' ? '📦 Book Order' :
                   `Open ${bt.title}`}
                </Button>
              </Space>
            </Card>
          </Col>
        ))}
      </Row>

      {/* ── Estimate Modal ─────────────────────────────────────────────── */}
      <Modal title="📋 Estimate / Quotation" open={activeModal === 'estimate'}
        onCancel={() => { setActiveModal(null); form.resetFields(); }} footer={null} width={620}>
        <Form form={form} layout="vertical" onFinish={printEstimate}>
          <Row gutter={12}>
            <Col xs={12}><Form.Item name="customer_name" label="Customer Name" rules={[{required:true}]}><Input placeholder="Customer name" /></Form.Item></Col>
            <Col xs={12}><Form.Item name="mobile" label="Mobile"><Input placeholder="Mobile" /></Form.Item></Col>
          </Row>
          <Divider>Items</Divider>
          <Form.List name="items" initialValue={[{}]}>
            {(fields, { add, remove }) => (
              <div>
                {fields.map((field, idx) => (
                  <Row gutter={8} key={field.key} style={{ marginBottom: 8 }}>
                    <Col xs={8}><Form.Item {...field} name={[field.name,'description']} label={idx===0?"Description":""} noStyle><Input placeholder="Item description" /></Form.Item></Col>
                    <Col xs={4}><Form.Item {...field} name={[field.name,'purity']} noStyle><Select placeholder="Purity" size="small"><Option value="22K">22K</Option><Option value="18K">18K</Option><Option value="24K">24K</Option></Select></Form.Item></Col>
                    <Col xs={3}><Form.Item {...field} name={[field.name,'weight']} noStyle><InputNumber placeholder="Wt(g)" size="small" min={0} step={0.001} style={{width:'100%'}} /></Form.Item></Col>
                    <Col xs={4}><Form.Item {...field} name={[field.name,'rate']} noStyle><InputNumber placeholder="Rate/g" size="small" min={0} style={{width:'100%'}} /></Form.Item></Col>
                    <Col xs={4}><Form.Item {...field} name={[field.name,'making']} noStyle><InputNumber placeholder="Making" size="small" min={0} style={{width:'100%'}} /></Form.Item></Col>
                    <Col xs={1}><Button size="small" danger onClick={() => remove(field.name)} type="text">×</Button></Col>
                  </Row>
                ))}
                <Button size="small" icon={<PlusOutlined />} onClick={() => add({})} style={{marginBottom:12}}>Add Item</Button>
              </div>
            )}
          </Form.List>
          <Row gutter={12}>
            <Col xs={12}><Form.Item name="total_estimate" label="Total Estimate (₹)"><InputNumber style={{width:'100%'}} min={0} formatter={v=>`₹ ${v}`} /></Form.Item></Col>
            <Col xs={12}><Form.Item name="valid_days" label="Valid for (days)" initialValue={7}><InputNumber style={{width:'100%'}} min={1} max={90} /></Form.Item></Col>
          </Row>
          <Button type="primary" htmlType="submit" block size="large"
            style={{background:'#722ed1',borderColor:'#722ed1',fontWeight:700}}>
            <PrinterOutlined /> Print Estimate / Quotation
          </Button>
        </Form>
      </Modal>

      {/* ── Order Booking Modal ────────────────────────────────────────── */}
      <Modal title="📦 Order Booking" open={activeModal === 'order'}
        onCancel={() => { setActiveModal(null); form.resetFields(); }} footer={null} width={560}>
        <Form form={form} layout="vertical" onFinish={(v) => { form.validateFields().then(printOrderCard); }}>
          <Row gutter={12}>
            <Col xs={12}><Form.Item name="customer_name" label="Customer Name" rules={[{required:true}]}><Input /></Form.Item></Col>
            <Col xs={12}><Form.Item name="mobile" label="Mobile" rules={[{required:true}]}><Input /></Form.Item></Col>
          </Row>
          <Form.Item name="item_description" label="Item Required (Description)" rules={[{required:true}]}>
            <Input.TextArea rows={2} placeholder="e.g. Gold Necklace 22K, Traditional Design, approx 25g, with stone" />
          </Form.Item>
          <Row gutter={12}>
            <Col xs={8}><Form.Item name="estimated_weight" label="Est. Weight (g)"><InputNumber style={{width:'100%'}} step={0.1} /></Form.Item></Col>
            <Col xs={8}><Form.Item name="estimated_total" label="Est. Amount (₹)"><InputNumber style={{width:'100%'}} min={0} formatter={v=>`₹ ${v}`} /></Form.Item></Col>
            <Col xs={8}><Form.Item name="delivery_date" label="Delivery Date"><DatePicker style={{width:'100%'}} disabledDate={d=>d && d<dayjs()} /></Form.Item></Col>
          </Row>
          <Row gutter={12}>
            <Col xs={12}><Form.Item name="advance_amount" label="Advance Amount (₹)" rules={[{required:true}]}><InputNumber style={{width:'100%'}} min={0} formatter={v=>`₹ ${v}`} /></Form.Item></Col>
            <Col xs={12}><Form.Item name="advance_mode" label={isUnofficial ? 'Payment Mode (Unofficial — Cash only)' : 'Payment Mode'} initialValue="Cash">
              <Select disabled={isUnofficial}>
                <Option value="Cash">Cash</Option>
                {!isUnofficial && <Option value="UPI">UPI</Option>}
                {!isUnofficial && <Option value="Card">Card</Option>}
              </Select>
            </Form.Item></Col>
          </Row>
          <Form.Item name="notes" label="Special Instructions"><Input.TextArea rows={2} /></Form.Item>
          <Button type="primary" htmlType="submit" block size="large"
            style={{background:'#fa8c16',borderColor:'#fa8c16',fontWeight:700}}>
            <PrinterOutlined /> Save Order & Print Card
          </Button>
        </Form>
      </Modal>

      {/* ── Wholesale / Tax Invoice — redirect to POS with mode ────────── */}
      <Modal title={activeModal === 'wholesale' ? '🏭 Wholesale Sales Bill' : '🧾 GST Tax Invoice'}
        open={activeModal === 'wholesale' || activeModal === 'tax_invoice'}
        onCancel={() => setActiveModal(null)}
        footer={null} width={400}>
        <Space direction="vertical" style={{ width: '100%' }} size={12}>
          <Alert
            message={activeModal === 'wholesale' ? 'Wholesale billing uses the same POS screen with Sale Type set to Wholesale.' : 'GST Tax Invoice uses the same POS screen with Invoice Type set to Tax Invoice.'}
            type="info" showIcon
          />
          <Button type="primary" block size="large"
            style={{ background: activeModal === 'wholesale' ? '#1890ff' : '#52c41a', borderColor: activeModal === 'wholesale' ? '#1890ff' : '#52c41a', fontWeight: 700 }}
            onClick={() => { setActiveModal(null); navigate('/pos'); }}>
            Open POS Billing → Set {activeModal === 'wholesale' ? 'Wholesale' : 'Tax Invoice'} in Checkout
          </Button>
          <Text type="secondary" style={{ fontSize: 11 }}>
            In the checkout modal, you can select Sale Type (Retail/Wholesale) and Invoice Type (Tax Invoice/Cash Memo).
          </Text>
        </Space>
      </Modal>

      <PageTour steps={tourSteps} />
    </div>
  );
}
