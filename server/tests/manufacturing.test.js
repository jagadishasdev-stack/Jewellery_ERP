/**
 * Manufacturing Efficiency / BOM module (src/routes/manufacturing.js) — 13
 * endpoints across Departments, BOM (+ department stages), Production
 * transactions, Melting/Refining log, and Mould/Rubber BOM stock. Before
 * this file the only thing that ever touched these routes was a single
 * generic permission-gate smoke test (moduleOverrideFullCoverage.test.js),
 * which only checks the 403/next() branch of requireModuleAccess and never
 * exercises what the routes actually do to the database.
 *
 * Real behaviors verified here, read straight from the route code:
 *  - Departments: plain tenant-scoped create + list (Is_Active filter,
 *    ordered by Sequence_No).
 *  - BOM: header + child `stages` array inserted together; Sequence_No is
 *    auto-assigned from array position when not supplied; GET /bom/:id
 *    joins in Dept_Name and orders stages by Sequence_No; GET /bom supports
 *    an optional designId filter.
 *  - Production transactions: opened as 'In Progress'; PUT .../complete
 *    DERIVES Wastage_Weight/Wastage_Pct from Input_Weight vs the posted
 *    Output_Weight (the caller never sends wastage directly), and clamps
 *    wastage at 0 when output somehow exceeds input.
 *  - Melting/Refining log: same derive-the-loss-from-in/out pattern, and
 *    Loss_Weight/Loss_Pct are left at 0/null when Weight_Out isn't given
 *    yet (an open melt).
 *  - Mould stock: create, then `increment`-based delta updates (both up
 *    and down).
 *
 * Genuine gaps noticed while reading the code (flagged, not fixed, and not
 * asserted as if they were real behavior):
 *  - PUT /production/:id/complete has NO side effects beyond the txn row
 *    itself: it does not deduct any raw-material/bin stock, and does not
 *    create or update any tbl_ornament_master row for the output. The
 *    route comment even says "records the actual output weight" — nothing
 *    about stock at all. If manufacturing is meant to feed stock, that
 *    wiring doesn't exist yet.
 *  - PUT /moulds/:id/stock uses a plain unguarded `.increment()` — a
 *    negative `delta` larger than the current Stock_Qty drives it below
 *    zero with no floor/validation.
 */
const request = require('supertest');
const dayjs = require('dayjs');
const { app } = require('../src/index');
const db = require('../src/db/knex');
const testTenant = require('./helpers/testTenant');

let tenant, token;
const auth = () => ({ Authorization: `Bearer ${token}` });
const today = () => dayjs().format('YYYY-MM-DD');

beforeAll(async () => {
  tenant = await testTenant.setup();
  const res = await request(app).post('/api/auth/login').send({ username: tenant.username, password: tenant.password, tenantId: tenant.tenantId });
  token = res.body.data.token;
});

afterAll(async () => {
  // Manufacturing tables aren't covered by testTenant.teardown() itself —
  // clean them up here, children before parents.
  await db('tbl_production_transaction').where({ Tenant_ID: tenant.tenantId }).del();
  await db('tbl_bom_department_stages')
    .whereIn('BOM_ID', db('tbl_bom_master').where({ Tenant_ID: tenant.tenantId }).select('BOM_ID'))
    .del();
  await db('tbl_melting_refining_log').where({ Tenant_ID: tenant.tenantId }).del();
  await db('tbl_mould_bom_stock').where({ Tenant_ID: tenant.tenantId }).del();
  await db('tbl_bom_master').where({ Tenant_ID: tenant.tenantId }).del();
  await db('tbl_production_department_master').where({ Tenant_ID: tenant.tenantId }).del();
  await testTenant.teardown();
  await db.destroy();
});

// ── Departments ──────────────────────────────────────────────────────────
describe('Production Departments', () => {
  test('POST /departments creates a tenant-scoped department', async () => {
    const res = await request(app).post('/api/manufacturing/departments').set(auth()).send({
      Dept_Code: 'QA-CAST', Dept_Name: 'QA Casting', Sequence_No: 2,
    });
    expect(res.status).toBe(201);
    expect(res.body.data.Dept_Code).toBe('QA-CAST');
    expect(res.body.data.Tenant_ID).toBe(tenant.tenantId);

    const row = await db('tbl_production_department_master').where({ Dept_ID: res.body.data.Dept_ID }).first();
    expect(row).toBeDefined();
    expect(row.Dept_Name).toBe('QA Casting');
    expect(row.Is_Active).toBe(true);
  });

  test('POST /departments requires Dept_Code and Dept_Name', async () => {
    const res = await request(app).post('/api/manufacturing/departments').set(auth()).send({ Dept_Code: 'ONLY-CODE' });
    expect(res.status).toBe(422);
  });

  test('GET /departments lists this tenant\'s active departments ordered by Sequence_No', async () => {
    await request(app).post('/api/manufacturing/departments').set(auth()).send({ Dept_Code: 'QA-POL', Dept_Name: 'QA Polishing', Sequence_No: 1 });

    const res = await request(app).get('/api/manufacturing/departments').set(auth());
    expect(res.status).toBe(200);
    const codes = res.body.data.map((d) => d.Dept_Code);
    expect(codes).toEqual(expect.arrayContaining(['QA-CAST', 'QA-POL']));
    // Sequence_No 1 (QA-POL) must come before Sequence_No 2 (QA-CAST).
    expect(codes.indexOf('QA-POL')).toBeLessThan(codes.indexOf('QA-CAST'));
  });
});

// ── BOM ──────────────────────────────────────────────────────────────────
describe('Bill of Materials', () => {
  let deptA, deptB, designId;

  beforeAll(async () => {
    const dA = await request(app).post('/api/manufacturing/departments').set(auth()).send({ Dept_Code: 'QA-BOM-D1', Dept_Name: 'QA Stage 1' });
    const dB = await request(app).post('/api/manufacturing/departments').set(auth()).send({ Dept_Code: 'QA-BOM-D2', Dept_Name: 'QA Stage 2' });
    deptA = dA.body.data.Dept_ID;
    deptB = dB.body.data.Dept_ID;
    designId = (await db('tbl_design_master').first()).Design_ID;
  });

  test('POST /bom requires BOM_Name', async () => {
    const res = await request(app).post('/api/manufacturing/bom').set(auth()).send({ Standard_Gold_Weight: 10 });
    expect(res.status).toBe(422);
  });

  test('POST /bom creates the header plus its department stages, auto-numbering Sequence_No from array position', async () => {
    const res = await request(app).post('/api/manufacturing/bom').set(auth()).send({
      BOM_Name: 'QA Ring BOM', Design_ID: designId, Standard_Gold_Weight: 5.5, Standard_Wastage_Pct: 4.5,
      stages: [
        { Dept_ID: deptA, Standard_Labour_Rate: 100, Standard_Wastage_Pct: 1.5 },
        { Dept_ID: deptB, Standard_Labour_Rate: 200, Standard_Wastage_Pct: 2.5 },
      ],
    });
    expect(res.status).toBe(201);
    expect(res.body.data.BOM_Name).toBe('QA Ring BOM');
    expect(res.body.data.Created_By).toBe(tenant.username);
    expect(parseFloat(res.body.data.Standard_Gold_Weight)).toBe(5.5);

    const bomId = res.body.data.BOM_ID;
    const stages = await db('tbl_bom_department_stages').where({ BOM_ID: bomId }).orderBy('Sequence_No');
    expect(stages.length).toBe(2);
    expect(stages[0].Dept_ID).toBe(deptA);
    expect(stages[0].Sequence_No).toBe(1); // not supplied — derived from array index (i+1)
    expect(parseFloat(stages[0].Standard_Labour_Rate)).toBe(100);
    expect(stages[1].Dept_ID).toBe(deptB);
    expect(stages[1].Sequence_No).toBe(2);
    expect(parseFloat(stages[1].Standard_Labour_Rate)).toBe(200);
  });

  test('an explicit Sequence_No on a stage is honored instead of the array-index default', async () => {
    const res = await request(app).post('/api/manufacturing/bom').set(auth()).send({
      BOM_Name: 'QA Explicit Seq BOM',
      stages: [{ Dept_ID: deptA, Sequence_No: 9, Standard_Labour_Rate: 50 }],
    });
    expect(res.status).toBe(201);
    const stage = await db('tbl_bom_department_stages').where({ BOM_ID: res.body.data.BOM_ID }).first();
    expect(stage.Sequence_No).toBe(9);
  });

  test('GET /bom/:id returns the header with its stages joined to Dept_Name, ordered by Sequence_No', async () => {
    const created = await request(app).post('/api/manufacturing/bom').set(auth()).send({
      BOM_Name: 'QA Detail BOM',
      stages: [
        { Dept_ID: deptB, Sequence_No: 2, Standard_Labour_Rate: 20 },
        { Dept_ID: deptA, Sequence_No: 1, Standard_Labour_Rate: 10 },
      ],
    });
    const bomId = created.body.data.BOM_ID;

    const res = await request(app).get(`/api/manufacturing/bom/${bomId}`).set(auth());
    expect(res.status).toBe(200);
    expect(res.body.data.BOM_Name).toBe('QA Detail BOM');
    expect(res.body.data.stages.length).toBe(2);
    expect(res.body.data.stages[0].Sequence_No).toBe(1);
    expect(res.body.data.stages[0].Dept_Name).toBe('QA Stage 1');
    expect(res.body.data.stages[1].Sequence_No).toBe(2);
    expect(res.body.data.stages[1].Dept_Name).toBe('QA Stage 2');
  });

  test('GET /bom/:id 404s for a BOM that does not exist (or belongs to another tenant)', async () => {
    const res = await request(app).get('/api/manufacturing/bom/999999999').set(auth());
    expect(res.status).toBe(404);
  });

  test('GET /bom?designId= filters to only BOMs linked to that design', async () => {
    await request(app).post('/api/manufacturing/bom').set(auth()).send({ BOM_Name: 'QA No-Design BOM' });
    const withDesign = await request(app).post('/api/manufacturing/bom').set(auth()).send({ BOM_Name: 'QA Design-Linked BOM', Design_ID: designId });
    expect(withDesign.status).toBe(201);

    const res = await request(app).get('/api/manufacturing/bom').set(auth()).query({ designId });
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    expect(res.body.data.every((b) => b.Design_ID === designId)).toBe(true);
    expect(res.body.data.some((b) => b.BOM_Name === 'QA Design-Linked BOM')).toBe(true);
    expect(res.body.data.some((b) => b.BOM_Name === 'QA No-Design BOM')).toBe(false);
  });
});

// ── Production Transactions ─────────────────────────────────────────────
describe('Production Transactions', () => {
  let deptId;

  beforeAll(async () => {
    const d = await request(app).post('/api/manufacturing/departments').set(auth()).send({ Dept_Code: 'QA-PROD-D', Dept_Name: 'QA Prod Dept' });
    deptId = d.body.data.Dept_ID;
  });

  test('POST /production requires a positive Input_Weight and a Txn_Date', async () => {
    const missingWeight = await request(app).post('/api/manufacturing/production').set(auth()).send({ Txn_Date: today() });
    expect(missingWeight.status).toBe(422);

    const zeroWeight = await request(app).post('/api/manufacturing/production').set(auth()).send({ Input_Weight: 0, Txn_Date: today() });
    expect(zeroWeight.status).toBe(422);
  });

  test('POST /production opens a transaction in "In Progress" status', async () => {
    const res = await request(app).post('/api/manufacturing/production').set(auth()).send({
      Dept_ID: deptId, Input_Weight: 100, Txn_Date: today(), Remarks: 'QA open run',
    });
    expect(res.status).toBe(201);
    expect(res.body.data.Status).toBe('In Progress');
    expect(parseFloat(res.body.data.Input_Weight)).toBe(100);
    expect(res.body.data.Created_By).toBe(tenant.username);

    const row = await db('tbl_production_transaction').where({ Txn_ID: res.body.data.Txn_ID }).first();
    expect(row.Status).toBe('In Progress');
    expect(row.Output_Weight).toBeNull();
  });

  test('PUT /production/:id/complete derives Wastage_Weight/Wastage_Pct from Input vs Output — never trusts a caller-sent wastage figure', async () => {
    const opened = await request(app).post('/api/manufacturing/production').set(auth()).send({
      Dept_ID: deptId, Input_Weight: 100, Txn_Date: today(),
    });
    const txnId = opened.body.data.Txn_ID;

    const res = await request(app).put(`/api/manufacturing/production/${txnId}/complete`).set(auth()).send({ Output_Weight: 97 });
    expect(res.status).toBe(200);
    expect(res.body.data.Status).toBe('Completed');
    expect(parseFloat(res.body.data.Output_Weight)).toBe(97);
    expect(parseFloat(res.body.data.Wastage_Weight)).toBeCloseTo(3, 3); // 100 - 97
    expect(parseFloat(res.body.data.Wastage_Pct)).toBeCloseTo(3, 2); // 3/100 * 100

    const row = await db('tbl_production_transaction').where({ Txn_ID: txnId }).first();
    expect(row.Status).toBe('Completed');
    expect(parseFloat(row.Wastage_Weight)).toBeCloseTo(3, 3);
  });

  test('PUT /production/:id/complete clamps wastage at 0 when Output_Weight somehow exceeds Input_Weight', async () => {
    const opened = await request(app).post('/api/manufacturing/production').set(auth()).send({
      Dept_ID: deptId, Input_Weight: 50, Txn_Date: today(),
    });
    const txnId = opened.body.data.Txn_ID;

    const res = await request(app).put(`/api/manufacturing/production/${txnId}/complete`).set(auth()).send({ Output_Weight: 60 });
    expect(res.status).toBe(200);
    expect(parseFloat(res.body.data.Wastage_Weight)).toBe(0);
    expect(parseFloat(res.body.data.Wastage_Pct)).toBe(0);
  });

  test('PUT /production/:id/complete 404s for a transaction that does not exist', async () => {
    const res = await request(app).put('/api/manufacturing/production/999999999/complete').set(auth()).send({ Output_Weight: 10 });
    expect(res.status).toBe(404);
  });

  test('GET /production filters by deptId and status', async () => {
    const otherDept = await request(app).post('/api/manufacturing/departments').set(auth()).send({ Dept_Code: 'QA-PROD-D2', Dept_Name: 'QA Prod Dept 2' });
    await request(app).post('/api/manufacturing/production').set(auth()).send({
      Dept_ID: otherDept.body.data.Dept_ID, Input_Weight: 20, Txn_Date: today(),
    });

    const byDept = await request(app).get('/api/manufacturing/production').set(auth()).query({ deptId });
    expect(byDept.status).toBe(200);
    expect(byDept.body.data.every((p) => p.Dept_ID === deptId)).toBe(true);

    const byStatus = await request(app).get('/api/manufacturing/production').set(auth()).query({ status: 'Completed' });
    expect(byStatus.status).toBe(200);
    expect(byStatus.body.data.length).toBeGreaterThanOrEqual(2); // the two completed above
    expect(byStatus.body.data.every((p) => p.Status === 'Completed')).toBe(true);
  });
});

// ── Melting / Refining Log ───────────────────────────────────────────────
describe('Melting / Refining Log', () => {
  test('POST /melting-refining rejects a Process_Type outside Melting/Refining', async () => {
    const res = await request(app).post('/api/manufacturing/melting-refining').set(auth()).send({
      Process_Type: 'Smelting', Metal_Type: 'Gold', Weight_In: 100, Log_Date: today(),
    });
    expect(res.status).toBe(422);
  });

  test('POST /melting-refining computes Loss_Weight/Loss_Pct from Weight_In vs Weight_Out', async () => {
    const res = await request(app).post('/api/manufacturing/melting-refining').set(auth()).send({
      Process_Type: 'Melting', Metal_Type: 'Gold', Purity_In_Code: '22K', Purity_Out_Code: '24K',
      Weight_In: 100, Weight_Out: 96.5, Log_Date: today(),
    });
    expect(res.status).toBe(201);
    expect(parseFloat(res.body.data.Loss_Weight)).toBeCloseTo(3.5, 3);
    expect(parseFloat(res.body.data.Loss_Pct)).toBeCloseTo(3.5, 2);
    expect(res.body.data.Created_By).toBe(tenant.username);

    const row = await db('tbl_melting_refining_log').where({ Log_ID: res.body.data.Log_ID }).first();
    expect(parseFloat(row.Loss_Weight)).toBeCloseTo(3.5, 3);
  });

  test('POST /melting-refining with no Weight_Out yet (an open melt) leaves Loss_Weight at 0 and Loss_Pct null — not computed prematurely', async () => {
    const res = await request(app).post('/api/manufacturing/melting-refining').set(auth()).send({
      Process_Type: 'Refining', Metal_Type: 'Silver', Weight_In: 250, Log_Date: today(),
    });
    expect(res.status).toBe(201);
    expect(parseFloat(res.body.data.Loss_Weight)).toBe(0);
    expect(res.body.data.Loss_Pct).toBeNull();
  });

  test('GET /melting-refining filters by processType', async () => {
    const res = await request(app).get('/api/manufacturing/melting-refining').set(auth()).query({ processType: 'Refining' });
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    expect(res.body.data.every((l) => l.Process_Type === 'Refining')).toBe(true);
  });
});

// ── Mould / Rubber BOM Stock ─────────────────────────────────────────────
describe('Mould / Rubber BOM Stock', () => {
  test('POST /moulds requires Mould_Name', async () => {
    const res = await request(app).post('/api/manufacturing/moulds').set(auth()).send({ Rubber_Type: 'Silicon' });
    expect(res.status).toBe(422);
  });

  test('POST /moulds creates a mould with the given stock, then GET /moulds lists it for this tenant', async () => {
    const created = await request(app).post('/api/manufacturing/moulds').set(auth()).send({
      Mould_Name: 'QA Ring Mould', Rubber_Type: 'Silicon', Stock_Qty: 5, Standard_Wax_Weight: 2.2,
    });
    expect(created.status).toBe(201);
    expect(created.body.data.Stock_Qty).toBe(5);

    const list = await request(app).get('/api/manufacturing/moulds').set(auth());
    expect(list.status).toBe(200);
    expect(list.body.data.some((m) => m.Mould_ID === created.body.data.Mould_ID)).toBe(true);
  });

  test('PUT /moulds/:id/stock increments and decrements Stock_Qty by delta', async () => {
    const created = await request(app).post('/api/manufacturing/moulds').set(auth()).send({ Mould_Name: 'QA Delta Mould', Stock_Qty: 10 });
    const mouldId = created.body.data.Mould_ID;

    const up = await request(app).put(`/api/manufacturing/moulds/${mouldId}/stock`).set(auth()).send({ delta: 4 });
    expect(up.status).toBe(200);
    expect(up.body.data.Stock_Qty).toBe(14);

    const down = await request(app).put(`/api/manufacturing/moulds/${mouldId}/stock`).set(auth()).send({ delta: -6 });
    expect(down.status).toBe(200);
    expect(down.body.data.Stock_Qty).toBe(8);

    const row = await db('tbl_mould_bom_stock').where({ Mould_ID: mouldId }).first();
    expect(row.Stock_Qty).toBe(8);
  });

  test('PUT /moulds/:id/stock 404s for a mould that does not exist', async () => {
    const res = await request(app).put('/api/manufacturing/moulds/999999999/stock').set(auth()).send({ delta: 1 });
    expect(res.status).toBe(404);
  });
});
