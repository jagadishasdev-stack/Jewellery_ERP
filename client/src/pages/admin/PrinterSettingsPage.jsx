import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Table, Select, Typography, Space, Tag, Button, Alert, message, Divider,
} from 'antd';
import { PrinterOutlined, CheckCircleFilled, CloseCircleFilled, ReloadOutlined, ExperimentOutlined, HistoryOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { tenantApi, printerConfigApi } from '../../api/modules';
import { connectQZ, listPrinters, invalidatePrinterCache, testPrint, getPrinterStatus, PRINTER_ROLES } from '../../utils/printService';
import PageTour from '../../components/PageTour';

const { Title, Text } = Typography;
const { Option } = Select;

// Static fallback labels/hints, used only until GET /api/printer-config/roles
// resolves — keeps this in sync with server/src/routes/printerConfig.js's
// ROLE_META without the page ever showing a blank table on first load.
const FALLBACK_ROLE_META = {
  quotation:     { label: 'Quotation',            hint: 'Price quotations given to customers before a sale.' },
  sales_bill:    { label: 'Sales Bill / Invoice',  hint: 'The final tax invoice for a completed sale.' },
  purchase_bill: { label: 'Purchase Bill',         hint: 'Bills recorded for stock/gold purchased from suppliers.' },
  barcode:       { label: 'Barcode / RFID Label',  hint: 'Stock tag labels — usually a dedicated thermal barcode printer.' },
  receipt:       { label: 'Receipt',               hint: 'POS receipts and payment/collection acknowledgements.' },
  credit_note:   { label: 'Credit Note',            hint: 'Issued to a customer for a sales return.' },
  debit_note:    { label: 'Debit Note',             hint: 'Issued to a supplier for a purchase return.' },
  reports:       { label: 'Reports',                hint: 'Printed reports (day book, stock reports, etc).' },
  other:         { label: 'Other',                  hint: 'Everything else with no more specific role above.' },
};

const STATUS_META = {
  connected:    { color: 'green',   text: 'Ready' },
  error:        { color: 'orange',  text: 'Error' },
  unknown:      { color: 'default', text: 'Not tested yet' },
};

export default function PrinterSettingsPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [qzConnected, setQzConnected] = useState(null); // null = checking, true/false = known
  const [osPrinters, setOsPrinters] = useState([]);
  const [branchId, setBranchId] = useState(null);
  const [saving, setSaving] = useState({});
  const [testing, setTesting] = useState({});
  // Bumped (setter only — the value itself is never read) after every test
  // print purely to force this component to re-render, since
  // getPrinterStatus() reads a plain module-level cache outside React
  // state (shared across every page that prints, not just this one).
  const [, setStatusTick] = useState(0);

  // ── Walkthrough tour refs ───────────────────────────────────────────────────
  const qzStatusRef = useRef(null);
  const branchRef = useRef(null);
  const rolesRef = useRef(null);
  const closingRef = useRef(null);
  const tourSteps = [
    { title: '1. Is This Computer Ready to Print Silently?', description: 'QZ Tray is a free small app (download at qz.io) that works identically on Mac and Windows, and must be installed and running on THIS computer for documents to print automatically without a print dialog popping up. This banner tells you if it\'s detected right now — click Retry after installing it.', target: () => qzStatusRef.current },
    { title: '2. Pick a Branch (Optional)', description: 'Leave this blank to set printers for the whole business, or choose a branch if that location has its own different printers connected.', target: () => branchRef.current },
    { title: '3. Assign a Printer to Each Document Type', description: 'Pick the exact OS printer for each of the 9 document types — Quotation, Sales Bill, Purchase Bill, Barcode, Receipt, Credit Note, Debit Note, Reports, and Other. Once assigned, that document type always prints to that exact printer. Use Test Print to confirm it actually works before relying on it.', target: () => rolesRef.current },
    { title: '4. Without This Setup', description: 'Everything still works even if you skip this page — you\'ll just see the normal print dialog and have to pick a printer by hand every single time. Setting this up once here makes all future printing silent and automatic on this computer.', target: () => closingRef.current },
  ];

  const { data: branches } = useQuery({
    queryKey: ['branches'],
    queryFn: () => tenantApi.getBranches().then(r => r.data.data),
  });

  const { data: roleMeta } = useQuery({
    queryKey: ['printer-config-roles'],
    queryFn: () => printerConfigApi.getRoles().then(r => r.data.data),
    staleTime: Infinity, // static server-side metadata, never changes at runtime
  });
  const roles = (roleMeta || PRINTER_ROLES.map((key) => ({ key, ...FALLBACK_ROLE_META[key] })));

  const { data: config, isLoading, refetch } = useQuery({
    queryKey: ['printer-config', branchId],
    queryFn: () => printerConfigApi.get(branchId ? { branchId } : {}).then(r => r.data.data),
  });

  const checkQZ = useCallback(async () => {
    setQzConnected(null);
    const connected = await connectQZ();
    setQzConnected(connected);
    if (connected) setOsPrinters(await listPrinters());
    else setOsPrinters([]);
  }, []);

  useEffect(() => { checkQZ(); }, [checkQZ]);

  const assignPrinter = async (role, printerName) => {
    setSaving(prev => ({ ...prev, [role]: true }));
    try {
      await printerConfigApi.save({ role, printerName, branchId: branchId || undefined });
      message.success('Printer assigned.');
      invalidatePrinterCache();
      qc.invalidateQueries(['printer-config']);
      refetch();
    } catch (err) {
      message.error(err.response?.data?.message || 'Failed to assign printer.');
    } finally {
      setSaving(prev => ({ ...prev, [role]: false }));
    }
  };

  // Test Print (spec §13) — a real test document to the exact assigned
  // printer, with a clear pass/fail message, not a silent fallback.
  const runTestPrint = async (role, printerName) => {
    setTesting((prev) => ({ ...prev, [role]: true }));
    try {
      const result = await testPrint(printerName, role);
      if (result.success) message.success(`✓ ${printerName} connected successfully.`);
      else message.error(`⚠ Unable to connect to ${printerName}. ${result.error || ''}`);
    } finally {
      setTesting((prev) => ({ ...prev, [role]: false }));
      setStatusTick((t) => t + 1);
    }
  };

  const columns = [
    {
      title: 'Document Type', dataIndex: 'label', width: 200,
      render: (label, row) => (
        <div>
          <Text strong>{label}</Text>
          <div><Text type="secondary" style={{ fontSize: 11 }}>{row.hint}</Text></div>
        </div>
      ),
    },
    {
      title: 'Assigned Printer', width: 280,
      render: (_, row) => {
        const current = config?.[row.key]?.Printer_Name;
        return (
          <Select
            style={{ width: '100%' }}
            placeholder={qzConnected ? 'Select printer' : 'Connect QZ Tray to see printers'}
            disabled={!qzConnected || saving[row.key]}
            loading={saving[row.key]}
            value={osPrinters.includes(current) ? current : undefined}
            onChange={(v) => assignPrinter(row.key, v)}
            showSearch
          >
            {osPrinters.map(p => <Option key={p} value={p}>{p}</Option>)}
          </Select>
        );
      },
    },
    {
      title: 'Default', width: 110,
      render: (_, row) => {
        const current = config?.[row.key]?.Printer_Name;
        return current
          ? <Tag color="green" icon={<CheckCircleFilled />}>Default</Tag>
          : <Tag color="default" icon={<CloseCircleFilled />}>Not set</Tag>;
      },
    },
    {
      title: 'Status', width: 120,
      render: (_, row) => {
        const current = config?.[row.key]?.Printer_Name;
        if (!current) return <Tag color="default">—</Tag>;
        const s = STATUS_META[getPrinterStatus(current)] || STATUS_META.unknown;
        return <Tag color={s.color}>{s.text}</Tag>;
      },
    },
    {
      title: 'Test Print', width: 130,
      render: (_, row) => {
        const current = config?.[row.key]?.Printer_Name;
        return (
          <Button
            size="small" icon={<ExperimentOutlined />}
            disabled={!current || !qzConnected}
            loading={testing[row.key]}
            onClick={() => runTestPrint(row.key, current)}
          >
            Test
          </Button>
        );
      },
    },
  ];

  return (
    <div className="page-wrapper">
      <div className="page-header">
        <Title level={4} style={{ margin: 0 }}>
          <Space><PrinterOutlined style={{ color: '#B8860B' }} />Printer Settings</Space>
        </Title>
        <Button icon={<HistoryOutlined />} onClick={() => navigate('/admin/print-history')}>Print History</Button>
      </div>

      <div ref={qzStatusRef}>
      {qzConnected === null && (
        <Alert type="info" showIcon message="Checking for QZ Tray..." style={{ marginBottom: 16, borderRadius: 8 }} />
      )}
      {qzConnected === false && (
        <Alert
          type="warning" showIcon style={{ marginBottom: 16, borderRadius: 8 }}
          message="QZ Tray not detected"
          description={
            <span>
              Install the free <a href="https://qz.io/download/" target="_blank" rel="noreferrer">QZ Tray</a> app
              (works the same way on Mac and Windows) on this computer, then click Retry below. Without it, printing
              still works exactly as before — you'll just be shown the normal print dialog and pick a printer each time.
            </span>
          }
          action={<Button size="small" icon={<ReloadOutlined />} onClick={checkQZ}>Retry</Button>}
        />
      )}
      {qzConnected === true && (
        <Alert
          type="success" showIcon style={{ marginBottom: 16, borderRadius: 8 }}
          message={`QZ Tray connected — ${osPrinters.length} printer(s) detected on this computer`}
          action={<Button size="small" icon={<ReloadOutlined />} onClick={checkQZ}>Refresh</Button>}
        />
      )}
      </div>

      <div ref={branchRef}>
      <div style={{ background: '#fff', borderRadius: 8, padding: 16, marginBottom: 16, boxShadow: '0 1px 4px rgba(0,0,0,.07)' }}>
        <Text strong style={{ marginRight: 12 }}>Branch (optional — leave blank to set for the whole business):</Text>
        <Select allowClear placeholder="All branches" style={{ width: 240 }} value={branchId} onChange={setBranchId}>
          {(branches || []).map(b => <Option key={b.Branch_ID} value={b.Branch_ID}>{b.Branch_Name}</Option>)}
        </Select>
      </div>
      </div>

      <div ref={rolesRef}>
        <Table
          columns={columns}
          dataSource={roles}
          rowKey="key"
          loading={isLoading}
          pagination={false}
          size="middle"
          scroll={{ x: 'max-content' }}
          style={{ background: '#fff', borderRadius: 8, boxShadow: '0 1px 4px rgba(0,0,0,.07)' }}
        />
      </div>

      <div ref={closingRef}>
      <Divider />
      <Alert
        type="info" showIcon style={{ borderRadius: 8 }}
        message="How this works"
        description="Once a printer is assigned to a document type here, every print of that type goes silently to that exact printer — no dialog, no picking a printer each time. This only takes effect on computers that have QZ Tray installed and running (identically on Mac and Windows); other computers keep using the normal print dialog, where you can still pick any printer by hand for a one-off job."
      />
      </div>

      <PageTour steps={tourSteps} />
    </div>
  );
}
