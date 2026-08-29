/**
 * Company Settings — a single page consolidating what used to be scattered
 * (or, for GST/PAN/Address, existed as a real backend field with literally
 * no UI to edit it at all — PUT /api/tenant/settings has existed the whole
 * time; nothing in the client ever called it before this page and
 * CompliancePage.jsx's own narrow Loyalty_Point_Value field). TDS% is a
 * genuinely new field — stored as a setting only, no automatic
 * deduction/calculation logic anywhere yet (getting real tax math wrong
 * has real compliance consequences, so this is deliberately just a number
 * you can record for now). Tally sync, Printer role assignment, and
 * Financial Year close remain their own dedicated pages (linked below) —
 * each is a genuinely separate workflow, not just a settings field.
 */
import React, { useEffect, useState } from 'react';
import { Card, Form, Input, InputNumber, Button, Typography, Row, Col, message, Alert, Divider, Space } from 'antd';
import { SaveOutlined, SyncOutlined, PrinterOutlined, CalendarOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { tenantApi } from '../../api/modules';
import PageTour from '../../components/PageTour';

const { Title, Text } = Typography;

export default function CompanySettingsPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [form] = Form.useForm();

  const { data, isLoading } = useQuery({
    queryKey: ['tenant-settings'],
    queryFn: () => tenantApi.getSettings().then((r) => r.data.data),
  });

  useEffect(() => {
    if (data) form.setFieldsValue(data);
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: (values) => tenantApi.updateSettings(values),
    onSuccess: () => {
      message.success('Company settings saved.');
      qc.invalidateQueries(['tenant-settings']);
    },
    onError: (err) => message.error(err.response?.data?.message || 'Failed to save settings.'),
  });

  const tourSteps = [
    { title: '1. Company Details', description: 'Your registered business name, address, and contact details — used on printed invoices and reports.' },
    { title: '2. Tax Details', description: 'GST and PAN numbers appear on tax invoices. TDS% is recorded here for reference only — it is not automatically deducted anywhere yet.' },
    { title: '3. Related Settings', description: 'Tally sync, Printer assignment, and Financial Year close each have their own dedicated screens — quick links are at the bottom of this page.' },
  ];

  return (
    <div className="page-wrapper">
      <div className="page-header">
        <div>
          <Title level={4} style={{ margin: 0 }}>🏢 Company Settings</Title>
          <Text type="secondary" style={{ fontSize: 12 }}>
            Your business details, tax information, and links to related configuration
          </Text>
        </div>
      </div>
      <PageTour steps={tourSteps} />

      <Form form={form} layout="vertical" onFinish={(v) => saveMutation.mutate(v)}>
        <Row gutter={16}>
          <Col xs={24} lg={14}>
            <Card title="Company Details" size="small" style={{ borderRadius: 8, marginBottom: 16 }} loading={isLoading}>
              <Row gutter={16}>
                <Col xs={24} md={12}>
                  <Form.Item name="Company_Name" label="Company Name" rules={[{ required: true, message: 'Company name is required' }]}>
                    <Input placeholder="Dhanalakshmi Jewellers" />
                  </Form.Item>
                </Col>
                <Col xs={24} md={12}>
                  <Form.Item name="Phone" label="Phone">
                    <Input placeholder="+91 98765 43210" />
                  </Form.Item>
                </Col>
                <Col xs={24} md={12}>
                  <Form.Item name="Email" label="Email">
                    <Input type="email" placeholder="shop@example.com" />
                  </Form.Item>
                </Col>
                <Col xs={24} md={12}>
                  <Form.Item name="Address_Line1" label="Address Line 1">
                    <Input placeholder="Shop No, Street" />
                  </Form.Item>
                </Col>
                <Col xs={24} md={12}>
                  <Form.Item name="Address_Line2" label="Address Line 2">
                    <Input placeholder="Area, Landmark" />
                  </Form.Item>
                </Col>
                <Col xs={12} md={8}>
                  <Form.Item name="City" label="City">
                    <Input />
                  </Form.Item>
                </Col>
                <Col xs={12} md={8}>
                  <Form.Item name="State" label="State">
                    <Input />
                  </Form.Item>
                </Col>
                <Col xs={12} md={8}>
                  <Form.Item name="Pincode" label="Pincode">
                    <Input maxLength={6} />
                  </Form.Item>
                </Col>
              </Row>
            </Card>

            <Card title="Tax Details" size="small" style={{ borderRadius: 8 }} loading={isLoading}>
              <Row gutter={16}>
                <Col xs={24} md={12}>
                  <Form.Item name="GST_No" label="GST Number">
                    <Input placeholder="29ABCDE1234F1Z5" style={{ textTransform: 'uppercase' }} />
                  </Form.Item>
                </Col>
                <Col xs={24} md={12}>
                  <Form.Item name="PAN_No" label="PAN Number">
                    <Input placeholder="ABCDE1234F" style={{ textTransform: 'uppercase' }} />
                  </Form.Item>
                </Col>
                <Col xs={24} md={12}>
                  <Form.Item name="TDS_Percentage" label="TDS %"
                    tooltip="Recorded for reference only — not automatically deducted anywhere in the app yet.">
                    <InputNumber style={{ width: '100%' }} min={0} max={100} step={0.01} placeholder="0.00" />
                  </Form.Item>
                </Col>
              </Row>
              <Alert
                type="info" showIcon style={{ fontSize: 12 }}
                message="TDS% is stored for your reference only — it is not automatically deducted from any bill, payment, or karigar settlement yet."
              />
            </Card>
          </Col>

          <Col xs={24} lg={10}>
            <Card title="Related Settings" size="small" style={{ borderRadius: 8 }}>
              <Space direction="vertical" style={{ width: '100%' }} size={10}>
                <Button block icon={<SyncOutlined />} onClick={() => navigate('/tally')}>
                  Tally Sync Configuration
                </Button>
                <Button block icon={<PrinterOutlined />} onClick={() => navigate('/admin/printer-settings')}>
                  Printer Assignment
                </Button>
                <Button block icon={<CalendarOutlined />} onClick={() => navigate('/accounting/financial-year-close')}>
                  Financial Year Close
                </Button>
              </Space>
            </Card>
          </Col>
        </Row>

        <Divider style={{ margin: '8px 0 16px' }} />
        <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={saveMutation.isPending}
          style={{ background: '#B8860B', borderColor: '#B8860B' }}>
          Save Company Settings
        </Button>
      </Form>
    </div>
  );
}
