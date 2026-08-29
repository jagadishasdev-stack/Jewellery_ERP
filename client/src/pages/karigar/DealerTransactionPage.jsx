/**
 * Dealer Transaction — dealer-to-dealer trades (issue/receipt/purchase/
 * sale) and settlement. Genuinely absent before this — only a cosmetic
 * Customers->Dealers label swap existed. Dealers are real
 * tbl_vendor_master rows (Vendor_Type='Dealer'/'Both') — the same master
 * CRUD (Karigar/Vendor page) and Vendor Ledger page already cover dealer
 * master data; this is the transaction log and settlement.
 */
import React, { useState } from 'react';
import { Table, Card, Button, Modal, Form, Input, InputNumber, Select, Space, Tag, Typography, message, Row, Col, Statistic, Popconfirm } from 'antd';
import { PlusOutlined, CheckOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { dealerTransactionApi, karigarApi } from '../../api/modules';
import { useMetalTypes } from '../../hooks/useMetalTypes';
import { formatCurrency, formatWeight } from '../../utils/calculations';
import dayjs from 'dayjs';

const { Text } = Typography;

const TYPE_COLOR = { Issue: 'blue', Receipt: 'purple', Purchase: 'orange', Sale: 'green' };

export default function DealerTransactionPage() {
  const qc = useQueryClient();
  const { metalTypes } = useMetalTypes();
  const [createOpen, setCreateOpen] = useState(false);
  const [dealerFilter, setDealerFilter] = useState(undefined);
  const [form] = Form.useForm();

  const { data: dealers } = useQuery({
    queryKey: ['dealers-for-transaction'],
    queryFn: () => karigarApi.getVendors({ type: 'Dealer' }).then((r) => (r.data.data || []).filter((v) => ['Dealer', 'Both'].includes(v.Vendor_Type))),
  });

  const { data: rows, isLoading } = useQuery({
    queryKey: ['dealer-transaction', dealerFilter],
    queryFn: () => dealerTransactionApi.list({ dealerId: dealerFilter }).then((r) => r.data.data || []),
  });

  const { data: outstanding } = useQuery({
    queryKey: ['dealer-transaction-outstanding'],
    queryFn: () => dealerTransactionApi.outstanding().then((r) => r.data.data || []),
  });
  const totalPayable = outstanding?.reduce((s, r) => s + parseFloat(r.payable || 0), 0) || 0;
  const totalReceivable = outstanding?.reduce((s, r) => s + parseFloat(r.receivable || 0), 0) || 0;

  const createMutation = useMutation({
    mutationFn: (data) => dealerTransactionApi.create(data),
    onSuccess: (res) => {
      message.success(`${res.data.data.Voucher_Number} created.`);
      qc.invalidateQueries({ queryKey: ['dealer-transaction'] });
      qc.invalidateQueries({ queryKey: ['dealer-transaction-outstanding'] });
      setCreateOpen(false);
      form.resetFields();
    },
    onError: (err) => message.error(err.response?.data?.message || 'Failed to create transaction.'),
  });

  const settleMutation = useMutation({
    mutationFn: (id) => dealerTransactionApi.settle(id),
    onSuccess: () => {
      message.success('Marked settled.');
      qc.invalidateQueries({ queryKey: ['dealer-transaction'] });
      qc.invalidateQueries({ queryKey: ['dealer-transaction-outstanding'] });
    },
    onError: (err) => message.error(err.response?.data?.message || 'Failed to settle.'),
  });

  const columns = [
    { title: 'Voucher', dataIndex: 'Voucher_Number', render: (v) => <Text code strong>{v}</Text> },
    { title: 'Dealer', dataIndex: 'Dealer_Name' },
    { title: 'Type', dataIndex: 'Transaction_Type', render: (v) => <Tag color={TYPE_COLOR[v]}>{v}</Tag> },
    { title: 'Metal', dataIndex: 'Metal_Type' },
    { title: 'Weight', dataIndex: 'Weight', render: (v) => v ? formatWeight(v) : '-' },
    { title: 'Amount', dataIndex: 'Amount', render: (v) => formatCurrency(v) },
    { title: 'Settlement', dataIndex: 'Settlement_Status', render: (v) => <Tag color={v === 'Settled' ? 'green' : 'red'}>{v}</Tag> },
    { title: 'Date', dataIndex: 'Created_Date', render: (v) => dayjs(v).format('DD-MMM-YYYY') },
    {
      title: 'Actions',
      render: (_, r) => r.Settlement_Status === 'Pending' && (
        <Popconfirm title="Mark this transaction as settled?" onConfirm={() => settleMutation.mutate(r.Transaction_ID)}>
          <Button size="small" icon={<CheckOutlined />} loading={settleMutation.isPending}>Settle</Button>
        </Popconfirm>
      ),
    },
  ];

  return (
    <div className="page-wrapper">
      <div className="page-header">
        <div>
          <div className="page-header-title">Dealer Transaction</div>
          <div className="page-header-sub">Issue, receipt, purchase, and sale between this shop and its dealers</div>
        </div>
        <Button type="primary" icon={<PlusOutlined />} style={{ background: '#B8860B', borderColor: '#B8860B' }} onClick={() => setCreateOpen(true)}>
          New Transaction
        </Button>
      </div>

      <Row gutter={[12, 12]} style={{ marginBottom: 14 }}>
        <Col xs={12} md={6}><Card className="erp-card"><Statistic title="Payable to Dealers" value={formatCurrency(totalPayable)} valueStyle={{ color: '#ff4d4f', fontSize: 18 }} /></Card></Col>
        <Col xs={12} md={6}><Card className="erp-card"><Statistic title="Receivable from Dealers" value={formatCurrency(totalReceivable)} valueStyle={{ color: '#52c41a', fontSize: 18 }} /></Card></Col>
      </Row>

      <Card className="erp-card" style={{ marginBottom: 12 }} bodyStyle={{ padding: '12px 16px' }}>
        <Select allowClear showSearch placeholder="Filter by dealer" style={{ width: 260 }} value={dealerFilter} onChange={setDealerFilter}
          filterOption={(input, o) => (o?.label ?? '').toLowerCase().includes(input.toLowerCase())}
          options={(dealers || []).map((d) => ({ value: d.Vendor_ID, label: d.Vendor_Name }))} />
      </Card>

      <Card className="erp-card" bodyStyle={{ padding: 0 }}>
        <div className="table-responsive">
          <Table className="erp-table" columns={columns} dataSource={rows || []} loading={isLoading} rowKey="Transaction_ID"
            pagination={{ pageSize: 20 }} size="small" scroll={{ x: 900 }} />
        </div>
      </Card>

      <Modal title="New Dealer Transaction" open={createOpen} onCancel={() => setCreateOpen(false)} footer={null} destroyOnClose>
        <Form form={form} layout="vertical" onFinish={(v) => createMutation.mutate(v)}>
          <Form.Item name="Dealer_ID" label="Dealer" rules={[{ required: true }]}>
            <Select showSearch placeholder="Select dealer"
              filterOption={(input, o) => (o?.label ?? '').toLowerCase().includes(input.toLowerCase())}
              options={(dealers || []).map((d) => ({ value: d.Vendor_ID, label: d.Vendor_Name }))} />
          </Form.Item>
          <Space style={{ display: 'flex', gap: 8 }}>
            <Form.Item name="Transaction_Type" label="Type" rules={[{ required: true }]} style={{ flex: 1 }}>
              <Select options={['Issue', 'Receipt', 'Purchase', 'Sale'].map((t) => ({ value: t, label: t }))} />
            </Form.Item>
            <Form.Item name="Metal_Type" label="Metal Type" rules={[{ required: true }]} style={{ flex: 1 }}>
              <Select options={metalTypes.map((m) => ({ value: m, label: m }))} />
            </Form.Item>
          </Space>
          <Space style={{ display: 'flex', gap: 8 }}>
            <Form.Item name="Weight" label="Weight (g)" style={{ flex: 1 }}>
              <InputNumber style={{ width: '100%' }} min={0} step={0.01} />
            </Form.Item>
            <Form.Item name="Rate_Per_Gram" label="Rate/g (₹)" style={{ flex: 1 }}>
              <InputNumber style={{ width: '100%' }} min={0} />
            </Form.Item>
          </Space>
          <Form.Item name="Amount" label="Amount (₹)" rules={[{ required: true }]}>
            <InputNumber style={{ width: '100%' }} min={0.01} />
          </Form.Item>
          <Form.Item name="Notes" label="Notes">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Button type="primary" htmlType="submit" block loading={createMutation.isPending} style={{ background: '#B8860B', borderColor: '#B8860B' }}>
            Create Transaction
          </Button>
        </Form>
      </Modal>
    </div>
  );
}
