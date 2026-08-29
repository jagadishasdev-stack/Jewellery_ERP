/**
 * Metal Type Master — replaces the hardcoded METAL_TYPES/METAL_TYPES_WITH_PURITY
 * arrays (server/src/utils/metalTypes.js, client/src/utils/metalTypes.js) as
 * the live source of truth. Global/shared across all tenants, same
 * convention as tbl_purity_master/tbl_item_type_master/tbl_design_master —
 * no Tenant_ID column.
 *
 * Seeded with the 4 values every existing tenant's data already relies on
 * (Gold/Silver/Platinum/Diamond) so nothing breaks the moment validation
 * switches from the static array to this table.
 */
exports.up = async function (knex) {
  await knex.schema.createTable('tbl_metal_type_master', (t) => {
    t.increments('Metal_Type_ID').primary();
    t.string('Metal_Name', 30).notNullable().unique();
    t.string('Description', 200);
    t.integer('Default_Purity_ID').references('Purity_ID').inTable('tbl_purity_master').onDelete('SET NULL');
    // Purity (karat/fineness) only makes sense for actual metal — a
    // Diamond parcel has a clarity/color grade, not a purity percentage.
    t.boolean('Has_Purity').notNullable().defaultTo(true);
    t.boolean('Is_Active').notNullable().defaultTo(true);
    t.timestamp('Created_Date').defaultTo(knex.fn.now());
    t.timestamp('Modified_Date').defaultTo(knex.fn.now());
  });

  await knex('tbl_metal_type_master').insert([
    { Metal_Name: 'Gold', Description: 'Gold jewellery and bullion', Has_Purity: true },
    { Metal_Name: 'Silver', Description: 'Silver jewellery and bullion', Has_Purity: true },
    { Metal_Name: 'Platinum', Description: 'Platinum jewellery', Has_Purity: true },
    { Metal_Name: 'Diamond', Description: 'Loose/predominantly-diamond stock — no gold-purity concept applies', Has_Purity: false },
  ]);
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('tbl_metal_type_master');
};
