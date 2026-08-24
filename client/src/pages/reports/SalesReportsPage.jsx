/**
 * Sales Reports — Daily | Item Wise | Returns | Counter Wise | Branch Wise
 */
import React, { useState, useMemo, useRef } from 'react';
import {
  Row, Col, Card, Typography, DatePicker, Button, Space, Tag, Tabs,
  Table, Statistic, Select, message, Progress, Divider,
} from 'antd';
import {
  DownloadOutlined, PrinterOutlined, BarChartOutlined, RiseOutlined,
  ShopOutlined, BranchesOutlined, RollbackOutlined, AppstoreOutlined, GoldOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import api from '../../api/axios';
import { formatCurrency } from '../../utils/calculations';
import PageTour from '../../components/PageTour';
import dayjs from 'dayjs';
import { METAL_TYPE_COLORS } from '../../utils/metalTypes';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;
const { Option } = Select;

const exportCSV = (data, filename) => {
  if (!data?.length) { message.warning('No data to export.'); return; }
  const headers = Object.keys(data[0]).join(',');
  const rows = data.map(r => Object.values(r).map(v => `"${v??''}"`).join(','));
  const csv = [headers, ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url;
  a.download = `${filename}_${dayjs().format('YYYYMMDD')}.csv`; a.click();
  URL.revokeObjectURL(url);
};

// Mini sparkline bar
const TrendBar = ({ current, max, color }) => (
  <Progress percent={max > 0 ? Math.round((current/max)*100) : 0} strokeColor={color}
    showInfo={false} size="small" style={{ margin: 0 }} />
);

export default function SalesReportsPage() {
  const [dateRange, setDateRange] = useState([dayjs().startOf('month'), dayjs()]);
  const [activeTab, setActiveTab] = useState('daily');

  // ── Walkthrough tour refs ───────────────────────────────────────────────────
  const dateRangeRef = useRef(null);
  const tabsRef = useRef(null);
  const tourSteps = [
    { title: '1. Choose Period', description: 'Pick the date range you want to report on — presets for Today, This Week, This Month and Last Month are one click away.', target: () => dateRangeRef.current },
    { title: '2. The 5 Sales Reports', description: 'Daily Sales: day-by-day revenue trend. Item Wise: which item types are selling best. Sales Return: cancelled/returned bills. Counter Wise: performance by billing counter. Branch Wise: performance by branch. Switch tabs any time you need a different view.', target: () => tabsRef.current },
    { title: '3. Export & Print', description: 'Every report card has a CSV button in its header — use it to download that specific table for Excel or WhatsApp sharing. Use Print (top right) to print the whole page.' },
  ];

  const fromDate = dateRange[0].format('YYYY-MM-DD');
  const toDate = dateRange[1].format('YYYY-MM-DD');

  const { data: salesData, isLoading } = useQuery({
    queryKey: ['sales-full', fromDate, toDate],
    queryFn: () => api.get('/reports/sales-summary', { params: { fromDate, toDate } }).then(r => r.data.data),
  });
  const { data: itemSales } = useQuery({
    queryKey: ['item-sales', fromDate, toDate],
    queryFn: () => api.get('/reports/item-wise-sales', { params: { fromDate, toDate } }).then(r => r.data.data || []),
  });
  const { data: counterData } = useQuery({
    queryKey: ['counter-sales', fromDate, toDate],
    queryFn: () => api.get('/reports/counter-summary', { params: { fromDate, toDate } }).then(r => r.data.data),
  });
  const { data: branchData } = useQuery({
    queryKey: ['branch-sales', fromDate, toDate],
    queryFn: () => api.get('/reports/branch-wise-sales', { params: { fromDate, toDate } }).then(r => r.data.data || []),
  });
  const { data: returnsData } = useQuery({
    queryKey: ['sales-returns', fromDate, toDate],
    queryFn: () => api.get('/reports/sales-returns', { params: { fromDate, toDate } }).then(r => r.data.data || []),
  });
  const { data: metalSales } = useQuery({
    queryKey: ['sales-by-metal', fromDate, toDate],
    queryFn: () => api.get('/reports/sales-by-metal', { params: { fromDate, toDate } }).then(r => r.data.data),
  });

  const s = salesData?.summary || {};
  const daily = salesData?.dailyBreakdown || [];
  const maxDayRevenue = useMemo(() => Math.max(...daily.map(d => parseFloat(d.revenue||0)), 1), [daily]);

  const summaryCards = [
    { title: 'Total Bills', value: parseInt(s.total_bills||0), color: '#B8860B', suffix: 'bills' },
    { title: 'Total Revenue', value: parseFloat(s.total_revenue||0), color: '#52c41a', format: formatCurrency },
    { title: 'Cash Collected', value: parseFloat(s.total_collected||0), color: '#1890ff', format: formatCurrency },
    { title: 'Pending / Credit', value: parseFloat(s.total_pending||0), color: '#ff4d4f', format: formatCurrency },
    { title: 'GST Collected', value: parseFloat(s.total_gst||0), color: '#722ed1', format: formatCurrency },
    { title: 'Avg Bill Value', value: parseInt(s.total_bills||0) > 0 ? parseFloat(s.total_revenue||0)/parseInt(s.total_bills) : 0, color: '#fa8c16', format: formatCurrency },
  ];

  const dailyCols = [
    { title: 'Date', dataIndex: 'date', width: 130, render: v => <Text strong style={{fontSize:12}}>{dayjs(v).format('ddd, DD-MMM-YYYY')}</Text> },
    { title: 'Bills', dataIndex: 'bills', width: 70, render: v => <Tag color="blue">{v}</Tag> },
    { title: 'Revenue', dataIndex: 'revenue', width: 130, render: v => <Text strong style={{color:'#52c41a'}}>{formatCurrency(v)}</Text> },
    { title: 'GST', dataIndex: 'gst', width: 110, render: v => formatCurrency(v||0) },
    { title: 'Trend', render: (_, r) => <TrendBar current={parseFloat(r.revenue||0)} max={maxDayRevenue} color="#B8860B" />, width: 150 },
  ];

  const itemCols = [
    { title: 'Item Type', dataIndex: 'Type_Name', render: v => <Text strong>{v}</Text> },
    { title: 'Qty Sold', dataIndex: 'qty_sold', width: 80, render: v => <Tag color="blue">{v}</Tag> },
    { title: 'Total Weight', dataIndex: 'total_weight', width: 110, render: v => `${parseFloat(v||0).toFixed(3)}g` },
    { title: 'Revenue', dataIndex: 'revenue', width: 130, render: v => <Text strong style={{color:'#52c41a'}}>{formatCurrency(v)}</Text> },
    { title: '% of Sales', dataIndex: 'pct', width: 120, render: (_, r) => {
      const total = parseFloat(s.total_revenue||1);
      const pct = Math.round((parseFloat(r.revenue||0)/total)*100);
      return <TrendBar current={parseFloat(r.revenue||0)} max={total} color="#B8860B" />;
    }},
  ];

  const metalCols = [
    { title: 'Metal', dataIndex: 'Metal_Type', render: v => <Tag color={METAL_TYPE_COLORS[v] || 'default'}>{v}</Tag> },
    { title: 'Pieces Sold', dataIndex: 'pieces_sold', width: 100, render: v => <Tag color="blue">{v}</Tag> },
    { title: 'Total Weight', dataIndex: 'total_weight', width: 120, render: v => `${parseFloat(v||0).toFixed(3)}g` },
    { title: 'Revenue', dataIndex: 'total_revenue', render: v => <Text strong style={{color:'#52c41a'}}>{formatCurrency(v)}</Text> },
    { title: '% of Sales', width: 150, render: (_, r) => {
      const total = parseFloat(metalSales?.overall?.total_revenue || 1);
      return <TrendBar current={parseFloat(r.total_revenue||0)} max={total} color="#B8860B" />;
    }},
  ];

  const returnCols = [
    { title: 'Invoice No', dataIndex: 'Invoice_Number', render: v => <Text code>{v}</Text> },
    { title: 'Date', dataIndex: 'Sale_Date', render: v => dayjs(v).format('DD-MMM-YYYY') },
    { title: 'Customer', dataIndex: 'Customer_Name' },
    { title: 'Amount', dataIndex: 'Net_Payable_Amount', render: v => <Text style={{color:'#ff4d4f'}}>{formatCurrency(v)}</Text> },
    { title: 'Reason', dataIndex: 'Notes', render: v => v || '-' },
    { title: 'Status', dataIndex: 'Payment_Status', render: v => <Tag color="red">{v}</Tag> },
  ];

  const counterCols = [
    { title: 'Counter', dataIndex: 'counter', render: v => <Text strong><ShopOutlined /> {v}</Text> },
    { title: 'Operator', dataIndex: 'operator' },
    { title: 'Bills', dataIndex: 'total_bills', width: 70, render: v => <Tag color="blue">{v}</Tag> },
    { title: 'Revenue', dataIndex: 'total_revenue', render: v => <Text strong style={{color:'#52c41a'}}>{formatCurrency(v)}</Text> },
    { title: 'Cash', dataIndex: 'cash_bills', width: 70 },
    { title: 'UPI', dataIndex: 'upi_bills', width: 70 },
    { title: 'Card', dataIndex: 'card_bills', width: 70 },
  ];

  const branchCols = [
    { title: 'Branch', dataIndex: 'branch_name', render: v => <Text strong><BranchesOutlined /> {v}</Text> },
    { title: 'Bills', dataIndex: 'total_bills', width: 80, render: v => <Tag color="blue">{v}</Tag> },
    { title: 'Revenue', dataIndex: 'total_revenue', render: v => <Text strong style={{color:'#52c41a'}}>{formatCurrency(v)}</Text> },
    { title: 'GST', dataIndex: 'total_gst', render: v => formatCurrency(v||0) },
    { title: 'Trend', render: (_, r) => {
      const max = Math.max(...(branchData||[]).map(b=>parseFloat(b.total_revenue||0)),1);
      return <TrendBar current={parseFloat(r.total_revenue||0)} max={max} color="#52c41a" />;
    }},
  ];

  const tabItems = [
    {
      key: 'daily', label: <span><BarChartOutlined /> Daily Sales</span>,
      children: (
        <>
          <Row gutter={[10,10]} style={{marginBottom:14}}>
            {summaryCards.map((c,i) => (
              <Col xs={12} sm={8} lg={4} key={i}>
                <Card bodyStyle={{padding:'12px 14px'}} style={{borderRadius:8,border:'none',boxShadow:'0 1px 4px rgba(0,0,0,.07)',borderTop:`3px solid ${c.color}`}}>
                  <Statistic title={<Text style={{fontSize:11,color:'#888'}}>{c.title}</Text>}
                    value={c.value} formatter={c.format ? v=>c.format(v) : undefined}
                    valueStyle={{color:c.color,fontSize:17,fontWeight:700}} suffix={!c.format?c.suffix:undefined} />
                </Card>
              </Col>
            ))}
          </Row>
          <Row gutter={[14,14]}>
            <Col xs={24} lg={15}>
              <Card title="Daily Sales Breakdown" bodyStyle={{padding:0}} style={{borderRadius:8}}
                extra={<Button size="small" icon={<DownloadOutlined />} onClick={()=>exportCSV(daily,'daily_sales')}>CSV</Button>}>
                <Table
            scroll={{ x: "max-content" }} columns={dailyCols} dataSource={daily} rowKey="date" size="small" loading={isLoading} pagination={{pageSize:15}} />
              </Card>
            </Col>
            <Col xs={24} lg={9}>
              <Card title="By Payment Mode" bodyStyle={{padding:0}} style={{borderRadius:8,marginBottom:12}}>
                <Table
            scroll={{ x: "max-content" }} columns={[
                  {title:'Mode',dataIndex:'Payment_Mode',render:v=><Tag color="blue">{v||'Other'}</Tag>},
                  {title:'Count',dataIndex:'count',width:60},
                  {title:'Amount',dataIndex:'amount',render:v=>formatCurrency(v)},
                ]} dataSource={salesData?.byPaymentMode||[]} rowKey="Payment_Mode" size="small" pagination={false} />
              </Card>
              <Card title="By Sale Type" bodyStyle={{padding:0}} style={{borderRadius:8}}>
                <Table
            scroll={{ x: "max-content" }} columns={[
                  {title:'Type',dataIndex:'Sale_Type',render:v=><Tag color={v==='Retail'?'green':'blue'}>{v}</Tag>},
                  {title:'Count',dataIndex:'count',width:60},
                  {title:'Amount',dataIndex:'amount',render:v=>formatCurrency(v)},
                ]} dataSource={salesData?.bySaleType||[]} rowKey="Sale_Type" size="small" pagination={false} />
              </Card>
            </Col>
          </Row>
        </>
      ),
    },
    {
      key: 'item', label: <span><AppstoreOutlined /> Item Wise</span>,
      children: (
        <Card title="Item Wise Sales Analysis" bodyStyle={{padding:0}} style={{borderRadius:8}}
          extra={<Button size="small" icon={<DownloadOutlined />} onClick={()=>exportCSV(itemSales||[],'item_wise_sales')}>CSV</Button>}>
          <Table
            scroll={{ x: "max-content" }} columns={itemCols} dataSource={itemSales||[]} rowKey="Type_Name" size="small" pagination={{pageSize:20}} />
        </Card>
      ),
    },
    {
      key: 'metal', label: <span><GoldOutlined /> Metal Wise</span>,
      children: (
        <Card title="Sales by Metal Type" bodyStyle={{padding:0}} style={{borderRadius:8}}
          extra={<Button size="small" icon={<DownloadOutlined />} onClick={()=>exportCSV(metalSales?.byMetal||[],'sales_by_metal')}>CSV</Button>}>
          <Table
            scroll={{ x: "max-content" }} columns={metalCols} dataSource={metalSales?.byMetal||[]} rowKey="Metal_Type" size="small" pagination={false} />
        </Card>
      ),
    },
    {
      key: 'returns', label: <span><RollbackOutlined /> Returns</span>,
      children: (
        <Card title="Sales Return / Cancelled Bills" bodyStyle={{padding:0}} style={{borderRadius:8}}
          extra={<Button size="small" icon={<DownloadOutlined />} onClick={()=>exportCSV(returnsData||[],'sales_returns')}>CSV</Button>}>
          <Table
            scroll={{ x: "max-content" }} columns={returnCols} dataSource={returnsData||[]} rowKey="Sale_ID" size="small" pagination={{pageSize:20}} />
        </Card>
      ),
    },
    {
      key: 'counter', label: <span><ShopOutlined /> Counter Wise</span>,
      children: (
        <Card title="Counter Wise Sales Summary" bodyStyle={{padding:0}} style={{borderRadius:8}}
          extra={<Button size="small" icon={<DownloadOutlined />} onClick={()=>exportCSV(counterData?.counterStats||[],'counter_sales')}>CSV</Button>}>
          <Table
            scroll={{ x: "max-content" }} columns={counterCols} dataSource={counterData?.counterStats||[]} rowKey="counter" size="small" pagination={false} />
        </Card>
      ),
    },
    {
      key: 'branch', label: <span><BranchesOutlined /> Branch Wise</span>,
      children: (
        <Card title="Branch Wise Sales Summary" bodyStyle={{padding:0}} style={{borderRadius:8}}
          extra={<Button size="small" icon={<DownloadOutlined />} onClick={()=>exportCSV(branchData||[],'branch_sales')}>CSV</Button>}>
          <Table
            scroll={{ x: "max-content" }} columns={branchCols} dataSource={branchData||[]} rowKey="branch_name" size="small" pagination={false} />
        </Card>
      ),
    },
  ];

  return (
    <div className="page-wrapper">
      <div className="page-header">
        <Title level={4} style={{margin:0}}><BarChartOutlined style={{color:'#B8860B',marginRight:8}} />Sales Reports</Title>
        <div ref={dateRangeRef}>
        <Space>
          <RangePicker value={dateRange} onChange={d=>d&&setDateRange(d)} format="DD-MMM-YYYY"
            presets={[
              {label:'Today',value:[dayjs(),dayjs()]},
              {label:'This Week',value:[dayjs().startOf('week'),dayjs()]},
              {label:'This Month',value:[dayjs().startOf('month'),dayjs()]},
              {label:'Last Month',value:[dayjs().subtract(1,'month').startOf('month'),dayjs().subtract(1,'month').endOf('month')]},
            ]} />
          <Button icon={<PrinterOutlined />} onClick={()=>window.print()}>Print</Button>
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
