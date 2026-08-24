/**
 * Approval Reports — Pending | Issue | Receive | Outstanding
 */
import React, { useState, useRef } from 'react';
import { Row, Col, Card, Typography, DatePicker, Button, Tag, Tabs, Table, Statistic, message } from 'antd';
import { DownloadOutlined, SwapOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { reportsApi } from '../../api/modules';
import { formatCurrency, formatWeight } from '../../utils/calculations';
import PageTour from '../../components/PageTour';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

const exportCSV = (data, filename) => {
  if (!data?.length) { message.warning('No data.'); return; }
  const csv = [Object.keys(data[0]).join(','), ...data.map(r => Object.values(r).map(v => `"${v ?? ''}"`).join(','))].join('\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = `${filename}_${dayjs().format('YYYYMMDD')}.csv`; a.click();
};

export default function ApprovalReportsPage() {
  const [dateRange, setDateRange] = useState([dayjs().startOf('month'), dayjs()]);
  const [activeTab, setActiveTab] = useState('pending');

  // ── Walkthrough tour refs ───────────────────────────────────────────────────
  const dateRangeRef = useRef(null);
  const tabsRef = useRef(null);
  const tourSteps = [
    { title: '1. Choose Period', description: 'Pick the date range for the Issue and Receive tabs — items sent out or returned in that window. Outstanding always shows every party\'s current pending balance regardless of this filter.', target: () => dateRangeRef.current },
    { title: '2. Approval-Out Reports', description: 'These reports track goods sent to customers "on approval" — for them to consider before buying, not yet a sale. Approval Pending: vouchers still awaiting return or settlement. Approval Issue: items sent out this period. Approval Receive: items returned/settled this period. Approval Outstanding: every party with pending items, all-time.', target: () => tabsRef.current },
    { title: '3. Export Anytime', description: 'Every tab has a CSV button in its card header to download that specific report.' },
  ];

  const fromDate = dateRange[0].format('YYYY-MM-DD');
  const toDate = dateRange[1].format('YYYY-MM-DD');

  const { data: pendingData, isLoading: pendingLoading } = useQuery({
    queryKey: ['approval-pending-report', fromDate, toDate],
    queryFn: () => reportsApi.approvalPending({ fromDate, toDate }).then(r => r.data.data || { items: [], totals: {} }),
    enabled: activeTab === 'pending',
  });
  const { data: issueData, isLoading: issueLoading } = useQuery({
    queryKey: ['approval-issue-report', fromDate, toDate],
    queryFn: () => reportsApi.approvalIssue({ fromDate, toDate }).then(r => r.data.data || { items: [], totals: {} }),
    enabled: activeTab === 'issue',
  });
  const { data: receiveData, isLoading: receiveLoading } = useQuery({
    queryKey: ['approval-receive-report', fromDate, toDate],
    queryFn: () => reportsApi.approvalReceive({ fromDate, toDate }).then(r => r.data.data || { items: [], totals: {} }),
    enabled: activeTab === 'receive',
  });
  const { data: outstandingData, isLoading: outstandingLoading } = useQuery({
    queryKey: ['approval-outstanding-report'],
    queryFn: () => reportsApi.approvalOutstanding({}).then(r => r.data.data || { items: [], totals: {} }),
    enabled: activeTab === 'outstanding',
  });

  const statCard = (title, value, color, fmt) => (
    <Col xs={12} md={6}>
      <Card bodyStyle={{ padding: '12px 14px' }} style={{ borderRadius: 8, border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,.07)', borderTop: `3px solid ${color}` }}>
        <Statistic title={<Text style={{ fontSize: 11, color: '#888' }}>{title}</Text>} value={value} formatter={fmt ? v => fmt(v) : undefined}
          valueStyle={{ color, fontSize: 17, fontWeight: 700 }} />
      </Card>
    </Col>
  );

  const pendingCols = [
    { title: 'Voucher No', dataIndex: 'Voucher_Number', render: v => <Text code style={{ fontSize: 11 }}>{v}</Text> },
    { title: 'Type', dataIndex: 'Item_Mode', render: v => <Tag color={v === 'Tagged' ? 'gold' : 'blue'}>{v}</Tag> },
    { title: 'Party', dataIndex: 'Party_Name', render: v => v || '—' },
    { title: 'Issue Date', dataIndex: 'Issue_Date', render: v => dayjs(v).format('DD-MMM-YYYY') },
    { title: 'Status', dataIndex: 'Status', render: v => <Tag color={v === 'Partial' ? 'blue' : 'orange'}>{v}</Tag> },
    { title: 'Pending Items', dataIndex: 'pending_items' },
    { title: 'Pending Weight', dataIndex: 'pending_weight', render: formatWeight },
    { title: 'Pending Value', dataIndex: 'pending_value', render: formatCurrency },
  ];

  const issueCols = [
    { title: 'Voucher No', dataIndex: 'Voucher_Number', render: v => <Text code style={{ fontSize: 11 }}>{v}</Text> },
    { title: 'Type', dataIndex: 'Item_Mode', render: v => <Tag color={v === 'Tagged' ? 'gold' : 'blue'}>{v}</Tag> },
    { title: 'Party', dataIndex: 'Party_Name', render: v => v || '—' },
    { title: 'Issue Date', dataIndex: 'Issue_Date', render: v => dayjs(v).format('DD-MMM-YYYY') },
    { title: 'Items', dataIndex: 'Total_Items_Issued' },
    { title: 'Weight', dataIndex: 'Total_Weight_Issued', render: formatWeight },
    { title: 'Value', dataIndex: 'Total_Value_Issued', render: formatCurrency },
    { title: 'Status', dataIndex: 'Status', render: v => <Tag color={v === 'Completed' ? 'green' : v === 'Cancelled' ? 'red' : v === 'Partial' ? 'blue' : 'orange'}>{v}</Tag> },
  ];

  const receiveCols = [
    { title: 'Receive Voucher', dataIndex: 'Voucher_Number', render: v => <Text code style={{ fontSize: 11 }}>{v}</Text> },
    { title: 'Type', dataIndex: 'Item_Mode', render: v => <Tag color={v === 'Tagged' ? 'gold' : 'blue'}>{v}</Tag> },
    { title: 'Against Issue', dataIndex: 'Issue_Voucher_Number', render: v => <Text code style={{ fontSize: 11 }}>{v}</Text> },
    { title: 'Party', dataIndex: 'Party_Name', render: v => v || '—' },
    { title: 'Receive Date', dataIndex: 'Receive_Date', render: v => dayjs(v).format('DD-MMM-YYYY') },
    { title: 'Items Returned', dataIndex: 'Items_Received_Count' },
    { title: 'Weight Returned', dataIndex: 'Total_Weight_Received', render: formatWeight },
    { title: 'Value Returned', dataIndex: 'Total_Value_Received', render: formatCurrency },
  ];

  const outstandingCols = [
    { title: 'Party', dataIndex: 'Party_Name' },
    { title: 'Mobile', dataIndex: 'Mobile' },
    { title: 'Total Issued', dataIndex: 'total_issued' },
    { title: 'Total Received', dataIndex: 'total_received' },
    { title: 'Pending Qty', dataIndex: 'pending_items' },
    { title: 'Pending Weight', dataIndex: 'pending_weight', render: formatWeight },
    { title: 'Pending Value', dataIndex: 'pending_value', render: v => <Text strong style={{ color: '#fa8c16' }}>{formatCurrency(v)}</Text> },
  ];

  const tabItems = [
    {
      key: 'pending', label: <span>⏳ Approval Pending</span>,
      children: (
        <>
          <Row gutter={[10, 10]} style={{ marginBottom: 14 }}>
            {statCard('Pending Items', parseInt(pendingData?.totals?.pendingItems || 0), '#fa8c16')}
            {statCard('Pending Weight', parseFloat(pendingData?.totals?.pendingWeight || 0), '#B8860B', formatWeight)}
            {statCard('Pending Value', parseFloat(pendingData?.totals?.pendingValue || 0), '#1890ff', formatCurrency)}
          </Row>
          <Card title="Vouchers Still Outstanding" bodyStyle={{ padding: 0 }} style={{ borderRadius: 8 }}
            extra={<Button size="small" icon={<DownloadOutlined />} onClick={() => exportCSV(pendingData?.items || [], 'approval_pending')}>CSV</Button>}>
            <Table scroll={{ x: 'max-content' }} columns={pendingCols} dataSource={pendingData?.items || []} rowKey="Issue_ID" size="small" loading={pendingLoading} pagination={{ pageSize: 20 }} />
          </Card>
        </>
      ),
    },
    {
      key: 'issue', label: <span>📤 Approval Issue</span>,
      children: (
        <>
          <Row gutter={[10, 10]} style={{ marginBottom: 14 }}>
            {statCard('Items Issued', parseInt(issueData?.totals?.items || 0), '#B8860B')}
            {statCard('Weight Issued', parseFloat(issueData?.totals?.weight || 0), '#fa8c16', formatWeight)}
            {statCard('Value Issued', parseFloat(issueData?.totals?.value || 0), '#52c41a', formatCurrency)}
          </Row>
          <Card title="Approval Issue Vouchers" bodyStyle={{ padding: 0 }} style={{ borderRadius: 8 }}
            extra={<Button size="small" icon={<DownloadOutlined />} onClick={() => exportCSV(issueData?.items || [], 'approval_issue')}>CSV</Button>}>
            <Table scroll={{ x: 'max-content' }} columns={issueCols} dataSource={issueData?.items || []} rowKey="Issue_ID" size="small" loading={issueLoading} pagination={{ pageSize: 20 }} />
          </Card>
        </>
      ),
    },
    {
      key: 'receive', label: <span>📥 Approval Receive</span>,
      children: (
        <>
          <Row gutter={[10, 10]} style={{ marginBottom: 14 }}>
            {statCard('Items Returned', parseInt(receiveData?.totals?.items || 0), '#52c41a')}
            {statCard('Weight Returned', parseFloat(receiveData?.totals?.weight || 0), '#B8860B', formatWeight)}
            {statCard('Value Returned', parseFloat(receiveData?.totals?.value || 0), '#1890ff', formatCurrency)}
          </Row>
          <Card title="Approval Receive Vouchers" bodyStyle={{ padding: 0 }} style={{ borderRadius: 8 }}
            extra={<Button size="small" icon={<DownloadOutlined />} onClick={() => exportCSV(receiveData?.items || [], 'approval_receive')}>CSV</Button>}>
            <Table scroll={{ x: 'max-content' }} columns={receiveCols} dataSource={receiveData?.items || []} rowKey="Receive_ID" size="small" loading={receiveLoading} pagination={{ pageSize: 20 }} />
          </Card>
        </>
      ),
    },
    {
      key: 'outstanding', label: <span>📊 Approval Outstanding</span>,
      children: (
        <>
          <Row gutter={[10, 10]} style={{ marginBottom: 14 }}>
            {statCard('Total Approval Out', parseInt(outstandingData?.totals?.totalOut || 0), '#fa8c16')}
            {statCard('Pending Weight', parseFloat(outstandingData?.totals?.pendingWeight || 0), '#B8860B', formatWeight)}
            {statCard('Pending Value', parseFloat(outstandingData?.totals?.pendingValue || 0), '#1890ff', formatCurrency)}
          </Row>
          <Card title="Outstanding by Party" bodyStyle={{ padding: 0 }} style={{ borderRadius: 8 }}
            extra={<Button size="small" icon={<DownloadOutlined />} onClick={() => exportCSV(outstandingData?.items || [], 'approval_outstanding')}>CSV</Button>}>
            <Table scroll={{ x: 'max-content' }} columns={outstandingCols} dataSource={outstandingData?.items || []} rowKey="Party_ID" size="small" loading={outstandingLoading} pagination={{ pageSize: 20 }} />
          </Card>
        </>
      ),
    },
  ];

  return (
    <div className="page-wrapper">
      <div className="page-header">
        <Title level={4} style={{ margin: 0 }}><SwapOutlined style={{ color: '#fa8c16', marginRight: 8 }} />Approval Reports</Title>
        <div ref={dateRangeRef}>
        <RangePicker value={dateRange} onChange={d => d && setDateRange(d)} format="DD-MMM-YYYY" />
        </div>
      </div>
      <div ref={tabsRef}>
      <Tabs activeKey={activeTab} onChange={setActiveTab} type="card" items={tabItems} />
      </div>

      <PageTour steps={tourSteps} />
    </div>
  );
}
