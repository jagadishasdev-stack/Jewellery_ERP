/**
 * Cost of Goods Sold was never posted anywhere at all — a sale's journal
 * only ever had revenue/GST/payment lines, so the P&L reported zero cost
 * of sales and looked far more profitable than reality. Purchases of
 * silver/platinum/diamond also all Dr'd 'Gold Stock Account' regardless
 * of what was actually bought, since it was hardcoded.
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

test('a purchase Dr\'s each metal\'s OWN stock account, not a hardcoded Gold Stock Account', async () => {
  const res = await request(app).post('/api/purchase/create').set(auth()).send({
    Supplier_Name: 'QA COGS Supplier', Purchase_Date: '2026-08-20', Total_Amount: 55000, Subtotal_Amount: 55000,
    items: [
      { Metal_Type: 'Gold', Gross_Weight: 5, Purchase_Rate: 30000, Article_Number: 'QACOGS-G1' },
      { Metal_Type: 'Silver', Gross_Weight: 50, Purchase_Rate: 25000, Article_Number: 'QACOGS-S1' },
    ],
  });
  expect(res.status).toBe(201);
  const purchaseNumber = res.body.data.Purchase_Number;

  const journal = await db('tbl_accounting_journal').where({ Tenant_ID: tenant.tenantId, Reference: purchaseNumber, Source_Type: 'PURCHASE' }).first();
  expect(journal).toBeDefined();
  const entries = await db('tbl_accounting_entries').where({ Journal_ID: journal.Journal_ID });

  const goldLine = entries.find((e) => e.Ledger_Account === 'Gold Stock Account');
  const silverLine = entries.find((e) => e.Ledger_Account === 'Silver Stock Account');
  expect(goldLine).toBeDefined();
  expect(parseFloat(goldLine.Amount)).toBe(30000);
  expect(silverLine).toBeDefined();
  expect(parseFloat(silverLine.Amount)).toBe(25000);

  const totalDr = entries.filter((e) => e.Entry_Type === 'Dr').reduce((s, e) => s + parseFloat(e.Amount), 0);
  const totalCr = entries.filter((e) => e.Entry_Type === 'Cr').reduce((s, e) => s + parseFloat(e.Amount), 0);
  expect(totalDr).toBe(totalCr);
});

test('a sale posts real COGS — Dr Cost of Goods Sold, Cr the ornament\'s own metal stock account, at Purchase_Cost not sale price', async () => {
  const ornamentRes = await request(app).post('/api/ornaments').set(auth()).send({
    Type_ID: typeId, Metal_Type: 'Silver', Gross_Weight: 20, Net_Gold_Weight: 20, Current_Gold_Rate: 900,
    Base_Making_Charge_Per_Gram: 50, Purchase_Cost: 12000, Total_Price: 22000, Article_Number: 'QACOGS-SALE-1',
  });
  const ornamentId = ornamentRes.body.data.Ornament_ID;

  const sale = await request(app).post('/api/sales/create').set(auth()).send({
    Payment_Mode: 'Cash', Amount_Paid: 22000,
    items: [{ Ornament_ID: ornamentId, Article_Number: 'QACOGS-SALE-1', Total_Line_Price: 22000 }],
    payments: [{ mode: 'Cash', amount: 22000 }],
  });
  expect(sale.status).toBe(201);

  const journal = await db('tbl_accounting_journal').where({ Tenant_ID: tenant.tenantId, Reference: sale.body.data.sale.Invoice_Number }).first();
  const entries = await db('tbl_accounting_entries').where({ Journal_ID: journal.Journal_ID });

  const cogsLine = entries.find((e) => e.Ledger_Account === 'Cost of Goods Sold Account');
  const stockCreditLine = entries.find((e) => e.Ledger_Account === 'Silver Stock Account' && e.Entry_Type === 'Cr');
  expect(cogsLine).toBeDefined();
  expect(cogsLine.Entry_Type).toBe('Dr');
  expect(parseFloat(cogsLine.Amount)).toBe(12000); // Purchase_Cost, NOT the 22000 sale price
  expect(stockCreditLine).toBeDefined();
  expect(parseFloat(stockCreditLine.Amount)).toBe(12000);

  const totalDr = entries.filter((e) => e.Entry_Type === 'Dr').reduce((s, e) => s + parseFloat(e.Amount), 0);
  const totalCr = entries.filter((e) => e.Entry_Type === 'Cr').reduce((s, e) => s + parseFloat(e.Amount), 0);
  expect(totalDr).toBe(totalCr); // still balanced with COGS added on top
});
