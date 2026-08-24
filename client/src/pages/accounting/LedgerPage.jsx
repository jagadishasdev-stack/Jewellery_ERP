/**
 * Ledger — one account's full transaction history with a running balance,
 * straight off tbl_accounting_entries via GET /accounting/ledger/:accountId
 * (see server/src/routes/accounting.js). Deep-linkable with ?accountId= so
 * Chart of Accounts can jump straight here for a given ledger.
 */
import React, { useState, useRef } from 'react';
import { Card, Select, DatePicker, Table, Typography, Space, Tag, Button, Statistic, Row, Col } from 'antd';
import { BookOutlined, DownloadOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { accountingApi } from '../../api/modules';
import { formatCurrency } from '../../utils/calculations';
import PageTour from '../../components/PageTour';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

const exportCSV = (rows, filename) => {
  if (!rows?.length) return;
  const csv = [Object.keys(rows[0]).join(','), ...rows.map((r) => Object.values(r).map((v) => `"${v ?? ''}"`).join(','))].join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = `${filename}_${dayjs().format('YYYYMMDD')}.csv`;
  a.click();
};

export default function LedgerPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [dateRange, setDateRange] = useState(null);
  const pickerRef = useRef(null);
  const accountId = searchParams.get('accountId') || null;

  const { data: accounts } = useQuery({
    queryKey: ['chart-of-accounts'],
    queryFn: () => accountingApi.getChartOfAccounts().then((r) => r.data.data || []),
  });

  const { data: ledger, isLoading } = useQuery({
    queryKey: ['ledger', accountId, dateRange?.[0]?.format('YYYY-MM-DD'), dateRange?.[1]?.format('YYYY-MM-DD')],
    queryFn: () => accountingApi.getLedger(accountId, {
      from: dateRange?.[0]?.format('YYYY-MM-DD'), to: dateRange?.[1]?.format('YYYY-MM-DD'),
    }).then((r) => r.data.data),
    enabled: !!accountId,
  });

  const columns = [
    { title: 'Date', dataIndex: 'Entry_Date', render: (v) => dayjs(v).format('DD-MMM-YYYY') },
    { title: 'Voucher No.', dataIndex: 'Journal_Number', render: (v) => <Text code style={{ fontSize: 11 }}>{v}</Text> },
    { title: 'Type', dataIndex: 'Source_Type', render: (v) => <Tag>{v}</Tag> },
    { title: 'Reference', dataIndex: 'Reference' },
    { title: 'Narration', dataIndex: 'Narration' },
    { title: 'Debit', dataIndex: 'Amount', render: (v, r) => r.Entry_Type === 'Dr' ? <Text style={{ color: '#52c41a', fontWeight: 600 }}>{formatCurrency(v)}</Text> : '-' },
    { title: 'Credit', dataIndex: 'Amount', render: (v, r) => r.Entry_Type === 'Cr' ? <Text style={{ color: '#ff4d4f', fontWeight: 600 }}>{formatCurrency(v)}</Text> : '-' },
    { title: 'Running Balance', dataIndex: 'Running_Balance', render: (v) => <Text strong style={{ color: '#B8860B' }}>{formatCurrency(v)}</Text> },
  ];

  const tourSteps = [
    { title: '1. Pick an Account', description: 'Choose any ledger from the Chart of Accounts — every posted transaction against it, with a running balance, shows below.', target: () => pickerRef.current },
    { title: '2. Opening Balance is Real', description: 'The opening balance shown already accounts for everything before your selected date range — narrow the range and it stays correct.' },
  ];

  return (
    <div className="page-wrapper">
      <div className="page-header">
        <Title level={4} style={{ margin: 0 }}><Space><BookOutlined style={{ color: '#1890ff' }} />Ledger</Space></Title>
      </div>

      <div ref={pickerRef} style={{ marginBottom: 16 }}>
        <Space wrap>
          <Select
            showSearch style={{ width: 320 }} placeholder="Select a ledger account"
            value={accountId ? parseInt(accountId) : undefined}
            optionFilterProp="label"
            options={(accounts || []).map((a) => ({ value: a.Account_ID, label: `${a.Account_Code} — ${a.Account_Name}` }))}
            onChange={(v) => setSearchParams({ accountId: v })}
          />
          <RangePicker value={dateRange} onChange={setDateRange} format="DD-MMM-YYYY" allowClear
            presets={[{ label: 'This Month', value: [dayjs().startOf('month'), dayjs()] }, { label: 'This Year', value: [dayjs().startOf('year'), dayjs()] }]} />
          <Button icon={<DownloadOutlined />} onClick={() => exportCSV(ledger?.entries, 'ledger')} disabled={!ledger?.entries?.length}>CSV</Button>
        </Space>
      </div>

      {accountId && ledger && (
        <>
          <Row gutter={16} style={{ marginBottom: 16 }}>
            <Col xs={12} sm={8}><Card size="small"><Statistic title="Opening Balance" value={formatCurrency(ledger.openingBalance)} valueStyle={{ fontSize: 18 }} /></Card></Col>
            <Col xs={12} sm={8}><Card size="small"><Statistic title="Closing Balance" value={formatCurrency(ledger.closingBalance)} valueStyle={{ fontSize: 18, color: '#B8860B' }} /></Card></Col>
            <Col xs={24} sm={8}><Card size="small"><Statistic title="Entries" value={ledger.entries.length} valueStyle={{ fontSize: 18 }} /></Card></Col>
          </Row>
          <Table
            size="small" columns={columns} dataSource={ledger.entries} loading={isLoading}
            rowKey={(r, i) => i} pagination={{ pageSize: 25 }} scroll={{ x: 'max-content' }}
          />
        </>
      )}
      {!accountId && <Text type="secondary">Select an account above to view its ledger.</Text>}

      <PageTour steps={tourSteps} />
    </div>
  );
}
