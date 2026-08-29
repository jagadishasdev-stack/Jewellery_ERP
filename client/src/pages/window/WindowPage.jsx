/**
 * Window — the ERP workspace controls named in the Transaction spec.
 * "Multiple windows" in a browser-based app realistically means browser
 * tabs, not a native multi-window desktop shell — so this surfaces the
 * real equivalents rather than faking a windowing system that doesn't
 * exist: Recently Visited (reuses the same store the floating Recent
 * Windows tab already uses — this is the full list, not just the last 12
 * shown there), Fullscreen, Refresh, Open-in-new-tab for common screens
 * (a real "second workspace" side-by-side), the keyboard shortcuts
 * actually wired up (useActionShortcuts/ShortcutContext), and a link to
 * the existing Customer Display second-screen feature.
 */
import React, { useState, useEffect } from 'react';
import { Card, Button, List, Typography, Space, Tag, Empty, Popconfirm, Row, Col, Table } from 'antd';
import {
  FullscreenOutlined, FullscreenExitOutlined, ReloadOutlined, ExportOutlined,
  HistoryOutlined, DeleteOutlined, DesktopOutlined,
} from '@ant-design/icons';
import { useNavigate, useLocation } from 'react-router-dom';
import { useRecentWindowsStore } from '../../store/recentWindowsStore';
import { useShortcuts } from '../../contexts/ShortcutContext';
import { ACTION_LABELS } from '../../utils/shortcuts';
import dayjs from 'dayjs';

const { Title, Text } = Typography;

const QUICK_WORKSPACES = [
  { path: '/dashboard', label: '🏠 Dashboard' },
  { path: '/pos', label: '🛒 Retail POS' },
  { path: '/inventory', label: '📦 Stock' },
  { path: '/reports', label: '📊 Reports Hub' },
];

export default function WindowPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { windows, clear, removeWindow } = useRecentWindowsStore();
  const { shortcuts } = useShortcuts();
  const [isFullscreen, setIsFullscreen] = useState(!!document.fullscreenElement);

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen().catch(() => {});
  };

  const recentItems = windows.filter((w) => w.path !== location.pathname + location.search);

  const shortcutRows = Object.entries(shortcuts || {}).map(([action, key]) => ({ action, key }));

  return (
    <div className="page-wrapper">
      <div className="page-header">
        <div>
          <div className="page-header-title">Window</div>
          <div className="page-header-sub">Workspace controls — recent screens, fullscreen, second screen, shortcuts</div>
        </div>
      </div>

      <Row gutter={[16, 16]}>
        <Col xs={24} md={12}>
          <Card
            className="erp-card"
            title={<Space><HistoryOutlined style={{ color: '#B8860B' }} />Recently Visited</Space>}
            extra={recentItems.length > 0 && (
              <Popconfirm title="Clear recent windows?" onConfirm={clear} okText="Clear" okButtonProps={{ danger: true }}>
                <Button size="small" type="text" icon={<DeleteOutlined />} danger>Clear</Button>
              </Popconfirm>
            )}
          >
            {recentItems.length === 0 ? (
              <Empty description="Pages you visit will show up here" />
            ) : (
              <List
                dataSource={recentItems}
                renderItem={(w) => (
                  <List.Item
                    style={{ cursor: 'pointer' }}
                    onClick={() => navigate(w.path)}
                    actions={[
                      <Button key="remove" type="text" size="small" danger icon={<DeleteOutlined />}
                        onClick={(e) => { e.stopPropagation(); removeWindow(w.path); }} />,
                    ]}
                  >
                    <List.Item.Meta
                      title={w.label}
                      description={<Text type="secondary" style={{ fontSize: 11 }}>{w.group ? `${w.group} · ` : ''}{dayjs(w.visitedAt).fromNow()}</Text>}
                    />
                  </List.Item>
                )}
              />
            )}
          </Card>
        </Col>

        <Col xs={24} md={12}>
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <Card className="erp-card" title="Workspace">
              <Space wrap>
                <Button icon={isFullscreen ? <FullscreenExitOutlined /> : <FullscreenOutlined />} onClick={toggleFullscreen}>
                  {isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
                </Button>
                <Button icon={<ReloadOutlined />} onClick={() => window.location.reload()}>Refresh</Button>
                <Button icon={<DesktopOutlined />} onClick={() => window.open('/customer-display', '_blank')}>
                  Open Customer Display (2nd screen)
                </Button>
              </Space>
            </Card>

            <Card className="erp-card" title="Open in a New Tab — a second workspace side-by-side">
              <Space wrap>
                {QUICK_WORKSPACES.map((w) => (
                  <Button key={w.path} icon={<ExportOutlined />} onClick={() => window.open(w.path, '_blank')}>
                    {w.label}
                  </Button>
                ))}
              </Space>
            </Card>

            <Card className="erp-card" title="Keyboard Shortcuts (this tenant's configured keys)">
              <Table
                size="small" pagination={false} showHeader={false}
                dataSource={[
                  { action: 'globalSearch', key: 'Ctrl+K / Cmd+K' },
                  ...shortcutRows,
                ]}
                rowKey="action"
                columns={[
                  { dataIndex: 'action', render: (v) => ACTION_LABELS[v] || (v === 'globalSearch' ? 'Search Pages' : v) },
                  { dataIndex: 'key', align: 'right', render: (v) => <Tag>{v}</Tag> },
                ]}
              />
            </Card>
          </Space>
        </Col>
      </Row>
    </div>
  );
}
