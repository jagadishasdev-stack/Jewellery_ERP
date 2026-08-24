/**
 * Approval Issue / Approval Receive Management Module.
 *
 * Tagged items are tracked per-unit (Item_Status Pending/Received/Cancelled on
 * each tbl_approval_issue_items row) rather than via a running-weight balance
 * like Karigar Issue/Return — the required UI is "tick individual items on a
 * checklist and receive the selected subset," which needs line-item state,
 * not a single aggregate number.
 *
 * No separate receive-line-items join table: a receive transaction always
 * just flips a specific set of already-existing pending issue-item rows to
 * Received (via the nullable Received_In_Receive_ID FK placed directly on
 * the issue-item row), so a join table would carry no independent data.
 */
exports.up = async function (knex) {
  // ── Party Master ──────────────────────────────────────────────────────────
  await knex.schema.createTable('tbl_approval_party_master', (t) => {
    t.bigIncrements('Party_ID').primary();
    t.string('Tenant_ID', 20).notNullable().references('Tenant_ID').inTable('tbl_tenant_master').onDelete('CASCADE');
    t.string('Party_Name', 150).notNullable();
    t.string('Shop_Name', 150);
    t.string('Contact_Person', 100);
    t.string('Mobile', 15);
    t.string('Alt_Mobile', 15);
    t.string('GST_Number', 20);
    t.text('Address');
    t.string('City', 100);
    t.text('Remarks');
    t.boolean('Is_Active').defaultTo(true);
    t.string('Created_By', 50);
    t.timestamp('Created_Date').defaultTo(knex.fn.now());
    t.string('Modified_By', 50);
    t.timestamp('Modified_Date').defaultTo(knex.fn.now());
    t.unique(['Tenant_ID', 'Mobile']);
    t.index(['Tenant_ID', 'Party_Name'], 'idx_approval_party_name');
  });

  // ── Tagged Issue ───────────────────────────────────────────────────────────
  await knex.schema.createTable('tbl_approval_issue_header', (t) => {
    t.bigIncrements('Issue_ID').primary();
    t.string('Tenant_ID', 20).notNullable().references('Tenant_ID').inTable('tbl_tenant_master').onDelete('CASCADE');
    t.string('Branch_ID', 20).references('Branch_ID').inTable('tbl_branch_master').onDelete('SET NULL');
    t.string('Voucher_Number', 40).unique().notNullable();
    t.bigInteger('Party_ID').references('Party_ID').inTable('tbl_approval_party_master').onDelete('SET NULL');
    t.date('Issue_Date').notNullable();
    t.date('Expected_Return_Date');
    t.integer('Total_Items_Issued').notNullable().defaultTo(0);
    t.decimal('Total_Weight_Issued', 10, 3).defaultTo(0);
    t.decimal('Total_Value_Issued', 15, 2).defaultTo(0);
    t.string('Status', 20).notNullable().defaultTo('Pending'); // Pending | Partial | Completed | Cancelled
    t.text('Remarks');
    t.smallint('Data_Mode').notNullable().defaultTo(3);
    t.string('Created_By', 50);
    t.timestamp('Created_Date').defaultTo(knex.fn.now());
    t.string('Modified_By', 50);
    t.timestamp('Modified_Date').defaultTo(knex.fn.now());
    t.string('Cancelled_By', 50);
    t.timestamp('Cancelled_Date');
    t.text('Cancellation_Reason');
    t.index(['Tenant_ID', 'Status'], 'idx_approval_issue_status');
  });

  await knex.schema.createTable('tbl_approval_issue_items', (t) => {
    t.bigIncrements('Issue_Item_ID').primary();
    t.bigInteger('Issue_ID').notNullable().references('Issue_ID').inTable('tbl_approval_issue_header').onDelete('CASCADE');
    t.string('Tenant_ID', 20).notNullable().references('Tenant_ID').inTable('tbl_tenant_master').onDelete('CASCADE');
    t.bigInteger('Ornament_ID').references('Ornament_ID').inTable('tbl_ornament_master').onDelete('SET NULL');
    // Snapshot fields — captured at issue time so later ornament edits don't
    // retroactively rewrite approval history.
    t.string('Article_Number', 50);
    t.decimal('Gross_Weight', 10, 3);
    t.decimal('Net_Gold_Weight', 10, 3);
    t.string('Purity_Code', 20);
    t.decimal('Approx_Value', 15, 2);
    t.string('Item_Status', 20).notNullable().defaultTo('Pending'); // Pending | Received | Cancelled
    t.bigInteger('Received_In_Receive_ID');
    t.timestamp('Received_Date');
    t.string('Created_By', 50);
    t.timestamp('Created_Date').defaultTo(knex.fn.now());
    t.index(['Issue_ID', 'Item_Status'], 'idx_approval_issue_items_status');
    t.index(['Ornament_ID'], 'idx_approval_issue_items_ornament');
  });

  // ── Tagged Receive ─────────────────────────────────────────────────────────
  await knex.schema.createTable('tbl_approval_receive_header', (t) => {
    t.bigIncrements('Receive_ID').primary();
    t.string('Tenant_ID', 20).notNullable().references('Tenant_ID').inTable('tbl_tenant_master').onDelete('CASCADE');
    t.string('Branch_ID', 20).references('Branch_ID').inTable('tbl_branch_master').onDelete('SET NULL');
    t.string('Voucher_Number', 40).unique().notNullable();
    t.bigInteger('Issue_ID').notNullable().references('Issue_ID').inTable('tbl_approval_issue_header').onDelete('CASCADE');
    t.date('Receive_Date').notNullable();
    t.integer('Items_Received_Count').notNullable().defaultTo(0);
    t.decimal('Total_Weight_Received', 10, 3).defaultTo(0);
    t.decimal('Total_Value_Received', 15, 2).defaultTo(0);
    t.text('Remarks');
    t.smallint('Data_Mode').notNullable().defaultTo(3);
    t.string('Created_By', 50);
    t.timestamp('Created_Date').defaultTo(knex.fn.now());
    t.index(['Issue_ID'], 'idx_approval_receive_issue');
    t.index(['Tenant_ID', 'Receive_Date'], 'idx_approval_receive_date');
  });

  // Now that tbl_approval_receive_header exists, wire the FK on issue_items
  // (created earlier, deliberately without the FK constraint since the
  // referenced table didn't exist yet at that point in this same migration).
  await knex.schema.alterTable('tbl_approval_issue_items', (t) => {
    t.foreign('Received_In_Receive_ID').references('Receive_ID').inTable('tbl_approval_receive_header').onDelete('SET NULL');
  });

  // ── Non-Tagged Issue ───────────────────────────────────────────────────────
  await knex.schema.createTable('tbl_non_tag_issue_header', (t) => {
    t.bigIncrements('NTA_Issue_ID').primary();
    t.string('Tenant_ID', 20).notNullable().references('Tenant_ID').inTable('tbl_tenant_master').onDelete('CASCADE');
    t.string('Branch_ID', 20).references('Branch_ID').inTable('tbl_branch_master').onDelete('SET NULL');
    t.string('Voucher_Number', 40).unique().notNullable();
    t.bigInteger('Party_ID').references('Party_ID').inTable('tbl_approval_party_master').onDelete('SET NULL');
    t.date('Issue_Date').notNullable();
    t.date('Expected_Return_Date');
    t.integer('Total_Items_Issued').notNullable().defaultTo(0);
    t.decimal('Total_Weight_Issued', 10, 3).defaultTo(0);
    t.decimal('Total_Value_Issued', 15, 2).defaultTo(0);
    t.string('Status', 20).notNullable().defaultTo('Pending');
    t.text('Remarks');
    t.smallint('Data_Mode').notNullable().defaultTo(3);
    t.string('Created_By', 50);
    t.timestamp('Created_Date').defaultTo(knex.fn.now());
    t.string('Modified_By', 50);
    t.timestamp('Modified_Date').defaultTo(knex.fn.now());
    t.string('Cancelled_By', 50);
    t.timestamp('Cancelled_Date');
    t.text('Cancellation_Reason');
    t.index(['Tenant_ID', 'Status'], 'idx_nta_issue_status');
  });

  await knex.schema.createTable('tbl_non_tag_issue_items', (t) => {
    t.bigIncrements('NTA_Issue_Item_ID').primary();
    t.bigInteger('NTA_Issue_ID').notNullable().references('NTA_Issue_ID').inTable('tbl_non_tag_issue_header').onDelete('CASCADE');
    t.string('Tenant_ID', 20).notNullable().references('Tenant_ID').inTable('tbl_tenant_master').onDelete('CASCADE');
    t.integer('Type_ID').references('Type_ID').inTable('tbl_item_type_master').onDelete('SET NULL');
    t.string('Item_Type', 100);
    t.integer('Design_ID').references('Design_ID').inTable('tbl_design_master').onDelete('SET NULL');
    t.string('Design_Type', 100);
    t.string('Category', 100);
    t.decimal('Gross_Weight', 10, 3);
    t.integer('Purity_ID').references('Purity_ID').inTable('tbl_purity_master').onDelete('SET NULL');
    t.string('Metal_Type', 50);
    t.decimal('Approx_Value', 15, 2);
    t.string('Image_URL', 500);
    t.text('Remarks');
    t.string('Item_Status', 20).notNullable().defaultTo('Pending'); // Pending | Received | Cancelled
    t.bigInteger('Received_In_Receive_ID');
    t.timestamp('Received_Date');
    t.string('Created_By', 50);
    t.timestamp('Created_Date').defaultTo(knex.fn.now());
    t.index(['NTA_Issue_ID', 'Item_Status'], 'idx_nta_issue_items_status');
  });

  // ── Non-Tagged Receive ─────────────────────────────────────────────────────
  await knex.schema.createTable('tbl_non_tag_receive_header', (t) => {
    t.bigIncrements('NTA_Receive_ID').primary();
    t.string('Tenant_ID', 20).notNullable().references('Tenant_ID').inTable('tbl_tenant_master').onDelete('CASCADE');
    t.string('Branch_ID', 20).references('Branch_ID').inTable('tbl_branch_master').onDelete('SET NULL');
    t.string('Voucher_Number', 40).unique().notNullable();
    t.bigInteger('NTA_Issue_ID').notNullable().references('NTA_Issue_ID').inTable('tbl_non_tag_issue_header').onDelete('CASCADE');
    t.date('Receive_Date').notNullable();
    t.integer('Items_Received_Count').notNullable().defaultTo(0);
    t.decimal('Total_Weight_Received', 10, 3).defaultTo(0);
    t.decimal('Total_Value_Received', 15, 2).defaultTo(0);
    t.text('Remarks');
    t.smallint('Data_Mode').notNullable().defaultTo(3);
    t.string('Created_By', 50);
    t.timestamp('Created_Date').defaultTo(knex.fn.now());
    t.index(['NTA_Issue_ID'], 'idx_nta_receive_issue');
  });

  await knex.schema.alterTable('tbl_non_tag_issue_items', (t) => {
    t.foreign('Received_In_Receive_ID').references('NTA_Receive_ID').inTable('tbl_non_tag_receive_header').onDelete('SET NULL');
  });

  // ── tbl_ornament_master: repurpose the dead Is_Reserved column + add ──────
  // provenance/reversal fields, mirroring the Is_Hidden/Hidden_* shape.
  const ornamentCols = await knex('tbl_ornament_master').columnInfo();
  if (ornamentCols.Is_Reserved && !ornamentCols.Is_On_Approval) {
    await knex.schema.alterTable('tbl_ornament_master', (t) => {
      t.renameColumn('Is_Reserved', 'Is_On_Approval');
    });
  }
  const ornamentCols2 = await knex('tbl_ornament_master').columnInfo();
  await knex.schema.alterTable('tbl_ornament_master', (t) => {
    if (!ornamentCols2.Approval_Issue_ID) t.bigInteger('Approval_Issue_ID').references('Issue_ID').inTable('tbl_approval_issue_header').onDelete('SET NULL');
    if (!ornamentCols2.Approval_Out_By) t.string('Approval_Out_By', 50);
    if (!ornamentCols2.Approval_Out_Date) t.timestamp('Approval_Out_Date');
    if (!ornamentCols2.Approval_Receive_ID) t.bigInteger('Approval_Receive_ID').references('Receive_ID').inTable('tbl_approval_receive_header').onDelete('SET NULL');
    if (!ornamentCols2.Approval_Received_By) t.string('Approval_Received_By', 50);
    if (!ornamentCols2.Approval_Received_Date) t.timestamp('Approval_Received_Date');
  });
  await knex.schema.alterTable('tbl_ornament_master', (t) => {
    t.index(['Tenant_ID', 'Is_On_Approval'], 'idx_ornament_on_approval');
  });

  // ── Module registry row ────────────────────────────────────────────────────
  const existingModule = await knex('tbl_erp_modules').where('Module_Key', 'approval_module').first();
  if (!existingModule) {
    await knex('tbl_erp_modules').insert({
      Module_Key: 'approval_module',
      Module_Name: 'Approval Issue / Receive',
      Module_Group: 'Inventory',
      Sort_Order: 28,
      Is_Core: false,
      Default_Retailer: true,
      Default_Wholesaler: true,
      Default_Manufacturer: false,
      Default_Hybrid: true,
    });
  }
};

exports.down = async function (knex) {
  await knex('tbl_erp_modules').where('Module_Key', 'approval_module').del();
  await knex.schema.alterTable('tbl_ornament_master', (t) => {
    t.dropIndex(['Tenant_ID', 'Is_On_Approval'], 'idx_ornament_on_approval');
    t.dropColumn('Approval_Issue_ID');
    t.dropColumn('Approval_Out_By');
    t.dropColumn('Approval_Out_Date');
    t.dropColumn('Approval_Receive_ID');
    t.dropColumn('Approval_Received_By');
    t.dropColumn('Approval_Received_Date');
  });
  await knex.schema.alterTable('tbl_ornament_master', (t) => {
    t.renameColumn('Is_On_Approval', 'Is_Reserved');
  });
  await knex.schema.dropTableIfExists('tbl_non_tag_receive_header');
  await knex.schema.dropTableIfExists('tbl_non_tag_issue_items');
  await knex.schema.dropTableIfExists('tbl_non_tag_issue_header');
  await knex.schema.dropTableIfExists('tbl_approval_receive_header');
  await knex.schema.dropTableIfExists('tbl_approval_issue_items');
  await knex.schema.dropTableIfExists('tbl_approval_issue_header');
  await knex.schema.dropTableIfExists('tbl_approval_party_master');
};
