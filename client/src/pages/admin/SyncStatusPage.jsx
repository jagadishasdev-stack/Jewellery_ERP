/**
 * Sync Status — the backend (server/src/routes/sync.js) has always been
 * real and tested (idempotent upload/download, a real sync log), but had
 * zero UI — no way to see whether anything had actually synced, or what
 * failed. This is that visibility. There's still no device-side client
 * built yet (see the route file's own doc comment) — this reads whatever
 * the log already has, it doesn't simulate activity that hasn't happened.
 */
import React from 'react';
import { Card, Row, Col, Statistic, Table, Typography, Tag, Alert } from 'antd';
import { CloudSyncOutlined, CheckCircleOutlined, CloseCircleOutlined, ClockCircleOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { syncApi } from '../../api/modules';
import dayjs from 'dayjs';

const { Text } = Typography;

export default function SyncStatusPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['sync-status'],
    queryFn: () => syncApi.getStatus().then((r) => r.data.data),
    refetchInterval: 30000,
  });

  const syncLog = data?.syncLog || {};
  const queue = data?.queue || {};
  const totalSynced = (syncLog.SUCCESS || 0) + (syncLog.ALREADY_SYNCED || 0);
  const totalFailed = syncLog.FAILED || 0;
  const queuePending = queue.PENDING || 0;

  return (
    <div className="page-wrapper">
      <div className="page-header">
        <div>
          <div className="page-header-title">Sync Status</div>
          <div className="page-header-sub">What's come in from local devices, and what failed</div>
        </div>
      </div>

      <Alert
        type="info" showIcon style={{ marginBottom: 16 }}
        message="No local device is uploading yet"
        description="This dashboard reflects whatever the sync log actually has — the cloud side of sync is real and tested, but no local device/desktop client pushes to it yet. It will fill in the moment one does, with no changes needed here."
      />

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={8}>
          <Card className="erp-card">
            <Statistic title="Records Synced" value={totalSynced} prefix={<CheckCircleOutlined style={{ color: '#52c41a' }} />} />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card className="erp-card">
            <Statistic title="Failed" value={totalFailed} valueStyle={{ color: totalFailed > 0 ? '#ff4d4f' : undefined }} prefix={<CloseCircleOutlined style={{ color: '#ff4d4f' }} />} />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card className="erp-card">
            <Statistic title="Queue Pending" value={queuePending} prefix={<ClockCircleOutlined style={{ color: '#faad14' }} />} />
          </Card>
        </Col>
      </Row>

      <Card className="erp-card" title={<span><CloudSyncOutlined style={{ color: '#B8860B' }} /> Recent Failures</span>}>
        <Table
          size="small"
          loading={isLoading}
          dataSource={data?.recentFailures || []}
          rowKey="Log_ID"
          locale={{ emptyText: 'No sync failures logged.' }}
          pagination={{ pageSize: 20 }}
          columns={[
            { title: 'Table', dataIndex: 'Table_Name' },
            { title: 'Device', dataIndex: 'Device_ID' },
            { title: 'Direction', dataIndex: 'Direction', render: (v) => <Tag>{v}</Tag> },
            { title: 'Error', dataIndex: 'Error_Message', render: (v) => <Text type="danger" style={{ fontSize: 12 }}>{v}</Text> },
            { title: 'When', dataIndex: 'Synced_Date', render: (v) => dayjs(v).format('DD-MMM-YYYY HH:mm') },
          ]}
        />
      </Card>
    </div>
  );
}
