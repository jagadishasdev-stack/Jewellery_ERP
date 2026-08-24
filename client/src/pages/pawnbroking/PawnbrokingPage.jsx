import React, { useState, useRef } from 'react';
import {
  Table, Button, Card, Typography, Tag, Space, Modal, Form,
  Input, InputNumber, Select, DatePicker, Row, Col, message, Descriptions, Divider,
} from 'antd';
import { PlusOutlined, BankOutlined, DollarOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { pawnbrokingApi } from '../../api/modules';
import { formatCurrency } from '../../utils/calculations';
import CustomerSearchModal from '../pos/CustomerSearchModal';
import PageTour from '../../components/PageTour';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { Option } = Select;

const STATUS_COLOR = { Active: 'blue', Redeemed: 'green', Overdue: 'orange', Auctioned: 'red' };

export default function PawnbrokingPage() {
  const [createModal, setCreateModal] = useState(false);
  const [detailModal, setDetailModal] = useState(null); // Loan_ID
  const [customerModal, setCustomerModal] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [filterStatus, setFilterStatus] = useState('Active');
  const [form] = Form.useForm();
  const [txnForm] = Form.useForm();
  const qc = useQueryClient();

  const newBtnRef = useRef(null);
  const filterRef = useRef(null);
  const tableRef = useRef(null);
  const tourSteps = [
    { title: '1. New Loan', description: 'Click here to pledge a customer\'s gold — search/select the customer, enter loan terms, and list every item being pledged.', target: () => newBtnRef.current },
    { title: '2. Filter by Status', description: 'Switch between Active, Redeemed, Overdue and Auctioned loans.', target: () => filterRef.current },
    { title: '3. Loan List', description: 'Every loan shows its outstanding principal and due date at a glance. Click Manage on any row to record a payment, view pledged items, or redeem/auction it.', target: () => tableRef.current },
    { title: '4. Recording Payments', description: 'Inside Manage: pick Interest Receipt, Part Payment, or Full Redemption, enter the amount, and the outstanding balance updates automatically — interest owed so far is calculated for you.' },
  ];

  const { data: loans, isLoading } = useQuery({
    queryKey: ['pawn-loans', filterStatus],
    queryFn: () => pawnbrokingApi.getLoans({ status: filterStatus || undefined }).then((r) => r.data.data.items),
  });

  const { data: loanDetail } = useQuery({
    queryKey: ['pawn-loan', detailModal],
    queryFn: () => pawnbrokingApi.getLoan(detailModal).then((r) => r.data.data),
    enabled: !!detailModal,
  });

  const createMutation = useMutation({
    mutationFn: (data) => pawnbrokingApi.createLoan(data),
    onSuccess: (res) => {
      message.success(`Loan ${res.data.data.Loan_Number} created!`);
      qc.invalidateQueries(['pawn-loans']);
      setCreateModal(false);
      form.resetFields();
      setSelectedCustomer(null);
    },
    onError: (err) => message.error(err.response?.data?.message || 'Failed to create loan.'),
  });

  const txnMutation = useMutation({
    mutationFn: ({ id, data }) => pawnbrokingApi.addTransaction(id, data),
    onSuccess: (res) => {
      message.success(res.data.message);
      qc.invalidateQueries(['pawn-loan', detailModal]);
      qc.invalidateQueries(['pawn-loans']);
      txnForm.resetFields();
    },
    onError: (err) => message.error(err.response?.data?.message || 'Failed to record transaction.'),
  });

  const columns = [
    { title: 'Loan No.', dataIndex: 'Loan_Number', render: (v) => <Text code style={{ fontSize: 11 }}>{v}</Text> },
    { title: 'Customer', dataIndex: 'Customer_Name', render: (v, r) => v || '-' },
    { title: 'Mobile', dataIndex: 'Mobile_1' },
    { title: 'Loan Date', dataIndex: 'Loan_Date', render: (v) => dayjs(v).format('DD-MMM-YYYY') },
    { title: 'Loan Amt', dataIndex: 'Loan_Amount', render: (v) => formatCurrency(v) },
    { title: 'Outstanding', dataIndex: 'Principal_Outstanding', render: (v) => formatCurrency(v) },
    { title: 'Rate %/mo', dataIndex: 'Interest_Rate_Pct' },
    { title: 'Due Date', dataIndex: 'Due_Date', render: (v) => v ? dayjs(v).format('DD-MMM-YYYY') : '-' },
    { title: 'Status', dataIndex: 'Status', render: (v) => <Tag color={STATUS_COLOR[v]}>{v}</Tag> },
    { title: 'Actions', render: (_, r) => <Button size="small" onClick={() => setDetailModal(r.Loan_ID)}>Manage</Button> },
  ];

  return (
    <div className="page-wrapper">
      <div className="page-header">
        <Title level={4} style={{ margin: 0 }}><Space><BankOutlined style={{ color: '#B8860B' }} />Pawnbroking / Gold Loans</Space></Title>
        <Space>
          <div ref={filterRef}>
            <Select value={filterStatus} onChange={setFilterStatus} style={{ width: 160 }} allowClear placeholder="Filter by status">
              {['Active', 'Redeemed', 'Overdue', 'Auctioned'].map((s) => <Option key={s} value={s}>{s}</Option>)}
            </Select>
          </div>
          <Button ref={newBtnRef} type="primary" icon={<PlusOutlined />} style={{ background: '#B8860B', borderColor: '#B8860B' }} onClick={() => setCreateModal(true)}>
            New Loan
          </Button>
        </Space>
      </div>

      <div ref={tableRef}>
      <Card style={{ borderRadius: 8, border: 'none' }} bodyStyle={{ padding: 0 }}>
        <Table scroll={{ x: 'max-content' }} columns={columns} dataSource={loans || []} loading={isLoading}
          rowKey="Loan_ID" size="small" pagination={{ pageSize: 20 }} />
      </Card>
      </div>
      <PageTour steps={tourSteps} />

      {/* Create Loan Modal */}
      <Modal title="New Pawn Loan" open={createModal} width={700}
        onCancel={() => { setCreateModal(false); form.resetFields(); setSelectedCustomer(null); }} footer={null}>
        <Form form={form} layout="vertical" onFinish={(v) => createMutation.mutate({ ...v, Customer_ID: selectedCustomer?.Customer_ID, items: v.items || [] })}>
          <Form.Item label="Customer" required>
            <Button block onClick={() => setCustomerModal(true)}>
              {selectedCustomer ? `${selectedCustomer.Customer_Name} — ${selectedCustomer.Mobile_1}` : 'Search & Select Customer'}
            </Button>
          </Form.Item>
          <Row gutter={16}>
            <Col xs={8}>
              <Form.Item name="Loan_Date" label="Loan Date" initialValue={dayjs()} rules={[{ required: true }]}>
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={8}>
              <Form.Item name="Loan_Amount" label="Loan Amount (₹)" rules={[{ required: true }]}>
                <InputNumber style={{ width: '100%' }} min={0} />
              </Form.Item>
            </Col>
            <Col xs={8}>
              <Form.Item name="Interest_Rate_Pct" label="Interest %/month" rules={[{ required: true }]} initialValue={2}>
                <InputNumber style={{ width: '100%' }} min={0} step={0.1} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col xs={8}>
              <Form.Item name="Tenure_Months" label="Tenure (months)" initialValue={12}>
                <InputNumber style={{ width: '100%' }} min={1} />
              </Form.Item>
            </Col>
            <Col xs={8}>
              <Form.Item name="Appraised_Value" label="Appraised Value (₹)">
                <InputNumber style={{ width: '100%' }} min={0} placeholder="Auto from items if left blank" />
              </Form.Item>
            </Col>
          </Row>

          <Divider orientation="left" plain>Pledged Items</Divider>
          <Form.List name="items" initialValue={[{}]}>
            {(fields, { add, remove }) => (
              <>
                {fields.map((field) => (
                  <Row gutter={8} key={field.key} align="middle">
                    <Col xs={7}>
                      <Form.Item name={[field.name, 'Item_Description']} rules={[{ required: true, message: 'Required' }]}>
                        <Input placeholder="e.g. Gold chain 22K" />
                      </Form.Item>
                    </Col>
                    <Col xs={4}>
                      <Form.Item name={[field.name, 'Gross_Weight']} rules={[{ required: true }]}>
                        <InputNumber style={{ width: '100%' }} placeholder="Gross g" step={0.001} />
                      </Form.Item>
                    </Col>
                    <Col xs={4}>
                      <Form.Item name={[field.name, 'Net_Weight']} rules={[{ required: true }]}>
                        <InputNumber style={{ width: '100%' }} placeholder="Net g" step={0.001} />
                      </Form.Item>
                    </Col>
                    <Col xs={4}>
                      <Form.Item name={[field.name, 'Purity_Code']}>
                        <Input placeholder="22K" />
                      </Form.Item>
                    </Col>
                    <Col xs={4}>
                      <Form.Item name={[field.name, 'Estimated_Value']}>
                        <InputNumber style={{ width: '100%' }} placeholder="Value ₹" />
                      </Form.Item>
                    </Col>
                    <Col xs={1}>
                      {fields.length > 1 && <Button danger size="small" onClick={() => remove(field.name)}>×</Button>}
                    </Col>
                  </Row>
                ))}
                <Button type="dashed" block onClick={() => add()} icon={<PlusOutlined />}>Add Item</Button>
              </>
            )}
          </Form.List>

          <Form.Item name="Remarks" label="Remarks" style={{ marginTop: 16 }}>
            <Input.TextArea rows={2} />
          </Form.Item>
          <Button type="primary" htmlType="submit" block loading={createMutation.isPending} style={{ background: '#B8860B', borderColor: '#B8860B', marginTop: 8 }}>
            Create Loan
          </Button>
        </Form>
      </Modal>

      <CustomerSearchModal open={customerModal} onClose={() => setCustomerModal(false)}
        onSelect={(c) => { setSelectedCustomer(c); setCustomerModal(false); }} />

      {/* Manage Loan Modal */}
      <Modal title={loanDetail ? `Loan ${loanDetail.Loan_Number}` : 'Loan'} open={!!detailModal} width={700}
        onCancel={() => setDetailModal(null)} footer={null}>
        {loanDetail && (
          <>
            <Descriptions size="small" column={2} bordered>
              <Descriptions.Item label="Customer">{loanDetail.Customer_Name || '-'}</Descriptions.Item>
              <Descriptions.Item label="Status"><Tag color={STATUS_COLOR[loanDetail.Status]}>{loanDetail.Status}</Tag></Descriptions.Item>
              <Descriptions.Item label="Loan Amount">{formatCurrency(loanDetail.Loan_Amount)}</Descriptions.Item>
              <Descriptions.Item label="Outstanding Principal">{formatCurrency(loanDetail.Principal_Outstanding)}</Descriptions.Item>
              <Descriptions.Item label="Interest Rate">{loanDetail.Interest_Rate_Pct}%/month</Descriptions.Item>
              <Descriptions.Item label="Interest Due Now">{formatCurrency(loanDetail.interestDue)}</Descriptions.Item>
              <Descriptions.Item label="Due Date">{loanDetail.Due_Date ? dayjs(loanDetail.Due_Date).format('DD-MMM-YYYY') : '-'}</Descriptions.Item>
              <Descriptions.Item label="Interest Paid Upto">{loanDetail.Interest_Paid_Upto_Date ? dayjs(loanDetail.Interest_Paid_Upto_Date).format('DD-MMM-YYYY') : '-'}</Descriptions.Item>
            </Descriptions>

            <Divider orientation="left" plain>Pledged Items</Divider>
            <Table size="small" pagination={false} rowKey="Item_ID" dataSource={loanDetail.items || []}
              columns={[
                { title: 'Description', dataIndex: 'Item_Description' },
                { title: 'Gross', dataIndex: 'Gross_Weight' },
                { title: 'Net', dataIndex: 'Net_Weight' },
                { title: 'Purity', dataIndex: 'Purity_Code' },
                { title: 'Status', dataIndex: 'Item_Status' },
              ]} />

            <Divider orientation="left" plain>Transaction History</Divider>
            <Table size="small" pagination={false} rowKey="Txn_ID" dataSource={loanDetail.transactions || []}
              columns={[
                { title: 'Date', dataIndex: 'Txn_Date', render: (v) => dayjs(v).format('DD-MMM-YYYY') },
                { title: 'Type', dataIndex: 'Txn_Type' },
                { title: 'Interest', dataIndex: 'Interest_Collected', render: (v) => formatCurrency(v) },
                { title: 'Principal', dataIndex: 'Principal_Collected', render: (v) => formatCurrency(v) },
                { title: 'Total', dataIndex: 'Total_Amount', render: (v) => formatCurrency(v) },
                { title: 'Balance After', dataIndex: 'Balance_Due', render: (v) => formatCurrency(v) },
              ]} />

            {loanDetail.Status === 'Active' && (
              <>
                <Divider orientation="left" plain>Record Transaction</Divider>
                <Form form={txnForm} layout="inline" onFinish={(v) => txnMutation.mutate({ id: detailModal, data: v })}>
                  <Form.Item name="Txn_Type" rules={[{ required: true }]} initialValue="Interest Receipt">
                    <Select style={{ width: 170 }}>
                      <Option value="Interest Receipt">Interest Receipt</Option>
                      <Option value="Part Payment">Part Payment</Option>
                      <Option value="Redemption">Full Redemption</Option>
                    </Select>
                  </Form.Item>
                  <Form.Item name="Total_Amount" rules={[{ required: true }]}>
                    <InputNumber placeholder="Amount ₹" min={0} />
                  </Form.Item>
                  <Form.Item name="Interest_Collected">
                    <InputNumber placeholder="Interest portion ₹" min={0} />
                  </Form.Item>
                  <Form.Item name="Payment_Mode" initialValue="Cash">
                    <Select style={{ width: 110 }}>
                      {['Cash', 'UPI', 'Cheque', 'Bank Transfer'].map((m) => <Option key={m} value={m}>{m}</Option>)}
                    </Select>
                  </Form.Item>
                  <Form.Item>
                    <Button type="primary" htmlType="submit" icon={<DollarOutlined />} loading={txnMutation.isPending}
                      style={{ background: '#B8860B', borderColor: '#B8860B' }}>
                      Record
                    </Button>
                  </Form.Item>
                </Form>
              </>
            )}
          </>
        )}
      </Modal>
    </div>
  );
}
