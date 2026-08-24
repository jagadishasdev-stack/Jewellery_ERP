import React, { useState, useRef } from 'react';
import {
  Row, Col, Card, Table, Button, Modal, Form, Input, Select,
  Typography, Space, Tag, Tabs, Statistic, message, Segmented,
  Alert, Divider, Empty, DatePicker,
} from 'antd';
import {
  EyeInvisibleOutlined, EyeOutlined, PlusOutlined, DeleteOutlined,
  SearchOutlined, UndoOutlined, DollarCircleOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { floorsApi, transferApi, ornamentsApi } from '../../api/modules';
import { formatCurrency, formatWeight } from '../../utils/calculations';
import { useDataMode } from '../../contexts/DataModeContext';
import PageTour from '../../components/PageTour';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { TabPane } = Tabs;
const { Option } = Select;
const { TextArea } = Input;

const GOLD = '#B8860B';

const friendlyError = (err, fallback) => {
  if (err?.response?.status === 403) {
    return "You don't have permission to perform this action.";
  }
  return err?.response?.data?.message || fallback;
};

export default function HiddenStockPage() {
  const { isUnofficial } = useDataMode();
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState('hide');
  const [hideLevel, setHideLevel] = useState('item');
  const [form] = Form.useForm();

  // ── item-level state ──
  const [selectedItems, setSelectedItems] = useState([]);
  const [barcodeInput, setBarcodeInput] = useState('');
  const [lookupLoading, setLookupLoading] = useState(false);

  // ── cascading location state ──
  const [pickedFloorId, setPickedFloorId] = useState(null);
  const [pickedCounterId, setPickedCounterId] = useState(null);

  // ── currently hidden tab state ──
  const [selectedRowKeys, setSelectedRowKeys] = useState([]);
  const [unhideModal, setUnhideModal] = useState(false);
  const [unhideReason, setUnhideReason] = useState('');

  // ── sold-from-hidden tab state ──
  const [soldRange, setSoldRange] = useState([dayjs(), dayjs()]); // defaults to today

  // ── Walkthrough tour refs ───────────────────────────────────────────────────
  const purposeRef = useRef(null);
  const hideLevelRef = useRef(null);
  const hideBtnRef = useRef(null);
  const tabsRef = useRef(null);
  const tourSteps = [
    { title: '1. What This Page Is For', description: 'Hiding stock removes it from POS, normal stock views and reports without physically moving it — useful for owner reserve, audit holds or sensitive pieces. This is a sensitive, admin-level tool: full visibility totals and the hidden-items list only appear in Unofficial mode (Ctrl+F5).', target: () => purposeRef.current },
    { title: '2. Choose What to Hide', description: 'Pick the scope — a single item (scan its barcode), a whole tray, a whole counter, or an entire floor — then select a Hidden Location and give a reason.', target: () => hideLevelRef.current },
    { title: '3. Hide the Stock', description: 'Confirms the action and creates a tracked transfer voucher moving the stock to the hidden location — it can always be reversed from the "Currently Hidden" tab.', target: () => hideBtnRef.current },
    { title: '4. Currently Hidden (Unofficial mode only)', description: 'Only visible when Unofficial mode is on — lists every currently-hidden item and lets you select items to Unhide, with a reason, to bring them back into normal stock and reports.', target: () => tabsRef.current },
  ];

  // ── queries ──
  // Hidden stock details never surface in Official mode — only fetch once
  // Unofficial (Ctrl+F5) is active; the server enforces this too (403 otherwise).
  const { data: visibility, isLoading: visLoading } = useQuery({
    queryKey: ['visibility-comparison'],
    queryFn: () => floorsApi.getVisibilityComparison().then(r => r.data.data),
    enabled: isUnofficial,
  });

  const { data: hiddenLocations } = useQuery({
    queryKey: ['hidden-locations'],
    queryFn: () => floorsApi.getHiddenLocations().then(r => r.data.data),
  });

  const { data: hiddenStock, isLoading: hiddenLoading } = useQuery({
    queryKey: ['hidden-stock'],
    queryFn: () => floorsApi.getHiddenStock().then(r => r.data.data),
    enabled: isUnofficial,
  });

  // "If 10 pieces of hidden stock sold today, show those 10 separately" —
  // Is_Hidden is never cleared when a hidden item sells (see the server
  // route's own comment), which is exactly what lets this identify them.
  const [soldFrom, soldTo] = soldRange;
  const { data: hiddenSales, isLoading: hiddenSalesLoading } = useQuery({
    queryKey: ['hidden-stock-sales', soldFrom?.format('YYYY-MM-DD'), soldTo?.format('YYYY-MM-DD')],
    queryFn: () => floorsApi.getHiddenStockSales({
      fromDate: soldFrom?.format('YYYY-MM-DD'), toDate: soldTo?.format('YYYY-MM-DD'),
    }).then(r => r.data.data),
    enabled: isUnofficial && !!soldFrom && !!soldTo,
  });

  const { data: floors } = useQuery({
    queryKey: ['floors'],
    queryFn: () => floorsApi.getAll().then(r => r.data.data),
  });

  const { data: counters } = useQuery({
    queryKey: ['floor-counters', pickedFloorId],
    queryFn: () => floorsApi.getCounters(pickedFloorId).then(r => r.data.data),
    enabled: !!pickedFloorId && (hideLevel === 'counter' || hideLevel === 'tray'),
  });

  const { data: trays } = useQuery({
    queryKey: ['counter-trays', pickedCounterId],
    queryFn: () => floorsApi.getTrays(pickedCounterId).then(r => r.data.data),
    enabled: !!pickedCounterId && hideLevel === 'tray',
  });

  // ── mutations ──
  const hideMutation = useMutation({
    mutationFn: (data) => transferApi.hideStock(data),
    onSuccess: (res) => {
      const { transferNumber, count } = res.data.data || {};
      message.success(`Hidden ${count || ''} item(s) — Transfer #${transferNumber || '-'}`);
      qc.invalidateQueries(['hidden-stock']);
      qc.invalidateQueries(['visibility-comparison']);
      qc.invalidateQueries(['floor-stock']);
      form.resetFields();
      setSelectedItems([]);
      setPickedFloorId(null);
      setPickedCounterId(null);
    },
    onError: (err) => message.error(friendlyError(err, 'Failed to hide stock.')),
  });

  const unhideMutation = useMutation({
    mutationFn: (data) => transferApi.unhideStock(data),
    onSuccess: (res) => {
      const { transferNumber, count } = res.data.data || {};
      message.success(`Unhidden ${count || ''} item(s) — Transfer #${transferNumber || '-'}`);
      qc.invalidateQueries(['hidden-stock']);
      qc.invalidateQueries(['visibility-comparison']);
      qc.invalidateQueries(['floor-stock']);
      setSelectedRowKeys([]);
      setUnhideModal(false);
      setUnhideReason('');
    },
    onError: (err) => message.error(friendlyError(err, 'Failed to unhide stock.')),
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

  const handleHideSubmit = () => {
    form.validateFields().then(values => {
      let ids = [];
      if (hideLevel === 'item') {
        if (selectedItems.length === 0) { message.warning('Add at least one item first.'); return; }
        ids = selectedItems.map(i => i.Ornament_ID);
      } else if (hideLevel === 'tray') {
        if (!values.trayId) { message.warning('Select a tray.'); return; }
        ids = [values.trayId];
      } else if (hideLevel === 'counter') {
        if (!values.counterId) { message.warning('Select a counter.'); return; }
        ids = [values.counterId];
      } else if (hideLevel === 'floor') {
        if (!values.floorId) { message.warning('Select a floor.'); return; }
        ids = [values.floorId];
      }
      hideMutation.mutate({
        level: hideLevel,
        ids,
        hiddenLocationId: values.hiddenLocationId,
        reason: values.reason,
      });
    });
  };

  const changeLevel = (val) => {
    setHideLevel(val);
    setSelectedItems([]);
    setPickedFloorId(null);
    setPickedCounterId(null);
    form.resetFields(['floorId', 'counterId', 'trayId']);
  };

  const handleUnhideConfirm = () => {
    if (!unhideReason.trim()) { message.warning('Please provide a reason.'); return; }
    unhideMutation.mutate({ level: 'item', ids: selectedRowKeys, reason: unhideReason.trim() });
  };

  // ── columns ──
  const hiddenColumns = [
    { title: 'Article No', dataIndex: 'Article_Number', render: v => <Text code style={{ fontSize: 11 }}>{v}</Text> },
    { title: 'Type', dataIndex: 'Type_Name' },
    { title: 'Weight', dataIndex: 'Gross_Weight', render: v => formatWeight(v) },
    { title: 'Value', dataIndex: 'Total_Price', render: v => <Text strong style={{ color: GOLD }}>{formatCurrency(v)}</Text> },
    {
      title: 'Original Location',
      render: (_, r) => [r.Floor_Name, r.Counter_Name, r.Tray_Name].filter(Boolean).join(' / ') || '-',
    },
    { title: 'Hidden Location', dataIndex: 'Hidden_Location_Name', render: v => <Tag color="purple">{v}</Tag> },
    { title: 'Hidden By', dataIndex: 'Hidden_By' },
    { title: 'Hidden Date', dataIndex: 'Hidden_Date', render: v => v ? new Date(v).toLocaleDateString('en-IN') : '-' },
    { title: 'Reason', dataIndex: 'Hidden_Reason', ellipsis: true },
  ];

  const soldColumns = [
    { title: 'Article No', dataIndex: 'Article_Number', render: v => <Text code style={{ fontSize: 11 }}>{v}</Text> },
    { title: 'Type', dataIndex: 'Type_Name' },
    { title: 'Weight', dataIndex: 'Gross_Weight', render: v => formatWeight(v) },
    { title: 'Sold Value', dataIndex: 'Total_Line_Price', render: v => <Text strong style={{ color: '#52c41a' }}>{formatCurrency(v)}</Text> },
    { title: 'Invoice', dataIndex: 'Invoice_Number', render: v => <Text code style={{ fontSize: 11 }}>{v}</Text> },
    { title: 'Sale Date', dataIndex: 'Sale_Date', render: v => v ? new Date(v).toLocaleDateString('en-IN') : '-' },
    { title: 'Customer', dataIndex: 'Customer_Name', render: v => v || 'Walk-in' },
    { title: 'Was Hidden At', dataIndex: 'Hidden_Location_Name', render: v => <Tag color="purple">{v || '-'}</Tag> },
    { title: 'Original Hide Reason', dataIndex: 'Hidden_Reason', ellipsis: true },
  ];

  const statCards = [
    {
      title: 'Visible Stock', color: '#52c41a',
      count: visibility?.visible_count, weight: visibility?.visible_weight, value: visibility?.visible_value,
    },
    {
      title: 'Hidden Stock', color: '#fa541c',
      count: visibility?.hidden_count, weight: visibility?.hidden_weight, value: visibility?.hidden_value,
    },
    {
      title: 'Total Inventory', color: GOLD,
      count: visibility?.total_count, weight: visibility?.total_weight, value: visibility?.total_value,
    },
  ];

  return (
    <div className="page-wrapper">
      <div className="page-header">
        <Title level={4} style={{ margin: 0 }}>
          <Space><EyeInvisibleOutlined style={{ color: GOLD }} />Hidden Stock Management</Space>
        </Title>
      </div>

      <div ref={purposeRef}>
      <Alert
        message="Visibility, not location, changes"
        description="Hiding stock only removes it from POS / normal stock views and reports. Physical location and inventory counts are unaffected — the totals below must always add up."
        type="info" showIcon style={{ marginBottom: 16, borderRadius: 8 }}
      />
      </div>

      {/* Summary — hidden stock details never surface in Official mode */}
      {isUnofficial ? (
        <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
          {statCards.map((s, i) => (
            <Col xs={24} md={8} key={i}>
              <Card loading={visLoading} bodyStyle={{ padding: '14px 20px' }}
                style={{ borderRadius: 8, border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.07)', borderTop: `3px solid ${s.color}` }}>
                <Statistic title={<Text style={{ fontSize: 12, color: '#888' }}>{s.title}</Text>}
                  value={parseInt(s.count || 0)}
                  valueStyle={{ color: s.color, fontSize: 22, fontWeight: 700 }} />
                <Space size={12} style={{ marginTop: 4 }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>{formatWeight(s.weight)}</Text>
                  <Text type="secondary" style={{ fontSize: 12 }}>{formatCurrency(s.value)}</Text>
                </Space>
              </Card>
            </Col>
          ))}
        </Row>
      ) : (
        <Alert
          type="warning" showIcon style={{ marginBottom: 16, borderRadius: 8 }}
          message="Hidden stock details are hidden in Official mode"
          description="Switch to Unofficial mode (Ctrl+F5) to view visibility totals and the currently-hidden list. You can still hide stock below."
        />
      )}

      <div ref={tabsRef}>
      <Tabs activeKey={activeTab} onChange={setActiveTab}>
        {/* ═══ Hide Stock ═══ */}
        <TabPane tab={<span><EyeInvisibleOutlined /> Hide Stock</span>} key="hide">
          <Card style={{ borderRadius: 8, border: 'none' }} bodyStyle={{ padding: 20 }}>
            <Text strong style={{ display: 'block', marginBottom: 8 }}>What do you want to hide?</Text>
            <div ref={hideLevelRef}>
            <Segmented
              value={hideLevel}
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
              {hideLevel === 'item' && (
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

              {(hideLevel === 'tray' || hideLevel === 'counter') && (
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

              {hideLevel === 'tray' && (
                <Form.Item name="trayId" label="Tray" rules={[{ required: true, message: 'Select a tray' }]}>
                  <Select placeholder="Select tray" disabled={!pickedCounterId}>
                    {(trays || []).map(t => <Option key={t.Tray_ID} value={t.Tray_ID}>{t.Tray_Name}</Option>)}
                  </Select>
                </Form.Item>
              )}

              {hideLevel === 'floor' && (
                <Form.Item name="floorId" label="Floor" rules={[{ required: true, message: 'Select a floor' }]}>
                  <Select placeholder="Select floor to hide entirely">
                    {(floors || []).map(f => <Option key={f.Floor_ID} value={f.Floor_ID}>{f.Floor_Name}</Option>)}
                  </Select>
                </Form.Item>
              )}

              <Divider />

              <Row gutter={16}>
                <Col xs={24} md={12}>
                  <Form.Item name="hiddenLocationId" label="Hidden Location" rules={[{ required: true, message: 'Select a hidden location' }]}>
                    <Select placeholder="e.g. Owner Reserve, Vault Stock">
                      {(hiddenLocations || []).map(l => (
                        <Option key={l.Hidden_Location_ID} value={l.Hidden_Location_ID}>{l.Location_Name}</Option>
                      ))}
                    </Select>
                  </Form.Item>
                </Col>
                <Col xs={24} md={12}>
                  <Form.Item name="reason" label="Reason" rules={[{ required: true, message: 'Provide a reason' }]}>
                    <TextArea rows={1} placeholder="Why is this stock being hidden?" />
                  </Form.Item>
                </Col>
              </Row>

              <Button ref={hideBtnRef} type="primary" icon={<EyeInvisibleOutlined />} size="large"
                loading={hideMutation.isPending}
                style={{ background: GOLD, borderColor: GOLD }}
                onClick={() => {
                  Modal.confirm({
                    title: 'Confirm Hide Stock',
                    content: 'This stock will disappear from POS, normal stock views and reports until unhidden. Continue?',
                    okText: 'Yes, Hide It',
                    onOk: handleHideSubmit,
                  });
                }}>
                Hide Selected Stock
              </Button>
            </Form>
          </Card>
        </TabPane>

        {/* ═══ Currently Hidden ═══ */}
        <TabPane tab={<span><EyeOutlined /> Currently Hidden</span>} key="hidden">
          {isUnofficial ? (
            <Card style={{ borderRadius: 8, border: 'none' }} bodyStyle={{ padding: 0 }}
              title={`Currently Hidden Items (${(hiddenStock || []).length})`}
              extra={
                <Button type="primary" icon={<UndoOutlined />} disabled={selectedRowKeys.length === 0}
                  style={{ background: '#52c41a', borderColor: '#52c41a' }}
                  onClick={() => setUnhideModal(true)}>
                  Unhide Selected ({selectedRowKeys.length})
                </Button>
              }>
              <Table
                scroll={{ x: 'max-content' }}
                columns={hiddenColumns}
                dataSource={hiddenStock || []}
                loading={hiddenLoading}
                rowKey="Ornament_ID"
                size="small"
                pagination={{ pageSize: 20 }}
                rowSelection={{
                  selectedRowKeys,
                  onChange: setSelectedRowKeys,
                }}
              />
            </Card>
          ) : (
            <Alert
              type="warning" showIcon style={{ borderRadius: 8 }}
              message="Only visible in Unofficial mode"
              description="Switch to Unofficial mode (Ctrl+F5) to see and unhide currently-hidden stock."
            />
          )}
        </TabPane>

        {/* ═══ Sold From Hidden ═══ */}
        <TabPane tab={<span><DollarCircleOutlined /> Sold From Hidden</span>} key="sold">
          {isUnofficial ? (
            <>
              <Space style={{ marginBottom: 12 }}>
                <Text type="secondary" style={{ fontSize: 12 }}>Date range:</Text>
                <DatePicker.RangePicker value={soldRange} onChange={(v) => setSoldRange(v || [dayjs(), dayjs()])} allowClear={false} />
              </Space>
              <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
                {[
                  { title: 'Items Sold', value: hiddenSales?.summary?.count, color: '#52c41a', fmt: (v) => v },
                  { title: 'Total Weight', value: hiddenSales?.summary?.total_weight, color: '#1890ff', fmt: formatWeight },
                  { title: 'Total Value', value: hiddenSales?.summary?.total_value, color: GOLD, fmt: formatCurrency },
                ].map((c, i) => (
                  <Col xs={24} md={8} key={i}>
                    <Card loading={hiddenSalesLoading} bodyStyle={{ padding: '14px 20px' }}
                      style={{ borderRadius: 8, border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.07)', borderTop: `3px solid ${c.color}` }}>
                      <Statistic title={<Text style={{ fontSize: 12, color: '#888' }}>{c.title}</Text>}
                        value={parseFloat(c.value || 0)} formatter={(v) => c.fmt(v)}
                        valueStyle={{ color: c.color, fontSize: 20, fontWeight: 700 }} />
                    </Card>
                  </Col>
                ))}
              </Row>
              <Card style={{ borderRadius: 8, border: 'none' }} bodyStyle={{ padding: 0 }}
                title={`Hidden Stock Sold (${hiddenSales?.items?.length || 0})`}>
                <Table
                  scroll={{ x: 'max-content' }}
                  columns={soldColumns}
                  dataSource={hiddenSales?.items || []}
                  loading={hiddenSalesLoading}
                  rowKey="Ornament_ID"
                  size="small"
                  pagination={{ pageSize: 20 }}
                />
              </Card>
            </>
          ) : (
            <Alert
              type="warning" showIcon style={{ borderRadius: 8 }}
              message="Only visible in Unofficial mode"
              description="Switch to Unofficial mode (Ctrl+F5) to see hidden stock that's been sold."
            />
          )}
        </TabPane>
      </Tabs>
      </div>

      {/* Unhide reason modal */}
      <Modal
        title="Unhide Stock"
        open={unhideModal}
        onCancel={() => setUnhideModal(false)}
        onOk={handleUnhideConfirm}
        okText="Unhide"
        confirmLoading={unhideMutation.isPending}
      >
        <Text>You are about to make {selectedRowKeys.length} item(s) visible again in POS, stock and reports.</Text>
        <Form.Item label="Reason" style={{ marginTop: 16, marginBottom: 0 }} required>
          <TextArea rows={2} value={unhideReason} onChange={e => setUnhideReason(e.target.value)}
            placeholder="Why are these items being unhidden?" />
        </Form.Item>
      </Modal>

      <PageTour steps={tourSteps} />
    </div>
  );
}
