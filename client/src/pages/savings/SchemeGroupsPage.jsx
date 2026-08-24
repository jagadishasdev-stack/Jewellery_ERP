import React, { useState, useRef } from 'react';
import {
  Table, Button, Card, Typography, Tag, Space, Modal, Form,
  Input, InputNumber, Select, DatePicker, Switch, Row, Col, message, Progress,
  Upload, Image,
} from 'antd';
import { PlusOutlined, EyeOutlined, UploadOutlined, PictureOutlined, FileTextOutlined, FileTextFilled } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { savingsApi, uploadApi } from '../../api/modules';
import { formatCurrency } from '../../utils/calculations';
import PageTour from '../../components/PageTour';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { Option } = Select;

// Uploaded images are served as static files (e.g. "/uploads/scheme-groups/xxx.png")
// directly by the Express app, NOT under the "/api" prefix that axios's baseURL uses.
// In dev, Vite (port 5173) only proxies "/api" and "/socket.io" to the backend
// (port 5001 — see vite.config.js), so a bare relative path would 404 against the
// Vite dev server. In prod we assume the same origin fronts both "/api" and
// "/uploads" (as it does for "/api" today), so a relative path resolves correctly.
const getImageUrl = (url) => {
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  const backendOrigin = import.meta.env.DEV
    ? `${window.location.protocol}//${window.location.hostname}:5001`
    : window.location.origin;
  return `${backendOrigin}${url}`;
};

const MAX_IMAGE_SIZE = 2 * 1024 * 1024; // 2MB

export default function SchemeGroupsPage() {
  const [modal, setModal] = useState(false);
  const [detailId, setDetailId] = useState(null);
  const [uploadingId, setUploadingId] = useState(null);
  const [termsGroup, setTermsGroup] = useState(null); // group row currently being edited in the T&C modal
  const [form] = Form.useForm();
  const [termsForm] = Form.useForm();
  const qc = useQueryClient();

  const { data: groups, isLoading } = useQuery({
    queryKey: ['savings-groups'],
    queryFn: () => savingsApi.getGroups().then(r => r.data.data),
  });

  const { data: schemes } = useQuery({
    queryKey: ['savings-schemes'],
    queryFn: () => savingsApi.getSchemes().then(r => r.data.data),
  });

  const { data: groupDetail } = useQuery({
    queryKey: ['group-detail', detailId],
    queryFn: () => savingsApi.getGroupById(detailId).then(r => r.data.data),
    enabled: !!detailId,
  });

  const createMutation = useMutation({
    mutationFn: (d) => savingsApi.createGroup(d),
    onSuccess: () => { message.success('Group created!'); qc.invalidateQueries(['savings-groups']); setModal(false); form.resetFields(); },
    onError: (err) => message.error(err.response?.data?.message || 'Failed.'),
  });

  // ── Group image upload: upload file, then persist its URL on the group ──────
  const imageMutation = useMutation({
    mutationFn: async ({ file, groupId }) => {
      const uploadRes = await uploadApi.uploadImage(file, 'scheme-groups');
      const url = uploadRes.data?.data?.url;
      await savingsApi.updateGroup(groupId, { Group_Image_URL: url });
      return url;
    },
    onSuccess: () => { message.success('Group image updated!'); qc.invalidateQueries(['savings-groups']); },
    onError: (err) => message.error(err.response?.data?.message || 'Image upload failed.'),
    onSettled: () => setUploadingId(null),
  });

  // ── Group Terms & Conditions: shown to members during enrollment in the app ─
  const termsMutation = useMutation({
    mutationFn: ({ groupId, Group_Terms_Text }) => savingsApi.updateGroup(groupId, { Group_Terms_Text }),
    onSuccess: () => {
      message.success('Terms & Conditions updated!');
      qc.invalidateQueries(['savings-groups']);
      setTermsGroup(null);
      termsForm.resetFields();
    },
    onError: (err) => message.error(err.response?.data?.message || 'Failed to update terms.'),
  });

  // Was only settable at Create Group time before — a tenant with several
  // existing groups had no way to open just some of them to the app.
  const appJoinMutation = useMutation({
    mutationFn: ({ groupId, App_Join_Allowed }) => savingsApi.updateGroup(groupId, { App_Join_Allowed }),
    onSuccess: (_, { App_Join_Allowed }) => {
      message.success(App_Join_Allowed ? 'This group now shows up in the app.' : 'This group is now hidden from the app.');
      qc.invalidateQueries(['savings-groups']);
    },
    onError: (err) => message.error(err.response?.data?.message || 'Failed to update.'),
  });

  const openTermsModal = (record) => {
    setTermsGroup(record);
    termsForm.setFieldsValue({ Group_Terms_Text: record.Group_Terms_Text || '' });
  };

  const beforeUploadImage = (file, groupId) => {
    const okType = /image\/(jpeg|png|webp|gif)/.test(file.type);
    if (!okType) { message.error('Only JPG, PNG, WEBP or GIF images are allowed.'); return Upload.LIST_IGNORE; }
    if (file.size > MAX_IMAGE_SIZE) { message.error('Image must be 2MB or smaller.'); return Upload.LIST_IGNORE; }
    setUploadingId(groupId);
    imageMutation.mutate({ file, groupId });
    return false; // prevent antd's default auto-upload
  };

  const statusColor = { Active: 'green', Closed: 'red', Matured: 'gold', Cancelled: 'default' };

  // ── Walkthrough tour refs ───────────────────────────────────────────────────
  const tableRef = useRef(null);
  const newBtnRef = useRef(null);
  const tourSteps = [
    { title: '1. Scheme Groups', description: 'A Group is a batch of members who joined a scheme together — e.g. "Gold Saving 1000 — Group A Jan 2026". Each row shows its members, monthly amount and progress toward maturity.', target: () => tableRef.current },
    { title: '2. Create a Group', description: 'Click here to open a new cohort — pick the parent scheme, give it a code and name, set the monthly amount, number of installments and start date.', target: () => newBtnRef.current },
    { title: '3. Capacity & Joining Rules', description: 'Set a Member Limit (0 = unlimited), a Bonus Amount for the group, and whether members can join it from the counter, the customer App, or both. Enable Draw if this group is eligible for the lucky draw.' },
    { title: '4. Manage a Group', description: 'Upload a group photo and add Terms & Conditions (shown to members during app enrollment) right from the table. Click View to see the full member roster and each member\'s payment progress.' },
  ];

  const columns = [
    { title: 'Group', render: (_, r) => <div><Text strong>{r.Group_Name}</Text><br /><Text code style={{ fontSize: 10 }}>{r.Group_Code}</Text></div> },
    { title: 'Image', render: (_, r) => (
      <Space direction="vertical" size={2} align="center" style={{ width: 64 }}>
        {r.Group_Image_URL ? (
          <Image
            src={getImageUrl(r.Group_Image_URL)}
            width={40}
            height={40}
            style={{ objectFit: 'cover', borderRadius: 4, border: '1px solid #f0f0f0' }}
            preview={{ src: getImageUrl(r.Group_Image_URL) }}
          />
        ) : (
          <div style={{
            width: 40, height: 40, borderRadius: 4, background: '#fafafa',
            border: '1px dashed #d9d9d9', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <PictureOutlined style={{ color: '#d9d9d9', fontSize: 16 }} />
          </div>
        )}
        <Upload accept="image/*" showUploadList={false} beforeUpload={(file) => beforeUploadImage(file, r.Group_ID)}>
          <Button type="link" size="small" icon={<UploadOutlined />}
            loading={uploadingId === r.Group_ID && imageMutation.isPending}
            style={{ padding: 0, fontSize: 11, color: '#B8860B' }}>
            {r.Group_Image_URL ? 'Change' : 'Upload'}
          </Button>
        </Upload>
      </Space>
    ) },
    { title: 'T&C', render: (_, r) => (
      <Button
        type="link" size="small"
        icon={r.Group_Terms_Text ? <FileTextFilled /> : <FileTextOutlined />}
        onClick={() => openTermsModal(r)}
        style={{ padding: 0, fontSize: 11, color: '#B8860B' }}
      >
        {r.Group_Terms_Text ? 'Edit' : 'Add'}
      </Button>
    ) },
    { title: 'Scheme', dataIndex: 'Scheme_Name', render: v => <Tag color="blue">{v}</Tag> },
    { title: 'Monthly', dataIndex: 'Monthly_Amount', render: v => formatCurrency(v) },
    { title: 'Members', render: (_, r) => {
      const pct = r.Member_Limit > 0 ? Math.round((r.Current_Members / r.Member_Limit) * 100) : 0;
      return (
        <div>
          <Text>{r.Current_Members}{r.Member_Limit > 0 ? `/${r.Member_Limit}` : ''}</Text>
          {r.Member_Limit > 0 && <Progress percent={pct} size="small" strokeColor="#B8860B" style={{ width: 80, marginLeft: 8 }} />}
        </div>
      );
    }},
    { title: 'Start', dataIndex: 'Start_Date', render: v => dayjs(v).format('DD-MMM-YYYY') },
    { title: 'Maturity', dataIndex: 'Maturity_Date', render: v => v ? dayjs(v).format('DD-MMM-YYYY') : '-' },
    { title: 'Status', dataIndex: 'Status', render: v => <Tag color={statusColor[v] || 'default'}>{v}</Tag> },
    { title: 'App', render: (_, r) => (
      <Space direction="vertical" size={0} align="center">
        <Switch
          checked={!!r.App_Join_Allowed}
          checkedChildren="Open" unCheckedChildren="Closed"
          loading={appJoinMutation.isPending && appJoinMutation.variables?.groupId === r.Group_ID}
          onChange={(checked) => appJoinMutation.mutate({ groupId: r.Group_ID, App_Join_Allowed: checked })}
        />
      </Space>
    ) },
    { title: '', render: (_, r) => <Button size="small" icon={<EyeOutlined />} onClick={() => setDetailId(r.Group_ID)}>View</Button> },
  ];

  return (
    <div className="page-wrapper">
      <div className="page-header">
        <Title level={4} style={{ margin: 0 }}>Scheme Groups</Title>
        <Button ref={newBtnRef} type="primary" icon={<PlusOutlined />} style={{ background: '#B8860B', borderColor: '#B8860B' }} onClick={() => setModal(true)}>
          New Group
        </Button>
      </div>

      <div ref={tableRef}>
      <Card style={{ borderRadius: 8, border: 'none' }} bodyStyle={{ padding: 0 }}>
        <Table
            scroll={{ x: "max-content" }} columns={columns} dataSource={groups || []} loading={isLoading} rowKey="Group_ID" size="small" pagination={{ pageSize: 20 }} />
      </Card>
      </div>

      {/* Create Group Modal */}
      <Modal title="Create Group" open={modal} onCancel={() => { setModal(false); form.resetFields(); }} footer={null} width={600}>
        <Form form={form} layout="vertical" onFinish={v => createMutation.mutate({ ...v, Start_Date: v.Start_Date?.format('YYYY-MM-DD') })}>
          <Row gutter={16}>
            <Col xs={12}><Form.Item name="Scheme_ID" label="Scheme" rules={[{ required: true }]}><Select placeholder="Select scheme">{(schemes || []).map(s => <Option key={s.Scheme_ID} value={s.Scheme_ID}>{s.Scheme_Name}</Option>)}</Select></Form.Item></Col>
            <Col xs={12}><Form.Item name="Group_Code" label="Group Code" rules={[{ required: true }]}><Input placeholder="GRP-A" /></Form.Item></Col>
          </Row>
          <Form.Item name="Group_Name" label="Group Name" rules={[{ required: true }]}><Input placeholder="Gold Saving 1000 — Group A Jan 2026" /></Form.Item>
          <Row gutter={16}>
            <Col xs={8}><Form.Item name="Monthly_Amount" label="Monthly Amount (₹)" rules={[{ required: true }]}><InputNumber style={{ width: '100%' }} min={100} formatter={v => `₹ ${v}`} /></Form.Item></Col>
            <Col xs={8}><Form.Item name="Total_Installments" label="Total Installments" rules={[{ required: true }]}><InputNumber style={{ width: '100%' }} min={1} /></Form.Item></Col>
            <Col xs={8}><Form.Item name="Start_Date" label="Start Date" rules={[{ required: true }]}><DatePicker style={{ width: '100%' }} /></Form.Item></Col>
          </Row>
          <Row gutter={16}>
            <Col xs={8}><Form.Item name="Member_Limit" label="Member Limit (0=unlimited)" initialValue={0}><InputNumber style={{ width: '100%' }} min={0} /></Form.Item></Col>
            <Col xs={8}><Form.Item name="Bonus_Amount" label="Bonus Amount (₹)" initialValue={0}><InputNumber style={{ width: '100%' }} min={0} /></Form.Item></Col>
          </Row>
          <Row gutter={16}>
            <Col xs={6}><Form.Item name="App_Join_Allowed" label="App Join" valuePropName="checked" initialValue={true}><Switch /></Form.Item></Col>
            <Col xs={6}><Form.Item name="Counter_Join_Allowed" label="Counter Join" valuePropName="checked" initialValue={true}><Switch /></Form.Item></Col>
            <Col xs={6}><Form.Item name="Auto_Approval" label="Auto Approve" valuePropName="checked" initialValue={true}><Switch /></Form.Item></Col>
            <Col xs={6}><Form.Item name="Draw_Applicable" label="Draw" valuePropName="checked" initialValue={false}><Switch /></Form.Item></Col>
          </Row>
          <Button type="primary" htmlType="submit" block size="large" loading={createMutation.isPending}
            style={{ background: '#B8860B', borderColor: '#B8860B' }}>Create Group</Button>
        </Form>
      </Modal>

      {/* Group Detail Modal */}
      <Modal title={groupDetail?.group?.Group_Name} open={!!detailId} onCancel={() => setDetailId(null)} footer={null} width={700}>
        {groupDetail && (
          <div>
            <Table
            scroll={{ x: "max-content" }} size="small" dataSource={groupDetail.members || []} rowKey="Member_ID" pagination={false}
              columns={[
                { title: 'Member No', dataIndex: 'Member_Number', render: v => <Text code>{v}</Text> },
                { title: 'Name', dataIndex: 'Member_Name' },
                { title: 'Mobile', dataIndex: 'Mobile' },
                { title: 'Paid', render: (_, r) => `${r.Installments_Paid}/${r.Total_Installments}` },
                { title: 'Total Paid', dataIndex: 'Total_Amount_Paid', render: v => formatCurrency(v) },
                { title: 'Status', dataIndex: 'Status', render: v => <Tag color={v === 'Active' ? 'green' : v === 'Matured' ? 'gold' : 'red'}>{v}</Tag> },
              ]}
            />
          </div>
        )}
      </Modal>

      {/* Group Terms & Conditions Modal */}
      <Modal
        title={`Terms & Conditions${termsGroup ? ` — ${termsGroup.Group_Name}` : ''}`}
        open={!!termsGroup}
        onCancel={() => { setTermsGroup(null); termsForm.resetFields(); }}
        footer={null}
        width={600}
      >
        <Form
          form={termsForm}
          layout="vertical"
          onFinish={v => termsMutation.mutate({ groupId: termsGroup.Group_ID, Group_Terms_Text: v.Group_Terms_Text || '' })}
        >
          <Form.Item name="Group_Terms_Text" label="Terms & Conditions">
            <Input.TextArea
              rows={8}
              placeholder="Terms specific to this savings plan, shown to members during enrollment..."
            />
          </Form.Item>
          <Button type="primary" htmlType="submit" block size="large" loading={termsMutation.isPending}
            style={{ background: '#B8860B', borderColor: '#B8860B' }}>Save Terms</Button>
        </Form>
      </Modal>

      <PageTour steps={tourSteps} />
    </div>
  );
}
