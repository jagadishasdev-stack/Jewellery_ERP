/**
 * Backup — genuinely absent before (no backup/restore capability existed
 * anywhere in the codebase). Deliberately scoped to ONLY the safe,
 * non-destructive direction: an on-demand, read-only export of this
 * tenant's own data. Restore is NOT built — a broken restore could
 * destroy real production data, flagged rather than guessed at.
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
  await testTenant.teardown();
  await db.destroy();
});

test('GET /tables lists tenant-scoped tables with real row counts', async () => {
  const res = await request(app).get('/api/backup/tables').set(auth());
  expect(res.status).toBe(200);
  expect(Array.isArray(res.body.data)).toBe(true);
  const customerTable = res.body.data.find((t) => t.table === 'tbl_customer_master');
  expect(customerTable).toBeDefined();
  expect(typeof customerTable.rows).toBe('number');
});

test('GET /export returns real rows for a table this tenant has data in', async () => {
  await request(app).post('/api/customers').set(auth()).send({ Customer_Name: 'QA Backup Customer', Mobile_1: '9800011111' });
  const res = await request(app).get('/api/backup/export').set(auth());
  expect(res.status).toBe(200);
  expect(res.body.data.tenantId).toBe(tenant.tenantId);
  const customerRows = res.body.data.tables['tbl_customer_master'].rows;
  expect(customerRows.some((r) => r.Customer_Name === 'QA Backup Customer')).toBe(true);
  // every row belongs to this tenant only — no cross-tenant leakage
  expect(customerRows.every((r) => r.Tenant_ID === tenant.tenantId)).toBe(true);

  await db('tbl_customer_master').where({ Tenant_ID: tenant.tenantId, Customer_Name: 'QA Backup Customer' }).del();
});

test('a user without tenant_management permission is rejected', async () => {
  const bcrypt = require('bcryptjs');
  const role = await db('tbl_role_master').insert({ Role_Name: 'QA No-Backup-Access Role', Permissions: JSON.stringify({ sales: true }), Is_Active: true }).returning('*');
  const [user] = await db('tbl_user_master').insert({
    Tenant_ID: tenant.tenantId, Username: 'qa_no_backup_user', Password_Hash: bcrypt.hashSync('QaNoBackup@2026', 10), Password_Salt: 'x',
    Role_ID: role[0].Role_ID, Full_Name: 'QA No Backup User', Is_Active: true, All_Branch_Access: true,
  }).returning('*');
  const login = await request(app).post('/api/auth/login').send({ username: 'qa_no_backup_user', password: 'QaNoBackup@2026', tenantId: tenant.tenantId });
  const res = await request(app).get('/api/backup/export').set({ Authorization: `Bearer ${login.body.data.token}` });
  expect(res.status).toBe(403);

  await db('tbl_user_master').where({ User_ID: user.User_ID }).del();
  await db('tbl_role_master').where({ Role_ID: role[0].Role_ID }).del();
});
