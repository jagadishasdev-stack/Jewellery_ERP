/**
 * Migration 020 — Add Agent_Code + Installment_Number to tbl_scheme_transactions
 */
const knex = require('./src/db/knex');
async function run() {
  const hasAgent = await knex.schema.hasColumn('tbl_scheme_transactions', 'Agent_Code');
  if (!hasAgent) {
    await knex.schema.alterTable('tbl_scheme_transactions', t => {
      t.string('Agent_Code', 30).nullable();
    });
    console.log('Added Agent_Code to tbl_scheme_transactions');
  } else {
    console.log('Agent_Code already exists');
  }

  const hasInstNo = await knex.schema.hasColumn('tbl_scheme_transactions', 'Installment_Number');
  if (!hasInstNo) {
    await knex.schema.alterTable('tbl_scheme_transactions', t => {
      t.integer('Installment_Number').nullable();
    });
    console.log('Added Installment_Number to tbl_scheme_transactions');
  } else {
    console.log('Installment_Number already exists');
  }

  // Index for agent report queries
  await knex.schema.raw(
    'CREATE INDEX IF NOT EXISTS idx_txn_agent_code ON tbl_scheme_transactions("Agent_Code")'
  );
  console.log('Index created');

  console.log('Migration 020 done');
  process.exit(0);
}
run().catch(e => { console.error('Error:', e.message); process.exit(1); });
