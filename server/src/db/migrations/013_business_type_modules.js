/**
 * Migration 013 — Business Type & Module Management
 * - Adds Business_Type to tbl_tenant_master
 * - Creates tbl_erp_modules (master list of all modules)
 * - Creates tbl_tenant_modules (which modules each tenant has enabled)
 */
exports.up = async (knex) => {

  // ── 1. Add Business_Type to tbl_tenant_master ─────────────────────────────
  const tenantCols = await knex('tbl_tenant_master').columnInfo().catch(() => ({}));
  if (tenantCols.Tenant_ID && !tenantCols.Business_Type) {
    await knex.schema.alterTable('tbl_tenant_master', t => {
      t.string('Business_Type', 30).defaultTo('HYBRID').notNullable()
       .comment('RETAILER | WHOLESALER | MANUFACTURER | HYBRID');
    });
  }

  // ── 2. Create tbl_erp_modules ─────────────────────────────────────────────
  const modExists = await knex.schema.hasTable('tbl_erp_modules');
  if (!modExists) {
    await knex.schema.createTable('tbl_erp_modules', t => {
      t.increments('Module_ID').primary();
      t.string('Module_Key', 50).unique().notNullable();
      t.string('Module_Name', 100).notNullable();
      t.string('Module_Group', 50);
      t.string('Icon', 50);
      t.string('Route', 100);
      t.integer('Sort_Order').defaultTo(0);
      t.boolean('Is_Core').defaultTo(false).comment('Core modules cannot be disabled');
      // Default enabled per business type
      t.boolean('Default_Retailer').defaultTo(false);
      t.boolean('Default_Wholesaler').defaultTo(false);
      t.boolean('Default_Manufacturer').defaultTo(false);
      t.boolean('Default_Hybrid').defaultTo(true);
      t.string('Description', 300);
    });
  }

  // ── 3. Create tbl_tenant_modules ──────────────────────────────────────────
  const tmExists = await knex.schema.hasTable('tbl_tenant_modules');
  if (!tmExists) {
    await knex.schema.createTable('tbl_tenant_modules', t => {
      t.increments('TM_ID').primary();
      t.string('Tenant_ID', 50).notNullable();
      t.string('Module_Key', 50).notNullable();
      t.boolean('Is_Enabled').defaultTo(true);
      t.string('Enabled_By', 100);
      t.timestamp('Enabled_Date').defaultTo(knex.fn.now());
      t.unique(['Tenant_ID', 'Module_Key']);
    });
  }

  // ── 4. Seed module master data ────────────────────────────────────────────
  const existing = await knex('tbl_erp_modules').count('Module_ID as c').first();
  if (parseInt(existing.c) > 0) return; // already seeded

  await knex('tbl_erp_modules').insert([
    // Core — always on
    { Module_Key: 'dashboard',        Module_Name: 'Dashboard',            Module_Group: 'Core',          Sort_Order: 1,  Is_Core: true,  Default_Retailer: true,  Default_Wholesaler: true,  Default_Manufacturer: true,  Default_Hybrid: true  },
    { Module_Key: 'masters',          Module_Name: 'Master Setup',         Module_Group: 'Core',          Sort_Order: 2,  Is_Core: true,  Default_Retailer: true,  Default_Wholesaler: true,  Default_Manufacturer: true,  Default_Hybrid: true  },
    { Module_Key: 'settings',         Module_Name: 'Settings',             Module_Group: 'Core',          Sort_Order: 99, Is_Core: true,  Default_Retailer: true,  Default_Wholesaler: true,  Default_Manufacturer: true,  Default_Hybrid: true  },

    // Inventory
    { Module_Key: 'inventory',        Module_Name: 'Inventory / Stock',    Module_Group: 'Inventory',     Sort_Order: 3,  Is_Core: false, Default_Retailer: true,  Default_Wholesaler: true,  Default_Manufacturer: true,  Default_Hybrid: true  },
    { Module_Key: 'stock_transfer',   Module_Name: 'Stock Transfer',       Module_Group: 'Inventory',     Sort_Order: 4,  Is_Core: false, Default_Retailer: true,  Default_Wholesaler: true,  Default_Manufacturer: false, Default_Hybrid: true  },
    { Module_Key: 'barcode',          Module_Name: 'Barcode / Tagging',    Module_Group: 'Inventory',     Sort_Order: 5,  Is_Core: false, Default_Retailer: true,  Default_Wholesaler: true,  Default_Manufacturer: false, Default_Hybrid: true  },

    // Sales
    { Module_Key: 'retail_sales',     Module_Name: 'Retail Sales / POS',   Module_Group: 'Sales',         Sort_Order: 6,  Is_Core: false, Default_Retailer: true,  Default_Wholesaler: false, Default_Manufacturer: false, Default_Hybrid: true  },
    { Module_Key: 'wholesale_sales',  Module_Name: 'Wholesale Sales',      Module_Group: 'Sales',         Sort_Order: 7,  Is_Core: false, Default_Retailer: false, Default_Wholesaler: true,  Default_Manufacturer: false, Default_Hybrid: true  },
    { Module_Key: 'estimate',         Module_Name: 'Estimate / Quotation', Module_Group: 'Sales',         Sort_Order: 8,  Is_Core: false, Default_Retailer: true,  Default_Wholesaler: true,  Default_Manufacturer: false, Default_Hybrid: true  },
    { Module_Key: 'order_booking',    Module_Name: 'Order Booking',        Module_Group: 'Sales',         Sort_Order: 9,  Is_Core: false, Default_Retailer: true,  Default_Wholesaler: true,  Default_Manufacturer: false, Default_Hybrid: true  },
    { Module_Key: 'sales_return',     Module_Name: 'Sales Return',         Module_Group: 'Sales',         Sort_Order: 10, Is_Core: false, Default_Retailer: true,  Default_Wholesaler: true,  Default_Manufacturer: false, Default_Hybrid: true  },

    // Purchase
    { Module_Key: 'purchase',         Module_Name: 'Purchase',             Module_Group: 'Purchase',      Sort_Order: 11, Is_Core: false, Default_Retailer: true,  Default_Wholesaler: true,  Default_Manufacturer: true,  Default_Hybrid: true  },
    { Module_Key: 'old_gold',         Module_Name: 'Old Gold Purchase',    Module_Group: 'Purchase',      Sort_Order: 12, Is_Core: false, Default_Retailer: true,  Default_Wholesaler: false, Default_Manufacturer: false, Default_Hybrid: true  },

    // Manufacturing
    { Module_Key: 'goldsmith',        Module_Name: 'Goldsmith / Karigar',  Module_Group: 'Manufacturing', Sort_Order: 13, Is_Core: false, Default_Retailer: false, Default_Wholesaler: false, Default_Manufacturer: true,  Default_Hybrid: true  },
    { Module_Key: 'manufacturing',    Module_Name: 'Manufacturing',        Module_Group: 'Manufacturing', Sort_Order: 14, Is_Core: false, Default_Retailer: false, Default_Wholesaler: false, Default_Manufacturer: true,  Default_Hybrid: true  },
    { Module_Key: 'job_work',         Module_Name: 'Job Work',             Module_Group: 'Manufacturing', Sort_Order: 15, Is_Core: false, Default_Retailer: false, Default_Wholesaler: false, Default_Manufacturer: true,  Default_Hybrid: true  },
    { Module_Key: 'repair',           Module_Name: 'Repair Orders',        Module_Group: 'Manufacturing', Sort_Order: 16, Is_Core: false, Default_Retailer: true,  Default_Wholesaler: false, Default_Manufacturer: true,  Default_Hybrid: true  },

    // Customers
    { Module_Key: 'customers',        Module_Name: 'Customer Management',  Module_Group: 'CRM',           Sort_Order: 17, Is_Core: false, Default_Retailer: true,  Default_Wholesaler: false, Default_Manufacturer: false, Default_Hybrid: true  },
    { Module_Key: 'dealers',          Module_Name: 'Dealer Management',    Module_Group: 'CRM',           Sort_Order: 18, Is_Core: false, Default_Retailer: false, Default_Wholesaler: true,  Default_Manufacturer: false, Default_Hybrid: true  },

    // Schemes
    { Module_Key: 'savings_scheme',   Module_Name: 'Savings Scheme Club',  Module_Group: 'Schemes',       Sort_Order: 19, Is_Core: false, Default_Retailer: true,  Default_Wholesaler: false, Default_Manufacturer: false, Default_Hybrid: true  },
    { Module_Key: 'digi_gold',        Module_Name: 'Digi Gold',            Module_Group: 'Schemes',       Sort_Order: 20, Is_Core: false, Default_Retailer: true,  Default_Wholesaler: false, Default_Manufacturer: false, Default_Hybrid: true  },
    { Module_Key: 'lucky_draw',       Module_Name: 'Lucky Draw',           Module_Group: 'Schemes',       Sort_Order: 21, Is_Core: false, Default_Retailer: true,  Default_Wholesaler: false, Default_Manufacturer: false, Default_Hybrid: true  },

    // Accounts
    { Module_Key: 'accounts',         Module_Name: 'Accounts',             Module_Group: 'Accounts',      Sort_Order: 22, Is_Core: false, Default_Retailer: true,  Default_Wholesaler: true,  Default_Manufacturer: true,  Default_Hybrid: true  },
    { Module_Key: 'day_close',        Module_Name: 'Day Close',            Module_Group: 'Accounts',      Sort_Order: 23, Is_Core: false, Default_Retailer: true,  Default_Wholesaler: true,  Default_Manufacturer: false, Default_Hybrid: true  },

    // Reports
    { Module_Key: 'reports',          Module_Name: 'Reports',              Module_Group: 'Reports',       Sort_Order: 24, Is_Core: false, Default_Retailer: true,  Default_Wholesaler: true,  Default_Manufacturer: true,  Default_Hybrid: true  },
    { Module_Key: 'gst_reports',      Module_Name: 'GST Reports',          Module_Group: 'Reports',       Sort_Order: 25, Is_Core: false, Default_Retailer: true,  Default_Wholesaler: true,  Default_Manufacturer: false, Default_Hybrid: true  },

    // Floor / Branches
    { Module_Key: 'floors',           Module_Name: 'Floor Management',     Module_Group: 'Operations',    Sort_Order: 26, Is_Core: false, Default_Retailer: true,  Default_Wholesaler: true,  Default_Manufacturer: false, Default_Hybrid: true  },

    // Invoice
    { Module_Key: 'invoice_studio',   Module_Name: 'Invoice Studio',       Module_Group: 'Operations',    Sort_Order: 27, Is_Core: false, Default_Retailer: true,  Default_Wholesaler: true,  Default_Manufacturer: false, Default_Hybrid: true  },
  ]);
};

exports.down = async (knex) => {
  await knex.schema.dropTableIfExists('tbl_tenant_modules');
  await knex.schema.dropTableIfExists('tbl_erp_modules');
};
