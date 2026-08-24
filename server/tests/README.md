# Automated tests

`npm test` (Jest + Supertest). Scope is deliberate, not exhaustive: this
covers the highest-risk **new** subsystems built this session — not the
~100+ pre-existing routes, which were out of scope for this pass.

- `modules.test.js` — the Gold/Platinum/Diamond ↔ business-type intersection
  gating logic, plus the ?tenantId= override that lets a Super Admin manage
  a real customer's modules/tier from Module Management (added after
  discovering the page could previously only ever act on the Super Admin's
  own SA_MASTER row) — and the backstop that a non-super-admin passing that
  same param is silently ignored, never honored.
- `syncEngine.test.js` — `POST /api/sync/upload`, `GET /download`, `GET
  /status`, including a regression test for a real idempotency-scoping bug
  found and fixed while hand-testing this same endpoint (an UPDATE to an
  already-synced row was being silently dropped).
- `excelImport.test.js` — the customer importer's partial-success behavior
  (good rows import, bad rows are reported individually, nothing aborts the
  whole batch; duplicates are skipped, never overwritten) — plus a real
  concurrency regression: running the full suite repeatedly surfaced an
  intermittent (~1-in-6 to 1-in-8 runs) 500, "No tenant database context is
  active," that a single manual test never caught. Root cause was
  middleware ORDER in excelImport.js — `authenticate` (which opens the
  AsyncLocalStorage scope `tenantDb` needs) ran before multer's
  `upload.single('file')`, and multer's async multipart parsing
  occasionally resolved outside that scope, losing it. Fixed by running
  `upload.single('file')` before `authenticate` on all 7 import routes (see
  the comment in excelImport.js — don't "tidy" that order back). The
  regression test fires 20 real uploads concurrently, since a single
  request essentially never reproduces this.
- `labelTemplate.test.js` — barcode label template self-service (opened up
  from Super-Admin-only to any `tenant_management` role). Locks in the one
  property that actually matters here: a tenant admin can create/edit their
  own tag but can never reach the shared global default or another
  tenant's row, even by hand-crafting `?tenantId=` — and a lower role with
  no `tenant_management` is rejected outright.
- `changePassword.test.js` — self-service `PUT /api/auth/change-password`
  (didn't exist before this pass — only admin-driven resets did). Confirms
  the plaintext `Default_Password` column a Super Admin's tenant-users view
  reads stays in sync with whatever a user actually changes their password
  to, not just what an admin last set.
- `tenantCreate.test.js` — `POST /api/tenant/create`, including a real
  regression test for a bug found while testing the "Jagdish/Jsphere"
  default admin credential end-to-end: cloning default invoice templates
  for a new tenant carried over the GLOBAL template's own `Sync_UUID`
  instead of generating a fresh one, so creating a second tenant right
  after a first would fail outright on a unique-constraint violation. Also
  confirms "Jsphere" (7 chars) is accepted only as that exact literal,
  never as a general exception to the 8-character minimum.
- `accountingEngine.test.js` — the shared double-entry posting engine
  (`utils/accountingEngine.js`) directly: rejects an unbalanced Dr≠Cr
  journal outright (nothing partial ever gets written), a bank-linked
  account's `Current_Balance` stays transaction-derived automatically, and
  Tally auto-queuing fires only when sync is enabled for that tenant.
- `accountingReports.test.js` — a real sale and a real purchase through
  the live routes, then Trial Balance/Balance Sheet/Dashboard/the
  pre-existing `/api/reports/financial` endpoint are checked against what
  actually posted. Polls for the journal to exist before asserting on it —
  accounting posts are deliberately non-blocking (a sale's success never
  depends on bookkeeping succeeding), so the HTTP response can return
  before the journal is actually written.
- `accountingVouchers.test.js` — the manual voucher entry routes behind
  the Voucher Entry frontend screen (Receipt/Payment/Contra/Journal +
  reverse), and Chart of Accounts CRUD (create a ledger, reject a
  duplicate name, deactivate a manual account, refuse to deactivate a
  system one) behind the Chart of Accounts screen. Also covers per-bank
  payment selection end to end — a bank-mode sale payment carrying a real
  `Bank_Account_ID` posts against that specific bank's own ledger (and
  updates its `Current_Balance`), confirmed by checking the generic
  "Unassigned" fallback ledger got NO entry for that sale.
- `savingsSchemeAccounting.test.js` — the Savings Scheme module's
  collections now post to the real ledger (`postJournal`), not just the
  disconnected `tbl_scheme_accounting_entries` shadow table it used to
  ONLY write into (a real, confirmed gap — the shadow table's rows are
  kept too, for the module's own audit trail, but they used to be the
  only record that existed). Covers a Cash collection, a Cheque collection
  that matures the scheme and triggers a maturity-bonus provision journal,
  and checks Trial Balance/Day Book/Dashboard all reflect it correctly.

## How it runs
Tests hit the **real dev Postgres DB** (`JewelleryERP`) through the real
Express `app`  — no mocks, no separate test database. Isolation instead
comes from `helpers/testTenant.js`, which provisions a dedicated
`Tenant_ID='QATEST'` tenant before each suite and deletes every row it
created (in FK-safe order) afterward. Real tenant data (e.g. DLJ's 72,000+
customers) is never touched — verified manually after writing this suite
by diffing DLJ's row count before and after a full run.

`NODE_ENV=development` is forced in the `test` npm script because
`knexfile.js` has no `test` environment block (by design — this project
was never meant to need a separate test DB config) and Jest sets
`NODE_ENV=test` by default, which would otherwise crash on `knexConfig[env]`
being `undefined`.

`--runInBand` is required, not optional: all three suites share the same
`QATEST` tenant row, so running suites in parallel would race on
setup/teardown. `--forceExit` closes the process at the end even if a
socket.io handle from the imported `app` is still technically open (the
app is never `.listen()`ed in tests — see the `require.main === module`
guard in `src/index.js` — but importing it still constructs the
`http.Server`/`socket.io` objects).

## What's NOT covered here
Everything else in the app — sales, purchases, inventory, the ~25 other
admin sub-screens, the legacy-data ETL script, etc. — has no automated
tests. This suite is scoped to what changed this session, not a claim that
the whole app is covered.
