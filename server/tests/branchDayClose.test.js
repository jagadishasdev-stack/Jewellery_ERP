/**
 * Multi-Branch Management §25/26 — Branch Day Close. tbl_day_close's
 * schema already had Branch_ID + a real (Tenant_ID, Branch_ID, Close_Date)
 * unique index; the route just never used it, so every branch silently
 * shared one tenant-wide "today" record. Confirms: each branch gets its
 * own independent Open/Closed record and its own totals, closing one
 * branch never closes another, and "All Branches" can't be closed as a
 * single ambiguous action.
 */
const request = require('supertest');
const { app } = require('../src/index');
const db = require('../src/db/knex');
const testTenant = require('./helpers/testTenant');

let tenant, token, typeId, branchA, branchB;
const authAs = (branchId) => ({ Authorization: `Bearer ${token}`, ...(branchId ? { 'X-Branch-ID': branchId } : {}) });

beforeAll(async () => {
  tenant = await testTenant.setup();
  const login = await request(app).post('/api/auth/login').send({ username: tenant.username, password: tenant.password, tenantId: tenant.tenantId });
  token = login.body.data.token;
  typeId = (await db('tbl_item_type_master').first()).Type_ID;

  branchA = `${tenant.tenantId}_DCA`;
  branchB = `${tenant.tenantId}_DCB`;
  await db('tbl_branch_master').insert([
    { Branch_ID: branchA, Tenant_ID: tenant.tenantId, Branch_Name: 'QA Day Close Branch A', Branch_Code: 'DCA', Is_Active: true },
    { Branch_ID: branchB, Tenant_ID: tenant.tenantId, Branch_Name: 'QA Day Close Branch B', Branch_Code: 'DCB', Is_Active: true },
  ]);

  async function sellOneItem(branchId, price, articleNumber) {
    const ornament = await request(app).post('/api/ornaments').set(authAs(branchId)).send({
      Type_ID: typeId, Metal_Type: 'Gold', Gross_Weight: 5, Net_Gold_Weight: 4.5, Current_Gold_Rate: 6000,
      Base_Making_Charge_Per_Gram: 100, Purchase_Cost: price, Total_Price: price, Article_Number: articleNumber,
    });
    await request(app).post('/api/sales/create').set(authAs(branchId)).send({
      Payment_Mode: 'Cash',
      items: [{ Ornament_ID: ornament.body.data.Ornament_ID, Article_Number: articleNumber, Total_Line_Price: price }],
    });
  }
  await sellOneItem(branchA, 40000, 'QADC-A1');
  await sellOneItem(branchB, 25000, 'QADC-B1');
});

afterAll(async () => {
  await db('tbl_day_close').whereIn('Branch_ID', [branchA, branchB]).del();
  await db('tbl_branch_master').whereIn('Branch_ID', [branchA, branchB]).del();
  await testTenant.teardown();
  await db.destroy();
});

test('GET /today auto-creates a SEPARATE record per branch, each with its own branch\'s real cash-sales total', async () => {
  const todayA = await request(app).get('/api/day-close/today').set(authAs(branchA));
  const todayB = await request(app).get('/api/day-close/today').set(authAs(branchB));

  expect(todayA.body.data.Branch_ID).toBe(branchA);
  expect(todayB.body.data.Branch_ID).toBe(branchB);
  expect(todayA.body.data.Close_ID).not.toBe(todayB.body.data.Close_ID);
  expect(parseFloat(todayA.body.data.Cash_Sales)).toBeCloseTo(40000, 1);
  expect(parseFloat(todayB.body.data.Cash_Sales)).toBeCloseTo(25000, 1);
});

test('closing Branch A does not close or affect Branch B\'s record', async () => {
  const close = await request(app).post('/api/day-close/close').set(authAs(branchA)).send({
    verified_cash: 40000, cash_expenses: 500,
  });
  expect(close.status).toBe(200);
  expect(close.body.data.Status).toBe('Closed');
  expect(close.body.data.Branch_ID).toBe(branchA);

  const stillOpenB = await request(app).get('/api/day-close/today').set(authAs(branchB));
  expect(stillOpenB.body.data.Status).toBe('Open');
});

test('"All Branches" cannot be closed as one action', async () => {
  const res = await request(app).post('/api/day-close/close').set(authAs('ALL')).send({ verified_cash: 1000 });
  expect(res.status).toBe(400);
});

test('GET /history for one branch never includes another branch\'s closed record', async () => {
  const historyA = await request(app).get('/api/day-close/history').set(authAs(branchA));
  const historyB = await request(app).get('/api/day-close/history').set(authAs(branchB));

  expect(historyA.body.data.some(r => r.Branch_ID === branchA && r.Status === 'Closed')).toBe(true);
  expect(historyB.body.data.some(r => r.Branch_ID === branchA)).toBe(false);
});
