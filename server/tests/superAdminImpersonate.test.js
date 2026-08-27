/**
 * Super Admin "Log in as tenant" — a real, previously-missing gap found via
 * a live bug report: Super Admin's own login belongs to SA_MASTER, which
 * owns no tenant data at all, so every tenant-scoped screen (POS included)
 * just read as broken/"not found" no matter what — there was no way to
 * actually operate AS a tenant to test or support them.
 *
 * POST /api/super-admin/impersonate mints a real JWT for one of the target
 * tenant's own users, WITHOUT ever touching that user's password — this is
 * the entire point, a genuine "log in as," not a shared credential.
 */
const request = require('supertest');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { app } = require('../src/index');
const db = require('../src/db/knex');
const testTenant = require('./helpers/testTenant');

const SA_USERNAME = 'qa_temp_sa_impersonatetest';
let saToken, tenant, tenantToken, secondUserId;

beforeAll(async () => {
  const saRole = await db('tbl_role_master').where({ Role_Name: 'Super Admin' }).first();
  const salt = bcrypt.genSaltSync(10);
  await db('tbl_user_master').where({ Username: SA_USERNAME }).del();
  await db('tbl_user_master').insert({
    Tenant_ID: 'SA_MASTER', Username: SA_USERNAME, Password_Hash: bcrypt.hashSync('TempSA@ImpT1', salt), Password_Salt: salt,
    Role_ID: saRole.Role_ID, Full_Name: 'QA Temp SA (impersonate test)', Is_Active: true, Is_Admin: true,
  });
  const saLogin = await request(app).post('/api/auth/login').send({ username: SA_USERNAME, password: 'TempSA@ImpT1', tenantId: 'SA_MASTER' });
  saToken = saLogin.body.data.token;

  tenant = await testTenant.setup();
  const tLogin = await request(app).post('/api/auth/login').send({ username: tenant.username, password: tenant.password, tenantId: tenant.tenantId });
  tenantToken = tLogin.body.data.token;

  // A second, non-admin user in the same tenant — to prove explicit
  // userId targeting picks a SPECIFIC user, not just always the default admin.
  const staffRole = await db('tbl_role_master').where({ Role_Name: 'Sales Staff' }).first() || await db('tbl_role_master').first();
  const [second] = await db('tbl_user_master').insert({
    Tenant_ID: tenant.tenantId, Username: 'qatest_second_staff',
    Password_Hash: bcrypt.hashSync('irrelevant', salt), Password_Salt: salt,
    Role_ID: staffRole.Role_ID, Full_Name: 'QA Second Staff', Is_Active: true, Is_Admin: false,
  }).returning('*');
  secondUserId = second.User_ID;
});

afterAll(async () => {
  await db('tbl_user_master').where({ Username: SA_USERNAME }).del();
  await db('tbl_user_master').where({ Username: 'qatest_second_staff' }).del();
  await db('tbl_audit_log').where({ Tenant_ID: tenant.tenantId }).whereIn('Action_Type', ['IMPERSONATE_START', 'IMPERSONATE_END']).del();
  await testTenant.teardown();
  await db.destroy();
});

test('a regular tenant user cannot impersonate anyone', async () => {
  const res = await request(app).post('/api/super-admin/impersonate').set('Authorization', `Bearer ${tenantToken}`)
    .send({ tenantId: tenant.tenantId });
  expect(res.status).toBe(403);
});

test('Super Admin impersonates a tenant with no userId — defaults to that tenant\'s own admin user, no password needed', async () => {
  const res = await request(app).post('/api/super-admin/impersonate').set('Authorization', `Bearer ${saToken}`)
    .send({ tenantId: tenant.tenantId });
  expect(res.status).toBe(200);
  expect(res.body.data.user.username).toBe(tenant.username); // the real admin qatest_admin
  expect(res.body.data.user.tenantId).toBe(tenant.tenantId);
  expect(res.body.data.impersonation.active).toBe(true);
  expect(res.body.data.impersonation.byUsername).toBe(SA_USERNAME);

  const decoded = jwt.verify(res.body.data.token, process.env.JWT_SECRET);
  expect(decoded.roleName).toBe('Client Admin');
  expect(decoded.impersonation.active).toBe(true);
});

test('the minted token is a REAL, working session for that tenant — proven against a genuinely tenant-scoped route', async () => {
  const imp = await request(app).post('/api/super-admin/impersonate').set('Authorization', `Bearer ${saToken}`)
    .send({ tenantId: tenant.tenantId });
  const impToken = imp.body.data.token;

  const res = await request(app).get('/api/ornaments').set('Authorization', `Bearer ${impToken}`);
  expect(res.status).toBe(200); // works exactly like a real login for this tenant
});

test('explicit userId targets a SPECIFIC user, not just the default admin', async () => {
  const res = await request(app).post('/api/super-admin/impersonate').set('Authorization', `Bearer ${saToken}`)
    .send({ tenantId: tenant.tenantId, userId: secondUserId });
  expect(res.status).toBe(200);
  expect(res.body.data.user.username).toBe('qatest_second_staff');
  expect(res.body.data.user.userId).toBe(secondUserId);
});

test('cannot impersonate an inactive tenant', async () => {
  await db('tbl_tenant_master').where({ Tenant_ID: tenant.tenantId }).update({ Is_Active: false });
  try {
    const res = await request(app).post('/api/super-admin/impersonate').set('Authorization', `Bearer ${saToken}`)
      .send({ tenantId: tenant.tenantId });
    expect(res.status).toBe(403);
  } finally {
    await db('tbl_tenant_master').where({ Tenant_ID: tenant.tenantId }).update({ Is_Active: true });
  }
});

test('impersonation is audited on the target tenant\'s own trail — both start and end', async () => {
  const imp = await request(app).post('/api/super-admin/impersonate').set('Authorization', `Bearer ${saToken}`)
    .send({ tenantId: tenant.tenantId });
  const impToken = imp.body.data.token;

  const startLog = await db('tbl_audit_log').where({ Tenant_ID: tenant.tenantId, Action_Type: 'IMPERSONATE_START' }).orderBy('Action_Timestamp', 'desc').first();
  expect(startLog).toBeDefined();
  expect(startLog.Description).toContain(SA_USERNAME);

  const endRes = await request(app).post('/api/super-admin/impersonate/end').set('Authorization', `Bearer ${impToken}`);
  expect(endRes.status).toBe(200);

  const endLog = await db('tbl_audit_log').where({ Tenant_ID: tenant.tenantId, Action_Type: 'IMPERSONATE_END' }).orderBy('Action_Timestamp', 'desc').first();
  expect(endLog).toBeDefined();
});

test('/impersonate/end rejects a normal (non-impersonation) session', async () => {
  const res = await request(app).post('/api/super-admin/impersonate/end').set('Authorization', `Bearer ${tenantToken}`);
  expect(res.status).toBe(400);
});
