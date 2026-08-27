import React, { useState, useEffect, useRef } from 'react';
import {
  Row, Col, Card, Form, Input, Select, Switch, Button,
  Typography, Space, Divider, message, Tabs, Alert,
} from 'antd';
import { SaveOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { invoiceApi } from '../../api/modules';
import PageTour from '../../components/PageTour';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { Option } = Select;
const { TabPane } = Tabs;

const DOC_TYPES = [
  { value: 'SALES', label: 'Sales Invoice' },
  { value: 'KARIGAR_ISSUE', label: 'Karigar Issue Receipt' },
  { value: 'KARIGAR_SETTLEMENT', label: 'Karigar Settlement Bill' },
  { value: 'QUOTATION', label: 'Quotation' },
];

export default function InvoiceTemplatePage() {
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const [docType, setDocType] = useState('SALES');

  // ── Walkthrough tour refs ───────────────────────────────────────────────────
  const docTypeRef = useRef(null);
  const tabsRef = useRef(null);
  const previewRef = useRef(null);
  const saveRef = useRef(null);
  const tourSteps = [
    { title: '1. Choose Document Type', description: 'Pick which document you\'re customizing — Sales Invoice, Karigar Issue Receipt, Karigar Settlement Bill, or Quotation. Each has its own separate template.', target: () => docTypeRef.current },
    { title: '2. Header, Footer & Fields', description: 'Header sets your shop name, colors and logo. Footer sets terms, bank details and the signature label. Fields lets you toggle sections on/off — GST breakdown, wastage column, hallmark number and more.', target: () => tabsRef.current },
    { title: '3. Live Preview', description: 'Updates instantly as you change settings, so you always see exactly how the printed invoice will look before saving.', target: () => previewRef.current },
    { title: '4. Save Template', description: 'Saves your changes so they apply to every invoice of this document type going forward.', target: () => saveRef.current },
    { title: '5. This vs. Invoice Studio', description: 'This is the quick way to tweak text and toggle fields. For full drag-and-drop layout control, multiple templates per type, or AI-generated designs from an existing invoice, use Invoice Studio instead.' },
  ];

  const { data: template, refetch } = useQuery({
    queryKey: ['invoice-template', docType],
    queryFn: () => invoiceApi.getByType(docType).then((r) => r.data.data),
  });

  useEffect(() => {
    if (template) {
      form.setFieldsValue({
        ...template,
        Header_Text: template.Header_Text
          ? (typeof template.Header_Text === 'string' ? JSON.parse(template.Header_Text) : template.Header_Text)
          : {},
        Footer_Text: template.Footer_Text
          ? (typeof template.Footer_Text === 'string' ? JSON.parse(template.Footer_Text) : template.Footer_Text)
          : {},
      });
    }
  }, [template]);

  const saveMutation = useMutation({
    mutationFn: (data) => invoiceApi.saveTemplate(data),
    onSuccess: () => { message.success('Template saved!'); refetch(); },
    onError: (err) => message.error(err.response?.data?.message || 'Save failed.'),
  });

  const onFinish = (values) => {
    saveMutation.mutate({ ...values, Document_Type: docType });
  };

  const fieldSwitches = [
    { key: 'Show_GST_Breakdown', label: 'Show GST Breakdown' },
    { key: 'Show_Round_Off', label: 'Show Round-Off' },
    { key: 'Show_Old_Gold_Details', label: 'Show Old Gold Exchange Details' },
    { key: 'Show_Karigar_Details', label: 'Show Karigar Details' },
    { key: 'Show_Wastage_Column', label: 'Show Wastage Column' },
    { key: 'Show_Hallmark_Number', label: 'Show Hallmark Number' },
    { key: 'Show_QR_Code', label: 'Show QR Code' },
    { key: 'Is_Tax_Invoice', label: 'Tax Invoice (with GST No.)' },
  ];

  return (
    <div className="page-wrapper">
      <Alert
        type="warning"
        showIcon
        style={{ marginBottom: 16 }}
        message="This editor doesn't print real bills"
        description={
          <>
            Templates saved here are stored separately and are not used when a Sales Bill, Estimate, or any other
            document actually prints — that's controlled by <b>Invoice Studio</b>, which supports every document
            type, drag-and-drop layout, and is what real printing reads from. Use Invoice Studio to design the
            template that customers actually see.
          </>
        }
        action={
          <Button size="small" type="primary" style={{ background: '#B8860B', borderColor: '#B8860B' }} onClick={() => navigate('/invoice/studio')}>
            Open Invoice Studio
          </Button>
        }
      />
      <div className="page-header">
        <Title level={4} style={{ margin: 0 }}>Invoice Template Designer</Title>
        <Space>
          <div ref={docTypeRef}>
          <Select value={docType} onChange={setDocType} style={{ width: 200 }}>
            {DOC_TYPES.map((d) => <Option key={d.value} value={d.value}>{d.label}</Option>)}
          </Select>
          </div>
          <Button
            ref={saveRef}
            type="primary"
            icon={<SaveOutlined />}
            loading={saveMutation.isPending}
            onClick={() => form.submit()}
            style={{ background: '#B8860B', borderColor: '#B8860B' }}
          >
            Save Template
          </Button>
        </Space>
      </div>

      <Form form={form} layout="vertical" onFinish={onFinish}>
        <Row gutter={[16, 16]}>
          {/* Left: Settings */}
          <Col xs={24} lg={14}>
            <div ref={tabsRef}>
            <Tabs defaultActiveKey="header">
              <TabPane tab="Header" key="header">
                <Card style={{ borderRadius: 8 }}>
                  <Form.Item name="Template_Name" label="Template Name" rules={[{ required: true }]}>
                    <Input />
                  </Form.Item>
                  <Row gutter={16}>
                    <Col xs={8}>
                      <Form.Item name="Paper_Size" label="Paper Size" initialValue="A4">
                        <Select>
                          <Option value="A4">A4</Option>
                          <Option value="A5">A5</Option>
                          <Option value="Thermal_80mm">Thermal 80mm</Option>
                        </Select>
                      </Form.Item>
                    </Col>
                    <Col xs={8}>
                      <Form.Item name="Font_Family" label="Font" initialValue="Arial">
                        <Select>
                          <Option value="Arial">Arial</Option>
                          <Option value="Times New Roman">Times New Roman</Option>
                          <Option value="Georgia">Georgia</Option>
                        </Select>
                      </Form.Item>
                    </Col>
                    <Col xs={8}>
                      <Form.Item name="Font_Size" label="Font Size" initialValue={10}>
                        <Select>
                          {[9, 10, 11, 12].map((s) => <Option key={s} value={s}>{s}pt</Option>)}
                        </Select>
                      </Form.Item>
                    </Col>
                  </Row>
                  <Row gutter={16}>
                    <Col xs={8}>
                      <Form.Item name="Primary_Color" label="Primary Color" initialValue="#B8860B">
                        <Input type="color" style={{ width: 60, height: 36, padding: 2 }} />
                      </Form.Item>
                    </Col>
                    <Col xs={8}>
                      <Form.Item name="Secondary_Color" label="Secondary Color" initialValue="#1A1A1A">
                        <Input type="color" style={{ width: 60, height: 36, padding: 2 }} />
                      </Form.Item>
                    </Col>
                  </Row>
                  <Divider>Header Text</Divider>
                  <Form.Item name={['Header_Text', 'line1']} label="Company Name Line">
                    <Input placeholder="e.g. Varun Jewellers" />
                  </Form.Item>
                  <Form.Item name={['Header_Text', 'line2']} label="Tagline">
                    <Input placeholder="e.g. Since 1985 | Quality Gold" />
                  </Form.Item>
                  <Form.Item name="Header_Logo_URL" label="Logo URL">
                    <Input placeholder="https://..." />
                  </Form.Item>
                </Card>
              </TabPane>

              <TabPane tab="Footer" key="footer">
                <Card style={{ borderRadius: 8 }}>
                  <Form.Item name={['Footer_Text', 'terms']} label="Terms & Conditions">
                    <Input.TextArea rows={3} placeholder="Goods once sold cannot be returned. E.& O.E." />
                  </Form.Item>
                  <Form.Item name={['Footer_Text', 'bank']} label="Bank Details">
                    <Input placeholder="HDFC Bank A/C: 123456789 | IFSC: HDFC0001234" />
                  </Form.Item>
                  <Form.Item name="Footer_Message" label="Footer Message">
                    <Input placeholder="Thank you for shopping with us!" />
                  </Form.Item>
                  <Form.Item name="Signature_Field_Label" label="Signature Label" initialValue="Customer Signature">
                    <Input />
                  </Form.Item>
                  <Form.Item name="Copy_Type" label="Copy Type" initialValue="Original">
                    <Select>
                      <Option value="Original">Original</Option>
                      <Option value="Duplicate">Duplicate</Option>
                      <Option value="Triplicate">Triplicate</Option>
                    </Select>
                  </Form.Item>
                </Card>
              </TabPane>

              <TabPane tab="Fields" key="fields">
                <Card style={{ borderRadius: 8 }}>
                  <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 16 }}>
                    Toggle which fields appear on the invoice
                  </Text>
                  {fieldSwitches.map(({ key, label }) => (
                    <div
                      key={key}
                      style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        marginBottom: 14, padding: '6px 0', borderBottom: '1px solid #f0f0f0',
                      }}
                    >
                      <Text>{label}</Text>
                      <Form.Item name={key} valuePropName="checked" noStyle initialValue={true}>
                        <Switch size="small" />
                      </Form.Item>
                    </div>
                  ))}
                </Card>
              </TabPane>

              <TabPane tab="Custom CSS" key="css">
                <Card style={{ borderRadius: 8 }}>
                  <Form.Item name="Custom_CSS" label="Custom CSS (Advanced)">
                    <Input.TextArea
                      rows={12}
                      style={{ fontFamily: 'monospace', fontSize: 12 }}
                      placeholder={`.invoice-title { color: #B8860B; }\n.total-row { background: #F5F5F5; }`}
                    />
                  </Form.Item>
                </Card>
              </TabPane>
            </Tabs>
            </div>
          </Col>

          {/* Right: Live Preview */}
          <Col xs={24} lg={10} ref={previewRef}>
            <Card
              title="Live Preview"
              style={{ borderRadius: 8, position: 'sticky', top: 80 }}
              bodyStyle={{ background: '#f5f5f5', borderRadius: '0 0 8px 8px', minHeight: 400 }}
            >
              <div style={{
                background: 'white', borderRadius: 6, padding: 20,
                boxShadow: '0 2px 8px rgba(0,0,0,0.1)', fontSize: 10,
              }}>
                <div style={{ textAlign: 'center', borderBottom: '2px solid #B8860B', paddingBottom: 10, marginBottom: 10 }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: '#B8860B' }}>Your Jewellery Store</div>
                  <div style={{ fontSize: 9 }}>123 Main Street, City | GST: 29XXXXX</div>
                </div>
                <div style={{ textAlign: 'center', letterSpacing: 3, color: '#B8860B', marginBottom: 10 }}>
                  TAX INVOICE
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, marginBottom: 8 }}>
                  <span>Invoice No: INV-SAMPLE-0001</span>
                  <span>Date: {dayjs().format('DD-MMM-YYYY')}</span>
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 9, marginBottom: 8 }}>
                  <thead>
                    <tr style={{ background: '#B8860B', color: 'white' }}>
                      <th style={{ padding: '4px 6px', textAlign: 'left' }}>#</th>
                      <th style={{ padding: '4px 6px', textAlign: 'left' }}>Item</th>
                      <th style={{ padding: '4px 6px' }}>Purity</th>
                      <th style={{ padding: '4px 6px' }}>Wt(g)</th>
                      <th style={{ padding: '4px 6px', textAlign: 'right' }}>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td style={{ padding: '4px 6px' }}>1</td>
                      <td style={{ padding: '4px 6px' }}>Gold Ring</td>
                      <td style={{ padding: '4px 6px', textAlign: 'center' }}>22K</td>
                      <td style={{ padding: '4px 6px', textAlign: 'center' }}>5.500</td>
                      <td style={{ padding: '4px 6px', textAlign: 'right' }}>₹32,450</td>
                    </tr>
                  </tbody>
                </table>
                <div style={{ textAlign: 'right', fontSize: 9 }}>
                  <div>Subtotal: ₹32,450</div>
                  <div>GST (3%): ₹973</div>
                  <div style={{ fontWeight: 700, fontSize: 11, color: '#B8860B', borderTop: '1px solid #B8860B', paddingTop: 4 }}>
                    NET PAYABLE: ₹33,423
                  </div>
                </div>
              </div>
            </Card>
          </Col>
        </Row>
      </Form>

      <PageTour steps={tourSteps} />
    </div>
  );
}
