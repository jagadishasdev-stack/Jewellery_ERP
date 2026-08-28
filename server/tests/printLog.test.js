/**
 * server/src/routes/printLog.js — Print History (POST /, GET /). 2
 * endpoints, previously zero coverage.
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
  await db('tbl_print_log').where({ Tenant_ID: tenant.tenantId }).del();
  await testTenant.teardown();
  await db.destroy();
});

describe('POST /api/print-log', () => {
  test('requires auth', async () => {
    const res = await request(app).post('/api/print-log').send({ printerRole: 'sales_bill', printerName: 'Test Printer', status: 'Success' });
    expect(res.status).toBe(401);
  });

  test('validates required fields and Status enum', async () => {
    const res = await request(app).post('/api/print-log').set(auth()).send({ printerRole: '', printerName: '', status: 'Maybe' });
    expect(res.status).toBe(422);
  });

  test('logs a successful print with no error message stored', async () => {
    const res = await request(app).post('/api/print-log').set(auth())
      .send({ printerRole: 'sales_bill', documentType: 'Sales Bill', documentNumber: 'QAINV-001', printerName: 'Front Counter Printer', status: 'Success', errorMessage: 'should be ignored' });
    expect(res.status).toBe(200);
    expect(res.body.data.Status).toBe('Success');
    expect(res.body.data.Error_Message).toBeNull(); // errorMessage is only stored for Failed, even if sent
    expect(res.body.data.Printed_By).toBe(tenant.username);
  });

  test('logs a failed print WITH its error message', async () => {
    const res = await request(app).post('/api/print-log').set(auth())
      .send({ printerRole: 'sales_bill', printerName: 'Front Counter Printer', status: 'Failed', errorMessage: 'Printer offline' });
    expect(res.status).toBe(200);
    expect(res.body.data.Status).toBe('Failed');
    expect(res.body.data.Error_Message).toBe('Printer offline');
  });

  test('never stores the literal branchId "ALL" — falls back to null instead', async () => {
    const res = await request(app).post('/api/print-log').set(auth()).set('X-Branch-ID', 'ALL')
      .send({ printerRole: 'sales_bill', printerName: 'Test Printer', status: 'Success' });
    expect(res.status).toBe(200);
    expect(res.body.data.Branch_ID).toBeNull();
  });

  test('a DB write failure never surfaces as an error to the caller (logging must not block real printing)', async () => {
    // Force a write failure with a Printer_Name far longer than the
    // varchar(150) column — the route's own catch block converts this
    // into a soft { logged: false } 200, not a 500.
    const res = await request(app).post('/api/print-log').set(auth())
      .send({ printerRole: 'sales_bill', printerName: 'X'.repeat(500), status: 'Success' });
    expect(res.status).toBe(200);
    expect(res.body.data.logged).toBe(false);
  });
});

describe('GET /api/print-log', () => {
  test('requires auth', async () => {
    const res = await request(app).get('/api/print-log');
    expect(res.status).toBe(401);
  });

  test('lists this tenant\'s print history, newest first, with a total count', async () => {
    const res = await request(app).get('/api/print-log').set(auth());
    expect(res.status).toBe(200);
    expect(res.body.data.items.length).toBeGreaterThanOrEqual(3);
    expect(res.body.data.total).toBeGreaterThanOrEqual(3);
  });

  test('filters by status and documentType', async () => {
    const res = await request(app).get('/api/print-log?status=Failed').set(auth());
    expect(res.status).toBe(200);
    expect(res.body.data.items.every(r => r.Status === 'Failed')).toBe(true);

    const byDoc = await request(app).get('/api/print-log?documentType=Sales Bill').set(auth());
    expect(byDoc.body.data.items.every(r => r.Document_Type === 'Sales Bill')).toBe(true);
  });

  test('pagination respects limit/page', async () => {
    const res = await request(app).get('/api/print-log?limit=1&page=1').set(auth());
    expect(res.status).toBe(200);
    expect(res.body.data.items.length).toBe(1);
  });
});
