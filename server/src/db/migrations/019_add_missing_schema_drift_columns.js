/**
 * Schema-drift fix, part 2: these columns exist on the live JewelleryERP
 * database but were never added by any migration (added manually/out-of-band
 * at some point, same root cause as 018_add_missing_schema_drift_tables.js).
 * Discovered the same way — running the full migration set against a brand
 * new empty database and comparing information_schema.columns against the
 * live database column-by-column.
 *
 * Notably this includes the Data_Mode column (Practice/Unofficial/Official)
 * on 10 transaction tables — a core, actively-used feature (see
 * utils/dataModeFilter.js) that had no migration at all backing it.
 *
 * Guarded with hasColumn() checks so this is safe to run against the live
 * database (already has these) as well as a fresh tenant database (doesn't).
 */
const DATA_MODE_TABLES = [
  'tbl_customer_master',
  'tbl_issue_to_karigar',
  'tbl_ornament_master',
  'tbl_purchase_header',
  'tbl_sales_header',
  'tbl_sales_payments',
  'tbl_scheme_groups',
  'tbl_scheme_members',
  'tbl_scheme_transactions',
  'tbl_stock_transfer',
];

exports.up = async function (knex) {
  for (const table of DATA_MODE_TABLES) {
    if (await knex.schema.hasColumn(table, 'Data_Mode')) continue;
    await knex.schema.alterTable(table, (t) => {
      t.smallint('Data_Mode').notNullable().defaultTo(3);
    });
    await knex.raw(`CREATE INDEX IF NOT EXISTS idx_${table.replace('tbl_', '')}_data_mode ON "${table}" ("Data_Mode")`);
  }

  if (!(await knex.schema.hasColumn('tbl_ornament_master', 'Bin_Source'))) {
    await knex.schema.alterTable('tbl_ornament_master', (t) => {
      t.string('Bin_Source', 50).nullable();
      t.string('Bin_Voucher_ID', 50).nullable();
    });
  }

  if (!(await knex.schema.hasColumn('tbl_purchase_header', 'Bin_Source'))) {
    await knex.schema.alterTable('tbl_purchase_header', (t) => {
      t.string('Bin_Source', 20).nullable();
      t.string('Bin_Voucher_ID', 50).nullable();
    });
  }

  if (!(await knex.schema.hasColumn('tbl_product_images', 'Image_Type'))) {
    await knex.schema.alterTable('tbl_product_images', (t) => {
      t.string('Image_Type', 30).defaultTo('front');
    });
  }

  if (!(await knex.schema.hasColumn('tbl_product_images', 'Ornament_ID'))) {
    await knex.schema.alterTable('tbl_product_images', (t) => {
      t.integer('Ornament_ID').nullable()
        .references('Ornament_ID').inTable('tbl_ornament_master').onDelete('SET NULL');
    });
    await knex.raw(`CREATE INDEX IF NOT EXISTS idx_prod_img_ornament ON "tbl_product_images" ("Ornament_ID")`);
  }

  if (!(await knex.schema.hasColumn('tbl_sales_header', 'Voucher_ID'))) {
    await knex.schema.alterTable('tbl_sales_header', (t) => {
      t.string('Voucher_ID', 50).nullable();
    });
    await knex.raw(`CREATE INDEX IF NOT EXISTS idx_sales_voucher_id ON "tbl_sales_header" ("Voucher_ID")`);
  }

  if (!(await knex.schema.hasColumn('tbl_scheme_transactions', 'Agent_Code'))) {
    await knex.schema.alterTable('tbl_scheme_transactions', (t) => {
      t.string('Agent_Code', 30).nullable();
      t.integer('Installment_Number').nullable();
    });
    await knex.raw(`CREATE INDEX IF NOT EXISTS idx_txn_agent_code ON "tbl_scheme_transactions" ("Agent_Code")`);
  }
};

exports.down = async function (knex) {
  for (const table of DATA_MODE_TABLES) {
    if (await knex.schema.hasColumn(table, 'Data_Mode')) {
      await knex.schema.alterTable(table, (t) => t.dropColumn('Data_Mode'));
    }
  }
  await knex.schema.alterTable('tbl_ornament_master', (t) => {
    t.dropColumn('Bin_Source');
    t.dropColumn('Bin_Voucher_ID');
  });
  await knex.schema.alterTable('tbl_purchase_header', (t) => {
    t.dropColumn('Bin_Source');
    t.dropColumn('Bin_Voucher_ID');
  });
  await knex.schema.alterTable('tbl_product_images', (t) => {
    t.dropColumn('Image_Type');
    t.dropColumn('Ornament_ID');
  });
  await knex.schema.alterTable('tbl_sales_header', (t) => t.dropColumn('Voucher_ID'));
  await knex.schema.alterTable('tbl_scheme_transactions', (t) => {
    t.dropColumn('Agent_Code');
    t.dropColumn('Installment_Number');
  });
};
