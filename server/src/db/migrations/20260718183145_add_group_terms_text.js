/**
 * tbl_scheme_groups.Group_Terms_Text — per-group terms & conditions shown
 * to members during enrollment (SavingsContactDetails.js in savings_app).
 */
exports.up = async function (knex) {
  await knex.schema.alterTable('tbl_scheme_groups', (t) => {
    t.text('Group_Terms_Text').nullable();
  });
};

exports.down = async function (knex) {
  await knex.schema.alterTable('tbl_scheme_groups', (t) => {
    t.dropColumn('Group_Terms_Text');
  });
};
