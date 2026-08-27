/**
 * Display Settings — Screen Visibility & Permission Matrix
 * Role-wise · User-wise · Per-screen ON/OFF · Action permissions (View/Add/Edit/Delete/Approve/Print/Export)
 */
import React, { useState, useMemo, useRef } from 'react';
import {
  Card, Typography, Switch, Table, Tag, Space, Select, Button,
  Tabs, Tooltip, Divider, Row, Col, Badge, message, Alert, Checkbox,
} from 'antd';
import {
  AppstoreOutlined, TeamOutlined, SaveOutlined, EyeOutlined,
  PlusOutlined, EditOutlined, DeleteOutlined, CheckOutlined,
  PrinterOutlined, DownloadOutlined, ShareAltOutlined,
  MenuOutlined, LayoutOutlined, CheckCircleFilled,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { tenantApi } from '../../api/modules';
import { useNavLayoutStore } from '../../store/navLayoutStore';
import PageTour from '../../components/PageTour';

const { Title, Text } = Typography;
const { Option } = Select;

// ── All ERP modules & screens ─────────────────────────────────────────────────
const ERP_MODULES = [
  {
    module: 'Masters',
    screens: [
      'Item Type Master', 'Design Master', 'Purity Master', 'Stone Master',
      'Supplier Master', 'Customer Master', 'Employee Master', 'Branch Master',
    ],
  },
  {
    module: 'Inventory',
    screens: ['Stock Entry', 'Stock Transfer', 'Stock Adjustment', 'Stock Verification'],
  },
  {
    module: 'Sales',
    screens: ['Sales Bill', 'Sales Return', 'Estimate', 'Order Booking', 'Delivery'],
  },
  {
    module: 'Purchase',
    screens: ['Purchase Bill', 'Purchase Return', 'Old Gold Purchase', 'Gold Exchange'],
  },
  {
    module: 'Manufacturing',
    screens: ['Goldsmith Issue', 'Goldsmith Receipt', 'Karigar Settlement', 'Job Work'],
  },
  {
    module: 'Schemes',
    screens: ['Scheme Enrollment', 'Installment Collection', 'Lucky Draw', 'Scheme Closure'],
  },
  {
    module: 'Accounts',
    screens: ['Receipt', 'Payment', 'Journal', 'Ledger', 'Day Book', 'Day Close'],
  },
  {
    module: 'Reports',
    screens: [
      'Sales Reports', 'Purchase Reports', 'Stock Reports',
      'GST Reports', 'Scheme Reports', 'Profit Reports',
      'Customer Reports', 'Financial Reports', 'Management Reports',
    ],
  },
  {
    module: 'Settings',
    screens: [
      'Company Settings', 'User Management', 'Role Management',
      'Display Settings', 'Rate Management', 'SMS Settings',
      'WhatsApp Settings', 'Backup & Restore', 'Audit Log',
    ],
  },
];

const ACTIONS = ['View', 'Add', 'Edit', 'Delete', 'Approve', 'Print', 'Export'];
const ACTION_ICONS = {
  View:    <EyeOutlined />,
  Add:     <PlusOutlined />,
  Edit:    <EditOutlined />,
  Delete:  <DeleteOutlined />,
  Approve: <CheckOutlined />,
  Print:   <PrinterOutlined />,
  Export:  <DownloadOutlined />,
};

const ALL_SCREENS = ERP_MODULES.flatMap(m => m.screens.map(s => `${m.module}:${s}`));

// Default full-access matrix
const fullAccess = () => Object.fromEntries(
  ALL_SCREENS.map(s => [s, Object.fromEntries(ACTIONS.map(a => [a, true]))])
);
// Default read-only matrix
const readOnly = () => Object.fromEntries(
  ALL_SCREENS.map(s => [s, { View: true, Add: false, Edit: false, Delete: false, Approve: false, Print: true, Export: false }])
);

// ── Navigation Layout — sidebar vs top header, same menu either way ────────────
// A small CSS mockup (not a screenshot) so the difference is obvious at a
// glance without needing real screen space.
function LayoutPreviewCard({ mode, selected, onSelect }) {
  const isSidebar = mode === 'sidebar';
  return (
    <Card
      hoverable
      onClick={onSelect}
      style={{
        borderRadius: 10, cursor: 'pointer', width: 220,
        border: selected ? '2px solid #B8860B' : '1px solid #eee',
        boxShadow: selected ? '0 4px 14px rgba(184,134,11,.18)' : '0 1px 4px rgba(0,0,0,.06)',
      }}
      bodyStyle={{ padding: 14 }}
    >
      {/* Mockup */}
      <div style={{ display: 'flex', flexDirection: isSidebar ? 'row' : 'column', height: 100, borderRadius: 6, overflow: 'hidden', border: '1px solid #e8e8e8', marginBottom: 10 }}>
        {isSidebar ? (
          <>
            <div style={{ width: 26, background: '#1A1A1A' }} />
            <div style={{ flex: 1, background: '#F4F5F7' }}>
              <div style={{ height: 14, background: '#fff', borderBottom: '1px solid #eee' }} />
            </div>
          </>
        ) : (
          <>
            <div style={{ height: 16, background: '#1A1A1A' }} />
            <div style={{ height: 12, background: '#1A1A1A', opacity: 0.7 }} />
            <div style={{ flex: 1, background: '#F4F5F7' }} />
          </>
        )}
      </div>
      <Space style={{ width: '100%', justifyContent: 'space-between' }}>
        <Text strong style={{ fontSize: 13 }}>
          {isSidebar ? <Space size={4}><MenuOutlined />Sidebar</Space> : <Space size={4}><LayoutOutlined />Top Header</Space>}
        </Text>
        {selected && <CheckCircleFilled style={{ color: '#B8860B' }} />}
      </Space>
      <Text type="secondary" style={{ fontSize: 11 }}>
        {isSidebar ? 'Menu on the left, collapsible.' : 'Menu as a bar across the top.'}
      </Text>
    </Card>
  );
}

function NavLayoutTab() {
  const { layout, setLayout } = useNavLayoutStore();
  return (
    <Card size="small" style={{ borderRadius: 8, marginBottom: 12 }}>
      <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 14 }}>
        Choose how the menu appears on this computer. Same pages, same access — just a different layout.
        This is a personal preference, saved on this device only, so different staff can each pick what they like.
      </Text>
      <Space size={16} wrap>
        <LayoutPreviewCard mode="sidebar" selected={layout === 'sidebar'} onSelect={() => setLayout('sidebar')} />
        <LayoutPreviewCard mode="header" selected={layout === 'header'} onSelect={() => setLayout('header')} />
      </Space>
      <Alert
        type="info" showIcon style={{ marginTop: 16, borderRadius: 8 }}
        message="Takes effect immediately — no save button needed. On phones/tablets, the menu always opens from the corner regardless of this choice."
      />
    </Card>
  );
}

export default function DisplaySettingsPage() {
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState('role');
  const [selectedRole, setSelectedRole] = useState(null);
  const [selectedUser, setSelectedUser] = useState(null);
  const [matrix, setMatrix] = useState({});
  const [dirty, setDirty] = useState(false);

  // ── Walkthrough tour refs ───────────────────────────────────────────────────
  const tabsRef = useRef(null);
  const roleCardRef = useRef(null);
  const tourSteps = [
    { title: '1. Role-wise vs User-wise', description: 'Two ways to control what staff can see: "Role-wise" applies to everyone with that role, while "User-wise" overrides settings for just one specific person.', target: () => tabsRef.current },
    { title: '2. Pick a Role & Preset', description: 'Select a role, then optionally start from a Quick Preset — "Full Access" turns everything on, "Read Only" allows viewing/printing but blocks Add/Edit/Delete — before fine-tuning individual screens below.', target: () => roleCardRef.current },
    { title: '3. The Permission Matrix', description: 'Once a role or user is selected, a matrix of every screen appears below with 7 action toggles — View, Add, Edit, Delete, Approve, Print, Export. Turning off "View" for a screen hides it entirely; other actions need View turned on first. Use the "All ON / All OFF" buttons on a module row to set every screen inside it at once.' },
    { title: '4. Save Your Changes', description: 'Any change turns on an "Unsaved Changes" warning at the top — click Save Settings (or the red Save button) before leaving, or your changes will be lost.' },
  ];

  const { data: roles } = useQuery({ queryKey: ['roles'], queryFn: () => tenantApi.getRoles().then(r => r.data.data) });
  const { data: users } = useQuery({ queryKey: ['users'], queryFn: () => tenantApi.getUsers().then(r => r.data.data) });

  // Load display settings when role/user selected
  const loadKey = activeTab === 'role' ? `role_${selectedRole}` : `user_${selectedUser}`;
  const { data: savedSettings } = useQuery({
    queryKey: ['display-settings', loadKey],
    queryFn: () => tenantApi.getDisplayPrefs({ type: activeTab, id: activeTab === 'role' ? selectedRole : selectedUser }).then(r => r.data.data),
    enabled: !!(activeTab === 'role' ? selectedRole : selectedUser),
    onSuccess: (d) => { setMatrix(d?.matrix || fullAccess()); setDirty(false); },
  });

  const saveMutation = useMutation({
    mutationFn: (data) => tenantApi.saveDisplayPrefs(data),
    onSuccess: () => { message.success('Display settings saved!'); setDirty(false); qc.invalidateQueries(['display-settings', loadKey]); },
    onError: () => message.error('Failed to save settings.'),
  });

  const onSave = () => {
    if (!selectedRole && !selectedUser) { message.warning('Select a role or user first.'); return; }
    saveMutation.mutate({
      type: activeTab,
      id: activeTab === 'role' ? selectedRole : selectedUser,
      matrix,
    });
  };

  const toggleAction = (screenKey, action, val) => {
    setMatrix(prev => ({
      ...prev,
      [screenKey]: { ...(prev[screenKey] || {}), [action]: val },
    }));
    setDirty(true);
  };

  const toggleScreen = (screenKey, val) => {
    setMatrix(prev => ({
      ...prev,
      [screenKey]: Object.fromEntries(ACTIONS.map(a => [a, val])),
    }));
    setDirty(true);
  };

  const toggleModule = (moduleScreens, val) => {
    const updates = {};
    moduleScreens.forEach(s => {
      updates[s] = Object.fromEntries(ACTIONS.map(a => [a, val]));
    });
    setMatrix(prev => ({ ...prev, ...updates }));
    setDirty(true);
  };

  const applyPreset = (preset) => {
    setMatrix(preset === 'full' ? fullAccess() : readOnly());
    setDirty(true);
    message.success(`${preset === 'full' ? 'Full Access' : 'Read Only'} preset applied`);
  };

  // Build table columns: Screen + 7 action toggles
  const cols = [
    {
      title: 'Screen / Module', dataIndex: 'screenKey', fixed: 'left', width: 200,
      render: (k, r) => (
        <div style={{ paddingLeft: r.isModule ? 0 : 16 }}>
          {r.isModule ? (
            <Text strong style={{ color: '#B8860B', fontSize: 12 }}>{r.label}</Text>
          ) : (
            <Text style={{ fontSize: 12 }}>{r.label}</Text>
          )}
        </div>
      ),
    },
    {
      title: 'Screen ON/OFF', width: 100, align: 'center',
      render: (_, r) => r.isModule ? (
        <Space size={4}>
          <Button size="small" onClick={() => toggleModule(r.screens, true)} style={{ fontSize: 9 }}>All ON</Button>
          <Button size="small" onClick={() => toggleModule(r.screens, false)} style={{ fontSize: 9 }}>All OFF</Button>
        </Space>
      ) : (
        <Switch size="small"
          checked={Object.values(matrix[r.screenKey] || {}).some(v => v)}
          onChange={v => toggleScreen(r.screenKey, v)} />
      ),
    },
    ...ACTIONS.map(action => ({
      title: (
        <Tooltip title={action}>
          <span style={{ fontSize: 11 }}>{ACTION_ICONS[action]} {action}</span>
        </Tooltip>
      ),
      width: 70, align: 'center',
      render: (_, r) => r.isModule ? null : (
        <Checkbox
          checked={!!(matrix[r.screenKey]?.[action])}
          onChange={e => toggleAction(r.screenKey, action, e.target.checked)}
          disabled={action !== 'View' && !matrix[r.screenKey]?.View}
        />
      ),
    })),
  ];

  // Build flat table data: module headers + screen rows
  const tableData = ERP_MODULES.flatMap(m => {
    const moduleKey = `module_${m.module}`;
    const moduleScreens = m.screens.map(s => `${m.module}:${s}`);
    return [
      { key: moduleKey, screenKey: moduleKey, label: m.module, isModule: true, screens: moduleScreens },
      ...m.screens.map(s => ({
        key: `${m.module}:${s}`,
        screenKey: `${m.module}:${s}`,
        label: s,
        isModule: false,
      })),
    ];
  });

  const tabItems = [
    {
      key: 'role', label: <span><AppstoreOutlined /> Role-wise Access</span>,
      children: (
        <>
          <div ref={roleCardRef}>
          <Card size="small" style={{ borderRadius: 8, marginBottom: 12 }}>
            <Row gutter={14} align="middle">
              <Col xs={24} md={8}>
                <Text strong style={{ fontSize: 12 }}>Select Role: </Text>
                <Select style={{ width: '100%', marginTop: 4 }} placeholder="Choose a role"
                  value={selectedRole} onChange={v => { setSelectedRole(v); setMatrix(fullAccess()); setDirty(false); }}>
                  {(roles || []).map(r => <Option key={r.Role_ID} value={r.Role_ID}>{r.Role_Name}</Option>)}
                </Select>
              </Col>
              <Col xs={24} md={10}>
                <Text strong style={{ fontSize: 12 }}>Quick Preset: </Text>
                <Space style={{ marginTop: 4 }}>
                  <Button size="small" onClick={() => applyPreset('full')} style={{ borderColor: '#52c41a', color: '#52c41a' }}>✅ Full Access</Button>
                  <Button size="small" onClick={() => applyPreset('readonly')} style={{ borderColor: '#1890ff', color: '#1890ff' }}>👁 Read Only</Button>
                </Space>
              </Col>
              <Col xs={24} md={6} style={{ textAlign: 'right', marginTop: 4 }}>
                <Button type="primary" icon={<SaveOutlined />} onClick={onSave}
                  loading={saveMutation.isPending} disabled={!selectedRole || !dirty}
                  style={{ background: '#B8860B', borderColor: '#B8860B' }}>
                  Save Settings
                </Button>
              </Col>
            </Row>
          </Card>
          </div>
          {!selectedRole && <Alert message="Select a role to configure screen permissions." type="info" showIcon />}
        </>
      ),
    },
    {
      key: 'user', label: <span><TeamOutlined /> User-wise Override</span>,
      children: (
        <>
          <Alert message="User-wise settings override the role for that specific user only. Leave as default to inherit role settings."
            type="warning" showIcon style={{ marginBottom: 12, fontSize: 11 }} />
          <Card size="small" style={{ borderRadius: 8, marginBottom: 12 }}>
            <Row gutter={14} align="middle">
              <Col xs={24} md={10}>
                <Text strong style={{ fontSize: 12 }}>Select User: </Text>
                <Select style={{ width: '100%', marginTop: 4 }} placeholder="Choose a user"
                  showSearch optionFilterProp="children"
                  value={selectedUser} onChange={v => { setSelectedUser(v); setMatrix(fullAccess()); setDirty(false); }}>
                  {(users || []).filter(u => u.Is_Active).map(u =>
                    <Option key={u.User_ID} value={u.User_ID}>{u.Full_Name} (@{u.Username}) — {u.Role_Name}</Option>
                  )}
                </Select>
              </Col>
              <Col xs={24} md={8}>
                <Text strong style={{ fontSize: 12 }}>Quick Preset: </Text>
                <Space style={{ marginTop: 4 }}>
                  <Button size="small" onClick={() => applyPreset('full')} style={{ borderColor: '#52c41a', color: '#52c41a' }}>✅ Full Access</Button>
                  <Button size="small" onClick={() => applyPreset('readonly')} style={{ borderColor: '#1890ff', color: '#1890ff' }}>👁 Read Only</Button>
                </Space>
              </Col>
              <Col xs={24} md={6} style={{ textAlign: 'right', marginTop: 4 }}>
                <Button type="primary" icon={<SaveOutlined />} onClick={onSave}
                  loading={saveMutation.isPending} disabled={!selectedUser || !dirty}
                  style={{ background: '#B8860B', borderColor: '#B8860B' }}>
                  Save Override
                </Button>
              </Col>
            </Row>
          </Card>
          {!selectedUser && <Alert message="Select a user to configure individual screen access." type="info" showIcon />}
        </>
      ),
    },
    {
      key: 'nav-layout', label: <span><LayoutOutlined /> Navigation Layout</span>,
      children: <NavLayoutTab />,
    },
  ];

  return (
    <div className="page-wrapper">
      <div className="page-header">
        <div>
          <Title level={4} style={{ margin: 0 }}>🖥️ Display Settings</Title>
          <Text type="secondary" style={{ fontSize: 12 }}>
            Control which screens and actions are visible per role or per user
          </Text>
        </div>
        {dirty && (
          <Button type="primary" icon={<SaveOutlined />} onClick={onSave}
            loading={saveMutation.isPending}
            style={{ background: '#ff4d4f', borderColor: '#ff4d4f', fontWeight: 700 }}>
            ⚠️ Unsaved Changes — Save Now
          </Button>
        )}
      </div>

      <div ref={tabsRef}>
      <Tabs activeKey={activeTab} onChange={t => { setActiveTab(t); setMatrix({}); setDirty(false); }}
        type="card" items={tabItems} />
      </div>

      {activeTab !== 'nav-layout' && (selectedRole || selectedUser) && (
        <Card bodyStyle={{ padding: 0 }} style={{ borderRadius: 8, marginTop: 12 }}>
          <Table
            columns={cols}
            dataSource={tableData}
            rowKey="key"
            size="small"
            pagination={false}
            scroll={{ x: 900 }}
            rowClassName={r => r.isModule ? 'ant-table-row-module' : ''}
            style={{ fontSize: 11 }}
          />
        </Card>
      )}

      <style>{`
        .ant-table-row-module td { background: #FFF8E1 !important; }
      `}</style>

      <PageTour steps={tourSteps} />
    </div>
  );
}
