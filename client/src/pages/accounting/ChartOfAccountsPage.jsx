/**
 * Chart of Accounts — every ledger this tenant's books use, grouped the
 * standard way (Assets / Liabilities / Capital / Income / Expenses). Most
 * of these get created automatically the first time a voucher references
 * them (see accountingEngine.js's getOrCreateAccount) — this screen is for
 * seeing the full list, adding one by hand before it's ever used, and
 * retiring one that's no longer needed. Nothing here edits a balance
 * directly; balances only ever come from the Ledger view, which is itself
 * just a read of posted journal entries.
 */
import React, { useState, useRef } from 'react';
import {
  Table, Button, Modal, Form, Input, InputNumber, Select, Tag, Space,
  Typography, message, Popconfirm, Collapse,
} from 'antd';
import { PlusOutlined, BookOutlined, StopOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { accountingApi } from '../../api/modules';
import { formatCurrency } from '../../utils/calculations';
import PageTour from '../../components/PageTour';

const { Title, Text } = Typography;

const GROUPS = ['Assets', 'Liabilities', 'Capital', 'Income', 'Expenses'];
const SUB_GROUPS = [
  'Cash', 'Bank', 'Receivable', 'Payable', 'Tax Credit', 'Tax Payable',
  'Inventory', 'Fixed Asset', 'Advance', 'Provision', 'Loan', 'Capital',
  'Direct Income', 'Indirect Income', 'Direct Expense', 'Indirect Expense',
];
const GROUP_COLOR = { Assets: 'blue', Liabilities: 'red', Capital: 'purple', Income: 'green', Expenses: 'orange' };

export default function ChartOfAccountsPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();
  const tableRef = useRef(null);

  const { data: accounts, isLoading } = useQuery({
    queryKey: ['chart-of-accounts'],
    queryFn: () => accountingApi.getChartOfAccounts().then((r) => r.data.data || []),
  });

  const createMutation = useMutation({
    mutationFn: accountingApi.createAccount,
    onSuccess: () => { message.success('Ledger account created.'); qc.invalidateQueries({ queryKey: ['chart-of-accounts'] }); setOpen(false); form.resetFields(); },
    onError: (err) => message.error(err.response?.data?.message || 'Failed to create account.'),
  });

  const deactivateMutation = useMutation({
    mutationFn: accountingApi.deactivateAccount,
    onSuccess: () => { message.success('Account deactivated.'); qc.invalidateQueries({ queryKey: ['chart-of-accounts'] }); },
    onError: (err) => message.error(err.response?.data?.message || 'Failed to deactivate.'),
  });

  const columns = [
    { title: 'Code', dataIndex: 'Account_Code', width: 80, sorter: (a, b) => a.Account_Code?.localeCompare(b.Account_Code) },
    {
      title: 'Account Name', dataIndex: 'Account_Name',
      render: (v, r) => (
        <Button type="link" style={{ padding: 0, height: 'auto', fontWeight: 600 }} onClick={() => navigate(`/accounting/ledger?accountId=${r.Account_ID}`)}>
          {v}
        </Button>
      ),
    },
    { title: 'Sub Group', dataIndex: 'Account_Sub_Group', render: (v) => v ? <Tag>{v}</Tag> : '-' },
    { title: 'Opening Balance', dataIndex: 'Opening_Balance', render: (v, r) => v > 0 ? `${formatCurrency(v)} ${r.Opening_Balance_Type}` : '-' },
    { title: 'Type', dataIndex: 'Is_System', render: (v) => v ? <Tag color="gold">System</Tag> : <Tag color="default">Manual</Tag> },
    {
      title: 'Actions', width: 100,
      render: (_, r) => !r.Is_System && (
        <Popconfirm title="Deactivate this account? Its history stays visible in reports." onConfirm={() => deactivateMutation.mutate(r.Account_ID)}>
          <Button size="small" danger type="text" icon={<StopOutlined />}>Deactivate</Button>
        </Popconfirm>
      ),
    },
  ];

  const grouped = GROUPS.map((g) => ({ group: g, rows: (accounts || []).filter((a) => a.Account_Group === g) })).filter((g) => g.rows.length);

  const tourSteps = [
    { title: '1. Every Ledger, One Place', description: 'This is the full Chart of Accounts — Assets, Liabilities, Capital, Income, Expenses. Most of these appear automatically the moment a sale, purchase, or payment first uses them.', target: () => tableRef.current },
    { title: '2. Add a Ledger by Hand', description: 'Setting up an expense head or a new party account before the first transaction? Add it here directly instead of waiting for a voucher to create it.' },
    { title: '3. Click a Name for its Ledger', description: 'Click any account name to jump straight to its full transaction history with a running balance.' },
  ];

  return (
    <div className="page-wrapper">
      <div className="page-header">
        <Title level={4} style={{ margin: 0 }}><Space><BookOutlined style={{ color: '#1890ff' }} />Chart of Accounts</Space></Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)} style={{ background: '#B8860B', borderColor: '#B8860B' }}>
          New Ledger Account
        </Button>
      </div>

      <div ref={tableRef}>
        <Collapse
          defaultActiveKey={GROUPS}
          items={grouped.map(({ group, rows }) => ({
            key: group,
            label: <Space><Tag color={GROUP_COLOR[group]}>{group}</Tag><Text type="secondary">{rows.length} account{rows.length !== 1 ? 's' : ''}</Text></Space>,
            children: (
              <Table
                size="small" columns={columns} dataSource={rows} loading={isLoading}
                rowKey="Account_ID" pagination={false} scroll={{ x: 'max-content' }}
              />
            ),
          }))}
        />
      </div>

      <Modal title="New Ledger Account" open={open} onCancel={() => setOpen(false)} footer={null} destroyOnClose>
        <Form form={form} layout="vertical" onFinish={(v) => createMutation.mutate(v)}>
          <Form.Item name="Account_Name" label="Account Name" rules={[{ required: true, message: 'Account name is required.' }]}>
            <Input placeholder="e.g. Electricity Expense" />
          </Form.Item>
          <Form.Item name="Account_Group" label="Account Group" rules={[{ required: true, message: 'Pick a group.' }]}>
            <Select options={GROUPS.map((g) => ({ value: g, label: g }))} placeholder="Assets / Liabilities / Capital / Income / Expenses" />
          </Form.Item>
          <Form.Item name="Account_Sub_Group" label="Sub Group (optional)">
            <Select options={SUB_GROUPS.map((s) => ({ value: s, label: s }))} allowClear placeholder="Optional — refines reports (Cash Book, Bank Book, etc.)" />
          </Form.Item>
          <Space.Compact block>
            <Form.Item name="Opening_Balance" label="Opening Balance (₹)" style={{ flex: 1 }} initialValue={0}>
              <InputNumber style={{ width: '100%' }} min={0} />
            </Form.Item>
            <Form.Item name="Opening_Balance_Type" label="Dr / Cr" initialValue="Dr" style={{ width: 100 }}>
              <Select options={[{ value: 'Dr', label: 'Dr' }, { value: 'Cr', label: 'Cr' }]} />
            </Form.Item>
          </Space.Compact>
          <Button type="primary" htmlType="submit" block loading={createMutation.isPending} style={{ background: '#B8860B', borderColor: '#B8860B' }}>
            Create
          </Button>
        </Form>
      </Modal>

      <PageTour steps={tourSteps} />
    </div>
  );
}
