/**
 * Migration 017:
 * - tbl_scheme_groups.Group_Image_URL — per-group promo/banner image, shown
 *   in the savings_app mobile UI (PlanCard.js's `media` field).
 */
exports.up = async function (knex) {
  await knex.schema.alterTable('tbl_scheme_groups', (t) => {
    t.string('Group_Image_URL', 500).nullable();
  });
};

exports.down = async function (knex) {
  await knex.schema.alterTable('tbl_scheme_groups', (t) => {
    t.dropColumn('Group_Image_URL');
  });
};
