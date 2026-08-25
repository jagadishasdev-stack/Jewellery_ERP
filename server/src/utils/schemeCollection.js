/**
 * Shared savings-scheme collection logic — the single place a scheme
 * installment payment gets recorded, no matter which door it came
 * through (counter staff via POST /api/savings/collect, or a member
 * paying in the mobile app via Razorpay/PhonePe). Extracted out of
 * savingsScheme.js's /collect route so both callers post the SAME real
 * double-entry accounting instead of one of them quietly writing a raw
 * row that never reaches Trial Balance / Ledger / Tally.
 */
const db = require('../db/tenantDb').tenantDb;
const { postJournal } = require('./accountingEngine');
const { resolveLedgerForPayment } = require('./paymentLedgerMap');
const { nextNumber } = require('./numberFormat');

const genReceiptNumber = async (tenantId) => nextNumber({
  tenantId, table: 'tbl_scheme_transactions', column: 'Receipt_Number',
  prefix: 'SCM', tenantCode: tenantId.replace('_', ''), padWidth: 4,
});

async function queueNotification(tenantId, memberId, type, channel, message) {
  try {
    await db('tbl_scheme_notifications').insert({
      Tenant_ID: tenantId, Member_ID: memberId, Type: type, Channel: channel,
      Message: message, Status: 'Pending',
    });
  } catch (e) { /* non-fatal */ }
}

/**
 * Records one installment collection for a scheme member: validates the
 * member, writes the transaction + updates member totals inside a DB
 * transaction, then (after commit) posts the real accounting journal
 * entry and queues a receipt notification — exactly what the counter
 * flow already did, just callable from more than one route now.
 *
 * @param {object} opts
 * @param {string} opts.tenantId
 * @param {number} opts.memberId
 * @param {number} opts.amount
 * @param {string} opts.paymentMode        - e.g. 'UPI', 'Cash', 'Cheque'
 * @param {string} [opts.paymentReference] - gateway payment ID, cheque no, etc.
 * @param {string} [opts.collectionSource] - 'Counter' | 'App' | 'Agent' (default 'Counter')
 * @param {number} [opts.collectedBy]      - User_ID, if a staff member collected it
 * @param {string} [opts.branchId]
 * @param {string} [opts.createdBy]        - audit "Created_By" string
 * @returns {{ txn: object, receiptNumber: string, isComplete: boolean, accounting: object }}
 * @throws  if the member doesn't exist or isn't Active — caller decides the HTTP response.
 */
async function recordSchemeCollection({
  tenantId, memberId, amount, paymentMode, paymentReference,
  collectionSource = 'Counter', collectedBy = null, branchId = null,
  createdBy = 'system',
}) {
  const trx = await db.transaction();
  let txn, receiptNumber, isComplete, member, bonusGroup, isDuplicate = false;
  try {
    member = await trx('tbl_scheme_members').where({ Member_ID: memberId, Tenant_ID: tenantId }).first();
    if (!member) { await trx.rollback(); throw Object.assign(new Error('Member not found.'), { statusCode: 404 }); }

    // Idempotency — ONLY when a real external reference is given (a gateway
    // payment ID, a cheque number). Counter cash collections legitimately
    // have no reference at all, so they're never de-duplicated against —
    // this only guards the case a client retry, or the Razorpay webhook
    // reconciling the same payment the app already recorded, would
    // otherwise double-credit a member for one real payment.
    if (paymentReference) {
      const existing = await trx('tbl_scheme_transactions')
        .where({ Tenant_ID: tenantId, Member_ID: memberId, Payment_Reference: paymentReference })
        .first();
      if (existing) {
        isDuplicate = true;
        txn = existing;
        receiptNumber = existing.Receipt_Number;
        isComplete = member.Status === 'Matured' || (member.Installments_Paid >= member.Total_Installments);
      }
    }

    if (isDuplicate) {
      await trx.commit();
      return { txn, receiptNumber, isComplete, duplicate: true, accounting: null };
    }

    if (member.Status !== 'Active') {
      await trx.rollback();
      throw Object.assign(new Error(`Cannot collect — member status: ${member.Status}`), { statusCode: 400 });
    }

    receiptNumber = await genReceiptNumber(tenantId);
    const netAmount = parseFloat(amount);
    const newInstallmentNo = member.Installments_Paid + 1;

    [txn] = await trx('tbl_scheme_transactions').insert({
      Tenant_ID: tenantId, Receipt_Number: receiptNumber,
      Member_ID: memberId, Tenant_Member_No: member.Member_Number,
      Txn_Type: 'Collection', Installment_No: newInstallmentNo,
      Amount: amount, Penalty_Amount: 0, Net_Amount: netAmount,
      Payment_Mode: paymentMode, Payment_Reference: paymentReference || null,
      Collection_Source: collectionSource, Collected_By: collectedBy,
      Branch_ID: branchId, Created_By: createdBy,
    }).returning('*');

    const newPaid = member.Installments_Paid + 1;
    const newTotal = parseFloat(member.Total_Amount_Paid) + netAmount;
    isComplete = newPaid >= member.Total_Installments;
    await trx('tbl_scheme_members').where('Member_ID', memberId).update({
      Installments_Paid: newPaid, Total_Amount_Paid: newTotal,
      Status: isComplete ? 'Matured' : 'Active', Modified_Date: new Date(),
    });

    if (isComplete) {
      bonusGroup = await trx('tbl_scheme_groups').where('Group_ID', member.Group_ID).first();
      if (bonusGroup?.Bonus_Amount > 0) {
        await trx('tbl_scheme_bonuses').insert({
          Tenant_ID: tenantId, Member_ID: memberId, Bonus_Type: 'Cash',
          Bonus_Amount: bonusGroup.Bonus_Amount, Credit_Date: new Date(), Created_By: 'system',
        });
      }
    }

    await trx.commit();
  } catch (err) {
    if (!trx.isCompleted?.() ) { try { await trx.rollback(); } catch (_) {} }
    throw err;
  }

  // ── Post to the real ledger — same convention as Sales/Purchase/Day
  // Close, non-blocking so a slow/failed journal post never rolls back a
  // collection that's already safely committed above.
  const netAmount = parseFloat(amount);
  const schemeInfo = await db('tbl_scheme_master').where('Scheme_ID', member.Scheme_ID).first().catch(() => null);
  const isDigiGold = schemeInfo?.Scheme_Type?.toLowerCase().includes('digi') || schemeInfo?.Scheme_Name?.toLowerCase().includes('digi');
  const creditLedger = isDigiGold
    ? { account: 'Digi Gold Liability Account', group: 'Liabilities', sub: 'Advance' }
    : { account: 'Customer Scheme Deposit Account', group: 'Liabilities', sub: 'Advance' };
  const debitLedger = await resolveLedgerForPayment(db, tenantId, paymentMode, null);
  const entryNarration = `Scheme collection | ${member.Member_Number} | ${receiptNumber} | Inst ${member.Installments_Paid + 1}/${member.Total_Installments}`;

  (async () => {
    await db('tbl_scheme_accounting_entries').insert({
      Tenant_ID: tenantId, Txn_ID: txn.Txn_ID, Entry_Date: new Date(), Receipt_No: receiptNumber, Member_ID: memberId,
      Debit_Account: debitLedger.account, Credit_Account: creditLedger.account, Amount: netAmount,
      Narration: entryNarration, Created_By: createdBy,
    }).catch(() => {});

    await postJournal({
      tenantId, sourceType: 'RECEIPT', sourceId: txn.Txn_ID, reference: receiptNumber, narration: entryNarration,
      createdBy,
      lines: [
        { account: debitLedger.account, group: debitLedger.group, sub: debitLedger.sub, type: 'Dr', amount: netAmount },
        { account: creditLedger.account, group: creditLedger.group, sub: creditLedger.sub, type: 'Cr', amount: netAmount },
      ],
    });

    if (isComplete && bonusGroup?.Bonus_Amount > 0) {
      const bonusNarration = `Scheme maturity bonus | ${member.Member_Number}`;
      await db('tbl_scheme_accounting_entries').insert({
        Tenant_ID: tenantId, Entry_Date: new Date(), Receipt_No: `BONUS-${receiptNumber}`, Member_ID: memberId,
        Debit_Account: 'Scheme Bonus Expense Account', Credit_Account: 'Scheme Bonus Provision Account',
        Amount: bonusGroup.Bonus_Amount, Narration: bonusNarration, Created_By: 'system',
      }).catch(() => {});
      await postJournal({
        tenantId, sourceType: 'JOURNAL', reference: `BONUS-${receiptNumber}`, narration: bonusNarration, createdBy: 'system',
        lines: [
          { account: 'Scheme Bonus Expense Account', group: 'Expenses', sub: 'Indirect Expense', type: 'Dr', amount: bonusGroup.Bonus_Amount },
          { account: 'Scheme Bonus Provision Account', group: 'Liabilities', sub: 'Provision', type: 'Cr', amount: bonusGroup.Bonus_Amount },
        ],
      });
    }
  })().catch((err) => console.error('[SchemeCollection] Ledger post failed (collection itself still recorded fine):', err.message));

  queueNotification(tenantId, memberId, 'Collection', 'WhatsApp',
    `Receipt: ${receiptNumber} | Installment ${member.Installments_Paid + 1} of ${member.Total_Installments} | ₹${netAmount} received.`
  ).catch(() => {});

  return {
    txn, receiptNumber, isComplete,
    accounting: { debit: debitLedger.account, credit: creditLedger.account, amount: netAmount },
  };
}

module.exports = { recordSchemeCollection, queueNotification, genReceiptNumber };
