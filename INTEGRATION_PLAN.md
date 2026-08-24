# Integration Plan: Image App + Savings App → Jewellery ERP

## Analysis Summary

### Image App (React + Capacitor + PHP backend)
Current auth: IP address entry → PHP server
Pages: SearchInput, MultiImage, SoldReport, Designwiseimg, ScanPage, AppSettings,
       Exhibition (Orders, Stock, CreateOrder), QuotationBillingSystem, BillPreview
Key features: Barcode search, image catalog, exhibition orders, quotation/billing PDF

**Migration path:** Replace PHP backend calls with ERP `/api/*` endpoints.
Replace IP login with License Key → ERP JWT auth.

### Savings App (React + MUI + Node.js + MySQL/Sequelize)
Current auth: Mobile OTP or username/password → store_id based
Backend routes: /api/auth, /api/core, /api/admin, /api/razorpay, /api/phonepe, /api/store
Models: Member, Scheme, MemberLedger, Stores, StoreAdmin, Rate, Groups

**Migration path:** The ERP already has tbl_scheme_members, tbl_scheme_master,
tbl_scheme_transactions, tbl_scheme_groups (migration 009). Map savings_app tables → ERP tables.

## Database Migration Mapping

### Savings App MySQL → ERP PostgreSQL

| Old Table (MySQL)    | New Table (PostgreSQL)           | Notes                            |
|---------------------|----------------------------------|----------------------------------|
| members             | tbl_scheme_members               | Add tenant_id, map fields        |
| scheme              | tbl_scheme_master                | scheme_name, type → Scheme_Type  |
| member_ledger       | tbl_scheme_transactions          | Txn_Type = 'Collection'          |
| groups              | tbl_scheme_groups                | Already exists                   |
| rate                | tbl_tenant_rates                 | gold/silver rates per tenant     |
| stores              | tbl_tenant_master                | store = tenant                   |
| store_admin         | tbl_user_master                  | Role = 'Client Admin'            |
| users (app users)   | tbl_customer_master              | Mobile = primary key             |
| digi_gold_txn       | tbl_scheme_transactions          | Txn_Type = 'DigiGold'            |

### Image App Data → ERP PostgreSQL

| Old                 | New                              | Notes                            |
|---------------------|----------------------------------|----------------------------------|
| products (PHP DB)   | tbl_ornament_master              | barcode = Article_Number         |
| product_images      | tbl_ornament_master.Product_Image_URL | Azure blob URLs             |
| orders              | tbl_repair (or new order table)  | Order management                 |
| exhibition_stock    | tbl_ornament_master (Is_On_Display) | exhibition flag                |

## API Migration Mapping

### Savings App APIs → ERP APIs

| Old API                              | New ERP API                           |
|--------------------------------------|---------------------------------------|
| POST /api/auth/login                 | POST /api/auth/login (License Key flow)|
| GET /api/core/rates                  | GET /api/gold-rate/live               |
| GET /api/core/getGroups              | GET /api/savings/groups               |
| POST /api/core/join-scheme           | POST /api/savings/members             |
| POST /api/core/userledger            | GET /api/savings/reports/member-ledger/:id |
| POST /api/core/payForScheme          | POST /api/savings/collect             |
| GET /api/store/getStoreById/:id      | GET /api/tenant/stats                 |
| GET /api/admin/*                     | GET /api/tenant/users                 |
| POST /api/razorpay/*                 | POST /api/payments/razorpay (new)     |
| POST /api/phonepe/*                  | POST /api/payments/phonepe (new)      |

### Image App APIs → ERP APIs

| Old API (PHP)                        | New ERP API                           |
|--------------------------------------|---------------------------------------|
| ?action=search_barcode               | GET /api/ornaments/barcode/:code      |
| ?action=get_images                   | GET /api/ornaments?search=            |
| ?action=upload_image                 | POST /api/upload/ornament-image       |
| ?action=create_order                 | POST /api/repair (or /api/orders)     |
| ?action=get_sold                     | GET /api/ornaments?isSold=true        |

## ERP Module Integration

### Image App → ERP as "Product Catalog" module
New route: /product-catalog
New sidebar entry: under Inventory group
Features: Barcode search, image view, quotation, exhibition

### Savings App → Already integrated as "Savings Club"
Already exists at /savings/* in ERP.
Enhancement needed: Payment gateway integration (Razorpay/PhonePe)
Mobile app: Point savings_app frontend to ERP APIs

## Authentication Redesign

### New Login Flow (replaces IP address & store_id)
Step 1: User enters License Key (e.g. TULASI-2026-001)
Step 2: ERP validates → GET /api/auth/validate-license/:key
Step 3: Returns tenant info (Company Name, Logo, Theme)
Step 4: User enters Username + Password
Step 5: POST /api/auth/login with {licenseKey, username, password}
Step 6: Returns JWT token → stored in localStorage
Step 7: All subsequent API calls use Bearer token

This is exactly what the ERP already does — just need to expose license key lookup.
