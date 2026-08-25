/**
 * Member-facing Razorpay payment flow that the REAL, actually-routed
 * mobile component (savings_app/frontend/src/components/
 * SchemeDetailPageV2.js — note: SchemeDetailPage.js, without the V2, is
 * dead code never imported by App.js) calls:
 *   GET  /api/core/payment-gateway/:storeId/:branch
 *   GET  /api/core/getPaymentGatewayReference
 *   POST /api/razorpay/v2/create-order
 *   POST /api/razorpay/v2/verify-payment
 *   POST /api/core/payForScheme
 *
 * The key_secret must NEVER appear in any response the mobile app can
 * see, signature verification must happen correctly and entirely
 * server-side, and a completed payment must land as a real,
 * accounting-integrated collection (same path as the counter's own
 * POST /api/savings/collect via schemeCollection.js), not a
 * disconnected raw insert.
 *
 * We don't have real Razorpay credentials here, so:
 *  - the gateway-info and verify-payment routes are tested against a
 *    self-consistent test key_id/key_secret pair we control ourselves —
 *    legitimate for testing OUR signature-verification math, since we
 *    compute the HMAC the exact same way Razorpay's client SDK does.
 *  - create-order (the one call that actually has to reach Razorpay's
 *    servers) is tested with the `razorpay` SDK mocked, so the route's
 *    own logic (config resolution, order-tracking insert, response
 *    shape) is verified without needing a live account.
 */
const request = require('supertest');
const crypto = require('crypto');
const { app } = require('../src/index');
const db = require('../src/db/knex');
const testTenant = require('./helpers/testTenant');

// payments.fetch is a plain jest.fn() (not a fixed mockResolvedValue) so
// individual tests can set its return value per-call via
// mockResolvedValueOnce/mockRejectedValueOnce to exercise the native-flow
// verification path (see verify-payment's isNativeFlow branch).
const mockPaymentsFetch = jest.fn();
jest.mock('razorpay', () => {
  return jest.fn().mockImplementation(() => ({
    orders: {
      create: jest.fn().mockResolvedValue({ id: 'order_MOCK123', amount: 200000, currency: 'INR', status: 'created' }),
    },
    payments: { fetch: mockPaymentsFetch },
  }));
});

async function waitForJournalLine(tenantId, reference, timeoutMs = 3000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const line = await db('tbl_accounting_journal').where({ Tenant_ID: tenantId, Reference: reference }).first();
    if (line) return line;
    await new Promise((r) => setTimeout(r, 50));
  }
  return null;
}

let tenant, memberId, groupId;
const TEST_KEY_ID = 'rzp_test_QA_1234567890';
const TEST_KEY_SECRET = 'qa_test_secret_do_not_use_in_prod';

beforeAll(async () => {
  tenant = await testTenant.setup();

  const [scheme] = await db('tbl_scheme_master').insert({
    Tenant_ID: tenant.tenantId, Scheme_Code: 'QAPAY', Scheme_Name: 'QA Payment Scheme',
    Is_Active: true, Created_Date: new Date(),
  }).returning('Scheme_ID');

  const [group] = await db('tbl_scheme_groups').insert({
    Tenant_ID: tenant.tenantId, Scheme_ID: scheme.Scheme_ID, Group_Code: 'QAPAY-G1',
    Group_Name: 'QA Payment Group', Start_Date: new Date(), Monthly_Amount: 2000,
    Total_Installments: 12, Status: 'Active', Created_Date: new Date(),
  }).returning('Group_ID');
  groupId = group.Group_ID;

  const [member] = await db('tbl_scheme_members').insert({
    Tenant_ID: tenant.tenantId, Member_Number: 'QAPAY-00001', Member_Name: 'QA Payment Member',
    Mobile: '9000000002', Scheme_ID: scheme.Scheme_ID, Group_ID: groupId,
    Joining_Date: new Date(), Installment_Amount: 2000, Total_Installments: 12,
    Installments_Paid: 0, Total_Amount_Paid: 0, Status: 'Active', Created_Date: new Date(),
  }).returning('Member_ID');
  memberId = member.Member_ID;

  await db('tbl_payment_gateway_config').insert({
    Tenant_ID: tenant.tenantId, Gateway: 'razorpay', Key_ID: TEST_KEY_ID,
    Key_Secret: TEST_KEY_SECRET, Environment: 'test', Is_Active: true, Created_By: 'test',
  });
});

afterAll(async () => {
  await db('tbl_payment_gateway_config').where({ Tenant_ID: tenant.tenantId }).del();
  await db('tbl_pg_order_track').where({ Tenant_ID: tenant.tenantId }).del();
  await db('tbl_pg_transactions').where({ Tenant_ID: tenant.tenantId }).del();
  await testTenant.teardown();
  await db.destroy();
});

test('GET /payment-gateway returns key_id but NEVER key_secret (flat JSON, no envelope)', async () => {
  const res = await request(app).get(`/api/core/payment-gateway/${tenant.tenantId}/HO`);
  expect(res.status).toBe(200);
  expect(res.body.key_id).toBe(TEST_KEY_ID); // flat — no res.body.data wrapper
  expect(JSON.stringify(res.body)).not.toContain(TEST_KEY_SECRET);
  expect(res.body.key_secret).toBeUndefined();
});

test('GET /payment-gateway returns standered:null for a tenant with no gateway configured (handled, not an error)', async () => {
  const res = await request(app).get('/api/core/payment-gateway/SA_MASTER/HO');
  expect(res.status).toBe(200);
  expect(res.body.standered).toBeNull();
});

test('GET /getPaymentGatewayReference returns a refno', async () => {
  const res = await request(app).get('/api/core/getPaymentGatewayReference');
  expect(res.status).toBe(200);
  expect(typeof res.body.refno).toBe('number');
});

test('POST /api/razorpay/v2/create-order uses the tenant\'s stored key_id, never key_secret', async () => {
  const res = await request(app).post('/api/razorpay/v2/create-order').send({
    rpay_amount: 2000, rpay_receipt: `${memberId}-1`, rpay_MembId: memberId, store_id: tenant.tenantId,
    rpay_keyId: 'client_sent_this_should_be_ignored', rpay_KeySecret: 'client_sent_this_too',
  });
  expect(res.status).toBe(200);
  expect(res.body.order.id).toBe('order_MOCK123');
  expect(res.body.key_id).toBe(TEST_KEY_ID); // the REAL stored key, not whatever the client sent
  expect(JSON.stringify(res.body)).not.toContain(TEST_KEY_SECRET);

  const tracked = await db('tbl_pg_order_track').where({ Tenant_ID: tenant.tenantId, Order_ID: 'order_MOCK123' }).first();
  expect(tracked).toBeTruthy();
  expect(parseFloat(tracked.Amount)).toBe(2000);
});

test('POST /api/razorpay/v2/verify-payment accepts a correct signature computed server-side', async () => {
  const orderId = 'order_REALSIG1';
  const paymentId = 'pay_REALSIG1';
  const signature = crypto.createHmac('sha256', TEST_KEY_SECRET).update(`${orderId}|${paymentId}`).digest('hex');

  const res = await request(app).post('/api/razorpay/v2/verify-payment').send({
    store_id: tenant.tenantId, amount: 200000, // paise, matching the frontend's own convention
    razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: signature,
  });

  expect(res.status).toBe(200);
  expect(res.body.success).toBe(true);
  expect(JSON.stringify(res.body)).not.toContain(TEST_KEY_SECRET);
});

test('POST /api/razorpay/v2/verify-payment rejects a forged/incorrect signature', async () => {
  const res = await request(app).post('/api/razorpay/v2/verify-payment').send({
    store_id: tenant.tenantId, amount: 200000,
    razorpay_order_id: 'order_FAKE', razorpay_payment_id: 'pay_FAKE',
    razorpay_signature: 'not_a_real_signature',
  });
  expect(res.status).toBe(400);
  expect(res.body.success).toBe(false);
});

test('POST /payForScheme (online mode "6") converts paise->rupees and records a real, accounting-integrated collection', async () => {
  const res = await request(app).post('/api/core/payForScheme').send({
    member_id: memberId, amount_collected: 200000, // paise, as the online path always sends
    mode: '6', store_id: tenant.tenantId, pay_sign: 'pay_REALSIG1', order_Iid: 'order_REALSIG1',
  });

  expect(res.status).toBe(200);
  expect(res.body.voucherNo).toBeTruthy();
  expect(res.body.nextVoucherNo).toBe(res.body.voucherNo);

  const member = await db('tbl_scheme_members').where({ Member_ID: memberId }).first();
  expect(member.Installments_Paid).toBe(1);
  expect(parseFloat(member.Total_Amount_Paid)).toBe(2000); // 200000 paise -> ₹2000, not ₹200000

  const txn = await db('tbl_scheme_transactions').where({ Tenant_ID: tenant.tenantId, Member_ID: memberId }).first();
  expect(txn).toBeTruthy();
  expect(parseFloat(txn.Net_Amount)).toBe(2000);
  expect(txn.Payment_Mode).toBe('UPI');
  expect(txn.Payment_Reference).toBe('pay_REALSIG1');
  expect(txn.Collection_Source).toBe('App');

  // Reached the real ledger, not just a shadow table.
  const journalLine = await waitForJournalLine(tenant.tenantId, res.body.voucherNo);
  expect(journalLine).toBeTruthy();
});

test('POST /payForScheme (offline mode "0" — agent-recorded cash via app) records Cash correctly', async () => {
  const res = await request(app).post('/api/core/payForScheme').send({
    member_id: memberId, amount_collected: 200000, mode: '0', store_id: tenant.tenantId,
  });
  expect(res.status).toBe(200);

  const member = await db('tbl_scheme_members').where({ Member_ID: memberId }).first();
  expect(member.Installments_Paid).toBe(2);
  expect(parseFloat(member.Total_Amount_Paid)).toBe(4000);

  const txns = await db('tbl_scheme_transactions').where({ Tenant_ID: tenant.tenantId, Member_ID: memberId }).orderBy('Txn_ID', 'desc');
  expect(txns[0].Payment_Mode).toBe('Cash');
  expect(txns[0].Collection_Source).toBe('Agent');
});

// ─── Native flow (iOS/Android SDK) — no checkout.js signature at all ────────
// Used to mean NO verification whatsoever: any caller who knew/guessed an
// order_id + payment_id pair got success. Now a real server-to-server
// payments.fetch() call must confirm the payment actually exists, belongs
// to the claimed order, is captured, and its amount matches. Placed at the
// end of the file, after the sequential Installments_Paid-counting tests
// above, so it doesn't disturb their assumed starting state.
describe('native flow (no signature) — verified via a real Razorpay API call, not skipped', () => {
  beforeEach(() => mockPaymentsFetch.mockReset());

  test('accepts a genuinely captured payment matching the claimed order and amount', async () => {
    await db('tbl_pg_order_track').insert({
      Tenant_ID: tenant.tenantId, Gateway: 'razorpay', Order_ID: 'order_NATIVE_OK',
      Amount: 2000, Currency: 'INR', Member_ID: memberId, Purpose: 'Scheme Payment', Status: 'created', Created_By: 'test',
    });
    mockPaymentsFetch.mockResolvedValueOnce({ id: 'pay_NATIVE_OK', order_id: 'order_NATIVE_OK', status: 'captured', amount: 200000 });

    const res = await request(app).post('/api/razorpay/v2/verify-payment').send({
      store_id: tenant.tenantId, amount: 200000,
      razorpay_order_id: 'order_NATIVE_OK', razorpay_payment_id: 'pay_NATIVE_OK',
      razorpay_signature: 'native_flow_no_signature',
    });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(mockPaymentsFetch).toHaveBeenCalledWith('pay_NATIVE_OK');
  });

  test('rejects a payment_id that belongs to a DIFFERENT order than claimed', async () => {
    mockPaymentsFetch.mockResolvedValueOnce({ id: 'pay_MISMATCH', order_id: 'order_SOMETHING_ELSE', status: 'captured', amount: 200000 });

    const res = await request(app).post('/api/razorpay/v2/verify-payment').send({
      store_id: tenant.tenantId, amount: 200000,
      razorpay_order_id: 'order_CLAIMED', razorpay_payment_id: 'pay_MISMATCH',
      razorpay_signature: 'native_flow_no_signature',
    });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/does not belong to the claimed order/);
  });

  test('rejects a payment that is not actually captured (e.g. still "authorized")', async () => {
    mockPaymentsFetch.mockResolvedValueOnce({ id: 'pay_NOTCAPTURED', order_id: 'order_NOTCAPTURED', status: 'authorized', amount: 200000 });

    const res = await request(app).post('/api/razorpay/v2/verify-payment').send({
      store_id: tenant.tenantId, amount: 200000,
      razorpay_order_id: 'order_NOTCAPTURED', razorpay_payment_id: 'pay_NOTCAPTURED',
      razorpay_signature: 'native_flow_no_signature',
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/not captured/);
  });

  test('rejects a fabricated amount that does not match what create-order recorded', async () => {
    await db('tbl_pg_order_track').insert({
      Tenant_ID: tenant.tenantId, Gateway: 'razorpay', Order_ID: 'order_AMOUNT_MISMATCH',
      Amount: 2000, Currency: 'INR', Member_ID: memberId, Purpose: 'Scheme Payment', Status: 'created', Created_By: 'test',
    });
    // Real payment fetched from Razorpay shows a much smaller captured amount
    // than the order was actually created for.
    mockPaymentsFetch.mockResolvedValueOnce({ id: 'pay_AMOUNT_MISMATCH', order_id: 'order_AMOUNT_MISMATCH', status: 'captured', amount: 100 });

    const res = await request(app).post('/api/razorpay/v2/verify-payment').send({
      store_id: tenant.tenantId, amount: 100,
      razorpay_order_id: 'order_AMOUNT_MISMATCH', razorpay_payment_id: 'pay_AMOUNT_MISMATCH',
      razorpay_signature: 'native_flow_no_signature',
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/amount does not match/);
  });

  test('a caller who omits the signature entirely (not even the sentinel string) is treated identically to native flow — still verified', async () => {
    mockPaymentsFetch.mockResolvedValueOnce({ id: 'pay_NOSIG', order_id: 'order_NOSIG', status: 'failed', amount: 200000 });

    const res = await request(app).post('/api/razorpay/v2/verify-payment').send({
      store_id: tenant.tenantId, amount: 200000,
      razorpay_order_id: 'order_NOSIG', razorpay_payment_id: 'pay_NOSIG',
      // razorpay_signature omitted entirely
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/not captured/);
  });
});

// ─── Idempotency — a retried call (or the webhook reconciling later) must
// never double-credit the same real payment ────────────────────────────────
test('calling payForScheme twice with the SAME payment reference records the installment only once', async () => {
  const before = await db('tbl_scheme_members').where({ Member_ID: memberId }).first();

  const body = { member_id: memberId, amount_collected: 200000, mode: '6', store_id: tenant.tenantId, pay_sign: 'pay_DUPLICATE_TEST' };
  const res1 = await request(app).post('/api/core/payForScheme').send(body);
  expect(res1.status).toBe(200);

  const afterFirst = await db('tbl_scheme_members').where({ Member_ID: memberId }).first();
  expect(afterFirst.Installments_Paid).toBe(before.Installments_Paid + 1);

  // Same paymentReference again — a client retry, or the webhook seeing a
  // payment the app already recorded — must be a no-op, not a second credit.
  const res2 = await request(app).post('/api/core/payForScheme').send(body);
  expect(res2.status).toBe(200);

  const afterSecond = await db('tbl_scheme_members').where({ Member_ID: memberId }).first();
  expect(afterSecond.Installments_Paid).toBe(afterFirst.Installments_Paid); // unchanged — NOT incremented again
  expect(parseFloat(afterSecond.Total_Amount_Paid)).toBe(parseFloat(afterFirst.Total_Amount_Paid));

  const txns = await db('tbl_scheme_transactions').where({ Tenant_ID: tenant.tenantId, Payment_Reference: 'pay_DUPLICATE_TEST' });
  expect(txns).toHaveLength(1); // only one row exists for this payment, not two
});
