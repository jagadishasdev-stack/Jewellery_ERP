/**
 * Subscription-tier ↔ business-type module gating.
 *
 * The thing actually worth testing here isn't "does the DB return rows" —
 * it's the intersection logic added this session: a tenant's visible
 * modules must be the AND of (business-type-enabled) and (tier-included),
 * and switching tiers must visibly change the count without touching
 * business-type gating at all. QATEST is provisioned as Business_Type
 * 'HYBRID' specifically so it never restricts anything, isolating the
 * tier variable.
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

async function setTier(planName) {
  const plan = await db('tbl_subscription_plan_master').where({ Plan_Name: planName }).first();
  await db('tbl_tenant_subscription').where({ Tenant_ID: tenant.tenantId }).del();
  await db('tbl_tenant_subscription').insert({ Tenant_ID: tenant.tenantId, Plan_ID: plan.Plan_ID, Start_Date: new Date(), Status: 'Active' });
}

test('no subscription assigned → modules list still returns (non-breaking for ungated tenants)', async () => {
  const res = await request(app).get('/api/modules').set('Authorization', `Bearer ${token}`);
  expect(res.status).toBe(200);
  expect(Array.isArray(res.body.data.modules)).toBe(true);
  expect(res.body.data.subscriptionTier).toBeNull();
});

test('Gold tier shows fewer modules than Platinum, which shows fewer than Diamond', async () => {
  await setTier('Gold');
  const gold = await request(app).get('/api/modules').set('Authorization', `Bearer ${token}`);
  expect(gold.body.data.subscriptionTier).toBe('Gold');
  const goldCount = gold.body.data.modules.filter((m) => m.Is_Enabled).length;

  await setTier('Platinum');
  const platinum = await request(app).get('/api/modules').set('Authorization', `Bearer ${token}`);
  const platinumCount = platinum.body.data.modules.filter((m) => m.Is_Enabled).length;

  await setTier('Diamond');
  const diamond = await request(app).get('/api/modules').set('Authorization', `Bearer ${token}`);
  const diamondCount = diamond.body.data.modules.filter((m) => m.Is_Enabled).length;

  expect(goldCount).toBeLessThan(platinumCount);
  expect(platinumCount).toBeLessThan(diamondCount);
});

test('a Diamond-only module (e.g. audit_logs) is disabled on Gold and enabled on Diamond', async () => {
  await setTier('Gold');
  const gold = await request(app).get('/api/modules').set('Authorization', `Bearer ${token}`);
  const goldAudit = gold.body.data.modules.find((m) => m.Module_Key === 'audit_logs');
  expect(goldAudit?.Is_Enabled).toBeFalsy();

  await setTier('Diamond');
  const diamond = await request(app).get('/api/modules').set('Authorization', `Bearer ${token}`);
  const diamondAudit = diamond.body.data.modules.find((m) => m.Module_Key === 'audit_logs');
  expect(diamondAudit?.Is_Enabled).toBe(true);
});

test('super-admin tier-change endpoint is rejected for a non-super-admin token', async () => {
  const res = await request(app)
    .put(`/api/modules/tier/${tenant.tenantId}`)
    .set('Authorization', `Bearer ${token}`)
    .send({ planId: 4 });
  expect(res.status).toBe(403);
});

// GET /api/modules, /tenant-context, PUT /:key and POST /provision all
// accept an optional ?tenantId= override so a Super Admin can manage a real
// customer instead of only ever their own tenant (see modules.js's
// resolveTenantId). This is the backstop half of that fix: a non-super-admin
// passing the same param must be silently ignored, never honored — QATEST
// must never be able to read or affect DLJ's real modules this way.
test('a non-super-admin cannot use ?tenantId= to read another tenant\'s modules', async () => {
  // QATEST is on Diamond (set by the previous test); the real DLJ tenant is
  // on a completely different, independently-managed plan. If the override
  // were honored, this response would report DLJ's tier instead of QATEST's own.
  const own = await request(app).get('/api/modules').set('Authorization', `Bearer ${token}`);
  const withOverride = await request(app).get('/api/modules?tenantId=DLJ').set('Authorization', `Bearer ${token}`);
  expect(withOverride.status).toBe(200);
  expect(withOverride.body.data.subscriptionTier).toBe(own.body.data.subscriptionTier);
});

test('a non-super-admin cannot use ?tenantId= to toggle another tenant\'s module', async () => {
  const res = await request(app).put('/api/modules/inventory?tenantId=DLJ').set('Authorization', `Bearer ${token}`).send({ enabled: false });
  // Whatever the outcome, it must have landed on QATEST, never DLJ.
  const dljOverride = await db('tbl_tenant_modules').where({ Tenant_ID: 'DLJ', Module_Key: 'inventory' }).first();
  const qatestOverride = await db('tbl_tenant_modules').where({ Tenant_ID: tenant.tenantId, Module_Key: 'inventory' }).first();
  expect(dljOverride).toBeUndefined();
  expect(qatestOverride).toBeDefined();
});
