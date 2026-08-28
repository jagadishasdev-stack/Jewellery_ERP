/**
 * server/src/routes/license.js — zero coverage before this file.
 * POST /validate (public, used by desktop/device clients to check a license
 * key), GET /info (tenant's own license), POST /create + POST /revoke
 * (Super Admin only).
 *
 * FIXED as part of this pass: POST /revoke used to run a blind UPDATE with
 * no existence check and returned `null` on success — a caller revoking an
 * already-nonexistent or typo'd license key got a misleading 200 "License
 * revoked successfully" with no data, instead of a 404. Now checks
 * existence first and returns the updated row.
 */
const request = require('supertest');
const bcrypt = require('bcryptjs');
const { app } = require('../src/index');
const db = require('../src/db/knex');
const testTenant = require('./helpers/testTenant');

const SA_USERNAME = 'qa_temp_sa_licensetest';
let saToken, tenant, tenantToken;

beforeAll(async () => {
  const saRole = await db('tbl_role_master').where({ Role_Name: 'Super Admin' }).first();
  const salt = bcrypt.genSaltSync(10);
  await db('tbl_user_master').where({ Username: SA_USERNAME }).del();
  await db('tbl_user_master').insert({
    Tenant_ID: 'SA_MASTER', Username: SA_USERNAME, Password_Hash: bcrypt.hashSync('TempSA@LicT1', salt), Password_Salt: salt,
    Role_ID: saRole.Role_ID, Full_Name: 'QA Temp SA (license test)', Is_Active: true, Is_Admin: true,
  });
  const saLogin = await request(app).post('/api/auth/login').send({ username: SA_USERNAME, password: 'TempSA@LicT1', tenantId: 'SA_MASTER' });
  saToken = saLogin.body.data.token;

  tenant = await testTenant.setup();
  const tLogin = await request(app).post('/api/auth/login').send({ username: tenant.username, password: tenant.password, tenantId: tenant.tenantId });
  tenantToken = tLogin.body.data.token;
});

afterAll(async () => {
  await db('tbl_user_master').where({ Username: SA_USERNAME }).del();
  // tbl_license_master.Tenant_ID cascades from tbl_tenant_master (ON DELETE
  // CASCADE, see migrations/002_create_tenant_tables.js) so testTenant's own
  // teardown() below is enough to clean up every license row this file creates.
  await testTenant.teardown();
  await db.destroy();
});

describe('POST /api/license/validate', () => {
  test('rejects with no license key', async () => {
    const res = await request(app).post('/api/license/validate').send({});
    expect(res.status).toBe(400);
  });

  test('404 for an unknown license key', async () => {
    const res = await request(app).post('/api/license/validate').send({ licenseKey: 'NOPE-0000-XXX-0000' });
    expect(res.status).toBe(404);
  });

  test('validates a real, active license and stamps Last_Verified', async () => {
    const [lic] = await db('tbl_license_master').insert({
      License_Key: `QAT-VALIDATE-${tenant.tenantId}`, Tenant_ID: tenant.tenantId, License_Type: 'Yearly',
      Issued_Date: new Date(), Expiry_Date: new Date(Date.now() + 30 * 24 * 3600 * 1000),
      Max_Users: 5, Max_Branches: 2, Is_Active: true,
    }).returning('*');

    const res = await request(app).post('/api/license/validate').send({ licenseKey: lic.License_Key });
    expect(res.status).toBe(200);
    expect(res.body.data.isValid).toBe(true);
    expect(res.body.data.tenantId).toBe(tenant.tenantId);
    expect(res.body.data.maxUsers).toBe(5);

    const reloaded = await db('tbl_license_master').where({ License_ID: lic.License_ID }).first();
    expect(reloaded.Last_Verified).toBeTruthy();
  });

  test('rejects a revoked license', async () => {
    const [lic] = await db('tbl_license_master').insert({
      License_Key: `QAT-REVOKED-${tenant.tenantId}`, Tenant_ID: tenant.tenantId, License_Type: 'Yearly',
      Issued_Date: new Date(), Expiry_Date: new Date(Date.now() + 30 * 24 * 3600 * 1000),
      Max_Users: 5, Max_Branches: 2, Is_Active: false, Is_Revoked: true, Revocation_Reason: 'QA seeded revoked',
    }).returning('*');

    const res = await request(app).post('/api/license/validate').send({ licenseKey: lic.License_Key });
    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/revoked/i);
  });

  test('rejects an expired license', async () => {
    const [lic] = await db('tbl_license_master').insert({
      License_Key: `QAT-EXPIRED-${tenant.tenantId}`, Tenant_ID: tenant.tenantId, License_Type: 'Yearly',
      Issued_Date: new Date(Date.now() - 400 * 24 * 3600 * 1000), Expiry_Date: new Date(Date.now() - 1 * 24 * 3600 * 1000),
      Max_Users: 5, Max_Branches: 2, Is_Active: true,
    }).returning('*');

    const res = await request(app).post('/api/license/validate').send({ licenseKey: lic.License_Key });
    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/expired/i);
  });

  test('rejects when bound to a different machine', async () => {
    const [lic] = await db('tbl_license_master').insert({
      License_Key: `QAT-HWBOUND-${tenant.tenantId}`, Tenant_ID: tenant.tenantId, License_Type: 'Yearly',
      Issued_Date: new Date(), Expiry_Date: new Date(Date.now() + 30 * 24 * 3600 * 1000),
      Max_Users: 5, Max_Branches: 2, Is_Active: true, Hardware_ID: 'MACHINE-A',
    }).returning('*');

    const res = await request(app).post('/api/license/validate').send({ licenseKey: lic.License_Key, machineId: 'MACHINE-B' });
    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/different machine/i);
  });
});

describe('GET /api/license/info', () => {
  test('requires auth', async () => {
    const res = await request(app).get('/api/license/info');
    expect(res.status).toBe(401);
  });

  test('returns the tenant\'s license with the furthest-out expiry (GET /info orders by Expiry_Date desc) and computes daysLeft', async () => {
    // Other tests in this file seed shorter-lived licenses for the same
    // tenant — give this one a much longer expiry so it's unambiguously the
    // one /info picks, rather than depending on test execution order.
    await db('tbl_license_master').insert({
      License_Key: `QAT-INFO-${tenant.tenantId}`, Tenant_ID: tenant.tenantId, License_Type: 'Perpetual',
      Issued_Date: new Date(), Expiry_Date: new Date(Date.now() + 3650 * 24 * 3600 * 1000),
      Max_Users: 5, Max_Branches: 2, Is_Active: true,
    });

    const res = await request(app).get('/api/license/info').set('Authorization', `Bearer ${tenantToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.Tenant_ID).toBe(tenant.tenantId);
    expect(res.body.data.License_Key).toBe(`QAT-INFO-${tenant.tenantId}`);
    expect(res.body.data.daysLeft).toBeGreaterThan(3600);
  });
});

describe('POST /api/license/create', () => {
  test('a regular tenant user cannot create a license', async () => {
    const res = await request(app).post('/api/license/create').set('Authorization', `Bearer ${tenantToken}`)
      .send({ tenantId: tenant.tenantId, licenseType: 'Yearly', expiryDate: '2027-01-01', maxUsers: 5, maxBranches: 1 });
    expect(res.status).toBe(403);
  });

  test('validates required fields', async () => {
    const res = await request(app).post('/api/license/create').set('Authorization', `Bearer ${saToken}`).send({});
    expect(res.status).toBe(422);
  });

  test('404 for an unknown tenant', async () => {
    const res = await request(app).post('/api/license/create').set('Authorization', `Bearer ${saToken}`)
      .send({ tenantId: 'QA_NO_SUCH_TENANT', licenseType: 'Yearly', expiryDate: '2027-01-01', maxUsers: 5, maxBranches: 1 });
    expect(res.status).toBe(404);
  });

  test('creates a license, generates a formatted key, and syncs it onto the tenant row', async () => {
    const res = await request(app).post('/api/license/create').set('Authorization', `Bearer ${saToken}`)
      .send({ tenantId: tenant.tenantId, licenseType: 'Yearly', expiryDate: '2027-06-30', maxUsers: 8, maxBranches: 3, hardwareId: 'HW-QA-1' });
    expect(res.status).toBe(201);
    expect(res.body.data.License_Key).toMatch(/^QAT-\d{4}-YEA-[0-9A-F]{8}$/);
    expect(res.body.data.Tenant_ID).toBe(tenant.tenantId);

    const updatedTenant = await db('tbl_tenant_master').where({ Tenant_ID: tenant.tenantId }).first();
    expect(updatedTenant.License_Key).toBe(res.body.data.License_Key);
    expect(updatedTenant.Max_Users).toBe(8);
    expect(updatedTenant.Max_Branches).toBe(3);
  });
});

describe('POST /api/license/revoke', () => {
  test('a regular tenant user cannot revoke a license', async () => {
    const res = await request(app).post('/api/license/revoke').set('Authorization', `Bearer ${tenantToken}`).send({ licenseKey: 'whatever' });
    expect(res.status).toBe(403);
  });

  test('400 with no license key', async () => {
    const res = await request(app).post('/api/license/revoke').set('Authorization', `Bearer ${saToken}`).send({});
    expect(res.status).toBe(400);
  });

  /**
   * FIXED: this used to run a blind UPDATE with no existence check and
   * return `sendSuccess(res, null, 'License revoked successfully.')` even
   * for a license key that never existed — a Super Admin who typo'd a key
   * got a false-positive success. Now checks existence first.
   */
  test('FIXED: 404 for a license key that does not exist, instead of a false-positive success', async () => {
    const res = await request(app).post('/api/license/revoke').set('Authorization', `Bearer ${saToken}`)
      .send({ licenseKey: 'QAT-DOES-NOT-EXIST-0000' });
    expect(res.status).toBe(404);
  });

  test('FIXED: revokes a real license and returns the updated row (used to return null)', async () => {
    const [lic] = await db('tbl_license_master').insert({
      License_Key: `QAT-REVOKEME-${tenant.tenantId}`, Tenant_ID: tenant.tenantId, License_Type: 'Monthly',
      Issued_Date: new Date(), Expiry_Date: new Date(Date.now() + 30 * 24 * 3600 * 1000),
      Max_Users: 5, Max_Branches: 1, Is_Active: true,
    }).returning('*');

    const res = await request(app).post('/api/license/revoke').set('Authorization', `Bearer ${saToken}`)
      .send({ licenseKey: lic.License_Key, reason: 'QA test revoke' });
    expect(res.status).toBe(200);
    expect(res.body.data).toBeTruthy(); // used to be null
    expect(res.body.data.Is_Revoked).toBe(true);
    expect(res.body.data.Is_Active).toBe(false);
    expect(res.body.data.Revocation_Reason).toBe('QA test revoke');

    const reloaded = await db('tbl_license_master').where({ License_ID: lic.License_ID }).first();
    expect(reloaded.Is_Revoked).toBe(true);
  });

  test('defaults Revocation_Reason when none given', async () => {
    const [lic] = await db('tbl_license_master').insert({
      License_Key: `QAT-REVOKEME2-${tenant.tenantId}`, Tenant_ID: tenant.tenantId, License_Type: 'Monthly',
      Issued_Date: new Date(), Expiry_Date: new Date(Date.now() + 30 * 24 * 3600 * 1000),
      Max_Users: 5, Max_Branches: 1, Is_Active: true,
    }).returning('*');

    const res = await request(app).post('/api/license/revoke').set('Authorization', `Bearer ${saToken}`).send({ licenseKey: lic.License_Key });
    expect(res.status).toBe(200);
    expect(res.body.data.Revocation_Reason).toBe('Revoked by Super Admin');
  });
});
