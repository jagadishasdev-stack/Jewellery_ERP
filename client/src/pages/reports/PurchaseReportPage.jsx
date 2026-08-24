import React, { useState, useRef } from 'react';
import {
  Table, Card, Typography, DatePicker, Button, Space, Tag, Row, Col,
  Statistic, Descriptions, Modal, message,
} from 'antd';
import { DownloadOutlined, PrinterOutlined, EyeOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { purchaseApi } from '../../api/modules';
import { formatCurrency } from '../../utils/calculations';
import PageTour from '../../components/PageTour';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

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

export default function PurchaseReportPage() {
  const [dateRange, setDateRange] = useState([dayjs().startOf('month'), dayjs()]);
  const [detailPurchase, setDetailPurchase] = useState(null);

  // ── Walkthrough tour refs ───────────────────────────────────────────────────
  const dateRangeRef = useRef(null);
  const summaryRef = useRef(null);
  const tableRef = useRef(null);
  const tourSteps = [
    { title: '1. Choose Period', description: 'Filter this purchase register by date. Export CSV and Print are right next to the date picker.', target: () => dateRangeRef.current },
    { title: '2. Summary', description: 'Total bills, total purchase value, amount already paid and what is still pending to pay suppliers — all for the selected period.', target: () => summaryRef.current },
    { title: '3. Purchase Register', description: 'Every purchase entry from your suppliers, with payment and approval status. Click the eye icon on any row to open full item-level detail — weight, purity and rate.', target: () => tableRef.current },
  ];

  const { data: purchases, isLoading } = useQuery({
    queryKey: ['purchases-all'],
    queryFn: () => purchaseApi.getAll({ limit: 200 }).then(r => r.data.data.items),
  });

  const { data: purchaseDetail } = useQuery({
    queryKey: ['purchase-detail', detailPurchase?.Purchase_ID],
    queryFn: () => purchaseApi.getById(detailPurchase.Purchase_ID).then(r => r.data.data),
    enabled: !!detailPurchase,
  });

  const filtered = (purchases || []).filter(p => {
    const d = dayjs(p.Purchase_Date);
    return d.isAfter(dateRange[0].subtract(1, 'day')) && d.isBefore(dateRange[1].add(1, 'day'));
  });

  const totalAmount = filtered.reduce((s, r) => s + parseFloat(r.Total_Amount || 0), 0);
  const totalPaid = filtered.reduce((s, r) => s + parseFloat(r.Amount_Paid || 0), 0);
  const totalPending = filtered.reduce((s, r) => s + parseFloat(r.Balance_Amount || 0), 0);

  const columns = [
    { title: 'Purchase #', dataIndex: 'Purchase_Number', render: v => <Text code style={{ fontSize: 11 }}>{v}</Text> },
    { title: 'Date', dataIndex: 'Purchase_Date', render: v => dayjs(v).format('DD-MMM-YYYY') },
    { title: 'Supplier', dataIndex: 'Supplier_Name_Resolved', render: v => <Text strong>{v || '-'}</Text> },
    { title: 'Supplier Invoice', dataIndex: 'Supplier_Invoice_No', render: v => v || '-' },
    { title: 'Type', dataIndex: 'Purchase_Type', render: v => <Tag color="blue">{v}</Tag> },
    { title: 'Total Amount', dataIndex: 'Total_Amount', render: v => <Text strong style={{ color: '#B8860B' }}>{formatCurrency(v)}</Text> },
    { title: 'Amount Paid', dataIndex: 'Amount_Paid', render: v => <Text style={{ color: '#52c41a' }}>{formatCurrency(v)}</Text> },
    { title: 'Balance', dataIndex: 'Balance_Amount', render: v => parseFloat(v) > 0 ? <Tag color="red">{formatCurrency(v)}</Tag> : <Tag color="green">Cleared</Tag> },
    { title: 'Payment', dataIndex: 'Payment_Status', render: v => <Tag color={v === 'Paid' ? 'green' : v === 'Partial' ? 'orange' : 'default'}>{v}</Tag> },
    { title: 'Status', dataIndex: 'Status', render: v => <Tag color={v === 'Approved' ? 'green' : 'default'}>{v}</Tag> },
    { title: '', width: 60, render: (_, r) => <Button size="small" icon={<EyeOutlined />} onClick={() => setDetailPurchase(r)} /> },
  ];

  const detailItemCols = [
    { title: 'Description', dataIndex: 'Item_Description' },
    { title: 'Qty', dataIndex: 'Quantity', width: 60 },
    { title: 'Gross Wt', dataIndex: 'Gross_Weight', render: v => `${parseFloat(v||0).toFixed(3)}g` },
    { title: 'Net Wt', dataIndex: 'Net_Weight', render: v => `${parseFloat(v||0).toFixed(3)}g` },
    { title: 'Purity', dataIndex: 'Purity_Code', render: v => v ? <Tag color="gold">{v}</Tag> : '-' },
    { title: 'Rate', dataIndex: 'Gold_Rate', render: v => v ? `₹${parseFloat(v).toLocaleString('en-IN')}/g` : '-' },
    { title: 'Amount', dataIndex: 'Total_Line_Value', render: v => formatCurrency(v) },
  ];

  return (
    <div className="page-wrapper">
      <div className="page-header">
        <Title level={4} style={{ margin: 0 }}>Purchase Register</Title>
        <div ref={dateRangeRef}>
        <Space>
          <RangePicker value={dateRange} onChange={d => d && setDateRange(d)} format="DD-MMM-YYYY" />
          <Button icon={<DownloadOutlined />} onClick={() => exportCSV(filtered, 'purchase_register')}>Export CSV</Button>
          <Button icon={<PrinterOutlined />} onClick={() => window.print()}>Print</Button>
        </Space>
        </div>
      </div>

      {/* Summary */}
      <Row ref={summaryRef} gutter={[12, 12]} style={{ marginBottom: 16 }}>
        {[
          { title: 'Total Bills', value: filtered.length, color: '#B8860B' },
          { title: 'Total Purchase Value', value: totalAmount, formatter: formatCurrency, color: '#1890ff' },
          { title: 'Total Paid', value: totalPaid, formatter: formatCurrency, color: '#52c41a' },
          { title: 'Pending to Pay', value: totalPending, formatter: formatCurrency, color: '#ff4d4f' },
        ].map((s, i) => (
          <Col xs={12} md={6} key={i}>
            <Card bodyStyle={{ padding: '14px 16px' }} style={{ borderRadius: 8, border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.07)', borderTop: `3px solid ${s.color}` }}>
              <Statistic title={<Text style={{ fontSize: 11, color: '#888' }}>{s.title}</Text>}
                value={s.value} formatter={s.formatter ? v => s.formatter(v) : undefined}
                valueStyle={{ color: s.color, fontSize: 18, fontWeight: 700 }} />
            </Card>
          </Col>
        ))}
      </Row>

      <div ref={tableRef}>
      <Card style={{ borderRadius: 8, border: 'none' }} bodyStyle={{ padding: 0 }}>
        <Table columns={columns} dataSource={filtered} loading={isLoading}
          rowKey="Purchase_ID" size="small" pagination={{ pageSize: 20 }}
          scroll={{ x: 1000 }} />
      </Card>
      </div>

      {/* Purchase Detail Modal */}
      <Modal title={`Purchase Detail — ${detailPurchase?.Purchase_Number}`}
        open={!!detailPurchase} onCancel={() => setDetailPurchase(null)}
        footer={null} width={780}>
        {purchaseDetail && (
          <div>
            <Descriptions size="small" bordered column={2} style={{ marginBottom: 16 }}>
              <Descriptions.Item label="Supplier">{purchaseDetail.purchase?.Supplier_Name || '-'}</Descriptions.Item>
              <Descriptions.Item label="Invoice No">{purchaseDetail.purchase?.Supplier_Invoice_No || '-'}</Descriptions.Item>
              <Descriptions.Item label="Date">{dayjs(purchaseDetail.purchase?.Purchase_Date).format('DD-MMM-YYYY')}</Descriptions.Item>
              <Descriptions.Item label="Payment">{purchaseDetail.purchase?.Payment_Mode || '-'}</Descriptions.Item>
              <Descriptions.Item label="Total Amount"><Text strong style={{ color: '#B8860B' }}>{formatCurrency(purchaseDetail.purchase?.Total_Amount)}</Text></Descriptions.Item>
              <Descriptions.Item label="Balance"><Text strong style={{ color: '#ff4d4f' }}>{formatCurrency(purchaseDetail.purchase?.Balance_Amount)}</Text></Descriptions.Item>
              <Descriptions.Item label="Notes" span={2}>{purchaseDetail.purchase?.Notes || '-'}</Descriptions.Item>
            </Descriptions>
            <Table
            scroll={{ x: "max-content" }} columns={detailItemCols} dataSource={purchaseDetail.items || []}
              rowKey="Detail_ID" size="small" pagination={false} />
          </div>
        )}
      </Modal>

      <PageTour steps={tourSteps} />
    </div>
  );
}
