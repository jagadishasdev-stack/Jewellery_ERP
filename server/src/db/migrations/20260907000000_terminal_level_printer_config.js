/**
 * Printer Setup spec §18-19 — the last deliberately-deferred piece: a
 * specific computer/terminal having its own printer assignment, on top of
 * the existing Branch -> Tenant cascade. Recommended priority (§19):
 *   Terminal -> Branch -> Tenant Default -> System Default (browser dialog)
 *
 * tbl_terminal_master — one row per browser/computer that has ever opened
 * Printer Settings. Terminal_ID is CLIENT-GENERATED (crypto.randomUUID(),
 * persisted in localStorage — see client/src/utils/terminalIdentity.js),
 * not server auto-increment, because the server has no way to recognize
 * "the same computer" across requests on its own; the browser is the only
 * thing that can persist that identity locally.
 *
 * tbl_printer_config.Terminal_ID — nullable, same pattern as Branch_ID
 * already is: a terminal-scoped row (Terminal_ID set) wins over a
 * branch-scoped row, which wins over a tenant-wide row, for that specific
 * computer only. A row with Terminal_ID set is invisible to every other
 * computer, exactly per the spec's "prevents the wrong computer from
 * trying to print to another workstation's printer."
 *
 * §4's Connection_Type (USB/Network/WiFi/Bluetooth/Shared) is added here
 * too, as a small, honestly-scoped addition — QZ Tray's printer list
 * doesn't expose real connection-type data (confirmed in the original
 * audit), so this is a plain informational tag the admin sets by hand,
 * clearly not a verified/live value.
 */
exports.up = async function (knex) {
  await knex.schema.createTable('tbl_terminal_master', (t) => {
    t.string('Terminal_ID', 40).primary(); // client-generated UUID
    t.string('Tenant_ID', 20).notNullable().references('Tenant_ID').inTable('tbl_tenant_master').onDelete('CASCADE');
    t.string('Branch_ID', 20).references('Branch_ID').inTable('tbl_branch_master').onDelete('SET NULL');
    t.string('Terminal_Name', 100).notNullable().defaultTo('Unnamed Computer');
    t.boolean('Is_Active').defaultTo(true);
    t.timestamp('First_Seen_Date').defaultTo(knex.fn.now());
    t.timestamp('Last_Seen_Date').defaultTo(knex.fn.now());
    t.index(['Tenant_ID', 'Branch_ID'], 'idx_terminal_tenant_branch');
  });

  await knex.schema.alterTable('tbl_printer_config', (t) => {
    t.string('Terminal_ID', 40).references('Terminal_ID').inTable('tbl_terminal_master').onDelete('CASCADE');
    t.string('Connection_Type', 20); // 'USB'|'Network'|'WiFi'|'Bluetooth'|'Shared' — informational only, admin-set
  });
};

exports.down = async function (knex) {
  await knex.schema.alterTable('tbl_printer_config', (t) => {
    t.dropColumn('Terminal_ID');
    t.dropColumn('Connection_Type');
  });
  await knex.schema.dropTableIfExists('tbl_terminal_master');
};
