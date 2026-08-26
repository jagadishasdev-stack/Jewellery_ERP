/**
 * Transfers never reserved stock — between create and approve/reject, an
 * item in transit stayed sellable at the POS (Is_Stock_Available never
 * flipped), and had no permission check at all. Fixed by reusing the
 * same Is_Stock_Available flag approval.js already correctly uses for
 * goods-on-approval.
 */
const request = require('supertest');
const { app } = require('../src/index');
const db = require('../src/db/knex');
const testTenant = require('./helpers/testTenant');

let tenant, token, typeId, floorAId, floorBId;
const auth = () => ({ Authorization: `Bearer ${token}` });

beforeAll(async () => {
  tenant = await testTenant.setup();
  const res = await request(app).post('/api/auth/login').send({ username: tenant.username, password: tenant.password, tenantId: tenant.tenantId });
  token = res.body.data.token;
  typeId = (await db('tbl_item_type_master').first()).Type_ID;

  const floorA = await request(app).post('/api/floors').set(auth()).send({ Branch_ID: tenant.branchId, Floor_Code: 'QATXA', Floor_Name: 'QA Transfer Floor A' });
  const floorB = await request(app).post('/api/floors').set(auth()).send({ Branch_ID: tenant.branchId, Floor_Code: 'QATXB', Floor_Name: 'QA Transfer Floor B' });
  floorAId = floorA.body.data.Floor_ID;
  floorBId = floorB.body.data.Floor_ID;
});

afterAll(async () => {
  await testTenant.teardown();
  await db.destroy();
});

async function makeOrnament(articleNumber) {
  const res = await request(app).post('/api/ornaments').set(auth()).send({
    Type_ID: typeId, Metal_Type: 'Gold', Gross_Weight: 5, Net_Gold_Weight: 4.5, Current_Gold_Rate: 6000,
    Base_Making_Charge_Per_Gram: 100, Purchase_Cost: 20000, Total_Price: 28000, Article_Number: articleNumber,
  });
  return res.body.data.Ornament_ID;
}

test('an item in transit is reserved (not sellable), and is released once approved', async () => {
  const ornamentId = await makeOrnament('QATXFER-1');
  const create = await request(app).post('/api/transfer/create').set(auth()).send({
    Transfer_Type: 'Floor', From_Floor_ID: floorAId, To_Floor_ID: floorBId,
    items: [{ Ornament_ID: ornamentId, Article_Number: 'QATXFER-1', Gross_Weight: 5 }],
  });
  expect(create.status).toBe(201);

  const midTransit = await db('tbl_ornament_master').where({ Ornament_ID: ornamentId }).first();
  expect(midTransit.Is_Stock_Available).toBe(false); // reserved — used to still be sellable here

  const approve = await request(app).post(`/api/transfer/${create.body.data.Transfer_ID}/approve`).set(auth()).send({});
  expect(approve.status).toBe(200);

  const afterApprove = await db('tbl_ornament_master').where({ Ornament_ID: ornamentId }).first();
  expect(afterApprove.Is_Stock_Available).toBe(true); // released
});

test('a rejected transfer releases the reservation too, not leaving stock permanently unsellable', async () => {
  const ornamentId = await makeOrnament('QATXFER-2');
  const create = await request(app).post('/api/transfer/create').set(auth()).send({
    Transfer_Type: 'Floor', From_Floor_ID: floorAId, To_Floor_ID: floorBId,
    items: [{ Ornament_ID: ornamentId, Article_Number: 'QATXFER-2', Gross_Weight: 5 }],
  });
  const reject = await request(app).post(`/api/transfer/${create.body.data.Transfer_ID}/reject`).set(auth()).send({});
  expect(reject.status).toBe(200);

  const row = await db('tbl_ornament_master').where({ Ornament_ID: ornamentId }).first();
  expect(row.Is_Stock_Available).toBe(true);
});

test('a reserved (in-transit) item cannot be sold at the POS', async () => {
  const ornamentId = await makeOrnament('QATXFER-3');
  await request(app).post('/api/transfer/create').set(auth()).send({
    Transfer_Type: 'Floor', From_Floor_ID: floorAId, To_Floor_ID: floorBId,
    items: [{ Ornament_ID: ornamentId, Article_Number: 'QATXFER-3', Gross_Weight: 5 }],
  });

  const sale = await request(app).post('/api/sales/create').set(auth()).send({
    Payment_Mode: 'Cash', items: [{ Ornament_ID: ornamentId, Article_Number: 'QATXFER-3', Total_Line_Price: 28000 }],
  });
  expect(sale.status).toBe(400);
});
