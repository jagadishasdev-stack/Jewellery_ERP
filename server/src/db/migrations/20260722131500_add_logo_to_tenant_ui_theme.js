/**
 * Adds tenant-custom logo support to tbl_tenant_ui_theme: an uploaded logo
 * URL (falls back to the app default /logo.png when null) and a display
 * size scale (percentage, 50-200) applied everywhere the logo renders.
 */
exports.up = async function (knex) {
  await knex.schema.alterTable('tbl_tenant_ui_theme', (t) => {
    t.string('Logo_URL', 255).nullable();
    t.integer('Logo_Size').defaultTo(100); // percentage scale, 50-200
  });
};

exports.down = async function (knex) {
  await knex.schema.alterTable('tbl_tenant_ui_theme', (t) => {
    t.dropColumn('Logo_URL');
    t.dropColumn('Logo_Size');
  });
};
