# Business Type × Subscription Tier — how screen visibility actually works

Two independent gates control what a tenant's users see in the sidebar. **A module only shows up if it passes both.**

```
Final visibility = (Business Type allows it)  AND  (Subscription Tier includes it)  AND  (staff role has permission)
```

## Gate 1: Business Type (Retailer / Wholesaler / Manufacturer / Hybrid) — already existed, verified working

This was already fully built before this round — every module in `tbl_erp_modules` has `Default_Retailer` / `Default_Wholesaler` / `Default_Manufacturer` / `Default_Hybrid` boolean columns, and `GET /api/modules/tenant-context` returns the right subset based on the tenant's declared `Business_Type`. Verified live:

| Business Type | Modules enabled |
|---|---|
| Retailer | 36 |
| Wholesaler | 29 |
| Manufacturer | 18 |
| Hybrid | 42 (all) |

A Manufacturer gets `goldsmith`/`manufacturing`/`job_work` but never sees `retail_sales`/`old_gold`/`savings_scheme`. This is managed today from **Admin → Module Management → Change Business Type**.

## Gate 2: Subscription Tier (Gold / Platinum / Diamond) — new this round

`tbl_subscription_plan_master` holds 3 rows (Gold/Platinum/Diamond), each with a `Features_JSON` array of the exact `Module_Key`s that tier unlocks — cumulative, so Diamond's list already contains everything Platinum has, which already contains everything Gold has. A tenant is linked to one via `tbl_tenant_subscription` (one Active row at a time). **Only a Super Admin can assign or change a tenant's tier** (`PUT /api/modules/tier/:tenantId`) — verified that a tenant's own Client Admin gets a 403 trying to do this themselves.

**A tenant with no subscription assigned at all is not restricted by this gate** — tier-filtering only activates once someone explicitly assigns a plan. This was a deliberate choice so the 8 pre-existing tenants weren't suddenly broken by a feature added after they were created.

### 🥇 Gold — 15 modules
`dashboard`, `masters`, `inventory`, `barcode`, `retail_sales`, `wholesale_sales`, `estimate`, `order_booking`, `sales_return`, `purchase`, `old_gold`, `customers`, `accounts`, `reports`, `settings`

Maps to the requested list: Billing & Invoicing, Stock Management, Product/Barcode Management, Customer Management, Purchase & Sales, Basic Reports. *(User Management and Gold Rate Management aren't separately gated — see "Not gateable" below.)*

### ⚪ Platinum — 30 modules (Gold + 15)
adds: `stock_transfer`, `floors`, `goldsmith`, `manufacturing`, `job_work`, `gst_reports`, `day_close`, `savings_scheme`, `digi_gold`, `lucky_draw`, `sms_whatsapp_integration`, `user_permission_overrides`, `bank_cheque`, `dealers`, `repair`

Maps to: Multi-branch (`floors`), Karigar Management (`goldsmith`/`manufacturing`/`job_work`), Detailed Financial Reports (`gst_reports`), Scheme/Savings Management, WhatsApp/SMS integration, Advanced user permissions (`user_permission_overrides`).

### 💎 Diamond — 46 modules (Platinum + 16, everything)
adds: `approval_module`, `invoice_studio`, `pawnbroking`, `insurance_amc`, `hr_payroll`, `crm`, `rate_booking_agent_commission`, `hsn_einvoice_loyalty`, `manufacturing_bom`, `guarantor_certification`, `reorder_rfid_card_charges`, `tally_bridge`, `sync_engine`, `advanced_analytics_dashboard`, `audit_logs`, `payment_gateway_integration`

Maps to: Approval workflows (`approval_module`), Advanced analytics/dashboard, Audit logs, Payment gateway integration, Branch-wise stock synchronization (`sync_engine`), Advanced customization (`invoice_studio`).

**My own judgment call, not from your original spec**: the 7 modules built in earlier rounds that your Gold/Platinum/Diamond list never mentioned at all — Pawnbroking, Insurance/AMC, HR/Payroll, CRM, Rate Booking/Agent Commission, Manufacturing BOM, Tally Bridge — I placed all of them at Diamond, as the most conservative choice (easier to move something down a tier later than to have over-granted it). **Review this — you may want some of these at Platinum instead.**

### Not real toggleable screens — flagged, not silently ignored
These bullets from your original list don't correspond to a single screen that can be shown/hidden, so they're not part of `Features_JSON` at all:
- **Multi-company/Multi-tenant, Centralized master database** — this is the SA_MASTER control-plane architecture itself, not a per-tenant screen.
- **Unlimited branches** — handled by `Max_Branches` on `tbl_subscription_plan_master` (Gold=1, Platinum=5, Diamond=999), a numeric limit, not a module.
- **Head-office control** — no single screen; closest existing equivalent is `approval_module` + `floors`, already tier-gated.
- **API integrations, Mobile + Desktop + Web, Priority support** — these are platform/business promises, not UI a role-based toggle can hide.
- **User Management, Gold Rate Management** — exist today gated by role permission only (`permissions.tenant_management`) or always-on (gold rate bar), not by Module_Key. Since they're meant to be in every tier anyway, this has no practical effect — flagged here for completeness, not because it's broken.

## How to change any of this
- **Which modules a tier includes**: edit `Features_JSON` directly on the relevant `tbl_subscription_plan_master` row — no code change needed.
- **A tenant's tier**: Admin → Module Management → "Change Subscription Tier" (Super Admin login required), or `PUT /api/modules/tier/:tenantId`.
- **A tenant's business type**: same page, "Change Business Type" section (already existed).

## Verified live, this session
```
DLJ (Business_Type=RETAILER, 36 modules) × Platinum tier (30 modules) → 25 modules actually visible
Confirmed hidden: pawnbroking, hr_payroll, crm, sync_engine, approval_module (all Diamond-only)
Confirmed visible: savings_scheme, bank_cheque, repair, stock_transfer (Platinum, valid for Retailer)
Confirmed: DLJ's own Client Admin gets 403 trying to change their own tier — only Super Admin can.
```
