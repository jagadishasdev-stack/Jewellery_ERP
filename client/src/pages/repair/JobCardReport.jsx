import React, { useState, useRef } from 'react';
import {
  Table, Card, Typography, Input, Select, Space, Tag, Button,
  Modal, Descriptions, Steps, Row, Col, Statistic, message,
} from 'antd';
import {
  SearchOutlined, PrinterOutlined, ToolOutlined,
  CheckCircleOutlined, ClockCircleOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { repairApi } from '../../api/modules';
import { formatCurrency } from '../../utils/calculations';
import { printFromInvoiceStudio } from '../../utils/thermalReceipt';
import PageTour from '../../components/PageTour';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { Option } = Select;

const STATUS_STEPS = { Received: 0, 'In-Progress': 1, Ready: 2, Delivered: 3 };
const STATUS_COLOR = { Received: 'blue', 'In-Progress': 'orange', Ready: 'purple', Delivered: 'green', Cancelled: 'red' };

export default function JobCardReport() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [detailJob, setDetailJob] = useState(null);
  const qc = useQueryClient();

  // ── Walkthrough tour refs ───────────────────────────────────────────────────
  const summaryRef = useRef(null);
  const filtersRef = useRef(null);
  const tableRef = useRef(null);
  const tourSteps = [
    { title: '1. Status Summary', description: 'Quick counts of all job cards by stage — Total, Received, In Progress, Ready and Delivered — so you can see workload at a glance.', target: () => summaryRef.current },
    { title: '2. Search & Filter', description: 'Search by job card number, customer name, mobile or item description, or filter the list down to a single status.', target: () => filtersRef.current },
    { title: '3. Job Card Report Table', description: 'Every repair job shows here with karigar, expected delivery (overdue ones are flagged), charges and balance due. Use Print to reprint the job card slip, or Manage to update its status and charges.', target: () => tableRef.current },
  ];

  const { data, isLoading } = useQuery({
    queryKey: ['repairs-all', status],
    queryFn: () => repairApi.getAll({ status: status || undefined, limit: 200 }).then(r => r.data.data.items),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => repairApi.update(id, data),
    onSuccess: () => { message.success('Status updated.'); qc.invalidateQueries(['repairs-all']); setDetailJob(null); },
  });

  const deliverMutation = useMutation({
    mutationFn: (id) => repairApi.deliver(id),
    onSuccess: () => { message.success('Item delivered!'); qc.invalidateQueries(['repairs-all']); setDetailJob(null); },
  });

  const filtered = (data || []).filter(r => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      r.Job_Card_Number?.toLowerCase().includes(s) ||
      r.Customer_Name?.toLowerCase().includes(s) ||
      r.Customer_Mobile?.includes(s) ||
      r.Item_Description?.toLowerCase().includes(s)
    );
  });

  const summary = {
    total: (data || []).length,
    received: (data || []).filter(r => r.Status === 'Received').length,
    inProgress: (data || []).filter(r => r.Status === 'In-Progress').length,
    ready: (data || []).filter(r => r.Status === 'Ready').length,
    delivered: (data || []).filter(r => r.Status === 'Delivered').length,
  };

  // If the tenant has designed an Invoice Studio template for
  // REPAIR_RECEIPT, that design is used (with real job-card data) instead
  // of the hardcoded layout below — same fallback pattern as
  // printThermalReceipt for Sales Bill.
  const printJobCard = async (job) => {
    const studioData = {
      job_card_number: job.Job_Card_Number, date: dayjs(job.Created_Date).format('DD-MMM-YYYY'),
      customer_name: job.Customer_Name || job.Cust_Name, customer_mobile: job.Customer_Mobile,
      expected_delivery: job.Expected_Delivery ? dayjs(job.Expected_Delivery).format('DD-MMM-YYYY') : null,
      status: job.Status, item_description: job.Item_Description,
      item_weight: job.Item_Weight, purity: job.Purity, work_required: job.Repair_Work_Required,
      estimate_amount: job.Estimate_Amount, advance_paid: job.Advance_Paid,
      labour_charge: job.Labour_Charge, balance_due: job.Balance_Due,
    };
    const studioAttempt = await printFromInvoiceStudio('REPAIR_RECEIPT', studioData, job.Job_Card_Number);
    if (studioAttempt.printed) return;

    const w = window.open('', '_blank', 'width=600,height=700');
    w.document.write(`<!DOCTYPE html><html><head><style>
      body{font-family:Arial,sans-serif;padding:20px;font-size:11pt}
      .header{text-align:center;border-bottom:2px solid #B8860B;padding-bottom:10px;margin-bottom:15px}
      .title{font-size:16pt;font-weight:bold;color:#B8860B}
      table{width:100%;border-collapse:collapse;margin:10px 0}
      td{padding:6px 8px;border:1px solid #ddd;font-size:10pt}
      .label{font-weight:bold;background:#f9f9f9;width:140px}
      .section{font-weight:bold;font-size:12pt;margin:15px 0 8px;color:#B8860B}
      .footer{margin-top:40px;display:flex;justify-content:space-between}
      .sig{border-top:1px solid #000;width:180px;text-align:center;padding-top:5px;font-size:9pt}
      @media print{body{padding:10px}}
    </style></head><body>
      <div class="header">
        <div class="title">JOB CARD — REPAIR ORDER</div>
        <div>Jewellery Repair & Service</div>
      </div>
      <table>
        <tr><td class="label">Job Card No</td><td><b>${job.Job_Card_Number}</b></td>
            <td class="label">Date</td><td>${dayjs(job.Created_Date).format('DD-MMM-YYYY')}</td></tr>
        <tr><td class="label">Customer Name</td><td>${job.Customer_Name || job.Cust_Name || '-'}</td>
            <td class="label">Mobile</td><td>${job.Customer_Mobile || '-'}</td></tr>
        <tr><td class="label">Expected Delivery</td><td>${job.Expected_Delivery ? dayjs(job.Expected_Delivery).format('DD-MMM-YYYY') : '-'}</td>
            <td class="label">Status</td><td><b>${job.Status}</b></td></tr>
      </table>
      <div class="section">Item Details</div>
      <table>
        <tr><td class="label">Item Description</td><td colspan="3">${job.Item_Description}</td></tr>
        <tr><td class="label">Weight</td><td>${job.Item_Weight ? job.Item_Weight + 'g' : '-'}</td>
            <td class="label">Purity</td><td>${job.Purity || '-'}</td></tr>
      </table>
      <div class="section">Work Required</div>
      <p style="border:1px solid #ddd;padding:8px;min-height:40px">${job.Repair_Work_Required || '-'}</p>
      <div class="section">Charges</div>
      <table>
        <tr><td class="label">Estimate</td><td>₹${parseFloat(job.Estimate_Amount || 0).toLocaleString('en-IN')}</td>
            <td class="label">Advance Paid</td><td>₹${parseFloat(job.Advance_Paid || 0).toLocaleString('en-IN')}</td></tr>
        <tr><td class="label">Labour Charge</td><td>₹${parseFloat(job.Labour_Charge || 0).toLocaleString('en-IN')}</td>
            <td class="label">Balance Due</td><td><b>₹${parseFloat(job.Balance_Due || 0).toLocaleString('en-IN')}</b></td></tr>
      </table>
      <p style="font-size:9pt;color:#666;margin-top:15px">
        * Items left for more than 90 days will not be the responsibility of the shop.<br>
        * We are not responsible for any stones or diamonds in the item.
      </p>
      <div class="footer">
        <div class="sig">Customer Signature</div>
        <div class="sig">Authorised Signatory</div>
      </div>
    </body></html>`);
    w.document.close();
    setTimeout(() => { w.print(); w.close(); }, 400);
  };

  const columns = [
    {
      title: 'Job Card No',
      dataIndex: 'Job_Card_Number',
      render: v => <Text code style={{ fontSize: 11 }}>{v}</Text>,
      width: 160,
    },
    {
      title: 'Customer',
      render: (_, r) => (
        <div>
          <Text strong>{r.Customer_Name || r.Cust_Name || '-'}</Text>
          <br />
          <Text type="secondary" style={{ fontSize: 11 }}>{r.Customer_Mobile}</Text>
        </div>
      ),
    },
    {
      title: 'Item',
      dataIndex: 'Item_Description',
      render: v => <Text style={{ fontSize: 12 }} ellipsis={{ tooltip: v }}>{v}</Text>,
    },
    { title: 'Karigar', dataIndex: 'Karigar_Name', render: v => v || 'Unassigned', width: 120 },
    {
      title: 'Delivery',
      dataIndex: 'Expected_Delivery',
      render: (v, r) => {
        if (!v) return '-';
        const overdue = r.Status !== 'Delivered' && dayjs(v).isBefore(dayjs());
        return <Text type={overdue ? 'danger' : undefined}>{dayjs(v).format('DD-MMM-YYYY')}{overdue ? ' ⚠️' : ''}</Text>;
      },
      width: 120,
    },
    { title: 'Charges', dataIndex: 'Total_Charge', render: v => formatCurrency(v), width: 100 },
    { title: 'Balance', dataIndex: 'Balance_Due', render: v => parseFloat(v) > 0 ? <Tag color="red">{formatCurrency(v)}</Tag> : <Tag color="green">Cleared</Tag>, width: 100 },
    {
      title: 'Status',
      dataIndex: 'Status',
      render: v => <Tag color={STATUS_COLOR[v]}>{v}</Tag>,
      width: 110,
    },
    {
      title: 'Actions',
      width: 130,
      render: (_, r) => (
        <Space size={4}>
          <Button size="small" icon={<PrinterOutlined />} onClick={() => printJobCard(r)}>Print</Button>
          <Button size="small" onClick={() => setDetailJob(r)}>Manage</Button>
        </Space>
      ),
    },
  ];

  return (
    <div className="page-wrapper">
      <div className="page-header">
        <Title level={4} style={{ margin: 0 }}>
          <Space><ToolOutlined style={{ color: '#B8860B' }} />Job Cards — Repair Orders</Space>
        </Title>
      </div>

      {/* Summary */}
      <div ref={summaryRef}>
      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        {[
          { label: 'Total', value: summary.total, color: '#B8860B' },
          { label: 'Received', value: summary.received, color: '#1890ff' },
          { label: 'In Progress', value: summary.inProgress, color: '#fa8c16' },
          { label: 'Ready', value: summary.ready, color: '#722ed1' },
          { label: 'Delivered', value: summary.delivered, color: '#52c41a' },
        ].map((s, i) => (
          <Col xs={12} md={6} lg={4} key={i}>
            <Card bodyStyle={{ padding: '12px 14px' }}
              style={{ borderRadius: 8, border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.07)', borderTop: `3px solid ${s.color}` }}>
              <Statistic title={<Text style={{ fontSize: 11, color: '#888' }}>{s.label}</Text>}
                value={s.value} valueStyle={{ color: s.color, fontSize: 18, fontWeight: 700 }} />
            </Card>
          </Col>
        ))}
      </Row>
      </div>

      {/* Filters */}
      <div ref={filtersRef}>
      <Card style={{ borderRadius: 8, marginBottom: 12 }} bodyStyle={{ padding: 12 }}>
        <Space wrap>
          <Input.Search
            prefix={<SearchOutlined />}
            placeholder="Search job card no, customer name, mobile, item..."
            style={{ width: 320 }}
            value={search}
            onChange={e => setSearch(e.target.value)}
            allowClear
          />
          <Select placeholder="Filter by Status" style={{ width: 160 }} allowClear onChange={v => setStatus(v || '')}>
            {['Received','In-Progress','Ready','Delivered','Cancelled'].map(s => <Option key={s} value={s}>{s}</Option>)}
          </Select>
          <Tag color="blue">{filtered.length} records</Tag>
        </Space>
      </Card>
      </div>

      <div ref={tableRef}>
      <Card style={{ borderRadius: 8, border: 'none' }} bodyStyle={{ padding: 0 }}>
        <Table columns={columns} dataSource={filtered} loading={isLoading}
          rowKey="Repair_ID" size="small" pagination={{ pageSize: 20 }} scroll={{ x: 1000 }} />
      </Card>
      </div>

      {/* Manage Modal */}
      <Modal
        title={<Space><ToolOutlined />{`Job Card — ${detailJob?.Job_Card_Number}`}</Space>}
        open={!!detailJob}
        onCancel={() => setDetailJob(null)}
        footer={null}
        width={580}
      >
        {detailJob && (
          <div>
            <Steps current={STATUS_STEPS[detailJob.Status] || 0} size="small" style={{ marginBottom: 20 }}>
              {['Received','In-Progress','Ready','Delivered'].map(s => <Steps.Step key={s} title={s} />)}
            </Steps>

            <Descriptions size="small" bordered column={2} style={{ marginBottom: 16 }}>
              <Descriptions.Item label="Customer">{detailJob.Customer_Name || detailJob.Cust_Name}</Descriptions.Item>
              <Descriptions.Item label="Mobile">{detailJob.Customer_Mobile}</Descriptions.Item>
              <Descriptions.Item label="Item" span={2}>{detailJob.Item_Description}</Descriptions.Item>
              <Descriptions.Item label="Work Required" span={2}>{detailJob.Repair_Work_Required || '-'}</Descriptions.Item>
              <Descriptions.Item label="Estimate">{formatCurrency(detailJob.Estimate_Amount)}</Descriptions.Item>
              <Descriptions.Item label="Advance Paid">{formatCurrency(detailJob.Advance_Paid)}</Descriptions.Item>
              <Descriptions.Item label="Labour">{formatCurrency(detailJob.Labour_Charge)}</Descriptions.Item>
              <Descriptions.Item label="Balance Due">
                <Text strong type={parseFloat(detailJob.Balance_Due) > 0 ? 'danger' : 'success'}>
                  {formatCurrency(detailJob.Balance_Due)}
                </Text>
              </Descriptions.Item>
            </Descriptions>

            <Space direction="vertical" style={{ width: '100%' }} size={8}>
              <Select style={{ width: '100%' }} defaultValue={detailJob.Status}
                onChange={v => setDetailJob(prev => ({ ...prev, Status: v }))}>
                {['Received','In-Progress','Ready','Cancelled'].map(s => <Option key={s} value={s}>{s}</Option>)}
              </Select>

              <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                <Button icon={<PrinterOutlined />} onClick={() => printJobCard(detailJob)}>Print Job Card</Button>
                <Space>
                  <Button type="primary"
                    style={{ background: '#B8860B', borderColor: '#B8860B' }}
                    loading={updateMutation.isPending}
                    onClick={() => updateMutation.mutate({ id: detailJob.Repair_ID, data: { Status: detailJob.Status } })}>
                    Update Status
                  </Button>
                  {detailJob.Status === 'Ready' && (
                    <Button type="primary"
                      style={{ background: '#52c41a', borderColor: '#52c41a' }}
                      icon={<CheckCircleOutlined />}
                      loading={deliverMutation.isPending}
                      onClick={() => deliverMutation.mutate(detailJob.Repair_ID)}>
                      Mark Delivered
                    </Button>
                  )}
                </Space>
              </Space>
            </Space>
          </div>
        )}
      </Modal>

      <PageTour steps={tourSteps} />
    </div>
  );
}
