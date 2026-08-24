/**
 * Old Gold Exchange — revives the existing tbl_old_gold_exchange table
 * (real columns: gross/net weight, purity, melting deduction, rate,
 * Used_Amount/Balance_Amount) which no route ever wrote to before this;
 * POS previously only stored a bare Old_Gold_Exchange_Amount number
 * directly on the sale, with no voucher, no purity/rate breakdown.
 */
const router = require('express').Router();
const { body, validationResult } = require('express-validator');
const db = require('../db/tenantDb').tenantDb;
const { sendSuccess, sendError, sendValidationError } = require('../utils/response');
const { authenticate } = require('../middleware/auth');
const { generateOldGoldAdjustmentNumber } = require('../utils/invoiceNumber');
const { modeVal } = require('../utils/dataModeFilter');
const { auditLog } = require('../utils/auditLogger');

// ── POST /api/old-gold/exchange ────────────────────────────────────────────────
// Creates a real Old Gold Exchange voucher ahead of finalizing a POS bill.
// Uses the exact same formula as client/src/utils/calculations.js's
// calculateOldGoldExchange, computed server-side so the stored voucher is
// authoritative regardless of what the client displayed.
router.post('/exchange', authenticate, [
  body('Old_Gold_Weight').isFloat({ min: 0.001 }).withMessage('Gross weight required'),
  body('Purity_Percentage').isFloat({ min: 1, max: 100 }).withMessage('Purity % required'),
  body('Gold_Rate_At_Exchange').isFloat({ min: 1 }).withMessage('Exchange rate required'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return sendValidationError(res, errors.array());

  const tenantId = req.user.tenantId;
  const {
    Customer_ID, Old_Gold_Weight, Old_Gold_Purity_Code, Purity_Percentage,
    Melting_Deduction_Percent = 2, Gold_Rate_At_Exchange, Certificate_No, Tested_By, Remarks,
  } = req.body;

  try {
    const w = parseFloat(Old_Gold_Weight);
    const purity = parseFloat(Purity_Percentage) / 100;
    const meltDeduct = parseFloat(Melting_Deduction_Percent) / 100;
    const rate = parseFloat(Gold_Rate_At_Exchange);

    const pureGoldWeight = w * purity;
    const meltingDeductWeight = pureGoldWeight * meltDeduct;
    const netExchangeWeight = pureGoldWeight - meltingDeductWeight;
    const totalValue = netExchangeWeight * rate;

    const voucherNumber = await generateOldGoldAdjustmentNumber(tenantId);

    const [exchange] = await db('tbl_old_gold_exchange').insert({
      Tenant_ID: tenantId,
      Data_Mode: modeVal(req),
      Voucher_Number: voucherNumber,
      Customer_ID: Customer_ID || null,
      Old_Gold_Weight: w,
      Old_Gold_Purity_Code: Old_Gold_Purity_Code || null,
      Purity_Percentage,
      Melting_Deduction_Percent,
      Melting_Deduction_Weight: meltingDeductWeight,
      Net_Exchange_Weight: netExchangeWeight,
      Gold_Rate_At_Exchange: rate,
      Total_Value: totalValue,
      Used_Amount: 0,
      Balance_Amount: totalValue,
      Certificate_No: Certificate_No || null,
      Tested_By: Tested_By || null,
      Remarks: Remarks || null,
      Created_By: req.user.username,
    }).returning('*');

    await auditLog({
      tenantId, userId: req.user.userId, tableName: 'tbl_old_gold_exchange',
      recordId: exchange.Exchange_ID, actionType: 'INSERT',
      description: `Old gold exchange voucher ${voucherNumber} created — ₹${totalValue.toFixed(2)} (${w}g @ ${Purity_Percentage}%)`,
      req,
    });

    return sendSuccess(res, exchange, 'Old gold exchange voucher created.', 201);
  } catch (err) {
    console.error('Old gold exchange error:', err);
    return sendError(res, 500, 'Failed to create old gold exchange voucher.');
  }
});

// ── GET /api/old-gold/exchange/:id ─────────────────────────────────────────────
router.get('/exchange/:id', authenticate, async (req, res) => {
  try {
    const exchange = await db('tbl_old_gold_exchange')
      .where({ Exchange_ID: req.params.id, Tenant_ID: req.user.tenantId }).first();
    if (!exchange) return sendError(res, 404, 'Old gold exchange voucher not found.');
    return sendSuccess(res, exchange);
  } catch (err) { return sendError(res, 500, 'Failed to fetch old gold exchange voucher.'); }
});

module.exports = router;
