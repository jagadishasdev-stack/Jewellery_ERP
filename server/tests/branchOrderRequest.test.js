/**
 * Branch Orders — a branch REQUESTING stock (pull model), the opposite
 * direction from the existing push-model Interbranch Stock Transfer.
 * Genuinely absent before (Missing Feature Report, Transaction Menu
 * spec). Fulfillment reuses the real Transfer flow rather than
 * duplicating item-picking logic.
 */
const request = require('supertest');
const { app } = require('../src/index');
const db = require('../src/db/knex');
const testTenant = require('./helpers/testTenant');

let tenant, token, typeId, branchA, branchB;
const auth = () => ({ Authorization: `Bearer ${token}` });

beforeAll(async () => {
  tenant = await testTenant.setup();
  const res = await request(app).post('/api/auth/login').send({ username: tenant.username, password: tenant.password, tenantId: tenant.tenantId });
  token = res.body.data.token;
  typeId = (await db('tbl_item_type_master').first()).Type_ID;

  branchA = `${tenant.tenantId}_BORA`;
  branchB = `${tenant.tenantId}_BORB`;
  await db('tbl_branch_master').insert([
    { Branch_ID: branchA, Tenant_ID: tenant.tenantId, Branch_Name: 'QA Branch Order A', Branch_Code: 'BORA', Is_Active: true },
    { Branch_ID: branchB, Tenant_ID: tenant.tenantId, Branch_Name: 'QA Branch Order B', Branch_Code: 'BORB', Is_Active: true },
  ]);
});

afterAll(async () => {
  await db('tbl_branch_order_request').where({ Tenant_ID: tenant.tenantId }).del();
  await db('tbl_stock_transfer').where({ Tenant_ID: tenant.tenantId }).del();
  await db('tbl_ornament_master').where({ Tenant_ID: tenant.tenantId }).del();
  await db('tbl_branch_master').whereIn('Branch_ID', [branchA, branchB]).del();
  await testTenant.teardown();
  await db.destroy();
});

test('the full request -> approve -> real transfer -> link lifecycle', async () => {
  const create = await request(app).post('/api/branch-order-request').set(auth()).send({
    Requesting_Branch_ID: branchB, Metal_Type: 'Gold', Requested_Weight: 20, Requested_Quantity: 2,
  });
  expect(create.status).toBe(201);
  expect(create.body.data.Request_Number).toMatch(/BOR/);
  expect(create.body.data.Status).toBe('Requested');
  const requestId = create.body.data.Request_ID;

  const approve = await request(app).post(`/api/branch-order-request/${requestId}/approve`).set(auth()).send({ Source_Branch_ID: branchA });
  expect(approve.status).toBe(200);
  expect(approve.body.data.Status).toBe('Approved');
  expect(approve.body.data.Source_Branch_ID).toBe(branchA);

  // A double-approve is rejected — the request is no longer in the Requested state.
  const doubleApprove = await request(app).post(`/api/branch-order-request/${requestId}/approve`).set(auth()).send({ Source_Branch_ID: branchA });
  expect(doubleApprove.status).toBe(400);

  // Fulfillment reuses the REAL transfer flow — not a parallel one.
  const ornament = await request(app).post('/api/ornaments').set(auth()).send({
    Type_ID: typeId, Metal_Type: 'Gold', Gross_Weight: 10, Net_Gold_Weight: 9.5, Current_Gold_Rate: 6000,
    Base_Making_Charge_Per_Gram: 100, Purchase_Cost: 60000, Total_Price: 65000, Article_Number: 'QABOR-0001', Branch_ID: branchA,
  });
  const transfer = await request(app).post('/api/transfer/create').set(auth()).send({
    Transfer_Type: 'Branch', From_Branch_ID: branchA, To_Branch_ID: branchB,
    items: [{ Ornament_ID: ornament.body.data.Ornament_ID }],
  });
  expect(transfer.status).toBe(201);

  const link = await request(app).post(`/api/branch-order-request/${requestId}/link-transfer`).set(auth()).send({ Transfer_ID: transfer.body.data.Transfer_ID });
  expect(link.status).toBe(200);
  expect(link.body.data.Status).toBe('Transferred');
  expect(link.body.data.Transfer_ID).toBe(transfer.body.data.Transfer_ID);
});

test('a request from one branch is visible when queried without any branch filter (cross-branch pool)', async () => {
  const res = await request(app).get('/api/branch-order-request').set(auth());
  expect(res.status).toBe(200);
  expect(res.body.data.some((r) => r.Requesting_Branch_ID === branchB)).toBe(true);
});

test('rejecting a request works, and a rejected request cannot be approved afterward', async () => {
  const create = await request(app).post('/api/branch-order-request').set(auth()).send({ Requesting_Branch_ID: branchB, Metal_Type: 'Silver' });
  const reject = await request(app).post(`/api/branch-order-request/${create.body.data.Request_ID}/reject`).set(auth());
  expect(reject.status).toBe(200);
  expect(reject.body.data.Status).toBe('Rejected');

  const approveAfterReject = await request(app).post(`/api/branch-order-request/${create.body.data.Request_ID}/approve`).set(auth()).send({ Source_Branch_ID: branchA });
  expect(approveAfterReject.status).toBe(400);
});
