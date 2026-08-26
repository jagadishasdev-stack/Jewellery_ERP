/**
 * Cash Book — the Cash Account's full ledger with a running balance, off
 * GET /accounting/cash-book. The backend for this has existed since the
 * accounting module was built; this page (and the API wrapper that calls
 * it) never had anywhere to be reached from — found via audit alongside
 * Bank Book/P&L/Balance Sheet, all four in the same state.
 */
import React, { useState } from 'react';
import { Table, DatePicker, Typography, Space, Tag, Button, Card, Statistic, Row, Col } from 'antd';
import { WalletOutlined, DownloadOutlined } from '@ant-design/icons';
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

export default function CashBookPage() {
  const [range, setRange] = useState([dayjs().startOf('month'), dayjs()]);

  const { data, isLoading } = useQuery({
    queryKey: ['cash-book', range[0]?.format('YYYY-MM-DD'), range[1]?.format('YYYY-MM-DD')],
    queryFn: () => accountingApi.getCashBook({ from: range[0]?.format('YYYY-MM-DD'), to: range[1]?.format('YYYY-MM-DD') }).then((r) => r.data.data),
  });

  const columns = [
    { title: 'Date', dataIndex: 'Entry_Date', render: (v) => dayjs(v).format('DD-MMM-YYYY') },
    { title: 'Voucher #', dataIndex: 'Journal_Number', render: (v) => <Text code style={{ fontSize: 11 }}>{v}</Text> },
    { title: 'Type', dataIndex: 'Source_Type', render: (v) => <Tag>{v}</Tag> },
    { title: 'Narration', dataIndex: 'Narration' },
    { title: 'Debit', render: (_, r) => r.Entry_Type === 'Dr' ? formatCurrency(r.Amount) : '-' },
    { title: 'Credit', render: (_, r) => r.Entry_Type === 'Cr' ? formatCurrency(r.Amount) : '-' },
    { title: 'Balance', dataIndex: 'Balance', render: (v) => <Text strong>{formatCurrency(v)}</Text> },
  ];

  const tourSteps = [
    { title: '1. Cash Account, Full History', description: 'Every entry that touched the Cash Account ledger, in date order, with a running balance — exactly like a physical cash book.' },
    { title: '2. Pick a Period', description: 'Defaults to this month — widen the range to see further back.' },
  ];

  return (
    <div className="page-wrapper">
      <div className="page-header">
        <Title level={4} style={{ margin: 0 }}><Space><WalletOutlined style={{ color: '#52c41a' }} />Cash Book</Space></Title>
        <Space>
          <RangePicker value={range} onChange={(v) => v && setRange(v)} format="DD-MMM-YYYY" />
          <Button icon={<DownloadOutlined />} onClick={() => exportCSV(data?.entries, 'cash_book')} disabled={!data?.entries?.length}>CSV</Button>
        </Space>
      </div>

      <Row gutter={[16, 16]} style={{ marginBottom: 14 }}>
        <Col xs={24} md={8}>
          <Card style={{ borderRadius: 8, borderTop: '3px solid #52c41a' }}>
            <Statistic title="Closing Balance" value={data?.closingBalance || 0} formatter={(v) => formatCurrency(v)} valueStyle={{ color: '#52c41a', fontWeight: 700 }} />
          </Card>
        </Col>
      </Row>

      <Table
        size="small" columns={columns} dataSource={data?.entries || []} loading={isLoading}
        rowKey={(r, i) => i} pagination={{ pageSize: 30 }} scroll={{ x: 'max-content' }}
      />

      <PageTour steps={tourSteps} />
    </div>
  );
}
