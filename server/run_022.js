/**
 * Migration 022 — Master Bin Management Module
 * Creates:
 *   tbl_voucher_master      — central voucher registry
 *   tbl_bin_purchase        — purchase holding bin
 *   tbl_bin_sales_return    — sales return holding bin
 *   tbl_bin_orders          — order management bin
 *   tbl_bin_pure_gold       — pure gold asset bin
 * Alters:
 *   tbl_purchase_header     — adds Bin_Source + Voucher_ID flags
 *   tbl_ornament_master     — adds Bin_Voucher_ID + Bin_Source
 */
const knex = require('./src/db/knex');

async function run() {
  // ── 1. Voucher Master — central registry ────────────────────────────────────
  if (!(await knex.schema.hasTable('tbl_voucher_master'))) {
    await knex.schema.createTable('tbl_voucher_master', t => {
      t.increments('Voucher_PK').primary();
      t.string('Voucher_ID', 50).unique().notNullable();   // PUR-20260709-00001
      t.string('Tenant_ID', 50).notNullable();
      t.string('Voucher_Type', 20).notNullable();           // PURCHASE | SALES_RETURN | ORDER | PURE_GOLD
      t.integer('Reference_ID').nullable();                  // FK to bin table row
      t.string('Reference_Table', 60).nullable();            // tbl_bin_purchase etc.
      t.string('Status', 20).defaultTo('Active');
      t.text('Description').nullable();
      t.string('Created_By', 100);
      t.timestamp('Created_Date').defaultTo(knex.fn.now());
    });
    await knex.schema.raw(`CREATE INDEX idx_voucher_tid ON tbl_voucher_master("Tenant_ID")`);
    console.log('✓ Created tbl_voucher_master');
  }

  // ── 2. Purchase Bin ──────────────────────────────────────────────────────────
  if (!(await knex.schema.hasTable('tbl_bin_purchase'))) {
    await knex.schema.createTable('tbl_bin_purchase', t => {
      t.increments('Bin_ID').primary();
      t.string('Voucher_ID', 50).unique().notNullable();
      t.string('Tenant_ID', 50).notNullable();
      t.string('Branch_ID', 50).nullable();
      t.date('Purchase_Date').notNullable();
      t.string('Source_Type', 20).defaultTo('Supplier');    // Supplier | Karigar | Manufacturer | Vendor
      t.integer('Supplier_ID').nullable();
      t.string('Supplier_Name', 100).notNullable();
      t.string('Supplier_Mobile', 20).nullable();
      t.string('Item_Category', 100).nullable();
      t.string('Design_Name', 100).nullable();
      t.string('Purity', 20).nullable();                    // 22K | 18K | 24K etc.
      t.decimal('Gross_Weight', 10, 3).defaultTo(0);
      t.decimal('Net_Weight', 10, 3).defaultTo(0);
      t.decimal('Stone_Weight', 10, 3).defaultTo(0);
      t.text('Stone_Details').nullable();
      t.decimal('Purchase_Rate', 12, 2).defaultTo(0);       // ₹/gram
      t.decimal('Purchase_Amount', 14, 2).defaultTo(0);
      t.decimal('Making_Charge', 12, 2).defaultTo(0);
      t.string('Invoice_Number', 50).nullable();             // supplier's invoice
      t.text('Remarks').nullable();
      t.string('Status', 20).defaultTo('Pending');           // Pending | Inspected | Approved | Moved_To_Stock | Rejected
      t.string('Inspected_By', 100).nullable();
      t.timestamp('Inspected_At').nullable();
      t.string('Approved_By', 100).nullable();
      t.timestamp('Approved_At').nullable();
      t.integer('Ornament_ID').nullable();                   // set after move to stock
      t.string('Article_Number', 50).nullable();             // barcode after move to stock
      t.smallint('Data_Mode').defaultTo(3);
      t.string('Created_By', 100);
      t.timestamp('Created_Date').defaultTo(knex.fn.now());
      t.timestamp('Modified_Date').nullable();
    });
    await knex.schema.raw(`CREATE INDEX idx_binpur_tid ON tbl_bin_purchase("Tenant_ID")`);
    await knex.schema.raw(`CREATE INDEX idx_binpur_status ON tbl_bin_purchase("Status")`);
    console.log('✓ Created tbl_bin_purchase');
  }

  // ── 3. Sales Return Bin ──────────────────────────────────────────────────────
  if (!(await knex.schema.hasTable('tbl_bin_sales_return'))) {
    await knex.schema.createTable('tbl_bin_sales_return', t => {
      t.increments('Return_ID').primary();
      t.string('Voucher_ID', 50).unique().notNullable();
      t.string('Tenant_ID', 50).notNullable();
      t.string('Branch_ID', 50).nullable();
      t.date('Return_Date').notNullable();
      t.string('Original_Invoice_Number', 50).nullable();
      t.integer('Original_Sale_ID').nullable();
      t.string('Customer_Name', 100).notNullable();
      t.string('Customer_Mobile', 20).nullable();
      t.integer('Customer_ID').nullable();
      t.string('Item_Description', 200).nullable();
      t.string('Item_Category', 100).nullable();
      t.string('Purity', 20).nullable();
      t.decimal('Gross_Weight', 10, 3).defaultTo(0);
      t.decimal('Net_Weight', 10, 3).defaultTo(0);
      t.string('Return_Reason', 50).defaultTo('Design');    // Design | Size | Exchange | Upgrade | Defect | Other
      t.text('Return_Notes').nullable();
      t.string('Inspection_Status', 20).defaultTo('Pending'); // Pending | Passed | Failed
      t.string('Inspected_By', 100).nullable();
      t.timestamp('Inspected_At').nullable();
      t.string('Refund_Mode', 30).nullable();                // Cash | Exchange | Credit
      t.decimal('Refund_Amount', 14, 2).defaultTo(0);
      t.string('Status', 20).defaultTo('Received');          // Received | Inspected | Barcode_Generated | Moved_To_Stock | Refunded | Exchanged
      t.integer('New_Ornament_ID').nullable();               // after re-stock
      t.string('New_Article_Number', 50).nullable();
      t.smallint('Data_Mode').defaultTo(3);
      t.string('Created_By', 100);
      t.timestamp('Created_Date').defaultTo(knex.fn.now());
      t.timestamp('Modified_Date').nullable();
    });
    await knex.schema.raw(`CREATE INDEX idx_binsrb_tid ON tbl_bin_sales_return("Tenant_ID")`);
    console.log('✓ Created tbl_bin_sales_return');
  }

  // ── 4. Order Bin ─────────────────────────────────────────────────────────────
  if (!(await knex.schema.hasTable('tbl_bin_orders'))) {
    await knex.schema.createTable('tbl_bin_orders', t => {
      t.increments('Order_ID').primary();
      t.string('Voucher_ID', 50).unique().notNullable();
      t.string('Tenant_ID', 50).notNullable();
      t.string('Branch_ID', 50).nullable();
      t.date('Order_Date').notNullable();
      t.string('Order_Type', 20).defaultTo('Customer');      // Customer | Karigar | Supplier
      t.string('Party_Name', 100).notNullable();
      t.string('Party_Mobile', 20).nullable();
      t.integer('Party_ID').nullable();
      t.text('Item_Description').nullable();
      t.string('Design_Details', 200).nullable();
      t.string('Purity', 20).nullable();
      t.decimal('Estimated_Weight', 10, 3).nullable();
      t.decimal('Actual_Weight', 10, 3).nullable();
      t.date('Due_Date').nullable();
      t.decimal('Estimated_Amount', 14, 2).defaultTo(0);
      t.decimal('Advance_Amount', 14, 2).defaultTo(0);
      t.string('Payment_Mode', 30).nullable();
      t.integer('Assigned_Karigar_ID').nullable();
      t.string('Status', 20).defaultTo('Pending');           // Pending | In_Progress | Manufacturing | Ready | Delivered | Cancelled
      t.text('Remarks').nullable();
      t.integer('Ornament_ID').nullable();                   // linked ornament after completion
      t.smallint('Data_Mode').defaultTo(3);
      t.string('Created_By', 100);
      t.timestamp('Created_Date').defaultTo(knex.fn.now());
      t.timestamp('Modified_Date').nullable();
    });
    await knex.schema.raw(`CREATE INDEX idx_binord_tid ON tbl_bin_orders("Tenant_ID")`);
    await knex.schema.raw(`CREATE INDEX idx_binord_status ON tbl_bin_orders("Status")`);
    console.log('✓ Created tbl_bin_orders');
  }

  // ── 5. Pure Gold Bin ─────────────────────────────────────────────────────────
  if (!(await knex.schema.hasTable('tbl_bin_pure_gold'))) {
    await knex.schema.createTable('tbl_bin_pure_gold', t => {
      t.increments('Gold_ID').primary();
      t.string('Voucher_ID', 50).unique().notNullable();
      t.string('Tenant_ID', 50).notNullable();
      t.string('Branch_ID', 50).nullable();
      t.date('Purchase_Date').notNullable();
      t.integer('Supplier_ID').nullable();
      t.string('Supplier_Name', 100).notNullable();
      t.string('Gold_Type', 30).defaultTo('Bar');            // Bar | Coin | Biscuit | Other
      t.string('Piece_Number', 50).nullable();               // serial number on bar/coin
      t.string('Purity', 10).defaultTo('24K');
      t.decimal('Gross_Weight', 10, 3).notNullable();
      t.decimal('Net_Weight', 10, 3).notNullable();
      t.decimal('Purchase_Rate', 12, 2).defaultTo(0);        // ₹/gram
      t.decimal('Purchase_Amount', 14, 2).defaultTo(0);
      t.string('Storage_Location', 100).nullable();
      t.text('Remarks').nullable();
      t.string('Status', 20).defaultTo('Holding');           // Holding | For_Manufacturing | Sold | Transferred | Audited
      t.string('Disposed_By', 30).nullable();                // Manufacturing | Direct_Sale | Transfer
      t.timestamp('Disposed_At').nullable();
      t.smallint('Data_Mode').defaultTo(3);
      t.string('Created_By', 100);
      t.timestamp('Created_Date').defaultTo(knex.fn.now());
      t.timestamp('Modified_Date').nullable();
    });
    await knex.schema.raw(`CREATE INDEX idx_binpg_tid ON tbl_bin_pure_gold("Tenant_ID")`);
    console.log('✓ Created tbl_bin_pure_gold');
  }

  // ── 6. Add Bin flags to tbl_purchase_header ──────────────────────────────────
  for (const col of [
    { name: 'Bin_Source', type: 'string', args: ['Bin_Source', 20], def: null },  // BIN | DIRECT
    { name: 'Bin_Voucher_ID', type: 'string', args: ['Bin_Voucher_ID', 50], def: null },
  ]) {
    if (!(await knex.schema.hasColumn('tbl_purchase_header', col.name))) {
      await knex.schema.alterTable('tbl_purchase_header', t => t.string(col.args[0], col.args[1]).nullable());
      console.log('✓ Added tbl_purchase_header.' + col.name);
    }
  }

  // ── 7. Add Bin source tracking to tbl_ornament_master ───────────────────────
  for (const col of ['Bin_Source', 'Bin_Voucher_ID']) {
    if (!(await knex.schema.hasColumn('tbl_ornament_master', col))) {
      await knex.schema.alterTable('tbl_ornament_master', t => t.string(col, 50).nullable());
      console.log('✓ Added tbl_ornament_master.' + col);
    }
  }

  console.log('\nMigration 022 — Master Bin Management — DONE');
  process.exit(0);
}

run().catch(e => { console.error('Error:', e.message); process.exit(1); });
