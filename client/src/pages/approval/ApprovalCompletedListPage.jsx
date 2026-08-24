import React, { useState, useRef } from 'react';
import { Row, Col, Card, Typography, Table, Tag, Space, Select, Modal, Button } from 'antd';
import { CheckCircleOutlined, PrinterOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { approvalApi } from '../../api/modules';
import { formatCurrency, formatWeight } from '../../utils/calculations';
import { printTaggedIssueVoucher, printNonTagIssueVoucher } from '../../utils/approvalVoucherPrint';
import ApprovalNavTabs from './ApprovalNavTabs';
import PageTour from '../../components/PageTour';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { Option } = Select;

export default function ApprovalCompletedListPage() {
  const [mode, setMode] = useState('tagged');
  const [detail, setDetail] = useState(null);

  // ── Walkthrough tour refs ───────────────────────────────────────────────────
  const modeRef = useRef(null);
  const tableRef = useRef(null);
  const tourSteps = [
    { title: '1. Approval History', description: 'This is where vouchers end up once they\'re done — either "Completed" (all items were bought or returned) or "Cancelled". Nothing here is still out with a customer.', target: () => tableRef.current },
    { title: '2. Tagged vs Non-Tagged', description: 'Switch between items that had a shop barcode tag (Tagged) and loose/generic items issued without one (Non-Tagged) to see their separate history.', target: () => modeRef.current },
    { title: '3. Voucher Detail', description: 'Click any voucher number to see the exact items on it, and use Print Voucher in that popup to reprint it if needed.' },
  ];

  const { data: taggedData, isLoading: taggedLoading } = useQuery({
    queryKey: ['approval-issues-closed'],
    queryFn: () => approvalApi.getIssues({ limit: 200 }).then(r => r.data.data),
    enabled: mode === 'tagged',
  });
  const { data: ntaData, isLoading: ntaLoading } = useQuery({
    queryKey: ['nta-issues-closed'],
    queryFn: () => approvalApi.getNonTagIssues({ limit: 200 }).then(r => r.data.data),
    enabled: mode === 'non-tag',
  });

  const { data: taggedDetail } = useQuery({
    queryKey: ['approval-issue-detail-c', detail?.id],
    queryFn: () => approvalApi.getIssueById(detail.id).then(r => r.data.data),
    enabled: !!detail && detail.type === 'tagged',
  });
  const { data: ntaDetail } = useQuery({
    queryKey: ['nta-issue-detail-c', detail?.id],
    queryFn: () => approvalApi.getNonTagIssueById(detail.id).then(r => r.data.data),
    enabled: !!detail && detail.type === 'non-tag',
  });

  const closedVouchers = (mode === 'tagged' ? (taggedData?.items || []) : (ntaData?.items || []))
    .filter(v => v.Status === 'Completed' || v.Status === 'Cancelled');

  const columns = [
    { title: 'Voucher No', dataIndex: 'Voucher_Number', render: (v, r) => (
      <a onClick={() => setDetail({ id: mode === 'tagged' ? r.Issue_ID : r.NTA_Issue_ID, type: mode })} style={{ fontSize: 12, fontFamily: 'monospace' }}>{v}</a>
    )},
    { title: 'Party', render: (_, r) => r.Party_Name || <Text type="secondary">—</Text> },
    { title: 'Issue Date', dataIndex: 'Issue_Date', render: v => dayjs(v).format('DD-MMM-YYYY') },
    { title: 'Items', dataIndex: 'Total_Items_Issued' },
    { title: 'Weight', dataIndex: 'Total_Weight_Issued', render: formatWeight },
    { title: 'Value', dataIndex: 'Total_Value_Issued', render: formatCurrency },
    { title: 'Status', dataIndex: 'Status', render: v => <Tag color={v === 'Completed' ? 'green' : 'red'}>{v}</Tag> },
  ];

  const itemDetail = detail?.type === 'tagged' ? taggedDetail : ntaDetail;
  const itemColumns = detail?.type === 'tagged'
    ? [
        { title: 'Article No', dataIndex: 'Article_Number' },
        { title: 'Purity', dataIndex: 'Purity_Code' },
        { title: 'Gross Wt', dataIndex: 'Gross_Weight', render: formatWeight },
        { title: 'Value', dataIndex: 'Approx_Value', render: formatCurrency },
        { title: 'Status', dataIndex: 'Item_Status', render: v => <Tag color={v === 'Received' ? 'green' : v === 'Cancelled' ? 'red' : 'orange'}>{v}</Tag> },
      ]
    : [
        { title: 'Item Type', dataIndex: 'Item_Type' },
        { title: 'Design', dataIndex: 'Design_Type' },
        { title: 'Gross Wt', dataIndex: 'Gross_Weight', render: formatWeight },
        { title: 'Value', dataIndex: 'Approx_Value', render: formatCurrency },
        { title: 'Status', dataIndex: 'Item_Status', render: v => <Tag color={v === 'Received' ? 'green' : v === 'Cancelled' ? 'red' : 'orange'}>{v}</Tag> },
      ];

  return (
    <div className="page-wrapper">
      <div className="page-header">
        <Title level={4} style={{ margin: 0 }}><CheckCircleOutlined style={{ color: '#52c41a', marginRight: 8 }} />Approval Completed / History</Title>
      </div>

      <ApprovalNavTabs />

      <div ref={modeRef}>
      <Space style={{ marginBottom: 12 }}>
        <Select value={mode} onChange={setMode} style={{ width: 180 }}>
          <Option value="tagged">Tagged Items</Option>
          <Option value="non-tag">Non-Tagged Items</Option>
        </Select>
      </Space>
      </div>

      <div ref={tableRef}>
      <Card style={{ borderRadius: 8, border: 'none' }} bodyStyle={{ padding: 0 }}>
        <Table scroll={{ x: 'max-content' }} columns={columns} dataSource={closedVouchers}
          loading={mode === 'tagged' ? taggedLoading : ntaLoading}
          rowKey={mode === 'tagged' ? 'Issue_ID' : 'NTA_Issue_ID'} size="small" pagination={{ pageSize: 20 }} />
      </Card>
      </div>

      <Modal title={itemDetail?.issue?.Voucher_Number} open={!!detail} onCancel={() => setDetail(null)} width={700}
        footer={itemDetail && (
          <Button icon={<PrinterOutlined />} onClick={() => (detail.type === 'tagged'
            ? printTaggedIssueVoucher(itemDetail.issue, itemDetail.items)
            : printNonTagIssueVoucher(itemDetail.issue, itemDetail.items))}>
            Print Voucher
          </Button>
        )}>
        {itemDetail && (
          <>
            <Row gutter={16} style={{ marginBottom: 14 }}>
              <Col xs={12}><Text type="secondary">Party</Text><br /><Text strong>{itemDetail.issue.Party_Name || '—'}</Text></Col>
              <Col xs={12}><Text type="secondary">Status</Text><br /><Tag color={itemDetail.issue.Status === 'Completed' ? 'green' : 'red'}>{itemDetail.issue.Status}</Tag></Col>
            </Row>
            <Table scroll={{ x: 'max-content' }} columns={itemColumns} dataSource={itemDetail.items} rowKey={r => r.Issue_Item_ID || r.NTA_Issue_Item_ID} size="small" pagination={false} />
          </>
        )}
      </Modal>

      <PageTour steps={tourSteps} />
    </div>
  );
}
