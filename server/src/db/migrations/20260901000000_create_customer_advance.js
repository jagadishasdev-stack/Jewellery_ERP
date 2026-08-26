/**
 * Purchase Hub's Advance Receipt / Advance Adjustment cards only ever
 * printed a paper receipt — nothing was ever saved. binManagement.js's
 * order-tied advance (Dr Cash/Bank, Cr Customer Advance Account) has no
 * per-customer subledger either, so there was no way anywhere in the app
 * to answer "how much unapplied advance does this customer have" or
 * apply it to a later, unrelated bill. This table is that subledger.
 */
exports.up = async function (knex) {
  await knex.schema.createTable('tbl_customer_advance', (t) => {
    t.increments('Advance_ID').primary();
    t.string('Tenant_ID', 20).notNullable();
    t.integer('Branch_ID').nullable();
    t.integer('Customer_ID').notNullable();
    t.decimal('Amount', 12, 2).notNullable();
    t.decimal('Balance_Amount', 12, 2).notNullable(); // decrements as it's applied to bills; 0 = fully used
    t.string('Payment_Mode', 30).notNullable();
    t.string('Reference', 100).nullable();
    t.string('Purpose', 200).nullable();
    t.string('Status', 20).notNullable().defaultTo('Active'); // Active | Fully Applied | Cancelled
    t.string('Created_By', 50).nullable();
    t.timestamp('Created_Date').defaultTo(knex.fn.now());
    t.timestamp('Modified_Date').nullable();

    t.foreign('Tenant_ID').references('Tenant_ID').inTable('tbl_tenant_master');
    t.foreign('Customer_ID').references('Customer_ID').inTable('tbl_customer_master');
    t.index(['Tenant_ID', 'Customer_ID']);
  });

  // A customer's pool of advances is applied FIFO across possibly several
  // original receipts — this is the per-application audit trail (which
  // advance receipt(s) actually paid for which bill), separate from
  // tbl_sales_payments' own single summary row for the sale.
  await knex.schema.createTable('tbl_customer_advance_application', (t) => {
    t.increments('Application_ID').primary();
    t.string('Tenant_ID', 20).notNullable();
    t.integer('Advance_ID').notNullable();
    t.integer('Sale_ID').nullable();
    t.string('Invoice_Number', 50).nullable();
    t.decimal('Amount_Applied', 12, 2).notNullable();
    t.string('Created_By', 50).nullable();
    t.timestamp('Created_Date').defaultTo(knex.fn.now());

    t.foreign('Tenant_ID').references('Tenant_ID').inTable('tbl_tenant_master');
    t.foreign('Advance_ID').references('Advance_ID').inTable('tbl_customer_advance');
    t.foreign('Sale_ID').references('Sale_ID').inTable('tbl_sales_header');
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('tbl_customer_advance_application');
  await knex.schema.dropTableIfExists('tbl_customer_advance');
};
