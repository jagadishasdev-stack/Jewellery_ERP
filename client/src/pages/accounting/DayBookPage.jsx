/**
 * Day Book — every voucher posted on one day, with its full Dr/Cr line
 * breakdown expandable underneath (GET /accounting/day-book). This is the
 * real double-entry day book — distinct from Reports > Financial Reports'
 * simplified "Day Book" tab, which lists sales/purchase/receipt rows in
 * plain business terms without exposing the underlying journal lines.
 */
import React, { useState, useRef } from 'react';
import { DatePicker, Table, Typography, Space, Tag, Empty } from 'antd';
import { CalendarOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { accountingApi } from '../../api/modules';
import { formatCurrency } from '../../utils/calculations';
import PageTour from '../../components/PageTour';
import dayjs from 'dayjs';

const { Title, Text } = Typography;

const SOURCE_COLOR = { SALE: 'green', PURCHASE: 'red', RECEIPT: 'blue', PAYMENT: 'orange', CONTRA: 'purple', JOURNAL: 'default', DAY_CLOSE: 'gold' };

export default function DayBookPage() {
  const [date, setDate] = useState(dayjs());
  const pickerRef = useRef(null);

  const { data, isLoading } = useQuery({
    queryKey: ['day-book', date.format('YYYY-MM-DD')],
    queryFn: () => accountingApi.getDayBook({ date: date.format('YYYY-MM-DD') }).then((r) => r.data.data),
  });

  const entryColumns = [
    { title: 'Account', dataIndex: 'Ledger_Account' },
    { title: 'Debit', dataIndex: 'Amount', render: (v, r) => r.Entry_Type === 'Dr' ? <Text style={{ color: '#52c41a' }}>{formatCurrency(v)}</Text> : '-' },
    { title: 'Credit', dataIndex: 'Amount', render: (v, r) => r.Entry_Type === 'Cr' ? <Text style={{ color: '#ff4d4f' }}>{formatCurrency(v)}</Text> : '-' },
    { title: 'Narration', dataIndex: 'Narration' },
  ];

  const columns = [
    { title: 'Voucher No.', dataIndex: 'Journal_Number', render: (v) => <Text code style={{ fontSize: 11 }}>{v}</Text> },
    { title: 'Type', dataIndex: 'Source_Type', render: (v) => <Tag color={SOURCE_COLOR[v] || 'default'}>{v}</Tag> },
    { title: 'Reference', dataIndex: 'Reference' },
    { title: 'Narration', dataIndex: 'Narration' },
    {
      title: 'Total', dataIndex: 'entries',
      render: (entries) => formatCurrency(entries.filter((e) => e.Entry_Type === 'Dr').reduce((s, e) => s + parseFloat(e.Amount), 0)),
    },
  ];

  const tourSteps = [
    { title: '1. Pick a Day', description: 'Every voucher posted on this date — sales, purchases, receipts, payments, transfers, adjustments — all in one list.', target: () => pickerRef.current },
    { title: '2. Expand for the Full Entry', description: 'Click a row to see the exact Dr/Cr lines behind that voucher — the real double-entry breakdown, not just a summary.' },
  ];

  return (
    <div className="page-wrapper">
      <div className="page-header">
        <Title level={4} style={{ margin: 0 }}><Space><CalendarOutlined style={{ color: '#1890ff' }} />Day Book</Space></Title>
        <div ref={pickerRef}>
          <DatePicker value={date} onChange={(d) => d && setDate(d)} format="DD-MMM-YYYY" />
        </div>
      </div>

      <Table
        size="small" columns={columns} dataSource={data?.vouchers || []} loading={isLoading}
        rowKey="Journal_ID" pagination={{ pageSize: 25 }} scroll={{ x: 'max-content' }}
        expandable={{
          expandedRowRender: (r) => <Table size="small" columns={entryColumns} dataSource={r.entries} rowKey="Entry_ID" pagination={false} />,
        }}
        locale={{ emptyText: <Empty description={`No vouchers posted on ${date.format('DD-MMM-YYYY')}.`} /> }}
      />

      <PageTour steps={tourSteps} />
    </div>
  );
}
