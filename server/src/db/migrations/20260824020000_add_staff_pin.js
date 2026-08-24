/**
 * Staff PIN — lets the Image App identify WHICH staff member on a shared
 * device made a given edit, without requiring a full username/password
 * login every time someone picks up the tablet. Nullable: only staff who've
 * had a PIN set by an admin can use this; everyone else is unaffected.
 * Hashed the same way passwords are (bcrypt) — never stored/compared as
 * plain text, even though it's a short numeric code.
 */
exports.up = function (knex) {
  return knex.schema.alterTable('tbl_user_master', (t) => {
    t.string('PIN_Hash', 255).nullable();
    t.timestamp('PIN_Set_Date').nullable();
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable('tbl_user_master', (t) => {
    t.dropColumn('PIN_Hash');
    t.dropColumn('PIN_Set_Date');
  });
};
