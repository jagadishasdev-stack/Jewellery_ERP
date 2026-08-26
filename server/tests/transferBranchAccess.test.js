/**
 * Multi-Branch Management — branch-level authorization on the transfer
 * workflow (spec §14/26/28). A Branch-type transfer must be authorized
 * independently on both ends: the sender needs access to the source
 * branch, the receiver (whoever approves/rejects) needs access to the
 * destination branch. Also covers a real cross-tenant gap found while
 * making this fix: none of /approve, /reject, or GET /:id scoped their
 * lookup by Tenant_ID at all.
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

  branchA = `${tenant.tenantId}_TRA`;
  branchB = `${tenant.tenantId}_TRB`;
  await db('tbl_branch_master').insert([
    { Branch_ID: branchA, Tenant_ID: tenant.tenantId, Branch_Name: 'QA Transfer Branch A', Branch_Code: 'TRA', Is_Active: true },
    { Branch_ID: branchB, Tenant_ID: tenant.tenantId, Branch_Name: 'QA Transfer Branch B', Branch_Code: 'TRB', Is_Active: true },
  ]);

  // Restricted user — access to Branch A only, nothing else.
  const staffRole = await db('tbl_role_master').where({ Role_Name: 'Store Manager' }).first();
  const bcrypt = require('bcryptjs');
  const [staffUser] = await db('tbl_user_master').insert({
    Tenant_ID: tenant.tenantId, Username: 'qa_transfer_staff', Password_Hash: bcrypt.hashSync('QaTransfer@2026', 10), Password_Salt: 'x',
    Role_ID: staffRole.Role_ID, Full_Name: 'QA Transfer Staff', Is_Active: true, All_Branch_Access: false,
  }).returning('User_ID');
  restrictedUserId = staffUser.User_ID;
  await db('tbl_user_branch_access').insert({ User_ID: restrictedUserId, Tenant_ID: tenant.tenantId, Branch_ID: branchA, Created_By: 'test' });
  const staffLogin = await request(app).post('/api/auth/login').send({ username: 'qa_transfer_staff', password: 'QaTransfer@2026', tenantId: tenant.tenantId });
  restrictedToken = staffLogin.body.data.token;
});

afterAll(async () => {
  await db('tbl_user_branch_access').where({ Tenant_ID: tenant.tenantId }).del();
  await db('tbl_user_master').where({ User_ID: restrictedUserId }).del();
  await db('tbl_branch_master').whereIn('Branch_ID', [branchA, branchB]).del();
  await testTenant.teardown();
  await db.destroy();
});

async function createOrnament(overrides = {}) {
  const res = await request(app).post('/api/ornaments').set(authAs(adminToken)).send({
    Type_ID: typeId, Metal_Type: 'Gold', Gross_Weight: 5, Net_Gold_Weight: 4.5, Current_Gold_Rate: 6000,
    Base_Making_Charge_Per_Gram: 100, Purchase_Cost: 20000, Total_Price: 20000, ...overrides,
  });
  return res.body.data;
}

test('creating a Branch transfer OUT of a branch the caller has no access to is rejected (403), before touching the DB', async () => {
  const ornament = await createOrnament({ Article_Number: 'QATR-DENY-001', Branch_ID: branchB });
  const res = await request(app).post('/api/transfer/create').set(authAs(restrictedToken)).send({
    Transfer_Type: 'Branch', From_Branch_ID: branchB, To_Branch_ID: branchA,
    items: [{ Ornament_ID: ornament.Ornament_ID, Article_Number: ornament.Article_Number, Gross_Weight: 5 }],
  });
  expect(res.status).toBe(403);

  const row = await db('tbl_stock_transfer').where({ Tenant_ID: tenant.tenantId, From_Branch_ID: branchB, To_Branch_ID: branchA }).first();
  expect(row).toBeUndefined(); // nothing created at all
});

test('creating a Branch transfer from a branch the caller DOES have access to succeeds', async () => {
  const ornament = await createOrnament({ Article_Number: 'QATR-ALLOW-001', Branch_ID: branchA });
  const res = await request(app).post('/api/transfer/create').set(authAs(restrictedToken)).send({
    Transfer_Type: 'Branch', From_Branch_ID: branchA, To_Branch_ID: branchB,
    items: [{ Ornament_ID: ornament.Ornament_ID, Article_Number: ornament.Article_Number, Gross_Weight: 5 }],
  });
  expect(res.status).toBe(201);
});

test('approving a transfer requires access to the DESTINATION branch, independent of who created it', async () => {
  const ornament = await createOrnament({ Article_Number: 'QATR-APPROVE-001', Branch_ID: branchB });
  // Admin (all-branch access) creates a transfer FROM B TO A.
  const created = await request(app).post('/api/transfer/create').set(authAs(adminToken)).send({
    Transfer_Type: 'Branch', From_Branch_ID: branchB, To_Branch_ID: branchA,
    items: [{ Ornament_ID: ornament.Ornament_ID, Article_Number: ornament.Article_Number, Gross_Weight: 5 }],
  });
  expect(created.status).toBe(201);

  // Restricted user (Branch A access) CAN approve it — they're the receiving branch.
  const approve = await request(app).post(`/api/transfer/${created.body.data.Transfer_ID}/approve`).set(authAs(restrictedToken)).send({});
  expect(approve.status).toBe(200);

  const moved = await db('tbl_ornament_master').where({ Ornament_ID: ornament.Ornament_ID }).first();
  expect(moved.Branch_ID).toBe(branchA);
});

test('approving a transfer INTO a branch the caller has no access to is rejected (403)', async () => {
  const ornament = await createOrnament({ Article_Number: 'QATR-APPROVE-DENY-001', Branch_ID: branchA });
  const created = await request(app).post('/api/transfer/create').set(authAs(adminToken)).send({
    Transfer_Type: 'Branch', From_Branch_ID: branchA, To_Branch_ID: branchB,
    items: [{ Ornament_ID: ornament.Ornament_ID, Article_Number: ornament.Article_Number, Gross_Weight: 5 }],
  });
  expect(created.status).toBe(201);

  // Restricted user has NO access to Branch B (the destination) — cannot approve.
  const approve = await request(app).post(`/api/transfer/${created.body.data.Transfer_ID}/approve`).set(authAs(restrictedToken)).send({});
  expect(approve.status).toBe(403);

  const unmoved = await db('tbl_ornament_master').where({ Ornament_ID: ornament.Ornament_ID }).first();
  expect(unmoved.Branch_ID).toBe(branchA); // never moved
});

test('rejecting a transfer also requires destination-branch access', async () => {
  const ornament = await createOrnament({ Article_Number: 'QATR-REJECT-001', Branch_ID: branchA });
  const created = await request(app).post('/api/transfer/create').set(authAs(adminToken)).send({
    Transfer_Type: 'Branch', From_Branch_ID: branchA, To_Branch_ID: branchB,
    items: [{ Ornament_ID: ornament.Ornament_ID, Article_Number: ornament.Article_Number, Gross_Weight: 5 }],
  });

  const deny = await request(app).post(`/api/transfer/${created.body.data.Transfer_ID}/reject`).set(authAs(restrictedToken)).send({});
  expect(deny.status).toBe(403);

  const reject = await request(app).post(`/api/transfer/${created.body.data.Transfer_ID}/reject`).set(authAs(adminToken)).send({});
  expect(reject.status).toBe(200);
});

test('CRITICAL (cross-tenant): this tenant cannot view/approve/reject a REAL OTHER tenant\'s transfer by guessing its ID', async () => {
  // Same real-cross-tenant-record pattern already established elsewhere in
  // this suite (see hiddenStockSales.test.js) — uses DLJ, a real other
  // tenant, read-only, to prove the fix rather than a synthetic stand-in.
  const dljTransfer = await db('tbl_stock_transfer').where({ Tenant_ID: 'DLJ' }).first();
  if (!dljTransfer) return; // nothing to check against in this environment

  const view = await request(app).get(`/api/transfer/${dljTransfer.Transfer_ID}`).set(authAs(adminToken));
  expect(view.status).toBe(404);

  const approve = await request(app).post(`/api/transfer/${dljTransfer.Transfer_ID}/approve`).set(authAs(adminToken)).send({});
  expect(approve.status).toBe(404);

  const reject = await request(app).post(`/api/transfer/${dljTransfer.Transfer_ID}/reject`).set(authAs(adminToken)).send({});
  expect(reject.status).toBe(404);

  // And confirm it's genuinely untouched, not silently 404'd after mutating.
  const stillThere = await db('tbl_stock_transfer').where({ Transfer_ID: dljTransfer.Transfer_ID }).first();
  expect(stillThere.Status).toBe(dljTransfer.Status);
});
