/**
 * server/src/routes/display.js — Customer Display settings + current cart
 * state for the customer-facing screen. 3 endpoints, previously zero
 * coverage.
 */
const request = require('supertest');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { app } = require('../src/index');
const db = require('../src/db/knex');
const testTenant = require('./helpers/testTenant');

let tenant, token, staffUserId, staffToken;
const auth = () => ({ Authorization: `Bearer ${token}` });

beforeAll(async () => {
  tenant = await testTenant.setup();
  const res = await request(app).post('/api/auth/login').send({ username: tenant.username, password: tenant.password, tenantId: tenant.tenantId });
  token = res.body.data.token;

  // A non-admin role user, to prove Show_Cost_Price is hidden from them on
  // GET regardless of what's actually stored.
  const nonAdminRole = await db('tbl_role_master').whereNot({ Role_Name: 'Client Admin' }).whereNot({ Role_Name: 'Super Admin' }).first();
  const salt = bcrypt.genSaltSync(10);
  const [staff] = await db('tbl_user_master').insert({
    Tenant_ID: tenant.tenantId, Username: 'qatest_display_staff', Password_Hash: bcrypt.hashSync('QaTestDisp@1', salt), Password_Salt: salt,
    Role_ID: nonAdminRole.Role_ID, Full_Name: 'QA Display Staff', Is_Active: true, Is_Admin: false,
  }).returning('*');
  staffUserId = staff.User_ID;
  const staffRes = await request(app).post('/api/auth/login').send({ username: 'qatest_display_staff', password: 'QaTestDisp@1', tenantId: tenant.tenantId });
  staffToken = staffRes.body.data.token;
});

afterAll(async () => {
  await db('tbl_customer_display_settings').where({ Tenant_ID: tenant.tenantId }).del();
  await db('tbl_session_master').where({ Tenant_ID: tenant.tenantId }).del();
  await db('tbl_user_master').where({ User_ID: staffUserId }).del();
  await testTenant.teardown();
  await db.destroy();
});

describe('GET /api/display/settings', () => {
  test('requires auth', async () => {
    const res = await request(app).get('/api/display/settings');
    expect(res.status).toBe(401);
  });

  test('returns sensible defaults for a fresh tenant with no saved settings, and Show_Cost_Price defaults false', async () => {
    const res = await request(app).get('/api/display/settings').set(auth());
    expect(res.status).toBe(200);
    expect(res.body.data.Tenant_ID).toBe(tenant.tenantId);
    expect(res.body.data.Show_Cost_Price).toBe(false);
    expect(res.body.data.Background_Color).toBe('#1A1A1A');
    expect(res.body.data.Header_Message).toBe('Welcome to Our Jewellery Store');
  });

  test('Show_Cost_Price is force-hidden for a non-admin role even when the saved row has it true', async () => {
    await request(app).put('/api/display/settings').set(auth()).send({ Header_Message: 'QA Store' });
    // Flip it true directly in the DB — bypassing the PUT route's own
    // force-false (see below) — to prove GET's own separate role-based
    // masking is what's actually doing the hiding here, not just "it was
    // never true in the first place".
    await db('tbl_customer_display_settings').where({ Tenant_ID: tenant.tenantId }).update({ Show_Cost_Price: true });

    const asAdmin = await request(app).get('/api/display/settings').set(auth());
    expect(asAdmin.body.data.Show_Cost_Price).toBe(true); // Client Admin sees the real value

    const asStaff = await request(app).get('/api/display/settings').set({ Authorization: `Bearer ${staffToken}` });
    expect(asStaff.body.data.Show_Cost_Price).toBe(false); // non-admin never sees it, regardless of the stored value
  });
});

describe('PUT /api/display/settings', () => {
  test('requires auth', async () => {
    const res = await request(app).put('/api/display/settings').send({ Header_Message: 'x' });
    expect(res.status).toBe(401);
  });

  test('creates a settings row on first save (tenant had none before this describe block\'s own beforeEach... actually shares state with GET tests above)', async () => {
    // By this point in the file a row already exists (created by the GET
    // describe block above) — this test instead confirms an UPDATE path,
    // and that unrelated fields survive a partial update.
    const res = await request(app).put('/api/display/settings').set(auth()).send({ Footer_Message: 'QA Footer', Accent_Color: '#00FF00' });
    expect(res.status).toBe(200);
    expect(res.body.data.Footer_Message).toBe('QA Footer');
    expect(res.body.data.Accent_Color).toBe('#00FF00');
    expect(res.body.data.Header_Message).toBe('QA Store'); // untouched by this partial update

    const rows = await db('tbl_customer_display_settings').where({ Tenant_ID: tenant.tenantId });
    expect(rows.length).toBe(1); // still exactly one row per tenant, not a duplicate
  });

  test('always forces Show_Cost_Price to false regardless of what the caller sends, even as Client Admin', async () => {
    const res = await request(app).put('/api/display/settings').set(auth()).send({ Show_Cost_Price: true });
    expect(res.status).toBe(200);
    expect(res.body.data.Show_Cost_Price).toBe(false);

    const row = await db('tbl_customer_display_settings').where({ Tenant_ID: tenant.tenantId }).first();
    expect(row.Show_Cost_Price).toBe(false);
  });
});

describe('GET /api/display/current-state', () => {
  test('requires auth', async () => {
    const res = await request(app).get('/api/display/current-state');
    expect(res.status).toBe(401);
  });

  test('reports no active cart when the user has no active session at all', async () => {
    const res = await request(app).get('/api/display/current-state').set({ Authorization: `Bearer ${staffToken}` });
    expect(res.status).toBe(200);
    expect(res.body.data.hasActiveCart).toBe(false);
    expect(res.body.data.items).toEqual([]);
  });

  test('reports no active cart when the user\'s active session has no Current_Active_Cart_ID set', async () => {
    await db('tbl_session_master').insert({
      Session_ID: uuidv4(), Tenant_ID: tenant.tenantId, User_ID: tenant.userId, Is_Active: true,
    });
    const res = await request(app).get('/api/display/current-state').set(auth());
    expect(res.status).toBe(200);
    expect(res.body.data.hasActiveCart).toBe(false);
  });

  test('reports an active cart, picking the most recently started active session', async () => {
    await db('tbl_session_master').where({ Tenant_ID: tenant.tenantId, User_ID: tenant.userId }).del();
    await db('tbl_session_master').insert({
      Session_ID: uuidv4(), Tenant_ID: tenant.tenantId, User_ID: tenant.userId, Is_Active: true,
      Current_Active_Cart_ID: 12345, Session_Start: new Date(Date.now() - 60000),
    });
    const newestSessionId = uuidv4();
    await db('tbl_session_master').insert({
      Session_ID: newestSessionId, Tenant_ID: tenant.tenantId, User_ID: tenant.userId, Is_Active: true,
      Current_Active_Cart_ID: 67890, Session_Start: new Date(),
    });

    const res = await request(app).get('/api/display/current-state').set(auth());
    expect(res.status).toBe(200);
    expect(res.body.data.hasActiveCart).toBe(true);
    expect(res.body.data.sessionId).toBe(newestSessionId); // the newer of the two active sessions
  });
});
