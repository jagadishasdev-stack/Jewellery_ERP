import React, { useState, useRef } from 'react';
import {
  Tabs, Table, Button, Modal, Form, Input, InputNumber,
  Select, Switch, Typography, Card, message, Tag,
} from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { masterApi } from '../../api/modules';
import PageTour from '../../components/PageTour';

const { Title } = Typography;
const { TabPane } = Tabs;
const { Option } = Select;

function ItemTypesTab() {
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();
  const qc = useQueryClient();

  const { data: types, isLoading } = useQuery({ queryKey: ['item-types'], queryFn: () => masterApi.getItemTypes().then((r) => r.data.data) });

  const createMutation = useMutation({
    mutationFn: (data) => masterApi.createItemType(data),
    onSuccess: () => { message.success('Item type created!'); qc.invalidateQueries(['item-types']); setOpen(false); form.resetFields(); },
    onError: (err) => message.error(err.response?.data?.message || 'Failed.'),
  });

  const columns = [
    { title: 'Code', dataIndex: 'Type_Code', render: (v) => <Tag>{v}</Tag> },
    { title: 'Name', dataIndex: 'Type_Name' },
    { title: 'Category', dataIndex: 'Category' },
    { title: 'HSN', dataIndex: 'HSN_Code', render: (v) => v || '-' },
    { title: 'GST%', dataIndex: 'GST_Percentage', render: (v) => `${v}%` },
    { title: 'Default M/C', dataIndex: 'Default_Making_Charge', render: (v) => `₹${v}/g` },
  ];

  return (
    <>
      <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'flex-end' }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}
          style={{ background: '#B8860B', borderColor: '#B8860B' }}>Add Item Type</Button>
      </div>
      <Table
            scroll={{ x: "max-content" }} columns={columns} dataSource={types || []} loading={isLoading} rowKey="Type_ID" size="small" pagination={false} />
      <Modal title="Add Item Type" open={open} onCancel={() => setOpen(false)} footer={null}>
        <Form form={form} layout="vertical" onFinish={(v) => createMutation.mutate(v)}>
          <Form.Item name="Type_Code" label="Type Code" rules={[{ required: true }]}><Input placeholder="RING" style={{ textTransform: 'uppercase' }} /></Form.Item>
          <Form.Item name="Type_Name" label="Type Name" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="Category" label="Category" rules={[{ required: true }]}>
            <Select><Option value="Plain">Plain</Option><Option value="Studded">Studded</Option><Option value="Diamond">Diamond</Option></Select>
          </Form.Item>
          <Form.Item name="Default_Making_Charge" label="Default Making Charge (₹/g)"><InputNumber style={{ width: '100%' }} min={0} /></Form.Item>
          <Form.Item name="HSN_Code" label="HSN Code"><Input /></Form.Item>
          <Form.Item name="GST_Percentage" label="GST %" initialValue={3}><InputNumber style={{ width: '100%' }} min={0} max={28} /></Form.Item>
          <Button type="primary" htmlType="submit" block loading={createMutation.isPending}
            style={{ background: '#B8860B', borderColor: '#B8860B' }}>Save</Button>
        </Form>
      </Modal>
    </>
  );
}

function PuritiesTab() {
  const { data: purities, isLoading } = useQuery({ queryKey: ['purities'], queryFn: () => masterApi.getPurities().then((r) => r.data.data) });
  const columns = [
    { title: 'Code', dataIndex: 'Purity_Code', render: (v) => <Tag color="gold">{v}</Tag> },
    { title: 'Karat', dataIndex: 'Karat', render: (v) => `${v}K` },
    { title: 'Percentage', dataIndex: 'Percentage', render: (v) => `${v}%` },
    { title: 'Hallmark', dataIndex: 'Hallmark_Standard' },
  ];
  return <Table
            scroll={{ x: "max-content" }} columns={columns} dataSource={purities || []} loading={isLoading} rowKey="Purity_ID" size="small" pagination={false} />;
}

function GemstonesTab() {
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();
  const qc = useQueryClient();
  const { data: stones, isLoading } = useQuery({ queryKey: ['gemstones'], queryFn: () => masterApi.getGemstones().then((r) => r.data.data) });

  const createMutation = useMutation({
    mutationFn: (data) => masterApi.createGemstone(data),
    onSuccess: () => { message.success('Gemstone added!'); qc.invalidateQueries(['gemstones']); setOpen(false); form.resetFields(); },
    onError: (err) => message.error(err.response?.data?.message || 'Failed.'),
  });

  const columns = [
    { title: 'Code', dataIndex: 'Stone_Code' },
    { title: 'Name', dataIndex: 'Stone_Name' },
    { title: 'Color', dataIndex: 'Stone_Color', render: (v) => v || '-' },
    { title: 'Clarity', dataIndex: 'Stone_Clarity', render: (v) => v || '-' },
    { title: 'Cut', dataIndex: 'Stone_Cut', render: (v) => v || '-' },
    { title: 'Price/Carat', dataIndex: 'Price_Per_Carat', render: (v) => v ? `₹${v}` : '-' },
  ];

  return (
    <>
      <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'flex-end' }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}
          style={{ background: '#B8860B', borderColor: '#B8860B' }}>Add Gemstone</Button>
      </div>
      <Table
            scroll={{ x: "max-content" }} columns={columns} dataSource={stones || []} loading={isLoading} rowKey="Stone_ID" size="small" />
      <Modal title="Add Gemstone" open={open} onCancel={() => setOpen(false)} footer={null}>
        <Form form={form} layout="vertical" onFinish={(v) => createMutation.mutate(v)}>
          <Form.Item name="Stone_Code" label="Stone Code" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="Stone_Name" label="Stone Name" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="Stone_Color" label="Color"><Input /></Form.Item>
          <Form.Item name="Stone_Clarity" label="Clarity"><Input placeholder="VVS1, VS1, SI1" /></Form.Item>
          <Form.Item name="Stone_Cut" label="Cut"><Input placeholder="Round, Princess, Emerald" /></Form.Item>
          <Form.Item name="Price_Per_Carat" label="Price Per Carat (₹)"><InputNumber style={{ width: '100%' }} min={0} /></Form.Item>
          <Button type="primary" htmlType="submit" block loading={createMutation.isPending}
            style={{ background: '#B8860B', borderColor: '#B8860B' }}>Save</Button>
        </Form>
      </Modal>
    </>
  );
}

export default function MasterDataPage() {
  // ── Walkthrough tour refs ───────────────────────────────────────────────────
  const tabsRef = useRef(null);
  const itemTypesRef = useRef(null);
  const tourSteps = [
    { title: '1. Three Master Categories', description: 'This page manages the basic building blocks used everywhere else in the ERP — Item Types, Purities, and Gemstones. Click a tab to switch category.', target: () => tabsRef.current },
    { title: '2. Add an Item Type', description: 'Click "Add Item Type" to create one — give it a code, name, category (Plain/Studded/Diamond), GST % and a default making charge. It then appears as a dropdown when adding stock.', target: () => itemTypesRef.current },
    { title: '3. Purities (View Only)', description: 'The Purities tab shows karat/fineness values like 22K and 24K used for gold-value calculations — these are managed centrally and shown here for reference.' },
    { title: '4. Gemstones', description: 'The Gemstones tab works just like Item Types — click "Add Gemstone" to register stones (Ruby, Emerald, CZ) with color, clarity and price per carat, used when adding studded jewellery.' },
  ];

  return (
    <div className="page-wrapper">
      <div className="page-header">
        <Title level={4} style={{ margin: 0 }}>Master Data Management</Title>
      </div>
      <Card style={{ borderRadius: 8 }}>
        <div ref={tabsRef}>
        <Tabs defaultActiveKey="types">
          <TabPane tab="Item Types" key="types"><div ref={itemTypesRef}><ItemTypesTab /></div></TabPane>
          <TabPane tab="Purities" key="purities"><PuritiesTab /></TabPane>
          <TabPane tab="Gemstones" key="gemstones"><GemstonesTab /></TabPane>
        </Tabs>
        </div>
      </Card>

      <PageTour steps={tourSteps} />
    </div>
  );
}
