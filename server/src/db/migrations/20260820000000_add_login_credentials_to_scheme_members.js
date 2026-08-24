/**
 * Scheme members need their own app login (Store ID + phone number +
 * password) separate from staff (tbl_user_master) and from the generic
 * mobile-OTP table (tbl_mobile_otp, which isn't linked to any customer/
 * member record by FK). tbl_scheme_members already had App_Login_Enabled/
 * App_Device_ID/App_Last_Login/App_FCM_Token but no actual credential —
 * this adds the password itself, admin-set (never self-signup), matching
 * how the legacy savings-app system worked: a store admin creates the
 * member's password, the member logs in with mobile + that password.
 */
exports.up = async function (knex) {
  await knex.schema.alterTable('tbl_scheme_members', (t) => {
    t.string('Password_Hash', 255);
    t.string('Password_Salt', 50);
  });
};

exports.down = async function (knex) {
  await knex.schema.alterTable('tbl_scheme_members', (t) => {
    t.dropColumn('Password_Hash');
    t.dropColumn('Password_Salt');
  });
};
