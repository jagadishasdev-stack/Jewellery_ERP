const router = require('express').Router();
const { body, query, validationResult } = require('express-validator');
const db = require('../db/tenantDb').tenantDb;
const { sendSuccess, sendError, sendValidationError } = require('../utils/response');
const { authenticate } = require('../middleware/auth');
const { generateArticleNumber } = require('../utils/invoiceNumber');
const { auditLog } = require('../utils/auditLogger');
const { modeFilter, modeVal, applyStockVisibility } = require('../utils/dataModeFilter');
const { METAL_TYPES } = require('../utils/metalTypes');

// ─── GET /api/ornaments  (with filters) ───────────────────────────────────────
router.get('/', authenticate, async (req, res) => {
  const {
    typeId, designId, purityId, metalType, isAvailable, isSold,
    minPrice, maxPrice, search, page = 1, limit = 50,
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
        db.raw('ROUND((o."Total_Stone_Carat" * COALESCE(g."Price_Per_Carat", 0))::numeric, 2) as "Stone_Value_Estimate"')
      );
    qb = applyStockVisibility(qb, req, 'o');

    if (typeId) qb = qb.where('o.Type_ID', typeId);
    if (designId) qb = qb.where('o.Design_ID', designId);
    if (purityId) qb = qb.where('o.Purity_ID', purityId);
    if (metalType) qb = qb.where('o.Metal_Type', metalType);
    if (isAvailable !== undefined) qb = qb.where('o.Is_Stock_Available', isAvailable === 'true');
    if (isSold !== undefined) qb = qb.where('o.Is_Sold', isSold === 'true');
    if (minPrice) qb = qb.where('o.Total_Price', '>=', parseFloat(minPrice));
    if (maxPrice) qb = qb.where('o.Total_Price', '<=', parseFloat(maxPrice));
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
    countBase = applyStockVisibility(countBase, req);
    if (req.user.roleName !== 'Super Admin') countBase.where('Tenant_ID', req.user.tenantId);
    if (typeId) countBase.where('Type_ID', typeId);
    if (metalType) countBase.where('Metal_Type', metalType);
    if (isAvailable !== undefined) countBase.where('Is_Stock_Available', isAvailable === 'true');
    if (isSold !== undefined) countBase.where('Is_Sold', isSold === 'true');
    const [{ count }] = await countBase.count('Ornament_ID as count');
    const data = await qb.orderBy('o.Created_Date', 'desc').limit(parseInt(limit)).offset(offset);

    return sendSuccess(res, { items: data, total: parseInt(count), page: parseInt(page), limit: parseInt(limit) });
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
      .select('o.*', 't.Type_Name', 'p.Purity_Code', 'd.Design_Name');
    const ornament = await applyStockVisibility(qb, req, 'o').first();

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
        db.raw('ROUND((o."Total_Stone_Carat" * COALESCE(g."Price_Per_Carat", 0))::numeric, 2) as "Stone_Value_Estimate"')
      );
    if (req.user.roleName !== 'Super Admin') {
      qb = qb.where('o.Tenant_ID', req.user.tenantId);
      qb = applyStockVisibility(qb, req, 'o');
    }
    const ornament = await qb.first();

    if (!ornament) return sendError(res, 404, 'Ornament not found.');
    return sendSuccess(res, ornament);
  } catch (err) {
    return sendError(res, 500, 'Failed to fetch ornament.');
  }
});

// ─── POST /api/ornaments ──────────────────────────────────────────────────────
router.post('/', authenticate, [
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
  body('Metal_Type').isIn(METAL_TYPES).withMessage(`Metal type must be one of: ${METAL_TYPES.join(', ')}`),
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
      Article_Number: articleNumber,
      Wastage_Weight: wastageWeight,
      Wastage_Amount: wastageAmount,
      Final_Making_Charge_Total: makingChargeTotal,
      Discount_Amount: discountAmount,
      Taxable_Value: taxableValue,
      GST_Amount: gstAmount,
      Total_Price: totalPrice,
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

// ─── PUT /api/ornaments/:id ───────────────────────────────────────────────────
router.put('/:id', authenticate, async (req, res) => {
  try {
    const old = await db('tbl_ornament_master').where({ Ornament_ID: req.params.id }).first();
    if (!old) return sendError(res, 404, 'Ornament not found.');

    // Is_Hidden/Data_Mode must never be settable through this generic
    // update — hiding has its own voucher flow (POST /api/transfer/hide|
    // unhide) that requires a hidden location + reason and leaves a proper
    // audit trail; Data_Mode is fixed at creation. Without this guard a
    // plain PUT could flip an item hidden/visible with no location, no
    // reason, and none of the reporting consequences that flow from it.
    const { Is_Hidden, Data_Mode, Hidden_Location_ID, Hidden_By, Hidden_Date, Hidden_Reason, Restored_By, Restored_Date, ...safeBody } = req.body;

    const [updated] = await db('tbl_ornament_master')
      .where({ Ornament_ID: req.params.id })
      .update({ ...safeBody, Last_Updated_By: req.user.username, Last_Updated_Date: new Date() })
      .returning('*');

    await auditLog({ tenantId: req.user.tenantId, userId: req.user.userId, tableName: 'tbl_ornament_master', recordId: req.params.id, actionType: 'UPDATE', oldData: old, newData: updated, req });

    return sendSuccess(res, updated, 'Ornament updated.');
  } catch (err) {
    return sendError(res, 500, 'Failed to update ornament.');
  }
});

module.exports = router;
