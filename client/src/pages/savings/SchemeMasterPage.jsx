import React, { useState, useEffect, useRef } from 'react';
import {
  Table, Button, Card, Typography, Tag, Space, Modal, Form,
  Input, InputNumber, Select, Switch, Row, Col, message, Divider,
} from 'antd';
import { PlusOutlined, EditOutlined, SettingOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { savingsApi } from '../../api/modules';
import { formatCurrency } from '../../utils/calculations';
import { useAuthStore } from '../../store/authStore';
import PageTour from '../../components/PageTour';

const { Title, Text } = Typography;
const { Option } = Select;

function SchemeSettingsCard() {
  const { data: settings, isLoading } = useQuery({
    queryKey: ['scheme-settings'],
    queryFn: () => savingsApi.getSchemeSettings().then(r => r.data.data),
  });
  const [local, setLocal] = useState({ Allow_Active_Scheme_Adjustment: false, Allow_Active_Scheme_Bonus: false });
  useEffect(() => { if (settings) setLocal(settings); }, [settings]);

  const saveMutation = useMutation({
    mutationFn: (d) => savingsApi.updateSchemeSettings(d),
    onSuccess: () => message.success('POS adjustment settings saved.'),
    onError: (err) => message.error(err.response?.data?.message || 'Failed to save.'),
  });

  return (
    <Card size="small" title={<span><SettingOutlined /> POS Adjustment Settings</span>} style={{ borderRadius: 8, marginBottom: 16 }} loading={isLoading}>
      <Space direction="vertical" size={12} style={{ width: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <Text strong style={{ fontSize: 13 }}>Allow balance use on Active (not-yet-matured) schemes</Text>
            <br />
            <Text type="secondary" style={{ fontSize: 11 }}>Off by default — only Matured schemes can adjust their balance at POS until enabled here.</Text>
          </div>
          <Switch checked={!!local.Allow_Active_Scheme_Adjustment}
            onChange={v => setLocal(p => ({ ...p, Allow_Active_Scheme_Adjustment: v }))} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <Text strong style={{ fontSize: 13 }}>Allow bonus use on Active (not-yet-matured) schemes</Text>
            <br />
            <Text type="secondary" style={{ fontSize: 11 }}>Off by default — bonus is normally only usable once a scheme has Matured.</Text>
          </div>
          <Switch checked={!!local.Allow_Active_Scheme_Bonus}
            onChange={v => setLocal(p => ({ ...p, Allow_Active_Scheme_Bonus: v }))} />
        </div>
        <Button type="primary" size="small" loading={saveMutation.isPending}
          style={{ background: '#B8860B', borderColor: '#B8860B', width: 120 }}
          onClick={() => saveMutation.mutate(local)}>
          Save Settings
        </Button>
      </Space>
    </Card>
  );
}

export default function SchemeMasterPage() {
  const { user } = useAuthStore();
  const canManageSettings = !!user?.permissions?.tenant_management;
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form] = Form.useForm();
  const qc = useQueryClient();

  const { data: schemes, isLoading } = useQuery({
    queryKey: ['savings-schemes'],
    queryFn: () => savingsApi.getSchemes().then(r => r.data.data),
  });

  const saveMutation = useMutation({
    mutationFn: (d) => editing ? savingsApi.updateScheme(editing.Scheme_ID, d) : savingsApi.createScheme(d),
    onSuccess: () => { message.success('Scheme saved!'); qc.invalidateQueries(['savings-schemes']); setModal(false); form.resetFields(); setEditing(null); },
    onError: (err) => message.error(err.response?.data?.message || 'Failed.'),
  });

  const openEdit = (scheme) => { setEditing(scheme); form.setFieldsValue(scheme); setModal(true); };
  const openNew = () => { setEditing(null); form.resetFields(); setModal(true); };

  // ── Walkthrough tour refs ───────────────────────────────────────────────────
  const tableRef = useRef(null);
  const newBtnRef = useRef(null);
  const tourSteps = [
    { title: '1. Scheme Types', description: 'Every Gold Scheme, Silver Scheme or Digi Gold plan you offer is defined here — its tenure, monthly amount, bonus and maturity rules. Groups and Members are then created against one of these types.', target: () => tableRef.current },
    { title: '2. Create a New Scheme Type', description: 'Click here to define a fresh plan — give it a code, name and type (Gold/Silver/Digi Gold/etc).', target: () => newBtnRef.current },
    { title: '3. Set Tenure, Amount & Bonus', description: 'In the form: set the monthly installment amount, the paying duration plus any free/bonus months, and how the bonus is calculated (one month free, a fixed amount, or a %). Also choose how maturity works — jewellery purchase, cash, voucher or gold conversion — and grace days/penalty for late payers.' },
    { title: '4. POS Adjustment Settings', description: 'Admins can control here whether counter staff are allowed to use an active (not-yet-matured) scheme\'s balance or bonus at the POS billing screen — normally this is only allowed once a scheme has matured.' },
  ];

  const columns = [
    { title: 'Code', dataIndex: 'Scheme_Code', render: v => <Text code>{v}</Text>, width: 100 },
    { title: 'Scheme Name', dataIndex: 'Scheme_Name', render: v => <Text strong>{v}</Text> },
    { title: 'Type', dataIndex: 'Scheme_Type', render: v => <Tag color={v === 'Gold' ? 'gold' : v === 'Silver' ? 'default' : 'blue'}>{v}</Tag> },
    { title: 'Duration', render: (_, r) => `${r.Duration_Months}+${r.Free_Months} months` },
    { title: 'Monthly Amt', dataIndex: 'Default_Monthly_Amount', render: v => formatCurrency(v) },
    { title: 'Bonus', dataIndex: 'Bonus_Type' },
    { title: 'Maturity', dataIndex: 'Maturity_Type', render: v => <Text style={{ fontSize: 11 }}>{v}</Text> },
    { title: 'App', dataIndex: 'Show_In_App', render: v => <Tag color={v ? 'green' : 'default'}>{v ? 'Visible' : 'Hidden'}</Tag> },
    { title: 'Status', dataIndex: 'Is_Active', render: v => <Tag color={v ? 'green' : 'red'}>{v ? 'Active' : 'Inactive'}</Tag> },
    { title: '', render: (_, r) => <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} /> },
  ];

  return (
    <div className="page-wrapper">
      <div className="page-header">
        <Title level={4} style={{ margin: 0 }}>Scheme Master</Title>
        <Button ref={newBtnRef} type="primary" icon={<PlusOutlined />} style={{ background: '#B8860B', borderColor: '#B8860B' }} onClick={openNew}>
          New Scheme
        </Button>
      </div>

      {canManageSettings && <SchemeSettingsCard />}

      <div ref={tableRef}>
      <Card style={{ borderRadius: 8, border: 'none' }} bodyStyle={{ padding: 0 }}>
        <Table
            scroll={{ x: "max-content" }} columns={columns} dataSource={schemes || []} loading={isLoading} rowKey="Scheme_ID" size="small" pagination={false} />
      </Card>
      </div>

      <Modal title={editing ? 'Edit Scheme' : 'Create Scheme'} open={modal}
        onCancel={() => { setModal(false); form.resetFields(); setEditing(null); }}
        footer={null} width={700}>
        <Form form={form} layout="vertical" onFinish={v => saveMutation.mutate(v)}>
          <Row gutter={16}>
            <Col xs={8}><Form.Item name="Scheme_Code" label="Scheme Code" rules={[{ required: true }]}><Input placeholder="GS-1000" /></Form.Item></Col>
            <Col xs={16}><Form.Item name="Scheme_Name" label="Scheme Name" rules={[{ required: true }]}><Input placeholder="Gold Saving Plan 1000" /></Form.Item></Col>
          </Row>
          <Row gutter={16}>
            <Col xs={8}><Form.Item name="Scheme_Type" label="Scheme Type" initialValue="Gold"><Select><Option value="Gold">Gold</Option><Option value="Silver">Silver</Option><Option value="Cash">Cash</Option><Option value="Diamond">Diamond</Option><Option value="Platinum">Platinum</Option></Select></Form.Item></Col>
            <Col xs={8}><Form.Item name="Collection_Frequency" label="Frequency" initialValue="Monthly"><Select><Option value="Monthly">Monthly</Option><Option value="Weekly">Weekly</Option><Option value="Daily">Daily</Option></Select></Form.Item></Col>
            <Col xs={8}><Form.Item name="Installment_Mode" label="Installment Mode" initialValue="Fixed"><Select><Option value="Fixed">Fixed</Option><Option value="Flexible">Flexible</Option></Select></Form.Item></Col>
          </Row>
          <Row gutter={16}>
            <Col xs={8}><Form.Item name="Default_Monthly_Amount" label="Monthly Amount (₹)" rules={[{ required: true }]}><InputNumber style={{ width: '100%' }} min={100} formatter={v => `₹ ${v}`} /></Form.Item></Col>
            <Col xs={8}><Form.Item name="Duration_Months" label="Duration (months)" initialValue={11} rules={[{ required: true }]}><InputNumber style={{ width: '100%' }} min={1} /></Form.Item></Col>
            <Col xs={8}><Form.Item name="Free_Months" label="Free/Bonus Months" initialValue={1}><InputNumber style={{ width: '100%' }} min={0} /></Form.Item></Col>
          </Row>
          <Row gutter={16}>
            <Col xs={8}><Form.Item name="Bonus_Type" label="Bonus Type" initialValue="One Month"><Select><Option value="No Bonus">No Bonus</Option><Option value="One Month">One Month Free</Option><Option value="Product">Product Bonus</Option><Option value="Percentage">Percentage</Option><Option value="Fixed">Fixed Amount</Option></Select></Form.Item></Col>
            <Col xs={8}><Form.Item name="Bonus_Value" label="Bonus Value (₹)" initialValue={0}><InputNumber style={{ width: '100%' }} min={0} /></Form.Item></Col>
            <Col xs={8}><Form.Item name="Maturity_Type" label="Maturity Type" initialValue="Jewellery Purchase Only"><Select><Option value="Jewellery Purchase Only">Jewellery Purchase Only</Option><Option value="Cash Redemption">Cash Redemption</Option><Option value="Voucher Redemption">Voucher</Option><Option value="Gold Conversion">Gold Conversion</Option></Select></Form.Item></Col>
          </Row>
          <Row gutter={16}>
            <Col xs={8}><Form.Item name="Gold_Rate_Mode" label="Gold Rate Mode" initialValue="Current Rate"><Select><Option value="Current Rate">Current Rate</Option><Option value="Booking Rate">Booking Rate</Option><Option value="Average Rate">Average Rate</Option></Select></Form.Item></Col>
            <Col xs={8}><Form.Item name="Grace_Days" label="Grace Days" initialValue={7}><InputNumber style={{ width: '100%' }} min={0} /></Form.Item></Col>
            <Col xs={8}><Form.Item name="Penalty_Amount" label="Penalty Amount (₹)" initialValue={0}><InputNumber style={{ width: '100%' }} min={0} /></Form.Item></Col>
          </Row>
          <Divider>Incentives</Divider>
          <Row gutter={16}>
            <Col xs={8}><Form.Item name="Introducer_Incentive_Pct" label="Introducer Incentive %" initialValue={0}><InputNumber style={{ width: '100%' }} min={0} max={100} /></Form.Item></Col>
            <Col xs={8}><Form.Item name="Salesman_Incentive_Pct" label="Salesman Incentive %" initialValue={0}><InputNumber style={{ width: '100%' }} min={0} max={100} /></Form.Item></Col>
            <Col xs={4}><Form.Item name="Show_In_App" label="Show in App" valuePropName="checked" initialValue={true}><Switch /></Form.Item></Col>
            <Col xs={4}><Form.Item name="Is_Active" label="Active" valuePropName="checked" initialValue={true}><Switch /></Form.Item></Col>
          </Row>
          <Form.Item name="Description" label="Description"><Input.TextArea rows={2} /></Form.Item>
          <Button type="primary" htmlType="submit" block size="large" loading={saveMutation.isPending}
            style={{ background: '#B8860B', borderColor: '#B8860B' }}>
            Save Scheme
          </Button>
        </Form>
      </Modal>

      <PageTour steps={tourSteps} />
    </div>
  );
}
