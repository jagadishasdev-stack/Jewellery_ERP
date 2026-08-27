import React, { useState, useRef } from 'react';
import {
  Table, Button, Card, Typography, Tag, Space, Modal, Form,
  Input, InputNumber, Select, DatePicker, Row, Col, message,
  Alert, Statistic, Divider,
} from 'antd';
import { DollarOutlined, PlusOutlined, PrinterOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { savingsApi } from '../../api/modules';
import { formatCurrency } from '../../utils/calculations';
import { printFromInvoiceStudio } from '../../utils/thermalReceipt';
import PageTour from '../../components/PageTour';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { Option } = Select;

const PAYMENT_MODES = ['Cash','UPI','Card','NEFT','RTGS','IMPS','Cheque','PDC','Gift Voucher','Wallet','Advance'];

export default function CollectionPage() {
  const [collectModal, setCollectModal] = useState(false);
  const [memberSearch, setMemberSearch] = useState('');
  const [selectedMember, setSelectedMember] = useState(null);
  const [lastReceipt, setLastReceipt] = useState(null);
  const [form] = Form.useForm();
  const qc = useQueryClient();
  const today = dayjs().format('YYYY-MM-DD');

  const { data: collections, isLoading } = useQuery({
    queryKey: ['collections-today', today],
    queryFn: () => savingsApi.getCollections({ date: today, limit: 100 }).then(r => r.data.data.items),
  });

  const { data: memberResults } = useQuery({
    queryKey: ['member-search-collect', memberSearch],
    queryFn: () => savingsApi.getMembers({ search: memberSearch, status: 'Active' }).then(r => r.data.data.items),
    enabled: memberSearch.length >= 3,
  });

  const collectMutation = useMutation({
    mutationFn: (d) => savingsApi.collect(d),
    onSuccess: (res) => {
      const { transaction, receipt_number, is_complete } = res.data.data;
      setLastReceipt({ ...transaction, receipt_number, is_complete, member: selectedMember });
      message.success(`Receipt ${receipt_number} generated!`);
      qc.invalidateQueries(['collections-today']);
      qc.invalidateQueries(['savings-dashboard']);
      setCollectModal(false);
      form.resetFields();
      setSelectedMember(null);
    },
    onError: (err) => message.error(err.response?.data?.message || 'Collection failed.'),
  });

  // ── Walkthrough tour refs ───────────────────────────────────────────────────
  const summaryRef = useRef(null);
  const tableRef = useRef(null);
  const collectBtnRef = useRef(null);
  const tourSteps = [
    { title: '1. Today\'s Totals', description: 'A running total of everything collected today at this counter, split by Cash and UPI, plus how many receipts were issued.', target: () => summaryRef.current },
    { title: '2. Collect Installment', description: 'Click here to record a member\'s monthly installment payment.', target: () => collectBtnRef.current },
    { title: '3. Find the Member', description: 'Search by name, mobile or member number (minimum 3 characters), then click their name in the results to select them — their next installment number and monthly amount load automatically.' },
    { title: '4. Record the Payment', description: 'Confirm the amount (add a Penalty if they\'re late), pick the Payment Mode, then submit — a printable receipt is generated instantly, and you\'ll see a special message if this payment completes the scheme.' },
    { title: '5. Today\'s Collections', description: 'Every collection recorded today shows here — you can re-print any receipt using the printer icon.', target: () => tableRef.current },
  ];

  const todayTotal = (collections || []).reduce((s, r) => s + parseFloat(r.Net_Amount || 0), 0);
  const cashTotal = (collections || []).filter(r => r.Payment_Mode === 'Cash').reduce((s, r) => s + parseFloat(r.Net_Amount || 0), 0);
  const upiTotal = (collections || []).filter(r => r.Payment_Mode === 'UPI').reduce((s, r) => s + parseFloat(r.Net_Amount || 0), 0);

  // If the tenant has designed an Invoice Studio template for
  // SCHEME_RECEIPT, that design is used (with real collection data)
  // instead of the hardcoded monospace layout below — same fallback
  // pattern as printThermalReceipt for Sales Bill.
  const printReceipt = async (r) => {
    const studioData = {
      receipt_number: r.receipt_number || r.Receipt_Number,
      date: dayjs(r.Payment_Date).format('DD-MMM-YYYY HH:mm'),
      member_name: r.member?.Member_Name || r.Member_Name, member_number: r.member?.Member_Number || r.Member_Number,
      installment_no: r.Installment_No, amount: r.Net_Amount, payment_mode: r.Payment_Mode,
      is_complete: !!r.is_complete,
    };
    const studioAttempt = await printFromInvoiceStudio('SCHEME_RECEIPT', studioData, studioData.receipt_number);
    if (studioAttempt.printed) return;

    const w = window.open('', '_blank', 'width=400,height=500');
    w.document.write(`<!DOCTYPE html><html><head><style>body{font-family:monospace;font-size:11pt;padding:10px}
    .center{text-align:center}.bold{font-weight:bold}.line{border-top:1px dashed #000;margin:6px 0}</style></head>
    <body><div class="center bold" style="font-size:14pt">RECEIPT</div>
    <div class="line"></div>
    <div>Receipt No: <b>${r.receipt_number}</b></div>
    <div>Date: ${dayjs(r.Payment_Date).format('DD-MMM-YYYY HH:mm')}</div>
    <div>Member: ${r.member?.Member_Name} (${r.member?.Member_Number})</div>
    <div>Installment: ${r.Installment_No}</div>
    <div>Amount: <b>₹${parseFloat(r.Net_Amount).toLocaleString('en-IN')}</b></div>
    <div>Mode: ${r.Payment_Mode}</div>
    ${r.is_complete ? '<div class="center bold" style="margin-top:10px;color:green">🎉 SCHEME MATURED!</div>' : ''}
    <div class="line"></div>
    <div class="center">Thank you!</div>
    </body></html>`);
    w.document.close();
    setTimeout(() => { w.print(); w.close(); }, 300);
  };

  const columns = [
    { title: 'Receipt No', dataIndex: 'Receipt_Number', render: v => <Text code style={{ fontSize: 11 }}>{v}</Text> },
    { title: 'Member', render: (_, r) => <div><Text strong>{r.Member_Name}</Text><br /><Text style={{ fontSize: 10 }}>{r.Member_Number}</Text></div> },
    { title: 'Inst #', dataIndex: 'Installment_No', width: 60 },
    { title: 'Amount', dataIndex: 'Net_Amount', render: v => <Text strong style={{ color: '#52c41a' }}>{formatCurrency(v)}</Text> },
    { title: 'Mode', dataIndex: 'Payment_Mode', render: v => <Tag color="blue">{v}</Tag> },
    { title: 'Source', dataIndex: 'Collection_Source', render: v => <Tag style={{ fontSize: 10 }}>{v}</Tag> },
    { title: 'Time', dataIndex: 'Payment_Date', render: v => dayjs(v).format('HH:mm') },
    { title: '', render: (_, r) => <Button size="small" icon={<PrinterOutlined />} onClick={() => printReceipt(r)} /> },
  ];

  return (
    <div className="page-wrapper">
      <div className="page-header">
        <Title level={4} style={{ margin: 0 }}>
          <Space><DollarOutlined style={{ color: '#B8860B' }} />Collection — {dayjs().format('DD-MMM-YYYY')}</Space>
        </Title>
        <Button ref={collectBtnRef} type="primary" icon={<PlusOutlined />}
          style={{ background: '#52c41a', borderColor: '#52c41a', fontWeight: 700 }}
          onClick={() => setCollectModal(true)}>
          + Collect Installment
        </Button>
      </div>

      {lastReceipt && (
        <Alert
          message={`✅ Receipt ${lastReceipt.receipt_number} — ₹${parseFloat(lastReceipt.Net_Amount).toLocaleString('en-IN')} collected from ${lastReceipt.member?.Member_Name}`}
          description={lastReceipt.is_complete ? '🎉 Scheme has MATURED! Customer is eligible for redemption.' : undefined}
          type="success" showIcon closable
          action={<Button size="small" onClick={() => printReceipt(lastReceipt)}>Print</Button>}
          style={{ marginBottom: 16 }}
        />
      )}

      {/* Summary */}
      <div ref={summaryRef}>
      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        {[
          { title: "Today's Total", value: todayTotal, color: '#B8860B' },
          { title: 'Cash', value: cashTotal, color: '#52c41a' },
          { title: 'UPI', value: upiTotal, color: '#1890ff' },
          { title: 'Bills', value: (collections || []).length, suffix: 'receipts', color: '#722ed1' },
        ].map((s, i) => (
          <Col xs={6} key={i}>
            <Card bodyStyle={{ padding: '12px 16px' }}
              style={{ borderRadius: 8, border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.07)', borderTop: `3px solid ${s.color}` }}>
              <Statistic title={<Text style={{ fontSize: 11, color: '#888' }}>{s.title}</Text>}
                value={s.value} formatter={s.formatter || (v => s.suffix ? v : formatCurrency(v))}
                suffix={s.suffix}
                valueStyle={{ color: s.color, fontSize: 18, fontWeight: 700 }} />
            </Card>
          </Col>
        ))}
      </Row>
      </div>

      <div ref={tableRef}>
      <Card style={{ borderRadius: 8, border: 'none' }} bodyStyle={{ padding: 0 }}>
        <Table
            scroll={{ x: "max-content" }} columns={columns} dataSource={collections || []} loading={isLoading}
          rowKey="Txn_ID" size="small" pagination={{ pageSize: 50 }} />
      </Card>
      </div>

      {/* Collect Modal */}
      <Modal title="Record Installment Collection" open={collectModal}
        onCancel={() => { setCollectModal(false); form.resetFields(); setSelectedMember(null); }}
        footer={null} width={520}>
        <Form form={form} layout="vertical"
          onFinish={v => {
            if (!selectedMember) { message.warning('Select a member first.'); return; }
            collectMutation.mutate({ ...v, Member_ID: selectedMember.Member_ID });
          }}>

          {/* Member Search */}
          <Form.Item label="Search Member (name / mobile / member no)">
            <Input.Search placeholder="Min 3 chars..." onSearch={v => setMemberSearch(v)}
              onChange={e => !e.target.value && setMemberSearch('')} />
          </Form.Item>

          {memberResults?.length > 0 && !selectedMember && (
            <div style={{ border: '1px solid #f0f0f0', borderRadius: 6, marginBottom: 16, maxHeight: 200, overflowY: 'auto' }}>
              {memberResults.map(m => (
                <div key={m.Member_ID}
                  onClick={() => { setSelectedMember(m); form.setFieldValue('Amount', m.Installment_Amount); setMemberSearch(''); }}
                  style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #f5f5f5' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#fafafa'}
                  onMouseLeave={e => e.currentTarget.style.background = '#fff'}>
                  <Text strong>{m.Member_Name}</Text>
                  <Text type="secondary" style={{ marginLeft: 8, fontSize: 11 }}>{m.Member_Number} | {m.Mobile}</Text>
                  <Tag color="blue" style={{ marginLeft: 8, fontSize: 10 }}>{m.Scheme_Name}</Tag>
                  <Tag color={m.Installments_Paid > 0 ? 'green' : 'orange'} style={{ fontSize: 10 }}>
                    {m.Installments_Paid}/{m.Total_Installments} paid
                  </Tag>
                </div>
              ))}
            </div>
          )}

          {selectedMember && (
            <Alert
              message={<Space><Text strong>{selectedMember.Member_Name}</Text><Text code>{selectedMember.Member_Number}</Text><Tag color="blue">{selectedMember.Scheme_Name}</Tag></Space>}
              description={`Installment ${selectedMember.Installments_Paid + 1} of ${selectedMember.Total_Installments} | Monthly: ${formatCurrency(selectedMember.Installment_Amount)}`}
              type="info" showIcon closable onClose={() => { setSelectedMember(null); form.setFieldValue('Amount', undefined); }}
              style={{ marginBottom: 16 }}
            />
          )}

          <Row gutter={16}>
            <Col xs={12}>
              <Form.Item name="Amount" label="Amount (₹)" rules={[{ required: true }]}>
                <InputNumber style={{ width: '100%' }} size="large" min={1} formatter={v => `₹ ${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')} />
              </Form.Item>
            </Col>
            <Col xs={12}>
              <Form.Item name="Penalty_Amount" label="Penalty (₹)" initialValue={0}>
                <InputNumber style={{ width: '100%' }} min={0} />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="Payment_Mode" label="Payment Mode" initialValue="Cash" rules={[{ required: true }]}>
            <Select size="large">
              {PAYMENT_MODES.map(m => <Option key={m} value={m}>{m}</Option>)}
            </Select>
          </Form.Item>

          <Form.Item name="Payment_Reference" label="Reference / UPI ID / Cheque No">
            <Input placeholder="Optional" />
          </Form.Item>

          <Form.Item name="Collection_Source" label="Collection Source" initialValue="Counter">
            <Select><Option value="Counter">Counter</Option><Option value="App">App</Option><Option value="Agent">Agent</Option></Select>
          </Form.Item>

          <Button type="primary" htmlType="submit" block size="large"
            loading={collectMutation.isPending}
            style={{ background: '#52c41a', borderColor: '#52c41a', height: 46, fontWeight: 700 }}>
            ✅ Record Collection & Print Receipt
          </Button>
        </Form>
      </Modal>

      <PageTour steps={tourSteps} />
    </div>
  );
}
