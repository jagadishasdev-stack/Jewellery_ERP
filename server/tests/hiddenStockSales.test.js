/**
 * Hidden stock can be billed from EITHER screen (Official or Unofficial).
 * What matters is that the resulting sale carries its own permanent record
 * of having touched hidden stock — Contains_Hidden_Stock, plus HINV-/HSAL-
 * number prefixes — independent of Data_Mode, so Official-mode reports keep
 * excluding it even though such a sale can now have Data_Mode=3. Also
 * covers: the "Currently Hidden" list used to keep showing sold items
 * forever (Is_Hidden is never cleared on sale), and the "hidden stock sold"
 * report that relies on exactly that fact to work.
 *
 * Real, reported bug (found via a live "why is it showing stock not
 * found" report at the POS counter): a hidden item's own barcode/search
 * lookup used to 404 in Official/Practice mode regardless of what the
 * caller intended — POS could never scan it onto a bill in the first
 * place, only reach it via a stale ID or a direct API call. That
 * defeated the whole point of "hidden stock is still billable from
 * either screen" — it was billable in theory, un-scannable in practice.
 * Fixed via applyStockVisibility's new `includeHidden` opt-in, which POS's
 * own barcode/search calls now always pass (client/src/pages/pos/
 * POSPage.jsx) — a normal browse/list caller (Stock Management, reports)
 * that doesn't pass it keeps the original hide-it-from-browsing behavior
 * unchanged.
 */
const request = require('supertest');
const { app } = require('../src/index');
const db = require('../src/db/knex');
const testTenant = require('./helpers/testTenant');
const dayjs = require('dayjs');

let tenant, token, typeId, hiddenLocationId;
const auth = () => ({ Authorization: `Bearer ${token}` });

beforeAll(async () => {
  tenant = await testTenant.setup();
  const res = await request(app).post('/api/auth/login').send({ username: tenant.username, password: tenant.password, tenantId: tenant.tenantId });
  token = res.body.data.token;
  typeId = (await db('tbl_item_type_master').first()).Type_ID;

  const loc = await request(app).post('/api/floors/hidden-locations').set(auth()).send({
    Location_Code: 'QA-VAULT', Location_Name: 'QA Test Vault',
  });
  hiddenLocationId = loc.body.data.Hidden_Location_ID;
});

afterAll(async () => {
  await testTenant.teardown();
  await db.destroy();
});

async function createOrnament(overrides = {}) {
  const res = await request(app).post('/api/ornaments').set(auth()).send({
    Type_ID: typeId, Metal_Type: 'Gold', Gross_Weight: 5, Net_Gold_Weight: 4.5, Current_Gold_Rate: 6000,
    Base_Making_Charge_Per_Gram: 100, Purchase_Cost: 20000, Total_Price: 28000, ...overrides,
  });
  return res.body.data;
}

async function hideOrnament(ornamentId) {
  const res = await request(app).post('/api/transfer/hide').set(auth()).send({
    level: 'item', ids: [ornamentId], hiddenLocationId, reason: 'QA test hide',
  });
  expect(res.status).toBe(200);
  return res.body.data;
}

test('POST /api/sales/create now ALLOWS selling a hidden item in Official mode, marked distinctly', async () => {
  const ornament = await createOrnament();
  await hideOrnament(ornament.Ornament_ID);

  const res = await request(app).post('/api/sales/create').set(auth()).send({
    Payment_Mode: 'Cash',
    items: [{ Ornament_ID: ornament.Ornament_ID, Article_Number: ornament.Article_Number, Total_Line_Price: 28000 }],
  });
  expect(res.status).toBe(201);

  const sale = await db('tbl_sales_header').where({ Sale_ID: res.body.data.sale.Sale_ID }).first();
  expect(sale.Contains_Hidden_Stock).toBe(true);
  expect(sale.Data_Mode).toBe(3); // billed from the Official screen
  expect(sale.Invoice_Number).toMatch(/^HINV-/);
  expect(sale.Voucher_ID).toMatch(/^HSAL-/);

  const sold = await db('tbl_ornament_master').where({ Ornament_ID: ornament.Ornament_ID }).first();
  expect(sold.Is_Sold).toBe(true);
});

test('an ordinary (non-hidden) Official-mode sale still gets the plain INV-/SAL- prefix', async () => {
  const ornament = await createOrnament();

  const res = await request(app).post('/api/sales/create').set(auth()).send({
    Payment_Mode: 'Cash',
    items: [{ Ornament_ID: ornament.Ornament_ID, Article_Number: ornament.Article_Number, Total_Line_Price: 28000 }],
  });
  expect(res.status).toBe(201);

  const sale = await db('tbl_sales_header').where({ Sale_ID: res.body.data.sale.Sale_ID }).first();
  expect(sale.Contains_Hidden_Stock).toBe(false);
  expect(sale.Invoice_Number).toMatch(/^INV-/);
  expect(sale.Voucher_ID).toMatch(/^SAL-/);
});

test('an Official-mode hidden-stock sale is excluded from the Official sales-by-metal report; the ordinary sale still counts', async () => {
  const hidden = await createOrnament({ Article_Number: 'OFFICIAL-HIDE-001', Total_Price: 15000 });
  await hideOrnament(hidden.Ornament_ID);
  const hiddenSale = await request(app).post('/api/sales/create').set(auth()).send({
    Payment_Mode: 'Cash',
    items: [{ Ornament_ID: hidden.Ornament_ID, Article_Number: hidden.Article_Number, Total_Line_Price: 15000, Item_Type_Name: 'QA Report Item' }],
  });
  expect(hiddenSale.status).toBe(201);

  const visible = await createOrnament({ Article_Number: 'OFFICIAL-VISIBLE-001', Total_Price: 7000 });
  const visibleSale = await request(app).post('/api/sales/create').set(auth()).send({
    Payment_Mode: 'Cash',
    items: [{ Ornament_ID: visible.Ornament_ID, Article_Number: visible.Article_Number, Total_Line_Price: 7000, Item_Type_Name: 'QA Report Item' }],
  });
  expect(visibleSale.status).toBe(201);

  const today = dayjs().format('YYYY-MM-DD');
  const officialItemWise = await request(app).get('/api/reports/item-wise-sales').set(auth()).query({ fromDate: today, toDate: today });
  const qaRow = officialItemWise.body.data.find((r) => r.Type_Name === 'QA Report Item');
  // Only the 7000 visible-item sale should count — the 15000 hidden-item
  // sale must be excluded even though it was billed under Official mode.
  expect(parseFloat(qaRow.revenue)).toBeCloseTo(7000, 1);
});

test('POST /api/sales/create allows selling the same hidden item in Unofficial mode', async () => {
  const ornament = await createOrnament();
  await hideOrnament(ornament.Ornament_ID);

  const res = await request(app).post('/api/sales/create').set(auth()).set('X-Data-Mode', '2').send({
    Payment_Mode: 'Cash',
    items: [{ Ornament_ID: ornament.Ornament_ID, Article_Number: ornament.Article_Number, Total_Line_Price: 28000 }],
  });
  expect(res.status).toBe(201);

  const sold = await db('tbl_ornament_master').where({ Ornament_ID: ornament.Ornament_ID }).first();
  expect(sold.Is_Sold).toBe(true);
  expect(sold.Is_Hidden).toBe(true); // deliberately never cleared — see the hidden-stock-sales report
});

test('a sold hidden item no longer appears on "Currently Hidden" but does appear on "Sold From Hidden"', async () => {
  const ornament = await createOrnament({ Total_Price: 9999 });
  await hideOrnament(ornament.Ornament_ID);

  const beforeSale = await request(app).get('/api/floors/hidden-stock').set(auth()).set('X-Data-Mode', '2');
  expect(beforeSale.body.data.some((i) => i.Ornament_ID === ornament.Ornament_ID)).toBe(true);

  await request(app).post('/api/sales/create').set(auth()).set('X-Data-Mode', '2').send({
    Payment_Mode: 'Cash',
    items: [{ Ornament_ID: ornament.Ornament_ID, Article_Number: ornament.Article_Number, Total_Line_Price: 9999 }],
  }).expect(201);

  const afterSale = await request(app).get('/api/floors/hidden-stock').set(auth()).set('X-Data-Mode', '2');
  expect(afterSale.body.data.some((i) => i.Ornament_ID === ornament.Ornament_ID)).toBe(false);

  const soldReport = await request(app).get('/api/floors/reports/hidden-stock-sales').set(auth()).set('X-Data-Mode', '2');
  expect(soldReport.status).toBe(200);
  const match = soldReport.body.data.items.find((i) => i.Ornament_ID === ornament.Ornament_ID);
  expect(match).toBeDefined();
  expect(parseFloat(match.Total_Line_Price)).toBe(9999);
});

test('the hidden-stock-sales report is 403 outside Unofficial mode', async () => {
  const res = await request(app).get('/api/floors/reports/hidden-stock-sales').set(auth());
  expect(res.status).toBe(403);
});

test('GET /api/ornaments/:id is scoped to the caller\'s own tenant', async () => {
  // Regression for a real cross-tenant leak: this route had NO Tenant_ID
  // filter at all — any authenticated user of any tenant could fetch any
  // other tenant's ornament by numeric ID. Uses DLJ (a real other tenant)
  // to prove the fix, read-only.
  const dljOrnament = await db('tbl_ornament_master').where({ Tenant_ID: 'DLJ', Is_Active: true }).first();
  if (!dljOrnament) return; // nothing to check against in this environment
  const res = await request(app).get(`/api/ornaments/${dljOrnament.Ornament_ID}`).set(auth());
  expect(res.status).toBe(404);
});

describe('Data_Mode isolation — Practice/Dummy-mode data must never leak into these Unofficial reports', () => {
  // None of /hidden-stock, /reports/visibility-comparison, or
  // /reports/hidden-stock-sales originally filtered by Data_Mode at all —
  // applyStockVisibility's own rule (Unofficial = Data_Mode IN (2,3),
  // excluding Practice/1) was silently not applied here, so a Practice-
  // mode test item could show up mixed into these real business reports.
  test('a Practice-mode (Data_Mode=1) hidden+sold item does not appear in the Unofficial-mode reports', async () => {
    const ornament = await createOrnament({ Article_Number: 'PRACTICE-HIDE-001', Total_Price: 5000 });
    await db('tbl_ornament_master').where({ Ornament_ID: ornament.Ornament_ID }).update({ Data_Mode: 1 });
    await hideOrnament(ornament.Ornament_ID);

    // Sold while the REQUEST is in Unofficial mode (dm=2, so the sale's own
    // Data_Mode is 2) — but the ornament itself is still tagged Practice (1).
    const sale = await request(app).post('/api/sales/create').set(auth()).set('X-Data-Mode', '2').send({
      Payment_Mode: 'Cash',
      items: [{ Ornament_ID: ornament.Ornament_ID, Article_Number: ornament.Article_Number, Total_Line_Price: 5000 }],
    });
    expect(sale.status).toBe(201);

    const hiddenList = await request(app).get('/api/floors/hidden-stock').set(auth()).set('X-Data-Mode', '2');
    expect(hiddenList.body.data.some((i) => i.Article_Number === 'PRACTICE-HIDE-001')).toBe(false);

    const soldReport = await request(app).get('/api/floors/reports/hidden-stock-sales').set(auth()).set('X-Data-Mode', '2');
    expect(soldReport.body.data.items.some((i) => i.Article_Number === 'PRACTICE-HIDE-001')).toBe(false);
  });

  test('a Practice-mode hidden item does not inflate the visibility-comparison counts', async () => {
    const before = await request(app).get('/api/floors/reports/visibility-comparison').set(auth()).set('X-Data-Mode', '2');
    const ornament = await createOrnament({ Article_Number: 'PRACTICE-HIDE-002', Total_Price: 1234 });
    await db('tbl_ornament_master').where({ Ornament_ID: ornament.Ornament_ID }).update({ Data_Mode: 1 });
    await hideOrnament(ornament.Ornament_ID);

    const after = await request(app).get('/api/floors/reports/visibility-comparison').set(auth()).set('X-Data-Mode', '2');
    expect(parseInt(after.body.data.hidden_count)).toBe(parseInt(before.body.data.hidden_count)); // unchanged — Practice item excluded
  });
});

test('GET /api/ornaments/:id hides a hidden item\'s detail in Official mode but shows it in Unofficial', async () => {
  const ornament = await createOrnament();
  await hideOrnament(ornament.Ornament_ID);

  const official = await request(app).get(`/api/ornaments/${ornament.Ornament_ID}`).set(auth());
  expect(official.status).toBe(404);

  const unofficial = await request(app).get(`/api/ornaments/${ornament.Ornament_ID}`).set(auth()).set('X-Data-Mode', '2');
  expect(unofficial.status).toBe(200);
  expect(unofficial.body.data.Ornament_ID).toBe(ornament.Ornament_ID);
});

describe('POS must be able to scan/search a hidden item onto a bill (real reported bug)', () => {
  test('GET /api/ornaments/barcode/:code still 404s for a hidden item without includeHidden — unchanged default for plain browsing', async () => {
    const ornament = await createOrnament({ Article_Number: 'QA-HIDDEN-BARCODE-001' });
    await hideOrnament(ornament.Ornament_ID);

    const res = await request(app).get(`/api/ornaments/barcode/${ornament.Article_Number}`).set(auth());
    expect(res.status).toBe(404);
  });

  test('GET /api/ornaments/barcode/:code?includeHidden=true finds it — this is what POS now sends', async () => {
    const ornament = await createOrnament({ Article_Number: 'QA-HIDDEN-BARCODE-002' });
    await hideOrnament(ornament.Ornament_ID);

    const res = await request(app).get(`/api/ornaments/barcode/${ornament.Article_Number}`).query({ includeHidden: 'true' }).set(auth());
    expect(res.status).toBe(200);
    expect(res.body.data.Ornament_ID).toBe(ornament.Ornament_ID);
  });

  test('GET /api/ornaments?search=...&includeHidden=true finds a hidden item too — POS\'s text-search fallback', async () => {
    const ornament = await createOrnament({ Article_Number: 'QA-HIDDEN-SEARCH-001' });
    await hideOrnament(ornament.Ornament_ID);

    const withoutFlag = await request(app).get('/api/ornaments').query({ search: 'QA-HIDDEN-SEARCH-001' }).set(auth());
    expect(withoutFlag.body.data.items.some(i => i.Ornament_ID === ornament.Ornament_ID)).toBe(false);

    const withFlag = await request(app).get('/api/ornaments').query({ search: 'QA-HIDDEN-SEARCH-001', includeHidden: 'true' }).set(auth());
    expect(withFlag.body.data.items.some(i => i.Ornament_ID === ornament.Ornament_ID)).toBe(true);
  });

  test('includeHidden=true does NOT surface an item that is out on Approval — that is physical unavailability, not a hidden-stock override', async () => {
    const ornament = await createOrnament({ Article_Number: 'QA-APPROVAL-BARCODE-001' });
    await db('tbl_ornament_master').where({ Ornament_ID: ornament.Ornament_ID }).update({ Is_On_Approval: true });

    const res = await request(app).get(`/api/ornaments/barcode/${ornament.Article_Number}`).query({ includeHidden: 'true' }).set(auth());
    expect(res.status).toBe(404);
  });
});
