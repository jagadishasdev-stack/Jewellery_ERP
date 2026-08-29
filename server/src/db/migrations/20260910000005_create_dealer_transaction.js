/**
 * Dealer Transaction — dealer-to-dealer trades of finished/semi-finished
 * jewellery or metal. Genuinely absent before — the only prior "Dealer"
 * concept was a cosmetic label swap on the Customers menu (module toggle
 * `dealers` just relabels "Customers" to "Dealers", same underlying
 * data). A real Dealer is closer to a Karigar/Supplier relationship (a
 * trading partner in tbl_vendor_master) but the transaction shape is
 * different from either — a Karigar's issue/return is about making
 * charges on raw gold you still own; a Dealer transaction is a real
 * buy/sell of finished value — so this gets its own table rather than
 * overloading Karigar's issue/return schema.
 */
exports.up = async function up(knex) {
  await knex.schema.createTable('tbl_dealer_transaction', (t) => {
    t.increments('Transaction_ID').primary();
    t.string('Tenant_ID', 20).notNullable().references('Tenant_ID').inTable('tbl_tenant_master').onDelete('CASCADE');
    t.string('Branch_ID', 20).references('Branch_ID').inTable('tbl_branch_master').onDelete('SET NULL');
    t.string('Voucher_Number', 30).unique().notNullable();
    t.integer('Dealer_ID').notNullable().references('Vendor_ID').inTable('tbl_vendor_master').onDelete('CASCADE');
    // Issue: goods sent TO the dealer (still owned by us, e.g. on
    // consignment). Receipt: goods received FROM the dealer (same basis).
    // Purchase: we bought from the dealer, real money owed to them.
    // Sale: we sold to the dealer, real money owed to us.
    t.string('Transaction_Type', 20).notNullable();
    t.string('Metal_Type', 20).notNullable();
    t.decimal('Weight', 10, 3);
    t.decimal('Rate_Per_Gram', 10, 2);
    t.decimal('Amount', 15, 2).notNullable();
    t.string('Settlement_Status', 20).defaultTo('Pending'); // Pending, Settled — only meaningful for Purchase/Sale
    t.text('Notes');
    t.string('Created_By', 50);
    t.timestamp('Created_Date').defaultTo(knex.fn.now());
    t.index(['Tenant_ID', 'Dealer_ID'], 'idx_dealer_transaction_dealer');
  });
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('tbl_dealer_transaction');
};
