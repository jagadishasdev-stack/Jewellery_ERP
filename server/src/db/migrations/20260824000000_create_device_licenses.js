/**
 * Two licensing modes for the Image App, chosen per tenant:
 *   - TENANT_WIDE (default, existing behaviour): tbl_tenant_master.License_Key
 *     alone activates the app on any device, scoped to that tenant's data.
 *   - PER_DEVICE: each physical device must be individually approved by the
 *     Super Admin. A device sends a request (Device_ID captured on install)
 *     through the app; Super Admin approves it from the dashboard, which
 *     mints a License_Key valid ONLY for that Device_ID. The same key
 *     entered on a different device is rejected.
 */
exports.up = function (knex) {
  return knex.schema
    .alterTable('tbl_tenant_master', (t) => {
      t.string('License_Mode', 20).notNullable().defaultTo('TENANT_WIDE');
      // 'TENANT_WIDE' | 'PER_DEVICE'
    })
    .createTable('tbl_device_licenses', (t) => {
      t.increments('Device_License_ID').primary();
      t.string('Tenant_ID', 20).notNullable()
        .references('Tenant_ID').inTable('tbl_tenant_master').onDelete('CASCADE');
      t.string('Device_ID', 200).notNullable();
      t.string('Device_Model', 200);
      t.string('Device_Label', 100); // optional friendly name, e.g. "Front Counter Tablet"
      t.string('License_Key', 64).unique(); // set only on approval
      t.string('Status', 20).notNullable().defaultTo('PENDING');
      // 'PENDING' | 'APPROVED' | 'REVOKED' | 'REJECTED'
      t.string('Contact_Note', 500); // whatever the store typed when requesting
      t.timestamp('Requested_Date').defaultTo(knex.fn.now());
      t.string('Approved_By', 50);
      t.timestamp('Approved_Date');
      t.string('Revoked_By', 50);
      t.timestamp('Revoked_Date');

      t.index(['Tenant_ID', 'Status'], 'idx_device_lic_tenant_status');
      t.index(['Device_ID'], 'idx_device_lic_device');
      // A device can have at most one non-revoked/non-rejected request per
      // tenant at a time — re-requesting after a revoke is fine, but not
      // while one is still pending/approved.
    });
};

exports.down = function (knex) {
  return knex.schema
    .dropTableIfExists('tbl_device_licenses')
    .alterTable('tbl_tenant_master', (t) => {
      t.dropColumn('License_Mode');
    });
};
