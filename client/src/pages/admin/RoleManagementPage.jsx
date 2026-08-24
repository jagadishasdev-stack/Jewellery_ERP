/**
 * Role Management — Create, Edit, Delete roles with full permission matrix
 */
import React, { useState, useRef } from 'react';
import {
  Table, Button, Card, Typography, Tag, Modal, Form, Input, Switch,
  message, Space, Popconfirm, Divider, Row, Col, Tooltip, Badge, Alert,
} from 'antd';
import {
  PlusOutlined, EditOutlined, DeleteOutlined, CopyOutlined, SafetyOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { tenantApi } from '../../api/modules';
import PageTour from '../../components/PageTour';
import dayjs from 'dayjs';

const { Title, Text } = Typography;

const PERMISSION_GROUPS = [
  {
    group: 'Operations',
    perms: [
      { key: 'sales',              label: 'Sales & Billing' },
      { key: 'inventory',          label: 'Inventory & Stock' },
      { key: 'karigar_management', label: 'Karigar Management' },
      { key: 'approval_management', label: 'Approval Issue / Receive' },
      { key: 'accounts',           label: 'Accounts & Finance' },
    ],
  },
  {
    group: 'Record Actions',
    perms: [
      { key: 'can_create', label: 'Create Records' },
      { key: 'can_edit',   label: 'Edit Records' },
      { key: 'can_delete', label: 'Delete Records' },
    ],
  },
  {
    group: 'Admin & Settings',
    perms: [
      { key: 'audit',              label: 'Audit Log' },
      { key: 'tenant_management',  label: 'Admin (User/Role Mgmt + Hidden Stock)' },
      { key: 'global_master',      label: 'Super Admin Access' },
      { key: 'edit_invoice_template', label: 'Invoice Studio' },
      { key: 'open_customer_display', label: 'Customer Display' },
    ],
  },
];

const ALL_PERM_KEYS = PERMISSION_GROUPS.flatMap(g => g.perms.map(p => p.key));

const DEFAULT_PERMISSIONS = Object.fromEntries(ALL_PERM_KEYS.map(k => [k, false]));

export default function RoleManagementPage() {
  const qc = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editRole, setEditRole] = useState(null);
  const [permissions, setPermissions] = useState({ ...DEFAULT_PERMISSIONS });
  const [form] = Form.useForm();

  // ── Walkthrough tour refs ───────────────────────────────────────────────────
  const createRoleRef = useRef(null);
  const tableRef = useRef(null);
  const tourSteps = [
    { title: '1. Create Role', description: 'Click here to define a new role — give it a name and description, then toggle on the permissions it should grant (e.g. "Branch Manager" with Sales + Inventory access).', target: () => createRoleRef.current },
    { title: '2. Role List', description: 'Every role appears here with a quick summary of its granted permissions. "System" roles — Super Admin and Client Admin — are protected and cannot be deleted.', target: () => tableRef.current },
    { title: '3. Edit Permissions', description: 'Click the pencil icon on any custom role to open its permission matrix — grouped as Operations, Record Actions, and Admin & Settings. Use "Select All" / "Clear All" for bulk changes.' },
    { title: '4. Copy & Delete', description: 'Use the copy icon to clone an existing role\'s permissions as a starting point for a new one. The trash icon deletes a custom role — but only after every user on it has been reassigned to a different role.' },
  ];

  const { data: roles, isLoading } = useQuery({
    queryKey: ['roles'],
    queryFn: () => tenantApi.getRoles().then(r => r.data.data),
  });

  const createMutation = useMutation({
    mutationFn: (d) => tenantApi.createRole(d),
    onSuccess: () => { message.success('Role created!'); qc.invalidateQueries(['roles']); closeModal(); },
    onError: (err) => message.error(err.response?.data?.message || 'Failed.'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => tenantApi.updateRole(id, data),
    onSuccess: () => { message.success('Role updated!'); qc.invalidateQueries(['roles']); closeModal(); },
    onError: (err) => message.error(err.response?.data?.message || 'Failed.'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => tenantApi.deleteRole(id),
    onSuccess: () => { message.success('Role deleted.'); qc.invalidateQueries(['roles']); },
    onError: (err) => message.error(err.response?.data?.message || 'Failed.'),
  });

  const parsePerms = (raw) => {
    try { return typeof raw === 'string' ? JSON.parse(raw) : (raw || {}); } catch { return {}; }
  };

  const openCreate = () => {
    setEditRole(null);
    setPermissions({ ...DEFAULT_PERMISSIONS });
    form.resetFields();
    setModalOpen(true);
  };

  const openEdit = (role) => {
    setEditRole(role);
    const p = parsePerms(role.Permissions);
    const merged = { ...DEFAULT_PERMISSIONS, ...p };
    setPermissions(merged);
    form.setFieldsValue({ Role_Name: role.Role_Name, Description: role.Description });
    setModalOpen(true);
  };

  const copyFrom = (role) => {
    const p = parsePerms(role.Permissions);
    setPermissions({ ...DEFAULT_PERMISSIONS, ...p });
    message.success(`Permissions copied from "${role.Role_Name}"`);
  };

  const closeModal = () => { setModalOpen(false); setEditRole(null); form.resetFields(); };

  const onFinish = (values) => {
    const payload = { ...values, Permissions: permissions };
    if (editRole) {
      updateMutation.mutate({ id: editRole.Role_ID, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const isSystem = (r) => ['Super Admin', 'Client Admin'].includes(r.Role_Name);

  const columns = [
    {
      title: 'Role Name', dataIndex: 'Role_Name',
      render: (v, r) => (
        <Space>
          <Text strong style={{ fontSize: 13 }}>{v}</Text>
          {isSystem(r) && <Tag color="gold" style={{ fontSize: 10 }}>System</Tag>}
        </Space>
      ),
    },
    { title: 'Description', dataIndex: 'Description', render: v => v || '-' },
    {
      title: 'Permissions',
      render: (_, r) => {
        const p = parsePerms(r.Permissions);
        const active = Object.entries(p).filter(([, v]) => v).map(([k]) => k);
        return (
          <Space wrap size={4}>
            {active.slice(0, 5).map(k => {
              const label = PERMISSION_GROUPS.flatMap(g => g.perms).find(p => p.key === k)?.label || k;
              return <Tag key={k} color="blue" style={{ fontSize: 9 }}>{label}</Tag>;
            })}
            {active.length > 5 && <Tag style={{ fontSize: 9 }}>+{active.length - 5} more</Tag>}
          </Space>
        );
      },
    },
    {
      title: 'Actions', width: 180,
      render: (_, r) => (
        <Space size={4}>
          <Tooltip title="Edit Role">
            <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)}
              disabled={r.Role_Name === 'Super Admin'} />
          </Tooltip>
          <Tooltip title="Copy permissions to new role">
            <Button size="small" icon={<CopyOutlined />} onClick={() => { openCreate(); copyFrom(r); }} />
          </Tooltip>
          {!isSystem(r) && (
            <Popconfirm title={`Delete role "${r.Role_Name}"?`}
              description="All users with this role must be reassigned first."
              onConfirm={() => deleteMutation.mutate(r.Role_ID)}
              okText="Delete" okButtonProps={{ danger: true }}>
              <Button size="small" danger icon={<DeleteOutlined />} />
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  const PermMatrix = () => (
    <div>
      {PERMISSION_GROUPS.map(group => (
        <div key={group.group} style={{ marginBottom: 16 }}>
          <Text strong style={{ fontSize: 12, color: '#B8860B' }}>{group.group}</Text>
          <Divider style={{ margin: '6px 0 10px' }} />
          <Row gutter={[8, 8]}>
            {group.perms.map(p => (
              <Col xs={12} key={p.key}>
                <div style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '6px 10px', borderRadius: 6,
                  background: permissions[p.key] ? '#FFF8E1' : '#fafafa',
                  border: `1px solid ${permissions[p.key] ? '#B8860B44' : '#f0f0f0'}`,
                }}>
                  <Text style={{ fontSize: 12 }}>{p.label}</Text>
                  <Switch size="small" checked={!!permissions[p.key]}
                    onChange={v => setPermissions(prev => ({ ...prev, [p.key]: v }))} />
                </div>
              </Col>
            ))}
          </Row>
        </div>
      ))}
      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
        <Button size="small" onClick={() => setPermissions(Object.fromEntries(ALL_PERM_KEYS.map(k => [k, true])))}>
          Select All
        </Button>
        <Button size="small" onClick={() => setPermissions({ ...DEFAULT_PERMISSIONS })}>
          Clear All
        </Button>
        <Text type="secondary" style={{ fontSize: 11, lineHeight: '24px' }}>
          {Object.values(permissions).filter(Boolean).length} / {ALL_PERM_KEYS.length} permissions enabled
        </Text>
      </div>
    </div>
  );

  return (
    <div className="page-wrapper">
      <div className="page-header">
        <div>
          <Title level={4} style={{ margin: 0 }}><SafetyOutlined style={{ color: '#B8860B', marginRight: 8 }} />Role Management</Title>
          <Text type="secondary" style={{ fontSize: 12 }}>Create and manage roles with granular permissions</Text>
        </div>
        <Button ref={createRoleRef} type="primary" icon={<PlusOutlined />}
          style={{ background: '#B8860B', borderColor: '#B8860B' }}
          onClick={openCreate}>
          Create Role
        </Button>
      </div>

      <Alert message="System roles (Super Admin, Client Admin) cannot be deleted. At least one Super Admin must always exist."
        type="info" showIcon style={{ marginBottom: 14, fontSize: 11 }} />

      <div ref={tableRef}>
      <Card style={{ borderRadius: 8, border: 'none' }} bodyStyle={{ padding: 0 }}>
        <Table
            scroll={{ x: "max-content" }} columns={columns} dataSource={roles || []} loading={isLoading}
          rowKey="Role_ID" size="small" pagination={false} />
      </Card>
      </div>

      <Modal
        title={editRole ? `✏️ Edit Role — ${editRole.Role_Name}` : '➕ Create New Role'}
        open={modalOpen} onCancel={closeModal} footer={null} width={680} destroyOnClose>
        {roles && (
          <div style={{ marginBottom: 12 }}>
            <Text style={{ fontSize: 12, color: '#888' }}>Copy permissions from: </Text>
            <Space wrap size={4} style={{ marginLeft: 8 }}>
              {(roles || []).map(r => (
                <Tag key={r.Role_ID} style={{ cursor: 'pointer' }} onClick={() => copyFrom(r)}>
                  <CopyOutlined /> {r.Role_Name}
                </Tag>
              ))}
            </Space>
          </div>
        )}
        <Form form={form} layout="vertical" onFinish={onFinish}>
          <Row gutter={14}>
            <Col xs={12}>
              <Form.Item name="Role_Name" label="Role Name" rules={[{ required: true }]}>
                <Input placeholder="e.g. Branch Manager" />
              </Form.Item>
            </Col>
            <Col xs={12}>
              <Form.Item name="Description" label="Description">
                <Input placeholder="Brief description of this role" />
              </Form.Item>
            </Col>
          </Row>
          <Divider>Permissions</Divider>
          <PermMatrix />
          <div style={{ marginTop: 16 }}>
            <Button type="primary" htmlType="submit" block size="large"
              loading={createMutation.isPending || updateMutation.isPending}
              style={{ background: '#B8860B', borderColor: '#B8860B', fontWeight: 700 }}>
              {editRole ? 'Save Role Changes' : 'Create Role'}
            </Button>
          </div>
        </Form>
      </Modal>

      <PageTour steps={tourSteps} />
    </div>
  );
}
