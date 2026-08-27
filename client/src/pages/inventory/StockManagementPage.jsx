/**
 * Complete Stock Management Page
 * - All stock entry types (Opening, Purchase, Manufactured, Goldsmith Received/Return, Branch Transfer/Receive)
 * - Full filters (Item Type, Purity, Metal, Weight Range, Vendor, Branch, Collection, Barcode)
 * - Stock reports (Available, Sold, Dead, Fast Moving, Branch Wise, Purity Wise)
 * - CRUD: Edit, Delete, Mark Sold/Unsold
 */
import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  Table, Button, Input, Select, Space, Tag, Typography, Card,
  Tooltip, Row, Col, Statistic, Tabs, Modal, Form, InputNumber,
  Divider, message, Popconfirm, Switch, Badge,
} from 'antd';
import {
  PlusOutlined, SearchOutlined, BarcodeOutlined, EditOutlined,
  EyeOutlined, DeleteOutlined, SwapOutlined, UploadOutlined,
  FilterOutlined, DownloadOutlined, PrinterOutlined, QrcodeOutlined,
  EyeInvisibleOutlined, StarOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  ornamentsApi, masterApi, karigarApi, masterExtApi, catalogApi, reportsApi,
} from '../../api/modules';
import { formatCurrency, formatWeight, calculateOrnamentPrice } from '../../utils/calculations';
import { useGoldRate } from '../../hooks/useGoldRate';
import { printBarcodeLabel } from '../../utils/thermalReceipt';
import { useAuthStore } from '../../store/authStore';
import OrnamentDetailDrawer from './OrnamentDetailDrawer';
import ImageUploadPanel from '../catalog/ImageUploadPanel';
import FloorCounterTraySelect from '../../components/FloorCounterTraySelect';
import PageTour from '../../components/PageTour';
import dayjs from 'dayjs';
import { METAL_TYPES, METAL_TYPE_COLORS } from '../../utils/metalTypes';

const { Title, Text } = Typography;
const { Option } = Select;

// ── Stock Entry Modal (handles all 6 entry types) ─────────────────────────────
function StockEntryModal({ open, onClose, entryType, onSuccess }) {
  const [form] = Form.useForm();
  const [priceCalc, setPriceCalc] = useState(null);
  const { goldRate, rates } = useGoldRate();
  const { user } = useAuthStore();
  const qc = useQueryClient();

  const { data: itemTypes } = useQuery({ queryKey: ['item-types'], queryFn: () => masterApi.getItemTypes().then(r => r.data.data) });
  const { data: purities } = useQuery({ queryKey: ['purities'], queryFn: () => masterApi.getPurities().then(r => r.data.data) });
  const { data: designs } = useQuery({ queryKey: ['designs'], queryFn: () => masterApi.getDesigns().then(r => r.data.data) });
  const { data: collections } = useQuery({ queryKey: ['collections'], queryFn: () => masterExtApi.getCollections().then(r => r.data.data) });
  const { data: vendors } = useQuery({ queryKey: ['vendors-all'], queryFn: () => karigarApi.getVendors().then(r => r.data.data) });
  const { data: makingCharges } = useQuery({ queryKey: ['making-charges'], queryFn: () => masterExtApi.getMakingCharges().then(r => r.data.data) });

  // See AddOrnamentPage.jsx for why metal type gates the Purity dropdown
  // and whether Purity/gold rate are required at all.
  const metalType = Form.useWatch('Metal_Type', form);
  const isDiamond = metalType === 'Diamond';
  const filteredPurities = (purities || []).filter(p => !metalType || p.Metal_Type === metalType);

  const saveMutation = useMutation({
    mutationFn: (data) => ornamentsApi.create(data),
    onSuccess: (res) => {
      message.success(`Stock added! Article: ${res.data.data.Article_Number}`);
      qc.invalidateQueries(['ornaments']);
      form.resetFields();
      setPriceCalc(null);
      onSuccess?.();
      onClose();
    },
    onError: (err) => message.error(err.response?.data?.message || 'Failed.'),
  });

  const recalculate = () => {
    const v = form.getFieldsValue();
    if (!v.Net_Gold_Weight || !v.Current_Gold_Rate || !v.Base_Making_Charge_Per_Gram) return;
    const result = calculateOrnamentPrice({
      netGoldWeight: v.Net_Gold_Weight,
      goldRate: v.Current_Gold_Rate,
      makingChargePerGram: v.Base_Making_Charge_Per_Gram,
      wastagePercent: v.Wastage_Percentage || 3,
      discountPercent: v.Discount_Percentage || 0,
      gstPercent: 3,
    });
    setPriceCalc(result);
    form.setFieldsValue({
      Taxable_Value: parseFloat(result.taxableValue),
      GST_Amount: parseFloat(result.gstAmount),
      Total_Price: parseFloat(result.totalPrice),
      Purchase_Cost: parseFloat((result.totalPrice * 0.85).toFixed(2)),
    });
  };

  const onMakingChargeSelect = (mcId) => {
    const mc = (makingCharges || []).find(m => m.MC_ID === mcId);
    if (mc && mc.Charge_Type === 'Per Gram') {
      form.setFieldValue('Base_Making_Charge_Per_Gram', mc.Charge_Value);
      recalculate();
    }
  };

  const titles = {
    Opening: '📦 Opening Stock Entry',
    Purchase: '🛒 Purchase Stock Entry',
    Manufactured: '⚒️ Manufactured Stock Entry',
    GoldsmithReceived: '✅ Goldsmith Received Stock',
    GoldsmithReturn: '↩️ Goldsmith Return Stock',
  };

  return (
    <Modal title={titles[entryType] || '+ Add Stock'} open={open} onCancel={onClose}
      footer={null} width={800} destroyOnClose>
      <Form form={form} layout="vertical" onFinish={v => saveMutation.mutate({
        ...v,
        // Stock_Entry_Type (Opening/Purchase/Manufactured/...) isn't a real
        // column on tbl_ornament_master — it never was, which is why every
        // single save through this modal 500'd before this fix, regardless
        // of which entry type was chosen. Dropped rather than sent, since
        // there's nowhere to persist it without a schema change; entryType
        // still drives the modal's own title/labels above.
        Gross_Weight: v.Gross_Weight,
        // Total_Stone_Carat is the REAL column for a stone/diamond's carat
        // weight (same one Total_Stone_Carat is used for elsewhere) — the
        // field used to submit as "Diamond_Weight", which isn't a column
        // either and 500'd the same way.
        Net_Gold_Weight: v.Net_Gold_Weight || (parseFloat(v.Gross_Weight||0) - parseFloat(v.Stone_Weight||0) - parseFloat(v.Total_Stone_Carat||0)),
        Purchase_Cost: v.Purchase_Cost || parseFloat(priceCalc?.totalPrice || 0) * 0.85,
        Created_By: user?.username,
      })}
      onValuesChange={recalculate}>
        <Row gutter={16}>
          <Col xs={8}><Form.Item name="Metal_Type" label="Metal Type" rules={[{required:true, message: 'Select the metal type'}]} initialValue="Gold">
            <Select onChange={() => form.setFieldValue('Purity_ID', undefined)}>
              {METAL_TYPES.map(m => <Option key={m} value={m}>{m}</Option>)}
            </Select>
          </Form.Item></Col>
          <Col xs={8}><Form.Item name="Type_ID" label="Item Type" rules={[{required:true}]}>
            <Select showSearch optionFilterProp="children" placeholder="Ring, Chain...">
              {(itemTypes||[]).map(t => <Option key={t.Type_ID} value={t.Type_ID}>{t.Type_Name}</Option>)}
            </Select>
          </Form.Item></Col>
          <Col xs={8}><Form.Item name="Design_ID" label="Design">
            <Select showSearch optionFilterProp="children" allowClear placeholder="Design code">
              {(designs||[]).map(d => <Option key={d.Design_ID} value={d.Design_ID}>{d.Design_Code} — {d.Design_Name}</Option>)}
            </Select>
          </Form.Item></Col>
          <Col xs={8}><Form.Item name="Collection_ID" label="Collection">
            <Select allowClear placeholder="Wedding 2026...">
              {(collections||[]).map(c => <Option key={c.Collection_ID} value={c.Collection_ID}>{c.Collection_Name}</Option>)}
            </Select>
          </Form.Item></Col>
        </Row>
        <Row gutter={16}>
          <Col xs={8}>
            {!isDiamond && (
              <Form.Item name="Purity_ID" label="Purity" rules={[{required:true}]}>
                <Select placeholder={metalType ? `${metalType} purity` : '22K, 18K...'}>
                  {filteredPurities.map(p => <Option key={p.Purity_ID} value={p.Purity_ID}>{p.Purity_Code} ({p.Percentage}%)</Option>)}
                </Select>
              </Form.Item>
            )}
          </Col>
          <Col xs={8}><Form.Item name="HUID_Number" label="HUID Number">
            <Input placeholder="BIS Hallmark HUID" />
          </Form.Item></Col>
          <Col xs={8}><Form.Item name="Hallmark_Certificate_No" label="Hallmark Cert No">
            <Input placeholder="Hallmark certificate" />
          </Form.Item></Col>
        </Row>

        <Divider>Weight Details (in grams)</Divider>
        <Row gutter={16}>
          <Col xs={6}><Form.Item name="Gross_Weight" label="Gross Weight (g)" rules={[{required:true}]}>
            <InputNumber style={{width:'100%'}} step={0.001} min={0.001} precision={3} />
          </Form.Item></Col>
          <Col xs={6}><Form.Item name="Stone_Weight" label="Stone Weight (g)" initialValue={0}>
            <InputNumber style={{width:'100%'}} step={0.001} min={0} precision={3} />
          </Form.Item></Col>
          <Col xs={6}><Form.Item name="Total_Stone_Carat" label="Diamond/Stone Wt (ct)" initialValue={0}>
            <InputNumber style={{width:'100%'}} step={0.001} min={0} precision={3} />
          </Form.Item></Col>
          <Col xs={6}><Form.Item name="Net_Gold_Weight" label="Net Gold Wt (g)" initialValue={isDiamond ? 0 : undefined} rules={[{required: !isDiamond}]}>
            <InputNumber style={{width:'100%'}} step={0.001} min={0} precision={3} placeholder={isDiamond ? '0 (no gold content)' : undefined} />
          </Form.Item></Col>
        </Row>

        <Divider>Pricing</Divider>
        <Row gutter={16}>
          <Col xs={6}><Form.Item name="Current_Gold_Rate" label="Gold Rate (₹/g)" initialValue={isDiamond ? 0 : goldRate} rules={[{required: !isDiamond}]}>
            <InputNumber style={{width:'100%'}} min={0} />
          </Form.Item></Col>
          <Col xs={5}><Form.Item name="MC_ID" label="Making Charge Type">
            <Select allowClear onChange={onMakingChargeSelect} placeholder="Select">
              {(makingCharges||[]).map(m => <Option key={m.MC_ID} value={m.MC_ID}>{m.MC_Name}</Option>)}
            </Select>
          </Form.Item></Col>
          <Col xs={5}><Form.Item name="Base_Making_Charge_Per_Gram" label="Making ₹/g" rules={[{required:true}]}>
            <InputNumber style={{width:'100%'}} min={0} />
          </Form.Item></Col>
          <Col xs={4}><Form.Item name="Wastage_Percentage" label="Wastage %" initialValue={3}>
            <InputNumber style={{width:'100%'}} min={0} max={20} step={0.5} />
          </Form.Item></Col>
          <Col xs={4}><Form.Item name="Discount_Percentage" label="Discount %" initialValue={0}>
            <InputNumber style={{width:'100%'}} min={0} max={100} step={0.5} />
          </Form.Item></Col>
        </Row>

        {priceCalc && (
          <Card size="small" style={{background:'#fafafa',borderRadius:6,marginBottom:12}}>
            <Row gutter={16}>
              {[
                {l:'Gold Value', v:priceCalc.goldValue, c:'#B8860B'},
                {l:'Making', v:priceCalc.makingChargeTotal, c:'#1890ff'},
                {l:'Wastage', v:priceCalc.wastageAmount, c:'#fa8c16'},
                {l:'Taxable', v:priceCalc.taxableValue, c:'#722ed1'},
                {l:'GST 3%', v:priceCalc.gstAmount, c:'#52c41a'},
                {l:'MRP', v:priceCalc.totalPrice, c:'#B8860B'},
              ].map(s => (
                <Col xs={4} key={s.l}>
                  <Statistic title={<Text style={{fontSize:10}}>{s.l}</Text>}
                    value={parseFloat(s.v)} formatter={v => `₹${parseFloat(v).toLocaleString('en-IN',{minimumFractionDigits:0})}`}
                    valueStyle={{fontSize:12,fontWeight:700,color:s.c}} />
                </Col>
              ))}
            </Row>
          </Card>
        )}

        <Row gutter={16}>
          <Col xs={8}><Form.Item name="Purchase_Cost" label="Purchase Cost (₹)" rules={[{required:true}]}>
            <InputNumber style={{width:'100%'}} min={0} formatter={v=>`₹ ${v}`} />
          </Form.Item></Col>
          <Col xs={8}><Form.Item name="Article_Number" label="Article No (leave blank = auto)">
            <Input placeholder="Auto-generated if empty" />
          </Form.Item></Col>
          <Col xs={8}><Form.Item name="Physical_Location" label="Location Note (optional)">
            <Input placeholder="GF-CTR-A-R01" />
          </Form.Item></Col>
        </Row>

        <Divider>Stock Location</Divider>
        <Row gutter={16}>
          <FloorCounterTraySelect form={form} colSpan={8} />
        </Row>

        <Row gutter={16}>
          <Col xs={12}><Form.Item name="Supplier_ID" label="Supplier">
            <Select allowClear showSearch optionFilterProp="children">
              {(vendors||[]).filter(v=>['Supplier','Both'].includes(v.Vendor_Type)).map(v=><Option key={v.Vendor_ID} value={v.Vendor_ID}>{v.Vendor_Name}</Option>)}
            </Select>
          </Form.Item></Col>
          <Col xs={12}><Form.Item name="Karigar_ID" label="Karigar (if applicable)">
            <Select allowClear showSearch optionFilterProp="children">
              {(vendors||[]).filter(v=>['Karigar','Both'].includes(v.Vendor_Type)).map(v=><Option key={v.Vendor_ID} value={v.Vendor_ID}>{v.Vendor_Name}</Option>)}
            </Select>
          </Form.Item></Col>
        </Row>
        <Form.Item name="Special_Instructions" label="Notes">
          <Input.TextArea rows={2} placeholder="Any special notes, stone details..." />
        </Form.Item>
        <Button type="primary" htmlType="submit" block size="large"
          loading={saveMutation.isPending}
          style={{background:'#B8860B',borderColor:'#B8860B',fontWeight:700}}>
          Save Stock Entry & Generate Barcode
        </Button>
      </Form>
    </Modal>
  );
}

// ── Edit Ornament Modal ───────────────────────────────────────────────────────
function EditOrnamentModal({ ornamentId, open, onClose }) {
  const [form] = Form.useForm();
  const qc = useQueryClient();
  const { data: purities } = useQuery({ queryKey: ['purities'], queryFn: () => masterApi.getPurities().then(r => r.data.data) });

  const { data: ornament } = useQuery({
    queryKey: ['ornament-edit', ornamentId],
    queryFn: () => ornamentsApi.getById(ornamentId).then(r => r.data.data),
    enabled: !!ornamentId && open,
  });

  // TanStack Query v5 removed the onSuccess callback from useQuery (mutations only) —
  // populate the form reactively instead of relying on a callback that never fires.
  useEffect(() => {
    if (ornament) form.setFieldsValue(ornament);
  }, [ornament, form]);

  const updateMutation = useMutation({
    mutationFn: (d) => ornamentsApi.update(ornamentId, d),
    onSuccess: () => { message.success('Updated!'); qc.invalidateQueries(['ornaments']); onClose(); },
    onError: (err) => message.error(err.response?.data?.message || 'Failed.'),
  });

  return (
    <Modal title="Edit Stock Item" open={open} onCancel={onClose} footer={null} width={600} destroyOnClose>
      <Form form={form} layout="vertical" onFinish={v => updateMutation.mutate(v)}>
        <Row gutter={16}>
          <Col xs={12}><Form.Item name="Metal_Type" label="Metal Type" rules={[{required:true}]}>
            <Select>{METAL_TYPES.map(m => <Option key={m} value={m}>{m}</Option>)}</Select>
          </Form.Item></Col>
          <Col xs={12}><Form.Item name="Hallmark_Certificate_No" label="Hallmark No"><Input /></Form.Item></Col>
        </Row>
        <Row gutter={16}>
          <Col xs={12}><Form.Item name="Physical_Location" label="Location Note (optional)"><Input placeholder="GF-CTR-A-R01" /></Form.Item></Col>
        </Row>

        <Divider>Stock Location</Divider>
        <Row gutter={16}>
          <FloorCounterTraySelect form={form} colSpan={8} />
        </Row>

        <Row gutter={16}>
          <Col xs={8}><Form.Item name="Current_Gold_Rate" label="Gold Rate ₹/g" rules={[{required:true}]}><InputNumber style={{width:'100%'}} min={1} /></Form.Item></Col>
          <Col xs={8}><Form.Item name="Base_Making_Charge_Per_Gram" label="Making ₹/g" rules={[{required:true}]}><InputNumber style={{width:'100%'}} min={0} /></Form.Item></Col>
          <Col xs={8}><Form.Item name="Wastage_Percentage" label="Wastage %"><InputNumber style={{width:'100%'}} min={0} max={20} /></Form.Item></Col>
        </Row>
        <Row gutter={16}>
          <Col xs={8}><Form.Item name="Purchase_Cost" label="Purchase Cost ₹"><InputNumber style={{width:'100%'}} min={0} /></Form.Item></Col>
          <Col xs={8}><Form.Item name="Total_Price" label="Selling Price (MRP) ₹"><InputNumber style={{width:'100%'}} min={0} /></Form.Item></Col>
          <Col xs={8}><Form.Item name="HUID_Number" label="HUID Number"><Input /></Form.Item></Col>
        </Row>
        <Row gutter={16}>
          <Col xs={12}><Form.Item name="Is_On_Display" label="On Display" valuePropName="checked"><Switch /></Form.Item></Col>
          <Col xs={12}><Form.Item name="Is_Reserved" label="Reserved" valuePropName="checked"><Switch /></Form.Item></Col>
        </Row>
        <Form.Item name="Special_Instructions" label="Notes"><Input.TextArea rows={2} /></Form.Item>
        <Button type="primary" htmlType="submit" block loading={updateMutation.isPending}
          style={{background:'#B8860B',borderColor:'#B8860B'}}>Update Stock</Button>
      </Form>
    </Modal>
  );
}

// ── Main Stock Management Page ────────────────────────────────────────────────
export default function StockManagementPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user } = useAuthStore();

  // Filters
  const [filters, setFilters] = useState({
    search: '', typeId: '', purityId: '', metalType: '', isAvailable: '', isSold: '',
    // Screen 1 (this page) defaults to Normal Stock only — Special Stock
    // (in-house karigar/reserved/etc.) lives on its own screen (Inventory
    // → Special Stock), which shows the full reconciliation (Normal +
    // Special = Combined). Clear this filter here to see everything on
    // this screen too — it's a default, not a restriction.
    minPrice: '', maxPrice: '', classification: 'Normal', page: 1, limit: 50,
  });
  const [activeTab, setActiveTab] = useState('available');
  const [entryModal, setEntryModal] = useState(null); // entry type string
  const [editId, setEditId] = useState(null);
  const [detailId, setDetailId] = useState(null);
  const [barcodeSearch, setBarcodeSearch] = useState('');
  const [selectedRowKeys, setSelectedRowKeys] = useState([]);
  const [specialStockModal, setSpecialStockModal] = useState(false);
  const [specialStockForm] = Form.useForm();

  // ── Walkthrough tour refs ───────────────────────────────────────────────────
  const addStockRef = useRef(null);
  const barcodeSearchRef = useRef(null);
  const printBtnRef = useRef(null);
  const tourSteps = [
    { title: '1. Add Stock', description: 'Choose the entry type (Opening, Purchase, Manufactured, Goldsmith Received) and click Add Stock to bring new items into inventory — a barcode is generated automatically.', target: () => addStockRef.current },
    { title: '2. Scan / Search', description: 'Scan or type a barcode here to instantly pull up any item\'s full details.', target: () => barcodeSearchRef.current },
    { title: '3. Print Barcode Label', description: 'Click this icon on any row to print a barcode/RFID tag for that item.', target: () => printBtnRef.current },
    { title: '4. Connect Your Barcode Printer', description: 'For labels to print silently straight to your barcode printer (e.g. Printronix): install QZ Tray on this computer, then go to Admin → Printer Settings and assign your printer to the "Thermal Label" role. Without that setup, this opens the normal print dialog instead.' },
  ];

  const { data: itemTypes } = useQuery({ queryKey: ['item-types'], queryFn: () => masterApi.getItemTypes().then(r => r.data.data) });
  const { data: purities } = useQuery({ queryKey: ['purities'], queryFn: () => masterApi.getPurities().then(r => r.data.data) });

  // Compute filters based on active tab
  const tabFilters = {
    available: { isAvailable: 'true', isSold: 'false' },
    sold: { isSold: 'true' },
    all: {},
    reserved: { isAvailable: 'true', isSold: 'false' },
  };

  const activeFilters = { ...filters, ...tabFilters[activeTab] };

  const { data: inventoryData, isLoading } = useQuery({
    queryKey: ['ornaments', activeFilters],
    queryFn: () => ornamentsApi.getAll(activeFilters).then(r => r.data.data),
    keepPreviousData: true,
  });

  const { data: inventoryReport } = useQuery({
    queryKey: ['inventory-value'],
    queryFn: () => reportsApi.inventoryValue().then(r => r.data.data),
  });

  // ── Batch-fetch images for every row on the current page in ONE request,
  // instead of each row's ImageUploadPanel firing its own /catalog/images call ──
  const pageOrnamentIds = (inventoryData?.items || []).map(i => i.Ornament_ID);
  const ornamentIdsKey = pageOrnamentIds.join(',');
  const { data: imagesBatch } = useQuery({
    queryKey: ['ornament-images-batch', ornamentIdsKey],
    queryFn: () => catalogApi.getImages({ ornament_ids: ornamentIdsKey }).then(r => r.data.data || []),
    enabled: pageOrnamentIds.length > 0,
  });
  const imagesByOrnament = React.useMemo(() => {
    const map = {};
    (imagesBatch || []).forEach(img => {
      (map[img.Ornament_ID] ||= []).push(img);
    });
    return map;
  }, [imagesBatch]);

  const deleteMutation = useMutation({
    mutationFn: (id) => ornamentsApi.update(id, { Is_Active: false }),
    onSuccess: () => { message.success('Removed from stock.'); qc.invalidateQueries(['ornaments']); },
    onError: () => message.error('Failed.'),
  });

  // Catalog visibility only — does NOT touch Is_Active/Is_Hidden/Is_Sold, so
  // billing, inventory counts, and GST/sales reports are unaffected either
  // way. Selected items simply stop (or start) appearing in the
  // customer-facing catalog (routes/productCatalog.js).
  const catalogVisibilityMutation = useMutation({
    mutationFn: (showInCatalog) => ornamentsApi.setCatalogVisibility(selectedRowKeys, showInCatalog),
    onSuccess: (res, showInCatalog) => {
      message.success(res.data.message || `${selectedRowKeys.length} item(s) updated.`);
      setSelectedRowKeys([]);
      qc.invalidateQueries(['ornaments']);
    },
    onError: (err) => message.error(err.response?.data?.message || 'Failed to update catalog visibility.'),
  });

  // Special Stock Isolation — an operational/display classification only
  // (which screen an item shows on by default). Never touches Is_Active/
  // Is_Hidden/Is_Sold/Data_Mode/Show_In_Catalog — billing, GST, and every
  // report stay completely unaffected either way. See the migration
  // comment (20260826000000_add_stock_classification.js) for the full
  // rationale — one inventory ledger, one barcode, one accounting system.
  const classificationMutation = useMutation({
    mutationFn: ({ classification, specialType, reason }) =>
      ornamentsApi.setStockClassification({ ornamentIds: selectedRowKeys, classification, specialType, reason }),
    onSuccess: (res) => {
      message.success(res.data.message || 'Classification updated.');
      setSelectedRowKeys([]);
      setSpecialStockModal(false);
      specialStockForm.resetFields();
      qc.invalidateQueries(['ornaments']);
    },
    onError: (err) => message.error(err.response?.data?.message || 'Failed to update classification.'),
  });

  const handleBarcodeSearch = async () => {
    if (!barcodeSearch.trim()) return;
    try {
      const res = await ornamentsApi.getByBarcode(barcodeSearch.trim());
      const item = res.data.data;
      if (item) setDetailId(item.Ornament_ID);
      else message.error('Not found.');
    } catch { message.error('Barcode not found.'); }
    setBarcodeSearch('');
  };

  const printLabel = (ornament) => printBarcodeLabel(ornament, user?.companyName).then((result) => {
    if (!result?.success) message.warning('Label sent to the fallback print dialog — the configured barcode printer may be offline.');
  });

  const exportCSV = () => {
    const items = inventoryData?.items || [];
    if (!items.length) { message.warning('No data.'); return; }
    const headers = ['Article_Number','Type_Name','Metal_Type','Purity_Code','Gross_Weight','Net_Gold_Weight','Stone_Weight','Total_Price','Physical_Location','Is_Sold'];
    const rows = items.map(r => headers.map(h => `"${r[h] ?? ''}"`).join(','));
    const blob = new Blob([[headers.join(','), ...rows].join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `stock_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  const columns = [
    {
      title: 'Article / Barcode',
      dataIndex: 'Article_Number',
      width: 160,
      fixed: 'left',
      render: (v, r) => (
        <Space direction="vertical" size={0}>
          <Space><BarcodeOutlined style={{color:'#B8860B'}} /><Text copyable style={{fontSize:11}}>{v}</Text></Space>
          {r.HUID_Number && <Tag color="gold" style={{fontSize:9}}>HUID: {r.HUID_Number}</Tag>}
        </Space>
      ),
    },
    {
      title: 'Item Details',
      render: (_, r) => (
        <div>
          <Text strong style={{fontSize:13}}>{r.Type_Name || '-'}</Text>
          {r.Design_Name && <><br/><Text style={{fontSize:11,color:'#888'}}>{r.Design_Name}</Text></>}
          {r.Metal_Type && <Tag color={METAL_TYPE_COLORS[r.Metal_Type] || 'default'} style={{fontSize:10,marginLeft:4}}>{r.Metal_Type}</Tag>}
          {r.Purity_Code && <Tag color="gold" style={{fontSize:10,marginLeft:4}}>{r.Purity_Code}</Tag>}
        </div>
      ),
    },
    {
      title: 'Weight',
      render: (_, r) => (
        <div style={{fontSize:11}}>
          <div>Gross: <b>{formatWeight(r.Gross_Weight)}</b></div>
          <div style={{color:'#888'}}>Net: {formatWeight(r.Net_Gold_Weight)}</div>
          {parseFloat(r.Stone_Weight||0) > 0 && <div style={{color:'#888'}}>Stone: {formatWeight(r.Stone_Weight)}</div>}
        </div>
      ),
      width: 110,
    },
    { title: 'Making/g', dataIndex: 'Base_Making_Charge_Per_Gram', width: 90, render: v => <Text style={{fontSize:11}}>{formatCurrency(v)}</Text> },
    { title: 'MRP', dataIndex: 'Total_Price', width: 120, render: v => <Text strong style={{color:'#B8860B',fontSize:13}}>{formatCurrency(v)}</Text> },
    {
      title: 'Status',
      width: 100,
      render: (_, r) => {
        if (r.Is_Sold) return <Tag color="red">Sold</Tag>;
        if (r.Is_Reserved) return <Tag color="blue">Reserved</Tag>;
        if (r.Is_On_Display) return <Tag color="purple">On Display</Tag>;
        if (!r.Is_Stock_Available) return <Tag color="orange">Unavailable</Tag>;
        return <Tag color="green">Available</Tag>;
      },
    },
    { title: 'Location', dataIndex: 'Physical_Location', width: 100, render: v => <Text style={{fontSize:11,fontFamily:'monospace'}}>{v || '-'}</Text> },
    {
      title: 'Catalog',
      dataIndex: 'Show_In_Catalog',
      width: 90,
      render: v => v === false
        ? <Tag icon={<EyeInvisibleOutlined />} color="default">Hidden</Tag>
        : <Tag color="cyan">Visible</Tag>,
    },
    {
      title: 'Classification',
      dataIndex: 'Stock_Classification',
      width: 130,
      render: (v, r) => v === 'Special'
        ? (
          <Space direction="vertical" size={0}>
            <Tag icon={<StarOutlined />} color="gold">Special</Tag>
            {r.Special_Stock_Type && <Text style={{ fontSize: 10, color: '#888' }}>{r.Special_Stock_Type}</Text>}
          </Space>
        )
        : <Tag color="default">Normal</Tag>,
    },
    {
      title: 'Actions',
      width: 160,
      fixed: 'right',
      render: (_, r, index) => (
        <Space size={2} wrap>
          <Tooltip title="View Detail"><Button type="text" size="small" icon={<EyeOutlined />} onClick={() => setDetailId(r.Ornament_ID)} /></Tooltip>
          <Tooltip title="Edit"><Button type="text" size="small" icon={<EditOutlined />} onClick={() => setEditId(r.Ornament_ID)} /></Tooltip>
          <Tooltip title="Print Barcode Label"><Button ref={index === 0 ? printBtnRef : undefined} type="text" size="small" icon={<BarcodeOutlined />} onClick={() => printLabel(r)} /></Tooltip>
          {/* Image upload — directly linked to this inventory item */}
          <ImageUploadPanel
            ornamentId={r.Ornament_ID}
            articleNumber={r.Article_Number}
            images={imagesByOrnament[r.Ornament_ID] || []}
            onChanged={() => qc.invalidateQueries(['ornament-images-batch'])}
            compact={true}
          />
          {!r.Is_Sold && (
            <Tooltip title="Remove">
              <Popconfirm title="Remove this item from active stock?" onConfirm={() => deleteMutation.mutate(r.Ornament_ID)} okText="Remove" okButtonProps={{danger:true}}>
                <Button type="text" size="small" danger icon={<DeleteOutlined />} />
              </Popconfirm>
            </Tooltip>
          )}
        </Space>
      ),
    },
  ];

  const summaryCards = [
    { label: 'Total Items', value: inventoryData?.total || 0, color: '#B8860B' },
    { label: 'Available', value: (inventoryData?.items||[]).filter(i=>!i.Is_Sold && i.Is_Stock_Available).length, color: '#52c41a' },
    { label: 'Sold', value: (inventoryData?.items||[]).filter(i=>i.Is_Sold).length, color: '#ff4d4f' },
    { label: 'Total MRP', value: parseFloat(inventoryReport?.overall?.total_mrp||0), formatter: formatCurrency, color: '#1890ff' },
  ];

  const entryTypes = [
    { key: 'Opening', label: '📦 Opening Stock', desc: 'Initial stock when you start using ERP' },
    { key: 'Purchase', label: '🛒 Purchase Entry', desc: 'New stock received from supplier' },
    { key: 'Manufactured', label: '⚒️ Manufactured', desc: 'Made by karigar, now in stock' },
    { key: 'GoldsmithReceived', label: '✅ Goldsmith Received', desc: 'Received finished goods from goldsmith' },
  ];

  return (
    <div className="page-wrapper">
      <div className="page-header">
        <div>
          <div className="page-header-title">📦 Stock Management</div>
          <div className="page-header-sub">Manage all jewellery stock — barcode, weight, purity, price, location</div>
        </div>
        <Space wrap>
          <Button icon={<DownloadOutlined />} onClick={exportCSV}>Export CSV</Button>
          <Select defaultValue="Opening" style={{width: 160}} onChange={v => setEntryModal(v)}>
            {entryTypes.map(e => <Option key={e.key} value={e.key}>{e.label}</Option>)}
          </Select>
          <Button
            ref={addStockRef}
            type="primary"
            icon={<PlusOutlined />}
            style={{ background: '#B8860B', borderColor: '#B8860B', fontWeight: 600 }}
            onClick={() => setEntryModal('Purchase')}
          >
            Add Stock
          </Button>
        </Space>
      </div>

      {/* Summary cards — 2 per row mobile, 4 per row desktop */}
      <Row gutter={[10, 10]} style={{ marginBottom: 14 }}>
        {summaryCards.map((s, i) => (
          <Col xs={12} sm={6} key={i}>
            <Card
              className="kpi-card"
              bodyStyle={{ padding: '12px 14px' }}
              style={{ borderRadius: 10, border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.07)', borderTop: `3px solid ${s.color}` }}
            >
              <Statistic
                title={<Text style={{ fontSize: 11, color: '#888' }}>{s.label}</Text>}
                value={s.value}
                formatter={s.formatter ? v => s.formatter(v) : undefined}
                valueStyle={{ color: s.color, fontSize: 17, fontWeight: 700 }}
              />
            </Card>
          </Col>
        ))}
      </Row>

      {/* Barcode scan + filters — wraps on mobile */}
      <Card className="erp-card" style={{ marginBottom: 10 }} bodyStyle={{ padding: '12px 16px' }}>
        <Space wrap style={{ width: '100%', gap: 8 }}>
          <div ref={barcodeSearchRef} style={{ width: '100%', maxWidth: 340 }}>
          <Space.Compact style={{ width: '100%' }}>
            <Input
              prefix={<BarcodeOutlined style={{ color: '#B8860B' }} />}
              placeholder="Scan / enter barcode to find item"
              value={barcodeSearch}
              onChange={e => setBarcodeSearch(e.target.value)}
              onPressEnter={handleBarcodeSearch}
              style={{ minWidth: 200 }}
            />
            <Button onClick={handleBarcodeSearch} icon={<SearchOutlined />} style={{ background: '#B8860B', color: '#fff', border: 'none' }}>Find</Button>
          </Space.Compact>
          </div>
          <Select placeholder="Item Type" style={{ minWidth: 130 }} allowClear onChange={v => setFilters(f => ({ ...f, typeId: v || '', page: 1 }))}>
            {(itemTypes||[]).map(t => <Option key={t.Type_ID} value={t.Type_ID}>{t.Type_Name}</Option>)}
          </Select>
          <Select placeholder="Purity" style={{ minWidth: 100 }} allowClear onChange={v => setFilters(f => ({ ...f, purityId: v || '', page: 1 }))}>
            {(purities||[]).map(p => <Option key={p.Purity_ID} value={p.Purity_ID}>{p.Purity_Code}</Option>)}
          </Select>
          <Select placeholder="Metal Type" style={{ minWidth: 120 }} allowClear onChange={v => setFilters(f => ({ ...f, metalType: v || '', page: 1 }))}>
            {METAL_TYPES.map(m => <Option key={m} value={m}>{m}</Option>)}
          </Select>
          <Tooltip title="Defaults to Normal Stock — clear or switch to see Special Stock here too. The full breakdown always lives on the Special Stock screen (Inventory menu).">
            <Select value={filters.classification || undefined} placeholder="All Stock" style={{ minWidth: 130 }} allowClear
              onChange={v => setFilters(f => ({ ...f, classification: v || '', page: 1 }))}>
              <Option value="Normal">Normal Stock</Option>
              <Option value="Special">Special Stock</Option>
            </Select>
          </Tooltip>
          <Input.Search
            placeholder="Search article, type, design..."
            style={{ minWidth: 200 }}
            allowClear
            onSearch={v => setFilters(f => ({ ...f, search: v, page: 1 }))}
          />
          <InputNumber placeholder="Min ₹" style={{ width: 90 }} onChange={v => setFilters(f => ({ ...f, minPrice: v || '' }))} />
          <InputNumber placeholder="Max ₹" style={{ width: 90 }} onChange={v => setFilters(f => ({ ...f, maxPrice: v || '' }))} />
        </Space>
      </Card>

      {/* Tabs */}
      <Tabs activeKey={activeTab} onChange={k => { setActiveTab(k); setFilters(f => ({ ...f, page: 1 })); }} type="card"
        items={[
          {
            key: 'available',
            label: <span>Available <Tag color="green">{(inventoryData?.items||[]).filter(i => !i.Is_Sold && i.Is_Stock_Available).length}</Tag></span>,
          },
          {
            key: 'sold',
            label: <span>Sold <Tag color="red">{(inventoryData?.items||[]).filter(i=>i.Is_Sold).length}</Tag></span>,
          },
          {
            key: 'all',
            label: 'All Stock',
          },
        ]}
      />

      {/* Bulk catalog-visibility toolbar — appears once anything is selected */}
      {selectedRowKeys.length > 0 && (
        <Card size="small" style={{ marginBottom: 10, background: '#fafafa' }} bodyStyle={{ padding: '8px 16px' }}>
          <Space wrap>
            <Text strong>{selectedRowKeys.length} selected</Text>
            <Button
              icon={<EyeInvisibleOutlined />}
              loading={catalogVisibilityMutation.isPending}
              onClick={() => catalogVisibilityMutation.mutate(false)}
            >
              Hide from Catalog
            </Button>
            <Button
              icon={<EyeOutlined />}
              loading={catalogVisibilityMutation.isPending}
              onClick={() => catalogVisibilityMutation.mutate(true)}
            >
              Show in Catalog
            </Button>
            <Button
              icon={<StarOutlined />}
              onClick={() => setSpecialStockModal(true)}
            >
              Classify as Special Stock
            </Button>
            <Button
              loading={classificationMutation.isPending}
              onClick={() => classificationMutation.mutate({ classification: 'Normal' })}
            >
              Classify as Normal Stock
            </Button>
            <Button type="text" onClick={() => setSelectedRowKeys([])}>Clear</Button>
          </Space>
        </Card>
      )}

      <Card style={{borderRadius:8,border:'none'}} bodyStyle={{padding:0}}>
        <Table
            scroll={{ x: "max-content" }} columns={columns} dataSource={inventoryData?.items||[]} loading={isLoading}
          rowKey="Ornament_ID" size="small"
          rowSelection={{ selectedRowKeys, onChange: setSelectedRowKeys }}
          pagination={{ total:inventoryData?.total||0, pageSize:filters.limit, current:filters.page,
            onChange:p=>setFilters(f=>({...f,page:p})), showTotal:t=>`${t} items`, showSizeChanger:false }} />
      </Card>

      {/* Modals */}
      <StockEntryModal open={!!entryModal} entryType={entryModal} onClose={()=>setEntryModal(null)}
        onSuccess={()=>qc.invalidateQueries(['ornaments'])} />
      <EditOrnamentModal ornamentId={editId} open={!!editId} onClose={()=>setEditId(null)} />
      <OrnamentDetailDrawer ornamentId={detailId} open={!!detailId} onClose={()=>setDetailId(null)} />

      {/* Classify as Special Stock — captures an optional type/reason so
          the audit log (Section 24 of the Special Stock spec) records WHY,
          not just what changed. Billing/GST/accounting are unaffected
          either way — this is purely which screen the item shows on. */}
      <Modal
        title={<Space><StarOutlined style={{ color: '#B8860B' }} />Classify as Special Stock</Space>}
        open={specialStockModal}
        onCancel={() => setSpecialStockModal(false)}
        footer={null}
        destroyOnClose
      >
        <Form
          form={specialStockForm}
          layout="vertical"
          onFinish={v => classificationMutation.mutate({ classification: 'Special', ...v })}
        >
          <Text type="secondary" style={{ fontSize: 12 }}>
            {selectedRowKeys.length} item(s) selected. This only changes which screen these items show on by
            default — billing, GST, and accounting are completely unaffected.
          </Text>
          <Form.Item name="specialType" label="Special Stock Type (optional)" style={{ marginTop: 16 }}>
            <Input placeholder="e.g. In-house Karigar, Special Collection, Reserved" />
          </Form.Item>
          <Form.Item name="reason" label="Reason (for the audit log)">
            <Input.TextArea rows={2} placeholder="Why is this stock being classified as Special?" />
          </Form.Item>
          <Button type="primary" htmlType="submit" block loading={classificationMutation.isPending}
            style={{ background: '#B8860B', borderColor: '#B8860B' }}>
            Classify {selectedRowKeys.length} Item(s) as Special Stock
          </Button>
        </Form>
      </Modal>

      <PageTour steps={tourSteps} />
    </div>
  );
}
