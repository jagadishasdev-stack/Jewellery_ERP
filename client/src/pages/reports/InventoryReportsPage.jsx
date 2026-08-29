/**
 * Inventory Reports — Current Stock | Dead Stock | Fast/Slow Moving | Movement
 */
import React, { useState, useRef } from 'react';
import {
  Row, Col, Card, Typography, Button, Space, Tag, Tabs, Table, Select,
  Statistic, Progress, Alert, Badge,
} from 'antd';
import { DownloadOutlined, GoldOutlined, WarningOutlined, RiseOutlined, FallOutlined, SwapOutlined, ApartmentOutlined, AppstoreOutlined, InboxOutlined, EyeInvisibleOutlined, ShopOutlined, StarOutlined, TrophyOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { reportsApi, floorsApi, ornamentsApi } from '../../api/modules';
import { formatCurrency } from '../../utils/calculations';
import { message } from 'antd';
import PageTour from '../../components/PageTour';
import dayjs from 'dayjs';
import { useDataMode } from '../../contexts/DataModeContext';
import { METAL_TYPE_COLORS } from '../../utils/metalTypes';
import { useMetalTypes } from '../../hooks/useMetalTypes';

const { Option } = Select;

const { Title, Text } = Typography;

const exportCSV = (data, filename) => {
  if (!data?.length) { message.warning('No data.'); return; }
  const csv = [Object.keys(data[0]).join(','), ...data.map(r=>Object.values(r).map(v=>`"${v??''}"`).join(','))].join('\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv],{type:'text/csv'}));
  a.download = `${filename}_${dayjs().format('YYYYMMDD')}.csv`; a.click();
};

export default function InventoryReportsPage() {
  const { isUnofficial } = useDataMode();
  const { metalTypes } = useMetalTypes();
  const [activeTab, setActiveTab] = useState('current');
  // Drives the "isolated" per-metal stock report — leaving it unset shows
  // every metal's stock combined, same as before this existed.
  const [metalFilter, setMetalFilter] = useState(undefined);

  // ── Walkthrough tour refs ───────────────────────────────────────────────────
  const tabsRef = useRef(null);
  const tourSteps = [
    { title: '1. Stock Report Tabs', description: 'Current Stock shows everything you hold right now, item-type wise. Fast/Slow/Dead Moving classify items by how often they sold in the last 30 days — check Dead Stock every month to plan discounts, exchanges or melting. Item Movement gives the full item-level list, and Floor/Counter/Tray-wise tabs show where stock physically sits in the shop.', target: () => tabsRef.current },
    { title: '2. Hidden Stock', description: 'The Hidden Stock tab only appears in Unofficial mode (Ctrl+F5) — it lists items marked hidden from the sales floor, visible to the owner only.' },
    { title: '3. Export Anytime', description: 'Every tab has a CSV button in its card header — use it to download that specific report for Excel or sharing.' },
  ];

  const { data: currentStock, isLoading: stockLoading } = useQuery({
    queryKey: ['inv-current', metalFilter],
    queryFn: () => reportsApi.inventoryValue(metalFilter ? { metalType: metalFilter } : {}).then(r => r.data.data),
  });
  const { data: movementData } = useQuery({
    queryKey: ['inv-movement'],
    queryFn: () => reportsApi.itemMovement().then(r => r.data.data || []),
  });
  const { data: floorStock, isLoading: floorLoading } = useQuery({
    queryKey: ['inv-floor-stock'],
    queryFn: () => floorsApi.getLiveStock({ groupBy: 'floor' }).then(r => r.data.data),
  });
  const { data: counterStock, isLoading: counterLoading } = useQuery({
    queryKey: ['inv-counter-stock'],
    queryFn: () => floorsApi.getLiveStock({ groupBy: 'counter' }).then(r => r.data.data),
  });
  const { data: trayStock, isLoading: trayLoading } = useQuery({
    queryKey: ['inv-tray-stock'],
    queryFn: () => floorsApi.getLiveStock({ groupBy: 'tray' }).then(r => r.data.data),
  });
  // Hidden stock details never surface in Official mode — only fetch once
  // Unofficial (Ctrl+F5) is active; the server enforces this too (403 otherwise).
  const { data: hiddenStock, isLoading: hiddenLoading } = useQuery({
    queryKey: ['inv-hidden-stock'],
    queryFn: () => floorsApi.getHiddenStock().then(r => r.data.data),
    enabled: isUnofficial,
  });
  const { data: visibilityComparison } = useQuery({
    queryKey: ['inv-visibility-comparison'],
    queryFn: () => floorsApi.getVisibilityComparison().then(r => r.data.data),
    enabled: isUnofficial,
  });
  // Catalog-hidden stock — a display-only flag (Show_In_Catalog), unrelated
  // to the Unofficial-mode "Hidden Stock" tab below. Visible in every mode,
  // no special permission — it's a filter on ordinary sales data, not a
  // separate accounting book.
  const { data: catalogHiddenReport, isLoading: catalogHiddenLoading } = useQuery({
    queryKey: ['inv-catalog-hidden'],
    queryFn: () => reportsApi.catalogHiddenStock().then(r => r.data.data),
  });
  // Special Stock Isolation — a display/operational classification, always
  // visible regardless of Official/Unofficial mode (unlike the Hidden
  // Stock tab below, which is a genuinely different, mode-gated feature).
  const { data: stockClassification, isLoading: stockClassificationLoading } = useQuery({
    queryKey: ['inv-stock-classification'],
    queryFn: () => ornamentsApi.classificationSummary().then(r => r.data.data),
  });
  // "Which design is good" — real sell-through/velocity per design.
  const { data: designPerf, isLoading: designPerfLoading } = useQuery({
    queryKey: ['inv-design-performance'],
    queryFn: () => reportsApi.designPerformance().then(r => r.data.data),
  });

  const byType = currentStock?.byType || [];
  const overall = currentStock?.overall || {};
  const byMetal = currentStock?.byMetal || [];

  // Classify fast/slow/dead from movement data
  const fastMoving = (movementData || []).filter(i => parseInt(i.sold_last_30_days||0) >= 3);
  const slowMoving = (movementData || []).filter(i => parseInt(i.sold_last_30_days||0) > 0 && parseInt(i.sold_last_30_days||0) < 3);
  const deadStock = (movementData || []).filter(i => parseInt(i.sold_last_30_days||0) === 0 && parseInt(i.days_in_stock||0) > 60);

  const stockCols = [
    { title: 'Item Type', dataIndex: 'Type_Name', render: v => <Text strong>{v}</Text> },
    { title: 'Pieces', dataIndex: 'count', width: 80, render: v => <Tag color="blue">{v}</Tag> },
    { title: 'Total Weight', dataIndex: 'total_weight', width: 120, render: v => `${parseFloat(v||0).toFixed(3)}g` },
    { title: 'Total MRP', dataIndex: 'total_mrp', render: v => <Text strong style={{color:'#B8860B'}}>{formatCurrency(v)}</Text> },
    { title: 'Cost Value', dataIndex: 'total_cost', render: v => formatCurrency(v||0) },
    { title: 'Margin', width: 90, render: (_,r) => {
      const m = r.total_mrp > 0 ? ((r.total_mrp-r.total_cost)/r.total_mrp*100).toFixed(1) : 0;
      return <Tag color="green">{m}%</Tag>;
    }},
    { title: 'Stock %', width: 120, render: (_,r) => {
      const total = parseInt(overall.total_pieces||1);
      return <Progress percent={Math.round((parseInt(r.count||0)/total)*100)} size="small" strokeColor="#B8860B" />;
    }},
  ];

  const movementCols = [
    { title: 'Article No', dataIndex: 'Article_Number', render: v => <Text code style={{fontSize:11}}>{v}</Text> },
    { title: 'Item Type', dataIndex: 'Type_Name' },
    { title: 'Metal', dataIndex: 'Metal_Type', width: 80, render: v => <Tag color={METAL_TYPE_COLORS[v] || 'default'}>{v || '-'}</Tag> },
    { title: 'Purity', dataIndex: 'Purity_Code', width: 70 },
    { title: 'Weight', dataIndex: 'Gross_Weight', width: 90, render: v => `${parseFloat(v||0).toFixed(3)}g` },
    { title: 'MRP', dataIndex: 'Total_Price', render: v => formatCurrency(v) },
    { title: 'Days In Stock', dataIndex: 'days_in_stock', width: 110, render: v => {
      const d = parseInt(v||0);
      return <Tag color={d > 180 ? 'red' : d > 90 ? 'orange' : 'green'}>{d}d</Tag>;
    }},
    { title: 'Sold (30d)', dataIndex: 'sold_last_30_days', width: 100, render: v => <Badge count={parseInt(v||0)} showZero style={{background: parseInt(v||0)>0?'#52c41a':'#ff4d4f'}} /> },
  ];

  const makeLocationCols = (label) => [
    { title: label, dataIndex: 'location_name', render: v => <Text strong>{v}</Text> },
    { title: 'Items', dataIndex: 'item_count', width: 90, render: v => <Tag color="blue">{v}</Tag> },
    { title: 'Total Weight', dataIndex: 'total_weight', width: 130, render: v => `${parseFloat(v||0).toFixed(3)}g` },
    { title: 'Total Value', dataIndex: 'total_value', render: v => <Text strong style={{color:'#B8860B'}}>{formatCurrency(v)}</Text> },
  ];

  const hiddenStockCols = [
    { title: 'Article No', dataIndex: 'Article_Number', render: v => <Text code style={{fontSize:11}}>{v}</Text> },
    { title: 'Item Type', dataIndex: 'Type_Name' },
    { title: 'Location', render: (_, r) => `${r.Floor_Name||'-'} / ${r.Counter_Name||'-'} / ${r.Tray_Name||'-'}` },
    { title: 'Hidden At', dataIndex: 'Hidden_Location_Name' },
    { title: 'Weight', dataIndex: 'Gross_Weight', width: 90, render: v => `${parseFloat(v||0).toFixed(3)}g` },
    { title: 'Value', dataIndex: 'Total_Price', render: v => formatCurrency(v) },
    { title: 'Hidden By', dataIndex: 'Hidden_By' },
    { title: 'Hidden Date', dataIndex: 'Hidden_Date', width: 110, render: v => v ? dayjs(v).format('DD-MMM-YYYY') : '-' },
    { title: 'Reason', dataIndex: 'Hidden_Reason' },
  ];

  const catalogHiddenCols = [
    { title: 'Article No', dataIndex: 'Article_Number', render: v => <Text code style={{fontSize:11}}>{v}</Text> },
    { title: 'Item Type', dataIndex: 'Type_Name' },
    { title: 'Weight', dataIndex: 'Gross_Weight', width: 90, render: v => `${parseFloat(v||0).toFixed(3)}g` },
    { title: 'MRP', dataIndex: 'Total_Price', render: v => formatCurrency(v) },
    { title: 'Status', dataIndex: 'Is_Sold', width: 100, render: v => v ? <Tag color="red">Sold</Tag> : <Tag color="green">In Stock</Tag> },
    { title: 'Invoice No', dataIndex: 'Invoice_Number', render: v => v || '-' },
    { title: 'Sale Date', dataIndex: 'Sale_Date', width: 110, render: v => v ? dayjs(v).format('DD-MMM-YYYY') : '-' },
    { title: 'Customer', dataIndex: 'Customer_Name', render: v => v || '-' },
    { title: 'Last Updated By', dataIndex: 'Last_Updated_By', render: v => v || '-' },
  ];

  const makeLocationSummary = (data) => ({
    locations: (data||[]).length,
    items: (data||[]).reduce((s,r)=>s+parseInt(r.item_count||0),0),
    weight: (data||[]).reduce((s,r)=>s+parseFloat(r.total_weight||0),0),
    value: (data||[]).reduce((s,r)=>s+parseFloat(r.total_value||0),0),
  });

  const renderLocationTab = (label, data, isLoading, filename) => {
    const summary = makeLocationSummary(data);
    return (
      <>
        <Row gutter={[10,10]} style={{marginBottom:14}}>
          {[
            {title:`Total ${label}s`,value:summary.locations,color:'#B8860B'},
            {title:'Total Items',value:summary.items,color:'#1890ff'},
            {title:'Total Weight',value:summary.weight.toFixed(3)+'g',color:'#722ed1',raw:true},
            {title:'Total Value',value:summary.value,color:'#52c41a',fmt:formatCurrency},
          ].map((c,i)=>(
            <Col xs={12} md={6} key={i}>
              <Card bodyStyle={{padding:'12px 14px'}} style={{borderRadius:8,border:'none',boxShadow:'0 1px 4px rgba(0,0,0,.07)',borderTop:`3px solid ${c.color}`}}>
                <Statistic title={<Text style={{fontSize:11,color:'#888'}}>{c.title}</Text>}
                  value={c.value}
                  formatter={c.fmt ? v=>c.fmt(v) : c.raw ? ()=>c.value : undefined}
                  valueStyle={{color:c.color,fontSize:17,fontWeight:700}} />
              </Card>
            </Col>
          ))}
        </Row>
        <Card title={`${label}-wise Stock`} bodyStyle={{padding:0}} style={{borderRadius:8}}
          extra={<Button size="small" icon={<DownloadOutlined />} onClick={()=>exportCSV(data||[],filename)}>CSV</Button>}>
          <Table
          scroll={{ x: "max-content" }} columns={makeLocationCols(label)} dataSource={data||[]} rowKey="location_name" size="small" loading={isLoading} pagination={false} />
        </Card>
      </>
    );
  };

  const tabItems = [
    {
      key: 'current', label: <span><GoldOutlined /> Current Stock</span>,
      children: (
        <>
          {/* Always shows every metal's totals side by side, regardless of
              the isolation filter below — so the segmented split is
              visible at a glance even while drilled into just one metal. */}
          <Card title="Stock by Metal" bodyStyle={{padding:'12px 14px'}} style={{borderRadius:8,marginBottom:14}}
            extra={<Button size="small" icon={<DownloadOutlined />} onClick={()=>exportCSV(byMetal,'stock_by_metal')}>CSV</Button>}>
            <Row gutter={[10,10]}>
              {metalTypes.map((metal) => {
                const row = byMetal.find(m => m.Metal_Type === metal) || {};
                const isActive = metalFilter === metal;
                return (
                  <Col xs={12} md={6} key={metal}>
                    <Card
                      size="small" hoverable
                      onClick={() => setMetalFilter(isActive ? undefined : metal)}
                      bodyStyle={{padding:'10px 12px'}}
                      style={{borderRadius:8,border:isActive?'2px solid #B8860B':'1px solid #f0f0f0',cursor:'pointer'}}
                    >
                      <Tag color={METAL_TYPE_COLORS[metal]} style={{marginBottom:6}}>{metal}</Tag>
                      <div style={{fontSize:11,color:'#888'}}>{parseInt(row.count||0)} pcs &middot; {parseFloat(row.total_weight||0).toFixed(3)}g</div>
                      <div style={{fontSize:15,fontWeight:700,color:'#B8860B'}}>{formatCurrency(row.total_mrp||0)}</div>
                    </Card>
                  </Col>
                );
              })}
            </Row>
          </Card>

          <Space style={{marginBottom:12}}>
            <Text type="secondary" style={{fontSize:12}}>Isolate report to:</Text>
            <Select
              allowClear placeholder="All metals" style={{width:160}}
              value={metalFilter} onChange={setMetalFilter}
            >
              {metalTypes.map(m => <Option key={m} value={m}>{m} only</Option>)}
            </Select>
          </Space>

          <Row gutter={[10,10]} style={{marginBottom:14}}>
            {[
              {title:'Total Pieces',value:parseInt(overall.total_pieces||0),color:'#B8860B'},
              {title:'Total Weight',value:parseFloat(overall.total_weight||0).toFixed(3)+'g',color:'#1890ff',raw:true},
              {title:'Total MRP',value:parseFloat(overall.total_mrp||0),color:'#52c41a',fmt:formatCurrency},
              {title:'Cost Value',value:parseFloat(overall.total_cost||0),color:'#722ed1',fmt:formatCurrency},
            ].map((c,i)=>(
              <Col xs={12} md={6} key={i}>
                <Card bodyStyle={{padding:'12px 14px'}} style={{borderRadius:8,border:'none',boxShadow:'0 1px 4px rgba(0,0,0,.07)',borderTop:`3px solid ${c.color}`}}>
                  <Statistic title={<Text style={{fontSize:11,color:'#888'}}>{c.title}{metalFilter ? ` (${metalFilter})` : ''}</Text>}
                    value={c.raw ? c.value : c.value}
                    formatter={c.fmt ? v=>c.fmt(v) : c.raw ? ()=>c.value : undefined}
                    valueStyle={{color:c.color,fontSize:17,fontWeight:700}} />
                </Card>
              </Col>
            ))}
          </Row>
          <Card title={`Stock by Item Type${metalFilter ? ` — ${metalFilter} only` : ''}`} bodyStyle={{padding:0}} style={{borderRadius:8}}
            extra={<Button size="small" icon={<DownloadOutlined />} onClick={()=>exportCSV(byType,'current_stock')}>CSV</Button>}>
            <Table
            scroll={{ x: "max-content" }} columns={stockCols} dataSource={byType} rowKey="Type_Code" size="small" loading={stockLoading} pagination={false} />
          </Card>
        </>
      ),
    },
    {
      key: 'fast', label: <span><RiseOutlined style={{color:'#52c41a'}} /> Fast Moving</span>,
      children: (
        <>
          <Alert message={`${fastMoving.length} items sold 3+ times in last 30 days — consider restocking`} type="success" showIcon style={{marginBottom:12}} />
          <Card title={`Fast Moving Stock (${fastMoving.length} items)`} bodyStyle={{padding:0}} style={{borderRadius:8}}
            extra={<Button size="small" icon={<DownloadOutlined />} onClick={()=>exportCSV(fastMoving,'fast_moving')}>CSV</Button>}>
            <Table
            scroll={{ x: "max-content" }} columns={movementCols} dataSource={fastMoving} rowKey="Ornament_ID" size="small" pagination={{pageSize:20}} />
          </Card>
        </>
      ),
    },
    {
      key: 'slow', label: <span><FallOutlined style={{color:'#fa8c16'}} /> Slow Moving</span>,
      children: (
        <>
          <Alert message={`${slowMoving.length} items sold 1-2 times in last 30 days`} type="warning" showIcon style={{marginBottom:12}} />
          <Card title={`Slow Moving Stock (${slowMoving.length} items)`} bodyStyle={{padding:0}} style={{borderRadius:8}}
            extra={<Button size="small" icon={<DownloadOutlined />} onClick={()=>exportCSV(slowMoving,'slow_moving')}>CSV</Button>}>
            <Table
            scroll={{ x: "max-content" }} columns={movementCols} dataSource={slowMoving} rowKey="Ornament_ID" size="small" pagination={{pageSize:20}} />
          </Card>
        </>
      ),
    },
    {
      key: 'dead', label: <span><WarningOutlined style={{color:'#ff4d4f'}} /> Dead Stock</span>,
      children: (
        <>
          <Alert message={`${deadStock.length} items not sold in 60+ days — action required`} type="error" showIcon style={{marginBottom:12}} />
          <Card title={`Dead Stock (${deadStock.length} items — 60+ days)`} bodyStyle={{padding:0}} style={{borderRadius:8}}
            extra={<Button size="small" icon={<DownloadOutlined />} onClick={()=>exportCSV(deadStock,'dead_stock')}>CSV</Button>}>
            <Table
            scroll={{ x: "max-content" }} columns={movementCols} dataSource={deadStock} rowKey="Ornament_ID" size="small" pagination={{pageSize:20}} />
          </Card>
        </>
      ),
    },
    {
      key: 'movement', label: <span><SwapOutlined /> Item Movement</span>,
      children: (
        <Card title="Complete Item Movement Report" bodyStyle={{padding:0}} style={{borderRadius:8}}
          extra={<Button size="small" icon={<DownloadOutlined />} onClick={()=>exportCSV(movementData||[],'item_movement')}>CSV</Button>}>
          <Table
            scroll={{ x: "max-content" }} columns={movementCols} dataSource={movementData||[]} rowKey="Ornament_ID" size="small" pagination={{pageSize:25}} />
        </Card>
      ),
    },
    {
      key: 'floor-stock', label: <span><ApartmentOutlined /> Floor-wise Stock</span>,
      children: renderLocationTab('Floor', floorStock, floorLoading, 'floor_wise_stock'),
    },
    {
      key: 'counter-stock', label: <span><AppstoreOutlined /> Counter-wise Stock</span>,
      children: renderLocationTab('Counter', counterStock, counterLoading, 'counter_wise_stock'),
    },
    {
      key: 'tray-stock', label: <span><InboxOutlined /> Tray-wise Stock</span>,
      children: renderLocationTab('Tray', trayStock, trayLoading, 'tray_wise_stock'),
    },
    {
      key: 'hidden-stock', label: <span><EyeInvisibleOutlined style={{color:'#ff4d4f'}} /> Hidden Stock</span>,
      children: isUnofficial ? (
        <>
          <Row gutter={[10,10]} style={{marginBottom:14}}>
            {[
              {title:'Visible Stock',count:visibilityComparison?.visible_count,weight:visibilityComparison?.visible_weight,value:visibilityComparison?.visible_value,color:'#52c41a'},
              {title:'Hidden Stock',count:visibilityComparison?.hidden_count,weight:visibilityComparison?.hidden_weight,value:visibilityComparison?.hidden_value,color:'#ff4d4f'},
              {title:'Total Inventory',count:visibilityComparison?.total_count,weight:visibilityComparison?.total_weight,value:visibilityComparison?.total_value,color:'#1890ff'},
            ].map((c,i)=>(
              <Col xs={24} md={8} key={i}>
                <Card bodyStyle={{padding:'12px 14px'}} style={{borderRadius:8,border:'none',boxShadow:'0 1px 4px rgba(0,0,0,.07)',borderTop:`3px solid ${c.color}`}}>
                  <Statistic title={<Text style={{fontSize:11,color:'#888'}}>{c.title}</Text>}
                    value={parseInt(c.count||0)} suffix="pcs"
                    valueStyle={{color:c.color,fontSize:17,fontWeight:700}} />
                  <div style={{marginTop:4,fontSize:12,color:'#888'}}>
                    {parseFloat(c.weight||0).toFixed(3)}g &middot; {formatCurrency(c.value||0)}
                  </div>
                </Card>
              </Col>
            ))}
          </Row>
          <Card title={`Hidden Stock Items (${(hiddenStock||[]).length})`} bodyStyle={{padding:0}} style={{borderRadius:8}}
            extra={<Button size="small" icon={<DownloadOutlined />} onClick={()=>exportCSV(hiddenStock||[],'hidden_stock')}>CSV</Button>}>
            <Table
            scroll={{ x: "max-content" }} columns={hiddenStockCols} dataSource={hiddenStock||[]} rowKey="Ornament_ID" size="small" loading={hiddenLoading} pagination={{pageSize:20}} />
          </Card>
        </>
      ) : (
        <Alert
          type="warning" showIcon style={{borderRadius:8}}
          message="Hidden stock details are hidden in Official mode"
          description="Switch to Unofficial mode (Ctrl+F5) to view visibility totals and the hidden stock list."
        />
      ),
    },
    {
      key: 'catalog-hidden', label: <span><ShopOutlined style={{color:'#722ed1'}} /> Hidden From Catalog</span>,
      children: (
        <>
          <Alert
            type="info" showIcon style={{marginBottom:12,borderRadius:8}}
            message="Items hidden from the customer-facing catalog only"
            description="These items are fully normal in billing, inventory counts, and GST/sales reports — this list just isolates the ones marked not to appear in the online/app catalog, whether sold or still in stock."
          />
          <Row gutter={[10,10]} style={{marginBottom:14}}>
            {[
              {title:'Total Hidden',value:catalogHiddenReport?.summary?.total_hidden,color:'#722ed1'},
              {title:'Still In Stock',value:catalogHiddenReport?.summary?.available_count,color:'#52c41a'},
              {title:'Sold',value:catalogHiddenReport?.summary?.sold_count,color:'#ff4d4f'},
              {title:'Total Value',value:catalogHiddenReport?.summary?.total_value,color:'#B8860B',fmt:formatCurrency},
            ].map((c,i)=>(
              <Col xs={12} md={6} key={i}>
                <Card bodyStyle={{padding:'12px 14px'}} style={{borderRadius:8,border:'none',boxShadow:'0 1px 4px rgba(0,0,0,.07)',borderTop:`3px solid ${c.color}`}}>
                  <Statistic title={<Text style={{fontSize:11,color:'#888'}}>{c.title}</Text>}
                    value={c.fmt ? parseFloat(c.value||0) : parseInt(c.value||0)}
                    formatter={c.fmt ? v=>c.fmt(v) : undefined}
                    valueStyle={{color:c.color,fontSize:17,fontWeight:700}} />
                </Card>
              </Col>
            ))}
          </Row>
          <Card title={`Hidden From Catalog (${(catalogHiddenReport?.items||[]).length} items)`} bodyStyle={{padding:0}} style={{borderRadius:8}}
            extra={<Button size="small" icon={<DownloadOutlined />} onClick={()=>exportCSV(catalogHiddenReport?.items||[],'catalog_hidden_stock')}>CSV</Button>}>
            <Table
            scroll={{ x: "max-content" }} columns={catalogHiddenCols} dataSource={catalogHiddenReport?.items||[]} rowKey="Ornament_ID" size="small" loading={catalogHiddenLoading} pagination={{pageSize:20}} />
          </Card>
        </>
      ),
    },
    {
      key: 'stock-classification', label: <span><StarOutlined style={{color:'#B8860B'}} /> Special Stock</span>,
      children: (
        <>
          <Alert
            type="info" showIcon style={{marginBottom:12,borderRadius:8}}
            message="Normal Stock + Special Stock = Total Physical Inventory — always, no exceptions"
            description="Special Stock (in-house karigar production, special collections, reserved pieces) is a display classification only. Every sale, from either classification, bills through the exact same GST/accounting/reports — this reconciliation is here so the totals are always checkable, not just asserted."
          />
          <Row gutter={[10,10]} style={{marginBottom:14}}>
            {[
              {title:'Normal Stock',d:stockClassification?.normal,color:'#52c41a'},
              {title:'Special Stock',d:stockClassification?.special,color:'#B8860B'},
              {title:'Combined Physical Inventory',d:stockClassification?.combined,color:'#1890ff'},
            ].map((c,i)=>(
              <Col xs={24} md={8} key={i}>
                <Card bodyStyle={{padding:'12px 14px'}} style={{borderRadius:8,border:'none',boxShadow:'0 1px 4px rgba(0,0,0,.07)',borderTop:`3px solid ${c.color}`}}>
                  <Statistic title={<Text style={{fontSize:11,color:'#888'}}>{c.title}</Text>}
                    value={parseInt(c.d?.pieces||0)} suffix="pcs"
                    valueStyle={{color:c.color,fontSize:17,fontWeight:700}} />
                  <div style={{marginTop:4,fontSize:12,color:'#888'}}>
                    {parseFloat(c.d?.weight||0).toFixed(3)}g &middot; {formatCurrency(c.d?.value||0)}
                  </div>
                </Card>
              </Col>
            ))}
          </Row>
          <Card title="By Metal" bodyStyle={{padding:0}} style={{borderRadius:8}} loading={stockClassificationLoading}>
            <Table
              scroll={{ x: "max-content" }}
              rowKey="metal"
              pagination={false}
              dataSource={Object.entries(stockClassification?.byMetal || {}).map(([metal, v]) => ({ metal, ...v }))}
              columns={[
                { title: 'Metal', dataIndex: 'metal', render: v => <Tag color={METAL_TYPE_COLORS[v]||'default'}>{v}</Tag> },
                { title: 'Normal — Pieces', render: (_,r) => r.Normal?.pieces || 0 },
                { title: 'Normal — Weight', render: (_,r) => `${(r.Normal?.weight||0).toFixed(3)}g` },
                { title: 'Normal — Value', render: (_,r) => formatCurrency(r.Normal?.value||0) },
                { title: 'Special — Pieces', render: (_,r) => r.Special?.pieces || 0 },
                { title: 'Special — Weight', render: (_,r) => `${(r.Special?.weight||0).toFixed(3)}g` },
                { title: 'Special — Value', render: (_,r) => formatCurrency(r.Special?.value||0) },
              ]}
            />
          </Card>
        </>
      ),
    },
    {
      key: 'design-performance', label: <span><TrophyOutlined style={{color:'#B8860B'}} /> Design Performance</span>,
      children: (
        <>
          <Alert
            type="info" showIcon style={{marginBottom:12,borderRadius:8}}
            message="Which design is good — real sell-through, not guesswork"
            description="Pieces sold vs. manufactured, and average days a piece of this design sits in stock before selling. Ranked fastest-selling first."
          />
          <Card title={`By Design (${(designPerf||[]).length})`} bodyStyle={{padding:0}} style={{borderRadius:8}}
            extra={<Button size="small" icon={<DownloadOutlined />} onClick={()=>exportCSV(designPerf||[],'design_performance')}>CSV</Button>}>
            <Table
              scroll={{ x: "max-content" }}
              loading={designPerfLoading}
              dataSource={designPerf||[]}
              rowKey="Design_ID"
              size="small"
              pagination={{pageSize:20}}
              columns={[
                { title: 'Design', dataIndex: 'Design_Name', render: (v,r) => <Space direction="vertical" size={0}><Text strong>{v}</Text><Text type="secondary" style={{fontSize:11}}>{r.Design_Code}</Text></Space> },
                { title: 'Manufactured', dataIndex: 'pieces_manufactured', width: 110, render: v => <Tag color="blue">{v} pcs</Tag> },
                { title: 'Sold', dataIndex: 'pieces_sold', width: 90, render: v => <Tag color="green">{v} pcs</Tag> },
                { title: 'In Stock', dataIndex: 'pieces_in_stock', width: 90 },
                { title: 'Sell-Through', dataIndex: 'sell_through_rate', width: 120, render: v => <Tag color={v>=70?'green':v>=40?'orange':'red'}>{v}%</Tag> },
                { title: 'Avg Days to Sell', dataIndex: 'avg_days_to_sell', width: 130, render: v => v==null ? '-' : `${v}d` },
                { title: 'Revenue', dataIndex: 'revenue', render: v => <Text strong style={{color:'#B8860B'}}>{formatCurrency(v)}</Text> },
              ]}
            />
          </Card>
        </>
      ),
    },
  ];

  return (
    <div className="page-wrapper">
      <div className="page-header">
        <Title level={4} style={{margin:0}}><GoldOutlined style={{color:'#52c41a',marginRight:8}} />Inventory Reports</Title>
      </div>
      <div ref={tabsRef}>
      <Tabs activeKey={activeTab} onChange={setActiveTab} type="card" items={tabItems} />
      </div>

      <PageTour steps={tourSteps} />
    </div>
  );
}
