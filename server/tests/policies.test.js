/**
 * server/src/routes/policies.js — Policy sections admin CRUD (Terms &
 * Conditions, About Us, Privacy, Return/Refund, Shipping) consumed publicly
 * by the savings_app via GET /api/mobile/policies/:tenantId. 4 endpoints,
 * previously zero coverage. Low business risk (text content, not
 * financial data) but genuinely mounted and reachable.
 */
const request = require('supertest');
const bcrypt = require('bcryptjs');
const { app } = require('../src/index');
const db = require('../src/db/knex');
const testTenant = require('./helpers/testTenant');

let tenant, token, saToken;
const auth = () => ({ Authorization: `Bearer ${token}` });
const saAuth = () => ({ Authorization: `Bearer ${saToken}` });
const SA_USERNAME = 'qa_temp_sa_policiestest';

beforeAll(async () => {
  tenant = await testTenant.setup();
  const res = await request(app).post('/api/auth/login').send({ username: tenant.username, password: tenant.password, tenantId: tenant.tenantId });
  token = res.body.data.token;

  const saRole = await db('tbl_role_master').where({ Role_Name: 'Super Admin' }).first();
  const salt = bcrypt.genSaltSync(10);
  await db('tbl_user_master').where({ Username: SA_USERNAME }).del();
  await db('tbl_user_master').insert({
    Tenant_ID: 'SA_MASTER', Username: SA_USERNAME, Password_Hash: bcrypt.hashSync('TempSA@PolT1', salt), Password_Salt: salt,
    Role_ID: saRole.Role_ID, Full_Name: 'QA Temp SA (policies test)', Is_Active: true, Is_Admin: true,
  });
  const saLogin = await request(app).post('/api/auth/login').send({ username: SA_USERNAME, password: 'TempSA@PolT1', tenantId: 'SA_MASTER' });
  saToken = saLogin.body.data.token;
});

afterAll(async () => {
  await db('tbl_scheme_policies').where({ Tenant_ID: tenant.tenantId }).del();
  await db('tbl_scheme_policies').where({ Section_Title: 'QA Global Terms' }).del();
  await db('tbl_user_master').where({ Username: SA_USERNAME }).del();
  await testTenant.teardown();
  await db.destroy();
});

describe('GET/POST /api/policies', () => {
  test('requires auth', async () => {
    const res = await request(app).get('/api/policies');
    expect(res.status).toBe(401);
  });

  test('validates Policy_Type against the fixed enum', async () => {
    const res = await request(app).post('/api/policies').set(auth())
      .send({ Policy_Type: 'NOT_A_TYPE', Section_Title: 'x', Section_Content: 'y' });
    expect(res.status).toBe(422);
  });

  test('creates a section scoped to the caller\'s own tenant, and GET lists it back ordered by Sort_Order', async () => {
    await request(app).post('/api/policies').set(auth()).send({ Policy_Type: 'TERMS', Section_Title: 'Second', Section_Content: 'b', Sort_Order: 2 });
    const first = await request(app).post('/api/policies').set(auth()).send({ Policy_Type: 'TERMS', Section_Title: 'First', Section_Content: 'a', Sort_Order: 1 });
    expect(first.status).toBe(201);
    expect(first.body.data.Tenant_ID).toBe(tenant.tenantId);

    const list = await request(app).get('/api/policies?type=TERMS').set(auth());
    expect(list.status).toBe(200);
    expect(list.body.data.map(r => r.Section_Title)).toEqual(['First', 'Second']);
  });

  test('a non-Super-Admin cannot use ?tenantId= to read/write another tenant or the global rows — always locked to their own', async () => {
    const res = await request(app).get('/api/policies?tenantId=SA_MASTER').set(auth());
    expect(res.status).toBe(200);
    // resolveTenantId() ignores ?tenantId= entirely for non-Super-Admins —
    // still returns THIS tenant's own rows, not SA_MASTER's.
    expect(res.body.data.every(r => r.Tenant_ID === tenant.tenantId)).toBe(true);
  });

  test('Super Admin can target the global (Tenant_ID IS NULL) default rows via ?tenantId=null', async () => {
    const create = await request(app).post('/api/policies?tenantId=null').set(saAuth())
      .send({ Policy_Type: 'TERMS', Section_Title: 'QA Global Terms', Section_Content: 'global default text' });
    expect(create.status).toBe(201);
    expect(create.body.data.Tenant_ID).toBeNull();

    const list = await request(app).get('/api/policies?tenantId=null&type=TERMS').set(saAuth());
    expect(list.status).toBe(200);
    expect(list.body.data.some(r => r.Section_Title === 'QA Global Terms')).toBe(true);
    expect(list.body.data.every(r => r.Tenant_ID === undefined || r.Tenant_ID === null)).toBe(true);
  });
});

describe('PUT /api/policies/:id', () => {
  let policyId;

  beforeAll(async () => {
    const res = await request(app).post('/api/policies').set(auth()).send({ Policy_Type: 'ABOUT', Section_Title: 'About Us', Section_Content: 'original' });
    policyId = res.body.data.Policy_ID;
  });

  test('rejects an invalid Policy_Type on update', async () => {
    const res = await request(app).put(`/api/policies/${policyId}`).set(auth()).send({ Policy_Type: 'BOGUS' });
    expect(res.status).toBe(400);
  });

  test('404s for a policy belonging to a different tenant (cannot edit across tenants)', async () => {
    const res = await request(app).put(`/api/policies/${policyId}`).set(saAuth()).send({ Section_Content: 'hijacked' }); // SA with no ?tenantId= is locked to SA_MASTER's own scope
    expect(res.status).toBe(404);
  });

  test('partial update only touches the given fields and stamps Updated_Date', async () => {
    const res = await request(app).put(`/api/policies/${policyId}`).set(auth()).send({ Section_Content: 'updated content' });
    expect(res.status).toBe(200);
    expect(res.body.data.Section_Content).toBe('updated content');
    expect(res.body.data.Section_Title).toBe('About Us'); // untouched
    expect(res.body.data.Updated_Date).toBeTruthy();
  });
});

describe('DELETE /api/policies/:id', () => {
  test('404s for a nonexistent id', async () => {
    const res = await request(app).delete('/api/policies/9999999').set(auth());
    expect(res.status).toBe(404);
  });

  test('deletes a real section scoped to the caller\'s tenant', async () => {
    const created = await request(app).post('/api/policies').set(auth()).send({ Policy_Type: 'SHIPPING', Section_Title: 'To Delete', Section_Content: 'x' });
    const res = await request(app).delete(`/api/policies/${created.body.data.Policy_ID}`).set(auth());
    expect(res.status).toBe(200);

    const row = await db('tbl_scheme_policies').where({ Policy_ID: created.body.data.Policy_ID }).first();
    expect(row).toBeFalsy();
  });
});
