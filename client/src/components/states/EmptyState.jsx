/**
 * EmptyState — Section 28: "Never show blank screens." One consistent
 * empty-state pattern (icon + headline + hint + optional action) reused
 * everywhere instead of ad-hoc <Alert message="No data" /> or a bare
 * "No data" table placeholder scattered per page.
 */
import React from 'react';
import { Button, Typography } from 'antd';
import { InboxOutlined } from '@ant-design/icons';

const { Text } = Typography;

export default function EmptyState({
  icon = <InboxOutlined />,
  title = 'Nothing here yet',
  hint,
  actionLabel,
  onAction,
  compact = false,
}) {
  return (
    <div style={{
      textAlign: 'center',
      padding: compact ? '28px 16px' : '48px 20px',
    }}>
      <div style={{
        width: compact ? 44 : 56, height: compact ? 44 : 56, borderRadius: '50%',
        background: 'var(--ink-100)', color: 'var(--ink-500)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: compact ? 20 : 26, margin: '0 auto 14px',
      }}>
        {icon}
      </div>
      <div className="h4" style={{ marginBottom: hint ? 4 : 0 }}>{title}</div>
      {hint && <Text className="caption" style={{ display: 'block', maxWidth: 340, margin: '0 auto' }}>{hint}</Text>}
      {actionLabel && (
        <Button size="small" onClick={onAction} style={{ marginTop: 16, borderRadius: 6 }}>
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
