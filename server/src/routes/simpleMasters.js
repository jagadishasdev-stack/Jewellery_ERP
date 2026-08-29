/**
 * Five small reference masters (Repair Category, Size/Length, Item Weight
 * Range, Cost Centre, Purchase Rate Type) plus Design-wise Reorder Level —
 * all genuinely absent before (Master menu audit, Transaction Menu spec).
 * Same simple shape across the first five (code/name/description/active),
 * so one generic CRUD builder handles all of them instead of five
 * near-identical route files. Reorder Level is a per-tenant override on
 * the global tbl_design_master, so it gets its own small pair of routes.
 */
const router = require('express').Router();
const { body, validationResult } = require('express-validator');
const db = require('../db/tenantDb').tenantDb;
const { sendSuccess, sendError, sendValidationError } = require('../utils/response');
const { authenticate } = require('../middleware/auth');
const { requireModuleAccess } = require('../utils/moduleOverride');

const MODULE_KEY = 'operations_masters';

// path segment -> { table, idCol, uniqueCol, requiredCols }
const MASTERS = {
  'repair-category': { table: 'tbl_repair_category_master', idCol: 'Category_ID', uniqueCol: 'Category_Name', required: ['Category_Name'] },
  'size': { table: 'tbl_size_master', idCol: 'Size_ID', uniqueCol: null, required: ['Size_Type', 'Size_Code'] },
  'item-weight-range': { table: 'tbl_item_weight_range_master', idCol: 'Range_ID', uniqueCol: 'Range_Name', required: ['Range_Name', 'Weight_From'] },
  'cost-centre': { table: 'tbl_cost_centre_master', idCol: 'Centre_ID', uniqueCol: 'Centre_Code', required: ['Centre_Code', 'Centre_Name'] },
  'purchase-rate-type': { table: 'tbl_purchase_rate_type_master', idCol: 'Type_ID', uniqueCol: 'Type_Name', required: ['Type_Name'] },
};

function orderCol(def) {
  return def.uniqueCol || def.idCol;
}

Object.entries(MASTERS).forEach(([slug, def]) => {
  router.get(`/${slug}`, authenticate, requireModuleAccess(MODULE_KEY, 'View'), async (req, res) => {
    try {
      const rows = await db(def.table).where('Tenant_ID', req.user.tenantId).orderBy(orderCol(def));
      return sendSuccess(res, rows);
    } catch (err) { return sendError(res, 500, `Failed to fetch ${slug}.`); }
  });

  router.post(`/${slug}`, authenticate, requireModuleAccess(MODULE_KEY, 'Add'),
    def.required.map((c) => body(c).notEmpty()),
    async (req, res) => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return sendValidationError(res, errors.array());
      try {
        if (def.uniqueCol) {
          const existing = await db(def.table).where({ Tenant_ID: req.user.tenantId, [def.uniqueCol]: req.body[def.uniqueCol] }).first();
          if (existing) return sendError(res, 409, `${req.body[def.uniqueCol]} already exists.`);
        }
        const [row] = await db(def.table).insert({ ...req.body, Tenant_ID: req.user.tenantId }).returning('*');
        return sendSuccess(res, row, 'Created.', 201);
      } catch (err) { return sendError(res, 500, `Failed to create ${slug} entry.`); }
    });

  router.put(`/${slug}/:id`, authenticate, requireModuleAccess(MODULE_KEY, 'Edit'), async (req, res) => {
    try {
      const body2 = { ...req.body };
      delete body2.Tenant_ID; delete body2[def.idCol];
      const [row] = await db(def.table).where({ [def.idCol]: req.params.id, Tenant_ID: req.user.tenantId }).update(body2).returning('*');
      if (!row) return sendError(res, 404, 'Not found.');
      return sendSuccess(res, row, 'Updated.');
    } catch (err) { return sendError(res, 500, `Failed to update ${slug} entry.`); }
  });
});

// ── Design-wise Reorder Level (tenant-scoped override on the global design master) ──
router.get('/design-reorder-level', authenticate, requireModuleAccess(MODULE_KEY, 'View'), async (req, res) => {
  try {
    const rows = await db('tbl_design_master as d')
      .leftJoin('tbl_design_reorder_level as r', function () {
        this.on('r.Design_ID', '=', 'd.Design_ID').andOn('r.Tenant_ID', '=', db.raw('?', [req.user.tenantId]));
      })
      .select('d.Design_ID', 'd.Design_Code', 'd.Design_Name', db.raw('COALESCE(r."Reorder_Level", 5) as "Reorder_Level"'))
      .orderBy('d.Design_Code');
    return sendSuccess(res, rows);
  } catch (err) { return sendError(res, 500, 'Failed to fetch design reorder levels.'); }
});

router.put('/design-reorder-level/:designId', authenticate, requireModuleAccess(MODULE_KEY, 'Edit'),
  [body('Reorder_Level').isInt({ min: 0 })], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return sendValidationError(res, errors.array());
    try {
      const design = await db('tbl_design_master').where('Design_ID', req.params.designId).first();
      if (!design) return sendError(res, 404, 'Design not found.');
      const [row] = await db('tbl_design_reorder_level')
        .insert({ Tenant_ID: req.user.tenantId, Design_ID: req.params.designId, Reorder_Level: req.body.Reorder_Level, Modified_Date: db.fn.now() })
        .onConflict(['Tenant_ID', 'Design_ID']).merge({ Reorder_Level: req.body.Reorder_Level, Modified_Date: db.fn.now() })
        .returning('*');
      return sendSuccess(res, row, 'Reorder level updated.');
    } catch (err) { return sendError(res, 500, 'Failed to update reorder level.'); }
  });

module.exports = router;
