import React, { useRef } from 'react';
import { Typography, Tabs, Tag, Button, Space, message } from 'antd';
import { GoldOutlined } from '@ant-design/icons';
import { useQueryClient } from '@tanstack/react-query';
import { inventoryOpsApi } from '../../api/modules';
import GenericCrudTab from '../../components/GenericCrudTab';
import PageTour from '../../components/PageTour';
import dayjs from 'dayjs';

const { Title } = Typography;

function CertificatesTab() {
  return (
    <GenericCrudTab
      queryKey={['gem-certificates']} listFn={inventoryOpsApi.getCertificates} createFn={inventoryOpsApi.createCertificate}
      title="Log Certificate" rowKey="Certificate_ID"
      fields={[
        { name: 'Ornament_ID', label: 'Ornament ID' , type: 'number' },
        { name: 'Certifying_Lab', label: 'Certifying Lab', required: true, placeholder: 'GIA / IGI / HRD' },
        { name: 'Certificate_Number', label: 'Certificate Number', required: true },
        { name: 'Carat_Weight', label: 'Carat Weight', type: 'number', step: 0.01 },
        { name: 'Color_Grade', label: 'Color Grade' },
        { name: 'Clarity_Grade', label: 'Clarity Grade' },
      ]}
      columns={[
        { title: 'Lab', dataIndex: 'Certifying_Lab' },
        { title: 'Certificate No.', dataIndex: 'Certificate_Number' },
        { title: 'Carat', dataIndex: 'Carat_Weight' },
        { title: 'Color', dataIndex: 'Color_Grade' },
        { title: 'Clarity', dataIndex: 'Clarity_Grade' },
      ]}
    />
  );
}

function ReorderTab() {
  const qc = useQueryClient();
  const scan = async () => {
    try {
      const res = await inventoryOpsApi.autoScanReorder();
      message.success(res.data.message);
      qc.invalidateQueries({ queryKey: ['reorder-requests'] });
    } catch (e) { message.error(e.response?.data?.message || 'Failed.'); }
  };
  const setStatus = async (id, Status) => {
    try { await inventoryOpsApi.updateReorderRequest(id, { Status }); qc.invalidateQueries({ queryKey: ['reorder-requests'] }); }
    catch (e) { message.error(e.response?.data?.message || 'Failed.'); }
  };
  return (
    <GenericCrudTab
      queryKey={['reorder-requests']} listFn={inventoryOpsApi.getReorderRequests} createFn={inventoryOpsApi.createReorderRequest}
      title="Manual Reorder Request" rowKey="Request_ID"
      extraButton={<Button onClick={scan}>Auto-Scan Low Stock</Button>}
      fields={[
        { name: 'Type_ID', label: 'Item Type ID', type: 'number' },
        { name: 'Design_ID', label: 'Design ID', type: 'number' },
        { name: 'Requested_Qty', label: 'Quantity', type: 'number', required: true, initialValue: 1 },
        { name: 'Reason', label: 'Reason' },
      ]}
      columns={[
        { title: 'Type', dataIndex: 'Type_Name', render: (v) => v || '-' },
        { title: 'Design', dataIndex: 'Design_Name', render: (v) => v || '-' },
        { title: 'Qty', dataIndex: 'Requested_Qty' },
        { title: 'Reason', dataIndex: 'Reason' },
        { title: 'Status', dataIndex: 'Status', render: (v) => <Tag color={v === 'Received' ? 'green' : v === 'Ordered' ? 'blue' : 'orange'}>{v}</Tag> },
        {
          title: 'Actions', render: (_, r) => r.Status === 'Pending' ? (
            <Space>
              <Button size="small" onClick={() => setStatus(r.Request_ID, 'Ordered')}>Mark Ordered</Button>
              <Button size="small" danger onClick={() => setStatus(r.Request_ID, 'Cancelled')}>Cancel</Button>
            </Space>
          ) : r.Status === 'Ordered' ? <Button size="small" onClick={() => setStatus(r.Request_ID, 'Received')}>Mark Received</Button> : null,
        },
      ]}
    />
  );
}

function RfidTab() {
  return (
    <GenericCrudTab
      queryKey={['rfid-scans']} listFn={inventoryOpsApi.getRfidScans} createFn={inventoryOpsApi.logRfidScan}
      title="Log RFID Scan" rowKey="Scan_ID"
      fields={[
        { name: 'RFID_Tag', label: 'RFID Tag', required: true },
        { name: 'Scan_Type', label: 'Scan Type', type: 'select', required: true, options: ['Stock Check', 'Sale', 'Transfer', 'Audit', 'Gate'].map((s) => ({ value: s, label: s })) },
        { name: 'Scan_Location', label: 'Location' },
      ]}
      columns={[
        { title: 'RFID Tag', dataIndex: 'RFID_Tag' },
        { title: 'Type', dataIndex: 'Scan_Type' },
        { title: 'Location', dataIndex: 'Scan_Location' },
        { title: 'Ornament', dataIndex: 'Ornament_ID', render: (v) => v || 'No match' },
        { title: 'Scanned At', dataIndex: 'Scan_Date', render: (v) => dayjs(v).format('DD-MMM-YYYY HH:mm') },
      ]}
    />
  );
}

function CardChargesTab() {
  return (
    <GenericCrudTab
      queryKey={['card-charges']} listFn={inventoryOpsApi.getCardCharges} createFn={inventoryOpsApi.createCardCharge}
      title="New Card Charge Rule" rowKey="Charge_ID"
      fields={[
        { name: 'Card_Type', label: 'Card Type', type: 'select', required: true, options: ['Credit', 'Debit', 'Wallet'].map((s) => ({ value: s, label: s })) },
        { name: 'Card_Network', label: 'Network', placeholder: 'Visa / Mastercard / RuPay' },
        { name: 'Surcharge_Pct', label: 'Surcharge %', type: 'number', step: 0.1 },
        { name: 'Min_Surcharge_Amount', label: 'Minimum Surcharge (₹)', type: 'number' },
      ]}
      columns={[
        { title: 'Card Type', dataIndex: 'Card_Type' },
        { title: 'Network', dataIndex: 'Card_Network' },
        { title: 'Surcharge %', dataIndex: 'Surcharge_Pct' },
        { title: 'Min Charge', dataIndex: 'Min_Surcharge_Amount' },
      ]}
    />
  );
}

export default function InventoryOpsPage() {
  const tabsRef = useRef(null);
  const tourSteps = [
    { title: '1. Gem Certificates', description: 'Log a GIA/IGI/HRD certificate against an ornament — kept separate from HUID (that\'s the gold hallmark, a different scheme).', target: () => tabsRef.current },
    { title: '2. Auto-Scan Reorder', description: 'Click "Auto-Scan Low Stock" on the Reorder tab — it checks every item type/design combo against its minimum stock level and raises a request for anything running low, automatically.' },
    { title: '3. RFID Scans', description: 'Log a scan (stock check, sale, transfer, audit, gate) by tag — it matches against your stock automatically if that tag is on a real item.' },
    { title: '4. Card Charges', description: 'Set the surcharge % your shop applies per card network, so billing can add it correctly.' },
  ];
  return (
    <div className="page-wrapper">
      <div className="page-header">
        <Title level={4} style={{ margin: 0 }}><Space><GoldOutlined style={{ color: '#B8860B' }} />Certification, Reorder, RFID & Card Charges</Space></Title>
      </div>
      <div ref={tabsRef}>
      <Tabs items={[
        { key: 'certificates', label: 'Gem Certificates', children: <CertificatesTab /> },
        { key: 'reorder', label: 'Reorder Requests', children: <ReorderTab /> },
        { key: 'rfid', label: 'RFID Scans', children: <RfidTab /> },
        { key: 'card-charges', label: 'Card Charges', children: <CardChargesTab /> },
      ]} />
      </div>
      <PageTour steps={tourSteps} />
    </div>
  );
}
