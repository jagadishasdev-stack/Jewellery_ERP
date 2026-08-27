import React from 'react';
import {
  Drawer, Descriptions, Tag, Space, Typography,
  Divider, Image, Empty,
} from 'antd';
import { BarcodeOutlined, PictureOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { ornamentsApi, catalogApi } from '../../api/modules';
import { formatCurrency, formatWeight } from '../../utils/calculations';
import { METAL_TYPE_COLORS } from '../../utils/metalTypes';
import BarcodeLabel from '../../components/BarcodeLabel';
import { SkeletonCard } from '../../components/states/Skeletons';
import dayjs from 'dayjs';

const { Text } = Typography;

export default function OrnamentDetailDrawer({ ornamentId, open, onClose }) {
  const { data: ornament, isLoading } = useQuery({
    queryKey: ['ornament-detail', ornamentId],
    queryFn: () => ornamentsApi.getById(ornamentId).then((r) => r.data.data),
    enabled: !!ornamentId && open,
  });

  // Real product photos (Section 12) — the same catalog/images API the
  // Stock table's image-upload panel already uses, just scoped to this
  // one item. No new endpoint, no mock imagery.
  const { data: images } = useQuery({
    queryKey: ['ornament-images', ornamentId],
    queryFn: () => catalogApi.getImages({ ornament_ids: ornamentId }).then((r) => r.data.data || []),
    enabled: !!ornamentId && open,
  });
  const primaryImage = (images || []).find((i) => i.Is_Primary) || (images || [])[0];

  if (isLoading) {
    return (
      <Drawer open={open} onClose={onClose} width={520} title="Loading...">
        <SkeletonCard rows={8} height={500} />
      </Drawer>
    );
  }
  if (!ornament) return null;

  const statusColor = ornament.Is_Sold ? 'red' : ornament.Is_Reserved ? 'blue' : 'green';
  const statusText = ornament.Is_Sold ? 'Sold' : ornament.Is_Reserved ? 'Reserved' : 'Available';

  return (
    <Drawer
      title={
        <Space>
          <BarcodeOutlined style={{ color: '#B8860B' }} />
          <Text strong>{ornament.Type_Name || 'Ornament'} Details</Text>
          <Tag color={statusColor}>{statusText}</Tag>
        </Space>
      }
      open={open}
      onClose={onClose}
      width={520}
    >
      {/* Product photo */}
      <div style={{
        textAlign: 'center', marginBottom: 16, background: 'var(--ink-100)',
        borderRadius: 'var(--radius-md)', padding: primaryImage ? 8 : 24,
      }}>
        {primaryImage ? (
          <Image
            src={primaryImage.Image_URL}
            alt={ornament.Article_Number}
            style={{ maxHeight: 220, objectFit: 'contain', borderRadius: 8 }}
          />
        ) : (
          <Empty
            image={<PictureOutlined style={{ fontSize: 32, color: 'var(--ink-300)' }} />}
            description={<Text className="caption">No photo uploaded for this item yet</Text>}
          />
        )}
      </div>

      {/* QR label */}
      <div style={{ textAlign: 'center', marginBottom: 20 }}>
        <BarcodeLabel ornament={ornament} showPrint />
      </div>

      <Divider style={{ margin: '12px 0' }} />

      {/* Classification */}
      <Descriptions title="Classification" size="small" column={2} bordered style={{ marginBottom: 16 }}>
        <Descriptions.Item label="Article No">
          <Text code copyable>{ornament.Article_Number}</Text>
        </Descriptions.Item>
        <Descriptions.Item label="Type">{ornament.Type_Name || '-'}</Descriptions.Item>
        <Descriptions.Item label="Metal">
          <Tag color={METAL_TYPE_COLORS[ornament.Metal_Type] || 'default'}>{ornament.Metal_Type || '-'}</Tag>
        </Descriptions.Item>
        <Descriptions.Item label="Design">{ornament.Design_Name || '-'}</Descriptions.Item>
        <Descriptions.Item label="Purity">
          <Tag color="gold">{ornament.Purity_Code || '-'}</Tag>
        </Descriptions.Item>
        <Descriptions.Item label="Hallmark">{ornament.Hallmark_Certificate_No || '-'}</Descriptions.Item>
      </Descriptions>

      {/* Location — Floor_Name is real, joined server-side; Counter/Tray
          aren't currently joined into this response, so only what's
          actually returned is shown here rather than a fabricated label. */}
      <Descriptions title="Current Location" size="small" column={2} bordered style={{ marginBottom: 16 }}>
        <Descriptions.Item label="Floor">{ornament.Floor_Name || '-'}</Descriptions.Item>
        <Descriptions.Item label="Location">{ornament.Physical_Location || '-'}</Descriptions.Item>
      </Descriptions>

      {/* Weight */}
      <Descriptions title="Weight Details" size="small" column={2} bordered style={{ marginBottom: 16 }}>
        <Descriptions.Item label="Gross Weight">{formatWeight(ornament.Gross_Weight)}</Descriptions.Item>
        <Descriptions.Item label="Net Gold">{formatWeight(ornament.Net_Gold_Weight)}</Descriptions.Item>
        <Descriptions.Item label="Stone Weight">{formatWeight(ornament.Stone_Weight)}</Descriptions.Item>
        <Descriptions.Item label="Wastage">{formatWeight(ornament.Wastage_Weight)}</Descriptions.Item>
        {parseInt(ornament.Number_Of_Stones || 0) > 0 && (
          <>
            <Descriptions.Item label="No. of Stones">{ornament.Number_Of_Stones}</Descriptions.Item>
            <Descriptions.Item label="Total Carats">{parseFloat(ornament.Total_Stone_Carat || 0).toFixed(3)} ct</Descriptions.Item>
          </>
        )}
      </Descriptions>

      {/* Purchase Information — Supplier_Name/Code are real, already
          joined server-side but weren't surfaced here before. */}
      {(ornament.Supplier_Name || ornament.Purchase_Cost) && (
        <Descriptions title="Purchase Information" size="small" column={2} bordered style={{ marginBottom: 16 }}>
          <Descriptions.Item label="Supplier" span={2}>
            {ornament.Supplier_Name ? `${ornament.Supplier_Name}${ornament.Supplier_Code ? ` (${ornament.Supplier_Code})` : ''}` : '-'}
          </Descriptions.Item>
          <Descriptions.Item label="Purchase Cost">{formatCurrency(ornament.Purchase_Cost)}</Descriptions.Item>
        </Descriptions>
      )}

      {/* Pricing */}
      <Descriptions title="Pricing" size="small" column={2} bordered style={{ marginBottom: 16 }}>
        <Descriptions.Item label="Gold Rate">{formatCurrency(ornament.Current_Gold_Rate)}/g</Descriptions.Item>
        <Descriptions.Item label="Making/g">{formatCurrency(ornament.Base_Making_Charge_Per_Gram)}/g</Descriptions.Item>
        <Descriptions.Item label="Making Total">{formatCurrency(ornament.Final_Making_Charge_Total)}</Descriptions.Item>
        <Descriptions.Item label="Wastage Amt">{formatCurrency(ornament.Wastage_Amount)}</Descriptions.Item>
        <Descriptions.Item label="Taxable Value">{formatCurrency(ornament.Taxable_Value)}</Descriptions.Item>
        <Descriptions.Item label="GST (3%)">{formatCurrency(ornament.GST_Amount)}</Descriptions.Item>
        <Descriptions.Item label="Total Price (MRP)" span={2}>
          <Text strong style={{ color: '#B8860B', fontSize: 16 }}>{formatCurrency(ornament.Total_Price)}</Text>
        </Descriptions.Item>
      </Descriptions>

      {/* Stock */}
      <Descriptions title="Stock Info" size="small" column={2} bordered>
        <Descriptions.Item label="Qty">{ornament.Stock_Quantity}</Descriptions.Item>
        <Descriptions.Item label="Min Level">{ornament.Min_Stock_Level}</Descriptions.Item>
        <Descriptions.Item label="Added On">{dayjs(ornament.Created_Date).format('DD-MMM-YYYY')}</Descriptions.Item>
        <Descriptions.Item label="Added By">{ornament.Created_By || '-'}</Descriptions.Item>
      </Descriptions>
    </Drawer>
  );
}
