/**
 * HUID (BIS hallmarking) — the server routes (GET /master/huid/:number,
 * POST /master/huid) have existed since the master data module was
 * built; nothing in the UI ever called them (found via audit). Client
 * now has a real screen (Compliance > HUID); this proves the two routes
 * it calls actually work.
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
  await testTenant.teardown();
  await db.destroy();
});

test('registering an HUID and looking it back up round-trips correctly', async () => {
  const register = await request(app).post('/api/master/huid').set(auth()).send({
    HUID_Number: 'QAHUID01', Article_Number: 'QAHUID-ART-1', Purity_Code: '22K916', Weight: 8.5,
    Assay_Centre: 'QA Assay Centre', Hallmark_Date: '2026-08-01',
  });
  expect(register.status).toBe(201);

  const lookup = await request(app).get('/api/master/huid/QAHUID01').set(auth());
  expect(lookup.status).toBe(200);
  expect(lookup.body.data.Article_Number).toBe('QAHUID-ART-1');
  expect(parseFloat(lookup.body.data.Weight)).toBe(8.5);
});

test('looking up an unknown HUID returns 404, not a silent empty success', async () => {
  const res = await request(app).get('/api/master/huid/NO-SUCH-HUID').set(auth());
  expect(res.status).toBe(404);
});

test('registering the same HUID twice is rejected, not silently duplicated', async () => {
  await request(app).post('/api/master/huid').set(auth()).send({ HUID_Number: 'QAHUID02', Article_Number: 'QAHUID-ART-2' });
  const dup = await request(app).post('/api/master/huid').set(auth()).send({ HUID_Number: 'QAHUID02', Article_Number: 'QAHUID-ART-3' });
  expect(dup.status).toBe(409);
});
