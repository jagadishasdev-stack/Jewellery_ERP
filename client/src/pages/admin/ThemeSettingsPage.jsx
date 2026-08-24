/**
 * ThemeSettingsPage — admin control for the whole tenant's UI look: font
 * family/weight, primary accent color, and text case. Saving applies
 * instantly for every user of the tenant (see uiThemeStore.js + this app's
 * ConfigProvider in main.jsx), not just the admin's own browser.
 */
import React, { useEffect, useState } from 'react';
import {
  Card, Select, Radio, Button, Typography, Space, message, ColorPicker, Row, Col, Divider, Tag,
  Upload, Slider,
} from 'antd';
import { SaveOutlined, ReloadOutlined, BgColorsOutlined, UploadOutlined, UndoOutlined } from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { uiThemeApi, uploadApi } from '../../api/modules';
import {
  useUiThemeStore, applyThemeToDocument,
  FONT_OPTIONS, FONT_WEIGHT_OPTIONS, TEXT_CASE_OPTIONS,
} from '../../store/uiThemeStore';
import PageTour from '../../components/PageTour';

const { Title, Text } = Typography;

const DEFAULTS = { Font_Family: 'Inter', Font_Weight: 400, Primary_Color: '#B8860B', Text_Case: 'none', Logo_URL: null, Logo_Size: 100 };

export default function ThemeSettingsPage() {
  const qc = useQueryClient();
  const setGlobalTheme = useUiThemeStore((s) => s.setTheme);
  const [draft, setDraft] = useState(DEFAULTS);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const uploadLogo = async (file) => {
    setUploading(true);
    try {
      const res = await uploadApi.uploadImage(file, 'logos');
      setDraft((p) => ({ ...p, Logo_URL: res.data.data.url }));
      message.success('Logo uploaded — click Save to apply it for everyone.');
    } catch (err) {
      message.error(err.response?.data?.message || 'Failed to upload logo.');
    } finally {
      setUploading(false);
    }
    return false; // prevent antd's default auto-upload behavior
  };

  const { data, isLoading } = useQuery({
    queryKey: ['ui-theme'],
    queryFn: () => uiThemeApi.get().then((r) => r.data.data),
  });

  useEffect(() => {
    if (data) setDraft({ ...DEFAULTS, ...data });
  }, [data]);

  // Live preview: apply every change to THIS browser immediately, so the
  // admin sees the effect right away — only Save makes it tenant-wide. If
  // they navigate away without saving, restore whatever theme was actually
  // saved (not the unsaved draft) so this page doesn't leave a stray preview
  // applied to the admin's own screen.
  useEffect(() => {
    applyThemeToDocument(draft);
  }, [draft]);

  useEffect(() => () => {
    const savedTheme = useUiThemeStore.getState().theme;
    applyThemeToDocument(savedTheme || DEFAULTS);
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      const res = await uiThemeApi.update(draft);
      setGlobalTheme(res.data.data);
      qc.invalidateQueries(['ui-theme']);
      message.success('Theme updated — every user in your tenant will see this now.');
    } catch (err) {
      message.error(err.response?.data?.message || 'Failed to save theme.');
    } finally {
      setSaving(false);
    }
  };

  const resetToDefault = () => setDraft(DEFAULTS);

  // ── Walkthrough tour refs ───────────────────────────────────────────────────
  const controlsRef = React.useRef(null);
  const previewRef = React.useRef(null);
  const saveRef = React.useRef(null);
  const tourSteps = [
    { title: '1. Choose Font, Weight & Color', description: 'Pick a font family, base text weight, and the primary brand color used across buttons, links, the sidebar, and menus.', target: () => controlsRef.current },
    { title: '2. Live Preview', description: 'Changes apply instantly to your own screen as you adjust them, so you can see exactly how it\'ll look before committing.', target: () => previewRef.current },
    { title: '3. Save for Everyone', description: 'Nothing changes for other staff until you click Save — once you do, every user in your tenant sees the new look immediately on their next screen load.', target: () => saveRef.current },
  ];

  return (
    <div className="page-wrapper">
      <div className="page-header">
        <div>
          <div className="page-header-title"><BgColorsOutlined style={{ color: '#B8860B', marginRight: 8 }} />Theme Settings</div>
          <div className="page-header-sub">Font, color and text case for the whole tenant — applies to every user, everywhere in the app.</div>
        </div>
      </div>

      <Row gutter={16}>
        <Col xs={24} lg={12}>
          <Card title="Appearance" loading={isLoading} style={{ borderRadius: 10 }}>
            <div ref={controlsRef}>
              <Space direction="vertical" size={20} style={{ width: '100%' }}>
                <div>
                  <Text strong style={{ display: 'block', marginBottom: 6 }}>Logo</Text>
                  <Space align="center" size={16} wrap>
                    <div style={{
                      width: 100, height: 60, border: '1px solid #f0f0f0', borderRadius: 8,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fafafa', overflow: 'hidden',
                    }}>
                      <img src={draft.Logo_URL || '/logo.png'} alt="Current logo" style={{ maxWidth: '90%', maxHeight: '90%' }} />
                    </div>
                    <Space direction="vertical" size={6}>
                      <Upload accept="image/*" showUploadList={false} beforeUpload={uploadLogo}>
                        <Button icon={<UploadOutlined />} loading={uploading}>Change Logo</Button>
                      </Upload>
                      {draft.Logo_URL && (
                        <Button
                          size="small" type="text" icon={<UndoOutlined />}
                          onClick={() => setDraft((p) => ({ ...p, Logo_URL: null }))}
                        >
                          Revert to default logo
                        </Button>
                      )}
                    </Space>
                  </Space>
                </div>

                <div>
                  <Text strong style={{ display: 'block', marginBottom: 6 }}>
                    Logo Size — {draft.Logo_Size || 100}%
                  </Text>
                  <Slider
                    min={50} max={200} step={5}
                    value={draft.Logo_Size || 100}
                    onChange={(v) => setDraft((p) => ({ ...p, Logo_Size: v }))}
                    marks={{ 50: '50%', 100: '100%', 150: '150%', 200: '200%' }}
                  />
                </div>

                <div>
                  <Text strong style={{ display: 'block', marginBottom: 6 }}>Font Family</Text>
                  <Select
                    style={{ width: '100%' }}
                    value={draft.Font_Family}
                    onChange={(v) => setDraft((p) => ({ ...p, Font_Family: v }))}
                  >
                    {FONT_OPTIONS.map((f) => (
                      <Select.Option key={f.key} value={f.key}>
                        <span style={{ fontFamily: f.key }}>{f.label}</span>
                      </Select.Option>
                    ))}
                  </Select>
                </div>

                <div>
                  <Text strong style={{ display: 'block', marginBottom: 6 }}>Font Weight</Text>
                  <Select
                    style={{ width: '100%' }}
                    value={draft.Font_Weight}
                    onChange={(v) => setDraft((p) => ({ ...p, Font_Weight: v }))}
                  >
                    {FONT_WEIGHT_OPTIONS.map((f) => (
                      <Select.Option key={f.key} value={f.key}>{f.label}</Select.Option>
                    ))}
                  </Select>
                </div>

                <div>
                  <Text strong style={{ display: 'block', marginBottom: 6 }}>Primary Color</Text>
                  <Space>
                    <ColorPicker
                      value={draft.Primary_Color}
                      onChange={(c) => setDraft((p) => ({ ...p, Primary_Color: c.toHexString() }))}
                      showText
                    />
                  </Space>
                </div>

                <div>
                  <Text strong style={{ display: 'block', marginBottom: 6 }}>Text Case</Text>
                  <Radio.Group
                    value={draft.Text_Case}
                    onChange={(e) => setDraft((p) => ({ ...p, Text_Case: e.target.value }))}
                  >
                    {TEXT_CASE_OPTIONS.map((t) => (
                      <Radio.Button key={t.key} value={t.key}>{t.label}</Radio.Button>
                    ))}
                  </Radio.Group>
                </div>
              </Space>
            </div>

            <Divider />

            <Space ref={saveRef}>
              <Button
                type="primary" icon={<SaveOutlined />} loading={saving} onClick={save}
                style={{ background: draft.Primary_Color, borderColor: draft.Primary_Color, fontWeight: 600 }}
              >
                Save for Whole Tenant
              </Button>
              <Button icon={<ReloadOutlined />} onClick={resetToDefault}>Reset to Default</Button>
            </Space>
          </Card>
        </Col>

        <Col xs={24} lg={12}>
          <div ref={previewRef}>
            <Card title="Live Preview" style={{ borderRadius: 10 }}>
              <Space direction="vertical" size={14} style={{ width: '100%' }}>
                <div style={{ background: '#1A1A1A', padding: 12, borderRadius: 8, textAlign: 'center' }}>
                  <img src={draft.Logo_URL || '/logo.png'} alt="Logo preview" style={{ height: 56 * ((draft.Logo_Size || 100) / 100), maxWidth: '100%' }} />
                </div>
                <Title level={4} style={{ margin: 0 }}>Sample Heading</Title>
                <Text>This is how regular body text will look across every screen in the app.</Text>
                <Space wrap>
                  <Button type="primary" style={{ background: draft.Primary_Color, borderColor: draft.Primary_Color }}>Primary Button</Button>
                  <Button>Default Button</Button>
                  <Tag color={draft.Primary_Color}>Sample Tag</Tag>
                </Space>
                <Card size="small" style={{ background: '#fafafa', borderRadius: 8 }}>
                  <Text strong>Item Type</Text><br />
                  <Text type="secondary">Gold Ring — 22K — ₹34,500</Text>
                </Card>
              </Space>
            </Card>
          </div>
        </Col>
      </Row>

      <PageTour steps={tourSteps} />
    </div>
  );
}
