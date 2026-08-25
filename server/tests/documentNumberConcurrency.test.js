/**
 * utils/numberFormat.js's nextNumber() used to SELECT the current max
 * matching number, compute +1 in application code, then INSERT — a
 * read-then-write race. Two genuinely concurrent requests could read the
 * same max and compute the same next number: at best a unique-constraint
 * 500 for the loser (Article_Number IS unique), at worst a silently
 * duplicated document number on a column with no such constraint. Fires
 * real concurrent requests (not sequential awaits) and asserts every
 * single one got a distinct number with no failures — the only way to
 * actually catch a race rather than assume the fix works from reading it.
 */
const request = require('supertest');
const { app } = require('../src/index');
const db = require('../src/db/knex');
const testTenant = require('./helpers/testTenant');

let tenant, token, typeId;
const auth = () => ({ Authorization: `Bearer ${token}` });

beforeAll(async () => {
  tenant = await testTenant.setup();
  const res = await request(app).post('/api/auth/login').send({ username: tenant.username, password: tenant.password, tenantId: tenant.tenantId });
  token = res.body.data.token;
  typeId = (await db('tbl_item_type_master').first()).Type_ID;
});

afterAll(async () => {
  await testTenant.teardown();
  await db.destroy();
});

test('20 concurrent POST /api/ornaments (no Article_Number given, auto-generated) all succeed with distinct numbers', async () => {
  const requests = Array.from({ length: 20 }, () =>
    request(app).post('/api/ornaments').set(auth()).send({
      Type_ID: typeId, Metal_Type: 'Gold', Gross_Weight: 5, Net_Gold_Weight: 4.5, Current_Gold_Rate: 6000,
      Base_Making_Charge_Per_Gram: 100, Purchase_Cost: 20000, Total_Price: 28000,
    })
  );
  const results = await Promise.all(requests);

  const failed = results.filter(r => r.status !== 201);
  expect(failed.map(r => ({ status: r.status, body: r.body }))).toEqual([]); // every single one must succeed — no 409/500 losers

  const articleNumbers = results.map(r => r.body.data.Article_Number);
  expect(new Set(articleNumbers).size).toBe(20); // and every number must be distinct — no silent duplicates
});

test('the counter table itself lands on exactly 20 after those 20 concurrent creates (no lost or double-counted increments)', async () => {
  const rows = await db('tbl_document_number_counter')
    .where('Tenant_ID', tenant.tenantId)
    .where('Sequence_Key', 'like', 'ART-%');
  expect(rows.length).toBe(1);
  expect(rows[0].Last_Seq).toBe(20);
});

test('a SECOND burst of 15 concurrent creates continues the sequence from 21, not restarting or colliding', async () => {
  const requests = Array.from({ length: 15 }, () =>
    request(app).post('/api/ornaments').set(auth()).send({
      Type_ID: typeId, Metal_Type: 'Gold', Gross_Weight: 3, Net_Gold_Weight: 2.5, Current_Gold_Rate: 6000,
      Base_Making_Charge_Per_Gram: 100, Purchase_Cost: 10000, Total_Price: 15000,
    })
  );
  const results = await Promise.all(requests);
  expect(results.filter(r => r.status !== 201)).toEqual([]);

  const allNumbers = results.map(r => r.body.data.Article_Number);
  expect(new Set(allNumbers).size).toBe(15);

  const rows = await db('tbl_document_number_counter')
    .where('Tenant_ID', tenant.tenantId)
    .where('Sequence_Key', 'like', 'ART-%');
  expect(rows[0].Last_Seq).toBe(35);
});
