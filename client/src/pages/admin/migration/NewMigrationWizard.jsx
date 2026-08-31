/**
 * Data Migration Center — the wizard (design doc §64's stepper, driving
 * Client -> Upload -> Analyze -> Mapping -> Validation -> Duplicate
 * Review -> Preview -> Approval -> Progress -> Reconciliation). The
 * current step is derived from the migration's own Status, not separate
 * client-side state — reloading the page or coming back later always
 * shows the real current step.
 *
 * No Socket.IO here deliberately: the existing useSocket() hook only
 * ever joins the LOGGED-IN user's own tenant room, which for a Super
 * Admin is 'SA_MASTER' — never the arbitrary TARGET tenant a migration
 * actually runs against. Extending that shared hook to join an arbitrary
 * room is a real, separate change or another page's assumption could
 * quietly break; polling GET /:id/status (already the documented
 * fallback/source-of-truth on the backend) is what drives the Progress
 * step instead — simpler, and no less "live" at a 1.5s interval.
 */
import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Typography, Card, Steps, Button, Select, Upload, Table, Tag, Space, Progress,
  Descriptions, Alert, Checkbox, message, Spin, Empty, InputNumber,
} from 'antd';
import { UploadOutlined, CheckCircleOutlined, SwapOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { migrationApi, tenantApi } from '../../../api/modules';
import PageTour from '../../../components/PageTour';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { Option } = Select;
const { Dragger } = Upload;

const STEP_FOR_STATUS = {
  DRAFT: 0, UPLOADED: 0, ANALYZING: 0, MAPPING: 1, VALIDATING: 1,
  READY: 2, APPROVED: 3, RUNNING: 3, COMPLETED: 4, FAILED: 4,
};
const STEP_TITLES = ['Upload', 'Mapping', 'Validate & Approve', 'Run', 'Complete'];

export default function NewMigrationWizard() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [tenantId, setTenantId] = useState(null);
  const [migrationType, setMigrationType] = useState('Full');
  const [fileList, setFileList] = useState([]);

  const { data: tenants } = useQuery({ queryKey: ['all-tenants-migration'], queryFn: () => tenantApi.getAllTenants().then((r) => r.data.data) });

  const { data: migration, isLoading } = useQuery({
    queryKey: ['migration-detail', id],
    queryFn: () => migrationApi.getById(id).then((r) => r.data.data),
    enabled: !!id,
    refetchInterval: (query) => (query.state.data?.Status === 'RUNNING' ? 1500 : false),
  });

  const createMutation = useMutation({
    mutationFn: () => migrationApi.create({ Tenant_ID: tenantId, Migration_Type: migrationType }),
    onSuccess: (res) => navigate(`/admin/data-migration/${res.data.data.Migration_ID}`),
    onError: (err) => message.error(err.response?.data?.message || 'Failed to create migration.'),
  });

  const uploadMutation = useMutation({
    mutationFn: () => {
      const formData = new FormData();
      fileList.forEach((f) => formData.append('files', f));
      return migrationApi.uploadFiles(id, formData);
    },
    onSuccess: () => { message.success('Files uploaded.'); setFileList([]); qc.invalidateQueries({ queryKey: ['migration-detail', id] }); },
    onError: (err) => message.error(err.response?.data?.message || 'Upload failed.'),
  });

  const analyzeMutation = useMutation({
    mutationFn: () => migrationApi.analyze(id),
    onSuccess: () => { message.success('Analysis complete.'); qc.invalidateQueries({ queryKey: ['migration-detail', id] }); qc.invalidateQueries({ queryKey: ['migration-mapping', id] }); },
    onError: (err) => message.error(err.response?.data?.message || 'Analysis failed.'),
  });

  const validateMutation = useMutation({
    mutationFn: () => migrationApi.validate(id),
    onSuccess: () => { message.success('Validation complete.'); qc.invalidateQueries({ queryKey: ['migration-detail', id] }); qc.invalidateQueries({ queryKey: ['migration-preview', id] }); },
    onError: (err) => message.error(err.response?.data?.message || 'Validation failed.'),
  });

  const [approveChecked, setApproveChecked] = useState(false);
  const approveMutation = useMutation({
    mutationFn: () => migrationApi.approve(id),
    onSuccess: () => { message.success('Migration approved.'); qc.invalidateQueries({ queryKey: ['migration-detail', id] }); },
    onError: (err) => message.error(err.response?.data?.message || 'Approval failed.'),
  });

  const startMutation = useMutation({
    mutationFn: () => migrationApi.start(id),
    onSuccess: () => { message.success('Migration started.'); qc.invalidateQueries({ queryKey: ['migration-detail', id] }); },
    onError: (err) => message.error(err.response?.data?.message || 'Failed to start.'),
  });

  const { data: mappingGroups } = useQuery({
    queryKey: ['migration-mapping', id],
    queryFn: () => migrationApi.getMapping(id).then((r) => r.data.data),
    enabled: !!id && migration?.Status === 'MAPPING',
  });

  const { data: preview } = useQuery({
    queryKey: ['migration-preview', id],
    queryFn: () => migrationApi.getPreview(id).then((r) => r.data.data),
    enabled: !!id && ['READY', 'APPROVED'].includes(migration?.Status),
  });

  const { data: duplicates } = useQuery({
    queryKey: ['migration-duplicates', id],
    queryFn: () => migrationApi.getDuplicates(id).then((r) => r.data.data),
    enabled: !!id && ['READY', 'APPROVED'].includes(migration?.Status),
  });

  const { data: report } = useQuery({
    queryKey: ['migration-report', id],
    queryFn: () => migrationApi.getReport(id).then((r) => r.data.data),
    enabled: !!id && ['COMPLETED', 'FAILED'].includes(migration?.Status),
  });

  const { data: reconciliation } = useQuery({
    queryKey: ['migration-reconciliation', id],
    queryFn: () => migrationApi.getReconciliation(id).then((r) => r.data.data),
    enabled: !!id && migration?.Status === 'COMPLETED',
  });

  const resolveDuplicatesMutation = useMutation({
    mutationFn: ({ stagingIds, action }) => migrationApi.resolveDuplicates(id, stagingIds, action),
    onSuccess: () => { message.success('Updated.'); qc.invalidateQueries({ queryKey: ['migration-duplicates', id] }); },
  });

  // ── Step 0: create (no id yet) ──────────────────────────────────────────────
  if (!id) {
    return (
      <div className="page-wrapper">
        <div className="page-header"><Title level={4} style={{ margin: 0 }}><SwapOutlined style={{ color: '#B8860B', marginRight: 8 }} />New Data Migration</Title></div>
        <Card style={{ borderRadius: 8, maxWidth: 520 }}>
          <Text strong style={{ fontSize: 12 }}>Client / Tenant</Text>
          <Select style={{ width: '100%', marginTop: 6, marginBottom: 16 }} showSearch optionFilterProp="children" placeholder="Select the tenant to migrate data into" value={tenantId} onChange={setTenantId}>
            {(tenants || []).map((t) => <Option key={t.Tenant_ID} value={t.Tenant_ID}>{t.Company_Name} ({t.Tenant_ID})</Option>)}
          </Select>
          <Text strong style={{ fontSize: 12 }}>Import Type</Text>
          <Select style={{ width: '100%', marginTop: 6, marginBottom: 16 }} value={migrationType} onChange={setMigrationType}>
            <Option value="Full">Full Migration — everything available</Option>
            <Option value="Master">Master Migration — Customers, Suppliers, Products only</Option>
            <Option value="Transaction">Transaction Migration — Purchases, Sales, Payments only</Option>
          </Select>
          <Button type="primary" block disabled={!tenantId} loading={createMutation.isPending} style={{ background: '#B8860B', borderColor: '#B8860B' }} onClick={() => createMutation.mutate()}>
            Continue
          </Button>
        </Card>
      </div>
    );
  }

  if (isLoading || !migration) return <div className="page-wrapper"><Spin /></div>;

  const activeStep = STEP_FOR_STATUS[migration.Status] ?? 0;

  return (
    <div className="page-wrapper">
      <div className="page-header">
        <div>
          <Title level={4} style={{ margin: 0 }}><SwapOutlined style={{ color: '#B8860B', marginRight: 8 }} />{migration.Migration_ID}</Title>
          <Text type="secondary" style={{ fontSize: 12 }}>{migration.Tenant_ID} · {migration.Migration_Type} · <Tag>{migration.Status}</Tag></Text>
        </div>
        <Button onClick={() => navigate('/admin/data-migration')}>Back to Dashboard</Button>
      </div>

      <Steps current={activeStep} items={STEP_TITLES.map((t) => ({ title: t }))} style={{ marginBottom: 24 }} />

      {/* ── Step 0: Upload + Analyze ── */}
      {activeStep === 0 && (
        <Card title="Upload Old ERP Data" style={{ borderRadius: 8 }}>
          <Text type="secondary" style={{ fontSize: 12 }}>.xlsx, .csv, or .zip — multiple files allowed. Max 500MB per file.</Text>
          <Dragger multiple beforeUpload={(file) => { setFileList((prev) => [...prev, file]); return false; }}
            onRemove={(file) => setFileList((prev) => prev.filter((f) => f !== file))} fileList={fileList} style={{ marginTop: 12, marginBottom: 12 }}>
            <p className="ant-upload-drag-icon"><UploadOutlined style={{ color: '#B8860B' }} /></p>
            <p>Drag & drop files here, or click to browse</p>
          </Dragger>
          <Space>
            <Button type="primary" disabled={!fileList.length} loading={uploadMutation.isPending} style={{ background: '#B8860B', borderColor: '#B8860B' }} onClick={() => uploadMutation.mutate()}>
              Upload
            </Button>
            {migration.files?.length > 0 && (
              <Button type="primary" loading={analyzeMutation.isPending} onClick={() => analyzeMutation.mutate()} style={{ background: '#1890ff', borderColor: '#1890ff' }}>
                Analyze Files
              </Button>
            )}
          </Space>
          {migration.files?.length > 0 && (
            <Table
              style={{ marginTop: 16 }} size="small" pagination={false} rowKey="File_ID" dataSource={migration.files}
              columns={[{ title: 'File', dataIndex: 'File_Name' }, { title: 'Type', dataIndex: 'File_Type' }, { title: 'Size', dataIndex: 'File_Size', render: (v) => `${(v / 1024).toFixed(1)} KB` }]}
            />
          )}
        </Card>
      )}

      {/* ── Step 1: Mapping ── */}
      {activeStep === 1 && (
        <Card title="Column Mapping" style={{ borderRadius: 8 }}
          extra={<Button type="primary" loading={validateMutation.isPending} style={{ background: '#B8860B', borderColor: '#B8860B' }} onClick={() => validateMutation.mutate()}>Looks Good — Validate</Button>}>
          <Alert type="info" showIcon style={{ marginBottom: 12 }} message="Auto-suggested mappings above 90% confidence are pre-approved. Review anything lower before validating." />
          {(mappingGroups || []).map((g) => (
            <Card key={`${g.entityType}-${g.sourceFile}-${g.sourceSheet}`} type="inner" title={`${g.sourceSheet} (${g.entityType}) — ${g.sourceFile}`} style={{ marginBottom: 12 }}>
              <Table
                size="small" pagination={false} rowKey="sourceField" dataSource={g.fields}
                columns={[
                  { title: 'Source Column', dataIndex: 'sourceField' },
                  { title: 'Maps To', dataIndex: 'targetField', render: (v) => v || <Text type="secondary">(unmapped)</Text> },
                  { title: 'Confidence', dataIndex: 'confidence', render: (v) => `${v}%` },
                  { title: 'Status', dataIndex: 'status', render: (v) => <Tag color={v === 'auto' ? 'green' : v === 'review' ? 'orange' : v === 'manual' ? 'blue' : 'default'}>{v}</Tag> },
                ]}
              />
            </Card>
          ))}
        </Card>
      )}

      {/* ── Step 2: Validation summary + Duplicates + Approve ── */}
      {activeStep === 2 && (
        <>
          <Card title="Validation Summary" style={{ borderRadius: 8, marginBottom: 16 }}>
            <Table
              size="small" pagination={false} rowKey="entity" dataSource={Object.entries(preview?.byEntity || {}).map(([entity, c]) => ({ entity, ...c }))}
              columns={[
                { title: 'Entity', dataIndex: 'entity' }, { title: 'Total', dataIndex: 'total' },
                { title: 'Valid', dataIndex: 'Valid', render: (v) => <Tag color="green">{v || 0}</Tag> },
                { title: 'Warning', dataIndex: 'Warning', render: (v) => v > 0 ? <Tag color="orange">{v}</Tag> : '-' },
                { title: 'Error', dataIndex: 'Error', render: (v) => v > 0 ? <Tag color="red">{v}</Tag> : '-' },
              ]}
            />
          </Card>

          {duplicates?.length > 0 && (
            <Card title={`Duplicates Found (${duplicates.length})`} style={{ borderRadius: 8, marginBottom: 16 }}>
              <Table
                size="small" pagination={{ pageSize: 10 }} rowKey="Staging_ID" dataSource={duplicates}
                columns={[
                  { title: 'Row', dataIndex: 'Source_Row' }, { title: 'Entity', dataIndex: 'Entity_Type' },
                  { title: 'Data', dataIndex: 'Mapped_Data', render: (v) => JSON.stringify(v) },
                  { title: 'Action', dataIndex: 'Duplicate_Action', render: (v) => v ? <Tag>{v}</Tag> : <Text type="secondary">Not resolved</Text> },
                  {
                    title: '', render: (_, r) => (
                      <Select size="small" style={{ width: 140 }} placeholder="Resolve" value={r.Duplicate_Action || undefined}
                        onChange={(action) => resolveDuplicatesMutation.mutate({ stagingIds: [r.Staging_ID], action })}>
                        {['UseExisting', 'UpdateExisting', 'CreateNew', 'Skip', 'Merge'].map((a) => <Option key={a} value={a}>{a}</Option>)}
                      </Select>
                    ),
                  },
                ]}
              />
            </Card>
          )}

          <Card title="Approval" style={{ borderRadius: 8 }}>
            {migration.Status === 'READY' ? (
              <>
                <Alert type="warning" showIcon message="Production Database Operation"
                  description={`This will insert ${preview ? Object.values(preview.byEntity).reduce((s, e) => s + (e.total || 0), 0) : '...'} records into ${migration.Tenant_ID}'s live database.`}
                  style={{ marginBottom: 12 }} />
                <Checkbox checked={approveChecked} onChange={(e) => setApproveChecked(e.target.checked)} style={{ marginBottom: 12 }}>
                  I have reviewed the mapping, validation, and duplicate resolutions above.
                </Checkbox>
                <Button type="primary" danger block disabled={!approveChecked} loading={approveMutation.isPending} onClick={() => approveMutation.mutate()}>
                  Approve & Continue
                </Button>
              </>
            ) : (
              <Button type="primary" block loading={startMutation.isPending} style={{ background: '#52c41a', borderColor: '#52c41a' }} onClick={() => startMutation.mutate()}>
                Start Migration
              </Button>
            )}
          </Card>
        </>
      )}

      {/* ── Step 3: Running ── */}
      {activeStep === 3 && (
        <Card title="Migration In Progress" style={{ borderRadius: 8 }}>
          <Progress percent={migration.Total_Records ? Math.round(((migration.Success_Records + migration.Warning_Records + migration.Error_Records) / migration.Total_Records) * 100) : 0} status="active" />
          <Descriptions size="small" column={3} style={{ marginTop: 16 }}>
            <Descriptions.Item label="Success">{migration.Success_Records || 0}</Descriptions.Item>
            <Descriptions.Item label="Warnings">{migration.Warning_Records || 0}</Descriptions.Item>
            <Descriptions.Item label="Errors">{migration.Error_Records || 0}</Descriptions.Item>
          </Descriptions>
        </Card>
      )}

      {/* ── Step 4: Complete / Failed ── */}
      {activeStep === 4 && (
        <>
          {migration.Status === 'FAILED' && <Alert type="error" showIcon message="Migration Failed" description={migration.Failure_Reason} style={{ marginBottom: 16 }} />}
          {migration.Status === 'COMPLETED' && <Alert type="success" showIcon icon={<CheckCircleOutlined />} message="Migration Complete" style={{ marginBottom: 16 }} />}

          {report && (
            <Card title="Migration Report" style={{ borderRadius: 8, marginBottom: 16 }}>
              <Table
                size="small" pagination={false} rowKey="entity" dataSource={Object.entries(report.byEntity || {}).map(([entity, c]) => ({ entity, ...c }))}
                columns={[{ title: 'Entity', dataIndex: 'entity' }, { title: 'Imported', dataIndex: 'Imported' }, { title: 'Skipped', dataIndex: 'Skipped' }, { title: 'Failed', dataIndex: 'Failed' }]}
              />
            </Card>
          )}

          {reconciliation && (
            <Card title="Reconciliation" style={{ borderRadius: 8 }}>
              <Table
                size="small" pagination={false} rowKey="entityType" dataSource={reconciliation.rows}
                columns={[
                  { title: 'Entity', dataIndex: 'entityType' }, { title: 'Staged', dataIndex: 'staged' }, { title: 'Imported', dataIndex: 'imported' },
                  { title: 'Difference', dataIndex: 'difference', render: (v) => v === 0 ? <Tag color="green">0</Tag> : <Tag color="orange">{v}</Tag> },
                ]}
              />
            </Card>
          )}
        </>
      )}

      <PageTour steps={[
        { title: 'Data Migration Wizard', description: 'Upload the customer\'s old ERP export, review the auto-suggested column mapping, validate, resolve any duplicates, approve, then start — the migration runs in the background and this page polls its progress.' },
      ]} />
    </div>
  );
}
