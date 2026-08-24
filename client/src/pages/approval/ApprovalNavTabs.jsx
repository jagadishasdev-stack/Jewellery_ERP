import React from 'react';
import { Tabs } from 'antd';
import { useNavigate, useLocation } from 'react-router-dom';

const TABS = [
  { key: '/approval', label: '⏳ Pending' },
  { key: '/approval/issue', label: '📤 Issue' },
  { key: '/approval/receive', label: '📥 Receive' },
  { key: '/approval/completed', label: '✅ Completed' },
  { key: '/approval/non-tag/issue', label: '🏷️ Non-Tag Issue' },
  { key: '/approval/non-tag/receive', label: '🏷️ Non-Tag Receive' },
  { key: '/approval/parties', label: '🤝 Parties' },
];

// Shared quick-switch bar rendered at the top of every Approval Out screen so
// users can jump between Issue/Receive/Pending/Completed/etc. without going
// back to the sidebar each time.
export default function ApprovalNavTabs() {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <Tabs
      activeKey={location.pathname}
      onChange={(key) => navigate(key)}
      items={TABS.map(t => ({ key: t.key, label: t.label }))}
      style={{ marginBottom: 14 }}
    />
  );
}
