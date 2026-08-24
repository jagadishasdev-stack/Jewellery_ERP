/**
 * Payment Gateway Routes — Migrated from savings_app backend
 * Supports: Razorpay · PhonePe
 * Used by: Savings Club installments · Mobile app payments
 * All transactions linked to tenant_id for isolation
 */
const router = require('express').Router();
const crypto = require('crypto');
const db = require('../db/tenantDb').tenantDb;
const { sendSuccess, sendError } = require('../utils/response');
const { authenticate } = require('../middleware/auth');
const { auditLog } = require('../utils/auditLogger');

// ─── Helper: get payment gateway config for tenant ────────────────────────────
const getGatewayConfig = async (tenantId, gateway) => {
  // Check if tenant has custom gateway config stored
  const config = await db('tbl_payment_gateway_config')
    .where({ Tenant_ID: tenantId, Gateway: gateway, Is_Active: true })
    .first()
    .catch(() => null);

  if (config) {
    return {
      key_id:     config.Key_ID,
      key_secret: config.Key_Secret,
      merchant_id: config.Merchant_ID,
    };
  }

  // Fall back to env variables (ERP provider default)
  if (gateway === 'razorpay') {
    return {
      key_id:     process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    };
  }
  if (gateway === 'phonepe') {
    return {
      merchant_id: process.env.PHONEPE_MERCHANT_ID,
      salt_key:    process.env.PHONEPE_SALT_KEY,
      salt_index:  process.env.PHONEPE_SALT_INDEX || '1',
    };
  }
  return null;
};

// ══════════════════════════════════════════════════════════════════════════════
// RAZORPAY
// ══════════════════════════════════════════════════════════════════════════════

// ─── POST /api/payments/razorpay/create-order ─────────────────────────────────
// Migrated from savings_app: POST /api/razorpay/create-order
router.post('/razorpay/create-order', authenticate, async (req, res) => {
  try {
    const { amount, currency = 'INR', receipt, member_id, scheme_id, purpose } = req.body;
    if (!amount || amount <= 0) return sendError(res, 400, 'Amount is required.');

    // Get gateway config — use request-provided keys OR tenant config
    const keyId     = req.body.rpay_keyId     || process.env.RAZORPAY_KEY_ID;
    const keySecret = req.body.rpay_KeySecret || process.env.RAZORPAY_KEY_SECRET;

    if (!keyId || !keySecret) {
      return sendError(res, 400, 'Razorpay credentials not configured. Please set in Settings → Payment Gateway.');
    }

    const Razorpay = require('razorpay');
    const rzp = new Razorpay({ key_id: keyId, key_secret: keySecret });

    const receiptId = receipt || `RCP-${req.user.tenantId}-${Date.now().toString().slice(-8)}`;

    const order = await rzp.orders.create({
      amount:          Math.round(parseFloat(amount) * 100), // paise
      currency,
      receipt:         receiptId,
      payment_capture: 1,
      notes: {
        tenant_id: req.user.tenantId,
        member_id: member_id || '',
        purpose:   purpose   || 'Scheme Payment',
      },
    });

    // Log the order creation
    await db('tbl_pg_order_track').insert({
      Tenant_ID:  req.user.tenantId,
      Gateway:    'razorpay',
      Order_ID:   order.id,
      Amount:     parseFloat(amount),
      Currency:   currency,
      Receipt:    receiptId,
      Member_ID:  member_id || null,
      Purpose:    purpose || 'Scheme Payment',
      Status:     'created',
      Created_By: req.user.username,
    }).catch(() => {}); // non-fatal if table doesn't exist yet

    return sendSuccess(res, { order, key_id: keyId }, 'Razorpay order created.');
  } catch (err) {
    console.error('Razorpay create order error:', err.message);
    return sendError(res, 500, `Failed to create Razorpay order: ${err.message}`);
  }
});

// ─── POST /api/payments/razorpay/verify ───────────────────────────────────────
// Migrated from savings_app: POST /api/razorpay/verify-payment
router.post('/razorpay/verify', authenticate, async (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      amount,
      member_id,
      scheme_id,
      purpose,
    } = req.body;

    const keySecret = req.body.rpay_keySecret || process.env.RAZORPAY_KEY_SECRET;
    if (!keySecret) return sendError(res, 400, 'Razorpay secret not configured.');

    // Native UPI intent may not return signature
    const isNativeFlow = !razorpay_signature || razorpay_signature === 'native_flow_no_signature';

    if (!isNativeFlow) {
      // Verify signature
      const body = `${razorpay_order_id}|${razorpay_payment_id}`;
      const expected = crypto.createHmac('sha256', keySecret).update(body).digest('hex');
      if (expected !== razorpay_signature) {
        return sendError(res, 400, 'Payment signature verification failed.');
      }
    }

    const tenantId = req.user.tenantId;

    // Record transaction
    await db('tbl_pg_transactions').insert({
      Tenant_ID:   tenantId,
      Gateway:     'razorpay',
      Order_ID:    razorpay_order_id,
      Payment_ID:  razorpay_payment_id,
      Signature:   razorpay_signature || 'native',
      Amount:      parseFloat(amount || 0),
      Currency:    'INR',
      Status:      'success',
      Member_ID:   member_id || null,
      Scheme_ID:   scheme_id || null,
      Purpose:     purpose || 'Scheme Payment',
      Created_By:  req.user.username,
    }).catch(() => {}); // non-fatal if table doesn't exist

    // If this is a scheme payment — record the collection
    if (member_id && scheme_id) {
      await db('tbl_scheme_transactions').insert({
        Tenant_ID:          tenantId,
        Member_ID:          parseInt(member_id),
        Txn_Type:           'Collection',
        Amount:             parseFloat(amount || 0),
        Net_Amount:         parseFloat(amount || 0),
        Payment_Mode:       'UPI (Razorpay)',
        Payment_Reference:  razorpay_payment_id,
        Collection_Source:  'App',
        Receipt_Number:     `RPY-${razorpay_payment_id?.slice(-8) || Date.now()}`,
        Created_By:         req.user.username,
      }).catch((e) => console.warn('Scheme transaction insert failed:', e.message));

      // Update member paid count + amount
      const member = await db('tbl_scheme_members').where({ Member_ID: member_id, Tenant_ID: tenantId }).first();
      if (member) {
        const newPaid = (member.Installments_Paid || 0) + 1;
        const newTotal = parseFloat(member.Total_Amount_Paid || 0) + parseFloat(amount || 0);
        const isComplete = newPaid >= member.Total_Installments;
        await db('tbl_scheme_members').where('Member_ID', member_id).update({
          Installments_Paid:  newPaid,
          Total_Amount_Paid:  newTotal,
          Status:             isComplete ? 'Matured' : 'Active',
          Modified_Date:      new Date(),
        });
      }
    }

    await auditLog({
      tenantId, userId: req.user.userId,
      tableName: 'tbl_pg_transactions', recordId: razorpay_payment_id,
      actionType: 'INSERT',
      description: `Razorpay payment verified: ₹${amount} | ${purpose || 'Scheme'}`,
      req,
    });

    return sendSuccess(res, {
      payment_id: razorpay_payment_id,
      order_id:   razorpay_order_id,
      amount:     parseFloat(amount || 0),
      verified:   true,
    }, 'Payment verified successfully.');
  } catch (err) {
    console.error('Razorpay verify error:', err.message);
    return sendError(res, 500, `Payment verification failed: ${err.message}`);
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// PHONEPE
// ══════════════════════════════════════════════════════════════════════════════

// ─── POST /api/payments/phonepe/initiate ──────────────────────────────────────
// Migrated from savings_app: POST /api/phonepe/*
router.post('/phonepe/initiate', authenticate, async (req, res) => {
  try {
    const { amount, mobile, member_id, scheme_id, purpose, callback_url } = req.body;
    if (!amount || !mobile) return sendError(res, 400, 'Amount and mobile required.');

    const merchantId  = process.env.PHONEPE_MERCHANT_ID;
    const saltKey     = process.env.PHONEPE_SALT_KEY;
    const saltIndex   = process.env.PHONEPE_SALT_INDEX || '1';

    if (!merchantId || !saltKey) {
      return sendError(res, 400, 'PhonePe credentials not configured. Add PHONEPE_MERCHANT_ID and PHONEPE_SALT_KEY to .env');
    }

    const tenantId = req.user.tenantId;
    const merchantTransactionId = `PPE-${tenantId.slice(0,4)}-${Date.now()}`;

    const payload = {
      merchantId,
      merchantTransactionId,
      merchantUserId: `USER-${member_id || mobile}`,
      amount: Math.round(parseFloat(amount) * 100), // paise
      redirectUrl: callback_url || `${process.env.CLIENT_URL}/payment-result`,
      redirectMode: 'POST',
      callbackUrl:  callback_url || `${process.env.CLIENT_URL}/api/payments/phonepe/callback`,
      mobileNumber: mobile,
      paymentInstrument: { type: 'PAY_PAGE' },
    };

    const base64Payload = Buffer.from(JSON.stringify(payload)).toString('base64');
    const checksum = crypto
      .createHash('sha256')
      .update(`${base64Payload}/pg/v1/pay${saltKey}`)
      .digest('hex') + `###${saltIndex}`;

    const env = process.env.PHONEPE_ENV || 'production';
    const baseUrl = env === 'sandbox'
      ? 'https://api-preprod.phonepe.com/apis/pg-sandbox'
      : 'https://api.phonepe.com/apis/hermes';

    const ppRes = await fetch(`${baseUrl}/pg/v1/pay`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-VERIFY': checksum },
      body: JSON.stringify({ request: base64Payload }),
    });

    const ppData = await ppRes.json();

    if (ppData.success) {
      await db('tbl_pg_order_track').insert({
        Tenant_ID:   tenantId,
        Gateway:     'phonepe',
        Order_ID:    merchantTransactionId,
        Amount:      parseFloat(amount),
        Member_ID:   member_id || null,
        Purpose:     purpose || 'Scheme Payment',
        Status:      'initiated',
        Created_By:  req.user.username,
      }).catch(() => {});

      return sendSuccess(res, {
        transactionId:  merchantTransactionId,
        redirectUrl:    ppData.data?.instrumentResponse?.redirectInfo?.url,
        merchantId,
      }, 'PhonePe payment initiated.');
    }

    return sendError(res, 400, ppData.message || 'PhonePe initiation failed.');
  } catch (err) {
    console.error('PhonePe initiate error:', err.message);
    return sendError(res, 500, `PhonePe failed: ${err.message}`);
  }
});

// ─── POST /api/payments/phonepe/verify ───────────────────────────────────────
router.post('/phonepe/verify', authenticate, async (req, res) => {
  try {
    const { merchantTransactionId, member_id, amount, purpose } = req.body;

    const merchantId = process.env.PHONEPE_MERCHANT_ID;
    const saltKey    = process.env.PHONEPE_SALT_KEY;
    const saltIndex  = process.env.PHONEPE_SALT_INDEX || '1';

    const checksum = crypto
      .createHash('sha256')
      .update(`/pg/v1/status/${merchantId}/${merchantTransactionId}${saltKey}`)
      .digest('hex') + `###${saltIndex}`;

    const env = process.env.PHONEPE_ENV || 'production';
    const baseUrl = env === 'sandbox'
      ? 'https://api-preprod.phonepe.com/apis/pg-sandbox'
      : 'https://api.phonepe.com/apis/hermes';

    const checkRes = await fetch(`${baseUrl}/pg/v1/status/${merchantId}/${merchantTransactionId}`, {
      headers: { 'Content-Type': 'application/json', 'X-VERIFY': checksum, 'X-MERCHANT-ID': merchantId },
    });

    const checkData = await checkRes.json();
    const tenantId = req.user.tenantId;

    if (checkData.success && checkData.code === 'PAYMENT_SUCCESS') {
      const paidAmount = parseFloat(checkData.data?.amount || amount || 0) / 100;

      await db('tbl_pg_transactions').insert({
        Tenant_ID:  tenantId,
        Gateway:    'phonepe',
        Order_ID:   merchantTransactionId,
        Payment_ID: checkData.data?.transactionId,
        Amount:     paidAmount,
        Status:     'success',
        Member_ID:  member_id || null,
        Purpose:    purpose || 'Scheme Payment',
        Created_By: req.user.username,
      }).catch(() => {});

      // Record scheme collection if applicable
      if (member_id) {
        await db('tbl_scheme_transactions').insert({
          Tenant_ID:         tenantId,
          Member_ID:         parseInt(member_id),
          Txn_Type:          'Collection',
          Amount:            paidAmount,
          Net_Amount:        paidAmount,
          Payment_Mode:      'UPI (PhonePe)',
          Payment_Reference: checkData.data?.transactionId || merchantTransactionId,
          Collection_Source: 'App',
          Receipt_Number:    `PPE-${merchantTransactionId.slice(-8)}`,
          Created_By:        req.user.username,
        }).catch((e) => console.warn('PhonePe scheme tx failed:', e.message));

        // Update member
        const member = await db('tbl_scheme_members').where({ Member_ID: member_id, Tenant_ID: tenantId }).first();
        if (member) {
          const newPaid = (member.Installments_Paid || 0) + 1;
          const isComplete = newPaid >= member.Total_Installments;
          await db('tbl_scheme_members').where('Member_ID', member_id).update({
            Installments_Paid: newPaid,
            Total_Amount_Paid: parseFloat(member.Total_Amount_Paid || 0) + paidAmount,
            Status:            isComplete ? 'Matured' : 'Active',
            Modified_Date:     new Date(),
          });
        }
      }

      return sendSuccess(res, { verified: true, amount: paidAmount, transactionId: checkData.data?.transactionId }, 'PhonePe payment verified.');
    }

    return sendError(res, 400, `Payment not successful: ${checkData.code}`);
  } catch (err) {
    console.error('PhonePe verify error:', err.message);
    return sendError(res, 500, `PhonePe verification failed: ${err.message}`);
  }
});

// ─── GET /api/payments/history — payment transaction history ─────────────────
router.get('/history', authenticate, async (req, res) => {
  const { member_id, gateway, page = 1, limit = 50 } = req.query;
  try {
    let qb = db('tbl_pg_transactions')
      .where('Tenant_ID', req.user.tenantId)
      .orderBy('Created_Date', 'desc');
    if (member_id) qb = qb.where('Member_ID', member_id);
    if (gateway)   qb = qb.where('Gateway', gateway);
    const rows = await qb.limit(parseInt(limit)).offset((parseInt(page)-1)*parseInt(limit)).catch(() => []);
    return sendSuccess(res, rows);
  } catch {
    return sendSuccess(res, []);
  }
});

module.exports = router;
