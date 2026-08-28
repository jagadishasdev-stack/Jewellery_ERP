/**
 * HSN master, e-Invoice log, and Loyalty points slabs (src/routes/compliance.js)
 * — previously zero real coverage (only touched incidentally by a generic
 * permission-gate smoke test).
 *
 * tbl_hsn_master is a GLOBAL table (no Tenant_ID column — shared across all
 * tenants, see the route file's own comment), so unlike every other table
 * here it is NOT cleaned up by testTenant.teardown(); this file deletes its
 * own inserted rows explicitly in afterAll to avoid leaking into the shared
 * dev DB.
 *
 * POST /einvoice/generate has no real GSP/IRP integration wired up (no
 * GSTN credentials exist in this project) — by the route's own design it
 * always ends up Status='Failed' with an explanatory Error_Message rather
 * than a fabricated IRN. Tests below verify that real, documented contract
 * (and a real consequence of it: the "already generated" 409 duplicate
 * check only fires on Status='Generated', which this flow can never
 * produce, so calling /generate twice for the same sale is NOT blocked).
 *
 * Also real and verified: POST /einvoice/generate and POST
 * /einvoice/:id/cancel both DECLARE an express-validator body(...).notEmpty()
 * check but never call validationResult(req) to enforce it (unlike POST
 * /hsn and POST /loyalty-slabs, which do) — so a missing Sale_ID falls
 * through to a raw Knex "Undefined binding(s)" 500, and a missing
 * Cancellation_Reason silently cancels with a null reason instead of 400ing.
 */
const request = require('supertest');
const { app } = require('../src/index');
const db = require('../src/db/knex');
const testTenant = require('./helpers/testTenant');

let tenant, token, typeId;
const auth = () => ({ Authorization: `Bearer ${token}` });
const insertedHsnIds = [];

beforeAll(async () => {
  tenant = await testTenant.setup();
  const res = await request(app).post('/api/auth/login').send({ username: tenant.username, password: tenant.password, tenantId: tenant.tenantId });
  token = res.body.data.token;
  typeId = (await db('tbl_item_type_master').first()).Type_ID;
});

afterAll(async () => {
  if (insertedHsnIds.length) await db('tbl_hsn_master').whereIn('HSN_ID', insertedHsnIds).del();
  await testTenant.teardown();
  await db.destroy();
});

async function createOrnamentAndSale(overrides = {}) {
  const ornament = await request(app).post('/api/ornaments').set(auth()).send({
    Type_ID: typeId, Metal_Type: 'Gold', Gross_Weight: 5, Net_Gold_Weight: 4.5, Current_Gold_Rate: 6000,
    Base_Making_Charge_Per_Gram: 100, Purchase_Cost: 20000, Total_Price: 28000,
  });
  expect(ornament.status).toBe(201);
  const sale = await request(app).post('/api/sales/create').set(auth()).send({
    Payment_Mode: 'Cash',
    items: [{ Ornament_ID: ornament.body.data.Ornament_ID, Article_Number: ornament.body.data.Article_Number, Total_Line_Price: 28000 }],
    ...overrides,
  });
  expect(sale.status).toBe(201);
  return sale.body.data.sale;
}

describe('HSN master (GET/POST /api/compliance/hsn)', () => {
  test('POST /hsn requires HSN_Code and a valid GST_Percentage (422 — this route DOES check validationResult)', async () => {
    const noCode = await request(app).post('/api/compliance/hsn').set(auth()).send({ GST_Percentage: 3 });
    expect(noCode.status).toBe(422);

    const badPct = await request(app).post('/api/compliance/hsn').set(auth()).send({ HSN_Code: 'QA-BAD-PCT', GST_Percentage: -1 });
    expect(badPct.status).toBe(422);
  });

  test('POST /hsn creates a real row, GET /hsn lists it back, and a duplicate HSN_Code is rejected with 409', async () => {
    const code = `QA${Date.now()}`;
    const created = await request(app).post('/api/compliance/hsn').set(auth()).send({
      HSN_Code: code, Description: 'QA Test Gold Jewellery', GST_Percentage: 3,
    });
    expect(created.status).toBe(201);
    expect(created.body.data.HSN_Code).toBe(code);
    expect(parseFloat(created.body.data.GST_Percentage)).toBe(3);
    insertedHsnIds.push(created.body.data.HSN_ID);

    // Verify directly against the DB, not just the HTTP response.
    const dbRow = await db('tbl_hsn_master').where({ HSN_ID: created.body.data.HSN_ID }).first();
    expect(dbRow).toBeDefined();
    expect(dbRow.HSN_Code).toBe(code);
    expect(dbRow.Is_Active).toBe(true);

    const list = await request(app).get('/api/compliance/hsn').set(auth());
    expect(list.status).toBe(200);
    expect(list.body.data.some((r) => r.HSN_Code === code)).toBe(true);
    // Route only returns Is_Active rows, ordered by HSN_Code.
    expect(list.body.data.every((r) => r.HSN_Code)).toBe(true);
    const sorted = [...list.body.data].sort((a, b) => (a.HSN_Code < b.HSN_Code ? -1 : a.HSN_Code > b.HSN_Code ? 1 : 0));
    expect(list.body.data.map((r) => r.HSN_Code)).toEqual(sorted.map((r) => r.HSN_Code));

    const dup = await request(app).post('/api/compliance/hsn').set(auth()).send({ HSN_Code: code, GST_Percentage: 5 });
    expect(dup.status).toBe(409);
  });

  test('an Is_Active=false HSN row is excluded from GET /hsn', async () => {
    const code = `QAX${Date.now()}`; // HSN_Code column is varchar(20) — keep it short
    const created = await request(app).post('/api/compliance/hsn').set(auth()).send({ HSN_Code: code, GST_Percentage: 3 });
    expect(created.status).toBe(201);
    insertedHsnIds.push(created.body.data.HSN_ID);
    await db('tbl_hsn_master').where({ HSN_ID: created.body.data.HSN_ID }).update({ Is_Active: false });

    const list = await request(app).get('/api/compliance/hsn').set(auth());
    expect(list.body.data.some((r) => r.HSN_Code === code)).toBe(false);
  });
});

describe('e-Invoice log (POST /api/compliance/einvoice/generate, /:id/cancel, GET /einvoice)', () => {
  test('POST /einvoice/generate 404s for a sale that does not belong to this tenant (or does not exist)', async () => {
    const res = await request(app).post('/api/compliance/einvoice/generate').set(auth()).send({ Sale_ID: 999999999 });
    expect(res.status).toBe(404);
  });

  test('POST /einvoice/generate with no Sale_ID at all is rejected with a clean 422 (fixed — this route used to declare body(\'Sale_ID\').notEmpty() but never call validationResult, falling through to a raw DB error)', async () => {
    const res = await request(app).post('/api/compliance/einvoice/generate').set(auth()).send({});
    expect(res.status).toBe(422);
  });

  test('POST /einvoice/generate for a real sale ends Status=Failed with an explanatory Error_Message — no GSP/IRP wired up, and no fabricated IRN', async () => {
    const sale = await createOrnamentAndSale();

    const res = await request(app).post('/api/compliance/einvoice/generate').set(auth()).send({ Sale_ID: sale.Sale_ID });
    expect(res.status).toBe(201);
    expect(res.body.data.Status).toBe('Failed');
    expect(res.body.data.Error_Message).toMatch(/No GSP\/IRP provider configured/);
    expect(res.body.data.IRN).toBeFalsy(); // never a fabricated IRN

    // Verify the actual row landed in the DB with the same real values.
    const row = await db('tbl_einvoice_log').where({ Log_ID: res.body.data.Log_ID }).first();
    expect(row).toBeDefined();
    expect(row.Tenant_ID).toBe(tenant.tenantId);
    expect(row.Sale_ID).toBe(String(sale.Sale_ID));
    expect(row.Status).toBe('Failed');

    // GET /einvoice surfaces it, joined with the sale's own Invoice_Number.
    const list = await request(app).get('/api/compliance/einvoice').set(auth()).query({ saleId: sale.Sale_ID });
    expect(list.status).toBe(200);
    expect(list.body.data).toHaveLength(1);
    expect(list.body.data[0].Invoice_Number).toBe(sale.Invoice_Number);
    expect(list.body.data[0].Status).toBe('Failed');
  });

  test('calling /einvoice/generate again for the SAME sale is NOT blocked — the "already generated" 409 check looks for Status=Generated, which this no-GSP flow can never produce', async () => {
    const sale = await createOrnamentAndSale();

    const first = await request(app).post('/api/compliance/einvoice/generate').set(auth()).send({ Sale_ID: sale.Sale_ID });
    expect(first.status).toBe(201);
    expect(first.body.data.Status).toBe('Failed');

    const second = await request(app).post('/api/compliance/einvoice/generate').set(auth()).send({ Sale_ID: sale.Sale_ID });
    expect(second.status).toBe(201); // not 409 — the dedup guard never actually fires today
    expect(second.body.data.Status).toBe('Failed');
    expect(second.body.data.Log_ID).not.toBe(first.body.data.Log_ID); // a second, distinct row was created

    const rows = await db('tbl_einvoice_log').where({ Sale_ID: sale.Sale_ID });
    expect(rows).toHaveLength(2);
  });

  test('POST /einvoice/:id/cancel: a missing Cancellation_Reason is rejected with 422 (fixed); a non-existent log entry 404s; a real one, given a real reason, cancels correctly', async () => {
    const notFound = await request(app).post('/api/compliance/einvoice/999999999/cancel').set(auth()).send({ Cancellation_Reason: 'QA test' });
    expect(notFound.status).toBe(404);

    const saleA = await createOrnamentAndSale();
    const genA = await request(app).post('/api/compliance/einvoice/generate').set(auth()).send({ Sale_ID: saleA.Sale_ID });
    const missingReason = await request(app).post(`/api/compliance/einvoice/${genA.body.data.Log_ID}/cancel`).set(auth()).send({});
    expect(missingReason.status).toBe(422); // fixed — used to be a silent 200 with a null reason

    const saleB = await createOrnamentAndSale();
    const genB = await request(app).post('/api/compliance/einvoice/generate').set(auth()).send({ Sale_ID: saleB.Sale_ID });
    const logId = genB.body.data.Log_ID;
    const cancelled = await request(app).post(`/api/compliance/einvoice/${logId}/cancel`).set(auth()).send({ Cancellation_Reason: 'QA test cancellation' });
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.data.Status).toBe('Cancelled');
    expect(cancelled.body.data.Cancellation_Reason).toBe('QA test cancellation');
    expect(cancelled.body.data.Cancelled_Date).toBeTruthy();

    const row = await db('tbl_einvoice_log').where({ Log_ID: logId }).first();
    expect(row.Status).toBe('Cancelled');
    expect(row.Cancellation_Reason).toBe('QA test cancellation');
  });

  test('cancelling an already-cancelled log entry is now rejected with 400 (fixed — used to have no guard against double-cancellation and would silently overwrite the reason/date again)', async () => {
    const sale = await createOrnamentAndSale();
    const generated = await request(app).post('/api/compliance/einvoice/generate').set(auth()).send({ Sale_ID: sale.Sale_ID });
    const logId = generated.body.data.Log_ID;

    const firstCancel = await request(app).post(`/api/compliance/einvoice/${logId}/cancel`).set(auth()).send({ Cancellation_Reason: 'first reason' });
    expect(firstCancel.status).toBe(200);

    const secondCancel = await request(app).post(`/api/compliance/einvoice/${logId}/cancel`).set(auth()).send({ Cancellation_Reason: 'second reason' });
    expect(secondCancel.status).toBe(400);

    const row = await db('tbl_einvoice_log').where({ Log_ID: logId }).first();
    expect(row.Cancellation_Reason).toBe('first reason'); // unchanged, not overwritten
  });

  test('e-invoice log entries are scoped to the caller\'s own tenant — cancelling another tenant\'s Log_ID 404s', async () => {
    const otherTenantRow = await db('tbl_einvoice_log').whereNot({ Tenant_ID: tenant.tenantId }).first();
    if (!otherTenantRow) return; // nothing to check against in this environment
    const res = await request(app).post(`/api/compliance/einvoice/${otherTenantRow.Log_ID}/cancel`).set(auth()).send({ Cancellation_Reason: 'QA cross-tenant attempt' });
    expect(res.status).toBe(404);
  });
});

describe('Loyalty points slabs (GET/POST /api/compliance/loyalty-slabs, GET .../calculate)', () => {
  test('GET /loyalty-slabs/calculate before any slab exists returns 0 points and slab:null', async () => {
    const res = await request(app).get('/api/compliance/loyalty-slabs/calculate').set(auth()).query({ amount: 12345 });
    expect(res.status).toBe(200);
    expect(res.body.data.points).toBe(0);
    expect(res.body.data.slab).toBeNull();
  });

  test('GET /loyalty-slabs/calculate requires amount > 0', async () => {
    const zero = await request(app).get('/api/compliance/loyalty-slabs/calculate').set(auth()).query({ amount: 0 });
    expect(zero.status).toBe(400);
    const missing = await request(app).get('/api/compliance/loyalty-slabs/calculate').set(auth());
    expect(missing.status).toBe(400);
  });

  test('POST /loyalty-slabs validates Amount_From >= 0 and Points_Per_Unit > 0 (422 — this route DOES check validationResult)', async () => {
    const badAmount = await request(app).post('/api/compliance/loyalty-slabs').set(auth()).send({ Amount_From: -1, Points_Per_Unit: 1 });
    expect(badAmount.status).toBe(422);
    const badPoints = await request(app).post('/api/compliance/loyalty-slabs').set(auth()).send({ Amount_From: 0, Points_Per_Unit: 0 });
    expect(badPoints.status).toBe(422);
  });

  test('POST /loyalty-slabs creates real, tenant-scoped rows; GET /loyalty-slabs lists them ordered by Amount_From', async () => {
    const slab1 = await request(app).post('/api/compliance/loyalty-slabs').set(auth()).send({ Amount_From: 0, Amount_To: 4999.99, Points_Per_Unit: 0.01 });
    expect(slab1.status).toBe(201);
    expect(slab1.body.data.Tenant_ID).toBe(tenant.tenantId);

    const slab2 = await request(app).post('/api/compliance/loyalty-slabs').set(auth()).send({ Amount_From: 5000, Points_Per_Unit: 0.02 });
    expect(slab2.status).toBe(201);

    const dbRows = await db('tbl_loyalty_points_slab').where({ Tenant_ID: tenant.tenantId });
    expect(dbRows).toHaveLength(2);

    const list = await request(app).get('/api/compliance/loyalty-slabs').set(auth());
    expect(list.status).toBe(200);
    expect(list.body.data).toHaveLength(2);
    expect(parseFloat(list.body.data[0].Amount_From)).toBe(0);
    expect(parseFloat(list.body.data[1].Amount_From)).toBe(5000);
  });

  test('GET /loyalty-slabs/calculate matches the correct slab by amount range and computes points = amount * Points_Per_Unit, rounded to 2dp', async () => {
    const low = await request(app).get('/api/compliance/loyalty-slabs/calculate').set(auth()).query({ amount: 3000 });
    expect(low.status).toBe(200);
    expect(low.body.data.points).toBeCloseTo(30, 2); // 3000 * 0.01
    expect(parseFloat(low.body.data.slab.Amount_From)).toBe(0);

    const high = await request(app).get('/api/compliance/loyalty-slabs/calculate').set(auth()).query({ amount: 7000 });
    expect(high.status).toBe(200);
    expect(high.body.data.points).toBeCloseTo(140, 2); // 7000 * 0.02
    expect(parseFloat(high.body.data.slab.Amount_From)).toBe(5000);

    // Rounding: 33.333... -> 33.33
    const rounding = await request(app).get('/api/compliance/loyalty-slabs/calculate').set(auth()).query({ amount: 3333.333 });
    expect(rounding.body.data.points).toBeCloseTo(33.33, 2);
  });

  test('Metal_Type-restricted slabs: a metal-specific slab with a higher Amount_From wins for its own metal type, but is correctly excluded when a different metalType is requested', async () => {
    // Slab_From 5000.01 > the generic slab's 5000 — deliberately so it wins
    // the "orderBy Amount_From desc, first()" tie-break whenever it
    // qualifies at all.
    const silverSlab = await request(app).post('/api/compliance/loyalty-slabs').set(auth()).send({
      Amount_From: 5000.01, Metal_Type: 'Silver', Points_Per_Unit: 0.1,
    });
    expect(silverSlab.status).toBe(201);

    const forGold = await request(app).get('/api/compliance/loyalty-slabs/calculate').set(auth()).query({ amount: 7000, metalType: 'Gold' });
    expect(forGold.status).toBe(200);
    // Silver-only slab excluded for a Gold purchase — falls back to the
    // generic (Metal_Type=null) slab created in the previous test.
    expect(parseFloat(forGold.body.data.slab.Amount_From)).toBe(5000);
    expect(forGold.body.data.points).toBeCloseTo(140, 2); // 7000 * 0.02

    const forSilver = await request(app).get('/api/compliance/loyalty-slabs/calculate').set(auth()).query({ amount: 7000, metalType: 'Silver' });
    expect(forSilver.status).toBe(200);
    expect(parseFloat(forSilver.body.data.slab.Amount_From)).toBe(5000.01);
    expect(forSilver.body.data.points).toBeCloseTo(700, 2); // 7000 * 0.1

    // Real, verified quirk: when metalType is omitted entirely, the route
    // skips the metal filter altogether — a Silver-only slab can still be
    // selected for a request that names no metal at all.
    const noMetal = await request(app).get('/api/compliance/loyalty-slabs/calculate').set(auth()).query({ amount: 7000 });
    expect(parseFloat(noMetal.body.data.slab.Amount_From)).toBe(5000.01);
    expect(noMetal.body.data.points).toBeCloseTo(700, 2);
  });

  test('an Is_Active=false slab is excluded from both GET /loyalty-slabs and the calculate endpoint', async () => {
    const slab = await db('tbl_loyalty_points_slab').where({ Tenant_ID: tenant.tenantId, Amount_From: 5000 }).first();
    await db('tbl_loyalty_points_slab').where({ Slab_ID: slab.Slab_ID }).update({ Is_Active: false });

    const list = await request(app).get('/api/compliance/loyalty-slabs').set(auth());
    expect(list.body.data.some((r) => r.Slab_ID === slab.Slab_ID)).toBe(false);

    const calc = await request(app).get('/api/compliance/loyalty-slabs/calculate').set(auth()).query({ amount: 7000, metalType: 'Gold' });
    // The 5000-5000.01 generic slab is now inactive; nothing else qualifies
    // for Gold at this amount (the Silver-only one is excluded), so it
    // falls back to no match.
    expect(calc.body.data.slab).toBeNull();
    expect(calc.body.data.points).toBe(0);

    await db('tbl_loyalty_points_slab').where({ Slab_ID: slab.Slab_ID }).update({ Is_Active: true }); // restore for any later assertions in this file
  });
});
