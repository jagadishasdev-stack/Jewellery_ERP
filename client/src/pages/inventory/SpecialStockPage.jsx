/**
 * Special Stock Management — "Screen 2" from the Special Stock Isolation &
 * Dual Screen Inventory Management spec. Deliberately NOT called
 * "Unofficial" anywhere in this UI (per the spec's own terminology
 * recommendation) — it's an operational classification for admin-managed
 * inventory (in-house karigar production, special collections, reserved
 * pieces), not a tax/accounting concept.
 *
 * Core invariant this whole page exists to make visible and checkable:
 * ONE inventory ledger, ONE barcode, ONE accounting system. Special Stock
 * items bill through the exact same POS/sales flow as everything else —
 * full GST, full accounting, no exclusion from any report. This page only
 * changes which screen an item shows up on by default.
 */
import React, { useState, useRef } from 'react';
import {
  Row, Col, Card, Table, Button, Modal, Form, Input, Select,
  Typography, Space, Tag, Tabs, Statistic, message, Segmented,
  Alert, Divider, Empty,
} from 'antd';
import {
  StarOutlined, UndoOutlined, PlusOutlined, DeleteOutlined, SearchOutlined,
  DownloadOutlined, SyncOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { floorsApi, ornamentsApi } from '../../api/modules';
import { formatCurrency, formatWeight } from '../../utils/calculations';
import { METAL_TYPE_COLORS } from '../../utils/metalTypes';
import PageTour from '../../components/PageTour';
import dayjs from 'dayjs';

const exportCSV = (data, filename) => {
  if (!data?.length) { message.warning('No data.'); return; }
  const headers = Object.keys(data[0]).join(',');
  const rows = data.map(r => Object.values(r).map(v => `"${v ?? ''}"`).join(','));
  const blob = new Blob([[headers, ...rows].join('\n')], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${filename}_${dayjs().format('YYYYMMDD')}.csv`;
  a.click();
};

const { Title, Text } = Typography;
const { TabPane } = Tabs;
const { Option } = Select;
const { TextArea } = Input;

const GOLD = '#B8860B';

const friendlyError = (err, fallback) => {
  if (err?.response?.status === 403) return "You don't have permission to perform this action.";
  return err?.response?.data?.message || fallback;
};

export default function SpecialStockPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('classify');
  const [classifyLevel, setClassifyLevel] = useState('item');
  const [form] = Form.useForm();

  const [selectedItems, setSelectedItems] = useState([]);
  const [barcodeInput, setBarcodeInput] = useState('');
  const [lookupLoading, setLookupLoading] = useState(false);

  const [pickedFloorId, setPickedFloorId] = useState(null);
  const [pickedCounterId, setPickedCounterId] = useState(null);

  const [selectedRowKeys, setSelectedRowKeys] = useState([]);
  const [reclassifyModal, setReclassifyModal] = useState(false);
  const [reclassifyReason, setReclassifyReason] = useState('');

  const purposeRef = useRef(null);
  const levelRef = useRef(null);
  const actionBtnRef = useRef(null);
  const tabsRef = useRef(null);
  const tourSteps = [
    { title: '1. What This Screen Is For', description: 'Special Stock is an operational classification only — in-house karigar production, special collections, reserved pieces. Every sale still goes through the exact same billing, GST, and accounting as normal stock. Nothing here is hidden from reports.', target: () => purposeRef.current },
    { title: '2. Choose What to Classify', description: 'Pick the scope — a single item (scan its barcode), a whole tray, a whole counter, or an entire floor.', target: () => levelRef.current },
    { title: '3. Classify the Stock', description: 'Give it an optional type (e.g. "In-house Karigar") and a reason — every classification change is logged to the audit trail.', target: () => actionBtnRef.current },
    { title: '4. Special Stock List', description: 'Lists every currently Special-classified item, and lets you reclassify any of them back to Normal Stock at any time.', target: () => tabsRef.current },
  ];

  // ── queries ──
  const { data: summary, isLoading: summaryLoading } = useQuery({
    queryKey: ['stock-classification-summary'],
    queryFn: () => ornamentsApi.classificationSummary().then(r => r.data.data),
  });

  const { data: specialStock, isLoading: specialLoading } = useQuery({
    queryKey: ['ornaments', { classification: 'Special', limit: 500 }],
    queryFn: () => ornamentsApi.getAll({ classification: 'Special', limit: 500 }).then(r => r.data.data.items),
  });

  const { data: floors } = useQuery({
    queryKey: ['floors'],
    queryFn: () => floorsApi.getAll().then(r => r.data.data),
  });
  const { data: counters } = useQuery({
    queryKey: ['floor-counters', pickedFloorId],
    queryFn: () => floorsApi.getCounters(pickedFloorId).then(r => r.data.data),
    enabled: !!pickedFloorId && (classifyLevel === 'counter' || classifyLevel === 'tray'),
  });
  const { data: trays } = useQuery({
    queryKey: ['counter-trays', pickedCounterId],
    queryFn: () => floorsApi.getTrays(pickedCounterId).then(r => r.data.data),
    enabled: !!pickedCounterId && classifyLevel === 'tray',
  });

  // ── mutations ──
  const invalidateAll = () => {
    qc.invalidateQueries(['ornaments']);
    qc.invalidateQueries(['stock-classification-summary']);
  };

  const classifyItemMutation = useMutation({
    mutationFn: (data) => ornamentsApi.setStockClassification(data),
    onSuccess: (res) => {
      message.success(res.data.message || 'Classified as Special Stock.');
      invalidateAll();
      form.resetFields();
      setSelectedItems([]);
    },
    onError: (err) => message.error(friendlyError(err, 'Failed to classify stock.')),
  });

  const classifyByLocationMutation = useMutation({
    mutationFn: (data) => ornamentsApi.setStockClassificationByLocation(data),
    onSuccess: (res) => {
      message.success(res.data.message || 'Classified as Special Stock.');
      invalidateAll();
      form.resetFields();
      setPickedFloorId(null);
      setPickedCounterId(null);
    },
    onError: (err) => message.error(friendlyError(err, 'Failed to classify stock.')),
  });

  const reclassifyToNormalMutation = useMutation({
    mutationFn: (reason) => ornamentsApi.setStockClassification({
      ornamentIds: selectedRowKeys, classification: 'Normal', reason,
    }),
    onSuccess: (res) => {
      message.success(res.data.message || 'Reclassified as Normal Stock.');
      invalidateAll();
      setSelectedRowKeys([]);
      setReclassifyModal(false);
      setReclassifyReason('');
    },
    onError: (err) => message.error(friendlyError(err, 'Failed to reclassify stock.')),
  });

  // ── item lookup ──
  const addByBarcode = async () => {
    if (!barcodeInput.trim()) return;
    setLookupLoading(true);
    try {
      const res = await ornamentsApi.getByBarcode(barcodeInput.trim());
      const ornament = res.data.data;
      if (!ornament) { message.error('Item not found.'); return; }
      if (selectedItems.find(i => i.Ornament_ID === ornament.Ornament_ID)) {
        message.info('Already added.');
        return;
      }
      setSelectedItems(prev => [...prev, ornament]);
      setBarcodeInput('');
    } catch (err) {
      message.error(friendlyError(err, 'Barcode not found.'));
    } finally {
      setLookupLoading(false);
    }
  };

  const handleClassifySubmit = () => {
    form.validateFields().then(values => {
      if (classifyLevel === 'item') {
        if (selectedItems.length === 0) { message.warning('Add at least one item first.'); return; }
        classifyItemMutation.mutate({
          ornamentIds: selectedItems.map(i => i.Ornament_ID),
          classification: 'Special', specialType: values.specialType, reason: values.reason,
        });
      } else {
        const payload = { classification: 'Special', specialType: values.specialType, reason: values.reason };
        if (classifyLevel === 'floor') payload.floorId = values.floorId;
        if (classifyLevel === 'counter') { payload.floorId = values.floorId; payload.counterId = values.counterId; }
        if (classifyLevel === 'tray') { payload.floorId = values.floorId; payload.counterId = values.counterId; payload.trayId = values.trayId; }
        classifyByLocationMutation.mutate(payload);
      }
    });
  };

  const changeLevel = (val) => {
    setClassifyLevel(val);
    setSelectedItems([]);
    setPickedFloorId(null);
    setPickedCounterId(null);
    form.resetFields(['floorId', 'counterId', 'trayId']);
  };

  // ── columns ──
  const specialColumns = [
    { title: 'Article No', dataIndex: 'Article_Number', render: v => <Text code style={{ fontSize: 11 }}>{v}</Text> },
    { title: 'Type', dataIndex: 'Type_Name' },
    { title: 'Metal', dataIndex: 'Metal_Type', render: v => <Tag color={METAL_TYPE_COLORS[v] || 'default'}>{v || '-'}</Tag> },
    { title: 'Weight', dataIndex: 'Gross_Weight', render: v => formatWeight(v) },
    { title: 'Value', dataIndex: 'Total_Price', render: v => <Text strong style={{ color: GOLD }}>{formatCurrency(v)}</Text> },
    { title: 'Special Type', dataIndex: 'Special_Stock_Type', render: v => v ? <Tag color="gold">{v}</Tag> : '-' },
    { title: 'Location', render: (_, r) => [r.Floor_Name, r.Counter_Name].filter(Boolean).join(' / ') || r.Physical_Location || '-' },
    { title: 'Status', render: (_, r) => r.Is_Sold ? <Tag color="red">Sold</Tag> : <Tag color="green">In Stock</Tag> },
  ];

  const normal = summary?.normal || {};
  const special = summary?.special || {};
  const combined = summary?.combined || {};

  return (
    <div className="page-wrapper">
      <div className="page-header">
        <Title level={4} style={{ margin: 0 }}>
          <Space><StarOutlined style={{ color: GOLD }} />Special Stock Management</Space>
        </Title>
        <Button icon={<SyncOutlined />} onClick={() => navigate('/tally')}>
          Export Vouchers to Tally →
        </Button>
      </div>

      <div ref={purposeRef}>
      <Alert
        message="One inventory, one accounting system — this is a display classification only"
        description="Special Stock (in-house karigar production, special collections, reserved pieces) bills through the exact same POS/sales flow, same GST, same accounting, same reports as normal stock. This screen only changes which items show up here by default — nothing is excluded from any statutory or financial record."
        type="info" showIcon style={{ marginBottom: 16, borderRadius: 8 }}
      />
      </div>

      {/* Reconciliation — Normal + Special = Total, always visible, no gating */}
      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        {[
          { title: 'Normal Stock', color: '#52c41a', d: normal },
          { title: 'Special Stock', color: GOLD, d: special },
          { title: 'Combined Physical Inventory', color: '#1890ff', d: combined },
        ].map((s, i) => (
          <Col xs={24} md={8} key={i}>
            <Card loading={summaryLoading} bodyStyle={{ padding: '14px 20px' }}
              style={{ borderRadius: 8, border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.07)', borderTop: `3px solid ${s.color}` }}>
              <Statistic title={<Text style={{ fontSize: 12, color: '#888' }}>{s.title}</Text>}
                value={parseInt(s.d.pieces || 0)} suffix="pcs"
                valueStyle={{ color: s.color, fontSize: 22, fontWeight: 700 }} />
              <Space size={12} style={{ marginTop: 4 }}>
                <Text type="secondary" style={{ fontSize: 12 }}>{formatWeight(s.d.weight)}</Text>
                <Text type="secondary" style={{ fontSize: 12 }}>{formatCurrency(s.d.value)}</Text>
              </Space>
            </Card>
          </Col>
        ))}
      </Row>

      <div ref={tabsRef}>
      <Tabs activeKey={activeTab} onChange={setActiveTab}>
        {/* ═══ Classify Stock ═══ */}
        <TabPane tab={<span><StarOutlined /> Classify Stock</span>} key="classify">
          <Card style={{ borderRadius: 8, border: 'none' }} bodyStyle={{ padding: 20 }}>
            <Text strong style={{ display: 'block', marginBottom: 8 }}>What do you want to classify as Special Stock?</Text>
            <div ref={levelRef}>
            <Segmented
              value={classifyLevel}
              onChange={changeLevel}
              options={[
                { label: 'Single Item', value: 'item' },
                { label: 'Whole Tray', value: 'tray' },
                { label: 'Whole Counter', value: 'counter' },
                { label: 'Whole Floor', value: 'floor' },
              ]}
              style={{ marginBottom: 20 }}
            />
            </div>

            <Form form={form} layout="vertical">
              {classifyLevel === 'item' && (
                <>
                  <Form.Item label="Find item by Article Number / Barcode">
                    <Space.Compact style={{ width: '100%' }}>
                      <Input
                        placeholder="Scan barcode or enter Article Number"
                        value={barcodeInput}
                        onChange={e => setBarcodeInput(e.target.value)}
                        onPressEnter={addByBarcode}
                        prefix={<SearchOutlined />}
                      />
                      <Button type="primary" icon={<PlusOutlined />} loading={lookupLoading}
                        style={{ background: GOLD, borderColor: GOLD }}
                        onClick={addByBarcode}>
                        Add
                      </Button>
                    </Space.Compact>
                  </Form.Item>

                  {selectedItems.length > 0 ? (
                    <Table
                      scroll={{ x: 'max-content' }}
                      size="small"
                      dataSource={selectedItems}
                      rowKey="Ornament_ID"
                      pagination={false}
                      style={{ marginBottom: 16 }}
                      columns={[
                        { title: 'Article No', dataIndex: 'Article_Number', render: v => <Text code>{v}</Text> },
                        { title: 'Type', dataIndex: 'Type_Name' },
                        { title: 'Weight', dataIndex: 'Gross_Weight', render: v => formatWeight(v) },
                        { title: 'Value', dataIndex: 'Total_Price', render: v => formatCurrency(v) },
                        {
                          title: '', render: (_, r) => (
                            <Button size="small" danger icon={<DeleteOutlined />}
                              onClick={() => setSelectedItems(prev => prev.filter(i => i.Ornament_ID !== r.Ornament_ID))} />
                          ),
                        },
                      ]}
                    />
                  ) : (
                    <Empty description="No items added yet" style={{ margin: '16px 0' }} />
                  )}
                </>
              )}

              {(classifyLevel === 'tray' || classifyLevel === 'counter') && (
                <Row gutter={16}>
                  <Col xs={24} md={12}>
                    <Form.Item name="floorId" label="Floor" rules={[{ required: true, message: 'Select a floor' }]}>
                      <Select placeholder="Select floor" onChange={(v) => { setPickedFloorId(v); setPickedCounterId(null); form.setFieldsValue({ counterId: undefined, trayId: undefined }); }}>
                        {(floors || []).map(f => <Option key={f.Floor_ID} value={f.Floor_ID}>{f.Floor_Name}</Option>)}
                      </Select>
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={12}>
                    <Form.Item name="counterId" label="Counter" rules={[{ required: true, message: 'Select a counter' }]}>
                      <Select placeholder="Select counter" disabled={!pickedFloorId}
                        onChange={(v) => { setPickedCounterId(v); form.setFieldsValue({ trayId: undefined }); }}>
                        {(counters || []).map(c => <Option key={c.Counter_ID} value={c.Counter_ID}>{c.Counter_Name}</Option>)}
                      </Select>
                    </Form.Item>
                  </Col>
                </Row>
              )}

              {classifyLevel === 'tray' && (
                <Form.Item name="trayId" label="Tray" rules={[{ required: true, message: 'Select a tray' }]}>
                  <Select placeholder="Select tray" disabled={!pickedCounterId}>
                    {(trays || []).map(t => <Option key={t.Tray_ID} value={t.Tray_ID}>{t.Tray_Name}</Option>)}
                  </Select>
                </Form.Item>
              )}

              {classifyLevel === 'floor' && (
                <Form.Item name="floorId" label="Floor" rules={[{ required: true, message: 'Select a floor to classify entirely' }]}>
                  <Select placeholder="Select floor to classify entirely">
                    {(floors || []).map(f => <Option key={f.Floor_ID} value={f.Floor_ID}>{f.Floor_Name}</Option>)}
                  </Select>
                </Form.Item>
              )}

              <Divider />

              <Row gutter={16}>
                <Col xs={24} md={12}>
                  <Form.Item name="specialType" label="Special Stock Type (optional)">
                    <Input placeholder="e.g. In-house Karigar, Special Collection, Reserved" />
                  </Form.Item>
                </Col>
                <Col xs={24} md={12}>
                  <Form.Item name="reason" label="Reason" rules={[{ required: true, message: 'Provide a reason' }]}>
                    <TextArea rows={1} placeholder="Why is this stock being classified as Special?" />
                  </Form.Item>
                </Col>
              </Row>

              <Button ref={actionBtnRef} type="primary" icon={<StarOutlined />} size="large"
                loading={classifyItemMutation.isPending || classifyByLocationMutation.isPending}
                style={{ background: GOLD, borderColor: GOLD }}
                onClick={handleClassifySubmit}>
                Classify as Special Stock
              </Button>
            </Form>
          </Card>
        </TabPane>

        {/* ═══ Special Stock List ═══ */}
        <TabPane tab={<span><StarOutlined /> Special Stock List</span>} key="list">
          <Card style={{ borderRadius: 8, border: 'none' }} bodyStyle={{ padding: 0 }}
            title={`Special Stock Items (${(specialStock || []).length})`}
            extra={
              <Space>
                <Button icon={<DownloadOutlined />} onClick={() => exportCSV((specialStock || []).map(r => ({
                  'Article Number': r.Article_Number, 'Type': r.Type_Name, 'Metal': r.Metal_Type,
                  'Weight (g)': r.Gross_Weight, 'Value': r.Total_Price, 'Special Type': r.Special_Stock_Type || '',
                  'Status': r.Is_Sold ? 'Sold' : 'In Stock',
                })), 'special_stock')}>
                  Export CSV
                </Button>
                <Button icon={<UndoOutlined />} disabled={selectedRowKeys.length === 0}
                  onClick={() => setReclassifyModal(true)}>
                  Reclassify as Normal ({selectedRowKeys.length})
                </Button>
              </Space>
            }>
            <Table
              scroll={{ x: 'max-content' }}
              columns={specialColumns}
              dataSource={specialStock || []}
              loading={specialLoading}
              rowKey="Ornament_ID"
              size="small"
              pagination={{ pageSize: 20 }}
              rowSelection={{ selectedRowKeys, onChange: setSelectedRowKeys }}
            />
          </Card>
        </TabPane>
      </Tabs>
      </div>

      {/* Reclassify-to-Normal reason modal */}
      <Modal
        title="Reclassify as Normal Stock"
        open={reclassifyModal}
        onCancel={() => setReclassifyModal(false)}
        onOk={() => {
          if (!reclassifyReason.trim()) { message.warning('Please provide a reason.'); return; }
          reclassifyToNormalMutation.mutate(reclassifyReason.trim());
        }}
        okText="Reclassify"
        confirmLoading={reclassifyToNormalMutation.isPending}
      >
        <Text>You are about to move {selectedRowKeys.length} item(s) back to Normal Stock (the main showroom screen).</Text>
        <Form.Item label="Reason" style={{ marginTop: 16, marginBottom: 0 }} required>
          <TextArea rows={2} value={reclassifyReason} onChange={e => setReclassifyReason(e.target.value)}
            placeholder="Why are these items being reclassified?" />
        </Form.Item>
      </Modal>

      <PageTour steps={tourSteps} />
    </div>
  );
}
