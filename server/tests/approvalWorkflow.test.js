/**
 * Approval Issue / Approval Receive workflow — the karigar "issue on
 * approval" and "receive back / cancel" lifecycle for both tagged
 * (real ornaments, tracked per-unit via tbl_approval_issue_items) and
 * non-tagged (manually described, tbl_non_tag_issue_items) items.
 *
 * `POST /api/approval/issue` and `GET /api/approval/issues` already have
 * tangential coverage elsewhere (branch stamping/isolation in
 * multiBranchModules.test.js). This file covers the rest of the real
 * business flow that nothing else touches: receive (full + partial),
 * cancel, the non-tagged variant, and the guards the route code actually
 * enforces (not-found voucher, already-received items, cancelled-voucher
 * receive, cancel-after-partial-receive).
 */
const request = require('supertest');
const { app } = require('../src/index');
const db = require('../src/db/knex');
const testTenant = require('./helpers/testTenant');
const dayjs = require('dayjs');

let tenant, token, typeId;
const auth = () => ({ Authorization: `Bearer ${token}` });
const today = () => dayjs().format('YYYY-MM-DD');

beforeAll(async () => {
  tenant = await testTenant.setup();
  const login = await request(app).post('/api/auth/login').send({
    username: tenant.username, password: tenant.password, tenantId: tenant.tenantId,
  });
  token = login.body.data.token;
  typeId = (await db('tbl_item_type_master').first()).Type_ID;
});

afterAll(async () => {
  await testTenant.teardown();
  await db.destroy();
});

let artNoSeq = 0;
async function createOrnament(overrides = {}) {
  artNoSeq += 1;
  const res = await request(app).post('/api/ornaments').set(auth()).send({
    Type_ID: typeId, Metal_Type: 'Gold', Gross_Weight: 5, Net_Gold_Weight: 4.5, Current_Gold_Rate: 6000,
    Base_Making_Charge_Per_Gram: 100, Purchase_Cost: 20000, Total_Price: 20000,
    Article_Number: `QA-APR-${Date.now()}-${artNoSeq}`,
    ...overrides,
  });
  expect(res.status).toBe(201);
  return res.body.data;
}

async function createParty(overrides = {}) {
  const res = await request(app).post('/api/approval/parties').set(auth()).send({
    Party_Name: 'QA Approval Party', Mobile: `9${Date.now().toString().slice(-9)}`, ...overrides,
  });
  expect(res.status).toBe(201);
  return res.body.data;
}

// POST /api/approval/issue returns its `items` as the plain rows it built
// in memory BEFORE inserting — they never got Issue_Item_ID back (the
// insert wasn't done with .returning()). Real callers (and this test) have
// to fetch the issue detail afterward to get the item IDs needed for /receive.
async function getIssueDetail(issueId) {
  const res = await request(app).get(`/api/approval/issue/${issueId}`).set(auth());
  expect(res.status).toBe(200);
  return res.body.data; // { issue, items }
}

async function issueOrnament(ornament, overrides = {}) {
  const res = await request(app).post('/api/approval/issue').set(auth()).send({
    Issue_Date: today(),
    items: [{ Ornament_ID: ornament.Ornament_ID }],
    ...overrides,
  });
  expect(res.status).toBe(201);
  const detail = await getIssueDetail(res.body.data.Issue_ID);
  return { ...res.body.data, items: detail.items };
}

async function issueOrnaments(ornaments, overrides = {}) {
  const res = await request(app).post('/api/approval/issue').set(auth()).send({
    Issue_Date: today(),
    items: ornaments.map(o => ({ Ornament_ID: o.Ornament_ID })),
    ...overrides,
  });
  expect(res.status).toBe(201);
  const detail = await getIssueDetail(res.body.data.Issue_ID);
  return { ...res.body.data, items: detail.items };
}

describe('Party Master', () => {
  test('POST /api/approval/parties creates a party; GET /api/approval/parties lists it', async () => {
    const party = await createParty({ Party_Name: 'QA Karigar Traders', Shop_Name: 'QA Shop' });
    expect(party.Party_ID).toBeDefined();
    expect(party.Party_Name).toBe('QA Karigar Traders');

    const list = await request(app).get('/api/approval/parties').set(auth()).query({ search: 'QA Karigar' });
    expect(list.status).toBe(200);
    expect(list.body.data.some(p => p.Party_ID === party.Party_ID)).toBe(true);
  });

  test('POST /api/approval/parties rejects a duplicate mobile number (unique constraint on Tenant_ID+Mobile)', async () => {
    const mobile = `8${Date.now().toString().slice(-9)}`;
    const first = await createParty({ Party_Name: 'QA Dup A', Mobile: mobile });
    expect(first.Party_ID).toBeDefined();

    const dup = await request(app).post('/api/approval/parties').set(auth()).send({
      Party_Name: 'QA Dup B', Mobile: mobile,
    });
    expect(dup.status).toBe(400);
  });

  test('GET /api/approval/parties/:id returns the party plus its tagged and non-tagged issue history', async () => {
    const party = await createParty({ Party_Name: 'QA History Party' });
    const ornament = await createOrnament();
    const issue = await issueOrnament(ornament, { Party_ID: party.Party_ID });

    const res = await request(app).get(`/api/approval/parties/${party.Party_ID}`).set(auth());
    expect(res.status).toBe(200);
    expect(res.body.data.party.Party_ID).toBe(party.Party_ID);
    expect(res.body.data.issues.some(i => i.Issue_ID === issue.Issue_ID)).toBe(true);
  });

  test('GET /api/approval/parties/:id 404s for a party that does not exist', async () => {
    const res = await request(app).get('/api/approval/parties/999999999').set(auth());
    expect(res.status).toBe(404);
  });
});

describe('Tagged issue -> full receive', () => {
  test('issuing marks the ornament Is_On_Approval/unavailable; receiving all items clears it back to sellable stock', async () => {
    const ornament = await createOrnament();
    const issue = await issueOrnament(ornament);
    expect(issue.items).toHaveLength(1);
    expect(issue.Status).toBe('Pending');

    const outStock = await db('tbl_ornament_master').where({ Ornament_ID: ornament.Ornament_ID }).first();
    expect(outStock.Is_On_Approval).toBe(true);
    expect(outStock.Is_Stock_Available).toBe(false);
    expect(String(outStock.Approval_Issue_ID)).toBe(String(issue.Issue_ID));

    const issueItemId = issue.items[0].Issue_Item_ID;
    const receiveRes = await request(app).post('/api/approval/receive').set(auth()).send({
      Issue_ID: issue.Issue_ID, Receive_Date: today(), issueItemIds: [issueItemId],
    });
    expect(receiveRes.status).toBe(201);
    expect(receiveRes.body.data.Voucher_Number).toMatch(/^APR-REC-/);
    expect(receiveRes.body.data.status).toBe('Completed');

    // Receive record correctly references the original issue voucher.
    const receiveRow = await db('tbl_approval_receive_header').where({ Receive_ID: receiveRes.body.data.Receive_ID }).first();
    expect(String(receiveRow.Issue_ID)).toBe(String(issue.Issue_ID));
    expect(receiveRow.Items_Received_Count).toBe(1);

    // Line item flipped to Received and stamped with the receive it happened in.
    const lineItem = await db('tbl_approval_issue_items').where({ Issue_Item_ID: issueItemId }).first();
    expect(lineItem.Item_Status).toBe('Received');
    expect(String(lineItem.Received_In_Receive_ID)).toBe(String(receiveRes.body.data.Receive_ID));

    // Header status recomputed to Completed (0 pending left).
    const issueHeader = await db('tbl_approval_issue_header').where({ Issue_ID: issue.Issue_ID }).first();
    expect(issueHeader.Status).toBe('Completed');

    // Ornament is back to normal, sellable stock — no longer on approval.
    const backInStock = await db('tbl_ornament_master').where({ Ornament_ID: ornament.Ornament_ID }).first();
    expect(backInStock.Is_On_Approval).toBe(false);
    expect(backInStock.Is_Stock_Available).toBe(true);
    expect(String(backInStock.Approval_Receive_ID)).toBe(String(receiveRes.body.data.Receive_ID));
  });

  test('the voucher stays Pending in the ornament picker\'s notAvailable guard: an item already out on approval cannot be issued again', async () => {
    const ornament = await createOrnament();
    await issueOrnament(ornament);

    const secondIssue = await request(app).post('/api/approval/issue').set(auth()).send({
      Issue_Date: today(), items: [{ Ornament_ID: ornament.Ornament_ID }],
    });
    expect(secondIssue.status).toBe(400);
    expect(secondIssue.body.message).toMatch(/not currently available/i);
  });
});

describe('Tagged issue -> partial receive', () => {
  test('issuing 2 items and receiving only 1 leaves the voucher Partial and the other item still Pending/out on approval', async () => {
    const oA = await createOrnament();
    const oB = await createOrnament();
    const issue = await issueOrnaments([oA, oB]);
    expect(issue.items).toHaveLength(2);

    const itemA = issue.items.find(i => i.Ornament_ID === oA.Ornament_ID);
    const receiveRes = await request(app).post('/api/approval/receive').set(auth()).send({
      Issue_ID: issue.Issue_ID, Receive_Date: today(), issueItemIds: [itemA.Issue_Item_ID],
    });
    expect(receiveRes.status).toBe(201);
    expect(receiveRes.body.data.status).toBe('Partial');

    const issueHeader = await db('tbl_approval_issue_header').where({ Issue_ID: issue.Issue_ID }).first();
    expect(issueHeader.Status).toBe('Partial');

    const stillOut = await db('tbl_ornament_master').where({ Ornament_ID: oB.Ornament_ID }).first();
    expect(stillOut.Is_On_Approval).toBe(true);

    const backIn = await db('tbl_ornament_master').where({ Ornament_ID: oA.Ornament_ID }).first();
    expect(backIn.Is_On_Approval).toBe(false);
  });
});

describe('Tagged issue -> receive validation/edge cases actually enforced by the route', () => {
  test('receiving against a non-existent Issue_ID 404s', async () => {
    const res = await request(app).post('/api/approval/receive').set(auth()).send({
      Issue_ID: 999999999, Receive_Date: today(), issueItemIds: [1],
    });
    expect(res.status).toBe(404);
  });

  test('receiving an issueItemId that does not belong to the voucher is rejected (400), not silently ignored', async () => {
    const oA = await createOrnament();
    const oB = await createOrnament();
    const issueA = await issueOrnament(oA);
    const issueB = await issueOrnament(oB);

    const res = await request(app).post('/api/approval/receive').set(auth()).send({
      Issue_ID: issueA.Issue_ID, Receive_Date: today(), issueItemIds: [issueB.items[0].Issue_Item_ID],
    });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/do not belong to this voucher/i);
  });

  test('receiving the same item twice fails the second time with "not pending"', async () => {
    const ornament = await createOrnament();
    const issue = await issueOrnament(ornament);
    const itemId = issue.items[0].Issue_Item_ID;

    const first = await request(app).post('/api/approval/receive').set(auth()).send({
      Issue_ID: issue.Issue_ID, Receive_Date: today(), issueItemIds: [itemId],
    });
    expect(first.status).toBe(201);

    const second = await request(app).post('/api/approval/receive').set(auth()).send({
      Issue_ID: issue.Issue_ID, Receive_Date: today(), issueItemIds: [itemId],
    });
    expect(second.status).toBe(400);
    expect(second.body.message).toMatch(/not pending/i);
  });

  test('missing required fields (Issue_ID / Receive_Date / issueItemIds) is a 422 validation error', async () => {
    const res = await request(app).post('/api/approval/receive').set(auth()).send({});
    expect(res.status).toBe(422);
    expect(res.body.errors.length).toBeGreaterThan(0);
  });
});

describe('Tagged issue -> cancel flow', () => {
  test('cancelling a fully-pending voucher restores the item to stock and marks the voucher Cancelled', async () => {
    const ornament = await createOrnament();
    const issue = await issueOrnament(ornament);

    const cancelRes = await request(app).post(`/api/approval/issue/${issue.Issue_ID}/cancel`).set(auth()).send({ reason: 'QA test cancel' });
    expect(cancelRes.status).toBe(200);

    const issueHeader = await db('tbl_approval_issue_header').where({ Issue_ID: issue.Issue_ID }).first();
    expect(issueHeader.Status).toBe('Cancelled');
    expect(issueHeader.Cancellation_Reason).toBe('QA test cancel');
    expect(issueHeader.Cancelled_By).toBe(tenant.username);

    const lineItem = await db('tbl_approval_issue_items').where({ Issue_ID: issue.Issue_ID }).first();
    expect(lineItem.Item_Status).toBe('Cancelled');

    const restoredStock = await db('tbl_ornament_master').where({ Ornament_ID: ornament.Ornament_ID }).first();
    expect(restoredStock.Is_On_Approval).toBe(false);
    expect(restoredStock.Is_Stock_Available).toBe(true);
    expect(restoredStock.Approval_Issue_ID).toBeNull();
  });

  test('a cancelled voucher cannot be received against — by-voucher lookup rejects it, and /receive 400s on its non-pending items', async () => {
    const ornament = await createOrnament();
    const issue = await issueOrnament(ornament);
    const itemId = issue.items[0].Issue_Item_ID;

    await request(app).post(`/api/approval/issue/${issue.Issue_ID}/cancel`).set(auth()).expect(200);

    const byVoucher = await request(app).get(`/api/approval/issue/by-voucher/${issue.Voucher_Number}`).set(auth());
    expect(byVoucher.status).toBe(400);
    expect(byVoucher.body.message).toMatch(/cancelled/i);

    const receiveRes = await request(app).post('/api/approval/receive').set(auth()).send({
      Issue_ID: issue.Issue_ID, Receive_Date: today(), issueItemIds: [itemId],
    });
    expect(receiveRes.status).toBe(400);
    expect(receiveRes.body.message).toMatch(/not pending/i);
  });

  test('a voucher that already has a partial receive can no longer be cancelled (only nothing-yet-received vouchers can be)', async () => {
    const oA = await createOrnament();
    const oB = await createOrnament();
    const issue = await issueOrnaments([oA, oB]);
    const itemA = issue.items.find(i => i.Ornament_ID === oA.Ornament_ID);

    await request(app).post('/api/approval/receive').set(auth()).send({
      Issue_ID: issue.Issue_ID, Receive_Date: today(), issueItemIds: [itemA.Issue_Item_ID],
    }).expect(201);

    const cancelRes = await request(app).post(`/api/approval/issue/${issue.Issue_ID}/cancel`).set(auth()).send({});
    expect(cancelRes.status).toBe(400);
    expect(cancelRes.body.message).toMatch(/nothing yet received/i);

    // Header stays Partial, not Cancelled — the guard actually blocked the write.
    const issueHeader = await db('tbl_approval_issue_header').where({ Issue_ID: issue.Issue_ID }).first();
    expect(issueHeader.Status).toBe('Partial');
  });

  test('cancelling a non-existent issue 404s', async () => {
    const res = await request(app).post('/api/approval/issue/999999999/cancel').set(auth()).send({});
    expect(res.status).toBe(404);
  });
});

describe('GET /api/approval/issue/:id and /issue/by-voucher/:voucherNumber', () => {
  test('fetch by id returns the header plus its line items', async () => {
    const ornament = await createOrnament();
    const issue = await issueOrnament(ornament);

    const res = await request(app).get(`/api/approval/issue/${issue.Issue_ID}`).set(auth());
    expect(res.status).toBe(200);
    expect(res.body.data.issue.Issue_ID).toBe(issue.Issue_ID);
    expect(res.body.data.items).toHaveLength(1);
  });

  test('fetch by voucher number returns only the still-pending items', async () => {
    const oA = await createOrnament();
    const oB = await createOrnament();
    const issue = await issueOrnaments([oA, oB]);
    const itemA = issue.items.find(i => i.Ornament_ID === oA.Ornament_ID);
    await request(app).post('/api/approval/receive').set(auth()).send({
      Issue_ID: issue.Issue_ID, Receive_Date: today(), issueItemIds: [itemA.Issue_Item_ID],
    }).expect(201);

    const res = await request(app).get(`/api/approval/issue/by-voucher/${issue.Voucher_Number}`).set(auth());
    expect(res.status).toBe(200);
    expect(res.body.data.pendingItems).toHaveLength(1);
    expect(res.body.data.pendingItems[0].Ornament_ID).toBe(oB.Ornament_ID);
  });
});

describe('Non-tagged issue -> receive flow', () => {
  async function issueNonTagged(overrides = {}) {
    const res = await request(app).post('/api/approval/non-tag/issue').set(auth()).send({
      Issue_Date: today(),
      items: [{ Item_Type: 'Necklace', Design_Type: 'Antique', Gross_Weight: 12.5, Approx_Value: 45000 }],
      ...overrides,
    });
    expect(res.status).toBe(201);
    return res.body.data;
  }

  test('issuing a non-tagged item creates the header + item rows (no ornament touched — never in inventory)', async () => {
    const issue = await issueNonTagged();
    expect(issue.Voucher_Number).toMatch(/^NTA-ISS-/);
    expect(issue.Status).toBe('Pending');
    expect(issue.items).toHaveLength(1);
    expect(issue.items[0].Item_Type).toBe('Necklace');
    expect(issue.items[0].Item_Status).toBe('Pending');

    const dbRow = await db('tbl_non_tag_issue_header').where({ NTA_Issue_ID: issue.NTA_Issue_ID }).first();
    expect(dbRow.Total_Items_Issued).toBe(1);
    expect(parseFloat(dbRow.Total_Value_Issued)).toBeCloseTo(45000, 1);
  });

  test('receiving a non-tagged issue flips the item to Received and completes the voucher', async () => {
    const issue = await issueNonTagged();
    const itemId = issue.items[0].NTA_Issue_Item_ID;

    const receiveRes = await request(app).post('/api/approval/non-tag/receive').set(auth()).send({
      NTA_Issue_ID: issue.NTA_Issue_ID, Receive_Date: today(), issueItemIds: [itemId],
    });
    expect(receiveRes.status).toBe(201);
    expect(receiveRes.body.data.Voucher_Number).toMatch(/^NTA-REC-/);
    expect(receiveRes.body.data.status).toBe('Completed');

    const receiveRow = await db('tbl_non_tag_receive_header').where({ NTA_Receive_ID: receiveRes.body.data.NTA_Receive_ID }).first();
    expect(String(receiveRow.NTA_Issue_ID)).toBe(String(issue.NTA_Issue_ID));
    expect(receiveRow.Items_Received_Count).toBe(1);

    const lineItem = await db('tbl_non_tag_issue_items').where({ NTA_Issue_Item_ID: itemId }).first();
    expect(lineItem.Item_Status).toBe('Received');
    expect(String(lineItem.Received_In_Receive_ID)).toBe(String(receiveRes.body.data.NTA_Receive_ID));

    const issueHeader = await db('tbl_non_tag_issue_header').where({ NTA_Issue_ID: issue.NTA_Issue_ID }).first();
    expect(issueHeader.Status).toBe('Completed');
  });

  test('receiving the same non-tagged item twice is rejected the second time', async () => {
    const issue = await issueNonTagged();
    const itemId = issue.items[0].NTA_Issue_Item_ID;

    await request(app).post('/api/approval/non-tag/receive').set(auth()).send({
      NTA_Issue_ID: issue.NTA_Issue_ID, Receive_Date: today(), issueItemIds: [itemId],
    }).expect(201);

    const second = await request(app).post('/api/approval/non-tag/receive').set(auth()).send({
      NTA_Issue_ID: issue.NTA_Issue_ID, Receive_Date: today(), issueItemIds: [itemId],
    });
    expect(second.status).toBe(400);
  });

  test('receiving against a non-existent NTA_Issue_ID 404s', async () => {
    const res = await request(app).post('/api/approval/non-tag/receive').set(auth()).send({
      NTA_Issue_ID: 999999999, Receive_Date: today(), issueItemIds: [1],
    });
    expect(res.status).toBe(404);
  });

  test('cancelling a pending non-tagged voucher marks it Cancelled and its items Cancelled', async () => {
    const issue = await issueNonTagged();

    const cancelRes = await request(app).post(`/api/approval/non-tag/issue/${issue.NTA_Issue_ID}/cancel`).set(auth()).send({ reason: 'QA non-tag cancel' });
    expect(cancelRes.status).toBe(200);

    const issueHeader = await db('tbl_non_tag_issue_header').where({ NTA_Issue_ID: issue.NTA_Issue_ID }).first();
    expect(issueHeader.Status).toBe('Cancelled');
    expect(issueHeader.Cancellation_Reason).toBe('QA non-tag cancel');

    const lineItem = await db('tbl_non_tag_issue_items').where({ NTA_Issue_ID: issue.NTA_Issue_ID }).first();
    expect(lineItem.Item_Status).toBe('Cancelled');
  });

  test('a cancelled non-tagged voucher rejects further receipt, and its by-voucher lookup 400s', async () => {
    const issue = await issueNonTagged();
    const itemId = issue.items[0].NTA_Issue_Item_ID;
    await request(app).post(`/api/approval/non-tag/issue/${issue.NTA_Issue_ID}/cancel`).set(auth()).expect(200);

    const byVoucher = await request(app).get(`/api/approval/non-tag/issue/by-voucher/${issue.Voucher_Number}`).set(auth());
    expect(byVoucher.status).toBe(400);

    const receiveRes = await request(app).post('/api/approval/non-tag/receive').set(auth()).send({
      NTA_Issue_ID: issue.NTA_Issue_ID, Receive_Date: today(), issueItemIds: [itemId],
    });
    expect(receiveRes.status).toBe(400);
  });

  test('a non-tagged voucher with a partial receive can no longer be cancelled', async () => {
    const issue = await issueNonTagged({
      items: [
        { Item_Type: 'Ring', Gross_Weight: 4, Approx_Value: 9000 },
        { Item_Type: 'Bangle', Gross_Weight: 20, Approx_Value: 60000 },
      ],
    });
    const firstItemId = issue.items[0].NTA_Issue_Item_ID;
    await request(app).post('/api/approval/non-tag/receive').set(auth()).send({
      NTA_Issue_ID: issue.NTA_Issue_ID, Receive_Date: today(), issueItemIds: [firstItemId],
    }).expect(201);

    const cancelRes = await request(app).post(`/api/approval/non-tag/issue/${issue.NTA_Issue_ID}/cancel`).set(auth()).send({});
    expect(cancelRes.status).toBe(400);

    const issueHeader = await db('tbl_non_tag_issue_header').where({ NTA_Issue_ID: issue.NTA_Issue_ID }).first();
    expect(issueHeader.Status).toBe('Partial');
  });
});

describe('GET /api/approval/issues and /api/approval/receives listing endpoints', () => {
  test('/issues supports status filtering', async () => {
    const ornament = await createOrnament();
    const issue = await issueOrnament(ornament);

    const pendingList = await request(app).get('/api/approval/issues').set(auth()).query({ status: 'Pending' });
    expect(pendingList.status).toBe(200);
    expect(pendingList.body.data.items.some(i => i.Issue_ID === issue.Issue_ID)).toBe(true);

    const completedList = await request(app).get('/api/approval/issues').set(auth()).query({ status: 'Completed' });
    expect(completedList.body.data.items.some(i => i.Issue_ID === issue.Issue_ID)).toBe(false);
  });

  test('/receives lists a completed receive with its issue voucher number joined in', async () => {
    const ornament = await createOrnament();
    const issue = await issueOrnament(ornament);
    const receiveRes = await request(app).post('/api/approval/receive').set(auth()).send({
      Issue_ID: issue.Issue_ID, Receive_Date: today(), issueItemIds: [issue.items[0].Issue_Item_ID],
    });
    expect(receiveRes.status).toBe(201);

    const list = await request(app).get('/api/approval/receives').set(auth());
    expect(list.status).toBe(200);
    const row = list.body.data.items.find(r => r.Receive_ID === receiveRes.body.data.Receive_ID);
    expect(row).toBeDefined();
    expect(row.Issue_Voucher_Number).toBe(issue.Voucher_Number);
  });
});
