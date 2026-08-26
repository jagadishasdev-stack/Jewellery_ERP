import React, { useState, useRef } from 'react';
import {
  Table, Button, Tag, Space, Typography, Card, Modal, Form, Input, Select,
  InputNumber, message, Tabs, Row, Col, Popconfirm, Empty, Switch,
} from 'antd';
import { PlusOutlined, UserOutlined, EditOutlined, StopOutlined, CheckCircleOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { karigarApi, purchaseApi, reportsApi } from '../../api/modules';
import { formatCurrency } from '../../utils/calculations';
import PageTour from '../../components/PageTour';
import { useActionShortcuts } from '../../hooks/useActionShortcuts';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { Option } = Select;

const VENDOR_FORM_FIELDS = (
  <>
    <Form.Item name="Vendor_Name" label="Name" rules={[{ required: true }]}>
      <Input />
    </Form.Item>
    <Form.Item name="Vendor_Type" label="Type" rules={[{ required: true }]}>
      <Select>
        <Option value="Karigar">Karigar (Goldsmith)</Option>
        <Option value="Supplier">Supplier</Option>
        <Option value="Both">Both</Option>
      </Select>
    </Form.Item>
    <Row gutter={12}>
      <Col span={12}>
        <Form.Item name="Mobile_1" label="Mobile" rules={[{ required: true }]}>
          <Input />
        </Form.Item>
      </Col>
      <Col span={12}>
        <Form.Item name="Mobile_2" label="Mobile (alt)">
          <Input />
        </Form.Item>
      </Col>
    </Row>
    <Row gutter={12}>
      <Col span={12}>
        <Form.Item name="Contact_Person" label="Contact Person">
          <Input />
        </Form.Item>
      </Col>
      <Col span={12}>
        <Form.Item name="Email" label="Email">
          <Input />
        </Form.Item>
      </Col>
    </Row>
    <Form.Item name="Address_Line1" label="Address">
      <Input />
    </Form.Item>
    <Row gutter={12}>
      <Col span={8}>
        <Form.Item name="City" label="City">
          <Input />
        </Form.Item>
      </Col>
      <Col span={8}>
        <Form.Item name="State" label="State">
          <Input />
        </Form.Item>
      </Col>
      <Col span={8}>
        <Form.Item name="Pincode" label="Pincode">
          <Input />
        </Form.Item>
      </Col>
    </Row>
    <Row gutter={12}>
      <Col span={12}>
        <Form.Item name="GST_No" label="GSTIN">
          <Input />
        </Form.Item>
      </Col>
      <Col span={12}>
        <Form.Item name="PAN_No" label="PAN">
          <Input />
        </Form.Item>
      </Col>
    </Row>
    <Row gutter={12}>
      <Col span={12}>
        <Form.Item name="Credit_Limit" label="Credit Limit (₹)">
          <InputNumber style={{ width: '100%' }} min={0} />
        </Form.Item>
      </Col>
      <Col span={12}>
        <Form.Item name="Credit_Days" label="Credit Days">
          <InputNumber style={{ width: '100%' }} min={0} />
        </Form.Item>
      </Col>
    </Row>
    <Form.Item name="Karigar_Skill" label="Karigar Skill">
      <Select allowClear>
        <Option value="Gold">Gold</Option>
        <Option value="Silver">Silver</Option>
        <Option value="Diamond">Diamond</Option>
      </Select>
    </Form.Item>
    <Row gutter={12}>
      <Col span={12}>
        <Form.Item name="Karigar_Wastage_Allowed_Percent" label="Wastage Allowed (%)">
          <InputNumber style={{ width: '100%' }} min={0} max={20} step={0.5} />
        </Form.Item>
      </Col>
      <Col span={12}>
        <Form.Item name="Karigar_Daily_Capacity" label="Daily Capacity (g)">
          <InputNumber style={{ width: '100%' }} min={0} />
        </Form.Item>
      </Col>
    </Row>
    <Row gutter={12}>
      <Col span={12}>
        <Form.Item name="Bank_Account_No" label="Bank Account No">
          <Input />
        </Form.Item>
      </Col>
      <Col span={12}>
        <Form.Item name="IFSC_Code" label="IFSC Code">
          <Input />
        </Form.Item>
      </Col>
    </Row>
    <Form.Item name="Notes" label="Notes">
      <Input.TextArea rows={2} />
    </Form.Item>
  </>
);

function VendorsTab() {
  const [modalOpen, setModalOpen] = useState(false);
  const [editingVendor, setEditingVendor] = useState(null); // vendor row being edited, or null for Add
  const [showInactive, setShowInactive] = useState(false);
  const [form] = Form.useForm();
  const qc = useQueryClient();

  const addBtnRef = useRef(null);
  const tableRef = useRef(null);
  const tourSteps = [
    { title: '1. Karigars & Vendors List', description: 'Every goldsmith and supplier you work with is listed here, along with their current balance — how much gold/money is outstanding with them.', target: () => tableRef.current },
    { title: '2. Add Karigar/Vendor', description: 'Click here to register a new goldsmith or supplier — set their skill, wastage allowance, GSTIN and bank details.', target: () => addBtnRef.current },
    { title: '3. Edit, Deactivate & Outstanding', description: 'Use the pencil icon to correct details any time, and the stop icon to retire a vendor once their balance is settled. The Karigar Outstanding and Supplier Outstanding tabs above show who you owe money to.' },
  ];

  const { data: vendors, isLoading } = useQuery({
    queryKey: ['vendors', 'all', showInactive],
    queryFn: () => karigarApi.getVendors({ includeInactive: showInactive }).then((r) => r.data.data),
  });

  const createMutation = useMutation({
    mutationFn: (data) => karigarApi.createVendor(data),
    onSuccess: () => {
      message.success('Vendor/Karigar added!');
      qc.invalidateQueries({ queryKey: ['vendors'] });
      closeModal();
    },
    onError: (err) => message.error(err.response?.data?.message || 'Failed to add.'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...data }) => karigarApi.updateVendor(id, data),
    onSuccess: () => {
      message.success('Vendor updated.');
      qc.invalidateQueries({ queryKey: ['vendors'] });
      closeModal();
    },
    onError: (err) => message.error(err.response?.data?.message || 'Failed to update.'),
  });

  const deactivateMutation = useMutation({
    mutationFn: (id) => karigarApi.deactivateVendor(id),
    onSuccess: () => { message.success('Vendor deactivated.'); qc.invalidateQueries({ queryKey: ['vendors'] }); },
    onError: (err) => message.error(err.response?.data?.message || 'Failed to deactivate.'),
  });

  const reactivateMutation = useMutation({
    mutationFn: (id) => karigarApi.reactivateVendor(id),
    onSuccess: () => { message.success('Vendor reactivated.'); qc.invalidateQueries({ queryKey: ['vendors'] }); },
  });

  const openAdd = () => { setEditingVendor(null); form.resetFields(); setModalOpen(true); };
  const openEdit = (vendor) => { setEditingVendor(vendor); form.setFieldsValue(vendor); setModalOpen(true); };
  const closeModal = () => { setModalOpen(false); setEditingVendor(null); form.resetFields(); };

  useActionShortcuts({
    onNew: openAdd,
    onSave: () => modalOpen && form.submit(),
    onCancel: () => modalOpen && closeModal(),
  });

  const columns = [
    { title: 'Code', dataIndex: 'Vendor_Code', width: 120 },
    {
      title: 'Name',
      dataIndex: 'Vendor_Name',
      render: (v, r) => (
        <Space>
          <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#B8860B20', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <UserOutlined style={{ color: '#B8860B' }} />
          </div>
          <div>
            <Text strong>{v}</Text>
            <br />
            <Text type="secondary" style={{ fontSize: 11 }}>{r.Mobile_1}</Text>
          </div>
        </Space>
      ),
    },
    {
      title: 'Type',
      dataIndex: 'Vendor_Type',
      render: (v) => <Tag color={v === 'Karigar' ? 'orange' : v === 'Supplier' ? 'blue' : 'purple'}>{v}</Tag>,
    },
    { title: 'GSTIN', dataIndex: 'GST_No', render: (v) => v || '-' },
    { title: 'Skill', dataIndex: 'Karigar_Skill', render: (v) => v || '-' },
    { title: 'Balance', dataIndex: 'Current_Balance', render: (v) => formatCurrency(v) },
    {
      title: 'Status',
      dataIndex: 'Is_Active',
      render: (v) => <Tag color={v ? 'green' : 'red'}>{v ? 'Active' : 'Inactive'}</Tag>,
    },
    {
      title: 'Actions',
      render: (_, r) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} />
          {r.Is_Active ? (
            <Popconfirm title="Deactivate this vendor?" description="Requires a zero balance and no open karigar issues." onConfirm={() => deactivateMutation.mutate(r.Vendor_ID)}>
              <Button size="small" danger icon={<StopOutlined />} />
            </Popconfirm>
          ) : (
            <Button size="small" icon={<CheckCircleOutlined />} onClick={() => reactivateMutation.mutate(r.Vendor_ID)} />
          )}
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div className="page-header" style={{ marginBottom: 12 }}>
        <Space>
          <Text>Show inactive</Text>
          <Switch checked={showInactive} onChange={setShowInactive} />
        </Space>
        <Button ref={addBtnRef} type="primary" icon={<PlusOutlined />}
          style={{ background: '#B8860B', borderColor: '#B8860B' }}
          onClick={openAdd}>
          Add Karigar/Vendor
        </Button>
      </div>

      <div ref={tableRef}>
        <Card style={{ borderRadius: 8, border: 'none' }} bodyStyle={{ padding: 0 }}>
          <Table
            scroll={{ x: 'max-content' }}
            columns={columns}
            dataSource={vendors || []}
            loading={isLoading}
            rowKey="Vendor_ID"
            size="small"
            pagination={{ pageSize: 20 }}
          />
        </Card>
      </div>

      <Modal title={editingVendor ? `Edit ${editingVendor.Vendor_Name}` : 'Add Karigar / Vendor'}
        open={modalOpen} onCancel={closeModal} footer={null} destroyOnClose width={640}>
        <Form form={form} layout="vertical"
          onFinish={(v) => editingVendor ? updateMutation.mutate({ id: editingVendor.Vendor_ID, ...v }) : createMutation.mutate(v)}>
          {VENDOR_FORM_FIELDS}
          <Button type="primary" htmlType="submit" block loading={createMutation.isPending || updateMutation.isPending}
            style={{ background: '#B8860B', borderColor: '#B8860B' }}>
            {editingVendor ? 'Save Changes' : 'Save'}
          </Button>
        </Form>
      </Modal>

      <PageTour steps={tourSteps} />
    </div>
  );
}

function KarigarOutstandingTab() {
  const { data, isLoading } = useQuery({
    queryKey: ['karigar-outstanding'],
    queryFn: () => karigarApi.getOutstanding().then((r) => r.data.data || []),
  });

  const columns = [
    { title: 'Karigar', dataIndex: 'Vendor_Name', render: (v, r) => <div><Text strong>{v}</Text><br /><Text type="secondary" style={{ fontSize: 11 }}>{r.Vendor_Code}</Text></div> },
    { title: 'Mobile', dataIndex: 'Mobile_1' },
    { title: 'Gold With Karigar (open issues)', dataIndex: 'gold_with_karigar_value', render: (v) => formatCurrency(v) },
    { title: 'Open Issues', dataIndex: 'open_issues', align: 'center' },
    { title: 'Wages Payable (unsettled)', dataIndex: 'wages_payable', render: (v) => <Text strong style={{ color: parseFloat(v) > 0 ? '#ff4d4f' : undefined }}>{formatCurrency(v)}</Text> },
    { title: 'Unsettled Issues', dataIndex: 'unsettled_completed_issues', align: 'center' },
  ];

  return (
    <Card style={{ borderRadius: 8, border: 'none' }} bodyStyle={{ padding: 0 }}>
      <Table
        scroll={{ x: 'max-content' }}
        columns={columns}
        dataSource={(data || []).filter((r) => parseFloat(r.gold_with_karigar_value) > 0 || parseFloat(r.wages_payable) > 0)}
        loading={isLoading}
        rowKey="Vendor_ID"
        size="small"
        pagination={{ pageSize: 20 }}
        locale={{ emptyText: <Empty description="Nothing outstanding with any karigar." /> }}
      />
    </Card>
  );
}

function SupplierOutstandingTab() {
  const [payModal, setPayModal] = useState(null);
  const [payForm] = Form.useForm();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['supplier-outstanding'],
    queryFn: () => reportsApi.supplierOutstanding().then((r) => r.data.data || []),
  });

  const paySupplierMutation = useMutation({
    mutationFn: ({ id, ...body }) => purchaseApi.paySupplier(id, body),
    onSuccess: () => {
      message.success('Payment recorded.');
      qc.invalidateQueries({ queryKey: ['supplier-outstanding'] });
      qc.invalidateQueries({ queryKey: ['supplier-open-invoices'] });
      setPayModal(null);
      payForm.resetFields();
    },
    onError: (err) => message.error(err.response?.data?.message || 'Failed to record payment.'),
  });

  const OpenInvoicesRow = ({ record }) => {
    const { data: invoices, isLoading: invLoading } = useQuery({
      queryKey: ['supplier-open-invoices', record.Supplier_ID],
      queryFn: () => purchaseApi.getAll({ supplierId: record.Supplier_ID, limit: 100 })
        .then((r) => (r.data.data?.items || []).filter((p) => ['Partial', 'Pending'].includes(p.Payment_Status))),
    });
    const cols = [
      { title: 'Purchase No', dataIndex: 'Purchase_Number' },
      { title: 'Date', dataIndex: 'Purchase_Date', render: (v) => dayjs(v).format('DD-MMM-YYYY') },
      { title: 'Total', dataIndex: 'Total_Amount', render: (v) => formatCurrency(v) },
      { title: 'Paid', dataIndex: 'Amount_Paid', render: (v) => formatCurrency(v) },
      { title: 'Balance', dataIndex: 'Balance_Amount', render: (v) => <Text strong style={{ color: '#ff4d4f' }}>{formatCurrency(v)}</Text> },
      {
        title: '', render: (_, inv) => (
          <Button size="small" type="primary" style={{ background: '#52c41a', borderColor: '#52c41a' }}
            onClick={() => setPayModal(inv)}>Pay</Button>
        ),
      },
    ];
    return <Table columns={cols} dataSource={invoices || []} loading={invLoading} rowKey="Purchase_ID" size="small" pagination={false} />;
  };

  const columns = [
    { title: 'Supplier', dataIndex: 'Vendor_Name', render: (v, r) => <div><Text strong>{v}</Text><br /><Text type="secondary" style={{ fontSize: 11 }}>{r.Vendor_Code}</Text></div> },
    { title: 'Mobile', dataIndex: 'Mobile_1' },
    { title: 'Total Purchases', dataIndex: 'total_purchases', render: (v) => formatCurrency(v) },
    { title: 'Paid', dataIndex: 'total_paid', render: (v) => formatCurrency(v) },
    { title: 'Outstanding', dataIndex: 'outstanding', render: (v) => <Text strong style={{ color: '#ff4d4f' }}>{formatCurrency(v)}</Text> },
    { title: 'Last Purchase', dataIndex: 'last_purchase_date', render: (v) => v ? dayjs(v).format('DD-MMM-YYYY') : '-' },
  ];

  return (
    <>
      <Card style={{ borderRadius: 8, border: 'none' }} bodyStyle={{ padding: 0 }}>
        <Table
          scroll={{ x: 'max-content' }}
          columns={columns}
          dataSource={data || []}
          loading={isLoading}
          rowKey="Supplier_ID"
          size="small"
          pagination={{ pageSize: 20 }}
          expandable={{ expandedRowRender: (record) => <OpenInvoicesRow record={record} /> }}
          locale={{ emptyText: <Empty description="No outstanding balance with any supplier." /> }}
        />
      </Card>

      <Modal title={`💰 Pay Supplier — ${payModal?.Purchase_Number}`}
        open={!!payModal} onCancel={() => { setPayModal(null); payForm.resetFields(); }} footer={null} destroyOnClose>
        {payModal && (
          <Form form={payForm} layout="vertical"
            initialValues={{ Amount: parseFloat(payModal.Balance_Amount || 0), Payment_Mode: 'Cash' }}
            onFinish={(v) => paySupplierMutation.mutate({ id: payModal.Purchase_ID, ...v })}>
            <Text type="secondary">Outstanding balance: <Text strong style={{ color: '#ff4d4f' }}>{formatCurrency(payModal.Balance_Amount)}</Text></Text>
            <Form.Item name="Amount" label="Amount Paid (₹)" style={{ marginTop: 12 }}
              rules={[{ required: true, message: 'Amount is required.' }, {
                validator: (_, v) => v > parseFloat(payModal.Balance_Amount) + 0.01
                  ? Promise.reject('Cannot exceed the outstanding balance.') : Promise.resolve(),
              }]}>
              <InputNumber style={{ width: '100%' }} min={0.01} max={parseFloat(payModal.Balance_Amount)} precision={2} />
            </Form.Item>
            <Form.Item name="Payment_Mode" label="Payment Mode" rules={[{ required: true }]}>
              <Select options={['Cash', 'UPI', 'Debit Card', 'Credit Card', 'NEFT', 'RTGS', 'IMPS', 'Bank Transfer', 'Cheque'].map(m => ({ value: m, label: m }))} />
            </Form.Item>
            <Form.Item name="Payment_Reference" label="Reference (optional)">
              <Input placeholder="UTR / transaction ID / cheque number" />
            </Form.Item>
            <Button type="primary" htmlType="submit" block loading={paySupplierMutation.isPending}
              style={{ background: '#52c41a', borderColor: '#52c41a', fontWeight: 700 }}>
              Record Payment
            </Button>
          </Form>
        )}
      </Modal>
    </>
  );
}

export default function KarigarListPage() {
  return (
    <div className="page-wrapper">
      <div className="page-header">
        <Title level={4} style={{ margin: 0 }}>Karigars, Suppliers & Dealers</Title>
      </div>

      <Tabs
        defaultActiveKey="vendors"
        items={[
          { key: 'vendors', label: 'Vendors', children: <VendorsTab /> },
          { key: 'karigar-outstanding', label: 'Karigar Outstanding', children: <KarigarOutstandingTab /> },
          { key: 'supplier-outstanding', label: 'Supplier Outstanding', children: <SupplierOutstandingTab /> },
        ]}
      />
    </div>
  );
}
