/**
 * requireModuleAccess() was wired into Pawnbroking as the first, fully-
 * real example in an earlier batch; this proves the remaining 10 modules
 * in PermissionsPage.jsx's own MODULE_KEYS list all actually enforce it
 * too, not just that the routes were edited — one representative route
 * per module, both directions (an override can restrict below the
 * caller's normal access).
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

async function setOverride(moduleKey, overrides) {
  return request(app).post('/api/permissions/overrides').set(auth()).send({
    User_ID: tenant.userId, Module_Key: moduleKey,
    Can_View: false, Can_Add: false, Can_Edit: false, Can_Delete: false, Can_Approve: false,
    ...overrides,
  });
}

const CASES = [
  { moduleKey: 'insurance_amc', method: 'get', path: '/api/insurance-amc/policies' },
  { moduleKey: 'hr_payroll', method: 'get', path: '/api/hr/staff' },
  { moduleKey: 'crm', method: 'get', path: '/api/crm/leads' },
  { moduleKey: 'bank_cheque', method: 'get', path: '/api/bank-cheque/accounts' },
  { moduleKey: 'rate_booking_agent_commission', method: 'get', path: '/api/rate-agent/agents' },
  { moduleKey: 'hsn_einvoice_loyalty', method: 'get', path: '/api/compliance/hsn' },
  { moduleKey: 'manufacturing_bom', method: 'get', path: '/api/manufacturing/departments' },
  { moduleKey: 'guarantor_certification', method: 'get', path: '/api/inventory-ops/certificates' },
  { moduleKey: 'reorder_rfid_card_charges', method: 'get', path: '/api/inventory-ops/reorder-requests' },
  { moduleKey: 'tally_bridge', method: 'get', path: '/api/tally/config' },
];

for (const { moduleKey, method, path } of CASES) {
  test(`${moduleKey}: unrestricted by default, then a Can_View=false override actually blocks it`, async () => {
    const before = await request(app)[method](path).set(auth());
    expect(before.status).toBe(200);

    await setOverride(moduleKey, { Can_View: false });
    const after = await request(app)[method](path).set(auth());
    expect(after.status).toBe(403);

    // Restore so it doesn't affect other tests sharing this tenant/user.
    await setOverride(moduleKey, { Can_View: true });
    const restored = await request(app)[method](path).set(auth());
    expect(restored.status).toBe(200);
  });
}
