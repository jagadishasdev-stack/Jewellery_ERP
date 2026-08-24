/**
 * Real Tally XML generation — the actual mechanism behind "no more
 * entries needed, once they enter everything add it on to Tally."
 * Previously tally.js only ever queued a Pending row in
 * tbl_tally_sync_log with zero XML ever generated; this is what turns
 * that queue into something Tally can genuinely import.
 *
 * ── Honesty about what's actually verified here ─────────────────────────
 * This environment has no live Tally installation to import into, so this
 * is built to Tally's own documented XML import schema as precisely as
 * I can from that documentation — it has NOT been confirmed against a
 * real Tally "Import Data" run. The single highest-risk detail is the
 * Dr/Cr sign convention on ALLLEDGERENTRIES.LIST (ISDEEMEDPOSITIVE +
 * AMOUNT sign) — get that backwards and every imported voucher posts
 * with every side flipped, silently, until someone notices their ledgers
 * are wrong. Import the FIRST batch into a throwaway TEST company in
 * Tally (Company → Create, any dummy name) and check it against this
 * app's own Trial Balance before ever importing into a real company.
 *
 * Tally's own account-group names (Cash-in-Hand, Sundry Debtors, Duties &
 * Taxes, etc.) are mapped from this app's Account_Group/Account_Sub_Group
 * — approximate by design; a bookkeeper should re-map anything that lands
 * in the wrong Tally group after the first real import.
 */
const escapeXml = (str) => String(str ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]
));

// Entry_Date comes back from Postgres as a real JS Date object (node-pg's
// default parsing for a `date` column), not a plain string — found by
// actually generating and inspecting the XML: naively stringifying a Date
// gives "Tue Jul 21 2026 ..." and slicing THAT produces garbage like
// "Tue Jul 21" instead of Tally's required YYYYMMDD. Handle both a real
// Date and an already-ISO string explicitly rather than assuming either.
const tallyDate = (value) => {
  const d = value instanceof Date ? value : new Date(value);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yyyy}${mm}${dd}`;
};

// Our Account_Group + Account_Sub_Group → Tally's own standard group names.
const TALLY_PARENT_GROUP = {
  'Assets|Cash': 'Cash-in-Hand',
  'Assets|Bank': 'Bank Accounts',
  'Assets|Receivable': 'Sundry Debtors',
  'Assets|Tax Credit': 'Duties & Taxes',
  'Assets|Inventory': 'Current Assets', // Tally models real stock items separately; this is a value-only placeholder ledger, not a StockItem
  'Assets|Fixed Asset': 'Fixed Assets',
  'Liabilities|Payable': 'Sundry Creditors',
  'Liabilities|Tax Payable': 'Duties & Taxes',
  'Liabilities|Advance': 'Current Liabilities',
  'Liabilities|Provision': 'Current Liabilities',
  'Liabilities|Loan': 'Loans (Liability)',
  'Capital|Capital': 'Capital Account',
  'Income|Direct Income': 'Sales Accounts',
  'Income|Indirect Income': 'Indirect Incomes',
  'Expenses|Direct Expense': 'Direct Expenses',
  'Expenses|Indirect Expense': 'Indirect Expenses',
};
const parentGroupFor = (account) => TALLY_PARENT_GROUP[`${account.Account_Group}|${account.Account_Sub_Group}`]
  || { Assets: 'Current Assets', Liabilities: 'Current Liabilities', Capital: 'Capital Account', Income: 'Indirect Incomes', Expenses: 'Indirect Expenses' }[account.Account_Group]
  || 'Suspense A/c';

function envelope(companyName, requestData) {
  return `<ENVELOPE>
<HEADER>
<TALLYREQUEST>Import Data</TALLYREQUEST>
</HEADER>
<BODY>
<IMPORTDATA>
<REQUESTDESC>
<REPORTNAME>All Masters</REPORTNAME>
<STATICVARIABLES>
<SVCURRENTCOMPANY>${escapeXml(companyName)}</SVCURRENTCOMPANY>
</STATICVARIABLES>
</REQUESTDESC>
<REQUESTDATA>
${requestData}
</REQUESTDATA>
</IMPORTDATA>
</BODY>
</ENVELOPE>`;
}

/** Chart of Accounts → Tally Ledger master XML (one <TALLYMESSAGE> per account). */
function buildLedgersXml(companyName, accounts) {
  const messages = accounts.map((a) => `<TALLYMESSAGE xmlns:UDF="TallyUDF">
<LEDGER NAME="${escapeXml(a.Account_Name)}" ACTION="Create">
<PARENT>${escapeXml(parentGroupFor(a))}</PARENT>
<ISBILLWISEON>${a.Account_Sub_Group === 'Receivable' || a.Account_Sub_Group === 'Payable' ? 'Yes' : 'No'}</ISBILLWISEON>
<OPENINGBALANCE>${a.Opening_Balance_Type === 'Dr' ? '' : '-'}${parseFloat(a.Opening_Balance || 0).toFixed(2)}</OPENINGBALANCE>
</LEDGER>
</TALLYMESSAGE>`).join('\n');
  return envelope(companyName, messages);
}

// Tally's own Sales/Purchase/Receipt/Payment voucher types, vs. the plain
// Journal used for everything else — mapping our Source_Type to the
// closest real Tally voucher type gives a bookkeeper a familiar, correctly
// categorized voucher instead of every single thing landing as "Journal."
const VOUCHER_TYPE_MAP = { SALE: 'Sales', PURCHASE: 'Purchase', RECEIPT: 'Receipt', PAYMENT: 'Payment', CONTRA: 'Contra' };

/**
 * One journal (header + its entries) → one Tally <VOUCHER>.
 * Sign convention used here (per Tally's documented XML import schema):
 * Debit entries → ISDEEMEDPOSITIVE=Yes, AMOUNT negative.
 * Credit entries → ISDEEMEDPOSITIVE=No, AMOUNT positive.
 */
function buildVoucherXml(companyName, journal, entries) {
  const vchType = VOUCHER_TYPE_MAP[journal.Source_Type] || 'Journal';
  const ledgerEntries = entries.map((e) => {
    const isDebit = e.Entry_Type === 'Dr';
    const signedAmount = isDebit ? -Math.abs(e.Amount) : Math.abs(e.Amount);
    return `<ALLLEDGERENTRIES.LIST>
<LEDGERNAME>${escapeXml(e.Ledger_Account)}</LEDGERNAME>
<ISDEEMEDPOSITIVE>${isDebit ? 'Yes' : 'No'}</ISDEEMEDPOSITIVE>
<AMOUNT>${parseFloat(signedAmount).toFixed(2)}</AMOUNT>
</ALLLEDGERENTRIES.LIST>`;
  }).join('\n');

  const message = `<TALLYMESSAGE xmlns:UDF="TallyUDF">
<VOUCHER VCHTYPE="${escapeXml(vchType)}" ACTION="Create">
<DATE>${tallyDate(journal.Entry_Date)}</DATE>
<VOUCHERTYPENAME>${escapeXml(vchType)}</VOUCHERTYPENAME>
<VOUCHERNUMBER>${escapeXml(journal.Reference || journal.Journal_Number)}</VOUCHERNUMBER>
<NARRATION>${escapeXml(journal.Narration || '')}</NARRATION>
${ledgerEntries}
</VOUCHER>
</TALLYMESSAGE>`;
  return envelope(companyName, message);
}

/** Multiple journals in one envelope — one HTTP push / one file, many vouchers. */
function buildVouchersXml(companyName, journalsWithEntries) {
  const messages = journalsWithEntries.map(({ journal, entries }) => {
    const vchType = VOUCHER_TYPE_MAP[journal.Source_Type] || 'Journal';
    const ledgerEntries = entries.map((e) => {
      const isDebit = e.Entry_Type === 'Dr';
      const signedAmount = isDebit ? -Math.abs(e.Amount) : Math.abs(e.Amount);
      return `<ALLLEDGERENTRIES.LIST>
<LEDGERNAME>${escapeXml(e.Ledger_Account)}</LEDGERNAME>
<ISDEEMEDPOSITIVE>${isDebit ? 'Yes' : 'No'}</ISDEEMEDPOSITIVE>
<AMOUNT>${parseFloat(signedAmount).toFixed(2)}</AMOUNT>
</ALLLEDGERENTRIES.LIST>`;
    }).join('\n');
    return `<TALLYMESSAGE xmlns:UDF="TallyUDF">
<VOUCHER VCHTYPE="${escapeXml(vchType)}" ACTION="Create">
<DATE>${tallyDate(journal.Entry_Date)}</DATE>
<VOUCHERTYPENAME>${escapeXml(vchType)}</VOUCHERTYPENAME>
<VOUCHERNUMBER>${escapeXml(journal.Reference || journal.Journal_Number)}</VOUCHERNUMBER>
<NARRATION>${escapeXml(journal.Narration || '')}</NARRATION>
${ledgerEntries}
</VOUCHER>
</TALLYMESSAGE>`;
  }).join('\n');
  return envelope(companyName, messages);
}

module.exports = { buildLedgersXml, buildVoucherXml, buildVouchersXml, tallyDate };
