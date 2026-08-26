/**
 * Multi-Branch Management §19 — branch-specific invoice numbering.
 * Opt-in per tenant (Include_Branch_In_Numbering), off by default.
 * Confirms: off = completely unchanged numbering; on = the branch's own
 * Branch_Code appears in the invoice number AND each branch gets its own
 * independent, correctly-sequential counter (not sharing one counter,
 * not colliding, not skipping).
 */
const request = require('supertest');
const { app } = require('../src/index');
const db = require('../src/db/knex');
const testTenant = require('./helpers/testTenant');

let tenant, token, typeId, branchA, branchB;
const authAs = () => ({ Authorization: `Bearer ${token}` });

beforeAll(async () => {
  tenant = await testTenant.setup();
  const login = await request(app).post('/api/auth/login').send({ username: tenant.username, password: tenant.password, tenantId: tenant.tenantId });
  token = login.body.data.token;
  typeId = (await db('tbl_item_type_master').first()).Type_ID;

  branchA = `${tenant.tenantId}_NUMA`;
  branchB = `${tenant.tenantId}_NUMB`;
  await db('tbl_branch_master').insert([
    { Branch_ID: branchA, Tenant_ID: tenant.tenantId, Branch_Name: 'QA Numbering Branch A', Branch_Code: 'NUMA', Is_Active: true },
    { Branch_ID: branchB, Tenant_ID: tenant.tenantId, Branch_Name: 'QA Numbering Branch B', Branch_Code: 'NUMB', Is_Active: true },
  ]);
});

afterAll(async () => {
  await db('tbl_branch_master').whereIn('Branch_ID', [branchA, branchB]).del();
  await testTenant.teardown();
  await db.destroy();
});

async function sellOneItem(branchId, articleNumber) {
  const ornament = await request(app).post('/api/ornaments').set(authAs()).set(branchId ? { 'X-Branch-ID': branchId } : {}).send({
    Type_ID: typeId, Metal_Type: 'Gold', Gross_Weight: 5, Net_Gold_Weight: 4.5, Current_Gold_Rate: 6000,
    Base_Making_Charge_Per_Gram: 100, Purchase_Cost: 10000, Total_Price: 10000, Article_Number: articleNumber,
  });
  const sale = await request(app).post('/api/sales/create').set(authAs()).set(branchId ? { 'X-Branch-ID': branchId } : {}).send({
    Payment_Mode: 'Cash',
    items: [{ Ornament_ID: ornament.body.data.Ornament_ID, Article_Number: articleNumber, Total_Line_Price: 10000 }],
  });
  return sale.body.data.sale.Invoice_Number;
}

test('Include_Branch_In_Numbering OFF (default): invoice numbers are completely unaffected by branch context', async () => {
  const inv = await sellOneItem(branchA, 'QANUM-OFF-001');
  expect(inv).toMatch(/^INV-/);
  expect(inv).not.toContain('NUMA');
});

test('Include_Branch_In_Numbering ON: the branch code appears in the invoice number, and each branch gets its own independent sequence', async () => {
  await db('tbl_tenant_master').where({ Tenant_ID: tenant.tenantId }).update({ Include_Branch_In_Numbering: true });

  const invA1 = await sellOneItem(branchA, 'QANUM-ON-A1');
  const invB1 = await sellOneItem(branchB, 'QANUM-ON-B1');
  const invA2 = await sellOneItem(branchA, 'QANUM-ON-A2');

  expect(invA1).toContain('-NUMA-');
  expect(invB1).toContain('-NUMB-');
  expect(invA2).toContain('-NUMA-');

  // Branch A's second invoice is exactly one more than its first —
  // proves it has its own counter, not one shared/interleaved with B's.
  const seqA1 = parseInt(invA1.split('-').pop(), 10);
  const seqA2 = parseInt(invA2.split('-').pop(), 10);
  expect(seqA2).toBe(seqA1 + 1);

  // A sale with NO branch context active still numbers the old way even
  // with the toggle on — the toggle only ever adds a segment when there's
  // an actual branch to name.
  const invNoBranch = await sellOneItem(null, 'QANUM-ON-NOBRANCH');
  expect(invNoBranch).not.toMatch(/-NUM[AB]-/);

  await db('tbl_tenant_master').where({ Tenant_ID: tenant.tenantId }).update({ Include_Branch_In_Numbering: false });
});
