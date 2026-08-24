import React, { useRef } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import { Button, Typography } from 'antd';
import { PrinterOutlined } from '@ant-design/icons';
import { formatCurrency } from '../utils/calculations';
import { useAuthStore } from '../store/authStore';
import { printBarcodeLabel } from '../utils/thermalReceipt';

const { Text } = Typography;

/**
 * BarcodeLabel — renders a printable QR-code sticker for an ornament.
 * QR encodes the Article_Number — scans the same way a barcode reader would
 * (decoded text goes straight into any barcode/QR-capable search field),
 * but is faster and more reliable to scan from an angle or at a distance.
 * Printing delegates to utils/thermalReceipt.js's printBarcodeLabel(), which
 * uses the tenant's saved Label Designer template and the shared
 * 'thermal_label' printer role (silent via QZ Tray if configured).
 */
export default function BarcodeLabel({ ornament, showPrint = true }) {
  const { user } = useAuthStore();
  // QRCodeCanvas doesn't forward refs — kept only for the on-screen preview
  // below; the actual print path generates its own QR via the label renderer.
  const containerRef = useRef(null);

  const handlePrint = () => {
    printBarcodeLabel(ornament, user?.companyName);
  };

  if (!ornament) return null;

  return (
    <div>
      <div style={{
        border: '1px solid #e0e0e0', borderRadius: 6, padding: 12,
        width: 200, background: 'white', display: 'inline-block', textAlign: 'center',
      }}>
        <Text strong style={{ fontSize: 11, display: 'block', marginBottom: 8 }}>
          {ornament.Type_Name || 'Item'}
        </Text>
        <div ref={containerRef} style={{ display: 'inline-block', lineHeight: 0 }}>
          <QRCodeCanvas
            value={ornament.Article_Number || ''}
            size={110}
            level="M"
            includeMargin={false}
          />
        </div>
        <Text code style={{ fontSize: 10, display: 'block', marginTop: 6 }}>
          {ornament.Article_Number}
        </Text>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, alignItems: 'center' }}>
          <Text style={{ background: '#B8860B', color: 'white', padding: '2px 6px', borderRadius: 4, fontSize: 10 }}>
            {ornament.Purity_Code || '-'}
          </Text>
          <Text style={{ fontSize: 10 }}>{parseFloat(ornament.Gross_Weight || 0).toFixed(3)}g</Text>
          <Text strong style={{ color: '#B8860B' }}>{formatCurrency(ornament.Total_Price)}</Text>
        </div>
      </div>
      {showPrint && (
        <div style={{ marginTop: 8 }}>
          <Button size="small" icon={<PrinterOutlined />} onClick={handlePrint}>
            Print Label
          </Button>
        </div>
      )}
    </div>
  );
}
