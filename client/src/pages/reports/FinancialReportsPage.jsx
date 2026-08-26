/**
 * Financial Reports — Cash Book | Bank Book | Day Book | Ledger | P&L | Balance Sheet
 */
import React, { useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  Row, Col, Card, Typography, DatePicker, Button, Space, Tag, Tabs,
  Table, Statistic, Divider, Alert,
} from 'antd';
import { DownloadOutlined, PrinterOutlined, BankOutlined, BookOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { reportsApi } from '../../api/modules';
import { formatCurrency } from '../../utils/calculations';
import { message } from 'antd';
import PageTour from '../../components/PageTour';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

const exportCSV = (data, filename) => {
  if (!data?.length) { message.warning('No data.'); return; }
  const csv = [Object.keys(data[0]).join(','), ...data.map(r=>Object.values(r).map(v=>`"${v??''}"`).join(','))].join('\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv],{type:'text/csv'}));
  a.download = `${filename}_${dayjs().format('YYYYMMDD')}.csv`; a.click();
};

export default function FinancialReportsPage() {
  const [dateRange, setDateRange] = useState([dayjs().startOf('month'), dayjs()]);
  const [activeTab, setActiveTab] = useState('cashbook');

  // ── Walkthrough tour refs ───────────────────────────────────────────────────
  const dateRangeRef = useRef(null);
  const tabsRef = useRef(null);
  const tourSteps = [
    { title: '1. Choose Period', description: 'Pick the date range to report on — presets for This Month, Last Month, and This Year are one click away.', target: () => dateRangeRef.current },
    { title: '2. Account Posting — Automatic', description: 'You never post journal entries by hand here. Every sale in POS, purchase in Purchase/Bin, payment in Day Close, and karigar transaction automatically posts into these books the moment it happens.' },
    { title: '3. The 6 Books', description: 'Cash Book & Bank Book: every rupee in/out. Day Book: all transactions for the day in one list. Ledger: account-wise debit/credit entries. P&L: profit & loss for the period. Balance Sheet: assets vs liabilities snapshot. Each tab has CSV export and Print in its header.', target: () => tabsRef.current },
  ];

  const fromDate = dateRange[0].format('YYYY-MM-DD');
  const toDate = dateRange[1].format('YYYY-MM-DD');

  const { data: financialData, isLoading } = useQuery({
    queryKey: ['financial-reports', fromDate, toDate],
    queryFn: () => reportsApi.financial({ fromDate, toDate }).then(r => r.data.data || {}),
  });

  const cashBook = financialData?.cashBook || [];
  const bankBook = financialData?.bankBook || [];
  const dayBook = financialData?.dayBook || [];
  const ledger = financialData?.ledger || [];
  const pnl = financialData?.pnl || {};
  const balanceSheet = financialData?.balanceSheet || {};

  const cashCols = [
    { title: 'Date', dataIndex: 'date', render: v => dayjs(v).format('DD-MMM-YYYY') },
    { title: 'Particulars', dataIndex: 'particulars' },
    { title: 'Ref / Invoice', dataIndex: 'reference', render: v => v ? <Text code style={{fontSize:11}}>{v}</Text> : '-' },
    { title: 'Debit (In)', dataIndex: 'debit', render: v => parseFloat(v||0) > 0 ? <Text style={{color:'#52c41a',fontWeight:600}}>{formatCurrency(v)}</Text> : '-' },
    { title: 'Credit (Out)', dataIndex: 'credit', render: v => parseFloat(v||0) > 0 ? <Text style={{color:'#ff4d4f',fontWeight:600}}>{formatCurrency(v)}</Text> : '-' },
    { title: 'Balance', dataIndex: 'balance', render: v => <Text strong style={{color:'#B8860B'}}>{formatCurrency(v)}</Text> },
  ];

  const dayBookCols = [
    { title: 'Date', dataIndex: 'date', render: v => dayjs(v).format('DD-MMM-YYYY') },
    { title: 'Transaction', dataIndex: 'particulars' },
    { title: 'Type', dataIndex: 'type', render: v => <Tag color={v==='Sale'?'green':v==='Purchase'?'red':v==='Receipt'?'blue':'default'}>{v}</Tag> },
    { title: 'Amount', dataIndex: 'amount', render: v => <Text strong style={{color:'#B8860B'}}>{formatCurrency(v)}</Text> },
    { title: 'Mode', dataIndex: 'mode', render: v => <Tag color="blue">{v||'-'}</Tag> },
  ];

  const ledgerCols = [
    { title: 'Date', dataIndex: 'date', render: v => dayjs(v).format('DD-MMM-YYYY') },
    { title: 'Ledger Account', dataIndex: 'account', render: v => <Text strong>{v}</Text> },
    { title: 'Particulars', dataIndex: 'particulars' },
    { title: 'Debit', dataIndex: 'debit', render: v => parseFloat(v||0)>0 ? <Text style={{color:'#ff4d4f'}}>{formatCurrency(v)}</Text> : '-' },
    { title: 'Credit', dataIndex: 'credit', render: v => parseFloat(v||0)>0 ? <Text style={{color:'#52c41a'}}>{formatCurrency(v)}</Text> : '-' },
    { title: 'Balance', dataIndex: 'balance', render: v => formatCurrency(v||0) },
  ];

  const tabItems = [
    {
      key: 'cashbook', label: <span>💵 Cash Book</span>,
      children: (
        <Card title={`Cash Book — ${dateRange[0].format('DD-MMM-YYYY')} to ${dateRange[1].format('DD-MMM-YYYY')}`}
          bodyStyle={{padding:0}} style={{borderRadius:8}}
          extra={<Space><Button size="small" icon={<DownloadOutlined />} onClick={()=>exportCSV(cashBook,'cash_book')}>CSV</Button>
            <Button size="small" icon={<PrinterOutlined />} onClick={()=>window.print()}>Print</Button></Space>}>
          <Table
            scroll={{ x: "max-content" }} columns={cashCols} dataSource={cashBook} rowKey={(r,i)=>i} size="small" loading={isLoading} pagination={{pageSize:20}}
            summary={() => {
              const totalIn = cashBook.reduce((s,r)=>s+parseFloat(r.debit||0),0);
              const totalOut = cashBook.reduce((s,r)=>s+parseFloat(r.credit||0),0);
              return <Table.Summary.Row
            scroll={{ x: "max-content" }} style={{background:'#FFF8E1'}}>
                <Table.Summary.Cell
            scroll={{ x: "max-content" }} colSpan={3}><Text strong>TOTAL</Text></Table.Summary.Cell>
                <Table.Summary.Cell><Text strong style={{color:'#52c41a'}}>{formatCurrency(totalIn)}</Text></Table.Summary.Cell>
                <Table.Summary.Cell><Text strong style={{color:'#ff4d4f'}}>{formatCurrency(totalOut)}</Text></Table.Summary.Cell>
                <Table.Summary.Cell><Text strong style={{color:'#B8860B'}}>{formatCurrency(totalIn-totalOut)}</Text></Table.Summary.Cell>
              </Table.Summary.Row>;
            }} />
        </Card>
      ),
    },
    {
      key: 'bankbook', label: <span>🏦 Bank Book</span>,
      children: (
        <Card title="Bank Book" bodyStyle={{padding:0}} style={{borderRadius:8}}
          extra={<Button size="small" icon={<DownloadOutlined />} onClick={()=>exportCSV(bankBook,'bank_book')}>CSV</Button>}>
          <Table
            scroll={{ x: "max-content" }} columns={cashCols} dataSource={bankBook} rowKey={(r,i)=>i} size="small" loading={isLoading} pagination={{pageSize:20}} />
        </Card>
      ),
    },
    {
      key: 'daybook', label: <span>📖 Day Book</span>,
      children: (
        <Card title="Day Book — All Transactions" bodyStyle={{padding:0}} style={{borderRadius:8}}
          extra={<Button size="small" icon={<DownloadOutlined />} onClick={()=>exportCSV(dayBook,'day_book')}>CSV</Button>}>
          <Table
            scroll={{ x: "max-content" }} columns={dayBookCols} dataSource={dayBook} rowKey={(r,i)=>i} size="small" loading={isLoading} pagination={{pageSize:25}} />
        </Card>
      ),
    },
    {
      key: 'ledger', label: <span>📋 Ledger</span>,
      children: (
        <Card title="Ledger Report" bodyStyle={{padding:0}} style={{borderRadius:8}}
          extra={<Button size="small" icon={<DownloadOutlined />} onClick={()=>exportCSV(ledger,'ledger')}>CSV</Button>}>
          <Table
            scroll={{ x: "max-content" }} columns={ledgerCols} dataSource={ledger} rowKey={(r,i)=>i} size="small" loading={isLoading} pagination={{pageSize:25}} />
        </Card>
      ),
    },
    {
      key: 'pnl', label: <span>📈 P&L</span>,
      children: (
        <Row gutter={[16,16]}>
          <Col xs={24} md={12}>
            <Card title="Profit & Loss Statement" style={{borderRadius:8}}>
              <div style={{fontSize:13}}>
                {[
                  {label:'Sales Revenue',val:parseFloat(pnl.total_sales||0),color:'#52c41a',bold:true},
                  {label:'Less: Purchase Cost',val:parseFloat(pnl.total_purchases||0),color:'#ff4d4f'},
                  {label:'Less: Making/Labour',val:parseFloat(pnl.total_making||0),color:'#ff4d4f'},
                  {label:'Less: GST Payable',val:parseFloat(pnl.total_gst||0),color:'#ff4d4f'},
                  {label:'Less: Discounts Given',val:parseFloat(pnl.total_discounts||0),color:'#ff4d4f'},
                  {label:'Gross Profit',val:parseFloat(pnl.gross_profit||0),color:'#B8860B',bold:true,divider:true},
                  {label:'Less: Operating Expenses',val:parseFloat(pnl.operating_expenses||0),color:'#ff4d4f'},
                  {label:'NET PROFIT / LOSS',val:parseFloat(pnl.net_profit||0),color:parseFloat(pnl.net_profit||0)>=0?'#52c41a':'#ff4d4f',bold:true,divider:true},
                ].map((r,i)=>(
                  <div key={i}>
                    {r.divider && <Divider style={{margin:'6px 0'}} />}
                    <div style={{display:'flex',justifyContent:'space-between',padding:'5px 0'}}>
                      <Text style={{color:r.bold?'#333':'#666',fontWeight:r.bold?700:400}}>{r.label}</Text>
                      <Text style={{color:r.color,fontWeight:r.bold?700:500}}>{formatCurrency(r.val)}</Text>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </Col>
          <Col xs={24} md={12}>
            <Card title="Key Metrics" style={{borderRadius:8}}>
              <Row gutter={[10,10]}>
                {[
                  {title:'Gross Margin',value:pnl.total_sales>0?((pnl.gross_profit/pnl.total_sales)*100).toFixed(1)+'%':'0%',color:'#52c41a'},
                  {title:'Net Margin',value:pnl.total_sales>0?((pnl.net_profit/pnl.total_sales)*100).toFixed(1)+'%':'0%',color:'#B8860B'},
                  {title:'Total Sales',value:parseFloat(pnl.total_sales||0),color:'#1890ff',fmt:formatCurrency},
                  {title:'Total Purchases',value:parseFloat(pnl.total_purchases||0),color:'#fa8c16',fmt:formatCurrency},
                ].map((m,i)=>(
                  <Col xs={12} key={i}>
                    <Card bodyStyle={{padding:'10px 12px'}} style={{borderRadius:6,border:'none',background:'#fafafa'}}>
                      <Statistic title={<Text style={{fontSize:11,color:'#888'}}>{m.title}</Text>}
                        value={m.value} formatter={m.fmt?v=>m.fmt(v):()=>m.value}
                        valueStyle={{color:m.color,fontSize:16,fontWeight:700}} />
                    </Card>
                  </Col>
                ))}
              </Row>
              <Alert message="Note: This is a preliminary P&L. Consult your CA for formal accounting." type="info" showIcon style={{marginTop:12,fontSize:11}} />
            </Card>
          </Col>
        </Row>
      ),
    },
    {
      key: 'balance', label: <span>⚖️ Balance Sheet</span>,
      children: (
        <Row gutter={[16,16]}>
          <Col xs={24} md={12}>
            <Card title="Assets" style={{borderRadius:8}}>
              {[
                {label:'Cash in Hand',val:parseFloat(balanceSheet.cash||0)},
                {label:'Bank Balance',val:parseFloat(balanceSheet.bank||0)},
                {label:'Stock / Inventory (MRP)',val:parseFloat(balanceSheet.stock_value||0)},
                {label:'Customer Outstanding',val:parseFloat(balanceSheet.receivables||0)},
                {label:'Advance Given',val:parseFloat(balanceSheet.advance_given||0)},
              ].map((r,i)=>(
                <div key={i} style={{display:'flex',justifyContent:'space-between',padding:'6px 0',borderBottom:'1px solid #f5f5f5'}}>
                  <Text style={{color:'#666'}}>{r.label}</Text>
                  <Text strong style={{color:'#1890ff'}}>{formatCurrency(r.val)}</Text>
                </div>
              ))}
              <Divider style={{margin:'8px 0'}} />
              <div style={{display:'flex',justifyContent:'space-between'}}>
                <Text strong>TOTAL ASSETS</Text>
                {/* Was: summed ALL 10 balance-sheet fields (assets AND
                    liabilities AND capital together) and divided by 2 —
                    an arithmetic trick with no guaranteed correctness.
                    The backend now computes and sends the real total
                    directly (see reports.js's /financial route). */}
                <Text strong style={{color:'#52c41a',fontSize:14}}>
                  {formatCurrency(parseFloat(balanceSheet.total_assets||0))}
                </Text>
              </div>
            </Card>
          </Col>
          <Col xs={24} md={12}>
            <Card title="Liabilities & Capital" style={{borderRadius:8}}>
              {[
                {label:'Supplier Outstanding',val:parseFloat(balanceSheet.payables||0)},
                {label:'Customer Advances Received',val:parseFloat(balanceSheet.advance_received||0)},
                {label:'Scheme Liabilities',val:parseFloat(balanceSheet.scheme_liabilities||0)},
                {label:'GST Payable',val:parseFloat(balanceSheet.gst_payable||0)},
                {label:'Capital / Profit',val:parseFloat(balanceSheet.capital||0)},
              ].map((r,i)=>(
                <div key={i} style={{display:'flex',justifyContent:'space-between',padding:'6px 0',borderBottom:'1px solid #f5f5f5'}}>
                  <Text style={{color:'#666'}}>{r.label}</Text>
                  <Text strong style={{color:'#ff4d4f'}}>{formatCurrency(r.val)}</Text>
                </div>
              ))}
              <Divider style={{margin:'8px 0'}} />
              <div style={{display:'flex',justifyContent:'space-between'}}>
                <Text strong>TOTAL LIABILITIES & CAPITAL</Text>
                <Text strong style={{color:'#ff4d4f',fontSize:14}}>
                  {formatCurrency(parseFloat(balanceSheet.total_liabilities_and_capital||0))}
                </Text>
              </div>
              <Alert message="Stock is valued at MRP, not cost — the two sides of this sheet are not expected to balance to the paisa. Use Accounting → Balance Sheet for the audited, cost-based figure." type="warning" showIcon style={{marginTop:12,fontSize:11}} />
            </Card>
          </Col>
        </Row>
      ),
    },
  ];

  return (
    <div className="page-wrapper">
      <div className="page-header">
        <Title level={4} style={{margin:0}}><BankOutlined style={{color:'#1890ff',marginRight:8}} />Financial Reports</Title>
        <div ref={dateRangeRef}>
        <Space>
          <RangePicker value={dateRange} onChange={d=>d&&setDateRange(d)} format="DD-MMM-YYYY"
            presets={[{label:'This Month',value:[dayjs().startOf('month'),dayjs()]},{label:'Last Month',value:[dayjs().subtract(1,'month').startOf('month'),dayjs().subtract(1,'month').endOf('month')]},{label:'This Year',value:[dayjs().startOf('year'),dayjs()]}]} />
          <Button icon={<PrinterOutlined />} onClick={()=>window.print()}>Print</Button>
        </Space>
        </div>
      </div>
      <Alert
        type="info" showIcon closable style={{ marginBottom: 12, borderRadius: 8 }}
        message="A dedicated Accounting section now exists (Chart of Accounts, Ledger, Trial Balance, Cash/Bank Book per real account, P&L, Balance Sheet, Vouchers)"
        description={<>It supports per-branch opening balances and per-bank books that this all-in-one view doesn't. This page still works and its numbers are correct — <Link to="/accounting">open Accounting</Link> for the fuller version.</>}
      />
      <div ref={tabsRef}>
      <Tabs activeKey={activeTab} onChange={setActiveTab} type="card" items={tabItems} />
      </div>

      <PageTour steps={tourSteps} />
    </div>
  );
}
