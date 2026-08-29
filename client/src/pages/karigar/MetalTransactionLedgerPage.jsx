/**
 * Metal Transaction — a real opening/addition/issue/receipt/conversion/
 * closing running balance per metal type. Previously only existed as
 * Pure Gold Bin's single-entry holding record with a status flag, no
 * running balance at all. Pure Gold Bin's own create/dispose actions now
 * also post here automatically (see binManagement.js) — this page adds
 * manual entries for movements that don't go through the bin at all.
 */
import React, { useState } from 'react';
import { Table, Card, Button, Modal, Form, Input, InputNumber, Select, Space, Tag, Typography, Row, Col, Statistic, message } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { metalLedgerApi } from '../../api/modules';
import { useMetalTypes } from '../../hooks/useMetalTypes';
import { formatWeight } from '../../utils/calculations';
import dayjs from 'dayjs';

const { Text } = Typography;

const TYPE_COLOR = { Opening: 'default', Addition: 'green', Receipt: 'green', Issue: 'red', Conversion: 'orange', Closing: 'purple' };

export default function MetalTransactionLedgerPage() {
  const qc = useQueryClient();
  const { metalTypes } = useMetalTypes();
  const [createOpen, setCreateOpen] = useState(false);
  const [metalFilter, setMetalFilter] = useState(undefined);
  const [form] = Form.useForm();

  const { data: balances } = useQuery({
    queryKey: ['metal-ledger-balance'],
    queryFn: () => metalLedgerApi.balance().then((r) => r.data.data || []),
  });

  const { data: rows, isLoading } = useQuery({
    queryKey: ['metal-ledger', metalFilter],
    queryFn: () => metalLedgerApi.list({ metalType: metalFilter }).then((r) => r.data.data || []),
  });

  const createMutation = useMutation({
    mutationFn: (data) => metalLedgerApi.create(data),
    onSuccess: () => {
      message.success('Ledger entry recorded.');
      qc.invalidateQueries({ queryKey: ['metal-ledger'] });
      qc.invalidateQueries({ queryKey: ['metal-ledger-balance'] });
      setCreateOpen(false);
      form.resetFields();
    },
    onError: (err) => message.error(err.response?.data?.message || 'Failed to record entry.'),
  });

  const columns = [
    { title: 'Metal', dataIndex: 'Metal_Type' },
    { title: 'Type', dataIndex: 'Transaction_Type', render: (v) => <Tag color={TYPE_COLOR[v]}>{v}</Tag> },
    { title: 'Change', dataIndex: 'Weight_Change', render: (v) => <Text style={{ color: parseFloat(v) >= 0 ? '#52c41a' : '#ff4d4f' }}>{parseFloat(v) >= 0 ? '+' : ''}{formatWeight(v)}</Text> },
    { title: 'Balance After', dataIndex: 'Balance_After', render: (v) => <Text strong>{formatWeight(v)}</Text> },
    { title: 'Reference', dataIndex: 'Reference_Type', render: (v, r) => v ? `${v} #${r.Reference_ID}` : '-' },
    { title: 'Notes', dataIndex: 'Notes', ellipsis: true },
    { title: 'Date', dataIndex: 'Created_Date', render: (v) => dayjs(v).format('DD-MMM-YYYY HH:mm') },
  ];

  return (
    <div className="page-wrapper">
      <div className="page-header">
        <div>
          <div className="page-header-title">Metal Transaction</div>
          <div className="page-header-sub">Running balance per metal — opening, addition, issue, receipt, conversion, closing</div>
        </div>
        <Button type="primary" icon={<PlusOutlined />} style={{ background: '#B8860B', borderColor: '#B8860B' }} onClick={() => setCreateOpen(true)}>
          New Entry
        </Button>
      </div>

      <Row gutter={[12, 12]} style={{ marginBottom: 14 }}>
        {(balances || []).map((b) => (
          <Col xs={12} md={6} key={b.Metal_Type}>
            <Card className="erp-card" hoverable onClick={() => setMetalFilter(metalFilter === b.Metal_Type ? undefined : b.Metal_Type)}
              style={{ border: metalFilter === b.Metal_Type ? '2px solid #B8860B' : undefined, cursor: 'pointer' }}>
              <Statistic title={b.Metal_Type} value={formatWeight(b.Current_Balance)} valueStyle={{ fontSize: 18, color: '#B8860B' }} />
            </Card>
          </Col>
        ))}
      </Row>

      <Card className="erp-card" bodyStyle={{ padding: 0 }}>
        <div className="table-responsive">
          <Table className="erp-table" columns={columns} dataSource={rows || []} loading={isLoading} rowKey="Ledger_ID"
            pagination={{ pageSize: 20 }} size="small" scroll={{ x: 900 }} />
        </div>
      </Card>

      <Modal title="New Metal Ledger Entry" open={createOpen} onCancel={() => setCreateOpen(false)} footer={null} destroyOnClose>
        <Form form={form} layout="vertical" onFinish={(v) => createMutation.mutate(v)}>
          <Space style={{ display: 'flex', gap: 8 }}>
            <Form.Item name="Metal_Type" label="Metal Type" rules={[{ required: true }]} style={{ flex: 1 }}>
              <Select options={metalTypes.map((m) => ({ value: m, label: m }))} />
            </Form.Item>
            <Form.Item name="Transaction_Type" label="Type" rules={[{ required: true }]} style={{ flex: 1 }}>
              <Select options={['Opening', 'Addition', 'Issue', 'Receipt', 'Conversion', 'Closing'].map((t) => ({ value: t, label: t }))} />
            </Form.Item>
          </Space>
          <Form.Item name="Weight" label="Weight (g) — always positive, direction comes from Type above" rules={[{ required: true }]}>
            <InputNumber style={{ width: '100%' }} min={0.001} step={0.001} />
          </Form.Item>
          <Form.Item name="Purity" label="Purity % (optional)">
            <InputNumber style={{ width: '100%' }} min={0} max={100} step={0.01} />
          </Form.Item>
          <Form.Item name="Notes" label="Notes">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Button type="primary" htmlType="submit" block loading={createMutation.isPending} style={{ background: '#B8860B', borderColor: '#B8860B' }}>
            Record Entry
          </Button>
        </Form>
      </Modal>
    </div>
  );
}
