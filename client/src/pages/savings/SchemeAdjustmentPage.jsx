/**
 * Scheme Adjustment — a dedicated, sidebar-accessible entry point for the
 * two standalone scheme actions (previously only reachable by opening a
 * member's full detail view on the Members page): adjusting a member's
 * balance/bonus against a bill that's already been created, and
 * foreclosing a scheme that's stopping before it matures. Both post to
 * the real ledger automatically (see server/src/routes/savingsScheme.js).
 *
 * Search reuses the same endpoint POS's own "🪙 Scheme Adjustment" card
 * uses (GET /savings/members/search-for-pos) — it already returns each
 * match's real available balance/bonus and whether Active-scheme
 * adjustment is even allowed for this tenant.
 */
import React, { useState } from 'react';
import {
  Input, Button, Card, Typography, Tag, Space, Modal, Form,
  InputNumber, Select, Row, Col, message, Empty, Alert,
} from 'antd';
import { SearchOutlined, FileTextOutlined, StopOutlined, SwapOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { savingsApi, bankChequeApi } from '../../api/modules';
import { formatCurrency } from '../../utils/calculations';
import PageTour from '../../components/PageTour';

const { Title, Text } = Typography;

export default function SchemeAdjustmentPage() {
  const [query, setQuery] = useState('');
  const [searchTrigger, setSearchTrigger] = useState('');
  const [selectedMember, setSelectedMember] = useState(null);
  const [adjustInvoiceModal, setAdjustInvoiceModal] = useState(false);
  const [forecloseModal, setForecloseModal] = useState(false);
  const [forecloseMode, setForecloseMode] = useState('Cash');
  const [adjustForm] = Form.useForm();
  const [forecloseForm] = Form.useForm();
  const qc = useQueryClient();

  const { data: results, isFetching } = useQuery({
    queryKey: ['scheme-adjustment-search', searchTrigger],
    queryFn: () => savingsApi.searchForPos(searchTrigger).then((r) => r.data.data || []),
    enabled: !!searchTrigger,
  });

  const { data: bankAccounts } = useQuery({
    queryKey: ['bank-accounts-for-savings'],
    queryFn: () => bankChequeApi.getAccounts().then((r) => r.data.data || []),
    staleTime: 5 * 60 * 1000,
  });

  const runSearch = () => setSearchTrigger(query.trim());

  const refreshAfterAction = (res) => {
    message.success(res.data.message);
    qc.invalidateQueries({ queryKey: ['scheme-adjustment-search'] });
    setSelectedMember(null);
  };

  const adjustInvoiceMutation = useMutation({
    mutationFn: (d) => savingsApi.adjustAgainstInvoice(selectedMember.Member_ID, d),
    onSuccess: (res) => { refreshAfterAction(res); setAdjustInvoiceModal(false); adjustForm.resetFields(); },
    onError: (err) => message.error(err.response?.data?.message || 'Adjustment failed.'),
  });

  const forecloseMutation = useMutation({
    mutationFn: (d) => savingsApi.forecloseMember(selectedMember.Member_ID, d),
    onSuccess: (res) => { refreshAfterAction(res); setForecloseModal(false); forecloseForm.resetFields(); setForecloseMode('Cash'); },
    onError: (err) => message.error(err.response?.data?.message || 'Foreclosure failed.'),
  });

  const searchRef = React.useRef(null);
  const resultsRef = React.useRef(null);
  const tourSteps = [
    { title: '1. Find the Member', description: 'Search by name, mobile, or member number — same lookup POS itself uses.', target: () => searchRef.current },
    { title: '2. Adjust or Foreclose', description: 'Adjust Against a Bill settles or refunds an existing invoice using this member\'s balance. Foreclose is for a scheme stopping before it matures — enter any deduction or bonus, then settle via Cash, Bank, or a bill.', target: () => resultsRef.current },
  ];

  return (
    <div className="page-wrapper">
      <div className="page-header">
        <div>
          <Title level={4} style={{ margin: 0 }}><Space><SwapOutlined style={{ color: '#B8860B' }} />Scheme Adjustment</Space></Title>
          <Text type="secondary" style={{ fontSize: 12 }}>Adjust a member's balance against an existing bill, or foreclose a scheme stopping early — both post to the real ledger automatically.</Text>
        </div>
      </div>

      <div ref={searchRef} style={{ marginBottom: 16 }}>
        <Space.Compact style={{ width: '100%', maxWidth: 480 }}>
          <Input size="large" placeholder="Search by name, mobile, or member number" value={query}
            onChange={(e) => setQuery(e.target.value)} onPressEnter={runSearch} />
          <Button size="large" type="primary" icon={<SearchOutlined />} loading={isFetching} onClick={runSearch}
            style={{ background: '#B8860B', borderColor: '#B8860B' }}>Search</Button>
        </Space.Compact>
      </div>

      <div ref={resultsRef}>
        {searchTrigger && !isFetching && !(results || []).length && (
          <Empty description={`No Active or Matured scheme member matches "${searchTrigger}".`} />
        )}
        <Row gutter={[12, 12]}>
          {(results || []).map((m) => (
            <Col xs={24} sm={12} lg={8} key={m.Member_ID}>
              <Card size="small" style={{ borderRadius: 10 }}>
                <Space direction="vertical" size={4} style={{ width: '100%' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Text strong>{m.Member_Name}</Text>
                    <Tag color={m.Status === 'Matured' ? 'gold' : 'blue'}>{m.Status}</Tag>
                  </div>
                  <Text type="secondary" style={{ fontSize: 12 }}>{m.Member_Number} · {m.Mobile} · {m.Scheme_Name}</Text>
                  <Space size={16}>
                    <span><Text type="secondary" style={{ fontSize: 11 }}>Balance</Text><br /><Text strong style={{ color: '#B8860B' }}>{formatCurrency(m.Available_Balance)}</Text></span>
                    <span><Text type="secondary" style={{ fontSize: 11 }}>Bonus</Text><br /><Text strong style={{ color: '#722ed1' }}>{formatCurrency(m.Available_Bonus)}</Text></span>
                  </Space>
                  <Space style={{ marginTop: 6 }}>
                    <Button size="small" icon={<FileTextOutlined />} onClick={() => { setSelectedMember(m); setAdjustInvoiceModal(true); }}>
                      Adjust Against a Bill
                    </Button>
                    {m.Status === 'Active' && (
                      <Button size="small" danger icon={<StopOutlined />} onClick={() => { setSelectedMember(m); setForecloseModal(true); }}>
                        Foreclose
                      </Button>
                    )}
                  </Space>
                </Space>
              </Card>
            </Col>
          ))}
        </Row>
      </div>

      {/* ── Adjust Against a Bill ── */}
      <Modal title={`Adjust ${selectedMember?.Member_Number || ''}'s Scheme Against a Bill`}
        open={adjustInvoiceModal} onCancel={() => { setAdjustInvoiceModal(false); adjustForm.resetFields(); }}
        footer={null} destroyOnClose>
        <Alert type="info" showIcon style={{ marginBottom: 12 }}
          message="Applies this member's scheme balance/bonus against a bill that's already been created. If the bill still owes something, this settles it; if it's already fully paid, the amount is refunded back to the customer instead." />
        <Form form={adjustForm} layout="vertical" onFinish={(v) => adjustInvoiceMutation.mutate(v)}>
          <Form.Item name="Invoice_Number" label="Invoice Number" rules={[{ required: true, message: 'Invoice number is required.' }]}>
            <Input placeholder="e.g. INV-DLJ-20260811-0001" />
          </Form.Item>
          <Row gutter={12}>
            <Col xs={12}>
              <Form.Item name="Amount" label="Balance Amount (₹)" initialValue={0}>
                <InputNumber style={{ width: '100%' }} min={0} max={selectedMember?.Available_Balance} />
              </Form.Item>
            </Col>
            <Col xs={12}>
              <Form.Item name="BonusAmount" label="Bonus Amount (₹)" initialValue={0}>
                <InputNumber style={{ width: '100%' }} min={0} max={selectedMember?.Available_Bonus} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="Refund_Mode" label="If this creates a refund, refund via" initialValue="Cash">
            <Select options={[{ value: 'Cash', label: 'Cash' }, { value: 'Bank', label: 'Bank' }]} />
          </Form.Item>
          <Form.Item shouldUpdate noStyle>
            {() => adjustForm.getFieldValue('Refund_Mode') === 'Bank' && (
              <Form.Item name="Bank_Account_ID" label="Which Bank" rules={[{ required: true, message: 'Pick a bank account.' }]}>
                <Select options={(bankAccounts || []).map((b) => ({ value: b.Account_ID, label: `${b.Bank_Name} (${b.Account_Number})` }))} />
              </Form.Item>
            )}
          </Form.Item>
          <Form.Item name="Reason" label="Reason / Notes">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Button type="primary" htmlType="submit" block loading={adjustInvoiceMutation.isPending} style={{ background: '#B8860B', borderColor: '#B8860B' }}>
            Apply Adjustment
          </Button>
        </Form>
      </Modal>

      {/* ── Foreclose ── */}
      <Modal title={`Foreclose ${selectedMember?.Member_Number || ''}'s Scheme`}
        open={forecloseModal} onCancel={() => { setForecloseModal(false); forecloseForm.resetFields(); setForecloseMode('Cash'); }}
        footer={null} destroyOnClose>
        <Alert type="warning" showIcon style={{ marginBottom: 12 }}
          message="For a customer stopping this scheme before it matures. Enter any deduction (kept as business income) or goodwill bonus, then settle the net amount." />
        {selectedMember && (
          <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 12 }}>
            Amount collected so far: <Text strong>{formatCurrency(selectedMember.Available_Balance)}</Text>
          </Text>
        )}
        <Form form={forecloseForm} layout="vertical" onFinish={(v) => forecloseMutation.mutate(v)}
          initialValues={{ Settlement_Mode: 'Cash', Deduction_Amount: 0, Bonus_Amount: 0 }}>
          <Row gutter={12}>
            <Col xs={12}>
              <Form.Item name="Deduction_Amount" label="Deduction / Penalty (₹)">
                <InputNumber style={{ width: '100%' }} min={0} />
              </Form.Item>
            </Col>
            <Col xs={12}>
              <Form.Item name="Bonus_Amount" label="Goodwill Bonus (₹)">
                <InputNumber style={{ width: '100%' }} min={0} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="Settlement_Mode" label="Settle Via" rules={[{ required: true }]}>
            <Select
              options={[{ value: 'Cash', label: 'Cash' }, { value: 'Bank', label: 'Bank' }, { value: 'Adjustment', label: 'Against a Sale Bill' }]}
              onChange={setForecloseMode}
            />
          </Form.Item>
          {forecloseMode === 'Bank' && (
            <Form.Item name="Bank_Account_ID" label="Which Bank" rules={[{ required: true, message: 'Pick a bank account.' }]}>
              <Select options={(bankAccounts || []).map((b) => ({ value: b.Account_ID, label: `${b.Bank_Name} (${b.Account_Number})` }))} />
            </Form.Item>
          )}
          {forecloseMode === 'Adjustment' && (
            <Form.Item name="Invoice_Number" label="Invoice Number" rules={[{ required: true, message: 'Invoice number is required.' }]}>
              <Input placeholder="e.g. INV-DLJ-20260811-0001" />
            </Form.Item>
          )}
          <Form.Item name="Reason" label="Reason" rules={[{ required: true, message: 'A reason is required.' }]}>
            <Input.TextArea rows={2} placeholder="e.g. Customer requested early closure" />
          </Form.Item>
          <Button type="primary" danger htmlType="submit" block loading={forecloseMutation.isPending}>
            Foreclose Scheme
          </Button>
        </Form>
      </Modal>

      <PageTour steps={tourSteps} />
    </div>
  );
}
