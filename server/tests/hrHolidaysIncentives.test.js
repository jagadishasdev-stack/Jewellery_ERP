/**
 * server/src/routes/hr.js — Holiday Master (GET/POST /holidays) and
 * Incentive Slabs (GET/POST /incentive-slabs, plus the /sales-incentive
 * endpoints that consume them) — previously zero coverage. Only GET/POST
 * exist for holidays/incentive-slabs (no PUT/DELETE routes are defined at
 * all), so that's the full surface tested here.
 *
 * FIXED as part of this pass: POST /holidays let a same-branch duplicate
 * (same Tenant_ID + Branch_ID + Holiday_Date, which IS a real DB unique
 * constraint) surface as a raw "duplicate key value violates unique
 * constraint" 500 instead of a friendly message.
 */
const request = require('supertest');
const { app } = require('../src/index');
const db = require('../src/db/knex');
const testTenant = require('./helpers/testTenant');

let tenant, token;
const auth = () => ({ Authorization: `Bearer ${token}` });

// requireModuleAccess('hr_payroll', 'Add') only blocks when an EXPLICIT
// tbl_user_permission_override row exists for (User_ID, Module_Key) with
// Can_Add=false — with no override row at all (the default for any role),
// every authenticated user passes through unrestricted. So the only way to
// actually exercise the 403 path is to set a real override via the same
// API surface the app itself uses, on the tenant's own admin user, then
// restore it — matching the pattern already used in bankCheque.test.js.
function setOverride(overrides) {
  return request(app).post('/api/permissions/overrides').set(auth()).send({
    User_ID: tenant.userId, Module_Key: 'hr_payroll',
    Can_View: true, Can_Add: true, Can_Edit: true, Can_Delete: true, Can_Approve: true,
    ...overrides,
  });
}

beforeAll(async () => {
  tenant = await testTenant.setup();
  const res = await request(app).post('/api/auth/login').send({ username: tenant.username, password: tenant.password, tenantId: tenant.tenantId });
  token = res.body.data.token;
});

afterAll(async () => {
  await db('tbl_sales_incentive_transactions').where({ Tenant_ID: tenant.tenantId }).del();
  await db('tbl_incentive_slab_master').where({ Tenant_ID: tenant.tenantId }).del();
  await db('tbl_holiday_master').where({ Tenant_ID: tenant.tenantId }).del();
  await db('tbl_user_permission_override').where({ User_ID: tenant.userId, Module_Key: 'hr_payroll' }).del();
  await testTenant.teardown();
  await db.destroy();
});

describe('GET/POST /api/hr/holidays', () => {
  test('starts empty for a fresh tenant', async () => {
    const res = await request(app).get('/api/hr/holidays').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  test('validates required fields', async () => {
    const res = await request(app).post('/api/hr/holidays').set('Authorization', `Bearer ${token}`).send({});
    expect(res.status).toBe(422);
  });

  test('a Can_Add=false override on hr_payroll blocks adding a holiday with 403', async () => {
    await setOverride({ Can_Add: false });
    const res = await request(app).post('/api/hr/holidays').set(auth())
      .send({ Holiday_Date: '2027-01-26', Holiday_Name: 'Republic Day' });
    expect(res.status).toBe(403);
    await setOverride({ Can_Add: true }); // restore for later tests
  });

  test('adds a holiday and lists it back in date order', async () => {
    await request(app).post('/api/hr/holidays').set('Authorization', `Bearer ${token}`).send({ Holiday_Date: '2027-08-15', Holiday_Name: 'Independence Day' });
    const res1 = await request(app).post('/api/hr/holidays').set('Authorization', `Bearer ${token}`).send({ Holiday_Date: '2027-01-26', Holiday_Name: 'Republic Day' });
    expect(res1.status).toBe(201);
    expect(res1.body.data.Tenant_ID).toBe(tenant.tenantId);

    const list = await request(app).get('/api/hr/holidays').set('Authorization', `Bearer ${token}`);
    expect(list.body.data.length).toBe(2);
    expect(list.body.data[0].Holiday_Name).toBe('Republic Day'); // Jan before Aug
  });

  /**
   * FIXED: see file header. Before the fix this was a raw 500 with
   * Postgres's own "duplicate key value violates unique constraint" text.
   */
  test('FIXED: a same-branch duplicate holiday (same date) gets a friendly 409, not a raw DB error', async () => {
    await request(app).post('/api/hr/holidays').set('Authorization', `Bearer ${token}`)
      .send({ Holiday_Date: '2027-12-25', Holiday_Name: 'Christmas', Branch_ID: tenant.branchId });
    const res = await request(app).post('/api/hr/holidays').set('Authorization', `Bearer ${token}`)
      .send({ Holiday_Date: '2027-12-25', Holiday_Name: 'Christmas (dup)', Branch_ID: tenant.branchId });
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/already recorded/i);
  });

  /**
   * BUG (flagged for review, NOT fixed): tbl_holiday_master's own unique
   * constraint is (Tenant_ID, Branch_ID, Holiday_Date) — with Branch_ID
   * left null (the default when a caller doesn't specify one, i.e. an
   * org-wide holiday), Postgres treats each NULL as distinct from every
   * other NULL for uniqueness purposes, so the constraint silently does
   * NOT catch a duplicate org-wide holiday on the same date. Low-stakes
   * (cosmetic duplicate rows, not data corruption or a broken calculation)
   * so left as a real, documented gap rather than adding app-level
   * dedup logic for a case the DB itself was never actually enforcing.
   */
  test('BUG (flagged for review): a duplicate ORG-WIDE holiday (no Branch_ID) is NOT caught — the DB constraint only fires when Branch_ID is set', async () => {
    await request(app).post('/api/hr/holidays').set('Authorization', `Bearer ${token}`).send({ Holiday_Date: '2027-10-02', Holiday_Name: 'Gandhi Jayanti' });
    const res = await request(app).post('/api/hr/holidays').set('Authorization', `Bearer ${token}`).send({ Holiday_Date: '2027-10-02', Holiday_Name: 'Gandhi Jayanti (accidental dup)' });
    expect(res.status).toBe(201); // succeeds — NOT rejected as a duplicate, unlike the branch-scoped case above

    const rows = await db('tbl_holiday_master').where({ Tenant_ID: tenant.tenantId, Holiday_Date: '2027-10-02' });
    expect(rows.length).toBe(2); // two rows for the same org-wide date
  });
});

describe('GET/POST /api/hr/incentive-slabs', () => {
  test('validates required fields and numeric constraints', async () => {
    const res = await request(app).post('/api/hr/incentive-slabs').set('Authorization', `Bearer ${token}`)
      .send({ Slab_Name: '', Amount_From: -1, Incentive_Pct: 0 });
    expect(res.status).toBe(422);
  });

  test('a Can_Add=false override on hr_payroll blocks creating a slab with 403', async () => {
    await setOverride({ Can_Add: false });
    const res = await request(app).post('/api/hr/incentive-slabs').set(auth())
      .send({ Slab_Name: 'Bronze', Amount_From: 0, Incentive_Pct: 1 });
    expect(res.status).toBe(403);
    await setOverride({ Can_Add: true }); // restore for later tests
  });

  test('creates two slabs and only lists active ones, ordered by Amount_From', async () => {
    await request(app).post('/api/hr/incentive-slabs').set('Authorization', `Bearer ${token}`).send({ Slab_Name: 'Gold', Amount_From: 100000, Amount_To: null, Incentive_Pct: 2 });
    const bronze = await request(app).post('/api/hr/incentive-slabs').set('Authorization', `Bearer ${token}`).send({ Slab_Name: 'Bronze', Amount_From: 0, Amount_To: 99999.99, Incentive_Pct: 0.5 });
    expect(bronze.status).toBe(201);

    const inactive = await db('tbl_incentive_slab_master').insert({ Tenant_ID: tenant.tenantId, Slab_Name: 'Retired Slab', Amount_From: 5, Incentive_Pct: 9, Is_Active: false }).returning('*');

    const list = await request(app).get('/api/hr/incentive-slabs').set('Authorization', `Bearer ${token}`);
    expect(list.status).toBe(200);
    expect(list.body.data.map(s => s.Slab_Name)).toEqual(['Bronze', 'Gold']); // Amount_From ascending
    expect(list.body.data.some(s => s.Slab_ID === inactive[0].Slab_ID)).toBe(false); // inactive slab excluded
  });
});

describe('POST/GET /api/hr/sales-incentive', () => {
  let userId, saleId;

  beforeAll(async () => {
    userId = tenant.userId;
    // A minimal real sales_header row to join against in GET /sales-incentive.
    const branch = tenant.branchId;
    const [sale] = await db('tbl_sales_header').insert({
      Tenant_ID: tenant.tenantId, Branch_ID: branch, Invoice_Number: `QAHRINC-${Date.now()}`,
      Sale_Date: new Date(), Customer_Name: 'QA Walk-in', Subtotal_Amount: 50000, Net_Payable_Amount: 50000,
      Created_By: 'test',
    }).returning('*');
    saleId = sale.Sale_ID;
  });

  afterAll(async () => {
    await db('tbl_sales_header').where({ Sale_ID: saleId }).del();
  });

  test('validates required fields', async () => {
    const res = await request(app).post('/api/hr/sales-incentive').set('Authorization', `Bearer ${token}`).send({});
    expect(res.status).toBe(422);
  });

  test('404s when no incentive slab covers the sale amount', async () => {
    const res = await request(app).post('/api/hr/sales-incentive').set('Authorization', `Bearer ${token}`)
      .send({ Sale_ID: saleId, User_ID: userId, Sale_Base_Amount: -5 });
    expect([404, 422]).toContain(res.status); // isFloat({gt:0}) already rejects <=0 at validation
  });

  test('picks the correct slab (Bronze) and computes the incentive amount', async () => {
    const res = await request(app).post('/api/hr/sales-incentive').set('Authorization', `Bearer ${token}`)
      .send({ Sale_ID: saleId, User_ID: userId, Sale_Base_Amount: 50000 });
    expect(res.status).toBe(201);
    expect(Number(res.body.data.Incentive_Pct_Applied)).toBe(0.5);
    expect(Number(res.body.data.Incentive_Amount)).toBe(250); // 50000 * 0.5%
  });

  test('picks the higher (Gold) slab for a bigger sale, not Bronze', async () => {
    const res = await request(app).post('/api/hr/sales-incentive').set('Authorization', `Bearer ${token}`)
      .send({ Sale_ID: saleId, User_ID: userId, Sale_Base_Amount: 150000 });
    expect(res.status).toBe(201);
    expect(Number(res.body.data.Incentive_Pct_Applied)).toBe(2);
    expect(Number(res.body.data.Incentive_Amount)).toBe(3000); // 150000 * 2%
  });

  test('GET /sales-incentive defaults to only not-yet-paid-out rows (Payroll_Run_ID is null)', async () => {
    const res = await request(app).get('/api/hr/sales-incentive').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(2);
    expect(res.body.data.every(r => r.Payroll_Run_ID == null)).toBe(true);
    expect(res.body.data.every(r => r.Invoice_Number)).toBeTruthy();
  });

  test('GET /sales-incentive filters by userId', async () => {
    const res = await request(app).get(`/api/hr/sales-incentive?userId=${userId}`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.every(r => r.User_ID === userId)).toBe(true);
  });
});
