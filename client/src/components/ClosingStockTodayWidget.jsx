/**
 * ClosingStockTodayWidget — dashboard summary tile row for today's stock
 * movement (Opening/Sales/Approval Issue/Approval Receipts/Closing/Tags),
 * pulled from the same Closing Report endpoint used by
 * pages/reports/ClosingReportPage.jsx with fromDate=toDate=today.
 */
import React from 'react';
import { Row, Col, Card, Statistic, Typography } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { reportsApi } from '../api/modules';
import { formatWeight } from '../utils/calculations';
import dayjs from 'dayjs';

const { Text } = Typography;

export default function ClosingStockTodayWidget() {
  const navigate = useNavigate();
  const today = dayjs().format('YYYY-MM-DD');

  const { data, isLoading } = useQuery({
    queryKey: ['closing-report-today', today],
    queryFn: () => reportsApi.closingReport({ metal: 'All', fromDate: today, toDate: today }).then(r => r.data.data),
  });

  const totals = data?.totals || {};

  const tiles = [
    { label: "Today's Opening Stock", value: totals.openingWeight, formatter: formatWeight, color: '#1890ff' },
    { label: "Today's Sales", value: totals.soldWeight, formatter: formatWeight, color: '#ff4d4f' },
    { label: "Today's Approval Issues", value: totals.approvalIssueWeight, formatter: formatWeight, color: '#fa8c16' },
    { label: "Today's Approval Receipts", value: totals.approvalReceiveWeight, formatter: formatWeight, color: '#722ed1' },
    { label: "Today's Closing Stock", value: totals.closingWeight, formatter: formatWeight, color: '#B8860B' },
    { label: 'Total Tags', value: totals.tags, color: '#52c41a' },
  ];

  return (
    <Card
      className="erp-card"
      style={{ marginBottom: 16, borderRadius: 10, cursor: 'pointer' }}
      bodyStyle={{ padding: '14px 16px' }}
      onClick={() => navigate('/reports/closing-report')}
    >
      <Text style={{ fontSize: 12, color: '#888', fontWeight: 600, display: 'block', marginBottom: 10 }}>
        📊 CLOSING STOCK — TODAY
      </Text>
      <Row gutter={[10, 10]}>
        {tiles.map((t, i) => (
          <Col xs={12} sm={8} md={4} key={i}>
            <Statistic
              title={<Text style={{ fontSize: 11, color: '#888' }}>{t.label}</Text>}
              value={isLoading ? undefined : (t.value || 0)}
              formatter={t.formatter ? (v) => t.formatter(v) : undefined}
              valueStyle={{ color: t.color, fontSize: 16, fontWeight: 700 }}
            />
          </Col>
        ))}
      </Row>
    </Card>
  );
}
