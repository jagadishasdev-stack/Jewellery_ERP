import React, { useState, useRef } from 'react';
import {
  Row, Col, Card, Statistic, Typography, Table, Button, Space,
  Input, Form, InputNumber, Modal, Tag, Alert, message,
} from 'antd';
import { LockOutlined, CheckCircleOutlined, HistoryOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { dayCloseApi } from '../../api/modules';
import { formatCurrency } from '../../utils/calculations';
import PageTour from '../../components/PageTour';
import dayjs from 'dayjs';

const { Title, Text } = Typography;

export default function DayClosePage() {
  const [closeModal, setCloseModal] = useState(false);
  const [form] = Form.useForm();
  const qc = useQueryClient();

  // ── Walkthrough tour refs ───────────────────────────────────────────────────
  const summaryRef = useRef(null);
  const closeBtnRef = useRef(null);
  const historyRef = useRef(null);
  const tourSteps = [
    { title: '1. Today\'s Summary', description: 'Live totals for today — total sales, cash/UPI/card split, system cash-in-hand, and the difference once you\'ve verified physical cash. These post automatically from every POS sale.', target: () => summaryRef.current },
    { title: '2. Close Day', description: 'At end of day, count the physical cash drawer and click here. Enter the actual counted cash — the system compares it to what POS recorded and shows any shortage/excess before locking the day.', target: () => closeBtnRef.current },
    { title: '3. History', description: 'Every past day-close is logged here for audit — sales split, verified cash, and any difference.', target: () => historyRef.current },
  ];

  const { data: today, isLoading } = useQuery({
    queryKey: ['day-close-today'],
    queryFn: () => dayCloseApi.getToday().then(r => r.data.data),
    refetchInterval: 30000,
  });

  const { data: history } = useQuery({
    queryKey: ['day-close-history'],
    queryFn: () => dayCloseApi.getHistory().then(r => r.data.data),
  });

  const closeMutation = useMutation({
    mutationFn: (d) => dayCloseApi.close(d),
    onSuccess: () => {
      message.success('Day closed successfully!');
      qc.invalidateQueries(['day-close-today']);
      qc.invalidateQueries(['day-close-history']);
      setCloseModal(false);
      form.resetFields();
    },
    onError: (err) => message.error(err.response?.data?.message || 'Day close failed.'),
  });

  const isClosed = today?.Status === 'Closed';
  const difference = parseFloat(today?.Difference || 0);

  const historyColumns = [
    { title: 'Date', dataIndex: 'Close_Date', render: v => dayjs(v).format('DD-MMM-YYYY (ddd)') },
    { title: 'Total Sales', dataIndex: 'Total_Sales', render: v => formatCurrency(v) },
    { title: 'Cash Sales', dataIndex: 'Cash_Sales', render: v => formatCurrency(v) },
    { title: 'UPI Sales', dataIndex: 'UPI_Sales', render: v => formatCurrency(v) },
    { title: 'Cash in Hand', dataIndex: 'Cash_In_Hand', render: v => formatCurrency(v) },
    { title: 'Verified', dataIndex: 'Verified_Cash', render: v => formatCurrency(v) },
    {
      title: 'Difference',
      dataIndex: 'Difference',
      render: v => {
        const n = parseFloat(v || 0);
        return <Text type={n < 0 ? 'danger' : n > 0 ? 'warning' : 'success'}>{formatCurrency(Math.abs(n))} {n < 0 ? '↓' : n > 0 ? '↑' : '✓'}</Text>;
      },
    },
    {
      title: 'Status',
      dataIndex: 'Status',
      render: v => <Tag color={v === 'Closed' ? 'green' : v === 'Verified' ? 'blue' : 'orange'}>{v}</Tag>,
    },
  ];

  return (
    <div className="page-wrapper">
      <div className="page-header">
        <Title level={4} style={{ margin: 0 }}>
          <Space><LockOutlined style={{ color: '#B8860B' }} />Day Close — {dayjs().format('DD-MMM-YYYY (dddd)')}</Space>
        </Title>
        {!isClosed && (
          <Button ref={closeBtnRef} type="primary" size="large" icon={<LockOutlined />}
            style={{ background: '#ff4d4f', borderColor: '#ff4d4f', fontWeight: 700 }}
            onClick={() => setCloseModal(true)}>
            Close Day
          </Button>
        )}
      </div>

      {isClosed && (
        <Alert message={`Day closed at ${dayjs(today?.Closed_At).format('HH:mm')} — ${today?.Remarks || 'No remarks'}`}
          type="success" showIcon style={{ marginBottom: 16 }} />
      )}

      {/* Today Summary */}
      {today && (
        <div ref={summaryRef}>
        <Row gutter={[12, 12]} style={{ marginBottom: 20 }}>
          {[
            { label: "Today's Total Sales", value: today.Total_Sales, color: '#B8860B' },
            { label: 'Cash Sales', value: today.Cash_Sales, color: '#52c41a' },
            { label: 'UPI Sales', value: today.UPI_Sales, color: '#1890ff' },
            { label: 'Card Sales', value: today.Card_Sales, color: '#722ed1' },
            { label: 'Cash in Hand', value: today.Cash_In_Hand, color: '#fa8c16' },
            { label: 'Difference', value: Math.abs(today.Difference || 0), color: difference === 0 ? '#52c41a' : '#ff4d4f' },
          ].map((s, i) => (
            <Col xs={12} md={8} lg={4} key={i}>
              <Card bodyStyle={{ padding: '14px 16px' }}
                style={{ borderRadius: 8, border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.07)', borderTop: `3px solid ${s.color}` }}>
                <Statistic
                  title={<Text style={{ fontSize: 11, color: '#888' }}>{s.label}</Text>}
                  value={s.value}
                  formatter={v => formatCurrency(v)}
                  valueStyle={{ color: s.color, fontSize: 16, fontWeight: 700 }}
                />
              </Card>
            </Col>
          ))}
        </Row>
        </div>
      )}

      {/* History */}
      <div ref={historyRef}>
      <Card title={<Space><HistoryOutlined />Day Close History (Last 30 Days)</Space>}
        style={{ borderRadius: 8 }} bodyStyle={{ padding: 0 }}>
        <Table
            scroll={{ x: "max-content" }} columns={historyColumns} dataSource={history || []} rowKey="Close_ID"
          size="small" pagination={{ pageSize: 15 }} />
      </Card>
      </div>

      {/* Close Day Modal */}
      <Modal title="Close Today's Day" open={closeModal}
        onCancel={() => setCloseModal(false)} footer={null} width={480}>
        <Alert
          message="Please count physical cash and enter the verified amount below."
          type="info" showIcon style={{ marginBottom: 16 }}
        />
        <Form form={form} layout="vertical" onFinish={v => closeMutation.mutate(v)}>
          <Row gutter={16}>
            <Col xs={12}>
              <Form.Item name="cash_in_hand" label="System Cash in Hand" initialValue={parseFloat(today?.Cash_In_Hand || 0)}>
                <InputNumber style={{ width: '100%' }} readOnly formatter={v => `₹ ${v}`} />
              </Form.Item>
            </Col>
            <Col xs={12}>
              <Form.Item name="verified_cash" label="Actual Cash Counted" rules={[{ required: true }]}>
                <InputNumber style={{ width: '100%' }} min={0} size="large" formatter={v => `₹ ${v}`} onChange={v => {
                  const diff = parseFloat(v || 0) - parseFloat(today?.Cash_In_Hand || 0);
                  form.setFieldValue('difference_display', diff);
                }} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="cash_expenses" label="Cash Expenses Today (if any)" initialValue={0}>
            <InputNumber style={{ width: '100%' }} min={0} formatter={v => `₹ ${v}`} />
          </Form.Item>
          <Form.Item name="remarks" label="Remarks / Notes">
            <Input.TextArea rows={2} placeholder="Day close remarks..." />
          </Form.Item>
          <Button type="primary" htmlType="submit" block size="large"
            loading={closeMutation.isPending}
            style={{ background: '#ff4d4f', borderColor: '#ff4d4f', fontWeight: 700 }}>
            <LockOutlined /> Confirm Day Close
          </Button>
        </Form>
      </Modal>

      <PageTour steps={tourSteps} />
    </div>
  );
}
