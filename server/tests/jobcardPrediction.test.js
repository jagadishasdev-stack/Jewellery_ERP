/**
 * Jobcard Prediction — manufacturing planning that must never touch real
 * stock/production tables. Genuinely absent before (Missing Feature
 * Report, Transaction Menu spec) — the only prior "Jobcard" concept was
 * Repair's own service job cards, an unrelated stock-affecting workflow.
 */
const request = require('supertest');
const { app } = require('../src/index');
const db = require('../src/db/knex');
const testTenant = require('./helpers/testTenant');

let tenant, token;
const auth = () => ({ Authorization: `Bearer ${token}` });

beforeAll(async () => {
  tenant = await testTenant.setup();
  const res = await request(app).post('/api/auth/login').send({ username: tenant.username, password: tenant.password, tenantId: tenant.tenantId });
  token = res.body.data.token;
});

afterAll(async () => {
  await db('tbl_jobcard_prediction').where({ Tenant_ID: tenant.tenantId }).del();
  await testTenant.teardown();
  await db.destroy();
});

test('creates a jobcard prediction with a real Jobcard_Number, defaulting to Draft', async () => {
  const res = await request(app).post('/api/jobcard-prediction').set(auth()).send({
    Metal_Type: 'Gold', Expected_Weight: 12.5, Expected_Completion_Date: '2026-09-15',
    Estimated_Wastage_Pct: 3, Estimated_Making_Charge: 500, Material_Requirement: '12.5g gold, ruby stones x4',
  });
  expect(res.status).toBe(201);
  expect(res.body.data.Jobcard_Number).toMatch(/JCP/);
  expect(res.body.data.Status).toBe('Draft');
});

test('rejects an invalid metal type', async () => {
  const res = await request(app).post('/api/jobcard-prediction').set(auth()).send({ Metal_Type: 'Unobtainium' });
  expect(res.status).toBe(422);
});

test('transitions status without touching any stock table', async () => {
  const create = await request(app).post('/api/jobcard-prediction').set(auth()).send({ Metal_Type: 'Silver', Expected_Weight: 50 });
  const stockCountBefore = await db('tbl_ornament_master').where({ Tenant_ID: tenant.tenantId }).count('Ornament_ID as c').first();

  const confirm = await request(app).put(`/api/jobcard-prediction/${create.body.data.Jobcard_ID}/status`).set(auth()).send({ Status: 'Confirmed' });
  expect(confirm.status).toBe(200);
  expect(confirm.body.data.Status).toBe('Confirmed');

  const converted = await request(app).put(`/api/jobcard-prediction/${create.body.data.Jobcard_ID}/status`).set(auth()).send({ Status: 'Converted' });
  expect(converted.status).toBe(200);

  const stockCountAfter = await db('tbl_ornament_master').where({ Tenant_ID: tenant.tenantId }).count('Ornament_ID as c').first();
  expect(parseInt(stockCountAfter.c)).toBe(parseInt(stockCountBefore.c)); // unchanged — no stock side effect from status transitions
});

test('GET / filters by status — a Converted jobcard does not show up under Confirmed', async () => {
  const confirmedRes = await request(app).get('/api/jobcard-prediction').set(auth()).query({ status: 'Confirmed' });
  expect(confirmedRes.status).toBe(200);
  expect(confirmedRes.body.data.every((r) => r.Status === 'Confirmed')).toBe(true);

  const convertedRes = await request(app).get('/api/jobcard-prediction').set(auth()).query({ status: 'Converted' });
  expect(convertedRes.body.data.length).toBeGreaterThan(0);
  expect(convertedRes.body.data.every((r) => r.Status === 'Converted')).toBe(true);
});
