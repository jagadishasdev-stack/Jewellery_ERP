/**
 * Five small reference masters (Master menu audit, Transaction Menu spec)
 * that had no CRUD anywhere before: Repair Category, Size/Length, Item
 * Weight Range, Cost Centre, Purchase Rate Type — plus Design-wise
 * Reorder Level, a per-tenant override on the global (no Tenant_ID)
 * tbl_design_master table.
 */
const request = require('supertest');
const { app } = require('../src/index');
const db = require('../src/db/knex');
const testTenant = require('./helpers/testTenant');

let tenant, token;
const auth = () => ({ Authorization: `Bearer ${token}` });

beforeAll(async () => {
  tenant = await testTenant.setup();
  const res = await request(app).post('/api/auth/login').send({ username: tenant.username, password: tenant.password, tenantId: tenant.tenantId });
  token = res.body.data.token;
});

afterAll(async () => {
  await db('tbl_design_reorder_level').where({ Tenant_ID: tenant.tenantId }).del();
  await db('tbl_repair_category_master').where({ Tenant_ID: tenant.tenantId }).del();
  await db('tbl_size_master').where({ Tenant_ID: tenant.tenantId }).del();
  await db('tbl_item_weight_range_master').where({ Tenant_ID: tenant.tenantId }).del();
  await db('tbl_cost_centre_master').where({ Tenant_ID: tenant.tenantId }).del();
  await db('tbl_purchase_rate_type_master').where({ Tenant_ID: tenant.tenantId }).del();
  await testTenant.teardown();
  await db.destroy();
});

test('Repair Category: create, list scoped to tenant, and duplicate name rejected', async () => {
  const create = await request(app).post('/api/simple-masters/repair-category').set(auth()).send({ Category_Name: 'QA Stone Setting', Default_Charge: 150 });
  expect(create.status).toBe(201);
  expect(create.body.data.Tenant_ID).toBe(tenant.tenantId);

  const list = await request(app).get('/api/simple-masters/repair-category').set(auth());
  expect(list.body.data.some((r) => r.Category_Name === 'QA Stone Setting')).toBe(true);

  const dup = await request(app).post('/api/simple-masters/repair-category').set(auth()).send({ Category_Name: 'QA Stone Setting' });
  expect(dup.status).toBe(409);
});

test('Repair Category: update via PUT changes the row without letting Tenant_ID/ID be overwritten', async () => {
  const create = await request(app).post('/api/simple-masters/repair-category').set(auth()).send({ Category_Name: 'QA Polishing' });
  const updated = await request(app).put(`/api/simple-masters/repair-category/${create.body.data.Category_ID}`).set(auth()).send({ Category_Name: 'QA Polishing', Default_Charge: 75, Tenant_ID: 'HACKED', Category_ID: 99999 });
  expect(updated.status).toBe(200);
  expect(updated.body.data.Category_ID).toBe(create.body.data.Category_ID);
  expect(updated.body.data.Tenant_ID).toBe(tenant.tenantId);
  expect(Number(updated.body.data.Default_Charge)).toBe(75);
});

test('Size Master: composite uniqueness allows same code across different size types', async () => {
  const ring = await request(app).post('/api/simple-masters/size').set(auth()).send({ Size_Type: 'Ring', Size_Code: '16', Size_Value_MM: 16.5 });
  expect(ring.status).toBe(201);
  const chain = await request(app).post('/api/simple-masters/size').set(auth()).send({ Size_Type: 'Chain', Size_Code: '16' });
  expect(chain.status).toBe(201); // same code, different type — no uniqueCol enforced, DB unique(Tenant_ID,Type,Code) allows this
});

test('Item Weight Range, Cost Centre, Purchase Rate Type: basic create + list round-trip', async () => {
  const range = await request(app).post('/api/simple-masters/item-weight-range').set(auth()).send({ Range_Name: 'QA 0-5g', Weight_From: 0, Weight_To: 5 });
  expect(range.status).toBe(201);
  const centre = await request(app).post('/api/simple-masters/cost-centre').set(auth()).send({ Centre_Code: 'QA-CC1', Centre_Name: 'QA Workshop' });
  expect(centre.status).toBe(201);
  const rateType = await request(app).post('/api/simple-masters/purchase-rate-type').set(auth()).send({ Type_Name: 'QA Market Rate' });
  expect(rateType.status).toBe(201);

  const [ranges, centres, rateTypes] = await Promise.all([
    request(app).get('/api/simple-masters/item-weight-range').set(auth()),
    request(app).get('/api/simple-masters/cost-centre').set(auth()),
    request(app).get('/api/simple-masters/purchase-rate-type').set(auth()),
  ]);
  expect(ranges.body.data.some((r) => r.Range_Name === 'QA 0-5g')).toBe(true);
  expect(centres.body.data.some((r) => r.Centre_Code === 'QA-CC1')).toBe(true);
  expect(rateTypes.body.data.some((r) => r.Type_Name === 'QA Market Rate')).toBe(true);
});

test('Design Reorder Level: designs default to 5 with no override row, and an update upserts a tenant-scoped row without touching the global design', async () => {
  const design = await db('tbl_design_master').first();

  const before = await request(app).get('/api/simple-masters/design-reorder-level').set(auth());
  const beforeRow = before.body.data.find((r) => r.Design_ID === design.Design_ID);
  expect(beforeRow).toBeDefined();
  expect(Number(beforeRow.Reorder_Level)).toBe(5); // no override yet — COALESCE default

  const update = await request(app).put(`/api/simple-masters/design-reorder-level/${design.Design_ID}`).set(auth()).send({ Reorder_Level: 12 });
  expect(update.status).toBe(200);
  expect(update.body.data.Reorder_Level).toBe(12);

  const after = await request(app).get('/api/simple-masters/design-reorder-level').set(auth());
  const afterRow = after.body.data.find((r) => r.Design_ID === design.Design_ID);
  expect(Number(afterRow.Reorder_Level)).toBe(12);

  // global table itself must be untouched — the override lives only in tbl_design_reorder_level
  const globalDesign = await db('tbl_design_master').where('Design_ID', design.Design_ID).first();
  expect(globalDesign.Reorder_Level).toBeUndefined();

  // calling again upserts (merge) rather than erroring on the unique(Tenant_ID, Design_ID)
  const secondUpdate = await request(app).put(`/api/simple-masters/design-reorder-level/${design.Design_ID}`).set(auth()).send({ Reorder_Level: 20 });
  expect(secondUpdate.status).toBe(200);
  expect(secondUpdate.body.data.Reorder_Level).toBe(20);
});

test('Design Reorder Level: rejects an unknown Design_ID and a negative Reorder_Level', async () => {
  const badDesign = await request(app).put('/api/simple-masters/design-reorder-level/9999999').set(auth()).send({ Reorder_Level: 10 });
  expect(badDesign.status).toBe(404);

  const design = await db('tbl_design_master').first();
  const badValue = await request(app).put(`/api/simple-masters/design-reorder-level/${design.Design_ID}`).set(auth()).send({ Reorder_Level: -5 });
  expect(badValue.status).toBe(422);
});
