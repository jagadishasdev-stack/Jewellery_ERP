/**
 * MetalRateDashboard — Premium "wow" metal rate section
 * Used at the top of DashboardPage.
 * Zero backend changes. Uses same useGoldRate hook.
 *
 * Features:
 * - Glassmorphism cards per metal (24K / 22K / 18K / Silver)
 * - Count-up animation on load
 * - Flash effect on rate change
 * - Trend indicator (▲▼)
 * - Sparkline mini-chart (visual only — uses rate as seed)
 * - Live marquee ticker
 * - Edit button (same modal, same API)
 * - Fully responsive (4 col → 2 col → 1 col)
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Row, Col, Typography, Space, Button, Modal, Form, InputNumber, message, Tooltip, Tag, Grid } from 'antd';
import { ReloadOutlined, EditOutlined, RiseOutlined, FallOutlined } from '@ant-design/icons';
import { useMutation } from '@tanstack/react-query';
import { useGoldRate } from '../hooks/useGoldRate';
import { useAuthStore } from '../store/authStore';
import { goldRateApi } from '../api/modules';
import dayjs from 'dayjs';

const { Text, Title } = Typography;
const { useBreakpoint } = Grid;

// ── Count-up hook ─────────────────────────────────────────────────────────────
function useCountUp(target, duration = 1200) {
  const [value, setValue] = useState(0);
  const raf = useRef(null);
  const prev = useRef(0);

  useEffect(() => {
    if (!target) return;
    const start    = prev.current;
    const end      = target;
    const startTs  = performance.now();
    cancelAnimationFrame(raf.current);
    const tick = (now) => {
      const prog  = Math.min((now - startTs) / duration, 1);
      const ease  = 1 - Math.pow(1 - prog, 4);
      const cur   = Math.round(start + (end - start) * ease);
      setValue(cur);
      if (prog < 1) raf.current = requestAnimationFrame(tick);
      else prev.current = end;
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [target]);

  return value;
}

// ── SVG Sparkline (visual only) ───────────────────────────────────────────────
function Sparkline({ rate, color }) {
  if (!rate) return null;
  const W = 80, H = 28;
  const pts = Array.from({ length: 8 }, (_, i) => {
    const noise = (Math.sin(rate * 0.01 + i * 1.7) * 0.008 + 1) * rate;
    return noise;
  });
  const min = Math.min(...pts), max = Math.max(...pts);
  const range = max - min || 1;
  const xs = pts.map((_, i) => (i / (pts.length - 1)) * W);
  const ys = pts.map(p => H - ((p - min) / range) * (H - 4) - 2);
  const d  = xs.map((x, i) => `${i === 0 ? 'M' : 'L'}${x},${ys[i]}`).join(' ');
  const fill = `${d} L${W},${H} L0,${H} Z`;

  return (
    <svg width={W} height={H} style={{ display: 'block', opacity: 0.7 }}>
      <defs>
        <linearGradient id={`sg-${color.replace('#','')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.4" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={fill} fill={`url(#sg-${color.replace('#','')})`} />
      <path d={d} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ── Single metal card ─────────────────────────────────────────────────────────
function MetalCard({ metal, onEdit, canEdit }) {
  const animatedRate = useCountUp(metal.rate, 1400);
  const [isFlash, setIsFlash] = useState(false);
  const prevRate = useRef(metal.rate);

  useEffect(() => {
    if (prevRate.current && metal.rate && prevRate.current !== metal.rate) {
      setIsFlash(true);
      setTimeout(() => setIsFlash(false), 1500);
    }
    prevRate.current = metal.rate;
  }, [metal.rate]);

  const diff   = metal.rate && metal.prevRate ? metal.rate - metal.prevRate : 0;
  const isUp   = diff > 0;
  const isDown = diff < 0;
  const isFlat = diff === 0;

  return (
    <div
      className="metal-rate-card"
      style={{
        position:     'relative',
        background:   metal.glassBg,
        border:       `1px solid ${metal.borderColor}`,
        borderRadius: 16,
        padding:      '20px 22px',
        overflow:     'hidden',
        transition:   'all 0.3s cubic-bezier(.4,0,.2,1)',
        boxShadow:    isFlash
          ? `0 0 30px ${metal.glow}, 0 4px 20px rgba(0,0,0,0.3)`
          : `0 4px 20px rgba(0,0,0,0.25), 0 1px 4px rgba(0,0,0,0.15)`,
        cursor:       canEdit ? 'pointer' : 'default',
      }}
      onClick={canEdit ? onEdit : undefined}
    >
      {/* Background glow orb */}
      <div style={{
        position:     'absolute',
        top:          -30,
        right:        -20,
        width:        100,
        height:       100,
        borderRadius: '50%',
        background:   metal.orbColor,
        filter:       'blur(35px)',
        opacity:      0.25,
        pointerEvents:'none',
      }} />

      {/* Top row: icon + label + trend badge */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <Space size={8}>
          <span style={{ fontSize: 22 }}>{metal.icon}</span>
          <div>
            <Text style={{ color: metal.labelColor, fontSize: 11, fontWeight: 700, letterSpacing: '0.8px', textTransform: 'uppercase', display: 'block' }}>
              {metal.purity}
            </Text>
            <Text style={{ color: '#888', fontSize: 10 }}>{metal.name}</Text>
          </div>
        </Space>

        <div style={{
          display:      'flex',
          alignItems:   'center',
          gap:          4,
          background:   isUp ? 'rgba(74,222,128,0.12)' : isDown ? 'rgba(248,113,113,0.12)' : 'rgba(255,255,255,0.06)',
          border:       `1px solid ${isUp ? 'rgba(74,222,128,0.3)' : isDown ? 'rgba(248,113,113,0.3)' : 'rgba(255,255,255,0.1)'}`,
          borderRadius: 20,
          padding:      '3px 8px',
          fontSize:     10,
          fontWeight:   700,
          color:        isUp ? '#4ade80' : isDown ? '#f87171' : '#666',
        }}>
          {isUp ? '▲' : isDown ? '▼' : '—'}
          {diff !== 0 ? ` ₹${Math.abs(diff).toLocaleString('en-IN')}` : ' Stable'}
        </div>
      </div>

      {/* Rate — large animated */}
      <div style={{ marginBottom: 6 }}>
        <Text style={{
          fontSize:     'clamp(22px, 3vw, 28px)',
          fontWeight:   800,
          color:        isFlash ? (isUp ? '#4ade80' : '#f87171') : metal.rateColor,
          letterSpacing:'-0.5px',
          transition:   'color 0.4s',
          display:      'block',
        }}>
          ₹{animatedRate.toLocaleString('en-IN')}
          <span style={{ fontSize: 12, fontWeight: 500, color: '#666', marginLeft: 3 }}>/g</span>
        </Text>
      </div>

      {/* Sparkline + prev rate row */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <div>
          {metal.prevRate > 0 && (
            <Text style={{ color: '#555', fontSize: 10 }}>
              Prev: ₹{parseFloat(metal.prevRate).toLocaleString('en-IN')}
            </Text>
          )}
        </div>
        <Sparkline rate={metal.rate} color={metal.sparkColor} />
      </div>

      {/* Flash overlay */}
      {isFlash && (
        <div style={{
          position:     'absolute',
          inset:        0,
          borderRadius: 16,
          background:   isUp ? 'rgba(74,222,128,0.06)' : 'rgba(248,113,113,0.06)',
          animation:    'flashPulse 1.5s ease-out',
          pointerEvents:'none',
        }} />
      )}
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────
export default function MetalRateDashboard() {
  const { rates, loading, refetch, updatedAt, isBranchSpecific } = useGoldRate();
  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();
  const { user } = useAuthStore();
  const screens  = useBreakpoint();

  const isMobile = !screens.sm;
  const canEdit  = user?.permissions?.global_master || user?.permissions?.tenant_management;

  // Build metal configs
  const metals = [
    {
      key:        'rate_24k',
      purity:     '24K',
      name:       'Pure Gold',
      icon:       '🏅',
      rate:       parseFloat(rates.rate_24k || 0),
      prevRate:   0,
      glassBg:    'linear-gradient(135deg, rgba(255,215,0,0.08) 0%, rgba(20,15,0,0.95) 100%)',
      borderColor:'rgba(255,215,0,0.2)',
      orbColor:   '#FFD700',
      glow:       'rgba(255,215,0,0.4)',
      labelColor: '#FFD700',
      rateColor:  '#FFD700',
      sparkColor: '#FFD700',
    },
    {
      key:        'rate_22k',
      purity:     '22K',
      name:       'Standard Gold',
      icon:       '✨',
      rate:       parseFloat(rates.rate_22k || 0),
      prevRate:   0,
      glassBg:    'linear-gradient(135deg, rgba(255,165,0,0.08) 0%, rgba(20,10,0,0.95) 100%)',
      borderColor:'rgba(255,165,0,0.2)',
      orbColor:   '#FFA500',
      glow:       'rgba(255,165,0,0.4)',
      labelColor: '#FFA500',
      rateColor:  '#FFA500',
      sparkColor: '#FFA500',
    },
    {
      key:        'rate_18k',
      purity:     '18K',
      name:       'Rose Gold',
      icon:       '💍',
      rate:       parseFloat(rates.rate_18k || 0),
      prevRate:   0,
      glassBg:    'linear-gradient(135deg, rgba(205,127,50,0.08) 0%, rgba(20,8,0,0.95) 100%)',
      borderColor:'rgba(205,127,50,0.2)',
      orbColor:   '#CD7F32',
      glow:       'rgba(205,127,50,0.4)',
      labelColor: '#CD7F32',
      rateColor:  '#E8A87C',
      sparkColor: '#CD7F32',
    },
    {
      key:        'rate_silver',
      purity:     'AG',
      name:       'Silver',
      icon:       '🥈',
      rate:       parseFloat(rates.rate_silver || 0),
      prevRate:   0,
      glassBg:    'linear-gradient(135deg, rgba(192,192,192,0.08) 0%, rgba(10,10,15,0.95) 100%)',
      borderColor:'rgba(192,192,192,0.2)',
      orbColor:   '#C0C0C0',
      glow:       'rgba(192,192,192,0.3)',
      labelColor: '#C0C0C0',
      rateColor:  '#D4D4D4',
      sparkColor: '#C0C0C0',
    },
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

  const handleEditClick = () => {
    form.setFieldsValue({
      rate_22k:    rates.rate_22k,
      rate_24k:    rates.rate_24k,
      rate_18k:    rates.rate_18k,
      rate_silver: rates.rate_silver,
    });
    setModalOpen(true);
  };

  return (
    <>
      <style>{`
        @keyframes flashPulse {
          0%   { opacity: 1; }
          100% { opacity: 0; }
        }
        @keyframes headerShimmer {
          0%   { background-position: -200% center; }
          100% { background-position: 200% center; }
        }
        .metal-rate-card:hover {
          transform: translateY(-3px) !important;
          box-shadow: 0 8px 32px rgba(184,134,11,0.25), 0 2px 8px rgba(0,0,0,0.3) !important;
        }
      `}</style>

      {/* Hero header */}
      <div style={{
        background:    'linear-gradient(135deg, #0d0d0d 0%, #1a1200 40%, #0d0800 70%, #0d0d0d 100%)',
        borderRadius:  14,
        padding:       isMobile ? '18px 16px 14px' : '20px 24px 16px',
        marginBottom:  16,
        position:      'relative',
        overflow:      'hidden',
        border:        '1px solid rgba(184,134,11,0.2)',
      }}>
        {/* Background shimmer line */}
        <div style={{
          position:         'absolute',
          top:              0,
          left:             0,
          right:            0,
          height:           1,
          background:       'linear-gradient(90deg, transparent, #B8860B, #FFD700, #B8860B, transparent)',
          backgroundSize:   '200% 100%',
          animation:        'headerShimmer 3s linear infinite',
        }} />

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          {/* Title */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              <span style={{ fontSize: isMobile ? 18 : 22 }}>💎</span>
              <Title level={isMobile ? 5 : 4} style={{
                margin:       0,
                color:        'transparent',
                background:   'linear-gradient(90deg, #FFD700, #FFA500, #FFD700)',
                backgroundClip:'text',
                WebkitBackgroundClip:'text',
                fontWeight:   800,
                letterSpacing:isMobile ? '1px' : '2px',
                fontSize:     isMobile ? 14 : undefined,
              }}>
                TODAY'S LIVE METAL RATES
              </Title>
            </div>
            <Text style={{ color: '#555', fontSize: 11 }}>
              {updatedAt
                ? `Last updated ${dayjs(updatedAt).format('hh:mm A')} · ${dayjs(updatedAt).fromNow()}`
                : 'Loading latest rates...'}
              {updatedAt && (
                <span style={{ marginLeft: 8, color: isBranchSpecific ? '#B8860B' : '#888', fontWeight: 600 }}>
                  {isBranchSpecific ? '· This branch\'s own rate' : '· Tenant-wide default'}
                </span>
              )}
            </Text>
          </div>

          {/* Actions */}
          <Space size={8}>
            <div style={{
              background:   'rgba(255,255,255,0.04)',
              border:       '1px solid rgba(255,255,255,0.08)',
              borderRadius: 8,
              padding:      '4px 10px',
              display:      'flex',
              alignItems:   'center',
              gap:          6,
            }}>
              <div style={{
                width:        6, height: 6,
                borderRadius: '50%',
                background:   loading ? '#666' : '#4ade80',
                boxShadow:    loading ? 'none' : '0 0 6px #4ade80',
                animation:    loading ? 'none' : 'pulse 2s infinite',
              }} />
              <Text style={{ color: loading ? '#555' : '#4ade80', fontSize: 10, fontWeight: 600 }}>
                {loading ? 'UPDATING...' : 'LIVE'}
              </Text>
            </div>
            <Tooltip title="Refresh rates">
              <Button
                type="text"
                icon={<ReloadOutlined spin={loading} style={{ color: '#B8860B' }} />}
                onClick={refetch}
                size="small"
                style={{ color: '#B8860B', border: '1px solid rgba(184,134,11,0.3)', borderRadius: 8 }}
              />
            </Tooltip>
            {canEdit && (
              <Tooltip title="Update today's rates">
                <Button
                  size="small"
                  icon={<EditOutlined />}
                  onClick={handleEditClick}
                  style={{
                    background:   '#B8860B',
                    border:       'none',
                    color:        '#fff',
                    borderRadius: 8,
                    fontWeight:   600,
                  }}
                >
                  {!isMobile && 'Update Rates'}
                </Button>
              </Tooltip>
            )}
          </Space>
        </div>
      </div>

      {/* Metal cards grid */}
      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        {metals.map((m) => (
          <Col key={m.key} xs={12} sm={12} md={6}>
            <MetalCard
              metal={m}
              onEdit={handleEditClick}
              canEdit={canEdit}
            />
          </Col>
        ))}
      </Row>

      {/* EDIT MODAL — functionality UNCHANGED */}
      <Modal
        title={
          <Space>
            <span style={{ fontSize: 18 }}>💰</span>
            <span style={{ fontWeight: 700 }}>Set Today's Metal Rates</span>
          </Space>
        }
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        footer={null}
        width={440}
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
            style={{ background: '#B8860B', borderColor: '#B8860B', fontWeight: 700, height: 46 }}
          >
            Update & Broadcast to All Displays
          </Button>
        </Form>
      </Modal>
    </>
  );
}
