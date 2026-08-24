/**
 * Module Management — Admin controls which ERP modules are ON/OFF for this tenant
 * Business Type selection auto-provisions correct modules
 * Admin can override individual modules after provisioning
 */
import React, { useState, useRef } from 'react';
import {
  Card, Typography, Switch, Table, Tag, Space, Button, Select,
  Row, Col, Statistic, Alert, Divider, Tooltip, Popconfirm, Badge, message, Empty,
} from 'antd';
import {
  AppstoreOutlined, ThunderboltOutlined, SaveOutlined, InfoCircleOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { modulesApi, tenantApi } from '../../api/modules';
import { useAuthStore } from '../../store/authStore';
import PageTour from '../../components/PageTour';

const { Title, Text } = Typography;
const { Option } = Select;

const BUSINESS_TYPES = [
  {
    key: 'RETAILER',
    label: '🏪 Retailer',
    color: '#B8860B',
    desc: 'Retail shop selling directly to end customers',
    features: ['POS / Retail Sales', 'Customer Management', 'Savings Schemes', 'Inventory', 'Purchase', 'Repair'],
  },
  {
    key: 'WHOLESALER',
    label: '🏭 Wholesaler',
    color: '#1890ff',
    desc: 'Selling jewellery to retailers and dealers',
    features: ['Wholesale Sales', 'Dealer Management', 'Warehouse Inventory', 'Purchase', 'Accounts'],
  },
  {
    key: 'MANUFACTURER',
    label: '⚙️ Manufacturer',
    color: '#52c41a',
    desc: 'Manufacturing jewellery — goldsmith & karigar workflow',
    features: ['Goldsmith Issue/Receipt', 'Karigar Settlement', 'Job Work', 'Manufacturing Reports', 'Inventory'],
  },
  {
    key: 'HYBRID',
    label: '💎 Hybrid',
    color: '#722ed1',
    desc: 'Retail + Wholesale + Manufacturing — all modules enabled',
    features: ['All of the above', 'Everything enabled', 'Full ERP access'],
  },
];

const TIERS = [
  { key: 'Gold', label: '🥇 Gold', color: '#B8860B', desc: 'Essential — billing, stock, customers, basic reports.' },
  { key: 'Platinum', label: '⚪ Platinum', color: '#8c8c8c', desc: 'Everything in Gold, plus multi-branch, karigar, schemes, advanced reports.' },
  { key: 'Diamond', label: '💎 Diamond', color: '#40a9ff', desc: 'Everything in Platinum, plus pawnbroking, HR/payroll, CRM, approvals, sync, audit.' },
];

const GROUP_COLORS = {
  Core: '#888', Inventory: '#52c41a', Sales: '#B8860B', Purchase: '#fa8c16',
  Manufacturing: '#ff4d4f', CRM: '#1890ff', Schemes: '#722ed1',
  Accounts: '#13c2c2', Reports: '#eb2f96', Operations: '#555',
};

export default function ModuleManagementPage() {
  const { user } = useAuthStore();
  const qc = useQueryClient();
  const [selectedBT, setSelectedBT] = useState(null);
  const [provisionConfirm, setProvisionConfirm] = useState(false);
  const [selectedTier, setSelectedTier] = useState(null);

  // Every query/mutation below acts on THIS tenant, not the logged-in
  // Super Admin's own (SA_MASTER isn't a real customer — there was never
  // anything meaningful to manage there). Nothing loads until one is picked.
  const [managedTenantId, setManagedTenantId] = useState(null);

  const { data: tenants, isLoading: tenantsLoading } = useQuery({
    queryKey: ['tenants-all'],
    queryFn: () => tenantApi.getAllTenants().then((r) => r.data.data),
  });

  // ── Walkthrough tour refs ───────────────────────────────────────────────────
  const tenantPickRef = useRef(null);
  const statusRef = useRef(null);
  const businessTypeRef = useRef(null);
  const moduleToggleRef = useRef(null);
  const tourSteps = [
    { title: '1. Pick a Customer', description: 'Every control on this page acts on whichever tenant is selected here — pick the real customer you want to manage before doing anything else.', target: () => tenantPickRef.current },
    { title: '2. See What\'s Active', description: 'These cards show this tenant\'s current business type, subscription tier, and how many of the available ERP modules are switched on vs off.', target: () => statusRef.current },
    { title: '3. Quick Setup by Business Type', description: 'Pick Retailer, Wholesaler, Manufacturer or Hybrid to instantly re-provision the right set of modules for that kind of business — this resets any custom overrides you\'ve made.', target: () => businessTypeRef.current },
    { title: '4. Turn Individual Modules On/Off', description: 'Flip any switch to instantly enable or disable that one module for this tenant — for example, turn off "Repair" if this shop doesn\'t offer repair services. Core modules are locked on and can\'t be disabled.', target: () => moduleToggleRef.current },
  ];

  const { data: ctx, isLoading } = useQuery({
    queryKey: ['tenant-context', managedTenantId],
    queryFn: () => modulesApi.getTenantContext(managedTenantId).then(r => r.data.data),
    enabled: !!managedTenantId,
  });

  const { data: moduleData } = useQuery({
    queryKey: ['all-modules', managedTenantId],
    queryFn: () => modulesApi.getAll(managedTenantId).then(r => r.data.data),
    enabled: !!managedTenantId,
  });
  const allModules = moduleData?.modules;
  const subscriptionTier = moduleData?.subscriptionTier; // null if no plan assigned yet — see TIER_FEATURE_MAPPING.md

  const invalidateManaged = () => {
    qc.invalidateQueries(['tenant-context', managedTenantId]);
    qc.invalidateQueries(['all-modules', managedTenantId]);
  };

  const toggleMutation = useMutation({
    mutationFn: ({ key, enabled }) => modulesApi.toggle(key, enabled, managedTenantId),
    onSuccess: (_, { key, enabled }) => {
      message.success(`Module ${enabled ? 'enabled' : 'disabled'}.`);
      invalidateManaged();
    },
    onError: (err) => message.error(err.response?.data?.message || 'Failed.'),
  });

  const provisionMutation = useMutation({
    mutationFn: (bt) => modulesApi.provision(bt, managedTenantId),
    onSuccess: (res) => {
      message.success(res.data.message);
      invalidateManaged();
      setProvisionConfirm(false);
      setSelectedBT(null);
    },
    onError: (err) => message.error(err.response?.data?.message || 'Failed.'),
  });

  const tierMutation = useMutation({
    mutationFn: (tier) => modulesApi.setTier(managedTenantId, tier),
    onSuccess: (res) => {
      message.success(res.data.message);
      invalidateManaged();
      setSelectedTier(null);
    },
    onError: (err) => message.error(err.response?.data?.message || 'Only a Super Admin can change the subscription tier.'),
  });

  const currentBT = ctx?.businessType || 'HYBRID';
  const enabledCount = (allModules || []).filter(m => m.Is_Enabled).length;
  const totalCount = (allModules || []).length;

  // Group modules
  const grouped = {};
  (allModules || []).forEach(m => {
    if (!grouped[m.Module_Group]) grouped[m.Module_Group] = [];
    grouped[m.Module_Group].push(m);
  });

  const btInfo = BUSINESS_TYPES.find(b => b.key === currentBT) || BUSINESS_TYPES[3];

  return (
    <div className="page-wrapper">
      <div className="page-header">
        <div>
          <Title level={4} style={{ margin: 0 }}>
            <AppstoreOutlined style={{ color: '#B8860B', marginRight: 8 }} />
            Module Management
          </Title>
          <Text type="secondary" style={{ fontSize: 12 }}>
            Control which ERP modules, business type, and subscription tier are active for a customer
          </Text>
        </div>
      </div>

      {/* Which customer — nothing below loads until one is picked */}
      <div ref={tenantPickRef} style={{ background: '#fff', borderRadius: 8, padding: '10px 12px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
        <Text strong style={{ fontSize: 12 }}>Managing:</Text>
        <Select
          showSearch
          allowClear
          placeholder="Select a customer (tenant)…"
          style={{ width: 340 }}
          loading={tenantsLoading}
          value={managedTenantId}
          onChange={(v) => { setManagedTenantId(v || null); setSelectedBT(null); setSelectedTier(null); }}
          optionFilterProp="label"
          filterOption={(input, option) => (option?.label ?? '').toLowerCase().includes(input.toLowerCase())}
          options={(tenants || [])
            .filter((t) => t.Tenant_ID !== 'SA_MASTER')
            .map((t) => ({ value: t.Tenant_ID, label: `${t.Company_Name} (${t.Tenant_ID})` }))}
        />
        {managedTenantId && <Text type="secondary" style={{ fontSize: 11 }}>Every change below applies only to this customer.</Text>}
      </div>

      {!managedTenantId ? (
        <Card style={{ borderRadius: 8 }}>
          <Empty description="Pick a customer above to manage their business type, subscription tier, and modules." />
        </Card>
      ) : (
      <>
      {/* Current Status */}
      <div ref={statusRef}>
      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        <Col xs={24} md={8}>
          <Card bodyStyle={{ padding: '16px 20px' }} style={{ borderRadius: 8, borderLeft: `4px solid ${btInfo.color}` }}>
            <Text style={{ fontSize: 11, color: '#888' }}>Business Type</Text>
            <div style={{ fontSize: 20, fontWeight: 700, color: btInfo.color, marginTop: 2 }}>{btInfo.label}</div>
            <Text type="secondary" style={{ fontSize: 11 }}>{btInfo.desc}</Text>
          </Card>
        </Col>
        <Col xs={12} md={4}>
          <Card bodyStyle={{ padding: '16px 20px' }} style={{ borderRadius: 8, border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,.07)' }}>
            <Text style={{ fontSize: 11, color: '#888' }}>Subscription Tier</Text>
            <div style={{ fontSize: 18, fontWeight: 700, marginTop: 2 }}>
              {subscriptionTier === 'Gold' && '🥇 Gold'}
              {subscriptionTier === 'Platinum' && '⚪ Platinum'}
              {subscriptionTier === 'Diamond' && '💎 Diamond'}
              {!subscriptionTier && <Text type="secondary" style={{ fontSize: 14 }}>Not assigned</Text>}
            </div>
          </Card>
        </Col>
        <Col xs={12} md={4}>
          <Card bodyStyle={{ padding: '16px 20px' }} style={{ borderRadius: 8, border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,.07)' }}>
            <Statistic title={<Text style={{ fontSize: 11, color: '#888' }}>Active Modules</Text>}
              value={enabledCount} suffix={`/ ${totalCount}`}
              valueStyle={{ color: '#52c41a', fontWeight: 700 }} />
          </Card>
        </Col>
        <Col xs={12} md={4}>
          <Card bodyStyle={{ padding: '16px 20px' }} style={{ borderRadius: 8, border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,.07)' }}>
            <Statistic title={<Text style={{ fontSize: 11, color: '#888' }}>Disabled</Text>}
              value={totalCount - enabledCount}
              valueStyle={{ color: '#ff4d4f', fontWeight: 700 }} />
          </Card>
        </Col>
      </Row>
      </div>

      {/* Business Type Quick Switch */}
      <div ref={businessTypeRef}>
      <Card style={{ borderRadius: 8, marginBottom: 16 }}
        title={<span><ThunderboltOutlined style={{ color: '#B8860B' }} /> Change Business Type</span>}>
        <Alert
          message="Changing the business type will re-provision all modules to their defaults for that type. Your custom overrides will be reset."
          type="warning" showIcon style={{ marginBottom: 14, fontSize: 11 }} />
        <Row gutter={[12, 12]}>
          {BUSINESS_TYPES.map(bt => (
            <Col xs={24} sm={12} lg={6} key={bt.key}>
              <Card
                hoverable
                onClick={() => setSelectedBT(bt.key)}
                style={{
                  borderRadius: 10, cursor: 'pointer',
                  border: `2px solid ${selectedBT === bt.key ? bt.color : bt.key === currentBT ? bt.color + '66' : '#f0f0f0'}`,
                  background: selectedBT === bt.key ? bt.color + '11' : bt.key === currentBT ? bt.color + '08' : 'white',
                }}
                bodyStyle={{ padding: 14 }}>
                <div style={{ fontSize: 18, marginBottom: 4 }}>{bt.label}</div>
                <Text style={{ fontSize: 11, color: '#666' }}>{bt.desc}</Text>
                <ul style={{ margin: '8px 0 0', paddingLeft: 16, fontSize: 10, color: '#888', lineHeight: 1.8 }}>
                  {bt.features.map(f => <li key={f}>{f}</li>)}
                </ul>
                {bt.key === currentBT && <Tag color={bt.color} style={{ marginTop: 8, fontSize: 10 }}>Current</Tag>}
              </Card>
            </Col>
          ))}
        </Row>
        {selectedBT && selectedBT !== currentBT && (
          <div style={{ marginTop: 14, display: 'flex', gap: 10 }}>
            <Popconfirm
              title={`Switch to ${BUSINESS_TYPES.find(b => b.key === selectedBT)?.label}?`}
              description="This will reset all module settings to the defaults for this business type."
              onConfirm={() => provisionMutation.mutate(selectedBT)}
              okText="Yes, Switch" okButtonProps={{ style: { background: '#B8860B', borderColor: '#B8860B' } }}>
              <Button type="primary" loading={provisionMutation.isPending}
                style={{ background: '#B8860B', borderColor: '#B8860B' }}>
                ⚡ Apply {BUSINESS_TYPES.find(b => b.key === selectedBT)?.label} Configuration
              </Button>
            </Popconfirm>
            <Button onClick={() => setSelectedBT(null)}>Cancel</Button>
          </div>
        )}
      </Card>
      </div>

      {/* Subscription Tier Switch — Super Admin only, same access level this whole page already requires */}
      <Card style={{ borderRadius: 8, marginBottom: 16 }}
        title={<span>🥇 Change Subscription Tier</span>}>
        <Alert
          message="This is separate from Business Type — it's the SECOND gate a module must pass. A module only shows up if it's included in BOTH this tenant's business type defaults AND their subscription tier."
          type="info" showIcon style={{ marginBottom: 14, fontSize: 11 }} />
        <Row gutter={[12, 12]}>
          {TIERS.map(t => (
            <Col xs={24} sm={8} key={t.key}>
              <Card
                hoverable
                onClick={() => setSelectedTier(t.key)}
                style={{
                  borderRadius: 10, cursor: 'pointer',
                  border: `2px solid ${selectedTier === t.key ? t.color : t.key === subscriptionTier ? t.color + '66' : '#f0f0f0'}`,
                  background: selectedTier === t.key ? t.color + '11' : t.key === subscriptionTier ? t.color + '08' : 'white',
                }}
                bodyStyle={{ padding: 14 }}>
                <div style={{ fontSize: 18, marginBottom: 4 }}>{t.label}</div>
                <Text style={{ fontSize: 11, color: '#666' }}>{t.desc}</Text>
                {t.key === subscriptionTier && <div><Tag color={t.color} style={{ marginTop: 8, fontSize: 10 }}>Current</Tag></div>}
              </Card>
            </Col>
          ))}
        </Row>
        {selectedTier && selectedTier !== subscriptionTier && (
          <div style={{ marginTop: 14, display: 'flex', gap: 10 }}>
            <Popconfirm
              title={`Switch to ${selectedTier}?`}
              description="Modules not included in this tier will be hidden immediately, even if the business type would normally include them."
              onConfirm={() => tierMutation.mutate(selectedTier)}
              okText="Yes, Switch" okButtonProps={{ style: { background: '#B8860B', borderColor: '#B8860B' } }}>
              <Button type="primary" loading={tierMutation.isPending} style={{ background: '#B8860B', borderColor: '#B8860B' }}>
                ⚡ Switch to {selectedTier}
              </Button>
            </Popconfirm>
            <Button onClick={() => setSelectedTier(null)}>Cancel</Button>
          </div>
        )}
      </Card>

      {/* Module Toggle Table by Group */}
      <div ref={moduleToggleRef}>
      <Card style={{ borderRadius: 8 }} title="Individual Module Control"
        extra={<Text type="secondary" style={{ fontSize: 11 }}>Core modules cannot be disabled</Text>}>
        {Object.entries(grouped).map(([group, mods]) => (
          <div key={group} style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: GROUP_COLORS[group] || '#888', marginRight: 8 }} />
              <Text strong style={{ fontSize: 13, color: GROUP_COLORS[group] || '#333' }}>{group}</Text>
              <Tag style={{ marginLeft: 8, fontSize: 10 }}>{mods.filter(m => m.Is_Enabled).length}/{mods.length} active</Tag>
            </div>
            <Row gutter={[10, 10]}>
              {mods.map(mod => (
                <Col xs={24} sm={12} md={8} lg={6} key={mod.Module_Key}>
                  <div style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '10px 14px', borderRadius: 8,
                    border: `1px solid ${mod.Is_Enabled ? GROUP_COLORS[group] + '44' : '#f0f0f0'}`,
                    background: mod.Is_Enabled ? GROUP_COLORS[group] + '08' : '#fafafa',
                    opacity: mod.Is_Core ? 0.75 : 1,
                  }}>
                    <div>
                      <Text strong style={{ fontSize: 12 }}>{mod.Module_Name}</Text>
                      <br />
                      {mod.Is_Core && <Tag color="default" style={{ fontSize: 9 }}>Core</Tag>}
                      {!mod.Is_Core && !mod.Is_Enabled && !mod.Tier_Restricted && <Tag color="red" style={{ fontSize: 9 }}>Disabled</Tag>}
                      {mod.Tier_Restricted && <Tag color="gold" style={{ fontSize: 9 }}>🔒 Needs higher tier</Tag>}
                    </div>
                    <Tooltip title={
                      mod.Tier_Restricted ? `Not included in the ${subscriptionTier} plan — upgrade to unlock` :
                      mod.Is_Core ? 'Core module — cannot be disabled' :
                      mod.Is_Enabled ? 'Click to disable' : 'Click to enable'
                    }>
                      <Switch
                        size="small"
                        checked={!!mod.Is_Enabled}
                        disabled={!!mod.Is_Core || !!mod.Tier_Restricted}
                        loading={toggleMutation.isPending}
                        onChange={v => toggleMutation.mutate({ key: mod.Module_Key, enabled: v })}
                      />
                    </Tooltip>
                  </div>
                </Col>
              ))}
            </Row>
            <Divider style={{ margin: '12px 0' }} />
          </div>
        ))}
      </Card>
      </div>
      </>
      )}

      <PageTour steps={tourSteps} />
    </div>
  );
}
