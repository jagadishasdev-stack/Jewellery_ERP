/**
 * Rate Entry — a genuine standalone location for setting today's metal
 * rate. MetalRateDashboard has lived on the main Dashboard since it was
 * built, which works, but it had no menu entry or dedicated URL of its
 * own — the Master-menu audit flagged this as "buried" (Transaction →
 * Utility in the reference software has it as its own item). This is a
 * thin wrapper, not a rebuild: the widget itself, its data, and its logic
 * are unchanged and still show on the Dashboard too.
 */
import React from 'react';
import { Typography } from 'antd';
import { DollarCircleOutlined } from '@ant-design/icons';
import MetalRateDashboard from '../../components/MetalRateDashboard';

const { Title, Text } = Typography;

export default function RateEntryPage() {
  return (
    <div className="page-wrapper">
      <div className="page-header">
        <Title level={4} style={{ margin: 0 }}><DollarCircleOutlined style={{ color: '#B8860B', marginRight: 8 }} />Rate Entry</Title>
        <Text type="secondary" style={{ fontSize: 12 }}>Set today's Gold/Silver rate — also shown on the Dashboard</Text>
      </div>
      <MetalRateDashboard />
    </div>
  );
}
