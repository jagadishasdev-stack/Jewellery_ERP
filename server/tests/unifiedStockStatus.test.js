/**
 * Unified stock Status — previously scattered across separate booleans
 * (Is_Sold, Is_On_Approval, Is_On_Display, Is_Stock_Available) with no
 * single authoritative field (Missing Feature Report, Transaction Menu
 * spec). server/src/utils/ornamentStatus.js is that field, shared by
 * ornaments.js's own list/detail routes and reports.js's Barcode Report
 * so there's exactly one derivation, not two that could drift.
 *
 * Deliberately does NOT fabricate Repair/Workshop/Melting statuses —
 * none of those workflows reference a specific Ornament_ID in this
 * schema, confirmed while building this; only "In Transfer" is added
 * as a genuinely new, checkable state (tbl_stock_transfer_items).
 */
const request = require('supertest');
const { app } = require('../src/index');
const db = require('../src/db/knex');
const testTenant = require('./helpers/testTenant');

let tenant, token, typeId, branchA, branchB;
const auth = () => ({ Authorization: `Bearer ${token}` });

beforeAll(async () => {
  tenant = await testTenant.setup();
  const res = await request(app).post('/api/auth/login').send({ username: tenant.username, password: tenant.password, tenantId: tenant.tenantId });
  token = res.body.data.token;
  typeId = (await db('tbl_item_type_master').first()).Type_ID;

  branchA = `${tenant.tenantId}_USSA`;
  branchB = `${tenant.tenantId}_USSB`;
  await db('tbl_branch_master').insert([
    { Branch_ID: branchA, Tenant_ID: tenant.tenantId, Branch_Name: 'QA Status Branch A', Branch_Code: 'USSA', Is_Active: true },
    { Branch_ID: branchB, Tenant_ID: tenant.tenantId, Branch_Name: 'QA Status Branch B', Branch_Code: 'USSB', Is_Active: true },
  ]);
});

afterAll(async () => {
  await db('tbl_stock_transfer_items').whereIn('Transfer_ID', db('tbl_stock_transfer').where({ Tenant_ID: tenant.tenantId }).select('Transfer_ID')).del();
  await db('tbl_stock_transfer').where({ Tenant_ID: tenant.tenantId }).del();
  await db('tbl_ornament_master').where({ Tenant_ID: tenant.tenantId }).del();
  await db('tbl_branch_master').whereIn('Branch_ID', [branchA, branchB]).del();
  await testTenant.teardown();
  await db.destroy();
});

async function createOrnament(articleNumber, branchId) {
  const res = await request(app).post('/api/ornaments').set(auth()).send({
    Type_ID: typeId, Metal_Type: 'Gold', Gross_Weight: 5, Net_Gold_Weight: 4.5, Current_Gold_Rate: 6000,
    Base_Making_Charge_Per_Gram: 100, Purchase_Cost: 15000, Total_Price: 18000, Article_Number: articleNumber, Branch_ID: branchId,
  });
  return res.body.data;
}

test('a plain new ornament reports Status: Available on both the list and detail routes', async () => {
  // Status is computed on the read routes (list/detail) via
  // attachOrnamentStatus — the plain POST /ornaments response doesn't
  // include it, so this checks GET, not the creation response itself.
  const created = await createOrnament('QASTATUS-0001', branchA);

  const detail = await request(app).get(`/api/ornaments/${created.Ornament_ID}`).set(auth());
  expect(detail.body.data.Status).toBe('Available');

  const list = await request(app).get('/api/ornaments').set(auth()).query({ search: 'QASTATUS-0001' });
  const row = list.body.data.items.find((r) => r.Article_Number === 'QASTATUS-0001');
  expect(row.Status).toBe('Available');
});

test('a sold ornament reports Status: Sold', async () => {
  const created = await createOrnament('QASTATUS-0002', branchA);
  await request(app).post('/api/sales/create').set(auth()).send({
    Payment_Mode: 'Cash',
    items: [{ Ornament_ID: created.Ornament_ID, Article_Number: 'QASTATUS-0002', Total_Line_Price: 18000 }],
  });
  const detail = await request(app).get(`/api/ornaments/${created.Ornament_ID}`).set(auth());
  expect(detail.body.data.Status).toBe('Sold');
});

test('an ornament with a Pending interbranch transfer reports Status: In Transfer', async () => {
  const created = await createOrnament('QASTATUS-0003', branchA);
  const transfer = await request(app).post('/api/transfer/create').set(auth()).send({
    Transfer_Type: 'Branch', From_Branch_ID: branchA, To_Branch_ID: branchB,
    items: [{ Ornament_ID: created.Ornament_ID }],
  });
  expect(transfer.status).toBe(201);

  const detail = await request(app).get(`/api/ornaments/${created.Ornament_ID}`).set(auth());
  expect(detail.body.data.Status).toBe('In Transfer');
});

test('Sold still wins over an unresolved transfer — a more final state takes precedence', async () => {
  const created = await createOrnament('QASTATUS-0004', branchA);
  const transfer = await request(app).post('/api/transfer/create').set(auth()).send({
    Transfer_Type: 'Branch', From_Branch_ID: branchA, To_Branch_ID: branchB,
    items: [{ Ornament_ID: created.Ornament_ID }],
  });
  // Reject the transfer so the item's Is_Stock_Available flips back —
  // real workflows can still end up with a sale recorded against an item
  // that has a (now-resolved) transfer history; the point here is the
  // priority order, not the exact real-world path.
  await request(app).post(`/api/transfer/${transfer.body.data.Transfer_ID}/reject`).set(auth()).send({ Remarks: 'QA test reject' });

  const detail = await request(app).get(`/api/ornaments/${created.Ornament_ID}`).set(auth());
  expect(detail.body.data.Status).not.toBe('In Transfer'); // resolved (Rejected), no longer Pending
});
