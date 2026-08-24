/**
 * Migration 009: Complete Savings Club Management Platform
 * Tables: scheme_master, scheme_groups, scheme_members, scheme_transactions,
 *         scheme_pdc, scheme_draws, scheme_bonuses, scheme_gold_conversion,
 *         scheme_notifications
 */
exports.up = async function (knex) {

  // ── 1. scheme_master ──────────────────────────────────────────────────────
  await knex.schema.createTable('tbl_scheme_master', (t) => {
    t.increments('Scheme_ID').primary();
    t.string('Tenant_ID', 20).notNullable().references('Tenant_ID').inTable('tbl_tenant_master').onDelete('CASCADE');
    t.string('Scheme_Code', 30).notNullable();
    t.string('Scheme_Name', 100).notNullable();
    t.text('Description');
    t.string('Scheme_Type', 20).defaultTo('Gold');
    // Gold | Cash | Diamond | Platinum | Silver
    t.string('Collection_Frequency', 20).defaultTo('Monthly');
    // Monthly | Weekly | Daily
    t.string('Installment_Mode', 20).defaultTo('Fixed');
    // Fixed | Flexible
    t.string('Installment_Limit', 20).defaultTo('No Limit');
    // No Limit | One | Two | Multiple
    t.decimal('Default_Monthly_Amount', 10, 2).defaultTo(0);
    t.integer('Duration_Months').defaultTo(11);
    t.integer('Free_Months').defaultTo(1);  // bonus months

    // Bonus settings
    t.string('Bonus_Type', 20).defaultTo('No Bonus');
    // No Bonus | One Month | Product | Percentage | Fixed
    t.decimal('Bonus_Value', 10, 2).defaultTo(0);
    t.string('Bonus_Product_Code', 50);

    // Maturity settings
    t.string('Maturity_Type', 30).defaultTo('Jewellery Purchase Only');
    // Jewellery Purchase Only | Cash Redemption | Voucher Redemption | Gold Conversion
    t.string('Gold_Rate_Mode', 20).defaultTo('Current Rate');
    // Current Rate | Booking Rate | Average Rate

    // Penalty settings
    t.decimal('Penalty_Amount', 10, 2).defaultTo(0);
    t.integer('Grace_Days').defaultTo(7);

    // Gift settings
    t.boolean('Enable_Gift').defaultTo(false);
    t.decimal('Gift_Value', 10, 2).defaultTo(0);

    // Lucky draw
    t.boolean('Enable_Draw').defaultTo(false);
    t.string('Draw_Frequency', 20).defaultTo('Monthly');

    // App visibility
    t.boolean('Show_In_App').defaultTo(true);

    // Incentives
    t.decimal('Introducer_Incentive_Pct', 5, 2).defaultTo(0);
    t.decimal('Salesman_Incentive_Pct', 5, 2).defaultTo(0);

    t.boolean('Is_Active').defaultTo(true);
    t.string('Created_By', 50);
    t.timestamp('Created_Date').defaultTo(knex.fn.now());
    t.timestamp('Modified_Date').defaultTo(knex.fn.now());
    t.unique(['Tenant_ID', 'Scheme_Code']);
  });

  // ── 2. scheme_groups ──────────────────────────────────────────────────────
  await knex.schema.createTable('tbl_scheme_groups', (t) => {
    t.increments('Group_ID').primary();
    t.string('Tenant_ID', 20).notNullable().references('Tenant_ID').inTable('tbl_tenant_master').onDelete('CASCADE');
    t.integer('Scheme_ID').notNullable().references('Scheme_ID').inTable('tbl_scheme_master').onDelete('CASCADE');
    t.string('Group_Code', 30).notNullable();
    t.string('Group_Name', 100).notNullable();
    // e.g. "Group A — Jan 2026"
    t.date('Start_Date').notNullable();
    t.date('End_Date');
    t.date('Maturity_Date');
    t.decimal('Monthly_Amount', 10, 2).notNullable();
    t.integer('Total_Installments').notNullable();
    t.integer('Member_Limit').defaultTo(0); // 0 = unlimited
    t.integer('Current_Members').defaultTo(0);
    t.boolean('App_Join_Allowed').defaultTo(true);
    t.boolean('Counter_Join_Allowed').defaultTo(true);
    t.boolean('Auto_Approval').defaultTo(true);
    t.boolean('Draw_Applicable').defaultTo(false);
    t.boolean('Gold_Conversion_Applicable').defaultTo(true);
    t.decimal('Bonus_Amount', 10, 2).defaultTo(0);
    t.string('Status', 20).defaultTo('Active');
    // Active | Closed | Matured | Cancelled
    t.string('Created_By', 50);
    t.timestamp('Created_Date').defaultTo(knex.fn.now());
    t.unique(['Tenant_ID', 'Scheme_ID', 'Group_Code']);
    t.index(['Tenant_ID', 'Status'], 'idx_group_status');
  });

  // ── 3. scheme_members ─────────────────────────────────────────────────────
  await knex.schema.createTable('tbl_scheme_members', (t) => {
    t.bigIncrements('Member_ID').primary();
    t.string('Tenant_ID', 20).notNullable().references('Tenant_ID').inTable('tbl_tenant_master').onDelete('CASCADE');
    t.string('Member_Number', 30).unique().notNullable();
    // Auto format: TEN-0001, TEN-0002 — shared between ERP + App
    t.integer('Customer_ID').references('Customer_ID').inTable('tbl_customer_master').onDelete('SET NULL');

    // Personal
    t.string('Member_Name', 100).notNullable();
    t.string('Father_Husband_Name', 100);
    t.date('DOB');
    t.date('Anniversary');
    t.string('Gender', 10);
    t.string('Mobile', 15).notNullable();
    t.string('WhatsApp', 15);
    t.string('Email', 100);

    // Address
    t.string('Address_Line1', 200);
    t.string('Area', 100);
    t.string('City', 50);
    t.string('State', 50);
    t.string('Pincode', 10);

    // Identity
    t.string('PAN_No', 20);
    t.string('Aadhaar_No', 20);
    t.string('GST_No', 20);

    // Nominee
    t.string('Nominee_Name', 100);
    t.string('Nominee_Relation', 50);
    t.string('Nominee_Mobile', 15);

    // Scheme enrollment
    t.integer('Scheme_ID').references('Scheme_ID').inTable('tbl_scheme_master').onDelete('SET NULL');
    t.integer('Group_ID').references('Group_ID').inTable('tbl_scheme_groups').onDelete('SET NULL');
    t.date('Joining_Date').notNullable();
    t.decimal('Installment_Amount', 10, 2).notNullable();
    t.integer('Installments_Paid').defaultTo(0);
    t.integer('Total_Installments').notNullable();
    t.decimal('Total_Amount_Paid', 15, 2).defaultTo(0);
    t.decimal('Bonus_Amount', 10, 2).defaultTo(0);
    t.decimal('Maturity_Value', 15, 2).defaultTo(0);
    t.date('Maturity_Date');
    t.decimal('Gold_Balance_Grams', 10, 3).defaultTo(0);
    // For gold conversion

    // Introducer / Salesman
    t.bigInteger('Introducer_Member_ID');
    t.integer('Salesman_User_ID').references('User_ID').inTable('tbl_user_master').onDelete('SET NULL');

    // App details
    t.boolean('App_Login_Enabled').defaultTo(false);
    t.string('App_Device_ID', 200);
    t.timestamp('App_Last_Login');
    t.string('App_FCM_Token', 500); // for push notifications

    // KYC
    t.string('KYC_Status', 20).defaultTo('Pending');
    // Pending | Approved | Rejected
    t.string('KYC_Aadhaar_URL', 500);
    t.string('KYC_PAN_URL', 500);
    t.string('KYC_Photo_URL', 500);

    // Join source
    t.string('Join_Source', 20).defaultTo('Counter');
    // Counter | App | Agent | Import

    t.string('Status', 20).defaultTo('Active');
    // Active | Closed | Matured | Redeemed | Defaulter | Suspended
    t.date('Redemption_Date');
    t.bigInteger('Redemption_Sale_ID').references('Sale_ID').inTable('tbl_sales_header').onDelete('SET NULL');
    t.string('Closure_Reason', 200);

    t.string('Created_By', 50);
    t.timestamp('Created_Date').defaultTo(knex.fn.now());
    t.timestamp('Modified_Date').defaultTo(knex.fn.now());
    t.index(['Tenant_ID', 'Mobile'], 'idx_member_mobile');
    t.index(['Tenant_ID', 'Status'], 'idx_member_status');
    t.index(['Tenant_ID', 'Group_ID'], 'idx_member_group');
  });

  // ── 4. scheme_transactions ────────────────────────────────────────────────
  await knex.schema.createTable('tbl_scheme_transactions', (t) => {
    t.bigIncrements('Txn_ID').primary();
    t.string('Tenant_ID', 20).notNullable().references('Tenant_ID').inTable('tbl_tenant_master').onDelete('CASCADE');
    t.string('Receipt_Number', 30).unique().notNullable();
    t.bigInteger('Member_ID').references('Member_ID').inTable('tbl_scheme_members').onDelete('SET NULL');
    t.string('Tenant_Member_No', 30); // denormalized

    t.string('Txn_Type', 20).defaultTo('Collection');
    // Collection | Refund | Bonus | Maturity | Adjustment | Penalty

    t.integer('Installment_No').notNullable();
    t.date('Due_Date');
    t.timestamp('Payment_Date').defaultTo(knex.fn.now());
    t.decimal('Amount', 10, 2).notNullable();
    t.decimal('Penalty_Amount', 10, 2).defaultTo(0);
    t.decimal('Net_Amount', 10, 2).notNullable();

    t.string('Payment_Mode', 30).notNullable();
    // Cash | UPI | Card | NEFT | RTGS | IMPS | Cheque | PDC | Gift Voucher | Wallet | Advance
    t.string('Payment_Reference', 100);
    t.string('Bank_Name', 100);
    t.string('Cheque_Number', 50);
    t.date('Cheque_Date');

    t.string('Collection_Source', 20).defaultTo('Counter');
    // Counter | App | Agent | Auto

    t.integer('Collected_By').references('User_ID').inTable('tbl_user_master').onDelete('SET NULL');
    t.string('Branch_ID', 20).references('Branch_ID').inTable('tbl_branch_master').onDelete('SET NULL');

    t.boolean('Is_Late').defaultTo(false);
    t.integer('Days_Late').defaultTo(0);
    t.boolean('Notification_Sent').defaultTo(false);

    t.text('Notes');
    t.string('Created_By', 50);
    t.timestamp('Created_Date').defaultTo(knex.fn.now());
    t.index(['Tenant_ID', 'Member_ID'], 'idx_txn_member');
    t.index(['Tenant_ID', 'Payment_Date'], 'idx_txn_date');
  });

  // ── 5. scheme_pdc (Post-Dated Cheques) ───────────────────────────────────
  await knex.schema.createTable('tbl_scheme_pdc', (t) => {
    t.increments('PDC_ID').primary();
    t.string('Tenant_ID', 20).notNullable().references('Tenant_ID').inTable('tbl_tenant_master').onDelete('CASCADE');
    t.bigInteger('Member_ID').references('Member_ID').inTable('tbl_scheme_members').onDelete('CASCADE');
    t.string('Bank_Name', 100).notNullable();
    t.string('Cheque_Number', 50).notNullable();
    t.decimal('Amount', 10, 2).notNullable();
    t.date('Cheque_Date').notNullable();
    t.date('Deposit_Date');
    t.date('Clearing_Date');
    t.string('Status', 20).defaultTo('Pending');
    // Pending | Deposited | Cleared | Bounced | Cancelled | Re-Presented
    t.decimal('Bounce_Charge', 10, 2).defaultTo(0);
    t.text('Remarks');
    t.string('Created_By', 50);
    t.timestamp('Created_Date').defaultTo(knex.fn.now());
    t.index(['Tenant_ID', 'Status'], 'idx_pdc_status');
  });

  // ── 6. scheme_draws (Lucky Draw) ──────────────────────────────────────────
  await knex.schema.createTable('tbl_scheme_draws', (t) => {
    t.increments('Draw_ID').primary();
    t.string('Tenant_ID', 20).notNullable().references('Tenant_ID').inTable('tbl_tenant_master').onDelete('CASCADE');
    t.integer('Scheme_ID').references('Scheme_ID').inTable('tbl_scheme_master').onDelete('SET NULL');
    t.integer('Group_ID').references('Group_ID').inTable('tbl_scheme_groups').onDelete('SET NULL');
    t.date('Draw_Date').notNullable();
    t.string('Draw_Type', 20).defaultTo('Monthly');
    // Monthly | Quarterly | Festival | Special
    t.string('Draw_Name', 100);
    t.bigInteger('Winner_Member_ID').references('Member_ID').inTable('tbl_scheme_members').onDelete('SET NULL');
    t.string('Prize_Type', 30); // Cash | Product | Gold | Discount
    t.decimal('Prize_Value', 10, 2).defaultTo(0);
    t.string('Prize_Description', 200);
    t.integer('Eligible_Members').defaultTo(0);
    t.boolean('Notification_Sent').defaultTo(false);
    t.string('Conducted_By', 50);
    t.timestamp('Created_Date').defaultTo(knex.fn.now());
  });

  // ── 7. scheme_bonuses ─────────────────────────────────────────────────────
  await knex.schema.createTable('tbl_scheme_bonuses', (t) => {
    t.increments('Bonus_ID').primary();
    t.string('Tenant_ID', 20).notNullable().references('Tenant_ID').inTable('tbl_tenant_master').onDelete('CASCADE');
    t.bigInteger('Member_ID').references('Member_ID').inTable('tbl_scheme_members').onDelete('CASCADE');
    t.string('Bonus_Type', 30).notNullable();
    // Cash | Product | Voucher | Gold Weight | Percentage
    t.decimal('Bonus_Amount', 10, 2).defaultTo(0);
    t.decimal('Bonus_Gold_Grams', 10, 3).defaultTo(0);
    t.string('Bonus_Product_Code', 50);
    t.string('Voucher_Code', 50);
    t.date('Credit_Date').notNullable();
    t.boolean('Is_Redeemed').defaultTo(false);
    t.date('Redemption_Date');
    t.text('Notes');
    t.string('Created_By', 50);
    t.timestamp('Created_Date').defaultTo(knex.fn.now());
  });

  // ── 8. scheme_gold_conversion ─────────────────────────────────────────────
  await knex.schema.createTable('tbl_scheme_gold_conversion', (t) => {
    t.increments('Conversion_ID').primary();
    t.string('Tenant_ID', 20).notNullable().references('Tenant_ID').inTable('tbl_tenant_master').onDelete('CASCADE');
    t.bigInteger('Member_ID').references('Member_ID').inTable('tbl_scheme_members').onDelete('CASCADE');
    t.date('Conversion_Date').notNullable();
    t.decimal('Amount_Converted', 10, 2).notNullable();
    t.decimal('Gold_Rate_Used', 10, 2).notNullable();
    t.decimal('Gold_Weight_Credited', 10, 3).notNullable();
    t.decimal('Remaining_Balance', 10, 2).defaultTo(0);
    t.string('Rate_Mode', 20).defaultTo('Current Rate');
    t.string('Created_By', 50);
    t.timestamp('Created_Date').defaultTo(knex.fn.now());
  });

  // ── 9. scheme_notifications ───────────────────────────────────────────────
  await knex.schema.createTable('tbl_scheme_notifications', (t) => {
    t.bigIncrements('Notif_ID').primary();
    t.string('Tenant_ID', 20).notNullable().references('Tenant_ID').inTable('tbl_tenant_master').onDelete('CASCADE');
    t.bigInteger('Member_ID').references('Member_ID').inTable('tbl_scheme_members').onDelete('CASCADE');
    t.string('Type', 20).notNullable();
    // Welcome | Collection | Due Reminder | Draw Winner | Bonus | Maturity | Birthday | Campaign
    t.string('Channel', 20).notNullable();
    // SMS | WhatsApp | Push | Email
    t.text('Message').notNullable();
    t.string('Status', 20).defaultTo('Pending');
    // Pending | Sent | Failed | Delivered
    t.timestamp('Sent_At');
    t.text('Error_Message');
    t.timestamp('Created_Date').defaultTo(knex.fn.now());
    t.index(['Tenant_ID', 'Type', 'Status'], 'idx_notif_status');
  });
};

exports.down = async function (knex) {
  const tables = [
    'tbl_scheme_notifications', 'tbl_scheme_gold_conversion',
    'tbl_scheme_bonuses', 'tbl_scheme_draws', 'tbl_scheme_pdc',
    'tbl_scheme_transactions', 'tbl_scheme_members',
    'tbl_scheme_groups', 'tbl_scheme_master',
  ];
  for (const t of tables) await knex.schema.dropTableIfExists(t);
};
