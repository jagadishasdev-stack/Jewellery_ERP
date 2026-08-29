/**
 * Stock Reconciliation / physical count — confirmed genuinely missing by
 * the Master/Reports/Utility audit. Deliberately two-step: a count is
 * saved as a Draft first (every item's variance fully visible for
 * review), and stock is only ever adjusted by a separate, explicit
 * "Apply" action — never automatically the moment a count is saved.
 */
import React, { useState } from 'react';
import {
  Typography, Card, Table, Button, Space, Tag, Modal, Form, Select,
  InputNumber, DatePicker, Input, message, Popconfirm, Descriptions, Empty,
} from 'antd';
import { PlusOutlined, CheckCircleOutlined, DeleteOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { stockReconciliationApi, ornamentsApi } from '../../api/modules';
import PageTour from '../../components/PageTour';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { Option } = Select;

export default function StockReconciliationPage() {
  const [createOpen, setCreateOpen] = useState(false);
  const [detailId, setDetailId] = useState(null);
  const [pendingItems, setPendingItems] = useState([]); // [{ Ornament_ID, Article_Number, System_Quantity, Counted_Quantity }]
  const [form] = Form.useForm();
  const qc = useQueryClient();

  const { data: reconciliations, isLoading } = useQuery({
    queryKey: ['stock-reconciliations'],
    queryFn: () => stockReconciliationApi.getAll().then((r) => r.data.data || []),
  });

  const { data: ornaments } = useQuery({
    queryKey: ['stock-recon-ornaments'],
    queryFn: () => ornamentsApi.getAll({ isSold: false, limit: 500 }).then((r) => r.data.data?.items || r.data.data || []),
    enabled: createOpen,
  });

  const { data: detail, isLoading: detailLoading } = useQuery({
    queryKey: ['stock-reconciliation-detail', detailId],
    queryFn: () => stockReconciliationApi.getById(detailId).then((r) => r.data.data),
    enabled: !!detailId,
  });

  const createMutation = useMutation({
    mutationFn: (data) => stockReconciliationApi.create(data),
    onSuccess: () => {
      message.success('Reconciliation saved as Draft.');
      qc.invalidateQueries(['stock-reconciliations']);
      setCreateOpen(false); setPendingItems([]); form.resetFields();
    },
    onError: (err) => message.error(err.response?.data?.message || 'Failed to save reconciliation.'),
  });

  const applyMutation = useMutation({
    mutationFn: (id) => stockReconciliationApi.apply(id),
    onSuccess: (res) => {
      message.success(res.data.message || 'Applied.');
      qc.invalidateQueries(['stock-reconciliations']);
      qc.invalidateQueries(['stock-reconciliation-detail', detailId]);
    },
    onError: (err) => message.error(err.response?.data?.message || 'Failed to apply.'),
  });

  const addItem = (ornamentId) => {
    if (pendingItems.some((p) => p.Ornament_ID === ornamentId)) { message.warning('Already added.'); return; }
    const orn = (ornaments || []).find((o) => o.Ornament_ID === ornamentId);
    if (!orn) return;
    setPendingItems((prev) => [...prev, { Ornament_ID: orn.Ornament_ID, Article_Number: orn.Article_Number, System_Quantity: orn.Stock_Quantity, Counted_Quantity: orn.Stock_Quantity }]);
  };

  const listColumns = [
    { title: 'Recon #', dataIndex: 'Recon_Number', render: (v) => <Text code style={{ fontSize: 11 }}>{v}</Text> },
    { title: 'Date', dataIndex: 'Recon_Date', render: (v) => dayjs(v).format('DD-MMM-YYYY') },
    { title: 'Items Counted', dataIndex: 'item_count' },
    { title: 'Total Variance', dataIndex: 'total_abs_variance', render: (v) => v > 0 ? <Tag color="orange">{v}</Tag> : <Tag color="green">0</Tag> },
    { title: 'Status', dataIndex: 'Status', render: (v) => <Tag color={v === 'Applied' ? 'green' : 'blue'}>{v}</Tag> },
    { title: '', render: (_, r) => <Button size="small" onClick={() => setDetailId(r.Recon_ID)}>View</Button> },
  ];

  const detailColumns = [
    { title: 'Article Number', dataIndex: 'Article_Number', render: (v) => <Text code style={{ fontSize: 11 }}>{v}</Text> },
    { title: 'System Qty', dataIndex: 'System_Quantity' },
    { title: 'Counted Qty', dataIndex: 'Counted_Quantity' },
    { title: 'Variance', dataIndex: 'Variance', render: (v) => v === 0 ? <Tag color="green">0</Tag> : v > 0 ? <Tag color="blue">+{v}</Tag> : <Tag color="red">{v}</Tag> },
    { title: 'Remarks', dataIndex: 'Remarks', render: (v) => v || '-' },
  ];

  return (
    <div className="page-wrapper">
      <div className="page-header">
        <Title level={4} style={{ margin: 0 }}>Stock Reconciliation</Title>
        <Button type="primary" icon={<PlusOutlined />} style={{ background: '#B8860B', borderColor: '#B8860B' }} onClick={() => setCreateOpen(true)}>
          New Reconciliation
        </Button>
      </div>

      <Card bodyStyle={{ padding: 0 }} style={{ borderRadius: 8 }}>
        <Table
          scroll={{ x: 'max-content' }} size="small" loading={isLoading} rowKey="Recon_ID" pagination={{ pageSize: 15 }}
          dataSource={reconciliations || []} columns={listColumns}
        />
      </Card>

      {/* Create Modal */}
      <Modal
        title="New Stock Reconciliation" open={createOpen} width={720}
        onCancel={() => { setCreateOpen(false); setPendingItems([]); form.resetFields(); }}
        footer={null} destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={(v) => {
          if (!pendingItems.length) { message.warning('Add at least one item to count.'); return; }
          createMutation.mutate({
            Recon_Date: v.Recon_Date.format('YYYY-MM-DD'), Notes: v.Notes,
            items: pendingItems.map((p) => ({ Ornament_ID: p.Ornament_ID, Counted_Quantity: p.Counted_Quantity })),
          });
        }}>
          <Form.Item name="Recon_Date" label="Count Date" rules={[{ required: true }]} initialValue={dayjs()}>
            <DatePicker style={{ width: '100%' }} format="DD-MMM-YYYY" />
          </Form.Item>
          <Form.Item name="Notes" label="Notes (optional)">
            <Input.TextArea rows={2} placeholder="e.g. Monthly physical count — first floor" />
          </Form.Item>
          <Form.Item label="Add Item">
            <Select showSearch optionFilterProp="children" placeholder="Search by Article Number" onSelect={addItem} value={null}>
              {(ornaments || []).filter((o) => !pendingItems.some((p) => p.Ornament_ID === o.Ornament_ID)).map((o) => (
                <Option key={o.Ornament_ID} value={o.Ornament_ID}>{o.Article_Number} — system qty {o.Stock_Quantity}</Option>
              ))}
            </Select>
          </Form.Item>

          <Table
            scroll={{ x: 'max-content' }} size="small" pagination={false} rowKey="Ornament_ID"
            dataSource={pendingItems}
            locale={{ emptyText: 'No items added yet' }}
            columns={[
              { title: 'Article Number', dataIndex: 'Article_Number' },
              { title: 'System Qty', dataIndex: 'System_Quantity' },
              {
                title: 'Counted Qty', dataIndex: 'Counted_Quantity',
                render: (v, r) => (
                  <InputNumber min={0} value={v} style={{ width: 90 }}
                    onChange={(nv) => setPendingItems((prev) => prev.map((p) => p.Ornament_ID === r.Ornament_ID ? { ...p, Counted_Quantity: nv } : p))} />
                ),
              },
              { title: 'Variance', render: (_, r) => { const d = r.Counted_Quantity - r.System_Quantity; return d === 0 ? <Tag color="green">0</Tag> : d > 0 ? <Tag color="blue">+{d}</Tag> : <Tag color="red">{d}</Tag>; } },
              { title: '', render: (_, r) => <Button size="small" danger type="text" icon={<DeleteOutlined />} onClick={() => setPendingItems((prev) => prev.filter((p) => p.Ornament_ID !== r.Ornament_ID))} /> },
            ]}
            style={{ marginBottom: 16 }}
          />

          <Button type="primary" htmlType="submit" block loading={createMutation.isPending} style={{ background: '#B8860B', borderColor: '#B8860B' }}>
            Save as Draft
          </Button>
        </Form>
      </Modal>

      {/* Detail Modal */}
      <Modal title={`Reconciliation — ${detail?.header?.Recon_Number || ''}`} open={!!detailId} onCancel={() => setDetailId(null)} width={780} footer={null} destroyOnClose>
        {detail && (
          <div>
            <Descriptions size="small" bordered column={2} style={{ marginBottom: 16 }}>
              <Descriptions.Item label="Date">{dayjs(detail.header.Recon_Date).format('DD-MMM-YYYY')}</Descriptions.Item>
              <Descriptions.Item label="Status"><Tag color={detail.header.Status === 'Applied' ? 'green' : 'blue'}>{detail.header.Status}</Tag></Descriptions.Item>
              <Descriptions.Item label="Created By">{detail.header.Created_By}</Descriptions.Item>
              <Descriptions.Item label="Applied By">{detail.header.Applied_By || '-'}</Descriptions.Item>
              <Descriptions.Item label="Notes" span={2}>{detail.header.Notes || '-'}</Descriptions.Item>
            </Descriptions>
            <Table
              scroll={{ x: 'max-content' }} size="small" loading={detailLoading} rowKey="Item_ID" pagination={false}
              dataSource={detail.items || []} columns={detailColumns}
              locale={{ emptyText: <Empty description="No items" /> }}
            />
            {detail.header.Status === 'Draft' && (
              <Popconfirm
                title="Apply this reconciliation?"
                description="Every ornament with a nonzero variance will have its stock quantity updated to the counted quantity. This cannot be undone by re-applying."
                onConfirm={() => applyMutation.mutate(detail.header.Recon_ID)}
                okText="Apply" okButtonProps={{ danger: true }}
              >
                <Button type="primary" danger icon={<CheckCircleOutlined />} block style={{ marginTop: 16 }} loading={applyMutation.isPending}>
                  Apply Adjustment
                </Button>
              </Popconfirm>
            )}
          </div>
        )}
      </Modal>

      <PageTour steps={[
        { title: 'Stock Reconciliation', description: 'Enter a physical count as a Draft — every item\'s variance (counted vs system) is visible before anything changes. Stock quantities only update once you explicitly click "Apply Adjustment" on a Draft.' },
      ]} />
    </div>
  );
}
