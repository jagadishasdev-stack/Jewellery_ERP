/**
 * Multi-Branch Management — Phase 1 foundation. Confirms the actual
 * enforcement, not just that the header gets parsed:
 *  - a user with no branch grants cannot use a branch (or 'ALL') they
 *    weren't given, even if they simply type a different X-Branch-ID
 *    header (the spec's own §30 example — "manually modify an API
 *    request")
 *  - a Client Admin (All_Branch_Access=true by default) can use any
 *    branch AND 'ALL'
 *  - a request with NO X-Branch-ID header at all still works exactly as
 *    before this feature existed (the safe, non-breaking rollout default)
 *  - data actually gets isolated: creating stock/sales under one branch
 *    context and listing under another shows none of it
 */
const request = require('supertest');
const { app } = require('../src/index');
const db = require('../src/db/knex');
const testTenant = require('./helpers/testTenant');

let tenant, adminToken, staffToken, staffUserId, branchA, branchB, typeId;
const authAs = (token) => ({ Authorization: `Bearer ${token}` });
const withBranchHeader = (token, branchId) => ({ Authorization: `Bearer ${token}`, ...(branchId ? { 'X-Branch-ID': branchId } : {}) });

beforeAll(async () => {
  tenant = await testTenant.setup();
  const login = await request(app).post('/api/auth/login').send({ username: tenant.username, password: tenant.password, tenantId: tenant.tenantId });
  adminToken = login.body.data.token;
  typeId = (await db('tbl_item_type_master').first()).Type_ID;

  branchA = `${tenant.tenantId}_BR_A`;
  branchB = `${tenant.tenantId}_BR_B`;
  await db('tbl_branch_master').insert([
    { Branch_ID: branchA, Tenant_ID: tenant.tenantId, Branch_Name: 'QA Branch A', Branch_Code: 'BRA', Is_Active: true },
    { Branch_ID: branchB, Tenant_ID: tenant.tenantId, Branch_Name: 'QA Branch B', Branch_Code: 'BRB', Is_Active: true },
  ]);

  // A restricted staff user — Billing Operator role, no All_Branch_Access,
  // explicitly granted ONLY Branch A.
  const staffRole = await db('tbl_role_master').where({ Role_Name: 'Billing Operator' }).first();
  const [staffUser] = await db('tbl_user_master').insert({
    Tenant_ID: tenant.tenantId, Username: 'qa_branch_staff', Password_Hash: 'x', Password_Salt: 'x',
    Role_ID: staffRole.Role_ID, Full_Name: 'QA Branch Staff', Is_Active: true, All_Branch_Access: false,
  }).returning('User_ID');
  staffUserId = staffUser.User_ID;
  await db('tbl_user_branch_access').insert({ User_ID: staffUserId, Tenant_ID: tenant.tenantId, Branch_ID: branchA, Created_By: 'test' });

  // Log the staff user in for real, so requireValidBranch sees a genuine
  // JWT/roleName/permissions combo, not a hand-built fixture.
  await db('tbl_user_master').where({ User_ID: staffUserId }).update({
    Password_Hash: require('bcryptjs').hashSync('QaStaff@2026', 10),
  });
  const staffLogin = await request(app).post('/api/auth/login').send({ username: 'qa_branch_staff', password: 'QaStaff@2026', tenantId: tenant.tenantId });
  staffToken = staffLogin.body.data.token;
});

afterAll(async () => {
  await db('tbl_user_branch_access').where({ Tenant_ID: tenant.tenantId }).del();
  await db('tbl_user_master').where({ User_ID: staffUserId }).del();
  await db('tbl_branch_master').whereIn('Branch_ID', [branchA, branchB]).del();
  await testTenant.teardown();
  await db.destroy();
});

async function createOrnament(token, branchHeader, overrides = {}) {
  return request(app).post('/api/ornaments').set(withBranchHeader(token, branchHeader)).send({
    Type_ID: typeId, Metal_Type: 'Gold', Gross_Weight: 5, Net_Gold_Weight: 4.5, Current_Gold_Rate: 6000,
    Base_Making_Charge_Per_Gram: 100, Purchase_Cost: 20000, Total_Price: 20000, ...overrides,
  });
}

test('GET /api/branches/my-access reflects real access — Client Admin sees all, restricted staff sees only their grant', async () => {
  const admin = await request(app).get('/api/branches/my-access').set(authAs(adminToken));
  expect(admin.status).toBe(200);
  expect(admin.body.data.allBranches).toBe(true);

  const staff = await request(app).get('/api/branches/my-access').set(authAs(staffToken));
  expect(staff.status).toBe(200);
  expect(staff.body.data.allBranches).toBe(false);
  expect(staff.body.data.branches.map(b => b.Branch_ID)).toEqual([branchA]);
});

test('a request with no X-Branch-ID header at all behaves exactly as before this feature existed', async () => {
  const res = await createOrnament(staffToken, null, { Article_Number: 'QAMB-NOHEADER-001' });
  expect(res.status).toBe(201);
  const row = await db('tbl_ornament_master').where({ Article_Number: 'QAMB-NOHEADER-001' }).first();
  expect(row.Branch_ID).toBeNull(); // no context, no body field — legacy null, not forced onto any branch
});

test('CRITICAL: a restricted staff user cannot use a branch they were never granted — not even by hand-typing a different header', async () => {
  const res = await createOrnament(staffToken, branchB, { Article_Number: 'QAMB-FORBIDDEN-001' });
  expect(res.status).toBe(403);
  const row = await db('tbl_ornament_master').where({ Article_Number: 'QAMB-FORBIDDEN-001' }).first();
  expect(row).toBeUndefined(); // never created at all
});

test('a restricted staff user CAN use the branch they were actually granted', async () => {
  const res = await createOrnament(staffToken, branchA, { Article_Number: 'QAMB-ALLOWED-001' });
  expect(res.status).toBe(201);
  expect(res.body.data.Branch_ID).toBe(branchA);
});

test('a restricted staff user cannot request ALL BRANCHES either', async () => {
  const res = await request(app).get('/api/ornaments').set(withBranchHeader(staffToken, 'ALL'));
  expect(res.status).toBe(403);
});

test('a Client Admin (All_Branch_Access=true) can use ANY branch, including ones with no explicit grant row', async () => {
  const res = await createOrnament(adminToken, branchB, { Article_Number: 'QAMB-ADMIN-B-001' });
  expect(res.status).toBe(201);
  expect(res.body.data.Branch_ID).toBe(branchB);
});

test('a Client Admin can request ALL BRANCHES', async () => {
  const res = await request(app).get('/api/ornaments').set(withBranchHeader(adminToken, 'ALL'));
  expect(res.status).toBe(200);
});

test('DATA ISOLATION: stock created under Branch A does not show up when listing under Branch B', async () => {
  await createOrnament(adminToken, branchA, { Article_Number: 'QAMB-ISOLATE-A' });
  await createOrnament(adminToken, branchB, { Article_Number: 'QAMB-ISOLATE-B' });

  const listA = await request(app).get('/api/ornaments').set(withBranchHeader(adminToken, branchA)).query({ limit: 500 });
  expect(listA.body.data.items.some(i => i.Article_Number === 'QAMB-ISOLATE-A')).toBe(true);
  expect(listA.body.data.items.some(i => i.Article_Number === 'QAMB-ISOLATE-B')).toBe(false);

  const listB = await request(app).get('/api/ornaments').set(withBranchHeader(adminToken, branchB)).query({ limit: 500 });
  expect(listB.body.data.items.some(i => i.Article_Number === 'QAMB-ISOLATE-B')).toBe(true);
  expect(listB.body.data.items.some(i => i.Article_Number === 'QAMB-ISOLATE-A')).toBe(false);
});

test('a sale created under a specific branch context is stamped with that Branch_ID', async () => {
  const ornament = await createOrnament(adminToken, branchA, { Article_Number: 'QAMB-SALE-001', Total_Price: 12000 });
  const sale = await request(app).post('/api/sales/create').set(withBranchHeader(adminToken, branchA)).send({
    Payment_Mode: 'Cash',
    items: [{ Ornament_ID: ornament.body.data.Ornament_ID, Article_Number: 'QAMB-SALE-001', Total_Line_Price: 12000 }],
  });
  expect(sale.status).toBe(201);

  const header = await db('tbl_sales_header').where({ Sale_ID: sale.body.data.sale.Sale_ID }).first();
  expect(header.Branch_ID).toBe(branchA);
});

test('POST /api/branches/access grants a specific branch, and DELETE revokes it', async () => {
  const grant = await request(app).post('/api/branches/access').set(authAs(adminToken)).send({ User_ID: staffUserId, Branch_ID: branchB });
  expect(grant.status).toBe(201);

  const nowAllowed = await createOrnament(staffToken, branchB, { Article_Number: 'QAMB-GRANTED-001' });
  expect(nowAllowed.status).toBe(201);

  const list = await request(app).get(`/api/branches/access/${staffUserId}`).set(authAs(adminToken));
  const row = list.body.data.grants.find(g => g.Branch_ID === branchB);
  expect(row).toBeDefined();

  const revoke = await request(app).delete(`/api/branches/access/${row.Access_ID}`).set(authAs(adminToken));
  expect(revoke.status).toBe(200);

  const revokedNowForbidden = await createOrnament(staffToken, branchB, { Article_Number: 'QAMB-REVOKED-001' });
  expect(revokedNowForbidden.status).toBe(403);
});

test('a non-admin (the restricted staff user) cannot grant branch access to anyone, including themselves', async () => {
  const res = await request(app).post('/api/branches/access').set(authAs(staffToken)).send({ User_ID: staffUserId, Branch_ID: branchB });
  expect(res.status).toBe(403);
});

test('the audit trail (previously dormant — the column existed, nothing ever populated it) now records which branch an action actually happened in', async () => {
  const res = await createOrnament(adminToken, branchA, { Article_Number: 'QAMB-AUDIT-001' });
  expect(res.status).toBe(201);

  const audit = await db('tbl_audit_log')
    .where({ Tenant_ID: tenant.tenantId, Table_Name: 'tbl_ornament_master', Record_ID: String(res.body.data.Ornament_ID) })
    .orderBy('Log_ID', 'desc').first();
  expect(audit).toBeDefined();
  expect(audit.Branch_ID).toBe(branchA);
});

test('an action with no branch context active leaves the audit record\'s branch unattributed, not falsely claimed', async () => {
  const res = await createOrnament(adminToken, null, { Article_Number: 'QAMB-AUDIT-NOCTX-001' });
  expect(res.status).toBe(201);

  const audit = await db('tbl_audit_log')
    .where({ Tenant_ID: tenant.tenantId, Table_Name: 'tbl_ornament_master', Record_ID: String(res.body.data.Ornament_ID) })
    .orderBy('Log_ID', 'desc').first();
  expect(audit.Branch_ID).toBeNull();
});
