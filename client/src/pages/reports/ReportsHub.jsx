/**
 * Reports Hub — Central entry point for all report categories
 * Sales | Inventory | Financial | Customer | Scheme | Management
 */
import React, { useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Row, Col, Card, Typography, Tag, Space, Button } from 'antd';
import {
  BarChartOutlined, GoldOutlined, BankOutlined, TeamOutlined,
  LineChartOutlined, DashboardOutlined, FileProtectOutlined,
} from '@ant-design/icons';
import PageTour from '../../components/PageTour';

const { Title, Text } = Typography;

const REPORT_CATEGORIES = [
  {
    key: 'sales', icon: <BarChartOutlined style={{ fontSize: 32, color: '#B8860B' }} />,
    title: 'Sales Reports', color: '#B8860B', badge: 'Sales', badgeColor: 'gold',
    route: '/reports/sales-reports',
    reports: ['Sales Bill History', 'Daily Sales Report', 'Item Wise Sales', 'Sales Return Report', 'Counter Wise Sales', 'Branch Wise Sales'],
  },
  {
    key: 'inventory', icon: <GoldOutlined style={{ fontSize: 32, color: '#52c41a' }} />,
    title: 'Inventory Reports', color: '#52c41a', badge: 'Stock', badgeColor: 'green',
    route: '/reports/inventory-reports',
    reports: ['Current Stock', 'Dead Stock', 'Fast Moving Stock', 'Slow Moving Stock', 'Item Movement Report', 'Closing Report'],
  },
  {
    key: 'financial', icon: <BankOutlined style={{ fontSize: 32, color: '#1890ff' }} />,
    title: 'Financial Reports', color: '#1890ff', badge: 'Finance', badgeColor: 'blue',
    route: '/reports/financial-reports',
    reports: ['Cash Book', 'Bank Book', 'Day Book', 'Ledger Report', 'Profit & Loss', 'Balance Sheet'],
  },
  {
    key: 'gst-returns', icon: <FileProtectOutlined style={{ fontSize: 32, color: '#B8860B' }} />,
    title: 'GST Returns', color: '#B8860B', badge: 'GSTR-1/3B', badgeColor: 'gold',
    route: '/reports/gst-returns',
    reports: ['B2B', 'B2CL', 'B2CS', 'HSN Summary', 'GSTR-3B Summary'],
  },
  {
    key: 'customer', icon: <TeamOutlined style={{ fontSize: 32, color: '#722ed1' }} />,
    title: 'Customer Reports', color: '#722ed1', badge: 'CRM', badgeColor: 'purple',
    route: '/reports/customer-reports',
    reports: ['Customer Ledger', 'Purchase History', 'Customer Outstanding'],
  },
  {
    key: 'scheme', icon: <LineChartOutlined style={{ fontSize: 32, color: '#fa8c16' }} />,
    title: 'Scheme Reports', color: '#fa8c16', badge: 'Scheme', badgeColor: 'orange',
    route: '/reports/scheme-reports',
    reports: ['Scheme Collection', 'App Collection', 'Counter Collection', 'Scheme Adjustment', 'Scheme Maturity'],
  },
  {
    key: 'management', icon: <DashboardOutlined style={{ fontSize: 32, color: '#eb2f96' }} />,
    title: 'Management Reports', color: '#eb2f96', badge: 'MIS', badgeColor: 'magenta',
    route: '/reports/management-reports',
    reports: ['Dashboard Analytics', 'Branch Analytics', 'Employee Analytics', 'Sales Target vs Achievement', 'Collection Target vs Achievement'],
  },
];

export default function ReportsHub() {
  const navigate = useNavigate();

  // ── Walkthrough tour refs ───────────────────────────────────────────────────
  const cardsRef = useRef(null);
  const tourSteps = [
    { title: 'Report Categories', description: 'Click any category to open it. Financial Reports is where all accounting lives — Cash Book, Bank Book, Day Book, Ledger, P&L and Balance Sheet — all posted automatically from your daily sales, purchases and payments, no manual journal entries needed.', target: () => cardsRef.current },
  ];

  return (
    <div className="page-wrapper">
      <div className="page-header">
        <div>
          <Title level={4} style={{ margin: 0 }}><BarChartOutlined style={{ color: '#B8860B', marginRight: 8 }} />Reports & Analytics</Title>
          <Text type="secondary" style={{ fontSize: 12 }}>Sales · Inventory · Financial · Customer · Scheme · Management</Text>
        </div>
      </div>
      <Row ref={cardsRef} gutter={[16, 16]}>
        {REPORT_CATEGORIES.map(cat => (
          <Col xs={24} sm={12} lg={8} key={cat.key}>
            <Card hoverable onClick={() => navigate(cat.route)}
              style={{ borderRadius: 12, border: `2px solid ${cat.color}22`, cursor: 'pointer' }}
              bodyStyle={{ padding: 20 }}>
              <Space direction="vertical" size={8} style={{ width: '100%' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  {cat.icon}
                  <Tag color={cat.badgeColor}>{cat.badge}</Tag>
                </div>
                <Title level={5} style={{ margin: 0, color: cat.color }}>{cat.title}</Title>
                <ul style={{ margin: 0, paddingLeft: 16, color: '#888', fontSize: 11, lineHeight: 1.8 }}>
                  {cat.reports.map(r => <li key={r}>{r}</li>)}
                </ul>
                <Button type="primary" block size="small"
                  style={{ background: cat.color, borderColor: cat.color, fontWeight: 600 }}>
                  Open {cat.title}
                </Button>
              </Space>
            </Card>
          </Col>
        ))}
      </Row>

      <PageTour steps={tourSteps} />
    </div>
  );
}
