/**
 * SalesBillHistoryPage — every sales bill/invoice ever created, searchable
 * and filterable, with a detail view and one-click reprint (reprint reuses
 * the exact same Invoice Studio template printing wired up for POS checkout
 * — see utils/thermalReceipt.js's printThermalReceipt).
 */
import React, { useState, useRef } from 'react';
import {
  Card, Table, Input, DatePicker, Select, Space, Tag, Button, Typography,
  Drawer, message, Col, Modal, Form, Radio, Alert, Grid,
} from 'antd';
import { SearchOutlined, EyeOutlined, FileTextOutlined, StopOutlined, RollbackOutlined, PrinterOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { salesApi, bankChequeApi } from '../../api/modules';
import { useAuthStore } from '../../store/authStore';
import { formatCurrency } from '../../utils/calculations';
import { printThermalReceipt, printFromInvoiceStudio } from '../../utils/thermalReceipt';
import { printHTML } from '../../utils/printService';
import PrinterOverrideButton from '../../components/PrinterOverrideButton';
import PageTour from '../../components/PageTour';
import SalesBillDetail from './SalesBillDetail';
import dayjs from 'dayjs';

const { Text } = Typography;
const { RangePicker } = DatePicker;

const STATUS_COLOR = { Paid: 'green', Partial: 'orange', Pending: 'red', Cancelled: 'default' };

export default function SalesBillHistoryPage() {
  const { user } = useAuthStore();
  const qc = useQueryClient();
  const screens = Grid.useBreakpoint();
  const [search, setSearch] = useState('');
  const [dateRange, setDateRange] = useState(null);
  const [paymentStatus, setPaymentStatus] = useState('');
  const [page, setPage] = useState(1);
  const [detailId, setDetailId] = useState(null);
  const [reprintingId, setReprintingId] = useState(null);
  // Neither /sales/:id/cancel nor the new /sales/:id/return had ANY entry
  // point anywhere in the client — cancel was fully built and working on
  // the backend but orphaned (found via audit); return didn't exist at
  // all until now. Both live here since this is the one page every past
  // sale is actually findable from.
  const [cancelModal, setCancelModal] = useState(null); // sale row, or null
  const [returnModal, setReturnModal] = useState(null);
  const [cancelForm] = Form.useForm();
  const [returnForm] = Form.useForm();
  // "Selected Bill Print" — Master/Reports/Utility audit gap: reprint
  // already existed per-row, but there was no way to batch-reprint a
  // chosen set of bills (e.g. every bill from a busy morning) without
  // opening each one individually.
  const [selectedRowKeys, setSelectedRowKeys] = useState([]);
  const [bulkPrinting, setBulkPrinting] = useState(false);

  const { data: bankAccounts } = useQuery({
    queryKey: ['bank-accounts-for-returns'],
    queryFn: () => bankChequeApi.getAccounts().then((r) => r.data.data || []),
    staleTime: 5 * 60 * 1000,
  });

  const cancelMutation = useMutation({
    mutationFn: ({ id, ...data }) => salesApi.cancel(id, data),
    onSuccess: () => {
      message.success('Sale cancelled.');
      qc.invalidateQueries({ queryKey: ['sales-history'] });
      setCancelModal(null); cancelForm.resetFields();
    },
    onError: (err) => message.error(err.response?.data?.message || 'Failed to cancel.'),
  });

  // No print action existed at all for a sales return before — the
  // customer walked away with nothing on paper. Tries the tenant's
  // Invoice Studio SALES_RETURN design first, falls back to this plain
  // credit-note layout if none is designed.
  const printCreditNote = async ({ invoice_number, customer_name, customer_mobile, net_payable, sale_date, Refund_Mode, reason }) => {
    const returnRef = `RETURN-${invoice_number}`;
    const studioData = {
      credit_note_number: returnRef, against_invoice: invoice_number,
      date: dayjs().format('DD-MMM-YYYY HH:mm'), original_bill_date: sale_date ? dayjs(sale_date).format('DD-MMM-YYYY') : null,
      customer_name: customer_name || 'Walk-in', customer_mobile,
      refund_amount: net_payable, refund_mode: Refund_Mode, reason: reason || '-',
    };
    const studioAttempt = await printFromInvoiceStudio('SALES_RETURN', studioData, returnRef);
    if (studioAttempt.printed) return;

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
      body{font-family:Arial,sans-serif;padding:20px;font-size:11pt}
      h2{color:#B8860B;text-align:center;margin-bottom:4px}.sub{text-align:center;color:#666;font-size:10pt;margin-bottom:12px}
      .line{border-top:2px solid #B8860B;margin:10px 0}
      .row{display:flex;justify-content:space-between;padding:4px 0}
      .label{color:#888}.val{font-weight:bold}
      .total{font-size:14pt;font-weight:bold;color:#B8860B}
      @media print{body{padding:4mm}}
    </style></head><body>
      <h2>CREDIT NOTE / SALES RETURN</h2>
      <div class="sub">${returnRef} &nbsp;|&nbsp; ${dayjs().format('DD-MMM-YYYY HH:mm')}</div>
      <div class="line"></div>
      <div class="row"><span class="label">Against Invoice</span><span class="val">${invoice_number}</span></div>
      <div class="row"><span class="label">Customer</span><span class="val">${customer_name || 'Walk-in'}</span></div>
      ${customer_mobile ? `<div class="row"><span class="label">Mobile</span><span class="val">${customer_mobile}</span></div>` : ''}
      <div class="row"><span class="label">Reason</span><span class="val">${reason || '-'}</span></div>
      <div class="row"><span class="label">Refunded Via</span><span class="val">${Refund_Mode}</span></div>
      <div class="line"></div>
      <div class="row"><span class="total">REFUND AMOUNT: ₹${parseFloat(net_payable || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span></div>
      <div style="margin-top:20px">Customer Signature: ___________________________</div>
    </body></html>`;
    return printHTML('credit_note', html, { windowSize: 'width=500,height=650', docType: 'Sales Return', docNumber: returnRef });
  };

  const returnMutation = useMutation({
    mutationFn: ({ id, invoice_number, customer_name, customer_mobile, net_payable, sale_date, ...data }) => salesApi.return(id, data),
    onSuccess: (res, variables) => {
      message.success(res.data.message || 'Sale returned.');
      qc.invalidateQueries({ queryKey: ['sales-history'] });
      printCreditNote(variables);
      setReturnModal(null); returnForm.resetFields();
    },
    onError: (err) => message.error(err.response?.data?.message || 'Failed to process return.'),
  });

  const params = {
    page, limit: 25,
    search: search || undefined,
    paymentStatus: paymentStatus || undefined,
    fromDate: dateRange?.[0]?.format('YYYY-MM-DD'),
    toDate: dateRange?.[1]?.format('YYYY-MM-DD'),
  };

  const { data, isLoading } = useQuery({
    queryKey: ['sales-history', params],
    queryFn: () => salesApi.list(params).then((r) => r.data.data),
    keepPreviousData: true,
  });

  const { data: detail, isLoading: detailLoading } = useQuery({
    queryKey: ['sale-detail', detailId],
    queryFn: () => salesApi.getById(detailId).then((r) => r.data.data),
    enabled: !!detailId,
  });

  const reprint = async (saleId, printerNameOverride) => {
    setReprintingId(saleId);
    try {
      const res = await salesApi.getById(saleId);
      const { sale, items } = res.data.data;
      const printResult = await printThermalReceipt(sale, items, { Company_Name: user?.companyName, GST_No: user?.gstNo }, printerNameOverride);
      if (printResult?.success) message.success('Reprinted.');
      else message.warning('Reprint sent to the fallback print dialog — the configured printer may be offline.');
    } catch {
      message.error('Failed to reprint this bill.');
    } finally {
      setReprintingId(null);
    }
  };

  // Sequential, not parallel — each reprint opens the browser/native print
  // dialog (or hits a configured printer); firing them all at once would
  // either race each other or spam multiple dialogs open simultaneously.
  const printSelected = async () => {
    if (!selectedRowKeys.length) { message.warning('Select at least one bill to print.'); return; }
    setBulkPrinting(true);
    let done = 0;
    for (const saleId of selectedRowKeys) {
      try { await reprint(saleId); done++; } catch { /* reprint() already surfaces its own error message */ }
    }
    setBulkPrinting(false);
    setSelectedRowKeys([]);
    message.success(`Printed ${done} of ${selectedRowKeys.length} selected bill(s).`);
  };

  // ── Walkthrough tour refs ───────────────────────────────────────────────────
  const filtersRef = useRef(null);
  const tableRef = useRef(null);
  const tourSteps = [
    { title: '1. Search & Filter', description: 'Search by invoice number, customer name, or mobile number, narrow by date range or payment status.', target: () => filtersRef.current },
    { title: '2. Every Bill Ever Created', description: 'Click the eye icon to see full item-by-item details and payment breakdown, or the printer icon to reprint that exact bill using your Invoice Studio design. Tick the checkboxes on the left to select several bills and use "Print Selected" above the table to reprint them all in one go.', target: () => tableRef.current },
  ];

  const columns = [
    { title: 'Invoice No', dataIndex: 'Invoice_Number', width: 190, render: (v) => <Text code style={{ fontSize: 11, color: '#B8860B' }}>{v}</Text> },
    { title: 'Date', dataIndex: 'Sale_Date', width: 140, render: (v) => dayjs(v).format('DD-MMM-YYYY HH:mm') },
    { title: 'Customer', dataIndex: 'Customer_Name', ellipsis: true, render: (v, r) => <span>{v}{r.Customer_Mobile && <Text type="secondary" style={{ fontSize: 11 }}> · {r.Customer_Mobile}</Text>}</span> },
    { title: 'Type', dataIndex: 'Sale_Type', width: 100, render: (v) => <Tag>{v}</Tag> },
    { title: 'Amount', dataIndex: 'Net_Payable_Amount', width: 120, render: (v) => <Text strong style={{ color: '#B8860B' }}>{formatCurrency(v)}</Text> },
    { title: 'Status', dataIndex: 'Payment_Status', width: 100, render: (v) => <Tag color={STATUS_COLOR[v] || 'default'}>{v}</Tag> },
    { title: 'Payment', dataIndex: 'Payment_Mode', width: 110 },
    { title: 'Counter', dataIndex: 'Counter_Name', width: 110, render: (v) => v || '-' },
    { title: 'Billed By', dataIndex: 'Operator_Name', width: 120, render: (v) => v || '-' },
    {
      title: 'Actions', width: 140, fixed: 'right',
      render: (_, r) => (
        <Space size={4}>
          <Button type="text" size="small" icon={<EyeOutlined />} onClick={() => setDetailId(r.Sale_ID)} />
          <PrinterOverrideButton loading={reprintingId === r.Sale_ID} onPrint={(printerName) => reprint(r.Sale_ID, printerName)} />
          {['Pending', 'Partial'].includes(r.Payment_Status) && (
            <Button type="text" size="small" danger icon={<StopOutlined />} title="Cancel" onClick={() => setCancelModal(r)} />
          )}
          {r.Payment_Status === 'Paid' && (
            <Button type="text" size="small" icon={<RollbackOutlined />} title="Return" onClick={() => setReturnModal(r)} />
          )}
        </Space>
      ),
    },
  ];

  return (
    <div className="page-wrapper">
      <div className="page-header">
        <div>
          <div className="page-header-title"><FileTextOutlined style={{ color: '#B8860B', marginRight: 8 }} />Sales Bill History</div>
          <div className="page-header-sub">Every sales bill ever created — search, view, and reprint any past invoice.</div>
        </div>
        {selectedRowKeys.length > 0 && (
          <Button icon={<PrinterOutlined />} loading={bulkPrinting} onClick={printSelected} type="primary" style={{ background: '#B8860B', borderColor: '#B8860B' }}>
            Print Selected ({selectedRowKeys.length})
          </Button>
        )}
      </div>

      <Card className="erp-card" style={{ marginBottom: 14 }} bodyStyle={{ padding: '14px 16px' }}>
        <div ref={filtersRef}>
          <Space wrap size={12}>
            <Input.Search
              placeholder="Invoice No / customer name / mobile"
              prefix={<SearchOutlined style={{ color: '#B8860B' }} />}
              style={{ width: 280 }}
              allowClear
              onSearch={(v) => { setSearch(v); setPage(1); }}
            />
            <RangePicker value={dateRange} onChange={(v) => { setDateRange(v); setPage(1); }} format="DD-MMM-YYYY" />
            <Select
              placeholder="Payment Status" allowClear style={{ width: 150 }}
              value={paymentStatus || undefined}
              onChange={(v) => { setPaymentStatus(v || ''); setPage(1); }}
              options={['Paid', 'Partial', 'Pending', 'Cancelled'].map((s) => ({ value: s, label: s }))}
            />
          </Space>
        </div>
      </Card>

      <Card className="erp-card" bodyStyle={{ padding: 0 }}>
        <div ref={tableRef}>
          <Table
            scroll={{ x: 'max-content' }}
            columns={columns}
            dataSource={data?.items || []}
            rowKey="Sale_ID"
            loading={isLoading}
            size="small"
            rowSelection={{ selectedRowKeys, onChange: setSelectedRowKeys }}
            pagination={{
              total: data?.total || 0, pageSize: 25, current: page,
              onChange: setPage, showTotal: (t) => `${t} bills`,
            }}
          />
        </div>
      </Card>

      <Drawer
        title={detail?.sale?.Invoice_Number || 'Sales Bill'}
        placement="right" width={screens.md ? 880 : '100%'} open={!!detailId} onClose={() => setDetailId(null)} loading={detailLoading}
        extra={detail && <PrinterOverrideButton label="Reprint" size="middle" loading={reprintingId === detail?.sale?.Sale_ID} onPrint={(printerName) => reprint(detail.sale.Sale_ID, printerName)} />}
      >
        {detail && <SalesBillDetail detail={detail} statusColor={STATUS_COLOR} />}
      </Drawer>

      {/* Cancel — for a Pending/Partial sale that never left the counter fully paid. */}
      <Modal title={`Cancel ${cancelModal?.Invoice_Number}`} open={!!cancelModal}
        onCancel={() => { setCancelModal(null); cancelForm.resetFields(); }} footer={null} destroyOnClose>
        <Alert type="warning" showIcon style={{ marginBottom: 12 }}
          message="Restores stock, reverses any Old Gold/Gift Voucher/Loyalty Points this sale used, and reverses the accounting journal. This cannot be undone." />
        <Form form={cancelForm} layout="vertical" onFinish={(v) => cancelMutation.mutate({ id: cancelModal.Sale_ID, ...v })}>
          <Form.Item name="reason" label="Reason" rules={[{ required: true, message: 'A reason is required.' }]}>
            <Input.TextArea rows={2} placeholder="e.g. Customer changed mind before taking the item" />
          </Form.Item>
          <Button type="primary" danger htmlType="submit" block loading={cancelMutation.isPending}>
            Cancel Sale
          </Button>
        </Form>
      </Modal>

      {/* Return — for a fully-Paid sale. /cancel refuses these outright;
          this is the return/credit-note flow it points to instead. */}
      <Modal title={`Return ${returnModal?.Invoice_Number}`} open={!!returnModal}
        onCancel={() => { setReturnModal(null); returnForm.resetFields(); }} footer={null} destroyOnClose width={480}>
        <Alert type="warning" showIcon style={{ marginBottom: 12 }}
          message="Restores stock, reverses any Old Gold/Gift Voucher/Loyalty Points this sale used and the accounting journal (including GST and cost of goods sold), then refunds the amount already collected via whichever channel you pick below. This cannot be undone." />
        <Form form={returnForm} layout="vertical" initialValues={{ Refund_Mode: 'Cash' }}
          onFinish={(v) => returnMutation.mutate({
            id: returnModal.Sale_ID,
            invoice_number: returnModal.Invoice_Number, customer_name: returnModal.Customer_Name,
            customer_mobile: returnModal.Customer_Mobile, net_payable: returnModal.Net_Payable_Amount,
            sale_date: returnModal.Sale_Date,
            ...v,
          })}>
          <Form.Item name="Refund_Mode" label="Refund Via" rules={[{ required: true }]}>
            <Radio.Group optionType="button" buttonStyle="solid">
              <Radio.Button value="Cash">Cash</Radio.Button>
              <Radio.Button value="Bank">Bank</Radio.Button>
              <Radio.Button value="Store Credit">Store Credit</Radio.Button>
            </Radio.Group>
          </Form.Item>
          <Form.Item shouldUpdate noStyle>
            {() => returnForm.getFieldValue('Refund_Mode') === 'Bank' && (
              <Form.Item name="Bank_Account_ID" label="Which Bank" rules={[{ required: true, message: 'Pick a bank account.' }]}>
                <Select options={(bankAccounts || []).map((b) => ({ value: b.Account_ID, label: `${b.Bank_Name} (${b.Account_Number})` }))} />
              </Form.Item>
            )}
          </Form.Item>
          <Form.Item shouldUpdate noStyle>
            {() => returnForm.getFieldValue('Refund_Mode') === 'Store Credit' && !returnModal?.Customer_Name && (
              <Alert type="error" showIcon style={{ marginBottom: 12 }} message="Store Credit needs a customer on record — this looks like a walk-in sale." />
            )}
          </Form.Item>
          <Form.Item name="reason" label="Reason">
            <Input.TextArea rows={2} placeholder="e.g. Item didn't fit, customer wants a refund" />
          </Form.Item>
          <Button type="primary" htmlType="submit" block loading={returnMutation.isPending}
            style={{ background: '#B8860B', borderColor: '#B8860B' }}>
            Process Return
          </Button>
        </Form>
      </Modal>

      <PageTour steps={tourSteps} />
    </div>
  );
}
