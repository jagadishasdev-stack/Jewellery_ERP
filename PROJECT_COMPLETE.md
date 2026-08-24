# Jewellery ERP — Complete Project Documentation

> Multi-Tenant, Multi-Module Jewellery Management System  
> Stack: React + Vite (frontend) · Node.js + Express (backend) · PostgreSQL  
> Last Updated: July 2026

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Architecture](#2-architecture)
3. [Technology Stack](#3-technology-stack)
4. [How to Run](#4-how-to-run)
5. [Tenant Management](#5-tenant-management)
6. [Module Index](#6-module-index)
7. [Database Tables](#7-database-tables)
8. [API Routes](#8-api-routes)
9. [Data Mode System](#9-data-mode-system)
10. [Savings App (Mobile)](#10-savings-app-mobile)
11. [Image App Integration](#11-image-app-integration)
12. [Voucher & Bin Management](#12-voucher--bin-management)
13. [User Roles & Permissions](#13-user-roles--permissions)
14. [Frontend Structure](#14-frontend-structure)
15. [Known Tenant List](#15-known-tenant-list)

---

## 1. Project Overview

A complete **multi-tenant Jewellery ERP** system built for jewellery retailers, wholesalers, and manufacturers in India.

**Key capabilities:**
- Multi-tenant architecture — one server, isolated data per shop
- Complete billing (POS + wholesale + GST invoices)
- Inventory management with barcode/HUID
- Karigar (goldsmith) job tracking
- Savings club scheme management
- Mobile customer app (Savings App)
- Image catalog app integration
- Voucher-based transaction tracking
- Master Bin holding area
- Data Mode isolation (Official / Unofficial / Practice)
- Real-time gold rate broadcast to customer displays

---

## 2. Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    JEWELLERY ERP                         │
├─────────────────┬───────────────────┬───────────────────┤
│  ERP Frontend   │  Savings App      │  Image App        │
│  React + Vite   │  React (CRA)      │  React (CRA)      │
│  Port 5173      │  Port 3000        │  Capacitor        │
├─────────────────┴───────────────────┴───────────────────┤
│              Node.js + Express Backend                   │
│              Port 5001  /api/*                           │
├─────────────────────────────────────────────────────────┤
│              PostgreSQL Database                         │
│              DB: JewelleryERP                            │
│              95+ tables, all multi-tenant                │
└─────────────────────────────────────────────────────────┘
```

**Multi-tenancy:** Every table has `Tenant_ID`. Every API call is scoped to the authenticated tenant. Super Admin (`SA_MASTER`) can see all tenants.

---

## 3. Technology Stack

| Layer | Technology | Version |
|---|---|---|
| Frontend | React | 18.2.0 |
| Frontend Build | Vite | 5.0.5 |
| UI Components | Ant Design | 5.11.5 |
| State Management | Zustand | 4.4.7 |
| Data Fetching | TanStack Query | 5.12.2 |
| Backend | Node.js + Express | 20.x |
| Database | PostgreSQL | 14+ |
| Query Builder | Knex.js | 2.x |
| Authentication | JWT (bcryptjs) | — |
| Real-time | Socket.io | 4.6.2 |
| Mobile Apps | Capacitor | 5.x |

---

## 4. How to Run

### Prerequisites
- Node.js 20+
- PostgreSQL 14+ running locally
- Database `JewelleryERP` created

### Start ERP Backend
```bash
cd server
cp .env.example .env    # set DB credentials
node src/index.js
# Runs on http://localhost:5001
```

### Start ERP Frontend (Admin Panel)
```bash
cd client
npm install
npm run dev
# Runs on http://localhost:5173
```

### Start Savings App (Mobile Frontend)
```bash
cd savings_app/frontend
npm install
npm start
# Runs on http://localhost:3000
```

### Environment Variables (server/.env)
```env
PORT=5001
DB_HOST=localhost
DB_PORT=5432
DB_NAME=JewelleryERP
DB_USER=your_user
DB_PASSWORD=your_password
JWT_SECRET=your_secret_key
CLIENT_URL=http://localhost:5173
MOBILE_APP_URL=http://localhost:3000
```

### Run Migrations
```bash
cd server
node run_019.js    # Agent master, OTP, tenant app config
node run_020.js    # Agent_Code on scheme transactions
node run_021.js    # Data_Mode on all transaction tables
node run_022.js    # Master Bin tables
node run_023.js    # Sales Voucher_ID
```

---

## 5. Tenant Management

### Super Admin Login
- URL: `http://localhost:5173/login`
- Tenant ID: `SA_MASTER`
- Username: `superadmin`
- Password: `SuperAdmin@2026`

### Creating a New Tenant
1. Login as Super Admin
2. Sidebar → Admin → Tenants → New Tenant
3. 3-step wizard: Business Type → Company Info → Admin User
4. System auto-generates License Key
5. Modules are auto-provisioned based on Business Type

### Business Types
| Type | Default Modules |
|---|---|
| RETAILER | POS, Inventory, Customers, Schemes, Reports |
| WHOLESALER | Billing, Inventory, Dealers, Reports |
| MANUFACTURER | Karigar, Goldsmith, Production, Reports |
| HYBRID | All modules |

---

## 6. Module Index

| Module | Route | Description |
|---|---|---|
| Dashboard | `/dashboard` | Business-type aware KPIs |
| Billing Hub | `/billing` | Retail, wholesale, GST invoice, estimate, order booking |
| POS | `/pos` | Touch-screen point of sale with barcode scan |
| Inventory | `/inventory` | Stock management, barcode generation, HUID |
| Add Stock | `/inventory/add` | Add new ornament to inventory |
| Product Catalog | `/catalog` | Image catalog, exhibition, sold report |
| Purchase | `/purchase/hub` | Purchase bills — gold, silver, diamond, vendor |
| Karigar | `/karigar` | Goldsmith issue/return/settlement |
| Repair | `/repair` | Job cards and repair order management |
| Customers | `/customers` | CRM with purchase history and loyalty points |
| Reports | `/reports` | Sales, inventory, financial, customer, scheme reports |
| Day Close | `/reports/day-close` | Daily cash closing with verification |
| Invoice Studio | `/invoice/studio` | AI-powered invoice template designer |
| Savings Club | `/savings` | Scheme master, groups, members, collection |
| Agents | `/savings/agents` | Field agent management |
| Master Bin | `/bin` | Holding area for purchase, returns, orders, pure gold |
| Floor Mgmt | `/floors` | Floor and counter assignment |
| Stock Transfer | `/transfer` | Inter-branch/floor/counter transfer |
| Masters | `/masters` | Item types, designs, purity, gemstones, making charges |
| Admin Dashboard | `/admin/dashboard` | Analytics, audit trail |
| Users | `/admin/users` | User management with roles |
| Role Management | `/admin/roles` | Permission matrix per role |
| Display Settings | `/admin/display` | Screen × action visibility per role/user |
| Module Management | `/admin/modules` | Enable/disable modules per tenant (SA only) |
| Tenants | `/admin/tenants` | Full tenant CRUD (SA only) |
| Audit & Security | `/admin/audit` | Login history, session log, change trail |

---

## 7. Database Tables

### Core Tables
| Table | Purpose |
|---|---|
| `tbl_tenant_master` | All registered tenants |
| `tbl_branch_master` | Branches per tenant |
| `tbl_user_master` | Staff users |
| `tbl_role_master` | Roles and permission sets |
| `tbl_session_master` | Active login sessions |
| `tbl_audit_log` | All system actions |
| `tbl_erp_modules` | 28 available modules |
| `tbl_tenant_modules` | Module on/off per tenant |
| `tbl_tenant_app_config` | Mobile app theme per tenant |

### Transaction Tables (have `Data_Mode` column)
| Table | Purpose |
|---|---|
| `tbl_ornament_master` | All jewellery stock |
| `tbl_sales_header` | Sales bills |
| `tbl_sales_details` | Sales line items |
| `tbl_sales_payments` | Multi-payment breakdown per bill |
| `tbl_purchase_header` | Purchase bills |
| `tbl_purchase_details` | Purchase line items |
| `tbl_customer_master` | Customer records |
| `tbl_issue_to_karigar` | Gold issued to goldsmith |
| `tbl_return_from_karigar` | Gold returned from goldsmith |
| `tbl_stock_transfer` | Inter-location stock movement |
| `tbl_accounting_journal` | Double-entry journal |
| `tbl_accounting_entries` | Dr/Cr ledger entries |
| `tbl_scheme_members` | Savings scheme enrollments |
| `tbl_scheme_transactions` | Installment collections |
| `tbl_scheme_groups` | Scheme batches |

### Bin Management Tables
| Table | Purpose |
|---|---|
| `tbl_voucher_master` | Central voucher registry |
| `tbl_bin_purchase` | Purchase holding bin |
| `tbl_bin_sales_return` | Sales return holding bin |
| `tbl_bin_orders` | Order management bin |
| `tbl_bin_pure_gold` | Pure gold asset bin |

### Savings App Tables
| Table | Purpose |
|---|---|
| `tbl_scheme_master` | Scheme types (Gold, Silver, Digi Gold) |
| `tbl_agent_master` | Field collection agents |
| `tbl_mobile_otp` | OTP store for mobile login |

### Other Tables
| Table | Purpose |
|---|---|
| `tbl_gold_rate_history` | Daily gold rate log |
| `tbl_invoice_template_master` | Invoice print templates |
| `tbl_invoice_studio_templates` | AI designer templates |
| `tbl_product_images` | Ornament image catalog |
| `tbl_repair_orders` | Jewellery repair jobs |
| `tbl_day_close` | Daily cash closing records |
| `tbl_gift_vouchers` | Gift voucher issuance |
| `tbl_loyalty_transactions` | Customer loyalty points |

---

## 8. API Routes

All routes: `http://localhost:5001/api/...`

### Authentication
| Method | Route | Description |
|---|---|---|
| POST | `/auth/login` | Staff login (returns JWT) |
| POST | `/auth/refresh` | Refresh JWT token |
| POST | `/auth/logout` | Invalidate session |

### Mobile (Savings App)
| Method | Route | Description |
|---|---|---|
| POST | `/mobile/validate-license` | Validate license key |
| GET | `/mobile/branches/:tenantId` | Get branches (public) |
| POST | `/mobile/send-otp` | Send OTP to mobile |
| POST | `/mobile/verify-otp` | Verify OTP, issue JWT |
| GET | `/mobile/tenant-info/:id` | Tenant + gold rates (public) |
| GET | `/mobile/app-config/:id` | App theme config |

### Sales
| Method | Route | Description |
|---|---|---|
| POST | `/sales/create` | Create sale bill + Voucher ID |
| GET | `/sales/:id` | Get sale with items + payments |
| GET | `/sales/invoice/:number` | Get by invoice number |
| POST | `/sales/:id/cancel` | Cancel sale |
| GET | `/sales/reports/daily` | Daily sales report |

### Bin Management & Vouchers
| Method | Route | Description |
|---|---|---|
| GET | `/bin/voucher/:id` | Universal search by Voucher ID |
| GET | `/bin/dashboard` | Bin summary stats |
| GET/POST/PUT | `/bin/purchase` | Purchase bin CRUD |
| POST | `/bin/purchase/:id/approve` | Approve entry |
| POST | `/bin/purchase/:id/move-to-stock` | Move to inventory |
| GET/POST/PUT | `/bin/sales-return` | Sales return bin CRUD |
| POST | `/bin/sales-return/:id/move-to-stock` | Re-stock return |
| GET/POST/PUT | `/bin/orders` | Order bin CRUD |
| POST | `/bin/orders/:id/status` | Update order status |
| GET/POST/PUT | `/bin/pure-gold` | Pure gold bin CRUD |
| POST | `/bin/pure-gold/:id/dispose` | Dispose gold asset |

### Reports
| Method | Route | Description |
|---|---|---|
| GET | `/reports/sales-summary` | Sales by date range |
| GET | `/reports/inventory-value` | Stock value by type |
| GET | `/reports/financial` | Cash book, bank book, P&L |
| GET | `/reports/counter-summary` | Counter performance |
| GET | `/reports/gst-summary` | GST / HSN report |
| GET | `/reports/collection-by-mode` | Payment mode breakdown |
| GET | `/reports/accounting-journal` | Double-entry journal |
| GET | `/reports/ledger` | Account ledger |
| GET | `/reports/day-book` | Daily journal |
| GET | `/reports/cash-book` | Cash account ledger |

---

## 9. Data Mode System

Three completely isolated data workspaces on the same database.

### Modes
| Mode | Key | Color | Description |
|---|---|---|---|
| 1 | Practice | Grey | Dummy/test data. Never in real reports |
| 2 | Unofficial | Red | Off-the-books business. Isolated from official |
| 3 | Official | Blue | Real registered business (default) |

### Keyboard Shortcuts
- `Ctrl+F5` — Toggle Official ↔ Unofficial
- `Ctrl+Shift+F5` — Toggle Practice mode on/off
- Header dropdown — switch any mode directly

### How it works
- `Data_Mode` column on all 12 transaction tables
- Every API call reads `X-Data-Mode` header
- Frontend `DataModeContext` persists mode in `sessionStorage`
- Axios interceptor sends `X-Data-Mode` on every request
- Reports, dashboards, searches — all filtered by current mode

### Tables with Data_Mode
`tbl_ornament_master`, `tbl_sales_header`, `tbl_sales_payments`, `tbl_purchase_header`, `tbl_issue_to_karigar`, `tbl_scheme_members`, `tbl_scheme_transactions`, `tbl_scheme_groups`, `tbl_customer_master`, `tbl_accounting_journal`, `tbl_accounting_entries`, `tbl_stock_transfer`

---

## 10. Savings App (Mobile)

React app (Create React App) that runs as an Android/iOS app via Capacitor.

### Login Flow
```
App opens → Splash Screen
  → First time: enter License Key → branch selection
  → Returning: directly to Login
Login: mobile number → OTP → Dashboard
```

### Key Files
| File | Purpose |
|---|---|
| `src/config/constants.js` | Dynamic config (no hardcoded values) |
| `src/contexts/TenantContext.js` | License validation + branch selection |
| `src/contexts/StoreContext.js` | Gold rates + scheme data |
| `src/contexts/erp-api.js` | Axios instance → ERP backend |
| `src/components/LicenseLoginPage.js` | License key entry screen |
| `src/components/LoginPage.js` | Mobile OTP login |
| `src/components/OtpVerificationPage.js` | 6-digit OTP entry |
| `src/components/splashscreen.jsx` | Animated splash |
| `src/components/DashboardPage.js` | Customer dashboard |
| `src/components/SavingPlansList.js` | My schemes |

### Building APK
```bash
cd savings_app/frontend
npm run build
npx cap sync android
# Open Android Studio → Build → Generate Signed APK
```

### Agent Login
- Agent created in ERP: Savings Club → Agent Management
- Agent logs in with mobile number + OTP
- No password required

---

## 11. Image App Integration

The Image App (`/Image_App`) is a separate Capacitor app that integrates with the ERP.

- `tbl_ornament_master` is the single source of truth for products
- `tbl_product_images` stores multiple images per ornament
- Images linked by `Ornament_ID` + `Article_Number`
- Cannot upload image without a valid ornament in ERP
- Wishlist and order requests stored in ERP

---

## 12. Voucher & Bin Management

### Voucher ID Format
| Prefix | Type | Example |
|---|---|---|
| `SAL` | Sale | `SAL-20260709-00001` |
| `PUR` | Purchase Bin | `PUR-20260709-00001` |
| `SRB` | Sales Return Bin | `SRB-20260709-00001` |
| `ORD` | Order Bin | `ORD-20260709-00001` |
| `PGB` | Pure Gold Bin | `PGB-20260709-00001` |

### Universal Voucher Search
- Go to: ERP → 🗄️ Master Bin → search bar at top
- Enter any Voucher ID
- Returns: complete transaction details, line items, weights, payments, linked ornament

### Bin Workflow
```
Purchase Bin:  Purchased from supplier → Bin (pending) → Approve → Move to Stock (creates ornament)
Return Bin:    Customer returns item → Bin (received) → Inspect → New barcode → Move to Stock
Order Bin:     Customer/Karigar order → Bin (pending) → In Progress → Ready → Delivered
Pure Gold Bin: Bar/Coin purchased → Bin (holding) → Manufacturing / Direct Sale / Transfer
```

---

## 13. User Roles & Permissions

| Role | Access Level |
|---|---|
| Super Admin | All tenants, all modules, all settings |
| Client Admin | Own tenant, all modules, user management |
| Manager | Sales, inventory, reports, customers |
| Cashier | POS billing only |
| Karigar Manager | Karigar issue/return only |
| Agent | Savings app collection only |
| Customer | Savings app — own schemes only |

### Permission Keys
`sales`, `inventory`, `karigar_management`, `accounts`, `edit_invoice_template`, `tenant_management`, `global_master`

---

## 14. Frontend Structure

```
client/src/
├── api/
│   ├── axios.js          ← Base axios with JWT + X-Data-Mode header
│   └── modules.js        ← API module functions
├── components/
│   ├── layout/
│   │   ├── MainLayout.jsx  ← Responsive sidebar + header + mobile bottom nav
│   │   └── AuthLayout.jsx
│   ├── GoldRateBar.jsx     ← Live rates ticker strip
│   ├── MetalRateDashboard.jsx ← Premium glassmorphism rate cards
│   └── BarcodeLabel.jsx
├── contexts/
│   └── DataModeContext.jsx ← 3-mode isolation system
├── hooks/
│   ├── useGoldRate.js
│   └── useModules.js
├── pages/
│   ├── DashboardPage.jsx   ← Business-type aware dashboard
│   ├── admin/              ← Tenant, users, roles, audit, modules
│   ├── billing/            ← BillingHub
│   ├── bin/                ← Master Bin Management
│   ├── catalog/            ← Product catalog (Image App)
│   ├── customers/
│   ├── floors/
│   ├── inventory/
│   ├── invoice/            ← Invoice Studio
│   ├── karigar/
│   ├── pos/                ← POS screen
│   ├── purchase/
│   ├── repair/
│   ├── reports/
│   ├── savings/            ← Savings Club + Agent Management
│   ├── scheme/
│   └── transfer/
├── store/
│   ├── authStore.js
│   └── cartStore.js
└── utils/
    └── calculations.js
```

---

## 15. Known Tenant List

| Tenant ID | Company | License Key | Type | Expiry |
|---|---|---|---|---|
| SA_MASTER | Jewellery ERP - Super Admin | SA-MASTER-2026-PERPETUAL | HYBRID | 2099 |
| TULASI_BLR | Tulasi Honesty Jewels | TULASI-2026-PRO-A1B2 | HYBRID | Dec 2027 |
| CHAM_MYS | Chamundeshwari Gold and Silver | MYS-2026-CHAM | RETAILER | — |
| SAGAR | Sagar Jewellers | SG-2026-MAHA | RETAILER | — |
| DHANA_MYS | Dhanalakshmi Jewels | DHANA-2026-STR-G7H8 | RETAILER | Dec 2026 |
| VKMANI_CHN | VK Mani Jewellers | VKMANI-2026-PRO-E5F6 | WHOLESALER | Jun 2027 |
| SRINIV_HYD | Srinivasa Jewellers | SRINIV-2026-PRO-C3D4 | HYBRID | Dec 2027 |

---

## Quick Start for New Customer

1. Create tenant in ERP Admin Panel
2. Note the generated License Key
3. Create at least one Branch
4. Create Scheme Master + Groups (for savings app)
5. Enroll customers at counter (Members page)
6. Give customer the Savings App APK + License Key
7. Customer opens app → enters License Key → logs in with mobile OTP

---

## Support & Administration

### Restart Server
```bash
cd server && node src/index.js
```

### Check DB tables
```bash
cd server && node -e "const db=require('./src/db/knex'); db.raw('SELECT tablename FROM pg_tables WHERE schemaname=\'public\' ORDER BY tablename').then(r=>{console.log(r.rows.map(x=>x.tablename).join('\n'));process.exit();})"
```

### Reset to fresh state (CAUTION)
Only delete tenant-specific data — never drop tables.
```bash
# Never run in production without backup
```

---

*Generated: July 2026 | Jewellery ERP v1.0*
