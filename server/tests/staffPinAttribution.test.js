/**
 * Staff PIN identification (Image App) — the device's own license-login
 * token has no per-person identity at all (every write was attributed to
 * "IMGAPP_<tenant>", not whoever's actually holding the shared tablet).
 * These routes let a real staff member identify themselves without a full
 * username/password login, and every subsequent write carries THEIR
 * identity instead of the device's.
 */
const request = require('supertest');
const { app } = require('../src/index');
const db = require('../src/db/knex');
const testTenant = require('./helpers/testTenant');

let tenant, adminToken, deviceToken, staffId;
const auth = (t) => ({ Authorization: `Bearer ${t}` });

beforeAll(async () => {
  tenant = await testTenant.setup();
  const res = await request(app).post('/api/auth/login').send({ username: tenant.username, password: tenant.password, tenantId: tenant.tenantId });
  adminToken = res.body.data.token;

  // Store Manager, not Billing Operator — the attribution check below edits
  // ornament stock data, which requirePermission('inventory') now correctly
  // reserves for a role that actually has inventory access (a Billing
  // Operator legitimately shouldn't be able to edit stock weights/rates).
  const roleRes = await db('tbl_role_master').where({ Role_Name: 'Store Manager' }).first();
  const staffRes = await request(app).post('/api/tenant/users').set(auth(adminToken)).send({
    Username: 'qa_pin_test_staff', Password: 'TempPass@2026', Full_Name: 'QA PIN Test Staff', Role_ID: roleRes.Role_ID,
  });
  staffId = staffRes.body.data.User_ID;

  const licenseRes = await db('tbl_tenant_master').where({ Tenant_ID: tenant.tenantId }).first('License_Key');
  const loginRes = await request(app).post('/api/mobile/license-login').send({ licenseKey: licenseRes.License_Key, deviceId: 'QA-PIN-TEST' });
  deviceToken = loginRes.body.data.token;
});

afterAll(async () => {
  await testTenant.teardown();
  await db.destroy();
});

test('a staff member with no PIN set does not appear in the staff list', async () => {
  const res = await request(app).get('/api/mobile/staff-list').set(auth(deviceToken));
  expect(res.status).toBe(200);
  expect(res.body.data.some((s) => s.User_ID === staffId)).toBe(false);
});

test('PUT /api/tenant/users/:id rejects a PIN that is not 4-6 digits', async () => {
  const res = await request(app).put(`/api/tenant/users/${staffId}`).set(auth(adminToken)).send({ PIN: '123' });
  expect(res.status).toBe(400);
});

test('admin sets a PIN, and the staff member now appears in the staff list', async () => {
  const res = await request(app).put(`/api/tenant/users/${staffId}`).set(auth(adminToken)).send({ PIN: '2468' });
  expect(res.status).toBe(200);

  const listRes = await request(app).get('/api/mobile/staff-list').set(auth(deviceToken));
  expect(listRes.body.data.some((s) => s.User_ID === staffId)).toBe(true);

  const usersRes = await request(app).get('/api/tenant/users').set(auth(adminToken));
  const found = usersRes.body.data.find((u) => u.User_ID === staffId);
  expect(found.Has_Pin).toBe(true);
  // The actual hash must never reach the client.
  expect(found.PIN_Hash).toBeUndefined();
});

test('staff-pin-login rejects the wrong PIN', async () => {
  const res = await request(app).post('/api/mobile/staff-pin-login').set(auth(deviceToken)).send({ userId: staffId, pin: '0000' });
  expect(res.status).toBe(401);
});

test('staff-pin-login with the correct PIN returns a real per-person token, and it correctly attributes an ornament edit', async () => {
  const loginRes = await request(app).post('/api/mobile/staff-pin-login').set(auth(deviceToken)).send({ userId: staffId, pin: '2468' });
  expect(loginRes.status).toBe(200);
  const staffToken = loginRes.body.data.token;
  expect(loginRes.body.data.user.username).toBe('qa_pin_test_staff');

  const typeRow = await db('tbl_item_type_master').first();
  const createRes = await request(app).post('/api/ornaments').set(auth(adminToken)).send({
    Type_ID: typeRow.Type_ID, Metal_Type: 'Gold', Gross_Weight: 5, Net_Gold_Weight: 4.5, Current_Gold_Rate: 6000,
    Base_Making_Charge_Per_Gram: 100, Purchase_Cost: 20000, Total_Price: 28000,
  });
  const ornamentId = createRes.body.data.Ornament_ID;

  // Edit AS THE STAFF MEMBER (via their PIN-derived token), not the device.
  const editRes = await request(app).put(`/api/ornaments/${ornamentId}`).set(auth(staffToken)).send({ Special_Instructions: 'edited via PIN' });
  expect(editRes.status).toBe(200);
  expect(editRes.body.data.Last_Updated_By).toBe('qa_pin_test_staff');
  expect(editRes.body.data.Last_Updated_By).not.toMatch(/^IMGAPP_/);
});

test('clearing a PIN (PIN: null) removes the staff member from the list and blocks further PIN logins', async () => {
  const res = await request(app).put(`/api/tenant/users/${staffId}`).set(auth(adminToken)).send({ PIN: null });
  expect(res.status).toBe(200);

  const listRes = await request(app).get('/api/mobile/staff-list').set(auth(deviceToken));
  expect(listRes.body.data.some((s) => s.User_ID === staffId)).toBe(false);

  const loginRes = await request(app).post('/api/mobile/staff-pin-login').set(auth(deviceToken)).send({ userId: staffId, pin: '2468' });
  expect(loginRes.status).toBe(404);
});

test('staff-list and staff-pin-login both require the device to be authenticated at all', async () => {
  const listRes = await request(app).get('/api/mobile/staff-list');
  expect(listRes.status).toBe(401);

  const loginRes = await request(app).post('/api/mobile/staff-pin-login').send({ userId: staffId, pin: '2468' });
  expect(loginRes.status).toBe(401);
});
