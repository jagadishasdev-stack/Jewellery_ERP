/**
 * Tenant Management — ERP Provider / Super Admin Panel
 * Full CRUD: Create · View · Edit · Deactivate · Module Control
 *
 * ROOT CAUSE FIX: Multi-step form inside single <Form> causes ALL fields to
 * validate on submit even if they are not visible. Solution: collect step data
 * in local state, merge on final submit — no shared Form instance across steps.
 */
import React, { useState, useRef } from 'react';
import {
  Table, Button, Card, Typography, Tag, Space, Modal, Form,
  Input, DatePicker, InputNumber, message, Descriptions, Select,
  Row, Col, Alert, Switch, Divider, Tooltip, Popconfirm, Badge, Steps, Avatar,
} from 'antd';
import {
  PlusOutlined, EyeOutlined, EditOutlined, DeleteOutlined,
  ApiOutlined, CheckCircleOutlined, InfoCircleOutlined,
  TeamOutlined, KeyOutlined, UserOutlined, LockOutlined, UnlockOutlined,
  ControlOutlined, ApartmentOutlined, MessageOutlined, BellOutlined, CreditCardOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { tenantApi, superAdminApi, smsApi, pushApi } from '../../api/modules';
import api from '../../api/axios';
import PageTour from '../../components/PageTour';
import { STANDARD_ACTIONS, ACTION_LABELS, DEFAULT_SHORTCUTS } from '../../utils/shortcuts';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
dayjs.extend(relativeTime);

const { Title, Text } = Typography;
const { Option } = Select;

// ── Constants ─────────────────────────────────────────────────────────────────
const BUSINESS_TYPES = [
  { key: 'RETAILER',     color: '#B8860B', label: '🏪 Retailer',     desc: 'Retail shop selling directly to end customers' },
  { key: 'WHOLESALER',   color: '#1890ff', label: '🏭 Wholesaler',    desc: 'Bulk sales to dealers / retailers' },
  { key: 'MANUFACTURER', color: '#52c41a', label: '⚙️ Manufacturer',  desc: 'Goldsmith & karigar manufacturing workflow' },
  { key: 'HYBRID',       color: '#722ed1', label: '💎 Hybrid',        desc: 'All modules — Retail + Wholesale + Manufacturing' },
];

const MODULE_GROUPS = {
  Core:          ['dashboard','masters','settings'],
  Inventory:     ['inventory','stock_transfer','barcode'],
  Sales:         ['retail_sales','wholesale_sales','estimate','order_booking','sales_return'],
  Purchase:      ['purchase','old_gold'],
  Manufacturing: ['goldsmith','manufacturing','job_work','repair'],
  CRM:           ['customers','dealers'],
  Schemes:       ['savings_scheme','digi_gold','lucky_draw'],
  Accounts:      ['accounts','day_close'],
  Reports:       ['reports','gst_reports'],
  Operations:    ['floors','invoice_studio'],
};

const GROUP_COLOR = {
  Core:'#888', Inventory:'#52c41a', Sales:'#B8860B', Purchase:'#fa8c16',
  Manufacturing:'#ff4d4f', CRM:'#1890ff', Schemes:'#722ed1',
  Accounts:'#13c2c2', Reports:'#eb2f96', Operations:'#555',
};

// The one standard admin credential handed to every newly onboarded
// tenant — pre-filled here so it's not retyped each time, still fully
// editable. Must match the exact value tenant.js's create-tenant route
// exempts from its normal 8-character minimum.
const PLATFORM_DEFAULT_ADMIN_USERNAME = 'Jagdish';
const PLATFORM_DEFAULT_ADMIN_PASSWORD = 'Jsphere';

export default function TenantManagePage() {
  const qc = useQueryClient();

  // ── Walkthrough tour refs ───────────────────────────────────────────────────
  const createButtonRef = useRef(null);
  const summaryRef = useRef(null);
  const tableRef = useRef(null);
  const tourSteps = [
    { title: '1. Create Tenant', description: 'Click here to onboard a new client shop. It opens a 3-step wizard: pick a Business Type, enter Company Info (including the License Key & expiry), then create that tenant\'s first Admin User.', target: () => createButtonRef.current },
    { title: '2. License Overview', description: 'A quick glance at how many tenants are Active, expiring within 30 days, or already Expired — expiring/expired tenants should be renewed to avoid locking their shop out.', target: () => summaryRef.current },
    { title: '3. Tenant List', description: 'Every registered tenant is listed here with its license expiry date — colored green (active), orange (expiring soon), or red (expired).', target: () => tableRef.current },
    { title: '4. Row Actions', description: 'Use the icons on each row: the eye to view full details, the pencil to edit company info, the plug icon to enable/disable ERP modules (Inventory, Sales, Manufacturing etc.), and the people icon to manage that tenant\'s users, reset their passwords, or unlock locked accounts.' },
    { title: '5. License Key', description: 'The License Key you set in Step 2 of the wizard controls that tenant\'s access — set an Expiry Date there too. Renewing later is done from the Edit action on that tenant\'s row.' },
    { title: '6. Deactivate vs Delete', description: 'There is no permanent delete — the red icon Deactivates a tenant (its users can no longer log in, but all data is preserved), and it can always be Reactivated later.' },
  ];

  // Modal states
  const [createOpen,   setCreateOpen]   = useState(false);
  const [editTenant,   setEditTenant]   = useState(null);
  const [moduleTenant, setModuleTenant] = useState(null);
  const [shortcutTenant, setShortcutTenant] = useState(null);
  const [shortcutValues, setShortcutValues] = useState({});
  const [shortcutsLoading, setShortcutsLoading] = useState(false);
  const [detailTenant, setDetailTenant] = useState(null);

  // Branch management state (Super Admin creates/edits branches for a tenant)
  const [branchTenant, setBranchTenant] = useState(null);
  const [branches, setBranches] = useState([]);
  const [branchesLoading, setBranchesLoading] = useState(false);
  const [editingBranch, setEditingBranch] = useState(null); // null = "add new"
  const [branchFormOpen, setBranchFormOpen] = useState(false);
  const [branchForm] = Form.useForm();

  // SMS gateway/template management state (Super Admin only — Sender ID /
  // DLT Entity ID / template IDs are compliance-sensitive registrations)
  const [smsTenant, setSmsTenant] = useState(null);
  const [smsGateway, setSmsGateway] = useState(null);
  const [smsTemplates, setSmsTemplates] = useState([]);
  const [smsLoading, setSmsLoading] = useState(false);
  const [smsGatewayForm] = Form.useForm();
  const [smsTemplateFormOpen, setSmsTemplateFormOpen] = useState(false);
  const [editingSmsTemplate, setEditingSmsTemplate] = useState(null);
  const [smsTemplateForm] = Form.useForm();

  // Push notification (Firebase Admin SDK) management state — same
  // Super-Admin-only, tenant-then-global-fallback pattern as SMS.
  const [pushTenant, setPushTenant] = useState(null);
  const [pushGateway, setPushGateway] = useState(null);
  const [pushLoading, setPushLoading] = useState(false);
  const [pushForm] = Form.useForm();
  const [testDeviceToken, setTestDeviceToken] = useState('');

  // Payment gateway (Razorpay) management state — same pattern again: one
  // real merchant key/secret + webhook secret per tenant, secrets masked,
  // Super-Admin-only.
  const [payTenant, setPayTenant] = useState(null);
  const [payGateway, setPayGateway] = useState(null);
  const [payLoading, setPayLoading] = useState(false);
  const [payForm] = Form.useForm();

  // Create wizard state — 3 separate Form instances, data merged on submit
  const [wizardStep,  setWizardStep]  = useState(0);
  const [btSelected,  setBtSelected]  = useState('HYBRID');
  const [step1Data,   setStep1Data]   = useState(null); // company info
  const [step1Form]  = Form.useForm();
  const [step2Form]  = Form.useForm();
  const [editForm]   = Form.useForm();

  // Module management state
  const [tenantModules, setTenantModules] = useState([]);
  const [modulesLoading, setModulesLoading] = useState(false);

  // Tenant users state (SA cross-tenant user management)
  const [usersTenant,       setUsersTenant]       = useState(null);
  const [tenantUsers,       setTenantUsers]       = useState([]);
  const [tenantUsersLoading, setTenantUsersLoading] = useState(false);
  const [resetPwdTarget,    setResetPwdTarget]    = useState(null); // { tenant, user }
  const [resetPwdForm]                            = Form.useForm();

  // ── Queries ─────────────────────────────────────────────────────────────
  const { data: tenants, isLoading } = useQuery({
    queryKey: ['tenants-all'],
    queryFn: () => tenantApi.getAllTenants().then(r => r.data.data),
  });

  // ── Mutations ────────────────────────────────────────────────────────────
  const createMutation = useMutation({
    mutationFn: (data) => {
      console.log('[TenantCreate] Sending to API:', data);
      return tenantApi.createTenant(data);
    },
    onSuccess: (res) => {
      console.log('[TenantCreate] Success:', res.data);
      message.success(`✅ Tenant "${res.data.data?.tenantId}" created!`);
      qc.invalidateQueries(['tenants-all']);
      closeCreateModal();
    },
    onError: (err) => {
      console.error('[TenantCreate] Error:', err.response?.data || err.message);
      message.error(err.response?.data?.message || 'Failed to create tenant.');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => api.put(`/super-admin/tenant/${id}/settings`, data),
    onSuccess: () => { message.success('Tenant updated!'); qc.invalidateQueries(['tenants-all']); setEditTenant(null); },
    onError: (err) => message.error(err.response?.data?.message || 'Failed.'),
  });

  const deactivateMutation = useMutation({
    mutationFn: ({ id, active }) => api.put(`/super-admin/tenant/${id}/settings`, { Is_Active: active }),
    onSuccess: (_, { active }) => {
      message.success(active ? 'Tenant activated.' : 'Tenant deactivated.');
      qc.invalidateQueries(['tenants-all']);
    },
    onError: (err) => message.error(err.response?.data?.message || 'Failed.'),
  });

  const toggleModuleMutation = useMutation({
    mutationFn: ({ tenantId, key, enabled }) =>
      api.post('/super-admin/tenant-module-toggle', { tenantId, moduleKey: key, enabled }),
    onSuccess: (_, { key, enabled }) => {
      setTenantModules(prev => prev.map(m => m.Module_Key === key ? { ...m, Is_Enabled: enabled } : m));
      message.success(`Module "${key}" ${enabled ? 'enabled' : 'disabled'}.`);
    },
    onError: (err) => message.error(err.response?.data?.message || 'Failed.'),
  });

  const provisionMutation = useMutation({
    mutationFn: ({ tenantId, businessType }) =>
      api.post('/super-admin/tenant-provision', { tenantId, businessType }),
    onSuccess: (res) => {
      message.success(res.data.message);
      fetchTenantModules(moduleTenant.Tenant_ID);
      qc.invalidateQueries(['tenants-all']);
    },
    onError: (err) => message.error(err.response?.data?.message || 'Failed.'),
  });

  const resetTenantPwdMutation = useMutation({
    mutationFn: ({ tenantId, userId, newPassword }) =>
      superAdminApi.resetTenantUserPassword(tenantId, userId, newPassword),
    onSuccess: () => {
      message.success('✅ Password reset successfully!');
      setResetPwdTarget(null);
      resetPwdForm.resetFields();
    },
    onError: (err) => message.error(err.response?.data?.message || 'Failed to reset password.'),
  });

  const toggleTenantUserMutation = useMutation({
    mutationFn: ({ tenantId, userId, active }) =>
      superAdminApi.updateTenantUser(tenantId, userId, { Is_Active: active }),
    onSuccess: (_, vars) => {
      message.success(vars.active ? 'User activated.' : 'User deactivated.');
      if (usersTenant) fetchUsers(usersTenant);
    },
    onError: (err) => message.error(err.response?.data?.message || 'Failed.'),
  });

  // ── Helpers ──────────────────────────────────────────────────────────────
  const closeCreateModal = () => {
    setCreateOpen(false);
    setWizardStep(0);
    setBtSelected('HYBRID');
    setStep1Data(null);
    step1Form.resetFields();
    step2Form.resetFields();
  };

  const fetchTenantModules = async (tenantId) => {
    setModulesLoading(true);
    try {
      const res = await api.get(`/super-admin/tenant/${tenantId}/modules`);
      setTenantModules(res.data.data || []);
    } catch (err) {
      console.error('Failed to fetch modules:', err.message);
      setTenantModules([]);
    } finally {
      setModulesLoading(false);
    }
  };

  const openModules = (tenant) => {
    setModuleTenant(tenant);
    fetchTenantModules(tenant.Tenant_ID);
  };

  const openShortcuts = async (tenant) => {
    setShortcutTenant(tenant);
    setShortcutsLoading(true);
    try {
      const res = await superAdminApi.getTenantShortcuts(tenant.Tenant_ID);
      setShortcutValues(res.data.data.resolved);
    } catch (err) {
      message.error('Failed to load shortcuts: ' + err.message);
      setShortcutValues(DEFAULT_SHORTCUTS);
    } finally {
      setShortcutsLoading(false);
    }
  };

  const updateShortcutsMutation = useMutation({
    mutationFn: ({ tenantId, overrides }) => superAdminApi.updateTenantShortcuts(tenantId, overrides),
    onSuccess: (res) => {
      message.success('Shortcut keys updated — every user of this tenant sees the new keys immediately.');
      setShortcutValues(res.data.data);
    },
    onError: (err) => message.error(err.response?.data?.message || 'Failed to update shortcuts.'),
  });

  const fetchBranches = async (tenant) => {
    setBranchTenant(tenant);
    setBranchesLoading(true);
    try {
      const res = await api.get('/tenant/branches', { params: { tenantId: tenant.Tenant_ID, includeInactive: true } });
      setBranches(res.data.data || []);
    } catch (err) {
      message.error('Failed to load branches: ' + err.message);
      setBranches([]);
    } finally {
      setBranchesLoading(false);
    }
  };

  const openAddBranch = () => {
    setEditingBranch(null);
    branchForm.resetFields();
    setBranchFormOpen(true);
  };

  const openEditBranch = (branch) => {
    setEditingBranch(branch);
    branchForm.setFieldsValue({
      branchName: branch.Branch_Name,
      branchCode: branch.Branch_Code,
      address1: branch.Address_Line1,
      address2: branch.Address_Line2,
      city: branch.City,
      state: branch.State,
      pincode: branch.Pincode,
      phone: branch.Phone,
      email: branch.Email,
      gstNo: branch.GST_No,
    });
    setBranchFormOpen(true);
  };

  const createBranchMutation = useMutation({
    mutationFn: (data) => api.post('/tenant/branches', { ...data, tenantId: branchTenant.Tenant_ID }),
    onSuccess: () => {
      message.success('Branch created.');
      setBranchFormOpen(false);
      fetchBranches(branchTenant);
      qc.invalidateQueries(['tenants-all']);
    },
    onError: (err) => message.error(err.response?.data?.message || 'Failed to create branch.'),
  });

  const updateBranchMutation = useMutation({
    mutationFn: ({ id, data }) => api.put(`/tenant/branches/${id}`, data),
    onSuccess: () => {
      message.success('Branch updated.');
      setBranchFormOpen(false);
      fetchBranches(branchTenant);
    },
    onError: (err) => message.error(err.response?.data?.message || 'Failed to update branch.'),
  });

  const handleBranchSubmit = (values) => {
    if (editingBranch) updateBranchMutation.mutate({ id: editingBranch.Branch_ID, data: values });
    else createBranchMutation.mutate(values);
  };

  const toggleBranchActiveMutation = useMutation({
    mutationFn: ({ id, isActive }) => api.put(`/tenant/branches/${id}`, { isActive }),
    onSuccess: (_, { isActive }) => {
      message.success(isActive ? 'Branch reactivated.' : 'Branch deactivated.');
      fetchBranches(branchTenant);
    },
    onError: (err) => message.error(err.response?.data?.message || 'Failed to update branch status.'),
  });

  const fetchSmsConfig = async (tenant) => {
    setSmsTenant(tenant);
    setSmsLoading(true);
    try {
      const [gwRes, tplRes] = await Promise.all([
        smsApi.getGatewayConfig({ tenantId: tenant.Tenant_ID }),
        smsApi.getTemplates({ tenantId: tenant.Tenant_ID }),
      ]);
      setSmsGateway(gwRes.data.data);
      smsGatewayForm.setFieldsValue({
        Provider: gwRes.data.data?.Provider || 'asterix',
        Api_Base_Url: gwRes.data.data?.Api_Base_Url,
        Api_User: gwRes.data.data?.Api_User,
        Api_Key: '', // never prefilled — blank means "keep unchanged" on save
        Sender_Id: gwRes.data.data?.Sender_Id,
        Entity_Id: gwRes.data.data?.Entity_Id,
        Account_Usage: gwRes.data.data?.Account_Usage || '1',
        Is_Active: gwRes.data.data?.Is_Active !== false,
      });
      setSmsTemplates(tplRes.data.data || []);
    } catch (err) {
      message.error('Failed to load SMS config: ' + err.message);
      setSmsGateway(null);
      setSmsTemplates([]);
    } finally {
      setSmsLoading(false);
    }
  };

  const saveSmsGatewayMutation = useMutation({
    mutationFn: (values) => smsApi.saveGatewayConfig(
      { ...values, Api_Key: values.Api_Key || undefined },
      { tenantId: smsTenant.Tenant_ID },
    ),
    onSuccess: () => {
      message.success('SMS gateway config saved — this tenant now uses its own account, not the shared default.');
      fetchSmsConfig(smsTenant);
    },
    onError: (err) => message.error(err.response?.data?.message || 'Failed to save SMS gateway config.'),
  });

  const openAddSmsTemplate = () => {
    setEditingSmsTemplate(null);
    smsTemplateForm.resetFields();
    smsTemplateForm.setFieldsValue({ Purpose: 'OTP' });
    setSmsTemplateFormOpen(true);
  };

  const openEditSmsTemplate = (tpl) => {
    setEditingSmsTemplate(tpl);
    smsTemplateForm.setFieldsValue({
      Purpose: tpl.Purpose, Dlt_Template_Id: tpl.Dlt_Template_Id, Template_Text: tpl.Template_Text,
    });
    setSmsTemplateFormOpen(true);
  };

  const saveSmsTemplateMutation = useMutation({
    mutationFn: (values) => smsApi.saveTemplate(values, { tenantId: smsTenant.Tenant_ID }),
    onSuccess: () => {
      message.success('SMS template saved.');
      setSmsTemplateFormOpen(false);
      fetchSmsConfig(smsTenant);
    },
    onError: (err) => message.error(err.response?.data?.message || 'Failed to save SMS template.'),
  });

  const fetchPushConfig = async (tenant) => {
    setPushTenant(tenant);
    setPushLoading(true);
    setTestDeviceToken('');
    try {
      const res = await pushApi.getConfig({ tenantId: tenant.Tenant_ID });
      setPushGateway(res.data.data);
      pushForm.setFieldsValue({ Service_Account_JSON: '', Is_Active: res.data.data?.Is_Active !== false });
    } catch (err) {
      message.error('Failed to load push notification config: ' + err.message);
      setPushGateway(null);
    } finally {
      setPushLoading(false);
    }
  };

  const savePushConfigMutation = useMutation({
    mutationFn: (values) => pushApi.saveConfig(values, { tenantId: pushTenant.Tenant_ID }),
    onSuccess: () => {
      message.success('Push notification config saved — this tenant now uses its own Firebase project, not the shared default.');
      fetchPushConfig(pushTenant);
    },
    onError: (err) => message.error(err.response?.data?.message || 'Failed to save push notification config.'),
  });

  const testSendPushMutation = useMutation({
    mutationFn: (deviceToken) => pushApi.testSend({ deviceToken }, { tenantId: pushTenant.Tenant_ID }),
    onSuccess: () => message.success('Test notification sent — check the device.'),
    onError: (err) => message.error(err.response?.data?.message || 'Test send failed.'),
  });

  const fetchPayGateway = async (tenant) => {
    setPayTenant(tenant);
    setPayLoading(true);
    try {
      const res = await superAdminApi.getPaymentGateway(tenant.Tenant_ID);
      const rzp = (res.data.data || []).find((g) => g.gateway === 'razorpay');
      setPayGateway(rzp || null);
      payForm.setFieldsValue({
        keyId: rzp?.keyId || '', keySecret: '', webhookSecret: '',
        merchantId: rzp?.merchantId || '', environment: rzp?.environment || 'test',
        isActive: rzp?.isActive !== false,
      });
    } catch (err) {
      message.error('Failed to load payment gateway config: ' + err.message);
      setPayGateway(null);
    } finally {
      setPayLoading(false);
    }
  };

  const savePayGatewayMutation = useMutation({
    mutationFn: (values) => superAdminApi.savePaymentGateway(payTenant.Tenant_ID, { gateway: 'razorpay', ...values }),
    onSuccess: () => {
      message.success('Payment gateway saved — the Pay button now uses these credentials for this tenant.');
      fetchPayGateway(payTenant);
    },
    onError: (err) => message.error(err.response?.data?.message || 'Failed to save payment gateway config.'),
  });

  const fetchUsers = async (tenant) => {
    setUsersTenant(tenant);
    setTenantUsersLoading(true);
    try {
      const res = await superAdminApi.getTenantUsers(tenant.Tenant_ID);
      setTenantUsers(res.data.data || []);
    } catch (err) {
      message.error('Failed to fetch users: ' + err.message);
      setTenantUsers([]);
    } finally {
      setTenantUsersLoading(false);
    }
  };

  const openEdit = (tenant) => {
    setEditTenant(tenant);
    editForm.setFieldsValue({
      Company_Name: tenant.Company_Name,
      City: tenant.City,
      State: tenant.State,
      GST_No: tenant.GST_No,
      Phone: tenant.Phone,
      Email: tenant.Email,
      Website: tenant.Website,
      Address_Line1: tenant.Address_Line1,
      Address_Line2: tenant.Address_Line2,
      Pincode: tenant.Pincode,
      Business_Type: tenant.Business_Type || 'HYBRID',
      Max_Users: tenant.Max_Users,
      Max_Branches: tenant.Max_Branches,
      Is_Active: tenant.Is_Active,
      License_Expiry_Date: tenant.License_Expiry_Date ? dayjs(tenant.License_Expiry_Date) : null,
      Notes: tenant.Notes,
      Short_Number_Format: tenant.Short_Number_Format,
      License_Mode: tenant.License_Mode || 'TENANT_WIDE',
    });
  };

  // ── Step 1: validate company fields, store data, advance ─────────────────
  const onStep1Next = () => {
    step1Form.validateFields().then(values => {
      console.log('[Wizard Step1] Values:', values);
      // Safely format the DatePicker value
      const expDate = values.License_Expiry_Date;
      const formatted = expDate
        ? (typeof expDate.format === 'function' ? expDate.format('YYYY-MM-DD') : String(expDate))
        : null;
      if (!formatted) { message.error('Please select a valid License Expiry Date.'); return; }
      setStep1Data({ ...values, License_Expiry_Date: formatted });
      setWizardStep(2);
    }).catch(err => {
      console.error('[Wizard Step1] Validation failed:', err);
      message.error('Please fill in all required fields.');
    });
  };

  // ── Step 2 (admin user): merge with step1 data, submit ───────────────────
  const onFinalSubmit = (adminValues) => {
    if (!step1Data) { message.error('Company info missing. Please go back.'); return; }
    const payload = {
      ...step1Data,
      adminUsername: adminValues.adminUsername,
      adminPassword: adminValues.adminPassword,
      Business_Type: btSelected,
    };
    console.log('[TenantCreate] Final payload:', { ...payload, adminPassword: '***' });
    createMutation.mutate(payload);
  };

  // ── Table columns ─────────────────────────────────────────────────────────
  const columns = [
    { title: 'Tenant ID', dataIndex: 'Tenant_ID', fixed: 'left', width: 130,
      render: v => <Text code style={{ fontSize: 11 }}>{v}</Text> },
    { title: 'Company', dataIndex: 'Company_Name', width: 180,
      render: v => <Text strong>{v}</Text> },
    { title: 'Business Type', dataIndex: 'Business_Type', width: 130,
      render: v => { const bt = BUSINESS_TYPES.find(b => b.key === v); return <Tag color={bt?.color || 'default'} style={{ fontSize: 11 }}>{bt?.label || v || 'HYBRID'}</Tag>; } },
    { title: 'City', dataIndex: 'City', width: 100, render: v => v || '-' },
    { title: 'License Expiry', dataIndex: 'License_Expiry_Date', width: 140,
      render: v => {
        const exp = dayjs(v); const days = exp.diff(dayjs(), 'day');
        return <Tag color={exp.isBefore(dayjs()) ? 'red' : days < 30 ? 'orange' : 'green'}>
          {exp.format('DD-MMM-YYYY')} {!exp.isBefore(dayjs()) && `(${days}d)`}
        </Tag>;
      }},
    { title: 'Users', dataIndex: 'Max_Users', width: 65, render: v => <Tag>{v}</Tag> },
    { title: 'Status', dataIndex: 'Is_Active', width: 90,
      render: v => <Badge status={v ? 'success' : 'error'} text={v ? 'Active' : 'Inactive'} /> },
    { title: 'Actions', fixed: 'right', width: 388,
      render: (_, r) => (
        <Space size={4}>
          <Tooltip title="View"><Button size="small" icon={<EyeOutlined />} onClick={() => setDetailTenant(r)} /></Tooltip>
          <Tooltip title="Edit"><Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} /></Tooltip>
          <Tooltip title="Manage Modules">
            <Button size="small" icon={<ApiOutlined />} style={{ borderColor: '#722ed1', color: '#722ed1' }} onClick={() => openModules(r)} />
          </Tooltip>
          <Tooltip title="Manage Branches">
            <Button size="small" icon={<ApartmentOutlined />} style={{ borderColor: '#fa8c16', color: '#fa8c16' }} onClick={() => fetchBranches(r)} />
          </Tooltip>
          <Tooltip title="SMS Gateway / OTP Templates">
            <Button size="small" icon={<MessageOutlined />} style={{ borderColor: '#eb2f96', color: '#eb2f96' }} onClick={() => fetchSmsConfig(r)} />
          </Tooltip>
          <Tooltip title="Push Notifications (Firebase)">
            <Button size="small" icon={<BellOutlined />} style={{ borderColor: '#faad14', color: '#faad14' }} onClick={() => fetchPushConfig(r)} />
          </Tooltip>
          <Tooltip title="Payment Gateway (Razorpay)">
            <Button size="small" icon={<CreditCardOutlined />} style={{ borderColor: '#52c41a', color: '#52c41a' }} onClick={() => fetchPayGateway(r)} />
          </Tooltip>
          <Tooltip title="Keyboard Shortcuts">
            <Button size="small" icon={<ControlOutlined />} style={{ borderColor: '#13c2c2', color: '#13c2c2' }} onClick={() => openShortcuts(r)} />
          </Tooltip>
          <Tooltip title="Manage Users">
            <Button size="small" icon={<TeamOutlined />} style={{ borderColor: '#1890ff', color: '#1890ff' }} onClick={() => fetchUsers(r)} />
          </Tooltip>
          {r.Is_Active
            ? <Popconfirm title={`Deactivate "${r.Company_Name}"?`} description="Users cannot login. Data preserved."
                onConfirm={() => deactivateMutation.mutate({ id: r.Tenant_ID, active: false })}
                okText="Deactivate" okButtonProps={{ danger: true }}>
                <Button size="small" danger icon={<DeleteOutlined />} />
              </Popconfirm>
            : <Tooltip title="Reactivate">
                <Button size="small" icon={<CheckCircleOutlined />} style={{ borderColor: '#52c41a', color: '#52c41a' }}
                  onClick={() => deactivateMutation.mutate({ id: r.Tenant_ID, active: true })} />
              </Tooltip>
          }
        </Space>
      )},
  ];

  const btInfo = BUSINESS_TYPES.find(b => b.key === btSelected) || BUSINESS_TYPES[3];

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="page-wrapper">
      <div className="page-header">
        <div>
          <Title level={4} style={{ margin: 0 }}>🏢 Tenant Management</Title>
          <Text type="secondary" style={{ fontSize: 12 }}>ERP Provider Panel — manage all client tenants</Text>
        </div>
        <Button ref={createButtonRef} type="primary" icon={<PlusOutlined />}
          style={{ background: '#B8860B', borderColor: '#B8860B' }}
          onClick={() => { setCreateOpen(true); setWizardStep(0); }}>
          Create Tenant
        </Button>
      </div>

      {/* Summary */}
      <Row ref={summaryRef} gutter={[10, 10]} style={{ marginBottom: 14 }}>
        {[
          { label: 'Total',           value: (tenants||[]).length,                                                                                          color: '#B8860B' },
          { label: 'Active',          value: (tenants||[]).filter(t => t.Is_Active).length,                                                                 color: '#52c41a' },
          { label: 'Expiring (30d)',  value: (tenants||[]).filter(t => t.Is_Active && dayjs(t.License_Expiry_Date).diff(dayjs(),'day') < 30 && dayjs(t.License_Expiry_Date).isAfter(dayjs())).length, color: '#fa8c16' },
          { label: 'Expired',         value: (tenants||[]).filter(t => dayjs(t.License_Expiry_Date).isBefore(dayjs())).length,                             color: '#ff4d4f' },
        ].map((s, i) => (
          <Col xs={12} sm={6} key={i}>
            <Card bodyStyle={{ padding: '10px 14px' }} style={{ borderRadius: 8, border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,.07)', borderTop: `3px solid ${s.color}` }}>
              <Text style={{ fontSize: 11, color: '#888' }}>{s.label}</Text>
              <div style={{ fontSize: 22, fontWeight: 700, color: s.color }}>{s.value}</div>
            </Card>
          </Col>
        ))}
      </Row>

      <div ref={tableRef}>
      <Card style={{ borderRadius: 8, border: 'none' }} bodyStyle={{ padding: 0 }}>
        <Table columns={columns} dataSource={tenants || []} loading={isLoading}
          rowKey="Tenant_ID" size="small" scroll={{ x: 1000 }} pagination={{ pageSize: 20 }} />
      </Card>
      </div>

      {/* ════════════════════════════════════════════════════
          CREATE TENANT MODAL — 3-step wizard
          KEY FIX: Each step has its OWN Form instance.
          Step data is stored in state, merged on final submit.
          ════════════════════════════════════════════════════ */}
      <Modal title="🏢 Create New Tenant" open={createOpen}
        onCancel={closeCreateModal} footer={null} width={660} destroyOnClose>

        <Steps current={wizardStep} size="small" style={{ marginBottom: 20 }}
          items={[
            { title: 'Business Type' },
            { title: 'Company Info' },
            { title: 'Admin User' },
          ]} />

        {/* ── Step 0: Business Type selection (no form needed) ── */}
        {wizardStep === 0 && (
          <div>
            <Alert message="Business type sets the default modules. You can add/remove any module later from Module Management."
              type="info" showIcon style={{ marginBottom: 14, fontSize: 11 }} />
            <Row gutter={[10, 10]}>
              {BUSINESS_TYPES.map(bt => (
                <Col xs={24} sm={12} key={bt.key}>
                  <Card hoverable onClick={() => setBtSelected(bt.key)}
                    style={{ borderRadius: 8, cursor: 'pointer',
                      border: `2px solid ${btSelected === bt.key ? bt.color : '#f0f0f0'}`,
                      background: btSelected === bt.key ? bt.color + '0d' : 'white' }}
                    bodyStyle={{ padding: 12 }}>
                    <Text strong style={{ color: bt.color }}>{bt.label}</Text>
                    <br /><Text type="secondary" style={{ fontSize: 11 }}>{bt.desc}</Text>
                  </Card>
                </Col>
              ))}
            </Row>
            <div style={{ marginTop: 14, textAlign: 'right' }}>
              <Button type="primary" onClick={() => setWizardStep(1)}
                style={{ background: btInfo.color, borderColor: btInfo.color }}>
                Next: Company Details →
              </Button>
            </div>
          </div>
        )}

        {/* ── Step 1: Company Info — SEPARATE Form instance ── */}
        {wizardStep === 1 && (
          <Form form={step1Form} layout="vertical"
            onFinishFailed={({ errorFields }) => {
              console.error('[Step1] Validation failed:', errorFields);
              message.error(`Please fix: ${errorFields.map(f => f.name[0]).join(', ')}`);
            }}>
            <Alert message={`Business Type selected: ${btInfo.label}`} type="info" showIcon
              style={{ marginBottom: 14, fontSize: 11 }} />
            <Row gutter={12}>
              <Col xs={12}>
                <Form.Item name="Tenant_ID" label="Tenant ID"
                  rules={[
                    { required: true, message: 'Tenant ID is required' },
                    { pattern: /^[A-Z0-9_]{4,15}$/, message: 'Use uppercase letters/numbers, e.g. VJ_BLR' },
                  ]}>
                  <Input placeholder="VJ_BLR"
                    onChange={e => step1Form.setFieldValue('Tenant_ID', e.target.value.toUpperCase())} />
                </Form.Item>
              </Col>
              <Col xs={12}>
                <Form.Item name="Brand_Code" label="Brand Code" rules={[{ required: true, message: 'Brand code required' }]}>
                  <Input placeholder="VJ"
                    onChange={e => step1Form.setFieldValue('Brand_Code', e.target.value.toUpperCase())} />
                </Form.Item>
              </Col>
            </Row>
            <Form.Item name="Company_Name" label="Company Name" rules={[{ required: true, message: 'Company name required' }]}>
              <Input placeholder="e.g. Vasavi Jewellers" />
            </Form.Item>
            <Row gutter={12}>
              <Col xs={12}><Form.Item name="City" label="City"><Input placeholder="Bangalore" /></Form.Item></Col>
              <Col xs={12}><Form.Item name="State" label="State"><Input placeholder="Karnataka" /></Form.Item></Col>
            </Row>
            <Row gutter={12}>
              <Col xs={12}><Form.Item name="GST_No" label="GST Number"><Input placeholder="29AABCU9603R1ZM" /></Form.Item></Col>
              <Col xs={12}><Form.Item name="Phone" label="Phone"><Input /></Form.Item></Col>
            </Row>
            <Row gutter={12}>
              <Col xs={8}>
                <Form.Item name="License_Key" label="License Key" rules={[{ required: true, message: 'License key required' }]}>
                  <Input placeholder="LK-2026-XXXX" />
                </Form.Item>
              </Col>
              <Col xs={8}>
                {/* DatePicker — stored as dayjs object, formatted safely in onStep1Next */}
                <Form.Item name="License_Expiry_Date" label="License Expiry"
                  rules={[{ required: true, message: 'Select expiry date' }]}>
                  <DatePicker style={{ width: '100%' }}
                    disabledDate={d => d && d.isBefore(dayjs())}
                    format="DD-MMM-YYYY" />
                </Form.Item>
              </Col>
              <Col xs={4}>
                <Form.Item name="Max_Users" label="Max Users" initialValue={10}>
                  <InputNumber min={1} max={999} style={{ width: '100%' }} />
                </Form.Item>
              </Col>
              <Col xs={4}>
                <Form.Item name="Max_Branches" label="Branches" initialValue={1}>
                  <InputNumber min={1} max={99} style={{ width: '100%' }} />
                </Form.Item>
              </Col>
            </Row>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
              <Button onClick={() => setWizardStep(0)}>← Back</Button>
              <Button type="primary" onClick={onStep1Next}
                style={{ background: btInfo.color, borderColor: btInfo.color }}>
                Next: Admin User →
              </Button>
            </div>
          </Form>
        )}

        {/* ── Step 2: Admin user — SEPARATE Form, submits everything ── */}
        {wizardStep === 2 && (
          <Form form={step2Form} layout="vertical"
            onFinish={onFinalSubmit}
            onFinishFailed={({ errorFields }) => {
              console.error('[Step2] Validation failed:', errorFields);
              message.error(`Please fix: ${errorFields.map(f => f.name[0]).join(', ')}`);
            }}>
            <Alert message="This user will be the Admin for this tenant."
              type="info" showIcon style={{ marginBottom: 14, fontSize: 11 }} />
            <Row gutter={12}>
              <Col xs={12}>
                <Form.Item name="adminUsername" label="Admin Username" initialValue={PLATFORM_DEFAULT_ADMIN_USERNAME}
                  rules={[{ required: true, message: 'Admin username required' }]}>
                  <Input placeholder="vjadmin" />
                </Form.Item>
              </Col>
              <Col xs={12}>
                <Form.Item name="adminPassword" label="Admin Password" initialValue={PLATFORM_DEFAULT_ADMIN_PASSWORD}
                  rules={[{ required: true, message: 'Password required' }, {
                    // The one fixed default below is exempt from the 8-char
                    // rule (matches the server's own exception in tenant.js) —
                    // anything you type instead of it still needs 8+ characters.
                    validator: (_, v) => (v === PLATFORM_DEFAULT_ADMIN_PASSWORD || (v || '').length >= 8)
                      ? Promise.resolve() : Promise.reject(new Error('Min 8 characters')),
                  }]}>
                  <Input.Password placeholder="Min 8 characters" />
                </Form.Item>
              </Col>
            </Row>

            {/* Summary of what will be created */}
            {step1Data && (
              <div style={{ background: '#FFF8E1', borderRadius: 8, padding: '12px 16px', marginBottom: 14 }}>
                <Text strong style={{ fontSize: 13 }}>Creation Summary</Text>
                <div style={{ fontSize: 12, marginTop: 6, lineHeight: 2.2, color: '#555' }}>
                  <Row gutter={16}>
                    <Col xs={12}><Text type="secondary">Tenant ID:</Text> <Text strong>{step1Data.Tenant_ID}</Text></Col>
                    <Col xs={12}><Text type="secondary">Company:</Text> <Text strong>{step1Data.Company_Name}</Text></Col>
                    <Col xs={12}><Text type="secondary">Business Type:</Text> <Tag color={btInfo.color}>{btInfo.label}</Tag></Col>
                    <Col xs={12}><Text type="secondary">License Expiry:</Text> <Text strong>{step1Data.License_Expiry_Date}</Text></Col>
                    <Col xs={12}><Text type="secondary">Max Users:</Text> <Text strong>{step1Data.Max_Users}</Text></Col>
                    <Col xs={12}><Text type="secondary">City:</Text> <Text strong>{step1Data.City || '-'}</Text></Col>
                  </Row>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <Button onClick={() => setWizardStep(1)}>← Back</Button>
              <Button type="primary" htmlType="submit" loading={createMutation.isPending}
                style={{ background: btInfo.color, borderColor: btInfo.color, fontWeight: 700, minWidth: 200 }}>
                ✅ Create Tenant & Provision Modules
              </Button>
            </div>
          </Form>
        )}
      </Modal>

      {/* ── Edit Tenant Modal ──────────────────────────────────────────── */}
      <Modal title={`✏️ Edit — ${editTenant?.Company_Name}`} open={!!editTenant}
        onCancel={() => setEditTenant(null)} footer={null} width={560} destroyOnClose>
        <Form form={editForm} layout="vertical"
          onFinish={v => updateMutation.mutate({
            id: editTenant.Tenant_ID,
            data: { ...v, License_Expiry_Date: v.License_Expiry_Date ? v.License_Expiry_Date.format('YYYY-MM-DD') : undefined },
          })}
          onFinishFailed={({ errorFields }) => message.error(`Fix: ${errorFields.map(f => f.name[0]).join(', ')}`)}>
          <Row gutter={12}>
            <Col xs={14}><Form.Item name="Company_Name" label="Company Name" rules={[{ required: true }]}><Input /></Form.Item></Col>
            <Col xs={10}><Form.Item name="Business_Type" label="Business Type">
              <Select>{BUSINESS_TYPES.map(bt => <Option key={bt.key} value={bt.key}>{bt.label}</Option>)}</Select>
            </Form.Item></Col>
          </Row>
          <Row gutter={12}>
            <Col xs={12}><Form.Item name="City" label="City"><Input /></Form.Item></Col>
            <Col xs={12}><Form.Item name="State" label="State"><Input /></Form.Item></Col>
          </Row>
          <Row gutter={12}>
            <Col xs={12}><Form.Item name="Address_Line1" label="Address Line 1"><Input /></Form.Item></Col>
            <Col xs={12}><Form.Item name="Address_Line2" label="Address Line 2"><Input /></Form.Item></Col>
          </Row>
          <Row gutter={12}>
            <Col xs={12}><Form.Item name="Pincode" label="Pincode"><Input /></Form.Item></Col>
            <Col xs={12}><Form.Item name="GST_No" label="GST Number"><Input /></Form.Item></Col>
          </Row>
          <Row gutter={12}>
            <Col xs={12}><Form.Item name="Phone" label="Phone"><Input /></Form.Item></Col>
            <Col xs={12}><Form.Item name="Email" label="Email"><Input /></Form.Item></Col>
          </Row>
          <Form.Item name="Website" label="Website"><Input placeholder="https://..." /></Form.Item>
          <Row gutter={12}>
            <Col xs={8}><Form.Item name="Max_Users" label="Max Users"><InputNumber min={1} style={{ width: '100%' }} /></Form.Item></Col>
            <Col xs={8}><Form.Item name="Max_Branches" label="Max Branches"><InputNumber min={1} style={{ width: '100%' }} /></Form.Item></Col>
          </Row>
          <Divider style={{ margin: '8px 0' }}>AMC / License</Divider>
          <Row gutter={12}>
            <Col xs={12}><Form.Item name="Is_Active" label="Software Access" valuePropName="checked"
              tooltip="Turn OFF the moment AMC/renewal isn't paid — every user of this tenant is locked out of the software within seconds of saving, even if they're already logged in. Turn back ON the moment they pay to restore access immediately.">
              <Switch checkedChildren="Enabled" unCheckedChildren="Stopped" />
            </Form.Item></Col>
            <Col xs={12}><Form.Item name="License_Expiry_Date" label="License Expiry / Renewal Date"
              tooltip="Staff logins are blocked automatically once this date passes (Super Admin logins are exempt). Extend it here whenever the tenant renews.">
              <DatePicker style={{ width: '100%' }} format="DD-MMM-YYYY" />
            </Form.Item></Col>
          </Row>
          <Form.Item name="Short_Number_Format" label="Document Numbers" valuePropName="checked"
            tooltip="OFF (default): INV-COMPANYCODE-20260819-0001. ON: shorter INV-0001 style — drops the tenant code and date on every invoice, purchase, article/barcode, transfer and other auto-generated number.">
            <Switch checkedChildren="Short" unCheckedChildren="Full" />
          </Form.Item>
          <Form.Item name="License_Mode" label="Image App Licensing"
            tooltip="Tenant-wide (default): one shared license key activates the Image App on any device. Per-Device: each physical device must be individually requested and approved under Admin → Image App Devices before it can activate.">
            <Select>
              <Option value="TENANT_WIDE">Tenant-wide (any device)</Option>
              <Option value="PER_DEVICE">Per-device (approve each device)</Option>
            </Select>
          </Form.Item>
          <Form.Item name="Notes" label="Notes"><Input.TextArea rows={2} /></Form.Item>
          <Button type="primary" htmlType="submit" block loading={updateMutation.isPending}
            style={{ background: '#B8860B', borderColor: '#B8860B', fontWeight: 700 }}>
            Save Changes
          </Button>
        </Form>
      </Modal>

      {/* ── Module Management Modal ────────────────────────────────────── */}
      <Modal title={`📦 Modules — ${moduleTenant?.Company_Name}`} open={!!moduleTenant}
        onCancel={() => setModuleTenant(null)} footer={null} width={760} destroyOnClose>
        {moduleTenant && (
          <div>
            {/* Business type switcher */}
            <Card size="small" style={{ borderRadius: 8, background: '#FFF8E1', marginBottom: 14 }}>
              <Row gutter={12} align="middle">
                <Col xs={24} md={16}>
                  <Text strong style={{ fontSize: 12 }}>Change Business Type: </Text>
                  <Select defaultValue={moduleTenant.Business_Type || 'HYBRID'} style={{ width: 220, marginLeft: 8 }}
                    onChange={v => Modal.confirm({
                      title: `Switch "${moduleTenant.Company_Name}" to ${BUSINESS_TYPES.find(b=>b.key===v)?.label}?`,
                      content: 'Default modules for this type will be applied. You can override any module individually after.',
                      onOk: () => provisionMutation.mutate({ tenantId: moduleTenant.Tenant_ID, businessType: v }),
                    })}>
                    {BUSINESS_TYPES.map(bt => <Option key={bt.key} value={bt.key}>{bt.label}</Option>)}
                  </Select>
                </Col>
                <Col xs={24} md={8} style={{ textAlign: 'right' }}>
                  <Tag color="#52c41a">{tenantModules.filter(m => m.Is_Enabled).length} enabled</Tag>
                  <Tag color="#ff4d4f">{tenantModules.filter(m => !m.Is_Enabled).length} disabled</Tag>
                </Col>
              </Row>
            </Card>

            {/* Module toggles grouped */}
            {Object.entries(MODULE_GROUPS).map(([group, keys]) => {
              const mods = tenantModules.filter(m => keys.includes(m.Module_Key));
              if (!mods.length) return null;
              return (
                <div key={group} style={{ marginBottom: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', marginBottom: 6 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: GROUP_COLOR[group]||'#888', marginRight: 6 }} />
                    <Text strong style={{ fontSize: 12, color: GROUP_COLOR[group] }}>{group}</Text>
                    <Tag style={{ marginLeft: 8, fontSize: 10 }}>{mods.filter(m=>m.Is_Enabled).length}/{mods.length}</Tag>
                  </div>
                  <Row gutter={[8, 8]}>
                    {mods.map(mod => (
                      <Col xs={24} sm={12} md={8} key={mod.Module_Key}>
                        <div style={{
                          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                          padding: '8px 12px', borderRadius: 6,
                          border: `1px solid ${mod.Is_Enabled ? GROUP_COLOR[group]+'55' : '#e8e8e8'}`,
                          background: mod.Is_Enabled ? GROUP_COLOR[group]+'0a' : '#fafafa',
                        }}>
                          <div>
                            <Text style={{ fontSize: 12 }}>{mod.Module_Name}</Text>
                            {mod.Is_Core && <Tag color="default" style={{ fontSize: 9, marginLeft: 4 }}>Core</Tag>}
                          </div>
                          <Switch size="small" checked={!!mod.Is_Enabled} disabled={!!mod.Is_Core}
                            loading={toggleModuleMutation.isPending}
                            onChange={v => toggleModuleMutation.mutate({
                              tenantId: moduleTenant.Tenant_ID, key: mod.Module_Key, enabled: v
                            })} />
                        </div>
                      </Col>
                    ))}
                  </Row>
                  <Divider style={{ margin: '10px 0' }} />
                </div>
              );
            })}
          </div>
        )}
      </Modal>

      {/* ── Keyboard Shortcuts Modal ────────────────────────────────────── */}
      <Modal title={`⌨️ Keyboard Shortcuts — ${shortcutTenant?.Company_Name}`} open={!!shortcutTenant}
        onCancel={() => setShortcutTenant(null)} footer={null} width={520} destroyOnClose>
        {shortcutTenant && (
          <div>
            <Alert
              type="info" showIcon style={{ marginBottom: 14, borderRadius: 8 }}
              message="Every user of this tenant uses these SAME keys — this isn't per-user."
              description='Format: an optional modifier plus a key, e.g. "Ctrl+F", "Alt+N", "F10", "Escape". Leave a field as-is to keep the default.'
            />
            <Row gutter={[12, 12]}>
              {STANDARD_ACTIONS.map((action) => (
                <Col xs={24} key={action}>
                  <Row align="middle" gutter={12}>
                    <Col xs={14}>
                      <Text style={{ fontSize: 13 }}>{ACTION_LABELS[action]}</Text>
                      {shortcutValues[action] !== DEFAULT_SHORTCUTS[action] && (
                        <Tag color="blue" style={{ marginLeft: 6, fontSize: 9 }}>Custom</Tag>
                      )}
                    </Col>
                    <Col xs={10}>
                      <Input
                        value={shortcutValues[action] || ''}
                        placeholder={DEFAULT_SHORTCUTS[action]}
                        onChange={(e) => setShortcutValues((v) => ({ ...v, [action]: e.target.value }))}
                      />
                    </Col>
                  </Row>
                </Col>
              ))}
            </Row>
            <Divider style={{ margin: '14px 0' }} />
            <Space style={{ width: '100%', justifyContent: 'space-between' }}>
              <Button onClick={() => setShortcutValues(DEFAULT_SHORTCUTS)}>Reset to Defaults</Button>
              <Button type="primary" loading={updateShortcutsMutation.isPending || shortcutsLoading}
                style={{ background: '#13c2c2', borderColor: '#13c2c2' }}
                onClick={() => updateShortcutsMutation.mutate({ tenantId: shortcutTenant.Tenant_ID, overrides: shortcutValues })}>
                Save Shortcuts
              </Button>
            </Space>
          </div>
        )}
      </Modal>

      {/* ── Manage Branches Modal ─────────────────────────────────────── */}
      <Modal title={`🏬 Branches — ${branchTenant?.Company_Name}`} open={!!branchTenant}
        onCancel={() => setBranchTenant(null)} footer={null} width={720} destroyOnClose>
        <Space style={{ marginBottom: 12 }}>
          <Button type="primary" icon={<PlusOutlined />}
            style={{ background: '#B8860B', border: 'none' }} onClick={openAddBranch}>
            Add Branch
          </Button>
        </Space>
        <Table
          size="small" loading={branchesLoading} dataSource={branches} rowKey="Branch_ID"
          pagination={false}
          columns={[
            { title: 'Branch', dataIndex: 'Branch_Name', render: (v, b) => (
              <Space>
                {v}
                {b.Is_Head_Office && <Tag color="gold">Head Office</Tag>}
                {!b.Is_Active && <Tag color="default">Inactive</Tag>}
              </Space>
            ) },
            { title: 'Code', dataIndex: 'Branch_Code', width: 90 },
            { title: 'City', dataIndex: 'City' },
            { title: 'Phone', dataIndex: 'Phone' },
            { title: '', width: 100, render: (_, b) => (
              <Space>
                <Tooltip title="Edit"><Button size="small" icon={<EditOutlined />} onClick={() => openEditBranch(b)} /></Tooltip>
                {b.Is_Active
                  ? (
                    <Popconfirm title={`Deactivate "${b.Branch_Name}"?`} description="Its data stays; it just stops showing up for billing/branch selection."
                      onConfirm={() => toggleBranchActiveMutation.mutate({ id: b.Branch_ID, isActive: false })}
                      okText="Deactivate" okButtonProps={{ danger: true }} disabled={b.Is_Head_Office}>
                      <Tooltip title={b.Is_Head_Office ? 'The Head Office branch cannot be deactivated' : 'Deactivate'}>
                        <Button size="small" danger icon={<DeleteOutlined />} disabled={b.Is_Head_Office} />
                      </Tooltip>
                    </Popconfirm>
                  )
                  : (
                    <Tooltip title="Reactivate">
                      <Button size="small" icon={<CheckCircleOutlined />} style={{ borderColor: '#52c41a', color: '#52c41a' }}
                        onClick={() => toggleBranchActiveMutation.mutate({ id: b.Branch_ID, isActive: true })} />
                    </Tooltip>
                  )}
              </Space>
            ) },
          ]}
        />

        {/* Add/Edit Branch sub-modal */}
        <Modal
          title={editingBranch ? `Edit Branch — ${editingBranch.Branch_Name}` : 'Add Branch'}
          open={branchFormOpen} onCancel={() => setBranchFormOpen(false)} footer={null} destroyOnClose
        >
          <Form form={branchForm} layout="vertical" onFinish={handleBranchSubmit}>
            <Row gutter={12}>
              <Col xs={16}><Form.Item name="branchName" label="Branch Name" rules={[{ required: true }]}><Input /></Form.Item></Col>
              <Col xs={8}><Form.Item name="branchCode" label="Code"><Input placeholder="auto" /></Form.Item></Col>
            </Row>
            <Form.Item name="address1" label="Address Line 1"><Input /></Form.Item>
            <Form.Item name="address2" label="Address Line 2"><Input /></Form.Item>
            <Row gutter={12}>
              <Col xs={12}><Form.Item name="city" label="City"><Input /></Form.Item></Col>
              <Col xs={12}><Form.Item name="state" label="State"><Input /></Form.Item></Col>
            </Row>
            <Row gutter={12}>
              <Col xs={12}><Form.Item name="pincode" label="Pincode"><Input /></Form.Item></Col>
              <Col xs={12}><Form.Item name="phone" label="Phone"><Input /></Form.Item></Col>
            </Row>
            <Row gutter={12}>
              <Col xs={12}><Form.Item name="email" label="Email"><Input /></Form.Item></Col>
              <Col xs={12}><Form.Item name="gstNo" label="GST No"><Input /></Form.Item></Col>
            </Row>
            <Button type="primary" htmlType="submit" block
              loading={createBranchMutation.isPending || updateBranchMutation.isPending}
              style={{ background: '#B8860B', border: 'none', fontWeight: 700 }}>
              {editingBranch ? 'Save Changes' : 'Create Branch'}
            </Button>
          </Form>
        </Modal>
      </Modal>

      {/* ── SMS Gateway / OTP Templates Modal ───────────────────────────── */}
      <Modal title={`📱 SMS Gateway — ${smsTenant?.Company_Name}`} open={!!smsTenant}
        onCancel={() => setSmsTenant(null)} footer={null} width={720} destroyOnClose>
        {smsGateway && !smsGateway.isOwnConfig && (
          <Alert
            type="warning" showIcon style={{ marginBottom: 16 }}
            message="This tenant has no SMS gateway of its own — it's using the shared default."
            description={
              <>
                Every OTP/SMS this tenant sends goes out through <strong>{smsGateway.Sender_Id}</strong>'s
                account, with whatever OTP template text that shared default has — which may be branded
                for a <em>different</em> client entirely. Fill in this tenant's own account below and Save
                to give it a dedicated config.
              </>
            }
          />
        )}

        <Typography.Title level={5} style={{ marginTop: 0 }}>Gateway Account</Typography.Title>
        <Form form={smsGatewayForm} layout="vertical" onFinish={(v) => saveSmsGatewayMutation.mutate(v)}>
          <Row gutter={12}>
            <Col xs={12}>
              <Form.Item name="Provider" label="Provider" rules={[{ required: true }]}>
                <Select options={[{ value: 'asterix', label: 'Asterix Technology' }]} />
              </Form.Item>
            </Col>
            <Col xs={12}>
              <Form.Item name="Api_Base_Url" label="API Base URL" rules={[{ required: true }]}>
                <Input placeholder="http://sms.asterixtechnology.com/submitsms.jsp" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col xs={12}>
              <Form.Item name="Api_User" label="API User" rules={[{ required: true }]}><Input /></Form.Item>
            </Col>
            <Col xs={12}>
              <Form.Item name="Api_Key" label="API Key"
                extra={smsGateway?.Api_Key_Masked ? `Currently ${smsGateway.Api_Key_Masked} — leave blank to keep it.` : 'Required — this tenant has no key stored yet.'}>
                <Input.Password placeholder={smsGateway?.Api_Key_Masked || 'Enter API key'} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col xs={12}>
              <Form.Item name="Sender_Id" label="Sender ID" rules={[{ required: true }]}
                extra="The 6-char DLT-registered sender ID, e.g. DLJSMS">
                <Input maxLength={6} />
              </Form.Item>
            </Col>
            <Col xs={12}>
              <Form.Item name="Entity_Id" label="DLT Entity ID" rules={[{ required: true }]}><Input /></Form.Item>
            </Col>
          </Row>
          <Row gutter={12} align="middle">
            <Col xs={12}>
              <Form.Item name="Account_Usage" label="Account Usage"><Input /></Form.Item>
            </Col>
            <Col xs={12}>
              <Form.Item name="Is_Active" label="Active" valuePropName="checked">
                <Switch checkedChildren="Enabled" unCheckedChildren="Disabled" />
              </Form.Item>
            </Col>
          </Row>
          <Button type="primary" htmlType="submit" block loading={saveSmsGatewayMutation.isPending}
            style={{ background: '#eb2f96', border: 'none', fontWeight: 700 }}>
            Save Gateway Config for This Tenant
          </Button>
        </Form>

        <Divider />

        <Space style={{ marginBottom: 12, width: '100%', justifyContent: 'space-between' }}>
          <Typography.Title level={5} style={{ margin: 0 }}>OTP / SMS Templates</Typography.Title>
          <Button icon={<PlusOutlined />} onClick={openAddSmsTemplate}>Add / Override</Button>
        </Space>
        <Table
          size="small" loading={smsLoading} dataSource={smsTemplates} rowKey="Purpose" pagination={false}
          columns={[
            { title: 'Purpose', dataIndex: 'Purpose', width: 100 },
            { title: 'Source', width: 110, render: (_, t) => (
              t.isOwnConfig ? <Tag color="green">This tenant</Tag> : <Tag color="default">Shared default</Tag>
            ) },
            { title: 'Template Text', dataIndex: 'Template_Text', render: (v) => (
              <span style={{ fontSize: 12 }}>{v}</span>
            ) },
            { title: '', width: 50, render: (_, t) => (
              <Tooltip title={t.isOwnConfig ? 'Edit' : 'Override for this tenant'}>
                <Button size="small" icon={<EditOutlined />} onClick={() => openEditSmsTemplate(t)} />
              </Tooltip>
            ) },
          ]}
        />

        {/* Add/Edit template sub-modal */}
        <Modal
          title={editingSmsTemplate?.isOwnConfig ? `Edit "${editingSmsTemplate.Purpose}" Template` : 'Override Template for This Tenant'}
          open={smsTemplateFormOpen} onCancel={() => setSmsTemplateFormOpen(false)} footer={null} destroyOnClose
        >
          <Form form={smsTemplateForm} layout="vertical" onFinish={(v) => saveSmsTemplateMutation.mutate(v)}>
            <Form.Item name="Purpose" label="Purpose" rules={[{ required: true }]}>
              <Select options={[{ value: 'OTP', label: 'OTP' }]} disabled={!!editingSmsTemplate} />
            </Form.Item>
            <Form.Item name="Dlt_Template_Id" label="DLT Template ID" rules={[{ required: true }]}
              extra="Must match a template already approved by your telecom operator/DLT registry exactly.">
              <Input />
            </Form.Item>
            <Form.Item name="Template_Text" label="Template Text" rules={[{ required: true }]}
              extra="Use <OTP> exactly where the code should be substituted. Wording must match the DLT-approved template.">
              <Input.TextArea rows={3} />
            </Form.Item>
            <Button type="primary" htmlType="submit" block loading={saveSmsTemplateMutation.isPending}
              style={{ background: '#eb2f96', border: 'none', fontWeight: 700 }}>
              Save Template
            </Button>
          </Form>
        </Modal>
      </Modal>

      {/* ── Push Notification (Firebase) Modal ──────────────────────────── */}
      <Modal title={`🔔 Push Notifications — ${pushTenant?.Company_Name}`} open={!!pushTenant}
        onCancel={() => setPushTenant(null)} footer={null} width={640} destroyOnClose>
        {pushGateway && !pushGateway.isOwnConfig && (
          <Alert
            type="warning" showIcon style={{ marginBottom: 16 }}
            message="This tenant has no Firebase project of its own — it's using the shared default."
            description={
              <>
                Push notifications for this tenant's app would go out through project{' '}
                <strong>{pushGateway.Project_ID}</strong>'s Firebase account. Every real client needs its
                own Firebase project and its own <code>GoogleService-Info.plist</code> /{' '}
                <code>google-services.json</code> bundled into its app — the server-side key below only
                lets the SERVER send pushes; it doesn't replace those app-side files.
              </>
            }
          />
        )}
        {!pushGateway && !pushLoading && (
          <Alert type="info" showIcon style={{ marginBottom: 16 }}
            message="No push notification config exists yet — not even a shared default. Paste a service account key below to create one." />
        )}

        <Typography.Title level={5} style={{ marginTop: 0 }}>Firebase Service Account</Typography.Title>
        <Form form={pushForm} layout="vertical" onFinish={(v) => savePushConfigMutation.mutate(v)}>
          {pushGateway?.Client_Email_Hint && (
            <Alert type="success" showIcon style={{ marginBottom: 12 }}
              message={<>Currently configured: <code>{pushGateway.Client_Email_Hint}</code> (project: {pushGateway.Project_ID})</>} />
          )}
          <Form.Item name="Service_Account_JSON" label="Service Account JSON"
            rules={[{ required: true, message: 'Paste the full JSON file Firebase gives you.' }]}
            extra={
              <>
                Firebase Console → Project Settings → Service Accounts → <strong>Generate new private key</strong>.
                Paste the entire downloaded file's contents here — this replaces the whole credential, there's
                no partial update.
              </>
            }
          >
            <Input.TextArea rows={8} placeholder='{"type": "service_account", "project_id": "...", "private_key": "...", "client_email": "...", ...}'
              style={{ fontFamily: 'monospace', fontSize: 12 }} />
          </Form.Item>
          <Form.Item name="Is_Active" label="Active" valuePropName="checked">
            <Switch checkedChildren="Enabled" unCheckedChildren="Disabled" />
          </Form.Item>
          <Button type="primary" htmlType="submit" block loading={savePushConfigMutation.isPending}
            style={{ background: '#faad14', border: 'none', fontWeight: 700, color: '#000' }}>
            Save Firebase Config for This Tenant
          </Button>
        </Form>

        <Divider />

        <Typography.Title level={5}>Send a Test Notification</Typography.Title>
        <Typography.Paragraph type="secondary" style={{ fontSize: 12 }}>
          Paste a real device's FCM token (visible in that device's app logs after it registers for push) to
          confirm the config above actually works — the only real way to verify a pasted key without a full
          app test.
        </Typography.Paragraph>
        <Space.Compact style={{ width: '100%' }}>
          <Input placeholder="Device FCM registration token" value={testDeviceToken}
            onChange={(e) => setTestDeviceToken(e.target.value)} />
          <Button type="primary" loading={testSendPushMutation.isPending} disabled={!testDeviceToken.trim()}
            onClick={() => testSendPushMutation.mutate(testDeviceToken.trim())}>
            Send Test
          </Button>
        </Space.Compact>
      </Modal>

      {/* ── Payment Gateway (Razorpay) Modal ─────────────────────────────── */}
      <Modal title={`💳 Payment Gateway — ${payTenant?.Company_Name}`} open={!!payTenant}
        onCancel={() => setPayTenant(null)} footer={null} width={640} destroyOnClose>
        {!payGateway?.keyId && !payLoading && (
          <Alert type="info" showIcon style={{ marginBottom: 16 }}
            message="No Razorpay credentials set for this tenant yet — the Pay button in the app will show 'online payment is not configured' until these are saved." />
        )}
        {payGateway?.keyId && (
          <Alert type="success" showIcon style={{ marginBottom: 16 }}
            message={<>Currently configured: <code>{payGateway.keyId}</code> ({payGateway.environment === 'test' ? <Tag color="orange">Test mode</Tag> : <Tag color="green">Live mode</Tag>})</>} />
        )}

        <Typography.Title level={5} style={{ marginTop: 0 }}>Merchant Credentials</Typography.Title>
        <Form form={payForm} layout="vertical" onFinish={(v) => savePayGatewayMutation.mutate(v)}>
          <Form.Item name="keyId" label="Key ID"
            rules={[{ required: true, message: "Razorpay's Key ID (starts rzp_test_ or rzp_live_)" }]}>
            <Input placeholder="rzp_live_xxxxxxxxxxxx" />
          </Form.Item>
          <Form.Item name="keySecret" label="Key Secret"
            extra="Leave blank to keep the currently saved secret unchanged — only fill this in to set a new one.">
            <Input.Password placeholder={payGateway?.keySecretMasked || 'Enter to set/change'} />
          </Form.Item>
          <Form.Item name="environment" label="Environment" rules={[{ required: true }]}>
            <Select options={[
              { value: 'test', label: 'Test — sandbox keys, no real money moves' },
              { value: 'production', label: 'Production — real payments' },
            ]} />
          </Form.Item>
          <Form.Item name="isActive" label="Active" valuePropName="checked">
            <Switch checkedChildren="Enabled" unCheckedChildren="Disabled" />
          </Form.Item>
          <Button type="primary" htmlType="submit" block loading={savePayGatewayMutation.isPending}
            style={{ background: '#52c41a', border: 'none', fontWeight: 700 }}>
            Save Payment Gateway for This Tenant
          </Button>
        </Form>

        <Divider />

        <Typography.Title level={5}>Webhook (reconciliation safety net)</Typography.Title>
        <Typography.Paragraph type="secondary" style={{ fontSize: 12 }}>
          The Pay button already works end-to-end without this — it's a backup, not a requirement. It catches
          the rare case a payment goes through on Razorpay's side but the app never gets to tell the server
          (closed mid-payment, lost connection, crash) — without it, that money would be collected with no
          matching scheme installment recorded anywhere.
        </Typography.Paragraph>
        {payGateway?.webhookUrl && (
          <Form.Item label="Webhook URL — paste this into Razorpay Dashboard → Settings → Webhooks">
            <Input readOnly value={payGateway.webhookUrl} style={{ fontFamily: 'monospace', fontSize: 12 }}
              addonAfter={
                <a onClick={() => { navigator.clipboard?.writeText(payGateway.webhookUrl); message.success('Copied'); }}>Copy</a>
              } />
          </Form.Item>
        )}
        <Form form={payForm} component={false}>
          <Form.Item name="webhookSecret" label="Webhook Secret" extra={
            <>Razorpay generates this when you add the webhook above (under "Active Events" select at least{' '}
              <code>payment.captured</code>) — paste it back here. Leave blank to keep the current one unchanged.</>
          }>
            <Input.Password placeholder={payGateway?.webhookSecretMasked || 'Enter to set/change'} />
          </Form.Item>
        </Form>
        <Button block onClick={() => savePayGatewayMutation.mutate(payForm.getFieldsValue())}
          loading={savePayGatewayMutation.isPending}>
          Save Webhook Secret
        </Button>
      </Modal>

      {/* ── Detail Modal ───────────────────────────────────────────────── */}
      <Modal title={detailTenant?.Company_Name} open={!!detailTenant}
        onCancel={() => setDetailTenant(null)} footer={null} width={520}>
        {detailTenant && (
          <Descriptions column={2} bordered size="small">
            <Descriptions.Item label="Tenant ID"><Text code>{detailTenant.Tenant_ID}</Text></Descriptions.Item>
            <Descriptions.Item label="Brand Code">{detailTenant.Brand_Code}</Descriptions.Item>
            <Descriptions.Item label="Business Type" span={2}>
              {(() => { const bt = BUSINESS_TYPES.find(b => b.key === detailTenant.Business_Type);
                return <Tag color={bt?.color||'default'}>{bt?.label || detailTenant.Business_Type || 'HYBRID'}</Tag>; })()}
            </Descriptions.Item>
            <Descriptions.Item label="City">{detailTenant.City||'-'}</Descriptions.Item>
            <Descriptions.Item label="GST">{detailTenant.GST_No||'-'}</Descriptions.Item>
            <Descriptions.Item label="Phone">{detailTenant.Phone||'-'}</Descriptions.Item>
            <Descriptions.Item label="Email">{detailTenant.Email||'-'}</Descriptions.Item>
            <Descriptions.Item label="License Key" span={2}><Text code style={{fontSize:11}}>{detailTenant.License_Key}</Text></Descriptions.Item>
            <Descriptions.Item label="Expires">{dayjs(detailTenant.License_Expiry_Date).format('DD-MMM-YYYY')}</Descriptions.Item>
            <Descriptions.Item label="Max Users">{detailTenant.Max_Users}</Descriptions.Item>
            <Descriptions.Item label="Created">{dayjs(detailTenant.Created_Date).format('DD-MMM-YYYY')}</Descriptions.Item>
            <Descriptions.Item label="Status">
              <Tag color={detailTenant.Is_Active?'green':'red'}>{detailTenant.Is_Active?'Active':'Inactive'}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="Notes" span={2}>{detailTenant.Notes||'-'}</Descriptions.Item>
          </Descriptions>
        )}
      </Modal>

      {/* ── Tenant Users Modal ─────────────────────────────────────────── */}
      <Modal
        title={
          <Space>
            <TeamOutlined style={{ color: '#1890ff' }} />
            <span>Users — {usersTenant?.Company_Name}</span>
            <Tag color="blue">{tenantUsers.length} users</Tag>
          </Space>
        }
        open={!!usersTenant}
        onCancel={() => { setUsersTenant(null); setTenantUsers([]); }}
        footer={null} width={820} destroyOnClose>

        <Alert
          message="As ERP Provider you can view all users, reset passwords, change roles, and activate/deactivate accounts. Passwords are bcrypt-hashed — you can only set a new password."
          type="info" showIcon style={{ marginBottom: 14, fontSize: 11 }} />

        <Table
            scroll={{ x: "max-content" }}
          loading={tenantUsersLoading}
          dataSource={tenantUsers}
          rowKey="User_ID"
          size="small"
          pagination={false}
          columns={[
            {
              title: 'User', render: (_, r) => (
                <Space>
                  <Avatar size={32} style={{ background: r.Is_Active ? '#B8860B' : '#d9d9d9', fontWeight: 700 }}>
                    {r.Full_Name?.charAt(0)?.toUpperCase() || 'U'}
                  </Avatar>
                  <div>
                    <Text strong style={{ fontSize: 12 }}>{r.Full_Name}</Text>
                    <br />
                    <Text type="secondary" style={{ fontSize: 11 }}>@{r.Username}</Text>
                  </div>
                </Space>
              ),
            },
            { title: 'Role', dataIndex: 'Role_Name', width: 120, render: v => <Tag color="blue">{v}</Tag> },
            { title: 'Mobile', dataIndex: 'Mobile', width: 110, render: v => v || '-' },
            { title: 'Email', dataIndex: 'Email', width: 160, render: v => v || '-' },
            {
              title: 'Last Login', dataIndex: 'Last_Login_Date', width: 110,
              render: v => v
                ? <Tooltip title={dayjs(v).format('DD-MMM-YYYY HH:mm')}>
                    <Text style={{ fontSize: 11, color: '#1890ff' }}>{dayjs(v).fromNow()}</Text>
                  </Tooltip>
                : <Text type="secondary" style={{ fontSize: 11 }}>Never</Text>,
            },
            {
              title: 'Password', width: 160,
              render: (_, r) => (
                <Space size={4}>
                  <Text style={{ fontSize: 11, fontFamily: 'monospace', color: '#555' }}>
                    {r.Default_Password
                      ? r.Default_Password
                      : <Text style={{ color: '#ccc', fontSize: 11 }}>{'●'.repeat(8)}</Text>
                    }
                  </Text>
                </Space>
              ),
            },
            {
              title: 'Status', width: 90,
              render: (_, r) => {
                const locked = r.Locked_Until && new Date(r.Locked_Until) > new Date();
                return (
                  <Tag color={r.Is_Active ? (locked ? 'orange' : 'green') : 'red'}>
                    {r.Is_Active ? (locked ? 'Locked' : 'Active') : 'Inactive'}
                  </Tag>
                );
              },
            },
            {
              title: 'Actions', width: 170,
              render: (_, r) => (
                <Space size={4}>
                  {/* Reset Password */}
                  <Tooltip title="Reset Password">
                    <Button size="small" icon={<KeyOutlined />}
                      style={{ borderColor: '#fa8c16', color: '#fa8c16' }}
                      onClick={() => { setResetPwdTarget({ tenant: usersTenant, user: r }); resetPwdForm.resetFields(); }} />
                  </Tooltip>

                  {/* Activate / Deactivate */}
                  {r.Is_Active
                    ? <Popconfirm title={`Deactivate "${r.Full_Name}"?`} description="User will not be able to log in."
                        onConfirm={() => toggleTenantUserMutation.mutate({ tenantId: usersTenant.Tenant_ID, userId: r.User_ID, active: false })}
                        okText="Deactivate" okButtonProps={{ danger: true }}>
                        <Tooltip title="Deactivate">
                          <Button size="small" danger icon={<DeleteOutlined />} />
                        </Tooltip>
                      </Popconfirm>
                    : <Tooltip title="Reactivate">
                        <Button size="small" icon={<CheckCircleOutlined />}
                          style={{ borderColor: '#52c41a', color: '#52c41a' }}
                          onClick={() => toggleTenantUserMutation.mutate({ tenantId: usersTenant.Tenant_ID, userId: r.User_ID, active: true })} />
                      </Tooltip>
                  }

                  {/* Unlock if locked */}
                  {r.Locked_Until && new Date(r.Locked_Until) > new Date() && (
                    <Tooltip title="Unlock Account">
                      <Button size="small" icon={<UnlockOutlined />}
                        style={{ borderColor: '#52c41a', color: '#52c41a' }}
                        onClick={async () => {
                          await superAdminApi.updateTenantUser(usersTenant.Tenant_ID, r.User_ID, { Login_Attempts: 0, Locked_Until: null });
                          message.success('Account unlocked.');
                          fetchUsers(usersTenant);
                        }} />
                    </Tooltip>
                  )}
                </Space>
              ),
            },
          ]}
        />
      </Modal>

      {/* ── Reset Password Modal (SA → Tenant User) ─────────────────────── */}
      <Modal
        title={
          <Space>
            <KeyOutlined style={{ color: '#fa8c16' }} />
            <span>Password — {resetPwdTarget?.user?.Full_Name}</span>
            <Tag color="blue">{resetPwdTarget?.tenant?.Company_Name}</Tag>
          </Space>
        }
        open={!!resetPwdTarget}
        onCancel={() => { setResetPwdTarget(null); resetPwdForm.resetFields(); }}
        footer={null} width={440} destroyOnClose>

        {resetPwdTarget && (
          <div>
            {/* Current password display */}
            <Card style={{ borderRadius: 8, background: '#FFF8E1', marginBottom: 16, border: '1px solid #ffd591' }}
              bodyStyle={{ padding: '14px 16px' }}>
              <div style={{ marginBottom: 6 }}>
                <Text strong style={{ fontSize: 12 }}>👤 User:</Text>
                <Text style={{ marginLeft: 8 }}>@{resetPwdTarget.user?.Username} — {resetPwdTarget.user?.Role_Name}</Text>
              </div>
              <div>
                <Text strong style={{ fontSize: 12 }}>🔑 Current Password:</Text>
                {resetPwdTarget.user?.Default_Password
                  ? <Text
                      copyable={{ text: resetPwdTarget.user.Default_Password, tooltips: ['Copy', 'Copied!'] }}
                      style={{ marginLeft: 8, fontSize: 14, fontFamily: 'monospace', color: '#B8860B', fontWeight: 700, letterSpacing: 1 }}>
                      {resetPwdTarget.user.Default_Password}
                    </Text>
                  : <Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>
                      Not available (set before this feature was added)
                    </Text>
                }
              </div>
            </Card>

            <Divider style={{ margin: '12px 0' }}>Set New Password (Optional)</Divider>

            <Form form={resetPwdForm} layout="vertical"
              onFinish={v => {
                if (!v.newPassword) { message.warning('Enter a new password to reset.'); return; }
                if (v.newPassword !== v.confirmPassword) { message.error('Passwords do not match!'); return; }
                resetTenantPwdMutation.mutate({
                  tenantId: resetPwdTarget.tenant.Tenant_ID,
                  userId:   resetPwdTarget.user.User_ID,
                  newPassword: v.newPassword,
                });
              }}>
              <Form.Item name="newPassword" label="New Password"
                rules={[{ min: 6, message: 'Min 6 characters' }]}>
                <Input.Password placeholder="Enter new password (min 6 chars)" size="large" />
              </Form.Item>
              <Form.Item name="confirmPassword" label="Confirm New Password">
                <Input.Password placeholder="Re-enter new password" size="large" />
              </Form.Item>
              <Button type="primary" htmlType="submit" block size="large"
                loading={resetTenantPwdMutation.isPending}
                style={{ background: '#fa8c16', borderColor: '#fa8c16', fontWeight: 700 }}>
                🔑 Set New Password
              </Button>
            </Form>
          </div>
        )}
      </Modal>

      <PageTour steps={tourSteps} />
    </div>
  );
}
