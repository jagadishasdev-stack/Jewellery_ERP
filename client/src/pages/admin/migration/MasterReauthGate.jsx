/**
 * Data Migration Center — step-up re-authentication gate. Wraps every
 * page in this module: even an already-logged-in Super Admin must
 * re-enter their own password before seeing anything here, because this
 * is the one feature that can write into an ARBITRARY tenant's
 * production data. The resulting short-lived token (30 min) is stored
 * in sessionStorage (cleared on tab close, unlike the normal session in
 * localStorage) and attached automatically by the axios interceptor
 * (see api/axios.js) to every /migrations call.
 */
import React, { useState, useEffect } from 'react';
import { Card, Typography, Input, Button, Alert, Form, Space } from 'antd';
import { LockOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import { useAuthStore } from '../../../store/authStore';
import { migrationApi } from '../../../api/modules';

const { Title, Text } = Typography;
const STORAGE_KEY = 'erp_migration_auth';

function readStoredToken() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const { token, expiresAt } = JSON.parse(raw);
    return token && expiresAt > Date.now() ? token : null;
  } catch (_e) { return null; }
}

export default function MasterReauthGate({ children }) {
  const { user } = useAuthStore();
  const [verified, setVerified] = useState(() => !!readStoredToken());
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // A stored token can expire while this component is already mounted
  // (30 minutes into a long mapping-review session, say) — re-check
  // periodically rather than only at mount.
  useEffect(() => {
    const interval = setInterval(() => { if (!readStoredToken()) setVerified(false); }, 15000);
    return () => clearInterval(interval);
  }, []);

  if (verified) return children;

  const handleVerify = async () => {
    if (!password) { setError('Enter your password.'); return; }
    setLoading(true); setError('');
    try {
      const res = await migrationApi.verifyMaster(user?.username, password);
      const { token } = res.data.data;
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ token, expiresAt: Date.now() + 29 * 60 * 1000 }));
      setPassword('');
      setVerified(true);
    } catch (err) {
      setError(err.response?.data?.message || 'Verification failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-wrapper" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
      <Card style={{ borderRadius: 12, maxWidth: 420, width: '100%', boxShadow: '0 4px 24px rgba(0,0,0,0.08)' }}>
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <SafetyCertificateOutlined style={{ fontSize: 40, color: '#B8860B' }} />
          <Title level={4} style={{ margin: '10px 0 4px' }}>Confirm Master Login</Title>
          <Text type="secondary" style={{ fontSize: 12 }}>Data Migration can write into any tenant's live data — re-enter your Super Admin password to continue.</Text>
        </div>
        <Form layout="vertical" onFinish={handleVerify}>
          <Form.Item label="Super Admin Account">
            <Input value={user?.username} disabled prefix={<LockOutlined />} />
          </Form.Item>
          <Form.Item label="Password">
            <Input.Password value={password} onChange={(e) => setPassword(e.target.value)} onPressEnter={handleVerify} autoFocus placeholder="Re-enter your password" />
          </Form.Item>
          {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} />}
          <Button type="primary" block loading={loading} style={{ background: '#B8860B', borderColor: '#B8860B' }} onClick={handleVerify}>
            Verify & Continue
          </Button>
        </Form>
      </Card>
    </div>
  );
}
