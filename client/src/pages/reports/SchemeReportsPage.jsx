/**
 * Scheme Reports — Scheme Collection | App | Counter | Adjustment | Maturity
 */
import React, { useState, useRef } from 'react';
import {
  Row, Col, Card, Typography, DatePicker, Button, Space, Tag, Tabs,
  Table, Statistic, message,
} from 'antd';
import { DownloadOutlined, GoldOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { savingsApi, reportsApi } from '../../api/modules';
import { formatCurrency } from '../../utils/calculations';
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

export default function SchemeReportsPage() {
  const [dateRange, setDateRange] = useState([dayjs().startOf('month'), dayjs()]);
  const [activeTab, setActiveTab] = useState('collection');

  // ── Walkthrough tour refs ───────────────────────────────────────────────────
  const dateRangeRef = useRef(null);
  const tabsRef = useRef(null);
  const tourSteps = [
    { title: '1. Choose Period', description: 'Pick the date range for scheme collections and adjustments made in that period.', target: () => dateRangeRef.current },
    { title: '2. The 6 Scheme Reports', description: 'Scheme Collection: daily instalments collected, by mode and source. App Collection: App vs Counter payment split. Scheme Adjustments: bills where a member used their scheme balance to pay. Old Gold Adjustments: bills where a customer exchanged old gold. Combined Adjustments: all three side by side per bill. Maturity: members whose scheme has matured — this tab is always up to date and does not use the date filter above.', target: () => tabsRef.current },
    { title: '3. Export Anytime', description: 'Every tab has a CSV button in its card header to download that specific report.' },
  ];

  const fromDate = dateRange[0].format('YYYY-MM-DD');
  const toDate = dateRange[1].format('YYYY-MM-DD');

  const { data: collectionReport, isLoading } = useQuery({
    queryKey: ['scheme-collection-report', fromDate, toDate],
    queryFn: () => savingsApi.reportCollection({ fromDate, toDate }).then(r => r.data.data || {}),
  });
  const { data: maturityReport } = useQuery({
    queryKey: ['scheme-maturity-report'],
    queryFn: () => savingsApi.reportMaturityDue({}).then(r => r.data.data || {}),
    enabled: activeTab === 'maturity',
  });
  const { data: adjustmentData } = useQuery({
    queryKey: ['scheme-adj-report', fromDate, toDate],
    queryFn: () => reportsApi.schemeAdjustments({ fromDate, toDate }).then(r => r.data.data || []),
    enabled: activeTab === 'adjustment',
  });
  const { data: oldGoldData } = useQuery({
    queryKey: ['old-gold-adj-report', fromDate, toDate],
    queryFn: () => reportsApi.oldGoldAdjustments({ fromDate, toDate }).then(r => r.data.data || { items: [], totalValue: 0 }),
    enabled: activeTab === 'oldgold',
  });
  const { data: combinedData } = useQuery({
    queryKey: ['combined-adj-report', fromDate, toDate],
    queryFn: () => reportsApi.combinedAdjustments({ fromDate, toDate }).then(r => r.data.data || { items: [], totals: {} }),
    enabled: activeTab === 'combined',
  });

  const s = collectionReport?.summary || {};
  const byMode = collectionReport?.byMode || [];
  const bySource = collectionReport?.bySource || [];
  const daily = collectionReport?.daily || [];

  const appCollections = (collectionReport?.bySource || []).find(s => s.Collection_Source === 'App');
  const counterCollections = (collectionReport?.bySource || []).find(s => s.Collection_Source === 'Counter');

  const collectionCols = [
    { title: 'Date', dataIndex: 'date', render: v => dayjs(v).format('DD-MMM-YYYY') },
    { title: 'Collections', dataIndex: 'count', width: 100, render: v => <Tag color="blue">{v}</Tag> },
    { title: 'Amount', dataIndex: 'total', render: v => <Text strong style={{color:'#52c41a'}}>{formatCurrency(v)}</Text> },
  ];

  const modeCols = [
    { title: 'Payment Mode', dataIndex: 'Payment_Mode', render: v => <Tag color="blue">{v}</Tag> },
    { title: 'Count', dataIndex: 'count', width: 80 },
    { title: 'Total Amount', dataIndex: 'total', render: v => <Text strong style={{color:'#B8860B'}}>{formatCurrency(v)}</Text> },
  ];

  const maturityCols = [
    { title: 'Member No', dataIndex: 'Member_Number', render: v => <Text code style={{fontSize:11}}>{v}</Text> },
    { title: 'Name', dataIndex: 'Member_Name', render: v => <Text strong>{v}</Text> },
    { title: 'Mobile', dataIndex: 'Mobile' },
    { title: 'Scheme', dataIndex: 'Scheme_Name' },
    { title: 'Group', dataIndex: 'Group_Name' },
    { title: 'Maturity Date', dataIndex: 'Maturity_Date', render: v => dayjs(v).format('DD-MMM-YYYY') },
    { title: 'Maturity Value', dataIndex: 'Maturity_Value', render: v => <Text strong style={{color:'#52c41a'}}>{formatCurrency(v)}</Text> },
    { title: 'Status', dataIndex: 'Status', render: v => <Tag color={v==='Matured'?'gold':v==='Active'?'green':'red'}>{v}</Tag> },
  ];

  const adjCols = [
    { title: 'Invoice No', dataIndex: 'Invoice_Number', render: v => <Text code style={{fontSize:11}}>{v}</Text> },
    { title: 'Date', dataIndex: 'Sale_Date', render: v => dayjs(v).format('DD-MMM-YYYY') },
    { title: 'Customer', dataIndex: 'Customer_Name' },
    { title: 'Members', dataIndex: 'memberAdjustments', render: v => (v||[]).map(m => <Tag key={m.Member_ID} style={{fontSize:10}}>{m.Member_Number}</Tag>) },
    { title: 'Bill Amount', dataIndex: 'Net_Payable_Amount', render: v => formatCurrency(v) },
    { title: 'Scheme Adjusted', dataIndex: 'Scheme_Adjustment_Amount', render: v => <Text strong style={{color:'#fa8c16'}}>{formatCurrency(v)}</Text> },
    { title: 'Bonus Adjusted', dataIndex: 'Bonus_Adjustment_Amount', render: v => <Text strong style={{color:'#722ed1'}}>{formatCurrency(v)}</Text> },
  ];

  const oldGoldCols = [
    { title: 'Voucher No', dataIndex: 'Voucher_Number', render: v => <Text code style={{fontSize:11}}>{v}</Text> },
    { title: 'Invoice No', dataIndex: 'Invoice_Number', render: v => <Text code style={{fontSize:11}}>{v}</Text> },
    { title: 'Date', dataIndex: 'Sale_Date', render: v => dayjs(v).format('DD-MMM-YYYY') },
    { title: 'Customer', dataIndex: 'Customer_Name' },
    { title: 'Weight (g)', dataIndex: 'Old_Gold_Weight' },
    { title: 'Purity %', dataIndex: 'Purity_Percentage' },
    { title: 'Rate/g', dataIndex: 'Gold_Rate_At_Exchange', render: v => formatCurrency(v) },
    { title: 'Exchange Value', dataIndex: 'Total_Value', render: v => <Text strong style={{color:'#fa8c16'}}>{formatCurrency(v)}</Text> },
  ];

  const combinedCols = [
    { title: 'Invoice No', dataIndex: 'Invoice_Number', render: v => <Text code style={{fontSize:11}}>{v}</Text> },
    { title: 'Date', dataIndex: 'Sale_Date', render: v => dayjs(v).format('DD-MMM-YYYY') },
    { title: 'Customer', dataIndex: 'Customer_Name' },
    { title: 'Old Gold', dataIndex: 'Old_Gold_Exchange_Amount', render: v => parseFloat(v) > 0 ? formatCurrency(v) : '—' },
    { title: 'Scheme', dataIndex: 'Scheme_Adjustment_Amount', render: v => parseFloat(v) > 0 ? formatCurrency(v) : '—' },
    { title: 'Bonus', dataIndex: 'Bonus_Adjustment_Amount', render: v => parseFloat(v) > 0 ? formatCurrency(v) : '—' },
    { title: 'Final Payable', dataIndex: 'Net_Payable_Amount', render: v => <Text strong style={{color:'#B8860B'}}>{formatCurrency(v)}</Text> },
    { title: 'Status', dataIndex: 'Payment_Status', render: v => <Tag color={v==='Paid'?'green':'orange'}>{v}</Tag> },
  ];

  const tabItems = [
    {
      key: 'collection', label: <span>💰 Scheme Collection</span>,
      children: (
        <>
          <Row gutter={[10,10]} style={{marginBottom:14}}>
            {[
              {title:'Total Collections',value:parseInt(s.total_count||0),color:'#B8860B'},
              {title:'Total Amount',value:parseFloat(s.total_amount||0),color:'#52c41a',fmt:formatCurrency},
              {title:'Penalty Collected',value:parseFloat(s.total_penalty||0),color:'#fa8c16',fmt:formatCurrency},
              {title:'Net Amount',value:parseFloat(s.total_amount||0)+parseFloat(s.total_penalty||0),color:'#1890ff',fmt:formatCurrency},
            ].map((c,i)=>(
              <Col xs={12} md={6} key={i}>
                <Card bodyStyle={{padding:'12px 14px'}} style={{borderRadius:8,border:'none',boxShadow:'0 1px 4px rgba(0,0,0,.07)',borderTop:`3px solid ${c.color}`}}>
                  <Statistic title={<Text style={{fontSize:11,color:'#888'}}>{c.title}</Text>}
                    value={c.value} formatter={c.fmt?v=>c.fmt(v):undefined}
                    valueStyle={{color:c.color,fontSize:17,fontWeight:700}} />
                </Card>
              </Col>
            ))}
          </Row>
          <Row gutter={[14,14]}>
            <Col xs={24} lg={14}>
              <Card title="Daily Collection Trend" bodyStyle={{padding:0}} style={{borderRadius:8}}
                extra={<Button size="small" icon={<DownloadOutlined />} onClick={()=>exportCSV(daily,'scheme_collection_daily')}>CSV</Button>}>
                <Table
            scroll={{ x: "max-content" }} columns={collectionCols} dataSource={daily} rowKey="date" size="small" loading={isLoading} pagination={{pageSize:15}} />
              </Card>
            </Col>
            <Col xs={24} lg={10}>
              <Card title="By Payment Mode" bodyStyle={{padding:0}} style={{borderRadius:8,marginBottom:12}}>
                <Table
            scroll={{ x: "max-content" }} columns={modeCols} dataSource={byMode} rowKey="Payment_Mode" size="small" pagination={false} />
              </Card>
              <Card title="By Collection Source" bodyStyle={{padding:0}} style={{borderRadius:8}}>
                <Table
            scroll={{ x: "max-content" }} columns={[
                  {title:'Source',dataIndex:'Collection_Source',render:v=><Tag color={v==='App'?'purple':'blue'}>{v}</Tag>},
                  {title:'Count',dataIndex:'count',width:80},
                  {title:'Total',dataIndex:'total',render:v=>formatCurrency(v)},
                ]} dataSource={bySource} rowKey="Collection_Source" size="small" pagination={false} />
              </Card>
            </Col>
          </Row>
        </>
      ),
    },
    {
      key: 'app', label: <span>📱 App Collection</span>,
      children: (
        <Row gutter={[14,14]}>
          <Col xs={24} md={8}>
            <Card title="App vs Counter Split" style={{borderRadius:8}}>
              <Statistic title="App Collections" value={parseFloat(appCollections?.total||0)} formatter={v=>formatCurrency(v)} valueStyle={{color:'#722ed1',fontSize:20,fontWeight:700}} />
              <Statistic title="Counter Collections" value={parseFloat(counterCollections?.total||0)} formatter={v=>formatCurrency(v)} valueStyle={{color:'#B8860B',fontSize:20,fontWeight:700}} style={{marginTop:12}} />
            </Card>
          </Col>
          <Col xs={24} md={16}>
            <Card title="Collection by Source Detail" bodyStyle={{padding:0}} style={{borderRadius:8}}>
              <Table
            scroll={{ x: "max-content" }} columns={[
                {title:'Source',dataIndex:'Collection_Source',render:v=><Tag color={v==='App'?'purple':'blue'}>{v}</Tag>},
                {title:'Count',dataIndex:'count'},
                {title:'Total Amount',dataIndex:'total',render:v=>formatCurrency(v)},
              ]} dataSource={bySource} rowKey="Collection_Source" size="small" pagination={false} />
            </Card>
          </Col>
        </Row>
      ),
    },
    {
      key: 'adjustment', label: <span>🔄 Scheme Adjustments</span>,
      children: (
        <Card title="Scheme Adjustments in Sales Bills" bodyStyle={{padding:0}} style={{borderRadius:8}}
          extra={<Button size="small" icon={<DownloadOutlined />} onClick={()=>exportCSV(adjustmentData||[],'scheme_adjustments')}>CSV</Button>}>
          <Table
            scroll={{ x: "max-content" }} columns={adjCols} dataSource={adjustmentData||[]} rowKey="Sale_ID" size="small" pagination={{pageSize:20}} />
        </Card>
      ),
    },
    {
      key: 'oldgold', label: <span>🟡 Old Gold Adjustments</span>,
      children: (
        <>
          <Row gutter={[10,10]} style={{marginBottom:14}}>
            <Col xs={12} md={6}>
              <Card bodyStyle={{padding:'12px 14px'}} style={{borderRadius:8,border:'none',boxShadow:'0 1px 4px rgba(0,0,0,.07)',borderTop:'3px solid #fa8c16'}}>
                <Statistic title={<Text style={{fontSize:11,color:'#888'}}>Total Exchange Value</Text>}
                  value={parseFloat(oldGoldData?.totalValue||0)} formatter={v=>formatCurrency(v)}
                  valueStyle={{color:'#fa8c16',fontSize:17,fontWeight:700}} />
              </Card>
            </Col>
          </Row>
          <Card title="Old Gold Exchanges Applied to Bills" bodyStyle={{padding:0}} style={{borderRadius:8}}
            extra={<Button size="small" icon={<DownloadOutlined />} onClick={()=>exportCSV(oldGoldData?.items||[],'old_gold_adjustments')}>CSV</Button>}>
            <Table
            scroll={{ x: "max-content" }} columns={oldGoldCols} dataSource={oldGoldData?.items||[]} rowKey="Exchange_ID" size="small" pagination={{pageSize:20}} />
          </Card>
        </>
      ),
    },
    {
      key: 'combined', label: <span>🧾 Combined Adjustments</span>,
      children: (
        <>
          <Row gutter={[10,10]} style={{marginBottom:14}}>
            {[
              {title:'Old Gold',value:parseFloat(combinedData?.totals?.oldGold||0),color:'#fa8c16'},
              {title:'Scheme',value:parseFloat(combinedData?.totals?.scheme||0),color:'#52c41a'},
              {title:'Bonus',value:parseFloat(combinedData?.totals?.bonus||0),color:'#722ed1'},
              {title:'Net Payable Total',value:parseFloat(combinedData?.totals?.netPayable||0),color:'#B8860B'},
            ].map((c,i)=>(
              <Col xs={12} md={6} key={i}>
                <Card bodyStyle={{padding:'12px 14px'}} style={{borderRadius:8,border:'none',boxShadow:'0 1px 4px rgba(0,0,0,.07)',borderTop:`3px solid ${c.color}`}}>
                  <Statistic title={<Text style={{fontSize:11,color:'#888'}}>{c.title}</Text>}
                    value={c.value} formatter={v=>formatCurrency(v)}
                    valueStyle={{color:c.color,fontSize:17,fontWeight:700}} />
                </Card>
              </Col>
            ))}
          </Row>
          <Card title="Invoice / Old Gold / Scheme / Bonus / Final Payable" bodyStyle={{padding:0}} style={{borderRadius:8}}
            extra={<Button size="small" icon={<DownloadOutlined />} onClick={()=>exportCSV(combinedData?.items||[],'combined_adjustments')}>CSV</Button>}>
            <Table
            scroll={{ x: "max-content" }} columns={combinedCols} dataSource={combinedData?.items||[]} rowKey="Sale_ID" size="small" pagination={{pageSize:20}} />
          </Card>
        </>
      ),
    },
    {
      key: 'maturity', label: <span>✅ Scheme Maturity</span>,
      children: (
        <>
          <Row gutter={[10,10]} style={{marginBottom:14}}>
            {[
              {title:'Members Due',value:parseInt(maturityReport?.total||0),color:'#B8860B'},
              {title:'Total Maturity Value',value:parseFloat(maturityReport?.total_value||0),color:'#52c41a',fmt:formatCurrency},
            ].map((c,i)=>(
              <Col xs={12} key={i}>
                <Card bodyStyle={{padding:'12px 14px'}} style={{borderRadius:8,border:'none',boxShadow:'0 1px 4px rgba(0,0,0,.07)',borderTop:`3px solid ${c.color}`}}>
                  <Statistic title={<Text style={{fontSize:11,color:'#888'}}>{c.title}</Text>}
                    value={c.value} formatter={c.fmt?v=>c.fmt(v):undefined}
                    valueStyle={{color:c.color,fontSize:17,fontWeight:700}} />
                </Card>
              </Col>
            ))}
          </Row>
          <Card title="Maturity Due Members" bodyStyle={{padding:0}} style={{borderRadius:8}}
            extra={<Button size="small" icon={<DownloadOutlined />} onClick={()=>exportCSV(maturityReport?.members||[],'scheme_maturity')}>CSV</Button>}>
            <Table
            scroll={{ x: "max-content" }} columns={maturityCols} dataSource={maturityReport?.members||[]} rowKey="Member_ID" size="small" pagination={{pageSize:20}} />
          </Card>
        </>
      ),
    },
  ];

  return (
    <div className="page-wrapper">
      <div className="page-header">
        <Title level={4} style={{margin:0}}><GoldOutlined style={{color:'#fa8c16',marginRight:8}} />Scheme Reports</Title>
        <div ref={dateRangeRef}>
        <RangePicker value={dateRange} onChange={d=>d&&setDateRange(d)} format="DD-MMM-YYYY" />
        </div>
      </div>
      <div ref={tabsRef}>
      <Tabs activeKey={activeTab} onChange={setActiveTab} type="card" items={tabItems} />
      </div>

      <PageTour steps={tourSteps} />
    </div>
  );
}
