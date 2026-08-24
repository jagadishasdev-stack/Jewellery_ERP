/**
 * Manual Voucher Entry — Receipt, Payment, Contra, Journal. Everything
 * else (Sales, Purchase, Day Close) posts itself automatically; these four
 * are for what a real business still needs to record by hand — a customer
 * paying down a balance, a supplier payment, moving money between two of
 * your own accounts, or a plain adjustment. Every form here is a thin
 * wrapper around the same postJournal() engine everything else uses (see
 * server/src/routes/accounting.js) — same balance check, same Tally
 * auto-queue, same bank-balance sync.
 *
 * Account fields are an AutoComplete, not a plain Select — you can pick an
 * existing ledger OR type a brand-new name; the engine creates it on the
 * fly the moment this posts (getOrCreateAccount), so there's no separate
 * "add the account first" step.
 */
import React, { useState, useRef } from 'react';
import {
  Tabs, Form, AutoComplete, InputNumber, DatePicker, Input, Button, Table,
  Typography, Space, Tag, message, Popconfirm, Select,
} from 'antd';
import { WalletOutlined, SwapOutlined, FileTextOutlined, HistoryOutlined, PlusOutlined, MinusCircleOutlined, UndoOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { accountingApi } from '../../api/modules';
import { formatCurrency } from '../../utils/calculations';
import PageTour from '../../components/PageTour';
import dayjs from 'dayjs';

const { Title, Text } = Typography;

function useAccountOptions() {
  const { data: accounts } = useQuery({
    queryKey: ['chart-of-accounts'],
    queryFn: () => accountingApi.getChartOfAccounts().then((r) => r.data.data || []),
  });
  return (accounts || []).map((a) => ({ value: a.Account_Name, label: `${a.Account_Code} — ${a.Account_Name}` }));
}

function AccountField({ name, label, options, required = true }) {
  return (
    <Form.Item name={name} label={label} rules={required ? [{ required: true, message: `${label} is required.` }] : []}>
      <AutoComplete options={options} filterOption={(input, opt) => opt.value.toLowerCase().includes(input.toLowerCase())} placeholder="Pick an existing ledger, or type a new name" />
    </Form.Item>
  );
}

function ReceiptForm({ options, onDone }) {
  const [form] = Form.useForm();
  const mutation = useMutation({
    mutationFn: accountingApi.postReceipt,
    onSuccess: (r) => { message.success(`Receipt ${r.data.data.journalNumber} recorded.`); form.resetFields(); onDone(); },
    onError: (err) => message.error(err.response?.data?.message || 'Failed to record receipt.'),
  });
  const submit = (v) => mutation.mutate({ ...v, date: v.date?.format('YYYY-MM-DD') });
  return (
    <Form form={form} layout="vertical" onFinish={submit} initialValue={{ date: dayjs() }}>
      <AccountField name="receivedInto" label="Received Into (Cash / Bank)" options={options} />
      <AccountField name="fromAccount" label="Received From" options={options} />
      <Form.Item name="amount" label="Amount (₹)" rules={[{ required: true, message: 'Amount is required.' }]}>
        <InputNumber style={{ width: '100%' }} min={0.01} />
      </Form.Item>
      <Form.Item name="date" label="Date" initialValue={dayjs()}><DatePicker style={{ width: '100%' }} /></Form.Item>
      <Form.Item name="narration" label="Narration"><Input placeholder="What is this receipt for?" /></Form.Item>
      <Button type="primary" htmlType="submit" block loading={mutation.isPending} style={{ background: '#B8860B', borderColor: '#B8860B' }}>Record Receipt</Button>
    </Form>
  );
}

function PaymentForm({ options, onDone }) {
  const [form] = Form.useForm();
  const mutation = useMutation({
    mutationFn: accountingApi.postPayment,
    onSuccess: (r) => { message.success(`Payment ${r.data.data.journalNumber} recorded.`); form.resetFields(); onDone(); },
    onError: (err) => message.error(err.response?.data?.message || 'Failed to record payment.'),
  });
  const submit = (v) => mutation.mutate({ ...v, date: v.date?.format('YYYY-MM-DD') });
  return (
    <Form form={form} layout="vertical" onFinish={submit}>
      <AccountField name="paidFrom" label="Paid From (Cash / Bank)" options={options} />
      <AccountField name="toAccount" label="Paid To" options={options} />
      <Form.Item name="amount" label="Amount (₹)" rules={[{ required: true, message: 'Amount is required.' }]}>
        <InputNumber style={{ width: '100%' }} min={0.01} />
      </Form.Item>
      <Form.Item name="date" label="Date" initialValue={dayjs()}><DatePicker style={{ width: '100%' }} /></Form.Item>
      <Form.Item name="narration" label="Narration"><Input placeholder="What is this payment for?" /></Form.Item>
      <Button type="primary" htmlType="submit" block loading={mutation.isPending} style={{ background: '#B8860B', borderColor: '#B8860B' }}>Record Payment</Button>
    </Form>
  );
}

function ContraForm({ options, onDone }) {
  const [form] = Form.useForm();
  const mutation = useMutation({
    mutationFn: accountingApi.postContra,
    onSuccess: (r) => { message.success(`Transfer ${r.data.data.journalNumber} recorded.`); form.resetFields(); onDone(); },
    onError: (err) => message.error(err.response?.data?.message || 'Failed to record transfer.'),
  });
  const submit = (v) => {
    if (v.fromAccount === v.toAccount) { message.error('From and To accounts must be different.'); return; }
    mutation.mutate({ ...v, date: v.date?.format('YYYY-MM-DD') });
  };
  return (
    <Form form={form} layout="vertical" onFinish={submit}>
      <AccountField name="fromAccount" label="Transfer From (your own account)" options={options} />
      <AccountField name="toAccount" label="Transfer To (your own account)" options={options} />
      <Form.Item name="amount" label="Amount (₹)" rules={[{ required: true, message: 'Amount is required.' }]}>
        <InputNumber style={{ width: '100%' }} min={0.01} />
      </Form.Item>
      <Form.Item name="date" label="Date" initialValue={dayjs()}><DatePicker style={{ width: '100%' }} /></Form.Item>
      <Form.Item name="narration" label="Narration"><Input placeholder="e.g. Cash deposited into HDFC" /></Form.Item>
      <Button type="primary" htmlType="submit" block loading={mutation.isPending} style={{ background: '#B8860B', borderColor: '#B8860B' }}>Record Transfer</Button>
    </Form>
  );
}

function JournalForm({ options, onDone }) {
  const [form] = Form.useForm();
  const mutation = useMutation({
    mutationFn: accountingApi.postJournalVoucher,
    onSuccess: (r) => { message.success(`Journal ${r.data.data.journalNumber} recorded.`); form.resetFields(); onDone(); },
    onError: (err) => message.error(err.response?.data?.message || 'Failed to record journal.'),
  });
  const submit = (v) => {
    const lines = (v.lines || []).filter((l) => l?.account && l?.type && l?.amount);
    const totalDr = lines.filter((l) => l.type === 'Dr').reduce((s, l) => s + parseFloat(l.amount || 0), 0);
    const totalCr = lines.filter((l) => l.type === 'Cr').reduce((s, l) => s + parseFloat(l.amount || 0), 0);
    if (Math.abs(totalDr - totalCr) > 0.01) { message.error(`Does not balance: Dr ₹${totalDr.toFixed(2)} vs Cr ₹${totalCr.toFixed(2)}.`); return; }
    mutation.mutate({ date: v.date?.format('YYYY-MM-DD'), narration: v.narration, lines });
  };
  return (
    <Form form={form} layout="vertical" onFinish={submit} initialValues={{ lines: [{ type: 'Dr' }, { type: 'Cr' }] }}>
      <Form.Item name="date" label="Date" initialValue={dayjs()}><DatePicker style={{ width: '100%' }} /></Form.Item>
      <Form.Item name="narration" label="Narration" rules={[{ required: true, message: 'Narration is required.' }]}><Input placeholder="e.g. Depreciation on furniture for the month" /></Form.Item>
      <Form.List name="lines">
        {(fields, { add, remove }) => (
          <>
            {fields.map((field) => (
              <Space key={field.key} align="baseline" style={{ display: 'flex', marginBottom: 4 }}>
                <Form.Item {...field} name={[field.name, 'account']} rules={[{ required: true, message: 'Account required.' }]} style={{ width: 260, marginBottom: 8 }}>
                  <AutoComplete options={options} filterOption={(input, opt) => opt.value.toLowerCase().includes(input.toLowerCase())} placeholder="Account" />
                </Form.Item>
                <Form.Item {...field} name={[field.name, 'type']} rules={[{ required: true }]} style={{ width: 80, marginBottom: 8 }}>
                  <Select options={[{ value: 'Dr', label: 'Dr' }, { value: 'Cr', label: 'Cr' }]} />
                </Form.Item>
                <Form.Item {...field} name={[field.name, 'amount']} rules={[{ required: true, message: 'Amount required.' }]} style={{ width: 140, marginBottom: 8 }}>
                  <InputNumber style={{ width: '100%' }} min={0.01} placeholder="Amount" />
                </Form.Item>
                {fields.length > 2 && <MinusCircleOutlined onClick={() => remove(field.name)} />}
              </Space>
            ))}
            <Button type="dashed" onClick={() => add({ type: 'Dr' })} icon={<PlusOutlined />} style={{ marginBottom: 16 }}>Add Line</Button>
          </>
        )}
      </Form.List>
      <Button type="primary" htmlType="submit" block loading={mutation.isPending} style={{ background: '#B8860B', borderColor: '#B8860B' }}>Record Journal</Button>
    </Form>
  );
}

function VoucherHistory() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['vouchers'],
    queryFn: () => accountingApi.getVouchers({ limit: 30 }).then((r) => r.data.data),
  });
  const reverseMutation = useMutation({
    mutationFn: accountingApi.reverseVoucher,
    onSuccess: (r) => { message.success(`Reversed as ${r.data.data.journalNumber}.`); qc.invalidateQueries({ queryKey: ['vouchers'] }); qc.invalidateQueries({ queryKey: ['chart-of-accounts'] }); },
    onError: (err) => message.error(err.response?.data?.message || 'Failed to reverse.'),
  });
  const columns = [
    { title: 'Voucher No.', dataIndex: 'Journal_Number', render: (v) => <Text code style={{ fontSize: 11 }}>{v}</Text> },
    { title: 'Date', dataIndex: 'Entry_Date', render: (v) => dayjs(v).format('DD-MMM-YYYY') },
    { title: 'Type', dataIndex: 'Source_Type', render: (v) => <Tag>{v}</Tag> },
    { title: 'Narration', dataIndex: 'Narration' },
    {
      title: 'Amount', dataIndex: 'entries',
      render: (entries) => formatCurrency((entries || []).filter((e) => e.Entry_Type === 'Dr').reduce((s, e) => s + parseFloat(e.Amount), 0)),
    },
    {
      title: 'Actions',
      render: (_, r) => !r.Reference?.startsWith('REVERSAL-') && (
        <Popconfirm title="Reverse this voucher? This posts an equal-and-opposite entry — the original stays in the audit trail." onConfirm={() => reverseMutation.mutate(r.Journal_ID)}>
          <Button size="small" danger type="text" icon={<UndoOutlined />}>Reverse</Button>
        </Popconfirm>
      ),
    },
  ];
  return <Table size="small" columns={columns} dataSource={data?.items || []} loading={isLoading} rowKey="Journal_ID" pagination={{ pageSize: 10 }} scroll={{ x: 'max-content' }} />;
}

export default function VouchersPage() {
  const options = useAccountOptions();
  const qc = useQueryClient();
  const formsRef = useRef(null);
  const refreshAll = () => { qc.invalidateQueries({ queryKey: ['vouchers'] }); qc.invalidateQueries({ queryKey: ['chart-of-accounts'] }); };

  const tourSteps = [
    { title: '1. Four Voucher Types', description: 'Receipt (money in), Payment (money out), Contra (moving between your own accounts), and Journal (any adjustment) — pick whichever matches what actually happened.', target: () => formsRef.current },
    { title: '2. Accounts Auto-Create', description: 'Type a ledger name that does not exist yet and it is created the moment you save — no separate setup step required.' },
    { title: '3. Reverse, Never Delete', description: 'Made a mistake? Reverse it from the history below — that posts an equal-and-opposite entry so both the mistake and its correction stay visible, matching real audit practice.' },
  ];

  return (
    <div className="page-wrapper">
      <div className="page-header">
        <Title level={4} style={{ margin: 0 }}><Space><WalletOutlined style={{ color: '#1890ff' }} />Voucher Entry</Space></Title>
      </div>

      <div ref={formsRef} style={{ maxWidth: 480, marginBottom: 24 }}>
        <Tabs items={[
          { key: 'receipt', label: <span><WalletOutlined /> Receipt</span>, children: <ReceiptForm options={options} onDone={refreshAll} /> },
          { key: 'payment', label: <span><WalletOutlined /> Payment</span>, children: <PaymentForm options={options} onDone={refreshAll} /> },
          { key: 'contra', label: <span><SwapOutlined /> Contra</span>, children: <ContraForm options={options} onDone={refreshAll} /> },
          { key: 'journal', label: <span><FileTextOutlined /> Journal</span>, children: <JournalForm options={options} onDone={refreshAll} /> },
        ]} />
      </div>

      <Title level={5}><Space><HistoryOutlined />Recent Vouchers</Space></Title>
      <VoucherHistory />

      <PageTour steps={tourSteps} />
    </div>
  );
}
