/**
 * Audit & Security — Admin Only
 * Complete Audit Log | User Activity | Deleted Entries | Edit History |
 * Active Sessions | Login History | Role Permissions
 *
 * Every transaction shows: User, DateTime, Branch, Device, IP, Old→New values
 */
import React, { useState, useRef } from 'react';
import {
  Row, Col, Card, Typography, DatePicker, Button, Space, Tag, Tabs,
  Table, Statistic, Input, Select, Badge, Alert, Tooltip, Modal,
  Popconfirm, message, Timeline, Divider,
} from 'antd';
import {
  SafetyOutlined, UserOutlined, DeleteOutlined, EditOutlined,
  LoginOutlined, LogoutOutlined, SearchOutlined, DownloadOutlined,
  EyeOutlined, StopOutlined, HistoryOutlined, AuditOutlined,
  DesktopOutlined, GlobalOutlined, TeamOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { auditApi } from '../../api/modules';
import { useAuthStore } from '../../store/authStore';
import PageTour from '../../components/PageTour';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;
const { Option } = Select;

// Action → color/icon mapping
const ACTION_META = {
  INSERT:       { color: 'green',   icon: '➕', label: 'Created' },
  UPDATE:       { color: 'blue',    icon: '✏️', label: 'Updated' },
  DELETE:       { color: 'red',     icon: '🗑️', label: 'Deleted' },
  VIEW:         { color: 'default', icon: '👁', label: 'Viewed' },
  LOGIN:        { color: 'cyan',    icon: '🔑', label: 'Login' },
  LOGOUT:       { color: 'purple',  icon: '🚪', label: 'Logout' },
  LOGIN_FAILED: { color: 'red',     icon: '❌', label: 'Login Failed' },
  PRINT:        { color: 'orange',  icon: '🖨', label: 'Printed' },
  APPROVE:      { color: 'green',   icon: '✅', label: 'Approved' },
  REJECT:       { color: 'red',     icon: '🚫', label: 'Rejected' },
};

const exportCSV = (data, name) => {
  if (!data?.length) { message.warning('No data.'); return; }
  const csv = [Object.keys(data[0]).join(','), ...data.map(r => Object.values(r).map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','))].join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = `${name}_${dayjs().format('YYYYMMDD_HHmm')}.csv`;
  a.click();
};

export default function AuditSecurityPage() {
  const { user } = useAuthStore();
  const qc = useQueryClient();
  const isAdmin = user?.roleName === 'Super Admin' || user?.roleName === 'Admin' || user?.permissions?.global_master;

  const [activeTab, setActiveTab] = useState('summary');
  const [dateRange, setDateRange] = useState([dayjs().subtract(7, 'day'), dayjs()]);
  const [filters, setFilters] = useState({ search: '', actionType: '', tableName: '', page: 1 });
  const [detailModal, setDetailModal] = useState(null); // selected log row

  // ── Walkthrough tour refs ───────────────────────────────────────────────────
  const dateRangeRef = useRef(null);
  const tabsRef = useRef(null);
  const filtersRef = useRef(null);
  const tourSteps = [
    { title: '1. Pick a Date Range', description: 'Choose the period you want to review — most tabs (logs, activity, logins) respect this range.', target: () => dateRangeRef.current },
    { title: '2. Switch Between Log Types', description: 'Security Dashboard gives a live overview, Full Audit Log lists every create/update/delete with old→new values, User Activity totals actions per staff member, Deleted Entries preserves removed records, Active Sessions lets you force-logout a device, and Login History shows every sign-in attempt.', target: () => tabsRef.current },
    { title: '3. Filter the Full Audit Log', description: 'Narrow the log down by searching a user/record, picking an Action Type, or typing a table name — then Export CSV to save the filtered list.', target: () => filtersRef.current },
    { title: '4. See Exactly What Changed', description: 'Click the eye icon on any row to open a side-by-side Old Value → New Value comparison, along with who made the change, when, and from which device/IP.' },
  ];

  const fromDate = dateRange[0].format('YYYY-MM-DD');
  const toDate   = dateRange[1].format('YYYY-MM-DD');

  // ── Queries ────────────────────────────────────────────────────────────────
  const { data: summary } = useQuery({
    queryKey: ['audit-summary'],
    queryFn: () => auditApi.getSummary().then(r => r.data.data),
    refetchInterval: 30000,
    enabled: isAdmin,
  });

  const { data: logsData, isLoading: logsLoading } = useQuery({
    queryKey: ['audit-logs', fromDate, toDate, filters],
    queryFn: () => auditApi.getLogs({ fromDate, toDate, ...filters, limit: 50 }).then(r => r.data.data),
    enabled: isAdmin && activeTab === 'logs',
  });

  const { data: activityData } = useQuery({
    queryKey: ['audit-activity', fromDate, toDate],
    queryFn: () => auditApi.getUserActivity({ fromDate, toDate }).then(r => r.data.data || []),
    enabled: isAdmin && activeTab === 'activity',
  });

  const { data: deletedData } = useQuery({
    queryKey: ['audit-deleted'],
    queryFn: () => auditApi.getDeletedEntries().then(r => r.data.data || []),
    enabled: isAdmin && activeTab === 'deleted',
  });

  const { data: sessionsData } = useQuery({
    queryKey: ['audit-sessions'],
    queryFn: () => auditApi.getActiveSessions().then(r => r.data.data || []),
    refetchInterval: 15000,
    enabled: isAdmin && activeTab === 'sessions',
  });

  const { data: loginHistory } = useQuery({
    queryKey: ['audit-logins', fromDate, toDate],
    queryFn: () => auditApi.getLoginHistory({ fromDate, toDate }).then(r => r.data.data || []),
    enabled: isAdmin && activeTab === 'logins',
  });

  const terminateMutation = useMutation({
    mutationFn: (id) => auditApi.terminateSession(id),
    onSuccess: () => { message.success('Session terminated.'); qc.invalidateQueries(['audit-sessions']); },
    onError: () => message.error('Failed to terminate session.'),
  });

  if (!isAdmin) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <SafetyOutlined style={{ fontSize: 64, color: '#ff4d4f' }} />
        <Title level={3} style={{ color: '#ff4d4f', marginTop: 16 }}>Access Denied</Title>
        <Text type="secondary">Audit & Security is restricted to Admin users only.</Text>
      </div>
    );
  }

  // ── Shared log columns (reused across tabs) ────────────────────────────────
  const logColumns = [
    {
      title: 'Date & Time', dataIndex: 'Created_Date', width: 155,
      render: v => (
        <div>
          <Text style={{ fontSize: 12, fontWeight: 600 }}>{dayjs(v).format('DD-MMM-YYYY')}</Text>
          <br /><Text type="secondary" style={{ fontSize: 11 }}>{dayjs(v).format('HH:mm:ss')}</Text>
        </div>
      ),
    },
    {
      title: 'User', width: 150,
      render: (_, r) => (
        <div>
          <Text strong style={{ fontSize: 12 }}>{r.Full_Name || r.User_Full_Name || r.Username || 'System'}</Text>
          <br /><Text type="secondary" style={{ fontSize: 11 }}>@{r.Username}</Text>
        </div>
      ),
    },
    {
      title: 'Action', dataIndex: 'Action_Type', width: 110,
      render: v => {
        const m = ACTION_META[v] || { color: 'default', icon: '•', label: v };
        return <Tag color={m.color} style={{ fontSize: 11 }}>{m.icon} {m.label}</Tag>;
      },
    },
    {
      title: 'Table / Module', dataIndex: 'Table_Name', width: 160,
      render: (v, r) => (
        <div>
          <Text style={{ fontSize: 11, fontWeight: 600, color: '#B8860B' }}>{v?.replace('tbl_', '').replace(/_/g, ' ').toUpperCase()}</Text>
          {r.Record_ID && <><br /><Text code style={{ fontSize: 10 }}>#{r.Record_ID}</Text></>}
        </div>
      ),
    },
    {
      title: 'Description', dataIndex: 'Description',
      render: (v, r) => <Text style={{ fontSize: 11 }}>{v || `${r.Action_Type} on ${r.Table_Name}`}</Text>,
    },
    {
      title: 'Device / IP', width: 160,
      render: (_, r) => (
        <div>
          <Tooltip title={r.Device_Info}>
            <Text style={{ fontSize: 11 }}><DesktopOutlined /> {r.Device_Info?.split(' ')[0] || 'Unknown'}</Text>
          </Tooltip>
          <br /><Text type="secondary" style={{ fontSize: 11 }}><GlobalOutlined /> {r.IP_Address || '-'}</Text>
        </div>
      ),
    },
    {
      title: '', width: 40,
      render: (_, r) => (
        (r.Old_Data || r.New_Data) && (
          <Tooltip title="View change details">
            <Button type="text" size="small" icon={<EyeOutlined />} onClick={() => setDetailModal(r)} />
          </Tooltip>
        )
      ),
    },
  ];

  // ── Summary Tab ────────────────────────────────────────────────────────────
  const SummaryTab = () => (
    <>
      <Row gutter={[10, 10]} style={{ marginBottom: 16 }}>
        {[
          { title: 'Total Audit Logs', value: summary?.totalLogs || 0, color: '#B8860B', icon: <AuditOutlined /> },
          { title: "Today's Activity", value: summary?.todayLogs || 0, color: '#1890ff', icon: <HistoryOutlined /> },
          { title: "Today's Logins", value: summary?.todayLogins || 0, color: '#52c41a', icon: <LoginOutlined /> },
          { title: 'Active Sessions', value: summary?.activeSessions || 0, color: '#722ed1', icon: <TeamOutlined /> },
          { title: 'Deletes Today', value: summary?.deletedToday || 0, color: '#ff4d4f', icon: <DeleteOutlined /> },
        ].map((c, i) => (
          <Col xs={12} sm={8} lg={4} key={i}>
            <Card bodyStyle={{ padding: '12px 14px' }} style={{ borderRadius: 8, border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,.07)', borderTop: `3px solid ${c.color}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <Statistic title={<Text style={{ fontSize: 11, color: '#888' }}>{c.title}</Text>}
                  value={c.value} valueStyle={{ color: c.color, fontSize: 20, fontWeight: 700 }} />
                <div style={{ color: c.color, fontSize: 22, opacity: 0.5, marginTop: 4 }}>{c.icon}</div>
              </div>
            </Card>
          </Col>
        ))}
      </Row>

      <Row gutter={[14, 14]}>
        {/* Action breakdown */}
        <Col xs={24} md={10}>
          <Card title="Today's Actions by Type" style={{ borderRadius: 8 }} bodyStyle={{ padding: 0 }}>
            <Table
            scroll={{ x: "max-content" }}
              columns={[
                { title: 'Action', dataIndex: 'Action_Type', render: v => { const m = ACTION_META[v]||{color:'default',icon:'•',label:v}; return <Tag color={m.color}>{m.icon} {m.label}</Tag>; } },
                { title: 'Count', dataIndex: 'count', render: v => <Badge count={parseInt(v)} style={{ background: '#B8860B' }} showZero /> },
              ]}
              dataSource={summary?.byAction || []} rowKey="Action_Type" size="small" pagination={false} />
          </Card>
        </Col>
        {/* Recent activity */}
        <Col xs={24} md={14}>
          <Card title="Recent Activity (Live)" style={{ borderRadius: 8 }}
            extra={<Text style={{ fontSize: 11, color: '#888' }}>Auto-refreshes every 30s</Text>}>
            <Timeline
              items={(summary?.recentActivity || []).map(a => ({
                color: ACTION_META[a.Action_Type]?.color || 'blue',
                children: (
                  <div style={{ fontSize: 12 }}>
                    <Space size={6}>
                      <Text strong>{a.Full_Name || a.Username}</Text>
                      <Tag color={ACTION_META[a.Action_Type]?.color || 'blue'} style={{ fontSize: 10 }}>
                        {ACTION_META[a.Action_Type]?.icon} {a.Action_Type}
                      </Tag>
                      <Text type="secondary">{a.Table_Name?.replace('tbl_', '')}</Text>
                    </Space>
                    <br />
                    <Text type="secondary" style={{ fontSize: 11 }}>
                      {dayjs(a.Created_Date).format('HH:mm:ss')} · {a.IP_Address}
                      {a.Description ? ` · ${a.Description}` : ''}
                    </Text>
                  </div>
                ),
              }))}
            />
          </Card>
        </Col>
      </Row>
    </>
  );

  // ── User Activity Tab ──────────────────────────────────────────────────────
  const ActivityTab = () => (
    <Card title="User Activity Summary" bodyStyle={{ padding: 0 }} style={{ borderRadius: 8 }}
      extra={<Button size="small" icon={<DownloadOutlined />} onClick={() => exportCSV(activityData, 'user_activity')}>CSV</Button>}>
      <Table
            scroll={{ x: "max-content" }}
        columns={[
          { title: 'User', render: (_, r) => <div><Text strong style={{ fontSize: 12 }}>{r.Full_Name || r.Username}</Text><br /><Text code style={{ fontSize: 11 }}>@{r.Username}</Text></div> },
          { title: 'Total Actions', dataIndex: 'total_actions', render: v => <Badge count={parseInt(v)} style={{ background: '#B8860B' }} showZero /> },
          { title: 'Creates', dataIndex: 'inserts', render: v => <Tag color="green">{v}</Tag> },
          { title: 'Updates', dataIndex: 'updates', render: v => <Tag color="blue">{v}</Tag> },
          { title: 'Deletes', dataIndex: 'deletes', render: v => <Tag color="red">{v}</Tag> },
          { title: 'Logins', dataIndex: 'logins', render: v => <Tag color="cyan">{v}</Tag> },
          { title: 'Prints', dataIndex: 'prints', render: v => <Tag color="orange">{v}</Tag> },
          { title: 'Last Active', dataIndex: 'last_activity', render: v => v ? <Text style={{ fontSize: 12 }}>{dayjs(v).format('DD-MMM HH:mm')}</Text> : '-' },
        ]}
        dataSource={activityData || []} rowKey="User_ID" size="small" pagination={{ pageSize: 20 }} />
    </Card>
  );

  // ── Full Audit Logs Tab ────────────────────────────────────────────────────
  const LogsTab = () => (
    <>
      {/* Filters */}
      <div ref={filtersRef}>
      <Card size="small" style={{ borderRadius: 8, marginBottom: 12 }}>
        <Row gutter={12} align="middle">
          <Col xs={24} md={6}>
            <Input prefix={<SearchOutlined />} placeholder="Search user, record ID, description"
              value={filters.search} onChange={e => setFilters(f => ({ ...f, search: e.target.value, page: 1 }))} allowClear />
          </Col>
          <Col xs={12} md={4}>
            <Select style={{ width: '100%' }} placeholder="Action Type" value={filters.actionType || undefined}
              onChange={v => setFilters(f => ({ ...f, actionType: v || '', page: 1 }))} allowClear>
              {Object.entries(ACTION_META).map(([k, v]) => <Option key={k} value={k}>{v.icon} {v.label}</Option>)}
            </Select>
          </Col>
          <Col xs={12} md={5}>
            <Input placeholder="Table name (e.g. tbl_sales_header)" value={filters.tableName}
              onChange={e => setFilters(f => ({ ...f, tableName: e.target.value, page: 1 }))} allowClear />
          </Col>
          <Col xs={24} md={5}>
            <Button block icon={<DownloadOutlined />} onClick={() => exportCSV(logsData?.items, 'audit_log')}>Export CSV</Button>
          </Col>
        </Row>
      </Card>
      </div>
      <Card bodyStyle={{ padding: 0 }} style={{ borderRadius: 8 }}>
        <Table
            scroll={{ x: "max-content" }}
          columns={logColumns}
          dataSource={logsData?.items || []} rowKey="Log_ID"
          size="small" loading={logsLoading}
          pagination={{ total: logsData?.total, pageSize: 50, current: filters.page, onChange: p => setFilters(f => ({ ...f, page: p })), showTotal: t => `${t} records` }} />
      </Card>
    </>
  );

  // ── Deleted Entries Tab ────────────────────────────────────────────────────
  const DeletedTab = () => (
    <>
      <Alert message="These are records that were deleted by users. The original data is preserved here for audit purposes." type="warning" showIcon style={{ marginBottom: 12 }} />
      <Card bodyStyle={{ padding: 0 }} style={{ borderRadius: 8 }}
        extra={<Button size="small" icon={<DownloadOutlined />} onClick={() => exportCSV(deletedData, 'deleted_entries')}>CSV</Button>}>
        <Table
            scroll={{ x: "max-content" }}
          columns={[
            ...logColumns.slice(0, 4),
            { title: 'Deleted Data', dataIndex: 'Old_Data', render: v => v ? (
              <Button size="small" type="link" onClick={() => setDetailModal({ Old_Data: v, Action_Type: 'DELETE' })}>View Data</Button>
            ) : '-' },
            logColumns[5], // Device/IP
          ]}
          dataSource={deletedData || []} rowKey="Log_ID" size="small" pagination={{ pageSize: 20 }} />
      </Card>
    </>
  );

  // ── Active Sessions Tab ────────────────────────────────────────────────────
  const SessionsTab = () => (
    <>
      <Alert message={`${sessionsData?.length || 0} active sessions right now. You can force-terminate any suspicious session.`}
        type="info" showIcon style={{ marginBottom: 12 }} />
      <Card bodyStyle={{ padding: 0 }} style={{ borderRadius: 8 }}>
        <Table
            scroll={{ x: "max-content" }}
          columns={[
            { title: 'User', render: (_, r) => <div><Text strong>{r.Full_Name || r.Username}</Text><br /><Text code style={{ fontSize: 11 }}>@{r.Username}</Text></div> },
            { title: 'Session Start', dataIndex: 'Session_Start', render: v => dayjs(v).format('DD-MMM-YYYY HH:mm') },
            { title: 'IP Address', dataIndex: 'IP_Address', render: v => <Text code style={{ fontSize: 11 }}>{v || '-'}</Text> },
            { title: 'Device', dataIndex: 'Device_Info', render: v => (
              <Tooltip title={v}><Text style={{ fontSize: 11 }}>{v?.substring(0, 50)}...</Text></Tooltip>
            )},
            { title: 'Status', render: () => <Badge status="success" text="Active" /> },
            { title: 'Action', render: (_, r) => (
              <Popconfirm title="Force terminate this session?" onConfirm={() => terminateMutation.mutate(r.Session_ID)}
                okText="Terminate" okButtonProps={{ danger: true }}>
                <Button size="small" danger icon={<StopOutlined />}>Terminate</Button>
              </Popconfirm>
            )},
          ]}
          dataSource={sessionsData || []} rowKey="Session_ID" size="small" />
      </Card>
    </>
  );

  // ── Login History Tab ──────────────────────────────────────────────────────
  const LoginsTab = () => (
    <Card title="Login History" bodyStyle={{ padding: 0 }} style={{ borderRadius: 8 }}
      extra={<Button size="small" icon={<DownloadOutlined />} onClick={() => exportCSV(loginHistory, 'login_history')}>CSV</Button>}>
      <Table
            scroll={{ x: "max-content" }}
        columns={[
          { title: 'Date & Time', dataIndex: 'Created_Date', render: v => dayjs(v).format('DD-MMM-YYYY HH:mm:ss') },
          { title: 'User', render: (_, r) => <div><Text strong>{r.Full_Name || r.Username}</Text></div> },
          { title: 'Action', dataIndex: 'Action_Type', render: v => {
            const m = ACTION_META[v] || { color: 'default', icon: '•', label: v };
            return <Tag color={m.color}>{m.icon} {m.label}</Tag>;
          }},
          { title: 'IP Address', dataIndex: 'IP_Address', render: v => <Text code style={{ fontSize: 11 }}>{v || '-'}</Text> },
          { title: 'Device', dataIndex: 'Device_Info', render: v => <Tooltip title={v}><Text style={{ fontSize: 11 }}>{v?.split(' ')[0] || '-'}</Text></Tooltip> },
        ]}
        dataSource={loginHistory || []} rowKey="Log_ID" size="small" pagination={{ pageSize: 25 }} />
    </Card>
  );

  // ── Tab definitions ────────────────────────────────────────────────────────
  const tabItems = [
    { key: 'summary',  label: <span><SafetyOutlined  /> Security Dashboard</span>, children: <SummaryTab  /> },
    { key: 'logs',     label: <span><AuditOutlined   /> Full Audit Log</span>,      children: <LogsTab     /> },
    { key: 'activity', label: <span><UserOutlined    /> User Activity</span>,       children: <ActivityTab /> },
    { key: 'deleted',  label: <span><DeleteOutlined  /> Deleted Entries</span>,     children: <DeletedTab  /> },
    { key: 'sessions', label: <span><DesktopOutlined /> Active Sessions</span>,     children: <SessionsTab /> },
    { key: 'logins',   label: <span><LoginOutlined   /> Login History</span>,       children: <LoginsTab   /> },
  ];

  // ── Change Detail Modal — shows Old Value → New Value field diff ────────────
  const renderDiff = (log) => {
    let oldObj = {}, newObj = {};
    try { oldObj = log.Old_Data ? JSON.parse(log.Old_Data) : {}; } catch {}
    try { newObj = log.New_Data ? JSON.parse(log.New_Data) : {}; } catch {}

    const allKeys = [...new Set([...Object.keys(oldObj), ...Object.keys(newObj)])];
    const changed = allKeys.filter(k => String(oldObj[k] ?? '') !== String(newObj[k] ?? ''));
    const unchanged = allKeys.filter(k => !changed.includes(k));

    return (
      <div>
        {changed.length > 0 && (
          <>
            <Title level={5} style={{ color: '#fa8c16', marginBottom: 8 }}>
              ✏️ Changed Fields ({changed.length})
            </Title>
            {changed.map(k => (
              <div key={k} style={{ marginBottom: 10, padding: '8px 12px', background: '#fff9f0', borderRadius: 6, border: '1px solid #ffd591' }}>
                <Text strong style={{ fontSize: 12, color: '#B8860B' }}>{k}</Text>
                <div style={{ display: 'flex', gap: 12, marginTop: 4, flexWrap: 'wrap' }}>
                  <div style={{ flex: 1 }}>
                    <Text style={{ fontSize: 10, color: '#888' }}>PREVIOUS VALUE</Text>
                    <div style={{ background: '#fff1f0', border: '1px solid #ffa39e', borderRadius: 4, padding: '4px 8px', marginTop: 2 }}>
                      <Text style={{ color: '#cf1322', fontSize: 12 }}>{String(oldObj[k] ?? '(empty)')}</Text>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', fontSize: 16 }}>→</div>
                  <div style={{ flex: 1 }}>
                    <Text style={{ fontSize: 10, color: '#888' }}>NEW VALUE</Text>
                    <div style={{ background: '#f6ffed', border: '1px solid #b7eb8f', borderRadius: 4, padding: '4px 8px', marginTop: 2 }}>
                      <Text style={{ color: '#389e0d', fontSize: 12 }}>{String(newObj[k] ?? '(empty)')}</Text>
                    </div>
                  </div>
                </div>
              </div>
            ))}
            <Divider style={{ margin: '12px 0 8px' }} />
          </>
        )}
        {unchanged.length > 0 && changed.length > 0 && (
          <details style={{ cursor: 'pointer' }}>
            <summary style={{ color: '#888', fontSize: 12, marginBottom: 8 }}>Show {unchanged.length} unchanged fields</summary>
            {unchanged.map(k => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', fontSize: 11, color: '#888', borderBottom: '1px solid #f5f5f5' }}>
                <Text style={{ fontSize: 11 }}>{k}</Text>
                <Text style={{ fontSize: 11 }}>{String(newObj[k] ?? oldObj[k] ?? '-')}</Text>
              </div>
            ))}
          </details>
        )}
        {changed.length === 0 && allKeys.length === 0 && (
          <Text type="secondary">No field data captured for this action.</Text>
        )}
      </div>
    );
  };

  return (
    <div className="page-wrapper">
      <div className="page-header">
        <div>
          <Title level={4} style={{ margin: 0 }}>
            <SafetyOutlined style={{ color: '#ff4d4f', marginRight: 8 }} />
            Audit & Security
          </Title>
          <Text type="secondary" style={{ fontSize: 12 }}>
            Complete activity tracking · Every action is logged with user, time, device, IP, and field-level changes
          </Text>
        </div>
        <div ref={dateRangeRef}>
        <Space>
          <RangePicker
            value={dateRange}
            onChange={d => d && setDateRange(d)}
            format="DD-MMM-YYYY"
            presets={[
              { label: 'Today',      value: [dayjs(), dayjs()] },
              { label: 'Last 7 Days',value: [dayjs().subtract(7,'day'), dayjs()] },
              { label: 'This Month', value: [dayjs().startOf('month'), dayjs()] },
            ]}
          />
        </Space>
        </div>
      </div>

      <div ref={tabsRef}>
      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        type="card"
        items={tabItems}
      />
      </div>

      {/* ── Change Detail Modal ─────────────────────────────────────────── */}
      <Modal
        title={
          <Space>
            <HistoryOutlined style={{ color: '#B8860B' }} />
            <span>Change Details</span>
            {detailModal && (
              <Tag color={ACTION_META[detailModal.Action_Type]?.color || 'blue'}>
                {ACTION_META[detailModal.Action_Type]?.icon} {detailModal.Action_Type}
              </Tag>
            )}
          </Space>
        }
        open={!!detailModal}
        onCancel={() => setDetailModal(null)}
        footer={[
          <Button key="close" onClick={() => setDetailModal(null)}>Close</Button>,
          <Button key="export" icon={<DownloadOutlined />}
            onClick={() => {
              const data = JSON.stringify(detailModal, null, 2);
              const a = document.createElement('a');
              a.href = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
              a.download = `audit_detail_${detailModal?.Log_ID || Date.now()}.json`;
              a.click();
            }}>
            Export JSON
          </Button>,
        ]}
        width={680}
        destroyOnClose
      >
        {detailModal && (
          <div>
            {/* Meta row */}
            <div style={{ background: '#f8f8f8', borderRadius: 6, padding: '10px 14px', marginBottom: 14 }}>
              <Row gutter={[12, 6]}>
                {[
                  { label: 'User',    value: `${detailModal.Full_Name || detailModal.Username || 'System'} (@${detailModal.Username || '-'})` },
                  { label: 'Time',    value: detailModal.Created_Date ? dayjs(detailModal.Created_Date).format('DD-MMM-YYYY HH:mm:ss') : '-' },
                  { label: 'Table',   value: detailModal.Table_Name },
                  { label: 'Record',  value: `#${detailModal.Record_ID || '-'}` },
                  { label: 'IP',      value: detailModal.IP_Address || '-' },
                  { label: 'Device',  value: detailModal.Device_Info?.substring(0, 60) || '-' },
                ].map((r, i) => (
                  <Col xs={12} key={i}>
                    <Text style={{ fontSize: 11, color: '#888' }}>{r.label}: </Text>
                    <Text style={{ fontSize: 11, fontWeight: 600 }}>{r.value}</Text>
                  </Col>
                ))}
              </Row>
              {detailModal.Description && (
                <div style={{ marginTop: 8 }}>
                  <Text style={{ fontSize: 11, color: '#888' }}>Description: </Text>
                  <Text style={{ fontSize: 11 }}>{detailModal.Description}</Text>
                </div>
              )}
            </div>
            {renderDiff(detailModal)}
          </div>
        )}
      </Modal>

      <PageTour steps={tourSteps} />
    </div>
  );
}
