/**
 * Data Migration Center — bulk-import a customer's old ERP data into a
 * chosen tenant. Control-plane tables (same connection tbl_tenant_master
 * and superAdmin.js already use), not inside any target tenant's own DB —
 * this is the platform operator's own operational data about the
 * migration process, not tenant business data, and needs to stay
 * readable/auditable by the operator regardless of which physical DB the
 * target tenant's business data actually lives on.
 *
 * One generic `migration_staging_records` table (Entity_Type-
 * discriminated) rather than one staging table per entity — matches the
 * same "one normalized table beats several near-identical siblings" call
 * already made for tbl_crm_list_master earlier this project.
 */
exports.up = async function up(knex) {
  await knex.schema.createTable('migrations', (t) => {
    t.string('Migration_ID', 30).primary(); // MIG-YYYYMMDD-NNNN
    t.string('Tenant_ID', 20).notNullable().references('Tenant_ID').inTable('tbl_tenant_master').onDelete('CASCADE');
    t.string('Branch_ID', 20);
    t.string('Migration_Type', 20).notNullable(); // Full | Master | OpeningBalance | Transaction
    t.string('Source_ERP', 100);
    t.string('Status', 20).notNullable().defaultTo('DRAFT');
    // DRAFT, UPLOADED, ANALYZING, MAPPING, VALIDATING, READY, APPROVED, RUNNING, COMPLETED, FAILED
    t.integer('Created_By').notNullable(); // Super Admin User_ID
    t.timestamp('Created_Date').defaultTo(knex.fn.now());
    t.timestamp('Started_Date');
    t.timestamp('Completed_Date');
    t.integer('Total_Records').defaultTo(0);
    t.integer('Success_Records').defaultTo(0);
    t.integer('Warning_Records').defaultTo(0);
    t.integer('Error_Records').defaultTo(0);
    t.text('Notes');
    t.text('Failure_Reason');
    t.index(['Tenant_ID', 'Status']);
  });

  await knex.schema.createTable('migration_files', (t) => {
    t.increments('File_ID').primary();
    t.string('Migration_ID', 30).notNullable().references('Migration_ID').inTable('migrations').onDelete('CASCADE');
    t.string('File_Name', 255).notNullable();
    t.string('File_Type', 10).notNullable(); // xlsx | csv | zip
    t.bigInteger('File_Size').notNullable();
    t.string('Storage_Path', 500).notNullable();
    t.integer('Sheet_Count').defaultTo(0);
    t.timestamp('Uploaded_Date').defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('migration_mappings', (t) => {
    t.increments('Mapping_ID').primary();
    t.string('Migration_ID', 30).notNullable().references('Migration_ID').inTable('migrations').onDelete('CASCADE');
    t.string('Source_File', 255);
    t.string('Source_Sheet', 100);
    t.string('Entity_Type', 30).notNullable();
    t.string('Source_Field', 150).notNullable();
    t.string('Target_Field', 150); // nullable — unmapped until reviewed
    t.string('Mapping_Type', 10).defaultTo('Auto'); // Auto | Manual
    t.decimal('Confidence', 5, 2).defaultTo(0);
    t.jsonb('Transformation_Rule');
    t.boolean('Is_Approved').defaultTo(false);
    t.index(['Migration_ID', 'Entity_Type']);
  });

  await knex.schema.createTable('migration_staging_records', (t) => {
    t.bigIncrements('Staging_ID').primary();
    t.string('Migration_ID', 30).notNullable().references('Migration_ID').inTable('migrations').onDelete('CASCADE');
    t.string('Entity_Type', 30).notNullable();
    t.string('Source_File', 255);
    t.string('Source_Sheet', 100);
    t.integer('Source_Row');
    t.string('Source_ID', 100); // source PK, kept as string — not always an integer
    t.jsonb('Raw_Data').notNullable();
    t.jsonb('Mapped_Data');
    t.string('Validation_Status', 10).defaultTo('Pending'); // Pending | Valid | Warning | Error
    t.jsonb('Validation_Messages');
    t.boolean('Is_Duplicate').defaultTo(false);
    t.bigInteger('Duplicate_Match_Id');
    t.string('Duplicate_Action', 20); // UseExisting | UpdateExisting | CreateNew | Skip | Merge
    t.string('Import_Status', 10).defaultTo('Pending'); // Pending | Imported | Skipped | Failed
    t.integer('Target_Id');
    t.text('Import_Error');
    t.index(['Migration_ID', 'Entity_Type']);
    t.index(['Migration_ID', 'Validation_Status']);
  });

  await knex.schema.createTable('migration_id_mappings', (t) => {
    t.bigIncrements('Map_ID').primary();
    t.string('Migration_ID', 30).notNullable().references('Migration_ID').inTable('migrations').onDelete('CASCADE');
    t.string('Entity_Type', 30).notNullable();
    t.string('Old_Id', 100).notNullable();
    t.integer('New_Id').notNullable();
    t.unique(['Migration_ID', 'Entity_Type', 'Old_Id']);
    t.index(['Migration_ID', 'Entity_Type', 'New_Id']);
  });

  await knex.schema.createTable('migration_logs', (t) => {
    t.bigIncrements('Log_ID').primary();
    t.string('Migration_ID', 30).notNullable().references('Migration_ID').inTable('migrations').onDelete('CASCADE');
    t.string('Entity_Type', 30);
    t.integer('Source_Row');
    t.string('Status', 10).notNullable(); // SUCCESS | WARNING | ERROR | SKIPPED | DUPLICATE
    t.text('Message');
    t.timestamp('Created_Date').defaultTo(knex.fn.now());
    t.index(['Migration_ID', 'Status']);
  });
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('migration_logs');
  await knex.schema.dropTableIfExists('migration_id_mappings');
  await knex.schema.dropTableIfExists('migration_staging_records');
  await knex.schema.dropTableIfExists('migration_mappings');
  await knex.schema.dropTableIfExists('migration_files');
  await knex.schema.dropTableIfExists('migrations');
};
