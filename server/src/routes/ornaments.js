const router = require('express').Router();
const { body, query, validationResult } = require('express-validator');
const db = require('../db/tenantDb').tenantDb;
const { sendSuccess, sendError, sendValidationError } = require('../utils/response');
const { authenticate, requirePermission } = require('../middleware/auth');
const { generateArticleNumber } = require('../utils/invoiceNumber');
const { auditLog } = require('../utils/auditLogger');
const { modeFilter, modeVal, applyStockVisibility } = require('../utils/dataModeFilter');
const { requireValidBranch, withBranch, resolveBranchForInsert } = require('../utils/branchAccess');
const { isValidMetalType, getMetalTypes } = require('../utils/metalTypes');
const { attachOrnamentStatus } = require('../utils/ornamentStatus');

// ─── GET /api/ornaments  (with filters) ───────────────────────────────────────
router.get('/', authenticate, requireValidBranch, async (req, res) => {
  const {
    typeId, designId, purityId, metalType, isAvailable, isSold,
    minPrice, maxPrice, search, page = 1, limit = 50,
    classification, floorId, counterId, trayId,
  } = req.query;

  try {
    let qb = db('tbl_ornament_master as o')
      .leftJoin('tbl_item_type_master as t', 'o.Type_ID', 't.Type_ID')
      .leftJoin('tbl_design_master as d', 'o.Design_ID', 'd.Design_ID')
      .leftJoin('tbl_purity_master as p', 'o.Purity_ID', 'p.Purity_ID')
      // Added for the barcode/price tag label (see labelRenderer.js) — the
      // physical tag needs the floor location, supplier code, and an
      // approximate stone value, none of which tbl_ornament_master stores
      // directly (only their IDs).
      .leftJoin('tbl_floor_master as fl', 'o.Floor_ID', 'fl.Floor_ID')
      .leftJoin('tbl_vendor_master as v', 'o.Supplier_ID', 'v.Vendor_ID')
      .leftJoin('tbl_gemstone_master as g', 'o.Stone_ID', 'g.Stone_ID')
      .where('o.Is_Active', true)
      .where(function () {
        // Super admin sees all; others scoped to their tenant
        if (req.user.roleName !== 'Super Admin') {
          this.where('o.Tenant_ID', req.user.tenantId);
        }
      })
      .select(
        'o.*',
        't.Type_Name', 't.Type_Code',
        'd.Design_Name', 'd.Design_Code',
        'p.Purity_Code', 'p.Percentage as Purity_Percentage',
        'fl.Floor_Name', 'fl.Floor_Code',
        'v.Vendor_Code as Supplier_Code', 'v.Vendor_Name as Supplier_Name',
        // Stone value has no stored total anywhere — this is a computed
        // estimate (carat × the gemstone master's rate), not a stored
        // figure. Shown on the label as an estimate; correct the
        // gemstone's Price_Per_Carat if this doesn't match reality.
        db.raw('ROUND((o."Total_Stone_Carat" * COALESCE(g."Price_Per_Carat", 0))::numeric, 2) as "Stone_Value_Estimate"'),
        // Fine weight (pure-gold-equivalent weight) — previously not
        // tracked anywhere in the schema. Deliberately computed on read,
        // not stored: it's fully derived from Net_Gold_Weight × Purity%,
        // so a stored copy would just be one more place to go stale if
        // either value is ever corrected after the fact.
        db.raw('ROUND((o."Net_Gold_Weight" * COALESCE(p."Percentage", 100) / 100)::numeric, 3) as "Fine_Weight"')
      );
    // Same POS-billing exception as the barcode route above — a text
    // search used to add an item to a bill must still find Hidden/Special
    // stock; the normal browse/report callers of this same list endpoint
    // never send this and keep the original hide-it behavior.
    const stockVisOpts = { includeHidden: req.query.includeHidden === 'true' };
    qb = applyStockVisibility(qb, req, 'o', stockVisOpts);
    qb = withBranch(qb, req, 'o.Branch_ID');

    if (typeId) qb = qb.where('o.Type_ID', typeId);
    if (designId) qb = qb.where('o.Design_ID', designId);
    if (purityId) qb = qb.where('o.Purity_ID', purityId);
    if (metalType) qb = qb.where('o.Metal_Type', metalType);
    if (isAvailable !== undefined) qb = qb.where('o.Is_Stock_Available', isAvailable === 'true');
    if (isSold !== undefined) qb = qb.where('o.Is_Sold', isSold === 'true');
    if (minPrice) qb = qb.where('o.Total_Price', '>=', parseFloat(minPrice));
    if (maxPrice) qb = qb.where('o.Total_Price', '<=', parseFloat(maxPrice));
    // Special Stock Isolation — a pure display/operational filter (which
    // screen an item shows on), never an eligibility check: billing and
    // reports never look at this column, only this listing endpoint does.
    if (classification) qb = qb.where('o.Stock_Classification', classification);
    if (floorId) qb = qb.where('o.Floor_ID', floorId);
    if (counterId) qb = qb.where('o.Counter_ID', counterId);
    if (trayId) qb = qb.where('o.Tray_ID', trayId);
    if (search) {
      qb = qb.where(function () {
        this.where('o.Article_Number', 'ilike', `%${search}%`)
          .orWhere('t.Type_Name', 'ilike', `%${search}%`)
          .orWhere('d.Design_Name', 'ilike', `%${search}%`);
      });
    }

    const offset = (parseInt(page) - 1) * parseInt(limit);
    // Count using clean base query
    let countBase = db('tbl_ornament_master').where('Is_Active', true);
    countBase = applyStockVisibility(countBase, req, '', stockVisOpts);
    countBase = withBranch(countBase, req);
    if (req.user.roleName !== 'Super Admin') countBase.where('Tenant_ID', req.user.tenantId);
    if (typeId) countBase.where('Type_ID', typeId);
    if (metalType) countBase.where('Metal_Type', metalType);
    if (isAvailable !== undefined) countBase.where('Is_Stock_Available', isAvailable === 'true');
    if (isSold !== undefined) countBase.where('Is_Sold', isSold === 'true');
    if (classification) countBase.where('Stock_Classification', classification);
    if (floorId) countBase.where('Floor_ID', floorId);
    if (counterId) countBase.where('Counter_ID', counterId);
    if (trayId) countBase.where('Tray_ID', trayId);
    const [{ count }] = await countBase.count('Ornament_ID as count');
    const data = await qb.orderBy('o.Created_Date', 'desc').limit(parseInt(limit)).offset(offset);
    const items = await attachOrnamentStatus(data, req.user.tenantId);

    return sendSuccess(res, { items, total: parseInt(count), page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    console.error('Ornaments list error:', err);
    return sendError(res, 500, 'Failed to fetch ornaments.');
  }
});

// ─── GET /api/ornaments/barcode/:code ─────────────────────────────────────────
router.get('/barcode/:code', authenticate, async (req, res) => {
  try {
    let qb = db('tbl_ornament_master as o')
      .leftJoin('tbl_item_type_master as t', 'o.Type_ID', 't.Type_ID')
      .leftJoin('tbl_purity_master as p', 'o.Purity_ID', 'p.Purity_ID')
      .leftJoin('tbl_design_master as d', 'o.Design_ID', 'd.Design_ID')
      .where('o.Article_Number', req.params.code)
      .where('o.Tenant_ID', req.user.tenantId)
      .select('o.*', 't.Type_Name', 'p.Purity_Code', 'd.Design_Name',
        db.raw('ROUND((o."Net_Gold_Weight" * COALESCE(p."Percentage", 100) / 100)::numeric, 3) as "Fine_Weight"'));
    // POS scans a barcode to ADD it to a bill — Hidden/Special stock must
    // still be findable here (it's real, billable inventory, just kept
    // out of casual browsing/reports), so callers doing that pass
    // ?includeHidden=true. See applyStockVisibility's own comment.
    const ornament = await applyStockVisibility(qb, req, 'o', { includeHidden: req.query.includeHidden === 'true' }).first();

    if (!ornament) return sendError(res, 404, 'Ornament not found for this barcode.');
    return sendSuccess(res, ornament);
  } catch (err) {
    return sendError(res, 500, 'Barcode lookup failed.');
  }
});

// ─── GET /api/ornaments/stock-level ───────────────────────────────────────────
router.get('/stock-level', authenticate, async (req, res) => {
  try {
    let qb = db('tbl_ornament_master as o')
      .join('tbl_item_type_master as t', 'o.Type_ID', 't.Type_ID')
      .where('o.Tenant_ID', req.user.tenantId)
      .where('o.Is_Active', true)
      .where('o.Is_Sold', false)
      .whereRaw('"o"."Stock_Quantity" <= "o"."Min_Stock_Level"')
      .select('o.Ornament_ID', 'o.Article_Number', 'o.Stock_Quantity', 'o.Min_Stock_Level', 't.Type_Name')
      .orderBy('o.Stock_Quantity');
    qb = applyStockVisibility(qb, req, 'o');
    const alerts = await qb;
    return sendSuccess(res, alerts);
  } catch (err) {
    return sendError(res, 500, 'Failed to fetch stock alerts.');
  }
});

// ─── GET /api/ornaments/:id ───────────────────────────────────────────────────
router.get('/:id', authenticate, async (req, res) => {
  try {
    // Ornament_ID is a global (not per-tenant) auto-increment key — this
    // route used to have NO Tenant_ID filter at all, so any authenticated
    // user of ANY tenant could fetch any OTHER tenant's ornament (cost,
    // supplier, hallmark, hidden location — everything) just by trying
    // numeric IDs. applyStockVisibility also keeps a hidden item's detail
    // out of Official/Practice mode, matching the list/search/barcode
    // routes above (Super Admin keeps the cross-tenant view, same
    // bypass the list route already uses).
    let qb = db('tbl_ornament_master as o')
      .leftJoin('tbl_item_type_master as t', 'o.Type_ID', 't.Type_ID')
      .leftJoin('tbl_purity_master as p', 'o.Purity_ID', 'p.Purity_ID')
      .leftJoin('tbl_design_master as d', 'o.Design_ID', 'd.Design_ID')
      .leftJoin('tbl_gemstone_master as g', 'o.Stone_ID', 'g.Stone_ID')
      .leftJoin('tbl_floor_master as fl', 'o.Floor_ID', 'fl.Floor_ID')
      .leftJoin('tbl_vendor_master as v', 'o.Supplier_ID', 'v.Vendor_ID')
      .where({ 'o.Ornament_ID': req.params.id })
      .select(
        'o.*', 't.Type_Name', 'p.Purity_Code', 'd.Design_Name', 'd.Design_Code', 'g.Stone_Name',
        'fl.Floor_Name', 'fl.Floor_Code', 'v.Vendor_Code as Supplier_Code', 'v.Vendor_Name as Supplier_Name',
        // See the /GET list route above for why this is an estimate, not a stored value.
        db.raw('ROUND((o."Total_Stone_Carat" * COALESCE(g."Price_Per_Carat", 0))::numeric, 2) as "Stone_Value_Estimate"'),
        db.raw('ROUND((o."Net_Gold_Weight" * COALESCE(p."Percentage", 100) / 100)::numeric, 3) as "Fine_Weight"')
      );
    if (req.user.roleName !== 'Super Admin') {
      qb = qb.where('o.Tenant_ID', req.user.tenantId);
      qb = applyStockVisibility(qb, req, 'o');
    }
    const ornament = await qb.first();

    if (!ornament) return sendError(res, 404, 'Ornament not found.');
    const [withStatus] = await attachOrnamentStatus([ornament], ornament.Tenant_ID);
    return sendSuccess(res, withStatus);
  } catch (err) {
    return sendError(res, 500, 'Failed to fetch ornament.');
  }
});

// ─── POST /api/ornaments ──────────────────────────────────────────────────────
router.post('/', authenticate, requireValidBranch, [
  body('Gross_Weight').isFloat({ min: 0.001 }).withMessage('Gross weight required'),
  // Net_Gold_Weight/Current_Gold_Rate are allowed to be 0 — a predominantly-
  // Diamond stock item (e.g. a loose diamond parcel) has no gold content
  // at all, so requiring a non-zero gold weight/rate would make it
  // impossible to save. Gold/Silver/Platinum items still enter their real
  // weight and rate here as before.
  body('Net_Gold_Weight').isFloat({ min: 0 }).withMessage('Net gold weight required'),
  body('Current_Gold_Rate').isFloat({ min: 0 }).withMessage('Gold rate required'),
  body('Base_Making_Charge_Per_Gram').isFloat({ min: 0 }).withMessage('Making charge required'),
  body('Purchase_Cost').isFloat({ min: 0 }).withMessage('Purchase cost required'),
  body('Metal_Type').custom(async (value) => {
    if (!(await isValidMetalType(value))) throw new Error(`Metal type must be one of: ${(await getMetalTypes()).join(', ')}`);
    return true;
  }),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return sendValidationError(res, errors.array());

  try {
    const tenantId = req.user.tenantId;
    const articleNumber = req.body.Article_Number || await generateArticleNumber(tenantId);

    // Calculate derived fields
    const grossWeight = parseFloat(req.body.Gross_Weight);
    const netGoldWeight = parseFloat(req.body.Net_Gold_Weight);
    const goldRate = parseFloat(req.body.Current_Gold_Rate);
    const makingChargePerGram = parseFloat(req.body.Base_Making_Charge_Per_Gram);
    const wastagePercent = parseFloat(req.body.Wastage_Percentage || 3);
    const discountPercent = parseFloat(req.body.Discount_Percentage || 0);

    // HSN was only ever resolved via a live join at report time — never
    // actually captured on the ornament itself, so a later edit to the
    // item type's HSN code would silently rewrite tax history for every
    // item of that type, sold or not. Snapshotted here instead, same as
    // every other tax-relevant attribute already is at creation time.
    let hsnCode = req.body.HSN_Code || null;
    if (!hsnCode && req.body.Type_ID) {
      const itemType = await db('tbl_item_type_master').where({ Type_ID: req.body.Type_ID }).first('HSN_Code');
      hsnCode = itemType?.HSN_Code || null;
    }

    const wastageWeight = (netGoldWeight * wastagePercent) / 100;
    const wastageAmount = wastageWeight * goldRate;
    const goldValue = netGoldWeight * goldRate;
    const makingChargeTotal = netGoldWeight * makingChargePerGram;
    const discountAmount = ((goldValue + makingChargeTotal + wastageAmount) * discountPercent) / 100;
    const taxableValue = goldValue + makingChargeTotal + wastageAmount - discountAmount;
    const gstPercent = parseFloat(req.body.GST_Percentage || 3);
    const gstAmount = (taxableValue * gstPercent) / 100;
    const totalPrice = taxableValue + gstAmount;

    const [ornament] = await db('tbl_ornament_master').insert({
      ...req.body,
      Tenant_ID: tenantId,
      // Multi-Branch Management — see utils/branchAccess.js.
      Branch_ID: resolveBranchForInsert(req, req.body.Branch_ID),
      Article_Number: articleNumber,
      Wastage_Weight: wastageWeight,
      Wastage_Amount: wastageAmount,
      Final_Making_Charge_Total: makingChargeTotal,
      Discount_Amount: discountAmount,
      Taxable_Value: taxableValue,
      GST_Amount: gstAmount,
      Total_Price: totalPrice,
      HSN_Code: hsnCode,
      Data_Mode: modeVal(req),
      Created_By: req.user.username,
    }).returning('*');

    await auditLog({ tenantId, userId: req.user.userId, tableName: 'tbl_ornament_master', recordId: ornament.Ornament_ID, actionType: 'INSERT', newData: ornament, req });

    return sendSuccess(res, ornament, 'Ornament added successfully.', 201);
  } catch (err) {
    console.error('Add ornament error:', err);
    if (err.code === '23505') return sendError(res, 409, 'Article number already exists.');
    return sendError(res, 500, 'Failed to add ornament.');
  }
});

// ─── PUT /api/ornaments/catalog-visibility — bulk hide/show in catalog ────────
// Only touches Show_In_Catalog — does NOT affect Is_Active, Is_Hidden,
// Is_Stock_Available, or Data_Mode, so billing (sales.js), inventory counts,
// and GST/sales reports are completely unaffected either way. This is a
// catalog-display toggle, not an accounting-book operation.
// MUST be registered before PUT /:id below — Express matches routes in
// registration order, and '/:id' matches literally any path segment
// (including the string "catalog-visibility"), so this would otherwise
// never be reached and every call would silently hit the generic
// single-item update instead (and 500, since Ornament_ID is an integer
// column and "catalog-visibility" isn't a valid integer for it).
router.put('/catalog-visibility', authenticate, [
  body('ornamentIds').isArray({ min: 1 }).withMessage('ornamentIds must be a non-empty array.'),
  body('showInCatalog').isBoolean().withMessage('showInCatalog must be true or false.'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return sendValidationError(res, errors.array());

  const { ornamentIds, showInCatalog } = req.body;
  try {
    const updated = await db('tbl_ornament_master')
      .where('Tenant_ID', req.user.tenantId)
      .whereIn('Ornament_ID', ornamentIds)
      .update({
        Show_In_Catalog: showInCatalog,
        Last_Updated_By: req.user.username,
        Last_Updated_Date: new Date(),
      })
      .returning(['Ornament_ID', 'Article_Number']);

    await auditLog({
      tenantId: req.user.tenantId, userId: req.user.userId, tableName: 'tbl_ornament_master',
      recordId: null, actionType: showInCatalog ? 'CATALOG_SHOW' : 'CATALOG_HIDE',
      oldData: null, newData: { ornamentIds, showInCatalog, count: updated.length }, req,
    });

    return sendSuccess(res, { updatedCount: updated.length, items: updated },
      `${updated.length} item(s) ${showInCatalog ? 'restored to' : 'hidden from'} the catalog.`);
  } catch (err) {
    console.error('Catalog visibility update error:', err.message);
    return sendError(res, 500, 'Failed to update catalog visibility.');
  }
});

// ─── PUT /api/ornaments/stock-classification — Special Stock Isolation ───────
// Bulk item-level classify (Normal <-> Special), by explicit Ornament_IDs.
// This is an OPERATIONAL/DISPLAY tag only — which screen an item shows up on
// by default. It never touches Is_Active/Is_Hidden/Is_Sold/Data_Mode/
// Show_In_Catalog, so billing (sales.js), GST/accounting, and every report
// stay completely unaffected: a Special Stock item bills through the exact
// same POST /api/sales/create, same invoice numbering, same everything.
// One inventory ledger, one barcode, one accounting system — see this
// migration's own header comment (20260826000000_add_stock_classification.js).
// Registered ahead of PUT /:id below for the same reason the earlier
// /catalog-visibility route was: Express matches '/:id' against literally
// any path segment, including this one's name.
router.put('/stock-classification', authenticate, requirePermission('tenant_management'), [
  body('ornamentIds').isArray({ min: 1 }).withMessage('ornamentIds must be a non-empty array.'),
  body('classification').isIn(['Normal', 'Special']).withMessage('classification must be Normal or Special.'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return sendValidationError(res, errors.array());

  const { ornamentIds, classification, specialType, reason } = req.body;
  try {
    const before = await db('tbl_ornament_master')
      .where('Tenant_ID', req.user.tenantId).whereIn('Ornament_ID', ornamentIds)
      .select('Ornament_ID', 'Article_Number', 'Stock_Classification', 'Special_Stock_Type');

    const updated = await db('tbl_ornament_master')
      .where('Tenant_ID', req.user.tenantId)
      .whereIn('Ornament_ID', ornamentIds)
      .update({
        Stock_Classification: classification,
        Special_Stock_Type: classification === 'Special' ? (specialType || null) : null,
        Last_Updated_By: req.user.username,
        Last_Updated_Date: new Date(),
      })
      .returning(['Ornament_ID', 'Article_Number']);

    await auditLog({
      tenantId: req.user.tenantId, userId: req.user.userId, tableName: 'tbl_ornament_master',
      recordId: null, actionType: 'STOCK_CLASSIFY',
      oldData: before, newData: { ornamentIds, classification, specialType: specialType || null, count: updated.length },
      description: reason || null, req,
    });

    return sendSuccess(res, { updatedCount: updated.length, items: updated },
      `${updated.length} item(s) classified as ${classification} Stock.`);
  } catch (err) {
    console.error('Stock classification update error:', err.message);
    return sendError(res, 500, 'Failed to update stock classification.');
  }
});

// ─── PUT /api/ornaments/stock-classification/by-location ─────────────────────
// Bulk classify EVERY currently-active item under a given floor/counter/tray
// in one call — sections 11-13 of the spec (counter-level, tray-level,
// floor-level selection). Uses the SAME Floor_ID/Counter_ID/Tray_ID location
// hierarchy the Floor Management module already has; no new location tables.
router.put('/stock-classification/by-location', authenticate, requirePermission('tenant_management'), [
  body('classification').isIn(['Normal', 'Special']).withMessage('classification must be Normal or Special.'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return sendValidationError(res, errors.array());

  const { floorId, counterId, trayId, classification, specialType, reason } = req.body;
  if (!floorId && !counterId && !trayId) {
    return sendError(res, 400, 'At least one of floorId, counterId, or trayId is required.');
  }
  try {
    let qb = db('tbl_ornament_master').where('Tenant_ID', req.user.tenantId).where('Is_Active', true);
    if (floorId) qb = qb.where('Floor_ID', floorId);
    if (counterId) qb = qb.where('Counter_ID', counterId);
    if (trayId) qb = qb.where('Tray_ID', trayId);

    const before = await qb.clone().select('Ornament_ID', 'Article_Number', 'Stock_Classification', 'Special_Stock_Type');
    if (!before.length) return sendError(res, 400, 'No active stock found at that location.');

    const updated = await qb.update({
      Stock_Classification: classification,
      Special_Stock_Type: classification === 'Special' ? (specialType || null) : null,
      Last_Updated_By: req.user.username,
      Last_Updated_Date: new Date(),
    }).returning(['Ornament_ID', 'Article_Number']);

    await auditLog({
      tenantId: req.user.tenantId, userId: req.user.userId, tableName: 'tbl_ornament_master',
      recordId: null, actionType: 'STOCK_CLASSIFY',
      oldData: before, newData: { floorId, counterId, trayId, classification, specialType: specialType || null, count: updated.length },
      description: reason || null, req,
    });

    return sendSuccess(res, { updatedCount: updated.length, items: updated },
      `${updated.length} item(s) at that location classified as ${classification} Stock.`);
  } catch (err) {
    console.error('Stock classification by-location error:', err.message);
    return sendError(res, 500, 'Failed to update stock classification.');
  }
});

// ─── PUT /api/ornaments/:id ───────────────────────────────────────────────────
// requirePermission('inventory') + Tenant_ID on both the read and the
// write — this route used to have neither, so any authenticated user of
// ANY tenant could rewrite another tenant's stock (weights, rates,
// prices) by guessing a numeric Ornament_ID, the same class of bug
// GET /:id above was already hardened against.
router.put('/:id', authenticate, requirePermission('inventory'), async (req, res) => {
  try {
    const old = await db('tbl_ornament_master').where({ Ornament_ID: req.params.id, Tenant_ID: req.user.tenantId }).first();
    if (!old) return sendError(res, 404, 'Ornament not found.');

    // Is_Hidden/Data_Mode must never be settable through this generic
    // update — hiding has its own voucher flow (POST /api/transfer/hide|
    // unhide) that requires a hidden location + reason and leaves a proper
    // audit trail; Data_Mode is fixed at creation. Without this guard a
    // plain PUT could flip an item hidden/visible with no location, no
    // reason, and none of the reporting consequences that flow from it.
    // Stock_Classification/Special_Stock_Type have their own dedicated,
    // permission-gated, audit-logged endpoint (PUT /stock-classification[/
    // by-location] above) for the same reason — every classification
    // change must leave a real audit record per the Special Stock spec's
    // own requirement, which a silent field on this generic update would bypass.
    // Tenant_ID also stripped here — belt and suspenders on top of the
    // Tenant_ID-scoped WHERE clause below, so this can never move a row
    // to another tenant even if the WHERE were ever loosened by accident.
    const { Is_Hidden, Data_Mode, Hidden_Location_ID, Hidden_By, Hidden_Date, Hidden_Reason, Restored_By, Restored_Date, Stock_Classification, Special_Stock_Type, Tenant_ID, ...safeBody } = req.body;

    const [updated] = await db('tbl_ornament_master')
      .where({ Ornament_ID: req.params.id, Tenant_ID: req.user.tenantId })
      .update({ ...safeBody, Last_Updated_By: req.user.username, Last_Updated_Date: new Date() })
      .returning('*');

    await auditLog({ tenantId: req.user.tenantId, userId: req.user.userId, tableName: 'tbl_ornament_master', recordId: req.params.id, actionType: 'UPDATE', oldData: old, newData: updated, req });

    return sendSuccess(res, updated, 'Ornament updated.');
  } catch (err) {
    return sendError(res, 500, 'Failed to update ornament.');
  }
});

module.exports = router;
