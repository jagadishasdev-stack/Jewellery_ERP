/**
 * server/src/routes/tally.js — the WRITE-SIDE endpoints: GET/PUT /config,
 * GET /sync-log, POST /sync, PUT /sync-log/:id, POST /push. The read/export
 * side (GET /export/*) already has coverage in tallyExport.test.js — this
 * file only covers what that one doesn't.
 *
 * POST /push makes a real outbound HTTP call to a Tally gateway on the
 * shop's own LAN, which this test environment obviously can't reach —
 * tested here by pointing Server_IP at an address guaranteed to refuse the
 * connection (127.0.0.1 on a closed port), which exercises the route's own
 * "couldn't reach Tally" failure path exactly as it would in production
 * against an offline Tally server, without needing a live one.
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
  await db('tbl_tally_sync_log').where({ Tenant_ID: tenant.tenantId }).del();
  await db('tbl_tally_config').where({ Tenant_ID: tenant.tenantId }).del();
  await testTenant.teardown();
  await db.destroy();
});

describe('GET/PUT /api/tally/config', () => {
  test('GET returns null before any config exists', async () => {
    const res = await request(app).get('/api/tally/config').set(auth());
    expect(res.status).toBe(200);
    expect(res.body.data).toBeFalsy();
  });

  test('PUT creates a config row on first call (201)', async () => {
    const res = await request(app).put('/api/tally/config').set(auth())
      .send({ Tally_Company_Name: 'QA Test Co', Server_IP: '127.0.0.1', Server_Port: 9999 });
    expect(res.status).toBe(201);
    expect(res.body.data.Tenant_ID).toBe(tenant.tenantId);
    expect(res.body.data.Sync_Enabled).toBe(false);
  });

  test('PUT updates the existing config row on a second call (200, not another insert)', async () => {
    const res = await request(app).put('/api/tally/config').set(auth()).send({ Sync_Enabled: true });
    expect(res.status).toBe(200);
    expect(res.body.data.Sync_Enabled).toBe(true);
    expect(res.body.data.Tally_Company_Name).toBe('QA Test Co'); // untouched fields survive the partial update

    const rows = await db('tbl_tally_config').where({ Tenant_ID: tenant.tenantId });
    expect(rows.length).toBe(1); // still exactly one row, not a duplicate
  });

  test('GET now returns the saved config', async () => {
    const res = await request(app).get('/api/tally/config').set(auth());
    expect(res.status).toBe(200);
    expect(res.body.data.Server_IP).toBe('127.0.0.1');
  });
});

describe('POST /api/tally/sync + GET /sync-log + PUT /sync-log/:id', () => {
  test('POST /sync validates Sync_Type/Reference_Table/Reference_ID', async () => {
    const res = await request(app).post('/api/tally/sync').set(auth()).send({ Sync_Type: 'NotAType', Reference_Table: '', Reference_ID: '' });
    expect(res.status).toBe(422);
  });

  test('POST /sync queues a Pending entry when Sync_Enabled is true', async () => {
    const res = await request(app).post('/api/tally/sync').set(auth())
      .send({ Sync_Type: 'Voucher', Reference_Table: 'tbl_accounting_journal', Reference_ID: 999001 });
    expect(res.status).toBe(201);
    expect(res.body.data.Status).toBe('Pending');
    expect(res.body.data.Tenant_ID).toBe(tenant.tenantId);
  });

  test('POST /sync refuses to queue when Tally sync is not enabled for the tenant', async () => {
    await request(app).put('/api/tally/config').set(auth()).send({ Sync_Enabled: false });
    const res = await request(app).post('/api/tally/sync').set(auth())
      .send({ Sync_Type: 'Ledger', Reference_Table: 'tbl_chart_of_accounts', Reference_ID: 1 });
    expect(res.status).toBe(400);
    await request(app).put('/api/tally/config').set(auth()).send({ Sync_Enabled: true }); // restore for later tests
  });

  test('GET /sync-log lists what was queued, filterable by status/syncType', async () => {
    const all = await request(app).get('/api/tally/sync-log').set(auth());
    expect(all.status).toBe(200);
    expect(all.body.data.some(r => r.Reference_ID === '999001' || r.Reference_ID === 999001)).toBe(true);

    const filtered = await request(app).get('/api/tally/sync-log?status=Pending&syncType=Voucher').set(auth());
    expect(filtered.status).toBe(200);
    expect(filtered.body.data.every(r => r.Status === 'Pending' && r.Sync_Type === 'Voucher')).toBe(true);
  });

  test('PUT /sync-log/:id validates Status against the enum', async () => {
    const row = await db('tbl_tally_sync_log').where({ Tenant_ID: tenant.tenantId }).first();
    const res = await request(app).put(`/api/tally/sync-log/${row.Log_ID}`).set(auth()).send({ Status: 'NotAStatus' });
    expect(res.status).toBe(422);
  });

  test('PUT /sync-log/:id 404s for an entry belonging to a different tenant (or nonexistent)', async () => {
    const res = await request(app).put('/api/tally/sync-log/9999999').set(auth()).send({ Status: 'Synced' });
    expect(res.status).toBe(404);
  });

  test('PUT /sync-log/:id marks Synced and stamps Synced_Date', async () => {
    const row = await db('tbl_tally_sync_log').where({ Tenant_ID: tenant.tenantId, Status: 'Pending' }).first();
    const res = await request(app).put(`/api/tally/sync-log/${row.Log_ID}`).set(auth()).send({ Status: 'Synced' });
    expect(res.status).toBe(200);
    expect(res.body.data.Status).toBe('Synced');
    expect(res.body.data.Synced_Date).toBeTruthy();
  });
});

describe('POST /api/tally/push', () => {
  test('refuses when Tally sync is not enabled', async () => {
    await request(app).put('/api/tally/config').set(auth()).send({ Sync_Enabled: false });
    const res = await request(app).post('/api/tally/push').set(auth());
    expect(res.status).toBe(400);
    await request(app).put('/api/tally/config').set(auth()).send({ Sync_Enabled: true });
  });

  test('refuses when no Server_IP is configured', async () => {
    await request(app).put('/api/tally/config').set(auth()).send({ Server_IP: null });
    const res = await request(app).post('/api/tally/push').set(auth());
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/No Tally Server IP/);
    await request(app).put('/api/tally/config').set(auth()).send({ Server_IP: '127.0.0.1' });
  });

  test('reports "Nothing pending" when the sync log has no Pending accounting-journal rows', async () => {
    await db('tbl_tally_sync_log').where({ Tenant_ID: tenant.tenantId }).update({ Status: 'Synced' });
    const res = await request(app).post('/api/tally/push').set(auth());
    expect(res.status).toBe(200);
    expect(res.body.data.pushed).toBe(0);
  });

  /**
   * Can't reach a real Tally gateway from this test environment (needs the
   * shop's own LAN) — this exercises the route's own graceful failure path
   * instead: a Pending entry queued, Server_IP pointed at a closed local
   * port so the fetch definitely fails to connect, confirming the route
   * reports a clean 502 (not a raw crash) and marks the entry Failed with a
   * real Error_Message rather than leaving it silently Pending forever.
   */
  test('a Pending entry that cannot reach Tally is marked Failed with a real error message, and the caller gets a clean 502', async () => {
    await db('tbl_tally_sync_log').insert({
      Tenant_ID: tenant.tenantId, Sync_Type: 'Voucher', Reference_Table: 'tbl_accounting_journal', Reference_ID: 999002, Status: 'Pending',
    });
    await request(app).put('/api/tally/config').set(auth()).send({ Server_IP: '127.0.0.1', Server_Port: 1 }); // port 1 — nothing listens there

    const res = await request(app).post('/api/tally/push').set(auth());
    expect(res.status).toBe(502);
    expect(res.body.message).toMatch(/Could not reach Tally/);

    const row = await db('tbl_tally_sync_log').where({ Tenant_ID: tenant.tenantId, Reference_ID: 999002 }).first();
    expect(row.Status).toBe('Failed');
    expect(row.Error_Message).toBeTruthy();
  }, 20000);
});
