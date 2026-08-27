/**
 * ErrorState — Section 30: user-friendly errors instead of raw
 * "500 Internal Server Error" text. Purely presentational — callers
 * decide what actually failed and pass a Retry handler; this never
 * swallows or reinterprets the underlying error itself.
 */
import React from 'react';
import { Button, Typography } from 'antd';
import { ExclamationCircleOutlined, ReloadOutlined } from '@ant-design/icons';

const { Text } = Typography;

export default function ErrorState({
  title = 'Something went wrong',
  hint = "We couldn't load this information.",
  onRetry,
  compact = false,
}) {
  return (
    <div style={{ textAlign: 'center', padding: compact ? '28px 16px' : '48px 20px' }}>
      <div style={{
        width: compact ? 44 : 56, height: compact ? 44 : 56, borderRadius: '50%',
        background: 'var(--danger-bg)', color: 'var(--danger)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: compact ? 20 : 26, margin: '0 auto 14px',
      }}>
        <ExclamationCircleOutlined />
      </div>
      <div className="h4" style={{ marginBottom: 4 }}>{title}</div>
      <Text className="caption" style={{ display: 'block', maxWidth: 340, margin: '0 auto' }}>{hint}</Text>
      {onRetry && (
        <Button size="small" icon={<ReloadOutlined />} onClick={onRetry} style={{ marginTop: 16, borderRadius: 6 }}>
          Try Again
        </Button>
      )}
    </div>
  );
}
