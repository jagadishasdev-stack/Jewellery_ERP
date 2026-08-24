/**
 * Barcode label template self-service (server/src/routes/invoiceStudio.js).
 *
 * Every tenant can now design their own BARCODE_LABEL template — previously
 * Super-Admin-only. The property actually worth locking in isn't "can a
 * tenant admin save a template" (that's true of every other doc type
 * already) — it's that a tenant admin can NEVER reach the shared global
 * default or another tenant's row, even by passing ?tenantId= by hand,
 * and that a lower-privilege role (no tenant_management) is still blocked.
 */
const request = require('supertest');
const bcrypt = require('bcryptjs');
const { app } = require('../src/index');
const db = require('../src/db/knex');
const testTenant = require('./helpers/testTenant');

let tenant;
let adminToken;
let billingToken;
let globalTemplateId;

beforeAll(async () => {
  tenant = await testTenant.setup(); // Client Admin — has tenant_management

  const login = await request(app).post('/api/auth/login').send({ username: tenant.username, password: tenant.password, tenantId: tenant.tenantId });
  adminToken = login.body.data.token;

  // A second, lower-privilege QATEST user with no tenant_management permission.
  const billingRole = await db('tbl_role_master').where({ Role_Name: 'Billing Operator' }).first();
  const salt = bcrypt.genSaltSync(10);
  await db('tbl_user_master').insert({
    Tenant_ID: tenant.tenantId, Username: 'qatest_billing', Password_Hash: bcrypt.hashSync('Billing@2026', salt), Password_Salt: salt,
    Role_ID: billingRole.Role_ID, Full_Name: 'QA Billing', Is_Active: true,
  });
  const billingLogin = await request(app).post('/api/auth/login').send({ username: 'qatest_billing', password: 'Billing@2026', tenantId: tenant.tenantId });
  billingToken = billingLogin.body.data.token;

  const globalTemplate = await db('tbl_invoice_studio_templates').where({ Document_Type: 'BARCODE_LABEL' }).whereNull('Tenant_ID').first();
  globalTemplateId = globalTemplate.Template_ID;
});

afterAll(async () => {
  await testTenant.teardown();
  await db.destroy();
});

test('a role without tenant_management is rejected outright', async () => {
  const res = await request(app).post('/api/invoice-studio/templates').set('Authorization', `Bearer ${billingToken}`)
    .send({ Template_Name: 'Should Fail', Document_Type: 'BARCODE_LABEL', Layout_JSON: { blocks: [] } });
  expect(res.status).toBe(403);
});

test('tenant_management holder can create their own label template, scoped to their own tenant', async () => {
  const res = await request(app).post('/api/invoice-studio/templates').set('Authorization', `Bearer ${adminToken}`)
    .send({ Template_Name: 'QATEST Tag', Document_Type: 'BARCODE_LABEL', Is_Default: true, Layout_JSON: { canvasWidthMm: 40, canvasHeightMm: 25, blocks: [] } });
  expect(res.status).toBe(201);
  expect(res.body.data.Tenant_ID).toBe(tenant.tenantId);
});

test('cannot hijack the global default via ?tenantId=null — the row is simply not found', async () => {
  const res = await request(app).put(`/api/invoice-studio/templates/${globalTemplateId}?tenantId=null`).set('Authorization', `Bearer ${adminToken}`)
    .send({ Template_Name: 'HIJACKED', Layout_JSON: { blocks: [] } });
  expect(res.status).toBe(404);

  const stillIntact = await db('tbl_invoice_studio_templates').where({ Template_ID: globalTemplateId }).first();
  expect(stillIntact.Template_Name).not.toBe('HIJACKED');
});

test('resolve() returns the tenant\'s own default template, not the global one, once they have their own', async () => {
  const res = await request(app).get('/api/invoice-studio/resolve/BARCODE_LABEL').set('Authorization', `Bearer ${adminToken}`);
  expect(res.status).toBe(200);
  expect(res.body.data.Tenant_ID).toBe(tenant.tenantId);
  expect(res.body.data.Template_ID).not.toBe(globalTemplateId);
});

test('the global default is untouched by any of the above', async () => {
  const row = await db('tbl_invoice_studio_templates').where({ Template_ID: globalTemplateId }).first();
  expect(row.Is_Active).toBe(true);
  expect(row.Template_Name).toBe('SATO Barcode Tag (92×15mm)');
});
