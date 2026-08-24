/**
 * Closing Report — date-range inventory reconciliation, broken down by
 * Metal Type (filter) and Item Type (row):
 *   Opening Stock + Additions + Approval Receipts - Sales - Approval Issues
 *   = Closing Stock
 * plus an all-time "Number of Tags" count per item type (every ornament gets
 * exactly one Article_Number/tag on creation, so this figure is independent
 * of the date filter — see server/src/services/closingReportService.js).
 */
import React, { useState, useRef } from 'react';
import {
  Row, Col, Card, Select, DatePicker, Button, Space, Table, Typography, Statistic, message,
} from 'antd';
import { DownloadOutlined, PrinterOutlined, FilePdfOutlined, GoldOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { reportsApi } from '../../api/modules';
import { formatWeight } from '../../utils/calculations';
import PageTour from '../../components/PageTour';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

const METAL_OPTIONS = ['All', 'Gold', 'Silver', 'Diamond', 'Platinum'];

const exportCSV = (data, filename) => {
  if (!data?.length) { message.warning('No data.'); return; }
  const csv = [Object.keys(data[0]).join(','), ...data.map(r => Object.values(r).map(v => `"${v ?? ''}"`).join(','))].join('\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = `${filename}_${dayjs().format('YYYYMMDD')}.csv`; a.click();
};

export default function ClosingReportPage() {
  const [metal, setMetal] = useState('All');
  const [dateRange, setDateRange] = useState([dayjs().startOf('month'), dayjs()]);
  const [pdfLoading, setPdfLoading] = useState(false);

  const fromDate = dateRange[0].format('YYYY-MM-DD');
  const toDate = dateRange[1].format('YYYY-MM-DD');

  const { data, isLoading } = useQuery({
    queryKey: ['closing-report', metal, fromDate, toDate],
    queryFn: () => reportsApi.closingReport({ metal, fromDate, toDate }).then(r => r.data.data),
  });

  const rows = data?.rows || [];
  const totals = data?.totals || {};

  const downloadPdf = async () => {
    setPdfLoading(true);
    try {
      const res = await reportsApi.closingReportPdf({ metal, fromDate, toDate });
      const blob = new Blob([res.data], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `closing-report_${fromDate}_to_${toDate}.pdf`; a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      message.error('Failed to generate PDF.');
    } finally {
      setPdfLoading(false);
    }
  };

  // ── Walkthrough tour refs ───────────────────────────────────────────────────
  const filtersRef = useRef(null);
  const summaryRef = useRef(null);
  const tableRef = useRef(null);
  const exportRef = useRef(null);
  const tourSteps = [
    { title: '1. Metal & Date Range', description: 'Pick a metal (or "All Metals") and the date range to reconcile — the report shows every item type\'s stock movement for that window.', target: () => filtersRef.current },
    { title: '2. Summary', description: 'Quick totals across every item type — opening/closing weight & pieces, and total tags on file.', target: () => summaryRef.current },
    { title: '3. Item Type Grid', description: 'One row per item type: Opening Stock → Additions → Sales → Approval Issue/Receive → Closing Stock, plus how many tags/barcodes exist for it. Closing Stock is calculated automatically — it isn\'t entered anywhere, it\'s Opening + Add + Approval Receive − Sold − Approval Issue.', target: () => tableRef.current },
    { title: '4. Export', description: 'Excel Export downloads a CSV (opens directly in Excel). Download PDF generates a formatted printable file. Print opens your browser\'s print dialog.', target: () => exportRef.current },
  ];

  const columns = [
    { title: 'Item Type', dataIndex: 'itemType', fixed: 'left', width: 130, render: (v) => <Text strong>{v}</Text> },
    { title: 'Opening Wt', dataIndex: 'openingWeight', width: 100, render: formatWeight },
    { title: 'Opening Pcs', dataIndex: 'openingPieces', width: 100 },
    { title: 'Add Pcs', dataIndex: 'addPieces', width: 90 },
    { title: 'Add Wt', dataIndex: 'addWeight', width: 90, render: formatWeight },
    { title: 'Sold Pcs', dataIndex: 'soldPieces', width: 90 },
    { title: 'Sold Wt', dataIndex: 'soldWeight', width: 90, render: formatWeight },
    { title: 'Appr. Issue Pcs', dataIndex: 'approvalIssuePieces', width: 110 },
    { title: 'Appr. Issue Wt', dataIndex: 'approvalIssueWeight', width: 110, render: formatWeight },
    { title: 'Appr. Receive Pcs', dataIndex: 'approvalReceivePieces', width: 120 },
    { title: 'Appr. Receive Wt', dataIndex: 'approvalReceiveWeight', width: 120, render: formatWeight },
    { title: 'Closing Wt', dataIndex: 'closingWeight', width: 100, render: (v) => <Text strong style={{ color: '#B8860B' }}>{formatWeight(v)}</Text> },
    { title: 'Closing Pcs', dataIndex: 'closingPieces', width: 100, render: (v) => <Text strong style={{ color: '#B8860B' }}>{v}</Text> },
    { title: 'Tags', dataIndex: 'tags', width: 80, fixed: 'right' },
  ];

  return (
    <div className="page-wrapper">
      <div className="page-header">
        <div>
          <div className="page-header-title"><GoldOutlined style={{ color: '#B8860B', marginRight: 8 }} />Closing Report</div>
          <div className="page-header-sub">Date-wise inventory reconciliation — Opening → Additions → Sales → Approval → Closing Stock</div>
        </div>
      </div>

      <Card className="erp-card" style={{ marginBottom: 14 }} bodyStyle={{ padding: '14px 16px' }}>
        <div ref={filtersRef}>
          <Space wrap size={12}>
            <Select value={metal} onChange={setMetal} style={{ width: 150 }}>
              {METAL_OPTIONS.map(m => <Select.Option key={m} value={m}>{m === 'All' ? 'All Metals' : m}</Select.Option>)}
            </Select>
            <RangePicker
              value={dateRange}
              onChange={(d) => d && setDateRange(d)}
              format="DD-MMM-YYYY"
              presets={[
                { label: 'This Month', value: [dayjs().startOf('month'), dayjs()] },
                { label: 'Last Month', value: [dayjs().subtract(1, 'month').startOf('month'), dayjs().subtract(1, 'month').endOf('month')] },
                { label: 'This Year', value: [dayjs().startOf('year'), dayjs()] },
              ]}
            />
          </Space>
        </div>
      </Card>

      <div ref={summaryRef}>
        <Row gutter={[10, 10]} style={{ marginBottom: 14 }}>
          {[
            { label: 'Opening Weight', value: totals.openingWeight, formatter: formatWeight, color: '#1890ff' },
            { label: 'Opening Pieces', value: totals.openingPieces, color: '#1890ff' },
            { label: 'Closing Weight', value: totals.closingWeight, formatter: formatWeight, color: '#B8860B' },
            { label: 'Closing Pieces', value: totals.closingPieces, color: '#B8860B' },
            { label: 'Total Tags', value: totals.tags, color: '#52c41a' },
          ].map((s, i) => (
            <Col xs={12} sm={8} md={4} key={i}>
              <Card className="kpi-card" bodyStyle={{ padding: '12px 14px' }} style={{ borderRadius: 10, border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.07)', borderTop: `3px solid ${s.color}` }}>
                <Statistic
                  title={<Text style={{ fontSize: 11, color: '#888' }}>{s.label}</Text>}
                  value={s.value || 0}
                  formatter={s.formatter ? (v) => s.formatter(v) : undefined}
                  valueStyle={{ color: s.color, fontSize: 16, fontWeight: 700 }}
                />
              </Card>
            </Col>
          ))}
        </Row>
      </div>

      <Card className="erp-card" bodyStyle={{ padding: '12px 16px' }}
        extra={
          <Space ref={exportRef} wrap>
            <Button icon={<DownloadOutlined />} onClick={() => exportCSV(rows, 'closing_report')}>Excel Export</Button>
            <Button icon={<FilePdfOutlined />} loading={pdfLoading} onClick={downloadPdf}>Download PDF</Button>
            <Button icon={<PrinterOutlined />} onClick={() => window.print()}>Print</Button>
          </Space>
        }
        title={<Title level={5} style={{ margin: 0 }}>Item Type Breakdown</Title>}
      >
        <div ref={tableRef}>
          <Table
            scroll={{ x: 'max-content' }}
            columns={columns}
            dataSource={rows}
            rowKey="itemType"
            loading={isLoading}
            size="small"
            pagination={false}
            summary={() => (
              <Table.Summary.Row style={{ background: '#FDF6E3' }}>
                <Table.Summary.Cell index={0}><Text strong>TOTAL</Text></Table.Summary.Cell>
                <Table.Summary.Cell index={1}><Text strong>{formatWeight(totals.openingWeight)}</Text></Table.Summary.Cell>
                <Table.Summary.Cell index={2}><Text strong>{totals.openingPieces || 0}</Text></Table.Summary.Cell>
                <Table.Summary.Cell index={3}><Text strong>{totals.addPieces || 0}</Text></Table.Summary.Cell>
                <Table.Summary.Cell index={4}><Text strong>{formatWeight(totals.addWeight)}</Text></Table.Summary.Cell>
                <Table.Summary.Cell index={5}><Text strong>{totals.soldPieces || 0}</Text></Table.Summary.Cell>
                <Table.Summary.Cell index={6}><Text strong>{formatWeight(totals.soldWeight)}</Text></Table.Summary.Cell>
                <Table.Summary.Cell index={7}><Text strong>{totals.approvalIssuePieces || 0}</Text></Table.Summary.Cell>
                <Table.Summary.Cell index={8}><Text strong>{formatWeight(totals.approvalIssueWeight)}</Text></Table.Summary.Cell>
                <Table.Summary.Cell index={9}><Text strong>{totals.approvalReceivePieces || 0}</Text></Table.Summary.Cell>
                <Table.Summary.Cell index={10}><Text strong>{formatWeight(totals.approvalReceiveWeight)}</Text></Table.Summary.Cell>
                <Table.Summary.Cell index={11}><Text strong style={{ color: '#B8860B' }}>{formatWeight(totals.closingWeight)}</Text></Table.Summary.Cell>
                <Table.Summary.Cell index={12}><Text strong style={{ color: '#B8860B' }}>{totals.closingPieces || 0}</Text></Table.Summary.Cell>
                <Table.Summary.Cell index={13}><Text strong>{totals.tags || 0}</Text></Table.Summary.Cell>
              </Table.Summary.Row>
            )}
          />
        </div>
      </Card>

      <PageTour steps={tourSteps} />
    </div>
  );
}
