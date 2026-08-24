/**
 * Every auto-generated document number in the system (Invoice, Purchase,
 * Article/Barcode, Transfer, Job Card, Loan, Booking, Bin Voucher, ...)
 * hardcoded the same fixed shape:
 *   PREFIX-TENANTCODE-YYYYMMDD-SEQ     e.g. INV-VJBLR-20260819-0001
 * Some tenants want something shorter to hand a customer or karigar.
 * This flag lets a tenant (Super Admin -> Tenant -> Edit -> Short Number
 * Format) opt into a shorter shape instead:
 *   PREFIX-SEQ                          e.g. INV-0001 (keeps climbing,
 *                                        never resets daily — there's no
 *                                        date segment left to reset on)
 *
 * Defaults to false for every existing tenant, so nothing changes for
 * anyone unless they explicitly opt in. See server/src/utils/numberFormat.js
 * for the shared generator every document-number helper now routes
 * through, and client TenantManagePage.jsx's Edit Tenant modal for the
 * toggle itself.
 */
exports.up = async function (knex) {
  await knex.schema.alterTable('tbl_tenant_master', (t) => {
    t.boolean('Short_Number_Format').notNullable().defaultTo(false);
  });
};

exports.down = async function (knex) {
  await knex.schema.alterTable('tbl_tenant_master', (t) => {
    t.dropColumn('Short_Number_Format');
  });
};
