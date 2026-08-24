/**
 * Invoice Studio's ?tenantId= override (invoiceStudio.js's resolveTenantId)
 * lets a Super Admin design/manage a specific tenant's invoice templates
 * "through the master login" instead of only ever their own — the same
 * mechanism already proven for Label Designer and Module Management.
 *
 * GET/POST/PUT/DELETE/duplicate on the plural /templates routes already
 * used this correctly (shared code with Label Designer's fix); GET
 * /templates/:id/versions did not — found and fixed while wiring up
 * InvoiceStudio.jsx's tenant picker. Covered here so it can't regress.
 */
const request = require('supertest');
const bcrypt = require('bcryptjs');
const { app } = require('../src/index');
const db = require('../src/db/knex');
const testTenant = require('./helpers/testTenant');

const SA_USERNAME = 'qa_temp_sa_invstudiotest';
let saToken;
let tenant;
let tenantToken;
let dljTemplateId;

beforeAll(async () => {
  const saRole = await db('tbl_role_master').where({ Role_Name: 'Super Admin' }).first();
  const salt = bcrypt.genSaltSync(10);
  await db('tbl_user_master').where({ Username: SA_USERNAME }).del();
  await db('tbl_user_master').insert({
    Tenant_ID: 'SA_MASTER', Username: SA_USERNAME, Password_Hash: bcrypt.hashSync('TempSA@InvT1', salt), Password_Salt: salt,
    Role_ID: saRole.Role_ID, Full_Name: 'QA Temp SA (invoice studio test)', Is_Active: true, Is_Admin: true,
  });
  const saLogin = await request(app).post('/api/auth/login').send({ username: SA_USERNAME, password: 'TempSA@InvT1', tenantId: 'SA_MASTER' });
  saToken = saLogin.body.data.token;

  tenant = await testTenant.setup();
  const tLogin = await request(app).post('/api/auth/login').send({ username: tenant.username, password: tenant.password, tenantId: tenant.tenantId });
  tenantToken = tLogin.body.data.token;
});

afterAll(async () => {
  if (dljTemplateId) await db('tbl_invoice_studio_templates').where({ Template_ID: dljTemplateId }).del();
  await db('tbl_user_master').where({ Username: SA_USERNAME }).del();
  await testTenant.teardown();
  await db.destroy();
});

test('Super Admin can create a template for a real tenant via ?tenantId=', async () => {
  const res = await request(app).post('/api/invoice-studio/templates?tenantId=DLJ').set('Authorization', `Bearer ${saToken}`)
    .send({ Template_Name: 'QA test template', Document_Type: 'QUOTATION', Layout_JSON: [] });
  expect(res.status).toBe(201);
  expect(res.body.data.Tenant_ID).toBe('DLJ');
  dljTemplateId = res.body.data.Template_ID;
});

test('the version-history endpoint respects the same override (regression: used to ignore it)', async () => {
  const res = await request(app).get(`/api/invoice-studio/templates/${dljTemplateId}/versions?tenantId=DLJ`).set('Authorization', `Bearer ${saToken}`);
  expect(res.status).toBe(200);
});

test('a non-super-admin cannot use ?tenantId= to write into another tenant\'s templates', async () => {
  const res = await request(app).post('/api/invoice-studio/templates?tenantId=DLJ').set('Authorization', `Bearer ${tenantToken}`)
    .send({ Template_Name: 'Should land on my own tenant', Document_Type: 'QUOTATION', Layout_JSON: [] });
  expect(res.status).toBe(201);
  expect(res.body.data.Tenant_ID).toBe(tenant.tenantId); // NOT 'DLJ'
});
