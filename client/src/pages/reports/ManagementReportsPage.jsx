/**
 * Management Reports — Dashboard Analytics | Branch | Employee | Targets
 */
import React, { useState, useRef } from 'react';
import {
  Row, Col, Card, Typography, DatePicker, Button, Space, Tag, Tabs,
  Table, Statistic, Progress, Alert, Divider,
} from 'antd';
import {
  DashboardOutlined, BranchesOutlined, UserOutlined,
  RiseOutlined, TrophyOutlined, BarChartOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import api from '../../api/axios';
import { reportsApi } from '../../api/modules';
import { formatCurrency } from '../../utils/calculations';
import PageTour from '../../components/PageTour';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

// Target achievement bar with color coding
const TargetBar = ({ achieved, target, label }) => {
  const pct = target > 0 ? Math.min(100, Math.round((achieved / target) * 100)) : 0;
  const color = pct >= 100 ? '#52c41a' : pct >= 70 ? '#fa8c16' : '#ff4d4f';
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 12 }}>
        <Text strong>{label}</Text>
        <Text style={{ color }}>{pct}% — {formatCurrency(achieved)} / {formatCurrency(target)}</Text>
      </div>
      <Progress percent={pct} strokeColor={color} showInfo={false} size="small" />
    </div>
  );
};

export default function ManagementReportsPage() {
  const [dateRange, setDateRange] = useState([dayjs().startOf('month'), dayjs()]);
  const [activeTab, setActiveTab] = useState('dashboard');

  // ── Walkthrough tour refs ───────────────────────────────────────────────────
  const dateRangeRef = useRef(null);
  const tabsRef = useRef(null);
  const tourSteps = [
    { title: '1. Choose Period', description: 'Pick the period for these MIS reports — presets for This Month, Last Month and This Year are one click away.', target: () => dateRangeRef.current },
    { title: '2. The 4 MIS Views', description: 'Dashboard Analytics: KPI cards plus Target vs Achievement at a glance — check this first thing each morning. Branch Analytics: compare revenue across branches. Employee Analytics: compare counter/operator performance. Sales Targets: track progress toward the monthly sales and collection targets set by the owner.', target: () => tabsRef.current },
    { title: '3. Setting Targets', description: 'Monthly sales and collection targets shown here are configured by the owner in Admin → Settings → Sales Targets.' },
  ];

  const fromDate = dateRange[0].format('YYYY-MM-DD');
  const toDate = dateRange[1].format('YYYY-MM-DD');

  const { data: salesSummary } = useQuery({
    queryKey: ['mgmt-sales', fromDate, toDate],
    queryFn: () => api.get('/reports/sales-summary', { params: { fromDate, toDate } }).then(r => r.data.data),
  });
  const { data: inventory } = useQuery({
    queryKey: ['mgmt-inventory'],
    queryFn: () => api.get('/reports/inventory-value').then(r => r.data.data),
  });
  const { data: counterData } = useQuery({
    queryKey: ['mgmt-counter', fromDate, toDate],
    queryFn: () => reportsApi.counterSummary({ fromDate, toDate }).then(r => r.data.data),
    enabled: activeTab === 'dashboard' || activeTab === 'branch' || activeTab === 'employee',
  });
  const { data: branchData } = useQuery({
    queryKey: ['mgmt-branch', fromDate, toDate],
    queryFn: () => api.get('/reports/branch-wise-sales', { params: { fromDate, toDate } }).then(r => r.data.data || []),
    enabled: activeTab === 'branch',
  });

  const s = salesSummary?.summary || {};
  const inv = inventory?.overall || {};

  // Mock targets for now — in production these come from a settings table
  const monthTarget = 1000000; // ₹10L target
  const collectionTarget = 800000;
  const achieved = parseFloat(s.total_revenue || 0);
  const collected = parseFloat(s.total_collected || 0);

  const branchCols = [
    { title: 'Branch', dataIndex: 'branch_name', render: v => <Text strong><BranchesOutlined /> {v}</Text> },
    { title: 'Bills', dataIndex: 'total_bills', render: v => <Tag color="blue">{v}</Tag> },
    { title: 'Revenue', dataIndex: 'total_revenue', render: v => <Text strong style={{ color: '#52c41a' }}>{formatCurrency(v)}</Text> },
    { title: 'GST', dataIndex: 'total_gst', render: v => formatCurrency(v || 0) },
    {
      title: 'Target %', render: (_, r) => {
        const pct = Math.min(100, Math.round((parseFloat(r.total_revenue || 0) / (monthTarget / Math.max(1, (branchData || []).length))) * 100));
        return <Progress percent={pct} size="small" strokeColor={pct >= 100 ? '#52c41a' : '#fa8c16'} />;
      }
    },
  ];

  const employeeCols = [
    { title: 'Operator', dataIndex: 'operator', render: v => <Text strong><UserOutlined /> {v || 'N/A'}</Text> },
    { title: 'Counter', dataIndex: 'counter' },
    { title: 'Bills', dataIndex: 'total_bills', render: v => <Tag color="blue">{v}</Tag> },
    { title: 'Revenue', dataIndex: 'total_revenue', render: v => <Text strong style={{ color: '#52c41a' }}>{formatCurrency(v)}</Text> },
    { title: 'Avg Bill', render: (_, r) => formatCurrency(r.total_bills > 0 ? parseFloat(r.total_revenue || 0) / parseInt(r.total_bills) : 0) },
    {
      title: 'Performance', render: (_, r) => {
        const all = (counterData?.counterStats || []);
        const maxRev = Math.max(...all.map(c => parseFloat(c.total_revenue || 0)), 1);
        const pct = Math.round((parseFloat(r.total_revenue || 0) / maxRev) * 100);
        return <Progress percent={pct} size="small" strokeColor={pct >= 80 ? '#52c41a' : pct >= 50 ? '#fa8c16' : '#ff4d4f'} />;
      }
    },
  ];

  const tabItems = [
    {
      key: 'dashboard', label: <span><DashboardOutlined /> Dashboard Analytics</span>,
      children: (
        <>
          {/* KPI Cards */}
          <Row gutter={[10, 10]} style={{ marginBottom: 16 }}>
            {[
              { title: 'Period Revenue', value: parseFloat(s.total_revenue || 0), color: '#B8860B', fmt: formatCurrency },
              { title: 'Bills Issued', value: parseInt(s.total_bills || 0), color: '#1890ff' },
              { title: 'GST Collected', value: parseFloat(s.total_gst || 0), color: '#722ed1', fmt: formatCurrency },
              { title: 'Avg Bill Value', value: parseInt(s.total_bills || 0) > 0 ? parseFloat(s.total_revenue || 0) / parseInt(s.total_bills) : 0, color: '#fa8c16', fmt: formatCurrency },
              { title: 'Stock Value (MRP)', value: parseFloat(inv.total_mrp || 0), color: '#52c41a', fmt: formatCurrency },
              { title: 'Total Pieces', value: parseInt(inv.total_pieces || 0), color: '#13c2c2' },
            ].map((c, i) => (
              <Col xs={12} sm={8} lg={4} key={i}>
                <Card bodyStyle={{ padding: '12px 14px' }} style={{ borderRadius: 8, border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,.07)', borderTop: `3px solid ${c.color}` }}>
                  <Statistic title={<Text style={{ fontSize: 11, color: '#888' }}>{c.title}</Text>}
                    value={c.value} formatter={c.fmt ? v => c.fmt(v) : undefined}
                    valueStyle={{ color: c.color, fontSize: 16, fontWeight: 700 }} />
                </Card>
              </Col>
            ))}
          </Row>

          <Row gutter={[14, 14]}>
            {/* Target Achievement */}
            <Col xs={24} md={10}>
              <Card title={<span><TrophyOutlined /> Target vs Achievement</span>} style={{ borderRadius: 8 }}>
                <TargetBar label="Sales Revenue" achieved={achieved} target={monthTarget} />
                <TargetBar label="Cash Collection" achieved={collected} target={collectionTarget} />
                <Divider style={{ margin: '10px 0' }} />
                <Alert message="Targets are configurable in Admin → Settings → Sales Targets" type="info" showIcon style={{ fontSize: 11 }} />
              </Card>
            </Col>

            {/* Payment Mode Breakdown */}
            <Col xs={24} md={14}>
              <Card title="Revenue by Payment Mode" bodyStyle={{ padding: 0 }} style={{ borderRadius: 8 }}>
                <Table
            scroll={{ x: "max-content" }}
                  columns={[
                    { title: 'Mode', dataIndex: 'Payment_Mode', render: v => <Tag color="blue">{v || 'Other'}</Tag> },
                    { title: 'Bills', dataIndex: 'count', width: 70 },
                    { title: 'Amount', dataIndex: 'amount', render: v => <Text strong style={{ color: '#B8860B' }}>{formatCurrency(v)}</Text> },
                    {
                      title: '% Share', render: (_, r) => {
                        const total = parseFloat(s.total_revenue || 1);
                        return <Progress percent={Math.round((parseFloat(r.amount || 0) / total) * 100)} size="small" strokeColor="#B8860B" />;
                      }
                    },
                  ]}
                  dataSource={salesSummary?.byPaymentMode || []} rowKey="Payment_Mode" size="small" pagination={false} />
              </Card>
            </Col>
          </Row>

          {/* Daily trend */}
          <Card title="Daily Revenue Trend" bodyStyle={{ padding: 0 }} style={{ borderRadius: 8, marginTop: 14 }}>
            <Table
            scroll={{ x: "max-content" }}
              columns={[
                { title: 'Date', dataIndex: 'date', render: v => dayjs(v).format('ddd, DD-MMM') },
                { title: 'Bills', dataIndex: 'bills', width: 70 },
                { title: 'Revenue', dataIndex: 'revenue', render: v => formatCurrency(v) },
                {
                  title: 'Trend', render: (_, r) => {
                    const max = Math.max(...(salesSummary?.dailyBreakdown || []).map(d => parseFloat(d.revenue || 0)), 1);
                    const pct = Math.round((parseFloat(r.revenue || 0) / max) * 100);
                    return <Progress percent={pct} strokeColor="#B8860B" showInfo={false} size="small" />;
                  }
                },
              ]}
              dataSource={salesSummary?.dailyBreakdown || []} rowKey="date" size="small" pagination={{ pageSize: 10 }} />
          </Card>
        </>
      ),
    },
    {
      key: 'branch', label: <span><BranchesOutlined /> Branch Analytics</span>,
      children: (
        <>
          <Row gutter={[10, 10]} style={{ marginBottom: 14 }}>
            <Col xs={24} md={8}>
              <Card title="Branch Performance Summary" style={{ borderRadius: 8 }}>
                <Statistic title="Total Branches Active" value={(branchData || []).length} valueStyle={{ color: '#B8860B', fontWeight: 700 }} />
                <Statistic title="Combined Revenue" value={parseFloat(s.total_revenue || 0)} formatter={v => formatCurrency(v)} valueStyle={{ color: '#52c41a', fontWeight: 700 }} style={{ marginTop: 12 }} />
              </Card>
            </Col>
            <Col xs={24} md={16}>
              <Card title="Branch Wise Sales" bodyStyle={{ padding: 0 }} style={{ borderRadius: 8 }}>
                <Table
            scroll={{ x: "max-content" }} columns={branchCols} dataSource={branchData || []} rowKey="branch_name" size="small" pagination={false} />
              </Card>
            </Col>
          </Row>
        </>
      ),
    },
    {
      key: 'employee', label: <span><UserOutlined /> Employee Analytics</span>,
      children: (
        <Card title="Employee / Operator Performance" bodyStyle={{ padding: 0 }} style={{ borderRadius: 8 }}>
          <Table
            scroll={{ x: "max-content" }} columns={employeeCols} dataSource={counterData?.counterStats || []} rowKey="counter" size="small" pagination={{ pageSize: 20 }} />
        </Card>
      ),
    },
    {
      key: 'targets', label: <span><RiseOutlined /> Sales Targets</span>,
      children: (
        <Row gutter={[16, 16]}>
          <Col xs={24} md={12}>
            <Card title={<span><TrophyOutlined /> Monthly Sales Target</span>} style={{ borderRadius: 8 }}>
              <TargetBar label="Total Sales Revenue" achieved={parseFloat(s.total_revenue || 0)} target={monthTarget} />
              <TargetBar label="Cash Collection" achieved={parseFloat(s.total_collected || 0)} target={collectionTarget} />
              <TargetBar label="GST Target" achieved={parseFloat(s.total_gst || 0)} target={monthTarget * 0.03} />
              <Divider style={{ margin: '10px 0' }} />
              <div style={{ fontSize: 12, color: '#888' }}>
                Period: {dateRange[0].format('DD-MMM-YYYY')} to {dateRange[1].format('DD-MMM-YYYY')}
              </div>
            </Card>
          </Col>
          <Col xs={24} md={12}>
            <Card title="Counter Wise Target" bodyStyle={{ padding: 0 }} style={{ borderRadius: 8 }}>
              <Table
            scroll={{ x: "max-content" }}
                columns={[
                  { title: 'Counter', dataIndex: 'counter', render: v => <Text strong>{v}</Text> },
                  { title: 'Achieved', dataIndex: 'total_revenue', render: v => formatCurrency(v) },
                  {
                    title: 'Target Achievement', render: (_, r) => {
                      const perCounter = monthTarget / Math.max(1, (counterData?.counterStats || []).length);
                      const pct = Math.min(100, Math.round((parseFloat(r.total_revenue || 0) / perCounter) * 100));
                      return <Progress percent={pct} size="small" strokeColor={pct >= 100 ? '#52c41a' : pct >= 70 ? '#fa8c16' : '#ff4d4f'} />;
                    }
                  },
                ]}
                dataSource={counterData?.counterStats || []} rowKey="counter" size="small" pagination={false} />
            </Card>
          </Col>
        </Row>
      ),
    },
  ];

  return (
    <div className="page-wrapper">
      <div className="page-header">
        <Title level={4} style={{ margin: 0 }}><DashboardOutlined style={{ color: '#eb2f96', marginRight: 8 }} />Management Reports & Analytics</Title>
        <div ref={dateRangeRef}>
        <Space>
          <RangePicker value={dateRange} onChange={d => d && setDateRange(d)} format="DD-MMM-YYYY"
            presets={[
              { label: 'This Month', value: [dayjs().startOf('month'), dayjs()] },
              { label: 'Last Month', value: [dayjs().subtract(1, 'month').startOf('month'), dayjs().subtract(1, 'month').endOf('month')] },
              { label: 'This Year', value: [dayjs().startOf('year'), dayjs()] },
            ]} />
          <Button icon={<BarChartOutlined />} onClick={() => window.print()}>Print Report</Button>
        </Space>
        </div>
      </div>
      <div ref={tabsRef}>
      <Tabs activeKey={activeTab} onChange={setActiveTab} type="card" items={tabItems} />
      </div>

      <PageTour steps={tourSteps} />
    </div>
  );
}
