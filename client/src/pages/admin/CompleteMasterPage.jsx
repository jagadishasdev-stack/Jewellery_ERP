import React, { useState, useRef } from 'react';
import {
  Tabs, Table, Button, Modal, Form, Input, InputNumber,
  Select, Switch, Typography, Card, message, Tag,
} from 'antd';
import { PlusOutlined, EditOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { masterApi, masterExtApi } from '../../api/modules';
import PageTour from '../../components/PageTour';

const { Title, Text } = Typography;
const { Option } = Select;

// Generic master table + create modal
function MasterTab({ title, queryKey, fetchFn, createFn, fields, rowKey = 'id' }) {
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: [queryKey],
    queryFn: () => fetchFn().then(r => r.data.data),
  });

  const createMutation = useMutation({
    mutationFn: (d) => createFn(d),
    onSuccess: () => {
      message.success(`${title} created!`);
      qc.invalidateQueries([queryKey]);
      setOpen(false);
      form.resetFields();
    },
    onError: (err) => {
      const msg = err.response?.data?.message || err.message || 'Failed.';
      message.error(msg);
    },
  });

  const autoColumns = fields
    .filter(f => !f.hideInTable)
    .map(f => ({
      title: f.label,
      dataIndex: f.name,
      render: f.type === 'boolean'
        ? (v) => <Tag color={v ? 'green' : 'red'}>{v ? 'Active' : 'Inactive'}</Tag>
        : undefined,
    }))
    .concat([{
      title: '',
      width: 40,
      render: () => <Button size="small" type="text" icon={<EditOutlined />} />,
    }]);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
        <Button type="primary" size="small" icon={<PlusOutlined />}
          style={{ background: '#B8860B', borderColor: '#B8860B' }}
          onClick={() => setOpen(true)}>
          Add {title}
        </Button>
      </div>
      <Table
            scroll={{ x: "max-content" }} size="small" dataSource={data || []} rowKey={rowKey} loading={isLoading}
        columns={autoColumns} pagination={{ pageSize: 15 }} />
      <Modal title={`Add ${title}`} open={open}
        onCancel={() => { setOpen(false); form.resetFields(); }}
        footer={null} destroyOnClose>
        <Form form={form} layout="vertical" onFinish={v => createMutation.mutate(v)}>
          {fields.filter(f => !f.hideInForm).map(f => (
            <Form.Item key={f.name} name={f.name} label={f.label}
              rules={f.required ? [{ required: true, message: `${f.label} is required` }] : []}
              initialValue={f.default}
              valuePropName={f.type === 'boolean' ? 'checked' : 'value'}>
              {f.type === 'boolean'
                ? <Switch />
                : f.type === 'select'
                  ? <Select>{(f.options || []).map(o => <Option key={o} value={o}>{o}</Option>)}</Select>
                : f.type === 'number'
                  ? <InputNumber style={{ width: '100%' }} min={0} />
                : f.type === 'color'
                  ? <Input type="color" style={{ width: 60, height: 36, padding: 2 }} />
                : <Input placeholder={f.placeholder} maxLength={f.maxLength} showCount={!!f.maxLength} />}
            </Form.Item>
          ))}
          <Button type="primary" htmlType="submit" block loading={createMutation.isPending}
            style={{ background: '#B8860B', borderColor: '#B8860B' }}>
            Save {title}
          </Button>
        </Form>
      </Modal>
    </div>
  );
}

function DiamondReadOnlyTab({ queryKey, fetchFn, columns, rowKey }) {
  const { data, isLoading } = useQuery({
    queryKey: [queryKey],
    queryFn: () => fetchFn().then(r => r.data.data),
  });
  const cols = columns.map(c => ({ title: c.replace(/_/g, ' '), dataIndex: c }));
  return <Table
            scroll={{ x: "max-content" }} size="small" dataSource={data || []} rowKey={rowKey}
    loading={isLoading} columns={cols} pagination={false} />;
}

export default function CompleteMasterPage() {
  // ── Walkthrough tour refs ───────────────────────────────────────────────────
  const tabsRef = useRef(null);
  const firstTabRef = useRef(null);
  const tourSteps = [
    { title: '1. Master Categories', description: 'All master data lives here, organized into tabs — Item Types, Collections, Purities, Making Charges, Gemstones, Designs and more. Click a tab to manage that category.', target: () => tabsRef.current },
    { title: '2. Add / Edit', description: 'Every tab works the same way: click "Add" (top-right) to create a new entry, and click the pencil icon on any row to edit it.', target: () => firstTabRef.current },
    { title: '3. Read-Only Tabs', description: 'Diamond Quality, Diamond Color and Diamond Shape follow the fixed GIA grading standard, so they are view-only — no Add button on those tabs.' },
  ];

  const tabItems = [
    // ── Product Masters ──────────────────────────────────────────────────────
    {
      key: 'item-types',
      label: 'Item Types',
      children: (
        <div ref={firstTabRef}>
        <MasterTab title="Item Type" queryKey="item-types" fetchFn={masterApi.getItemTypes}
          createFn={masterApi.createItemType} rowKey="Type_ID"
          fields={[
            { name: 'Type_Code',                label: 'Code',        required: true,  placeholder: 'RING' },
            { name: 'Type_Name',                label: 'Name',        required: true,  placeholder: 'Ring' },
            { name: 'Category',                 label: 'Category',    required: true,  type: 'select', options: ['Plain','Studded','Diamond','Antique'] },
            { name: 'HSN_Code',                 label: 'HSN Code',    placeholder: '7113' },
            { name: 'GST_Percentage',           label: 'GST %',       type: 'number',  default: 3 },
            { name: 'Default_Making_Charge',    label: 'Making ₹/g',  type: 'number' },
            { name: 'Default_Wastage_Percent',  label: 'Wastage %',   type: 'number',  default: 3 },
            { name: 'Is_Active',                label: 'Active',      type: 'boolean', default: true, hideInTable: false },
          ]}
        />
        </div>
      ),
    },
    {
      key: 'collections',
      label: 'Collections',
      children: (
        <MasterTab title="Collection" queryKey="collections" fetchFn={masterExtApi.getCollections}
          createFn={masterExtApi.createCollection} rowKey="Collection_ID"
          fields={[
            { name: 'Collection_Code', label: 'Code',        required: true },
            { name: 'Collection_Name', label: 'Name',        required: true, placeholder: 'Wedding 2026' },
            { name: 'Season',          label: 'Season',      placeholder: 'Wedding / Festive / Daily Wear' },
            { name: 'Year',            label: 'Year',        placeholder: '2026' },
            { name: 'Description',     label: 'Description' },
          ]}
        />
      ),
    },
    {
      key: 'sub-cat',
      label: 'Sub Categories',
      children: (
        <MasterTab title="Sub Category" queryKey="sub-categories" fetchFn={masterExtApi.getSubCategories}
          createFn={masterExtApi.createSubCategory} rowKey="SubCat_ID"
          fields={[
            { name: 'SubCat_Code', label: 'Code', required: true },
            { name: 'SubCat_Name', label: 'Name', required: true, placeholder: 'Ladies Ring / Gents Ring' },
          ]}
        />
      ),
    },
    {
      key: 'brands',
      label: 'Brands',
      children: (
        <MasterTab title="Brand" queryKey="brands" fetchFn={masterExtApi.getBrands}
          createFn={masterExtApi.createBrand} rowKey="Brand_ID"
          fields={[
            { name: 'Brand_Code', label: 'Code', required: true },
            { name: 'Brand_Name', label: 'Brand Name', required: true, placeholder: 'Tanishq / Own Brand' },
          ]}
        />
      ),
    },
    // ── Metal Masters ────────────────────────────────────────────────────────
    {
      key: 'purities',
      label: 'Purities',
      children: (
        <MasterTab title="Purity" queryKey="purities" fetchFn={masterApi.getPurities}
          createFn={masterApi.createPurity} rowKey="Purity_ID"
          fields={[
            { name: 'Purity_Code',       label: 'Code',       required: true, placeholder: '22K' },
            { name: 'Karat',             label: 'Karat',      type: 'number', required: true },
            { name: 'Percentage',        label: 'Percentage', type: 'number', required: true },
            { name: 'Hallmark_Standard', label: 'Hallmark',   placeholder: 'BIS 916' },
          ]}
        />
      ),
    },
    {
      key: 'making',
      label: 'Making Charges',
      children: (
        <MasterTab title="Making Charge" queryKey="making-charges" fetchFn={masterExtApi.getMakingCharges}
          createFn={masterExtApi.createMakingCharge} rowKey="MC_ID"
          fields={[
            { name: 'MC_Name',    label: 'Name',        required: true, placeholder: 'Plain Gold Ring Making' },
            { name: 'Charge_Type',label: 'Charge Type', required: true, type: 'select', options: ['Per Gram','Fixed','Percentage','Per Piece'] },
            { name: 'Charge_Value',label: 'Value',      type: 'number', required: true },
            { name: 'Purity_Code', label: 'Purity (optional)', placeholder: '22K' },
          ]}
        />
      ),
    },
    // ── Stone Masters ────────────────────────────────────────────────────────
    {
      key: 'gemstones',
      label: 'Gemstones',
      children: (
        <MasterTab title="Gemstone" queryKey="gemstones" fetchFn={masterApi.getGemstones}
          createFn={masterApi.createGemstone} rowKey="Stone_ID"
          fields={[
            { name: 'Stone_Code',    label: 'Code',       required: true, placeholder: 'RUBY001', maxLength: 20 },
            { name: 'Stone_Name',    label: 'Name',       required: true, placeholder: 'Ruby / Emerald / CZ', maxLength: 50 },
            { name: 'Stone_Color',   label: 'Color',      placeholder: 'Red', maxLength: 30 },
            { name: 'Stone_Clarity', label: 'Clarity',    placeholder: 'VS1', maxLength: 20 },
            { name: 'Stone_Cut',     label: 'Cut',        placeholder: 'Round', maxLength: 20 },
            { name: 'Price_Per_Carat', label: 'Price/Carat (₹)', type: 'number' },
          ]}
        />
      ),
    },
    // ── Diamond Masters ──────────────────────────────────────────────────────
    {
      key: 'dq',
      label: 'Diamond Quality',
      children: (
        <DiamondReadOnlyTab queryKey="diamond-quality" fetchFn={masterExtApi.getDiamondQuality}
          columns={['Quality_Code', 'Quality_Name']} rowKey="Quality_ID" />
      ),
    },
    {
      key: 'dc',
      label: 'Diamond Color',
      children: (
        <DiamondReadOnlyTab queryKey="diamond-color" fetchFn={masterExtApi.getDiamondColor}
          columns={['Color_Code', 'Color_Name']} rowKey="Color_ID" />
      ),
    },
    {
      key: 'ds',
      label: 'Diamond Shape',
      children: (
        <DiamondReadOnlyTab queryKey="diamond-shape" fetchFn={masterExtApi.getDiamondShape}
          columns={['Shape_Code', 'Shape_Name']} rowKey="Shape_ID" />
      ),
    },
    // ── Designs ──────────────────────────────────────────────────────────────
    {
      key: 'designs',
      label: 'Designs',
      children: (
        <MasterTab title="Design" queryKey="designs" fetchFn={masterApi.getDesigns}
          createFn={masterApi.createDesign} rowKey="Design_ID"
          fields={[
            { name: 'Design_Code',            label: 'Design Code', required: true, placeholder: 'R1001' },
            { name: 'Design_Name',            label: 'Design Name', required: true, placeholder: 'Classic Solitaire Ring' },
            { name: 'Collection_Name',        label: 'Collection',  placeholder: 'Wedding 2026' },
            { name: 'Category',               label: 'Category',    type: 'select', options: ['Antique','Modern','Traditional','Bridal','Daily Wear'] },
            { name: 'Estimated_Gold_Weight',  label: 'Est. Weight (g)',   type: 'number' },
            { name: 'Estimated_Making_Charge',label: 'Est. Making (₹)',   type: 'number' },
          ]}
        />
      ),
    },
  ];

  return (
    <div className="page-wrapper">
      <div className="page-header">
        <Title level={4} style={{ margin: 0 }}>Complete Master Management</Title>
      </div>
      <div ref={tabsRef}>
      <Tabs defaultActiveKey="item-types" type="card" items={tabItems} />
      </div>

      <PageTour steps={tourSteps} />
    </div>
  );
}
