/**
 * Running Stock / Closing Report — extending it from 5 components to the
 * full 12 named in the Transaction Menu spec: Sales Return, Workshop
 * Receipt/Issue, and Interbranch Receipt/Issue, plus Melt Consumption as
 * a separate tenant-wide figure. Purchase Return is deliberately NOT
 * included — no purchase-return workflow exists anywhere in this
 * codebase; inventing one here would be a new business process, not a
 * report extension.
 */
const request = require('supertest');
const { app } = require('../src/index');
const db = require('../src/db/knex');
const testTenant = require('./helpers/testTenant');

let tenant, token, typeId, branchA, branchB;
const auth = () => ({ Authorization: `Bearer ${token}` });
const today = require('dayjs')().format('YYYY-MM-DD');

beforeAll(async () => {
  tenant = await testTenant.setup();
  const res = await request(app).post('/api/auth/login').send({ username: tenant.username, password: tenant.password, tenantId: tenant.tenantId });
  token = res.body.data.token;
  typeId = (await db('tbl_item_type_master').first()).Type_ID;

  branchA = `${tenant.tenantId}_RSFA`;
  branchB = `${tenant.tenantId}_RSFB`;
  await db('tbl_branch_master').insert([
    { Branch_ID: branchA, Tenant_ID: tenant.tenantId, Branch_Name: 'QA Running Stock A', Branch_Code: 'RSFA', Is_Active: true },
    { Branch_ID: branchB, Tenant_ID: tenant.tenantId, Branch_Name: 'QA Running Stock B', Branch_Code: 'RSFB', Is_Active: true },
  ]);
});

afterAll(async () => {
  await db('tbl_melting_refining_log').where({ Tenant_ID: tenant.tenantId }).del();
  await db('tbl_production_transaction').where({ Tenant_ID: tenant.tenantId }).del();
  await db('tbl_stock_transfer_items').whereIn('Transfer_ID', db('tbl_stock_transfer').where({ Tenant_ID: tenant.tenantId }).select('Transfer_ID')).del();
  await db('tbl_stock_transfer').where({ Tenant_ID: tenant.tenantId }).del();
  await db('tbl_ornament_master').where({ Tenant_ID: tenant.tenantId }).del();
  await db('tbl_branch_master').whereIn('Branch_ID', [branchA, branchB]).del();
  await testTenant.teardown();
  await db.destroy();
});

async function createOrnament(articleNumber, branchId) {
  const res = await request(app).post('/api/ornaments').set(auth()).send({
    Type_ID: typeId, Metal_Type: 'Gold', Gross_Weight: 5, Net_Gold_Weight: 4.5, Current_Gold_Rate: 6000,
    Base_Making_Charge_Per_Gram: 100, Purchase_Cost: 15000, Total_Price: 18000, Article_Number: articleNumber, Branch_ID: branchId,
  });
  return res.body.data;
}

test('a returned sale (not a plain cancel) is counted under Sales Return, and increases Closing back up', async () => {
  const before = await request(app).get('/api/reports/closing-report').set(auth()).query({ fromDate: today, toDate: today });
  const beforeReturn = (before.body.data.rows || []).reduce((s, r) => s + (r.salesReturnPieces || 0), 0);

  const ornament = await createOrnament('QARSF-0001', branchA);
  const sale = await request(app).post('/api/sales/create').set(auth()).send({
    Payment_Mode: 'Cash',
    items: [{ Ornament_ID: ornament.Ornament_ID, Article_Number: 'QARSF-0001', Total_Line_Price: 18000 }],
  });
  await request(app).post(`/api/sales/${sale.body.data.sale.Sale_ID}/return`).set(auth()).send({ Refund_Mode: 'Cash', reason: 'QA test return' });

  const after = await request(app).get('/api/reports/closing-report').set(auth()).query({ fromDate: today, toDate: today });
  const afterReturn = (after.body.data.rows || []).reduce((s, r) => s + (r.salesReturnPieces || 0), 0);
  expect(afterReturn).toBe(beforeReturn + 1);

  const sale2 = await db('tbl_sales_header').where({ Sale_ID: sale.body.data.sale.Sale_ID }).first();
  expect(sale2.Returned_Date).not.toBeNull(); // distinguishes a return from a plain /cancel
});

test('a Completed interbranch transfer counts as Interbranch Issue for the source branch and Interbranch Receive for the destination', async () => {
  const ornament = await createOrnament('QARSF-0002', branchA);
  const transfer = await request(app).post('/api/transfer/create').set(auth()).send({
    Transfer_Type: 'Branch', From_Branch_ID: branchA, To_Branch_ID: branchB,
    items: [{ Ornament_ID: ornament.Ornament_ID }],
  });
  await request(app).post(`/api/transfer/${transfer.body.data.Transfer_ID}/approve`).set(auth()).send();

  const asA = await request(app).get('/api/reports/closing-report').set({ Authorization: `Bearer ${token}`, 'X-Branch-ID': branchA }).query({ fromDate: today, toDate: today });
  const issueA = (asA.body.data.rows || []).reduce((s, r) => s + (r.interbranchIssuePieces || 0), 0);
  expect(issueA).toBeGreaterThan(0);

  const asB = await request(app).get('/api/reports/closing-report').set({ Authorization: `Bearer ${token}`, 'X-Branch-ID': branchB }).query({ fromDate: today, toDate: today });
  const receiveB = (asB.body.data.rows || []).reduce((s, r) => s + (r.interbranchReceivePieces || 0), 0);
  expect(receiveB).toBeGreaterThan(0);
});

test('a Completed production transaction counts as Workshop Issue (Input_Weight) and Workshop Receive (Output_Weight)', async () => {
  const ornament = await createOrnament('QARSF-0003', branchA);
  await db('tbl_production_transaction').insert({
    Tenant_ID: tenant.tenantId, Branch_ID: branchA, Ornament_ID: ornament.Ornament_ID,
    Txn_Date: today, Input_Weight: 10, Output_Weight: 9.4, Wastage_Weight: 0.6, Status: 'Completed', Created_By: 'test',
  });
  const res = await request(app).get('/api/reports/closing-report').set({ Authorization: `Bearer ${token}`, 'X-Branch-ID': branchA }).query({ fromDate: today, toDate: today });
  const issue = (res.body.data.rows || []).reduce((s, r) => s + (r.workshopIssuePieces || 0), 0);
  const receive = (res.body.data.rows || []).reduce((s, r) => s + (r.workshopReceivePieces || 0), 0);
  expect(issue).toBeGreaterThan(0);
  expect(receive).toBeGreaterThan(0);
});

test('a production transaction with no linked Ornament_ID lands in the Unassigned (Raw Material) bucket, not dropped', async () => {
  await db('tbl_production_transaction').insert({
    Tenant_ID: tenant.tenantId, Branch_ID: branchA, Ornament_ID: null,
    Txn_Date: today, Input_Weight: 5, Status: 'In Progress', Created_By: 'test',
  });
  const res = await request(app).get('/api/reports/closing-report').set({ Authorization: `Bearer ${token}`, 'X-Branch-ID': branchA }).query({ fromDate: today, toDate: today });
  const unassigned = (res.body.data.rows || []).find((r) => r.itemType === 'Unassigned (Raw Material)');
  expect(unassigned).toBeDefined();
  expect(unassigned.workshopIssueWeight).toBeGreaterThanOrEqual(5);
});

// No test for GET /closing-report/pdf here — it needs a headless Chrome
// (Puppeteer) this sandbox doesn't have available, confirmed by hand
// (the route itself has never had test coverage in this codebase for
// exactly that reason). pdfService.js's column array was checked by
// inspection instead — it's the same generic [key, label] pattern the
// pre-existing columns already used, so the new ones follow it exactly.

test('Melt Consumption is a separate tenant-wide figure, not part of any per-item-type row', async () => {
  await db('tbl_melting_refining_log').insert({
    Tenant_ID: tenant.tenantId, Process_Type: 'Melting', Metal_Type: 'Gold',
    Weight_In: 25.5, Weight_Out: 24.8, Loss_Weight: 0.7, Log_Date: today, Created_By: 'test',
  });
  const res = await request(app).get('/api/reports/closing-report').set(auth()).query({ fromDate: today, toDate: today });
  expect(res.status).toBe(200);
  expect(res.body.data.meltConsumption).toBeDefined();
  expect(res.body.data.meltConsumption.weight).toBeGreaterThanOrEqual(25.5);
  // it must NOT be attached to any per-item-type row (no ornament/item-type link exists for a melt)
  const anyRowHasMeltField = (res.body.data.rows || []).some((r) => 'meltConsumption' in r || 'meltWeight' in r);
  expect(anyRowHasMeltField).toBe(false);
});
