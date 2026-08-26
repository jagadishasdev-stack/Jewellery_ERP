/**
 * GST Returns — real GSTR-1 and GSTR-3B return tables, built from actual
 * sales/purchase/ledger data (GET /reports/gstr1, /reports/gstr3b). The
 * older GST Summary card (Sales Reports page) deliberately stopped at a
 * plain B2B/B2C split; this is the follow-through.
 *
 * NOT a GSTN-portal upload file — the real portal JSON schema has
 * extensive validation (2-digit state codes, POS codes, exact field
 * names) this doesn't attempt to replicate. These are the underlying
 * numbers for your CA/the offline utility to file from, or to cross-
 * check what you're about to file — same framing as the Help Center's
 * own GSTR guidance.
 */
import React, { useState, useRef } from 'react';
import {
  Card, Typography, DatePicker, Button, Space, Tag, Tabs, Table,
  Row, Col, Statistic, Alert, Empty, message,
} from 'antd';
import { DownloadOutlined, FileProtectOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { reportsApi } from '../../api/modules';
import { formatCurrency } from '../../utils/calculations';
import PageTour from '../../components/PageTour';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

const exportCSV = (data, filename) => {
  if (!data?.length) { message.warning('Nothing to export for this period.'); return; }
  const headers = Object.keys(data[0]).join(',');
  const rows = data.map((r) => Object.values(r).map((v) => `"${v ?? ''}"`).join(','));
  const blob = new Blob([[headers, ...rows].join('\n')], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${filename}_${dayjs().format('YYYYMMDD')}.csv`;
  a.click();
};

export default function GstReturnsPage() {
  const [dateRange, setDateRange] = useState([dayjs().startOf('month'), dayjs()]);
  const fromDate = dateRange[0].format('YYYY-MM-DD');
  const toDate = dateRange[1].format('YYYY-MM-DD');

  const { data: gstr1, isLoading: gstr1Loading } = useQuery({
    queryKey: ['gstr1', fromDate, toDate],
    queryFn: () => reportsApi.gstr1({ fromDate, toDate }).then((r) => r.data.data),
  });
  const { data: gstr3b, isLoading: gstr3bLoading } = useQuery({
    queryKey: ['gstr3b', fromDate, toDate],
    queryFn: () => reportsApi.gstr3b({ fromDate, toDate }).then((r) => r.data.data),
  });

  const dateRangeRef = useRef(null);
  const tabsRef = useRef(null);
  const tourSteps = [
    { title: '1. Choose the Return Period', description: 'Pick the month (or any range) you\'re filing for.', target: () => dateRangeRef.current },
    { title: '2. GSTR-1 & GSTR-3B Tables', description: 'B2B, B2CL, B2CS, HSN Summary, and Document Summary for GSTR-1 — outward supplies and ITC for GSTR-3B. Export any table as CSV to hand to your CA or cross-check against the GST portal.', target: () => tabsRef.current },
  ];

  const b2bCols = [
    { title: 'GSTIN', dataIndex: 'gstin' },
    { title: 'Receiver', dataIndex: 'receiver_name' },
    { title: 'Invoice No', dataIndex: 'invoice_number' },
    { title: 'Date', dataIndex: 'invoice_date', render: (v) => dayjs(v).format('DD-MMM-YYYY') },
    { title: 'Invoice Value', dataIndex: 'invoice_value', render: formatCurrency },
    { title: 'Place of Supply', dataIndex: 'place_of_supply' },
    { title: 'Rate %', dataIndex: 'rate' },
    { title: 'Taxable Value', dataIndex: 'taxable_value', render: formatCurrency },
    { title: 'CGST', dataIndex: 'cgst', render: formatCurrency },
    { title: 'SGST', dataIndex: 'sgst', render: formatCurrency },
    { title: 'IGST', dataIndex: 'igst', render: formatCurrency },
  ];
  const b2clCols = [
    { title: 'Invoice No', dataIndex: 'invoice_number' },
    { title: 'Date', dataIndex: 'invoice_date', render: (v) => dayjs(v).format('DD-MMM-YYYY') },
    { title: 'Invoice Value', dataIndex: 'invoice_value', render: formatCurrency },
    { title: 'Place of Supply', dataIndex: 'place_of_supply' },
    { title: 'Rate %', dataIndex: 'rate' },
    { title: 'Taxable Value', dataIndex: 'taxable_value', render: formatCurrency },
    { title: 'IGST', dataIndex: 'igst', render: formatCurrency },
  ];
  const b2csCols = [
    { title: 'Place of Supply', dataIndex: 'place_of_supply' },
    { title: 'Rate %', dataIndex: 'rate' },
    { title: 'Type', dataIndex: 'type' },
    { title: 'Invoices', dataIndex: 'invoice_count' },
    { title: 'Taxable Value', dataIndex: 'taxable_value', render: formatCurrency },
    { title: 'CGST', dataIndex: 'cgst', render: formatCurrency },
    { title: 'SGST', dataIndex: 'sgst', render: formatCurrency },
    { title: 'IGST', dataIndex: 'igst', render: formatCurrency },
  ];
  const hsnCols = [
    { title: 'HSN Code', dataIndex: 'hsn_code' },
    { title: 'UQC', dataIndex: 'uqc' },
    { title: 'Total Qty', dataIndex: 'total_quantity' },
    { title: 'Rate %', dataIndex: 'rate' },
    { title: 'Taxable Value', dataIndex: 'taxable_value', render: formatCurrency },
    { title: 'Total GST', dataIndex: 'total_gst', render: formatCurrency },
  ];

  const Section = ({ title, hint, data, columns, filename, rowKey }) => (
    <Card
      style={{ borderRadius: 8, marginBottom: 16 }}
      title={title}
      extra={<Button size="small" icon={<DownloadOutlined />} onClick={() => exportCSV(data || [], filename)}>Export CSV</Button>}
    >
      {hint && <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 8 }}>{hint}</Text>}
      <Table
        scroll={{ x: 'max-content' }} size="small" columns={columns} dataSource={data || []}
        rowKey={rowKey} pagination={{ pageSize: 10 }} loading={gstr1Loading}
        locale={{ emptyText: <Empty description="Nothing for this period." /> }}
      />
    </Card>
  );

  return (
    <div className="page-wrapper">
      <div className="page-header">
        <Title level={4} style={{ margin: 0 }}><Space><FileProtectOutlined style={{ color: '#B8860B' }} />GST Returns</Space></Title>
        <div ref={dateRangeRef}>
          <RangePicker value={dateRange} onChange={(d) => d && setDateRange(d)} format="DD-MMM-YYYY"
            presets={[
              { label: 'This Month', value: [dayjs().startOf('month'), dayjs()] },
              { label: 'Last Month', value: [dayjs().subtract(1, 'month').startOf('month'), dayjs().subtract(1, 'month').endOf('month')] },
            ]} />
        </div>
      </div>

      <Alert
        type="warning" showIcon style={{ marginBottom: 16, borderRadius: 8 }}
        message="Not an automatic GSTN upload"
        description="These tables give you the real underlying numbers to file GSTR-1/3B from — via your CA, the GST offline utility, or the portal directly. Place of Supply shows the state name, not the portal's 2-digit code; cross-check before filing."
      />

      <div ref={tabsRef}>
      <Tabs
        defaultActiveKey="gstr1"
        items={[
          {
            key: 'gstr1', label: 'GSTR-1 (Outward Supplies)',
            children: (
              <>
                {gstr1?.docSummary && (
                  <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
                    {[
                      { title: 'Total Invoices', value: gstr1.docSummary.total_count, color: '#B8860B' },
                      { title: 'Cancelled', value: gstr1.docSummary.cancelled_count, color: '#ff4d4f' },
                      { title: 'From Invoice', value: gstr1.docSummary.from_invoice || '-', color: '#1890ff', isText: true },
                      { title: 'To Invoice', value: gstr1.docSummary.to_invoice || '-', color: '#1890ff', isText: true },
                    ].map((s, i) => (
                      <Col xs={12} md={6} key={i}>
                        <Card bodyStyle={{ padding: '12px 14px' }} style={{ borderRadius: 8, border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.07)', borderTop: `3px solid ${s.color}` }}>
                          <Statistic title={<Text style={{ fontSize: 11, color: '#888' }}>{s.title}</Text>}
                            value={s.value} valueStyle={{ color: s.color, fontSize: s.isText ? 12 : 18, fontWeight: 700 }} />
                        </Card>
                      </Col>
                    ))}
                  </Row>
                )}
                <Section title="B2B — Registered Customers (Table 4A/4B)" data={gstr1?.b2b} columns={b2bCols} filename="gstr1_b2b" rowKey="invoice_number" />
                <Section title="B2CL — Interstate, Unregistered, > ₹2.5L (Table 5)" data={gstr1?.b2cl} columns={b2clCols} filename="gstr1_b2cl" rowKey="invoice_number" />
                <Section title="B2CS — Other Unregistered Supplies, Rate-wise (Table 7)"
                  hint="Aggregated by Place of Supply + Rate, per GSTR-1's own format for this table — not invoice-wise."
                  data={gstr1?.b2cs} columns={b2csCols} filename="gstr1_b2cs" rowKey={(r) => `${r.place_of_supply}-${r.rate}`} />
                <Section title="HSN-wise Summary (Table 12)"
                  hint="Resolved via each sold item's own type → HSN code; falls back to 7113 (the standard jewellery HSN) only where an item type has no HSN code on file."
                  data={gstr1?.hsnSummary} columns={hsnCols} filename="gstr1_hsn" rowKey={(r) => `${r.hsn_code}-${r.rate}`} />
              </>
            ),
          },
          {
            key: 'gstr3b', label: 'GSTR-3B (Summary Return)',
            children: gstr3b && (
              <Row gutter={[16, 16]}>
                <Col xs={24} md={12}>
                  <Card title="3.1 Outward Taxable Supplies" style={{ borderRadius: 8 }} loading={gstr3bLoading}>
                    {[
                      { label: 'Taxable Value', val: gstr3b.outward_taxable_supplies.taxable_value },
                      { label: 'IGST', val: gstr3b.outward_taxable_supplies.igst },
                      { label: 'CGST', val: gstr3b.outward_taxable_supplies.cgst },
                      { label: 'SGST', val: gstr3b.outward_taxable_supplies.sgst },
                    ].map((r, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f5f5f5' }}>
                        <Text style={{ color: '#666' }}>{r.label}</Text>
                        <Text strong style={{ color: '#1890ff' }}>{formatCurrency(r.val)}</Text>
                      </div>
                    ))}
                  </Card>
                </Col>
                <Col xs={24} md={12}>
                  <Card title="4. Eligible ITC" style={{ borderRadius: 8 }} loading={gstr3bLoading}>
                    {[
                      { label: 'IGST Available', val: gstr3b.itc_available.igst },
                      { label: 'CGST Available', val: gstr3b.itc_available.cgst },
                      { label: 'SGST Available', val: gstr3b.itc_available.sgst },
                    ].map((r, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f5f5f5' }}>
                        <Text style={{ color: '#666' }}>{r.label}</Text>
                        <Text strong style={{ color: '#52c41a' }}>{formatCurrency(r.val)}</Text>
                      </div>
                    ))}
                  </Card>
                </Col>
                <Col xs={24}>
                  <Card title="Net Tax Payable" style={{ borderRadius: 8 }} loading={gstr3bLoading}>
                    <Row gutter={16}>
                      <Col xs={8}><Statistic title="IGST" value={gstr3b.tax_payable.igst} formatter={formatCurrency} valueStyle={{ color: '#B8860B' }} /></Col>
                      <Col xs={8}><Statistic title="CGST" value={gstr3b.tax_payable.cgst} formatter={formatCurrency} valueStyle={{ color: '#B8860B' }} /></Col>
                      <Col xs={8}><Statistic title="SGST" value={gstr3b.tax_payable.sgst} formatter={formatCurrency} valueStyle={{ color: '#B8860B' }} /></Col>
                    </Row>
                    <Alert style={{ marginTop: 12, fontSize: 11 }} type="info" showIcon
                      message="Computed as Output − Input within the same head (IGST offsets IGST, CGST offsets CGST, SGST offsets SGST). Real cross-utilization rules (e.g. IGST credit against CGST/SGST liability) are more flexible than this — verify with your CA before payment." />
                  </Card>
                </Col>
              </Row>
            ),
          },
        ]}
      />
      </div>

      <PageTour steps={tourSteps} />
    </div>
  );
}
