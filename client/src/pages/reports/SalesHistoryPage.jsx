import React, { useState, useRef } from 'react';
import {
  Table, Card, Typography, DatePicker, Button, Space, Tag, Row, Col,
  Statistic, Select, Tabs, message, Divider,
} from 'antd';
import {
  DownloadOutlined, PrinterOutlined, BarChartOutlined,
  GoldOutlined, TeamOutlined, FileTextOutlined, ShopOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import api from '../../api/axios';
import { reportsApi } from '../../api/modules';
import { formatCurrency } from '../../utils/calculations';
import PageTour from '../../components/PageTour';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;
const { TabPane } = Tabs;
const { Option } = Select;

// CSV export helper
const exportCSV = (data, filename) => {
  if (!data?.length) { message.warning('No data to export.'); return; }
  const headers = Object.keys(data[0]).join(',');
  const rows = data.map((r) => Object.values(r).map((v) => `"${v ?? ''}"`).join(','));
  const csv = [headers, ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `${filename}_${dayjs().format('YYYYMMDD')}.csv`;
  a.click(); URL.revokeObjectURL(url);
};

export default function SalesHistoryPage() {
  const [dateRange, setDateRange] = useState([dayjs().startOf('month'), dayjs()]);
  const [activeTab, setActiveTab] = useState('sales');

  // ── Walkthrough tour refs ───────────────────────────────────────────────────
  const dateRangeRef = useRef(null);
  const tabsRef = useRef(null);
  const tourSteps = [
    { title: '1. Choose Period', description: 'Pick the date range for the Sales and GST tabs. Inventory and Karigar tabs always show a current snapshot regardless of this filter.', target: () => dateRangeRef.current },
    { title: '2. The 5 Report Tabs', description: 'Sales: revenue, collections and payment-mode breakdown for the period. Inventory: current stock value by item type. Karigar: work summary — issued vs returned gold per karigar. GST: tax filing summary and jewellery GST notes. Counters: per-counter performance cards for the period.', target: () => tabsRef.current },
    { title: '3. Export & Print', description: 'Look for the CSV button in each report card to export that table, or use Print (top right) for the whole page.' },
  ];

  const fromDate = dateRange[0].format('YYYY-MM-DD');
  const toDate = dateRange[1].format('YYYY-MM-DD');

  const { data: salesReport, isLoading: salesLoading } = useQuery({
    queryKey: ['sales-summary', fromDate, toDate],
    queryFn: () => api.get('/reports/sales-summary', { params: { fromDate, toDate } }).then((r) => r.data.data),
    enabled: activeTab === 'sales',
  });

  const { data: inventoryReport, isLoading: inventoryLoading } = useQuery({
    queryKey: ['inventory-value'],
    queryFn: () => api.get('/reports/inventory-value').then((r) => r.data.data),
    enabled: activeTab === 'inventory',
  });

  const { data: karigarReport, isLoading: karigarLoading } = useQuery({
    queryKey: ['karigar-summary'],
    queryFn: () => api.get('/reports/karigar-summary').then((r) => r.data.data),
    enabled: activeTab === 'karigar',
  });

  const { data: gstReport } = useQuery({
    queryKey: ['gst-summary', fromDate, toDate],
    queryFn: () => api.get('/reports/gst-summary', { params: { fromDate, toDate } }).then((r) => r.data.data),
    enabled: activeTab === 'gst',
  });

  const { data: counterReport } = useQuery({
    queryKey: ['counter-summary', fromDate, toDate],
    queryFn: () => reportsApi.counterSummary({ fromDate, toDate }).then(r => r.data.data),
    enabled: activeTab === 'counters',
  });

  // Daily breakdown table columns
  const dailyCols = [
    { title: 'Date', dataIndex: 'date', render: (v) => dayjs(v).format('DD-MMM-YYYY (ddd)') },
    { title: 'Bills', dataIndex: 'bills' },
    { title: 'Revenue', dataIndex: 'revenue', render: (v) => formatCurrency(v) },
  ];

  const paymentModeCols = [
    { title: 'Mode', dataIndex: 'Payment_Mode', render: (v) => <Tag color="blue">{v || 'Unknown'}</Tag> },
    { title: 'Count', dataIndex: 'count' },
    { title: 'Amount', dataIndex: 'amount', render: (v) => formatCurrency(v) },
  ];

  const inventoryCols = [
    { title: 'Item Type', dataIndex: 'Type_Name', render: (v) => <Text strong>{v}</Text> },
    { title: 'Pieces', dataIndex: 'count' },
    { title: 'Total Weight', dataIndex: 'total_weight', render: (v) => `${parseFloat(v || 0).toFixed(3)}g` },
    { title: 'Total MRP', dataIndex: 'total_mrp', render: (v) => formatCurrency(v) },
    { title: 'Cost Value', dataIndex: 'total_cost', render: (v) => formatCurrency(v) },
    {
      title: 'Margin',
      render: (_, r) => {
        const margin = ((r.total_mrp - r.total_cost) / r.total_mrp * 100);
        return <Tag color="green">{margin.toFixed(1)}%</Tag>;
      },
    },
  ];

  const karigarCols = [
    { title: 'Karigar', dataIndex: 'Vendor_Name', render: (v) => <Text strong>{v}</Text> },
    { title: 'Status', dataIndex: 'Status', render: (v) => <Tag color={v === 'Completed' ? 'green' : 'orange'}>{v}</Tag> },
    { title: 'Issues', dataIndex: 'issues' },
    { title: 'Issued (g)', dataIndex: 'total_issued', render: (v) => `${parseFloat(v || 0).toFixed(3)}g` },
    { title: 'Returned (g)', dataIndex: 'total_returned', render: (v) => `${parseFloat(v || 0).toFixed(3)}g` },
    { title: 'Pending (g)', dataIndex: 'pending_weight', render: (v) => <Tag color={parseFloat(v) > 0 ? 'red' : 'green'}>{parseFloat(v || 0).toFixed(3)}g</Tag> },
  ];

  const s = salesReport?.summary || {};

  return (
    <div className="page-wrapper">
      <div className="page-header">
        <Title level={4} style={{ margin: 0 }}>Reports & Analytics</Title>
        <div ref={dateRangeRef}>
        <Space>
          <RangePicker
            value={dateRange}
            onChange={(d) => d && setDateRange(d)}
            format="DD-MMM-YYYY"
            ranges={{
              'Today': [dayjs(), dayjs()],
              'This Week': [dayjs().startOf('week'), dayjs()],
              'This Month': [dayjs().startOf('month'), dayjs()],
              'Last Month': [dayjs().subtract(1, 'month').startOf('month'), dayjs().subtract(1, 'month').endOf('month')],
            }}
          />
          <Button icon={<PrinterOutlined />} onClick={() => window.print()}>Print</Button>
        </Space>
        </div>
      </div>

      <div ref={tabsRef}>
      <Tabs activeKey={activeTab} onChange={setActiveTab} type="card">

        {/* ─── Sales Report ─────────────────────────────────── */}
        <TabPane tab={<span><BarChartOutlined /> Sales</span>} key="sales">
          {/* Summary Cards */}
          <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
            {[
              { title: 'Total Bills', value: parseInt(s.total_bills || 0), color: '#B8860B' },
              { title: 'Total Revenue', value: parseFloat(s.total_revenue || 0), formatter: formatCurrency, color: '#52c41a' },
              { title: 'Collected', value: parseFloat(s.total_collected || 0), formatter: formatCurrency, color: '#1890ff' },
              { title: 'Pending', value: parseFloat(s.total_pending || 0), formatter: formatCurrency, color: '#fa8c16' },
              { title: 'GST Collected', value: parseFloat(s.total_gst || 0), formatter: formatCurrency, color: '#722ed1' },
              { title: 'Discounts Given', value: parseFloat(s.total_discount || 0), formatter: formatCurrency, color: '#ff4d4f' },
            ].map((c, i) => (
              <Col xs={12} md={8} lg={4} key={i}>
                <Card bodyStyle={{ padding: '16px 14px' }} style={{ borderRadius: 8, border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.07)' }}>
                  <Statistic
                    title={<Text style={{ fontSize: 11, color: '#888' }}>{c.title}</Text>}
                    value={c.value}
                    formatter={c.formatter ? (v) => c.formatter(v) : undefined}
                    valueStyle={{ color: c.color, fontSize: 18, fontWeight: 700 }}
                  />
                </Card>
              </Col>
            ))}
          </Row>

          <Row gutter={[16, 16]}>
            <Col xs={24} md={14}>
              <Card
                title="Daily Sales Breakdown"
                extra={<Button size="small" icon={<DownloadOutlined />} onClick={() => exportCSV(salesReport?.dailyBreakdown, 'daily_sales')}>Export CSV</Button>}
                style={{ borderRadius: 8 }} bodyStyle={{ padding: 0 }}
              >
                <Table
            scroll={{ x: "max-content" }} columns={dailyCols} dataSource={salesReport?.dailyBreakdown || []} rowKey="date"
                  pagination={false} size="small" loading={salesLoading} />
              </Card>
            </Col>
            <Col xs={24} md={10}>
              <Card title="By Payment Mode" style={{ borderRadius: 8, marginBottom: 16 }} bodyStyle={{ padding: 0 }}>
                <Table
            scroll={{ x: "max-content" }} columns={paymentModeCols} dataSource={salesReport?.byPaymentMode || []}
                  rowKey="Payment_Mode" pagination={false} size="small" loading={salesLoading} />
              </Card>
              <Card title="By Sale Type" style={{ borderRadius: 8 }} bodyStyle={{ padding: 0 }}>
                <Table
            scroll={{ x: "max-content" }}
                  columns={[
                    { title: 'Type', dataIndex: 'Sale_Type', render: (v) => <Tag color={v === 'Retail' ? 'green' : 'blue'}>{v}</Tag> },
                    { title: 'Count', dataIndex: 'count' },
                    { title: 'Amount', dataIndex: 'amount', render: (v) => formatCurrency(v) },
                  ]}
                  dataSource={salesReport?.bySaleType || []}
                  rowKey="Sale_Type" pagination={false} size="small" loading={salesLoading}
                />
              </Card>
            </Col>
          </Row>
        </TabPane>

        {/* ─── Inventory Report ─────────────────────────────── */}
        <TabPane tab={<span><GoldOutlined /> Inventory</span>} key="inventory">
          <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
            {[
              { title: 'Total Pieces', value: parseInt(inventoryReport?.overall?.total_pieces || 0), color: '#B8860B' },
              { title: 'Total Weight', value: parseFloat(inventoryReport?.overall?.total_weight || 0).toFixed(3) + 'g', color: '#1890ff' },
              { title: 'Total MRP', value: parseFloat(inventoryReport?.overall?.total_mrp || 0), formatter: formatCurrency, color: '#52c41a' },
              { title: 'Cost Value', value: parseFloat(inventoryReport?.overall?.total_cost || 0), formatter: formatCurrency, color: '#722ed1' },
            ].map((c, i) => (
              <Col xs={12} md={6} key={i}>
                <Card bodyStyle={{ padding: '16px 14px' }} style={{ borderRadius: 8, border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.07)' }}>
                  <Statistic
                    title={<Text style={{ fontSize: 11, color: '#888' }}>{c.title}</Text>}
                    value={typeof c.value === 'string' ? c.value : c.value}
                    formatter={c.formatter ? (v) => c.formatter(v) : undefined}
                    valueStyle={{ color: c.color, fontSize: 18, fontWeight: 700 }}
                  />
                </Card>
              </Col>
            ))}
          </Row>
          <Card
            title="Stock by Item Type"
            extra={<Button size="small" icon={<DownloadOutlined />} onClick={() => exportCSV(inventoryReport?.byType, 'inventory')}>Export CSV</Button>}
            style={{ borderRadius: 8 }} bodyStyle={{ padding: 0 }}
          >
            <Table
            scroll={{ x: "max-content" }} columns={inventoryCols} dataSource={inventoryReport?.byType || []}
              rowKey="Type_Code" size="small" loading={inventoryLoading} pagination={false} />
          </Card>
        </TabPane>

        {/* ─── Karigar Report ───────────────────────────────── */}
        <TabPane tab={<span><TeamOutlined /> Karigar</span>} key="karigar">
          <Card
            title="Karigar Work Summary"
            extra={<Button size="small" icon={<DownloadOutlined />} onClick={() => exportCSV(karigarReport, 'karigar_summary')}>Export CSV</Button>}
            style={{ borderRadius: 8 }} bodyStyle={{ padding: 0 }}
          >
            <Table
            scroll={{ x: "max-content" }} columns={karigarCols} dataSource={karigarReport || []}
              rowKey={(r, i) => i} size="small" loading={karigarLoading} pagination={false} />
          </Card>
        </TabPane>

        {/* ─── GST Report ───────────────────────────────────── */}
        <TabPane tab={<span><FileTextOutlined /> GST</span>} key="gst">
          <Row gutter={[16, 16]}>
            <Col xs={24} md={12}>
              <Card title="GST Summary" style={{ borderRadius: 8 }}>
                {gstReport && (
                  <Space direction="vertical" style={{ width: '100%' }} size={10}>
                    {[
                      { label: 'Period', value: `${dayjs(fromDate).format('DD-MMM-YYYY')} to ${dayjs(toDate).format('DD-MMM-YYYY')}` },
                      { label: 'Tax Invoices Issued', value: parseInt(gstReport.invoice_count || 0) },
                      { label: 'Total Taxable Value', value: formatCurrency(gstReport.taxable_value) },
                      // Real per-invoice CGST/SGST/IGST split — the rate
                      // varies by item (making charges, repair labour,
                      // etc. can differ), so this is never one blended
                      // "GST @ X%" figure that doesn't actually apply to
                      // every invoice in the period.
                      { label: 'CGST', value: formatCurrency(gstReport.total_cgst) },
                      { label: 'SGST', value: formatCurrency(gstReport.total_sgst) },
                      { label: 'IGST (interstate)', value: formatCurrency(gstReport.total_igst) },
                      { label: 'Total GST', value: formatCurrency(gstReport.total_gst) },
                      { label: 'Total Invoice Value', value: formatCurrency(gstReport.total_invoice_value) },
                    ].map((r) => (
                      <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f0f0f0' }}>
                        <Text type="secondary">{r.label}</Text>
                        <Text strong>{r.value}</Text>
                      </div>
                    ))}
                  </Space>
                )}
              </Card>
            </Col>
            <Col xs={24} md={12}>
              <Card title="B2B / B2C Split (GSTR-1)" style={{ borderRadius: 8, marginBottom: 16 }}>
                {gstReport && (
                  <Space direction="vertical" style={{ width: '100%' }} size={10}>
                    {[
                      { label: 'B2B (customer has a GSTIN)', row: gstReport.b2b },
                      { label: 'B2C (no GSTIN on file)', row: gstReport.b2c },
                    ].map((r) => (
                      <div key={r.label} style={{ padding: '6px 0', borderBottom: '1px solid #f0f0f0' }}>
                        <Text type="secondary">{r.label}</Text>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                          <Text style={{ fontSize: 12 }}>{r.row?.invoice_count || 0} invoice(s)</Text>
                          <Text strong>{formatCurrency(r.row?.taxable_value)} + {formatCurrency(r.row?.gst_amount)} GST</Text>
                        </div>
                      </div>
                    ))}
                  </Space>
                )}
              </Card>
            </Col>
            <Col xs={24} md={12}>
              <Card title="GST Filing Notes" style={{ borderRadius: 8 }}>
                <ul style={{ paddingLeft: 16, lineHeight: 2, color: '#555', fontSize: 13 }}>
                  <li>Jewellery HSN Code: <strong>7113</strong></li>
                  <li>Applicable GST Rate: <strong>3%</strong> (CGST 1.5% + SGST 1.5%)</li>
                  <li>Threshold for PAN: Sales {'>'} ₹2 Lakh require customer PAN</li>
                  <li>Old Gold Exchange: GST applies only on making charges</li>
                  <li>This report is for reference only — consult your CA for filing</li>
                </ul>
              </Card>
            </Col>
          </Row>
        </TabPane>

        {/* ─── Counter Report ───────────────────────────────────────────── */}
        <TabPane tab={<span><ShopOutlined /> Counters</span>} key="counters">
          <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
            {(counterReport?.counterStats || []).map((c, i) => (
              <Col xs={24} md={12} lg={8} key={i}>
                <Card
                  style={{ borderRadius: 10, border: '2px solid #B8860B20', boxShadow: '0 2px 8px rgba(0,0,0,0.07)' }}
                  bodyStyle={{ padding: 20 }}
                  title={
                    <Space>
                      <ShopOutlined style={{ color: '#B8860B' }} />
                      <Text strong style={{ color: '#B8860B' }}>{c.counter}</Text>
                    </Space>
                  }
                  extra={<Tag color="gold">{c.operator}</Tag>}
                >
                  <Row gutter={[12, 12]}>
                    {[
                      { label: 'Bills', value: parseInt(c.total_bills || 0), color: '#1890ff' },
                      { label: 'Revenue', value: parseFloat(c.total_revenue || 0), formatter: formatCurrency, color: '#52c41a' },
                      { label: 'Collected', value: parseFloat(c.total_collected || 0), formatter: formatCurrency, color: '#B8860B' },
                      { label: 'GST', value: parseFloat(c.total_gst || 0), formatter: formatCurrency, color: '#722ed1' },
                    ].map((s, j) => (
                      <Col xs={12} key={j}>
                        <Statistic
                          title={<Text style={{ fontSize: 11, color: '#888' }}>{s.label}</Text>}
                          value={s.value}
                          formatter={s.formatter ? (v) => s.formatter(v) : undefined}
                          valueStyle={{ color: s.color, fontSize: 16, fontWeight: 700 }}
                        />
                      </Col>
                    ))}
                  </Row>
                  <Divider style={{ margin: '12px 0 8px' }} />
                  <Space size={16}>
                    <Text style={{ fontSize: 12 }}>💵 Cash: <strong>{c.cash_bills}</strong></Text>
                    <Text style={{ fontSize: 12 }}>📱 UPI: <strong>{c.upi_bills}</strong></Text>
                    <Text style={{ fontSize: 12 }}>💳 Card: <strong>{c.card_bills}</strong></Text>
                  </Space>
                </Card>
              </Col>
            ))}
            {(!counterReport?.counterStats?.length) && (
              <Col xs={24}>
                <Card style={{ borderRadius: 8, textAlign: 'center' }}>
                  <Text type="secondary">No counter sales data for this period. Open POS windows and assign counters to start tracking.</Text>
                </Card>
              </Col>
            )}
          </Row>

          {/* Grand total across all counters */}
          {(counterReport?.counterStats?.length || 0) > 0 && (
            <Card title="All Counters Combined" style={{ borderRadius: 8 }}>
              <Row gutter={[16, 0]}>
                {[
                  { label: 'Total Bills', value: (counterReport?.counterStats || []).reduce((s, r) => s + parseInt(r.total_bills || 0), 0) },
                  { label: 'Total Revenue', value: (counterReport?.counterStats || []).reduce((s, r) => s + parseFloat(r.total_revenue || 0), 0), formatter: formatCurrency },
                  { label: 'Total GST', value: (counterReport?.counterStats || []).reduce((s, r) => s + parseFloat(r.total_gst || 0), 0), formatter: formatCurrency },
                ].map((s, i) => (
                  <Col xs={8} key={i}>
                    <Statistic
                      title={s.label}
                      value={s.value}
                      formatter={s.formatter ? (v) => s.formatter(v) : undefined}
                      valueStyle={{ color: '#B8860B', fontWeight: 700 }}
                    />
                  </Col>
                ))}
              </Row>
            </Card>
          )}
        </TabPane>

      </Tabs>
      </div>

      <PageTour steps={tourSteps} />
    </div>
  );
}
