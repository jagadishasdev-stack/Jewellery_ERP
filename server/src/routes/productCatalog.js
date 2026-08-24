/**
 * Product Catalog Routes
 * Migrated from Image App PHP backend
 * Integrates with tbl_ornament_master (existing ERP table)
 * New endpoints for image management, exhibition, barcode search
 */
const router = require('express').Router();
const db = require('../db/knex');
const { sendSuccess, sendError } = require('../utils/response');
const { authenticate } = require('../middleware/auth');
const { auditLog } = require('../utils/auditLogger');
const { applyStockVisibility, modeVal, excludeHiddenStockSales } = require('../utils/dataModeFilter');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { getUploadsRoot } = require('../utils/uploadsDir');

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const dir = path.join(getUploadsRoot(), 'catalog');
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname);
      cb(null, `${req.user.tenantId}_${Date.now()}${ext}`);
    },
  }),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/image\/(jpeg|png|webp|gif)/.test(file.mimetype)) cb(null, true);
    else cb(new Error('Only image files allowed.'));
  },
});

// ─── GET /api/catalog/search — barcode/tag/design search ──────────────────────
// Migrated from: ?action=search_barcode
router.get('/search', authenticate, async (req, res) => {
  const { q, barcode, tag, design, isSold, isDisplay, limit = 50, page = 1 } = req.query;
  const tenantId = req.user.tenantId;
  try {
    let qb = db('tbl_ornament_master as o')
      .leftJoin('tbl_item_type_master as t', 'o.Type_ID', 't.Type_ID')
      .leftJoin('tbl_purity_master as p', 'o.Purity_ID', 'p.Purity_ID')
      .where(function () {
        if (req.user.roleName !== 'Super Admin') this.where('o.Tenant_ID', tenantId);
      })
      .where('o.Is_Active', true)
      .select(
        'o.Ornament_ID', 'o.Article_Number', 'o.RFID_Tag', 'o.HUID_Number',
        'o.Gross_Weight', 'o.Net_Gold_Weight', 'o.Stone_Weight',
        'o.Total_Price', 'o.Is_Sold', 'o.Is_On_Display',
        'o.Product_Image_URL', 'o.Physical_Location',
        't.Type_Name', 'p.Purity_Code',
        'o.Current_Gold_Rate', 'o.Final_Making_Charge_Total',
        'o.Design_ID', 'o.Collection_ID',
      );
    qb = applyStockVisibility(qb, req, 'o');

    if (barcode) qb = qb.where('o.Article_Number', barcode.trim());
    else if (tag) qb = qb.where('o.RFID_Tag', tag.trim());
    else if (design) qb = qb.where('o.Design_ID', design);
    else if (q) {
      qb = qb.where(function() {
        this.where('o.Article_Number', 'ilike', `%${q}%`)
          .orWhere('t.Type_Name', 'ilike', `%${q}%`)
          .orWhere('p.Purity_Code', 'ilike', `%${q}%`)
          .orWhere('o.HUID_Number', 'ilike', `%${q}%`);
      });
    }

    if (isSold !== undefined) qb = qb.where('o.Is_Sold', isSold === 'true');
    if (isDisplay !== undefined) qb = qb.where('o.Is_On_Display', isDisplay === 'true');

    const total = (await qb.clone().clearSelect().count('o.Ornament_ID as c').first()).c;
    const items = await qb.limit(parseInt(limit)).offset((parseInt(page)-1)*parseInt(limit)).orderBy('o.Created_Date', 'desc');

    return sendSuccess(res, { items, total: parseInt(total) });
  } catch (err) {
    console.error('Catalog search error:', err.message);
    return sendError(res, 500, `Search failed: ${err.message}`);
  }
});

// ─── GET /api/catalog/item/:barcode — get single item with images ─────────────
// Migrated from: ?action=get_product_detail
router.get('/item/:barcode', authenticate, async (req, res) => {
  try {
    let qb = db('tbl_ornament_master as o')
      .leftJoin('tbl_item_type_master as t', 'o.Type_ID', 't.Type_ID')
      .leftJoin('tbl_purity_master as p', 'o.Purity_ID', 'p.Purity_ID')
      .leftJoin('tbl_design_master as d', 'o.Design_ID', 'd.Design_ID')
      .where(function () {
        if (req.user.roleName !== 'Super Admin') this.where('o.Tenant_ID', req.user.tenantId);
      })
      .where('o.Article_Number', req.params.barcode)
      .where('o.Is_Active', true)
      .select('o.*', 't.Type_Name', 'p.Purity_Code', 'd.Design_Name', 'd.Design_Code');
    const item = await applyStockVisibility(qb, req, 'o').first();

    if (!item) return sendError(res, 404, 'Item not found.');

    // Get additional images if stored separately
    const images = await db('tbl_product_images')
      .where({ Tenant_ID: req.user.tenantId, Article_Number: req.params.barcode })
      .orderBy('Sort_Order')
      .catch(() => []);

    return sendSuccess(res, { ...item, images });
  } catch (err) {
    return sendError(res, 500, 'Failed to fetch item.');
  }
});

// ─── POST /api/catalog/upload-image — upload product image ───────────────────
// Single source of truth: images MUST be linked to tbl_ornament_master
// Never store images without ornament_id OR article_number
router.post('/upload-image', authenticate, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return sendError(res, 400, 'No image uploaded.');
    const { ornament_id, article_number, sort_order = 0, image_type = 'front' } = req.body;

    // Enforce: image must link to a real inventory item
    if (!ornament_id && !article_number) {
      return sendError(res, 400, 'Image must be linked to a stock item. Provide ornament_id or article_number.');
    }

    // Verify the ornament exists (Super Admin can manage stock across all tenants)
    const ornament = await db('tbl_ornament_master')
      .where(function () {
        if (req.user.roleName !== 'Super Admin') this.where('Tenant_ID', req.user.tenantId);
      })
      .modify(qb => {
        if (ornament_id)    qb.where('Ornament_ID', ornament_id);
        else                qb.where('Article_Number', article_number);
      })
      .first();

    if (!ornament) {
      return sendError(res, 404, 'Stock item not found. Cannot upload image for non-existent inventory item.');
    }

    const imageUrl = `/uploads/catalog/${req.file.filename}`;
    const isPrimary = parseInt(sort_order) === 0 && !(await db('tbl_product_images')
      .where({ Tenant_ID: ornament.Tenant_ID })
      .modify(qb => {
        if (ornament.Ornament_ID) qb.where('Ornament_ID', ornament.Ornament_ID);
        else qb.where('Article_Number', ornament.Article_Number);
      })
      .where('Is_Primary', true).first());

    // Store in tbl_product_images — linked to BOTH Ornament_ID and Article_Number
    // Tenant_ID must be the ornament's own tenant, not the uploader's (Super Admin uploads cross-tenant)
    await db('tbl_product_images').insert({
      Tenant_ID:      ornament.Tenant_ID,
      Ornament_ID:    ornament.Ornament_ID,
      Article_Number: ornament.Article_Number,
      Image_URL:      imageUrl,
      Image_Type:     image_type,
      Sort_Order:     parseInt(sort_order),
      Is_Primary:     !!isPrimary,
      Uploaded_By:    req.user.username,
    });

    // If primary — update ornament's Product_Image_URL immediately (real-time sync)
    if (isPrimary) {
      await db('tbl_ornament_master')
        .where({ Ornament_ID: ornament.Ornament_ID })
        .update({ Product_Image_URL: imageUrl, Last_Updated_By: req.user.username });
    }

    return sendSuccess(res, {
      url:            imageUrl,
      ornament_id:    ornament.Ornament_ID,
      article_number: ornament.Article_Number,
      is_primary:     !!isPrimary,
    }, 'Image uploaded and linked to inventory item.');
  } catch (err) {
    console.error('Image upload error:', err.message);
    return sendError(res, 500, `Upload failed: ${err.message}`);
  }
});

// ─── PUT /api/catalog/exhibition/:id — toggle exhibition display ──────────────
// New: mark item as on display for exhibition
router.put('/exhibition/:id', authenticate, async (req, res) => {
  const { is_display } = req.body;
  try {
    await db('tbl_ornament_master')
      .where({ Ornament_ID: req.params.id, Tenant_ID: req.user.tenantId })
      .update({ Is_On_Display: is_display, Last_Updated_By: req.user.username });
    return sendSuccess(res, null, `Item ${is_display ? 'added to' : 'removed from'} exhibition display.`);
  } catch (err) {
    return sendError(res, 500, 'Failed.');
  }
});

// ─── GET /api/catalog/images — get images for one ornament, or batch via ornament_ids ─
router.get('/images', authenticate, async (req, res) => {
  const { ornament_id, article_number, ornament_ids } = req.query;
  try {
    let qb = db('tbl_product_images')
      .where(function () {
        if (req.user.roleName !== 'Super Admin') this.where('Tenant_ID', req.user.tenantId);
      })
      .orderBy('Sort_Order').orderBy('Is_Primary', 'desc');
    if (ornament_id)    qb = qb.where('Ornament_ID', ornament_id);
    if (article_number) qb = qb.where('Article_Number', article_number);
    if (ornament_ids)   qb = qb.whereIn('Ornament_ID', ornament_ids.split(',').map(Number).filter(Boolean));
    const images = await qb;
    return sendSuccess(res, images);
  } catch (err) {
    return sendError(res, 500, 'Failed to fetch images.');
  }
});

// ─── PUT /api/catalog/images/:id/set-primary — set primary image ──────────────
router.put('/images/:id/set-primary', authenticate, async (req, res) => {
  try {
    const { ornament_id, article_number } = req.body;
    const isSuperAdmin = req.user.roleName === 'Super Admin';

    // Look up the target image first — its own Tenant_ID is the source of truth
    // (Super Admin can set-primary across tenants; regular users are scoped to their own)
    const target = await db('tbl_product_images')
      .where(function () { if (!isSuperAdmin) this.where('Tenant_ID', req.user.tenantId); })
      .where('Image_ID', req.params.id)
      .first();

    if (!target) return sendError(res, 404, 'Image not found.');

    // Unset existing primary for the same ornament, within its own tenant only
    await db('tbl_product_images')
      .where('Tenant_ID', target.Tenant_ID)
      .where(function () {
        if (ornament_id)         this.where('Ornament_ID', ornament_id);
        else if (article_number) this.where('Article_Number', article_number);
      })
      .update({ Is_Primary: false });

    const [img] = await db('tbl_product_images')
      .where({ Image_ID: req.params.id })
      .update({ Is_Primary: true })
      .returning('*');

    // Also update the ornament's Product_Image_URL to this image
    if (ornament_id || article_number) {
      const where = ornament_id
        ? { Ornament_ID: ornament_id, Tenant_ID: target.Tenant_ID }
        : { Article_Number: article_number, Tenant_ID: target.Tenant_ID };
      await db('tbl_ornament_master').where(where).update({ Product_Image_URL: img.Image_URL, Last_Updated_By: req.user.username });
    }

    return sendSuccess(res, img, 'Primary image set.');
  } catch (err) {
    console.error('Set primary error:', err.message);
    return sendError(res, 500, 'Failed to set primary image.');
  }
});

// ─── DELETE /api/catalog/images/:id ─────────────────────────────────────────
router.delete('/images/:id', authenticate, async (req, res) => {
  try {
    const isSuperAdmin = req.user.roleName === 'Super Admin';
    const img = await db('tbl_product_images')
      .where(function () { if (!isSuperAdmin) this.where('Tenant_ID', req.user.tenantId); })
      .where('Image_ID', req.params.id)
      .first();
    if (!img) return sendError(res, 404, 'Image not found.');

    await db('tbl_product_images').where('Image_ID', req.params.id).del();

    // If it was primary — set the next image as primary
    if (img.Is_Primary) {
      const next = await db('tbl_product_images')
        .where({ Tenant_ID: img.Tenant_ID, Article_Number: img.Article_Number })
        .orderBy('Sort_Order').first();
      if (next) {
        await db('tbl_product_images').where('Image_ID', next.Image_ID).update({ Is_Primary: true });
        await db('tbl_ornament_master')
          .where({ Article_Number: img.Article_Number, Tenant_ID: img.Tenant_ID })
          .update({ Product_Image_URL: next.Image_URL, Last_Updated_By: req.user.username });
      } else {
        // No images left — clear the ornament image URL
        await db('tbl_ornament_master')
          .where({ Article_Number: img.Article_Number, Tenant_ID: img.Tenant_ID })
          .update({ Product_Image_URL: null, Last_Updated_By: req.user.username });
      }
    }

    return sendSuccess(res, null, 'Image deleted.');
  } catch (err) {
    return sendError(res, 500, 'Failed to delete image.');
  }
});
router.get('/exhibition', authenticate, async (req, res) => {
  try {
    // Was hardcoded to Is_Hidden=false with no Data_Mode filter at all —
    // always excluded hidden stock regardless of screen (Official's rule
    // by coincidence, but wrong for Unofficial, which should show hidden
    // stock too), and could leak Practice-mode items into any view since
    // nothing scoped by mode. applyStockVisibility is the shared, correct
    // rule for both axes (see dataModeFilter.js).
    let qb = db('tbl_ornament_master as o')
      .leftJoin('tbl_item_type_master as t', 'o.Type_ID', 't.Type_ID')
      .leftJoin('tbl_purity_master as p', 'o.Purity_ID', 'p.Purity_ID')
      .where('o.Tenant_ID', req.user.tenantId)
      .where('o.Is_Active', true)
      .where('o.Is_On_Display', true);
    qb = applyStockVisibility(qb, req, 'o');
    const items = await qb
      .select('o.Ornament_ID', 'o.Article_Number', 'o.Product_Image_URL', 'o.Gross_Weight',
              'o.Net_Gold_Weight', 'o.Total_Price', 't.Type_Name', 'p.Purity_Code')
      .orderBy('t.Type_Name');
    return sendSuccess(res, items);
  } catch (err) {
    return sendError(res, 500, 'Failed.');
  }
});

// ─── POST /api/catalog/orders — create order from catalog ────────────────────
// Migrated from exhibition CreateOrderScreen
router.post('/orders', authenticate, async (req, res) => {
  try {
    const { items, customer_name, customer_mobile, notes } = req.body;
    const tenantId = req.user.tenantId;

    const orderNo = `ORD-${tenantId.substring(0,4)}-${Date.now().toString().slice(-7)}`;

    const [order] = await db('tbl_catalog_orders').insert({
      Tenant_ID:       tenantId,
      Order_Number:    orderNo,
      Customer_Name:   customer_name,
      Customer_Mobile: customer_mobile,
      Notes:           notes || null,
      Status:          'Pending',
      Created_By:      req.user.username,
    }).returning('*').catch(async () => {
      // Table may not exist yet — create it
      await db.schema.createTable('tbl_catalog_orders', t => {
        t.increments('Order_ID').primary();
        t.string('Tenant_ID', 50).notNullable();
        t.string('Order_Number', 50).unique();
        t.string('Customer_Name', 100);
        t.string('Customer_Mobile', 20);
        t.text('Notes');
        t.string('Status', 30).defaultTo('Pending');
        t.string('Created_By', 100);
        t.timestamp('Created_Date').defaultTo(db.fn.now());
      }).catch(() => {});
      // Retry
      return db('tbl_catalog_orders').insert({
        Tenant_ID: tenantId, Order_Number: orderNo,
        Customer_Name: customer_name, Customer_Mobile: customer_mobile,
        Notes: notes || null, Status: 'Pending', Created_By: req.user.username,
      }).returning('*');
    });

    // Insert order items
    if (items?.length > 0) {
      await db('tbl_catalog_order_items').insert(
        items.map(i => ({ Order_ID: order.Order_ID, Article_Number: i.article_number, Quantity: i.qty || 1, Notes: i.notes }))
      ).catch(() => {});
    }

    return sendSuccess(res, { order_number: orderNo, order_id: order.Order_ID }, 'Order created.', 201);
  } catch (err) {
    console.error('Catalog order error:', err.message);
    return sendError(res, 500, `Failed to create order: ${err.message}`);
  }
});

// ─── GET /api/catalog/orders — list orders ───────────────────────────────────
router.get('/orders', authenticate, async (req, res) => {
  const { mobile, status, page = 1, limit = 20 } = req.query;
  try {
    let qb = db('tbl_catalog_orders').where('Tenant_ID', req.user.tenantId).orderBy('Created_Date', 'desc');
    if (mobile) qb = qb.where('Customer_Mobile', mobile);
    if (status) qb = qb.where('Status', status);
    const orders = await qb.limit(parseInt(limit)).offset((parseInt(page)-1)*parseInt(limit)).catch(() => []);
    return sendSuccess(res, orders);
  } catch (err) {
    return sendSuccess(res, []); // non-fatal
  }
});

// ─── GET /api/catalog/designs — group items by design ────────────────────────
// Migrated from Designwiseimg
router.get('/designs', authenticate, async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const designs = await db('tbl_ornament_master as o')
      .leftJoin('tbl_design_master as d', 'o.Design_ID', 'd.Design_ID')
      .leftJoin('tbl_item_type_master as t', 'o.Type_ID', 't.Type_ID')
      .where('o.Tenant_ID', tenantId)
      .where('o.Is_Active', true)
      .where('o.Is_Sold', false)
      .whereNotNull('o.Design_ID')
      .groupBy('d.Design_ID', 'd.Design_Name', 'd.Design_Code', 't.Type_Name')
      .select(
        'd.Design_ID', 'd.Design_Name', 'd.Design_Code', 't.Type_Name',
        db.raw('COUNT(*) as item_count'),
        db.raw('MIN("o"."Product_Image_URL") as sample_image'),
      )
      .orderBy('d.Design_Name');
    return sendSuccess(res, designs);
  } catch (err) {
    return sendError(res, 500, 'Failed to fetch designs.');
  }
});

// ─── GET /api/catalog/sold-report — sold items report ────────────────────────
// Migrated from SoldReport page
router.get('/sold-report', authenticate, async (req, res) => {
  const { fromDate, toDate, typeId, page = 1, limit = 50 } = req.query;
  try {
    const tenantId = req.user.tenantId;
    // Had neither Data_Mode nor hidden-stock scoping — Official mode could
    // see Unofficial/Practice-mode sales, and (once hidden stock could be
    // billed from Official mode too) hidden-stock revenue right alongside
    // ordinary stock. Same rule as the rest of reports.js: exact Data_Mode
    // match, plus exclude hidden-stock sales specifically in Official mode.
    let qb = excludeHiddenStockSales(db('tbl_sales_details as sd')
      .join('tbl_sales_header as sh', 'sd.Sale_ID', 'sh.Sale_ID')
      .where('sh.Tenant_ID', tenantId)
      .where('sh.Data_Mode', modeVal(req))
      .whereNot('sh.Payment_Status', 'Cancelled'), req, 'sh')
      .select(
        'sd.Detail_ID', 'sd.Article_Number', 'sd.Item_Type_Name',
        'sd.Gross_Weight', 'sd.Net_Gold_Weight', 'sd.Purity_Code',
        'sd.Total_Line_Price', 'sh.Sale_Date', 'sh.Customer_Name',
        'sh.Invoice_Number',
      )
      .orderBy('sh.Sale_Date', 'desc');

    if (fromDate && fromDate.trim()) qb = qb.whereRaw(`DATE("sh"."Sale_Date") >= ?`, [fromDate]);
    if (toDate && toDate.trim())     qb = qb.whereRaw(`DATE("sh"."Sale_Date") <= ?`, [toDate]);

    const [countRow] = await qb.clone().clearSelect().clearOrder().count('sd.Detail_ID as c');
    const total = parseInt(countRow?.c || 0);
    const items = await qb.limit(parseInt(limit)).offset((parseInt(page) - 1) * parseInt(limit));

    return sendSuccess(res, { items, total });
  } catch (err) {
    console.error('Sold report error:', err.message);
    return sendError(res, 500, `Failed to generate sold report: ${err.message}`);
  }
});

module.exports = router;

// ─── GET /api/catalog/public/:barcode — PUBLIC endpoint (no auth needed) ─────
// Used by mobile app after login — returns live availability from ERP inventory
// This is the SINGLE source of truth endpoint
router.get('/public/:barcode', async (req, res) => {
  try {
    // No auth means no req.dataMode/tenant context at all here — this must
    // NOT default through applyStockVisibility's mode-sensitive branching
    // (that reads req.dataMode, which a caller could otherwise influence via
    // the X-Data-Mode header with no auth to stop them). A public product
    // page is always the Official view: Data_Mode=3, never hidden stock,
    // hardcoded rather than mode-aware. Previously had neither filter at
    // all — a Practice-mode test item could be exposed publicly as long as
    // it wasn't hidden.
    const ornament = await db('tbl_ornament_master as o')
      .leftJoin('tbl_item_type_master as t',   'o.Type_ID',   't.Type_ID')
      .leftJoin('tbl_purity_master as p',       'o.Purity_ID', 'p.Purity_ID')
      .leftJoin('tbl_design_master as d',       'o.Design_ID', 'd.Design_ID')
      .leftJoin('tbl_branch_master as b',       'o.Branch_ID', 'b.Branch_ID')
      .where('o.Article_Number', req.params.barcode)
      .where('o.Is_Active', true)
      .where('o.Is_Hidden', false)
      .where('o.Data_Mode', 3)
      .select(
        'o.Ornament_ID', 'o.Article_Number', 'o.RFID_Tag', 'o.HUID_Number',
        'o.Gross_Weight', 'o.Net_Gold_Weight', 'o.Stone_Weight',
        'o.Total_Price', 'o.Current_Gold_Rate', 'o.Final_Making_Charge_Total',
        'o.Is_Sold', 'o.Is_On_Approval', 'o.Is_On_Display', 'o.Is_Stock_Available',
        'o.Product_Image_URL', 'o.Physical_Location', 'o.Tenant_ID',
        't.Type_Name', 'p.Purity_Code', 'd.Design_Name', 'd.Design_Code',
        'b.Branch_Name',
      )
      .first();

    if (!ornament) return sendError(res, 404, 'Product not found.');

    // Availability status — always from live ERP data
    let availability = 'Available';
    if (ornament.Is_Sold)                    availability = 'Sold';
    else if (ornament.Is_On_Approval)         availability = 'Reserved';
    else if (!ornament.Is_Stock_Available)   availability = 'Unavailable';

    // Get all images
    const images = await db('tbl_product_images')
      .where({ Tenant_ID: ornament.Tenant_ID, Article_Number: ornament.Article_Number })
      .orderBy('Is_Primary', 'desc')
      .orderBy('Sort_Order')
      .select('Image_ID', 'Image_URL', 'Image_Type', 'Is_Primary');

    return sendSuccess(res, {
      ...ornament,
      availability,
      images,
      can_order: !ornament.Is_Sold && !ornament.Is_On_Approval && ornament.Is_Stock_Available,
    });
  } catch (err) {
    console.error('Public catalog error:', err.message);
    return sendError(res, 500, 'Failed to fetch product.');
  }
});

// ─── POST /api/catalog/wishlist — add to wishlist ────────────────────────────
router.post('/wishlist', authenticate, async (req, res) => {
  const { ornament_id, article_number, customer_mobile } = req.body;
  if (!article_number) return sendError(res, 400, 'article_number required.');
  try {
    // Verify item exists and is not sold
    const item = await db('tbl_ornament_master')
      .where({ Tenant_ID: req.user.tenantId, Article_Number: article_number, Is_Active: true })
      .first();
    if (!item) return sendError(res, 404, 'Item not found in inventory.');
    if (item.Is_Sold) return sendError(res, 400, 'Cannot wishlist a sold item.');

    await db('tbl_catalog_wishlist').insert({
      Tenant_ID:       req.user.tenantId,
      Ornament_ID:     item.Ornament_ID,
      Article_Number:  article_number,
      Customer_Mobile: customer_mobile || req.user.mobile || null,
      Customer_ID:     req.user.customerId || null,
    }).onConflict(['Tenant_ID', 'Article_Number', 'Customer_Mobile']).ignore();

    return sendSuccess(res, null, 'Added to wishlist.');
  } catch (err) {
    return sendError(res, 500, 'Failed to add to wishlist.');
  }
});

// ─── GET /api/catalog/wishlist — get customer wishlist ────────────────────────
router.get('/wishlist', authenticate, async (req, res) => {
  const { customer_mobile } = req.query;
  try {
    const items = await db('tbl_catalog_wishlist as w')
      .leftJoin('tbl_ornament_master as o',     'w.Ornament_ID',  'o.Ornament_ID')
      .leftJoin('tbl_item_type_master as t',    'o.Type_ID',      't.Type_ID')
      .leftJoin('tbl_purity_master as p',       'o.Purity_ID',    'p.Purity_ID')
      .where('w.Tenant_ID', req.user.tenantId)
      .modify(qb => {
        if (customer_mobile) qb.where('w.Customer_Mobile', customer_mobile);
      })
      .select(
        'w.Wishlist_ID', 'w.Article_Number', 'w.Created_Date',
        'o.Product_Image_URL', 'o.Total_Price', 'o.Is_Sold',
        'o.Is_On_Approval', 'o.Is_Stock_Available',
        't.Type_Name', 'p.Purity_Code',
      )
      .orderBy('w.Created_Date', 'desc');

    // Enrich with live availability
    const enriched = items.map(i => ({
      ...i,
      availability: i.Is_Sold ? 'Sold' : i.Is_On_Approval ? 'Reserved' : !i.Is_Stock_Available ? 'Unavailable' : 'Available',
    }));

    return sendSuccess(res, enriched);
  } catch (err) {
    return sendError(res, 500, 'Failed to fetch wishlist.');
  }
});

// ─── DELETE /api/catalog/wishlist/:id ─────────────────────────────────────────
router.delete('/wishlist/:id', authenticate, async (req, res) => {
  try {
    await db('tbl_catalog_wishlist').where({ Wishlist_ID: req.params.id, Tenant_ID: req.user.tenantId }).del();
    return sendSuccess(res, null, 'Removed from wishlist.');
  } catch (err) {
    return sendError(res, 500, 'Failed.');
  }
});

// ─── POST /api/catalog/order-request — customer places an order request ───────
// References actual Ornament_ID — never a separate product
router.post('/order-request', authenticate, async (req, res) => {
  try {
    const { article_number, ornament_id, customer_name, customer_mobile, notes } = req.body;
    if (!article_number && !ornament_id) return sendError(res, 400, 'article_number or ornament_id required.');

    const tenantId = req.user.tenantId;

    // Always validate against live ERP inventory
    const item = await db('tbl_ornament_master')
      .where('Tenant_ID', tenantId)
      .where('Is_Active', true)
      .modify(qb => {
        if (ornament_id)    qb.where('Ornament_ID', ornament_id);
        else                qb.where('Article_Number', article_number);
      })
      .first();

    if (!item)            return sendError(res, 404, 'Item not found in inventory.');
    if (item.Is_Sold)        return sendError(res, 400, 'This item has already been sold.');
    if (item.Is_On_Approval) return sendError(res, 400, 'This item is currently reserved.');

    const orderNo = `ORD-${tenantId.substring(0, 4)}-${Date.now().toString().slice(-7)}`;

    // Create order linked to real ornament
    await db('tbl_catalog_orders').insert({
      Tenant_ID:       tenantId,
      Order_Number:    orderNo,
      Customer_Name:   customer_name || req.user.fullName || null,
      Customer_Mobile: customer_mobile || req.user.mobile || null,
      Notes:           notes || null,
      Status:          'Pending',
      Created_By:      req.user.username,
    });

    const order = await db('tbl_catalog_orders').where({ Order_Number: orderNo }).first();

    // Link to actual inventory item
    await db('tbl_catalog_order_items').insert({
      Order_ID:       order.Order_ID,
      Article_Number: item.Article_Number,
      Quantity:       1,
      Notes:          notes || null,
    });

    // Optionally mark item as reserved
    await db('tbl_ornament_master')
      .where('Ornament_ID', item.Ornament_ID)
      .update({ Is_On_Approval: true, Last_Updated_By: req.user.username });

    return sendSuccess(res, {
      order_number:   orderNo,
      order_id:       order.Order_ID,
      article_number: item.Article_Number,
      item_type:      item.Type_Name,
      amount:         item.Total_Price,
    }, 'Order request placed. Item reserved pending store approval.', 201);
  } catch (err) {
    console.error('Order request error:', err.message);
    return sendError(res, 500, `Failed to place order: ${err.message}`);
  }
});

// ─── PUT /api/catalog/orders/:id/status — approve/reject order ───────────────
router.put('/orders/:id/status', authenticate, async (req, res) => {
  const { status, reason } = req.body;
  const validStatuses = ['Confirmed', 'Rejected', 'Delivered', 'Cancelled'];
  if (!validStatuses.includes(status)) return sendError(res, 400, `Status must be one of: ${validStatuses.join(', ')}`);

  try {
    const order = await db('tbl_catalog_orders').where({ Order_ID: req.params.id, Tenant_ID: req.user.tenantId }).first();
    if (!order) return sendError(res, 404, 'Order not found.');

    await db('tbl_catalog_orders').where('Order_ID', req.params.id).update({
      Status:      status,
      Notes:       reason ? `${order.Notes || ''}\n[${status}]: ${reason}` : order.Notes,
      Updated_Date: new Date(),
    });

    // If rejected/cancelled — release the reservation
    if (status === 'Rejected' || status === 'Cancelled') {
      const items = await db('tbl_catalog_order_items').where('Order_ID', req.params.id);
      for (const item of items) {
        await db('tbl_ornament_master')
          .where({ Article_Number: item.Article_Number, Tenant_ID: req.user.tenantId })
          .update({ Is_On_Approval: false, Last_Updated_By: req.user.username });
      }
    }

    return sendSuccess(res, null, `Order ${status}.`);
  } catch (err) {
    return sendError(res, 500, 'Failed to update order status.');
  }
});

module.exports = router;
