/**
 * Branch Orders — a branch REQUESTING stock it needs (pull model), the
 * opposite direction from Interbranch Stock Transfer's push model (source
 * branch initiates). Genuinely absent before. Fulfillment reuses the real
 * Transfer flow (create the transfer on the Interbranch Stock Transfer
 * page as usual, then come back here and link it) rather than
 * duplicating item-picking logic in a second place.
 */
import React, { useState } from 'react';
import { Table, Card, Button, Modal, Form, Input, InputNumber, Select, Space, Tag, Typography, message, Popconfirm } from 'antd';
import { PlusOutlined, CheckOutlined, CloseOutlined, LinkOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { branchOrderRequestApi, tenantApi } from '../../api/modules';
import { useMetalTypes } from '../../hooks/useMetalTypes';
import { useAuthStore } from '../../store/authStore';
import { formatWeight } from '../../utils/calculations';
import dayjs from 'dayjs';

const { Text } = Typography;

const STATUS_COLOR = { Requested: 'blue', Approved: 'orange', Transferred: 'green', Rejected: 'red', Cancelled: 'default' };

export default function BranchOrdersPage() {
  const qc = useQueryClient();
  const { user } = useAuthStore();
  const { metalTypes } = useMetalTypes();
  const [createOpen, setCreateOpen] = useState(false);
  const [approveTarget, setApproveTarget] = useState(null);
  const [linkTarget, setLinkTarget] = useState(null);
  const [statusFilter, setStatusFilter] = useState(undefined);
  const [form] = Form.useForm();
  const [approveForm] = Form.useForm();
  const [linkForm] = Form.useForm();

  const { data: branches } = useQuery({
    queryKey: ['branches-for-order-request'],
    queryFn: () => tenantApi.getBranches(user?.tenantId).then((r) => r.data.data || []),
  });

  const { data: rows, isLoading } = useQuery({
    queryKey: ['branch-order-request', statusFilter],
    queryFn: () => branchOrderRequestApi.list({ status: statusFilter }).then((r) => r.data.data || []),
  });

  const createMutation = useMutation({
    mutationFn: (data) => branchOrderRequestApi.create(data),
    onSuccess: (res) => { message.success(`${res.data.data.Request_Number} created.`); qc.invalidateQueries({ queryKey: ['branch-order-request'] }); setCreateOpen(false); form.resetFields(); },
    onError: (err) => message.error(err.response?.data?.message || 'Failed to create request.'),
  });
  const approveMutation = useMutation({
    mutationFn: ({ id, data }) => branchOrderRequestApi.approve(id, data),
    onSuccess: () => { message.success('Approved.'); qc.invalidateQueries({ queryKey: ['branch-order-request'] }); setApproveTarget(null); approveForm.resetFields(); },
    onError: (err) => message.error(err.response?.data?.message || 'Failed to approve.'),
  });
  const rejectMutation = useMutation({
    mutationFn: (id) => branchOrderRequestApi.reject(id),
    onSuccess: () => { message.success('Rejected.'); qc.invalidateQueries({ queryKey: ['branch-order-request'] }); },
    onError: (err) => message.error(err.response?.data?.message || 'Failed to reject.'),
  });
  const linkMutation = useMutation({
    mutationFn: ({ id, data }) => branchOrderRequestApi.linkTransfer(id, data),
    onSuccess: () => { message.success('Linked to transfer.'); qc.invalidateQueries({ queryKey: ['branch-order-request'] }); setLinkTarget(null); linkForm.resetFields(); },
    onError: (err) => message.error(err.response?.data?.message || 'Failed to link transfer.'),
  });

  const columns = [
    { title: 'Request No.', dataIndex: 'Request_Number', render: (v) => <Text code strong>{v}</Text> },
    { title: 'Requesting Branch', dataIndex: 'Requesting_Branch_Name' },
    { title: 'Source Branch', dataIndex: 'Source_Branch_Name', render: (v) => v || <Text type="secondary">-</Text> },
    { title: 'Metal', dataIndex: 'Metal_Type' },
    { title: 'Weight', dataIndex: 'Requested_Weight', render: (v) => v ? formatWeight(v) : '-' },
    { title: 'Qty', dataIndex: 'Requested_Quantity' },
    { title: 'Status', dataIndex: 'Status', render: (v) => <Tag color={STATUS_COLOR[v]}>{v}</Tag> },
    { title: 'Created', dataIndex: 'Created_Date', render: (v) => dayjs(v).format('DD-MMM-YYYY') },
    {
      title: 'Actions',
      render: (_, r) => (
        <Space size={4}>
          {r.Status === 'Requested' && (
            <>
              <Button size="small" icon={<CheckOutlined />} onClick={() => setApproveTarget(r)}>Approve</Button>
              <Popconfirm title="Reject this request?" onConfirm={() => rejectMutation.mutate(r.Request_ID)}>
                <Button size="small" danger icon={<CloseOutlined />}>Reject</Button>
              </Popconfirm>
            </>
          )}
          {r.Status === 'Approved' && (
            <Button size="small" icon={<LinkOutlined />} onClick={() => setLinkTarget(r)}>Link Transfer</Button>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div className="page-wrapper">
      <div className="page-header">
        <div>
          <div className="page-header-title">Branch Orders</div>
          <div className="page-header-sub">A branch requesting stock it needs — approve, then fulfill via the real Transfer flow</div>
        </div>
        <Button type="primary" icon={<PlusOutlined />} style={{ background: '#B8860B', borderColor: '#B8860B' }} onClick={() => setCreateOpen(true)}>
          New Request
        </Button>
      </div>

      <Card className="erp-card" style={{ marginBottom: 12 }} bodyStyle={{ padding: '12px 16px' }}>
        <Select allowClear placeholder="All statuses" style={{ width: 180 }} value={statusFilter} onChange={setStatusFilter}
          options={['Requested', 'Approved', 'Transferred', 'Rejected', 'Cancelled'].map((s) => ({ value: s, label: s }))} />
      </Card>

      <Card className="erp-card" bodyStyle={{ padding: 0 }}>
        <div className="table-responsive">
          <Table className="erp-table" columns={columns} dataSource={rows || []} loading={isLoading} rowKey="Request_ID"
            pagination={{ pageSize: 20 }} size="small" scroll={{ x: 1000 }} />
        </div>
      </Card>

      <Modal title="New Branch Order Request" open={createOpen} onCancel={() => setCreateOpen(false)} footer={null} destroyOnClose>
        <Form form={form} layout="vertical" onFinish={(v) => createMutation.mutate(v)}>
          <Form.Item name="Requesting_Branch_ID" label="Requesting Branch" rules={[{ required: true }]}>
            <Select showSearch placeholder="Which branch needs this?"
              filterOption={(input, o) => (o?.label ?? '').toLowerCase().includes(input.toLowerCase())}
              options={(branches || []).map((b) => ({ value: b.Branch_ID, label: b.Branch_Name }))} />
          </Form.Item>
          <Form.Item name="Metal_Type" label="Metal Type" rules={[{ required: true }]}>
            <Select options={metalTypes.map((m) => ({ value: m, label: m }))} />
          </Form.Item>
          <Space style={{ display: 'flex', gap: 8 }}>
            <Form.Item name="Requested_Weight" label="Requested Weight (g)" style={{ flex: 1 }}>
              <InputNumber style={{ width: '100%' }} min={0} step={0.01} />
            </Form.Item>
            <Form.Item name="Requested_Quantity" label="Quantity" initialValue={1} style={{ flex: 1 }}>
              <InputNumber style={{ width: '100%' }} min={1} />
            </Form.Item>
          </Space>
          <Form.Item name="Notes" label="Notes">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Button type="primary" htmlType="submit" block loading={createMutation.isPending} style={{ background: '#B8860B', borderColor: '#B8860B' }}>
            Create Request
          </Button>
        </Form>
      </Modal>

      <Modal title={`Approve ${approveTarget?.Request_Number || ''}`} open={!!approveTarget} onCancel={() => setApproveTarget(null)} footer={null} destroyOnClose>
        <Form form={approveForm} layout="vertical" onFinish={(v) => approveMutation.mutate({ id: approveTarget.Request_ID, data: v })}>
          <Form.Item name="Source_Branch_ID" label="Which branch will supply this?" rules={[{ required: true }]}>
            <Select showSearch options={(branches || []).filter((b) => b.Branch_ID !== approveTarget?.Requesting_Branch_ID).map((b) => ({ value: b.Branch_ID, label: b.Branch_Name }))} />
          </Form.Item>
          <Button type="primary" htmlType="submit" block loading={approveMutation.isPending} style={{ background: '#B8860B', borderColor: '#B8860B' }}>
            Approve
          </Button>
        </Form>
      </Modal>

      <Modal title={`Link Transfer to ${linkTarget?.Request_Number || ''}`} open={!!linkTarget} onCancel={() => setLinkTarget(null)} footer={null} destroyOnClose>
        <Form form={linkForm} layout="vertical" onFinish={(v) => linkMutation.mutate({ id: linkTarget.Request_ID, data: v })}>
          <p style={{ color: '#888', fontSize: 12 }}>Create the actual transfer on the Interbranch Stock Transfer page first, then enter its Transfer ID here.</p>
          <Form.Item name="Transfer_ID" label="Transfer ID" rules={[{ required: true }]}>
            <InputNumber style={{ width: '100%' }} min={1} />
          </Form.Item>
          <Button type="primary" htmlType="submit" block loading={linkMutation.isPending} style={{ background: '#B8860B', borderColor: '#B8860B' }}>
            Link
          </Button>
        </Form>
      </Modal>
    </div>
  );
}
