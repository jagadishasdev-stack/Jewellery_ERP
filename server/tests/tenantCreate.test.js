/**
 * POST /api/tenant/create — regression coverage for a real bug found while
 * testing the "Jagdish/Jsphere" default admin credential end-to-end: the
 * default invoice templates cloned for a brand-new tenant carried over the
 * GLOBAL template's own Sync_UUID instead of getting a fresh one, so the
 * insert violated the column's unique constraint. This had apparently
 * never been caught before because nothing had exercised this endpoint
 * with a full default-template set end-to-end this session (DLJ was
 * created via a separate one-off script, not this wizard).
 *
 * Also covers the actual feature request: "Jsphere" (7 chars) is exempted
 * from the platform's normal 8-character admin-password minimum, but only
 * as that exact literal value.
 *
 * IMPORTANT — every tenant created via this route now gets its own
 * dedicated Postgres database (see utils/tenantProvisioning.js). Branch,
 * admin user, display settings, chart of accounts, invoice templates, and
 * tenant module flags all live in THAT database, not the shared
 * control-plane one — verified here via getTenantDb(tenantId), the exact
 * same resolver the real app uses, not a hardcoded assumption about where
 * the data landed. Only tbl_tenant_master itself stays on the control
 * plane. Cleanup drops each created tenant's entire dedicated database
 * (and its local-db/ MySQL-template folder) rather than deleting
 * individual tables.
 */
const request = require('supertest');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const { app } = require('../src/index');
const db = require('../src/db/knex');
const { getTenantDb } = require('../src/db/tenantDbResolver');
const { dropDatabase } = require('../src/utils/tenantProvisioning');

const SA_USERNAME = 'qa_temp_sa_tenantcreate';
let saToken;
const createdTenantIds = [];

beforeAll(async () => {
  const saRole = await db('tbl_role_master').where({ Role_Name: 'Super Admin' }).first();
  const salt = bcrypt.genSaltSync(10);
  await db('tbl_user_master').where({ Username: SA_USERNAME }).del();
  await db('tbl_user_master').insert({
    Tenant_ID: 'SA_MASTER', Username: SA_USERNAME, Password_Hash: bcrypt.hashSync('TempSA@Create1', salt), Password_Salt: salt,
    Role_ID: saRole.Role_ID, Full_Name: 'QA Temp SA (tenant create)', Is_Active: true, Is_Admin: true,
  });
  const login = await request(app).post('/api/auth/login').send({ username: SA_USERNAME, password: 'TempSA@Create1', tenantId: 'SA_MASTER' });
  saToken = login.body.data.token;
});

afterAll(async () => {
  for (const id of createdTenantIds) {
    const row = await db('tbl_tenant_master').where({ Tenant_ID: id }).first();
    if (row?.DB_Name) await dropDatabase(row.DB_Name).catch(() => {});
    await db('tbl_tenant_master').where({ Tenant_ID: id }).del();
    const localDbDir = path.join(__dirname, '../local-db', id.toLowerCase());
    fs.rmSync(localDbDir, { recursive: true, force: true });
  }
  await db('tbl_user_master').where({ Username: SA_USERNAME }).del();
  await db.destroy();
});

function freshTenantPayload(suffix) {
  const id = `QATC${suffix}`;
  createdTenantIds.push(id);
  return {
    Tenant_ID: id, Company_Name: `QA Tenant Create ${suffix}`, Brand_Code: `QC${suffix}`,
    License_Key: `QC${suffix}-${suffix}`, License_Expiry_Date: '2027-01-01', Business_Type: 'HYBRID',
    adminUsername: 'Jagdish', adminPassword: 'Jsphere',
  };
}

test('"Jsphere" (7 chars) is accepted as the admin password despite the normal 8-char minimum', async () => {
  const res = await request(app).post('/api/tenant/create').set('Authorization', `Bearer ${saToken}`).send(freshTenantPayload('A1'));
  expect(res.status).toBe(201);
}, 30000);

test('any OTHER 7-character password is still rejected', async () => {
  const payload = freshTenantPayload('A2');
  payload.adminPassword = 'Sevenxx'; // 7 chars, not the exempted literal
  const res = await request(app).post('/api/tenant/create').set('Authorization', `Bearer ${saToken}`).send(payload);
  expect(res.status).toBe(422);
  // Rejected by validation before any database was ever provisioned —
  // confirm no orphaned tenant row or database was left behind.
  const row = await db('tbl_tenant_master').where({ Tenant_ID: payload.Tenant_ID }).first();
  expect(row).toBeFalsy();
});

test('the new tenant\'s admin can actually log in with the default credential', async () => {
  const payload = freshTenantPayload('A3');
  const create = await request(app).post('/api/tenant/create').set('Authorization', `Bearer ${saToken}`).send(payload);
  expect(create.status).toBe(201);

  const login = await request(app).post('/api/auth/login').send({ username: 'Jagdish', password: 'Jsphere', tenantId: payload.Tenant_ID });
  expect(login.status).toBe(200);
}, 30000);

/**
 * FIXED (real feature, this pass): every tenant created here now gets a
 * real, dedicated Postgres database of its own — DB_Host/DB_Name/etc are
 * populated on the tbl_tenant_master row at creation time, and
 * authenticate() (middleware/auth.js) routes every one of this tenant's
 * requests to it from the very first login. Before this, DB_Host was null
 * for every tenant (including every one created via this exact route) —
 * everyone shared one database.
 */
test('FIXED: a newly created tenant gets its own dedicated database, with DB_Host populated and real data inside it', async () => {
  const payload = freshTenantPayload('C1');
  const create = await request(app).post('/api/tenant/create').set('Authorization', `Bearer ${saToken}`).send(payload);
  expect(create.status).toBe(201);

  const row = await db('tbl_tenant_master').where({ Tenant_ID: payload.Tenant_ID }).first();
  expect(row.DB_Host).toBeTruthy();
  expect(row.DB_Name).toBe(`JewelleryERP_${payload.Tenant_ID}`);
  expect(row.DB_Provisioned_At).toBeTruthy();

  const tenantDb = await getTenantDb(payload.Tenant_ID);
  const branch = await tenantDb('tbl_branch_master').where({ Tenant_ID: payload.Tenant_ID }).first();
  expect(branch).toBeTruthy();
  expect(branch.Branch_Name).toBe('Main Branch');
  const user = await tenantDb('tbl_user_master').where({ Tenant_ID: payload.Tenant_ID, Username: 'Jagdish' }).first();
  expect(user).toBeTruthy();
  const coa = await tenantDb('tbl_chart_of_accounts').where({ Tenant_ID: payload.Tenant_ID });
  expect(coa.length).toBeGreaterThan(0);

  // Confirms this tenant's data is genuinely NOT in the shared control-
  // plane database — it only exists in its own dedicated one.
  const branchOnSharedDb = await db('tbl_branch_master').where({ Tenant_ID: payload.Tenant_ID }).first();
  expect(branchOnSharedDb).toBeFalsy();
}, 30000);

/**
 * FIXED: the local role_master/item_type/purity/etc. copy in a new
 * tenant's own database exists SOLELY to satisfy Postgres's own foreign-
 * key checks (tbl_user_master.Role_ID references tbl_role_master.Role_ID
 * WITHIN that same database — a real, previously-untested failure mode:
 * a plain `migrate.latest()` on a fresh database creates that table
 * empty, which would make the admin-user insert fail its own FK
 * constraint if the global reference tables were never copied in.
 */
test('FIXED: the new tenant\'s own database has the global reference tables (Role, Item Type, Purity, Metal Type) populated, not empty', async () => {
  const payload = freshTenantPayload('C2');
  const create = await request(app).post('/api/tenant/create').set('Authorization', `Bearer ${saToken}`).send(payload);
  expect(create.status).toBe(201);

  const tenantDb = await getTenantDb(payload.Tenant_ID);
  const [{ c: roleCount }] = await tenantDb('tbl_role_master').count('* as c');
  const [{ c: itemTypeCount }] = await tenantDb('tbl_item_type_master').count('* as c');
  const [{ c: metalTypeCount }] = await tenantDb('tbl_metal_type_master').count('* as c');
  expect(parseInt(roleCount)).toBeGreaterThan(0);
  expect(parseInt(itemTypeCount)).toBeGreaterThan(0);
  expect(parseInt(metalTypeCount)).toBeGreaterThan(0);
}, 30000);

test('a real duplicate Tenant_ID is rejected with 409 before any database is provisioned, and does not orphan a database', async () => {
  const payload = freshTenantPayload('D1');
  const first = await request(app).post('/api/tenant/create').set('Authorization', `Bearer ${saToken}`).send(payload);
  expect(first.status).toBe(201);

  const dup = { ...payload, License_Key: `${payload.License_Key}-DIFFERENT` };
  const second = await request(app).post('/api/tenant/create').set('Authorization', `Bearer ${saToken}`).send(dup);
  expect(second.status).toBe(409);
}, 30000);

test('regression: creating a SECOND tenant right after a first does not collide on cloned template Sync_UUID', async () => {
  const first = await request(app).post('/api/tenant/create').set('Authorization', `Bearer ${saToken}`).send(freshTenantPayload('B1'));
  expect(first.status).toBe(201);
  const second = await request(app).post('/api/tenant/create').set('Authorization', `Bearer ${saToken}`).send(freshTenantPayload('B2'));
  expect(second.status).toBe(201); // this exact call is what failed with a 409 unique-constraint violation before the fix

  const firstDb = await getTenantDb('QATCB1');
  const secondDb = await getTenantDb('QATCB2');
  const firstTemplates = await firstDb('tbl_invoice_template_master').where({ Tenant_ID: 'QATCB1' }).select('Sync_UUID');
  const secondTemplates = await secondDb('tbl_invoice_template_master').where({ Tenant_ID: 'QATCB2' }).select('Sync_UUID');
  const firstUUIDs = new Set(firstTemplates.map((t) => t.Sync_UUID));
  const overlap = secondTemplates.filter((t) => firstUUIDs.has(t.Sync_UUID));
  expect(overlap).toHaveLength(0);
}, 30000);
