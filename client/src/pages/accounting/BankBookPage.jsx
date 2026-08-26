/**
 * Bank Book — one book per real bank ledger (plus an "Unassigned" one
 * for older bank-mode entries that predate per-bank ledgers), off
 * GET /accounting/bank-book. Same previously-orphaned backend as Cash
 * Book — see that page's header comment.
 */
import React, { useState } from 'react';
import { Table, DatePicker, Typography, Space, Tag, Button, Card, Statistic, Row, Col, Collapse, Empty } from 'antd';
import { BankOutlined, DownloadOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { accountingApi } from '../../api/modules';
import { formatCurrency } from '../../utils/calculations';
import PageTour from '../../components/PageTour';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

const exportCSV = (rows, filename) => {
  if (!rows?.length) return;
  const csv = [Object.keys(rows[0]).join(','), ...rows.map((r) => Object.values(r).map((v) => `"${v ?? ''}"`).join(','))].join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = `${filename}_${dayjs().format('YYYYMMDD')}.csv`;
  a.click();
};

const bookColumns = [
  { title: 'Date', dataIndex: 'Entry_Date', render: (v) => dayjs(v).format('DD-MMM-YYYY') },
  { title: 'Voucher #', dataIndex: 'Journal_Number', render: (v) => <Text code style={{ fontSize: 11 }}>{v}</Text> },
  { title: 'Type', dataIndex: 'Source_Type', render: (v) => <Tag>{v}</Tag> },
  { title: 'Narration', dataIndex: 'Narration' },
  { title: 'Debit', render: (_, r) => r.Entry_Type === 'Dr' ? formatCurrency(r.Amount) : '-' },
  { title: 'Credit', render: (_, r) => r.Entry_Type === 'Cr' ? formatCurrency(r.Amount) : '-' },
  { title: 'Balance', dataIndex: 'Balance', render: (v) => <Text strong>{formatCurrency(v)}</Text> },
];

export default function BankBookPage() {
  const [range, setRange] = useState([dayjs().startOf('month'), dayjs()]);

  const { data, isLoading } = useQuery({
    queryKey: ['bank-book', range[0]?.format('YYYY-MM-DD'), range[1]?.format('YYYY-MM-DD')],
    queryFn: () => accountingApi.getBankBook({ from: range[0]?.format('YYYY-MM-DD'), to: range[1]?.format('YYYY-MM-DD') }).then((r) => r.data.data || []),
  });

  const books = (data || []).filter((b) => b.entries?.length || b.closingBalance);

  const tourSteps = [
    { title: '1. One Book Per Bank Account', description: 'Each real bank ledger gets its own card, with its own running balance — exactly like keeping a separate physical bank book per account.' },
    { title: '2. Pick a Period', description: 'Defaults to this month — widen the range to see further back.' },
  ];

  return (
    <div className="page-wrapper">
      <div className="page-header">
        <Title level={4} style={{ margin: 0 }}><Space><BankOutlined style={{ color: '#1890ff' }} />Bank Book</Space></Title>
        <RangePicker value={range} onChange={(v) => v && setRange(v)} format="DD-MMM-YYYY" />
      </div>

      {!books.length && !isLoading && (
        <Card style={{ borderRadius: 8, textAlign: 'center', padding: 40 }}>
          <Empty description="No bank ledger activity in this period" />
        </Card>
      )}

      <Collapse
        defaultActiveKey={books.map((b) => b.account?.Account_ID)}
        items={books.map((b) => ({
          key: b.account?.Account_ID,
          label: (
            <Row justify="space-between" style={{ width: '100%' }} align="middle">
              <Col><Text strong>{b.account?.Account_Name || 'Bank Account'}</Text></Col>
              <Col><Statistic value={b.closingBalance || 0} formatter={(v) => formatCurrency(v)} valueStyle={{ fontSize: 14, fontWeight: 700, color: '#1890ff' }} /></Col>
            </Row>
          ),
          extra: <Button size="small" icon={<DownloadOutlined />} onClick={(e) => { e.stopPropagation(); exportCSV(b.entries, (b.account?.Account_Name || 'bank_book').replace(/\s+/g, '_')); }} disabled={!b.entries?.length}>CSV</Button>,
          children: (
            <Table
              size="small" columns={bookColumns} dataSource={b.entries || []} loading={isLoading}
              rowKey={(r, i) => i} pagination={{ pageSize: 20 }} scroll={{ x: 'max-content' }}
            />
          ),
        }))}
      />

      <PageTour steps={tourSteps} />
    </div>
  );
}
