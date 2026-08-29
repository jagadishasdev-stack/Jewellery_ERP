/**
 * Packet Stock — grouping ornaments into one physical packet. Genuinely
 * absent before (Missing Feature Report, Transaction Menu spec) — this is
 * the first real coverage of it.
 */
const request = require('supertest');
const { app } = require('../src/index');
const db = require('../src/db/knex');
const testTenant = require('./helpers/testTenant');

let tenant, token, typeId;
const auth = () => ({ Authorization: `Bearer ${token}` });

beforeAll(async () => {
  tenant = await testTenant.setup();
  const res = await request(app).post('/api/auth/login').send({ username: tenant.username, password: tenant.password, tenantId: tenant.tenantId });
  token = res.body.data.token;
  typeId = (await db('tbl_item_type_master').first()).Type_ID;
});

afterAll(async () => {
  await db('tbl_packet_stock_items').whereIn('Packet_ID', db('tbl_packet_stock').where({ Tenant_ID: tenant.tenantId }).select('Packet_ID')).del();
  await db('tbl_packet_stock').where({ Tenant_ID: tenant.tenantId }).del();
  await db('tbl_ornament_master').where({ Tenant_ID: tenant.tenantId }).del();
  await testTenant.teardown();
  await db.destroy();
});

async function createOrnament(articleNumber) {
  const res = await request(app).post('/api/ornaments').set(auth()).send({
    Type_ID: typeId, Metal_Type: 'Gold', Gross_Weight: 5, Net_Gold_Weight: 4.5, Current_Gold_Rate: 6000,
    Base_Making_Charge_Per_Gram: 100, Purchase_Cost: 15000, Total_Price: 18000, Article_Number: articleNumber,
  });
  return res.body.data.Ornament_ID;
}

describe('Packet Stock', () => {
  let packetId, ornamentId;

  test('creates a packet with a real Packet_Number', async () => {
    const res = await request(app).post('/api/packet-stock').set(auth()).send({ Metal_Type: 'Gold', Notes: 'QA test packet' });
    expect(res.status).toBe(201);
    expect(res.body.data.Packet_Number).toMatch(/PKT/);
    expect(res.body.data.Status).toBe('Open');
    packetId = res.body.data.Packet_ID;
  });

  test('adds an ornament to the packet', async () => {
    ornamentId = await createOrnament('QAPKT-0001');
    const res = await request(app).post(`/api/packet-stock/${packetId}/items`).set(auth()).send({ Ornament_ID: ornamentId });
    expect(res.status).toBe(201);

    const detail = await request(app).get(`/api/packet-stock/${packetId}`).set(auth());
    expect(detail.body.data.items.length).toBe(1);
    expect(detail.body.data.items[0].Article_Number).toBe('QAPKT-0001');
  });

  test('rejects adding the same ornament twice', async () => {
    const res = await request(app).post(`/api/packet-stock/${packetId}/items`).set(auth()).send({ Ornament_ID: ornamentId });
    expect(res.status).toBe(409);
  });

  test('cannot close an empty packet', async () => {
    const empty = await request(app).post('/api/packet-stock').set(auth()).send({ Metal_Type: 'Silver' });
    const res = await request(app).post(`/api/packet-stock/${empty.body.data.Packet_ID}/close`).set(auth());
    expect(res.status).toBe(400);
  });

  test('closes a packet with items, then rejects further item changes', async () => {
    const close = await request(app).post(`/api/packet-stock/${packetId}/close`).set(auth());
    expect(close.status).toBe(200);
    expect(close.body.data.Status).toBe('Closed');

    const addAfterClose = await request(app).post(`/api/packet-stock/${packetId}/items`).set(auth()).send({ Ornament_ID: ornamentId });
    expect(addAfterClose.status).toBe(400);
  });

  test('GET / lists packets with item_count', async () => {
    const res = await request(app).get('/api/packet-stock').set(auth()).query({ status: 'Closed' });
    expect(res.status).toBe(200);
    const row = res.body.data.find((p) => p.Packet_ID === packetId);
    expect(row).toBeDefined();
    expect(parseInt(row.item_count)).toBe(1);
  });
});
