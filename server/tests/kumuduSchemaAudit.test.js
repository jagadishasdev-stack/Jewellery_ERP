/**
 * Kumudu Schema Audit — the safe, confirmed gaps closed after cross-
 * referencing the pasted kumudu_jms legacy dump against this ERP's
 * Savings Scheme + CRM modules (see the published audit artifact).
 * Deliberately NOT covered here: an Interest flag on schemes (a business/
 * regulatory decision) and a customer-facing mobile ordering system (a
 * substantial, undecided scope question) — both explicitly flagged, not
 * built.
 */
const request = require('supertest');
const { app } = require('../src/index');
const db = require('../src/db/knex');
const testTenant = require('./helpers/testTenant');

let tenant, token, schemeId, groupId, memberId;
const auth = () => ({ Authorization: `Bearer ${token}` });

beforeAll(async () => {
  tenant = await testTenant.setup();
  const res = await request(app).post('/api/auth/login').send({ username: tenant.username, password: tenant.password, tenantId: tenant.tenantId });
  token = res.body.data.token;

  const scheme = await request(app).post('/api/savings/schemes').set(auth()).send({
    Scheme_Code: 'QA-KSA-01', Scheme_Name: 'QA Kumudu Audit Scheme', Duration_Months: 11, Default_Monthly_Amount: 1000,
  });
  schemeId = scheme.body.data.Scheme_ID;

  const group = await request(app).post('/api/savings/groups').set(auth()).send({
    Scheme_ID: schemeId, Group_Code: 'QA-KSA-GRP', Group_Name: 'QA Kumudu Audit Group',
    Start_Date: '2026-01-01', Monthly_Amount: 1000, Total_Installments: 11,
  });
  groupId = group.body.data.Group_ID;

  const member = await request(app).post('/api/savings/members').set(auth()).send({
    Member_Name: 'QA Kumudu Audit Member', Mobile: '9999900033', Scheme_ID: schemeId, Group_ID: groupId,
    Joining_Date: '2026-01-01', Installment_Amount: 1000,
  });
  memberId = member.body.data.Member_ID;
});

afterAll(async () => {
  await db('tbl_faq').where({ Tenant_ID: tenant.tenantId }).del();
  await testTenant.teardown();
  await db.destroy();
});

test('a group accepts the new flexible-installment / silver-balance / due-day fields via PUT', async () => {
  const res = await request(app).put(`/api/savings/groups/${groupId}`).set(auth()).send({
    Min_Installment_Amount: 500, Max_Installment_Amount: 2000, Is_Flexible_Installment: true, Payment_Due_Day: 5,
  });
  expect(res.status).toBe(200);
  expect(res.body.data.Is_Flexible_Installment).toBe(true);
  expect(parseFloat(res.body.data.Min_Installment_Amount)).toBe(500);
  expect(res.body.data.Payment_Due_Day).toBe(5);
});

test('an out-of-range Payment_Due_Day is rejected by the CHECK constraint, not silently stored', async () => {
  const res = await request(app).put(`/api/savings/groups/${groupId}`).set(auth()).send({ Payment_Due_Day: 45 });
  expect(res.status).toBe(500); // constraint violation surfaces as a DB error — the route itself has no separate range validator
  const row = await db('tbl_scheme_groups').where({ Group_ID: groupId }).first();
  expect(row.Payment_Due_Day).not.toBe(45);
});

test('a member accepts Default_Collection_Mode, and issuing a duplicate card stamps a real date', async () => {
  const res = await request(app).put(`/api/savings/members/${memberId}`).set(auth()).send({
    Default_Collection_Mode: 'Agent', Duplicate_Card_Issued: true,
  });
  expect(res.status).toBe(200);
  expect(res.body.data.Default_Collection_Mode).toBe('Agent');
  expect(res.body.data.Duplicate_Card_Issued).toBe(true);
  expect(res.body.data.Duplicate_Card_Date).not.toBeNull();
});

test('a collection records GPS + signature capture when a field agent provides them, and stays null for a plain counter collection', async () => {
  const withGeo = await request(app).post('/api/savings/collect').set(auth()).send({
    Member_ID: memberId, Amount: 1000, Payment_Mode: 'Cash', Collection_Source: 'Agent',
    Signature_Data: 'data:image/png;base64,QAtest', Latitude: 12.9716, Longitude: 77.5946,
  });
  expect(withGeo.status).toBe(201);
  const txn1 = await db('tbl_scheme_transactions').where({ Receipt_Number: withGeo.body.data.transaction.Receipt_Number }).first();
  expect(txn1.Signature_Data).toBe('data:image/png;base64,QAtest');
  expect(parseFloat(txn1.Latitude)).toBeCloseTo(12.9716, 4);

  const counter = await request(app).post('/api/savings/collect').set(auth()).send({
    Member_ID: memberId, Amount: 1000, Payment_Mode: 'Cash',
  });
  expect(counter.status).toBe(201);
  const txn2 = await db('tbl_scheme_transactions').where({ Receipt_Number: counter.body.data.transaction.Receipt_Number }).first();
  expect(txn2.Signature_Data).toBeNull();
  expect(txn2.Latitude).toBeNull();
});

test('tbl_agent_master now distinguishes a field-collection agent from a rate-booking commission agent via Agent_Type', async () => {
  const collectionAgent = await request(app).post('/api/savings/agents').set(auth()).send({ Agent_Name: 'QA Collection Agent', Mobile: '9999900044' });
  expect(collectionAgent.status).toBe(201);
  expect(collectionAgent.body.data.Agent_Type).toBe('Collection');

  const rateAgent = await request(app).post('/api/rate-agent/agents').set(auth()).send({ Agent_Name: 'QA Rate Booking Agent', Mobile: '9999900055', Commission_Pct: 2 });
  expect(rateAgent.status).toBe(201);
  expect(rateAgent.body.data.Agent_Type).toBe('Rate_Booking');
});

test('CRM: a rating criteria can be created and used for an itemized feedback score alongside the existing single Rating', async () => {
  const criteria = await request(app).post('/api/crm/rating-criteria').set(auth()).send({ Criteria_Name: 'QA Showroom Atmosphere' });
  expect(criteria.status).toBe(201);
  const criteriaId = criteria.body.data.Criteria_ID;

  const feedback = await request(app).post('/api/crm/feedback').set(auth()).send({
    Rating: 4, Feedback_Type: 'General',
    Ratings: [{ Criteria_ID: criteriaId, Score: 5 }],
  });
  expect(feedback.status).toBe(201);
  expect(feedback.body.data.Rating).toBe(4); // the original aggregate field, unaffected

  const list = await request(app).get('/api/crm/feedback').set(auth());
  const row = list.body.data.find((f) => f.Feedback_ID === feedback.body.data.Feedback_ID);
  expect(row.Itemized_Ratings).toEqual([{ Criteria_Name: 'QA Showroom Atmosphere', Score: 5 }]);
});

test('CRM: a malformed itemized rating (score out of range) is skipped without failing the whole feedback submission', async () => {
  const criteria = await request(app).post('/api/crm/rating-criteria').set(auth()).send({ Criteria_Name: 'QA Staff Behaviour' });
  const feedback = await request(app).post('/api/crm/feedback').set(auth()).send({
    Rating: 3, Ratings: [{ Criteria_ID: criteria.body.data.Criteria_ID, Score: 99 }],
  });
  expect(feedback.status).toBe(201); // the feedback itself still saves
  const ratingRows = await db('tbl_crm_feedback_ratings').where({ Feedback_ID: feedback.body.data.Feedback_ID });
  expect(ratingRows.length).toBe(0); // but the bad score was skipped, not stored
});

test('CRM: configurable dropdown lists reject an unknown List_Type and enforce per-tenant uniqueness', async () => {
  const bad = await request(app).post('/api/crm/lists/NotAType').set(auth()).send({ Value: 'x' });
  expect(bad.status).toBe(400);

  const add = await request(app).post('/api/crm/lists/LeadSource').set(auth()).send({ Value: 'QA Trade Show' });
  expect(add.status).toBe(201);
  const dup = await request(app).post('/api/crm/lists/LeadSource').set(auth()).send({ Value: 'QA Trade Show' });
  expect(dup.status).toBe(409);

  const list = await request(app).get('/api/crm/lists/LeadSource').set(auth());
  expect(list.body.data.some((r) => r.Value === 'QA Trade Show')).toBe(true);
});

test('a customer round-trips the new Annual_Income / Profession / Is_Blocklisted fields through the existing customer routes', async () => {
  const create = await request(app).post('/api/customers').set(auth()).send({
    Customer_Name: 'QA Kumudu Audit Customer', Mobile_1: '9999900066', Annual_Income: 500000, Profession: 'Business Owner',
  });
  expect(create.status).toBe(201);
  expect(parseFloat(create.body.data.Annual_Income)).toBe(500000);

  const block = await request(app).put(`/api/customers/${create.body.data.Customer_ID}`).set(auth()).send({ Is_Blocklisted: true, Blocklist_Reason: 'QA test reason' });
  expect(block.status).toBe(200);
  expect(block.body.data.Is_Blocklisted).toBe(true);
});

test('FAQ: full CRUD round-trip, tenant-scoped', async () => {
  const create = await request(app).post('/api/faq').set(auth()).send({ Question: 'QA test question?', Answer: 'QA test answer.' });
  expect(create.status).toBe(201);
  const faqId = create.body.data.FAQ_ID;

  const list = await request(app).get('/api/faq').set(auth());
  expect(list.body.data.some((f) => f.FAQ_ID === faqId)).toBe(true);

  const update = await request(app).put(`/api/faq/${faqId}`).set(auth()).send({ Answer: 'QA updated answer.' });
  expect(update.body.data.Answer).toBe('QA updated answer.');

  const del = await request(app).delete(`/api/faq/${faqId}`).set(auth());
  expect(del.status).toBe(200);
  const afterDelete = await request(app).get('/api/faq').set(auth());
  expect(afterDelete.body.data.some((f) => f.FAQ_ID === faqId)).toBe(false);
});
