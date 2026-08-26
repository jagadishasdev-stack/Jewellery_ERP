/**
 * Multi-Branch Management §19 — "invoice numbering should support
 * branch-specific sequences if required... the exact numbering format
 * should be configurable." Opt-in per tenant, off by default (existing
 * numbering is completely unaffected until a tenant turns this on) — same
 * non-breaking-toggle precedent as Short_Number_Format right next to it.
 */
exports.up = async function (knex) {
  await knex.schema.alterTable('tbl_tenant_master', (t) => {
    t.boolean('Include_Branch_In_Numbering').notNullable().defaultTo(false);
  });
};

exports.down = async function (knex) {
  await knex.schema.alterTable('tbl_tenant_master', (t) => {
    t.dropColumn('Include_Branch_In_Numbering');
  });
};
