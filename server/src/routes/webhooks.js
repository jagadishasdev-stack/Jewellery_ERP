/**
 * Payment gateway webhooks — a reconciliation SAFETY NET, not the primary
 * payment path. The primary path is entirely client-driven: create-order
 * → (checkout.js/native SDK) → verify-payment → payForScheme (see
 * savingsAppCore.js), and it already works end-to-end on its own. This
 * exists for the case that flow never finishes — app crash, closed tab,
 * lost connection right after Razorpay actually captured the money — which
 * would otherwise leave a real payment with no matching scheme collection
 * and no way to notice.
 *
 * Public — Razorpay calls this directly with no user session at all.
 * Authenticity comes entirely from the HMAC signature in
 * X-Razorpay-Signature, verified against the Webhook_Secret set for this
 * tenant (Super Admin → Tenant → Payment Gateway — a DIFFERENT secret from
 * the API key_secret, configured separately in Razorpay's own dashboard
 * under Webhooks). Always responds 200 once the signature check has run,
 * whether or not anything needed reconciling — Razorpay retries a
 * non-2xx response for up to 24h, which helps with a transient server
 * error but not with "this payload will never verify," so failures here
 * are logged for investigation rather than left to retry forever.
 */
const router = require('express').Router();
const crypto = require('crypto');
const { getTenantDb } = require('../db/tenantDbResolver');
const { tenantDb, runWithTenantDb } = require('../db/tenantDb');
const { recordSchemeCollection } = require('../utils/schemeCollection');

const PAYMENT_METHOD_LABEL = { upi: 'UPI', card: 'Card', netbanking: 'NetBanking', wallet: 'Wallet', emi: 'EMI' };

// POST /api/webhooks/razorpay/:tenantId
router.post('/razorpay/:tenantId', async (req, res) => {
  const { tenantId } = req.params;
  const signature = req.headers['x-razorpay-signature'];

  // Always 200 from here on — see file header. Any early return below is a
  // deliberate "nothing to do" or "can't trust this," logged, not surfaced
  // to the caller as an error.
  if (!signature || !req.rawBody) {
    console.error(`[webhook] razorpay/${tenantId}: missing signature or raw body.`);
    return res.status(200).json({ received: true });
  }

  try {
    const tenantDbConn = await getTenantDb(tenantId);
    await runWithTenantDb(tenantDbConn, async () => {
      const config = await tenantDb('tbl_payment_gateway_config')
        .where({ Tenant_ID: tenantId, Gateway: 'razorpay', Is_Active: true }).first();
      if (!config || !config.Webhook_Secret) {
        console.error(`[webhook] razorpay/${tenantId}: no Webhook_Secret configured — ignoring.`);
        return;
      }

      const expected = crypto.createHmac('sha256', config.Webhook_Secret).update(req.rawBody).digest('hex');
      if (expected !== signature) {
        console.error(`[webhook] razorpay/${tenantId}: signature mismatch — ignoring (payload not trusted).`);
        return;
      }

      const event = req.body;
      if (event.event !== 'payment.captured') return; // nothing to reconcile for other events yet

      const payment = event.payload?.payment?.entity;
      if (!payment?.order_id || !payment?.id) return;

      const orderTrack = await tenantDb('tbl_pg_order_track')
        .where({ Tenant_ID: tenantId, Order_ID: payment.order_id }).first();
      if (!orderTrack) {
        console.error(`[webhook] razorpay/${tenantId}: no order_track row for order ${payment.order_id} — can't reconcile.`);
        return;
      }
      if (orderTrack.Purpose !== 'Scheme Payment' || !orderTrack.Member_ID) return;

      // recordSchemeCollection's own idempotency check (matches on
      // Payment_Reference) makes this safe to call unconditionally — if
      // the app's own payForScheme call already recorded this exact
      // payment, this just returns { duplicate: true } instead of
      // crediting the member a second time.
      const result = await recordSchemeCollection({
        tenantId, memberId: orderTrack.Member_ID, amount: payment.amount / 100,
        paymentMode: PAYMENT_METHOD_LABEL[payment.method] || 'UPI',
        paymentReference: payment.id,
        collectionSource: 'App', createdBy: 'razorpay-webhook',
      }).catch((err) => {
        console.error(`[webhook] razorpay/${tenantId}: reconciliation failed for order ${payment.order_id}:`, err.message);
        return null;
      });

      if (result && !result.duplicate) {
        console.log(`[webhook] razorpay/${tenantId}: reconciled a missed scheme payment — order=${payment.order_id} member=${orderTrack.Member_ID} amount=${payment.amount / 100}`);
      }

      await tenantDb('tbl_pg_order_track')
        .where({ Tenant_ID: tenantId, Order_ID: payment.order_id }).update({ Status: 'paid' }).catch(() => {});
    });
  } catch (err) {
    console.error(`[webhook] razorpay/${tenantId}: processing error:`, err.message);
  }

  return res.status(200).json({ received: true });
});

module.exports = router;
