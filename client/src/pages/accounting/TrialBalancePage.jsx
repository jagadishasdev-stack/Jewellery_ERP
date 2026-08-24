/**
 * Trial Balance — every account's net Dr or Cr balance as of a chosen
 * date, straight off the ledger (GET /accounting/trial-balance). The two
 * columns summing to the same total is the actual proof the books balance
 * — postJournal() enforces this on every single post, so this should
 * ALWAYS balance; if isBalanced ever comes back false, that's a real bug
 * worth investigating immediately, not a data-entry issue to fix by hand.
 */
import React, { useState, useRef } from 'react';
import { Table, DatePicker, Typography, Space, Tag, Button, Alert, Card } from 'antd';
import { AuditOutlined, DownloadOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { accountingApi } from '../../api/modules';
import { formatCurrency } from '../../utils/calculations';
import PageTour from '../../components/PageTour';
import dayjs from 'dayjs';

const { Title, Text } = Typography;

const GROUP_COLOR = { Assets: 'blue', Liabilities: 'red', Capital: 'purple', Income: 'green', Expenses: 'orange' };

const exportCSV = (rows, filename) => {
  if (!rows?.length) return;
  const csv = [Object.keys(rows[0]).join(','), ...rows.map((r) => Object.values(r).map((v) => `"${v ?? ''}"`).join(','))].join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = `${filename}_${dayjs().format('YYYYMMDD')}.csv`;
  a.click();
};

export default function TrialBalancePage() {
  const [asOf, setAsOf] = useState(dayjs());
  const pickerRef = useRef(null);

  const { data, isLoading } = useQuery({
    queryKey: ['trial-balance', asOf.format('YYYY-MM-DD')],
    queryFn: () => accountingApi.getTrialBalance({ to: asOf.format('YYYY-MM-DD') }).then((r) => r.data.data),
  });

  const columns = [
    { title: 'Code', dataIndex: 'Account_Code', width: 80 },
    { title: 'Account Name', dataIndex: 'Account_Name', render: (v) => <Text strong>{v}</Text> },
    { title: 'Group', dataIndex: 'Account_Group', render: (v) => <Tag color={GROUP_COLOR[v]}>{v}</Tag> },
    { title: 'Debit', dataIndex: 'Dr_Balance', render: (v) => v > 0 ? formatCurrency(v) : '-' },
    { title: 'Credit', dataIndex: 'Cr_Balance', render: (v) => v > 0 ? formatCurrency(v) : '-' },
  ];

  const tourSteps = [
    { title: '1. As-of Date', description: 'Trial Balance always reflects everything posted up to (and including) this date.', target: () => pickerRef.current },
    { title: '2. Two Columns, One Total', description: 'Debit and Credit totals must match — that is the actual proof the double-entry books are in balance, not just a display convention.' },
  ];

  return (
    <div className="page-wrapper">
      <div className="page-header">
        <Title level={4} style={{ margin: 0 }}><Space><AuditOutlined style={{ color: '#1890ff' }} />Trial Balance</Space></Title>
        <div ref={pickerRef}>
          <Space>
            <DatePicker value={asOf} onChange={(d) => d && setAsOf(d)} format="DD-MMM-YYYY" />
            <Button icon={<DownloadOutlined />} onClick={() => exportCSV(data?.rows, 'trial_balance')} disabled={!data?.rows?.length}>CSV</Button>
          </Space>
        </div>
      </div>

      {data && !data.isBalanced && (
        <Alert
          type="error" showIcon style={{ marginBottom: 12 }}
          message="Trial Balance does NOT balance"
          description={`Debit total ${formatCurrency(data.totalDr)} vs Credit total ${formatCurrency(data.totalCr)} — this should never happen since every posted journal is balance-checked before it's written. Please report this.`}
        />
      )}

      <Table
        size="small" columns={columns} dataSource={data?.rows || []} loading={isLoading}
        rowKey="Account_ID" pagination={false} scroll={{ x: 'max-content' }}
        summary={() => (
          <Table.Summary.Row style={{ background: '#FFF8E1' }}>
            <Table.Summary.Cell colSpan={3}><Text strong>TOTAL {data?.isBalanced && <Tag color="green" style={{ marginLeft: 8 }}>Balanced</Tag>}</Text></Table.Summary.Cell>
            <Table.Summary.Cell><Text strong>{formatCurrency(data?.totalDr || 0)}</Text></Table.Summary.Cell>
            <Table.Summary.Cell><Text strong>{formatCurrency(data?.totalCr || 0)}</Text></Table.Summary.Cell>
          </Table.Summary.Row>
        )}
      />

      <PageTour steps={tourSteps} />
    </div>
  );
}
