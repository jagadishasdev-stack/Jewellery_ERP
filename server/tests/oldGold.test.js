/**
 * server/src/routes/oldGold.js — Old Gold Exchange voucher (POST /exchange,
 * GET /exchange/:id). 2 endpoints, previously zero coverage. Server-side
 * authoritative recompute of the exchange value, independent of whatever
 * the client displayed.
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
  await db('tbl_old_gold_exchange').where({ Tenant_ID: tenant.tenantId }).del();
  await testTenant.teardown();
  await db.destroy();
});

describe('POST /api/old-gold/exchange', () => {
  test('requires auth', async () => {
    const res = await request(app).post('/api/old-gold/exchange').send({ Old_Gold_Weight: 10, Purity_Percentage: 75, Gold_Rate_At_Exchange: 6000 });
    expect(res.status).toBe(401);
  });

  test('validates required numeric fields and their ranges', async () => {
    const res = await request(app).post('/api/old-gold/exchange').set(auth())
      .send({ Old_Gold_Weight: 0, Purity_Percentage: 150, Gold_Rate_At_Exchange: -1 });
    expect(res.status).toBe(422);
  });

  test('computes the exchange value server-side (pure gold weight → melting deduction → net weight → value), using the default 2% melting deduction when none given', async () => {
    const res = await request(app).post('/api/old-gold/exchange').set(auth())
      .send({ Old_Gold_Weight: 10, Purity_Percentage: 75, Gold_Rate_At_Exchange: 6000 });
    expect(res.status).toBe(201);

    // pureGoldWeight = 10 * 0.75 = 7.5
    // meltingDeductWeight = 7.5 * 0.02 = 0.15
    // netExchangeWeight = 7.5 - 0.15 = 7.35
    // totalValue = 7.35 * 6000 = 44100
    expect(Number(res.body.data.Melting_Deduction_Weight)).toBeCloseTo(0.15, 3);
    expect(Number(res.body.data.Net_Exchange_Weight)).toBeCloseTo(7.35, 3);
    expect(Number(res.body.data.Total_Value)).toBeCloseTo(44100, 2);
    expect(Number(res.body.data.Used_Amount)).toBe(0);
    expect(Number(res.body.data.Balance_Amount)).toBeCloseTo(44100, 2);
    expect(res.body.data.Tenant_ID).toBe(tenant.tenantId);
    expect(res.body.data.Voucher_Number).toBeTruthy();
  });

  test('honors an explicit non-default Melting_Deduction_Percent', async () => {
    const res = await request(app).post('/api/old-gold/exchange').set(auth())
      .send({ Old_Gold_Weight: 20, Purity_Percentage: 91.6, Gold_Rate_At_Exchange: 5500, Melting_Deduction_Percent: 5 });
    expect(res.status).toBe(201);
    // pureGoldWeight = 20 * 0.916 = 18.32
    // meltingDeductWeight = 18.32 * 0.05 = 0.916
    // netExchangeWeight = 18.32 - 0.916 = 17.404
    expect(Number(res.body.data.Melting_Deduction_Weight)).toBeCloseTo(0.916, 3);
    expect(Number(res.body.data.Net_Exchange_Weight)).toBeCloseTo(17.404, 3);
  });

  test('a voucher with no Customer_ID (walk-in) is still created cleanly', async () => {
    const res = await request(app).post('/api/old-gold/exchange').set(auth())
      .send({ Old_Gold_Weight: 5, Purity_Percentage: 91.6, Gold_Rate_At_Exchange: 6200 });
    expect(res.status).toBe(201);
    expect(res.body.data.Customer_ID).toBeNull();
  });

  test('records an audit log entry for the new voucher', async () => {
    const res = await request(app).post('/api/old-gold/exchange').set(auth())
      .send({ Old_Gold_Weight: 8, Purity_Percentage: 75, Gold_Rate_At_Exchange: 6000, Certificate_No: 'QA-CERT-1' });
    const entry = await db('tbl_audit_log')
      .where({ Tenant_ID: tenant.tenantId, Table_Name: 'tbl_old_gold_exchange', Record_ID: String(res.body.data.Exchange_ID), Action_Type: 'INSERT' })
      .first();
    expect(entry).toBeTruthy();
  });
});

describe('GET /api/old-gold/exchange/:id', () => {
  let exchangeId;

  beforeAll(async () => {
    const res = await request(app).post('/api/old-gold/exchange').set(auth())
      .send({ Old_Gold_Weight: 12, Purity_Percentage: 75, Gold_Rate_At_Exchange: 6100, Tested_By: 'QA Tester' });
    exchangeId = res.body.data.Exchange_ID;
  });

  test('requires auth', async () => {
    const res = await request(app).get(`/api/old-gold/exchange/${exchangeId}`);
    expect(res.status).toBe(401);
  });

  test('404s for a nonexistent voucher', async () => {
    const res = await request(app).get('/api/old-gold/exchange/9999999').set(auth());
    expect(res.status).toBe(404);
  });

  test('fetches a real voucher by id, scoped to this tenant', async () => {
    const res = await request(app).get(`/api/old-gold/exchange/${exchangeId}`).set(auth());
    expect(res.status).toBe(200);
    expect(res.body.data.Exchange_ID).toBe(exchangeId);
    expect(res.body.data.Tested_By).toBe('QA Tester');
  });

  test('404s (not a cross-tenant leak) for a real voucher belonging to a different tenant', async () => {
    await db('tbl_tenant_master').insert({
      Tenant_ID: 'QAOLDGOLD2', Company_Name: 'QA Other OldGold Tenant', Brand_Code: 'QAG2',
      License_Key: 'QAOLDGOLD2-LIC', License_Expiry_Date: new Date(Date.now() + 365 * 24 * 3600 * 1000), Is_Active: true,
    }).returning('*');
    const [foreignVoucher] = await db('tbl_old_gold_exchange').insert({
      Tenant_ID: 'QAOLDGOLD2', Old_Gold_Weight: 1, Purity_Percentage: 75, Total_Value: 100, Created_By: 'seed',
    }).returning('*');

    const res = await request(app).get(`/api/old-gold/exchange/${foreignVoucher.Exchange_ID}`).set(auth());
    expect(res.status).toBe(404);

    await db('tbl_old_gold_exchange').where({ Tenant_ID: 'QAOLDGOLD2' }).del();
    await db('tbl_tenant_master').where({ Tenant_ID: 'QAOLDGOLD2' }).del();
  });
});
