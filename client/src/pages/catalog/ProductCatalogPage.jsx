/**
 * Product Catalog — Migrated from Image App
 * Features: Barcode/QR search, image grid, product detail, exhibition view,
 *           sold report, design-wise view, order creation
 */
import React, { useState, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Row, Col, Card, Input, Button, Typography, Tag, Modal, Space,
  Tabs, Table, Image, Badge, Empty, Tooltip, Upload, message,
  Statistic, Drawer, Form, InputNumber,
} from 'antd';
import {
  SearchOutlined, BarcodeOutlined, EyeOutlined, ShopOutlined,
  AppstoreOutlined, BarChartOutlined, UploadOutlined, PlusOutlined,
  GoldOutlined, CameraOutlined, QrcodeOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../api/axios';
import { formatCurrency, formatWeight } from '../../utils/calculations';
import { useAuthStore } from '../../store/authStore';
import PageTour from '../../components/PageTour';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { TabPane } = Tabs;

export default function ProductCatalogPage() {
  const { user } = useAuthStore();
  const qc = useQueryClient();

  const [searchQ,      setSearchQ]      = useState('');
  // Sidebar links to /catalog?tab=exhibition, ?tab=designs, ?tab=sold —
  // this must actually read that instead of always opening on Search
  // regardless of which link was clicked (same bug fixed in BinManagementPage.jsx).
  const [searchParams, setSearchParams] = useSearchParams();
  const VALID_CATALOG_TABS = ['search', 'exhibition', 'designs', 'sold'];
  const tabParam = searchParams.get('tab');
  const activeTab = VALID_CATALOG_TABS.includes(tabParam) ? tabParam : 'search';
  const setActiveTab = (key) => setSearchParams(key === 'search' ? {} : { tab: key });
  const [detailItem,   setDetailItem]   = useState(null);
  const [orderDrawer,  setOrderDrawer]  = useState(false);
  const [orderItems,   setOrderItems]   = useState([]);
  const [orderForm]    = Form.useForm();
  const [soldFilters,  setSoldFilters]  = useState({ fromDate: '', toDate: '' });
  const [designFilter, setDesignFilter] = useState(null);

  // ── Walkthrough tour refs ───────────────────────────────────────────────────
  const searchRef = useRef(null);
  const tabsRef = useRef(null);
  const uploadRef = useRef(null);
  const orderRef = useRef(null);
  const tourSteps = [
    { title: '1. Barcode / Search', description: 'Scan a barcode or type an article number, item type or design name here to instantly find pieces in the catalog.', target: () => searchRef.current },
    { title: '2. Catalog Tabs', description: 'Search shows matching items with photos. Exhibition lists pieces currently on display. By Design groups items by design. Sold Report shows everything sold in a date range.', target: () => tabsRef.current },
    { title: '3. Upload a Photo', description: 'Open any item\'s detail view (click View on a card) — from there you can upload or replace its product photo, which then shows across the catalog and exhibition views.', target: () => uploadRef.current },
    { title: '4. Create Order', description: 'As you add items from the catalog, they collect here — click Create Order to record a customer order for everything you\'ve picked.', target: () => orderRef.current },
  ];

  // ── Queries ────────────────────────────────────────────────────────────────
  const { data: searchResults, isLoading: searchLoading, refetch: doSearch } = useQuery({
    queryKey: ['catalog-search', searchQ],
    queryFn: () => api.get('/catalog/search', { params: { q: searchQ, limit: 50 } }).then(r => r.data.data?.items || []),
    enabled: false,
  });

  const { data: exhibitionItems, isLoading: exLoading } = useQuery({
    queryKey: ['catalog-exhibition'],
    queryFn: () => api.get('/catalog/exhibition').then(r => r.data.data || []),
    enabled: activeTab === 'exhibition',
  });

  const { data: soldItems, isLoading: soldLoading } = useQuery({
    queryKey: ['catalog-sold', soldFilters],
    queryFn: () => api.get('/catalog/sold-report', { params: soldFilters }).then(r => r.data.data?.items || []),
    enabled: activeTab === 'sold',
  });

  const { data: designs, isLoading: desLoading } = useQuery({
    queryKey: ['catalog-designs'],
    queryFn: () => api.get('/catalog/designs').then(r => r.data.data || []),
    enabled: activeTab === 'designs',
  });

  const { data: designItems } = useQuery({
    queryKey: ['catalog-design-items', designFilter],
    queryFn: () => api.get('/catalog/search', { params: { design: designFilter } }).then(r => r.data.data?.items || []),
    enabled: !!designFilter,
  });

  // ── Mutations ──────────────────────────────────────────────────────────────
  const uploadMutation = useMutation({
    mutationFn: ({ file, articleNo }) => {
      const fd = new FormData();
      fd.append('image', file);
      fd.append('article_number', articleNo);
      fd.append('sort_order', '0');
      return api.post('/catalog/upload-image', fd, { headers: { 'Content-Type': undefined } });
    },
    onSuccess: () => { message.success('Image uploaded!'); qc.invalidateQueries(['catalog-search']); },
    onError: () => message.error('Upload failed.'),
  });

  const orderMutation = useMutation({
    mutationFn: (data) => api.post('/catalog/orders', data),
    onSuccess: () => { message.success('Order created!'); setOrderDrawer(false); setOrderItems([]); orderForm.resetFields(); },
  });

  const exhibitionMutation = useMutation({
    mutationFn: ({ id, display }) => api.put(`/catalog/exhibition/${id}`, { is_display: display }),
    onSuccess: () => { message.success('Updated.'); qc.invalidateQueries(['catalog-exhibition']); },
  });

  // ── Search handler ─────────────────────────────────────────────────────────
  const handleSearch = () => { if (searchQ.trim()) doSearch(); };

  const ItemCard = ({ item }) => (
    <Card hoverable bodyStyle={{ padding: 10 }} style={{ borderRadius: 8 }}
      cover={
        <div style={{ height: 140, overflow: 'hidden', background: '#f5f5f5', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '8px 8px 0 0' }}>
          {item.Product_Image_URL
            ? <img src={item.Product_Image_URL} alt={item.Article_Number} style={{ maxWidth: '100%', maxHeight: 140, objectFit: 'contain' }} />
            : <GoldOutlined style={{ fontSize: 40, color: '#d9d9d9' }} />
          }
        </div>
      }>
      <div>
        <Text code style={{ fontSize: 10 }}>{item.Article_Number}</Text>
        <br />
        <Text strong style={{ fontSize: 12 }}>{item.Type_Name}</Text>
        {item.Purity_Code && <Tag color="gold" style={{ fontSize: 9, marginLeft: 4 }}>{item.Purity_Code}</Tag>}
        <br />
        <Text style={{ fontSize: 11 }}>Gross: {formatWeight(item.Gross_Weight)}</Text>
        {item.Net_Gold_Weight && <Text style={{ fontSize: 11, marginLeft: 4 }}>| Net: {formatWeight(item.Net_Gold_Weight)}</Text>}
        <br />
        <Text strong style={{ color: '#B8860B', fontSize: 13 }}>{formatCurrency(item.Total_Price)}</Text>
        {item.Is_Sold && <Tag color="red" style={{ float: 'right', fontSize: 9 }}>Sold</Tag>}
        {item.Is_On_Display && <Tag color="purple" style={{ float: 'right', fontSize: 9 }}>Display</Tag>}
      </div>
      <Space size={4} style={{ marginTop: 6, width: '100%', justifyContent: 'space-between' }}>
        <Button size="small" icon={<EyeOutlined />} onClick={() => setDetailItem(item)}>View</Button>
        <Button size="small" icon={<PlusOutlined />}
          onClick={() => { setOrderItems(p => [...p, { article_number: item.Article_Number, name: item.Type_Name, price: item.Total_Price, qty: 1 }]); message.success('Added to order.'); }}>
          Order
        </Button>
      </Space>
    </Card>
  );

  return (
    <div className="page-wrapper">
      <div className="page-header">
        <div>
          <Title level={4} style={{ margin: 0 }}>🖼️ Product Catalog</Title>
          <Text type="secondary" style={{ fontSize: 12 }}>Barcode search · Image catalog · Exhibition · Sold report</Text>
        </div>
        <div ref={orderRef}>
        <Space>
          {orderItems.length > 0 && (
            <Badge count={orderItems.length} style={{ background: '#B8860B' }}>
              <Button type="primary" style={{ background: '#B8860B', borderColor: '#B8860B' }}
                onClick={() => setOrderDrawer(true)}>
                Create Order
              </Button>
            </Badge>
          )}
        </Space>
        </div>
      </div>

      <div ref={tabsRef}>
      <Tabs activeKey={activeTab} onChange={setActiveTab} type="card">

        {/* ── Search / Barcode ─────────────────────────────────────────── */}
        <TabPane tab={<span><BarcodeOutlined /> Search</span>} key="search">
          <div ref={searchRef}>
          <Space.Compact style={{ width: '100%', marginBottom: 16 }}>
            <Input size="large" prefix={<BarcodeOutlined style={{ color: '#B8860B' }} />}
              placeholder="Scan barcode / enter article number / search by type"
              value={searchQ} onChange={e => setSearchQ(e.target.value)} onPressEnter={handleSearch} />
            <Button type="primary" size="large" icon={<SearchOutlined />} onClick={handleSearch}
              loading={searchLoading} style={{ background: '#B8860B', borderColor: '#B8860B' }}>
              Search
            </Button>
          </Space.Compact>
          </div>

          {!searchResults && !searchLoading && (
            <Empty description="Enter barcode or search term to find items" />
          )}

          {searchResults && (
            <Row gutter={[12, 12]}>
              {searchResults.map(item => (
                <Col xs={12} sm={8} md={6} lg={4} key={item.Ornament_ID}>
                  <ItemCard item={item} />
                </Col>
              ))}
              {searchResults.length === 0 && <Col xs={24}><Empty description="No items found" /></Col>}
            </Row>
          )}
        </TabPane>

        {/* ── Exhibition ───────────────────────────────────────────────── */}
        <TabPane tab={<span><ShopOutlined /> Exhibition</span>} key="exhibition">
          <Row gutter={[12, 12]}>
            {(exhibitionItems || []).map(item => (
              <Col xs={12} sm={8} md={6} lg={4} key={item.Ornament_ID}>
                <Card hoverable bodyStyle={{ padding: 10 }} style={{ borderRadius: 8 }}
                  cover={
                    <div style={{ height: 140, background: '#f5f5f5', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '8px 8px 0 0' }}>
                      {item.Product_Image_URL
                        ? <img src={item.Product_Image_URL} alt={item.Article_Number} style={{ maxWidth: '100%', maxHeight: 140, objectFit: 'contain' }} />
                        : <GoldOutlined style={{ fontSize: 36, color: '#d9d9d9' }} />
                      }
                    </div>
                  }>
                  <Text code style={{ fontSize: 10 }}>{item.Article_Number}</Text>
                  <br />
                  <Text strong style={{ fontSize: 12 }}>{item.Type_Name}</Text>
                  <Tag color="gold" style={{ fontSize: 9, marginLeft: 4 }}>{item.Purity_Code}</Tag>
                  <br />
                  <Text style={{ color: '#B8860B', fontWeight: 600 }}>{formatCurrency(item.Total_Price)}</Text>
                  <Button size="small" block danger style={{ marginTop: 6 }}
                    onClick={() => exhibitionMutation.mutate({ id: item.Ornament_ID, display: false })}>
                    Remove from Display
                  </Button>
                </Card>
              </Col>
            ))}
            {!(exhibitionItems?.length) && !exLoading && <Col xs={24}><Empty description="No items on exhibition display" /></Col>}
          </Row>
        </TabPane>

        {/* ── Design Wise ──────────────────────────────────────────────── */}
        <TabPane tab={<span><AppstoreOutlined /> By Design</span>} key="designs">
          {!designFilter ? (
            <Row gutter={[12, 12]}>
              {(designs || []).map(d => (
                <Col xs={12} sm={8} md={6} lg={4} key={d.Design_ID}>
                  <Card hoverable onClick={() => setDesignFilter(d.Design_ID)}
                    style={{ borderRadius: 8, cursor: 'pointer' }} bodyStyle={{ padding: 10 }}>
                    {d.sample_image && <img src={d.sample_image} alt={d.Design_Name} style={{ width: '100%', height: 100, objectFit: 'contain', marginBottom: 6 }} />}
                    <Text strong style={{ fontSize: 12 }}>{d.Design_Name || d.Design_Code}</Text>
                    <br />
                    <Text type="secondary" style={{ fontSize: 11 }}>{d.Type_Name}</Text>
                    <br />
                    <Badge count={d.item_count} style={{ background: '#B8860B' }} /> items
                  </Card>
                </Col>
              ))}
            </Row>
          ) : (
            <>
              <Button onClick={() => setDesignFilter(null)} style={{ marginBottom: 12 }}>← All Designs</Button>
              <Row gutter={[12, 12]}>
                {(designItems || []).map(item => (
                  <Col xs={12} sm={8} md={6} lg={4} key={item.Ornament_ID}>
                    <ItemCard item={item} />
                  </Col>
                ))}
              </Row>
            </>
          )}
        </TabPane>

        {/* ── Sold Report ──────────────────────────────────────────────── */}
        <TabPane tab={<span><BarChartOutlined /> Sold Report</span>} key="sold">
          <Space style={{ marginBottom: 12 }}>
            <Input type="date" style={{ width: 150 }} value={soldFilters.fromDate}
              onChange={e => setSoldFilters(p => ({ ...p, fromDate: e.target.value }))} />
            <Input type="date" style={{ width: 150 }} value={soldFilters.toDate}
              onChange={e => setSoldFilters(p => ({ ...p, toDate: e.target.value }))} />
            <Button type="primary" onClick={() => qc.invalidateQueries(['catalog-sold', soldFilters])}
              style={{ background: '#B8860B', borderColor: '#B8860B' }}>Apply</Button>
          </Space>
          <Table
            scroll={{ x: "max-content" }}
            columns={[
              { title: 'Article No', dataIndex: 'Article_Number', render: v => <Text code style={{ fontSize: 11 }}>{v}</Text> },
              { title: 'Type', dataIndex: 'Item_Type_Name' },
              { title: 'Purity', dataIndex: 'Purity_Code', width: 70 },
              { title: 'Gross Wt', dataIndex: 'Gross_Weight', width: 90, render: v => formatWeight(v) },
              { title: 'Net Wt', dataIndex: 'Net_Gold_Weight', width: 90, render: v => formatWeight(v) },
              { title: 'Amount', dataIndex: 'Total_Line_Price', render: v => <Text strong style={{ color: '#B8860B' }}>{formatCurrency(v)}</Text> },
              { title: 'Customer', dataIndex: 'Customer_Name' },
              { title: 'Invoice', dataIndex: 'Invoice_Number', render: v => <Text code style={{ fontSize: 11 }}>{v}</Text> },
              { title: 'Date', dataIndex: 'Sale_Date', render: v => dayjs(v).format('DD-MMM-YYYY') },
            ]}
            dataSource={soldItems || []} rowKey="Detail_ID" size="small" loading={soldLoading}
            pagination={{ pageSize: 25 }} />
        </TabPane>
      </Tabs>
      </div>

      {/* ── Item Detail Modal ──────────────────────────────────────────── */}
      <Modal title={detailItem?.Article_Number} open={!!detailItem}
        onCancel={() => setDetailItem(null)} footer={null} width={600}>
        {detailItem && (
          <Row gutter={20}>
            <Col xs={12}>
              {detailItem.Product_Image_URL
                ? <Image src={detailItem.Product_Image_URL} style={{ width: '100%', borderRadius: 8 }} />
                : <div style={{ height: 200, background: '#f5f5f5', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8 }}>
                    <GoldOutlined style={{ fontSize: 64, color: '#d9d9d9' }} />
                  </div>
              }
              <div ref={uploadRef}>
              <Upload beforeUpload={file => { uploadMutation.mutate({ file, articleNo: detailItem.Article_Number }); return false; }}
                showUploadList={false} accept="image/*">
                <Button block size="small" icon={<UploadOutlined />} style={{ marginTop: 8 }} loading={uploadMutation.isPending}>
                  Upload Image
                </Button>
              </Upload>
              </div>
            </Col>
            <Col xs={12}>
              <Space direction="vertical" style={{ width: '100%' }} size={6}>
                {[
                  { label: 'Article No', value: detailItem.Article_Number },
                  { label: 'Type', value: detailItem.Type_Name },
                  { label: 'Purity', value: detailItem.Purity_Code },
                  { label: 'Gross Weight', value: formatWeight(detailItem.Gross_Weight) },
                  { label: 'Net Gold Weight', value: formatWeight(detailItem.Net_Gold_Weight), bold: true, color: '#B8860B' },
                  { label: 'Stone Weight', value: formatWeight(detailItem.Stone_Weight) },
                  { label: 'Gold Rate', value: `₹${detailItem.Current_Gold_Rate}/g` },
                  { label: 'Making Charges', value: formatCurrency(detailItem.Final_Making_Charge_Total) },
                  { label: 'MRP', value: formatCurrency(detailItem.Total_Price), bold: true, color: '#B8860B' },
                  { label: 'HUID', value: detailItem.HUID_Number || '-' },
                  { label: 'Location', value: detailItem.Physical_Location || '-' },
                ].map(r => (
                  <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f5f5f5', paddingBottom: 4 }}>
                    <Text type="secondary" style={{ fontSize: 12 }}>{r.label}</Text>
                    <Text style={{ fontSize: 12, fontWeight: r.bold ? 700 : 400, color: r.color || '#333' }}>{r.value}</Text>
                  </div>
                ))}
              </Space>
              <Button type="primary" block style={{ marginTop: 12, background: '#B8860B', borderColor: '#B8860B' }}
                onClick={() => { setOrderItems(p => [...p, { article_number: detailItem.Article_Number, name: detailItem.Type_Name, price: detailItem.Total_Price, qty: 1 }]); setDetailItem(null); message.success('Added to order list.'); }}>
                + Add to Order
              </Button>
            </Col>
          </Row>
        )}
      </Modal>

      {/* ── Create Order Drawer ────────────────────────────────────────── */}
      <Drawer title="📦 Create Order" open={orderDrawer} onClose={() => setOrderDrawer(false)} width={400}>
        <Form form={orderForm} layout="vertical" onFinish={v => orderMutation.mutate({ ...v, items: orderItems })}>
          <Form.Item name="customer_name" label="Customer Name" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="customer_mobile" label="Mobile" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="notes" label="Notes"><Input.TextArea rows={2} /></Form.Item>
          <Title level={5}>Order Items ({orderItems.length})</Title>
          {orderItems.map((item, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #f5f5f5', fontSize: 12 }}>
              <Text>{item.name} — {item.article_number}</Text>
              <Space>
                <Text strong>{formatCurrency(item.price)}</Text>
                <Button size="small" danger type="text" onClick={() => setOrderItems(p => p.filter((_, j) => j !== i))}>×</Button>
              </Space>
            </div>
          ))}
          <Button type="primary" htmlType="submit" block size="large" loading={orderMutation.isPending}
            style={{ marginTop: 16, background: '#B8860B', borderColor: '#B8860B' }}>
            Submit Order
          </Button>
        </Form>
      </Drawer>

      <PageTour steps={tourSteps} />
    </div>
  );
}
