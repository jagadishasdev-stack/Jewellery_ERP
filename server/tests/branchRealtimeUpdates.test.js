/**
 * Multi-Branch Management §34 — real-time dashboard updates. Confirms
 * POST /api/sales/create actually emits 'branch-data-changed' on the
 * real io instance (app.get('io'), the same access pattern goldRate.js
 * already established), to the correct tenant room, with the sale's own
 * Branch_ID — not just that the code compiles, that it actually fires
 * with the right payload on a real sale.
 */
const request = require('supertest');
const { app } = require('../src/index');
const db = require('../src/db/knex');
const testTenant = require('./helpers/testTenant');

let tenant, token, typeId, branchA;
const authAs = () => ({ Authorization: `Bearer ${token}` });

beforeAll(async () => {
  tenant = await testTenant.setup();
  const login = await request(app).post('/api/auth/login').send({ username: tenant.username, password: tenant.password, tenantId: tenant.tenantId });
  token = login.body.data.token;
  typeId = (await db('tbl_item_type_master').first()).Type_ID;

  branchA = `${tenant.tenantId}_RT_A`;
  await db('tbl_branch_master').insert({ Branch_ID: branchA, Tenant_ID: tenant.tenantId, Branch_Name: 'QA Realtime Branch', Branch_Code: 'RTA', Is_Active: true });
});

afterAll(async () => {
  await db('tbl_branch_master').where({ Branch_ID: branchA }).del();
  await testTenant.teardown();
  await db.destroy();
});

test('POST /api/sales/create emits branch-data-changed on the real socket.io instance, to the tenant room, with the sale\'s branch', async () => {
  const io = app.get('io');
  expect(io).toBeDefined(); // confirms app.set('io', io) actually ran — the real prerequisite this feature depends on

  const displayNamespace = io.of('/display');
  const emitSpy = jest.fn();
  const toSpy = jest.spyOn(displayNamespace, 'to').mockImplementation(() => ({ emit: emitSpy }));

  try {
    const ornament = await request(app).post('/api/ornaments').set(authAs()).set('X-Branch-ID', branchA).send({
      Type_ID: typeId, Metal_Type: 'Gold', Gross_Weight: 5, Net_Gold_Weight: 4.5, Current_Gold_Rate: 6000,
      Base_Making_Charge_Per_Gram: 100, Purchase_Cost: 10000, Total_Price: 10000, Article_Number: 'QART-SOCKET-001',
    });
    const sale = await request(app).post('/api/sales/create').set(authAs()).set('X-Branch-ID', branchA).send({
      Payment_Mode: 'Cash',
      items: [{ Ornament_ID: ornament.body.data.Ornament_ID, Article_Number: 'QART-SOCKET-001', Total_Line_Price: 10000 }],
    });
    expect(sale.status).toBe(201);

    expect(toSpy).toHaveBeenCalledWith(`tenant-${tenant.tenantId}`);
    expect(emitSpy).toHaveBeenCalledWith('branch-data-changed', expect.objectContaining({
      branchId: branchA, type: 'sale', tenantId: tenant.tenantId,
    }));
  } finally {
    toSpy.mockRestore();
  }
});
