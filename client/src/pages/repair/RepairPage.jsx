import React, { useState, useRef } from 'react';
import {
  Table, Button, Card, Typography, Tag, Space, Modal, Form,
  Input, InputNumber, Select, DatePicker, Row, Col, Steps, message, Badge,
} from 'antd';
import { PlusOutlined, ToolOutlined, CheckCircleOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { repairApi, karigarApi, customersApi } from '../../api/modules';
import { formatCurrency } from '../../utils/calculations';
import PageTour from '../../components/PageTour';
import { useActionShortcuts } from '../../hooks/useActionShortcuts';
import { useF2Lookup } from '../../hooks/useF2Lookup';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { Option } = Select;

const STATUS_STEPS = { Received: 0, 'In-Progress': 1, Ready: 2, Delivered: 3 };
const STATUS_COLOR = { Received: 'blue', 'In-Progress': 'orange', Ready: 'purple', Delivered: 'green', Cancelled: 'red' };

export default function RepairPage() {
  const [createModal, setCreateModal] = useState(false);
  const [detailModal, setDetailModal] = useState(null);
  const [filterStatus, setFilterStatus] = useState('');
  const [form] = Form.useForm();
  const qc = useQueryClient();

  // ── original-sale/karigar lookup (which karigar made this item?) ────────────
  const [invoiceInput, setInvoiceInput] = useState('');
  const [lookupResult, setLookupResult] = useState(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [selectedOrnamentId, setSelectedOrnamentId] = useState(null);

  const runInvoiceLookup = async () => {
    if (!invoiceInput.trim()) return;
    setLookupLoading(true);
    setLookupResult(null);
    setSelectedOrnamentId(null);
    try {
      const res = await repairApi.lookupByInvoice(invoiceInput.trim());
      setLookupResult(res.data.data);
      if (res.data.data.items.length === 1) setSelectedOrnamentId(res.data.data.items[0].Ornament_ID);
    } catch (err) {
      message.error(err.response?.data?.message || 'Invoice not found.');
    } finally {
      setLookupLoading(false);
    }
  };

  // ── Walkthrough tour refs ───────────────────────────────────────────────────
  const filterRef = useRef(null);
  const newBtnRef = useRef(null);
  const tableRef = useRef(null);
  const tourSteps = [
    { title: '1. New Repair Job Card', description: 'Click here whenever a customer brings in an item for repair — record their details, the item, the work needed, and any advance they pay.', target: () => newBtnRef.current },
    { title: '2. Filter by Status', description: 'Narrow the list down to just Received, In-Progress, Ready, Delivered or Cancelled jobs — handy for seeing what still needs attention.', target: () => filterRef.current },
    { title: '3. Repair Orders List', description: 'Every job card shows here with the assigned karigar, expected delivery date, and current status at a glance.', target: () => tableRef.current },
    { title: '4. Manage a Job', description: 'Click Manage on any row to move it through the stages (Received → In-Progress → Ready → Delivered), add technician notes, and set labour/material charges.' },
    { title: '5. Deliver', description: 'Once a job is Ready, a green Deliver button appears on that row — click it when the customer collects their item to close out the job card.' },
  ];

  const { data: repairs, isLoading } = useQuery({
    queryKey: ['repairs', filterStatus],
    queryFn: () => repairApi.getAll({ status: filterStatus || undefined }).then(r => r.data.data.items),
  });

  const { data: karigars } = useQuery({
    queryKey: ['karigars'],
    queryFn: () => karigarApi.getList().then(r => r.data.data),
  });

  const createMutation = useMutation({
    mutationFn: (data) => repairApi.create(data),
    onSuccess: (res) => {
      message.success(`Job Card ${res.data.data.Job_Card_Number} created!`);
      qc.invalidateQueries(['repairs']);
      setCreateModal(false);
      form.resetFields();
      setInvoiceInput(''); setLookupResult(null); setSelectedOrnamentId(null);
    },
    onError: (err) => message.error(err.response?.data?.message || 'Failed.'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => repairApi.update(id, data),
    onSuccess: () => { message.success('Status updated.'); qc.invalidateQueries(['repairs']); setDetailModal(null); },
  });

  const deliverMutation = useMutation({
    mutationFn: (id) => repairApi.deliver(id),
    onSuccess: () => { message.success('Item delivered to customer!'); qc.invalidateQueries(['repairs']); setDetailModal(null); },
  });

  const closeCreateModal = () => {
    setCreateModal(false); form.resetFields();
    setInvoiceInput(''); setLookupResult(null); setSelectedOrnamentId(null);
  };
  const karigarLookup = useF2Lookup();
  useActionShortcuts({
    onNew: () => setCreateModal(true),
    onSave: () => createModal && form.submit(),
    onCancel: () => { if (createModal) closeCreateModal(); else if (detailModal) setDetailModal(null); },
  });

  const pendingCount = (repairs || []).filter(r => ['Received', 'In-Progress'].includes(r.Status)).length;
  const readyCount = (repairs || []).filter(r => r.Status === 'Ready').length;

  const columns = [
    { title: 'Job Card', dataIndex: 'Job_Card_Number', render: v => <Text code style={{ fontSize: 11 }}>{v}</Text> },
    { title: 'Customer', dataIndex: 'Customer_Name', render: (v, r) => v || r.Customer_Name_Direct || '-' },
    { title: 'Item', dataIndex: 'Item_Description', render: v => <Text ellipsis style={{ maxWidth: 150 }}>{v}</Text> },
    { title: 'Repair Karigar', dataIndex: 'Karigar_Name', render: v => v || 'Unassigned' },
    {
      title: 'Original Maker', dataIndex: 'Original_Karigar_Name',
      render: (v, r) => v
        ? <Tag color="gold">{v}</Tag>
        : (r.Original_Invoice_Number ? <Text type="secondary" style={{ fontSize: 11 }}>Not on record</Text> : '-'),
    },
    { title: 'Expected', dataIndex: 'Expected_Delivery', render: v => v ? dayjs(v).format('DD-MMM') : '-' },
    { title: 'Charges', dataIndex: 'Total_Charge', render: v => formatCurrency(v) },
    {
      title: 'Status',
      dataIndex: 'Status',
      render: v => <Tag color={STATUS_COLOR[v]}>{v}</Tag>,
    },
    {
      title: 'Actions',
      render: (_, r) => (
        <Space>
          <Button size="small" onClick={() => setDetailModal(r)}>Manage</Button>
          {r.Status === 'Ready' && (
            <Button size="small" type="primary" icon={<CheckCircleOutlined />}
              style={{ background: '#52c41a', borderColor: '#52c41a' }}
              onClick={() => deliverMutation.mutate(r.Repair_ID)}>
              Deliver
            </Button>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div className="page-wrapper">
      <div className="page-header">
        <Title level={4} style={{ margin: 0 }}>
          <Space>
            <ToolOutlined style={{ color: '#B8860B' }} />Repair Orders
            {pendingCount > 0 && <Badge count={pendingCount} style={{ background: '#fa8c16' }} />}
            {readyCount > 0 && <Badge count={readyCount} style={{ background: '#52c41a' }} />}
          </Space>
        </Title>
        <Space>
          <div ref={filterRef}>
          <Select value={filterStatus} onChange={setFilterStatus} style={{ width: 160 }} allowClear placeholder="Filter by status">
            {['Received','In-Progress','Ready','Delivered','Cancelled'].map(s => <Option key={s} value={s}>{s}</Option>)}
          </Select>
          </div>
          <Button ref={newBtnRef} type="primary" icon={<PlusOutlined />}
            style={{ background: '#B8860B', borderColor: '#B8860B' }}
            onClick={() => setCreateModal(true)}>
            New Repair
          </Button>
        </Space>
      </div>

      <div ref={tableRef}>
      <Card style={{ borderRadius: 8, border: 'none' }} bodyStyle={{ padding: 0 }}>
        <Table
            scroll={{ x: "max-content" }} columns={columns} dataSource={repairs || []} loading={isLoading}
          rowKey="Repair_ID" size="small" pagination={{ pageSize: 20 }} />
      </Card>
      </div>

      {/* Create Modal */}
      <Modal title="New Repair Job Card" open={createModal}
        onCancel={closeCreateModal} footer={null} width={600}>
        <Form form={form} layout="vertical" onFinish={v => createMutation.mutate({
          ...v,
          Original_Invoice_Number: lookupResult ? invoiceInput.trim() : undefined,
          Original_Ornament_ID: lookupResult ? selectedOrnamentId : undefined,
        })}>
          {/* Was this item originally sold by us? If so, find which karigar
              made it — feeds karigar quality-of-work analytics (repair
              rate) in Reports → Karigar Report. Purely informational;
              nothing here blocks creating the job card either way. */}
          <Form.Item label="Original Sale Invoice Number (optional — if we sold this item)">
            <Space.Compact style={{ width: '100%' }}>
              <Input
                placeholder="e.g. INV-DLJ-20260801-0012"
                value={invoiceInput}
                onChange={e => setInvoiceInput(e.target.value)}
                onPressEnter={runInvoiceLookup}
              />
              <Button loading={lookupLoading} onClick={runInvoiceLookup}>Find</Button>
            </Space.Compact>
          </Form.Item>
          {lookupResult && (
            <Card size="small" style={{ marginBottom: 16, background: '#fafafa' }}>
              <Text style={{ fontSize: 12, color: '#888' }}>
                Sold {dayjs(lookupResult.Sale_Date).format('DD-MMM-YYYY')} to {lookupResult.Customer_Name || 'Walk-in'}
              </Text>
              {lookupResult.items.length > 1 ? (
                <Select style={{ width: '100%', marginTop: 8 }} placeholder="Which item is this repair for?"
                  value={selectedOrnamentId} onChange={setSelectedOrnamentId}>
                  {lookupResult.items.map(i => (
                    <Option key={i.Ornament_ID} value={i.Ornament_ID}>
                      {i.Article_Number} — {i.Type_Name || 'Item'} — Made by {i.Karigar_Name || 'Unknown'}
                    </Option>
                  ))}
                </Select>
              ) : (
                <div style={{ marginTop: 4 }}>
                  <Text strong>{lookupResult.items[0]?.Article_Number}</Text>
                  {' — Made by '}
                  <Tag color="gold">{lookupResult.items[0]?.Karigar_Name || 'Unknown'}</Tag>
                </div>
              )}
            </Card>
          )}

          <Row gutter={16}>
            <Col xs={12}>
              <Form.Item name="Customer_Name" label="Customer Name"><Input /></Form.Item>
            </Col>
            <Col xs={12}>
              <Form.Item name="Customer_Mobile" label="Mobile"><Input /></Form.Item>
            </Col>
          </Row>
          <Form.Item name="Item_Description" label="Item Description" rules={[{ required: true }]}>
            <Input placeholder="e.g. Gold Necklace — 22K — 15g (customer's item)" />
          </Form.Item>
          <Row gutter={16}>
            <Col xs={8}>
              <Form.Item name="Item_Weight" label="Item Weight (g)">
                <InputNumber style={{ width: '100%' }} step={0.001} />
              </Form.Item>
            </Col>
            <Col xs={8}>
              <Form.Item name="Purity" label="Purity"><Input placeholder="22K" /></Form.Item>
            </Col>
            <Col xs={8}>
              <Form.Item name="Assigned_Karigar_ID" label="Assign Karigar">
                <Select allowClear placeholder="Select karigar (F2 for full list)"
                  open={karigarLookup.open} onDropdownVisibleChange={karigarLookup.onOpenChange} onKeyDown={karigarLookup.onKeyDown}>
                  {(karigars || []).map(k => <Option key={k.Vendor_ID} value={k.Vendor_ID}>{k.Vendor_Name}</Option>)}
                </Select>
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="Repair_Work_Required" label="Work Required (Customer Description)">
            <Input.TextArea rows={2} placeholder="Customer says: Necklace clasp broken, needs fixing" />
          </Form.Item>
          <Row gutter={16}>
            <Col xs={8}>
              <Form.Item name="Estimate_Amount" label="Estimate (₹)"><InputNumber style={{ width: '100%' }} min={0} /></Form.Item>
            </Col>
            <Col xs={8}>
              <Form.Item name="Advance_Paid" label="Advance (₹)" initialValue={0}><InputNumber style={{ width: '100%' }} min={0} /></Form.Item>
            </Col>
            <Col xs={8}>
              <Form.Item name="Expected_Delivery" label="Expected Delivery">
                <DatePicker style={{ width: '100%' }} disabledDate={d => d && d < dayjs()} />
              </Form.Item>
            </Col>
          </Row>
          <Button type="primary" htmlType="submit" block size="large"
            loading={createMutation.isPending}
            style={{ background: '#B8860B', borderColor: '#B8860B' }}>
            Create Job Card
          </Button>
        </Form>
      </Modal>

      {/* Manage Modal */}
      <Modal
        title={`Manage — ${detailModal?.Job_Card_Number}`}
        open={!!detailModal}
        onCancel={() => setDetailModal(null)}
        footer={null}
        width={500}
      >
        {detailModal && (
          <div>
            <Steps current={STATUS_STEPS[detailModal.Status] || 0} size="small" style={{ marginBottom: 20 }}>
              <Steps.Step title="Received" />
              <Steps.Step title="In-Progress" />
              <Steps.Step title="Ready" />
              <Steps.Step title="Delivered" />
            </Steps>
            <Space direction="vertical" style={{ width: '100%' }} size={12}>
              <div><Text type="secondary">Item: </Text><Text strong>{detailModal.Item_Description}</Text></div>
              <div><Text type="secondary">Customer: </Text><Text>{detailModal.Customer_Name || detailModal.Cust_Name}</Text></div>
              <div><Text type="secondary">Technician Notes: </Text></div>
              <Input.TextArea rows={2} defaultValue={detailModal.Technician_Notes}
                onChange={e => setDetailModal(prev => ({ ...prev, Technician_Notes: e.target.value }))} />
              <Row gutter={12}>
                <Col xs={8}><InputNumber placeholder="Labour ₹" style={{ width: '100%' }}
                  defaultValue={detailModal.Labour_Charge}
                  onChange={v => setDetailModal(prev => ({ ...prev, Labour_Charge: v, Total_Charge: (v||0)+(prev.Material_Charge||0) }))} /></Col>
                <Col xs={8}><InputNumber placeholder="Material ₹" style={{ width: '100%' }}
                  defaultValue={detailModal.Material_Charge}
                  onChange={v => setDetailModal(prev => ({ ...prev, Material_Charge: v, Total_Charge: (prev.Labour_Charge||0)+(v||0) }))} /></Col>
                <Col xs={8}><Select style={{ width: '100%' }} defaultValue={detailModal.Status}
                  onChange={v => setDetailModal(prev => ({ ...prev, Status: v }))}>
                  {['Received','In-Progress','Ready','Cancelled'].map(s => <Option key={s} value={s}>{s}</Option>)}
                </Select></Col>
              </Row>
              <Button type="primary" block
                style={{ background: '#B8860B', borderColor: '#B8860B' }}
                loading={updateMutation.isPending}
                onClick={() => updateMutation.mutate({ id: detailModal.Repair_ID, data: {
                  Status: detailModal.Status, Technician_Notes: detailModal.Technician_Notes,
                  Labour_Charge: detailModal.Labour_Charge, Material_Charge: detailModal.Material_Charge,
                  Total_Charge: (detailModal.Labour_Charge||0) + (detailModal.Material_Charge||0),
                  Balance_Due: Math.max(0, ((detailModal.Labour_Charge||0)+(detailModal.Material_Charge||0)) - (detailModal.Advance_Paid||0)),
                }})}>
                Update Status & Charges
              </Button>
              {detailModal.Status === 'Ready' && (
                <Button type="primary" block size="large"
                  style={{ background: '#52c41a', borderColor: '#52c41a' }}
                  loading={deliverMutation.isPending}
                  onClick={() => deliverMutation.mutate(detailModal.Repair_ID)}>
                  ✅ Mark as Delivered
                </Button>
              )}
            </Space>
          </div>
        )}
      </Modal>

      <PageTour steps={tourSteps} />
    </div>
  );
}
