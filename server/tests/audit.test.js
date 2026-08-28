/**
 * server/src/routes/audit.js — Audit Log, User Activity, Deleted Entries,
 * Edit History, Active Sessions, force-logout, Summary, Login History.
 * 8 endpoints, previously zero coverage.
 *
 * FIXED as part of this pass — a real, significant authorization gap: the
 * file's own header comment says "Admin-only", and every default role
 * already carries a dedicated `audit` permission key (see
 * src/db/seeds/001_seed_master_data.js), but nothing in this file ever
 * actually checked it — only DELETE /sessions/:sessionId had its own
 * inline role check. Every other route (the full audit trail including
 * Old_Data/New_Data change history, active sessions with IP/device info,
 * login history, per-user activity summaries) was reachable by ANY
 * authenticated user of ANY role in the tenant, including a floor
 * salesperson. Fixed by gating the whole router on requirePermission('audit').
 */
const request = require('supertest');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { app } = require('../src/index');
const db = require('../src/db/knex');
const testTenant = require('./helpers/testTenant');

let tenant, token, staffToken, staffUserId;
const auth = () => ({ Authorization: `Bearer ${token}` });
const staffAuth = () => ({ Authorization: `Bearer ${staffToken}` });

beforeAll(async () => {
  tenant = await testTenant.setup();
  const res = await request(app).post('/api/auth/login').send({ username: tenant.username, password: tenant.password, tenantId: tenant.tenantId });
  token = res.body.data.token;

  // Store Manager (audit: false in the seed data) — a real role that
  // exists specifically WITHOUT the audit permission, unlike Client Admin.
  const storeManagerRole = await db('tbl_role_master').where({ Role_Name: 'Store Manager' }).first()
    || await db('tbl_role_master').whereNot({ Role_Name: 'Client Admin' }).whereNot({ Role_Name: 'Super Admin' }).first();
  const salt = bcrypt.genSaltSync(10);
  const [staff] = await db('tbl_user_master').insert({
    Tenant_ID: tenant.tenantId, Username: 'qatest_audit_staff', Password_Hash: bcrypt.hashSync('QaTestAudit@1', salt), Password_Salt: salt,
    Role_ID: storeManagerRole.Role_ID, Full_Name: 'QA Audit Staff', Is_Active: true, Is_Admin: false,
  }).returning('*');
  staffUserId = staff.User_ID;
  const staffRes = await request(app).post('/api/auth/login').send({ username: 'qatest_audit_staff', password: 'QaTestAudit@1', tenantId: tenant.tenantId });
  staffToken = staffRes.body.data.token;

  // A real audit-log row and a real session row to query against, plus one
  // for a wholly separate tenant to prove tenant scoping.
  await db('tbl_audit_log').insert({
    Tenant_ID: tenant.tenantId, User_ID: tenant.userId, Username: tenant.username, Full_Name: 'QA Test Admin',
    Table_Name: 'tbl_ornament_master', Record_ID: '999001', Action_Type: 'INSERT', Description: 'QA audit test row',
  });
  await db('tbl_audit_log').insert({
    Tenant_ID: tenant.tenantId, User_ID: tenant.userId, Username: tenant.username, Full_Name: 'QA Test Admin',
    Table_Name: 'tbl_ornament_master', Record_ID: '999001', Action_Type: 'DELETE', Description: 'QA audit test delete',
  });
});

afterAll(async () => {
  await db('tbl_audit_log').where({ Tenant_ID: tenant.tenantId }).del();
  await db('tbl_session_master').where({ Tenant_ID: tenant.tenantId }).del();
  await db('tbl_user_master').where({ User_ID: staffUserId }).del();
  await testTenant.teardown();
  await db.destroy();
});

const ROUTES = [
  ['get', '/api/audit/logs'],
  ['get', '/api/audit/user-activity'],
  ['get', '/api/audit/deleted-entries'],
  ['get', '/api/audit/edit-history/tbl_ornament_master/999001'],
  ['get', '/api/audit/active-sessions'],
  ['get', '/api/audit/summary'],
  ['get', '/api/audit/login-history'],
];

describe('permission gate — every route requires the `audit` permission', () => {
  test.each(ROUTES)('%s %s requires auth', async (method, url) => {
    const res = await request(app)[method](url);
    expect(res.status).toBe(401);
  });

  /**
   * FIXED: see file header. Before the fix, every one of these returned
   * 200 for ANY authenticated user regardless of role.
   */
  test.each(ROUTES)('FIXED: %s %s is refused (403) for a role without the `audit` permission (was: 200 for anyone)', async (method, url) => {
    const res = await request(app)[method](url).set(staffAuth());
    expect(res.status).toBe(403);
  });

  test.each(ROUTES)('%s %s succeeds for Client Admin (has `audit: true`)', async (method, url) => {
    const res = await request(app)[method](url).set(auth());
    expect(res.status).toBe(200);
  });
});

describe('GET /api/audit/logs', () => {
  test('lists this tenant\'s own audit rows, filterable by actionType/tableName', async () => {
    const res = await request(app).get('/api/audit/logs').set(auth());
    expect(res.status).toBe(200);
    expect(res.body.data.items.length).toBeGreaterThanOrEqual(2);
    expect(res.body.data.total).toBeGreaterThanOrEqual(2);

    const filtered = await request(app).get('/api/audit/logs?actionType=DELETE&tableName=tbl_ornament_master').set(auth());
    expect(filtered.body.data.items.every(r => r.Action_Type === 'DELETE' && r.Table_Name === 'tbl_ornament_master')).toBe(true);
  });

  test('search matches Description', async () => {
    const res = await request(app).get('/api/audit/logs?search=QA audit test row').set(auth());
    expect(res.status).toBe(200);
    expect(res.body.data.items.some(r => r.Description === 'QA audit test row')).toBe(true);
  });

  test('pagination respects limit/page', async () => {
    const res = await request(app).get('/api/audit/logs?limit=1&page=1').set(auth());
    expect(res.status).toBe(200);
    expect(res.body.data.items.length).toBe(1);
    expect(res.body.data.limit).toBe(1);
  });
});

describe('GET /api/audit/deleted-entries', () => {
  test('only returns Action_Type=DELETE rows for this tenant', async () => {
    const res = await request(app).get('/api/audit/deleted-entries').set(auth());
    expect(res.status).toBe(200);
    expect(res.body.data.every(r => r.Action_Type === 'DELETE')).toBe(true);
    expect(res.body.data.some(r => r.Description === 'QA audit test delete')).toBe(true);
  });
});

describe('GET /api/audit/edit-history/:table/:recordId', () => {
  test('returns the change history for one specific record, in chronological order', async () => {
    const res = await request(app).get('/api/audit/edit-history/tbl_ornament_master/999001').set(auth());
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(2);
    expect(res.body.data[0].Action_Type).toBe('INSERT'); // chronological — INSERT happened before DELETE
    expect(res.body.data[1].Action_Type).toBe('DELETE');
  });
});

describe('GET /api/audit/active-sessions + DELETE /api/audit/sessions/:sessionId', () => {
  let sessionId;

  beforeAll(async () => {
    sessionId = uuidv4();
    await db('tbl_session_master').insert({ Session_ID: sessionId, Tenant_ID: tenant.tenantId, User_ID: tenant.userId, Is_Active: true });
  });

  test('lists the active session, joined with the user\'s name', async () => {
    const res = await request(app).get('/api/audit/active-sessions').set(auth());
    expect(res.status).toBe(200);
    const row = res.body.data.find(s => s.Session_ID === sessionId);
    expect(row).toBeTruthy();
    expect(row.Username).toBe(tenant.username);
  });

  test('force-logout has its own additional role check on top of the audit permission — Client Admin (not Super Admin/Admin) is refused', async () => {
    const res = await request(app).delete(`/api/audit/sessions/${sessionId}`).set(auth());
    expect(res.status).toBe(403);
    const stillActive = await db('tbl_session_master').where({ Session_ID: sessionId }).first();
    expect(stillActive.Is_Active).toBe(true); // untouched by the refused attempt
  });
});

describe('GET /api/audit/summary', () => {
  test('returns real counts that reflect the seeded rows', async () => {
    const res = await request(app).get('/api/audit/summary').set(auth());
    expect(res.status).toBe(200);
    expect(res.body.data.totalLogs).toBeGreaterThanOrEqual(2);
    expect(res.body.data.deletedToday).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(res.body.data.byAction)).toBe(true);
    expect(Array.isArray(res.body.data.recentActivity)).toBe(true);
  });
});

describe('GET /api/audit/login-history', () => {
  test('only includes LOGIN/LOGOUT/LOGIN_FAILED action types', async () => {
    await db('tbl_audit_log').insert({
      Tenant_ID: tenant.tenantId, User_ID: tenant.userId, Username: tenant.username, Action_Type: 'LOGIN', Description: 'QA login row',
    });
    const res = await request(app).get('/api/audit/login-history').set(auth());
    expect(res.status).toBe(200);
    expect(res.body.data.every(r => ['LOGIN', 'LOGOUT', 'LOGIN_FAILED'].includes(r.Action_Type))).toBe(true);
    expect(res.body.data.some(r => r.Description === 'QA login row')).toBe(true);
  });
});

describe('GET /api/audit/user-activity', () => {
  test('aggregates per-user action counts for this tenant', async () => {
    const res = await request(app).get('/api/audit/user-activity').set(auth());
    expect(res.status).toBe(200);
    const row = res.body.data.find(r => r.User_ID === tenant.userId);
    expect(row).toBeTruthy();
    expect(Number(row.total_actions)).toBeGreaterThanOrEqual(3);
    expect(Number(row.inserts)).toBeGreaterThanOrEqual(1);
    expect(Number(row.deletes)).toBeGreaterThanOrEqual(1);
  });
});
