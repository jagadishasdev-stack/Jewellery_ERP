/**
 * Data Migration Center — shared state-machine helpers, used by
 * migrationRoutes.js and (in later batches) the entity migrators /
 * processor. Split out from migrationRoutes.js so those files can import
 * this without pulling in the Express router itself.
 */
const dayjs = require('dayjs');
const jwt = require('jsonwebtoken');
const db = require('../../db/knex'); // control-plane connection — same as tbl_tenant_master/superAdmin.js
const { sendError } = require('../../utils/response');

const VALID_STATUSES = ['DRAFT', 'UPLOADED', 'ANALYZING', 'MAPPING', 'VALIDATING', 'READY', 'APPROVED', 'RUNNING', 'COMPLETED', 'FAILED'];

// Every /api/migrations/* route writes into (or reveals the state of) an
// ARBITRARY tenant's production data — the highest-blast-radius surface
// in this app. On top of the normal session + Super Admin role check,
// this requires a SEPARATE, short-lived, step-up re-authentication:
// the same Super Admin re-enters their own password (POST /verify-master)
// before touching anything else here, the same pattern cloud consoles use
// for their most sensitive actions. The resulting token is deliberately
// NOT the same as the normal session JWT — a stolen/left-open session
// token alone is not enough to reach this feature.
const MIGRATION_REAUTH_TTL = '30m';

function requireMigrationReauth(req, res, next) {
  const token = req.headers['x-migration-auth'];
  if (!token) return sendError(res, 401, 'This screen requires a fresh Super Admin sign-in — please verify your master login again.');
  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    return sendError(res, 401, err.name === 'TokenExpiredError' ? 'Your Data Migration sign-in has expired — please verify again.' : 'Invalid Data Migration sign-in.');
  }
  if (decoded.purpose !== 'migration-access' || decoded.userId !== req.user.userId) {
    // Never let a re-auth token minted for one Super Admin cover a
    // DIFFERENT logged-in session, even another real Super Admin's.
    return sendError(res, 401, 'This sign-in does not match your current session — please verify again.');
  }
  next();
}

function assertMigrationStatus(migration, allowed) {
  if (!allowed.includes(migration.Status)) {
    const err = new Error(`This action requires status ${allowed.join(' or ')} — this migration is ${migration.Status}.`);
    err.statusCode = 400;
    throw err;
  }
}

async function nextMigrationId() {
  const today = dayjs().format('YYYYMMDD');
  const prefix = `MIG-${today}-`;
  const last = await db('migrations').where('Migration_ID', 'like', `${prefix}%`).orderBy('Migration_ID', 'desc').first();
  const seq = last ? parseInt(last.Migration_ID.slice(prefix.length), 10) + 1 : 1;
  return `${prefix}${String(seq).padStart(4, '0')}`;
}

async function getMigrationOrNull(id) {
  return db('migrations').where('Migration_ID', id).first();
}

module.exports = { VALID_STATUSES, assertMigrationStatus, nextMigrationId, getMigrationOrNull, requireMigrationReauth, MIGRATION_REAUTH_TTL };
