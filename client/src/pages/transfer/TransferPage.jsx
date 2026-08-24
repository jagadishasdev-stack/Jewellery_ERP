import React, { useState, useRef } from 'react';
import {
  Table, Button, Card, Typography, Tag, Space, Modal, Form,
  Select, Input, message, Steps, Row, Col, Divider, Alert,
} from 'antd';
import { SwapOutlined, CheckOutlined, CloseOutlined, PlusOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { transferApi, floorsApi, tenantApi, ornamentsApi } from '../../api/modules';
import PageTour from '../../components/PageTour';
import { useActionShortcuts } from '../../hooks/useActionShortcuts';
import { useF2Lookup } from '../../hooks/useF2Lookup';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { Option } = Select;
const { Step } = Steps;

export default function TransferPage() {
  const [createModal, setCreateModal] = useState(false);
  const [detailModal, setDetailModal] = useState(null);
  const [step, setStep] = useState(0);
  const [form] = Form.useForm();
  const [selectedItems, setSelectedItems] = useState([]);
  const [barcodeInput, setBarcodeInput] = useState('');
  // Captured the moment "Next — Add Items" is clicked, not re-read from
  // the Form at submit time — see handleCreate for why.
  const [transferDetails, setTransferDetails] = useState(null);
  const qc = useQueryClient();

  // ── Walkthrough tour refs ───────────────────────────────────────────────────
  const newTransferRef = useRef(null);
  const workflowRef = useRef(null);
  const tableRef = useRef(null);
  const tourSteps = [
    { title: '1. Initiate a Transfer', description: 'Click here to move stock between branches, floors, counters or trays — you\'ll pick the source and destination, then scan in the items to move.', target: () => newTransferRef.current },
    { title: '2. How Transfers Work', description: 'Every transfer follows the same 3 steps: create the request with items, a manager approves it, then the items automatically move to the new location.', target: () => workflowRef.current },
    { title: '3. Approve to Confirm Receipt', description: 'Pending transfers show Approve and Reject buttons here. Approving at the destination confirms receipt and moves the items into the new location — Reject cancels the transfer instead.', target: () => tableRef.current },
  ];

  const { data: transfers, isLoading } = useQuery({
    queryKey: ['transfers'],
    queryFn: () => transferApi.getAll().then(r => r.data.data.items),
  });

  const { data: branches } = useQuery({
    queryKey: ['branches'],
    queryFn: () => tenantApi.getBranches().then(r => r.data.data),
  });

  const { data: floors } = useQuery({
    queryKey: ['floors'],
    queryFn: () => floorsApi.getAll().then(r => r.data.data),
  });

  const createMutation = useMutation({
    mutationFn: (data) => transferApi.create(data),
    onSuccess: () => {
      message.success('Transfer initiated!');
      qc.invalidateQueries(['transfers']);
      setCreateModal(false);
      form.resetFields();
      setSelectedItems([]);
      setTransferDetails(null);
      setStep(0);
    },
    onError: (err) => message.error(err.response?.data?.message || 'Failed.'),
  });

  const approveMutation = useMutation({
    mutationFn: ({ id, data }) => transferApi.approve(id, data),
    onSuccess: () => { message.success('Transfer approved — items moved!'); qc.invalidateQueries(['transfers']); },
    onError: (err) => message.error(err.response?.data?.message || 'Approval failed.'),
  });

  const rejectMutation = useMutation({
    mutationFn: (id) => transferApi.reject(id),
    onSuccess: () => { message.success('Transfer rejected.'); qc.invalidateQueries(['transfers']); },
  });

  const addByBarcode = async () => {
    if (!barcodeInput.trim()) return;
    try {
      const res = await ornamentsApi.getByBarcode(barcodeInput.trim());
      const ornament = res.data.data;
      if (!ornament) { message.error('Item not found'); return; }
      if (ornament.Is_Sold) { message.warning('Item already sold'); return; }
      if (selectedItems.find(i => i.Ornament_ID === ornament.Ornament_ID)) { message.info('Already added'); return; }
      setSelectedItems(prev => [...prev, ornament]);
      setBarcodeInput('');
    } catch { message.error('Barcode not found.'); }
  };

  // Submits the details CAPTURED at the step 0 -> 1 transition (see the
  // "Next — Add Items" button below), not a fresh form.validateFields()
  // here — by step 2, the Form's own fields are long since off-screen,
  // and re-validating/re-reading it at this point is exactly what
  // silently dropped Transfer_Type (and every other step-0 field) before:
  // the value reached the server as missing rather than failing
  // client-side, which is why the server's isIn check rejected it with
  // "Invalid value" instead of the form itself catching the problem.
  const handleCreate = () => {
    createMutation.mutate({
      ...transferDetails,
      items: selectedItems.map(i => ({
        Ornament_ID: i.Ornament_ID,
        Article_Number: i.Article_Number,
        Gross_Weight: i.Gross_Weight,
      })),
    });
  };

  const statusColor = { Pending: 'orange', Completed: 'green', Rejected: 'red' };

  const columns = [
    { title: 'Transfer #', dataIndex: 'Transfer_Number', render: (v) => <Text code>{v}</Text> },
    { title: 'Type', dataIndex: 'Transfer_Type', render: (v) => <Tag color="blue">{v}</Tag> },
    { title: 'From', dataIndex: 'From_Branch_Name', render: (v) => v || '-' },
    { title: 'To', dataIndex: 'To_Branch_Name', render: (v) => v || '-' },
    { title: 'Date', dataIndex: 'Transfer_Date', render: (v) => dayjs(v).format('DD-MMM-YYYY') },
    { title: 'Status', dataIndex: 'Status', render: (v) => <Tag color={statusColor[v] || 'default'}>{v}</Tag> },
    {
      title: 'Actions',
      render: (_, r) => (
        <Space>
          <Button size="small" onClick={() => setDetailModal(r)}>View</Button>
          {r.Status === 'Pending' && (
            <>
              <Button size="small" type="primary" icon={<CheckOutlined />}
                style={{ background: '#52c41a', borderColor: '#52c41a' }}
                loading={approveMutation.isPending}
                onClick={() => approveMutation.mutate({ id: r.Transfer_ID, data: {} })}>
                Approve
              </Button>
              <Button size="small" danger icon={<CloseOutlined />}
                loading={rejectMutation.isPending}
                onClick={() => rejectMutation.mutate(r.Transfer_ID)}>
                Reject
              </Button>
            </>
          )}
        </Space>
      ),
    },
  ];

  const floorsByBranch = (branchId) => (floors || []).filter(f => f.Branch_ID === branchId);

  const transferType = Form.useWatch('Transfer_Type', form);
  const fromBranchId = Form.useWatch('From_Branch_ID', form);
  const toBranchId = Form.useWatch('To_Branch_ID', form);
  const fromFloorId = Form.useWatch('From_Floor_ID', form);
  const toFloorId = Form.useWatch('To_Floor_ID', form);
  const fromCounterId = Form.useWatch('From_Counter_ID', form);
  const toCounterId = Form.useWatch('To_Counter_ID', form);

  const needsFloor = transferType === 'Floor' || transferType === 'Counter' || transferType === 'Tray';
  const needsCounter = transferType === 'Counter' || transferType === 'Tray';
  const needsTray = transferType === 'Tray';

  const { data: fromCounters } = useQuery({
    queryKey: ['counters', fromFloorId],
    queryFn: () => floorsApi.getCounters(fromFloorId).then(r => r.data.data),
    enabled: !!fromFloorId && needsCounter,
  });

  const { data: toCounters } = useQuery({
    queryKey: ['counters', toFloorId],
    queryFn: () => floorsApi.getCounters(toFloorId).then(r => r.data.data),
    enabled: !!toFloorId && needsCounter,
  });

  const { data: fromTrays } = useQuery({
    queryKey: ['trays', fromCounterId],
    queryFn: () => floorsApi.getTrays(fromCounterId).then(r => r.data.data),
    enabled: !!fromCounterId && needsTray,
  });

  const { data: toTrays } = useQuery({
    queryKey: ['trays', toCounterId],
    queryFn: () => floorsApi.getTrays(toCounterId).then(r => r.data.data),
    enabled: !!toCounterId && needsTray,
  });

  // F2 opens the full option list for the two busiest lookups on this
  // page — From/To Branch — same as clicking them.
  const fromBranchLookup = useF2Lookup();
  const toBranchLookup = useF2Lookup();

  // ── Keyboard shortcuts (tenant-configurable) ────────────────────────────────
  useActionShortcuts({
    onNew: () => { if (!createModal) setCreateModal(true); },
    onSave: () => {
      if (!createModal) return;
      if (step === 0) form.validateFields().then((values) => { setTransferDetails(values); setStep(1); });
      else if (step === 1) { if (selectedItems.length > 0) setStep(2); }
      else handleCreate();
    },
    onCancel: () => {
      if (createModal) { setCreateModal(false); setStep(0); setSelectedItems([]); setTransferDetails(null); form.resetFields(); }
    },
  });

  return (
    <div className="page-wrapper">
      <div className="page-header">
        <Title level={4} style={{ margin: 0 }}>
          <Space><SwapOutlined style={{ color: '#B8860B' }} />Stock Transfers</Space>
        </Title>
        <Button ref={newTransferRef} type="primary" icon={<PlusOutlined />}
          style={{ background: '#B8860B', borderColor: '#B8860B' }}
          onClick={() => setCreateModal(true)}>
          New Transfer
        </Button>
      </div>

      <div ref={workflowRef}>
      <Alert
        message="Floor / Branch Transfer Workflow"
        description="1. Create transfer request with items  →  2. Manager approves  →  3. Items automatically move to new location"
        type="info" showIcon style={{ marginBottom: 16, borderRadius: 8 }}
      />
      </div>

      <div ref={tableRef}>
      <Card style={{ borderRadius: 8, border: 'none' }} bodyStyle={{ padding: 0 }}>
        <Table
            scroll={{ x: "max-content" }} columns={columns} dataSource={transfers || []} loading={isLoading}
          rowKey="Transfer_ID" size="small" pagination={{ pageSize: 20 }} />
      </Card>
      </div>

      {/* Create Transfer Modal */}
      <Modal
        title={<Space><SwapOutlined />New Stock Transfer</Space>}
        open={createModal}
        onCancel={() => { setCreateModal(false); setStep(0); setSelectedItems([]); setTransferDetails(null); form.resetFields(); }}
        footer={null}
        width={680}
      >
        <Steps current={step} size="small" style={{ marginBottom: 24 }}>
          <Step title="Transfer Details" />
          <Step title="Add Items" />
          <Step title="Confirm" />
        </Steps>

        {step === 0 && (
          <Form form={form} layout="vertical">
            <Form.Item name="Transfer_Type" label="Transfer Type" initialValue="Floor" rules={[{ required: true }]}>
              <Select
                size="large"
                onChange={() => form.setFieldsValue({
                  From_Floor_ID: undefined, To_Floor_ID: undefined,
                  From_Counter_ID: undefined, To_Counter_ID: undefined,
                  From_Tray_ID: undefined, To_Tray_ID: undefined,
                })}
              >
                <Option value="Floor">Floor Transfer (within same branch)</Option>
                <Option value="Branch">Branch Transfer</Option>
                <Option value="Counter">Counter Transfer</Option>
                <Option value="Tray">Tray Transfer</Option>
              </Select>
            </Form.Item>
            <Row gutter={16}>
              <Col xs={12}>
                <Form.Item name="From_Branch_ID" label="From Branch (press F2 to browse)" rules={[{ required: true }]}>
                  <Select
                    placeholder="Source branch"
                    open={fromBranchLookup.open} onDropdownVisibleChange={fromBranchLookup.onOpenChange} onKeyDown={fromBranchLookup.onKeyDown}
                    onChange={() => form.setFieldsValue({ From_Floor_ID: undefined, From_Counter_ID: undefined, From_Tray_ID: undefined })}
                  >
                    {(branches || []).map(b => <Option key={b.Branch_ID} value={b.Branch_ID}>{b.Branch_Name}</Option>)}
                  </Select>
                </Form.Item>
              </Col>
              <Col xs={12}>
                <Form.Item name="To_Branch_ID" label="To Branch (press F2 to browse)" rules={[{ required: true }]}>
                  <Select
                    placeholder="Destination branch"
                    open={toBranchLookup.open} onDropdownVisibleChange={toBranchLookup.onOpenChange} onKeyDown={toBranchLookup.onKeyDown}
                    onChange={() => form.setFieldsValue({ To_Floor_ID: undefined, To_Counter_ID: undefined, To_Tray_ID: undefined })}
                  >
                    {(branches || []).map(b => <Option key={b.Branch_ID} value={b.Branch_ID}>{b.Branch_Name}</Option>)}
                  </Select>
                </Form.Item>
              </Col>
            </Row>

            {needsFloor && (
              <Row gutter={16}>
                <Col xs={12}>
                  <Form.Item name="From_Floor_ID" label="From Floor" rules={[{ required: true }]}>
                    <Select
                      placeholder="Source floor"
                      disabled={!fromBranchId}
                      onChange={() => form.setFieldsValue({ From_Counter_ID: undefined, From_Tray_ID: undefined })}
                    >
                      {floorsByBranch(fromBranchId).map(f => <Option key={f.Floor_ID} value={f.Floor_ID}>{f.Floor_Name}</Option>)}
                    </Select>
                  </Form.Item>
                </Col>
                <Col xs={12}>
                  <Form.Item name="To_Floor_ID" label="To Floor" rules={[{ required: true }]}>
                    <Select
                      placeholder="Destination floor"
                      disabled={!toBranchId}
                      onChange={() => form.setFieldsValue({ To_Counter_ID: undefined, To_Tray_ID: undefined })}
                    >
                      {floorsByBranch(toBranchId).map(f => <Option key={f.Floor_ID} value={f.Floor_ID}>{f.Floor_Name}</Option>)}
                    </Select>
                  </Form.Item>
                </Col>
              </Row>
            )}

            {needsCounter && (
              <Row gutter={16}>
                <Col xs={12}>
                  <Form.Item name="From_Counter_ID" label="From Counter" rules={[{ required: true }]}>
                    <Select
                      placeholder="Source counter"
                      disabled={!fromFloorId}
                      onChange={() => form.setFieldsValue({ From_Tray_ID: undefined })}
                    >
                      {(fromCounters || []).map(c => <Option key={c.Counter_ID} value={c.Counter_ID}>{c.Counter_Name}</Option>)}
                    </Select>
                  </Form.Item>
                </Col>
                <Col xs={12}>
                  <Form.Item name="To_Counter_ID" label="To Counter" rules={[{ required: true }]}>
                    <Select
                      placeholder="Destination counter"
                      disabled={!toFloorId}
                      onChange={() => form.setFieldsValue({ To_Tray_ID: undefined })}
                    >
                      {(toCounters || []).map(c => <Option key={c.Counter_ID} value={c.Counter_ID}>{c.Counter_Name}</Option>)}
                    </Select>
                  </Form.Item>
                </Col>
              </Row>
            )}

            {needsTray && (
              <Row gutter={16}>
                <Col xs={12}>
                  <Form.Item name="From_Tray_ID" label="From Tray" rules={[{ required: true }]}>
                    <Select placeholder="Source tray" disabled={!fromCounterId}>
                      {(fromTrays || []).map(t => <Option key={t.Tray_ID} value={t.Tray_ID}>{t.Tray_Name}</Option>)}
                    </Select>
                  </Form.Item>
                </Col>
                <Col xs={12}>
                  <Form.Item name="To_Tray_ID" label="To Tray" rules={[{ required: true }]}>
                    <Select placeholder="Destination tray" disabled={!toCounterId}>
                      {(toTrays || []).map(t => <Option key={t.Tray_ID} value={t.Tray_ID}>{t.Tray_Name}</Option>)}
                    </Select>
                  </Form.Item>
                </Col>
              </Row>
            )}

            <Form.Item name="Remarks" label="Remarks">
              <Input.TextArea rows={2} placeholder="Reason for transfer..." />
            </Form.Item>
            <Button type="primary" block size="large"
              style={{ background: '#B8860B', borderColor: '#B8860B' }}
              onClick={() => form.validateFields().then((values) => { setTransferDetails(values); setStep(1); })}>
              Next — Add Items
            </Button>
          </Form>
        )}

        {step === 1 && (
          <div>
            <Space.Compact style={{ width: '100%', marginBottom: 16 }}>
              <Input
                placeholder="Scan barcode or enter Article Number"
                value={barcodeInput}
                onChange={e => setBarcodeInput(e.target.value)}
                onPressEnter={addByBarcode}
                size="large"
              />
              <Button type="primary" size="large" onClick={addByBarcode}
                style={{ background: '#B8860B', borderColor: '#B8860B' }}>Add</Button>
            </Space.Compact>

            <Table
            scroll={{ x: "max-content" }}
              size="small"
              dataSource={selectedItems}
              rowKey="Ornament_ID"
              pagination={false}
              columns={[
                { title: 'Article No', dataIndex: 'Article_Number', render: v => <Text code>{v}</Text> },
                { title: 'Type', dataIndex: 'Type_Name' },
                { title: 'Weight', dataIndex: 'Gross_Weight', render: v => `${parseFloat(v||0).toFixed(3)}g` },
                { title: '', render: (_, r) => <Button size="small" danger onClick={() => setSelectedItems(prev => prev.filter(i => i.Ornament_ID !== r.Ornament_ID))}>Remove</Button> },
              ]}
            />
            <Divider />
            <Space style={{ width: '100%', justifyContent: 'space-between' }}>
              <Button onClick={() => setStep(0)}>Back</Button>
              <Button type="primary" disabled={selectedItems.length === 0}
                style={{ background: '#B8860B', borderColor: '#B8860B' }}
                onClick={() => setStep(2)}>
                Next — Confirm ({selectedItems.length} items)
              </Button>
            </Space>
          </div>
        )}

        {step === 2 && (
          <div>
            <Alert
              message={`Transfer ${selectedItems.length} item(s)`}
              description="Once approved, items will be automatically moved to the destination location."
              type="warning" showIcon style={{ marginBottom: 16 }} />
            <Space style={{ width: '100%', justifyContent: 'space-between' }}>
              <Button onClick={() => setStep(1)}>Back</Button>
              <Button type="primary" size="large" loading={createMutation.isPending}
                style={{ background: '#52c41a', borderColor: '#52c41a' }}
                onClick={handleCreate}>
                Submit Transfer Request
              </Button>
            </Space>
          </div>
        )}
      </Modal>

      {/* Detail Modal */}
      <Modal
        title={`Transfer — ${detailModal?.Transfer_Number}`}
        open={!!detailModal}
        onCancel={() => setDetailModal(null)}
        footer={null}
        width={500}
      >
        {detailModal && (
          <div>
            <Row gutter={16} style={{ marginBottom: 16 }}>
              {[
                { label: 'Type', value: detailModal.Transfer_Type },
                { label: 'Status', value: <Tag color={statusColor[detailModal.Status]}>{detailModal.Status}</Tag> },
                { label: 'From', value: detailModal.From_Branch_Name || '-' },
                { label: 'To', value: detailModal.To_Branch_Name || '-' },
                { label: 'Date', value: dayjs(detailModal.Transfer_Date).format('DD-MMM-YYYY HH:mm') },
                { label: 'Remarks', value: detailModal.Remarks || '-' },
              ].map(r => (
                <Col xs={12} key={r.label} style={{ marginBottom: 8 }}>
                  <Text type="secondary" style={{ fontSize: 11 }}>{r.label}</Text>
                  <br /><Text strong>{r.value}</Text>
                </Col>
              ))}
            </Row>
          </div>
        )}
      </Modal>

      <PageTour steps={tourSteps} />
    </div>
  );
}
