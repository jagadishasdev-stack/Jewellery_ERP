/**
 * Stock (tbl_ornament_master) had no structural way to say "this item is
 * Gold / Silver / Platinum / Diamond" — metal type was only guessable by
 * pattern-matching Purity_Code strings (SIL-prefix / PLAT-prefix / else Gold), and there
 * was no way at all to represent loose diamond stock (diamonds have no
 * purity). This adds a real Metal_Type column so a tenant can filter,
 * group, and pull an isolated per-metal stock report — see
 * utils/metalTypes.js for the canonical list and reports.js's
 * inventory-value endpoint for the isolated report itself.
 *
 * tbl_purity_master gets the same column so the Purity dropdown can be
 * narrowed to the selected metal type in the Add/Edit Stock forms (a
 * Platinum item shouldn't offer 22K gold purities).
 *
 * Backfill heuristic for EXISTING rows (no prior field to derive this
 * from with certainty):
 *   - Purity_Code starting 'SIL' -> Silver, 'PLAT' -> Platinum, else Gold
 *     (mirrors the pre-existing Is_Gold defaultTo(true) convention on
 *     tbl_item_type_master).
 *   - Ornament rows follow their linked purity's Metal_Type; rows with no
 *     Purity_ID at all default to Gold.
 *   - There is no reliable signal in existing data for loose-diamond
 *     stock added before this column existed — any such rows land as
 *     Gold by this backfill and need a manual one-time correction via
 *     Edit Stock if they actually exist. Flagged here, not hidden.
 */
exports.up = async function (knex) {
  await knex.schema.alterTable('tbl_purity_master', (t) => {
    t.string('Metal_Type', 20);
  });
  await knex('tbl_purity_master').whereNull('Metal_Type').where('Purity_Code', 'ilike', 'SIL%').update({ Metal_Type: 'Silver' });
  await knex('tbl_purity_master').whereNull('Metal_Type').where('Purity_Code', 'ilike', 'PLAT%').update({ Metal_Type: 'Platinum' });
  await knex('tbl_purity_master').whereNull('Metal_Type').update({ Metal_Type: 'Gold' });
  await knex.schema.alterTable('tbl_purity_master', (t) => {
    t.string('Metal_Type', 20).notNullable().defaultTo('Gold').alter();
  });

  await knex.schema.alterTable('tbl_ornament_master', (t) => {
    t.string('Metal_Type', 20);
  });
  await knex.raw(`
    UPDATE tbl_ornament_master o SET "Metal_Type" = COALESCE(
      (SELECT p."Metal_Type" FROM tbl_purity_master p WHERE p."Purity_ID" = o."Purity_ID"),
      'Gold'
    ) WHERE o."Metal_Type" IS NULL
  `);
  await knex.schema.alterTable('tbl_ornament_master', (t) => {
    t.string('Metal_Type', 20).notNullable().defaultTo('Gold').alter();
    t.index(['Tenant_ID', 'Metal_Type'], 'idx_ornament_tenant_metal');
  });
};

exports.down = async function (knex) {
  await knex.schema.alterTable('tbl_ornament_master', (t) => {
    t.dropIndex(['Tenant_ID', 'Metal_Type'], 'idx_ornament_tenant_metal');
    t.dropColumn('Metal_Type');
  });
  await knex.schema.alterTable('tbl_purity_master', (t) => {
    t.dropColumn('Metal_Type');
  });
};
