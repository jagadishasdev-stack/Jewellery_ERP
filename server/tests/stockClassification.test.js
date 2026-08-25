/**
 * Special Stock Isolation & Dual Screen Inventory Management.
 * Stock_Classification (Normal/Special) is a pure operational/display tag
 * — which screen an item shows on by default — deliberately independent
 * of Is_Hidden/Data_Mode/Contains_Hidden_Stock (the pre-existing, separate
 * Official/Unofficial accounting-mode feature) and of Show_In_Catalog.
 * The single most important thing these tests confirm: a Special Stock
 * sale bills through the EXACT same path as any other sale — same
 * invoice prefix, full GST/accounting, fully counted in reports. Nothing
 * here may ever exclude a real sale from a real report.
 */
const request = require('supertest');
const { app } = require('../src/index');
const db = require('../src/db/knex');
const testTenant = require('./helpers/testTenant');

let tenant, token, typeId, floorId, counterId, trayId;
const auth = () => ({ Authorization: `Bearer ${token}` });

beforeAll(async () => {
  tenant = await testTenant.setup();
  const res = await request(app).post('/api/auth/login').send({ username: tenant.username, password: tenant.password, tenantId: tenant.tenantId });
  token = res.body.data.token;
  typeId = (await db('tbl_item_type_master').first()).Type_ID;

  const floor = await request(app).post('/api/floors').set(auth()).send({ Branch_ID: tenant.branchId, Floor_Code: 'QASP', Floor_Name: 'QA Special Floor', Floor_Number: 9 });
  if (floor.status !== 201) throw new Error('floor setup failed: ' + JSON.stringify(floor.body));
  floorId = floor.body.data.Floor_ID;
  const counter = await request(app).post('/api/floors/counters').set(auth()).send({ Branch_ID: tenant.branchId, Floor_ID: floorId, Counter_Code: 'QASP-C1', Counter_Name: 'QA Special Counter', Counter_Type: 'Showcase' });
  if (counter.status !== 201) throw new Error('counter setup failed: ' + JSON.stringify(counter.body));
  counterId = counter.body.data.Counter_ID;
  const tray = await request(app).post('/api/floors/trays').set(auth()).send({ Branch_ID: tenant.branchId, Floor_ID: floorId, Counter_ID: counterId, Tray_Code: 'QASP-T1', Tray_Name: 'QA Special Tray' });
  if (tray.status !== 201) throw new Error('tray setup failed: ' + JSON.stringify(tray.body));
  trayId = tray.body.data.Tray_ID;
});

afterAll(async () => {
  await testTenant.teardown();
  await db.destroy();
});

async function createOrnament(overrides = {}) {
  const res = await request(app).post('/api/ornaments').set(auth()).send({
    Type_ID: typeId, Metal_Type: 'Gold', Gross_Weight: 5, Net_Gold_Weight: 4.5, Current_Gold_Rate: 6000,
    Base_Making_Charge_Per_Gram: 100, Purchase_Cost: 20000, Total_Price: 20000, ...overrides,
  });
  return res.body.data;
}

const today = () => new Date().toISOString().slice(0, 10);

test('every new item defaults to Stock_Classification=Normal', async () => {
  const ornament = await createOrnament();
  expect(ornament.Stock_Classification).toBe('Normal');
});

test('PUT /api/ornaments/stock-classification bulk-classifies items as Special, with an optional type and reason, and logs it to the audit trail', async () => {
  const items = [];
  for (let i = 0; i < 3; i++) items.push(await createOrnament());
  const ids = items.map(i => i.Ornament_ID);

  const res = await request(app).put('/api/ornaments/stock-classification').set(auth()).send({
    ornamentIds: ids, classification: 'Special', specialType: 'In-house Karigar', reason: 'QA test classification',
  });
  expect(res.status).toBe(200);
  expect(res.body.data.updatedCount).toBe(3);

  const rows = await db('tbl_ornament_master').whereIn('Ornament_ID', ids);
  expect(rows.every(r => r.Stock_Classification === 'Special')).toBe(true);
  expect(rows.every(r => r.Special_Stock_Type === 'In-house Karigar')).toBe(true);

  const audit = await db('tbl_audit_log')
    .where({ Tenant_ID: tenant.tenantId, Table_Name: 'tbl_ornament_master', Action_Type: 'STOCK_CLASSIFY' })
    .orderBy('Log_ID', 'desc').first();
  expect(audit).toBeDefined();
  expect(audit.Description).toBe('QA test classification');
});

test('barcode/Article_Number never changes when an item is classified as Special (section 15 of the spec)', async () => {
  const ornament = await createOrnament({ Article_Number: 'QASP-BARCODE-001' });
  await request(app).put('/api/ornaments/stock-classification').set(auth()).send({
    ornamentIds: [ornament.Ornament_ID], classification: 'Special',
  });
  const row = await db('tbl_ornament_master').where({ Ornament_ID: ornament.Ornament_ID }).first();
  expect(row.Article_Number).toBe('QASP-BARCODE-001');
});

test('reclassifying back to Normal clears Special_Stock_Type', async () => {
  const ornament = await createOrnament();
  await request(app).put('/api/ornaments/stock-classification').set(auth()).send({
    ornamentIds: [ornament.Ornament_ID], classification: 'Special', specialType: 'Reserved',
  });
  const res = await request(app).put('/api/ornaments/stock-classification').set(auth()).send({
    ornamentIds: [ornament.Ornament_ID], classification: 'Normal',
  });
  expect(res.status).toBe(200);
  const row = await db('tbl_ornament_master').where({ Ornament_ID: ornament.Ornament_ID }).first();
  expect(row.Stock_Classification).toBe('Normal');
  expect(row.Special_Stock_Type).toBeNull();
});

test('the generic PUT /api/ornaments/:id silently drops Stock_Classification — it can only be changed through the dedicated, audited endpoint', async () => {
  const ornament = await createOrnament();
  const res = await request(app).put(`/api/ornaments/${ornament.Ornament_ID}`).set(auth()).send({
    Stock_Classification: 'Special', Special_Stock_Type: 'Sneaky bypass attempt',
  });
  expect(res.status).toBe(200);
  const row = await db('tbl_ornament_master').where({ Ornament_ID: ornament.Ornament_ID }).first();
  expect(row.Stock_Classification).toBe('Normal'); // unchanged — the field was stripped, not applied
});

test('PUT /api/ornaments/stock-classification/by-location classifies every active item under a tray/counter/floor at once', async () => {
  const a = await createOrnament({ Article_Number: 'QASP-LOC-A' });
  const b = await createOrnament({ Article_Number: 'QASP-LOC-B' });
  await request(app).put(`/api/ornaments/${a.Ornament_ID}`).set(auth()).send({ Floor_ID: floorId, Counter_ID: counterId, Tray_ID: trayId });
  await request(app).put(`/api/ornaments/${b.Ornament_ID}`).set(auth()).send({ Floor_ID: floorId, Counter_ID: counterId, Tray_ID: trayId });

  const res = await request(app).put('/api/ornaments/stock-classification/by-location').set(auth()).send({
    trayId, classification: 'Special', specialType: 'Special Collection', reason: 'QA tray-level classification',
  });
  expect(res.status).toBe(200);
  expect(res.body.data.updatedCount).toBe(2);

  const rows = await db('tbl_ornament_master').where({ Tray_ID: trayId });
  expect(rows.every(r => r.Stock_Classification === 'Special')).toBe(true);
});

test('GET /api/ornaments supports filtering by classification', async () => {
  const ornament = await createOrnament({ Article_Number: 'QASP-FILTER-001' });
  await request(app).put('/api/ornaments/stock-classification').set(auth()).send({
    ornamentIds: [ornament.Ornament_ID], classification: 'Special',
  });
  const res = await request(app).get('/api/ornaments').set(auth()).query({ classification: 'Special', limit: 500 });
  expect(res.status).toBe(200);
  expect(res.body.data.items.some(i => i.Article_Number === 'QASP-FILTER-001')).toBe(true);
  expect(res.body.data.items.every(i => i.Stock_Classification === 'Special')).toBe(true);
});

test('CRITICAL: a Special Stock sale bills through the exact same path as a Normal Stock sale — same invoice prefix, full GST/accounting, fully counted in item-wise-sales', async () => {
  const ornament = await createOrnament({ Article_Number: 'QASP-SALE-001', Total_Price: 15000 });
  await request(app).put('/api/ornaments/stock-classification').set(auth()).send({
    ornamentIds: [ornament.Ornament_ID], classification: 'Special', specialType: 'In-house Karigar',
  });

  const sale = await request(app).post('/api/sales/create').set(auth()).send({
    Payment_Mode: 'Cash',
    items: [{ Ornament_ID: ornament.Ornament_ID, Article_Number: ornament.Article_Number, Total_Line_Price: 15000, Item_Type_Name: 'QA Special Stock Item' }],
  });
  expect(sale.status).toBe(201);

  const header = await db('tbl_sales_header').where({ Sale_ID: sale.body.data.sale.Sale_ID }).first();
  expect(header.Invoice_Number).toMatch(/^INV-/); // plain prefix — no special-cased billing path
  expect(header.Contains_Hidden_Stock).toBe(false); // completely unrelated to the OTHER (declined) hide mechanism

  const journal = await db('tbl_accounting_journal').where({ Tenant_ID: tenant.tenantId, Reference: header.Invoice_Number }).first();
  expect(journal).toBeDefined(); // real accounting entry posted, same as any other sale

  const today_ = today();
  const itemWise = await request(app).get('/api/reports/item-wise-sales').set(auth()).query({ fromDate: today_, toDate: today_ });
  const row = itemWise.body.data.find(r => r.Type_Name === 'QA Special Stock Item');
  expect(row).toBeDefined();
  expect(parseFloat(row.revenue)).toBeCloseTo(15000, 1); // fully counted — nothing excluded

  const sold = await db('tbl_ornament_master').where({ Ornament_ID: ornament.Ornament_ID }).first();
  expect(sold.Is_Sold).toBe(true);
  expect(sold.Stock_Classification).toBe('Special'); // classification survives the sale unchanged
});

test('item-wise-sales supports an optional classification filter, without excluding anything from the total when unfiltered', async () => {
  const normalItem = await createOrnament({ Article_Number: 'QASP-FILTER-SALE-N', Total_Price: 5000 });
  const specialItem = await createOrnament({ Article_Number: 'QASP-FILTER-SALE-S', Total_Price: 8000 });
  await request(app).put('/api/ornaments/stock-classification').set(auth()).send({
    ornamentIds: [specialItem.Ornament_ID], classification: 'Special',
  });

  await request(app).post('/api/sales/create').set(auth()).send({
    Payment_Mode: 'Cash',
    items: [{ Ornament_ID: normalItem.Ornament_ID, Article_Number: normalItem.Article_Number, Total_Line_Price: 5000, Item_Type_Name: 'QA Filter Sale Item' }],
  }).expect(201);
  await request(app).post('/api/sales/create').set(auth()).send({
    Payment_Mode: 'Cash',
    items: [{ Ornament_ID: specialItem.Ornament_ID, Article_Number: specialItem.Article_Number, Total_Line_Price: 8000, Item_Type_Name: 'QA Filter Sale Item' }],
  }).expect(201);

  const d = today();
  const unfiltered = await request(app).get('/api/reports/item-wise-sales').set(auth()).query({ fromDate: d, toDate: d });
  const combinedRow = unfiltered.body.data.find(r => r.Type_Name === 'QA Filter Sale Item');
  expect(parseFloat(combinedRow.revenue)).toBeCloseTo(13000, 1); // both sales fully counted together

  const specialOnly = await request(app).get('/api/reports/item-wise-sales').set(auth()).query({ fromDate: d, toDate: d, classification: 'Special' });
  const specialRow = specialOnly.body.data.find(r => r.Type_Name === 'QA Filter Sale Item');
  expect(parseFloat(specialRow.revenue)).toBeCloseTo(8000, 1); // filtered view shows only the Special-stock slice
});

test('GET /api/reports/stock-classification-summary reconciles Normal + Special = Combined, no permission gate needed, no mode dependency', async () => {
  const res = await request(app).get('/api/reports/stock-classification-summary').set(auth());
  expect(res.status).toBe(200);
  const { normal, special, combined } = res.body.data;
  expect(combined.pieces).toBe(normal.pieces + special.pieces);
  expect(Math.round((combined.weight - (normal.weight + special.weight)) * 1000)).toBe(0);
});
