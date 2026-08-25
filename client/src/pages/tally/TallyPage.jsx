import React, { useRef, useState } from 'react';
import { Typography, Tabs, Tag, Switch, Form, Input, InputNumber, Button, Card, Space, message, Table, DatePicker, Alert } from 'antd';
import { SyncOutlined, DownloadOutlined, FileExcelOutlined, CloudUploadOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { tallyApi } from '../../api/modules';
import PageTour from '../../components/PageTour';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

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

// Downloads a blob response as a file with the given name — same
// createObjectURL pattern used by ClosingReportPage.jsx's PDF download.
function downloadBlob(data, filename, mimeType) {
  const blob = new Blob([data], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function ExportTab() {
  const { data: config } = useQuery({ queryKey: ['tally-config'], queryFn: () => tallyApi.getConfig().then((r) => r.data.data) });
  const [range, setRange] = useState([dayjs().startOf('month'), dayjs()]);
  const [busy, setBusy] = useState(null); // which button is loading

  const fromTo = () => ({
    from: range?.[0]?.format('YYYY-MM-DD'),
    to: range?.[1]?.format('YYYY-MM-DD'),
  });

  const downloadLedgers = async () => {
    setBusy('ledgers');
    try {
      const res = await tallyApi.exportLedgersXml();
      downloadBlob(res.data, 'chart-of-accounts_tally-ledgers.xml', 'application/xml');
      message.success('Chart of Accounts XML downloaded.');
    } catch { message.error('Failed to generate ledger XML.'); } finally { setBusy(null); }
  };

  const downloadVouchersXml = async () => {
    const { from, to } = fromTo();
    if (!from || !to) return message.warning('Pick a date range first.');
    setBusy('xml');
    try {
      const res = await tallyApi.exportVouchersXml({ from, to });
      downloadBlob(res.data, `tally-vouchers_${from}_to_${to}.xml`, 'application/xml');
      message.success('Voucher XML downloaded — import it via Gateway of Tally → Import Data.');
    } catch (err) {
      message.error('Failed to generate voucher XML — is there anything posted in this date range?');
    } finally { setBusy(null); }
  };

  const downloadVouchersExcel = async () => {
    const { from, to } = fromTo();
    if (!from || !to) return message.warning('Pick a date range first.');
    setBusy('excel');
    try {
      const res = await tallyApi.exportVouchersExcel({ from, to });
      downloadBlob(res.data, `tally-vouchers_${from}_to_${to}.csv`, 'text/csv');
      message.success('Excel (CSV) export downloaded.');
    } catch {
      message.error('Failed to generate Excel export — is there anything posted in this date range?');
    } finally { setBusy(null); }
  };

  const pushMutation = useMutation({
    mutationFn: () => tallyApi.pushToTally(),
    onSuccess: (res) => message.success(res.data.message || 'Pushed to Tally.'),
    onError: (e) => message.error(e.response?.data?.message || 'Could not reach Tally.'),
  });

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Alert
        type="info" showIcon style={{ borderRadius: 8 }}
        message="Always the complete, real books"
        description="Every voucher actually posted in the date range you pick — nothing is filtered out or summarized away. Import the first batch into a throwaway TEST company in Tally and check it against this app's own Trial Balance before ever importing into your real company."
      />

      <Card title="1. Chart of Accounts (one-time / whenever ledgers change)" size="small">
        <Button icon={<DownloadOutlined />} loading={busy === 'ledgers'} onClick={downloadLedgers}>
          Download Ledgers XML
        </Button>
      </Card>

      <Card title="2. Vouchers for a date range" size="small">
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <RangePicker value={range} onChange={setRange} allowClear={false} />
          <Space wrap>
            <Button type="primary" icon={<DownloadOutlined />} loading={busy === 'xml'} onClick={downloadVouchersXml}
              style={{ background: '#B8860B', borderColor: '#B8860B' }}>
              Download Tally XML
            </Button>
            <Button icon={<FileExcelOutlined />} loading={busy === 'excel'} onClick={downloadVouchersExcel}>
              Download Excel (CSV)
            </Button>
          </Space>
          <Text type="secondary" style={{ fontSize: 12 }}>
            Downloading the XML marks these vouchers as Synced in the log below. The Excel file is a read-only copy for review — downloading it never changes anything.
          </Text>
        </Space>
      </Card>

      {config?.Sync_Enabled && config?.Server_IP && (
        <Card title="3. Push Pending vouchers straight to Tally (same LAN only)" size="small">
          <Space direction="vertical">
            <Text type="secondary" style={{ fontSize: 12 }}>
              Sends whatever is queued as Pending in the sync log directly to Tally's own XML gateway at {config.Server_IP}:{config.Server_Port || 9000}.
              Only works if this server and Tally are reachable on the same network.
            </Text>
            <Button icon={<CloudUploadOutlined />} loading={pushMutation.isPending} onClick={() => pushMutation.mutate()}>
              Push to Tally Now
            </Button>
          </Space>
        </Card>
      )}
    </Space>
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
    { title: '1. Configure Once', description: 'Enter your Tally server\'s LAN IP/port and switch on Sync Enabled if you want the direct-push option — configuring this is optional; the Export tab\'s downloads work either way.', target: () => tabsRef.current },
    { title: '2. Export', description: 'Download a Tally-importable XML (Gateway of Tally → Import Data) or a plain Excel/CSV copy for any date range — always the complete, real books, nothing excluded.' },
    { title: '3. Sync Log', description: 'Every voucher/ledger/stock-item queued for Tally shows here with its status.' },
  ];
  return (
    <div className="page-wrapper">
      <div className="page-header">
        <Title level={4} style={{ margin: 0 }}><Space><SyncOutlined style={{ color: '#B8860B' }} />Tally Accounting Bridge</Space></Title>
      </div>
      <div ref={tabsRef}>
      <Tabs items={[
        { key: 'export', label: 'Export', children: <ExportTab /> },
        { key: 'config', label: 'Configuration', children: <ConfigTab /> },
        { key: 'sync-log', label: 'Sync Log', children: <SyncLogTab /> },
      ]} />
      </div>
      <PageTour steps={tourSteps} />
    </div>
  );
}
