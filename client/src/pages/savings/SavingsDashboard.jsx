import React, { useRef } from 'react';
import { Row, Col, Card, Statistic, Typography, Tag, Space, Alert, Button } from 'antd';
import {
  TeamOutlined, GoldOutlined, DollarOutlined, WarningOutlined,
  ClockCircleOutlined, BellOutlined, RiseOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation } from '@tanstack/react-query';
import { savingsApi } from '../../api/modules';
import { formatCurrency } from '../../utils/calculations';
import PageTour from '../../components/PageTour';

const { Title, Text } = Typography;

export default function SavingsDashboard() {
  const { data: stats, isLoading } = useQuery({
    queryKey: ['savings-dashboard'],
    queryFn: () => savingsApi.getDashboard().then(r => r.data.data),
    refetchInterval: 60000,
  });

  const reminderMutation = useMutation({
    mutationFn: () => savingsApi.sendReminders(),
    onSuccess: (r) => alert(`${r.data.data.reminders_queued} reminders queued for WhatsApp.`),
  });

  // ── Walkthrough tour refs ───────────────────────────────────────────────────
  const cardsRef = useRef(null);
  const reminderRef = useRef(null);
  const tourSteps = [
    { title: '1. Savings Club at a Glance', description: 'These cards show how many customers are actively saving, how many groups are running, and how much has been collected today and this month — split by Counter vs the customer App.', target: () => cardsRef.current },
    { title: '2. Watch Overdue & Maturity', description: 'Whenever members have missed installments, or schemes are maturing this month and ready for redemption, a banner appears right here so you never miss it.' },
    { title: '3. Send Due Reminders', description: 'Click this to queue a WhatsApp reminder to every member with a pending installment — a quick way to nudge collections before month-end.', target: () => reminderRef.current },
    { title: '4. Find Your Way Around', description: 'Use the sidebar to open Scheme Master (define scheme types), Scheme Groups (monthly cohorts), Members (enroll customers), Collection (take counter payments), PDC, Draw & Reports, and Agent Management.' },
  ];

  const cards = [
    { title: 'Active Members', value: stats?.active_members || 0, icon: <TeamOutlined />, color: '#B8860B', suffix: 'members' },
    { title: 'Total Groups', value: stats?.total_groups || 0, icon: <GoldOutlined />, color: '#1890ff', suffix: 'groups' },
    { title: "Today's Collection", value: stats?.today_collection || 0, formatter: formatCurrency, icon: <DollarOutlined />, color: '#52c41a' },
    { title: "Month Collection", value: stats?.month_collection || 0, formatter: formatCurrency, icon: <RiseOutlined />, color: '#722ed1' },
    { title: "Counter Collection", value: stats?.counter_collection || 0, formatter: formatCurrency, icon: <DollarOutlined />, color: '#fa8c16' },
    { title: "App Collection", value: stats?.app_collection || 0, formatter: formatCurrency, icon: <DollarOutlined />, color: '#13c2c2' },
    { title: 'Overdue Members', value: stats?.overdue_members || 0, icon: <WarningOutlined />, color: '#ff4d4f', suffix: 'members' },
    { title: 'Maturity Due (Month)', value: stats?.maturity_due_this_month || 0, icon: <ClockCircleOutlined />, color: '#fa8c16', suffix: 'members' },
  ];

  return (
    <div className="page-wrapper">
      <div className="page-header">
        <Title level={4} style={{ margin: 0 }}>
          <Space><GoldOutlined style={{ color: '#B8860B' }} />Savings Club Dashboard</Space>
        </Title>
        <Space>
          <div ref={reminderRef}>
          <Button icon={<BellOutlined />} loading={reminderMutation.isPending}
            onClick={() => reminderMutation.mutate()}>
            Send Due Reminders
          </Button>
          </div>
        </Space>
      </div>

      {(stats?.overdue_members || 0) > 0 && (
        <Alert message={`${stats.overdue_members} members are overdue on installments`}
          type="warning" showIcon closable style={{ marginBottom: 16 }} />
      )}
      {(stats?.maturity_due_this_month || 0) > 0 && (
        <Alert message={`${stats.maturity_due_this_month} schemes matured this month — ready for redemption`}
          type="success" showIcon closable style={{ marginBottom: 16 }} />
      )}

      <div ref={cardsRef}>
      <Row gutter={[12, 12]}>
        {cards.map((c, i) => (
          <Col xs={12} sm={8} md={6} key={i}>
            <Card bodyStyle={{ padding: '14px 16px' }}
              style={{ borderRadius: 10, border: 'none', boxShadow: '0 1px 6px rgba(0,0,0,0.08)', borderTop: `3px solid ${c.color}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <Statistic
                  title={<Text style={{ fontSize: 11, color: '#888' }}>{c.title}</Text>}
                  value={c.value}
                  formatter={c.formatter ? v => c.formatter(v) : undefined}
                  suffix={c.suffix}
                  valueStyle={{ color: c.color, fontSize: 18, fontWeight: 700 }}
                />
                <div style={{ color: c.color, fontSize: 22, opacity: 0.5 }}>{c.icon}</div>
              </div>
            </Card>
          </Col>
        ))}
      </Row>
      </div>

      <PageTour steps={tourSteps} />
    </div>
  );
}
