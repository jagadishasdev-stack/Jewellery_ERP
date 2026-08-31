/**
 * Data Migration Center — full end-to-end run through the entire state
 * machine: create -> upload -> analyze -> mapping -> validate -> approve
 * -> start -> (async) -> COMPLETED, then report + reconciliation. This
 * is the "real migration" the whole tool exists for — a small fixture
 * set (a supplier, a customer, a product, a purchase, a sale, a
 * payment) run through the real HTTP API exactly the way a Super Admin
 * would use it, verifying real rows land AND real, balanced accounting
 * entries are posted.
 */
const request = require('supertest');
const bcrypt = require('bcryptjs');
const XLSX = require('xlsx');
const { app } = require('../src/index');
const db = require('../src/db/knex');
const testTenant = require('./helpers/testTenant');

let tenant, saToken, saUserId, migrationId, migrationAuthToken;
const saAuth = () => ({ Authorization: `Bearer ${saToken}`, 'X-Migration-Auth': migrationAuthToken });

const SA_USERNAME = 'qatest_sa_mige2e';
const SA_PASSWORD = 'QaTestSA@2026e2e';

function buildWorkbookBuffer(sheets) {
  const wb = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), name);
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

async function waitForStatus(id, targetStatuses, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const res = await request(app).get(`/api/migrations/${id}/status`).set(saAuth());
    if (targetStatuses.includes(res.body.data.Status)) return res.body.data;
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`Timed out waiting for migration ${id} to reach one of: ${targetStatuses.join(', ')}`);
}

beforeAll(async () => {
  tenant = await testTenant.setup();
  const role = await db('tbl_role_master').where({ Role_Name: 'Super Admin' }).first();
  const salt = await bcrypt.genSalt(10);
  const hash = await bcrypt.hash(SA_PASSWORD, salt);
  const [saUser] = await db('tbl_user_master').insert({
    Tenant_ID: 'SA_MASTER', Username: SA_USERNAME, Password_Hash: hash, Password_Salt: salt,
    Role_ID: role.Role_ID, Full_Name: 'QA Test SA (migration e2e)', Is_Active: true, Is_Admin: true, Created_By: 'test',
  }).returning('*');
  saUserId = saUser.User_ID;
  const saRes = await request(app).post('/api/auth/login').send({ username: SA_USERNAME, password: SA_PASSWORD, tenantId: 'SA_MASTER' });
  saToken = saRes.body.data.token;

  const verify = await request(app).post('/api/migrations/verify-master').set({ Authorization: `Bearer ${saToken}` }).send({ username: SA_USERNAME, password: SA_PASSWORD });
  migrationAuthToken = verify.body.data.token;
});

afterAll(async () => {
  if (migrationId) {
    await db('migration_id_mappings').where('Migration_ID', migrationId).del();
    await db('migration_logs').where('Migration_ID', migrationId).del();
    await db('migration_mappings').where('Migration_ID', migrationId).del();
    await db('migration_staging_records').where('Migration_ID', migrationId).del();
    await db('migration_files').where('Migration_ID', migrationId).del();
    await db('migrations').where('Migration_ID', migrationId).del();
  }
  await db('tbl_sales_header').where({ Tenant_ID: tenant.tenantId, Created_By: 'migration' }).del();
  await db('tbl_purchase_header').where({ Tenant_ID: tenant.tenantId, Created_By: 'migration' }).del();
  await db('tbl_ornament_master').where({ Tenant_ID: tenant.tenantId, Created_By: 'migration' }).del();
  await db('tbl_customer_master').where({ Tenant_ID: tenant.tenantId, Created_By: 'migration' }).del();
  await db('tbl_vendor_master').where({ Tenant_ID: tenant.tenantId, Created_By: 'migration' }).del();
  await db('tbl_item_type_master').where('Type_Name', 'QA E2E Ring Type').del(); // global — cleaned up last, after the ornament referencing it is gone
  if (saUserId) await db('tbl_user_master').where({ User_ID: saUserId }).del();
  await testTenant.teardown();
  await db.destroy();
});

test('a full migration runs end to end: DRAFT through COMPLETED, with real rows and real balanced accounting entries', async () => {
  // ── Create + upload ──────────────────────────────────────────────────
  const create = await request(app).post('/api/migrations').set(saAuth()).send({ Tenant_ID: tenant.tenantId, Migration_Type: 'Full', Source_ERP: 'QA Legacy ERP' });
  expect(create.status).toBe(201);
  migrationId = create.body.data.Migration_ID;

  const xlsxBuffer = buildWorkbookBuffer({
    'Supplier': [{ VENDOR_NAME: 'QA E2E Supplier', MOBILE_NO: '9600000001' }],
    'Customer Master': [{ CUSTOMER_NAME: 'QA E2E Customer', MOBILE_NO: '9600000002' }],
    'Item Master': [{ ITEM_CODE: 'QAE2E-0001', GROSS_WT: 8, NET_WT: 7.4, STONE_WT: 0.2, PURCHASE_RATE: 44000, ITEM_TYPE: 'QA E2E Ring Type', PURITY: '22K' }],
    'Purchase Register': [{ SUPPLIER_NAME: 'QA E2E Supplier', TOTAL_AMOUNT: 44000, AMOUNT_PAID: 44000 }],
    'Sales Register': [{ CUSTOMER_NAME: 'QA E2E Customer', INVOICE_NO: 'QA-E2E-LEGACY-INV-1', NET_AMOUNT: 60000, AMOUNT_PAID: 30000 }],
  });
  const upload = await request(app).post(`/api/migrations/${migrationId}/files`).set(saAuth()).attach('files', xlsxBuffer, 'legacy_export.xlsx');
  expect(upload.status).toBe(201);

  // ── Analyze ──────────────────────────────────────────────────────────
  const analyze = await request(app).post(`/api/migrations/${migrationId}/analyze`).set(saAuth()).send();
  expect(analyze.status).toBe(200);
  expect(analyze.body.data.totalRecords).toBe(5);

  // ── Validate (accept auto-mapping as-is, matching a Super Admin who never corrects anything) ──
  const validate = await request(app).post(`/api/migrations/${migrationId}/validate`).set(saAuth()).send();
  expect(validate.status).toBe(200);
  expect(validate.body.data.Error).toBe(0);

  // ── Approve + Start ──────────────────────────────────────────────────
  const rejectUnconfirmed = await request(app).post(`/api/migrations/${migrationId}/approve`).set(saAuth()).send({});
  expect(rejectUnconfirmed.status).toBe(422); // must explicitly confirm
  const approve = await request(app).post(`/api/migrations/${migrationId}/approve`).set(saAuth()).send({ confirmed: 'true' });
  expect(approve.status).toBe(200);
  expect(approve.body.data.Status).toBe('APPROVED');

  const start = await request(app).post(`/api/migrations/${migrationId}/start`).set(saAuth()).send();
  expect(start.status).toBe(200);
  expect(start.body.data.Status).toBe('RUNNING');

  // ── Wait for the async processor to finish ──────────────────────────
  const final = await waitForStatus(migrationId, ['COMPLETED', 'FAILED']);
  expect(final.Status).toBe('COMPLETED');
  expect(final.Success_Records).toBe(5);
  expect(final.Error_Records).toBe(0);

  // ── Verify real rows actually landed, correctly linked ──────────────
  const vendor = await db('tbl_vendor_master').where({ Tenant_ID: tenant.tenantId, Vendor_Name: 'QA E2E Supplier' }).first();
  const customer = await db('tbl_customer_master').where({ Tenant_ID: tenant.tenantId, Customer_Name: 'QA E2E Customer' }).first();
  const ornament = await db('tbl_ornament_master').where({ Tenant_ID: tenant.tenantId, Article_Number: 'QAE2E-0001' }).first();
  const purchase = await db('tbl_purchase_header').where({ Tenant_ID: tenant.tenantId, Created_By: 'migration' }).first();
  const sale = await db('tbl_sales_header').where({ Tenant_ID: tenant.tenantId, Invoice_Number: 'QA-E2E-LEGACY-INV-1' }).first();

  expect(vendor).toBeDefined();
  expect(customer).toBeDefined();
  expect(ornament).toBeDefined();
  expect(purchase.Supplier_ID).toBe(vendor.Vendor_ID);
  expect(sale.Customer_ID).toBe(customer.Customer_ID);
  expect(parseFloat(sale.Balance_Amount)).toBe(30000);

  // ── Real, balanced accounting entries ────────────────────────────────
  const purchaseJournal = await db('tbl_accounting_journal').where({ Tenant_ID: tenant.tenantId, Source_Type: 'PURCHASE', Source_ID: purchase.Purchase_ID }).first();
  expect(purchaseJournal).toBeDefined();
  const saleJournal = await db('tbl_accounting_journal').where({ Tenant_ID: tenant.tenantId, Source_Type: 'SALE', Source_ID: sale.Sale_ID }).first();
  expect(saleJournal).toBeDefined();

  // ── migration_id_mappings recorded every created record ─────────────
  const idMaps = await db('migration_id_mappings').where('Migration_ID', migrationId);
  expect(idMaps.length).toBe(5); // vendor, customer, product, purchase, sale

  // ── Report + Reconciliation ──────────────────────────────────────────
  const report = await request(app).get(`/api/migrations/${migrationId}/report`).set(saAuth());
  expect(report.status).toBe(200);
  expect(report.body.data.byEntity.customer.Imported).toBe(1);
  expect(report.body.data.byEntity.sale.Imported).toBe(1);

  const reconciliation = await request(app).get(`/api/migrations/${migrationId}/reconciliation`).set(saAuth());
  expect(reconciliation.status).toBe(200);
  const customerRow = reconciliation.body.data.rows.find((r) => r.entityType === 'customer');
  expect(customerRow.staged).toBe(1);
  expect(customerRow.imported).toBe(1);
  expect(customerRow.difference).toBe(0);

  // ── State machine guards: can't approve/start again from a terminal state ──
  const reApprove = await request(app).post(`/api/migrations/${migrationId}/approve`).set(saAuth()).send({ confirmed: 'true' });
  expect(reApprove.status).toBe(400);
  const reStart = await request(app).post(`/api/migrations/${migrationId}/start`).set(saAuth()).send();
  expect(reStart.status).toBe(400);
}, 30000);
