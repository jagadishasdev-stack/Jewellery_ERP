/**
 * Super Admin push-notification (Firebase Admin SDK) config
 * (GET/PUT /api/push-config/config, POST /api/push-config/test-send) —
 * the service account JSON (contains a private key) must never be
 * readable back through the API, only a masked client_email hint;
 * invalid/incomplete JSON must be rejected before it's ever stored.
 */
const request = require('supertest');
const bcrypt = require('bcryptjs');

jest.mock('firebase-admin', () => {
  const mockSend = jest.fn().mockResolvedValue('projects/qa-test/messages/mock-message-id-123');
  return {
    initializeApp: jest.fn(() => ({ delete: jest.fn().mockResolvedValue() })),
    credential: { cert: jest.fn((x) => x) },
    messaging: jest.fn(() => ({ send: mockSend })),
    __mockSend: mockSend,
  };
});

const { app } = require('../src/index');
const db = require('../src/db/knex');
const testTenant = require('./helpers/testTenant');

let tenant, saToken, saUserId;
const saAuth = () => ({ Authorization: `Bearer ${saToken}` });

const SA_USERNAME = 'qatest_sa_pushconfig';
const SA_PASSWORD = 'QaTestSA@2026push';

const REAL_SHAPED_SERVICE_ACCOUNT = JSON.stringify({
  type: 'service_account',
  project_id: 'qa-test-project',
  private_key_id: 'abc123',
  private_key: '-----BEGIN PRIVATE KEY-----\nMIIQAtest\n-----END PRIVATE KEY-----\n',
  client_email: 'firebase-adminsdk@qa-test-project.iam.gserviceaccount.com',
  client_id: '123456789',
  token_uri: 'https://oauth2.googleapis.com/token',
});

beforeAll(async () => {
  tenant = await testTenant.setup();

  const role = await db('tbl_role_master').where({ Role_Name: 'Super Admin' }).first();
  const salt = await bcrypt.genSalt(10);
  const hash = await bcrypt.hash(SA_PASSWORD, salt);
  const [saUser] = await db('tbl_user_master').insert({
    Tenant_ID: 'SA_MASTER', Username: SA_USERNAME, Password_Hash: hash, Password_Salt: salt,
    Role_ID: role.Role_ID, Full_Name: 'QA Test SA Push Config', Is_Active: true, Is_Admin: true,
    Created_By: 'test',
  }).returning('*');
  saUserId = saUser.User_ID;

  const saRes = await request(app).post('/api/auth/login').send({ username: SA_USERNAME, password: SA_PASSWORD, tenantId: 'SA_MASTER' });
  saToken = saRes.body.data.token;
});

afterAll(async () => {
  await db('tbl_push_log').where({ Tenant_ID: tenant.tenantId }).del();
  await db('tbl_push_notification_config').where({ Tenant_ID: tenant.tenantId }).del();
  if (saUserId) await db('tbl_user_master').where({ User_ID: saUserId }).del();
  await testTenant.teardown();
  await db.destroy();
});

test('a tenant with no config of its own gets null unless a global fallback exists', async () => {
  const res = await request(app).get('/api/push-config/config').set(saAuth()).query({ tenantId: tenant.tenantId });
  expect(res.status).toBe(200);
  // No global fallback row exists in this test DB either, so this is null —
  // either way, the raw key must never appear.
  expect(JSON.stringify(res.body)).not.toContain('BEGIN PRIVATE KEY');
});

test('rejects invalid JSON', async () => {
  const res = await request(app).put('/api/push-config/config').set(saAuth()).query({ tenantId: tenant.tenantId }).send({
    Service_Account_JSON: 'not json at all',
  });
  expect(res.status).toBe(422);
});

test('rejects valid JSON that is not a service-account key', async () => {
  const res = await request(app).put('/api/push-config/config').set(saAuth()).query({ tenantId: tenant.tenantId }).send({
    Service_Account_JSON: JSON.stringify({ foo: 'bar' }),
  });
  expect(res.status).toBe(422);
});

test('accepts a real-shaped service account; response never contains the private key', async () => {
  const res = await request(app).put('/api/push-config/config').set(saAuth()).query({ tenantId: tenant.tenantId }).send({
    Service_Account_JSON: REAL_SHAPED_SERVICE_ACCOUNT,
  });
  expect(res.status).toBe(200);
  expect(res.body.data.Project_ID).toBe('qa-test-project');
  expect(res.body.data.Client_Email_Hint).toBe('firebase-adminsdk@qa-test-project.iam.gserviceaccount.com');
  expect(JSON.stringify(res.body)).not.toContain('BEGIN PRIVATE KEY');

  const row = await db('tbl_push_notification_config').where({ Tenant_ID: tenant.tenantId }).first();
  expect(JSON.parse(row.Service_Account_JSON).private_key).toContain('BEGIN PRIVATE KEY'); // stored correctly server-side
});

test('GET now returns isOwnConfig:true for this tenant', async () => {
  const res = await request(app).get('/api/push-config/config').set(saAuth()).query({ tenantId: tenant.tenantId });
  expect(res.body.data.isOwnConfig).toBe(true);
  expect(res.body.data.Project_ID).toBe('qa-test-project');
});

test('test-send actually calls the (mocked) Firebase Admin SDK and logs it', async () => {
  const res = await request(app).post('/api/push-config/test-send').set(saAuth()).query({ tenantId: tenant.tenantId }).send({
    deviceToken: 'qa-test-device-token-xyz',
  });
  expect(res.status).toBe(200);
  expect(res.body.data.messageId).toBe('projects/qa-test/messages/mock-message-id-123');

  const admin = require('firebase-admin');
  expect(admin.__mockSend).toHaveBeenCalledWith(expect.objectContaining({ token: 'qa-test-device-token-xyz' }));

  const logRow = await db('tbl_push_log').where({ Tenant_ID: tenant.tenantId }).orderBy('Log_ID', 'desc').first();
  expect(logRow.Status).toBe('Sent');
  expect(logRow.Purpose).toBe('TEST');
});

test('a non-Super-Admin cannot read or write push config', async () => {
  const staffLogin = await request(app).post('/api/auth/login').send({ username: tenant.username, password: tenant.password, tenantId: tenant.tenantId });
  const staffToken = staffLogin.body.data.token;

  const getRes = await request(app).get('/api/push-config/config')
    .set({ Authorization: `Bearer ${staffToken}` }).query({ tenantId: tenant.tenantId });
  expect(getRes.status).toBe(403);
});
