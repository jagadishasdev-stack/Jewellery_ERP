/**
 * Masters Report — printable list view of the core reference masters
 * (Item Type, Design, Purity, Vendor/Karigar). A Master-menu audit gap:
 * every one of these already had a working GET endpoint (used by their
 * own CRUD screens under Masters), just no printable/report-format view
 * anywhere. No new backend routes — this reads the same data those
 * screens already use.
 */
import React, { useState, useRef } from 'react';
import { Card, Typography, Tabs, Table, Button, Space, Tag, message } from 'antd';
import { PrinterOutlined, DownloadOutlined, FileTextOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { masterApi, karigarApi } from '../../api/modules';
import PageTour from '../../components/PageTour';
import dayjs from 'dayjs';

const { Title, Text } = Typography;

const exportCSV = (data, filename) => {
  if (!data?.length) { message.warning('No data.'); return; }
  const csv = [Object.keys(data[0]).join(','), ...data.map(r => Object.values(r).map(v => `"${v ?? ''}"`).join(','))].join('\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = `${filename}_${dayjs().format('YYYYMMDD')}.csv`; a.click();
};

export default function MastersReportPage() {
  const [activeTab, setActiveTab] = useState('item-types');

  const tabsRef = useRef(null);
  const tourSteps = [
    { title: 'Masters Report', description: 'A printable/exportable list view of your core reference masters — Item Type, Design, Purity, and Vendor/Karigar. Each tab has CSV export and Print in its header.', target: () => tabsRef.current },
  ];

  const { data: itemTypes, isLoading: itLoading } = useQuery({
    queryKey: ['master-report-item-types'],
    queryFn: () => masterApi.getItemTypes().then(r => r.data.data || []),
    enabled: activeTab === 'item-types',
  });
  const { data: designs, isLoading: designLoading } = useQuery({
    queryKey: ['master-report-designs'],
    queryFn: () => masterApi.getDesigns().then(r => r.data.data || []),
    enabled: activeTab === 'designs',
  });
  const { data: purities, isLoading: purityLoading } = useQuery({
    queryKey: ['master-report-purities'],
    queryFn: () => masterApi.getPurities().then(r => r.data.data || []),
    enabled: activeTab === 'purities',
  });
  const { data: vendors, isLoading: vendorLoading } = useQuery({
    queryKey: ['master-report-vendors'],
    queryFn: () => karigarApi.getVendors().then(r => r.data.data || []),
    enabled: activeTab === 'vendors',
  });

  const reportCard = (title, data, loading, columns, rowKey, filename) => (
    <Card title={title} bodyStyle={{ padding: 0 }} style={{ borderRadius: 8 }}
      extra={
        <Space>
          <Button size="small" icon={<DownloadOutlined />} onClick={() => exportCSV(data || [], filename)}>CSV</Button>
          <Button size="small" icon={<PrinterOutlined />} onClick={() => window.print()}>Print</Button>
        </Space>
      }>
      <Table
        scroll={{ x: 'max-content' }} size="small" loading={loading} rowKey={rowKey} pagination={{ pageSize: 25 }}
        dataSource={data || []} columns={columns}
      />
    </Card>
  );

  const tabItems = [
    {
      key: 'item-types', label: <span>🏷️ Item Types</span>,
      children: reportCard('Item Type Master', itemTypes, itLoading, [
        { title: 'Code', dataIndex: 'Type_Code' },
        { title: 'Name', dataIndex: 'Type_Name', render: v => <Text strong>{v}</Text> },
        { title: 'Category', dataIndex: 'Category' },
        { title: 'HSN Code', dataIndex: 'HSN_Code' },
        { title: 'GST %', dataIndex: 'GST_Percentage' },
        { title: 'Is Gold', dataIndex: 'Is_Gold', render: v => <Tag color={v ? 'gold' : 'default'}>{v ? 'Yes' : 'No'}</Tag> },
      ], 'Type_ID', 'item_type_master'),
    },
    {
      key: 'designs', label: <span>💎 Designs</span>,
      children: reportCard('Design Master', designs, designLoading, [
        { title: 'Code', dataIndex: 'Design_Code' },
        { title: 'Name', dataIndex: 'Design_Name', render: v => <Text strong>{v}</Text> },
        { title: 'Collection', dataIndex: 'Collection_Name' },
        { title: 'Category', dataIndex: 'Category' },
        { title: 'Est. Gold Wt (g)', dataIndex: 'Estimated_Gold_Weight' },
      ], 'Design_ID', 'design_master'),
    },
    {
      key: 'purities', label: <span>⚗️ Purity</span>,
      children: reportCard('Purity Master', purities, purityLoading, [
        { title: 'Code', dataIndex: 'Purity_Code' },
        { title: 'Metal Type', dataIndex: 'Metal_Type', render: v => <Tag color="blue">{v}</Tag> },
        { title: 'Karat', dataIndex: 'Karat' },
        { title: 'Percentage', dataIndex: 'Percentage' },
        { title: 'Hallmark Standard', dataIndex: 'Hallmark_Standard' },
      ], 'Purity_ID', 'purity_master'),
    },
    {
      key: 'vendors', label: <span>🏭 Vendor / Karigar</span>,
      children: reportCard('Vendor / Karigar Master', vendors, vendorLoading, [
        { title: 'Name', dataIndex: 'Vendor_Name', render: v => <Text strong>{v}</Text> },
        { title: 'Type', dataIndex: 'Vendor_Type', render: v => <Tag>{v}</Tag> },
        { title: 'Mobile', dataIndex: 'Mobile' },
        { title: 'City', dataIndex: 'City' },
        { title: 'GST No', dataIndex: 'GST_No' },
      ], 'Vendor_ID', 'vendor_master'),
    },
  ];

  return (
    <div className="page-wrapper">
      <div className="page-header">
        <Title level={4} style={{ margin: 0 }}><FileTextOutlined style={{ color: '#B8860B', marginRight: 8 }} />Masters Report</Title>
        <Text type="secondary" style={{ fontSize: 12 }}>Printable reference lists — Item Type, Design, Purity, Vendor/Karigar</Text>
      </div>
      <div ref={tabsRef}>
        <Tabs activeKey={activeTab} onChange={setActiveTab} type="card" items={tabItems} />
      </div>
      <PageTour steps={tourSteps} />
    </div>
  );
}
