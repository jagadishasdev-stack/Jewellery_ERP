/**
 * Backup — genuinely absent before (no backup/restore capability of any
 * kind existed anywhere in the codebase). Deliberately scoped to ONLY
 * the safe, non-destructive direction: an on-demand, read-only export of
 * this tenant's own data, downloadable as JSON. Restore is NOT built —
 * that's the genuinely risky direction on a live production system (a
 * broken restore could destroy real data), and there's no way to make
 * that safe without a much larger, carefully-reviewed effort this pass
 * didn't have scope for. Admin-gated (tenant_management) since this reads
 * every tenant-scoped table at once, unlike routine day-to-day actions.
 */
const router = require('express').Router();
const db = require('../db/tenantDb').tenantDb;
const { sendSuccess, sendError } = require('../utils/response');
const { authenticate, requirePermission } = require('../middleware/auth');

const ROW_CAP = 5000; // a hard cap per table, surfaced via `truncated`, not silent

// ── GET /api/backup/tables — which tables this export covers, and how
// many rows each currently has for this tenant, before actually pulling
// any data. Lets an admin sanity-check size before exporting.
router.get('/tables', authenticate, requirePermission('tenant_management'), async (req, res) => {
  try {
    const cols = await db('information_schema.columns')
      .where({ table_schema: 'public', column_name: 'Tenant_ID' })
      .select('table_name');
    const tables = cols.map((c) => c.table_name).sort();
    const counts = await Promise.all(tables.map(async (t) => {
      try {
        const [{ count }] = await db(t).where({ Tenant_ID: req.user.tenantId }).count('* as count');
        return { table: t, rows: parseInt(count) };
      } catch {
        return { table: t, rows: null }; // table exists in the schema list but this tenant's DB shape differs — surfaced, not hidden
      }
    }));
    return sendSuccess(res, counts);
  } catch (err) {
    return sendError(res, 500, 'Failed to list backup tables.');
  }
});

// ── GET /api/backup/export — the actual data, one JSON array per table.
// Read-only, nothing here writes or deletes anything.
router.get('/export', authenticate, requirePermission('tenant_management'), async (req, res) => {
  try {
    const cols = await db('information_schema.columns')
      .where({ table_schema: 'public', column_name: 'Tenant_ID' })
      .select('table_name');
    const tables = cols.map((c) => c.table_name).sort();

    const result = { exportedAt: new Date().toISOString(), tenantId: req.user.tenantId, tables: {} };
    for (const table of tables) {
      try {
        const rows = await db(table).where({ Tenant_ID: req.user.tenantId }).limit(ROW_CAP + 1);
        result.tables[table] = { rows: rows.slice(0, ROW_CAP), truncated: rows.length > ROW_CAP };
      } catch (err) {
        result.tables[table] = { rows: [], truncated: false, error: err.message };
      }
    }
    res.setHeader('Content-Disposition', `attachment; filename="backup-${req.user.tenantId}-${Date.now()}.json"`);
    return sendSuccess(res, result);
  } catch (err) {
    return sendError(res, 500, 'Failed to export backup.');
  }
});

module.exports = router;
