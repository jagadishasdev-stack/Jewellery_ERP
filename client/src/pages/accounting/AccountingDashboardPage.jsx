/**
 * Accounting Dashboard — the KPI strip from the design doc (today's
 * sales/purchase, receivables, payables, cash, bank, GST payable, stock
 * value), plus quick links into the rest of the Accounting module. Every
 * number here is a live read off the same ledger everything else posts
 * through (GET /accounting/dashboard) — nothing is precomputed or cached.
 */
import React, { useRef } from 'react';
import { Row, Col, Card, Statistic, Typography, Space, Tag } from 'antd';
import { useNavigate } from 'react-router-dom';
import {
  DollarCircleOutlined, BankOutlined, RiseOutlined, FallOutlined,
  WalletOutlined, GoldOutlined, PercentageOutlined, BookOutlined,
  AuditOutlined, CalendarOutlined, LineChartOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { accountingApi } from '../../api/modules';
import { formatCurrency } from '../../utils/calculations';
import PageTour from '../../components/PageTour';

const { Title, Text } = Typography;

const KPI_CARDS = [
  { key: 'todaySales', title: "Today's Sales", icon: <RiseOutlined />, color: '#52c41a' },
  { key: 'todayPurchase', title: "Today's Purchase", icon: <FallOutlined />, color: '#fa8c16' },
  { key: 'cashBalance', title: 'Cash in Hand', icon: <WalletOutlined />, color: '#1890ff' },
  { key: 'bankBalance', title: 'Bank Balance (All Banks)', icon: <BankOutlined />, color: '#1890ff' },
  { key: 'receivables', title: 'Customer Receivables', icon: <DollarCircleOutlined />, color: '#722ed1' },
  { key: 'payables', title: 'Supplier Payables', icon: <DollarCircleOutlined />, color: '#eb2f96' },
  { key: 'gstPayable', title: 'Net GST Payable', icon: <PercentageOutlined />, color: '#B8860B' },
  { key: 'stockValue', title: 'Stock Value (Cost)', icon: <GoldOutlined />, color: '#faad14' },
];

const QUICK_LINKS = [
  { title: 'Chart of Accounts', desc: 'Every ledger, grouped by type', icon: <BookOutlined style={{ fontSize: 28, color: '#1890ff' }} />, route: '/accounting/chart-of-accounts', color: '#1890ff' },
  { title: 'Ledger', desc: 'Any account, full history', icon: <BookOutlined style={{ fontSize: 28, color: '#52c41a' }} />, route: '/accounting/ledger', color: '#52c41a' },
  { title: 'Trial Balance', desc: 'Every account, net Dr/Cr', icon: <AuditOutlined style={{ fontSize: 28, color: '#B8860B' }} />, route: '/accounting/trial-balance', color: '#B8860B' },
  { title: 'Day Book', desc: 'All vouchers for a day', icon: <CalendarOutlined style={{ fontSize: 28, color: '#722ed1' }} />, route: '/accounting/day-book', color: '#722ed1' },
  { title: 'Voucher Entry', desc: 'Receipt / Payment / Contra / Journal', icon: <WalletOutlined style={{ fontSize: 28, color: '#eb2f96' }} />, route: '/accounting/vouchers', color: '#eb2f96' },
  { title: 'Cash Book', desc: 'Cash Account, full history + running balance', icon: <WalletOutlined style={{ fontSize: 28, color: '#52c41a' }} />, route: '/accounting/cash-book', color: '#52c41a' },
  { title: 'Bank Book', desc: 'One book per real bank ledger', icon: <BankOutlined style={{ fontSize: 28, color: '#1890ff' }} />, route: '/accounting/bank-book', color: '#1890ff' },
  { title: 'Profit & Loss', desc: 'Income vs Expenses for a period', icon: <LineChartOutlined style={{ fontSize: 28, color: '#B8860B' }} />, route: '/accounting/profit-loss', color: '#B8860B' },
  { title: 'Balance Sheet', desc: 'Assets vs Liabilities + Capital', icon: <AuditOutlined style={{ fontSize: 28, color: '#722ed1' }} />, route: '/accounting/balance-sheet', color: '#722ed1' },
];

export default function AccountingDashboardPage() {
  const navigate = useNavigate();
  const kpiRef = useRef(null);

  const { data, isLoading } = useQuery({
    queryKey: ['accounting-dashboard'],
    queryFn: () => accountingApi.getDashboard().then((r) => r.data.data),
    refetchInterval: 60000,
  });

  const tourSteps = [
    { title: '1. Live Numbers', description: 'Every figure here is read straight off the ledger the moment you load this page — nothing is cached or precomputed, so it is always current.', target: () => kpiRef.current },
    { title: '2. Jump Into Any Book', description: 'Chart of Accounts, Ledger, Trial Balance, Day Book, and manual Voucher Entry are all one click away below.' },
  ];

  return (
    <div className="page-wrapper">
      <div className="page-header">
        <div>
          <Title level={4} style={{ margin: 0 }}><Space><BankOutlined style={{ color: '#1890ff' }} />Accounting Dashboard</Space></Title>
          <Text type="secondary" style={{ fontSize: 12 }}>Real double-entry books — every number below traces back to a posted voucher.</Text>
        </div>
      </div>

      <Row ref={kpiRef} gutter={[16, 16]} style={{ marginBottom: 24 }}>
        {KPI_CARDS.map((k) => (
          <Col xs={12} sm={8} md={6} key={k.key}>
            <Card size="small" loading={isLoading} style={{ borderRadius: 10, borderTop: `3px solid ${k.color}` }}>
              <Statistic
                title={<Text style={{ fontSize: 11, color: '#888' }}>{k.title}</Text>}
                value={formatCurrency(data?.[k.key] || 0)}
                prefix={k.icon}
                valueStyle={{ fontSize: 16, fontWeight: 700, color: k.color }}
              />
            </Card>
          </Col>
        ))}
      </Row>

      <Title level={5} style={{ marginBottom: 12 }}>Books &amp; Reports</Title>
      <Row gutter={[16, 16]}>
        {QUICK_LINKS.map((l) => (
          <Col xs={24} sm={12} lg={8} key={l.title}>
            <Card hoverable onClick={() => navigate(l.route)} style={{ borderRadius: 12, border: `2px solid ${l.color}22`, cursor: 'pointer' }} bodyStyle={{ padding: 18 }}>
              <Space align="start">
                {l.icon}
                <div>
                  <Text strong style={{ color: l.color, fontSize: 15 }}>{l.title}</Text>
                  <div><Text type="secondary" style={{ fontSize: 12 }}>{l.desc}</Text></div>
                </div>
              </Space>
            </Card>
          </Col>
        ))}
      </Row>

      <PageTour steps={tourSteps} />
    </div>
  );
}
