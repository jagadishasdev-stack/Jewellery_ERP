import React, { useState, useRef } from 'react';
import {
  Table, Button, Card, Typography, Tag, Space, Modal, Form,
  Input, InputNumber, Select, DatePicker, Row, Col, message,
} from 'antd';
import { PlusOutlined, EditOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { savingsApi } from '../../api/modules';
import { formatCurrency } from '../../utils/calculations';
import PageTour from '../../components/PageTour';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { Option } = Select;

export default function PDCPage() {
  const [addModal, setAddModal] = useState(false);
  const [statusModal, setStatusModal] = useState(null);
  const [filterStatus, setFilterStatus] = useState('Pending');
  const [form] = Form.useForm();
  const [statusForm] = Form.useForm();
  const qc = useQueryClient();

  const { data: pdcList, isLoading } = useQuery({
    queryKey: ['pdc', filterStatus],
    queryFn: () => savingsApi.getPDC({ status: filterStatus || undefined }).then(r => r.data.data),
  });

  const { data: memberSearch } = useQuery({
    queryKey: ['pdc-members'],
    queryFn: () => savingsApi.getMembers({ status: 'Active', limit: 200 }).then(r => r.data.data.items),
  });

  const createMutation = useMutation({
    mutationFn: (d) => savingsApi.createPDC(d),
    onSuccess: () => { message.success('PDC recorded!'); qc.invalidateQueries(['pdc']); setAddModal(false); form.resetFields(); },
    onError: (err) => message.error(err.response?.data?.message || 'Failed.'),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, d }) => savingsApi.updatePDCStatus(id, d),
    onSuccess: () => { message.success('PDC status updated.'); qc.invalidateQueries(['pdc']); setStatusModal(null); statusForm.resetFields(); },
  });

  const statusColor = { Pending: 'orange', Deposited: 'blue', Cleared: 'green', Bounced: 'red', Cancelled: 'default', 'Re-Presented': 'purple' };

  // ── Walkthrough tour refs ───────────────────────────────────────────────────
  const filterRef = useRef(null);
  const addBtnRef = useRef(null);
  const tableRef = useRef(null);
  const tourSteps = [
    { title: '1. Filter by Status', description: 'Switch between Pending, Deposited, Cleared, Bounced, Cancelled and Re-Presented cheques.', target: () => filterRef.current },
    { title: '2. Add a PDC', description: 'When a member pays their installment with a post-dated cheque, record it here — pick the member, enter the bank, cheque number, amount and cheque date.', target: () => addBtnRef.current },
    { title: '3. Track & Update Cheques', description: 'This list shows every cheque on file. When a cheque\'s date arrives, click Update on a Pending row to mark it Deposited, then later Cleared or Bounced (add a bounce charge if it bounces) — this keeps the member\'s installment record accurate.', target: () => tableRef.current },
  ];

  const columns = [
    { title: 'Cheque No', dataIndex: 'Cheque_Number', render: v => <Text code>{v}</Text> },
    { title: 'Member', render: (_, r) => <div><Text strong>{r.Member_Name}</Text><br /><Text style={{ fontSize: 10 }}>{r.Member_Number}</Text></div> },
    { title: 'Mobile', dataIndex: 'Mobile', width: 110 },
    { title: 'Bank', dataIndex: 'Bank_Name' },
    { title: 'Amount', dataIndex: 'Amount', render: v => <Text strong style={{ color: '#B8860B' }}>{formatCurrency(v)}</Text> },
    { title: 'Cheque Date', dataIndex: 'Cheque_Date', render: v => dayjs(v).format('DD-MMM-YYYY') },
    { title: 'Deposit Date', dataIndex: 'Deposit_Date', render: v => v ? dayjs(v).format('DD-MMM-YYYY') : '-' },
    { title: 'Bounce Charge', dataIndex: 'Bounce_Charge', render: v => v > 0 ? <Text type="danger">₹{v}</Text> : '-' },
    { title: 'Status', dataIndex: 'Status', render: v => <Tag color={statusColor[v] || 'default'}>{v}</Tag> },
    {
      title: 'Action',
      render: (_, r) => r.Status === 'Pending' && (
        <Button size="small" icon={<EditOutlined />} onClick={() => { setStatusModal(r); statusForm.resetFields(); }}>
          Update
        </Button>
      ),
    },
  ];

  return (
    <div className="page-wrapper">
      <div className="page-header">
        <Title level={4} style={{ margin: 0 }}>Post-Dated Cheques (PDC)</Title>
        <Space>
          <div ref={filterRef}>
          <Select value={filterStatus} onChange={setFilterStatus} style={{ width: 140 }} allowClear placeholder="All Status">
            {['Pending','Deposited','Cleared','Bounced','Cancelled','Re-Presented'].map(s => (
              <Option key={s} value={s}>{s}</Option>
            ))}
          </Select>
          </div>
          <Button ref={addBtnRef} type="primary" icon={<PlusOutlined />}
            style={{ background: '#B8860B', borderColor: '#B8860B' }}
            onClick={() => setAddModal(true)}>
            Add PDC
          </Button>
        </Space>
      </div>

      <div ref={tableRef}>
      <Card style={{ borderRadius: 8, border: 'none' }} bodyStyle={{ padding: 0 }}>
        <Table columns={columns} dataSource={pdcList || []} loading={isLoading}
          rowKey="PDC_ID" size="small" pagination={{ pageSize: 30 }} scroll={{ x: 900 }} />
      </Card>
      </div>

      {/* Add PDC Modal */}
      <Modal title="Record Post-Dated Cheque" open={addModal}
        onCancel={() => { setAddModal(false); form.resetFields(); }} footer={null} width={500}>
        <Form form={form} layout="vertical" onFinish={v => createMutation.mutate({ ...v, Cheque_Date: v.Cheque_Date?.format('YYYY-MM-DD') })}>
          <Form.Item name="Member_ID" label="Member" rules={[{ required: true }]}>
            <Select showSearch placeholder="Search member" optionFilterProp="children">
              {(memberSearch || []).map(m => (
                <Option key={m.Member_ID} value={m.Member_ID}>{m.Member_Name} — {m.Member_Number} ({m.Mobile})</Option>
              ))}
            </Select>
          </Form.Item>
          <Row gutter={16}>
            <Col xs={12}><Form.Item name="Bank_Name" label="Bank Name" rules={[{ required: true }]}><Input /></Form.Item></Col>
            <Col xs={12}><Form.Item name="Cheque_Number" label="Cheque Number" rules={[{ required: true }]}><Input /></Form.Item></Col>
          </Row>
          <Row gutter={16}>
            <Col xs={12}><Form.Item name="Amount" label="Amount (₹)" rules={[{ required: true }]}><InputNumber style={{ width: '100%' }} min={1} formatter={v => `₹ ${v}`} /></Form.Item></Col>
            <Col xs={12}><Form.Item name="Cheque_Date" label="Cheque Date" rules={[{ required: true }]}><DatePicker style={{ width: '100%' }} /></Form.Item></Col>
          </Row>
          <Form.Item name="Remarks" label="Remarks"><Input.TextArea rows={2} /></Form.Item>
          <Button type="primary" htmlType="submit" block loading={createMutation.isPending}
            style={{ background: '#B8860B', borderColor: '#B8860B' }}>Save PDC</Button>
        </Form>
      </Modal>

      {/* Update Status Modal */}
      <Modal title={`Update PDC — ${statusModal?.Cheque_Number}`}
        open={!!statusModal} onCancel={() => setStatusModal(null)} footer={null} width={400}>
        <Form form={statusForm} layout="vertical"
          onFinish={v => statusMutation.mutate({ id: statusModal.PDC_ID, d: v })}>
          <Form.Item name="status" label="New Status" rules={[{ required: true }]}>
            <Select>
              <Option value="Deposited">Deposited</Option>
              <Option value="Cleared">Cleared</Option>
              <Option value="Bounced">Bounced</Option>
              <Option value="Re-Presented">Re-Presented</Option>
              <Option value="Cancelled">Cancelled</Option>
            </Select>
          </Form.Item>
          <Form.Item name="bounce_charge" label="Bounce Charge (₹)" initialValue={0}>
            <InputNumber style={{ width: '100%' }} min={0} />
          </Form.Item>
          <Form.Item name="remarks" label="Remarks"><Input.TextArea rows={2} /></Form.Item>
          <Button type="primary" htmlType="submit" block loading={statusMutation.isPending}
            style={{ background: '#B8860B', borderColor: '#B8860B' }}>Update Status</Button>
        </Form>
      </Modal>

      <PageTour steps={tourSteps} />
    </div>
  );
}
