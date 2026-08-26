import React, { useState, useRef } from 'react';
import { Typography, Tabs, Tag, Button, Space, message, InputNumber, Statistic, Card, Table, Input, Form, DatePicker, Row, Col, Alert, Empty } from 'antd';
import { FileProtectOutlined, SearchOutlined } from '@ant-design/icons';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { complianceApi, masterExtApi, tenantApi } from '../../api/modules';
import GenericCrudTab from '../../components/GenericCrudTab';
import PageTour from '../../components/PageTour';
import dayjs from 'dayjs';

const { Title, Text } = Typography;

function HsnTab() {
  return (
    <GenericCrudTab
      queryKey={['hsn']} listFn={complianceApi.getHsn} createFn={complianceApi.createHsn}
      title="Add HSN Code" rowKey="HSN_ID"
      fields={[
        { name: 'HSN_Code', label: 'HSN Code', required: true },
        { name: 'Description', label: 'Description' },
        { name: 'GST_Percentage', label: 'GST %', type: 'number', step: 0.5, initialValue: 3, required: true },
      ]}
      columns={[
        { title: 'HSN Code', dataIndex: 'HSN_Code' },
        { title: 'Description', dataIndex: 'Description' },
        { title: 'GST %', dataIndex: 'GST_Percentage' },
      ]}
    />
  );
}

function EinvoiceTab() {
  const qc = useQueryClient();
  const [saleId, setSaleId] = useState(null);
  const { data: log, isLoading } = useQuery({ queryKey: ['einvoice-log'], queryFn: () => complianceApi.getEinvoiceLog().then((r) => r.data.data) });
  const generate = async () => {
    if (!saleId) return message.warning('Enter a Sale ID first.');
    try {
      const res = await complianceApi.generateEinvoice({ Sale_ID: saleId });
      message.info(res.data.message);
      qc.invalidateQueries({ queryKey: ['einvoice-log'] });
    } catch (e) { message.error(e.response?.data?.message || 'Failed.'); }
  };
  return (
    <div>
      <Space style={{ marginBottom: 12 }}>
        <InputNumber placeholder="Sale ID" value={saleId} onChange={setSaleId} />
        <Button type="primary" onClick={generate} style={{ background: '#B8860B', borderColor: '#B8860B' }}>Generate e-Invoice</Button>
      </Space>
      <Table
        size="small" loading={isLoading} dataSource={log || []} rowKey="Log_ID" pagination={{ pageSize: 10 }}
        columns={[
          { title: 'Invoice', dataIndex: 'Invoice_Number' },
          { title: 'IRN', dataIndex: 'IRN', render: (v) => v || '-' },
          { title: 'Status', dataIndex: 'Status', render: (v) => <Tag color={v === 'Generated' ? 'green' : v === 'Failed' ? 'red' : 'orange'}>{v}</Tag> },
          { title: 'Note', dataIndex: 'Error_Message' },
        ]}
      />
    </div>
  );
}

function RedemptionValueCard() {
  const qc = useQueryClient();
  const { data: settings } = useQuery({ queryKey: ['tenant-settings-loyalty'], queryFn: () => tenantApi.getSettings().then((r) => r.data.data) });
  const [value, setValue] = useState(null);

  const saveMutation = useMutation({
    mutationFn: (v) => tenantApi.updateSettings({ Loyalty_Point_Value: v }),
    onSuccess: () => { message.success('Redemption value updated.'); qc.invalidateQueries({ queryKey: ['tenant-settings-loyalty'] }); },
    onError: (e) => message.error(e.response?.data?.message || 'Failed to update.'),
  });

  const current = value ?? settings?.Loyalty_Point_Value ?? 1;

  return (
    <Card style={{ marginBottom: 16, maxWidth: 480 }} title="Redemption Value">
      <Text type="secondary" style={{ display: 'block', marginBottom: 10, fontSize: 12 }}>
        What one loyalty point is worth as a discount when a customer redeems points at checkout (POS/Billing).
        Earning (above) and redemption value are independent settings.
      </Text>
      <Space>
        <InputNumber addonBefore="₹" min={0} step={0.25} value={current} onChange={setValue} style={{ width: 140 }} />
        <Text type="secondary">per point</Text>
        <Button type="primary" style={{ background: '#B8860B', borderColor: '#B8860B' }}
          loading={saveMutation.isPending} onClick={() => saveMutation.mutate(current)}>
          Save
        </Button>
      </Space>
    </Card>
  );
}

function LoyaltySlabsTab() {
  const [amount, setAmount] = useState(null);
  const [result, setResult] = useState(null);
  const calc = async () => {
    if (!amount) return;
    const res = await complianceApi.calculateLoyaltyPoints({ amount });
    setResult(res.data.data);
  };
  return (
    <div>
      <RedemptionValueCard />
      <Card style={{ marginBottom: 16, maxWidth: 400 }} title="Earning Calculator">
        <Space>
          <InputNumber placeholder="Sale amount ₹" value={amount} onChange={setAmount} style={{ width: 180 }} />
          <Button onClick={calc}>Calculate Points</Button>
        </Space>
        {result && <Statistic title="Points Earned" value={result.points} style={{ marginTop: 12 }} />}
        <Alert type="warning" showIcon style={{ marginTop: 12, fontSize: 11 }}
          message="These slabs are a reference calculator only — the actual points a sale earns is a fixed 1 point per ₹1,000 spent, computed in sales.js. Wiring real sales to use these slabs instead is a separate, larger change." />
      </Card>
      <GenericCrudTab
        queryKey={['loyalty-slabs']} listFn={complianceApi.getLoyaltySlabs} createFn={complianceApi.createLoyaltySlab}
        title="New Loyalty Slab" rowKey="Slab_ID"
        fields={[
          { name: 'Amount_From', label: 'Amount From (₹)', type: 'number', required: true },
          { name: 'Amount_To', label: 'Amount To (₹, blank = no limit)', type: 'number' },
          { name: 'Metal_Type', label: 'Metal Type (blank = all)', type: 'select', allowClear: true, options: ['Gold', 'Silver', 'Platinum'].map((s) => ({ value: s, label: s })) },
          { name: 'Points_Per_Unit', label: 'Points per ₹1 spent', type: 'number', step: 0.001, required: true },
        ]}
        columns={[
          { title: 'From', dataIndex: 'Amount_From' },
          { title: 'To', dataIndex: 'Amount_To', render: (v) => v || 'No limit' },
          { title: 'Metal', dataIndex: 'Metal_Type', render: (v) => v || 'All' },
          { title: 'Points/₹', dataIndex: 'Points_Per_Unit' },
        ]}
      />
    </div>
  );
}

// HUID (BIS hallmarking) — the server routes (GET /master/huid/:number,
// POST /master/huid) have existed since the master data module was
// built; nothing in the UI ever called them (found via audit). This is
// that missing screen: look up an HUID already on record, or register a
// new one against a hallmarked item.
function HuidTab() {
  const [lookupNumber, setLookupNumber] = useState('');
  const [lookupResult, setLookupResult] = useState(undefined); // undefined = not searched, null = not found
  const [lookupLoading, setLookupLoading] = useState(false);
  const [form] = Form.useForm();

  const doLookup = async () => {
    if (!lookupNumber.trim()) return;
    setLookupLoading(true);
    try {
      const res = await masterExtApi.checkHUID(lookupNumber.trim());
      setLookupResult(res.data.data);
    } catch (err) {
      setLookupResult(null);
    } finally {
      setLookupLoading(false);
    }
  };

  const registerMutation = useMutation({
    mutationFn: (data) => masterExtApi.registerHUID(data),
    onSuccess: () => {
      message.success('HUID registered.');
      form.resetFields();
    },
    onError: (err) => message.error(err.response?.data?.message || 'Failed to register HUID — it may already be on record.'),
  });

  return (
    <Row gutter={16}>
      <Col xs={24} md={12}>
        <Card title="Look Up an HUID" style={{ borderRadius: 8, marginBottom: 16 }}>
          <Space.Compact style={{ width: '100%', marginBottom: 12 }}>
            <Input prefix={<SearchOutlined />} placeholder="HUID Number (e.g. AZ4E2D7F)" value={lookupNumber}
              onChange={(e) => setLookupNumber(e.target.value)} onPressEnter={doLookup} />
            <Button type="primary" loading={lookupLoading} onClick={doLookup} style={{ background: '#B8860B', borderColor: '#B8860B' }}>Look Up</Button>
          </Space.Compact>
          {lookupResult === null && <Alert type="warning" showIcon message="No HUID on record with that number for this tenant." />}
          {lookupResult && (
            <Table size="small" pagination={false} showHeader={false}
              dataSource={[
                ['Article Number', lookupResult.Article_Number || '-'],
                ['Purity', lookupResult.Purity_Code || '-'],
                ['Weight (g)', lookupResult.Weight || '-'],
                ['Assay Centre', lookupResult.Assay_Centre || '-'],
                ['Hallmark Date', lookupResult.Hallmark_Date ? dayjs(lookupResult.Hallmark_Date).format('DD-MMM-YYYY') : '-'],
              ].map(([label, value]) => ({ label, value }))}
              columns={[{ dataIndex: 'label', render: (v) => <Text type="secondary">{v}</Text> }, { dataIndex: 'value', render: (v) => <Text strong>{v}</Text> }]}
              rowKey="label"
            />
          )}
          {lookupResult === undefined && <Empty description="Search an HUID number above" image={Empty.PRESENTED_IMAGE_SIMPLE} />}
        </Card>
      </Col>
      <Col xs={24} md={12}>
        <Card title="Register a New HUID" style={{ borderRadius: 8 }}>
          <Form form={form} layout="vertical" onFinish={(v) => registerMutation.mutate({
            ...v, Hallmark_Date: v.Hallmark_Date ? v.Hallmark_Date.format('YYYY-MM-DD') : null,
          })}>
            <Form.Item name="HUID_Number" label="HUID Number" rules={[{ required: true, message: 'HUID number is required.' }]}>
              <Input placeholder="6-character BIS HUID" />
            </Form.Item>
            <Form.Item name="Article_Number" label="Article Number">
              <Input placeholder="This shop's own stock article number" />
            </Form.Item>
            <Row gutter={12}>
              <Col span={12}><Form.Item name="Purity_Code" label="Purity"><Input placeholder="e.g. 22K916" /></Form.Item></Col>
              <Col span={12}><Form.Item name="Weight" label="Weight (g)"><InputNumber style={{ width: '100%' }} min={0} step={0.01} /></Form.Item></Col>
            </Row>
            <Form.Item name="Assay_Centre" label="Assay & Hallmarking Centre"><Input /></Form.Item>
            <Form.Item name="Hallmark_Date" label="Hallmark Date"><DatePicker style={{ width: '100%' }} format="DD-MMM-YYYY" /></Form.Item>
            <Form.Item name="Certificate_URL" label="Certificate URL (optional)"><Input placeholder="Link to the BIS certificate, if scanned" /></Form.Item>
            <Button type="primary" htmlType="submit" block loading={registerMutation.isPending} style={{ background: '#B8860B', borderColor: '#B8860B' }}>
              Register HUID
            </Button>
          </Form>
        </Card>
      </Col>
    </Row>
  );
}

export default function CompliancePage() {
  const tabsRef = useRef(null);
  const tourSteps = [
    { title: '1. HSN Codes', description: 'A shared master of HSN codes and their GST % — edit the rate here once instead of on every item type.', target: () => tabsRef.current },
    { title: '2. e-Invoice Log', description: 'Enter a Sale ID and click Generate — this is honest about not having a live government GSP connection configured, so it logs the attempt and tells you why rather than faking a fake IRN.' },
    { title: '3. Loyalty Slabs', description: 'Define how many points a customer earns per ₹ spent, by amount range and optionally by metal type — use the calculator above to test a sale amount before relying on it.' },
    { title: '4. HUID', description: 'Look up a BIS Hallmark Unique ID already on record, or register a new one against a hallmarked item — the statutory hallmarking requirement for jewellery sold in India.' },
  ];
  return (
    <div className="page-wrapper">
      <div className="page-header">
        <Title level={4} style={{ margin: 0 }}><Space><FileProtectOutlined style={{ color: '#B8860B' }} />Compliance: HSN, e-Invoice, Loyalty & HUID</Space></Title>
      </div>
      <div ref={tabsRef}>
      <Tabs items={[
        { key: 'hsn', label: 'HSN Codes', children: <HsnTab /> },
        { key: 'einvoice', label: 'e-Invoice Log', children: <EinvoiceTab /> },
        { key: 'loyalty', label: 'Loyalty Slabs', children: <LoyaltySlabsTab /> },
        { key: 'huid', label: 'HUID', children: <HuidTab /> },
      ]} />
      </div>
      <PageTour steps={tourSteps} />
    </div>
  );
}
