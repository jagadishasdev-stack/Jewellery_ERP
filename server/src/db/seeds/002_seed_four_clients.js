/**
 * Seed 002 — 4 Demo Client Tenants with full data
 * Clients:
 *   1. TULASI_BLR — Tulasi Honesty Jewels, Bangalore
 *   2. SRINIV_HYD — Srinivasa Jewellers, Hyderabad
 *   3. VKMANI_CHN — VK Mani Jewellers, Chennai
 *   4. DHANA_MYS  — Dhanalakshmi Jewels, Mysore
 */
const bcrypt = require('bcryptjs');

exports.seed = async function (knex) {
  console.log('🌱 Seeding 4 demo client tenants...');

  const clients = [
    {
      tenant: {
        Tenant_ID: 'TULASI_BLR',
        Company_Name: 'Tulasi Honesty Jewels',
        Brand_Code: 'TULASI',
        License_Key: 'TULASI-2026-PRO-A1B2',
        GST_No: '29AABCT1234D1Z1',
        PAN_No: 'AABCT1234D',
        Address_Line1: '45 Commercial Street',
        City: 'Bangalore',
        State: 'Karnataka',
        Pincode: '560001',
        Phone: '9876543210',
        Email: 'info@tulasijewels.com',
        License_Expiry_Date: new Date('2027-12-31'),
        Max_Users: 10,
        Max_Branches: 3,
      },
      branch: { Branch_ID: 'TULASI_BLR_001', Branch_Code: '001', Branch_Name: 'Commercial Street Branch', City: 'Bangalore', Is_Head_Office: true },
      adminUser: { Username: 'tulasiadmin', Password: 'Tulasi@2026', Full_Name: 'Tulasi Admin' },
      floors: [
        { Floor_Code: 'GF', Floor_Name: 'Ground Floor — Gold Section', Floor_Number: 0 },
        { Floor_Code: 'FF', Floor_Name: 'First Floor — Diamond Section', Floor_Number: 1 },
        { Floor_Code: 'SF', Floor_Name: 'Second Floor — Silver & Bridal', Floor_Number: 2 },
      ],
    },
    {
      tenant: {
        Tenant_ID: 'SRINIV_HYD',
        Company_Name: 'Srinivasa Jewellers',
        Brand_Code: 'SRINIV',
        License_Key: 'SRINIV-2026-PRO-C3D4',
        GST_No: '36AABCS5678E1Z2',
        PAN_No: 'AABCS5678E',
        Address_Line1: '12 Abids Road',
        City: 'Hyderabad',
        State: 'Telangana',
        Pincode: '500001',
        Phone: '9123456789',
        Email: 'contact@srinivasajewels.com',
        License_Expiry_Date: new Date('2027-12-31'),
        Max_Users: 8,
        Max_Branches: 2,
      },
      branch: { Branch_ID: 'SRINIV_HYD_001', Branch_Code: '001', Branch_Name: 'Abids Main Branch', City: 'Hyderabad', Is_Head_Office: true },
      adminUser: { Username: 'srinivadmin', Password: 'Sriniva@2026', Full_Name: 'Srinivasa Admin' },
      floors: [
        { Floor_Code: 'GF', Floor_Name: 'Ground Floor — Gold Jewellery', Floor_Number: 0 },
        { Floor_Code: 'FF', Floor_Name: 'First Floor — Silver & Coins', Floor_Number: 1 },
      ],
    },
    {
      tenant: {
        Tenant_ID: 'VKMANI_CHN',
        Company_Name: 'VK Mani Jewellers',
        Brand_Code: 'VKMANI',
        License_Key: 'VKMANI-2026-PRO-E5F6',
        GST_No: '33AABCV9012F1Z3',
        PAN_No: 'AABCV9012F',
        Address_Line1: '88 Pondy Bazaar',
        City: 'Chennai',
        State: 'Tamil Nadu',
        Pincode: '600017',
        Phone: '9988776655',
        Email: 'vkmani@jewels.com',
        License_Expiry_Date: new Date('2027-06-30'),
        Max_Users: 6,
        Max_Branches: 2,
      },
      branch: { Branch_ID: 'VKMANI_CHN_001', Branch_Code: '001', Branch_Name: 'Pondy Bazaar Branch', City: 'Chennai', Is_Head_Office: true },
      adminUser: { Username: 'vkmaniadmin', Password: 'VKMani@2026', Full_Name: 'VK Mani Admin' },
      floors: [
        { Floor_Code: 'GF', Floor_Name: 'Ground Floor — Gold & Diamond', Floor_Number: 0 },
        { Floor_Code: 'FF', Floor_Name: 'First Floor — Silver & Gifts', Floor_Number: 1 },
      ],
    },
    {
      tenant: {
        Tenant_ID: 'DHANA_MYS',
        Company_Name: 'Dhanalakshmi Jewels',
        Brand_Code: 'DHANA',
        License_Key: 'DHANA-2026-STR-G7H8',
        GST_No: '29AABCD3456G1Z4',
        PAN_No: 'AABCD3456G',
        Address_Line1: '22 Sayyaji Rao Road',
        City: 'Mysore',
        State: 'Karnataka',
        Pincode: '570001',
        Phone: '9876001234',
        Email: 'dhanalakshmi@jewels.com',
        License_Expiry_Date: new Date('2026-12-31'),
        Max_Users: 5,
        Max_Branches: 1,
      },
      branch: { Branch_ID: 'DHANA_MYS_001', Branch_Code: '001', Branch_Name: 'Sayyaji Rao Branch', City: 'Mysore', Is_Head_Office: true },
      adminUser: { Username: 'dhanaadmin', Password: 'Dhana@2026', Full_Name: 'Dhanalakshmi Admin' },
      floors: [
        { Floor_Code: 'GF', Floor_Name: 'Ground Floor — Gold & Silver', Floor_Number: 0 },
      ],
    },
  ];

  const clientAdminRole = await knex('tbl_role_master').where({ Role_Name: 'Client Admin' }).first();
  const billingRole = await knex('tbl_role_master').where({ Role_Name: 'Billing Operator' }).first();

  for (const client of clients) {
    const { tenant, branch, adminUser, floors } = client;
    const tenantId = tenant.Tenant_ID;

    // ── Clean existing data ──────────────────────────────────────────────────
    await knex('tbl_scheme_installments').whereIn('Enrollment_ID',
      knex('tbl_saving_scheme_enrollment').where('Tenant_ID', tenantId).select('Enrollment_ID')).del();
    await knex('tbl_saving_scheme_enrollment').where('Tenant_ID', tenantId).del();
    await knex('tbl_saving_scheme_master').where('Tenant_ID', tenantId).del();
    await knex('tbl_repair_orders').where('Tenant_ID', tenantId).del();
    await knex('tbl_stock_transfer_items').whereIn('Transfer_ID',
      knex('tbl_stock_transfer').where('Tenant_ID', tenantId).select('Transfer_ID')).del();
    await knex('tbl_stock_transfer').where('Tenant_ID', tenantId).del();
    await knex('tbl_counter_master').where('Tenant_ID', tenantId).del();
    await knex('tbl_floor_master').where('Tenant_ID', tenantId).del();
    await knex('tbl_invoice_template_master').where('Tenant_ID', tenantId).del();
    await knex('tbl_customer_display_settings').where('Tenant_ID', tenantId).del();
    await knex('tbl_sales_details').whereIn('Sale_ID',
      knex('tbl_sales_header').where('Tenant_ID', tenantId).select('Sale_ID')).del();
    await knex('tbl_sales_header').where('Tenant_ID', tenantId).del();
    await knex('tbl_purchase_details').whereIn('Purchase_ID',
      knex('tbl_purchase_header').where('Tenant_ID', tenantId).select('Purchase_ID')).del();
    await knex('tbl_purchase_header').where('Tenant_ID', tenantId).del();
    await knex('tbl_return_from_karigar').where('Tenant_ID', tenantId).del();
    await knex('tbl_issue_to_karigar').where('Tenant_ID', tenantId).del();
    await knex('tbl_ornament_master').where('Tenant_ID', tenantId).del();
    await knex('tbl_vendor_master').where('Tenant_ID', tenantId).del();
    await knex('tbl_customer_master').where('Tenant_ID', tenantId).del();
    await knex('tbl_user_master').where('Tenant_ID', tenantId).del();
    await knex('tbl_license_master').where('Tenant_ID', tenantId).del();
    await knex('tbl_branch_master').where('Tenant_ID', tenantId).del();
    await knex('tbl_tenant_master').where('Tenant_ID', tenantId).del();

    // ── Tenant ───────────────────────────────────────────────────────────────
    await knex('tbl_tenant_master').insert({ ...tenant, Is_Active: true, Country: 'India', Created_By: 'seed' });

    // ── Branch ───────────────────────────────────────────────────────────────
    await knex('tbl_branch_master').insert({ ...branch, Tenant_ID: tenantId });

    // ── License ──────────────────────────────────────────────────────────────
    await knex('tbl_license_master').insert({
      License_Key: tenant.License_Key,
      Tenant_ID: tenantId,
      License_Type: 'Yearly',
      Issued_Date: new Date('2026-01-01'),
      Expiry_Date: tenant.License_Expiry_Date,
      Max_Users: tenant.Max_Users,
      Max_Branches: tenant.Max_Branches,
      Is_Active: true,
      Created_By: 'seed',
    });

    // ── Admin User ────────────────────────────────────────────────────────────
    const salt = await bcrypt.genSalt(12);
    const hash = await bcrypt.hash(adminUser.Password, salt);
    await knex('tbl_user_master').insert({
      Tenant_ID: tenantId,
      Username: adminUser.Username,
      Password_Hash: hash,
      Password_Salt: salt,
      Role_ID: clientAdminRole.Role_ID,
      Full_Name: adminUser.Full_Name,
      Is_Active: true, Is_Admin: true,
      Created_By: 'seed',
    });

    // ── Billing User ──────────────────────────────────────────────────────────
    const salt2 = await bcrypt.genSalt(12);
    const hash2 = await bcrypt.hash('Billing@2026', salt2);
    await knex('tbl_user_master').insert({
      Tenant_ID: tenantId,
      Username: `${tenantId.toLowerCase().replace('_','')}_billing`,
      Password_Hash: hash2,
      Password_Salt: salt2,
      Role_ID: billingRole.Role_ID,
      Full_Name: `${tenant.Company_Name} — Billing`,
      Is_Active: true,
      Created_By: 'seed',
    });

    // ── Floors ────────────────────────────────────────────────────────────────
    const floorIds = {};
    for (const f of floors) {
      const [floor] = await knex('tbl_floor_master').insert({
        Tenant_ID: tenantId, Branch_ID: branch.Branch_ID,
        Floor_Code: f.Floor_Code, Floor_Name: f.Floor_Name,
        Floor_Number: f.Floor_Number, Is_Active: true, Created_By: 'seed',
      }).returning('*');
      floorIds[f.Floor_Code] = floor.Floor_ID;

      // Counter per floor
      await knex('tbl_counter_master').insert([
        { Tenant_ID: tenantId, Branch_ID: branch.Branch_ID, Floor_ID: floor.Floor_ID, Counter_Code: 'CTR-A', Counter_Name: 'Counter A', Counter_Type: 'Showcase', Created_By: 'seed' },
        { Tenant_ID: tenantId, Branch_ID: branch.Branch_ID, Floor_ID: floor.Floor_ID, Counter_Code: 'CTR-B', Counter_Name: 'Counter B', Counter_Type: 'Tray', Created_By: 'seed' },
      ]);
    }

    // ── Vendors (1 Supplier + 1 Karigar) ─────────────────────────────────────
    const vendorPrefix = tenantId.replace('_','').toUpperCase();
    await knex('tbl_vendor_master').insert([
      {
        Tenant_ID: tenantId, Vendor_Type: 'Supplier',
        Vendor_Code: `${vendorPrefix}-SUP-001`,
        Vendor_Name: `${tenant.Company_Name} Gold Supplier`,
        Mobile_1: '9000000001', City: tenant.City,
        Bank_Name: 'HDFC Bank', Opening_Balance: 0,
      },
      {
        Tenant_ID: tenantId, Vendor_Type: 'Karigar',
        Vendor_Code: `${vendorPrefix}-KAR-001`,
        Vendor_Name: `Raju Karigar — ${tenant.City}`,
        Mobile_1: '9000000002', Karigar_Skill: 'Gold',
        Karigar_Wastage_Allowed_Percent: 3.0,
        Opening_Balance: 0,
      },
    ]);

    // ── Customers (3 per tenant) ──────────────────────────────────────────────
    const custPrefix = `CUST-${tenantId.replace('_','')}`;
    await knex('tbl_customer_master').insert([
      {
        Tenant_ID: tenantId, Customer_Code: `${custPrefix}-001`,
        Customer_Name: 'Priya Sharma', Mobile_1: `98765${tenantId.charCodeAt(0)}0001`,
        Date_Of_Birth: '1990-04-15', Anniversary_Date: '2015-11-20',
        City: tenant.City, Income_Group: 'High', Is_Wholesale: false,
        Loyalty_Points: 250, Total_Purchase_Value: 125000,
      },
      {
        Tenant_ID: tenantId, Customer_Code: `${custPrefix}-002`,
        Customer_Name: 'Ramesh Kumar', Mobile_1: `98765${tenantId.charCodeAt(0)}0002`,
        Date_Of_Birth: '1985-08-22',
        City: tenant.City, Income_Group: 'Medium', Is_Wholesale: false,
        Loyalty_Points: 80, Total_Purchase_Value: 45000,
      },
      {
        Tenant_ID: tenantId, Customer_Code: `${custPrefix}-003`,
        Customer_Name: 'Anitha Gold Traders', Mobile_1: `98765${tenantId.charCodeAt(0)}0003`,
        City: tenant.City, Income_Group: 'High', Is_Wholesale: true,
        GST_No: '29AABCA0001A1Z5',
      },
    ]);

    // ── Gold Stock (5 Gold + 3 Silver per tenant) ─────────────────────────────
    const types = await knex('tbl_item_type_master').select('Type_ID','Type_Code','Category');
    const purities = await knex('tbl_purity_master').select('Purity_ID','Purity_Code');
    const p22k = purities.find(p => p.Purity_Code === '22K');
    const p18k = purities.find(p => p.Purity_Code === '18K');
    const pSilver = purities.find(p => p.Purity_Code === 'SIL925');
    const goldRate = 6200;
    const silverRate = 82;

    const goldItems = [
      { code: 'NECK', weight: 25.500, stone: 0.700, rate: goldRate, making: 250, purity: p22k, loc: 'GF-CTR-A-R01', price_mult: 1.0 },
      { code: 'RING', weight: 5.200,  stone: 0.300, rate: goldRate, making: 200, purity: p22k, loc: 'GF-CTR-A-R02', price_mult: 1.0 },
      { code: 'BANG', weight: 18.000, stone: 0,     rate: goldRate, making: 180, purity: p22k, loc: 'GF-CTR-B-R01', price_mult: 1.0 },
      { code: 'CHAIN',weight: 12.500, stone: 0,     rate: goldRate, making: 150, purity: p22k, loc: 'GF-CTR-B-R02', price_mult: 1.0 },
      { code: 'DIAM_RING', weight: 8.000, stone: 1.500, rate: goldRate, making: 500, purity: p18k, loc: 'FF-CTR-A-R01', price_mult: 1.2 },
    ];

    const silverItems = [
      { code: 'SILV_RING', weight: 15.000, stone: 0, rate: silverRate, making: 50, purity: pSilver, loc: 'SF-CTR-A-R01', price_mult: 1.0 },
      { code: 'ANKLET',    weight: 30.000, stone: 0, rate: silverRate, making: 60, purity: pSilver, loc: 'SF-CTR-A-R02', price_mult: 1.0 },
      { code: 'BRAC',      weight: 20.000, stone: 0, rate: silverRate, making: 55, purity: pSilver, loc: 'SF-CTR-B-R01', price_mult: 1.0 },
    ];

    const allItems = [...goldItems, ...silverItems];
    const idx = { TULASI_BLR: 1, SRINIV_HYD: 2, VKMANI_CHN: 3, DHANA_MYS: 4 }[tenantId] || 1;
    let seq = idx * 100;

    for (const item of allItems) {
      const typeObj = types.find(t => t.Type_Code === item.code);
      if (!typeObj || !item.purity) continue;
      seq++;
      const metalPrefix = item.purity.Purity_Code === 'SIL925' ? 'SLV' : 'GLD';
      const articleNumber = `${metalPrefix}-${tenantId.replace('_','')}-${String(seq).padStart(6,'0')}`;
      const netWeight = parseFloat(item.weight) - parseFloat(item.stone);
      const goldValue = netWeight * item.rate;
      const makingTotal = netWeight * item.making;
      const wastageAmt = (netWeight * 3 / 100) * item.rate;
      const taxable = goldValue + makingTotal + wastageAmt;
      const gst = taxable * 0.03;
      const total = taxable + gst;
      const purchaseCost = total * 0.85;

      await knex('tbl_ornament_master').insert({
        Tenant_ID: tenantId,
        Branch_ID: branch.Branch_ID,
        Article_Number: articleNumber,
        Type_ID: typeObj.Type_ID,
        Purity_ID: item.purity.Purity_ID,
        Metal_Type: metalPrefix === 'SLV' ? 'Silver' : 'Gold',
        Gross_Weight: item.weight,
        Net_Gold_Weight: netWeight,
        Stone_Weight: item.stone,
        Wastage_Weight: parseFloat((netWeight * 0.03).toFixed(3)),
        Current_Gold_Rate: item.rate,
        Base_Making_Charge_Per_Gram: item.making,
        Final_Making_Charge_Total: makingTotal,
        Wastage_Percentage: 3.0,
        Wastage_Amount: wastageAmt,
        Taxable_Value: taxable,
        GST_Amount: gst,
        Total_Price: total,
        Purchase_Cost: purchaseCost,
        Physical_Location: item.loc,
        Is_Active: true,
        Is_Stock_Available: true,
        Is_Sold: false,
        Created_By: 'seed',
      });
    }

    // ── Saving Scheme ─────────────────────────────────────────────────────────
    await knex('tbl_saving_scheme_master').insert({
      Tenant_ID: tenantId,
      Scheme_Code: 'GS-11-1',
      Scheme_Name: 'Gold Savings 11+1 Plan',
      Metal_Type: 'Gold',
      Duration_Months: 11,
      Free_Months: 1,
      Monthly_Amount: 5000,
      Bonus_Percent: 0,
      Terms: 'Pay 11 monthly installments of ₹5,000. Get 1 month free. Total maturity: ₹60,000. Redeemable against jewellery purchase.',
      Is_Active: true,
      Created_By: 'seed',
    });

    // ── Invoice Template ──────────────────────────────────────────────────────
    await knex('tbl_invoice_template_master').insert({
      Tenant_ID: tenantId,
      Document_Type: 'SALES',
      Template_Name: `${tenant.Company_Name} — Sales Invoice`,
      Is_Active: true, Is_Default: true,
      Paper_Size: 'A4', Primary_Color: '#B8860B',
      Header_Text: JSON.stringify({ line1: tenant.Company_Name, line2: `${tenant.City} | Since 2010` }),
      Footer_Text: JSON.stringify({ terms: 'Goods once sold cannot be returned. 100% BIS Hallmarked Gold. E.& O.E.' }),
      Show_GST_Breakdown: true, Show_Hallmark_Number: true,
      Created_By: 'seed',
    });

    // ── Customer Display Settings ──────────────────────────────────────────────
    await knex('tbl_customer_display_settings').insert({
      Tenant_ID: tenantId,
      Header_Message: `Welcome to ${tenant.Company_Name}`,
      Footer_Message: '100% BIS Hallmarked Gold | Trusted Since 2010',
      Background_Color: '#1A1A1A', Accent_Color: '#FFD700',
      Show_Gold_Rate_Live: true, Show_Cost_Price: false,
      Created_By: 'seed',
    });

    console.log(`  ✅ ${tenantId} — ${tenant.Company_Name} seeded`);
  }

  console.log('\n📋 CLIENT LOGIN CREDENTIALS:');
  console.log('─'.repeat(60));
  console.log('TULASI_BLR  | tulasiadmin   | Tulasi@2026');
  console.log('SRINIV_HYD  | srinivadmin   | Sriniva@2026');
  console.log('VKMANI_CHN  | vkmaniadmin   | VKMani@2026');
  console.log('DHANA_MYS   | dhanaadmin    | Dhana@2026');
  console.log('─'.repeat(60));
  console.log('Billing user password for all: Billing@2026');
};
