/**
 * HSN/GST master, e-Invoice log, and Loyalty earn-rule slabs.
 *
 * Grouped into one migration because each is a small, independent lookup/log
 * table rather than a multi-table module.
 *
 * tbl_hsn_master: tbl_item_type_master.HSN_Code is free text today (fine for
 * simple cases) — this master lets a single HSN code's GST rate be edited
 * once and referenced by many item types, and is what tbl_einvoice_log's
 * generation logic and GST reports should look up against going forward.
 *
 * tbl_loyalty_points_slab: tbl_loyalty_transactions (existing) only logs
 * point movements after the fact; nothing defined the earn rate. Ported
 * from legacy `loyaltypoints` (amount-range -> points-per-unit table).
 */
exports.up = async function (knex) {
  await knex.schema.createTable('tbl_hsn_master', (t) => {
    t.increments('HSN_ID').primary();
    t.string('HSN_Code', 20).unique().notNullable();
    t.string('Description', 200);
    t.decimal('GST_Percentage', 5, 2).notNullable().defaultTo(3.00);
    t.boolean('Is_Active').defaultTo(true);
    t.timestamp('Created_Date').defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('tbl_einvoice_log', (t) => {
    t.bigIncrements('Log_ID').primary();
    t.string('Tenant_ID', 20).notNullable().references('Tenant_ID').inTable('tbl_tenant_master').onDelete('CASCADE');
    t.bigInteger('Sale_ID').notNullable().references('Sale_ID').inTable('tbl_sales_header').onDelete('CASCADE');
    t.string('IRN', 100);
    t.string('Ack_Number', 50);
    t.timestamp('Ack_Date');
    t.text('QR_Code_Data');
    t.string('Signed_Invoice_URL', 500);
    t.string('Status', 20).notNullable().defaultTo('Pending'); // Pending | Generated | Cancelled | Failed
    t.text('Error_Message');
    t.timestamp('Cancelled_Date');
    t.string('Cancellation_Reason', 200);
    t.timestamp('Created_Date').defaultTo(knex.fn.now());
    t.index(['Sale_ID'], 'idx_einvoice_log_sale');
    t.index(['Tenant_ID', 'Status'], 'idx_einvoice_log_status');
  });

  await knex.schema.createTable('tbl_loyalty_points_slab', (t) => {
    t.increments('Slab_ID').primary();
    t.string('Tenant_ID', 20).notNullable().references('Tenant_ID').inTable('tbl_tenant_master').onDelete('CASCADE');
    t.decimal('Amount_From', 15, 2).notNullable();
    t.decimal('Amount_To', 15, 2);
    t.string('Metal_Type', 20); // null = applies to all metal types
    t.decimal('Points_Per_Unit', 10, 4).notNullable(); // points earned per ₹1 (or per configured unit) spent
    t.boolean('Is_Active').defaultTo(true);
    t.timestamp('Created_Date').defaultTo(knex.fn.now());
  });

  const existingModule = await knex('tbl_erp_modules').where('Module_Key', 'hsn_einvoice_loyalty').first();
  if (!existingModule) {
    await knex('tbl_erp_modules').insert({
      Module_Key: 'hsn_einvoice_loyalty',
      Module_Name: 'HSN, e-Invoice & Loyalty Rules',
      Module_Group: 'Compliance',
      Sort_Order: 35,
      Is_Core: false,
      Default_Retailer: true,
      Default_Wholesaler: true,
      Default_Manufacturer: true,
      Default_Hybrid: true,
    });
  }
};

exports.down = async function (knex) {
  await knex('tbl_erp_modules').where('Module_Key', 'hsn_einvoice_loyalty').del();
  await knex.schema.dropTableIfExists('tbl_loyalty_points_slab');
  await knex.schema.dropTableIfExists('tbl_einvoice_log');
  await knex.schema.dropTableIfExists('tbl_hsn_master');
};
