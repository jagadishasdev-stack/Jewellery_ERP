/**
 * Product Catalog routes (src/routes/productCatalog.js) — the customer-facing
 * B2B online catalog: exhibition display, wishlist, order requests, order
 * status transitions, and product image management.
 *
 * catalogVisibility.test.js already covers GET /exhibition, GET /search and
 * GET /public/:barcode (the Show_In_Catalog visibility rules). This file
 * covers everything else: every mutation endpoint in the file, which had
 * zero test coverage before this.
 *
 * Real gaps/bugs found while writing these tests (each demonstrated below,
 * not silently worked around):
 *
 *  1. POST /wishlist's onConflict(['Tenant_ID','Article_Number',
 *     'Customer_Mobile']).ignore() dedup silently fails to dedup when
 *     Customer_Mobile is NULL — Postgres treats NULL <> NULL for unique
 *     constraints, so two wishlist adds for the same item with no mobile on
 *     file both insert instead of the second being ignored.
 *  2. POST /orders (the older "create order from catalog" endpoint, as
 *     opposed to /order-request) never validates that the article numbers
 *     in `items` exist in inventory, and never reserves/touches
 *     tbl_ornament_master at all — unlike /order-request, which does both.
 *  3. POST /order-request's success response includes `item_type:
 *     item.Type_Name`, but the query that fetches `item` never joins
 *     tbl_item_type_master (tbl_ornament_master itself has no Type_Name
 *     column) — so item_type is always undefined in the response, even
 *     when the item has a real Type_ID.
 *  4. PUT /orders/:id/status has no state-machine guard at all: it accepts
 *     any of the four valid status values regardless of the order's
 *     current status, so an order can be moved "backward" (e.g.
 *     Delivered -> Rejected) or updated again after being Cancelled.
 */
const request = require('supertest');
const fs = require('fs');
const path = require('path');
const { app } = require('../src/index');
const db = require('../src/db/knex');
const testTenant = require('./helpers/testTenant');

let tenant, token, typeId;
const auth = () => ({ Authorization: `Bearer ${token}` });

// 1x1 transparent PNG — real bytes, real multipart upload, no fabrication.
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64'
);

const uploadedFiles = []; // track real files written to disk by upload-image, for cleanup

beforeAll(async () => {
  tenant = await testTenant.setup();
  const res = await request(app).post('/api/auth/login').send({ username: tenant.username, password: tenant.password, tenantId: tenant.tenantId });
  token = res.body.data.token;
  typeId = (await db('tbl_item_type_master').first()).Type_ID;
});

afterAll(async () => {
  await testTenant.teardown();
  await db.destroy();
  for (const f of uploadedFiles) {
    try { fs.unlinkSync(f); } catch (_) { /* already gone or never written */ }
  }
  // multer's disk storage writes the file BEFORE the route handler's own
  // validation runs, so a request that fails validation (missing
  // ornament_id/article_number, or a nonexistent article_number) still
  // leaves a real orphaned file on disk that upload-image never tracks or
  // cleans up itself — sweep any stray QATEST_* files left behind by those.
  const catalogDir = path.join(__dirname, '..', 'uploads', 'catalog');
  try {
    for (const name of fs.readdirSync(catalogDir)) {
      if (name.startsWith(`${tenant.tenantId}_`)) {
        try { fs.unlinkSync(path.join(catalogDir, name)); } catch (_) { /* ignore */ }
      }
    }
  } catch (_) { /* uploads/catalog dir missing — nothing to sweep */ }
});

async function createOrnament(overrides = {}) {
  const res = await request(app).post('/api/ornaments').set(auth()).send({
    Type_ID: typeId, Metal_Type: 'Gold', Gross_Weight: 5, Net_Gold_Weight: 4.5, Current_Gold_Rate: 6000,
    Base_Making_Charge_Per_Gram: 100, Purchase_Cost: 20000, Total_Price: 28000, ...overrides,
  });
  return res.body.data;
}

function uploadsPathFor(imageUrl) {
  // imageUrl looks like "/uploads/catalog/<file>" — resolve to the real disk path.
  return path.join(__dirname, '..', imageUrl.replace(/^\//, ''));
}

// ─────────────────────────── Wishlist ───────────────────────────────────────

describe('POST /api/catalog/wishlist', () => {
  test('rejects with 400 when article_number is missing', async () => {
    const res = await request(app).post('/api/catalog/wishlist').set(auth()).send({});
    expect(res.status).toBe(400);
  });

  test('404s for an article_number not in inventory', async () => {
    const res = await request(app).post('/api/catalog/wishlist').set(auth()).send({ article_number: 'NO-SUCH-ARTICLE-XYZ' });
    expect(res.status).toBe(404);
  });

  test('rejects wishlisting a sold item with 400', async () => {
    const ornament = await createOrnament({ Article_Number: 'WISH-SOLD-001' });
    await db('tbl_ornament_master').where({ Ornament_ID: ornament.Ornament_ID }).update({ Is_Sold: true });

    const res = await request(app).post('/api/catalog/wishlist').set(auth()).send({ article_number: 'WISH-SOLD-001' });
    expect(res.status).toBe(400);
  });

  test('adds a real item to the wishlist, correctly linked to tenant/ornament/customer', async () => {
    const ornament = await createOrnament({ Article_Number: 'WISH-ADD-001' });

    const res = await request(app).post('/api/catalog/wishlist').set(auth()).send({
      article_number: 'WISH-ADD-001', customer_mobile: '9998887771',
    });
    expect(res.status).toBe(200);

    const row = await db('tbl_catalog_wishlist').where({ Tenant_ID: tenant.tenantId, Article_Number: 'WISH-ADD-001' }).first();
    expect(row).toBeDefined();
    // Ornament_ID comes back as a number straight from the DB but as a
    // string in the /api/ornaments JSON response — compare numerically.
    expect(row.Ornament_ID).toBe(Number(ornament.Ornament_ID));
    expect(row.Customer_Mobile).toBe('9998887771');
  });

  test('BUG: dedup only works when Customer_Mobile is provided — two adds with no mobile both insert instead of the second being ignored', async () => {
    const ornament = await createOrnament({ Article_Number: 'WISH-NOMOBILE-001' });

    // req.user.mobile is undefined for this staff login and no customer_mobile
    // is passed, so both inserts go in with Customer_Mobile = NULL.
    await request(app).post('/api/catalog/wishlist').set(auth()).send({ article_number: 'WISH-NOMOBILE-001' }).expect(200);
    await request(app).post('/api/catalog/wishlist').set(auth()).send({ article_number: 'WISH-NOMOBILE-001' }).expect(200);

    const rows = await db('tbl_catalog_wishlist').where({ Tenant_ID: tenant.tenantId, Article_Number: 'WISH-NOMOBILE-001' });
    // Correct dedup behavior would leave exactly 1 row. Postgres's NULL <>
    // NULL semantics mean the unique constraint never fires here, so both
    // land — demonstrating the real gap, not asserting desired behavior.
    expect(rows).toHaveLength(2);
    expect(rows.every(r => r.Ornament_ID === Number(ornament.Ornament_ID))).toBe(true);
  });

  test('adding the SAME article+mobile twice is correctly deduped by the onConflict().ignore()', async () => {
    const ornament = await createOrnament({ Article_Number: 'WISH-DEDUP-001' });
    await request(app).post('/api/catalog/wishlist').set(auth()).send({ article_number: 'WISH-DEDUP-001', customer_mobile: '9111122223' }).expect(200);
    await request(app).post('/api/catalog/wishlist').set(auth()).send({ article_number: 'WISH-DEDUP-001', customer_mobile: '9111122223' }).expect(200);

    const rows = await db('tbl_catalog_wishlist').where({ Tenant_ID: tenant.tenantId, Article_Number: 'WISH-DEDUP-001', Customer_Mobile: '9111122223' });
    expect(rows).toHaveLength(1);
  });
});

describe('GET /api/catalog/wishlist', () => {
  test('lists items for the tenant, filterable by customer_mobile, with live availability enrichment', async () => {
    const available = await createOrnament({ Article_Number: 'WISH-LIST-AVAIL' });
    const sold = await createOrnament({ Article_Number: 'WISH-LIST-SOLD' });
    const reserved = await createOrnament({ Article_Number: 'WISH-LIST-RESERVED' });

    await request(app).post('/api/catalog/wishlist').set(auth()).send({ article_number: 'WISH-LIST-AVAIL', customer_mobile: '9222233334' }).expect(200);
    await request(app).post('/api/catalog/wishlist').set(auth()).send({ article_number: 'WISH-LIST-RESERVED', customer_mobile: '9222233334' }).expect(200);
    await request(app).post('/api/catalog/wishlist').set(auth()).send({ article_number: 'WISH-LIST-SOLD', customer_mobile: '9222233334' }).expect(200);

    // Mark sold/reserved AFTER wishlisting — the item still must have been
    // wishlist-able while available; then its live state changes underneath.
    await db('tbl_ornament_master').where({ Ornament_ID: sold.Ornament_ID }).update({ Is_Sold: true });
    await db('tbl_ornament_master').where({ Ornament_ID: reserved.Ornament_ID }).update({ Is_On_Approval: true });

    const res = await request(app).get('/api/catalog/wishlist').set(auth()).query({ customer_mobile: '9222233334' });
    expect(res.status).toBe(200);

    const byArticle = Object.fromEntries(res.body.data.map(i => [i.Article_Number, i]));
    expect(byArticle['WISH-LIST-AVAIL'].availability).toBe('Available');
    expect(byArticle['WISH-LIST-SOLD'].availability).toBe('Sold');
    expect(byArticle['WISH-LIST-RESERVED'].availability).toBe('Reserved');

    // Filter genuinely narrows results — a different mobile sees none of these.
    const other = await request(app).get('/api/catalog/wishlist').set(auth()).query({ customer_mobile: '0000000000' });
    expect(other.body.data.some(i => i.Article_Number === 'WISH-LIST-AVAIL')).toBe(false);
  });
});

describe('DELETE /api/catalog/wishlist/:id', () => {
  test('removes the row from the DB', async () => {
    await createOrnament({ Article_Number: 'WISH-DEL-001' });
    await request(app).post('/api/catalog/wishlist').set(auth()).send({ article_number: 'WISH-DEL-001', customer_mobile: '9333344445' }).expect(200);
    const row = await db('tbl_catalog_wishlist').where({ Tenant_ID: tenant.tenantId, Article_Number: 'WISH-DEL-001' }).first();

    const res = await request(app).delete(`/api/catalog/wishlist/${row.Wishlist_ID}`).set(auth());
    expect(res.status).toBe(200);

    const gone = await db('tbl_catalog_wishlist').where({ Wishlist_ID: row.Wishlist_ID }).first();
    expect(gone).toBeUndefined();
  });
});

// ─────────────────────────── Order requests ─────────────────────────────────

describe('POST /api/catalog/order-request', () => {
  test('rejects with 400 when neither article_number nor ornament_id is given', async () => {
    const res = await request(app).post('/api/catalog/order-request').set(auth()).send({ customer_name: 'X' });
    expect(res.status).toBe(400);
  });

  test('404s for an item not in inventory', async () => {
    const res = await request(app).post('/api/catalog/order-request').set(auth()).send({ article_number: 'NO-SUCH-ITEM' });
    expect(res.status).toBe(404);
  });

  test('rejects an already-sold item with 400', async () => {
    const ornament = await createOrnament({ Article_Number: 'ORDREQ-SOLD-001' });
    await db('tbl_ornament_master').where({ Ornament_ID: ornament.Ornament_ID }).update({ Is_Sold: true });
    const res = await request(app).post('/api/catalog/order-request').set(auth()).send({ article_number: 'ORDREQ-SOLD-001' });
    expect(res.status).toBe(400);
  });

  test('rejects an already-reserved (Is_On_Approval) item with 400', async () => {
    const ornament = await createOrnament({ Article_Number: 'ORDREQ-RESERVED-001' });
    await db('tbl_ornament_master').where({ Ornament_ID: ornament.Ornament_ID }).update({ Is_On_Approval: true });
    const res = await request(app).post('/api/catalog/order-request').set(auth()).send({ article_number: 'ORDREQ-RESERVED-001' });
    expect(res.status).toBe(400);
  });

  test('creates a real order + order item linked to the actual ornament, and reserves the item', async () => {
    // Note: Total_Price is always server-computed from weight/rate/making
    // charge by POST /api/ornaments (ornaments.js) — a client-supplied
    // Total_Price override is silently ignored, so we read back whatever
    // the server actually priced it at rather than asserting our own input.
    const ornament = await createOrnament({ Article_Number: 'ORDREQ-OK-001' });

    const res = await request(app).post('/api/catalog/order-request').set(auth()).send({
      article_number: 'ORDREQ-OK-001', customer_name: 'Test Customer', customer_mobile: '9444455556', notes: 'please gift-wrap',
    });
    expect(res.status).toBe(201);
    expect(res.body.data.order_number).toMatch(/^ORD-/);
    expect(res.body.data.article_number).toBe('ORDREQ-OK-001');
    expect(parseFloat(res.body.data.amount)).toBeCloseTo(parseFloat(ornament.Total_Price), 1);
    // BUG #3 (see file header): item_type is always undefined — the lookup
    // query never joins tbl_item_type_master, even though Type_ID is set.
    expect(res.body.data.item_type).toBeUndefined();

    const order = await db('tbl_catalog_orders').where({ Order_ID: res.body.data.order_id }).first();
    expect(order).toBeDefined();
    expect(order.Tenant_ID).toBe(tenant.tenantId);
    expect(order.Customer_Name).toBe('Test Customer');
    expect(order.Customer_Mobile).toBe('9444455556');
    expect(order.Status).toBe('Pending');

    const items = await db('tbl_catalog_order_items').where({ Order_ID: order.Order_ID });
    expect(items).toHaveLength(1);
    expect(items[0].Article_Number).toBe('ORDREQ-OK-001');
    expect(items[0].Quantity).toBe(1);

    const updatedOrnament = await db('tbl_ornament_master').where({ Ornament_ID: ornament.Ornament_ID }).first();
    expect(updatedOrnament.Is_On_Approval).toBe(true);
  });

  test('a second order-request on the now-reserved item is rejected — confirms the reservation is real, not cosmetic', async () => {
    await createOrnament({ Article_Number: 'ORDREQ-DOUBLE-001' });
    await request(app).post('/api/catalog/order-request').set(auth()).send({ article_number: 'ORDREQ-DOUBLE-001' }).expect(201);

    const res = await request(app).post('/api/catalog/order-request').set(auth()).send({ article_number: 'ORDREQ-DOUBLE-001' });
    expect(res.status).toBe(400);
  });
});

// ─────────────────────────── Order status transitions ──────────────────────

describe('PUT /api/catalog/orders/:id/status', () => {
  async function placeOrderRequest(articleNumber) {
    await createOrnament({ Article_Number: articleNumber });
    const res = await request(app).post('/api/catalog/order-request').set(auth()).send({ article_number: articleNumber }).expect(201);
    return res.body.data.order_id;
  }

  test('rejects an invalid status value with 400', async () => {
    const orderId = await placeOrderRequest('STATUS-INVALID-001');
    const res = await request(app).put(`/api/catalog/orders/${orderId}/status`).set(auth()).send({ status: 'NotARealStatus' });
    expect(res.status).toBe(400);
  });

  test('404s for a non-existent order', async () => {
    const res = await request(app).put('/api/catalog/orders/9999999/status').set(auth()).send({ status: 'Confirmed' });
    expect(res.status).toBe(404);
  });

  test('Confirmed updates status but does NOT release the reservation', async () => {
    const orderId = await placeOrderRequest('STATUS-CONFIRM-001');
    const res = await request(app).put(`/api/catalog/orders/${orderId}/status`).set(auth()).send({ status: 'Confirmed' });
    expect(res.status).toBe(200);

    const order = await db('tbl_catalog_orders').where({ Order_ID: orderId }).first();
    expect(order.Status).toBe('Confirmed');

    const ornament = await db('tbl_ornament_master').where({ Article_Number: 'STATUS-CONFIRM-001' }).first();
    expect(ornament.Is_On_Approval).toBe(true); // still reserved — only Rejected/Cancelled release it
  });

  test('Rejected releases the reservation and appends the reason to Notes', async () => {
    const orderId = await placeOrderRequest('STATUS-REJECT-001');
    const res = await request(app).put(`/api/catalog/orders/${orderId}/status`).set(auth()).send({ status: 'Rejected', reason: 'Out of stock' });
    expect(res.status).toBe(200);

    const order = await db('tbl_catalog_orders').where({ Order_ID: orderId }).first();
    expect(order.Status).toBe('Rejected');
    expect(order.Notes).toMatch(/\[Rejected\]: Out of stock/);

    const ornament = await db('tbl_ornament_master').where({ Article_Number: 'STATUS-REJECT-001' }).first();
    expect(ornament.Is_On_Approval).toBe(false);
  });

  test('Cancelled also releases the reservation', async () => {
    const orderId = await placeOrderRequest('STATUS-CANCEL-001');
    await request(app).put(`/api/catalog/orders/${orderId}/status`).set(auth()).send({ status: 'Cancelled' }).expect(200);

    const ornament = await db('tbl_ornament_master').where({ Article_Number: 'STATUS-CANCEL-001' }).first();
    expect(ornament.Is_On_Approval).toBe(false);
  });

  test('BUG: no state-machine guard — a Cancelled order can still be moved to Delivered (or any other status) afterward', async () => {
    const orderId = await placeOrderRequest('STATUS-NOGUARD-001');
    await request(app).put(`/api/catalog/orders/${orderId}/status`).set(auth()).send({ status: 'Cancelled' }).expect(200);

    // A real state machine would reject moving a Cancelled order forward.
    // This route has no such guard — it happily accepts it.
    const res = await request(app).put(`/api/catalog/orders/${orderId}/status`).set(auth()).send({ status: 'Delivered' });
    expect(res.status).toBe(200);
    const order = await db('tbl_catalog_orders').where({ Order_ID: orderId }).first();
    expect(order.Status).toBe('Delivered');
  });
});

// ─────────────────────────── POST/GET /api/catalog/orders ──────────────────

describe('POST /api/catalog/orders (legacy create-order-from-catalog)', () => {
  test('creates an order + items with NO inventory validation and NO reservation — unlike /order-request', async () => {
    const res = await request(app).post('/api/catalog/orders').set(auth()).send({
      customer_name: 'Legacy Customer', customer_mobile: '9555566667', notes: 'legacy path',
      items: [{ article_number: 'DOES-NOT-EXIST-IN-INVENTORY', qty: 2, notes: 'line note' }],
    });
    expect(res.status).toBe(201);
    expect(res.body.data.order_number).toMatch(/^ORD-/);

    const order = await db('tbl_catalog_orders').where({ Order_ID: res.body.data.order_id }).first();
    expect(order).toBeDefined();
    expect(order.Customer_Name).toBe('Legacy Customer');

    const items = await db('tbl_catalog_order_items').where({ Order_ID: order.Order_ID });
    expect(items).toHaveLength(1);
    expect(items[0].Article_Number).toBe('DOES-NOT-EXIST-IN-INVENTORY'); // never checked against tbl_ornament_master
    expect(items[0].Quantity).toBe(2);
  });
});

describe('GET /api/catalog/orders', () => {
  test('lists orders scoped to tenant, filterable by mobile and status', async () => {
    await request(app).post('/api/catalog/orders').set(auth()).send({
      customer_name: 'Filter Test A', customer_mobile: '9666677778', items: [],
    }).expect(201);
    await request(app).post('/api/catalog/orders').set(auth()).send({
      customer_name: 'Filter Test B', customer_mobile: '9777788889', items: [],
    }).expect(201);

    const byMobile = await request(app).get('/api/catalog/orders').set(auth()).query({ mobile: '9666677778' });
    expect(byMobile.status).toBe(200);
    expect(byMobile.body.data.every(o => o.Customer_Mobile === '9666677778')).toBe(true);
    expect(byMobile.body.data.some(o => o.Customer_Name === 'Filter Test A')).toBe(true);

    const byStatus = await request(app).get('/api/catalog/orders').set(auth()).query({ status: 'Pending' });
    expect(byStatus.status).toBe(200);
    expect(byStatus.body.data.every(o => o.Status === 'Pending')).toBe(true);
  });
});

// ─────────────────────────── Exhibition toggle ──────────────────────────────

describe('PUT /api/catalog/exhibition/:id', () => {
  test('toggles Is_On_Display on and off for a real item', async () => {
    const ornament = await createOrnament({ Article_Number: 'EXHIBIT-TOGGLE-001', Is_On_Display: false });

    const on = await request(app).put(`/api/catalog/exhibition/${ornament.Ornament_ID}`).set(auth()).send({ is_display: true });
    expect(on.status).toBe(200);
    let row = await db('tbl_ornament_master').where({ Ornament_ID: ornament.Ornament_ID }).first();
    expect(row.Is_On_Display).toBe(true);

    const off = await request(app).put(`/api/catalog/exhibition/${ornament.Ornament_ID}`).set(auth()).send({ is_display: false });
    expect(off.status).toBe(200);
    row = await db('tbl_ornament_master').where({ Ornament_ID: ornament.Ornament_ID }).first();
    expect(row.Is_On_Display).toBe(false);
  });
});

// ─────────────────────────── Image upload / management ─────────────────────
// upload-image is a genuine multipart (multer) endpoint — exercised here with
// a real 1x1 PNG buffer via supertest's .attach(), a real file written to
// disk under uploads/catalog/, and cleaned up in afterAll. Nothing here
// fabricates a fake upload path.

describe('POST /api/catalog/upload-image', () => {
  test('rejects with 400 when no file is attached', async () => {
    const res = await request(app).post('/api/catalog/upload-image').set(auth()).field('article_number', 'X');
    expect(res.status).toBe(400);
  });

  test('rejects with 400 when neither ornament_id nor article_number is given', async () => {
    const res = await request(app).post('/api/catalog/upload-image').set(auth()).attach('image', TINY_PNG, 'test.png');
    expect(res.status).toBe(400);
  });

  test('404s when the article_number does not match a real inventory item', async () => {
    const res = await request(app).post('/api/catalog/upload-image').set(auth())
      .attach('image', TINY_PNG, 'test.png').field('article_number', 'NO-SUCH-ARTICLE-IMG');
    expect(res.status).toBe(404);
  });

  test('uploads a real image, links it to the ornament, and sets it primary (first image, sort_order 0)', async () => {
    const ornament = await createOrnament({ Article_Number: 'IMG-UPLOAD-001' });

    const res = await request(app).post('/api/catalog/upload-image').set(auth())
      .attach('image', TINY_PNG, 'first.png')
      .field('article_number', 'IMG-UPLOAD-001')
      .field('sort_order', '0');
    expect(res.status).toBe(200);
    expect(res.body.data.is_primary).toBe(true);
    expect(res.body.data.url).toMatch(/^\/uploads\/catalog\//);
    uploadedFiles.push(uploadsPathFor(res.body.data.url));
    expect(fs.existsSync(uploadsPathFor(res.body.data.url))).toBe(true);

    const imgRow = await db('tbl_product_images').where({ Tenant_ID: tenant.tenantId, Article_Number: 'IMG-UPLOAD-001' }).first();
    expect(imgRow).toBeDefined();
    expect(imgRow.Ornament_ID).toBe(Number(ornament.Ornament_ID));
    expect(imgRow.Is_Primary).toBe(true);

    const updatedOrnament = await db('tbl_ornament_master').where({ Ornament_ID: ornament.Ornament_ID }).first();
    expect(updatedOrnament.Product_Image_URL).toBe(res.body.data.url);
  });

  test('a second image (sort_order 1) is uploaded but NOT set primary', async () => {
    await createOrnament({ Article_Number: 'IMG-UPLOAD-002' });
    const first = await request(app).post('/api/catalog/upload-image').set(auth())
      .attach('image', TINY_PNG, 'a.png').field('article_number', 'IMG-UPLOAD-002').field('sort_order', '0');
    uploadedFiles.push(uploadsPathFor(first.body.data.url));

    const second = await request(app).post('/api/catalog/upload-image').set(auth())
      .attach('image', TINY_PNG, 'b.png').field('article_number', 'IMG-UPLOAD-002').field('sort_order', '1');
    expect(second.status).toBe(200);
    expect(second.body.data.is_primary).toBe(false);
    uploadedFiles.push(uploadsPathFor(second.body.data.url));

    const rows = await db('tbl_product_images').where({ Tenant_ID: tenant.tenantId, Article_Number: 'IMG-UPLOAD-002' }).orderBy('Sort_Order');
    expect(rows).toHaveLength(2);
    expect(rows[0].Is_Primary).toBe(true);
    expect(rows[1].Is_Primary).toBe(false);
  });
});

describe('GET /api/catalog/images', () => {
  test('fetches images for one ornament by ornament_id, ordered by Sort_Order', async () => {
    const ornament = await createOrnament({ Article_Number: 'IMG-LIST-001' });
    const up1 = await request(app).post('/api/catalog/upload-image').set(auth())
      .attach('image', TINY_PNG, 'a.png').field('article_number', 'IMG-LIST-001').field('sort_order', '0');
    uploadedFiles.push(uploadsPathFor(up1.body.data.url));
    const up2 = await request(app).post('/api/catalog/upload-image').set(auth())
      .attach('image', TINY_PNG, 'b.png').field('article_number', 'IMG-LIST-001').field('sort_order', '1');
    uploadedFiles.push(uploadsPathFor(up2.body.data.url));

    const res = await request(app).get('/api/catalog/images').set(auth()).query({ ornament_id: ornament.Ornament_ID });
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data[0].Sort_Order).toBe(0);
    expect(res.body.data[1].Sort_Order).toBe(1);
  });
});

describe('PUT /api/catalog/images/:id/set-primary', () => {
  test('unsets the old primary and sets the new one, syncing the ornament Product_Image_URL', async () => {
    const ornament = await createOrnament({ Article_Number: 'IMG-SETPRIMARY-001' });
    const up1 = await request(app).post('/api/catalog/upload-image').set(auth())
      .attach('image', TINY_PNG, 'a.png').field('article_number', 'IMG-SETPRIMARY-001').field('sort_order', '0');
    uploadedFiles.push(uploadsPathFor(up1.body.data.url));
    const up2 = await request(app).post('/api/catalog/upload-image').set(auth())
      .attach('image', TINY_PNG, 'b.png').field('article_number', 'IMG-SETPRIMARY-001').field('sort_order', '1');
    uploadedFiles.push(uploadsPathFor(up2.body.data.url));

    const rows = await db('tbl_product_images').where({ Tenant_ID: tenant.tenantId, Article_Number: 'IMG-SETPRIMARY-001' }).orderBy('Sort_Order');
    const secondImageId = rows[1].Image_ID;

    const res = await request(app).put(`/api/catalog/images/${secondImageId}/set-primary`).set(auth()).send({ ornament_id: ornament.Ornament_ID });
    expect(res.status).toBe(200);
    expect(res.body.data.Is_Primary).toBe(true);

    const after = await db('tbl_product_images').where({ Tenant_ID: tenant.tenantId, Article_Number: 'IMG-SETPRIMARY-001' }).orderBy('Sort_Order');
    expect(after[0].Is_Primary).toBe(false); // old primary unset
    expect(after[1].Is_Primary).toBe(true);

    const updatedOrnament = await db('tbl_ornament_master').where({ Ornament_ID: ornament.Ornament_ID }).first();
    expect(updatedOrnament.Product_Image_URL).toBe(after[1].Image_URL);
  });

  test('404s for an image that does not exist', async () => {
    const res = await request(app).put('/api/catalog/images/9999999/set-primary').set(auth()).send({});
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/catalog/images/:id', () => {
  test('deleting the primary image promotes the next one and syncs Product_Image_URL', async () => {
    const ornament = await createOrnament({ Article_Number: 'IMG-DELETE-001' });
    const up1 = await request(app).post('/api/catalog/upload-image').set(auth())
      .attach('image', TINY_PNG, 'a.png').field('article_number', 'IMG-DELETE-001').field('sort_order', '0');
    uploadedFiles.push(uploadsPathFor(up1.body.data.url));
    const up2 = await request(app).post('/api/catalog/upload-image').set(auth())
      .attach('image', TINY_PNG, 'b.png').field('article_number', 'IMG-DELETE-001').field('sort_order', '1');
    uploadedFiles.push(uploadsPathFor(up2.body.data.url));

    const rows = await db('tbl_product_images').where({ Tenant_ID: tenant.tenantId, Article_Number: 'IMG-DELETE-001' }).orderBy('Sort_Order');
    const primaryId = rows[0].Image_ID; // sort_order 0, uploaded first, was primary

    const res = await request(app).delete(`/api/catalog/images/${primaryId}`).set(auth());
    expect(res.status).toBe(200);

    const remaining = await db('tbl_product_images').where({ Tenant_ID: tenant.tenantId, Article_Number: 'IMG-DELETE-001' });
    expect(remaining).toHaveLength(1);
    expect(remaining[0].Is_Primary).toBe(true); // promoted

    const updatedOrnament = await db('tbl_ornament_master').where({ Ornament_ID: ornament.Ornament_ID }).first();
    expect(updatedOrnament.Product_Image_URL).toBe(remaining[0].Image_URL);
  });

  test('deleting the last remaining image clears the ornament Product_Image_URL', async () => {
    const ornament = await createOrnament({ Article_Number: 'IMG-DELETE-LAST-001' });
    const up1 = await request(app).post('/api/catalog/upload-image').set(auth())
      .attach('image', TINY_PNG, 'only.png').field('article_number', 'IMG-DELETE-LAST-001').field('sort_order', '0');
    uploadedFiles.push(uploadsPathFor(up1.body.data.url));

    const row = await db('tbl_product_images').where({ Tenant_ID: tenant.tenantId, Article_Number: 'IMG-DELETE-LAST-001' }).first();
    await request(app).delete(`/api/catalog/images/${row.Image_ID}`).set(auth()).expect(200);

    const updatedOrnament = await db('tbl_ornament_master').where({ Ornament_ID: ornament.Ornament_ID }).first();
    expect(updatedOrnament.Product_Image_URL).toBeNull();
  });

  test('404s for an image that does not exist', async () => {
    const res = await request(app).delete('/api/catalog/images/9999999').set(auth());
    expect(res.status).toBe(404);
  });
});
