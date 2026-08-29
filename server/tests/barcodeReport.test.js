/**
 * GET /api/reports/barcode-report — previously missing entirely (Missing
 * Feature Report item B01, Transaction Menu spec). A searchable list of
 * every barcode/tag ever created, with its current status and whether/
 * when it was last actually printed (from tbl_print_log).
 */
const request = require('supertest');
const { app } = require('../src/index');
const db = require('../src/db/knex');
const testTenant = require('./helpers/testTenant');

let tenant, token, typeId;
const auth = () => ({ Authorization: `Bearer ${token}` });

beforeAll(async () => {
  tenant = await testTenant.setup();
  const res = await request(app).post('/api/auth/login').send({ username: tenant.username, password: tenant.password, tenantId: tenant.tenantId });
  token = res.body.data.token;
  typeId = (await db('tbl_item_type_master').first()).Type_ID;
});

afterAll(async () => {
  await db('tbl_print_log').where({ Tenant_ID: tenant.tenantId }).del();
  await db('tbl_ornament_master').where({ Tenant_ID: tenant.tenantId }).del();
  await testTenant.teardown();
  await db.destroy();
});

async function createOrnament(articleNumber, overrides = {}) {
  const res = await request(app).post('/api/ornaments').set(auth()).send({
    Type_ID: typeId, Metal_Type: 'Gold', Gross_Weight: 5, Net_Gold_Weight: 4.5,
    Current_Gold_Rate: 6000, Base_Making_Charge_Per_Gram: 100, Purchase_Cost: 15000,
    Total_Price: 18000, Article_Number: articleNumber, ...overrides,
  });
  return res.body.data;
}

describe('Barcode Report', () => {
  test('lists a created ornament by its barcode with a derived Status', async () => {
    await createOrnament('QABAR-0001');
    const res = await request(app).get('/api/reports/barcode-report').set(auth()).query({ search: 'QABAR-0001' });
    expect(res.status).toBe(200);
    const row = res.body.data.items.find(r => r.Article_Number === 'QABAR-0001');
    expect(row).toBeDefined();
    expect(row.Status).toBe('Available');
    expect(row.Last_Printed_Date).toBeNull();
  });

  test('filters by status=sold after the ornament is sold', async () => {
    const ornament = await createOrnament('QABAR-0002');
    await request(app).post('/api/sales/create').set(auth()).send({
      Payment_Mode: 'Cash',
      items: [{ Ornament_ID: ornament.Ornament_ID, Article_Number: 'QABAR-0002', Total_Line_Price: 18000 }],
    });
    const res = await request(app).get('/api/reports/barcode-report').set(auth()).query({ status: 'sold', search: 'QABAR-0002' });
    expect(res.status).toBe(200);
    const row = res.body.data.items.find(r => r.Article_Number === 'QABAR-0002');
    expect(row.Status).toBe('Sold');
  });

  test('surfaces the most recent print attempt from tbl_print_log', async () => {
    await createOrnament('QABAR-0003');
    await db('tbl_print_log').insert([
      { Tenant_ID: tenant.tenantId, Printer_Role: 'barcode', Document_Type: 'Barcode', Document_Number: 'QABAR-0003', Printer_Name: 'QA-Old-Printer', Status: 'Failed', Printed_Date: new Date(Date.now() - 60000) },
      { Tenant_ID: tenant.tenantId, Printer_Role: 'barcode', Document_Type: 'Barcode', Document_Number: 'QABAR-0003', Printer_Name: 'QA-New-Printer', Status: 'Success', Printed_Date: new Date() },
    ]);
    const res = await request(app).get('/api/reports/barcode-report').set(auth()).query({ search: 'QABAR-0003' });
    const row = res.body.data.items.find(r => r.Article_Number === 'QABAR-0003');
    expect(row.Last_Print_Status).toBe('Success');
    expect(row.Last_Printed_Date).toBeTruthy();
  });

  test('search filters to only matching barcodes', async () => {
    const res = await request(app).get('/api/reports/barcode-report').set(auth()).query({ search: 'QABAR-NOPE-DOES-NOT-EXIST' });
    expect(res.status).toBe(200);
    expect(res.body.data.items.length).toBe(0);
  });
});
