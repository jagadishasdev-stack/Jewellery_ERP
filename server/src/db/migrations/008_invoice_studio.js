/**
 * Migration 008: Invoice Studio — Full template engine
 * Replaces simple tbl_invoice_template_master with a proper studio
 */
exports.up = async function (knex) {

  // ── Core template table ───────────────────────────────────────────────────
  await knex.schema.createTable('tbl_invoice_studio_templates', (t) => {
    t.bigIncrements('Template_ID').primary();
    t.string('Tenant_ID', 20).references('Tenant_ID').inTable('tbl_tenant_master').onDelete('CASCADE');
    t.string('Document_Type', 40).notNullable();
    // SALES | PURCHASE | PURCHASE_RETURN | SALES_RETURN | QUOTATION | ESTIMATE
    // ORDER_BOOKING | REPAIR_RECEIPT | REPAIR_DELIVERY | KARIGAR_ISSUE
    // KARIGAR_RECEIVE | KARIGAR_SETTLEMENT | SUPPLIER_PAYMENT | CUSTOMER_RECEIPT
    // SCHEME_RECEIPT | SCHEME_LEDGER | SCHEME_MATURITY | OLD_GOLD_PURCHASE
    // STOCK_TRANSFER | GST_INVOICE | MANUFACTURING_JOB | MANUFACTURING_COMPLETE
    t.string('Template_Name', 100).notNullable();
    t.string('Template_Code', 30);         // e.g. 'SALES_A4_DEFAULT'
    t.boolean('Is_Default').defaultTo(false);
    t.boolean('Is_Active').defaultTo(true);

    // Canvas / Page settings
    t.string('Paper_Size', 20).defaultTo('A4');
    // A4 | A5 | Legal | Thermal_80mm | Thermal_58mm | Custom
    t.decimal('Canvas_Width_MM', 8, 2).defaultTo(210);
    t.decimal('Canvas_Height_MM', 8, 2).defaultTo(297);
    t.decimal('Margin_Top', 6, 2).defaultTo(10);
    t.decimal('Margin_Bottom', 6, 2).defaultTo(10);
    t.decimal('Margin_Left', 6, 2).defaultTo(10);
    t.decimal('Margin_Right', 6, 2).defaultTo(10);
    t.string('Orientation', 10).defaultTo('Portrait');

    // Design
    t.string('Primary_Color', 7).defaultTo('#B8860B');
    t.string('Secondary_Color', 7).defaultTo('#1A1A1A');
    t.string('Background_Color', 7).defaultTo('#FFFFFF');
    t.string('Font_Family', 50).defaultTo('Arial');
    t.integer('Base_Font_Size').defaultTo(10);

    // The full layout — array of component objects stored as JSON
    t.jsonb('Components').defaultTo('[]');
    // Each component: { id, type, x, y, width, height, props, styles, visible, conditions }

    // GST Configuration
    t.jsonb('GST_Config').defaultTo('{}');
    // { mode: 'CGST_SGST' | 'IGST', rates: { gold: 3, making: 5, repair: 18 }, show_cess: false }

    // Dynamic variables config
    t.jsonb('Variables').defaultTo('{}');
    // { show_huid: true, show_net_weight: true, show_stone_weight: true }

    // Custom CSS / code
    t.text('Custom_CSS');
    t.text('Custom_JS');         // conditional logic

    // Logos/images stored as URLs
    t.text('Logo_URL');
    t.text('Stamp_URL');
    t.text('Signature_URL');

    // Version tracking
    t.integer('Version').defaultTo(1);
    t.jsonb('Version_History').defaultTo('[]');

    t.string('Created_By', 50);
    t.timestamp('Created_Date').defaultTo(knex.fn.now());
    t.string('Last_Updated_By', 50);
    t.timestamp('Last_Updated_Date').defaultTo(knex.fn.now());

    t.index(['Tenant_ID', 'Document_Type', 'Is_Default'], 'idx_studio_lookup');
  });

  // ── Sample/Preview data per document type ─────────────────────────────────
  await knex.schema.createTable('tbl_invoice_preview_data', (t) => {
    t.increments('Preview_ID').primary();
    t.string('Document_Type', 40).notNullable().unique();
    t.jsonb('Sample_Data').notNullable();   // realistic sample for live preview
    t.timestamp('Created_Date').defaultTo(knex.fn.now());
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('tbl_invoice_preview_data');
  await knex.schema.dropTableIfExists('tbl_invoice_studio_templates');
};
