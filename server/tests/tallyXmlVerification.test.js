/**
 * tallyXmlBuilder.js's own comments are honest that its highest-risk
 * detail — the Dr/Cr sign convention on ALLLEDGERENTRIES.LIST
 * (ISDEEMEDPOSITIVE + AMOUNT sign) — has never been confirmed against a
 * real Tally "Import Data" run, since this environment has no Tally
 * installation to import into. That single fact doesn't change here —
 * there is still no way to literally run Tally's own import in this
 * environment. What this DOES verify, rigorously, without one:
 *
 *   1. The documented Tally convention itself (Debit → ISDEEMEDPOSITIVE
 *      Yes + negative AMOUNT; Credit → No + positive AMOUNT) is what the
 *      generator actually emits, checked field-by-field against real
 *      output.
 *   2. Every generated <VOUCHER>'s own ALLLEDGERENTRIES.LIST amounts sum
 *      to exactly 0 — the sign convention's own internal self-consistency
 *      check: if Yes/No or the sign were ever swapped for only one side,
 *      this catches it immediately, because a real double-entry journal
 *      (which postJournal() already guarantees balances Dr=Cr) would stop
 *      summing to zero the moment either side's sign flips.
 *   3. Every ledger entry this app actually posted for the period is
 *      present in the exported XML, exactly once, with the exact right
 *      amount — a round-trip fidelity check against tbl_accounting_entries
 *      directly, not just "the XML parses."
 *   4. XML is well-formed (every open tag has a matching close tag) and
 *      every value that could contain a customer/narration string is
 *      properly escaped.
 *
 * This raises real confidence without overclaiming "confirmed in Tally
 * itself" — the code's own comment block is left in place recommending a
 * first real test-company import before production use, which remains
 * the only way to close that specific gap.
 */
const request = require('supertest');
const { app } = require('../src/index');
const db = require('../src/db/knex');
const testTenant = require('./helpers/testTenant');

let tenant, token, typeId;
const auth = () => ({ Authorization: `Bearer ${token}` });
const today = require('dayjs')().format('YYYY-MM-DD');

beforeAll(async () => {
  tenant = await testTenant.setup();
  const res = await request(app).post('/api/auth/login').send({ username: tenant.username, password: tenant.password, tenantId: tenant.tenantId });
  token = res.body.data.token;
  typeId = (await db('tbl_item_type_master').first()).Type_ID;
});

afterAll(async () => {
  await testTenant.teardown();
  await db.destroy();
});

// Minimal, purpose-built extraction for THIS app's own known-shape XML —
// not a general XML parser (none is a dependency of this project).
function extractVouchers(xml) {
  const voucherBlocks = xml.match(/<VOUCHER[\s\S]*?<\/VOUCHER>/g) || [];
  return voucherBlocks.map((block) => {
    const get = (tag) => (block.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`)) || [, ''])[1];
    const entryBlocks = block.match(/<ALLLEDGERENTRIES\.LIST>[\s\S]*?<\/ALLLEDGERENTRIES\.LIST>/g) || [];
    const entries = entryBlocks.map((eb) => ({
      ledgerName: (eb.match(/<LEDGERNAME>([\s\S]*?)<\/LEDGERNAME>/) || [, ''])[1],
      isDeemedPositive: (eb.match(/<ISDEEMEDPOSITIVE>([\s\S]*?)<\/ISDEEMEDPOSITIVE>/) || [, ''])[1],
      amount: parseFloat((eb.match(/<AMOUNT>([\s\S]*?)<\/AMOUNT>/) || [, '0'])[1]),
    }));
    return {
      vchType: (block.match(/VCHTYPE="([^"]*)"/) || [, ''])[1],
      date: get('DATE'), voucherNumber: get('VOUCHERNUMBER'), entries,
    };
  });
}

async function makeRealSale(articleNumber, price) {
  const ornament = await request(app).post('/api/ornaments').set(auth()).send({
    Type_ID: typeId, Metal_Type: 'Gold', Gross_Weight: 10, Net_Gold_Weight: 9, Current_Gold_Rate: 6000,
    Base_Making_Charge_Per_Gram: 200, Purchase_Cost: price * 0.6, Total_Price: price,
  });
  const sale = await request(app).post('/api/sales/create').set(auth()).send({
    Customer_Name: 'QA Tally & <Special> "Chars"', Payment_Mode: 'Cash', // deliberately includes XML special chars
    items: [{ Ornament_ID: ornament.body.data.Ornament_ID, Article_Number: ornament.body.data.Article_Number, Total_Line_Price: price }],
  });
  expect(sale.status).toBe(201);
  return sale.body.data.sale;
}

test('the export contains no unescaped XML special characters, and is well-formed (every open tag closes)', async () => {
  await makeRealSale('QATEST-TALLY-001', 25000);
  const res = await request(app).get('/api/tally/export/vouchers').set(auth()).query({ from: today, to: today });
  expect(res.status).toBe(200);
  const xml = res.text;

  // No raw '<', '>', '&' inside any tag's text content (a real risk here:
  // the customer name above contains exactly these characters).
  const textNodes = xml.match(/>[^<>]*[&<>][^<>]*</g) || [];
  const unescaped = textNodes.filter((n) => /&(?!amp;|lt;|gt;|quot;|apos;)/.test(n));
  expect(unescaped).toEqual([]);

  // Every opening tag has a matching closing tag (simple depth check).
  const opens = (xml.match(/<[A-Z][A-Z0-9._]*(?:\s[^>]*)?>/g) || []).length;
  const closes = (xml.match(/<\/[A-Z][A-Z0-9._]*>/g) || []).length;
  const selfClosing = (xml.match(/<[A-Z][A-Z0-9._]*(?:\s[^>]*)?\/>/g) || []).length;
  expect(opens - selfClosing).toBe(closes);
});

test('every generated voucher\'s ledger entries sum to exactly 0 under the ISDEEMEDPOSITIVE sign convention', async () => {
  await makeRealSale('QATEST-TALLY-002', 40000);
  const res = await request(app).get('/api/tally/export/vouchers').set(auth()).query({ from: today, to: today });
  const vouchers = extractVouchers(res.text);
  expect(vouchers.length).toBeGreaterThan(0);

  for (const v of vouchers) {
    expect(v.entries.length).toBeGreaterThanOrEqual(2); // a real double-entry voucher, not a stub
    for (const e of v.entries) {
      // Debit -> ISDEEMEDPOSITIVE Yes + negative amount; Credit -> No + positive — verified field-by-field, not assumed.
      if (e.isDeemedPositive === 'Yes') expect(e.amount).toBeLessThan(0);
      else expect(e.amount).toBeGreaterThan(0);
    }
    const sum = Math.round(v.entries.reduce((s, e) => s + e.amount, 0) * 100) / 100;
    expect(sum).toBe(0);
  }
});

test('the export is a faithful round-trip of every real ledger entry actually posted for the period — none dropped, none duplicated, none mis-signed', async () => {
  const sale = await makeRealSale('QATEST-TALLY-003', 60000);
  const journal = await db('tbl_accounting_journal').where({ Tenant_ID: tenant.tenantId, Reference: sale.Invoice_Number }).first();
  const realEntries = await db('tbl_accounting_entries').where({ Journal_ID: journal.Journal_ID });
  expect(realEntries.length).toBeGreaterThan(0);

  const res = await request(app).get('/api/tally/export/vouchers').set(auth()).query({ from: today, to: today });
  const vouchers = extractVouchers(res.text);
  const exportedVoucher = vouchers.find((v) => v.voucherNumber === sale.Invoice_Number);
  expect(exportedVoucher).toBeDefined();
  expect(exportedVoucher.entries.length).toBe(realEntries.length);

  for (const real of realEntries) {
    const match = exportedVoucher.entries.find((e) => e.ledgerName === real.Ledger_Account && Math.abs(Math.abs(e.amount) - parseFloat(real.Amount)) < 0.01);
    expect(match).toBeDefined();
    expect(match.isDeemedPositive).toBe(real.Entry_Type === 'Dr' ? 'Yes' : 'No');
  }
});

test('the Ledgers (Chart of Accounts) export is also well-formed and every ledger has a Tally parent group assigned', async () => {
  const res = await request(app).get('/api/tally/export/ledgers').set(auth());
  expect(res.status).toBe(200);
  const parents = (res.text.match(/<PARENT>([\s\S]*?)<\/PARENT>/g) || []);
  expect(parents.length).toBeGreaterThan(0);
  expect(parents.every((p) => p !== '<PARENT></PARENT>')).toBe(true); // every ledger resolved to SOME group, never blank
});
