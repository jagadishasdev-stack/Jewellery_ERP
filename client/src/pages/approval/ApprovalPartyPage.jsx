import React, { useState, useRef } from 'react';
import { Table, Button, Card, Typography, Tag, Modal, Form, Input, message, Space } from 'antd';
import { PlusOutlined, EditOutlined, EyeOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { approvalApi } from '../../api/modules';
import { formatCurrency, formatWeight } from '../../utils/calculations';
import ApprovalNavTabs from './ApprovalNavTabs';
import PageTour from '../../components/PageTour';
import dayjs from 'dayjs';

const { Title, Text } = Typography;

export default function ApprovalPartyPage() {
  const qc = useQueryClient();
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [detailId, setDetailId] = useState(null);
  const [form] = Form.useForm();

  // ── Walkthrough tour refs ───────────────────────────────────────────────────
  const newPartyRef = useRef(null);
  const tableRef = useRef(null);
  const tourSteps = [
    { title: '1. What are Parties?', description: 'Parties are the customers or dealers you send items out "on approval" to. Every approval voucher — tagged or non-tagged — must be linked to a party here.', target: () => tableRef.current },
    { title: '2. Add a New Party', description: 'Click here to register a new customer or dealer — name, shop, mobile and GST number — before issuing anything to them.', target: () => newPartyRef.current },
    { title: '3. View History', description: 'Click History on any party\'s row to see every approval voucher ever issued to them, tagged and non-tagged, along with its current status.' },
  ];

  const { data: parties, isLoading } = useQuery({
    queryKey: ['approval-parties-all'],
    queryFn: () => approvalApi.getParties({}).then(r => r.data.data || []),
  });

  const { data: detail } = useQuery({
    queryKey: ['approval-party-detail', detailId],
    queryFn: () => approvalApi.getPartyById(detailId).then(r => r.data.data),
    enabled: !!detailId,
  });

  const saveMutation = useMutation({
    mutationFn: (data) => approvalApi.createParty(data),
    onSuccess: () => {
      message.success('Party saved.');
      qc.invalidateQueries(['approval-parties-all']);
      setModal(false); form.resetFields(); setEditing(null);
    },
    onError: (err) => message.error(err.response?.data?.message || 'Failed to save party.'),
  });

  const openNew = () => { setEditing(null); form.resetFields(); setModal(true); };

  const columns = [
    { title: 'Party Name', dataIndex: 'Party_Name', render: v => <Text strong>{v}</Text> },
    { title: 'Shop Name', dataIndex: 'Shop_Name' },
    { title: 'Contact', dataIndex: 'Contact_Person' },
    { title: 'Mobile', dataIndex: 'Mobile' },
    { title: 'GST No', dataIndex: 'GST_Number' },
    { title: 'City', dataIndex: 'City' },
    { title: '', render: (_, r) => <Button size="small" icon={<EyeOutlined />} onClick={() => setDetailId(r.Party_ID)}>History</Button> },
  ];

  const issueColumns = [
    { title: 'Voucher No', dataIndex: 'Voucher_Number', render: v => <Text code style={{ fontSize: 11 }}>{v}</Text> },
    { title: 'Issue Date', dataIndex: 'Issue_Date', render: v => dayjs(v).format('DD-MMM-YYYY') },
    { title: 'Items', dataIndex: 'Total_Items_Issued' },
    { title: 'Weight', dataIndex: 'Total_Weight_Issued', render: formatWeight },
    { title: 'Value', dataIndex: 'Total_Value_Issued', render: formatCurrency },
    { title: 'Status', dataIndex: 'Status', render: v => <Tag color={v === 'Completed' ? 'green' : v === 'Cancelled' ? 'red' : v === 'Partial' ? 'blue' : 'orange'}>{v}</Tag> },
  ];

  return (
    <div className="page-wrapper">
      <div className="page-header">
        <Title level={4} style={{ margin: 0 }}>Approval Party Master</Title>
        <Button ref={newPartyRef} type="primary" icon={<PlusOutlined />} style={{ background: '#B8860B', borderColor: '#B8860B' }} onClick={openNew}>
          New Party
        </Button>
      </div>

      <ApprovalNavTabs />

      <div ref={tableRef}>
      <Card style={{ borderRadius: 8, border: 'none' }} bodyStyle={{ padding: 0 }}>
        <Table scroll={{ x: 'max-content' }} columns={columns} dataSource={parties || []} loading={isLoading} rowKey="Party_ID" size="small" pagination={{ pageSize: 20 }} />
      </Card>
      </div>

      <Modal title="Add New Party" open={modal} onCancel={() => { setModal(false); form.resetFields(); }} footer={null} destroyOnClose>
        <Form form={form} layout="vertical" onFinish={v => saveMutation.mutate(v)}>
          <Form.Item name="Party_Name" label="Party Name" rules={[{ required: true }]}><Input /></Form.Item>
          <Space.Compact style={{ width: '100%' }}>
            <Form.Item name="Shop_Name" label="Shop Name" style={{ width: '50%', marginRight: 8 }}><Input /></Form.Item>
            <Form.Item name="Contact_Person" label="Contact Person" style={{ width: '50%' }}><Input /></Form.Item>
          </Space.Compact>
          <Space.Compact style={{ width: '100%' }}>
            <Form.Item name="Mobile" label="Mobile" style={{ width: '50%', marginRight: 8 }}><Input /></Form.Item>
            <Form.Item name="GST_Number" label="GST Number" style={{ width: '50%' }}><Input /></Form.Item>
          </Space.Compact>
          <Form.Item name="Address" label="Address"><Input.TextArea rows={2} /></Form.Item>
          <Form.Item name="City" label="City"><Input /></Form.Item>
          <Form.Item name="Remarks" label="Remarks"><Input /></Form.Item>
          <Button type="primary" htmlType="submit" block loading={saveMutation.isPending} style={{ background: '#B8860B', borderColor: '#B8860B' }}>
            Save Party
          </Button>
        </Form>
      </Modal>

      <Modal title={detail?.party?.Party_Name} open={!!detailId} onCancel={() => setDetailId(null)} footer={null} width={800}>
        {detail && (
          <>
            <Title level={5}>Tagged Approval Issues</Title>
            <Table scroll={{ x: 'max-content' }} columns={issueColumns} dataSource={detail.issues} rowKey="Issue_ID" size="small" pagination={{ pageSize: 5 }} />
            <Title level={5} style={{ marginTop: 20 }}>Non-Tagged Approval Issues</Title>
            <Table scroll={{ x: 'max-content' }} columns={issueColumns} dataSource={detail.ntaIssues} rowKey="NTA_Issue_ID" size="small" pagination={{ pageSize: 5 }} />
          </>
        )}
      </Modal>

      <PageTour steps={tourSteps} />
    </div>
  );
}
