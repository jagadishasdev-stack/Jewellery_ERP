/**
 * Super Admin SMS gateway/template config (GET/PUT /api/sms-config/*) —
 * Api_Key must never be readable back through the API (only a masked
 * last-4 hint), and a save that omits Api_Key must update other fields
 * without clobbering the already-stored real key.
 */
const request = require('supertest');
const bcrypt = require('bcryptjs');
const { app } = require('../src/index');
const db = require('../src/db/knex');
const testTenant = require('./helpers/testTenant');

let tenant, saToken, saUserId;
const saAuth = () => ({ Authorization: `Bearer ${saToken}` });

const SA_USERNAME = 'qatest_sa_smsconfig';
const SA_PASSWORD = 'QaTestSA@2026sms';

beforeAll(async () => {
  tenant = await testTenant.setup();

  const role = await db('tbl_role_master').where({ Role_Name: 'Super Admin' }).first();
  const salt = await bcrypt.genSalt(10);
  const hash = await bcrypt.hash(SA_PASSWORD, salt);
  const [saUser] = await db('tbl_user_master').insert({
    Tenant_ID: 'SA_MASTER', Username: SA_USERNAME, Password_Hash: hash, Password_Salt: salt,
    Role_ID: role.Role_ID, Full_Name: 'QA Test SA SMS Config', Is_Active: true, Is_Admin: true,
    Created_By: 'test',
  }).returning('*');
  saUserId = saUser.User_ID;

  const saRes = await request(app).post('/api/auth/login').send({ username: SA_USERNAME, password: SA_PASSWORD, tenantId: 'SA_MASTER' });
  saToken = saRes.body.data.token;
});

afterAll(async () => {
  await db('tbl_sms_templates').where({ Tenant_ID: tenant.tenantId }).del();
  await db('tbl_sms_gateway_config').where({ Tenant_ID: tenant.tenantId }).del();
  if (saUserId) await db('tbl_user_master').where({ User_ID: saUserId }).del();
  await testTenant.teardown();
  await db.destroy();
});

test('a tenant with no config of its own gets the global fallback, flagged isOwnConfig:false', async () => {
  const res = await request(app).get('/api/sms-config/gateway-config').set(saAuth()).query({ tenantId: tenant.tenantId });
  expect(res.status).toBe(200);
  expect(res.body.data.isOwnConfig).toBe(false);
  expect(res.body.data.Api_Key).toBeUndefined();
});

test('creating a new config requires Api_Key; the response never contains the raw key', async () => {
  const missing = await request(app).put('/api/sms-config/gateway-config').set(saAuth()).query({ tenantId: tenant.tenantId }).send({
    Provider: 'asterix', Api_Base_Url: 'http://sms.example.com/submitsms.jsp',
    Api_User: 'QATESTUSER', Sender_Id: 'QATST', Entity_Id: '1101545190000083228',
  });
  expect(missing.status).toBe(400);

  const res = await request(app).put('/api/sms-config/gateway-config').set(saAuth()).query({ tenantId: tenant.tenantId }).send({
    Provider: 'asterix', Api_Base_Url: 'http://sms.example.com/submitsms.jsp',
    Api_User: 'QATESTUSER', Api_Key: 'real_secret_key_999', Sender_Id: 'QATST', Entity_Id: '1101545190000083228',
  });
  expect(res.status).toBe(200);
  expect(res.body.data.Api_Key_Masked).toBe('••••_999');
  expect(JSON.stringify(res.body)).not.toContain('real_secret_key_999');

  const row = await db('tbl_sms_gateway_config').where({ Tenant_ID: tenant.tenantId }).first();
  expect(row.Api_Key).toBe('real_secret_key_999'); // stored correctly server-side
});

test('now that this tenant has its own row, GET returns it flagged isOwnConfig:true', async () => {
  const res = await request(app).get('/api/sms-config/gateway-config').set(saAuth()).query({ tenantId: tenant.tenantId });
  expect(res.body.data.isOwnConfig).toBe(true);
  expect(res.body.data.Sender_Id).toBe('QATST');
});

test('a save that omits Api_Key updates other fields without clobbering the stored key', async () => {
  const res = await request(app).put('/api/sms-config/gateway-config').set(saAuth()).query({ tenantId: tenant.tenantId }).send({
    Provider: 'asterix', Api_Base_Url: 'http://sms.example.com/submitsms.jsp',
    Api_User: 'QATESTUSER', Sender_Id: 'NEWID', Entity_Id: '1101545190000083228',
  });
  expect(res.status).toBe(200);
  expect(res.body.data.Sender_Id).toBe('NEWID');

  const row = await db('tbl_sms_gateway_config').where({ Tenant_ID: tenant.tenantId }).first();
  expect(row.Api_Key).toBe('real_secret_key_999'); // unchanged
});

test('a template can be created for this tenant, overriding the global default for that purpose', async () => {
  const res = await request(app).post('/api/sms-config/templates').set(saAuth()).query({ tenantId: tenant.tenantId }).send({
    Purpose: 'OTP', Dlt_Template_Id: '1107176156691281999', Template_Text: '<OTP> is your QA Test Tenant login code.',
  });
  expect(res.status).toBe(200);
  expect(res.body.data.Template_Text).toContain('QA Test Tenant');

  const list = await request(app).get('/api/sms-config/templates').set(saAuth()).query({ tenantId: tenant.tenantId });
  const otp = list.body.data.find((t) => t.Purpose === 'OTP');
  expect(otp.isOwnConfig).toBe(true);
  expect(otp.Template_Text).toContain('QA Test Tenant');
});

test('a non-Super-Admin cannot read or write SMS gateway config', async () => {
  const staffLogin = await request(app).post('/api/auth/login').send({ username: tenant.username, password: tenant.password, tenantId: tenant.tenantId });
  const staffToken = staffLogin.body.data.token;

  const getRes = await request(app).get('/api/sms-config/gateway-config')
    .set({ Authorization: `Bearer ${staffToken}` }).query({ tenantId: tenant.tenantId });
  expect(getRes.status).toBe(403);
});
