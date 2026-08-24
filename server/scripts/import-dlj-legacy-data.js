/**
 * One-time ETL: import Dhanalakshmi Jewellers' (DLJ) legacy desktop-ERP data
 * (staged from njm21052026.sql into a local MySQL database named `njm`)
 * into the new schema, writing to BOTH the cloud Postgres tenant DB and a
 * dedicated persistent local MySQL DB for this tenant.
 *
 * Run manually: `node scripts/import-dlj-legacy-data.js`
 * Not wired into any route or scheduled job — this is a one-time migration.
 *
 * Design notes (see /Users/a1989/.claude/plans/curried-waddling-hearth.md
 * and server/src/db/schema/LEGACY_DATA_MIGRATION_NOTES.md for the full
 * reasoning):
 *   - Every row gets ONE Sync_UUID, written identically into both the cloud
 *     and local copy, even though the two copies get DIFFERENT integer PKs
 *     from their respective engines — Sync_UUID is what lets the two be
 *     recognized as "the same record" later (see SYNC_ARCHITECTURE_NOTES.md).
 *   - Global masters (item type / design / purity) are upserted by natural
 *     code, not blind-inserted — they have no Tenant_ID, they're shared
 *     platform-wide.
 *   - Legacy plaintext passwords are NEVER carried forward as if they were
 *     real hashes — every imported user gets a random unusable
 *     Password_Hash/Salt and must reset their password.
 *   - Fields with no confident legacy mapping (stock sold/available status
 *     codes, attendance status codes) are NOT guessed at — they're carried
 *     into a Notes/Remarks field verbatim and flagged in the final report,
 *     rather than silently defaulted to a value that could be wrong.
 */
const fs = require('fs');
const path = require('path');
const knexLib = require('knex');
const { v4: uuidv4 } = require('uuid');

const TENANT_ID = 'DLJ';
const BRANCH_ID = 'DLJ-HO';

// ---------------------------------------------------------------------------
// Connections
// ---------------------------------------------------------------------------
const credPath = path.join(__dirname, '../local-db/dlj/.credentials');
const credText = fs.readFileSync(credPath, 'utf8');
const creds = {};
for (const line of credText.split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) creds[m[1]] = m[2];
}

const source = knexLib({
  client: 'mysql2',
  connection: {
    socketPath: '/tmp/mysql_staging_dlj.sock',
    user: 'root',
    database: 'njm',
    charset: 'latin1',
  },
});

const cloud = knexLib({
  client: 'pg',
  connection: {
    host: 'localhost',
    port: 5432,
    database: 'JewelleryERP',
    user: 'a1989',
  },
});

const local = knexLib({
  client: 'mysql2',
  connection: {
    socketPath: creds.SOCKET,
    user: creds.APP_USER,
    password: creds.APP_PASSWORD,
    database: creds.DATABASE,
    charset: 'utf8mb4',
  },
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// The legacy `latin1` columns actually hold UTF-8 bytes for anything outside
// ASCII (confirmed: company.repair_terms contains real Kannada text, which
// cannot exist in true latin1 at all) — a very common old-app misconfig
// where the app wrote UTF-8 into a latin1 column and MySQL just stored the
// raw bytes uninterpreted. Reversing that: take the latin1-decoded JS
// string mysql2 gave us, get its original bytes back, re-decode as UTF-8.
function fixEncoding(v) {
  if (typeof v !== 'string' || v === '') return v;
  try {
    const fixed = Buffer.from(v, 'latin1').toString('utf8');
    // Buffer.toString('utf8') never throws on invalid sequences — it
    // substitutes U+FFFD. If that shows up where the original had none,
    // the string wasn't double-encoded; keep the original in that case.
    if (fixed.includes('�') && !v.includes('�')) return v;
    return fixed;
  } catch {
    return v;
  }
}

function fixRow(row) {
  const out = {};
  for (const [k, v] of Object.entries(row)) out[k] = fixEncoding(v);
  return out;
}

function toDate(v) {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function num(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

// The local MySQL schema has NO Tenant_ID column on ANY table (single shop
// == one database locally — see DROP_TABLES / column-stripping in
// pg_to_mysql.js) even though every table it's derived from has one on the
// cloud Postgres side. Every payload headed to `local` needs it stripped;
// every payload headed to `cloud` needs to keep it.
function omitTenant(row) {
  const { Tenant_ID, ...rest } = row;
  return rest;
}

const report = {
  counts: {}, // table -> { legacy, cloud, local }
  orphans: [], // { table, legacyId, reason }
  samples: [], // { table, legacy, cloud, local }
  notes: [],
};

function logOrphan(table, legacyId, reason) {
  report.orphans.push({ table, legacyId, reason });
}

/**
 * Insert `rows` into `table` on `db`, chunked, returning an array of new
 * integer IDs in the same order as `rows`.
 *   - Postgres: RETURNING preserves row order for a single multi-row INSERT.
 *   - MySQL: a single multi-row INSERT gets consecutive auto-increment IDs
 *     (true for InnoDB's default consecutive lock mode) — safe here because
 *     this script is the only writer touching these tables.
 */
async function chunkedInsertReturningIds(db, table, idCol, rows, isPg, chunkSize = 500) {
  const ids = [];
  for (let i = 0; i < rows.length; i += chunkSize) {
    let chunk = rows.slice(i, i + chunkSize);
    if (chunk.length === 0) continue;
    if (!isPg) chunk = chunk.map(omitTenant);
    if (isPg) {
      const returned = await db(table).insert(chunk).returning(idCol);
      returned.forEach((r) => ids.push(typeof r === 'object' ? r[idCol] : r));
    } else {
      const [firstId] = await db(table).insert(chunk);
      for (let j = 0; j < chunk.length; j++) ids.push(firstId + j);
    }
  }
  return ids;
}

// ---------------------------------------------------------------------------
// 0. Tenant + branch
// ---------------------------------------------------------------------------
async function createTenant() {
  const [company] = (await source('company').select('*').limit(1)).map(fixRow);
  if (!company) throw new Error('legacy company table is empty — cannot create tenant');

  const tenantRow = {
    Tenant_ID: TENANT_ID,
    Company_Name: 'Dhanalakshmi Jewellers',
    Brand_Code: 'DLJ',
    Address_Line1: company.c_comaddr1 || null,
    Address_Line2: company.c_comaddr2 || null,
    City: company.c_com_city || null,
    State: 'Karnataka',
    Pincode: company.c_com_pin || null,
    Country: 'India',
    Phone: company.c_com_tel1 || null,
    Email: company.email || null,
    License_Key: `DLJ-${uuidv4()}`,
    License_Expiry_Date: new Date(Date.now() + 365 * 24 * 3600 * 1000),
    Business_Type: 'RETAILER',
    Store_Type: 'Retailer',
    Sync_UUID: uuidv4(),
  };
  const branchRow = {
    Branch_ID: BRANCH_ID,
    Tenant_ID: TENANT_ID,
    Branch_Name: 'Head Office',
    Branch_Code: 'HO',
    Address_Line1: company.c_comaddr1 || null,
    Address_Line2: company.c_comaddr2 || null,
    City: company.c_com_city || null,
    State: 'Karnataka',
    Pincode: company.c_com_pin || null,
    Phone: company.c_com_tel1 || null,
    Email: company.email || null,
    Is_Head_Office: true,
    Sync_UUID: uuidv4(),
  };

  // tbl_tenant_master doesn't exist on the local MySQL schema at all — it's
  // a SaaS control-plane table (single-tenant local has no need for it,
  // see DROP_TABLES in the mysql translator). Only write it to cloud.
  const existingTenant = await cloud('tbl_tenant_master').where('Tenant_ID', TENANT_ID).first();
  if (!existingTenant) await cloud('tbl_tenant_master').insert(tenantRow);

  // tbl_branch_master exists on both — a single local shop can still have
  // multiple physical branches.
  const existingBranchCloud = await cloud('tbl_branch_master').where('Branch_ID', BRANCH_ID).first();
  if (!existingBranchCloud) await cloud('tbl_branch_master').insert(branchRow);
  const existingBranchLocal = await local('tbl_branch_master').where('Branch_ID', BRANCH_ID).first();
  if (!existingBranchLocal) await local('tbl_branch_master').insert(omitTenant(branchRow));
  report.notes.push(
    'Legacy `branch` table had 3 near-empty rows (KANAKAPURA/KANAKAPURA/KKP, no addresses) — created a single Head Office branch from the `company` row instead of importing those 3.'
  );
}

// ---------------------------------------------------------------------------
// 1. Master data — upsert by code, per target, independently
// ---------------------------------------------------------------------------
async function upsertMaster(db, table, codeCol, idCol, row) {
  const existing = await db(table).where(codeCol, row[codeCol]).first();
  if (existing) return existing[idCol];
  const [id] = await chunkedInsertReturningIds(db, table, idCol, [row], db === cloud);
  return id;
}

async function importItemTypes() {
  const rows = (await source('itemtype').select('id', 'code', 'name', 'hsn_code')).map(fixRow);
  const cloudMap = new Map();
  const localMap = new Map();
  for (const r of rows) {
    const typeCode = (r.code || `IT${r.id}`).toString().slice(0, 20);
    const payload = {
      Type_Code: typeCode,
      Type_Name: (r.name || typeCode).toString().slice(0, 50),
      Category: 'General',
      HSN_Code: r.hsn_code || null,
      Is_Active: true,
    };
    cloudMap.set(r.id, await upsertMaster(cloud, 'tbl_item_type_master', 'Type_Code', 'Type_ID', payload));
    localMap.set(r.id, await upsertMaster(local, 'tbl_item_type_master', 'Type_Code', 'Type_ID', payload));
  }
  report.counts.itemtype = { legacy: rows.length, cloud: cloudMap.size, local: localMap.size };
  return { cloudMap, localMap };
}

async function importPurity() {
  const rows = (await source('purity').select('id', 'name', 'purity', 'description')).map(fixRow);
  const cloudMap = new Map();
  const localMap = new Map();
  for (const r of rows) {
    const code = (r.name || `P${r.id}`).toString().slice(0, 10);
    const karatMatch = code.match(/(\d+)/);
    const payload = {
      Purity_Code: code,
      Karat: karatMatch ? Number(karatMatch[1]) : 0,
      Percentage: num(r.purity, 0),
      Description: r.description || null,
      Is_Active: true,
    };
    cloudMap.set(r.id, await upsertMaster(cloud, 'tbl_purity_master', 'Purity_Code', 'Purity_ID', payload));
    localMap.set(r.id, await upsertMaster(local, 'tbl_purity_master', 'Purity_Code', 'Purity_ID', payload));
  }
  report.counts.purity = { legacy: rows.length, cloud: cloudMap.size, local: localMap.size };
  report.notes.push(
    'tbl_purity_master.Karat parsed from the legacy purity name (e.g. "22K" -> 22); non-karat entries (e.g. silver "925") got Karat=0 — review these manually.'
  );
  return { cloudMap, localMap };
}

async function importDesigns(itemTypeMaps) {
  const rows = (await source('design').select('id', 'itemtype', 'name', 'CLASS', 'wastage', 'mc', 'isActive')).map(fixRow);
  const cloudMap = new Map();
  const localMap = new Map();
  for (const r of rows) {
    const code = `D${r.id}`;
    const base = {
      Design_Code: code,
      Design_Name: (r.name || code).toString().slice(0, 100),
      Category: r.CLASS || null,
      Estimated_Wastage_Percent: r.wastage != null ? num(r.wastage) : null,
      Estimated_Making_Charge: r.mc != null ? num(r.mc) : null,
      Is_Active: r.isActive !== 0,
    };
    const cloudPayload = { ...base, Type_ID: itemTypeMaps.cloudMap.get(r.itemtype) || null };
    const localPayload = { ...base, Type_ID: itemTypeMaps.localMap.get(r.itemtype) || null };
    if (r.itemtype && !itemTypeMaps.cloudMap.has(r.itemtype)) logOrphan('design', r.id, `itemtype ${r.itemtype} not found`);
    cloudMap.set(r.id, await upsertMaster(cloud, 'tbl_design_master', 'Design_Code', 'Design_ID', cloudPayload));
    localMap.set(r.id, await upsertMaster(local, 'tbl_design_master', 'Design_Code', 'Design_ID', localPayload));
  }
  report.counts.design = { legacy: rows.length, cloud: cloudMap.size, local: localMap.size };
  return { cloudMap, localMap };
}

// ---------------------------------------------------------------------------
// 2. usermaster -> tbl_user_master + tbl_employee_details
// ---------------------------------------------------------------------------
async function importUsers() {
  const rows = (await source('usermaster').select(
    'id', 'name', 'loginid', 'address', 'contact', 'email', 'status',
    'department', 'dept', 'pfcode', 'joindate'
  )).map(fixRow);

  const cloudMap = new Map();
  const localMap = new Map();

  for (const r of rows) {
    const username = (r.loginid || `dlj_user${r.id}`).toString().slice(0, 50);
    const syncUuid = uuidv4();
    const userRow = {
      Tenant_ID: TENANT_ID,
      Branch_ID: BRANCH_ID,
      Username: username,
      // Legacy `password` was plaintext — NEVER carried forward as a real
      // hash. Random, unusable value; every imported user must reset.
      Password_Hash: uuidv4() + uuidv4(),
      Password_Salt: uuidv4(),
      Full_Name: (r.name || username).toString().slice(0, 100),
      Email: r.email || `${username}@dlj.local`,
      Mobile: r.contact || null,
      Is_Active: r.status === 'A' || r.status === '1',
      Department: r.department || r.dept || null,
      Employee_Code: r.pfcode || null,
      Sync_UUID: syncUuid,
    };
    const employeeExtra = {
      Date_Of_Joining: toDate(r.joindate),
      Address: r.address || null,
    };

    const [cloudId] = await chunkedInsertReturningIds(cloud, 'tbl_user_master', 'User_ID', [userRow], true);
    await cloud('tbl_employee_details').insert({ User_ID: cloudId, ...employeeExtra });
    cloudMap.set(r.id, cloudId);

    const [localId] = await chunkedInsertReturningIds(local, 'tbl_user_master', 'User_ID', [userRow], false);
    await local('tbl_employee_details').insert({ User_ID: localId, ...employeeExtra });
    localMap.set(r.id, localId);
  }
  report.counts.usermaster = { legacy: rows.length, cloud: cloudMap.size, local: localMap.size };
  report.notes.push(`${rows.length} imported staff accounts have random unusable passwords — every one must go through "forgot password" before first login.`);
  return { cloudMap, localMap };
}

// ---------------------------------------------------------------------------
// 3. customer -> tbl_customer_master
// ---------------------------------------------------------------------------
async function importCustomers() {
  const rows = (await source('customer').select(
    'id', 'name', 'address', 'address1', 'place', 'phone', 'mobileno',
    'dob', 'anvsry', 'pincode', 'state', 'pan', 'gstin'
  )).map(fixRow);

  const cloudMap = new Map();
  const localMap = new Map();
  let mobileFallbacks = 0;
  let mobileDuplicates = 0;
  const usedMobiles = new Set();

  const batches = [];
  for (let i = 0; i < rows.length; i += 500) batches.push(rows.slice(i, i + 500));

  for (const batch of batches) {
    const cloudRows = [];
    const localRows = [];
    for (const r of batch) {
      let mobile = (r.mobileno || r.phone || '').toString().replace(/\D/g, '').slice(-15);
      // tbl_customer_master has a UNIQUE(Tenant_ID, Mobile_1) constraint —
      // a single shared placeholder for every missing number collides after
      // the first row. Use a per-legacy-id placeholder instead, so it's
      // both obviously fake AND unique.
      if (!mobile) { mobile = `NOPH${r.id}`; mobileFallbacks++; }
      // The legacy system itself allowed many real customers to share one
      // dummy number (e.g. "1234567890" used for anonymous/walk-in sales) —
      // that's a genuine source data-quality issue, not a bug here. The new
      // schema enforces uniqueness, so any repeat gets the same per-id
      // placeholder treatment as a missing number.
      if (usedMobiles.has(mobile)) { mobile = `NOPH${r.id}`; mobileDuplicates++; }
      usedMobiles.add(mobile);
      const syncUuid = uuidv4();
      const row = {
        Tenant_ID: TENANT_ID,
        Customer_Code: `DLJ-C${r.id}`,
        Customer_Name: (r.name || `Customer ${r.id}`).toString().slice(0, 100),
        Mobile_1: mobile,
        Date_Of_Birth: toDate(r.dob),
        Anniversary_Date: toDate(r.anvsry),
        Address_Line1: r.address || null,
        Address_Line2: r.address1 || null,
        City: r.place || null,
        State: r.state || null,
        Pincode: r.pincode || null,
        GST_No: r.gstin || null,
        PAN_No: r.pan || null,
        Is_Active: true,
        Sync_UUID: syncUuid,
      };
      cloudRows.push(row);
      localRows.push(row);
    }
    const cloudIds = await chunkedInsertReturningIds(cloud, 'tbl_customer_master', 'Customer_ID', cloudRows, true);
    const localIds = await chunkedInsertReturningIds(local, 'tbl_customer_master', 'Customer_ID', localRows, false);
    batch.forEach((r, i) => {
      cloudMap.set(r.id, cloudIds[i]);
      localMap.set(r.id, localIds[i]);
    });
  }
  report.counts.customer = { legacy: rows.length, cloud: cloudMap.size, local: localMap.size };
  if (mobileFallbacks) report.notes.push(`${mobileFallbacks} customers had no legacy mobile number — given a unique NOPH<id> placeholder, needs real-world follow-up.`);
  if (mobileDuplicates) report.notes.push(`${mobileDuplicates} customers shared a mobile number with an earlier customer in the legacy data (e.g. a dummy "walk-in customer" number reused many times) — given a unique NOPH<id> placeholder to satisfy the new schema's per-tenant uniqueness constraint; these are the ones most likely to be the same real customer recorded twice, or a shared household/family number — worth a manual review pass.`);
  return { cloudMap, localMap };
}

// ---------------------------------------------------------------------------
// 4. stock -> tbl_ornament_master
// ---------------------------------------------------------------------------
async function importStock(itemTypeMaps, designMaps, purityMaps) {
  const rows = (await source('stock').select(
    'tagno', 'itemtype', 'design', 'purity', 'pcs', 'gross', 'beeds',
    'wastage', 'netwt', 'makingcharge', 'costvalue', 'sell_rate', 'supp_rate',
    'certificateno', 'status', 'entrydate', 'location'
  )).map(fixRow);

  const cloudMap = new Map();
  const localMap = new Map();

  const batches = [];
  for (let i = 0; i < rows.length; i += 500) batches.push(rows.slice(i, i + 500));

  for (const batch of batches) {
    const cloudRows = [];
    const localRows = [];
    for (const r of batch) {
      const gross = num(r.gross);
      const netwt = num(r.netwt, gross);
      const mc = num(r.makingcharge);
      const rate = num(r.sell_rate) || num(r.supp_rate) || 0;
      const syncUuid = uuidv4();
      if (r.itemtype && !itemTypeMaps.cloudMap.has(r.itemtype)) logOrphan('stock', r.tagno, `itemtype ${r.itemtype} not found`);
      if (r.design && !designMaps.cloudMap.has(r.design)) logOrphan('stock', r.tagno, `design ${r.design} not found`);
      if (r.purity && !purityMaps.cloudMap.has(r.purity)) logOrphan('stock', r.tagno, `purity ${r.purity} not found`);

      const base = {
        Tenant_ID: TENANT_ID,
        Branch_ID: BRANCH_ID,
        Article_Number: String(r.tagno),
        Gross_Weight: gross,
        Net_Gold_Weight: netwt,
        Stone_Weight: num(r.beeds),
        Wastage_Weight: num(r.wastage),
        Current_Gold_Rate: rate,
        Base_Making_Charge_Per_Gram: netwt > 0 ? mc / netwt : 0,
        Final_Making_Charge_Total: mc,
        Purchase_Cost: num(r.costvalue),
        Stock_Quantity: num(r.pcs, 1),
        Hallmark_Certificate_No: r.certificateno || null,
        Physical_Location: r.location || null,
        Special_Instructions: `legacy_status=${r.status ?? ''}`.slice(0, 200),
        Created_Date: toDate(r.entrydate),
        Sync_UUID: syncUuid,
      };
      cloudRows.push({ ...base, Type_ID: itemTypeMaps.cloudMap.get(r.itemtype) || null, Design_ID: designMaps.cloudMap.get(r.design) || null, Purity_ID: purityMaps.cloudMap.get(r.purity) || null });
      localRows.push({ ...base, Type_ID: itemTypeMaps.localMap.get(r.itemtype) || null, Design_ID: designMaps.localMap.get(r.design) || null, Purity_ID: purityMaps.localMap.get(r.purity) || null });
    }
    const cloudIds = await chunkedInsertReturningIds(cloud, 'tbl_ornament_master', 'Ornament_ID', cloudRows, true);
    const localIds = await chunkedInsertReturningIds(local, 'tbl_ornament_master', 'Ornament_ID', localRows, false);
    batch.forEach((r, i) => {
      cloudMap.set(r.tagno, cloudIds[i]);
      localMap.set(r.tagno, localIds[i]);
    });
  }
  report.counts.stock = { legacy: rows.length, cloud: cloudMap.size, local: localMap.size };
  report.notes.push(
    'tbl_ornament_master.Is_Sold / Is_Active NOT inferred from legacy `status` char code (no legend available) — raw value preserved in Special_Instructions as "legacy_status=X"; verify sold/available status manually before relying on stock counts.'
  );
  report.notes.push('Base_Making_Charge_Per_Gram is DERIVED (makingcharge / net weight) — legacy stored a total making charge, not a per-gram rate.');
  return { cloudMap, localMap };
}

// ---------------------------------------------------------------------------
// 5. sale -> tbl_sales_header
// ---------------------------------------------------------------------------
async function importSales(customerMaps) {
  const rows = (await source('sale').select(
    'billno', 'billdate', 'customer', 'grandtotal', 'subtotal', 'taxamount',
    'cash_recd', 'chq_recd', 'card_recd', 'gross_wt', 'disc_amount',
    'round_of', 'old_value', 'old_wt'
  )).map(fixRow);

  const cloudMap = new Map();
  const localMap = new Map();

  for (const r of rows) {
    if (r.customer && !customerMaps.cloudMap.has(r.customer)) logOrphan('sale', r.billno, `customer ${r.customer} not found`);
    const subtotal = num(r.subtotal) || num(r.grandtotal);
    const grand = num(r.grandtotal) || subtotal;
    const paid = num(r.cash_recd) + num(r.chq_recd) + num(r.card_recd);
    const syncUuid = uuidv4();
    const base = {
      Tenant_ID: TENANT_ID,
      Branch_ID: BRANCH_ID,
      Invoice_Number: String(r.billno),
      Sale_Date: toDate(r.billdate) || new Date(),
      Total_Gross_Weight: num(r.gross_wt),
      Subtotal_Amount: subtotal,
      Discount_Amount: num(r.disc_amount),
      GST_Amount: num(r.taxamount),
      Round_Off_Amount: num(r.round_of),
      Net_Payable_Amount: grand,
      Amount_Paid: paid,
      Balance_Amount: grand - paid,
      Old_Gold_Exchange_Amount: num(r.old_value),
      Old_Gold_Weight: num(r.old_wt),
      Is_Exchange: num(r.old_wt) > 0,
      Payment_Status: paid >= grand ? 'Paid' : paid > 0 ? 'Partial' : 'Pending',
      Sync_UUID: syncUuid,
    };
    const [cloudId] = await chunkedInsertReturningIds(cloud, 'tbl_sales_header', 'Sale_ID', [{ ...base, Customer_ID: customerMaps.cloudMap.get(r.customer) || null }], true);
    const [localId] = await chunkedInsertReturningIds(local, 'tbl_sales_header', 'Sale_ID', [{ ...base, Customer_ID: customerMaps.localMap.get(r.customer) || null }], false);
    cloudMap.set(r.billno, cloudId);
    localMap.set(r.billno, localId);
  }
  report.counts.sale = { legacy: rows.length, cloud: cloudMap.size, local: localMap.size };
  return { cloudMap, localMap };
}

// ---------------------------------------------------------------------------
// 6. sale_details -> tbl_sales_details
// ---------------------------------------------------------------------------
async function importSaleDetails(saleMaps, stockMaps, purityMaps) {
  const rows = (await source('sale_details').select(
    'billno', 'slno', 'stock', 'purity', 'RATE', 'gross', 'beeds', 'wastage',
    'mc', 'sub_amount', 'ivalue'
  )).map(fixRow);

  let cloudCount = 0;
  let localCount = 0;

  for (const r of rows) {
    if (!saleMaps.cloudMap.has(r.billno)) { logOrphan('sale_details', `${r.billno}/${r.slno}`, `sale ${r.billno} not found`); continue; }
    if (r.stock && !stockMaps.cloudMap.has(r.stock)) logOrphan('sale_details', `${r.billno}/${r.slno}`, `stock ${r.stock} not found`);
    const gross = num(r.gross);
    const stoneWt = num(r.beeds);
    const lineTotal = num(r.sub_amount) || num(r.ivalue) || 0;
    const purityCloud = purityMaps.purityCodeById ? purityMaps.purityCodeById.get(r.purity) : null;
    const base = {
      Tenant_ID: TENANT_ID,
      Gross_Weight: gross,
      Net_Gold_Weight: gross - stoneWt,
      Stone_Weight: stoneWt,
      Purity_Code: purityCloud || null,
      Gold_Rate_Per_Gram: num(r.RATE),
      Making_Charge_Applied: num(r.mc),
      Total_Line_Price: lineTotal,
      Serial_No: num(r.slno, null),
      Sync_UUID: uuidv4(),
    };
    await cloud('tbl_sales_details').insert({ ...base, Sale_ID: saleMaps.cloudMap.get(r.billno), Ornament_ID: stockMaps.cloudMap.get(r.stock) || null });
    await local('tbl_sales_details').insert(omitTenant({ ...base, Sale_ID: saleMaps.localMap.get(r.billno), Ornament_ID: stockMaps.localMap.get(r.stock) || null }));
    cloudCount++;
    localCount++;
  }
  report.counts.sale_details = { legacy: rows.length, cloud: cloudCount, local: localCount };
}

// ---------------------------------------------------------------------------
// 7. purchase / purchase_details -> tbl_purchase_header / tbl_purchase_details
// ---------------------------------------------------------------------------
async function importPurchases(itemTypeMaps, purityMaps) {
  const headers = (await source('purchase').select('billno', 'date', 'name', 'part_cash', 'part_credit')).map(fixRow);
  // purchase_details has NO stock/itemtype FK columns at all in this legacy
  // schema (it's a metal/weight-level line, not tag-tracked) — Type_ID stays
  // null; `details` is a free-text description carried into Item_Description.
  const details = (await source('purchase_details').select(
    'billno', 'slno', 'weight', 'netwt', 'rate', 'value', 'making_charge', 'details', 'desc_type', 'purityid'
  )).map(fixRow);

  const headerCloudMap = new Map();
  const headerLocalMap = new Map();

  for (const r of headers) {
    const cashCredit = num(r.part_cash) + num(r.part_credit);
    const base = {
      Tenant_ID: TENANT_ID,
      Branch_ID: BRANCH_ID,
      Purchase_Number: String(r.billno),
      Purchase_Date: toDate(r.date) || new Date(),
      Supplier_Name: r.name || null,
      Total_Amount: cashCredit || 0.01, // placeholder; corrected below from detail sums where possible
      Sync_UUID: uuidv4(),
    };
    const [cloudId] = await chunkedInsertReturningIds(cloud, 'tbl_purchase_header', 'Purchase_ID', [base], true);
    const [localId] = await chunkedInsertReturningIds(local, 'tbl_purchase_header', 'Purchase_ID', [base], false);
    headerCloudMap.set(r.billno, cloudId);
    headerLocalMap.set(r.billno, localId);
  }
  report.counts.purchase = { legacy: headers.length, cloud: headerCloudMap.size, local: headerLocalMap.size };

  const totalsCloud = new Map();
  const totalsLocal = new Map();
  let detailCount = 0;

  for (const r of details) {
    if (!headerCloudMap.has(r.billno)) { logOrphan('purchase_details', `${r.billno}/${r.slno}`, `purchase ${r.billno} not found`); continue; }
    if (r.purityid && !purityMaps.purityCodeById?.get(r.purityid)) logOrphan('purchase_details', `${r.billno}/${r.slno}`, `purityid ${r.purityid} not found`);
    const lineValue = num(r.value) || num(r.rate) * num(r.weight) || 0;
    const base = {
      Tenant_ID: TENANT_ID,
      Item_Description: (r.details || r.desc_type || null),
      Gross_Weight: num(r.weight),
      Net_Weight: num(r.netwt),
      Purity_Code: purityMaps.purityCodeById?.get(r.purityid) || null,
      Gold_Rate: num(r.rate),
      Making_Charge: num(r.making_charge),
      Purchase_Rate: num(r.rate),
      Total_Line_Value: lineValue,
      Sync_UUID: uuidv4(),
    };
    await cloud('tbl_purchase_details').insert({ ...base, Purchase_ID: headerCloudMap.get(r.billno) });
    await local('tbl_purchase_details').insert(omitTenant({ ...base, Purchase_ID: headerLocalMap.get(r.billno) }));
    totalsCloud.set(r.billno, (totalsCloud.get(r.billno) || 0) + lineValue);
    totalsLocal.set(r.billno, (totalsLocal.get(r.billno) || 0) + lineValue);
    detailCount++;
  }
  report.counts.purchase_details = { legacy: details.length, cloud: detailCount, local: detailCount };

  // Correct header totals from the actual detail-line sums, now that they're known.
  for (const [billno, total] of totalsCloud) {
    if (total > 0) await cloud('tbl_purchase_header').where('Purchase_ID', headerCloudMap.get(billno)).update({ Total_Amount: total });
  }
  for (const [billno, total] of totalsLocal) {
    if (total > 0) await local('tbl_purchase_header').where('Purchase_ID', headerLocalMap.get(billno)).update({ Total_Amount: total });
  }
}

// ---------------------------------------------------------------------------
// 8. attendance -> tbl_attendance
// ---------------------------------------------------------------------------
async function importAttendance(userMaps) {
  const rows = (await source('attendance').select('slno', 'date1', 'employeeid', 'statusid', 'login_time', 'logout_time')).map(fixRow);
  let cloudCount = 0;
  let localCount = 0;

  const batches = [];
  for (let i = 0; i < rows.length; i += 500) batches.push(rows.slice(i, i + 500));

  for (const batch of batches) {
    const cloudRows = [];
    const localRows = [];
    for (const r of batch) {
      if (!userMaps.cloudMap.has(r.employeeid)) { logOrphan('attendance', r.slno, `employeeid ${r.employeeid} not found`); continue; }
      const date = toDate(r.date1);
      if (!date) { logOrphan('attendance', r.slno, 'invalid/missing date1'); continue; }
      const base = {
        Tenant_ID: TENANT_ID,
        Attendance_Date: date,
        Check_In: r.login_time ? new Date(r.login_time).toTimeString().slice(0, 8) : null,
        Check_Out: r.logout_time ? new Date(r.logout_time).toTimeString().slice(0, 8) : null,
        Status: 'Present',
        Source: 'Manual',
        Remarks: `legacy_statusid=${r.statusid ?? ''}`,
        Sync_UUID: uuidv4(),
      };
      cloudRows.push({ ...base, User_ID: userMaps.cloudMap.get(r.employeeid) });
      localRows.push({ ...base, User_ID: userMaps.localMap.get(r.employeeid) });
    }
    if (cloudRows.length) {
      await cloud.batchInsert('tbl_attendance', cloudRows, 500);
      await local.batchInsert('tbl_attendance', localRows.map(omitTenant), 500);
      cloudCount += cloudRows.length;
      localCount += localRows.length;
    }
  }
  report.counts.attendance = { legacy: rows.length, cloud: cloudCount, local: localCount };
  report.notes.push(
    'tbl_attendance.Status is hardcoded "Present" for every imported row — legacy `statusid` has no available legend to map Present/Absent/Half-Day/Leave correctly; raw code preserved in Remarks as "legacy_statusid=N".'
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log(`Importing DHANALAKSHMI JEWELLERS (Tenant_ID=${TENANT_ID}) into cloud Postgres + local MySQL...\n`);

  await createTenant();
  console.log('✓ Tenant + branch created');

  const itemTypeMaps = await importItemTypes();
  console.log(`✓ itemtype: ${JSON.stringify(report.counts.itemtype)}`);

  const purityMaps = await importPurity();
  // build Purity_ID -> Purity_Code lookup (cloud) for sale_details.Purity_Code
  const purityCodeById = new Map();
  for (const [legacyId] of purityMaps.cloudMap) {
    const legacyRow = await source('purity').where('id', legacyId).first();
    purityCodeById.set(legacyId, (legacyRow?.name || '').toString());
  }
  purityMaps.purityCodeById = purityCodeById;
  console.log(`✓ purity: ${JSON.stringify(report.counts.purity)}`);

  const designMaps = await importDesigns(itemTypeMaps);
  console.log(`✓ design: ${JSON.stringify(report.counts.design)}`);

  const userMaps = await importUsers();
  console.log(`✓ usermaster: ${JSON.stringify(report.counts.usermaster)}`);

  const customerMaps = await importCustomers();
  console.log(`✓ customer: ${JSON.stringify(report.counts.customer)}`);

  const stockMaps = await importStock(itemTypeMaps, designMaps, purityMaps);
  console.log(`✓ stock: ${JSON.stringify(report.counts.stock)}`);

  const saleMaps = await importSales(customerMaps);
  console.log(`✓ sale: ${JSON.stringify(report.counts.sale)}`);

  await importSaleDetails(saleMaps, stockMaps, purityMaps);
  console.log(`✓ sale_details: ${JSON.stringify(report.counts.sale_details)}`);

  await importPurchases(itemTypeMaps, purityMaps);
  console.log(`✓ purchase: ${JSON.stringify(report.counts.purchase)}`);
  console.log(`✓ purchase_details: ${JSON.stringify(report.counts.purchase_details)}`);

  await importAttendance(userMaps);
  console.log(`✓ attendance: ${JSON.stringify(report.counts.attendance)}`);

  fs.writeFileSync(path.join(__dirname, '../local-db/dlj/import-report.json'), JSON.stringify(report, null, 2));
  console.log('\n=== SUMMARY ===');
  console.log(JSON.stringify(report.counts, null, 2));
  console.log(`\nOrphans logged: ${report.orphans.length} (see local-db/dlj/import-report.json)`);
  console.log('\nNotes:');
  report.notes.forEach((n) => console.log(' - ' + n));

  await source.destroy();
  await cloud.destroy();
  await local.destroy();
}

main().catch((err) => {
  console.error('IMPORT FAILED:', err);
  process.exit(1);
});
