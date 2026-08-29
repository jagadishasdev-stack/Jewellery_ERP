/**
 * Jobcard Prediction — manufacturing planning (customer, design, metal,
 * expected weight/completion, karigar, material requirement, estimated
 * wastage/making) that never touches real stock/production until an
 * actual transaction happens elsewhere. Genuinely absent before this —
 * the only prior "Jobcard" concept was Repair's own service job cards.
 */
import React, { useState } from 'react';
import { Table, Card, Button, Modal, Form, Input, InputNumber, Select, DatePicker, Space, Tag, Typography, message } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { jobcardPredictionApi, customersApi, masterApi, karigarApi } from '../../api/modules';
import { useMetalTypes } from '../../hooks/useMetalTypes';
import { formatWeight, formatCurrency } from '../../utils/calculations';
import dayjs from 'dayjs';

const { Text } = Typography;

const STATUS_COLOR = { Draft: 'default', Confirmed: 'blue', Converted: 'green', Cancelled: 'red' };
const NEXT_STATUS = { Draft: 'Confirmed', Confirmed: 'Converted' };

export default function JobcardPredictionPage() {
  const qc = useQueryClient();
  const { metalTypes } = useMetalTypes();
  const [createOpen, setCreateOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState(undefined);
  const [form] = Form.useForm();

  const { data: rows, isLoading } = useQuery({
    queryKey: ['jobcard-prediction', statusFilter],
    queryFn: () => jobcardPredictionApi.list({ status: statusFilter }).then((r) => r.data.data || []),
  });

  const { data: customers } = useQuery({ queryKey: ['customers-for-jobcard'], queryFn: () => customersApi.getAll({ limit: 500 }).then((r) => r.data.data?.items || []) });
  const { data: designs } = useQuery({ queryKey: ['designs-for-jobcard'], queryFn: () => masterApi.getDesigns().then((r) => r.data.data || []) });
  const { data: karigars } = useQuery({ queryKey: ['karigars-for-jobcard'], queryFn: () => karigarApi.getVendors({ type: 'Karigar' }).then((r) => r.data.data || []) });

  const createMutation = useMutation({
    mutationFn: (data) => jobcardPredictionApi.create({
      ...data,
      Expected_Completion_Date: data.Expected_Completion_Date ? data.Expected_Completion_Date.format('YYYY-MM-DD') : null,
    }),
    onSuccess: (res) => {
      message.success(`${res.data.data.Jobcard_Number} created.`);
      qc.invalidateQueries({ queryKey: ['jobcard-prediction'] });
      setCreateOpen(false);
      form.resetFields();
    },
    onError: (err) => message.error(err.response?.data?.message || 'Failed to create jobcard prediction.'),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }) => jobcardPredictionApi.setStatus(id, status),
    onSuccess: () => { message.success('Status updated.'); qc.invalidateQueries({ queryKey: ['jobcard-prediction'] }); },
    onError: (err) => message.error(err.response?.data?.message || 'Failed to update status.'),
  });

  const columns = [
    { title: 'Jobcard No.', dataIndex: 'Jobcard_Number', render: (v) => <Text code strong>{v}</Text> },
    { title: 'Customer', dataIndex: 'Customer_Name', render: (v) => v || <Text type="secondary">-</Text> },
    { title: 'Design', dataIndex: 'Design_Name', render: (v) => v || <Text type="secondary">-</Text> },
    { title: 'Metal', dataIndex: 'Metal_Type' },
    { title: 'Karigar', dataIndex: 'Karigar_Name', render: (v) => v || <Text type="secondary">Unassigned</Text> },
    { title: 'Expected Wt', dataIndex: 'Expected_Weight', render: (v) => v ? formatWeight(v) : '-' },
    { title: 'Expected By', dataIndex: 'Expected_Completion_Date', render: (v) => v ? dayjs(v).format('DD-MMM-YYYY') : '-' },
    { title: 'Est. Making', dataIndex: 'Estimated_Making_Charge', render: (v) => v ? formatCurrency(v) : '-' },
    { title: 'Status', dataIndex: 'Status', render: (v) => <Tag color={STATUS_COLOR[v]}>{v}</Tag> },
    {
      title: 'Actions',
      render: (_, r) => NEXT_STATUS[r.Status] && (
        <Button size="small" onClick={() => statusMutation.mutate({ id: r.Jobcard_ID, status: NEXT_STATUS[r.Status] })} loading={statusMutation.isPending}>
          Mark {NEXT_STATUS[r.Status]}
        </Button>
      ),
    },
  ];

  return (
    <div className="page-wrapper">
      <div className="page-header">
        <div>
          <div className="page-header-title">Jobcard Prediction</div>
          <div className="page-header-sub">Manufacturing planning — estimates only, no stock is touched until a real transaction happens</div>
        </div>
        <Button type="primary" icon={<PlusOutlined />} style={{ background: '#B8860B', borderColor: '#B8860B' }} onClick={() => setCreateOpen(true)}>
          New Jobcard
        </Button>
      </div>

      <Card className="erp-card" style={{ marginBottom: 12 }} bodyStyle={{ padding: '12px 16px' }}>
        <Select allowClear placeholder="All statuses" style={{ width: 180 }} value={statusFilter} onChange={setStatusFilter}
          options={['Draft', 'Confirmed', 'Converted', 'Cancelled'].map((s) => ({ value: s, label: s }))} />
      </Card>

      <Card className="erp-card" bodyStyle={{ padding: 0 }}>
        <div className="table-responsive">
          <Table className="erp-table" columns={columns} dataSource={rows || []} loading={isLoading} rowKey="Jobcard_ID"
            pagination={{ pageSize: 20 }} size="small" scroll={{ x: 1000 }} />
        </div>
      </Card>

      <Modal title="New Jobcard Prediction" open={createOpen} onCancel={() => setCreateOpen(false)} footer={null} width={560} destroyOnClose>
        <Form form={form} layout="vertical" onFinish={(v) => createMutation.mutate(v)}>
          <Space.Compact block style={{ marginBottom: 8 }}>
            <Form.Item name="Customer_ID" label="Customer (optional)" style={{ flex: 1, marginRight: 8 }}>
              <Select allowClear showSearch placeholder="Select customer"
                filterOption={(input, o) => (o?.label ?? '').toLowerCase().includes(input.toLowerCase())}
                options={(customers || []).map((c) => ({ value: c.Customer_ID, label: c.Customer_Name }))} />
            </Form.Item>
          </Space.Compact>
          <Space style={{ display: 'flex', gap: 8 }}>
            <Form.Item name="Design_ID" label="Design" style={{ flex: 1 }}>
              <Select allowClear showSearch placeholder="Select design"
                filterOption={(input, o) => (o?.label ?? '').toLowerCase().includes(input.toLowerCase())}
                options={(designs || []).map((d) => ({ value: d.Design_ID, label: d.Design_Name }))} />
            </Form.Item>
            <Form.Item name="Metal_Type" label="Metal Type" rules={[{ required: true }]} style={{ flex: 1 }}>
              <Select options={metalTypes.map((m) => ({ value: m, label: m }))} />
            </Form.Item>
          </Space>
          <Space style={{ display: 'flex', gap: 8 }}>
            <Form.Item name="Karigar_ID" label="Karigar" style={{ flex: 1 }}>
              <Select allowClear showSearch placeholder="Assign karigar"
                filterOption={(input, o) => (o?.label ?? '').toLowerCase().includes(input.toLowerCase())}
                options={(karigars || []).map((k) => ({ value: k.Vendor_ID, label: k.Vendor_Name }))} />
            </Form.Item>
            <Form.Item name="Expected_Completion_Date" label="Expected Completion" style={{ flex: 1 }}>
              <DatePicker style={{ width: '100%' }} format="DD-MMM-YYYY" />
            </Form.Item>
          </Space>
          <Space style={{ display: 'flex', gap: 8 }}>
            <Form.Item name="Expected_Weight" label="Expected Weight (g)" style={{ flex: 1 }}>
              <InputNumber style={{ width: '100%' }} min={0} step={0.01} />
            </Form.Item>
            <Form.Item name="Estimated_Wastage_Pct" label="Est. Wastage %" style={{ flex: 1 }}>
              <InputNumber style={{ width: '100%' }} min={0} max={100} step={0.1} />
            </Form.Item>
            <Form.Item name="Estimated_Making_Charge" label="Est. Making (₹)" style={{ flex: 1 }}>
              <InputNumber style={{ width: '100%' }} min={0} />
            </Form.Item>
          </Space>
          <Form.Item name="Material_Requirement" label="Material Requirement">
            <Input.TextArea rows={2} placeholder="e.g. 12.5g gold, 4 ruby stones" />
          </Form.Item>
          <Form.Item name="Notes" label="Notes">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Button type="primary" htmlType="submit" block loading={createMutation.isPending} style={{ background: '#B8860B', borderColor: '#B8860B' }}>
            Create Jobcard Prediction
          </Button>
        </Form>
      </Modal>
    </div>
  );
}
