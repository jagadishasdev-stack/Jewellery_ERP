const router = require('express').Router();
const { body, validationResult } = require('express-validator');
const db = require('../db/tenantDb').tenantDb;
const { sendSuccess, sendError, sendValidationError } = require('../utils/response');
const { authenticate } = require('../middleware/auth');
const { postJournal } = require('../utils/accountingEngine');
const { resolveLedgerForPayment } = require('../utils/paymentLedgerMap');
const { nextNumber } = require('../utils/numberFormat');
const dayjs = require('dayjs');

const genJobCard = async (tenantId) => nextNumber({
  tenantId, table: 'tbl_repair_orders', column: 'Job_Card_Number',
  prefix: 'JOB', tenantCode: tenantId.replace('_',''), padWidth: 4,
});

// ── GET /api/repair  ──────────────────────────────────────────────────────────
router.get('/', authenticate, async (req, res) => {
  const { status, page = 1, limit = 30 } = req.query;
  try {
    let qb = db('tbl_repair_orders as r')
      .leftJoin('tbl_customer_master as c', 'r.Customer_ID', 'c.Customer_ID')
      .leftJoin('tbl_vendor_master as k', 'r.Assigned_Karigar_ID', 'k.Vendor_ID')
      .where('r.Tenant_ID', req.user.tenantId)
      .select('r.*', 'c.Customer_Name as Cust_Name', 'k.Vendor_Name as Karigar_Name');
    if (status) qb = qb.where('r.Status', status);
    // Clean count to avoid GROUP BY issue with JOINs
    const countQb = db('tbl_repair_orders').where('Tenant_ID', req.user.tenantId);
    if (status) countQb.where('Status', status);
    const [{ count }] = await countQb.count('Repair_ID as count');
    const data = await qb.orderBy('r.Received_Date','desc')
      .limit(parseInt(limit)).offset((parseInt(page)-1)*parseInt(limit));
    return sendSuccess(res, { items: data, total: parseInt(count) });
  } catch (err) { return sendError(res, 500, 'Failed to fetch repairs.'); }
});

// ── POST /api/repair  ─────────────────────────────────────────────────────────
router.post('/', authenticate, [
  body('Item_Description').notEmpty().withMessage('Item description required'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return sendValidationError(res, errors.array());
  try {
    const tenantId = req.user.tenantId;
    const jobCardNumber = await genJobCard(tenantId);
    // Payment_Mode/Bank_Account_ID aren't real columns on this table —
    // pulled out before insert; only used below if an advance was collected.
    const { Payment_Mode, Bank_Account_ID, ...orderData } = req.body;
    const [repair] = await db('tbl_repair_orders').insert({
      ...orderData, Tenant_ID: tenantId, Job_Card_Number: jobCardNumber,
      Status: 'Received', Created_By: req.user.username,
    }).returning('*');

    // An advance collected at intake is real cash/bank in hand — this
    // used to just sit in Advance_Paid with no ledger entry at all.
    const advance = parseFloat(repair.Advance_Paid || 0);
    if (advance > 0) {
      const ledger = await resolveLedgerForPayment(db, tenantId, Payment_Mode || 'Cash', Bank_Account_ID);
      // Awaited — was fire-and-forget, so the response could go out before
      // this journal was guaranteed committed (see sales.js's identical
      // fix for the concrete failure mode this caused).
      await postJournal({
        tenantId, sourceType: 'JOURNAL', sourceId: repair.Repair_ID, reference: jobCardNumber,
        narration: `Repair advance collected — ${jobCardNumber}`, createdBy: req.user.username,
        lines: [
          { account: ledger.account, group: ledger.group, sub: ledger.sub, type: 'Dr', amount: advance },
          { account: 'Repair Income Account', group: 'Income', sub: 'Direct Income', type: 'Cr', amount: advance },
        ],
      }).catch((e) => console.error('[Repair] Advance ledger post failed (job card still created fine):', e.message));
    }

    return sendSuccess(res, repair, 'Repair job card created.', 201);
  } catch (err) { return sendError(res, 500, 'Failed to create repair.'); }
});

// ── PUT /api/repair/:id  ──────────────────────────────────────────────────────
router.put('/:id', authenticate, async (req, res) => {
  try {
    const [updated] = await db('tbl_repair_orders')
      .where({ Repair_ID: req.params.id, Tenant_ID: req.user.tenantId })
      .update({ ...req.body, Modified_Date: new Date() })
      .returning('*');
    if (!updated) return sendError(res, 404, 'Repair not found.');
    return sendSuccess(res, updated, 'Repair updated.');
  } catch (err) { return sendError(res, 500, 'Failed to update repair.'); }
});

// ── POST /api/repair/:id/deliver  ─────────────────────────────────────────────
// Used to just zero Balance_Due unconditionally — Payment_Mode/Final_Cost
// sent by a caller were silently discarded: never stored, never posted,
// no record of how (or whether) the remaining balance was actually paid.
router.post('/:id/deliver', authenticate, async (req, res) => {
  const tenantId = req.user.tenantId;
  try {
    const order = await db('tbl_repair_orders').where({ Repair_ID: req.params.id, Tenant_ID: tenantId }).first();
    if (!order) return sendError(res, 404, 'Repair not found.');

    const amountDue = Math.max(0, parseFloat(order.Balance_Due || 0) || (parseFloat(order.Total_Charge || 0) - parseFloat(order.Advance_Paid || 0)));
    const collected = req.body.Final_Cost != null ? parseFloat(req.body.Final_Cost) : amountDue;

    const [updated] = await db('tbl_repair_orders')
      .where({ Repair_ID: req.params.id, Tenant_ID: tenantId })
      .update({
        Status: 'Delivered',
        Actual_Delivery: new Date(),
        Advance_Paid: parseFloat(order.Advance_Paid || 0) + Math.max(0, collected),
        Balance_Due: 0,
        Modified_Date: new Date(),
      }).returning('*');

    // The balance collected at delivery is real cash/bank — this used to
    // never be recorded anywhere, not even which payment mode was used.
    if (collected > 0) {
      const ledger = await resolveLedgerForPayment(db, tenantId, req.body.Payment_Mode || 'Cash', req.body.Bank_Account_ID);
      // Awaited — same fire-and-forget fix as the advance journal above.
      await postJournal({
        tenantId, sourceType: 'JOURNAL', sourceId: order.Repair_ID, reference: order.Job_Card_Number,
        narration: `Repair delivered — ${order.Job_Card_Number}`, createdBy: req.user.username,
        lines: [
          { account: ledger.account, group: ledger.group, sub: ledger.sub, type: 'Dr', amount: collected },
          { account: 'Repair Income Account', group: 'Income', sub: 'Direct Income', type: 'Cr', amount: collected },
        ],
      }).catch((e) => console.error('[Repair] Delivery ledger post failed (delivery still recorded fine):', e.message));
    }

    return sendSuccess(res, updated, 'Item delivered to customer.');
  } catch (err) { return sendError(res, 500, 'Failed to deliver.'); }
});

module.exports = router;
