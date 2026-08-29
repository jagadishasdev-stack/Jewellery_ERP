/**
 * Dealer Transaction — dealer-to-dealer trades (issue/receipt/purchase/
 * sale), settlement, and a real ledger. Genuinely absent before this —
 * only a cosmetic Customers->Dealers label swap existed. Dealers are
 * tbl_vendor_master rows (Vendor_Type='Dealer' or 'Both'), so the same
 * master CRUD (karigar.js's /vendor routes) and Vendor Ledger page
 * (reports.js's supplier-ledger, which is Vendor_ID-generic despite its
 * name) already cover dealer master data and purchase history if any
 * exists there — this route is specifically the day-to-day
 * issue/receipt/purchase/sale transaction log and settlement.
 */
const router = require('express').Router();
const { body, validationResult } = require('express-validator');
const db = require('../db/tenantDb').tenantDb;
const { sendSuccess, sendError, sendValidationError } = require('../utils/response');
const { authenticate } = require('../middleware/auth');
const { nextNumber } = require('../utils/numberFormat');
const { requireValidBranch, withBranch, resolveBranchForInsert } = require('../utils/branchAccess');
const { isValidMetalType } = require('../utils/metalTypes');

const TXN_TYPES = ['Issue', 'Receipt', 'Purchase', 'Sale'];

router.get('/', authenticate, requireValidBranch, async (req, res) => {
  try {
    const { dealerId, type, settlementStatus } = req.query;
    let qb = withBranch(db('tbl_dealer_transaction as dt')
      .where('dt.Tenant_ID', req.user.tenantId), req, 'dt.Branch_ID')
      .join('tbl_vendor_master as v', 'dt.Dealer_ID', 'v.Vendor_ID')
      .select('dt.*', 'v.Vendor_Name as Dealer_Name', 'v.Vendor_Code as Dealer_Code');
    if (dealerId) qb = qb.where('dt.Dealer_ID', dealerId);
    if (type) qb = qb.where('dt.Transaction_Type', type);
    if (settlementStatus) qb = qb.where('dt.Settlement_Status', settlementStatus);
    return sendSuccess(res, await qb.orderBy('dt.Created_Date', 'desc'));
  } catch (err) {
    return sendError(res, 500, 'Failed to fetch dealer transactions.');
  }
});

router.get('/outstanding', authenticate, async (req, res) => {
  try {
    const rows = await db('tbl_dealer_transaction as dt')
      .join('tbl_vendor_master as v', 'dt.Dealer_ID', 'v.Vendor_ID')
      .where('dt.Tenant_ID', req.user.tenantId)
      .whereIn('dt.Transaction_Type', ['Purchase', 'Sale'])
      .where('dt.Settlement_Status', 'Pending')
      .groupBy('dt.Dealer_ID', 'v.Vendor_Name', 'v.Vendor_Code')
      .select(
        'dt.Dealer_ID', 'v.Vendor_Name', 'v.Vendor_Code',
        db.raw(`SUM(CASE WHEN dt."Transaction_Type" = 'Purchase' THEN dt."Amount" ELSE 0 END) as payable`),
        db.raw(`SUM(CASE WHEN dt."Transaction_Type" = 'Sale' THEN dt."Amount" ELSE 0 END) as receivable`),
      );
    return sendSuccess(res, rows);
  } catch (err) {
    return sendError(res, 500, 'Failed to fetch dealer outstanding.');
  }
});

router.post('/', authenticate, requireValidBranch, [
  body('Dealer_ID').isInt(),
  body('Transaction_Type').isIn(TXN_TYPES),
  body('Amount').isFloat({ gt: 0 }),
  body('Metal_Type').custom(async (value) => { if (!(await isValidMetalType(value))) throw new Error('Invalid metal type'); return true; }),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return sendValidationError(res, errors.array());
  try {
    const dealer = await db('tbl_vendor_master').where({ Vendor_ID: req.body.Dealer_ID, Tenant_ID: req.user.tenantId }).first();
    if (!dealer) return sendError(res, 404, 'Dealer not found.');
    if (!['Dealer', 'Both'].includes(dealer.Vendor_Type)) return sendError(res, 400, `${dealer.Vendor_Name} is not set up as a Dealer (Vendor_Type is ${dealer.Vendor_Type}).`);

    const voucherNumber = await nextNumber({ tenantId: req.user.tenantId, table: 'tbl_dealer_transaction', column: 'Voucher_Number', prefix: 'DLR', tenantCode: req.user.tenantId, padWidth: 5 });
    const [row] = await db('tbl_dealer_transaction').insert({
      Tenant_ID: req.user.tenantId,
      Branch_ID: resolveBranchForInsert(req, req.body.Branch_ID),
      Voucher_Number: voucherNumber,
      Dealer_ID: req.body.Dealer_ID,
      Transaction_Type: req.body.Transaction_Type,
      Metal_Type: req.body.Metal_Type,
      Weight: req.body.Weight || null,
      Rate_Per_Gram: req.body.Rate_Per_Gram || null,
      Amount: req.body.Amount,
      // Issue/Receipt never owe real money — only Purchase/Sale get a
      // real Pending/Settled lifecycle; marking them Settled immediately
      // would misrepresent a consignment movement as paid-for.
      Settlement_Status: ['Purchase', 'Sale'].includes(req.body.Transaction_Type) ? 'Pending' : 'Settled',
      Notes: req.body.Notes || null,
      Created_By: req.user.username,
    }).returning('*');
    return sendSuccess(res, row, `${voucherNumber} created.`, 201);
  } catch (err) {
    return sendError(res, 500, 'Failed to create dealer transaction.');
  }
});

router.post('/:id/settle', authenticate, async (req, res) => {
  try {
    const txn = await db('tbl_dealer_transaction').where({ Transaction_ID: req.params.id, Tenant_ID: req.user.tenantId }).first();
    if (!txn) return sendError(res, 404, 'Transaction not found.');
    if (!['Purchase', 'Sale'].includes(txn.Transaction_Type)) return sendError(res, 400, 'Only Purchase/Sale transactions carry a settlement status.');
    if (txn.Settlement_Status === 'Settled') return sendError(res, 400, 'Already settled.');
    const [row] = await db('tbl_dealer_transaction').where({ Transaction_ID: req.params.id }).update({ Settlement_Status: 'Settled' }).returning('*');
    return sendSuccess(res, row, 'Marked settled.');
  } catch (err) {
    return sendError(res, 500, 'Failed to settle.');
  }
});

module.exports = router;
