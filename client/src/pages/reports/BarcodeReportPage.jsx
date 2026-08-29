/**
 * Barcode Report — a searchable list of every tag/barcode ever created,
 * with its current stock status and whether/when it was last actually
 * printed (from tbl_print_log, the same log Print History reads). This
 * didn't exist anywhere before — barcode generation and reprint both
 * worked, but there was no way to just look up "every barcode we have."
 */
import React, { useState } from 'react';
import { Table, Card, Input, Select, DatePicker, Space, Tag, Button, Typography, message } from 'antd';
import { SearchOutlined, PrinterOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { reportsApi } from '../../api/modules';
import { useAuthStore } from '../../store/authStore';
import { formatWeight } from '../../utils/calculations';
import { printBarcodeLabel } from '../../utils/thermalReceipt';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

const STATUS_COLOR = { Available: 'green', Sold: 'default', 'On Approval': 'orange', 'On Display': 'blue', Unavailable: 'red' };

export default function BarcodeReportPage() {
  const { user } = useAuthStore();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState(undefined);
  const [dateRange, setDateRange] = useState(null);
  const [reprintingId, setReprintingId] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ['barcode-report', search, status, dateRange],
    queryFn: () => reportsApi.barcodeReport({
      search: search || undefined,
      status,
      fromDate: dateRange?.[0]?.format('YYYY-MM-DD'),
      toDate: dateRange?.[1]?.format('YYYY-MM-DD'),
    }).then((r) => r.data.data),
  });

  const reprint = async (row) => {
    setReprintingId(row.Ornament_ID);
    try {
      const result = await printBarcodeLabel(row, user?.companyName);
      if (result?.success) message.success('Label sent to printer.');
      else message.warning('Sent to the fallback print dialog — check the barcode printer.');
    } catch {
      message.error('Failed to print this label.');
    } finally {
      setReprintingId(null);
    }
  };

  const columns = [
    { title: 'Barcode', dataIndex: 'Article_Number', render: (v) => <Text code strong>{v}</Text> },
    { title: 'Item', dataIndex: 'Type_Name' },
    { title: 'Design', dataIndex: 'Design_Name' },
    { title: 'Metal', dataIndex: 'Metal_Type' },
    { title: 'Purity', dataIndex: 'Purity_Code' },
    { title: 'Gross Wt', dataIndex: 'Gross_Weight', render: (v) => formatWeight(v) },
    { title: 'Status', dataIndex: 'Status', render: (v) => <Tag color={STATUS_COLOR[v] || 'default'}>{v}</Tag> },
    { title: 'Created', dataIndex: 'Created_Date', render: (v) => dayjs(v).format('DD-MMM-YYYY') },
    {
      title: 'Last Printed',
      dataIndex: 'Last_Printed_Date',
      render: (v, r) => v
        ? <span>{dayjs(v).format('DD-MMM-YYYY HH:mm')} <Tag color={r.Last_Print_Status === 'Success' ? 'green' : 'red'} style={{ marginLeft: 4 }}>{r.Last_Print_Status}</Tag></span>
        : <Text type="secondary">Never</Text>,
    },
    {
      title: 'Actions',
      render: (_, r) => (
        <Button size="small" icon={<PrinterOutlined />} loading={reprintingId === r.Ornament_ID} onClick={() => reprint(r)}>
          Print
        </Button>
      ),
    },
  ];

  return (
    <div className="page-wrapper">
      <div className="page-header">
        <div>
          <div className="page-header-title">Barcode Report</div>
          <div className="page-header-sub">{data?.items?.length || 0} barcodes{data?.truncated ? ' (showing first 2000 — narrow your filters for the rest)' : ''}</div>
        </div>
      </div>

      <Card className="erp-card" style={{ marginBottom: 12 }} bodyStyle={{ padding: '12px 16px' }}>
        <Space wrap>
          <Input.Search
            placeholder="Search barcode / article number..."
            style={{ width: 260 }}
            allowClear
            prefix={<SearchOutlined />}
            onSearch={setSearch}
            onChange={(e) => !e.target.value && setSearch('')}
          />
          <Select allowClear placeholder="Status" style={{ width: 150 }} value={status} onChange={setStatus}
            options={[
              { value: 'available', label: 'Available' },
              { value: 'sold', label: 'Sold' },
              { value: 'on_approval', label: 'On Approval' },
            ]} />
          <RangePicker value={dateRange} onChange={setDateRange} format="DD-MMM-YYYY" />
        </Space>
      </Card>

      <Card className="erp-card" bodyStyle={{ padding: 0 }}>
        <div className="table-responsive">
          <Table
            className="erp-table"
            columns={columns}
            dataSource={data?.items || []}
            loading={isLoading}
            rowKey="Ornament_ID"
            scroll={{ x: 900 }}
            pagination={{ pageSize: 50, showTotal: (t) => `${t} barcodes` }}
            size="small"
          />
        </div>
      </Card>
    </div>
  );
}
