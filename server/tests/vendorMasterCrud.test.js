/**
 * tbl_vendor_master (shared by Karigar + Supplier) only ever had
 * Create + List — no way to edit a vendor's details or retire one once
 * created, no permission gate on creation, and no money-based outstanding
 * view (only weight-based, and only for karigars). This proves all of it:
 * edit, deactivate (with real guards), reactivate, permission enforcement,
 * and the new /karigar/outstanding + /reports/supplier-outstanding routes.
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

test('a vendor can be created with full details, then edited', async () => {
  const create = await request(app).post('/api/karigar/vendor').set(auth()).send({
    Vendor_Name: 'QA Full Supplier', Vendor_Type: 'Supplier', Mobile_1: '9991110001',
    GST_No: '29ABCDE1234F1Z5', PAN_No: 'ABCDE1234F', City: 'Bengaluru', Credit_Limit: 500000, Credit_Days: 30,
  });
  expect(create.status).toBe(201);
  expect(create.body.data.GST_No).toBe('29ABCDE1234F1Z5');
  const vendorId = create.body.data.Vendor_ID;

  const edit = await request(app).put(`/api/karigar/vendor/${vendorId}`).set(auth()).send({
    Vendor_Name: 'QA Full Supplier (Renamed)', Mobile_1: '9991110002', City: 'Mysuru',
  });
  expect(edit.status).toBe(200);
  expect(edit.body.data.Vendor_Name).toBe('QA Full Supplier (Renamed)');
  expect(edit.body.data.Mobile_1).toBe('9991110002');
  expect(edit.body.data.City).toBe('Mysuru');
  expect(edit.body.data.GST_No).toBe('29ABCDE1234F1Z5'); // untouched fields survive a partial edit

  // A caller cannot smuggle Tenant_ID/Current_Balance/Vendor_Code through the edit.
  const tamper = await request(app).put(`/api/karigar/vendor/${vendorId}`).set(auth()).send({
    Tenant_ID: 'OTHER_TENANT', Current_Balance: 999999, Vendor_Code: 'HACKED',
  });
  expect(tamper.status).toBe(400); // no editable fields provided
  const unchanged = await db('tbl_vendor_master').where({ Vendor_ID: vendorId }).first();
  expect(unchanged.Tenant_ID).toBe(tenant.tenantId);
  expect(parseFloat(unchanged.Current_Balance)).toBe(0);
});

test('deactivate is blocked by a nonzero balance, then works once cleared, and reactivate restores it', async () => {
  const create = await request(app).post('/api/karigar/vendor').set(auth()).send({
    Vendor_Name: 'QA Balance Supplier', Vendor_Type: 'Supplier', Mobile_1: '9991110003', Opening_Balance: 5000,
  });
  const vendorId = create.body.data.Vendor_ID;
  expect(parseFloat(create.body.data.Current_Balance)).toBe(5000);

  const blocked = await request(app).patch(`/api/karigar/vendor/${vendorId}/deactivate`).set(auth());
  expect(blocked.status).toBe(400);
  expect(blocked.body.message).toMatch(/outstanding balance/i);

  await db('tbl_vendor_master').where({ Vendor_ID: vendorId }).update({ Current_Balance: 0 });
  const deactivated = await request(app).patch(`/api/karigar/vendor/${vendorId}/deactivate`).set(auth());
  expect(deactivated.status).toBe(200);
  expect(deactivated.body.data.Is_Active).toBe(false);

  // GET /vendors (no includeInactive) excludes it; includeInactive=true shows it.
  const activeOnly = await request(app).get('/api/karigar/vendors').set(auth());
  expect(activeOnly.body.data.find(v => v.Vendor_ID === vendorId)).toBeUndefined();
  const withInactive = await request(app).get('/api/karigar/vendors?includeInactive=true').set(auth());
  expect(withInactive.body.data.find(v => v.Vendor_ID === vendorId)).toBeDefined();

  const reactivated = await request(app).patch(`/api/karigar/vendor/${vendorId}/reactivate`).set(auth());
  expect(reactivated.status).toBe(200);
  expect(reactivated.body.data.Is_Active).toBe(true);
});

test('deactivate is blocked while a karigar has an open (non-Completed) issue', async () => {
  const create = await request(app).post('/api/karigar/vendor').set(auth()).send({
    Vendor_Name: 'QA Open Issue Karigar', Vendor_Type: 'Karigar', Mobile_1: '9991110004',
  });
  const karigarId = create.body.data.Vendor_ID;
  const issue = await request(app).post('/api/karigar/issue').set(auth()).send({
    Karigar_ID: karigarId, Gold_Weight_Issued: 10, Gold_Rate_At_Issue: 6000, Karigar_Wages_Rate: 200, Issue_Date: '2026-08-26',
  });
  expect(issue.status).toBe(201);

  const blocked = await request(app).patch(`/api/karigar/vendor/${karigarId}/deactivate`).set(auth());
  expect(blocked.status).toBe(400);
  expect(blocked.body.message).toMatch(/still open/i);
});

test('POST /vendor requires karigar_management or inventory permission', async () => {
  const roleRes = await request(app).post('/api/tenant/roles').set(auth()).send({
    Role_Name: 'QA No-Vendor-Access Staff',
    Permissions: { billing: true },
  });
  expect(roleRes.status).toBe(201);
  const staffRes = await request(app).post('/api/tenant/users').set(auth()).send({
    Username: `${tenant.username}_novendor`, Password: 'Passw0rd!123', Full_Name: 'QA No Vendor Staff', Role_ID: roleRes.body.data.Role_ID,
  });
  expect(staffRes.status).toBe(201);
  const staffLogin = await request(app).post('/api/auth/login').send({ username: `${tenant.username}_novendor`, password: 'Passw0rd!123', tenantId: tenant.tenantId });
  const staffToken = staffLogin.body.data.token;

  const blocked = await request(app).post('/api/karigar/vendor').set({ Authorization: `Bearer ${staffToken}` }).send({
    Vendor_Name: 'Should Be Blocked', Vendor_Type: 'Supplier', Mobile_1: '9991110005',
  });
  expect(blocked.status).toBe(403);

  await db('tbl_role_master').where({ Role_Name: 'QA No-Vendor-Access Staff' }).del();
});

test('GET /api/karigar/outstanding reports unsettled wages and open-issue gold value per karigar', async () => {
  const create = await request(app).post('/api/karigar/vendor').set(auth()).send({
    Vendor_Name: 'QA Outstanding Karigar', Vendor_Type: 'Karigar', Mobile_1: '9991110006',
  });
  const karigarId = create.body.data.Vendor_ID;
  const issue = await request(app).post('/api/karigar/issue').set(auth()).send({
    Karigar_ID: karigarId, Gold_Weight_Issued: 50, Gold_Rate_At_Issue: 6000, Karigar_Wages_Rate: 300, Issue_Date: '2026-08-26',
  });
  expect(issue.status).toBe(201);

  const outstanding = await request(app).get('/api/karigar/outstanding').set(auth());
  expect(outstanding.status).toBe(200);
  const row = outstanding.body.data.find(r => r.Vendor_ID === karigarId);
  expect(row).toBeDefined();
  expect(parseFloat(row.gold_with_karigar_value)).toBe(50 * 6000);
  expect(parseInt(row.open_issues)).toBe(1);
});

test('GET /api/reports/supplier-outstanding reports unpaid purchase totals per supplier', async () => {
  const supplier = await request(app).post('/api/karigar/vendor').set(auth()).send({
    Vendor_Name: 'QA Outstanding Supplier', Vendor_Type: 'Supplier', Mobile_1: '9991110007',
  });
  const supplierId = supplier.body.data.Vendor_ID;
  const purchase = await request(app).post('/api/purchase/create').set(auth()).send({
    Supplier_ID: supplierId, Purchase_Date: '2026-08-26', Purchase_Type: 'Gold',
    Total_Amount: 60000, Amount_Paid: 20000,
    items: [{ Item_Description: 'Gold bar', Metal_Type: 'Gold', Gross_Weight: 10, Purity_Code: '916', Gold_Rate: 6000, Purchase_Rate: 60000 }],
  });
  expect(purchase.status).toBe(201);

  const outstanding = await request(app).get('/api/reports/supplier-outstanding').set(auth());
  expect(outstanding.status).toBe(200);
  const row = outstanding.body.data.find(r => r.Supplier_ID === supplierId);
  expect(row).toBeDefined();
  expect(parseFloat(row.outstanding)).toBeCloseTo(parseFloat(purchase.body.data.Total_Amount) - 20000, 2);
});
