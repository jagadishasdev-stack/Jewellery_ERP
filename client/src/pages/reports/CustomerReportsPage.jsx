/**
 * Customer Reports — Ledger | Purchase History | Outstanding
 */
import React, { useState, useRef } from 'react';
import {
  Row, Col, Card, Typography, Button, Space, Tag, Tabs, Table,
  Input, InputNumber, Statistic, Select, message, Progress, Modal, Form, Empty,
} from 'antd';
import { DownloadOutlined, SearchOutlined, TeamOutlined, DollarOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { customersApi, salesApi, reportsApi } from '../../api/modules';
import { formatCurrency } from '../../utils/calculations';
import PageTour from '../../components/PageTour';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { Option } = Select;

const exportCSV = (data, filename) => {
  if (!data?.length) { message.warning('No data.'); return; }
  const csv = [Object.keys(data[0]).join(','), ...data.map(r=>Object.values(r).map(v=>`"${v??''}"`).join(','))].join('\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv],{type:'text/csv'}));
  a.download = `${filename}_${dayjs().format('YYYYMMDD')}.csv`; a.click();
};

export default function CustomerReportsPage() {
  const [activeTab, setActiveTab] = useState('ledger');
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [searchText, setSearchText] = useState('');
  const [payModal, setPayModal] = useState(null); // { Sale_ID, Invoice_Number, Balance_Amount } | null
  const [payForm] = Form.useForm();
  const qc = useQueryClient();

  // ── Walkthrough tour refs ───────────────────────────────────────────────────
  const tabsRef = useRef(null);
  const tourSteps = [
    { title: '1. Customer Reports Tabs', description: 'Customer Ledger: this account-wise debit/credit history shows how much a specific customer owes you or has paid — it is separate from the shop\'s own accounting Ledger under Financial Reports. Purchase History: every bill a customer has made. Outstanding: every customer with a pending balance, in one list.', target: () => tabsRef.current },
    { title: '2. Pick a Customer', description: 'The Ledger and Purchase History tabs need a customer selected first — search by name or mobile number, then pick them from the dropdown.' },
    { title: '3. Outstanding — No Selection Needed', description: 'The Outstanding tab lists every customer with a pending balance automatically, sorted so the most overdue accounts are easy to spot. CSV export is available in every tab\'s card header.' },
  ];

  const { data: customers } = useQuery({
    queryKey: ['all-customers-report'],
    queryFn: () => customersApi.getAll({ limit: 500 }).then(r => r.data.data?.items || []),
  });

  const { data: ledgerData, isLoading: ledgerLoading } = useQuery({
    queryKey: ['customer-ledger', selectedCustomer],
    queryFn: () => reportsApi.customerLedger(selectedCustomer).then(r => r.data.data),
    enabled: !!selectedCustomer,
  });

  const { data: outstandingData, isLoading: outLoading } = useQuery({
    queryKey: ['customer-outstanding'],
    queryFn: () => reportsApi.customerOutstanding().then(r => r.data.data || []),
    enabled: activeTab === 'outstanding',
  });

  const { data: ageingData, isLoading: ageingLoading } = useQuery({
    queryKey: ['customer-ageing'],
    queryFn: () => reportsApi.customerAgeing().then(r => r.data.data || []),
    enabled: activeTab === 'ageing',
  });

  const { data: historyData, isLoading: histLoading } = useQuery({
    queryKey: ['customer-history', selectedCustomer],
    queryFn: () => customersApi.getHistory(selectedCustomer).then(r => r.data.data || []),
    enabled: !!selectedCustomer && activeTab === 'history',
  });

  const filtered = (customers || []).filter(c =>
    !searchText || c.Customer_Name?.toLowerCase().includes(searchText.toLowerCase()) ||
    c.Mobile_1?.includes(searchText)
  );

  const ledgerCols = [
    { title: 'Date', dataIndex: 'date', render: v => dayjs(v).format('DD-MMM-YYYY') },
    { title: 'Invoice No', dataIndex: 'invoice_no', render: v => v ? <Text code style={{fontSize:11}}>{v}</Text> : '-' },
    { title: 'Particulars', dataIndex: 'particulars' },
    { title: 'Debit', dataIndex: 'debit', render: v => parseFloat(v||0)>0 ? <Text style={{color:'#ff4d4f',fontWeight:600}}>{formatCurrency(v)}</Text> : '-' },
    { title: 'Credit', dataIndex: 'credit', render: v => parseFloat(v||0)>0 ? <Text style={{color:'#52c41a',fontWeight:600}}>{formatCurrency(v)}</Text> : '-' },
    { title: 'Balance', dataIndex: 'balance', render: v => <Text strong style={{color:'#B8860B'}}>{formatCurrency(v||0)}</Text> },
  ];

  const historyCols = [
    { title: 'Invoice No', dataIndex: 'Invoice_Number', render: v => <Text code style={{fontSize:11}}>{v}</Text> },
    { title: 'Date', dataIndex: 'Sale_Date', render: v => dayjs(v).format('DD-MMM-YYYY') },
    { title: 'Items', dataIndex: 'item_count', width: 70 },
    { title: 'Amount', dataIndex: 'Net_Payable_Amount', render: v => <Text strong style={{color:'#B8860B'}}>{formatCurrency(v)}</Text> },
    { title: 'Mode', dataIndex: 'Payment_Mode', render: v => <Tag color="blue">{v}</Tag> },
    { title: 'Status', dataIndex: 'Payment_Status', render: v => <Tag color={v==='Paid'?'green':v==='Partial'?'orange':'red'}>{v}</Tag> },
  ];

  const receivePaymentMutation = useMutation({
    mutationFn: ({ Sale_ID, ...data }) => salesApi.receivePayment(Sale_ID, data),
    onSuccess: () => {
      message.success('Payment recorded.');
      qc.invalidateQueries({ queryKey: ['customer-outstanding'] });
      qc.invalidateQueries({ queryKey: ['customer-outstanding-invoices'] });
      setPayModal(null);
      payForm.resetFields();
    },
    onError: (err) => message.error(err.response?.data?.message || 'Failed to record payment.'),
  });

  // A Partial/Pending sale's balance previously had no way to ever be
  // collected — this expandable row + modal is that missing UI, on top
  // of the new POST /sales/:id/receive-payment route.
  const OutstandingInvoicesRow = ({ record }) => {
    const { data: invoices, isLoading } = useQuery({
      queryKey: ['customer-outstanding-invoices', record.Customer_ID],
      queryFn: async () => {
        const [partial, pending] = await Promise.all([
          salesApi.list({ paymentStatus: 'Partial', search: record.Customer_Mobile, limit: 100 }),
          salesApi.list({ paymentStatus: 'Pending', search: record.Customer_Mobile, limit: 100 }),
        ]);
        return [...(partial.data.data?.items || []), ...(pending.data.data?.items || [])];
      },
    });
    return (
      <Table
        size="small" loading={isLoading} pagination={false} rowKey="Sale_ID"
        dataSource={invoices || []}
        locale={{ emptyText: <Empty description="No outstanding invoices" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
        columns={[
          { title: 'Invoice No', dataIndex: 'Invoice_Number', render: v => <Text code style={{ fontSize: 11 }}>{v}</Text> },
          { title: 'Date', dataIndex: 'Sale_Date', render: v => dayjs(v).format('DD-MMM-YYYY') },
          { title: 'Amount', dataIndex: 'Net_Payable_Amount', render: v => formatCurrency(v) },
          { title: 'Status', dataIndex: 'Payment_Status', render: v => <Tag color={v === 'Partial' ? 'orange' : 'red'}>{v}</Tag> },
          {
            title: 'Action', render: (_, sale) => (
              <Button size="small" type="primary" icon={<DollarOutlined />}
                style={{ background: '#52c41a', borderColor: '#52c41a' }}
                onClick={() => setPayModal(sale)}>
                Receive Payment
              </Button>
            ),
          },
        ]}
      />
    );
  };

  const outstandingCols = [
    { title: 'Customer', dataIndex: 'Customer_Name', render: v => <Text strong>{v}</Text> },
    { title: 'Mobile', dataIndex: 'Customer_Mobile' },
    { title: 'Total Purchases', dataIndex: 'total_purchases', render: v => formatCurrency(v) },
    { title: 'Paid', dataIndex: 'total_paid', render: v => <Text style={{color:'#52c41a'}}>{formatCurrency(v)}</Text> },
    { title: 'Outstanding', dataIndex: 'outstanding', render: v => <Text strong style={{color:'#ff4d4f'}}>{formatCurrency(v)}</Text> },
    { title: 'Last Purchase', dataIndex: 'last_purchase_date', render: v => v ? dayjs(v).format('DD-MMM-YYYY') : '-' },
  ];

  const CustomerSelect = () => (
    <Card size="small" style={{borderRadius:8,marginBottom:14}}>
      <Row gutter={12} align="middle">
        <Col xs={24} md={10}>
          <Input prefix={<SearchOutlined />} placeholder="Search customer by name or mobile"
            value={searchText} onChange={e=>setSearchText(e.target.value)} allowClear />
        </Col>
        <Col xs={24} md={10}>
          <Select style={{width:'100%'}} placeholder="Select a customer"
            value={selectedCustomer} onChange={v=>setSelectedCustomer(v)}
            showSearch optionFilterProp="children" allowClear>
            {filtered.map(c=><Option key={c.Customer_ID} value={c.Customer_ID}>{c.Customer_Name} — {c.Mobile_1}</Option>)}
          </Select>
        </Col>
        {selectedCustomer && (() => {
          const cust = customers?.find(c=>c.Customer_ID===selectedCustomer);
          return cust ? (
            <Col xs={24} md={4}>
              <Space direction="vertical" size={0}>
                <Tag color="gold">Loyalty: {cust.Loyalty_Points||0} pts</Tag>
                <Tag color="blue">Purchases: {cust.Total_Purchase_Count||0}</Tag>
              </Space>
            </Col>
          ) : null;
        })()}
      </Row>
    </Card>
  );

  const tabItems = [
    {
      key: 'ledger', label: <span>📋 Customer Ledger</span>,
      children: (
        <>
          <CustomerSelect />
          {!selectedCustomer ? (
            <Card style={{borderRadius:8,textAlign:'center',padding:40}}>
              <TeamOutlined style={{fontSize:48,color:'#d9d9d9'}} />
              <p style={{color:'#888',marginTop:12}}>Select a customer above to view their ledger</p>
            </Card>
          ) : (
            <>
              {ledgerData?.summary && (
                <Row gutter={[10,10]} style={{marginBottom:14}}>
                  {[
                    {title:'Total Purchases',value:parseFloat(ledgerData.summary.total_purchases||0),color:'#B8860B',fmt:formatCurrency},
                    {title:'Total Paid',value:parseFloat(ledgerData.summary.total_paid||0),color:'#52c41a',fmt:formatCurrency},
                    {title:'Outstanding',value:parseFloat(ledgerData.summary.outstanding||0),color:'#ff4d4f',fmt:formatCurrency},
                    {title:'Loyalty Points',value:parseInt(ledgerData.summary.loyalty_points||0),color:'#722ed1'},
                  ].map((c,i)=>(
                    <Col xs={12} md={6} key={i}>
                      <Card bodyStyle={{padding:'10px 12px'}} style={{borderRadius:8,border:'none',boxShadow:'0 1px 4px rgba(0,0,0,.07)',borderTop:`3px solid ${c.color}`}}>
                        <Statistic title={<Text style={{fontSize:11,color:'#888'}}>{c.title}</Text>}
                          value={c.value} formatter={c.fmt?v=>c.fmt(v):undefined}
                          valueStyle={{color:c.color,fontSize:16,fontWeight:700}} />
                      </Card>
                    </Col>
                  ))}
                </Row>
              )}
              <Card title="Customer Ledger" bodyStyle={{padding:0}} style={{borderRadius:8}}
                extra={<Button size="small" icon={<DownloadOutlined />} onClick={()=>exportCSV(ledgerData?.transactions||[],'customer_ledger')}>CSV</Button>}>
                <Table
            scroll={{ x: "max-content" }} columns={ledgerCols} dataSource={ledgerData?.transactions||[]} rowKey={(r,i)=>i}
                  size="small" loading={ledgerLoading} pagination={{pageSize:20}} />
              </Card>
            </>
          )}
        </>
      ),
    },
    {
      key: 'history', label: <span>🛒 Purchase History</span>,
      children: (
        <>
          <CustomerSelect />
          <Card title="Purchase History" bodyStyle={{padding:0}} style={{borderRadius:8}}
            extra={<Button size="small" icon={<DownloadOutlined />} onClick={()=>exportCSV(historyData||[],'purchase_history')}>CSV</Button>}>
            <Table
            scroll={{ x: "max-content" }} columns={historyCols} dataSource={historyData||[]} rowKey="Sale_ID"
              size="small" loading={histLoading} pagination={{pageSize:20}} />
          </Card>
        </>
      ),
    },
    {
      key: 'outstanding', label: <span>⚠️ Outstanding</span>,
      children: (
        <Card title="Customer Outstanding Balances" bodyStyle={{padding:0}} style={{borderRadius:8}}
          extra={<Button size="small" icon={<DownloadOutlined />} onClick={()=>exportCSV(outstandingData||[],'customer_outstanding')}>CSV</Button>}>
          <Table
            scroll={{ x: "max-content" }} columns={outstandingCols} dataSource={outstandingData||[]} rowKey="Customer_ID"
            size="small" loading={outLoading} pagination={{pageSize:20}}
            expandable={{ expandedRowRender: (record) => <OutstandingInvoicesRow record={record} /> }} />
        </Card>
      ),
    },
    {
      // Outstanding (above) gives one total per customer — this bucket
      // ages each one by days-since-sale, the standard AR ageing bands,
      // so a 5-day-old balance and a 200-day-old one don't look the same.
      key: 'ageing', label: <span>📅 Days Customer Db/Cr (Ageing)</span>,
      children: (
        <Card title="Customer Ageing (Days Outstanding)" bodyStyle={{padding:0}} style={{borderRadius:8}}
          extra={<Button size="small" icon={<DownloadOutlined />} onClick={()=>exportCSV(ageingData||[],'customer_ageing')}>CSV</Button>}>
          <Table
            scroll={{ x: "max-content" }} rowKey="Customer_ID" size="small" loading={ageingLoading} pagination={{pageSize:20}}
            dataSource={ageingData||[]}
            columns={[
              { title: 'Customer', dataIndex: 'Customer_Name', render: v => <Text strong>{v}</Text> },
              { title: 'Mobile', dataIndex: 'Customer_Mobile' },
              { title: '0-30 Days', dataIndex: 'bucket_0_30', render: v => parseFloat(v) > 0 ? formatCurrency(v) : '-' },
              { title: '31-60 Days', dataIndex: 'bucket_31_60', render: v => parseFloat(v) > 0 ? <Text style={{color:'#fa8c16'}}>{formatCurrency(v)}</Text> : '-' },
              { title: '61-90 Days', dataIndex: 'bucket_61_90', render: v => parseFloat(v) > 0 ? <Text style={{color:'#ff7a45'}}>{formatCurrency(v)}</Text> : '-' },
              { title: '90+ Days', dataIndex: 'bucket_90_plus', render: v => parseFloat(v) > 0 ? <Text strong style={{color:'#ff4d4f'}}>{formatCurrency(v)}</Text> : '-' },
              { title: 'Total Outstanding', dataIndex: 'total_outstanding', render: v => <Text strong style={{color:'#B8860B'}}>{formatCurrency(v)}</Text> },
              { title: 'Oldest (Days)', dataIndex: 'oldest_days' },
            ]}
          />
        </Card>
      ),
    },
  ];

  return (
    <div className="page-wrapper">
      <div className="page-header">
        <Title level={4} style={{margin:0}}><TeamOutlined style={{color:'#722ed1',marginRight:8}} />Customer Reports</Title>
      </div>
      <div ref={tabsRef}>
      <Tabs activeKey={activeTab} onChange={setActiveTab} type="card" items={tabItems} />
      </div>

      <Modal
        title={`💰 Receive Payment — ${payModal?.Invoice_Number}`}
        open={!!payModal} onCancel={() => { setPayModal(null); payForm.resetFields(); }} footer={null} destroyOnClose>
        {payModal && (
          <Form form={payForm} layout="vertical"
            initialValues={{ Amount: parseFloat(payModal.Balance_Amount || 0), Payment_Mode: 'Cash' }}
            onFinish={(v) => receivePaymentMutation.mutate({ Sale_ID: payModal.Sale_ID, ...v })}>
            <Text type="secondary">Outstanding balance: <Text strong style={{ color: '#ff4d4f' }}>{formatCurrency(payModal.Balance_Amount)}</Text></Text>
            <Form.Item name="Amount" label="Amount Received (₹)" style={{ marginTop: 12 }}
              rules={[{ required: true, message: 'Amount is required.' }, {
                validator: (_, v) => v > parseFloat(payModal.Balance_Amount) + 0.01
                  ? Promise.reject('Cannot exceed the outstanding balance.') : Promise.resolve(),
              }]}>
              <InputNumber style={{ width: '100%' }} min={0.01} max={parseFloat(payModal.Balance_Amount)} precision={2} />
            </Form.Item>
            <Form.Item name="Payment_Mode" label="Payment Mode" rules={[{ required: true }]}>
              <Select options={['Cash', 'UPI', 'Debit Card', 'Credit Card', 'NEFT', 'RTGS', 'IMPS', 'Bank Transfer', 'Cheque'].map(m => ({ value: m, label: m }))} />
            </Form.Item>
            <Form.Item name="Payment_Reference" label="Reference (optional)">
              <Input placeholder="UTR / transaction ID / cheque number" />
            </Form.Item>
            <Button type="primary" htmlType="submit" block loading={receivePaymentMutation.isPending}
              style={{ background: '#52c41a', borderColor: '#52c41a', fontWeight: 700 }}>
              Record Payment
            </Button>
          </Form>
        )}
      </Modal>

      <PageTour steps={tourSteps} />
    </div>
  );
}
