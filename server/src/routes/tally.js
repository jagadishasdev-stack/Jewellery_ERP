const router = require('express').Router();
const { body, validationResult } = require('express-validator');
const db = require('../db/tenantDb').tenantDb;
const { sendSuccess, sendError, sendValidationError } = require('../utils/response');
const { authenticate } = require('../middleware/auth');
const { requireModuleAccess } = require('../utils/moduleOverride');
const { buildLedgersXml, buildVouchersXml } = require('../utils/tallyXmlBuilder');

// ── Tally Config (one row per tenant) ──────────────────────────────────────────
router.get('/config', authenticate, requireModuleAccess('tally_bridge', 'View'), async (req, res) => {
  try {
    const row = await db('tbl_tally_config').where('Tenant_ID', req.user.tenantId).first();
    return sendSuccess(res, row || null);
  } catch (err) { return sendError(res, 500, 'Failed to fetch Tally config.'); }
});

router.put('/config', authenticate, requireModuleAccess('tally_bridge', 'Edit'), async (req, res) => {
  try {
    const existing = await db('tbl_tally_config').where('Tenant_ID', req.user.tenantId).first();
    if (existing) {
      const [row] = await db('tbl_tally_config').where('Config_ID', existing.Config_ID).update({ ...req.body, Modified_Date: new Date() }).returning('*');
      return sendSuccess(res, row, 'Tally config updated.');
    }
    const [row] = await db('tbl_tally_config').insert({ ...req.body, Tenant_ID: req.user.tenantId }).returning('*');
    return sendSuccess(res, row, 'Tally config created.', 201);
  } catch (err) { return sendError(res, 500, 'Failed to save Tally config.'); }
});

// ── Sync Log ─────────────────────────────────────────────────────────────────────
router.get('/sync-log', authenticate, requireModuleAccess('tally_bridge', 'View'), async (req, res) => {
  const { status, syncType } = req.query;
  try {
    let qb = db('tbl_tally_sync_log').where('Tenant_ID', req.user.tenantId);
    if (status) qb = qb.where('Status', status);
    if (syncType) qb = qb.where('Sync_Type', syncType);
    return sendSuccess(res, await qb.orderBy('Created_Date', 'desc').limit(200));
  } catch (err) { return sendError(res, 500, 'Failed to fetch Tally sync log.'); }
});

// POST /sync — queues one record for Tally export. There's no live Tally
// XML/HTTP integration wired up (that needs the shop's own Tally server
// reachable on their LAN, which this environment has no access to); this
// endpoint gives the rest of the app a real, working contract to call, and
// leaves the entry Pending for whatever actually talks to Tally to pick up
// and mark Synced/Failed.
router.post('/sync', authenticate, requireModuleAccess('tally_bridge', 'Add'), [
  body('Sync_Type').isIn(['Voucher', 'Ledger', 'StockItem']), body('Reference_Table').notEmpty(), body('Reference_ID').notEmpty(),
], async (req, res) => {
  const tenantId = req.user.tenantId;
  try {
    const config = await db('tbl_tally_config').where('Tenant_ID', tenantId).first();
    if (!config?.Sync_Enabled) return sendError(res, 400, 'Tally sync is not enabled for this tenant. Configure and enable it first via PUT /config.');
    const [row] = await db('tbl_tally_sync_log').insert({ ...req.body, Tenant_ID: tenantId, Status: 'Pending' }).returning('*');
    return sendSuccess(res, row, 'Queued for Tally sync.', 201);
  } catch (err) { return sendError(res, 500, 'Failed to queue Tally sync: ' + err.message); }
});

router.put('/sync-log/:id', authenticate, requireModuleAccess('tally_bridge', 'Edit'), [body('Status').isIn(['Pending', 'Synced', 'Failed'])], async (req, res) => {
  try {
    const update = { ...req.body };
    if (req.body.Status === 'Synced') update.Synced_Date = new Date();
    const [row] = await db('tbl_tally_sync_log').where({ Log_ID: req.params.id, Tenant_ID: req.user.tenantId }).update(update).returning('*');
    if (!row) return sendError(res, 404, 'Sync log entry not found.');
    return sendSuccess(res, row, 'Sync log updated.');
  } catch (err) { return sendError(res, 500, 'Failed to update sync log.'); }
});

// ── GET /api/tally/export/ledgers ───────────────────────────────────────────────
// Downloadable Tally-import-ready XML for the Chart of Accounts. Deliberately
// a download, not an automatic push — a bookkeeper should review/import this
// once via Tally's own Import Data screen before anything is ever pushed live.
router.get('/export/ledgers', authenticate, requireModuleAccess('tally_bridge', 'View'), async (req, res) => {
  const tenantId = req.user.tenantId;
  try {
    const config = await db('tbl_tally_config').where({ Tenant_ID: tenantId }).first();
    const accounts = await db('tbl_chart_of_accounts').where({ Tenant_ID: tenantId, Is_Active: true }).orderBy('Account_Code');
    const xml = buildLedgersXml(config?.Tally_Company_Name || req.user.companyName || tenantId, accounts);
    res.set('Content-Type', 'application/xml');
    res.set('Content-Disposition', `attachment; filename="${tenantId}-tally-ledgers.xml"`);
    return res.send(xml);
  } catch (err) { return sendError(res, 500, 'Failed to generate Tally ledger XML: ' + err.message); }
});

// Resolves which journals to export — an explicit date range, or (with
// neither from/to given) exactly what's Pending in the sync log. Shared by
// both /export/vouchers (XML) and /export/vouchers-excel (CSV) below so the
// two formats are always built from the identical, complete journal —
// every real posted entry, full amounts, nothing filtered out or excluded
// (unlike the Official-mode report queries elsewhere in this app that
// deliberately exclude hidden-stock sales — see reports.js/dataModeFilter.js
// — the accounting journal itself never applies that exclusion, so this
// export is always the true, complete books).
async function resolveJournalsForExport(tenantId, from, to) {
  let journalIds;
  if (from || to) {
    let qb = db('tbl_accounting_journal').where({ Tenant_ID: tenantId });
    if (from) qb = qb.where('Entry_Date', '>=', from);
    if (to) qb = qb.where('Entry_Date', '<=', to);
    journalIds = (await qb.select('Journal_ID')).map((r) => r.Journal_ID);
  } else {
    const pending = await db('tbl_tally_sync_log').where({ Tenant_ID: tenantId, Status: 'Pending', Reference_Table: 'tbl_accounting_journal' });
    journalIds = pending.map((r) => r.Reference_ID);
  }
  if (!journalIds.length) return [];
  const journals = await db('tbl_accounting_journal').whereIn('Journal_ID', journalIds).orderBy('Entry_Date');
  const entries = await db('tbl_accounting_entries').whereIn('Journal_ID', journalIds);
  const byJournal = {};
  for (const e of entries) (byJournal[e.Journal_ID] = byJournal[e.Journal_ID] || []).push(e);
  return journals.filter((j) => byJournal[j.Journal_ID]?.length).map((j) => ({ journal: j, entries: byJournal[j.Journal_ID] }));
}

// ── GET /api/tally/export/vouchers ──────────────────────────────────────────────
// ?from=&to= exports every journal in that date range; with neither, exports
// exactly the Pending rows in tbl_tally_sync_log (i.e. only what's actually
// been queued since the last sync) and marks them Synced on successful
// generation — generating the file IS the "sync" for a download-then-import
// workflow, since there's no way to confirm Tally itself actually imported it.
router.get('/export/vouchers', authenticate, requireModuleAccess('tally_bridge', 'View'), async (req, res) => {
  const tenantId = req.user.tenantId;
  const { from, to } = req.query;
  try {
    const config = await db('tbl_tally_config').where({ Tenant_ID: tenantId }).first();
    const journalsWithEntries = await resolveJournalsForExport(tenantId, from, to);
    if (!journalsWithEntries.length) return sendError(res, 400, 'Nothing to export — no journals in range (or no Pending sync entries queued).');

    const xml = buildVouchersXml(config?.Tally_Company_Name || req.user.companyName || tenantId, journalsWithEntries);

    if (!from && !to) {
      const journalIds = journalsWithEntries.map(({ journal }) => journal.Journal_ID);
      await db('tbl_tally_sync_log').where({ Tenant_ID: tenantId, Status: 'Pending', Reference_Table: 'tbl_accounting_journal' }).whereIn('Reference_ID', journalIds)
        .update({ Status: 'Synced', Synced_Date: new Date() });
    }

    res.set('Content-Type', 'application/xml');
    res.set('Content-Disposition', `attachment; filename="${tenantId}-tally-vouchers.xml"`);
    return res.send(xml);
  } catch (err) { return sendError(res, 500, 'Failed to generate Tally voucher XML: ' + err.message); }
});

// ── GET /api/tally/export/vouchers-excel ────────────────────────────────────────
// A plain, human-readable CSV (opens directly in Excel) of the exact same
// complete journal the XML export above uses — one row per ledger entry —
// for manual review, handing to a bookkeeper, or reconciling against Tally
// after import. Always requires an explicit date range: unlike the XML
// route, this is a read-only companion and deliberately never marks
// anything Synced, so downloading it can never interfere with the XML
// export's Pending-queue bookkeeping.
router.get('/export/vouchers-excel', authenticate, requireModuleAccess('tally_bridge', 'View'), async (req, res) => {
  const tenantId = req.user.tenantId;
  const { from, to } = req.query;
  if (!from || !to) return sendError(res, 400, 'from and to date are both required.');
  try {
    const journalsWithEntries = await resolveJournalsForExport(tenantId, from, to);
    if (!journalsWithEntries.length) return sendError(res, 400, 'Nothing to export — no journals in that range.');

    const headers = ['Voucher_Number', 'Date', 'Voucher_Type', 'Narration', 'Ledger_Account', 'Dr_Cr', 'Amount'];
    const rows = [headers.join(',')];
    for (const { journal, entries } of journalsWithEntries) {
      const dateStr = (journal.Entry_Date instanceof Date ? journal.Entry_Date : new Date(journal.Entry_Date)).toISOString().slice(0, 10);
      for (const e of entries) {
        rows.push([
          journal.Reference || journal.Journal_Number,
          dateStr,
          journal.Source_Type || 'Journal',
          journal.Narration || '',
          e.Ledger_Account,
          e.Entry_Type,
          parseFloat(e.Amount).toFixed(2),
        ].map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','));
      }
    }

    res.set('Content-Type', 'text/csv');
    res.set('Content-Disposition', `attachment; filename="${tenantId}-tally-vouchers_${from}_to_${to}.csv"`);
    return res.send(rows.join('\n'));
  } catch (err) { return sendError(res, 500, 'Failed to generate voucher Excel export: ' + err.message); }
});

// ── POST /api/tally/push ────────────────────────────────────────────────────────
// Best-effort HTTP push to Tally's own local XML gateway (Gateway of Tally
// → F12 Configure → Advanced Configuration → enable ODBC/XML server,
// typically port 9000) — only reachable if this app and Tally are on the
// same machine/LAN, which is genuinely outside what this environment can
// ever verify. Every outcome (including "couldn't even connect") is logged
// to tbl_tally_sync_log rather than assumed — never claims success it
// didn't actually observe.
router.post('/push', authenticate, requireModuleAccess('tally_bridge', 'Approve'), async (req, res) => {
  const tenantId = req.user.tenantId;
  try {
    const config = await db('tbl_tally_config').where({ Tenant_ID: tenantId, Sync_Enabled: true }).first();
    if (!config) return sendError(res, 400, 'Tally sync is not enabled for this tenant.');
    if (!config.Server_IP) return sendError(res, 400, 'No Tally Server IP configured — set one via PUT /config, or use /export/vouchers to download the XML and import it manually instead.');

    const pending = await db('tbl_tally_sync_log').where({ Tenant_ID: tenantId, Status: 'Pending', Reference_Table: 'tbl_accounting_journal' });
    if (!pending.length) return sendSuccess(res, { pushed: 0 }, 'Nothing pending to push.');

    const journalIds = pending.map((r) => r.Reference_ID);
    const journals = await db('tbl_accounting_journal').whereIn('Journal_ID', journalIds);
    const entries = await db('tbl_accounting_entries').whereIn('Journal_ID', journalIds);
    const byJournal = {};
    for (const e of entries) (byJournal[e.Journal_ID] = byJournal[e.Journal_ID] || []).push(e);
    const journalsWithEntries = journals.filter((j) => byJournal[j.Journal_ID]?.length).map((j) => ({ journal: j, entries: byJournal[j.Journal_ID] }));
    const xml = buildVouchersXml(config.Tally_Company_Name || req.user.companyName || tenantId, journalsWithEntries);

    const url = `http://${config.Server_IP}:${config.Server_Port || 9000}`;
    let tallyResponseText;
    try {
      const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/xml' }, body: xml, signal: AbortSignal.timeout(15000) });
      tallyResponseText = await response.text();
      // Tally's own gateway responds 200 OK even for a request it rejected
      // internally — a real error shows up as <LINEERROR> in the response
      // body, not the HTTP status. Treat that as a failure, not a success.
      if (!response.ok || /<LINEERROR>/i.test(tallyResponseText)) {
        throw new Error(tallyResponseText.slice(0, 500) || `Tally responded with HTTP ${response.status}`);
      }
    } catch (fetchErr) {
      await db('tbl_tally_sync_log').whereIn('Log_ID', pending.map((p) => p.Log_ID))
        .update({ Status: 'Failed', Error_Message: `Could not reach Tally at ${url}: ${fetchErr.message}` });
      return sendError(res, 502, `Could not reach Tally at ${url}: ${fetchErr.message}. The XML itself is unaffected — use /export/vouchers to download and import it manually instead.`);
    }

    await db('tbl_tally_sync_log').whereIn('Log_ID', pending.map((p) => p.Log_ID))
      .update({ Status: 'Synced', Synced_Date: new Date() });
    await db('tbl_tally_config').where({ Tenant_ID: tenantId }).update({ Last_Sync_Date: new Date() });

    return sendSuccess(res, { pushed: pending.length }, `Pushed ${pending.length} voucher(s) to Tally.`);
  } catch (err) { return sendError(res, 500, 'Tally push failed: ' + err.message); }
});

module.exports = router;
