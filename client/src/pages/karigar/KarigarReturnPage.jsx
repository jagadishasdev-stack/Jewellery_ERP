import React, { useState, useRef } from 'react';
import {
  Form, InputNumber, Select, DatePicker, Button, Card, Row, Col,
  Typography, message, Table, Tag, Space, Alert,
} from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { karigarApi } from '../../api/modules';
import { useNavigate } from 'react-router-dom';
import { formatWeight } from '../../utils/calculations';
import PageTour from '../../components/PageTour';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { Option } = Select;

export default function KarigarReturnPage() {
  const [form] = Form.useForm();
  const [selectedIssue, setSelectedIssue] = useState(null);
  const navigate = useNavigate();
  const qc = useQueryClient();

  // ── Walkthrough tour refs ───────────────────────────────────────────────────
  const issuesTableRef = useRef(null);
  const tourSteps = [
    { title: '1. Pending Issues', description: 'Every gold issue still with a karigar shows here. Click Select on a row to record what came back for it.', target: () => issuesTableRef.current },
    { title: '2. Record the Return', description: 'After selecting an issue, a form appears below: enter the gross/net weight returned, stone weight, wastage, and whether it passed quality check — then click Record Return.' },
  ];

  const { data: issues } = useQuery({
    queryKey: ['karigar-issues', 'pending'],
    queryFn: () =>
      karigarApi.getIssues({ status: 'Issued' }).then((r) => r.data.data.items),
  });

  const returnMutation = useMutation({
    mutationFn: (data) => karigarApi.returnGoods(data),
    onSuccess: (res) => {
      message.success(`Return recorded! #${res.data.data.Return_Number}`);
      qc.invalidateQueries(['karigar-issues']);
      navigate('/karigar');
    },
    onError: (err) => message.error(err.response?.data?.message || 'Return failed.'),
  });

  const onSelectIssue = (issueId) => {
    const issue = (issues || []).find((i) => i.Issue_ID === issueId);
    setSelectedIssue(issue);
    form.setFieldsValue({ Issue_ID: issueId });
  };

  const onFinish = (values) => {
    returnMutation.mutate({
      ...values,
      Return_Date: values.Return_Date.format('YYYY-MM-DD'),
    });
  };

  const issueColumns = [
    { title: 'Issue #', dataIndex: 'Issue_Number', width: 160 },
    { title: 'Karigar', dataIndex: 'Karigar_Name' },
    { title: 'Issued (g)', dataIndex: 'Gold_Weight_Issued', render: (v) => formatWeight(v) },
    {
      title: 'Status',
      dataIndex: 'Status',
      render: (v) => (
        <Tag color={v === 'Issued' ? 'orange' : v === 'Partial' ? 'blue' : 'green'}>{v}</Tag>
      ),
    },
    {
      title: 'Action',
      render: (_, r) => (
        <Button size="small" type="primary"
          style={{ background: '#B8860B', borderColor: '#B8860B' }}
          onClick={() => onSelectIssue(r.Issue_ID)}>
          Select
        </Button>
      ),
    },
  ];

  return (
    <div className="page-wrapper">
      <div className="page-header">
        <Title level={4} style={{ margin: 0 }}>Return from Karigar</Title>
        <Button onClick={() => navigate('/karigar')}>Back</Button>
      </div>

      <Row gutter={[16, 16]}>
        {/* Pending Issues */}
        <Col xs={24} lg={14}>
          <div ref={issuesTableRef}>
          <Card title="Pending Issues" style={{ borderRadius: 8, marginBottom: 16 }}>
            <Table
            scroll={{ x: "max-content" }}
              columns={issueColumns}
              dataSource={issues || []}
              rowKey="Issue_ID"
              size="small"
              pagination={false}
              rowClassName={(r) => r.Issue_ID === selectedIssue?.Issue_ID ? 'ant-table-row-selected' : ''}
            />
          </Card>
          </div>

          {selectedIssue && (
            <Card
              title={`Return Entry — Issue #${selectedIssue.Issue_Number}`}
              style={{ borderRadius: 8 }}
            >
              <Alert
                message={`Issued: ${formatWeight(selectedIssue.Gold_Weight_Issued)} to ${selectedIssue.Karigar_Name} | Allowed wastage: ${selectedIssue.Wastage_Allowed_Percent}%`}
                type="info"
                showIcon
                style={{ marginBottom: 16 }}
              />
              <Form form={form} layout="vertical" onFinish={onFinish}>
                <Form.Item name="Issue_ID" hidden><InputNumber /></Form.Item>

                <Row gutter={16}>
                  <Col xs={12}>
                    <Form.Item name="Gross_Weight_Returned" label="Gross Weight Returned (g)" rules={[{ required: true }]}>
                      <InputNumber style={{ width: '100%' }} step={0.001} min={0.001} size="large" />
                    </Form.Item>
                  </Col>
                  <Col xs={12}>
                    <Form.Item name="Net_Gold_Weight" label="Net Gold Weight (g)" rules={[{ required: true }]}>
                      <InputNumber style={{ width: '100%' }} step={0.001} min={0.001} size="large" />
                    </Form.Item>
                  </Col>
                </Row>

                <Row gutter={16}>
                  <Col xs={12}>
                    <Form.Item name="Stone_Weight" label="Stone Weight (g)" initialValue={0}>
                      <InputNumber style={{ width: '100%' }} step={0.001} min={0} />
                    </Form.Item>
                  </Col>
                  <Col xs={12}>
                    <Form.Item name="Wastage_Weight" label="Wastage Weight (g)" initialValue={0}>
                      <InputNumber style={{ width: '100%' }} step={0.001} min={0} />
                    </Form.Item>
                  </Col>
                </Row>

                <Row gutter={16}>
                  <Col xs={12}>
                    <Form.Item name="Return_Date" label="Return Date" initialValue={dayjs()} rules={[{ required: true }]}>
                      <DatePicker style={{ width: '100%' }} size="large" />
                    </Form.Item>
                  </Col>
                  <Col xs={12}>
                    <Form.Item name="Quality_Check_Passed" label="Quality Check" initialValue={true}>
                      <Select size="large">
                        <Option value={true}>✅ Passed</Option>
                        <Option value={false}>❌ Failed</Option>
                      </Select>
                    </Form.Item>
                  </Col>
                </Row>

                <Form.Item name="Quality_Remarks" label="Quality Remarks">
                  <input className="ant-input" placeholder="Any remarks about quality..." />
                </Form.Item>

                <Button
                  type="primary" htmlType="submit" size="large" block
                  loading={returnMutation.isPending}
                  style={{ background: '#B8860B', borderColor: '#B8860B', fontWeight: 700 }}
                >
                  Record Return
                </Button>
              </Form>
            </Card>
          )}
        </Col>

        {/* Summary */}
        {selectedIssue && (
          <Col xs={24} lg={10}>
            <Card title="Issue Summary" style={{ borderRadius: 8 }}>
              <Space direction="vertical" style={{ width: '100%' }} size={8}>
                {[
                  { label: 'Issue Number', value: selectedIssue.Issue_Number },
                  { label: 'Karigar', value: selectedIssue.Karigar_Name },
                  { label: 'Gold Issued', value: formatWeight(selectedIssue.Gold_Weight_Issued) },
                  { label: 'Gold Rate at Issue', value: `₹${selectedIssue.Gold_Rate_At_Issue}/g` },
                  { label: 'Total Value', value: `₹${parseFloat(selectedIssue.Total_Value_Issued || 0).toLocaleString('en-IN')}` },
                  { label: 'Wastage Allowed', value: `${selectedIssue.Wastage_Allowed_Percent}%` },
                  { label: 'Wages Rate', value: `₹${selectedIssue.Karigar_Wages_Rate}/g` },
                ].map((r) => (
                  <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Text type="secondary">{r.label}</Text>
                    <Text strong>{r.value}</Text>
                  </div>
                ))}
              </Space>
            </Card>
          </Col>
        )}
      </Row>

      <PageTour steps={tourSteps} />
    </div>
  );
}
