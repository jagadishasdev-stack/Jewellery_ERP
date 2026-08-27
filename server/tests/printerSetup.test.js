/**
 * Printer Setup & Document Printing Management — the expanded 9-role
 * printer assignment (was 3: thermal_label/thermal_receipt/regular) and
 * Print History (tbl_print_log), both new this round. Printing itself
 * always happens client-side via QZ Tray (see client/src/utils/
 * printService.js) — these tests cover the server-side config storage
 * and history recording only, which is everything the server is actually
 * involved in.
 */
const request = require('supertest');
const { app } = require('../src/index');
const db = require('../src/db/knex');
const testTenant = require('./helpers/testTenant');

let tenant, token, branchA;
const auth = () => ({ Authorization: `Bearer ${token}` });

beforeAll(async () => {
  tenant = await testTenant.setup();
  const login = await request(app).post('/api/auth/login').send({ username: tenant.username, password: tenant.password, tenantId: tenant.tenantId });
  token = login.body.data.token;

  branchA = `${tenant.tenantId}_PRN`;
  await db('tbl_branch_master').insert({ Branch_ID: branchA, Tenant_ID: tenant.tenantId, Branch_Name: 'QA Printer Branch', Branch_Code: 'PRN', Is_Active: true });
});

afterAll(async () => {
  await db('tbl_print_log').where({ Tenant_ID: tenant.tenantId }).del();
  await db('tbl_printer_config').where({ Tenant_ID: tenant.tenantId }).del();
  await db('tbl_branch_master').where({ Branch_ID: branchA }).del();
  await testTenant.teardown();
  await db.destroy();
});

test('GET /api/printer-config/roles returns all 9 spec document types, not the old 3', async () => {
  const res = await request(app).get('/api/printer-config/roles').set(auth());
  expect(res.status).toBe(200);
  const keys = res.body.data.map((r) => r.key);
  expect(keys).toEqual(['quotation', 'sales_bill', 'purchase_bill', 'barcode', 'receipt', 'credit_note', 'debit_note', 'reports', 'other']);
  expect(keys).not.toContain('thermal_label');
  expect(keys).not.toContain('thermal_receipt');
  expect(keys).not.toContain('regular');
});

test('PUT /api/printer-config rejects the old role names — the migration renamed them, they are no longer valid', async () => {
  const res = await request(app).put('/api/printer-config').set(auth()).send({ role: 'thermal_label', printerName: 'Zebra ZD220' });
  expect(res.status).toBe(422); // sendValidationError's real convention (utils/response.js)
});

test('PUT /api/printer-config assigns each of the 9 new document types independently — Quotation and Purchase Bill no longer forcibly share one printer', async () => {
  const quotation = await request(app).put('/api/printer-config').set(auth()).send({ role: 'quotation', printerName: 'HP LaserJet Pro' });
  expect(quotation.status).toBe(200);
  const purchaseBill = await request(app).put('/api/printer-config').set(auth()).send({ role: 'purchase_bill', printerName: 'Canon MF3010' });
  expect(purchaseBill.status).toBe(200);

  const get = await request(app).get('/api/printer-config').set(auth());
  expect(get.body.data.quotation.Printer_Name).toBe('HP LaserJet Pro');
  expect(get.body.data.purchase_bill.Printer_Name).toBe('Canon MF3010');
  expect(get.body.data.quotation.Printer_Name).not.toBe(get.body.data.purchase_bill.Printer_Name);
});

test('a branch-specific printer assignment overrides the tenant-wide one for that branch, but not for other branches', async () => {
  await request(app).put('/api/printer-config').set(auth()).send({ role: 'barcode', printerName: 'Zebra ZD220 (Tenant-wide)' });
  await request(app).put('/api/printer-config').set(auth()).send({ role: 'barcode', printerName: 'Zebra GK420 (Branch A only)', branchId: branchA });

  const branchScoped = await request(app).get('/api/printer-config').set(auth()).query({ branchId: branchA });
  expect(branchScoped.body.data.barcode.Printer_Name).toBe('Zebra GK420 (Branch A only)');

  const tenantWide = await request(app).get('/api/printer-config').set(auth());
  expect(tenantWide.body.data.barcode.Printer_Name).toBe('Zebra ZD220 (Tenant-wide)');
});

test('POST /api/print-log records a print attempt, and GET /api/print-log returns it', async () => {
  const record = await request(app).post('/api/print-log').set(auth()).send({
    printerRole: 'sales_bill', documentType: 'Sales Bill', documentNumber: 'QAPRN-INV-001',
    printerName: 'Epson TM-T82', status: 'Success',
  });
  expect(record.status).toBe(200);

  const history = await request(app).get('/api/print-log').set(auth());
  expect(history.status).toBe(200);
  const row = history.body.data.items.find((r) => r.Document_Number === 'QAPRN-INV-001');
  expect(row).toBeDefined();
  expect(row.Status).toBe('Success');
  expect(row.Printer_Name).toBe('Epson TM-T82');
});

test('a failed print attempt is logged with its error message — this is what answers "my bill was not printed"', async () => {
  await request(app).post('/api/print-log').set(auth()).send({
    printerRole: 'barcode', documentType: 'Barcode', documentNumber: 'QAPRN-TAG-001',
    printerName: 'Zebra ZD220', status: 'Failed', errorMessage: 'Printer offline',
  });

  const failedOnly = await request(app).get('/api/print-log').set(auth()).query({ status: 'Failed' });
  const row = failedOnly.body.data.items.find((r) => r.Document_Number === 'QAPRN-TAG-001');
  expect(row).toBeDefined();
  expect(row.Error_Message).toBe('Printer offline');
});

test('a Test Print is logged the same way as a real print, distinguishable by Document_Type', async () => {
  await request(app).post('/api/print-log').set(auth()).send({
    printerRole: 'other', documentType: 'Test Print', printerName: 'HP LaserJet Pro', status: 'Success',
  });
  const history = await request(app).get('/api/print-log').set(auth());
  const testRow = history.body.data.items.find((r) => r.Document_Type === 'Test Print');
  expect(testRow).toBeDefined();
  expect(testRow.Document_Number).toBeNull();
});
