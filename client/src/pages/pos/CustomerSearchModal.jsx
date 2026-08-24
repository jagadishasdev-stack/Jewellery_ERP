import React, { useState } from 'react';
import { Modal, Input, List, Avatar, Typography, Button, Space, message } from 'antd';
import { UserOutlined, PlusOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { customersApi } from '../../api/modules';

const { Text } = Typography;

export default function CustomerSearchModal({ open, onClose, onSelect }) {
  const [search, setSearch] = useState('');

  const { data: customers, isFetching } = useQuery({
    queryKey: ['customer-search', search],
    queryFn: () => customersApi.search({ mobile: search, name: search }).then((r) => r.data.data),
    enabled: search.length >= 3,
  });

  return (
    <Modal title="Search Customer" open={open} onCancel={onClose} footer={null} width={480}>
      <Input.Search
        placeholder="Search by name or mobile (min 3 chars)"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        loading={isFetching}
        size="large"
        style={{ marginBottom: 16 }}
      />
      <List
        dataSource={customers || []}
        locale={{ emptyText: search.length >= 3 ? 'No customers found' : 'Type to search...' }}
        renderItem={(c) => (
          <List.Item
            style={{ cursor: 'pointer', padding: '10px 8px', borderRadius: 6 }}
            onClick={() => onSelect(c)}
            actions={[<Button type="link" size="small">Select</Button>]}
          >
            <List.Item.Meta
              avatar={<Avatar icon={<UserOutlined />} style={{ background: '#B8860B' }} />}
              title={<Text strong>{c.Customer_Name}</Text>}
              description={
                <Space>
                  <Text style={{ fontSize: 12 }}>{c.Mobile_1}</Text>
                  <Text type="secondary" style={{ fontSize: 11 }}>Loyalty: {c.Loyalty_Points} pts</Text>
                </Space>
              }
            />
          </List.Item>
        )}
      />
    </Modal>
  );
}
