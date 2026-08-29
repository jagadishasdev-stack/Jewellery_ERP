/**
 * "Shop Copy" / "Customer Copy" — a small add-on next to Reprint/Preview so
 * a bill can be printed a second time with a clear banner distinguishing
 * which copy is which (common jewellery-billing practice: one copy stays
 * with the shop for its own records, one goes to the customer). "Both"
 * prints them one after another. Deliberately separate from the normal
 * single-click print — that stays exactly as it was, unlabeled, for the
 * common case where only one copy is ever needed.
 */
import React from 'react';
import { Dropdown, Button } from 'antd';
import { CopyOutlined } from '@ant-design/icons';

export default function CopyPrintButton({ onPrintCopy, loading, size = 'small' }) {
  const items = [
    { key: 'Shop Copy', label: '🏪 Shop Copy' },
    { key: 'Customer Copy', label: '🧾 Customer Copy' },
    { key: 'both', label: '📑 Both Copies' },
  ];
  const handleClick = async ({ key }) => {
    if (key === 'both') {
      await onPrintCopy('Shop Copy');
      await onPrintCopy('Customer Copy');
    } else {
      await onPrintCopy(key);
    }
  };
  return (
    <Dropdown menu={{ items, onClick: handleClick }} trigger={['click']}>
      <Button size={size} icon={<CopyOutlined />} loading={loading}>Copies</Button>
    </Dropdown>
  );
}
