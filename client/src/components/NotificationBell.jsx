/**
 * NotificationBell — the header's Bell icon used to be a dead placeholder
 * (Badge count={0} always). This reads the real summary from
 * notifications.js and shows what's actually pending, linking each
 * category to the page that handles it.
 */
import React, { useState } from 'react';
import { Badge, Button, Popover, List, Typography, Empty } from 'antd';
import { BellOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { notificationsApi } from '../api/modules';

const { Text } = Typography;

const CATEGORIES = [
  { key: 'pendingApprovalReceipt', label: 'Approval vouchers awaiting receipt', path: '/approval' },
  { key: 'pendingBranchTransfer', label: 'Branch transfers awaiting approval', path: '/transfer' },
  { key: 'repairReady', label: 'Repairs ready for pickup', path: '/repair' },
  { key: 'pendingCustomerOrder', label: 'Customer orders not yet delivered', path: '/bin?tab=orders' },
  { key: 'insuranceExpiring', label: 'Insurance policies expiring soon', path: '/insurance-amc' },
  { key: 'failedSync', label: 'Sync failures (last 7 days)', path: '/admin/sync-status' },
];

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  const { data } = useQuery({
    queryKey: ['notifications-summary'],
    queryFn: () => notificationsApi.getSummary().then((r) => r.data.data),
    refetchInterval: 60000,
  });

  const counts = data?.counts || {};
  const items = CATEGORIES.map((c) => ({ ...c, count: counts[c.key] || 0 })).filter((c) => c.count > 0);

  return (
    <Popover
      open={open} onOpenChange={setOpen} trigger="click" placement="bottomRight"
      title="Notifications"
      content={
        <div style={{ width: 300, maxHeight: 360, overflowY: 'auto' }}>
          {items.length === 0 ? (
            <Empty description="Nothing pending" image={Empty.PRESENTED_IMAGE_SIMPLE} style={{ margin: '16px 0' }} />
          ) : (
            <List
              dataSource={items}
              renderItem={(item) => (
                <List.Item style={{ cursor: 'pointer', padding: '8px 4px' }} onClick={() => { navigate(item.path); setOpen(false); }}>
                  <Text style={{ fontSize: 13 }}>{item.label}</Text>
                  <Badge count={item.count} style={{ backgroundColor: '#B8860B' }} />
                </List.Item>
              )}
            />
          )}
        </div>
      }
    >
      <Badge count={data?.total || 0} size="small">
        <Button type="text" icon={<BellOutlined />} style={{ color: '#666', width: 36, height: 36 }} />
      </Badge>
    </Popover>
  );
}
