/**
 * Multi-Branch Management — extends the Phase 1 branch context/enforcement
 * (already proven against ornaments/sales in multiBranch.test.js) to the
 * remaining core modules: Purchase, Karigar Issue, Repair, Approval Issue.
 * Confirms each one actually stamps Branch_ID from the active context and
 * filters its own list by it — the 403/forgery-resistance behavior itself
 * is shared middleware already covered once; this is about proving each
 * module's own insert/list wiring is correct.
 */
const request = require('supertest');
const { app } = require('../src/index');
const db = require('../src/db/knex');
const testTenant = require('./helpers/testTenant');

let tenant, token, typeId, karigarId, branchA, branchB;
const withBranchHeader = (branchId) => ({ Authorization: `Bearer ${token}`, ...(branchId ? { 'X-Branch-ID': branchId } : {}) });

beforeAll(async () => {
  tenant = await testTenant.setup();
  const login = await request(app).post('/api/auth/login').send({ username: tenant.username, password: tenant.password, tenantId: tenant.tenantId });
  token = login.body.data.token;
  typeId = (await db('tbl_item_type_master').first()).Type_ID;

  branchA = `${tenant.tenantId}_MODA`;
  branchB = `${tenant.tenantId}_MODB`;
  await db('tbl_branch_master').insert([
    { Branch_ID: branchA, Tenant_ID: tenant.tenantId, Branch_Name: 'QA Module Branch A', Branch_Code: 'MODA', Is_Active: true },
    { Branch_ID: branchB, Tenant_ID: tenant.tenantId, Branch_Name: 'QA Module Branch B', Branch_Code: 'MODB', Is_Active: true },
  ]);

  const karigar = await request(app).post('/api/karigar/vendor').set(withBranchHeader()).send({
    Vendor_Name: 'QA Multi-Branch Karigar', Vendor_Type: 'Karigar', Mobile_1: '9000000095',
  });
  karigarId = karigar.body.data.Vendor_ID;
});

afterAll(async () => {
  await db('tbl_branch_master').whereIn('Branch_ID', [branchA, branchB]).del();
  await testTenant.teardown();
  await db.destroy();
});

test('Purchase: creating under Branch A stamps both the purchase header and its auto-created stock with Branch_ID, and the list is isolated per branch', async () => {
  const res = await request(app).post('/api/purchase/create').set(withBranchHeader(branchA)).send({
    Total_Amount: 20000, Supplier_Name: 'QA Supplier',
    items: [{ Article_Number: 'QAMBM-PUR-001', Gross_Weight: 10, Purchase_Rate: 20000, Create_Inventory: true }],
  });
  expect(res.status).toBe(201);
  expect(res.body.data.Branch_ID).toBe(branchA);

  const stock = await db('tbl_ornament_master').where({ Article_Number: 'QAMBM-PUR-001' }).first();
  expect(stock.Branch_ID).toBe(branchA);

  const listA = await request(app).get('/api/purchase').set(withBranchHeader(branchA));
  expect(listA.body.data.items.some(p => p.Purchase_ID === res.body.data.Purchase_ID)).toBe(true);
  const listB = await request(app).get('/api/purchase').set(withBranchHeader(branchB));
  expect(listB.body.data.items.some(p => p.Purchase_ID === res.body.data.Purchase_ID)).toBe(false);
});

test('Karigar Issue: stamped with the active branch, and /issues is isolated per branch', async () => {
  const res = await request(app).post('/api/karigar/issue').set(withBranchHeader(branchA)).send({
    Karigar_ID: karigarId, Gold_Weight_Issued: 50, Gold_Rate_At_Issue: 6000, Issue_Date: new Date().toISOString().slice(0, 10),
  });
  expect(res.status).toBe(201);
  expect(res.body.data.Branch_ID).toBe(branchA);

  const listA = await request(app).get('/api/karigar/issues').set(withBranchHeader(branchA));
  expect(listA.body.data.items.some(i => i.Issue_ID === res.body.data.Issue_ID)).toBe(true);
  const listB = await request(app).get('/api/karigar/issues').set(withBranchHeader(branchB));
  expect(listB.body.data.items.some(i => i.Issue_ID === res.body.data.Issue_ID)).toBe(false);
});

test('Repair: stamped with the active branch, and the repair list is isolated per branch', async () => {
  const res = await request(app).post('/api/repair').set(withBranchHeader(branchB)).send({
    Item_Description: 'QA multi-branch repair item',
  });
  expect(res.status).toBe(201);
  expect(res.body.data.Branch_ID).toBe(branchB);

  const listB = await request(app).get('/api/repair').set(withBranchHeader(branchB));
  expect(listB.body.data.items.some(r => r.Repair_ID === res.body.data.Repair_ID)).toBe(true);
  const listA = await request(app).get('/api/repair').set(withBranchHeader(branchA));
  expect(listA.body.data.items.some(r => r.Repair_ID === res.body.data.Repair_ID)).toBe(false);
});

test('Approval Issue: stamped with the active branch, and /issues is isolated per branch', async () => {
  const ornament = await request(app).post('/api/ornaments').set(withBranchHeader(branchA)).send({
    Type_ID: typeId, Metal_Type: 'Gold', Gross_Weight: 5, Net_Gold_Weight: 4.5, Current_Gold_Rate: 6000,
    Base_Making_Charge_Per_Gram: 100, Purchase_Cost: 20000, Total_Price: 20000, Article_Number: 'QAMBM-APR-001',
  });

  const res = await request(app).post('/api/approval/issue').set(withBranchHeader(branchA)).send({
    Issue_Date: new Date().toISOString().slice(0, 10),
    items: [{ Ornament_ID: ornament.body.data.Ornament_ID }],
  });
  expect(res.status).toBe(201);
  expect(res.body.data.Branch_ID).toBe(branchA);

  const listA = await request(app).get('/api/approval/issues').set(withBranchHeader(branchA));
  expect(listA.body.data.items.some(i => i.Issue_ID === res.body.data.Issue_ID)).toBe(true);
  const listB = await request(app).get('/api/approval/issues').set(withBranchHeader(branchB));
  expect(listB.body.data.items.some(i => i.Issue_ID === res.body.data.Issue_ID)).toBe(false);
});
