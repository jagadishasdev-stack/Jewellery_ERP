/**
 * PLATFORM_SAAS_INVOICE — the ERP provider's own GST invoice TO a tenant
 * (software/subscription billing, product-wise). Isolated on purpose from
 * every tenant-facing document type: strictly Super Admin only (not even
 * a Tenant Management permission exception, unlike BARCODE_LABEL), and
 * always saved with Tenant_ID = null regardless of what's sent — see
 * invoiceStudio.js's requireSuperAdminForLabel / isPlatformOnlyDocType.
 *
 * The specific leak this guards against: GET /resolve/:docType falls back
 * to the shared Tenant_ID IS NULL row for every OTHER doc type (that's
 * the intended "global default" behavior) — without an explicit carve-out,
 * a regular tenant resolving PLATFORM_SAAS_INVOICE would hit that same
 * fallback and get back the platform's own billing template.
 *
 * NOTE: a REAL PLATFORM_SAAS_INVOICE template already exists in this DB
 * (the actual admin designed one) — this suite deliberately never assumes
 * a clean slate, and restores whichever template was the real default
 * before this test ran, in afterAll, so a test run never leaves the
 * platform's actual billing template un-defaulted.
 */
const request = require('supertest');
const bcrypt = require('bcryptjs');
const { app } = require('../src/index');
const db = require('../src/db/knex');
const testTenant = require('./helpers/testTenant');

const SA_USERNAME = 'qa_temp_sa_platforminvtest';
let saToken;
let tenant;
let tenantToken;
let templateId;
let previousDefaultId;

beforeAll(async () => {
  const saRole = await db('tbl_role_master').where({ Role_Name: 'Super Admin' }).first();
  const salt = bcrypt.genSaltSync(10);
  await db('tbl_user_master').where({ Username: SA_USERNAME }).del();
  await db('tbl_user_master').insert({
    Tenant_ID: 'SA_MASTER', Username: SA_USERNAME, Password_Hash: bcrypt.hashSync('TempSA@PlatInvT1', salt), Password_Salt: salt,
    Role_ID: saRole.Role_ID, Full_Name: 'QA Temp SA (platform billing test)', Is_Active: true, Is_Admin: true,
  });
  const saLogin = await request(app).post('/api/auth/login').send({ username: SA_USERNAME, password: 'TempSA@PlatInvT1', tenantId: 'SA_MASTER' });
  saToken = saLogin.body.data.token;

  tenant = await testTenant.setup();
  const tLogin = await request(app).post('/api/auth/login').send({ username: tenant.username, password: tenant.password, tenantId: tenant.tenantId });
  tenantToken = tLogin.body.data.token;

  const existingDefault = await db('tbl_invoice_studio_templates')
    .whereNull('Tenant_ID').where({ Document_Type: 'PLATFORM_SAAS_INVOICE', Is_Default: true }).first();
  previousDefaultId = existingDefault?.Template_ID || null;
});

afterAll(async () => {
  if (templateId) await db('tbl_invoice_studio_templates').where({ Template_ID: templateId }).del();
  // Restore whichever template was the real default before this suite ran
  // — the "explicit Set-as-Default" test below deliberately steals it.
  if (previousDefaultId) await db('tbl_invoice_studio_templates').where({ Template_ID: previousDefaultId }).update({ Is_Default: true });
  await db('tbl_user_master').where({ Username: SA_USERNAME }).del();
  await testTenant.teardown();
  await db.destroy();
});

test('a regular tenant cannot create a PLATFORM_SAAS_INVOICE template', async () => {
  const res = await request(app).post('/api/invoice-studio/templates').set('Authorization', `Bearer ${tenantToken}`)
    .send({ Template_Name: 'Sneaky', Document_Type: 'PLATFORM_SAAS_INVOICE', Layout_JSON: [] });
  expect(res.status).toBe(403);
});

test('a regular tenant resolving PLATFORM_SAAS_INVOICE gets 404, never the platform template', async () => {
  const res = await request(app).get('/api/invoice-studio/resolve/PLATFORM_SAAS_INVOICE').set('Authorization', `Bearer ${tenantToken}`);
  expect(res.status).toBe(404);
});

test('Super Admin CAN create one, and it lands with Tenant_ID = null (never tenant-scoped, even with a stray ?tenantId=)', async () => {
  const res = await request(app).post(`/api/invoice-studio/templates?tenantId=${tenant.tenantId}`).set('Authorization', `Bearer ${saToken}`)
    .send({ Template_Name: 'QA Test SaaS Invoice', Document_Type: 'PLATFORM_SAAS_INVOICE', Layout_JSON: [{ id: 'header' }] });
  expect(res.status).toBe(201);
  expect(res.body.data.Tenant_ID).toBeNull();
  templateId = res.body.data.Template_ID;
});

test('REGRESSION: Set-as-Default works with NO ?tenantId= at all — exactly how InvoiceStudio.jsx\'s Platform Billing panel calls it (it never sets managedTenantId, since this doc type has no "on behalf of a tenant" concept)', async () => {
  // Without findTemplateForWrite's fallback, this 404s: Super Admin's own
  // login tenant is SA_MASTER (not null), so the plain tenant-scoped
  // lookup misses a Tenant_ID=null row entirely — every edit of an
  // already-saved Platform Billing template would have 404'd forever.
  const setDefault = await request(app).put(`/api/invoice-studio/templates/${templateId}`).set('Authorization', `Bearer ${saToken}`)
    .send({ Is_Default: true });
  expect(setDefault.status).toBe(200);

  const res = await request(app).get('/api/invoice-studio/resolve/PLATFORM_SAAS_INVOICE').set('Authorization', `Bearer ${saToken}`);
  expect(res.status).toBe(200);
  expect(res.body.data.Template_Name).toBe('QA Test SaaS Invoice');
});

test('the tenant STILL cannot resolve it after Super Admin saved + defaulted one — the exact leak this isolation guards against', async () => {
  const res = await request(app).get('/api/invoice-studio/resolve/PLATFORM_SAAS_INVOICE').set('Authorization', `Bearer ${tenantToken}`);
  expect(res.status).toBe(404);
});

test('a regular tenant cannot update it either, even by guessing the Template_ID — the lookup itself is tenant-scoped, so this is a 404, not a 403', async () => {
  const res = await request(app).put(`/api/invoice-studio/templates/${templateId}`).set('Authorization', `Bearer ${tenantToken}`)
    .send({ Is_Default: true });
  expect(res.status).toBe(404);
});
