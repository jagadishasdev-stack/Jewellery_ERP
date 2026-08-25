/**
 * Razorpay webhooks are signed with a SEPARATE secret from the API
 * key_secret — configured in the Razorpay dashboard's own Webhooks
 * section, independent of the account's API keys. Needed so
 * server/src/routes/webhooks.js can verify X-Razorpay-Signature before
 * trusting a webhook payload at all.
 */
exports.up = function (knex) {
  return knex.schema.alterTable('tbl_payment_gateway_config', (t) => {
    t.string('Webhook_Secret', 500).nullable();
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable('tbl_payment_gateway_config', (t) => {
    t.dropColumn('Webhook_Secret');
  });
};
