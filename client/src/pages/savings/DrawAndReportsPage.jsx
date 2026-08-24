import React, { useState, useRef } from 'react';
import {
  Row, Col, Card, Table, Button, Modal, Form, Select, Input,
  InputNumber, DatePicker, Typography, Tag, Space, message,
  Tabs, Statistic, Alert, Divider,
} from 'antd';
import { TrophyOutlined, BarChartOutlined, DownloadOutlined, WarningOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { savingsApi } from '../../api/modules';
import { formatCurrency } from '../../utils/calculations';
import PageTour from '../../components/PageTour';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { Option } = Select;
const { TabPane } = Tabs;
const { RangePicker } = DatePicker;

export default function DrawAndReportsPage() {
  const [drawModal, setDrawModal] = useState(false);
  const [dateRange, setDateRange] = useState([dayjs().startOf('month'), dayjs()]);
  const [drawForm] = Form.useForm();
  const qc = useQueryClient();

  const fromDate = dateRange[0].format('YYYY-MM-DD');
  const toDate = dateRange[1].format('YYYY-MM-DD');

  const { data: drawHistory } = useQuery({
    queryKey: ['draw-history'],
    queryFn: () => savingsApi.getDrawHistory().then(r => r.data.data),
  });

  const { data: collectionReport } = useQuery({
    queryKey: ['savings-collection-report', fromDate, toDate],
    queryFn: () => savingsApi.reportCollection({ fromDate, toDate }).then(r => r.data.data),
  });

  const { data: overdueMembers } = useQuery({
    queryKey: ['overdue-members'],
    queryFn: () => savingsApi.reportOverdue().then(r => r.data.data),
  });

  const { data: maturityDue } = useQuery({
    queryKey: ['maturity-due'],
    queryFn: () => savingsApi.reportMaturityDue({ month: dayjs().format('YYYY-MM') }).then(r => r.data.data),
  });

  const { data: schemes } = useQuery({ queryKey: ['savings-schemes'], queryFn: () => savingsApi.getSchemes().then(r => r.data.data) });
  const { data: groups } = useQuery({ queryKey: ['savings-groups'], queryFn: () => savingsApi.getGroups().then(r => r.data.data) });

  const drawMutation = useMutation({
    mutationFn: (d) => savingsApi.conductDraw(d),
    onSuccess: (res) => {
      const { draw, winner } = res.data.data;
      message.success(`🎉 Winner: ${winner.Member_Name} (${winner.Member_Number}) — ${winner.Mobile}`);
      qc.invalidateQueries(['draw-history']);
      setDrawModal(false);
      drawForm.resetFields();
    },
    onError: (err) => message.error(err.response?.data?.message || 'Draw failed.'),
  });

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

  const s = collectionReport?.summary || {};

  // ── Walkthrough tour refs ───────────────────────────────────────────────────
  const dateRangeRef = useRef(null);
  const drawBtnRef = useRef(null);
  const tabsRef = useRef(null);
  const tourSteps = [
    { title: '1. Pick a Date Range', description: 'Reports below (collection totals, by mode, by source, daily breakdown) update for whatever range you choose here.', target: () => dateRangeRef.current },
    { title: '2. Conduct a Lucky Draw', description: 'Click here to run a draw — optionally narrow it to one scheme or group, name the draw, set the prize, and the system randomly picks an eligible Active member (with at least 1 installment paid) as the winner.', target: () => drawBtnRef.current },
    { title: '3. Explore the Reports', description: 'Switch tabs to see Collection totals (by payment mode, by counter vs app, and day-by-day), the list of Overdue members who need a reminder, Members due for Maturity this month, and the full Draw History of past winners. Use the CSV buttons to export any table.', target: () => tabsRef.current },
  ];

  return (
    <div className="page-wrapper">
      <div className="page-header">
        <Title level={4} style={{ margin: 0 }}>Reports & Draw Management</Title>
        <Space>
          <div ref={dateRangeRef}>
          <RangePicker value={dateRange} onChange={d => d && setDateRange(d)} format="DD-MMM-YYYY" />
          </div>
          <Button ref={drawBtnRef} type="primary" icon={<TrophyOutlined />}
            style={{ background: '#722ed1', borderColor: '#722ed1' }}
            onClick={() => setDrawModal(true)}>
            Conduct Draw
          </Button>
        </Space>
      </div>

      <div ref={tabsRef}>
      <Tabs defaultActiveKey="collection" type="card">

        {/* ─── Collection Report ───────────────────────────────── */}
        <TabPane tab={<span><BarChartOutlined /> Collection</span>} key="collection">
          <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
            {[
              { label: 'Total Bills', value: parseInt(s.total_count || 0), color: '#B8860B' },
              { label: 'Total Amount', value: parseFloat(s.total_amount || 0), formatter: formatCurrency, color: '#52c41a' },
              { label: 'Penalty Collected', value: parseFloat(s.total_penalty || 0), formatter: formatCurrency, color: '#fa8c16' },
            ].map((c, i) => (
              <Col xs={8} key={i}>
                <Card bodyStyle={{ padding: '14px 16px' }}
                  style={{ borderRadius: 8, border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.07)', borderTop: `3px solid ${c.color}` }}>
                  <Statistic title={<Text style={{ fontSize: 11, color: '#888' }}>{c.label}</Text>}
                    value={c.value} formatter={c.formatter ? v => c.formatter(v) : undefined}
                    valueStyle={{ color: c.color, fontSize: 18, fontWeight: 700 }} />
                </Card>
              </Col>
            ))}
          </Row>

          <Row gutter={[16, 16]}>
            <Col xs={24} md={12}>
              <Card title="By Payment Mode" style={{ borderRadius: 8 }}
                extra={<Button size="small" icon={<DownloadOutlined />} onClick={() => exportCSV(collectionReport?.byMode, 'collection_by_mode')}>CSV</Button>}
                bodyStyle={{ padding: 0 }}>
                <Table
            scroll={{ x: "max-content" }} size="small" dataSource={collectionReport?.byMode || []} rowKey="Payment_Mode" pagination={false}
                  columns={[
                    { title: 'Mode', dataIndex: 'Payment_Mode', render: v => <Tag color="blue">{v}</Tag> },
                    { title: 'Count', dataIndex: 'count' },
                    { title: 'Amount', dataIndex: 'total', render: v => formatCurrency(v) },
                  ]} />
              </Card>
            </Col>
            <Col xs={24} md={12}>
              <Card title="By Source (Counter vs App)" style={{ borderRadius: 8 }} bodyStyle={{ padding: 0 }}>
                <Table
            scroll={{ x: "max-content" }} size="small" dataSource={collectionReport?.bySource || []} rowKey="Collection_Source" pagination={false}
                  columns={[
                    { title: 'Source', dataIndex: 'Collection_Source', render: v => <Tag color={v === 'App' ? 'green' : 'blue'}>{v}</Tag> },
                    { title: 'Count', dataIndex: 'count' },
                    { title: 'Amount', dataIndex: 'total', render: v => formatCurrency(v) },
                  ]} />
              </Card>
            </Col>
          </Row>

          <Card title="Daily Breakdown" style={{ borderRadius: 8, marginTop: 16 }}
            extra={<Button size="small" icon={<DownloadOutlined />} onClick={() => exportCSV(collectionReport?.daily, 'daily_collection')}>CSV</Button>}
            bodyStyle={{ padding: 0 }}>
            <Table
            scroll={{ x: "max-content" }} size="small" dataSource={collectionReport?.daily || []} rowKey="date" pagination={{ pageSize: 15 }}
              columns={[
                { title: 'Date', dataIndex: 'date', render: v => dayjs(v).format('DD-MMM-YYYY (ddd)') },
                { title: 'Collections', dataIndex: 'count' },
                { title: 'Amount', dataIndex: 'total', render: v => <Text strong style={{ color: '#B8860B' }}>{formatCurrency(v)}</Text> },
              ]} />
          </Card>
        </TabPane>

        {/* ─── Overdue Members ─────────────────────────────────── */}
        <TabPane tab={<span><WarningOutlined /> Overdue ({overdueMembers?.length || 0})</span>} key="overdue">
          {(overdueMembers?.length || 0) > 0 && (
            <Alert message={`${overdueMembers.length} members have pending installments`} type="warning" showIcon style={{ marginBottom: 12 }} />
          )}
          <Card style={{ borderRadius: 8 }} bodyStyle={{ padding: 0 }}>
            <Table
            scroll={{ x: "max-content" }} size="small" dataSource={overdueMembers || []} rowKey="Member_ID" pagination={{ pageSize: 20 }}
              columns={[
                { title: 'Member No', dataIndex: 'Member_Number', render: v => <Text code style={{ fontSize: 11 }}>{v}</Text> },
                { title: 'Name', dataIndex: 'Member_Name' },
                { title: 'Mobile', dataIndex: 'Mobile' },
                { title: 'Group', dataIndex: 'Group_Name' },
                { title: 'Paid', render: (_, r) => <Tag color="orange">{r.Installments_Paid}/{r.Total_Installments}</Tag> },
                { title: 'Balance', render: (_, r) => formatCurrency((r.Total_Installments - r.Installments_Paid) * r.Installment_Amount) },
              ]} />
          </Card>
        </TabPane>

        {/* ─── Maturity Due ─────────────────────────────────────── */}
        <TabPane tab={`Maturity Due (${maturityDue?.total || 0})`} key="maturity">
          {maturityDue?.total > 0 && (
            <Alert
              message={`${maturityDue.total} schemes mature this month — Total redemption value: ${formatCurrency(maturityDue.total_value)}`}
              type="success" showIcon style={{ marginBottom: 12 }}
            />
          )}
          <Card style={{ borderRadius: 8 }} bodyStyle={{ padding: 0 }}>
            <Table
            scroll={{ x: "max-content" }} size="small" dataSource={maturityDue?.members || []} rowKey="Member_ID" pagination={false}
              columns={[
                { title: 'Member No', dataIndex: 'Member_Number', render: v => <Text code style={{ fontSize: 11 }}>{v}</Text> },
                { title: 'Name', dataIndex: 'Member_Name' },
                { title: 'Mobile', dataIndex: 'Mobile' },
                { title: 'Scheme', dataIndex: 'Scheme_Name' },
                { title: 'Maturity Value', dataIndex: 'Maturity_Value', render: v => <Text strong style={{ color: '#B8860B' }}>{formatCurrency(v)}</Text> },
                { title: 'Maturity Date', dataIndex: 'Maturity_Date', render: v => dayjs(v).format('DD-MMM-YYYY') },
              ]} />
          </Card>
        </TabPane>

        {/* ─── Lucky Draw History ───────────────────────────────── */}
        <TabPane tab={<span><TrophyOutlined /> Draw History</span>} key="draws">
          <Card style={{ borderRadius: 8 }} bodyStyle={{ padding: 0 }}>
            <Table
            scroll={{ x: "max-content" }} size="small" dataSource={drawHistory || []} rowKey="Draw_ID" pagination={{ pageSize: 20 }}
              columns={[
                { title: 'Draw', dataIndex: 'Draw_Name', render: v => <Text strong>{v}</Text> },
                { title: 'Type', dataIndex: 'Draw_Type', render: v => <Tag color="purple">{v}</Tag> },
                { title: 'Date', dataIndex: 'Draw_Date', render: v => dayjs(v).format('DD-MMM-YYYY') },
                { title: 'Winner', dataIndex: 'Member_Name', render: (v, r) => <Space><TrophyOutlined style={{ color: '#FFD700' }} /><Text strong>{v}</Text><Text style={{ fontSize: 11 }}>{r.Member_Number}</Text></Space> },
                { title: 'Prize', render: (_, r) => `${r.Prize_Type} — ${r.Prize_Description || ''}` },
                { title: 'Prize Value', dataIndex: 'Prize_Value', render: v => v ? formatCurrency(v) : '-' },
                { title: 'Eligible', dataIndex: 'Eligible_Members', render: v => `${v} members` },
              ]} />
          </Card>
        </TabPane>
      </Tabs>
      </div>

      {/* Draw Modal */}
      <Modal title="🎲 Conduct Lucky Draw" open={drawModal} onCancel={() => { setDrawModal(false); drawForm.resetFields(); }} footer={null} width={500}>
        <Alert message="System randomly selects an eligible Active member with at least 1 paid installment." type="info" showIcon style={{ marginBottom: 16 }} />
        <Form form={drawForm} layout="vertical" onFinish={v => drawMutation.mutate({ ...v, Draw_Date: v.Draw_Date?.format('YYYY-MM-DD') })}>
          <Row gutter={16}>
            <Col xs={12}><Form.Item name="Scheme_ID" label="Scheme (optional)"><Select allowClear>{(schemes || []).map(s => <Option key={s.Scheme_ID} value={s.Scheme_ID}>{s.Scheme_Name}</Option>)}</Select></Form.Item></Col>
            <Col xs={12}><Form.Item name="Group_ID" label="Group (optional)"><Select allowClear>{(groups || []).map(g => <Option key={g.Group_ID} value={g.Group_ID}>{g.Group_Name}</Option>)}</Select></Form.Item></Col>
          </Row>
          <Row gutter={16}>
            <Col xs={12}><Form.Item name="Draw_Name" label="Draw Name" rules={[{ required: true }]}><Input placeholder="Monthly Draw — June 2026" /></Form.Item></Col>
            <Col xs={12}><Form.Item name="Draw_Type" label="Type" initialValue="Monthly"><Select><Option value="Monthly">Monthly</Option><Option value="Quarterly">Quarterly</Option><Option value="Festival">Festival</Option><Option value="Special">Special</Option></Select></Form.Item></Col>
          </Row>
          <Row gutter={16}>
            <Col xs={8}><Form.Item name="Prize_Type" label="Prize Type" rules={[{ required: true }]}><Select><Option value="Cash">Cash</Option><Option value="Gold">Gold</Option><Option value="Product">Product</Option><Option value="Discount">Discount</Option></Select></Form.Item></Col>
            <Col xs={8}><Form.Item name="Prize_Value" label="Prize Value (₹)"><InputNumber style={{ width: '100%' }} min={0} /></Form.Item></Col>
            <Col xs={8}><Form.Item name="Draw_Date" label="Draw Date" initialValue={dayjs()}><DatePicker style={{ width: '100%' }} /></Form.Item></Col>
          </Row>
          <Form.Item name="Prize_Description" label="Prize Description"><Input placeholder="Gold coin 1g / ₹5000 gift voucher" /></Form.Item>
          <Button type="primary" htmlType="submit" block size="large" loading={drawMutation.isPending}
            style={{ background: '#722ed1', borderColor: '#722ed1', height: 46, fontWeight: 700 }}>
            🎲 Conduct Draw & Announce Winner
          </Button>
        </Form>
      </Modal>

      <PageTour steps={tourSteps} />
    </div>
  );
}
