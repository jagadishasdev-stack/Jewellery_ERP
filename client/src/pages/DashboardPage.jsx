/**
 * Business-Type-Aware Dashboard
 * RETAILER    → Sales, Stock, Schemes, Low Stock, Today's Collection
 * WHOLESALER  → Dealer Outstanding, Pending Orders, Warehouse Stock, Sales
 * MANUFACTURER→ Production Status, Gold Issued, Goldsmith Performance, Wastage
 * HYBRID      → All of the above in a combined view
 */
import React, { useState, useEffect, useRef } from 'react';
import {
  Row, Col, Card, Statistic, Typography, Table, Tag, Space,
  Alert, Progress, Tooltip, Badge, Button, Divider, Grid,
} from 'antd';
import {
  ShoppingCartOutlined, TeamOutlined, GoldOutlined, RiseOutlined,
  WarningOutlined, ClockCircleOutlined, BankOutlined, DollarOutlined,
  ShopOutlined, SafetyOutlined, ToolOutlined, BarChartOutlined,
  AppstoreOutlined, UserOutlined, GoldFilled,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { tenantApi, salesApi, ornamentsApi, reportsApi, savingsApi } from '../api/modules';
import { useAuthStore } from '../store/authStore';
import { useModules } from '../hooks/useModules';
import { formatCurrency } from '../utils/calculations';
import MetalRateDashboard from '../components/MetalRateDashboard';
import ClosingStockTodayWidget from '../components/ClosingStockTodayWidget';
import PageTour from '../components/PageTour';
import KPICard from '../components/KPICard';
import EmptyState from '../components/states/EmptyState';
import { SkeletonKPIRow } from '../components/states/Skeletons';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { useBreakpoint } = Grid;

/** value >0 -> yesterday, computes a percent change; guards div-by-zero. */
const pctChange = (today, yesterday) => {
  const t = parseFloat(today || 0), y = parseFloat(yesterday || 0);
  if (y === 0) return null; // nothing meaningful to compare against
  return ((t - y) / y) * 100;
};

export default function DashboardPage() {
  const { user } = useAuthStore();
  const { businessType, isEnabled } = useModules();
  const navigate = useNavigate();
  const today = dayjs().format('YYYY-MM-DD');
  const yesterday = dayjs().subtract(1, 'day').format('YYYY-MM-DD');
  const monthStart = dayjs().startOf('month').format('YYYY-MM-DD');

  // ── Walkthrough tour refs ───────────────────────────────────────────────────
  const headerRef = useRef(null);
  const metalRateRef = useRef(null);
  const kpiRef = useRef(null);
  const detailRef = useRef(null);
  const tourSteps = [
    { title: '1. Dashboard Header', description: 'Shows your company name, today\'s date, business type and your role — the dashboard below adjusts automatically to what matters for your kind of business.', target: () => headerRef.current },
    { title: '2. Live Metal Rates', description: 'Today\'s gold and silver rates used across billing and inventory pricing — updated automatically.', target: () => metalRateRef.current },
    { title: '3. KPI Cards', description: 'Quick snapshot of today\'s bills, revenue, stock value and more. Click any card to jump straight to that section (e.g. click Revenue to open Sales Reports, or Stock to open Inventory).', target: () => kpiRef.current },
    { title: '4. Detail Panels', description: 'Deeper breakdowns — counter-wise performance, stock by item type, savings scheme status, karigar work — with "View All / →" links to open the full page.', target: () => detailRef.current },
  ];

  // ── Data fetches ──────────────────────────────────────────────────────────
  const { data: stats } = useQuery({
    queryKey: ['tenant-stats'],
    queryFn: () => tenantApi.getStats().then(r => r.data.data),
    refetchInterval: 60000,
  });

  const { data: dailySales, isLoading: dailySalesLoading } = useQuery({
    queryKey: ['daily-sales', today],
    queryFn: () => salesApi.dailyReport(today).then(r => r.data.data),
    enabled: isEnabled('retail_sales') || isEnabled('wholesale_sales'),
  });

  // Same existing endpoint, just yesterday's date — purely for the KPI
  // cards' "vs yesterday" comparison badge (Section 5's own example).
  // No new API, no backend change.
  const { data: yesterdaySales } = useQuery({
    queryKey: ['daily-sales', yesterday],
    queryFn: () => salesApi.dailyReport(yesterday).then(r => r.data.data),
    enabled: isEnabled('retail_sales') || isEnabled('wholesale_sales'),
  });

  const { data: monthlySales } = useQuery({
    queryKey: ['monthly-sales', monthStart, today],
    queryFn: () => reportsApi.salesSummary({ fromDate: monthStart, toDate: today }).then(r => r.data.data),
  });

  const { data: inventory } = useQuery({
    queryKey: ['inventory-value'],
    queryFn: () => reportsApi.inventoryValue().then(r => r.data.data),
    enabled: isEnabled('inventory'),
  });

  const { data: stockAlerts } = useQuery({
    queryKey: ['stock-alerts'],
    queryFn: () => ornamentsApi.getStockAlerts().then(r => r.data.data),
    enabled: isEnabled('inventory'),
  });

  const { data: schemeDash } = useQuery({
    queryKey: ['scheme-dashboard'],
    queryFn: () => savingsApi.getDashboard().then(r => r.data.data),
    enabled: isEnabled('savings_scheme'),
  });

  const { data: karigarData } = useQuery({
    queryKey: ['karigar-summary'],
    queryFn: () => reportsApi.karigarSummary().then(r => r.data.data),
    enabled: isEnabled('goldsmith') || isEnabled('manufacturing'),
  });

  const { data: counterToday } = useQuery({
    queryKey: ['counter-today', today],
    queryFn: () => reportsApi.counterSummary({ fromDate: today, toDate: today }).then(r => r.data.data),
    enabled: isEnabled('retail_sales'),
  });

  const ds = dailySales?.summary || {};
  const ys = yesterdaySales?.summary || {};
  const ms = monthlySales?.summary || {};
  const inv = inventory?.overall || {};
  const sch = schemeDash || {};

  const revenueChange = pctChange(ds.total_revenue, ys.total_revenue);
  const billsChange = pctChange(ds.total_bills, ys.total_bills);
  const revenueComparison = revenueChange !== null ? { value: revenueChange, label: 'vs yesterday' } : undefined;
  const billsComparison = billsChange !== null ? { value: billsChange, label: 'vs yesterday' } : undefined;

  // ── Business-type header colours ──────────────────────────────────────────
  const BT_CONFIG = {
    RETAILER:     { color: '#B8860B', label: '🏪 Retailer Dashboard',     bg: '#B8860B' },
    WHOLESALER:   { color: '#1890ff', label: '🏭 Wholesaler Dashboard',    bg: '#1890ff' },
    MANUFACTURER: { color: '#52c41a', label: '⚙️ Manufacturer Dashboard', bg: '#52c41a' },
    HYBRID:       { color: '#722ed1', label: '💎 JewelSphere Dashboard', bg: '#722ed1' },
  };
  const btCfg = BT_CONFIG[businessType] || BT_CONFIG.HYBRID;

  // ── Retailer KPIs ─────────────────────────────────────────────────────────
  const RetailerSection = () => (
    <>
      <Row ref={kpiRef} gutter={[10, 10]} style={{ marginBottom: 14 }}>
        <KPICard title="Today's Bills"    value={parseInt(ds.total_bills||0)}    color="#B8860B" icon={<ShoppingCartOutlined />} suffix="bills" comparison={billsComparison} onClick={() => navigate('/pos')} />
        <KPICard title="Today's Revenue"  value={parseFloat(ds.total_revenue||0)} formatter={formatCurrency} color="#52c41a" icon={<RiseOutlined />} comparison={revenueComparison} onClick={() => navigate('/reports/sales-reports')} />
        <KPICard title="Month Revenue"    value={parseFloat(ms.total_revenue||0)} formatter={formatCurrency} color="#1890ff" icon={<BarChartOutlined />} />
        <KPICard title="GST Collected"    value={parseFloat(ds.total_gst||0)}    formatter={formatCurrency} color="#722ed1" icon={<SafetyOutlined />} />
        <KPICard title="Stock (MRP)"      value={parseFloat(inv.total_mrp||0)}   formatter={formatCurrency} color="#fa8c16" icon={<GoldOutlined />} onClick={() => navigate('/inventory')} />
        <KPICard title="Total Pieces"     value={parseInt(inv.total_pieces||0)}  color="#888" icon={<AppstoreOutlined />} suffix="pcs" />
      </Row>

      <Row ref={detailRef} gutter={[14, 14]}>
        {/* Counter Performance */}
        <Col xs={24} lg={12}>
          <Card title="🛒 Counter Performance — Today" bodyStyle={{ padding: 0 }} style={{ borderRadius: 8 }}
            extra={<Button type="link" size="small" onClick={() => navigate('/pos')}>Open POS →</Button>}>
            {(counterToday?.counterStats || []).length === 0
              ? <EmptyState icon={<ShoppingCartOutlined />} title="No sales today" hint="Open POS to start billing — today's counter performance will show here." actionLabel="Open POS" onAction={() => navigate('/pos')} compact />
              : <Table
            scroll={{ x: "max-content" }} size="small" dataSource={counterToday?.counterStats || []} rowKey="counter" pagination={false}
                  columns={[
                    { title: 'Counter', dataIndex: 'counter', render: v => <Tag color="blue">{v}</Tag> },
                    { title: 'Operator', dataIndex: 'operator' },
                    { title: 'Bills', dataIndex: 'total_bills', width: 60 },
                    { title: 'Revenue', dataIndex: 'total_revenue', render: v => <Text style={{ color: '#52c41a', fontWeight: 600 }}>{formatCurrency(v)}</Text> },
                  ]} />
            }
          </Card>
        </Col>

        {/* Scheme Status */}
        {isEnabled('savings_scheme') && (
          <Col xs={24} lg={12}>
            <Card title="🪙 Savings Scheme Status" bodyStyle={{ padding: '14px 20px' }} style={{ borderRadius: 8 }}
              extra={<Button type="link" size="small" onClick={() => navigate('/savings')}>View Club →</Button>}>
              <Row gutter={[12, 12]}>
                {[
                  { label: 'Active Members', value: parseInt(sch.active_members||0), color: '#722ed1' },
                  { label: 'Matured (Ready)', value: parseInt(sch.matured_members||0), color: '#52c41a' },
                  { label: 'Today Collection', value: parseFloat(sch.today_collection||0), fmt: formatCurrency, color: '#B8860B' },
                  { label: 'Overdue Members', value: parseInt(sch.overdue_members||0), color: '#ff4d4f' },
                ].map((s, i) => (
                  <Col xs={12} key={i}>
                    <Statistic title={<Text style={{ fontSize: 11, color: '#888' }}>{s.label}</Text>}
                      value={s.value} formatter={s.fmt ? v => s.fmt(v) : undefined}
                      valueStyle={{ color: s.color, fontSize: 16, fontWeight: 700 }} />
                  </Col>
                ))}
              </Row>
            </Card>
          </Col>
        )}

        {/* Stock by Type */}
        <Col xs={24} lg={12}>
          <Card title="📦 Stock by Item Type" bodyStyle={{ padding: 0 }} style={{ borderRadius: 8 }}
            extra={<Button type="link" size="small" onClick={() => navigate('/inventory')}>View All →</Button>}>
            <Table
            scroll={{ x: "max-content" }} size="small" dataSource={(inventory?.byType || []).slice(0, 6)} rowKey="Type_Code" pagination={false}
              columns={[
                { title: 'Type', dataIndex: 'Type_Name', render: v => <Text strong style={{ fontSize: 12 }}>{v}</Text> },
                { title: 'Pcs', dataIndex: 'count', width: 60 },
                { title: 'Net Wt', dataIndex: 'total_weight', width: 90, render: v => `${parseFloat(v||0).toFixed(2)}g` },
                { title: 'MRP', dataIndex: 'total_mrp', render: v => <Text style={{ color: '#B8860B' }}>{formatCurrency(v)}</Text> },
              ]} />
          </Card>
        </Col>

        {/* Low Stock Alerts */}
        {isEnabled('inventory') && (
          <Col xs={24} lg={12}>
            <Card title="⚠️ Low Stock Alerts" bodyStyle={{ padding: 0 }} style={{ borderRadius: 8 }}>
              {!(stockAlerts || []).length
                ? <Alert message="All stock levels healthy ✅" type="success" showIcon style={{ margin: 16 }} />
                : <Table
            scroll={{ x: "max-content" }} size="small" dataSource={stockAlerts || []} rowKey="Ornament_ID" pagination={{ pageSize: 5 }}
                    columns={[
                      { title: 'Article', dataIndex: 'Article_Number', render: v => <Text code style={{ fontSize: 10 }}>{v}</Text> },
                      { title: 'Type', dataIndex: 'Type_Name' },
                      { title: 'Purity', dataIndex: 'Purity_Code', width: 60 },
                      { title: 'Qty', dataIndex: 'Stock_Quantity', width: 50, render: v => <Tag color="red">{v}</Tag> },
                    ]} />
              }
            </Card>
          </Col>
        )}
      </Row>
    </>
  );

  // ── Wholesaler Section ─────────────────────────────────────────────────────
  const WholesalerSection = () => (
    <>
      <Row ref={kpiRef} gutter={[10, 10]} style={{ marginBottom: 14 }}>
        <KPICard title="Month Revenue"   value={parseFloat(ms.total_revenue||0)} formatter={formatCurrency} color="#1890ff" icon={<RiseOutlined />} />
        <KPICard title="Today's Bills"   value={parseInt(ds.total_bills||0)}     color="#B8860B" icon={<ShoppingCartOutlined />} suffix="bills" comparison={billsComparison} />
        <KPICard title="Total Stock"     value={parseInt(inv.total_pieces||0)}   color="#52c41a" icon={<AppstoreOutlined />} suffix="pcs" />
        <KPICard title="Stock Value"     value={parseFloat(inv.total_mrp||0)}    formatter={formatCurrency} color="#fa8c16" icon={<GoldOutlined />} />
        <KPICard title="Pending Collect" value={parseFloat(ms.total_pending||0)} formatter={formatCurrency} color="#ff4d4f" icon={<ClockCircleOutlined />} />
        <KPICard title="GST Collected"   value={parseFloat(ds.total_gst||0)}     formatter={formatCurrency} color="#722ed1" icon={<SafetyOutlined />} />
      </Row>
      <Row ref={detailRef} gutter={[14, 14]}>
        <Col xs={24} lg={12}>
          <Card title="📦 Warehouse Stock by Category" bodyStyle={{ padding: 0 }} style={{ borderRadius: 8 }}>
            <Table
            scroll={{ x: "max-content" }} size="small" dataSource={(inventory?.byType || []).slice(0, 8)} rowKey="Type_Code" pagination={false}
              columns={[
                { title: 'Category', dataIndex: 'Type_Name', render: v => <Text strong>{v}</Text> },
                { title: 'Pcs', dataIndex: 'count', width: 60 },
                { title: 'Gross Wt', dataIndex: 'total_weight', width: 100, render: v => `${parseFloat(v||0).toFixed(2)}g` },
                { title: 'MRP', dataIndex: 'total_mrp', render: v => <Text style={{ color: '#1890ff' }}>{formatCurrency(v)}</Text> },
              ]} />
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title="💰 Payment Mode Split — Today" bodyStyle={{ padding: 0 }} style={{ borderRadius: 8 }}>
            <Table
            scroll={{ x: "max-content" }} size="small" dataSource={dailySales?.byPaymentMode || []} rowKey="Payment_Mode" pagination={false}
              columns={[
                { title: 'Mode', dataIndex: 'Payment_Mode', render: v => <Tag color="blue">{v||'Other'}</Tag> },
                { title: 'Count', dataIndex: 'count', width: 70 },
                { title: 'Amount', dataIndex: 'amount', render: v => formatCurrency(v) },
              ]} />
          </Card>
        </Col>
      </Row>
    </>
  );

  // ── Manufacturer Section ───────────────────────────────────────────────────
  const ManufacturerSection = () => {
    const issued   = (karigarData || []).reduce((s, r) => s + parseFloat(r.total_issued||0), 0);
    const returned = (karigarData || []).reduce((s, r) => s + parseFloat(r.total_returned||0), 0);
    const pending  = issued - returned;
    return (
      <>
        <Row ref={kpiRef} gutter={[10, 10]} style={{ marginBottom: 14 }}>
          <KPICard title="Gold Issued"      value={`${issued.toFixed(3)}g`}   color="#fa8c16" icon={<GoldOutlined />} />
          <KPICard title="Gold Returned"    value={`${returned.toFixed(3)}g`} color="#52c41a" icon={<RiseOutlined />} />
          <KPICard title="Pending w/Karigar"value={`${pending.toFixed(3)}g`}  color="#ff4d4f" icon={<ClockCircleOutlined />} />
          <KPICard title="Active Karigars"  value={(karigarData||[]).filter(r => r.Status !== 'Completed').length} color="#1890ff" icon={<TeamOutlined />} suffix="working" />
          <KPICard title="Stock Value"      value={parseFloat(inv.total_mrp||0)} formatter={formatCurrency} color="#B8860B" icon={<GoldFilled />} />
          <KPICard title="Total Pieces"     value={parseInt(inv.total_pieces||0)} color="#888" icon={<AppstoreOutlined />} suffix="pcs" />
        </Row>
        <Row ref={detailRef} gutter={[14, 14]}>
          <Col xs={24} lg={14}>
            <Card title="⚒️ Karigar Work Status" bodyStyle={{ padding: 0 }} style={{ borderRadius: 8 }}
              extra={<Button type="link" size="small" onClick={() => navigate('/karigar')}>Karigar List →</Button>}>
              <Table
            scroll={{ x: "max-content" }} size="small" dataSource={karigarData || []} rowKey={(_, i) => i} pagination={{ pageSize: 8 }}
                columns={[
                  { title: 'Karigar', dataIndex: 'Vendor_Name', render: v => <Text strong>{v}</Text> },
                  { title: 'Status', dataIndex: 'Status', render: v => <Tag color={v==='Completed'?'green':'orange'}>{v}</Tag> },
                  { title: 'Issued', dataIndex: 'total_issued', width: 80, render: v => `${parseFloat(v||0).toFixed(3)}g` },
                  { title: 'Returned', dataIndex: 'total_returned', width: 90, render: v => `${parseFloat(v||0).toFixed(3)}g` },
                  { title: 'Pending', dataIndex: 'pending_weight', width: 80, render: v => <Tag color={parseFloat(v)>0?'red':'green'}>{parseFloat(v||0).toFixed(3)}g</Tag> },
                ]} />
            </Card>
          </Col>
          <Col xs={24} lg={10}>
            <Card title="📦 Finished Goods Inventory" bodyStyle={{ padding: 0 }} style={{ borderRadius: 8 }}>
              <Table
            scroll={{ x: "max-content" }} size="small" dataSource={(inventory?.byType || []).slice(0, 6)} rowKey="Type_Code" pagination={false}
                columns={[
                  { title: 'Type', dataIndex: 'Type_Name', render: v => <Text strong style={{ fontSize: 12 }}>{v}</Text> },
                  { title: 'Pcs', dataIndex: 'count', width: 55 },
                  { title: 'Net Wt', dataIndex: 'total_weight', width: 90, render: v => `${parseFloat(v||0).toFixed(2)}g` },
                ]} />
            </Card>
          </Col>
        </Row>
      </>
    );
  };

  // ── Hybrid — combine all relevant sections ────────────────────────────────
  const HybridSection = () => (
    <>
      <Row ref={kpiRef} gutter={[10, 10]} style={{ marginBottom: 14 }}>
        <KPICard title="Today's Revenue"  value={parseFloat(ds.total_revenue||0)}  formatter={formatCurrency} color="#B8860B" icon={<RiseOutlined />} comparison={revenueComparison} onClick={() => navigate('/reports/sales-reports')} />
        <KPICard title="Today's Bills"    value={parseInt(ds.total_bills||0)}       color="#1890ff" icon={<ShoppingCartOutlined />} suffix="bills" comparison={billsComparison} onClick={() => navigate('/pos')} />
        <KPICard title="Month Revenue"    value={parseFloat(ms.total_revenue||0)}   formatter={formatCurrency} color="#52c41a" icon={<BarChartOutlined />} />
        <KPICard title="Stock (MRP)"      value={parseFloat(inv.total_mrp||0)}      formatter={formatCurrency} color="#fa8c16" icon={<GoldOutlined />} onClick={() => navigate('/inventory')} />
        <KPICard title="Scheme Members"   value={parseInt(sch.active_members||0)}   color="#722ed1" icon={<TeamOutlined />} suffix="active" onClick={() => navigate('/savings')} />
        {isEnabled('goldsmith') && <KPICard title="Gold w/Karigar" value={`${((karigarData||[]).reduce((s,r)=>s+parseFloat(r.total_issued||0),0) - (karigarData||[]).reduce((s,r)=>s+parseFloat(r.total_returned||0),0)).toFixed(2)}g`} color="#ff4d4f" icon={<GoldOutlined />} />}
        <KPICard title="Total Pieces"     value={parseInt(inv.total_pieces||0)}     color="#888" icon={<AppstoreOutlined />} suffix="pcs" onClick={() => navigate('/inventory')} />
        <KPICard title="GST Collected"    value={parseFloat(ds.total_gst||0)}       formatter={formatCurrency} color="#13c2c2" icon={<SafetyOutlined />} />
      </Row>

      <Row ref={detailRef} gutter={[14, 14]}>
        {/* Counter + Payment split */}
        <Col xs={24} lg={12}>
          <Card title="🛒 Counter Performance — Today" bodyStyle={{ padding: 0 }} style={{ borderRadius: 8 }}
            extra={<Button type="link" size="small" onClick={() => navigate('/pos')}>Open POS →</Button>}>
            {(counterToday?.counterStats||[]).length === 0
              ? <EmptyState icon={<ShoppingCartOutlined />} title="No sales today" hint="Open POS to start billing — today's counter performance will show here." actionLabel="Open POS" onAction={() => navigate('/pos')} compact />
              : <Table
            scroll={{ x: "max-content" }} size="small" dataSource={counterToday?.counterStats||[]} rowKey="counter" pagination={false}
                  columns={[
                    { title: 'Counter', dataIndex: 'counter', render: v => <Tag color="blue">{v}</Tag> },
                    { title: 'Bills', dataIndex: 'total_bills', width: 55 },
                    { title: 'Revenue', dataIndex: 'total_revenue', render: v => <Text style={{ color: '#52c41a', fontWeight: 600 }}>{formatCurrency(v)}</Text> },
                  ]} />
            }
          </Card>
        </Col>

        {/* Stock summary */}
        <Col xs={24} lg={12}>
          <Card title="📦 Stock Summary" bodyStyle={{ padding: 0 }} style={{ borderRadius: 8 }}
            extra={<Button type="link" size="small" onClick={() => navigate('/inventory')}>View →</Button>}>
            <Table
            scroll={{ x: "max-content" }} size="small" dataSource={(inventory?.byType||[]).slice(0,5)} rowKey="Type_Code" pagination={false}
              columns={[
                { title: 'Type', dataIndex: 'Type_Name', render: v => <Text strong style={{ fontSize: 12 }}>{v}</Text> },
                { title: 'Pcs', dataIndex: 'count', width: 55 },
                { title: 'Gross Wt', dataIndex: 'total_weight', width: 90, render: v => `${parseFloat(v||0).toFixed(2)}g` },
                { title: 'MRP', dataIndex: 'total_mrp', render: v => <Text style={{ color: '#B8860B' }}>{formatCurrency(v)}</Text> },
              ]} />
          </Card>
        </Col>

        {/* Scheme status */}
        {isEnabled('savings_scheme') && (
          <Col xs={24} lg={12}>
            <Card title="🪙 Savings Scheme" bodyStyle={{ padding: '14px 20px' }} style={{ borderRadius: 8 }}
              extra={<Button type="link" size="small" onClick={() => navigate('/savings')}>View Club →</Button>}>
              <Row gutter={[10, 10]}>
                {[
                  { label: 'Active Members', value: parseInt(sch.active_members||0), color: '#722ed1' },
                  { label: 'Matured Ready', value: parseInt(sch.matured_members||0), color: '#52c41a' },
                  { label: 'Today Collection', value: parseFloat(sch.today_collection||0), fmt: formatCurrency, color: '#B8860B' },
                  { label: 'Overdue', value: parseInt(sch.overdue_members||0), color: '#ff4d4f' },
                ].map((s, i) => (
                  <Col xs={12} key={i}>
                    <Statistic title={<Text style={{ fontSize: 11, color: '#888' }}>{s.label}</Text>}
                      value={s.value} formatter={s.fmt ? v => s.fmt(v) : undefined}
                      valueStyle={{ color: s.color, fontSize: 15, fontWeight: 700 }} />
                  </Col>
                ))}
              </Row>
            </Card>
          </Col>
        )}

        {/* Karigar status if enabled */}
        {isEnabled('goldsmith') && (
          <Col xs={24} lg={12}>
            <Card title="⚒️ Karigar Summary" bodyStyle={{ padding: 0 }} style={{ borderRadius: 8 }}
              extra={<Button type="link" size="small" onClick={() => navigate('/karigar')}>Karigar →</Button>}>
              <Table
            scroll={{ x: "max-content" }} size="small" dataSource={(karigarData||[]).slice(0,5)} rowKey={(_, i) => i} pagination={false}
                columns={[
                  { title: 'Karigar', dataIndex: 'Vendor_Name', render: v => <Text strong style={{ fontSize: 12 }}>{v}</Text> },
                  { title: 'Issued', dataIndex: 'total_issued', width: 75, render: v => `${parseFloat(v||0).toFixed(2)}g` },
                  { title: 'Pending', dataIndex: 'pending_weight', width: 80, render: v => <Tag color={parseFloat(v)>0?'red':'green'}>{parseFloat(v||0).toFixed(2)}g</Tag> },
                ]} />
            </Card>
          </Col>
        )}

        {/* Low stock */}
        {isEnabled('inventory') && (stockAlerts||[]).length > 0 && (
          <Col xs={24}>
            <Alert
              message={`⚠️ ${(stockAlerts||[]).length} low stock items detected`}
              type="warning" showIcon
              action={<Button size="small" onClick={() => navigate('/inventory')}>View Inventory →</Button>} />
          </Col>
        )}
      </Row>
    </>
  );

  const SECTION = { RETAILER: RetailerSection, WHOLESALER: WholesalerSection, MANUFACTURER: ManufacturerSection, HYBRID: HybridSection };
  const SectionComponent = SECTION[businessType] || HybridSection;

  return (
    <div className="page-wrapper">
      {/* Business-type header bar */}
      <div ref={headerRef} style={{
        background:    `linear-gradient(135deg, ${btCfg.color}, ${btCfg.color}cc)`,
        borderRadius:  12,
        padding:       '14px 20px',
        marginBottom:  16,
        display:       'flex',
        justifyContent:'space-between',
        alignItems:    'center',
        flexWrap:      'wrap',
        gap:           8,
        boxShadow:     '0 4px 12px rgba(0,0,0,.15)',
      }}>
        <div>
          <Title level={4} style={{ margin: 0, color: 'white', fontSize: 'clamp(14px, 2.5vw, 18px)' }}>
            {btCfg.label}
          </Title>
          <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12 }}>
            {user?.companyName} &nbsp;·&nbsp; {dayjs().format('ddd, D MMM YYYY')}
          </Text>
        </div>
        <Space wrap>
          <Tag color="rgba(255,255,255,0.25)" style={{ color: 'white', border: '1px solid rgba(255,255,255,0.4)', fontSize: 11 }}>
            {businessType}
          </Tag>
          <Tag color="rgba(255,255,255,0.25)" style={{ color: 'white', border: '1px solid rgba(255,255,255,0.4)', fontSize: 11 }}>
            {user?.roleName}
          </Tag>
        </Space>
      </div>

      <div ref={metalRateRef}>
        <MetalRateDashboard />
      </div>
      <ClosingStockTodayWidget />
      {dailySalesLoading ? <SkeletonKPIRow /> : <SectionComponent />}

      <PageTour steps={tourSteps} />
    </div>
  );}
