# 💎 Jewellery ERP — Multi-Tenant System

> React + Vite · Node.js + Express · PostgreSQL 16 · Socket.io

---

## Quick Start (Development)

### Prerequisites
- Node.js 20+
- PostgreSQL 16 running locally
- Create database: `CREATE DATABASE "JewelleryERP";`

### 1 — Server setup

```bash
cd server
npm install
cp .env.example .env      # edit DB credentials if needed
npm run migrate           # create all tables
npm run seed              # insert roles, purities, item types, super admin
npm run dev               # starts on :5000
```

### 2 — Client setup (new terminal)

```bash
cd client
npm install
npm run dev               # starts on :5173
```

### 3 — Login

| Field     | Value        |
|-----------|--------------|
| Tenant ID | `SA_MASTER`  |
| Username  | `superadmin` |
| Password  | `SuperAdmin@2026` |

---

## Docker (Production)

```bash
docker-compose up --build
```

App runs at `http://localhost:80`

---

## Project Structure

```
Jewellery_ERP/
├── client/                  # React + Vite frontend
│   └── src/
│       ├── pages/
│       │   ├── auth/        # Login page
│       │   ├── pos/         # POS screen + Ctrl+F5 dual screen
│       │   ├── inventory/   # Ornament list + Add form
│       │   ├── karigar/     # Issue / Return / Settlement
│       │   ├── customers/   # Customer management
│       │   ├── reports/     # Sales reports
│       │   ├── invoice/     # Template designer
│       │   ├── customer-display/  # Dual-screen window
│       │   └── admin/       # Tenants, Master Data, Users
│       ├── store/           # Zustand — authStore, cartStore
│       ├── hooks/           # useSocket, useGoldRate
│       ├── api/             # Axios + all API modules
│       └── utils/           # calculations, formatCurrency
│
├── server/                  # Node.js + Express backend
│   └── src/
│       ├── routes/          # auth, license, ornaments, sales, karigar…
│       ├── middleware/      # auth (JWT), tenant (RLS), license (expiry)
│       ├── db/
│       │   ├── knex.js      # DB connection
│       │   ├── migrations/  # 4 migration files — all tables
│       │   └── seeds/       # Master data + super admin
│       ├── sockets/         # displayHub.js — Socket.io dual screen
│       └── services/        # pdfService.js — Puppeteer invoice PDF
│
├── docker-compose.yml
├── nginx.conf
└── README.md
```

---

## Key Features

| Feature | Details |
|---------|---------|
| Multi-Tenant | Row-Level Security via `app.current_tenant` PostgreSQL config |
| License System | License key → JWT → all API calls validated |
| Dual Screen | Ctrl+F5 opens customer display · Socket.io real-time sync |
| Karigar Flow | Issue gold → Return → Wastage calc → Settlement PDF |
| Invoice Engine | Per-tenant templates · JSON field config · Puppeteer PDF |
| RBAC | 7 roles · Permission-checked on every route |

---

## API Endpoints

| Module | Base URL |
|--------|----------|
| Auth | `POST /api/auth/login` |
| License | `POST /api/license/validate` |
| Ornaments | `GET/POST /api/ornaments` |
| Sales | `POST /api/sales/create` |
| Karigar | `POST /api/karigar/issue` · `POST /api/karigar/return` |
| Customers | `GET /api/customers/search` |
| Invoice PDF | `POST /api/invoice/generate` |
| Display | `GET/PUT /api/display/settings` |

---

## Default Roles

| Role | Key Permissions |
|------|----------------|
| Super Admin | Everything + all tenants |
| Client Admin | Full access within tenant |
| Store Manager | Inventory + Karigar + Sales |
| Billing Operator | POS + Dual Screen |
| Accounts | Reports + Payments |
| Karigar Manager | Issue/Return/Settlement |
| Inventory Manager | Stock management |
