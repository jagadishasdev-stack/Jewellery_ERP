import React, { useState, useRef } from 'react';
import {
  Table, Card, Typography, DatePicker, Button, Space, Tag, Row, Col,
  Statistic, Descriptions, Modal, Divider, message, Tabs, Alert, Tooltip,
} from 'antd';
import { DownloadOutlined, PrinterOutlined, EyeOutlined, TrophyOutlined, ToolOutlined, InfoCircleOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { karigarApi, reportsApi } from '../../api/modules';
import { formatCurrency, formatWeight } from '../../utils/calculations';
import PageTour from '../../components/PageTour';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

const exportCSV = (data, filename) => {
  if (!data?.length) { message.warning('No data.'); return; }
  const headers = Object.keys(data[0]).join(',');
  const rows = data.map(r => Object.values(r).map(v => `"${v ?? ''}"`).join(','));
  const blob = new Blob([[headers, ...rows].join('\n')], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${filename}_${dayjs().format('YYYYMMDD')}.csv`;
  a.click();
};

export default function KarigarReportPage() {
  const [dateRange, setDateRange] = useState([dayjs().startOf('month'), dayjs()]);
  const [detailIssue, setDetailIssue] = useState(null);

  // ── Walkthrough tour refs ───────────────────────────────────────────────────
  const dateRangeRef = useRef(null);
  const summaryRef = useRef(null);
  const tableRef = useRef(null);
  const tourSteps = [
    { title: '1. Choose Period', description: 'Filter this register by issue date. Export CSV and Print are right next to the date picker.', target: () => dateRangeRef.current },
    { title: '2. Summary', description: 'Total issues, gold issued and returned, gold still pending with karigars (watch this closely!), and total wages paid for the period.', target: () => summaryRef.current },
    { title: '3. Issue / Return Register', description: 'Every gold issue to a karigar, its status (Issued/Partial/Completed/Overdue), and expected return date — overdue ones are flagged with ⚠️. Click the eye icon to see full detail including wastage allowed and wages breakdown.', target: () => tableRef.current },
  ];

  const { data: issues, isLoading } = useQuery({
    queryKey: ['karigar-issues-all'],
    queryFn: () => karigarApi.getIssues({ limit: 200 }).then(r => r.data.data.items),
  });

  const { data: issueDetail } = useQuery({
    queryKey: ['karigar-issue-detail', detailIssue?.Issue_ID],
    queryFn: () => karigarApi.getIssueById(detailIssue.Issue_ID).then(r => r.data.data),
    enabled: !!detailIssue,
  });

  // "Which karigar's items sell fastest, and whose work comes back for
  // repair most" — see reports.js's karigar-performance route for how
  // repair_rate is derived (real repair-order links, not a manual rating).
  const { data: performance, isLoading: perfLoading } = useQuery({
    queryKey: ['karigar-performance'],
    queryFn: () => reportsApi.karigarPerformance().then(r => r.data.data),
  });

  const filtered = (issues || []).filter(p => {
    const d = dayjs(p.Issue_Date);
    return d.isAfter(dateRange[0].subtract(1, 'day')) && d.isBefore(dateRange[1].add(1, 'day'));
  });

  const totalIssued  = filtered.reduce((s, r) => s + parseFloat(r.Gold_Weight_Issued || 0), 0);
  const totalReturned = filtered.reduce((s, r) => s + parseFloat(r.Returned_Weight || 0), 0);
  const totalPending = totalIssued - totalReturned;
  const totalWages   = filtered.reduce((s, r) => s + parseFloat(r.Final_Wages_Paid || 0), 0);

  const statusColor = { Issued: 'orange', Partial: 'blue', Completed: 'green', Overdue: 'red' };

  const columns = [
    { title: 'Issue #', dataIndex: 'Issue_Number', render: v => <Text code style={{ fontSize: 11 }}>{v}</Text> },
    { title: 'Date', dataIndex: 'Issue_Date', render: v => dayjs(v).format('DD-MMM-YYYY') },
    { title: 'Karigar', dataIndex: 'Karigar_Name', render: v => <Text strong>{v || '-'}</Text> },
    {
      title: 'Issued (g)',
      dataIndex: 'Gold_Weight_Issued',
      render: v => <Text style={{ color: '#fa8c16' }}>{formatWeight(v)}</Text>,
    },
    {
      title: 'Returned (g)',
      dataIndex: 'Returned_Weight',
      render: v => <Text style={{ color: '#52c41a' }}>{formatWeight(v)}</Text>,
    },
    {
      title: 'Pending (g)',
      render: (_, r) => {
        const pending = parseFloat(r.Gold_Weight_Issued||0) - parseFloat(r.Returned_Weight||0);
        return pending > 0
          ? <Tag color="red">{formatWeight(pending)}</Tag>
          : <Tag color="green">Cleared</Tag>;
      },
    },
    { title: 'Wastage (g)', dataIndex: 'Wastage_Used', render: v => formatWeight(v) },
    { title: 'Gold Rate', dataIndex: 'Gold_Rate_At_Issue', render: v => `₹${parseFloat(v||0).toLocaleString('en-IN')}/g` },
    { title: 'Wages Paid', dataIndex: 'Final_Wages_Paid', render: v => formatCurrency(v) },
    {
      title: 'Status',
      dataIndex: 'Status',
      render: v => <Tag color={statusColor[v] || 'default'}>{v}</Tag>,
    },
    { title: 'Expected Return', dataIndex: 'Expected_Return_Date',
      render: (v, r) => {
        if (!v) return '-';
        const overdue = r.Status === 'Issued' && dayjs(v).isBefore(dayjs());
        return <Text type={overdue ? 'danger' : undefined}>{dayjs(v).format('DD-MMM-YYYY')}{overdue ? ' ⚠️' : ''}</Text>;
      },
    },
    { title: '', width: 60, render: (_, r) => <Button size="small" icon={<EyeOutlined />} onClick={() => setDetailIssue(r)} /> },
  ];

  const perfColumns = [
    { title: 'Karigar', dataIndex: 'Vendor_Name', render: (v, r) => <Space><Text strong>{v}</Text><Text type="secondary" style={{ fontSize: 11 }}>{r.Vendor_Code}</Text></Space> },
    { title: 'Manufactured', dataIndex: 'pieces_manufactured', width: 110, render: v => <Tag color="blue">{v} pcs</Tag> },
    { title: 'Sold', dataIndex: 'pieces_sold', width: 90, render: v => <Tag color="green">{v} pcs</Tag> },
    { title: 'In Stock', dataIndex: 'pieces_in_stock', width: 90 },
    { title: 'Sell-Through', dataIndex: 'sell_through_rate', width: 120, render: v => <Tag color={v >= 70 ? 'green' : v >= 40 ? 'orange' : 'red'}>{v}%</Tag> },
    { title: 'Avg Days to Sell', dataIndex: 'avg_days_to_sell', width: 130, render: v => v == null ? '-' : `${v}d` },
    { title: 'Revenue', dataIndex: 'revenue', render: v => <Text strong style={{ color: '#B8860B' }}>{formatCurrency(v)}</Text> },
    {
      title: (
        <Space size={4}>
          Repair Rate
          <Tooltip title="Share of this karigar's SOLD pieces that later came back for repair, based on the invoice number entered at repair intake. A quality proxy derived from real records, not a manual score — lower is better. Blank means nothing sold yet.">
            <InfoCircleOutlined style={{ color: '#888' }} />
          </Tooltip>
        </Space>
      ),
      dataIndex: 'repair_rate', width: 140,
      render: v => v == null ? <Text type="secondary">-</Text> : <Tag color={v <= 5 ? 'green' : v <= 15 ? 'orange' : 'red'}>{v}% ({v <= 5 ? 'Good' : v <= 15 ? 'Watch' : 'Review'})</Tag>,
    },
  ];

  return (
    <div className="page-wrapper">
      <div className="page-header">
        <Title level={4} style={{ margin: 0 }}>Karigar Reports</Title>
      </div>

      <Tabs
        defaultActiveKey="register"
        items={[
          {
            key: 'register',
            label: <span><ToolOutlined /> Issue / Return Register</span>,
            children: (
              <>
                <div ref={dateRangeRef} style={{ marginBottom: 16 }}>
                <Space>
                  <RangePicker value={dateRange} onChange={d => d && setDateRange(d)} format="DD-MMM-YYYY" />
                  <Button icon={<DownloadOutlined />} onClick={() => exportCSV(filtered.map(r => ({
                    'Issue Number': r.Issue_Number,
                    'Date': dayjs(r.Issue_Date).format('DD-MMM-YYYY'),
                    'Karigar': r.Karigar_Name,
                    'Issued (g)': r.Gold_Weight_Issued,
                    'Returned (g)': r.Returned_Weight,
                    'Wastage (g)': r.Wastage_Used,
                    'Status': r.Status,
                    'Wages Paid': r.Final_Wages_Paid,
                  })), 'karigar_register')}>Export CSV</Button>
                  <Button icon={<PrinterOutlined />} onClick={() => window.print()}>Print</Button>
                </Space>
                </div>

                {/* Summary cards */}
                <Row ref={summaryRef} gutter={[12, 12]} style={{ marginBottom: 16 }}>
                  {[
                    { title: 'Total Issues', value: filtered.length, color: '#B8860B' },
                    { title: 'Gold Issued (g)', value: `${totalIssued.toFixed(3)}g`, color: '#fa8c16' },
                    { title: 'Gold Returned (g)', value: `${totalReturned.toFixed(3)}g`, color: '#52c41a' },
                    { title: 'Pending with Karigar', value: `${totalPending.toFixed(3)}g`, color: totalPending > 0 ? '#ff4d4f' : '#52c41a' },
                    { title: 'Total Wages Paid', value: totalWages, formatter: formatCurrency, color: '#1890ff' },
                  ].map((s, i) => (
                    <Col xs={12} md={6} lg={4} key={i}>
                      <Card bodyStyle={{ padding: '12px 14px' }}
                        style={{ borderRadius: 8, border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.07)', borderTop: `3px solid ${s.color}` }}>
                        <Statistic title={<Text style={{ fontSize: 11, color: '#888' }}>{s.title}</Text>}
                          value={s.value}
                          formatter={s.formatter ? v => s.formatter(v) : undefined}
                          valueStyle={{ color: s.color, fontSize: 16, fontWeight: 700 }} />
                      </Card>
                    </Col>
                  ))}
                </Row>

                <div ref={tableRef}>
                <Card style={{ borderRadius: 8, border: 'none' }} bodyStyle={{ padding: 0 }}>
                  <Table
                    columns={columns}
                    dataSource={filtered}
                    loading={isLoading}
                    rowKey="Issue_ID"
                    size="small"
                    pagination={{ pageSize: 20 }}
                    scroll={{ x: 1100 }}
                    rowClassName={r => r.Status === 'Issued' && r.Expected_Return_Date && dayjs(r.Expected_Return_Date).isBefore(dayjs()) ? 'ant-table-row-warning' : ''}
                  />
                </Card>
                </div>
              </>
            ),
          },
          {
            key: 'performance',
            label: <span><TrophyOutlined /> Performance & Quality</span>,
            children: (
              <>
                <Alert
                  type="info" showIcon style={{ marginBottom: 12, borderRadius: 8 }}
                  message="Sell-through and repair rate, from real records"
                  description="Manufactured/sold/in-stock counts come from actual stock and sales data. Repair Rate is derived from the original-sale link entered on each repair job card (Repair Orders → New Repair → Original Sale Invoice Number) — not a manual score, so it's only as complete as staff entering that invoice number at intake."
                />
                <Card style={{ borderRadius: 8, border: 'none' }} bodyStyle={{ padding: 0 }}
                  extra={<Button size="small" icon={<DownloadOutlined />} onClick={() => exportCSV(performance || [], 'karigar_performance')}>CSV</Button>}
                  title="Per-Karigar Performance">
                  <Table
                    scroll={{ x: 'max-content' }}
                    columns={perfColumns}
                    dataSource={performance || []}
                    loading={perfLoading}
                    rowKey="Karigar_ID"
                    size="small"
                    pagination={{ pageSize: 20 }}
                  />
                </Card>
              </>
            ),
          },
        ]}
      />

      {/* Issue Detail Modal */}
      <Modal
        title={`Issue Detail — ${detailIssue?.Issue_Number}`}
        open={!!detailIssue}
        onCancel={() => setDetailIssue(null)}
        footer={null}
        width={600}
      >
        {issueDetail && (
          <div>
            <Descriptions size="small" bordered column={2}>
              <Descriptions.Item label="Karigar">{issueDetail.Karigar_Name || '-'}</Descriptions.Item>
              <Descriptions.Item label="Issue Date">{dayjs(issueDetail.Issue_Date).format('DD-MMM-YYYY')}</Descriptions.Item>
              <Descriptions.Item label="Gold Issued">
                <Text style={{ color: '#fa8c16' }}>{formatWeight(issueDetail.Gold_Weight_Issued)}</Text>
              </Descriptions.Item>
              <Descriptions.Item label="Purity">{issueDetail.Purity_Code || '-'}</Descriptions.Item>
              <Descriptions.Item label="Gold Rate">₹{parseFloat(issueDetail.Gold_Rate_At_Issue||0).toLocaleString('en-IN')}/g</Descriptions.Item>
              <Descriptions.Item label="Total Value">{formatCurrency(issueDetail.Total_Value_Issued)}</Descriptions.Item>
              <Descriptions.Item label="Wastage Allowed">{issueDetail.Wastage_Allowed_Percent}%</Descriptions.Item>
              <Descriptions.Item label="Wages Rate">₹{issueDetail.Karigar_Wages_Rate}/g</Descriptions.Item>
              <Descriptions.Item label="Estimated Wages">{formatCurrency(issueDetail.Estimated_Wages)}</Descriptions.Item>
              <Descriptions.Item label="Status">
                <Tag color={statusColor[issueDetail.Status] || 'default'}>{issueDetail.Status}</Tag>
              </Descriptions.Item>
            </Descriptions>

            {issueDetail.Status !== 'Issued' && (
              <>
                <Divider>Return Details</Divider>
                <Descriptions size="small" bordered column={2}>
                  <Descriptions.Item label="Return Date">{issueDetail.Return_Date ? dayjs(issueDetail.Return_Date).format('DD-MMM-YYYY') : '-'}</Descriptions.Item>
                  <Descriptions.Item label="Returned Weight">
                    <Text style={{ color: '#52c41a' }}>{formatWeight(issueDetail.Returned_Weight)}</Text>
                  </Descriptions.Item>
                  <Descriptions.Item label="Wastage Used">{formatWeight(issueDetail.Wastage_Used)}</Descriptions.Item>
                  <Descriptions.Item label="Missing Weight">
                    {parseFloat(issueDetail.Missing_Weight) > 0
                      ? <Text type="danger">{formatWeight(issueDetail.Missing_Weight)}</Text>
                      : <Text type="success">None</Text>}
                  </Descriptions.Item>
                  <Descriptions.Item label="Wages Paid">{formatCurrency(issueDetail.Final_Wages_Paid)}</Descriptions.Item>
                </Descriptions>
              </>
            )}

            {issueDetail.Remarks && (
              <>
                <Divider>Remarks</Divider>
                <Text type="secondary">{issueDetail.Remarks}</Text>
              </>
            )}
          </div>
        )}
      </Modal>

      <PageTour steps={tourSteps} />
    </div>
  );
}
