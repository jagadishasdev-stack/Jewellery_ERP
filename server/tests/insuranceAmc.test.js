/**
 * Insurance & AMC (Annual Maintenance Contract) module —
 * src/routes/insuranceAmc.js — had zero real test coverage before this file
 * (only a generic cross-module permission-gate smoke test ever touched it).
 *
 * Covers: insurance policy master + customer insurance enrollment + claim
 * workflow, and AMC plan master + AMC enrollment + service-visit logging.
 */
const request = require('supertest');
const dayjs = require('dayjs');
const { app } = require('../src/index');
const db = require('../src/db/knex');
const testTenant = require('./helpers/testTenant');

let tenant, token, customerId;
const auth = () => ({ Authorization: `Bearer ${token}` });

beforeAll(async () => {
  tenant = await testTenant.setup();
  const res = await request(app).post('/api/auth/login').send({ username: tenant.username, password: tenant.password, tenantId: tenant.tenantId });
  token = res.body.data.token;

  const cust = await request(app).post('/api/customers').set(auth()).send({
    Customer_Name: 'QA Insurance Customer', Mobile_1: '9876500001',
  });
  customerId = cust.body.data.Customer_ID;
});

afterAll(async () => {
  await db('tbl_amc_enrollment').where({ Tenant_ID: tenant.tenantId }).del();
  await db('tbl_amc_plan_master').where({ Tenant_ID: tenant.tenantId }).del();
  await db('tbl_customer_insurance').where({ Tenant_ID: tenant.tenantId }).del();
  await db('tbl_insurance_policy_master').where({ Tenant_ID: tenant.tenantId }).del();
  await testTenant.teardown();
  await db.destroy();
});

// ── Insurance Policy Master ─────────────────────────────────────────────────
describe('Insurance Policy Master', () => {
  test('POST /policies requires Insurer_Name and Policy_Number', async () => {
    const res = await request(app).post('/api/insurance-amc/policies').set(auth()).send({});
    expect(res.status).toBe(422);
  });

  test('POST /policies creates a policy, and GET /policies lists it back for this tenant', async () => {
    const res = await request(app).post('/api/insurance-amc/policies').set(auth()).send({
      Insurer_Name: 'QA Assure Co', Policy_Number: 'QAPOL-001', Coverage_Type: 'All Risk', Premium_Rate_Pct: 2.5,
    });
    expect(res.status).toBe(201);
    expect(res.body.data.Insurer_Name).toBe('QA Assure Co');
    expect(parseFloat(res.body.data.Premium_Rate_Pct)).toBe(2.5);

    const row = await db('tbl_insurance_policy_master').where({ Policy_ID: res.body.data.Policy_ID }).first();
    expect(row.Tenant_ID).toBe(tenant.tenantId);
    expect(row.Is_Active).toBe(true);
    expect(row.Created_By).toBe(tenant.username);

    const list = await request(app).get('/api/insurance-amc/policies').set(auth());
    expect(list.status).toBe(200);
    expect(list.body.data.some((p) => p.Policy_ID === row.Policy_ID)).toBe(true);
  });
});

// ── Customer Insurance + Claims ──────────────────────────────────────────────
describe('Customer Insurance enrollment and claims', () => {
  let policyId;

  beforeAll(async () => {
    const res = await request(app).post('/api/insurance-amc/policies').set(auth()).send({
      Insurer_Name: 'QA Premium Rated Insurer', Policy_Number: 'QAPOL-RATED', Premium_Rate_Pct: 4,
    });
    policyId = res.body.data.Policy_ID;
  });

  test('POST /customer-insurance requires Customer_ID, Sum_Insured>0, Start_Date', async () => {
    const missingAll = await request(app).post('/api/insurance-amc/customer-insurance').set(auth()).send({});
    expect(missingAll.status).toBe(422);

    const badSum = await request(app).post('/api/insurance-amc/customer-insurance').set(auth()).send({
      Customer_ID: customerId, Sum_Insured: 0, Start_Date: '2026-01-01',
    });
    expect(badSum.status).toBe(422);
  });

  test('POST /customer-insurance auto-derives Premium_Amount from the policy Premium_Rate_Pct when not given explicitly', async () => {
    const res = await request(app).post('/api/insurance-amc/customer-insurance').set(auth()).send({
      Customer_ID: customerId, Policy_ID: policyId, Sum_Insured: 100000, Start_Date: '2026-01-15',
    });
    expect(res.status).toBe(201);
    // 4% of 100000 = 4000
    expect(parseFloat(res.body.data.Premium_Amount)).toBe(4000);
    expect(res.body.data.Status).toBe('Active');
    // Expiry_Date defaults to Start_Date + 1 year when not supplied.
    expect(dayjs(res.body.data.Expiry_Date).format('YYYY-MM-DD')).toBe('2027-01-15');

    const row = await db('tbl_customer_insurance').where({ Insurance_ID: res.body.data.Insurance_ID }).first();
    expect(row.Customer_ID).toBe(customerId);
    expect(row.Policy_ID).toBe(policyId);
    expect(parseFloat(row.Sum_Insured)).toBe(100000);
  });

  test('POST /customer-insurance respects an explicit Premium_Amount override, ignoring the policy rate', async () => {
    const res = await request(app).post('/api/insurance-amc/customer-insurance').set(auth()).send({
      Customer_ID: customerId, Policy_ID: policyId, Sum_Insured: 50000, Premium_Amount: 999, Start_Date: '2026-02-01',
    });
    expect(res.status).toBe(201);
    expect(parseFloat(res.body.data.Premium_Amount)).toBe(999);
  });

  test('POST /customer-insurance respects an explicit Expiry_Date instead of the +1 year default', async () => {
    const res = await request(app).post('/api/insurance-amc/customer-insurance').set(auth()).send({
      Customer_ID: customerId, Sum_Insured: 20000, Start_Date: '2026-01-01', Expiry_Date: '2026-06-30',
    });
    expect(res.status).toBe(201);
    expect(dayjs(res.body.data.Expiry_Date).format('YYYY-MM-DD')).toBe('2026-06-30');
  });

  test('POST /customer-insurance with no Policy_ID and no Premium_Amount lands Premium_Amount at 0 (no rate to derive from)', async () => {
    const res = await request(app).post('/api/insurance-amc/customer-insurance').set(auth()).send({
      Customer_ID: customerId, Sum_Insured: 30000, Start_Date: '2026-01-01',
    });
    expect(res.status).toBe(201);
    expect(parseFloat(res.body.data.Premium_Amount)).toBe(0);
  });

  test('GET /customer-insurance filters by customerId and status', async () => {
    const byCustomer = await request(app).get('/api/insurance-amc/customer-insurance').set(auth()).query({ customerId });
    expect(byCustomer.status).toBe(200);
    expect(byCustomer.body.data.length).toBeGreaterThan(0);
    expect(byCustomer.body.data.every((r) => r.Customer_ID === customerId)).toBe(true);
    // Joined columns are actually populated.
    expect(byCustomer.body.data[0].Customer_Name).toBe('QA Insurance Customer');

    const byStatus = await request(app).get('/api/insurance-amc/customer-insurance').set(auth()).query({ status: 'Active' });
    expect(byStatus.status).toBe(200);
    expect(byStatus.body.data.every((r) => r.Status === 'Active')).toBe(true);
  });

  // BUG: `body('Claim_Amount').isFloat({ gt: 0 })` is registered as
  // middleware on this route, but the handler never calls
  // validationResult(req)/sendValidationError — unlike every other route in
  // this file (e.g. POST /policies, POST /customer-insurance,
  // POST /amc-plans, POST /amc-enrollments, all of which check it). The
  // validation is dead code: Claim_Amount: 0 (and even a non-numeric value)
  // sails straight through to the DB update.
  test('FIXED: POST /customer-insurance/:id/claim now actually enforces its declared Claim_Amount>0 validator — Claim_Amount:0 is rejected with 422', async () => {
    const enroll = await request(app).post('/api/insurance-amc/customer-insurance').set(auth()).send({
      Customer_ID: customerId, Sum_Insured: 40000, Start_Date: '2026-01-01',
    });
    const res = await request(app).post(`/api/insurance-amc/customer-insurance/${enroll.body.data.Insurance_ID}/claim`).set(auth()).send({ Claim_Amount: 0 });
    expect(res.status).toBe(422);

    const row = await db('tbl_customer_insurance').where({ Insurance_ID: enroll.body.data.Insurance_ID }).first();
    expect(row.Status).not.toBe('Claimed'); // unaffected
  });

  test('POST /customer-insurance/:id/claim marks the policy Claimed, stamps Claim_Date/Claim_Amount', async () => {
    const enroll = await request(app).post('/api/insurance-amc/customer-insurance').set(auth()).send({
      Customer_ID: customerId, Sum_Insured: 60000, Start_Date: '2026-01-01',
    });
    const insuranceId = enroll.body.data.Insurance_ID;

    const res = await request(app).post(`/api/insurance-amc/customer-insurance/${insuranceId}/claim`).set(auth()).send({ Claim_Amount: 15000 });
    expect(res.status).toBe(200);
    expect(res.body.data.Status).toBe('Claimed');
    expect(parseFloat(res.body.data.Claim_Amount)).toBe(15000);
    expect(res.body.data.Claim_Date).toBe(dayjs().format('YYYY-MM-DD'));

    const row = await db('tbl_customer_insurance').where({ Insurance_ID: insuranceId }).first();
    expect(row.Status).toBe('Claimed');
    expect(parseFloat(row.Claim_Amount)).toBe(15000);
  });

  test('POST /customer-insurance/:id/claim 404s for a non-existent insurance record', async () => {
    const res = await request(app).post('/api/insurance-amc/customer-insurance/999999999/claim').set(auth()).send({ Claim_Amount: 100 });
    expect(res.status).toBe(404);
  });

  test('FIXED: filing a second claim against an already-Claimed policy is now rejected with 400 instead of silently overwriting the first claim', async () => {
    const enroll = await request(app).post('/api/insurance-amc/customer-insurance').set(auth()).send({
      Customer_ID: customerId, Sum_Insured: 70000, Start_Date: '2026-01-01',
    });
    const insuranceId = enroll.body.data.Insurance_ID;

    const first = await request(app).post(`/api/insurance-amc/customer-insurance/${insuranceId}/claim`).set(auth()).send({ Claim_Amount: 5000 });
    expect(first.status).toBe(200);
    expect(first.body.data.Status).toBe('Claimed');

    const second = await request(app).post(`/api/insurance-amc/customer-insurance/${insuranceId}/claim`).set(auth()).send({ Claim_Amount: 9999 });
    expect(second.status).toBe(400);

    const row = await db('tbl_customer_insurance').where({ Insurance_ID: insuranceId }).first();
    expect(parseFloat(row.Claim_Amount)).toBe(5000); // unchanged, not overwritten
  });
});

// ── AMC Plan Master ──────────────────────────────────────────────────────────
describe('AMC Plan Master', () => {
  test('POST /amc-plans requires Plan_Name and Amount>0', async () => {
    const res = await request(app).post('/api/insurance-amc/amc-plans').set(auth()).send({ Plan_Name: 'Gold Care' });
    expect(res.status).toBe(422);
  });

  test('POST /amc-plans creates a plan, GET /amc-plans lists it', async () => {
    const res = await request(app).post('/api/insurance-amc/amc-plans').set(auth()).send({
      Plan_Name: 'QA Gold Care 1yr', Duration_Months: 12, Amount: 1200, Free_Services_Included: 2,
    });
    expect(res.status).toBe(201);
    expect(res.body.data.Plan_Name).toBe('QA Gold Care 1yr');
    expect(parseFloat(res.body.data.Amount)).toBe(1200);
    expect(res.body.data.Free_Services_Included).toBe(2);

    const list = await request(app).get('/api/insurance-amc/amc-plans').set(auth());
    expect(list.status).toBe(200);
    expect(list.body.data.some((p) => p.Plan_ID === res.body.data.Plan_ID)).toBe(true);
  });
});

// ── AMC Enrollment + Service Visits ──────────────────────────────────────────
describe('AMC Enrollment and service-visit logging', () => {
  let planId;

  beforeAll(async () => {
    const plan = await request(app).post('/api/insurance-amc/amc-plans').set(auth()).send({
      Plan_Name: 'QA Silver Care 6mo', Duration_Months: 6, Amount: 500, Free_Services_Included: 1,
    });
    planId = plan.body.data.Plan_ID;
  });

  test('POST /amc-enrollments requires Customer_ID and Plan_ID', async () => {
    const res = await request(app).post('/api/insurance-amc/amc-enrollments').set(auth()).send({});
    expect(res.status).toBe(422);
  });

  test('POST /amc-enrollments 404s when Plan_ID does not exist', async () => {
    const res = await request(app).post('/api/insurance-amc/amc-enrollments').set(auth()).send({ Customer_ID: customerId, Plan_ID: 999999 });
    expect(res.status).toBe(404);
  });

  test('POST /amc-enrollments computes Expiry_Date from the plan Duration_Months and defaults Amount_Paid to the plan Amount', async () => {
    const res = await request(app).post('/api/insurance-amc/amc-enrollments').set(auth()).send({
      Customer_ID: customerId, Plan_ID: planId, Start_Date: '2026-01-01',
    });
    expect(res.status).toBe(201);
    expect(dayjs(res.body.data.Expiry_Date).format('YYYY-MM-DD')).toBe('2026-07-01'); // +6 months
    expect(parseFloat(res.body.data.Amount_Paid)).toBe(500); // defaulted from plan.Amount
    expect(res.body.data.Status).toBe('Active');
    expect(res.body.data.Services_Used).toBe(0);

    const row = await db('tbl_amc_enrollment').where({ Enrollment_ID: res.body.data.Enrollment_ID }).first();
    expect(row.Customer_ID).toBe(customerId);
    expect(row.Plan_ID).toBe(planId);
  });

  test('POST /amc-enrollments defaults Start_Date to today when not supplied, and honors an explicit Amount_Paid override', async () => {
    const res = await request(app).post('/api/insurance-amc/amc-enrollments').set(auth()).send({
      Customer_ID: customerId, Plan_ID: planId, Amount_Paid: 350,
    });
    expect(res.status).toBe(201);
    expect(res.body.data.Start_Date).toBe(dayjs().format('YYYY-MM-DD'));
    expect(parseFloat(res.body.data.Amount_Paid)).toBe(350);
  });

  test('GET /amc-enrollments filters by customerId/status and includes joined Plan_Name + Free_Services_Included', async () => {
    const res = await request(app).get('/api/insurance-amc/amc-enrollments').set(auth()).query({ customerId, status: 'Active' });
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
    expect(res.body.data.every((r) => r.Customer_ID === customerId && r.Status === 'Active')).toBe(true);
    expect(res.body.data[0].Plan_Name).toBeDefined();
    expect(res.body.data[0].Free_Services_Included).toBeDefined();
  });

  test('POST /amc-enrollments/:id/service logs a visit: stamps Last_Service_Date and increments Services_Used', async () => {
    const enroll = await request(app).post('/api/insurance-amc/amc-enrollments').set(auth()).send({
      Customer_ID: customerId, Plan_ID: planId, Start_Date: '2026-01-01',
    });
    const enrollmentId = enroll.body.data.Enrollment_ID;
    expect(enroll.body.data.Services_Used).toBe(0);

    const first = await request(app).post(`/api/insurance-amc/amc-enrollments/${enrollmentId}/service`).set(auth()).send({});
    expect(first.status).toBe(200);
    expect(first.body.data.Services_Used).toBe(1);
    expect(first.body.data.Last_Service_Date).toBe(dayjs().format('YYYY-MM-DD'));

    const second = await request(app).post(`/api/insurance-amc/amc-enrollments/${enrollmentId}/service`).set(auth()).send({});
    expect(second.status).toBe(200);
    expect(second.body.data.Services_Used).toBe(2);

    const row = await db('tbl_amc_enrollment').where({ Enrollment_ID: enrollmentId }).first();
    expect(row.Services_Used).toBe(2);
  });

  test('POST /amc-enrollments/:id/service 404s for a non-existent enrollment', async () => {
    const res = await request(app).post('/api/insurance-amc/amc-enrollments/999999999/service').set(auth()).send({});
    expect(res.status).toBe(404);
  });

  test('POST /amc-enrollments/:id/service rejects logging against a non-Active enrollment', async () => {
    const enroll = await request(app).post('/api/insurance-amc/amc-enrollments').set(auth()).send({
      Customer_ID: customerId, Plan_ID: planId, Start_Date: '2026-01-01',
    });
    const enrollmentId = enroll.body.data.Enrollment_ID;
    await db('tbl_amc_enrollment').where({ Enrollment_ID: enrollmentId }).update({ Status: 'Cancelled' });

    const res = await request(app).post(`/api/insurance-amc/amc-enrollments/${enrollmentId}/service`).set(auth()).send({});
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Cancelled/);

    // Confirm it really didn't touch the row.
    const row = await db('tbl_amc_enrollment').where({ Enrollment_ID: enrollmentId }).first();
    expect(row.Services_Used).toBe(0);
    expect(row.Last_Service_Date).toBeNull();
  });

  // BUG: the route only checks Status === 'Active' — it never checks
  // Services_Used against the plan's Free_Services_Included allowance, and
  // never checks the enrollment's own Expiry_Date. An Active enrollment can
  // have service visits logged against it indefinitely, far beyond its
  // "free services included" allowance, and even after its Expiry_Date has
  // passed (as long as nothing else has flipped Status away from 'Active').
  test('BUG: service visits can be logged past the plan\'s Free_Services_Included allowance with no cap enforced', async () => {
    const enroll = await request(app).post('/api/insurance-amc/amc-enrollments').set(auth()).send({
      Customer_ID: customerId, Plan_ID: planId, Start_Date: '2026-01-01', // plan allows only 1 free service
    });
    const enrollmentId = enroll.body.data.Enrollment_ID;

    for (let i = 0; i < 3; i++) {
      const res = await request(app).post(`/api/insurance-amc/amc-enrollments/${enrollmentId}/service`).set(auth()).send({});
      expect(res.status).toBe(200); // no rejection even beyond the 1 free service included
    }

    const row = await db('tbl_amc_enrollment').where({ Enrollment_ID: enrollmentId }).first();
    expect(row.Services_Used).toBe(3); // 3 used against a plan with Free_Services_Included = 1
  });

  test('BUG: service visits can still be logged after Expiry_Date has passed, as long as Status is still Active', async () => {
    const enroll = await request(app).post('/api/insurance-amc/amc-enrollments').set(auth()).send({
      Customer_ID: customerId, Plan_ID: planId, Start_Date: '2020-01-01', // long expired by real Expiry_Date math
    });
    const enrollmentId = enroll.body.data.Enrollment_ID;
    expect(dayjs(enroll.body.data.Expiry_Date).isBefore(dayjs())).toBe(true); // genuinely in the past
    expect(enroll.body.data.Status).toBe('Active'); // nothing ever auto-expires it

    const res = await request(app).post(`/api/insurance-amc/amc-enrollments/${enrollmentId}/service`).set(auth()).send({});
    expect(res.status).toBe(200); // still allowed despite the expired date
  });
});
