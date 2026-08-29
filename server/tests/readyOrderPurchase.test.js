/**
 * Ready Order Purchase — procurement triggered by a customer order.
 * Reuses the existing Order Bin (tbl_bin_orders) and Purchase
 * (tbl_purchase_header) tables rather than a parallel system; this is
 * the missing link + QC gate between them (Missing Feature Report,
 * Transaction Menu spec). Also exercises POST /purchase/:id/receive,
 * a real pre-existing gap found while building this — the schema
 * declared a 'Received' Status since the table was created, but nothing
 * ever set it.
 */
const request = require('supertest');
const { app } = require('../src/index');
const db = require('../src/db/knex');
const testTenant = require('./helpers/testTenant');

let tenant, token, secondToken;
const auth = () => ({ Authorization: `Bearer ${token}` });
const auth2 = () => ({ Authorization: `Bearer ${secondToken}` });

beforeAll(async () => {
  tenant = await testTenant.setup();
  const res = await request(app).post('/api/auth/login').send({ username: tenant.username, password: tenant.password, tenantId: tenant.tenantId });
  token = res.body.data.token;

  // /purchase/:id/approve requires someone OTHER than the creator — a
  // second real user is needed to exercise the full lifecycle, same
  // constraint the existing purchase-approval tests already work around.
  const bcrypt = require('bcryptjs');
  const role = await db('tbl_role_master').where({ Role_Name: 'Tenant Admin' }).first() || await db('tbl_role_master').first();
  const [approver] = await db('tbl_user_master').insert({
    Tenant_ID: tenant.tenantId, Username: 'qa_ready_order_approver', Password_Hash: bcrypt.hashSync('QaApprove@2026', 10), Password_Salt: 'x',
    Role_ID: role.Role_ID, Full_Name: 'QA Ready Order Approver', Is_Active: true, All_Branch_Access: true,
  }).returning('*');
  const login2 = await request(app).post('/api/auth/login').send({ username: 'qa_ready_order_approver', password: 'QaApprove@2026', tenantId: tenant.tenantId });
  secondToken = login2.body.data.token;
});

afterAll(async () => {
  await db('tbl_bin_orders').where({ Tenant_ID: tenant.tenantId }).del();
  await db('tbl_purchase_header').where({ Tenant_ID: tenant.tenantId }).del();
  await db('tbl_user_master').where({ Username: 'qa_ready_order_approver' }).del();
  await testTenant.teardown();
  await db.destroy();
});

test('POST /purchase/:id/receive requires Approved status first', async () => {
  const create = await request(app).post('/api/purchase/create').set(auth()).send({
    Supplier_Name: 'QA Ready Order Supplier', Total_Amount: 20000, Subtotal_Amount: 20000,
    items: [{ Metal_Type: 'Gold', Gross_Weight: 3, Purchase_Rate: 20000, Article_Number: 'QARDYORD-1', Create_Inventory: false }],
  });
  const purchaseId = create.body.data.Purchase_ID;

  const tooEarly = await request(app).post(`/api/purchase/${purchaseId}/receive`).set(auth()).send();
  expect(tooEarly.status).toBe(400);

  await request(app).post(`/api/purchase/${purchaseId}/approve`).set(auth2()).send();
  const receive = await request(app).post(`/api/purchase/${purchaseId}/receive`).set(auth()).send();
  expect(receive.status).toBe(200);
  expect(receive.body.data.Status).toBe('Received');
});

test('an order cannot be marked Ready while its linked purchase is unreceived, but can once received', async () => {
  const order = await request(app).post('/api/bin/orders').set(auth()).send({
    Order_Type: 'Customer', Party_Name: 'QA Ready Order Customer', Order_Date: '2026-08-29', Item_Description: 'Custom ring',
  });
  const orderId = order.body.data.Order_ID;

  const purchase = await request(app).post('/api/purchase/create').set(auth()).send({
    Supplier_Name: 'QA Ready Order Supplier 2', Total_Amount: 15000, Subtotal_Amount: 15000,
    items: [{ Metal_Type: 'Gold', Gross_Weight: 2, Purchase_Rate: 15000, Article_Number: 'QARDYORD-2', Create_Inventory: false }],
  });
  const purchaseId = purchase.body.data.Purchase_ID;

  const link = await request(app).post(`/api/bin/orders/${orderId}/link-purchase`).set(auth()).send({ Purchase_ID: purchaseId });
  expect(link.status).toBe(200);
  expect(link.body.data.Related_Purchase_ID).toBe(purchaseId);

  const tooEarly = await request(app).post(`/api/bin/orders/${orderId}/mark-ready`).set(auth()).send({ QC_Passed: true });
  expect(tooEarly.status).toBe(400);

  await request(app).post(`/api/purchase/${purchaseId}/approve`).set(auth2()).send();
  await request(app).post(`/api/purchase/${purchaseId}/receive`).set(auth()).send();

  const noQc = await request(app).post(`/api/bin/orders/${orderId}/mark-ready`).set(auth()).send({});
  expect(noQc.status).toBe(400);

  const ready = await request(app).post(`/api/bin/orders/${orderId}/mark-ready`).set(auth()).send({ QC_Passed: true });
  expect(ready.status).toBe(200);
  expect(ready.body.data.Status).toBe('Ready');
  expect(ready.body.data.QC_Passed).toBe(true);
});

test('an order with no linked purchase can still be marked Ready with just QC confirmation', async () => {
  const order = await request(app).post('/api/bin/orders').set(auth()).send({
    Order_Type: 'Customer', Party_Name: 'QA No-Purchase Order Customer', Order_Date: '2026-08-29', Item_Description: 'Simple resize',
  });
  const ready = await request(app).post(`/api/bin/orders/${order.body.data.Order_ID}/mark-ready`).set(auth()).send({ QC_Passed: true });
  expect(ready.status).toBe(200);
  expect(ready.body.data.Status).toBe('Ready');
});
