/**
 * Migration 025 — Scheme group image column
 * Runs 017_scheme_group_image.js's up() directly against the live DB.
 * See run_024.js's note re: the broken 011-015 migrate:latest chain.
 */
const knex = require('./src/db/knex');
const migration = require('./src/db/migrations/017_scheme_group_image.js');

async function run() {
  const hasCol = await knex.schema.hasColumn('tbl_scheme_groups', 'Group_Image_URL');
  if (!hasCol) {
    await migration.up(knex);
    console.log('✓ Added Group_Image_URL to tbl_scheme_groups');
  } else {
    console.log('Group_Image_URL already exists — skipping');
  }
  process.exit(0);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
