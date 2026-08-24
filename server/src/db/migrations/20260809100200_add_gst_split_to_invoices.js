/**
 * Sales/Purchase headers only ever stored one lump `GST_Amount` — the
 * CGST/SGST split was computed on the fly in JS at journal-posting time
 * (sales.js: cgst = sgst = GST_Amount / 2, ALWAYS, with no inter-state
 * case at all). That's not a real, queryable, auditable fact, and it
 * can't represent IGST for an inter-state sale — it silently treated
 * every sale as intra-state. Storing the real split on the invoice itself
 * is what GSTR-1-style reporting actually needs.
 *
 * Is_Interstate is derived (customer state vs. tenant's own registered
 * state) at invoice-creation time, not recomputed later — a tenant that
 * later changes its registered state shouldn't retroactively change what
 * an old invoice legally was.
 */
exports.up = async function (knex) {
  for (const table of ['tbl_sales_header', 'tbl_purchase_header']) {
    await knex.schema.alterTable(table, (t) => {
      t.decimal('CGST_Amount', 15, 2).defaultTo(0);
      t.decimal('SGST_Amount', 15, 2).defaultTo(0);
      t.decimal('IGST_Amount', 15, 2).defaultTo(0);
      t.boolean('Is_Interstate').defaultTo(false);
    });
  }
};

exports.down = async function (knex) {
  for (const table of ['tbl_sales_header', 'tbl_purchase_header']) {
    await knex.schema.alterTable(table, (t) => {
      t.dropColumn('CGST_Amount');
      t.dropColumn('SGST_Amount');
      t.dropColumn('IGST_Amount');
      t.dropColumn('Is_Interstate');
    });
  }
};
