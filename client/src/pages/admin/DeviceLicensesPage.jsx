/**
 * Image App per-device licensing — Super Admin only.
 * Only relevant for tenants set to License_Mode='PER_DEVICE' (toggled per
 * tenant in TenantManagePage). A device files a request through the app
 * (POST /api/mobile/request-device-access, public, before it has any key)
 * with its captured Device ID; this page is where you review it, approve it
 * (mints a key that only activates on that exact device), or revoke access
 * later if the device is lost/decommissioned.
 */
import React, { useState } from 'react';
import {
  Card, Table, Tag, Button, Space, Typography, Select, Modal, Popconfirm, message, Empty, Tooltip,
} from 'antd';
import { CheckCircleOutlined, StopOutlined, CloseCircleOutlined, CopyOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { deviceLicenseApi } from '../../api/modules';
import PageTour from '../../components/PageTour';

const { Title, Paragraph, Text } = Typography;

const STATUS_COLORS = { PENDING: 'gold', APPROVED: 'green', REVOKED: 'red', REJECTED: 'default' };

export default function DeviceLicensesPage() {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState('PENDING');
  const [issuedKeyModal, setIssuedKeyModal] = useState(null); // { Device_ID, License_Key, Company_Name } | null

  const params = statusFilter === 'ALL' ? {} : { status: statusFilter };
  const { data, isLoading } = useQuery({
    queryKey: ['device-licenses', statusFilter],
    queryFn: () => deviceLicenseApi.list(params).then((r) => r.data.data),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['device-licenses'] });

  const approveMutation = useMutation({
    mutationFn: (id) => deviceLicenseApi.approve(id),
    onSuccess: (res) => {
      const row = res.data.data;
      setIssuedKeyModal(row);
      message.success('Device approved.');
      invalidate();
    },
    onError: (err) => message.error(err.response?.data?.message || 'Failed to approve.'),
  });

  const revokeMutation = useMutation({
    mutationFn: (id) => deviceLicenseApi.revoke(id),
    onSuccess: () => { message.success('Access revoked.'); invalidate(); },
    onError: (err) => message.error(err.response?.data?.message || 'Failed to revoke.'),
  });

  const rejectMutation = useMutation({
    mutationFn: (id) => deviceLicenseApi.reject(id),
    onSuccess: () => { message.success('Request rejected.'); invalidate(); },
    onError: (err) => message.error(err.response?.data?.message || 'Failed to reject.'),
  });

  const copyKey = (key) => {
    navigator.clipboard?.writeText(key);
    message.success('Key copied — share it with the store over your usual channel.');
  };

  const columns = [
    { title: 'Tenant', dataIndex: 'Company_Name', key: 'tenant', render: (v, r) => <span>{v} <Text type="secondary">({r.Tenant_ID})</Text></span> },
    { title: 'Device ID', dataIndex: 'Device_ID', key: 'device', render: (v) => <Text code copyable={{ text: v }}>{v.length > 24 ? `${v.slice(0, 24)}…` : v}</Text> },
    { title: 'Device Model', dataIndex: 'Device_Model', key: 'model', render: (v) => v || <Text type="secondary">—</Text> },
    { title: 'Note', dataIndex: 'Contact_Note', key: 'note', render: (v) => v || <Text type="secondary">—</Text>, ellipsis: true },
    { title: 'Status', dataIndex: 'Status', key: 'status', render: (v) => <Tag color={STATUS_COLORS[v]}>{v}</Tag> },
    {
      title: 'License Key', dataIndex: 'License_Key', key: 'key',
      render: (v) => v ? (
        <Space size={4}>
          <Text code>{v}</Text>
          <Tooltip title="Copy"><Button size="small" type="text" icon={<CopyOutlined />} onClick={() => copyKey(v)} /></Tooltip>
        </Space>
      ) : <Text type="secondary">—</Text>,
    },
    { title: 'Requested', dataIndex: 'Requested_Date', key: 'req_date', render: (v) => new Date(v).toLocaleString() },
    {
      title: 'Actions', key: 'actions',
      render: (_, r) => (
        <Space>
          {r.Status === 'PENDING' && (
            <>
              <Popconfirm title="Approve this device?" description="This mints a license key that will only work on this exact device." onConfirm={() => approveMutation.mutate(r.Device_License_ID)}>
                <Button size="small" type="primary" icon={<CheckCircleOutlined />} loading={approveMutation.isPending}>Approve</Button>
              </Popconfirm>
              <Popconfirm title="Reject this request?" onConfirm={() => rejectMutation.mutate(r.Device_License_ID)}>
                <Button size="small" danger icon={<CloseCircleOutlined />}>Reject</Button>
              </Popconfirm>
            </>
          )}
          {r.Status === 'APPROVED' && (
            <Popconfirm title="Revoke this device's access?" description="It will be locked out the next time it refreshes its token (within a week)." onConfirm={() => revokeMutation.mutate(r.Device_License_ID)}>
              <Button size="small" danger icon={<StopOutlined />} loading={revokeMutation.isPending}>Revoke</Button>
            </Popconfirm>
          )}
          {(r.Status === 'REVOKED' || r.Status === 'REJECTED') && <Text type="secondary">—</Text>}
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <PageTour
        steps={[
          { title: 'Image App Device Licensing', description: 'For tenants set to "Per Device" licensing (toggle in Manage Tenants), each physical device must be individually approved here before the Image App will activate on it.' },
        ]}
      />
      <Title level={3}>Image App Device Licenses</Title>
      <Paragraph type="secondary">
        Only applies to tenants set to <Text code>PER_DEVICE</Text> licensing mode. A device sends a request through
        the Image App with its captured Device ID before it has any license key — approve it here to mint a key
        that only activates on that exact device, or revoke a device that's lost or decommissioned.
      </Paragraph>

      <Card
        extra={
          <Select value={statusFilter} onChange={setStatusFilter} style={{ width: 160 }}>
            <Select.Option value="PENDING">Pending</Select.Option>
            <Select.Option value="APPROVED">Approved</Select.Option>
            <Select.Option value="REVOKED">Revoked</Select.Option>
            <Select.Option value="REJECTED">Rejected</Select.Option>
            <Select.Option value="ALL">All</Select.Option>
          </Select>
        }
      >
        <Table
          rowKey="Device_License_ID"
          loading={isLoading}
          dataSource={data || []}
          columns={columns}
          pagination={{ pageSize: 20 }}
          locale={{ emptyText: <Empty description="No requests" /> }}
        />
      </Card>

      <Modal
        open={!!issuedKeyModal}
        onCancel={() => setIssuedKeyModal(null)}
        onOk={() => setIssuedKeyModal(null)}
        title="Device Approved"
        okText="Done"
      >
        {issuedKeyModal && (
          <>
            <Paragraph>
              Share this license key with <Text strong>{issuedKeyModal.Company_Name}</Text> for the device
              ending in <Text code>{issuedKeyModal.Device_ID?.slice(-8)}</Text>. It will only work on that device.
            </Paragraph>
            <Space.Compact style={{ width: '100%' }}>
              <input readOnly value={issuedKeyModal.License_Key} style={{ flex: 1, fontFamily: 'monospace', padding: '4px 11px', border: '1px solid #d9d9d9', borderRadius: '6px 0 0 6px' }} />
              <Button icon={<CopyOutlined />} onClick={() => copyKey(issuedKeyModal.License_Key)}>Copy</Button>
            </Space.Compact>
          </>
        )}
      </Modal>
    </div>
  );
}
