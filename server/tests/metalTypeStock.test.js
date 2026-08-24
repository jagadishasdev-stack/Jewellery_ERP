/**
 * Stock (tbl_ornament_master) previously had no structural Metal_Type —
 * only guessable by pattern-matching Purity_Code strings, and with no
 * representation at all for loose Diamond stock. This covers the new
 * Metal_Type column/validation/filtering end to end, plus real,
 * pre-existing bugs found and fixed while wiring this up:
 *   - POST /api/ornaments always required a non-zero Net_Gold_Weight/
 *     Current_Gold_Rate, making a Diamond-only stock item impossible to
 *     save at all.
 *   - The frontend "Add Stock" modal (StockManagementPage.jsx) submitted
 *     two fields (Diamond_Weight, Stock_Entry_Type) that were never real
 *     columns on tbl_ornament_master — every single save through that
 *     modal 500'd, for any entry type, before this fix. Covered here at
 *     the API layer with the exact same bogus keys the old frontend sent.
 *   - binManagement.js's two move-to-stock endpoints (Purchase Bin, Sales
 *     Return Bin) never set Metal_Type at all — a Silver/Platinum item
 *     run through either bin silently landed in stock as Gold, with no
 *     way to override it. Fixed with an explicit-override-or-infer-from-
 *     Purity-text fallback.
 *   - sync.js's device-to-cloud upload whitelist didn't include
 *     Metal_Type, so any ornament created offline and pushed up through
 *     sync also silently defaulted to Gold on arrival.
 */
const request = require('supertest');
const { v4: uuidv4 } = require('uuid');
const { app } = require('../src/index');
const db = require('../src/db/knex');
const testTenant = require('./helpers/testTenant');

let tenant, token, typeId;
const auth = () => ({ Authorization: `Bearer ${token}` });

beforeAll(async () => {
  tenant = await testTenant.setup();
  const res = await request(app).post('/api/auth/login').send({ username: tenant.username, password: tenant.password, tenantId: tenant.tenantId });
  token = res.body.data.token;
  // Type_ID is global (not per-tenant), so this must be looked up rather
  // than hardcoded — a fixed ID would drift the moment master data changes.
  typeId = (await db('tbl_item_type_master').first()).Type_ID;
});

afterAll(async () => {
  await testTenant.teardown();
  await db.destroy();
});

test('creating an ornament without Metal_Type is rejected', async () => {
  const res = await request(app).post('/api/ornaments').set(auth()).send({
    Type_ID: typeId, Gross_Weight: 5, Net_Gold_Weight: 4.5, Current_Gold_Rate: 6000,
    Base_Making_Charge_Per_Gram: 100, Purchase_Cost: 20000,
  });
  expect(res.status).toBe(422);
});

test('creating a Gold ornament stores Metal_Type and is filterable', async () => {
  const res = await request(app).post('/api/ornaments').set(auth()).send({
    Type_ID: typeId, Metal_Type: 'Gold', Gross_Weight: 5, Net_Gold_Weight: 4.5, Current_Gold_Rate: 6000,
    Base_Making_Charge_Per_Gram: 100, Purchase_Cost: 20000,
  });
  expect(res.status).toBe(201);
  expect(res.body.data.Metal_Type).toBe('Gold');

  const list = await request(app).get('/api/ornaments').query({ metalType: 'Gold' }).set(auth());
  expect(list.body.data.items.some((i) => i.Ornament_ID === res.body.data.Ornament_ID)).toBe(true);
  const silverList = await request(app).get('/api/ornaments').query({ metalType: 'Silver' }).set(auth());
  expect(silverList.body.data.items.some((i) => i.Ornament_ID === res.body.data.Ornament_ID)).toBe(false);
});

test('a Diamond-only item saves fine with zero gold weight/rate — this used to be structurally impossible', async () => {
  const res = await request(app).post('/api/ornaments').set(auth()).send({
    Type_ID: typeId, Metal_Type: 'Diamond', Gross_Weight: 2, Net_Gold_Weight: 0, Current_Gold_Rate: 0,
    Base_Making_Charge_Per_Gram: 0, Purchase_Cost: 50000, Total_Stone_Carat: 1.2,
  });
  expect(res.status).toBe(201);
  expect(res.body.data.Metal_Type).toBe('Diamond');
  expect(parseFloat(res.body.data.Net_Gold_Weight)).toBe(0);
});

test('rejects an invalid Metal_Type value', async () => {
  const res = await request(app).post('/api/ornaments').set(auth()).send({
    Type_ID: typeId, Metal_Type: 'Copper', Gross_Weight: 5, Net_Gold_Weight: 4.5, Current_Gold_Rate: 6000,
    Base_Making_Charge_Per_Gram: 100, Purchase_Cost: 20000,
  });
  expect(res.status).toBe(422);
});

test('a payload containing the two non-existent columns the old "Add Stock" modal used to send (Diamond_Weight, Stock_Entry_Type) still fails at the DB layer', async () => {
  // Locks in WHY the frontend fix (StockManagementPage.jsx renaming
  // Diamond_Weight -> Total_Stone_Carat and dropping Stock_Entry_Type
  // entirely) was necessary: ornaments.js's POST route spreads the whole
  // body straight into the insert, so these two non-columns 500 the
  // request rather than being silently ignored. If a real Stock_Entry_Type
  // column is ever added, this test should be updated/removed accordingly.
  const res = await request(app).post('/api/ornaments').set(auth()).send({
    Type_ID: typeId, Metal_Type: 'Gold', Gross_Weight: 3, Net_Gold_Weight: 3, Current_Gold_Rate: 6000,
    Base_Making_Charge_Per_Gram: 100, Purchase_Cost: 10000,
    Diamond_Weight: 0, Stock_Entry_Type: 'Opening',
  });
  expect(res.status).toBe(500);
});

test('GET /reports/inventory-value?metalType=Gold isolates the report to just Gold stock', async () => {
  const silver = await request(app).post('/api/ornaments').set(auth()).send({
    Type_ID: typeId, Metal_Type: 'Silver', Gross_Weight: 10, Net_Gold_Weight: 10, Current_Gold_Rate: 80,
    Base_Making_Charge_Per_Gram: 20, Purchase_Cost: 900,
  });
  expect(silver.status).toBe(201);

  const isolated = await request(app).get('/api/reports/inventory-value').query({ metalType: 'Gold' }).set(auth());
  expect(isolated.status).toBe(200);
  expect(isolated.body.data.byType.length).toBeGreaterThan(0);
  // byMetal is always the full, unfiltered breakdown across all metals —
  // both Gold and Silver rows should be present regardless of ?metalType.
  const metals = isolated.body.data.byMetal.map((m) => m.Metal_Type);
  expect(metals).toContain('Gold');
  expect(metals).toContain('Silver');
});

test('a purchase line item carrying Metal_Type (as the Purchase Hub/Purchase Page forms now send) creates an ornament tagged with it', async () => {
  const res = await request(app).post('/api/purchase/create').set(auth()).send({
    Total_Amount: 15000, Subtotal_Amount: 15000, GST_Amount: 0,
    items: [{ Type_ID: typeId, Metal_Type: 'Platinum', Gross_Weight: 3, Purchase_Rate: 15000 }],
  });
  expect(res.status).toBe(201);

  const items = await request(app).get(`/api/purchase/${res.body.data.Purchase_ID}`).set(auth());
  const ornamentId = items.body.data.items[0].Ornament_ID;
  const ornament = await db('tbl_ornament_master').where({ Ornament_ID: ornamentId }).first();
  expect(ornament.Metal_Type).toBe('Platinum');
});

describe('Purchase Bin / Sales Return Bin move-to-stock — Metal_Type no longer silently defaults to Gold', () => {
  test('a Purchase Bin entry with a Silver purity code infers Metal_Type=Silver on move-to-stock', async () => {
    const bin = await request(app).post('/api/bin/purchase').set(auth()).send({
      Supplier_Name: 'Metal Bin Test Supplier', Purchase_Date: '2026-08-17',
      Gross_Weight: 20, Purchase_Amount: 5000, Purity: 'SIL925',
    });
    expect(bin.status).toBe(201);

    const moved = await request(app).post(`/api/bin/purchase/${bin.body.data.Bin_ID}/move-to-stock`).set(auth()).send({});
    expect(moved.status).toBe(200);
    const ornament = await db('tbl_ornament_master').where({ Ornament_ID: moved.body.data.ornament.Ornament_ID }).first();
    expect(ornament.Metal_Type).toBe('Silver');
  });

  test('an explicit Metal_Type in the move-to-stock request overrides the inferred one', async () => {
    const bin = await request(app).post('/api/bin/purchase').set(auth()).send({
      Supplier_Name: 'Metal Bin Test Supplier 2', Purchase_Date: '2026-08-17',
      Gross_Weight: 5, Purchase_Amount: 40000, Purity: 'PT950', // free-text, no PLAT prefix — would infer Gold without an override
    });
    const moved = await request(app).post(`/api/bin/purchase/${bin.body.data.Bin_ID}/move-to-stock`).set(auth()).send({ Metal_Type: 'Platinum' });
    expect(moved.status).toBe(200);
    const ornament = await db('tbl_ornament_master').where({ Ornament_ID: moved.body.data.ornament.Ornament_ID }).first();
    expect(ornament.Metal_Type).toBe('Platinum');
  });

  test('a Sales Return Bin entry with a Silver purity code infers Metal_Type=Silver on move-to-stock', async () => {
    const ret = await request(app).post('/api/bin/sales-return').set(auth()).send({
      Customer_Name: 'Metal Bin Return Test', Return_Date: '2026-08-17',
      Gross_Weight: 12, Purity: 'Silver 925',
    });
    expect(ret.status).toBe(201);
    const moved = await request(app).post(`/api/bin/sales-return/${ret.body.data.Return_ID}/move-to-stock`).set(auth()).send({});
    expect(moved.status).toBe(200);
    const ornament = await db('tbl_ornament_master').where({ Ornament_ID: moved.body.data.ornament.Ornament_ID }).first();
    expect(ornament.Metal_Type).toBe('Silver');
  });
});

test('an ornament pushed up through device sync (POST /api/sync/upload) keeps its Metal_Type instead of defaulting to Gold', async () => {
  const res = await request(app).post('/api/sync/upload').set(auth()).send({
    deviceId: 'test-device-1',
    records: [{
      tableName: 'tbl_ornament_master', operation: 'INSERT', syncUuid: uuidv4(),
      payload: {
        Article_Number: `SYNCTEST-${Date.now()}`, Type_ID: typeId, Metal_Type: 'Silver',
        Gross_Weight: 8, Net_Gold_Weight: 8, Current_Gold_Rate: 80, Base_Making_Charge_Per_Gram: 20, Purchase_Cost: 700,
      },
    }],
  });
  expect(res.status).toBe(200);
  expect(res.body.data.results[0].status).toBe('SUCCESS');

  const row = await db('tbl_ornament_master').whereRaw(`"Article_Number" like 'SYNCTEST-%'`).where('Tenant_ID', tenant.tenantId).orderBy('Ornament_ID', 'desc').first();
  expect(row.Metal_Type).toBe('Silver');
});
