/**
 * Super-Admin-only per-device Image App licensing
 * (GET /api/device-licenses, POST /:id/approve|revoke|reject) —
 * see src/routes/deviceLicenses.js. A device files a request (out of scope
 * here — that's POST /api/mobile/request-device-access) and Super Admin
 * reviews it here: approve mints a device-bound License_Key, revoke/reject
 * lock it back out.
 */
const request = require('supertest');
const bcrypt = require('bcryptjs');
const { app } = require('../src/index');
const db = require('../src/db/knex');
const testTenant = require('./helpers/testTenant');

let tenant, saToken, tenantToken, saUserId;
const saAuth = () => ({ Authorization: `Bearer ${saToken}` });
const tenantAuth = () => ({ Authorization: `Bearer ${tenantToken}` });

const SA_USERNAME = 'qatest_sa_devicelicenses';
const SA_PASSWORD = 'QaTestSA@2026dl';

async function insertDeviceLicenseRequest(overrides = {}) {
  const [row] = await db('tbl_device_licenses')
    .insert({
      Tenant_ID: tenant.tenantId,
      Device_ID: `qa-device-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      Device_Model: 'QA Test Tablet',
      Device_Label: 'QA Counter',
      Status: 'PENDING',
      Contact_Note: 'QA test request',
      ...overrides,
    })
    .returning('*');
  return row;
}

beforeAll(async () => {
  tenant = await testTenant.setup();

  const role = await db('tbl_role_master').where({ Role_Name: 'Super Admin' }).first();
  const salt = await bcrypt.genSalt(10);
  const hash = await bcrypt.hash(SA_PASSWORD, salt);
  const [saUser] = await db('tbl_user_master').insert({
    Tenant_ID: 'SA_MASTER', Username: SA_USERNAME, Password_Hash: hash, Password_Salt: salt,
    Role_ID: role.Role_ID, Full_Name: 'QA Test SA (device licenses)', Is_Active: true, Is_Admin: true,
    Created_By: 'test',
  }).returning('*');
  saUserId = saUser.User_ID;

  const saRes = await request(app).post('/api/auth/login').send({ username: SA_USERNAME, password: SA_PASSWORD, tenantId: 'SA_MASTER' });
  saToken = saRes.body.data.token;

  const tRes = await request(app).post('/api/auth/login').send({ username: tenant.username, password: tenant.password, tenantId: tenant.tenantId });
  tenantToken = tRes.body.data.token;
});

afterAll(async () => {
  await db('tbl_audit_log').where({ Tenant_ID: tenant.tenantId }).whereIn('Table_Name', ['tbl_device_licenses']).del();
  await db('tbl_device_licenses').where({ Tenant_ID: tenant.tenantId }).del();
  if (saUserId) await db('tbl_user_master').where({ User_ID: saUserId }).del();
  await testTenant.teardown();
  await db.destroy();
});

describe('permission gate — Super Admin only', () => {
  test('a regular tenant user cannot list device license requests', async () => {
    const res = await request(app).get('/api/device-licenses').set(tenantAuth());
    expect(res.status).toBe(403);
  });

  test('a regular tenant user cannot approve/revoke/reject', async () => {
    const row = await insertDeviceLicenseRequest();
    const approve = await request(app).post(`/api/device-licenses/${row.Device_License_ID}/approve`).set(tenantAuth());
    const revoke = await request(app).post(`/api/device-licenses/${row.Device_License_ID}/revoke`).set(tenantAuth());
    const reject = await request(app).post(`/api/device-licenses/${row.Device_License_ID}/reject`).set(tenantAuth());
    expect(approve.status).toBe(403);
    expect(revoke.status).toBe(403);
    expect(reject.status).toBe(403);
  });

  test('an unauthenticated caller is rejected before the Super Admin check', async () => {
    const res = await request(app).get('/api/device-licenses');
    expect(res.status).toBe(401);
  });
});

describe('GET /api/device-licenses', () => {
  test('lists requests for this tenant, newest first, joined with Company_Name', async () => {
    await insertDeviceLicenseRequest({ Device_Label: 'Older request', Requested_Date: new Date(Date.now() - 60000) });
    const newer = await insertDeviceLicenseRequest({ Device_Label: 'Newer request' });

    const res = await request(app).get('/api/device-licenses').set(saAuth()).query({ tenantId: tenant.tenantId });
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(2);
    expect(res.body.data[0].Device_License_ID).toBe(newer.Device_License_ID); // newest first
    expect(res.body.data.every((r) => r.Company_Name === 'QA Test Tenant')).toBe(true);
  });

  test('?status= filters correctly', async () => {
    const approved = await insertDeviceLicenseRequest({ Status: 'APPROVED', License_Key: 'IMGDEV-PRESET1' });
    const res = await request(app).get('/api/device-licenses').set(saAuth()).query({ tenantId: tenant.tenantId, status: 'APPROVED' });
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    expect(res.body.data.every((r) => r.Status === 'APPROVED')).toBe(true);
    expect(res.body.data.some((r) => r.Device_License_ID === approved.Device_License_ID)).toBe(true);
  });

  test('?tenantId= filtering excludes other tenants (sanity: no cross-tenant leakage into an unrelated tenantId)', async () => {
    const res = await request(app).get('/api/device-licenses').set(saAuth()).query({ tenantId: 'SA_MASTER' });
    expect(res.status).toBe(200);
    expect(res.body.data.every((r) => r.Tenant_ID !== tenant.tenantId)).toBe(true);
  });
});

describe('POST /api/device-licenses/:id/approve', () => {
  test('happy path: approves a pending request, mints a device-bound License_Key, records who/when, and audits it', async () => {
    const row = await insertDeviceLicenseRequest();
    const res = await request(app).post(`/api/device-licenses/${row.Device_License_ID}/approve`).set(saAuth());

    expect(res.status).toBe(200);
    expect(res.body.data.Status).toBe('APPROVED');
    expect(res.body.data.License_Key).toMatch(/^IMGDEV-[0-9A-F]{16}$/);
    expect(res.body.data.Approved_By).toBe(SA_USERNAME);
    expect(res.body.data.Approved_Date).toBeTruthy();

    const dbRow = await db('tbl_device_licenses').where({ Device_License_ID: row.Device_License_ID }).first();
    expect(dbRow.Status).toBe('APPROVED');
    expect(dbRow.License_Key).toBe(res.body.data.License_Key);

    const auditRow = await db('tbl_audit_log')
      .where({ Tenant_ID: tenant.tenantId, Table_Name: 'tbl_device_licenses', Action_Type: 'APPROVE', Record_ID: String(row.Device_License_ID) })
      .first();
    expect(auditRow).toBeDefined();
  });

  test('404 on a request id that does not exist', async () => {
    const res = await request(app).post('/api/device-licenses/9999999/approve').set(saAuth());
    expect(res.status).toBe(404);
  });

  test('400 on approving an already-approved request (no guard bypass, no key re-issued)', async () => {
    const row = await insertDeviceLicenseRequest();
    const first = await request(app).post(`/api/device-licenses/${row.Device_License_ID}/approve`).set(saAuth());
    expect(first.status).toBe(200);

    const second = await request(app).post(`/api/device-licenses/${row.Device_License_ID}/approve`).set(saAuth());
    expect(second.status).toBe(400);
    expect(second.body.message).toMatch(/already approved/i);

    const dbRow = await db('tbl_device_licenses').where({ Device_License_ID: row.Device_License_ID }).first();
    expect(dbRow.License_Key).toBe(first.body.data.License_Key); // untouched by the rejected re-approve attempt
  });
});

describe('POST /api/device-licenses/:id/revoke', () => {
  test('happy path: revokes an approved device, recording who/when, and audits it', async () => {
    const row = await insertDeviceLicenseRequest({ Status: 'APPROVED', License_Key: 'IMGDEV-REVOKEME01' });
    const res = await request(app).post(`/api/device-licenses/${row.Device_License_ID}/revoke`).set(saAuth());

    expect(res.status).toBe(200);
    expect(res.body.data.Status).toBe('REVOKED');
    expect(res.body.data.Revoked_By).toBe(SA_USERNAME);
    expect(res.body.data.Revoked_Date).toBeTruthy();

    const auditRow = await db('tbl_audit_log')
      .where({ Tenant_ID: tenant.tenantId, Table_Name: 'tbl_device_licenses', Action_Type: 'REVOKE', Record_ID: String(row.Device_License_ID) })
      .first();
    expect(auditRow).toBeDefined();
  });

  test('404 on a request id that does not exist', async () => {
    const res = await request(app).post('/api/device-licenses/9999999/revoke').set(saAuth());
    expect(res.status).toBe(404);
  });

  test('BUG (flagged for review): revoke has no status guard — a still-PENDING (never-approved) request can be flipped straight to REVOKED', async () => {
    const row = await insertDeviceLicenseRequest({ Status: 'PENDING' });
    const res = await request(app).post(`/api/device-licenses/${row.Device_License_ID}/revoke`).set(saAuth());
    // Current (unguarded) behavior: this succeeds even though the device was
    // never approved in the first place. Arguably /revoke should only apply
    // to Status='APPROVED', mirroring /reject's Status==='PENDING' guard.
    // Flagging rather than fixing: unclear whether ops relies on being able
    // to revoke a pending request as a "kill it, don't let it get approved
    // later" action, which is a legitimate use case too.
    expect(res.status).toBe(200);
    expect(res.body.data.Status).toBe('REVOKED');
  });
});

describe('POST /api/device-licenses/:id/reject', () => {
  test('happy path: rejects a pending request', async () => {
    const row = await insertDeviceLicenseRequest();
    const res = await request(app).post(`/api/device-licenses/${row.Device_License_ID}/reject`).set(saAuth());
    expect(res.status).toBe(200);
    expect(res.body.data.Status).toBe('REJECTED');
    expect(res.body.data.Revoked_By).toBe(SA_USERNAME);
  });

  test('404 on a request id that does not exist', async () => {
    const res = await request(app).post('/api/device-licenses/9999999/reject').set(saAuth());
    expect(res.status).toBe(404);
  });

  test('400 on rejecting a non-pending (already approved) request', async () => {
    const row = await insertDeviceLicenseRequest({ Status: 'APPROVED', License_Key: 'IMGDEV-ALREADYOK1' });
    const res = await request(app).post(`/api/device-licenses/${row.Device_License_ID}/reject`).set(saAuth());
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/only a pending request/i);
  });

  test('FIXED: approve refuses a previously-REJECTED request instead of silently reinstating it', async () => {
    const row = await insertDeviceLicenseRequest();
    const rejected = await request(app).post(`/api/device-licenses/${row.Device_License_ID}/reject`).set(saAuth());
    expect(rejected.body.data.Status).toBe('REJECTED');

    const approved = await request(app).post(`/api/device-licenses/${row.Device_License_ID}/approve`).set(saAuth());
    expect(approved.status).toBe(400);
    expect(approved.body.message).toMatch(/already rejected/i);

    const dbRow = await db('tbl_device_licenses').where({ Device_License_ID: row.Device_License_ID }).first();
    expect(dbRow.Status).toBe('REJECTED'); // untouched by the refused re-approve attempt
  });

  test('FIXED: approve also refuses a previously-REVOKED request the same way', async () => {
    const row = await insertDeviceLicenseRequest({ Status: 'REVOKED', License_Key: 'IMGDEV-WASREVOKED1' });
    const res = await request(app).post(`/api/device-licenses/${row.Device_License_ID}/approve`).set(saAuth());
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/already revoked/i);
  });
});
