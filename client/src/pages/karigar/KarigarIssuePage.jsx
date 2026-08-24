import React, { useRef } from 'react';
import { Form, Input, InputNumber, Select, DatePicker, Button, Card, Row, Col, Typography, message } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { karigarApi, masterApi } from '../../api/modules';
import { useNavigate } from 'react-router-dom';
import { useGoldRate } from '../../hooks/useGoldRate';
import { formatCurrency } from '../../utils/calculations';
import PageTour from '../../components/PageTour';
import { useActionShortcuts } from '../../hooks/useActionShortcuts';
import { useF2Lookup } from '../../hooks/useF2Lookup';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { Option } = Select;

export default function KarigarIssuePage() {
  const [form] = Form.useForm();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { goldRate } = useGoldRate();

  // ── Walkthrough tour refs ───────────────────────────────────────────────────
  const karigarRef = useRef(null);
  const weightRef = useRef(null);
  const wagesRef = useRef(null);
  const submitRef = useRef(null);
  const tourSteps = [
    { title: '1. Select Karigar', description: 'Choose which goldsmith you\'re handing gold to, and optionally the design they\'ll make.', target: () => karigarRef.current },
    { title: '2. Gold Weight & Purity', description: 'Enter how much gold (in grams) you\'re issuing, its purity, and the wastage % you\'ll allow when it comes back.', target: () => weightRef.current },
    { title: '3. Wages & Dates', description: 'Set the karigar\'s wage rate per gram and the issue/expected-return dates.', target: () => wagesRef.current },
    { title: '4. Issue Gold', description: 'Submitting creates an Issue voucher tracked against this karigar — use Karigar → Return Goods later to record what comes back.', target: () => submitRef.current },
  ];

  const { data: karigars } = useQuery({ queryKey: ['karigars'], queryFn: () => karigarApi.getList().then((r) => r.data.data) });
  const { data: purities } = useQuery({ queryKey: ['purities'], queryFn: () => masterApi.getPurities().then((r) => r.data.data) });
  const { data: designs } = useQuery({ queryKey: ['designs'], queryFn: () => masterApi.getDesigns().then((r) => r.data.data) });

  const issueMutation = useMutation({
    mutationFn: (data) => karigarApi.issueGold(data),
    onSuccess: (res) => {
      message.success(`Gold issued! Issue #${res.data.data.Issue_Number}`);
      qc.invalidateQueries(['karigar-issues']);
      navigate('/karigar');
    },
    onError: (err) => message.error(err.response?.data?.message || 'Failed to issue gold.'),
  });

  const onFinish = (values) => {
    issueMutation.mutate({
      ...values,
      Issue_Date: values.Issue_Date.format('YYYY-MM-DD'),
      Expected_Return_Date: values.Expected_Return_Date?.format('YYYY-MM-DD'),
      Gold_Rate_At_Issue: goldRate,
    });
  };

  const karigarLookup = useF2Lookup();
  useActionShortcuts({
    onSave: () => form.submit(),
    onCancel: () => navigate('/karigar'),
  });

  return (
    <div className="page-wrapper">
      <div className="page-header">
        <Title level={4} style={{ margin: 0 }}>Issue Gold to Karigar</Title>
        <Button onClick={() => navigate('/karigar')}>Back</Button>
      </div>

      <Row gutter={[16, 0]}>
        <Col xs={24} lg={14}>
          <Card style={{ borderRadius: 8 }}>
            <Form form={form} layout="vertical" onFinish={onFinish}>
              <div ref={karigarRef}>
              <Row gutter={16}>
                <Col xs={24} md={12}>
                  <Form.Item name="Karigar_ID" label="Select Karigar" rules={[{ required: true }]}>
                    <Select placeholder="Choose karigar (F2 for full list)" showSearch optionFilterProp="children" size="large"
                      open={karigarLookup.open} onDropdownVisibleChange={karigarLookup.onOpenChange} onKeyDown={karigarLookup.onKeyDown}>
                      {(karigars || []).map((k) => (
                        <Option key={k.Vendor_ID} value={k.Vendor_ID}>{k.Vendor_Name} ({k.Vendor_Code})</Option>
                      ))}
                    </Select>
                  </Form.Item>
                </Col>
                <Col xs={24} md={12}>
                  <Form.Item name="Design_ID" label="Design (for making)">
                    <Select allowClear placeholder="Select design" showSearch optionFilterProp="children" size="large">
                      {(designs || []).map((d) => <Option key={d.Design_ID} value={d.Design_ID}>{d.Design_Name}</Option>)}
                    </Select>
                  </Form.Item>
                </Col>
              </Row>
              </div>

              <div ref={weightRef}>
              <Row gutter={16}>
                <Col xs={12} md={8}>
                  <Form.Item name="Gold_Weight_Issued" label="Gold Weight (g)" rules={[{ required: true }]}>
                    <InputNumber style={{ width: '100%' }} step={0.001} min={0.001} size="large" />
                  </Form.Item>
                </Col>
                <Col xs={12} md={8}>
                  <Form.Item name="Purity_ID" label="Purity" rules={[{ required: true }]}>
                    <Select size="large">
                      {(purities || []).map((p) => <Option key={p.Purity_ID} value={p.Purity_ID}>{p.Purity_Code}</Option>)}
                    </Select>
                  </Form.Item>
                </Col>
                <Col xs={12} md={8}>
                  <Form.Item name="Wastage_Allowed_Percent" label="Wastage Allowed (%)" initialValue={3}>
                    <InputNumber style={{ width: '100%' }} step={0.5} min={0} size="large" />
                  </Form.Item>
                </Col>
              </Row>
              </div>

              <div ref={wagesRef}>
              <Row gutter={16}>
                <Col xs={12} md={8}>
                  <Form.Item name="Karigar_Wages_Rate" label="Wages Rate (₹/g)" rules={[{ required: true }]}>
                    <InputNumber style={{ width: '100%' }} min={0} size="large" />
                  </Form.Item>
                </Col>
                <Col xs={12} md={8}>
                  <Form.Item name="Issue_Date" label="Issue Date" initialValue={dayjs()} rules={[{ required: true }]}>
                    <DatePicker style={{ width: '100%' }} size="large" />
                  </Form.Item>
                </Col>
                <Col xs={12} md={8}>
                  <Form.Item name="Expected_Return_Date" label="Expected Return">
                    <DatePicker style={{ width: '100%' }} size="large" disabledDate={(d) => d && d < dayjs()} />
                  </Form.Item>
                </Col>
              </Row>
              </div>

              <Form.Item name="Remarks" label="Remarks">
                <Input.TextArea rows={2} />
              </Form.Item>

              <Button ref={submitRef} type="primary" htmlType="submit" size="large" block
                loading={issueMutation.isPending}
                style={{ background: '#B8860B', borderColor: '#B8860B', fontWeight: 700 }}>
                Issue Gold
              </Button>
            </Form>
          </Card>
        </Col>

        <Col xs={24} lg={10}>
          <Card title="Current Gold Rate" style={{ borderRadius: 8 }}>
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <Text style={{ fontSize: 36, fontWeight: 700, color: '#B8860B' }}>
                {formatCurrency(goldRate)}/g
              </Text>
              <br />
              <Text type="secondary">22K Gold Rate (Live)</Text>
            </div>
          </Card>
        </Col>
      </Row>

      <PageTour steps={tourSteps} />
    </div>
  );
}
