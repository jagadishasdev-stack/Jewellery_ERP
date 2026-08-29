const router = require('express').Router();
const { body, validationResult } = require('express-validator');
const db = require('../db/tenantDb').tenantDb;
const { sendSuccess, sendError, sendValidationError } = require('../utils/response');
const { authenticate, requirePermission } = require('../middleware/auth');
const { generateArticleNumber } = require('../utils/invoiceNumber');
const { nextNumber } = require('../utils/numberFormat');
const { auditLog } = require('../utils/auditLogger');
const { postJournal } = require('../utils/accountingEngine');
const { resolveLedgerForPayment } = require('../utils/paymentLedgerMap');
const { resolveStockLedger } = require('../utils/stockLedgerMap');
const dayjs = require('dayjs');
const { modeVal } = require('../utils/dataModeFilter');
const { requireValidBranch, withBranch, resolveBranchForInsert } = require('../utils/branchAccess');

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

// ── Post double-entry accounting journal for a purchase ────────────────────────
// Purchase is always booked on full accrual — Dr Inventory + Input GST,
// Cr Supplier Payable for the WHOLE invoice amount, matching the existing
// (pre-this-change) behavior of crediting the supplier's Current_Balance
// for the full Total_Amount regardless of what's paid immediately. If
// Amount_Paid is also given, a SEPARATE payment journal reduces the payable
// right away — two distinct vouchers (Purchase Invoice, then Payment),
// exactly the pattern the design doc calls for, not one blended entry.
//
// stockByMetal — {metalType: amount} — used to be a single hardcoded Dr to
// 'Gold Stock Account' regardless of what was actually bought, so a
// silver/platinum/diamond purchase inflated the gold ledger instead of
// its own account even though 1007/1008/1014 exist for exactly this
// (found via audit). One Dr line per metal type actually present in the
// invoice now, via the same resolver sales.js's COGS posting uses.
async function postPurchaseAccountingEntries({ tenantId, purchaseId, purchaseNumber, subtotal, stockByMetal = {}, gstAmount, cgstAmount, sgstAmount, igstAmount, amountPaid, paymentMode, bankAccountId, operator, dataMode = 3, branchId }) {
  const buckets = { ...stockByMetal };
  const bucketedTotal = round2(Object.values(buckets).reduce((s, amt) => s + (amt || 0), 0));
  // Guard against the header's Subtotal_Amount disagreeing with the sum of
  // line items (a manual override, or rounding) — the accrual Dr side
  // must sum to EXACTLY `subtotal` or postJournal()'s balance check drops
  // the whole journal. Any difference is folded into the first metal type
  // present (or Gold, if there were no line items at all) rather than
  // silently lost.
  const remainder = round2(subtotal - bucketedTotal);
  if (Math.abs(remainder) >= 0.01) {
    const key = Object.keys(buckets)[0] || 'Gold';
    buckets[key] = round2((buckets[key] || 0) + remainder);
  }
  const accrualLines = Object.entries(buckets).filter(([, amt]) => Math.abs(amt) >= 0.01).map(([metalType, amount]) => {
    const ledger = resolveStockLedger(metalType);
    return { account: ledger.account, group: ledger.group, sub: ledger.sub, type: 'Dr', amount: round2(amount), narration: `Purchase | ${purchaseNumber}` };
  });
  if (cgstAmount > 0) accrualLines.push({ account: 'Input CGST Account', group: 'Assets', sub: 'Tax Credit', type: 'Dr', amount: cgstAmount, narration: `Input CGST | ${purchaseNumber}` });
  if (sgstAmount > 0) accrualLines.push({ account: 'Input SGST Account', group: 'Assets', sub: 'Tax Credit', type: 'Dr', amount: sgstAmount, narration: `Input SGST | ${purchaseNumber}` });
  if (igstAmount > 0) accrualLines.push({ account: 'Input IGST Account', group: 'Assets', sub: 'Tax Credit', type: 'Dr', amount: igstAmount, narration: `Input IGST | ${purchaseNumber}` });
  accrualLines.push({ account: 'Supplier Payable Account', group: 'Liabilities', sub: 'Payable', type: 'Cr', amount: subtotal + (gstAmount || 0), narration: `Purchase | ${purchaseNumber}` });

  const { journalNumber } = await postJournal({
    tenantId, sourceType: 'PURCHASE', sourceId: purchaseId, reference: purchaseNumber, branchId,
    narration: `Purchase invoice ${purchaseNumber}`, lines: accrualLines, createdBy: operator, dataMode,
  });

  if (parseFloat(amountPaid || 0) > 0) {
    const ledger = await resolveLedgerForPayment(db, tenantId, paymentMode, bankAccountId);
    await postJournal({
      tenantId, sourceType: 'PAYMENT', sourceId: purchaseId, reference: purchaseNumber, branchId,
      narration: `Payment against ${purchaseNumber}`,
      lines: [
        { account: 'Supplier Payable Account', group: 'Liabilities', sub: 'Payable', type: 'Dr', amount: amountPaid, narration: `Paid against ${purchaseNumber}` },
        { account: ledger.account, group: ledger.group, sub: ledger.sub, type: 'Cr', amount: amountPaid, narration: `Paid against ${purchaseNumber}` },
      ],
      createdBy: operator, dataMode,
    });
  }

  return journalNumber;
}

const genPurchaseNumber = async (tenantId) => nextNumber({
  tenantId, table: 'tbl_purchase_header', column: 'Purchase_Number',
  prefix: 'PUR', tenantCode: tenantId.replace('_',''), padWidth: 4,
});

// ── GET /api/purchase  ────────────────────────────────────────────────────────
router.get('/', authenticate, requireValidBranch, async (req, res) => {
  const { status, supplierId, purchaseType, page = 1, limit = 30 } = req.query;
  try {
    let qb = db('tbl_purchase_header as p')
      .leftJoin('tbl_vendor_master as v','p.Supplier_ID','v.Vendor_ID')
      .where('p.Tenant_ID', req.user.tenantId)
      .where('p.Data_Mode', modeVal(req))
      .modify((q) => withBranch(q, req, 'p.Branch_ID'))
      .select(
        'p.Purchase_ID', 'p.Purchase_Number', 'p.Purchase_Date',
        'p.Purchase_Type', 'p.Supplier_ID', 'p.Supplier_Invoice_No',
        'p.Subtotal_Amount', 'p.GST_Amount', 'p.Total_Amount',
        'p.Amount_Paid', 'p.Balance_Amount', 'p.Payment_Status',
        'p.Payment_Mode', 'p.Status', 'p.Notes', 'p.Created_By', 'p.Created_Date',
        db.raw('COALESCE(v."Vendor_Name", p."Supplier_Name") AS "Supplier_Name_Resolved"')
      );
    if (status) qb = qb.where('p.Status', status);
    if (supplierId) qb = qb.where('p.Supplier_ID', supplierId);
    if (purchaseType) qb = qb.where('p.Purchase_Type', purchaseType);
    // Count with a clean subquery — avoids GROUP BY conflicts
    let countQb = withBranch(db('tbl_purchase_header')
      .where('Tenant_ID', req.user.tenantId), req);
    if (status) countQb = countQb.where('Status', status);
    if (supplierId) countQb = countQb.where('Supplier_ID', supplierId);
    if (purchaseType) countQb = countQb.where('Purchase_Type', purchaseType);
    const [{ count }] = await countQb.count('Purchase_ID as count');
    const data = await qb.orderBy('p.Purchase_Date','desc')
      .limit(parseInt(limit)).offset((parseInt(page)-1)*parseInt(limit));
    return sendSuccess(res, { items: data, total: parseInt(count) });
  } catch (err) { console.error('Purchase list error:', err.message); return sendError(res, 500, 'Failed to fetch purchases.'); }
});

// ── POST /api/purchase/create  ────────────────────────────────────────────────
router.post('/create', authenticate, requireValidBranch, requirePermission('inventory'), [
  body('items').isArray({ min: 1 }),
  body('Total_Amount').isFloat({ min: 0.01 }),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return sendValidationError(res, errors.array());
  const trx = await db.transaction();
  try {
    const tenantId = req.user.tenantId;
    const purchaseNumber = await genPurchaseNumber(tenantId);
    const { items, ...header } = req.body;
    // Multi-Branch Management — resolved once, reused for both the
    // purchase header and every ornament it creates below, so they never
    // disagree with each other. See utils/branchAccess.js.
    const branchId = resolveBranchForInsert(req, header.Branch_ID);

    // Balance_Amount/Payment_Status were never actually computed at
    // creation — both columns just sat at their raw DB defaults
    // (Balance_Amount=0, Payment_Status='Pending') regardless of the real
    // total, so a purchase with no payment yet showed a ZERO balance
    // instead of owing the full amount. Computed here the same way
    // sales.js computes its own Payment_Status/Balance_Amount.
    const purchaseAmountPaid = parseFloat(header.Amount_Paid || 0);
    const purchaseTotal = parseFloat(header.Total_Amount || 0);
    const purchaseBalance = Math.max(0, round2(purchaseTotal - purchaseAmountPaid));
    const purchasePaymentStatus = purchaseBalance <= 0.01 ? 'Paid' : purchaseAmountPaid > 0 ? 'Partial' : 'Pending';

    const [purchase] = await trx('tbl_purchase_header').insert({
      ...header,
      Tenant_ID: tenantId,
      Branch_ID: branchId,
      Purchase_Number: purchaseNumber,
      Status: 'Draft',
      Data_Mode: modeVal(req),
      Amount_Paid: purchaseAmountPaid,
      Balance_Amount: purchaseBalance,
      Payment_Status: purchasePaymentStatus,
      Created_By: req.user.username,
    }).returning('*');

    // HSN was only ever resolved via a live join at report time — never
    // captured on the ornament itself. Snapshotted here at creation, same
    // as the ornaments.js create route now does, so a later edit to an
    // item type's HSN code doesn't silently rewrite past tax history.
    const typeIdsInPurchase = [...new Set(items.map((i) => i.Type_ID).filter(Boolean))];
    const hsnByTypeId = typeIdsInPurchase.length > 0
      ? Object.fromEntries((await trx('tbl_item_type_master').whereIn('Type_ID', typeIdsInPurchase).select('Type_ID', 'HSN_Code')).map((t) => [t.Type_ID, t.HSN_Code]))
      : {};

    // Insert line items and create ornament records
    const lineItems = [];
    for (const item of items) {
      // Auto-generate article number and create ornament in inventory
      const articleNumber = item.Article_Number || await generateArticleNumber(tenantId);
      let ornamentId = null;
      const hsnCode = item.HSN_Code || (item.Type_ID ? hsnByTypeId[item.Type_ID] : null) || null;

      if (item.Create_Inventory !== false) {
        const [ornament] = await trx('tbl_ornament_master').insert({
          Tenant_ID: tenantId,
          Branch_ID: branchId,
          Article_Number: articleNumber,
          Type_ID: item.Type_ID || null,
          Purity_ID: item.Purity_ID || null,
          // Omitted (not explicitly null'd) when the caller doesn't send one —
          // the column's own NOT NULL default ('Gold') applies instead.
          ...(item.Metal_Type ? { Metal_Type: item.Metal_Type } : {}),
          Gross_Weight: item.Gross_Weight,
          Net_Gold_Weight: parseFloat(item.Gross_Weight || 0) - parseFloat(item.Stone_Weight || 0),
          Stone_Weight: item.Stone_Weight || 0,
          Current_Gold_Rate: item.Gold_Rate || 0,
          Base_Making_Charge_Per_Gram: item.Making_Charge || 0,
          Purchase_Cost: item.Purchase_Rate,
          Taxable_Value: item.Purchase_Rate,
          Total_Price: item.Purchase_Rate,
          HSN_Code: hsnCode,
          Supplier_ID: header.Supplier_ID || null,
          Is_Active: true,
          Is_Stock_Available: true,
          Data_Mode: modeVal(req),
          Created_By: req.user.username,
        }).returning('*');
        ornamentId = ornament.Ornament_ID;
      }

      lineItems.push({
        Purchase_ID: purchase.Purchase_ID,
        Tenant_ID: tenantId,
        Ornament_ID: ornamentId,
        Article_Number: articleNumber,
        Type_ID: item.Type_ID || null,
        Item_Description: item.Item_Description || '',
        Quantity: item.Quantity || 1,
        Gross_Weight: item.Gross_Weight,
        Stone_Weight: item.Stone_Weight || 0,
        Net_Weight: parseFloat(item.Gross_Weight||0) - parseFloat(item.Stone_Weight||0),
        Purity_Code: item.Purity_Code || '',
        Gold_Rate: item.Gold_Rate || 0,
        Making_Charge: item.Making_Charge || 0,
        Stone_Value: item.Stone_Value || 0,
        Purchase_Rate: item.Purchase_Rate,
        Total_Line_Value: item.Purchase_Rate,
        HSN_Code: hsnCode,
        Created_By: req.user.username,
      });
    }

    await trx('tbl_purchase_details').insert(lineItems);

    // Update supplier balance
    if (header.Supplier_ID) {
      await trx('tbl_vendor_master').where({ Vendor_ID: header.Supplier_ID })
        .update({ Current_Balance: db.raw(`"Current_Balance" + ?`, [header.Total_Amount]) });
    }

    // ── GST split — same intra vs inter-state logic as sales.js, using the
    // supplier's registered state instead of a customer's. Only meaningful
    // if the caller actually sent a GST_Amount — the current Purchase Hub
    // UI doesn't compute GST at all yet (Subtotal_Amount === Total_Amount),
    // so this is 0/0/0 for every purchase made through it today; the
    // accounting posting below still runs and books the accrual correctly
    // either way.
    let cgstAmount = 0, sgstAmount = 0, igstAmount = 0;
    const gstAmount = parseFloat(header.GST_Amount || 0);
    if (gstAmount > 0) {
      const tenantRow = await trx('tbl_tenant_master').where({ Tenant_ID: tenantId }).select('State').first();
      const supplierRow = header.Supplier_ID ? await trx('tbl_vendor_master').where({ Vendor_ID: header.Supplier_ID }).select('State').first() : null;
      const tenantState = (tenantRow?.State || '').trim().toLowerCase();
      const supplierState = (supplierRow?.State || '').trim().toLowerCase();
      const isInterstate = !!(tenantState && supplierState && tenantState !== supplierState);
      cgstAmount = isInterstate ? 0 : Math.round((gstAmount / 2) * 100) / 100;
      sgstAmount = isInterstate ? 0 : Math.round((gstAmount / 2) * 100) / 100;
      igstAmount = isInterstate ? gstAmount : 0;
      await trx('tbl_purchase_header').where({ Purchase_ID: purchase.Purchase_ID })
        .update({ CGST_Amount: cgstAmount, SGST_Amount: sgstAmount, IGST_Amount: igstAmount, Is_Interstate: isInterstate });
    }

    await trx.commit();
    await auditLog({ tenantId, userId: req.user.userId, tableName: 'tbl_purchase_header', recordId: purchase.Purchase_ID, actionType: 'INSERT', newData: purchase, req });

    // Subtotal_Amount is meant to already be the pre-tax taxable value; the
    // current Purchase Hub UI sets it equal to Total_Amount (no GST at
    // all), which is exactly right when GST_Amount is 0 too. If GST_Amount
    // is ever non-zero without a distinct Subtotal_Amount also given,
    // derive it by removing GST from the total rather than double-counting it.
    const totalAmount = parseFloat(header.Total_Amount || 0);
    const subtotal = header.Subtotal_Amount !== undefined && parseFloat(header.Subtotal_Amount) !== totalAmount
      ? parseFloat(header.Subtotal_Amount)
      : totalAmount - gstAmount;

    // Same Metal_Type per line item as the ornament insert above uses
    // (defaults to 'Gold' when omitted, matching that column's own NOT
    // NULL default) — so the accrual posted below Dr's each metal's own
    // stock account instead of dumping every purchase into Gold's.
    const stockByMetal = {};
    for (const item of items) {
      const metal = item.Metal_Type || 'Gold';
      stockByMetal[metal] = round2((stockByMetal[metal] || 0) + parseFloat(item.Purchase_Rate || 0));
    }

    // Awaited (not fire-and-forget) — every sibling module in this
    // codebase was already fixed for exactly this failure mode (a
    // response returning before the journal insert is guaranteed
    // committed races a report run immediately after); this route was
    // the one left behind (found via audit). Still non-fatal to the
    // purchase itself on failure — it already committed.
    await postPurchaseAccountingEntries({
      tenantId, purchaseId: purchase.Purchase_ID, purchaseNumber,
      subtotal, stockByMetal, gstAmount, cgstAmount, sgstAmount, igstAmount,
      amountPaid: header.Amount_Paid, paymentMode: header.Payment_Mode, bankAccountId: header.Bank_Account_ID,
      operator: req.user.username, dataMode: modeVal(req), branchId: purchase.Branch_ID,
    }).catch((e) => console.warn('Purchase accounting post failed (non-fatal):', e.message));

    return sendSuccess(res, purchase, 'Purchase entry created.', 201);
  } catch (err) {
    await trx.rollback();
    console.error('Purchase create error:', err);
    return sendError(res, 500, 'Failed to create purchase.');
  }
});

// ── GET /api/purchase/:id  ────────────────────────────────────────────────────
router.get('/:id', authenticate, async (req, res) => {
  try {
    const purchase = await db('tbl_purchase_header as p')
      .leftJoin('tbl_vendor_master as v','p.Supplier_ID','v.Vendor_ID')
      .where({ 'p.Purchase_ID': req.params.id, 'p.Tenant_ID': req.user.tenantId })
      .select(
        'p.*',
        db.raw('COALESCE(v."Vendor_Name", p."Supplier_Name") AS "Supplier_Name_Resolved"')
      )
      .first();
    if (!purchase) return sendError(res, 404, 'Purchase not found.');
    const items = await db('tbl_purchase_details').where({ Purchase_ID: req.params.id });
    return sendSuccess(res, { purchase, items });
  } catch (err) {
    console.error('Purchase detail error:', err);
    return sendError(res, 500, 'Failed to fetch purchase.');
  }
});

// ── POST /api/purchase/:id/approve  ───────────────────────────────────────────
// Real second-person sign-off: the same user who created the purchase
// cannot also approve it, and only a Draft can be approved (previously
// this was a rubber stamp — no permission check, no creator/approver
// separation, no status guard, so any user could approve their own
// entry, or re-approve an already-approved one, any number of times).
router.post('/:id/approve', authenticate, requirePermission('inventory'), async (req, res) => {
  try {
    const purchase = await db('tbl_purchase_header').where({ Purchase_ID: req.params.id, Tenant_ID: req.user.tenantId }).first();
    if (!purchase) return sendError(res, 404, 'Purchase not found.');
    if (purchase.Status !== 'Draft') return sendError(res, 400, `Only a Draft purchase can be approved (this one is ${purchase.Status}).`);
    if (purchase.Created_By === req.user.username) return sendError(res, 403, 'The purchase must be approved by someone other than who created it.');

    const [updated] = await db('tbl_purchase_header')
      .where({ Purchase_ID: req.params.id, Tenant_ID: req.user.tenantId })
      .update({ Status: 'Approved', Approved_By: req.user.username, Approved_Date: new Date() })
      .returning('*');
    return sendSuccess(res, updated, 'Purchase approved.');
  } catch (err) { return sendError(res, 500, 'Failed to approve.'); }
});

// ── POST /api/purchase/:id/receive ────────────────────────────────────────────
// tbl_purchase_header.Status has declared 'Received' as a real state since
// the table was created (Draft, Approved, Received, Cancelled) but no
// route anywhere ever set it — an Approved purchase had no way to record
// that its goods actually arrived. Needed for Ready Order Purchase's QC
// gate (an order can't be marked Ready off an unreceived purchase), but
// real and useful on its own regardless of that.
router.post('/:id/receive', authenticate, requirePermission('inventory'), async (req, res) => {
  try {
    const purchase = await db('tbl_purchase_header').where({ Purchase_ID: req.params.id, Tenant_ID: req.user.tenantId }).first();
    if (!purchase) return sendError(res, 404, 'Purchase not found.');
    if (purchase.Status !== 'Approved') return sendError(res, 400, `Only an Approved purchase can be received (this one is ${purchase.Status}).`);
    const [updated] = await db('tbl_purchase_header')
      .where({ Purchase_ID: req.params.id, Tenant_ID: req.user.tenantId })
      .update({ Status: 'Received' })
      .returning('*');
    return sendSuccess(res, updated, 'Purchase marked Received.');
  } catch (err) { return sendError(res, 500, 'Failed to mark purchase received.'); }
});

// ── POST /api/purchase/:id/pay-supplier  ──────────────────────────────────────
// There was no way anywhere in this file to ever pay down a purchase's
// Balance_Amount — Payment_Status was hardcoded 'Pending' client-side and
// no route updated Amount_Paid/Balance_Amount/Payment_Status, so
// Supplier Payable Account only ever grew (found via audit; the payment-
// journal branch in postPurchaseAccountingEntries above was unreachable
// dead code for exactly this reason — Amount_Paid was never sent except
// at creation). This is the missing settle route, mirroring sales.js's
// own receive-payment route exactly.
router.post('/:id/pay-supplier', authenticate, requirePermission('inventory'), requireValidBranch, [
  body('Amount').isFloat({ gt: 0 }).withMessage('A positive amount is required'),
  body('Payment_Mode').notEmpty().withMessage('Payment mode is required'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return sendValidationError(res, errors.array());
  const trx = await db.transaction();
  try {
    const purchase = await trx('tbl_purchase_header').where({ Purchase_ID: req.params.id, Tenant_ID: req.user.tenantId }).forUpdate().first();
    if (!purchase) { await trx.rollback(); return sendError(res, 404, 'Purchase not found.'); }
    if (!['Partial', 'Pending'].includes(purchase.Payment_Status)) {
      await trx.rollback();
      return sendError(res, 400, `This purchase is ${purchase.Payment_Status} — there's no outstanding balance to pay.`);
    }

    const amount = round2(parseFloat(req.body.Amount));
    const currentBalance = round2(parseFloat(purchase.Balance_Amount || 0));
    if (amount > currentBalance + 0.01) {
      await trx.rollback();
      return sendError(res, 400, `Amount exceeds the outstanding balance of ₹${currentBalance.toFixed(2)}.`);
    }

    const newBalance = round2(currentBalance - amount);
    const newAmountPaid = round2(parseFloat(purchase.Amount_Paid || 0) + amount);
    const newStatus = newBalance <= 0.01 ? 'Paid' : 'Partial';

    const [updated] = await trx('tbl_purchase_header').where({ Purchase_ID: purchase.Purchase_ID })
      .update({ Amount_Paid: newAmountPaid, Balance_Amount: newBalance, Payment_Status: newStatus })
      .returning('*');

    if (purchase.Supplier_ID) {
      await trx('tbl_vendor_master').where({ Vendor_ID: purchase.Supplier_ID })
        .update({ Current_Balance: db.raw('"Current_Balance" - ?', [amount]) });
    }

    await trx.commit();

    const ledger = await resolveLedgerForPayment(db, req.user.tenantId, req.body.Payment_Mode, req.body.Bank_Account_ID);
    await postJournal({
      tenantId: req.user.tenantId, sourceType: 'PAYMENT', sourceId: purchase.Purchase_ID, reference: `${purchase.Purchase_Number}-PAY-${Date.now()}`,
      narration: `Payment against ${purchase.Purchase_Number}`, createdBy: req.user.username, dataMode: purchase.Data_Mode, branchId: purchase.Branch_ID,
      lines: [
        { account: 'Supplier Payable Account', group: 'Liabilities', sub: 'Payable', type: 'Dr', amount, narration: `Paid against ${purchase.Purchase_Number}` },
        { account: ledger.account, group: ledger.group, sub: ledger.sub, type: 'Cr', amount, narration: `Paid against ${purchase.Purchase_Number}` },
      ],
    }).catch((e) => console.error('[Purchase] Supplier payment journal failed (payment still recorded fine):', e.message));

    return sendSuccess(res, updated, 'Payment recorded.', 201);
  } catch (err) {
    await trx.rollback();
    return sendError(res, 500, 'Failed to record payment.');
  }
});

module.exports = router;
