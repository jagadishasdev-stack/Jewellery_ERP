/**
 * Bank Accounts & Cheque/PDC Register — src/routes/bankCheque.js.
 *
 * Bank-account creation and the /clear happy-path ledger effect already
 * have real coverage elsewhere (openingBalanceLedger.test.js,
 * moneyMovementLedgerGaps.test.js, accountingVouchers.test.js,
 * financialReportBugs.test.js), and the generic bank_cheque module
 * permission gate is covered in moduleOverrideFullCoverage.test.js. This
 * file fills the remaining gap: the cheque register itself, and
 * specifically the deposit and bounce flows, which had zero coverage
 * before this file.
 *
 * Three real bugs found and fixed directly in bankCheque.js while writing
 * this coverage (see the matching 'FIXED:' tests below for each):
 *
 *   1. POST /cheques/:id/bounce declared a
 *      body('Bounce_Charge').isFloat({ min: 0 }) validator but never
 *      called validationResult(req) — dead validation, same class of bug
 *      as insuranceAmc.js's claim-amount validator. A negative
 *      Bounce_Charge sailed straight through to the DB.
 *   2. No state guard anywhere in deposit/clear/bounce: a cheque already
 *      in a terminal state (Cleared/Bounced) could be re-deposited,
 *      re-cleared, or re-bounced. Re-clearing an already-Cleared cheque
 *      would post ANOTHER real journal entry, double-counting money into
 *      Current_Balance/Trial Balance for the same cheque. Bouncing an
 *      already-Cleared cheque flipped its Status with nothing reversing
 *      the journal /clear had already posted, silently corrupting the
 *      bank balance forever.
 *   3. (same fix, symmetric) deposit/clear/bounce now only accept a
 *      cheque in an "open" state (Pending, and Deposited for
 *      clear/bounce) — a terminal-state cheque gets a friendly 400
 *      instead of silently mutating.
 */
const request = require('supertest');
const dayjs = require('dayjs');
const { app } = require('../src/index');
const db = require('../src/db/knex');
const testTenant = require('./helpers/testTenant');

let tenant, token, bankAccountId;
const auth = () => ({ Authorization: `Bearer ${token}` });

async function setOverride(moduleKey, overrides) {
  return request(app).post('/api/permissions/overrides').set(auth()).send({
    User_ID: tenant.userId, Module_Key: moduleKey,
    Can_View: true, Can_Add: true, Can_Edit: true, Can_Delete: true, Can_Approve: true,
    ...overrides,
  });
}

async function logCheque(overrides = {}) {
  const res = await request(app).post('/api/bank-cheque/cheques').set(auth()).send({
    Cheque_Type: 'Received', Party_Name: 'QA Test Customer', Cheque_Number: `CHQ-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
    Amount: 5000, Cheque_Date: '2026-08-01', Account_ID: bankAccountId,
    ...overrides,
  });
  expect(res.status).toBe(201);
  return res.body.data;
}

beforeAll(async () => {
  tenant = await testTenant.setup();
  const res = await request(app).post('/api/auth/login').send({ username: tenant.username, password: tenant.password, tenantId: tenant.tenantId });
  token = res.body.data.token;

  const bankRes = await request(app).post('/api/bank-cheque/accounts').set(auth()).send({
    Bank_Name: 'QA Cheque Test Bank', Account_Number: 'QACHQ001',
  });
  bankAccountId = bankRes.body.data.Account_ID;
});

afterAll(async () => {
  await testTenant.teardown();
  await db.destroy();
});

// ── Cheque Register: creation & listing ─────────────────────────────────────
describe('Cheque Register — creation & listing', () => {
  test('POST /cheques requires Cheque_Type in [Received, Issued], Party_Name, Cheque_Number, Amount>0', async () => {
    const missingAll = await request(app).post('/api/bank-cheque/cheques').set(auth()).send({});
    expect(missingAll.status).toBe(422);

    const badType = await request(app).post('/api/bank-cheque/cheques').set(auth()).send({
      Cheque_Type: 'Something_Else', Party_Name: 'X', Cheque_Number: 'C1', Amount: 100,
    });
    expect(badType.status).toBe(422);

    const badAmount = await request(app).post('/api/bank-cheque/cheques').set(auth()).send({
      Cheque_Type: 'Received', Party_Name: 'X', Cheque_Number: 'C1', Amount: 0,
    });
    expect(badAmount.status).toBe(422);
  });

  test('POST /cheques creates a Pending cheque; GET /cheques lists it back, filterable by status and type', async () => {
    const cheque = await logCheque({ Cheque_Number: 'CHQ-LIST-001' });
    expect(cheque.Status).toBe('Pending');
    expect(cheque.Cheque_Type).toBe('Received');

    const row = await db('tbl_cheque_register').where({ Cheque_ID: cheque.Cheque_ID }).first();
    expect(row.Tenant_ID).toBe(tenant.tenantId);
    expect(row.Created_By).toBe(tenant.username);

    const list = await request(app).get('/api/bank-cheque/cheques').set(auth()).query({ status: 'Pending', type: 'Received' });
    expect(list.status).toBe(200);
    expect(list.body.data.some((c) => c.Cheque_ID === cheque.Cheque_ID)).toBe(true);
    expect(list.body.data.every((c) => c.Status === 'Pending' && c.Cheque_Type === 'Received')).toBe(true);
    // Joined own-bank name is populated.
    expect(list.body.data.find((c) => c.Cheque_ID === cheque.Cheque_ID).Own_Bank_Name).toBe('QA Cheque Test Bank');
  });
});

// ── Deposit flow ─────────────────────────────────────────────────────────────
describe('POST /cheques/:id/deposit', () => {
  test('marks a Pending cheque Deposited and stamps Deposit_Date to today', async () => {
    const cheque = await logCheque();
    const res = await request(app).post(`/api/bank-cheque/cheques/${cheque.Cheque_ID}/deposit`).set(auth());
    expect(res.status).toBe(200);
    expect(res.body.data.Status).toBe('Deposited');
    expect(res.body.data.Deposit_Date).toBe(dayjs().format('YYYY-MM-DD'));

    const row = await db('tbl_cheque_register').where({ Cheque_ID: cheque.Cheque_ID }).first();
    expect(row.Status).toBe('Deposited');
  });

  test('404s for a non-existent cheque', async () => {
    const res = await request(app).post('/api/bank-cheque/cheques/999999999/deposit').set(auth());
    expect(res.status).toBe(404);
  });

  test('FIXED: depositing an already-Deposited cheque is now rejected with 400 instead of silently re-stamping Deposit_Date', async () => {
    const cheque = await logCheque();
    const first = await request(app).post(`/api/bank-cheque/cheques/${cheque.Cheque_ID}/deposit`).set(auth());
    expect(first.status).toBe(200);
    const firstDepositDate = first.body.data.Deposit_Date;

    const second = await request(app).post(`/api/bank-cheque/cheques/${cheque.Cheque_ID}/deposit`).set(auth());
    expect(second.status).toBe(400);
    expect(second.body.message).toMatch(/Deposited/);

    const row = await db('tbl_cheque_register').where({ Cheque_ID: cheque.Cheque_ID }).first();
    expect(dayjs(row.Deposit_Date).format('YYYY-MM-DD')).toBe(firstDepositDate);
  });

  test('FIXED: depositing an already-Bounced cheque is rejected with 400', async () => {
    const cheque = await logCheque();
    await request(app).post(`/api/bank-cheque/cheques/${cheque.Cheque_ID}/deposit`).set(auth());
    await request(app).post(`/api/bank-cheque/cheques/${cheque.Cheque_ID}/bounce`).set(auth()).send({});

    const res = await request(app).post(`/api/bank-cheque/cheques/${cheque.Cheque_ID}/deposit`).set(auth());
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Bounced/);
  });

  test('FIXED: depositing an already-Cleared cheque is rejected with 400', async () => {
    const cheque = await logCheque();
    await request(app).post(`/api/bank-cheque/cheques/${cheque.Cheque_ID}/deposit`).set(auth());
    await request(app).post(`/api/bank-cheque/cheques/${cheque.Cheque_ID}/clear`).set(auth());

    const res = await request(app).post(`/api/bank-cheque/cheques/${cheque.Cheque_ID}/deposit`).set(auth());
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Cleared/);
  });

  test('permission denied: a Can_Edit=false override on bank_cheque blocks deposit with 403', async () => {
    const cheque = await logCheque();
    await setOverride('bank_cheque', { Can_Edit: false });
    const res = await request(app).post(`/api/bank-cheque/cheques/${cheque.Cheque_ID}/deposit`).set(auth());
    expect(res.status).toBe(403);
    await setOverride('bank_cheque', { Can_Edit: true }); // restore for later tests

    const row = await db('tbl_cheque_register').where({ Cheque_ID: cheque.Cheque_ID }).first();
    expect(row.Status).toBe('Pending'); // unaffected
  });
});

// ── Bounce flow ──────────────────────────────────────────────────────────────
describe('POST /cheques/:id/bounce', () => {
  test('marks a Deposited cheque Bounced and stores the Bounce_Charge', async () => {
    const cheque = await logCheque();
    await request(app).post(`/api/bank-cheque/cheques/${cheque.Cheque_ID}/deposit`).set(auth());

    const res = await request(app).post(`/api/bank-cheque/cheques/${cheque.Cheque_ID}/bounce`).set(auth()).send({ Bounce_Charge: 150 });
    expect(res.status).toBe(200);
    expect(res.body.data.Status).toBe('Bounced');
    expect(parseFloat(res.body.data.Bounce_Charge)).toBe(150);

    const row = await db('tbl_cheque_register').where({ Cheque_ID: cheque.Cheque_ID }).first();
    expect(row.Status).toBe('Bounced');
    expect(parseFloat(row.Bounce_Charge)).toBe(150);
  });

  test('can also bounce directly from Pending (never actually deposited), Bounce_Charge defaults to 0 when omitted', async () => {
    const cheque = await logCheque();
    const res = await request(app).post(`/api/bank-cheque/cheques/${cheque.Cheque_ID}/bounce`).set(auth()).send({});
    expect(res.status).toBe(200);
    expect(res.body.data.Status).toBe('Bounced');
    expect(parseFloat(res.body.data.Bounce_Charge)).toBe(0);
  });

  test('404s for a non-existent cheque', async () => {
    const res = await request(app).post('/api/bank-cheque/cheques/999999999/bounce').set(auth()).send({});
    expect(res.status).toBe(404);
  });

  test('FIXED: Bounce_Charge validator is now actually enforced — a negative charge is rejected with 422 instead of reaching the DB', async () => {
    const cheque = await logCheque();
    const res = await request(app).post(`/api/bank-cheque/cheques/${cheque.Cheque_ID}/bounce`).set(auth()).send({ Bounce_Charge: -50 });
    expect(res.status).toBe(422);

    const row = await db('tbl_cheque_register').where({ Cheque_ID: cheque.Cheque_ID }).first();
    expect(row.Status).toBe('Pending'); // unaffected — validation ran before any update
  });

  test('FIXED: bouncing an already-Bounced cheque is now rejected with 400 instead of silently overwriting Bounce_Charge', async () => {
    const cheque = await logCheque();
    const first = await request(app).post(`/api/bank-cheque/cheques/${cheque.Cheque_ID}/bounce`).set(auth()).send({ Bounce_Charge: 100 });
    expect(first.status).toBe(200);

    const second = await request(app).post(`/api/bank-cheque/cheques/${cheque.Cheque_ID}/bounce`).set(auth()).send({ Bounce_Charge: 999 });
    expect(second.status).toBe(400);
    expect(second.body.message).toMatch(/Bounced/);

    const row = await db('tbl_cheque_register').where({ Cheque_ID: cheque.Cheque_ID }).first();
    expect(parseFloat(row.Bounce_Charge)).toBe(100); // unchanged, not overwritten
  });

  test('FIXED: bouncing an already-Cleared cheque is now rejected with 400, protecting the ledger the /clear journal already posted', async () => {
    const cheque = await logCheque();
    const clearRes = await request(app).post(`/api/bank-cheque/cheques/${cheque.Cheque_ID}/clear`).set(auth());
    expect(clearRes.status).toBe(200);

    const res = await request(app).post(`/api/bank-cheque/cheques/${cheque.Cheque_ID}/bounce`).set(auth()).send({});
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Cleared/);

    const row = await db('tbl_cheque_register').where({ Cheque_ID: cheque.Cheque_ID }).first();
    expect(row.Status).toBe('Cleared'); // unaffected — still cleared, not silently flipped
  });

  test('permission denied: a Can_Edit=false override on bank_cheque blocks bounce with 403', async () => {
    const cheque = await logCheque();
    await setOverride('bank_cheque', { Can_Edit: false });
    const res = await request(app).post(`/api/bank-cheque/cheques/${cheque.Cheque_ID}/bounce`).set(auth()).send({});
    expect(res.status).toBe(403);
    await setOverride('bank_cheque', { Can_Edit: true }); // restore

    const row = await db('tbl_cheque_register').where({ Cheque_ID: cheque.Cheque_ID }).first();
    expect(row.Status).toBe('Pending'); // unaffected
  });

  // BUG (flagged for review): there is no way today for a cheque that
  // cleared and was LATER returned unpaid by the bank (a real, if
  // uncommon, banking event) to be reflected correctly — the guard added
  // above only blocks the silent corruption (flipping Status without
  // touching the ledger); it doesn't add the actual reversal. Doing that
  // properly means posting a reversing journal (Dr Cheque In Hand / Cr the
  // specific bank, undoing exactly what /clear posted) and deciding how
  // Bounce_Charge should be booked in that case — a real accounting design
  // decision (which account absorbs the loss, whether Current_Balance
  // should reflect it immediately or only after a fresh journal posts),
  // not a mechanical one-line fix.
  test('BUG (flagged for review): a cleared-then-later-returned cheque has no supported reversal path — clear is effectively final', async () => {
    const cheque = await logCheque();
    await request(app).post(`/api/bank-cheque/cheques/${cheque.Cheque_ID}/clear`).set(auth());
    const res = await request(app).post(`/api/bank-cheque/cheques/${cheque.Cheque_ID}/bounce`).set(auth()).send({});
    expect(res.status).toBe(400); // blocked, not reversed — no ledger reversal exists for this case
  });
});

// ── Clear guard (adjacent fix — same state-machine hole as bounce above) ────
describe('POST /cheques/:id/clear — terminal-state guard', () => {
  test('FIXED: clearing an already-Cleared cheque is now rejected with 400 instead of posting a duplicate ledger journal', async () => {
    const cheque = await logCheque();
    const first = await request(app).post(`/api/bank-cheque/cheques/${cheque.Cheque_ID}/clear`).set(auth());
    expect(first.status).toBe(200);

    const journalCountBefore = await db('tbl_accounting_journal').where({ Tenant_ID: tenant.tenantId, Reference: `CHQCLR-${cheque.Cheque_ID}` }).count('* as c');
    expect(Number(journalCountBefore[0].c)).toBe(1);

    const second = await request(app).post(`/api/bank-cheque/cheques/${cheque.Cheque_ID}/clear`).set(auth());
    expect(second.status).toBe(400);

    const journalCountAfter = await db('tbl_accounting_journal').where({ Tenant_ID: tenant.tenantId, Reference: `CHQCLR-${cheque.Cheque_ID}` }).count('* as c');
    expect(Number(journalCountAfter[0].c)).toBe(1); // still just one — no duplicate journal posted
  });

  test('FIXED: clearing an already-Bounced cheque is rejected with 400', async () => {
    const cheque = await logCheque();
    await request(app).post(`/api/bank-cheque/cheques/${cheque.Cheque_ID}/bounce`).set(auth()).send({});

    const res = await request(app).post(`/api/bank-cheque/cheques/${cheque.Cheque_ID}/clear`).set(auth());
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Bounced/);
  });
});
