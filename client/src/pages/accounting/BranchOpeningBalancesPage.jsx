/**
 * Branch Opening Balances — Multi-Branch Management. Trial Balance / Cash
 * Book / Bank Book only become genuinely correct for a specific branch
 * once each account's real opening balance at that branch is allocated
 * here (see server's tbl_account_branch_opening_balance migration
 * comment for the full reasoning: an account's Opening_Balance on Chart
 * of Accounts is tenant-wide only, and a branch's real starting
 * cash-in-hand/bank balance is its own number, not a fraction of that).
 *
 * "All Branches" mode is completely unaffected by anything entered here
 * — it always reads the tenant-wide Opening_Balance directly, unchanged.
 * An account with nothing allocated for a branch defaults to ₹0 Dr on
 * that branch's reports, never a guess.
 */
import React, { useState } from 'react';
import { Table, Select, InputNumber, Button, Typography, Space, Tag, Collapse, Alert, message } from 'antd';
import { BankOutlined, SaveOutlined, EditOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { accountingApi } from '../../api/modules';
import { useBranch } from '../../contexts/BranchContext';
import { formatCurrency } from '../../utils/calculations';
import PageTour from '../../components/PageTour';

const { Title, Text } = Typography;
const GROUPS = ['Assets', 'Liabilities', 'Capital', 'Income', 'Expenses'];
const GROUP_COLOR = { Assets: 'blue', Liabilities: 'red', Capital: 'purple', Income: 'green', Expenses: 'orange' };

export default function BranchOpeningBalancesPage() {
  const qc = useQueryClient();
  const { branches } = useBranch();
  const [branchId, setBranchId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState({ amount: 0, type: 'Dr' });

  const { data: rows, isLoading } = useQuery({
    queryKey: ['branch-opening-balances', branchId],
    queryFn: () => accountingApi.getBranchOpeningBalances(branchId).then((r) => r.data.data || []),
    enabled: !!branchId,
  });

  const saveMutation = useMutation({
    mutationFn: accountingApi.saveBranchOpeningBalance,
    onSuccess: () => { message.success('Branch opening balance saved.'); qc.invalidateQueries({ queryKey: ['branch-opening-balances', branchId] }); setEditingId(null); },
    onError: (err) => message.error(err.response?.data?.message || 'Failed to save.'),
  });

  const startEdit = (row) => { setEditingId(row.Account_ID); setDraft({ amount: row.Branch_Opening_Balance, type: row.Branch_Opening_Balance_Type }); };
  const save = (row) => saveMutation.mutate({ Account_ID: row.Account_ID, Branch_ID: branchId, Opening_Balance: draft.amount, Opening_Balance_Type: draft.type });

  const columns = [
    { title: 'Code', dataIndex: 'Account_Code', width: 80 },
    { title: 'Account Name', dataIndex: 'Account_Name', render: (v) => <Text strong>{v}</Text> },
    { title: 'Sub Group', dataIndex: 'Account_Sub_Group', render: (v) => v ? <Tag>{v}</Tag> : '-' },
    { title: 'Tenant-Wide Opening (reference only)', render: (_, r) => r.Tenant_Opening_Balance > 0 ? `${formatCurrency(r.Tenant_Opening_Balance)} ${r.Tenant_Opening_Balance_Type}` : '-' },
    {
      title: 'This Branch\'s Opening Balance', width: 320,
      render: (_, r) => {
        if (editingId === r.Account_ID) {
          return (
            <Space.Compact>
              <InputNumber min={0} value={draft.amount} onChange={(v) => setDraft((d) => ({ ...d, amount: v || 0 }))} style={{ width: 140 }} autoFocus />
              <Select value={draft.type} onChange={(v) => setDraft((d) => ({ ...d, type: v }))} options={[{ value: 'Dr', label: 'Dr' }, { value: 'Cr', label: 'Cr' }]} style={{ width: 70 }} />
              <Button icon={<SaveOutlined />} type="primary" loading={saveMutation.isPending} onClick={() => save(r)} style={{ background: '#B8860B', borderColor: '#B8860B' }} />
            </Space.Compact>
          );
        }
        return (
          <Space>
            <Text strong>{r.Branch_Opening_Balance > 0 ? `${formatCurrency(r.Branch_Opening_Balance)} ${r.Branch_Opening_Balance_Type}` : '₹0'}</Text>
            {!r.Has_Branch_Balance && <Tag color="orange">Not allocated yet</Tag>}
            <Button size="small" type="text" icon={<EditOutlined />} onClick={() => startEdit(r)}>Edit</Button>
          </Space>
        );
      },
    },
  ];

  const grouped = GROUPS.map((g) => ({ group: g, rows: (rows || []).filter((a) => a.Account_Group === g) })).filter((g) => g.rows.length);
  const unallocatedCount = (rows || []).filter((r) => !r.Has_Branch_Balance).length;

  return (
    <div className="page-wrapper">
      <div className="page-header">
        <Title level={4} style={{ margin: 0 }}><Space><BankOutlined style={{ color: '#1890ff' }} />Branch Opening Balances</Space></Title>
        <Select
          placeholder="Select a branch to allocate opening balances for"
          value={branchId} onChange={setBranchId} style={{ minWidth: 280 }}
          options={(branches || []).map((b) => ({ value: b.Branch_ID, label: `${b.Branch_Name}${b.Is_Head_Office ? ' (Head Office)' : ''}` }))}
        />
      </div>

      {!branchId && (
        <Alert type="info" showIcon message="Pick a branch above" description="Each account's opening balance is allocated per branch — its Trial Balance, Cash Book, and Bank Book use these figures only when that specific branch is the active context. 'All Branches' always uses the tenant-wide Chart of Accounts figure directly, unaffected by anything here." />
      )}

      {branchId && !isLoading && (
        <Alert
          type={unallocatedCount ? 'warning' : 'success'} showIcon style={{ marginBottom: 12 }}
          message={unallocatedCount ? `${unallocatedCount} account${unallocatedCount !== 1 ? 's have' : ' has'} no opening balance allocated for this branch yet` : 'Every account has an opening balance allocated for this branch'}
          description={unallocatedCount ? 'Unallocated accounts default to ₹0 Dr on this branch\'s reports — allocate the real figure below if this branch actually carried a balance at go-live.' : undefined}
        />
      )}

      {branchId && (
        <Collapse
          defaultActiveKey={GROUPS}
          items={grouped.map(({ group, rows: gr }) => ({
            key: group,
            label: <Space><Tag color={GROUP_COLOR[group]}>{group}</Tag><Text type="secondary">{gr.length} account{gr.length !== 1 ? 's' : ''}</Text></Space>,
            children: (
              <Table
                size="small" columns={columns} dataSource={gr} loading={isLoading}
                rowKey="Account_ID" pagination={false} scroll={{ x: 'max-content' }}
              />
            ),
          }))}
        />
      )}

      <PageTour steps={[
        { title: '1. Pick a Branch', description: 'Choose which branch you\'re allocating opening balances for — this is independent of your currently active branch context.' },
        { title: '2. Allocate Real Figures', description: 'Enter what this branch\'s cash-in-hand, bank balance, etc. actually was at go-live. Unallocated accounts read as ₹0, never a guess.' },
        { title: '3. Reports Update Automatically', description: 'Once allocated, switch to this branch and open Trial Balance / Cash Book / Bank Book — they now use these figures instead of the tenant-wide ones.' },
      ]} />
    </div>
  );
}
