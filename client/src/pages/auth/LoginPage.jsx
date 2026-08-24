import React, { useState } from 'react';
import { Form, Input, Button, Card, Typography, Space, Alert, Divider } from 'antd';
import { UserOutlined, LockOutlined, ShopOutlined, GoldOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';

const { Text } = Typography;

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');
  const { login }  = useAuthStore();
  const navigate   = useNavigate();

  const onFinish = async (values) => {
    setLoading(true);
    setError('');
    try {
      await login(values);
      navigate('/dashboard');
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card
      style={{
        width: '100%',
        maxWidth: 420,
        borderRadius: 16,
        boxShadow: '0 24px 64px rgba(0,0,0,0.45)',
        border: 'none',
        margin: '0 auto',
      }}
      styles={{ body: { padding: 'clamp(24px, 5vw, 44px) clamp(20px, 5vw, 40px)' } }}
    >
      {/* Logo / Brand */}
      <div style={{ textAlign: 'center', marginBottom: 32 }}>
        <img src="/logo.png" alt="JewelSphere ERP" style={{ width: 280, maxWidth: '100%', marginBottom: 8 }} />
        <Text style={{ fontSize: 13, color: '#888' }}>
          Multi-Tenant Management System
        </Text>
      </div>

      {error && (
        <Alert
          message={error}
          type="error"
          showIcon
          closable
          onClose={() => setError('')}
          style={{ marginBottom: 20, borderRadius: 8 }}
        />
      )}

      <Form layout="vertical" onFinish={onFinish} size="large" requiredMark={false}>
        <Form.Item
          name="tenantId"
          label={<Text style={{ fontSize: 12, fontWeight: 600, color: '#555' }}>Tenant ID</Text>}
          rules={[{ required: true, message: 'Enter your Tenant ID' }]}
        >
          <Input
            prefix={<ShopOutlined style={{ color: '#B8860B' }} />}
            placeholder="e.g. VJ_BLR"
            style={{ borderRadius: 8, height: 44 }}
            autoComplete="organization"
          />
        </Form.Item>

        <Form.Item
          name="username"
          label={<Text style={{ fontSize: 12, fontWeight: 600, color: '#555' }}>Username</Text>}
          rules={[{ required: true, message: 'Enter your username' }]}
        >
          <Input
            prefix={<UserOutlined style={{ color: '#B8860B' }} />}
            placeholder="Username"
            style={{ borderRadius: 8, height: 44 }}
            autoComplete="username"
          />
        </Form.Item>

        <Form.Item
          name="password"
          label={<Text style={{ fontSize: 12, fontWeight: 600, color: '#555' }}>Password</Text>}
          rules={[{ required: true, message: 'Enter your password' }]}
          style={{ marginBottom: 24 }}
        >
          <Input.Password
            prefix={<LockOutlined style={{ color: '#B8860B' }} />}
            placeholder="Password"
            style={{ borderRadius: 8, height: 44 }}
            autoComplete="current-password"
          />
        </Form.Item>

        <Button
          type="primary"
          htmlType="submit"
          loading={loading}
          block
          style={{
            height:          48,
            borderRadius:    8,
            background:      'linear-gradient(135deg, #B8860B, #D4A017)',
            border:          'none',
            fontSize:        15,
            fontWeight:      700,
            letterSpacing:   '0.3px',
            boxShadow:       '0 4px 14px rgba(184,134,11,.40)',
          }}
        >
          {loading ? 'Signing in...' : 'Sign In →'}
        </Button>
      </Form>

      <Divider style={{ margin: '24px 0 14px' }} />

      <div style={{ textAlign: 'center', background: '#FAFAFA', borderRadius: 8, padding: '10px 14px' }}>
        <Space direction="vertical" size={2}>
          <Text style={{ fontSize: 11, color: '#888' }}>
            Super Admin: Tenant ID = <Text code style={{ fontSize: 11 }}>SA_MASTER</Text>
          </Text>
          <Text style={{ fontSize: 10, color: '#bbb' }}>
            All data is isolated by tenant
          </Text>
        </Space>
      </div>
    </Card>
  );
}
