/**
 * Multi-Branch Management — Karigar Return and Old Gold Exchange. Neither
 * table had a Branch_ID column at all before this. Also confirms a real
 * cross-tenant gap found and fixed alongside it: POST /karigar/return
 * looked up the parent issue with NO Tenant_ID filter.
 */
const request = require('supertest');
const { app } = require('../src/index');
const db = require('../src/db/knex');
const testTenant = require('./helpers/testTenant');
const dayjs = require('dayjs');

let tenant, token, karigarId, branchA;
const authAs = (branchId) => ({ Authorization: `Bearer ${token}`, ...(branchId ? { 'X-Branch-ID': branchId } : {}) });

beforeAll(async () => {
  tenant = await testTenant.setup();
  const login = await request(app).post('/api/auth/login').send({ username: tenant.username, password: tenant.password, tenantId: tenant.tenantId });
  token = login.body.data.token;

  branchA = `${tenant.tenantId}_KRA`;
  await db('tbl_branch_master').insert({ Branch_ID: branchA, Tenant_ID: tenant.tenantId, Branch_Name: 'QA Karigar Return Branch', Branch_Code: 'KRA', Is_Active: true });

  const karigar = await request(app).post('/api/karigar/vendor').set(authAs()).send({
    Vendor_Name: 'QA Return Karigar', Vendor_Type: 'Karigar', Mobile_1: '9000000094',
  });
  karigarId = karigar.body.data.Vendor_ID;
});

afterAll(async () => {
  await db('tbl_branch_master').where({ Branch_ID: branchA }).del();
  await testTenant.teardown();
  await db.destroy();
});

test('a return inherits its Branch_ID from the parent issue, not the caller\'s current context', async () => {
  const issue = await request(app).post('/api/karigar/issue').set(authAs(branchA)).send({
    Karigar_ID: karigarId, Gold_Weight_Issued: 50, Gold_Rate_At_Issue: 6000, Issue_Date: dayjs().format('YYYY-MM-DD'),
  });
  expect(issue.body.data.Branch_ID).toBe(branchA);

  // Processing the return with NO branch context active — the return must
  // still inherit branchA from the issue, not come back branchless.
  const ret = await request(app).post('/api/karigar/return').set(authAs(null)).send({
    Issue_ID: issue.body.data.Issue_ID, Gross_Weight_Returned: 48, Net_Gold_Weight: 47,
    Return_Date: dayjs().format('YYYY-MM-DD'),
  });
  expect(ret.status).toBe(201);
  expect(ret.body.data.Branch_ID).toBe(branchA);
});

test('CRITICAL (cross-tenant): a return cannot be processed against a REAL OTHER tenant\'s issue by guessing its ID', async () => {
  const dljIssue = await db('tbl_issue_to_karigar').where({ Tenant_ID: 'DLJ' }).first();
  if (!dljIssue) return; // nothing to check against in this environment

  const res = await request(app).post('/api/karigar/return').set(authAs()).send({
    Issue_ID: dljIssue.Issue_ID, Gross_Weight_Returned: 1, Net_Gold_Weight: 1,
    Return_Date: dayjs().format('YYYY-MM-DD'),
  });
  expect(res.status).toBe(404);

  // And confirm DLJ's real issue record is genuinely untouched.
  const stillThere = await db('tbl_issue_to_karigar').where({ Issue_ID: dljIssue.Issue_ID }).first();
  expect(stillThere.Status).toBe(dljIssue.Status);
  expect(parseFloat(stillThere.Returned_Weight || 0)).toBe(parseFloat(dljIssue.Returned_Weight || 0));
});

test('Old Gold Exchange stamps Branch_ID from the active branch context', async () => {
  const res = await request(app).post('/api/old-gold/exchange').set(authAs(branchA)).send({
    Old_Gold_Weight: 10, Purity_Percentage: 91.6, Gold_Rate_At_Exchange: 6000,
  });
  expect(res.status).toBe(201);
  expect(res.body.data.Branch_ID).toBe(branchA);
});
