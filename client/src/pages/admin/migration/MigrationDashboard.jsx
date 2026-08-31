/**
 * Data Migration Center — dashboard (design doc §49). Super-Admin-only,
 * lists every migration across every tenant with per-status counts and a
 * "New Migration" entry point into the wizard.
 */
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Typography, Card, Table, Button, Tag, Row, Col, Statistic, Space, Collapse, Steps } from 'antd';
import { PlusOutlined, SwapOutlined, QuestionCircleOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { migrationApi } from '../../../api/modules';
import dayjs from 'dayjs';

const { Title, Text, Paragraph } = Typography;

const HOW_TO_STEPS = [
  { title: 'New Migration', description: 'Pick the tenant to migrate data INTO, and the import type — Full, Master data only (Customers/Suppliers/Products), or Transactions only (Purchases/Sales/Payments).' },
  { title: 'Upload', description: 'Drag in the old ERP\'s exported files — .xlsx, .csv, or a .zip bundling several of either. Multiple files in one migration are fine.' },
  { title: 'Analyze', description: 'Reads every sheet in every file and guesses what each one is (Customer Master, Item Master, Sales Register, ...) from its name and columns.' },
  { title: 'Review Mapping', description: 'Each detected sheet shows its columns matched to the right field, with a confidence score. Anything below ~90% is worth a second look before continuing — nothing is changed automatically at this step.' },
  { title: 'Validate', description: 'Checks every row for missing required fields, bad values, and duplicates against what\'s already in the target tenant\'s real data.' },
  { title: 'Resolve Duplicates', description: 'For anything that matched an existing record, choose what happens: use the existing one, update it, create a new one anyway, skip it, or merge.' },
  { title: 'Approve', description: 'A checkbox confirmation before anything touches production data — this is the point of no easy return, so review the validation summary first.' },
  { title: 'Run', description: 'Starts in the background and the page polls its progress — safe to navigate away and come back later via the Dashboard.' },
  { title: 'Reconcile', description: 'Once complete, compare what was staged against what actually landed, entity by entity, before calling the migration done.' },
];

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

      <Collapse
        defaultActiveKey={['how-to']} style={{ marginBottom: 16, borderRadius: 8 }}
        items={[{
          key: 'how-to',
          label: <Space><QuestionCircleOutlined style={{ color: '#B8860B' }} /><Text strong>How to Use Data Migration</Text></Space>,
          children: (
            <>
              <Paragraph type="secondary" style={{ fontSize: 12.5, marginBottom: 16 }}>
                Bring a customer's existing ERP data into this system. Nothing is ever written into the target tenant's live
                data until you explicitly approve it — every step up to Approve is safe to explore, re-check, and correct.
              </Paragraph>
              <Steps direction="vertical" size="small" current={-1} items={HOW_TO_STEPS} />
            </>
          ),
        }]}
      />

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
