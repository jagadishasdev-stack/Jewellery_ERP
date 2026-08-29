const router = require('express').Router();
const { body, validationResult } = require('express-validator');
const db = require('../db/tenantDb').tenantDb;
const { sendSuccess, sendError, sendValidationError } = require('../utils/response');
const { authenticate, requirePermission } = require('../middleware/auth');
const { generateInvoiceNumber, generateSchemeAdjustmentNumber } = require('../utils/invoiceNumber');
const { auditLog } = require('../utils/auditLogger');
const { modeVal } = require('../utils/dataModeFilter');
const { requireValidBranch, withBranch, resolveBranchForInsert } = require('../utils/branchAccess');
const { postJournal } = require('../utils/accountingEngine');
const { resolveLedgerForPayment } = require('../utils/paymentLedgerMap');
const { resolveStockLedger } = require('../utils/stockLedgerMap');
const dayjs = require('dayjs');

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

// ── Sales Voucher ID Generator ─────────────────────────────────────────────────
// Reads the last-used number from tbl_sales_header (the table this Voucher_ID
// is synchronously written into, in the same request) rather than
// tbl_voucher_master — that table's insert happens post-commit and
// un-awaited, so reading from it raced with fast successive requests and
// could hand out the same Voucher_ID twice.
// containsHiddenStock uses the HSAL- prefix instead of SAL- (own independent
// sequence, same reasoning as generateInvoiceNumber's HINV- prefix) so a
// hidden-stock sale's voucher is identifiable on sight, not just via a join.
const generateSaleVoucherId = async (tenantId, containsHiddenStock = false) => {
  const dateStr = dayjs().format('YYYYMMDD');
  const prefix  = `${containsHiddenStock ? 'HSAL' : 'SAL'}-${dateStr}-`;
  const last = await db('tbl_sales_header')
    .where('Tenant_ID', tenantId)
    .where('Voucher_ID', 'like', `${prefix}%`)
    .orderBy('Voucher_ID', 'desc')
    .first();
  const seq = last ? parseInt(last.Voucher_ID.split('-').pop()) + 1 : 1;
  return `${prefix}${String(seq).padStart(5, '0')}`;
};

// ── Post double-entry accounting journal for a sale ───────────────────────────
// Thin wrapper around the shared engine (utils/accountingEngine.js) — this
// used to hand-roll journal/entry inserts directly; now it just builds the
// line list and lets postJournal() handle real accounts, the balance
// check, bank-balance sync, and Tally auto-queuing.
async function postSaleAccountingEntries({ tenantId, saleId, invoiceNumber, payments, subtotal, cgstAmount, sgstAmount, igstAmount, roundOff = 0, operator, dataMode = 3, branchId, cogsByMetal = {} }) {
  const salesValue = parseFloat(subtotal || 0);
  const lines = [];

  for (const p of (payments || [])) {
    const mode = p.Payment_Mode || p.mode || 'Cash';
    const amt  = parseFloat(p.Amount || p.amount || 0);
    if (amt <= 0) continue;
    const bankAccountId = p.Bank_Account_ID || p.bankAccountId;
    // A specific real bank was picked at billing time (POS's bank-mode
    // selector) — post against THAT bank's own ledger instead of the
    // shared "Unassigned" fallback every bank-type payment used before it.
    const ledger = await resolveLedgerForPayment(db, tenantId, mode, bankAccountId);
    lines.push({ account: ledger.account, group: ledger.group, sub: ledger.sub, type: 'Dr', amount: amt, narration: `${mode} received | ${invoiceNumber}` });
  }

  lines.push({ account: 'Sales Account', group: 'Income', sub: 'Direct Income', type: 'Cr', amount: salesValue, narration: `Sales | ${invoiceNumber}` });
  if (cgstAmount > 0) lines.push({ account: 'Output CGST Account', group: 'Liabilities', sub: 'Tax Payable', type: 'Cr', amount: cgstAmount, narration: `CGST | ${invoiceNumber}` });
  if (sgstAmount > 0) lines.push({ account: 'Output SGST Account', group: 'Liabilities', sub: 'Tax Payable', type: 'Cr', amount: sgstAmount, narration: `SGST | ${invoiceNumber}` });
  if (igstAmount > 0) lines.push({ account: 'Output IGST Account', group: 'Liabilities', sub: 'Tax Payable', type: 'Cr', amount: igstAmount, narration: `IGST | ${invoiceNumber}` });

  // Every Dr line above (payments + any Customer Receivable/Old Gold/Scheme/
  // Bonus synthetic lines) is built from finalPayable = Math.round(netPayable)
  // — a whole-rupee figure — while the Cr side here is the UNROUNDED
  // subtotal+GST. Any sale whose net payable isn't already a whole rupee
  // (i.e. almost every real one) left Dr and Cr off by a few paise, and
  // postJournal() rejects any journal that doesn't balance exactly — so
  // this used to silently drop the ENTIRE journal for most real sales,
  // not just the ones being seeded here. tbl_sales_header already stores
  // this exact figure as Round_Off_Amount; it just never reached the
  // ledger. Standard "Round Off" ledger (same concept as Tally's) absorbs
  // the few paise: roundOff > 0 means finalPayable was rounded UP (Cr —
  // treated as trivial rounding income), < 0 means rounded DOWN (Dr).
  const roundOffAmt = Math.round(Math.abs(roundOff) * 100) / 100;
  if (roundOffAmt >= 0.01) {
    lines.push({
      account: 'Round Off Account', group: roundOff > 0 ? 'Income' : 'Expenses', sub: roundOff > 0 ? 'Indirect Income' : 'Indirect Expense',
      type: roundOff > 0 ? 'Cr' : 'Dr', amount: roundOffAmt, narration: `Round off | ${invoiceNumber}`,
    });
  }

  // Cost of Goods Sold — was never posted anywhere at all (found via
  // audit): purchase.js Dr's a stock account on every purchase and
  // nothing ever credited it, so the inventory ledger only ever grew,
  // and the P&L's "profit" never accounted for what the sold goods
  // actually cost. Self-balancing pair added on top of the
  // revenue/payment lines above — Dr COGS for the sum of what was sold,
  // Cr each metal's own stock account for its share, at the ornament's
  // own Purchase_Cost (what was actually paid for it), never the sale price.
  const cogsTotal = round2(Object.values(cogsByMetal).reduce((s, amt) => s + (amt || 0), 0));
  if (cogsTotal >= 0.01) {
    lines.push({ account: 'Cost of Goods Sold Account', group: 'Expenses', sub: 'Direct Expense', type: 'Dr', amount: cogsTotal, narration: `COGS | ${invoiceNumber}` });
    for (const [metalType, amount] of Object.entries(cogsByMetal)) {
      if (amount < 0.01) continue;
      const ledger = resolveStockLedger(metalType);
      lines.push({ account: ledger.account, group: ledger.group, sub: ledger.sub, type: 'Cr', amount: round2(amount), narration: `COGS | ${invoiceNumber}` });
    }
  }

  const { journalNumber } = await postJournal({
    tenantId, sourceType: 'SALE', sourceId: saleId, reference: invoiceNumber, branchId,
    narration: `Sales invoice ${invoiceNumber}`, lines, createdBy: operator, dataMode,
  });
  return journalNumber;
}

// ─── POST /api/sales/create ───────────────────────────────────────────────────
router.post('/create', authenticate, requirePermission('sales'), requireValidBranch, [
  body('items').isArray({ min: 1 }).withMessage('At least one item required'),
  body('items.*.Ornament_ID').isInt().withMessage('Ornament ID required for each item'),
  body('items.*.Total_Line_Price').isFloat({ min: 0 }).withMessage('Line price required'),
  body('Payment_Mode').notEmpty().withMessage('Payment mode required'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return sendValidationError(res, errors.array());

  // Unofficial mode sales are cash-only, no exceptions — checked here (server
  // is authoritative) even though the client already restricts the UI to Cash.
  if (modeVal(req) === 2) {
    if ((req.body.Payment_Mode || '').trim() !== 'Cash') {
      return sendError(res, 400, 'Unofficial mode sales must be paid in Cash only.');
    }
    const badSplit = (req.body.payments || []).find(p => (p.mode || p.Payment_Mode || '').trim() !== 'Cash');
    if (badSplit) {
      return sendError(res, 400, 'Unofficial mode sales must be paid in Cash only.');
    }
  }

  const trx = await db.transaction();
  try {
    const tenantId = req.user.tenantId;
    const dm = modeVal(req);
    const { items, Customer_ID, Customer_Name, Customer_Mobile, Payment_Mode, Payment_Reference,
            Amount_Paid, Sale_Type = 'Retail', Invoice_Type = 'Tax Invoice', Notes,
            Old_Gold_Exchange_Amount = 0, Old_Gold_Weight = 0, Old_Gold_Exchange_ID = null,
            Scheme_Adjustments = [], Voucher_Amount: voucherAmountInput = 0, Voucher_ID: giftVoucherId = null } = req.body;

    // ── Validate every item belongs to this tenant and is actually available
    // before touching anything else. Ornament_ID is a global (not per-tenant)
    // key, so without this check a request could reference — and mark sold —
    // another tenant's stock, or re-sell an item that's already sold.
    // forUpdate() locks the rows so a concurrent sale can't double-book the
    // same item between this check and the "mark sold" update below.
    const requestedOrnamentIds = [...new Set(items.map((i) => i.Ornament_ID))];
    const ownedOrnaments = await trx('tbl_ornament_master')
      .whereIn('Ornament_ID', requestedOrnamentIds)
      .where('Tenant_ID', tenantId)
      .forUpdate();
    const ownedById = new Map(ownedOrnaments.map((o) => [String(o.Ornament_ID), o]));

    for (const id of requestedOrnamentIds) {
      const ornament = ownedById.get(String(id));
      if (!ornament) {
        await trx.rollback();
        return sendError(res, 404, `Ornament ${id} not found in your inventory.`);
      }
      if (ornament.Is_Sold || !ornament.Is_Stock_Available) {
        await trx.rollback();
        return sendError(res, 400, `${ornament.Article_Number} is already sold or unavailable — remove it from the cart.`);
      }
    }

    // Hidden stock can be billed from either screen now — Official/Practice
    // mode's own search/barcode lookups already keep a hidden item from
    // being FOUND in the first place (applyStockVisibility) unless someone
    // deliberately goes looking for it, but the booking step itself no
    // longer blocks it. What matters is that the sale carries its own
    // permanent record of having touched hidden stock (Contains_Hidden_Stock,
    // plus the HINV-/HSAL- number prefixes below) — independent of Data_Mode
    // — so Official-mode reports can keep excluding it even though it's no
    // longer impossible for such a sale to have Data_Mode=3.
    const containsHiddenStock = requestedOrnamentIds.some((id) => ownedById.get(String(id)).Is_Hidden);

    // Multi-Branch Management §19 — only actually inserts a branch segment
    // if this tenant opted into Include_Branch_In_Numbering (see
    // utils/numberFormat.js); otherwise numbers exactly as before.
    const invoiceNumber = await generateInvoiceNumber(tenantId, containsHiddenStock, resolveBranchForInsert(req, req.body.Branch_ID));
    const voucherId     = await generateSaleVoucherId(tenantId, containsHiddenStock);

    // Calculate totals from line items
    let subtotal = 0, totalGrossWeight = 0, totalNetGoldWeight = 0, totalStoneWeight = 0;
    let totalDiscount = 0, totalGST = 0;

    items.forEach((item) => {
      subtotal += parseFloat(item.Taxable_Value || item.Total_Line_Price);
      totalGrossWeight += parseFloat(item.Gross_Weight || 0);
      totalNetGoldWeight += parseFloat(item.Net_Gold_Weight || 0);
      totalStoneWeight += parseFloat(item.Stone_Weight || 0);
      totalDiscount += parseFloat(item.Discount_Amount_Applied || 0);
      totalGST += parseFloat(item.GST_Amount || 0);
    });

    // ── Validate the Old Gold Exchange voucher (if one is referenced) ───────
    const oldGoldAmountApplied = parseFloat(Old_Gold_Exchange_Amount || 0);
    let oldGoldExchangeRow = null;
    if (Old_Gold_Exchange_ID) {
      oldGoldExchangeRow = await trx('tbl_old_gold_exchange')
        .where({ Exchange_ID: Old_Gold_Exchange_ID, Tenant_ID: tenantId }).forUpdate().first();
      if (!oldGoldExchangeRow) { await trx.rollback(); return sendError(res, 404, 'Old gold exchange voucher not found.'); }
      if (oldGoldAmountApplied > parseFloat(oldGoldExchangeRow.Balance_Amount) + 0.01) {
        await trx.rollback();
        return sendError(res, 400, 'Old gold adjustment exceeds the voucher\'s remaining balance.');
      }
    }

    // ── Validate the Gift Voucher (if one was applied at checkout) ─────────
    // POS used to only send a raw Voucher_Amount discount with no
    // Voucher_ID at all — the actual voucher's Balance_Amount was never
    // decremented, so the same voucher code could be redeemed on every
    // bill forever (found via audit). forUpdate() here for the same reason
    // as the old-gold/scheme locks above — two concurrent sales referencing
    // the same voucher must not both succeed against a balance that can
    // only cover one of them.
    const voucherAmountRequested = parseFloat(voucherAmountInput || 0);
    let giftVoucherRow = null;
    if (giftVoucherId && voucherAmountRequested > 0) {
      giftVoucherRow = await trx('tbl_gift_vouchers').where({ Voucher_ID: giftVoucherId, Tenant_ID: tenantId }).forUpdate().first();
      if (!giftVoucherRow) { await trx.rollback(); return sendError(res, 404, 'Gift voucher not found.'); }
      if (giftVoucherRow.Status !== 'Active') { await trx.rollback(); return sendError(res, 400, `Gift voucher is ${giftVoucherRow.Status}.`); }
      if (giftVoucherRow.Expiry_Date && new Date(giftVoucherRow.Expiry_Date) < new Date()) {
        await trx.rollback(); return sendError(res, 400, 'Gift voucher has expired.');
      }
      if (voucherAmountRequested > parseFloat(giftVoucherRow.Balance_Amount) + 0.01) {
        await trx.rollback();
        return sendError(res, 400, 'Voucher amount exceeds the voucher\'s remaining balance.');
      }
    }

    // ── Validate every Scheme Adjustment (supports multiple schemes/bill) ──
    const schemeSettings = await trx('tbl_scheme_settings').where({ Tenant_ID: tenantId }).first();
    const allowActiveAdjustment = !!schemeSettings?.Allow_Active_Scheme_Adjustment;
    const allowActiveBonus = !!schemeSettings?.Allow_Active_Scheme_Bonus;

    let totalSchemeAdjustment = 0;
    let totalBonusAdjustment = 0;
    const validatedAdjustments = [];

    for (const adj of (Scheme_Adjustments || [])) {
      const amount = parseFloat(adj.Amount || 0);
      const bonusAmount = parseFloat(adj.BonusAmount || 0);
      if (amount <= 0 && bonusAmount <= 0) continue;

      const member = await trx('tbl_scheme_members').where({ Member_ID: adj.Member_ID, Tenant_ID: tenantId }).forUpdate().first();
      if (!member) { await trx.rollback(); return sendError(res, 404, `Scheme member ${adj.Member_ID} not found.`); }
      if (!['Active', 'Matured'].includes(member.Status)) {
        await trx.rollback();
        return sendError(res, 400, `${member.Member_Number}'s scheme is ${member.Status} and can't be adjusted.`);
      }

      const isMatured = member.Status === 'Matured';
      if (!isMatured && amount > 0 && !allowActiveAdjustment) {
        await trx.rollback();
        return sendError(res, 400, `${member.Member_Number} is an active (not yet matured) scheme — balance adjustment isn't enabled for active schemes.`);
      }
      if (!isMatured && bonusAmount > 0 && !allowActiveBonus) {
        await trx.rollback();
        return sendError(res, 400, `${member.Member_Number} is an active (not yet matured) scheme — bonus adjustment isn't enabled for active schemes.`);
      }

      const availableBalance = Math.max(0, parseFloat(member.Total_Amount_Paid || 0) - parseFloat(member.Amount_Redeemed || 0));
      if (amount > availableBalance + 0.01) {
        await trx.rollback();
        return sendError(res, 400, `Adjustment amount exceeds ${member.Member_Number}'s available balance (₹${availableBalance.toFixed(2)}).`);
      }

      let bonusRows = [];
      if (bonusAmount > 0) {
        bonusRows = await trx('tbl_scheme_bonuses').where({ Tenant_ID: tenantId, Member_ID: member.Member_ID, Is_Redeemed: false }).forUpdate();
        const availableBonus = bonusRows.reduce((s, b) => s + parseFloat(b.Bonus_Amount || 0), 0);
        if (bonusAmount > availableBonus + 0.01) {
          await trx.rollback();
          return sendError(res, 400, `Bonus adjustment exceeds ${member.Member_Number}'s available bonus (₹${availableBonus.toFixed(2)}).`);
        }
      }

      validatedAdjustments.push({ member, amount, bonusAmount, bonusRows, isMatured });
      totalSchemeAdjustment += amount;
      totalBonusAdjustment += bonusAmount;
    }

    const voucherAmount = parseFloat(voucherAmountInput || 0);

    // ── Validate & price Loyalty Points redemption (if any) ────────────────
    // Loyalty_Points_Used was accepted and stored since the loyalty column
    // was added, but never actually reduced what the customer owed — a
    // write-only audit field. Tenant.Loyalty_Point_Value (defaults ₹1/pt,
    // configurable per tenant — see tenant.js's settings route) is what
    // makes real redemption math possible.
    const loyaltyPointsUsed = parseInt(req.body.Loyalty_Points_Used || 0, 10);
    let loyaltyDiscount = 0;
    if (loyaltyPointsUsed > 0) {
      if (!Customer_ID) { await trx.rollback(); return sendError(res, 400, 'Loyalty points can only be redeemed for a linked customer.'); }
      const customerForLoyalty = await trx('tbl_customer_master').where({ Customer_ID, Tenant_ID: tenantId }).forUpdate().first();
      if (!customerForLoyalty) { await trx.rollback(); return sendError(res, 404, 'Customer not found.'); }
      if (loyaltyPointsUsed > parseInt(customerForLoyalty.Loyalty_Points || 0, 10)) {
        await trx.rollback();
        return sendError(res, 400, `Loyalty points redeemed (${loyaltyPointsUsed}) exceed the customer's available balance (${customerForLoyalty.Loyalty_Points || 0}).`);
      }
      const tenantForLoyalty = await trx('tbl_tenant_master').where({ Tenant_ID: tenantId }).select('Loyalty_Point_Value').first();
      const pointValue = parseFloat(tenantForLoyalty?.Loyalty_Point_Value ?? 1);
      loyaltyDiscount = round2(loyaltyPointsUsed * pointValue);
    }

    const netPayable = subtotal + totalGST - oldGoldAmountApplied - totalSchemeAdjustment - totalBonusAdjustment - voucherAmount - loyaltyDiscount;
    const roundOff = Math.round(netPayable) - netPayable;
    const finalPayable = Math.round(netPayable);
    // Amount_Paid=0 means "nothing paid yet, fully on credit" — a real,
    // deliberate value, not "not specified". `Amount_Paid || finalPayable`
    // treated 0 as falsy and silently defaulted to full payment instead,
    // so an explicit credit sale got recorded (and posted to accounting)
    // as fully paid. Only an actually-omitted Amount_Paid should default.
    const amountPaid = (Amount_Paid !== undefined && Amount_Paid !== null) ? parseFloat(Amount_Paid) : finalPayable;
    const balance = finalPayable - amountPaid;
    const paymentStatus = balance <= 0 ? 'Paid' : amountPaid > 0 ? 'Partial' : 'Pending';

    // ── PAN enforcement — was client-only (POSPage.jsx blocks checkout
    // without a valid PAN above ₹2,00,000), so a direct API call could
    // bypass the rule entirely; PAN_Verified was also just whatever
    // boolean the client claimed, never actually checked against the
    // number. Both fixed here: real format validation, and PAN_Verified
    // is now computed server-side, never trusted from the request.
    const PAN_THRESHOLD = 200000;
    const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
    const panNumber = (req.body.PAN_Number || '').trim().toUpperCase();
    const panVerified = PAN_REGEX.test(panNumber);
    if (finalPayable >= PAN_THRESHOLD && !panVerified) {
      await trx.rollback();
      return sendError(res, 400, `A valid PAN is required for sales of ₹${PAN_THRESHOLD.toLocaleString('en-IN')} or more (Income Tax Rule 114B).`);
    }

    // ── GST split: CGST+SGST for an intra-state sale, IGST for inter-state ──────
    // Previously always assumed intra-state (cgst = sgst = totalGST / 2,
    // computed only at journal-posting time, never stored). Determined once
    // here from the tenant's own registered state vs. the customer's — a
    // practical simplification of "place of supply," not a full legal
    // determination; your CA/GST practitioner should confirm this is
    // sufficient for your actual filing profile.
    const tenantRow = await trx('tbl_tenant_master').where({ Tenant_ID: tenantId }).select('State').first();
    const customerRow = Customer_ID ? await trx('tbl_customer_master').where({ Customer_ID }).select('State').first() : null;
    const tenantState = (tenantRow?.State || '').trim().toLowerCase();
    const customerState = (customerRow?.State || '').trim().toLowerCase();
    // Unknown customer state (walk-in, no address on file) defaults to
    // intra-state — the overwhelmingly common case for in-shop retail —
    // rather than guessing IGST for a sale with no state info at all.
    const isInterstate = !!(tenantState && customerState && tenantState !== customerState);
    const cgstAmount = isInterstate ? 0 : round2(totalGST / 2);
    const sgstAmount = isInterstate ? 0 : round2(totalGST / 2);
    const igstAmount = isInterstate ? round2(totalGST) : 0;

    // Insert sales header
    const [sale] = await trx('tbl_sales_header').insert({
      Tenant_ID: tenantId,
      // Multi-Branch Management — the active branch context (X-Branch-ID)
      // wins when present; otherwise falls back to whatever the caller
      // explicitly sent (existing behavior for routes/clients not yet
      // sending the header). See utils/branchAccess.js.
      Branch_ID: resolveBranchForInsert(req, req.body.Branch_ID),
      Invoice_Number: invoiceNumber,
      Counter_ID: req.body.Counter_ID || null,
      Counter_Name: req.body.Counter_Name || null,
      Operator_Name: (req.body.Operator_Name || '').trim() || req.user.fullName || req.user.username,
      Customer_ID: Customer_ID || null,
      PAN_Number: panNumber || null,
      PAN_Verified: panVerified,
      Scheme_Adjustment_Amount: totalSchemeAdjustment,
      Bonus_Adjustment_Amount: totalBonusAdjustment,
      Voucher_Amount: voucherAmount,
      Loyalty_Points_Used: loyaltyPointsUsed,
      Loyalty_Points_Earned: Math.floor(finalPayable / 1000),
      Customer_Name: Customer_Name || 'Walk-in Customer',
      Customer_Mobile: Customer_Mobile || null,
      Total_Gross_Weight: totalGrossWeight,
      Total_Net_Gold_Weight: totalNetGoldWeight,
      Total_Stone_Weight: totalStoneWeight,
      Subtotal_Amount: subtotal,
      Discount_Amount: totalDiscount,
      GST_Amount: totalGST,
      CGST_Amount: cgstAmount,
      SGST_Amount: sgstAmount,
      IGST_Amount: igstAmount,
      Is_Interstate: isInterstate,
      Round_Off_Amount: roundOff,
      Net_Payable_Amount: finalPayable,
      Payment_Mode,
      Payment_Reference: Payment_Reference || null,
      Payment_Status: paymentStatus,
      Amount_Paid: amountPaid,
      Balance_Amount: Math.max(balance, 0),
      Old_Gold_Exchange_Amount: oldGoldAmountApplied,
      Old_Gold_Weight: parseFloat(Old_Gold_Weight),
      Is_Exchange: oldGoldAmountApplied > 0,
      Sale_Type,
      Invoice_Type,
      Notes: Notes || null,
      Data_Mode: dm,
      Voucher_ID: voucherId,
      Contains_Hidden_Stock: containsHiddenStock,
      Created_By: req.user.username,
    }).returning('*');

    // Insert line items
    // HSN_Code was only ever resolved via a live join at report time —
    // never actually captured on the sold line item, so a later edit to
    // an item type's HSN code would silently rewrite tax history for
    // every past sale of that type. Snapshotted here from the ornament's
    // own HSN_Code (itself snapshotted at creation time in ornaments.js/
    // purchase.js) — immune to any later type-level edit, same as
    // Purity_Code/GST_Percentage_Applied already are.
    const lineItems = items.map((item, idx) => ({
      Sale_ID: sale.Sale_ID,
      Tenant_ID: tenantId,
      Ornament_ID: item.Ornament_ID,
      Article_Number: item.Article_Number,
      Item_Type_Name: item.Item_Type_Name,
      HSN_Code: ownedById.get(String(item.Ornament_ID))?.HSN_Code || item.HSN_Code || null,
      Quantity: item.Quantity || 1,
      Gross_Weight: item.Gross_Weight,
      Net_Gold_Weight: item.Net_Gold_Weight,
      Stone_Weight: item.Stone_Weight || 0,
      Purity_Code: item.Purity_Code,
      Gold_Rate_Per_Gram: item.Gold_Rate_Per_Gram,
      Making_Charge_Applied: item.Making_Charge_Applied,
      Wastage_Amount_Applied: item.Wastage_Amount_Applied || 0,
      Discount_Percentage_Applied: item.Discount_Percentage_Applied || 0,
      Discount_Amount_Applied: item.Discount_Amount_Applied || 0,
      Taxable_Value: item.Taxable_Value,
      GST_Percentage_Applied: item.GST_Percentage_Applied || 3,
      GST_Amount: item.GST_Amount || 0,
      Total_Line_Price: item.Total_Line_Price,
      Serial_No: idx + 1,
      Created_By: req.user.username,
    }));

    await trx('tbl_sales_details').insert(lineItems);

    // Insert multi-payment breakdown
    // A fully-on-credit sale (e.g. Amount_Paid: 0, still sent with a
    // {mode:'Cash', amount:0} placeholder line by some caller) used to
    // crash the whole sale with a 500 here — the outer `payments.length
    // > 0` check passed, but the >0 filter below then emptied the array
    // entirely, and `.insert([])` is an empty query in Knex/pg. Only
    // insert when there's actually a nonzero row left to insert.
    const payments = req.body.payments;
    if (payments && Array.isArray(payments) && payments.length > 0) {
      const paymentRows = payments
        .filter(p => parseFloat(p.amount || p.Amount || 0) > 0)
        .map(p => ({
          Sale_ID: sale.Sale_ID,
          Tenant_ID: tenantId,
          Payment_Mode: p.mode || p.Payment_Mode || 'Cash',
          Amount: parseFloat(p.amount || p.Amount || 0),
          Reference: p.reference || p.Reference || null,
          Bank_Name: p.Bank_Name || null,
          Bank_Account_ID: p.Bank_Account_ID || p.bankAccountId || null,
          Cheque_Number: p.Cheque_Number || null,
          Voucher_ID: p.Voucher_ID || null,
          Scheme_Enrollment_ID: p.Scheme_Enrollment_ID || null,
          Created_By: req.user.username,
        }));
      if (paymentRows.length > 0) await trx('tbl_sales_payments').insert(paymentRows);
    }

    // Mark ornaments as sold
    const ornamentIds = items.map((i) => i.Ornament_ID);
    await trx('tbl_ornament_master')
      .whereIn('Ornament_ID', ornamentIds)
      .update({ Is_Sold: true, Is_Stock_Available: false, Last_Updated_By: req.user.username, Last_Updated_Date: new Date() });

    // Update customer totals
    if (Customer_ID) {
      await trx('tbl_customer_master')
        .where({ Customer_ID })
        .update({
          Total_Purchase_Value: db.raw(`"Total_Purchase_Value" + ?`, [finalPayable]),
          Total_Purchase_Count: db.raw(`"Total_Purchase_Count" + 1`),
          Last_Purchase_Date: new Date(),
          Loyalty_Points: db.raw(`"Loyalty_Points" + ? - ?`, [Math.floor(finalPayable / 1000), loyaltyPointsUsed]),
        });
    }

    // ── Apply the Old Gold Exchange voucher, if one was referenced ─────────
    if (oldGoldExchangeRow) {
      await trx('tbl_old_gold_exchange').where({ Exchange_ID: oldGoldExchangeRow.Exchange_ID }).update({
        Sale_ID: sale.Sale_ID,
        Used_Amount: db.raw('"Used_Amount" + ?', [oldGoldAmountApplied]),
        Balance_Amount: db.raw('"Balance_Amount" - ?', [oldGoldAmountApplied]),
        Modified_Date: new Date(),
      });
    }

    // ── Apply the Gift Voucher, if one was referenced ───────────────────────
    // Used_In_Sale_ID is how POST /:id/cancel below finds its way back to
    // this voucher to restore it if the sale is later cancelled — same
    // linking pattern as tbl_old_gold_exchange.Sale_ID above.
    if (giftVoucherRow) {
      const newBalance = round2(parseFloat(giftVoucherRow.Balance_Amount) - voucherAmountRequested);
      await trx('tbl_gift_vouchers').where({ Voucher_ID: giftVoucherRow.Voucher_ID }).update({
        Used_Amount: db.raw('"Used_Amount" + ?', [voucherAmountRequested]),
        Balance_Amount: newBalance,
        Status: newBalance <= 0.01 ? 'Redeemed' : 'Active',
        Used_In_Sale_ID: sale.Sale_ID,
      });
    }

    // ── Apply every validated Scheme Adjustment ─────────────────────────────
    // Each member keeps their scheme open with a reduced running balance
    // (Amount_Redeemed) — the old all-or-nothing "mark Redeemed" behavior
    // only fires now if a Matured member's balance AND bonus both hit zero.
    const schemeAdjustmentAudit = [];
    for (const { member, amount, bonusAmount, bonusRows, isMatured } of validatedAdjustments) {
      const schemeVoucherNumber = await generateSchemeAdjustmentNumber(tenantId);

      let remainingBonus = bonusAmount;
      for (const b of bonusRows) {
        if (remainingBonus <= 0.01) break;
        await trx('tbl_scheme_bonuses').where({ Bonus_ID: b.Bonus_ID }).update({ Is_Redeemed: true, Redemption_Date: new Date() });
        remainingBonus -= parseFloat(b.Bonus_Amount || 0);
      }

      const newAmountRedeemed = parseFloat(member.Amount_Redeemed || 0) + amount;
      const newAvailableBalance = Math.max(0, parseFloat(member.Total_Amount_Paid || 0) - newAmountRedeemed);
      const remainingBonusRows = bonusAmount > 0
        ? await trx('tbl_scheme_bonuses').where({ Tenant_ID: tenantId, Member_ID: member.Member_ID, Is_Redeemed: false }).count('Bonus_ID as c').first()
        : { c: 0 };
      const shouldClose = isMatured && newAvailableBalance <= 0.01 && parseInt(remainingBonusRows.c || 0) === 0;

      const memberUpdate = { Amount_Redeemed: newAmountRedeemed, Modified_Date: new Date() };
      if (shouldClose) {
        memberUpdate.Status = 'Redeemed';
        memberUpdate.Redemption_Date = new Date();
        memberUpdate.Redemption_Sale_ID = sale.Sale_ID;
      }
      await trx('tbl_scheme_members').where({ Member_ID: member.Member_ID }).update(memberUpdate);

      const [txn] = await trx('tbl_scheme_transactions').insert({
        Tenant_ID: tenantId,
        Receipt_Number: schemeVoucherNumber,
        Member_ID: member.Member_ID,
        Tenant_Member_No: member.Member_Number,
        Txn_Type: 'Adjustment',
        Installment_No: 0,
        Amount: amount + bonusAmount,
        Net_Amount: amount + bonusAmount,
        Payment_Mode: 'Scheme Adjustment',
        Payment_Reference: invoiceNumber,
        Collection_Source: 'Counter',
        Collected_By: req.user.userId,
        Notes: `POS bill adjustment against invoice ${invoiceNumber}`,
        Created_By: req.user.username,
      }).returning('*');

      await trx('tbl_scheme_accounting_entries').insert({
        Tenant_ID: tenantId, Txn_ID: txn.Txn_ID, Entry_Date: new Date(),
        Receipt_No: schemeVoucherNumber, Member_ID: member.Member_ID,
        Debit_Account: 'Customer Scheme Deposit Account', Credit_Account: 'Sales Account',
        Amount: amount + bonusAmount,
        Narration: `Scheme adjustment | ${member.Member_Number} | ${invoiceNumber}`,
        Created_By: req.user.username,
      });

      schemeAdjustmentAudit.push({ member, amount, bonusAmount, schemeVoucherNumber });
    }

    await trx.commit();

    // ── Register Voucher in master ────────────────────────────────────────────
    db('tbl_voucher_master').insert({
      Voucher_ID:      voucherId,
      Tenant_ID:       tenantId,
      Voucher_Type:    'SALE',
      Reference_ID:    sale.Sale_ID,
      Reference_Table: 'tbl_sales_header',
      Status:          'Active',
      Description:     `Sale to ${Customer_Name || 'Walk-in'} — Invoice: ${invoiceNumber} — ₹${finalPayable.toLocaleString('en-IN')}`,
      Created_By:      req.user.username,
    }).catch(() => {}); // non-blocking, non-fatal

    // Fetch full sale with details
    const fullSale = await db('tbl_sales_header').where({ Sale_ID: sale.Sale_ID }).first();
    const details = await db('tbl_sales_details').where({ Sale_ID: sale.Sale_ID });
    const paymentBreakdown = await db('tbl_sales_payments').where({ Sale_ID: sale.Sale_ID });

    await auditLog({ tenantId, userId: req.user.userId, tableName: 'tbl_sales_header', recordId: sale.Sale_ID, actionType: 'INSERT', newData: sale, req });

    // Audit each scheme/old-gold adjustment individually too — who adjusted
    // what amount, against which member/voucher, on which invoice.
    for (const { member, amount, bonusAmount, schemeVoucherNumber } of schemeAdjustmentAudit) {
      await auditLog({
        tenantId, userId: req.user.userId, tableName: 'tbl_scheme_members', recordId: member.Member_ID,
        actionType: 'ADJUSTMENT',
        description: `Scheme adjustment ${schemeVoucherNumber}: ₹${amount.toFixed(2)} balance + ₹${bonusAmount.toFixed(2)} bonus used by ${member.Member_Number} against invoice ${invoiceNumber}`,
        req,
      });
    }
    if (oldGoldExchangeRow) {
      await auditLog({
        tenantId, userId: req.user.userId, tableName: 'tbl_old_gold_exchange', recordId: oldGoldExchangeRow.Exchange_ID,
        actionType: 'ADJUSTMENT',
        description: `Old gold voucher ${oldGoldExchangeRow.Voucher_Number}: ₹${oldGoldAmountApplied.toFixed(2)} applied against invoice ${invoiceNumber}`,
        req,
      });
    }

    // ── POST ACCOUNTING JOURNAL ENTRIES (non-blocking) ────────────────────────
    // Rule:
    //   Each payment mode Dr → Sales Account Cr (net payable)
    //   Output CGST Cr + Output SGST Cr (if GST invoice)
    // Old Gold / Scheme / Bonus adjustments and any unpaid Customer
    // Receivable balance are appended as synthetic "payment" rows so the
    // existing Dr-loop above posts them for free — see paymentLedgerMap.js.
    const ledgerPayments = [...paymentBreakdown];
    // A caller using the simple flat Payment_Mode/Amount_Paid fields instead
    // of a real payments[] array (POS always sends the array — see
    // POSPage.jsx's confirmSale — but other callers, e.g. an admin manually
    // recording an invoice, or a script, may not) never got a row in
    // tbl_sales_payments at all, so paymentBreakdown came back empty even
    // though real money was actually collected. That silently produced a
    // journal with only the Cr Sales Account line and no matching Dr —
    // postJournal's own "needs at least two lines" check then rejected the
    // WHOLE journal, so the sale's revenue never reached the books at all.
    if (paymentBreakdown.length === 0 && amountPaid > 0) {
      ledgerPayments.push({ Payment_Mode: Payment_Mode || 'Cash', Amount: amountPaid, Bank_Account_ID: req.body.Bank_Account_ID || null });
    }
    if (oldGoldAmountApplied > 0) ledgerPayments.push({ Payment_Mode: 'Old Gold Exchange', Amount: oldGoldAmountApplied });
    if (totalSchemeAdjustment > 0) ledgerPayments.push({ Payment_Mode: 'Scheme Adjustment', Amount: totalSchemeAdjustment });
    if (totalBonusAdjustment > 0) ledgerPayments.push({ Payment_Mode: 'Bonus Adjustment', Amount: totalBonusAdjustment });
    // A redeemed gift voucher is the same shape as Old Gold/Scheme
    // Adjustment above — the customer "paid" with a liability the
    // business already carries (Gift Voucher Account, credited when the
    // voucher was originally issued), not with new cash. Without this
    // line the journal's Dr side was short by exactly the voucher amount
    // and postJournal's own balance check silently dropped the whole
    // journal for any sale with a voucher applied.
    if (giftVoucherRow && voucherAmountRequested > 0) ledgerPayments.push({ Payment_Mode: 'Gift Voucher', Amount: voucherAmountRequested });
    if (loyaltyDiscount > 0) ledgerPayments.push({ Payment_Mode: 'Loyalty Redemption', Amount: loyaltyDiscount });
    if (balance > 0) ledgerPayments.push({ Payment_Mode: 'Customer Receivable', Amount: balance });

    // Cost of Goods Sold, per metal type — from each sold ornament's own
    // Purchase_Cost (what was actually paid for it at purchase time), not
    // the sale price. ownedById was already row-locked and fetched above.
    const cogsByMetal = {};
    for (const id of requestedOrnamentIds) {
      const ornament = ownedById.get(String(id));
      const cost = parseFloat(ornament.Purchase_Cost || 0);
      if (cost <= 0) continue;
      const metal = ornament.Metal_Type || 'Gold';
      cogsByMetal[metal] = round2((cogsByMetal[metal] || 0) + cost);
    }

    // Awaited (not fire-and-forget) — this used to return the sale response
    // BEFORE the journal insert was guaranteed committed, a real race that
    // showed up concretely as: a Tally export run immediately after a sale
    // could miss that sale's journal entirely, since it queries the same
    // table from a separate request with no guarantee the fire-and-forget
    // write had landed yet. Still non-fatal to the sale itself on failure
    // (the sale already committed, and blocking/rolling it back over a
    // bookkeeping-side error would be worse) — just guaranteed to have
    // finished, one way or the other, before the response goes out.
    await postSaleAccountingEntries({
      tenantId, saleId: sale.Sale_ID, invoiceNumber,
      payments: ledgerPayments,
      subtotal,
      cgstAmount, sgstAmount, igstAmount, roundOff,
      operator: req.user.username,
      dataMode: dm,
      // The sale's own already-stamped Branch_ID — guaranteed to match
      // what was actually recorded, rather than re-resolving separately.
      branchId: sale.Branch_ID,
      cogsByMetal,
    }).catch(e => console.warn('Accounting post failed (non-fatal):', e.message));

    // ── WhatsApp notification (non-blocking) ──────────────────────────────────
    const customerMobile = req.body.Customer_Mobile || fullSale.Customer_Mobile;
    if (customerMobile) {
      const whatsappMsg = `Dear ${fullSale.Customer_Name || 'Customer'},\n\nThank you for your purchase!\n\nInvoice: ${fullSale.Invoice_Number}\nAmount: ₹${parseFloat(fullSale.Net_Payable_Amount).toLocaleString('en-IN')}\nDate: ${new Date().toLocaleDateString('en-IN')}\n\nWe look forward to serving you again! 💎`;
      db('tbl_scheme_notifications').insert({
        Tenant_ID: tenantId,
        Member_ID: null,
        Type: 'Collection',
        Channel: 'WhatsApp',
        Message: whatsappMsg,
        Status: 'Pending',
      }).catch(() => {});
    }

    // Multi-Branch Management §34 — "when a sale occurs in HSR Layout,
    // HSR sales increase, All Branches consolidated values update
    // accordingly." Same io access pattern goldRate.js already uses
    // (req.app.get('io'), the /display namespace, the tenant-${tenantId}
    // room every connected admin client already auto-joins via
    // useSocket.js) — a real-time nudge for any open dashboard to refetch,
    // not a payload carrying the actual numbers itself (the dashboard
    // still asks the server for those, so there's no risk of a client
    // trusting a number it was never authorized to see).
    const io = req.app.get('io');
    if (io) {
      io.of('/display').to(`tenant-${tenantId}`).emit('branch-data-changed', {
        branchId: sale.Branch_ID || null, type: 'sale', tenantId,
      });
    }

    return sendSuccess(res, { sale: fullSale, items: details, payments: paymentBreakdown, voucherId }, 'Sale created successfully.', 201);
  } catch (err) {
    await trx.rollback();
    console.error('Sale create error DETAIL:', err.message);
    console.error('Sale create error CODE:', err.code);
    return sendError(res, 500, `Failed to create sale: ${err.message}`);
  }
});

// ─── GET /api/sales — Sales Bill History (list, search, filter) ──────────────
router.get('/', authenticate, requireValidBranch, async (req, res) => {
  const { fromDate, toDate, search, paymentStatus, page = 1, limit = 25 } = req.query;
  try {
    const tenantId = req.user.tenantId;
    const dm = modeVal(req);

    let qb = db('tbl_sales_header').where({ Tenant_ID: tenantId, Data_Mode: dm });
    qb = withBranch(qb, req);
    if (fromDate && toDate) qb = qb.whereRaw('DATE("Sale_Date") BETWEEN ? AND ?', [fromDate, toDate]);
    if (paymentStatus) qb = qb.where('Payment_Status', paymentStatus);
    if (search) {
      qb = qb.where((b) => b
        .where('Invoice_Number', 'ilike', `%${search}%`)
        .orWhere('Customer_Name', 'ilike', `%${search}%`)
        .orWhere('Customer_Mobile', 'like', `%${search}%`));
    }

    const [{ count }] = await qb.clone().count('Sale_ID as count');
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const items = await qb.clone()
      .orderBy('Sale_Date', 'desc')
      .limit(parseInt(limit)).offset(offset)
      .select('Sale_ID', 'Invoice_Number', 'Sale_Date', 'Customer_Name', 'Customer_Mobile',
        'Sale_Type', 'Net_Payable_Amount', 'Balance_Amount', 'Payment_Status', 'Payment_Mode', 'Counter_Name', 'Operator_Name');

    return sendSuccess(res, { items, total: parseInt(count), page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    return sendError(res, 500, 'Failed to fetch sales history.');
  }
});

// ─── GET /api/sales/:id ───────────────────────────────────────────────────────
router.get('/:id', authenticate, async (req, res) => {
  try {
    const sale = await db('tbl_sales_header as s')
      .leftJoin('tbl_customer_master as c', 's.Customer_ID', 'c.Customer_ID')
      .where({ 's.Sale_ID': req.params.id, 's.Tenant_ID': req.user.tenantId })
      .select('s.*', 'c.Email as Customer_Email', 'c.Date_Of_Birth')
      .first();

    if (!sale) return sendError(res, 404, 'Sale not found.');

    const items = await db('tbl_sales_details as sd')
      .leftJoin('tbl_ornament_master as o', 'sd.Ornament_ID', 'o.Ornament_ID')
      .where({ 'sd.Sale_ID': req.params.id })
      .select('sd.*', 'o.Product_Image_URL', 'o.Hallmark_Certificate_No', 'o.HUID_Number');

    const payments = await db('tbl_sales_payments').where({ Sale_ID: req.params.id });

    return sendSuccess(res, { sale, items, payments });
  } catch (err) {
    return sendError(res, 500, 'Failed to fetch sale.');
  }
});

// ─── GET /api/sales/invoice/:number ──────────────────────────────────────────
router.get('/invoice/:number', authenticate, async (req, res) => {
  try {
    const sale = await db('tbl_sales_header').where({ Invoice_Number: req.params.number, Tenant_ID: req.user.tenantId }).first();
    if (!sale) return sendError(res, 404, 'Invoice not found.');

    const items = await db('tbl_sales_details').where({ Sale_ID: sale.Sale_ID });
    return sendSuccess(res, { sale, items });
  } catch (err) {
    return sendError(res, 500, 'Failed to fetch invoice.');
  }
});

// ─── POST /api/sales/:id/receive-payment ──────────────────────────────────────
// A Partial/Pending sale's Balance_Amount previously had no way to ever be
// cleared except a Savings Scheme adjustment — collecting cash/UPI later
// against an existing invoice wasn't possible from any route, so
// /reports/customer-outstanding showed balances that could never actually
// be settled. This is that missing route: records the payment, updates
// the sale's own running totals, and posts a real journal (Dr Cash/Bank,
// Cr Customer Receivable) — the exact mirror of how the receivable itself
// got created at sale time (paymentLedgerMap.js's 'Customer Receivable' line).
router.post('/:id/receive-payment', authenticate, requirePermission('sales'), requireValidBranch, [
  body('Amount').isFloat({ gt: 0 }).withMessage('A positive amount is required'),
  body('Payment_Mode').notEmpty().withMessage('Payment mode is required'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return sendValidationError(res, errors.array());
  const trx = await db.transaction();
  try {
    const sale = await trx('tbl_sales_header').where({ Sale_ID: req.params.id, Tenant_ID: req.user.tenantId }).forUpdate().first();
    if (!sale) { await trx.rollback(); return sendError(res, 404, 'Sale not found.'); }
    if (!['Partial', 'Pending'].includes(sale.Payment_Status)) {
      await trx.rollback();
      return sendError(res, 400, `This sale is ${sale.Payment_Status} — there's no outstanding balance to collect.`);
    }

    const amount = round2(parseFloat(req.body.Amount));
    const currentBalance = round2(parseFloat(sale.Balance_Amount || 0));
    if (amount > currentBalance + 0.01) {
      await trx.rollback();
      return sendError(res, 400, `Amount exceeds the outstanding balance of ₹${currentBalance.toFixed(2)}.`);
    }

    const newBalance = round2(currentBalance - amount);
    const newAmountPaid = round2(parseFloat(sale.Amount_Paid || 0) + amount);
    const newStatus = newBalance <= 0.01 ? 'Paid' : 'Partial';

    const [payment] = await trx('tbl_sales_payments').insert({
      Sale_ID: sale.Sale_ID, Tenant_ID: req.user.tenantId, Payment_Mode: req.body.Payment_Mode,
      Amount: amount, Reference: req.body.Payment_Reference || null, Bank_Account_ID: req.body.Bank_Account_ID || null,
      Data_Mode: sale.Data_Mode, Created_By: req.user.username,
    }).returning('*');

    await trx('tbl_sales_header').where({ Sale_ID: sale.Sale_ID }).update({
      Amount_Paid: newAmountPaid, Balance_Amount: newBalance, Payment_Status: newStatus,
    });

    await trx.commit();

    const ledger = await resolveLedgerForPayment(db, req.user.tenantId, req.body.Payment_Mode, req.body.Bank_Account_ID);
    await postJournal({
      tenantId: req.user.tenantId, sourceType: 'SALE', sourceId: sale.Sale_ID, reference: `RECEIPT-${sale.Invoice_Number}-${payment.Payment_ID}`,
      narration: `Payment received against invoice ${sale.Invoice_Number}`, createdBy: req.user.username, dataMode: sale.Data_Mode, branchId: sale.Branch_ID,
      lines: [
        { account: ledger.account, group: ledger.group, sub: ledger.sub, type: 'Dr', amount: amount, narration: `Payment received | ${sale.Invoice_Number}` },
        { account: 'Customer Receivable Account', group: 'Assets', sub: 'Receivable', type: 'Cr', amount: amount, narration: `Payment received | ${sale.Invoice_Number}` },
      ],
    }).catch((err) => console.error('[Sales] Receive-payment journal failed (payment still recorded fine):', err.message));

    return sendSuccess(res, { Sale_ID: sale.Sale_ID, Amount_Paid: newAmountPaid, Balance_Amount: newBalance, Payment_Status: newStatus, payment }, 'Payment recorded.', 201);
  } catch (err) {
    await trx.rollback();
    return sendError(res, 500, 'Failed to record payment.');
  }
});

// ─── Shared reversal side-effects — used by BOTH /cancel and /return ──────────
// Restores stock, Old Gold Exchange balance, Gift Voucher balance, and the
// customer's running totals (purchase value/count, loyalty points both
// directions). Does NOT touch Payment_Status or accounting — callers do
// that themselves (a return needs a different terminal status/reference
// and a different, refund-mode-aware journal than a plain cancellation).
async function reverseSaleSideEffects(trx, sale, req) {
  const details = await trx('tbl_sales_details').where({ Sale_ID: sale.Sale_ID });
  const ornamentIds = details.map((d) => d.Ornament_ID).filter(Boolean);

  if (ornamentIds.length > 0) {
    await trx('tbl_ornament_master').whereIn('Ornament_ID', ornamentIds).update({
      Is_Sold: false, Is_Stock_Available: true,
    });
  }

  if (parseFloat(sale.Old_Gold_Exchange_Amount || 0) > 0) {
    await trx('tbl_old_gold_exchange').where({ Sale_ID: sale.Sale_ID, Tenant_ID: req.user.tenantId }).update({
      Sale_ID: null,
      Used_Amount: db.raw('"Used_Amount" - ?', [parseFloat(sale.Old_Gold_Exchange_Amount)]),
      Balance_Amount: db.raw('"Balance_Amount" + ?', [parseFloat(sale.Old_Gold_Exchange_Amount)]),
      Modified_Date: new Date(),
    });
  }

  if (parseFloat(sale.Voucher_Amount || 0) > 0) {
    const giftVoucher = await trx('tbl_gift_vouchers').where({ Used_In_Sale_ID: sale.Sale_ID, Tenant_ID: req.user.tenantId }).first();
    if (giftVoucher) {
      await trx('tbl_gift_vouchers').where({ Voucher_ID: giftVoucher.Voucher_ID }).update({
        Used_Amount: db.raw('"Used_Amount" - ?', [parseFloat(sale.Voucher_Amount)]),
        Balance_Amount: db.raw('"Balance_Amount" + ?', [parseFloat(sale.Voucher_Amount)]),
        Status: 'Active',
        Used_In_Sale_ID: null,
      });
    }
  }

  if (sale.Customer_ID) {
    await trx('tbl_customer_master').where({ Customer_ID: sale.Customer_ID }).update({
      Total_Purchase_Value: db.raw('"Total_Purchase_Value" - ?', [parseFloat(sale.Net_Payable_Amount || 0)]),
      Total_Purchase_Count: db.raw('"Total_Purchase_Count" - 1'),
      Loyalty_Points: db.raw('"Loyalty_Points" - ? + ?', [parseInt(sale.Loyalty_Points_Earned || 0, 10), parseInt(sale.Loyalty_Points_Used || 0, 10)]),
    });
  }
}

// Ledger accounts that already have their own dedicated restoration above
// (Old Gold/Scheme/Bonus/Gift Voucher balances, loyalty points) or that
// aren't a real payment channel (COGS, Customer Receivable) — these always
// just flip Dr↔Cr on their own original account, on both /cancel and
// /return, regardless of a return's chosen refund channel. Everything
// else on the Dr side of the original journal is a genuine "money in"
// payment line (Cash/UPI/Card/Cheque/a specific bank's own ledger) — see
// /return below for why that distinction matters there.
const SELF_RESTORING_LEDGER_ACCOUNTS = new Set([
  'Cost of Goods Sold Account', 'Old Gold Stock Account', 'Customer Scheme Deposit Account',
  'Scheme Bonus Provision Account', 'Gift Voucher Account', 'Loyalty Points Redemption Expense Account',
  'Customer Receivable Account',
]);

// ─── POST /api/sales/:id/cancel ───────────────────────────────────────────────
// Cancelling used to ONLY restore stock and flip Payment_Status — it never
// reversed the sale's accounting journal (GST payable stayed inflated
// forever), never restored an Old Gold/Gift Voucher balance the sale had
// consumed, never undid the customer's Total_Purchase_Value/Count/Loyalty_
// Points, and could be called twice (double-restoring stock and re-
// reversing an already-cancelled sale). All fixed here. A Savings Scheme
// adjustment is deliberately NOT auto-reversed — there's no clean per-line
// record of which member/bonus rows were touched to reverse safely, so
// this refuses rather than guessing at undoing someone's scheme balance.
router.post('/:id/cancel', authenticate, requirePermission('sales'), async (req, res) => {
  const trx = await db.transaction();
  try {
    const sale = await trx('tbl_sales_header').where({ Sale_ID: req.params.id, Tenant_ID: req.user.tenantId }).first();
    if (!sale) { await trx.rollback(); return sendError(res, 404, 'Sale not found.'); }
    if (sale.Payment_Status === 'Cancelled') { await trx.rollback(); return sendError(res, 400, 'This sale is already cancelled.'); }
    if (sale.Payment_Status === 'Paid') { await trx.rollback(); return sendError(res, 400, 'Cannot cancel a fully paid sale — that needs a proper return/credit-note flow, not a cancellation.'); }
    if (parseFloat(sale.Scheme_Adjustment_Amount || 0) > 0 || parseFloat(sale.Bonus_Adjustment_Amount || 0) > 0) {
      await trx.rollback();
      return sendError(res, 400, 'This sale used a Savings Scheme balance/bonus adjustment — cancelling it automatically isn\'t supported. Correct the scheme member\'s balance by hand first, then contact support to cancel the sale.');
    }

    await trx('tbl_sales_header').where({ Sale_ID: req.params.id }).update({
      Payment_Status: 'Cancelled',
      Notes: `Cancelled: ${req.body.reason || 'No reason'} by ${req.user.username}`,
    });

    await reverseSaleSideEffects(trx, sale, req);

    await trx.commit();

    // Reverse the original accounting journal — an equal-and-opposite
    // journal referencing the original (same "reverse, never silently
    // edit history" pattern as accounting.js's own voucher reversal).
    // Posted AFTER commit, same non-blocking convention as every other
    // ledger post in this file — a bookkeeping-side failure must never
    // undo a cancellation that already succeeded.
    try {
      const originalJournal = await db('tbl_accounting_journal')
        .where({ Tenant_ID: req.user.tenantId, Source_Type: 'SALE', Reference: sale.Invoice_Number }).first();
      if (originalJournal) {
        const originalEntries = await db('tbl_accounting_entries').where({ Journal_ID: originalJournal.Journal_ID });
        await postJournal({
          tenantId: req.user.tenantId, sourceType: 'SALE', sourceId: sale.Sale_ID, reference: `CANCEL-${sale.Invoice_Number}`,
          narration: `Cancellation of invoice ${sale.Invoice_Number}${req.body.reason ? ' — ' + req.body.reason : ''}`,
          createdBy: req.user.username, dataMode: sale.Data_Mode, branchId: sale.Branch_ID,
          lines: originalEntries.map((e) => ({ account: e.Ledger_Account, type: e.Entry_Type === 'Dr' ? 'Cr' : 'Dr', amount: parseFloat(e.Amount) })),
        });
      }
    } catch (err) {
      console.error('[Sales] Cancellation reversal journal failed (sale still cancelled fine):', err.message);
    }

    return sendSuccess(res, null, 'Sale cancelled successfully.');
  } catch (err) {
    await trx.rollback();
    return sendError(res, 500, 'Failed to cancel sale.');
  }
});

// ─── POST /api/sales/:id/return ────────────────────────────────────────────────
// /cancel refuses outright on a fully-paid sale ("that needs a proper
// return/credit-note flow") — this is that flow. Reuses the exact same
// side-effect reversal as /cancel (stock, Old Gold/Gift Voucher balances,
// customer totals, loyalty points both directions), but with two real
// differences a genuinely-paid, already-completed sale needs:
//   1. The money already collected has to go SOMEWHERE — Refund_Mode picks
//      Cash, a specific Bank account, or Store Credit. Store Credit issues
//      a real, immediately-usable tbl_customer_advance row (the same
//      ledger built for Purchase Hub's Advance Receipt/Adjustment) rather
//      than inventing a separate "credit note" document type.
//   2. The reversal journal can't just blindly flip every original line
//      the way /cancel's does — SELF_RESTORING_LEDGER_ACCOUNTS (COGS,
//      Old Gold/Scheme/Bonus/Gift Voucher/Loyalty, Customer Receivable)
//      still flip normally on their own account either way, but the
//      REAL payment lines (Cash/UPI/Card/Cheque/a specific bank ledger)
//      get redirected to whichever single channel Refund_Mode picked,
//      not proportionally reversed across however the sale happened to
//      be originally split.
router.post('/:id/return', authenticate, requirePermission('sales'), [
  body('Refund_Mode').isIn(['Cash', 'Bank', 'Store Credit']).withMessage('Refund_Mode must be Cash, Bank, or Store Credit'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return sendValidationError(res, errors.array());
  if (req.body.Refund_Mode === 'Bank' && !req.body.Bank_Account_ID) {
    return sendError(res, 400, 'Bank_Account_ID is required when Refund_Mode is Bank.');
  }

  const trx = await db.transaction();
  try {
    const sale = await trx('tbl_sales_header').where({ Sale_ID: req.params.id, Tenant_ID: req.user.tenantId }).first();
    if (!sale) { await trx.rollback(); return sendError(res, 404, 'Sale not found.'); }
    if (sale.Payment_Status === 'Cancelled') { await trx.rollback(); return sendError(res, 400, 'This sale is already cancelled/returned.'); }
    if (sale.Payment_Status !== 'Paid') {
      await trx.rollback();
      return sendError(res, 400, `This sale is ${sale.Payment_Status}, not fully Paid — use Cancel instead of Return for an unpaid or partially-paid sale.`);
    }
    if (parseFloat(sale.Scheme_Adjustment_Amount || 0) > 0 || parseFloat(sale.Bonus_Adjustment_Amount || 0) > 0) {
      await trx.rollback();
      return sendError(res, 400, 'This sale used a Savings Scheme balance/bonus adjustment — returning it automatically isn\'t supported. Correct the scheme member\'s balance by hand first, then contact support.');
    }
    if (req.body.Refund_Mode === 'Store Credit' && !sale.Customer_ID) {
      await trx.rollback();
      return sendError(res, 400, 'Store Credit requires a customer linked to this sale — this was a walk-in sale with no customer on record.');
    }

    const returnReference = `RETURN-${sale.Invoice_Number}`;

    await trx('tbl_sales_header').where({ Sale_ID: req.params.id }).update({
      Payment_Status: 'Cancelled', // same terminal status as /cancel — every existing report/query that already excludes 'Cancelled' sales correctly excludes a return too, with no separate status value to thread through dozens of unrelated queries
      Notes: `Returned: ${req.body.reason || 'No reason'} by ${req.user.username} — refunded via ${req.body.Refund_Mode}`,
      Returned_Date: new Date(), // distinguishes a real return from a plain /cancel (which leaves this null) — the Running Stock report's Sales Return component reads this
    });

    await reverseSaleSideEffects(trx, sale, req);

    let storeCreditAdvance = null;
    // The actual refund-journal construction happens after commit (needs
    // the original journal's real entries) — but the Store Credit
    // advance row itself is real customer data, created inside the same
    // transaction as everything else so it can never end up orphaned by
    // a later journal-posting failure.
    await trx.commit();

    try {
      const originalJournal = await db('tbl_accounting_journal')
        .where({ Tenant_ID: req.user.tenantId, Source_Type: 'SALE', Reference: sale.Invoice_Number }).first();
      if (originalJournal) {
        const originalEntries = await db('tbl_accounting_entries').where({ Journal_ID: originalJournal.Journal_ID });
        const lines = [];
        let realPaymentTotal = 0;

        for (const e of originalEntries) {
          const amount = parseFloat(e.Amount);
          if (e.Entry_Type === 'Cr') {
            // Sales Account, Output CGST/SGST/IGST, Round Off, the Cr
            // half of the COGS pair (a metal's stock account) — always
            // flip back onto the same account, regardless of refund mode.
            lines.push({ account: e.Ledger_Account, type: 'Dr', amount });
          } else if (SELF_RESTORING_LEDGER_ACCOUNTS.has(e.Ledger_Account)) {
            // COGS itself, or a line whose balance is already restored
            // above (Old Gold/Scheme/Bonus/Gift Voucher/Loyalty/
            // Receivable) — flip normally, never redirected.
            lines.push({ account: e.Ledger_Account, type: 'Cr', amount });
          } else {
            // A genuine "money in" line (Cash/UPI/Card/Cheque/a specific
            // bank's own ledger) — redirected to the chosen refund
            // channel below instead of flipped on its original account.
            realPaymentTotal += amount;
          }
        }

        realPaymentTotal = round2(realPaymentTotal);
        if (realPaymentTotal > 0) {
          if (req.body.Refund_Mode === 'Store Credit') {
            const receiptNumber = `${returnReference}-CR`;
            const [advance] = await db('tbl_customer_advance').insert({
              Tenant_ID: req.user.tenantId, Branch_ID: sale.Branch_ID || null, Customer_ID: sale.Customer_ID,
              Amount: realPaymentTotal, Balance_Amount: realPaymentTotal, Payment_Mode: 'Return Credit',
              Reference: receiptNumber, Purpose: `Store credit from returned invoice ${sale.Invoice_Number}`,
              Status: 'Active', Created_By: req.user.username,
            }).returning('*');
            storeCreditAdvance = advance;
            lines.push({ account: 'Customer Advance Account', group: 'Liabilities', sub: 'Advance', type: 'Cr', amount: realPaymentTotal });
          } else {
            const payoutLedger = await resolveLedgerForPayment(db, req.user.tenantId, req.body.Refund_Mode === 'Bank' ? 'Bank Transfer' : 'Cash', req.body.Bank_Account_ID);
            lines.push({ account: payoutLedger.account, group: payoutLedger.group, sub: payoutLedger.sub, type: 'Cr', amount: realPaymentTotal });
          }
        }

        await postJournal({
          tenantId: req.user.tenantId, sourceType: 'SALE', sourceId: sale.Sale_ID, reference: returnReference,
          narration: `Return of invoice ${sale.Invoice_Number} — refunded via ${req.body.Refund_Mode}${req.body.reason ? ' — ' + req.body.reason : ''}`,
          createdBy: req.user.username, dataMode: sale.Data_Mode, branchId: sale.Branch_ID,
          lines,
        });
      }
    } catch (err) {
      console.error('[Sales] Return reversal journal failed (return still recorded fine):', err.message);
    }

    return sendSuccess(res, { store_credit: storeCreditAdvance }, `Invoice ${sale.Invoice_Number} returned — refunded via ${req.body.Refund_Mode}.`);
  } catch (err) {
    await trx.rollback();
    console.error('[Sales] Return error:', err.message);
    return sendError(res, 500, 'Failed to process return.');
  }
});

// ─── GET /api/sales/reports/daily ─────────────────────────────────────────────
router.get('/reports/daily', authenticate, async (req, res) => {
  const { date } = req.query;
  const targetDate = date || dayjs().format('YYYY-MM-DD'); // local (IST) day, not toISOString()'s UTC one

  try {
    const report = await db('tbl_sales_header')
      .where('Tenant_ID', req.user.tenantId)
      .where('Data_Mode', modeVal(req))
      .whereRaw(`DATE("Sale_Date") = ?`, [targetDate])
      .where('Payment_Status', '!=', 'Cancelled')
      .select(
        db.raw('COUNT(*) as total_sales'),
        db.raw('SUM("Net_Payable_Amount") as total_amount'),
        db.raw('SUM("Amount_Paid") as total_collected'),
        db.raw('SUM("Discount_Amount") as total_discount'),
        db.raw('SUM("GST_Amount") as total_gst'),
        db.raw('SUM("Total_Gross_Weight") as total_weight')
      )
      .first();

    const byPaymentMode = await db('tbl_sales_header')
      .where('Tenant_ID', req.user.tenantId)
      .where('Data_Mode', modeVal(req))
      .whereRaw(`DATE("Sale_Date") = ?`, [targetDate])
      .where('Payment_Status', '!=', 'Cancelled')
      .groupBy('Payment_Mode')
      .select('Payment_Mode', db.raw('COUNT(*) as count'), db.raw('SUM("Net_Payable_Amount") as amount'));

    return sendSuccess(res, { date: targetDate, summary: report, byPaymentMode });
  } catch (err) {
    return sendError(res, 500, 'Failed to generate daily report.');
  }
});

module.exports = router;
