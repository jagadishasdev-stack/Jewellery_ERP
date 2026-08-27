/**
 * Manual/temporary printer override (spec §16) — "the default printer is
 * offline, let me send just this one job somewhere else, without changing
 * the saved default." A split button (antd's Dropdown.Button — the main
 * area and the small arrow are genuinely separate click targets): the main
 * click prints/reprints to the normal configured default (unchanged
 * behavior); the arrow opens a list of every OS printer QZ Tray can
 * currently see, and picking one sends THIS one job there instead —
 * nothing about the saved default config is touched.
 */
import React, { useState } from 'react';
import { Dropdown } from 'antd';
import { PrinterOutlined } from '@ant-design/icons';
import { listPrinters, isQZConnected } from '../utils/printService';

export default function PrinterOverrideButton({ onPrint, loading, size = 'small', label }) {
  const [printers, setPrinters] = useState(null); // null = not loaded yet

  const loadPrinters = async () => {
    if (printers !== null) return; // already loaded this session
    setPrinters(isQZConnected() ? await listPrinters() : []);
  };

  const items = (printers || []).length
    ? printers.map((name) => ({ key: name, label: name }))
    : [{ key: '__none__', label: 'QZ Tray not connected, or no printers found', disabled: true }];

  return (
    <Dropdown.Button
      size={size}
      icon={<PrinterOutlined />}
      loading={loading}
      onClick={() => onPrint()}
      menu={{ items, onClick: ({ key }) => key !== '__none__' && onPrint(key) }}
      trigger={['click']}
      onOpenChange={(open) => open && loadPrinters()}
    >
      {label}
    </Dropdown.Button>
  );
}
