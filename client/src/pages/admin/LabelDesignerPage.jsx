/**
 * Label Designer — drag-and-drop visual designer for barcode/RFID jewellery
 * stock tags (price tags, not full invoices).
 *
 * Forks the proven pattern from pages/invoice/InvoiceStudio.jsx:
 *   - Blocks are absolutely-positioned <div>s { id, type, x, y, w, h, content },
 *     dragged via plain mousedown/mousemove/mouseup window listeners — no DnD
 *     library.
 *   - The canvas is rendered at native resolution then CSS `transform: scale()`
 *     to fit the viewport (here scaling UP for small tags, since real tag
 *     sizes are tiny — 30mm etc — rather than only down like A4 invoices).
 *
 * Unlike Invoice Studio, the live preview and the print output share ONE
 * renderer: renderLabelHTML() in utils/labelRenderer.js. This page only
 * renders it for the on-canvas sample-data preview; real ornament printing
 * from stock/ornament pages is separate work that will import the same
 * function later (see printLabel() in that file).
 *
 * Persistence reuses the existing generic Invoice Studio template routes
 * (Document_Type is a free-text column, not an enum) with Document_Type =
 * 'BARCODE_LABEL'. The plural /templates routes only persist
 * Template_Name / Document_Type / Paper_Size / Layout_JSON(Components) /
 * Is_Default — there's no top-level Canvas_Width_MM column write on that
 * path — so canvas size is packed *inside* Layout_JSON as
 * { canvasWidthMm, canvasHeightMm, blocks }, which round-trips through the
 * existing server code untouched.
 */
import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  Button, Select, Input, InputNumber, Switch, Radio, Space, Typography,
  Divider, Tag, message, Modal, Popconfirm, Tooltip, Alert,
} from 'antd';
import {
  SaveOutlined, PlusOutlined, DeleteOutlined, StarOutlined, StarFilled,
  PrinterOutlined, InfoCircleOutlined, UploadOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../../store/authStore';
import { tenantApi, invoiceStudioApi } from '../../api/modules';
import {
  CSS_PX_PER_MM, mmToPx, pxToMm,
  LABEL_SIZE_PRESETS, LABEL_COMPONENTS, LABEL_TYPE_LABEL,
  defaultLabelContent, buildDefaultLabelBlocks, SAMPLE_ORNAMENT,
  renderLabelHTML, resolveQrDataUrls, printLabel,
} from '../../utils/labelRenderer';
import PageTour from '../../components/PageTour';

const { Title, Text } = Typography;
const { Option } = Select;
const DOC_TYPE = 'BARCODE_LABEL';
const GLOBAL_KEY = '__global__'; // Select value standing in for tenantId=null (the shared default template)

// ── Forked CanvasBlock — same drag mechanics as InvoiceStudio's, corrected
// for the fact our canvas is frequently scaled UP (small tags) rather than
// only down, so the drag delta divides by `scale` to track the cursor 1:1. ─
function LabelCanvasBlock({ block, selected, onSelect, onMove, scale }) {
  const handleMouseDown = (e) => {
    e.stopPropagation();
    onSelect(block.id);
    const startX = e.clientX - block.x * scale;
    const startY = e.clientY - block.y * scale;
    const onMove_ = (me) => onMove(block.id, (me.clientX - startX) / scale, (me.clientY - startY) / scale);
    const onUp = () => { window.removeEventListener('mousemove', onMove_); window.removeEventListener('mouseup', onUp); };
    window.addEventListener('mousemove', onMove_);
    window.addEventListener('mouseup', onUp);
  };

  return (
    <div
      onMouseDown={handleMouseDown}
      // mousedown's stopPropagation only stops the mousedown event itself —
      // the browser still fires a separate `click` event on mouseup, which
      // would otherwise bubble up to the canvas's onClick and immediately
      // deselect this block right after selecting it. Stop that too.
      onClick={(e) => e.stopPropagation()}
      style={{
        position: 'absolute', left: block.x, top: block.y, width: block.w, height: block.h,
        border: selected ? '2px solid #B8860B' : '1px dashed #d9d9d9',
        background: selected ? '#FFF8E1' : 'rgba(255,255,255,0.85)',
        cursor: 'move', borderRadius: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 9, color: '#555', userSelect: 'none', overflow: 'hidden', boxSizing: 'border-box',
      }}
    >
      <span style={{ fontSize: 9, textAlign: 'center', padding: '0 2px', pointerEvents: 'none' }}>
        {LABEL_TYPE_LABEL[block.type] || block.type}
      </span>
    </div>
  );
}

export default function LabelDesignerPage() {
  const { user } = useAuthStore();
  const qc = useQueryClient();
  // Super Admin can still browse/edit any tenant's tag (support) plus the
  // shared global default; a regular tenant admin only ever reaches their
  // own — enforced server-side too (see invoiceStudio.js's resolveTenantId),
  // this just avoids showing UI for choices that would 403 anyway.
  const isSuperAdmin = user?.roleName === 'Super Admin';

  const [sizePreset, setSizePreset] = useState('SMALL');
  const [canvasWidthMm, setCanvasWidthMm] = useState(30);
  const [canvasHeightMm, setCanvasHeightMm] = useState(20);
  const [blocks, setBlocks] = useState(() => buildDefaultLabelBlocks(30, 20));
  const [selectedId, setSelectedId] = useState(null);
  const [templateName, setTemplateName] = useState('New Label');
  const [editingId, setEditingId] = useState(null);
  const [isDefault, setIsDefault] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [qrDataUrls, setQrDataUrls] = useState({});
  const [analyzing, setAnalyzing] = useState(false);
  const [fullPreviewOpen, setFullPreviewOpen] = useState(false);

  // ── Walkthrough tour refs ───────────────────────────────────────────────────
  const tenantPickRef = useRef(null);
  const paletteRef = useRef(null);
  const canvasRef = useRef(null);
  const previewRef = useRef(null);
  const saveRef = useRef(null);
  const tourSteps = [
    isSuperAdmin
      ? { title: '1. Who Are You Designing For?', description: 'Pick a tenant client to design or edit their own tag, or leave it on the Global Default that\'s used until a tenant has one of their own.', target: () => tenantPickRef.current }
      : { title: '1. Your Tag Design', description: 'This is your shop\'s own barcode tag — isolated from every other tenant on this platform. Design freely; nothing here affects anyone else\'s tag, and nothing they design affects yours.', target: () => canvasRef.current },
    { title: '2. Component Palette', description: 'Click any component — Shop Name, Barcode, QR Code, Price, Purity, HUID, Article No and more — to drop it onto the canvas.', target: () => paletteRef.current },
    { title: '3. Canvas — Drag to Position', description: 'Drag any block on the label to reposition it, and click a block to select it and edit its size/font in the Properties panel.', target: () => canvasRef.current },
    { title: '4. Live Preview', description: 'This shows exactly how the label will print, using sample ornament data — the same renderer used for real printing. Click it to see the full-size design.', target: () => previewRef.current },
    { title: '5. Save Your Template', description: 'Give the label a name, then click Save to store this design for reuse — you can later mark it as the default so it\'s used automatically for new barcode tags.', target: () => saveRef.current },
  ];

  // Super Admin: defaults to the shared global default (editable by them
  // alone) and can switch to any tenant via the picker below. Everyone
  // else: locked to their own tenant, full stop — there is no picker to
  // show, and the server would reject any other tenantId anyway.
  const [tenantKey, setTenantKey] = useState(isSuperAdmin ? GLOBAL_KEY : user?.tenantId);
  const tenantId = tenantKey === GLOBAL_KEY ? null : tenantKey;

  const { data: tenants, isLoading: tenantsLoading } = useQuery({
    queryKey: ['tenants-all'],
    queryFn: () => tenantApi.getAllTenants().then((r) => r.data.data),
    enabled: isSuperAdmin, // this endpoint is Super-Admin-only — don't call it as a tenant admin
  });

  const selectedBlock = blocks.find((b) => b.id === selectedId);
  const canvasWidthPx = mmToPx(canvasWidthMm);
  const canvasHeightPx = mmToPx(canvasHeightMm);
  const scale = Math.min(3, Math.max(0.3, 560 / canvasWidthPx));

  const previewData = useMemo(() => ({ ...SAMPLE_ORNAMENT, Shop_Name: user?.companyName || SAMPLE_ORNAMENT.Shop_Name }), [user]);

  // ── Queries ────────────────────────────────────────────────────────────
  const { data: templates, isLoading: tmplLoading } = useQuery({
    queryKey: ['label-templates', tenantId],
    queryFn: () => invoiceStudioApi.getTemplates({ docType: DOC_TYPE, tenantId: tenantId === null ? 'null' : tenantId }).then((r) => r.data.data || []),
  });

  // ── Live preview: resolve QR data-urls whenever blocks/data change ──────
  useEffect(() => {
    let cancelled = false;
    resolveQrDataUrls(blocks, previewData).then((urls) => { if (!cancelled) setQrDataUrls(urls); });
    return () => { cancelled = true; };
  }, [blocks, previewData]);

  const previewHtml = useMemo(
    () => renderLabelHTML(blocks, canvasWidthMm, canvasHeightMm, previewData, qrDataUrls),
    [blocks, canvasWidthMm, canvasHeightMm, previewData, qrDataUrls]
  );
  const previewNativePx = canvasWidthMm * CSS_PX_PER_MM;
  const previewScale = Math.min(3, Math.max(0.3, 260 / previewNativePx));
  const previewNativeHeightPx = canvasHeightMm * CSS_PX_PER_MM;
  // Full-size modal preview — same math, just fitted to a much bigger target
  // width so the complete label design is clearly visible when clicked.
  const fullPreviewScale = Math.min(8, Math.max(1, 640 / previewNativePx));

  // ── Mutations ──────────────────────────────────────────────────────────
  const tenantParams = { tenantId: tenantId === null ? 'null' : tenantId };

  const saveMutation = useMutation({
    mutationFn: (data) => (editingId
      ? invoiceStudioApi.updateTemplate(editingId, data, tenantParams)
      : invoiceStudioApi.createTemplate(data, tenantParams)),
    onSuccess: (res) => {
      const saved = res.data.data;
      if (!editingId) setEditingId(saved.Template_ID);
      message.success('Label template saved.');
      qc.invalidateQueries(['label-templates']);
      setIsDirty(false);
    },
    onError: (err) => message.error(err.response?.data?.message || 'Failed to save label template.'),
  });

  const setDefaultMutation = useMutation({
    mutationFn: (id) => invoiceStudioApi.updateTemplate(id, { Is_Default: true, Document_Type: DOC_TYPE }, tenantParams),
    onSuccess: () => {
      message.success('Set as default label.');
      setIsDefault(true);
      qc.invalidateQueries(['label-templates']);
    },
    onError: (err) => message.error(err.response?.data?.message || 'Failed to set default.'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => invoiceStudioApi.deleteTemplate(id, tenantParams),
    onSuccess: () => {
      message.success('Label template deleted.');
      qc.invalidateQueries(['label-templates']);
      if (editingId) { setEditingId(null); }
    },
    onError: () => message.error('Failed to delete label template.'),
  });

  // ── Block manipulation ─────────────────────────────────────────────────
  const addBlock = (type) => {
    const id = `${type}_${Date.now()}`;
    const isQr = type === 'qr_code';
    const isBarcode128 = type === 'barcode_128';
    const wMm = isQr ? Math.min(canvasWidthMm - 4, canvasHeightMm - 4, 16) : Math.min(canvasWidthMm - 4, 24);
    // Code128 wants a wide, short box (it's a linear barcode, not square
    // like a QR) — roughly a 4:1 aspect ratio reads cleanly at typical tag sizes.
    const hMm = isQr ? wMm : isBarcode128 ? Math.min(canvasHeightMm - 4, 6) : 5;
    const offsetMm = (blocks.length % 5) * 1.5;
    const newBlock = {
      id, type,
      x: mmToPx(2 + offsetMm), y: mmToPx(2 + offsetMm), w: mmToPx(wMm), h: mmToPx(hMm),
      content: defaultLabelContent(type),
    };
    setBlocks((prev) => [...prev, newBlock]);
    setSelectedId(id);
    setIsDirty(true);
  };

  const moveBlock = useCallback((id, x, y) => {
    setBlocks((prev) => prev.map((b) => (b.id === id ? { ...b, x: Math.max(0, Math.round(x)), y: Math.max(0, Math.round(y)) } : b)));
    setIsDirty(true);
  }, []);

  const updateBlockRectMm = (id, field, mmValue) => {
    setBlocks((prev) => prev.map((b) => (b.id === id ? { ...b, [field]: Math.max(0, mmToPx(mmValue || 0)) } : b)));
    setIsDirty(true);
  };

  const updateBlockContent = (id, updates) => {
    setBlocks((prev) => prev.map((b) => (b.id === id ? { ...b, content: { ...b.content, ...updates } } : b)));
    setIsDirty(true);
  };

  const deleteBlock = (id) => {
    setBlocks((prev) => prev.filter((b) => b.id !== id));
    setSelectedId(null);
    setIsDirty(true);
  };

  // ── Size presets ───────────────────────────────────────────────────────
  const applyPreset = (key) => {
    setSizePreset(key);
    const preset = LABEL_SIZE_PRESETS.find((p) => p.key === key);
    if (preset && key !== 'CUSTOM') {
      setCanvasWidthMm(preset.widthMm);
      setCanvasHeightMm(preset.heightMm);
    }
    setIsDirty(true);
  };
  const onWidthChange = (v) => { setCanvasWidthMm(v || 1); setSizePreset('CUSTOM'); setIsDirty(true); };
  const onHeightChange = (v) => { setCanvasHeightMm(v || 1); setSizePreset('CUSTOM'); setIsDirty(true); };

  // ── New / Load / Save ─────────────────────────────────────────────────
  const newLabel = (presetKey = 'SMALL') => {
    const preset = LABEL_SIZE_PRESETS.find((p) => p.key === presetKey) || LABEL_SIZE_PRESETS[0];
    setSizePreset(preset.key);
    setCanvasWidthMm(preset.widthMm);
    setCanvasHeightMm(preset.heightMm);
    setBlocks(buildDefaultLabelBlocks(preset.widthMm, preset.heightMm));
    setTemplateName('New Label');
    setEditingId(null);
    setIsDefault(false);
    setSelectedId(null);
    setIsDirty(true);
  };

  const handleNewLabel = () => {
    if (isDirty) {
      Modal.confirm({ title: 'Discard unsaved changes?', content: 'Starting a new label will discard the current unsaved layout.', onOk: () => newLabel() });
    } else newLabel();
  };

  const handleTenantChange = (key) => {
    const doSwitch = () => { setTenantKey(key); newLabel(sizePreset); setIsDirty(false); };
    if (isDirty) {
      Modal.confirm({ title: 'Discard unsaved changes?', content: 'Switching tenants will discard the current unsaved layout.', onOk: doSwitch });
    } else doSwitch();
  };

  // ── Upload Tag Image: real position-aware layout extraction ────────────
  const analyzeTagImage = async (file) => {
    setAnalyzing(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('canvasWidthMm', canvasWidthMm);
      formData.append('canvasHeightMm', canvasHeightMm);
      const res = await invoiceStudioApi.aiAnalyzeLabel(formData, { headers: { 'Content-Type': undefined } });
      const result = res.data.data;
      if (!result.ai_used || !result.blocks) {
        message.warning(result.message || 'Tag image analysis is not available yet.');
        return;
      }
      const newBlocks = result.blocks.map((b) => ({
        id: b.id, type: b.type,
        x: mmToPx(b.xMm), y: mmToPx(b.yMm), w: mmToPx(b.wMm), h: mmToPx(b.hMm),
        // merge the classifier's styling hints (bold/align/badge/color) over
        // the field type's usual defaults, so purity/price etc. still look right
        content: { ...defaultLabelContent(b.type), ...(b.content || {}) },
      }));
      setBlocks(newBlocks);
      setSelectedId(null);
      setIsDirty(true);
      message.success(result.message || `Detected ${newBlocks.length} field(s) from the image.`);
    } catch (err) {
      message.error(err.response?.data?.message || 'Failed to analyze the tag image.');
    } finally {
      setAnalyzing(false);
    }
  };

  const handleUploadTagImage = (file) => {
    const doAnalyze = () => analyzeTagImage(file);
    if (isDirty) {
      Modal.confirm({ title: 'Discard unsaved changes?', content: 'Analyzing a tag image will replace the current unsaved layout.', onOk: doAnalyze });
    } else doAnalyze();
    return false; // prevent any native form submission from an <input type=file>
  };

  const loadTemplate = (tmplId) => {
    const tmpl = (templates || []).find((t) => t.Template_ID === tmplId);
    if (!tmpl) return;
    try {
      const parsed = typeof tmpl.Layout_JSON === 'string' ? JSON.parse(tmpl.Layout_JSON) : (tmpl.Layout_JSON || {});
      const w = parsed.canvasWidthMm || 30;
      const h = parsed.canvasHeightMm || 20;
      const matched = LABEL_SIZE_PRESETS.find((p) => p.key !== 'CUSTOM' && p.widthMm === w && p.heightMm === h);
      setBlocks(parsed.blocks || []);
      setCanvasWidthMm(w);
      setCanvasHeightMm(h);
      setSizePreset(matched ? matched.key : 'CUSTOM');
      setTemplateName(tmpl.Template_Name);
      setEditingId(tmpl.Template_ID);
      setIsDefault(!!tmpl.Is_Default);
      setSelectedId(null);
      setIsDirty(false);
      message.success(`Loaded "${tmpl.Template_Name}"`);
    } catch {
      message.error('Failed to load this label template.');
    }
  };

  const handleSave = () => {
    if (!templateName.trim()) { message.error('Please enter a label name.'); return; }
    saveMutation.mutate({
      Template_Name: templateName,
      Document_Type: DOC_TYPE,
      Paper_Size: sizePreset,
      Layout_JSON: JSON.stringify({ canvasWidthMm, canvasHeightMm, blocks }),
      Is_Default: isDefault,
    });
  };

  const handlePrintSample = () => {
    printLabel(blocks, canvasWidthMm, canvasHeightMm, previewData);
  };

  const handleShopLogoUpload = (file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      if (selectedBlock) updateBlockContent(selectedBlock.id, { url: e.target.result });
      message.success('Logo attached.');
    };
    reader.readAsDataURL(file);
    return false;
  };

  // ══════════════════════════════════════════════════════════════════════
  return (
    <div className="page-wrapper">
      <div className="page-header">
        <div>
          <Title level={4} style={{ margin: 0 }}>🏷️ Label Designer</Title>
          <Text type="secondary" style={{ fontSize: 12 }}>
            Design barcode/RFID price tags for jewellery stock — drag components, preview with real sample data, save for reuse.
          </Text>
        </div>
        <Space wrap>
          <Select
            style={{ width: 220 }}
            placeholder="Load existing label…"
            loading={tmplLoading}
            value={editingId || undefined}
            onChange={loadTemplate}
            allowClear
            onClear={() => {}}
          >
            {(templates || []).map((t) => (
              <Option key={t.Template_ID} value={t.Template_ID}>
                {t.Is_Default ? '⭐ ' : ''}{t.Template_Name}
              </Option>
            ))}
          </Select>
          <Button icon={<PlusOutlined />} onClick={handleNewLabel}>New Label</Button>
          <Tooltip title="Upload a photo of an existing tag design — fields are placed automatically based on where they appear in the photo.">
            <Button
              icon={<UploadOutlined />}
              loading={analyzing}
              onClick={() => document.getElementById('label-tag-image-input')?.click()}
            >
              Upload Tag Image
            </Button>
          </Tooltip>
          <input
            id="label-tag-image-input" type="file" accept="image/*" style={{ display: 'none' }}
            onChange={(e) => {
              if (e.target.files?.[0]) handleUploadTagImage(e.target.files[0]);
              e.target.value = '';
            }}
          />
        </Space>
      </div>

      <div ref={tenantPickRef} style={{ background: '#fff', borderRadius: 8, padding: '10px 12px', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 10 }}>
        <Text strong style={{ fontSize: 12 }}>Designing for:</Text>
        {isSuperAdmin ? (
          <>
            <Select
              showSearch
              style={{ width: 320 }}
              loading={tenantsLoading}
              value={tenantKey}
              onChange={handleTenantChange}
              optionFilterProp="label"
              filterOption={(input, option) => (option?.label ?? '').toLowerCase().includes(input.toLowerCase())}
              options={[
                { value: GLOBAL_KEY, label: '🌐 Global Default (used until a tenant has their own)' },
                ...(tenants || [])
                  .filter((t) => t.Tenant_ID !== 'SA_MASTER')
                  .map((t) => ({ value: t.Tenant_ID, label: `${t.Company_Name} (${t.Tenant_ID})` })),
              ]}
            />
            <Text type="secondary" style={{ fontSize: 11 }}>
              Pick a tenant client to design or edit their own tag, or leave it on the global default.
            </Text>
          </>
        ) : (
          <>
            <Tag color="gold" style={{ fontSize: 12 }}>{user?.companyName || 'Your Shop'}</Tag>
            <Text type="secondary" style={{ fontSize: 11 }}>
              Your own tag design — isolated from every other tenant. No one else can see or edit this, and you can't see theirs.
            </Text>
          </>
        )}
      </div>

      {/* ── Toolbar: name, size presets, actions ─────────────────────── */}
      <div style={{ background: '#1a1a1a', borderRadius: 8, padding: '8px 12px', marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <Space size={8} wrap>
          <Input
            value={templateName}
            onChange={(e) => { setTemplateName(e.target.value); setIsDirty(true); }}
            style={{ width: 200, background: '#333', border: 'none', color: '#fff', fontWeight: 600 }}
            size="small"
          />
          {isDefault && <Tag color="gold" style={{ fontSize: 10 }}>Default</Tag>}
          {isDirty && <Tag color="orange" style={{ fontSize: 10 }}>● Unsaved</Tag>}
          <Divider type="vertical" style={{ borderColor: '#444' }} />
          <Radio.Group size="small" value={sizePreset} onChange={(e) => applyPreset(e.target.value)}>
            {LABEL_SIZE_PRESETS.map((p) => (
              <Radio.Button key={p.key} value={p.key} style={{ fontSize: 11 }}>{p.label}</Radio.Button>
            ))}
          </Radio.Group>
          <InputNumber size="small" min={5} max={300} step={0.5} addonBefore="W" addonAfter="mm" style={{ width: 110 }}
            value={canvasWidthMm} onChange={onWidthChange} />
          <InputNumber size="small" min={5} max={300} step={0.5} addonBefore="H" addonAfter="mm" style={{ width: 110 }}
            value={canvasHeightMm} onChange={onHeightChange} />
        </Space>
        <Space size={6}>
          <Button size="small" icon={<PrinterOutlined />} style={{ borderColor: '#52c41a', color: '#52c41a' }} onClick={handlePrintSample}>
            Print Sample
          </Button>
          <Tooltip title={editingId ? 'Make this the default label for new tags' : 'Save the label first'}>
            <Button size="small" icon={isDefault ? <StarFilled /> : <StarOutlined />}
              disabled={!editingId || isDefault}
              style={{ borderColor: '#FFD700', color: '#FFD700' }}
              onClick={() => setDefaultMutation.mutate(editingId)}>
              Set as Default
            </Button>
          </Tooltip>
          {editingId && (
            <Popconfirm title="Delete this label template?" onConfirm={() => deleteMutation.mutate(editingId)} okText="Delete" okButtonProps={{ danger: true }}>
              <Button size="small" danger icon={<DeleteOutlined />} />
            </Popconfirm>
          )}
          <Button ref={saveRef} type="primary" size="small" icon={<SaveOutlined />} loading={saveMutation.isPending}
            style={{ background: '#B8860B', borderColor: '#B8860B', fontWeight: 700 }}
            onClick={handleSave}>
            Save
          </Button>
        </Space>
      </div>

      {/* ── Main workspace ────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 8, minHeight: 480 }}>

        {/* LEFT: palette */}
        <div ref={paletteRef} style={{ width: 170, background: '#fff', borderRadius: 8, padding: 8, flexShrink: 0 }}>
          <Text strong style={{ fontSize: 11, color: '#888', display: 'block', marginBottom: 6 }}>COMPONENTS</Text>
          {LABEL_COMPONENTS.map((comp) => (
            <div key={comp.type} onClick={() => addBlock(comp.type)}
              style={{ padding: '5px 7px', marginBottom: 3, background: '#f8f8f8', borderRadius: 4, cursor: 'pointer', fontSize: 11, border: '1px solid #f0f0f0', userSelect: 'none' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = '#FFF8E1'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = '#f8f8f8'; }}>
              {comp.label}
            </div>
          ))}
          <Divider style={{ margin: '8px 0' }} />
          <Text style={{ fontSize: 10, color: '#aaa' }}>Click a component to add it to the canvas, then drag to position.</Text>
        </div>

        {/* CENTER: editable canvas */}
        <div ref={canvasRef} style={{ flex: 1, background: '#e0e0e0', borderRadius: 8, padding: 16, overflow: 'auto', display: 'flex', alignItems: 'flex-start', justifyContent: 'center' }}>
          <div style={{ width: canvasWidthPx * scale, height: canvasHeightPx * scale, position: 'relative' }}>
            <div
              style={{
                width: canvasWidthPx, height: canvasHeightPx, background: '#fff', position: 'relative',
                boxShadow: '0 4px 20px rgba(0,0,0,0.25)', borderRadius: 2,
                transform: `scale(${scale})`, transformOrigin: 'top left',
              }}
              onClick={() => setSelectedId(null)}
            >
              {blocks.map((b) => (
                <LabelCanvasBlock key={b.id} block={b} selected={selectedId === b.id} onSelect={setSelectedId} onMove={moveBlock} scale={scale} />
              ))}
              {blocks.length === 0 && (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ccc', fontSize: 12 / scale, pointerEvents: 'none' }}>
                  Click a component on the left
                </div>
              )}
            </div>
          </div>
        </div>

        {/* RIGHT: properties + live preview */}
        <div style={{ width: 260, display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0 }}>

          {/* Properties panel */}
          <div style={{ background: '#fff', borderRadius: 8, padding: 10, flex: '0 0 auto' }}>
            <Text strong style={{ fontSize: 11, color: '#888', display: 'block', marginBottom: 6 }}>PROPERTIES</Text>
            {selectedBlock ? (
              <div>
                <div style={{ background: '#FFF8E1', borderRadius: 6, padding: '4px 8px', marginBottom: 8 }}>
                  <Text strong style={{ fontSize: 11, color: '#B8860B' }}>{LABEL_TYPE_LABEL[selectedBlock.type]}</Text>
                </div>

                <Text style={{ fontSize: 9, color: '#aaa', fontWeight: 700 }}>POSITION &amp; SIZE (mm)</Text>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, marginTop: 4, marginBottom: 8 }}>
                  {[['x', 'X'], ['y', 'Y'], ['w', 'W'], ['h', 'H']].map(([f, l]) => (
                    <div key={f}>
                      <div style={{ fontSize: 9, color: '#888', marginBottom: 1 }}>{l}</div>
                      <InputNumber size="small" style={{ width: '100%' }} step={0.5} min={0}
                        value={Math.round(pxToMm(selectedBlock[f]) * 10) / 10}
                        onChange={(v) => updateBlockRectMm(selectedBlock.id, f, v)} />
                    </div>
                  ))}
                </div>

                {(selectedBlock.type === 'qr_code' || selectedBlock.type === 'barcode_128') && (
                  <Alert type="info" showIcon
                    message={selectedBlock.type === 'barcode_128'
                      ? "Encodes the ornament's Article Number as a Code128 barcode — the type most POS scanners and label printers read."
                      : "Encodes the ornament's Article Number as a QR code."}
                    style={{ fontSize: 10, marginBottom: 8 }} />
                )}

                {selectedBlock.type === 'shop_name' && (
                  <>
                    <Text style={{ fontSize: 9, color: '#aaa', fontWeight: 700 }}>SHOP NAME</Text>
                    <Input size="small" style={{ marginTop: 4 }} value={selectedBlock.content?.text}
                      placeholder="{{shop_name}}"
                      onChange={(e) => updateBlockContent(selectedBlock.id, { text: e.target.value })} />
                    <Text type="secondary" style={{ fontSize: 9, display: 'block', marginTop: 4 }}>
                      Always a single line — long names are truncated rather than wrapping.
                    </Text>
                  </>
                )}

                {selectedBlock.type === 'logo' && (
                  <>
                    <Text style={{ fontSize: 9, color: '#aaa', fontWeight: 700 }}>LOGO IMAGE</Text>
                    <Button size="small" block icon={<UploadOutlined />} style={{ marginTop: 4 }} onClick={() => document.getElementById('label-logo-input')?.click()}>
                      {selectedBlock.content?.url ? 'Change Logo' : 'Upload Logo'}
                    </Button>
                    <input id="label-logo-input" type="file" accept=".png,.jpg,.jpeg,.svg" style={{ display: 'none' }}
                      onChange={(e) => { if (e.target.files?.[0]) handleShopLogoUpload(e.target.files[0]); e.target.value = ''; }} />
                    {selectedBlock.content?.url && (
                      <img src={selectedBlock.content.url} alt="logo" style={{ width: '100%', maxHeight: 40, objectFit: 'contain', marginTop: 4, border: '1px solid #f0f0f0' }} />
                    )}
                  </>
                )}

                {selectedBlock.type === 'text' && (
                  <>
                    <Text style={{ fontSize: 9, color: '#aaa', fontWeight: 700 }}>TEXT</Text>
                    <Input.TextArea rows={2} style={{ marginTop: 4, fontSize: 11 }} value={selectedBlock.content?.text}
                      onChange={(e) => updateBlockContent(selectedBlock.id, { text: e.target.value })} />
                  </>
                )}

                {[
                  'item_type', 'article_no', 'tag_no', 'design_code', 'gross_wt', 'net_wt',
                  'wastage', 'making_charge', 'quantity', 'stone_count', 'stone_value',
                  'floor_location', 'supplier_code', 'huid', 'price',
                ].includes(selectedBlock.type) && (
                  <>
                    <Text style={{ fontSize: 9, color: '#aaa', fontWeight: 700 }}>PREFIX / SUFFIX</Text>
                    <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                      <Input size="small" placeholder="Prefix" value={selectedBlock.content?.prefix}
                        onChange={(e) => updateBlockContent(selectedBlock.id, { prefix: e.target.value })} />
                      {'suffix' in (selectedBlock.content || {}) && (
                        <Input size="small" placeholder="Suffix" value={selectedBlock.content?.suffix}
                          onChange={(e) => updateBlockContent(selectedBlock.id, { suffix: e.target.value })} />
                      )}
                    </div>
                  </>
                )}

                {selectedBlock.type === 'purity' && (
                  <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Switch size="small" checked={!!selectedBlock.content?.badge} onChange={(v) => updateBlockContent(selectedBlock.id, { badge: v })} />
                    <Text style={{ fontSize: 11 }}>Gold badge style</Text>
                  </div>
                )}

                {!['qr_code', 'barcode_128', 'logo'].includes(selectedBlock.type) && (
                  <>
                    <Divider style={{ margin: '8px 0' }} />
                    <Text style={{ fontSize: 9, color: '#aaa', fontWeight: 700 }}>FONT</Text>
                    <div style={{ display: 'flex', gap: 4, marginTop: 4, alignItems: 'center' }}>
                      <InputNumber size="small" min={4} max={24} style={{ width: 70 }}
                        value={selectedBlock.content?.fontSize || 7}
                        onChange={(v) => updateBlockContent(selectedBlock.id, { fontSize: v })} />
                      <Select size="small" style={{ width: 90 }} value={selectedBlock.content?.align || 'left'}
                        onChange={(v) => updateBlockContent(selectedBlock.id, { align: v })}>
                        <Option value="left">Left</Option>
                        <Option value="center">Center</Option>
                        <Option value="right">Right</Option>
                      </Select>
                    </div>
                    <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Switch size="small" checked={!!selectedBlock.content?.bold} onChange={(v) => updateBlockContent(selectedBlock.id, { bold: v })} />
                      <Text style={{ fontSize: 11 }}>Bold</Text>
                      <input type="color" style={{ width: 22, height: 22, border: 'none', cursor: 'pointer', marginLeft: 4 }}
                        value={selectedBlock.content?.color || '#000000'}
                        onChange={(e) => updateBlockContent(selectedBlock.id, { color: e.target.value })} />
                    </div>
                  </>
                )}

                <Divider style={{ margin: '8px 0' }} />
                <Button danger size="small" block icon={<DeleteOutlined />} onClick={() => deleteBlock(selectedBlock.id)}>Remove</Button>
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '14px 0', color: '#ccc' }}>
                <InfoCircleOutlined style={{ fontSize: 22 }} />
                <div style={{ marginTop: 4, fontSize: 11 }}>Click a block to edit</div>
              </div>
            )}
          </div>

          {/* Live preview — same renderLabelHTML() used for print */}
          <div ref={previewRef} style={{ background: '#fff', borderRadius: 8, padding: 10, flex: '1 1 auto', overflow: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <Text strong style={{ fontSize: 11, color: '#52c41a' }}>🟢 LIVE PREVIEW</Text>
              <Tag color="green" style={{ fontSize: 9 }}>Real renderer</Tag>
            </div>
            <div
              onClick={() => setFullPreviewOpen(true)}
              style={{ background: '#f5f5f5', borderRadius: 6, padding: 10, display: 'flex', justifyContent: 'center', cursor: 'zoom-in' }}
              title="Click to view the full label design"
            >
              <div style={{ width: previewNativePx * previewScale, height: previewNativeHeightPx * previewScale, position: 'relative' }}>
                <div
                  style={{ transform: `scale(${previewScale})`, transformOrigin: 'top left', boxShadow: '0 2px 10px rgba(0,0,0,0.15)' }}
                  dangerouslySetInnerHTML={{ __html: previewHtml }}
                />
              </div>
            </div>
            <Text type="secondary" style={{ fontSize: 9, display: 'block', textAlign: 'center', marginTop: 4 }}>
              Click the preview to view the full label design
            </Text>
            <Alert message="Preview uses sample ornament data. Same renderer produces the real print output." type="info" showIcon style={{ marginTop: 8, fontSize: 10 }} />
          </div>
        </div>
      </div>

      {/* Full-size preview — same previewHtml, just scaled up much larger */}
      <Modal
        title={`Full Label Preview — ${templateName} (${canvasWidthMm}mm × ${canvasHeightMm}mm)`}
        open={fullPreviewOpen}
        onCancel={() => setFullPreviewOpen(false)}
        footer={[<Button key="close" onClick={() => setFullPreviewOpen(false)}>Close</Button>]}
        width={Math.min(900, previewNativePx * fullPreviewScale + 80)}
      >
        <div style={{ background: '#f5f5f5', borderRadius: 6, padding: 20, display: 'flex', justifyContent: 'center' }}>
          <div style={{ width: previewNativePx * fullPreviewScale, height: previewNativeHeightPx * fullPreviewScale, position: 'relative' }}>
            <div
              style={{ transform: `scale(${fullPreviewScale})`, transformOrigin: 'top left', boxShadow: '0 4px 20px rgba(0,0,0,0.2)' }}
              dangerouslySetInnerHTML={{ __html: previewHtml }}
            />
          </div>
        </div>
      </Modal>

      <PageTour steps={tourSteps} />
    </div>
  );
}
