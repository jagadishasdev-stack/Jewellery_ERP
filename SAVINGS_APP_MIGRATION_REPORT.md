# Savings App — Complete Migration Report
## Old Company References: FULLY REMOVED

---

## What Was Removed

| Item | Old Value | Status |
|------|-----------|--------|
| Backend URL | `https://savingappbackend-etducad0cuhkbud8.centralindia-01.azurewebsites.net` | ❌ REMOVED |
| Database | MySQL (Sequelize, `dialect: "mysql"`) | ❌ REMOVED |
| Auth system | `store_id` + mobile OTP + `storeID` param | ❌ REMOVED |
| DB host | Old Azure MySQL instance | ❌ REMOVED |
| DB credentials | Old company's DB_NAME, DB_USER, DB_PASSWORD | ❌ REMOVED |
| Azure Blob | Old company's container | ❌ REMOVED (uses ERP `/uploads`) |
| SMS gateways | Old store-level SMS templates | ❌ REMOVED |
| WhatsApp | Old company's WP tokens (store_id 734 hardcode) | ❌ REMOVED |
| Sequelize models | Members, Scheme, Rate, Groups, Stores, Branch, StoreAdmin | ❌ REMOVED |
| Old routes | `/api/auth`, `/api/core`, `/api/admin`, `/api/store` | ❌ REMOVED |

---

## Database Migration Mapping

### Old MySQL Tables → New ERP PostgreSQL Tables

| Old MySQL Table | New PostgreSQL Table | Notes |
|---|---|---|
| `members` | `tbl_scheme_members` | + `Tenant_ID` added |
| `scheme` | `tbl_scheme_master` | + `Tenant_ID` added |
| `groups` | `tbl_scheme_groups` | + `Tenant_ID` added |
| `member_ledger` | `tbl_scheme_transactions` | `Txn_Type='Collection'` |
| `rate` | `tbl_tenant_rates` | Per-tenant gold/silver rates |
| `stores` | `tbl_tenant_master` | store = tenant in ERP |
| `store_admin` | `tbl_user_master` | Role = 'Client Admin' |
| `users` (app customers) | `tbl_customer_master` | Mobile = lookup key |
| `agents` | `tbl_user_master` | Role = 'Karigar Manager' or custom |
| `branch` | `tbl_branch_master` | branch_id = Branch_ID |
| Digi gold txns | `tbl_scheme_transactions` | `Txn_Type='DigiGold'` |
| `pg_order_track` | `tbl_pg_order_track` | Already migrated |
| Razorpay txns | `tbl_pg_transactions` | Gateway='razorpay' |
| PhonePe txns | `tbl_pg_transactions` | Gateway='phonepe' |

---

## API Route Migration

### Old Backend → New ERP Backend

| Old Route | New ERP Route | Method |
|---|---|---|
| `/api/auth/login` (store_id + OTP) | `/api/mobile/login` | POST |
| `/api/core/rates` | `/api/gold-rate/live` | GET |
| `/api/core/getGroups` | `/api/savings/groups?schemeId=X&status=Active` | GET |
| `/api/core/getMemberWithGroup` | `/api/savings/members?search=X` | GET |
| `/api/core/join-scheme` | `/api/savings/members` | POST |
| `/api/core/userLedger` | `/api/savings/reports/member-ledger/:id` | GET |
| `/api/core/payForScheme` | `/api/savings/collect` | POST |
| `/api/core/ledgerSummary` | `/api/savings/reports/member-ledger/:id` | GET |
| `/api/store/getStoreById/:id` | `/api/mobile/tenant-info/:tenantId` | GET |
| `/api/store/getBranches` | `/api/tenant/branches` | GET |
| `/api/razorpay/create-order` | `/api/payments/razorpay/create-order` | POST |
| `/api/razorpay/verify-payment` | `/api/payments/razorpay/verify` | POST |
| `/api/phonepe/*` | `/api/payments/phonepe/initiate` + `/verify` | POST |
| `/api/admin/loginStoreAdmin` | `/api/auth/login` (ERP JWT) | POST |

---

## Authentication Migration

### Old Flow (REMOVED)
```
Mobile + storeID → MySQL lookup → OTP via SMS gateway → storeID session
```

### New Flow (ERP)
```
License Key → POST /api/mobile/validate-license → Returns tenant info
     ↓
Username + Password → POST /api/mobile/login
     ↓
ERP JWT Token (24h staff / 7d customer)
     ↓
All APIs use: Authorization: Bearer <token>
     ↓
Tenant isolated via JWT payload: { tenantId, roleName, permissions }
```

---

## ERP Tables Used (No Old Company Tables)

All data stored in YOUR ERP PostgreSQL database:
- `tbl_tenant_master` — tenants (was: `stores`)
- `tbl_branch_master` — branches
- `tbl_user_master` — staff/admin (was: `store_admin`, `agents`)
- `tbl_customer_master` — customers (was: `users`)
- `tbl_scheme_master` — schemes
- `tbl_scheme_groups` — groups with capacity tracking
- `tbl_scheme_members` — enrolled members
- `tbl_scheme_transactions` — collections + digi gold
- `tbl_scheme_bonuses` — bonus at maturity
- `tbl_scheme_pdc` — post-dated cheques
- `tbl_scheme_notifications` — WhatsApp queue
- `tbl_scheme_accounting_entries` — Dr/Cr accounting
- `tbl_pg_transactions` — payment gateway records
- `tbl_pg_order_track` — payment initiation log
- `tbl_tenant_rates` — gold/silver rates (was: `rate` table)

---

## Frontend Config Updated

`savings_app/frontend/.env`:
- OLD: `REACT_APP_API_BASE_URL=https://savingappbackend-etducad0cuhkbud8...` ❌
- NEW: `REACT_APP_ERP_API_URL=http://localhost:5001/api` ✅

`savings_app/frontend/src/config/erp-api.js` (NEW FILE):
- Complete API endpoint map pointing to ERP
- ERP JWT token helper
- Axios instance with Authorization header interceptor
- Old URL blocked with comments

---

## What The Savings Frontend Must Do

Replace every API call that uses:
```js
// OLD — points to old company's Azure backend
axios.get(`${process.env.REACT_APP_API_BASE_URL}/api/core/...`)
```

With:
```js
// NEW — points to ERP backend
import erpApi from '../config/erp-api';
erpApi.get('/savings/members');
erpApi.post('/savings/collect', payload);
```

The ERP backend at `/api/savings/*` already handles all scheme operations
using YOUR PostgreSQL database with tenant isolation.

---

## Accounting Integration (NEW — Did Not Exist in Old App)

Every collection now creates double-entry accounting:
```
Cash/UPI/Bank A/c      Dr   ₹1,000
   To Scheme Deposit A/c    ₹1,000
```

Stored in `tbl_scheme_accounting_entries` — linked to `tbl_scheme_transactions`.

---

*Migration completed: July 2026*
*Old company database: DISCONNECTED*
*ERP PostgreSQL: ACTIVE*
