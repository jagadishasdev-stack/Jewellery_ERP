/**
 * BranchSelector — always visible in the header, per the Multi-Branch
 * Management spec's own UX rule (§37): the current branch context must
 * never be ambiguous, and "All Branches" must be unmistakably a
 * consolidated view, not confusable with a single branch's numbers.
 */
import React from 'react';
import { Select, Tag, Space } from 'antd';
import { ApartmentOutlined, BarChartOutlined } from '@ant-design/icons';
import { useNavigate, useLocation } from 'react-router-dom';
import { useBranch } from '../../contexts/BranchContext';

const { Option } = Select;

export default function BranchSelector() {
  const { selectedBranchId, switchBranch, allBranches, branches, loaded, isAllBranches, currentBranch, ALL_BRANCHES } = useBranch();
  const navigate = useNavigate();
  const location = useLocation();

  // Nothing to select yet (still loading, or user has no branch access at
  // all — a genuinely branch-less tenant, or access not yet granted).
  if (!loaded || (branches.length === 0 && !allBranches)) return null;

  // Exactly one branch and no "All Branches" option — nothing to switch
  // between, so show a plain read-only label instead of a pointless dropdown.
  if (branches.length === 1 && !allBranches) {
    return (
      <Tag icon={<ApartmentOutlined />} color="blue" style={{ margin: 0 }}>
        {branches[0].Branch_Name}
      </Tag>
    );
  }

  return (
    <Space size={4}>
      <ApartmentOutlined style={{ color: '#888' }} />
      <Select
        value={selectedBranchId || undefined}
        onChange={switchBranch}
        placeholder="Select Branch"
        size="small"
        style={{ minWidth: 150 }}
        popupMatchSelectWidth={false}
      >
        {branches.map((b) => (
          <Option key={b.Branch_ID} value={b.Branch_ID}>{b.Branch_Name}</Option>
        ))}
        {allBranches && <Option value={ALL_BRANCHES}>🏢 All Branches</Option>}
      </Select>
      {isAllBranches && (
        <>
          <Tag color="purple" style={{ margin: 0, fontWeight: 700, fontSize: 10 }}>
            CONSOLIDATED
          </Tag>
          {/* Direct route to the consolidated KPIs/charts/comparison view —
              this IS "select All Branches, see everything on one screen"
              made discoverable from wherever the selector itself lives,
              not just buried in the Reports menu. */}
          {location.pathname !== '/reports/branch-performance' && (
            <Tag
              icon={<BarChartOutlined />}
              color="gold"
              style={{ margin: 0, cursor: 'pointer', fontSize: 10 }}
              onClick={() => navigate('/reports/branch-performance')}
            >
              View Analytics
            </Tag>
          )}
        </>
      )}
    </Space>
  );
}
