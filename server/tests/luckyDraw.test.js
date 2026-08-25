/**
 * POST /api/savings/draw/conduct — previously never checked Enable_Draw
 * (on the scheme) or Draw_Applicable (on the group) at all, so a draw
 * could run against a scheme/group that had the feature explicitly
 * turned off. Also locks in: no running the same Monthly/Quarterly draw
 * twice for the same scope in the same period (Festival/Special are
 * exempt, being named one-off events), and that a real winner still gets
 * picked correctly using crypto.randomInt instead of Math.random.
 */
const request = require('supertest');
const { app } = require('../src/index');
const db = require('../src/db/knex');
const testTenant = require('./helpers/testTenant');

let tenant, token;
const auth = () => ({ Authorization: `Bearer ${token}` });

async function makeSchemeGroupMember(overrides = {}) {
  const [scheme] = await db('tbl_scheme_master').insert({
    Tenant_ID: tenant.tenantId, Scheme_Code: `QADRAW${Date.now()}`, Scheme_Name: 'QA Draw Scheme',
    Is_Active: true, Enable_Draw: overrides.Enable_Draw ?? false, Created_Date: new Date(),
  }).returning('*');
  const [group] = await db('tbl_scheme_groups').insert({
    Tenant_ID: tenant.tenantId, Scheme_ID: scheme.Scheme_ID, Group_Code: `QADRAW-G${Date.now()}`,
    Group_Name: 'QA Draw Group', Start_Date: new Date(), Monthly_Amount: 1000,
    Total_Installments: 12, Status: 'Active', Draw_Applicable: overrides.Draw_Applicable ?? false, Created_Date: new Date(),
  }).returning('*');
  const [member] = await db('tbl_scheme_members').insert({
    Tenant_ID: tenant.tenantId, Member_Number: `QADRAW-${Date.now()}`, Member_Name: 'QA Draw Member',
    Mobile: '9000000004', Scheme_ID: scheme.Scheme_ID, Group_ID: group.Group_ID,
    Joining_Date: new Date(), Installment_Amount: 1000, Total_Installments: 12,
    Installments_Paid: 1, Total_Amount_Paid: 1000, Status: 'Active', Created_Date: new Date(),
  }).returning('*');
  return { scheme, group, member };
}

beforeAll(async () => {
  tenant = await testTenant.setup();
  const res = await request(app).post('/api/auth/login').send({ username: tenant.username, password: tenant.password, tenantId: tenant.tenantId });
  token = res.body.data.token;
});

afterAll(async () => {
  await testTenant.teardown();
  await db.destroy();
});

test('rejects a draw scoped to a scheme with Enable_Draw=false', async () => {
  const { scheme } = await makeSchemeGroupMember({ Enable_Draw: false });
  const res = await request(app).post('/api/savings/draw/conduct').set(auth()).send({
    Scheme_ID: scheme.Scheme_ID, Draw_Name: 'QA Draw', Prize_Type: 'Cash', Prize_Value: 100,
  });
  expect(res.status).toBe(400);
  expect(res.body.message).toMatch(/does not have Lucky Draw enabled/);
});

test('rejects a draw scoped to a group with Draw_Applicable=false', async () => {
  const { group } = await makeSchemeGroupMember({ Draw_Applicable: false });
  const res = await request(app).post('/api/savings/draw/conduct').set(auth()).send({
    Group_ID: group.Group_ID, Draw_Name: 'QA Draw', Prize_Type: 'Cash', Prize_Value: 100,
  });
  expect(res.status).toBe(400);
  expect(res.body.message).toMatch(/not eligible for Lucky Draw/);
});

test('allows a draw against a scheme with Enable_Draw=true, picks a real winner', async () => {
  const { scheme, member } = await makeSchemeGroupMember({ Enable_Draw: true });
  const res = await request(app).post('/api/savings/draw/conduct').set(auth()).send({
    Scheme_ID: scheme.Scheme_ID, Draw_Name: 'QA Enabled Draw', Prize_Type: 'Cash', Prize_Value: 100,
  });
  expect(res.status).toBe(200);
  expect(res.body.data.winner.Member_ID).toBe(member.Member_ID);
  expect(res.body.data.draw.Eligible_Members).toBe(1);
});

test('allows a draw against a group with Draw_Applicable=true', async () => {
  const { group, member } = await makeSchemeGroupMember({ Draw_Applicable: true });
  const res = await request(app).post('/api/savings/draw/conduct').set(auth()).send({
    Group_ID: group.Group_ID, Draw_Name: 'QA Applicable Draw', Prize_Type: 'Cash', Prize_Value: 100,
  });
  expect(res.status).toBe(200);
  expect(res.body.data.winner.Member_ID).toBe(member.Member_ID);
});

test('a tenant-wide draw (no Scheme_ID or Group_ID) is unaffected by either flag', async () => {
  await makeSchemeGroupMember({ Enable_Draw: false, Draw_Applicable: false });
  const res = await request(app).post('/api/savings/draw/conduct').set(auth()).send({
    Draw_Name: 'QA Tenant-wide Draw', Prize_Type: 'Cash', Prize_Value: 50,
  });
  expect(res.status).toBe(200);
  expect(res.body.data.draw.Scheme_ID).toBeNull();
  expect(res.body.data.draw.Group_ID).toBeNull();
});

test('running the same Monthly draw twice for the same group in the same period is rejected', async () => {
  const { group } = await makeSchemeGroupMember({ Draw_Applicable: true });
  const first = await request(app).post('/api/savings/draw/conduct').set(auth()).send({
    Group_ID: group.Group_ID, Draw_Name: 'QA Monthly Draw', Draw_Type: 'Monthly', Prize_Type: 'Cash', Prize_Value: 100,
  });
  expect(first.status).toBe(200);

  const second = await request(app).post('/api/savings/draw/conduct').set(auth()).send({
    Group_ID: group.Group_ID, Draw_Name: 'QA Monthly Draw Again', Draw_Type: 'Monthly', Prize_Type: 'Cash', Prize_Value: 100,
  });
  expect(second.status).toBe(400);
  expect(second.body.message).toMatch(/already ran this period/);
});

test('a Festival draw for the same group CAN run more than once (named one-off events are exempt from the period check)', async () => {
  const { group } = await makeSchemeGroupMember({ Draw_Applicable: true });
  const first = await request(app).post('/api/savings/draw/conduct').set(auth()).send({
    Group_ID: group.Group_ID, Draw_Name: 'QA Diwali Draw', Draw_Type: 'Festival', Prize_Type: 'Gold', Prize_Value: 5000,
  });
  expect(first.status).toBe(200);

  const second = await request(app).post('/api/savings/draw/conduct').set(auth()).send({
    Group_ID: group.Group_ID, Draw_Name: 'QA Pongal Draw', Draw_Type: 'Festival', Prize_Type: 'Gold', Prize_Value: 5000,
  });
  expect(second.status).toBe(200); // no period restriction for Festival/Special
});

test('a Monthly draw for a DIFFERENT group is unaffected by another group already having run one this period', async () => {
  const { group: group1 } = await makeSchemeGroupMember({ Draw_Applicable: true });
  const { group: group2 } = await makeSchemeGroupMember({ Draw_Applicable: true });

  const first = await request(app).post('/api/savings/draw/conduct').set(auth()).send({
    Group_ID: group1.Group_ID, Draw_Name: 'QA Group1 Monthly', Draw_Type: 'Monthly', Prize_Type: 'Cash', Prize_Value: 100,
  });
  expect(first.status).toBe(200);

  const second = await request(app).post('/api/savings/draw/conduct').set(auth()).send({
    Group_ID: group2.Group_ID, Draw_Name: 'QA Group2 Monthly', Draw_Type: 'Monthly', Prize_Type: 'Cash', Prize_Value: 100,
  });
  expect(second.status).toBe(200); // different group — its own independent period check
});

test('rejects a draw with no eligible members (nobody has paid an installment yet)', async () => {
  const { scheme, group } = await makeSchemeGroupMember({ Enable_Draw: true, Draw_Applicable: true });
  await db('tbl_scheme_members').where({ Group_ID: group.Group_ID }).update({ Installments_Paid: 0 });

  const res = await request(app).post('/api/savings/draw/conduct').set(auth()).send({
    Group_ID: group.Group_ID, Draw_Name: 'QA No Eligible', Prize_Type: 'Cash', Prize_Value: 100,
  });
  expect(res.status).toBe(400);
  expect(res.body.message).toMatch(/No eligible members/);
});

test('draw history lists the conducted draws with winner details', async () => {
  const res = await request(app).get('/api/savings/draw/history').set(auth());
  expect(res.status).toBe(200);
  expect(res.body.data.length).toBeGreaterThan(0);
  expect(res.body.data[0]).toHaveProperty('Member_Name');
});
