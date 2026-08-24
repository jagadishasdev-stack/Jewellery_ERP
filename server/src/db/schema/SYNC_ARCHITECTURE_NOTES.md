# Local ↔ Cloud Sync Architecture Notes

Companion to the user's "Multi-Tenant Local + Cloud Database Architecture"
planning doc (SA_MASTER + local MySQL + cloud PostgreSQL + sync). This file
records how that plan maps onto the actual schema in
`postgres_cloud_schema.sql` / `mysql_local_schema.sql`, and what decisions
were made where the plan and the existing codebase pulled in different
directions.

## What already existed vs. what this round added

| Plan concept (§ in the doc) | Status before this round | What changed |
|---|---|---|
| §7-9 `SA_MASTER` tenants + `tenant_databases` | `tbl_tenant_master` already had `DB_Host/Port/Name/User/Password/SSL` columns, and a real `Tenant_ID = 'SA_MASTER'` row already existed | No change |
| §10 Branches | `tbl_branch_master` | No change |
| §46/51 cloud API resolves tenant → DB connection | `tenantDbResolver.js` | No change |
| §69 Audit logs | `tbl_audit_log` | No change |
| §52 Desktop app | `desktop/` Electron scaffold | No change |
| §20 Device registration | **Did not exist** | Added `tbl_device_master` |
| §7 Application versions | **Did not exist** | Added `tbl_app_version_master` |
| §7 Subscriptions | Only `tbl_license_master` (activation/expiry), no billing-plan concept | Added `tbl_subscription_plan_master` + `tbl_tenant_subscription` |
| §7 System configuration | **Did not exist** | Added `tbl_system_setting` |
| §30 `sync_queue` | **Did not exist** | Added `tbl_sync_queue` |
| §69-style sync history / §82 dashboard | **Did not exist** | Added `tbl_sync_log` |
| §33 offline-safe unique IDs | All 134 tables used integer/bigint auto-increment PKs only | Added a `Sync_UUID` column to every table that has a `Tenant_ID` column (113 tables) — **see below for why the PK itself wasn't replaced** |

## The PK decision: Sync_UUID column, not a UUID primary key

The plan (§33) is correct that a bare `AUTO_INCREMENT` integer is unsafe as
the *cross-device sync identity* for a record — two offline devices can
each mint `Sale_ID = 501` independently, and there is no way to merge that
after the fact. Where the plan's literal instruction ("use UUIDs" as the
ID) would have been expensive to follow: it means replacing the PK — and
every FK pointing at it — on all 134 already-built tables.

The distinction that matters: an integer PK is only unsafe as a *sync* key.
It's still perfectly fine as a *local storage* key — joins, indexes, and
FK integrity within one device's own database don't care whether two
different tenants' `Sale_ID` sequences happen to collide, because they're
never compared to each other locally.

So the schema now carries **both**:
- The existing integer/bigint PK — unchanged, still what every FK in the
  schema points at, still what every existing query and route uses.
- `Sync_UUID` — a `uuid` (Postgres) / `CHAR(36)` (MySQL) column, generated
  independently by whichever device creates the row
  (`DEFAULT gen_random_uuid()` / `DEFAULT (UUID())`), globally unique
  regardless of tenant or device, `UNIQUE` constrained, never used as a FK
  target. This is the column `tbl_sync_queue.Record_Sync_UUID` and
  `tbl_sync_log.Record_Sync_UUID` actually key off — it's what lets the
  sync engine recognize "this is the same real-world record" across two
  databases that assigned it two different integer IDs.

Added mechanically (every table with a `Tenant_ID` column got one — the
same boundary the schema already uses everywhere else to mean "tenant
business data, not global reference data"), not hand-picked, so it doesn't
silently miss a table.

## SA_MASTER tables: control-plane only, not in the local schema

`tbl_device_master`, `tbl_app_version_master`, `tbl_subscription_plan_master`,
`tbl_tenant_subscription`, and `tbl_system_setting` describe the *platform
operator's* view of the world (which devices exist across every tenant,
which app version is current, who's on which billing plan) — not any one
shop's data. Like `tbl_tenant_master` itself, they're excluded from
`mysql_local_schema.sql` entirely (see `DROP_TABLES` in the translator
script). A shop's local MySQL install has no reason to know about any
tenant other than itself.

They're also deliberately **not** registered in `tbl_erp_modules` — that
registry gates which tenant-facing modules appear in a shop's own menu by
business type; device/version/billing management isn't a shop's module to
toggle, it's the platform operator's own always-on backend.

## The sync tables live per-tenant, in both engines

`tbl_sync_queue` and `tbl_sync_log` are ordinary `Tenant_ID`-scoped tables —
present in both `postgres_cloud_schema.sql` and `mysql_local_schema.sql`,
same shape. Sync is bidirectional (§57): a local MySQL install queues its
own offline-created rows to push up; a tenant's cloud database queues
changes (e.g. a price update made from the web app) to push down to
specific devices. Same table, whichever side originated the change.

`Device_ID` on both tables is a plain indexed string, **not** a foreign key
to `tbl_device_master` — that table lives in the SA_MASTER control-plane
database, a different database (and for the local MySQL copy, a different
*engine entirely*) than the tenant database these sync tables live in, so
it can't carry a real constraint across that boundary. Validate it at the
application layer instead.

## Worked example, using the doc's own §27-28 scenario

> Customer buys a Gold Chain, 10.250g, offline, on device `THJ-SKH-PC-001`.

1. Device creates a row in `tbl_sales_header` (local MySQL). It gets
   `Sale_ID = 501` (local auto-increment) and
   `Sync_UUID = 4f70...d64` (generated by MySQL's `DEFAULT (UUID())` at
   insert time, no server round-trip needed).
2. The app inserts a matching row into `tbl_sync_queue`:
   `Table_Name = 'tbl_sales_header'`, `Record_ID = 501`,
   `Record_Sync_UUID = '4f70...d64'`, `Operation = 'INSERT'`,
   `Payload = {...full row...}`, `Status = 'Pending'`.
3. Internet returns. The (not-yet-built) sync service reads
   `tbl_sync_queue` where `Status = 'Pending'`, POSTs the payload to the
   cloud API.
4. Cloud API checks `tbl_sync_log` for that `Record_Sync_UUID` — not found,
   so this is new. It inserts into the tenant's **cloud** `tbl_sales_header`
   (getting a different integer `Sale_ID`, say `2044`, but the *same*
   `Sync_UUID`), then writes a `tbl_sync_log` row with
   `Status = 'SUCCESS'`, `Direction = 'LOCAL_TO_CLOUD'`.
5. Local `tbl_sync_queue` row flips to `Status = 'Synced'`.
6. If step 3 gets retried after a network drop mid-request (idempotency,
   §67-68): the cloud API's `tbl_sync_log` lookup by `Record_Sync_UUID`
   finds the already-successful row and returns success without inserting
   a second sale — this is exactly why `Record_Sync_UUID`, not the local
   integer `Record_ID`, is the dedupe key.

## Still not built — this round was schema only

- The actual sync service (upload/download/retry/conflict logic) —
  `sync/sync-engine.js`, `sync/upload.js`, `sync/download.js`,
  `sync/conflict.js` per the plan's own §45 structure. No code exists yet.
- The local MySQL runtime and dual-adapter repository layer (§44-45) — no
  `mysql2` driver, no `repositories/mysql` vs `repositories/postgres` split
  in `server/`.
- Conflict resolution policy (§38) — which rule (server-wins / latest-wins /
  manual approval) hasn't been chosen yet; `tbl_sync_log.Conflict_Resolution`
  is ready to record whichever gets decided.
- Device registration API endpoints, subscription/billing API, and the
  admin sync-monitoring dashboard (§82) — no routes exist against the new
  tables yet, only the tables themselves.
