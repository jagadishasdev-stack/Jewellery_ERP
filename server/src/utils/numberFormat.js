/**
 * Per-tenant document-number format toggle (Super Admin -> Tenant -> Edit
 * -> Short Number Format, tbl_tenant_master.Short_Number_Format). Every
 * "generate the next INV-/PUR-/JOB-/... number" helper across the codebase
 * used to hand-roll the same shape:
 *   PREFIX-TENANTCODE-YYYYMMDD-SEQ     e.g. INV-VJBLR-20260819-0001
 *   (resets to 1 every new calendar day, per tenant, per document type)
 * A tenant can opt into a shorter shape instead:
 *   PREFIX-SEQ                          e.g. INV-0001
 *   (drops the tenant code AND the date entirely, so there's nothing left
 *   to reset on — the sequence just keeps climbing)
 *
 * Centralized here so every generator shares ONE lookup pattern instead of
 * each hand-rolling its own — and, critically, the match always anchors
 * to a pattern that includes OUR OWN prefix (never "whatever row in this
 * table sorts last"), the same class of bug already fixed once for
 * generateArticleNumber (see invoiceNumber.js) — a custom user-typed
 * value that happens to end in digits still can't hijack the next seq.
 *
 * A plain SQL LIKE '<pattern>%' isn't safe here on its own: the SHORT
 * pattern ("PREFIX-") is itself a PREFIX of the FULL pattern ("PREFIX-
 * TENANTCODE-DATE-"), so a tenant just switched to Short would still
 * LIKE-match their OLDER full-format rows — and could even pick one as
 * "last" (string DESC sorts letters after digits), regenerating a number
 * that already exists. Anchored with a regex requiring the tail after
 * the pattern to be ALL DIGITS makes the two shapes mutually exclusive
 * by construction, so this can't happen in either direction.
 *
 * Switching the toggle starts a fresh sequence under the new pattern (the
 * old pattern's rows simply stop matching) rather than continuing the old
 * numbering — documented here rather than silently surprising anyone.
 */
const db = require('../db/knex');
const dayjs = require('dayjs');

const isShortFormat = async (tenantId) => {
  const t = await db('tbl_tenant_master').where('Tenant_ID', tenantId).first('Short_Number_Format');
  return !!(t && t.Short_Number_Format);
};

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * @param {string} tenantId - tenant to scope the lookup/sequence to
 * @param {string} table - table holding the document rows
 * @param {string} column - the number column on that table
 * @param {string} prefix - this document type's own letter prefix (e.g. 'INV')
 * @param {string} [tenantCode] - the tenant-code segment used in FULL format
 *   (omit to default to tenantId itself; callers that strip underscores
 *   for their existing format pass that already-stripped value here so
 *   switching to this shared helper doesn't change anyone's default
 *   output; pass '' explicitly for a generator whose FULL format never
 *   included a tenant-code segment at all, e.g. bin vouchers)
 * @param {number} [padWidth=4] - how many digits the sequence pads to
 */
const nextNumber = async ({ tenantId, table, column, prefix, tenantCode, padWidth = 4 }) => {
  const short = await isShortFormat(tenantId);
  const tenantSegment = tenantCode === '' ? '' : `${tenantCode ?? tenantId}-`;
  const pattern = short
    ? `${prefix}-`
    : `${prefix}-${tenantSegment}${dayjs().format('YYYYMMDD')}-`;

  // Atomic — see tbl_document_number_counter's own migration comment for
  // why this replaced a read-then-write SELECT MAX + increment. Fast path:
  // the counter for this exact (tenant, pattern) already exists — one
  // UPDATE, no read of the real document table at all, serialized by
  // Postgres itself so two concurrent callers can never land on the same
  // sequence number.
  let rows = (await db.raw(
    `UPDATE "tbl_document_number_counter" SET "Last_Seq" = "Last_Seq" + 1
     WHERE "Tenant_ID" = ? AND "Sequence_Key" = ? RETURNING "Last_Seq"`,
    [tenantId, pattern]
  )).rows;

  if (!rows.length) {
    // First-ever call for this exact key (or a Full-format pattern that
    // just rolled over to a new calendar day) — seed from the real
    // table's own current max, the same lookup this used to do on every
    // single call, so numbering continues from where it already was
    // instead of restarting at 1 and colliding with real existing rows.
    // The ON CONFLICT below still covers a concurrent "first caller" race:
    // whichever request's INSERT loses increments the ACTUAL now-stored
    // value, never its own (possibly stale) seed guess, so this stays
    // correct even if two requests compute different seeds for the same
    // brand-new key at the same moment.
    const last = await db(table)
      .where('Tenant_ID', tenantId)
      .whereRaw(`"${column}" ~ ?`, [`^${escapeRegex(pattern)}[0-9]+$`])
      .orderBy(column, 'desc')
      .first();
    const seed = last ? (parseInt(String(last[column]).slice(pattern.length), 10) || 0) : 0;

    rows = (await db.raw(
      `INSERT INTO "tbl_document_number_counter" ("Tenant_ID", "Sequence_Key", "Last_Seq") VALUES (?, ?, ?)
       ON CONFLICT ("Tenant_ID", "Sequence_Key") DO UPDATE SET "Last_Seq" = "tbl_document_number_counter"."Last_Seq" + 1
       RETURNING "Last_Seq"`,
      [tenantId, pattern, seed + 1]
    )).rows;
  }

  const seq = rows[0].Last_Seq;
  return `${pattern}${String(seq).padStart(padWidth, '0')}`;
};

module.exports = { nextNumber, isShortFormat };
