/**
 * Profit & Loss — Income vs Expenses for a period, off GET /accounting/
 * profit-loss. Same previously-orphaned backend as Cash Book/Bank Book —
 * see CashBookPage.jsx's header comment.
 */
import React, { useState } from 'react';
import { Table, DatePicker, Typography, Space, Tag, Row, Col, Card, Statistic, Alert } from 'antd';
import { LineChartOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { accountingApi } from '../../api/modules';
import { formatCurrency } from '../../utils/calculations';
import PageTour from '../../components/PageTour';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

export default function ProfitLossPage() {
  const [range, setRange] = useState(null); // null = server's own default financial-year window

  const { data, isLoading } = useQuery({
    queryKey: ['profit-loss', range?.[0]?.format('YYYY-MM-DD'), range?.[1]?.format('YYYY-MM-DD')],
    queryFn: () => accountingApi.getProfitLoss(range ? { from: range[0].format('YYYY-MM-DD'), to: range[1].format('YYYY-MM-DD') } : {}).then((r) => r.data.data),
  });

  const cols = (label) => [
    { title: label, dataIndex: 'Account_Name' },
    { title: 'Amount', dataIndex: 'Amount', align: 'right', render: (v) => formatCurrency(v) },
  ];

  const tourSteps = [
    { title: '1. Income vs Expenses', description: 'Every Income and Expense ledger with real activity in the period — computed straight from the same journal engine every other report reads, so it can never drift from what was actually posted (including Cost of Goods Sold on every sale).' },
    { title: '2. Net Profit', description: 'Income total minus Expense total — this is the actual bottom line for the period.' },
  ];

  return (
    <div className="page-wrapper">
      <div className="page-header">
        <Title level={4} style={{ margin: 0 }}><Space><LineChartOutlined style={{ color: '#B8860B' }} />Profit & Loss</Space></Title>
        <RangePicker value={range} onChange={(v) => setRange(v)} format="DD-MMM-YYYY" placeholder={['Financial Year Start', 'Today']} />
      </div>

      {data && (
        <Row gutter={[16, 16]} style={{ marginBottom: 14 }}>
          <Col xs={24} md={8}>
            <Card style={{ borderRadius: 8, borderTop: '3px solid #52c41a' }}>
              <Statistic title="Total Income" value={data.totalIncome} formatter={(v) => formatCurrency(v)} valueStyle={{ color: '#52c41a', fontWeight: 700 }} />
            </Card>
          </Col>
          <Col xs={24} md={8}>
            <Card style={{ borderRadius: 8, borderTop: '3px solid #ff4d4f' }}>
              <Statistic title="Total Expenses" value={data.totalExpense} formatter={(v) => formatCurrency(v)} valueStyle={{ color: '#ff4d4f', fontWeight: 700 }} />
            </Card>
          </Col>
          <Col xs={24} md={8}>
            <Card style={{ borderRadius: 8, borderTop: `3px solid ${data.netProfit >= 0 ? '#B8860B' : '#ff4d4f'}` }}>
              <Statistic title={data.netProfit >= 0 ? 'Net Profit' : 'Net Loss'} value={Math.abs(data.netProfit)} formatter={(v) => formatCurrency(v)} valueStyle={{ color: data.netProfit >= 0 ? '#B8860B' : '#ff4d4f', fontWeight: 700 }} />
            </Card>
          </Col>
        </Row>
      )}

      {data && <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>{dayjs(data.from).format('DD-MMM-YYYY')} to {dayjs(data.to).format('DD-MMM-YYYY')}</Text>}

      <Row gutter={[16, 16]}>
        <Col xs={24} md={12}>
          <Card title={<Tag color="green">Income</Tag>} bodyStyle={{ padding: 0 }} style={{ borderRadius: 8 }}>
            <Table size="small" columns={cols('Account')} dataSource={data?.income || []} loading={isLoading} rowKey="Account_Name" pagination={false} />
          </Card>
        </Col>
        <Col xs={24} md={12}>
          <Card title={<Tag color="red">Expenses</Tag>} bodyStyle={{ padding: 0 }} style={{ borderRadius: 8 }}>
            <Table size="small" columns={cols('Account')} dataSource={data?.expenses || []} loading={isLoading} rowKey="Account_Name" pagination={false} />
          </Card>
        </Col>
      </Row>

      {data && !data.income?.length && !data.expenses?.length && (
        <Alert style={{ marginTop: 16 }} type="info" showIcon message="No income or expense activity in this period." />
      )}

      <PageTour steps={tourSteps} />
    </div>
  );
}
