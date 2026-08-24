import React, { useState, useRef } from 'react';
import {
  Row, Col, Card, Table, Button, Modal, Form, Input, Select,
  InputNumber, Typography, Space, Tag, Tabs, Statistic, message,
} from 'antd';
import { PlusOutlined, ShopOutlined, ApartmentOutlined, EditOutlined, DeleteOutlined, LockOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { floorsApi, tenantApi } from '../../api/modules';
import { formatCurrency, formatWeight } from '../../utils/calculations';
import { useAuthStore } from '../../store/authStore';
import PageTour from '../../components/PageTour';

const { Title, Text } = Typography;
const { TabPane } = Tabs;
const { Option } = Select;

// Sub-table shown when a floor row is expanded — lists that floor's counters with Edit/Delete.
function CounterExpandedRow({ floor, onEdit }) {
  const qc = useQueryClient();

  const { data: counters, isLoading } = useQuery({
    queryKey: ['floor-counters', floor.Floor_ID],
    queryFn: () => floorsApi.getCounters(floor.Floor_ID).then(r => r.data.data),
  });

  const deleteCounterMutation = useMutation({
    mutationFn: (id) => floorsApi.removeCounter(id),
    onSuccess: () => {
      message.success('Counter deleted!');
      qc.invalidateQueries(['floor-counters', floor.Floor_ID]);
      qc.invalidateQueries(['floors']);
    },
    onError: (err) => message.error(err.response?.data?.message || 'Failed.'),
  });

  const columns = [
    { title: 'Code', dataIndex: 'Counter_Code', width: 100 },
    { title: 'Name', dataIndex: 'Counter_Name', render: (v) => <Text strong>{v}</Text> },
    { title: 'Type', dataIndex: 'Counter_Type', render: (v) => <Tag color="gold">{v}</Tag> },
    { title: 'Capacity', dataIndex: 'Capacity' },
    { title: 'Status', dataIndex: 'Is_Active', render: (v) => <Tag color={v ? 'green' : 'red'}>{v ? 'Active' : 'Inactive'}</Tag> },
    {
      title: 'Actions',
      render: (_, c) => (
        <Space size="small">
          <Button size="small" type="link" icon={<EditOutlined />} onClick={() => onEdit(floor, c)}>Edit</Button>
          <Button size="small" type="link" danger icon={<DeleteOutlined />}
            onClick={() => Modal.confirm({
              title: `Delete counter "${c.Counter_Name}"?`,
              content: 'This will soft-delete the counter.',
              okText: 'Delete', okType: 'danger',
              onOk: () => deleteCounterMutation.mutate(c.Counter_ID),
            })}>
            Delete
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <Table
      scroll={{ x: "max-content" }} columns={columns} dataSource={counters || []} loading={isLoading}
      rowKey="Counter_ID" size="small" pagination={false} />
  );
}

export default function FloorsPage() {
  const { user } = useAuthStore();
  const canHiddenStock = !!user?.permissions?.tenant_management;

  const [floorModal, setFloorModal] = useState(false);
  const [editingFloor, setEditingFloor] = useState(null);
  const [counterModal, setCounterModal] = useState(false);
  const [editingCounter, setEditingCounter] = useState(null);
  const [selectedFloor, setSelectedFloor] = useState(null);
  const [floorForm] = Form.useForm();
  const [counterForm] = Form.useForm();

  // Trays / Showcases tab state
  const [trayFloorId, setTrayFloorId] = useState(null);
  const [trayCounterId, setTrayCounterId] = useState(null);
  const [trayModal, setTrayModal] = useState(false);
  const [editingTray, setEditingTray] = useState(null);
  const [trayForm] = Form.useForm();

  // Hidden Locations tab state
  const [hiddenLocModal, setHiddenLocModal] = useState(false);
  const [editingHiddenLoc, setEditingHiddenLoc] = useState(null);
  const [hiddenLocForm] = Form.useForm();

  const qc = useQueryClient();

  // ── Walkthrough tour refs ───────────────────────────────────────────────────
  const summaryRef = useRef(null);
  const addFloorRef = useRef(null);
  const tabsRef = useRef(null);
  const tourSteps = [
    { title: '1. Stock Location Overview', description: 'A quick snapshot of how many floors you have, how many items sit on them right now, and their total value.', target: () => summaryRef.current },
    { title: '2. Add a Floor', description: 'Start here to create a new floor for a branch (e.g. Ground Floor, First Floor). Each floor can then hold its own counters and trays.', target: () => addFloorRef.current },
    { title: '3. Organize Counters, Trays & Stock', description: 'Expand any floor row to add/edit its counters. Switch to "Trays / Showcases" to add trays inside a counter, and "Live Stock by Location" to see exactly how many items and how much value sits at each physical spot.', target: () => tabsRef.current },
  ];

  const { data: branches } = useQuery({
    queryKey: ['branches'],
    queryFn: () => tenantApi.getBranches().then(r => r.data.data),
  });

  const { data: floors, isLoading } = useQuery({
    queryKey: ['floors'],
    queryFn: () => floorsApi.getAll().then(r => r.data.data),
  });

  const { data: liveStock } = useQuery({
    queryKey: ['floor-stock'],
    queryFn: () => floorsApi.getLiveStock().then(r => r.data.data),
    refetchInterval: 30000,
  });

  const { data: trayCounters } = useQuery({
    queryKey: ['floor-counters', trayFloorId],
    queryFn: () => floorsApi.getCounters(trayFloorId).then(r => r.data.data),
    enabled: !!trayFloorId,
  });

  const { data: trays, isLoading: traysLoading } = useQuery({
    queryKey: ['trays', trayCounterId],
    queryFn: () => floorsApi.getTrays(trayCounterId).then(r => r.data.data),
    enabled: !!trayCounterId,
  });

  const { data: hiddenLocations, isLoading: hiddenLocLoading } = useQuery({
    queryKey: ['hidden-locations'],
    queryFn: () => floorsApi.getHiddenLocations().then(r => r.data.data),
    enabled: canHiddenStock,
  });

  // ---- Floor mutations ----
  const createFloorMutation = useMutation({
    mutationFn: (data) => floorsApi.create(data),
    onSuccess: () => { message.success('Floor created!'); qc.invalidateQueries(['floors']); setFloorModal(false); floorForm.resetFields(); },
    onError: (err) => message.error(err.response?.data?.message || 'Failed.'),
  });

  const updateFloorMutation = useMutation({
    mutationFn: ({ id, data }) => floorsApi.update(id, data),
    onSuccess: () => { message.success('Floor updated!'); qc.invalidateQueries(['floors']); setFloorModal(false); setEditingFloor(null); floorForm.resetFields(); },
    onError: (err) => message.error(err.response?.data?.message || 'Failed.'),
  });

  const deleteFloorMutation = useMutation({
    mutationFn: (id) => floorsApi.remove(id),
    onSuccess: () => { message.success('Floor deleted!'); qc.invalidateQueries(['floors']); },
    onError: (err) => message.error(err.response?.data?.message || 'Failed.'),
  });

  // ---- Counter mutations ----
  const createCounterMutation = useMutation({
    mutationFn: (data) => floorsApi.createCounter(data),
    onSuccess: () => { message.success('Counter created!'); qc.invalidateQueries(['floors']); qc.invalidateQueries(['floor-counters']); setCounterModal(false); counterForm.resetFields(); },
    onError: (err) => message.error(err.response?.data?.message || 'Failed.'),
  });

  const updateCounterMutation = useMutation({
    mutationFn: ({ id, data }) => floorsApi.updateCounter(id, data),
    onSuccess: () => { message.success('Counter updated!'); qc.invalidateQueries(['floors']); qc.invalidateQueries(['floor-counters']); setCounterModal(false); setEditingCounter(null); counterForm.resetFields(); },
    onError: (err) => message.error(err.response?.data?.message || 'Failed.'),
  });

  // ---- Tray mutations ----
  const createTrayMutation = useMutation({
    mutationFn: (data) => floorsApi.createTray(data),
    onSuccess: () => { message.success('Tray created!'); qc.invalidateQueries(['trays', trayCounterId]); setTrayModal(false); setEditingTray(null); trayForm.resetFields(); },
    onError: (err) => message.error(err.response?.data?.message || 'Failed.'),
  });

  const updateTrayMutation = useMutation({
    mutationFn: ({ id, data }) => floorsApi.updateTray(id, data),
    onSuccess: () => { message.success('Tray updated!'); qc.invalidateQueries(['trays', trayCounterId]); setTrayModal(false); setEditingTray(null); trayForm.resetFields(); },
    onError: (err) => message.error(err.response?.data?.message || 'Failed.'),
  });

  const deleteTrayMutation = useMutation({
    mutationFn: (id) => floorsApi.removeTray(id),
    onSuccess: () => { message.success('Tray deleted!'); qc.invalidateQueries(['trays', trayCounterId]); },
    onError: (err) => message.error(err.response?.data?.message || 'Failed.'),
  });

  // ---- Hidden Location mutations ----
  const createHiddenLocMutation = useMutation({
    mutationFn: (data) => floorsApi.createHiddenLocation(data),
    onSuccess: () => { message.success('Hidden location created!'); qc.invalidateQueries(['hidden-locations']); setHiddenLocModal(false); setEditingHiddenLoc(null); hiddenLocForm.resetFields(); },
    onError: (err) => message.error(err.response?.data?.message || 'Failed.'),
  });

  const updateHiddenLocMutation = useMutation({
    mutationFn: ({ id, data }) => floorsApi.updateHiddenLocation(id, data),
    onSuccess: () => { message.success('Hidden location updated!'); qc.invalidateQueries(['hidden-locations']); setHiddenLocModal(false); setEditingHiddenLoc(null); hiddenLocForm.resetFields(); },
    onError: (err) => message.error(err.response?.data?.message || 'Failed.'),
  });

  const deleteHiddenLocMutation = useMutation({
    mutationFn: (id) => floorsApi.removeHiddenLocation(id),
    onSuccess: () => { message.success('Hidden location deleted!'); qc.invalidateQueries(['hidden-locations']); },
    onError: (err) => message.error(err.response?.data?.message || 'Failed.'),
  });

  // ---- Floor helpers ----
  const openAddFloor = () => { setEditingFloor(null); floorForm.resetFields(); setFloorModal(true); };
  const openEditFloor = (r) => {
    setEditingFloor(r);
    floorForm.setFieldsValue({
      Branch_ID: r.Branch_ID,
      Floor_Code: r.Floor_Code,
      Floor_Name: r.Floor_Name,
      Floor_Number: r.Floor_Number,
      Description: r.Description,
      Is_Active: r.Is_Active,
    });
    setFloorModal(true);
  };
  const confirmDeleteFloor = (r) => {
    Modal.confirm({
      title: `Delete floor "${r.Floor_Name}"?`,
      content: 'This will soft-delete the floor.',
      okText: 'Delete', okType: 'danger',
      onOk: () => deleteFloorMutation.mutate(r.Floor_ID),
    });
  };

  // ---- Counter helpers ----
  const openAddCounter = (floor) => {
    setSelectedFloor(floor);
    setEditingCounter(null);
    counterForm.resetFields();
    counterForm.setFieldsValue({ Floor_ID: floor.Floor_ID, Branch_ID: floor.Branch_ID });
    setCounterModal(true);
  };
  const openEditCounter = (floor, counter) => {
    setSelectedFloor(floor);
    setEditingCounter(counter);
    counterForm.setFieldsValue({
      Floor_ID: floor.Floor_ID,
      Branch_ID: floor.Branch_ID,
      Counter_Code: counter.Counter_Code,
      Counter_Name: counter.Counter_Name,
      Counter_Type: counter.Counter_Type,
      Capacity: counter.Capacity,
      Is_Active: counter.Is_Active,
    });
    setCounterModal(true);
  };

  // ---- Tray helpers ----
  const openAddTray = () => {
    setEditingTray(null);
    trayForm.resetFields();
    const counterObj = (trayCounters || []).find(c => c.Counter_ID === trayCounterId);
    trayForm.setFieldsValue({
      Floor_ID: trayFloorId,
      Counter_ID: trayCounterId,
      Branch_ID: counterObj?.Branch_ID,
    });
    setTrayModal(true);
  };
  const openEditTray = (t) => {
    setEditingTray(t);
    const counterObj = (trayCounters || []).find(c => c.Counter_ID === trayCounterId);
    trayForm.setFieldsValue({
      Floor_ID: trayFloorId,
      Counter_ID: trayCounterId,
      Branch_ID: counterObj?.Branch_ID,
      Tray_Code: t.Tray_Code,
      Tray_Name: t.Tray_Name,
      Capacity: t.Capacity,
      Is_Active: t.Is_Active,
    });
    setTrayModal(true);
  };
  const confirmDeleteTray = (t) => {
    Modal.confirm({
      title: `Delete tray "${t.Tray_Name}"?`,
      content: 'This will soft-delete the tray.',
      okText: 'Delete', okType: 'danger',
      onOk: () => deleteTrayMutation.mutate(t.Tray_ID),
    });
  };

  // ---- Hidden Location helpers ----
  const openAddHiddenLoc = () => { setEditingHiddenLoc(null); hiddenLocForm.resetFields(); setHiddenLocModal(true); };
  const openEditHiddenLoc = (l) => {
    setEditingHiddenLoc(l);
    hiddenLocForm.setFieldsValue({
      Location_Code: l.Location_Code,
      Location_Name: l.Location_Name,
      Description: l.Description,
      Is_Active: l.Is_Active,
    });
    setHiddenLocModal(true);
  };
  const confirmDeleteHiddenLoc = (l) => {
    Modal.confirm({
      title: `Delete hidden location "${l.Location_Name}"?`,
      content: 'This will soft-delete the location.',
      okText: 'Delete', okType: 'danger',
      onOk: () => deleteHiddenLocMutation.mutate(l.Hidden_Location_ID),
    });
  };

  const floorColumns = [
    { title: 'Floor', dataIndex: 'Floor_Number', width: 60, render: (v) => <Tag color="blue">F{v}</Tag> },
    { title: 'Code', dataIndex: 'Floor_Code', width: 80 },
    { title: 'Name', dataIndex: 'Floor_Name', render: (v) => <Text strong>{v}</Text> },
    { title: 'Branch', dataIndex: 'Branch_Name' },
    { title: 'Status', dataIndex: 'Is_Active', render: (v) => <Tag color={v ? 'green' : 'red'}>{v ? 'Active' : 'Inactive'}</Tag> },
    {
      title: 'Actions',
      render: (_, r) => (
        <Space size="small">
          <Button size="small" type="link" onClick={() => openAddCounter(r)}>+ Add Counter</Button>
          <Button size="small" type="link" icon={<EditOutlined />} onClick={() => openEditFloor(r)}>Edit</Button>
          <Button size="small" type="link" danger icon={<DeleteOutlined />} onClick={() => confirmDeleteFloor(r)}>Delete</Button>
        </Space>
      ),
    },
  ];

  const stockColumns = [
    { title: 'Location', dataIndex: 'Physical_Location', render: (v) => <Text code>{v}</Text> },
    { title: 'Items', dataIndex: 'item_count', render: (v) => <Tag color="blue">{v}</Tag> },
    { title: 'Total Weight', dataIndex: 'total_weight', render: (v) => formatWeight(v) },
    { title: 'Total Value', dataIndex: 'total_value', render: (v) => formatCurrency(v) },
  ];

  const trayColumns = [
    { title: 'Code', dataIndex: 'Tray_Code', width: 100 },
    { title: 'Name', dataIndex: 'Tray_Name', render: (v) => <Text strong>{v}</Text> },
    { title: 'Capacity', dataIndex: 'Capacity' },
    { title: 'Status', dataIndex: 'Is_Active', render: (v) => <Tag color={v ? 'green' : 'red'}>{v ? 'Active' : 'Inactive'}</Tag> },
    {
      title: 'Actions',
      render: (_, t) => (
        <Space size="small">
          <Button size="small" type="link" icon={<EditOutlined />} onClick={() => openEditTray(t)}>Edit</Button>
          <Button size="small" type="link" danger icon={<DeleteOutlined />} onClick={() => confirmDeleteTray(t)}>Delete</Button>
        </Space>
      ),
    },
  ];

  const hiddenLocColumns = [
    { title: 'Code', dataIndex: 'Location_Code', width: 120 },
    { title: 'Name', dataIndex: 'Location_Name', render: (v) => <Text strong>{v}</Text> },
    { title: 'Description', dataIndex: 'Description' },
    { title: 'Status', dataIndex: 'Is_Active', render: (v) => <Tag color={v ? 'green' : 'red'}>{v ? 'Active' : 'Inactive'}</Tag> },
    {
      title: 'Actions',
      render: (_, l) => (
        <Space size="small">
          <Button size="small" type="link" icon={<EditOutlined />} onClick={() => openEditHiddenLoc(l)}>Edit</Button>
          <Button size="small" type="link" danger icon={<DeleteOutlined />} onClick={() => confirmDeleteHiddenLoc(l)}>Delete</Button>
        </Space>
      ),
    },
  ];

  const totalItems = (liveStock || []).reduce((s, r) => s + parseInt(r.item_count || 0), 0);
  const totalValue = (liveStock || []).reduce((s, r) => s + parseFloat(r.total_value || 0), 0);

  return (
    <div className="page-wrapper">
      <div className="page-header">
        <Title level={4} style={{ margin: 0 }}>
          <Space><ApartmentOutlined style={{ color: '#B8860B' }} />Floor & Counter Management</Space>
        </Title>
        <Button ref={addFloorRef} type="primary" icon={<PlusOutlined />}
          style={{ background: '#B8860B', borderColor: '#B8860B' }}
          onClick={openAddFloor}>
          Add Floor
        </Button>
      </div>

      {/* Summary */}
      <Row ref={summaryRef} gutter={[12, 12]} style={{ marginBottom: 16 }}>
        {[
          { title: 'Total Floors', value: (floors || []).length, color: '#B8860B' },
          { title: 'Items on Floor', value: totalItems, color: '#1890ff' },
          { title: 'Floor Stock Value', value: totalValue, formatter: (v) => formatCurrency(v), color: '#52c41a' },
        ].map((s, i) => (
          <Col xs={8} key={i}>
            <Card bodyStyle={{ padding: '16px 20px' }} style={{ borderRadius: 8, border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.07)' }}>
              <Statistic title={<Text style={{ fontSize: 12, color: '#888' }}>{s.title}</Text>}
                value={s.value} formatter={s.formatter}
                valueStyle={{ color: s.color, fontSize: 22, fontWeight: 700 }} />
            </Card>
          </Col>
        ))}
      </Row>

      <div ref={tabsRef}>
      <Tabs defaultActiveKey="floors">
        <TabPane tab="Floor List" key="floors">
          <Card style={{ borderRadius: 8, border: 'none' }} bodyStyle={{ padding: 0 }}>
            <Table
            scroll={{ x: "max-content" }} columns={floorColumns} dataSource={floors || []} loading={isLoading}
              rowKey="Floor_ID" size="small" pagination={false}
              expandable={{ expandedRowRender: (r) => <CounterExpandedRow floor={r} onEdit={openEditCounter} /> }} />
          </Card>
        </TabPane>
        <TabPane tab="Live Stock by Location" key="stock">
          <Card style={{ borderRadius: 8, border: 'none' }} bodyStyle={{ padding: 0 }}>
            <Table
            scroll={{ x: "max-content" }} columns={stockColumns} dataSource={liveStock || []}
              rowKey="Physical_Location" size="small" pagination={{ pageSize: 20 }} />
          </Card>
        </TabPane>
        <TabPane tab="Trays / Showcases" key="trays">
          <Card style={{ borderRadius: 8, border: 'none', marginBottom: 12 }} bodyStyle={{ padding: 16 }}>
            <Space size="middle" wrap>
              <Select placeholder="Select Floor" style={{ width: 220 }} value={trayFloorId}
                onChange={(v) => { setTrayFloorId(v); setTrayCounterId(null); }}>
                {(floors || []).map(f => <Option key={f.Floor_ID} value={f.Floor_ID}>{f.Floor_Name}</Option>)}
              </Select>
              <Select placeholder="Select Counter" style={{ width: 220 }} value={trayCounterId} disabled={!trayFloorId}
                onChange={(v) => setTrayCounterId(v)}>
                {(trayCounters || []).map(c => <Option key={c.Counter_ID} value={c.Counter_ID}>{c.Counter_Name}</Option>)}
              </Select>
              <Button type="primary" icon={<PlusOutlined />} disabled={!trayCounterId}
                style={{ background: '#B8860B', borderColor: '#B8860B' }}
                onClick={openAddTray}>
                Add Tray
              </Button>
            </Space>
          </Card>
          <Card style={{ borderRadius: 8, border: 'none' }} bodyStyle={{ padding: 0 }}>
            <Table
              scroll={{ x: "max-content" }} columns={trayColumns} dataSource={trays || []} loading={traysLoading}
              rowKey="Tray_ID" size="small" pagination={false}
              locale={{ emptyText: trayCounterId ? 'No trays yet' : 'Select a floor and counter to view trays' }} />
          </Card>
        </TabPane>
        {canHiddenStock && (
          <TabPane tab={<Space><LockOutlined />Hidden Locations</Space>} key="hidden">
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
              <Button type="primary" icon={<PlusOutlined />}
                style={{ background: '#B8860B', borderColor: '#B8860B' }}
                onClick={openAddHiddenLoc}>
                Add Location
              </Button>
            </div>
            <Card style={{ borderRadius: 8, border: 'none' }} bodyStyle={{ padding: 0 }}>
              <Table
                scroll={{ x: "max-content" }} columns={hiddenLocColumns} dataSource={hiddenLocations || []} loading={hiddenLocLoading}
                rowKey="Hidden_Location_ID" size="small" pagination={false} />
            </Card>
          </TabPane>
        )}
      </Tabs>
      </div>

      {/* Add / Edit Floor Modal */}
      <Modal title={editingFloor ? 'Edit Floor' : 'Add New Floor'} open={floorModal}
        onCancel={() => { setFloorModal(false); setEditingFloor(null); }} footer={null}>
        <Form form={floorForm} layout="vertical"
          onFinish={(v) => editingFloor
            ? updateFloorMutation.mutate({ id: editingFloor.Floor_ID, data: { Floor_Name: v.Floor_Name, Floor_Number: v.Floor_Number, Description: v.Description, Is_Active: v.Is_Active } })
            : createFloorMutation.mutate(v)}>
          <Form.Item name="Branch_ID" label="Branch" rules={[{ required: true }]}>
            <Select placeholder="Select branch" disabled={!!editingFloor}>
              {(branches || []).map(b => <Option key={b.Branch_ID} value={b.Branch_ID}>{b.Branch_Name}</Option>)}
            </Select>
          </Form.Item>
          <Form.Item name="Floor_Code" label="Floor Code (e.g. GF, FF, SF)" rules={[{ required: true }]}>
            <Input placeholder="GF" style={{ textTransform: 'uppercase' }} disabled={!!editingFloor} />
          </Form.Item>
          <Form.Item name="Floor_Name" label="Floor Name" rules={[{ required: true }]}>
            <Input placeholder="Ground Floor — Gold Section" />
          </Form.Item>
          <Form.Item name="Floor_Number" label="Floor Number" initialValue={0}>
            <InputNumber style={{ width: '100%' }} min={0} />
          </Form.Item>
          <Form.Item name="Description" label="Description">
            <Input.TextArea rows={2} />
          </Form.Item>
          {editingFloor && (
            <Form.Item name="Is_Active" label="Status" initialValue={true}>
              <Select>
                <Option value={true}>Active</Option>
                <Option value={false}>Inactive</Option>
              </Select>
            </Form.Item>
          )}
          <Button type="primary" htmlType="submit" block
            loading={createFloorMutation.isPending || updateFloorMutation.isPending}
            style={{ background: '#B8860B', borderColor: '#B8860B' }}>
            {editingFloor ? 'Update Floor' : 'Create Floor'}
          </Button>
        </Form>
      </Modal>

      {/* Add / Edit Counter Modal */}
      <Modal title={`${editingCounter ? 'Edit' : 'Add'} Counter — ${selectedFloor?.Floor_Name || ''}`} open={counterModal}
        onCancel={() => { setCounterModal(false); setEditingCounter(null); }} footer={null}>
        <Form form={counterForm} layout="vertical"
          onFinish={(v) => editingCounter
            ? updateCounterMutation.mutate({ id: editingCounter.Counter_ID, data: { Counter_Name: v.Counter_Name, Counter_Type: v.Counter_Type, Capacity: v.Capacity, Is_Active: v.Is_Active } })
            : createCounterMutation.mutate(v)}>
          <Form.Item name="Floor_ID" hidden><Input /></Form.Item>
          <Form.Item name="Branch_ID" hidden><Input /></Form.Item>
          <Form.Item name="Counter_Code" label="Counter Code" rules={[{ required: true }]}>
            <Input placeholder="CTR-A, CTR-B, VAULT-1" disabled={!!editingCounter} />
          </Form.Item>
          <Form.Item name="Counter_Name" label="Counter Name" rules={[{ required: true }]}>
            <Input placeholder="Gold Ring Counter" />
          </Form.Item>
          <Form.Item name="Counter_Type" label="Type" initialValue="Showcase">
            <Select>
              <Option value="Showcase">Showcase</Option>
              <Option value="Tray">Tray</Option>
              <Option value="Vault">Vault</Option>
            </Select>
          </Form.Item>
          <Form.Item name="Capacity" label="Capacity (pieces)" initialValue={50}>
            <InputNumber style={{ width: '100%' }} min={1} />
          </Form.Item>
          {editingCounter && (
            <Form.Item name="Is_Active" label="Status" initialValue={true}>
              <Select>
                <Option value={true}>Active</Option>
                <Option value={false}>Inactive</Option>
              </Select>
            </Form.Item>
          )}
          <Button type="primary" htmlType="submit" block
            loading={createCounterMutation.isPending || updateCounterMutation.isPending}
            style={{ background: '#B8860B', borderColor: '#B8860B' }}>
            {editingCounter ? 'Update Counter' : 'Create Counter'}
          </Button>
        </Form>
      </Modal>

      {/* Add / Edit Tray Modal */}
      <Modal title={editingTray ? 'Edit Tray' : 'Add Tray'} open={trayModal}
        onCancel={() => { setTrayModal(false); setEditingTray(null); }} footer={null}>
        <Form form={trayForm} layout="vertical"
          onFinish={(v) => editingTray
            ? updateTrayMutation.mutate({ id: editingTray.Tray_ID, data: { Tray_Name: v.Tray_Name, Capacity: v.Capacity, Is_Active: v.Is_Active } })
            : createTrayMutation.mutate(v)}>
          <Form.Item name="Floor_ID" hidden><Input /></Form.Item>
          <Form.Item name="Counter_ID" hidden><Input /></Form.Item>
          <Form.Item name="Branch_ID" hidden><Input /></Form.Item>
          <Form.Item name="Tray_Code" label="Tray Code" rules={[{ required: true }]}>
            <Input placeholder="TRY-01" disabled={!!editingTray} />
          </Form.Item>
          <Form.Item name="Tray_Name" label="Tray Name" rules={[{ required: true }]}>
            <Input placeholder="Ring Tray 1" />
          </Form.Item>
          <Form.Item name="Capacity" label="Capacity (pieces)" initialValue={20}>
            <InputNumber style={{ width: '100%' }} min={1} />
          </Form.Item>
          {editingTray && (
            <Form.Item name="Is_Active" label="Status" initialValue={true}>
              <Select>
                <Option value={true}>Active</Option>
                <Option value={false}>Inactive</Option>
              </Select>
            </Form.Item>
          )}
          <Button type="primary" htmlType="submit" block
            loading={createTrayMutation.isPending || updateTrayMutation.isPending}
            style={{ background: '#B8860B', borderColor: '#B8860B' }}>
            {editingTray ? 'Update Tray' : 'Create Tray'}
          </Button>
        </Form>
      </Modal>

      {/* Add / Edit Hidden Location Modal */}
      {canHiddenStock && (
        <Modal title={editingHiddenLoc ? 'Edit Hidden Location' : 'Add Hidden Location'} open={hiddenLocModal}
          onCancel={() => { setHiddenLocModal(false); setEditingHiddenLoc(null); }} footer={null}>
          <Form form={hiddenLocForm} layout="vertical"
            onFinish={(v) => editingHiddenLoc
              ? updateHiddenLocMutation.mutate({ id: editingHiddenLoc.Hidden_Location_ID, data: { Location_Name: v.Location_Name, Description: v.Description, Is_Active: v.Is_Active } })
              : createHiddenLocMutation.mutate(v)}>
            <Form.Item name="Location_Code" label="Location Code" rules={[{ required: true }]}>
              <Input placeholder="HID-01" disabled={!!editingHiddenLoc} />
            </Form.Item>
            <Form.Item name="Location_Name" label="Location Name" rules={[{ required: true }]}>
              <Input placeholder="Back Office Safe" />
            </Form.Item>
            <Form.Item name="Description" label="Description">
              <Input.TextArea rows={2} />
            </Form.Item>
            {editingHiddenLoc && (
              <Form.Item name="Is_Active" label="Status" initialValue={true}>
                <Select>
                  <Option value={true}>Active</Option>
                  <Option value={false}>Inactive</Option>
                </Select>
              </Form.Item>
            )}
            <Button type="primary" htmlType="submit" block
              loading={createHiddenLocMutation.isPending || updateHiddenLocMutation.isPending}
              style={{ background: '#B8860B', borderColor: '#B8860B' }}>
              {editingHiddenLoc ? 'Update Location' : 'Create Location'}
            </Button>
          </Form>
        </Modal>
      )}

      <PageTour steps={tourSteps} />
    </div>
  );
}
