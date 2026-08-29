/**
 * Packet Stock — grouping multiple ornaments into one physical packet
 * (e.g. a sealed pouch of similar small items) that can be created,
 * added to, transferred, issued/received, and closed as one unit.
 * Genuinely absent before (zero matches anywhere in the codebase) —
 * purely additive, doesn't touch any existing stock/transfer table.
 */
exports.up = async function up(knex) {
  await knex.schema.createTable('tbl_packet_stock', (t) => {
    t.increments('Packet_ID').primary();
    t.string('Tenant_ID', 20).notNullable().references('Tenant_ID').inTable('tbl_tenant_master').onDelete('CASCADE');
    t.string('Branch_ID', 20).references('Branch_ID').inTable('tbl_branch_master').onDelete('SET NULL');
    t.string('Packet_Number', 30).unique().notNullable();
    t.string('Metal_Type', 20);
    t.integer('Floor_ID').references('Floor_ID').inTable('tbl_floor_master').onDelete('SET NULL');
    t.integer('Counter_ID').references('Counter_ID').inTable('tbl_counter_master').onDelete('SET NULL');
    // Open: still being filled/edited. Closed: sealed, contents fixed.
    // Transferred: physically moved to another branch/location (paired
    // with a real tbl_stock_transfer row via Transfer_Reference_ID).
    t.string('Status', 20).defaultTo('Open');
    t.integer('Transfer_Reference_ID');
    t.text('Notes');
    t.string('Created_By', 50);
    t.timestamp('Created_Date').defaultTo(knex.fn.now());
    t.timestamp('Closed_Date');
    t.index(['Tenant_ID', 'Status'], 'idx_packet_stock_status');
  });

  await knex.schema.createTable('tbl_packet_stock_items', (t) => {
    t.increments('Packet_Item_ID').primary();
    t.integer('Packet_ID').notNullable().references('Packet_ID').inTable('tbl_packet_stock').onDelete('CASCADE');
    t.bigInteger('Ornament_ID').notNullable().references('Ornament_ID').inTable('tbl_ornament_master').onDelete('CASCADE');
    t.timestamp('Added_Date').defaultTo(knex.fn.now());
    t.timestamp('Removed_Date');
  });

  // An ornament can only be an ACTIVE (not-yet-removed) member of one
  // packet at a time. A plain multi-column unique() on
  // (Packet_ID, Ornament_ID, Removed_Date) would NOT actually enforce
  // this — Postgres treats every NULL Removed_Date as distinct from every
  // other NULL for uniqueness purposes, so duplicate active memberships
  // would silently pass. A partial unique index (WHERE Removed_Date IS
  // NULL) is what's actually needed here.
  await knex.raw(`
    CREATE UNIQUE INDEX uq_packet_item_active
    ON tbl_packet_stock_items ("Packet_ID", "Ornament_ID")
    WHERE "Removed_Date" IS NULL
  `);
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('tbl_packet_stock_items');
  await knex.schema.dropTableIfExists('tbl_packet_stock');
};
