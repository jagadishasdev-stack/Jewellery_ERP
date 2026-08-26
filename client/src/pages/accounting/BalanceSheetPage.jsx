/**
 * Balance Sheet — Assets vs Liabilities + Capital as of a date, off
 * GET /accounting/balance-sheet. Same previously-orphaned backend as
 * Cash Book/Bank Book/P&L — see CashBookPage.jsx's header comment. This
 * is the REAL, ledger-based balance sheet (sums Dr/Cr per account from
 * tbl_accounting_entries) — not the separate, weaker /reports/financial
 * implementation the older Financial Reports page uses.
 */
import React, { useState } from 'react';
import { Table, DatePicker, Typography, Space, Tag, Row, Col, Card, Statistic, Alert } from 'antd';
import { AuditOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { accountingApi } from '../../api/modules';
import { formatCurrency } from '../../utils/calculations';
import PageTour from '../../components/PageTour';
import dayjs from 'dayjs';

const { Title, Text } = Typography;

export default function BalanceSheetPage() {
  const [asOf, setAsOf] = useState(dayjs());

  const { data, isLoading } = useQuery({
    queryKey: ['balance-sheet', asOf.format('YYYY-MM-DD')],
    queryFn: () => accountingApi.getBalanceSheet({ asOf: asOf.format('YYYY-MM-DD') }).then((r) => r.data.data),
  });

  const cols = [
    { title: 'Account', dataIndex: 'Account_Name' },
    { title: 'Amount', dataIndex: 'Amount', align: 'right', render: (v) => formatCurrency(v) },
  ];

  const tourSteps = [
    { title: '1. As-of Date', description: 'Balance Sheet is a snapshot — everything posted up to (and including) this date.' },
    { title: '2. Assets = Liabilities + Capital', description: 'That equality is the actual proof the books balance. Current Period Profit/Loss rolls into Capital automatically until a real financial-year-end close exists.' },
  ];

  return (
    <div className="page-wrapper">
      <div className="page-header">
        <Title level={4} style={{ margin: 0 }}><Space><AuditOutlined style={{ color: '#722ed1' }} />Balance Sheet</Space></Title>
        <DatePicker value={asOf} onChange={(d) => d && setAsOf(d)} format="DD-MMM-YYYY" />
      </div>

      {data && !data.isBalanced && (
        <Alert
          type="error" showIcon style={{ marginBottom: 12 }}
          message="Balance Sheet does NOT balance"
          description={`Assets ${formatCurrency(data.totalAssets)} vs Liabilities + Capital ${formatCurrency(data.totalLiabilities + data.totalCapital)} — this should never happen since every posted journal is balance-checked before it's written. Please report this.`}
        />
      )}

      <Row gutter={[16, 16]} style={{ marginBottom: 14 }}>
        <Col xs={24} md={8}>
          <Card style={{ borderRadius: 8, borderTop: '3px solid #1890ff' }}>
            <Statistic title="Total Assets" value={data?.totalAssets || 0} formatter={(v) => formatCurrency(v)} valueStyle={{ color: '#1890ff', fontWeight: 700 }} />
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card style={{ borderRadius: 8, borderTop: '3px solid #ff4d4f' }}>
            <Statistic title="Total Liabilities" value={data?.totalLiabilities || 0} formatter={(v) => formatCurrency(v)} valueStyle={{ color: '#ff4d4f', fontWeight: 700 }} />
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card style={{ borderRadius: 8, borderTop: '3px solid #722ed1' }}>
            <Statistic title="Total Capital" value={data?.totalCapital || 0} formatter={(v) => formatCurrency(v)} valueStyle={{ color: '#722ed1', fontWeight: 700 }} />
            {data?.isBalanced && <Tag color="green" style={{ marginTop: 6 }}>Balanced</Tag>}
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} md={12}>
          <Card title={<Tag color="blue">Assets</Tag>} bodyStyle={{ padding: 0 }} style={{ borderRadius: 8 }}>
            <Table size="small" columns={cols} dataSource={data?.Assets || []} loading={isLoading} rowKey="Account_Name" pagination={false} />
          </Card>
        </Col>
        <Col xs={24} md={12}>
          <Space direction="vertical" style={{ width: '100%' }} size={16}>
            <Card title={<Tag color="red">Liabilities</Tag>} bodyStyle={{ padding: 0 }} style={{ borderRadius: 8 }}>
              <Table size="small" columns={cols} dataSource={data?.Liabilities || []} loading={isLoading} rowKey="Account_Name" pagination={false} />
            </Card>
            <Card title={<Tag color="purple">Capital</Tag>} bodyStyle={{ padding: 0 }} style={{ borderRadius: 8 }}>
              <Table size="small" columns={cols} dataSource={data?.Capital || []} loading={isLoading} rowKey="Account_Name" pagination={false} />
            </Card>
          </Space>
        </Col>
      </Row>

      <PageTour steps={tourSteps} />
    </div>
  );
}
