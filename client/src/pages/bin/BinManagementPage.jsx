/**
 * BinManagementPage — Master Bin Module
 * 4 tabs: Purchase Bin | Sales Return Bin | Order Bin | Pure Gold Bin
 * Plus a dashboard summary + universal voucher search
 */
import React, { useState, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Tabs, Table, Button, Input, Select, Tag, Space, Card, Row, Col,
  Statistic, Modal, Form, InputNumber, DatePicker, message, Popconfirm,
  Drawer, Descriptions, Badge, Typography, Tooltip, Alert, Steps,
} from 'antd';
import {
  PlusOutlined, SearchOutlined, CheckCircleOutlined, ArrowRightOutlined,
  PrinterOutlined, EditOutlined, EyeOutlined, ReloadOutlined,
  ShoppingOutlined, UndoOutlined, FileTextOutlined, GoldOutlined,
  BarcodeOutlined, SyncOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { binApi } from '../../api/modules';
import PageTour from '../../components/PageTour';
import { useModules } from '../../hooks/useModules';
import { METAL_TYPES } from '../../utils/metalTypes';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { Option } = Select;

const fmt = (v) => `₹${parseFloat(v||0).toLocaleString('en-IN')}`;
const fmtW = (v) => `${parseFloat(v||0).toFixed(3)}g`;

// ── Status color map ─────────────────────────────────────────────────────────
const STATUS_COLOR = {
  Pending: 'orange', Inspected: 'blue', Approved: 'cyan',
  Moved_To_Stock: 'green', Rejected: 'red',
  Received: 'orange', Barcode_Generated: 'blue', Refunded: 'purple', Exchanged: 'green',
  In_Progress: 'blue', Manufacturing: 'purple', Ready: 'cyan',
  Delivered: 'green', Cancelled: 'red',
  Holding: 'gold', For_Manufacturing: 'blue', Sold: 'green', Transferred: 'purple',
};

// ── Voucher ID badge ─────────────────────────────────────────────────────────
const VoucherBadge = ({ id }) => (
  <Text code style={{ fontSize: 11, color: '#B8860B', fontWeight: 700 }}>{id}</Text>
);

// ── Dashboard summary cards ───────────────────────────────────────────────────
// `enabled` gates which cards render at all — a tenant that turned Pure
// Gold Bin off in Module Management shouldn't see a card for it here
// either, not just lose the sidebar shortcut to it.
function BinDashboard({ enabled }) {
  const { data, isLoading } = useQuery({
    queryKey: ['bin-dashboard'],
    queryFn: () => binApi.getDashboard().then(r => r.data.data),
    refetchInterval: 30000,
  });
  const p  = data?.purchase     || {};
  const sr = data?.sales_return || {};
  const o  = data?.orders       || {};
  const pg = data?.pure_gold    || {};

  const cards = [
    { key: 'bin_purchase',     title: 'Purchase Bin', icon: '📦', total: p.total, sub: `${p.pending} pending · ${p.stocked} stocked`, color: '#B8860B' },
    { key: 'bin_sales_return', title: 'Sales Return', icon: '↩️', total: sr.total, sub: `${sr.pending} received · ${sr.stocked} stocked`, color: '#1890ff' },
    { key: 'bin_orders',       title: 'Order Bin',    icon: '📋', total: o.total,  sub: `${o.pending} pending · ${o.ready} ready`, color: '#722ed1' },
    { key: 'bin_pure_gold',    title: 'Pure Gold',    icon: '🥇', total: pg.total, sub: `${fmtW(pg.holding_weight)} holding`, color: '#52c41a' },
  ].filter(c => enabled[c.key]);
  return (
    <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
      {cards.map((c, i) => (
        <Col xs={12} sm={6} key={i}>
          <Card className="kpi-card" bodyStyle={{ padding: '14px 16px' }}
            style={{ borderRadius: 10, borderTop: `3px solid ${c.color}`, boxShadow: '0 1px 4px rgba(0,0,0,.07)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <Text style={{ fontSize: 11, color: '#888' }}>{c.icon} {c.title}</Text>
                <div style={{ fontSize: 22, fontWeight: 800, color: c.color }}>{c.total || 0}</div>
                <Text style={{ fontSize: 11, color: '#aaa' }}>{c.sub}</Text>
              </div>
            </div>
          </Card>
        </Col>
      ))}
    </Row>
  );
}

// ── Universal Voucher Search ──────────────────────────────────────────────────
function VoucherSearch() {
  const [q, setQ] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const search = async () => {
    if (!q.trim()) return;
    setLoading(true);
    try {
      const res = await binApi.getVoucher(q.trim());
      setResult(res.data.data);
    } catch {
      message.error('Voucher not found.');
      setResult(null);
    } finally { setLoading(false); }
  };

  return (
    <Card className="erp-card" style={{ marginBottom: 16 }} bodyStyle={{ padding: '14px 16px' }}>
      <Space.Compact style={{ width: '100%', maxWidth: 480 }}>
        <Input
          prefix={<SearchOutlined style={{ color: '#B8860B' }} />}
          placeholder="Search by Voucher ID  e.g. PUR-20260709-00001"
          value={q}
          onChange={e => setQ(e.target.value.toUpperCase())}
          onPressEnter={search}
          style={{ fontFamily: 'monospace' }}
        />
        <Button type="primary" loading={loading} onClick={search}
          style={{ background: '#B8860B', border: 'none' }}>Search</Button>
      </Space.Compact>

      {result && (
        <div style={{ marginTop: 12 }}>
          <Descriptions bordered size="small" column={{ xs: 1, sm: 2 }}>
            <Descriptions.Item label="Voucher ID"><VoucherBadge id={result.voucher?.Voucher_ID} /></Descriptions.Item>
            <Descriptions.Item label="Type"><Tag>{result.voucher?.Voucher_Type}</Tag></Descriptions.Item>
            <Descriptions.Item label="Status"><Tag color={result.voucher?.Status === 'Active' ? 'blue' : 'green'}>{result.voucher?.Status}</Tag></Descriptions.Item>
            <Descriptions.Item label="Description">{result.voucher?.Description}</Descriptions.Item>
            <Descriptions.Item label="Created">{dayjs(result.voucher?.Created_Date).format('DD-MMM-YYYY HH:mm')}</Descriptions.Item>
            {result.ornament && <Descriptions.Item label="In Stock"><Tag color="green">Article: {result.ornament.Article_Number}</Tag></Descriptions.Item>}
          </Descriptions>
        </div>
      )}
    </Card>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// PURCHASE BIN TAB
// ════════════════════════════════════════════════════════════════════════════
function PurchaseBinTab() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState({ status: '', search: '', page: 1 });
  const [modalOpen, setModalOpen] = useState(false);
  const [editRow, setEditRow] = useState(null);
  const [moveModal, setMoveModal] = useState(null);
  const [moveForm] = Form.useForm();
  const [form] = Form.useForm();

  const { data, isLoading } = useQuery({
    queryKey: ['bin-purchase', filter],
    queryFn: () => binApi.getPurchase(filter).then(r => r.data.data),
  });

  const saveMut = useMutation({
    mutationFn: d => editRow ? binApi.updatePurchase(editRow.Bin_ID, d) : binApi.createPurchase(d),
    onSuccess: (res) => {
      message.success(editRow ? 'Updated.' : `Entry created. Voucher: ${res.data.data?.Voucher_ID}`);
      qc.invalidateQueries(['bin-purchase']); qc.invalidateQueries(['bin-dashboard']);
      setModalOpen(false); form.resetFields(); setEditRow(null);
    },
    onError: e => message.error(e.response?.data?.message || 'Failed.'),
  });

  const approveMut = useMutation({
    mutationFn: id => binApi.approvePurchase(id),
    onSuccess: () => { message.success('Approved.'); qc.invalidateQueries(['bin-purchase']); },
  });

  const moveMut = useMutation({
    mutationFn: ({ id, data }) => binApi.movePurchaseToStock(id, data),
    onSuccess: (res) => {
      message.success(`Moved to stock! Article: ${res.data.data?.articleNumber}`);
      qc.invalidateQueries(['bin-purchase']); qc.invalidateQueries(['bin-dashboard']);
      setMoveModal(null); moveForm.resetFields();
    },
    onError: e => message.error(e.response?.data?.message || 'Failed.'),
  });

  const openEdit = (row) => { setEditRow(row); form.setFieldsValue({ ...row, Purchase_Date: dayjs(row.Purchase_Date) }); setModalOpen(true); };

  const columns = [
    { title: 'Voucher ID', dataIndex: 'Voucher_ID', width: 180, render: v => <VoucherBadge id={v} /> },
    { title: 'Date',        dataIndex: 'Purchase_Date', width: 100, render: v => dayjs(v).format('DD-MMM-YY') },
    { title: 'Supplier',    dataIndex: 'Supplier_Name', ellipsis: true },
    { title: 'Category',    dataIndex: 'Item_Category', render: v => v || '-' },
    { title: 'Purity',      dataIndex: 'Purity',        width: 60 },
    { title: 'Gross Wt',    dataIndex: 'Gross_Weight',  width: 90,  render: v => fmtW(v) },
    { title: 'Amount',      dataIndex: 'Purchase_Amount', width: 110, render: v => fmt(v) },
    { title: 'Status',      dataIndex: 'Status',        width: 120, render: v => <Tag color={STATUS_COLOR[v]}>{v}</Tag> },
    {
      title: 'Actions', width: 180, render: (_, r) => (
        <Space size={4}>
          <Tooltip title="Edit"><Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} /></Tooltip>
          {r.Status === 'Pending' && (
            <Tooltip title="Approve">
              <Button size="small" type="primary" icon={<CheckCircleOutlined />} ghost
                onClick={() => approveMut.mutate(r.Bin_ID)} />
            </Tooltip>
          )}
          {(r.Status === 'Approved' || r.Status === 'Inspected') && (
            <Tooltip title="Move to Stock">
              <Button size="small" type="primary" icon={<ArrowRightOutlined />}
                style={{ background: '#52c41a', border: 'none' }}
                onClick={() => { setMoveModal(r); moveForm.resetFields(); }} />
            </Tooltip>
          )}
        </Space>
      ),
    },
  ];

  return (
    <>
      <Space style={{ marginBottom: 12 }} wrap>
        <Input.Search placeholder="Search voucher / supplier..." style={{ width: 260 }} allowClear
          onSearch={v => setFilter(f => ({ ...f, search: v, page: 1 }))}
          onChange={e => !e.target.value && setFilter(f => ({ ...f, search: '' }))} />
        <Select value={filter.status} onChange={v => setFilter(f => ({ ...f, status: v, page: 1 }))} style={{ width: 150 }}
          options={[{ value: '', label: 'All Status' }, ...['Pending','Inspected','Approved','Moved_To_Stock','Rejected'].map(s => ({ value: s, label: s }))]} />
        <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditRow(null); form.resetFields(); setModalOpen(true); }}
          style={{ background: '#B8860B', border: 'none' }}>Add Purchase</Button>
        <Button icon={<ReloadOutlined />} onClick={() => qc.invalidateQueries(['bin-purchase'])} />
      </Space>

      <div className="table-responsive">
        <Table className="erp-table" columns={columns} dataSource={data?.items || []} rowKey="Bin_ID"
          loading={isLoading} size="small" scroll={{ x: 900 }}
          pagination={{ total: data?.total, pageSize: 50, current: filter.page,
            onChange: p => setFilter(f => ({ ...f, page: p })), showTotal: t => `${t} entries` }} />
      </div>

      {/* Add/Edit Modal */}
      <Modal title={editRow ? `Edit — ${editRow.Voucher_ID}` : '📦 New Purchase Bin Entry'}
        open={modalOpen} onCancel={() => { setModalOpen(false); setEditRow(null); form.resetFields(); }}
        footer={null} width={620} destroyOnClose>
        <Form form={form} layout="vertical" onFinish={saveMut.mutate} style={{ marginTop: 12 }}>
          <Row gutter={[12, 0]}>
            <Col xs={24} sm={12}>
              <Form.Item name="Purchase_Date" label="Purchase Date" rules={[{ required: true }]}>
                <DatePicker style={{ width: '100%' }} format="DD-MMM-YYYY" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="Source_Type" label="Source Type" initialValue="Supplier">
                <Select options={['Supplier','Karigar','Manufacturer','Vendor'].map(s => ({ value: s, label: s }))} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="Supplier_Name" label="Supplier / Karigar Name" rules={[{ required: true }]}>
                <Input placeholder="Name" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="Supplier_Mobile" label="Mobile">
                <Input placeholder="10-digit" maxLength={10} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="Item_Category" label="Item Category">
                <Input placeholder="e.g. Necklace, Bangles" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="Metal_Type" label="Metal Type" initialValue="Gold">
                <Select options={METAL_TYPES.map(m => ({ value: m, label: m }))} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="Purity" label="Purity">
                <Select options={['24K','22K','18K','14K','Silver','Other'].map(s => ({ value: s, label: s }))} allowClear />
              </Form.Item>
            </Col>
            <Col xs={24} sm={8}>
              <Form.Item name="Gross_Weight" label="Gross Weight (g)" rules={[{ required: true }]}>
                <InputNumber style={{ width: '100%' }} min={0.001} step={0.001} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={8}>
              <Form.Item name="Net_Weight" label="Net Weight (g)">
                <InputNumber style={{ width: '100%' }} min={0} step={0.001} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={8}>
              <Form.Item name="Stone_Weight" label="Stone Weight (g)">
                <InputNumber style={{ width: '100%' }} min={0} step={0.001} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={8}>
              <Form.Item name="Purchase_Rate" label="Rate (₹/g)">
                <InputNumber style={{ width: '100%' }} min={0} prefix="₹" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={8}>
              <Form.Item name="Purchase_Amount" label="Total Amount (₹)" rules={[{ required: true }]}>
                <InputNumber style={{ width: '100%' }} min={1} prefix="₹" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={8}>
              <Form.Item name="Making_Charge" label="Making Charge (₹)">
                <InputNumber style={{ width: '100%' }} min={0} prefix="₹" />
              </Form.Item>
            </Col>
            <Col xs={24}>
              <Form.Item name="Remarks" label="Remarks">
                <Input.TextArea rows={2} />
              </Form.Item>
            </Col>
          </Row>
          <Button type="primary" htmlType="submit" block size="large" loading={saveMut.isPending}
            style={{ background: '#B8860B', border: 'none', fontWeight: 700 }}>
            {editRow ? 'Update Entry' : 'Create Purchase Bin Entry'}
          </Button>
        </Form>
      </Modal>

      {/* Move to Stock Modal */}
      <Modal title={`Move to Stock — ${moveModal?.Voucher_ID}`} open={!!moveModal}
        onCancel={() => setMoveModal(null)} footer={null} width={440} destroyOnClose>
        <Alert message="This will create an ornament record in inventory with this bin entry's data." type="info" showIcon style={{ marginBottom: 16 }} />
        <Form form={moveForm} layout="vertical" onFinish={d => moveMut.mutate({ id: moveModal?.Bin_ID, data: d })}>
          <Form.Item name="Gold_Rate" label="Current Gold Rate (₹/g)" rules={[{ required: true }]}>
            <InputNumber style={{ width: '100%' }} size="large" min={1000} step={10} prefix="₹" />
          </Form.Item>
          <Form.Item name="Article_Number" label="Article Number (auto-generated if empty)">
            <Input placeholder="Leave blank for auto" style={{ fontFamily: 'monospace' }} />
          </Form.Item>
          <Button type="primary" htmlType="submit" block size="large" loading={moveMut.isPending}
            style={{ background: '#52c41a', border: 'none', fontWeight: 700 }}>
            <ArrowRightOutlined /> Move to Inventory Stock
          </Button>
        </Form>
      </Modal>
    </>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// SALES RETURN BIN TAB
// ════════════════════════════════════════════════════════════════════════════
function SalesReturnBinTab() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState({ status: '', search: '', page: 1 });
  const [modalOpen, setModalOpen] = useState(false);
  const [editRow, setEditRow] = useState(null);
  const [moveModal, setMoveModal] = useState(null);
  const [moveForm] = Form.useForm();
  const [form] = Form.useForm();

  const { data, isLoading } = useQuery({
    queryKey: ['bin-sales-return', filter],
    queryFn: () => binApi.getSalesReturn(filter).then(r => r.data.data),
  });

  const saveMut = useMutation({
    mutationFn: d => editRow ? binApi.updateSalesReturn(editRow.Return_ID, d) : binApi.createSalesReturn(d),
    onSuccess: (res) => {
      message.success(editRow ? 'Updated.' : `Return logged. Voucher: ${res.data.data?.Voucher_ID}`);
      qc.invalidateQueries(['bin-sales-return']); qc.invalidateQueries(['bin-dashboard']);
      setModalOpen(false); form.resetFields(); setEditRow(null);
    },
    onError: e => message.error(e.response?.data?.message || 'Failed.'),
  });

  const moveMut = useMutation({
    mutationFn: ({ id, data }) => binApi.moveSalesReturnToStock(id, data),
    onSuccess: (res) => {
      message.success(`Re-stocked! Article: ${res.data.data?.articleNumber}`);
      qc.invalidateQueries(['bin-sales-return']); qc.invalidateQueries(['bin-dashboard']);
      setMoveModal(null); moveForm.resetFields();
    },
    onError: e => message.error(e.response?.data?.message || 'Failed.'),
  });

  const openEdit = (row) => { setEditRow(row); form.setFieldsValue({ ...row, Return_Date: dayjs(row.Return_Date) }); setModalOpen(true); };

  const columns = [
    { title: 'Voucher ID',  dataIndex: 'Voucher_ID',              width: 180, render: v => <VoucherBadge id={v} /> },
    { title: 'Date',        dataIndex: 'Return_Date',             width: 100, render: v => dayjs(v).format('DD-MMM-YY') },
    { title: 'Customer',    dataIndex: 'Customer_Name',           ellipsis: true },
    { title: 'Invoice',     dataIndex: 'Original_Invoice_Number', width: 120, render: v => <Text code style={{ fontSize: 11 }}>{v || '-'}</Text> },
    { title: 'Reason',      dataIndex: 'Return_Reason',           width: 90 },
    { title: 'Gross Wt',    dataIndex: 'Gross_Weight',            width: 90,  render: v => fmtW(v) },
    { title: 'Inspection',  dataIndex: 'Inspection_Status',       width: 100, render: v => <Tag color={v==='Passed'?'green':v==='Failed'?'red':'orange'}>{v}</Tag> },
    { title: 'Status',      dataIndex: 'Status',                  width: 130, render: v => <Tag color={STATUS_COLOR[v]}>{v}</Tag> },
    {
      title: 'Actions', width: 130, render: (_, r) => (
        <Space size={4}>
          <Tooltip title="Edit"><Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} /></Tooltip>
          {r.Status !== 'Moved_To_Stock' && (
            <Tooltip title="Re-stock">
              <Button size="small" type="primary" icon={<ArrowRightOutlined />}
                style={{ background: '#52c41a', border: 'none' }}
                onClick={() => { setMoveModal(r); moveForm.resetFields(); }} />
            </Tooltip>
          )}
        </Space>
      ),
    },
  ];

  return (
    <>
      <Space style={{ marginBottom: 12 }} wrap>
        <Input.Search placeholder="Search voucher / customer / invoice..." style={{ width: 280 }} allowClear
          onSearch={v => setFilter(f => ({ ...f, search: v, page: 1 }))}
          onChange={e => !e.target.value && setFilter(f => ({ ...f, search: '' }))} />
        <Select value={filter.status} onChange={v => setFilter(f => ({ ...f, status: v, page: 1 }))} style={{ width: 160 }}
          options={[{ value: '', label: 'All Status' }, ...['Received','Inspected','Barcode_Generated','Moved_To_Stock','Refunded','Exchanged'].map(s => ({ value: s, label: s }))]} />
        <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditRow(null); form.resetFields(); setModalOpen(true); }}
          style={{ background: '#B8860B', border: 'none' }}>Log Return</Button>
        <Button icon={<ReloadOutlined />} onClick={() => qc.invalidateQueries(['bin-sales-return'])} />
      </Space>

      <div className="table-responsive">
        <Table className="erp-table" columns={columns} dataSource={data?.items || []} rowKey="Return_ID"
          loading={isLoading} size="small" scroll={{ x: 900 }}
          pagination={{ total: data?.total, pageSize: 50, current: filter.page,
            onChange: p => setFilter(f => ({ ...f, page: p })), showTotal: t => `${t} entries` }} />
      </div>

      <Modal title={editRow ? `Edit Return — ${editRow.Voucher_ID}` : '↩️ Log Sales Return'}
        open={modalOpen} onCancel={() => { setModalOpen(false); setEditRow(null); form.resetFields(); }}
        footer={null} width={600} destroyOnClose>
        <Form form={form} layout="vertical" onFinish={saveMut.mutate} style={{ marginTop: 12 }}>
          <Row gutter={[12, 0]}>
            <Col xs={24} sm={12}>
              <Form.Item name="Return_Date" label="Return Date" rules={[{ required: true }]}>
                <DatePicker style={{ width: '100%' }} format="DD-MMM-YYYY" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="Original_Invoice_Number" label="Original Invoice No">
                <Input placeholder="e.g. INV-2026-00123" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="Customer_Name" label="Customer Name" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="Customer_Mobile" label="Mobile">
                <Input maxLength={10} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="Item_Category" label="Item Category">
                <Input placeholder="e.g. Ring, Necklace" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="Metal_Type" label="Metal Type" initialValue="Gold">
                <Select options={METAL_TYPES.map(m => ({ value: m, label: m }))} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="Purity" label="Purity">
                <Select options={['24K','22K','18K','Silver'].map(s => ({ value: s, label: s }))} allowClear />
              </Form.Item>
            </Col>
            <Col xs={24} sm={8}>
              <Form.Item name="Gross_Weight" label="Gross Weight (g)" rules={[{ required: true }]}>
                <InputNumber style={{ width: '100%' }} min={0.001} step={0.001} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={8}>
              <Form.Item name="Return_Reason" label="Return Reason" initialValue="Design">
                <Select options={['Design','Size','Exchange','Upgrade','Defect','Other'].map(s => ({ value: s, label: s }))} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={8}>
              <Form.Item name="Inspection_Status" label="Inspection" initialValue="Pending">
                <Select options={['Pending','Passed','Failed'].map(s => ({ value: s, label: s }))} />
              </Form.Item>
            </Col>
            <Col xs={24}>
              <Form.Item name="Return_Notes" label="Notes">
                <Input.TextArea rows={2} />
              </Form.Item>
            </Col>
          </Row>
          <Button type="primary" htmlType="submit" block size="large" loading={saveMut.isPending}
            style={{ background: '#B8860B', border: 'none', fontWeight: 700 }}>
            {editRow ? 'Update Return' : 'Log Return Entry'}
          </Button>
        </Form>
      </Modal>

      <Modal title={`Re-stock — ${moveModal?.Voucher_ID}`} open={!!moveModal}
        onCancel={() => setMoveModal(null)} footer={null} width={420} destroyOnClose>
        <Alert message="Item will be added back to inventory with a new Article Number." type="info" showIcon style={{ marginBottom: 16 }} />
        <Form form={moveForm} layout="vertical" onFinish={d => moveMut.mutate({ id: moveModal?.Return_ID, data: d })}>
          <Form.Item name="Gold_Rate" label="Current Gold Rate (₹/g)" rules={[{ required: true }]}>
            <InputNumber style={{ width: '100%' }} size="large" min={1000} step={10} prefix="₹" />
          </Form.Item>
          <Form.Item name="Article_Number" label="New Article Number (auto if blank)">
            <Input placeholder="Leave blank for auto" style={{ fontFamily: 'monospace' }} />
          </Form.Item>
          <Button type="primary" htmlType="submit" block size="large" loading={moveMut.isPending}
            style={{ background: '#52c41a', border: 'none', fontWeight: 700 }}>
            <BarcodeOutlined /> Generate Barcode & Add to Stock
          </Button>
        </Form>
      </Modal>
    </>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// ORDER BIN TAB
// ════════════════════════════════════════════════════════════════════════════
function OrderBinTab() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState({ status: '', order_type: '', search: '', page: 1 });
  const [modalOpen, setModalOpen] = useState(false);
  const [editRow, setEditRow] = useState(null);
  const [form] = Form.useForm();

  const { data, isLoading } = useQuery({
    queryKey: ['bin-orders', filter],
    queryFn: () => binApi.getOrders(filter).then(r => r.data.data),
  });

  const saveMut = useMutation({
    mutationFn: d => editRow ? binApi.updateOrder(editRow.Order_ID, d) : binApi.createOrder(d),
    onSuccess: (res) => {
      message.success(editRow ? 'Updated.' : `Order created. Voucher: ${res.data.data?.Voucher_ID}`);
      qc.invalidateQueries(['bin-orders']); qc.invalidateQueries(['bin-dashboard']);
      setModalOpen(false); form.resetFields(); setEditRow(null);
    },
    onError: e => message.error(e.response?.data?.message || 'Failed.'),
  });

  const statusMut = useMutation({
    mutationFn: ({ id, status }) => binApi.updateOrderStatus(id, status),
    onSuccess: () => { message.success('Status updated.'); qc.invalidateQueries(['bin-orders']); },
  });

  const openEdit = (row) => {
    setEditRow(row);
    form.setFieldsValue({ ...row, Order_Date: dayjs(row.Order_Date), Due_Date: row.Due_Date ? dayjs(row.Due_Date) : null });
    setModalOpen(true);
  };

  const ORDER_STATUS = ['Pending','In_Progress','Manufacturing','Ready','Delivered','Cancelled'];

  const columns = [
    { title: 'Voucher ID', dataIndex: 'Voucher_ID',  width: 180, render: v => <VoucherBadge id={v} /> },
    { title: 'Date',       dataIndex: 'Order_Date',  width: 100, render: v => dayjs(v).format('DD-MMM-YY') },
    { title: 'Type',       dataIndex: 'Order_Type',  width: 90,  render: v => <Tag color={v==='Customer'?'blue':v==='Karigar'?'orange':'green'}>{v}</Tag> },
    { title: 'Party',      dataIndex: 'Party_Name',  ellipsis: true },
    { title: 'Item',       dataIndex: 'Item_Description', ellipsis: true, render: v => v || '-' },
    { title: 'Due Date',   dataIndex: 'Due_Date',    width: 100, render: v => v ? dayjs(v).format('DD-MMM-YY') : '-' },
    { title: 'Advance',    dataIndex: 'Advance_Amount', width: 100, render: v => v > 0 ? fmt(v) : '-' },
    { title: 'Status',     dataIndex: 'Status',      width: 130,
      render: (v, r) => (
        <Select size="small" value={v} style={{ width: 130 }}
          onChange={s => statusMut.mutate({ id: r.Order_ID, status: s })}
          options={ORDER_STATUS.map(s => ({ value: s, label: <Tag color={STATUS_COLOR[s]}>{s}</Tag> }))} />
      ),
    },
    {
      title: 'Actions', width: 70,
      render: (_, r) => (
        <Tooltip title="Edit">
          <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} />
        </Tooltip>
      ),
    },
  ];

  return (
    <>
      <Space style={{ marginBottom: 12 }} wrap>
        <Input.Search placeholder="Search voucher / party / item..." style={{ width: 260 }} allowClear
          onSearch={v => setFilter(f => ({ ...f, search: v, page: 1 }))}
          onChange={e => !e.target.value && setFilter(f => ({ ...f, search: '' }))} />
        <Select value={filter.status} onChange={v => setFilter(f => ({ ...f, status: v, page: 1 }))} style={{ width: 150 }}
          options={[{ value: '', label: 'All Status' }, ...ORDER_STATUS.map(s => ({ value: s, label: s }))]} />
        <Select value={filter.order_type} onChange={v => setFilter(f => ({ ...f, order_type: v, page: 1 }))} style={{ width: 130 }}
          options={[{ value: '', label: 'All Types' }, ...['Customer','Karigar','Supplier'].map(s => ({ value: s, label: s }))]} />
        <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditRow(null); form.resetFields(); setModalOpen(true); }}
          style={{ background: '#B8860B', border: 'none' }}>New Order</Button>
        <Button icon={<ReloadOutlined />} onClick={() => qc.invalidateQueries(['bin-orders'])} />
      </Space>

      <div className="table-responsive">
        <Table className="erp-table" columns={columns} dataSource={data?.items || []} rowKey="Order_ID"
          loading={isLoading} size="small" scroll={{ x: 950 }}
          pagination={{ total: data?.total, pageSize: 50, current: filter.page,
            onChange: p => setFilter(f => ({ ...f, page: p })), showTotal: t => `${t} orders` }} />
      </div>

      <Modal title={editRow ? `Edit Order — ${editRow.Voucher_ID}` : '📋 Create New Order'}
        open={modalOpen} onCancel={() => { setModalOpen(false); setEditRow(null); form.resetFields(); }}
        footer={null} width={640} destroyOnClose>
        <Form form={form} layout="vertical" onFinish={saveMut.mutate} style={{ marginTop: 12 }}>
          <Row gutter={[12, 0]}>
            <Col xs={24} sm={8}>
              <Form.Item name="Order_Date" label="Order Date" rules={[{ required: true }]}>
                <DatePicker style={{ width: '100%' }} format="DD-MMM-YYYY" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={8}>
              <Form.Item name="Order_Type" label="Order Type" initialValue="Customer" rules={[{ required: true }]}>
                <Select options={['Customer','Karigar','Supplier'].map(s => ({ value: s, label: s }))} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={8}>
              <Form.Item name="Due_Date" label="Due Date">
                <DatePicker style={{ width: '100%' }} format="DD-MMM-YYYY" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="Party_Name" label="Customer / Karigar / Supplier" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="Party_Mobile" label="Mobile">
                <Input maxLength={10} />
              </Form.Item>
            </Col>
            <Col xs={24}>
              <Form.Item name="Item_Description" label="Item Description">
                <Input.TextArea rows={2} placeholder="e.g. 22K Gold Necklace, traditional design, approx 30g" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={8}>
              <Form.Item name="Metal_Type" label="Metal Type" initialValue="Gold">
                <Select options={METAL_TYPES.map(m => ({ value: m, label: m }))} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={8}>
              <Form.Item name="Purity" label="Purity">
                <Select options={['24K','22K','18K','Silver'].map(s => ({ value: s, label: s }))} allowClear />
              </Form.Item>
            </Col>
            <Col xs={24} sm={8}>
              <Form.Item name="Estimated_Weight" label="Est. Weight (g)">
                <InputNumber style={{ width: '100%' }} min={0} step={0.1} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={8}>
              <Form.Item name="Estimated_Amount" label="Est. Amount (₹)">
                <InputNumber style={{ width: '100%' }} min={0} prefix="₹" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="Advance_Amount" label="Advance Received (₹)">
                <InputNumber style={{ width: '100%' }} min={0} prefix="₹" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="Payment_Mode" label="Payment Mode">
                <Select options={['Cash','UPI','NEFT','Card','Cheque'].map(s => ({ value: s, label: s }))} allowClear />
              </Form.Item>
            </Col>
            <Col xs={24}>
              <Form.Item name="Remarks" label="Special Instructions">
                <Input.TextArea rows={2} />
              </Form.Item>
            </Col>
          </Row>
          <Button type="primary" htmlType="submit" block size="large" loading={saveMut.isPending}
            style={{ background: '#B8860B', border: 'none', fontWeight: 700 }}>
            {editRow ? 'Update Order' : 'Create Order'}
          </Button>
        </Form>
      </Modal>
    </>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// PURE GOLD BIN TAB
// ════════════════════════════════════════════════════════════════════════════
function PureGoldBinTab() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState({ status: '', search: '', page: 1 });
  const [modalOpen, setModalOpen] = useState(false);
  const [editRow, setEditRow] = useState(null);
  const [form] = Form.useForm();

  const { data, isLoading } = useQuery({
    queryKey: ['bin-pure-gold', filter],
    queryFn: () => binApi.getPureGold(filter).then(r => r.data.data),
  });

  const saveMut = useMutation({
    mutationFn: d => editRow ? binApi.updatePureGold(editRow.Gold_ID, d) : binApi.createPureGold(d),
    onSuccess: (res) => {
      message.success(editRow ? 'Updated.' : `Entry created. Voucher: ${res.data.data?.Voucher_ID}`);
      qc.invalidateQueries(['bin-pure-gold']); qc.invalidateQueries(['bin-dashboard']);
      setModalOpen(false); form.resetFields(); setEditRow(null);
    },
    onError: e => message.error(e.response?.data?.message || 'Failed.'),
  });

  const disposeMut = useMutation({
    mutationFn: ({ id, method }) => binApi.disposePureGold(id, method),
    onSuccess: () => { message.success('Status updated.'); qc.invalidateQueries(['bin-pure-gold']); },
  });

  const openEdit = (row) => {
    setEditRow(row);
    form.setFieldsValue({ ...row, Purchase_Date: dayjs(row.Purchase_Date) });
    setModalOpen(true);
  };

  const s = data?.summary || {};

  const columns = [
    { title: 'Voucher ID',   dataIndex: 'Voucher_ID',      width: 180, render: v => <VoucherBadge id={v} /> },
    { title: 'Date',         dataIndex: 'Purchase_Date',   width: 100, render: v => dayjs(v).format('DD-MMM-YY') },
    { title: 'Supplier',     dataIndex: 'Supplier_Name',   ellipsis: true },
    { title: 'Type',         dataIndex: 'Gold_Type',       width: 80 },
    { title: 'Piece No',     dataIndex: 'Piece_Number',    width: 100, render: v => v ? <Text code style={{ fontSize: 11 }}>{v}</Text> : '-' },
    { title: 'Purity',       dataIndex: 'Purity',          width: 60 },
    { title: 'Gross Wt',     dataIndex: 'Gross_Weight',    width: 90,  render: v => fmtW(v) },
    { title: 'Purchase Amt', dataIndex: 'Purchase_Amount', width: 120, render: v => fmt(v) },
    { title: 'Storage',      dataIndex: 'Storage_Location',width: 100, render: v => v || '-' },
    { title: 'Status',       dataIndex: 'Status',          width: 140,
      render: (v, r) => r.Status === 'Holding' ? (
        <Select size="small" value={v} style={{ width: 140 }}
          onChange={m => disposeMut.mutate({ id: r.Gold_ID, method: m })}
          options={[
            { value: 'Holding', label: <Tag color="gold">Holding</Tag> },
            { value: 'Manufacturing', label: 'For Manufacturing' },
            { value: 'Direct_Sale', label: 'Direct Sale' },
            { value: 'Transfer', label: 'Transfer' },
          ]} />
      ) : <Tag color={STATUS_COLOR[v]}>{v}</Tag>,
    },
    {
      title: 'Actions', width: 70,
      render: (_, r) => (
        <Tooltip title="Edit"><Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} /></Tooltip>
      ),
    },
  ];

  return (
    <>
      {/* Holdings summary */}
      <Row gutter={[10, 10]} style={{ marginBottom: 12 }}>
        <Col xs={12} sm={6}>
          <Card bodyStyle={{ padding: '10px 14px' }} style={{ borderRadius: 10, borderTop: '3px solid #FFD700' }}>
            <Statistic title={<Text style={{ fontSize: 11, color: '#888' }}>Total Pieces</Text>}
              value={parseInt(s.count || 0)} valueStyle={{ color: '#FFD700', fontSize: 20, fontWeight: 700 }} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card bodyStyle={{ padding: '10px 14px' }} style={{ borderRadius: 10, borderTop: '3px solid #52c41a' }}>
            <Statistic title={<Text style={{ fontSize: 11, color: '#888' }}>Holding Weight</Text>}
              value={parseFloat(s.total_weight || 0).toFixed(3)} suffix="g"
              valueStyle={{ color: '#52c41a', fontSize: 20, fontWeight: 700 }} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card bodyStyle={{ padding: '10px 14px' }} style={{ borderRadius: 10, borderTop: '3px solid #B8860B' }}>
            <Statistic title={<Text style={{ fontSize: 11, color: '#888' }}>Holding Value</Text>}
              value={parseFloat(s.total_value || 0)} formatter={v => fmt(v)}
              valueStyle={{ color: '#B8860B', fontSize: 20, fontWeight: 700 }} />
          </Card>
        </Col>
      </Row>

      <Space style={{ marginBottom: 12 }} wrap>
        <Input.Search placeholder="Search voucher / supplier / piece no..." style={{ width: 280 }} allowClear
          onSearch={v => setFilter(f => ({ ...f, search: v, page: 1 }))}
          onChange={e => !e.target.value && setFilter(f => ({ ...f, search: '' }))} />
        <Select value={filter.status} onChange={v => setFilter(f => ({ ...f, status: v, page: 1 }))} style={{ width: 160 }}
          options={[{ value: '', label: 'All Status' }, ...['Holding','For_Manufacturing','Sold','Transferred','Audited'].map(s => ({ value: s, label: s }))]} />
        <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditRow(null); form.resetFields(); setModalOpen(true); }}
          style={{ background: '#B8860B', border: 'none' }}>Add Gold</Button>
        <Button icon={<ReloadOutlined />} onClick={() => qc.invalidateQueries(['bin-pure-gold'])} />
      </Space>

      <div className="table-responsive">
        <Table className="erp-table" columns={columns} dataSource={data?.items || []} rowKey="Gold_ID"
          loading={isLoading} size="small" scroll={{ x: 1000 }}
          pagination={{ total: data?.total, pageSize: 50, current: filter.page,
            onChange: p => setFilter(f => ({ ...f, page: p })), showTotal: t => `${t} entries` }} />
      </div>

      <Modal title={editRow ? `Edit — ${editRow.Voucher_ID}` : '🥇 Add Pure Gold Entry'}
        open={modalOpen} onCancel={() => { setModalOpen(false); setEditRow(null); form.resetFields(); }}
        footer={null} width={600} destroyOnClose>
        <Form form={form} layout="vertical" onFinish={saveMut.mutate} style={{ marginTop: 12 }}>
          <Row gutter={[12, 0]}>
            <Col xs={24} sm={12}>
              <Form.Item name="Purchase_Date" label="Purchase Date" rules={[{ required: true }]}>
                <DatePicker style={{ width: '100%' }} format="DD-MMM-YYYY" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="Supplier_Name" label="Supplier Name" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
            </Col>
            <Col xs={24} sm={8}>
              <Form.Item name="Gold_Type" label="Gold Type" initialValue="Bar">
                <Select options={['Bar','Coin','Biscuit','Other'].map(s => ({ value: s, label: s }))} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={8}>
              <Form.Item name="Purity" label="Purity" initialValue="24K">
                <Select options={['24K','22K','999.9','995'].map(s => ({ value: s, label: s }))} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={8}>
              <Form.Item name="Piece_Number" label="Bar / Piece Number">
                <Input placeholder="Serial no." />
              </Form.Item>
            </Col>
            <Col xs={24} sm={8}>
              <Form.Item name="Gross_Weight" label="Gross Weight (g)" rules={[{ required: true }]}>
                <InputNumber style={{ width: '100%' }} min={0.001} step={0.001} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={8}>
              <Form.Item name="Net_Weight" label="Net Weight (g)" rules={[{ required: true }]}>
                <InputNumber style={{ width: '100%' }} min={0.001} step={0.001} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={8}>
              <Form.Item name="Purchase_Rate" label="Rate (₹/g)">
                <InputNumber style={{ width: '100%' }} min={0} prefix="₹" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="Purchase_Amount" label="Total Amount (₹)" rules={[{ required: true }]}>
                <InputNumber style={{ width: '100%' }} min={1} prefix="₹" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="Storage_Location" label="Storage Location">
                <Input placeholder="Vault / Safe / Location" />
              </Form.Item>
            </Col>
            <Col xs={24}>
              <Form.Item name="Remarks" label="Remarks">
                <Input.TextArea rows={2} />
              </Form.Item>
            </Col>
          </Row>
          <Button type="primary" htmlType="submit" block size="large" loading={saveMut.isPending}
            style={{ background: '#B8860B', border: 'none', fontWeight: 700 }}>
            {editRow ? 'Update Entry' : 'Add Pure Gold Entry'}
          </Button>
        </Form>
      </Modal>
    </>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// MAIN PAGE EXPORT
// ════════════════════════════════════════════════════════════════════════════
export default function BinManagementPage() {
  const dashboardRef = useRef(null);
  const voucherSearchRef = useRef(null);
  const tabsRef = useRef(null);

  // Sidebar links to /bin?tab=purchase, /bin?tab=orders, etc. — the Tabs
  // component needs to actually read that, not just default to the first
  // tab every time regardless of which link was clicked.
  const [searchParams, setSearchParams] = useSearchParams();
  const { isEnabled } = useModules();
  const enabled = {
    bin_purchase: isEnabled('bin_purchase'),
    bin_sales_return: isEnabled('bin_sales_return'),
    bin_orders: isEnabled('bin_orders'),
    bin_pure_gold: isEnabled('bin_pure_gold'),
  };

  const tourSteps = [
    { title: '1. Bin Dashboard', description: 'A live count of what\'s sitting in each of the 4 bins — Purchase, Sales Return, Orders, and Pure Gold — before it becomes real inventory.', target: () => dashboardRef.current },
    { title: '2. Universal Voucher Search', description: 'Every bin entry gets a Voucher ID (e.g. PUR-, SRB-, ORD-, PGB-). Paste or type any one here to pull up its full details instantly.', target: () => voucherSearchRef.current },
    { title: '3. The 4 Bins', description: 'Each tab is a holding area: log a new entry with the + button, then move it forward — Approve → Move to Stock for purchases, Re-stock for returns, status updates for orders, and Manufacturing/Sale/Transfer for pure gold.', target: () => tabsRef.current },
  ];

  // A tenant that turned a bin off in Module Management shouldn't find it
  // still reachable as a tab either — the page and the sidebar now agree.
  const tabItems = [
    enabled.bin_purchase && { key: 'purchase', label: <span>📦 Purchase Bin</span>, children: <PurchaseBinTab /> },
    enabled.bin_sales_return && { key: 'sales-return', label: <span>↩️ Sales Return Bin</span>, children: <SalesReturnBinTab /> },
    enabled.bin_orders && { key: 'orders', label: <span>📋 Order Bin</span>, children: <OrderBinTab /> },
    enabled.bin_pure_gold && { key: 'pure-gold', label: <span>🥇 Pure Gold Bin</span>, children: <PureGoldBinTab /> },
  ].filter(Boolean);

  const availableTabKeys = tabItems.map(t => t.key);
  const tabParam = searchParams.get('tab');
  const activeTab = availableTabKeys.includes(tabParam) ? tabParam : availableTabKeys[0];
  const handleTabChange = (key) => setSearchParams(key === availableTabKeys[0] ? {} : { tab: key });

  return (
    <div className="page-wrapper">
      <div className="page-header">
        <div>
          <div className="page-header-title">🗄️ Master Bin Management</div>
          <div className="page-header-sub">Centralized holding area — Purchase · Sales Return · Orders · Pure Gold</div>
        </div>
      </div>

      <div ref={dashboardRef}><BinDashboard enabled={enabled} /></div>
      <div ref={voucherSearchRef}><VoucherSearch /></div>

      <div ref={tabsRef}>
      <Card className="erp-card" bodyStyle={{ padding: '0 16px 16px' }}>
        {tabItems.length ? (
          <Tabs activeKey={activeTab} onChange={handleTabChange} items={tabItems} type="card" />
        ) : (
          <Alert
            type="info" showIcon
            message="No bins are enabled for your account"
            description="Ask your admin to turn on the bins you need from Module Management."
            style={{ margin: '16px 0' }}
          />
        )}
      </Card>
      </div>

      <PageTour steps={tourSteps} />
    </div>
  );
}
