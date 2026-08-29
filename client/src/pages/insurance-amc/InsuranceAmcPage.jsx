import React, { useState, useRef } from 'react';
import { Typography, Tabs, Tag, Button, Space, message, Modal, InputNumber, Form, Alert } from 'antd';
import { SafetyOutlined, FileProtectOutlined } from '@ant-design/icons';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { useLocation } from 'react-router-dom';
import { insuranceAmcApi } from '../../api/modules';
import { formatCurrency } from '../../utils/calculations';
import GenericCrudTab from '../../components/GenericCrudTab';
import PageTour from '../../components/PageTour';
import dayjs from 'dayjs';

const { Title } = Typography;

function PoliciesTab() {
  return (
    <GenericCrudTab
      queryKey={['insurance-policies']} listFn={insuranceAmcApi.getPolicies} createFn={insuranceAmcApi.createPolicy}
      title="New Policy" rowKey="Policy_ID"
      fields={[
        { name: 'Insurer_Name', label: 'Insurer Name', required: true },
        { name: 'Policy_Number', label: 'Policy Number', required: true },
        { name: 'Coverage_Type', label: 'Coverage Type', type: 'select', options: [{ value: 'Theft', label: 'Theft' }, { value: 'Loss', label: 'Loss' }, { value: 'Damage', label: 'Damage' }, { value: 'All Risk', label: 'All Risk' }] },
        { name: 'Premium_Rate_Pct', label: 'Premium Rate (% of sum insured)', type: 'number', step: 0.1 },
      ]}
      columns={[
        { title: 'Insurer', dataIndex: 'Insurer_Name' },
        { title: 'Policy No.', dataIndex: 'Policy_Number' },
        { title: 'Coverage', dataIndex: 'Coverage_Type' },
        { title: 'Premium %', dataIndex: 'Premium_Rate_Pct' },
      ]}
    />
  );
}

// Renewal reminder — a policy expiring within 30 days (or already past its
// Expiry_Date) gets flagged right on the Expiry column; there was no
// reminder of any kind before, anywhere.
const RENEWAL_WINDOW_DAYS = 30;
function expiryFlag(expiryDate) {
  if (!expiryDate) return null;
  const daysLeft = dayjs(expiryDate).diff(dayjs(), 'day');
  if (daysLeft < 0) return { color: 'red', label: 'Expired' };
  if (daysLeft <= RENEWAL_WINDOW_DAYS) return { color: 'orange', label: `Renew in ${daysLeft}d` };
  return null;
}

function CustomerInsuranceTab({ prefill }) {
  const qc = useQueryClient();
  const [claimTarget, setClaimTarget] = useState(null); // the row being claimed against
  const [claimForm] = Form.useForm();

  const claimMutation = useMutation({
    mutationFn: ({ id, data }) => insuranceAmcApi.claimCustomerInsurance(id, data),
    onSuccess: () => {
      message.success('Claim recorded.');
      qc.invalidateQueries({ queryKey: ['customer-insurance'] });
      setClaimTarget(null);
      claimForm.resetFields();
    },
    onError: (err) => message.error(err.response?.data?.message || 'Failed to record claim.'),
  });

  const { data: rows } = useQuery({
    queryKey: ['customer-insurance'],
    queryFn: () => insuranceAmcApi.getCustomerInsurance().then((r) => (Array.isArray(r.data.data) ? r.data.data : [])),
  });
  const expiringSoon = (rows || []).filter((r) => r.Status === 'Active' && expiryFlag(r.Expiry_Date));

  return (
    <>
      {expiringSoon.length > 0 && (
        <Alert
          type="warning" showIcon style={{ marginBottom: 12 }}
          message={`${expiringSoon.length} polic${expiringSoon.length === 1 ? 'y is' : 'ies are'} expired or expiring within ${RENEWAL_WINDOW_DAYS} days`}
          description={expiringSoon.map((r) => r.Customer_Name).join(', ')}
        />
      )}
      <GenericCrudTab
        queryKey={['customer-insurance']} listFn={insuranceAmcApi.getCustomerInsurance} createFn={insuranceAmcApi.createCustomerInsurance}
        title="Enroll Customer" rowKey="Insurance_ID"
        initialValues={prefill} autoOpen={!!prefill}
        fields={[
          { name: 'Customer_ID', label: 'Customer ID', type: 'number', required: true, placeholder: 'Numeric Customer_ID' },
          { name: 'Policy_ID', label: 'Policy ID', type: 'number', placeholder: 'Numeric Policy_ID' },
          { name: 'Sum_Insured', label: 'Sum Insured (₹)', type: 'number', required: true },
          { name: 'Start_Date', label: 'Start Date', type: 'date', required: true },
        ]}
        columns={[
          { title: 'Customer', dataIndex: 'Customer_Name' },
          { title: 'Insurer', dataIndex: 'Insurer_Name' },
          { title: 'Sum Insured', dataIndex: 'Sum_Insured', render: (v) => formatCurrency(v) },
          { title: 'Premium', dataIndex: 'Premium_Amount', render: (v) => formatCurrency(v) },
          {
            title: 'Expiry', dataIndex: 'Expiry_Date',
            render: (v) => {
              const flag = expiryFlag(v);
              return <span>{v ? dayjs(v).format('DD-MMM-YYYY') : '-'} {flag && <Tag color={flag.color} style={{ marginLeft: 4 }}>{flag.label}</Tag>}</span>;
            },
          },
          { title: 'Status', dataIndex: 'Status', render: (v) => <Tag color={v === 'Active' ? 'green' : v === 'Claimed' ? 'orange' : 'default'}>{v}</Tag> },
          {
            title: 'Actions',
            render: (_, r) => r.Status === 'Active' && (
              <Button size="small" icon={<FileProtectOutlined />} onClick={() => setClaimTarget(r)}>File Claim</Button>
            ),
          },
        ]}
      />

      <Modal
        title={`File Claim — ${claimTarget?.Customer_Name || ''}`}
        open={!!claimTarget}
        onCancel={() => { setClaimTarget(null); claimForm.resetFields(); }}
        footer={null} destroyOnClose
      >
        <Form form={claimForm} layout="vertical"
          onFinish={(v) => claimMutation.mutate({ id: claimTarget.Insurance_ID, data: v })}>
          <Form.Item name="Claim_Amount" label="Claim Amount (₹)" rules={[{ required: true, message: 'Claim amount is required' }]}>
            <InputNumber style={{ width: '100%' }} min={0.01} placeholder={`Sum insured: ${formatCurrency(claimTarget?.Sum_Insured || 0)}`} />
          </Form.Item>
          <Button type="primary" htmlType="submit" block loading={claimMutation.isPending} style={{ background: '#B8860B', borderColor: '#B8860B' }}>
            Submit Claim
          </Button>
        </Form>
      </Modal>
    </>
  );
}

function AmcPlansTab() {
  return (
    <GenericCrudTab
      queryKey={['amc-plans']} listFn={insuranceAmcApi.getAmcPlans} createFn={insuranceAmcApi.createAmcPlan}
      title="New AMC Plan" rowKey="Plan_ID"
      fields={[
        { name: 'Plan_Name', label: 'Plan Name', required: true },
        { name: 'Duration_Months', label: 'Duration (months)', type: 'number', initialValue: 12, required: true },
        { name: 'Amount', label: 'Amount (₹)', type: 'number', required: true },
        { name: 'Free_Services_Included', label: 'Free Services Included', type: 'number', initialValue: 1 },
        { name: 'Coverage_Details', label: 'Coverage Details', type: 'textarea' },
      ]}
      columns={[
        { title: 'Plan', dataIndex: 'Plan_Name' },
        { title: 'Duration (mo)', dataIndex: 'Duration_Months' },
        { title: 'Amount', dataIndex: 'Amount', render: (v) => formatCurrency(v) },
        { title: 'Free Services', dataIndex: 'Free_Services_Included' },
      ]}
    />
  );
}

function AmcEnrollmentsTab() {
  const qc = useQueryClient();
  const logService = async (id) => {
    try { await insuranceAmcApi.logAmcService(id); message.success('Service visit logged.'); qc.invalidateQueries({ queryKey: ['amc-enrollments'] }); }
    catch (e) { message.error(e.response?.data?.message || 'Failed.'); }
  };
  return (
    <GenericCrudTab
      queryKey={['amc-enrollments']} listFn={insuranceAmcApi.getAmcEnrollments} createFn={insuranceAmcApi.createAmcEnrollment}
      title="New Enrollment" rowKey="Enrollment_ID"
      fields={[
        { name: 'Customer_ID', label: 'Customer ID', type: 'number', required: true },
        { name: 'Plan_ID', label: 'Plan ID', type: 'number', required: true },
        { name: 'Ornament_ID', label: 'Ornament ID (optional)', type: 'number' },
      ]}
      columns={[
        { title: 'Customer', dataIndex: 'Customer_Name' },
        { title: 'Plan', dataIndex: 'Plan_Name' },
        { title: 'Services Used', dataIndex: 'Services_Used' },
        { title: 'Last Service', dataIndex: 'Last_Service_Date', render: (v) => v ? dayjs(v).format('DD-MMM-YYYY') : 'Never' },
        { title: 'Expiry', dataIndex: 'Expiry_Date', render: (v) => v ? dayjs(v).format('DD-MMM-YYYY') : '-' },
        { title: 'Status', dataIndex: 'Status', render: (v) => <Tag color={v === 'Active' ? 'green' : 'default'}>{v}</Tag> },
        { title: 'Actions', render: (_, r) => r.Status === 'Active' && <Button size="small" onClick={() => logService(r.Enrollment_ID)}>Log Service Visit</Button> },
      ]}
    />
  );
}

export default function InsuranceAmcPage() {
  const tabsRef = useRef(null);
  // Reached with a prefill (e.g. from POS's "Offer Insurance" prompt after a
  // high-value sale) — jumps straight to Customer Insurance with the
  // customer + sum insured already filled in, instead of landing on
  // Policies and making staff hunt for the right tab and re-type numbers
  // that were already known at checkout.
  const location = useLocation();
  const prefill = location.state?.prefillCustomerId ? {
    Customer_ID: location.state.prefillCustomerId,
    Sum_Insured: location.state.prefillSumInsured,
  } : null;
  const tourSteps = [
    { title: '1. Set Up Policies & Plans', description: 'Start in "Insurance Policies" and "AMC Plans" — define the insurers/premium rates and maintenance plans you offer before enrolling any customer.', target: () => tabsRef.current },
    { title: '2. Enroll a Customer', description: 'Move to "Customer Insurance" or "AMC Enrollments" — pick the customer, policy/plan, and it works out the premium/expiry for you.' },
    { title: '3. Log a Service Visit', description: 'On an active AMC enrollment, click "Log Service Visit" each time the customer comes in for their free cleaning/polish — it tracks how many services they\'ve used.' },
  ];
  return (
    <div className="page-wrapper">
      <div className="page-header">
        <Title level={4} style={{ margin: 0 }}><Space><SafetyOutlined style={{ color: '#B8860B' }} />Insurance & AMC</Space></Title>
      </div>
      <div ref={tabsRef}>
      <Tabs defaultActiveKey={prefill ? 'customer-insurance' : 'policies'} items={[
        { key: 'policies', label: 'Insurance Policies', children: <PoliciesTab /> },
        { key: 'customer-insurance', label: 'Customer Insurance', children: <CustomerInsuranceTab prefill={prefill} /> },
        { key: 'amc-plans', label: 'AMC Plans', children: <AmcPlansTab /> },
        { key: 'amc-enrollments', label: 'AMC Enrollments', children: <AmcEnrollmentsTab /> },
      ]} />
      </div>
      <PageTour steps={tourSteps} />
    </div>
  );
}
