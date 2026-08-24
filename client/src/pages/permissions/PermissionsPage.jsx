import React, { useState, useRef } from 'react';
import { Typography, Tabs, Select, Table, Button, Space, Switch, Form, message, Card, Modal } from 'antd';
import { SafetyCertificateOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { permissionsApi, hrApi } from '../../api/modules';
import PageTour from '../../components/PageTour';

const { Title } = Typography;
const { Option } = Select;

function useStaff() {
  return useQuery({ queryKey: ['hr-staff'], queryFn: () => hrApi.getStaff().then((r) => r.data.data) });
}

const MODULE_KEYS = [
  'pawnbroking', 'insurance_amc', 'hr_payroll', 'crm', 'bank_cheque',
  'rate_booking_agent_commission', 'hsn_einvoice_loyalty', 'manufacturing_bom',
  'guarantor_certification', 'reorder_rfid_card_charges', 'tally_bridge',
];

function OverridesTab() {
  const { data: staff } = useStaff();
  const [userId, setUserId] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();
  const qc = useQueryClient();

  const { data: overrides } = useQuery({
    queryKey: ['permission-overrides', userId], enabled: !!userId,
    queryFn: () => permissionsApi.getOverrides(userId).then((r) => r.data.data),
  });

  const save = useMutation({
    mutationFn: (v) => permissionsApi.createOverride({ ...v, User_ID: userId }),
    onSuccess: () => { message.success('Override saved.'); qc.invalidateQueries({ queryKey: ['permission-overrides', userId] }); setModalOpen(false); form.resetFields(); },
    onError: (e) => message.error(e.response?.data?.message || 'Failed — admin access required.'),
  });
  const remove = useMutation({
    mutationFn: (id) => permissionsApi.deleteOverride(id),
    onSuccess: () => { message.success('Override removed.'); qc.invalidateQueries({ queryKey: ['permission-overrides', userId] }); },
  });

  return (
    <div>
      <Select style={{ width: 260, marginBottom: 16 }} placeholder="Select staff member" onChange={setUserId} showSearch optionFilterProp="children">
        {(staff || []).map((s) => <Option key={s.User_ID} value={s.User_ID}>{s.Full_Name}</Option>)}
      </Select>
      {userId && (
        <>
          <Button type="primary" style={{ background: '#B8860B', borderColor: '#B8860B', marginBottom: 12 }} onClick={() => setModalOpen(true)}>
            Add Module Override
          </Button>
          <Table
            size="small" dataSource={overrides || []} rowKey="Override_ID" pagination={false}
            columns={[
              { title: 'Module', dataIndex: 'Module_Key' },
              { title: 'View', dataIndex: 'Can_View', render: (v) => v ? '✅' : '—' },
              { title: 'Add', dataIndex: 'Can_Add', render: (v) => v ? '✅' : '—' },
              { title: 'Edit', dataIndex: 'Can_Edit', render: (v) => v ? '✅' : '—' },
              { title: 'Delete', dataIndex: 'Can_Delete', render: (v) => v ? '✅' : '—' },
              { title: 'Approve', dataIndex: 'Can_Approve', render: (v) => v ? '✅' : '—' },
              { title: 'Actions', render: (_, r) => <Button size="small" danger onClick={() => remove.mutate(r.Override_ID)}>Remove</Button> },
            ]}
          />
        </>
      )}
      <Modal title="Module Permission Override" open={modalOpen} onCancel={() => setModalOpen(false)} footer={null} destroyOnClose>
        <Form form={form} layout="vertical" onFinish={(v) => save.mutate(v)}>
          <Form.Item name="Module_Key" label="Module" rules={[{ required: true }]}>
            <Select>{MODULE_KEYS.map((k) => <Option key={k} value={k}>{k}</Option>)}</Select>
          </Form.Item>
          <Space size="large">
            {['Can_View', 'Can_Add', 'Can_Edit', 'Can_Delete', 'Can_Approve'].map((f) => (
              <Form.Item key={f} name={f} label={f.replace('Can_', '')} valuePropName="checked" initialValue={false}><Switch /></Form.Item>
            ))}
          </Space>
          <Button type="primary" htmlType="submit" block style={{ background: '#B8860B', borderColor: '#B8860B' }}>Save</Button>
        </Form>
      </Modal>
    </div>
  );
}

function BinAccessTab() {
  const { data: staff } = useStaff();
  const [userId, setUserId] = useState(null);
  const { data: access } = useQuery({
    queryKey: ['bin-access', userId], enabled: !!userId,
    queryFn: () => permissionsApi.getBinAccess(userId).then((r) => r.data.data),
  });
  const qc = useQueryClient();
  const remove = useMutation({
    mutationFn: (id) => permissionsApi.deleteBinAccess(id),
    onSuccess: () => { message.success('Access revoked.'); qc.invalidateQueries({ queryKey: ['bin-access', userId] }); },
  });
  return (
    <div>
      <Select style={{ width: 260, marginBottom: 16 }} placeholder="Select staff member" onChange={setUserId} showSearch optionFilterProp="children">
        {(staff || []).map((s) => <Option key={s.User_ID} value={s.User_ID}>{s.Full_Name}</Option>)}
      </Select>
      {userId && (
        <Table
          size="small" dataSource={access || []} rowKey="Access_ID" pagination={false}
          columns={[
            { title: 'Tray', dataIndex: 'Tray_Name', render: (v) => v || '-' },
            { title: 'Hidden Location', dataIndex: 'Location_Name', render: (v) => v || '-' },
            { title: 'Access Level', dataIndex: 'Access_Level' },
            { title: 'Actions', render: (_, r) => <Button size="small" danger onClick={() => remove.mutate(r.Access_ID)}>Revoke</Button> },
          ]}
        />
      )}
      <Card style={{ marginTop: 12 }} size="small">
        <Typography.Text type="secondary">
          Access is granted per Tray_ID or Hidden_Location_ID via <code>POST /api/permissions/bin-access</code> —
          add a picker here once the Tray/Hidden Location master screens exist to select from.
        </Typography.Text>
      </Card>
    </div>
  );
}

export default function PermissionsPage() {
  const tabsRef = useRef(null);
  const tourSteps = [
    { title: '1. Select a Staff Member', description: 'Pick anyone from the list, then grant them extra View/Add/Edit/Delete/Approve access on a specific module beyond what their role normally allows.', target: () => tabsRef.current },
    { title: '2. Who Can Do This', description: 'Only Super Admin or Client Admin accounts can add or remove an override — everyone else will get an access-denied error, by design.' },
    { title: '3. Bin/Tray Access', description: 'Restrict which physical trays or hidden locations a staff member can access — note the picker for choosing a specific tray isn\'t built yet, that\'s an honest gap, not hidden.' },
  ];
  return (
    <div className="page-wrapper">
      <div className="page-header">
        <Title level={4} style={{ margin: 0 }}><Space><SafetyCertificateOutlined style={{ color: '#B8860B' }} />User Permission Overrides</Space></Title>
      </div>
      <div ref={tabsRef}>
      <Tabs items={[
        { key: 'overrides', label: 'Module Overrides', children: <OverridesTab /> },
        { key: 'bin-access', label: 'Bin/Tray Access', children: <BinAccessTab /> },
      ]} />
      </div>
      <PageTour steps={tourSteps} />
    </div>
  );
}
