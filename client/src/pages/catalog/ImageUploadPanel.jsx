/**
 * ImageUploadPanel — multi-image upload for a stock item
 * Used inside StockManagementPage and ProductCatalogPage
 * Images stored in tbl_product_images linked to Ornament_ID + Article_Number
 * NO separate product master — uses tbl_ornament_master as source of truth
 */
import React, { useState } from 'react';
import {
  Upload, Image, Button, Space, Spin, message, Tooltip,
  Badge, Card, Typography, Tag, Popconfirm,
} from 'antd';
import {
  UploadOutlined, DeleteOutlined, StarOutlined, StarFilled,
  CameraOutlined, EyeOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { catalogApi } from '../../api/modules';

const { Text } = Typography;
const { Dragger } = Upload;

const IMAGE_TYPES = [
  { key: 'front',  label: '📷 Front View' },
  { key: 'side',   label: '📐 Side View' },
  { key: 'back',   label: '🔁 Back View' },
  { key: 'model',  label: '👤 Model View' },
  { key: 'detail', label: '🔍 Close-up' },
  { key: 'other',  label: '📎 Other' },
];

export default function ImageUploadPanel({
  ornamentId, articleNumber, tenantId, compact = false,
  images: imagesProp, onChanged,
}) {
  const qc = useQueryClient();
  const [selectedType, setSelectedType] = useState('front');
  const [previewSrc, setPreviewSrc] = useState(null);

  // When a parent already has the images (e.g. batch-fetched for a whole list),
  // it passes them via `images` and we skip our own per-item network call.
  const hasExternalImages = imagesProp !== undefined;

  // ── Fetch images for this ornament (only when not supplied by parent) ───────
  const { data: fetchedImages = [], isLoading } = useQuery({
    queryKey: ['ornament-images', ornamentId, articleNumber],
    queryFn: () => catalogApi.getImages({ ornament_id: ornamentId, article_number: articleNumber }).then(r => r.data.data || []),
    enabled: !hasExternalImages && !!(ornamentId || articleNumber),
  });

  const images = hasExternalImages ? imagesProp : fetchedImages;

  // ── Upload mutation ──────────────────────────────────────────────────────────
  const uploadMutation = useMutation({
    mutationFn: async (file) => {
      const fd = new FormData();
      fd.append('image', file);
      fd.append('ornament_id', ornamentId || '');
      fd.append('article_number', articleNumber || '');
      fd.append('image_type', selectedType);
      fd.append('sort_order', images.length.toString());
      return catalogApi.uploadImage(fd);
    },
    onSuccess: () => {
      message.success('Image uploaded!');
      qc.invalidateQueries(['ornament-images', ornamentId, articleNumber]);
      qc.invalidateQueries(['ornaments']); // refresh stock list too
      onChanged?.();
    },
    onError: (err) => message.error(err.response?.data?.message || 'Upload failed.'),
  });

  // ── Set primary image ────────────────────────────────────────────────────────
  const setPrimaryMutation = useMutation({
    mutationFn: (imageId) => catalogApi.setPrimaryImage(imageId, { ornament_id: ornamentId, article_number: articleNumber }),
    onSuccess: () => {
      message.success('Set as primary image!');
      qc.invalidateQueries(['ornament-images', ornamentId, articleNumber]);
      qc.invalidateQueries(['ornaments']);
      onChanged?.();
    },
  });

  // ── Delete image ────────────────────────────────────────────────────────────
  const deleteMutation = useMutation({
    mutationFn: (imageId) => catalogApi.deleteImage(imageId),
    onSuccess: () => {
      message.success('Image deleted.');
      qc.invalidateQueries(['ornament-images', ornamentId, articleNumber]);
      qc.invalidateQueries(['ornaments']);
      onChanged?.();
    },
  });

  const beforeUpload = (file) => {
    const ok = /image\/(jpeg|png|webp|gif)/.test(file.type);
    if (!ok) { message.error('Only JPG, PNG, WEBP allowed.'); return false; }
    if (file.size > 20 * 1024 * 1024) { message.error('Max 20MB.'); return false; }
    uploadMutation.mutate(file);
    return false; // prevent default upload
  };

  if (compact) {
    // Compact mode: just show image count + quick upload button
    return (
      <Space size={4}>
        <Badge count={images.length} style={{ background: images.length > 0 ? '#52c41a' : '#d9d9d9' }}>
          <Upload beforeUpload={beforeUpload} showUploadList={false} accept="image/*">
            <Button size="small" icon={<CameraOutlined />} loading={uploadMutation.isPending}>
              {images.length > 0 ? 'Add Photo' : 'Upload Photo'}
            </Button>
          </Upload>
        </Badge>
        {images[0] && (
          <Image src={images[0].Image_URL} width={36} height={36} style={{ objectFit: 'cover', borderRadius: 3 }}
            preview={{ src: images[0].Image_URL }} />
        )}
      </Space>
    );
  }

  return (
    <div>
      {/* Image type selector */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
        {IMAGE_TYPES.map(t => (
          <Tag key={t.key} style={{ cursor: 'pointer', fontSize: 11 }}
            color={selectedType === t.key ? 'gold' : 'default'}
            onClick={() => setSelectedType(t.key)}>
            {t.label}
          </Tag>
        ))}
      </div>

      {/* Upload zone */}
      <Dragger beforeUpload={beforeUpload} showUploadList={false} accept="image/*"
        style={{ marginBottom: 12, borderRadius: 8 }}>
        <div style={{ padding: '12px 0' }}>
          {uploadMutation.isPending
            ? <Spin tip="Uploading..." />
            : <><CameraOutlined style={{ fontSize: 28, color: '#B8860B' }} />
                <p style={{ margin: '6px 0 0', fontSize: 12, color: '#888' }}>
                  Click or drag image here · JPG/PNG/WEBP · Max 20MB
                </p></>
          }
        </div>
      </Dragger>

      {/* Image gallery */}
      {isLoading ? (
        <div style={{ textAlign: 'center', padding: 20 }}><Spin /></div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: 8 }}>
          {images.map(img => (
            <div key={img.Image_ID} style={{ position: 'relative' }}>
              <Card bodyStyle={{ padding: 4 }} style={{ borderRadius: 6, border: img.Is_Primary ? '2px solid #B8860B' : '1px solid #f0f0f0' }}>
                <Image src={img.Image_URL} width="100%" height={90}
                  style={{ objectFit: 'cover', borderRadius: 4 }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                  <Tag color={img.image_type ? 'blue' : 'default'} style={{ fontSize: 9, margin: 0 }}>
                    {img.Image_Type || 'photo'}
                  </Tag>
                  <Space size={2}>
                    <Tooltip title={img.Is_Primary ? 'Primary image' : 'Set as primary'}>
                      <Button type="text" size="small" style={{ padding: 0, height: 18 }}
                        icon={img.Is_Primary
                          ? <StarFilled style={{ color: '#B8860B', fontSize: 12 }} />
                          : <StarOutlined style={{ fontSize: 12 }} />}
                        onClick={() => !img.Is_Primary && setPrimaryMutation.mutate(img.Image_ID)} />
                    </Tooltip>
                    <Popconfirm title="Delete this image?" onConfirm={() => deleteMutation.mutate(img.Image_ID)}
                      okButtonProps={{ danger: true }} okText="Delete">
                      <Button type="text" size="small" danger style={{ padding: 0, height: 18 }}
                        icon={<DeleteOutlined style={{ fontSize: 11 }} />} />
                    </Popconfirm>
                  </Space>
                </div>
              </Card>
            </div>
          ))}
          {images.length === 0 && (
            <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: 16, color: '#d9d9d9', fontSize: 12 }}>
              No images yet. Upload the first photo above.
            </div>
          )}
        </div>
      )}

      {images.length > 0 && (
        <Text type="secondary" style={{ fontSize: 11 }}>
          {images.length} image{images.length > 1 ? 's' : ''} ·
          {images.find(i => i.Is_Primary) ? ' Primary set ✅' : ' No primary set'}
        </Text>
      )}
    </div>
  );
}
