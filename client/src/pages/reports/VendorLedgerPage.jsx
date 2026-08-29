/**
 * Vendor Ledger — a per-supplier/karigar running purchase history.
 * Previously missing entirely: Chart of Accounts only had one pooled
 * "Supplier Payable" account (everyone mixed together), and Purchase
 * Reports only had a per-supplier OUTSTANDING total, not a transaction
 * list. Suppliers and Karigars share the same tbl_vendor_master table
 * (Vendor_Type differentiates them) and the same tbl_purchase_header
 * relationship, so one page covers both "Supplier Ledger" and "Karigar
 * Ledger" from the Missing Feature Report — the data model is already
 * unified, splitting the UI in two would be artificial.
 */
import React, { useState } from 'react';
import { Card, Select, Table, Row, Col, Statistic, Typography, Tag, Button, message } from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { karigarApi, reportsApi } from '../../api/modules';
import { formatCurrency } from '../../utils/calculations';
import dayjs from 'dayjs';

const { Text } = Typography;

const exportCSV = (data, filename) => {
  if (!data?.length) { message.warning('No data.'); return; }
  const csv = [Object.keys(data[0]).join(','), ...data.map((r) => Object.values(r).map((v) => `"${v ?? ''}"`).join(','))].join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = `${filename}_${dayjs().format('YYYYMMDD')}.csv`;
  a.click();
};

export default function VendorLedgerPage() {
  const [vendorId, setVendorId] = useState(null);

  const { data: vendors } = useQuery({
    queryKey: ['vendors-for-ledger'],
    queryFn: () => karigarApi.getVendors().then((r) => r.data.data || []),
  });

  const { data, isLoading } = useQuery({
    queryKey: ['vendor-ledger', vendorId],
    queryFn: () => reportsApi.supplierLedger(vendorId).then((r) => r.data.data),
    enabled: !!vendorId,
  });

  const totals = data?.totals || {};

  return (
    <div className="page-wrapper">
      <div className="page-header">
        <div>
          <div className="page-header-title">Vendor Ledger</div>
          <div className="page-header-sub">Per-supplier / karigar purchase history and running balance</div>
        </div>
      </div>

      <Card className="erp-card" style={{ marginBottom: 12 }} bodyStyle={{ padding: '12px 16px' }}>
        <Select
          showSearch placeholder="Search supplier / karigar by name..."
          style={{ width: 340 }}
          value={vendorId} onChange={setVendorId}
          filterOption={(input, option) => (option?.label ?? '').toLowerCase().includes(input.toLowerCase())}
          options={(vendors || []).map((v) => ({ value: v.Vendor_ID, label: `${v.Vendor_Name} (${v.Vendor_Type})` }))}
        />
      </Card>

      {vendorId && (
        <>
          <Row gutter={[12, 12]} style={{ marginBottom: 14 }}>
            <Col xs={12} md={6}><Card className="erp-card"><Statistic title="Purchases" value={totals.total_purchases || 0} /></Card></Col>
            <Col xs={12} md={6}><Card className="erp-card"><Statistic title="Total Value" value={formatCurrency(totals.total_value || 0)} valueStyle={{ fontSize: 18 }} /></Card></Col>
            <Col xs={12} md={6}><Card className="erp-card"><Statistic title="Paid" value={formatCurrency(totals.total_paid || 0)} valueStyle={{ fontSize: 18, color: '#52c41a' }} /></Card></Col>
            <Col xs={12} md={6}><Card className="erp-card"><Statistic title="Outstanding" value={formatCurrency(totals.total_outstanding || 0)} valueStyle={{ fontSize: 18, color: totals.total_outstanding > 0 ? '#ff4d4f' : undefined }} /></Card></Col>
          </Row>

          <Card className="erp-card" bodyStyle={{ padding: 0 }}
            title={data?.supplier?.Vendor_Name}
            extra={<Button size="small" icon={<DownloadOutlined />} onClick={() => exportCSV(data?.purchases, 'vendor_ledger')}>CSV</Button>}
          >
            <Table
              size="small"
              loading={isLoading}
              dataSource={data?.purchases || []}
              rowKey="Purchase_ID"
              pagination={{ pageSize: 20 }}
              columns={[
                { title: 'Purchase No.', dataIndex: 'Purchase_Number', render: (v) => <Text code>{v}</Text> },
                { title: 'Date', dataIndex: 'Purchase_Date', render: (v) => dayjs(v).format('DD-MMM-YYYY') },
                { title: 'Type', dataIndex: 'Purchase_Type' },
                { title: 'Amount', dataIndex: 'Total_Amount', render: (v) => formatCurrency(v) },
                { title: 'Paid', dataIndex: 'Amount_Paid', render: (v) => formatCurrency(v) },
                { title: 'Balance', dataIndex: 'Balance_Amount', render: (v) => parseFloat(v || 0) > 0 ? <Text type="danger">{formatCurrency(v)}</Text> : <Text type="secondary">-</Text> },
                { title: 'Status', dataIndex: 'Payment_Status', render: (v) => <Tag color={v === 'Paid' ? 'green' : v === 'Partial' ? 'orange' : 'red'}>{v}</Tag> },
              ]}
            />
          </Card>
        </>
      )}
    </div>
  );
}
