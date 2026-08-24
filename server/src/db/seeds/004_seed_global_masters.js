/**
 * Seed 004 — Global master data
 * Diamond quality/color/shape, more purities, more item types
 */
exports.seed = async function (knex) {

  // ── More Item Types ──────────────────────────────────────────────────────
  const existingTypes = await knex('tbl_item_type_master').select('Type_Code');
  const existingCodes = existingTypes.map(t => t.Type_Code);
  const newTypes = [
    { Type_Code: 'COIN', Type_Name: 'Coin', Category: 'Plain', Is_Gold: true, Default_Making_Charge: 50, Default_Wastage_Percent: 1, HSN_Code: '7108', GST_Percentage: 3 },
    { Type_Code: 'MANGAL', Type_Name: 'Mangalsutra', Category: 'Plain', Is_Gold: true, Default_Making_Charge: 200, Default_Wastage_Percent: 3, HSN_Code: '7113', GST_Percentage: 3 },
    { Type_Code: 'HAAR', Type_Name: 'Haar', Category: 'Plain', Is_Gold: true, Default_Making_Charge: 280, Default_Wastage_Percent: 4, HSN_Code: '7113', GST_Percentage: 3 },
    { Type_Code: 'TIKKA', Type_Name: 'Maang Tikka', Category: 'Studded', Is_Gold: true, Default_Making_Charge: 250, Default_Wastage_Percent: 3, HSN_Code: '7113', GST_Percentage: 3 },
    { Type_Code: 'NOSE', Type_Name: 'Nose Ring', Category: 'Plain', Is_Gold: true, Default_Making_Charge: 150, Default_Wastage_Percent: 2, HSN_Code: '7113', GST_Percentage: 3 },
    { Type_Code: 'KADA', Type_Name: 'Kada', Category: 'Plain', Is_Gold: true, Default_Making_Charge: 220, Default_Wastage_Percent: 3, HSN_Code: '7113', GST_Percentage: 3 },
    { Type_Code: 'PLAT_RING', Type_Name: 'Platinum Ring', Category: 'Plain', Is_Gold: false, Default_Making_Charge: 600, Default_Wastage_Percent: 2, HSN_Code: '7113', GST_Percentage: 3 },
    { Type_Code: 'GIFT', Type_Name: 'Gift Article', Category: 'Plain', Is_Gold: false, Default_Making_Charge: 0, Default_Wastage_Percent: 0, HSN_Code: '7117', GST_Percentage: 3 },
  ].filter(t => !existingCodes.includes(t.Type_Code));
  if (newTypes.length > 0) await knex('tbl_item_type_master').insert(newTypes);

  // ── More Purities ────────────────────────────────────────────────────────
  const existingPurities = await knex('tbl_purity_master').select('Purity_Code');
  const existingPuritCodes = existingPurities.map(p => p.Purity_Code);
  const newPurities = [
    { Purity_Code: '20K', Karat: 20.00, Percentage: 83.33, Description: '20 Karat Gold', Hallmark_Standard: 'BIS 833', Metal_Type: 'Gold' },
    { Purity_Code: 'PLAT950', Karat: 0, Percentage: 95.00, Description: 'Platinum 950', Hallmark_Standard: 'PT 950', Metal_Type: 'Platinum' },
    { Purity_Code: 'SIL999', Karat: 0, Percentage: 99.90, Description: 'Fine Silver 999', Hallmark_Standard: 'BIS 999', Metal_Type: 'Silver' },
  ].filter(p => !existingPuritCodes.includes(p.Purity_Code));
  if (newPurities.length > 0) await knex('tbl_purity_master').insert(newPurities);

  // ── Diamond Quality ──────────────────────────────────────────────────────
  await knex('tbl_diamond_quality_master').del();
  await knex('tbl_diamond_quality_master').insert([
    { Quality_Code: 'IF',   Quality_Name: 'IF (Internally Flawless)' },
    { Quality_Code: 'VVS1', Quality_Name: 'VVS1 (Very Very Slightly Included 1)' },
    { Quality_Code: 'VVS2', Quality_Name: 'VVS2 (Very Very Slightly Included 2)' },
    { Quality_Code: 'VS1',  Quality_Name: 'VS1 (Very Slightly Included 1)' },
    { Quality_Code: 'VS2',  Quality_Name: 'VS2 (Very Slightly Included 2)' },
    { Quality_Code: 'SI1',  Quality_Name: 'SI1 (Slightly Included 1)' },
    { Quality_Code: 'SI2',  Quality_Name: 'SI2 (Slightly Included 2)' },
    { Quality_Code: 'I1',   Quality_Name: 'I1 (Included 1)' },
  ]);

  // ── Diamond Color ────────────────────────────────────────────────────────
  await knex('tbl_diamond_color_master').del();
  await knex('tbl_diamond_color_master').insert([
    { Color_Code: 'D', Color_Name: 'D (Colorless - Exceptional)' },
    { Color_Code: 'E', Color_Name: 'E (Colorless)' },
    { Color_Code: 'F', Color_Name: 'F (Colorless)' },
    { Color_Code: 'G', Color_Name: 'G (Near Colorless)' },
    { Color_Code: 'H', Color_Name: 'H (Near Colorless)' },
    { Color_Code: 'I', Color_Name: 'I (Near Colorless)' },
    { Color_Code: 'J', Color_Name: 'J (Near Colorless)' },
    { Color_Code: 'K', Color_Name: 'K (Faint Yellow)' },
  ]);

  // ── Diamond Shape ────────────────────────────────────────────────────────
  await knex('tbl_diamond_shape_master').del();
  await knex('tbl_diamond_shape_master').insert([
    { Shape_Code: 'RND',  Shape_Name: 'Round Brilliant' },
    { Shape_Code: 'PRIN', Shape_Name: 'Princess' },
    { Shape_Code: 'OVAL', Shape_Name: 'Oval' },
    { Shape_Code: 'CUSH', Shape_Name: 'Cushion' },
    { Shape_Code: 'EMLD', Shape_Name: 'Emerald' },
    { Shape_Code: 'PEAR', Shape_Name: 'Pear' },
    { Shape_Code: 'MARQ', Shape_Name: 'Marquise' },
    { Shape_Code: 'RADI', Shape_Name: 'Radiant' },
    { Shape_Code: 'ASSC', Shape_Name: 'Asscher' },
    { Shape_Code: 'HART', Shape_Name: 'Heart' },
  ]);

  console.log('✅ Global master data seeded (item types, purities, diamond grading)');
};
