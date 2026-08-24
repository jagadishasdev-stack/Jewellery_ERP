import React, { useState, useRef } from 'react';
import {
  Table, Button, Card, Typography, Tag, Space, Modal, Form,
  Input, InputNumber, Select, DatePicker, Row, Col, message,
  Progress, Statistic, Tabs, Descriptions,
} from 'antd';
import { PlusOutlined, GoldOutlined, DollarOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { schemeApi, customersApi } from '../../api/modules';
import { formatCurrency } from '../../utils/calculations';
import PageTour from '../../components/PageTour';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { Option } = Select;
const { TabPane } = Tabs;

export default function SchemePage() {
  const [schemeModal, setSchemeModal] = useState(false);
  const [enrollModal, setEnrollModal] = useState(false);
  const [payModal, setPayModal] = useState(null);
  const [schemeForm] = Form.useForm();
  const [enrollForm] = Form.useForm();
  const [payForm] = Form.useForm();
  const qc = useQueryClient();

  const { data: schemes } = useQuery({ queryKey: ['schemes'], queryFn: () => schemeApi.getSchemes().then(r => r.data.data) });
  const { data: enrollments } = useQuery({ queryKey: ['enrollments'], queryFn: () => schemeApi.getEnrollments().then(r => r.data.data) });
  const { data: customers } = useQuery({ queryKey: ['customers-search'], queryFn: () => customersApi.getAll({ limit: 100 }).then(r => r.data.data.items) });

  const createSchemeMutation = useMutation({
    mutationFn: (data) => schemeApi.createScheme(data),
    onSuccess: () => { message.success('Scheme created!'); qc.invalidateQueries(['schemes']); setSchemeModal(false); schemeForm.resetFields(); },
    onError: (err) => message.error(err.response?.data?.message || 'Failed.'),
  });

  const enrollMutation = useMutation({
    mutationFn: (data) => schemeApi.enroll(data),
    onSuccess: (res) => {
      message.success(`Enrolled! ${res.data.data.installmentsCreated} installments scheduled.`);
      qc.invalidateQueries(['enrollments']);
      setEnrollModal(false);
      enrollForm.resetFields();
    },
    onError: (err) => message.error(err.response?.data?.message || 'Failed.'),
  });

  const payMutation = useMutation({
    mutationFn: (data) => schemeApi.payInstallment(data),
    onSuccess: () => { message.success('Installment recorded!'); qc.invalidateQueries(['enrollments']); setPayModal(null); payForm.resetFields(); },
    onError: (err) => message.error(err.response?.data?.message || 'Failed.'),
  });

  const schemeColumns = [
    { title: 'Code', dataIndex: 'Scheme_Code', render: v => <Text code>{v}</Text> },
    { title: 'Name', dataIndex: 'Scheme_Name', render: v => <Text strong>{v}</Text> },
    { title: 'Metal', dataIndex: 'Metal_Type', render: v => <Tag color="gold">{v}</Tag> },
    { title: 'Duration', dataIndex: 'Duration_Months', render: (v, r) => `${v}+${r.Free_Months} months` },
    { title: 'Monthly', dataIndex: 'Monthly_Amount', render: v => formatCurrency(v) },
    { title: 'Maturity', render: (_, r) => formatCurrency(r.Monthly_Amount * (r.Duration_Months + r.Free_Months)) },
    {
      title: '',
      render: (_, r) => (
        <Button size="small" type="primary" icon={<PlusOutlined />}
          style={{ background: '#B8860B', borderColor: '#B8860B' }}
          onClick={() => { enrollForm.setFieldsValue({ Scheme_ID: r.Scheme_ID }); setEnrollModal(true); }}>
          Enroll Customer
        </Button>
      ),
    },
  ];

  const enrollColumns = [
    { title: 'Enrollment #', dataIndex: 'Enrollment_Number', render: v => <Text code style={{ fontSize: 11 }}>{v}</Text> },
    { title: 'Customer', dataIndex: 'Customer_Name', render: (v, r) => <div><Text strong>{v}</Text><br /><Text style={{ fontSize: 11 }} type="secondary">{r.Mobile_1}</Text></div> },
    { title: 'Scheme', dataIndex: 'Scheme_Name' },
    { title: 'Progress', render: (_, r) => {
      const pct = Math.round((r.Installments_Paid / r.Total_Installments) * 100);
      return (
        <div style={{ minWidth: 120 }}>
          <Progress percent={pct} size="small" strokeColor="#B8860B" />
          <Text style={{ fontSize: 11 }}>{r.Installments_Paid}/{r.Total_Installments} paid</Text>
        </div>
      );
    }},
    { title: 'Paid', dataIndex: 'Total_Amount_Paid', render: v => <Text strong style={{ color: '#52c41a' }}>{formatCurrency(v)}</Text> },
    { title: 'Maturity', dataIndex: 'Maturity_Date', render: v => v ? dayjs(v).format('MMM YYYY') : '-' },
    { title: 'Status', dataIndex: 'Status', render: v => <Tag color={v === 'Active' ? 'blue' : v === 'Matured' ? 'gold' : 'green'}>{v}</Tag> },
    {
      title: 'Pay',
      render: (_, r) => r.Status === 'Active' && (
        <Button size="small" icon={<DollarOutlined />}
          onClick={() => { payForm.setFieldsValue({}); setPayModal(r); }}>
          Collect
        </Button>
      ),
    },
  ];

  // ── Walkthrough tour refs ───────────────────────────────────────────────────
  const createBtnRef = useRef(null);
  const tabsRef = useRef(null);
  const tourSteps = [
    { title: '1. Create a Scheme', description: 'Click here to define a simple gold/silver saving plan — a code, name, metal type, paying duration plus free bonus months, and the monthly amount.', target: () => createBtnRef.current },
    { title: '2. Enroll a Customer', description: 'On any scheme row, click Enroll Customer — pick the customer and a start date, and a full month-by-month installment schedule is generated for them automatically.' },
    { title: '3. Collect an Installment', description: 'On the Enrollments tab, click Collect against an Active enrollment — enter the installment number and payment mode to record that month\'s payment.' },
    { title: '4. Schemes & Enrollments Tabs', description: 'Switch between the list of scheme types you\'ve created and the list of customers enrolled in them, with each one\'s payment progress.', target: () => tabsRef.current },
  ];

  return (
    <div className="page-wrapper">
      <div className="page-header">
        <Title level={4} style={{ margin: 0 }}>
          <Space><GoldOutlined style={{ color: '#B8860B' }} />Gold Saving Schemes</Space>
        </Title>
        <Button ref={createBtnRef} type="primary" icon={<PlusOutlined />}
          style={{ background: '#B8860B', borderColor: '#B8860B' }}
          onClick={() => setSchemeModal(true)}>
          Create Scheme
        </Button>
      </div>

      <div ref={tabsRef}>
      <Tabs defaultActiveKey="schemes">
        <TabPane tab={`Schemes (${(schemes||[]).length})`} key="schemes">
          <Card style={{ borderRadius: 8, border: 'none' }} bodyStyle={{ padding: 0 }}>
            <Table
            scroll={{ x: "max-content" }} columns={schemeColumns} dataSource={schemes || []} rowKey="Scheme_ID" size="small" pagination={false} />
          </Card>
        </TabPane>
        <TabPane tab={`Enrollments (${(enrollments||[]).length})`} key="enrollments">
          <Card style={{ borderRadius: 8, border: 'none' }} bodyStyle={{ padding: 0 }}>
            <Table
            scroll={{ x: "max-content" }} columns={enrollColumns} dataSource={enrollments || []} rowKey="Enrollment_ID" size="small" pagination={{ pageSize: 20 }} />
          </Card>
        </TabPane>
      </Tabs>
      </div>

      {/* Create Scheme Modal */}
      <Modal title="Create Saving Scheme" open={schemeModal} onCancel={() => setSchemeModal(false)} footer={null}>
        <Form form={schemeForm} layout="vertical" onFinish={v => createSchemeMutation.mutate(v)}>
          <Form.Item name="Scheme_Code" label="Scheme Code" rules={[{ required: true }]}><Input placeholder="GS-11-1" /></Form.Item>
          <Form.Item name="Scheme_Name" label="Scheme Name" rules={[{ required: true }]}><Input placeholder="Gold Savings 11+1 Plan" /></Form.Item>
          <Row gutter={16}>
            <Col xs={8}><Form.Item name="Metal_Type" label="Metal" initialValue="Gold"><Select><Option value="Gold">Gold</Option><Option value="Silver">Silver</Option></Select></Form.Item></Col>
            <Col xs={8}><Form.Item name="Duration_Months" label="Duration (months)" rules={[{ required: true }]}><InputNumber style={{ width: '100%' }} min={1} /></Form.Item></Col>
            <Col xs={8}><Form.Item name="Free_Months" label="Free Months" initialValue={1}><InputNumber style={{ width: '100%' }} min={0} /></Form.Item></Col>
          </Row>
          <Form.Item name="Monthly_Amount" label="Monthly Amount (₹)" rules={[{ required: true }]}><InputNumber style={{ width: '100%' }} min={100} formatter={v => `₹ ${v}`} /></Form.Item>
          <Form.Item name="Terms" label="Terms & Conditions"><Input.TextArea rows={3} /></Form.Item>
          <Button type="primary" htmlType="submit" block loading={createSchemeMutation.isPending} style={{ background: '#B8860B', borderColor: '#B8860B' }}>Create Scheme</Button>
        </Form>
      </Modal>

      {/* Enroll Modal */}
      <Modal title="Enroll Customer in Scheme" open={enrollModal} onCancel={() => setEnrollModal(false)} footer={null}>
        <Form form={enrollForm} layout="vertical" onFinish={v => enrollMutation.mutate(v)}>
          <Form.Item name="Scheme_ID" label="Scheme" rules={[{ required: true }]}>
            <Select placeholder="Select scheme">
              {(schemes || []).map(s => <Option key={s.Scheme_ID} value={s.Scheme_ID}>{s.Scheme_Name} — {formatCurrency(s.Monthly_Amount)}/mo</Option>)}
            </Select>
          </Form.Item>
          <Form.Item name="Customer_ID" label="Customer" rules={[{ required: true }]}>
            <Select showSearch placeholder="Search customer" optionFilterProp="children">
              {(customers || []).map(c => <Option key={c.Customer_ID} value={c.Customer_ID}>{c.Customer_Name} ({c.Mobile_1})</Option>)}
            </Select>
          </Form.Item>
          <Form.Item name="Start_Date" label="Start Date" initialValue={dayjs()} rules={[{ required: true }]}>
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Button type="primary" htmlType="submit" block loading={enrollMutation.isPending} style={{ background: '#B8860B', borderColor: '#B8860B' }}>
            Enroll & Generate Installment Schedule
          </Button>
        </Form>
      </Modal>

      {/* Pay Installment Modal */}
      <Modal title={`Collect Installment — ${payModal?.Customer_Name}`} open={!!payModal} onCancel={() => setPayModal(null)} footer={null}>
        {payModal && (
          <div>
            <Descriptions size="small" style={{ marginBottom: 16 }}>
              <Descriptions.Item label="Scheme">{payModal.Scheme_Name}</Descriptions.Item>
              <Descriptions.Item label="Paid">{payModal.Installments_Paid}/{payModal.Total_Installments}</Descriptions.Item>
              <Descriptions.Item label="Monthly">{formatCurrency(payModal.Monthly_Amount)}</Descriptions.Item>
            </Descriptions>
            <Form form={payForm} layout="vertical" onFinish={v => payMutation.mutate(v)}>
              <Form.Item name="Enrollment_ID" hidden initialValue={payModal.Enrollment_ID}><Input /></Form.Item>
              <Form.Item name="Installment_ID" label="Installment No" rules={[{ required: true }]}>
                <InputNumber style={{ width: '100%' }} min={1} placeholder="Enter installment number" />
              </Form.Item>
              <Form.Item name="Payment_Mode" label="Payment Mode" initialValue="Cash" rules={[{ required: true }]}>
                <Select><Option value="Cash">Cash</Option><Option value="UPI">UPI</Option><Option value="Card">Card</Option></Select>
              </Form.Item>
              <Form.Item name="Receipt_Number" label="Receipt Number"><Input /></Form.Item>
              <Button type="primary" htmlType="submit" block loading={payMutation.isPending} style={{ background: '#52c41a', borderColor: '#52c41a', fontWeight: 700 }}>
                Record Payment — {formatCurrency(payModal.Monthly_Amount)}
              </Button>
            </Form>
          </div>
        )}
      </Modal>

      <PageTour steps={tourSteps} />
    </div>
  );
}
