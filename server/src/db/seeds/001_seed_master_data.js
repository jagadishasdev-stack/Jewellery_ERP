const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

exports.seed = async function (knex) {
  // ─── Roles ──────────────────────────────────────────────────────────────
  await knex('tbl_role_master').del();
  await knex('tbl_role_master').insert([
    {
      Role_Name: 'Super Admin',
      Role_Description: 'Full access across all tenants',
      Permissions: JSON.stringify({
        global_master: true, tenant_management: true, inventory: true,
        karigar_management: true, sales: true, accounts: true, audit: true,
        can_delete: true, can_edit: true, can_create: true,
        open_customer_display: true, edit_invoice_template: true,
      }),
    },
    {
      Role_Name: 'Client Admin',
      Role_Description: 'Full access within tenant',
      Permissions: JSON.stringify({
        global_master: false, tenant_management: true, inventory: true,
        karigar_management: true, sales: true, accounts: true, audit: true,
        can_delete: true, can_edit: true, can_create: true,
        open_customer_display: true, edit_invoice_template: true,
      }),
    },
    {
      Role_Name: 'Store Manager',
      Role_Description: 'Can manage inventory, sales, karigar',
      Permissions: JSON.stringify({
        global_master: false, tenant_management: false, inventory: true,
        karigar_management: true, sales: true, accounts: false, audit: false,
        can_delete: false, can_edit: true, can_create: true,
        open_customer_display: true, edit_invoice_template: false,
      }),
    },
    {
      Role_Name: 'Billing Operator',
      Role_Description: 'Can process sales, use dual screen',
      Permissions: JSON.stringify({
        global_master: false, tenant_management: false, inventory: false,
        karigar_management: false, sales: true, accounts: false, audit: false,
        can_delete: false, can_edit: false, can_create: true,
        open_customer_display: true, edit_invoice_template: false,
      }),
    },
    {
      Role_Name: 'Accounts',
      Role_Description: 'Can view reports, manage payments',
      Permissions: JSON.stringify({
        global_master: false, tenant_management: false, inventory: false,
        karigar_management: false, sales: false, accounts: true, audit: true,
        can_delete: false, can_edit: false, can_create: false,
        open_customer_display: false, edit_invoice_template: false,
      }),
    },
    {
      Role_Name: 'Karigar Manager',
      Role_Description: 'Can issue/return gold to karigars',
      Permissions: JSON.stringify({
        global_master: false, tenant_management: false, inventory: true,
        karigar_management: true, sales: false, accounts: false, audit: false,
        can_delete: false, can_edit: true, can_create: true,
        open_customer_display: false, edit_invoice_template: false,
      }),
    },
    {
      Role_Name: 'Inventory Manager',
      Role_Description: 'Can manage stock, purchase orders',
      Permissions: JSON.stringify({
        global_master: false, tenant_management: false, inventory: true,
        karigar_management: false, sales: false, accounts: false, audit: false,
        can_delete: false, can_edit: true, can_create: true,
        open_customer_display: false, edit_invoice_template: false,
      }),
    },
  ]);

  // ─── Purity ──────────────────────────────────────────────────────────────
  await knex('tbl_purity_master').del();
  await knex('tbl_purity_master').insert([
    { Purity_Code: '24K', Karat: 24.00, Percentage: 99.90, Description: '24 Karat Pure Gold', Hallmark_Standard: 'BIS 999', Metal_Type: 'Gold' },
    { Purity_Code: '22K', Karat: 22.00, Percentage: 91.67, Description: '22 Karat Gold (BIS 916)', Hallmark_Standard: 'BIS 916', Metal_Type: 'Gold' },
    { Purity_Code: '18K', Karat: 18.00, Percentage: 75.00, Description: '18 Karat Gold', Hallmark_Standard: 'BIS 750', Metal_Type: 'Gold' },
    { Purity_Code: '14K', Karat: 14.00, Percentage: 58.33, Description: '14 Karat Gold', Hallmark_Standard: 'BIS 585', Metal_Type: 'Gold' },
    { Purity_Code: 'SIL925', Karat: 0, Percentage: 92.50, Description: 'Sterling Silver', Hallmark_Standard: 'BIS 925', Metal_Type: 'Silver' },
  ]);

  // ─── Item Types ──────────────────────────────────────────────────────────
  await knex('tbl_item_type_master').del();
  await knex('tbl_item_type_master').insert([
    { Type_Code: 'RING', Type_Name: 'Ring', Category: 'Plain', Is_Gold: true, Default_Making_Charge: 200, Default_Wastage_Percent: 3, HSN_Code: '7113', GST_Percentage: 3 },
    { Type_Code: 'NECK', Type_Name: 'Necklace', Category: 'Plain', Is_Gold: true, Default_Making_Charge: 250, Default_Wastage_Percent: 4, HSN_Code: '7113', GST_Percentage: 3 },
    { Type_Code: 'CHAIN', Type_Name: 'Chain', Category: 'Plain', Is_Gold: true, Default_Making_Charge: 150, Default_Wastage_Percent: 2, HSN_Code: '7113', GST_Percentage: 3 },
    { Type_Code: 'EAR', Type_Name: 'Earring', Category: 'Plain', Is_Gold: true, Default_Making_Charge: 180, Default_Wastage_Percent: 3, HSN_Code: '7113', GST_Percentage: 3 },
    { Type_Code: 'BANG', Type_Name: 'Bangle', Category: 'Plain', Is_Gold: true, Default_Making_Charge: 200, Default_Wastage_Percent: 3, HSN_Code: '7113', GST_Percentage: 3 },
    { Type_Code: 'BRAC', Type_Name: 'Bracelet', Category: 'Plain', Is_Gold: true, Default_Making_Charge: 200, Default_Wastage_Percent: 3, HSN_Code: '7113', GST_Percentage: 3 },
    { Type_Code: 'PEND', Type_Name: 'Pendant', Category: 'Studded', Is_Gold: true, Default_Making_Charge: 220, Default_Wastage_Percent: 3.5, HSN_Code: '7113', GST_Percentage: 3 },
    { Type_Code: 'DIAM_RING', Type_Name: 'Diamond Ring', Category: 'Diamond', Is_Gold: true, Default_Making_Charge: 500, Default_Wastage_Percent: 2, HSN_Code: '7113', GST_Percentage: 3 },
    { Type_Code: 'SILV_RING', Type_Name: 'Silver Ring', Category: 'Plain', Is_Gold: false, Is_Silver: true, Default_Making_Charge: 50, Default_Wastage_Percent: 2, HSN_Code: '7113', GST_Percentage: 3 },
    { Type_Code: 'ANKLET', Type_Name: 'Anklet', Category: 'Plain', Is_Gold: false, Is_Silver: true, Default_Making_Charge: 60, Default_Wastage_Percent: 2, HSN_Code: '7113', GST_Percentage: 3 },
  ]);

  // ─── Super Admin Tenant & User ────────────────────────────────────────────
  const superAdminPassword = process.env.SUPER_ADMIN_PASSWORD || 'SuperAdmin@2026';
  const salt = await bcrypt.genSalt(12);
  const hash = await bcrypt.hash(superAdminPassword, salt);
  const licenseKey = 'SA-MASTER-2026-PERPETUAL';
  const expiryDate = new Date('2099-12-31');

  // Delete in correct order due to FK constraints
  await knex('tbl_user_master').where('Tenant_ID', 'SA_MASTER').del();
  await knex('tbl_license_master').where('Tenant_ID', 'SA_MASTER').del();
  await knex('tbl_tenant_master').where('Tenant_ID', 'SA_MASTER').del();

  await knex('tbl_tenant_master').insert({
    Tenant_ID: 'SA_MASTER',
    Company_Name: 'Jewellery ERP - Super Admin',
    Brand_Code: 'SA',
    License_Key: licenseKey,
    Is_Active: true,
    License_Expiry_Date: expiryDate,
    Max_Users: 999,
    Max_Branches: 999,
    City: 'Bangalore',
    Country: 'India',
    Created_By: 'system',
  });

  await knex('tbl_branch_master').insert({
    Branch_ID: 'SA_MASTER_001',
    Tenant_ID: 'SA_MASTER',
    Branch_Name: 'Master Branch',
    Branch_Code: '001',
    Is_Head_Office: true,
    City: 'Bangalore',
  }).onConflict('Branch_ID').ignore();

  await knex('tbl_license_master').insert({
    License_Key: licenseKey,
    Tenant_ID: 'SA_MASTER',
    License_Type: 'Perpetual',
    Issued_Date: new Date(),
    Expiry_Date: expiryDate,
    Max_Users: 999,
    Max_Branches: 999,
    Is_Active: true,
    Created_By: 'system',
  });

  const superAdminRole = await knex('tbl_role_master').where({ Role_Name: 'Super Admin' }).first();

  await knex('tbl_user_master').insert({
    Tenant_ID: 'SA_MASTER',
    Username: process.env.SUPER_ADMIN_USERNAME || 'superadmin',
    Password_Hash: hash,
    Password_Salt: salt,
    Role_ID: superAdminRole.Role_ID,
    Full_Name: 'Super Administrator',
    Is_Active: true,
    Is_Admin: true,
    Created_By: 'system',
  });

  // ─── Global Invoice Templates ─────────────────────────────────────────────
  await knex('tbl_invoice_template_master').where({ Tenant_ID: null }).del();
  await knex('tbl_invoice_template_master').insert([
    {
      Tenant_ID: null, // Global
      Document_Type: 'SALES',
      Template_Name: 'Global Default Sales Invoice',
      Is_Active: true,
      Is_Default: true,
      Paper_Size: 'A4',
      Primary_Color: '#B8860B',
      Header_Text: JSON.stringify({ line1: 'Jewellery Shop', line2: 'Quality You Can Trust' }),
      Field_Visibility: JSON.stringify({ slNo: true, itemName: true, purity: true, grossWeight: true, makingCharge: true, discount: true, totalAmount: true }),
      Field_Order: JSON.stringify(['slNo', 'itemName', 'purity', 'grossWeight', 'makingCharge', 'discount', 'totalAmount']),
      Field_Labels: JSON.stringify({ grossWeight: 'Gross Wt (g)', makingCharge: 'M/C (₹)' }),
      Footer_Text: JSON.stringify({ terms: 'Goods once sold cannot be returned. E.& O.E.' }),
      Created_By: 'system',
    },
    {
      Tenant_ID: null,
      Document_Type: 'KARIGAR_ISSUE',
      Template_Name: 'Global Karigar Issue Receipt',
      Is_Active: true,
      Is_Default: true,
      Paper_Size: 'A4',
      Primary_Color: '#B8860B',
      Show_Karigar_Details: true,
      Created_By: 'system',
    },
    {
      Tenant_ID: null,
      Document_Type: 'KARIGAR_SETTLEMENT',
      Template_Name: 'Global Karigar Settlement Bill',
      Is_Active: true,
      Is_Default: true,
      Paper_Size: 'A4',
      Show_Karigar_Details: true,
      Show_Wastage_Column: true,
      Created_By: 'system',
    },
  ]);

  console.log('✅ Seed data inserted successfully');
  console.log('👤 Super Admin login: superadmin / SuperAdmin@2026');
};
