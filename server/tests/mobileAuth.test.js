/**
 * server/src/routes/mobileAuth.js — Mobile app (Image App + Savings App)
 * authentication. 13 endpoints, previously zero test coverage.
 *
 * FIXED as part of this pass — a real, live authentication bypass:
 * POST /login with loginType='customer' destructured `otp` from the body
 * but never checked it anywhere in that branch. Any caller who merely knew
 * (or guessed/enumerated) an existing customer's mobile number got a full
 * 7-day JWT for that customer's identity, no OTP or password required at
 * all — despite the branch's own comment and param name both claiming
 * "OTP based". Now enforced the same way /verify-otp already correctly
 * does it (including the same dev-fixed-OTP allowance for local testing).
 */
const request = require('supertest');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { app } = require('../src/index');
const db = require('../src/db/knex');
const testTenant = require('./helpers/testTenant');

let tenant;
const AGENT_MOBILE = '9811100001';
const CUSTOMER_MOBILE = '9811100002';
const MEMBER_MOBILE = '9811100003';
const UNKNOWN_MOBILE = '9811199999';
let agentId, memberId;

beforeAll(async () => {
  tenant = await testTenant.setup();

  const [agent] = await db('tbl_agent_master').insert({
    Tenant_ID: tenant.tenantId, Agent_Code: 'QAAG1', Agent_Name: 'QA Agent', Mobile: AGENT_MOBILE, Status: 'Active',
  }).returning('*');
  agentId = agent.Agent_ID;

  await db('tbl_customer_master').insert({
    Tenant_ID: tenant.tenantId, Customer_Code: 'QACUST-MOBILEAUTH-1', Customer_Name: 'QA Mobile Customer',
    Mobile_1: CUSTOMER_MOBILE, Created_By: 'test',
  });

  const [member] = await db('tbl_scheme_members').insert({
    Tenant_ID: tenant.tenantId, Member_Number: `QAMEM-${tenant.tenantId}-1`, Member_Name: 'QA Scheme Member', Mobile: MEMBER_MOBILE,
    Joining_Date: new Date(), Installment_Amount: 1000, Total_Installments: 12,
  }).returning('*');
  memberId = member.Member_ID;
});

afterAll(async () => {
  await db('tbl_mobile_otp').whereIn('Mobile', [AGENT_MOBILE, CUSTOMER_MOBILE, MEMBER_MOBILE, UNKNOWN_MOBILE]).del();
  await db('tbl_agent_master').where({ Tenant_ID: tenant.tenantId }).del();
  await db('tbl_scheme_members').where({ Tenant_ID: tenant.tenantId }).del();
  await db('tbl_customer_master').where({ Tenant_ID: tenant.tenantId }).del();
  await db('tbl_device_licenses').where({ Tenant_ID: tenant.tenantId }).del();
  await testTenant.teardown();
  await db.destroy();
});

describe('POST /api/mobile/validate-license', () => {
  test('400 with no license key', async () => {
    const res = await request(app).post('/api/mobile/validate-license').send({});
    expect(res.status).toBe(400);
  });

  test('404 for an unknown license key', async () => {
    const res = await request(app).post('/api/mobile/validate-license').send({ licenseKey: 'NOPE-0000' });
    expect(res.status).toBe(404);
  });

  test('resolves a real tenant by its license key', async () => {
    const t = await db('tbl_tenant_master').where({ Tenant_ID: tenant.tenantId }).first();
    const res = await request(app).post('/api/mobile/validate-license').send({ licenseKey: t.License_Key });
    expect(res.status).toBe(200);
    expect(res.body.data.tenantId).toBe(tenant.tenantId);
  });
});

describe('POST /api/mobile/send-otp + POST /api/mobile/verify-otp', () => {
  test('send-otp 404s for a mobile not registered as agent/member/customer, purpose LOGIN', async () => {
    const res = await request(app).post('/api/mobile/send-otp').send({ mobile: UNKNOWN_MOBILE, tenantId: tenant.tenantId });
    expect(res.status).toBe(404);
  });

  test('send-otp succeeds for a registered customer and returns the dev OTP outside production', async () => {
    const res = await request(app).post('/api/mobile/send-otp').send({ mobile: CUSTOMER_MOBILE, tenantId: tenant.tenantId });
    expect(res.status).toBe(200);
    expect(res.body.data.otpSent).toBe(true);
    expect(res.body.data.devOtp).toBe('234789');
  });

  test('send-otp for purpose=REGISTER allows an unknown mobile (self-signup)', async () => {
    const res = await request(app).post('/api/mobile/send-otp').send({ mobile: UNKNOWN_MOBILE, tenantId: tenant.tenantId, purpose: 'REGISTER' });
    expect(res.status).toBe(200);
  });

  test('verify-otp rejects a wrong OTP', async () => {
    const res = await request(app).post('/api/mobile/verify-otp').send({ mobile: CUSTOMER_MOBILE, otp: '000000', tenantId: tenant.tenantId });
    expect(res.status).toBe(401);
  });

  test('verify-otp with the dev fixed OTP logs in an existing agent', async () => {
    const res = await request(app).post('/api/mobile/verify-otp').send({ mobile: AGENT_MOBILE, otp: '234789', tenantId: tenant.tenantId });
    expect(res.status).toBe(200);
    expect(res.body.data.loginType).toBe('agent');
    expect(res.body.data.user.agentId).toBe(agentId);
    const decoded = jwt.decode(res.body.data.token);
    expect(decoded.loginType).toBe('agent');
  });

  test('verify-otp with the dev fixed OTP logs in an existing CRM customer', async () => {
    const res = await request(app).post('/api/mobile/verify-otp').send({ mobile: CUSTOMER_MOBILE, otp: '234789', tenantId: tenant.tenantId });
    expect(res.status).toBe(200);
    expect(res.body.data.loginType).toBe('customer');
    expect(res.body.data.user.mobile).toBe(CUSTOMER_MOBILE);
  });

  test('verify-otp with the dev fixed OTP logs in an existing scheme member (no CRM customer row)', async () => {
    const res = await request(app).post('/api/mobile/verify-otp').send({ mobile: MEMBER_MOBILE, otp: '234789', tenantId: tenant.tenantId });
    expect(res.status).toBe(200);
    expect(res.body.data.user.memberId).toBe(memberId);
  });

  test('verify-otp 404s an unknown mobile with purpose=LOGIN', async () => {
    const res = await request(app).post('/api/mobile/verify-otp').send({ mobile: UNKNOWN_MOBILE, otp: '234789', tenantId: tenant.tenantId, purpose: 'LOGIN' });
    expect(res.status).toBe(404);
  });

  test('verify-otp self-registers a brand-new customer with purpose=REGISTER', async () => {
    const res = await request(app).post('/api/mobile/verify-otp')
      .send({ mobile: UNKNOWN_MOBILE, otp: '234789', tenantId: tenant.tenantId, purpose: 'REGISTER', signupData: { name: 'QA Self Signup' } });
    expect(res.status).toBe(201);
    expect(res.body.data.user.customerName).toBe('QA Self Signup');

    const created = await db('tbl_customer_master').where({ Tenant_ID: tenant.tenantId, Mobile_1: UNKNOWN_MOBILE }).first();
    expect(created).toBeTruthy();
    await db('tbl_customer_master').where({ Customer_ID: created.Customer_ID }).del();
  });

  test('a real (non-dev-fixed) OTP round-trips through send-otp → verify-otp and is single-use', async () => {
    await db('tbl_mobile_otp').where({ Mobile: CUSTOMER_MOBILE }).del();
    // Force NODE_ENV to production just for the send-otp call so a real
    // random OTP is generated instead of the fixed dev one — then read it
    // straight back out of the DB (there's no SMS gateway in this test env).
    const prevEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      await request(app).post('/api/mobile/send-otp').send({ mobile: CUSTOMER_MOBILE, tenantId: tenant.tenantId });
    } finally {
      process.env.NODE_ENV = prevEnv;
    }
    const otpRow = await db('tbl_mobile_otp').where({ Mobile: CUSTOMER_MOBILE, Is_Used: false }).orderBy('Created_Date', 'desc').first();
    expect(otpRow).toBeTruthy();
    expect(otpRow.OTP).not.toBe('234789');

    const res1 = await request(app).post('/api/mobile/verify-otp').send({ mobile: CUSTOMER_MOBILE, otp: otpRow.OTP, tenantId: tenant.tenantId });
    expect(res1.status).toBe(200);

    // Same OTP used again must now fail — it was marked Is_Used.
    const res2 = await request(app).post('/api/mobile/verify-otp').send({ mobile: CUSTOMER_MOBILE, otp: otpRow.OTP, tenantId: tenant.tenantId });
    expect(res2.status).toBe(401);
  });
});

describe('POST /api/mobile/login — loginType=customer (mobile OTP)', () => {
  /**
   * FIXED: see file header. This is the core regression test for the auth
   * bypass — before the fix, this exact call (mobile known, no otp at all)
   * returned 200 with a full customer JWT.
   */
  test('FIXED: rejects customer login with no otp at all — used to silently succeed with just a mobile number', async () => {
    const res = await request(app).post('/api/mobile/login')
      .send({ tenantId: tenant.tenantId, loginType: 'customer', mobile: CUSTOMER_MOBILE });
    expect(res.status).toBe(400);
    expect(res.body.data ?? null).toBeNull(); // no token issued
  });

  test('FIXED: rejects customer login with a wrong otp', async () => {
    const res = await request(app).post('/api/mobile/login')
      .send({ tenantId: tenant.tenantId, loginType: 'customer', mobile: CUSTOMER_MOBILE, otp: '111111' });
    expect(res.status).toBe(401);
  });

  test('logs in an existing CRM customer with the dev fixed OTP', async () => {
    const res = await request(app).post('/api/mobile/login')
      .send({ tenantId: tenant.tenantId, loginType: 'customer', mobile: CUSTOMER_MOBILE, otp: '234789' });
    expect(res.status).toBe(200);
    expect(res.body.data.user.roleName).toBe('Customer');
    expect(res.body.data.user.mobile).toBe(CUSTOMER_MOBILE);
    const decoded = jwt.decode(res.body.data.token);
    expect(decoded.customerId).toBeTruthy();
  });

  test('logs in an existing scheme member (no CRM row) with the dev fixed OTP', async () => {
    const res = await request(app).post('/api/mobile/login')
      .send({ tenantId: tenant.tenantId, loginType: 'customer', mobile: MEMBER_MOBILE, otp: '234789' });
    expect(res.status).toBe(200);
    const decoded = jwt.decode(res.body.data.token);
    expect(decoded.memberId).toBeTruthy();
  });

  test('404s for a mobile with no customer or member record at all', async () => {
    const res = await request(app).post('/api/mobile/login')
      .send({ tenantId: tenant.tenantId, loginType: 'customer', mobile: UNKNOWN_MOBILE, otp: '234789' });
    expect(res.status).toBe(404);
  });
});

describe('POST /api/mobile/login — loginType=staff (username/password)', () => {
  test('400 with no username/password', async () => {
    const res = await request(app).post('/api/mobile/login').send({ tenantId: tenant.tenantId, loginType: 'staff' });
    expect(res.status).toBe(400);
  });

  test('401 for a wrong password', async () => {
    const res = await request(app).post('/api/mobile/login')
      .send({ tenantId: tenant.tenantId, loginType: 'staff', username: tenant.username, password: 'wrong-password' });
    expect(res.status).toBe(401);
  });

  test('logs in a real staff user, creates a session row, and returns permissions', async () => {
    const res = await request(app).post('/api/mobile/login')
      .send({ tenantId: tenant.tenantId, loginType: 'staff', username: tenant.username, password: tenant.password });
    expect(res.status).toBe(200);
    expect(res.body.data.sessionId).toBeTruthy();
    expect(res.body.data.user.username).toBe(tenant.username);

    const session = await db('tbl_session_master').where({ Session_ID: res.body.data.sessionId }).first();
    expect(session).toBeTruthy();
    expect(session.Tenant_ID).toBe(tenant.tenantId);
  });

  /**
   * FIXED: the audit-log call for this route used to spread the real
   * Express req (`{ ...req, user: {...} }`) — `headers` and `ip` are
   * accessor properties on Node's IncomingMessage, not own enumerable
   * ones, so the spread silently dropped them. auditLog then threw
   * reading `req.headers['x-forwarded-for']`, caught internally as
   * "non-fatal" — meaning EVERY mobile staff login's audit entry silently
   * failed to write at all, with no error surfaced to the caller. Fixed
   * by mutating req.user directly instead of spreading req.
   */
  test('FIXED: a mobile staff login writes a real audit log row (used to silently fail to write at all)', async () => {
    await db('tbl_audit_log').where({ Tenant_ID: tenant.tenantId, Table_Name: 'tbl_session_master', Action_Type: 'LOGIN' }).del();

    const res = await request(app).post('/api/mobile/login')
      .send({ tenantId: tenant.tenantId, loginType: 'staff', username: tenant.username, password: tenant.password });
    expect(res.status).toBe(200);

    const entry = await db('tbl_audit_log')
      .where({ Tenant_ID: tenant.tenantId, Table_Name: 'tbl_session_master', Record_ID: res.body.data.sessionId, Action_Type: 'LOGIN' })
      .first();
    expect(entry).toBeTruthy();
    expect(entry.Username).toBe(tenant.username);

    await db('tbl_audit_log').where({ Log_ID: entry.Log_ID }).del();
  });

  test('resolves the tenant via licenseKey instead of tenantId', async () => {
    const t = await db('tbl_tenant_master').where({ Tenant_ID: tenant.tenantId }).first();
    const res = await request(app).post('/api/mobile/login')
      .send({ licenseKey: t.License_Key, loginType: 'staff', username: tenant.username, password: tenant.password });
    expect(res.status).toBe(200);
    expect(res.body.data.user.tenantId).toBe(tenant.tenantId);
  });
});

describe('GET /api/mobile/tenant-info/:tenantId, /branches/:tenantId, /app-config/:tenantId, /policies/:tenantId — public', () => {
  test('tenant-info 404s for an unknown tenant', async () => {
    const res = await request(app).get('/api/mobile/tenant-info/QA_NO_SUCH_TENANT');
    expect(res.status).toBe(404);
  });

  test('tenant-info returns branding for a real tenant', async () => {
    const res = await request(app).get(`/api/mobile/tenant-info/${tenant.tenantId}`);
    expect(res.status).toBe(200);
    expect(res.body.data.Tenant_ID).toBe(tenant.tenantId);
  });

  test('branches lists the tenant\'s active branches', async () => {
    const res = await request(app).get(`/api/mobile/branches/${tenant.tenantId}`);
    expect(res.status).toBe(200);
    // Branch_ID is a string column (see 001_create_master_tables.js), so
    // compare loosely against testTenant's numeric BRANCH_ID constant.
    expect(res.body.data.some(b => String(b.Branch_ID) === String(tenant.branchId))).toBe(true);
  });

  test('app-config 404s when no config row exists for this tenant', async () => {
    const res = await request(app).get(`/api/mobile/app-config/${tenant.tenantId}`);
    expect(res.status).toBe(404);
  });

  test('policies returns an (empty-but-valid) array even with no policies configured', async () => {
    const res = await request(app).get(`/api/mobile/policies/${tenant.tenantId}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data.policies)).toBe(true);
  });

  test('check-member reports enrolled=true only for an active scheme member', async () => {
    const yes = await request(app).get(`/api/mobile/check-member/${tenant.tenantId}/${MEMBER_MOBILE}`);
    expect(yes.body.data.enrolled).toBe(true);
    const no = await request(app).get(`/api/mobile/check-member/${tenant.tenantId}/${UNKNOWN_MOBILE}`);
    expect(no.body.data.enrolled).toBe(false);
  });
});

describe('POST /api/mobile/request-device-access + license-login (PER_DEVICE flow)', () => {
  const DEVICE_ID = 'qa-device-001';

  test('request-device-access files a PENDING request for a real tenant', async () => {
    const res = await request(app).post('/api/mobile/request-device-access')
      .send({ tenantId: tenant.tenantId, deviceId: DEVICE_ID, deviceModel: 'QA Test Phone' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('PENDING');
  });

  test('re-requesting the same device while still PENDING returns the existing row, not a duplicate', async () => {
    const res = await request(app).post('/api/mobile/request-device-access')
      .send({ tenantId: tenant.tenantId, deviceId: DEVICE_ID });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('PENDING');

    const rows = await db('tbl_device_licenses').where({ Tenant_ID: tenant.tenantId, Device_ID: DEVICE_ID });
    expect(rows.length).toBe(1);
  });

  test('license-login rejects a PER_DEVICE license key entered on a different device', async () => {
    const [dl] = await db('tbl_device_licenses').where({ Tenant_ID: tenant.tenantId, Device_ID: DEVICE_ID })
      .update({ Status: 'APPROVED', License_Key: `QA-DEV-${tenant.tenantId}` }).returning('*');
    const res = await request(app).post('/api/mobile/license-login')
      .send({ licenseKey: dl.License_Key, deviceId: 'a-totally-different-device' });
    expect(res.status).toBe(403);
  });

  test('license-login accepts a PER_DEVICE license key on its own approved device', async () => {
    const dl = await db('tbl_device_licenses').where({ Tenant_ID: tenant.tenantId, Device_ID: DEVICE_ID }).first();
    const res = await request(app).post('/api/mobile/license-login')
      .send({ licenseKey: dl.License_Key, deviceId: DEVICE_ID });
    expect(res.status).toBe(200);
    expect(res.body.data.tenantId).toBe(tenant.tenantId);
  });
});

describe('GET /api/mobile/staff-list + POST /api/mobile/staff-pin-login', () => {
  let deviceToken;
  const PIN = '4321';

  beforeAll(async () => {
    const salt = bcrypt.genSaltSync(10);
    await db('tbl_user_master').where({ User_ID: tenant.userId }).update({ PIN_Hash: bcrypt.hashSync(PIN, salt) });
    deviceToken = jwt.sign({ tenantId: tenant.tenantId, roleName: 'Image App', username: `IMGAPP_${tenant.tenantId}`, loginType: 'license-device', permissions: {} },
      process.env.JWT_SECRET, { expiresIn: '1h' });
  });

  test('both require the device\'s own token', async () => {
    const list = await request(app).get('/api/mobile/staff-list');
    expect(list.status).toBe(401);
    const pin = await request(app).post('/api/mobile/staff-pin-login').send({ userId: tenant.userId, pin: PIN });
    expect(pin.status).toBe(401);
  });

  test('staff-list only lists staff who have a PIN set', async () => {
    const res = await request(app).get('/api/mobile/staff-list').set('Authorization', `Bearer ${deviceToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.some(s => s.User_ID === tenant.userId)).toBe(true);
  });

  test('staff-pin-login rejects a wrong PIN', async () => {
    const res = await request(app).post('/api/mobile/staff-pin-login').set('Authorization', `Bearer ${deviceToken}`)
      .send({ userId: tenant.userId, pin: '0000' });
    expect(res.status).toBe(401);
  });

  test('staff-pin-login succeeds with the right PIN and returns real role permissions (not hardcoded {})', async () => {
    const res = await request(app).post('/api/mobile/staff-pin-login').set('Authorization', `Bearer ${deviceToken}`)
      .send({ userId: tenant.userId, pin: PIN });
    expect(res.status).toBe(200);
    const decoded = jwt.decode(res.body.data.token);
    expect(decoded.loginType).toBe('staff-pin');
    expect(Object.keys(decoded.permissions || {}).length).toBeGreaterThan(0);
  });
});
