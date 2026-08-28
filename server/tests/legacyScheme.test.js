/**
 * Legacy in-store gold savings scheme (`src/routes/scheme.js`, mounted at
 * /api/scheme) — had ZERO test coverage despite handling real money
 * collection. This is a genuinely SEPARATE data model from the mobile
 * savings-scheme app (`savingsScheme.js` / `savingsAppCore.js`, mounted
 * elsewhere): that module owns tbl_scheme_master / tbl_scheme_members /
 * tbl_scheme_transactions / tbl_scheme_groups / tbl_scheme_accounting_entries
 * etc., while this legacy route owns its own, differently-named tables —
 * tbl_saving_scheme_master, tbl_saving_scheme_enrollment and
 * tbl_scheme_installments (confirmed via migration
 * 005_add_missing_modules.js) — no shared tables, no shared rows. Also
 * confirmed by reading the route: unlike the mobile module's payment
 * collection, this legacy /pay-installment does NOT post anything to the
 * accounting ledger (no tbl_accounting_journal / tbl_accounting_entries
 * writes anywhere in scheme.js) — it only updates the installment and
 * enrollment rows directly, so there is nothing ledger-side to assert here.
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
    Customer_Name: 'QA Legacy Scheme Customer', Mobile_1: '9001100011',
  });
  customerId = cust.body.data.Customer_ID;
});

afterAll(async () => {
  // Children before parents — scheme.js's own tables aren't in testTenant's
  // teardown() list since that helper predates this route getting tests.
  await db('tbl_scheme_installments').where({ Tenant_ID: tenant.tenantId }).del();
  await db('tbl_saving_scheme_enrollment').where({ Tenant_ID: tenant.tenantId }).del();
  await db('tbl_saving_scheme_master').where({ Tenant_ID: tenant.tenantId }).del();
  await testTenant.teardown();
  await db.destroy();
});

test('POST /api/scheme requires Scheme_Code, Scheme_Name, Duration_Months, Monthly_Amount', async () => {
  const res = await request(app).post('/api/scheme').set(auth()).send({ Scheme_Name: 'Incomplete' });
  expect(res.status).toBe(422);
  const fields = res.body.errors.map((e) => e.field);
  expect(fields).toEqual(expect.arrayContaining(['Scheme_Code', 'Duration_Months', 'Monthly_Amount']));
});

test('POST /api/scheme creates a scheme in tbl_saving_scheme_master with the right defaults', async () => {
  const res = await request(app).post('/api/scheme').set(auth()).send({
    Scheme_Code: 'QA-GS11', Scheme_Name: 'QA Gold Savings 11+1', Duration_Months: 11, Monthly_Amount: 2000,
  });
  expect(res.status).toBe(201);
  expect(res.body.data.Scheme_ID).toBeDefined();

  const row = await db('tbl_saving_scheme_master').where({ Scheme_ID: res.body.data.Scheme_ID }).first();
  expect(row.Tenant_ID).toBe(tenant.tenantId);
  expect(row.Scheme_Code).toBe('QA-GS11');
  expect(parseInt(row.Duration_Months)).toBe(11);
  expect(parseFloat(row.Monthly_Amount)).toBe(2000);
  expect(parseInt(row.Free_Months)).toBe(1); // DB default — not sent in the body
  expect(row.Is_Active).toBe(true);
  expect(row.Created_By).toBe(tenant.username);
});

test('POST /api/scheme rejects a duplicate Scheme_Code for the same tenant', async () => {
  const res = await request(app).post('/api/scheme').set(auth()).send({
    Scheme_Code: 'QA-GS11', Scheme_Name: 'Duplicate code attempt', Duration_Months: 11, Monthly_Amount: 2000,
  });
  expect(res.status).toBe(409);
});

test('GET /api/scheme lists only this tenant\'s active schemes', async () => {
  const res = await request(app).get('/api/scheme').set(auth());
  expect(res.status).toBe(200);
  const row = res.body.data.find((s) => s.Scheme_Code === 'QA-GS11');
  expect(row).toBeDefined();
  expect(row.Tenant_ID).toBe(tenant.tenantId);
});

describe('enrollment + installment schedule generation', () => {
  let schemeId, enrollmentId, startDate;

  beforeAll(async () => {
    // A short, easy-to-verify-by-hand scheme: 3 months + 1 free month.
    const scheme = await request(app).post('/api/scheme').set(auth()).send({
      Scheme_Code: 'QA-SHORT3', Scheme_Name: 'QA Short 3+1', Duration_Months: 3, Monthly_Amount: 1000,
    });
    schemeId = scheme.body.data.Scheme_ID;
    startDate = '2026-01-15';
  });

  test('POST /api/scheme/enroll requires Scheme_ID, Customer_ID, Start_Date', async () => {
    const res = await request(app).post('/api/scheme/enroll').set(auth()).send({});
    expect(res.status).toBe(422);
  });

  test('POST /api/scheme/enroll 404s for a non-existent scheme', async () => {
    const res = await request(app).post('/api/scheme/enroll').set(auth()).send({
      Scheme_ID: 999999, Customer_ID: customerId, Start_Date: startDate,
    });
    expect(res.status).toBe(404);
  });

  test('POST /api/scheme/enroll creates the enrollment row and its full installment schedule, matching the scheme\'s own parameters', async () => {
    const res = await request(app).post('/api/scheme/enroll').set(auth()).send({
      Scheme_ID: schemeId, Customer_ID: customerId, Start_Date: startDate,
    });
    expect(res.status).toBe(201);
    expect(res.body.data.installmentsCreated).toBe(3); // == Duration_Months

    const enrollment = res.body.data.enrollment;
    enrollmentId = enrollment.Enrollment_ID;

    expect(enrollment.Tenant_ID).toBe(tenant.tenantId);
    expect(enrollment.Scheme_ID).toBe(schemeId);
    expect(enrollment.Customer_ID).toBe(customerId);
    expect(enrollment.Enrollment_Number).toBe('ENR-QATEST-00001'); // Tenant_ID has no underscore to strip
    expect(enrollment.Status).toBe('Active');
    expect(parseInt(enrollment.Total_Installments)).toBe(3);
    expect(parseFloat(enrollment.Monthly_Amount)).toBe(1000);
    // Maturity_Value = Monthly_Amount * (Duration_Months + Free_Months) = 1000 * (3 + 1)
    expect(parseFloat(enrollment.Maturity_Value)).toBe(4000);
    // Maturity_Date = Start_Date + Duration_Months + Free_Months = 2026-01-15 + 4 months
    expect(dayjs(enrollment.Maturity_Date).format('YYYY-MM-DD')).toBe(dayjs(startDate).add(4, 'month').format('YYYY-MM-DD'));

    // Verify the DB row directly too, not just the response body.
    const dbEnrollment = await db('tbl_saving_scheme_enrollment').where({ Enrollment_ID: enrollmentId }).first();
    expect(dbEnrollment.Enrollment_Number).toBe('ENR-QATEST-00001');
    expect(parseInt(dbEnrollment.Installments_Paid)).toBe(0);
    expect(parseFloat(dbEnrollment.Total_Amount_Paid)).toBe(0);

    // Verify the generated installment schedule is mathematically correct.
    const installments = await db('tbl_scheme_installments').where({ Enrollment_ID: enrollmentId }).orderBy('Installment_No', 'asc');
    expect(installments.length).toBe(3);
    installments.forEach((inst, i) => {
      expect(inst.Installment_No).toBe(i + 1);
      expect(parseFloat(inst.Amount)).toBe(1000);
      expect(inst.Status).toBe('Pending');
      expect(dayjs(inst.Due_Date).format('YYYY-MM-DD')).toBe(dayjs(startDate).add(i + 1, 'month').format('YYYY-MM-DD'));
    });
  });

  test('a second enrollment (different scheme/customer) gets the next sequential Enrollment_Number', async () => {
    const scheme2 = await request(app).post('/api/scheme').set(auth()).send({
      Scheme_Code: 'QA-SHORT3-B', Scheme_Name: 'QA Short 3+1 (second)', Duration_Months: 2, Monthly_Amount: 500,
    });
    const res = await request(app).post('/api/scheme/enroll').set(auth()).send({
      Scheme_ID: scheme2.body.data.Scheme_ID, Customer_ID: customerId, Start_Date: startDate,
    });
    expect(res.status).toBe(201);
    expect(res.body.data.enrollment.Enrollment_Number).toBe('ENR-QATEST-00002');
  });

  test('GET /api/scheme/enrollments returns joined customer + scheme names, filterable by customerId and status', async () => {
    const res = await request(app).get('/api/scheme/enrollments').set(auth()).query({ customerId, status: 'Active' });
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(2);
    const row = res.body.data.find((e) => e.Enrollment_ID === enrollmentId);
    expect(row).toBeDefined();
    expect(row.Customer_Name).toBe('QA Legacy Scheme Customer');
    expect(row.Scheme_Name).toBe('QA Short 3+1');
    expect(row.Status).toBe('Active');
  });

  describe('paying installments', () => {
    let installmentIds;

    beforeAll(async () => {
      const rows = await db('tbl_scheme_installments').where({ Enrollment_ID: enrollmentId }).orderBy('Installment_No', 'asc');
      installmentIds = rows.map((r) => r.Installment_ID);
    });

    test('POST /api/scheme/pay-installment requires Installment_ID and Payment_Mode', async () => {
      const res = await request(app).post('/api/scheme/pay-installment').set(auth()).send({});
      expect(res.status).toBe(422);
    });

    test('POST /api/scheme/pay-installment 404s for a non-existent installment', async () => {
      const res = await request(app).post('/api/scheme/pay-installment').set(auth()).send({
        Installment_ID: 999999999, Payment_Mode: 'Cash',
      });
      expect(res.status).toBe(404);
    });

    test('paying installment #1 marks it Paid and updates the enrollment running totals, staying Active', async () => {
      const res = await request(app).post('/api/scheme/pay-installment').set(auth()).send({
        Installment_ID: installmentIds[0], Payment_Mode: 'Cash', Receipt_Number: 'QA-RCPT-001',
      });
      expect(res.status).toBe(200);

      const inst = await db('tbl_scheme_installments').where({ Installment_ID: installmentIds[0] }).first();
      expect(inst.Status).toBe('Paid');
      expect(inst.Paid_Date).not.toBeNull();
      expect(inst.Payment_Mode).toBe('Cash');
      expect(inst.Receipt_Number).toBe('QA-RCPT-001');

      const enrollment = await db('tbl_saving_scheme_enrollment').where({ Enrollment_ID: enrollmentId }).first();
      expect(parseInt(enrollment.Installments_Paid)).toBe(1);
      expect(parseFloat(enrollment.Total_Amount_Paid)).toBe(1000);
      expect(enrollment.Status).toBe('Active'); // 2 installments still pending
    });

    test('paying installment #2 accumulates the running total further, still Active', async () => {
      const res = await request(app).post('/api/scheme/pay-installment').set(auth()).send({
        Installment_ID: installmentIds[1], Payment_Mode: 'UPI',
      });
      expect(res.status).toBe(200);

      const enrollment = await db('tbl_saving_scheme_enrollment').where({ Enrollment_ID: enrollmentId }).first();
      expect(parseInt(enrollment.Installments_Paid)).toBe(2);
      expect(parseFloat(enrollment.Total_Amount_Paid)).toBe(2000);
      expect(enrollment.Status).toBe('Active'); // 1 installment still pending
    });

    test('paying the final installment (#3) marks the enrollment Matured', async () => {
      const res = await request(app).post('/api/scheme/pay-installment').set(auth()).send({
        Installment_ID: installmentIds[2], Payment_Mode: 'Cash',
      });
      expect(res.status).toBe(200);

      const enrollment = await db('tbl_saving_scheme_enrollment').where({ Enrollment_ID: enrollmentId }).first();
      expect(parseInt(enrollment.Installments_Paid)).toBe(3);
      expect(parseFloat(enrollment.Total_Amount_Paid)).toBe(3000);
      expect(enrollment.Status).toBe('Matured'); // no installments left pending

      const pendingCount = await db('tbl_scheme_installments').where({ Enrollment_ID: enrollmentId, Status: 'Pending' }).count('Installment_ID as c').first();
      expect(parseInt(pendingCount.c)).toBe(0);
    });

    test('GET /api/scheme/enrollments?status=Matured now reflects the matured enrollment', async () => {
      const res = await request(app).get('/api/scheme/enrollments').set(auth()).query({ status: 'Matured' });
      expect(res.status).toBe(200);
      const row = res.body.data.find((e) => e.Enrollment_ID === enrollmentId);
      expect(row).toBeDefined();
      expect(row.Status).toBe('Matured');
    });
  });
});
