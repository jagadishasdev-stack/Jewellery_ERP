import React, { useState, useRef } from 'react';
import {
  Card, Row, Col, Form, Select, DatePicker, Button, Table,
  Typography, Divider, Space, Tag, message, Statistic,
} from 'antd';
import { PrinterOutlined, CalculatorOutlined } from '@ant-design/icons';
import { useQuery, useMutation } from '@tanstack/react-query';
import { karigarApi } from '../../api/modules';
import { formatCurrency, formatWeight } from '../../utils/calculations';
import PageTour from '../../components/PageTour';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { Option } = Select;
const { RangePicker } = DatePicker;

export default function KarigarSettlementPage() {
  const [form] = Form.useForm();
  const [settlementData, setSettlementData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [selectedKarigar, setSelectedKarigar] = useState(null);

  // ── Walkthrough tour refs ───────────────────────────────────────────────────
  const filterRef = useRef(null);
  const issuesTableRef = useRef(null);
  const summaryRef = useRef(null);
  const tourSteps = [
    { title: '1. Choose Karigar & Period', description: 'Select the karigar and the date range you want to settle wages for, then click Calculate Settlement to pull in all their gold issues and returns for that period.', target: () => filterRef.current },
    { title: '2. Issue-wise Breakdown', description: 'Every issue in the period shows here with gold issued, gold returned, and any wastage beyond the allowed limit — wastage over the allowance is deducted from the karigar\'s wages.', target: () => issuesTableRef.current },
    { title: '3. Payment Summary', description: 'The gross wages, wastage deduction, and final Net Payable amount are shown here, along with the karigar\'s bank details for the transfer.', target: () => summaryRef.current },
    { title: '4. Mark as Paid', description: 'Once you have paid the karigar (cash or bank transfer), click Mark as Paid to record the settlement, or use Print Bill to hand them a physical settlement slip.' },
  ];

  const { data: karigars } = useQuery({
    queryKey: ['karigars'],
    queryFn: () => karigarApi.getList().then((r) => r.data.data),
  });

  const settleMutation = useMutation({
    mutationFn: (data) => karigarApi.processSettlement(data),
    onSuccess: () => message.success('Settlement processed and payment recorded.'),
    onError: (err) => message.error(err.response?.data?.message || 'Settlement failed.'),
  });

  const calculate = async () => {
    const values = form.getFieldsValue();
    if (!values.karigarId || !values.dateRange) {
      message.warning('Please select karigar and date range.');
      return;
    }
    setLoading(true);
    try {
      const [from, to] = values.dateRange;
      const res = await karigarApi.getSettlement({
        karigarId: values.karigarId,
        fromDate: from.format('YYYY-MM-DD'),
        toDate: to.format('YYYY-MM-DD'),
      });
      setSettlementData(res.data.data);
      const k = (karigars || []).find((k) => k.Vendor_ID === values.karigarId);
      setSelectedKarigar(k);
    } catch (err) {
      message.error('Failed to calculate settlement.');
    } finally {
      setLoading(false);
    }
  };

  const handleSettle = () => {
    if (!settlementData) return;
    const values = form.getFieldsValue();
    settleMutation.mutate({
      karigarId: values.karigarId,
      amount: settlementData.totals.netWages,
      paymentMode: 'Bank Transfer',
    });
  };

  const columns = [
    { title: 'Issue Date', dataIndex: 'Issue_Date', render: (v) => dayjs(v).format('DD-MMM-YYYY') },
    { title: 'Issue #', dataIndex: 'Issue_Number' },
    { title: 'Gold Issued (g)', dataIndex: 'Gold_Weight_Issued', render: (v) => formatWeight(v) },
    { title: 'Returned (g)', dataIndex: 'Gross_Weight_Returned', render: (v) => formatWeight(v) },
    { title: 'Wastage (g)', dataIndex: 'Wastage_Weight', render: (v) => <Tag color="orange">{formatWeight(v)}</Tag> },
    {
      title: 'Deduction',
      render: (_, r) => {
        const deduction = parseFloat(r.Wastage_Weight || 0) * parseFloat(r.Karigar_Wages_Rate || 0);
        return <Text type="danger">{formatCurrency(deduction)}</Text>;
      },
    },
  ];

  return (
    <div className="page-wrapper">
      <div className="page-header">
        <Title level={4} style={{ margin: 0 }}>Karigar Settlement</Title>
        {settlementData && (
          <Button icon={<PrinterOutlined />} onClick={() => window.print()}>Print Bill</Button>
        )}
      </div>

      <Row gutter={[16, 16]}>
        {/* Filter */}
        <Col xs={24}>
          <div ref={filterRef}>
          <Card style={{ borderRadius: 8 }}>
            <Form form={form} layout="inline">
              <Form.Item name="karigarId" label="Karigar" rules={[{ required: true }]}>
                <Select style={{ width: 220 }} placeholder="Select karigar" showSearch optionFilterProp="children">
                  {(karigars || []).map((k) => (
                    <Option key={k.Vendor_ID} value={k.Vendor_ID}>{k.Vendor_Name}</Option>
                  ))}
                </Select>
              </Form.Item>
              <Form.Item name="dateRange" label="Period" rules={[{ required: true }]}>
                <RangePicker
                  defaultValue={[dayjs().startOf('month'), dayjs().endOf('month')]}
                  format="DD-MMM-YYYY"
                />
              </Form.Item>
              <Form.Item>
                <Button type="primary" icon={<CalculatorOutlined />} loading={loading}
                  onClick={calculate}
                  style={{ background: '#B8860B', borderColor: '#B8860B' }}>
                  Calculate Settlement
                </Button>
              </Form.Item>
            </Form>
          </Card>
          </div>
        </Col>

        {settlementData && (
          <>
            {/* Issue Details Table */}
            <Col xs={24} lg={16}>
              <div ref={issuesTableRef}>
              <Card
                title={`Settlement — ${selectedKarigar?.Vendor_Name}`}
                style={{ borderRadius: 8 }}
                bodyStyle={{ padding: 0 }}
              >
                <Table
            scroll={{ x: "max-content" }}
                  columns={columns}
                  dataSource={settlementData.items}
                  rowKey={(r, i) => i}
                  pagination={false}
                  size="small"
                  summary={() => (
                    <Table.Summary.Row
            scroll={{ x: "max-content" }} style={{ background: '#fafafa', fontWeight: 700 }}>
                      <Table.Summary.Cell
            scroll={{ x: "max-content" }} colSpan={2}>TOTAL</Table.Summary.Cell>
                      <Table.Summary.Cell>{formatWeight(settlementData.totals.totalIssued)}</Table.Summary.Cell>
                      <Table.Summary.Cell>{formatWeight(settlementData.totals.totalReturned)}</Table.Summary.Cell>
                      <Table.Summary.Cell><Tag color="orange">{formatWeight(settlementData.totals.totalWastage)}</Tag></Table.Summary.Cell>
                      <Table.Summary.Cell><Text type="danger">{formatCurrency(settlementData.totals.wastageDeduction)}</Text></Table.Summary.Cell>
                    </Table.Summary.Row>
                  )}
                />
              </Card>
              </div>
            </Col>

            {/* Settlement Summary */}
            <Col xs={24} lg={8}>
              <div ref={summaryRef}>
              <Card title="Payment Summary" style={{ borderRadius: 8 }}>
                <Space direction="vertical" style={{ width: '100%' }} size={10}>
                  <Statistic title="Gross Wages" value={settlementData.totals.grossWages} formatter={(v) => formatCurrency(v)} />
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Text type="secondary">Wastage Deduction</Text>
                    <Text type="danger">- {formatCurrency(settlementData.totals.wastageDeduction)}</Text>
                  </div>
                  <Divider style={{ margin: '8px 0' }} />
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Text strong style={{ fontSize: 16 }}>Net Payable</Text>
                    <Text strong style={{ fontSize: 20, color: '#B8860B' }}>
                      {formatCurrency(settlementData.totals.netWages)}
                    </Text>
                  </div>

                  {selectedKarigar?.Bank_Account_No && (
                    <div style={{ background: '#f9f9f9', borderRadius: 6, padding: '8px 12px', fontSize: 12 }}>
                      <Text type="secondary">Bank: </Text>
                      <Text>{selectedKarigar.Bank_Name}</Text><br />
                      <Text type="secondary">A/C: </Text>
                      <Text>{selectedKarigar.Bank_Account_No}</Text><br />
                      {selectedKarigar.IFSC_Code && <><Text type="secondary">IFSC: </Text><Text>{selectedKarigar.IFSC_Code}</Text></>}
                    </div>
                  )}

                  <Button
                    type="primary" block size="large"
                    loading={settleMutation.isPending}
                    onClick={handleSettle}
                    style={{ background: '#52c41a', borderColor: '#52c41a', fontWeight: 700 }}
                  >
                    Mark as Paid
                  </Button>
                </Space>
              </Card>
              </div>
            </Col>
          </>
        )}
      </Row>

      <PageTour steps={tourSteps} />
    </div>
  );
}
