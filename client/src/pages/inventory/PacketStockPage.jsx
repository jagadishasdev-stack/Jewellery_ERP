/**
 * Packet Stock — grouping ornaments into one physical packet (a sealed
 * pouch of similar small items), tracked and moved as one unit. Genuinely
 * absent before this — zero matches anywhere in the codebase.
 */
import React, { useState } from 'react';
import {
  Table, Card, Button, Modal, Form, Input, Select, Space, Tag, Typography,
  Drawer, List, message, Popconfirm, Empty,
} from 'antd';
import { PlusOutlined, InboxOutlined, DeleteOutlined, LockOutlined, ScanOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { packetStockApi, ornamentsApi } from '../../api/modules';
import { useMetalTypes } from '../../hooks/useMetalTypes';
import { formatWeight } from '../../utils/calculations';
import dayjs from 'dayjs';

const { Text } = Typography;

const STATUS_COLOR = { Open: 'blue', Closed: 'green', Transferred: 'purple' };

export default function PacketStockPage() {
  const qc = useQueryClient();
  const { metalTypes } = useMetalTypes();
  const [createOpen, setCreateOpen] = useState(false);
  const [detailId, setDetailId] = useState(null);
  const [scanValue, setScanValue] = useState('');
  const [form] = Form.useForm();

  const { data: packets, isLoading } = useQuery({
    queryKey: ['packet-stock'],
    queryFn: () => packetStockApi.list().then((r) => r.data.data || []),
  });

  const { data: detail, isLoading: detailLoading } = useQuery({
    queryKey: ['packet-stock-detail', detailId],
    queryFn: () => packetStockApi.getById(detailId).then((r) => r.data.data),
    enabled: !!detailId,
  });

  const createMutation = useMutation({
    mutationFn: (data) => packetStockApi.create(data),
    onSuccess: (res) => {
      message.success(`Packet ${res.data.data.Packet_Number} created.`);
      qc.invalidateQueries({ queryKey: ['packet-stock'] });
      setCreateOpen(false);
      form.resetFields();
    },
    onError: (err) => message.error(err.response?.data?.message || 'Failed to create packet.'),
  });

  const addItemMutation = useMutation({
    mutationFn: (ornamentId) => packetStockApi.addItem(detailId, { Ornament_ID: ornamentId }),
    onSuccess: () => {
      message.success('Item added.');
      qc.invalidateQueries({ queryKey: ['packet-stock-detail', detailId] });
      qc.invalidateQueries({ queryKey: ['packet-stock'] });
      setScanValue('');
    },
    onError: (err) => message.error(err.response?.data?.message || 'Failed to add item.'),
  });

  const removeItemMutation = useMutation({
    mutationFn: (itemId) => packetStockApi.removeItem(detailId, itemId),
    onSuccess: () => {
      message.success('Item removed.');
      qc.invalidateQueries({ queryKey: ['packet-stock-detail', detailId] });
      qc.invalidateQueries({ queryKey: ['packet-stock'] });
    },
    onError: (err) => message.error(err.response?.data?.message || 'Failed to remove item.'),
  });

  const closeMutation = useMutation({
    mutationFn: () => packetStockApi.close(detailId),
    onSuccess: () => {
      message.success('Packet closed.');
      qc.invalidateQueries({ queryKey: ['packet-stock-detail', detailId] });
      qc.invalidateQueries({ queryKey: ['packet-stock'] });
    },
    onError: (err) => message.error(err.response?.data?.message || 'Failed to close packet.'),
  });

  const scanAndAdd = async () => {
    const code = scanValue.trim();
    if (!code) return;
    try {
      const res = await ornamentsApi.getByBarcode(code);
      addItemMutation.mutate(res.data.data.Ornament_ID);
    } catch {
      message.error(`No ornament found for barcode "${code}".`);
    }
  };

  const columns = [
    { title: 'Packet No.', dataIndex: 'Packet_Number', render: (v) => <Text code strong>{v}</Text> },
    { title: 'Metal', dataIndex: 'Metal_Type' },
    { title: 'Location', render: (_, r) => [r.Floor_Name, r.Counter_Name].filter(Boolean).join(' / ') || '-' },
    { title: 'Items', dataIndex: 'item_count' },
    { title: 'Status', dataIndex: 'Status', render: (v) => <Tag color={STATUS_COLOR[v] || 'default'}>{v}</Tag> },
    { title: 'Created', dataIndex: 'Created_Date', render: (v) => dayjs(v).format('DD-MMM-YYYY') },
    { title: 'Actions', render: (_, r) => <Button size="small" onClick={() => setDetailId(r.Packet_ID)}>View</Button> },
  ];

  return (
    <div className="page-wrapper">
      <div className="page-header">
        <div>
          <div className="page-header-title">Packet Stock</div>
          <div className="page-header-sub">{packets?.length || 0} packets</div>
        </div>
        <Button type="primary" icon={<PlusOutlined />} style={{ background: '#B8860B', borderColor: '#B8860B' }} onClick={() => setCreateOpen(true)}>
          New Packet
        </Button>
      </div>

      <Card className="erp-card" bodyStyle={{ padding: 0 }}>
        <Table className="erp-table" columns={columns} dataSource={packets || []} loading={isLoading} rowKey="Packet_ID"
          pagination={{ pageSize: 20 }} size="small" />
      </Card>

      <Modal title="New Packet" open={createOpen} onCancel={() => setCreateOpen(false)} footer={null} destroyOnClose>
        <Form form={form} layout="vertical" onFinish={(v) => createMutation.mutate(v)}>
          <Form.Item name="Metal_Type" label="Metal Type" rules={[{ required: true }]}>
            <Select options={metalTypes.map((m) => ({ value: m, label: m }))} />
          </Form.Item>
          <Form.Item name="Notes" label="Notes">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Button type="primary" htmlType="submit" block loading={createMutation.isPending} style={{ background: '#B8860B', borderColor: '#B8860B' }}>
            Create Packet
          </Button>
        </Form>
      </Modal>

      <Drawer
        title={detail?.packet?.Packet_Number} placement="right" width={480}
        open={!!detailId} onClose={() => setDetailId(null)} loading={detailLoading}
        extra={detail?.packet?.Status === 'Open' && (
          <Popconfirm title="Close this packet? No more items can be added afterward." onConfirm={() => closeMutation.mutate()}>
            <Button icon={<LockOutlined />} loading={closeMutation.isPending}>Close Packet</Button>
          </Popconfirm>
        )}
      >
        {detail && (
          <>
            <Space style={{ marginBottom: 12 }}>
              <Tag color={STATUS_COLOR[detail.packet.Status]}>{detail.packet.Status}</Tag>
              <Text type="secondary">{detail.packet.Metal_Type}</Text>
            </Space>

            {detail.packet.Status === 'Open' && (
              <Space.Compact style={{ width: '100%', marginBottom: 16 }}>
                <Input
                  prefix={<ScanOutlined />}
                  placeholder="Scan / enter barcode to add"
                  value={scanValue}
                  onChange={(e) => setScanValue(e.target.value)}
                  onPressEnter={scanAndAdd}
                />
                <Button onClick={scanAndAdd} loading={addItemMutation.isPending}>Add</Button>
              </Space.Compact>
            )}

            {detail.items.length === 0 ? (
              <Empty description="No items yet" />
            ) : (
              <List
                dataSource={detail.items}
                renderItem={(item) => (
                  <List.Item
                    actions={detail.packet.Status === 'Open' ? [
                      <Button key="remove" type="text" danger size="small" icon={<DeleteOutlined />}
                        onClick={() => removeItemMutation.mutate(item.Packet_Item_ID)} />,
                    ] : []}
                  >
                    <List.Item.Meta
                      avatar={<InboxOutlined style={{ color: '#B8860B', fontSize: 18 }} />}
                      title={<Text code>{item.Article_Number}</Text>}
                      description={`${item.Type_Name || 'Item'} — ${formatWeight(item.Gross_Weight)} gross`}
                    />
                  </List.Item>
                )}
              />
            )}
          </>
        )}
      </Drawer>
    </div>
  );
}
