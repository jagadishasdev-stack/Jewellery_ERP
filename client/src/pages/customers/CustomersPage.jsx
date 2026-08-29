import React, { useState, useRef } from 'react';
import {
  Table, Button, Input, Typography, Card, Tag, Space, Modal,
  Form, Select, DatePicker, message, Avatar, Drawer, Descriptions,
  List, Row, Col,
} from 'antd';
import { PlusOutlined, UserOutlined, HistoryOutlined, EditOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { customersApi } from '../../api/modules';
import { formatCurrency } from '../../utils/calculations';
import PageTour from '../../components/PageTour';
import { useActionShortcuts } from '../../hooks/useActionShortcuts';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { Option } = Select;

export default function CustomersPage() {
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  // Server route (PUT /customers/:id) and client API helper (customersApi.update)
  // already existed, unused — Add was the only wired path. This adds Edit,
  // reusing the exact same modal/form rather than a second form to maintain.
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [page, setPage] = useState(1);
  const [form] = Form.useForm();
  const qc = useQueryClient();

  // ── Walkthrough tour refs ───────────────────────────────────────────────────
  const searchRef = useRef(null);
  const addRef = useRef(null);
  const tableRef = useRef(null);
  const searchInputRef = useRef(null);
  const tourSteps = [
    { title: '1. Search Customers', description: 'Find any customer instantly by their name or mobile number.', target: () => searchRef.current },
    { title: '2. Add Customer', description: 'Register a new customer here — name, mobile, city and customer type (Retail/Wholesale) are used across billing, schemes and reports.', target: () => addRef.current },
    { title: '3. Customer List', description: 'Every customer shows here with their purchase count, total value and loyalty points. Click History on any row to see their full purchase history.', target: () => tableRef.current },
    { title: '4. Purchase History', description: 'Clicking History opens a side panel with every past invoice for that customer, along with their loyalty points and lifetime purchase value.' },
  ];

  const { data, isLoading } = useQuery({
    queryKey: ['customers', search, page],
    queryFn: () => customersApi.getAll({ search, page, limit: 50 }).then((r) => r.data.data),
    keepPreviousData: true,
  });

  const { data: history } = useQuery({
    queryKey: ['customer-history', selectedCustomer?.Customer_ID],
    queryFn: () => customersApi.getHistory(selectedCustomer.Customer_ID).then((r) => r.data.data),
    enabled: !!selectedCustomer,
  });

  const createMutation = useMutation({
    mutationFn: (data) => customersApi.create(data),
    onSuccess: () => {
      message.success('Customer added!');
      qc.invalidateQueries(['customers']);
      setModalOpen(false);
      form.resetFields();
    },
    onError: (err) => message.error(err.response?.data?.message || 'Failed to add customer.'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => customersApi.update(id, data),
    onSuccess: () => {
      message.success('Customer updated!');
      qc.invalidateQueries(['customers']);
      setModalOpen(false);
      setEditingCustomer(null);
      form.resetFields();
    },
    onError: (err) => message.error(err.response?.data?.message || 'Failed to update customer.'),
  });

  const openHistory = (customer) => {
    setSelectedCustomer(customer);
    setDrawerOpen(true);
  };

  const openEdit = (customer) => {
    setEditingCustomer(customer);
    form.setFieldsValue({
      ...customer,
      Date_Of_Birth: customer.Date_Of_Birth ? dayjs(customer.Date_Of_Birth) : null,
      Anniversary_Date: customer.Anniversary_Date ? dayjs(customer.Anniversary_Date) : null,
    });
    setModalOpen(true);
  };

  const openAdd = () => {
    setEditingCustomer(null);
    form.resetFields();
    setModalOpen(true);
  };

  const columns = [
    {
      title: 'Customer',
      render: (_, r) => (
        <Space>
          <Avatar style={{ background: '#B8860B' }} icon={<UserOutlined />} />
          <div>
            <Text strong>{r.Customer_Name}</Text>
            <br />
            <Text type="secondary" style={{ fontSize: 11 }}>{r.Customer_Code}</Text>
          </div>
        </Space>
      ),
    },
    { title: 'Mobile', dataIndex: 'Mobile_1' },
    { title: 'City', dataIndex: 'City', render: (v) => v || '-' },
    {
      title: 'Type',
      dataIndex: 'Is_Wholesale',
      render: (v) => <Tag color={v ? 'blue' : 'green'}>{v ? 'Wholesale' : 'Retail'}</Tag>,
    },
    {
      title: 'Category',
      dataIndex: 'Customer_Category',
      render: (v) => {
        const color = { VIP: 'gold', Platinum: 'purple', Gold: 'orange', Silver: 'default', Regular: 'default' }[v] || 'default';
        return <Tag color={color}>{v || 'Regular'}</Tag>;
      },
    },
    { title: 'Purchases', dataIndex: 'Total_Purchase_Count', render: (v) => <Tag>{v || 0} bills</Tag> },
    { title: 'Total Value', dataIndex: 'Total_Purchase_Value', render: (v) => formatCurrency(v) },
    { title: 'Loyalty Pts', dataIndex: 'Loyalty_Points', render: (v) => <Tag color="gold">{parseFloat(v || 0).toFixed(0)}</Tag> },
    {
      title: 'Actions',
      render: (_, r) => (
        <Space size={0}>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openEdit(r)}>
            Edit
          </Button>
          <Button type="link" size="small" icon={<HistoryOutlined />} onClick={() => openHistory(r)}>
            History
          </Button>
        </Space>
      ),
    },
  ];

  useActionShortcuts({
    onNew: () => { if (!modalOpen) setModalOpen(true); },
    onSearch: () => searchInputRef.current?.focus(),
    onCancel: () => {
      if (modalOpen) setModalOpen(false);
      else if (drawerOpen) setDrawerOpen(false);
    },
  });

  return (
    <div className="page-wrapper">
      {/* Page header */}
      <div className="page-header">
        <div>
          <div className="page-header-title">Customers</div>
          <div className="page-header-sub">{data?.total || 0} total customers</div>
        </div>
        <Button
          ref={addRef}
          type="primary"
          icon={<PlusOutlined />}
          style={{ background: '#B8860B', borderColor: '#B8860B', fontWeight: 600 }}
          onClick={openAdd}
        >
          Add Customer
        </Button>
      </div>

      {/* Search */}
      <div ref={searchRef}>
      <Card className="erp-card" style={{ marginBottom: 12 }} bodyStyle={{ padding: '12px 16px' }}>
        <Input.Search
          ref={searchInputRef}
          placeholder="Search by name or mobile number..."
          style={{ maxWidth: 400, width: '100%' }}
          allowClear
          size="large"
          onSearch={(v) => { setSearch(v); setPage(1); }}
          onChange={(e) => !e.target.value && setSearch('')}
        />
      </Card>
      </div>

      {/* Table */}
      <div ref={tableRef}>
      <Card className="erp-card" bodyStyle={{ padding: 0 }}>
        <div className="table-responsive">
          <Table
            className="erp-table"
            columns={columns}
            dataSource={data?.items || []}
            loading={isLoading}
            rowKey="Customer_ID"
            scroll={{ x: 700 }}
            pagination={{
              total:     data?.total,
              pageSize:  50,
              current:   page,
              onChange:  setPage,
              showTotal: (t) => `${t} customers`,
              size:      'small',
              showSizeChanger: false,
            }}
            size="small"
          />
        </div>
      </Card>
      </div>

      {/* Add / Edit Customer Modal — same form for both, differing only in
          which mutation onFinish routes to and the title/button text. */}
      <Modal
        title={<Space><UserOutlined style={{ color: '#B8860B' }} /> {editingCustomer ? `Edit ${editingCustomer.Customer_Name}` : 'Add New Customer'}</Space>}
        open={modalOpen}
        onCancel={() => { setModalOpen(false); setEditingCustomer(null); form.resetFields(); }}
        footer={null}
        width={580}
        styles={{ body: { paddingTop: 16 } }}
        destroyOnClose
      >
        <Form form={form} layout="vertical" className="erp-form"
          onFinish={(v) => editingCustomer ? updateMutation.mutate({ id: editingCustomer.Customer_ID, data: v }) : createMutation.mutate(v)}>
          <Row gutter={[12, 0]}>
            <Col xs={24} sm={12}>
              <Form.Item name="Customer_Name" label="Full Name" rules={[{ required: true }]}>
                <Input size="large" placeholder="Customer full name" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="Mobile_1" label="Mobile Number" rules={[{ required: true }]}>
                <Input size="large" placeholder="10-digit mobile" maxLength={10} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="Email" label="Email">
                <Input type="email" placeholder="customer@email.com" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="Date_Of_Birth" label="Date of Birth">
                <DatePicker style={{ width: '100%' }} format="DD-MMM-YYYY" placeholder="Select DOB" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="Anniversary_Date" label="Anniversary">
                <DatePicker style={{ width: '100%' }} format="DD-MMM-YYYY" placeholder="Anniversary date" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="Income_Group" label="Income Group">
                <Select allowClear placeholder="Select group">
                  <Option value="High">High</Option>
                  <Option value="Medium">Medium</Option>
                  <Option value="Low">Low</Option>
                </Select>
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="City" label="City">
                <Input placeholder="City name" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="Is_Wholesale" label="Customer Type" initialValue={false}>
                <Select>
                  <Option value={false}>Retail</Option>
                  <Option value={true}>Wholesale</Option>
                </Select>
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="Customer_Category" label="Category" initialValue="Regular">
                <Select>
                  <Option value="Regular">Regular</Option>
                  <Option value="Silver">Silver</Option>
                  <Option value="Gold">Gold</Option>
                  <Option value="Platinum">Platinum</Option>
                  <Option value="VIP">VIP</Option>
                </Select>
              </Form.Item>
            </Col>
            {/* Address_Line1/2, State, Pincode, GST_No, PAN_No already existed
                as real columns on tbl_customer_master — this form just never
                surfaced them, so they were silently unreachable everywhere. */}
            <Col xs={24} sm={12}>
              <Form.Item name="Address_Line1" label="Address Line 1">
                <Input placeholder="House/street" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="Address_Line2" label="Address Line 2">
                <Input placeholder="Area/landmark" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="State" label="State">
                <Input placeholder="State" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="Pincode" label="Pincode">
                <Input placeholder="6-digit PIN" maxLength={6} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="GST_No" label="GSTIN">
                <Input placeholder="For business/wholesale customers" style={{ textTransform: 'uppercase' }}
                  onChange={(e) => form.setFieldValue('GST_No', e.target.value.toUpperCase())} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="PAN_No" label="PAN Number"
                rules={[{ pattern: /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/, message: 'Format: ABCDE1234F' }]}>
                <Input placeholder="ABCDE1234F" maxLength={10} style={{ textTransform: 'uppercase' }}
                  onChange={(e) => form.setFieldValue('PAN_No', e.target.value.toUpperCase())} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="Aadhar_Number" label="Aadhar Number (for KYC records)">
                <Input placeholder="12-digit Aadhar" maxLength={12} />
              </Form.Item>
            </Col>
            <Col xs={24}>
              <Form.Item name="Notes" label="Notes">
                <Input.TextArea rows={2} placeholder="Additional notes..." />
              </Form.Item>
            </Col>
          </Row>
          <Button
            type="primary"
            htmlType="submit"
            block
            size="large"
            loading={editingCustomer ? updateMutation.isPending : createMutation.isPending}
            style={{ background: '#B8860B', borderColor: '#B8860B', fontWeight: 600, marginTop: 4 }}
          >
            {editingCustomer ? 'Update Customer' : 'Save Customer'}
          </Button>
        </Form>
      </Modal>

      {/* Purchase History Drawer */}
      <Drawer
        title={selectedCustomer ? `${selectedCustomer.Customer_Name} — History` : 'History'}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width="min(520px, 100vw)"
        styles={{ body: { padding: 16 } }}
      >
        {selectedCustomer && (
          <>
            <Descriptions size="small" column={2} bordered style={{ marginBottom: 16, borderRadius: 8, overflow: 'hidden' }}>
              <Descriptions.Item label="Mobile">{selectedCustomer.Mobile_1}</Descriptions.Item>
              <Descriptions.Item label="Loyalty Pts">
                <Tag color="gold">{parseFloat(selectedCustomer.Loyalty_Points || 0).toFixed(0)} pts</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Purchases">{selectedCustomer.Total_Purchase_Count} bills</Descriptions.Item>
              <Descriptions.Item label="Total Value">
                <Text strong style={{ color: '#B8860B' }}>{formatCurrency(selectedCustomer.Total_Purchase_Value)}</Text>
              </Descriptions.Item>
            </Descriptions>
            <List
              dataSource={history || []}
              locale={{ emptyText: 'No purchase history found' }}
              renderItem={(h) => (
                <List.Item style={{ padding: '10px 0', borderBottom: '1px solid #f5f5f5' }}>
                  <List.Item.Meta
                    title={<Text strong style={{ fontSize: 13 }}>{h.Invoice_Number}</Text>}
                    description={<Text style={{ fontSize: 11, color: '#888' }}>{dayjs(h.Sale_Date).format('DD-MMM-YYYY HH:mm')}</Text>}
                  />
                  <Space direction="vertical" align="end" size={2}>
                    <Text strong style={{ color: '#B8860B', fontSize: 13 }}>{formatCurrency(h.Net_Payable_Amount)}</Text>
                    <Tag color={h.Payment_Status === 'Paid' ? 'green' : 'orange'} style={{ margin: 0 }}>{h.Payment_Status}</Tag>
                  </Space>
                </List.Item>
              )}
            />
          </>
        )}
      </Drawer>

      <PageTour steps={tourSteps} />
    </div>
  );
}
