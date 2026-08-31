/**
 * Data Migration Center — bulk-import a customer's old ERP data into a
 * chosen tenant. Super-Admin-only: this is the one existing gate for a
 * route that writes into an ARBITRARY tenant chosen from a list (not the
 * caller's own tenant) — every precedent for that shape in this codebase
 * (superAdmin.js) uses requireSuperAdmin, not requirePermission
 * ('tenant_management') which is the self-serve, own-tenant-only gate.
 *
 * All control-plane tables (migrations/migration_files/migration_
 * mappings/migration_staging_records/migration_id_mappings/migration_
 * logs) live on the SAME connection as tbl_tenant_master — this is the
 * platform operator's own operational data about the migration process,
 * not tenant business data.
 *
 * State machine: DRAFT -> UPLOADED -> ANALYZING -> MAPPING -> VALIDATING
 * -> READY -> APPROVED -> RUNNING -> COMPLETED, with FAILED reachable
 * from ANALYZING/VALIDATING/RUNNING. Enforced the same idiomatic way as
 * purchase.js/stockReconciliation.js: fetch the row, compare .Status,
 * reject with a descriptive 400 naming both the required and actual
 * status (assertMigrationStatus, migrationShared.js).
 */
const router = require('express').Router();
const multer = require('multer');
const fs = require('fs');
const db = require('../../db/knex'); // control-plane connection — same as superAdmin.js
const { sendSuccess, sendError, sendValidationError } = require('../../utils/response');
const { authenticate, requireSuperAdmin } = require('../../middleware/auth');
const { body, validationResult } = require('express-validator');
const { parseUploadedFiles, saveUploadedFile } = require('./migrationParser');
const { detectSheetEntity } = require('./migrationDetection');
const { assertMigrationStatus, nextMigrationId, getMigrationOrNull } = require('./migrationShared');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB — doc's own stated limit, far above excelImport.js's 5MB since this handles real full-ERP exports
  fileFilter: (req, file, cb) => {
    const ok = ['.xlsx', '.xls', '.csv', '.zip'].some((ext) => file.originalname.toLowerCase().endsWith(ext));
    cb(ok ? null : new Error('Only .xlsx, .xls, .csv, or .zip files are accepted.'), ok);
  },
});

async function getMigrationOr404(id, res) {
  const migration = await getMigrationOrNull(id);
  if (!migration) { sendError(res, 404, 'Migration not found.'); return null; }
  return migration;
}

// ── POST /api/migrations — create a new migration record (DRAFT) ──────────────
router.post('/', authenticate, requireSuperAdmin, [
  body('Tenant_ID').notEmpty().withMessage('Target tenant is required'),
  body('Migration_Type').isIn(['Full', 'Master', 'OpeningBalance', 'Transaction']),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return sendValidationError(res, errors.array());
  try {
    const tenant = await db('tbl_tenant_master').where('Tenant_ID', req.body.Tenant_ID).first();
    if (!tenant) return sendError(res, 404, 'Target tenant not found.');

    const migrationId = await nextMigrationId();
    const [migration] = await db('migrations').insert({
      Migration_ID: migrationId,
      Tenant_ID: req.body.Tenant_ID,
      Branch_ID: req.body.Branch_ID || null,
      Migration_Type: req.body.Migration_Type,
      Source_ERP: req.body.Source_ERP || null,
      Status: 'DRAFT',
      Created_By: req.user.userId,
    }).returning('*');
    return sendSuccess(res, migration, `Migration ${migrationId} created.`, 201);
  } catch (err) { return sendError(res, 500, 'Failed to create migration.'); }
});

// ── GET /api/migrations — dashboard list ───────────────────────────────────────
router.get('/', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const rows = await db('migrations as m')
      .leftJoin('tbl_tenant_master as t', 'm.Tenant_ID', 't.Tenant_ID')
      .select('m.*', 't.Company_Name as Tenant_Name')
      .orderBy('m.Created_Date', 'desc').limit(200);
    const counts = await db('migrations').select('Status').count('* as count').groupBy('Status');
    return sendSuccess(res, { migrations: rows, counts: Object.fromEntries(counts.map((c) => [c.Status, parseInt(c.count)])) });
  } catch (err) { return sendError(res, 500, 'Failed to fetch migrations.'); }
});

router.get('/:id', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const migration = await getMigrationOr404(req.params.id, res);
    if (!migration) return;
    const files = await db('migration_files').where('Migration_ID', req.params.id);
    return sendSuccess(res, { ...migration, files });
  } catch (err) { return sendError(res, 500, 'Failed to fetch migration.'); }
});

// ── POST /api/migrations/:id/files — upload (multi-file + zip) ────────────────
router.post('/:id/files', authenticate, requireSuperAdmin, upload.array('files', 20), async (req, res) => {
  if (!req.files?.length) return sendError(res, 400, 'No files uploaded.');
  try {
    const migration = await getMigrationOr404(req.params.id, res);
    if (!migration) return;
    assertMigrationStatus(migration, ['DRAFT', 'UPLOADED']);

    const saved = [];
    for (const file of req.files) {
      const ext = file.originalname.toLowerCase().split('.').pop();
      const storagePath = saveUploadedFile(req.params.id, file);
      const [row] = await db('migration_files').insert({
        Migration_ID: req.params.id, File_Name: file.originalname, File_Type: ext,
        File_Size: file.size, Storage_Path: storagePath,
      }).returning('*');
      saved.push(row);
    }
    await db('migrations').where('Migration_ID', req.params.id).update({ Status: 'UPLOADED' });
    return sendSuccess(res, saved, `${saved.length} file(s) uploaded.`, 201);
  } catch (err) {
    if (err.statusCode === 400) return sendError(res, 400, err.message);
    return sendError(res, 500, `Upload failed: ${err.message}`);
  }
});

// ── POST /api/migrations/:id/analyze — parse every uploaded file, detect sheets/entities/columns ──
router.post('/:id/analyze', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const migration = await getMigrationOr404(req.params.id, res);
    if (!migration) return;
    assertMigrationStatus(migration, ['UPLOADED', 'ANALYZING']);
    await db('migrations').where('Migration_ID', req.params.id).update({ Status: 'ANALYZING' });

    const fileRows = await db('migration_files').where('Migration_ID', req.params.id);
    if (!fileRows.length) { await db('migrations').where('Migration_ID', req.params.id).update({ Status: 'UPLOADED' }); return sendError(res, 400, 'No files to analyze.'); }

    // A re-run of analyze (UPLOADED->ANALYZING or ANALYZING->ANALYZING after
    // a failure) must not double-stage rows already staged by a prior run.
    await db('migration_staging_records').where('Migration_ID', req.params.id).del();

    const sheets = [];
    for (const fileRow of fileRows) {
      const buffer = fs.readFileSync(fileRow.Storage_Path);
      const parsed = parseUploadedFiles([{ originalname: fileRow.File_Name, buffer }]);
      for (const sheet of parsed) {
        const headers = sheet.rows.length ? Object.keys(sheet.rows[0]) : [];
        const detected = detectSheetEntity(sheet.sheetName, headers);
        sheets.push({
          fileName: sheet.fileName, sheetName: sheet.sheetName,
          rowCount: sheet.rows.length, headers,
          detectedEntity: detected?.entityType || null,
          detectedLabel: detected?.label || null,
          detectionConfidence: detected?.confidence || 0,
        });
        // Stage every row now (Raw_Data only — Mapped_Data comes after
        // mapping is confirmed in a later batch), so the mapping/
        // validation steps don't need to re-parse the files.
        if (detected && sheet.rows.length) {
          const batch = sheet.rows.map((row, i) => ({
            Migration_ID: req.params.id, Entity_Type: detected.entityType,
            Source_File: sheet.fileName, Source_Sheet: sheet.sheetName, Source_Row: i + 2,
            Raw_Data: JSON.stringify(row),
          }));
          const CHUNK = 500; // same reasoning as the DLJ scripts — stay well under Postgres's per-query bind-parameter limit for wide rows
          for (let i = 0; i < batch.length; i += CHUNK) {
            await db('migration_staging_records').insert(batch.slice(i, i + CHUNK));
          }
        }
      }
    }

    const totalRecords = sheets.reduce((s, sh) => s + (sh.detectedEntity ? sh.rowCount : 0), 0);
    await db('migrations').where('Migration_ID', req.params.id).update({ Status: 'MAPPING', Total_Records: totalRecords });
    return sendSuccess(res, { sheets, totalRecords }, 'Analysis complete.');
  } catch (err) {
    // A precondition rejection (wrong status) never got as far as setting
    // ANALYZING in the first place — nothing to unwind, and it must NOT be
    // reported as a migration failure (that's a real, later-stage error).
    if (err.statusCode === 400) return sendError(res, 400, err.message);
    await db('migrations').where('Migration_ID', req.params.id).update({ Status: 'FAILED', Failure_Reason: err.message });
    return sendError(res, 500, `Analysis failed: ${err.message}`);
  }
});

// ── GET /api/migrations/:id/analysis — re-fetch the analysis summary without re-parsing ──
router.get('/:id/analysis', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const migration = await getMigrationOr404(req.params.id, res);
    if (!migration) return;
    const summary = await db('migration_staging_records')
      .where('Migration_ID', req.params.id)
      .select('Entity_Type', 'Source_File', 'Source_Sheet')
      .count('* as row_count')
      .groupBy('Entity_Type', 'Source_File', 'Source_Sheet');
    return sendSuccess(res, summary.map((s) => ({ ...s, row_count: parseInt(s.row_count) })));
  } catch (err) { return sendError(res, 500, 'Failed to fetch analysis.'); }
});

module.exports = router;
