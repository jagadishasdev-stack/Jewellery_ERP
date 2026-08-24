import React, { useState, useRef } from 'react';
import {
  Row, Col, Card, Statistic, Typography, Table, Tag, Space, Input,
  Button, Modal, Select, Descriptions, Alert, Badge, Tooltip, Divider,
  Tabs, Form, message, DatePicker, InputNumber,
} from 'antd';
import {
  SearchOutlined, ShopOutlined, GoldOutlined, RiseOutlined,
  UserOutlined, WarningOutlined, CheckCircleOutlined,
  ClockCircleOutlined, BranchesOutlined, TeamOutlined,
  SolutionOutlined, UserAddOutlined, PlusOutlined, KeyOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../api/axios';
import { superAdminApi, tenantApi, licenseApi } from '../../api/modules';
import { formatCurrency } from '../../utils/calculations';
import PageTour from '../../components/PageTour';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { Option } = Select;

export default function SuperAdminDashboard() {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState(null);
  const [searching, setSearching] = useState(false);
  const [detailTenant, setDetailTenant] = useState(null);
  const [detailTab, setDetailTab] = useState('overview');
  const [agentModalOpen, setAgentModalOpen] = useState(false);
  const [userModalOpen, setUserModalOpen] = useState(false);
  const [branchModalOpen, setBranchModalOpen] = useState(false);
  const [licenseModalOpen, setLicenseModalOpen] = useState(false);
  const [issuedLicenseKey, setIssuedLicenseKey] = useState(null);
  const [agentForm] = Form.useForm();
  const [userForm] = Form.useForm();
  const [branchForm] = Form.useForm();
  const [licenseForm] = Form.useForm();
  const qc = useQueryClient();

  // ── Walkthrough tour refs ───────────────────────────────────────────────────
  const summaryRef = useRef(null);
  const searchRef = useRef(null);
  const viewBtnRef = useRef(null);
  const tourSteps = [
    { title: '1. Cross-Tenant Overview', description: 'A live snapshot across every client store you manage — total/active/expiring/expired stores, today\'s combined sales and bills, total stock value, and how many staff are online right now.', target: () => summaryRef.current },
    { title: '2. Find Any Store Instantly', description: 'Search by Store ID, Name, City, GST number or Phone to jump straight to a specific client — clears back to the full list any time.', target: () => searchRef.current },
    { title: '3. Drill Into a Store', description: 'Click View on any row to open that store\'s full detail — today\'s bills/revenue, stock, users, license status, and its Savings Club membership — plus the ability to add agents or admin users for that tenant.', target: () => viewBtnRef.current },
  ];

  // Master dashboard — all tenants
  const { data: dashData, isLoading, refetch } = useQuery({
    queryKey: ['sa-dashboard'],
    queryFn: () => api.get('/super-admin/dashboard').then(r => r.data.data),
    refetchInterval: 60000,
  });

  const storeTypeMutation = useMutation({
    mutationFn: ({ id, store_type }) => api.put(`/super-admin/tenant/${id}/store-type`, { store_type }),
    onSuccess: () => { qc.invalidateQueries(['sa-dashboard']); },
  });

  // Savings Club — cross-tenant summary for the currently selected tenant
  const tenantId = detailTenant?.tenant?.Tenant_ID;

  const { data: savingsSummary, isLoading: savingsLoading, refetch: refetchSavings } = useQuery({
    queryKey: ['sa-tenant-savings', tenantId],
    queryFn: () => superAdminApi.getTenantSavingsSummary(tenantId).then(r => r.data.data),
    enabled: !!tenantId,
  });

  const { data: roles } = useQuery({
    queryKey: ['sa-roles'],
    queryFn: () => tenantApi.getRoles().then(r => r.data.data),
    enabled: !!detailTenant,
  });

  const createAgentMutation = useMutation({
    mutationFn: (data) => superAdminApi.createTenantAgent(tenantId, data),
    onSuccess: () => {
      message.success('✅ Agent created successfully!');
      setAgentModalOpen(false);
      agentForm.resetFields();
      refetchSavings();
    },
    onError: (err) => message.error(err.response?.data?.message || 'Failed to create agent.'),
  });

  const createUserMutation = useMutation({
    mutationFn: (data) => superAdminApi.createTenantUser(tenantId, data),
    onSuccess: () => {
      message.success('✅ Admin user created successfully!');
      setUserModalOpen(false);
      userForm.resetFields();
      refetchSavings();
      qc.invalidateQueries(['sa-dashboard']);
    },
    onError: (err) => message.error(err.response?.data?.message || 'Failed to create user.'),
  });

  const createBranchMutation = useMutation({
    mutationFn: (data) => tenantApi.createBranch({ tenantId, ...data }),
    onSuccess: () => {
      message.success('✅ Branch created successfully!');
      setBranchModalOpen(false);
      branchForm.resetFields();
      openDetail(tenantId);
      qc.invalidateQueries(['sa-dashboard']);
    },
    onError: (err) => message.error(err.response?.data?.message || 'Failed to create branch.'),
  });

  const issueLicenseMutation = useMutation({
    mutationFn: (data) => licenseApi.create({
      tenantId,
      ...data,
      expiryDate: data.expiryDate.format('YYYY-MM-DD'),
    }),
    onSuccess: (res) => {
      message.success('✅ New license key issued!');
      setIssuedLicenseKey(res.data.data.License_Key);
      licenseForm.resetFields();
      openDetail(tenantId);
      qc.invalidateQueries(['sa-dashboard']);
    },
    onError: (err) => message.error(err.response?.data?.message || 'Failed to issue license key.'),
  });

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      const res = await api.get('/super-admin/search', { params: { q: searchQuery } });
      setSearchResults(res.data.data);
    } catch { setSearchResults([]); }
    finally { setSearching(false); }
  };

  const openDetail = async (id) => {
    try {
      const res = await api.get(`/super-admin/tenant/${id}`);
      setDetailTenant(res.data.data);
      setDetailTab('overview');
    } catch {}
  };

  const summary = dashData?.summary || {};
  const tenants = dashData?.tenants || [];

  const storeTypeColor = {
    Retailer: 'green', Wholesaler: 'blue',
    Manufacturer: 'orange', Hybrid: 'purple',
  };

  const statusTag = (t) => {
    const daysLeft = dayjs(t.License_Expiry_Date).diff(dayjs(), 'day');
    if (!t.Is_Active) return <Tag color="red">Inactive</Tag>;
    if (daysLeft < 0) return <Tag color="red">Expired</Tag>;
    if (daysLeft <= 30) return <Tag color="orange">Expiring in {daysLeft}d</Tag>;
    return <Tag color="green">Active</Tag>;
  };

  const columns = [
    {
      title: 'Store',
      render: (_, r) => (
        <Space>
          <ShopOutlined style={{ color: '#B8860B' }} />
          <div>
            <Text strong style={{ fontSize: 13 }}>{r.Company_Name}</Text>
            <br />
            <Text type="secondary" style={{ fontSize: 11 }}>{r.Tenant_ID} | {r.City}</Text>
          </div>
        </Space>
      ),
    },
    {
      title: 'Type',
      dataIndex: 'Store_Type',
      width: 100,
      render: (v, r) => (
        <Select
          value={v || 'Retailer'}
          size="small"
          style={{ width: 120 }}
          onChange={(val) => storeTypeMutation.mutate({ id: r.Tenant_ID, store_type: val })}
        >
          {['Retailer','Wholesaler','Manufacturer','Hybrid'].map(t => (
            <Option key={t} value={t}><Tag color={storeTypeColor[t]}>{t}</Tag></Option>
          ))}
        </Select>
      ),
    },
    {
      title: "Today's Sales",
      render: (_, r) => (
        <div>
          <Text strong style={{ color: '#52c41a' }}>{formatCurrency(r.Today_Sales_Amount)}</Text>
          <br />
          <Text type="secondary" style={{ fontSize: 11 }}>{r.Today_Sales_Count} bills</Text>
        </div>
      ),
    },
    {
      title: 'Stock Value',
      dataIndex: 'Stock_Value',
      render: v => <Text style={{ color: '#B8860B' }}>{formatCurrency(v)}</Text>,
    },
    {
      title: 'Users',
      render: (_, r) => (
        <Space>
          <Badge
            count={r.Active_User_Count}
            style={{ background: r.Active_User_Count > 0 ? '#52c41a' : '#d9d9d9' }}
          />
          <Text type="secondary" style={{ fontSize: 11 }}>/ {r.Max_Users}</Text>
        </Space>
      ),
      width: 80,
    },
    {
      title: 'License',
      render: (_, r) => statusTag(r),
      width: 130,
    },
    {
      title: 'Action',
      width: 80,
      render: (_, r, index) => (
        <Button ref={index === 0 ? viewBtnRef : undefined} size="small" type="link" onClick={() => openDetail(r.Tenant_ID)}>
          View
        </Button>
      ),
    },
  ];

  const renderDataList = (data) => (
    <Table
            scroll={{ x: "max-content" }}
      columns={columns}
      dataSource={data}
      rowKey="Tenant_ID"
      size="small"
      pagination={{ pageSize: 10 }}
      rowClassName={(r) => !r.Is_Active ? 'ant-table-row-selected' : ''}
    />
  );

  return (
    <div className="page-wrapper">
      <div className="page-header">
        <Space>
          <Title level={4} style={{ margin: 0 }}>
            🏢 Master Dashboard — All Stores
          </Title>
          <Tag color="gold">Super Admin View</Tag>
        </Space>
        <Button icon={<SyncOutlined />} onClick={refetch} loading={isLoading}>
          Refresh Stats
        </Button>
      </div>

      {/* Global Summary */}
      <div ref={summaryRef}>
      <Row gutter={[12, 12]} style={{ marginBottom: 20 }}>
        {[
          { title: 'Total Stores', value: summary.total_stores || 0, icon: <ShopOutlined />, color: '#B8860B' },
          { title: 'Active Stores', value: summary.active_stores || 0, icon: <CheckCircleOutlined />, color: '#52c41a' },
          { title: 'Expiring Soon', value: summary.expiring_soon || 0, icon: <WarningOutlined />, color: '#fa8c16' },
          { title: 'Expired', value: summary.expired || 0, icon: <ClockCircleOutlined />, color: '#ff4d4f' },
          { title: "Today's Total Sales", value: summary.today_total_sales || 0, formatter: formatCurrency, icon: <RiseOutlined />, color: '#1890ff' },
          { title: 'Total Bills Today', value: summary.today_total_bills || 0, icon: <ShoppingCartOutlined />, color: '#722ed1', suffix: 'bills' },
          { title: 'Total Stock Value', value: summary.total_stock_value || 0, formatter: formatCurrency, icon: <GoldOutlined />, color: '#B8860B' },
          { title: 'Active Users Now', value: summary.total_active_users || 0, icon: <UserOutlined />, color: '#52c41a', suffix: 'online' },
        ].map((s, i) => (
          <Col xs={12} sm={8} md={6} lg={3} key={i}>
            <Card bodyStyle={{ padding: '14px 12px' }}
              style={{ borderRadius: 8, border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.07)', borderTop: `3px solid ${s.color}` }}>
              <Statistic
                title={<Text style={{ fontSize: 10, color: '#888' }}>{s.title}</Text>}
                value={s.value}
                formatter={s.formatter ? (v) => s.formatter(v) : undefined}
                suffix={s.suffix}
                valueStyle={{ color: s.color, fontSize: 16, fontWeight: 700 }}
              />
            </Card>
          </Col>
        ))}
      </Row>
      </div>

      {/* Global Search */}
      <div ref={searchRef}>
      <Card style={{ borderRadius: 8, marginBottom: 16 }} bodyStyle={{ padding: 16 }}>
        <Space.Compact style={{ width: '100%' }}>
          <Input
            size="large"
            placeholder="Search by Store ID, Name, City, GST, Phone... (e.g. TULASI_BLR)"
            prefix={<SearchOutlined style={{ color: '#B8860B' }} />}
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            onPressEnter={handleSearch}
          />
          <Button type="primary" size="large" loading={searching} onClick={handleSearch}
            style={{ background: '#B8860B', borderColor: '#B8860B' }}>
            Search Store
          </Button>
          {searchResults && (
            <Button size="large" onClick={() => { setSearchResults(null); setSearchQuery(''); }}>
              Clear
            </Button>
          )}
        </Space.Compact>

        {searchResults !== null && (
          <div style={{ marginTop: 16 }}>
            {searchResults.length === 0 ? (
              <Alert message="No stores found for this search." type="warning" showIcon />
            ) : (
              <>
                <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>
                  {searchResults.length} result(s) found
                </Text>
                {renderDataList(searchResults)}
              </>
            )}
          </div>
        )}
      </Card>
      </div>

      {/* All Stores Table */}
      {!searchResults && (
        <Card
          title={`All Client Stores (${tenants.length})`}
          style={{ borderRadius: 8, border: 'none' }}
          bodyStyle={{ padding: 0 }}
        >
          {renderDataList(tenants)}
        </Card>
      )}

      {/* Tenant Detail Modal */}
      <Modal
        title={detailTenant ? `Store Detail — ${detailTenant.tenant?.Company_Name}` : 'Store Detail'}
        open={!!detailTenant}
        onCancel={() => setDetailTenant(null)}
        footer={null}
        width={680}
      >
        {detailTenant && (
          <Tabs
            activeKey={detailTab}
            onChange={setDetailTab}
            items={[
              {
                key: 'overview',
                label: 'Overview',
                children: (
                  <div>
                    <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
                      {[
                        { label: "Today's Bills", value: detailTenant.today_sales?.bills || 0, color: '#1890ff' },
                        { label: "Today's Revenue", value: detailTenant.today_sales?.revenue || 0, formatter: formatCurrency, color: '#52c41a' },
                        { label: 'Stock Items', value: detailTenant.stock_count || 0, color: '#B8860B' },
                        { label: 'Active Users', value: detailTenant.user_count || 0, color: '#722ed1' },
                      ].map((s, i) => (
                        <Col xs={12} md={6} key={i}>
                          <Card bodyStyle={{ padding: 12 }} style={{ borderRadius: 8, textAlign: 'center' }}>
                            <Statistic
                              title={<Text style={{ fontSize: 11 }}>{s.label}</Text>}
                              value={s.value}
                              formatter={s.formatter ? (v) => s.formatter(v) : undefined}
                              valueStyle={{ color: s.color, fontSize: 18, fontWeight: 700 }}
                            />
                          </Card>
                        </Col>
                      ))}
                    </Row>

                    <Descriptions size="small" bordered column={2}>
                      <Descriptions.Item label="Tenant ID">
                        <Text code>{detailTenant.tenant?.Tenant_ID}</Text>
                      </Descriptions.Item>
                      <Descriptions.Item label="Store Type">
                        <Tag color={storeTypeColor[detailTenant.tenant?.Store_Type] || 'default'}>
                          {detailTenant.tenant?.Store_Type || 'Retailer'}
                        </Tag>
                      </Descriptions.Item>
                      <Descriptions.Item label="City">{detailTenant.tenant?.City}</Descriptions.Item>
                      <Descriptions.Item label="GST No">{detailTenant.tenant?.GST_No || '-'}</Descriptions.Item>
                      <Descriptions.Item label="Phone">{detailTenant.tenant?.Phone || '-'}</Descriptions.Item>
                      <Descriptions.Item label="Email">{detailTenant.tenant?.Email || '-'}</Descriptions.Item>
                      <Descriptions.Item label="Branches">{detailTenant.branch_count}</Descriptions.Item>
                      <Descriptions.Item label="Max Users">{detailTenant.tenant?.Max_Users}</Descriptions.Item>
                      <Descriptions.Item label="License Expiry">
                        {dayjs(detailTenant.tenant?.License_Expiry_Date).format('DD-MMM-YYYY')}
                      </Descriptions.Item>
                      <Descriptions.Item label="Today's Gold Rate (22K)">
                        {detailTenant.today_gold_rate
                          ? formatCurrency(detailTenant.today_gold_rate.Rate_22K) + '/g'
                          : <Text type="secondary">Not set today</Text>}
                      </Descriptions.Item>
                    </Descriptions>

                    <Space style={{ marginTop: 12 }}>
                      <Button
                        size="small"
                        icon={<KeyOutlined />}
                        onClick={() => { setIssuedLicenseKey(null); setLicenseModalOpen(true); }}
                      >
                        Issue New License Key
                      </Button>
                    </Space>

                    <Divider style={{ margin: '16px 0 12px' }}>
                      Branches
                      <Button
                        size="small" type="link" icon={<PlusOutlined />}
                        onClick={() => setBranchModalOpen(true)}
                      >
                        Add Branch
                      </Button>
                    </Divider>
                    {detailTenant.branches?.length > 0 ? (
                      detailTenant.branches.map(b => (
                        <Tag key={b.Branch_ID} color={b.Is_Head_Office ? 'gold' : 'blue'} style={{ marginBottom: 6 }}>
                          {b.Branch_Name} {b.Is_Head_Office ? '(HO)' : ''}
                        </Tag>
                      ))
                    ) : (
                      <Text type="secondary" style={{ fontSize: 12 }}>No branches yet.</Text>
                    )}
                  </div>
                ),
              },
              {
                key: 'savings',
                label: 'Savings Club',
                children: (
                  <div>
                    <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
                      {[
                        { label: 'Active Members', value: savingsSummary?.activeMembers || 0, color: '#1890ff' },
                        { label: 'Total Groups', value: savingsSummary?.totalGroups || 0, color: '#722ed1' },
                        { label: 'Active Agents', value: savingsSummary?.activeAgents || 0, color: '#B8860B' },
                        { label: "This Month's Collections", value: savingsSummary?.monthCollectionCount || 0, color: '#52c41a', suffix: 'txns' },
                        { label: "This Month's Amount", value: savingsSummary?.monthCollectionAmount || 0, formatter: formatCurrency, color: '#fa8c16' },
                      ].map((s, i) => (
                        <Col xs={12} md={8} key={i}>
                          <Card bodyStyle={{ padding: 12 }} style={{ borderRadius: 8, textAlign: 'center' }} loading={savingsLoading}>
                            <Statistic
                              title={<Text style={{ fontSize: 11 }}>{s.label}</Text>}
                              value={s.value}
                              formatter={s.formatter ? (v) => s.formatter(v) : undefined}
                              suffix={s.suffix}
                              valueStyle={{ color: s.color, fontSize: 18, fontWeight: 700 }}
                            />
                          </Card>
                        </Col>
                      ))}
                    </Row>

                    <Space>
                      <Button
                        type="primary"
                        icon={<UserAddOutlined />}
                        style={{ background: '#B8860B', borderColor: '#B8860B' }}
                        onClick={() => setAgentModalOpen(true)}
                      >
                        Add Agent
                      </Button>
                      <Button
                        icon={<TeamOutlined />}
                        style={{ borderColor: '#B8860B', color: '#B8860B' }}
                        onClick={() => setUserModalOpen(true)}
                      >
                        Add Admin User
                      </Button>
                    </Space>
                  </div>
                ),
              },
            ]}
          />
        )}
      </Modal>

      {/* Add Agent Modal (Savings Club) */}
      <Modal
        title="➕ Add Agent"
        open={agentModalOpen}
        onCancel={() => { setAgentModalOpen(false); agentForm.resetFields(); }}
        footer={null}
        width={540}
        destroyOnClose
      >
        <Form
          form={agentForm}
          layout="vertical"
          onFinish={(v) => createAgentMutation.mutate(v)}
          onFinishFailed={({ errorFields }) => message.error(`Fix: ${errorFields.map(f => f.name[0]).join(', ')}`)}
        >
          <Row gutter={14}>
            <Col xs={12}>
              <Form.Item name="Agent_Name" label="Agent Name" rules={[{ required: true, message: 'Agent name required' }]}>
                <Input />
              </Form.Item>
            </Col>
            <Col xs={12}>
              <Form.Item
                name="Mobile"
                label="Mobile"
                rules={[
                  { required: true, message: 'Mobile required' },
                  { pattern: /^\d{10}$/, message: 'Enter a valid 10-digit mobile' },
                ]}
              >
                <Input placeholder="10-digit mobile" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={14}>
            <Col xs={12}>
              <Form.Item name="Agent_Code" label="Agent Code (optional)">
                <Input placeholder="Auto-generated if blank" />
              </Form.Item>
            </Col>
            <Col xs={12}>
              <Form.Item name="Email" label="Email">
                <Input type="email" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={14}>
            <Col xs={12}>
              <Form.Item name="Commission_Percent" label="Commission %">
                <Input type="number" step="0.01" />
              </Form.Item>
            </Col>
            <Col xs={12}>
              <Form.Item name="Branch_ID" label="Branch">
                <Select allowClear placeholder="Select branch">
                  {(detailTenant?.branches || []).map(b => (
                    <Option key={b.Branch_ID} value={b.Branch_ID}>{b.Branch_Name}</Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="Address" label="Address">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Button
            type="primary"
            htmlType="submit"
            block
            size="large"
            loading={createAgentMutation.isPending}
            style={{ background: '#B8860B', borderColor: '#B8860B', fontWeight: 700 }}
          >
            Create Agent
          </Button>
        </Form>
      </Modal>

      {/* Add Admin User Modal (Savings Club) */}
      <Modal
        title="➕ Add Admin User"
        open={userModalOpen}
        onCancel={() => { setUserModalOpen(false); userForm.resetFields(); }}
        footer={null}
        width={580}
        destroyOnClose
      >
        <Form
          form={userForm}
          layout="vertical"
          onFinish={(v) => createUserMutation.mutate(v)}
          onFinishFailed={({ errorFields }) => message.error(`Fix: ${errorFields.map(f => f.name[0]).join(', ')}`)}
        >
          <Row gutter={14}>
            <Col xs={12}>
              <Form.Item name="Full_Name" label="Full Name" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
            </Col>
            <Col xs={12}>
              <Form.Item
                name="Username"
                label="Username"
                rules={[{ required: true, message: 'Username required' }, { min: 3, message: 'Min 3 chars' }]}
              >
                <Input placeholder="e.g. admin01" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={14}>
            <Col xs={12}>
              <Form.Item name="Password" label="Password" rules={[{ required: true, min: 8, message: 'Min 8 characters' }]}>
                <Input.Password placeholder="Min 8 characters" />
              </Form.Item>
            </Col>
            <Col xs={12}>
              <Form.Item name="Role_ID" label="Role" rules={[{ required: true, message: 'Role required' }]}>
                <Select placeholder="Select role">
                  {(roles || []).map(r => (
                    <Option key={r.Role_ID} value={r.Role_ID}>{r.Role_Name}</Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={14}>
            <Col xs={12}>
              <Form.Item name="Mobile" label="Mobile">
                <Input />
              </Form.Item>
            </Col>
            <Col xs={12}>
              <Form.Item name="Email" label="Email">
                <Input type="email" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={14}>
            <Col xs={10}>
              <Form.Item name="Branch_ID" label="Branch">
                <Select allowClear placeholder="All branches">
                  {(detailTenant?.branches || []).map(b => (
                    <Option key={b.Branch_ID} value={b.Branch_ID}>{b.Branch_Name}</Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
            <Col xs={7}>
              <Form.Item name="Employee_Code" label="Employee Code">
                <Input placeholder="EMP001" />
              </Form.Item>
            </Col>
            <Col xs={7}>
              <Form.Item name="Department" label="Department">
                <Input placeholder="Sales" />
              </Form.Item>
            </Col>
          </Row>
          <Button
            type="primary"
            htmlType="submit"
            block
            size="large"
            loading={createUserMutation.isPending}
            style={{ background: '#B8860B', borderColor: '#B8860B', fontWeight: 700 }}
          >
            Create Admin User
          </Button>
        </Form>
      </Modal>

      {/* Add Branch Modal */}
      <Modal
        title="🏬 Add Branch"
        open={branchModalOpen}
        onCancel={() => { setBranchModalOpen(false); branchForm.resetFields(); }}
        footer={null}
        width={520}
        destroyOnClose
      >
        <Form
          form={branchForm}
          layout="vertical"
          onFinish={(v) => createBranchMutation.mutate(v)}
          onFinishFailed={({ errorFields }) => message.error(`Fix: ${errorFields.map(f => f.name[0]).join(', ')}`)}
        >
          <Row gutter={14}>
            <Col xs={14}>
              <Form.Item name="branchName" label="Branch Name" rules={[{ required: true, message: 'Branch name required' }]}>
                <Input placeholder="e.g. Whitefield Branch" />
              </Form.Item>
            </Col>
            <Col xs={10}>
              <Form.Item name="branchCode" label="Branch Code">
                <Input placeholder="Auto if blank" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={14}>
            <Col xs={12}>
              <Form.Item name="city" label="City">
                <Input />
              </Form.Item>
            </Col>
            <Col xs={12}>
              <Form.Item name="state" label="State">
                <Input />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={14}>
            <Col xs={12}>
              <Form.Item name="phone" label="Phone">
                <Input />
              </Form.Item>
            </Col>
            <Col xs={12}>
              <Form.Item name="pincode" label="Pincode">
                <Input />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="address1" label="Address">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Button
            type="primary"
            htmlType="submit"
            block
            size="large"
            loading={createBranchMutation.isPending}
            style={{ background: '#B8860B', borderColor: '#B8860B', fontWeight: 700 }}
          >
            Create Branch
          </Button>
        </Form>
      </Modal>

      {/* Issue New License Key Modal */}
      <Modal
        title="🔑 Issue New License Key"
        open={licenseModalOpen}
        onCancel={() => { setLicenseModalOpen(false); licenseForm.resetFields(); setIssuedLicenseKey(null); }}
        footer={null}
        width={520}
        destroyOnClose
      >
        {issuedLicenseKey ? (
          <div style={{ textAlign: 'center', padding: '12px 0' }}>
            <Alert
              type="success"
              showIcon
              message="License key issued — share this with the customer"
              description={
                <Text code copyable style={{ fontSize: 16 }}>{issuedLicenseKey}</Text>
              }
            />
            <Text type="secondary" style={{ display: 'block', marginTop: 12, fontSize: 12 }}>
              This key immediately supersedes the tenant's previous key — the Image App / Scheme App
              will activate using this new key.
            </Text>
          </div>
        ) : (
          <Form
            form={licenseForm}
            layout="vertical"
            initialValues={{ licenseType: 'Yearly', maxUsers: 10, maxBranches: 1 }}
            onFinish={(v) => issueLicenseMutation.mutate(v)}
            onFinishFailed={({ errorFields }) => message.error(`Fix: ${errorFields.map(f => f.name[0]).join(', ')}`)}
          >
            <Form.Item name="licenseType" label="License Type" rules={[{ required: true }]}>
              <Select>
                <Option value="Trial">Trial</Option>
                <Option value="Monthly">Monthly</Option>
                <Option value="Yearly">Yearly</Option>
                <Option value="Perpetual">Perpetual</Option>
              </Select>
            </Form.Item>
            <Form.Item name="expiryDate" label="Expiry Date" rules={[{ required: true, message: 'Expiry date required' }]}>
              <DatePicker style={{ width: '100%' }} disabledDate={(d) => d && d.isBefore(dayjs(), 'day')} />
            </Form.Item>
            <Row gutter={14}>
              <Col xs={12}>
                <Form.Item name="maxUsers" label="Max Users" rules={[{ required: true }]}>
                  <InputNumber min={1} style={{ width: '100%' }} />
                </Form.Item>
              </Col>
              <Col xs={12}>
                <Form.Item name="maxBranches" label="Max Branches" rules={[{ required: true }]}>
                  <InputNumber min={1} style={{ width: '100%' }} />
                </Form.Item>
              </Col>
            </Row>
            <Button
              type="primary"
              htmlType="submit"
              block
              size="large"
              loading={issueLicenseMutation.isPending}
              style={{ background: '#B8860B', borderColor: '#B8860B', fontWeight: 700 }}
            >
              Issue License Key
            </Button>
          </Form>
        )}
      </Modal>

      <PageTour steps={tourSteps} />
    </div>
  );
}

// Missing icon import
import { SyncOutlined, ShoppingCartOutlined } from '@ant-design/icons';
