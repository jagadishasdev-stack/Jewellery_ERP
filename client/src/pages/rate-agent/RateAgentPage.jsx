import React, { useRef } from 'react';
import { Typography, Tabs, Tag, Button, Space, message } from 'antd';
import { LineChartOutlined } from '@ant-design/icons';
import { useQueryClient } from '@tanstack/react-query';
import { rateAgentApi } from '../../api/modules';
import { formatCurrency } from '../../utils/calculations';
import GenericCrudTab from '../../components/GenericCrudTab';
import PageTour from '../../components/PageTour';
import dayjs from 'dayjs';

const { Title } = Typography;

function AgentsTab() {
  return (
    <GenericCrudTab
      queryKey={['agents']} listFn={rateAgentApi.getAgents} createFn={rateAgentApi.createAgent}
      title="New Agent" rowKey="Agent_ID"
      fields={[
        { name: 'Agent_Name', label: 'Agent Name', required: true },
        { name: 'Mobile', label: 'Mobile', required: true },
        { name: 'Email', label: 'Email' },
        { name: 'Commission_Pct', label: 'Default Commission %', type: 'number', step: 0.1 },
      ]}
      columns={[
        { title: 'Code', dataIndex: 'Agent_Code' },
        { title: 'Name', dataIndex: 'Agent_Name' },
        { title: 'Mobile', dataIndex: 'Mobile' },
        { title: 'Commission %', dataIndex: 'Commission_Pct' },
      ]}
    />
  );
}

function RateBookingsTab() {
  const qc = useQueryClient();
  return (
    <GenericCrudTab
      queryKey={['rate-bookings']} listFn={rateAgentApi.getRateBookings} createFn={rateAgentApi.createRateBooking}
      title="New Rate Booking" rowKey="Booking_ID"
      fields={[
        { name: 'Customer_ID', label: 'Customer ID', type: 'number' },
        { name: 'Metal_Type', label: 'Metal Type', type: 'select', required: true, options: ['Gold', 'Silver', 'Platinum'].map((s) => ({ value: s, label: s })) },
        { name: 'Purity_Code', label: 'Purity Code', placeholder: '22K' },
        { name: 'Booked_Rate', label: 'Booked Rate (₹/g)', type: 'number', required: true },
        { name: 'Weight_Booked', label: 'Weight Booked (g)', type: 'number', step: 0.001, required: true },
        { name: 'Advance_Amount', label: 'Advance Amount (₹)', type: 'number' },
        { name: 'Valid_Until', label: 'Valid Until', type: 'date', required: true },
      ]}
      columns={[
        { title: 'Booking No.', dataIndex: 'Booking_Number' },
        { title: 'Customer', dataIndex: 'Customer_Name' },
        { title: 'Metal', dataIndex: 'Metal_Type' },
        { title: 'Rate', dataIndex: 'Booked_Rate', render: (v) => formatCurrency(v) },
        { title: 'Weight', dataIndex: 'Weight_Booked' },
        { title: 'Valid Until', dataIndex: 'Valid_Until', render: (v) => dayjs(v).format('DD-MMM-YYYY') },
        { title: 'Status', dataIndex: 'Status', render: (v) => <Tag color={v === 'Open' ? 'blue' : v === 'Utilized' ? 'green' : 'default'}>{v}</Tag> },
      ]}
    />
  );
}

function CommissionsTab() {
  const qc = useQueryClient();
  const pay = async (id) => {
    try { await rateAgentApi.payCommission(id, {}); message.success('Marked paid.'); qc.invalidateQueries({ queryKey: ['commissions'] }); }
    catch (e) { message.error(e.response?.data?.message || 'Failed.'); }
  };
  return (
    <GenericCrudTab
      queryKey={['commissions']} listFn={rateAgentApi.getCommissions} createFn={rateAgentApi.createCommission}
      title="Calculate Commission" rowKey="Txn_ID"
      fields={[
        { name: 'Agent_ID', label: 'Agent ID', type: 'number', required: true },
        { name: 'Source_Type', label: 'Source Type', type: 'select', required: true, options: [{ value: 'Sale', label: 'Sale' }, { value: 'Scheme', label: 'Scheme' }] },
        { name: 'Source_ID', label: 'Source ID (Sale/Member ID)', type: 'number', required: true },
        { name: 'Commission_Base_Amount', label: 'Base Amount (₹)', type: 'number', required: true },
      ]}
      columns={[
        { title: 'Agent', dataIndex: 'Agent_Name' },
        { title: 'Source', render: (_, r) => `${r.Source_Type} #${r.Source_ID}` },
        { title: 'Base Amount', dataIndex: 'Commission_Base_Amount', render: (v) => formatCurrency(v) },
        { title: 'Commission', dataIndex: 'Commission_Amount', render: (v) => formatCurrency(v) },
        { title: 'Status', dataIndex: 'Status', render: (v) => <Tag color={v === 'Paid' ? 'green' : 'orange'}>{v}</Tag> },
        { title: 'Actions', render: (_, r) => r.Status === 'Pending' && <Button size="small" onClick={() => pay(r.Txn_ID)}>Mark Paid</Button> },
      ]}
    />
  );
}

export default function RateAgentPage() {
  const tabsRef = useRef(null);
  const tourSteps = [
    { title: '1. Register Agents', description: 'Add your referral agents with their default commission % first.', target: () => tabsRef.current },
    { title: '2. Book a Rate', description: 'When a customer wants to lock today\'s gold rate for a purchase they\'ll complete later, book it here with a "Valid Until" date — mark it Utilized once they actually buy.' },
    { title: '3. Agent Commissions', description: 'Calculate the commission owed on a sale or scheme referral from the agent\'s rate, and mark it Paid once settled.' },
  ];
  return (
    <div className="page-wrapper">
      <div className="page-header">
        <Title level={4} style={{ margin: 0 }}><Space><LineChartOutlined style={{ color: '#B8860B' }} />Rate Booking & Agent Commission</Space></Title>
      </div>
      <div ref={tabsRef}>
      <Tabs items={[
        { key: 'agents', label: 'Agents', children: <AgentsTab /> },
        { key: 'rate-bookings', label: 'Rate Bookings', children: <RateBookingsTab /> },
        { key: 'commissions', label: 'Agent Commissions', children: <CommissionsTab /> },
      ]} />
      </div>
      <PageTour steps={tourSteps} />
    </div>
  );
}
