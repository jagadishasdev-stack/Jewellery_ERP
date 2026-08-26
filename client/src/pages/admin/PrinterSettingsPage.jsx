import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Row, Col, Card, Select, Typography, Space, Tag, Button, Alert, message, Divider,
} from 'antd';
import { PrinterOutlined, CheckCircleFilled, CloseCircleFilled, ReloadOutlined } from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { tenantApi, printerConfigApi } from '../../api/modules';
import { connectQZ, listPrinters, invalidatePrinterCache } from '../../utils/printService';
import PageTour from '../../components/PageTour';

const { Title, Text } = Typography;
const { Option } = Select;

const ROLES = [
  { key: 'thermal_label', label: 'Thermal Label / RFID Printer', hint: 'Used when printing barcode/RFID stock tags.' },
  { key: 'thermal_receipt', label: 'Thermal Receipt Printer', hint: 'Used for POS receipts after a sale.' },
  { key: 'regular', label: 'Regular Printer (Epson etc.)', hint: 'Used for bills, invoices, and reports.' },
];

export default function PrinterSettingsPage() {
  const qc = useQueryClient();
  const [qzConnected, setQzConnected] = useState(null); // null = checking, true/false = known
  const [osPrinters, setOsPrinters] = useState([]);
  const [branchId, setBranchId] = useState(null);
  const [saving, setSaving] = useState({});

  // ── Walkthrough tour refs ───────────────────────────────────────────────────
  const qzStatusRef = useRef(null);
  const branchRef = useRef(null);
  const rolesRef = useRef(null);
  const closingRef = useRef(null);
  const tourSteps = [
    { title: '1. Is This Computer Ready to Print Silently?', description: 'QZ Tray is a free small app (download at qz.io) that must be installed and running on THIS computer for barcode tags, receipts and bills to print automatically without a print dialog popping up. This banner tells you if it\'s detected right now — click Retry after installing it.', target: () => qzStatusRef.current },
    { title: '2. Pick a Branch (Optional)', description: 'Leave this blank to set printers for the whole business, or choose a branch if that location has its own different printers connected.', target: () => branchRef.current },
    { title: '3. Assign a Printer to Each Role', description: 'Pick the exact OS printer for each of the 3 roles: Thermal Label/RFID (barcode & RFID stock tags), Thermal Receipt (POS receipts after a sale), and Regular (bills, invoices, reports). Once assigned, that role always prints to that exact printer.', target: () => rolesRef.current },
    { title: '4. Without This Setup', description: 'Everything still works even if you skip this page — you\'ll just see the normal print dialog and have to pick a printer by hand every single time. Setting this up once here makes all future printing silent and automatic on this computer.', target: () => closingRef.current },
  ];

  const { data: branches } = useQuery({
    queryKey: ['branches'],
    queryFn: () => tenantApi.getBranches().then(r => r.data.data),
  });

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

  return (
    <div className="page-wrapper">
      <div className="page-header">
        <Title level={4} style={{ margin: 0 }}>
          <Space><PrinterOutlined style={{ color: '#B8860B' }} />Printer Settings</Space>
        </Title>
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
              on this computer, then click Retry below. Without it, printing still works exactly as before —
              you'll just be shown the normal print dialog and pick a printer each time.
            </span>
          }
          action={<Button size="small" icon={<ReloadOutlined />} onClick={checkQZ}>Retry</Button>}
        />
      )}
      {qzConnected === true && (
        <Alert
          type="success" showIcon style={{ marginBottom: 16, borderRadius: 8 }}
          message={`QZ Tray connected — ${osPrinters.length} printer(s) detected`}
          action={<Button size="small" icon={<ReloadOutlined />} onClick={checkQZ}>Refresh</Button>}
        />
      )}
      </div>

      <div ref={branchRef}>
      <Card style={{ borderRadius: 8, border: 'none', marginBottom: 16 }} bodyStyle={{ padding: 16 }}>
        <Text strong style={{ marginRight: 12 }}>Branch (optional — leave blank to set for the whole business):</Text>
        <Select allowClear placeholder="All branches" style={{ width: 240 }} value={branchId} onChange={setBranchId}>
          {(branches || []).map(b => <Option key={b.Branch_ID} value={b.Branch_ID}>{b.Branch_Name}</Option>)}
        </Select>
      </Card>
      </div>

      <div ref={rolesRef}>
      <Row gutter={[16, 16]}>
        {ROLES.map(role => {
          const current = config?.[role.key]?.Printer_Name;
          return (
            <Col xs={24} md={8} key={role.key}>
              <Card
                title={role.label}
                style={{ borderRadius: 8, border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.07)' }}
                loading={isLoading}
              >
                <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 12 }}>{role.hint}</Text>
                <div style={{ marginBottom: 10 }}>
                  {current ? (
                    <Tag color="green" icon={<CheckCircleFilled />}>{current}</Tag>
                  ) : (
                    <Tag color="default" icon={<CloseCircleFilled />}>Not assigned</Tag>
                  )}
                </div>
                <Select
                  style={{ width: '100%' }}
                  placeholder={qzConnected ? 'Select printer' : 'Connect QZ Tray to see printers'}
                  disabled={!qzConnected || saving[role.key]}
                  loading={saving[role.key]}
                  value={osPrinters.includes(current) ? current : undefined}
                  onChange={(v) => assignPrinter(role.key, v)}
                  showSearch
                >
                  {osPrinters.map(p => <Option key={p} value={p}>{p}</Option>)}
                </Select>
              </Card>
            </Col>
          );
        })}
      </Row>
      </div>

      <div ref={closingRef}>
      <Divider />
      <Alert
        type="info" showIcon style={{ borderRadius: 8 }}
        message="How this works"
        description="Once a printer is assigned here, every barcode/RFID tag prints silently to the Thermal Label printer, every POS receipt prints silently to the Thermal Receipt printer, and bills/reports print silently to the Regular printer — no dialog, no picking a printer each time. This only takes effect on computers that have QZ Tray installed and running; other computers keep using the normal print dialog."
      />
      </div>

      <PageTour steps={tourSteps} />
    </div>
  );
}
