import React, { useState, useRef } from 'react';
import {
  Row, Col, Card, Typography, Select, Input, InputNumber, Button, Table, Space,
  DatePicker, Modal, Form, Upload, message, Empty, Image,
} from 'antd';
import { PlusOutlined, DeleteOutlined, UploadOutlined, TagsOutlined, PrinterOutlined, CheckCircleFilled } from '@ant-design/icons';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { approvalApi, uploadApi } from '../../api/modules';
import { formatCurrency, formatWeight } from '../../utils/calculations';
import { printNonTagIssueVoucher } from '../../utils/approvalVoucherPrint';
import ApprovalNavTabs from './ApprovalNavTabs';
import PageTour from '../../components/PageTour';
import { useMetalTypes } from '../../hooks/useMetalTypes';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { Option } = Select;

const emptyDraft = { Item_Type: '', Design_Type: '', Category: '', Gross_Weight: null, Metal_Type: 'Gold', Approx_Value: null, Image_URL: null, Remarks: '' };

export default function NonTagIssuePage() {
  const navigate = useNavigate();
  const { metalTypes } = useMetalTypes();
  // "Other" isn't a real configured metal type — kept as a fixed fallback
  // for a genuinely mixed/unclassifiable item (this field isn't validated
  // server-side), appended after the live list rather than baked into it.
  const metalTypeOptions = [...metalTypes, 'Other'];
  const [partyId, setPartyId] = useState(null);

  // ── Walkthrough tour refs ───────────────────────────────────────────────────
  const conceptRef = useRef(null);
  const draftRef = useRef(null);
  const itemsCardRef = useRef(null);
  const submitRef = useRef(null);
  const tourSteps = [
    { title: '1. Non-Tagged — No Barcode Needed', description: 'Use this screen for items that don\'t have a shop barcode tag yet — loose stones, generic or made-to-order pieces. Unlike the regular Issue screen, you type in the details by hand instead of searching for an existing tagged item.', target: () => conceptRef.current },
    { title: '2. Describe the Item', description: 'Fill in the item type, design, category, weight and an approximate value, and optionally upload a photo — this is the only record of the item since it has no barcode.', target: () => draftRef.current },
    { title: '3. Items to Issue', description: 'Each item you add appears here. It still leaves the shop "on approval", tracked by this voucher, until the customer buys it or you receive it back.', target: () => itemsCardRef.current },
    { title: '4. Create the Issue', description: 'Once all items are added, click here to generate the non-tag approval voucher for this party.', target: () => submitRef.current },
  ];
  const [partySearch, setPartySearch] = useState('');
  const [addPartyOpen, setAddPartyOpen] = useState(false);
  const [partyForm] = Form.useForm();

  const [issueDate, setIssueDate] = useState(dayjs());
  const [expectedReturnDate, setExpectedReturnDate] = useState(null);
  const [remarks, setRemarks] = useState('');

  const [draft, setDraft] = useState(emptyDraft);
  const [uploading, setUploading] = useState(false);
  const [items, setItems] = useState([]);

  const { data: parties } = useQuery({
    queryKey: ['approval-parties', partySearch],
    queryFn: () => approvalApi.getParties({ search: partySearch }).then(r => r.data.data || []),
  });

  const addPartyMutation = useMutation({
    mutationFn: (data) => approvalApi.createParty(data),
    onSuccess: (res) => { message.success('Party added.'); setPartyId(res.data.data.Party_ID); setAddPartyOpen(false); partyForm.resetFields(); },
    onError: (err) => message.error(err.response?.data?.message || 'Failed to add party.'),
  });

  const handleImageUpload = async (file) => {
    setUploading(true);
    try {
      const res = await uploadApi.uploadImage(file, 'approval-items');
      setDraft(prev => ({ ...prev, Image_URL: res.data.data.url }));
      message.success('Image uploaded.');
    } catch { message.error('Image upload failed.'); }
    setUploading(false);
    return false; // prevent antd Upload's default auto-submit
  };

  const addDraftItem = () => {
    if (!draft.Item_Type.trim()) { message.warning('Item type is required.'); return; }
    setItems(prev => [...prev, { ...draft, key: Date.now() }]);
    setDraft(emptyDraft);
  };
  const removeItem = (key) => setItems(prev => prev.filter(i => i.key !== key));

  const totals = items.reduce((acc, i) => ({
    weight: acc.weight + parseFloat(i.Gross_Weight || 0),
    value: acc.value + parseFloat(i.Approx_Value || 0),
  }), { weight: 0, value: 0 });

  const [createdVoucher, setCreatedVoucher] = useState(null); // { issue, items }

  const issueMutation = useMutation({
    mutationFn: (data) => approvalApi.createNonTagIssue(data),
    onSuccess: (res) => {
      message.success(`Non-tag approval issue ${res.data.data.Voucher_Number} created!`);
      const selectedParty = (parties || []).find(p => p.Party_ID === partyId);
      setCreatedVoucher({
        ...res.data.data,
        Party_Name: selectedParty?.Party_Name, Shop_Name: selectedParty?.Shop_Name, Party_Mobile: selectedParty?.Mobile,
      });
      setItems([]); setDraft(emptyDraft); setRemarks(''); setPartyId(null);
      setIssueDate(dayjs()); setExpectedReturnDate(null);
    },
    onError: (err) => message.error(err.response?.data?.message || 'Failed to create non-tag approval issue.'),
  });

  const submitIssue = () => {
    if (items.length === 0) { message.warning('Add at least one item.'); return; }
    issueMutation.mutate({
      Party_ID: partyId,
      Issue_Date: issueDate.format('YYYY-MM-DD'),
      Expected_Return_Date: expectedReturnDate ? expectedReturnDate.format('YYYY-MM-DD') : null,
      Remarks: remarks || null,
      items: items.map(({ key, ...rest }) => rest),
    });
  };

  const itemColumns = [
    { title: 'Image', dataIndex: 'Image_URL', width: 60, render: v => v ? <Image src={v} width={40} height={40} style={{ objectFit: 'cover', borderRadius: 4 }} /> : <Text type="secondary">—</Text> },
    { title: 'Item Type', dataIndex: 'Item_Type' },
    { title: 'Design', dataIndex: 'Design_Type' },
    { title: 'Category', dataIndex: 'Category' },
    { title: 'Metal', dataIndex: 'Metal_Type' },
    { title: 'Gross Wt', dataIndex: 'Gross_Weight', render: formatWeight },
    { title: 'Value', dataIndex: 'Approx_Value', render: formatCurrency },
    { title: '', render: (_, r) => <Button size="small" danger icon={<DeleteOutlined />} onClick={() => removeItem(r.key)} /> },
  ];

  return (
    <div className="page-wrapper">
      <div className="page-header" ref={conceptRef}>
        <Title level={4} style={{ margin: 0 }}><TagsOutlined style={{ color: '#B8860B', marginRight: 8 }} />Non-Tagged Approval Issue</Title>
      </div>

      <ApprovalNavTabs />

      <Row gutter={14}>
        <Col xs={24} lg={8}>
          <Card size="small" title="Voucher Details" style={{ borderRadius: 8, marginBottom: 14 }}>
            <Space direction="vertical" style={{ width: '100%' }} size={10}>
              <div>
                <Text style={{ fontSize: 12, color: '#888' }}>Party</Text>
                <Select
                  showSearch style={{ width: '100%' }} placeholder="Search / select party"
                  value={partyId} onSearch={setPartySearch} filterOption={false} onChange={setPartyId}
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
              Create Non-Tag Approval Issue
            </Button>
          </Card>
        </Col>

        <Col xs={24} lg={16}>
          <div ref={draftRef}>
          <Card size="small" title="Add Item (Manual Entry)" style={{ borderRadius: 8, marginBottom: 14 }}>
            <Row gutter={10}>
              <Col xs={12} md={8}><Input placeholder="Item Type (e.g. Necklace)" value={draft.Item_Type} onChange={e => setDraft(p => ({ ...p, Item_Type: e.target.value }))} style={{ marginBottom: 8 }} /></Col>
              <Col xs={12} md={8}><Input placeholder="Design Type" value={draft.Design_Type} onChange={e => setDraft(p => ({ ...p, Design_Type: e.target.value }))} style={{ marginBottom: 8 }} /></Col>
              <Col xs={12} md={8}><Input placeholder="Category" value={draft.Category} onChange={e => setDraft(p => ({ ...p, Category: e.target.value }))} style={{ marginBottom: 8 }} /></Col>
              <Col xs={12} md={6}><InputNumber placeholder="Gross Wt (g)" style={{ width: '100%', marginBottom: 8 }} min={0} step={0.001} value={draft.Gross_Weight} onChange={v => setDraft(p => ({ ...p, Gross_Weight: v }))} /></Col>
              <Col xs={12} md={6}>
                <Select style={{ width: '100%', marginBottom: 8 }} value={draft.Metal_Type} onChange={v => setDraft(p => ({ ...p, Metal_Type: v }))}>
                  {metalTypeOptions.map(m => <Option key={m} value={m}>{m}</Option>)}
                </Select>
              </Col>
              <Col xs={12} md={6}><InputNumber placeholder="Approx Value (₹)" style={{ width: '100%', marginBottom: 8 }} min={0} value={draft.Approx_Value} onChange={v => setDraft(p => ({ ...p, Approx_Value: v }))} /></Col>
              <Col xs={12} md={6}>
                <Upload showUploadList={false} beforeUpload={handleImageUpload} accept="image/*">
                  <Button icon={<UploadOutlined />} loading={uploading} block>{draft.Image_URL ? 'Change Image' : 'Upload Image'}</Button>
                </Upload>
              </Col>
              <Col xs={24}><Input placeholder="Remarks" value={draft.Remarks} onChange={e => setDraft(p => ({ ...p, Remarks: e.target.value }))} style={{ marginBottom: 8 }} /></Col>
            </Row>
            <Button block icon={<PlusOutlined />} onClick={addDraftItem} style={{ borderColor: '#B8860B', color: '#B8860B' }}>Add Item to Voucher</Button>
          </Card>
          </div>

          <div ref={itemsCardRef}>
          <Card size="small" title={`Items to Issue (${items.length})`} style={{ borderRadius: 8 }} bodyStyle={{ padding: 0 }}>
            {items.length === 0
              ? <Empty description="No items added yet" style={{ padding: '20px 0' }} />
              : <Table scroll={{ x: 'max-content' }} columns={itemColumns} dataSource={items} rowKey="key" size="small" pagination={false} />}
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
          <Button type="primary" htmlType="submit" block loading={addPartyMutation.isPending} style={{ background: '#B8860B', borderColor: '#B8860B' }}>
            Save Party
          </Button>
        </Form>
      </Modal>

      <Modal
        title={<span><CheckCircleFilled style={{ color: '#52c41a', marginRight: 8 }} />Non-Tag Approval Issue Created</span>}
        open={!!createdVoucher} closable={false} footer={null}>
        {createdVoucher && (
          <>
            <Text style={{ fontSize: 15 }}>Voucher <Text code strong>{createdVoucher.Voucher_Number}</Text> created successfully.</Text>
            <Space style={{ width: '100%', marginTop: 20 }}>
              <Button icon={<PrinterOutlined />} onClick={() => printNonTagIssueVoucher(createdVoucher, createdVoucher.items)}>
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
