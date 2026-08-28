/**
 * Excel bulk import — the six routes NOT already covered by
 * tests/excelImport.test.js (which only exercises /customers): stock,
 * itemtypes, designs, purity, gemstones, vendors.
 *
 * /stock gets the deepest coverage — it writes straight into
 * tbl_ornament_master, the single highest blast-radius table if column
 * mapping silently drifts (every Inventory screen and report reads from
 * it directly, per the route file's own header comment).
 *
 * tbl_item_type_master / tbl_design_master / tbl_purity_master /
 * tbl_gemstone_master are GLOBAL (no Tenant_ID column) — shared across every
 * tenant on the platform. testTenant's teardown() only ever cleans
 * Tenant_ID-scoped rows, so this file must clean up its own rows in these
 * four tables itself (see afterAll below), using distinctive codes that
 * can't collide with real data.
 */
const request = require('supertest');
const XLSX = require('xlsx');
const { app } = require('../src/index');
const db = require('../src/db/knex');
const testTenant = require('./helpers/testTenant');

let tenant;
let token;

// One suffix per test run so re-running this file never collides with a
// previous (possibly crashed) run's leftover global rows, and so cleanup
// can target exactly what this run created.
const RUN = Date.now().toString(36).slice(-6);

// Second, minimal tenant used ONLY to prove a real cross-tenant edge case on
// tbl_ornament_master.Article_Number (see the dedicated test below) — created
// and torn down entirely within that one test, never touched anywhere else.
const OTHER_TENANT_ID = `QAX2${RUN}`;

function buildWorkbookBuffer(rows) {
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

function post(path) {
  return request(app).post(`/api/excel-import/${path}`).set('Authorization', `Bearer ${token}`);
}

beforeAll(async () => {
  tenant = await testTenant.setup();
  const res = await request(app).post('/api/auth/login').send({ username: tenant.username, password: tenant.password, tenantId: tenant.tenantId });
  token = res.body.data.token;
});

afterAll(async () => {
  // Global-table cleanup FIRST, before the tenant (and its cascaded
  // ornament rows) disappears — tbl_design_master rows are deleted before
  // tbl_item_type_master since a design can reference a type (FK is
  // SET NULL on delete, but deleting children first is still the safer
  // order to reason about).
  await db('tbl_design_master').where('Design_Code', 'ilike', `QAX%${RUN}`).del();
  await db('tbl_item_type_master').where('Type_Code', 'ilike', `QAX%${RUN}`).del();
  await db('tbl_purity_master').where('Purity_Code', 'ilike', `QP${RUN}%`).del();
  await db('tbl_gemstone_master').where('Stone_Code', 'ilike', `QAX%${RUN}`).del();

  await testTenant.teardown();
  // Safety net in case the cross-tenant test threw before its own cleanup ran.
  await db('tbl_ornament_master').where({ Tenant_ID: OTHER_TENANT_ID }).del();
  await db('tbl_tenant_master').where({ Tenant_ID: OTHER_TENANT_ID }).del();
  await db.destroy();
});

// ─────────────────────────────────────────────────────────────────────────
// itemtypes
// ─────────────────────────────────────────────────────────────────────────
describe('POST /api/excel-import/itemtypes', () => {
  const codeA = `QAXIT-A-${RUN}`;
  const codeB = `QAXIT-B-${RUN}`;

  test('imports valid rows with correct field mapping, skips missing-required rows, never aborts the batch', async () => {
    const rows = [
      { 'Type Code': codeA, 'Type Name': 'QA Test Ring', Category: 'Rings', 'HSN Code': '7113', 'GST Percentage': 3, 'Default Making Charge': 500, 'Default Wastage Percent': 4, 'Is Gold': 'Yes', 'Is Silver': 'No' },
      { 'Type Code': '', 'Type Name': 'Missing Code' }, // hard skip — Type Code required
      { 'Type Code': codeB, 'Type Name': '' }, // hard skip — Type Name required
    ];
    const res = await post('itemtypes').attach('file', buildWorkbookBuffer(rows), 'itemtypes.xlsx');

    expect(res.status).toBe(200);
    expect(res.body.data.totalRows).toBe(3);
    expect(res.body.data.imported).toBe(1);
    expect(res.body.data.skipped).toBe(2);
    expect(res.body.data.errors).toHaveLength(2);
    expect(res.body.data.errors.join(' ')).toMatch(/Type Code and Type Name are both required/);

    const row = await db('tbl_item_type_master').where('Type_Code', codeA).first();
    expect(row).toBeTruthy();
    expect(row.Type_Name).toBe('QA Test Ring');
    expect(row.Category).toBe('Rings');
    expect(row.HSN_Code).toBe('7113');
    expect(Number(row.GST_Percentage)).toBe(3);
    expect(Number(row.Default_Making_Charge)).toBe(500);
    expect(Number(row.Default_Wastage_Percent)).toBe(4);
    expect(row.Is_Gold).toBe(true);
    expect(row.Is_Silver).toBe(false);
  });

  test('Category defaults to "General" when omitted (column is NOT NULL in schema)', async () => {
    const code = `QAXIT-NOCAT-${RUN}`;
    const res = await post('itemtypes').attach('file', buildWorkbookBuffer([{ 'Type Code': code, 'Type Name': 'No Category Given' }]), 'itemtypes.xlsx');
    expect(res.body.data.imported).toBe(1);
    const row = await db('tbl_item_type_master').where('Type_Code', code).first();
    expect(row.Category).toBe('General');
  });

  test('FIXED: a blank GST Percentage cell now correctly defaults to 3, not 0 (num()\'s null-handling was the root cause)', async () => {
    const code = `QAXIT-GSTBUG-${RUN}`;
    const res = await post('itemtypes').attach('file', buildWorkbookBuffer([{ 'Type Code': code, 'Type Name': 'GST Bug Row', 'GST Percentage': null }]), 'itemtypes.xlsx');
    expect(res.body.data.imported).toBe(1);
    const row = await db('tbl_item_type_master').where('Type_Code', code).first();
    expect(Number(row.GST_Percentage)).toBe(3);
  });

  test('re-importing an existing Type Code is skipped as a duplicate, not overwritten', async () => {
    const res = await post('itemtypes').attach('file', buildWorkbookBuffer([{ 'Type Code': codeA, 'Type Name': 'Renamed Attempt' }]), 'itemtypes.xlsx');
    expect(res.body.data.imported).toBe(0);
    expect(res.body.data.skipped).toBe(1);
    expect(res.body.data.errors[0]).toMatch(/already exists/);
    const row = await db('tbl_item_type_master').where('Type_Code', codeA).first();
    expect(row.Type_Name).toBe('QA Test Ring'); // unchanged
  });
});

// ─────────────────────────────────────────────────────────────────────────
// purity
// ─────────────────────────────────────────────────────────────────────────
describe('POST /api/excel-import/purity', () => {
  test('imports a valid row, defaults unrecognized Metal Type to Gold with a warning, and rejects non-numeric Karat/Percentage', async () => {
    const codeGood = `QP${RUN}G`;
    const codeBad = `QP${RUN}B`; // unrecognized metal type
    const codeNum = `QP${RUN}N`; // non-numeric karat/percentage — hard skip

    const rows = [
      { 'Purity Code': codeGood, 'Metal Type': 'Gold', Karat: 22, Percentage: 91.6, Description: '22K Gold', 'Hallmark Standard': 'BIS 916' },
      { 'Purity Code': codeBad, 'Metal Type': 'Bronze', Karat: 18, Percentage: 75 },
      { 'Purity Code': codeNum, 'Metal Type': 'Gold', Karat: 'not-a-number', Percentage: 91.6 },
    ];
    const res = await post('purity').attach('file', buildWorkbookBuffer(rows), 'purity.xlsx');

    expect(res.status).toBe(200);
    expect(res.body.data.totalRows).toBe(3);
    expect(res.body.data.imported).toBe(2); // good + bad-metal both insert; only the non-numeric one is a hard skip
    expect(res.body.data.skipped).toBe(1);
    expect(res.body.data.warnings).toBe(1);
    expect(res.body.data.errors.join(' ')).toMatch(/Karat and Percentage must both be numbers/);
    expect(res.body.data.errors.join(' ')).toMatch(/Metal Type "Bronze" not recognized — defaulted to Gold/);

    const good = await db('tbl_purity_master').where('Purity_Code', codeGood).first();
    expect(Number(good.Karat)).toBe(22);
    expect(Number(good.Percentage)).toBe(91.6);
    expect(good.Metal_Type).toBe('Gold');
    expect(good.Hallmark_Standard).toBe('BIS 916');

    const bad = await db('tbl_purity_master').where('Purity_Code', codeBad).first();
    expect(bad).toBeTruthy();
    expect(bad.Metal_Type).toBe('Gold'); // defaulted, imported anyway (warning, not a skip)

    const missing = await db('tbl_purity_master').where('Purity_Code', codeNum).first();
    expect(missing).toBeFalsy();
  });

  test('FIXED: a blank Karat/Percentage cell now correctly fails the "must both be numbers" validation and is skipped, not silently inserted as 0/0', async () => {
    const code = `QP${RUN}Z`;
    const res = await post('purity').attach('file', buildWorkbookBuffer([{ 'Purity Code': code, 'Metal Type': 'Gold', Karat: null, Percentage: null }]), 'purity.xlsx');

    expect(res.body.data.imported).toBe(0);
    expect(res.body.data.skipped).toBe(1);
    expect(res.body.data.errors.join(' ')).toMatch(/Karat and Percentage must both be numbers/);

    const row = await db('tbl_purity_master').where('Purity_Code', code).first();
    expect(row).toBeFalsy(); // correctly never inserted
  });
});

// ─────────────────────────────────────────────────────────────────────────
// designs
// ─────────────────────────────────────────────────────────────────────────
describe('POST /api/excel-import/designs', () => {
  const typeCode = `QAXIT-DSGN-${RUN}`;

  beforeAll(async () => {
    await post('itemtypes').attach('file', buildWorkbookBuffer([{ 'Type Code': typeCode, 'Type Name': 'Design Test Type' }]), 'itemtypes.xlsx');
  });

  test('resolves Item Type Code to Type_ID when found, and imports-with-warning (FK left null) when not found', async () => {
    const codeFound = `QAXDS-FOUND-${RUN}`;
    const codeMissing = `QAXDS-MISSING-${RUN}`;
    const rows = [
      { 'Design Code': codeFound, 'Design Name': 'QA Bangle', 'Item Type Code': typeCode, 'Collection Name': 'Festive', Category: 'Bangles', 'Estimated Gold Weight': 12.5, 'Estimated Stone Weight': 0.5, 'Estimated Making Charge': 350, 'Estimated Wastage Percent': 5 },
      { 'Design Code': codeMissing, 'Design Name': 'QA Orphan Design', 'Item Type Code': 'NO-SUCH-TYPE-CODE' },
    ];
    const res = await post('designs').attach('file', buildWorkbookBuffer(rows), 'designs.xlsx');

    expect(res.body.data.totalRows).toBe(2);
    expect(res.body.data.imported).toBe(2);
    expect(res.body.data.warnings).toBe(1);
    expect(res.body.data.errors.join(' ')).toMatch(/Item Type Code "NO-SUCH-TYPE-CODE" not found — left blank, not guessed/);

    const typeRow = await db('tbl_item_type_master').where('Type_Code', typeCode).first();
    const found = await db('tbl_design_master').where('Design_Code', codeFound).first();
    expect(found.Type_ID).toBe(typeRow.Type_ID);
    expect(found.Collection_Name).toBe('Festive');
    expect(Number(found.Estimated_Gold_Weight)).toBe(12.5);
    expect(Number(found.Estimated_Making_Charge)).toBe(350);

    const missing = await db('tbl_design_master').where('Design_Code', codeMissing).first();
    expect(missing.Type_ID).toBeNull(); // left blank, not guessed — as documented in the route
  });
});

// ─────────────────────────────────────────────────────────────────────────
// gemstones
// ─────────────────────────────────────────────────────────────────────────
describe('POST /api/excel-import/gemstones', () => {
  test('imports valid rows with boolean coercion, skips rows missing required fields', async () => {
    const codeA = `QAXST-A-${RUN}`;
    const codeB = `QAXST-B-${RUN}`;
    const rows = [
      { 'Stone Code': codeA, 'Stone Name': 'QA Ruby', Color: 'Red', Clarity: 'VS1', Cut: 'Oval', 'Price Per Carat': 15000, 'Is Natural': 'Yes', 'Is Lab Grown': 'No' },
      { 'Stone Code': codeB, 'Stone Name': 'QA Lab Diamond', Color: 'White', Clarity: 'VVS1', Cut: 'Round', 'Price Per Carat': 40000, 'Is Natural': 'No', 'Is Lab Grown': 'True' },
      { 'Stone Code': '', 'Stone Name': 'No Code Given' }, // hard skip
    ];
    const res = await post('gemstones').attach('file', buildWorkbookBuffer(rows), 'gemstones.xlsx');

    expect(res.body.data.totalRows).toBe(3);
    expect(res.body.data.imported).toBe(2);
    expect(res.body.data.skipped).toBe(1);

    const ruby = await db('tbl_gemstone_master').where('Stone_Code', codeA).first();
    expect(ruby.Stone_Name).toBe('QA Ruby');
    expect(ruby.Is_Natural).toBe(true);
    expect(ruby.Is_Lab_Grown).toBe(false);
    expect(Number(ruby.Price_Per_Carat)).toBe(15000);

    const lab = await db('tbl_gemstone_master').where('Stone_Code', codeB).first();
    expect(lab.Is_Natural).toBe(false);
    expect(lab.Is_Lab_Grown).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// vendors
// ─────────────────────────────────────────────────────────────────────────
describe('POST /api/excel-import/vendors', () => {
  /**
   * Deliberately Karigar-only for the happy-path assertions. This shared
   * dev DB already has a REAL tenant ('TEST_TENANT') that owns Vendor_Code
   * SUP1/SUP2/SUP3 — verified directly by querying tbl_vendor_master. See
   * the dedicated BUG test below for why that makes "Supplier" untestable
   * here as a happy path. Karigar has no such ambient collision today, but
   * Vendor_Code itself is still asserted by PATTERN and RELATIVE sequence
   * only (never a hardcoded "KAR1"), so this test doesn't start failing
   * again the day some other tenant's Karigar data shows up.
   */
  test('imports valid rows with a Vendor_Code in the expected KAR sequence, skips duplicate mobile and invalid Vendor Type', async () => {
    const rows = [
      { 'Vendor Type': 'Karigar', 'Vendor Name': 'QA Karigar One', Mobile: '9800000001', 'Contact Person': 'Ravi', City: 'Coimbatore' },
      { 'Vendor Type': 'Karigar', 'Vendor Name': 'QA Karigar Two', Mobile: '9800000002', 'Opening Balance': 5000 },
      { 'Vendor Type': 'Wholesaler', 'Vendor Name': 'QA Bad Type', Mobile: '9800000003' }, // hard skip — not Supplier/Karigar
      { 'Vendor Type': 'Karigar', 'Vendor Name': 'QA Dup Mobile', Mobile: '9800000001' }, // hard skip — mobile already used above (same batch)
    ];
    const res = await post('vendors').attach('file', buildWorkbookBuffer(rows), 'vendors.xlsx');

    expect(res.status).toBe(200);
    expect(res.body.data.totalRows).toBe(4);
    expect(res.body.data.imported).toBe(2);
    expect(res.body.data.skipped).toBe(2);
    expect(res.body.data.errors.join(' ')).toMatch(/Vendor Type must be exactly "Supplier" or "Karigar"/);
    expect(res.body.data.errors.join(' ')).toMatch(/mobile 9800000001 already exists/);

    const kar1 = await db('tbl_vendor_master').where({ Tenant_ID: tenant.tenantId, Mobile_1: '9800000001' }).first();
    const kar2 = await db('tbl_vendor_master').where({ Tenant_ID: tenant.tenantId, Mobile_1: '9800000002' }).first();
    expect(kar1.Vendor_Code).toMatch(/^KAR\d+$/);
    expect(kar2.Vendor_Code).toMatch(/^KAR\d+$/);
    expect(Number(kar2.Vendor_Code.replace('KAR', ''))).toBe(Number(kar1.Vendor_Code.replace('KAR', '')) + 1); // clean sequence, not skewed by the two skipped rows in between
    expect(kar1.Contact_Person).toBe('Ravi');
    expect(kar1.City).toBe('Coimbatore');
    expect(Number(kar2.Opening_Balance)).toBe(5000);
    expect(Number(kar2.Current_Balance)).toBe(5000);

    const dup = await db('tbl_vendor_master').where({ Tenant_ID: tenant.tenantId, Vendor_Name: 'QA Dup Mobile' }).first();
    expect(dup).toBeFalsy();
  });

  /**
   * REAL FINDING, reproduced directly against the actual shared dev DB, not
   * fabricated: tbl_vendor_master.Vendor_Code has a single-column GLOBAL
   * UNIQUE constraint (`tbl_vendor_master_vendor_code_unique`, see
   * migrations/002_create_tenant_tables.js) — it is NOT scoped to
   * Tenant_ID. But the route's own auto-numbering only counts vendors OF
   * THE SAME TENANT:
   *   .where({ Tenant_ID: tenantId, Vendor_Type: vendorType }).count(...)
   * So the FIRST "Supplier" row ANY tenant ever imports always computes
   * Vendor_Code "SUP1", the second always "SUP2" — regardless of what
   * codes other tenants already hold. Confirmed directly against this dev
   * DB before writing this test: a different real tenant ('TEST_TENANT')
   * already owns SUP1/SUP2/SUP3, which is exactly why the happy-path test
   * above had to avoid "Supplier" entirely (it deterministically fails
   * here, every time, for any tenant, until that ambient data changes).
   * This test is self-healing so it keeps proving the bug even if
   * TEST_TENANT's rows are ever cleaned up: it checks whether "SUP1" is
   * already taken ambiently (it is, today) and only seeds its own
   * throwaway tenant+vendor row with that exact code if it isn't. Either
   * way, the mechanism demonstrated is identical: QATEST's own counter
   * computes "SUP1" for its first Supplier (0 Suppliers of its own so
   * far), a DIFFERENT tenant already owns "SUP1", insert fails. End result
   * is not data corruption — the row is skipped — but it is skipped via a
   * raw "duplicate key value violates unique constraint" DB error instead
   * of any validation message, for a tenant that did nothing wrong.
   */
  test('BUG (flagged for review): Vendor_Code is a GLOBAL unique column but generated per-tenant, so a fresh tenant\'s first Supplier row can collide with a completely unrelated tenant\'s existing vendor', async () => {
    const existingSup1 = await db('tbl_vendor_master').where('Vendor_Code', 'SUP1').first();
    let seeded = false;

    try {
      if (!existingSup1) {
        seeded = true;
        await db('tbl_tenant_master').insert({
          Tenant_ID: OTHER_TENANT_ID,
          Company_Name: 'QA Other Tenant',
          Brand_Code: 'QAX2',
          License_Key: `${OTHER_TENANT_ID}-VLIC`,
          License_Expiry_Date: new Date(Date.now() + 365 * 24 * 3600 * 1000),
          Is_Active: true,
        });
        await db('tbl_vendor_master').insert({
          Tenant_ID: OTHER_TENANT_ID,
          Vendor_Type: 'Supplier',
          Vendor_Code: 'SUP1', // exactly what QATEST's own counter will independently compute below, since QATEST has 0 Suppliers of its own
          Vendor_Name: 'Other Tenant Existing Supplier',
          Mobile_1: '9700000099',
          Is_Active: true,
        });
      }
      // else: "SUP1" is already owned by a real, pre-existing tenant
      // ('TEST_TENANT' as of this writing) — no seeding needed, the
      // collision this test demonstrates already exists ambiently.

      const res = await post('vendors').attach(
        'file',
        buildWorkbookBuffer([{ 'Vendor Type': 'Supplier', 'Vendor Name': 'QA Supplier Collides', Mobile: '9800000099' }]),
        'vendors.xlsx'
      );

      expect(res.body.data.imported).toBe(0); // NOT imported — collided with a totally unrelated tenant's vendor code
      expect(res.body.data.skipped).toBe(1);
      expect(res.body.data.errors[0]).toMatch(/duplicate key value violates unique constraint/);

      const mine = await db('tbl_vendor_master').where({ Tenant_ID: tenant.tenantId, Mobile_1: '9800000099' }).first();
      expect(mine).toBeFalsy(); // this tenant's own supplier list has no bearing on why this failed
    } finally {
      if (seeded) {
        await db('tbl_vendor_master').where({ Tenant_ID: OTHER_TENANT_ID }).del();
        await db('tbl_tenant_master').where({ Tenant_ID: OTHER_TENANT_ID }).del();
      }
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────
// stock — the highest blast-radius path: writes straight into
// tbl_ornament_master, which every Inventory screen/report reads from.
// ─────────────────────────────────────────────────────────────────────────
describe('POST /api/excel-import/stock', () => {
  const typeCode = `QAXIT-STK-${RUN}`;
  const designCode = `QAXDS-STK-${RUN}`;
  const purityCode = `QP${RUN}S`;
  let typeRow, designRow, purityRow;

  beforeAll(async () => {
    await post('itemtypes').attach('file', buildWorkbookBuffer([{ 'Type Code': typeCode, 'Type Name': 'Stock Test Type' }]), 'itemtypes.xlsx');
    await post('designs').attach('file', buildWorkbookBuffer([{ 'Design Code': designCode, 'Design Name': 'Stock Test Design', 'Item Type Code': typeCode }]), 'designs.xlsx');
    await post('purity').attach('file', buildWorkbookBuffer([{ 'Purity Code': purityCode, 'Metal Type': 'Silver', Karat: 0, Percentage: 92.5 }]), 'purity.xlsx');
    typeRow = await db('tbl_item_type_master').where('Type_Code', typeCode).first();
    designRow = await db('tbl_design_master').where('Design_Code', designCode).first();
    purityRow = await db('tbl_purity_master').where('Purity_Code', purityCode).first();
    expect(typeRow && designRow && purityRow).toBeTruthy(); // fixtures must exist before the real test runs
  });

  test('rejects a request with no auth token', async () => {
    const buf = buildWorkbookBuffer([{ 'Article Number': 'X', 'Gross Weight': 5 }]);
    const res = await request(app).post('/api/excel-import/stock').attach('file', buf, 'stock.xlsx');
    expect(res.status).toBe(401);
  });

  test('imports each valid row into tbl_ornament_master with fully correct field mapping, including resolved Item Type / Design / Purity lookups', async () => {
    const art1 = `QAXART-1-${RUN}`; // full row, resolves Purity's own Metal Type (Silver), no explicit Metal Type column
    const art2 = `QAXART-2-${RUN}`; // explicit Metal Type overrides, no FK lookups given at all
    const art3 = `QAXART-3-${RUN}`; // Net Weight omitted -> must fall back to Gross Weight

    const rows = [
      {
        'Article Number': art1, 'Item Type': typeCode, 'Design Code': designCode, Purity: purityCode,
        'Gross Weight': 10.5, 'Net Weight': 9.8, 'Stone Weight': 0.2, 'Making Charge Per Gram': 300,
        'Purchase Cost': 45000, Quantity: 2, 'Hallmark Certificate No': 'HM-001',
      },
      {
        'Article Number': art2, 'Metal Type': 'Platinum', 'Gross Weight': 6, 'Net Weight': 5.5,
        'Making Charge Per Gram': 400, 'Purchase Cost': 30000, Quantity: 1,
      },
      {
        'Article Number': art3, 'Gross Weight': 3.25, 'Making Charge Per Gram': 200, 'Purchase Cost': 9000,
      },
    ];
    const res = await post('stock').attach('file', buildWorkbookBuffer(rows), 'stock.xlsx');

    expect(res.status).toBe(200);
    expect(res.body.data.totalRows).toBe(3);
    expect(res.body.data.imported).toBe(3);
    expect(res.body.data.skipped).toBe(0);
    expect(res.body.data.warnings).toBe(0);

    const row1 = await db('tbl_ornament_master').where({ Tenant_ID: tenant.tenantId, Article_Number: art1 }).first();
    expect(row1.Type_ID).toBe(typeRow.Type_ID);
    expect(row1.Design_ID).toBe(designRow.Design_ID);
    expect(row1.Purity_ID).toBe(purityRow.Purity_ID);
    expect(row1.Metal_Type).toBe('Silver'); // no explicit "Metal Type" column -> follows the resolved Purity's own metal type
    expect(Number(row1.Gross_Weight)).toBe(10.5);
    expect(Number(row1.Net_Gold_Weight)).toBe(9.8);
    expect(Number(row1.Stone_Weight)).toBe(0.2);
    expect(Number(row1.Base_Making_Charge_Per_Gram)).toBe(300);
    expect(Number(row1.Final_Making_Charge_Total)).toBe(Math.round(300 * 9.8 * 100) / 100); // 2940
    expect(Number(row1.Purchase_Cost)).toBe(45000);
    expect(row1.Stock_Quantity).toBe(2);
    expect(row1.Hallmark_Certificate_No).toBe('HM-001');
    expect(row1.Created_By).toBe(tenant.username);
    expect(row1.Sync_UUID).toBeTruthy();

    const row2 = await db('tbl_ornament_master').where({ Tenant_ID: tenant.tenantId, Article_Number: art2 }).first();
    expect(row2.Type_ID).toBeNull();
    expect(row2.Design_ID).toBeNull();
    expect(row2.Purity_ID).toBeNull();
    expect(row2.Metal_Type).toBe('Platinum'); // explicit column wins, no lookups given
    expect(Number(row2.Net_Gold_Weight)).toBe(5.5);

    const row3 = await db('tbl_ornament_master').where({ Tenant_ID: tenant.tenantId, Article_Number: art3 }).first();
    expect(row3.Metal_Type).toBe('Gold'); // no Metal Type column, no Purity -> falls all the way back to Gold default
    expect(Number(row3.Net_Gold_Weight)).toBe(3.25); // Net Weight omitted -> falls back to Gross Weight
    // FIXED: `Stock_Quantity: num(r['Quantity'], 1)` used to silently store
    // 0 for a blank Quantity cell instead of the intended default of 1 —
    // parseSheet's `defval: null` turns a blank cell into `null`, and the
    // old num() treated Number(null) === 0 (finite) as a real value rather
    // than falling back. num() now short-circuits null/undefined/'' to the
    // fallback explicitly (see routes/excelImport.js), so this now
    // correctly defaults to 1. Locked in here as a regression test.
    expect(row3.Stock_Quantity).toBe(1);
  });

  test('a row missing Article Number and a row with invalid Gross Weight are both hard-skipped individually, without aborting the rest of the batch', async () => {
    const artGood = `QAXART-GOOD-${RUN}`;
    const rows = [
      { 'Article Number': '', 'Gross Weight': 5, 'Making Charge Per Gram': 100, 'Purchase Cost': 1000 }, // missing Article Number
      { 'Article Number': `QAXART-BADWT-${RUN}`, 'Gross Weight': 0, 'Making Charge Per Gram': 100, 'Purchase Cost': 1000 }, // Gross Weight <= 0
      { 'Article Number': `QAXART-NANWT-${RUN}`, 'Gross Weight': 'not-a-number', 'Making Charge Per Gram': 100, 'Purchase Cost': 1000 }, // non-numeric
      { 'Article Number': artGood, 'Gross Weight': 4, 'Making Charge Per Gram': 150, 'Purchase Cost': 2000 }, // valid, must still import
    ];
    const res = await post('stock').attach('file', buildWorkbookBuffer(rows), 'stock.xlsx');

    expect(res.body.data.totalRows).toBe(4);
    expect(res.body.data.imported).toBe(1);
    expect(res.body.data.skipped).toBe(3);
    expect(res.body.data.errors.join(' ')).toMatch(/Article Number is required/);
    expect(res.body.data.errors.join(' ')).toMatch(/Gross Weight must be a positive number/);

    const good = await db('tbl_ornament_master').where({ Tenant_ID: tenant.tenantId, Article_Number: artGood }).first();
    expect(good).toBeTruthy();
    const bad = await db('tbl_ornament_master').where({ Tenant_ID: tenant.tenantId, Article_Number: `QAXART-BADWT-${RUN}` }).first();
    expect(bad).toBeFalsy();
  });

  test('re-importing an Article Number that already exists for this tenant is skipped as a duplicate, not overwritten', async () => {
    const art = `QAXART-1-${RUN}`; // already imported above with Purchase_Cost 45000
    const res = await post('stock').attach('file', buildWorkbookBuffer([{ 'Article Number': art, 'Gross Weight': 99, 'Purchase Cost': 1 }]), 'stock.xlsx');

    expect(res.body.data.imported).toBe(0);
    expect(res.body.data.skipped).toBe(1);
    expect(res.body.data.errors[0]).toMatch(/already exists, not overwritten/);

    const row = await db('tbl_ornament_master').where({ Tenant_ID: tenant.tenantId, Article_Number: art }).first();
    expect(Number(row.Purchase_Cost)).toBe(45000); // unchanged, proves it was not overwritten
  });

  test('an Item Type / Design Code / Purity that cannot be found is imported anyway with the FK left null and reported as a warning, not a skip', async () => {
    const art = `QAXART-UNK-${RUN}`;
    const rows = [{
      'Article Number': art, 'Item Type': 'NO-SUCH-TYPE', 'Design Code': 'NO-SUCH-DESIGN', Purity: 'NO-SUCH-PURITY',
      'Metal Type': 'Bronze', // also unrecognized
      'Gross Weight': 5, 'Purchase Cost': 1000,
    }];
    const res = await post('stock').attach('file', buildWorkbookBuffer(rows), 'stock.xlsx');

    expect(res.body.data.imported).toBe(1);
    expect(res.body.data.warnings).toBe(4); // Item Type, Design Code, Purity not found + Metal Type not recognized
    expect(res.body.data.errors.join(' ')).toMatch(/Item Type "NO-SUCH-TYPE" not found/);
    expect(res.body.data.errors.join(' ')).toMatch(/Design Code "NO-SUCH-DESIGN" not found/);
    expect(res.body.data.errors.join(' ')).toMatch(/Purity "NO-SUCH-PURITY" not found/);
    expect(res.body.data.errors.join(' ')).toMatch(/Metal Type "Bronze" not recognized — defaulted to Gold/);

    const row = await db('tbl_ornament_master').where({ Tenant_ID: tenant.tenantId, Article_Number: art }).first();
    expect(row.Type_ID).toBeNull();
    expect(row.Design_ID).toBeNull();
    expect(row.Purity_ID).toBeNull();
    expect(row.Metal_Type).toBe('Gold'); // no recognized Metal Type and no resolved Purity to fall back to
  });

  /**
   * Row-level insert failure isolation: a row whose Article_Number is longer
   * than the column's varchar(50) limit fails at the DB level inside the
   * inner try/catch (not the outer one), so it must be reported as an
   * individually-skipped row with the raw DB error message, and every other
   * row in the same batch must still land. This is exactly the failure mode
   * the route file's own comment says was found "during testing" — this
   * test locks it in.
   */
  test('a single row that fails at the DB level (value too long for its column) is skipped individually, not silently corrupted, and does not abort the batch', async () => {
    const tooLong = 'Q'.repeat(60) + RUN; // > 50 chars, violates Article_Number varchar(50)
    const artGood = `QAXART-AFTERBAD-${RUN}`;
    const rows = [
      { 'Article Number': tooLong, 'Gross Weight': 5, 'Purchase Cost': 1000 },
      { 'Article Number': artGood, 'Gross Weight': 5, 'Purchase Cost': 1000 },
    ];
    const res = await post('stock').attach('file', buildWorkbookBuffer(rows), 'stock.xlsx');

    expect(res.body.data.totalRows).toBe(2);
    expect(res.body.data.imported).toBe(1); // the good row after it still lands
    expect(res.body.data.skipped).toBe(1);
    expect(res.body.data.errors.join(' ')).toMatch(/SKIPPED/);

    const bad = await db('tbl_ornament_master').where({ Tenant_ID: tenant.tenantId }).where('Article_Number', 'ilike', 'QQQQ%').first();
    expect(bad).toBeFalsy();
    const good = await db('tbl_ornament_master').where({ Tenant_ID: tenant.tenantId, Article_Number: artGood }).first();
    expect(good).toBeTruthy();
  });

  /**
   * REAL FINDING, not a fabricated edge case: tbl_ornament_master.Article_Number
   * has a single-column UNIQUE constraint at the DB level (see
   * src/db/migrations/002_create_tenant_tables.js) — it is NOT scoped to
   * Tenant_ID. But the route's own duplicate check (a few lines above the
   * insert) IS scoped to Tenant_ID:
   *   .where({ Tenant_ID: tenantId, Article_Number: articleNumber })
   * So if a different tenant already owns that exact Article_Number, this
   * tenant's own "does it already exist for ME" check finds nothing, the
   * code proceeds to insert, and the DB itself rejects it with a duplicate
   * key error — caught by the inner try/catch and reported as a generic
   * "SKIPPED — duplicate key value violates unique constraint" row error,
   * NOT the friendly "Article Number already exists, not overwritten"
   * message a same-tenant duplicate gets. End result is still safe (no data
   * corruption, the row is skipped) but the reported reason is misleading —
   * it reads like a DB malfunction, not an expected duplicate. Flagging for
   * review: Article_Number's uniqueness is effectively cross-tenant even
   * though the app is otherwise fully tenant-scoped.
   */
  test('BUG (flagged for review): a cross-tenant Article_Number collision is skipped via a raw DB error, not the friendly duplicate message, because the app-level dup check is Tenant_ID-scoped but the DB unique constraint is not', async () => {
    const sharedArt = `QAXART-XTEN-${RUN}`;

    try {
      await db('tbl_tenant_master').insert({
        Tenant_ID: OTHER_TENANT_ID,
        Company_Name: 'QA Other Tenant',
        Brand_Code: 'QAX2',
        License_Key: `${OTHER_TENANT_ID}-LIC`,
        License_Expiry_Date: new Date(Date.now() + 365 * 24 * 3600 * 1000),
        Is_Active: true,
      });
      await db('tbl_ornament_master').insert({
        Tenant_ID: OTHER_TENANT_ID,
        Article_Number: sharedArt,
        Metal_Type: 'Gold',
        Gross_Weight: 1,
        Net_Gold_Weight: 1,
        Current_Gold_Rate: 0,
        Base_Making_Charge_Per_Gram: 0,
        Purchase_Cost: 0,
        Created_By: 'seed',
        Sync_UUID: require('uuid').v4(),
      });

      const res = await post('stock').attach(
        'file',
        buildWorkbookBuffer([{ 'Article Number': sharedArt, 'Gross Weight': 5, 'Purchase Cost': 1000 }]),
        'stock.xlsx'
      );

      // Current (buggy) behavior: NOT caught by the app's own "already
      // exists" check (that check only looked at THIS tenant), so it reaches
      // the DB insert and fails there instead.
      expect(res.body.data.imported).toBe(0);
      expect(res.body.data.skipped).toBe(1);
      expect(res.body.data.errors[0]).not.toMatch(/already exists, not overwritten/); // did NOT get the friendly message
      expect(res.body.data.errors[0]).toMatch(/SKIPPED/);

      const mine = await db('tbl_ornament_master').where({ Tenant_ID: tenant.tenantId, Article_Number: sharedArt }).first();
      expect(mine).toBeFalsy(); // not corrupted — the row simply never landed for this tenant either
    } finally {
      await db('tbl_ornament_master').where({ Tenant_ID: OTHER_TENANT_ID }).del();
      await db('tbl_tenant_master').where({ Tenant_ID: OTHER_TENANT_ID }).del();
    }
  });
});
