import React, { useState, useRef } from 'react';
import { Row, Col, Card, Typography, Input, Button, Table, Tag, DatePicker, message, Empty, Alert, Space, Modal } from 'antd';
import { SearchOutlined, UndoOutlined, PrinterOutlined, CheckCircleFilled } from '@ant-design/icons';
import { useMutation } from '@tanstack/react-query';
import { approvalApi } from '../../api/modules';
import { formatCurrency, formatWeight } from '../../utils/calculations';
import { printNonTagReceiveVoucher } from '../../utils/approvalVoucherPrint';
import ApprovalNavTabs from './ApprovalNavTabs';
import PageTour from '../../components/PageTour';
import dayjs from 'dayjs';

const { Title, Text } = Typography;

export default function NonTagReceivePage() {
  const [voucherNumber, setVoucherNumber] = useState('');
  const [issue, setIssue] = useState(null);
  const [pendingItems, setPendingItems] = useState([]);
  const [selectedRowKeys, setSelectedRowKeys] = useState([]);
  const [receiveDate, setReceiveDate] = useState(dayjs());
  const [remarks, setRemarks] = useState('');

  // ── Walkthrough tour refs ───────────────────────────────────────────────────
  const searchCardRef = useRef(null);
  const tableCardRef = useRef(null);
  const receiveRef = useRef(null);
  const tourSteps = [
    { title: '1. Find the Voucher', description: 'Type in the Non-Tag Approval Issue voucher number here to pull up every non-tagged item still pending against it.', target: () => searchCardRef.current },
    { title: '2. Select What Came Back', description: 'Tick the items the customer is returning or has bought. Anything left unticked stays "Pending" on this voucher.', target: () => tableCardRef.current },
    { title: '3. Confirm the Receive', description: 'Set the receive date and any remarks, then click here — this closes out the selected items and updates the voucher to Partial or Completed automatically.', target: () => receiveRef.current },
  ];

  const searchMutation = useMutation({
    mutationFn: (v) => approvalApi.getNonTagIssueByVoucher(v),
    onSuccess: (res) => {
      setIssue(res.data.data.issue);
      setPendingItems(res.data.data.pendingItems || []);
      setSelectedRowKeys([]);
    },
    onError: (err) => {
      setIssue(null); setPendingItems([]);
      message.error(err.response?.data?.message || 'Voucher not found.');
    },
  });

  const [createdReceive, setCreatedReceive] = useState(null); // { receive, issue, items }

  const receiveMutation = useMutation({
    mutationFn: (data) => approvalApi.createNonTagReceive(data),
    onSuccess: (res) => {
      message.success(`Receive voucher ${res.data.data.Voucher_Number} created — status now ${res.data.data.status}.`);
      setCreatedReceive({ receive: res.data.data, issue, items: selectedItems });
      setVoucherNumber(''); setIssue(null); setPendingItems([]); setSelectedRowKeys([]); setRemarks('');
    },
    onError: (err) => message.error(err.response?.data?.message || 'Failed to process receive.'),
  });

  const selectedItems = pendingItems.filter(i => selectedRowKeys.includes(i.NTA_Issue_Item_ID));
  const selectedTotals = selectedItems.reduce((acc, i) => ({
    weight: acc.weight + parseFloat(i.Gross_Weight || 0),
    value: acc.value + parseFloat(i.Approx_Value || 0),
  }), { weight: 0, value: 0 });

  const submitReceive = () => {
    if (selectedRowKeys.length === 0) { message.warning('Select at least one item to receive.'); return; }
    receiveMutation.mutate({
      NTA_Issue_ID: issue.NTA_Issue_ID, Receive_Date: receiveDate.format('YYYY-MM-DD'),
      Remarks: remarks || null, issueItemIds: selectedRowKeys,
    });
  };

  const columns = [
    { title: 'Item Type', dataIndex: 'Item_Type' },
    { title: 'Design', dataIndex: 'Design_Type' },
    { title: 'Category', dataIndex: 'Category' },
    { title: 'Gross Wt', dataIndex: 'Gross_Weight', render: formatWeight },
    { title: 'Value', dataIndex: 'Approx_Value', render: formatCurrency },
    { title: 'Status', dataIndex: 'Item_Status', render: v => <Tag color="orange">{v}</Tag> },
  ];

  return (
    <div className="page-wrapper">
      <div className="page-header">
        <Title level={4} style={{ margin: 0 }}><UndoOutlined style={{ color: '#B8860B', marginRight: 8 }} />Non-Tagged Approval Receive</Title>
      </div>

      <ApprovalNavTabs />

      <div ref={searchCardRef}>
      <Card size="small" style={{ borderRadius: 8, marginBottom: 14 }}>
        <Space.Compact style={{ width: '100%' }}>
          <Input size="large" placeholder="Enter Non-Tag Approval Issue Voucher Number (e.g. NTA-ISS-TENANT-20260719-0001)"
            value={voucherNumber} onChange={e => setVoucherNumber(e.target.value)}
            onPressEnter={() => voucherNumber.trim() && searchMutation.mutate(voucherNumber.trim())} />
          <Button type="primary" size="large" icon={<SearchOutlined />} loading={searchMutation.isPending}
            style={{ background: '#B8860B', borderColor: '#B8860B' }}
            onClick={() => voucherNumber.trim() && searchMutation.mutate(voucherNumber.trim())}>
            Search
          </Button>
        </Space.Compact>
      </Card>
      </div>

      {issue && (
        <Row gutter={14}>
          <Col xs={24} lg={16}>
            <div ref={tableCardRef}>
            <Card size="small"
              title={<span>Pending Items — {issue.Voucher_Number} <Tag color={issue.Status === 'Partial' ? 'blue' : 'orange'} style={{ marginLeft: 8 }}>{issue.Status}</Tag></span>}
              style={{ borderRadius: 8 }} bodyStyle={{ padding: 0 }}>
              {pendingItems.length === 0
                ? <Empty description="No pending items — everything on this voucher has been received." style={{ padding: '24px 0' }} />
                : <Table scroll={{ x: 'max-content' }} columns={columns} dataSource={pendingItems} rowKey="NTA_Issue_Item_ID" size="small" pagination={false}
                    rowSelection={{ selectedRowKeys, onChange: setSelectedRowKeys }} />}
            </Card>
            </div>
          </Col>
          <Col xs={24} lg={8}>
            <Card size="small" title="Party" style={{ borderRadius: 8, marginBottom: 14 }}>
              <Text strong>{issue.Party_Name || 'Walk-in / Unregistered'}</Text><br />
              {issue.Shop_Name && <Text type="secondary">{issue.Shop_Name}</Text>}<br />
              {issue.Party_Mobile && <Text type="secondary">{issue.Party_Mobile}</Text>}
            </Card>
            <Card size="small" title="Receive Details" style={{ borderRadius: 8, marginBottom: 14 }}>
              <Text style={{ fontSize: 12, color: '#888' }}>Receive Date</Text>
              <DatePicker style={{ width: '100%', marginBottom: 10 }} value={receiveDate} onChange={setReceiveDate} format="DD-MMM-YYYY" />
              <Text style={{ fontSize: 12, color: '#888' }}>Remarks</Text>
              <Input.TextArea rows={2} value={remarks} onChange={e => setRemarks(e.target.value)} />
            </Card>
            <Card size="small" title="Selected for Receive" style={{ borderRadius: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <Text type="secondary">Items</Text><Text strong>{selectedRowKeys.length}</Text>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <Text type="secondary">Weight</Text><Text strong>{formatWeight(selectedTotals.weight)}</Text>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                <Text type="secondary">Value</Text><Text strong style={{ color: '#B8860B' }}>{formatCurrency(selectedTotals.value)}</Text>
              </div>
              {selectedRowKeys.length < pendingItems.length && selectedRowKeys.length > 0 && (
                <Alert type="info" showIcon style={{ marginBottom: 10, fontSize: 11 }}
                  message={`${pendingItems.length - selectedRowKeys.length} item(s) will remain Pending under this voucher.`} />
              )}
              <Button ref={receiveRef} type="primary" block size="large" loading={receiveMutation.isPending} disabled={selectedRowKeys.length === 0}
                style={{ background: '#52c41a', borderColor: '#52c41a' }} onClick={submitReceive}>
                Receive Selected ({selectedRowKeys.length})
              </Button>
            </Card>
          </Col>
        </Row>
      )}

      <Modal
        title={<span><CheckCircleFilled style={{ color: '#52c41a', marginRight: 8 }} />Items Received</span>}
        open={!!createdReceive} closable={false} footer={null}>
        {createdReceive && (
          <>
            <Text style={{ fontSize: 15 }}>Receive voucher <Text code strong>{createdReceive.receive.Voucher_Number}</Text> created successfully.</Text>
            <Space style={{ width: '100%', marginTop: 20 }}>
              <Button icon={<PrinterOutlined />} onClick={() => printNonTagReceiveVoucher(createdReceive.receive, createdReceive.issue, createdReceive.items)}>
                Print Voucher
              </Button>
              <Button type="primary" style={{ background: '#B8860B', borderColor: '#B8860B' }} onClick={() => setCreatedReceive(null)}>
                Done
              </Button>
            </Space>
          </>
        )}
      </Modal>

      <PageTour steps={tourSteps} />
    </div>
  );
}
