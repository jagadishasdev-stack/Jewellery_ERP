/**
 * Master Management Hub — Complete single page for all master data
 * Every jewellery shop owner sets these up FIRST before using the ERP.
 *
 * Flow:
 * 1. Set up masters here
 * 2. Use masters when adding stock (Item Type, Purity, Design, Making Charge)
 * 3. Use masters in billing (Payment Mode, Tax, Voucher)
 * 4. Use masters in karigar (Karigar, Goldsmith, Vendor)
 * 5. Reports filter by all these masters
 */
import React, { useState, useRef } from 'react';
import {
  Tabs, Table, Button, Modal, Form, Input, InputNumber, Select,
  Switch, Typography, Card, message, Tag, Row, Col, Divider,
  Space, Alert, Tooltip,
} from 'antd';
import {
  PlusOutlined, EditOutlined, GoldOutlined, TeamOutlined,
  ShopOutlined, BarcodeOutlined, DollarOutlined, SettingOutlined,
  InfoCircleOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  masterApi, masterExtApi, karigarApi, tenantApi, floorsApi, complianceApi, simpleMastersApi,
} from '../../api/modules';
import PageTour from '../../components/PageTour';
import { useMetalTypes } from '../../hooks/useMetalTypes';

const { Title, Text } = Typography;
const { Option } = Select;
const { TabPane } = Tabs;

// ── Generic CRUD table for any master ────────────────────────────────────────
function MasterSection({ title, hint, queryKey, fetchFn, createFn, updateFn, fields, rowKey, nameCol }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form] = Form.useForm();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: [queryKey],
    queryFn: () => fetchFn().then(r => r.data.data),
  });

  const saveMutation = useMutation({
    mutationFn: (d) => editing && updateFn ? updateFn(editing[rowKey], d) : createFn(d),
    onSuccess: () => {
      message.success(`${title} saved!`);
      qc.invalidateQueries([queryKey]);
      setOpen(false);
      form.resetFields();
      setEditing(null);
    },
    onError: (err) => message.error(err.response?.data?.message || 'Failed. Check if code already exists.'),
  });

  const openEdit = (row) => {
    setEditing(row);
    form.setFieldsValue(row);
    setOpen(true);
  };

  const openNew = () => {
    setEditing(null);
    form.resetFields();
    setOpen(true);
  };

  // Auto-generate table columns from fields definition
  const cols = [
    ...fields.filter(f => f.showInTable !== false).map(f => ({
      title: f.label,
      dataIndex: f.name,
      width: f.width,
      render: f.type === 'boolean'
        ? (v) => <Tag color={v ? 'green' : 'red'}>{v ? 'Active' : 'Inactive'}</Tag>
        : f.type === 'color'
        ? (v) => v ? <span style={{ display:'inline-block', width:18, height:18, borderRadius:3, background:v, border:'1px solid #eee', verticalAlign:'middle' }} /> : '-'
        : f.renderFn || undefined,
    })),
    {
      title: '',
      width: 40,
      render: (_, row) => (
        <Button size="small" type="text" icon={<EditOutlined />}
          onClick={() => openEdit(row)} />
      ),
    },
  ];

  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <Space>
          {hint && <Tooltip title={hint}><InfoCircleOutlined style={{ color: '#B8860B' }} /></Tooltip>}
          <Text type="secondary" style={{ fontSize: 12 }}>{hint}</Text>
        </Space>
        <Button type="primary" size="small" icon={<PlusOutlined />}
          style={{ background: '#B8860B', borderColor: '#B8860B' }}
          onClick={openNew}>
          Add {title}
        </Button>
      </div>

      <Table
            scroll={{ x: "max-content" }} size="small" dataSource={data || []} rowKey={rowKey} loading={isLoading}
        columns={cols} pagination={{ pageSize: 10, size: 'small' }}
        locale={{ emptyText: `No ${title} created yet. Click "Add ${title}" to start.` }}
      />

      <Modal
        title={editing ? `Edit ${title}` : `Add ${title}`}
        open={open}
        onCancel={() => { setOpen(false); form.resetFields(); setEditing(null); }}
        footer={null}
      >
        <Form form={form} layout="vertical" onFinish={v => saveMutation.mutate(v)}>
          {fields.map(f => (
            <Form.Item key={f.name} name={f.name} label={f.label}
              rules={f.required ? [{ required: true, message: `${f.label} is required` }] : []}
              initialValue={f.default}
              valuePropName={f.type === 'boolean' ? 'checked' : 'value'}
            >
              {f.type === 'boolean' ? <Switch />
                : f.type === 'select' ? (
                    <Select placeholder={`Select ${f.label}`}>
                      {(f.options || []).map(o =>
                        typeof o === 'string'
                          ? <Option key={o} value={o}>{o}</Option>
                          : <Option key={o.value} value={o.value}>{o.label}</Option>
                      )}
                    </Select>
                  )
                : f.type === 'number' ? <InputNumber style={{ width: '100%' }} min={0} step={f.step || 1} />
                : f.type === 'textarea' ? <Input.TextArea rows={2} placeholder={f.placeholder} />
                : f.type === 'color' ? <Input type="color" style={{ width: 60, height: 36, padding: 2 }} />
                : <Input placeholder={f.placeholder || `Enter ${f.label}`} />
              }
            </Form.Item>
          ))}
          <Divider style={{ margin: '8px 0' }} />
          <Button type="primary" htmlType="submit" block loading={saveMutation.isPending}
            style={{ background: '#B8860B', borderColor: '#B8860B' }}>
            {editing ? 'Update' : 'Save'} {title}
          </Button>
        </Form>
      </Modal>
    </div>
  );
}

// ── Main Master Hub Page ──────────────────────────────────────────────────────
export default function MasterHub() {
  const { data: itemTypes } = useQuery({ queryKey: ['item-types'], queryFn: () => masterApi.getItemTypes().then(r => r.data.data) });
  const { data: allPurities } = useQuery({ queryKey: ['purities'], queryFn: () => masterApi.getPurities().then(r => r.data.data) });
  const { metalTypesWithPurity } = useMetalTypes();

  // ── Walkthrough tour refs ───────────────────────────────────────────────────
  const howItWorksRef = useRef(null);
  const tabsRef = useRef(null);
  const itemTypeCardRef = useRef(null);
  const tourSteps = [
    { title: '1. Setup Order', description: 'This shows the recommended order to set up your masters, and where each one is used later — in Inventory, Billing, and Karigar screens.', target: () => howItWorksRef.current },
    { title: '2. Master Categories', description: 'Each tab groups related masters — Product, Metal & Purity, Stone, People, Shop Setup, and Billing. Click through them to set up every category your shop needs.', target: () => tabsRef.current },
    { title: '3. Add / Edit an Entry', description: 'Every master works the same way: click "Add" to create a new entry (like a Ring or Chain type), or click the pencil icon on any row to edit it.', target: () => itemTypeCardRef.current },
    { title: '4. Read-Only Masters', description: 'A few masters — like Diamond Quality, Color, and Shape (GIA standards) — are fixed reference data and cannot be edited here.' },
  ];

  return (
    <div className="page-wrapper">
      <div className="page-header">
        <div>
          <Title level={4} style={{ margin: 0 }}>⚙️ Master Management</Title>
          <Text type="secondary" style={{ fontSize: 12 }}>
            Set up all business configurations here first — then they appear as dropdowns in Inventory, Billing, Reports
          </Text>
        </div>
      </div>

      <div ref={howItWorksRef}>
      <Alert
        message="How Masters Work"
        description={
          <div style={{ fontSize: 12 }}>
            <strong>Setup order:</strong>{' '}
            Item Types → Purities → Collections → Designs → Making Charges → Karigars → Counters → Payment Modes
            <br />
            <strong>Then use in:</strong>{' '}
            Inventory → Add Stock (Item Type, Purity, Design, Making Charge) |
            POS → Billing (Payment Mode) |
            Karigar → Issue Gold (Karigar, Design)
          </div>
        }
        type="info" showIcon style={{ marginBottom: 16, borderRadius: 8 }}
      />
      </div>

      <div ref={tabsRef}>
      <Tabs type="card" defaultActiveKey="product">

        {/* ════════════════════════════════════════════════════════
            TAB 1 — PRODUCT MASTERS
            ════════════════════════════════════════════════════════ */}
        <TabPane tab={<span><GoldOutlined /> Product Masters</span>} key="product">
          <Row gutter={[16, 16]}>
            <Col xs={24} lg={12}>
              <div ref={itemTypeCardRef}>
              <Card title="Item Type Master" size="small" style={{ borderRadius: 8 }}>
                <MasterSection
                  title="Item Type"
                  hint="Examples: Ring, Chain, Necklace, Bangle — used when adding stock"
                  queryKey="item-types"
                  fetchFn={masterApi.getItemTypes}
                  createFn={masterApi.createItemType}
                  rowKey="Type_ID"
                  fields={[
                    { name: 'Type_Code', label: 'Code', required: true, placeholder: 'RING', width: 80 },
                    { name: 'Type_Name', label: 'Name', required: true, placeholder: 'Ring (or regional name)' },
                    { name: 'Category', label: 'Category', required: true, type: 'select', options: ['Plain','Studded','Diamond','Antique','Silver','Custom'] },
                    { name: 'HSN_Code', label: 'HSN Code', placeholder: '7113', width: 100 },
                    { name: 'GST_Percentage', label: 'GST %', type: 'number', default: 3, step: 0.5 },
                    { name: 'Default_Making_Charge', label: 'Default Making ₹/g', type: 'number' },
                    { name: 'Default_Wastage_Percent', label: 'Default Wastage %', type: 'number', default: 3, step: 0.5 },
                    { name: 'Is_Active', label: 'Active', type: 'boolean', default: true, showInTable: false },
                  ]}
                />
              </Card>
              </div>
            </Col>

            <Col xs={24} lg={12}>
              <Card title="Design Master" size="small" style={{ borderRadius: 8 }}>
                <MasterSection
                  title="Design"
                  hint="Design codes like R1001, N2001 — used to identify specific designs in stock"
                  queryKey="designs"
                  fetchFn={masterApi.getDesigns}
                  createFn={masterApi.createDesign}
                  rowKey="Design_ID"
                  fields={[
                    { name: 'Design_Code', label: 'Design Code', required: true, placeholder: 'R1001' },
                    { name: 'Design_Name', label: 'Design Name', required: true, placeholder: 'Classic Solitaire Ring' },
                    { name: 'Type_ID', label: 'Item Type', type: 'select',
                      options: (itemTypes || []).map(t => ({ value: t.Type_ID, label: t.Type_Name })) },
                    { name: 'Collection_Name', label: 'Collection', placeholder: 'Wedding 2026' },
                    { name: 'Category', label: 'Style', type: 'select', options: ['Antique','Modern','Traditional','Bridal','Daily Wear','Festival'] },
                    { name: 'Estimated_Gold_Weight', label: 'Est. Wt (g)', type: 'number', step: 0.001 },
                    { name: 'Estimated_Making_Charge', label: 'Est. Making ₹', type: 'number' },
                    { name: 'Notes', label: 'Notes', type: 'textarea', showInTable: false },
                  ]}
                />
              </Card>
            </Col>

            <Col xs={24} lg={12}>
              <Card title="Collection Master" size="small" style={{ borderRadius: 8 }}>
                <MasterSection
                  title="Collection"
                  hint="Examples: Wedding Collection, Diwali 2026, Daily Wear — group your stock"
                  queryKey="collections"
                  fetchFn={masterExtApi.getCollections}
                  createFn={masterExtApi.createCollection}
                  rowKey="Collection_ID"
                  fields={[
                    { name: 'Collection_Code', label: 'Code', required: true, placeholder: 'WEDD-2026' },
                    { name: 'Collection_Name', label: 'Collection Name', required: true, placeholder: 'Wedding Collection 2026' },
                    { name: 'Season', label: 'Season / Occasion', placeholder: 'Wedding / Diwali / Daily Wear' },
                    { name: 'Year', label: 'Year', placeholder: '2026' },
                    { name: 'Description', label: 'Description', type: 'textarea', showInTable: false },
                  ]}
                />
              </Card>
            </Col>

            <Col xs={24} lg={12}>
              <Card title="Sub-Category Master" size="small" style={{ borderRadius: 8 }}>
                <MasterSection
                  title="Sub Category"
                  hint="Examples: Ladies Ring, Gents Ring, Kids Earring — sub-groups of item types"
                  queryKey="sub-categories"
                  fetchFn={masterExtApi.getSubCategories}
                  createFn={masterExtApi.createSubCategory}
                  rowKey="SubCat_ID"
                  fields={[
                    { name: 'SubCat_Code', label: 'Code', required: true, placeholder: 'LRNG' },
                    { name: 'SubCat_Name', label: 'Name', required: true, placeholder: 'Ladies Ring / ಮಹಿಳೆಯರ ಉಂಗುರ' },
                  ]}
                />
              </Card>
            </Col>

            <Col xs={24} lg={12}>
              <Card title="Brand Master" size="small" style={{ borderRadius: 8 }}>
                <MasterSection
                  title="Brand"
                  hint="Your brand name or supplier brand — e.g. Own Brand, Tanishq, Nakshatra"
                  queryKey="brands"
                  fetchFn={masterExtApi.getBrands}
                  createFn={masterExtApi.createBrand}
                  rowKey="Brand_ID"
                  fields={[
                    { name: 'Brand_Code', label: 'Code', required: true, placeholder: 'OWN' },
                    { name: 'Brand_Name', label: 'Brand Name', required: true, placeholder: 'Own Brand / Tanishq' },
                  ]}
                />
              </Card>
            </Col>
          </Row>
        </TabPane>

        {/* ════════════════════════════════════════════════════════
            TAB 2 — METAL & PURITY
            ════════════════════════════════════════════════════════ */}
        <TabPane tab={<span><GoldOutlined /> Metal & Purity</span>} key="metal">
          <Row gutter={[16, 16]}>
            <Col xs={24} lg={12}>
              <Card title="Metal Type Master" size="small" style={{ borderRadius: 8 }}>
                <Alert message="Gold, Silver, Platinum, Diamond are pre-set — add a custom metal type here (e.g. a house-branded alloy) and it becomes selectable everywhere Metal Type is used: Add Stock, Purity, Purchase, Bin Management." type="info" showIcon style={{ marginBottom: 8, fontSize: 11 }} />
                <MasterSection
                  title="Metal Type"
                  hint="A custom type is usable everywhere the moment you add it — no separate setup needed"
                  queryKey="metal-types"
                  fetchFn={masterApi.getMetalTypes}
                  createFn={masterApi.createMetalType}
                  updateFn={masterApi.updateMetalType}
                  rowKey="Metal_Type_ID"
                  fields={[
                    { name: 'Metal_Name', label: 'Metal Name', required: true, placeholder: 'Rose Gold' },
                    { name: 'Description', label: 'Description', placeholder: 'House-branded rose gold alloy' },
                    { name: 'Has_Purity', label: 'Has Purity (Karat/Fineness)', type: 'boolean', default: true },
                    {
                      name: 'Default_Purity_ID', label: 'Default Purity', type: 'select',
                      options: (allPurities || []).map((p) => ({ value: p.Purity_ID, label: `${p.Purity_Code} (${p.Percentage}%)` })),
                    },
                  ]}
                />
              </Card>
            </Col>

            <Col xs={24} lg={12}>
              <Card title="Purity Master" size="small" style={{ borderRadius: 8 }}>
                <Alert message="Purities define the karat/fineness. 22K = 91.67%, 24K = 99.9%. These auto-calculate gold value in billing." type="info" showIcon style={{ marginBottom: 8, fontSize: 11 }} />
                <MasterSection
                  title="Purity"
                  hint="24K, 22K, 18K — each purity has a rate multiplier for billing"
                  queryKey="purities"
                  fetchFn={masterApi.getPurities}
                  createFn={masterApi.createPurity}
                  updateFn={masterApi.updatePurity}
                  rowKey="Purity_ID"
                  fields={[
                    { name: 'Purity_Code', label: 'Code', required: true, placeholder: '22K' },
                    { name: 'Metal_Type', label: 'Metal Type', type: 'select', options: metalTypesWithPurity },
                    { name: 'Karat', label: 'Karat', required: true, type: 'number' },
                    { name: 'Percentage', label: 'Purity %', required: true, type: 'number', step: 0.01 },
                    { name: 'Hallmark_Standard', label: 'Hallmark', placeholder: 'BIS 916' },
                  ]}
                />
              </Card>
            </Col>

            <Col xs={24} lg={12}>
              <Card title="Making Charge Master" size="small" style={{ borderRadius: 8 }}>
                <Alert message="Making charges auto-fill when you add stock. Select the charge type that applies to each item." type="info" showIcon style={{ marginBottom: 8, fontSize: 11 }} />
                <MasterSection
                  title="Making Charge"
                  hint="Define how making is charged — Per Gram, Fixed, or Percentage"
                  queryKey="making-charges"
                  fetchFn={masterExtApi.getMakingCharges}
                  createFn={masterExtApi.createMakingCharge}
                  rowKey="MC_ID"
                  fields={[
                    { name: 'MC_Name', label: 'Name', required: true, placeholder: 'Plain Gold Ring Making' },
                    { name: 'Charge_Type', label: 'Charge Type', required: true, type: 'select',
                      options: ['Per Gram','Fixed','Percentage','Per Piece'] },
                    { name: 'Charge_Value', label: 'Value (₹)', required: true, type: 'number' },
                    { name: 'Purity_Code', label: 'For Purity (optional)', placeholder: '22K / All' },
                  ]}
                />
              </Card>
            </Col>
          </Row>
        </TabPane>

        {/* ════════════════════════════════════════════════════════
            TAB 3 — STONE & DIAMOND MASTERS
            ════════════════════════════════════════════════════════ */}
        <TabPane tab="💎 Stone Masters" key="stone">
          <Row gutter={[16, 16]}>
            <Col xs={24} lg={12}>
              <Card title="Gemstone Master" size="small" style={{ borderRadius: 8 }}>
                <MasterSection
                  title="Gemstone"
                  hint="Ruby, Emerald, CZ, Pearl — used when adding studded jewellery"
                  queryKey="gemstones"
                  fetchFn={masterApi.getGemstones}
                  createFn={masterApi.createGemstone}
                  rowKey="Stone_ID"
                  fields={[
                    { name: 'Stone_Code', label: 'Code', required: true, placeholder: 'RUB' },
                    { name: 'Stone_Name', label: 'Stone Name', required: true, placeholder: 'Ruby / Manik' },
                    { name: 'Stone_Color', label: 'Color', placeholder: 'Red / Green / Blue' },
                    { name: 'Stone_Clarity', label: 'Clarity', placeholder: 'VVS1 / SI1' },
                    { name: 'Price_Per_Carat', label: 'Price/Carat (₹)', type: 'number' },
                  ]}
                />
              </Card>
            </Col>

            <Col xs={24} lg={12}>
              <Card title="Diamond Quality (GIA Standard)" size="small" style={{ borderRadius: 8 }}>
                <DiamondReadOnly queryKey="diamond-quality" fetchFn={masterExtApi.getDiamondQuality}
                  cols={['Quality_Code','Quality_Name']} rowKey="Quality_ID" />
              </Card>
              <Card title="Diamond Color (GIA Standard)" size="small" style={{ borderRadius: 8, marginTop: 12 }}>
                <DiamondReadOnly queryKey="diamond-color" fetchFn={masterExtApi.getDiamondColor}
                  cols={['Color_Code','Color_Name']} rowKey="Color_ID" />
              </Card>
            </Col>

            <Col xs={24} lg={12}>
              <Card title="Diamond Shape" size="small" style={{ borderRadius: 8 }}>
                <DiamondReadOnly queryKey="diamond-shape" fetchFn={masterExtApi.getDiamondShape}
                  cols={['Shape_Code','Shape_Name']} rowKey="Shape_ID" />
              </Card>
            </Col>
          </Row>
        </TabPane>

        {/* ════════════════════════════════════════════════════════
            TAB 4 — PEOPLE MASTERS (Vendor, Karigar, Supplier)
            ════════════════════════════════════════════════════════ */}
        <TabPane tab={<span><TeamOutlined /> People Masters</span>} key="people">
          <Alert
            message="Karigars and Suppliers are added here. They appear in Karigar Issue, Purchase Entry, and Stock screens."
            type="info" showIcon style={{ marginBottom: 12 }}
          />
          <Card title="Karigar / Goldsmith / Vendor Master" size="small" style={{ borderRadius: 8 }}>
            <VendorSection />
          </Card>
        </TabPane>

        {/* ════════════════════════════════════════════════════════
            TAB 5 — SHOP SETUP (Floor, Counter, Branch)
            ════════════════════════════════════════════════════════ */}
        <TabPane tab={<span><ShopOutlined /> Shop Setup</span>} key="shop">
          <Row gutter={[16, 16]}>
            <Col xs={24} lg={12}>
              <Card title="Branch Master" size="small" style={{ borderRadius: 8 }}>
                <BranchSection />
              </Card>
            </Col>
            <Col xs={24} lg={12}>
              <Card title="Floor & Counter Master" size="small" style={{ borderRadius: 8 }}>
                <Alert message="Go to Floor Management → Floors & Counters to manage floors and counters for each branch." type="info" showIcon />
                <Button style={{ marginTop: 8 }} onClick={() => window.location.href = '/floors'}>
                  Open Floor Management →
                </Button>
              </Card>
            </Col>
          </Row>
        </TabPane>

        {/* ════════════════════════════════════════════════════════
            TAB 6 — BILLING MASTERS (Tax, Payment Mode)
            ════════════════════════════════════════════════════════ */}
        <TabPane tab={<span><DollarOutlined /> Billing Masters</span>} key="billing">
          <Row gutter={[16, 16]}>
            <Col xs={24} lg={14}>
              <Card title="Payment Modes" size="small" style={{ borderRadius: 8 }}>
                <Alert
                  message="These are the payment modes available at POS checkout. By default: Cash, UPI, Card, NEFT, RTGS, IMPS, Cheque, Bank Transfer."
                  type="info" showIcon style={{ marginBottom: 12, fontSize: 12 }}
                />
                <Table
            scroll={{ x: "max-content" }} size="small" pagination={false}
                  dataSource={[
                    { mode: 'Cash', type: 'Immediate', ledger: 'Cash Book', active: true },
                    { mode: 'UPI (PhonePe / GPay / Paytm)', type: 'Immediate', ledger: 'Bank Book', active: true },
                    { mode: 'Debit Card', type: 'Immediate', ledger: 'Bank Book', active: true },
                    { mode: 'Credit Card', type: 'Immediate', ledger: 'Bank Book', active: true },
                    { mode: 'NEFT / RTGS / IMPS', type: 'Next Day', ledger: 'Bank Book', active: true },
                    { mode: 'Cheque', type: 'On Clearing', ledger: 'Bank Book', active: true },
                    { mode: 'Gift Voucher', type: 'Immediate', ledger: 'Voucher Ledger', active: true },
                    { mode: 'Scheme Adjustment', type: 'Immediate', ledger: 'Scheme Ledger', active: true },
                    { mode: 'Advance Adjustment', type: 'Immediate', ledger: 'Customer Ledger', active: true },
                    { mode: 'Loyalty Points', type: 'Immediate', ledger: 'Customer Ledger', active: true },
                  ]}
                  rowKey="mode"
                  columns={[
                    { title: 'Payment Mode', dataIndex: 'mode', render: v => <Text strong>{v}</Text> },
                    { title: 'Settlement', dataIndex: 'type' },
                    { title: 'Ledger', dataIndex: 'ledger', render: v => <Tag color="blue">{v}</Tag> },
                    { title: 'Status', dataIndex: 'active', render: v => <Tag color="green">Active</Tag> },
                  ]}
                />
              </Card>
            </Col>
            <Col xs={24} lg={10}>
              <Card title="Tax Type / HSN Master" size="small" style={{ borderRadius: 8 }}>
                {/* Was a hardcoded, non-editable sample table before —
                    tbl_hsn_master and its GET/POST routes (compliance.js)
                    already existed and worked, just never reachable from
                    any master screen. Real CRUD now, not a display-only
                    reference list. */}
                <MasterSection
                  title="HSN / Tax Type" hint="Every item type's HSN Code should match one of these — GST % here drives billing."
                  queryKey="hsn-master" fetchFn={complianceApi.getHsn} createFn={complianceApi.createHsn}
                  rowKey="HSN_ID"
                  fields={[
                    { name: 'HSN_Code', label: 'HSN Code', required: true, placeholder: '7113' },
                    { name: 'Description', label: 'Description', placeholder: 'Gold Jewellery' },
                    { name: 'GST_Percentage', label: 'GST %', type: 'number', default: 3, step: 0.5 },
                    { name: 'Is_Active', label: 'Active', type: 'boolean', default: true, showInTable: false },
                  ]}
                />
                <Alert message="GST rates for jewellery are fixed by GST law — this is a reference master for HSN-wise billing, not a place to invent new rates." type="warning" showIcon style={{ marginTop: 8, fontSize: 11 }} />
              </Card>
            </Col>
          </Row>
        </TabPane>

        <TabPane tab={<span><SettingOutlined /> Operations Masters</span>} key="operations">
          <Row gutter={[16, 16]}>
            <Col xs={24} lg={12}>
              <Card title="Repair Category" size="small" style={{ borderRadius: 8 }}>
                <MasterSection
                  title="Repair Category" hint="Categorizes repair job cards (Polishing, Sizing, Stone Setting, ...) with an optional default charge."
                  queryKey="repair-category-master" fetchFn={simpleMastersApi.getRepairCategories}
                  createFn={simpleMastersApi.createRepairCategory} updateFn={simpleMastersApi.updateRepairCategory}
                  rowKey="Category_ID"
                  fields={[
                    { name: 'Category_Name', label: 'Category Name', required: true, placeholder: 'Stone Setting' },
                    { name: 'Description', label: 'Description', type: 'textarea', showInTable: false },
                    { name: 'Default_Charge', label: 'Default Charge (₹)', type: 'number', step: 10 },
                    { name: 'Is_Active', label: 'Active', type: 'boolean', default: true, showInTable: false },
                  ]}
                />
              </Card>
            </Col>
            <Col xs={24} lg={12}>
              <Card title="Size / Length Master" size="small" style={{ borderRadius: 8 }}>
                <MasterSection
                  title="Size" hint="Standardized sizes for Ring, Chain, Bangle, Bracelet — used for size-wise stock and order entry."
                  queryKey="size-master" fetchFn={simpleMastersApi.getSizes}
                  createFn={simpleMastersApi.createSize} updateFn={simpleMastersApi.updateSize}
                  rowKey="Size_ID"
                  fields={[
                    { name: 'Size_Type', label: 'Type', type: 'select', required: true, options: ['Ring', 'Chain', 'Bangle', 'Bracelet'] },
                    { name: 'Size_Code', label: 'Size Code', required: true, placeholder: '16' },
                    { name: 'Size_Value_MM', label: 'Value (mm)', type: 'number', step: 0.1 },
                    { name: 'Description', label: 'Description', showInTable: false },
                    { name: 'Is_Active', label: 'Active', type: 'boolean', default: true, showInTable: false },
                  ]}
                />
              </Card>
            </Col>
            <Col xs={24} lg={12}>
              <Card title="Item Weight Range" size="small" style={{ borderRadius: 8 }}>
                <MasterSection
                  title="Weight Range" hint="Buckets stock by weight band (e.g. 0–5g, 5–10g) for reports and quick filtering."
                  queryKey="item-weight-range-master" fetchFn={simpleMastersApi.getItemWeightRanges}
                  createFn={simpleMastersApi.createItemWeightRange} updateFn={simpleMastersApi.updateItemWeightRange}
                  rowKey="Range_ID"
                  fields={[
                    { name: 'Range_Name', label: 'Range Name', required: true, placeholder: '0-5g' },
                    { name: 'Weight_From', label: 'From (g)', type: 'number', step: 0.1, required: true },
                    { name: 'Weight_To', label: 'To (g)', type: 'number', step: 0.1 },
                    { name: 'Is_Active', label: 'Active', type: 'boolean', default: true, showInTable: false },
                  ]}
                />
              </Card>
            </Col>
            <Col xs={24} lg={12}>
              <Card title="Cost Centre" size="small" style={{ borderRadius: 8 }}>
                <MasterSection
                  title="Cost Centre" hint="Tags expenses/production costs to a branch/department for cost-centre-wise reporting."
                  queryKey="cost-centre-master" fetchFn={simpleMastersApi.getCostCentres}
                  createFn={simpleMastersApi.createCostCentre} updateFn={simpleMastersApi.updateCostCentre}
                  rowKey="Centre_ID"
                  fields={[
                    { name: 'Centre_Code', label: 'Code', required: true, placeholder: 'CC-01' },
                    { name: 'Centre_Name', label: 'Name', required: true, placeholder: 'Workshop Floor' },
                    { name: 'Description', label: 'Description', type: 'textarea', showInTable: false },
                    { name: 'Is_Active', label: 'Active', type: 'boolean', default: true, showInTable: false },
                  ]}
                />
              </Card>
            </Col>
            <Col xs={24} lg={12}>
              <Card title="Purchase Rate Type" size="small" style={{ borderRadius: 8 }}>
                <MasterSection
                  title="Purchase Rate Type" hint="Labels the rate basis used on a purchase entry (Market Rate, Fixed Rate, Negotiated, ...)."
                  queryKey="purchase-rate-type-master" fetchFn={simpleMastersApi.getPurchaseRateTypes}
                  createFn={simpleMastersApi.createPurchaseRateType} updateFn={simpleMastersApi.updatePurchaseRateType}
                  rowKey="Type_ID"
                  fields={[
                    { name: 'Type_Name', label: 'Type Name', required: true, placeholder: 'Market Rate' },
                    { name: 'Description', label: 'Description', showInTable: false },
                    { name: 'Is_Active', label: 'Active', type: 'boolean', default: true, showInTable: false },
                  ]}
                />
              </Card>
            </Col>
            <Col xs={24} lg={12}>
              <Card title="Design-wise Reorder Level" size="small" style={{ borderRadius: 8 }}>
                <Alert message="Sets a per-design reorder threshold for this shop — separate from each item's own Min Stock Level. Designs with no override shown here use a default of 5." type="info" showIcon style={{ marginBottom: 8, fontSize: 12 }} />
                <DesignReorderLevelSection />
              </Card>
            </Col>
          </Row>
        </TabPane>

      </Tabs>
      </div>

      <PageTour steps={tourSteps} />
    </div>
  );
}

// ── Design-wise Reorder Level (tenant override on the global Design master) ──
function DesignReorderLevelSection() {
  const [editing, setEditing] = useState(null); // { Design_ID, Design_Code, Reorder_Level }
  const [value, setValue] = useState(5);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['design-reorder-level'],
    queryFn: () => simpleMastersApi.getDesignReorderLevels().then(r => r.data.data),
  });

  const saveMutation = useMutation({
    mutationFn: () => simpleMastersApi.updateDesignReorderLevel(editing.Design_ID, { Reorder_Level: value }),
    onSuccess: () => { message.success('Reorder level updated.'); qc.invalidateQueries(['design-reorder-level']); setEditing(null); },
    onError: (err) => message.error(err.response?.data?.message || 'Failed to update.'),
  });

  return (
    <>
      <Table
        scroll={{ x: 'max-content' }} size="small" dataSource={data || []} rowKey="Design_ID" loading={isLoading}
        pagination={{ pageSize: 8, size: 'small' }}
        columns={[
          { title: 'Design Code', dataIndex: 'Design_Code' },
          { title: 'Design Name', dataIndex: 'Design_Name' },
          { title: 'Reorder Level', dataIndex: 'Reorder_Level', render: (v) => <Tag color="blue">{v}</Tag> },
          {
            title: '', width: 40,
            render: (_, row) => (
              <Button size="small" type="text" icon={<EditOutlined />}
                onClick={() => { setEditing(row); setValue(row.Reorder_Level); }} />
            ),
          },
        ]}
      />
      <Modal
        title={`Reorder Level — ${editing?.Design_Code || ''}`}
        open={!!editing} onCancel={() => setEditing(null)} onOk={() => saveMutation.mutate()}
        confirmLoading={saveMutation.isPending}
      >
        <InputNumber style={{ width: '100%' }} min={0} value={value} onChange={setValue} addonAfter="pieces" />
      </Modal>
    </>
  );
}

// ── Read-only diamond master table ────────────────────────────────────────────
function DiamondReadOnly({ queryKey, fetchFn, cols, rowKey }) {
  const { data, isLoading } = useQuery({ queryKey: [queryKey], queryFn: () => fetchFn().then(r => r.data.data) });
  return (
    <Table
            scroll={{ x: "max-content" }} size="small" dataSource={data || []} rowKey={rowKey} loading={isLoading}
      columns={cols.map(c => ({ title: c.replace(/_/g,' '), dataIndex: c }))}
      pagination={false}
    />
  );
}

// ── Vendor / Karigar section ──────────────────────────────────────────────────
function VendorSection() {
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();
  const qc = useQueryClient();

  const { data: vendors, isLoading } = useQuery({
    queryKey: ['vendors-all'],
    queryFn: () => karigarApi.getVendors().then(r => r.data.data),
  });

  const createMutation = useMutation({
    mutationFn: (d) => karigarApi.createVendor(d),
    onSuccess: () => { message.success('Added!'); qc.invalidateQueries(['vendors-all']); setOpen(false); form.resetFields(); },
    onError: (err) => message.error(err.response?.data?.message || 'Failed.'),
  });

  const columns = [
    { title: 'Code', dataIndex: 'Vendor_Code', render: v => <Text code style={{ fontSize: 11 }}>{v}</Text>, width: 100 },
    { title: 'Name', dataIndex: 'Vendor_Name', render: v => <Text strong>{v}</Text> },
    { title: 'Type', dataIndex: 'Vendor_Type', render: v => <Tag color={v==='Karigar'?'orange':v==='Supplier'?'blue':'purple'}>{v}</Tag> },
    { title: 'Mobile', dataIndex: 'Mobile_1', width: 120 },
    { title: 'Skill', dataIndex: 'Karigar_Skill', render: v => v || '-', width: 80 },
    { title: 'Status', dataIndex: 'Is_Active', render: v => <Tag color={v?'green':'red'}>{v?'Active':'Inactive'}</Tag>, width: 80 },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
        <Button type="primary" size="small" icon={<PlusOutlined />}
          style={{ background: '#B8860B', borderColor: '#B8860B' }} onClick={() => setOpen(true)}>
          Add Karigar / Supplier
        </Button>
      </div>
      <Table
            scroll={{ x: "max-content" }} size="small" dataSource={vendors || []} rowKey="Vendor_ID" loading={isLoading}
        columns={columns} pagination={{ pageSize: 10 }} />
      <Modal title="Add Karigar / Supplier / Goldsmith" open={open}
        onCancel={() => { setOpen(false); form.resetFields(); }} footer={null}>
        <Form form={form} layout="vertical" onFinish={v => createMutation.mutate(v)}>
          <Form.Item name="Vendor_Name" label="Name" rules={[{ required: true }]}><Input placeholder="Raju Kumar / ABC Gold Pvt Ltd" /></Form.Item>
          <Form.Item name="Vendor_Type" label="Type" rules={[{ required: true }]}>
            <Select>
              <Option value="Karigar">Karigar (Goldsmith — makes jewellery)</Option>
              <Option value="Supplier">Supplier (sells gold/jewellery to you)</Option>
              <Option value="Both">Both</Option>
            </Select>
          </Form.Item>
          <Form.Item name="Mobile_1" label="Mobile" rules={[{ required: true }]}><Input /></Form.Item>
          <Row gutter={12}>
            <Col xs={12}><Form.Item name="Karigar_Skill" label="Skill (for Karigar)">
              <Select allowClear><Option value="Gold">Gold</Option><Option value="Silver">Silver</Option><Option value="Diamond">Diamond</Option><Option value="All">All Metals</Option></Select>
            </Form.Item></Col>
            <Col xs={12}><Form.Item name="Karigar_Wastage_Allowed_Percent" label="Wastage Allowed %"><InputNumber style={{ width: '100%' }} min={0} max={20} step={0.5} /></Form.Item></Col>
          </Row>
          <Form.Item name="Bank_Account_No" label="Bank Account"><Input placeholder="For karigar payment transfer" /></Form.Item>
          <Form.Item name="IFSC_Code" label="IFSC Code"><Input /></Form.Item>
          <Button type="primary" htmlType="submit" block loading={createMutation.isPending}
            style={{ background: '#B8860B', borderColor: '#B8860B' }}>Save</Button>
        </Form>
      </Modal>
    </div>
  );
}

// ── Branch section ─────────────────────────────────────────────────────────────
function BranchSection() {
  const { data: branches, isLoading } = useQuery({
    queryKey: ['branches'],
    queryFn: () => tenantApi.getBranches().then(r => r.data.data),
  });
  return (
    <div>
      <Alert message="Branches are created by Super Admin. Contact Super Admin to add new branches." type="info" showIcon style={{ marginBottom: 8 }} />
      <Table
            scroll={{ x: "max-content" }} size="small" dataSource={branches || []} rowKey="Branch_ID" loading={isLoading}
        pagination={false}
        columns={[
          { title: 'Branch ID', dataIndex: 'Branch_ID', render: v => <Text code>{v}</Text> },
          { title: 'Branch Name', dataIndex: 'Branch_Name', render: v => <Text strong>{v}</Text> },
          { title: 'City', dataIndex: 'City' },
          { title: 'Head Office', dataIndex: 'Is_Head_Office', render: v => v ? <Tag color="gold">HO</Tag> : '' },
          { title: 'Status', dataIndex: 'Is_Active', render: v => <Tag color={v?'green':'red'}>{v?'Active':'Inactive'}</Tag> },
        ]}
      />
    </div>
  );
}
