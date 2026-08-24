/**
 * Seed 003 — Real example data for TULASI_BLR
 * Adds: 3 purchase bills, 2 karigar issues with returns, 2 completed sales
 * So reports are populated and visible
 */
exports.seed = async function (knex) {
  const tenantId = 'TULASI_BLR';
  const today = new Date();
  const fmt = (d) => d.toISOString().split('T')[0];

  // ── Get references ──────────────────────────────────────────────────────────
  const supplier = await knex('tbl_vendor_master')
    .where({ Tenant_ID: tenantId, Vendor_Type: 'Supplier' }).first();
  const karigar = await knex('tbl_vendor_master')
    .where({ Tenant_ID: tenantId, Vendor_Type: 'Karigar' }).first();
  const customer1 = await knex('tbl_customer_master')
    .where({ Tenant_ID: tenantId, Customer_Name: 'Priya Sharma' }).first();
  const customer2 = await knex('tbl_customer_master')
    .where({ Tenant_ID: tenantId, Customer_Name: 'Ramesh Kumar' }).first();
  const branch = await knex('tbl_branch_master')
    .where({ Tenant_ID: tenantId }).first();
  const purity22k = await knex('tbl_purity_master').where('Purity_Code', '22K').first();
  const purity18k = await knex('tbl_purity_master').where('Purity_Code', '18K').first();
  const typeNeck = await knex('tbl_item_type_master').where('Type_Code', 'NECK').first();
  const typeRing = await knex('tbl_item_type_master').where('Type_Code', 'RING').first();
  const typeBang = await knex('tbl_item_type_master').where('Type_Code', 'BANG').first();

  // ── Clean old example data ──────────────────────────────────────────────────
  await knex('tbl_purchase_details').whereIn('Purchase_ID',
    knex('tbl_purchase_header').where('Tenant_ID', tenantId).select('Purchase_ID')).del();
  await knex('tbl_purchase_header').where('Tenant_ID', tenantId).del();
  await knex('tbl_return_from_karigar').where('Tenant_ID', tenantId).del();
  await knex('tbl_issue_to_karigar').where('Tenant_ID', tenantId).del();
  // Also clean sales created by this seed
  await knex('tbl_sales_details').whereIn('Sale_ID',
    knex('tbl_sales_header').where('Tenant_ID', tenantId)
      .whereIn('Invoice_Number', ['INV-TULASIBLR-20260615-0001','INV-TULASIBLR-20260620-0001'])
      .select('Sale_ID')).del();
  await knex('tbl_old_gold_exchange').where('Tenant_ID', tenantId).del();
  await knex('tbl_sales_header').where('Tenant_ID', tenantId)
    .whereIn('Invoice_Number', ['INV-TULASIBLR-20260615-0001','INV-TULASIBLR-20260620-0001']).del();
  // Reset ornaments sold flag so they can be re-sold in seed
  await knex('tbl_ornament_master').where('Tenant_ID', tenantId)
    .update({ Is_Sold: false, Is_Stock_Available: true });

  // ─────────────────────────────────────────────────────────────────────────────
  // PURCHASE BILLS (3 bills from supplier)
  // ─────────────────────────────────────────────────────────────────────────────
  const purchases = [
    {
      Purchase_Number: `PUR-TULASIBLR-20260601-0001`,
      Purchase_Date: new Date('2026-06-01'),
      Supplier_Invoice_No: 'ABCGOLD-INV-4501',
      Purchase_Type: 'Stock',
      Subtotal_Amount: 500000,
      GST_Amount: 15000,
      Total_Amount: 515000,
      Amount_Paid: 515000,
      Balance_Amount: 0,
      Payment_Status: 'Paid',
      Payment_Mode: 'Bank Transfer',
      Status: 'Approved',
      Notes: 'June opening stock — 10 gold pieces',
    },
    {
      Purchase_Number: `PUR-TULASIBLR-20260610-0001`,
      Purchase_Date: new Date('2026-06-10'),
      Supplier_Invoice_No: 'ABCGOLD-INV-4567',
      Purchase_Type: 'Stock',
      Subtotal_Amount: 325000,
      GST_Amount: 9750,
      Total_Amount: 334750,
      Amount_Paid: 200000,
      Balance_Amount: 134750,
      Payment_Status: 'Partial',
      Payment_Mode: 'Cash',
      Status: 'Approved',
      Notes: '5 gold rings + 3 chains — partial payment',
    },
    {
      Purchase_Number: `PUR-TULASIBLR-20260620-0001`,
      Purchase_Date: new Date('2026-06-20'),
      Supplier_Invoice_No: 'SILVHOUSE-7823',
      Purchase_Type: 'Stock',
      Subtotal_Amount: 18000,
      GST_Amount: 540,
      Total_Amount: 18540,
      Amount_Paid: 18540,
      Balance_Amount: 0,
      Payment_Status: 'Paid',
      Payment_Mode: 'UPI',
      Status: 'Approved',
      Notes: 'Silver anklets — 6 pieces',
    },
  ];

  for (const p of purchases) {
    const [purchase] = await knex('tbl_purchase_header').insert({
      Tenant_ID: tenantId,
      Branch_ID: branch.Branch_ID,
      Supplier_ID: supplier.Vendor_ID,
      Supplier_Name: supplier.Vendor_Name,
      ...p,
      Created_By: 'seed',
      Approved_By: 'tulasiadmin',
      Approved_Date: p.Purchase_Date,
    }).returning('*');

    // Add line items for first purchase
    if (p.Purchase_Number.includes('0601')) {
      await knex('tbl_purchase_details').insert([
        { Purchase_ID: purchase.Purchase_ID, Tenant_ID: tenantId, Item_Description: 'Gold Necklace 22K Traditional', Quantity: 3, Gross_Weight: 75.000, Stone_Weight: 2.100, Net_Weight: 72.900, Purity_Code: '22K', Gold_Rate: 6250, Making_Charge: 250, Purchase_Rate: 476062.50, Total_Line_Value: 476062.50, Created_By: 'seed' },
        { Purchase_ID: purchase.Purchase_ID, Tenant_ID: tenantId, Item_Description: 'Gold Bangle Set 22K', Quantity: 2, Gross_Weight: 36.000, Stone_Weight: 0, Net_Weight: 36.000, Purity_Code: '22K', Gold_Rate: 6250, Making_Charge: 200, Purchase_Rate: 234000, Total_Line_Value: 234000, Created_By: 'seed' },
      ]);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // KARIGAR ISSUES (2 issues with returns)
  // ─────────────────────────────────────────────────────────────────────────────
  const [issue1] = await knex('tbl_issue_to_karigar').insert({
    Tenant_ID: tenantId,
    Branch_ID: branch.Branch_ID,
    Karigar_ID: karigar.Vendor_ID,
    Issue_Number: 'ISS-TULASIBLR-20260601-0001',
    Issue_Date: '2026-06-01',
    Expected_Return_Date: '2026-06-15',
    Gold_Weight_Issued: 100.000,
    Purity_ID: purity22k.Purity_ID,
    Gold_Rate_At_Issue: 6250,
    Total_Value_Issued: 625000,
    Wastage_Allowed_Percent: 3.00,
    Karigar_Wages_Rate: 200,
    Estimated_Wages: 20000,
    Status: 'Completed',
    Return_Date: '2026-06-14',
    Returned_Weight: 97.200,
    Wastage_Used: 2.800,
    Missing_Weight: 0,
    Final_Wages_Paid: 19440,
    Remarks: 'Traditional necklace set — 3 pieces returned',
    Created_By: 'seed',
  }).returning('*');

  await knex('tbl_return_from_karigar').insert({
    Issue_ID: issue1.Issue_ID,
    Tenant_ID: tenantId,
    Return_Number: 'RET-TULASIBLR-20260614-0001',
    Return_Date: '2026-06-14',
    Gross_Weight_Returned: 97.200,
    Net_Gold_Weight: 97.200,
    Stone_Weight: 0,
    Wastage_Weight: 2.800,
    Wastage_Percentage_Applied: 2.80,
    Gold_Rate_At_Return: 6250,
    Total_Value_Returned: 607500,
    Quality_Check_Passed: true,
    Quality_Remarks: 'Excellent finish. All 3 necklaces passed QC.',
    Status: 'Received',
    Created_By: 'seed',
  });

  // Issue 2 — currently in progress
  await knex('tbl_issue_to_karigar').insert({
    Tenant_ID: tenantId,
    Branch_ID: branch.Branch_ID,
    Karigar_ID: karigar.Vendor_ID,
    Issue_Number: 'ISS-TULASIBLR-20260620-0001',
    Issue_Date: '2026-06-20',
    Expected_Return_Date: '2026-07-05',
    Gold_Weight_Issued: 75.000,
    Purity_ID: purity22k.Purity_ID,
    Gold_Rate_At_Issue: 6250,
    Total_Value_Issued: 468750,
    Wastage_Allowed_Percent: 3.00,
    Karigar_Wages_Rate: 200,
    Estimated_Wages: 15000,
    Status: 'Issued',
    Return_Date: null,
    Returned_Weight: 0,
    Wastage_Used: 0,
    Missing_Weight: 0,
    Remarks: 'Bangle set — 4 pieces in making',
    Created_By: 'seed',
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // SALES (2 completed sales to populate reports)
  // ─────────────────────────────────────────────────────────────────────────────
  // Get available ornaments
  const ornaments = await knex('tbl_ornament_master')
    .where({ Tenant_ID: tenantId, Is_Sold: false, Is_Active: true })
    .orderBy('Total_Price', 'asc')
    .limit(3);

  if (ornaments.length >= 2) {
    // Sale 1 — Priya buys necklace, pays cash
    const sale1Amount = parseFloat(ornaments[0].Total_Price);
    const sale1GST = parseFloat(ornaments[0].GST_Amount);
    const [sale1] = await knex('tbl_sales_header').insert({
      Tenant_ID: tenantId,
      Branch_ID: branch.Branch_ID,
      Invoice_Number: 'INV-TULASIBLR-20260615-0001',
      Sale_Date: new Date('2026-06-15T11:30:00'),
      Customer_ID: customer1.Customer_ID,
      Customer_Name: customer1.Customer_Name,
      Customer_Mobile: customer1.Mobile_1,
      Total_Gross_Weight: parseFloat(ornaments[0].Gross_Weight),
      Total_Net_Gold_Weight: parseFloat(ornaments[0].Net_Gold_Weight),
      Subtotal_Amount: parseFloat(ornaments[0].Taxable_Value),
      GST_Amount: sale1GST,
      GST_Percentage: 3,
      Net_Payable_Amount: sale1Amount,
      Payment_Mode: 'Cash',
      Payment_Status: 'Paid',
      Amount_Paid: sale1Amount,
      Balance_Amount: 0,
      Sale_Type: 'Retail',
      Invoice_Type: 'Tax Invoice',
      Counter_Name: 'Counter A',
      Operator_Name: 'tulasiadmin',
      Created_By: 'tulasiadmin',
    }).returning('*');

    await knex('tbl_sales_details').insert({
      Sale_ID: sale1.Sale_ID,
      Tenant_ID: tenantId,
      Ornament_ID: ornaments[0].Ornament_ID,
      Article_Number: ornaments[0].Article_Number,
      Item_Type_Name: 'Silver Ring',
      Quantity: 1,
      Gross_Weight: ornaments[0].Gross_Weight,
      Net_Gold_Weight: ornaments[0].Net_Gold_Weight,
      Stone_Weight: ornaments[0].Stone_Weight || 0,
      Purity_Code: 'SIL925',
      Gold_Rate_Per_Gram: ornaments[0].Current_Gold_Rate,
      Making_Charge_Applied: ornaments[0].Final_Making_Charge_Total,
      Taxable_Value: ornaments[0].Taxable_Value,
      GST_Percentage_Applied: 3,
      GST_Amount: ornaments[0].GST_Amount,
      Total_Line_Price: ornaments[0].Total_Price,
      Serial_No: 1,
      Created_By: 'tulasiadmin',
    });

    await knex('tbl_ornament_master').where('Ornament_ID', ornaments[0].Ornament_ID)
      .update({ Is_Sold: true, Is_Stock_Available: false, Last_Updated_By: 'seed' });

    await knex('tbl_customer_master').where('Customer_ID', customer1.Customer_ID)
      .update({
        Total_Purchase_Value: knex.raw('"Total_Purchase_Value" + ?', [sale1Amount]),
        Total_Purchase_Count: knex.raw('"Total_Purchase_Count" + 1'),
        Last_Purchase_Date: '2026-06-15',
        Loyalty_Points: knex.raw('"Loyalty_Points" + ?', [Math.floor(sale1Amount / 1000)]),
      });

    // Sale 2 — Ramesh buys ring via UPI + old gold exchange
    const sale2Item = ornaments[1];
    const sale2Amount = parseFloat(sale2Item.Total_Price);
    const oldGoldValue = 1500;  // ₹1,500 — realistic for 15g silver
    const netPayable = sale2Amount - oldGoldValue;

    const [sale2] = await knex('tbl_sales_header').insert({
      Tenant_ID: tenantId,
      Branch_ID: branch.Branch_ID,
      Invoice_Number: 'INV-TULASIBLR-20260620-0001',
      Sale_Date: new Date('2026-06-20T14:15:00'),
      Customer_ID: customer2.Customer_ID,
      Customer_Name: customer2.Customer_Name,
      Customer_Mobile: customer2.Mobile_1,
      Total_Gross_Weight: parseFloat(sale2Item.Gross_Weight),
      Total_Net_Gold_Weight: parseFloat(sale2Item.Net_Gold_Weight),
      Subtotal_Amount: parseFloat(sale2Item.Taxable_Value),
      GST_Amount: parseFloat(sale2Item.GST_Amount),
      GST_Percentage: 3,
      Net_Payable_Amount: netPayable,
      Old_Gold_Exchange_Amount: oldGoldValue,
      Old_Gold_Weight: 2.400,
      Is_Exchange: true,
      Payment_Mode: 'UPI',
      Payment_Reference: 'UPI-TXN-98765',
      Payment_Status: 'Paid',
      Amount_Paid: netPayable,
      Balance_Amount: 0,
      Sale_Type: 'Retail',
      Invoice_Type: 'Tax Invoice',
      Counter_Name: 'Counter B',
      Operator_Name: 'tulasiadmin',
      Notes: 'Old gold chain 2.4g @ 22K exchanged',
      Created_By: 'tulasiadmin',
    }).returning('*');

    await knex('tbl_sales_details').insert({
      Sale_ID: sale2.Sale_ID,
      Tenant_ID: tenantId,
      Ornament_ID: sale2Item.Ornament_ID,
      Article_Number: sale2Item.Article_Number,
      Item_Type_Name: 'Silver Anklet',
      Quantity: 1,
      Gross_Weight: sale2Item.Gross_Weight,
      Net_Gold_Weight: sale2Item.Net_Gold_Weight,
      Stone_Weight: 0,
      Purity_Code: 'SIL925',
      Gold_Rate_Per_Gram: sale2Item.Current_Gold_Rate,
      Making_Charge_Applied: sale2Item.Final_Making_Charge_Total,
      Taxable_Value: sale2Item.Taxable_Value,
      GST_Percentage_Applied: 3,
      GST_Amount: sale2Item.GST_Amount,
      Total_Line_Price: sale2Item.Total_Price,
      Serial_No: 1,
      Created_By: 'tulasiadmin',
    });

    // Old gold exchange record
    await knex('tbl_old_gold_exchange').insert({
      Sale_ID: sale2.Sale_ID,
      Tenant_ID: tenantId,
      Customer_ID: customer2.Customer_ID,
      Old_Gold_Weight: 2.400,
      Old_Gold_Purity_Code: '22K',
      Purity_Percentage: 91.67,
      Melting_Deduction_Percent: 2,
      Melting_Deduction_Weight: 0.048,
      Net_Exchange_Weight: 2.352,
      Gold_Rate_At_Exchange: 6250,
      Total_Value: oldGoldValue,
      Used_Amount: oldGoldValue,
      Tested_By: 'tulasiadmin',
      Remarks: 'Old chain tested, purity confirmed 22K',
      Created_By: 'tulasiadmin',
    });

    await knex('tbl_ornament_master').where('Ornament_ID', sale2Item.Ornament_ID)
      .update({ Is_Sold: true, Is_Stock_Available: false, Last_Updated_By: 'seed' });

    await knex('tbl_customer_master').where('Customer_ID', customer2.Customer_ID)
      .update({
        Total_Purchase_Value: knex.raw('"Total_Purchase_Value" + ?', [netPayable]),
        Total_Purchase_Count: knex.raw('"Total_Purchase_Count" + 1'),
        Last_Purchase_Date: '2026-06-20',
        Loyalty_Points: knex.raw('"Loyalty_Points" + ?', [Math.floor(netPayable / 1000)]),
      });
  }

  console.log('✅ TULASI_BLR example data seeded:');
  console.log('   📦 3 purchase bills (INV-4501, INV-4567, SILVHOUSE-7823)');
  console.log('   ⚒️  2 karigar issues (1 completed + 1 in-progress)');
  console.log('   🧾 2 sales (Priya Sharma + Ramesh Kumar with old gold exchange)');
};
