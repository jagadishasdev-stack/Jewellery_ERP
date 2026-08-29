import React, { useState, useRef } from 'react';
import {
  Typography, Tabs, Tag, Button, Space, message, Table, Select, DatePicker,
  Form, InputNumber, Card, Statistic, Row, Col,
} from 'antd';
import { TeamOutlined, PlusOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { hrApi } from '../../api/modules';
import { formatCurrency } from '../../utils/calculations';
import GenericCrudTab from '../../components/GenericCrudTab';
import PageTour from '../../components/PageTour';
import dayjs from 'dayjs';

const { Title } = Typography;
const { Option } = Select;

function useStaff() {
  return useQuery({ queryKey: ['hr-staff'], queryFn: () => hrApi.getStaff().then((r) => r.data.data) });
}

function AttendanceTab() {
  const { data: staff } = useStaff();
  const [date, setDate] = useState(dayjs());
  const qc = useQueryClient();
  const { data: attendance, isLoading } = useQuery({
    queryKey: ['attendance', date.format('YYYY-MM-DD')],
    queryFn: () => hrApi.getAttendance({ date: date.format('YYYY-MM-DD') }).then((r) => r.data.data),
  });

  const mark = useMutation({
    mutationFn: (rec) => hrApi.saveAttendance([rec]),
    onSuccess: () => { message.success('Attendance saved.'); qc.invalidateQueries({ queryKey: ['attendance'] }); },
    onError: (e) => message.error(e.response?.data?.message || 'Failed.'),
  });

  const rows = (staff || []).map((s) => {
    const existing = (attendance || []).find((a) => a.User_ID === s.User_ID);
    return { ...s, attendance: existing };
  });

  return (
    <div>
      <Space style={{ marginBottom: 12 }}>
        <DatePicker value={date} onChange={(d) => setDate(d || dayjs())} />
      </Space>
      <Table
        size="small" loading={isLoading} dataSource={rows} rowKey="User_ID" pagination={{ pageSize: 15 }}
        columns={[
          { title: 'Staff', dataIndex: 'Full_Name' },
          { title: 'Department', dataIndex: 'Department' },
          {
            title: 'Status', render: (_, r) => (
              <Select
                style={{ width: 140 }}
                value={r.attendance?.Status || undefined}
                placeholder="Mark status"
                onChange={(v) => mark.mutate({ User_ID: r.User_ID, Attendance_Date: date.format('YYYY-MM-DD'), Status: v })}
              >
                {['Present', 'Absent', 'Half Day', 'Leave', 'Holiday'].map((s) => <Option key={s} value={s}>{s}</Option>)}
              </Select>
            ),
          },
        ]}
      />
    </div>
  );
}

function SalaryStructureTab() {
  const { data: staff } = useStaff();
  const [userId, setUserId] = useState(null);
  const qc = useQueryClient();
  const { data: structure } = useQuery({
    queryKey: ['salary-structure', userId], enabled: !!userId,
    queryFn: () => hrApi.getSalaryStructure(userId).then((r) => r.data.data),
  });
  const save = useMutation({
    mutationFn: (data) => hrApi.saveSalaryStructure({ ...data, User_ID: userId }),
    onSuccess: () => { message.success('Salary structure saved.'); qc.invalidateQueries({ queryKey: ['salary-structure', userId] }); },
    onError: (e) => message.error(e.response?.data?.message || 'Failed.'),
  });

  return (
    <div>
      <Select style={{ width: 260, marginBottom: 16 }} placeholder="Select staff member" onChange={setUserId} showSearch optionFilterProp="children">
        {(staff || []).map((s) => <Option key={s.User_ID} value={s.User_ID}>{s.Full_Name}{s.Designation ? ` — ${s.Designation}` : ''}</Option>)}
      </Select>
      {userId && (
        <Card style={{ maxWidth: 500 }}>
          <Form layout="vertical" initialValues={structure} onFinish={(v) => save.mutate(v)} key={userId + (structure?.Structure_ID || '')}>
            <Row gutter={12}>
              <Col span={12}><Form.Item name="Basic" label="Basic (₹/mo)" rules={[{ required: true }]}><InputNumber style={{ width: '100%' }} min={0} /></Form.Item></Col>
              <Col span={12}><Form.Item name="HRA" label="HRA (₹/mo)"><InputNumber style={{ width: '100%' }} min={0} /></Form.Item></Col>
              <Col span={12}><Form.Item name="Conveyance" label="Conveyance (₹/mo)"><InputNumber style={{ width: '100%' }} min={0} /></Form.Item></Col>
              <Col span={12}><Form.Item name="Other_Allowance" label="Other Allowance (₹/mo)"><InputNumber style={{ width: '100%' }} min={0} /></Form.Item></Col>
              <Col span={12}><Form.Item name="PF_Pct" label="PF %"><InputNumber style={{ width: '100%' }} min={0} step={0.1} /></Form.Item></Col>
              <Col span={12}><Form.Item name="ESI_Pct" label="ESI %"><InputNumber style={{ width: '100%' }} min={0} step={0.1} /></Form.Item></Col>
              <Col span={24}><Form.Item name="Effective_From" label="Effective From" initialValue={dayjs()} rules={[{ required: true }]}><DatePicker style={{ width: '100%' }} /></Form.Item></Col>
            </Row>
            <Button type="primary" htmlType="submit" block loading={save.isPending} style={{ background: '#B8860B', borderColor: '#B8860B' }}>Save</Button>
          </Form>
        </Card>
      )}
    </div>
  );
}

function IncentiveSlabsTab() {
  return (
    <GenericCrudTab
      queryKey={['incentive-slabs']} listFn={hrApi.getIncentiveSlabs} createFn={hrApi.createIncentiveSlab}
      title="New Incentive Slab" rowKey="Slab_ID"
      fields={[
        { name: 'Slab_Name', label: 'Slab Name', required: true },
        { name: 'Amount_From', label: 'Sale Amount From (₹)', type: 'number', required: true },
        { name: 'Amount_To', label: 'Sale Amount To (₹, blank = no limit)', type: 'number' },
        { name: 'Incentive_Pct', label: 'Incentive %', type: 'number', step: 0.1, required: true },
      ]}
      columns={[
        { title: 'Slab', dataIndex: 'Slab_Name' },
        { title: 'From', dataIndex: 'Amount_From', render: (v) => formatCurrency(v) },
        { title: 'To', dataIndex: 'Amount_To', render: (v) => v ? formatCurrency(v) : 'No limit' },
        { title: 'Incentive %', dataIndex: 'Incentive_Pct' },
      ]}
    />
  );
}

// Holiday List — the backend (tbl_holiday_master, hr.js GET/POST /holidays)
// was fully built earlier but nothing in the client ever called it; the
// only trace of "Holiday" anywhere was as one dropdown value in the
// Attendance tab's status picker. This is the actual holiday-calendar
// management screen — genuinely missing before, per the Transaction Menu
// spec's Master list.
function HolidayListTab() {
  return (
    <GenericCrudTab
      queryKey={['holidays']} listFn={hrApi.getHolidays} createFn={hrApi.createHoliday}
      title="New Holiday" rowKey="Holiday_ID"
      fields={[
        { name: 'Holiday_Date', label: 'Date', type: 'date', required: true },
        { name: 'Holiday_Name', label: 'Holiday Name', required: true },
      ]}
      columns={[
        { title: 'Date', dataIndex: 'Holiday_Date', render: (v) => dayjs(v).format('DD-MMM-YYYY (dddd)') },
        { title: 'Holiday', dataIndex: 'Holiday_Name' },
      ]}
    />
  );
}

function PayrollTab() {
  const qc = useQueryClient();
  const [openRun, setOpenRun] = useState(null);
  const { data: runs, isLoading } = useQuery({ queryKey: ['payroll-runs'], queryFn: () => hrApi.getPayrollRuns().then((r) => r.data.data) });
  const { data: runDetail } = useQuery({
    queryKey: ['payroll-run', openRun], enabled: !!openRun,
    queryFn: () => hrApi.getPayrollRun(openRun).then((r) => r.data.data),
  });
  const [form] = Form.useForm();
  const generate = useMutation({
    mutationFn: (v) => hrApi.generatePayroll(v),
    onSuccess: (res) => { message.success(res.data.message); qc.invalidateQueries({ queryKey: ['payroll-runs'] }); setOpenRun(res.data.data.Run_ID); },
    onError: (e) => message.error(e.response?.data?.message || 'Failed.'),
  });
  const finalize = useMutation({
    mutationFn: (id) => hrApi.finalizePayroll(id),
    onSuccess: () => { message.success('Payroll finalized.'); qc.invalidateQueries({ queryKey: ['payroll-runs'] }); qc.invalidateQueries({ queryKey: ['payroll-run', openRun] }); },
  });

  return (
    <div>
      <Card style={{ marginBottom: 16, maxWidth: 500 }}>
        <Form form={form} layout="inline" onFinish={(v) => generate.mutate(v)}>
          <Form.Item name="Pay_Month" rules={[{ required: true }]} initialValue={dayjs().month() + 1}>
            <Select style={{ width: 120 }} placeholder="Month">
              {dayjs.months().map((m, i) => <Option key={i + 1} value={i + 1}>{m}</Option>)}
            </Select>
          </Form.Item>
          <Form.Item name="Pay_Year" rules={[{ required: true }]} initialValue={dayjs().year()}>
            <InputNumber style={{ width: 100 }} />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" icon={<PlusOutlined />} loading={generate.isPending} style={{ background: '#B8860B', borderColor: '#B8860B' }}>
              Generate Payroll
            </Button>
          </Form.Item>
        </Form>
      </Card>

      <Table
        size="small" loading={isLoading} dataSource={runs || []} rowKey="Run_ID" pagination={{ pageSize: 10 }}
        columns={[
          { title: 'Month/Year', render: (_, r) => `${dayjs.months()[r.Pay_Month - 1]} ${r.Pay_Year}` },
          { title: 'Status', dataIndex: 'Status', render: (v) => <Tag color={v === 'Finalized' ? 'green' : v === 'Paid' ? 'blue' : 'orange'}>{v}</Tag> },
          { title: 'Generated', dataIndex: 'Generated_Date', render: (v) => dayjs(v).format('DD-MMM-YYYY HH:mm') },
          { title: 'Actions', render: (_, r) => <Button size="small" onClick={() => setOpenRun(r.Run_ID)}>View</Button> },
        ]}
      />

      {openRun && runDetail && (
        <Card title={`Payroll: ${dayjs.months()[runDetail.Pay_Month - 1]} ${runDetail.Pay_Year}`} style={{ marginTop: 16 }}
          extra={runDetail.Status === 'Draft' && <Button onClick={() => finalize.mutate(openRun)} loading={finalize.isPending}>Finalize</Button>}>
          <Row gutter={16} style={{ marginBottom: 16 }}>
            <Col span={8}><Statistic title="Staff Paid" value={runDetail.details?.length || 0} /></Col>
            <Col span={8}><Statistic title="Total Net Salary" value={formatCurrency(runDetail.details?.reduce((s, d) => s + parseFloat(d.Net_Salary), 0) || 0)} /></Col>
            <Col span={8}><Statistic title="Total Incentives" value={formatCurrency(runDetail.details?.reduce((s, d) => s + parseFloat(d.Incentive_Amount || 0), 0) || 0)} /></Col>
          </Row>
          <Table
            size="small" dataSource={runDetail.details || []} rowKey="Detail_ID" pagination={false}
            columns={[
              { title: 'Staff', dataIndex: 'Full_Name' },
              { title: 'Present', dataIndex: 'Days_Present' },
              { title: 'Absent', dataIndex: 'Days_Absent' },
              { title: 'Gross', dataIndex: 'Gross_Salary', render: (v) => formatCurrency(v) },
              { title: 'PF', dataIndex: 'PF_Deduction', render: (v) => formatCurrency(v) },
              { title: 'ESI', dataIndex: 'ESI_Deduction', render: (v) => formatCurrency(v) },
              { title: 'Incentive', dataIndex: 'Incentive_Amount', render: (v) => formatCurrency(v) },
              { title: 'Net Salary', dataIndex: 'Net_Salary', render: (v) => <b>{formatCurrency(v)}</b> },
            ]}
          />
        </Card>
      )}
    </div>
  );
}

export default function HrPayrollPage() {
  const tabsRef = useRef(null);
  const tourSteps = [
    { title: '1. Mark Daily Attendance', description: 'Pick a date and set each staff member\'s status (Present/Absent/Half Day/Leave/Holiday) — payroll is computed straight from this.', target: () => tabsRef.current },
    { title: '2. Set Salary Structure', description: 'Select a staff member and enter their Basic/HRA/Conveyance/PF%/ESI% — this defines what they\'re paid per day present.' },
    { title: '3. Incentive Slabs', description: 'Define sale-amount ranges and the incentive % each earns — used automatically when incentives are calculated against a sale.' },
    { title: '4. Generate Payroll', description: 'Pick a month/year and click "Generate Payroll" — it pro-rates each staff member\'s salary by days present, deducts PF/ESI, adds any pending sales incentives, and shows the full breakdown. Finalize once you\'re happy with it.' },
  ];
  return (
    <div className="page-wrapper">
      <div className="page-header">
        <Title level={4} style={{ margin: 0 }}><Space><TeamOutlined style={{ color: '#B8860B' }} />HR, Attendance & Payroll</Space></Title>
      </div>
      <div ref={tabsRef}>
      <Tabs items={[
        { key: 'attendance', label: 'Attendance', children: <AttendanceTab /> },
        { key: 'salary', label: 'Salary Structure', children: <SalaryStructureTab /> },
        { key: 'incentive-slabs', label: 'Incentive Slabs', children: <IncentiveSlabsTab /> },
        { key: 'holidays', label: 'Holiday List', children: <HolidayListTab /> },
        { key: 'payroll', label: 'Payroll', children: <PayrollTab /> },
      ]} />
      </div>
      <PageTour steps={tourSteps} />
    </div>
  );
}
