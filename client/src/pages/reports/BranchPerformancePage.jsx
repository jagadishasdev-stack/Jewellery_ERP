/**
 * Branch Performance — the "All Branches" consolidated dashboard from the
 * Multi-Branch Management spec (§9-11, 32-33, 38): KPI cards, a branch
 * comparison table, and ranking. Only meaningful for someone who can
 * actually see more than one branch — the server enforces this
 * independently (GET /api/reports/branch-performance), this page just
 * shows a clear message instead of an empty/broken table when it doesn't apply.
 */
import React, { useEffect, useState } from 'react';
import { Row, Col, Card, Typography, Table, Tag, Space, Statistic, Alert, List, Badge } from 'antd';
import {
  ApartmentOutlined, TrophyOutlined, GoldOutlined, ShoppingOutlined,
  RiseOutlined, FallOutlined,
} from '@ant-design/icons';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  PieChart, Pie, Cell,
} from 'recharts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { reportsApi } from '../../api/modules';
import { formatCurrency, formatWeight } from '../../utils/calculations';
import { useBranch } from '../../contexts/BranchContext';
import { useSocket } from '../../hooks/useSocket';
import PageTour from '../../components/PageTour';

// A branch's own gold-tone identity color, reused consistently across every
// chart on this page so "HSR Layout" is always the same slice/bar color.
const PALETTE = ['#B8860B', '#1890ff', '#52c41a', '#722ed1', '#fa8c16', '#eb2f96', '#13c2c2', '#faad14'];
const colorFor = (i) => PALETTE[i % PALETTE.length];

const chartTooltipStyle = { borderRadius: 8, border: '1px solid #f0f0f0', boxShadow: '0 2px 8px rgba(0,0,0,.1)', fontSize: 12 };

// formatCurrency() always renders full paise precision ("₹1,50,000.00") —
// fine for a table cell, too wide for a Y-axis tick label. This is a
// separate, compact-only formatter for chart axes, not a formatCurrency
// option (it never took one).
const compactCurrency = (v) => {
  const num = parseFloat(v) || 0;
  if (Math.abs(num) >= 10000000) return `₹${(num / 10000000).toFixed(1)}Cr`;
  if (Math.abs(num) >= 100000) return `₹${(num / 100000).toFixed(1)}L`;
  if (Math.abs(num) >= 1000) return `₹${(num / 1000).toFixed(0)}K`;
  return `₹${num.toFixed(0)}`;
};

const { Title, Text } = Typography;

export default function BranchPerformancePage() {
  const { allBranches, loaded } = useBranch();
  const qc = useQueryClient();
  const { socket } = useSocket();

  const { data, isLoading, error } = useQuery({
    queryKey: ['branch-performance'],
    queryFn: () => reportsApi.branchPerformance().then(r => r.data.data),
    enabled: loaded,
    retry: false,
  });

  // Multi-Branch Management §34 — "when a sale occurs in HSR Layout, All
  // Branches consolidated values update accordingly." The event only
  // carries "something changed," never the actual numbers — the refetch
  // still goes through the normal authenticated/branch-checked endpoint
  // above, so this can't leak data the socket connection itself wasn't
  // already authorized to receive.
  const [justUpdated, setJustUpdated] = useState(false);
  useEffect(() => {
    if (!socket) return;
    const onChange = () => {
      qc.invalidateQueries({ queryKey: ['branch-performance'] });
      setJustUpdated(true);
      setTimeout(() => setJustUpdated(false), 2000);
    };
    socket.on('branch-data-changed', onChange);
    return () => socket.off('branch-data-changed', onChange);
  }, [socket, qc]);

  const rows = data?.branches || [];
  const combined = data?.combined || {};

  // Short label for chart axes/legends — the full Branch_Name can be long
  // ("Dhanalakshmi Jewellers - HSR Layout"), which crowds a bar chart's
  // x-axis; the table above already shows the full name.
  const shortName = (name) => (name || '').split(/[-–]/).pop().trim() || name;
  const chartRows = rows.map((r, i) => ({ ...r, shortName: shortName(r.Branch_Name), color: colorFor(i) }));
  const stockPieData = chartRows.filter((r) => r.stock_value > 0).map((r) => ({ name: r.shortName, value: r.stock_value, color: r.color }));

  const columns = [
    {
      title: 'Branch', dataIndex: 'Branch_Name',
      render: (v, r) => <Space>{v}{r.Is_Head_Office && <Tag color="gold" style={{fontSize:10}}>HO</Tag>}</Space>,
    },
    { title: "Today's Sales", dataIndex: 'today_sales', render: v => <Text strong style={{color:'#52c41a'}}>{formatCurrency(v)}</Text>, sorter: (a,b) => a.today_sales - b.today_sales },
    { title: "Today's Bills", dataIndex: 'today_bills', width: 100 },
    { title: 'Monthly Sales', dataIndex: 'month_sales', render: v => formatCurrency(v), sorter: (a,b) => a.month_sales - b.month_sales },
    { title: 'Sold Pieces (Month)', dataIndex: 'sold_pieces_month', width: 130 },
    { title: 'Stock', render: (_, r) => <span>{formatWeight(r.stock_weight)} &middot; {r.stock_pieces} pcs</span>, sorter: (a,b) => a.stock_value - b.stock_value },
    { title: 'Stock Value', dataIndex: 'stock_value', render: v => formatCurrency(v) },
    { title: 'Approval Stock', dataIndex: 'approval_pieces', width: 120 },
    { title: 'Outstanding', dataIndex: 'outstanding', render: v => v > 0 ? <Tag color="red">{formatCurrency(v)}</Tag> : formatCurrency(0) },
    { title: 'Customers', dataIndex: 'customers', width: 100 },
  ];

  if (error) {
    return (
      <div className="page-wrapper">
        <Alert
          type="info" showIcon style={{ borderRadius: 8 }}
          message="Branch comparison isn't available here"
          description={error.response?.data?.message || "This requires access to more than one branch — select All Branches in the header, or ask your admin for access to additional branches."}
        />
      </div>
    );
  }

  return (
    <div className="page-wrapper">
      <div className="page-header">
        <Title level={4} style={{ margin: 0 }}>
          <Space>
            <ApartmentOutlined style={{ color: '#B8860B' }} />Branch Performance
            <Badge status={socket?.connected ? 'success' : 'default'} text={<Text style={{ fontSize: 11, color: '#888' }}>{socket?.connected ? 'Live' : 'Offline'}</Text>} />
            {justUpdated && <Tag color="green" style={{ fontSize: 10 }}>Updated</Tag>}
          </Space>
        </Title>
      </div>

      {allBranches && (
        <Tag color="purple" style={{ marginBottom: 12, fontWeight: 700 }}>CONSOLIDATED — ALL BRANCHES</Tag>
      )}

      {/* KPI cards — spec §9 */}
      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        {[
          { title: "Today's Sales", value: combined.today_sales, color: '#52c41a', fmt: formatCurrency },
          { title: 'Monthly Sales', value: combined.month_sales, color: '#1890ff', fmt: formatCurrency },
          { title: 'Total Stock Value', value: combined.stock_value, color: '#B8860B', fmt: formatCurrency },
          { title: 'Gold Stock', value: combined.gold_weight, color: '#d4af37', fmt: v => formatWeight(v) },
          { title: 'Silver Stock', value: combined.silver_weight, color: '#9ca3af', fmt: v => formatWeight(v) },
          { title: 'Total Pieces', value: combined.stock_pieces, color: '#722ed1', fmt: v => `${v || 0} pcs` },
          { title: 'Approval Stock', value: combined.approval_pieces, color: '#fa8c16', fmt: v => `${v || 0} pcs` },
          { title: 'Outstanding Payments', value: combined.outstanding, color: '#ff4d4f', fmt: formatCurrency },
        ].map((c, i) => (
          <Col xs={12} md={6} key={i}>
            <Card loading={isLoading} bodyStyle={{ padding: '12px 14px' }}
              style={{ borderRadius: 8, border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,.07)', borderTop: `3px solid ${c.color}` }}>
              <Statistic title={<Text style={{ fontSize: 11, color: '#888' }}>{c.title}</Text>}
                value={c.value || 0} formatter={c.fmt}
                valueStyle={{ color: c.color, fontSize: 16, fontWeight: 700 }} />
            </Card>
          </Col>
        ))}
      </Row>

      {/* Charts — visual branch-vs-branch comparison, same numbers as the
          table/rankings below just made instantly scannable at a glance. */}
      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        <Col xs={24} lg={14}>
          <Card size="small" title="Sales by Branch — Today vs This Month" loading={isLoading} style={{ borderRadius: 8, border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,.07)' }}>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={chartRows} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                <XAxis dataKey="shortName" tick={{ fontSize: 11 }} interval={0} angle={chartRows.length > 4 ? -20 : 0} textAnchor={chartRows.length > 4 ? 'end' : 'middle'} height={chartRows.length > 4 ? 50 : 30} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={compactCurrency} width={60} />
                <Tooltip contentStyle={chartTooltipStyle} formatter={(v) => formatCurrency(v)} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="today_sales" name="Today's Sales" fill="#52c41a" radius={[4, 4, 0, 0]} />
                <Bar dataKey="month_sales" name="Monthly Sales" fill="#1890ff" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </Col>
        <Col xs={24} lg={10}>
          <Card size="small" title="Stock Value Share by Branch" loading={isLoading} style={{ borderRadius: 8, border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,.07)' }}>
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={stockPieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                  {stockPieData.map((d, i) => <Cell key={i} fill={d.color} />)}
                </Pie>
                <Tooltip contentStyle={chartTooltipStyle} formatter={(v) => formatCurrency(v)} />
              </PieChart>
            </ResponsiveContainer>
          </Card>
        </Col>
      </Row>

      {/* Branch comparison table — spec §10/38 */}
      <Card title="Branch Performance Comparison" style={{ borderRadius: 8, border: 'none', marginBottom: 16 }} bodyStyle={{ padding: 0 }}>
        <Table
          scroll={{ x: 'max-content' }}
          columns={columns}
          dataSource={rows}
          loading={isLoading}
          rowKey="Branch_ID"
          size="small"
          pagination={false}
        />
      </Card>

      {/* Ranking — spec §11/33 */}
      <Row gutter={[12, 12]}>
        <Col xs={24} md={8}>
          <Card size="small" title={<Space><TrophyOutlined style={{color:'#B8860B'}} />Today's Sales Ranking</Space>} style={{ borderRadius: 8 }}>
            <List
              size="small"
              dataSource={data?.ranking?.byTodaySales || []}
              renderItem={(item, i) => (
                <List.Item>
                  <Space>
                    <Tag color={i === 0 ? 'gold' : 'default'}>#{i + 1}</Tag>
                    {i === 0 ? <RiseOutlined style={{color:'#52c41a'}} /> : (i === (data?.ranking?.byTodaySales.length - 1) ? <FallOutlined style={{color:'#ff4d4f'}} /> : null)}
                    {item.Branch_Name}
                  </Space>
                  <Text strong>{formatCurrency(item.value)}</Text>
                </List.Item>
              )}
            />
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card size="small" title={<Space><ShoppingOutlined style={{color:'#1890ff'}} />Monthly Sales Ranking</Space>} style={{ borderRadius: 8 }}>
            <List
              size="small"
              dataSource={data?.ranking?.byMonthSales || []}
              renderItem={(item, i) => (
                <List.Item>
                  <Space><Tag color={i === 0 ? 'gold' : 'default'}>#{i + 1}</Tag>{item.Branch_Name}</Space>
                  <Text strong>{formatCurrency(item.value)}</Text>
                </List.Item>
              )}
            />
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card size="small" title={<Space><GoldOutlined style={{color:'#722ed1'}} />Stock Value Ranking</Space>} style={{ borderRadius: 8 }}>
            <List
              size="small"
              dataSource={data?.ranking?.byStockValue || []}
              renderItem={(item, i) => (
                <List.Item>
                  <Space><Tag color={i === 0 ? 'gold' : 'default'}>#{i + 1}</Tag>{item.Branch_Name}</Space>
                  <Text strong>{formatCurrency(item.value)}</Text>
                </List.Item>
              )}
            />
          </Card>
        </Col>
      </Row>

      <PageTour steps={[
        { title: '1. Consolidated KPIs', description: 'Totals across every branch you have access to — sales, stock, gold/silver split, approval stock, and outstanding payments.' },
        { title: '2. Branch Comparison', description: 'Side-by-side numbers per branch — sort any column to instantly see which branch leads or lags.' },
        { title: '3. Ranking', description: "Today's sales, monthly sales, and stock value, ranked branch-by-branch." },
      ]} />
    </div>
  );
}
