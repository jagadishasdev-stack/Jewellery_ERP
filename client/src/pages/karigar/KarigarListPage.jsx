import React, { useState, useRef } from 'react';
import { Table, Button, Tag, Space, Typography, Card, Modal, Form, Input, Select, InputNumber, message } from 'antd';
import { PlusOutlined, UserOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { karigarApi } from '../../api/modules';
import { formatCurrency } from '../../utils/calculations';
import PageTour from '../../components/PageTour';
import { useActionShortcuts } from '../../hooks/useActionShortcuts';

const { Title, Text } = Typography;
const { Option } = Select;

export default function KarigarListPage() {
  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();
  const qc = useQueryClient();

  // ── Walkthrough tour refs ───────────────────────────────────────────────────
  const addBtnRef = useRef(null);
  const tableRef = useRef(null);
  const tourSteps = [
    { title: '1. Karigars & Vendors List', description: 'Every goldsmith and supplier you work with is listed here, along with their current balance — how much gold/money is outstanding with them.', target: () => tableRef.current },
    { title: '2. Add Karigar/Vendor', description: 'Click here to register a new goldsmith or supplier — set their skill, wastage allowance, and bank details for settlements.', target: () => addBtnRef.current },
    { title: '3. Issue, Return & Settlement', description: 'Use the Karigar menu on the left sidebar to Issue Gold to a karigar, record Return Goods when finished items come back, and open Settlement to calculate and pay their wages.' },
  ];

  const { data: vendors, isLoading } = useQuery({
    queryKey: ['vendors', 'all'],
    queryFn: () => karigarApi.getVendors().then((r) => r.data.data),
  });

  const createMutation = useMutation({
    mutationFn: (data) => karigarApi.createVendor(data),
    onSuccess: () => {
      message.success('Vendor/Karigar added!');
      qc.invalidateQueries(['vendors']);
      setModalOpen(false);
      form.resetFields();
    },
    onError: (err) => message.error(err.response?.data?.message || 'Failed to add.'),
  });

  useActionShortcuts({
    onNew: () => setModalOpen(true),
    onSave: () => modalOpen && form.submit(),
    onCancel: () => modalOpen && setModalOpen(false),
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
    { title: 'Skill', dataIndex: 'Karigar_Skill', render: (v) => v || '-' },
    { title: 'Balance', dataIndex: 'Current_Balance', render: (v) => formatCurrency(v) },
    {
      title: 'Status',
      dataIndex: 'Is_Active',
      render: (v) => <Tag color={v ? 'green' : 'red'}>{v ? 'Active' : 'Inactive'}</Tag>,
    },
  ];

  return (
    <div className="page-wrapper">
      <div className="page-header">
        <Title level={4} style={{ margin: 0 }}>Karigars & Vendors</Title>
        <Button ref={addBtnRef} type="primary" icon={<PlusOutlined />}
          style={{ background: '#B8860B', borderColor: '#B8860B' }}
          onClick={() => setModalOpen(true)}>
          Add Karigar/Vendor
        </Button>
      </div>

      <div ref={tableRef}>
      <Card style={{ borderRadius: 8, border: 'none' }} bodyStyle={{ padding: 0 }}>
        <Table
            scroll={{ x: "max-content" }}
          columns={columns}
          dataSource={vendors || []}
          loading={isLoading}
          rowKey="Vendor_ID"
          size="small"
          pagination={{ pageSize: 20 }}
        />
      </Card>
      </div>

      <Modal title="Add Karigar / Vendor" open={modalOpen} onCancel={() => setModalOpen(false)} footer={null}>
        <Form form={form} layout="vertical" onFinish={(v) => createMutation.mutate(v)}>
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
          <Form.Item name="Mobile_1" label="Mobile" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="Karigar_Skill" label="Skill">
            <Select allowClear>
              <Option value="Gold">Gold</Option>
              <Option value="Silver">Silver</Option>
              <Option value="Diamond">Diamond</Option>
            </Select>
          </Form.Item>
          <Form.Item name="Karigar_Wastage_Allowed_Percent" label="Wastage Allowed (%)">
            <InputNumber style={{ width: '100%' }} min={0} max={20} step={0.5} />
          </Form.Item>
          <Form.Item name="Bank_Account_No" label="Bank Account No">
            <Input />
          </Form.Item>
          <Form.Item name="IFSC_Code" label="IFSC Code">
            <Input />
          </Form.Item>
          <Button type="primary" htmlType="submit" block loading={createMutation.isPending}
            style={{ background: '#B8860B', borderColor: '#B8860B' }}>
            Save
          </Button>
        </Form>
      </Modal>

      <PageTour steps={tourSteps} />
    </div>
  );
}
