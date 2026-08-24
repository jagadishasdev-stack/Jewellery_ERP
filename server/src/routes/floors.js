const router = require('express').Router();
const { body, validationResult } = require('express-validator');
const db = require('../db/tenantDb').tenantDb;
const { sendSuccess, sendError, sendValidationError } = require('../utils/response');
const { authenticate, requirePermission } = require('../middleware/auth');
const { auditLog } = require('../utils/auditLogger');
const { applyStockVisibility, modeVal } = require('../utils/dataModeFilter');
const dayjs = require('dayjs');

// ── GET /api/floors  ──────────────────────────────────────────────────────────
router.get('/', authenticate, async (req, res) => {
  const { branchId } = req.query;
  try {
    let qb = db('tbl_floor_master as f')
      .leftJoin('tbl_branch_master as b', 'f.Branch_ID', 'b.Branch_ID')
      .where('f.Tenant_ID', req.user.tenantId)
      .where('f.Is_Active', true)
      .select('f.*', 'b.Branch_Name')
      .orderBy('f.Branch_ID').orderBy('f.Floor_Number');
    if (branchId) qb = qb.where('f.Branch_ID', branchId);
    return sendSuccess(res, await qb);
  } catch (err) { return sendError(res, 500, 'Failed to fetch floors.'); }
});

// ── POST /api/floors  ─────────────────────────────────────────────────────────
router.post('/', authenticate, [
  body('Branch_ID').notEmpty(),
  body('Floor_Code').notEmpty(),
  body('Floor_Name').notEmpty(),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return sendValidationError(res, errors.array());
  try {
    const [floor] = await db('tbl_floor_master').insert({
      ...req.body, Tenant_ID: req.user.tenantId, Created_By: req.user.username,
    }).returning('*');
    return sendSuccess(res, floor, 'Floor created.', 201);
  } catch (err) {
    if (err.code === '23505') return sendError(res, 409, 'Floor code already exists for this branch.');
    return sendError(res, 500, 'Failed to create floor.');
  }
});

// ── PUT /api/floors/:id  ──────────────────────────────────────────────────────
router.put('/:id', authenticate, [
  body('Floor_Name').notEmpty(),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return sendValidationError(res, errors.array());
  try {
    const { Floor_Name, Floor_Number, Description, Is_Active } = req.body;
    const [floor] = await db('tbl_floor_master')
      .where({ Floor_ID: req.params.id, Tenant_ID: req.user.tenantId })
      .update({ Floor_Name, Floor_Number, Description, Is_Active })
      .returning('*');
    if (!floor) return sendError(res, 404, 'Floor not found.');
    return sendSuccess(res, floor, 'Floor updated.');
  } catch (err) { return sendError(res, 500, 'Failed to update floor.'); }
});

// ── DELETE /api/floors/:id  ───────────────────────────────────────────────────
// Soft delete only — floors may already have counters/stock referencing them.
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const [floor] = await db('tbl_floor_master')
      .where({ Floor_ID: req.params.id, Tenant_ID: req.user.tenantId })
      .update({ Is_Active: false })
      .returning('*');
    if (!floor) return sendError(res, 404, 'Floor not found.');
    return sendSuccess(res, null, 'Floor deactivated.');
  } catch (err) { return sendError(res, 500, 'Failed to delete floor.'); }
});

// ── GET /api/floors/:id/counters  ─────────────────────────────────────────────
router.get('/:id/counters', authenticate, async (req, res) => {
  try {
    const counters = await db('tbl_counter_master')
      .where({ Floor_ID: req.params.id, Tenant_ID: req.user.tenantId, Is_Active: true })
      .orderBy('Counter_Code');
    return sendSuccess(res, counters);
  } catch (err) { return sendError(res, 500, 'Failed to fetch counters.'); }
});

// ── POST /api/floors/counters  ────────────────────────────────────────────────
router.post('/counters', authenticate, [
  body('Floor_ID').isInt(),
  body('Branch_ID').notEmpty(),
  body('Counter_Code').notEmpty(),
  body('Counter_Name').notEmpty(),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return sendValidationError(res, errors.array());
  try {
    const [counter] = await db('tbl_counter_master').insert({
      ...req.body, Tenant_ID: req.user.tenantId, Created_By: req.user.username,
    }).returning('*');
    return sendSuccess(res, counter, 'Counter created.', 201);
  } catch (err) {
    if (err.code === '23505') return sendError(res, 409, 'Counter code already exists.');
    return sendError(res, 500, 'Failed to create counter.');
  }
});

// ── PUT /api/floors/counters/:id  ─────────────────────────────────────────────
router.put('/counters/:id', authenticate, [
  body('Counter_Name').notEmpty(),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return sendValidationError(res, errors.array());
  try {
    const { Counter_Name, Counter_Type, Capacity, Is_Active } = req.body;
    const [counter] = await db('tbl_counter_master')
      .where({ Counter_ID: req.params.id, Tenant_ID: req.user.tenantId })
      .update({ Counter_Name, Counter_Type, Capacity, Is_Active })
      .returning('*');
    if (!counter) return sendError(res, 404, 'Counter not found.');
    return sendSuccess(res, counter, 'Counter updated.');
  } catch (err) { return sendError(res, 500, 'Failed to update counter.'); }
});

// ── DELETE /api/floors/counters/:id  ──────────────────────────────────────────
router.delete('/counters/:id', authenticate, async (req, res) => {
  try {
    const [counter] = await db('tbl_counter_master')
      .where({ Counter_ID: req.params.id, Tenant_ID: req.user.tenantId })
      .update({ Is_Active: false })
      .returning('*');
    if (!counter) return sendError(res, 404, 'Counter not found.');
    return sendSuccess(res, null, 'Counter deactivated.');
  } catch (err) { return sendError(res, 500, 'Failed to delete counter.'); }
});

// ── GET /api/floors/counters/:id/trays  ───────────────────────────────────────
router.get('/counters/:id/trays', authenticate, async (req, res) => {
  try {
    const trays = await db('tbl_tray_master')
      .where({ Counter_ID: req.params.id, Tenant_ID: req.user.tenantId, Is_Active: true })
      .orderBy('Tray_Code');
    return sendSuccess(res, trays);
  } catch (err) { return sendError(res, 500, 'Failed to fetch trays.'); }
});

// ── POST /api/floors/trays  ───────────────────────────────────────────────────
router.post('/trays', authenticate, [
  body('Floor_ID').isInt(),
  body('Counter_ID').isInt(),
  body('Branch_ID').notEmpty(),
  body('Tray_Code').notEmpty(),
  body('Tray_Name').notEmpty(),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return sendValidationError(res, errors.array());
  try {
    const [tray] = await db('tbl_tray_master').insert({
      ...req.body, Tenant_ID: req.user.tenantId, Created_By: req.user.username,
    }).returning('*');
    return sendSuccess(res, tray, 'Tray created.', 201);
  } catch (err) {
    if (err.code === '23505') return sendError(res, 409, 'Tray code already exists for this counter.');
    return sendError(res, 500, 'Failed to create tray.');
  }
});

// ── PUT /api/floors/trays/:id  ────────────────────────────────────────────────
router.put('/trays/:id', authenticate, [
  body('Tray_Name').notEmpty(),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return sendValidationError(res, errors.array());
  try {
    const { Tray_Name, Capacity, Is_Active } = req.body;
    const [tray] = await db('tbl_tray_master')
      .where({ Tray_ID: req.params.id, Tenant_ID: req.user.tenantId })
      .update({ Tray_Name, Capacity, Is_Active })
      .returning('*');
    if (!tray) return sendError(res, 404, 'Tray not found.');
    return sendSuccess(res, tray, 'Tray updated.');
  } catch (err) { return sendError(res, 500, 'Failed to update tray.'); }
});

// ── DELETE /api/floors/trays/:id  ─────────────────────────────────────────────
router.delete('/trays/:id', authenticate, async (req, res) => {
  try {
    const [tray] = await db('tbl_tray_master')
      .where({ Tray_ID: req.params.id, Tenant_ID: req.user.tenantId })
      .update({ Is_Active: false })
      .returning('*');
    if (!tray) return sendError(res, 404, 'Tray not found.');
    return sendSuccess(res, null, 'Tray deactivated.');
  } catch (err) { return sendError(res, 500, 'Failed to delete tray.'); }
});

// ── GET /api/floors/hidden-locations  ─────────────────────────────────────────
router.get('/hidden-locations', authenticate, requirePermission('tenant_management'), async (req, res) => {
  try {
    const locations = await db('tbl_hidden_location_master')
      .where({ Tenant_ID: req.user.tenantId, Is_Active: true })
      .orderBy('Location_Name');
    return sendSuccess(res, locations);
  } catch (err) { return sendError(res, 500, 'Failed to fetch hidden locations.'); }
});

// ── POST /api/floors/hidden-locations  ────────────────────────────────────────
router.post('/hidden-locations', authenticate, requirePermission('tenant_management'), [
  body('Location_Code').notEmpty(),
  body('Location_Name').notEmpty(),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return sendValidationError(res, errors.array());
  try {
    const { Location_Code, Location_Name, Description } = req.body;
    const [location] = await db('tbl_hidden_location_master').insert({
      Location_Code, Location_Name, Description,
      Tenant_ID: req.user.tenantId, Created_By: req.user.username,
    }).returning('*');

    await auditLog({
      tenantId: req.user.tenantId, userId: req.user.userId, tableName: 'tbl_hidden_location_master',
      recordId: location.Hidden_Location_ID, actionType: 'INSERT',
      description: `Hidden location "${Location_Name}" created`, req,
    });

    return sendSuccess(res, location, 'Hidden location created.', 201);
  } catch (err) {
    if (err.code === '23505') return sendError(res, 409, 'Location code already exists.');
    return sendError(res, 500, 'Failed to create hidden location.');
  }
});

// ── PUT /api/floors/hidden-locations/:id  ─────────────────────────────────────
router.put('/hidden-locations/:id', authenticate, requirePermission('tenant_management'), [
  body('Location_Name').notEmpty(),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return sendValidationError(res, errors.array());
  try {
    const { Location_Name, Description, Is_Active } = req.body;
    const [location] = await db('tbl_hidden_location_master')
      .where({ Hidden_Location_ID: req.params.id, Tenant_ID: req.user.tenantId })
      .update({ Location_Name, Description, Is_Active })
      .returning('*');
    if (!location) return sendError(res, 404, 'Hidden location not found.');

    await auditLog({
      tenantId: req.user.tenantId, userId: req.user.userId, tableName: 'tbl_hidden_location_master',
      recordId: location.Hidden_Location_ID, actionType: 'UPDATE',
      description: `Hidden location "${Location_Name}" updated`, req,
    });

    return sendSuccess(res, location, 'Hidden location updated.');
  } catch (err) { return sendError(res, 500, 'Failed to update hidden location.'); }
});

// ── DELETE /api/floors/hidden-locations/:id  ──────────────────────────────────
router.delete('/hidden-locations/:id', authenticate, requirePermission('tenant_management'), async (req, res) => {
  try {
    const inUse = await db('tbl_ornament_master')
      .where({ Hidden_Location_ID: req.params.id, Is_Hidden: true }).first();
    if (inUse) return sendError(res, 400, 'Cannot delete a hidden location that still has hidden stock assigned to it.');

    const [location] = await db('tbl_hidden_location_master')
      .where({ Hidden_Location_ID: req.params.id, Tenant_ID: req.user.tenantId })
      .update({ Is_Active: false })
      .returning('*');
    if (!location) return sendError(res, 404, 'Hidden location not found.');
    return sendSuccess(res, null, 'Hidden location deactivated.');
  } catch (err) { return sendError(res, 500, 'Failed to delete hidden location.'); }
});

// ── GET /api/floors/hidden-stock  ─────────────────────────────────────────────
// Lists currently-hidden stock with its floor/counter/tray/hidden-location breakdown.
// Details never surface in Official mode — only visible after switching to
// Unofficial (Ctrl+F5), even for admins with the permission to manage hiding.
router.get('/hidden-stock', authenticate, requirePermission('tenant_management'), async (req, res) => {
  if (modeVal(req) !== 2) {
    return sendError(res, 403, 'Hidden stock details are only visible in Unofficial mode.');
  }
  try {
    const items = await db('tbl_ornament_master as o')
      .leftJoin('tbl_item_type_master as t', 'o.Type_ID', 't.Type_ID')
      .leftJoin('tbl_floor_master as fl', 'o.Floor_ID', 'fl.Floor_ID')
      .leftJoin('tbl_counter_master as c', 'o.Counter_ID', 'c.Counter_ID')
      .leftJoin('tbl_tray_master as tr', 'o.Tray_ID', 'tr.Tray_ID')
      .leftJoin('tbl_hidden_location_master as h', 'o.Hidden_Location_ID', 'h.Hidden_Location_ID')
      // Is_Hidden is never cleared when a hidden item is sold (see
      // /reports/hidden-stock-sales below — that's what still lets a sold
      // item be identified as "was hidden"), so without this Is_Sold
      // filter a sold item stayed on this "currently hidden" list forever,
      // even though it's gone from the shop and the numeric hidden_count
      // above already correctly stopped counting it once sold.
      // Data_Mode IN (2,3) — same rule applyStockVisibility uses for
      // Unofficial mode — so Practice/Dummy-mode test stock (Data_Mode=1)
      // can never leak into this real business report, matching every
      // other stock-visibility query in the app.
      .where('o.Tenant_ID', req.user.tenantId).where('o.Is_Hidden', true).where('o.Is_Sold', false)
      .whereIn('o.Data_Mode', [2, 3])
      .select(
        'o.Ornament_ID', 'o.Article_Number', 'o.Gross_Weight', 'o.Total_Price', 't.Type_Name',
        'fl.Floor_Name', 'c.Counter_Name', 'tr.Tray_Name', 'h.Location_Name as Hidden_Location_Name',
        'o.Hidden_By', 'o.Hidden_Date', 'o.Hidden_Reason'
      )
      .orderBy('o.Hidden_Date', 'desc');
    return sendSuccess(res, items);
  } catch (err) { return sendError(res, 500, 'Failed to fetch hidden stock.'); }
});

// ── GET /api/floors/reports/hidden-stock-sales  ───────────────────────────────
// "If 10 pieces of hidden stock sold today, show those 10 in their own
// report" — Is_Hidden is deliberately never cleared when a hidden item
// sells (see /hidden-stock above), which is exactly what makes an item
// identifiable here as "was hidden stock" after the fact. Same
// Unofficial-only gate as its siblings; defaults to today if no range given.
router.get('/reports/hidden-stock-sales', authenticate, requirePermission('tenant_management'), async (req, res) => {
  if (modeVal(req) !== 2) {
    return sendError(res, 403, 'Hidden stock details are only visible in Unofficial mode.');
  }
  const fromDate = req.query.fromDate || dayjs().format('YYYY-MM-DD');
  const toDate = req.query.toDate || dayjs().format('YYYY-MM-DD');
  try {
    let qb = db('tbl_ornament_master as o')
      .join('tbl_sales_details as sd', 'o.Ornament_ID', 'sd.Ornament_ID')
      .join('tbl_sales_header as sh', 'sd.Sale_ID', 'sh.Sale_ID')
      .leftJoin('tbl_item_type_master as t', 'o.Type_ID', 't.Type_ID')
      .leftJoin('tbl_hidden_location_master as h', 'o.Hidden_Location_ID', 'h.Hidden_Location_ID')
      // Data_Mode IN (2,3) on BOTH the ornament and the sale — same rule
      // as /hidden-stock and /reports/visibility-comparison above, so a
      // Practice/Dummy-mode item or sale can never appear in this report.
      .where('o.Tenant_ID', req.user.tenantId).where('o.Is_Hidden', true).where('o.Is_Sold', true)
      .whereIn('o.Data_Mode', [2, 3]).whereIn('sh.Data_Mode', [2, 3])
      .whereNot('sh.Payment_Status', 'Cancelled')
      .whereRaw('DATE("sh"."Sale_Date") BETWEEN ? AND ?', [fromDate, toDate])
      .select(
        'o.Ornament_ID', 'o.Article_Number', 'o.Gross_Weight', 't.Type_Name',
        'h.Location_Name as Hidden_Location_Name', 'o.Hidden_By', 'o.Hidden_Date', 'o.Hidden_Reason',
        'sh.Invoice_Number', 'sh.Sale_Date', 'sh.Customer_Name', 'sd.Total_Line_Price'
      )
      .orderBy('sh.Sale_Date', 'desc');
    const items = await qb;
    const summary = {
      count: items.length,
      total_weight: items.reduce((s, i) => s + parseFloat(i.Gross_Weight || 0), 0),
      total_value: items.reduce((s, i) => s + parseFloat(i.Total_Line_Price || 0), 0),
    };
    return sendSuccess(res, { fromDate, toDate, summary, items });
  } catch (err) { console.error('Hidden stock sales report error:', err.message); return sendError(res, 500, 'Failed to fetch hidden stock sales report.'); }
});

// ── GET /api/floors/stock  ────────────────────────────────────────────────────
// Live stock, grouped by floor / counter / tray / the legacy free-text location.
// Official mode excludes hidden stock; Unofficial mode shows the complete
// inventory (see applyStockVisibility in dataModeFilter.js).
router.get('/stock', authenticate, async (req, res) => {
  const { branchId, groupBy = 'location' } = req.query;
  const groupConfig = {
    location: { column: 'o.Physical_Location', joins: [] },
    floor: {
      column: 'fl.Floor_Name',
      joins: [['tbl_floor_master as fl', 'o.Floor_ID', 'fl.Floor_ID']],
    },
    counter: {
      column: 'c.Counter_Name',
      joins: [['tbl_counter_master as c', 'o.Counter_ID', 'c.Counter_ID']],
    },
    tray: {
      column: 'tr.Tray_Name',
      joins: [['tbl_tray_master as tr', 'o.Tray_ID', 'tr.Tray_ID']],
    },
    metal: { column: 'o.Metal_Type', joins: [] },
  };
  const config = groupConfig[groupBy] || groupConfig.location;
  // Postgres lowercases unquoted identifiers, so raw SQL fragments must quote
  // each dotted part explicitly to match this schema's mixed-case columns.
  const quotedColumn = config.column.split('.').map(p => `"${p}"`).join('.');

  try {
    let qb = db('tbl_ornament_master as o')
      .where('o.Tenant_ID', req.user.tenantId)
      .where('o.Is_Active', true).where('o.Is_Sold', false)
      .whereNotNull(config.column);
    qb = applyStockVisibility(qb, req, 'o');
    config.joins.forEach(([table, a, b]) => { qb = qb.leftJoin(table, a, b); });
    qb = qb.select(
      db.raw(`${quotedColumn} as location_name`),
      db.raw('COUNT(*) as item_count'),
      db.raw('SUM("o"."Gross_Weight") as total_weight'),
      db.raw('SUM("o"."Total_Price") as total_value')
    ).groupBy(db.raw(quotedColumn));
    if (branchId) qb = qb.where('o.Branch_ID', branchId);
    return sendSuccess(res, await qb);
  } catch (err) { return sendError(res, 500, 'Failed to fetch floor stock.'); }
});

// ── GET /api/floors/reports/visibility-comparison  ────────────────────────────
// Reconciles total inventory vs visible vs hidden — confirms the core rule that
// actual quantity never changes, only visibility does. Same Unofficial-only
// gate as /hidden-stock — the hidden/total breakdown is itself a "detail."
router.get('/reports/visibility-comparison', authenticate, requirePermission('tenant_management'), async (req, res) => {
  if (modeVal(req) !== 2) {
    return sendError(res, 403, 'Hidden stock details are only visible in Unofficial mode.');
  }
  try {
    // Data_Mode IN (2,3), same as /hidden-stock above — Practice/Dummy
    // stock must never count toward this real visible/hidden reconciliation.
    const totals = await db('tbl_ornament_master')
      .where({ Tenant_ID: req.user.tenantId, Is_Active: true, Is_Sold: false })
      .whereIn('Data_Mode', [2, 3])
      .select(
        db.raw('COUNT(*) FILTER (WHERE "Is_Hidden" = false) as visible_count'),
        db.raw('SUM("Gross_Weight") FILTER (WHERE "Is_Hidden" = false) as visible_weight'),
        db.raw('SUM("Total_Price") FILTER (WHERE "Is_Hidden" = false) as visible_value'),
        db.raw('COUNT(*) FILTER (WHERE "Is_Hidden" = true) as hidden_count'),
        db.raw('SUM("Gross_Weight") FILTER (WHERE "Is_Hidden" = true) as hidden_weight'),
        db.raw('SUM("Total_Price") FILTER (WHERE "Is_Hidden" = true) as hidden_value'),
        db.raw('COUNT(*) as total_count'),
        db.raw('SUM("Gross_Weight") as total_weight'),
        db.raw('SUM("Total_Price") as total_value')
      ).first();
    return sendSuccess(res, totals);
  } catch (err) { return sendError(res, 500, 'Failed to fetch visibility comparison report.'); }
});

module.exports = router;
