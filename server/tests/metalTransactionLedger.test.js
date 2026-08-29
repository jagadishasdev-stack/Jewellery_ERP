/**
 * Metal Transaction ledger — a real opening/addition/issue/receipt/
 * conversion/closing running balance per metal type. Previously only
 * existed as Pure Gold Bin's single-entry holding record with a status
 * flag (Holding -> Disposed), no running balance at all (Missing Feature
 * Report, Transaction Menu spec).
 */
const request = require('supertest');
const { app } = require('../src/index');
const db = require('../src/db/knex');
const testTenant = require('./helpers/testTenant');

let tenant, token;
const auth = () => ({ Authorization: `Bearer ${token}` });
// A metal type unlikely to collide with any other test file's activity
// against the shared QATEST tenant, so balance-delta assertions here
// stay meaningful even though the ledger itself is tenant-wide.
const METAL = 'Platinum';

beforeAll(async () => {
  tenant = await testTenant.setup();
  const res = await request(app).post('/api/auth/login').send({ username: tenant.username, password: tenant.password, tenantId: tenant.tenantId });
  token = res.body.data.token;
});

afterAll(async () => {
  await db('tbl_metal_transaction_ledger').where({ Tenant_ID: tenant.tenantId }).del();
  await db('tbl_bin_pure_gold').where({ Tenant_ID: tenant.tenantId }).del();
  await testTenant.teardown();
  await db.destroy();
});

test('Addition increases the running balance; Issue decreases it', async () => {
  const add = await request(app).post('/api/metal-ledger').set(auth()).send({ Transaction_Type: 'Addition', Weight: 100, Metal_Type: METAL });
  expect(add.status).toBe(201);
  const balanceAfterAdd = parseFloat(add.body.data.Balance_After);

  const issue = await request(app).post('/api/metal-ledger').set(auth()).send({ Transaction_Type: 'Issue', Weight: 30, Metal_Type: METAL });
  expect(issue.status).toBe(201);
  expect(parseFloat(issue.body.data.Weight_Change)).toBe(-30); // sign derived from type, not entered directly
  expect(parseFloat(issue.body.data.Balance_After)).toBeCloseTo(balanceAfterAdd - 30, 2);
});

test('GET /balance reflects the latest running total, not a re-summed total', async () => {
  const res = await request(app).get('/api/metal-ledger/balance').set(auth());
  expect(res.status).toBe(200);
  const row = res.body.data.find((r) => r.Metal_Type === METAL);
  expect(row).toBeDefined();
  expect(parseFloat(row.Current_Balance)).toBeCloseTo(70, 2); // 100 - 30 from the test above
});

test('rejects a zero/negative weight — direction always comes from Transaction_Type', async () => {
  const res = await request(app).post('/api/metal-ledger').set(auth()).send({ Transaction_Type: 'Addition', Weight: -5, Metal_Type: METAL });
  expect(res.status).toBe(422);
});

test('Pure Gold Bin creation posts a real Addition to the ledger in the same transaction', async () => {
  const before = await request(app).get('/api/metal-ledger/balance').set(auth());
  const beforeGold = parseFloat(before.body.data.find((r) => r.Metal_Type === 'Gold')?.Current_Balance || 0);

  const create = await request(app).post('/api/bin/pure-gold').set(auth()).send({
    Supplier_Name: 'QA Ledger Supplier', Purchase_Date: '2026-08-29', Gross_Weight: 20, Net_Weight: 19.5, Purchase_Amount: 120000,
  });
  expect(create.status).toBe(201);

  const after = await request(app).get('/api/metal-ledger/balance').set(auth());
  const afterGold = parseFloat(after.body.data.find((r) => r.Metal_Type === 'Gold').Current_Balance);
  expect(afterGold).toBeCloseTo(beforeGold + 19.5, 2);

  const entry = await db('tbl_metal_transaction_ledger').where({ Tenant_ID: tenant.tenantId, Reference_Type: 'PURE_GOLD_BIN', Reference_ID: create.body.data.Gold_ID }).first();
  expect(entry).toBeDefined();
  expect(entry.Transaction_Type).toBe('Addition');

  // Disposing it posts a matching Issue, bringing the balance back down.
  const dispose = await request(app).post(`/api/bin/pure-gold/${create.body.data.Gold_ID}/dispose`).set(auth()).send({ method: 'Direct_Sale' });
  expect(dispose.status).toBe(200);
  const afterDispose = await request(app).get('/api/metal-ledger/balance').set(auth());
  const goldAfterDispose = parseFloat(afterDispose.body.data.find((r) => r.Metal_Type === 'Gold').Current_Balance);
  expect(goldAfterDispose).toBeCloseTo(beforeGold, 2);
});
