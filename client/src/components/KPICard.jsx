/**
 * KPICard — the shared stat-card pattern for every dashboard/summary screen
 * (Section 5's own example: icon, big number, label, comparison badge,
 * secondary info). Replaces each page's own local, slightly-different KPI
 * card so every screen in the app uses one visual language (Section 32).
 *
 * `comparison` is optional and purely presentational — callers compute the
 * percentage from real data they already fetched (see DashboardPage.jsx for
 * the "today vs yesterday" example); this component never fabricates one.
 */
import React from 'react';
import { Col, Card, Statistic, Typography, Tooltip } from 'antd';
import { ArrowUpOutlined, ArrowDownOutlined } from '@ant-design/icons';

const { Text } = Typography;

/**
 * @param {{ value: number, label?: string }} [comparison] - e.g. { value: 12.5, label: 'vs yesterday' }
 *   Positive value renders an up/green badge, negative renders down/red,
 *   zero renders a flat/neutral badge.
 */
export default function KPICard({
  title, value, formatter, icon, color = 'var(--gold)', suffix,
  comparison, secondary, onClick,
  span = { xs: 12, sm: 8, md: 6, lg: 4 },
}) {
  const cmp = comparison && Number.isFinite(comparison.value) ? comparison : null;
  const cmpDir = cmp ? (cmp.value > 0 ? 'up' : cmp.value < 0 ? 'down' : 'flat') : null;

  return (
    <Col {...span} className="kpi-col">
      <Card
        className="erp-card-elevated"
        bodyStyle={{ padding: '14px 16px' }}
        onClick={onClick}
        style={{ cursor: onClick ? 'pointer' : 'default', height: '100%' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
          <Text style={{ fontSize: 'var(--fs-caption)', color: 'var(--ink-500)', fontWeight: 600, letterSpacing: '0.2px', lineHeight: 1.3 }}>
            {title}
          </Text>
          {icon && (
            <div className="icon-badge" style={{ width: 34, height: 34, fontSize: 15, color, background: `${color}1A` }}>
              {icon}
            </div>
          )}
        </div>

        <Statistic
          value={value}
          formatter={formatter ? (v) => formatter(v) : undefined}
          suffix={suffix}
          valueStyle={{ color: 'var(--ink-900)', fontSize: 19, fontWeight: 700, lineHeight: 1.2 }}
        />

        {(cmp || secondary) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
            {cmp && (
              <Tooltip title={`${cmp.value > 0 ? '+' : ''}${cmp.value.toFixed(1)}% ${cmp.label || ''}`}>
                <span className={`stat-badge ${cmpDir}`}>
                  {cmpDir === 'up' && <ArrowUpOutlined style={{ fontSize: 9 }} />}
                  {cmpDir === 'down' && <ArrowDownOutlined style={{ fontSize: 9 }} />}
                  {Math.abs(cmp.value).toFixed(1)}%
                </span>
              </Tooltip>
            )}
            {cmp?.label && <Text className="caption">{cmp.label}</Text>}
            {secondary && !cmp && <Text className="caption">{secondary}</Text>}
          </div>
        )}
      </Card>
    </Col>
  );
}
