/**
 * AgentManagementPage — ERP Admin creates & manages savings agents
 * ─────────────────────────────────────────────────────────────────
 * Agents are created here → they log in via mobile OTP in the savings app.
 * No passwords. Agent Code auto-generated or manually set.
 */
import React, { useState, useRef } from 'react';
import {
  Table, Button, Modal, Form, Input, Select, InputNumber,
  Space, Tag, Tooltip, Statistic, Card, Row, Col,
  Drawer, Descriptions, Typography, message, Popconfirm,
  Badge, Alert,
} from 'antd';
import {
  PlusOutlined, EditOutlined, StopOutlined, SearchOutlined,
  UserOutlined, PhoneOutlined, ReloadOutlined, BarChartOutlined,
  CheckCircleOutlined, ExclamationCircleOutlined, TeamOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { agentsApi, tenantApi } from '../../api/modules';
import PageTour from '../../components/PageTour';

const { Title, Text } = Typography;

// ── Hooks ─────────────────────────────────────────────────────────────────────
const useAgents = (params) =>
  useQuery({
    queryKey: ['agents', params],
    queryFn: () => agentsApi.getAll(params).then(r => r.data.data),
  });

const useBranches = () =>
  useQuery({
    queryKey: ['branches'],
    queryFn: () => tenantApi.getBranches().then(r => r.data.data),
  });

const useAgentReport = (agentId, params) =>
  useQuery({
    queryKey: ['agent-report', agentId, params],
    queryFn: () => agentsApi.getReport(agentId, params).then(r => r.data.data),
    enabled: !!agentId,
  });

export default function AgentManagementPage() {
  const qc = useQueryClient();
  const [form] = Form.useForm();

  const [search,      setSearch]      = useState('');
  const [statusFilter, setStatusFilter] = useState('Active');
  const [modalOpen,   setModalOpen]   = useState(false);
  const [editAgent,   setEditAgent]   = useState(null);
  const [reportAgent, setReportAgent] = useState(null); // agent obj for report drawer

  const { data: agentData, isLoading } = useAgents({ status: statusFilter, search: search || undefined });
  const { data: branches = [] }        = useBranches();
  const agents = agentData?.items || [];
  const total  = agentData?.total  || 0;

  const { data: reportData, isLoading: reportLoading } = useAgentReport(
    reportAgent?.Agent_ID,
    { limit: 100 }
  );

  // ── Mutations ──────────────────────────────────────────────────────────────
  const createMut = useMutation({
    mutationFn: (data) => agentsApi.create(data),
    onSuccess: () => { message.success('Agent created successfully.'); qc.invalidateQueries(['agents']); setModalOpen(false); form.resetFields(); },
    onError: (e) => message.error(e.response?.data?.message || 'Failed to create agent.'),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }) => agentsApi.update(id, data),
    onSuccess: () => { message.success('Agent updated.'); qc.invalidateQueries(['agents']); setModalOpen(false); form.resetFields(); setEditAgent(null); },
    onError: (e) => message.error(e.response?.data?.message || 'Failed to update agent.'),
  });

  const deactivateMut = useMutation({
    mutationFn: (id) => agentsApi.deactivate(id),
    onSuccess: () => { message.success('Agent deactivated.'); qc.invalidateQueries(['agents']); },
    onError: (e) => message.error(e.response?.data?.message || 'Failed.'),
  });

  // ── Handlers ───────────────────────────────────────────────────────────────
  const openCreate = () => { form.resetFields(); setEditAgent(null); setModalOpen(true); };
  const openEdit   = (agent) => { setEditAgent(agent); form.setFieldsValue({ ...agent }); setModalOpen(true); };

  const handleSubmit = async () => {
    const values = await form.validateFields();
    if (editAgent) {
      updateMut.mutate({ id: editAgent.Agent_ID, data: values });
    } else {
      createMut.mutate(values);
    }
  };

  // ── Summary cards ──────────────────────────────────────────────────────────
  const activeCount   = agents.filter(a => a.Status === 'Active').length;
  const inactiveCount = agents.filter(a => a.Status === 'Inactive').length;

  // ── Walkthrough tour refs ───────────────────────────────────────────────────
  const summaryRef = useRef(null);
  const addBtnRef = useRef(null);
  const tableRef = useRef(null);
  const tourSteps = [
    { title: '1. Agent Overview', description: 'A quick count of how many field collection agents you have, how many are active, and which branches they cover.', target: () => summaryRef.current },
    { title: '2. Add an Agent', description: 'Click here to onboard a field agent — enter their name and mobile number (this mobile is their login for the Savings App, verified by OTP — no password needed), assign a branch/area and an optional commission %.', target: () => addBtnRef.current },
    { title: '3. Agents List', description: 'Every agent, their assigned branch, commission and status. Use Edit to update their details, Deactivate to stop their app access, and the chart icon to open their Collection Report — a full history of installments they\'ve collected.', target: () => tableRef.current },
  ];

  // ── Columns ────────────────────────────────────────────────────────────────
  const columns = [
    {
      title: 'Agent Code',
      dataIndex: 'Agent_Code',
      width: 130,
      render: (v) => <Text code strong>{v}</Text>,
    },
    {
      title: 'Name',
      dataIndex: 'Agent_Name',
      render: (v, r) => (
        <Space>
          <UserOutlined style={{ color: '#888' }} />
          <Text strong>{v}</Text>
        </Space>
      ),
    },
    {
      title: 'Mobile',
      dataIndex: 'Mobile',
      width: 140,
      render: (v) => (
        <Space>
          <PhoneOutlined style={{ color: '#52c41a' }} />
          <Text>{v}</Text>
        </Space>
      ),
    },
    {
      title: 'Branch',
      dataIndex: 'Branch_ID',
      width: 140,
      render: (v) => {
        const b = branches.find(br => br.Branch_ID === v);
        return b ? <Tag>{b.Branch_Name}</Tag> : <Text type="secondary">—</Text>;
      },
    },
    {
      title: 'Commission',
      dataIndex: 'Commission_Pct',
      width: 110,
      align: 'center',
      render: (v) => v > 0 ? <Tag color="green">{v}%</Tag> : <Text type="secondary">—</Text>,
    },
    {
      title: 'Status',
      dataIndex: 'Status',
      width: 100,
      render: (v) => (
        <Badge
          status={v === 'Active' ? 'success' : 'default'}
          text={v}
        />
      ),
    },
    {
      title: 'Created',
      dataIndex: 'Created_Date',
      width: 120,
      render: (v) => dayjs(v).format('DD MMM YYYY'),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 150,
      render: (_, r) => (
        <Space size="small">
          <Tooltip title="Edit">
            <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} />
          </Tooltip>
          <Tooltip title="Collection Report">
            <Button size="small" icon={<BarChartOutlined />} type="primary" ghost onClick={() => setReportAgent(r)} />
          </Tooltip>
          {r.Status === 'Active' && (
            <Popconfirm
              title="Deactivate this agent?"
              onConfirm={() => deactivateMut.mutate(r.Agent_ID)}
              okText="Yes" cancelText="No"
            >
              <Tooltip title="Deactivate">
                <Button size="small" icon={<StopOutlined />} danger />
              </Tooltip>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  // ── Report drawer columns ──────────────────────────────────────────────────
  const reportColumns = [
    { title: 'Receipt No', dataIndex: 'Receipt_Number', width: 160, render: v => <Text code>{v}</Text> },
    { title: 'Date', dataIndex: 'Payment_Date', width: 110, render: v => dayjs(v).format('DD MMM YYYY') },
    { title: 'Customer', dataIndex: 'Member_Name' },
    { title: 'Mobile', dataIndex: 'Mobile', width: 120 },
    { title: 'Installment #', dataIndex: 'Installment_Number', width: 110, align: 'center' },
    { title: 'Amount', dataIndex: 'Net_Amount', width: 100, align: 'right', render: v => `₹${Number(v).toLocaleString('en-IN')}` },
    { title: 'Mode', dataIndex: 'Payment_Mode', width: 90, render: v => <Tag>{v}</Tag> },
  ];

  return (
    <div style={{ padding: 24 }}>
      {/* Page header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <Title level={4} style={{ margin: 0 }}>
          <TeamOutlined style={{ marginRight: 8 }} />
          Agent Management
        </Title>
        <Button ref={addBtnRef} type="primary" icon={<PlusOutlined />} onClick={openCreate}>
          Add Agent
        </Button>
      </div>

      <Alert
        type="info"
        showIcon
        message="Agents log in to the Savings App using their mobile number + OTP. No password required."
        style={{ marginBottom: 16 }}
        closable
      />

      {/* Summary cards */}
      <div ref={summaryRef}>
      <Row gutter={16} style={{ marginBottom: 20 }}>
        <Col xs={12} sm={6}>
          <Card size="small">
            <Statistic title="Total Agents" value={total} prefix={<TeamOutlined />} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small">
            <Statistic title="Active" value={activeCount} valueStyle={{ color: '#52c41a' }} prefix={<CheckCircleOutlined />} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small">
            <Statistic title="Inactive" value={inactiveCount} valueStyle={{ color: '#999' }} prefix={<ExclamationCircleOutlined />} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small">
            <Statistic title="Branches" value={branches.length} prefix={<UserOutlined />} />
          </Card>
        </Col>
      </Row>
      </div>

      {/* Filters */}
      <Space style={{ marginBottom: 12 }} wrap>
        <Input
          placeholder="Search name / mobile / code"
          prefix={<SearchOutlined />}
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ width: 260 }}
          allowClear
        />
        <Select
          value={statusFilter}
          onChange={setStatusFilter}
          style={{ width: 130 }}
          options={[
            { value: '', label: 'All Status' },
            { value: 'Active', label: 'Active' },
            { value: 'Inactive', label: 'Inactive' },
          ]}
        />
        <Button icon={<ReloadOutlined />} onClick={() => qc.invalidateQueries(['agents'])}>
          Refresh
        </Button>
      </Space>

      {/* Agents table */}
      <div ref={tableRef}>
      <Table
        columns={columns}
        dataSource={agents}
        rowKey="Agent_ID"
        loading={isLoading}
        size="small"
        scroll={{ x: 900 }}
        pagination={{ pageSize: 20, showSizeChanger: false, showTotal: (t) => `${t} agents` }}
      />
      </div>

      {/* ── Create / Edit Modal ────────────────────────────────────────────── */}
      <Modal
        title={editAgent ? 'Edit Agent' : 'Add New Agent'}
        open={modalOpen}
        onOk={handleSubmit}
        onCancel={() => { setModalOpen(false); form.resetFields(); setEditAgent(null); }}
        confirmLoading={createMut.isPending || updateMut.isPending}
        okText={editAgent ? 'Update' : 'Create Agent'}
        width={520}
        destroyOnClose
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item
                name="Agent_Name"
                label="Agent Name"
                rules={[{ required: true, message: 'Required' }]}
              >
                <Input prefix={<UserOutlined />} placeholder="Full name" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="Mobile"
                label="Mobile Number"
                rules={[
                  { required: true, message: 'Required' },
                  { pattern: /^\d{10}$/, message: '10 digits required' },
                ]}
              >
                <Input prefix={<PhoneOutlined />} placeholder="10-digit mobile" maxLength={10} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="Agent_Code" label="Agent Code (auto if blank)">
                <Input placeholder="Auto-generated" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="Branch_ID" label="Branch">
                <Select
                  placeholder="Select branch"
                  allowClear
                  options={branches.map(b => ({ value: b.Branch_ID, label: b.Branch_Name }))}
                />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="Email" label="Email (optional)">
                <Input type="email" placeholder="agent@example.com" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="Commission_Pct" label="Commission %">
                <InputNumber min={0} max={100} step={0.5} style={{ width: '100%' }} placeholder="0" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="Address" label="Address (optional)">
            <Input.TextArea rows={2} placeholder="Agent address" />
          </Form.Item>
          {editAgent && (
            <Form.Item name="Status" label="Status">
              <Select
                options={[
                  { value: 'Active', label: 'Active' },
                  { value: 'Inactive', label: 'Inactive' },
                ]}
              />
            </Form.Item>
          )}
        </Form>
      </Modal>

      {/* ── Agent Report Drawer ────────────────────────────────────────────── */}
      <Drawer
        title={
          <Space>
            <BarChartOutlined />
            Collection Report — {reportAgent?.Agent_Name}
            <Tag color="blue" style={{ marginLeft: 4 }}>{reportAgent?.Agent_Code}</Tag>
          </Space>
        }
        open={!!reportAgent}
        onClose={() => setReportAgent(null)}
        width={820}
        bodyStyle={{ padding: 16 }}
      >
        {reportAgent && (
          <>
            {/* Summary */}
            <Row gutter={16} style={{ marginBottom: 16 }}>
              <Col span={8}>
                <Card size="small">
                  <Statistic
                    title="Total Collected"
                    value={reportData?.summary?.totalAmount || 0}
                    prefix="₹"
                    precision={2}
                    valueStyle={{ color: '#52c41a' }}
                  />
                </Card>
              </Col>
              <Col span={8}>
                <Card size="small">
                  <Statistic
                    title="Transactions"
                    value={reportData?.summary?.totalCount || 0}
                  />
                </Card>
              </Col>
              <Col span={8}>
                <Card size="small">
                  <Statistic
                    title="Branch"
                    value={branches.find(b => b.Branch_ID === reportAgent.Branch_ID)?.Branch_Name || '—'}
                  />
                </Card>
              </Col>
            </Row>

            {/* Transactions table */}
            <Table
              columns={reportColumns}
              dataSource={reportData?.items || []}
              rowKey="Txn_ID"
              loading={reportLoading}
              size="small"
              scroll={{ x: 700 }}
              pagination={{ pageSize: 15, showSizeChanger: false }}
            />
          </>
        )}
      </Drawer>

      <PageTour steps={tourSteps} />
    </div>
  );
}
