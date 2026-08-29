/**
 * Excel Bulk Import — Orders (Master/Reports/Utility audit gap). Scoped
 * deliberately to Customer Order — lands in tbl_bin_orders with
 * Order_Type='Customer', the same table/route BillingHub's own "Order
 * Booking" modal and POST /bin/orders already use, complete with the same
 * Voucher_ID registration a manually-created order gets. Purchase Orders
 * are NOT covered by this import type (see the route's own comment).
 */
const request = require('supertest');
const XLSX = require('xlsx');
const { app } = require('../src/index');
const db = require('../src/db/knex');
const testTenant = require('./helpers/testTenant');

let tenant, token;

function buildWorkbookBuffer(rows) {
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

function post() {
  return request(app).post('/api/excel-import/orders').set('Authorization', `Bearer ${token}`);
}

beforeAll(async () => {
  tenant = await testTenant.setup();
  const res = await request(app).post('/api/auth/login').send({ username: tenant.username, password: tenant.password, tenantId: tenant.tenantId });
  token = res.body.data.token;
});

afterAll(async () => {
  await db('tbl_voucher_master').where({ Tenant_ID: tenant.tenantId, Voucher_Type: 'ORDER' }).del();
  await db('tbl_bin_orders').where({ Tenant_ID: tenant.tenantId }).del();
  await testTenant.teardown();
  await db.destroy();
});

test('imports valid rows as real Customer orders in tbl_bin_orders, with a real Voucher_ID registered', async () => {
  const res = await post().attach('file', buildWorkbookBuffer([
    { 'Party Name': 'QA Import Customer 1', 'Order Date': '2026-08-20', 'Item Description': 'Custom bangle', 'Estimated Amount': 25000, 'Advance Amount': 5000 },
    { 'Party Name': 'QA Import Customer 2', 'Order Date': '20-08-2026', 'Item Description': 'Custom ring' },
  ]), 'orders.xlsx');

  expect(res.status).toBe(200);
  expect(res.body.data.imported).toBe(2);
  expect(res.body.data.skipped).toBe(0);

  const orders = await db('tbl_bin_orders').where({ Tenant_ID: tenant.tenantId, Order_Type: 'Customer' }).whereIn('Party_Name', ['QA Import Customer 1', 'QA Import Customer 2']);
  expect(orders.length).toBe(2);
  expect(orders.every((o) => o.Status === 'Pending')).toBe(true);
  expect(orders.every((o) => o.Order_Date)).toBeTruthy();

  const vouchers = await db('tbl_voucher_master').where({ Tenant_ID: tenant.tenantId, Voucher_Type: 'ORDER' }).whereIn('Reference_ID', orders.map((o) => o.Order_ID));
  expect(vouchers.length).toBe(2); // same voucher registration a manually-created order gets
});

test('rows missing Party Name or a valid Order Date are skipped individually, not silently dropped or guessed at', async () => {
  const res = await post().attach('file', buildWorkbookBuffer([
    { 'Party Name': '', 'Order Date': '2026-08-20', 'Item Description': 'No party name' },
    { 'Party Name': 'QA Import Bad Date', 'Order Date': 'not-a-date', 'Item Description': 'Bad date' },
    { 'Party Name': 'QA Import Valid', 'Order Date': '2026-08-21', 'Item Description': 'Valid row' },
  ]), 'orders.xlsx');

  expect(res.status).toBe(200);
  expect(res.body.data.imported).toBe(1);
  expect(res.body.data.skipped).toBe(2);
  expect(res.body.data.errors.some((e) => e.includes('Party Name is required'))).toBe(true);
  expect(res.body.data.errors.some((e) => e.includes('valid Order Date is required'))).toBe(true);
});
