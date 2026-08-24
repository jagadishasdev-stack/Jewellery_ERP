import React, { useState, useRef } from 'react';
import { Typography, Tabs, Tag, Button, Space, message, InputNumber, Statistic, Card, Table } from 'antd';
import { FileProtectOutlined } from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { complianceApi } from '../../api/modules';
import GenericCrudTab from '../../components/GenericCrudTab';
import PageTour from '../../components/PageTour';
import dayjs from 'dayjs';

const { Title } = Typography;

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
      <Card style={{ marginBottom: 16, maxWidth: 400 }}>
        <Space>
          <InputNumber placeholder="Sale amount ₹" value={amount} onChange={setAmount} style={{ width: 180 }} />
          <Button onClick={calc}>Calculate Points</Button>
        </Space>
        {result && <Statistic title="Points Earned" value={result.points} style={{ marginTop: 12 }} />}
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

export default function CompliancePage() {
  const tabsRef = useRef(null);
  const tourSteps = [
    { title: '1. HSN Codes', description: 'A shared master of HSN codes and their GST % — edit the rate here once instead of on every item type.', target: () => tabsRef.current },
    { title: '2. e-Invoice Log', description: 'Enter a Sale ID and click Generate — this is honest about not having a live government GSP connection configured, so it logs the attempt and tells you why rather than faking a fake IRN.' },
    { title: '3. Loyalty Slabs', description: 'Define how many points a customer earns per ₹ spent, by amount range and optionally by metal type — use the calculator above to test a sale amount before relying on it.' },
  ];
  return (
    <div className="page-wrapper">
      <div className="page-header">
        <Title level={4} style={{ margin: 0 }}><Space><FileProtectOutlined style={{ color: '#B8860B' }} />Compliance: HSN, e-Invoice & Loyalty</Space></Title>
      </div>
      <div ref={tabsRef}>
      <Tabs items={[
        { key: 'hsn', label: 'HSN Codes', children: <HsnTab /> },
        { key: 'einvoice', label: 'e-Invoice Log', children: <EinvoiceTab /> },
        { key: 'loyalty', label: 'Loyalty Slabs', children: <LoyaltySlabsTab /> },
      ]} />
      </div>
      <PageTour steps={tourSteps} />
    </div>
  );
}
