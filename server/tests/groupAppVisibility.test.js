/**
 * Per-group "App Join" visibility — a tenant with several scheme groups
 * must be able to choose which ones actually show up in the mobile app's
 * Saving Plans list, and change that choice after the group already
 * exists (App_Join_Allowed used to only be settable at Create Group time;
 * there was no way to flip it afterward, and the app's own group list
 * never checked it at all).
 */
const request = require('supertest');
const { app } = require('../src/index');
const db = require('../src/db/knex');
const testTenant = require('./helpers/testTenant');

let tenant, token, groupOpenId, groupClosedId;
const auth = () => ({ Authorization: `Bearer ${token}` });

beforeAll(async () => {
  tenant = await testTenant.setup();
  const res = await request(app).post('/api/auth/login').send({ username: tenant.username, password: tenant.password, tenantId: tenant.tenantId });
  token = res.body.data.token;

  const [scheme] = await db('tbl_scheme_master').insert({
    Tenant_ID: tenant.tenantId, Scheme_Code: 'QAVIS', Scheme_Name: 'QA Visibility Scheme',
    Is_Active: true, Show_In_App: true, Created_Date: new Date(),
  }).returning('Scheme_ID');

  const createRes = await request(app).post('/api/savings/groups').set(auth()).send({
    Scheme_ID: scheme.Scheme_ID, Group_Code: 'QAVIS-OPEN', Group_Name: 'Open To App',
    Start_Date: '2026-01-01', Monthly_Amount: 1000, Total_Installments: 12, App_Join_Allowed: true,
  });
  groupOpenId = createRes.body.data.Group_ID;

  const createRes2 = await request(app).post('/api/savings/groups').set(auth()).send({
    Scheme_ID: scheme.Scheme_ID, Group_Code: 'QAVIS-CLOSED', Group_Name: 'Closed To App',
    Start_Date: '2026-01-01', Monthly_Amount: 1500, Total_Installments: 12, App_Join_Allowed: true,
  });
  groupClosedId = createRes2.body.data.Group_ID;
});

afterAll(async () => {
  await testTenant.teardown();
  await db.destroy();
});

test('a newly created group defaults to App_Join_Allowed:true and shows up in the app list', async () => {
  const res = await request(app).get('/api/core/getGroups').query({ store_id: tenant.tenantId });
  expect(res.status).toBe(200);
  const codes = res.body.map((g) => g.code);
  expect(codes).toContain('QAVIS-OPEN');
  expect(codes).toContain('QAVIS-CLOSED');
});

test('flipping App_Join_Allowed off on an existing group is now possible (was write-once before)', async () => {
  const res = await request(app).put(`/api/savings/groups/${groupClosedId}`).set(auth()).send({ App_Join_Allowed: false });
  expect(res.status).toBe(200);
  expect(res.body.data.App_Join_Allowed).toBe(false);
});

test('the app group list now excludes that group but still includes the other one', async () => {
  const res = await request(app).get('/api/core/getGroups').query({ store_id: tenant.tenantId });
  const codes = res.body.map((g) => g.code);
  expect(codes).not.toContain('QAVIS-CLOSED');
  expect(codes).toContain('QAVIS-OPEN');
});

test('flipping it back on makes it reappear in the app list', async () => {
  const put = await request(app).put(`/api/savings/groups/${groupClosedId}`).set(auth()).send({ App_Join_Allowed: true });
  expect(put.body.data.App_Join_Allowed).toBe(true);

  const res = await request(app).get('/api/core/getGroups').query({ store_id: tenant.tenantId });
  expect(res.body.map((g) => g.code)).toContain('QAVIS-CLOSED');
});

test('Counter_Join_Allowed is also editable now (same route, same reasoning)', async () => {
  const res = await request(app).put(`/api/savings/groups/${groupOpenId}`).set(auth()).send({ Counter_Join_Allowed: false });
  expect(res.status).toBe(200);
  expect(res.body.data.Counter_Join_Allowed).toBe(false);

  // Restore for cleanliness.
  await request(app).put(`/api/savings/groups/${groupOpenId}`).set(auth()).send({ Counter_Join_Allowed: true });
});
