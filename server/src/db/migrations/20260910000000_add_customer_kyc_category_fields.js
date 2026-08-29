/**
 * tbl_customer_master already had GST_No/PAN_No columns that the customer
 * form never exposed (dead columns) — this adds the two that were missing
 * outright: an Aadhar number for KYC record-keeping on cash sales, and a
 * Customer_Category tier (independent of the existing Is_Wholesale flag,
 * which only distinguishes retail vs wholesale pricing, not a loyalty tier).
 */
exports.up = async function up(knex) {
  await knex.schema.alterTable('tbl_customer_master', (t) => {
    t.string('Aadhar_Number', 20);
    t.string('Customer_Category', 20).defaultTo('Regular');
  });
};

exports.down = async function down(knex) {
  await knex.schema.alterTable('tbl_customer_master', (t) => {
    t.dropColumn('Aadhar_Number');
    t.dropColumn('Customer_Category');
  });
};
