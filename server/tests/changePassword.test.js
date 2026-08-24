/**
 * Self-service password change (PUT /api/auth/change-password) — previously
 * the only way to change a password was an admin resetting it FOR someone;
 * no one could change their own while logged in. The property worth
 * locking in beyond "does it work": a self-chosen password must NEVER be
 * written into Default_Password (the plaintext column the Super Admin's
 * tenant-users view reads — see superAdmin.js) — a user choosing their own
 * password (often reused elsewhere) has no reason to expect the vendor's
 * Super Admin can read it back afterward. This used to do the opposite
 * (keep Default_Password "in sync") — that was the bug; this file now
 * locks in the fix instead.
 */
const request = require('supertest');
const { app } = require('../src/index');
const db = require('../src/db/knex');
const testTenant = require('./helpers/testTenant');

let tenant;
let token;

beforeAll(async () => {
  tenant = await testTenant.setup();
  const res = await request(app).post('/api/auth/login').send({ username: tenant.username, password: tenant.password, tenantId: tenant.tenantId });
  token = res.body.data.token;
});

afterAll(async () => {
  await testTenant.teardown();
  await db.destroy();
});

test('rejects the wrong current password', async () => {
  const res = await request(app).put('/api/auth/change-password').set('Authorization', `Bearer ${token}`)
    .send({ currentPassword: 'totally-wrong', newPassword: 'ValidNewPass123' });
  expect(res.status).toBe(401);
});

test('rejects a new password under 8 characters', async () => {
  const res = await request(app).put('/api/auth/change-password').set('Authorization', `Bearer ${token}`)
    .send({ currentPassword: tenant.password, newPassword: 'short' });
  expect(res.status).toBe(422);
});

test('succeeds with the correct current password, and Default_Password is NOT written', async () => {
  const res = await request(app).put('/api/auth/change-password').set('Authorization', `Bearer ${token}`)
    .send({ currentPassword: tenant.password, newPassword: 'FreshPassword456' });
  expect(res.status).toBe(200);

  const row = await db('tbl_user_master').where({ User_ID: tenant.userId }).first();
  expect(row.Default_Password).toBeFalsy();

  const oldLogin = await request(app).post('/api/auth/login').send({ username: tenant.username, password: tenant.password, tenantId: tenant.tenantId });
  expect(oldLogin.status).toBe(401);

  const newLogin = await request(app).post('/api/auth/login').send({ username: tenant.username, password: 'FreshPassword456', tenantId: tenant.tenantId });
  expect(newLogin.status).toBe(200);
});

test('a Super Admin cannot read the self-chosen password back through the tenant-users view', async () => {
  // Re-login with the now-current password (the token from beforeAll is
  // still valid, but this proves the read path a Super Admin actually uses).
  const salt = require('bcryptjs').genSaltSync(10);
  const saRole = await db('tbl_role_master').where({ Role_Name: 'Super Admin' }).first();
  await db('tbl_user_master').where({ Username: 'qa_temp_sa_pwtest' }).del();
  await db('tbl_user_master').insert({
    Tenant_ID: 'SA_MASTER', Username: 'qa_temp_sa_pwtest',
    Password_Hash: require('bcryptjs').hashSync('TempSA@Pw1', salt), Password_Salt: salt,
    Role_ID: saRole.Role_ID, Full_Name: 'QA Temp SA (pwtest)', Is_Active: true, Is_Admin: true,
  });
  try {
    const saLogin = await request(app).post('/api/auth/login').send({ username: 'qa_temp_sa_pwtest', password: 'TempSA@Pw1', tenantId: 'SA_MASTER' });
    const saToken = saLogin.body.data.token;
    const res = await request(app).get(`/api/super-admin/tenant/${tenant.tenantId}/users`).set('Authorization', `Bearer ${saToken}`);
    const found = res.body.data.find((u) => u.User_ID === tenant.userId);
    expect(found.Default_Password).toBeFalsy();
  } finally {
    await db('tbl_user_master').where({ Username: 'qa_temp_sa_pwtest' }).del();
  }
});
