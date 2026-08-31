/**
 * Data Migration Center — dashboard (design doc §49). Super-Admin-only,
 * lists every migration across every tenant with per-status counts and a
 * "New Migration" entry point into the wizard.
 */
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Typography, Card, Table, Button, Tag, Row, Col, Statistic, Space } from 'antd';
import { PlusOutlined, SwapOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { migrationApi } from '../../../api/modules';
import dayjs from 'dayjs';

const { Title, Text } = Typography;

const STATUS_COLOR = {
  DRAFT: 'default', UPLOADED: 'blue', ANALYZING: 'blue', MAPPING: 'gold', VALIDATING: 'gold',
  READY: 'cyan', APPROVED: 'purple', RUNNING: 'processing', COMPLETED: 'green', FAILED: 'red',
};

export default function MigrationDashboard() {
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({
    queryKey: ['migrations-dashboard'],
    queryFn: () => migrationApi.getAll().then((r) => r.data.data),
    refetchInterval: 5000, // cheap and keeps any RUNNING migration's row fresh without a socket
  });

  const counts = data?.counts || {};
  const summaryTiles = [
    { key: 'Total', value: (data?.migrations || []).length, color: '#B8860B' },
    { key: 'RUNNING', value: counts.RUNNING || 0, color: '#1890ff' },
    { key: 'COMPLETED', value: counts.COMPLETED || 0, color: '#52c41a' },
    { key: 'FAILED', value: counts.FAILED || 0, color: '#ff4d4f' },
  ];

  const columns = [
    { title: 'Migration ID', dataIndex: 'Migration_ID', render: (v) => <Text code style={{ fontSize: 11 }}>{v}</Text> },
    { title: 'Tenant', dataIndex: 'Tenant_Name', render: (v, r) => v || r.Tenant_ID },
    { title: 'Type', dataIndex: 'Migration_Type' },
    { title: 'Created', dataIndex: 'Created_Date', render: (v) => dayjs(v).format('DD-MMM-YYYY HH:mm') },
    { title: 'Records', dataIndex: 'Total_Records', render: (v, r) => `${r.Success_Records || 0} / ${v || 0}` },
    { title: 'Status', dataIndex: 'Status', render: (v) => <Tag color={STATUS_COLOR[v]}>{v}</Tag> },
    { title: '', render: (_, r) => <Button size="small" onClick={() => navigate(`/admin/data-migration/${r.Migration_ID}`)}>Open</Button> },
  ];

  return (
    <div className="page-wrapper">
      <div className="page-header">
        <Title level={4} style={{ margin: 0 }}><SwapOutlined style={{ color: '#B8860B', marginRight: 8 }} />Data Migration Center</Title>
        <Button type="primary" icon={<PlusOutlined />} style={{ background: '#B8860B', borderColor: '#B8860B' }} onClick={() => navigate('/admin/data-migration/new')}>
          New Migration
        </Button>
      </div>

      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        {summaryTiles.map((s) => (
          <Col xs={12} md={6} key={s.key}>
            <Card bodyStyle={{ padding: '14px 16px' }} style={{ borderRadius: 8, border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.07)', borderTop: `3px solid ${s.color}` }}>
              <Statistic title={<Text style={{ fontSize: 11, color: '#888' }}>{s.key}</Text>} value={s.value} valueStyle={{ color: s.color, fontSize: 20, fontWeight: 700 }} />
            </Card>
          </Col>
        ))}
      </Row>

      <Card bodyStyle={{ padding: 0 }} style={{ borderRadius: 8 }}>
        <Table
          scroll={{ x: 'max-content' }} size="small" loading={isLoading} rowKey="Migration_ID" pagination={{ pageSize: 15 }}
          dataSource={data?.migrations || []} columns={columns}
          locale={{ emptyText: 'No migrations yet — click "New Migration" to bring in a customer\'s old ERP data.' }}
        />
      </Card>
    </div>
  );
}
