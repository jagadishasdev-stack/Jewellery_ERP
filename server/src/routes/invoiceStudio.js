/**
 * Invoice Studio API
 * Full template CRUD, versioning, preview data, PDF generation
 */
const router = require('express').Router();
const db = require('../db/tenantDb').tenantDb;
const { sendSuccess, sendError } = require('../utils/response');
const { authenticate } = require('../middleware/auth');

const isSuperAdmin = (req) => req.user?.roleName === 'Super Admin';

// Regular tenant admins are always scoped to their own tenant, exactly as
// before. Only a genuine Super Admin can override with ?tenantId= (a real
// tenant, or 'null' for the shared global-default row) — used by the Label
// Designer, which is Super-Admin-only and lets them manage any tenant's
// label template from one screen.
const resolveTenantId = (req) => {
  const q = req.query.tenantId;
  if (isSuperAdmin(req) && q !== undefined) return (q === 'null' || q === '') ? null : q;
  return req.user.tenantId;
};

// Barcode/RFID tag design: a Super Admin can manage the shared global
// default (Tenant_ID = null) and, via ?tenantId=, any single tenant's own
// template for support purposes. A regular tenant admin can design their
// OWN tag too now — self-service, same as every other Document_Type —
// but resolveTenantId() above already hard-scopes non-super-admins to
// req.user.tenantId regardless of any query param, so "their own" is the
// only tenant they can ever reach through this check; they can never see
// or edit another tenant's label or the global default. Requires
// tenant_management (the same permission that already gates Users, Roles,
// Printer Settings, etc.) — a lower-privilege role like Billing Operator
// still can't touch it.
const canManageLabel = (req) => isSuperAdmin(req) || req.user?.permissions?.tenant_management === true;
const requireSuperAdminForLabel = (documentType, req, res) => {
  if (documentType === 'BARCODE_LABEL' && !canManageLabel(req)) {
    sendError(res, 403, 'You need Tenant Management permission to edit label templates.');
    return true;
  }
  return false;
};

const PAPER_SIZES = {
  A4:          { width: 210, height: 297 },
  A5:          { width: 148, height: 210 },
  Legal:       { width: 216, height: 356 },
  Thermal_80mm:{ width: 80,  height: 297 },
  Thermal_58mm:{ width: 58,  height: 297 },
};

const ALL_DOC_TYPES = [
  'SALES','PURCHASE','PURCHASE_RETURN','SALES_RETURN','QUOTATION','ESTIMATE',
  'ORDER_BOOKING','REPAIR_RECEIPT','REPAIR_DELIVERY',
  'KARIGAR_ISSUE','KARIGAR_RECEIVE','KARIGAR_SETTLEMENT',
  'SUPPLIER_PAYMENT','CUSTOMER_RECEIPT','CUSTOMER_PAYMENT',
  'SCHEME_RECEIPT','SCHEME_LEDGER','SCHEME_MATURITY',
  'OLD_GOLD_PURCHASE','STOCK_TRANSFER','STOCK_ADJUSTMENT',
  'GST_INVOICE','MANUFACTURING_JOB','MANUFACTURING_COMPLETE',
];

// ── GET /api/invoice-studio/templates ─────────────────────────────────────────
router.get('/templates', authenticate, async (req, res) => {
  const { docType } = req.query;
  const tenantId = resolveTenantId(req);
  try {
    let qb = db('tbl_invoice_studio_templates')
      .where({ Is_Active: true })
      .modify((q) => (tenantId === null ? q.whereNull('Tenant_ID') : q.where('Tenant_ID', tenantId)))
      .orderBy('Last_Updated_Date', 'desc');
    if (docType) qb = qb.where('Document_Type', docType);
    const rows = await qb.select(
      'Template_ID', 'Template_Name', 'Document_Type', 'Paper_Size',
      'Is_Default', 'Is_Active',
      db.raw('"Version" as "Template_Version"'),
      'Created_Date', 'Last_Updated_Date',
      db.raw('"Components" as "Layout_JSON"')
    );
    return sendSuccess(res, rows);
  } catch (err) {
    console.error('Template list error:', err.message);
    return sendError(res, 500, 'Failed to fetch templates.');
  }
});

// ── GET /api/invoice-studio/template/:id ──────────────────────────────────────
router.get('/template/:id', authenticate, async (req, res) => {
  try {
    const template = await db('tbl_invoice_studio_templates')
      .where('Template_ID', req.params.id)
      .first();
    if (!template) return sendError(res, 404, 'Template not found.');
    return sendSuccess(res, template);
  } catch (err) {
    return sendError(res, 500, 'Failed to fetch template.');
  }
});

// ── GET /api/invoice-studio/resolve/:docType ──────────────────────────────────
// Returns the active template for a doc type (tenant > global)
router.get('/resolve/:docType', authenticate, async (req, res) => {
  const { docType } = req.params;
  const tenantId = resolveTenantId(req);
  try {
    let template = await db('tbl_invoice_studio_templates')
      .where({ Tenant_ID: tenantId, Document_Type: docType, Is_Default: true, Is_Active: true })
      .first();
    if (!template) {
      template = await db('tbl_invoice_studio_templates')
        .whereNull('Tenant_ID')
        .where({ Document_Type: docType, Is_Default: true, Is_Active: true })
        .first();
    }
    if (!template) return sendError(res, 404, `No template for ${docType}`);
    return sendSuccess(res, template);
  } catch (err) {
    return sendError(res, 500, 'Failed to resolve template.');
  }
});

// ── POST /api/invoice-studio/template ─────────────────────────────────────────
router.post('/template', authenticate, async (req, res) => {
  const tenantId = req.user.tenantId;
  const {
    Document_Type, Template_Name, Template_Code, Paper_Size = 'A4',
    Components = [], GST_Config = {}, Variables = {},
    Primary_Color = '#B8860B', Secondary_Color = '#1A1A1A',
    Font_Family = 'Arial', Base_Font_Size = 10,
    Custom_CSS, Custom_JS, Logo_URL, Stamp_URL, Signature_URL,
    Is_Default = false, Canvas_Width_MM, Canvas_Height_MM,
    Margin_Top = 10, Margin_Bottom = 10, Margin_Left = 10, Margin_Right = 10,
    Orientation = 'Portrait',
  } = req.body;

  if (!Document_Type || !Template_Name) return sendError(res, 400, 'Document_Type and Template_Name required.');

  const paperDims = PAPER_SIZES[Paper_Size] || PAPER_SIZES.A4;
  const width  = Canvas_Width_MM  || paperDims.width;
  const height = Canvas_Height_MM || paperDims.height;

  try {
    // If setting as default, unset others for this tenant+doctype
    if (Is_Default) {
      await db('tbl_invoice_studio_templates')
        .where({ Tenant_ID: tenantId, Document_Type })
        .update({ Is_Default: false });
    }

    const [template] = await db('tbl_invoice_studio_templates').insert({
      Tenant_ID: tenantId,
      Document_Type, Template_Name,
      Template_Code: Template_Code || `${Document_Type}_${Date.now()}`,
      Is_Default,
      Paper_Size, Canvas_Width_MM: width, Canvas_Height_MM: height,
      Margin_Top, Margin_Bottom, Margin_Left, Margin_Right, Orientation,
      Primary_Color, Secondary_Color, Font_Family, Base_Font_Size,
      Components: JSON.stringify(Components),
      GST_Config: JSON.stringify(GST_Config),
      Variables: JSON.stringify(Variables),
      Custom_CSS, Custom_JS, Logo_URL, Stamp_URL, Signature_URL,
      Version: 1,
      Version_History: JSON.stringify([]),
      Created_By: req.user.username,
    }).returning('*');

    return sendSuccess(res, template, 'Template created.', 201);
  } catch (err) {
    console.error('Create template error:', err);
    return sendError(res, 500, 'Failed to create template.');
  }
});

// ── PUT /api/invoice-studio/template/:id ──────────────────────────────────────
router.put('/template/:id', authenticate, async (req, res) => {
  try {
    const existing = await db('tbl_invoice_studio_templates')
      .where({ Template_ID: req.params.id, Tenant_ID: req.user.tenantId })
      .first();
    if (!existing) return sendError(res, 404, 'Template not found.');

    // Save current version to history before updating
    const history = (typeof existing.Version_History === 'string'
      ? JSON.parse(existing.Version_History)
      : existing.Version_History) || [];

    history.push({
      version: existing.Version,
      saved_at: new Date().toISOString(),
      saved_by: req.user.username,
      components_snapshot: existing.Components,
    });
    // Keep last 10 versions
    if (history.length > 10) history.shift();

    const { Components, GST_Config, Variables, Is_Default, Document_Type } = req.body;

    if (Is_Default && Document_Type) {
      await db('tbl_invoice_studio_templates')
        .where({ Tenant_ID: req.user.tenantId, Document_Type })
        .whereNot('Template_ID', req.params.id)
        .update({ Is_Default: false });
    }

    const updateData = {
      ...req.body,
      Components: Components ? JSON.stringify(Components) : existing.Components,
      GST_Config: GST_Config ? JSON.stringify(GST_Config) : existing.GST_Config,
      Variables: Variables ? JSON.stringify(Variables) : existing.Variables,
      Version: (existing.Version || 1) + 1,
      Version_History: JSON.stringify(history),
      Last_Updated_By: req.user.username,
      Last_Updated_Date: new Date(),
    };
    delete updateData.Template_ID;
    delete updateData.Tenant_ID;

    const [updated] = await db('tbl_invoice_studio_templates')
      .where({ Template_ID: req.params.id })
      .update(updateData)
      .returning('*');

    return sendSuccess(res, updated, 'Template saved.');
  } catch (err) {
    console.error('Update template error:', err);
    return sendError(res, 500, 'Failed to update template.');
  }
});

// ── POST /api/invoice-studio/template/:id/restore/:version ────────────────────
router.post('/template/:id/restore/:version', authenticate, async (req, res) => {
  try {
    const template = await db('tbl_invoice_studio_templates')
      .where({ Template_ID: req.params.id, Tenant_ID: req.user.tenantId })
      .first();
    if (!template) return sendError(res, 404, 'Template not found.');

    const history = typeof template.Version_History === 'string'
      ? JSON.parse(template.Version_History) : template.Version_History;

    const versionRecord = history.find(h => h.version === parseInt(req.params.version));
    if (!versionRecord) return sendError(res, 404, 'Version not found.');

    const [restored] = await db('tbl_invoice_studio_templates')
      .where({ Template_ID: req.params.id })
      .update({
        Components: versionRecord.components_snapshot,
        Version: (template.Version || 1) + 1,
        Last_Updated_By: req.user.username,
        Last_Updated_Date: new Date(),
      })
      .returning('*');

    return sendSuccess(res, restored, `Restored to version ${req.params.version}.`);
  } catch (err) {
    return sendError(res, 500, 'Restore failed.');
  }
});

// ── GET /api/invoice-studio/doc-types ─────────────────────────────────────────
router.get('/doc-types', authenticate, async (req, res) => {
  const DOC_TYPE_LABELS = {
    SALES: 'Sales Invoice', PURCHASE: 'Purchase Invoice',
    PURCHASE_RETURN: 'Purchase Return', SALES_RETURN: 'Sales Return',
    QUOTATION: 'Quotation', ESTIMATE: 'Estimate',
    ORDER_BOOKING: 'Order Booking', REPAIR_RECEIPT: 'Repair Receipt',
    REPAIR_DELIVERY: 'Repair Delivery', KARIGAR_ISSUE: 'Karigar Issue Receipt',
    KARIGAR_RECEIVE: 'Karigar Return Receipt', KARIGAR_SETTLEMENT: 'Karigar Settlement',
    SUPPLIER_PAYMENT: 'Supplier Payment Voucher', CUSTOMER_RECEIPT: 'Customer Receipt',
    CUSTOMER_PAYMENT: 'Customer Payment Voucher', SCHEME_RECEIPT: 'Scheme Receipt',
    SCHEME_LEDGER: 'Scheme Ledger', SCHEME_MATURITY: 'Scheme Maturity Letter',
    OLD_GOLD_PURCHASE: 'Old Gold Purchase', STOCK_TRANSFER: 'Stock Transfer',
    STOCK_ADJUSTMENT: 'Stock Adjustment', GST_INVOICE: 'GST Tax Invoice',
    MANUFACTURING_JOB: 'Manufacturing Job Card', MANUFACTURING_COMPLETE: 'Manufacturing Completion',
  };
  return sendSuccess(res, ALL_DOC_TYPES.map(t => ({ value: t, label: DOC_TYPE_LABELS[t] || t })));
});

// ── GET /api/invoice-studio/preview-data/:docType ─────────────────────────────
router.get('/preview-data/:docType', authenticate, async (req, res) => {
  // Returns realistic sample data for live preview
  const sampleData = getSampleData(req.params.docType, req.user);
  return sendSuccess(res, sampleData);
});

// ── DELETE /api/invoice-studio/template/:id ───────────────────────────────────
router.delete('/template/:id', authenticate, async (req, res) => {
  try {
    await db('tbl_invoice_studio_templates')
      .where({ Template_ID: req.params.id, Tenant_ID: req.user.tenantId })
      .update({ Is_Active: false });
    return sendSuccess(res, null, 'Template deleted.');
  } catch (err) {
    return sendError(res, 500, 'Failed to delete template.');
  }
});

// ── Sample data generator ─────────────────────────────────────────────────────
function getSampleData(docType, user) {
  const shopName = user?.companyName || 'Sample Jewellery';
  const today = new Date().toLocaleDateString('en-IN');
  const base = {
    shop_name: shopName, shop_gst: '29AABCX1234D1Z1',
    shop_address: '45 Commercial Street, Bangalore — 560001',
    shop_phone: '9876543210', shop_email: 'info@samplejewels.com',
    invoice_date: today, branch_name: 'Main Branch',
    gold_rate_22k: '6,250', gold_rate_24k: '6,850', silver_rate: '82',
  };

  const salesData = {
    ...base,
    invoice_number: 'INV-SAMPLE-001',
    customer_name: 'Priya Sharma',
    customer_mobile: '9876543210',
    customer_address: '123 MG Road, Bangalore',
    items: [
      { sl: 1, description: 'Gold Necklace 22K', article_number: 'GLD-SAMPLE-001',
        purity: '22K', gross_weight: '25.500', stone_weight: '0.700',
        net_weight: '24.800', gold_rate: '6,250', making_charge: '6,200',
        wastage: '4,650', taxable: '1,65,850', gst: '4,976', total: '1,70,826',
        huid: 'AA112233', hallmark: 'BIS 916' },
    ],
    subtotal: '1,65,850', gst_amount: '4,976', cgst: '2,488', sgst: '2,488',
    round_off: '0.44', net_payable: '1,70,827',
    payment_mode: 'UPI', payment_ref: 'UPI-98765',
    old_gold_value: '0', scheme_value: '0',
    terms: 'Goods once sold cannot be returned. E.& O.E.',
    bank_name: 'HDFC Bank', bank_account: '123456789', bank_ifsc: 'HDFC0001234',
  };

  const karigarData = {
    ...base,
    issue_number: 'ISS-SAMPLE-001',
    karigar_name: 'Raju Kumar', karigar_code: 'KAR-001',
    karigar_mobile: '9876543211',
    issue_date: today, expected_return: '15-Jul-2026',
    gold_issued: '100.000', purity: '22K',
    gold_rate: '6,250', total_value: '6,25,000',
    wastage_allowed: '3%', wages_rate: '200',
    design: 'Traditional Necklace',
  };

  const purchaseData = {
    ...base,
    purchase_number: 'PUR-SAMPLE-001',
    supplier_name: 'ABC Gold Pvt Ltd',
    supplier_invoice: 'ABCG-4567',
    supplier_gst: '29XYZAB1234C1Z5',
    items: [
      { sl: 1, description: 'Gold Necklace Set', quantity: 3,
        gross_weight: '75.000', net_weight: '72.900', purity: '22K',
        rate: '6,250', amount: '4,55,625' },
    ],
    total: '4,55,625', gst: '13,669', grand_total: '4,69,294',
  };

  const schemeData = {
    ...base,
    receipt_number: 'SCM-SAMPLE-001',
    customer_name: 'Ramesh Kumar',
    scheme_name: 'Gold Savings 11+1 Plan',
    enrollment_number: 'ENR-SAMPLE-001',
    installment_no: '3',
    monthly_amount: '5,000',
    paid_date: today,
    payment_mode: 'Cash',
    total_paid: '15,000',
    balance_installments: '8',
    maturity_value: '60,000',
    maturity_date: 'Jun-2027',
  };

  const karigarSettlement = {
    ...base,
    karigar_name: 'Raju Kumar', karigar_code: 'KAR-001',
    period: 'June 2026',
    items: [
      { issue_date: '01-Jun-2026', issued: '100.000', returned: '97.200', wastage: '2.800', deduction: '5,600' },
    ],
    total_issued: '100.000', total_returned: '97.200', total_wastage: '2.800',
    gross_wages: '19,440', wastage_deduction: '5,600', net_wages: '13,840',
    payment_mode: 'Bank Transfer', bank_details: 'HDFC A/C: 123456789',
  };

  const repairData = {
    ...base,
    job_card: 'JOB-SAMPLE-001',
    customer_name: 'Anitha Kumar',
    customer_mobile: '9876543212',
    item_description: 'Gold Necklace — 22K — 15g',
    issue_date: today, expected_delivery: '05-Jul-2026',
    work_required: 'Clasp broken, needs replacement',
    estimate: '500', advance: '200', balance: '300',
    karigar: 'Raju Kumar',
  };

  const typeMap = {
    SALES: salesData, PURCHASE: purchaseData,
    KARIGAR_ISSUE: karigarData, KARIGAR_RECEIVE: karigarData,
    KARIGAR_SETTLEMENT: karigarSettlement,
    SCHEME_RECEIPT: schemeData, SCHEME_LEDGER: schemeData, SCHEME_MATURITY: schemeData,
    REPAIR_RECEIPT: repairData, REPAIR_DELIVERY: repairData,
    QUOTATION: { ...salesData, invoice_number: 'QUO-SAMPLE-001', is_quotation: true },
    ESTIMATE: { ...salesData, invoice_number: 'EST-SAMPLE-001' },
    GST_INVOICE: { ...salesData, gst_type: 'CGST_SGST', igst: '0' },
  };

  return typeMap[docType] || salesData;
}

module.exports = router;

// ── POST /api/invoice-studio/templates — create new template ──────────────────
router.post('/templates', authenticate, async (req, res) => {
  try {
    const { Template_Name, Document_Type, Paper_Size, Layout_JSON, Is_Default, Template_Version } = req.body;
    if (requireSuperAdminForLabel(Document_Type, req, res)) return;
    const tenantId = resolveTenantId(req);
    const docType = Document_Type || 'SALES_BILL';
    const layoutStr = typeof Layout_JSON === 'string' ? Layout_JSON : JSON.stringify(Layout_JSON || []);

    // The client's own "Save" action always sends Is_Default: false (only
    // the separate "Set as Default" button ever sends true) — GET
    // /resolve/:docType (the route real printing actually calls) requires
    // Is_Default=true, so a tenant's very first template for a document
    // type was permanently invisible to printing until they discovered
    // and clicked that separate button. Found via a real admin report:
    // designed a Sales Bill template, printing never picked it up.
    // Auto-promoting the FIRST active template for a (tenant, doc type)
    // combo makes the common case — one template per document type —
    // just work; an admin who deliberately adds a second alternate
    // design still uses "Set as Default" to switch between them, exactly
    // as before.
    let isDefault = !!Is_Default;
    if (!isDefault) {
      const existing = await db('tbl_invoice_studio_templates')
        .where({ Tenant_ID: tenantId, Document_Type: docType, Is_Active: true })
        .first('Template_ID');
      if (!existing) isDefault = true;
    }

    const [row] = await db('tbl_invoice_studio_templates').insert({
      Tenant_ID:        tenantId,
      Template_Name:    Template_Name || 'Untitled Template',
      Document_Type:    docType,
      Paper_Size:       Paper_Size || 'A4',
      Components:       layoutStr,
      Version:          Template_Version || 1,
      Is_Default:       isDefault,
      Is_Active:        true,
      Version_History:  JSON.stringify([{ version: 1, saved_at: new Date().toISOString(), layout: layoutStr }]),
      Created_By:       req.user.username,
      Last_Updated_By:  req.user.username,
    }).returning('*');
    // Map Version → Template_Version for frontend
    return sendSuccess(res, { ...row, Template_ID: row.Template_ID, Template_Version: row.Version }, 'Template saved.', 201);
  } catch (err) {
    console.error('Template create error:', err.message);
    return sendError(res, 500, `Failed to save template: ${err.message}`);
  }
});

// ── PUT /api/invoice-studio/templates/:id — update template ───────────────────
router.put('/templates/:id', authenticate, async (req, res) => {
  try {
    const tenantId = resolveTenantId(req);
    let existingQb = db('tbl_invoice_studio_templates').where({ Template_ID: req.params.id });
    existingQb = tenantId === null ? existingQb.whereNull('Tenant_ID') : existingQb.where('Tenant_ID', tenantId);
    const existing = await existingQb.first();
    if (!existing) return sendError(res, 404, 'Template not found.');
    if (requireSuperAdminForLabel(existing.Document_Type, req, res)) return;

    const { Layout_JSON, Template_Name, Paper_Size, Is_Default } = req.body;
    const newVersion = (existing.Version || 1) + 1;
    const layoutStr = typeof Layout_JSON === 'string' ? Layout_JSON : JSON.stringify(Layout_JSON || []);

    let history = [];
    try { history = typeof existing.Version_History === 'string' ? JSON.parse(existing.Version_History) : (existing.Version_History || []); } catch {}
    history.push({ version: existing.Version || 1, saved_at: new Date().toISOString(), layout: existing.Components });
    if (history.length > 10) history = history.slice(-10);

    // "Set as Default" was setting Is_Default=true on this row WITHOUT
    // clearing it on whichever OTHER template already held the default
    // for this (Tenant_ID, Document_Type) — leaving TWO rows marked
    // default at once. GET /resolve/:docType's .first() then returned
    // whichever one the DB happened to return first (insertion order),
    // not the one actually just chosen — the button silently didn't work
    // whenever there was more than one template to choose between, which
    // is the only time clicking it is meaningful at all. Found via a real
    // test exercising this exact "switch the default" flow.
    if (Is_Default === true) {
      await db('tbl_invoice_studio_templates')
        .where({ Tenant_ID: existing.Tenant_ID, Document_Type: existing.Document_Type, Is_Default: true })
        .whereNot({ Template_ID: existing.Template_ID })
        .update({ Is_Default: false });
    }

    const [updated] = await db('tbl_invoice_studio_templates')
      .where({ Template_ID: req.params.id })
      .update({
        Template_Name:     Template_Name || existing.Template_Name,
        Paper_Size:        Paper_Size    || existing.Paper_Size,
        Components:        layoutStr,
        Version:           newVersion,
        Is_Default:        Is_Default !== undefined ? Is_Default : existing.Is_Default,
        Version_History:   JSON.stringify(history),
        Last_Updated_By:   req.user.username,
        Last_Updated_Date: new Date(),
      }).returning('*');

    return sendSuccess(res, { ...updated, Template_Version: updated.Version }, 'Template updated.');
  } catch (err) {
    console.error('Template update error:', err.message);
    return sendError(res, 500, `Failed to update template: ${err.message}`);
  }
});

// ── DELETE /api/invoice-studio/templates/:id ──────────────────────────────────
router.delete('/templates/:id', authenticate, async (req, res) => {
  try {
    const tenantId = resolveTenantId(req);
    let qb = db('tbl_invoice_studio_templates').where({ Template_ID: req.params.id });
    qb = tenantId === null ? qb.whereNull('Tenant_ID') : qb.where('Tenant_ID', tenantId);
    const existing = await qb.first();
    if (!existing) return sendError(res, 404, 'Template not found.');
    if (requireSuperAdminForLabel(existing.Document_Type, req, res)) return;

    await db('tbl_invoice_studio_templates').where({ Template_ID: req.params.id }).update({ Is_Active: false });
    return sendSuccess(res, null, 'Template deleted.');
  } catch (err) {
    return sendError(res, 500, 'Failed.');
  }
});

// ── POST /api/invoice-studio/templates/:id/duplicate ─────────────────────────
router.post('/templates/:id/duplicate', authenticate, async (req, res) => {
  try {
    const tenantId = resolveTenantId(req);
    let srcQb = db('tbl_invoice_studio_templates').where({ Template_ID: req.params.id });
    srcQb = tenantId === null ? srcQb.whereNull('Tenant_ID') : srcQb.where('Tenant_ID', tenantId);
    const src = await srcQb.first();
    if (!src) return sendError(res, 404, 'Template not found.');
    if (requireSuperAdminForLabel(src.Document_Type, req, res)) return;
    const [row] = await db('tbl_invoice_studio_templates').insert({
      Tenant_ID:        tenantId,
      Template_Name:    (src.Template_Name || 'Template') + ' (Copy)',
      Document_Type:    src.Document_Type,
      Paper_Size:       src.Paper_Size,
      Components:       src.Components,
      Template_Version: 1,
      Is_Default:       false,
      Is_Active:        true,
      Version_History:  JSON.stringify([]),
      Created_By:       req.user.username,
      Last_Updated_By:  req.user.username,
    }).returning('*');
    return sendSuccess(res, row, 'Template duplicated.');
  } catch (err) {
    return sendError(res, 500, 'Failed to duplicate.');
  }
});

// ── GET /api/invoice-studio/templates/:id/versions ───────────────────────────
router.get('/templates/:id/versions', authenticate, async (req, res) => {
  try {
    const tenantId = resolveTenantId(req);
    const tmpl = await db('tbl_invoice_studio_templates')
      .where({ Template_ID: req.params.id, Tenant_ID: tenantId }).first();
    if (!tmpl) return sendError(res, 404, 'Not found.');
    let history = [];
    try { history = typeof tmpl.Version_History === 'string' ? JSON.parse(tmpl.Version_History) : (tmpl.Version_History || []); } catch {}
    return sendSuccess(res, history.reverse());
  } catch (err) {
    return sendError(res, 500, 'Failed.');
  }
});

// ── POST /api/invoice-studio/ai-analyze ──────────────────────────────────────
// Analyzes invoice image via Google Vision API and returns block layout
const multer = require('multer');
const aiUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

router.post('/ai-analyze', authenticate, aiUpload.single('file'), async (req, res) => {
  try {
    if (!req.file) return sendError(res, 400, 'No file uploaded.');

    const invoiceType = req.body.invoiceType || 'SALES_BILL';
    const visionKey = process.env.GOOGLE_VISION_API_KEY;

    if (!visionKey) {
      return sendSuccess(res, {
        blocks: null,
        ai_used: false,
        message: 'Add GOOGLE_VISION_API_KEY to .env to enable AI analysis. Loading default template.',
      });
    }

    const fileBase64 = req.file.buffer.toString('base64');

    const visionRes = await fetch(
      `https://vision.googleapis.com/v1/images:annotate?key=${visionKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requests: [{
            image: { content: fileBase64 },
            features: [{ type: 'DOCUMENT_TEXT_DETECTION' }, { type: 'OBJECT_LOCALIZATION' }],
          }],
        }),
      }
    );

    const visionData = await visionRes.json();
    const fullText = visionData.responses?.[0]?.fullTextAnnotation?.text || '';
    const textBlocks = visionData.responses?.[0]?.fullTextAnnotation?.blocks || [];

    const detected = analyzeInvoiceText(fullText);
    const templateBlocks = generateBlocksFromDetection(detected);

    return sendSuccess(res, {
      blocks: templateBlocks,
      detected_components: Object.keys(detected).filter(k => detected[k]),
      ai_used: true,
      text_length: fullText.length,
    });
  } catch (err) {
    console.error('AI analyze error:', err.message);
    return sendError(res, 500, `AI analysis failed: ${err.message}`);
  }
});

// ── POST /api/invoice-studio/ai-analyze-label ────────────────────────────────
// Real position-aware layout extraction for barcode/RFID jewellery tags —
// deliberately separate from /ai-analyze above, which only keyword-guesses
// and drops generic fixed-position boxes. This one reads Google Vision's
// actual per-paragraph bounding boxes (pixel coordinates from the uploaded
// photo) and places blocks where the text really is, scaled onto the
// label's real mm canvas. Does not modify /ai-analyze or its helpers.
router.post('/ai-analyze-label', authenticate, aiUpload.single('file'), async (req, res) => {
  try {
    if (!isSuperAdmin(req)) return sendError(res, 403, 'Label templates are managed centrally — only a Super Admin can change them.');
    if (!req.file) return sendError(res, 400, 'No file uploaded.');

    const canvasWidthMm = parseFloat(req.body.canvasWidthMm) || 60;
    const canvasHeightMm = parseFloat(req.body.canvasHeightMm) || 40;
    const visionKey = process.env.GOOGLE_VISION_API_KEY;

    if (!visionKey) {
      return sendSuccess(res, {
        blocks: null,
        ai_used: false,
        message: 'Add GOOGLE_VISION_API_KEY to .env to enable tag image analysis.',
      });
    }

    const fileBase64 = req.file.buffer.toString('base64');
    const visionRes = await fetch(
      `https://vision.googleapis.com/v1/images:annotate?key=${visionKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requests: [{
            image: { content: fileBase64 },
            features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
          }],
        }),
      }
    );

    const visionData = await visionRes.json();
    const page = visionData.responses?.[0]?.fullTextAnnotation?.pages?.[0];
    if (!page) {
      return sendSuccess(res, { blocks: null, ai_used: true, detectedCount: 0, message: 'No text detected in this image.' });
    }

    const imgWidthPx = page.width || 1;
    const imgHeightPx = page.height || 1;
    const paragraphs = (page.blocks || []).flatMap((b) => b.paragraphs || []);

    const blocks = paragraphs.map((p) => {
      const text = paragraphText(p);
      const box = boundingBoxToMm(p.boundingBox, imgWidthPx, imgHeightPx, canvasWidthMm, canvasHeightMm);
      return { text, ...box };
    }).filter((b) => b.text.trim());

    const classified = classifyLabelBlocks(blocks);

    // Vision can't reliably localize a QR code at tag scale — always include
    // one at a sensible default spot rather than confidently-detected coordinates.
    classified.unshift({
      id: `qr_code_${Date.now()}`, type: 'qr_code',
      xMm: 1, yMm: (canvasHeightMm - Math.min(canvasHeightMm - 2, canvasWidthMm * 0.4)) / 2,
      wMm: Math.min(canvasHeightMm - 2, canvasWidthMm * 0.4), hMm: Math.min(canvasHeightMm - 2, canvasWidthMm * 0.4),
      content: {},
    });

    return sendSuccess(res, {
      blocks: classified,
      ai_used: true,
      detectedCount: classified.length,
      message: `Detected ${classified.length - 1} text field(s) from the image. QR position is a placeholder — please check it.`,
    });
  } catch (err) {
    console.error('AI label analyze error:', err.message);
    return sendError(res, 500, `Tag image analysis failed: ${err.message}`);
  }
});

// Reconstructs a paragraph's text from its word/symbol tree (Vision doesn't
// give a flat `.text` on paragraphs — only nested words -> symbols).
function paragraphText(paragraph) {
  return (paragraph.words || []).map((w) => (w.symbols || []).map((s) => s.text).join('')).join(' ');
}

// Converts a Vision boundingBox (absolute pixel vertices) into mm coordinates
// scaled independently per axis onto the label's real canvas size.
function boundingBoxToMm(boundingBox, imgWidthPx, imgHeightPx, canvasWidthMm, canvasHeightMm) {
  const verts = boundingBox?.vertices || [];
  const xs = verts.map((v) => v.x || 0);
  const ys = verts.map((v) => v.y || 0);
  const left = Math.min(...xs, imgWidthPx);
  const right = Math.max(...xs, 0);
  const top = Math.min(...ys, imgHeightPx);
  const bottom = Math.max(...ys, 0);
  const scaleX = canvasWidthMm / imgWidthPx;
  const scaleY = canvasHeightMm / imgHeightPx;
  return {
    xMm: left * scaleX, yMm: top * scaleY,
    wMm: Math.max(2, (right - left) * scaleX), hMm: Math.max(2, (bottom - top) * scaleY),
  };
}

const ITEM_TYPE_WORDS = /\b(ring|chain|necklace|bangle|bracelet|earring|pendant|mangalsutra|anklet|nose\s?pin)\b/i;
const PURITY_RE = /\b(9|1[0-8]|2[0-4])\s?k(t)?\b/i;
const WEIGHT_RE = /\d+(\.\d+)?\s?g(m|rams?)?\b/i;
const PRICE_RE = /(₹|rs\.?\s?)\s?[\d,]+|\b\d{1,3}(,\d{2,3})+(\.\d+)?\b/i;
const HUID_RE = /\bhuid\b/i;
const WASTAGE_RE = /\bwastage\b/i;
const TAG_NO_RE = /\btag\s?(no|number|#)\b/i;
const CODE_RE = /\b[A-Z0-9]{2,}-[A-Z0-9-]+\b|\b(?=[A-Z0-9]*\d)(?=[A-Z0-9]*[A-Z])[A-Z0-9]{4,}\b/;

// Classifies each detected text region into a label field type, in priority
// order, so the most distinctive pattern (purity, weight, price) claims a
// paragraph before looser fallbacks (shop name, free text) do.
function classifyLabelBlocks(rawBlocks) {
  let weightsSeen = 0;
  const used = new Set();
  const result = [];

  const claim = (predicate, type, extra) => {
    rawBlocks.forEach((b, i) => {
      if (used.has(i) || !predicate(b.text)) return;
      used.add(i);
      result.push({
        id: `${type}_${Date.now()}_${i}`, type,
        xMm: b.xMm, yMm: b.yMm, wMm: b.wMm, hMm: b.hMm,
        content: { ...(extra || {}), text: type === 'text' ? b.text : undefined, detectedText: b.text },
      });
    });
  };

  claim((t) => PURITY_RE.test(t), 'purity', { badge: true, bold: true, align: 'center' });
  // These three match on a distinctive keyword ("huid"/"wastage"/"tag no"),
  // so claim them before the generic alphanumeric-code pattern below —
  // otherwise a line like "HUID: AZ4E2D" would get swept into article_no.
  claim((t) => HUID_RE.test(t), 'huid', { align: 'left' });
  claim((t) => WASTAGE_RE.test(t), 'wastage', { align: 'left' });
  claim((t) => TAG_NO_RE.test(t), 'tag_no', { bold: true, align: 'left' });

  // Weight needs a dynamic type (first match = gross, second = net) — claim()
  // only takes a fixed type string, so handle it with its own loop instead.
  rawBlocks.forEach((b, i) => {
    if (used.has(i) || !WEIGHT_RE.test(b.text)) return;
    used.add(i);
    const type = weightsSeen++ === 0 ? 'gross_wt' : 'net_wt';
    result.push({ id: `${type}_${Date.now()}_${i}`, type, xMm: b.xMm, yMm: b.yMm, wMm: b.wMm, hMm: b.hMm, content: { detectedText: b.text } });
  });

  claim((t) => PRICE_RE.test(t), 'price', { bold: true, align: 'right', color: '#B8860B' });
  claim((t) => ITEM_TYPE_WORDS.test(t), 'item_type', { align: 'left' });
  claim((t) => CODE_RE.test(t), 'article_no', { bold: true, align: 'left' });

  // Largest remaining paragraph becomes the shop name; everything else left
  // over becomes an editable free-text block so nothing is silently dropped.
  const remaining = rawBlocks.map((b, i) => ({ b, i })).filter(({ i }) => !used.has(i));
  if (remaining.length) {
    remaining.sort((a, b) => (b.b.wMm * b.b.hMm) - (a.b.wMm * a.b.hMm));
    const shopIdx = remaining[0].i;
    used.add(shopIdx);
    const shop = rawBlocks[shopIdx];
    result.push({
      id: `shop_name_${Date.now()}_${shopIdx}`, type: 'shop_name',
      xMm: shop.xMm, yMm: shop.yMm, wMm: shop.wMm, hMm: shop.hMm,
      content: { text: shop.text, bold: true, align: 'center' },
    });
  }
  rawBlocks.forEach((b, i) => {
    if (used.has(i)) return;
    result.push({ id: `text_${Date.now()}_${i}`, type: 'text', xMm: b.xMm, yMm: b.yMm, wMm: b.wMm, hMm: b.hMm, content: { text: b.text, fontSize: 7, align: 'left' } });
  });

  return result;
}

function analyzeInvoiceText(text) {
  const t = text.toLowerCase();
  return {
    has_logo:     /logo|shop|store/.test(t),
    has_header:   /gst|gstin|pvt|ltd|jewel|jewellery/.test(t),
    has_invoice:  /invoice|bill no|receipt/.test(t),
    has_customer: /customer|buyer|party|name/.test(t),
    has_table:    /item|description|weight|gross|net|purity|rate/.test(t),
    has_gst:      /cgst|sgst|igst/.test(t),
    has_totals:   /total|payable|balance/.test(t),
    has_footer:   /terms|conditions|signature|authorized/.test(t),
    has_bank:     /bank|account|ifsc|upi/.test(t),
  };
}

function generateBlocksFromDetection(d) {
  const W = 774; let y = 20; const blocks = [];
  const add = (type, x, w, h) => { blocks.push({ id: `${type}_${Date.now()}`, type, x, y, w, h, content: {} }); y += h + 8; };
  if (d.has_logo) add('logo', 20, 110, 60);
  if (d.has_header) { blocks[blocks.length-1] && (blocks[blocks.length-1].x = 140); add('shop_header', 140, W-160, 70); }
  add('line', 10, W, 2);
  if (d.has_invoice) add('invoice_meta', 10, W, 42);
  if (d.has_customer) add('customer', 10, W, 80);
  add('line', 10, W, 2);
  if (d.has_table) add('items_table', 10, W, 280);
  if (d.has_gst) add('gst_block', 10, 300, 70);
  if (d.has_totals) { blocks.push({ id: `totals_${Date.now()}`, type: 'totals', x: W-230, y: y-70, w: 220, h: 160, content: {} }); }
  add('line', 10, W, 2);
  if (d.has_bank) add('bank_details', 10, W/2-10, 60);
  if (d.has_footer) add('terms', 10, W/2-10, 60);
  add('signature', W/2, W/2-10, 50);
  return blocks;
}
