/**
 * Migration 014 — Add Default_Password to tbl_user_master
 * Stores the initial/last-set plain-text password so ERP provider can
 * look it up and share with the user if they forget it.
 * Only visible to Super Admin via the SA panel.
 * Overwritten whenever password is reset.
 */
exports.up = async (knex) => {
  const cols = await knex('tbl_user_master').columnInfo().catch(() => ({}));
  if (cols.User_ID && !cols.Default_Password) {
    await knex.schema.alterTable('tbl_user_master', t => {
      t.string('Default_Password', 100).nullable()
        .comment('Last-set plain-text password — visible to SA only for support purposes');
    });
  }
};

exports.down = async (knex) => {
  await knex.schema.alterTable('tbl_user_master', t => {
    t.dropColumn('Default_Password');
  }).catch(() => {});
};
