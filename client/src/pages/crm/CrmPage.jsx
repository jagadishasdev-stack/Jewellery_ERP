import React, { useRef } from 'react';
import { Typography, Tabs, Tag, Button, Space, message, Rate } from 'antd';
import { ContactsOutlined } from '@ant-design/icons';
import { useQueryClient } from '@tanstack/react-query';
import { crmApi } from '../../api/modules';
import GenericCrudTab from '../../components/GenericCrudTab';
import PageTour from '../../components/PageTour';
import dayjs from 'dayjs';

const { Title } = Typography;

function LeadsTab() {
  const qc = useQueryClient();
  const convert = async (id) => {
    try {
      const res = await crmApi.convertLead(id);
      message.success(`Converted to customer #${res.data.data.customer.Customer_ID}`);
      qc.invalidateQueries({ queryKey: ['crm-leads'] });
    } catch (e) { message.error(e.response?.data?.message || 'Failed to convert.'); }
  };
  return (
    <GenericCrudTab
      queryKey={['crm-leads']} listFn={crmApi.getLeads} createFn={crmApi.createLead}
      title="New Lead" rowKey="Lead_ID"
      fields={[
        { name: 'Lead_Name', label: 'Name', required: true },
        { name: 'Mobile', label: 'Mobile', required: true },
        { name: 'Email', label: 'Email' },
        { name: 'Source', label: 'Source', type: 'select', initialValue: 'Walk-in', options: ['Walk-in', 'Referral', 'Online', 'Social Media', 'Ad'].map((s) => ({ value: s, label: s })) },
        { name: 'Interested_In', label: 'Interested In' },
      ]}
      columns={[
        { title: 'Name', dataIndex: 'Lead_Name' },
        { title: 'Mobile', dataIndex: 'Mobile' },
        { title: 'Source', dataIndex: 'Source' },
        { title: 'Assigned To', dataIndex: 'Assigned_To_Name', render: (v) => v || 'Unassigned' },
        { title: 'Status', dataIndex: 'Status', render: (v) => <Tag color={v === 'Converted' ? 'green' : v === 'Lost' ? 'red' : v === 'Contacted' ? 'blue' : 'default'}>{v}</Tag> },
        { title: 'Actions', render: (_, r) => r.Status !== 'Converted' && <Button size="small" onClick={() => convert(r.Lead_ID)}>Convert to Customer</Button> },
      ]}
    />
  );
}

function FollowupsTab() {
  return (
    <GenericCrudTab
      queryKey={['crm-followups']} listFn={crmApi.getFollowups} createFn={crmApi.createFollowup}
      title="Log Follow-up" rowKey="Followup_ID"
      fields={[
        { name: 'Lead_ID', label: 'Lead ID (optional)', type: 'number' },
        { name: 'Customer_ID', label: 'Customer ID (optional)', type: 'number' },
        { name: 'Contact_Mode', label: 'Contact Mode', type: 'select', options: ['Call', 'SMS', 'WhatsApp', 'Visit', 'Email'].map((s) => ({ value: s, label: s })) },
        { name: 'Remarks', label: 'Remarks', type: 'textarea', required: true },
        { name: 'Next_Followup_Date', label: 'Next Follow-up Date', type: 'date' },
      ]}
      columns={[
        { title: 'Date', dataIndex: 'Followup_Date', render: (v) => dayjs(v).format('DD-MMM-YYYY') },
        { title: 'Mode', dataIndex: 'Contact_Mode' },
        { title: 'Remarks', dataIndex: 'Remarks' },
        { title: 'Next Follow-up', dataIndex: 'Next_Followup_Date', render: (v) => v ? dayjs(v).format('DD-MMM-YYYY') : '-' },
      ]}
    />
  );
}

function FeedbackTab() {
  const qc = useQueryClient();
  const resolve = async (id) => {
    try { await crmApi.resolveFeedback(id, { Resolution_Notes: 'Resolved from dashboard' }); message.success('Marked resolved.'); qc.invalidateQueries({ queryKey: ['crm-feedback'] }); }
    catch (e) { message.error(e.response?.data?.message || 'Failed.'); }
  };
  return (
    <GenericCrudTab
      queryKey={['crm-feedback']} listFn={crmApi.getFeedback} createFn={crmApi.createFeedback}
      title="Log Feedback" rowKey="Feedback_ID"
      fields={[
        { name: 'Customer_ID', label: 'Customer ID', type: 'number' },
        { name: 'Rating', label: 'Rating (1-5)', type: 'number', min: 1, required: true },
        { name: 'Feedback_Type', label: 'Type', type: 'select', initialValue: 'General', options: ['General', 'Complaint', 'Suggestion'].map((s) => ({ value: s, label: s })) },
        { name: 'Comments', label: 'Comments', type: 'textarea' },
      ]}
      columns={[
        { title: 'Customer', dataIndex: 'Customer_Name' },
        { title: 'Rating', dataIndex: 'Rating', render: (v) => <Rate disabled value={v} style={{ fontSize: 14 }} /> },
        { title: 'Type', dataIndex: 'Feedback_Type' },
        { title: 'Comments', dataIndex: 'Comments' },
        { title: 'Status', dataIndex: 'Status', render: (v) => <Tag color={v === 'Resolved' ? 'green' : 'orange'}>{v}</Tag> },
        { title: 'Actions', render: (_, r) => r.Status !== 'Resolved' && <Button size="small" onClick={() => resolve(r.Feedback_ID)}>Mark Resolved</Button> },
      ]}
    />
  );
}

export default function CrmPage() {
  const tabsRef = useRef(null);
  const tourSteps = [
    { title: '1. Capture a Lead', description: 'Every walk-in enquiry starts here — name, mobile, and where they came from. It stays "New" until someone follows up.', target: () => tabsRef.current },
    { title: '2. Log Follow-ups', description: 'Track every call/WhatsApp/visit against a lead or existing customer, with an optional next-follow-up date so nothing falls through.' },
    { title: '3. Convert to Customer', description: 'Once a lead is ready to buy, click "Convert to Customer" on it — it creates the real customer record for you in one step, no re-typing.' },
    { title: '4. Feedback', description: 'Log ratings/complaints from customers and mark them resolved once handled.' },
  ];
  return (
    <div className="page-wrapper">
      <div className="page-header">
        <Title level={4} style={{ margin: 0 }}><Space><ContactsOutlined style={{ color: '#B8860B' }} />CRM — Leads & Feedback</Space></Title>
      </div>
      <div ref={tabsRef}>
      <Tabs items={[
        { key: 'leads', label: 'Leads', children: <LeadsTab /> },
        { key: 'followups', label: 'Follow-ups', children: <FollowupsTab /> },
        { key: 'feedback', label: 'Feedback', children: <FeedbackTab /> },
      ]} />
      </div>
      <PageTour steps={tourSteps} />
    </div>
  );
}
