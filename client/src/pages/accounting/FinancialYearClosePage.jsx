/**
 * Financial Year Close — flagged directly in the Balance Sheet's own
 * (now-updated) code comment: real retained-earnings closing didn't
 * exist anywhere. This is that missing screen: close a completed
 * financial year (real closing-entry mechanics — every Income/Expense
 * account zeroed, net profit/loss rolled permanently into Retained
 * Earnings Account) and see the history of past closes.
 */
import React, { useState, useRef } from 'react';
import {
  Card, Typography, Table, Button, Space, Tag, Modal, Form, DatePicker,
  Alert, message, Statistic, Row, Col, Empty,
} from 'antd';
import { LockOutlined, HistoryOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { accountingApi } from '../../api/modules';
import { formatCurrency } from '../../utils/calculations';
import PageTour from '../../components/PageTour';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

export default function FinancialYearClosePage() {
  const [closeModalOpen, setCloseModalOpen] = useState(false);
  const [form] = Form.useForm();
  const qc = useQueryClient();

  const tableRef = useRef(null);
  const tourSteps = [
    { title: '1. Past Closes', description: 'Every financial year you\'ve closed so far, with its net profit/loss and the journal reference that rolled it into Retained Earnings.', target: () => tableRef.current },
    { title: '2. Close a Year', description: 'Only a completed (already-ended) financial year can be closed, and it must pick up right where the last close left off — no gaps, no overlaps.' },
  ];

  const { data: closes, isLoading } = useQuery({
    queryKey: ['fy-closes'],
    queryFn: () => accountingApi.getFinancialYearCloses().then((r) => r.data.data || []),
  });

  const closeMutation = useMutation({
    mutationFn: (data) => accountingApi.closeFinancialYear(data),
    onSuccess: (res) => {
      message.success(res.data.message);
      qc.invalidateQueries({ queryKey: ['fy-closes'] });
      qc.invalidateQueries({ queryKey: ['trial-balance'] });
      setCloseModalOpen(false);
      form.resetFields();
    },
    onError: (err) => message.error(err.response?.data?.message || 'Failed to close financial year.'),
  });

  const lastClose = (closes || [])[0];
  const suggestedStart = lastClose ? dayjs(lastClose.FY_End).add(1, 'day') : null;

  const openModal = () => {
    form.resetFields();
    if (suggestedStart) form.setFieldsValue({ range: [suggestedStart, suggestedStart.add(1, 'year').subtract(1, 'day')] });
    setCloseModalOpen(true);
  };

  const columns = [
    { title: 'Period', render: (_, r) => `${dayjs(r.FY_Start).format('DD-MMM-YYYY')} — ${dayjs(r.FY_End).format('DD-MMM-YYYY')}` },
    { title: 'Total Income', dataIndex: 'Total_Income', render: (v) => formatCurrency(v) },
    { title: 'Total Expense', dataIndex: 'Total_Expense', render: (v) => formatCurrency(v) },
    { title: 'Net Profit/Loss', dataIndex: 'Net_Profit', render: (v) => <Text strong style={{ color: parseFloat(v) >= 0 ? '#52c41a' : '#ff4d4f' }}>{formatCurrency(v)}</Text> },
    { title: 'Journal Ref', dataIndex: 'Journal_Reference', render: (v) => <Text code style={{ fontSize: 11 }}>{v}</Text> },
    { title: 'Closed By', dataIndex: 'Closed_By' },
    { title: 'Closed On', dataIndex: 'Closed_Date', render: (v) => dayjs(v).format('DD-MMM-YYYY HH:mm') },
  ];

  return (
    <div className="page-wrapper">
      <div className="page-header">
        <Title level={4} style={{ margin: 0 }}><Space><LockOutlined style={{ color: '#B8860B' }} />Financial Year Close</Space></Title>
        <Button type="primary" icon={<LockOutlined />} style={{ background: '#B8860B', borderColor: '#B8860B' }} onClick={openModal}>
          Close a Financial Year
        </Button>
      </div>

      <Alert
        type="warning" showIcon style={{ marginBottom: 16, borderRadius: 8 }}
        message="This is irreversible"
        description="Closing zeroes every Income/Expense account's balance for the period and rolls the net profit/loss permanently into Retained Earnings Account via a real posted journal. It does not yet block a later backdated entry into an already-closed period — that's a separate safeguard, not built yet."
      />

      {lastClose && (
        <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
          <Col xs={24} md={8}>
            <Card style={{ borderRadius: 8, border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.07)' }}>
              <Statistic title="Last Closed Through" value={dayjs(lastClose.FY_End).format('DD-MMM-YYYY')} valueStyle={{ fontSize: 16 }} />
            </Card>
          </Col>
        </Row>
      )}

      <div ref={tableRef}>
        <Card title={<span><HistoryOutlined /> Close History</span>} style={{ borderRadius: 8, border: 'none' }} bodyStyle={{ padding: 0 }}>
          <Table
            scroll={{ x: 'max-content' }} size="small" columns={columns} dataSource={closes || []}
            rowKey="Close_ID" loading={isLoading} pagination={{ pageSize: 10 }}
            locale={{ emptyText: <Empty description="No financial year has been closed yet." /> }}
          />
        </Card>
      </div>

      <Modal title="Close a Financial Year" open={closeModalOpen} onCancel={() => setCloseModalOpen(false)} footer={null} destroyOnClose>
        <Form form={form} layout="vertical" onFinish={(v) => closeMutation.mutate({ FY_Start: v.range[0].format('YYYY-MM-DD'), FY_End: v.range[1].format('YYYY-MM-DD') })}>
          {lastClose && (
            <Alert type="info" showIcon style={{ marginBottom: 12, fontSize: 12 }}
              message={`Must start the day after the last close (${dayjs(lastClose.FY_End).format('DD-MMM-YYYY')}) — no gaps or overlaps.`} />
          )}
          <Form.Item name="range" label="Period to Close" rules={[{ required: true, message: 'Pick the start and end date.' }]}>
            <RangePicker style={{ width: '100%' }} format="DD-MMM-YYYY" disabledDate={(d) => d && d > dayjs().endOf('day')} />
          </Form.Item>
          <Button type="primary" danger htmlType="submit" block loading={closeMutation.isPending}>
            Close This Financial Year
          </Button>
        </Form>
      </Modal>

      <PageTour steps={tourSteps} />
    </div>
  );
}
