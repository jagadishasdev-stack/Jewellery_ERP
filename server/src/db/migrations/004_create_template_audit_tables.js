/**
 * Migration 004: Invoice Templates, Display Settings, Audit, Session
 */
exports.up = async function (knex) {

  // ─── 1. tbl_invoice_template_master ───────────────────────────────────────
  await knex.schema.createTable('tbl_invoice_template_master', (t) => {
    t.bigIncrements('Template_ID').primary();
    t.string('Tenant_ID', 20).references('Tenant_ID').inTable('tbl_tenant_master').onDelete('CASCADE');
    t.string('Document_Type', 30).notNullable();
    t.string('Branch_ID', 20).references('Branch_ID').inTable('tbl_branch_master').onDelete('SET NULL');
    t.string('Template_Name', 100).notNullable();
    t.integer('Template_Version').defaultTo(1);
    t.boolean('Is_Active').defaultTo(true);
    t.boolean('Is_Default').defaultTo(false);
    t.string('Paper_Size', 20).defaultTo('A4');
    t.string('Orientation', 10).defaultTo('Portrait');
    t.string('Font_Family', 50).defaultTo('Arial');
    t.integer('Font_Size').defaultTo(10);
    t.string('Primary_Color', 7).defaultTo('#B8860B');
    t.string('Secondary_Color', 7).defaultTo('#1A1A1A');
    t.string('Background_Color', 7).defaultTo('#FFFFFF');
    t.text('Header_Logo_URL');
    t.jsonb('Header_Text');
    t.jsonb('Header_Address');
    t.jsonb('Header_Contact');
    t.jsonb('Footer_Text');
    t.string('Footer_Message', 500);
    t.jsonb('Field_Visibility');
    t.jsonb('Field_Order');
    t.jsonb('Field_Labels');
    t.boolean('Is_Tax_Invoice').defaultTo(true);
    t.boolean('Show_Round_Off').defaultTo(true);
    t.boolean('Show_GST_Breakdown').defaultTo(true);
    t.boolean('Show_Old_Gold_Details').defaultTo(false);
    t.boolean('Show_Karigar_Details').defaultTo(false);
    t.boolean('Show_Wastage_Column').defaultTo(false);
    t.boolean('Show_Hallmark_Number').defaultTo(true);
    t.boolean('Show_QR_Code').defaultTo(true);
    t.string('Signature_Field_Label', 50).defaultTo('Customer Signature');
    t.boolean('Signature_Field_Required').defaultTo(true);
    t.string('Copy_Type', 20).defaultTo('Original');
    t.text('Custom_CSS');
    t.text('Custom_HTML_Header');
    t.text('Custom_HTML_Footer');
    t.text('Cache_PDF_HTML');
    t.timestamp('Cache_Last_Generated');
    t.string('Created_By', 50);
    t.timestamp('Created_Date').defaultTo(knex.fn.now());
    t.string('Last_Updated_By', 50);
    t.timestamp('Last_Updated_Date').defaultTo(knex.fn.now());
    t.index(['Tenant_ID', 'Document_Type', 'Is_Active'], 'idx_template_lookup');
  });

  // ─── 2. tbl_customer_display_settings ─────────────────────────────────────
  await knex.schema.createTable('tbl_customer_display_settings', (t) => {
    t.bigIncrements('Setting_ID').primary();
    t.string('Tenant_ID', 20).notNullable().references('Tenant_ID').inTable('tbl_tenant_master').onDelete('CASCADE');
    t.string('Branch_ID', 20).references('Branch_ID').inTable('tbl_branch_master').onDelete('SET NULL');
    t.boolean('Display_Logo').defaultTo(true);
    t.string('Logo_URL', 500);
    t.boolean('Show_Item_Image').defaultTo(true);
    t.boolean('Show_Gold_Rate_Live').defaultTo(true);
    t.boolean('Show_Customer_Name').defaultTo(true);
    t.boolean('Show_Customer_Photo').defaultTo(false);
    t.boolean('Show_Cost_Price').defaultTo(false);
    t.boolean('Show_Making_Charge_Individual').defaultTo(true);
    t.boolean('Show_Total_Weight_Only').defaultTo(false);
    t.boolean('Show_Discount_Line').defaultTo(true);
    t.boolean('Show_QR_Code').defaultTo(true);
    t.boolean('Show_UPI_QR').defaultTo(true);
    t.string('Background_Color', 7).defaultTo('#1A1A1A');
    t.string('Text_Color', 7).defaultTo('#FFFFFF');
    t.string('Accent_Color', 7).defaultTo('#FFD700');
    t.decimal('Font_Scale_Factor', 3, 2).defaultTo(1.00);
    t.string('Font_Family', 50).defaultTo('Arial');
    t.string('Header_Message', 200).defaultTo('Welcome');
    t.string('Footer_Message', 200).defaultTo('100% BIS Hallmarked Gold');
    t.integer('Auto_Clear_After_Seconds').defaultTo(10);
    t.integer('Auto_Refresh_Interval').defaultTo(1);
    t.boolean('Show_Slideshow_When_Idle').defaultTo(true);
    t.jsonb('Slideshow_Image_URLs');
    t.integer('Slideshow_Interval').defaultTo(5);
    t.boolean('Is_Keyboard_Blocked').defaultTo(true);
    t.boolean('Is_Mouse_Blocked').defaultTo(true);
    t.boolean('Is_Print_Blocked').defaultTo(true);
    t.integer('Screen_Resolution_Width').defaultTo(1920);
    t.integer('Screen_Resolution_Height').defaultTo(1080);
    t.boolean('Is_Fullscreen').defaultTo(true);
    t.string('Created_By', 50);
    t.timestamp('Created_Date').defaultTo(knex.fn.now());
    t.string('Last_Updated_By', 50);
    t.timestamp('Last_Updated_Date').defaultTo(knex.fn.now());
  });

  // ─── 3. tbl_audit_log ─────────────────────────────────────────────────────
  await knex.schema.createTable('tbl_audit_log', (t) => {
    t.bigIncrements('Log_ID').primary();
    t.string('Tenant_ID', 20);
    t.integer('User_ID');
    t.string('Table_Name', 50);
    t.string('Record_ID', 50);
    t.string('Action_Type', 20);
    t.jsonb('Old_Data');
    t.jsonb('New_Data');
    t.string('IP_Address', 50);
    t.string('Browser_Info', 200);
    t.timestamp('Action_Timestamp').defaultTo(knex.fn.now());
    t.index(['Tenant_ID'], 'idx_audit_tenant');
    t.index(['Action_Timestamp'], 'idx_audit_ts');
  });

  // ─── 4. tbl_session_master ────────────────────────────────────────────────
  await knex.schema.createTable('tbl_session_master', (t) => {
    t.string('Session_ID', 50).primary();
    t.string('Tenant_ID', 20).notNullable();
    t.integer('User_ID').references('User_ID').inTable('tbl_user_master').onDelete('CASCADE');
    t.string('Branch_ID', 20);
    t.bigInteger('Current_Active_Cart_ID');
    t.boolean('Is_Customer_Screen_Open').defaultTo(false);
    t.string('Customer_Screen_Session_ID', 50);
    t.timestamp('Session_Start').defaultTo(knex.fn.now());
    t.timestamp('Last_Activity').defaultTo(knex.fn.now());
    t.timestamp('Session_End');
    t.boolean('Is_Active').defaultTo(true);
    t.string('IP_Address', 50);
    t.text('Device_Info');
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('tbl_session_master');
  await knex.schema.dropTableIfExists('tbl_audit_log');
  await knex.schema.dropTableIfExists('tbl_customer_display_settings');
  await knex.schema.dropTableIfExists('tbl_invoice_template_master');
};
