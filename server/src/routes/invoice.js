const router = require('express').Router();
const db = require('../db/tenantDb').tenantDb;
const { sendSuccess, sendError } = require('../utils/response');
const { authenticate } = require('../middleware/auth');
const { generateInvoicePDF } = require('../services/pdfService');

// ─── GET /api/invoice/templates ───────────────────────────────────────────────
router.get('/templates', authenticate, async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    // Get tenant-specific + global templates
    const templates = await db('tbl_invoice_template_master')
      .where(function () {
        this.where('Tenant_ID', tenantId).orWhereNull('Tenant_ID');
      })
      .where({ Is_Active: true })
      .orderBy('Tenant_ID', 'desc') // tenant-specific first
      .orderBy('Document_Type');

    return sendSuccess(res, templates);
  } catch (err) {
    return sendError(res, 500, 'Failed to fetch templates.');
  }
});

// ─── GET /api/invoice/template/:type ─────────────────────────────────────────
router.get('/template/:type', authenticate, async (req, res) => {
  const { type } = req.params;
  const tenantId = req.user.tenantId;

  try {
    // Resolution: tenant-specific > global
    let template = await db('tbl_invoice_template_master')
      .where({ Tenant_ID: tenantId, Document_Type: type, Is_Active: true })
      .orderBy('Is_Default', 'desc')
      .first();

    if (!template) {
      template = await db('tbl_invoice_template_master')
        .whereNull('Tenant_ID')
        .where({ Document_Type: type, Is_Active: true })
        .first();
    }

    if (!template) return sendError(res, 404, `No template found for type: ${type}`);

    return sendSuccess(res, template);
  } catch (err) {
    return sendError(res, 500, 'Failed to fetch template.');
  }
});

// ─── POST /api/invoice/template ───────────────────────────────────────────────
router.post('/template', authenticate, async (req, res) => {
  const tenantId = req.user.tenantId;
  try {
    // Check if template exists for this tenant + document type
    const existing = await db('tbl_invoice_template_master')
      .where({ Tenant_ID: tenantId, Document_Type: req.body.Document_Type })
      .first();

    let template;
    if (existing) {
      [template] = await db('tbl_invoice_template_master')
        .where({ Template_ID: existing.Template_ID })
        .update({ ...req.body, Tenant_ID: tenantId, Last_Updated_By: req.user.username, Last_Updated_Date: new Date(), Cache_PDF_HTML: null })
        .returning('*');
    } else {
      [template] = await db('tbl_invoice_template_master')
        .insert({ ...req.body, Tenant_ID: tenantId, Created_By: req.user.username })
        .returning('*');
    }

    return sendSuccess(res, template, 'Template saved successfully.');
  } catch (err) {
    console.error('Template save error:', err);
    return sendError(res, 500, 'Failed to save template.');
  }
});

// ─── POST /api/invoice/generate ───────────────────────────────────────────────
router.post('/generate', authenticate, async (req, res) => {
  const { saleId, documentType = 'SALES' } = req.body;
  if (!saleId) return sendError(res, 400, 'Sale ID required.');

  try {
    const tenantId = req.user.tenantId;
    const pdfBuffer = await generateInvoicePDF(tenantId, documentType, saleId);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="invoice-${saleId}.pdf"`);
    return res.send(pdfBuffer);
  } catch (err) {
    console.error('PDF generation error:', err);
    return sendError(res, 500, 'Failed to generate PDF.');
  }
});

// ─── POST /api/invoice/template/preview ──────────────────────────────────────
router.post('/template/preview', authenticate, async (req, res) => {
  try {
    const sampleData = {
      invoiceNumber: 'INV-SAMPLE-001',
      date: new Date().toLocaleDateString('en-IN'),
      customerName: 'Sample Customer',
      items: [
        { name: 'Gold Ring 22K', purity: '22K', weight: '5.000g', rate: '₹6,200/g', making: '₹1,000', total: '₹32,000' },
      ],
      subtotal: 32000, discount: 500, gst: 945, total: 32445,
      template: req.body,
    };
    return sendSuccess(res, sampleData, 'Preview data generated.');
  } catch (err) {
    return sendError(res, 500, 'Preview failed.');
  }
});

module.exports = router;
