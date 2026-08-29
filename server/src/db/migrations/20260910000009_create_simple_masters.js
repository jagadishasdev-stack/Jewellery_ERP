/**
 * Five small reference masters, all genuinely absent before (Master menu
 * audit, Transaction Menu spec): Repair Category, Size/Length, Item
 * Weight Range, Cost Centre, Purchase Rate Type. Same simple shape
 * (code/name/description/active) — one migration, one shared route file
 * (simpleMasters.js) rather than five near-identical ones.
 */
exports.up = async function up(knex) {
  await knex.schema.createTable('tbl_repair_category_master', (t) => {
    t.increments('Category_ID').primary();
    t.string('Tenant_ID', 20).notNullable().references('Tenant_ID').inTable('tbl_tenant_master').onDelete('CASCADE');
    t.string('Category_Name', 100).notNullable();
    t.text('Description');
    t.decimal('Default_Charge', 10, 2);
    t.boolean('Is_Active').defaultTo(true);
    t.timestamp('Created_Date').defaultTo(knex.fn.now());
    t.unique(['Tenant_ID', 'Category_Name']);
  });

  await knex.schema.createTable('tbl_size_master', (t) => {
    t.increments('Size_ID').primary();
    t.string('Tenant_ID', 20).notNullable().references('Tenant_ID').inTable('tbl_tenant_master').onDelete('CASCADE');
    // Ring / Chain / Bangle / Bracelet — the item categories that
    // genuinely need a standardized size lookup.
    t.string('Size_Type', 30).notNullable();
    t.string('Size_Code', 20).notNullable();
    t.decimal('Size_Value_MM', 8, 2);
    t.string('Description', 200);
    t.boolean('Is_Active').defaultTo(true);
    t.timestamp('Created_Date').defaultTo(knex.fn.now());
    t.unique(['Tenant_ID', 'Size_Type', 'Size_Code']);
  });

  await knex.schema.createTable('tbl_item_weight_range_master', (t) => {
    t.increments('Range_ID').primary();
    t.string('Tenant_ID', 20).notNullable().references('Tenant_ID').inTable('tbl_tenant_master').onDelete('CASCADE');
    t.string('Range_Name', 100).notNullable();
    t.decimal('Weight_From', 10, 3).notNullable();
    t.decimal('Weight_To', 10, 3);
    t.boolean('Is_Active').defaultTo(true);
    t.timestamp('Created_Date').defaultTo(knex.fn.now());
    t.unique(['Tenant_ID', 'Range_Name']);
  });

  await knex.schema.createTable('tbl_cost_centre_master', (t) => {
    t.increments('Centre_ID').primary();
    t.string('Tenant_ID', 20).notNullable().references('Tenant_ID').inTable('tbl_tenant_master').onDelete('CASCADE');
    t.string('Centre_Code', 20).notNullable();
    t.string('Centre_Name', 100).notNullable();
    t.text('Description');
    t.boolean('Is_Active').defaultTo(true);
    t.timestamp('Created_Date').defaultTo(knex.fn.now());
    t.unique(['Tenant_ID', 'Centre_Code']);
  });

  await knex.schema.createTable('tbl_purchase_rate_type_master', (t) => {
    t.increments('Type_ID').primary();
    t.string('Tenant_ID', 20).notNullable().references('Tenant_ID').inTable('tbl_tenant_master').onDelete('CASCADE');
    t.string('Type_Name', 100).notNullable();
    t.text('Description');
    t.boolean('Is_Active').defaultTo(true);
    t.timestamp('Created_Date').defaultTo(knex.fn.now());
    t.unique(['Tenant_ID', 'Type_Name']);
  });

  // Design-wise Re-Order Level — the existing Min_Stock_Level lives on
  // tbl_ornament_master (per physical stock item, hardcoded default 5),
  // not as a per-Design default. Deliberately NOT added as a column on
  // tbl_design_master itself — that table has no Tenant_ID at all (it's
  // a genuinely global, shared-across-every-tenant master, confirmed
  // against its own migration) — a reorder level is a per-SHOP business
  // decision, and one tenant's setting would otherwise leak to every
  // other tenant sharing the same design row. This is the tenant-scoped
  // override table instead.
  await knex.schema.createTable('tbl_design_reorder_level', (t) => {
    t.increments('ID').primary();
    t.string('Tenant_ID', 20).notNullable().references('Tenant_ID').inTable('tbl_tenant_master').onDelete('CASCADE');
    t.integer('Design_ID').notNullable().references('Design_ID').inTable('tbl_design_master').onDelete('CASCADE');
    t.integer('Reorder_Level').notNullable().defaultTo(5);
    t.timestamp('Modified_Date').defaultTo(knex.fn.now());
    t.unique(['Tenant_ID', 'Design_ID']);
  });
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('tbl_design_reorder_level');
  await knex.schema.dropTableIfExists('tbl_purchase_rate_type_master');
  await knex.schema.dropTableIfExists('tbl_cost_centre_master');
  await knex.schema.dropTableIfExists('tbl_item_weight_range_master');
  await knex.schema.dropTableIfExists('tbl_size_master');
  await knex.schema.dropTableIfExists('tbl_repair_category_master');
};
