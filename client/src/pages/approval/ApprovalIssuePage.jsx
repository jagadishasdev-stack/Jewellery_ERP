import React, { useState, useRef } from 'react';
import {
  Row, Col, Card, Typography, Select, Input, Button, Table, Space, Tag,
  DatePicker, Modal, Form, message, Empty,
} from 'antd';
import { PlusOutlined, SearchOutlined, DeleteOutlined, TagOutlined, PrinterOutlined, CheckCircleFilled } from '@ant-design/icons';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { approvalApi } from '../../api/modules';
import { formatCurrency, formatWeight } from '../../utils/calculations';
import { printTaggedIssueVoucher } from '../../utils/approvalVoucherPrint';
import ApprovalNavTabs from './ApprovalNavTabs';
import PageTour from '../../components/PageTour';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { Option } = Select;

export default function ApprovalIssuePage() {
  const navigate = useNavigate();
  const [partyId, setPartyId] = useState(null);

  // ── Walkthrough tour refs ───────────────────────────────────────────────────
  const partyRef = useRef(null);
  const searchCardRef = useRef(null);
  const itemsCardRef = useRef(null);
  const submitRef = useRef(null);
  const tourSteps = [
    { title: '1. Select the Party', description: 'Choose the customer or dealer you\'re handing these items to "on approval" — search by name, or add a new party if they\'re not in the list yet.', target: () => partyRef.current },
    { title: '2. Search & Add Items', description: 'Search for tagged items by barcode, article number or design, then click Add to move each one into today\'s issue list.', target: () => searchCardRef.current },
    { title: '3. Items to Issue', description: 'Everything you\'ve added shows here with its weight and value. Remove anything added by mistake with the trash icon.', target: () => itemsCardRef.current },
    { title: '4. Create the Issue', description: 'When ready, click here to generate the approval voucher. The items leave the shop "on approval" and stay tracked against this voucher until the customer buys them or you receive them back.', target: () => submitRef.current },
  ];
  const [partySearch, setPartySearch] = useState('');
  const [addPartyOpen, setAddPartyOpen] = useState(false);
  const [partyForm] = Form.useForm();

  const [issueDate, setIssueDate] = useState(dayjs());
  const [expectedReturnDate, setExpectedReturnDate] = useState(null);
  const [remarks, setRemarks] = useState('');

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [items, setItems] = useState([]);

  const { data: parties } = useQuery({
    queryKey: ['approval-parties', partySearch],
    queryFn: () => approvalApi.getParties({ search: partySearch }).then(r => r.data.data || []),
  });

  const addPartyMutation = useMutation({
    mutationFn: (data) => approvalApi.createParty(data),
    onSuccess: (res) => {
      message.success('Party added.');
      setPartyId(res.data.data.Party_ID);
      setAddPartyOpen(false);
      partyForm.resetFields();
    },
    onError: (err) => message.error(err.response?.data?.message || 'Failed to add party.'),
  });

  const runSearch = async () => {
    if (!searchQuery.trim()) return;
    try {
      const res = await approvalApi.searchOrnaments(searchQuery.trim());
      setSearchResults(res.data.data || []);
    } catch { message.error('Search failed.'); }
  };

  const addItem = (ornament) => {
    if (items.find(i => i.Ornament_ID === ornament.Ornament_ID)) { message.warning('Already added.'); return; }
    setItems(prev => [...prev, ornament]);
    setSearchResults(prev => prev.filter(o => o.Ornament_ID !== ornament.Ornament_ID));
  };
  const removeItem = (ornamentId) => setItems(prev => prev.filter(i => i.Ornament_ID !== ornamentId));

  const totals = items.reduce((acc, i) => ({
    weight: acc.weight + parseFloat(i.Gross_Weight || 0),
    value: acc.value + parseFloat(i.Total_Price || 0),
  }), { weight: 0, value: 0 });

  const [createdVoucher, setCreatedVoucher] = useState(null); // { issue, items }

  const issueMutation = useMutation({
    mutationFn: (data) => approvalApi.createIssue(data),
    onSuccess: (res) => {
      message.success(`Approval issue ${res.data.data.Voucher_Number} created!`);
      const selectedParty = (parties || []).find(p => p.Party_ID === partyId);
      setCreatedVoucher({
        ...res.data.data,
        Party_Name: selectedParty?.Party_Name, Shop_Name: selectedParty?.Shop_Name, Party_Mobile: selectedParty?.Mobile,
      });
      setItems([]); setSearchResults([]); setSearchQuery(''); setRemarks(''); setPartyId(null);
      setIssueDate(dayjs()); setExpectedReturnDate(null);
    },
    onError: (err) => message.error(err.response?.data?.message || 'Failed to create approval issue.'),
  });

  const submitIssue = () => {
    if (items.length === 0) { message.warning('Add at least one item.'); return; }
    issueMutation.mutate({
      Party_ID: partyId,
      Issue_Date: issueDate.format('YYYY-MM-DD'),
      Expected_Return_Date: expectedReturnDate ? expectedReturnDate.format('YYYY-MM-DD') : null,
      Remarks: remarks || null,
      items: items.map(i => ({ Ornament_ID: i.Ornament_ID })),
    });
  };

  const searchColumns = [
    { title: 'Article No', dataIndex: 'Article_Number', render: v => <Text code style={{ fontSize: 11 }}>{v}</Text> },
    { title: 'Type', dataIndex: 'Type_Name' },
    { title: 'Design', dataIndex: 'Design_Name' },
    { title: 'Purity', dataIndex: 'Purity_Code', render: v => v && <Tag color="gold">{v}</Tag> },
    { title: 'Gross Wt', dataIndex: 'Gross_Weight', render: formatWeight },
    { title: 'Value', dataIndex: 'Total_Price', render: formatCurrency },
    { title: '', render: (_, r) => <Button size="small" type="primary" style={{ background: '#B8860B', borderColor: '#B8860B' }} onClick={() => addItem(r)}>Add</Button> },
  ];

  const itemColumns = [
    { title: 'Article No', dataIndex: 'Article_Number', render: v => <Text code style={{ fontSize: 11 }}>{v}</Text> },
    { title: 'Type', dataIndex: 'Type_Name' },
    { title: 'Purity', dataIndex: 'Purity_Code', render: v => v && <Tag color="gold">{v}</Tag> },
    { title: 'Gross Wt', dataIndex: 'Gross_Weight', render: formatWeight },
    { title: 'Value', dataIndex: 'Total_Price', render: formatCurrency },
    { title: '', render: (_, r) => <Button size="small" danger icon={<DeleteOutlined />} onClick={() => removeItem(r.Ornament_ID)} /> },
  ];

  return (
    <div className="page-wrapper">
      <div className="page-header">
        <Title level={4} style={{ margin: 0 }}><TagOutlined style={{ color: '#B8860B', marginRight: 8 }} />Approval Issue</Title>
      </div>

      <ApprovalNavTabs />

      <Row gutter={14}>
        <Col xs={24} lg={8}>
          <Card size="small" title="Voucher Details" style={{ borderRadius: 8, marginBottom: 14 }}>
            <Space direction="vertical" style={{ width: '100%' }} size={10}>
              <div ref={partyRef}>
                <Text style={{ fontSize: 12, color: '#888' }}>Party</Text>
                <Select
                  showSearch style={{ width: '100%' }} placeholder="Search / select party"
                  value={partyId} onSearch={setPartySearch} filterOption={false}
                  onChange={setPartyId}
                  dropdownRender={menu => (
                    <>
                      {menu}
                      <div style={{ padding: 8, borderTop: '1px solid #f0f0f0' }}>
                        <Button type="link" size="small" icon={<PlusOutlined />} onClick={() => setAddPartyOpen(true)}>Add New Party</Button>
                      </div>
                    </>
                  )}>
                  {(parties || []).map(p => (
                    <Option key={p.Party_ID} value={p.Party_ID}>{p.Party_Name} {p.Shop_Name ? `— ${p.Shop_Name}` : ''} {p.Mobile ? `(${p.Mobile})` : ''}</Option>
                  ))}
                </Select>
              </div>
              <div>
                <Text style={{ fontSize: 12, color: '#888' }}>Issue Date</Text>
                <DatePicker style={{ width: '100%' }} value={issueDate} onChange={setIssueDate} format="DD-MMM-YYYY" />
              </div>
              <div>
                <Text style={{ fontSize: 12, color: '#888' }}>Expected Return Date</Text>
                <DatePicker style={{ width: '100%' }} value={expectedReturnDate} onChange={setExpectedReturnDate} format="DD-MMM-YYYY" />
              </div>
              <div>
                <Text style={{ fontSize: 12, color: '#888' }}>Remarks</Text>
                <Input.TextArea rows={2} value={remarks} onChange={e => setRemarks(e.target.value)} />
              </div>
            </Space>
          </Card>

          <Card size="small" title="Summary" style={{ borderRadius: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <Text type="secondary">Items</Text><Text strong>{items.length}</Text>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <Text type="secondary">Total Weight</Text><Text strong>{formatWeight(totals.weight)}</Text>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
              <Text type="secondary">Total Value</Text><Text strong style={{ color: '#B8860B' }}>{formatCurrency(totals.value)}</Text>
            </div>
            <Button ref={submitRef} type="primary" block size="large" loading={issueMutation.isPending} disabled={items.length === 0}
              style={{ background: '#B8860B', borderColor: '#B8860B' }} onClick={submitIssue}>
              Create Approval Issue
            </Button>
          </Card>
        </Col>

        <Col xs={24} lg={16}>
          <div ref={searchCardRef}>
          <Card size="small" title="Search Items to Issue" style={{ borderRadius: 8, marginBottom: 14 }}>
            <Space.Compact style={{ width: '100%', marginBottom: 12 }}>
              <Input placeholder="Barcode / Article No / Design / Product Name" size="large"
                value={searchQuery} onChange={e => setSearchQuery(e.target.value)} onPressEnter={runSearch} />
              <Button type="primary" size="large" icon={<SearchOutlined />} onClick={runSearch}
                style={{ background: '#B8860B', borderColor: '#B8860B' }}>Search</Button>
            </Space.Compact>
            {searchResults.length === 0
              ? <Empty description="Search for items to add" style={{ padding: '20px 0' }} />
              : <Table scroll={{ x: 'max-content' }} columns={searchColumns} dataSource={searchResults} rowKey="Ornament_ID" size="small" pagination={false} />}
          </Card>
          </div>

          <div ref={itemsCardRef}>
          <Card size="small" title={`Items to Issue (${items.length})`} style={{ borderRadius: 8 }} bodyStyle={{ padding: 0 }}>
            {items.length === 0
              ? <Empty description="No items added yet" style={{ padding: '20px 0' }} />
              : <Table scroll={{ x: 'max-content' }} columns={itemColumns} dataSource={items} rowKey="Ornament_ID" size="small" pagination={false} />}
          </Card>
          </div>
        </Col>
      </Row>

      <Modal title="Add New Party" open={addPartyOpen} onCancel={() => setAddPartyOpen(false)} footer={null} destroyOnClose>
        <Form form={partyForm} layout="vertical" onFinish={v => addPartyMutation.mutate(v)}>
          <Form.Item name="Party_Name" label="Party Name" rules={[{ required: true }]}><Input /></Form.Item>
          <Row gutter={12}>
            <Col xs={12}><Form.Item name="Shop_Name" label="Shop Name"><Input /></Form.Item></Col>
            <Col xs={12}><Form.Item name="Contact_Person" label="Contact Person"><Input /></Form.Item></Col>
          </Row>
          <Row gutter={12}>
            <Col xs={12}><Form.Item name="Mobile" label="Mobile"><Input /></Form.Item></Col>
            <Col xs={12}><Form.Item name="GST_Number" label="GST Number"><Input /></Form.Item></Col>
          </Row>
          <Form.Item name="Address" label="Address"><Input.TextArea rows={2} /></Form.Item>
          <Form.Item name="Remarks" label="Remarks"><Input /></Form.Item>
          <Button type="primary" htmlType="submit" block loading={addPartyMutation.isPending} style={{ background: '#B8860B', borderColor: '#B8860B' }}>
            Save Party
          </Button>
        </Form>
      </Modal>

      <Modal
        title={<span><CheckCircleFilled style={{ color: '#52c41a', marginRight: 8 }} />Approval Issue Created</span>}
        open={!!createdVoucher} closable={false} footer={null}>
        {createdVoucher && (
          <>
            <Text style={{ fontSize: 15 }}>Voucher <Text code strong>{createdVoucher.Voucher_Number}</Text> created successfully.</Text>
            <Space style={{ width: '100%', marginTop: 20 }}>
              <Button icon={<PrinterOutlined />} onClick={() => printTaggedIssueVoucher(createdVoucher, createdVoucher.items)}>
                Print Voucher
              </Button>
              <Button type="primary" style={{ background: '#B8860B', borderColor: '#B8860B' }}
                onClick={() => { setCreatedVoucher(null); navigate('/approval'); }}>
                Done
              </Button>
            </Space>
          </>
        )}
      </Modal>

      <PageTour steps={tourSteps} />
    </div>
  );
}
