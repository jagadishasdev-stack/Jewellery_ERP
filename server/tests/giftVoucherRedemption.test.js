/**
 * Gift vouchers used to be redeemable an unlimited number of times: POS
 * validated the voucher and applied it as a bill discount, but only sent
 * a raw Voucher_Amount to /sales/create — never the Voucher_ID — so
 * tbl_gift_vouchers.Balance_Amount was never decremented and Status
 * never changed. The same code worked forever, on every bill.
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
  await testTenant.teardown();
  await db.destroy();
});

async function makeOrnament(articleNumber, price) {
  const res = await request(app).post('/api/ornaments').set(auth()).send({
    Type_ID: typeId, Metal_Type: 'Gold', Gross_Weight: 5, Net_Gold_Weight: 4.5, Current_Gold_Rate: 6000,
    Base_Making_Charge_Per_Gram: 100, Purchase_Cost: price, Total_Price: price, Article_Number: articleNumber,
  });
  return res.body.data.Ornament_ID;
}

test('a gift voucher\'s balance is decremented by exactly what was applied, and cannot be reused past its balance', async () => {
  const createRes = await request(app).post('/api/day-close/vouchers/create').set(auth()).send({ value: 5000 });
  expect(createRes.status).toBe(201);
  const voucherId = createRes.body.data.Voucher_ID;

  // First bill: apply the full ₹5000 voucher against a ₹20000 sale.
  const ornament1 = await makeOrnament('QAGV-1', 20000);
  const sale1 = await request(app).post('/api/sales/create').set(auth()).send({
    Payment_Mode: 'Cash', Voucher_Amount: 5000, Voucher_ID: voucherId,
    items: [{ Ornament_ID: ornament1, Article_Number: 'QAGV-1', Total_Line_Price: 20000 }],
    payments: [{ mode: 'Cash', amount: 15000 }],
  });
  expect(sale1.status).toBe(201);

  const afterFirst = await db('tbl_gift_vouchers').where({ Voucher_ID: voucherId }).first();
  expect(parseFloat(afterFirst.Balance_Amount)).toBe(0);
  expect(afterFirst.Status).toBe('Redeemed');

  // The voucher redemption must reach the ledger as a real Dr line (the
  // customer "paid" with a liability the business already carries) —
  // otherwise Dr/Cr are off by the voucher amount and postJournal()
  // silently drops the WHOLE journal, not just the voucher's own line.
  const journal = await db('tbl_accounting_journal').where({ Tenant_ID: tenant.tenantId, Reference: sale1.body.data.sale.Invoice_Number }).first();
  expect(journal).toBeDefined();
  const entries = await db('tbl_accounting_entries').where({ Journal_ID: journal.Journal_ID });
  const totalDr = entries.filter((e) => e.Entry_Type === 'Dr').reduce((s, e) => s + parseFloat(e.Amount), 0);
  const totalCr = entries.filter((e) => e.Entry_Type === 'Cr').reduce((s, e) => s + parseFloat(e.Amount), 0);
  expect(totalDr).toBe(totalCr); // balanced

  // Second bill: same voucher again — must be rejected, not silently reused.
  const ornament2 = await makeOrnament('QAGV-2', 8000);
  const sale2 = await request(app).post('/api/sales/create').set(auth()).send({
    Payment_Mode: 'Cash', Voucher_Amount: 3000, Voucher_ID: voucherId,
    items: [{ Ornament_ID: ornament2, Article_Number: 'QAGV-2', Total_Line_Price: 8000 }],
    payments: [{ mode: 'Cash', amount: 5000 }],
  });
  expect(sale2.status).toBe(400);
  expect(sale2.body.message).toMatch(/Redeemed/);
});

test('partial redemption leaves the voucher Active with the remaining balance', async () => {
  const createRes = await request(app).post('/api/day-close/vouchers/create').set(auth()).send({ value: 10000 });
  const voucherId = createRes.body.data.Voucher_ID;

  const ornament = await makeOrnament('QAGV-3', 6000);
  const sale = await request(app).post('/api/sales/create').set(auth()).send({
    Payment_Mode: 'Cash', Voucher_Amount: 4000, Voucher_ID: voucherId,
    items: [{ Ornament_ID: ornament, Article_Number: 'QAGV-3', Total_Line_Price: 6000 }],
    payments: [{ mode: 'Cash', amount: 2000 }],
  });
  expect(sale.status).toBe(201);

  const after = await db('tbl_gift_vouchers').where({ Voucher_ID: voucherId }).first();
  expect(parseFloat(after.Balance_Amount)).toBe(6000);
  expect(after.Status).toBe('Active');
});
