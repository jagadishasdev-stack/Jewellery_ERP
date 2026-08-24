/**
 * RecentWindows — a small tab docked to the right edge of the screen,
 * visible on every page. Click it to see the pages you've visited most
 * recently and jump straight back to any of them. Backed by
 * store/recentWindowsStore.js (see MainLayout.jsx for where visits get
 * recorded on every route change).
 */
import React, { useState } from 'react';
import { Drawer, List, Typography, Button, Tag, Empty, Popconfirm } from 'antd';
import { HistoryOutlined, DeleteOutlined, RightOutlined, CloseOutlined } from '@ant-design/icons';
import { useLocation, useNavigate } from 'react-router-dom';
import { useRecentWindowsStore } from '../store/recentWindowsStore';
import dayjs from 'dayjs';

const { Text } = Typography;

export default function RecentWindows() {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { windows, clear, removeWindow } = useRecentWindowsStore();

  const items = windows.filter((w) => w.path !== location.pathname + location.search);

  const goTo = (path) => {
    navigate(path);
    setOpen(false);
  };

  return (
    <>
      <div
        onClick={() => setOpen(true)}
        title="Recent windows"
        style={{
          position: 'fixed',
          right: 0,
          top: '45%',
          zIndex: 900,
          background: '#1A1A1A',
          color: '#FFD700',
          padding: '10px 8px',
          borderRadius: '8px 0 0 8px',
          boxShadow: '-2px 2px 8px rgba(0,0,0,0.2)',
          cursor: 'pointer',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 4,
        }}
      >
        <HistoryOutlined style={{ fontSize: 16 }} />
      </div>

      <Drawer
        title={<span><HistoryOutlined style={{ color: '#B8860B', marginRight: 8 }} />Recent Windows</span>}
        placement="right"
        open={open}
        onClose={() => setOpen(false)}
        width={340}
        extra={items.length > 0 && (
          <Popconfirm title="Clear recent windows?" onConfirm={clear} okText="Clear" okButtonProps={{ danger: true }}>
            <Button size="small" type="text" icon={<DeleteOutlined />} danger>Clear</Button>
          </Popconfirm>
        )}
      >
        {items.length === 0 ? (
          <Empty description="Pages you visit will show up here" style={{ marginTop: 40 }} />
        ) : (
          <List
            dataSource={items}
            renderItem={(w) => (
              <List.Item
                onClick={() => goTo(w.path)}
                style={{ cursor: 'pointer', padding: '10px 8px', borderRadius: 6 }}
                className="recent-window-item"
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', gap: 8 }}>
                  <div style={{ minWidth: 0 }}>
                    <Text strong style={{ fontSize: 13, display: 'block' }}>{w.label}</Text>
                    <Text type="secondary" style={{ fontSize: 11 }}>
                      {w.group ? `${w.group} · ` : ''}{dayjs(w.visitedAt).fromNow()}
                    </Text>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                    <Button
                      type="text"
                      size="small"
                      icon={<CloseOutlined style={{ fontSize: 11 }} />}
                      title="Remove this one"
                      onClick={(e) => { e.stopPropagation(); removeWindow(w.path); }}
                      style={{ color: '#bbb', width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    />
                    <RightOutlined style={{ color: '#ccc', fontSize: 11 }} />
                  </div>
                </div>
              </List.Item>
            )}
          />
        )}
      </Drawer>
    </>
  );
}
