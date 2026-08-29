/**
 * Shows the ACTUAL designed invoice — the tenant's saved Invoice Studio
 * template, rendered with real data through the exact same
 * buildInvoicePrintDocument() pipeline utils/thermalReceipt.js uses to
 * print — before anything is sent to a printer. What's shown here is
 * pixel-for-pixel what will print (real colors, layout, logo, everything),
 * not a simplified stand-in.
 *
 * If the tenant hasn't designed/defaulted a template for this doc type yet
 * (GET /invoice-studio/resolve/:docType 404s — normal, not an error), this
 * shows a plain note instead of a blank preview; Print still works, using
 * the same hardcoded fallback layout the print pipeline always had.
 */
import React, { useEffect, useState } from 'react';
import { Modal, Button, Spin, Alert } from 'antd';
import { PrinterOutlined } from '@ant-design/icons';
import { invoiceStudioApi } from '../api/modules';
import { PAPER_SIZES, buildInvoicePrintDocument, resolveInvoiceQrDataUrls } from '../utils/invoiceRenderer';

export default function InvoicePreviewModal({ open, onClose, docType, data, docNumber, onConfirmPrint, printing }) {
  const [html, setHtml] = useState(null);
  const [loading, setLoading] = useState(false);
  const [hasCustomTemplate, setHasCustomTemplate] = useState(true);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setHtml(null);

    (async () => {
      let blocks = null;
      let paperKey = 'A4';
      try {
        const res = await invoiceStudioApi.resolve(docType);
        const row = res.data?.data;
        const parsed = typeof row?.Components === 'string' ? JSON.parse(row.Components) : row?.Components;
        if (parsed?.length) {
          blocks = parsed;
          paperKey = row.Paper_Size || 'A4';
        }
      } catch {
        // No active/default template for this tenant+docType yet — normal,
        // not an error. Falls through to the "no custom design" note below.
      }

      if (cancelled) return;
      if (!blocks) {
        setHasCustomTemplate(false);
        setLoading(false);
        return;
      }
      setHasCustomTemplate(true);
      const paper = PAPER_SIZES[paperKey] || PAPER_SIZES.A4;
      const qrDataUrls = await resolveInvoiceQrDataUrls(blocks, data);
      if (cancelled) return;
      setHtml(buildInvoicePrintDocument(blocks, paper.w, paper.h, data, qrDataUrls));
      setLoading(false);
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, docType]);

  return (
    <Modal
      title={`Preview${docNumber ? ` — ${docNumber}` : ''}`}
      open={open}
      onCancel={onClose}
      width={760}
      destroyOnClose
      footer={[
        <Button key="cancel" onClick={onClose} disabled={printing}>Cancel</Button>,
        <Button key="print" type="primary" icon={<PrinterOutlined />} loading={printing} onClick={onConfirmPrint}
          style={{ background: '#B8860B', borderColor: '#B8860B' }}>
          Print
        </Button>,
      ]}
    >
      {loading && (
        <div style={{ textAlign: 'center', padding: 48 }}><Spin size="large" /></div>
      )}
      {!loading && !hasCustomTemplate && (
        <Alert
          type="info" showIcon
          message="No custom design saved for this document yet"
          description="This will print using the default layout. Design one in Invoice Studio (Master Management) to see a real preview here."
          style={{ marginBottom: 0, borderRadius: 6 }}
        />
      )}
      {!loading && html && (
        <iframe
          title="invoice-preview"
          srcDoc={html}
          style={{ width: '100%', height: 520, border: '1px solid #eee', borderRadius: 6, background: '#fff' }}
        />
      )}
    </Modal>
  );
}
