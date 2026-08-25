/**
 * Compatibility layer for the `savings_app` mobile frontend.
 *
 * That frontend was originally built against a separate MySQL backend
 * (`savingappbackend`) keyed by a numeric `Store_ID`. DLJ (Dhanalakshmi
 * Jewellers) was never a store in that system — it's a real Jewellery ERP
 * tenant, so its savings-scheme data lives here, in Postgres, keyed by
 * Tenant_ID (see server/src/routes/savingsScheme.js).
 *
 * Rather than rewrite every screen in the mobile app that calls
 * `/api/core/...`, these routes answer the SAME request shapes the
 * frontend already sends, but treat whatever it calls `store_id` /
 * `storeID` / `:storeId` as a Tenant_ID string instead of a numeric
 * Store_ID (see savings_app/frontend/src/config/constants.js — STORE_ID
 * is now literally the Tenant_ID string, e.g. "DLJ").
 *
 * Public — no login required. The old frontend calls these with plain
 * axios and no Authorization header (dashboard needs to render for
 * guests too), so these are intentionally NOT behind `authenticate`.
 * Every query below is still scoped by Tenant_ID, so one tenant's data
 * can never leak into another's response.
 */
const router = require('express').Router();
// Separate router because these two need to live at /api/razorpay/v2/...
// (the exact path savings_app/frontend/src/components/SchemeDetailPageV2.js
// already calls), not under /api/core like everything else in this file.
const razorpayV2Router = require('express').Router();
const crypto = require('crypto');
const Razorpay = require('razorpay');
const db = require('../db/knex');
const { getTenantDb } = require('../db/tenantDbResolver');
const { tenantDb, runWithTenantDb } = require('../db/tenantDb');
const { recordSchemeCollection } = require('../utils/schemeCollection');
const { sendSuccess, sendError } = require('../utils/response');

// Real credentials only, resolved per-tenant from tbl_payment_gateway_config
// — never a request-supplied or env-var fallback for the member-facing
// flow (that's how the OLD savings-app design ended up sending key_secret
// to the phone and back; see the PUT /api/super-admin/tenant/:id/
// payment-gateway route in superAdmin.js for how a tenant's real keys get
// stored). Returns null if nothing is configured yet.
async function getRazorpayConfig(tenantId) {
  return tenantDb('tbl_payment_gateway_config')
    .where({ Tenant_ID: tenantId, Gateway: 'razorpay', Is_Active: true })
    .first();
}

// ─── GET /api/core/getbranch/:storeId ──────────────────────────────────────
router.get('/getbranch/:storeId', async (req, res) => {
  try {
    const branches = await db('tbl_branch_master')
      .where({ Tenant_ID: req.params.storeId, Is_Active: true })
      .orderBy('Is_Head_Office', 'desc')
      .orderBy('Branch_Name')
      .select(
        'Branch_ID as id',
        'Branch_Name as branch_name',
        'Branch_Code as branch_code',
        'City as city',
        'Phone as phone',
        'Is_Head_Office as is_head_office',
      );
    return res.json(branches);
  } catch (err) {
    console.error('getbranch error:', err.message);
    return res.json([]);
  }
});

// ─── GET /api/core/getGroups?store_id=&branch= ─────────────────────────────
// Returns the tenant's open savings groups as "plans" for the Saving Plans
// carousel and the /select-plan enrollment flow.
//
// g.App_Join_Allowed is the per-GROUP toggle (Scheme Groups page in the ERP —
// each group's own "App Join" switch), separate from s.Show_In_App which is
// a per-SCHEME switch. A tenant with 10 groups under one scheme can open
// only some of them to the app by flipping App_Join_Allowed per group —
// this is the one and only place that decision is enforced for the app.
router.get('/getGroups', async (req, res) => {
  const tenantId = req.query.store_id || req.query.storeID;
  if (!tenantId) return res.json([]);

  try {
    const groups = await db('tbl_scheme_groups as g')
      .join('tbl_scheme_master as s', function () {
        this.on('s.Scheme_ID', '=', 'g.Scheme_ID').andOn('s.Tenant_ID', '=', 'g.Tenant_ID');
      })
      .where({ 'g.Tenant_ID': tenantId, 'g.Status': 'Active', 'g.App_Join_Allowed': true })
      .andWhere({ 's.Show_In_App': true })
      .select(
        'g.Group_ID as group_id',
        'g.Group_Code as code',
        'g.Monthly_Amount as AMOUNT',
        'g.Total_Installments as no_inst',
        'g.Group_Image_URL as media',
        's.Scheme_Name as scheme_name',
        's.Description as description',
        's.Scheme_Type as scheme_type',
      );

    // "gold_scheme" is a distinct real-time Digi Gold/Silver buying feature
    // (BuyMetalScreen.jsx), not just "the scheme type happens to be gold" —
    // DLJ's groups are fixed-installment savings groups, not Digi live
    // buying plans, so this stays '0' for all of them for now.
    const shaped = groups.map((g) => ({ ...g, gold_scheme: '0' }));
    return res.json(shaped);
  } catch (err) {
    console.error('getGroups error:', err.message);
    return res.json([]);
  }
});

// ─── GET /api/core/member-with-group ───────────────────────────────────────
// Two lookup modes, matching the two real call sites in the mobile app:
//   - ?idAndGroup=<mobile>&storeID=<tenant>        (Dashboard "Your Investments")
//   - ?groupCode=<code>&memberCode=<no>&storeID=<tenant>  (Scheme detail / pay screens)
router.get('/member-with-group', async (req, res) => {
  const tenantId = req.query.storeID || req.query.store_id;
  if (!tenantId) return res.json([]);

  try {
    let query = db('tbl_scheme_members as m')
      .join('tbl_scheme_groups as g', function () {
        this.on('g.Group_ID', '=', 'm.Group_ID').andOn('g.Tenant_ID', '=', 'm.Tenant_ID');
      })
      .join('tbl_scheme_master as s', function () {
        this.on('s.Scheme_ID', '=', 'm.Scheme_ID').andOn('s.Tenant_ID', '=', 'm.Tenant_ID');
      })
      .where({ 'm.Tenant_ID': tenantId });

    if (req.query.groupCode && req.query.memberCode) {
      query = query.andWhere({ 'g.Group_Code': req.query.groupCode, 'm.Member_Number': req.query.memberCode });
    } else if (req.query.idAndGroup) {
      query = query.andWhere({ 'm.Mobile': req.query.idAndGroup });
    } else {
      return res.json([]);
    }

    const rows = await query.select(
      'm.Member_ID as member_id',
      'm.Member_Number as member_no',
      'm.Mobile as mobile',
      'm.Installment_Amount as scheme_amount',
      'm.Total_Amount_Paid as amountPaid',
      'm.Joining_Date as member_created_at',
      'm.Maturity_Date as MaturityDate',
      'm.Status as member_status',
      'g.Group_Code as mgroup',
      'g.Group_Code as code',
      'g.Total_Installments as no_inst',
      's.Scheme_Name as scheme_name',
    );

    // Legacy field: 'A' = matured/closed (shown as "Completed" in the UI
    // and eligible to be filtered out once past its maturity date),
    // anything else = still active.
    const shaped = rows.map((r) => ({
      ...r,
      info: ['Matured', 'Closed', 'Redeemed'].includes(r.member_status) ? 'A' : 'N',
    }));

    return res.json(shaped);
  } catch (err) {
    console.error('member-with-group error:', err.message);
    return res.json([]);
  }
});

// ─── GET /api/core/rates?store_id=&branch= ─────────────────────────────────
// Reads the SAME per-tenant rate table the ERP's own /api/gold-rate/live
// route reads, just without requiring a staff login (metal rates are
// public storefront information).
router.get('/rates', async (req, res) => {
  const tenantId = req.query.store_id || req.query.storeID;
  if (!tenantId) return res.json([]);

  try {
    const rate = await db('tbl_tenant_rates')
      .where('Tenant_ID', tenantId)
      .orderBy('Rate_Date', 'desc')
      .first();

    // No rate set yet for this tenant — same defaults /api/gold-rate/live
    // falls back to, so the two never disagree.
    const r = rate || { Rate_24K: 6850, Rate_22K: 6250, Rate_Silver_925: 82 };

    return res.json([
      { metal: 'Gold', purity: '999HM', rate: parseFloat(r.Rate_24K) },
      { metal: 'Gold', purity: '916HM', rate: parseFloat(r.Rate_22K) },
      { metal: 'Silver', purity: '925', rate: parseFloat(r.Rate_Silver_925) },
    ]);
  } catch (err) {
    console.error('rates error:', err.message);
    return res.json([]);
  }
});

// ─── POST /api/core/userledger ─────────────────────────────────────────────
// Real collection history for one member — backs the mobile app's Ledger
// screen (statement/receipts view). Looked up the same two ways as
// /member-with-group: groupCode+memberCode (preferred, unambiguous) or a
// bare mobile number.
router.post('/userledger', async (req, res) => {
  const tenantId = req.body.storeID || req.body.store_id;
  const { groupCode, memberCode, mobile } = req.body;
  if (!tenantId) return res.json([]);

  try {
    let memberQuery = db('tbl_scheme_members as m')
      .join('tbl_scheme_groups as g', function () {
        this.on('g.Group_ID', '=', 'm.Group_ID').andOn('g.Tenant_ID', '=', 'm.Tenant_ID');
      })
      .where({ 'm.Tenant_ID': tenantId });

    if (groupCode && memberCode) {
      memberQuery = memberQuery.andWhere({ 'g.Group_Code': groupCode, 'm.Member_Number': memberCode });
    } else if (mobile) {
      memberQuery = memberQuery.andWhere({ 'm.Mobile': mobile });
    } else {
      return res.json([]);
    }

    const member = await memberQuery.select('m.Member_ID').first();
    if (!member) return res.json([]);

    const txns = await db('tbl_scheme_transactions')
      .where({ Tenant_ID: tenantId, Member_ID: member.Member_ID })
      .orderBy('Payment_Date', 'desc')
      .select(
        'Receipt_Number as voucher_no',
        'Payment_Date as voucher_date',
        'Net_Amount as amount',
        'Payment_Mode as payment_mode_raw',
      );

    // Legacy numeric payment-mode codes the mobile app's print-voucher
    // dialog already knows how to label (see Ledger.js's paymentMapping).
    const PMODE_CODE = { Cash: 0, Cheque: 1, Card: 8, UPI: 6, NEFT: 7, RTGS: 7, IMPS: 6, Wallet: 6 };

    const shaped = txns.map((t) => ({
      voucher_no: t.voucher_no,
      voucher_date: t.voucher_date,
      amount: t.amount,
      // DLJ's scheme is a fixed monthly cash-collection scheme, not a
      // live gold-accumulation one — there's no per-collection gold
      // rate/weight to show, so these stay genuinely zero/null rather
      // than fabricated.
      rate: null,
      gross_wt: 0,
      pmode: PMODE_CODE[t.payment_mode_raw] ?? '',
    }));

    return res.json(shaped);
  } catch (err) {
    console.error('userledger error:', err.message);
    return res.json([]);
  }
});

// NOTE ON RESPONSE SHAPE: every route below returns FLAT plain JSON
// (`res.json({...})`), not the `sendSuccess()` envelope the rest of the
// ERP uses — because these are answering the REAL, already-shipped
// mobile app screens (savings_app/frontend/src/components/
// SchemeDetailPageV2.js is the one actually routed at /schemepay/...,
// NOT the similarly-named SchemeDetailPage.js), which read fields like
// `response.data.order` and `response.data.key_id` directly, with no
// extra `.data` wrapper. Matching that contract exactly means the
// existing, payment-critical, multi-platform (iOS/Android/Web) checkout
// code in that file needed ZERO changes.

// ─── GET /api/core/payment-gateway/:storeId/:branch ────────────────────────
// Only the SAFE, public bits a client needs to launch Razorpay's own
// Checkout.js widget — key_id is meant to be public (it's what
// checkout.js takes client-side); key_secret is NEVER included here or
// anywhere else this app sends to a phone. Signature verification happens
// entirely server-side in POST /razorpay/v2/verify-payment below, using
// the secret this route deliberately withholds. Because that route never
// reads a client-supplied secret either, the old frontend code that still
// echoes `pgateway.razorpay_key_secret` back and forth is harmless dead
// weight now (it's always undefined) rather than an actual leak.
router.get('/payment-gateway/:storeId/:branch', async (req, res) => {
  try {
    const tenant = await db('tbl_tenant_master').where({ Tenant_ID: req.params.storeId }).first();
    if (!tenant) return res.status(404).json({ error: 'Store not found.' });

    const tenantDbConn = await getTenantDb(req.params.storeId);
    const config = await runWithTenantDb(tenantDbConn, () => getRazorpayConfig(req.params.storeId));

    if (!config) {
      // 200, not 404 — an absent gateway is an expected, handled state
      // (SchemeDetailPageV2.js checks razorpay_std for a recognised
      // value and shows "Online payment is not configured" itself), and
      // returning 200 with standered:null keeps that check working
      // without the axios call itself throwing.
      return res.json({ standered: null, env_ment: null });
    }

    return res.json({
      merchant_id: config.Merchant_ID,
      merchant_name: tenant.Company_Name,
      key_id: config.Key_ID,
      standered: config.Environment === 'test' ? 0 : 1,
      env_ment: config.Environment,
      store_email: tenant.Email,
    });
  } catch (err) {
    console.error('payment-gateway compat error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch payment gateway details.' });
  }
});

// ─── GET /api/core/getPaymentGatewayReference ──────────────────────────────
// A short unique-ish number the app folds into a voucher/reference id
// (`Number(STORE_ID + refno)`) before creating an order — it doesn't need
// to be a global ledger sequence, just collision-resistant per request.
router.get('/getPaymentGatewayReference', async (req, res) => {
  return res.json({ refno: Date.now() % 1000000 });
});

// ─── POST /api/razorpay/v2/create-order ─────────────────────────────────────
// Exact body shape SchemeDetailPageV2.js already sends: rpay_amount,
// rpay_receipt, rpay_MembId, store_id, plus rpay_keyId/rpay_KeySecret
// which are IGNORED here on purpose — credentials are always resolved
// server-side from tbl_payment_gateway_config, never trusted from the
// client (see the file-header note above and superAdmin.js's payment-
// gateway config route for how a tenant's real keys get in there).
razorpayV2Router.post('/create-order', async (req, res) => {
  const { rpay_amount, rpay_receipt, rpay_MembId, store_id } = req.body;
  const tenantId = store_id;
  if (!tenantId || !rpay_amount || rpay_amount <= 0) {
    return res.status(400).json({ error: 'store_id and a positive rpay_amount are required.' });
  }

  try {
    const tenantDbConn = await getTenantDb(tenantId);
    const result = await runWithTenantDb(tenantDbConn, async () => {
      const config = await getRazorpayConfig(tenantId);
      if (!config || !config.Key_ID || !config.Key_Secret) {
        return { error: 'Online payment is not configured for this store yet.' };
      }

      const rzp = new Razorpay({ key_id: config.Key_ID, key_secret: config.Key_Secret });
      const receiptId = rpay_receipt || `SCM-${tenantId}-${Date.now().toString().slice(-8)}`;

      const order = await rzp.orders.create({
        amount: Math.round(parseFloat(rpay_amount) * 100), // paise
        currency: 'INR',
        receipt: receiptId,
        payment_capture: 1,
        notes: { tenant_id: tenantId, member_id: rpay_MembId || '', purpose: 'Scheme Payment' },
      });

      await tenantDb('tbl_pg_order_track').insert({
        Tenant_ID: tenantId, Gateway: 'razorpay', Order_ID: order.id,
        Amount: parseFloat(rpay_amount), Currency: 'INR', Receipt: receiptId,
        Member_ID: rpay_MembId || null, Purpose: 'Scheme Payment',
        Status: 'created', Created_By: 'savings-app-member',
      }).catch(() => {}); // non-fatal if table doesn't exist yet

      return { order, key_id: config.Key_ID }; // key_id only — never key_secret
    });

    if (result.error) return res.status(400).json({ error: result.error });
    return res.json(result);
  } catch (err) {
    console.error('razorpay v2 create-order error:', err.message);
    return res.status(500).json({ error: `Failed to create order: ${err.message}` });
  }
});

// ─── POST /api/razorpay/v2/verify-payment ───────────────────────────────────
// Two verification paths, both entirely server-side:
//   - checkout.js (web) sends a real HMAC signature — verified against it.
//   - Native (iOS/Android SDK) sends "native_flow_no_signature" because
//     those SDKs don't produce a checkout.js-style signature at all. This
//     USED TO mean no verification whatsoever — any caller who knew (or
//     guessed) an order_id/payment_id pair could claim success and the
//     frontend would go straight on to record a real installment for it.
//     Now: a real server-to-server call to Razorpay's Payments API
//     confirms the payment actually exists, is captured, belongs to the
//     claimed order, and its amount matches what create-order recorded —
//     the same trust boundary the signature check gives the web flow.
// The actual collection gets recorded by the SEPARATE POST /api/core/
// payForScheme call the frontend already makes right after this one
// succeeds (see payForScheme below) — recordSchemeCollection's own
// idempotency check (schemeCollection.js) means a retry or the webhook
// reconciling the same payment later can never double-credit it.
razorpayV2Router.post('/verify-payment', async (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature, amount, store_id } = req.body;
  if (!store_id || !razorpay_order_id || !razorpay_payment_id) {
    return res.status(400).json({ success: false, error: 'Missing payment identifiers.' });
  }

  try {
    const tenantDbConn = await getTenantDb(store_id);
    const result = await runWithTenantDb(tenantDbConn, async () => {
      const config = await getRazorpayConfig(store_id);
      if (!config || !config.Key_Secret) {
        return { error: 'Online payment is not configured for this store.' };
      }

      const isNativeFlow = !razorpay_signature || razorpay_signature === 'native_flow_no_signature';
      if (!isNativeFlow) {
        const body = `${razorpay_order_id}|${razorpay_payment_id}`;
        const expected = crypto.createHmac('sha256', config.Key_Secret).update(body).digest('hex');
        if (expected !== razorpay_signature) {
          return { error: 'Payment signature verification failed.' };
        }
      } else {
        const rzp = new Razorpay({ key_id: config.Key_ID, key_secret: config.Key_Secret });
        let payment;
        try {
          payment = await rzp.payments.fetch(razorpay_payment_id);
        } catch (fetchErr) {
          return { error: `Could not verify payment with Razorpay: ${fetchErr.message}` };
        }
        if (payment.order_id !== razorpay_order_id) {
          return { error: 'Payment does not belong to the claimed order.' };
        }
        if (payment.status !== 'captured') {
          return { error: `Payment is not captured (status: ${payment.status}).` };
        }
        // Cross-check against what create-order actually asked Razorpay to
        // collect — closes the gap of a caller claiming a real payment_id
        // but a fabricated (larger or smaller) amount for it.
        const orderTrack = await tenantDb('tbl_pg_order_track')
          .where({ Tenant_ID: store_id, Order_ID: razorpay_order_id }).first();
        if (orderTrack && Math.round(parseFloat(orderTrack.Amount) * 100) !== payment.amount) {
          return { error: 'Payment amount does not match the order.' };
        }
      }

      // Idempotent insert — a retried verify-payment call (or the webhook
      // seeing the same payment later) must not create a second row for
      // the same real payment.
      const already = await tenantDb('tbl_pg_transactions')
        .where({ Tenant_ID: store_id, Gateway: 'razorpay', Payment_ID: razorpay_payment_id }).first();
      if (!already) {
        await tenantDb('tbl_pg_transactions').insert({
          Tenant_ID: store_id, Gateway: 'razorpay', Order_ID: razorpay_order_id,
          Payment_ID: razorpay_payment_id, Signature: razorpay_signature || 'native',
          Amount: parseFloat(amount || 0) / 100, Currency: 'INR', Status: 'success',
          Purpose: 'Scheme Payment', Created_By: 'savings-app-member',
        }).catch(() => {});
      }

      return { success: true, order: { amount }, razorpay_payment_id, razorpay_order_id };
    });

    if (result.error) return res.status(400).json({ success: false, error: result.error });
    return res.json(result);
  } catch (err) {
    console.error('razorpay v2 verify-payment error:', err.message);
    return res.status(500).json({ success: false, error: `Verification failed: ${err.message}` });
  }
});

// ─── POST /api/core/payForScheme ────────────────────────────────────────────
// The call that actually records the installment, for EVERY payment
// path (online Razorpay/PhonePe AND agent-recorded offline Cash/Cheque/
// Card/NEFT all funnel through this one endpoint — see runRazorpay/
// runPhonePe/runOffline in SchemeDetailPageV2.js). Always receives
// amount_collected in PAISE regardless of path (the frontend's own
// convention, not this route's choice) — divided back to rupees here.
// Delegates to recordSchemeCollection() so this posts the SAME real
// double-entry accounting the counter's own /api/savings/collect does.
//
// Known limitation: gold-conversion (gold_scheme/goldconvyn) and
// lucky-draw fields on the payload are accepted but not acted on — DLJ's
// real scheme is a plain fixed-installment scheme with neither feature
// enabled, and wiring those up for schemes that DO use them is separate,
// unverified work.
const PAYMENT_MODE_LABEL = { '0': 'Cash', '1': 'Cheque', '2': 'Card', '6': 'UPI', '7': 'NEFT', '8': 'Card' };

router.post('/payForScheme', async (req, res) => {
  const { member_id, amount_collected, mode, storeID, store_id, pay_sign, order_Iid, chqNo } = req.body;
  const tenantId = store_id || storeID;

  if (!tenantId || !member_id || amount_collected === undefined) {
    return res.status(400).json({ error: 'store_id, member_id and amount_collected are required.' });
  }

  try {
    const tenantDbConn = await getTenantDb(tenantId);
    const result = await runWithTenantDb(tenantDbConn, async () => {
      const amountRupees = parseFloat(amount_collected) / 100; // see file-header note
      const paymentMode = PAYMENT_MODE_LABEL[String(mode)] || 'Cash';
      const isOnline = String(mode) === '6';
      const paymentReference = pay_sign || order_Iid || chqNo || null;

      const collection = await recordSchemeCollection({
        tenantId, memberId: parseInt(member_id), amount: amountRupees,
        paymentMode, paymentReference,
        collectionSource: isOnline ? 'App' : 'Agent',
        createdBy: 'savings-app-member',
      });
      return collection;
    });

    // Both field names — the frontend reads `voucherNo` on the online
    // path and `nextVoucherNo` on the offline path (two different keys
    // for the same thing, a pre-existing quirk in that file).
    return res.json({
      voucherNo: result.receiptNumber, nextVoucherNo: result.receiptNumber,
      is_complete: result.isComplete,
    });
  } catch (err) {
    console.error('payForScheme error:', err.message);
    const statusCode = err.statusCode || 500;
    return res.status(statusCode).json({ error: `Failed to record payment: ${err.message}` });
  }
});

// ─── GET /api/core/myDraws?store_id=&mobile= ───────────────────────────────
// The member-facing side of Lucky Draw — a genuine blank slate before this:
// draws were only ever visible to staff (savingsScheme.js's /draw/history).
// Public + mobile-scoped, same trust model as every other route in this
// file (see file header) — looks the member up by mobile first, so a
// bare mobile number with no matching member just returns an empty list
// rather than erroring.
router.get('/myDraws', async (req, res) => {
  const tenantId = req.query.store_id || req.query.storeID;
  const mobile = req.query.mobile;
  if (!tenantId || !mobile) return res.json([]);

  try {
    const member = await db('tbl_scheme_members').where({ Tenant_ID: tenantId, Mobile: mobile }).first('Member_ID');
    if (!member) return res.json([]);

    const draws = await db('tbl_scheme_draws')
      .where({ Tenant_ID: tenantId, Winner_Member_ID: member.Member_ID })
      .select('Draw_ID', 'Draw_Name', 'Draw_Type', 'Draw_Date', 'Prize_Type', 'Prize_Value', 'Prize_Description')
      .orderBy('Draw_Date', 'desc');

    return res.json(draws);
  } catch (err) {
    console.error('myDraws error:', err.message);
    return res.json([]);
  }
});

// ─── GET /api/core/customer-orders/:storeId/:mobile ────────────────────────
// DLJ has no e-commerce catalog wired up yet (isEcomEnable is false for
// it — see /api/auth/store-assets), so there is genuinely no order
// history to return. Kept as a real endpoint (not a 404) so the
// dashboard's existing try/catch-to-empty-array path isn't the only thing
// standing between this and a console error on every page load.
router.get('/customer-orders/:storeId/:mobile', async (req, res) => {
  return res.json({ count: 0, data: [] });
});

module.exports = { core: router, razorpayV2: razorpayV2Router };
