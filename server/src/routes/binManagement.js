/**
 * Bin Management Routes — Master Bin Module
 * 4 bins: Purchase | Sales Return | Order | Pure Gold
 * Every entry auto-generates a Voucher ID.
 */
const router = require('express').Router();
const { body, validationResult } = require('express-validator');
const db = require('../db/tenantDb').tenantDb;
const { sendSuccess, sendError, sendValidationError } = require('../utils/response');
const { authenticate } = require('../middleware/auth');
const { auditLog } = require('../utils/auditLogger');
const { modeVal } = require('../utils/dataModeFilter');
const { inferMetalTypeFromPurityText, METAL_TYPES } = require('../utils/metalTypes');
const { nextNumber } = require('../utils/numberFormat');
const { postJournal } = require('../utils/accountingEngine');
const { resolveLedgerForPayment } = require('../utils/paymentLedgerMap');
const dayjs = require('dayjs');

// ── Voucher ID Generator ────────────────────────────────────────────────────────
const PREFIXES = {
  PURCHASE:     'PUR',
  SALES_RETURN: 'SRB',
  ORDER:        'ORD',
  PURE_GOLD:    'PGB',
};

async function genVoucherId(tenantId, type) {
  const prefix = PREFIXES[type] || 'BIN';
  // Bin vouchers never included the tenant code in the visible number
  // (unlike INV-/PUR-/etc elsewhere) — pass '' as tenantCode to keep that
  // exact pre-existing shape (PREFIX-YYYYMMDD-SEQ) when Short_Number_Format
  // is off; on, it collapses to the shared PREFIX-SEQ like everything else.
  return nextNumber({
    tenantId, table: 'tbl_voucher_master', column: 'Voucher_ID',
    prefix, tenantCode: '', padWidth: 5,
  });
}

async function registerVoucher(trx, tenantId, voucherId, type, refId, refTable, description, createdBy) {
  await trx('tbl_voucher_master').insert({
    Voucher_ID:       voucherId,
    Tenant_ID:        tenantId,
    Voucher_Type:     type,
    Reference_ID:     refId,
    Reference_Table:  refTable,
    Status:           'Active',
    Description:      description,
    Created_By:       createdBy,
  });
}

// ════════════════════════════════════════════════════════════════════════════
// VOUCHER SEARCH — universal search by Voucher ID
// ════════════════════════════════════════════════════════════════════════════
router.get('/voucher/:id', authenticate, async (req, res) => {
  try {
    const voucher = await db('tbl_voucher_master')
      .where({ Voucher_ID: req.params.id, Tenant_ID: req.user.tenantId })
      .first();
    if (!voucher) return sendError(res, 404, 'Voucher not found.');

    let detail = null;

    if (voucher.Voucher_Type === 'SALE') {
      // Return complete sale with line items, payments, ornament details
      const sale = await db('tbl_sales_header as s')
        .leftJoin('tbl_customer_master as c', 's.Customer_ID', 'c.Customer_ID')
        .where('s.Sale_ID', voucher.Reference_ID)
        .select('s.*', 'c.Email as Customer_Email', 'c.Mobile_1 as Customer_Mobile_CRM')
        .first();

      const items = sale ? await db('tbl_sales_details as sd')
        .leftJoin('tbl_ornament_master as o', 'sd.Ornament_ID', 'o.Ornament_ID')
        .leftJoin('tbl_item_type_master as t', 'o.Type_ID', 't.Type_ID')
        .leftJoin('tbl_purity_master as p', 'o.Purity_ID', 'p.Purity_ID')
        .where('sd.Sale_ID', voucher.Reference_ID)
        .select('sd.*', 't.Type_Name', 'p.Purity_Code',
          'o.Gross_Weight as Ornament_Gross_Weight', 'o.HUID_Number',
          'o.Hallmark_Certificate_No', 'o.Bin_Voucher_ID')
        : [];

      const payments = sale ? await db('tbl_sales_payments')
        .where('Sale_ID', voucher.Reference_ID) : [];

      detail = { sale, items, payments };

    } else if (voucher.Reference_Table && voucher.Reference_ID) {
      const pkMap = {
        tbl_bin_purchase:     'Bin_ID',
        tbl_bin_sales_return: 'Return_ID',
        tbl_bin_orders:       'Order_ID',
        tbl_bin_pure_gold:    'Gold_ID',
      };
      const pk = pkMap[voucher.Reference_Table];
      if (pk) detail = await db(voucher.Reference_Table).where(pk, voucher.Reference_ID).first();
    }

    // Check if any ornament was created from this voucher
    const ornament = await db('tbl_ornament_master')
      .where({ Tenant_ID: req.user.tenantId, Bin_Voucher_ID: req.params.id })
      .first().catch(() => null);

    return sendSuccess(res, { voucher, detail, ornament });
  } catch (err) {
    console.error('Voucher search error:', err.message);
    return sendError(res, 500, 'Voucher search failed.');
  }
});

// ════════════════════════════════════════════════════════════════════════════
// PURCHASE BIN
// ════════════════════════════════════════════════════════════════════════════
router.get('/purchase', authenticate, async (req, res) => {
  const { status, page = 1, limit = 50, search } = req.query;
  try {
    let qb = db('tbl_bin_purchase')
      .where({ Tenant_ID: req.user.tenantId, Data_Mode: modeVal(req) });
    if (status)  qb = qb.where('Status', status);
    if (search)  qb = qb.where(function() {
      this.where('Voucher_ID','ilike',`%${search}%`)
        .orWhere('Supplier_Name','ilike',`%${search}%`)
        .orWhere('Item_Category','ilike',`%${search}%`);
    });
    const [{ count }] = await qb.clone().count('Bin_ID as count');
    const data = await qb.orderBy('Created_Date','desc').limit(parseInt(limit)).offset((parseInt(page)-1)*parseInt(limit));
    return sendSuccess(res, { items: data, total: parseInt(count) });
  } catch (err) { return sendError(res, 500, 'Failed to fetch purchase bin.'); }
});

router.post('/purchase', authenticate, [
  body('Supplier_Name').trim().notEmpty().withMessage('Supplier name required'),
  body('Purchase_Date').isISO8601().withMessage('Purchase date required'),
  body('Gross_Weight').isFloat({ min: 0.001 }).withMessage('Gross weight required'),
  body('Purchase_Amount').isFloat({ min: 1 }).withMessage('Purchase amount required'),
  body('Metal_Type').optional().isIn(METAL_TYPES).withMessage(`Metal_Type must be one of: ${METAL_TYPES.join(', ')}`),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return sendValidationError(res, errors.array());
  const trx = await db.transaction();
  try {
    const tid      = req.user.tenantId;
    const voucherId = await genVoucherId(tid, 'PURCHASE');
    // Captured explicitly at entry now instead of only being guessed from
    // Purity text later at move-to-stock time — an explicit value wins,
    // otherwise inferred from the Purity typed in on this same form.
    const metalType = req.body.Metal_Type || inferMetalTypeFromPurityText(req.body.Purity);
    const [bin] = await trx('tbl_bin_purchase').insert({
      ...req.body, Tenant_ID: tid, Voucher_ID: voucherId, Metal_Type: metalType,
      Status: 'Pending', Data_Mode: modeVal(req),
      Created_By: req.user.username,
    }).returning('*');
    await registerVoucher(trx, tid, voucherId, 'PURCHASE', bin.Bin_ID, 'tbl_bin_purchase',
      `Purchase from ${req.body.Supplier_Name} — ${req.body.Gross_Weight}g`, req.user.username);
    await trx.commit();
    return sendSuccess(res, bin, `Purchase bin entry created. Voucher: ${voucherId}`, 201);
  } catch (err) { await trx.rollback(); console.error(err); return sendError(res, 500, 'Failed.'); }
});

router.put('/purchase/:id', authenticate, async (req, res) => {
  try {
    const [bin] = await db('tbl_bin_purchase')
      .where({ Bin_ID: req.params.id, Tenant_ID: req.user.tenantId })
      .update({ ...req.body, Modified_Date: new Date() }).returning('*');
    if (!bin) return sendError(res, 404, 'Not found.');
    return sendSuccess(res, bin, 'Updated.');
  } catch (err) { return sendError(res, 500, 'Failed.'); }
});

// ── Approve purchase bin entry ────────────────────────────────────────────────
router.post('/purchase/:id/approve', authenticate, async (req, res) => {
  try {
    const [bin] = await db('tbl_bin_purchase')
      .where({ Bin_ID: req.params.id, Tenant_ID: req.user.tenantId })
      .update({ Status: 'Approved', Approved_By: req.user.username, Approved_At: new Date(), Modified_Date: new Date() })
      .returning('*');
    if (!bin) return sendError(res, 404, 'Not found.');
    return sendSuccess(res, bin, 'Approved.');
  } catch (err) { return sendError(res, 500, 'Failed.'); }
});

// ── Move purchase bin → stock (creates ornament record) ───────────────────────
router.post('/purchase/:id/move-to-stock', authenticate, async (req, res) => {
  const trx = await db.transaction();
  try {
    const tid = req.user.tenantId;
    const bin = await trx('tbl_bin_purchase').where({ Bin_ID: req.params.id, Tenant_ID: tid }).first();
    if (!bin) { await trx.rollback(); return sendError(res, 404, 'Bin entry not found.'); }
    if (bin.Status === 'Moved_To_Stock') { await trx.rollback(); return sendError(res, 400, 'Already moved to stock.'); }

    // Auto-generate article number
    const last = await trx('tbl_ornament_master').where('Tenant_ID', tid).orderBy('Ornament_ID','desc').first();
    const seq  = last ? parseInt((last.Article_Number || '0').replace(/\D/g, '').slice(-5) || '0') + 1 : 1;
    const articleNumber = req.body.Article_Number || `ART-${tid.replace('_','')}-${String(seq).padStart(5,'0')}`;

    const goldRate = parseFloat(req.body.Gold_Rate || bin.Purchase_Rate || 0);
    const netWt    = parseFloat(bin.Net_Weight || bin.Gross_Weight || 0);
    const taxable  = netWt * goldRate + parseFloat(bin.Making_Charge || 0);
    const gst      = taxable * 0.03;
    const total    = taxable + gst;

    // tbl_bin_purchase now captures Metal_Type at entry time (see POST
    // /purchase above) — that real value wins. An explicit override on
    // THIS request wins over that, and bin entries logged before that
    // column existed fall back to inferring from the free-text Purity.
    const metalType = req.body.Metal_Type || bin.Metal_Type || inferMetalTypeFromPurityText(bin.Purity);

    const [ornament] = await trx('tbl_ornament_master').insert({
      Tenant_ID:                tid,
      Article_Number:           articleNumber,
      Metal_Type:               metalType,
      Gross_Weight:             bin.Gross_Weight,
      Net_Gold_Weight:          bin.Net_Weight || bin.Gross_Weight,
      Stone_Weight:             bin.Stone_Weight || 0,
      Current_Gold_Rate:        goldRate,
      Base_Making_Charge_Per_Gram: parseFloat(req.body.Making_Charge_Per_Gram || 0),
      Final_Making_Charge_Total:parseFloat(bin.Making_Charge || 0),
      Purchase_Cost:            bin.Purchase_Amount,
      Taxable_Value:            taxable,
      GST_Amount:               gst,
      Total_Price:              total,
      Supplier_ID:              bin.Supplier_ID || null,
      Is_Active:                true,
      Is_Stock_Available:       true,
      Bin_Source:               'PURCHASE_BIN',
      Bin_Voucher_ID:           bin.Voucher_ID,
      Data_Mode:                bin.Data_Mode,
      Created_By:               req.user.username,
    }).returning('*');

    // Update bin entry
    await trx('tbl_bin_purchase').where('Bin_ID', req.params.id).update({
      Status: 'Moved_To_Stock', Ornament_ID: ornament.Ornament_ID,
      Article_Number: articleNumber, Modified_Date: new Date(),
    });

    // Update voucher
    await trx('tbl_voucher_master').where('Voucher_ID', bin.Voucher_ID)
      .update({ Status: 'Converted', Description: `Moved to stock as ${articleNumber}` });

    await trx.commit();
    await auditLog({ tenantId: tid, userId: req.user.userId, tableName: 'tbl_ornament_master',
      recordId: ornament.Ornament_ID, actionType: 'INSERT',
      description: `Bin purchase ${bin.Voucher_ID} moved to stock as ${articleNumber}`, req });

    return sendSuccess(res, { ornament, articleNumber, voucherId: bin.Voucher_ID },
      `Item moved to stock. Article: ${articleNumber}`);
  } catch (err) { await trx.rollback(); console.error(err); return sendError(res, 500, `Failed: ${err.message}`); }
});

// ════════════════════════════════════════════════════════════════════════════
// SALES RETURN BIN
// ════════════════════════════════════════════════════════════════════════════
router.get('/sales-return', authenticate, async (req, res) => {
  const { status, page = 1, limit = 50, search } = req.query;
  try {
    let qb = db('tbl_bin_sales_return').where({ Tenant_ID: req.user.tenantId, Data_Mode: modeVal(req) });
    if (status) qb = qb.where('Status', status);
    if (search) qb = qb.where(function() {
      this.where('Voucher_ID','ilike',`%${search}%`)
        .orWhere('Customer_Name','ilike',`%${search}%`)
        .orWhere('Original_Invoice_Number','ilike',`%${search}%`);
    });
    const [{ count }] = await qb.clone().count('Return_ID as count');
    const data = await qb.orderBy('Created_Date','desc').limit(parseInt(limit)).offset((parseInt(page)-1)*parseInt(limit));
    return sendSuccess(res, { items: data, total: parseInt(count) });
  } catch (err) { return sendError(res, 500, 'Failed.'); }
});

router.post('/sales-return', authenticate, [
  body('Customer_Name').trim().notEmpty().withMessage('Customer name required'),
  body('Return_Date').isISO8601().withMessage('Return date required'),
  body('Gross_Weight').isFloat({ min: 0.001 }).withMessage('Weight required'),
  body('Metal_Type').optional().isIn(METAL_TYPES).withMessage(`Metal_Type must be one of: ${METAL_TYPES.join(', ')}`),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return sendValidationError(res, errors.array());
  const trx = await db.transaction();
  try {
    const tid = req.user.tenantId;
    const voucherId = await genVoucherId(tid, 'SALES_RETURN');
    const metalType = req.body.Metal_Type || inferMetalTypeFromPurityText(req.body.Purity);
    const [entry] = await trx('tbl_bin_sales_return').insert({
      ...req.body, Tenant_ID: tid, Voucher_ID: voucherId, Metal_Type: metalType,
      Status: 'Received', Data_Mode: modeVal(req), Created_By: req.user.username,
    }).returning('*');
    await registerVoucher(trx, tid, voucherId, 'SALES_RETURN', entry.Return_ID, 'tbl_bin_sales_return',
      `Return from ${req.body.Customer_Name} — Inv: ${req.body.Original_Invoice_Number || 'N/A'}`, req.user.username);
    await trx.commit();
    return sendSuccess(res, entry, `Sales return logged. Voucher: ${voucherId}`, 201);
  } catch (err) { await trx.rollback(); return sendError(res, 500, 'Failed.'); }
});

router.put('/sales-return/:id', authenticate, async (req, res) => {
  try {
    const [e] = await db('tbl_bin_sales_return')
      .where({ Return_ID: req.params.id, Tenant_ID: req.user.tenantId })
      .update({ ...req.body, Modified_Date: new Date() }).returning('*');
    if (!e) return sendError(res, 404, 'Not found.');
    return sendSuccess(res, e, 'Updated.');
  } catch (err) { return sendError(res, 500, 'Failed.'); }
});

// ── Sales return → move back to stock ────────────────────────────────────────
router.post('/sales-return/:id/move-to-stock', authenticate, async (req, res) => {
  const trx = await db.transaction();
  try {
    const tid  = req.user.tenantId;
    const entry = await trx('tbl_bin_sales_return').where({ Return_ID: req.params.id, Tenant_ID: tid }).first();
    if (!entry) { await trx.rollback(); return sendError(res, 404, 'Not found.'); }
    if (entry.Status === 'Moved_To_Stock') { await trx.rollback(); return sendError(res, 400, 'Already moved to stock.'); }

    const last = await trx('tbl_ornament_master').where('Tenant_ID', tid).orderBy('Ornament_ID','desc').first();
    const seq  = last ? parseInt((last.Article_Number || '0').replace(/\D/g, '').slice(-5) || '0') + 1 : 1;
    const articleNumber = req.body.Article_Number || `RET-${tid.replace('_','')}-${String(seq).padStart(5,'0')}`;

    const goldRate = parseFloat(req.body.Gold_Rate || 0);
    const netWt    = parseFloat(entry.Net_Weight || entry.Gross_Weight || 0);
    const total    = netWt * goldRate * 1.03;

    // tbl_bin_sales_return now captures Metal_Type at entry time (see
    // POST /sales-return above); an explicit override on this request
    // wins over that, and pre-migration entries fall back to Purity text.
    const metalType = req.body.Metal_Type || entry.Metal_Type || inferMetalTypeFromPurityText(entry.Purity);

    const [ornament] = await trx('tbl_ornament_master').insert({
      Tenant_ID:          tid,
      Article_Number:     articleNumber,
      Metal_Type:         metalType,
      Gross_Weight:       entry.Gross_Weight,
      Net_Gold_Weight:    entry.Net_Weight || entry.Gross_Weight,
      Current_Gold_Rate:  goldRate,
      // Missing entirely before this fix — Base_Making_Charge_Per_Gram is
      // NOT NULL on tbl_ornament_master, so this endpoint 500'd on every
      // single sales-return-to-stock conversion, completely independent
      // of the Metal_Type work above. Found incidentally while testing it.
      Base_Making_Charge_Per_Gram: parseFloat(req.body.Making_Charge_Per_Gram || 0),
      Purchase_Cost:      total,
      Taxable_Value:      netWt * goldRate,
      GST_Amount:         netWt * goldRate * 0.03,
      Total_Price:        total,
      Is_Active:          true,
      Is_Returned:        true,
      Is_Stock_Available: true,
      Bin_Source:         'SALES_RETURN_BIN',
      Bin_Voucher_ID:     entry.Voucher_ID,
      Data_Mode:          entry.Data_Mode,
      Created_By:         req.user.username,
    }).returning('*');

    await trx('tbl_bin_sales_return').where('Return_ID', req.params.id).update({
      Status: 'Moved_To_Stock', New_Ornament_ID: ornament.Ornament_ID,
      New_Article_Number: articleNumber, Modified_Date: new Date(),
    });
    await trx('tbl_voucher_master').where('Voucher_ID', entry.Voucher_ID)
      .update({ Status: 'Converted' });
    await trx.commit();
    return sendSuccess(res, { ornament, articleNumber },
      `Return item re-stocked as ${articleNumber}`);
  } catch (err) { await trx.rollback(); return sendError(res, 500, `Failed: ${err.message}`); }
});

// ════════════════════════════════════════════════════════════════════════════
// ORDERS BIN
// ════════════════════════════════════════════════════════════════════════════
router.get('/orders', authenticate, async (req, res) => {
  const { status, order_type, page = 1, limit = 50, search } = req.query;
  try {
    let qb = db('tbl_bin_orders').where({ Tenant_ID: req.user.tenantId, Data_Mode: modeVal(req) });
    if (status)     qb = qb.where('Status', status);
    if (order_type) qb = qb.where('Order_Type', order_type);
    if (search)     qb = qb.where(function() {
      this.where('Voucher_ID','ilike',`%${search}%`)
        .orWhere('Party_Name','ilike',`%${search}%`)
        .orWhere('Item_Description','ilike',`%${search}%`);
    });
    const [{ count }] = await qb.clone().count('Order_ID as count');
    const data = await qb.orderBy('Created_Date','desc').limit(parseInt(limit)).offset((parseInt(page)-1)*parseInt(limit));
    return sendSuccess(res, { items: data, total: parseInt(count) });
  } catch (err) { return sendError(res, 500, 'Failed.'); }
});

router.post('/orders', authenticate, [
  body('Party_Name').trim().notEmpty().withMessage('Party name required'),
  body('Order_Date').isISO8601().withMessage('Order date required'),
  body('Order_Type').isIn(['Customer','Karigar','Supplier']).withMessage('Order type required'),
  body('Metal_Type').optional().isIn(METAL_TYPES).withMessage(`Metal_Type must be one of: ${METAL_TYPES.join(', ')}`),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return sendValidationError(res, errors.array());
  const trx = await db.transaction();
  try {
    const tid = req.user.tenantId;
    const voucherId = await genVoucherId(tid, 'ORDER');
    const metalType = req.body.Metal_Type || inferMetalTypeFromPurityText(req.body.Purity);
    const [order] = await trx('tbl_bin_orders').insert({
      ...req.body, Tenant_ID: tid, Voucher_ID: voucherId, Metal_Type: metalType,
      Status: 'Pending', Data_Mode: modeVal(req), Created_By: req.user.username,
    }).returning('*');
    await registerVoucher(trx, tid, voucherId, 'ORDER', order.Order_ID, 'tbl_bin_orders',
      `${req.body.Order_Type} order — ${req.body.Party_Name}`, req.user.username);
    await trx.commit();

    // An advance collected at booking is real cash/bank money that has to
    // reach the ledger — this whole file previously had zero postJournal
    // calls, so every advance collected through any of the four bins was
    // silently invisible to Trial Balance/Cash Book (found via audit; the
    // other three bins — Purchase/Sales-Return/Pure-Gold — still need the
    // same fix as a tracked follow-up). Posted AFTER commit, same pattern
    // as sales.js/purchase.js, so a ledger hiccup never rolls back an
    // already-created order.
    const advance = parseFloat(order.Advance_Amount || 0);
    if (advance > 0) {
      const ledger = await resolveLedgerForPayment(db, tid, order.Payment_Mode || 'Cash');
      await postJournal({
        tenantId: tid, sourceType: 'BIN_ORDER', sourceId: order.Order_ID, reference: voucherId, branchId: order.Branch_ID,
        narration: `Advance for ${order.Order_Type} order ${voucherId} — ${order.Party_Name}`, createdBy: req.user.username, dataMode: modeVal(req),
        lines: [
          { account: ledger.account, group: ledger.group, sub: ledger.sub, type: 'Dr', amount: advance, narration: `Order advance | ${voucherId}` },
          { account: 'Customer Advance Account', group: 'Liabilities', sub: 'Advance', type: 'Cr', amount: advance, narration: `Order advance | ${voucherId}` },
        ],
      }).catch((err) => console.error('[BinManagement] Order advance journal failed (order still created fine):', err.message));
    }

    return sendSuccess(res, order, `Order created. Voucher: ${voucherId}`, 201);
  } catch (err) { await trx.rollback(); return sendError(res, 500, 'Failed.'); }
});

router.put('/orders/:id', authenticate, async (req, res) => {
  try {
    const [o] = await db('tbl_bin_orders')
      .where({ Order_ID: req.params.id, Tenant_ID: req.user.tenantId })
      .update({ ...req.body, Modified_Date: new Date() }).returning('*');
    if (!o) return sendError(res, 404, 'Not found.');
    return sendSuccess(res, o, 'Order updated.');
  } catch (err) { return sendError(res, 500, 'Failed.'); }
});

router.post('/orders/:id/status', authenticate, async (req, res) => {
  const { status, remarks } = req.body;
  const VALID = ['Pending','In_Progress','Manufacturing','Ready','Delivered','Cancelled'];
  if (!VALID.includes(status)) return sendError(res, 400, `Status must be one of: ${VALID.join(', ')}`);
  try {
    const [o] = await db('tbl_bin_orders')
      .where({ Order_ID: req.params.id, Tenant_ID: req.user.tenantId })
      .update({ Status: status, Remarks: remarks || null, Modified_Date: new Date() }).returning('*');
    if (!o) return sendError(res, 404, 'Not found.');
    return sendSuccess(res, o, `Order status updated to ${status}.`);
  } catch (err) { return sendError(res, 500, 'Failed.'); }
});

// ════════════════════════════════════════════════════════════════════════════
// PURE GOLD BIN
// ════════════════════════════════════════════════════════════════════════════
router.get('/pure-gold', authenticate, async (req, res) => {
  const { status, page = 1, limit = 50, search } = req.query;
  try {
    let qb = db('tbl_bin_pure_gold').where({ Tenant_ID: req.user.tenantId, Data_Mode: modeVal(req) });
    if (status) qb = qb.where('Status', status);
    if (search) qb = qb.where(function() {
      this.where('Voucher_ID','ilike',`%${search}%`)
        .orWhere('Supplier_Name','ilike',`%${search}%`)
        .orWhere('Piece_Number','ilike',`%${search}%`);
    });
    const [{ count }] = await qb.clone().count('Gold_ID as count');
    const data = await qb.orderBy('Created_Date','desc').limit(parseInt(limit)).offset((parseInt(page)-1)*parseInt(limit));

    // Holdings summary
    const [summary] = await db('tbl_bin_pure_gold')
      .where({ Tenant_ID: req.user.tenantId, Status: 'Holding', Data_Mode: modeVal(req) })
      .select(db.raw('COUNT(*) as count'), db.raw('SUM("Gross_Weight") as total_weight'), db.raw('SUM("Purchase_Amount") as total_value'));

    return sendSuccess(res, { items: data, total: parseInt(count), summary });
  } catch (err) { return sendError(res, 500, 'Failed.'); }
});

router.post('/pure-gold', authenticate, [
  body('Supplier_Name').trim().notEmpty().withMessage('Supplier required'),
  body('Purchase_Date').isISO8601().withMessage('Date required'),
  body('Gross_Weight').isFloat({ min: 0.001 }).withMessage('Weight required'),
  // Net_Weight is NOT NULL on tbl_bin_pure_gold — the Add-entry form
  // already marks it required, but the API itself never enforced this,
  // so a direct/API caller skipping it got a raw 500 instead of a clean
  // validation error. Found while testing the Metal_Type default above.
  body('Net_Weight').isFloat({ min: 0.001 }).withMessage('Net weight required'),
  body('Purchase_Amount').isFloat({ min: 1 }).withMessage('Amount required'),
  // This bin is "Pure Gold" by definition, so it defaults to Gold rather
  // than requiring every entry to pick it — but the column still exists
  // (see METAL_TYPES) so an unusual pure-silver/platinum holding can be
  // recorded accurately instead of being forced into Gold.
  body('Metal_Type').optional().isIn(METAL_TYPES).withMessage(`Metal_Type must be one of: ${METAL_TYPES.join(', ')}`),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return sendValidationError(res, errors.array());
  const trx = await db.transaction();
  try {
    const tid = req.user.tenantId;
    const voucherId = await genVoucherId(tid, 'PURE_GOLD');
    const [gold] = await trx('tbl_bin_pure_gold').insert({
      ...req.body, Tenant_ID: tid, Voucher_ID: voucherId, Metal_Type: req.body.Metal_Type || 'Gold',
      Status: 'Holding', Data_Mode: modeVal(req), Created_By: req.user.username,
    }).returning('*');
    await registerVoucher(trx, tid, voucherId, 'PURE_GOLD', gold.Gold_ID, 'tbl_bin_pure_gold',
      `${req.body.Gold_Type || 'Gold'} — ${req.body.Gross_Weight}g from ${req.body.Supplier_Name}`, req.user.username);
    await trx.commit();
    return sendSuccess(res, gold, `Pure gold entry created. Voucher: ${voucherId}`, 201);
  } catch (err) { await trx.rollback(); return sendError(res, 500, 'Failed.'); }
});

router.put('/pure-gold/:id', authenticate, async (req, res) => {
  try {
    const [g] = await db('tbl_bin_pure_gold')
      .where({ Gold_ID: req.params.id, Tenant_ID: req.user.tenantId })
      .update({ ...req.body, Modified_Date: new Date() }).returning('*');
    if (!g) return sendError(res, 404, 'Not found.');
    return sendSuccess(res, g, 'Updated.');
  } catch (err) { return sendError(res, 500, 'Failed.'); }
});

router.post('/pure-gold/:id/dispose', authenticate, async (req, res) => {
  const { method, remarks } = req.body; // Manufacturing | Direct_Sale | Transfer
  try {
    const [g] = await db('tbl_bin_pure_gold')
      .where({ Gold_ID: req.params.id, Tenant_ID: req.user.tenantId })
      .update({ Status: method === 'Direct_Sale' ? 'Sold' : method === 'Manufacturing' ? 'For_Manufacturing' : 'Transferred',
        Disposed_By: method, Disposed_At: new Date(), Remarks: remarks || null, Modified_Date: new Date() })
      .returning('*');
    if (!g) return sendError(res, 404, 'Not found.');
    return sendSuccess(res, g, `Gold entry marked as ${g.Status}.`);
  } catch (err) { return sendError(res, 500, 'Failed.'); }
});

// ── Dashboard summary across all bins ────────────────────────────────────────
router.get('/dashboard', authenticate, async (req, res) => {
  try {
    const tid = req.user.tenantId;
    const dm  = modeVal(req);
    const [pur] = await db('tbl_bin_purchase').where({ Tenant_ID: tid, Data_Mode: dm }).select(
      db.raw('COUNT(*) as total'),
      db.raw('COUNT(CASE WHEN "Status"=\'Pending\' THEN 1 END) as pending'),
      db.raw('COUNT(CASE WHEN "Status"=\'Approved\' THEN 1 END) as approved'),
      db.raw('COUNT(CASE WHEN "Status"=\'Moved_To_Stock\' THEN 1 END) as stocked'),
    );
    const [srb] = await db('tbl_bin_sales_return').where({ Tenant_ID: tid, Data_Mode: dm }).select(
      db.raw('COUNT(*) as total'),
      db.raw('COUNT(CASE WHEN "Status"=\'Received\' THEN 1 END) as pending'),
      db.raw('COUNT(CASE WHEN "Status"=\'Moved_To_Stock\' THEN 1 END) as stocked'),
    );
    const [ord] = await db('tbl_bin_orders').where({ Tenant_ID: tid, Data_Mode: dm }).select(
      db.raw('COUNT(*) as total'),
      db.raw('COUNT(CASE WHEN "Status"=\'Pending\' THEN 1 END) as pending'),
      db.raw('COUNT(CASE WHEN "Status"=\'Ready\' THEN 1 END) as ready'),
      db.raw('COUNT(CASE WHEN "Status"=\'Delivered\' THEN 1 END) as delivered'),
    );
    const [pg] = await db('tbl_bin_pure_gold').where({ Tenant_ID: tid, Data_Mode: dm }).select(
      db.raw('COUNT(*) as total'),
      db.raw('COALESCE(SUM(CASE WHEN "Status"=\'Holding\' THEN "Gross_Weight" ELSE 0 END),0) as holding_weight'),
      db.raw('COALESCE(SUM(CASE WHEN "Status"=\'Holding\' THEN "Purchase_Amount" ELSE 0 END),0) as holding_value'),
    );
    return sendSuccess(res, { purchase: pur, sales_return: srb, orders: ord, pure_gold: pg });
  } catch (err) { return sendError(res, 500, 'Failed.'); }
});

module.exports = router;
