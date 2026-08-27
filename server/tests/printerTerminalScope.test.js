/**
 * Printer Setup spec §18-19 — terminal/computer-level printer config, the
 * last deliberately-deferred piece from the original spec. Confirms the
 * real 3-level cascade (Terminal -> Branch -> Tenant) actually resolves
 * in the right order, not just that the routes respond.
 */
const request = require('supertest');
const { app } = require('../src/index');
const db = require('../src/db/knex');
const testTenant = require('./helpers/testTenant');

let tenant, token, branchA;
const auth = () => ({ Authorization: `Bearer ${token}` });
const TERMINAL_1 = 'qa-term-billing-pc-1';
const TERMINAL_2 = 'qa-term-accounts-pc';

beforeAll(async () => {
  tenant = await testTenant.setup();
  const login = await request(app).post('/api/auth/login').send({ username: tenant.username, password: tenant.password, tenantId: tenant.tenantId });
  token = login.body.data.token;

  branchA = `${tenant.tenantId}_TRM`;
  await db('tbl_branch_master').insert({ Branch_ID: branchA, Tenant_ID: tenant.tenantId, Branch_Name: 'QA Terminal Branch', Branch_Code: 'TRM', Is_Active: true });
});

afterAll(async () => {
  await db('tbl_printer_config').where({ Tenant_ID: tenant.tenantId }).del();
  await db('tbl_terminal_master').whereIn('Terminal_ID', [TERMINAL_1, TERMINAL_2]).del();
  await db('tbl_branch_master').where({ Branch_ID: branchA }).del();
  await testTenant.teardown();
  await db.destroy();
});

test('POST /api/printer-config/terminal registers a new computer, and a repeat call updates it rather than duplicating', async () => {
  const first = await request(app).post('/api/printer-config/terminal').set(auth()).send({ terminalId: TERMINAL_1, terminalName: 'Billing Computer 1' });
  expect(first.status).toBe(200);
  expect(first.body.data.Terminal_Name).toBe('Billing Computer 1');

  // Heartbeat with no name — must NOT clobber the name that's already set.
  const heartbeat = await request(app).post('/api/printer-config/terminal').set(auth()).send({ terminalId: TERMINAL_1 });
  expect(heartbeat.status).toBe(200);
  expect(heartbeat.body.data.Terminal_Name).toBe('Billing Computer 1');

  const rows = await db('tbl_terminal_master').where({ Terminal_ID: TERMINAL_1 });
  expect(rows.length).toBe(1); // still exactly one row, not duplicated
});

test('GET /api/printer-config/terminals lists registered computers for this tenant', async () => {
  await request(app).post('/api/printer-config/terminal').set(auth()).send({ terminalId: TERMINAL_2, terminalName: 'Accounts Computer', branchId: branchA });
  const res = await request(app).get('/api/printer-config/terminals').set(auth());
  expect(res.status).toBe(200);
  const names = res.body.data.map((t) => t.Terminal_Name);
  expect(names).toContain('Billing Computer 1');
  expect(names).toContain('Accounts Computer');
});

test('PUT /api/printer-config/terminal/:id renames a computer', async () => {
  const res = await request(app).put(`/api/printer-config/terminal/${TERMINAL_2}`).set(auth()).send({ terminalName: 'Accounts PC (Renamed)' });
  expect(res.status).toBe(200);
  expect(res.body.data.Terminal_Name).toBe('Accounts PC (Renamed)');
});

test('the 3-level cascade: terminal-specific beats branch-specific beats tenant-wide, for the SAME role', async () => {
  // Tenant-wide default
  await request(app).put('/api/printer-config').set(auth()).send({ role: 'receipt', printerName: 'Tenant Default Printer' });
  const tenantWide = await request(app).get('/api/printer-config').set(auth());
  expect(tenantWide.body.data.receipt.Printer_Name).toBe('Tenant Default Printer');

  // Branch-specific beats tenant-wide
  await request(app).put('/api/printer-config').set(auth()).send({ role: 'receipt', printerName: 'Branch A Printer', branchId: branchA });
  const branchScoped = await request(app).get('/api/printer-config').set(auth()).query({ branchId: branchA });
  expect(branchScoped.body.data.receipt.Printer_Name).toBe('Branch A Printer');

  // Terminal-specific beats branch-specific, for THIS terminal only
  await request(app).put('/api/printer-config').set(auth()).send({ role: 'receipt', printerName: 'Billing PC 1 Own Printer', terminalId: TERMINAL_1 });
  const terminalScoped = await request(app).get('/api/printer-config').set(auth()).query({ branchId: branchA, terminalId: TERMINAL_1 });
  expect(terminalScoped.body.data.receipt.Printer_Name).toBe('Billing PC 1 Own Printer');

  // A DIFFERENT terminal at the same branch is unaffected — still gets
  // the branch printer, not Billing PC 1's own assignment. This is the
  // spec's own example: "prevents the wrong computer from trying to
  // print to another workstation's printer."
  const otherTerminal = await request(app).get('/api/printer-config').set(auth()).query({ branchId: branchA, terminalId: TERMINAL_2 });
  expect(otherTerminal.body.data.receipt.Printer_Name).toBe('Branch A Printer');

  // And with no terminalId at all (a computer that never opened Printer
  // Settings, or a report run server-side), branch-specific still wins
  // over tenant-wide, same as before this feature existed.
  const noTerminal = await request(app).get('/api/printer-config').set(auth()).query({ branchId: branchA });
  expect(noTerminal.body.data.receipt.Printer_Name).toBe('Branch A Printer');
});

test('Connection_Type (spec §4) round-trips as a plain informational tag', async () => {
  await request(app).put('/api/printer-config').set(auth()).send({ role: 'barcode', printerName: 'Zebra ZD220', connectionType: 'USB' });
  const res = await request(app).get('/api/printer-config').set(auth());
  expect(res.body.data.barcode.Connection_Type).toBe('USB');
});

test('an invalid Connection_Type is rejected', async () => {
  const res = await request(app).put('/api/printer-config').set(auth()).send({ role: 'barcode', printerName: 'Zebra ZD220', connectionType: 'Carrier Pigeon' });
  expect(res.status).toBe(422);
});
