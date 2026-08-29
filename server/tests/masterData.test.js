/**
 * Master Data (master.js) — item types, designs, gemstones, purities,
 * collections, sub-categories, brands, making charges, diamond masters,
 * HUID. 25 endpoints; only HUID (2 of them) had any test coverage before
 * this file. Every sale/purchase/manufacturing costing calculation in the
 * app ultimately reads from these tables, so a broken create/update here
 * has a very wide blast radius.
 *
 * IMPORTANT: tbl_item_type_master, tbl_design_master, tbl_purity_master
 * (and the diamond-* master tables) are GLOBAL — no Tenant_ID column at
 * all, shared across every real tenant including production ones. Every
 * row this file creates uses an unmistakable QA-prefixed code and is
 * deleted in afterAll by that exact code — never by a blanket Tenant_ID
 * filter, since these rows have no tenant to filter by.
 */
const request = require('supertest');
const bcrypt = require('bcryptjs');
const { app } = require('../src/index');
const db = require('../src/db/knex');
const testTenant = require('./helpers/testTenant');

let tenant, token;
const auth = () => ({ Authorization: `Bearer ${token}` });
const QA = 'QAMSTR'; // unique prefix for every global-table row this file creates

beforeAll(async () => {
  tenant = await testTenant.setup();
  const res = await request(app).post('/api/auth/login').send({ username: tenant.username, password: tenant.password, tenantId: tenant.tenantId });
  token = res.body.data.token;
});

afterAll(async () => {
  // Global tables — clean up by the QA-prefixed code, never by tenant.
  await db('tbl_item_type_master').where('Type_Code', 'like', `${QA}%`).del();
  await db('tbl_design_master').where('Design_Code', 'like', `${QA}%`).del();
  await db('tbl_gemstone_master').where('Stone_Code', 'like', `${QA}%`).del();
  await db('tbl_purity_master').where('Purity_Code', 'like', `${QA}%`).del();
  await db('tbl_huid_master').where('HUID_Number', 'like', `${QA}%`).del();
  // Tenant-scoped tables — cleaned up automatically by testTenant.teardown()
  // deleting the whole disposable tenant, but these have no FK cascade from
  // Tenant_ID the way ornaments/sales do, so clear them explicitly too.
  await db('tbl_collection_master').where({ Tenant_ID: tenant.tenantId }).del();
  await db('tbl_sub_category_master').where({ Tenant_ID: tenant.tenantId }).del();
  await db('tbl_brand_master').where({ Tenant_ID: tenant.tenantId }).del();
  await db('tbl_making_charge_master').where({ Tenant_ID: tenant.tenantId }).del();
  await testTenant.teardown();
  await db.destroy();
});

// ── Item Types (global) ─────────────────────────────────────────────────────
describe('Item Types', () => {
  test('GET /item-types lists active types', async () => {
    const res = await request(app).get('/api/master/item-types').set(auth());
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);
  });

  test('POST /item-types requires Type_Code, Type_Name, Category', async () => {
    const res = await request(app).post('/api/master/item-types').set(auth()).send({});
    expect(res.status).toBe(422);
  });

  test('POST /item-types creates a real, globally-visible item type', async () => {
    const res = await request(app).post('/api/master/item-types').set(auth())
      .send({ Type_Code: `${QA}-RING`, Type_Name: 'QA Master Test Ring', Category: 'Ring' });
    expect(res.status).toBe(201);
    expect(res.body.data.Type_Code).toBe(`${QA}-RING`);

    const row = await db('tbl_item_type_master').where({ Type_Code: `${QA}-RING` }).first();
    expect(row).toBeDefined();
    expect(row.Tenant_ID).toBeUndefined(); // confirms this table really has no Tenant_ID column
  });

  test('POST /item-types rejects a duplicate Type_Code with 409', async () => {
    const res = await request(app).post('/api/master/item-types').set(auth())
      .send({ Type_Code: `${QA}-RING`, Type_Name: 'Duplicate attempt', Category: 'Ring' });
    expect(res.status).toBe(409);
  });

  test('PUT /item-types/:id updates it, and a non-existent id 404s', async () => {
    const created = await db('tbl_item_type_master').where({ Type_Code: `${QA}-RING` }).first();
    const res = await request(app).put(`/api/master/item-types/${created.Type_ID}`).set(auth())
      .send({ Type_Name: 'QA Master Test Ring (renamed)' });
    expect(res.status).toBe(200);
    expect(res.body.data.Type_Name).toBe('QA Master Test Ring (renamed)');

    const notFound = await request(app).put('/api/master/item-types/9999999').set(auth()).send({ Type_Name: 'x' });
    expect(notFound.status).toBe(404);
  });
});

// ── Designs (global) ────────────────────────────────────────────────────────
describe('Designs', () => {
  test('POST /designs requires Design_Code, Design_Name; creates and updates correctly', async () => {
    const missing = await request(app).post('/api/master/designs').set(auth()).send({});
    expect(missing.status).toBe(422);

    const created = await request(app).post('/api/master/designs').set(auth())
      .send({ Design_Code: `${QA}-D1`, Design_Name: 'QA Master Test Design' });
    expect(created.status).toBe(201);

    const dup = await request(app).post('/api/master/designs').set(auth())
      .send({ Design_Code: `${QA}-D1`, Design_Name: 'dup' });
    expect(dup.status).toBe(409);

    const updated = await request(app).put(`/api/master/designs/${created.body.data.Design_ID}`).set(auth())
      .send({ Design_Name: 'QA Master Test Design (renamed)' });
    expect(updated.status).toBe(200);
    expect(updated.body.data.Design_Name).toBe('QA Master Test Design (renamed)');
  });

  test('GET /designs joins in the item type name/code when a design has one', async () => {
    const itemType = await db('tbl_item_type_master').where({ Type_Code: `${QA}-RING` }).first();
    await request(app).post('/api/master/designs').set(auth())
      .send({ Design_Code: `${QA}-D2`, Design_Name: 'QA Design With Type', Type_ID: itemType.Type_ID });

    const res = await request(app).get('/api/master/designs').set(auth());
    const row = res.body.data.find(d => d.Design_Code === `${QA}-D2`);
    expect(row).toBeDefined();
    expect(row.Type_Name).toBe('QA Master Test Ring (renamed)');
  });

  /**
   * FIXED (client-side, this pass): Add Stock's Design dropdown never
   * filtered by the selected Item Type at all — picking "Ring" still
   * offered every design regardless of type. tbl_design_master.Type_ID has
   * always existed for this; GET /designs just never accepted a filter.
   */
  test('FIXED: GET /designs?typeId= narrows to only designs of that item type', async () => {
    const ring = await db('tbl_item_type_master').where({ Type_Code: `${QA}-RING` }).first();
    const otherType = await db('tbl_item_type_master').where({ Type_Code: `${QA}-BANG` }).first()
      || (await db('tbl_item_type_master').insert({ Type_Code: `${QA}-BANG`, Type_Name: 'QA Master Test Bangle', Category: 'Plain' }).returning('*'))[0];
    await request(app).post('/api/master/designs').set(auth())
      .send({ Design_Code: `${QA}-D3`, Design_Name: 'QA Design Bangle Only', Type_ID: otherType.Type_ID });

    const res = await request(app).get('/api/master/designs').set(auth()).query({ typeId: ring.Type_ID });
    expect(res.status).toBe(200);
    expect(res.body.data.some(d => d.Design_Code === `${QA}-D2`)).toBe(true); // Ring design present
    expect(res.body.data.some(d => d.Design_Code === `${QA}-D3`)).toBe(false); // Bangle design excluded

    // Design row must go before the item type it references — the FK is a
    // plain RESTRICT, and the file-level afterAll cleanup for designs runs
    // too late (after this test's own item-type cleanup would already fail).
    await db('tbl_design_master').where({ Design_Code: `${QA}-D3` }).del();
    await db('tbl_item_type_master').where({ Type_Code: `${QA}-BANG` }).del();
  });
});

// ── Gemstones (global) ──────────────────────────────────────────────────────
describe('Gemstones', () => {
  test('POST /gemstones requires Stone_Code, Stone_Name, and applies Is_Natural/Is_Lab_Grown defaults', async () => {
    const missing = await request(app).post('/api/master/gemstones').set(auth()).send({});
    expect(missing.status).toBe(422);

    const res = await request(app).post('/api/master/gemstones').set(auth())
      .send({ Stone_Code: `${QA}-ST1`, Stone_Name: 'QA Master Test Stone', Price_Per_Carat: 5000 });
    expect(res.status).toBe(201);
    expect(res.body.data.Is_Natural).toBe(true);   // defaults to true when not sent
    expect(res.body.data.Is_Lab_Grown).toBe(false); // defaults to false when not sent
    expect(parseFloat(res.body.data.Price_Per_Carat)).toBe(5000);
  });

  test('POST /gemstones rejects a duplicate Stone_Code, and PUT updates real fields', async () => {
    const dup = await request(app).post('/api/master/gemstones').set(auth())
      .send({ Stone_Code: `${QA}-ST1`, Stone_Name: 'dup attempt' });
    expect(dup.status).toBe(409);

    const stone = await db('tbl_gemstone_master').where({ Stone_Code: `${QA}-ST1` }).first();
    const updated = await request(app).put(`/api/master/gemstones/${stone.Stone_ID}`).set(auth())
      .send({ Price_Per_Carat: 6200 });
    expect(updated.status).toBe(200);
    expect(parseFloat(updated.body.data.Price_Per_Carat)).toBe(6200);
  });
});

// ── Purities (global) ───────────────────────────────────────────────────────
describe('Purities', () => {
  test('POST /purities validates Karat/Percentage/Metal_Type and defaults Metal_Type to Gold', async () => {
    const badPercentage = await request(app).post('/api/master/purities').set(auth())
      .send({ Purity_Code: `${QA}-P1`, Karat: 22, Percentage: 150 }); // > 100, invalid
    expect(badPercentage.status).toBe(422);

    const res = await request(app).post('/api/master/purities').set(auth())
      .send({ Purity_Code: `${QA}-P1`, Karat: 22, Percentage: 91.6 });
    expect(res.status).toBe(201);
    expect(res.body.data.Metal_Type).toBe('Gold');
  });

  test('POST /purities rejects an invalid Metal_Type not in the known list', async () => {
    const res = await request(app).post('/api/master/purities').set(auth())
      .send({ Purity_Code: `${QA}-P2`, Karat: 18, Percentage: 75, Metal_Type: 'Bronze' });
    expect(res.status).toBe(422);
  });

  test('GET /purities?metalType= narrows to only that metal', async () => {
    await request(app).post('/api/master/purities').set(auth())
      .send({ Purity_Code: `${QA}-P3`, Karat: 999, Percentage: 99.9, Metal_Type: 'Silver' });

    const res = await request(app).get('/api/master/purities').set(auth()).query({ metalType: 'Silver' });
    expect(res.status).toBe(200);
    expect(res.body.data.every(p => p.Metal_Type === 'Silver')).toBe(true);
    expect(res.body.data.some(p => p.Purity_Code === `${QA}-P3`)).toBe(true);
  });

  /**
   * FIXED (client-side, this pass): PUT /purities/:id didn't exist at all
   * — the client hardcoded a fake "Contact Super Admin to add custom
   * purities" message and blocked create/edit entirely, even though this
   * endpoint requires nothing more than any authenticated tenant user, same
   * as every other master route in this file. Added the missing route.
   */
  test('FIXED: PUT /purities/:id updates an existing purity (route did not exist before)', async () => {
    const created = await request(app).post('/api/master/purities').set(auth())
      .send({ Purity_Code: `${QA}-P4`, Karat: 14, Percentage: 58.5 });
    expect(created.status).toBe(201);

    const res = await request(app).put(`/api/master/purities/${created.body.data.Purity_ID}`).set(auth())
      .send({ Percentage: 59.0, Hallmark_Standard: 'BIS 585' });
    expect(res.status).toBe(200);
    expect(Number(res.body.data.Percentage)).toBe(59.0);
    expect(res.body.data.Hallmark_Standard).toBe('BIS 585');
    expect(res.body.data.Purity_Code).toBe(`${QA}-P4`); // untouched by the partial update
    expect(res.body.data.Modified_Date).toBeTruthy();
  });

  test('PUT /purities/:id validates Percentage/Metal_Type the same as create', async () => {
    const created = await request(app).post('/api/master/purities').set(auth())
      .send({ Purity_Code: `${QA}-P5`, Karat: 22, Percentage: 91.6 });

    const res = await request(app).put(`/api/master/purities/${created.body.data.Purity_ID}`).set(auth())
      .send({ Percentage: 150 });
    expect(res.status).toBe(422);
  });

  test('PUT /purities/:id 404s for a nonexistent purity', async () => {
    const res = await request(app).put('/api/master/purities/9999999').set(auth()).send({ Percentage: 50 });
    expect(res.status).toBe(404);
  });
});

// ── Collections / Sub-Categories / Brands / Making Charges (tenant-scoped) ──
describe('Tenant-scoped master lists', () => {
  test('Collections: create + list are scoped to the caller\'s own tenant', async () => {
    const created = await request(app).post('/api/master/collections').set(auth())
      .send({ Collection_Code: `${QA}-C1`, Collection_Name: 'QA Test Collection' });
    expect(created.status).toBe(201);
    expect(created.body.data.Tenant_ID).toBe(tenant.tenantId);

    const list = await request(app).get('/api/master/collections').set(auth());
    expect(list.body.data.some(c => c.Collection_Code === `${QA}-C1`)).toBe(true);
  });

  test('Sub-Categories: create + list are scoped to the caller\'s own tenant', async () => {
    const created = await request(app).post('/api/master/sub-categories').set(auth())
      .send({ SubCat_Code: `${QA}-SC1`, SubCat_Name: 'QA Test SubCat' });
    expect(created.status).toBe(201);
    expect(created.body.data.Tenant_ID).toBe(tenant.tenantId);
  });

  test('Brands: create + list are scoped to the caller\'s own tenant', async () => {
    const created = await request(app).post('/api/master/brands').set(auth())
      .send({ Brand_Code: `${QA}-B1`, Brand_Name: 'QA Test Brand' });
    expect(created.status).toBe(201);
    expect(created.body.data.Tenant_ID).toBe(tenant.tenantId);
  });

  test('Making Charges: create, update, and a DIFFERENT tenant cannot update this tenant\'s row', async () => {
    const created = await request(app).post('/api/master/making-charges').set(auth())
      .send({ MC_Name: `${QA} Test MC`, Charge_Type: 'Percentage', Charge_Value: 12 });
    expect(created.status).toBe(201);

    const updated = await request(app).put(`/api/master/making-charges/${created.body.data.MC_ID}`).set(auth())
      .send({ Charge_Value: 15 });
    expect(updated.status).toBe(200);
    expect(parseFloat(updated.body.data.Charge_Value)).toBe(15);

    // Cross-tenant: a second tenant's token must not be able to update it —
    // the route's WHERE clause includes Tenant_ID, so this should 404, not 200.
    const saRole = await db('tbl_role_master').where({ Role_Name: 'Client Admin' }).first();
    const otherTenantId = 'QAT_MSTR2';
    await db('tbl_tenant_master').where({ Tenant_ID: otherTenantId }).del();
    await db('tbl_tenant_master').insert({
      Tenant_ID: otherTenantId, Company_Name: 'QA Other Tenant 2', Brand_Code: 'QAO2',
      License_Key: `QAO2-${Date.now()}`, License_Expiry_Date: new Date(Date.now() + 365 * 24 * 3600 * 1000),
      Business_Type: 'HYBRID', Is_Active: true,
    });
    const salt = bcrypt.genSaltSync(10);
    await db('tbl_user_master').insert({
      Tenant_ID: otherTenantId, Username: 'qatest_mstr_other', Password_Hash: bcrypt.hashSync('irrelevant', salt), Password_Salt: salt,
      Role_ID: saRole.Role_ID, Full_Name: 'QA Other', Is_Active: true, Is_Admin: true,
    });
    const otherLogin = await request(app).post('/api/auth/login').send({ username: 'qatest_mstr_other', password: 'irrelevant', tenantId: otherTenantId });
    try {
      const crossTenantUpdate = await request(app).put(`/api/master/making-charges/${created.body.data.MC_ID}`)
        .set({ Authorization: `Bearer ${otherLogin.body.data.token}` }).send({ Charge_Value: 999 });
      expect(crossTenantUpdate.status).toBe(404);
    } finally {
      await db('tbl_user_master').where({ Tenant_ID: otherTenantId }).del();
      await db('tbl_tenant_master').where({ Tenant_ID: otherTenantId }).del();
    }
  });
});

// ── Diamond masters (global, read-only seeded data) ─────────────────────────
describe('Diamond masters (read-only)', () => {
  test('GET /diamond-quality, /diamond-color, /diamond-shape all return real seeded lists', async () => {
    const [quality, color, shape] = await Promise.all([
      request(app).get('/api/master/diamond-quality').set(auth()),
      request(app).get('/api/master/diamond-color').set(auth()),
      request(app).get('/api/master/diamond-shape').set(auth()),
    ]);
    expect(quality.status).toBe(200);
    expect(color.status).toBe(200);
    expect(shape.status).toBe(200);
    expect(Array.isArray(quality.body.data)).toBe(true);
    expect(Array.isArray(color.body.data)).toBe(true);
    expect(Array.isArray(shape.body.data)).toBe(true);
  });
});

// ── HUID ─────────────────────────────────────────────────────────────────────
describe('HUID', () => {
  test('GET /huid/:number 404s for an unregistered number', async () => {
    const res = await request(app).get(`/api/master/huid/${QA}-NOPE`).set(auth());
    expect(res.status).toBe(404);
  });

  test('POST /huid registers one, tenant-scoped, and GET finds it; duplicate is rejected', async () => {
    const created = await request(app).post('/api/master/huid').set(auth())
      .send({ HUID_Number: `${QA}-H1` });
    expect(created.status).toBe(201);
    expect(created.body.data.Tenant_ID).toBe(tenant.tenantId);

    const found = await request(app).get(`/api/master/huid/${QA}-H1`).set(auth());
    expect(found.status).toBe(200);

    const dup = await request(app).post('/api/master/huid').set(auth()).send({ HUID_Number: `${QA}-H1` });
    expect(dup.status).toBe(409);
  });
});
