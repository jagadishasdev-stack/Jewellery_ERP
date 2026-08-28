/**
 * inventoryOps.js — gem/diamond certificate logging, automatic low-stock
 * reorder alerts, RFID scan tracking, and card-surcharge rules. Zero real
 * test coverage before this file (only a generic permission-gate smoke
 * test ever touched it).
 */
const request = require('supertest');
const { app } = require('../src/index');
const db = require('../src/db/knex');
const testTenant = require('./helpers/testTenant');

let tenant, token, typeIds, designIds;
const auth = () => ({ Authorization: `Bearer ${token}` });

beforeAll(async () => {
  tenant = await testTenant.setup();
  const res = await request(app).post('/api/auth/login').send({ username: tenant.username, password: tenant.password, tenantId: tenant.tenantId });
  token = res.body.data.token;

  // Real, shared master-data rows (not tenant-scoped) — used only to give
  // each reorder-alert test its own Type_ID/Design_ID group so the tests
  // don't interfere with each other inside the one shared QATEST tenant.
  typeIds = (await db('tbl_item_type_master').select('Type_ID').limit(5)).map((t) => t.Type_ID);
  designIds = (await db('tbl_design_master').select('Design_ID').limit(5)).map((d) => d.Design_ID);
});

afterAll(async () => {
  // Defensive explicit cleanup ahead of teardown() — these 4 tables were
  // added after testTenant.js was written; they DO cascade off
  // tbl_tenant_master (Tenant_ID FK, ON DELETE CASCADE), but being explicit
  // here matches this suite's convention and avoids relying on that alone.
  await db('tbl_gem_certificate').where({ Tenant_ID: tenant.tenantId }).del();
  await db('tbl_reorder_request').where({ Tenant_ID: tenant.tenantId }).del();
  await db('tbl_rfid_scan_log').where({ Tenant_ID: tenant.tenantId }).del();
  await db('tbl_card_charges_master').where({ Tenant_ID: tenant.tenantId }).del();
  await testTenant.teardown();
  await db.destroy();
});

async function createOrnament(overrides = {}) {
  const res = await request(app).post('/api/ornaments').set(auth()).send({
    Metal_Type: 'Gold', Gross_Weight: 5, Net_Gold_Weight: 4.5, Current_Gold_Rate: 6000,
    Base_Making_Charge_Per_Gram: 100, Purchase_Cost: 20000, ...overrides,
  });
  expect(res.status).toBe(201);
  // Ornament_ID comes back as a string (Postgres bigint via pg) — normalize
  // to a number here so every comparison against it downstream is exact.
  return { ...res.body.data, Ornament_ID: Number(res.body.data.Ornament_ID) };
}

// ── Gem/Diamond Certificates ─────────────────────────────────────────────────
describe('Gem/Diamond Certificates', () => {
  test('POST /certificates records a lab certificate linked to the right ornament', async () => {
    const ornament = await createOrnament({ Article_Number: 'QA-CERT-001' });
    const res = await request(app).post('/api/inventory-ops/certificates').set(auth()).send({
      Ornament_ID: ornament.Ornament_ID,
      Certifying_Lab: 'GIA',
      Certificate_Number: 'QA-GIA-0001',
      Certificate_Date: '2026-01-15',
      Carat_Weight: 1.25,
      Color_Grade: 'F',
      Clarity_Grade: 'VS1',
      Cut_Grade: 'Excellent',
    });
    expect(res.status).toBe(201);
    expect(res.body.data.Certifying_Lab).toBe('GIA');
    expect(Number(res.body.data.Ornament_ID)).toBe(ornament.Ornament_ID);

    const row = await db('tbl_gem_certificate').where({ Certificate_ID: res.body.data.Certificate_ID }).first();
    expect(row).toBeDefined();
    expect(row.Tenant_ID).toBe(tenant.tenantId);
    expect(Number(row.Ornament_ID)).toBe(ornament.Ornament_ID);
    expect(row.Certificate_Number).toBe('QA-GIA-0001');
    expect(parseFloat(row.Carat_Weight)).toBe(1.25);
    expect(row.Color_Grade).toBe('F');
    expect(row.Clarity_Grade).toBe('VS1');
    expect(row.Is_Active).toBe(true);
  });

  test('POST /certificates requires Certifying_Lab and Certificate_Number', async () => {
    const res = await request(app).post('/api/inventory-ops/certificates').set(auth()).send({});
    expect(res.status).toBe(422);
    const fields = res.body.errors.map((e) => e.field);
    expect(fields).toEqual(expect.arrayContaining(['Certifying_Lab', 'Certificate_Number']));
  });

  test('the same lab + certificate number combination is rejected with 409 (unique per tenant)', async () => {
    const ornament = await createOrnament({ Article_Number: 'QA-CERT-002' });
    await request(app).post('/api/inventory-ops/certificates').set(auth()).send({
      Ornament_ID: ornament.Ornament_ID, Certifying_Lab: 'IGI', Certificate_Number: 'QA-DUP-001',
    }).expect(201);

    const dup = await request(app).post('/api/inventory-ops/certificates').set(auth()).send({
      Ornament_ID: ornament.Ornament_ID, Certifying_Lab: 'IGI', Certificate_Number: 'QA-DUP-001',
    });
    expect(dup.status).toBe(409);

    const count = await db('tbl_gem_certificate').where({ Tenant_ID: tenant.tenantId, Certifying_Lab: 'IGI', Certificate_Number: 'QA-DUP-001' }).count('* as c').first();
    expect(parseInt(count.c)).toBe(1); // the duplicate insert never landed
  });

  test('GET /certificates?ornamentId= scopes results to just that ornament', async () => {
    const ornamentA = await createOrnament({ Article_Number: 'QA-CERT-003' });
    const ornamentB = await createOrnament({ Article_Number: 'QA-CERT-004' });
    await request(app).post('/api/inventory-ops/certificates').set(auth()).send({ Ornament_ID: ornamentA.Ornament_ID, Certifying_Lab: 'HRD', Certificate_Number: 'QA-HRD-A' }).expect(201);
    await request(app).post('/api/inventory-ops/certificates').set(auth()).send({ Ornament_ID: ornamentB.Ornament_ID, Certifying_Lab: 'HRD', Certificate_Number: 'QA-HRD-B' }).expect(201);

    const res = await request(app).get('/api/inventory-ops/certificates').set(auth()).query({ ornamentId: ornamentA.Ornament_ID });
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].Certificate_Number).toBe('QA-HRD-A');
  });
});

// ── Reorder Requests / auto-scan ─────────────────────────────────────────────
describe('Reorder Requests', () => {
  test('POST /reorder-requests/auto-scan raises a request for a group below Min_Stock_Level and skips a healthy group', async () => {
    // Low group: total stock (2) < min level (5) across this Type/Design.
    await createOrnament({ Article_Number: 'QA-REORDER-LOW-1', Type_ID: typeIds[0], Design_ID: designIds[0], Stock_Quantity: 1, Min_Stock_Level: 5 });
    await createOrnament({ Article_Number: 'QA-REORDER-LOW-2', Type_ID: typeIds[0], Design_ID: designIds[0], Stock_Quantity: 1, Min_Stock_Level: 5 });
    // Healthy group: total stock (10) >= min level (5).
    await createOrnament({ Article_Number: 'QA-REORDER-OK-1', Type_ID: typeIds[1], Design_ID: designIds[1], Stock_Quantity: 10, Min_Stock_Level: 5 });

    const res = await request(app).post('/api/inventory-ops/reorder-requests/auto-scan').set(auth()).send();
    expect(res.status).toBe(201);

    const lowGroupRequest = res.body.data.find((r) => Number(r.Type_ID) === typeIds[0] && Number(r.Design_ID) === designIds[0]);
    expect(lowGroupRequest).toBeDefined();
    expect(lowGroupRequest.Requested_Qty).toBe(3); // max(1, min(5) - total(2)) = 3
    expect(lowGroupRequest.Reason).toBe('Auto: stock (2) below minimum (5)');
    expect(lowGroupRequest.Status).toBe('Pending');
    expect(lowGroupRequest.Requested_By).toBe(tenant.username);

    const healthyGroupRequest = res.body.data.find((r) => Number(r.Type_ID) === typeIds[1] && Number(r.Design_ID) === designIds[1]);
    expect(healthyGroupRequest).toBeUndefined(); // healthy group must NOT get a reorder request

    const dbRow = await db('tbl_reorder_request').where({ Tenant_ID: tenant.tenantId, Type_ID: typeIds[0], Design_ID: designIds[0] }).first();
    expect(dbRow).toBeDefined();
    expect(dbRow.Requested_Qty).toBe(3);
  });

  test('running auto-scan again for the same still-low group does not create a duplicate Pending request', async () => {
    // Reuses the low group from the previous test — it still has an open
    // (Pending) request raised for it, so a second scan must skip it.
    const before = await db('tbl_reorder_request').where({ Tenant_ID: tenant.tenantId, Type_ID: typeIds[0], Design_ID: designIds[0] }).count('* as c').first();
    expect(parseInt(before.c)).toBe(1);

    const res = await request(app).post('/api/inventory-ops/reorder-requests/auto-scan').set(auth()).send();
    expect(res.status).toBe(201);
    const dupForLowGroup = res.body.data.find((r) => Number(r.Type_ID) === typeIds[0] && Number(r.Design_ID) === designIds[0]);
    expect(dupForLowGroup).toBeUndefined();

    const after = await db('tbl_reorder_request').where({ Tenant_ID: tenant.tenantId, Type_ID: typeIds[0], Design_ID: designIds[0] }).count('* as c').first();
    expect(parseInt(after.c)).toBe(1); // unchanged — no duplicate raised
  });

  test('a sold-out item is excluded from the low-stock calculation entirely (Is_Sold=false filter)', async () => {
    const ornament = await createOrnament({ Article_Number: 'QA-REORDER-SOLD-1', Type_ID: typeIds[2], Design_ID: designIds[2], Stock_Quantity: 1, Min_Stock_Level: 5 });
    await db('tbl_ornament_master').where({ Ornament_ID: ornament.Ornament_ID }).update({ Is_Sold: true });

    const res = await request(app).post('/api/inventory-ops/reorder-requests/auto-scan').set(auth()).send();
    expect(res.status).toBe(201);
    const forThisGroup = res.body.data.find((r) => Number(r.Type_ID) === typeIds[2] && Number(r.Design_ID) === designIds[2]);
    expect(forThisGroup).toBeUndefined(); // sold item's group never even appears — the WHERE clause drops it before grouping

    const dbRow = await db('tbl_reorder_request').where({ Tenant_ID: tenant.tenantId, Type_ID: typeIds[2], Design_ID: designIds[2] }).first();
    expect(dbRow).toBeUndefined();
  });

  test('POST /reorder-requests creates a manual request and requires Requested_Qty > 0', async () => {
    const bad = await request(app).post('/api/inventory-ops/reorder-requests').set(auth()).send({ Type_ID: typeIds[3], Requested_Qty: 0 });
    expect(bad.status).toBe(422);

    const res = await request(app).post('/api/inventory-ops/reorder-requests').set(auth()).send({
      Type_ID: typeIds[3], Design_ID: designIds[3], Requested_Qty: 7, Reason: 'Manual QA request',
    });
    expect(res.status).toBe(201);
    expect(res.body.data.Status).toBe('Pending');
    expect(res.body.data.Requested_By).toBe(tenant.username);
    expect(res.body.data.Requested_Qty).toBe(7);
  });

  test('GET /reorder-requests excludes Cancelled by default, and status filter narrows correctly', async () => {
    const created = await request(app).post('/api/inventory-ops/reorder-requests').set(auth()).send({
      Type_ID: typeIds[4], Design_ID: designIds[4], Requested_Qty: 2, Reason: 'To be cancelled',
    });
    expect(created.status).toBe(201);
    const requestId = created.body.data.Request_ID;

    await request(app).put(`/api/inventory-ops/reorder-requests/${requestId}`).set(auth()).send({ Status: 'Cancelled' }).expect(200);

    const defaultList = await request(app).get('/api/inventory-ops/reorder-requests').set(auth());
    expect(defaultList.status).toBe(200);
    expect(defaultList.body.data.some((r) => Number(r.Request_ID) === Number(requestId))).toBe(false);

    const cancelledList = await request(app).get('/api/inventory-ops/reorder-requests').set(auth()).query({ status: 'Cancelled' });
    expect(cancelledList.status).toBe(200);
    expect(cancelledList.body.data.some((r) => Number(r.Request_ID) === Number(requestId))).toBe(true);
  });

  // Fixed: the route used to declare `body('Status').isIn([...])` as
  // middleware but its handler never called `validationResult(req)` —
  // unlike every other write route in this file. An out-of-enum Status
  // used to be written straight to the DB with a 200; now it's rejected.
  test('FIXED: PUT /reorder-requests/:id now actually enforces its declared Status validator', async () => {
    const created = await request(app).post('/api/inventory-ops/reorder-requests').set(auth()).send({
      Type_ID: typeIds[0], Requested_Qty: 3, Reason: 'For status validation test',
    });
    expect(created.status).toBe(201);

    const badStatus = await request(app).put(`/api/inventory-ops/reorder-requests/${created.body.data.Request_ID}`).set(auth()).send({ Status: 'NotARealStatus' });
    expect(badStatus.status).toBe(422);

    const row = await db('tbl_reorder_request').where({ Request_ID: created.body.data.Request_ID }).first();
    expect(row.Status).not.toBe('NotARealStatus'); // unaffected

    const notFound = await request(app).put('/api/inventory-ops/reorder-requests/9999999').set(auth()).send({ Status: 'Ordered' });
    expect(notFound.status).toBe(404);
  });
});

// ── RFID Scan Log ─────────────────────────────────────────────────────────────
describe('RFID Scan Tracking', () => {
  test('POST /rfid-scans links the scan to the matching ornament by RFID_Tag', async () => {
    const ornament = await createOrnament({ Article_Number: 'QA-RFID-001', RFID_Tag: 'RFID-QA-0001' });

    const res = await request(app).post('/api/inventory-ops/rfid-scans').set(auth()).send({
      RFID_Tag: 'RFID-QA-0001', Scan_Type: 'Stock Check', Scan_Location: 'Vault A',
    });
    expect(res.status).toBe(201);
    expect(res.body.data.matchedOrnament).toBeDefined();
    expect(Number(res.body.data.matchedOrnament.Ornament_ID)).toBe(ornament.Ornament_ID);
    expect(Number(res.body.data.Ornament_ID)).toBe(ornament.Ornament_ID);
    expect(res.body.data.Scanned_By).toBe(tenant.username);

    const row = await db('tbl_rfid_scan_log').where({ Scan_ID: res.body.data.Scan_ID }).first();
    expect(row).toBeDefined();
    expect(Number(row.Ornament_ID)).toBe(ornament.Ornament_ID);
    expect(row.RFID_Tag).toBe('RFID-QA-0001');
    expect(row.Scan_Type).toBe('Stock Check');
    expect(row.Scan_Location).toBe('Vault A');
    expect(row.Scan_Date).toBeInstanceOf(Date);
  });

  test('POST /rfid-scans with an unrecognized tag still logs the scan, but with no linked ornament', async () => {
    const res = await request(app).post('/api/inventory-ops/rfid-scans').set(auth()).send({
      RFID_Tag: 'RFID-QA-UNKNOWN', Scan_Type: 'Gate',
    });
    expect(res.status).toBe(201);
    expect(res.body.data.matchedOrnament).toBeNull();
    expect(res.body.data.Ornament_ID).toBeNull();
  });

  test('POST /rfid-scans validates RFID_Tag and Scan_Type', async () => {
    const missingTag = await request(app).post('/api/inventory-ops/rfid-scans').set(auth()).send({ Scan_Type: 'Gate' });
    expect(missingTag.status).toBe(422);

    const badType = await request(app).post('/api/inventory-ops/rfid-scans').set(auth()).send({ RFID_Tag: 'RFID-QA-BADTYPE', Scan_Type: 'Not A Real Type' });
    expect(badType.status).toBe(422);
  });

  test('GET /rfid-scans filters by rfidTag and by ornamentId', async () => {
    const ornament = await createOrnament({ Article_Number: 'QA-RFID-002', RFID_Tag: 'RFID-QA-0002' });
    await request(app).post('/api/inventory-ops/rfid-scans').set(auth()).send({ RFID_Tag: 'RFID-QA-0002', Scan_Type: 'Audit' }).expect(201);
    await request(app).post('/api/inventory-ops/rfid-scans').set(auth()).send({ RFID_Tag: 'RFID-QA-0002', Scan_Type: 'Sale' }).expect(201);

    const byTag = await request(app).get('/api/inventory-ops/rfid-scans').set(auth()).query({ rfidTag: 'RFID-QA-0002' });
    expect(byTag.status).toBe(200);
    expect(byTag.body.data.length).toBe(2);
    expect(byTag.body.data.every((s) => s.RFID_Tag === 'RFID-QA-0002')).toBe(true);

    const byOrnament = await request(app).get('/api/inventory-ops/rfid-scans').set(auth()).query({ ornamentId: ornament.Ornament_ID });
    expect(byOrnament.status).toBe(200);
    expect(byOrnament.body.data.length).toBe(2);
    expect(byOrnament.body.data.every((s) => Number(s.Ornament_ID) === ornament.Ornament_ID)).toBe(true);
  });
});

// ── Card Surcharge Master ─────────────────────────────────────────────────────
describe('Card Surcharge Rules', () => {
  test('POST /card-charges creates a percentage-based surcharge rule with real stored values', async () => {
    const res = await request(app).post('/api/inventory-ops/card-charges').set(auth()).send({
      Card_Type: 'Credit', Card_Network: 'Visa', Surcharge_Pct: 2.5, Min_Surcharge_Amount: 10,
    });
    expect(res.status).toBe(201);
    expect(res.body.data.Card_Type).toBe('Credit');
    expect(parseFloat(res.body.data.Surcharge_Pct)).toBe(2.5);

    const row = await db('tbl_card_charges_master').where({ Charge_ID: res.body.data.Charge_ID }).first();
    expect(row).toBeDefined();
    expect(row.Tenant_ID).toBe(tenant.tenantId);
    expect(row.Card_Network).toBe('Visa');
    expect(parseFloat(row.Surcharge_Pct)).toBe(2.5);
    expect(parseFloat(row.Min_Surcharge_Amount)).toBe(10);
    expect(row.Is_Active).toBe(true);
  });

  test('POST /card-charges defaults Surcharge_Pct/Min_Surcharge_Amount to 0 when omitted', async () => {
    const res = await request(app).post('/api/inventory-ops/card-charges').set(auth()).send({ Card_Type: 'Wallet' });
    expect(res.status).toBe(201);
    const row = await db('tbl_card_charges_master').where({ Charge_ID: res.body.data.Charge_ID }).first();
    expect(parseFloat(row.Surcharge_Pct)).toBe(0);
    expect(parseFloat(row.Min_Surcharge_Amount)).toBe(0);
  });

  test('POST /card-charges rejects a Card_Type outside the fixed enum', async () => {
    const res = await request(app).post('/api/inventory-ops/card-charges').set(auth()).send({ Card_Type: 'Crypto' });
    expect(res.status).toBe(422);
  });

  test('GET /card-charges only returns active rules for this tenant', async () => {
    const rule = await request(app).post('/api/inventory-ops/card-charges').set(auth()).send({ Card_Type: 'Debit', Card_Network: 'RuPay', Surcharge_Pct: 1 });
    expect(rule.status).toBe(201);
    await db('tbl_card_charges_master').where({ Charge_ID: rule.body.data.Charge_ID }).update({ Is_Active: false });

    const res = await request(app).get('/api/inventory-ops/card-charges').set(auth());
    expect(res.status).toBe(200);
    expect(res.body.data.some((c) => Number(c.Charge_ID) === Number(rule.body.data.Charge_ID))).toBe(false); // deactivated rule excluded
    expect(res.body.data.every((c) => c.Tenant_ID === tenant.tenantId)).toBe(true);
  });
});
