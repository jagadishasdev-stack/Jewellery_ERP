/**
 * Stock Reconciliation / physical count — confirmed genuinely missing by
 * the Master/Reports/Utility audit. Deliberately two-step: a Draft count
 * never touches real stock; only a separate, explicit /apply call does,
 * and only for items with a real (nonzero) variance.
 */
const request = require('supertest');
const { app } = require('../src/index');
const db = require('../src/db/knex');
const testTenant = require('./helpers/testTenant');
const dayjs = require('dayjs');

let tenant, token, typeId;
const auth = () => ({ Authorization: `Bearer ${token}` });

beforeAll(async () => {
  tenant = await testTenant.setup();
  const res = await request(app).post('/api/auth/login').send({ username: tenant.username, password: tenant.password, tenantId: tenant.tenantId });
  token = res.body.data.token;
  typeId = (await db('tbl_item_type_master').first()).Type_ID;
});

afterAll(async () => {
  await db('tbl_stock_reconciliation_items').whereIn('Recon_ID', db('tbl_stock_reconciliation').where({ Tenant_ID: tenant.tenantId }).select('Recon_ID')).del();
  await db('tbl_stock_reconciliation').where({ Tenant_ID: tenant.tenantId }).del();
  await db('tbl_ornament_master').where({ Tenant_ID: tenant.tenantId }).del();
  await testTenant.teardown();
  await db.destroy();
});

async function createOrnament(articleNumber, stockQty = 3) {
  const res = await request(app).post('/api/ornaments').set(auth()).send({
    Type_ID: typeId, Metal_Type: 'Gold', Gross_Weight: 5, Net_Gold_Weight: 4.5, Current_Gold_Rate: 6000,
    Base_Making_Charge_Per_Gram: 100, Purchase_Cost: 15000, Total_Price: 18000, Article_Number: articleNumber, Stock_Quantity: stockQty,
  });
  return res.body.data;
}

test('creating a reconciliation snapshots System_Quantity and computes Variance, but does NOT touch real stock yet', async () => {
  const ornament = await createOrnament('QARECON-0001', 5);

  const res = await request(app).post('/api/stock-reconciliation/create').set(auth()).send({
    Recon_Date: dayjs().format('YYYY-MM-DD'),
    items: [{ Ornament_ID: ornament.Ornament_ID, Counted_Quantity: 3 }],
  });

  expect(res.status).toBe(201);
  expect(res.body.data.header.Status).toBe('Draft');
  expect(res.body.data.items[0].System_Quantity).toBe(5);
  expect(res.body.data.items[0].Counted_Quantity).toBe(3);
  expect(res.body.data.items[0].Variance).toBe(-2);

  // Real stock must be completely unchanged at this point — it's still a Draft.
  const stillOriginal = await db('tbl_ornament_master').where({ Ornament_ID: ornament.Ornament_ID }).first();
  expect(stillOriginal.Stock_Quantity).toBe(5);
});

test('applying a Draft updates real stock only for items with nonzero variance, and cannot be applied twice', async () => {
  const changed = await createOrnament('QARECON-0002', 10);
  const unchanged = await createOrnament('QARECON-0003', 7);

  const create = await request(app).post('/api/stock-reconciliation/create').set(auth()).send({
    Recon_Date: dayjs().format('YYYY-MM-DD'),
    items: [
      { Ornament_ID: changed.Ornament_ID, Counted_Quantity: 8 },   // real variance: -2
      { Ornament_ID: unchanged.Ornament_ID, Counted_Quantity: 7 }, // no variance: 0
    ],
  });
  const reconId = create.body.data.header.Recon_ID;

  const apply = await request(app).post(`/api/stock-reconciliation/${reconId}/apply`).set(auth()).send();
  expect(apply.status).toBe(200);
  expect(apply.body.data.Status).toBe('Applied');
  expect(apply.body.message).toMatch(/1 item/); // only the one with real variance counted as "adjusted"

  const changedRow = await db('tbl_ornament_master').where({ Ornament_ID: changed.Ornament_ID }).first();
  const unchangedRow = await db('tbl_ornament_master').where({ Ornament_ID: unchanged.Ornament_ID }).first();
  expect(changedRow.Stock_Quantity).toBe(8); // adjusted to counted quantity
  expect(unchangedRow.Stock_Quantity).toBe(7); // untouched, was already correct

  const reapply = await request(app).post(`/api/stock-reconciliation/${reconId}/apply`).set(auth()).send();
  expect(reapply.status).toBe(400);
  expect(reapply.body.message).toMatch(/already been applied/);
});

test('GET list includes item_count and total_abs_variance summaries, and GET detail includes Article_Number per item', async () => {
  const ornament = await createOrnament('QARECON-0004', 4);
  const create = await request(app).post('/api/stock-reconciliation/create').set(auth()).send({
    Recon_Date: dayjs().format('YYYY-MM-DD'),
    items: [{ Ornament_ID: ornament.Ornament_ID, Counted_Quantity: 6 }],
  });
  const reconId = create.body.data.header.Recon_ID;

  const list = await request(app).get('/api/stock-reconciliation').set(auth());
  const row = list.body.data.find((r) => r.Recon_ID === reconId);
  expect(row.item_count).toBe(1);
  expect(row.total_abs_variance).toBe(2);

  const detail = await request(app).get(`/api/stock-reconciliation/${reconId}`).set(auth());
  expect(detail.body.data.items[0].Article_Number).toBe('QARECON-0004');
});
