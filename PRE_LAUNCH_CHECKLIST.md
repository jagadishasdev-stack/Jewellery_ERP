# Pre-Launch Checklist — before this goes live for a real customer

Status as of 2026-08-08 (updated after the sync engine + test suite pass). ✅ = done and verified. ⬜ = still needs action, owner noted.

## Security

- ✅ **JWT secrets rotated** — `server/.env` (dev) and root `.env` (docker-compose/production) now hold independently-generated random secrets instead of the shipped placeholders (`..._change_me`, `securepass`). Rotating these invalidated every previously-issued login token.
- ✅ **`docker-compose.yml` no longer hardcodes secrets** — reads `${DB_PASSWORD}`, `${JWT_SECRET}`, `${JWT_REFRESH_SECRET}` from a root `.env` (gitignored). `.env.example` added as the safe, committable template.
- ✅ **DLJ admin password rotated** — the demo password (`Dlj@2026`) I originally set is no longer valid. New credential handed to you directly (see chat), not written to any file in this repo.
- ✅ **`SUPER_ADMIN_PASSWORD` rotated** — live bcrypt hash changed directly (not by editing `.env`, which only seeds it once at first run). New credential given to you in chat.
- ✅ **All 37 real imported staff passwords reset** — see `server/local-db/dlj/STAFF_TEMP_PASSWORDS.csv` (chmod 600). Found and fixed a real blocker while doing this: every imported staff account had `Role_ID = NULL`, meaning **none of them could ever have logged in** regardless of password — see `server/local-db/dlj/STAFF_ACCOUNT_NOTES.md` for the Department→Role mapping used and which 6 accounts were disabled instead of role-assigned (Cafeteria/Security/House Keeping/Pantry — review that decision).
- ⬜ **These are temporary passwords** — there's no forced-reset-on-first-login flow built yet, so getting these to the 31 active staff and having each one change it promptly is a manual step on your end, not something the system enforces.
- ⬜ **Owner decision needed:** `tbl_user_master.Default_Password` stores every user's password **in plaintext** "for admin support lookup" (existing behavior, not something I added). This is a real risk if the database is ever read by the wrong party — decide whether to keep this support convenience or remove the column and rely solely on the bcrypt hash.
- ⬜ **Get a real domain + TLS certificate.** `nginx.conf` now has a complete HTTPS server block ready to go (redirects HTTP→HTTPS, HSTS, TLS 1.2/1.3 only) — it just points at placeholder certificate paths (`/etc/nginx/ssl/...`) until you run `certbot --nginx -d yourdomain.com` or provision certs another way. **`docker compose up` will fail to start nginx until this is done** — that's intentional, not a bug, so nobody accidentally ships plain HTTP.
- ⬜ Consider enabling Helmet's Content-Security-Policy (currently `contentSecurityPolicy: false` in `server/src/index.js`) — left off deliberately rather than risk breaking the app with an untested CSP; needs a proper pass to write a policy that matches what the app's frontend actually loads.

## Backups

- ✅ **Daily automated backup installed and tested** — `com.jewelleryerp.dlj-backup` launchd job runs at 2 AM daily, backs up both the cloud DLJ tenant data and the full local MySQL database, keeps 14 days, prunes older ones. Test-ran it manually once to confirm it actually works, not just that the schedule exists.
- ⬜ **Owner:** decide on an *off-site* copy of these backups (currently they live on the same machine as the databases — fine against "oops I fat-fingered a DELETE," not fine against "this laptop dies").

## Infrastructure resilience

- ✅ **Local MySQL converted to a real launchd service** (`com.jewelleryerp.dlj-mysql`) — auto-starts on login, auto-restarts if it crashes. Tested by force-killing the process directly; launchd brought it back within seconds with zero data loss (verified: all 72,606 customers still present after the kill).
- ⬜ **This whole setup runs on one Mac.** There's no actual cloud hosting yet — "deploy" today means "point a browser at this laptop's IP," not a real production environment. Real deployment means provisioning an actual server/VM (the `docker-compose.yml` + `Dockerfile`s already exist for this) and pointing DNS at it.

## Data correctness (needs the business owner — see `BUSINESS_OWNER_QUESTIONS.md`)

- ⬜ `stock.status` meaning unconfirmed — my "S = Sold" guess was tested against real sales history and **disproved**; don't trust stock-availability reports until this is answered.
- ⬜ `attendance.statusid` meaning unconfirmed — every imported record currently says "Present" as a placeholder.
- ⬜ ~17,000 customers sharing one placeholder phone number — worth a decision on whether/how to follow up.
- ⬜ `member`/`members` legacy loyalty-club data — never imported, still unresolved whether it's a distinct program.

## Regulatory / compliance (India-specific, needs the business owner)

- ⬜ Confirm whether GST e-invoicing is legally required (turnover-based threshold) — if yes, the e-Invoice module needs real GSP credentials; right now it honestly refuses rather than faking one.
- ⬜ Data protection posture for 72,606 real people's PII now living in this system — access control, retention, and breach-notification plan, relevant under India's DPDP Act.

## Sync engine + automated tests (added since the section above was first written)

- ✅ **Sync engine cloud API is real and tested** — `POST/GET /api/sync/upload|download|status` (`server/src/routes/sync.js`), covering a whitelist of the highest-value offline tables (customers, ornaments, sales header/details). Tested end-to-end with simulated device payloads, including proving idempotency (same record re-submitted twice → no duplicate row) — this caught and fixed a real bug where a legitimate UPDATE to an already-synced row was being silently dropped. **Still missing:** there is no actual local-device client anywhere that calls this — it's the cloud half of the contract only, useful the moment a real offline MySQL client is built, not before.
- ✅ **Automated test suite added** — `server/tests/` (Jest + Supertest, `npm test`), 14 tests covering tier-gating math, the sync engine (including a permanent regression test for the bug above), and Excel import's partial-batch behavior. Deliberately scoped to what was built this session, not the other ~100 pre-existing routes — see `server/tests/README.md`.
- **Tally integration** — honest stub, only relevant if the answer to Q6 in `BUSINESS_OWNER_QUESTIONS.md` is yes.

## Bottom line
Not yet safe to hand real customer traffic to — but for a different reason than before. Every item that was purely technical is now done. What's left is exclusively:
1. **Infrastructure you have to actually go do**: a real domain + TLS certificate, real off-site backups, deciding on a real hosting VM instead of this laptop.
2. **Answers only you know**: the 6 questions in `BUSINESS_OWNER_QUESTIONS.md` (stock status codes, attendance codes, the shared-phone-number customers, the legacy members table, GST e-invoicing applicability, Tally usage) — per your own instruction, these are staying as placeholders on purpose until you fill them in yourself before the real handoff.
3. **A decision, not a task**: whether to keep storing plaintext passwords for admin lookup.

Nothing on this list is something I can complete for you without either your infrastructure or your business knowledge.
