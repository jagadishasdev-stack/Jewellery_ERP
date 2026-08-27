/**
 * SalesBillDetail — the complete, single-screen view of one sale: every
 * real field GET /api/sales/:id already returns (sale header, line items,
 * payments), nothing fabricated. Used inside SalesBillHistoryPage's
 * detail Drawer. Pure display — no calculations happen here, every number
 * shown is exactly what's stored on the sale/item/payment rows.
 */
import React from 'react';
import { Table, Tag, Typography, Divider, Row, Col, Space } from 'antd';
import { UserOutlined, ShopOutlined, GoldOutlined, CreditCardOutlined, BarcodeOutlined } from '@ant-design/icons';
import { formatCurrency, formatWeight } from '../../utils/calculations';
import dayjs from 'dayjs';

const { Text } = Typography;

const Row2 = ({ label, value, strong, color, size = 12 }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', fontSize: size }}>
    <Text type="secondary" style={{ fontSize: size }}>{label}</Text>
    <Text strong={strong} style={{ fontSize: strong ? size + 1 : size, color }}>{value}</Text>
  </div>
);

const WeightChip = ({ label, value, color }) => (
  <div style={{
    flex: 1, minWidth: 100, textAlign: 'center', padding: '10px 8px',
    background: 'var(--ink-100)', borderRadius: 'var(--radius-md)',
  }}>
    <div className="caption">{label}</div>
    <div style={{ fontSize: 15, fontWeight: 700, color: color || 'var(--ink-900)' }}>{formatWeight(value)}</div>
  </div>
);

export default function SalesBillDetail({ detail, statusColor = {} }) {
  const { sale, items = [], payments = [] } = detail;

  const itemColumns = [
    {
      title: 'Item', fixed: 'left', width: 190,
      render: (_, r) => (
        <div>
          <Text strong style={{ fontSize: 12 }}>{r.Item_Type_Name}</Text>
          <div className="caption">
            <BarcodeOutlined /> {r.Article_Number}
            {r.HSN_Code && <> · HSN {r.HSN_Code}</>}
          </div>
          {r.HUID_Number && <Tag color="gold" style={{ fontSize: 9, marginTop: 2 }}>HUID: {r.HUID_Number}</Tag>}
        </div>
      ),
    },
    { title: 'Purity', dataIndex: 'Purity_Code', width: 70, render: (v) => v ? <Tag color="gold" style={{ fontSize: 10 }}>{v}</Tag> : '-' },
    {
      title: 'Weight', width: 130,
      render: (_, r) => (
        <div style={{ fontSize: 11 }}>
          <div>Gross: <b>{formatWeight(r.Gross_Weight)}</b></div>
          <div style={{ color: 'var(--ink-500)' }}>Net: {formatWeight(r.Net_Gold_Weight)}</div>
          {parseFloat(r.Stone_Weight || 0) > 0 && <div style={{ color: 'var(--ink-500)' }}>Stone: {formatWeight(r.Stone_Weight)}</div>}
        </div>
      ),
    },
    { title: 'Rate/g', dataIndex: 'Gold_Rate_Per_Gram', width: 90, render: (v) => formatCurrency(v) },
    { title: 'Making', dataIndex: 'Making_Charge_Applied', width: 90, render: (v) => formatCurrency(v) },
    {
      title: 'GST', width: 110,
      render: (_, r) => (
        <div style={{ fontSize: 11 }}>
          <div>{parseFloat(r.GST_Percentage_Applied || 0)}%</div>
          <div style={{ color: 'var(--ink-500)' }}>{formatCurrency(r.GST_Amount)}</div>
        </div>
      ),
    },
    { title: 'Amount', dataIndex: 'Total_Line_Price', width: 110, fixed: 'right', render: (v) => <Text strong style={{ color: 'var(--gold)' }}>{formatCurrency(v)}</Text> },
  ];

  const paymentColumns = [
    { title: 'Mode', dataIndex: 'Payment_Mode', render: (v) => <Tag>{v}</Tag> },
    { title: 'Reference', render: (_, r) => r.Reference || r.Cheque_Number || '-' },
    { title: 'Bank', dataIndex: 'Bank_Name', render: (v) => v || '-' },
    { title: 'Amount', dataIndex: 'Amount', align: 'right', render: (v) => <Text strong>{formatCurrency(v)}</Text> },
  ];

  // Interstate sales show IGST only; intrastate shows CGST+SGST — real
  // Is_Interstate flag already computed and stored at sale time, not
  // re-derived here.
  const gstRows = sale.Is_Interstate
    ? [{ label: `IGST`, value: sale.IGST_Amount }]
    : [{ label: 'CGST', value: sale.CGST_Amount }, { label: 'SGST', value: sale.SGST_Amount }];

  return (
    <div>
      {/* ── Header strip ─────────────────────────────────────────────── */}
      <div style={{ marginBottom: 16 }}>
        <Space size={8} wrap style={{ marginBottom: 6 }}>
          <Tag color={statusColor[sale.Payment_Status] || 'default'} style={{ fontSize: 11 }}>{sale.Payment_Status}</Tag>
          {sale.Sale_Type && <Tag style={{ fontSize: 11 }}>{sale.Sale_Type}</Tag>}
          {sale.Invoice_Type && <Tag color="blue" style={{ fontSize: 11 }}>{sale.Invoice_Type}</Tag>}
          {sale.Contains_Hidden_Stock === false && sale.PAN_Verified && <Tag color="green" style={{ fontSize: 11 }}>PAN Verified</Tag>}
        </Space>
        <div className="caption">{dayjs(sale.Sale_Date).format('DD-MMM-YYYY, hh:mm A')}</div>
      </div>

      {/* ── Customer + Sale info ─────────────────────────────────────── */}
      <Row gutter={12} style={{ marginBottom: 16 }}>
        <Col xs={24} md={12}>
          <div style={{ background: 'white', border: '1px solid var(--ink-100)', borderRadius: 'var(--radius-md)', padding: 14, height: '100%' }}>
            <div className="h4" style={{ marginBottom: 8 }}><UserOutlined style={{ color: 'var(--gold)', marginRight: 6 }} />Customer</div>
            <Row2 label="Name" value={sale.Customer_Name || 'Walk-in'} />
            {sale.Customer_Mobile && <Row2 label="Mobile" value={sale.Customer_Mobile} />}
            {sale.Customer_Email && <Row2 label="Email" value={sale.Customer_Email} />}
            {sale.PAN_Number && <Row2 label="PAN" value={sale.PAN_Number} />}
          </div>
        </Col>
        <Col xs={24} md={12}>
          <div style={{ background: 'white', border: '1px solid var(--ink-100)', borderRadius: 'var(--radius-md)', padding: 14, height: '100%', marginTop: 12 }}>
            <div className="h4" style={{ marginBottom: 8 }}><ShopOutlined style={{ color: 'var(--gold)', marginRight: 6 }} />Sale Info</div>
            <Row2 label="Counter" value={sale.Counter_Name || '-'} />
            <Row2 label="Billed By" value={sale.Operator_Name || '-'} />
            <Row2 label="Payment Mode" value={sale.Payment_Mode || '-'} />
            {sale.Payment_Reference && <Row2 label="Reference" value={sale.Payment_Reference} />}
          </div>
        </Col>
      </Row>

      {/* ── Weight summary ───────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <WeightChip label="Gross Weight" value={sale.Total_Gross_Weight} />
        <WeightChip label="Net Gold Weight" value={sale.Total_Net_Gold_Weight} color="var(--gold)" />
        <WeightChip label="Stone Weight" value={sale.Total_Stone_Weight} />
      </div>

      {/* ── Items ─────────────────────────────────────────────────────── */}
      <div className="h4" style={{ marginBottom: 8 }}><GoldOutlined style={{ color: 'var(--gold)', marginRight: 6 }} />Items ({items.length})</div>
      <Table
        className="erp-table"
        columns={itemColumns}
        dataSource={items}
        rowKey="Detail_ID"
        size="small"
        pagination={false}
        scroll={{ x: 'max-content' }}
        style={{ marginBottom: 20 }}
      />

      {/* ── Charges breakdown ─────────────────────────────────────────── */}
      <Row gutter={16}>
        <Col xs={24} md={12}>
          <div className="h4" style={{ marginBottom: 8 }}>Charges</div>
          <div style={{ background: 'white', border: '1px solid var(--ink-100)', borderRadius: 'var(--radius-md)', padding: '10px 14px' }}>
            <Row2 label="Subtotal" value={formatCurrency(sale.Subtotal_Amount)} />
            {parseFloat(sale.Discount_Amount || 0) > 0 && <Row2 label="Discount" value={`- ${formatCurrency(sale.Discount_Amount)}`} color="var(--danger)" />}
            {gstRows.map((g) => parseFloat(g.value || 0) > 0 && (
              <Row2 key={g.label} label={`${g.label} (${sale.GST_Percentage || 3}%)`} value={formatCurrency(g.value)} />
            ))}
            {parseFloat(sale.Round_Off_Amount || 0) !== 0 && <Row2 label="Round Off" value={formatCurrency(sale.Round_Off_Amount)} />}
          </div>
        </Col>
        <Col xs={24} md={12}>
          <div className="h4" style={{ marginBottom: 8, marginTop: 12 }}>Adjustments</div>
          <div style={{ background: 'white', border: '1px solid var(--ink-100)', borderRadius: 'var(--radius-md)', padding: '10px 14px', minHeight: 0 }}>
            {parseFloat(sale.Old_Gold_Exchange_Amount || 0) > 0 && <Row2 label={`Old Gold Exchange (${formatWeight(sale.Old_Gold_Weight)})`} value={`- ${formatCurrency(sale.Old_Gold_Exchange_Amount)}`} color="#fa8c16" />}
            {parseFloat(sale.Scheme_Adjustment_Amount || 0) > 0 && <Row2 label="Scheme Adjustment" value={`- ${formatCurrency(sale.Scheme_Adjustment_Amount)}`} color="#52c41a" />}
            {parseFloat(sale.Bonus_Adjustment_Amount || 0) > 0 && <Row2 label="Scheme Bonus" value={`- ${formatCurrency(sale.Bonus_Adjustment_Amount)}`} color="#722ed1" />}
            {parseFloat(sale.Voucher_Amount || 0) > 0 && <Row2 label="Gift Voucher" value={`- ${formatCurrency(sale.Voucher_Amount)}`} color="#722ed1" />}
            {parseInt(sale.Loyalty_Points_Used || 0, 10) > 0 && <Row2 label={`Loyalty Points Used (${sale.Loyalty_Points_Used})`} value="applied" color="#1890ff" />}
            {!(parseFloat(sale.Old_Gold_Exchange_Amount || 0) || parseFloat(sale.Scheme_Adjustment_Amount || 0) || parseFloat(sale.Bonus_Adjustment_Amount || 0) || parseFloat(sale.Voucher_Amount || 0) || parseInt(sale.Loyalty_Points_Used || 0, 10)) && (
              <Text type="secondary" style={{ fontSize: 12 }}>No adjustments on this bill.</Text>
            )}
          </div>
        </Col>
      </Row>

      {/* ── Net payable / paid / balance ─────────────────────────────── */}
      <div style={{ background: 'var(--gold-pale)', borderRadius: 'var(--radius-md)', padding: '14px 16px', marginTop: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text strong style={{ fontSize: 15 }}>NET PAYABLE</Text>
          <Text strong style={{ fontSize: 22, color: 'var(--gold)' }}>{formatCurrency(sale.Net_Payable_Amount)}</Text>
        </div>
        <Divider style={{ margin: '8px 0' }} />
        <Row2 label="Amount Paid" value={formatCurrency(sale.Amount_Paid)} />
        {parseFloat(sale.Balance_Amount || 0) > 0 && <Row2 label="Balance Due" value={formatCurrency(sale.Balance_Amount)} strong color="var(--danger)" />}
      </div>

      {/* ── Payments ──────────────────────────────────────────────────── */}
      {payments.length > 0 && (
        <>
          <div className="h4" style={{ margin: '20px 0 8px' }}><CreditCardOutlined style={{ color: 'var(--gold)', marginRight: 6 }} />Payments Received</div>
          <Table className="erp-table" columns={paymentColumns} dataSource={payments} rowKey="Payment_ID" size="small" pagination={false} />
        </>
      )}

      {sale.Notes && (
        <>
          <div className="h4" style={{ margin: '20px 0 8px' }}>Notes</div>
          <Text style={{ fontSize: 12 }}>{sale.Notes}</Text>
        </>
      )}
    </div>
  );
}
