import React, { useRef } from 'react';
import { Typography, Tabs, Tag, Button, Space, message } from 'antd';
import { BankOutlined } from '@ant-design/icons';
import { useQueryClient } from '@tanstack/react-query';
import { bankChequeApi } from '../../api/modules';
import { formatCurrency } from '../../utils/calculations';
import GenericCrudTab from '../../components/GenericCrudTab';
import PageTour from '../../components/PageTour';
import dayjs from 'dayjs';

const { Title } = Typography;

function AccountsTab() {
  return (
    <GenericCrudTab
      queryKey={['bank-accounts']} listFn={bankChequeApi.getAccounts} createFn={bankChequeApi.createAccount}
      title="New Bank Account" rowKey="Account_ID"
      fields={[
        { name: 'Bank_Name', label: 'Bank Name', required: true },
        { name: 'Account_Name', label: 'Account Name' },
        { name: 'Account_Number', label: 'Account Number', required: true },
        { name: 'IFSC_Code', label: 'IFSC Code' },
        { name: 'Account_Type', label: 'Account Type', type: 'select', initialValue: 'Current', options: ['Current', 'Savings', 'OD/CC'].map((s) => ({ value: s, label: s })) },
        { name: 'Opening_Balance', label: 'Opening Balance (₹)', type: 'number' },
      ]}
      columns={[
        { title: 'Bank', dataIndex: 'Bank_Name' },
        { title: 'Account No.', dataIndex: 'Account_Number' },
        { title: 'Type', dataIndex: 'Account_Type' },
        { title: 'Balance', dataIndex: 'Current_Balance', render: (v) => formatCurrency(v) },
      ]}
    />
  );
}

function ChequesTab() {
  const qc = useQueryClient();
  const act = async (fn, id, msg) => {
    try { await fn(id); message.success(msg); qc.invalidateQueries({ queryKey: ['cheques'] }); }
    catch (e) { message.error(e.response?.data?.message || 'Failed.'); }
  };
  return (
    <GenericCrudTab
      queryKey={['cheques']} listFn={bankChequeApi.getCheques} createFn={bankChequeApi.createCheque}
      title="Log Cheque" rowKey="Cheque_ID"
      fields={[
        { name: 'Cheque_Type', label: 'Type', type: 'select', required: true, options: [{ value: 'Received', label: 'Received' }, { value: 'Issued', label: 'Issued' }] },
        { name: 'Party_Type', label: 'Party Type', type: 'select', options: ['Customer', 'Vendor', 'Karigar', 'Other'].map((s) => ({ value: s, label: s })) },
        { name: 'Party_Name', label: 'Party Name', required: true },
        { name: 'Cheque_Number', label: 'Cheque Number', required: true },
        { name: 'Bank_Name', label: 'Bank Name' },
        { name: 'Cheque_Date', label: 'Cheque Date', type: 'date', required: true },
        { name: 'Amount', label: 'Amount (₹)', type: 'number', required: true },
      ]}
      columns={[
        { title: 'Type', dataIndex: 'Cheque_Type' },
        { title: 'Party', dataIndex: 'Party_Name' },
        { title: 'Cheque No.', dataIndex: 'Cheque_Number' },
        { title: 'Date', dataIndex: 'Cheque_Date', render: (v) => dayjs(v).format('DD-MMM-YYYY') },
        { title: 'Amount', dataIndex: 'Amount', render: (v) => formatCurrency(v) },
        { title: 'Status', dataIndex: 'Status', render: (v) => <Tag color={v === 'Cleared' ? 'green' : v === 'Bounced' ? 'red' : v === 'Deposited' ? 'blue' : 'orange'}>{v}</Tag> },
        {
          title: 'Actions', render: (_, r) => r.Status === 'Pending' ? (
            <Space>
              <Button size="small" onClick={() => act(bankChequeApi.depositCheque, r.Cheque_ID, 'Marked deposited.')}>Deposit</Button>
            </Space>
          ) : r.Status === 'Deposited' ? (
            <Space>
              <Button size="small" onClick={() => act(bankChequeApi.clearCheque, r.Cheque_ID, 'Cheque cleared.')}>Clear</Button>
              <Button size="small" danger onClick={() => act((id) => bankChequeApi.bounceCheque(id, {}), r.Cheque_ID, 'Marked bounced.')}>Bounce</Button>
            </Space>
          ) : null,
        },
      ]}
    />
  );
}

export default function BankChequePage() {
  const tabsRef = useRef(null);
  const tourSteps = [
    { title: '1. Add Your Bank Accounts', description: 'Register each of your shop\'s own bank accounts here first — cheques you deposit get credited against one of these.', target: () => tabsRef.current },
    { title: '2. Log a Cheque', description: 'Every cheque you receive from a customer or issue to a supplier goes in the register — mark it Received or Issued.' },
    { title: '3. Deposit → Clear / Bounce', description: 'Move a received cheque through Deposit → Clear (credits your bank account balance automatically) or Bounce if it fails, with a bounce charge if any.' },
  ];
  return (
    <div className="page-wrapper">
      <div className="page-header">
        <Title level={4} style={{ margin: 0 }}><Space><BankOutlined style={{ color: '#B8860B' }} />Bank Accounts & Cheque Register</Space></Title>
      </div>
      <div ref={tabsRef}>
      <Tabs items={[
        { key: 'accounts', label: 'Bank Accounts', children: <AccountsTab /> },
        { key: 'cheques', label: 'Cheque Register', children: <ChequesTab /> },
      ]} />
      </div>
      <PageTour steps={tourSteps} />
    </div>
  );
}
