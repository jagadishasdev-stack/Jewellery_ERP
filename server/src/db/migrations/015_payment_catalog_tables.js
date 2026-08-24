/**
 * Migration 015 — Payment Gateway + Product Catalog tables
 * Migrated from savings_app MySQL → ERP PostgreSQL
 * Tables:
 *   tbl_pg_transactions     — payment gateway transaction records (Razorpay / PhonePe)
 *   tbl_pg_order_track      — order initiation tracking
 *   tbl_payment_gateway_config — per-tenant gateway credentials
 *   tbl_product_images      — multiple images per ornament (Image App)
 *   tbl_catalog_orders      — orders created from product catalog
 *   tbl_catalog_order_items — line items for catalog orders
 */
exports.up = async (knex) => {

  // ── 1. tbl_pg_transactions ─────────────────────────────────────────────────
  if (!(await knex.schema.hasTable('tbl_pg_transactions'))) {
    await knex.schema.createTable('tbl_pg_transactions', t => {
      t.increments('Txn_ID').primary();
      t.string('Tenant_ID', 50).notNullable();
      t.string('Gateway', 30).notNullable();       // razorpay | phonepe | axis | federal
      t.string('Order_ID', 100);
      t.string('Payment_ID', 100);
      t.string('Signature', 300);
      t.decimal('Amount', 15, 2).notNullable();
      t.string('Currency', 10).defaultTo('INR');
      t.string('Status', 30).defaultTo('pending'); // pending | success | failed | refunded
      t.integer('Member_ID').nullable();
      t.integer('Scheme_ID').nullable();
      t.string('Purpose', 100).nullable();
      t.text('Raw_Response').nullable();
      t.string('Created_By', 100);
      t.timestamp('Created_Date').defaultTo(knex.fn.now());
    });
    await knex.schema.raw(`CREATE INDEX IF NOT EXISTS idx_pg_txn_tenant ON tbl_pg_transactions("Tenant_ID", "Gateway")`);
    await knex.schema.raw(`CREATE INDEX IF NOT EXISTS idx_pg_txn_member ON tbl_pg_transactions("Member_ID")`);
  }

  // ── 2. tbl_pg_order_track ──────────────────────────────────────────────────
  if (!(await knex.schema.hasTable('tbl_pg_order_track'))) {
    await knex.schema.createTable('tbl_pg_order_track', t => {
      t.increments('Track_ID').primary();
      t.string('Tenant_ID', 50).notNullable();
      t.string('Gateway', 30).notNullable();
      t.string('Order_ID', 100).unique();
      t.decimal('Amount', 15, 2);
      t.string('Currency', 10).defaultTo('INR');
      t.string('Receipt', 100).nullable();
      t.integer('Member_ID').nullable();
      t.string('Purpose', 100).nullable();
      t.string('Status', 30).defaultTo('created');
      t.string('Created_By', 100);
      t.timestamp('Created_Date').defaultTo(knex.fn.now());
    });
  }

  // ── 3. tbl_payment_gateway_config ─────────────────────────────────────────
  if (!(await knex.schema.hasTable('tbl_payment_gateway_config'))) {
    await knex.schema.createTable('tbl_payment_gateway_config', t => {
      t.increments('Config_ID').primary();
      t.string('Tenant_ID', 50).notNullable();
      t.string('Gateway', 30).notNullable();        // razorpay | phonepe | payphi | axis
      t.string('Key_ID', 200).nullable();
      t.string('Key_Secret', 500).nullable();        // should be encrypted in production
      t.string('Merchant_ID', 200).nullable();
      t.string('Salt_Key', 500).nullable();
      t.string('Salt_Index', 10).nullable();
      t.string('Environment', 20).defaultTo('production'); // sandbox | production
      t.boolean('Is_Active').defaultTo(true);
      t.string('Created_By', 100);
      t.timestamp('Created_Date').defaultTo(knex.fn.now());
      t.unique(['Tenant_ID', 'Gateway']);
    });
  }

  // ── 4. tbl_product_images — multiple images per ornament ──────────────────
  if (!(await knex.schema.hasTable('tbl_product_images'))) {
    await knex.schema.createTable('tbl_product_images', t => {
      t.increments('Image_ID').primary();
      t.string('Tenant_ID', 50).notNullable();
      t.string('Article_Number', 50).notNullable();
      t.text('Image_URL').notNullable();
      t.text('Thumbnail_URL').nullable();
      t.integer('Sort_Order').defaultTo(0);
      t.boolean('Is_Primary').defaultTo(false);
      t.string('Uploaded_By', 100);
      t.timestamp('Created_Date').defaultTo(knex.fn.now());
    });
    await knex.schema.raw(`CREATE INDEX IF NOT EXISTS idx_prod_img ON tbl_product_images("Tenant_ID", "Article_Number")`);
  }

  // ── 5. tbl_catalog_orders ─────────────────────────────────────────────────
  if (!(await knex.schema.hasTable('tbl_catalog_orders'))) {
    await knex.schema.createTable('tbl_catalog_orders', t => {
      t.increments('Order_ID').primary();
      t.string('Tenant_ID', 50).notNullable();
      t.string('Order_Number', 50).unique();
      t.string('Customer_Name', 100).nullable();
      t.string('Customer_Mobile', 20).nullable();
      t.text('Notes').nullable();
      t.string('Status', 30).defaultTo('Pending');  // Pending | Confirmed | Delivered | Cancelled
      t.string('Created_By', 100);
      t.timestamp('Created_Date').defaultTo(knex.fn.now());
      t.timestamp('Updated_Date').nullable();
    });
  }

  // ── 6. tbl_catalog_order_items ────────────────────────────────────────────
  if (!(await knex.schema.hasTable('tbl_catalog_order_items'))) {
    await knex.schema.createTable('tbl_catalog_order_items', t => {
      t.increments('Item_ID').primary();
      t.integer('Order_ID').references('Order_ID').inTable('tbl_catalog_orders').onDelete('CASCADE');
      t.string('Article_Number', 50).notNullable();
      t.integer('Quantity').defaultTo(1);
      t.text('Notes').nullable();
    });
  }
};

exports.down = async (knex) => {
  for (const tbl of ['tbl_catalog_order_items','tbl_catalog_orders','tbl_product_images',
                      'tbl_payment_gateway_config','tbl_pg_order_track','tbl_pg_transactions']) {
    await knex.schema.dropTableIfExists(tbl);
  }
};
