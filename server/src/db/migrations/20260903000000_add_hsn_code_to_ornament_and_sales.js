/**
 * HSN codes were only ever available via a live join at report time
 * (tbl_sales_details.Item_Type_Name -> tbl_item_type_master.Type_Name,
 * or the Ornament_ID -> Type_ID -> HSN_Code FK chain) — never actually
 * captured on the ornament or the sold line item itself, unlike every
 * other tax-relevant attribute (Purity_Code, GST_Percentage_Applied),
 * which IS snapshotted. That meant a later change to an item type's HSN
 * code would silently rewrite the tax history of every past sale that
 * ever used it, and there was no HSN at all when the type<->name match
 * failed. This captures it as a real snapshot, at both the point stock
 * is created (from its item type) and the point it's sold (from the
 * ornament itself, immune to a later type-level HSN edit).
 */
exports.up = async function (knex) {
  await knex.schema.alterTable('tbl_ornament_master', (t) => {
    t.string('HSN_Code', 20).nullable();
  });
  await knex.schema.alterTable('tbl_sales_details', (t) => {
    t.string('HSN_Code', 20).nullable();
  });
  await knex.schema.alterTable('tbl_purchase_details', (t) => {
    t.string('HSN_Code', 20).nullable();
  });

  // Backfill existing rows via the same FK chain the GSTR-1 report
  // already uses, so historical data isn't left blank just because it
  // predates this column.
  await knex.raw(`
    UPDATE tbl_ornament_master o
    SET "HSN_Code" = t."HSN_Code"
    FROM tbl_item_type_master t
    WHERE o."Type_ID" = t."Type_ID" AND o."HSN_Code" IS NULL AND t."HSN_Code" IS NOT NULL
  `);
  await knex.raw(`
    UPDATE tbl_sales_details sd
    SET "HSN_Code" = o."HSN_Code"
    FROM tbl_ornament_master o
    WHERE sd."Ornament_ID" = o."Ornament_ID" AND sd."HSN_Code" IS NULL AND o."HSN_Code" IS NOT NULL
  `);
};

exports.down = async function (knex) {
  await knex.schema.alterTable('tbl_ornament_master', (t) => t.dropColumn('HSN_Code'));
  await knex.schema.alterTable('tbl_sales_details', (t) => t.dropColumn('HSN_Code'));
  await knex.schema.alterTable('tbl_purchase_details', (t) => t.dropColumn('HSN_Code'));
};
