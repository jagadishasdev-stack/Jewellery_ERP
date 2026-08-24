/**
 * generateArticleNumber() (server/src/utils/invoiceNumber.js) used to pick
 * whatever ornament was most recently CREATED for the tenant — regardless
 * of whether its Article_Number was auto-generated or manually typed —
 * and parse a trailing number off THAT to build the next sequence. The
 * Add Stock form explicitly allows a custom Article_Number (a legacy tag,
 * a hallmark code), so saving one ending in digits (e.g. "OLD-TAG-002")
 * would hijack the next auto-generated save's sequence, producing a
 * number that could already exist — a real 409 on a perfectly normal
 * next save. Found while writing an unrelated test that happened to use
 * a custom Article_Number.
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

async function createOrnament(overrides = {}) {
  return request(app).post('/api/ornaments').set(auth()).send({
    Type_ID: typeId, Metal_Type: 'Gold', Gross_Weight: 1, Net_Gold_Weight: 0.9, Current_Gold_Rate: 6000,
    Base_Making_Charge_Per_Gram: 100, Purchase_Cost: 5000, Total_Price: 6000, ...overrides,
  });
}

test('a custom Article_Number ending in digits does not hijack the next auto-generated one', async () => {
  const first = await createOrnament(); // real auto-generated, e.g. ART-QATEST-<date>-00001
  expect(first.status).toBe(201);

  const custom = await createOrnament({ Article_Number: 'OLD-LEGACY-TAG-002' });
  expect(custom.status).toBe(201);

  const second = await createOrnament(); // must NOT collide with `first`
  expect(second.status).toBe(201);
  expect(second.body.data.Article_Number).not.toBe(first.body.data.Article_Number);
  expect(second.body.data.Article_Number).toMatch(/^ART-QATEST-\d{8}-\d{5}$/);

  // Confirm the two auto-generated ones are actually sequential, not both
  // accidentally re-deriving the same seq from the custom one in between.
  const firstSeq = parseInt(first.body.data.Article_Number.slice(-5), 10);
  const secondSeq = parseInt(second.body.data.Article_Number.slice(-5), 10);
  expect(secondSeq).toBe(firstSeq + 1);
});
