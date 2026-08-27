/**
 * Print History (spec §23) — every real print attempt (and every Test
 * Print) recorded via printService.js's logPrintAttempt(), server-side in
 * tbl_print_log. Answers "my bill was not printed": look up the invoice
 * number and see exactly which printer it went to, when, by whom, and
 * whether it actually succeeded — not just whether the sale saved.
 */
import React, { useState } from 'react';
import { Table, Typography, Space, Tag, Select, DatePicker, Input, Button } from 'antd';
import { HistoryOutlined, ReloadOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { printLogApi } from '../../api/modules';

const { Title, Text } = Typography;
const { Option } = Select;
const { RangePicker } = DatePicker;

export default function PrintHistoryPage() {
  const [dateRange, setDateRange] = useState([dayjs().subtract(7, 'day'), dayjs()]);
  const [status, setStatus] = useState(undefined);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const limit = 25;

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['print-log', dateRange[0]?.format('YYYY-MM-DD'), dateRange[1]?.format('YYYY-MM-DD'), status, page],
    queryFn: () => printLogApi.getHistory({
      fromDate: dateRange[0]?.format('YYYY-MM-DD'),
      toDate: dateRange[1]?.format('YYYY-MM-DD'),
      status, page, limit,
    }).then((r) => r.data.data),
  });

  const items = (data?.items || []).filter((r) => !search || (r.Document_Number || '').toLowerCase().includes(search.toLowerCase()));

  const columns = [
    { title: 'Date', dataIndex: 'Printed_Date', width: 160, render: (v) => dayjs(v).format('DD-MMM-YYYY HH:mm') },
    { title: 'Document', dataIndex: 'Document_Type', width: 160, render: (v) => v || '—' },
    { title: 'Number', dataIndex: 'Document_Number', width: 140, render: (v) => v || '—' },
    { title: 'Printer', dataIndex: 'Printer_Name', width: 180 },
    { title: 'User', dataIndex: 'Printed_By', width: 140 },
    {
      title: 'Status', dataIndex: 'Status', width: 110,
      render: (v) => v === 'Success' ? <Tag color="green">Success</Tag> : <Tag color="red">Failed</Tag>,
    },
    {
      title: 'Error', dataIndex: 'Error_Message',
      render: (v) => v ? <Text type="danger" style={{ fontSize: 12 }}>{v}</Text> : '—',
    },
  ];

  return (
    <div className="page-wrapper">
      <div className="page-header">
        <Title level={4} style={{ margin: 0 }}>
          <Space><HistoryOutlined style={{ color: '#B8860B' }} />Print History</Space>
        </Title>
      </div>

      <Space wrap style={{ marginBottom: 16, background: '#fff', padding: 16, borderRadius: 8, boxShadow: '0 1px 4px rgba(0,0,0,.07)' }}>
        <RangePicker value={dateRange} onChange={(v) => { setDateRange(v || [null, null]); setPage(1); }} />
        <Select allowClear placeholder="All statuses" style={{ width: 150 }} value={status} onChange={(v) => { setStatus(v); setPage(1); }}>
          <Option value="Success">Success</Option>
          <Option value="Failed">Failed</Option>
        </Select>
        <Input.Search placeholder="Search document number" style={{ width: 220 }} value={search} onChange={(e) => setSearch(e.target.value)} allowClear />
        <Button icon={<ReloadOutlined />} onClick={() => refetch()}>Refresh</Button>
      </Space>

      <Table
        columns={columns}
        dataSource={items}
        rowKey="Log_ID"
        loading={isLoading}
        size="small"
        scroll={{ x: 'max-content' }}
        style={{ background: '#fff', borderRadius: 8, boxShadow: '0 1px 4px rgba(0,0,0,.07)' }}
        pagination={{
          current: page, pageSize: limit, total: data?.total || 0,
          onChange: setPage, showSizeChanger: false,
        }}
      />
    </div>
  );
}
