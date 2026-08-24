/**
 * Bank Accounts & Cheque/PDC Register.
 *
 * tbl_scheme_pdc (existing) is scoped to savings-scheme installment cheques
 * only. This is the general-purpose register for every other cheque the
 * business handles — customer sale payments, supplier payments issued,
 * pawn-loan disbursals, etc. — plus a master of the business's own bank
 * accounts those cheques get deposited into or drawn from. Ported from
 * legacy `bank`/`bank_ledg` + `chq_clear`.
 */
exports.up = async function (knex) {
  await knex.schema.createTable('tbl_bank_account_master', (t) => {
    t.increments('Account_ID').primary();
    t.string('Tenant_ID', 20).notNullable().references('Tenant_ID').inTable('tbl_tenant_master').onDelete('CASCADE');
    t.string('Branch_ID', 20).references('Branch_ID').inTable('tbl_branch_master').onDelete('SET NULL');
    t.string('Bank_Name', 100).notNullable();
    t.string('Account_Name', 100);
    t.string('Account_Number', 30).notNullable();
    t.string('IFSC_Code', 20);
    t.string('Account_Type', 20).defaultTo('Current'); // Current | Savings | OD/CC
    t.decimal('Opening_Balance', 15, 2).defaultTo(0);
    t.decimal('Current_Balance', 15, 2).defaultTo(0);
    t.boolean('Is_Active').defaultTo(true);
    t.string('Created_By', 50);
    t.timestamp('Created_Date').defaultTo(knex.fn.now());
    t.unique(['Tenant_ID', 'Account_Number']);
  });

  await knex.schema.createTable('tbl_cheque_register', (t) => {
    t.bigIncrements('Cheque_ID').primary();
    t.string('Tenant_ID', 20).notNullable().references('Tenant_ID').inTable('tbl_tenant_master').onDelete('CASCADE');
    t.integer('Account_ID').references('Account_ID').inTable('tbl_bank_account_master').onDelete('SET NULL');
    t.string('Cheque_Type', 10).notNullable(); // Received | Issued
    t.string('Party_Type', 20); // Customer | Vendor | Karigar | Other
    t.string('Party_Name', 100).notNullable();
    t.string('Cheque_Number', 50).notNullable();
    t.string('Bank_Name', 100);
    t.date('Cheque_Date').notNullable();
    t.decimal('Amount', 15, 2).notNullable();
    t.string('Status', 20).notNullable().defaultTo('Pending'); // Pending | Deposited | Cleared | Bounced | Cancelled
    t.date('Deposit_Date');
    t.date('Clearing_Date');
    t.decimal('Bounce_Charge', 10, 2).defaultTo(0);
    t.string('Reference_Voucher_ID', 50); // links back to the sale/purchase/loan voucher this cheque settles
    t.text('Remarks');
    t.string('Created_By', 50);
    t.timestamp('Created_Date').defaultTo(knex.fn.now());
    t.timestamp('Modified_Date').defaultTo(knex.fn.now());
    t.index(['Tenant_ID', 'Status'], 'idx_cheque_register_status');
    t.index(['Cheque_Number'], 'idx_cheque_register_number');
  });

  const existingModule = await knex('tbl_erp_modules').where('Module_Key', 'bank_cheque').first();
  if (!existingModule) {
    await knex('tbl_erp_modules').insert({
      Module_Key: 'bank_cheque',
      Module_Name: 'Bank Accounts & Cheque Register',
      Module_Group: 'Finance',
      Sort_Order: 33,
      Is_Core: false,
      Default_Retailer: true,
      Default_Wholesaler: true,
      Default_Manufacturer: true,
      Default_Hybrid: true,
    });
  }
};

exports.down = async function (knex) {
  await knex('tbl_erp_modules').where('Module_Key', 'bank_cheque').del();
  await knex.schema.dropTableIfExists('tbl_cheque_register');
  await knex.schema.dropTableIfExists('tbl_bank_account_master');
};
