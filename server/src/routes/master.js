const router = require('express').Router();
const { body, validationResult } = require('express-validator');
const db = require('../db/knex');
const { sendSuccess, sendError, sendValidationError } = require('../utils/response');
const { authenticate } = require('../middleware/auth');
const { METAL_TYPES_WITH_PURITY } = require('../utils/metalTypes');

// ─── Item Types ───────────────────────────────────────────────────────────────
router.get('/item-types', authenticate, async (req, res) => {
  try {
    const types = await db('tbl_item_type_master').where({ Is_Active: true }).orderBy('Type_Name');
    return sendSuccess(res, types);
  } catch (err) {
    return sendError(res, 500, 'Failed to fetch item types.');
  }
});

router.post('/item-types', authenticate, [
  body('Type_Code').trim().notEmpty(),
  body('Type_Name').trim().notEmpty(),
  body('Category').trim().notEmpty(),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return sendValidationError(res, errors.array());
  try {
    const [item] = await db('tbl_item_type_master').insert({
      ...req.body,
      Created_By: req.user.username,
    }).returning('*');
    return sendSuccess(res, item, 'Item type created.', 201);
  } catch (err) {
    if (err.code === '23505') return sendError(res, 409, 'Item type code already exists.');
    console.error('Item type create error:', err.message);
    return sendError(res, 500, 'Failed to create item type.');
  }
});

router.put('/item-types/:id', authenticate, async (req, res) => {
  try {
    const [updated] = await db('tbl_item_type_master')
      .where({ Type_ID: req.params.id })
      .update({ ...req.body, Modified_Date: new Date() })
      .returning('*');
    if (!updated) return sendError(res, 404, 'Item type not found.');
    return sendSuccess(res, updated, 'Item type updated.');
  } catch (err) {
    return sendError(res, 500, 'Failed to update item type.');
  }
});

// ─── Designs ──────────────────────────────────────────────────────────────────
router.get('/designs', authenticate, async (req, res) => {
  try {
    const designs = await db('tbl_design_master as d')
      .leftJoin('tbl_item_type_master as t', 'd.Type_ID', 't.Type_ID')
      .where({ 'd.Is_Active': true })
      .select('d.*', 't.Type_Name', 't.Type_Code')
      .orderBy('d.Design_Name');
    return sendSuccess(res, designs);
  } catch (err) {
    return sendError(res, 500, 'Failed to fetch designs.');
  }
});

router.post('/designs', authenticate, [
  body('Design_Code').trim().notEmpty(),
  body('Design_Name').trim().notEmpty(),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return sendValidationError(res, errors.array());
  try {
    const [design] = await db('tbl_design_master').insert({
      ...req.body,
      Created_By: req.user.username,
    }).returning('*');
    return sendSuccess(res, design, 'Design created.', 201);
  } catch (err) {
    if (err.code === '23505') return sendError(res, 409, 'Design code already exists.');
    console.error('Design create error:', err.message);
    return sendError(res, 500, 'Failed to create design.');
  }
});

router.put('/designs/:id', authenticate, async (req, res) => {
  try {
    const [updated] = await db('tbl_design_master')
      .where({ Design_ID: req.params.id })
      .update({ ...req.body, Modified_Date: new Date() })
      .returning('*');
    if (!updated) return sendError(res, 404, 'Design not found.');
    return sendSuccess(res, updated, 'Design updated.');
  } catch (err) {
    return sendError(res, 500, 'Failed to update design.');
  }
});

// ─── Gemstones ────────────────────────────────────────────────────────────────
router.get('/gemstones', authenticate, async (req, res) => {
  try {
    const stones = await db('tbl_gemstone_master')
      .where('Is_Active', true)
      .orderBy('Stone_Name');
    return sendSuccess(res, stones);
  } catch (err) {
    console.error('Gemstones fetch error:', err.message);
    return sendError(res, 500, 'Failed to fetch gemstones.');
  }
});

router.post('/gemstones', authenticate, [
  body('Stone_Code').trim().notEmpty().withMessage('Stone code is required'),
  body('Stone_Name').trim().notEmpty().withMessage('Stone name is required'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return sendValidationError(res, errors.array());
  try {
    const [stone] = await db('tbl_gemstone_master').insert({
      Stone_Code:      req.body.Stone_Code?.substring(0, 20),
      Stone_Name:      req.body.Stone_Name?.substring(0, 50),
      Stone_Color:     req.body.Stone_Color     ? req.body.Stone_Color.substring(0, 30)   : null,
      Stone_Clarity:   req.body.Stone_Clarity   ? req.body.Stone_Clarity.substring(0, 20) : null,
      Stone_Cut:       req.body.Stone_Cut       ? req.body.Stone_Cut.substring(0, 20)     : null,
      Price_Per_Carat: req.body.Price_Per_Carat || null,
      Is_Natural:      req.body.Is_Natural      !== undefined ? req.body.Is_Natural : true,
      Is_Lab_Grown:    req.body.Is_Lab_Grown    !== undefined ? req.body.Is_Lab_Grown : false,
      Is_Active:       true,
      Created_By:      req.user.username,
      Notes:           req.body.Notes           || null,
    }).returning('*');
    return sendSuccess(res, stone, 'Gemstone created.', 201);
  } catch (err) {
    if (err.code === '23505') return sendError(res, 409, 'Stone code already exists. Use a unique code.');
    console.error('Gemstone create error:', err.message);
    return sendError(res, 500, `Failed to create gemstone: ${err.message}`);
  }
});

router.put('/gemstones/:id', authenticate, async (req, res) => {
  try {
    const [updated] = await db('tbl_gemstone_master')
      .where({ Stone_ID: req.params.id })
      .update({ ...req.body, Modified_Date: new Date() })
      .returning('*');
    if (!updated) return sendError(res, 404, 'Gemstone not found.');
    return sendSuccess(res, updated, 'Gemstone updated.');
  } catch (err) {
    return sendError(res, 500, 'Failed to update gemstone.');
  }
});

// ─── Purities ─────────────────────────────────────────────────────────────────
router.get('/purities', authenticate, async (req, res) => {
  try {
    let qb = db('tbl_purity_master').where({ Is_Active: true });
    // Lets the Add/Edit Stock forms narrow this dropdown to only the
    // purities that apply to the metal type the user already picked
    // (e.g. Platinum shouldn't offer 22K gold purities).
    if (req.query.metalType) qb = qb.where('Metal_Type', req.query.metalType);
    const purities = await qb.orderBy('Karat', 'desc');
    return sendSuccess(res, purities);
  } catch (err) {
    return sendError(res, 500, 'Failed to fetch purities.');
  }
});

router.post('/purities', authenticate, [
  body('Purity_Code').trim().notEmpty(),
  body('Karat').isFloat({ min: 1 }),
  body('Percentage').isFloat({ min: 1, max: 100 }),
  body('Metal_Type').optional().isIn(METAL_TYPES_WITH_PURITY),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return sendValidationError(res, errors.array());
  try {
    // Real, previously-broken bug: tbl_purity_master has no Created_By
    // column (unlike every other master table this file manages) — this
    // route unconditionally tried to insert one anyway, so EVERY call to
    // this endpoint 500'd, for every tenant, always. Found by writing a
    // real test against the live schema, not by inspection alone.
    const [row] = await db('tbl_purity_master').insert({
      ...req.body,
      Metal_Type: req.body.Metal_Type || 'Gold',
      Is_Active: true,
    }).returning('*');
    return sendSuccess(res, row, 'Purity created.', 201);
  } catch (err) {
    if (err.code === '23505') return sendError(res, 409, 'Purity code already exists.');
    console.error('Purity create error:', err.message);
    return sendError(res, 500, 'Failed to create purity.');
  }
});

// ─── Collections ──────────────────────────────────────────────────────────────
router.get('/collections', authenticate, async (req, res) => {
  try {
    const data = await db('tbl_collection_master')
      .where({ Tenant_ID: req.user.tenantId, Is_Active: true })
      .orderBy('Collection_Name');
    return sendSuccess(res, data);
  } catch (err) { return sendError(res, 500, 'Failed.'); }
});

router.post('/collections', authenticate, async (req, res) => {
  try {
    const [row] = await db('tbl_collection_master').insert({
      ...req.body,
      Tenant_ID: req.user.tenantId,
      Created_By: req.user.username,
    }).returning('*');
    return sendSuccess(res, row, 'Collection created.', 201);
  } catch (err) {
    if (err.code === '23505') return sendError(res, 409, 'Collection code already exists.');
    console.error('Collection create error:', err.message);
    return sendError(res, 500, 'Failed to create collection.');
  }
});

// ─── Sub Categories ────────────────────────────────────────────────────────────
router.get('/sub-categories', authenticate, async (req, res) => {
  try {
    const data = await db('tbl_sub_category_master')
      .where({ Tenant_ID: req.user.tenantId, Is_Active: true })
      .orderBy('SubCat_Name');
    return sendSuccess(res, data);
  } catch (err) { return sendError(res, 500, 'Failed.'); }
});

router.post('/sub-categories', authenticate, async (req, res) => {
  try {
    const [row] = await db('tbl_sub_category_master').insert({
      ...req.body,
      Tenant_ID: req.user.tenantId,
      Created_By: req.user.username,
    }).returning('*');
    return sendSuccess(res, row, 'Sub-category created.', 201);
  } catch (err) {
    if (err.code === '23505') return sendError(res, 409, 'Sub-category code already exists.');
    console.error('Sub-category create error:', err.message);
    return sendError(res, 500, 'Failed to create sub-category.');
  }
});

// ─── Brands ────────────────────────────────────────────────────────────────────
router.get('/brands', authenticate, async (req, res) => {
  try {
    const data = await db('tbl_brand_master')
      .where({ Tenant_ID: req.user.tenantId, Is_Active: true })
      .orderBy('Brand_Name');
    return sendSuccess(res, data);
  } catch (err) { return sendError(res, 500, 'Failed.'); }
});

router.post('/brands', authenticate, async (req, res) => {
  try {
    const [row] = await db('tbl_brand_master').insert({
      ...req.body,
      Tenant_ID: req.user.tenantId,
      Created_By: req.user.username,
    }).returning('*');
    return sendSuccess(res, row, 'Brand created.', 201);
  } catch (err) {
    if (err.code === '23505') return sendError(res, 409, 'Brand code already exists.');
    console.error('Brand create error:', err.message);
    return sendError(res, 500, 'Failed to create brand.');
  }
});

// ─── Making Charges ────────────────────────────────────────────────────────────
router.get('/making-charges', authenticate, async (req, res) => {
  try {
    const data = await db('tbl_making_charge_master')
      .where({ Tenant_ID: req.user.tenantId, Is_Active: true })
      .orderBy('MC_Name');
    return sendSuccess(res, data);
  } catch (err) { return sendError(res, 500, 'Failed.'); }
});

router.post('/making-charges', authenticate, async (req, res) => {
  try {
    const [row] = await db('tbl_making_charge_master').insert({
      ...req.body,
      Tenant_ID: req.user.tenantId,
      Created_By: req.user.username,
    }).returning('*');
    return sendSuccess(res, row, 'Making charge created.', 201);
  } catch (err) {
    if (err.code === '23505') return sendError(res, 409, 'Making charge name already exists.');
    console.error('Making charge create error:', err.message);
    return sendError(res, 500, 'Failed to create making charge.');
  }
});

router.put('/making-charges/:id', authenticate, async (req, res) => {
  try {
    // Real, previously-broken bug: unlike item-types/designs/gemstones,
    // tbl_making_charge_master has no Modified_Date column — this route
    // copied that same update shape from the others without checking,
    // so every edit to an existing making charge 500'd, always.
    const [updated] = await db('tbl_making_charge_master')
      .where({ MC_ID: req.params.id, Tenant_ID: req.user.tenantId })
      .update({ ...req.body })
      .returning('*');
    if (!updated) return sendError(res, 404, 'Making charge not found.');
    return sendSuccess(res, updated);
  } catch (err) { return sendError(res, 500, 'Failed.'); }
});

// ─── Diamond Masters (global read-only seeded data) ───────────────────────────
router.get('/diamond-quality', authenticate, async (req, res) => {
  try {
    return sendSuccess(res, await db('tbl_diamond_quality_master').where('Is_Active', true).orderBy('Quality_Code'));
  } catch (err) { return sendError(res, 500, 'Failed.'); }
});

router.get('/diamond-color', authenticate, async (req, res) => {
  try {
    return sendSuccess(res, await db('tbl_diamond_color_master').where('Is_Active', true).orderBy('Color_Code'));
  } catch (err) { return sendError(res, 500, 'Failed.'); }
});

router.get('/diamond-shape', authenticate, async (req, res) => {
  try {
    return sendSuccess(res, await db('tbl_diamond_shape_master').where('Is_Active', true).orderBy('Shape_Name'));
  } catch (err) { return sendError(res, 500, 'Failed.'); }
});

// ─── HUID ──────────────────────────────────────────────────────────────────────
router.get('/huid/:number', authenticate, async (req, res) => {
  try {
    const row = await db('tbl_huid_master')
      .where({ Tenant_ID: req.user.tenantId, HUID_Number: req.params.number })
      .first();
    if (!row) return sendError(res, 404, 'HUID not found.');
    return sendSuccess(res, row);
  } catch (err) { return sendError(res, 500, 'Failed.'); }
});

router.post('/huid', authenticate, async (req, res) => {
  try {
    const [row] = await db('tbl_huid_master').insert({
      ...req.body,
      Tenant_ID: req.user.tenantId,
      Created_By: req.user.username,
    }).returning('*');
    return sendSuccess(res, row, 'HUID registered.', 201);
  } catch (err) {
    if (err.code === '23505') return sendError(res, 409, 'HUID already registered.');
    return sendError(res, 500, 'Failed.');
  }
});

module.exports = router;
