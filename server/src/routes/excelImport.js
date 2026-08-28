/**
 * Excel Bulk Import — admin-only.
 *
 * Two real, working import types (Stock/Ornaments and Customers) rather
 * than a fake "any file, any table" universal importer — that would mean
 * guessing column mappings for tables I can't know in advance. Writes
 * straight into the same tables the rest of the app (and every report)
 * already reads from — tbl_ornament_master / tbl_customer_master — so
 * imported rows show up in Inventory/Customer screens and reports
 * immediately, with no separate "staging" table to sync later.
 *
 * multer memoryStorage — the uploaded file is parsed and discarded, never
 * written to disk (unlike server/src/routes/upload.js's logo/stamp
 * uploads, which are meant to persist).
 *
 * ── Middleware order matters here, don't "tidy" it back ──────────────────
 * Every route below runs `upload.single('file')` BEFORE `authenticate`, the
 * opposite of every other protected route in this app. This is intentional
 * and load-bearing: `authenticate` wraps the rest of the request in an
 * AsyncLocalStorage context (see db/tenantDb.js) so `db(...)` below resolves
 * to the right tenant's connection. multer's multipart parsing does its
 * work via an internal stream/event-based callback, not a plain awaited
 * promise — and that callback firing outside the ALS scope intermittently
 * (not always — this only reproduced under real concurrent load, not a
 * single manual test) drops the context, making `db(...)` throw "No tenant
 * database context is active." Running multer FIRST means `authenticate`'s
 * `next()` flows straight into a plain synchronous call chain
 * (requirePermission → the handler), with no async gap for the context to
 * get lost across. multer needs nothing from `req.user`, so this reorder
 * is free — but moving `authenticate` back in front of `upload.single`
 * reintroduces a real, intermittent 500 that a quick manual test won't
 * catch (it takes real request volume to surface).
 */
const router = require('express').Router();
const multer = require('multer');
const XLSX = require('xlsx');
const { v4: uuidv4 } = require('uuid');
const db = require('../db/tenantDb').tenantDb;
const { sendSuccess, sendError } = require('../utils/response');
const { authenticate, requirePermission } = require('../middleware/auth');
const { auditLog } = require('../utils/auditLogger');
const { METAL_TYPES, METAL_TYPES_WITH_PURITY } = require('../utils/metalTypes');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB — plenty for a spreadsheet, not a database dump
  fileFilter: (req, file, cb) => {
    const ok = ['.xlsx', '.xls', '.csv'].some((ext) => file.originalname.toLowerCase().endsWith(ext));
    cb(ok ? null : new Error('Only .xlsx, .xls, or .csv files are accepted.'), ok);
  },
});

function parseSheet(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(sheet, { defval: null, raw: true });
}

function num(v, fallback = 0) {
  // Real, previously-broken bug found by writing a real test: parseSheet's
  // `defval: null` means a genuinely blank cell arrives here as `null` —
  // and Number(null) is 0, which IS finite, so the fallback below never
  // triggered for exactly the "cell left blank" case this function exists
  // to handle. Two real consequences: GST_Percentage's intended "default
  // to 3% when blank" silently imported 0% instead, and purity's
  // "Karat/Percentage must both be numbers" hard-reject
  // (num(r['Karat'], NaN), checked via Number.isFinite) silently accepted
  // a blank Karat/Percentage as 0/0 instead of skipping the row.
  if (v === null || v === undefined || v === '') return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

// Excel gives booleans as "Yes"/"No", "TRUE"/"FALSE", 1/0, or a real boolean
// depending on how the sheet was filled in by hand — accept all of them
// rather than force one exact spelling.
function bool(v, fallback = false) {
  if (v === null || v === undefined || v === '') return fallback;
  if (typeof v === 'boolean') return v;
  return ['yes', 'y', 'true', '1'].includes(String(v).trim().toLowerCase());
}

// ── Column headers each template expects — kept in one place so the
//    template-download endpoint and the actual parser can't drift apart. ──
const TEMPLATES = {
  stock: ['Article Number', 'Item Type', 'Design Code', 'Metal Type', 'Purity', 'Gross Weight', 'Net Weight', 'Stone Weight', 'Making Charge Per Gram', 'Purchase Cost', 'Quantity', 'Hallmark Certificate No'],
  customers: ['Customer Name', 'Mobile', 'Email', 'Address', 'City', 'State', 'Pincode', 'PAN', 'GST No'],
  itemtypes: ['Type Code', 'Type Name', 'Category', 'HSN Code', 'GST Percentage', 'Default Making Charge', 'Default Wastage Percent', 'Is Gold', 'Is Silver'],
  designs: ['Design Code', 'Design Name', 'Item Type Code', 'Collection Name', 'Category', 'Estimated Gold Weight', 'Estimated Stone Weight', 'Estimated Making Charge', 'Estimated Wastage Percent'],
  purity: ['Purity Code', 'Metal Type', 'Karat', 'Percentage', 'Description', 'Hallmark Standard'],
  gemstones: ['Stone Code', 'Stone Name', 'Color', 'Clarity', 'Cut', 'Price Per Carat', 'Is Natural', 'Is Lab Grown'],
  vendors: ['Vendor Type', 'Vendor Name', 'Contact Person', 'Mobile', 'Email', 'Address', 'City', 'State', 'GST No', 'Opening Balance'],
};

// ── GET /api/excel-import/template/:type — a blank starter file ────────────────
router.get('/template/:type', authenticate, requirePermission('tenant_management'), (req, res) => {
  const headers = TEMPLATES[req.params.type];
  if (!headers) return sendError(res, 400, `Unknown import type. Use: ${Object.keys(TEMPLATES).join(', ')}`);
  const ws = XLSX.utils.aoa_to_sheet([headers]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Template');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Disposition', `attachment; filename="${req.params.type}_import_template.xlsx"`);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buf);
});

// ── POST /api/excel-import/stock ──────────────────────────────────────────────
router.post('/stock', upload.single('file'), authenticate, requirePermission('tenant_management'), async (req, res) => {
  if (!req.file) return sendError(res, 400, 'No file uploaded.');
  const tenantId = req.user.tenantId;
  const skipped = [];  // row was NOT inserted at all
  const warnings = []; // row WAS inserted, but with a field left blank rather than guessed
  let imported = 0;

  try {
    const rows = parseSheet(req.file.buffer);
    if (!rows.length) return sendError(res, 400, 'The file has no data rows.');

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const rowNum = i + 2; // +1 for header row, +1 for 1-indexing
      const articleNumber = String(r['Article Number'] || '').trim();
      const grossWeight = num(r['Gross Weight'], NaN);
      const netWeight = num(r['Net Weight'], NaN);

      if (!articleNumber) { skipped.push(`Row ${rowNum}: SKIPPED — Article Number is required.`); continue; }
      if (!Number.isFinite(grossWeight) || grossWeight <= 0) { skipped.push(`Row ${rowNum} (${articleNumber}): SKIPPED — Gross Weight must be a positive number.`); continue; }

      const existing = await db('tbl_ornament_master').where({ Tenant_ID: tenantId, Article_Number: articleNumber }).first();
      if (existing) { skipped.push(`Row ${rowNum} (${articleNumber}): SKIPPED — Article Number already exists, not overwritten.`); continue; }

      let typeId = null;
      if (r['Item Type']) {
        const t = await db('tbl_item_type_master').where('Type_Name', 'ilike', String(r['Item Type']).trim()).orWhere('Type_Code', String(r['Item Type']).trim()).first();
        if (t) typeId = t.Type_ID;
        else warnings.push(`Row ${rowNum} (${articleNumber}): imported, but Item Type "${r['Item Type']}" not found — left blank, not guessed.`);
      }
      let designId = null;
      if (r['Design Code']) {
        const d = await db('tbl_design_master').where('Design_Code', String(r['Design Code']).trim()).first();
        if (d) designId = d.Design_ID;
        else warnings.push(`Row ${rowNum} (${articleNumber}): imported, but Design Code "${r['Design Code']}" not found — left blank, not guessed.`);
      }
      let purityId = null;
      let purityMetalType = null;
      if (r['Purity']) {
        const p = await db('tbl_purity_master').where('Purity_Code', String(r['Purity']).trim()).first();
        if (p) { purityId = p.Purity_ID; purityMetalType = p.Metal_Type; }
        else warnings.push(`Row ${rowNum} (${articleNumber}): imported, but Purity "${r['Purity']}" not found — left blank, not guessed.`);
      }

      // Explicit "Metal Type" column wins; otherwise follow the resolved
      // Purity's own metal type; otherwise fall back to Gold (same default
      // the column itself has for every other write path).
      const rawMetal = String(r['Metal Type'] || '').trim();
      let metalType = METAL_TYPES.find((m) => m.toLowerCase() === rawMetal.toLowerCase());
      if (rawMetal && !metalType) warnings.push(`Row ${rowNum} (${articleNumber}): imported, but Metal Type "${rawMetal}" not recognized — defaulted to ${purityMetalType || 'Gold'}.`);
      if (!metalType) metalType = purityMetalType || 'Gold';

      const netWt = Number.isFinite(netWeight) && netWeight > 0 ? netWeight : grossWeight;
      const mcPerGram = num(r['Making Charge Per Gram'], 0);

      try {
        await db('tbl_ornament_master').insert({
          Tenant_ID: tenantId,
          Article_Number: articleNumber,
          Type_ID: typeId,
          Design_ID: designId,
          Purity_ID: purityId,
          Metal_Type: metalType,
          Gross_Weight: grossWeight,
          Net_Gold_Weight: netWt,
          Stone_Weight: num(r['Stone Weight'], 0),
          Current_Gold_Rate: 0, // not knowable from a stock sheet alone — set the day's rate via Gold Rate Management before selling
          Base_Making_Charge_Per_Gram: mcPerGram,
          Final_Making_Charge_Total: Math.round(mcPerGram * netWt * 100) / 100,
          Purchase_Cost: num(r['Purchase Cost'], 0),
          Stock_Quantity: num(r['Quantity'], 1),
          Hallmark_Certificate_No: r['Hallmark Certificate No'] || null,
          Created_By: req.user.username,
          Sync_UUID: uuidv4(),
        });
        imported++;
      } catch (insErr) {
        // One malformed row (e.g. a value too long for its column) must not
        // abort every other valid row in the file — caught here, not just
        // at the outer try/catch, precisely because that failure mode
        // actually happened during testing (see excel-import test notes).
        skipped.push(`Row ${rowNum} (${articleNumber}): SKIPPED — ${insErr.message}`);
      }
    }

    await auditLog({
      tenantId, userId: req.user.userId, tableName: 'tbl_ornament_master', recordId: null,
      actionType: 'INSERT', description: `Excel import: ${imported} stock items imported by ${req.user.username} (${skipped.length} rows skipped, ${warnings.length} imported with warnings)`, req,
    });

    return sendSuccess(
      res,
      { imported, skipped: skipped.length, warnings: warnings.length, totalRows: rows.length, errors: [...skipped, ...warnings] },
      `Imported ${imported} of ${rows.length} rows${skipped.length ? `, ${skipped.length} skipped` : ''}${warnings.length ? `, ${warnings.length} imported with a warning` : ''}.`
    );
  } catch (err) {
    return sendError(res, 500, 'Failed to process the file: ' + err.message);
  }
});

// ── POST /api/excel-import/customers ──────────────────────────────────────────
router.post('/customers', upload.single('file'), authenticate, requirePermission('tenant_management'), async (req, res) => {
  if (!req.file) return sendError(res, 400, 'No file uploaded.');
  const tenantId = req.user.tenantId;
  const errors = [];
  let imported = 0;

  try {
    const rows = parseSheet(req.file.buffer);
    if (!rows.length) return sendError(res, 400, 'The file has no data rows.');

    const last = await db('tbl_customer_master').where('Tenant_ID', tenantId).orderBy('Customer_ID', 'desc').first();
    let nextSeq = (last?.Customer_ID || 0) + 1;

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const rowNum = i + 2;
      const name = String(r['Customer Name'] || '').trim();
      const mobile = String(r['Mobile'] || '').replace(/\D/g, '');

      if (!name) { errors.push(`Row ${rowNum}: Customer Name is required — skipped.`); continue; }
      if (!mobile || mobile.length < 10) { errors.push(`Row ${rowNum} (${name}): a valid Mobile number is required — skipped.`); continue; }

      const existing = await db('tbl_customer_master').where({ Tenant_ID: tenantId, Mobile_1: mobile }).first();
      if (existing) { errors.push(`Row ${rowNum} (${name}): mobile ${mobile} already exists — skipped, not overwritten.`); continue; }

      try {
        await db('tbl_customer_master').insert({
          Tenant_ID: tenantId,
          Customer_Code: `${tenantId}-C${nextSeq}`,
          Customer_Name: name,
          Mobile_1: mobile,
          Email: r['Email'] || null,
          Address_Line1: r['Address'] || null,
          City: r['City'] || null,
          State: r['State'] || null,
          Pincode: r['Pincode'] ? String(r['Pincode']) : null,
          PAN_No: r['PAN'] || null,
          GST_No: r['GST No'] || null,
          Is_Active: true,
          Created_By: req.user.username,
          Sync_UUID: uuidv4(),
        });
        nextSeq++;
        imported++;
      } catch (insErr) {
        errors.push(`Row ${rowNum} (${name}): SKIPPED — ${insErr.message}`);
      }
    }

    await auditLog({
      tenantId, userId: req.user.userId, tableName: 'tbl_customer_master', recordId: null,
      actionType: 'INSERT', description: `Excel import: ${imported} customers imported by ${req.user.username} (${errors.length} rows skipped)`, req,
    });

    return sendSuccess(res, { imported, skipped: errors.length, totalRows: rows.length, errors }, `Imported ${imported} of ${rows.length} rows.`);
  } catch (err) {
    return sendError(res, 500, 'Failed to process the file: ' + err.message);
  }
});

// ── POST /api/excel-import/itemtypes ──────────────────────────────────────────
// tbl_item_type_master is GLOBAL (no Tenant_ID) — shared across every tenant
// on the platform, same as the existing one-at-a-time admin screen for it.
// Bulk-importing here adds to that shared catalog, it doesn't create a
// tenant-private copy.
router.post('/itemtypes', upload.single('file'), authenticate, requirePermission('tenant_management'), async (req, res) => {
  if (!req.file) return sendError(res, 400, 'No file uploaded.');
  const skipped = [];
  let imported = 0;
  try {
    const rows = parseSheet(req.file.buffer);
    if (!rows.length) return sendError(res, 400, 'The file has no data rows.');

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const rowNum = i + 2;
      const code = String(r['Type Code'] || '').trim();
      const name = String(r['Type Name'] || '').trim();
      if (!code || !name) { skipped.push(`Row ${rowNum}: SKIPPED — Type Code and Type Name are both required.`); continue; }

      const existing = await db('tbl_item_type_master').where('Type_Code', code).first();
      if (existing) { skipped.push(`Row ${rowNum} (${code}): SKIPPED — Type Code already exists, not overwritten.`); continue; }

      try {
        await db('tbl_item_type_master').insert({
          Type_Code: code, Type_Name: name,
          Category: r['Category'] || 'General',
          HSN_Code: r['HSN Code'] || null,
          GST_Percentage: num(r['GST Percentage'], 3),
          Default_Making_Charge: r['Default Making Charge'] != null ? num(r['Default Making Charge']) : null,
          Default_Wastage_Percent: r['Default Wastage Percent'] != null ? num(r['Default Wastage Percent']) : null,
          Is_Gold: bool(r['Is Gold'], true),
          Is_Silver: bool(r['Is Silver'], false),
          Created_By: req.user.username,
        });
        imported++;
      } catch (insErr) {
        skipped.push(`Row ${rowNum} (${code}): SKIPPED — ${insErr.message}`);
      }
    }

    await auditLog({ tenantId: req.user.tenantId, userId: req.user.userId, tableName: 'tbl_item_type_master', recordId: null, actionType: 'INSERT', description: `Excel import: ${imported} item types imported by ${req.user.username}`, req });
    return sendSuccess(res, { imported, skipped: skipped.length, warnings: 0, totalRows: rows.length, errors: skipped }, `Imported ${imported} of ${rows.length} rows.`);
  } catch (err) {
    return sendError(res, 500, 'Failed to process the file: ' + err.message);
  }
});

// ── POST /api/excel-import/designs ────────────────────────────────────────────
// Also GLOBAL, same reasoning as itemtypes above.
router.post('/designs', upload.single('file'), authenticate, requirePermission('tenant_management'), async (req, res) => {
  if (!req.file) return sendError(res, 400, 'No file uploaded.');
  const skipped = [];
  const warnings = [];
  let imported = 0;
  try {
    const rows = parseSheet(req.file.buffer);
    if (!rows.length) return sendError(res, 400, 'The file has no data rows.');

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const rowNum = i + 2;
      const code = String(r['Design Code'] || '').trim();
      const name = String(r['Design Name'] || '').trim();
      if (!code || !name) { skipped.push(`Row ${rowNum}: SKIPPED — Design Code and Design Name are both required.`); continue; }

      const existing = await db('tbl_design_master').where('Design_Code', code).first();
      if (existing) { skipped.push(`Row ${rowNum} (${code}): SKIPPED — Design Code already exists, not overwritten.`); continue; }

      let typeId = null;
      if (r['Item Type Code']) {
        const t = await db('tbl_item_type_master').where('Type_Code', String(r['Item Type Code']).trim()).first();
        if (t) typeId = t.Type_ID;
        else warnings.push(`Row ${rowNum} (${code}): imported, but Item Type Code "${r['Item Type Code']}" not found — left blank, not guessed.`);
      }

      try {
        await db('tbl_design_master').insert({
          Design_Code: code, Design_Name: name, Type_ID: typeId,
          Collection_Name: r['Collection Name'] || null,
          Category: r['Category'] || null,
          Estimated_Gold_Weight: r['Estimated Gold Weight'] != null ? num(r['Estimated Gold Weight']) : null,
          Estimated_Stone_Weight: r['Estimated Stone Weight'] != null ? num(r['Estimated Stone Weight']) : null,
          Estimated_Making_Charge: r['Estimated Making Charge'] != null ? num(r['Estimated Making Charge']) : null,
          Estimated_Wastage_Percent: r['Estimated Wastage Percent'] != null ? num(r['Estimated Wastage Percent']) : null,
          Created_By: req.user.username,
        });
        imported++;
      } catch (insErr) {
        skipped.push(`Row ${rowNum} (${code}): SKIPPED — ${insErr.message}`);
      }
    }

    await auditLog({ tenantId: req.user.tenantId, userId: req.user.userId, tableName: 'tbl_design_master', recordId: null, actionType: 'INSERT', description: `Excel import: ${imported} designs imported by ${req.user.username}`, req });
    return sendSuccess(
      res,
      { imported, skipped: skipped.length, warnings: warnings.length, totalRows: rows.length, errors: [...skipped, ...warnings] },
      `Imported ${imported} of ${rows.length} rows${skipped.length ? `, ${skipped.length} skipped` : ''}${warnings.length ? `, ${warnings.length} imported with a warning` : ''}.`
    );
  } catch (err) {
    return sendError(res, 500, 'Failed to process the file: ' + err.message);
  }
});

// ── POST /api/excel-import/purity ─────────────────────────────────────────────
router.post('/purity', upload.single('file'), authenticate, requirePermission('tenant_management'), async (req, res) => {
  if (!req.file) return sendError(res, 400, 'No file uploaded.');
  const skipped = [];   // row was NOT inserted at all
  const warnings = [];  // row WAS inserted, but with a field defaulted rather than as given
  let imported = 0;
  try {
    const rows = parseSheet(req.file.buffer);
    if (!rows.length) return sendError(res, 400, 'The file has no data rows.');

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const rowNum = i + 2;
      const code = String(r['Purity Code'] || '').trim();
      const karat = num(r['Karat'], NaN);
      const percentage = num(r['Percentage'], NaN);
      if (!code) { skipped.push(`Row ${rowNum}: SKIPPED — Purity Code is required.`); continue; }
      if (!Number.isFinite(karat) || !Number.isFinite(percentage)) { skipped.push(`Row ${rowNum} (${code}): SKIPPED — Karat and Percentage must both be numbers.`); continue; }

      const existing = await db('tbl_purity_master').where('Purity_Code', code).first();
      if (existing) { skipped.push(`Row ${rowNum} (${code}): SKIPPED — Purity Code already exists, not overwritten.`); continue; }

      const rawMetal = String(r['Metal Type'] || '').trim();
      const metalType = METAL_TYPES_WITH_PURITY.find((m) => m.toLowerCase() === rawMetal.toLowerCase());
      if (rawMetal && !metalType) warnings.push(`Row ${rowNum} (${code}): imported, but Metal Type "${rawMetal}" not recognized — defaulted to Gold.`);

      try {
        await db('tbl_purity_master').insert({
          Purity_Code: code, Karat: karat, Percentage: percentage,
          Metal_Type: metalType || 'Gold',
          Description: r['Description'] || null,
          Hallmark_Standard: r['Hallmark Standard'] || null,
        });
        imported++;
      } catch (insErr) {
        skipped.push(`Row ${rowNum} (${code}): SKIPPED — ${insErr.message}`);
      }
    }

    await auditLog({ tenantId: req.user.tenantId, userId: req.user.userId, tableName: 'tbl_purity_master', recordId: null, actionType: 'INSERT', description: `Excel import: ${imported} purity codes imported by ${req.user.username}`, req });
    return sendSuccess(res, { imported, skipped: skipped.length, warnings: warnings.length, totalRows: rows.length, errors: [...skipped, ...warnings] }, `Imported ${imported} of ${rows.length} rows.`);
  } catch (err) {
    return sendError(res, 500, 'Failed to process the file: ' + err.message);
  }
});

// ── POST /api/excel-import/gemstones ──────────────────────────────────────────
router.post('/gemstones', upload.single('file'), authenticate, requirePermission('tenant_management'), async (req, res) => {
  if (!req.file) return sendError(res, 400, 'No file uploaded.');
  const skipped = [];
  let imported = 0;
  try {
    const rows = parseSheet(req.file.buffer);
    if (!rows.length) return sendError(res, 400, 'The file has no data rows.');

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const rowNum = i + 2;
      const code = String(r['Stone Code'] || '').trim();
      const name = String(r['Stone Name'] || '').trim();
      if (!code || !name) { skipped.push(`Row ${rowNum}: SKIPPED — Stone Code and Stone Name are both required.`); continue; }

      const existing = await db('tbl_gemstone_master').where('Stone_Code', code).first();
      if (existing) { skipped.push(`Row ${rowNum} (${code}): SKIPPED — Stone Code already exists, not overwritten.`); continue; }

      try {
        await db('tbl_gemstone_master').insert({
          Stone_Code: code, Stone_Name: name,
          Stone_Color: r['Color'] || null,
          Stone_Clarity: r['Clarity'] || null,
          Stone_Cut: r['Cut'] || null,
          Price_Per_Carat: r['Price Per Carat'] != null ? num(r['Price Per Carat']) : null,
          Is_Natural: bool(r['Is Natural'], true),
          Is_Lab_Grown: bool(r['Is Lab Grown'], false),
          Created_By: req.user.username,
        });
        imported++;
      } catch (insErr) {
        skipped.push(`Row ${rowNum} (${code}): SKIPPED — ${insErr.message}`);
      }
    }

    await auditLog({ tenantId: req.user.tenantId, userId: req.user.userId, tableName: 'tbl_gemstone_master', recordId: null, actionType: 'INSERT', description: `Excel import: ${imported} gemstones imported by ${req.user.username}`, req });
    return sendSuccess(res, { imported, skipped: skipped.length, warnings: 0, totalRows: rows.length, errors: skipped }, `Imported ${imported} of ${rows.length} rows.`);
  } catch (err) {
    return sendError(res, 500, 'Failed to process the file: ' + err.message);
  }
});

// ── POST /api/excel-import/vendors ────────────────────────────────────────────
// Tenant-scoped, unlike the 4 masters above. Vendor_Code is auto-generated
// (SUP1, SUP2... / KAR1, KAR2...) rather than required in the sheet — most
// shops importing a supplier/karigar list from an old system don't have a
// clean existing code scheme worth preserving.
router.post('/vendors', upload.single('file'), authenticate, requirePermission('tenant_management'), async (req, res) => {
  if (!req.file) return sendError(res, 400, 'No file uploaded.');
  const tenantId = req.user.tenantId;
  const skipped = [];
  let imported = 0;
  try {
    const rows = parseSheet(req.file.buffer);
    if (!rows.length) return sendError(res, 400, 'The file has no data rows.');

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const rowNum = i + 2;
      const name = String(r['Vendor Name'] || '').trim();
      const mobile = String(r['Mobile'] || '').replace(/\D/g, '');
      const vendorType = String(r['Vendor Type'] || '').trim();
      if (!name) { skipped.push(`Row ${rowNum}: SKIPPED — Vendor Name is required.`); continue; }
      if (!mobile || mobile.length < 10) { skipped.push(`Row ${rowNum} (${name}): SKIPPED — a valid Mobile number is required.`); continue; }
      if (!['Supplier', 'Karigar'].includes(vendorType)) { skipped.push(`Row ${rowNum} (${name}): SKIPPED — Vendor Type must be exactly "Supplier" or "Karigar".`); continue; }

      const existing = await db('tbl_vendor_master').where({ Tenant_ID: tenantId, Mobile_1: mobile }).first();
      if (existing) { skipped.push(`Row ${rowNum} (${name}): SKIPPED — mobile ${mobile} already exists, not overwritten.`); continue; }

      const prefix = vendorType === 'Supplier' ? 'SUP' : 'KAR';
      const lastOfType = await db('tbl_vendor_master').where({ Tenant_ID: tenantId, Vendor_Type: vendorType }).count('Vendor_ID as c').first();
      // lastOfType is a fresh COUNT run on every iteration, taken AFTER the
      // previous row in this same batch already committed its insert — so
      // it already reflects rows inserted earlier in this loop. Adding
      // `imported` on top here would double-count and skip numbers
      // (SUP1, SUP3, SUP5...) instead of a clean sequence.
      const vendorCode = `${prefix}${(parseInt(lastOfType.c) || 0) + 1}`;

      try {
        await db('tbl_vendor_master').insert({
          Tenant_ID: tenantId, Vendor_Type: vendorType, Vendor_Code: vendorCode, Vendor_Name: name,
          Contact_Person: r['Contact Person'] || null,
          Mobile_1: mobile,
          Email: r['Email'] || null,
          Address_Line1: r['Address'] || null,
          City: r['City'] || null,
          State: r['State'] || null,
          GST_No: r['GST No'] || null,
          Opening_Balance: r['Opening Balance'] != null ? num(r['Opening Balance']) : 0,
          Current_Balance: r['Opening Balance'] != null ? num(r['Opening Balance']) : 0,
          Is_Active: true,
          Created_By: req.user.username,
        });
        imported++;
      } catch (insErr) {
        skipped.push(`Row ${rowNum} (${name}): SKIPPED — ${insErr.message}`);
      }
    }

    await auditLog({ tenantId, userId: req.user.userId, tableName: 'tbl_vendor_master', recordId: null, actionType: 'INSERT', description: `Excel import: ${imported} vendors imported by ${req.user.username}`, req });
    return sendSuccess(res, { imported, skipped: skipped.length, warnings: 0, totalRows: rows.length, errors: skipped }, `Imported ${imported} of ${rows.length} rows.`);
  } catch (err) {
    return sendError(res, 500, 'Failed to process the file: ' + err.message);
  }
});

module.exports = router;
