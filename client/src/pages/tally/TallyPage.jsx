import React, { useRef } from 'react';
import { Typography, Tabs, Tag, Switch, Form, Input, InputNumber, Button, Card, Space, message, Table } from 'antd';
import { SyncOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { tallyApi } from '../../api/modules';
import PageTour from '../../components/PageTour';
import dayjs from 'dayjs';

const { Title } = Typography;

function ConfigTab() {
  const qc = useQueryClient();
  const { data: config, isLoading } = useQuery({ queryKey: ['tally-config'], queryFn: () => tallyApi.getConfig().then((r) => r.data.data) });
  const save = useMutation({
    mutationFn: (v) => tallyApi.saveConfig(v),
    onSuccess: () => { message.success('Tally configuration saved.'); qc.invalidateQueries({ queryKey: ['tally-config'] }); },
    onError: (e) => message.error(e.response?.data?.message || 'Failed.'),
  });
  if (isLoading) return null;
  return (
    <Card style={{ maxWidth: 500 }}>
      <Form layout="vertical" initialValues={config || { Sync_Enabled: false }} onFinish={(v) => save.mutate(v)}>
        <Form.Item name="Tally_Company_Name" label="Tally Company Name"><Input /></Form.Item>
        <Form.Item name="Tally_Company_GUID" label="Tally Company GUID"><Input /></Form.Item>
        <Form.Item name="Server_IP" label="Tally Server IP (LAN)"><Input placeholder="e.g. 192.168.1.10" /></Form.Item>
        <Form.Item name="Server_Port" label="Port" initialValue={9000}><InputNumber style={{ width: '100%' }} /></Form.Item>
        <Form.Item name="Sync_Enabled" label="Sync Enabled" valuePropName="checked"><Switch /></Form.Item>
        <Button type="primary" htmlType="submit" block loading={save.isPending} style={{ background: '#B8860B', borderColor: '#B8860B' }}>
          Save Configuration
        </Button>
      </Form>
    </Card>
  );
}

function SyncLogTab() {
  const { data: log, isLoading } = useQuery({ queryKey: ['tally-sync-log'], queryFn: () => tallyApi.getSyncLog().then((r) => r.data.data) });
  return (
    <Table
      size="small" loading={isLoading} dataSource={log || []} rowKey="Log_ID" pagination={{ pageSize: 15 }}
      columns={[
        { title: 'Type', dataIndex: 'Sync_Type' },
        { title: 'Table', dataIndex: 'Reference_Table' },
        { title: 'Record ID', dataIndex: 'Reference_ID' },
        { title: 'Status', dataIndex: 'Status', render: (v) => <Tag color={v === 'Synced' ? 'green' : v === 'Failed' ? 'red' : 'orange'}>{v}</Tag> },
        { title: 'Error', dataIndex: 'Error_Message' },
        { title: 'Queued', dataIndex: 'Created_Date', render: (v) => dayjs(v).format('DD-MMM-YYYY HH:mm') },
      ]}
    />
  );
}

export default function TallyPage() {
  const tabsRef = useRef(null);
  const tourSteps = [
    { title: '1. Configure Once', description: 'Enter your Tally server\'s LAN IP/port and switch on Sync Enabled — required before anything can be queued for export.', target: () => tabsRef.current },
    { title: '2. Sync Log', description: 'Every voucher/ledger/stock-item queued for Tally shows here with its status. There\'s no live Tally connection running in this environment, so entries stay Pending until your own Tally-side integration picks them up — this bridge is the real, working handoff point for that.' },
  ];
  return (
    <div className="page-wrapper">
      <div className="page-header">
        <Title level={4} style={{ margin: 0 }}><Space><SyncOutlined style={{ color: '#B8860B' }} />Tally Accounting Bridge</Space></Title>
      </div>
      <div ref={tabsRef}>
      <Tabs items={[
        { key: 'config', label: 'Configuration', children: <ConfigTab /> },
        { key: 'sync-log', label: 'Sync Log', children: <SyncLogTab /> },
      ]} />
      </div>
      <PageTour steps={tourSteps} />
    </div>
  );
}
