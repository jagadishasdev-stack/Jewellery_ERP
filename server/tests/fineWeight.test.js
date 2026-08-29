/**
 * Fine weight (pure-gold-equivalent weight = Net_Gold_Weight × Purity%) —
 * previously not tracked anywhere in the schema at all (Missing Feature
 * Report item B08, Transaction Menu spec). Deliberately computed on read
 * rather than stored, so it can never drift from Net_Gold_Weight/Purity_ID.
 */
const request = require('supertest');
const { app } = require('../src/index');
const db = require('../src/db/knex');
const testTenant = require('./helpers/testTenant');

let tenant, token, typeId, purity22kId;
const auth = () => ({ Authorization: `Bearer ${token}` });

beforeAll(async () => {
  tenant = await testTenant.setup();
  const res = await request(app).post('/api/auth/login').send({ username: tenant.username, password: tenant.password, tenantId: tenant.tenantId });
  token = res.body.data.token;
  typeId = (await db('tbl_item_type_master').first()).Type_ID;
  purity22kId = (await db('tbl_purity_master').where({ Purity_Code: '22K' }).first())?.Purity_ID
    || (await db('tbl_purity_master').first()).Purity_ID;
});

afterAll(async () => {
  await db('tbl_ornament_master').where({ Tenant_ID: tenant.tenantId }).del();
  await testTenant.teardown();
  await db.destroy();
});

describe('Fine weight', () => {
  test('GET /api/ornaments/:id returns Fine_Weight = Net_Gold_Weight * Purity% / 100', async () => {
    const purity = await db('tbl_purity_master').where({ Purity_ID: purity22kId }).first();
    const created = await request(app).post('/api/ornaments').set(auth()).send({
      Type_ID: typeId, Purity_ID: purity22kId, Metal_Type: 'Gold', Gross_Weight: 12, Net_Gold_Weight: 10,
      Current_Gold_Rate: 6000, Base_Making_Charge_Per_Gram: 100, Purchase_Cost: 60000, Total_Price: 70000,
      Article_Number: 'QAFINE-0001',
    });
    expect(created.status).toBe(201);

    const res = await request(app).get(`/api/ornaments/${created.body.data.Ornament_ID}`).set(auth());
    expect(res.status).toBe(200);
    const expected = Math.round(10 * (parseFloat(purity.Percentage) / 100) * 1000) / 1000;
    expect(parseFloat(res.body.data.Fine_Weight)).toBeCloseTo(expected, 2);
  });

  test('GET /api/reports/inventory-value sums fine weight per metal', async () => {
    await request(app).post('/api/ornaments').set(auth()).send({
      Type_ID: typeId, Purity_ID: purity22kId, Metal_Type: 'Gold', Gross_Weight: 5, Net_Gold_Weight: 4,
      Current_Gold_Rate: 6000, Base_Making_Charge_Per_Gram: 100, Purchase_Cost: 24000, Total_Price: 28000,
      Article_Number: 'QAFINE-0002',
    });
    const res = await request(app).get('/api/reports/inventory-value').set(auth()).query({ metalType: 'Gold' });
    expect(res.status).toBe(200);
    expect(res.body.data.overall.total_fine_weight).not.toBeNull();
    expect(parseFloat(res.body.data.overall.total_fine_weight)).toBeGreaterThan(0);
    const goldRow = res.body.data.byMetal.find(r => r.Metal_Type === 'Gold');
    expect(goldRow).toBeDefined();
    expect(parseFloat(goldRow.total_fine_weight)).toBeGreaterThan(0);
  });
});
