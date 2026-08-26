/**
 * GET /api/reports/branch-performance — the All-Branches consolidated
 * dashboard (spec §9-11, 32-33). Confirms: gated to users who can
 * actually see more than one branch, per-branch numbers are real (not
 * placeholders), the combined total actually reconciles to the sum of
 * the branches, and ranking reflects real data.
 */
const request = require('supertest');
const { app } = require('../src/index');
const db = require('../src/db/knex');
const testTenant = require('./helpers/testTenant');

let tenant, adminToken, restrictedToken, restrictedUserId, branchA, branchB, typeId;
const authAs = (token) => ({ Authorization: `Bearer ${token}` });

beforeAll(async () => {
  tenant = await testTenant.setup();
  const login = await request(app).post('/api/auth/login').send({ username: tenant.username, password: tenant.password, tenantId: tenant.tenantId });
  adminToken = login.body.data.token;
  typeId = (await db('tbl_item_type_master').first()).Type_ID;

  branchA = `${tenant.tenantId}_BPA`;
  branchB = `${tenant.tenantId}_BPB`;
  await db('tbl_branch_master').insert([
    { Branch_ID: branchA, Tenant_ID: tenant.tenantId, Branch_Name: 'QA Perf Branch A', Branch_Code: 'BPA', Is_Active: true },
    { Branch_ID: branchB, Tenant_ID: tenant.tenantId, Branch_Name: 'QA Perf Branch B', Branch_Code: 'BPB', Is_Active: true },
  ]);

  const staffRole = await db('tbl_role_master').where({ Role_Name: 'Store Manager' }).first();
  const bcrypt = require('bcryptjs');
  const [staffUser] = await db('tbl_user_master').insert({
    Tenant_ID: tenant.tenantId, Username: 'qa_perf_staff', Password_Hash: bcrypt.hashSync('QaPerf@2026', 10), Password_Salt: 'x',
    Role_ID: staffRole.Role_ID, Full_Name: 'QA Perf Staff', Is_Active: true, All_Branch_Access: false,
  }).returning('User_ID');
  restrictedUserId = staffUser.User_ID;
  await db('tbl_user_branch_access').insert({ User_ID: restrictedUserId, Tenant_ID: tenant.tenantId, Branch_ID: branchA, Created_By: 'test' });
  const staffLogin = await request(app).post('/api/auth/login').send({ username: 'qa_perf_staff', password: 'QaPerf@2026', tenantId: tenant.tenantId });
  restrictedToken = staffLogin.body.data.token;

  // Real data: a sale in each branch today.
  async function sellOneItem(branchId, price, articleNumber) {
    const ornament = await request(app).post('/api/ornaments').set(authAs(adminToken)).set('X-Branch-ID', branchId).send({
      Type_ID: typeId, Metal_Type: 'Gold', Gross_Weight: 5, Net_Gold_Weight: 4.5, Current_Gold_Rate: 6000,
      Base_Making_Charge_Per_Gram: 100, Purchase_Cost: price, Total_Price: price, Article_Number: articleNumber,
    });
    await request(app).post('/api/sales/create').set(authAs(adminToken)).set('X-Branch-ID', branchId).send({
      Payment_Mode: 'Cash',
      items: [{ Ornament_ID: ornament.body.data.Ornament_ID, Article_Number: articleNumber, Total_Line_Price: price }],
    });
  }
  await sellOneItem(branchA, 50000, 'QABP-SOLD-A');
  await sellOneItem(branchB, 30000, 'QABP-SOLD-B');
  // Unsold stock left in each branch too.
  await request(app).post('/api/ornaments').set(authAs(adminToken)).set('X-Branch-ID', branchA).send({
    Type_ID: typeId, Metal_Type: 'Gold', Gross_Weight: 10, Net_Gold_Weight: 9, Current_Gold_Rate: 6000,
    Base_Making_Charge_Per_Gram: 100, Purchase_Cost: 60000, Total_Price: 60000, Article_Number: 'QABP-STOCK-A',
  });
});

afterAll(async () => {
  await db('tbl_user_branch_access').where({ Tenant_ID: tenant.tenantId }).del();
  await db('tbl_user_master').where({ User_ID: restrictedUserId }).del();
  await db('tbl_branch_master').whereIn('Branch_ID', [branchA, branchB]).del();
  await testTenant.teardown();
  await db.destroy();
});

test('a restricted user with access to only one branch is denied the comparison view', async () => {
  const res = await request(app).get('/api/reports/branch-performance').set(authAs(restrictedToken));
  expect(res.status).toBe(403);
});

test('an all-branch-access user gets real per-branch numbers, a reconciling combined total, and real ranking', async () => {
  const res = await request(app).get('/api/reports/branch-performance').set(authAs(adminToken));
  expect(res.status).toBe(200);

  const rowA = res.body.data.branches.find(b => b.Branch_ID === branchA);
  const rowB = res.body.data.branches.find(b => b.Branch_ID === branchB);
  expect(rowA.today_sales).toBeCloseTo(50000, 1);
  expect(rowB.today_sales).toBeCloseTo(30000, 1);
  expect(rowA.stock_pieces).toBeGreaterThanOrEqual(1); // the unsold item

  // Combined must reconcile — not a separately-computed, possibly-wrong number.
  const sumTodaySales = res.body.data.branches.reduce((s, b) => s + b.today_sales, 0);
  expect(res.body.data.combined.today_sales).toBeCloseTo(sumTodaySales, 1);

  // Branch A sold more today — it should rank #1.
  expect(res.body.data.ranking.byTodaySales[0].Branch_Name).toBe('QA Perf Branch A');
  expect(res.body.data.highest).toBe('QA Perf Branch A');
});
