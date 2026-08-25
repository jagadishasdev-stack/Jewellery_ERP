/**
 * POST /api/webhooks/razorpay/:tenantId — a reconciliation safety net, not
 * the primary payment path (see routes/webhooks.js's file header). Tests
 * the real HMAC verification (computed over the exact raw body bytes,
 * matching what Razorpay's own signing does) and that a genuine
 * payment.captured event reconciles a missed collection exactly once.
 */
const request = require('supertest');
const crypto = require('crypto');
const { app } = require('../src/index');
const db = require('../src/db/knex');
const testTenant = require('./helpers/testTenant');

let tenant, memberId;
const WEBHOOK_SECRET = 'whsec_qa_test_do_not_use_in_prod';

const signedPost = (path, payload) => {
  const raw = JSON.stringify(payload);
  const signature = crypto.createHmac('sha256', WEBHOOK_SECRET).update(raw).digest('hex');
  return request(app).post(path).set('X-Razorpay-Signature', signature).set('Content-Type', 'application/json').send(raw);
};

beforeAll(async () => {
  tenant = await testTenant.setup();

  const [scheme] = await db('tbl_scheme_master').insert({
    Tenant_ID: tenant.tenantId, Scheme_Code: 'QAWEBHOOK', Scheme_Name: 'QA Webhook Scheme',
    Is_Active: true, Created_Date: new Date(),
  }).returning('Scheme_ID');
  const [group] = await db('tbl_scheme_groups').insert({
    Tenant_ID: tenant.tenantId, Scheme_ID: scheme.Scheme_ID, Group_Code: 'QAWH-G1',
    Group_Name: 'QA Webhook Group', Start_Date: new Date(), Monthly_Amount: 1500,
    Total_Installments: 12, Status: 'Active', Created_Date: new Date(),
  }).returning('Group_ID');
  const [member] = await db('tbl_scheme_members').insert({
    Tenant_ID: tenant.tenantId, Member_Number: 'QAWH-00001', Member_Name: 'QA Webhook Member',
    Mobile: '9000000003', Scheme_ID: scheme.Scheme_ID, Group_ID: group.Group_ID,
    Joining_Date: new Date(), Installment_Amount: 1500, Total_Installments: 12,
    Installments_Paid: 0, Total_Amount_Paid: 0, Status: 'Active', Created_Date: new Date(),
  }).returning('Member_ID');
  memberId = member.Member_ID;

  await db('tbl_payment_gateway_config').insert({
    Tenant_ID: tenant.tenantId, Gateway: 'razorpay', Key_ID: 'rzp_test_qa', Key_Secret: 'qa_secret',
    Webhook_Secret: WEBHOOK_SECRET, Environment: 'test', Is_Active: true, Created_By: 'test',
  });
});

afterAll(async () => {
  await db('tbl_payment_gateway_config').where({ Tenant_ID: tenant.tenantId }).del();
  await db('tbl_pg_order_track').where({ Tenant_ID: tenant.tenantId }).del();
  await testTenant.teardown();
  await db.destroy();
});

test('rejects a payload with no signature header at all — still responds 200 (never reveals verification outcome), does not reconcile anything', async () => {
  await db('tbl_pg_order_track').insert({
    Tenant_ID: tenant.tenantId, Gateway: 'razorpay', Order_ID: 'order_NOSIGHDR',
    Amount: 1500, Currency: 'INR', Member_ID: memberId, Purpose: 'Scheme Payment', Status: 'created', Created_By: 'test',
  });
  const res = await request(app).post(`/api/webhooks/razorpay/${tenant.tenantId}`).send({
    event: 'payment.captured', payload: { payment: { entity: { id: 'pay_NOSIGHDR', order_id: 'order_NOSIGHDR', status: 'captured', amount: 150000, method: 'upi' } } },
  });
  expect(res.status).toBe(200); // never leaks whether verification would have failed

  const member = await db('tbl_scheme_members').where({ Member_ID: memberId }).first();
  expect(member.Installments_Paid).toBe(0); // nothing reconciled — unsigned payload never trusted
});

test('rejects a payload with a WRONG signature — does not reconcile anything', async () => {
  const res = await request(app).post(`/api/webhooks/razorpay/${tenant.tenantId}`)
    .set('X-Razorpay-Signature', 'not_the_real_signature')
    .send({ event: 'payment.captured', payload: { payment: { entity: { id: 'pay_WRONGSIG', order_id: 'order_WRONGSIG', status: 'captured', amount: 150000, method: 'upi' } } } });
  expect(res.status).toBe(200);

  const txn = await db('tbl_pg_transactions').where({ Payment_ID: 'pay_WRONGSIG' }).first();
  expect(txn).toBeFalsy();
});

test('a correctly signed payment.captured event reconciles a real missed collection', async () => {
  await db('tbl_pg_order_track').insert({
    Tenant_ID: tenant.tenantId, Gateway: 'razorpay', Order_ID: 'order_RECONCILE1',
    Amount: 1500, Currency: 'INR', Member_ID: memberId, Purpose: 'Scheme Payment', Status: 'created', Created_By: 'test',
  });

  const res = await signedPost(`/api/webhooks/razorpay/${tenant.tenantId}`, {
    event: 'payment.captured',
    payload: { payment: { entity: { id: 'pay_RECONCILE1', order_id: 'order_RECONCILE1', status: 'captured', amount: 150000, method: 'upi' } } },
  });
  expect(res.status).toBe(200);

  const member = await db('tbl_scheme_members').where({ Member_ID: memberId }).first();
  expect(member.Installments_Paid).toBe(1);
  expect(parseFloat(member.Total_Amount_Paid)).toBe(1500);

  const txn = await db('tbl_scheme_transactions').where({ Tenant_ID: tenant.tenantId, Payment_Reference: 'pay_RECONCILE1' }).first();
  expect(txn).toBeTruthy();
  expect(txn.Payment_Mode).toBe('UPI');
  expect(txn.Collection_Source).toBe('App');

  const track = await db('tbl_pg_order_track').where({ Order_ID: 'order_RECONCILE1' }).first();
  expect(track.Status).toBe('paid');
});

test('the SAME payment.captured event delivered twice (Razorpay retries webhooks) does not double-credit', async () => {
  const before = await db('tbl_scheme_members').where({ Member_ID: memberId }).first();

  const res = await signedPost(`/api/webhooks/razorpay/${tenant.tenantId}`, {
    event: 'payment.captured',
    payload: { payment: { entity: { id: 'pay_RECONCILE1', order_id: 'order_RECONCILE1', status: 'captured', amount: 150000, method: 'upi' } } },
  });
  expect(res.status).toBe(200);

  const after = await db('tbl_scheme_members').where({ Member_ID: memberId }).first();
  expect(after.Installments_Paid).toBe(before.Installments_Paid); // unchanged
});

test('an event type other than payment.captured is accepted (200) but never reconciles anything', async () => {
  const before = await db('tbl_scheme_members').where({ Member_ID: memberId }).first();
  const res = await signedPost(`/api/webhooks/razorpay/${tenant.tenantId}`, {
    event: 'payment.failed',
    payload: { payment: { entity: { id: 'pay_FAILEDEVT', order_id: 'order_RECONCILE1', status: 'failed', amount: 150000, method: 'upi' } } },
  });
  expect(res.status).toBe(200);
  const after = await db('tbl_scheme_members').where({ Member_ID: memberId }).first();
  expect(after.Installments_Paid).toBe(before.Installments_Paid);
});
