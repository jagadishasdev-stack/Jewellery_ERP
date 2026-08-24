import React, { useState, useRef } from 'react';
import {
  Table, Button, Input, Select, Space, Tag, Typography, Card,
  Tooltip, Row, Col, Statistic,
} from 'antd';
import {
  PlusOutlined, SearchOutlined, BarcodeOutlined,
  EditOutlined, EyeOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { ornamentsApi, masterApi } from '../../api/modules';
import { formatCurrency, formatWeight } from '../../utils/calculations';
import OrnamentDetailDrawer from './OrnamentDetailDrawer';
import PageTour from '../../components/PageTour';
import { METAL_TYPES, METAL_TYPE_COLORS } from '../../utils/metalTypes';

const { Title, Text } = Typography;
const { Option } = Select;

export default function InventoryPage() {
  const navigate = useNavigate();
  const [filters, setFilters] = useState({ search: '', typeId: '', metalType: '', isAvailable: '', page: 1, limit: 50 });
  const [detailId, setDetailId] = useState(null);

  // ── Walkthrough tour refs ───────────────────────────────────────────────────
  const addBtnRef = useRef(null);
  const summaryRef = useRef(null);
  const filtersRef = useRef(null);
  const tableRef = useRef(null);
  const tourSteps = [
    { title: '1. Add Stock', description: 'Click here to add a new piece of jewellery to your stock — opens the full add-stock form.', target: () => addBtnRef.current },
    { title: '2. Summary', description: 'Quick counts of total items, how many are available to sell, and how many are already sold.', target: () => summaryRef.current },
    { title: '3. Search & Filter', description: 'Search by article number, type or design, and narrow the list down by item type or availability.', target: () => filtersRef.current },
    { title: '4. Stock', description: 'Every ornament shows here with its weight, making charge and price. Use the eye icon to view full details, or the pencil icon to edit an item.', target: () => tableRef.current },
  ];

  const { data: inventoryData, isLoading } = useQuery({
    queryKey: ['ornaments', filters],
    queryFn: () => ornamentsApi.getAll(filters).then((r) => r.data.data),
    keepPreviousData: true,
  });

  const { data: itemTypes } = useQuery({
    queryKey: ['item-types'],
    queryFn: () => masterApi.getItemTypes().then((r) => r.data.data),
  });

  const columns = [
    {
      title: 'Article No',
      dataIndex: 'Article_Number',
      width: 160,
      render: (v) => (
        <Space>
          <BarcodeOutlined style={{ color: '#B8860B' }} />
          <Text copyable style={{ fontSize: 12 }}>{v}</Text>
        </Space>
      ),
    },
    {
      title: 'Item',
      render: (_, r) => (
        <div>
          <Text strong>{r.Type_Name || '-'}</Text>
          <br />
          <Text type="secondary" style={{ fontSize: 11 }}>{r.Design_Name || '-'}</Text>
        </div>
      ),
    },
    {
      title: 'Metal',
      dataIndex: 'Metal_Type',
      width: 90,
      render: (v) => <Tag color={METAL_TYPE_COLORS[v] || 'default'}>{v || '-'}</Tag>,
    },
    {
      title: 'Purity',
      dataIndex: 'Purity_Code',
      width: 80,
      render: (v) => <Tag color="gold">{v || '-'}</Tag>,
    },
    {
      title: 'Gross Wt',
      dataIndex: 'Gross_Weight',
      width: 90,
      render: (v) => <Text style={{ fontSize: 12 }}>{formatWeight(v)}</Text>,
    },
    {
      title: 'Making/g',
      dataIndex: 'Base_Making_Charge_Per_Gram',
      width: 90,
      render: (v) => <Text style={{ fontSize: 12 }}>{formatCurrency(v)}</Text>,
    },
    {
      title: 'Total Price',
      dataIndex: 'Total_Price',
      width: 120,
      render: (v) => <Text strong style={{ color: '#B8860B' }}>{formatCurrency(v)}</Text>,
    },
    {
      title: 'Status',
      width: 90,
      render: (_, r) => {
        if (r.Is_Sold) return <Tag color="red">Sold</Tag>;
        if (!r.Is_Stock_Available) return <Tag color="orange">Unavailable</Tag>;
        if (r.Is_Reserved) return <Tag color="blue">Reserved</Tag>;
        return <Tag color="green">Available</Tag>;
      },
    },
    {
      title: 'Location',
      dataIndex: 'Physical_Location',
      width: 90,
      render: (v) => <Text type="secondary" style={{ fontSize: 12 }}>{v || '-'}</Text>,
    },
    {
      title: 'Actions',
      width: 80,
      render: (_, r) => (
        <Space>
          <Tooltip title="View Details">
            <Button type="text" size="small" icon={<EyeOutlined />} onClick={() => setDetailId(r.Ornament_ID)} />
          </Tooltip>
          <Tooltip title="Edit">
            <Button type="text" size="small" icon={<EditOutlined />}
              onClick={() => navigate(`/inventory/add?edit=${r.Ornament_ID}`)} />
          </Tooltip>
        </Space>
      ),
    },
  ];

  return (
    <div className="page-wrapper">
      <div className="page-header">
        <Title level={4} style={{ margin: 0 }}>Inventory / Stock</Title>
        <Button ref={addBtnRef} type="primary" icon={<PlusOutlined />}
          style={{ background: '#B8860B', borderColor: '#B8860B' }}
          onClick={() => navigate('/inventory/add')}>
          Add Stock
        </Button>
      </div>

      {/* Summary Row */}
      <Row ref={summaryRef} gutter={[12, 12]} style={{ marginBottom: 16 }}>
        {[
          { title: 'Total Items', value: inventoryData?.total || 0 },
          { title: 'Available', value: (inventoryData?.items || []).filter((i) => i.Is_Stock_Available && !i.Is_Sold).length },
          { title: 'Sold', value: (inventoryData?.items || []).filter((i) => i.Is_Sold).length },
        ].map((s, i) => (
          <Col xs={8} key={i}>
            <Card size="small" bodyStyle={{ padding: '10px 16px' }} style={{ borderRadius: 8, border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
              <Statistic title={s.title} value={s.value} valueStyle={{ fontSize: 20, color: '#B8860B' }} />
            </Card>
          </Col>
        ))}
      </Row>

      {/* Filters */}
      <div ref={filtersRef}>
      <Card style={{ borderRadius: 8, marginBottom: 12 }} bodyStyle={{ padding: 12 }}>
        <Space wrap>
          <Input.Search
            placeholder="Search article, type, design..."
            style={{ width: 260 }}
            allowClear
            onSearch={(v) => setFilters((f) => ({ ...f, search: v, page: 1 }))}
          />
          <Select
            placeholder="Item Type"
            style={{ width: 150 }}
            allowClear
            onChange={(v) => setFilters((f) => ({ ...f, typeId: v || '', page: 1 }))}
          >
            {(itemTypes || []).map((t) => (
              <Option key={t.Type_ID} value={t.Type_ID}>{t.Type_Name}</Option>
            ))}
          </Select>
          <Select
            placeholder="Metal Type"
            style={{ width: 130 }}
            allowClear
            onChange={(v) => setFilters((f) => ({ ...f, metalType: v || '', page: 1 }))}
          >
            {METAL_TYPES.map((m) => <Option key={m} value={m}>{m}</Option>)}
          </Select>
          <Select
            placeholder="Availability"
            style={{ width: 130 }}
            allowClear
            onChange={(v) => setFilters((f) => ({ ...f, isAvailable: v ?? '', page: 1 }))}
          >
            <Option value="true">Available</Option>
            <Option value="false">Unavailable</Option>
          </Select>
        </Space>
      </Card>
      </div>

      <div ref={tableRef}>
      <Card style={{ borderRadius: 8, border: 'none' }} bodyStyle={{ padding: 0 }}>
        <Table
            scroll={{ x: "max-content" }}
          columns={columns}
          dataSource={inventoryData?.items || []}
          loading={isLoading}
          rowKey="Ornament_ID"
          pagination={{
            total: inventoryData?.total || 0,
            pageSize: filters.limit,
            current: filters.page,
            onChange: (page) => setFilters((f) => ({ ...f, page })),
            showSizeChanger: false,
            showTotal: (total) => `Total ${total} items`,
          }}
          size="small"
        />
      </Card>
      </div>

      <OrnamentDetailDrawer
        ornamentId={detailId}
        open={!!detailId}
        onClose={() => setDetailId(null)}
      />

      <PageTour steps={tourSteps} />
    </div>
  );
}
