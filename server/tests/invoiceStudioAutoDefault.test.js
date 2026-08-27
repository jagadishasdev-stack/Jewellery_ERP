/**
 * Real, reported bug: an admin designs a Sales Bill template in Invoice
 * Studio, saves it, and printing never picks it up — falls back to the
 * hardcoded plain-text layout instead. Root cause: the client's own Save
 * action always sends Is_Default: false (only a separate "Set as
 * Default" button ever sends true), and GET /invoice-studio/resolve/
 * :docType — the route real printing actually calls (thermalReceipt.js's
 * printFromInvoiceStudio) — requires Is_Default: true. A tenant's very
 * first template for a document type was permanently invisible to
 * printing until someone discovered and clicked that separate button.
 *
 * Fix: POST /templates now auto-promotes the FIRST active template for a
 * (tenant, Document_Type) combination to Is_Default, regardless of what
 * the client sent — the common one-template case just works, and an
 * admin who deliberately adds a second alternate design still uses
 * "Set as Default" to switch between them.
 */
const request = require('supertest');
const { app } = require('../src/index');
const db = require('../src/db/knex');
const testTenant = require('./helpers/testTenant');

let tenant, token;
const auth = () => ({ Authorization: `Bearer ${token}` });

beforeAll(async () => {
  tenant = await testTenant.setup();
  const login = await request(app).post('/api/auth/login').send({ username: tenant.username, password: tenant.password, tenantId: tenant.tenantId });
  token = login.body.data.token;
});

afterAll(async () => {
  await db('tbl_invoice_studio_templates').where({ Tenant_ID: tenant.tenantId }).del();
  await testTenant.teardown();
  await db.destroy();
});

test('the FIRST template for a document type becomes the default automatically, even though the client sends Is_Default: false — matching InvoiceStudio.jsx\'s real save call', async () => {
  const res = await request(app).post('/api/invoice-studio/templates').set(auth())
    .send({ Template_Name: 'My Sales Bill Design', Document_Type: 'SALES_BILL', Layout_JSON: [{ id: 'logo' }], Is_Default: false });
  expect(res.status).toBe(201);
  expect(res.body.data.Is_Default).toBe(true); // promoted despite the client asking for false
});

test('GET /invoice-studio/resolve/SALES_BILL — the exact route real printing calls — now finds it', async () => {
  const res = await request(app).get('/api/invoice-studio/resolve/SALES_BILL').set(auth());
  expect(res.status).toBe(200);
  expect(res.body.data.Template_Name).toBe('My Sales Bill Design');
});

test('a SECOND template for the same document type does NOT steal the default — the explicit "Set as Default" mechanism still governs multiple designs', async () => {
  const res = await request(app).post('/api/invoice-studio/templates').set(auth())
    .send({ Template_Name: 'Alternate Sales Bill Design', Document_Type: 'SALES_BILL', Layout_JSON: [], Is_Default: false });
  expect(res.status).toBe(201);
  expect(res.body.data.Is_Default).toBe(false);

  // resolve still returns the original (still the only Is_Default=true one)
  const resolved = await request(app).get('/api/invoice-studio/resolve/SALES_BILL').set(auth());
  expect(resolved.body.data.Template_Name).toBe('My Sales Bill Design');
});

test('an explicit Set-as-Default on the second template switches which one resolves', async () => {
  const second = await db('tbl_invoice_studio_templates').where({ Tenant_ID: tenant.tenantId, Template_Name: 'Alternate Sales Bill Design' }).first();
  const setDefault = await request(app).put(`/api/invoice-studio/templates/${second.Template_ID}`).set(auth()).send({ Is_Default: true });
  expect(setDefault.status).toBe(200);

  const resolved = await request(app).get('/api/invoice-studio/resolve/SALES_BILL').set(auth());
  expect(resolved.body.data.Template_Name).toBe('Alternate Sales Bill Design');
});

test('the first template a tenant saves for a DIFFERENT document type is independently auto-defaulted', async () => {
  const res = await request(app).post('/api/invoice-studio/templates').set(auth())
    .send({ Template_Name: 'My Quotation Design', Document_Type: 'QUOTATION', Layout_JSON: [] });
  expect(res.status).toBe(201);
  expect(res.body.data.Is_Default).toBe(true);
});
