import React, { useState, useRef } from 'react';
import {
  Table, Button, Card, Typography, Tag, Space, Modal, Form,
  Input, InputNumber, Select, DatePicker, Row, Col, Divider,
  message, Statistic,
} from 'antd';
import { PlusOutlined, ShoppingCartOutlined, CheckOutlined, DollarOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { purchaseApi, karigarApi, masterApi } from '../../api/modules';
import { formatCurrency } from '../../utils/calculations';
import { useGoldRate } from '../../hooks/useGoldRate';
import PageTour from '../../components/PageTour';
import dayjs from 'dayjs';
import { useMetalTypes } from '../../hooks/useMetalTypes';
import { useActionShortcuts } from '../../hooks/useActionShortcuts';
import { useF2Lookup } from '../../hooks/useF2Lookup';

const { Title, Text } = Typography;
const { Option } = Select;
const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

export default function PurchasePage() {
  const [createModal, setCreateModal] = useState(false);
  const [payModal, setPayModal] = useState(null); // purchase row being paid, or null
  const [items, setItems] = useState([{ id: 1 }]);
  const [form] = Form.useForm();
  const [payForm] = Form.useForm();
  const { goldRate } = useGoldRate();
  const { metalTypes } = useMetalTypes();
  const qc = useQueryClient();

  // ── Walkthrough tour refs ───────────────────────────────────────────────────
  const newBtnRef = useRef(null);
  const tableRef = useRef(null);
  const tourSteps = [
    { title: '1. Purchase History', description: 'Every stock purchase entry made from suppliers is listed here — with amount, payment status, and current approval status.', target: () => tableRef.current },
    { title: '2. New Purchase Entry', description: 'Click here to record fresh stock received from a supplier — enter item details and it is added straight into inventory.', target: () => newBtnRef.current },
    { title: '3. Approve Draft Purchases', description: 'Purchases saved as Draft show an Approve button in the Actions column — click it once you\'ve verified the entry to finalise it.' },
  ];

  const { data: purchases, isLoading } = useQuery({
    queryKey: ['purchases'],
    queryFn: () => purchaseApi.getAll().then(r => r.data.data.items),
  });

  const { data: suppliers } = useQuery({
    queryKey: ['vendors-supplier'],
    queryFn: () => karigarApi.getVendors({ type: 'Supplier' }).then(r => r.data.data),
  });

  const { data: itemTypes } = useQuery({
    queryKey: ['item-types'],
    queryFn: () => masterApi.getItemTypes().then(r => r.data.data),
  });

  const { data: purities } = useQuery({
    queryKey: ['purities'],
    queryFn: () => masterApi.getPurities().then(r => r.data.data),
  });

  const createMutation = useMutation({
    mutationFn: (data) => purchaseApi.create(data),
    onSuccess: () => {
      message.success('Purchase entry created & stock added to inventory!');
      qc.invalidateQueries(['purchases']);
      qc.invalidateQueries(['ornaments']);
      setCreateModal(false);
      form.resetFields();
      setItems([{ id: 1 }]);
    },
    onError: (err) => message.error(err.response?.data?.message || 'Failed.'),
  });

  const approveMutation = useMutation({
    mutationFn: (id) => purchaseApi.approve(id),
    onSuccess: () => { message.success('Purchase approved.'); qc.invalidateQueries(['purchases']); },
  });

  // Status has declared 'Received' since this table was created (Draft,
  // Approved, Received, Cancelled) but nothing ever set it — an Approved
  // purchase had no way to record its goods actually arriving. Needed for
  // Ready Order Purchase's QC gate, but real and useful on its own too.
  const receiveMutation = useMutation({
    mutationFn: (id) => purchaseApi.receive(id),
    onSuccess: () => { message.success('Purchase marked Received.'); qc.invalidateQueries(['purchases']); },
    onError: (err) => message.error(err.response?.data?.message || 'Failed to mark received.'),
  });

  // There was no way anywhere in the app to ever pay down a purchase's
  // balance — Supplier Payable only ever grew. This + the modal below is
  // the missing UI for the new POST /purchase/:id/pay-supplier route.
  const paySupplierMutation = useMutation({
    mutationFn: ({ id, ...data }) => purchaseApi.paySupplier(id, data),
    onSuccess: () => {
      message.success('Payment recorded.');
      qc.invalidateQueries(['purchases']);
      setPayModal(null);
      payForm.resetFields();
    },
    onError: (err) => message.error(err.response?.data?.message || 'Failed to record payment.'),
  });

  const closeCreateModal = () => { setCreateModal(false); form.resetFields(); setItems([{ id: 1 }]); };

  const supplierLookup = useF2Lookup();
  useActionShortcuts({
    onNew: () => setCreateModal(true),
    onSave: () => createModal && form.submit(),
    onCancel: () => createModal && closeCreateModal(),
  });

  const statusColor = { Draft: 'default', Approved: 'blue', Received: 'green', Cancelled: 'red' };

  const columns = [
    { title: 'Purchase #', dataIndex: 'Purchase_Number', render: v => <Text code>{v}</Text> },
    { title: 'Date', dataIndex: 'Purchase_Date', render: v => dayjs(v).format('DD-MMM-YYYY') },
    { title: 'Supplier', dataIndex: 'Supplier_Name_Resolved', render: v => v || '-' },
    { title: 'Total Amount', dataIndex: 'Total_Amount', render: v => <Text strong style={{ color: '#B8860B' }}>{formatCurrency(v)}</Text> },
    { title: 'Balance Due', dataIndex: 'Balance_Amount', render: v => parseFloat(v) > 0 ? <Text type="danger">{formatCurrency(v)}</Text> : '-' },
    { title: 'Payment', dataIndex: 'Payment_Status', render: v => <Tag color={v === 'Paid' ? 'green' : 'orange'}>{v}</Tag> },
    { title: 'Status', dataIndex: 'Status', render: v => <Tag color={statusColor[v]}>{v}</Tag> },
    {
      title: 'Actions',
      render: (_, r) => (
        <Space>
          {r.Status === 'Draft' && (
            <Button size="small" type="primary" icon={<CheckOutlined />}
              style={{ background: '#52c41a', borderColor: '#52c41a' }}
              loading={approveMutation.isPending}
              onClick={() => approveMutation.mutate(r.Purchase_ID)}>
              Approve
            </Button>
          )}
          {r.Status === 'Approved' && (
            <Button size="small" icon={<CheckOutlined />}
              loading={receiveMutation.isPending}
              onClick={() => receiveMutation.mutate(r.Purchase_ID)}>
              Mark Received
            </Button>
          )}
          {['Partial', 'Pending'].includes(r.Payment_Status) && (
            <Button size="small" icon={<DollarOutlined />} onClick={() => setPayModal(r)}>
              Pay Supplier
            </Button>
          )}
        </Space>
      ),
    },
  ];

  const addItem = () => setItems(prev => [...prev, { id: Date.now() }]);
  const removeItem = (id) => setItems(prev => prev.filter(i => i.id !== id));

  // GST was never captured anywhere in this form — Subtotal_Amount was
  // always set equal to Total_Amount (0 tax), even though purchase.js's
  // accounting posting has fully supported Input CGST/SGST/IGST since
  // the COGS batch. The backend just never received a GST_Amount to act
  // on. computeTotals() is called from a Form.Item shouldUpdate render
  // prop below, so the on-screen total stays live on every keystroke.
  const computeTotals = () => {
    const subtotal = items.reduce((s, item, idx) => {
      const gross = parseFloat(form.getFieldValue(`gross_${idx}`) || 0);
      const stone = parseFloat(form.getFieldValue(`stone_${idx}`) || 0);
      const gRate = parseFloat(form.getFieldValue(`gold_rate_${idx}`) || goldRate || 0);
      const making = parseFloat(form.getFieldValue(`making_${idx}`) || 0);
      return s + (gross - stone) * gRate + making;
    }, 0);
    const gstPercent = parseFloat(form.getFieldValue('GST_Percentage')) || 0;
    const gstAmount = round2(subtotal * gstPercent / 100);
    return { subtotal: round2(subtotal), gstAmount, total: round2(subtotal + gstAmount) };
  };

  const onFinish = (values) => {
    const lineItems = items.map((_, idx) => {
      const gross = parseFloat(values[`gross_${idx}`] || 0);
      const stone = parseFloat(values[`stone_${idx}`] || 0);
      const gRate = parseFloat(values[`gold_rate_${idx}`] || goldRate);
      const making = parseFloat(values[`making_${idx}`] || 0);
      const purchaseRate = (gross - stone) * gRate + making;
      return {
        Type_ID: values[`type_${idx}`],
        Purity_ID: values[`purity_${idx}`],
        Metal_Type: values[`metal_${idx}`] || 'Gold',
        Purity_Code: values[`purity_code_${idx}`] || '',
        Item_Description: values[`desc_${idx}`] || '',
        Quantity: 1,
        Gross_Weight: gross,
        Stone_Weight: stone,
        Gold_Rate: gRate,
        Making_Charge: making,
        Purchase_Rate: purchaseRate,
        Total_Line_Value: purchaseRate,
        Create_Inventory: true,
      };
    });

    const subtotal = lineItems.reduce((s, i) => s + i.Purchase_Rate, 0);
    const gstAmount = round2(subtotal * (parseFloat(values.GST_Percentage) || 0) / 100);

    createMutation.mutate({
      Supplier_ID: values.Supplier_ID || null,
      Branch_ID: values.Branch_ID,
      Purchase_Type: values.Purchase_Type || 'Stock',
      Purchase_Date: values.Purchase_Date?.toISOString() || new Date().toISOString(),
      Supplier_Invoice_No: values.Supplier_Invoice_No,
      Subtotal_Amount: round2(subtotal),
      GST_Amount: gstAmount,
      Total_Amount: round2(subtotal + gstAmount),
      Payment_Status: 'Pending',
      Notes: values.Notes,
      items: lineItems,
    });
  };

  return (
    <div className="page-wrapper">
      <div className="page-header">
        <Title level={4} style={{ margin: 0 }}>
          <Space><ShoppingCartOutlined style={{ color: '#B8860B' }} />Purchase Management</Space>
        </Title>
        <Button ref={newBtnRef} type="primary" icon={<PlusOutlined />}
          style={{ background: '#B8860B', borderColor: '#B8860B' }}
          onClick={() => setCreateModal(true)}>
          New Purchase Entry
        </Button>
      </div>

      <div ref={tableRef}>
      <Card style={{ borderRadius: 8, border: 'none' }} bodyStyle={{ padding: 0 }}>
        <Table
            scroll={{ x: "max-content" }} columns={columns} dataSource={purchases || []} loading={isLoading}
          rowKey="Purchase_ID" size="small" pagination={{ pageSize: 20 }} />
      </Card>
      </div>

      {/* Create Purchase Modal */}
      <Modal
        title="New Purchase Entry — Stock Received from Supplier"
        open={createModal}
        onCancel={closeCreateModal}
        footer={null}
        width={800}
      >
        <Form form={form} layout="vertical" onFinish={onFinish}>
          <Row gutter={16}>
            <Col xs={12}>
              <Form.Item name="Supplier_ID" label="Supplier">
                <Select allowClear placeholder="Select supplier (F2 for full list)" showSearch optionFilterProp="children"
                  open={supplierLookup.open} onDropdownVisibleChange={supplierLookup.onOpenChange} onKeyDown={supplierLookup.onKeyDown}>
                  {(suppliers || []).map(s => <Option key={s.Vendor_ID} value={s.Vendor_ID}>{s.Vendor_Name}</Option>)}
                </Select>
              </Form.Item>
            </Col>
            <Col xs={12}>
              <Form.Item name="Purchase_Date" label="Purchase Date" initialValue={dayjs()}>
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col xs={12}>
              <Form.Item name="Supplier_Invoice_No" label="Supplier Invoice No">
                <Input placeholder="Supplier's bill number" />
              </Form.Item>
            </Col>
            <Col xs={12}>
              <Form.Item name="Purchase_Type" label="Type" initialValue="Stock">
                <Select>
                  <Option value="Stock">Stock Purchase</Option>
                  <Option value="Consignment">Consignment</Option>
                  <Option value="Old Gold">Old Gold Purchase</Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>

          <Divider>Items Received</Divider>

          {items.map((item, idx) => (
            <Card key={item.id} size="small" style={{ borderRadius: 6, marginBottom: 12, background: '#fafafa' }}
              extra={items.length > 1 && <Button size="small" danger onClick={() => removeItem(item.id)}>Remove</Button>}>
              <Row gutter={12}>
                <Col xs={5}>
                  <Form.Item name={`metal_${idx}`} label="Metal" initialValue="Gold" rules={[{ required: true, message: 'Required' }]}>
                    <Select size="small" onChange={() => form.setFieldValue(`purity_${idx}`, undefined)}>
                      {metalTypes.map(m => <Option key={m} value={m}>{m}</Option>)}
                    </Select>
                  </Form.Item>
                </Col>
                <Col xs={5}>
                  <Form.Item name={`type_${idx}`} label="Item Type">
                    <Select size="small" placeholder="Type">
                      {(itemTypes || []).map(t => <Option key={t.Type_ID} value={t.Type_ID}>{t.Type_Name}</Option>)}
                    </Select>
                  </Form.Item>
                </Col>
                <Col xs={5}>
                  {/* Purity narrows to the selected Metal — hidden for
                      Diamond, which has no purity concept. */}
                  <Form.Item shouldUpdate={(prev, cur) => prev[`metal_${idx}`] !== cur[`metal_${idx}`]} noStyle>
                    {() => {
                      const m = form.getFieldValue(`metal_${idx}`);
                      if (m === 'Diamond') return null;
                      const filtered = (purities || []).filter(p => !m || p.Metal_Type === m);
                      return (
                        <Form.Item name={`purity_${idx}`} label="Purity">
                          <Select size="small">
                            {filtered.map(p => <Option key={p.Purity_ID} value={p.Purity_ID}>{p.Purity_Code}</Option>)}
                          </Select>
                        </Form.Item>
                      );
                    }}
                  </Form.Item>
                </Col>
                <Col xs={4}>
                  <Form.Item name={`gross_${idx}`} label="Gross Wt(g)" rules={[{ required: true }]}>
                    <InputNumber size="small" style={{ width: '100%' }} step={0.001} min={0.001} />
                  </Form.Item>
                </Col>
                <Col xs={4}>
                  <Form.Item name={`stone_${idx}`} label="Stone Wt(g)" initialValue={0}>
                    <InputNumber size="small" style={{ width: '100%' }} step={0.001} min={0} />
                  </Form.Item>
                </Col>
                <Col xs={5}>
                  <Form.Item name={`gold_rate_${idx}`} label={`Rate(₹/g)`} initialValue={goldRate}>
                    <InputNumber size="small" style={{ width: '100%' }} min={0} />
                  </Form.Item>
                </Col>
              </Row>
              <Row gutter={12}>
                <Col xs={5}>
                  <Form.Item name={`making_${idx}`} label="Making(₹)" initialValue={0}>
                    <InputNumber size="small" style={{ width: '100%' }} min={0} />
                  </Form.Item>
                </Col>
                <Col xs={19}>
                  <Form.Item name={`desc_${idx}`} label="Description">
                    <Input size="small" placeholder="e.g. Gold Necklace Traditional Design" />
                  </Form.Item>
                </Col>
              </Row>
            </Card>
          ))}

          <Button block icon={<PlusOutlined />} onClick={addItem} style={{ marginBottom: 16 }}>
            Add Another Item
          </Button>

          <Row gutter={16}>
            <Col xs={8}>
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
            <Col xs={16}>
              <Form.Item shouldUpdate noStyle>
                {() => {
                  const { subtotal, gstAmount, total } = computeTotals();
                  return (
                    <div style={{ display: 'flex', gap: 24, alignItems: 'center', height: '100%', paddingTop: 30, justifyContent: 'flex-end' }}>
                      <Text type="secondary">Subtotal: <Text strong>{formatCurrency(subtotal)}</Text></Text>
                      <Text type="secondary">GST: <Text strong>{formatCurrency(gstAmount)}</Text></Text>
                      <Text>Total: <Text strong style={{ color: '#B8860B', fontSize: 16 }}>{formatCurrency(total)}</Text></Text>
                    </div>
                  );
                }}
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="Notes" label="Notes">
            <Input.TextArea rows={2} />
          </Form.Item>

          <Button type="primary" htmlType="submit" block size="large"
            loading={createMutation.isPending}
            style={{ background: '#B8860B', borderColor: '#B8860B', fontWeight: 700 }}>
            Save Purchase Entry & Add to Inventory
          </Button>
        </Form>
      </Modal>

      <Modal title={`💰 Pay Supplier — ${payModal?.Purchase_Number}`}
        open={!!payModal} onCancel={() => { setPayModal(null); payForm.resetFields(); }} footer={null} destroyOnClose>
        {payModal && (
          <Form form={payForm} layout="vertical"
            initialValues={{ Amount: parseFloat(payModal.Balance_Amount || 0), Payment_Mode: 'Cash' }}
            onFinish={(v) => paySupplierMutation.mutate({ id: payModal.Purchase_ID, ...v })}>
            <Text type="secondary">Outstanding balance: <Text strong style={{ color: '#ff4d4f' }}>{formatCurrency(payModal.Balance_Amount)}</Text></Text>
            <Form.Item name="Amount" label="Amount Paid (₹)" style={{ marginTop: 12 }}
              rules={[{ required: true, message: 'Amount is required.' }, {
                validator: (_, v) => v > parseFloat(payModal.Balance_Amount) + 0.01
                  ? Promise.reject('Cannot exceed the outstanding balance.') : Promise.resolve(),
              }]}>
              <InputNumber style={{ width: '100%' }} min={0.01} max={parseFloat(payModal.Balance_Amount)} precision={2} />
            </Form.Item>
            <Form.Item name="Payment_Mode" label="Payment Mode" rules={[{ required: true }]}>
              <Select options={['Cash', 'UPI', 'Debit Card', 'Credit Card', 'NEFT', 'RTGS', 'IMPS', 'Bank Transfer', 'Cheque'].map(m => ({ value: m, label: m }))} />
            </Form.Item>
            <Form.Item name="Payment_Reference" label="Reference (optional)">
              <Input placeholder="UTR / transaction ID / cheque number" />
            </Form.Item>
            <Button type="primary" htmlType="submit" block loading={paySupplierMutation.isPending}
              style={{ background: '#52c41a', borderColor: '#52c41a', fontWeight: 700 }}>
              Record Payment
            </Button>
          </Form>
        )}
      </Modal>

      <PageTour steps={tourSteps} />
    </div>
  );
}
