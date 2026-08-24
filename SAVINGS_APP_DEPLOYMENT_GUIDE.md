# Savings App — Deployment & Tenant Setup Guide

## Overview

You build **one app** and publish it to Play Store / App Store under your own developer account.
Every jewellery store (tenant) uses the **same app** but logs in with their own **License Key**.
The app fetches all data — theme, branch, customers, schemes — from the ERP based on that key.
No hardcoded values. No separate builds per customer.

---

## Architecture

```
Your Play Store / App Store Account
        ↓  (one APK / IPA)
Customer installs app
        ↓
Enters License Key  →  ERP validates  →  fetches tenant config
        ↓
Branch selection (if multi-branch)
        ↓
Customer/Agent login via mobile OTP
        ↓
Dashboard — schemes, collections, digi gold
        (all data filtered by tenant_id + branch_id)
```

---

## Part 1: Setting Up a New Customer in ERP

### Step 1 — Create Tenant in ERP Admin Panel

1. Login to ERP → Sidebar → **Super Admin → Tenant Management**
2. Click **"+ New Tenant"** → 3-step wizard:
   - **Step 1**: Business Type (RETAILER / WHOLESALER / MANUFACTURER / HYBRID)
   - **Step 2**: Company Info — fill Company Name, City, GST, Phone, Email, License Expiry
   - **Step 3**: Admin User — username + password for the store's ERP admin
3. ERP auto-generates a **License Key** (e.g. `TULASI-2026-PRO-A1B2`)
4. Save the License Key — you will give it to the customer

### Step 2 — Add Branch

1. In ERP → **Masters → Branch Master** (logged in as that tenant's admin)
2. Create at least one branch with Branch ID, Branch Name, City
3. If single branch → app auto-selects it (no popup for customer)
4. If multiple branches → customer sees branch picker at login

### Step 3 — Add Scheme Master

1. ERP → **Savings Club → Scheme Master** → Create schemes
   - e.g. "Gold Savings 11+1", 12 months, ₹1000/month
2. Create **Groups** under each scheme (actual enrollment batches)

### Step 4 — Enroll Customers at the Shop Counter

Customers **don't self-register**. The store staff enrolls them:

1. ERP → **Savings Club → Members** → Add Member
2. Fill: Customer Name, Mobile Number, Scheme, Group, Joining Date, Installment Amount
3. Member record is saved with their mobile number
4. When customer opens the app and enters their mobile → OTP → they see their scheme

### Step 5 — Create Agents (for field collection)

1. ERP → **Savings Club → Agent Management** → Add Agent
2. Fill: Agent Name, Mobile Number, Branch
3. Agent logs into the savings app using mobile + OTP (no password needed)
4. Agent can search customers, collect installments, generate receipts

---

## Part 2: What to Configure Per Customer (Before Building App)

For the **same app binary** on Play Store / App Store, nothing changes in code.
All customization is done in ERP admin panel.

| What                  | Where to set it                                         |
|-----------------------|---------------------------------------------------------|
| Company name          | Tenant Master → Company Name                            |
| License key           | Auto-generated at tenant creation, shown in Tenant list |
| Branch(es)            | Branch Master under that tenant                         |
| Scheme plans          | Savings Club → Scheme Master                            |
| Theme colors          | ERP Admin → Tenant App Config (Theme_ID 1/2/3)         |
| Logo                  | App assets (build-time only — see Part 3 if needed)     |
| OTP enable/disable    | Tenant App Config → Enable_OTP_LOGIN                   |
| Digi Gold enable      | Tenant App Config → Enable_Digi_Gold                   |

---

## Part 3: App Build & Play Store / App Store Upload

### For a Single Generic App (Recommended)

Use the same APK / IPA for all customers. Customer enters their license key on first launch.

```bash
# Build production APK
cd savings_app/frontend
npm run build
npx cap sync android
# Open Android Studio → Build → Generate Signed Bundle/APK

# Build iOS IPA
npx cap sync ios
# Open Xcode → Product → Archive → Distribute App
```

Upload once to Play Store / App Store. All tenants use it.

### For a Custom-Branded App Per Customer (White-label)

If a customer wants their own logo in the app:

1. Replace `savings_app/frontend/src/assets/img/logo/logo.png` with their logo
2. Update `savings_app/frontend/android/app/src/main/res/` icons with their icon
3. Update `capacitor.config.ts` → `appId` and `appName`
4. Build a separate APK/IPA for them
5. Upload under your developer account, give them the app link

---

## Part 4: Login Flow for Tulasi Honesty Jewels

### Customer Setup

| Field        | Value                  |
|--------------|------------------------|
| Tenant ID    | TULASI_BLR             |
| License Key  | TULASI-2026-PRO-A1B2   |
| Company Name | Tulasi Honesty Jewels  |
| City         | Bangalore              |
| Expires      | 31-Dec-2027            |

### Step-by-step Customer Login

1. Customer installs app → sees splash screen
2. **First time**: enters license key `TULASI-2026-PRO-A1B2`
3. App validates → shows "Tulasi Honesty Jewels — Bangalore"
4. If one branch → auto-selected. Multiple branches → pick branch.
5. License stored in device — **not asked again** on next open
6. Login screen: enter mobile number → OTP sent → enter OTP → Dashboard
7. Dashboard shows their enrolled schemes, installment history, due amounts

### Agent Login

1. Same app, same license key entry
2. Login screen: enter mobile number registered as agent (e.g. `8618541414`)
3. OTP sent → verify → Agent dashboard (search customer, collect installment)

### Admin / Staff Login  

1. ERP web panel at `http://your-erp-server.com`
2. Username + password (set at tenant creation)

---

## Part 5: Current Test Setup (Local Development)

### Servers to Run

```bash
# Terminal 1 — ERP Backend
cd /Users/a1989/Jewellery_ERP/server
node src/index.js
# Running on http://localhost:5001

# Terminal 2 — ERP Frontend (admin panel)
cd /Users/a1989/Jewellery_ERP/client
npm run dev
# Running on http://localhost:5173

# Terminal 3 — Savings App
cd /Users/a1989/Jewellery_ERP/savings_app/frontend
npm start
# Running on http://localhost:3000
```

### Test the Tulasi License Key Right Now

Open `http://localhost:3000` in browser:
1. Wait for splash → redirects to `/license`
2. Enter: `TULASI-2026-PRO-A1B2`
3. Click Validate → sees "Tulasi Honesty Jewels"
4. Redirected to login → enter any enrolled customer's mobile

### To Enroll a Test Customer Quickly

```bash
# Run this to add a test member for Tulasi tenant
cd /Users/a1989/Jewellery_ERP/server
node -e "
const db = require('./src/db/knex');
async function seed() {
  // First need a scheme and group
  const scheme = await db('tbl_scheme_master')
    .where('Tenant_ID','TULASI_BLR').first();
  if (!scheme) {
    console.log('No scheme found. Create one in ERP first.');
    process.exit(0);
  }
  const group = await db('tbl_scheme_groups')
    .where({ Tenant_ID: 'TULASI_BLR', Scheme_ID: scheme.Scheme_ID }).first();
  if (!group) {
    console.log('No group found. Create one in ERP first.');
    process.exit(0);
  }
  const exists = await db('tbl_scheme_members')
    .where({ Tenant_ID: 'TULASI_BLR', Mobile: '9999999999' }).first();
  if (exists) { console.log('Test member already exists:', exists.Member_Number); process.exit(0); }
  const [m] = await db('tbl_scheme_members').insert({
    Tenant_ID: 'TULASI_BLR',
    Branch_ID: 'TULASI_BLR_001',
    Member_Number: 'TULASI-00001',
    Member_Name: 'Test Customer',
    Mobile: '9999999999',
    Scheme_ID: scheme.Scheme_ID,
    Group_ID: group.Group_ID,
    Joining_Date: new Date(),
    Installment_Amount: 1000,
    Total_Installments: 12,
    Status: 'Active',
    Created_By: 'seed',
  }).returning('*');
  console.log('Test member created:', m.Member_Number);
  process.exit(0);
}
seed().catch(e => { console.error(e.message); process.exit(1); });
"
```

Then in the app: enter mobile `9999999999` → OTP shown in server console → verify → dashboard.

---

## Part 6: Production Deployment Checklist

Before giving the app to a real customer:

### ERP Server
- [ ] Deploy ERP server on a VPS/cloud (not localhost)
- [ ] Update `REACT_APP_ERP_API_URL` in `.env` to production URL
- [ ] Set `CLIENT_URL` and `MOBILE_APP_URL` in server `.env` to production domains
- [ ] Enable real SMS OTP gateway (replace console.log in `mobileAuth.js`)
- [ ] Set a strong `JWT_SECRET`
- [ ] Configure HTTPS (SSL certificate)

### SMS OTP Gateway
In `server/src/routes/mobileAuth.js`, find this block and add your SMS provider:
```js
// TODO: In production, send SMS via gateway
console.log(`[OTP] Mobile: ${mobile} | OTP: ${otp}`);
```
Replace with Twilio, MSG91, Fast2SMS, or any Indian SMS gateway:
```js
// Example: Fast2SMS (popular in India)
await axios.post('https://www.fast2sms.com/dev/bulkV2', {
  authorization: process.env.FAST2SMS_API_KEY,
  message: `Your OTP is ${otp}. Valid for 10 minutes. - Savings Club`,
  language: 'english',
  route: 'q',
  numbers: mobile,
});
```

### App Config
- [ ] Update `capacitor.config.ts` → correct server URL
- [ ] Build signed APK/IPA
- [ ] Test on real device before submitting to stores

### Per-Tenant Checklist
- [ ] Tenant created in ERP with correct details
- [ ] License key noted and given to customer
- [ ] At least one branch created
- [ ] Scheme master + groups created
- [ ] Store staff trained to enroll members at counter
- [ ] At least one agent created (if using field collection)

---

## Part 7: Key License Keys for Testing

| Tenant            | License Key              | Status  |
|-------------------|--------------------------|---------|
| Tulasi BLR        | TULASI-2026-PRO-A1B2     | Active  |
| Dhanalakshmi MYS  | DHANA-2026-STR-G7H8      | Active  |
| Sagar Jewellers   | SG-2026-MAHA             | Active  |
| VK Mani Chennai   | VKMANI-2026-PRO-E5F6     | Active  |
| SA Master         | SA-MASTER-2026-PERPETUAL | Active  |

---

## Part 8: Troubleshooting

| Error | Cause | Fix |
|-------|-------|-----|
| 404 on validate-license | Old server still running | Restart ERP server |
| CORS blocked | Origin not in allowed list | Add origin to `ALLOWED_ORIGINS` in `server/src/index.js` |
| OTP not received | SMS gateway not configured | Check server console for printed OTP (dev mode) |
| "Mobile not registered" | Customer not enrolled in scheme | Staff must enroll via ERP counter first |
| Branch not found | No active branches for tenant | Create branch in ERP Masters → Branch Master |
| License expired | `License_Expiry_Date` in past | Renew in ERP → Tenant Management |
| App shows old tenant after license change | Cached in Capacitor Preferences | Logout → re-enter license key |
