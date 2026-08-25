/**
 * Repair-to-original-sale-and-karigar linkage, plus the karigar/design
 * performance analytics built on top of it. Confirms: the linkage is
 * resolved and verified SERVER-SIDE (never trusts a client-supplied
 * Sale_ID/Karigar_ID directly), a repair for an item never sold here
 * simply has no link (not an error), and the repair-rate quality proxy
 * only counts repairs that are genuinely traceable to a real prior sale.
 */
const request = require('supertest');
const { app } = require('../src/index');
const db = require('../src/db/knex');
const testTenant = require('./helpers/testTenant');

let tenant, token, typeId, karigarId, designId;
const auth = () => ({ Authorization: `Bearer ${token}` });

beforeAll(async () => {
  tenant = await testTenant.setup();
  const res = await request(app).post('/api/auth/login').send({ username: tenant.username, password: tenant.password, tenantId: tenant.tenantId });
  token = res.body.data.token;
  typeId = (await db('tbl_item_type_master').first()).Type_ID;

  const karigar = await request(app).post('/api/karigar/vendor').set(auth()).send({
    Vendor_Name: 'QA Analytics Karigar', Vendor_Type: 'Karigar', Mobile_1: '9000000097',
  });
  karigarId = karigar.body.data.Vendor_ID;

  const design = await db('tbl_design_master').insert({
    Design_Code: `QADESIGN${Date.now()}`, Design_Name: 'QA Analytics Design', Is_Active: true,
  }).returning('Design_ID');
  designId = design[0].Design_ID;
});

afterAll(async () => {
  await testTenant.teardown();
  await db.destroy();
});

async function createOrnament(overrides = {}) {
  const res = await request(app).post('/api/ornaments').set(auth()).send({
    Type_ID: typeId, Metal_Type: 'Gold', Gross_Weight: 5, Net_Gold_Weight: 4.5, Current_Gold_Rate: 6000,
    Base_Making_Charge_Per_Gram: 100, Purchase_Cost: 20000, Total_Price: 20000,
    Karigar_ID: karigarId, Design_ID: designId, ...overrides,
  });
  return res.body.data;
}

test('GET /api/repair/lookup-by-invoice resolves the karigar who made each item on that invoice', async () => {
  const ornament = await createOrnament({ Article_Number: 'QALINK-001' });
  const sale = await request(app).post('/api/sales/create').set(auth()).send({
    Payment_Mode: 'Cash',
    items: [{ Ornament_ID: ornament.Ornament_ID, Article_Number: ornament.Article_Number, Total_Line_Price: 20000 }],
  });
  expect(sale.status).toBe(201);
  const invoiceNumber = sale.body.data.sale.Invoice_Number;

  const lookup = await request(app).get(`/api/repair/lookup-by-invoice/${invoiceNumber}`).set(auth());
  expect(lookup.status).toBe(200);
  expect(lookup.body.data.items.length).toBe(1);
  expect(lookup.body.data.items[0].Karigar_Name).toBe('QA Analytics Karigar');
});

test('GET /api/repair/lookup-by-invoice 404s for an invoice number that does not exist', async () => {
  const res = await request(app).get('/api/repair/lookup-by-invoice/INV-DOES-NOT-EXIST-999').set(auth());
  expect(res.status).toBe(404);
});

test('POST /api/repair resolves and stores the original sale/karigar link server-side when a valid invoice+item is given', async () => {
  const ornament = await createOrnament({ Article_Number: 'QALINK-002' });
  const sale = await request(app).post('/api/sales/create').set(auth()).send({
    Payment_Mode: 'Cash',
    items: [{ Ornament_ID: ornament.Ornament_ID, Article_Number: ornament.Article_Number, Total_Line_Price: 20000 }],
  });
  const invoiceNumber = sale.body.data.sale.Invoice_Number;

  const repair = await request(app).post('/api/repair').set(auth()).send({
    Item_Description: 'QA repair for a piece we sold',
    Original_Invoice_Number: invoiceNumber, Original_Ornament_ID: ornament.Ornament_ID,
  });
  expect(repair.status).toBe(201);
  expect(repair.body.data.Original_Sale_ID).toBe(parseInt(sale.body.data.sale.Sale_ID));
  expect(repair.body.data.Original_Karigar_ID).toBe(karigarId);

  const list = await request(app).get('/api/repair').set(auth());
  const row = list.body.data.items.find(r => r.Repair_ID === repair.body.data.Repair_ID);
  expect(row.Original_Karigar_Name).toBe('QA Analytics Karigar');
});

test('POST /api/repair with a bogus invoice/ornament pair leaves the link null instead of trusting the client', async () => {
  const repair = await request(app).post('/api/repair').set(auth()).send({
    Item_Description: 'QA repair — customer\'s own old jewellery, never sold here',
    Original_Invoice_Number: 'INV-FAKE-DOES-NOT-EXIST', Original_Ornament_ID: 999999999,
  });
  expect(repair.status).toBe(201);
  expect(repair.body.data.Original_Sale_ID).toBeNull();
  expect(repair.body.data.Original_Karigar_ID).toBeNull();
});

test('POST /api/repair with NO invoice number at all is unaffected — repairs for items never sold here still work', async () => {
  const repair = await request(app).post('/api/repair').set(auth()).send({
    Item_Description: 'QA repair — no invoice given',
  });
  expect(repair.status).toBe(201);
  expect(repair.body.data.Original_Sale_ID).toBeNull();
});

test('GET /api/reports/karigar-performance reflects real manufactured/sold counts and the repair-rate quality proxy', async () => {
  // This karigar (from prior tests) has manufactured >= 2 pieces and sold
  // >= 2, with at least 1 repair traced back via Original_Karigar_ID.
  const res = await request(app).get('/api/reports/karigar-performance').set(auth());
  expect(res.status).toBe(200);
  const row = res.body.data.find(r => r.Karigar_ID === karigarId);
  expect(row).toBeDefined();
  expect(row.pieces_sold).toBeGreaterThanOrEqual(2);
  expect(row.repair_count).toBeGreaterThanOrEqual(1);
  expect(row.repair_rate).not.toBeNull();
  expect(row.repair_rate).toBeCloseTo((row.repair_count / row.pieces_sold) * 100, 0);
});

test('GET /api/reports/design-performance reflects real manufactured/sold counts for the design', async () => {
  const res = await request(app).get('/api/reports/design-performance').set(auth());
  expect(res.status).toBe(200);
  const row = res.body.data.find(r => r.Design_ID === designId);
  expect(row).toBeDefined();
  expect(row.pieces_manufactured).toBeGreaterThanOrEqual(2);
  expect(row.pieces_sold).toBeGreaterThanOrEqual(2);
});

test('a karigar with pieces manufactured but nothing sold yet has a null repair_rate, not a misleading 0%', async () => {
  const freshKarigar = await request(app).post('/api/karigar/vendor').set(auth()).send({
    Vendor_Name: 'QA Fresh Karigar No Sales', Vendor_Type: 'Karigar', Mobile_1: '9000000096',
  });
  await createOrnament({ Article_Number: 'QALINK-UNSOLD', Karigar_ID: freshKarigar.body.data.Vendor_ID });

  const res = await request(app).get('/api/reports/karigar-performance').set(auth());
  const row = res.body.data.find(r => r.Karigar_ID === freshKarigar.body.data.Vendor_ID);
  expect(row).toBeDefined();
  expect(row.pieces_sold).toBe(0);
  expect(row.repair_rate).toBeNull();
});
