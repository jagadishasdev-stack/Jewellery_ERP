/**
 * CRM module (src/routes/crm.js) — leads (walk-in/enquiry capture before
 * someone becomes a paying tbl_customer_master row), follow-ups against a
 * lead or an existing customer, lead-to-customer conversion, and customer
 * feedback. Ported from legacy crm_lead_entry/crm_master + custfollowups/
 * cust_feedback (see migration 20260807120300_create_crm_module.js) and had
 * zero real test coverage before this file — only a generic permission-gate
 * smoke test (moduleOverrideFullCoverage.test.js) ever touched it, and only
 * GET /leads at that.
 */
const request = require('supertest');
const dayjs = require('dayjs');
const { app } = require('../src/index');
const db = require('../src/db/knex');
const testTenant = require('./helpers/testTenant');

let tenant, token;
const auth = () => ({ Authorization: `Bearer ${token}` });

beforeAll(async () => {
  tenant = await testTenant.setup();
  const res = await request(app).post('/api/auth/login').send({ username: tenant.username, password: tenant.password, tenantId: tenant.tenantId });
  token = res.body.data.token;
});

afterAll(async () => {
  // Children before parents — feedback/followups/leads all cascade from
  // tbl_tenant_master on delete, and any converted customer cascades too,
  // but be explicit and order-safe rather than relying on that.
  await db('tbl_customer_feedback').where({ Tenant_ID: tenant.tenantId }).del();
  await db('tbl_crm_followup').where({ Tenant_ID: tenant.tenantId }).del();
  await db('tbl_crm_lead').where({ Tenant_ID: tenant.tenantId }).del();
  await testTenant.teardown();
  await db.destroy();
});

// ── Leads ────────────────────────────────────────────────────────────────────

describe('POST /api/crm/leads', () => {
  test('requires Lead_Name and Mobile', async () => {
    const res = await request(app).post('/api/crm/leads').set(auth()).send({});
    expect(res.status).toBe(422);
    const fields = res.body.errors.map((e) => e.field);
    expect(fields).toEqual(expect.arrayContaining(['Lead_Name', 'Mobile']));
  });

  test('creates a lead defaulted to Status=New, tagged with the caller as Created_By', async () => {
    const res = await request(app).post('/api/crm/leads').set(auth()).send({
      Lead_Name: 'Walk-in Enquiry One', Mobile: '9000000001', Source: 'Walk-in', Interested_In: 'Gold necklace',
    });
    expect(res.status).toBe(201);
    expect(res.body.data.Status).toBe('New');
    expect(res.body.data.Created_By).toBe(tenant.username);
    expect(res.body.data.Lead_Name).toBe('Walk-in Enquiry One');

    const row = await db('tbl_crm_lead').where({ Lead_ID: res.body.data.Lead_ID }).first();
    expect(row).toBeDefined();
    expect(row.Tenant_ID).toBe(tenant.tenantId);
    expect(row.Mobile).toBe('9000000001');
    expect(row.Status).toBe('New');
    expect(row.Converted_Customer_ID).toBeNull();
  });
});

describe('GET /api/crm/leads', () => {
  let leadA, leadB;

  beforeAll(async () => {
    const a = await request(app).post('/api/crm/leads').set(auth()).send({ Lead_Name: 'Filter Lead A', Mobile: '9000000002' });
    leadA = a.body.data;
    const b = await request(app).post('/api/crm/leads').set(auth()).send({ Lead_Name: 'Filter Lead B', Mobile: '9000000003' });
    leadB = b.body.data;
    // Move B out of New so the status filter has something real to distinguish.
    await request(app).put(`/api/crm/leads/${leadB.Lead_ID}`).set(auth()).send({ Status: 'Contacted' });
  });

  test('lists every lead for this tenant, newest first, joined with the assigned user\'s name', async () => {
    const res = await request(app).get('/api/crm/leads').set(auth());
    expect(res.status).toBe(200);
    const ids = res.body.data.map((l) => l.Lead_ID);
    expect(ids).toEqual(expect.arrayContaining([leadA.Lead_ID, leadB.Lead_ID]));
    // Created_Date desc — leadB was created after leadA, so it must sort first.
    expect(ids.indexOf(leadB.Lead_ID)).toBeLessThan(ids.indexOf(leadA.Lead_ID));
  });

  test('?status= filters to only that status', async () => {
    const res = await request(app).get('/api/crm/leads').set(auth()).query({ status: 'Contacted' });
    expect(res.status).toBe(200);
    expect(res.body.data.every((l) => l.Status === 'Contacted')).toBe(true);
    expect(res.body.data.some((l) => l.Lead_ID === leadB.Lead_ID)).toBe(true);
    expect(res.body.data.some((l) => l.Lead_ID === leadA.Lead_ID)).toBe(false);
  });
});

describe('PUT /api/crm/leads/:id', () => {
  test('updates fields and stamps Modified_Date', async () => {
    const created = await request(app).post('/api/crm/leads').set(auth()).send({ Lead_Name: 'To Update', Mobile: '9000000004' });
    const before = created.body.data.Modified_Date;

    const res = await request(app).put(`/api/crm/leads/${created.body.data.Lead_ID}`).set(auth()).send({ Status: 'Contacted', Remarks: 'Called, interested in rings' });
    expect(res.status).toBe(200);
    expect(res.body.data.Status).toBe('Contacted');
    expect(res.body.data.Remarks).toBe('Called, interested in rings');
    expect(new Date(res.body.data.Modified_Date).getTime()).toBeGreaterThanOrEqual(new Date(before).getTime());
  });

  test('404s for a lead that does not belong to this tenant / does not exist', async () => {
    const res = await request(app).put('/api/crm/leads/999999999').set(auth()).send({ Status: 'Lost' });
    expect(res.status).toBe(404);
  });
});

// ── Lead-to-customer conversion ─────────────────────────────────────────────

describe('POST /api/crm/leads/:id/convert', () => {
  test('converts a lead into a real tbl_customer_master row, linked both ways, and marks the lead Converted', async () => {
    const created = await request(app).post('/api/crm/leads').set(auth()).send({
      Lead_Name: 'Convert Me', Mobile: '9000000005', Email: 'convertme@example.com',
    });
    const leadId = created.body.data.Lead_ID;

    const res = await request(app).post(`/api/crm/leads/${leadId}/convert`).set(auth()).send({});
    expect(res.status).toBe(200);
    expect(res.body.data.customer).toBeDefined();
    expect(res.body.data.lead.Status).toBe('Converted');
    expect(res.body.data.lead.Converted_Customer_ID).toBe(res.body.data.customer.Customer_ID);

    // Real customer row, actually created and correctly populated from the lead.
    const customerRow = await db('tbl_customer_master').where({ Customer_ID: res.body.data.customer.Customer_ID }).first();
    expect(customerRow).toBeDefined();
    expect(customerRow.Tenant_ID).toBe(tenant.tenantId);
    expect(customerRow.Customer_Name).toBe('Convert Me');
    expect(customerRow.Mobile_1).toBe('9000000005');
    expect(customerRow.Email).toBe('convertme@example.com');
    expect(customerRow.Is_Active).toBe(true);
    expect(customerRow.Created_By).toBe(tenant.username);
    expect(customerRow.Customer_Code).toMatch(new RegExp(`^${tenant.tenantId}-C\\d+$`));

    // Lead's own row is updated to reflect the conversion.
    const leadRow = await db('tbl_crm_lead').where({ Lead_ID: leadId }).first();
    expect(leadRow.Status).toBe('Converted');
    expect(leadRow.Converted_Customer_ID).toBe(customerRow.Customer_ID);
    expect(dayjs(leadRow.Converted_Date).format('YYYY-MM-DD')).toBe(dayjs().format('YYYY-MM-DD'));
  });

  test('converting the same lead twice is rejected with 400 — a lead can only convert once', async () => {
    const created = await request(app).post('/api/crm/leads').set(auth()).send({ Lead_Name: 'Convert Twice', Mobile: '9000000006' });
    const leadId = created.body.data.Lead_ID;

    const first = await request(app).post(`/api/crm/leads/${leadId}/convert`).set(auth()).send({});
    expect(first.status).toBe(200);

    const second = await request(app).post(`/api/crm/leads/${leadId}/convert`).set(auth()).send({});
    expect(second.status).toBe(400);
    expect(second.body.message).toMatch(/already converted/i);

    // No second customer was created off the same lead.
    const customersForLead = await db('tbl_customer_master').where({ Mobile_1: '9000000006', Tenant_ID: tenant.tenantId });
    expect(customersForLead.length).toBe(1);
  });

  test('404s converting a lead that does not exist', async () => {
    const res = await request(app).post('/api/crm/leads/999999999/convert').set(auth()).send({});
    expect(res.status).toBe(404);
  });

  // Real bug found while writing this test: the route never checks whether a
  // tbl_customer_master row with the same mobile already exists before
  // inserting. tbl_customer_master has a UNIQUE (Tenant_ID, Mobile_1)
  // constraint (see migration 002_create_tenant_tables.js), so converting a
  // second, unrelated lead that happens to share a mobile number with an
  // existing customer throws a raw Postgres unique-violation, caught by the
  // generic catch block and surfaced as a 500 with the raw DB error message
  // — not a clean, user-facing 4xx like "a customer with this mobile already
  // exists". This test documents that CURRENT behavior; it is not a
  // false-passing workaround.
  test('FIXED: converting a lead whose mobile collides with an existing customer now returns a clean 409 instead of a raw DB-error 500', async () => {
    const existingCustomer = await request(app).post('/api/crm/leads').set(auth()).send({ Lead_Name: 'Already A Customer', Mobile: '9000000007' });
    const convertFirst = await request(app).post(`/api/crm/leads/${existingCustomer.body.data.Lead_ID}/convert`).set(auth()).send({});
    expect(convertFirst.status).toBe(200);

    const collidingLead = await request(app).post('/api/crm/leads').set(auth()).send({ Lead_Name: 'Collides On Mobile', Mobile: '9000000007' });
    const res = await request(app).post(`/api/crm/leads/${collidingLead.body.data.Lead_ID}/convert`).set(auth()).send({});

    expect(res.status).toBe(409);

    // The lead itself is left exactly as it was before the failed attempt.
    const leadRow = await db('tbl_crm_lead').where({ Lead_ID: collidingLead.body.data.Lead_ID }).first();
    expect(leadRow.Status).toBe('New');
    expect(leadRow.Converted_Customer_ID).toBeNull();
  });
});

// ── Follow-ups ───────────────────────────────────────────────────────────────

describe('Follow-ups', () => {
  let lead, customer;

  beforeAll(async () => {
    const created = await request(app).post('/api/crm/leads').set(auth()).send({ Lead_Name: 'Followup Lead', Mobile: '9000000008' });
    lead = created.body.data;
    const converted = await request(app).post(`/api/crm/leads/${lead.Lead_ID}/convert`).set(auth()).send({});
    customer = converted.body.data.customer;
  });

  test('POST /api/crm/followups requires Remarks', async () => {
    const res = await request(app).post('/api/crm/followups').set(auth()).send({ Lead_ID: lead.Lead_ID });
    expect(res.status).toBe(422);
    expect(res.body.errors.some((e) => e.field === 'Remarks')).toBe(true);
  });

  test('logs a follow-up against a lead, linked to it, stamped with the caller as Done_By', async () => {
    const res = await request(app).post('/api/crm/followups').set(auth()).send({
      Lead_ID: lead.Lead_ID, Contact_Mode: 'Call', Remarks: 'Discussed budget', Next_Followup_Date: dayjs().add(3, 'day').format('YYYY-MM-DD'),
    });
    expect(res.status).toBe(201);
    expect(res.body.data.Lead_ID).toBe(String(lead.Lead_ID)); // bigint comes back as string from pg
    expect(res.body.data.Customer_ID).toBeNull();
    expect(res.body.data.Contact_Mode).toBe('Call');
    expect(res.body.data.Done_By).toBe(tenant.userId);

    const row = await db('tbl_crm_followup').where({ Followup_ID: res.body.data.Followup_ID }).first();
    expect(row.Tenant_ID).toBe(tenant.tenantId);
    expect(Number(row.Lead_ID)).toBe(Number(lead.Lead_ID));
    expect(dayjs(row.Next_Followup_Date).format('YYYY-MM-DD')).toBe(dayjs().add(3, 'day').format('YYYY-MM-DD'));
  });

  test('also logs a follow-up against a converted customer (Customer_ID instead of Lead_ID)', async () => {
    const res = await request(app).post('/api/crm/followups').set(auth()).send({
      Customer_ID: customer.Customer_ID, Contact_Mode: 'WhatsApp', Remarks: 'Sent catalog',
    });
    expect(res.status).toBe(201);
    expect(res.body.data.Customer_ID).toBe(customer.Customer_ID);
    expect(res.body.data.Lead_ID).toBeNull();
  });

  test('GET /api/crm/followups?leadId= scopes to that lead only', async () => {
    const res = await request(app).get('/api/crm/followups').set(auth()).query({ leadId: lead.Lead_ID });
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    expect(res.body.data.every((f) => Number(f.Lead_ID) === Number(lead.Lead_ID))).toBe(true);
  });

  test('GET /api/crm/followups?customerId= scopes to that customer only', async () => {
    const res = await request(app).get('/api/crm/followups').set(auth()).query({ customerId: customer.Customer_ID });
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    expect(res.body.data.every((f) => f.Customer_ID === customer.Customer_ID)).toBe(true);
  });

  test('GET /api/crm/followups?dueOnly=true only returns follow-ups whose Next_Followup_Date has arrived', async () => {
    // A follow-up due yesterday must show up under dueOnly=true...
    const dueLead = await request(app).post('/api/crm/leads').set(auth()).send({ Lead_Name: 'Due Followup Lead', Mobile: '9000000009' });
    const overdue = await request(app).post('/api/crm/followups').set(auth()).send({
      Lead_ID: dueLead.body.data.Lead_ID, Remarks: 'Overdue call', Next_Followup_Date: dayjs().subtract(1, 'day').format('YYYY-MM-DD'),
    });
    // ...but one scheduled a week out must not.
    const notDue = await request(app).post('/api/crm/followups').set(auth()).send({
      Lead_ID: dueLead.body.data.Lead_ID, Remarks: 'Future call', Next_Followup_Date: dayjs().add(7, 'day').format('YYYY-MM-DD'),
    });

    const res = await request(app).get('/api/crm/followups').set(auth()).query({ dueOnly: 'true', leadId: dueLead.body.data.Lead_ID });
    expect(res.status).toBe(200);
    const ids = res.body.data.map((f) => f.Followup_ID);
    expect(ids).toContain(overdue.body.data.Followup_ID);
    expect(ids).not.toContain(notDue.body.data.Followup_ID);
  });
});

// ── Feedback ─────────────────────────────────────────────────────────────────

describe('Feedback', () => {
  let customer;

  beforeAll(async () => {
    const created = await request(app).post('/api/crm/leads').set(auth()).send({ Lead_Name: 'Feedback Customer', Mobile: '9000000010' });
    const converted = await request(app).post(`/api/crm/leads/${created.body.data.Lead_ID}/convert`).set(auth()).send({});
    customer = converted.body.data.customer;
  });

  test('POST /api/crm/feedback requires Rating to be an integer 1-5', async () => {
    const missing = await request(app).post('/api/crm/feedback').set(auth()).send({ Customer_ID: customer.Customer_ID });
    expect(missing.status).toBe(422);

    const outOfRange = await request(app).post('/api/crm/feedback').set(auth()).send({ Customer_ID: customer.Customer_ID, Rating: 6 });
    expect(outOfRange.status).toBe(422);
  });

  test('records feedback defaulted to Status=Open, with rating/category/comments stored as sent', async () => {
    const res = await request(app).post('/api/crm/feedback').set(auth()).send({
      Customer_ID: customer.Customer_ID, Rating: 4, Feedback_Type: 'Suggestion', Comments: 'Loved the design, wished for faster billing.',
    });
    expect(res.status).toBe(201);
    expect(res.body.data.Status).toBe('Open');
    expect(res.body.data.Rating).toBe(4);
    expect(res.body.data.Feedback_Type).toBe('Suggestion');
    expect(res.body.data.Comments).toBe('Loved the design, wished for faster billing.');

    const row = await db('tbl_customer_feedback').where({ Feedback_ID: res.body.data.Feedback_ID }).first();
    expect(row.Tenant_ID).toBe(tenant.tenantId);
    expect(row.Customer_ID).toBe(customer.Customer_ID);
    expect(row.Status).toBe('Open');
  });

  test('GET /api/crm/feedback joins in the customer name and supports ?status= filtering', async () => {
    const listed = await request(app).get('/api/crm/feedback').set(auth()).query({ status: 'Open' });
    expect(listed.status).toBe(200);
    const match = listed.body.data.find((f) => f.Customer_ID === customer.Customer_ID);
    expect(match).toBeDefined();
    expect(match.Customer_Name).toBe('Feedback Customer');
    expect(listed.body.data.every((f) => f.Status === 'Open')).toBe(true);
  });

  // Fixed: the route used to declare [body('Resolution_Notes').notEmpty()]
  // as validation middleware but its handler never called
  // validationResult(req) — an empty resolve silently succeeded. Now enforced.
  test('FIXED: PUT /api/crm/feedback/:id/resolve now actually enforces its declared Resolution_Notes requirement', async () => {
    const created = await request(app).post('/api/crm/feedback').set(auth()).send({ Customer_ID: customer.Customer_ID, Rating: 2, Comments: 'Slow service' });
    const feedbackId = created.body.data.Feedback_ID;

    const missingNotes = await request(app).put(`/api/crm/feedback/${feedbackId}/resolve`).set(auth()).send({});
    expect(missingNotes.status).toBe(422);

    const unresolvedRow = await db('tbl_customer_feedback').where({ Feedback_ID: feedbackId }).first();
    expect(unresolvedRow.Status).not.toBe('Resolved'); // unaffected

    const res = await request(app).put(`/api/crm/feedback/${feedbackId}/resolve`).set(auth()).send({ Resolution_Notes: 'Called customer, apologized, offered a discount voucher.' });
    expect(res.status).toBe(200);
    expect(res.body.data.Status).toBe('Resolved');
    expect(res.body.data.Resolution_Notes).toBe('Called customer, apologized, offered a discount voucher.');

    const row = await db('tbl_customer_feedback').where({ Feedback_ID: feedbackId }).first();
    expect(row.Status).toBe('Resolved');

    // And it now falls out of the ?status=Open filter.
    const openList = await request(app).get('/api/crm/feedback').set(auth()).query({ status: 'Open' });
    expect(openList.body.data.some((f) => f.Feedback_ID === feedbackId)).toBe(false);
  });

  test('PUT /api/crm/feedback/:id/resolve 404s for feedback that does not exist', async () => {
    const res = await request(app).put('/api/crm/feedback/999999999/resolve').set(auth()).send({ Resolution_Notes: 'n/a' });
    expect(res.status).toBe(404);
  });
});
