/**
 * Gift Voucher Management — the issuing flow (Purchase Hub → Gift Voucher
 * Bill) and the redemption flow (POS checkout) both existed and worked,
 * but there was no page anywhere to just LOOK at what's been issued —
 * how many vouchers are outstanding, what they're worth, who holds them.
 * GET /day-close/vouchers already returned exactly this; nothing called it.
 */
import React, { useState } from 'react';
import { Table, Card, Typography, Tag, Space, Input, Row, Col, Statistic, Empty } from 'antd';
import { GiftOutlined, SearchOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { dayCloseApi } from '../../api/modules';
import { formatCurrency } from '../../utils/calculations';
import PageTour from '../../components/PageTour';
import dayjs from 'dayjs';

const { Title, Text } = Typography;

export default function GiftVoucherManagementPage() {
  const [searchText, setSearchText] = useState('');

  const { data: vouchers, isLoading } = useQuery({
    queryKey: ['gift-vouchers-list'],
    queryFn: () => dayCloseApi.getVouchers().then((r) => r.data.data || []),
  });

  const filtered = (vouchers || []).filter((v) =>
    !searchText ||
    v.Voucher_Code?.toLowerCase().includes(searchText.toLowerCase()) ||
    v.Customer_Name?.toLowerCase().includes(searchText.toLowerCase()) ||
    v.Mobile_1?.includes(searchText)
  );

  const totalIssued = (vouchers || []).reduce((s, v) => s + parseFloat(v.Voucher_Value || 0), 0);
  const totalOutstanding = (vouchers || []).filter((v) => v.Status === 'Active').reduce((s, v) => s + parseFloat(v.Balance_Amount || 0), 0);
  const activeCount = (vouchers || []).filter((v) => v.Status === 'Active').length;

  const statusColor = { Active: 'green', Used: 'blue', Expired: 'red', Cancelled: 'default' };

  const columns = [
    { title: 'Voucher Code', dataIndex: 'Voucher_Code', render: (v) => <Text code strong>{v}</Text> },
    { title: 'Issued To', dataIndex: 'Customer_Name', render: (v, r) => v ? <div>{v}<br /><Text type="secondary" style={{ fontSize: 11 }}>{r.Mobile_1}</Text></div> : <Text type="secondary">Unlinked</Text> },
    { title: 'Issue Date', dataIndex: 'Issue_Date', render: (v) => dayjs(v).format('DD-MMM-YYYY') },
    { title: 'Expiry', dataIndex: 'Expiry_Date', render: (v) => v ? dayjs(v).format('DD-MMM-YYYY') : <Text type="secondary">No expiry</Text> },
    { title: 'Value', dataIndex: 'Voucher_Value', render: (v) => formatCurrency(v) },
    { title: 'Used', dataIndex: 'Used_Amount', render: (v) => formatCurrency(v) },
    { title: 'Balance', dataIndex: 'Balance_Amount', render: (v) => <Text strong style={{ color: parseFloat(v) > 0 ? '#52c41a' : undefined }}>{formatCurrency(v)}</Text> },
    { title: 'Status', dataIndex: 'Status', render: (v) => <Tag color={statusColor[v] || 'default'}>{v}</Tag> },
  ];

  const tableRef = React.useRef(null);
  const tourSteps = [
    { title: '1. Gift Vouchers', description: 'Every voucher ever issued (from Purchase Hub → Gift Voucher Bill) — code, who holds it, and how much of it is still spendable.', target: () => tableRef.current },
    { title: '2. Outstanding Liability', description: 'The Active total is real money the business owes in unspent vouchers — worth checking periodically.' },
  ];

  return (
    <div className="page-wrapper">
      <div className="page-header">
        <Title level={4} style={{ margin: 0 }}><Space><GiftOutlined style={{ color: '#eb2f96' }} />Gift Vouchers</Space></Title>
        <Input prefix={<SearchOutlined />} placeholder="Search by code, name, or mobile" value={searchText}
          onChange={(e) => setSearchText(e.target.value)} style={{ width: 280 }} allowClear />
      </div>

      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        {[
          { title: 'Active Vouchers', value: activeCount, color: '#52c41a' },
          { title: 'Total Ever Issued', value: totalIssued, formatter: formatCurrency, color: '#B8860B' },
          { title: 'Outstanding Liability', value: totalOutstanding, formatter: formatCurrency, color: '#eb2f96' },
        ].map((s, i) => (
          <Col xs={12} md={8} key={i}>
            <Card bodyStyle={{ padding: '14px 16px' }} style={{ borderRadius: 8, border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.07)', borderTop: `3px solid ${s.color}` }}>
              <Statistic title={<Text style={{ fontSize: 11, color: '#888' }}>{s.title}</Text>}
                value={s.value} formatter={s.formatter ? (v) => s.formatter(v) : undefined}
                valueStyle={{ color: s.color, fontSize: 18, fontWeight: 700 }} />
            </Card>
          </Col>
        ))}
      </Row>

      <div ref={tableRef}>
        <Card style={{ borderRadius: 8, border: 'none' }} bodyStyle={{ padding: 0 }}>
          <Table
            scroll={{ x: 'max-content' }}
            columns={columns}
            dataSource={filtered}
            loading={isLoading}
            rowKey="Voucher_ID"
            size="small"
            pagination={{ pageSize: 20 }}
            locale={{ emptyText: <Empty description="No gift vouchers issued yet." /> }}
          />
        </Card>
      </div>

      <PageTour steps={tourSteps} />
    </div>
  );
}
