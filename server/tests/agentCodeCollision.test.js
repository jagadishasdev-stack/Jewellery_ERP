/**
 * tbl_agent_master.Agent_Code has a GLOBAL unique constraint (not scoped
 * per tenant) — but all three places that create an agent
 * (rateBookingAgent.js, savingsScheme.js, superAdmin.js) used to generate
 * it from only the CALLING tenant's own agent count ("AGT1", "AGT-01001",
 * ...), so any two tenants' first agent collided outright. Confirmed for
 * real while seeding a demo tenant: DLJ already held "AGT1", which
 * permanently blocked every other tenant from ever creating their first
 * rate-booking agent. Fixed by prefixing the generated code with the
 * tenant ID (matching Vendor_Code/Member_Number elsewhere in this
 * codebase) — these tests check the code actually contains the tenant ID,
 * which is what makes it globally unique by construction.
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

test('rate-agent: auto-generated Agent_Code includes the tenant ID, not just a bare per-tenant sequence', async () => {
  const res = await request(app).post('/api/rate-agent/agents').set(auth()).send({
    Agent_Name: 'Regression Agent A', Mobile: '9900011111', Commission_Pct: 2,
  });
  expect(res.status).toBe(201);
  expect(res.body.data.Agent_Code).toContain(tenant.tenantId.replace('_', ''));
});

test('savings-scheme agent: same fix, same guarantee', async () => {
  const res = await request(app).post('/api/savings/agents').set(auth()).send({
    Agent_Name: 'Regression Agent B', Mobile: '9900022222',
  });
  expect(res.status).toBe(201);
  expect(res.body.data.Agent_Code).toContain(tenant.tenantId.replace('_', ''));
});

test('a manually-supplied Agent_Code is still respected as-is (auto-generation only fills the gap)', async () => {
  const res = await request(app).post('/api/rate-agent/agents').set(auth()).send({
    Agent_Name: 'Regression Agent C', Mobile: '9900033333', Agent_Code: 'CUSTOM-CODE-XYZ',
  });
  expect(res.status).toBe(201);
  expect(res.body.data.Agent_Code).toBe('CUSTOM-CODE-XYZ');
});
