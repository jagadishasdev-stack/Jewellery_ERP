# 💎 Jewellery ERP Pro — Complete User Guide & Database Reference
**Version:** 1.0 | **Date:** June 2026 | **Stack:** React + Vite + Node.js + PostgreSQL

---

## TABLE OF CONTENTS
1. [Starting the Project](#1-starting-the-project)
2. [Login Credentials — All Users](#2-login-credentials)
3. [Super Admin Workflow](#3-super-admin-workflow)
4. [Client Shop Workflows](#4-client-shop-workflows)
5. [Complete Module Guide](#5-complete-module-guide)
6. [Billing Formula Examples](#6-billing-formula-examples)
7. [Karigar Workflow — End to End](#7-karigar-workflow)
8. [Floor Transfer Workflow](#8-floor-transfer-workflow)
9. [Database Queries Reference](#9-database-queries-reference)
10. [API Reference](#10-api-reference)
11. [Troubleshooting](#11-troubleshooting)

---

## 1. STARTING THE PROJECT

### Prerequisites
- Node.js 20+
- PostgreSQL 16 running locally
- Database `JewelleryERP` already created (done during setup)

### Start Commands

**Terminal 1 — Backend Server:**
```bash
cd /Users/a1989/Jewellery_ERP/server
npm run dev
# Server starts at http://localhost:5001
```

**Terminal 2 — Frontend:**
```bash
cd /Users/a1989/Jewellery_ERP/client
npm run dev
# App opens at http://localhost:5173 or 5174
```

**Health Check:**
```bash
curl http://localhost:5001/health
# Expected: {"status":"ok","service":"Jewellery ERP API"}
```

---

## 2. LOGIN CREDENTIALS

> **Redacted on purpose.** This file is committed to git, and git history is
> effectively permanent — actual passwords never belong in it, even for
> local dev-seed data. Real values live in `server/.env`
> (`SUPER_ADMIN_USERNAME`/`SUPER_ADMIN_PASSWORD`) and in the seed scripts
> referenced below (`001_seed_master_data.js`, `002_seed_four_clients.js`).
> Look there for the actual values — never re-add real passwords to this
> document.

### Super Admin (ERP Owner — YOU)
| Field | Value |
|-------|-------|
| Tenant ID | `SA_MASTER` |
| Username | `superadmin` |
| Password | *(see `server/.env` → `SUPER_ADMIN_PASSWORD`)* |

### 4 Demo Clients (Already Seeded)

| Shop | Tenant ID | Username | Password | City |
|------|-----------|----------|----------|------|
| Tulasi Honesty Jewels | `TULASI_BLR` | `tulasiadmin` | *(see seed script)* | Bangalore |
| Srinivasa Jewellers | `SRINIV_HYD` | `srinivadmin` | *(see seed script)* | Hyderabad |
| VK Mani Jewellers | `VKMANI_CHN` | `vkmaniadmin` | *(see seed script)* | Chennai |
| Dhanalakshmi Jewels | `DHANA_MYS` | `dhanaadmin` | *(see seed script)* | Mysore |

### Billing Staff (all shops)
| Field | Value |
|-------|-------|
| Username | `{tenantid_lowercase}_billing` (e.g. `tulasibrl_billing`) |
| Password | *(see seed script)* |

---

## 3. SUPER ADMIN WORKFLOW

As Super Admin you manage all client shops from a single login.

### Step 1 — Login as Super Admin
- Tenant ID: `SA_MASTER`
- Username: `superadmin`
- Password: *(see `server/.env` → `SUPER_ADMIN_PASSWORD`)*

### Step 2 — View All Clients
Go to **Admin → Tenants** to see all 4 shops with their:
- License expiry dates
- Max users / branches
- Status (Active/Inactive)

### Step 3 — Create a New Client Shop
Go to **Admin → Tenants → Create Tenant**

```
Example:
Tenant ID:        KALYAN_MUM
Company Name:     Kalyan Jewellers Mumbai
Brand Code:       KALYAN
License Key:      KALYAN-2026-ENT-X9Y0
License Expiry:   31-Dec-2027
Max Users:        20
Max Branches:     5
Admin Username:   kalyanadmin
Admin Password:   <choose a strong password here — never this literal example>
```

This auto-creates:
- Main branch
- Admin user account
- Default invoice template
- Customer display settings

### Step 4 — Set Gold Rate (broadcasts to all displays)
Go to **Gold Rate Bar (top of screen) → Pencil icon**
- Enter today's 22K rate (e.g. ₹6,200/g)
- Click **Update & Broadcast** → all customer screens update instantly


---

## 4. CLIENT SHOP WORKFLOWS

### WORKFLOW 1 — Morning Opening Procedure

**Login as shop admin:**
```
Tenant ID:  TULASI_BLR
Username:   tulasiadmin
Password:   (see seed script — not repeated here, see section 2's note)
```

**Dashboard shows:**
- Today's Sales (₹0 at start)
- Active Stock: 8 items (seeded)
- Pending Karigar: 0
- Low Stock Alerts

**Set today's gold rate:**
- Click pencil icon on gold rate bar
- Enter: 22K = ₹6,250/g, 24K = ₹6,850/g
- Click Update

---

### WORKFLOW 2 — Add New Stock (Purchase Entry)

Go to **Purchase → New Purchase Entry**

**Example: Receiving 3 gold items from supplier**

```
Supplier:         Select "Tulasi Honesty Jewels Gold Supplier"
Purchase Date:    Today
Supplier Bill No: SUP-INV-2026-001

Item 1:
  Type:         Necklace
  Purity:       22K
  Gross Weight: 25.500g
  Stone Weight: 0.700g
  Gold Rate:    ₹6,250/g
  Making/g:     ₹250
  Description:  Traditional Antique Necklace

Item 2:
  Type:         Ring
  Purity:       22K
  Gross Weight: 5.200g
  Stone Weight: 0.300g
  Gold Rate:    ₹6,250/g
  Making/g:     ₹200
  Description:  Ladies Fancy Ring

Item 3:
  Type:         Silver Ring
  Purity:       SIL925
  Gross Weight: 15.000g
  Gold Rate:    ₹82/g
  Making/g:     ₹50
```

Click **Save Purchase Entry & Add to Inventory**

**Result:**
- 3 ornaments auto-created in inventory
- Article numbers auto-generated (GLD-TULASIBRL-000101, etc.)
- Supplier balance updated
- Stock count increases on dashboard

---

### WORKFLOW 3 — POS / Billing (Selling an Item)

Go to **POS / Billing**

**Step 1: Select Customer**
Click **Select** → Search "Priya" → Select "Priya Sharma"

**Step 2: Add Items**
Type in barcode field: `GLD-TULASIBRL-000101` → press Enter
Item auto-fetches:
```
Gold Necklace | 22K | 25.500g | ₹1,59,412
```

**Step 3: Open Customer Display (Ctrl+F5)**
Press **Ctrl+F5** → second window opens showing customer their bill

**Step 4: Old Gold Exchange (optional)**
Click **Old Gold Exchange**
```
Old Gold Weight:  8.000g
Purity:          22K (91.67%)
Melting Deduct:  2%
Exchange Value:  ₹46,238 (auto-calculated)
```
Click **Apply Exchange** → deducted from bill

**Step 5: Checkout**
Click **CHECKOUT & PRINT**
```
Payment Mode:    UPI
Reference:       UPI123456789
Amount Paid:     ₹1,13,174 (after exchange)
```
Click **Confirm Sale & Print Invoice**

**Result:**
- Invoice created (INV-TULASIBRL-20260626-0001)
- Thermal receipt auto-prints
- Customer display shows "Thank You!"
- Stock marked as sold
- Customer loyalty points updated


---

## 5. COMPLETE MODULE GUIDE

### MODULE 1 — Inventory Management

**Add Ornament (Manual):** Inventory → Add Ornament
- Fill classification, weight, pricing
- Price Calculator auto-computes MRP
- Article Number auto-generated on save
- Print barcode label from detail drawer (click Eye icon)

**Key Fields:**
```
Article Number:  Auto (e.g. GLD-TULASIBRL-000201)
Gross Weight:    25.500g  (total including stones)
Stone Weight:    0.700g   (diamonds/gems weight)
Net Gold Weight: 24.800g  (auto = Gross - Stone)
Wastage %:       3%       (industry standard)
Gold Rate:       ₹6,250/g (auto-filled from live rate)
Making Charge:   ₹250/g
Purchase Cost:   Hidden from customers
```

**Pricing Formula:**
```
Gold Value       = Net Weight × Gold Rate
                 = 24.800 × 6,250 = ₹1,55,000
Making Charge    = Net Weight × Making/g
                 = 24.800 × 250  = ₹6,200
Wastage Amount   = (Net × 3%) × Gold Rate
                 = 0.744 × 6,250 = ₹4,650
────────────────────────────────────────
Taxable Value    = 1,55,000 + 6,200 + 4,650 = ₹1,65,850
GST (3%)         = 1,65,850 × 0.03          = ₹4,976
────────────────────────────────────────
TOTAL MRP        = ₹1,70,826
```

---

### MODULE 2 — Karigar Management

**Register Karigar:** Karigar → Karigar List → Add Karigar
```
Name:        Raju Kumar
Type:        Karigar
Skill:       Gold
Wastage %:   3.0% allowed
Bank A/C:    HDFC 123456789
```

**Issue Gold:** Karigar → Issue Gold
```
Karigar:      Raju Kumar
Design:       Traditional Necklace Design
Gold Weight:  100.000g
Purity:       22K
Gold Rate:    ₹6,250/g
Total Value:  ₹6,25,000
Wages Rate:   ₹200/g
Expected:     15-Jul-2026
```
→ Generates Issue # ISS-TULASIBRL-20260626-0001

**Return Goods:** Karigar → Return Goods
```
Select Issue: ISS-TULASIBRL-20260626-0001
Returned:     97.500g
Wastage:      2.500g (2.5% — within allowed 3%)
Quality:      ✅ Passed
```

**Monthly Settlement:** Karigar → Settlement
```
Karigar:    Raju Kumar
Period:     01-Jun to 30-Jun-2026

Gross Wages:      97.500g × ₹200 = ₹19,500
Wastage Deduct:    2.500g × ₹200 = ₹500
────────────────────────────────────────────
NET PAYABLE:                        ₹19,000
```
Click **Mark as Paid** → records payment

---

### MODULE 3 — Floor Management

**Setup Floors:** Floor Management → Floors & Counters → Add Floor
```
Branch:       Commercial Street Branch
Floor Code:   GF
Floor Name:   Ground Floor — Gold Section
Floor No:     0
```

**Add Counter to Floor:**
```
Floor:        Ground Floor
Counter Code: CTR-A
Counter Name: Gold Ring Counter
Type:         Showcase
Capacity:     50 pieces
```

**Assign Item to Floor:**
When adding ornament, set Physical_Location = `GF-CTR-A-R01`
(Format: FloorCode-CounterCode-RackNo)

---

### MODULE 4 — Stock Transfer (Floor/Branch)

**Create Transfer:** Stock Transfer → New Transfer

```
Transfer Type:  Floor Transfer
From Branch:    Commercial Street Branch
To Branch:      Commercial Street Branch (same for floor transfer)
Items:          Scan barcodes one by one

GLD-TULASIBRL-000101  (Gold Necklace)
GLD-TULASIBRL-000102  (Gold Ring)
```

**Approve Transfer:**
Manager clicks **Approve** → items physically move to new floor
System updates Physical_Location automatically

**Workflow:**
```
Billing staff creates request
       ↓
Manager approves
       ↓
Items moved on system
       ↓
Stock shows in new floor/counter
```


---

### MODULE 5 — Repair Orders

**New Repair:** Repair Orders → New Repair
```
Customer:           Priya Sharma
Mobile:             9876543210
Item Description:   Gold Necklace — 22K — 15g
Work Required:      Clasp broken, needs replacement
Karigar:            Raju Kumar
Estimate:           ₹500
Advance:            ₹200
Expected Delivery:  05-Jul-2026
```
→ Generates Job Card: JOB-TULASIBRL-20260626-0001

**Update Status:** Click Manage → change status
```
Received → In-Progress → Ready → Delivered
```

**Deliver Item:**
Click **Mark as Delivered** → records delivery, balance due collected

---

### MODULE 6 — Gold Saving Scheme

**Create Scheme:** Saving Schemes → Create Scheme
```
Code:           GS-11-1
Name:           Gold Savings 11+1 Plan
Metal:          Gold
Duration:       11 months
Free Months:    1
Monthly Amount: ₹5,000
Maturity Value: ₹60,000 (12 × ₹5,000)
Terms:          Pay 11 installments, get 1 month free
```

**Enroll Customer:**
Click **Enroll Customer** on any scheme
```
Customer:   Ramesh Kumar
Start Date: 01-Jul-2026
```
→ System creates 11 installment records with due dates

**Collect Monthly Payment:**
Enrollments tab → Click **Collect** → enter payment mode
→ Progress bar updates automatically
→ After 11th payment: Status changes to **Matured**

---

### MODULE 7 — Reports & Analytics

**Sales Report:** Reports → Sales tab
- Select date range
- See: Daily breakdown, payment modes, retail vs wholesale
- Export as CSV

**Inventory Report:** Reports → Inventory tab
- Live stock value by type
- MRP vs Cost vs Margin%

**GST Report:** Reports → GST tab
- Total taxable value, GST collected
- HSN 7113, GST Rate 3%

**Karigar Report:** Reports → Karigar tab
- Gold issued vs returned per karigar
- Pending weight

---

### MODULE 8 — Customer Display (Dual Screen)

Press **Ctrl+F5** in POS screen → second window opens

**What customer sees:**
- Live cart items with weight and price
- Gold rate live
- Total payable in large font
- UPI QR code for payment
- "Thank You!" animation after payment

**Configure display:** Admin → Display Settings
- Change colors, messages, font size
- Toggle what to show/hide

---

## 6. BILLING FORMULA EXAMPLES

### Example 1 — Pure Gold Item (No Stone)
```
Item:           Gold Bangle 22K
Gross Weight:   18.000g
Stone Weight:   0g
Net Weight:     18.000g
Gold Rate:      ₹6,250/g
Making Charge:  ₹180/g
Wastage:        3%

Gold Value:     18.000 × 6,250     = ₹1,12,500
Making:         18.000 × 180       = ₹3,240
Wastage:        (18×3%) × 6,250   = ₹3,375
─────────────────────────────────────────────
Taxable:        1,12,500+3,240+3,375 = ₹1,19,115
GST (3%):       1,19,115 × 0.03   = ₹3,574
─────────────────────────────────────────────
TOTAL:                               ₹1,22,689
```

### Example 2 — Studded Item (With Stone)
```
Item:           Diamond Ring 18K
Gross Weight:   8.000g
Stone Weight:   1.500g
Net Gold:       6.500g
Gold Rate:      ₹6,250/g
Stone Value:    ₹25,000
Making:         ₹500/g
Wastage:        2%

Gold Value:     6.500 × 6,250      = ₹40,625
Making:         6.500 × 500        = ₹3,250
Wastage:        (6.5×2%) × 6,250  = ₹812
Stone:                               ₹25,000
─────────────────────────────────────────────
Taxable:        40,625+3,250+812+25,000 = ₹69,687
GST (3%):       ₹2,091
─────────────────────────────────────────────
TOTAL:                               ₹71,778
```

### Example 3 — Old Gold Exchange
```
Customer brings: 10g old chain, 22K
Purity %:        91.67%
Melting Deduct:  2%

Pure Gold:       10 × 91.67% = 9.167g
Deduction:       9.167 × 2% = 0.183g
Net Weight:      8.984g
Gold Rate:       ₹6,250/g
Exchange Value:  8.984 × 6,250 = ₹56,150

New purchase:    ₹1,22,689 (bangle above)
After exchange:  1,22,689 - 56,150 = ₹66,539 payable
```


---

## 7. KARIGAR WORKFLOW — END TO END

```
DAY 1 — Issue
══════════════
Shop has: 100g gold bar (22K, rate ₹6,250/g = ₹6,25,000 value)
Assign to: Raju Kumar (Karigar)
Design: Traditional Necklace
Wages: ₹200/g
Wastage allowed: 3%

Issue Record:
  Issue #: ISS-TULASIBRL-20260701-0001
  Issued:  100.000g
  Value:   ₹6,25,000
  Expected return: 15-Jul-2026

──────────────────────────────────────────────────
DAY 15 — Karigar Returns Finished Goods
══════════════════════════════════════════
Karigar brings back:
  3 necklaces weighing total 97.500g
  Wastage used: 2.500g (2.5% — within 3% allowed)

Return Record:
  Return #: RET-TULASIBRL-20260715-0001
  Returned: 97.500g
  Wastage:  2.500g ✅ (allowed)

System updates Issue:
  Status: Completed
  Missing Weight: 0g

──────────────────────────────────────────────────
MONTH END — Settlement Calculation
══════════════════════════════════════════
Go to: Karigar → Settlement
Select: Raju Kumar | Jun 2026

Calculation:
  Total Returned:    97.500g
  Wages Rate:        ₹200/g
  ─────────────────────────────
  Gross Wages:       97.500 × 200 = ₹19,500
  Wastage Deduction: 2.500 × 200  = ₹500
  ─────────────────────────────
  NET PAYABLE:                      ₹19,000

Payment: Bank Transfer to HDFC 123456789
Click: Mark as Paid ✅
```

---

## 8. FLOOR TRANSFER WORKFLOW

```
SCENARIO: Move gold rings from Ground Floor to First Floor display

STEP 1 — Create Transfer Request
══════════════════════════════════
Go to: Stock Transfer → New Transfer
Type: Floor Transfer
From: Ground Floor — Counter A
To:   First Floor — Counter B

Add items by scanning:
  GLD-TULASIBRL-000201  Gold Ring (5.2g)
  GLD-TULASIBRL-000202  Gold Ring (4.8g)
  GLD-TULASIBRL-000203  Gold Ring (6.1g)

Submit → Transfer # TRF-TULASIBRL-20260626-0001
Status: PENDING

STEP 2 — Manager Approval
══════════════════════════════════
Manager logs in → Stock Transfer → sees Pending
Reviews items → Clicks APPROVE

System automatically:
  ✅ Updates Physical_Location for all 3 rings
  ✅ Branch_ID updated if branch transfer
  ✅ Status → Completed
  ✅ Audit log created

STEP 3 — Verify in Inventory
══════════════════════════════════
Inventory → search article numbers
Physical_Location now shows: FF-CTR-B-R01

Floor Stock report now shows:
  Ground Floor — Counter A: -3 items
  First Floor  — Counter B: +3 items
```

---

## 9. DATABASE QUERIES REFERENCE

Connect to the database:
```bash
psql JewelleryERP -U a1989
```

### Check All Clients (Super Admin View)
```sql
SELECT
  "Tenant_ID",
  "Company_Name",
  "City",
  "License_Expiry_Date",
  "Is_Active",
  "Max_Users",
  "Max_Branches"
FROM tbl_tenant_master
WHERE "Tenant_ID" != 'SA_MASTER'
ORDER BY "Company_Name";
```

### Check Stock for a Specific Client
```sql
SELECT
  o."Article_Number",
  t."Type_Name",
  p."Purity_Code",
  o."Gross_Weight",
  o."Total_Price",
  o."Physical_Location",
  o."Is_Sold"
FROM tbl_ornament_master o
LEFT JOIN tbl_item_type_master t ON o."Type_ID" = t."Type_ID"
LEFT JOIN tbl_purity_master p ON o."Purity_ID" = p."Purity_ID"
WHERE o."Tenant_ID" = 'TULASI_BLR'
  AND o."Is_Sold" = false
ORDER BY o."Article_Number";
```

### Today's Sales Summary per Client
```sql
SELECT
  s."Tenant_ID",
  t."Company_Name",
  COUNT(*) AS bills,
  SUM(s."Net_Payable_Amount") AS total_revenue,
  SUM(s."GST_Amount") AS gst_collected
FROM tbl_sales_header s
JOIN tbl_tenant_master t ON s."Tenant_ID" = t."Tenant_ID"
WHERE DATE(s."Sale_Date") = CURRENT_DATE
  AND s."Payment_Status" != 'Cancelled'
GROUP BY s."Tenant_ID", t."Company_Name"
ORDER BY total_revenue DESC;
```

### Gold Stock Value by Client
```sql
SELECT
  o."Tenant_ID",
  t."Company_Name",
  COUNT(*) AS total_pieces,
  ROUND(SUM(o."Gross_Weight")::numeric, 3) AS total_weight_g,
  ROUND(SUM(o."Total_Price")::numeric, 2) AS total_mrp,
  ROUND(SUM(o."Purchase_Cost")::numeric, 2) AS total_cost
FROM tbl_ornament_master o
JOIN tbl_tenant_master t ON o."Tenant_ID" = t."Tenant_ID"
WHERE o."Is_Sold" = false
  AND o."Is_Active" = true
GROUP BY o."Tenant_ID", t."Company_Name"
ORDER BY total_mrp DESC;
```

### Pending Karigar Issues (Overdue)
```sql
SELECT
  k."Vendor_Name" AS karigar,
  i."Issue_Number",
  i."Issue_Date",
  i."Expected_Return_Date",
  i."Gold_Weight_Issued",
  CURRENT_DATE - i."Expected_Return_Date" AS days_overdue,
  t."Company_Name"
FROM tbl_issue_to_karigar i
JOIN tbl_vendor_master k ON i."Karigar_ID" = k."Vendor_ID"
JOIN tbl_tenant_master t ON i."Tenant_ID" = t."Tenant_ID"
WHERE i."Status" IN ('Issued','Partial')
  AND i."Expected_Return_Date" < CURRENT_DATE
ORDER BY days_overdue DESC;
```

### All Active Repair Orders
```sql
SELECT
  r."Job_Card_Number",
  r."Customer_Name",
  r."Item_Description",
  r."Status",
  r."Expected_Delivery",
  r."Total_Charge",
  r."Balance_Due",
  t."Company_Name"
FROM tbl_repair_orders r
JOIN tbl_tenant_master t ON r."Tenant_ID" = t."Tenant_ID"
WHERE r."Status" NOT IN ('Delivered','Cancelled')
ORDER BY r."Expected_Delivery";
```

### Gold Saving Scheme Status
```sql
SELECT
  c."Customer_Name",
  c."Mobile_1",
  s."Scheme_Name",
  e."Enrollment_Number",
  e."Installments_Paid",
  e."Total_Installments",
  e."Total_Amount_Paid",
  e."Maturity_Value",
  e."Status",
  e."Maturity_Date"
FROM tbl_saving_scheme_enrollment e
JOIN tbl_customer_master c ON e."Customer_ID" = c."Customer_ID"
JOIN tbl_saving_scheme_master s ON e."Scheme_ID" = s."Scheme_ID"
WHERE e."Tenant_ID" = 'TULASI_BLR'
ORDER BY e."Status", e."Maturity_Date";
```

### Monthly Sales Report
```sql
SELECT
  DATE_TRUNC('month', "Sale_Date") AS month,
  "Tenant_ID",
  COUNT(*) AS bills,
  SUM("Net_Payable_Amount") AS revenue,
  SUM("GST_Amount") AS gst,
  SUM("Total_Gross_Weight") AS gold_weight
FROM tbl_sales_header
WHERE "Payment_Status" != 'Cancelled'
  AND "Sale_Date" >= DATE_TRUNC('year', CURRENT_DATE)
GROUP BY 1, 2
ORDER BY 1 DESC, revenue DESC;
```

### Floor-wise Live Stock
```sql
SELECT
  "Physical_Location" AS floor_counter,
  COUNT(*) AS items,
  ROUND(SUM("Gross_Weight")::numeric, 3) AS total_weight,
  ROUND(SUM("Total_Price")::numeric, 2) AS total_value
FROM tbl_ornament_master
WHERE "Tenant_ID" = 'TULASI_BLR'
  AND "Is_Sold" = false
  AND "Is_Active" = true
  AND "Physical_Location" IS NOT NULL
GROUP BY "Physical_Location"
ORDER BY total_value DESC;
```

### Audit Log — Recent Actions
```sql
SELECT
  al."Action_Timestamp",
  u."Username",
  al."Tenant_ID",
  al."Action_Type",
  al."Table_Name",
  al."Record_ID",
  al."IP_Address"
FROM tbl_audit_log al
LEFT JOIN tbl_user_master u ON al."User_ID" = u."User_ID"
ORDER BY al."Action_Timestamp" DESC
LIMIT 50;
```

### License Expiry Check
```sql
SELECT
  "Tenant_ID",
  "Company_Name",
  "License_Expiry_Date",
  "License_Expiry_Date" - CURRENT_DATE AS days_remaining,
  CASE
    WHEN "License_Expiry_Date" < CURRENT_DATE THEN '🔴 EXPIRED'
    WHEN "License_Expiry_Date" < CURRENT_DATE + 30 THEN '🟡 EXPIRING SOON'
    ELSE '🟢 ACTIVE'
  END AS status
FROM tbl_tenant_master
WHERE "Tenant_ID" != 'SA_MASTER'
ORDER BY "License_Expiry_Date";
```


---

## 10. API REFERENCE

Base URL: `http://localhost:5001/api`

All protected endpoints require: `Authorization: Bearer <JWT_TOKEN>`

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/auth/login` | Login → returns JWT token |
| POST | `/auth/logout` | Invalidate session |
| POST | `/auth/refresh` | Refresh expired token |
| GET | `/auth/validate` | Check token validity |

### Gold Rate
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/gold-rate/live` | Get current rates (22K/24K/18K/Silver) |
| POST | `/gold-rate/manual` | Set today's rate manually |

### Inventory
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/ornaments?search=&typeId=&page=` | List stock |
| GET | `/ornaments/barcode/:code` | Fetch by article number |
| GET | `/ornaments/stock-level` | Low stock alerts |
| POST | `/ornaments` | Add new ornament |
| PUT | `/ornaments/:id` | Update ornament |

### Sales / POS
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/sales/create` | Create invoice |
| GET | `/sales/:id` | Get invoice with items |
| GET | `/sales/invoice/:number` | Lookup by invoice number |
| POST | `/sales/:id/cancel` | Cancel sale |
| GET | `/sales/reports/daily?date=` | Daily sales summary |

### Karigar
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/karigar/list` | All karigars |
| POST | `/karigar/issue` | Issue gold |
| POST | `/karigar/return` | Record return |
| GET | `/karigar/settlement?karigarId=&fromDate=&toDate=` | Calculate settlement |
| POST | `/karigar/settle` | Mark as paid |

### Purchase
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/purchase` | List purchases |
| POST | `/purchase/create` | Create purchase + auto-add to inventory |
| POST | `/purchase/:id/approve` | Approve purchase |

### Floor Management
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/floors` | List floors |
| POST | `/floors` | Create floor |
| GET | `/floors/:id/counters` | Get counters for floor |
| POST | `/floors/counters` | Create counter |
| GET | `/floors/stock` | Live stock by location |

### Stock Transfer
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/transfer` | List transfers |
| POST | `/transfer/create` | Create transfer request |
| POST | `/transfer/:id/approve` | Approve (moves items) |
| POST | `/transfer/:id/reject` | Reject transfer |

### Repair
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/repair?status=` | List repairs |
| POST | `/repair` | Create job card |
| PUT | `/repair/:id` | Update status/charges |
| POST | `/repair/:id/deliver` | Mark as delivered |

### Gold Saving Scheme
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/scheme` | List schemes |
| POST | `/scheme` | Create scheme |
| POST | `/scheme/enroll` | Enroll customer |
| GET | `/scheme/enrollments` | List enrollments |
| POST | `/scheme/pay-installment` | Record payment |

### Reports
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/reports/sales-summary?fromDate=&toDate=` | Sales analysis |
| GET | `/reports/inventory-value` | Stock value report |
| GET | `/reports/karigar-summary` | Karigar work report |
| GET | `/reports/gst-summary?fromDate=&toDate=` | GST report |

### Tenant Management (Super Admin only)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/tenant/all` | List all tenants |
| POST | `/tenant/create` | Create new client |
| GET | `/tenant/stats` | Dashboard statistics |
| GET | `/tenant/users` | List users |

---

## 11. TROUBLESHOOTING

### Server won't start — port in use
```bash
# Find what's using port 5001
lsof -i :5001
# Kill it
kill -9 <PID>
# Or change port in server/.env: PORT=5002
```

### Database connection failed
```bash
# Check PostgreSQL is running
brew services list | grep postgresql
# Start it
brew services start postgresql@16
# Test connection
psql JewelleryERP -U a1989 -c "SELECT 1;"
```

### Login fails — "Invalid username or password"
```bash
# Re-run seed to reset super admin
cd server
npx knex seed:run --specific=001_seed_master_data.js --knexfile src/db/knexfile.js
```

### 4 clients not showing
```bash
cd server
npx knex seed:run --specific=002_seed_four_clients.js --knexfile src/db/knexfile.js
```

### Migration errors
```bash
cd server
# See current migration state
npx knex migrate:status --knexfile src/db/knexfile.js
# Roll back last batch
npx knex migrate:rollback --knexfile src/db/knexfile.js
# Re-run
npx knex migrate:latest --knexfile src/db/knexfile.js
```

### Frontend not loading
```bash
cd client
npm install  # reinstall deps
npm run dev  # restart dev server
```

### Check server logs in real time
```bash
cd server
node src/index.js 2>&1 | tee server.log
```

---

## QUICK REFERENCE CARD

```
╔══════════════════════════════════════════════════════════════╗
║           JEWELLERY ERP PRO — QUICK REFERENCE               ║
╠══════════════════════════════════════════════════════════════╣
║  Server:    http://localhost:5001                           ║
║  App:       http://localhost:5173                           ║
║  Health:    http://localhost:5001/health                    ║
╠══════════════════════════════════════════════════════════════╣
║  SUPER ADMIN   SA_MASTER / superadmin / see server/.env    ║
╠══════════════════════════════════════════════════════════════╣
║  TULASI_BLR  tulasiadmin   (see seed script)  Bangalore    ║
║  SRINIV_HYD  srinivadmin   (see seed script)  Hyderabad    ║
║  VKMANI_CHN  vkmaniadmin   (see seed script)  Chennai      ║
║  DHANA_MYS   dhanaadmin    (see seed script)  Mysore       ║
╠══════════════════════════════════════════════════════════════╣
║  Billing Staff Password (all shops): see seed script       ║
╠══════════════════════════════════════════════════════════════╣
║  GST Rate:  3% (HSN 7113 — Jewellery)                     ║
║  Wastage:   3% standard (adjustable per item)              ║
║  Ctrl+F5:   Opens customer display screen                  ║
╚══════════════════════════════════════════════════════════════╝
```

---

*Document generated: June 2026 | Jewellery ERP Pro v1.0*
