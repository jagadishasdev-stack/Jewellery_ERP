/**
 * Rate Booking & Agent Commission — money-moving flows.
 *
 * agentCodeCollision.test.js already covers Agent_Code dedup-across-tenants
 * for POST /agents; moduleOverrideFullCoverage.test.js already covers the
 * generic View-permission-override smoke test for GET /agents. This file
 * builds on top of those and covers what neither touches: rate-booking
 * creation/listing, the `utilize` flow that converts a booking into a real
 * sale link, and commission calculation + payout.
 *
 * IMPORTANT FINDING (see the two tests under "the 'locked rate' claim,
 * verified against real DB state" below): POST /rate-bookings/:id/utilize
 * only records Utilized_Sale_ID on the booking — it never reads the
 * linked sale's own amount/rate, never recomputes anything, and nothing
 * else in the codebase (grepped across src/) ever reads
 * tbl_rate_booking.Booked_Rate or Utilized_Sale_ID back out. The route's
 * own comment says this exists "so a billing screen can pull the locked
 * rate instead of the day's current one" — but no such billing-screen
 * code exists yet. The locked rate is durably stored and left untouched
 * by utilize (proven below), but it is NOT actually enforced onto any
 * sale anywhere in this codebase today — a sale utilizing a booking can
 * carry any amount at all, computed off any rate at all, with zero
 * cross-check against Booked_Rate. Documented here rather than silently
 * asserting protection that doesn't exist.
 *
 * SECOND FINDING: POST /commissions/:id/pay has no idempotency guard —
 * it unconditionally sets Status='Paid' regardless of current Status, so
 * calling it twice "succeeds" twice (see the double-pay test below).
 *
 * THIRD FINDING: POST /rate-bookings/:id/utilize declares
 * [body('Utilized_Sale_ID').notEmpty()] as express-validator middleware
 * but never calls validationResult(req) to act on it (every other POST
 * route in this file does). An empty body is silently accepted and the
 * booking is marked Utilized with Utilized_Sale_ID left NULL — see the
 * test for this below.
 */
const request = require('supertest');
const dayjs = require('dayjs');
const { app } = require('../src/index');
const db = require('../src/db/knex');
const testTenant = require('./helpers/testTenant');

let tenant, token, typeId, customerId, agentId, agentCommissionPct;
const auth = () => ({ Authorization: `Bearer ${token}` });

beforeAll(async () => {
  tenant = await testTenant.setup();
  const res = await request(app).post('/api/auth/login').send({ username: tenant.username, password: tenant.password, tenantId: tenant.tenantId });
  token = res.body.data.token;

  typeId = (await db('tbl_item_type_master').first()).Type_ID;

  const cust = await request(app).post('/api/customers').set(auth()).send({ Customer_Name: 'QA Rate Booking Customer', Mobile_1: '9911100001' });
  customerId = cust.body.data.Customer_ID;

  agentCommissionPct = 5; // pick a value distinct from any default so the % math is unambiguous
  const agentRes = await request(app).post('/api/rate-agent/agents').set(auth()).send({
    Agent_Name: 'QA Rate Booking Agent', Mobile: '9911100002', Commission_Pct: agentCommissionPct,
  });
  agentId = agentRes.body.data.Agent_ID;
});

afterAll(async () => {
  await testTenant.teardown();
  await db.destroy();
});

async function createOrnament(overrides = {}) {
  const res = await request(app).post('/api/ornaments').set(auth()).send({
    Type_ID: typeId, Metal_Type: 'Gold', Gross_Weight: 10, Net_Gold_Weight: 9.5, Current_Gold_Rate: 7000,
    Base_Making_Charge_Per_Gram: 100, Purchase_Cost: 60000, Total_Price: 70000, ...overrides,
  });
  return res.body.data;
}

async function createSale(ornament, totalPrice) {
  const res = await request(app).post('/api/sales/create').set(auth()).send({
    Payment_Mode: 'Cash', Customer_ID: customerId,
    items: [{ Ornament_ID: ornament.Ornament_ID, Article_Number: ornament.Article_Number, Total_Line_Price: totalPrice }],
  });
  expect(res.status).toBe(201);
  return res.body.data.sale.Sale_ID;
}

function bookingPayload(overrides = {}) {
  return {
    Customer_ID: customerId, Metal_Type: 'Gold', Purity_Code: '22K',
    Booked_Rate: 5500, Weight_Booked: 10, Advance_Amount: 1000,
    Valid_Until: dayjs().add(30, 'day').format('YYYY-MM-DD'),
    ...overrides,
  };
}

// ── Rate booking creation ───────────────────────────────────────────────────

describe('POST /api/rate-agent/rate-bookings', () => {
  test('rejects a missing required field (Booked_Rate) with 422, nothing written', async () => {
    const before = await db('tbl_rate_booking').where({ Tenant_ID: tenant.tenantId }).count('* as c');
    const res = await request(app).post('/api/rate-agent/rate-bookings').set(auth()).send({
      Metal_Type: 'Gold', Weight_Booked: 10, Valid_Until: dayjs().add(10, 'day').format('YYYY-MM-DD'),
    });
    expect(res.status).toBe(422);
    const after = await db('tbl_rate_booking').where({ Tenant_ID: tenant.tenantId }).count('* as c');
    expect(after[0].c).toBe(before[0].c);
  });

  test('rejects Booked_Rate <= 0', async () => {
    const res = await request(app).post('/api/rate-agent/rate-bookings').set(auth()).send(bookingPayload({ Booked_Rate: 0 }));
    expect(res.status).toBe(422);
  });

  test('creates a booking, locking in the given rate/customer/expiry exactly as submitted, Status=Open', async () => {
    const res = await request(app).post('/api/rate-agent/rate-bookings').set(auth()).send(bookingPayload({ Booked_Rate: 5500.5, Weight_Booked: 12.345 }));
    expect(res.status).toBe(201);
    expect(res.body.data.Booking_Number).toMatch(/^RB-/);
    expect(res.body.data.Status).toBe('Open');

    const row = await db('tbl_rate_booking').where({ Booking_ID: res.body.data.Booking_ID }).first();
    expect(row.Tenant_ID).toBe(tenant.tenantId);
    expect(row.Customer_ID).toBe(customerId);
    expect(parseFloat(row.Booked_Rate)).toBe(5500.5);
    expect(parseFloat(row.Weight_Booked)).toBe(12.345);
    expect(row.Metal_Type).toBe('Gold');
    expect(row.Purity_Code).toBe('22K');
    expect(dayjs(row.Valid_Until).format('YYYY-MM-DD')).toBe(dayjs().add(30, 'day').format('YYYY-MM-DD'));
    expect(row.Status).toBe('Open');
    expect(row.Utilized_Sale_ID).toBeNull();
  });

  test('defaults Booking_Date to today when not supplied', async () => {
    const res = await request(app).post('/api/rate-agent/rate-bookings').set(auth()).send(bookingPayload());
    expect(res.status).toBe(201);
    expect(dayjs(res.body.data.Booking_Date).format('YYYY-MM-DD')).toBe(dayjs().format('YYYY-MM-DD'));
  });
});

// ── Bookings list ───────────────────────────────────────────────────────────

describe('GET /api/rate-agent/rate-bookings', () => {
  test('lists bookings for this tenant joined with customer name/mobile, excludes Cancelled by default', async () => {
    const created = await request(app).post('/api/rate-agent/rate-bookings').set(auth()).send(bookingPayload());
    const cancelledId = created.body.data.Booking_ID;
    await db('tbl_rate_booking').where({ Booking_ID: cancelledId }).update({ Status: 'Cancelled' });

    const res = await request(app).get('/api/rate-agent/rate-bookings').set(auth());
    expect(res.status).toBe(200);
    expect(res.body.data.some((b) => b.Booking_ID === cancelledId)).toBe(false);
    const openOne = res.body.data.find((b) => b.Status === 'Open');
    expect(openOne).toBeDefined();
    expect(openOne.Customer_Name).toBe('QA Rate Booking Customer');
    expect(openOne.Mobile_1).toBe('9911100001');
  });

  test('?status=Cancelled filters to exactly that status (overriding the default exclusion)', async () => {
    const res = await request(app).get('/api/rate-agent/rate-bookings').set(auth()).query({ status: 'Cancelled' });
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
    expect(res.body.data.every((b) => b.Status === 'Cancelled')).toBe(true);
  });

  test('?status=Open filters to only Open bookings', async () => {
    const res = await request(app).get('/api/rate-agent/rate-bookings').set(auth()).query({ status: 'Open' });
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
    expect(res.body.data.every((b) => b.Status === 'Open')).toBe(true);
  });
});

// ── utilize: the money-moving flow ──────────────────────────────────────────

describe('POST /api/rate-agent/rate-bookings/:id/utilize', () => {
  test("FIXED: the [body('Utilized_Sale_ID').notEmpty()] validator is now actually enforced — an empty body is rejected with 422 instead of silently marking the booking Utilized with Utilized_Sale_ID left NULL", async () => {
    const booking = await request(app).post('/api/rate-agent/rate-bookings').set(auth()).send(bookingPayload());
    const res = await request(app).post(`/api/rate-agent/rate-bookings/${booking.body.data.Booking_ID}/utilize`).set(auth()).send({});
    expect(res.status).toBe(422);

    const row = await db('tbl_rate_booking').where({ Booking_ID: booking.body.data.Booking_ID }).first();
    expect(row.Status).toBe('Open'); // unaffected — still open, not falsely marked Utilized
  });

  test('404s for a booking that does not exist (or belongs to another tenant)', async () => {
    const ornament = await createOrnament({ Article_Number: 'QA-RATE-UTIL-404' });
    const saleId = await createSale(ornament, 70000);
    const res = await request(app).post('/api/rate-agent/rate-bookings/999999999/utilize').set(auth()).send({ Utilized_Sale_ID: saleId });
    expect(res.status).toBe(404);
  });

  test('marks an Open booking Utilized and stores the Sale_ID link', async () => {
    const booking = await request(app).post('/api/rate-agent/rate-bookings').set(auth()).send(bookingPayload({ Booked_Rate: 5500 }));
    const bookingId = booking.body.data.Booking_ID;
    const ornament = await createOrnament({ Article_Number: 'QA-RATE-UTIL-OK' });
    const saleId = await createSale(ornament, 70000);

    const res = await request(app).post(`/api/rate-agent/rate-bookings/${bookingId}/utilize`).set(auth()).send({ Utilized_Sale_ID: saleId });
    expect(res.status).toBe(200);
    expect(res.body.data.Status).toBe('Utilized');
    expect(String(res.body.data.Utilized_Sale_ID)).toBe(String(saleId));

    const row = await db('tbl_rate_booking').where({ Booking_ID: bookingId }).first();
    expect(row.Status).toBe('Utilized');
    expect(String(row.Utilized_Sale_ID)).toBe(String(saleId));
  });

  test('an already-Utilized booking cannot be utilized again', async () => {
    const booking = await request(app).post('/api/rate-agent/rate-bookings').set(auth()).send(bookingPayload());
    const bookingId = booking.body.data.Booking_ID;
    const ornament1 = await createOrnament({ Article_Number: 'QA-RATE-UTIL-DOUBLE-1' });
    const sale1 = await createSale(ornament1, 70000);
    await request(app).post(`/api/rate-agent/rate-bookings/${bookingId}/utilize`).set(auth()).send({ Utilized_Sale_ID: sale1 }).expect(200);

    const ornament2 = await createOrnament({ Article_Number: 'QA-RATE-UTIL-DOUBLE-2' });
    const sale2 = await createSale(ornament2, 70000);
    const res = await request(app).post(`/api/rate-agent/rate-bookings/${bookingId}/utilize`).set(auth()).send({ Utilized_Sale_ID: sale2 });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Utilized, cannot be utilized/);

    // Still points at the FIRST sale — the second attempt did not overwrite it.
    const row = await db('tbl_rate_booking').where({ Booking_ID: bookingId }).first();
    expect(String(row.Utilized_Sale_ID)).toBe(String(sale1));
  });

  test('an expired booking is auto-flipped to Status=Expired and rejected, not utilized', async () => {
    const booking = await request(app).post('/api/rate-agent/rate-bookings').set(auth()).send(
      bookingPayload({ Valid_Until: dayjs().subtract(1, 'day').format('YYYY-MM-DD') })
    );
    const bookingId = booking.body.data.Booking_ID;
    const ornament = await createOrnament({ Article_Number: 'QA-RATE-UTIL-EXPIRED' });
    const saleId = await createSale(ornament, 70000);

    const res = await request(app).post(`/api/rate-agent/rate-bookings/${bookingId}/utilize`).set(auth()).send({ Utilized_Sale_ID: saleId });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/expired/i);

    const row = await db('tbl_rate_booking').where({ Booking_ID: bookingId }).first();
    expect(row.Status).toBe('Expired'); // the route flips this as a side effect of the failed attempt
    expect(row.Utilized_Sale_ID).toBeNull(); // never linked
  });

  describe("the 'locked rate' claim, verified against real DB state", () => {
    test('utilize preserves the booking\'s original Booked_Rate unchanged, independent of the linked sale\'s own amount', async () => {
      // Book at a rate deliberately far from the sale amount below, to prove
      // nothing in utilize recomputes or overwrites Booked_Rate from the sale.
      const lockedRate = 4321.99;
      const booking = await request(app).post('/api/rate-agent/rate-bookings').set(auth()).send(
        bookingPayload({ Booked_Rate: lockedRate, Weight_Booked: 10 })
      );
      const bookingId = booking.body.data.Booking_ID;

      // Sale priced at a completely different total (as if billed off "today's"
      // live rate, not the locked one) — 70000 for 9.5g net gold, nothing to do
      // with lockedRate * 10.
      const ornament = await createOrnament({ Article_Number: 'QA-RATE-LOCKED-1' });
      const saleId = await createSale(ornament, 70000);

      const res = await request(app).post(`/api/rate-agent/rate-bookings/${bookingId}/utilize`).set(auth()).send({ Utilized_Sale_ID: saleId });
      expect(res.status).toBe(200);

      const row = await db('tbl_rate_booking').where({ Booking_ID: bookingId }).first();
      // The booking's own locked rate is untouched by utilize...
      expect(parseFloat(row.Booked_Rate)).toBe(lockedRate);

      // ...but that's ALL utilize does. It never touches the sale row itself —
      // the sale's own amount is exactly what was billed, with zero trace of
      // Booked_Rate anywhere on it.
      const sale = await db('tbl_sales_header').where({ Sale_ID: saleId }).first();
      expect(parseFloat(sale.Net_Payable_Amount)).not.toBeCloseTo(lockedRate * 10, 0);
    });

    test('REAL GAP: utilize does not validate the sale amount against Booked_Rate at all — any sale, any amount, links successfully', async () => {
      // A sale billed at a wildly different implied rate than the booking
      // locked in still utilizes without error or warning.
      const booking = await request(app).post('/api/rate-agent/rate-bookings').set(auth()).send(
        bookingPayload({ Booked_Rate: 1, Weight_Booked: 1 }) // locked rate: practically free
      );
      // Kept under the ₹2,00,000 PAN-required threshold (sales.js) so this
      // stays a plain, unrelated-looking sale rather than tripping PAN
      // enforcement — the point here is Booked_Rate vs sale amount, not PAN.
      const ornament = await createOrnament({ Article_Number: 'QA-RATE-LOCKED-2', Total_Price: 150000 });
      const saleId = await createSale(ornament, 150000); // sale billed at a huge amount instead

      const res = await request(app).post(`/api/rate-agent/rate-bookings/${booking.body.data.Booking_ID}/utilize`).set(auth()).send({ Utilized_Sale_ID: saleId });
      // No cross-check exists in the route — this "succeeds" regardless.
      expect(res.status).toBe(200);
      expect(res.body.data.Status).toBe('Utilized');
    });
  });
});

// ── Commission calculation ──────────────────────────────────────────────────

describe('POST /api/rate-agent/commissions', () => {
  test('404s for an Agent_ID that does not exist', async () => {
    const res = await request(app).post('/api/rate-agent/commissions').set(auth()).send({
      Agent_ID: 999999999, Source_Type: 'Sale', Source_ID: 1, Commission_Base_Amount: 10000,
    });
    expect(res.status).toBe(404);
  });

  test('rejects an invalid Source_Type', async () => {
    const res = await request(app).post('/api/rate-agent/commissions').set(auth()).send({
      Agent_ID: agentId, Source_Type: 'Bogus', Source_ID: 1, Commission_Base_Amount: 10000,
    });
    expect(res.status).toBe(422);
  });

  test("computes Commission_Amount from the AGENT'S OWN default Commission_Pct when no override is given", async () => {
    const baseAmount = 84210; // chosen so 5% has an exact 2dp result: 4210.50
    const res = await request(app).post('/api/rate-agent/commissions').set(auth()).send({
      Agent_ID: agentId, Source_Type: 'Sale', Source_ID: 555001, Commission_Base_Amount: baseAmount,
    });
    expect(res.status).toBe(201);
    expect(parseFloat(res.body.data.Commission_Pct_Applied)).toBe(agentCommissionPct);
    const expected = Math.round(((baseAmount * agentCommissionPct) / 100) * 100) / 100;
    expect(parseFloat(res.body.data.Commission_Amount)).toBe(expected);
    expect(res.body.data.Status).toBe('Pending');

    const row = await db('tbl_agent_commission_transactions').where({ Txn_ID: res.body.data.Txn_ID }).first();
    expect(row.Tenant_ID).toBe(tenant.tenantId);
    expect(row.Agent_ID).toBe(agentId);
    expect(parseFloat(row.Commission_Base_Amount)).toBe(baseAmount);
    expect(parseFloat(row.Commission_Amount)).toBe(expected);
  });

  test('an explicit Commission_Pct_Applied override replaces the agent default for this one transaction only', async () => {
    const baseAmount = 50000;
    const overridePct = 12.5;
    const res = await request(app).post('/api/rate-agent/commissions').set(auth()).send({
      Agent_ID: agentId, Source_Type: 'Scheme', Source_ID: 555002, Commission_Base_Amount: baseAmount, Commission_Pct_Applied: overridePct,
    });
    expect(res.status).toBe(201);
    expect(parseFloat(res.body.data.Commission_Pct_Applied)).toBe(overridePct);
    expect(parseFloat(res.body.data.Commission_Amount)).toBe(Math.round(((baseAmount * overridePct) / 100) * 100) / 100);

    // The agent's own stored default is untouched by a per-transaction override.
    const agent = await db('tbl_agent_master').where({ Agent_ID: agentId }).first();
    expect(parseFloat(agent.Commission_Pct)).toBe(agentCommissionPct);
  });
});

describe('GET /api/rate-agent/commissions', () => {
  test('?agentId filters to that agent only', async () => {
    const res = await request(app).get('/api/rate-agent/commissions').set(auth()).query({ agentId });
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
    expect(res.body.data.every((c) => c.Agent_ID === agentId)).toBe(true);
    expect(res.body.data[0].Agent_Name).toBe('QA Rate Booking Agent');
  });

  test('?status=Pending returns only unpaid commissions', async () => {
    const res = await request(app).get('/api/rate-agent/commissions').set(auth()).query({ status: 'Pending' });
    expect(res.status).toBe(200);
    expect(res.body.data.every((c) => c.Status === 'Pending')).toBe(true);
  });
});

// ── Commission payout — the actual money-moving step ────────────────────────

describe('POST /api/rate-agent/commissions/:id/pay', () => {
  test('404s for a commission record that does not exist', async () => {
    const res = await request(app).post('/api/rate-agent/commissions/999999999/pay').set(auth()).send({});
    expect(res.status).toBe(404);
  });

  test('marks a Pending commission Paid, stamps Paid_Date=today and stores Payment_Reference', async () => {
    const created = await request(app).post('/api/rate-agent/commissions').set(auth()).send({
      Agent_ID: agentId, Source_Type: 'Sale', Source_ID: 555003, Commission_Base_Amount: 20000,
    });
    const txnId = created.body.data.Txn_ID;

    const res = await request(app).post(`/api/rate-agent/commissions/${txnId}/pay`).set(auth()).send({ Payment_Reference: 'QA-PAYREF-001' });
    expect(res.status).toBe(200);
    expect(res.body.data.Status).toBe('Paid');
    expect(res.body.data.Payment_Reference).toBe('QA-PAYREF-001');

    const row = await db('tbl_agent_commission_transactions').where({ Txn_ID: txnId }).first();
    expect(row.Status).toBe('Paid');
    expect(dayjs(row.Paid_Date).format('YYYY-MM-DD')).toBe(dayjs().format('YYYY-MM-DD'));
    expect(row.Payment_Reference).toBe('QA-PAYREF-001');
  });

  test('Payment_Reference is optional — defaults to null, not a crash', async () => {
    const created = await request(app).post('/api/rate-agent/commissions').set(auth()).send({
      Agent_ID: agentId, Source_Type: 'Sale', Source_ID: 555004, Commission_Base_Amount: 15000,
    });
    const res = await request(app).post(`/api/rate-agent/commissions/${created.body.data.Txn_ID}/pay`).set(auth()).send({});
    expect(res.status).toBe(200);
    expect(res.body.data.Payment_Reference).toBeNull();
  });

  test('FIXED: paying an already-Paid commission a second time is now rejected with 400 instead of silently overwriting the payment reference', async () => {
    const created = await request(app).post('/api/rate-agent/commissions').set(auth()).send({
      Agent_ID: agentId, Source_Type: 'Sale', Source_ID: 555005, Commission_Base_Amount: 30000,
    });
    const txnId = created.body.data.Txn_ID;

    const first = await request(app).post(`/api/rate-agent/commissions/${txnId}/pay`).set(auth()).send({ Payment_Reference: 'FIRST-PAY' });
    expect(first.status).toBe(200);
    expect(first.body.data.Status).toBe('Paid');

    const second = await request(app).post(`/api/rate-agent/commissions/${txnId}/pay`).set(auth()).send({ Payment_Reference: 'SECOND-PAY-SHOULD-NOT-HAPPEN' });
    expect(second.status).toBe(400);

    const row = await db('tbl_agent_commission_transactions').where({ Txn_ID: txnId }).first();
    expect(row.Payment_Reference).toBe('FIRST-PAY'); // unchanged, not clobbered
  });
});
