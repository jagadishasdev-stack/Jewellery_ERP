/**
 * Members Page — Scheme Enrollment
 * FIX: Group dropdown now reactively loads based on selected scheme
 *      Shows capacity, available seats, maturity date
 *      Accounting entries auto-created on collection
 */
import React, { useState, useEffect, useRef } from 'react';
import {
  Table, Button, Card, Typography, Tag, Space, Modal, Form,
  Input, InputNumber, Select, DatePicker, Row, Col, message,
  Tabs, Descriptions, Progress, Statistic, Divider, Alert, Badge,
} from 'antd';
import { PlusOutlined, EyeOutlined, TeamOutlined, FileTextOutlined, StopOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { savingsApi, bankChequeApi } from '../../api/modules';
import { formatCurrency } from '../../utils/calculations';
import PageTour from '../../components/PageTour';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { Option } = Select;

// Determine if scheme requires group selection
const DIGI_GOLD_TYPES = ['Digi Gold', 'DigiGold', 'digi_gold'];
const requiresGroup = (schemeName) => !DIGI_GOLD_TYPES.some(t => schemeName?.toLowerCase().includes(t.toLowerCase()));

export default function MembersPage() {
  const [enrollModal, setEnrollModal]   = useState(false);
  const [detailId,    setDetailId]      = useState(null);
  const [search,      setSearch]        = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [selectedSchemeId, setSelectedSchemeId] = useState(null);
  const [selectedScheme,   setSelectedScheme]   = useState(null);
  const [selectedGroup,    setSelectedGroup]     = useState(null);
  const [adjustInvoiceModal, setAdjustInvoiceModal] = useState(false);
  const [forecloseModal,     setForecloseModal]     = useState(false);
  const [forecloseMode,      setForecloseMode]       = useState('Cash');
  const [form] = Form.useForm();
  const [adjustForm] = Form.useForm();
  const [forecloseForm] = Form.useForm();
  const qc = useQueryClient();

  const { data: bankAccounts } = useQuery({
    queryKey: ['bank-accounts-for-savings'],
    queryFn: () => bankChequeApi.getAccounts().then((r) => r.data.data || []),
    staleTime: 5 * 60 * 1000,
  });

  // ── Data queries ────────────────────────────────────────────────────────────
  const { data, isLoading } = useQuery({
    queryKey: ['savings-members', search, filterStatus],
    queryFn: () => savingsApi.getMembers({ search, status: filterStatus || undefined }).then(r => r.data.data),
  });

  const { data: memberDetail } = useQuery({
    queryKey: ['member-detail', detailId],
    queryFn: () => savingsApi.getMemberById(detailId).then(r => r.data.data),
    enabled: !!detailId,
  });

  const { data: schemes } = useQuery({
    queryKey: ['savings-schemes'],
    queryFn: () => savingsApi.getSchemes().then(r => r.data.data),
  });

  // ── KEY FIX: Load groups ONLY for selected scheme, reactively ──────────────
  const { data: groupsForScheme, isLoading: groupsLoading } = useQuery({
    queryKey: ['savings-groups-for-scheme', selectedSchemeId],
    queryFn: () => savingsApi.getGroups({ schemeId: selectedSchemeId, status: 'Active' })
      .then(r => r.data.data),
    enabled: !!selectedSchemeId,
  });

  // ── When scheme changes — clear group selection & store scheme object ───────
  const onSchemeChange = (schemeId) => {
    setSelectedSchemeId(schemeId);
    setSelectedGroup(null);
    form.setFieldValue('Group_ID', undefined);
    const scheme = (schemes || []).find(s => s.Scheme_ID === schemeId);
    setSelectedScheme(scheme || null);
    // Auto-fill installment amount from scheme default if available
    if (scheme?.Default_Monthly_Amount) {
      form.setFieldValue('Installment_Amount', scheme.Default_Monthly_Amount);
    }
  };

  // ── When group changes — store group object for capacity display ──────────
  const onGroupChange = (groupId) => {
    const grp = (groupsForScheme || []).find(g => g.Group_ID === groupId);
    setSelectedGroup(grp || null);
  };

  // ── Enrollment mutation ──────────────────────────────────────────────────
  const createMutation = useMutation({
    mutationFn: (d) => savingsApi.createMember(d),
    onSuccess: (res) => {
      const member = res.data.data;
      message.success(`✅ Member ${member.Member_Number} enrolled successfully!`);
      qc.invalidateQueries(['savings-members']);
      qc.invalidateQueries(['savings-groups-for-scheme', selectedSchemeId]);
      setEnrollModal(false);
      form.resetFields();
      setSelectedSchemeId(null);
      setSelectedScheme(null);
      setSelectedGroup(null);
    },
    onError: (err) => message.error(err.response?.data?.message || 'Enrollment failed.'),
  });

  // ── Standalone Scheme Adjustment (post-hoc, against an existing bill) ──────
  const adjustInvoiceMutation = useMutation({
    mutationFn: (d) => savingsApi.adjustAgainstInvoice(detailId, d),
    onSuccess: (res) => {
      message.success(res.data.message);
      qc.invalidateQueries(['savings-members']);
      qc.invalidateQueries(['member-detail', detailId]);
      setAdjustInvoiceModal(false);
      adjustForm.resetFields();
    },
    onError: (err) => message.error(err.response?.data?.message || 'Adjustment failed.'),
  });

  // ── Foreclosure (customer stopping the scheme before it matures) ───────────
  const forecloseMutation = useMutation({
    mutationFn: (d) => savingsApi.forecloseMember(detailId, d),
    onSuccess: (res) => {
      message.success(res.data.message);
      qc.invalidateQueries(['savings-members']);
      qc.invalidateQueries(['member-detail', detailId]);
      setForecloseModal(false);
      forecloseForm.resetFields();
    },
    onError: (err) => message.error(err.response?.data?.message || 'Foreclosure failed.'),
  });

  const onEnrollFinish = (values) => {
    // Validate group is selected for non-Digi-Gold schemes
    if (requiresGroup(selectedScheme?.Scheme_Name) && !values.Group_ID) {
      message.error('Please select a group for this scheme.');
      return;
    }
    createMutation.mutate({
      ...values,
      Joining_Date: values.Joining_Date?.format('YYYY-MM-DD') || dayjs().format('YYYY-MM-DD'),
      DOB:          values.DOB?.format('YYYY-MM-DD') || null,
    });
  };

  const statusColor = {
    Active: 'green', Matured: 'gold', Redeemed: 'blue',
    Closed: 'red', Defaulter: 'red', Suspended: 'orange',
  };

  // ── Walkthrough tour refs ───────────────────────────────────────────────────
  const filtersRef = useRef(null);
  const tableRef = useRef(null);
  const enrollBtnRef = useRef(null);
  const tourSteps = [
    { title: '1. Search & Filter Members', description: 'Look up an enrolled member by name, mobile or member number, or filter the list by status (Active, Matured, Defaulter, etc).', target: () => filtersRef.current },
    { title: '2. Members List', description: 'Every enrolled member with their scheme, group, installment progress and amount paid so far. Click the eye icon to see full details, transactions and any PDCs on file.', target: () => tableRef.current },
    { title: '3. Enroll a New Member', description: 'Click here to sign up a customer for a savings scheme.', target: () => enrollBtnRef.current },
    { title: '4. Fill the Enrollment Form', description: 'Enter the customer\'s details, then pick a Scheme — the Group dropdown loads automatically for that scheme (skipped entirely for Digi Gold, which has no groups) and shows how many seats are left. Set the monthly installment amount and nominee details, then submit to generate their account number.' },
  ];

  const columns = [
    { title: 'Member No', dataIndex: 'Member_Number', render: v => <Text code style={{ fontSize: 11 }}>{v}</Text>, width: 120 },
    { title: 'Name', render: (_, r) => (
      <div>
        <Text strong>{r.Member_Name}</Text>
        <br /><Text type="secondary" style={{ fontSize: 11 }}>{r.Mobile}</Text>
      </div>
    )},
    { title: 'Scheme', dataIndex: 'Scheme_Name', render: v => <Tag color="blue" style={{ fontSize: 11 }}>{v}</Tag> },
    { title: 'Group', dataIndex: 'Group_Name', render: v => v || <Text type="secondary">-</Text> },
    { title: 'Progress', width: 140, render: (_, r) => {
      const pct = r.Total_Installments > 0 ? Math.round((r.Installments_Paid / r.Total_Installments) * 100) : 0;
      return (
        <div>
          <Progress percent={pct} size="small" strokeColor="#B8860B" showInfo={false} />
          <Text style={{ fontSize: 10 }}>{r.Installments_Paid}/{r.Total_Installments} paid</Text>
        </div>
      );
    }},
    { title: 'Paid', dataIndex: 'Total_Amount_Paid', render: v => <Text strong style={{ color: '#52c41a' }}>{formatCurrency(v)}</Text> },
    { title: 'Maturity', dataIndex: 'Maturity_Date', render: v => v ? dayjs(v).format('MMM-YYYY') : '-' },
    { title: 'Status', dataIndex: 'Status', render: v => <Tag color={statusColor[v] || 'default'}>{v}</Tag> },
    { title: '', render: (_, r) => <Button size="small" icon={<EyeOutlined />} onClick={() => setDetailId(r.Member_ID)} /> },
  ];

  // ── Group capacity display ────────────────────────────────────────────────
  const GroupCapacityBadge = ({ group }) => {
    if (!group) return null;
    const filled   = group.Current_Members || 0;
    const total    = group.Member_Limit    || 0;
    const available = total > 0 ? total - filled : '∞';
    const isFull   = total > 0 && filled >= total;
    return (
      <div style={{ marginTop: 6, padding: '6px 10px', background: isFull ? '#fff1f0' : '#f6ffed', borderRadius: 6, border: `1px solid ${isFull ? '#ffa39e' : '#b7eb8f'}`, fontSize: 12 }}>
        <Space size={16}>
          <span><Text type="secondary">Members:</Text> <Text strong>{filled}{total > 0 ? `/${total}` : ''}</Text></span>
          <span><Text type="secondary">Available:</Text> <Text strong style={{ color: isFull ? '#ff4d4f' : '#52c41a' }}>{isFull ? 'FULL' : available}</Text></span>
          {group.Start_Date && <span><Text type="secondary">Start:</Text> <Text>{dayjs(group.Start_Date).format('MMM-YYYY')}</Text></span>}
          {group.Maturity_Date && <span><Text type="secondary">Matures:</Text> <Text>{dayjs(group.Maturity_Date).format('MMM-YYYY')}</Text></span>}
        </Space>
        {isFull && <Alert message="This group is full. Please select another group." type="error" showIcon style={{ marginTop: 4, fontSize: 11 }} />}
      </div>
    );
  };

  return (
    <div className="page-wrapper">
      <div className="page-header">
        <div>
          <Title level={4} style={{ margin: 0 }}>
            <TeamOutlined style={{ color: '#B8860B', marginRight: 8 }} />
            Scheme Members ({data?.total || 0})
          </Title>
        </div>
        <Button ref={enrollBtnRef} type="primary" icon={<PlusOutlined />}
          style={{ background: '#B8860B', borderColor: '#B8860B' }}
          onClick={() => { setEnrollModal(true); form.resetFields(); setSelectedSchemeId(null); setSelectedGroup(null); }}>
          Enroll Member
        </Button>
      </div>

      {/* Filters */}
      <div ref={filtersRef}>
      <Card style={{ borderRadius: 8, marginBottom: 12 }} bodyStyle={{ padding: 12 }}>
        <Space wrap>
          <Input.Search placeholder="Name / mobile / member no" style={{ width: 280 }} allowClear
            onSearch={v => setSearch(v)} onChange={e => !e.target.value && setSearch('')} />
          <Select placeholder="Filter by status" style={{ width: 150 }} allowClear onChange={v => setFilterStatus(v || '')}>
            {['Active','Matured','Redeemed','Closed','Defaulter','Suspended'].map(s => <Option key={s} value={s}>{s}</Option>)}
          </Select>
        </Space>
      </Card>
      </div>

      <div ref={tableRef}>
      <Card style={{ borderRadius: 8, border: 'none' }} bodyStyle={{ padding: 0 }}>
        <Table
            scroll={{ x: "max-content" }} columns={columns} dataSource={data?.items || []} loading={isLoading}
          rowKey="Member_ID" size="small"
          pagination={{ total: data?.total, pageSize: 50, showTotal: t => `${t} members` }} />
      </Card>
      </div>

      {/* ══════════════════════════════════════════════════════════
          ENROLLMENT MODAL
          Group dropdown loads reactively based on scheme
          ══════════════════════════════════════════════════════════ */}
      <Modal title="📋 Enroll New Scheme Member" open={enrollModal}
        onCancel={() => { setEnrollModal(false); form.resetFields(); setSelectedSchemeId(null); setSelectedScheme(null); setSelectedGroup(null); }}
        footer={null} width={720} destroyOnClose>
        <Form form={form} layout="vertical" onFinish={onEnrollFinish}>

          {/* ── Customer Details ──────────────────────────────── */}
          <Text strong style={{ fontSize: 13, color: '#B8860B' }}>👤 Customer Details</Text>
          <Divider style={{ margin: '6px 0 12px' }} />
          <Row gutter={14}>
            <Col xs={12}><Form.Item name="Member_Name" label="Full Name" rules={[{ required: true }]}><Input placeholder="Customer full name" /></Form.Item></Col>
            <Col xs={12}><Form.Item name="Mobile" label="Mobile" rules={[{ required: true, pattern: /^\d{10}$/, message: '10-digit mobile' }]}><Input placeholder="10-digit mobile" maxLength={10} /></Form.Item></Col>
          </Row>
          <Row gutter={14}>
            <Col xs={12}><Form.Item name="WhatsApp" label="WhatsApp"><Input placeholder="If different from mobile" /></Form.Item></Col>
            <Col xs={12}><Form.Item name="Email" label="Email"><Input type="email" /></Form.Item></Col>
          </Row>
          <Row gutter={14}>
            <Col xs={12}><Form.Item name="Father_Husband_Name" label="Father / Husband Name"><Input /></Form.Item></Col>
            <Col xs={12}><Form.Item name="DOB" label="Date of Birth"><DatePicker style={{ width: '100%' }} format="DD-MMM-YYYY" /></Form.Item></Col>
          </Row>
          <Row gutter={14}>
            <Col xs={12}><Form.Item name="Address_Line1" label="Address"><Input /></Form.Item></Col>
            <Col xs={6}><Form.Item name="City" label="City"><Input /></Form.Item></Col>
            <Col xs={6}><Form.Item name="Pincode" label="Pincode"><Input maxLength={6} /></Form.Item></Col>
          </Row>
          <Row gutter={14}>
            <Col xs={12}><Form.Item name="PAN_No" label="PAN Number"><Input placeholder="ABCDE1234F" maxLength={10} /></Form.Item></Col>
            <Col xs={12}><Form.Item name="Aadhaar_No" label="Aadhaar"><Input placeholder="12-digit Aadhaar" maxLength={12} /></Form.Item></Col>
          </Row>

          {/* ── Scheme & Group ────────────────────────────────── */}
          <Text strong style={{ fontSize: 13, color: '#B8860B' }}>🪙 Scheme Enrollment</Text>
          <Divider style={{ margin: '6px 0 12px' }} />
          <Row gutter={14}>
            <Col xs={10}>
              <Form.Item name="Scheme_ID" label="Select Scheme" rules={[{ required: true, message: 'Select a scheme' }]}>
                <Select placeholder="Choose scheme" size="large" onChange={onSchemeChange}>
                  {(schemes || []).map(s => (
                    <Option key={s.Scheme_ID} value={s.Scheme_ID}>
                      {s.Scheme_Name}
                      {s.Scheme_Type && <Tag color="blue" style={{ marginLeft: 6, fontSize: 9 }}>{s.Scheme_Type}</Tag>}
                    </Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>

            <Col xs={14}>
              {/* Group — only shown for non-Digi-Gold schemes */}
              {selectedScheme && requiresGroup(selectedScheme?.Scheme_Name) ? (
                <Form.Item name="Group_ID" label={
                  <Space>
                    <span>Select Group</span>
                    {groupsLoading && <Text style={{ fontSize: 11, color: '#888' }}>Loading...</Text>}
                    {!groupsLoading && groupsForScheme?.length === 0 && (
                      <Text style={{ fontSize: 11, color: '#ff4d4f' }}>No active groups</Text>
                    )}
                  </Space>
                } rules={[{ required: true, message: 'Select a group' }]}>
                  <Select
                    placeholder={groupsLoading ? 'Loading groups...' : 'Select active group'}
                    size="large"
                    loading={groupsLoading}
                    disabled={!selectedSchemeId || groupsLoading}
                    onChange={onGroupChange}
                    notFoundContent={groupsLoading ? 'Loading...' : 'No active groups for this scheme'}
                  >
                    {(groupsForScheme || []).map(g => {
                      const filled    = g.Current_Members || 0;
                      const limit     = g.Member_Limit    || 0;
                      const isFull    = limit > 0 && filled >= limit;
                      const available = limit > 0 ? limit - filled : '∞';
                      return (
                        <Option key={g.Group_ID} value={g.Group_ID} disabled={isFull}>
                          <Space size={8}>
                            <Text strong style={{ color: isFull ? '#ff4d4f' : '#333' }}>{g.Group_Name}</Text>
                            <Text style={{ fontSize: 11, color: '#888' }}>
                              {filled}/{limit > 0 ? limit : '∞'} members
                            </Text>
                            <Tag color={isFull ? 'red' : 'green'} style={{ fontSize: 9 }}>
                              {isFull ? 'FULL' : `${available} seats`}
                            </Tag>
                            {g.Maturity_Date && (
                              <Text style={{ fontSize: 10, color: '#888' }}>
                                Matures: {dayjs(g.Maturity_Date).format('MMM-YY')}
                              </Text>
                            )}
                          </Space>
                        </Option>
                      );
                    })}
                  </Select>
                </Form.Item>
              ) : selectedScheme && !requiresGroup(selectedScheme?.Scheme_Name) ? (
                <Form.Item label="Group">
                  <Alert message="Digi Gold scheme — no group selection required" type="info" showIcon style={{ fontSize: 11 }} />
                </Form.Item>
              ) : (
                <Form.Item label="Group">
                  <Alert message="Select a scheme first to load available groups" type="warning" showIcon style={{ fontSize: 11 }} />
                </Form.Item>
              )}
            </Col>
          </Row>

          {/* Group capacity card */}
          {selectedGroup && <GroupCapacityBadge group={selectedGroup} />}

          <Row gutter={14} style={{ marginTop: selectedGroup ? 10 : 0 }}>
            <Col xs={8}>
              <Form.Item name="Installment_Amount" label="Monthly Installment (₹)"
                rules={[{ required: true, message: 'Enter installment amount' }]}>
                <InputNumber style={{ width: '100%' }} size="large" min={100}
                  formatter={v => `₹ ${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')} />
              </Form.Item>
            </Col>
            <Col xs={8}>
              <Form.Item name="Joining_Date" label="Joining Date" initialValue={dayjs()} rules={[{ required: true }]}>
                <DatePicker style={{ width: '100%' }} size="large" format="DD-MMM-YYYY" />
              </Form.Item>
            </Col>
            <Col xs={8}>
              <Form.Item name="Join_Source" label="Join Source" initialValue="Counter">
                <Select size="large">
                  <Option value="Counter">Counter</Option>
                  <Option value="App">App</Option>
                  <Option value="Agent">Agent</Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>

          {/* ── Nominee ──────────────────────────────────────── */}
          <Text strong style={{ fontSize: 13, color: '#B8860B' }}>👥 Nominee Details</Text>
          <Divider style={{ margin: '6px 0 12px' }} />
          <Row gutter={14}>
            <Col xs={8}><Form.Item name="Nominee_Name" label="Nominee Name"><Input /></Form.Item></Col>
            <Col xs={8}><Form.Item name="Nominee_Relation" label="Relation"><Input placeholder="Wife / Son / Daughter" /></Form.Item></Col>
            <Col xs={8}><Form.Item name="Nominee_Mobile" label="Nominee Mobile"><Input maxLength={10} /></Form.Item></Col>
          </Row>

          <Button type="primary" htmlType="submit" block size="large"
            loading={createMutation.isPending}
            disabled={requiresGroup(selectedScheme?.Scheme_Name) && !!(selectedGroup?.Member_Limit > 0 && selectedGroup?.Current_Members >= selectedGroup?.Member_Limit)}
            style={{ background: '#B8860B', borderColor: '#B8860B', fontWeight: 700, height: 46 }}>
            ✅ Enroll Member & Generate Account Number
          </Button>
        </Form>
      </Modal>

      {/* ══════════════════════════════════════════════════════════
          MEMBER DETAIL MODAL
          ══════════════════════════════════════════════════════════ */}
      <Modal title={memberDetail ? `Member: ${memberDetail.member?.Member_Number} — ${memberDetail.member?.Member_Name}` : 'Member Detail'}
        open={!!detailId} onCancel={() => setDetailId(null)} footer={null} width={820} destroyOnClose>
        {memberDetail && (
          <Tabs defaultActiveKey="overview"
            items={[
              {
                key: 'overview', label: 'Overview',
                children: (
                  <>
                    <Row gutter={[10, 10]} style={{ marginBottom: 14 }}>
                      {[
                        { label: 'Paid', value: `${memberDetail.member.Installments_Paid}/${memberDetail.member.Total_Installments}`, color: '#1890ff' },
                        { label: 'Total Paid', value: formatCurrency(memberDetail.member.Total_Amount_Paid), color: '#52c41a' },
                        { label: 'Maturity Value', value: formatCurrency(memberDetail.member.Maturity_Value), color: '#B8860B' },
                        { label: 'Gold Balance', value: `${memberDetail.member.Gold_Balance_Grams || 0}g`, color: '#fa8c16' },
                      ].map((s, i) => (
                        <Col xs={6} key={i}>
                          <Card size="small" style={{ borderRadius: 6, border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,.07)' }}>
                            <Statistic title={<Text style={{ fontSize: 11 }}>{s.label}</Text>}
                              value={s.value} valueStyle={{ color: s.color, fontSize: 16, fontWeight: 700 }} />
                          </Card>
                        </Col>
                      ))}
                    </Row>
                    <Progress
                      percent={memberDetail.member.Total_Installments > 0 ? Math.round((memberDetail.member.Installments_Paid / memberDetail.member.Total_Installments) * 100) : 0}
                      strokeColor="#B8860B" style={{ marginBottom: 14 }} />
                    <Descriptions size="small" bordered column={2}>
                      <Descriptions.Item label="Name">{memberDetail.member.Member_Name}</Descriptions.Item>
                      <Descriptions.Item label="Mobile">{memberDetail.member.Mobile}</Descriptions.Item>
                      <Descriptions.Item label="Scheme">{memberDetail.member.Scheme_Name}</Descriptions.Item>
                      <Descriptions.Item label="Group">{memberDetail.member.Group_Name || '-'}</Descriptions.Item>
                      <Descriptions.Item label="Installment">{formatCurrency(memberDetail.member.Installment_Amount)}/month</Descriptions.Item>
                      <Descriptions.Item label="Status"><Tag color={statusColor[memberDetail.member.Status]}>{memberDetail.member.Status}</Tag></Descriptions.Item>
                      <Descriptions.Item label="Joining">{dayjs(memberDetail.member.Joining_Date).format('DD-MMM-YYYY')}</Descriptions.Item>
                      <Descriptions.Item label="Maturity">{memberDetail.member.Maturity_Date ? dayjs(memberDetail.member.Maturity_Date).format('DD-MMM-YYYY') : '-'}</Descriptions.Item>
                    </Descriptions>

                    {['Active', 'Matured'].includes(memberDetail.member.Status) && (
                      <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid #f0f0f0' }}>
                        <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 8 }}>
                          Available balance: <Text strong style={{ color: '#B8860B' }}>
                            {formatCurrency(Math.max(0, parseFloat(memberDetail.member.Total_Amount_Paid || 0) - parseFloat(memberDetail.member.Amount_Redeemed || 0)))}
                          </Text>
                        </Text>
                        <Space>
                          <Button size="small" icon={<FileTextOutlined />} onClick={() => setAdjustInvoiceModal(true)}>
                            Adjust Against a Bill
                          </Button>
                          {memberDetail.member.Status === 'Active' && (
                            <Button size="small" danger icon={<StopOutlined />} onClick={() => setForecloseModal(true)}>
                              Foreclose (Stop Early)
                            </Button>
                          )}
                        </Space>
                      </div>
                    )}
                  </>
                ),
              },
              {
                key: 'txns', label: `Transactions (${memberDetail.transactions?.length || 0})`,
                children: (
                  <Table
            scroll={{ x: "max-content" }} size="small" dataSource={memberDetail.transactions} rowKey="Txn_ID" pagination={false}
                    columns={[
                      { title: 'Receipt', dataIndex: 'Receipt_Number', render: v => <Text code style={{ fontSize: 10 }}>{v}</Text> },
                      { title: 'Inst #', dataIndex: 'Installment_No', width: 60 },
                      { title: 'Date', dataIndex: 'Payment_Date', render: v => dayjs(v).format('DD-MMM-YYYY') },
                      { title: 'Amount', dataIndex: 'Net_Amount', render: v => <Text strong style={{ color: '#52c41a' }}>{formatCurrency(v)}</Text> },
                      { title: 'Penalty', dataIndex: 'Penalty_Amount', render: v => parseFloat(v||0) > 0 ? <Text style={{ color: '#ff4d4f' }}>{formatCurrency(v)}</Text> : '-' },
                      { title: 'Mode', dataIndex: 'Payment_Mode', render: v => <Tag color={v === 'Scheme Adjustment' ? 'gold' : 'blue'}>{v}</Tag> },
                      { title: 'Bill / Invoice No', dataIndex: 'Payment_Reference', render: v => v ? <Text code style={{ fontSize: 10, color: '#B8860B' }}>{v}</Text> : '-' },
                      { title: 'Source', dataIndex: 'Collection_Source', render: v => <Tag style={{ fontSize: 10 }}>{v}</Tag> },
                    ]} />
                ),
              },
              {
                key: 'pdc', label: `PDC (${memberDetail.pdc?.length || 0})`,
                children: (
                  <Table
            scroll={{ x: "max-content" }} size="small" dataSource={memberDetail.pdc} rowKey="PDC_ID" pagination={false}
                    columns={[
                      { title: 'Cheque No', dataIndex: 'Cheque_Number' },
                      { title: 'Bank', dataIndex: 'Bank_Name' },
                      { title: 'Amount', dataIndex: 'Amount', render: v => formatCurrency(v) },
                      { title: 'Date', dataIndex: 'Cheque_Date', render: v => dayjs(v).format('DD-MMM-YYYY') },
                      { title: 'Status', dataIndex: 'Status', render: v => <Tag color={v==='Cleared'?'green':v==='Bounced'?'red':'orange'}>{v}</Tag> },
                    ]} />
                ),
              },
            ]}
          />
        )}
      </Modal>

      {/* ══════════════════════════════════════════════════════════
          ADJUST AGAINST A BILL — standalone, decoupled from a live
          POS cart. Search an already-created invoice by number and
          apply this member's balance/bonus against it directly.
          ══════════════════════════════════════════════════════════ */}
      <Modal title={`Adjust ${memberDetail?.member?.Member_Number || ''}'s Scheme Against a Bill`}
        open={adjustInvoiceModal} onCancel={() => { setAdjustInvoiceModal(false); adjustForm.resetFields(); }}
        footer={null} destroyOnClose>
        <Alert type="info" showIcon style={{ marginBottom: 12 }}
          message="Applies this member's scheme balance/bonus against a bill that's already been created. If the bill still owes something, this settles it; if it's already fully paid, the amount is refunded back to the customer instead." />
        <Form form={adjustForm} layout="vertical" onFinish={(v) => adjustInvoiceMutation.mutate(v)}>
          <Form.Item name="Invoice_Number" label="Invoice Number" rules={[{ required: true, message: 'Invoice number is required.' }]}>
            <Input placeholder="e.g. INV-DLJ-20260811-0001" />
          </Form.Item>
          <Row gutter={12}>
            <Col xs={12}>
              <Form.Item name="Amount" label="Balance Amount (₹)" initialValue={0}>
                <InputNumber style={{ width: '100%' }} min={0} />
              </Form.Item>
            </Col>
            <Col xs={12}>
              <Form.Item name="BonusAmount" label="Bonus Amount (₹)" initialValue={0}>
                <InputNumber style={{ width: '100%' }} min={0} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="Refund_Mode" label="If this creates a refund, refund via" initialValue="Cash">
            <Select options={[{ value: 'Cash', label: 'Cash' }, { value: 'Bank', label: 'Bank' }]} />
          </Form.Item>
          <Form.Item shouldUpdate noStyle>
            {() => adjustForm.getFieldValue('Refund_Mode') === 'Bank' && (
              <Form.Item name="Bank_Account_ID" label="Which Bank" rules={[{ required: true, message: 'Pick a bank account.' }]}>
                <Select options={(bankAccounts || []).map((b) => ({ value: b.Account_ID, label: `${b.Bank_Name} (${b.Account_Number})` }))} />
              </Form.Item>
            )}
          </Form.Item>
          <Form.Item name="Reason" label="Reason / Notes">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Button type="primary" htmlType="submit" block loading={adjustInvoiceMutation.isPending} style={{ background: '#B8860B', borderColor: '#B8860B' }}>
            Apply Adjustment
          </Button>
        </Form>
      </Modal>

      {/* ══════════════════════════════════════════════════════════
          FORECLOSE — a customer stopping the scheme BEFORE it
          matures. Manual deduction/bonus, then settle via Cash,
          Bank, or against a sale invoice.
          ══════════════════════════════════════════════════════════ */}
      <Modal title={`Foreclose ${memberDetail?.member?.Member_Number || ''}'s Scheme`}
        open={forecloseModal} onCancel={() => { setForecloseModal(false); forecloseForm.resetFields(); setForecloseMode('Cash'); }}
        footer={null} destroyOnClose>
        <Alert type="warning" showIcon style={{ marginBottom: 12 }}
          message="For a customer stopping this scheme before it matures. Enter any deduction (kept as business income) or goodwill bonus, then settle the net amount." />
        {memberDetail && (
          <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 12 }}>
            Amount collected so far: <Text strong>
              {formatCurrency(Math.max(0, parseFloat(memberDetail.member.Total_Amount_Paid || 0) - parseFloat(memberDetail.member.Amount_Redeemed || 0)))}
            </Text>
          </Text>
        )}
        <Form form={forecloseForm} layout="vertical" onFinish={(v) => forecloseMutation.mutate(v)}
          initialValues={{ Settlement_Mode: 'Cash', Deduction_Amount: 0, Bonus_Amount: 0 }}>
          <Row gutter={12}>
            <Col xs={12}>
              <Form.Item name="Deduction_Amount" label="Deduction / Penalty (₹)">
                <InputNumber style={{ width: '100%' }} min={0} />
              </Form.Item>
            </Col>
            <Col xs={12}>
              <Form.Item name="Bonus_Amount" label="Goodwill Bonus (₹)">
                <InputNumber style={{ width: '100%' }} min={0} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="Settlement_Mode" label="Settle Via" rules={[{ required: true }]}>
            <Select
              options={[{ value: 'Cash', label: 'Cash' }, { value: 'Bank', label: 'Bank' }, { value: 'Adjustment', label: 'Against a Sale Bill' }]}
              onChange={setForecloseMode}
            />
          </Form.Item>
          {forecloseMode === 'Bank' && (
            <Form.Item name="Bank_Account_ID" label="Which Bank" rules={[{ required: true, message: 'Pick a bank account.' }]}>
              <Select options={(bankAccounts || []).map((b) => ({ value: b.Account_ID, label: `${b.Bank_Name} (${b.Account_Number})` }))} />
            </Form.Item>
          )}
          {forecloseMode === 'Adjustment' && (
            <Form.Item name="Invoice_Number" label="Invoice Number" rules={[{ required: true, message: 'Invoice number is required.' }]}>
              <Input placeholder="e.g. INV-DLJ-20260811-0001" />
            </Form.Item>
          )}
          <Form.Item name="Reason" label="Reason" rules={[{ required: true, message: 'A reason is required.' }]}>
            <Input.TextArea rows={2} placeholder="e.g. Customer requested early closure" />
          </Form.Item>
          <Button type="primary" danger htmlType="submit" block loading={forecloseMutation.isPending}>
            Foreclose Scheme
          </Button>
        </Form>
      </Modal>

      <PageTour steps={tourSteps} />
    </div>
  );
}
