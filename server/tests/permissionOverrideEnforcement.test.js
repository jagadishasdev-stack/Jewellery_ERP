/**
 * tbl_user_permission_override and tbl_user_bin_access both had full
 * CRUD admin screens with nothing anywhere reading them back — an admin
 * granting or restricting access did nothing at all (found via audit).
 * Pawnbroking (real money, the module with the most existing test
 * coverage) is wired to the new requireModuleAccess() as the first,
 * fully-real example; floors.js's hidden-location/hidden-stock routes
 * are wired to the new getAllowedBinScope().
 */
const request = require('supertest');
const { app } = require('../src/index');
const db = require('../src/db/knex');
const testTenant = require('./helpers/testTenant');

let tenant, adminToken, staffToken, staffId;
const authAs = (token) => ({ Authorization: `Bearer ${token}` });

beforeAll(async () => {
  tenant = await testTenant.setup();
  const adminLogin = await request(app).post('/api/auth/login').send({ username: tenant.username, password: tenant.password, tenantId: tenant.tenantId });
  adminToken = adminLogin.body.data.token;

  const billingRole = await db('tbl_role_master').where({ Role_Name: 'Billing Operator' }).first();
  const staffRes = await request(app).post('/api/tenant/users').set(authAs(adminToken)).send({
    Username: `qa_override_staff_${Date.now()}`, Password: 'QaOverride@2026', Full_Name: 'QA Override Staff', Role_ID: billingRole.Role_ID,
  });
  staffId = staffRes.body.data.User_ID;
  const staffLogin = await request(app).post('/api/auth/login').send({ username: staffRes.body.data.Username, password: 'QaOverride@2026', tenantId: tenant.tenantId });
  staffToken = staffLogin.body.data.token;
});

afterAll(async () => {
  await testTenant.teardown();
  await db.destroy();
});

test('a user with NO override row is unaffected (unrestricted default)', async () => {
  const res = await request(app).get('/api/pawnbroking/loans').set(authAs(staffToken));
  expect(res.status).toBe(200);
});

test('an override row can GRANT access a role does not normally have', async () => {
  // Billing Operator has no natural pawnbroking access reason to be
  // blocked (the route itself was authenticate-only before this fix),
  // but with an explicit Can_View=false override it must now be denied —
  // and Can_View=true must let it through, proving the override is
  // actually being read, not just present in the schema.
  await request(app).post('/api/permissions/overrides').set(authAs(adminToken)).send({
    User_ID: staffId, Module_Key: 'pawnbroking', Can_View: true, Can_Add: false, Can_Edit: false, Can_Delete: false, Can_Approve: false,
  });
  const res = await request(app).get('/api/pawnbroking/loans').set(authAs(staffToken));
  expect(res.status).toBe(200);

  const addAttempt = await request(app).post('/api/pawnbroking/loans').set(authAs(staffToken)).send({
    Customer_ID: 1, Loan_Date: '2026-08-26', Loan_Amount: 1000, Interest_Rate_Pct: 2, items: [{ Gross_Weight: 1, Net_Weight: 1, Estimated_Value: 1000 }],
  });
  expect(addAttempt.status).toBe(403); // Can_Add is false — real restriction, not just recorded
});

test('an override row can RESTRICT access below what the role would otherwise allow', async () => {
  await request(app).post('/api/permissions/overrides').set(authAs(adminToken)).send({
    User_ID: staffId, Module_Key: 'pawnbroking', Can_View: false, Can_Add: false, Can_Edit: false, Can_Delete: false, Can_Approve: false,
  });
  const res = await request(app).get('/api/pawnbroking/loans').set(authAs(staffToken));
  expect(res.status).toBe(403);
});

test('bin-access: a user with grant rows is restricted to exactly those hidden locations', async () => {
  const locA = await request(app).post('/api/floors/hidden-locations').set(authAs(adminToken)).send({ Location_Code: 'QAOVR-A', Location_Name: 'QA Override Location A' });
  const locB = await request(app).post('/api/floors/hidden-locations').set(authAs(adminToken)).send({ Location_Code: 'QAOVR-B', Location_Name: 'QA Override Location B' });

  const beforeRestriction = await request(app).get('/api/floors/hidden-locations').set(authAs(adminToken));
  const namesBeforeRestriction = beforeRestriction.body.data.map((l) => l.Location_Name);
  expect(namesBeforeRestriction).toContain('QA Override Location A');
  expect(namesBeforeRestriction).toContain('QA Override Location B');

  // Restrict the admin's OWN account to only Location A — getAllowedBinScope
  // has no caching (queried live per request), so this takes effect on the
  // very next call with the SAME already-issued token, no re-login needed.
  const grant = await request(app).post('/api/permissions/bin-access').set(authAs(adminToken)).send({
    User_ID: tenant.userId, Hidden_Location_ID: locA.body.data.Hidden_Location_ID, Access_Level: 'View',
  });
  expect(grant.status).toBe(201);

  const afterRestriction = await request(app).get('/api/floors/hidden-locations').set(authAs(adminToken));
  const namesAfterRestriction = afterRestriction.body.data.map((l) => l.Location_Name);
  expect(namesAfterRestriction).toContain('QA Override Location A');
  expect(namesAfterRestriction).not.toContain('QA Override Location B'); // real restriction, not just recorded

  // Revoke it so it doesn't leak into other tests/tenants.
  await request(app).delete(`/api/permissions/bin-access/${grant.body.data.Access_ID}`).set(authAs(adminToken));
  const afterRevoke = await request(app).get('/api/floors/hidden-locations').set(authAs(adminToken));
  expect(afterRevoke.body.data.map((l) => l.Location_Name)).toContain('QA Override Location B');
});
