/**
 * Manufacturing Efficiency / BOM / Melting-Refining Module.
 *
 * Legacy spread this across 17 tables (mfg_binset, mfg_category,
 * mfg_eff_conduct, mfg_eff_deptbom, mfg_eff_salary, mfg_eff_setting,
 * mfg_eff_settingbom(+_bac), mfg_eff_worktype, mfg_melting, mfg_refining,
 * mfg_rub_bom, mfg_rub_stock, billofmaterial(+_main), mcwastage, wk_mcwstg,
 * prod_dept, prod_transaction) — this is deeper in-house manufacturing
 * tracking than tbl_issue_to_karigar/tbl_return_from_karigar cover (those
 * are "hand raw gold to an outside karigar, get a finished piece back";
 * this module is standard-cost BOM-per-design, department routing, and
 * actual melting/refining/casting-mould process logs for a workshop that
 * manufactures in-house).
 *
 * Consolidated into 6 tables instead of porting all 17 1:1 — legacy split
 * "BOM definition" and "BOM per department stage" and "BOM version
 * history" into separate tables for reasons that don't apply to a
 * normalized schema (settingbom vs settingbom_bac was clearly a manual
 * backup-copy table, not a real distinct concept).
 */
exports.up = async function (knex) {
  await knex.schema.createTable('tbl_production_department_master', (t) => {
    t.increments('Dept_ID').primary();
    t.string('Tenant_ID', 20).notNullable().references('Tenant_ID').inTable('tbl_tenant_master').onDelete('CASCADE');
    t.string('Dept_Code', 20).notNullable();
    t.string('Dept_Name', 100).notNullable(); // Casting | Filing | Polishing | Setting | Rhodium | ...
    t.integer('Sequence_No').defaultTo(0); // default routing order through the workshop
    t.boolean('Is_Active').defaultTo(true);
    t.timestamp('Created_Date').defaultTo(knex.fn.now());
    t.unique(['Tenant_ID', 'Dept_Code']);
  });

  await knex.schema.createTable('tbl_bom_master', (t) => {
    t.increments('BOM_ID').primary();
    t.string('Tenant_ID', 20).notNullable().references('Tenant_ID').inTable('tbl_tenant_master').onDelete('CASCADE');
    t.integer('Design_ID').references('Design_ID').inTable('tbl_design_master').onDelete('SET NULL');
    t.integer('Type_ID').references('Type_ID').inTable('tbl_item_type_master').onDelete('SET NULL');
    t.string('BOM_Name', 100).notNullable();
    t.integer('Version').defaultTo(1);
    t.decimal('Standard_Gold_Weight', 10, 3);
    t.decimal('Standard_Stone_Weight', 10, 3);
    t.decimal('Standard_Wastage_Pct', 5, 2).defaultTo(3.00);
    t.decimal('Standard_Labour_Amount', 10, 2);
    t.boolean('Is_Active').defaultTo(true);
    t.string('Created_By', 50);
    t.timestamp('Created_Date').defaultTo(knex.fn.now());
    t.timestamp('Modified_Date').defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('tbl_bom_department_stages', (t) => {
    t.bigIncrements('Stage_ID').primary();
    t.integer('BOM_ID').notNullable().references('BOM_ID').inTable('tbl_bom_master').onDelete('CASCADE');
    t.integer('Dept_ID').notNullable().references('Dept_ID').inTable('tbl_production_department_master').onDelete('CASCADE');
    t.integer('Sequence_No').notNullable().defaultTo(1);
    t.decimal('Standard_Wastage_Pct', 5, 2).defaultTo(0);
    t.decimal('Standard_Labour_Rate', 10, 2);
    t.integer('Standard_Time_Minutes');
    t.index(['BOM_ID'], 'idx_bom_stages_bom');
  });

  await knex.schema.createTable('tbl_production_transaction', (t) => {
    t.bigIncrements('Txn_ID').primary();
    t.string('Tenant_ID', 20).notNullable().references('Tenant_ID').inTable('tbl_tenant_master').onDelete('CASCADE');
    t.string('Branch_ID', 20).references('Branch_ID').inTable('tbl_branch_master').onDelete('SET NULL');
    t.integer('BOM_ID').references('BOM_ID').inTable('tbl_bom_master').onDelete('SET NULL');
    t.integer('Dept_ID').references('Dept_ID').inTable('tbl_production_department_master').onDelete('SET NULL');
    t.integer('Karigar_ID').references('Vendor_ID').inTable('tbl_vendor_master').onDelete('SET NULL');
    t.bigInteger('Ornament_ID').references('Ornament_ID').inTable('tbl_ornament_master').onDelete('SET NULL');
    t.date('Txn_Date').notNullable();
    t.decimal('Input_Weight', 10, 3).notNullable();
    t.decimal('Output_Weight', 10, 3);
    t.decimal('Wastage_Weight', 10, 3).defaultTo(0);
    t.decimal('Wastage_Pct', 5, 2);
    t.decimal('Labour_Amount', 10, 2).defaultTo(0);
    t.string('Status', 20).defaultTo('In Progress'); // In Progress | Completed | Rejected
    t.text('Remarks');
    t.string('Created_By', 50);
    t.timestamp('Created_Date').defaultTo(knex.fn.now());
    t.index(['Tenant_ID', 'Dept_ID'], 'idx_prod_txn_dept');
    t.index(['Ornament_ID'], 'idx_prod_txn_ornament');
  });

  await knex.schema.createTable('tbl_melting_refining_log', (t) => {
    t.bigIncrements('Log_ID').primary();
    t.string('Tenant_ID', 20).notNullable().references('Tenant_ID').inTable('tbl_tenant_master').onDelete('CASCADE');
    t.string('Branch_ID', 20).references('Branch_ID').inTable('tbl_branch_master').onDelete('SET NULL');
    t.string('Process_Type', 20).notNullable(); // Melting | Refining
    t.string('Metal_Type', 20).notNullable();
    t.string('Purity_In_Code', 10);
    t.string('Purity_Out_Code', 10);
    t.decimal('Weight_In', 10, 3).notNullable();
    t.decimal('Weight_Out', 10, 3);
    t.decimal('Loss_Weight', 10, 3).defaultTo(0);
    t.decimal('Loss_Pct', 5, 2);
    t.integer('Refiner_Vendor_ID').references('Vendor_ID').inTable('tbl_vendor_master').onDelete('SET NULL');
    t.date('Log_Date').notNullable();
    t.text('Remarks');
    t.string('Created_By', 50);
    t.timestamp('Created_Date').defaultTo(knex.fn.now());
    t.index(['Tenant_ID', 'Process_Type'], 'idx_melting_refining_type');
  });

  await knex.schema.createTable('tbl_mould_bom_stock', (t) => {
    t.increments('Mould_ID').primary();
    t.string('Tenant_ID', 20).notNullable().references('Tenant_ID').inTable('tbl_tenant_master').onDelete('CASCADE');
    t.integer('Design_ID').references('Design_ID').inTable('tbl_design_master').onDelete('SET NULL');
    t.string('Mould_Name', 100).notNullable();
    t.string('Rubber_Type', 50);
    t.integer('Stock_Qty').defaultTo(0);
    t.decimal('Standard_Wax_Weight', 10, 3);
    t.decimal('Standard_Wastage_Pct', 5, 2).defaultTo(0);
    t.boolean('Is_Active').defaultTo(true);
    t.string('Created_By', 50);
    t.timestamp('Created_Date').defaultTo(knex.fn.now());
  });

  const existingModule = await knex('tbl_erp_modules').where('Module_Key', 'manufacturing_bom').first();
  if (!existingModule) {
    await knex('tbl_erp_modules').insert({
      Module_Key: 'manufacturing_bom',
      Module_Name: 'Manufacturing Efficiency / BOM',
      Module_Group: 'Manufacturing',
      Sort_Order: 36,
      Is_Core: false,
      Default_Retailer: false,
      Default_Wholesaler: true,
      Default_Manufacturer: true,
      Default_Hybrid: true,
    });
  }
};

exports.down = async function (knex) {
  await knex('tbl_erp_modules').where('Module_Key', 'manufacturing_bom').del();
  await knex.schema.dropTableIfExists('tbl_mould_bom_stock');
  await knex.schema.dropTableIfExists('tbl_melting_refining_log');
  await knex.schema.dropTableIfExists('tbl_production_transaction');
  await knex.schema.dropTableIfExists('tbl_bom_department_stages');
  await knex.schema.dropTableIfExists('tbl_bom_master');
  await knex.schema.dropTableIfExists('tbl_production_department_master');
};
