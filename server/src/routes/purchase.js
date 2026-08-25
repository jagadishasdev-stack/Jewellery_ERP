const router = require('express').Router();
const { body, validationResult } = require('express-validator');
const db = require('../db/tenantDb').tenantDb;
const { sendSuccess, sendError, sendValidationError } = require('../utils/response');
const { authenticate } = require('../middleware/auth');
const { generateArticleNumber } = require('../utils/invoiceNumber');
const { nextNumber } = require('../utils/numberFormat');
const { auditLog } = require('../utils/auditLogger');
const { postJournal } = require('../utils/accountingEngine');
const { resolveLedgerForPayment } = require('../utils/paymentLedgerMap');
const dayjs = require('dayjs');
const { modeVal } = require('../utils/dataModeFilter');
const { requireValidBranch, withBranch, resolveBranchForInsert } = require('../utils/branchAccess');

// ── Post double-entry accounting journal for a purchase ────────────────────────
// Purchase is always booked on full accrual — Dr Inventory + Input GST,
// Cr Supplier Payable for the WHOLE invoice amount, matching the existing
// (pre-this-change) behavior of crediting the supplier's Current_Balance
// for the full Total_Amount regardless of what's paid immediately. If
// Amount_Paid is also given, a SEPARATE payment journal reduces the payable
// right away — two distinct vouchers (Purchase Invoice, then Payment),
// exactly the pattern the design doc calls for, not one blended entry.
async function postPurchaseAccountingEntries({ tenantId, purchaseId, purchaseNumber, subtotal, gstAmount, cgstAmount, sgstAmount, igstAmount, amountPaid, paymentMode, bankAccountId, operator, dataMode = 3 }) {
  const accrualLines = [
    { account: 'Gold Stock Account', group: 'Assets', sub: 'Inventory', type: 'Dr', amount: subtotal, narration: `Purchase | ${purchaseNumber}` },
  ];
  if (cgstAmount > 0) accrualLines.push({ account: 'Input CGST Account', group: 'Assets', sub: 'Tax Credit', type: 'Dr', amount: cgstAmount, narration: `Input CGST | ${purchaseNumber}` });
  if (sgstAmount > 0) accrualLines.push({ account: 'Input SGST Account', group: 'Assets', sub: 'Tax Credit', type: 'Dr', amount: sgstAmount, narration: `Input SGST | ${purchaseNumber}` });
  if (igstAmount > 0) accrualLines.push({ account: 'Input IGST Account', group: 'Assets', sub: 'Tax Credit', type: 'Dr', amount: igstAmount, narration: `Input IGST | ${purchaseNumber}` });
  accrualLines.push({ account: 'Supplier Payable Account', group: 'Liabilities', sub: 'Payable', type: 'Cr', amount: subtotal + (gstAmount || 0), narration: `Purchase | ${purchaseNumber}` });

  const { journalNumber } = await postJournal({
    tenantId, sourceType: 'PURCHASE', sourceId: purchaseId, reference: purchaseNumber,
    narration: `Purchase invoice ${purchaseNumber}`, lines: accrualLines, createdBy: operator, dataMode,
  });

  if (parseFloat(amountPaid || 0) > 0) {
    const ledger = await resolveLedgerForPayment(db, tenantId, paymentMode, bankAccountId);
    await postJournal({
      tenantId, sourceType: 'PAYMENT', sourceId: purchaseId, reference: purchaseNumber,
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
  const { status, supplierId, page = 1, limit = 30 } = req.query;
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
    // Count with a clean subquery — avoids GROUP BY conflicts
    const [{ count }] = await withBranch(db('tbl_purchase_header')
      .where('Tenant_ID', req.user.tenantId), req)
      .count('Purchase_ID as count');
    const data = await qb.orderBy('p.Purchase_Date','desc')
      .limit(parseInt(limit)).offset((parseInt(page)-1)*parseInt(limit));
    return sendSuccess(res, { items: data, total: parseInt(count) });
  } catch (err) { console.error('Purchase list error:', err.message); return sendError(res, 500, 'Failed to fetch purchases.'); }
});

// ── POST /api/purchase/create  ────────────────────────────────────────────────
router.post('/create', authenticate, requireValidBranch, [
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

    const [purchase] = await trx('tbl_purchase_header').insert({
      ...header,
      Tenant_ID: tenantId,
      Branch_ID: branchId,
      Purchase_Number: purchaseNumber,
      Status: 'Draft',
      Data_Mode: modeVal(req),
      Created_By: req.user.username,
    }).returning('*');

    // Insert line items and create ornament records
    const lineItems = [];
    for (const item of items) {
      // Auto-generate article number and create ornament in inventory
      const articleNumber = item.Article_Number || await generateArticleNumber(tenantId);
      let ornamentId = null;

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

    postPurchaseAccountingEntries({
      tenantId, purchaseId: purchase.Purchase_ID, purchaseNumber,
      subtotal, gstAmount, cgstAmount, sgstAmount, igstAmount,
      amountPaid: header.Amount_Paid, paymentMode: header.Payment_Mode, bankAccountId: header.Bank_Account_ID,
      operator: req.user.username, dataMode: modeVal(req),
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
      .where({ 'p.Purchase_ID': req.params.id })
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
router.post('/:id/approve', authenticate, async (req, res) => {
  try {
    const [updated] = await db('tbl_purchase_header')
      .where({ Purchase_ID: req.params.id, Tenant_ID: req.user.tenantId })
      .update({ Status: 'Approved', Approved_By: req.user.username, Approved_Date: new Date() })
      .returning('*');
    if (!updated) return sendError(res, 404, 'Purchase not found.');
    return sendSuccess(res, updated, 'Purchase approved.');
  } catch (err) { return sendError(res, 500, 'Failed to approve.'); }
});

module.exports = router;
