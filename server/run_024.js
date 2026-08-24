/**
 * Migration 024 — SMS gateway integration
 * Runs 016_sms_gateway_config.js's up() directly against the live DB and
 * seeds the global default Asterix gateway config + OTP template.
 *
 * NOTE: run directly (not via `knex migrate:latest`) because migrations
 * 011-015 are marked pending in knex_migrations but their tables already
 * exist in this DB (applied via run_019.js-run_023.js) — the migrate CLI
 * chain is broken until that's reconciled separately. This mirrors the
 * existing run_019.js-run_023.js convention for the same reason.
 */
const knex = require('./src/db/knex');
const migration = require('./src/db/migrations/016_sms_gateway_config.js');
const seed = require('./src/db/seeds/005_seed_sms_gateway_config.js');

async function run() {
  const hasTable = await knex.schema.hasTable('tbl_sms_gateway_config');
  if (!hasTable) {
    await migration.up(knex);
    console.log('✓ Created tbl_sms_gateway_config, tbl_sms_templates, tbl_sms_log');
  } else {
    console.log('tbl_sms_gateway_config already exists — skipping table creation');
  }

  await seed.seed(knex);
  console.log('✓ Seeded global default SMS gateway config + OTP template');

  process.exit(0);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
