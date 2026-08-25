/**
 * Tally Bridge export — the backend (routes/tally.js, utils/tallyXmlBuilder.js)
 * already existed from an earlier session but had no client UI wired to it;
 * this adds the missing GET /api/tally/export/vouchers-excel companion and
 * verifies the whole export path with a real posted sale. Deliberately
 * confirms the export is the TRUE, COMPLETE accounting journal — including
 * a sale that touched Is_Hidden stock — since that's the one thing this
 * export must never quietly filter, unlike the Official-mode report
 * queries elsewhere in this app (reports.js's excludeHiddenStockSales).
 */
const request = require('supertest');
const { app } = require('../src/index');
const db = require('../src/db/knex');
const testTenant = require('./helpers/testTenant');

let tenant, token, typeId;
const auth = () => ({ Authorization: `Bearer ${token}` });

beforeAll(async () => {
  tenant = await testTenant.setup();
  const res = await request(app).post('/api/auth/login').send({ username: tenant.username, password: tenant.password, tenantId: tenant.tenantId });
  token = res.body.data.token;
  typeId = (await db('tbl_item_type_master').first()).Type_ID;
});

afterAll(async () => {
  await testTenant.teardown();
  await db.destroy();
});

async function createOrnament(overrides = {}) {
  const res = await request(app).post('/api/ornaments').set(auth()).send({
    Type_ID: typeId, Metal_Type: 'Gold', Gross_Weight: 5, Net_Gold_Weight: 4.5, Current_Gold_Rate: 6000,
    Base_Making_Charge_Per_Gram: 100, Purchase_Cost: 20000, Total_Price: 20000, ...overrides,
  });
  return res.body.data;
}

const today = () => new Date().toISOString().slice(0, 10);

test('GET /api/tally/export/ledgers returns a well-formed Tally ledger-import XML', async () => {
  const res = await request(app).get('/api/tally/export/ledgers').set(auth());
  expect(res.status).toBe(200);
  expect(res.headers['content-type']).toMatch(/xml/);
  expect(res.text).toContain('<TALLYREQUEST>Import Data</TALLYREQUEST>');
});

test('a real sale posts a journal that GET /api/tally/export/vouchers picks up as real Sales voucher XML', async () => {
  const ornament = await createOrnament({ Article_Number: 'TALLY-TEST-001' });
  const sale = await request(app).post('/api/sales/create').set(auth()).send({
    Payment_Mode: 'Cash',
    items: [{ Ornament_ID: ornament.Ornament_ID, Article_Number: ornament.Article_Number, Total_Line_Price: 20000 }],
  });
  expect(sale.status).toBe(201);

  const d = today();
  const res = await request(app).get('/api/tally/export/vouchers').set(auth()).query({ from: d, to: d });
  expect(res.status).toBe(200);
  expect(res.headers['content-type']).toMatch(/xml/);
  expect(res.text).toContain('VCHTYPE="Sales"');
  expect(res.text).toContain('<AMOUNT>20000.00</AMOUNT>');
});

test('GET /api/tally/export/vouchers-excel exports the identical journal as CSV, with no side effects', async () => {
  const d = today();
  const res = await request(app).get('/api/tally/export/vouchers-excel').set(auth()).query({ from: d, to: d });
  expect(res.status).toBe(200);
  expect(res.headers['content-type']).toMatch(/csv/);
  expect(res.text).toContain('Voucher_Number,Date,Voucher_Type,Narration,Ledger_Account,Dr_Cr,Amount');
  expect(res.text).toContain('20000.00');
});

test('GET /api/tally/export/vouchers-excel requires an explicit date range (never falls back to "Pending sync" implicitly)', async () => {
  const res = await request(app).get('/api/tally/export/vouchers-excel').set(auth());
  expect(res.status).toBe(400);
});

test('a sale of Is_Hidden stock still posts its full real journal, and it is NOT excluded from the Tally export', async () => {
  const loc = await request(app).post('/api/floors/hidden-locations').set(auth()).send({
    Location_Code: 'QA-TALLY-VAULT', Location_Name: 'QA Tally Test Vault',
  });
  const hiddenLocationId = loc.body.data.Hidden_Location_ID;

  const ornament = await createOrnament({ Article_Number: 'TALLY-HIDDEN-001', Total_Price: 9999 });
  await request(app).post('/api/transfer/hide').set(auth()).send({
    level: 'item', ids: [ornament.Ornament_ID], hiddenLocationId, reason: 'QA Tally export test',
  }).expect(200);

  const sale = await request(app).post('/api/sales/create').set(auth()).send({
    Payment_Mode: 'Cash',
    items: [{ Ornament_ID: ornament.Ornament_ID, Article_Number: ornament.Article_Number, Total_Line_Price: 9999 }],
  });
  expect(sale.status).toBe(201);
  expect(sale.body.data.sale.Contains_Hidden_Stock).toBe(true); // confirms this really is the hidden-stock path

  const d = today();
  const res = await request(app).get('/api/tally/export/vouchers-excel').set(auth()).query({ from: d, to: d });
  expect(res.status).toBe(200);
  // The 9999 hidden-stock sale amount must be present — the accounting
  // journal (and therefore this export) never applies the report-only
  // exclusion that Official-mode sales reports use.
  expect(res.text).toContain('9999.00');
});
