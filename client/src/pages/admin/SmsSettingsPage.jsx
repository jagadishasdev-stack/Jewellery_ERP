/**
 * SMS Settings — Super Admin only. Managed centrally rather than
 * self-service per tenant, since Sender ID / DLT Entity ID / template IDs
 * are compliance-sensitive DLT registrations. Pick a tenant (or the global
 * default) below to view/edit that tenant's own SMS gateway + templates.
 */
import React, { useState, useRef } from 'react';
import {
  Card, Form, Input, Switch, Button, Table, Modal,
  Typography, Tag, message, Alert, Select, Row, Col, Empty,
} from 'antd';
import { PlusOutlined, EditOutlined, ShopOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { smsApi, tenantApi } from '../../api/modules';
import PageTour from '../../components/PageTour';

const { Title, Paragraph } = Typography;
const { Option } = Select;

const PURPOSES = ['OTP', 'REMINDER', 'RECEIPT', 'MATURITY', 'PROMOTIONAL'];
const GLOBAL_KEY = '__global__'; // Select value standing in for tenantId=null

function GatewayConfigCard({ tenantId }) {
  const [form] = Form.useForm();
  const qc = useQueryClient();
  const params = { tenantId: tenantId === null ? 'null' : tenantId };

  const { data, isLoading } = useQuery({
    queryKey: ['sms-gateway-config', tenantId],
    queryFn: () => smsApi.getGatewayConfig(params).then(r => {
      const cfg = r.data.data;
      if (cfg?.isOwnConfig) {
        // Own saved config for the selected tenant — safe to prefill everything.
        form.setFieldsValue(cfg);
      } else if (cfg) {
        // Showing the shared/global default for reference only — DLT fields
        // (Sender ID, Entity ID, API user/key) are specific to ONE registered
        // business and must never be silently copied into another tenant's
        // config, or their SMS would send under someone else's DLT
        // registration and likely get rejected by the carrier. Only carry
        // over the non-DLT-specific infrastructure fields as a convenience.
        form.setFieldsValue({
          Provider: cfg.Provider,
          Api_Base_Url: cfg.Api_Base_Url,
          Account_Usage: cfg.Account_Usage,
          Is_Active: cfg.Is_Active,
        });
      } else {
        form.resetFields();
      }
      return cfg;
    }),
  });

  const saveMutation = useMutation({
    mutationFn: (values) => smsApi.saveGatewayConfig(values, params),
    onSuccess: () => {
      message.success('SMS gateway config saved.');
      qc.invalidateQueries(['sms-gateway-config', tenantId]);
    },
    onError: (err) => message.error(err.response?.data?.message || 'Failed to save gateway config.'),
  });

  const isGlobal = tenantId === null;

  return (
    <Card
      title="SMS Gateway Configuration"
      loading={isLoading}
      extra={data && !data.isOwnConfig && !isGlobal && <Tag color="orange">No config for this tenant yet — using shared default for now</Tag>}
    >
      {data && !data.isOwnConfig && !isGlobal && (
        <Alert
          type="warning" showIcon style={{ marginBottom: 16 }}
          message="Enter this tenant's own DLT registration details"
          description="Sender ID, DLT Entity ID, and API user/key are tied to ONE specific DLT-registered business — they're left blank below on purpose. Enter this tenant's own registered details and save; don't reuse another tenant's values or their SMS will likely be rejected by the carrier."
        />
      )}
      <Form form={form} layout="vertical" onFinish={v => saveMutation.mutate(v)}>
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item name="Provider" label="Provider" initialValue="asterix" rules={[{ required: true }]}>
              <Input placeholder="e.g. asterix" />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="Api_Base_Url" label="API Base URL" rules={[{ required: true }]}>
              <Input placeholder="http://sms.provider.com/submitsms.jsp" />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="Api_User" label="API User" rules={[{ required: true }]}
              tooltip="This tenant's own login for the SMS gateway — not shared across tenants.">
              <Input />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="Api_Key" label="API Key" rules={[{ required: true }]}
              tooltip="This tenant's own API key — not shared across tenants.">
              <Input.Password />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="Sender_Id" label="Sender ID" rules={[{ required: true }]}
              tooltip="Must be this tenant's own DLT-registered sender ID.">
              <Input placeholder="e.g. TAJWLS" />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="Entity_Id" label="DLT Entity ID" rules={[{ required: true }]}
              tooltip="Must be this tenant's own DLT entity ID — using another business's ID will get messages rejected by the carrier.">
              <Input />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="Account_Usage" label="Account Usage" initialValue="1">
              <Input />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="Is_Active" label="Active" valuePropName="checked" initialValue={true}>
              <Switch />
            </Form.Item>
          </Col>
        </Row>
        <Button type="primary" htmlType="submit" loading={saveMutation.isPending}
          style={{ background: '#B8860B', borderColor: '#B8860B' }}>
          Save Gateway Config
        </Button>
      </Form>
    </Card>
  );
}

function TemplatesCard({ tenantId }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form] = Form.useForm();
  const qc = useQueryClient();
  const params = { tenantId: tenantId === null ? 'null' : tenantId };

  const { data, isLoading } = useQuery({
    queryKey: ['sms-templates', tenantId],
    queryFn: () => smsApi.getTemplates(params).then(r => r.data.data),
  });

  const saveMutation = useMutation({
    mutationFn: (values) => smsApi.saveTemplate(values, params),
    onSuccess: () => {
      message.success('Template saved.');
      qc.invalidateQueries(['sms-templates', tenantId]);
      setOpen(false);
      form.resetFields();
      setEditing(null);
    },
    onError: (err) => message.error(err.response?.data?.message || 'Failed to save template.'),
  });

  const openEdit = (row) => {
    setEditing(row);
    if (row.isOwnConfig) {
      // Own saved template for the selected tenant — safe to prefill everything.
      form.setFieldsValue(row);
    } else {
      // Creating this tenant's OWN override, using the shared default as a
      // text starting point — but the DLT Template ID is a specific
      // registration tied to one business and must never be silently
      // copied, or messages sent under it will be rejected.
      form.setFieldsValue({ ...row, Dlt_Template_Id: '' });
    }
    setOpen(true);
  };
  const openNew = () => { setEditing(null); form.resetFields(); setOpen(true); };

  const columns = [
    { title: 'Purpose', dataIndex: 'Purpose', width: 130 },
    { title: 'DLT Template ID', dataIndex: 'Dlt_Template_Id', width: 200 },
    { title: 'Template Text', dataIndex: 'Template_Text' },
    {
      title: 'Source', width: 90,
      render: (_, row) => <Tag color={row.isOwnConfig ? 'blue' : 'default'}>{row.isOwnConfig ? 'Own' : 'Default'}</Tag>,
    },
    {
      title: '', width: 110,
      render: (_, row) => (
        <Button size="small" type="text" icon={<EditOutlined />} onClick={() => openEdit(row)}>
          {row.isOwnConfig ? 'Edit' : 'Set My Own'}
        </Button>
      ),
    },
  ];

  return (
    <Card
      title="SMS Templates"
      style={{ marginTop: 16 }}
      extra={
        <Button type="primary" size="small" icon={<PlusOutlined />}
          style={{ background: '#B8860B', borderColor: '#B8860B' }} onClick={openNew}>
          Add / Override Template
        </Button>
      }
    >
      <Alert
        type="info" showIcon style={{ marginBottom: 12 }}
        message="DLT compliance"
        description="Template text must match the DLT-registered wording exactly, except for the variable token (e.g. <OTP>) which gets substituted at send time."
      />
      <Table
        scroll={{ x: 'max-content' }} size="small" rowKey="Purpose"
        dataSource={data || []} loading={isLoading} columns={columns}
        pagination={false}
      />

      <Modal
        title={
          editing
            ? (editing.isOwnConfig ? `Edit Template — ${editing.Purpose}` : `Set Own Template — ${editing.Purpose}`)
            : 'Add / Override Template'
        }
        open={open}
        onCancel={() => { setOpen(false); form.resetFields(); setEditing(null); }}
        footer={null}
      >
        {editing && !editing.isOwnConfig && (
          <Alert
            type="warning" showIcon style={{ marginBottom: 16 }}
            message="Enter this tenant's own DLT Template ID"
            description="The text below is copied from the shared default as a starting point, but the DLT Template ID is cleared on purpose — it's a specific registration tied to one business. Enter this tenant's own registered ID; reusing another business's ID will get messages rejected."
          />
        )}
        <Form form={form} layout="vertical" onFinish={v => saveMutation.mutate(v)}>
          <Form.Item name="Purpose" label="Purpose" rules={[{ required: true }]}>
            <Select disabled={!!editing} placeholder="Select purpose">
              {PURPOSES.map(p => <Option key={p} value={p}>{p}</Option>)}
            </Select>
          </Form.Item>
          <Form.Item name="Dlt_Template_Id" label="DLT Template ID" rules={[{ required: true }]}
            tooltip="Must be this tenant's own DLT-registered template ID.">
            <Input placeholder="This tenant's own DLT-registered template ID" />
          </Form.Item>
          <Form.Item name="Template_Text" label="Template Text" rules={[{ required: true }]}>
            <Input.TextArea rows={4} placeholder="e.g. <OTP> : OTP for user registration purpose only. From ..." />
          </Form.Item>
          <Form.Item name="Is_Active" label="Active" valuePropName="checked" initialValue={true}>
            <Switch />
          </Form.Item>
          <Button type="primary" htmlType="submit" block loading={saveMutation.isPending}
            style={{ background: '#B8860B', borderColor: '#B8860B' }}>
            Save Template
          </Button>
        </Form>
      </Modal>
    </Card>
  );
}

export default function SmsSettingsPage() {
  const [selectedKey, setSelectedKey] = useState(undefined); // undefined = nothing picked yet

  // ── Walkthrough tour refs ───────────────────────────────────────────────────
  const tenantSelectRef = useRef(null);
  const gatewayRef = useRef(null);
  const templatesRef = useRef(null);
  const tourSteps = [
    { title: '1. Choose a Client', description: 'Pick which tenant client you want to view or edit — or pick the Global Default, the shared fallback used until a tenant has entered their own settings.', target: () => tenantSelectRef.current },
    { title: '2. SMS Gateway Setup', description: 'Enter this tenant\'s own SMS provider details — API URL, user, key, Sender ID and DLT Entity ID. These are tied to ONE DLT-registered business each, so never copy another tenant\'s values here.', target: () => gatewayRef.current },
    { title: '3. Message Templates', description: 'Each purpose (OTP, Reminder, Receipt, Maturity, Promotional) needs its own DLT-approved template text and ID — click Edit/Set My Own to enter this tenant\'s registered wording.', target: () => templatesRef.current },
    { title: '4. Compliance Note', description: 'Template text must match the DLT-registered wording exactly (except the variable token, e.g. <OTP>) or the carrier will reject the message.' },
  ];

  const { data: tenants, isLoading: tenantsLoading } = useQuery({
    queryKey: ['tenants-all'],
    queryFn: () => tenantApi.getAllTenants().then(r => r.data.data),
  });

  // Map the Select's string key back to the tenantId the cards expect
  // (real Tenant_ID string, or null for the global default row).
  const tenantId = selectedKey === undefined ? undefined : (selectedKey === GLOBAL_KEY ? null : selectedKey);

  return (
    <div className="page-wrapper">
      <div className="page-header">
        <Title level={4} style={{ margin: 0 }}>SMS Settings</Title>
        <Paragraph type="secondary" style={{ marginTop: 4 }}>
          Configure the SMS gateway and message templates used for OTP delivery, payment reminders, and other notifications — Super Admin only. Select a client below to view/edit their own DLT-registered setup.
        </Paragraph>
      </div>

      <div ref={tenantSelectRef}>
      <Card style={{ marginBottom: 16 }}>
        <Select
          showSearch
          allowClear
          placeholder="Select a tenant client (or the global default)..."
          style={{ width: '100%', maxWidth: 480 }}
          loading={tenantsLoading}
          value={selectedKey}
          onChange={(v) => setSelectedKey(v)}
          onClear={() => setSelectedKey(undefined)}
          optionFilterProp="label"
          filterOption={(input, option) => (option?.label ?? '').toLowerCase().includes(input.toLowerCase())}
          options={[
            { value: GLOBAL_KEY, label: '🌐 Global Default (shared fallback)' },
            ...(tenants || [])
              .filter(t => t.Tenant_ID !== 'SA_MASTER')
              .map(t => ({ value: t.Tenant_ID, label: `${t.Company_Name} (${t.Tenant_ID})` })),
          ]}
        />
      </Card>
      </div>

      {tenantId === undefined ? (
        <Card>
          <Empty
            image={<ShopOutlined style={{ fontSize: 48, color: '#ccc' }} />}
            description="Select a tenant client above to view or edit their SMS gateway and templates."
          />
        </Card>
      ) : (
        <>
          <div ref={gatewayRef}><GatewayConfigCard tenantId={tenantId} /></div>
          <div ref={templatesRef}><TemplatesCard tenantId={tenantId} /></div>
        </>
      )}

      <PageTour steps={tourSteps} />
    </div>
  );
}
