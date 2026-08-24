/**
 * Pawn-loan guarantor + gem/diamond certification.
 *
 * tbl_pawn_loan_guarantor: legacy `guarantor` — split out as its own table
 * (not columns on tbl_pawn_loan_header) since a loan can have more than one
 * guarantor and a fixed set of "Guarantor_2_Name" style columns is exactly
 * the pattern this schema avoids elsewhere (see tbl_huid_master normalizing
 * away legacy's huid/huid2/huid3/huid4 columns for the same reason).
 *
 * tbl_gem_certificate: legacy `certificate`/`certificate_details`/
 * `certificate_mast` — a lab certificate (GIA/IGI/HRD/...) for a stone or a
 * finished piece. Deliberately separate from tbl_huid_master, which is the
 * *hallmark* (BIS gold purity) certificate, a different regulatory scheme
 * with different data (assay centre, not a grading lab).
 */
exports.up = async function (knex) {
  await knex.schema.createTable('tbl_pawn_loan_guarantor', (t) => {
    t.bigIncrements('Guarantor_ID').primary();
    t.bigInteger('Loan_ID').notNullable().references('Loan_ID').inTable('tbl_pawn_loan_header').onDelete('CASCADE');
    t.string('Guarantor_Name', 100).notNullable();
    t.string('Mobile', 15).notNullable();
    t.text('Address');
    t.string('Relation_To_Borrower', 50);
    t.string('ID_Proof_Type', 30); // Aadhaar | PAN | Voter ID | ...
    t.string('ID_Proof_Number', 50);
    t.string('ID_Proof_URL', 500);
    t.timestamp('Created_Date').defaultTo(knex.fn.now());
    t.index(['Loan_ID'], 'idx_pawn_guarantor_loan');
  });

  await knex.schema.createTable('tbl_gem_certificate', (t) => {
    t.bigIncrements('Certificate_ID').primary();
    t.string('Tenant_ID', 20).notNullable().references('Tenant_ID').inTable('tbl_tenant_master').onDelete('CASCADE');
    t.bigInteger('Ornament_ID').references('Ornament_ID').inTable('tbl_ornament_master').onDelete('SET NULL');
    t.integer('Stone_ID').references('Stone_ID').inTable('tbl_gemstone_master').onDelete('SET NULL');
    t.string('Certifying_Lab', 50).notNullable(); // GIA | IGI | HRD | SGL | ...
    t.string('Certificate_Number', 50).notNullable();
    t.date('Certificate_Date');
    t.decimal('Carat_Weight', 10, 3);
    t.string('Color_Grade', 10);
    t.string('Clarity_Grade', 10);
    t.string('Cut_Grade', 20);
    t.string('Certificate_URL', 500);
    t.boolean('Is_Active').defaultTo(true);
    t.timestamp('Created_Date').defaultTo(knex.fn.now());
    t.index(['Ornament_ID'], 'idx_gem_certificate_ornament');
    t.unique(['Tenant_ID', 'Certifying_Lab', 'Certificate_Number']);
  });

  const existingModule = await knex('tbl_erp_modules').where('Module_Key', 'guarantor_certification').first();
  if (!existingModule) {
    await knex('tbl_erp_modules').insert({
      Module_Key: 'guarantor_certification',
      Module_Name: 'Guarantor & Gem Certification',
      Module_Group: 'Finance',
      Sort_Order: 37,
      Is_Core: false,
      Default_Retailer: true,
      Default_Wholesaler: true,
      Default_Manufacturer: false,
      Default_Hybrid: true,
    });
  }
};

exports.down = async function (knex) {
  await knex('tbl_erp_modules').where('Module_Key', 'guarantor_certification').del();
  await knex.schema.dropTableIfExists('tbl_gem_certificate');
  await knex.schema.dropTableIfExists('tbl_pawn_loan_guarantor');
};
