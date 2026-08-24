import React, { useState } from 'react';
import {
  Card, Typography, Space, Button, Select, Tag, Row, Col,
  Statistic, message, Alert,
} from 'antd';
import { ShopOutlined, CheckCircleFilled } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { floorsApi } from '../../api/modules';
import { useCounterStore } from '../../store/counterStore';
import { useAuthStore } from '../../store/authStore';

const { Title, Text } = Typography;
const { Option, OptGroup } = Select;

/**
 * CounterSelectPage — shown at the start of every POS window.
 * Cashier must select which counter they're operating.
 * Using sessionStorage means each browser window picks independently.
 */
export default function CounterSelectPage({ onSelected }) {
  const [selectedId, setSelectedId] = useState(null);
  const [selectedName, setSelectedName] = useState('');
  const { setCounter } = useCounterStore();
  const { user } = useAuthStore();

  const { data: floors } = useQuery({
    queryKey: ['floors'],
    queryFn: () => floorsApi.getAll().then(r => r.data.data),
  });

  // Group counters by floor
  const countersByFloor = (floors || []).reduce((acc, floor) => {
    acc[floor.Floor_Name] = acc[floor.Floor_Name] || { floorId: floor.Floor_ID, items: [] };
    return acc;
  }, {});

  const { data: allCounters } = useQuery({
    queryKey: ['all-counters'],
    queryFn: async () => {
      if (!floors?.length) return [];
      const results = await Promise.all(
        (floors || []).map(f =>
          floorsApi.getCounters(f.Floor_ID).then(r =>
            r.data.data.map(c => ({ ...c, Floor_Name: f.Floor_Name, Floor_ID: f.Floor_ID }))
          )
        )
      );
      return results.flat();
    },
    enabled: !!(floors?.length),
  });

  const handleConfirm = () => {
    if (!selectedId) { message.warning('Please select a counter first.'); return; }
    setCounter(selectedId, selectedName);
    onSelected?.();
  };

  // Also allow creating a quick "Walk-in Counter" without setup
  const handleWalkIn = () => {
    setCounter(null, 'Walk-in Counter');
    onSelected?.();
  };

  const groupedCounters = (allCounters || []).reduce((acc, c) => {
    const key = c.Floor_Name;
    if (!acc[key]) acc[key] = [];
    acc[key].push(c);
    return acc;
  }, {});

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
    }}>
      <Card
        style={{ width: 480, borderRadius: 16, boxShadow: '0 20px 60px rgba(0,0,0,0.5)', border: 'none' }}
        bodyStyle={{ padding: '40px 36px' }}
      >
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{
            width: 72, height: 72, borderRadius: '50%', background: '#B8860B',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 32, marginBottom: 16,
          }}>
            <ShopOutlined style={{ color: 'white' }} />
          </div>
          <Title level={3} style={{ margin: 0 }}>Select Your Counter</Title>
          <Text type="secondary">
            {user?.companyName} — {user?.fullName}
          </Text>
          <br />
          <Text type="secondary" style={{ fontSize: 12 }}>
            Each window is an independent POS counter with its own sales report
          </Text>
        </div>

        <Alert
          message="Independent Counter Mode"
          description="Sales on this window will be recorded under the counter you select. Open another window (Ctrl+F9) for a second counter."
          type="info"
          showIcon
          style={{ marginBottom: 24, borderRadius: 8, fontSize: 12 }}
        />

        {/* Counter Selection */}
        {(allCounters || []).length > 0 ? (
          <div>
            <Text strong style={{ display: 'block', marginBottom: 8 }}>Select Counter</Text>
            <Select
              style={{ width: '100%' }}
              size="large"
              placeholder="Choose your billing counter..."
              value={selectedId}
              onChange={(val, option) => {
                setSelectedId(val);
                setSelectedName(option?.label || '');
              }}
              optionLabelProp="label"
            >
              {Object.entries(groupedCounters).map(([floorName, counters]) => (
                <OptGroup key={floorName} label={floorName}>
                  {counters.map(c => (
                    <Option
                      key={c.Counter_ID}
                      value={c.Counter_ID}
                      label={c.Counter_Name}
                    >
                      <Space>
                        <Tag color="blue" style={{ fontSize: 11 }}>{c.Counter_Type}</Tag>
                        <Text strong>{c.Counter_Name}</Text>
                        <Text type="secondary" style={{ fontSize: 11 }}>{floorName}</Text>
                      </Space>
                    </Option>
                  ))}
                </OptGroup>
              ))}
            </Select>

            <Button
              type="primary"
              block
              size="large"
              icon={<CheckCircleFilled />}
              style={{ marginTop: 16, background: '#B8860B', borderColor: '#B8860B', height: 48, fontWeight: 700 }}
              onClick={handleConfirm}
              disabled={!selectedId}
            >
              Start Billing at {selectedName || 'Selected Counter'}
            </Button>
          </div>
        ) : (
          <Alert
            message="No counters configured yet"
            description="Go to Floor Management to set up floors and counters first, or use Walk-in below."
            type="warning"
            showIcon
            style={{ marginBottom: 16 }}
          />
        )}

        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <Button type="link" onClick={handleWalkIn} style={{ color: '#888' }}>
            Continue as Walk-in Counter (no tracking)
          </Button>
        </div>
      </Card>
    </div>
  );
}
