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
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../../db/knex'); // control-plane connection — same as superAdmin.js
const { sendSuccess, sendError, sendValidationError } = require('../../utils/response');
const { authenticate, requireSuperAdmin } = require('../../middleware/auth');
const { body, validationResult } = require('express-validator');
const { parseUploadedFiles, saveUploadedFile } = require('./migrationParser');
const { detectSheetEntity, suggestColumnMapping, AUTO_APPROVE_THRESHOLD } = require('./migrationDetection');
const { assertMigrationStatus, nextMigrationId, getMigrationOrNull, requireMigrationReauth, MIGRATION_REAUTH_TTL } = require('./migrationShared');
const { applyTransformation } = require('./migrationTransform');
const { validateRecord } = require('./migrationValidate');
const { checkDuplicate, VALID_DUPLICATE_ACTIONS } = require('./migrationDuplicate');
const { getTenantDb } = require('../../db/tenantDbResolver');
const { runWithTenantDb } = require('../../db/tenantDb');
const { runMigration } = require('./migrationProcessor');
const { buildReconciliation } = require('./migrationReconcile');

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

// ── POST /api/migrations/verify-master — step-up re-authentication ────────────
// Requires an already-valid Super Admin session (authenticate,
// requireSuperAdmin) PLUS re-entering that SAME account's own password —
// this is a re-check, not a way to log in as a different Super Admin.
// On success, mints a separate, short-lived (30 min) token the client
// must send as X-Migration-Auth on every other /api/migrations/* call
// (see requireMigrationReauth, migrationShared.js). Deliberately NOT the
// normal session JWT — a left-open browser tab's session token alone is
// not enough to reach this feature.
router.post('/verify-master', authenticate, requireSuperAdmin, [
  body('username').notEmpty(), body('password').notEmpty(),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return sendValidationError(res, errors.array());
  try {
    if (req.body.username !== req.user.username) {
      return sendError(res, 403, 'Re-enter the same Super Admin account you are currently logged in as.');
    }
    const user = await db('tbl_user_master').where({ Tenant_ID: 'SA_MASTER', Username: req.body.username, Is_Active: true }).first();
    if (!user) return sendError(res, 401, 'Invalid credentials.');
    const valid = await bcrypt.compare(req.body.password, user.Password_Hash);
    if (!valid) return sendError(res, 401, 'Invalid credentials.');

    const token = jwt.sign({ userId: user.User_ID, username: user.Username, purpose: 'migration-access' }, process.env.JWT_SECRET, { expiresIn: MIGRATION_REAUTH_TTL });
    return sendSuccess(res, { token, expiresInMinutes: 30 }, 'Verified.');
  } catch (err) { return sendError(res, 500, 'Verification failed.'); }
});

// ── POST /api/migrations — create a new migration record (DRAFT) ──────────────
router.post('/', authenticate, requireSuperAdmin, requireMigrationReauth, [
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
router.get('/', authenticate, requireSuperAdmin, requireMigrationReauth, async (req, res) => {
  try {
    const rows = await db('migrations as m')
      .leftJoin('tbl_tenant_master as t', 'm.Tenant_ID', 't.Tenant_ID')
      .select('m.*', 't.Company_Name as Tenant_Name')
      .orderBy('m.Created_Date', 'desc').limit(200);
    const counts = await db('migrations').select('Status').count('* as count').groupBy('Status');
    return sendSuccess(res, { migrations: rows, counts: Object.fromEntries(counts.map((c) => [c.Status, parseInt(c.count)])) });
  } catch (err) { return sendError(res, 500, 'Failed to fetch migrations.'); }
});

router.get('/:id', authenticate, requireSuperAdmin, requireMigrationReauth, async (req, res) => {
  try {
    const migration = await getMigrationOr404(req.params.id, res);
    if (!migration) return;
    const files = await db('migration_files').where('Migration_ID', req.params.id);
    return sendSuccess(res, { ...migration, files });
  } catch (err) { return sendError(res, 500, 'Failed to fetch migration.'); }
});

// ── POST /api/migrations/:id/files — upload (multi-file + zip) ────────────────
router.post('/:id/files', authenticate, requireSuperAdmin, requireMigrationReauth, upload.array('files', 20), async (req, res) => {
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
router.post('/:id/analyze', authenticate, requireSuperAdmin, requireMigrationReauth, async (req, res) => {
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
router.get('/:id/analysis', authenticate, requireSuperAdmin, requireMigrationReauth, async (req, res) => {
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

// ── GET /api/migrations/:id/mapping — suggested (or previously-saved) column mapping per sheet ──
router.get('/:id/mapping', authenticate, requireSuperAdmin, requireMigrationReauth, async (req, res) => {
  try {
    const migration = await getMigrationOr404(req.params.id, res);
    if (!migration) return;

    const saved = await db('migration_mappings').where('Migration_ID', req.params.id);
    const savedByKey = new Map(saved.map((m) => [`${m.Entity_Type}|${m.Source_File}|${m.Source_Sheet}|${m.Source_Field}`, m]));

    // Group staged rows by (entity, file, sheet) and take one sample row's
    // keys as the header list — every row in a sheet shares the same
    // headers (they came from the same Excel sheet).
    const groups = await db('migration_staging_records')
      .where('Migration_ID', req.params.id)
      .select('Entity_Type', 'Source_File', 'Source_Sheet')
      .groupBy('Entity_Type', 'Source_File', 'Source_Sheet');

    const result = [];
    for (const g of groups) {
      const sample = await db('migration_staging_records')
        .where({ Migration_ID: req.params.id, Entity_Type: g.Entity_Type, Source_File: g.Source_File, Source_Sheet: g.Source_Sheet })
        .first();
      const headers = Object.keys(sample.Raw_Data || {});
      const suggested = suggestColumnMapping(headers, g.Entity_Type);
      const fields = suggested.map((s) => {
        const key = `${g.Entity_Type}|${g.Source_File}|${g.Source_Sheet}|${s.sourceField}`;
        const existing = savedByKey.get(key);
        return existing
          ? { sourceField: s.sourceField, targetField: existing.Target_Field, confidence: parseFloat(existing.Confidence), status: existing.Mapping_Type === 'Manual' ? 'manual' : s.status, isApproved: existing.Is_Approved }
          : { ...s, isApproved: s.status === 'auto' };
      });
      result.push({ entityType: g.Entity_Type, sourceFile: g.Source_File, sourceSheet: g.Source_Sheet, fields });
    }
    return sendSuccess(res, result);
  } catch (err) { return sendError(res, 500, 'Failed to fetch mapping.'); }
});

// ── POST /api/migrations/:id/mapping — save/correct the mapping (repeatable while still in MAPPING) ──
router.post('/:id/mapping', authenticate, requireSuperAdmin, requireMigrationReauth, [
  body('mappings').isArray({ min: 1 }),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return sendValidationError(res, errors.array());
  try {
    const migration = await getMigrationOr404(req.params.id, res);
    if (!migration) return;
    assertMigrationStatus(migration, ['MAPPING']);

    for (const m of req.body.mappings) {
      if (!m.entityType || !m.sourceFile || !m.sourceSheet || !m.sourceField) continue; // skip malformed rows rather than fail the whole save
      const existing = await db('migration_mappings').where({
        Migration_ID: req.params.id, Entity_Type: m.entityType, Source_File: m.sourceFile, Source_Sheet: m.sourceSheet, Source_Field: m.sourceField,
      }).first();
      const row = {
        Target_Field: m.targetField || null, Mapping_Type: 'Manual', Confidence: m.confidence ?? 100,
        Transformation_Rule: m.transformationRule ? JSON.stringify(m.transformationRule) : null,
        Is_Approved: m.isApproved !== false,
      };
      if (existing) await db('migration_mappings').where('Mapping_ID', existing.Mapping_ID).update(row);
      else await db('migration_mappings').insert({ Migration_ID: req.params.id, Entity_Type: m.entityType, Source_File: m.sourceFile, Source_Sheet: m.sourceSheet, Source_Field: m.sourceField, ...row });
    }
    return sendSuccess(res, null, 'Mapping saved.');
  } catch (err) {
    if (err.statusCode === 400) return sendError(res, 400, err.message);
    return sendError(res, 500, `Failed to save mapping: ${err.message}`);
  }
});

// ── POST /api/migrations/:id/validate — build Mapped_Data, run validation + duplicate checks ──
router.post('/:id/validate', authenticate, requireSuperAdmin, requireMigrationReauth, async (req, res) => {
  try {
    const migration = await getMigrationOr404(req.params.id, res);
    if (!migration) return;
    assertMigrationStatus(migration, ['MAPPING']);
    await db('migrations').where('Migration_ID', req.params.id).update({ Status: 'VALIDATING' });

    // Any source FIELD with no saved mapping row yet gets the auto-
    // suggested one persisted now — a Super Admin who only corrected one
    // or two fields (or none at all) never has to explicitly map every
    // remaining field by hand first. Checked per-field, not per-sheet —
    // a sheet with even one manually-saved field must not skip
    // generating the rest of that same sheet's fields.
    const groups = await db('migration_staging_records')
      .where('Migration_ID', req.params.id)
      .select('Entity_Type', 'Source_File', 'Source_Sheet')
      .groupBy('Entity_Type', 'Source_File', 'Source_Sheet');
    const existingMappings = await db('migration_mappings').where('Migration_ID', req.params.id);
    const existingKeys = new Set(existingMappings.map((m) => `${m.Entity_Type}|${m.Source_File}|${m.Source_Sheet}|${m.Source_Field}`));
    for (const g of groups) {
      const sample = await db('migration_staging_records').where({ Migration_ID: req.params.id, Entity_Type: g.Entity_Type, Source_File: g.Source_File, Source_Sheet: g.Source_Sheet }).first();
      const suggested = suggestColumnMapping(Object.keys(sample.Raw_Data || {}), g.Entity_Type);
      const toInsert = suggested.filter((s) => s.targetField && !existingKeys.has(`${g.Entity_Type}|${g.Source_File}|${g.Source_Sheet}|${s.sourceField}`));
      if (toInsert.length) {
        await db('migration_mappings').insert(toInsert.map((s) => ({
          Migration_ID: req.params.id, Entity_Type: g.Entity_Type, Source_File: g.Source_File, Source_Sheet: g.Source_Sheet,
          Source_Field: s.sourceField, Target_Field: s.targetField, Mapping_Type: 'Auto', Confidence: s.confidence,
          Is_Approved: s.confidence >= AUTO_APPROVE_THRESHOLD,
        })));
      }
    }

    const allMappings = await db('migration_mappings').where('Migration_ID', req.params.id);
    const mapByKey = new Map(allMappings.map((m) => [`${m.Entity_Type}|${m.Source_File}|${m.Source_Sheet}|${m.Source_Field}`, m]));

    const targetConn = await getTenantDb(migration.Tenant_ID);
    const counts = { Valid: 0, Warning: 0, Error: 0 };
    let duplicateCount = 0;

    await runWithTenantDb(targetConn, async () => {
      const CHUNK = 500;
      let offset = 0;
      // Ordered pagination over a potentially huge staging set, processed
      // in bounded-size chunks rather than loading everything into memory
      // at once — same batching philosophy as the DLJ migration scripts.
      while (true) {
        const chunk = await db('migration_staging_records').where('Migration_ID', req.params.id).orderBy('Staging_ID').offset(offset).limit(CHUNK);
        if (!chunk.length) break;
        await Promise.all(chunk.map(async (record) => {
          const raw = record.Raw_Data || {};
          const mapped = {};
          for (const [sourceField, rawValue] of Object.entries(raw)) {
            const key = `${record.Entity_Type}|${record.Source_File}|${record.Source_Sheet}|${sourceField}`;
            const m = mapByKey.get(key);
            if (!m || !m.Target_Field || !m.Is_Approved) continue; // unmapped or not-yet-approved columns don't make it into Mapped_Data
            mapped[m.Target_Field] = applyTransformation(rawValue, m.Transformation_Rule ? JSON.parse(m.Transformation_Rule) : null);
          }
          const { status, messages } = validateRecord(record.Entity_Type, mapped);
          const dup = await checkDuplicate(migration.Tenant_ID, record.Entity_Type, mapped);
          counts[status]++;
          if (dup) duplicateCount++;
          await db('migration_staging_records').where('Staging_ID', record.Staging_ID).update({
            Mapped_Data: JSON.stringify(mapped),
            Validation_Status: status,
            Validation_Messages: JSON.stringify(messages),
            Is_Duplicate: !!dup,
            Duplicate_Match_Id: dup ? dup.matchId : null,
          });
        }));
        offset += CHUNK;
      }
    });

    await db('migrations').where('Migration_ID', req.params.id).update({ Status: 'READY' });
    return sendSuccess(res, { ...counts, duplicates: duplicateCount, total: counts.Valid + counts.Warning + counts.Error }, 'Validation complete.');
  } catch (err) {
    if (err.statusCode === 400) return sendError(res, 400, err.message);
    await db('migrations').where('Migration_ID', req.params.id).update({ Status: 'FAILED', Failure_Reason: err.message });
    return sendError(res, 500, `Validation failed: ${err.message}`);
  }
});

// ── GET /api/migrations/:id/preview — validation summary, per entity, for the pre-approval review screen ──
router.get('/:id/preview', authenticate, requireSuperAdmin, requireMigrationReauth, async (req, res) => {
  try {
    const migration = await getMigrationOr404(req.params.id, res);
    if (!migration) return;
    const byEntity = await db('migration_staging_records')
      .where('Migration_ID', req.params.id)
      .select('Entity_Type', 'Validation_Status')
      .count('* as count')
      .groupBy('Entity_Type', 'Validation_Status');

    const summary = {};
    for (const row of byEntity) {
      summary[row.Entity_Type] ||= { Valid: 0, Warning: 0, Error: 0, Pending: 0, total: 0 };
      summary[row.Entity_Type][row.Validation_Status] = parseInt(row.count);
      summary[row.Entity_Type].total += parseInt(row.count);
    }
    const [{ duplicateCount }] = await db('migration_staging_records').where({ Migration_ID: req.params.id, Is_Duplicate: true }).count('* as duplicateCount');
    return sendSuccess(res, { migration: { Migration_ID: migration.Migration_ID, Tenant_ID: migration.Tenant_ID, Status: migration.Status }, byEntity: summary, duplicateCount: parseInt(duplicateCount) });
  } catch (err) { return sendError(res, 500, 'Failed to build preview.'); }
});

// ── GET /api/migrations/:id/duplicates — the actual duplicate rows, for review/resolution ──
router.get('/:id/duplicates', authenticate, requireSuperAdmin, requireMigrationReauth, async (req, res) => {
  try {
    const migration = await getMigrationOr404(req.params.id, res);
    if (!migration) return;
    const rows = await db('migration_staging_records').where({ Migration_ID: req.params.id, Is_Duplicate: true }).orderBy('Staging_ID');
    return sendSuccess(res, rows);
  } catch (err) { return sendError(res, 500, 'Failed to fetch duplicates.'); }
});

// ── POST /api/migrations/:id/duplicates/resolve — apply one resolution action to a set of staging rows ──
router.post('/:id/duplicates/resolve', authenticate, requireSuperAdmin, requireMigrationReauth, [
  body('stagingIds').isArray({ min: 1 }),
  body('action').isIn(VALID_DUPLICATE_ACTIONS),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return sendValidationError(res, errors.array());
  try {
    const migration = await getMigrationOr404(req.params.id, res);
    if (!migration) return;
    const count = await db('migration_staging_records')
      .where('Migration_ID', req.params.id).whereIn('Staging_ID', req.body.stagingIds)
      .update({ Duplicate_Action: req.body.action });
    return sendSuccess(res, { updated: count }, `${count} record(s) marked ${req.body.action}.`);
  } catch (err) { return sendError(res, 500, 'Failed to resolve duplicates.'); }
});

// ── POST /api/migrations/:id/approve — READY -> APPROVED, the explicit sign-off before anything writes to production ──
router.post('/:id/approve', authenticate, requireSuperAdmin, requireMigrationReauth, [
  body('confirmed').equals('true').withMessage('You must explicitly confirm before approving a production migration.'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return sendValidationError(res, errors.array());
  try {
    const migration = await getMigrationOr404(req.params.id, res);
    if (!migration) return;
    assertMigrationStatus(migration, ['READY']);
    const [updated] = await db('migrations').where('Migration_ID', req.params.id).update({ Status: 'APPROVED' }).returning('*');
    return sendSuccess(res, updated, 'Migration approved. It can now be started.');
  } catch (err) {
    if (err.statusCode === 400) return sendError(res, 400, err.message);
    return sendError(res, 500, 'Failed to approve migration.');
  }
});

// ── POST /api/migrations/:id/start — APPROVED -> RUNNING, kicks off the processor without waiting for it to finish ──
router.post('/:id/start', authenticate, requireSuperAdmin, requireMigrationReauth, async (req, res) => {
  try {
    const migration = await getMigrationOr404(req.params.id, res);
    if (!migration) return;
    assertMigrationStatus(migration, ['APPROVED']);
    await db('migrations').where('Migration_ID', req.params.id).update({ Status: 'RUNNING', Started_Date: new Date() });

    // Deliberately not awaited — this can run for a long time on a real
    // migration; the caller polls GET /:id/status (or listens for the
    // migration-progress socket event) instead of holding the HTTP
    // connection open. See migrationProcessor.js's own header comment
    // for why there's no queue/worker behind this.
    const io = req.app.get('io');
    runMigration(req.params.id, io).catch((err) => {
      db('migrations').where('Migration_ID', req.params.id).update({ Status: 'FAILED', Failure_Reason: err.message }).catch(() => {});
    });

    return sendSuccess(res, { Migration_ID: req.params.id, Status: 'RUNNING' }, 'Migration started.');
  } catch (err) {
    if (err.statusCode === 400) return sendError(res, 400, err.message);
    return sendError(res, 500, 'Failed to start migration.');
  }
});

// ── GET /api/migrations/:id/status — poll target, source of truth alongside the socket push ──
router.get('/:id/status', authenticate, requireSuperAdmin, requireMigrationReauth, async (req, res) => {
  try {
    const migration = await getMigrationOr404(req.params.id, res);
    if (!migration) return;
    return sendSuccess(res, {
      Migration_ID: migration.Migration_ID, Status: migration.Status,
      Total_Records: migration.Total_Records, Success_Records: migration.Success_Records,
      Warning_Records: migration.Warning_Records, Error_Records: migration.Error_Records,
      Started_Date: migration.Started_Date, Completed_Date: migration.Completed_Date, Failure_Reason: migration.Failure_Reason,
    });
  } catch (err) { return sendError(res, 500, 'Failed to fetch status.'); }
});

// ── GET /api/migrations/:id/report — final summary (doc §50) ──────────────────
router.get('/:id/report', authenticate, requireSuperAdmin, requireMigrationReauth, async (req, res) => {
  try {
    const migration = await getMigrationOr404(req.params.id, res);
    if (!migration) return;
    const byEntity = await db('migration_staging_records')
      .where('Migration_ID', req.params.id).select('Entity_Type', 'Import_Status').count('* as c').groupBy('Entity_Type', 'Import_Status');
    const summary = {};
    for (const row of byEntity) {
      summary[row.Entity_Type] ||= { Imported: 0, Skipped: 0, Failed: 0, Pending: 0 };
      summary[row.Entity_Type][row.Import_Status] = parseInt(row.c);
    }
    const errorLogs = await db('migration_logs').where({ Migration_ID: req.params.id, Status: 'ERROR' }).orderBy('Log_ID', 'desc').limit(200);
    return sendSuccess(res, { migration, byEntity: summary, errorLogs });
  } catch (err) { return sendError(res, 500, 'Failed to build report.'); }
});

// ── GET /api/migrations/:id/reconciliation — doc §51-52 ────────────────────────
router.get('/:id/reconciliation', authenticate, requireSuperAdmin, requireMigrationReauth, async (req, res) => {
  try {
    const result = await buildReconciliation(req.params.id);
    if (!result) return sendError(res, 404, 'Migration not found.');
    return sendSuccess(res, result);
  } catch (err) { return sendError(res, 500, 'Failed to build reconciliation.'); }
});

module.exports = router;
