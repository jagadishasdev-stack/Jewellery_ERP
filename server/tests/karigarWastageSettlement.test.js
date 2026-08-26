/**
 * Karigar wastage/settlement had several compounding real-money bugs:
 *   - Wastage was deducted from wages at the WAGES rate instead of the
 *     GOLD rate (~100x under-recovery).
 *   - Wastage_Allowed_Percent was captured and shown on screen but never
 *     enforced — 100% of wastage was deducted regardless of allowance.
 *   - An issue with any wastage could never reach 'Completed' (returned
 *     alone was compared against issued, ignoring wastage).
 *   - Nothing stopped a return from booking more gold than was
 *     outstanding on the issue.
 *   - Settlement took a client-supplied amount on trust and never marked
 *     anything settled — re-running the same date range re-paid it.
 */
const request = require('supertest');
const { app } = require('../src/index');
const db = require('../src/db/knex');
const testTenant = require('./helpers/testTenant');

let tenant, token, karigarId;
const auth = () => ({ Authorization: `Bearer ${token}` });

beforeAll(async () => {
  tenant = await testTenant.setup();
  const res = await request(app).post('/api/auth/login').send({ username: tenant.username, password: tenant.password, tenantId: tenant.tenantId });
  token = res.body.data.token;

  const vendor = await request(app).post('/api/karigar/vendor').set(auth()).send({
    Vendor_Name: 'QA Wastage Karigar', Vendor_Type: 'Karigar', Mobile_1: '9990001112',
  });
  karigarId = vendor.body.data.Vendor_ID;
});

afterAll(async () => {
  await testTenant.teardown();
  await db.destroy();
});

test('issuing gold posts a real Dr Gold with Karigar / Cr Gold Stock journal', async () => {
  const issue = await request(app).post('/api/karigar/issue').set(auth()).send({
    Karigar_ID: karigarId, Gold_Weight_Issued: 100, Gold_Rate_At_Issue: 6000, Karigar_Wages_Rate: 200,
    Wastage_Allowed_Percent: 3, Issue_Date: '2026-08-20',
  });
  expect(issue.status).toBe(201);
  const journal = await db('tbl_accounting_journal').where({ Tenant_ID: tenant.tenantId, Reference: `KARIGAR-ISSUE-${issue.body.data.Issue_Number}` }).first();
  expect(journal).toBeDefined();
  const entries = await db('tbl_accounting_entries').where({ Journal_ID: journal.Journal_ID });
  const drLine = entries.find((e) => e.Ledger_Account === 'Gold with Karigar Account');
  expect(parseFloat(drLine.Amount)).toBe(600000); // 100g * 6000
});

test('a return exceeding what\'s outstanding on the issue is rejected', async () => {
  const issue = await request(app).post('/api/karigar/issue').set(auth()).send({
    Karigar_ID: karigarId, Gold_Weight_Issued: 10, Gold_Rate_At_Issue: 6000, Karigar_Wages_Rate: 200,
    Wastage_Allowed_Percent: 2, Issue_Date: '2026-08-20',
  });
  const res = await request(app).post('/api/karigar/return').set(auth()).send({
    Issue_ID: issue.body.data.Issue_ID, Gross_Weight_Returned: 9, Net_Gold_Weight: 9, Wastage_Weight: 2, Return_Date: '2026-08-21',
  });
  expect(res.status).toBe(400);
  expect(res.body.message).toMatch(/exceeds/);
});

test('an issue with legitimate wastage reaches Completed once returned+wastage account for everything issued', async () => {
  const issue = await request(app).post('/api/karigar/issue').set(auth()).send({
    Karigar_ID: karigarId, Gold_Weight_Issued: 10, Gold_Rate_At_Issue: 6000, Karigar_Wages_Rate: 200,
    Wastage_Allowed_Percent: 2, Issue_Date: '2026-08-20',
  });
  const ret = await request(app).post('/api/karigar/return').set(auth()).send({
    Issue_ID: issue.body.data.Issue_ID, Gross_Weight_Returned: 9.7, Net_Gold_Weight: 9.7, Wastage_Weight: 0.3,
    Gold_Rate_At_Return: 6100, Return_Date: '2026-08-21',
  });
  expect(ret.status).toBe(201);
  const updatedIssue = await db('tbl_issue_to_karigar').where({ Issue_ID: issue.body.data.Issue_ID }).first();
  expect(updatedIssue.Status).toBe('Completed'); // old logic: stuck at Partial forever since 9.7 < 10
  expect(parseFloat(updatedIssue.Missing_Weight)).toBe(0);

  // Return-side journal: Dr Gold Stock (returned value) + Dr Wastage Expense, Cr Gold with Karigar
  const journal = await db('tbl_accounting_journal').where({ Tenant_ID: tenant.tenantId, Reference: `KARIGAR-RETURN-${ret.body.data.Return_Number}` }).first();
  const entries = await db('tbl_accounting_entries').where({ Journal_ID: journal.Journal_ID });
  const wastageLine = entries.find((e) => e.Ledger_Account === 'Karigar Wastage Expense Account');
  expect(parseFloat(wastageLine.Amount)).toBe(1830); // 0.3g * 6100
  const totalDr = entries.filter((e) => e.Entry_Type === 'Dr').reduce((s, e) => s + parseFloat(e.Amount), 0);
  const totalCr = entries.filter((e) => e.Entry_Type === 'Cr').reduce((s, e) => s + parseFloat(e.Amount), 0);
  expect(totalDr).toBe(totalCr);
});

test('settlement deducts wastage at the GOLD rate, only for wastage EXCEEDING the allowed %, and settling twice never double-pays', async () => {
  // Issue 20g, 2% allowed (= 0.4g free). Return 19g with 1g wastage —
  // 0.6g is over the allowance.
  const issue = await request(app).post('/api/karigar/issue').set(auth()).send({
    Karigar_ID: karigarId, Gold_Weight_Issued: 20, Gold_Rate_At_Issue: 6000, Karigar_Wages_Rate: 300,
    Wastage_Allowed_Percent: 2, Issue_Date: '2026-08-22',
  });
  await request(app).post('/api/karigar/return').set(auth()).send({
    Issue_ID: issue.body.data.Issue_ID, Gross_Weight_Returned: 19, Net_Gold_Weight: 19, Wastage_Weight: 1,
    Gold_Rate_At_Return: 6200, Return_Date: '2026-08-23',
  });

  const preview = await request(app).get('/api/karigar/settlement').set(auth()).query({ karigarId, fromDate: '2026-08-23', toDate: '2026-08-23' });
  expect(preview.status).toBe(200);
  const row = preview.body.data.items.find((i) => i.Issue_ID === issue.body.data.Issue_ID);
  expect(row).toBeDefined();
  expect(parseFloat(row.Deductible_Wastage_Weight)).toBeCloseTo(0.6, 5); // 1g - (20g * 2%)
  expect(parseFloat(row.Wastage_Deduction)).toBeCloseTo(0.6 * 6200, 2); // at GOLD rate, not wages rate (300)
  expect(parseFloat(row.Gross_Wages)).toBe(19 * 300);
  expect(parseFloat(row.Net_Wages)).toBeCloseTo((19 * 300) - (0.6 * 6200), 2);

  const settle1 = await request(app).post('/api/karigar/settle').set(auth()).send({
    karigarId, fromDate: '2026-08-23', toDate: '2026-08-23', paymentMode: 'Cash',
  });
  expect(settle1.status).toBe(200);
  expect(settle1.body.data.issuesSettled).toBeGreaterThanOrEqual(1);

  const settledIssue = await db('tbl_issue_to_karigar').where({ Issue_ID: issue.body.data.Issue_ID }).first();
  expect(settledIssue.Is_Settled).toBe(true);
  expect(parseFloat(settledIssue.Final_Wages_Paid)).toBeCloseTo((19 * 300) - (0.6 * 6200), 2);

  // Re-running the SAME date range must not re-settle the same issue.
  const settle2 = await request(app).post('/api/karigar/settle').set(auth()).send({
    karigarId, fromDate: '2026-08-23', toDate: '2026-08-23', paymentMode: 'Cash',
  });
  expect(settle2.status).toBe(400);
  expect(settle2.body.message).toMatch(/Nothing to settle/);

  // And the same issue no longer appears in a fresh preview either.
  const preview2 = await request(app).get('/api/karigar/settlement').set(auth()).query({ karigarId, fromDate: '2026-08-23', toDate: '2026-08-23' });
  expect(preview2.body.data.items.find((i) => i.Issue_ID === issue.body.data.Issue_ID)).toBeUndefined();
});
