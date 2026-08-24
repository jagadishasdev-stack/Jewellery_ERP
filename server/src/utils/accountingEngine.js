/**
 * The shared double-entry posting engine — the actual "accounting engine"
 * the ChatGPT design doc describes, generalized from the one working
 * example that already existed (sales.js's postSaleAccountingEntries,
 * which posted directly against free-text Ledger_Account strings with no
 * real Chart of Accounts and no balance check). Every voucher type now
 * posts through this ONE function instead of duplicating that logic —
 * Sales, Purchase, Receipt, Payment, Contra/Bank Transfer, Journal, Day
 * Close all call `postJournal()` with a plain list of {account, type,
 * amount} lines; this file is the only place that touches
 * tbl_accounting_journal / tbl_accounting_entries / tbl_chart_of_accounts
 * directly.
 *
 * What this adds beyond the old sales-only version:
 *   1. A real Chart of Accounts row behind every posting (get-or-create by
 *      name) instead of a bare string with nothing backing it.
 *   2. An actual Dr = Cr balance check BEFORE anything is written — the
 *      old code had no such check at all; a bug in any caller could have
 *      silently posted an unbalanced journal.
 *   3. Bank ledgers (tbl_chart_of_accounts.Is_Bank_Account) keep
 *      tbl_bank_account_master.Current_Balance in sync automatically, so
 *      that balance is always transaction-derived, never hand-edited —
 *      exactly the principle the design doc calls "don't directly edit
 *      ledger balances."
 *   4. Every journal automatically queues a Tally sync-log row (if Tally
 *      sync is enabled for the tenant) — this is the actual mechanism
 *      behind "once they enter everything, add it on to Tally" — no
 *      route needs its own bespoke Tally-queuing code.
 */
const db = require('../db/tenantDb').tenantDb;
const dayjs = require('dayjs');

/**
 * Resolves an account name to a real Chart of Accounts row, creating one
 * on the fly (Is_System=false) if this exact tenant has never used that
 * name before — so a caller can reference a brand-new ledger name without
 * a separate "create the account first" step, while still ending up as a
 * real, visible, manageable row in that tenant's COA rather than a bare
 * string with nothing behind it.
 */
async function getOrCreateAccount(trx, tenantId, name, group = 'Expenses', sub = null) {
  const existing = await trx('tbl_chart_of_accounts').where({ Tenant_ID: tenantId, Account_Name: name }).first();
  if (existing) return existing;

  const last = await trx('tbl_chart_of_accounts').where({ Tenant_ID: tenantId, Account_Group: group }).orderBy('Account_Code', 'desc').first();
  const prefixMap = { Assets: '19', Liabilities: '29', Capital: '39', Income: '49', Expenses: '59' };
  const nextCode = last ? String(parseInt(last.Account_Code) + 1) : `${prefixMap[group] || '59'}00`;

  const [account] = await trx('tbl_chart_of_accounts').insert({
    Tenant_ID: tenantId,
    Account_Code: nextCode,
    Account_Name: name,
    Account_Group: group,
    Account_Sub_Group: sub,
    Is_System: false,
  }).returning('*');
  return account;
}

/**
 * Posts one balanced double-entry journal.
 *
 * @param {object} opts
 * @param {string} opts.tenantId
 * @param {string} opts.sourceType   e.g. 'SALE' | 'PURCHASE' | 'RECEIPT' | 'PAYMENT' | 'CONTRA' | 'JOURNAL' | 'DAY_CLOSE'
 * @param {number|string} [opts.sourceId]   the originating row's own ID, for traceability back from the journal
 * @param {string} [opts.reference]  e.g. an invoice/voucher number
 * @param {string} [opts.narration]
 * @param {Array<{account: string, group?: string, sub?: string, type: 'Dr'|'Cr', amount: number, narration?: string}>} opts.lines
 * @param {string} [opts.entryDate]  YYYY-MM-DD, defaults to today
 * @param {number} [opts.dataMode]   1|2|3, defaults to 3 (Official)
 * @param {string} [opts.createdBy]
 * @param {import('knex').Knex.Transaction} [opts.trx]  reuse an existing transaction if the caller already has one open
 * @returns {Promise<{journalId: number, journalNumber: string}>}
 */
async function postJournal({ tenantId, sourceType, sourceId, reference, narration, lines, entryDate, dataMode = 3, createdBy, trx }) {
  if (!Array.isArray(lines) || lines.length < 2) {
    throw new Error('A journal needs at least two lines (one Dr, one Cr).');
  }

  const totalDr = lines.filter((l) => l.type === 'Dr').reduce((s, l) => s + parseFloat(l.amount || 0), 0);
  const totalCr = lines.filter((l) => l.type === 'Cr').reduce((s, l) => s + parseFloat(l.amount || 0), 0);
  // Paise-level float noise is expected; anything bigger means a real bug
  // in the caller's math, and posting it would silently corrupt the books.
  if (Math.abs(totalDr - totalCr) > 0.01) {
    throw new Error(`Journal does not balance: Dr ₹${totalDr.toFixed(2)} vs Cr ₹${totalCr.toFixed(2)} (source: ${sourceType} ${sourceId || ''}).`);
  }

  const runner = trx || db;
  // NOT new Date().toISOString().split('T')[0] — UTC, not the server's
  // local (IST) calendar day. For ~5.5 hours every day (after midnight
  // IST but before midnight UTC), that would silently post every journal
  // with no explicit entryDate one day EARLIER than when it actually
  // happened — the single most consequential place this bug could hide,
  // since almost every caller (Sales, Purchase, Day Close, Vouchers)
  // relies on this default rather than passing entryDate itself.
  const date = entryDate || dayjs().format('YYYY-MM-DD');

  // Journal_Number used to be generated by reading the last-used number,
  // computing +1, and retrying up to 5 times on a unique-constraint
  // collision — found, via an actual stress test (15 journals posted at
  // once for one tenant), to still lose data: 6 of the 15 exhausted all 5
  // retries and threw, each one a real accounting entry that would have
  // silently vanished into the caller's unawaited .catch(). A read-then-
  // write with retries degrades under real concurrency; an atomic
  // increment doesn't. tbl_journal_number_counter's one UPSERT below is
  // serialized by Postgres itself — there is no window for two concurrent
  // callers to ever read the same "next" value, at any concurrency level.
  const [{ Last_Seq: jSeq }] = (await runner.raw(
    `INSERT INTO "tbl_journal_number_counter" ("Tenant_ID", "Last_Seq") VALUES (?, 1)
     ON CONFLICT ("Tenant_ID") DO UPDATE SET "Last_Seq" = "tbl_journal_number_counter"."Last_Seq" + 1
     RETURNING "Last_Seq"`,
    [tenantId]
  )).rows;
  const journalNumber = `JNL-${tenantId.slice(0, 4)}-${String(jSeq).padStart(6, '0')}`;

  const [journal] = await runner('tbl_accounting_journal').insert({
    Tenant_ID: tenantId,
    Data_Mode: dataMode,
    Journal_Number: journalNumber,
    Entry_Date: date,
    Source_Type: sourceType,
    Source_ID: sourceId || null,
    Reference: reference || null,
    Narration: narration || null,
    Created_By: createdBy || 'system',
  }).returning('*');

  const entryRows = [];
  for (const line of lines) {
    if (parseFloat(line.amount || 0) <= 0) continue;
    const account = await getOrCreateAccount(runner, tenantId, line.account, line.group, line.sub);
    entryRows.push({
      Journal_ID: journal.Journal_ID,
      Tenant_ID: tenantId,
      Data_Mode: dataMode,
      Account_ID: account.Account_ID,
      Ledger_Account: account.Account_Name,
      Account_Type: account.Account_Group,
      Entry_Type: line.type,
      Amount: line.amount,
      Narration: line.narration || narration || null,
      Entry_Date: date,
    });

    // Keep the bank's own running balance transaction-derived, never
    // hand-edited: Dr on an asset-side bank account increases it, Cr decreases it.
    if (account.Is_Bank_Account && account.Bank_Account_ID) {
      const delta = line.type === 'Dr' ? parseFloat(line.amount) : -parseFloat(line.amount);
      await runner('tbl_bank_account_master').where({ Account_ID: account.Bank_Account_ID })
        .update({ Current_Balance: runner.raw('"Current_Balance" + ?', [delta]) });
    }
  }

  if (entryRows.length) {
    await runner('tbl_accounting_entries').insert(entryRows);
  }

  // Auto-queue for Tally — the actual mechanism behind "no more entries
  // needed, once they enter everything add it on to Tally." Never blocks
  // or fails the accounting post itself if this queuing has a problem.
  try {
    const tallyConfig = await runner('tbl_tally_config').where({ Tenant_ID: tenantId, Sync_Enabled: true }).first();
    if (tallyConfig) {
      await runner('tbl_tally_sync_log').insert({
        Tenant_ID: tenantId,
        Sync_Type: 'Voucher',
        Reference_Table: 'tbl_accounting_journal',
        Reference_ID: journal.Journal_ID,
        Status: 'Pending',
      });
    }
  } catch (err) {
    console.error('[AccountingEngine] Tally auto-queue failed (journal still posted fine):', err.message);
  }

  return { journalId: journal.Journal_ID, journalNumber: journal.Journal_Number };
}

module.exports = { postJournal, getOrCreateAccount };
