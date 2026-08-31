/**
 * Data Migration Center — shared state-machine helpers, used by
 * migrationRoutes.js and (in later batches) the entity migrators /
 * processor. Split out from migrationRoutes.js so those files can import
 * this without pulling in the Express router itself.
 */
const dayjs = require('dayjs');
const db = require('../../db/knex'); // control-plane connection — same as tbl_tenant_master/superAdmin.js

const VALID_STATUSES = ['DRAFT', 'UPLOADED', 'ANALYZING', 'MAPPING', 'VALIDATING', 'READY', 'APPROVED', 'RUNNING', 'COMPLETED', 'FAILED'];

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

module.exports = { VALID_STATUSES, assertMigrationStatus, nextMigrationId, getMigrationOrNull };
