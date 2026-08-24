# Jewellery ERP — Complete Data Flow Documentation

## Every transaction is traceable with: User · DateTime · Branch · Device · IP · Previous Value · Updated Value

---

## 1. AUTHENTICATION FLOW

```
Browser → POST /api/auth/login { username, password, tenantId }
  └─ Validate credentials (bcrypt)
  └─ Check tenant license + account status
  └─ Check lockout (5 failed attempts = 30min lock)
  └─ Generate JWT (24h) + RefreshToken (7d)
  └─ Create session in tbl_session_master (IP, Device, Timestamp)
  └─ Audit Log → tbl_audit_log { Action_Type: LOGIN, Username, IP, Device }
  └─ Return { token, refreshToken, sessionId, user }

Client → stores in localStorage via zustand persist
Client → sets Authorization: Bearer <token> on every request via axios interceptor
```

---

## 2. SALES / BILLING FLOW

```
Customer walks in
  └─ POS Screen (/pos)
  └─ Barcode scan → GET /api/ornaments/barcode/:code
  └─ Item added to cart (cartStore.js — Zustand)
  └─ Socket.IO → emit 'cart:update' → CustomerDisplay screen updates in real time

Checkout pressed
  └─ PAN check if bill ≥ ₹2,00,000
  └─ Scheme adjustment fetched: GET /api/savings/members?status=Active|Matured
  └─ Gift voucher validated: GET /api/day-close/vouchers/:code
  └─ Old gold value calculated client-side (calculateOldGoldExchange)
  └─ Multi-payment splits set (Cash + UPI + Scheme + Voucher + Advance)

Confirm Sale → POST /api/sales/create
  └─ Transaction BEGIN
  │    tbl_sales_header  ← invoice number, customer, totals, weights, payments
  │    tbl_sales_details ← per item: article, gross_wt, net_gold_wt, stone_wt,
  │                         purity, rate, making, wastage, gst, total_price
  │    tbl_sales_payments ← per payment mode: Cash₹X, UPI₹Y, Scheme₹Z
  │    tbl_ornament_master.Is_Sold = true (marks items as sold)
  │    tbl_customer_master.Total_Purchase_Value += finalPayable
  │    tbl_customer_master.Loyalty_Points += floor(amount/1000)
  │    tbl_saving_scheme_enrollment.Status = 'Redeemed' (if scheme used)
  │    tbl_scheme_transactions ← scheme maturity adjustment record
  └─ Transaction COMMIT
  └─ Audit Log → INSERT on tbl_sales_header with full sale data
  └─ WhatsApp notification queued in tbl_scheme_notifications
  └─ Socket.IO → emit 'checkout:complete' → CustomerDisplay clears
  └─ printThermalReceipt() → opens 80mm print window

WEIGHT DATA on every bill:
  - Gross Weight: total physical weight including stones
  - Net Gold Weight: gross minus stone weight (actual gold)
  - Stone Weight: diamond/gemstone weight
  - All three stored in tbl_sales_header (Total_*) and tbl_sales_details per item
```

---

## 3. INVENTORY / STOCK FLOW

```
Add Stock → POST /api/ornaments
  └─ tbl_ornament_master ← Article_Number (auto-gen), Type, Purity, HUID,
                            Gross_Weight, Net_Gold_Weight, Stone_Weight,
                            Current_Gold_Rate, Making_Charge, Total_Price,
                            Physical_Location, Stock_Entry_Type
  └─ Barcode label printable immediately

Edit Stock → PUT /api/ornaments/:id
  └─ Fetch old record first (for diff)
  └─ Update tbl_ornament_master
  └─ Audit Log → UPDATE with { oldData: {...}, newData: {...} }
  └─ buildDiff() captures exact field changes: { field: { from: X, to: Y } }

Delete Stock → PUT /api/ornaments/:id { Is_Active: false }
  └─ Soft delete only — record preserved
  └─ Audit Log → DELETE action with full old data preserved
```

---

## 4. PURCHASE FLOW

```
Purchase Hub → POST /api/purchase/create
  └─ tbl_purchase_header ← supplier, date, type, total, payment mode
  └─ tbl_purchase_details ← per item: type, purity, gross_wt, stone_wt, rate, making
  └─ Optionally creates tbl_ornament_master records (Create_Inventory: true)
  └─ Audit Log → INSERT

Approve → POST /api/purchase/:id/approve
  └─ Status changes Draft → Approved
  └─ Audit Log → UPDATE { Status: Draft → Approved }
```

---

## 5. SAVINGS SCHEME FLOW

```
Member Enrollment → POST /api/savings/members
  └─ tbl_scheme_members ← Member_Number, Group, Scheme, Installment_Amount,
                           Maturity_Date, Maturity_Value, Status: Active
  └─ tbl_scheme_groups.Current_Members += 1
  └─ WhatsApp welcome notification queued

Monthly Collection → POST /api/savings/collect
  └─ Transaction BEGIN
  │    tbl_scheme_transactions ← Receipt_Number, Installment_No, Amount, Mode
  │    tbl_scheme_members.Installments_Paid += 1
  │    tbl_scheme_members.Total_Amount_Paid += amount
  │    If last installment: Status = 'Matured', tbl_scheme_bonuses ← bonus
  └─ Transaction COMMIT
  └─ WhatsApp receipt notification queued

Scheme Adjustment in Sale (see Sales Flow above)
  └─ tbl_saving_scheme_enrollment.Status = 'Redeemed'
  └─ tbl_scheme_transactions ← Txn_Type: 'Maturity'
  └─ Sale reflects Scheme_Adjustment_Amount in tbl_sales_header
```

---

## 6. AUDIT & SECURITY FLOW

```
Every API mutation calls auditLog() from server/src/utils/auditLogger.js

auditLog({ tenantId, userId, tableName, recordId, actionType, oldData, newData, description, req })
  └─ Captures:
  │    Username, Full_Name        — WHO made the change
  │    Created_Date               — WHEN (server timestamp, not client)
  │    IP_Address                 — WHERE from (x-forwarded-for aware)
  │    Device_Info (User-Agent)   — WHAT device/browser
  │    Branch_ID                  — WHICH branch (from JWT)
  │    Table_Name + Record_ID     — WHAT record was changed
  │    Action_Type                — HOW: INSERT/UPDATE/DELETE/LOGIN/PRINT/APPROVE
  │    Old_Data (JSON)            — PREVIOUS state
  │    New_Data (JSON)            — NEW state
  └─ Stored in tbl_audit_log (indexed on Tenant_ID, Created_Date, User_ID, Action_Type)

buildDiff(oldObj, newObj) → returns { field: { from: X, to: Y } } for each changed field

Admin can view at /admin/audit:
  - Security Dashboard (live summary, today's actions, active sessions)
  - Full Audit Log (filterable by user/action/table/date, CSV export)
  - User Activity (per-user action counts: creates/updates/deletes/logins/prints)
  - Deleted Entries (soft-deleted records with preserved data)
  - Active Sessions (force-terminate suspicious sessions)
  - Login History (every login/logout with IP + device)
  - Change Detail Modal (side-by-side Previous Value → New Value diff)
```

---

## 7. ROLE-BASED ACCESS CONTROL

```
Roles in tbl_role_master, Permissions as JSONB column.

Permission keys:
  sales              → POS, billing, sales reports
  inventory          → Stock management, add ornaments
  karigar_management → Issue/return gold, karigar settlement
  accounts           → Financial reports, day close
  edit_invoice_template → Invoice Studio
  tenant_management  → Users, display settings, Admin Dashboard, Audit
  global_master      → Super admin — all tenants, all data

JWT payload includes permissions object — checked on every API route via:
  requirePermission('sales')(req, res, next)

Frontend ProtectedRoute checks user.permissions[key] before rendering
Sidebar items are conditionally shown based on same permission checks
```

---

## 8. NET WEIGHT — Where It Appears

| Location | Field | Formula |
|---|---|---|
| tbl_ornament_master | Net_Gold_Weight | Entered at stock entry time |
| tbl_sales_details | Net_Gold_Weight | Copied from ornament at sale time |
| tbl_sales_header | Total_Net_Gold_Weight | SUM of all items in sale |
| POS Cart table | Net Wt column | Net_Gold_Weight - Stone_Weight |
| POS Bill Summary | Total Net Gold Weight | SUM across all cart items |
| Thermal Receipt | Net Gold: XXXg | Printed per item + total |
| Barcode Label | N: XXXg | Printed on physical tag |
| Stock Management | Net column | Per row in table |
| Reports (sales) | Total net weight | Aggregated in summary |

---

## 9. WHATSAPP NOTIFICATION FLOW

```
Sale created → customer has mobile number
  └─ Message composed: Invoice No, Amount, Date
  └─ INSERT into tbl_scheme_notifications { Channel: 'WhatsApp', Status: 'Pending' }
  └─ Non-blocking (fire and forget)
  └─ Background worker (to be configured) polls Pending records and sends via API

Scheme collection
  └─ Same queue: Receipt number, installment progress
  └─ Member maturity → congratulations message
  └─ Lucky draw winner → prize notification
```

---

## 10. DATABASE TABLES REFERENCE

| Table | Purpose |
|---|---|
| tbl_tenant_master | Multi-tenant shop registry |
| tbl_user_master | Users with roles |
| tbl_role_master | Roles with JSONB permissions |
| tbl_session_master | Active login sessions |
| tbl_audit_log | **Every action — full traceability** |
| tbl_ornament_master | All stock items |
| tbl_sales_header | Bill headers |
| tbl_sales_details | Per-item line items |
| tbl_sales_payments | Multi-payment breakdown |
| tbl_purchase_header | Purchase bills |
| tbl_purchase_details | Per-item purchase lines |
| tbl_customer_master | Customer CRM |
| tbl_scheme_members | Savings scheme members |
| tbl_scheme_transactions | Installment collections |
| tbl_scheme_groups | Scheme batch groups |
| tbl_scheme_master | Scheme templates |
| tbl_scheme_notifications | WhatsApp message queue |
| tbl_scheme_bonuses | Maturity bonus records |
| tbl_gift_vouchers | Gift voucher issuance |
| tbl_day_close | Daily closing records |
| tbl_vendor_master | Suppliers & karigar |
| tbl_issue_to_karigar | Gold issue records |
| tbl_item_type_master | Item type master |
| tbl_purity_master | Gold purity codes |
| tbl_tenant_rates | Per-tenant gold rates |

---

*Generated: July 2026 | Jewellery ERP v1.0*
