/**
 * Policy sections admin CRUD — Terms & Conditions, About Us, Privacy Policy,
 * Return/Refund Policy, Shipping/Delivery Policy shown in the savings_app
 * mobile app. Tenant-scoped; Super Admin may view/edit another tenant's or
 * the global default rows by passing ?tenantId= (handled server-side).
 */
import React, { useState, useRef } from 'react';
import {
  Card, Form, Input, InputNumber, Switch, Button, Table, Modal,
  Typography, Tag, Space, message, Alert, Select, Popconfirm,
} from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { policiesApi } from '../../api/modules';
import PageTour from '../../components/PageTour';

const { Title, Paragraph } = Typography;
const { Option } = Select;
const { TextArea } = Input;

const POLICY_TYPES = ['TERMS', 'ABOUT', 'PRIVACY', 'RETURN', 'SHIPPING'];

const POLICY_TYPE_LABELS = {
  TERMS: 'Terms & Conditions',
  ABOUT: 'About Us',
  PRIVACY: 'Privacy Policy',
  RETURN: 'Return / Refund Policy',
  SHIPPING: 'Shipping / Delivery Policy',
};

const POLICY_TYPE_COLORS = {
  TERMS: 'blue',
  ABOUT: 'purple',
  PRIVACY: 'green',
  RETURN: 'volcano',
  SHIPPING: 'gold',
};

export default function PoliciesPage() {
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form] = Form.useForm();
  const qc = useQueryClient();

  // ── Walkthrough tour refs ───────────────────────────────────────────────────
  const groupingRef = useRef(null);
  const addBtnRef = useRef(null);
  const tableRef = useRef(null);
  const tourSteps = [
    { title: '1. How Sections Are Grouped', description: 'Terms & Conditions and About Us each show as a single list in the mobile app. Privacy Policy groups Privacy / Return & Refund / Shipping & Delivery into tabs — pick the matching Policy Type when adding a section so it lands in the right place.', target: () => groupingRef.current },
    { title: '2. Add a Section', description: 'Click here to add a new section — choose the Policy Type, give it a title, and write the content shown to customers in the Savings App.', target: () => addBtnRef.current },
    { title: '3. Manage Sections', description: 'Every section is listed here — filter by type, edit or delete a section, and toggle Active/Inactive to control what customers see.', target: () => tableRef.current },
  ];

  const queryKey = ['policies', typeFilter];

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: () => policiesApi
      .getAll(typeFilter === 'ALL' ? undefined : { type: typeFilter })
      .then(r => r.data.data),
  });

  const saveMutation = useMutation({
    mutationFn: (values) => editing
      ? policiesApi.update(editing.Policy_ID, values)
      : policiesApi.create(values),
    onSuccess: () => {
      message.success(editing ? 'Policy section updated.' : 'Policy section created.');
      qc.invalidateQueries(queryKey);
      qc.invalidateQueries(['policies']);
      setOpen(false);
      form.resetFields();
      setEditing(null);
    },
    onError: (err) => message.error(err.response?.data?.message || 'Failed to save policy section.'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => policiesApi.remove(id),
    onSuccess: () => {
      message.success('Policy section deleted.');
      qc.invalidateQueries(queryKey);
      qc.invalidateQueries(['policies']);
    },
    onError: (err) => message.error(err.response?.data?.message || 'Failed to delete policy section.'),
  });

  const openEdit = (row) => { setEditing(row); form.setFieldsValue(row); setOpen(true); };
  const openNew = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ Sort_Order: 0, Is_Active: true });
    setOpen(true);
  };

  const columns = [
    {
      title: 'Policy Type',
      dataIndex: 'Policy_Type',
      width: 200,
      render: (type) => <Tag color={POLICY_TYPE_COLORS[type] || 'default'}>{POLICY_TYPE_LABELS[type] || type}</Tag>,
    },
    { title: 'Section Title', dataIndex: 'Section_Title' },
    { title: 'Sort Order', dataIndex: 'Sort_Order', width: 100 },
    {
      title: 'Active',
      dataIndex: 'Is_Active',
      width: 90,
      render: (active) => <Tag color={active ? 'green' : 'red'}>{active ? 'Active' : 'Inactive'}</Tag>,
    },
    {
      title: '',
      width: 90,
      render: (_, row) => (
        <Space size="small">
          <Button size="small" type="text" icon={<EditOutlined />} onClick={() => openEdit(row)} />
          <Popconfirm
            title="Delete this policy section?"
            onConfirm={() => deleteMutation.mutate(row.Policy_ID)}
            okText="Delete"
            okButtonProps={{ danger: true }}
          >
            <Button size="small" type="text" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div className="page-wrapper">
      <div className="page-header">
        <Title level={4} style={{ margin: 0 }}>Policies</Title>
        <Paragraph type="secondary" style={{ marginTop: 4 }}>
          Manage the Terms &amp; Conditions, About Us, Privacy Policy, Return/Refund Policy, and
          Shipping/Delivery Policy content shown in the savings app.
        </Paragraph>
      </div>

      <Card
        title="Policy Sections"
        extra={
          <Button ref={addBtnRef} type="primary" size="small" icon={<PlusOutlined />}
            style={{ background: '#B8860B', borderColor: '#B8860B' }} onClick={openNew}>
            Add Section
          </Button>
        }
      >
        <div ref={groupingRef}>
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 12 }}
          message="How sections are grouped in the app"
          description="Terms & Conditions and About Us show as a single list. Privacy Policy groups Privacy / Return & Refund / Shipping & Delivery into tabs — add sections with Policy_Type = PRIVACY, RETURN, or SHIPPING to fill those tabs respectively."
        />
        </div>

        <Select
          value={typeFilter}
          onChange={setTypeFilter}
          style={{ width: 260, marginBottom: 12 }}
        >
          <Option value="ALL">All Policy Types</Option>
          {POLICY_TYPES.map(t => <Option key={t} value={t}>{POLICY_TYPE_LABELS[t]}</Option>)}
        </Select>

        <div ref={tableRef}>
        <Table
          scroll={{ x: 'max-content' }}
          size="small"
          rowKey="Policy_ID"
          dataSource={data || []}
          loading={isLoading}
          columns={columns}
          pagination={{ pageSize: 10 }}
        />
        </div>
      </Card>

      <Modal
        title={editing ? `Edit Section — ${editing.Section_Title}` : 'Add Policy Section'}
        open={open}
        onCancel={() => { setOpen(false); form.resetFields(); setEditing(null); }}
        footer={null}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={v => saveMutation.mutate(v)}>
          <Form.Item name="Policy_Type" label="Policy Type" rules={[{ required: true }]}>
            <Select placeholder="Select policy type">
              {POLICY_TYPES.map(t => <Option key={t} value={t}>{POLICY_TYPE_LABELS[t]}</Option>)}
            </Select>
          </Form.Item>
          <Form.Item name="Section_Title" label="Section Title" rules={[{ required: true }]}>
            <Input placeholder="e.g. Eligibility, Cancellation Policy, Data We Collect" />
          </Form.Item>
          <Form.Item name="Section_Content" label="Section Content" rules={[{ required: true }]}>
            <TextArea rows={8} placeholder="Full section text shown in the app" />
          </Form.Item>
          <Form.Item name="Sort_Order" label="Sort Order" initialValue={0}>
            <InputNumber style={{ width: '100%' }} min={0} />
          </Form.Item>
          <Form.Item name="Is_Active" label="Active" valuePropName="checked" initialValue={true}>
            <Switch />
          </Form.Item>
          <Button type="primary" htmlType="submit" block loading={saveMutation.isPending}
            style={{ background: '#B8860B', borderColor: '#B8860B' }}>
            {editing ? 'Update Section' : 'Create Section'}
          </Button>
        </Form>
      </Modal>

      <PageTour steps={tourSteps} />
    </div>
  );
}
