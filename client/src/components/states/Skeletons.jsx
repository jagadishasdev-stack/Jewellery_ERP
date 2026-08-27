/**
 * Skeletons — Section 29: skeleton loading instead of a blank screen or a
 * flash of "0"/empty values while the first fetch is still in flight.
 * Three shapes covering the common cases (KPI row, card, table) — reuse
 * these rather than hand-rolling a shimmer div per page.
 */
import React from 'react';
import { Row, Col } from 'antd';

/** A row of skeleton KPI cards, matching KPICard.jsx's own footprint. */
export function SkeletonKPIRow({ count = 6 }) {
  return (
    <Row gutter={[10, 10]} style={{ marginBottom: 14 }}>
      {Array.from({ length: count }).map((_, i) => (
        <Col xs={12} sm={8} md={6} lg={4} key={i}>
          <div style={{ background: 'white', borderRadius: 10, padding: 16, boxShadow: '0 1px 4px rgba(0,0,0,.06)' }}>
            <div className="shimmer" style={{ width: 40, height: 40, borderRadius: 10, marginBottom: 12 }} />
            <div className="shimmer" style={{ width: '70%', height: 10, marginBottom: 8 }} />
            <div className="shimmer" style={{ width: '50%', height: 18 }} />
          </div>
        </Col>
      ))}
    </Row>
  );
}

/** A skeleton content card — header bar + N placeholder rows. */
export function SkeletonCard({ rows = 4, height = 220 }) {
  return (
    <div style={{ background: 'white', borderRadius: 8, padding: 16, boxShadow: '0 1px 4px rgba(0,0,0,.06)', minHeight: height }}>
      <div className="shimmer" style={{ width: '40%', height: 14, marginBottom: 16 }} />
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="shimmer" style={{ width: `${92 - i * 6}%`, height: 12, marginBottom: 10 }} />
      ))}
    </div>
  );
}

/** Skeleton table rows — drop inside a Table's replacement while loading, or standalone. */
export function SkeletonTable({ rows = 5, cols = 4 }) {
  return (
    <div style={{ padding: 8 }}>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} style={{ display: 'flex', gap: 16, padding: '10px 8px', borderBottom: '1px solid #f5f5f5' }}>
          {Array.from({ length: cols }).map((_, c) => (
            <div key={c} className="shimmer" style={{ flex: c === 0 ? 2 : 1, height: 12 }} />
          ))}
        </div>
      ))}
    </div>
  );
}
