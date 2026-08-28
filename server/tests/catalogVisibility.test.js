/**
 * "Hide from Catalog" (tbl_ornament_master.Show_In_Catalog) — a pure
 * catalog-display toggle, deliberately independent of the Is_Hidden/
 * Data_Mode accounting-book machinery covered by hiddenStockSales.test.js.
 * Confirms: bulk hide/show via PUT /api/ornaments/catalog-visibility;
 * customer-facing /api/catalog/exhibition and /api/catalog/public/:barcode
 * exclude hidden items while staff-facing /api/catalog/search does not;
 * billing (POST /api/sales/create) is completely unaffected either way;
 * and the isolated GET /api/reports/catalog-hidden-stock report lists
 * exactly the hidden items with their real sale status, without excluding
 * anything from the ordinary item-wise-sales report.
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
  await testTenant.teardown();
  await db.destroy();
});

async function createOrnament(overrides = {}) {
  const res = await request(app).post('/api/ornaments').set(auth()).send({
    Type_ID: typeId, Metal_Type: 'Gold', Gross_Weight: 5, Net_Gold_Weight: 4.5, Current_Gold_Rate: 6000,
    Base_Making_Charge_Per_Gram: 100, Purchase_Cost: 20000, Total_Price: 28000, Is_On_Display: true, ...overrides,
  });
  return res.body.data;
}

test('every new item defaults to Show_In_Catalog=true (visible unless deliberately hidden)', async () => {
  const ornament = await createOrnament();
  expect(ornament.Show_In_Catalog).toBe(true);
});

test('PUT /api/ornaments/catalog-visibility bulk-hides a batch of items in one call', async () => {
  // Sequential, not Promise.all — generateArticleNumber isn't safe against
  // concurrent calls racing for the same next number (a real gap, but out
  // of scope for this feature; avoided here rather than papering over it).
  const items = [];
  for (let i = 0; i < 3; i++) items.push(await createOrnament());
  const ids = items.map(i => i.Ornament_ID);

  const res = await request(app).put('/api/ornaments/catalog-visibility').set(auth()).send({
    ornamentIds: ids, showInCatalog: false,
  });
  expect(res.status).toBe(200);
  expect(res.body.data.updatedCount).toBe(3);

  const rows = await db('tbl_ornament_master').whereIn('Ornament_ID', ids);
  expect(rows.every(r => r.Show_In_Catalog === false)).toBe(true);
});

test('bulk-restoring the same items sets Show_In_Catalog back to true', async () => {
  const ornament = await createOrnament();
  await request(app).put('/api/ornaments/catalog-visibility').set(auth()).send({
    ornamentIds: [ornament.Ornament_ID], showInCatalog: false,
  });
  const res = await request(app).put('/api/ornaments/catalog-visibility').set(auth()).send({
    ornamentIds: [ornament.Ornament_ID], showInCatalog: true,
  });
  expect(res.status).toBe(200);
  const row = await db('tbl_ornament_master').where({ Ornament_ID: ornament.Ornament_ID }).first();
  expect(row.Show_In_Catalog).toBe(true);
});

test('catalog-visibility update is scoped to the caller\'s own tenant — cannot touch another tenant\'s stock', async () => {
  const dljOrnament = await db('tbl_ornament_master').where({ Tenant_ID: 'DLJ', Is_Active: true }).first();
  if (!dljOrnament) return; // nothing to check against in this environment
  const before = dljOrnament.Show_In_Catalog;

  await request(app).put('/api/ornaments/catalog-visibility').set(auth()).send({
    ornamentIds: [dljOrnament.Ornament_ID], showInCatalog: !before,
  });

  const after = await db('tbl_ornament_master').where({ Ornament_ID: dljOrnament.Ornament_ID }).first();
  expect(after.Show_In_Catalog).toBe(before); // unchanged — cross-tenant write silently no-ops
});

test('a catalog-hidden item disappears from GET /api/catalog/exhibition (customer-facing) but still appears in GET /api/catalog/search (staff-facing)', async () => {
  const ornament = await createOrnament({ Article_Number: 'CATHIDE-EXHIBIT-001' });
  await request(app).put('/api/ornaments/catalog-visibility').set(auth()).send({
    ornamentIds: [ornament.Ornament_ID], showInCatalog: false,
  });

  const exhibition = await request(app).get('/api/catalog/exhibition').set(auth());
  expect(exhibition.body.data.some(i => i.Ornament_ID === ornament.Ornament_ID)).toBe(false);

  const search = await request(app).get('/api/catalog/search').set(auth()).query({ barcode: ornament.Article_Number });
  expect(search.body.data.items.some(i => i.Ornament_ID === ornament.Ornament_ID)).toBe(true);
});

test('a catalog-hidden item 404s on the public no-auth barcode lookup', async () => {
  const ornament = await createOrnament({ Article_Number: 'CATHIDE-PUBLIC-001' });
  await request(app).put('/api/ornaments/catalog-visibility').set(auth()).send({
    ornamentIds: [ornament.Ornament_ID], showInCatalog: false,
  });

  const res = await request(app).get(`/api/catalog/public/${ornament.Article_Number}`);
  expect(res.status).toBe(404);
});

test('POST /api/sales/create bills a catalog-hidden item completely normally — no different invoice prefix, no exclusion from item-wise-sales', async () => {
  const ornament = await createOrnament({ Article_Number: 'CATHIDE-BILL-001', Total_Price: 12345 });
  await request(app).put('/api/ornaments/catalog-visibility').set(auth()).send({
    ornamentIds: [ornament.Ornament_ID], showInCatalog: false,
  });

  const sale = await request(app).post('/api/sales/create').set(auth()).send({
    Payment_Mode: 'Cash',
    items: [{ Ornament_ID: ornament.Ornament_ID, Article_Number: ornament.Article_Number, Total_Line_Price: 12345, Item_Type_Name: 'QA Catalog Hidden Item' }],
  });
  expect(sale.status).toBe(201);

  const header = await db('tbl_sales_header').where({ Sale_ID: sale.body.data.sale.Sale_ID }).first();
  expect(header.Invoice_Number).toMatch(/^INV-/); // plain prefix — not treated as an accounting-book hide
  expect(header.Contains_Hidden_Stock).toBe(false);

  const today = dayjs().format('YYYY-MM-DD');
  const itemWise = await request(app).get('/api/reports/item-wise-sales').set(auth()).query({ fromDate: today, toDate: today });
  const row = itemWise.body.data.find(r => r.Type_Name === 'QA Catalog Hidden Item');
  expect(row).toBeDefined();
  expect(parseFloat(row.revenue)).toBeCloseTo(12345, 1); // fully counted — nothing excluded from the real sales report
});

test('GET /api/reports/catalog-hidden-stock isolates hidden items and shows real sale status, without any special permission or mode gate', async () => {
  const stillInStock = await createOrnament({ Article_Number: 'CATHIDE-REPORT-STOCK', Total_Price: 5000 });
  const sold = await createOrnament({ Article_Number: 'CATHIDE-REPORT-SOLD', Total_Price: 7000 });
  await request(app).put('/api/ornaments/catalog-visibility').set(auth()).send({
    ornamentIds: [stillInStock.Ornament_ID, sold.Ornament_ID], showInCatalog: false,
  });
  await request(app).post('/api/sales/create').set(auth()).send({
    Payment_Mode: 'Cash',
    items: [{ Ornament_ID: sold.Ornament_ID, Article_Number: sold.Article_Number, Total_Line_Price: 7000 }],
  }).expect(201);

  const res = await request(app).get('/api/reports/catalog-hidden-stock').set(auth());
  expect(res.status).toBe(200);

  const stockRow = res.body.data.items.find(i => i.Article_Number === 'CATHIDE-REPORT-STOCK');
  expect(stockRow).toBeDefined();
  expect(stockRow.Is_Sold).toBe(false);
  expect(stockRow.Invoice_Number).toBeNull();

  const soldRow = res.body.data.items.find(i => i.Article_Number === 'CATHIDE-REPORT-SOLD');
  expect(soldRow).toBeDefined();
  expect(soldRow.Is_Sold).toBe(true);
  expect(parseFloat(soldRow.Total_Line_Price)).toBe(7000);
  expect(soldRow.Invoice_Number).toMatch(/^INV-/);
});
