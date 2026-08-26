/**
 * Admin Analytics Dashboard — ADMIN ONLY
 * Full analytics: Sales trends, inventory health, scheme status,
 * user activity, security summary, target tracking, top items.
 */
import React, { useState, useRef } from 'react';
import {
  Row, Col, Card, Typography, DatePicker, Space, Tag, Button,
  Table, Statistic, Progress, Alert, Badge, Timeline, Divider,
  Tabs,
} from 'antd';
import {
  DashboardOutlined, BarChartOutlined, GoldOutlined, SafetyOutlined,
  TeamOutlined, RiseOutlined, ShopOutlined, AuditOutlined,
  UserOutlined, BranchesOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { auditApi, reportsApi, savingsApi, tenantApi, salesApi } from '../../api/modules';
import { useAuthStore } from '../../store/authStore';
import { formatCurrency } from '../../utils/calculations';
import PageTour from '../../components/PageTour';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

const ACTION_COLORS = {
  INSERT: '#52c41a', UPDATE: '#1890ff', DELETE: '#ff4d4f',
  LOGIN: '#13c2c2', PRINT: '#fa8c16', APPROVE: '#722ed1',
};

export default function AdminDashboard() {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const isAdmin = user?.roleName === 'Super Admin' || user?.roleName === 'Admin' || user?.permissions?.global_master || user?.permissions?.tenant_management;

  const [dateRange, setDateRange] = useState([dayjs().startOf('month'), dayjs()]);
  const fromDate = dateRange[0].format('YYYY-MM-DD');
  const toDate   = dateRange[1].format('YYYY-MM-DD');
  const today    = dayjs().format('YYYY-MM-DD');

  // ── Walkthrough tour refs ───────────────────────────────────────────────────
  const dateRangeRef = useRef(null);
  const kpiRef = useRef(null);
  const targetRef = useRef(null);
  const tabsRef = useRef(null);
  const tourSteps = [
    { title: '1. Pick Your Period', description: 'Choose Today, This Week, This Month, Last Month or a custom range — most of the numbers below update to match.', target: () => dateRangeRef.current },
    { title: '2. KPI Snapshot', description: 'A quick read on the business right now — today\'s revenue and bill count, period revenue and GST collected, stock value, active sessions, and scheme members.', target: () => kpiRef.current },
    { title: '3. Target Achievement', description: 'Tracks progress toward the monthly sales and cash-collection targets, with a shortcut to the full management report.', target: () => targetRef.current },
    { title: '4. Explore Other Views', description: 'Switch tabs to see the Security Overview (logins, deletes, live activity feed), User Analytics (per-staff action counts), and Scheme Analytics (Savings Club membership and collections).', target: () => tabsRef.current },
  ];

  // All data fetches
  const { data: auditSummary }  = useQuery({ queryKey: ['adm-audit'], queryFn: () => auditApi.getSummary().then(r => r.data.data), enabled: isAdmin, refetchInterval: 30000 });
  const { data: salesData }     = useQuery({ queryKey: ['adm-sales', fromDate, toDate], queryFn: () => reportsApi.salesSummary({ fromDate, toDate }).then(r => r.data.data), enabled: isAdmin });
  const { data: todaySales }    = useQuery({ queryKey: ['adm-today', today], queryFn: () => salesApi.dailyReport(today).then(r => r.data.data), enabled: isAdmin });
  const { data: inventoryData } = useQuery({ queryKey: ['adm-inv'], queryFn: () => reportsApi.inventoryValue().then(r => r.data.data), enabled: isAdmin });
  const { data: counterData }   = useQuery({ queryKey: ['adm-counter', fromDate, toDate], queryFn: () => reportsApi.counterSummary({ fromDate, toDate }).then(r => r.data.data), enabled: isAdmin });
  const { data: schemeData }    = useQuery({ queryKey: ['adm-scheme'], queryFn: () => savingsApi.getDashboard().then(r => r.data.data), enabled: isAdmin });
  const { data: tenantStats }   = useQuery({ queryKey: ['adm-tenant'], queryFn: () => tenantApi.getStats().then(r => r.data.data), enabled: isAdmin });
  const { data: activityData }  = useQuery({ queryKey: ['adm-activity', fromDate, toDate], queryFn: () => auditApi.getUserActivity({ fromDate, toDate }).then(r => r.data.data || []), enabled: isAdmin });
  const { data: itemSales }     = useQuery({ queryKey: ['adm-items', fromDate, toDate], queryFn: () => reportsApi.itemWiseSales({ fromDate, toDate }).then(r => r.data.data || []), enabled: isAdmin });

  if (!isAdmin) {
    return (
      <div style={{ padding: 60, textAlign: 'center' }}>
        <SafetyOutlined style={{ fontSize: 64, color: '#ff4d4f' }} />
        <Title level={3} style={{ color: '#ff4d4f', marginTop: 16 }}>Admin Access Only</Title>
        <Text type="secondary">This dashboard is restricted to administrators.</Text>
      </div>
    );
  }

  const s    = salesData?.summary    || {};
  const ts   = todaySales?.summary   || {};
  const inv  = inventoryData?.overall || {};
  const sch  = schemeData            || {};

  // Target (₹10L/month — configurable in settings later)
  const SALES_TARGET   = 1000000;
  const COLLECT_TARGET = 800000;
  const salesAchieved  = parseFloat(s.total_revenue  || 0);
  const collectAchieved= parseFloat(s.total_collected || 0);

  const kpiCards = [
    { title: "Today's Revenue",    value: parseFloat(ts.total_revenue  || 0), fmt: formatCurrency, color: '#B8860B',  icon: <RiseOutlined /> },
    { title: "Today's Bills",      value: parseInt(ts.total_bills       || 0), color: '#1890ff',  icon: <ShopOutlined /> },
    { title: 'Period Revenue',     value: salesAchieved,                        fmt: formatCurrency, color: '#52c41a',  icon: <BarChartOutlined /> },
    { title: 'GST Collected',      value: parseFloat(s.total_gst        || 0), fmt: formatCurrency, color: '#722ed1',  icon: <SafetyOutlined /> },
    { title: 'Stock (MRP)',        value: parseFloat(inv.total_mrp       || 0), fmt: formatCurrency, color: '#fa8c16',  icon: <GoldOutlined /> },
    { title: 'Active Sessions',    value: parseInt(auditSummary?.activeSessions || 0), color: '#13c2c2',  icon: <UserOutlined /> },
    { title: 'Scheme Members',     value: parseInt(sch.active_members   || 0), color: '#eb2f96', icon: <TeamOutlined /> },
    { title: 'Total Stock Pieces', value: parseInt(inv.total_pieces      || 0), color: '#888',     icon: <GoldOutlined /> },
  ];

  const tabItems = [
    {
      key: 'overview', label: <span><DashboardOutlined /> Overview</span>,
      children: (
        <>
          {/* KPI Row */}
          <div ref={kpiRef}>
          <Row gutter={[10, 10]} style={{ marginBottom: 16 }}>
            {kpiCards.map((c, i) => (
              <Col xs={12} sm={8} lg={6} xl={3} key={i}>
                <Card bodyStyle={{ padding: '12px 12px' }}
                  style={{ borderRadius: 8, border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,.07)', borderTop: `3px solid ${c.color}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <Statistic
                      title={<Text style={{ fontSize: 10, color: '#888', lineHeight: 1.3 }}>{c.title}</Text>}
                      value={c.value}
                      formatter={c.fmt ? v => c.fmt(v) : undefined}
                      valueStyle={{ color: c.color, fontSize: 16, fontWeight: 700 }}
                    />
                    <div style={{ color: c.color, fontSize: 18, opacity: 0.5 }}>{c.icon}</div>
                  </div>
                </Card>
              </Col>
            ))}
          </Row>
          </div>

          <Row gutter={[14, 14]}>
            {/* Sales vs Target */}
            <Col xs={24} md={8}>
              <div ref={targetRef}>
              <Card title="🎯 Target Achievement" style={{ borderRadius: 8 }} bodyStyle={{ padding: '16px 20px' }}>
                <div style={{ marginBottom: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <Text strong style={{ fontSize: 12 }}>Sales Revenue</Text>
                    <Text style={{ fontSize: 12, color: salesAchieved >= SALES_TARGET ? '#52c41a' : '#fa8c16' }}>
                      {Math.round((salesAchieved / SALES_TARGET) * 100)}%
                    </Text>
                  </div>
                  <Progress
                    percent={Math.min(100, Math.round((salesAchieved / SALES_TARGET) * 100))}
                    strokeColor={salesAchieved >= SALES_TARGET ? '#52c41a' : '#B8860B'}
                    format={() => formatCurrency(salesAchieved)}
                  />
                  <Text type="secondary" style={{ fontSize: 11 }}>Target: {formatCurrency(SALES_TARGET)}</Text>
                </div>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <Text strong style={{ fontSize: 12 }}>Cash Collection</Text>
                    <Text style={{ fontSize: 12, color: collectAchieved >= COLLECT_TARGET ? '#52c41a' : '#fa8c16' }}>
                      {Math.round((collectAchieved / COLLECT_TARGET) * 100)}%
                    </Text>
                  </div>
                  <Progress
                    percent={Math.min(100, Math.round((collectAchieved / COLLECT_TARGET) * 100))}
                    strokeColor={collectAchieved >= COLLECT_TARGET ? '#52c41a' : '#1890ff'}
                    format={() => formatCurrency(collectAchieved)}
                  />
                  <Text type="secondary" style={{ fontSize: 11 }}>Target: {formatCurrency(COLLECT_TARGET)}</Text>
                </div>
                <Divider style={{ margin: '12px 0 8px' }} />
                <Button type="link" size="small" onClick={() => navigate('/reports/management-reports')}>
                  View Full Report →
                </Button>
              </Card>
              </div>
            </Col>

            {/* Daily trend table */}
            <Col xs={24} md={16}>
              <Card title="📈 Daily Sales Trend" bodyStyle={{ padding: 0 }} style={{ borderRadius: 8 }}
                extra={<Button type="link" size="small" onClick={() => navigate('/reports/sales-reports')}>Full Report →</Button>}>
                <Table
            scroll={{ x: "max-content" }}
                  size="small"
                  dataSource={(salesData?.dailyBreakdown || []).slice(-7)}
                  rowKey="date"
                  pagination={false}
                  columns={[
                    { title: 'Date',    dataIndex: 'date',    render: v => <Text style={{ fontSize: 12 }}>{dayjs(v).format('ddd, DD-MMM')}</Text> },
                    { title: 'Bills',   dataIndex: 'bills',   width: 60, render: v => <Tag color="blue">{v}</Tag> },
                    { title: 'Revenue', dataIndex: 'revenue', render: v => <Text strong style={{ color: '#52c41a' }}>{formatCurrency(v)}</Text> },
                    { title: 'GST',     dataIndex: 'gst',     render: v => formatCurrency(v || 0) },
                    { title: 'Trend', render: (_, r) => {
                      const max = Math.max(...(salesData?.dailyBreakdown || []).map(d => parseFloat(d.revenue || 0)), 1);
                      return <Progress percent={Math.round((parseFloat(r.revenue || 0) / max) * 100)} strokeColor="#B8860B" showInfo={false} size="small" />;
                    }},
                  ]}
                />
              </Card>
            </Col>
          </Row>

          <Row gutter={[14, 14]} style={{ marginTop: 14 }}>
            {/* Top selling items */}
            <Col xs={24} md={12}>
              <Card title="🏆 Top Selling Items (Period)" bodyStyle={{ padding: 0 }} style={{ borderRadius: 8 }}
                extra={<Button type="link" size="small" onClick={() => navigate('/reports/inventory-reports')}>Inventory →</Button>}>
                <Table
            scroll={{ x: "max-content" }}
                  size="small"
                  dataSource={(itemSales || []).slice(0, 8)}
                  rowKey="Type_Name"
                  pagination={false}
                  columns={[
                    { title: 'Item', dataIndex: 'Type_Name', render: v => <Text strong style={{ fontSize: 12 }}>{v}</Text> },
                    { title: 'Qty', dataIndex: 'qty_sold', width: 60, render: v => <Tag color="blue">{v}</Tag> },
                    { title: 'Revenue', dataIndex: 'revenue', render: v => <Text style={{ color: '#B8860B', fontSize: 12 }}>{formatCurrency(v)}</Text> },
                    { title: '% Share', render: (_, r) => {
                      const total = parseFloat(s.total_revenue || 1);
                      return <Progress percent={Math.round((parseFloat(r.revenue || 0) / total) * 100)} size="small" strokeColor="#B8860B" showInfo={false} />;
                    }},
                  ]}
                />
              </Card>
            </Col>

            {/* Counter performance */}
            <Col xs={24} md={12}>
              <Card title="🛒 Counter Performance" bodyStyle={{ padding: 0 }} style={{ borderRadius: 8 }}
                extra={<Button type="link" size="small" onClick={() => navigate('/reports/management-reports?tab=branch')}>Branch →</Button>}>
                <Table
            scroll={{ x: "max-content" }}
                  size="small"
                  dataSource={(counterData?.counterStats || []).slice(0, 8)}
                  rowKey="counter"
                  pagination={false}
                  columns={[
                    { title: 'Counter', dataIndex: 'counter', render: v => <Text strong style={{ fontSize: 12 }}>{v}</Text> },
                    { title: 'Bills', dataIndex: 'total_bills', width: 60, render: v => <Tag color="blue">{v}</Tag> },
                    { title: 'Revenue', dataIndex: 'total_revenue', render: v => <Text style={{ color: '#52c41a', fontSize: 12 }}>{formatCurrency(v)}</Text> },
                    { title: 'Avg Bill', render: (_, r) => formatCurrency(r.total_bills > 0 ? parseFloat(r.total_revenue || 0) / parseInt(r.total_bills) : 0) },
                  ]}
                />
              </Card>
            </Col>
          </Row>
        </>
      ),
    },
    {
      key: 'security', label: <span><SafetyOutlined /> Security Overview</span>,
      children: (
        <>
          <Row gutter={[10, 10]} style={{ marginBottom: 14 }}>
            {[
              { title: "Today's Actions", value: auditSummary?.todayLogs || 0, color: '#1890ff' },
              { title: "Today's Logins",  value: auditSummary?.todayLogins || 0, color: '#52c41a' },
              { title: 'Active Sessions', value: auditSummary?.activeSessions || 0, color: '#722ed1' },
              { title: 'Deletions Today', value: auditSummary?.deletedToday || 0, color: '#ff4d4f' },
              { title: 'Total Audit Logs',value: auditSummary?.totalLogs || 0, color: '#B8860B' },
            ].map((c, i) => (
              <Col xs={12} sm={8} lg={4} key={i}>
                <Card bodyStyle={{ padding: '12px 14px' }} style={{ borderRadius: 8, border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,.07)', borderTop: `3px solid ${c.color}` }}>
                  <Statistic title={<Text style={{ fontSize: 11, color: '#888' }}>{c.title}</Text>}
                    value={c.value} valueStyle={{ color: c.color, fontSize: 20, fontWeight: 700 }} />
                </Card>
              </Col>
            ))}
          </Row>

          <Row gutter={[14, 14]}>
            <Col xs={24} md={10}>
              <Card title="Actions by Type — Today" style={{ borderRadius: 8 }} bodyStyle={{ padding: 0 }}>
                <Table
            scroll={{ x: "max-content" }}
                  size="small"
                  dataSource={auditSummary?.byAction || []}
                  rowKey="Action_Type"
                  pagination={false}
                  columns={[
                    { title: 'Action', dataIndex: 'Action_Type', render: v => <Tag color={ACTION_COLORS[v] || 'default'}>{v}</Tag> },
                    { title: 'Count', dataIndex: 'count', render: v => <Badge count={parseInt(v)} showZero style={{ background: '#B8860B' }} /> },
                  ]}
                />
              </Card>
            </Col>
            <Col xs={24} md={14}>
              <Card title="Recent Security Events" style={{ borderRadius: 8 }}>
                <Timeline
                  items={(auditSummary?.recentActivity || []).map(a => ({
                    color: ACTION_COLORS[a.Action_Type] || 'blue',
                    children: (
                      <div style={{ fontSize: 12 }}>
                        <Space size={6}>
                          <Text strong>{a.Full_Name || a.Username}</Text>
                          <Tag color={ACTION_COLORS[a.Action_Type] || 'blue'} style={{ fontSize: 10 }}>{a.Action_Type}</Tag>
                          <Text type="secondary">{a.Table_Name?.replace('tbl_', '')}</Text>
                        </Space>
                        <br />
                        <Text type="secondary" style={{ fontSize: 11 }}>
                          {dayjs(a.Created_Date).format('HH:mm:ss')} · IP: {a.IP_Address || '-'}
                        </Text>
                      </div>
                    ),
                  }))}
                />
                <Button type="link" onClick={() => navigate('/admin/audit')}>View Full Audit Log →</Button>
              </Card>
            </Col>
          </Row>
        </>
      ),
    },
    {
      key: 'users', label: <span><UserOutlined /> User Analytics</span>,
      children: (
        <Card title="User Activity Analytics" bodyStyle={{ padding: 0 }} style={{ borderRadius: 8 }}>
          <Table
            scroll={{ x: "max-content" }}
            size="small"
            dataSource={activityData || []}
            rowKey="User_ID"
            pagination={{ pageSize: 20 }}
            columns={[
              { title: 'User', render: (_, r) => <div><Text strong style={{ fontSize: 12 }}>{r.Full_Name || r.Username}</Text><br /><Text code style={{ fontSize: 11 }}>@{r.Username}</Text></div> },
              { title: 'Total', dataIndex: 'total_actions', render: v => <Badge count={parseInt(v)} showZero style={{ background: '#B8860B' }} /> },
              { title: 'Creates', dataIndex: 'inserts',  render: v => <Tag color="green">{v || 0}</Tag> },
              { title: 'Updates', dataIndex: 'updates',  render: v => <Tag color="blue">{v || 0}</Tag> },
              { title: 'Deletes', dataIndex: 'deletes',  render: v => <Tag color="red">{v || 0}</Tag> },
              { title: 'Logins',  dataIndex: 'logins',   render: v => <Tag color="cyan">{v || 0}</Tag> },
              { title: 'Prints',  dataIndex: 'prints',   render: v => <Tag color="orange">{v || 0}</Tag> },
              { title: 'Last Active', dataIndex: 'last_activity', render: v => v ? dayjs(v).format('DD-MMM HH:mm') : '-' },
              { title: 'Activity', render: (_, r) => {
                const max = Math.max(...(activityData || []).map(u => parseInt(u.total_actions || 0)), 1);
                return <Progress percent={Math.round((parseInt(r.total_actions || 0) / max) * 100)} size="small" strokeColor="#B8860B" showInfo={false} />;
              }},
            ]}
          />
        </Card>
      ),
    },
    {
      key: 'scheme_analytics', label: <span><GoldOutlined /> Scheme Analytics</span>,
      children: (
        <Row gutter={[14, 14]}>
          {[
            { title: 'Active Members',    value: parseInt(sch.active_members  || 0), color: '#B8860B' },
            { title: 'Matured Members',   value: parseInt(sch.matured_members || 0), color: '#52c41a' },
            { title: 'Today Collection',  value: parseFloat(sch.today_collection || 0), color: '#1890ff', fmt: formatCurrency },
            { title: 'Month Collection',  value: parseFloat(sch.month_collection || 0), color: '#722ed1', fmt: formatCurrency },
            { title: 'Overdue Members',   value: parseInt(sch.overdue_members || 0), color: '#ff4d4f' },
            { title: 'Maturity This Month', value: parseInt(sch.maturity_due_this_month || 0), color: '#fa8c16' },
          ].map((c, i) => (
            <Col xs={12} sm={8} lg={4} key={i}>
              <Card bodyStyle={{ padding: '12px 14px' }} style={{ borderRadius: 8, border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,.07)', borderTop: `3px solid ${c.color}` }}>
                <Statistic
                  title={<Text style={{ fontSize: 11, color: '#888' }}>{c.title}</Text>}
                  value={c.value} formatter={c.fmt ? v => c.fmt(v) : undefined}
                  valueStyle={{ color: c.color, fontSize: 18, fontWeight: 700 }} />
              </Card>
            </Col>
          ))}
          <Col xs={24}>
            <Button type="primary" onClick={() => navigate('/reports/scheme-reports')}
              style={{ background: '#B8860B', borderColor: '#B8860B' }}>
              Open Full Scheme Reports →
            </Button>
          </Col>
        </Row>
      ),
    },
  ];

  return (
    <div className="page-wrapper">
      <div className="page-header">
        <div>
          <Title level={4} style={{ margin: 0 }}>
            <DashboardOutlined style={{ color: '#B8860B', marginRight: 8 }} />
            Admin Analytics Dashboard
          </Title>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {user?.companyName} · {dayjs().format('dddd, D MMM YYYY')} ·
            <Tag color="gold" style={{ marginLeft: 6 }}>{user?.roleName}</Tag>
          </Text>
        </div>
        <div ref={dateRangeRef}>
        <RangePicker
          value={dateRange}
          onChange={d => d && setDateRange(d)}
          format="DD-MMM-YYYY"
          presets={[
            { label: 'Today',      value: [dayjs(), dayjs()] },
            { label: 'This Week',  value: [dayjs().startOf('week'), dayjs()] },
            { label: 'This Month', value: [dayjs().startOf('month'), dayjs()] },
            { label: 'Last Month', value: [dayjs().subtract(1,'month').startOf('month'), dayjs().subtract(1,'month').endOf('month')] },
          ]}
        />
        </div>
      </div>
      <div ref={tabsRef}>
      <Tabs activeKey="overview" type="card" items={tabItems} />
      </div>

      <PageTour steps={tourSteps} />
    </div>
  );
}
