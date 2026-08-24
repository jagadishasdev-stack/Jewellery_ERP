/**
 * User Management — Complete
 * View all users with full details (no passwords shown — hashed only)
 * Actions: Add · Edit · Reset Password · Change Role · Lock · Unlock · Deactivate · Reactivate
 * Custom per-user permissions override
 */
import React, { useState, useRef } from 'react';
import {
  Table, Button, Card, Typography, Tag, Modal, Form, Input, Select,
  Switch, message, Avatar, Space, Popconfirm, Tooltip, Badge,
  Row, Col, Divider, Alert, Drawer, Descriptions, Statistic,
} from 'antd';
import {
  PlusOutlined, UserOutlined, EditOutlined, DeleteOutlined,
  LockOutlined, UnlockOutlined, SafetyOutlined, KeyOutlined,
  EyeOutlined, UserSwitchOutlined, CheckCircleOutlined,
  PhoneOutlined, MailOutlined, BranchesOutlined, ClockCircleOutlined,
  NumberOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { tenantApi } from '../../api/modules';
import { useAuthStore } from '../../store/authStore';
import PageTour from '../../components/PageTour';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
dayjs.extend(relativeTime);

const { Title, Text } = Typography;
const { Option } = Select;

const PERMISSION_KEYS = [
  { key: 'sales',                 label: 'Sales / Billing',        group: 'Operations' },
  { key: 'inventory',             label: 'Inventory / Stock',      group: 'Operations' },
  { key: 'karigar_management',    label: 'Karigar Management',     group: 'Operations' },
  { key: 'approval_management',   label: 'Approval Issue / Receive', group: 'Operations' },
  { key: 'accounts',              label: 'Accounts & Finance',     group: 'Operations' },
  { key: 'can_create',            label: 'Can Create Records',     group: 'Actions' },
  { key: 'can_edit',              label: 'Can Edit Records',       group: 'Actions' },
  { key: 'can_delete',            label: 'Can Delete Records',     group: 'Actions' },
  { key: 'audit',                 label: 'Audit Log Access',       group: 'Admin' },
  { key: 'tenant_management',     label: 'User & Role Mgmt',       group: 'Admin' },
  { key: 'global_master',         label: 'Super Admin Access',     group: 'Admin' },
  { key: 'edit_invoice_template', label: 'Invoice Studio',         group: 'Settings' },
  { key: 'open_customer_display', label: 'Customer Display',       group: 'Settings' },
];

const PERM_GROUPS = ['Operations', 'Actions', 'Admin', 'Settings'];

export default function UsersPage() {
  const { user: currentUser } = useAuthStore();
  const qc = useQueryClient();

  const [createOpen,      setCreateOpen]      = useState(false);
  const [editUser,        setEditUser]         = useState(null);
  const [resetPwdUser,    setResetPwdUser]     = useState(null);
  const [pinUser,         setPinUser]          = useState(null);
  const [changeRoleUser,  setChangeRoleUser]   = useState(null);
  const [permUser,        setPermUser]         = useState(null);
  const [detailUser,      setDetailUser]       = useState(null);
  const [customPerms,     setCustomPerms]      = useState({});

  const [createForm]    = Form.useForm();
  const [editForm]      = Form.useForm();
  const [resetPwdForm]  = Form.useForm();
  const [pinForm]       = Form.useForm();
  const [roleForm]      = Form.useForm();

  // ── Walkthrough tour refs ───────────────────────────────────────────────────
  const addUserRef = useRef(null);
  const tableRef = useRef(null);
  const tourSteps = [
    { title: '1. Add User', description: 'Click here to create a new staff login — set their name, username, password, and pick a Role (which decides what they can access).', target: () => addUserRef.current },
    { title: '2. Staff List', description: 'Every user in this tenant is listed here with their role, last login, and status (Active / Locked / Inactive).', target: () => tableRef.current },
    { title: '3. Row Actions', description: 'Use the icons on each row: the pencil to edit basic details, the key to reset a forgotten password, the switch-arrows icon to change their Role, and the shield icon to set one-off custom permissions that override the role for just this person.' },
    { title: '4. Lock & Deactivate', description: 'If a user is Locked (too many failed logins), an unlock icon appears. The trash icon Deactivates a user — they can no longer log in, but nothing is deleted, so they can be reactivated any time.' },
  ];

  // ── Queries ────────────────────────────────────────────────────────────
  const { data: users, isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: () => tenantApi.getUsers().then(r => r.data.data),
  });
  const { data: roles } = useQuery({
    queryKey: ['roles'],
    queryFn: () => tenantApi.getRoles().then(r => r.data.data),
  });
  const { data: branches } = useQuery({
    queryKey: ['branches'],
    queryFn: () => tenantApi.getBranches().then(r => r.data.data),
  });

  // ── Mutations ───────────────────────────────────────────────────────────
  const createMutation = useMutation({
    mutationFn: (d) => tenantApi.createUser(d),
    onSuccess: () => { message.success('✅ User created!'); qc.invalidateQueries(['users']); setCreateOpen(false); createForm.resetFields(); },
    onError: (err) => message.error(err.response?.data?.message || 'Failed to create user.'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => tenantApi.updateUser(id, data),
    onSuccess: () => { message.success('User updated!'); qc.invalidateQueries(['users']); setEditUser(null); },
    onError: (err) => message.error(err.response?.data?.message || 'Failed.'),
  });

  const resetPwdMutation = useMutation({
    mutationFn: ({ id, password }) => tenantApi.updateUser(id, { Password: password }),
    onSuccess: () => { message.success('✅ Password reset successfully!'); qc.invalidateQueries(['users']); setResetPwdUser(null); resetPwdForm.resetFields(); },
    onError: (err) => message.error(err.response?.data?.message || 'Failed.'),
  });

  const setPinMutation = useMutation({
    mutationFn: ({ id, pin }) => tenantApi.updateUser(id, { PIN: pin }),
    onSuccess: () => { message.success(pinForm.getFieldValue('pin') ? '✅ PIN set!' : 'PIN cleared.'); qc.invalidateQueries(['users']); setPinUser(null); pinForm.resetFields(); },
    onError: (err) => message.error(err.response?.data?.message || 'Failed.'),
  });

  const changeRoleMutation = useMutation({
    mutationFn: ({ id, roleId }) => tenantApi.updateUser(id, { Role_ID: roleId }),
    onSuccess: () => { message.success('Role changed!'); qc.invalidateQueries(['users']); setChangeRoleUser(null); },
    onError: (err) => message.error(err.response?.data?.message || 'Failed.'),
  });

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, active }) => tenantApi.updateUser(id, { Is_Active: active }),
    onSuccess: (_, { active }) => { message.success(active ? 'User activated!' : 'User deactivated.'); qc.invalidateQueries(['users']); },
    onError: (err) => message.error(err.response?.data?.message || 'Failed.'),
  });

  const unlockMutation = useMutation({
    mutationFn: (id) => tenantApi.unlockUser(id),
    onSuccess: () => { message.success('Account unlocked!'); qc.invalidateQueries(['users']); },
  });

  const permMutation = useMutation({
    mutationFn: ({ id, permissions }) => tenantApi.updateUserPermissions(id, permissions),
    onSuccess: () => { message.success('Custom permissions saved!'); qc.invalidateQueries(['users']); setPermUser(null); },
    onError: (err) => message.error(err.response?.data?.message || 'Failed.'),
  });

  // ── Helpers ─────────────────────────────────────────────────────────────
  const isLocked = (u) => u.Locked_Until && new Date(u.Locked_Until) > new Date();
  const isSelf = (u) => u.User_ID === currentUser?.userId;

  const openEdit = (u) => {
    setEditUser(u);
    editForm.setFieldsValue({
      Full_Name: u.Full_Name, Email: u.Email, Mobile: u.Mobile,
      Branch_ID: u.Branch_ID, Employee_Code: u.Employee_Code, Department: u.Department,
    });
  };

  const parsePerms = (raw) => {
    try { return raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : {}; } catch { return {}; }
  };

  // ── Table columns ────────────────────────────────────────────────────────
  const columns = [
    {
      title: 'User', fixed: 'left', width: 200,
      render: (_, r) => (
        <Space>
          <Avatar size={36}
            style={{ background: r.Is_Active ? (isLocked(r) ? '#fa8c16' : '#B8860B') : '#d9d9d9', cursor: 'pointer', fontSize: 14, fontWeight: 700 }}
            onClick={() => setDetailUser(r)}>
            {r.Full_Name?.charAt(0)?.toUpperCase() || 'U'}
          </Avatar>
          <div>
            <div>
              <Text strong style={{ fontSize: 13 }}>{r.Full_Name}</Text>
              {isSelf(r) && <Tag color="gold" style={{ fontSize: 9, marginLeft: 4 }}>You</Tag>}
            </div>
            <Text type="secondary" style={{ fontSize: 11 }}>@{r.Username}</Text>
          </div>
        </Space>
      ),
    },
    { title: 'Role', dataIndex: 'Role_Name', width: 130, render: v => <Tag color="blue">{v}</Tag> },
    { title: 'Mobile', dataIndex: 'Mobile', width: 120, render: v => v ? <Text style={{ fontSize: 12 }}>{v}</Text> : <Text type="secondary">-</Text> },
    { title: 'Email', dataIndex: 'Email', width: 180, render: v => v ? <Text style={{ fontSize: 12 }}>{v}</Text> : <Text type="secondary">-</Text> },
    {
      title: 'Last Login', dataIndex: 'Last_Login_Date', width: 120,
      render: v => v
        ? <Tooltip title={dayjs(v).format('DD-MMM-YYYY HH:mm:ss')}>
            <Text style={{ fontSize: 11, color: '#1890ff' }}>{dayjs(v).fromNow()}</Text>
          </Tooltip>
        : <Text type="secondary" style={{ fontSize: 11 }}>Never logged in</Text>,
    },
    {
      title: 'Status', width: 130,
      render: (_, r) => (
        <Space direction="vertical" size={2}>
          <Badge
            status={r.Is_Active ? (isLocked(r) ? 'warning' : 'success') : 'error'}
            text={<Text style={{ fontSize: 11 }}>{r.Is_Active ? (isLocked(r) ? 'Locked' : 'Active') : 'Inactive'}</Text>}
          />
          {r.Custom_Permissions && (
            <Tag color="purple" style={{ fontSize: 9 }} icon={<SafetyOutlined />}>Custom Perms</Tag>
          )}
        </Space>
      ),
    },
    {
      title: 'Actions', fixed: 'right', width: 240,
      render: (_, r) => (
        <Space size={3} wrap>
          {/* View */}
          <Tooltip title="View Details">
            <Button size="small" icon={<EyeOutlined />} onClick={() => setDetailUser(r)} />
          </Tooltip>

          {/* Edit */}
          <Tooltip title="Edit User">
            <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} />
          </Tooltip>

          {/* Reset Password */}
          <Tooltip title="Reset Password">
            <Button size="small" icon={<KeyOutlined />}
              style={{ borderColor: '#fa8c16', color: '#fa8c16' }}
              onClick={() => { setResetPwdUser(r); resetPwdForm.resetFields(); }} />
          </Tooltip>

          {/* Image App Staff PIN */}
          <Tooltip title={r.Has_Pin ? 'Change/Clear Image App PIN' : 'Set Image App PIN'}>
            <Button size="small" icon={<NumberOutlined />}
              style={{ borderColor: r.Has_Pin ? '#13c2c2' : '#8c8c8c', color: r.Has_Pin ? '#13c2c2' : '#8c8c8c' }}
              onClick={() => { setPinUser(r); pinForm.resetFields(); }} />
          </Tooltip>

          {/* Change Role */}
          <Tooltip title="Change Role">
            <Button size="small" icon={<UserSwitchOutlined />}
              style={{ borderColor: '#1890ff', color: '#1890ff' }}
              onClick={() => { setChangeRoleUser(r); roleForm.setFieldsValue({ Role_ID: r.Role_ID }); }} />
          </Tooltip>

          {/* Custom Permissions */}
          <Tooltip title="Custom Permissions">
            <Button size="small" icon={<SafetyOutlined />}
              style={{ borderColor: '#722ed1', color: '#722ed1' }}
              onClick={() => { setPermUser(r); setCustomPerms(parsePerms(r.Custom_Permissions)); }} />
          </Tooltip>

          {/* Unlock if locked */}
          {isLocked(r) && (
            <Tooltip title="Unlock Account">
              <Button size="small" icon={<UnlockOutlined />}
                style={{ borderColor: '#52c41a', color: '#52c41a' }}
                onClick={() => unlockMutation.mutate(r.User_ID)} />
            </Tooltip>
          )}

          {/* Activate / Deactivate */}
          {!isSelf(r) && (
            r.Is_Active
              ? <Popconfirm title={`Deactivate "${r.Full_Name}"?`}
                  description="User cannot log in until reactivated. Data is preserved."
                  onConfirm={() => toggleActiveMutation.mutate({ id: r.User_ID, active: false })}
                  okText="Deactivate" okButtonProps={{ danger: true }}>
                  <Tooltip title="Deactivate User">
                    <Button size="small" danger icon={<DeleteOutlined />} />
                  </Tooltip>
                </Popconfirm>
              : <Tooltip title="Reactivate User">
                  <Button size="small" icon={<CheckCircleOutlined />}
                    style={{ borderColor: '#52c41a', color: '#52c41a' }}
                    onClick={() => toggleActiveMutation.mutate({ id: r.User_ID, active: true })} />
                </Tooltip>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div className="page-wrapper">
      <div className="page-header">
        <div>
          <Title level={4} style={{ margin: 0 }}>👥 User Management</Title>
          <Space size={8} style={{ marginTop: 2 }}>
            <Badge color="green" text={<Text style={{ fontSize: 12 }}>{(users||[]).filter(u=>u.Is_Active).length} active</Text>} />
            <Badge color="red" text={<Text style={{ fontSize: 12 }}>{(users||[]).filter(u=>!u.Is_Active).length} inactive</Text>} />
            <Badge color="orange" text={<Text style={{ fontSize: 12 }}>{(users||[]).filter(u=>isLocked(u)).length} locked</Text>} />
          </Space>
        </div>
        <Button ref={addUserRef} type="primary" icon={<PlusOutlined />}
          style={{ background: '#B8860B', borderColor: '#B8860B' }}
          onClick={() => { setCreateOpen(true); createForm.resetFields(); }}>
          Add User
        </Button>
      </div>

      <div ref={tableRef}>
      <Card style={{ borderRadius: 8, border: 'none' }} bodyStyle={{ padding: 0 }}>
        <Table columns={columns} dataSource={users || []} loading={isLoading}
          rowKey="User_ID" size="small" scroll={{ x: 1100 }}
          rowClassName={r => !r.Is_Active ? 'ant-table-row-inactive' : ''}
          pagination={{ pageSize: 20, showTotal: t => `${t} users` }} />
      </Card>
      </div>

      <style>{`.ant-table-row-inactive td { opacity: 0.5; }`}</style>

      {/* ════════ User Detail Drawer ════════════════════════════════════ */}
      <Drawer title="User Details" open={!!detailUser} onClose={() => setDetailUser(null)}
        width={400} extra={<Button size="small" icon={<EditOutlined />} onClick={() => { openEdit(detailUser); setDetailUser(null); }}>Edit</Button>}>
        {detailUser && (
          <div>
            {/* Avatar + name */}
            <div style={{ textAlign: 'center', marginBottom: 20 }}>
              <Avatar size={64} style={{ background: detailUser.Is_Active ? '#B8860B' : '#d9d9d9', fontSize: 28, fontWeight: 700 }}>
                {detailUser.Full_Name?.charAt(0)?.toUpperCase()}
              </Avatar>
              <div style={{ marginTop: 10 }}>
                <Title level={5} style={{ margin: 0 }}>{detailUser.Full_Name}</Title>
                <Text type="secondary">@{detailUser.Username}</Text>
                <br />
                <Tag color="blue" style={{ marginTop: 4 }}>{detailUser.Role_Name}</Tag>
                <Tag color={detailUser.Is_Active ? (isLocked(detailUser) ? 'orange' : 'green') : 'red'}>
                  {detailUser.Is_Active ? (isLocked(detailUser) ? 'Locked' : 'Active') : 'Inactive'}
                </Tag>
              </div>
            </div>

            <Descriptions column={1} size="small" bordered>
              <Descriptions.Item label={<span><PhoneOutlined /> Mobile</span>}>
                {detailUser.Mobile || <Text type="secondary">Not set</Text>}
              </Descriptions.Item>
              <Descriptions.Item label={<span><MailOutlined /> Email</span>}>
                {detailUser.Email || <Text type="secondary">Not set</Text>}
              </Descriptions.Item>
              <Descriptions.Item label={<span><BranchesOutlined /> Branch</span>}>
                {detailUser.Branch_ID || <Text type="secondary">All branches</Text>}
              </Descriptions.Item>
              <Descriptions.Item label="Employee Code">
                {detailUser.Employee_Code || <Text type="secondary">Not set</Text>}
              </Descriptions.Item>
              <Descriptions.Item label="Department">
                {detailUser.Department || <Text type="secondary">Not set</Text>}
              </Descriptions.Item>
              <Descriptions.Item label="Password">
                <Text style={{ color: '#888', fontFamily: 'monospace' }}>
                  {'●'.repeat(12)} <Tag style={{ fontSize: 9 }}>bcrypt hashed</Tag>
                </Text>
              </Descriptions.Item>
              <Descriptions.Item label={<span><ClockCircleOutlined /> Last Login</span>}>
                {detailUser.Last_Login_Date
                  ? <><Text>{dayjs(detailUser.Last_Login_Date).format('DD-MMM-YYYY HH:mm')}</Text>
                      <br /><Text type="secondary" style={{ fontSize: 11 }}>{dayjs(detailUser.Last_Login_Date).fromNow()}</Text></>
                  : <Text type="secondary">Never logged in</Text>}
              </Descriptions.Item>
              <Descriptions.Item label="Created">
                {detailUser.Created_Date ? dayjs(detailUser.Created_Date).format('DD-MMM-YYYY') : '-'}
              </Descriptions.Item>
              {isLocked(detailUser) && (
                <Descriptions.Item label="Locked Until">
                  <Tag color="orange">{dayjs(detailUser.Locked_Until).format('DD-MMM HH:mm')}</Tag>
                  <Button size="small" type="link" onClick={() => { unlockMutation.mutate(detailUser.User_ID); setDetailUser(null); }}>
                    Unlock Now
                  </Button>
                </Descriptions.Item>
              )}
            </Descriptions>

            {/* Quick actions */}
            <Divider style={{ margin: '16px 0 12px' }} />
            <Text strong style={{ fontSize: 12 }}>Quick Actions</Text>
            <Row gutter={[8, 8]} style={{ marginTop: 8 }}>
              <Col xs={12}>
                <Button block size="small" icon={<KeyOutlined />}
                  style={{ borderColor: '#fa8c16', color: '#fa8c16' }}
                  onClick={() => { setResetPwdUser(detailUser); setDetailUser(null); }}>
                  Reset Password
                </Button>
              </Col>
              <Col xs={12}>
                <Button block size="small" icon={<UserSwitchOutlined />}
                  style={{ borderColor: '#1890ff', color: '#1890ff' }}
                  onClick={() => { setChangeRoleUser(detailUser); roleForm.setFieldsValue({ Role_ID: detailUser.Role_ID }); setDetailUser(null); }}>
                  Change Role
                </Button>
              </Col>
              <Col xs={12}>
                <Button block size="small" icon={<SafetyOutlined />}
                  style={{ borderColor: '#722ed1', color: '#722ed1' }}
                  onClick={() => { setPermUser(detailUser); setCustomPerms(parsePerms(detailUser.Custom_Permissions)); setDetailUser(null); }}>
                  Permissions
                </Button>
              </Col>
              {!isSelf(detailUser) && (
                <Col xs={12}>
                  <Button block size="small"
                    danger={detailUser.Is_Active}
                    style={!detailUser.Is_Active ? { borderColor: '#52c41a', color: '#52c41a' } : {}}
                    icon={detailUser.Is_Active ? <DeleteOutlined /> : <CheckCircleOutlined />}
                    onClick={() => {
                      Modal.confirm({
                        title: detailUser.Is_Active ? `Deactivate ${detailUser.Full_Name}?` : `Reactivate ${detailUser.Full_Name}?`,
                        onOk: () => { toggleActiveMutation.mutate({ id: detailUser.User_ID, active: !detailUser.Is_Active }); setDetailUser(null); },
                      });
                    }}>
                    {detailUser.Is_Active ? 'Deactivate' : 'Reactivate'}
                  </Button>
                </Col>
              )}
            </Row>
          </div>
        )}
      </Drawer>

      {/* ════════ Add User Modal ════════════════════════════════════════ */}
      <Modal title="➕ Add New User" open={createOpen}
        onCancel={() => { setCreateOpen(false); createForm.resetFields(); }}
        footer={null} width={580} destroyOnClose>
        <Form form={createForm} layout="vertical" onFinish={v => createMutation.mutate(v)}
          onFinishFailed={({ errorFields }) => message.error(`Fix: ${errorFields.map(f=>f.name[0]).join(', ')}`)}>
          <Row gutter={14}>
            <Col xs={12}><Form.Item name="Full_Name" label="Full Name" rules={[{required:true}]}><Input /></Form.Item></Col>
            <Col xs={12}><Form.Item name="Username" label="Username" rules={[{required:true,message:'Username required'},{min:3,message:'Min 3 chars'}]}>
              <Input placeholder="e.g. ravi01" />
            </Form.Item></Col>
          </Row>
          <Row gutter={14}>
            <Col xs={12}><Form.Item name="Password" label="Password" rules={[{required:true,min:8,message:'Min 8 characters'}]}>
              <Input.Password placeholder="Min 8 characters" />
            </Form.Item></Col>
            <Col xs={12}><Form.Item name="Role_ID" label="Role" rules={[{required:true}]}>
              <Select placeholder="Select role">
                {(roles||[]).map(r=><Option key={r.Role_ID} value={r.Role_ID}>{r.Role_Name}</Option>)}
              </Select>
            </Form.Item></Col>
          </Row>
          <Row gutter={14}>
            <Col xs={12}><Form.Item name="Mobile" label="Mobile"><Input /></Form.Item></Col>
            <Col xs={12}><Form.Item name="Email" label="Email"><Input type="email" /></Form.Item></Col>
          </Row>
          <Row gutter={14}>
            <Col xs={10}><Form.Item name="Branch_ID" label="Branch">
              <Select allowClear placeholder="All branches">
                {(branches||[]).map(b=><Option key={b.Branch_ID} value={b.Branch_ID}>{b.Branch_Name}</Option>)}
              </Select>
            </Form.Item></Col>
            <Col xs={7}><Form.Item name="Employee_Code" label="Employee Code"><Input placeholder="EMP001" /></Form.Item></Col>
            <Col xs={7}><Form.Item name="Department" label="Department"><Input placeholder="Sales" /></Form.Item></Col>
          </Row>
          <Button type="primary" htmlType="submit" block size="large" loading={createMutation.isPending}
            style={{ background:'#B8860B', borderColor:'#B8860B', fontWeight:700 }}>
            Create User
          </Button>
        </Form>
      </Modal>

      {/* ════════ Edit User Modal ════════════════════════════════════════ */}
      <Modal title={`✏️ Edit — ${editUser?.Full_Name}`} open={!!editUser}
        onCancel={() => setEditUser(null)} footer={null} width={560} destroyOnClose>
        <Alert message="Passwords are not shown here. Use 'Reset Password' to change a password." type="info" showIcon style={{ marginBottom: 14, fontSize: 11 }} />
        <Form form={editForm} layout="vertical"
          onFinish={v => updateMutation.mutate({ id: editUser.User_ID, data: v })}>
          <Row gutter={14}>
            <Col xs={14}><Form.Item name="Full_Name" label="Full Name" rules={[{required:true}]}><Input /></Form.Item></Col>
            <Col xs={10}><Form.Item name="Mobile" label="Mobile"><Input /></Form.Item></Col>
          </Row>
          <Form.Item name="Email" label="Email"><Input type="email" /></Form.Item>
          <Row gutter={14}>
            <Col xs={10}><Form.Item name="Branch_ID" label="Branch">
              <Select allowClear>{(branches||[]).map(b=><Option key={b.Branch_ID} value={b.Branch_ID}>{b.Branch_Name}</Option>)}</Select>
            </Form.Item></Col>
            <Col xs={7}><Form.Item name="Employee_Code" label="Employee Code"><Input /></Form.Item></Col>
            <Col xs={7}><Form.Item name="Department" label="Department"><Input /></Form.Item></Col>
          </Row>
          <Button type="primary" htmlType="submit" block loading={updateMutation.isPending}
            style={{ background:'#B8860B', borderColor:'#B8860B', fontWeight:700 }}>
            Save Changes
          </Button>
        </Form>
      </Modal>

      {/* ════════ Reset Password Modal ══════════════════════════════════ */}
      <Modal title={`🔑 Reset Password — ${resetPwdUser?.Full_Name}`} open={!!resetPwdUser}
        onCancel={() => { setResetPwdUser(null); resetPwdForm.resetFields(); }}
        footer={null} width={420} destroyOnClose>
        <Alert message="The existing password is hashed and cannot be viewed. You can only set a new password." type="warning" showIcon style={{ marginBottom: 14, fontSize: 11 }} />
        <Form form={resetPwdForm} layout="vertical"
          onFinish={v => {
            if (v.newPassword !== v.confirmPassword) { message.error('Passwords do not match!'); return; }
            resetPwdMutation.mutate({ id: resetPwdUser.User_ID, password: v.newPassword });
          }}>
          <Form.Item name="newPassword" label="New Password"
            rules={[{ required: true, min: 8, message: 'Min 8 characters' }]}>
            <Input.Password placeholder="Min 8 characters" />
          </Form.Item>
          <Form.Item name="confirmPassword" label="Confirm New Password"
            rules={[{ required: true, message: 'Please confirm the password' }]}>
            <Input.Password placeholder="Re-enter new password" />
          </Form.Item>
          <Button type="primary" htmlType="submit" block loading={resetPwdMutation.isPending}
            style={{ background:'#fa8c16', borderColor:'#fa8c16', fontWeight:700 }}>
            🔑 Reset Password
          </Button>
        </Form>
      </Modal>

      {/* ════════ Image App Staff PIN Modal ═══════════════════════════════ */}
      <Modal title={`🔢 Image App PIN — ${pinUser?.Full_Name}`} open={!!pinUser}
        onCancel={() => { setPinUser(null); pinForm.resetFields(); }}
        footer={null} width={420} destroyOnClose>
        <Alert
          message="What this is for"
          description="Lets this person identify themselves on the Image App (a shared shop tablet) without a full username/password login every time it changes hands — pick your name, enter this PIN, and every stock edit/image upload is attributed to them by name instead of just the device."
          type="info" showIcon style={{ marginBottom: 14, fontSize: 11 }}
        />
        <Form form={pinForm} layout="vertical"
          onFinish={v => {
            if (v.pin && v.pin !== v.confirmPin) { message.error('PINs do not match!'); return; }
            setPinMutation.mutate({ id: pinUser.User_ID, pin: v.pin || null });
          }}>
          <Form.Item name="pin" label="New PIN (4-6 digits)"
            rules={[{ pattern: /^\d{4,6}$/, message: '4-6 digits only' }]}>
            <Input.Password placeholder="e.g. 1234" maxLength={6} />
          </Form.Item>
          <Form.Item name="confirmPin" label="Confirm PIN"
            dependencies={['pin']}
            rules={[{ pattern: /^\d{4,6}$/, message: '4-6 digits only' }]}>
            <Input.Password placeholder="Re-enter PIN" maxLength={6} />
          </Form.Item>
          <Space style={{ width: '100%' }} direction="vertical">
            <Button type="primary" htmlType="submit" block loading={setPinMutation.isPending}
              style={{ background:'#13c2c2', borderColor:'#13c2c2', fontWeight:700 }}>
              🔢 Save PIN
            </Button>
            {pinUser?.Has_Pin && (
              <Popconfirm title="Clear this PIN?" description="They won't be able to identify themselves on the Image App until a new PIN is set."
                onConfirm={() => setPinMutation.mutate({ id: pinUser.User_ID, pin: null })}>
                <Button block danger>Clear Existing PIN</Button>
              </Popconfirm>
            )}
          </Space>
        </Form>
      </Modal>

      {/* ════════ Change Role Modal ══════════════════════════════════════ */}
      <Modal title={`👤 Change Role — ${changeRoleUser?.Full_Name}`} open={!!changeRoleUser}
        onCancel={() => setChangeRoleUser(null)} footer={null} width={380} destroyOnClose>
        <Alert message={`Current role: ${changeRoleUser?.Role_Name}`} type="info" showIcon style={{ marginBottom: 14, fontSize: 11 }} />
        <Form form={roleForm} layout="vertical"
          onFinish={v => changeRoleMutation.mutate({ id: changeRoleUser.User_ID, roleId: v.Role_ID })}>
          <Form.Item name="Role_ID" label="Select New Role" rules={[{ required: true }]}>
            <Select size="large">
              {(roles||[]).map(r => <Option key={r.Role_ID} value={r.Role_ID}>
                {r.Role_Name} {r.Role_ID === changeRoleUser?.Role_ID && <Tag style={{fontSize:9}}>current</Tag>}
              </Option>)}
            </Select>
          </Form.Item>
          <Button type="primary" htmlType="submit" block loading={changeRoleMutation.isPending}
            style={{ background:'#1890ff', borderColor:'#1890ff', fontWeight:700 }}>
            Change Role
          </Button>
        </Form>
      </Modal>

      {/* ════════ Custom Permissions Modal ══════════════════════════════ */}
      <Modal title={`🔐 Custom Permissions — ${permUser?.Full_Name}`}
        open={!!permUser} onCancel={() => setPermUser(null)} width={540} destroyOnClose
        onOk={() => permMutation.mutate({ id: permUser.User_ID, permissions: customPerms })}
        okText="Save Permissions"
        okButtonProps={{ style:{ background:'#B8860B', borderColor:'#B8860B' }, loading: permMutation.isPending }}>
        {permUser && (() => {
          const rolePerms = parsePerms(permUser.Role_Permissions);
          return (
            <>
              <Alert message={`Role "${permUser.Role_Name}" permissions are shown below. Toggle to override for this user only.`}
                type="info" showIcon style={{ marginBottom: 14, fontSize: 11 }} />
              {PERM_GROUPS.map(group => (
                <div key={group} style={{ marginBottom: 14 }}>
                  <Text strong style={{ fontSize: 12, color: '#B8860B' }}>{group}</Text>
                  <Divider style={{ margin: '4px 0 8px' }} />
                  {PERMISSION_KEYS.filter(p => p.group === group).map(p => {
                    const fromRole = !!rolePerms[p.key];
                    const custom = customPerms[p.key];
                    const effective = custom !== undefined ? custom : fromRole;
                    return (
                      <div key={p.key} style={{
                        display:'flex', justifyContent:'space-between', alignItems:'center',
                        padding:'6px 0', borderBottom:'1px solid #f5f5f5',
                        background: custom !== undefined && custom !== fromRole ? '#FFF8E1' : 'transparent',
                      }}>
                        <div>
                          <Text style={{ fontSize: 12 }}>{p.label}</Text>
                          {fromRole && custom === undefined && <Tag color="blue" style={{ fontSize: 9, marginLeft: 6 }}>From Role</Tag>}
                          {custom !== undefined && custom !== fromRole && <Tag color="orange" style={{ fontSize: 9, marginLeft: 6 }}>Overridden</Tag>}
                        </div>
                        <Switch size="small" checked={effective}
                          onChange={v => setCustomPerms(prev => ({ ...prev, [p.key]: v }))} />
                      </div>
                    );
                  })}
                </div>
              ))}
              <Button size="small" type="link" danger onClick={() => setCustomPerms({})}>
                Reset to Role Defaults
              </Button>
            </>
          );
        })()}
      </Modal>

      <PageTour steps={tourSteps} />
    </div>
  );
}
