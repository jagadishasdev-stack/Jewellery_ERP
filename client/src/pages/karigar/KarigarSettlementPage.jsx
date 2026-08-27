import React, { useState, useRef } from 'react';
import {
  Card, Row, Col, Form, Select, DatePicker, Button, Table,
  Typography, Divider, Space, Tag, message, Statistic,
} from 'antd';
import { PrinterOutlined, CalculatorOutlined } from '@ant-design/icons';
import { useQuery, useMutation } from '@tanstack/react-query';
import { karigarApi } from '../../api/modules';
import { formatCurrency, formatWeight } from '../../utils/calculations';
import { printFromInvoiceStudio } from '../../utils/thermalReceipt';
import { printHTML } from '../../utils/printService';
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
    const [from, to] = values.dateRange;
    // amount is no longer sent — the server recomputes it itself from the
    // same unsettled/Completed issues this preview shows, so what's PAID
    // can never drift from what's DISPLAYED (or be edited in devtools).
    settleMutation.mutate({
      karigarId: values.karigarId,
      fromDate: from.format('YYYY-MM-DD'),
      toDate: to.format('YYYY-MM-DD'),
      paymentMode: 'Bank Transfer',
    });
  };

  // Used to just call window.print() on the whole page (nav, buttons and
  // all) — no real settlement slip existed. Tries the tenant's Invoice
  // Studio KARIGAR_SETTLEMENT design first, falls back to a real,
  // purpose-built layout (not the raw page) if none is designed.
  const printSettlement = async () => {
    if (!settlementData) return;
    const values = form.getFieldsValue();
    const [from, to] = values.dateRange || [];
    const settlementRef = `KST-${selectedKarigar?.Vendor_ID || 'X'}-${Date.now().toString().slice(-6)}`;
    const studioData = {
      settlement_number: settlementRef, date: dayjs().format('DD-MMM-YYYY HH:mm'),
      karigar_name: selectedKarigar?.Vendor_Name,
      bank_name: selectedKarigar?.Bank_Name, bank_account_no: selectedKarigar?.Bank_Account_No, ifsc_code: selectedKarigar?.IFSC_Code,
      period_from: from?.format?.('DD-MMM-YYYY'), period_to: to?.format?.('DD-MMM-YYYY'),
      items: (settlementData.items || []).map(i => ({
        issue_date: dayjs(i.Issue_Date).format('DD-MMM-YYYY'), issue_number: i.Issue_Number,
        gold_issued: i.Gold_Weight_Issued, gold_returned: i.Gross_Weight_Returned,
        wastage: i.Wastage_Weight, deduction: i.Wastage_Deduction,
      })),
      total_issued: settlementData.totals.totalIssued, total_returned: settlementData.totals.totalReturned,
      total_wastage: settlementData.totals.totalWastage, gross_wages: settlementData.totals.grossWages,
      wastage_deduction: settlementData.totals.wastageDeduction, net_payable: settlementData.totals.netWages,
    };
    const studioAttempt = await printFromInvoiceStudio('KARIGAR_SETTLEMENT', studioData, settlementRef);
    if (studioAttempt.printed) return;

    const itemRows = (settlementData.items || []).map(i => `
      <tr><td>${dayjs(i.Issue_Date).format('DD-MMM-YYYY')}</td><td>${i.Issue_Number}</td>
      <td>${formatWeight(i.Gold_Weight_Issued)}</td><td>${formatWeight(i.Gross_Weight_Returned)}</td>
      <td>${formatWeight(i.Wastage_Weight)}</td><td>${formatCurrency(i.Wastage_Deduction)}</td></tr>`).join('');
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
      body{font-family:Arial,sans-serif;padding:20px;font-size:11pt}
      h2{color:#B8860B;text-align:center;margin-bottom:4px}.sub{text-align:center;color:#666;font-size:10pt;margin-bottom:12px}
      .line{border-top:2px solid #B8860B;margin:10px 0}
      table{width:100%;border-collapse:collapse;margin:10px 0}
      th{background:#B8860B;color:#fff;padding:6px 8px;text-align:left;font-size:10pt}
      td{padding:5px 8px;border-bottom:1px solid #f0f0f0;font-size:10pt}
      .row{display:flex;justify-content:space-between;padding:4px 0}
      .label{color:#888}.val{font-weight:bold}
      .total{font-size:14pt;font-weight:bold;color:#B8860B}
      .footer{margin-top:40px;display:flex;justify-content:space-between}
      .sig{border-top:1px solid #000;width:180px;text-align:center;padding-top:5px;font-size:9pt}
      @media print{body{padding:4mm}}
    </style></head><body>
      <h2>KARIGAR SETTLEMENT</h2>
      <div class="sub">${settlementRef} &nbsp;|&nbsp; ${dayjs().format('DD-MMM-YYYY HH:mm')}</div>
      <div class="line"></div>
      <div class="row"><span class="label">Karigar</span><span class="val">${selectedKarigar?.Vendor_Name || '-'}</span></div>
      <div class="row"><span class="label">Period</span><span class="val">${from?.format?.('DD-MMM-YYYY') || '-'} to ${to?.format?.('DD-MMM-YYYY') || '-'}</span></div>
      <table><thead><tr><th>Issue Date</th><th>Issue #</th><th>Issued</th><th>Returned</th><th>Wastage</th><th>Deduction</th></tr></thead>
        <tbody>${itemRows}</tbody></table>
      <div class="line"></div>
      <div class="row"><span class="label">Gross Wages</span><span class="val">${formatCurrency(settlementData.totals.grossWages)}</span></div>
      <div class="row"><span class="label">Wastage Deduction</span><span class="val">- ${formatCurrency(settlementData.totals.wastageDeduction)}</span></div>
      <div class="row"><span class="total">NET PAYABLE: ${formatCurrency(settlementData.totals.netWages)}</span></div>
      ${selectedKarigar?.Bank_Account_No ? `<div class="row"><span class="label">Bank</span><span class="val">${selectedKarigar.Bank_Name || '-'} — ${selectedKarigar.Bank_Account_No}${selectedKarigar.IFSC_Code ? ` (${selectedKarigar.IFSC_Code})` : ''}</span></div>` : ''}
      <div class="footer">
        <div class="sig">Karigar Signature</div>
        <div class="sig">Authorised Signatory</div>
      </div>
    </body></html>`;
    return printHTML('other', html, { windowSize: 'width=600,height=700', docType: 'Karigar Settlement', docNumber: settlementRef });
  };

  const columns = [
    { title: 'Issue Date', dataIndex: 'Issue_Date', render: (v) => dayjs(v).format('DD-MMM-YYYY') },
    { title: 'Issue #', dataIndex: 'Issue_Number' },
    { title: 'Gold Issued (g)', dataIndex: 'Gold_Weight_Issued', render: (v) => formatWeight(v) },
    { title: 'Returned (g)', dataIndex: 'Gross_Weight_Returned', render: (v) => formatWeight(v) },
    {
      title: 'Wastage (g)', dataIndex: 'Wastage_Weight',
      render: (v, r) => (
        <Tag color="orange">
          {formatWeight(v)}{parseFloat(r.Deductible_Wastage_Weight || 0) < parseFloat(v || 0) ? ` (${formatWeight(r.Deductible_Wastage_Weight)} over allowance)` : ''}
        </Tag>
      ),
    },
    {
      // Deduction is the value of wastage EXCEEDING the allowed % (priced
      // at gold rate — wastage is grams of metal, not labor time), always
      // the server's own figure now, never recomputed client-side at the
      // wrong (wages) rate.
      title: 'Deduction', dataIndex: 'Wastage_Deduction',
      render: (v) => <Text type="danger">{formatCurrency(v)}</Text>,
    },
  ];

  return (
    <div className="page-wrapper">
      <div className="page-header">
        <Title level={4} style={{ margin: 0 }}>Karigar Settlement</Title>
        {settlementData && (
          <Button icon={<PrinterOutlined />} onClick={printSettlement}>Print Bill</Button>
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
