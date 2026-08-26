/**
 * Multi-Branch Management — HR/Payroll. tbl_payroll_run already had
 * Branch_ID and a (Tenant_ID, Branch_ID, Pay_Month, Pay_Year) uniqueness
 * check, but a branch-scoped run still computed payroll for EVERY active
 * employee tenant-wide — a real bug (a "HSR payroll" run would have
 * silently also paid Kanakapura's staff). Confirms the fix: a
 * branch-scoped run only pays that branch's own staff.
 */
const request = require('supertest');
const { app } = require('../src/index');
const db = require('../src/db/knex');
const testTenant = require('./helpers/testTenant');

let tenant, token, branchA, branchB, empA, empB;
const authAs = (branchId) => ({ Authorization: `Bearer ${token}`, ...(branchId ? { 'X-Branch-ID': branchId } : {}) });

beforeAll(async () => {
  tenant = await testTenant.setup();
  const login = await request(app).post('/api/auth/login').send({ username: tenant.username, password: tenant.password, tenantId: tenant.tenantId });
  token = login.body.data.token;

  branchA = `${tenant.tenantId}_HRA`;
  branchB = `${tenant.tenantId}_HRB`;
  await db('tbl_branch_master').insert([
    { Branch_ID: branchA, Tenant_ID: tenant.tenantId, Branch_Name: 'QA HR Branch A', Branch_Code: 'HRA', Is_Active: true },
    { Branch_ID: branchB, Tenant_ID: tenant.tenantId, Branch_Name: 'QA HR Branch B', Branch_Code: 'HRB', Is_Active: true },
  ]);

  const role = await db('tbl_role_master').where({ Role_Name: 'Billing Operator' }).first();
  const [a] = await db('tbl_user_master').insert({
    Tenant_ID: tenant.tenantId, Username: 'qa_hr_emp_a', Password_Hash: 'x', Password_Salt: 'x',
    Role_ID: role.Role_ID, Full_Name: 'QA HR Employee A', Is_Active: true, Branch_ID: branchA,
  }).returning('User_ID');
  const [b] = await db('tbl_user_master').insert({
    Tenant_ID: tenant.tenantId, Username: 'qa_hr_emp_b', Password_Hash: 'x', Password_Salt: 'x',
    Role_ID: role.Role_ID, Full_Name: 'QA HR Employee B', Is_Active: true, Branch_ID: branchB,
  }).returning('User_ID');
  empA = a.User_ID; empB = b.User_ID;

  await db('tbl_salary_structure').insert([
    { User_ID: empA, Basic: 20000, Effective_From: '2020-01-01', Is_Active: true },
    { User_ID: empB, Basic: 25000, Effective_From: '2020-01-01', Is_Active: true },
  ]);
});

afterAll(async () => {
  await db('tbl_payroll_details').whereIn('User_ID', [empA, empB]).del();
  await db('tbl_payroll_run').whereIn('Branch_ID', [branchA, branchB]).del();
  await db('tbl_salary_structure').whereIn('User_ID', [empA, empB]).del();
  await db('tbl_user_master').whereIn('User_ID', [empA, empB]).del();
  await db('tbl_branch_master').whereIn('Branch_ID', [branchA, branchB]).del();
  await testTenant.teardown();
  await db.destroy();
});

test('a payroll run scoped to Branch A only includes Branch A\'s own staff, not Branch B\'s', async () => {
  const res = await request(app).post('/api/hr/payroll/runs').set(authAs(branchA)).send({ Pay_Month: 6, Pay_Year: 2026 });
  expect(res.status).toBe(201);
  expect(res.body.data.Branch_ID).toBe(branchA);

  const userIds = res.body.data.details.map(d => d.User_ID);
  expect(userIds).toContain(empA);
  expect(userIds).not.toContain(empB);
});

test('GET /payroll/runs is isolated per branch', async () => {
  const listA = await request(app).get('/api/hr/payroll/runs').set(authAs(branchA));
  const listB = await request(app).get('/api/hr/payroll/runs').set(authAs(branchB));
  expect(listA.body.data.some(r => r.Branch_ID === branchA)).toBe(true);
  expect(listB.body.data.some(r => r.Branch_ID === branchA)).toBe(false);
});
