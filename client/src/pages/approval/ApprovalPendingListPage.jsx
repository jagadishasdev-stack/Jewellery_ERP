import React, { useState, useRef } from 'react';
import { Row, Col, Card, Typography, Table, Tag, Space, Select, Button, Modal, message } from 'antd';
import { ClockCircleOutlined, PlusOutlined, UndoOutlined, StopOutlined, PrinterOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { approvalApi } from '../../api/modules';
import { formatCurrency, formatWeight } from '../../utils/calculations';
import { printTaggedIssueVoucher, printNonTagIssueVoucher } from '../../utils/approvalVoucherPrint';
import ApprovalNavTabs from './ApprovalNavTabs';
import PageTour from '../../components/PageTour';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { Option } = Select;

export default function ApprovalPendingListPage() {
  const qc = useQueryClient();
  const [mode, setMode] = useState('tagged'); // tagged | non-tag
  const [detail, setDetail] = useState(null);

  // ── Walkthrough tour refs ───────────────────────────────────────────────────
  const navTabsRef = useRef(null);
  const linksRef = useRef(null);
  const modeRef = useRef(null);
  const tableRef = useRef(null);
  const tourSteps = [
    { title: '1. What is "Approval Out"?', description: 'Items sent out here have left the shop "on approval" — the customer takes them home to decide. Each item stays tracked against a voucher until the customer either buys it (converted to a regular sale) or you receive it back into stock.', target: () => navTabsRef.current },
    { title: '2. Issue or Receive', description: 'Click "Issue on Approval" to send new items out to a customer or party, or "Receive Against Voucher" to record items coming back or being bought.', target: () => linksRef.current },
    { title: '3. Tagged vs Non-Tagged', description: 'Switch here between items that already have a shop barcode tag (Tagged Items) and loose or generic items issued without one (Non-Tagged Items).', target: () => modeRef.current },
    { title: '4. Pending Vouchers', description: 'Every voucher still open shows here with its party, weight and value. "Pending" means nothing has come back yet; "Partial" means some items were already returned. Click a voucher number to see its full item list.', target: () => tableRef.current },
    { title: '5. Cancel a Voucher', description: 'If a voucher was created by mistake and nothing has been received against it yet, use the Cancel button on that row — the items are restored straight back to your stock.' },
  ];

  const cancelMutation = useMutation({
    mutationFn: ({ id, type }) => (type === 'tagged' ? approvalApi.cancelIssue(id, {}) : approvalApi.cancelNonTagIssue(id, {})),
    onSuccess: () => {
      message.success('Voucher cancelled — items restored to stock.');
      qc.invalidateQueries(['approval-issues-open']); qc.invalidateQueries(['nta-issues-open']);
    },
    onError: (err) => message.error(err.response?.data?.message || 'Failed to cancel voucher.'),
  });

  const { data: taggedData, isLoading: taggedLoading } = useQuery({
    queryKey: ['approval-issues-open'],
    queryFn: () => approvalApi.getIssues({ limit: 200 }).then(r => r.data.data),
    enabled: mode === 'tagged',
  });
  const { data: ntaData, isLoading: ntaLoading } = useQuery({
    queryKey: ['nta-issues-open'],
    queryFn: () => approvalApi.getNonTagIssues({ limit: 200 }).then(r => r.data.data),
    enabled: mode === 'non-tag',
  });

  const { data: taggedDetail } = useQuery({
    queryKey: ['approval-issue-detail', detail?.id],
    queryFn: () => approvalApi.getIssueById(detail.id).then(r => r.data.data),
    enabled: !!detail && detail.type === 'tagged',
  });
  const { data: ntaDetail } = useQuery({
    queryKey: ['nta-issue-detail', detail?.id],
    queryFn: () => approvalApi.getNonTagIssueById(detail.id).then(r => r.data.data),
    enabled: !!detail && detail.type === 'non-tag',
  });

  const openVouchers = (mode === 'tagged' ? (taggedData?.items || []) : (ntaData?.items || []))
    .filter(v => v.Status === 'Pending' || v.Status === 'Partial');

  const columns = [
    { title: 'Voucher No', dataIndex: 'Voucher_Number', render: (v, r) => (
      <a onClick={() => setDetail({ id: mode === 'tagged' ? r.Issue_ID : r.NTA_Issue_ID, type: mode })} style={{ fontSize: 12, fontFamily: 'monospace' }}>{v}</a>
    )},
    { title: 'Party', render: (_, r) => r.Party_Name || <Text type="secondary">—</Text> },
    { title: 'Issue Date', dataIndex: 'Issue_Date', render: v => dayjs(v).format('DD-MMM-YYYY') },
    { title: 'Items', dataIndex: 'Total_Items_Issued' },
    { title: 'Weight', dataIndex: 'Total_Weight_Issued', render: formatWeight },
    { title: 'Value', dataIndex: 'Total_Value_Issued', render: formatCurrency },
    { title: 'Status', dataIndex: 'Status', render: v => <Tag color={v === 'Partial' ? 'blue' : 'orange'}>{v}</Tag> },
    { title: '', render: (_, r) => r.Status === 'Pending' && (
      <Button size="small" danger icon={<StopOutlined />}
        loading={cancelMutation.isPending}
        onClick={() => cancelMutation.mutate({ id: mode === 'tagged' ? r.Issue_ID : r.NTA_Issue_ID, type: mode })}>
        Cancel
      </Button>
    )},
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
        <Title level={4} style={{ margin: 0 }}><ClockCircleOutlined style={{ color: '#fa8c16', marginRight: 8 }} />Approval Pending</Title>
        <div ref={linksRef}>
        <Space>
          <Link to="/approval/issue"><Button icon={<PlusOutlined />} style={{ background: '#B8860B', borderColor: '#B8860B', color: '#fff' }}>Issue on Approval</Button></Link>
          <Link to="/approval/receive"><Button icon={<UndoOutlined />}>Receive Against Voucher</Button></Link>
        </Space>
        </div>
      </div>

      <div ref={navTabsRef}><ApprovalNavTabs /></div>

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
        <Table scroll={{ x: 'max-content' }} columns={columns} dataSource={openVouchers}
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
              <Col xs={12}><Text type="secondary">Status</Text><br /><Tag color={itemDetail.issue.Status === 'Partial' ? 'blue' : 'orange'}>{itemDetail.issue.Status}</Tag></Col>
            </Row>
            <Table scroll={{ x: 'max-content' }} columns={itemColumns} dataSource={itemDetail.items} rowKey={r => r.Issue_Item_ID || r.NTA_Issue_Item_ID} size="small" pagination={false} />
          </>
        )}
      </Modal>

      <PageTour steps={tourSteps} />
    </div>
  );
}
