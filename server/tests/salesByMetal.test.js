/**
 * GET /api/reports/sales-by-metal — metal-type segmentation existed only on
 * the STOCK side (inventory-value's byMetal); nothing showed how much
 * Gold vs Silver vs Platinum actually SOLD in a date range. Joins each
 * sale line back to its ornament for Metal_Type, grouping a line with no
 * resolvable ornament under 'Unknown' rather than dropping it.
 */
const request = require('supertest');
const dayjs = require('dayjs');
const { app } = require('../src/index');
const db = require('../src/db/knex');
const testTenant = require('./helpers/testTenant');

let tenant, token, typeId;
const auth = () => ({ Authorization: `Bearer ${token}` });
const today = dayjs().format('YYYY-MM-DD');

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

async function createOrnament(metalType, overrides = {}) {
  const res = await request(app).post('/api/ornaments').set(auth()).send({
    Type_ID: typeId, Metal_Type: metalType, Gross_Weight: 10, Net_Gold_Weight: 9,
    Current_Gold_Rate: 6000, Base_Making_Charge_Per_Gram: 100,
    Purchase_Cost: 50000, Total_Price: 60000, ...overrides,
  });
  expect(res.status).toBe(201);
  return res.body.data;
}

async function sellOrnament(ornament, price) {
  const res = await request(app).post('/api/sales/create').set(auth()).send({
    Payment_Mode: 'Cash',
    items: [{ Ornament_ID: ornament.Ornament_ID, Article_Number: ornament.Article_Number, Gross_Weight: ornament.Gross_Weight, Total_Line_Price: price }],
  });
  expect(res.status).toBe(201);
  return res.body.data;
}

test('requires fromDate and toDate', async () => {
  const res = await request(app).get('/api/reports/sales-by-metal').set(auth());
  expect(res.status).toBe(400);
});

test('groups sold lines by the ornament Metal_Type and totals match overall', async () => {
  const gold1 = await createOrnament('Gold');
  const gold2 = await createOrnament('Gold');
  const silver1 = await createOrnament('Silver');

  await sellOrnament(gold1, 60000);
  await sellOrnament(gold2, 65000);
  await sellOrnament(silver1, 8000);

  const res = await request(app)
    .get('/api/reports/sales-by-metal')
    .query({ fromDate: today, toDate: today })
    .set(auth());
  expect(res.status).toBe(200);

  const { byMetal, overall } = res.body.data;
  const goldRow = byMetal.find((r) => r.Metal_Type === 'Gold');
  const silverRow = byMetal.find((r) => r.Metal_Type === 'Silver');

  expect(goldRow).toBeTruthy();
  expect(silverRow).toBeTruthy();
  expect(parseInt(goldRow.pieces_sold, 10)).toBe(2);
  expect(parseFloat(goldRow.total_revenue)).toBeCloseTo(125000, 2);
  expect(parseInt(silverRow.pieces_sold, 10)).toBe(1);
  expect(parseFloat(silverRow.total_revenue)).toBeCloseTo(8000, 2);

  // overall must be at least the sum of what this test itself created —
  // other tests in the suite may add more same-day sales for this tenant.
  const byMetalRevenueSum = byMetal.reduce((s, r) => s + parseFloat(r.total_revenue), 0);
  expect(parseFloat(overall.total_revenue)).toBeCloseTo(byMetalRevenueSum, 2);
  const byMetalPiecesSum = byMetal.reduce((s, r) => s + parseInt(r.pieces_sold, 10), 0);
  expect(parseInt(overall.pieces_sold, 10)).toBe(byMetalPiecesSum);
});

test('a date range with no sales returns empty breakdown, not an error', async () => {
  const farFuture = dayjs().add(5, 'year').format('YYYY-MM-DD');
  const res = await request(app)
    .get('/api/reports/sales-by-metal')
    .query({ fromDate: farFuture, toDate: farFuture })
    .set(auth());
  expect(res.status).toBe(200);
  expect(res.body.data.byMetal).toEqual([]);
});
