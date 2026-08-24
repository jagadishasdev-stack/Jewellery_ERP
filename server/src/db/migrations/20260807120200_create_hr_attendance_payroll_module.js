/**
 * HR / Attendance / Payroll Module.
 *
 * Legacy `usermaster` crammed HR fields (DOB, Aadhaar, bank account, salary
 * components, biometric fingerprint blobs) directly onto the login/user
 * row. tbl_user_master here stays a lean auth/permissions table, so HR data
 * lives in tbl_employee_details as a 1:1 extension (User_ID is both PK and
 * FK) — staff who never need HR tracking (e.g. a super-admin account) don't
 * need to carry these columns at all.
 *
 * tbl_sales_incentive_transactions is intentionally separate from the
 * existing scheme-side incentive fields (tbl_scheme_master.Salesman_Incentive_Pct)
 * — that column is a scheme-enrollment commission rate; this table is the
 * actual computed-and-paid incentive per retail sale, driven by
 * tbl_incentive_slab_master.
 */
exports.up = async function (knex) {
  await knex.schema.createTable('tbl_employee_details', (t) => {
    t.integer('User_ID').primary().references('User_ID').inTable('tbl_user_master').onDelete('CASCADE');
    t.date('Date_Of_Birth');
    t.string('Aadhaar_No', 20);
    t.string('PAN_No', 20);
    t.string('Bank_Account_No', 30);
    t.string('IFSC_Code', 20);
    t.string('Designation', 100);
    t.date('Date_Of_Joining');
    t.date('Date_Of_Leaving');
    t.string('Emergency_Contact_Name', 100);
    t.string('Emergency_Contact_Mobile', 15);
    t.text('Address');
    t.string('Photo_URL', 500);
    t.timestamp('Created_Date').defaultTo(knex.fn.now());
    t.timestamp('Modified_Date').defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('tbl_holiday_master', (t) => {
    t.increments('Holiday_ID').primary();
    t.string('Tenant_ID', 20).notNullable().references('Tenant_ID').inTable('tbl_tenant_master').onDelete('CASCADE');
    t.string('Branch_ID', 20).references('Branch_ID').inTable('tbl_branch_master').onDelete('SET NULL');
    t.date('Holiday_Date').notNullable();
    t.string('Holiday_Name', 100).notNullable();
    t.timestamp('Created_Date').defaultTo(knex.fn.now());
    t.unique(['Tenant_ID', 'Branch_ID', 'Holiday_Date']);
  });

  await knex.schema.createTable('tbl_attendance', (t) => {
    t.bigIncrements('Attendance_ID').primary();
    t.string('Tenant_ID', 20).notNullable().references('Tenant_ID').inTable('tbl_tenant_master').onDelete('CASCADE');
    t.integer('User_ID').notNullable().references('User_ID').inTable('tbl_user_master').onDelete('CASCADE');
    t.date('Attendance_Date').notNullable();
    t.time('Check_In');
    t.time('Check_Out');
    t.string('Status', 20).notNullable().defaultTo('Present'); // Present | Absent | Half Day | Leave | Holiday
    t.string('Source', 20).defaultTo('Manual'); // Manual | Biometric
    t.text('Remarks');
    t.string('Created_By', 50);
    t.timestamp('Created_Date').defaultTo(knex.fn.now());
    t.unique(['User_ID', 'Attendance_Date']);
    t.index(['Tenant_ID', 'Attendance_Date'], 'idx_attendance_date');
  });

  await knex.schema.createTable('tbl_salary_structure', (t) => {
    t.increments('Structure_ID').primary();
    t.integer('User_ID').notNullable().references('User_ID').inTable('tbl_user_master').onDelete('CASCADE');
    t.decimal('Basic', 10, 2).notNullable().defaultTo(0);
    t.decimal('HRA', 10, 2).defaultTo(0);
    t.decimal('Conveyance', 10, 2).defaultTo(0);
    t.decimal('Other_Allowance', 10, 2).defaultTo(0);
    t.decimal('PF_Pct', 5, 2).defaultTo(0);
    t.decimal('ESI_Pct', 5, 2).defaultTo(0);
    t.date('Effective_From').notNullable();
    t.boolean('Is_Active').defaultTo(true);
    t.string('Created_By', 50);
    t.timestamp('Created_Date').defaultTo(knex.fn.now());
    t.index(['User_ID', 'Is_Active'], 'idx_salary_structure_user');
  });

  await knex.schema.createTable('tbl_payroll_run', (t) => {
    t.increments('Run_ID').primary();
    t.string('Tenant_ID', 20).notNullable().references('Tenant_ID').inTable('tbl_tenant_master').onDelete('CASCADE');
    t.string('Branch_ID', 20).references('Branch_ID').inTable('tbl_branch_master').onDelete('SET NULL');
    t.integer('Pay_Month').notNullable(); // 1-12
    t.integer('Pay_Year').notNullable();
    t.string('Status', 20).notNullable().defaultTo('Draft'); // Draft | Finalized | Paid
    t.string('Generated_By', 50);
    t.timestamp('Generated_Date').defaultTo(knex.fn.now());
    t.timestamp('Finalized_Date');
    t.smallint('Data_Mode').notNullable().defaultTo(3);
    t.unique(['Tenant_ID', 'Branch_ID', 'Pay_Month', 'Pay_Year']);
  });

  await knex.schema.createTable('tbl_payroll_details', (t) => {
    t.bigIncrements('Detail_ID').primary();
    t.integer('Run_ID').notNullable().references('Run_ID').inTable('tbl_payroll_run').onDelete('CASCADE');
    // Nullable (not notNullable): ON DELETE SET NULL requires a nullable
    // column — keeps the payroll history row if the staff account is later
    // deleted, rather than cascading the delete into payroll records.
    t.integer('User_ID').references('User_ID').inTable('tbl_user_master').onDelete('SET NULL');
    t.integer('Days_Present').defaultTo(0);
    t.integer('Days_Absent').defaultTo(0);
    t.decimal('Gross_Salary', 12, 2).notNullable().defaultTo(0);
    t.decimal('PF_Deduction', 10, 2).defaultTo(0);
    t.decimal('ESI_Deduction', 10, 2).defaultTo(0);
    t.decimal('Other_Deductions', 10, 2).defaultTo(0);
    t.decimal('Incentive_Amount', 10, 2).defaultTo(0);
    t.decimal('Net_Salary', 12, 2).notNullable().defaultTo(0);
    t.string('Payment_Status', 20).defaultTo('Pending'); // Pending | Paid
    t.date('Payment_Date');
    t.string('Payment_Mode', 20);
    t.index(['Run_ID'], 'idx_payroll_details_run');
  });

  await knex.schema.createTable('tbl_incentive_slab_master', (t) => {
    t.increments('Slab_ID').primary();
    t.string('Tenant_ID', 20).notNullable().references('Tenant_ID').inTable('tbl_tenant_master').onDelete('CASCADE');
    t.string('Slab_Name', 100).notNullable();
    t.decimal('Amount_From', 15, 2).notNullable();
    t.decimal('Amount_To', 15, 2);
    t.decimal('Incentive_Pct', 5, 2).notNullable();
    t.boolean('Is_Active').defaultTo(true);
    t.timestamp('Created_Date').defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('tbl_sales_incentive_transactions', (t) => {
    t.bigIncrements('Txn_ID').primary();
    t.string('Tenant_ID', 20).notNullable().references('Tenant_ID').inTable('tbl_tenant_master').onDelete('CASCADE');
    t.bigInteger('Sale_ID').notNullable().references('Sale_ID').inTable('tbl_sales_header').onDelete('CASCADE');
    // Nullable, same reasoning as tbl_payroll_details.User_ID above.
    t.integer('User_ID').references('User_ID').inTable('tbl_user_master').onDelete('SET NULL');
    t.integer('Slab_ID').references('Slab_ID').inTable('tbl_incentive_slab_master').onDelete('SET NULL');
    t.decimal('Sale_Base_Amount', 15, 2).notNullable();
    t.decimal('Incentive_Pct_Applied', 5, 2).notNullable();
    t.decimal('Incentive_Amount', 10, 2).notNullable();
    t.string('Payout_Status', 20).defaultTo('Pending'); // Pending | Included In Payroll | Paid
    t.integer('Payroll_Run_ID').references('Run_ID').inTable('tbl_payroll_run').onDelete('SET NULL');
    t.smallint('Data_Mode').notNullable().defaultTo(3);
    t.timestamp('Created_Date').defaultTo(knex.fn.now());
    t.index(['Sale_ID'], 'idx_sales_incentive_sale');
    t.index(['User_ID'], 'idx_sales_incentive_user');
  });

  const existingModule = await knex('tbl_erp_modules').where('Module_Key', 'hr_payroll').first();
  if (!existingModule) {
    await knex('tbl_erp_modules').insert({
      Module_Key: 'hr_payroll',
      Module_Name: 'HR, Attendance & Payroll',
      Module_Group: 'Staff',
      Sort_Order: 31,
      Is_Core: false,
      Default_Retailer: true,
      Default_Wholesaler: true,
      Default_Manufacturer: true,
      Default_Hybrid: true,
    });
  }
};

exports.down = async function (knex) {
  await knex('tbl_erp_modules').where('Module_Key', 'hr_payroll').del();
  await knex.schema.dropTableIfExists('tbl_sales_incentive_transactions');
  await knex.schema.dropTableIfExists('tbl_incentive_slab_master');
  await knex.schema.dropTableIfExists('tbl_payroll_details');
  await knex.schema.dropTableIfExists('tbl_payroll_run');
  await knex.schema.dropTableIfExists('tbl_salary_structure');
  await knex.schema.dropTableIfExists('tbl_attendance');
  await knex.schema.dropTableIfExists('tbl_holiday_master');
  await knex.schema.dropTableIfExists('tbl_employee_details');
};
