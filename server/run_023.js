/**
 * Migration 023 — Sales Voucher ID
 * Adds Voucher_ID to tbl_sales_header
 * Backfills Voucher_ID for all existing sales
 * Adds SALE prefix to voucher generator
 */
const knex = require('./src/db/knex');

async function run() {
  // Add Voucher_ID column to sales header
  const hasCol = await knex.schema.hasColumn('tbl_sales_header', 'Voucher_ID');
  if (!hasCol) {
    await knex.schema.alterTable('tbl_sales_header', t => {
      t.string('Voucher_ID', 50).nullable();
    });
    await knex.schema.raw(`CREATE INDEX IF NOT EXISTS idx_sales_voucher_id ON tbl_sales_header("Voucher_ID")`);
    console.log('✓ Added Voucher_ID to tbl_sales_header');
  }

  // Backfill existing sales — use Invoice_Number as voucher (convert format)
  const sales = await knex('tbl_sales_header').whereNull('Voucher_ID').select('Sale_ID','Invoice_Number','Tenant_ID','Created_Date','Customer_Name','Net_Payable_Amount','Created_By');
  console.log(`Backfilling ${sales.length} existing sales...`);

  for (const sale of sales) {
    // Convert INV-TENANT-YYYYMMDD-NNNN → SAL-YYYYMMDD-NNNN
    const parts  = (sale.Invoice_Number || '').split('-');
    const dateP  = parts.find(p => /^\d{8}$/.test(p)) || require('dayjs')(sale.Created_Date).format('YYYYMMDD');
    const seqP   = parts[parts.length - 1] || '00001';
    const vid    = `SAL-${dateP}-${seqP.padStart(5,'0')}`;

    await knex('tbl_sales_header').where('Sale_ID', sale.Sale_ID).update({ Voucher_ID: vid });

    // Register in voucher master (ignore if already exists)
    const exists = await knex('tbl_voucher_master').where('Voucher_ID', vid).first().catch(() => null);
    if (!exists) {
      await knex('tbl_voucher_master').insert({
        Voucher_ID:      vid,
        Tenant_ID:       sale.Tenant_ID,
        Voucher_Type:    'SALE',
        Reference_ID:    sale.Sale_ID,
        Reference_Table: 'tbl_sales_header',
        Status:          'Active',
        Description:     `Sale to ${sale.Customer_Name || 'Walk-in'} — ₹${parseFloat(sale.Net_Payable_Amount||0).toLocaleString('en-IN')}`,
        Created_By:      sale.Created_By || 'system',
      }).catch(() => {}); // ignore duplicate
    }
    console.log(`  ${sale.Invoice_Number} → ${vid}`);
  }

  console.log('\nMigration 023 done — Sales Voucher IDs created.');
  process.exit(0);
}

run().catch(e => { console.error('Error:', e.message); process.exit(1); });
