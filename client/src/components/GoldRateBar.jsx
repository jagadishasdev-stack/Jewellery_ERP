/**
 * GoldRateBar — Premium live rates ticker strip
 * - Marquee scrolling ticker on mobile
 * - Full 4-metal display on desktop
 * - Edit modal functionality UNCHANGED
 */
import React, { useState, useEffect, useRef } from 'react';
import { Space, Typography, Modal, Form, InputNumber, Button, message, Tooltip, Grid } from 'antd';
import { ReloadOutlined, EditOutlined, RiseOutlined, FallOutlined, MinusOutlined, UpOutlined, DownOutlined } from '@ant-design/icons';
import { useMutation } from '@tanstack/react-query';
import { useGoldRate } from '../hooks/useGoldRate';
import { useAuthStore } from '../store/authStore';
import { goldRateApi } from '../api/modules';
import dayjs from 'dayjs';

const { Text } = Typography;
const { useBreakpoint } = Grid;

// ── Animated count-up number ─────────────────────────────────────────────────
function AnimatedRate({ value, prevValue, flash }) {
  const [display, setDisplay] = useState(value);
  const rafRef = useRef(null);

  useEffect(() => {
    if (!value || value === prevValue) { setDisplay(value); return; }
    const start   = prevValue || value;
    const end     = value;
    const dur     = 800;
    const startTs = performance.now();
    const tick    = (now) => {
      const prog = Math.min((now - startTs) / dur, 1);
      const ease = 1 - Math.pow(1 - prog, 3);
      setDisplay(Math.round(start + (end - start) * ease));
      if (prog < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [value]);

  return (
    <span style={{
      transition:  'color 0.3s',
      color:       flash === 'up' ? '#4ade80' : flash === 'down' ? '#f87171' : '#FFD700',
    }}>
      ₹{parseFloat(display || 0).toLocaleString('en-IN')}
    </span>
  );
}

// ── Marquee ticker for mobile ─────────────────────────────────────────────────
function MarqueeTicker({ rates }) {
  const items = [
    { label: '24K Gold', value: rates.rate_24k, unit: '/g' },
    { label: '22K Gold', value: rates.rate_22k, unit: '/g' },
    { label: '18K Gold', value: rates.rate_18k, unit: '/g' },
    { label: 'Silver',   value: rates.rate_silver, unit: '/g' },
  ];
  const text = items.map(i => `${i.label}: ₹${parseFloat(i.value||0).toLocaleString('en-IN')}${i.unit}`).join('   •   ');

  return (
    <div style={{ overflow: 'hidden', flex: 1, position: 'relative' }}>
      <div style={{
        display:         'inline-block',
        whiteSpace:      'nowrap',
        animation:       'marqueeScroll 18s linear infinite',
        color:           '#FFD700',
        fontSize:        11,
        fontWeight:      600,
        letterSpacing:   '0.3px',
      }}>
        {text}&nbsp;&nbsp;&nbsp;•&nbsp;&nbsp;&nbsp;{text}
      </div>
      <style>{`
        @keyframes marqueeScroll {
          0%   { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
      `}</style>
    </div>
  );
}

const VISIBILITY_KEY = 'goldRateBarVisible';

// ── Main component ────────────────────────────────────────────────────────────
export default function GoldRateBar() {
  const { goldRate, rates, loading, refetch, updatedAt } = useGoldRate();
  const [modalOpen, setModalOpen] = useState(false);
  const [visible, setVisible] = useState(() => localStorage.getItem(VISIBILITY_KEY) === 'true');
  const [form]     = Form.useForm();
  const { user }   = useAuthStore();
  const screens    = useBreakpoint();
  const [flash, setFlash] = useState({});
  const prevRates  = useRef(rates);

  const isMobile = !screens.sm;
  const canEdit  = user?.permissions?.global_master || user?.permissions?.tenant_management;

  const toggleVisible = () => {
    setVisible(v => {
      localStorage.setItem(VISIBILITY_KEY, String(!v));
      return !v;
    });
  };

  // Flash effect when rates change
  useEffect(() => {
    const newFlash = {};
    ['rate_24k','rate_22k','rate_18k','rate_silver'].forEach(k => {
      if (prevRates.current[k] && rates[k] && rates[k] !== prevRates.current[k]) {
        newFlash[k] = rates[k] > prevRates.current[k] ? 'up' : 'down';
      }
    });
    if (Object.keys(newFlash).length) {
      setFlash(newFlash);
      setTimeout(() => setFlash({}), 2000);
    }
    prevRates.current = rates;
  }, [rates]);

  // Desktop rate items
  const desktopRates = [
    { key: 'rate_24k',   label: '24K', color: '#FFD700' },
    { key: 'rate_22k',   label: '22K', color: '#FFA500' },
    { key: 'rate_18k',   label: '18K', color: '#CD7F32' },
    { key: 'rate_silver',label: 'Ag',  color: '#C0C0C0' },
  ];

  const updateMutation = useMutation({
    mutationFn: (data) => goldRateApi.setRate(data),
    onSuccess: () => {
      message.success('Gold rate updated & broadcasted to all displays!');
      setModalOpen(false);
      refetch();
    },
    onError: () => message.error('Failed to update rate.'),
  });

  // ── Collapsed state — a small opt-in tab instead of the always-on bar ───────
  if (!visible) {
    return (
      <div style={{
        background:   '#0d0d0d',
        borderBottom: '1px solid #2d2200',
        display:      'flex',
        justifyContent: isMobile ? 'center' : 'flex-end',
        padding:      '0 16px',
      }}>
        <Tooltip title="Show live gold/silver rates">
          <Button
            type="text"
            size="small"
            onClick={toggleVisible}
            icon={<span style={{ fontSize: 12 }}>💰</span>}
            style={{
              color: '#B8860B', fontSize: 10, fontWeight: 700, letterSpacing: '0.5px',
              height: 22, display: 'flex', alignItems: 'center', gap: 4,
              textTransform: 'uppercase',
            }}
          >
            Live Rates <DownOutlined style={{ fontSize: 8 }} />
          </Button>
        </Tooltip>
      </div>
    );
  }

  return (
    <>
      <div style={{
        background:    'linear-gradient(90deg, #0d0d0d 0%, #1a1400 50%, #0d0d0d 100%)',
        height:        40,
        padding:       '0 16px',
        display:       'flex',
        alignItems:    'center',
        justifyContent:'space-between',
        borderBottom:  '1px solid #2d2200',
        gap:           10,
        overflow:      'hidden',
      }}>
        {/* Left — label */}
        <Space size={6} style={{ flexShrink: 0 }}>
          <span style={{ fontSize: 14 }}>💰</span>
          {!isMobile && (
            <Text style={{
              color:         '#B8860B',
              fontSize:      9,
              letterSpacing: '1.5px',
              fontWeight:    700,
              textTransform: 'uppercase',
            }}>
              LIVE RATES
            </Text>
          )}
        </Space>

        {/* Center */}
        {isMobile ? (
          <MarqueeTicker rates={rates} />
        ) : (
          <Space size={0} style={{ flex: 1, justifyContent: 'center' }}>
            {desktopRates.map((r, i) => {
              const val  = rates[r.key];
              const prev = prevRates.current[r.key];
              const diff = val && prev ? val - prev : 0;
              const fl   = flash[r.key];
              return (
                <React.Fragment key={r.key}>
                  {i > 0 && (
                    <div style={{ width: 1, height: 20, background: '#2d2200', margin: '0 16px' }} />
                  )}
                  <Space size={5} style={{ flexShrink: 0 }}>
                    {/* Metal badge */}
                    <div style={{
                      background:   `${r.color}22`,
                      border:       `1px solid ${r.color}55`,
                      borderRadius: 4,
                      padding:      '1px 7px',
                      fontSize:     10,
                      fontWeight:   700,
                      color:        r.color,
                      letterSpacing:'0.5px',
                    }}>
                      {r.label}
                    </div>
                    {/* Rate */}
                    <Text style={{ fontWeight: 700, fontSize: 12 }}>
                      <AnimatedRate value={val} prevValue={prev} flash={fl} />
                      <span style={{ color: '#666', fontSize: 9 }}>/g</span>
                    </Text>
                    {/* Trend */}
                    {diff !== 0 && (
                      <span style={{
                        fontSize:   9,
                        fontWeight: 600,
                        color:      diff > 0 ? '#4ade80' : '#f87171',
                      }}>
                        {diff > 0 ? '▲' : '▼'} {Math.abs(diff).toLocaleString('en-IN')}
                      </span>
                    )}
                  </Space>
                </React.Fragment>
              );
            })}
          </Space>
        )}

        {/* Right — actions */}
        <Space size={10} style={{ flexShrink: 0 }}>
          {!isMobile && updatedAt && (
            <Text style={{ color: '#444', fontSize: 9 }}>
              {dayjs(updatedAt).fromNow()}
            </Text>
          )}
          <Tooltip title="Refresh rates">
            <ReloadOutlined
              spin={loading}
              style={{ color: '#555', cursor: 'pointer', fontSize: 12, transition: 'color 0.2s' }}
              onClick={refetch}
            />
          </Tooltip>
          {canEdit && (
            <Tooltip title="Set today's rates">
              <EditOutlined
                style={{ color: '#B8860B', cursor: 'pointer', fontSize: 12 }}
                onClick={() => {
                  form.setFieldsValue({
                    rate_22k:    rates.rate_22k,
                    rate_24k:    rates.rate_24k,
                    rate_18k:    rates.rate_18k,
                    rate_silver: rates.rate_silver,
                  });
                  setModalOpen(true);
                }}
              />
            </Tooltip>
          )}
          <Tooltip title="Hide live rates bar">
            <UpOutlined
              style={{ color: '#555', cursor: 'pointer', fontSize: 11 }}
              onClick={toggleVisible}
            />
          </Tooltip>
        </Space>
      </div>

      {/* Edit modal — FUNCTIONALITY UNCHANGED */}
      <Modal
        title={
          <Space>
            <span style={{ fontSize: 16 }}>💰</span>
            <span style={{ fontWeight: 700 }}>Set Today's Gold Rate</span>
            <span style={{ color: '#888', fontSize: 12 }}>(₹/gram)</span>
          </Space>
        }
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        footer={null}
        width={420}
        styles={{ body: { paddingTop: 16 } }}
      >
        <Form form={form} layout="vertical" onFinish={(v) => updateMutation.mutate(v)}>
          <Form.Item name="rate_22k" label="22K Gold Rate (₹/g)" rules={[{ required: true }]}>
            <InputNumber style={{ width: '100%' }} size="large" min={1000} step={10} prefix="₹" />
          </Form.Item>
          <Form.Item name="rate_24k" label="24K Gold Rate (₹/g)">
            <InputNumber style={{ width: '100%' }} size="large" min={1000} step={10} prefix="₹" />
          </Form.Item>
          <Form.Item name="rate_18k" label="18K Gold Rate (₹/g)">
            <InputNumber style={{ width: '100%' }} size="large" min={1000} step={10} prefix="₹" />
          </Form.Item>
          <Form.Item name="rate_silver" label="Silver Rate (₹/g)">
            <InputNumber style={{ width: '100%' }} size="large" min={10} step={1} prefix="₹" />
          </Form.Item>
          <Button
            type="primary"
            htmlType="submit"
            block
            size="large"
            loading={updateMutation.isPending}
            style={{ background: '#B8860B', borderColor: '#B8860B', fontWeight: 700 }}
          >
            Update & Broadcast to All Displays
          </Button>
        </Form>
      </Modal>
    </>
  );
}
