/**
 * One-time ETL: import store(s) from the separate savings-app MySQL
 * database (kumudu_jms — stores/branch/scheme/groups/members/
 * member_ledger, currently powering the live New-Saving-App-Frontend +
 * savingappbackend system) into Jewellery ERP's own Postgres schema, so
 * the savings app can eventually run entirely on Jewellery ERP's database
 * instead of a separate MySQL one.
 *
 * Run manually, ONE store (Tenant_ID you choose):
 *   node scripts/migrate-savingsapp-tenant.js 827 TULASI_CHIK
 * Run manually, EVERY remaining store (Tenant_ID auto-derived from name+id,
 * e.g. store 22 "NATIONAL GOLD AND DIAMOND" -> NATIONALGOLD22):
 *   node scripts/migrate-savingsapp-tenant.js --all
 * Not wired into any route or scheduled job — one-time migration.
 *
 * Deliberate scope/decisions (documented here, not silently assumed):
 *   - ALWAYS creates a brand-new Tenant_ID — never merges into an existing
 *     tenant, even one with a similar name (e.g. the existing TULASI_BLR/
 *     DLJ/CHAM_MYS/SAGAR demo tenants are NOT touched). Tenant-identity
 *     matching across the two systems is a business decision, not
 *     something this script guesses at. --all skips this collision
 *     entirely by always appending the source store_id to the derived
 *     Tenant_ID, so it can never collide with a hand-created tenant.
 *   - The source `scheme` table is, in practice, one vestigial row per
 *     store (its own scheme_id often doesn't even match what `groups`
 *     reference) — real plan variety lives at the GROUP level. This
 *     script creates exactly ONE tbl_scheme_master row per migrated
 *     store and points every migrated group at it.
 *   - member_ledger.note: 'R' -> Txn_Type 'Collection' (the vast
 *     majority, includes both cash-in-shop and app payments, source
 *     doesn't distinguish structurally beyond `channel`), 'A' ->
 *     'Adjustment', 'C' -> 'Collection' (a smaller secondary credit type
 *     whose exact meaning isn't documented anywhere in the source system
 *     either — treated as money received, flagged in Notes either way).
 *   - member_ledger.pmode is a bare integer with NO lookup table found
 *     anywhere in the source system — stored as `Legacy-<pmode>` rather
 *     than guessing a label (e.g. "Cash") that could be wrong.
 *   - Historical transactions are imported as DATA ONLY — this script
 *     does NOT post them to tbl_accounting_journal. Replaying millions of
 *     backdated journal entries for historical import is a separate,
 *     deliberate decision the user should make explicitly, not something
 *     this script does as a side effect. Only NEW collections going
 *     forward (via the real /api/savings/collect endpoint) post normally.
 *   - No password is set for migrated members — the source system has no
 *     password/OTP for this store's members at all. App_Login_Enabled
 *     stays false until a store admin sets each member's password via
 *     the ERP (Password_Hash/Password_Salt columns added in
 *     20260820000000_add_login_credentials_to_scheme_members.js).
 *   - Large stores (hundreds of thousands of ledger rows) are inserted in
 *     chunks (BATCH_SIZE) rather than row-by-row for practical runtime.
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const knexLib = require('knex');
const { v4: uuidv4 } = require('uuid');

const BATCH_SIZE = 2000;
const args = process.argv.slice(2);
const ALL_MODE = args[0] === '--all';

// ---------------------------------------------------------------------------
// Connections
// ---------------------------------------------------------------------------
const source = knexLib({
  client: 'mysql2',
  connection: {
    host: '148.72.208.43',
    port: 3306,
    user: 'kumudu_rajesh',
    password: process.env.SAVINGSAPP_DB_PASSWORD,
    database: 'kumudu_jms',
  },
  pool: { min: 1, max: 5 },
});

const target = knexLib({
  client: 'pg',
  connection: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 5432,
    database: process.env.DB_NAME || 'JewelleryERP',
    user: process.env.DB_USER || 'admin',
    password: process.env.DB_PASSWORD || 'securepass',
  },
  pool: { min: 1, max: 5 },
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function safeDate(v, fallback = null) {
  if (!v) return fallback;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return fallback;
  if (d.getFullYear() <= 1900) return fallback; // legacy sentinel dates
  return d;
}

function num(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// Derives a short, human-readable, collision-free Tenant_ID: cleaned store
// name (max 12 chars) + store_id (always unique, so this can never collide
// with a hand-created tenant like "DLJ" or "SAGAR").
function deriveTenantId(storeId, storeName) {
  const clean = (storeName || 'STORE').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12) || 'STORE';
  return `${clean}${storeId}`.slice(0, 20);
}

const TXN_TYPE_MAP = { R: 'Collection', A: 'Adjustment', C: 'Collection' };

// Batched insert with RETURNING, preserving input order (a single
// multi-row Postgres INSERT...VALUES RETURNING returns rows in the same
// order the VALUES were listed — used here to zip results back to their
// source rows for FK mapping).
async function insertBatched(table, rows, returningCols) {
  const results = [];
  for (const part of chunk(rows, BATCH_SIZE)) {
    if (part.length === 0) continue;
    const inserted = await target(table).insert(part).returning(returningCols);
    results.push(...inserted);
  }
  return results;
}

async function migrateStore(storeId, tenantId, globalReport) {
  const report = { storeId, tenantId, counts: {}, orphans: [], notes: [] };

  const existing = await target('tbl_tenant_master').where('Tenant_ID', tenantId).first();
  if (existing) {
    report.notes.push(`SKIPPED — Tenant_ID ${tenantId} already exists.`);
    globalReport.push(report);
    return;
  }

  const store = await source('stores').where('store_id', storeId).first();
  if (!store) {
    report.notes.push(`SKIPPED — store_id ${storeId} not found.`);
    globalReport.push(report);
    return;
  }

  const now = new Date();
  const licenseExpiry = new Date(now);
  licenseExpiry.setFullYear(licenseExpiry.getFullYear() + 1);

  // ── 1. Store -> Tenant ────────────────────────────────────────────────
  const companyName = (store.store_name || '').trim() || tenantId;
  await target('tbl_tenant_master').insert({
    Tenant_ID: tenantId,
    Company_Name: companyName,
    Brand_Code: tenantId.slice(0, 10),
    GST_No: store.gst_no || null,
    Address_Line1: store.store_address || null,
    City: store.store_city || null,
    State: store.store_state || null,
    Pincode: store.store_pincode || null,
    Country: store.store_country || 'India',
    Phone: store.store_mobile || store.store_phone || null,
    Email: store.store_email || null,
    License_Key: `${tenantId.slice(0, 10)}-${uuidv4()}`, // License_Key is varchar(50) — keep well under it
    Is_Active: store.status === 'A',
    License_Expiry_Date: licenseExpiry,
    Business_Type: 'RETAILER',
    Store_Type: 'Retailer',
    Notes: `Migrated from savings-app stores.store_id=${storeId} on ${now.toISOString().slice(0, 10)}`,
    Created_Date: now,
    Modified_Date: now,
    Sync_UUID: uuidv4(),
  });
  report.counts.tenant = { legacy: 1, imported: 1 };

  // ── 2. Branch ────────────────────────────────────────────────────────────
  const branches = await source('branch').where('store_id', storeId);
  const branchIdMap = {};
  const branchSource = branches.length > 0 ? branches : [{
    branch_code: store.branch, branch_name: store.branch,
    branch_address: store.store_address, branch_city: store.store_city,
    branch_state: store.store_state, branch_phone: store.store_mobile,
  }];
  let branchCount = 0;
  for (const b of branchSource) {
    const Branch_ID = `${tenantId}-${(b.branch_code || 'HO').toUpperCase()}`.slice(0, 20);
    await target('tbl_branch_master').insert({
      Branch_ID, Tenant_ID: tenantId,
      Branch_Name: b.branch_name || b.branch_code || 'Head Office',
      Branch_Code: b.branch_code || 'HO',
      Address_Line1: b.branch_address || null,
      City: b.branch_city || null, State: b.branch_state || null,
      Phone: b.branch_mobile || b.branch_phone || null,
      Is_Head_Office: branchCount === 0,
      Is_Active: true, Created_Date: now, Modified_Date: now,
      Sync_UUID: uuidv4(),
    });
    branchIdMap[b.branch_code] = Branch_ID;
    branchCount++;
  }
  report.counts.branch = { legacy: branchSource.length, imported: branchCount };

  // ── 3. One tbl_scheme_master row per store ──────────────────────────────
  const [scheme] = await target('tbl_scheme_master').insert({
    Tenant_ID: tenantId,
    Scheme_Code: 'MAIN',
    Scheme_Name: `${companyName} Savings Scheme`,
    Description: `Migrated from savings-app store_id=${storeId}`,
    Scheme_Type: 'Gold',
    Is_Active: true,
    Created_Date: now, Modified_Date: now,
    Sync_UUID: uuidv4(),
  }).returning('Scheme_ID');
  const schemeId = scheme.Scheme_ID;
  report.counts.scheme = { legacy: 1, imported: 1 };

  // ── 4. Groups ────────────────────────────────────────────────────────────
  const groups = await source('groups').where('store_id', storeId);
  const groupIdMap = {};
  const groupByCode = {};
  for (const g of groups) groupByCode[g.code] = g;
  if (groups.length > 0) {
    const rows = groups.map((g) => ({
      Tenant_ID: tenantId,
      Scheme_ID: schemeId,
      Group_Code: g.code,
      Group_Name: g.code,
      Start_Date: safeDate(g.created_date) || safeDate(g.drawdate) || now,
      Monthly_Amount: num(g.AMOUNT),
      Total_Installments: num(g.no_inst, 12),
      Member_Limit: num(g.no_of_members, 0),
      Current_Members: 0,
      Gold_Conversion_Applicable: g.gold_scheme === '1',
      Bonus_Amount: num(g.bonus),
      Status: g.activegroup === 'Y' && g.closed !== '1' ? 'Active' : 'Closed',
      Created_By: 'migration-script',
      Created_Date: now,
      Sync_UUID: uuidv4(),
      __code: g.code, // stripped before insert, kept for zipping below
    }));
    const inserted = await insertBatched('tbl_scheme_groups', rows.map(({ __code, ...r }) => r), ['Group_ID']);
    rows.forEach((r, i) => { groupIdMap[r.__code] = inserted[i].Group_ID; });
  }
  report.counts.groups = { legacy: groups.length, imported: Object.keys(groupIdMap).length };

  // ── 5. Members -> tbl_customer_master + tbl_scheme_members (batched) ───
  const members = await source('members').where('store_id', storeId);
  const memberIdMap = {}; // legacy member_id -> new Member_ID
  const groupMemberCounts = {};

  // 5a. Dedup by mobile WITHIN this store's member set (real data has
  // members legitimately sharing a household phone — see file header).
  const mobileToCustomerRow = new Map(); // mobile -> row to insert (first occurrence wins)
  for (const m of members) {
    const mobile = (m.mobile || '').trim() || `NOPHONE-${m.member_id}`;
    if (!mobileToCustomerRow.has(mobile)) {
      mobileToCustomerRow.set(mobile, {
        Tenant_ID: tenantId,
        Customer_Code: `SA-${m.member_id}`,
        Customer_Name: (m.name || '').trim() || `Member ${m.member_no}`,
        Mobile_1: mobile,
        Address_Line1: m.address1 || null,
        City: m.place || null,
        Date_Of_Birth: safeDate(m.dob),
        Is_Active: m.status !== 'C',
        Created_By: 'migration-script',
        Created_Date: safeDate(m.created_date) || now,
        Notes: `Migrated from savings-app members.member_id=${m.member_id}`,
        Sync_UUID: uuidv4(),
      });
    }
  }
  const customerMobiles = [...mobileToCustomerRow.keys()];
  const customerRows = customerMobiles.map((mob) => mobileToCustomerRow.get(mob));
  const insertedCustomers = await insertBatched('tbl_customer_master', customerRows, ['Customer_ID', 'Mobile_1']);
  const mobileToCustomerId = new Map(insertedCustomers.map((c) => [c.Mobile_1, c.Customer_ID]));
  const dedupedCount = members.length - customerMobiles.length;
  if (dedupedCount > 0) report.notes.push(`${dedupedCount} member(s) shared a mobile number with another member and were linked to the same customer record instead of duplicated.`);

  // 5b. Scheme members, referencing the (deduped) customer IDs.
  const memberRows = members.map((m) => {
    const mobile = (m.mobile || '').trim() || `NOPHONE-${m.member_id}`;
    const groupId = groupIdMap[m.mgroup] || null;
    if (!groupId) report.orphans.push({ table: 'members', legacyId: m.member_id, reason: `no matching group for mgroup="${m.mgroup}"` });
    const g = groupByCode[m.mgroup];
    return {
      Tenant_ID: tenantId,
      Member_Number: `SA-${m.member_id}`,
      Customer_ID: mobileToCustomerId.get(mobile),
      Member_Name: (m.name || '').trim() || `Member ${m.member_no}`,
      Mobile: mobile,
      Address_Line1: m.address1 || null,
      City: m.place || null,
      Scheme_ID: schemeId,
      Group_ID: groupId,
      Joining_Date: safeDate(m.created_date) || now,
      Installment_Amount: num(m.scheme_amount, num(g?.AMOUNT, 1000)),
      Total_Installments: num(g?.no_inst, 12),
      Total_Amount_Paid: num(m.c_balance),
      Gold_Balance_Grams: num(m.g_balance),
      Maturity_Date: safeDate(m.maturity_dt),
      Status: m.status === 'C' ? 'Closed' : 'Active',
      App_Login_Enabled: false,
      Join_Source: 'Counter',
      Created_By: 'migration-script',
      Created_Date: safeDate(m.created_date) || now,
      Sync_UUID: uuidv4(),
      __legacyId: m.member_id,
      __groupId: groupId,
    };
  });
  const insertedMembers = await insertBatched(
    'tbl_scheme_members',
    memberRows.map(({ __legacyId, __groupId, ...r }) => r),
    ['Member_ID'],
  );
  memberRows.forEach((r, i) => {
    memberIdMap[r.__legacyId] = insertedMembers[i].Member_ID;
    if (r.__groupId) groupMemberCounts[r.__groupId] = (groupMemberCounts[r.__groupId] || 0) + 1;
  });
  report.counts.members = { legacy: members.length, imported: insertedMembers.length };

  for (const [groupId, count] of Object.entries(groupMemberCounts)) {
    await target('tbl_scheme_groups').where('Group_ID', groupId).update({ Current_Members: count });
  }

  // ── 6. Ledger -> tbl_scheme_transactions (data only, batched, no journal) ─
  const ledgerRows = await source('member_ledger').where('store_id', storeId).orderBy('voucher_date', 'asc').orderBy('id', 'asc');
  const installmentCounters = {};
  const txnRows = [];
  for (const l of ledgerRows) {
    const newMemberId = memberIdMap[l.member_id];
    if (!newMemberId) {
      report.orphans.push({ table: 'member_ledger', legacyId: l.id, reason: `no matching migrated member for member_id=${l.member_id}` });
      continue;
    }
    installmentCounters[newMemberId] = (installmentCounters[newMemberId] || 0) + 1;
    txnRows.push({
      Tenant_ID: tenantId,
      Receipt_Number: `SA-LEG-${l.id}`,
      Member_ID: newMemberId,
      Txn_Type: TXN_TYPE_MAP[l.note] || 'Collection',
      Installment_No: installmentCounters[newMemberId],
      Payment_Date: safeDate(l.voucher_date) || now,
      Amount: num(l.amount),
      Net_Amount: num(l.amount) - num(l.cancelled_amount),
      Payment_Mode: `Legacy-${l.pmode ?? 'unknown'}`,
      Payment_Reference: l.voucher_no || null,
      Collection_Source: l.channel === 'app' ? 'App' : 'Counter',
      Branch_ID: branchIdMap[l.branch] || Object.values(branchIdMap)[0] || null,
      Notes: `Migrated from savings-app member_ledger.id=${l.id}, voucher_no=${l.voucher_no}, note=${l.note}, remark=${l.remark || ''}`,
      Created_By: 'migration-script',
      Created_Date: now,
      Sync_UUID: uuidv4(),
    });
  }
  // No FK needs to flow back out of this insert — plain batched insert, no RETURNING.
  for (const part of chunk(txnRows, BATCH_SIZE)) {
    if (part.length === 0) continue;
    await target('tbl_scheme_transactions').insert(part);
  }
  report.counts.ledger = { legacy: ledgerRows.length, imported: txnRows.length };

  globalReport.push(report);
  console.log(`  [${storeId} -> ${tenantId}] tenant=${companyName} members=${report.counts.members.imported}/${members.length} txns=${report.counts.ledger.imported}/${ledgerRows.length} orphans=${report.orphans.length}`);
}

function printReport(globalReport) {
  console.log('\n\n=== MIGRATION SUMMARY ===\n');
  let totalOrphans = 0;
  for (const r of globalReport) {
    if (r.notes.some((n) => n.startsWith('SKIPPED'))) {
      console.log(`store ${r.storeId} -> ${r.tenantId}: ${r.notes[0]}`);
      continue;
    }
    console.log(`\nstore ${r.storeId} -> ${r.tenantId}`);
    for (const [table, c] of Object.entries(r.counts)) {
      const flag = c.legacy === c.imported ? 'OK' : 'MISMATCH';
      console.log(`    ${table.padEnd(10)} legacy=${c.legacy}  imported=${c.imported}  [${flag}]`);
    }
    if (r.orphans.length) console.log(`    orphans: ${r.orphans.length}`);
    r.notes.forEach((n) => console.log(`    note: ${n}`));
    totalOrphans += r.orphans.length;
  }
  console.log(`\nTotal orphans across all stores: ${totalOrphans}`);
}

async function main() {
  const globalReport = [];

  if (ALL_MODE || args[0] === '--batch') {
    let stores = await source('stores').select('store_id', 'store_name');
    if (args[0] === '--batch') {
      const ids = new Set(args[1].split(',').map((s) => parseInt(s, 10)));
      stores = stores.filter((s) => ids.has(s.store_id));
    }
    console.log(`=== Migrating ${stores.length} store(s) ===\n`);
    for (const s of stores) {
      const tenantId = deriveTenantId(s.store_id, s.store_name);
      try {
        await migrateStore(s.store_id, tenantId, globalReport);
      } catch (err) {
        console.error(`  [${s.store_id} -> ${tenantId}] FAILED: ${err.message}`);
        globalReport.push({ storeId: s.store_id, tenantId, counts: {}, orphans: [], notes: [`FAILED: ${err.message}`] });
      }
    }
  } else {
    const storeId = parseInt(args[0], 10);
    if (!storeId) {
      console.error('Usage: node scripts/migrate-savingsapp-tenant.js <store_id> [tenant_id]');
      console.error('   or: node scripts/migrate-savingsapp-tenant.js --all');
      console.error('   or: node scripts/migrate-savingsapp-tenant.js --batch <id1,id2,...>');
      process.exit(1);
    }
    let tenantId = args[1];
    if (!tenantId) {
      const s = await source('stores').where('store_id', storeId).first();
      tenantId = deriveTenantId(storeId, s?.store_name);
    }
    await migrateStore(storeId, tenantId, globalReport);
  }

  printReport(globalReport);
}

main()
  .catch((err) => { console.error('MIGRATION FAILED:', err); process.exitCode = 1; })
  .finally(() => { source.destroy(); target.destroy(); });
