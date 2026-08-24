/**
 * Reorder tracking, RFID scan log, and card surcharge master — three small,
 * independent lookup/log tables grouped into one migration.
 *
 * tbl_reorder_request: legacy `reorder` — a request raised when
 * tbl_ornament_master.Stock_Quantity drops under Min_Stock_Level for a
 * design/type, tracked through to the purchase that fulfils it.
 *
 * tbl_rfid_scan_log: legacy `rfid_collection` — tbl_ornament_master already
 * has an RFID_Tag column for the current tag; this is the scan *event*
 * history (stock audits, gate scans, sale-time verification), which the
 * single column can't hold.
 *
 * tbl_card_charges_master: legacy `card_charges`/`card_master`/
 * `dup_card_details` collapsed into one rate-card table — the old schema's
 * split was for tracking specific physical card numbers used for testing,
 * not a real distinct business concept.
 */
exports.up = async function (knex) {
  await knex.schema.createTable('tbl_reorder_request', (t) => {
    t.bigIncrements('Request_ID').primary();
    t.string('Tenant_ID', 20).notNullable().references('Tenant_ID').inTable('tbl_tenant_master').onDelete('CASCADE');
    t.string('Branch_ID', 20).references('Branch_ID').inTable('tbl_branch_master').onDelete('SET NULL');
    t.integer('Type_ID').references('Type_ID').inTable('tbl_item_type_master').onDelete('SET NULL');
    t.integer('Design_ID').references('Design_ID').inTable('tbl_design_master').onDelete('SET NULL');
    t.integer('Requested_Qty').notNullable().defaultTo(1);
    t.string('Reason', 200); // e.g. "Below min stock level"
    t.string('Status', 20).notNullable().defaultTo('Pending'); // Pending | Ordered | Received | Cancelled
    t.bigInteger('Fulfilled_Purchase_ID').references('Purchase_ID').inTable('tbl_purchase_header').onDelete('SET NULL');
    t.string('Requested_By', 50);
    t.timestamp('Created_Date').defaultTo(knex.fn.now());
    t.index(['Tenant_ID', 'Status'], 'idx_reorder_status');
  });

  await knex.schema.createTable('tbl_rfid_scan_log', (t) => {
    t.bigIncrements('Scan_ID').primary();
    t.string('Tenant_ID', 20).notNullable().references('Tenant_ID').inTable('tbl_tenant_master').onDelete('CASCADE');
    t.string('Branch_ID', 20).references('Branch_ID').inTable('tbl_branch_master').onDelete('SET NULL');
    t.bigInteger('Ornament_ID').references('Ornament_ID').inTable('tbl_ornament_master').onDelete('SET NULL');
    t.string('RFID_Tag', 100).notNullable();
    t.string('Scan_Type', 20).notNullable(); // Stock Check | Sale | Transfer | Audit | Gate
    t.string('Scan_Location', 100);
    t.string('Scanned_By', 50);
    t.timestamp('Scan_Date').defaultTo(knex.fn.now());
    t.index(['RFID_Tag'], 'idx_rfid_scan_tag');
    t.index(['Ornament_ID'], 'idx_rfid_scan_ornament');
  });

  await knex.schema.createTable('tbl_card_charges_master', (t) => {
    t.increments('Charge_ID').primary();
    t.string('Tenant_ID', 20).notNullable().references('Tenant_ID').inTable('tbl_tenant_master').onDelete('CASCADE');
    t.string('Card_Type', 20).notNullable(); // Credit | Debit | Wallet
    t.string('Card_Network', 20); // Visa | Mastercard | RuPay | Amex | ...
    t.decimal('Surcharge_Pct', 5, 2).defaultTo(0);
    t.decimal('Min_Surcharge_Amount', 10, 2).defaultTo(0);
    t.boolean('Is_Active').defaultTo(true);
    t.timestamp('Created_Date').defaultTo(knex.fn.now());
  });

  const existingModule = await knex('tbl_erp_modules').where('Module_Key', 'reorder_rfid_card_charges').first();
  if (!existingModule) {
    await knex('tbl_erp_modules').insert({
      Module_Key: 'reorder_rfid_card_charges',
      Module_Name: 'Reorder, RFID & Card Charges',
      Module_Group: 'Inventory',
      Sort_Order: 38,
      Is_Core: false,
      Default_Retailer: true,
      Default_Wholesaler: true,
      Default_Manufacturer: false,
      Default_Hybrid: true,
    });
  }
};

exports.down = async function (knex) {
  await knex('tbl_erp_modules').where('Module_Key', 'reorder_rfid_card_charges').del();
  await knex.schema.dropTableIfExists('tbl_card_charges_master');
  await knex.schema.dropTableIfExists('tbl_rfid_scan_log');
  await knex.schema.dropTableIfExists('tbl_reorder_request');
};
