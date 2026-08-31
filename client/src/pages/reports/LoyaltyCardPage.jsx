/**
 * Loyalty Card — Members + Day Sheet. Master/Reports/Utility audit gap:
 * only the points-earning/redemption engine existed before (loyalty
 * slabs, tbl_loyalty_transactions, Loyalty_Points on the customer row) —
 * no card identifier, no member registry, no day sheet. A card number is
 * an identifier tied to that EXISTING points system, not a new tier or
 * benefit engine — no discount tiers invented here, there's no basis for
 * one anywhere in this app today.
 */
import React, { useState } from 'react';
import { Typography, Card, Table, Tabs, Button, Space, Tag, Modal, Form, Select, Input, DatePicker, message, Statistic, Row, Col } from 'antd';
import { IdcardOutlined, PlusOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { complianceApi, customersApi } from '../../api/modules';
import { formatCurrency } from '../../utils/calculations';
import PageTour from '../../components/PageTour';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { Option } = Select;

export default function LoyaltyCardPage() {
  const [activeTab, setActiveTab] = useState('members');
  const [issueOpen, setIssueOpen] = useState(false);
  const [dsDate, setDsDate] = useState(dayjs());
  const [form] = Form.useForm();
  const qc = useQueryClient();

  const { data: members, isLoading: membersLoading } = useQuery({
    queryKey: ['loyalty-card-members'],
    queryFn: () => complianceApi.getLoyaltyCardMembers().then((r) => r.data.data || []),
    enabled: activeTab === 'members',
  });

  const { data: allCustomers } = useQuery({
    queryKey: ['all-customers-loyalty'],
    queryFn: () => customersApi.getAll({ limit: 500 }).then((r) => r.data.data?.items || []),
    enabled: issueOpen,
  });

  const { data: daySheet, isLoading: dsLoading } = useQuery({
    queryKey: ['loyalty-day-sheet', dsDate.format('YYYY-MM-DD')],
    queryFn: () => complianceApi.getLoyaltyDaySheet(dsDate.format('YYYY-MM-DD')).then((r) => r.data.data),
    enabled: activeTab === 'day-sheet',
  });

  const issueMutation = useMutation({
    mutationFn: (data) => complianceApi.issueLoyaltyCard(data),
    onSuccess: (res) => {
      message.success(res.data.message);
      qc.invalidateQueries(['loyalty-card-members']);
      setIssueOpen(false); form.resetFields();
    },
    onError: (err) => message.error(err.response?.data?.message || 'Failed to issue loyalty card.'),
  });

  const memberCols = [
    { title: 'Customer', dataIndex: 'Customer_Name', render: (v) => <Text strong>{v}</Text> },
    { title: 'Mobile', dataIndex: 'Mobile_1' },
    { title: 'Card Number', dataIndex: 'Loyalty_Card_Number', render: (v) => <Tag color="gold">{v}</Tag> },
    { title: 'Issued', dataIndex: 'Loyalty_Card_Issue_Date', render: (v) => v ? dayjs(v).format('DD-MMM-YYYY') : '-' },
    { title: 'Loyalty Points', dataIndex: 'Loyalty_Points', render: (v) => <Text strong style={{ color: '#B8860B' }}>{parseFloat(v || 0)}</Text> },
  ];

  const dsCols = [
    { title: 'Time', dataIndex: 'Created_Date', render: (v) => dayjs(v).format('hh:mm A') },
    { title: 'Customer', dataIndex: 'Customer_Name', render: (v) => v || '-' },
    { title: 'Card Number', dataIndex: 'Loyalty_Card_Number', render: (v) => v ? <Tag color="gold">{v}</Tag> : '-' },
    { title: 'Type', dataIndex: 'Txn_Type', render: (v) => <Tag color={v === 'Earned' ? 'green' : v === 'Redeemed' ? 'blue' : v === 'Expired' ? 'red' : 'default'}>{v}</Tag> },
    { title: 'Points', dataIndex: 'Points' },
    { title: 'Description', dataIndex: 'Description', render: (v) => v || '-' },
  ];

  const tabItems = [
    {
      key: 'members', label: <span>💳 Members</span>,
      children: (
        <Card title="Loyalty Card Members" bodyStyle={{ padding: 0 }} style={{ borderRadius: 8 }}
          extra={<Button size="small" type="primary" icon={<PlusOutlined />} style={{ background: '#B8860B', borderColor: '#B8860B' }} onClick={() => setIssueOpen(true)}>Issue Card</Button>}>
          <Table
            scroll={{ x: 'max-content' }} size="small" loading={membersLoading} rowKey="Customer_ID" pagination={{ pageSize: 20 }}
            dataSource={members || []} columns={memberCols}
            locale={{ emptyText: 'No loyalty cards issued yet.' }}
          />
        </Card>
      ),
    },
    {
      key: 'day-sheet', label: <span>📅 Day Sheet</span>,
      children: (
        <>
          <Card size="small" style={{ borderRadius: 8, marginBottom: 14 }}>
            <DatePicker value={dsDate} onChange={(d) => d && setDsDate(d)} format="DD-MMM-YYYY" />
          </Card>
          <Row gutter={[10, 10]} style={{ marginBottom: 14 }}>
            <Col xs={12} md={6}>
              <Card bodyStyle={{ padding: '10px 12px' }} style={{ borderRadius: 8, border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,.07)', borderTop: '3px solid #52c41a' }}>
                <Statistic title={<Text style={{ fontSize: 11, color: '#888' }}>Points Earned</Text>} value={daySheet?.totalEarned || 0} valueStyle={{ color: '#52c41a', fontSize: 16, fontWeight: 700 }} />
              </Card>
            </Col>
            <Col xs={12} md={6}>
              <Card bodyStyle={{ padding: '10px 12px' }} style={{ borderRadius: 8, border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,.07)', borderTop: '3px solid #1890ff' }}>
                <Statistic title={<Text style={{ fontSize: 11, color: '#888' }}>Points Redeemed</Text>} value={daySheet?.totalRedeemed || 0} valueStyle={{ color: '#1890ff', fontSize: 16, fontWeight: 700 }} />
              </Card>
            </Col>
          </Row>
          <Card title={`Loyalty Transactions — ${dsDate.format('DD-MMM-YYYY')}`} bodyStyle={{ padding: 0 }} style={{ borderRadius: 8 }}>
            <Table
              scroll={{ x: 'max-content' }} size="small" loading={dsLoading} rowKey="Loyalty_ID" pagination={{ pageSize: 20 }}
              dataSource={daySheet?.transactions || []} columns={dsCols}
              locale={{ emptyText: 'No loyalty activity on this date.' }}
            />
          </Card>
        </>
      ),
    },
  ];

  return (
    <div className="page-wrapper">
      <div className="page-header">
        <Title level={4} style={{ margin: 0 }}><IdcardOutlined style={{ color: '#B8860B', marginRight: 8 }} />Loyalty Card</Title>
        <Text type="secondary" style={{ fontSize: 12 }}>Card identifier on top of the existing points system — Members and daily activity</Text>
      </div>
      <Tabs activeKey={activeTab} onChange={setActiveTab} type="card" items={tabItems} />

      <Modal title="Issue Loyalty Card" open={issueOpen} onCancel={() => { setIssueOpen(false); form.resetFields(); }} footer={null} destroyOnClose>
        <Form form={form} layout="vertical" onFinish={(v) => issueMutation.mutate(v)}>
          <Form.Item name="Customer_ID" label="Customer" rules={[{ required: true }]}>
            <Select showSearch optionFilterProp="children" placeholder="Search customer by name">
              {(allCustomers || []).map((c) => <Option key={c.Customer_ID} value={c.Customer_ID}>{c.Customer_Name} — {c.Mobile_1}</Option>)}
            </Select>
          </Form.Item>
          <Form.Item name="Card_Number" label="Card Number" rules={[{ required: true }]}>
            <Input placeholder="e.g. LC-00123" />
          </Form.Item>
          <Button type="primary" htmlType="submit" block loading={issueMutation.isPending} style={{ background: '#B8860B', borderColor: '#B8860B' }}>
            Issue Card
          </Button>
        </Form>
      </Modal>

      <PageTour steps={[
        { title: 'Loyalty Card', description: 'Members lists every customer with a card issued. Day Sheet shows all loyalty point activity (earned/redeemed) for one day across every customer — the per-customer equivalent already lives under that customer\'s own ledger.' },
      ]} />
    </div>
  );
}
