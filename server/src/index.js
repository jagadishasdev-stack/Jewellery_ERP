require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const { authenticate } = require('./middleware/auth');
const { setTenantContext } = require('./middleware/tenant');
const { validateLicense } = require('./middleware/license');
const { setDataMode } = require('./middleware/dataMode');
const { setBranchContext } = require('./middleware/branchMode');
const { sendError } = require('./utils/response');
const { initDisplayHub } = require('./sockets/displayHub');

// Routes
const authRoutes = require('./routes/auth');
const licenseRoutes = require('./routes/license');
const masterRoutes = require('./routes/master');
const ornamentsRoutes = require('./routes/ornaments');
const customersRoutes = require('./routes/customers');
const karigarRoutes = require('./routes/karigar');
const salesRoutes = require('./routes/sales');
const invoiceRoutes = require('./routes/invoice');
const displayRoutes = require('./routes/display');
const tenantRoutes = require('./routes/tenant');
const goldRateRoutes = require('./routes/goldRate');
const reportsRoutes = require('./routes/reports');
const floorsRoutes = require('./routes/floors');
const printerConfigRoutes = require('./routes/printerConfig');
const printLogRoutes = require('./routes/printLog');
const oldGoldRoutes = require('./routes/oldGold');
const transferRoutes = require('./routes/transfer');
const purchaseRoutes = require('./routes/purchase');
const customerAdvanceRoutes = require('./routes/customerAdvance');
const repairRoutes = require('./routes/repair');
const schemeRoutes = require('./routes/scheme');
const superAdminRoutes = require('./routes/superAdmin');
const invoiceStudioRoutes = require('./routes/invoiceStudio');
const uploadRoutes = require('./routes/upload');
const savingsSchemeRoutes = require('./routes/savingsScheme');
const dayCloseRoutes = require('./routes/dayClose');
const branchesRoutes = require('./routes/branches');
const auditRoutes = require('./routes/audit');
const modulesRoutes = require('./routes/modules');
const productCatalogRoutes = require('./routes/productCatalog');
const mobileAuthRoutes = require('./routes/mobileAuth');
const paymentsRoutes = require('./routes/payments');
const binManagementRoutes = require('./routes/binManagement');
const packetStockRoutes = require('./routes/packetStock');
const jobcardPredictionRoutes = require('./routes/jobcardPrediction');
const notificationsRoutes = require('./routes/notifications');
const smsConfigRoutes = require('./routes/smsConfig');
const pushConfigRoutes = require('./routes/pushConfig');
const deviceLicensesRoutes = require('./routes/deviceLicenses');
const webhooksRoutes = require('./routes/webhooks');
const policiesRoutes = require('./routes/policies');
const approvalRoutes = require('./routes/approval');
const pawnbrokingRoutes = require('./routes/pawnbroking');
const insuranceAmcRoutes = require('./routes/insuranceAmc');
const hrRoutes = require('./routes/hr');
const crmRoutes = require('./routes/crm');
const bankChequeRoutes = require('./routes/bankCheque');
const rateBookingAgentRoutes = require('./routes/rateBookingAgent');
const complianceRoutes = require('./routes/compliance');
const manufacturingRoutes = require('./routes/manufacturing');
const inventoryOpsRoutes = require('./routes/inventoryOps');
const accountingRoutes = require('./routes/accounting');
const tallyRoutes = require('./routes/tally');
const permissionsRoutes = require('./routes/permissions');
const excelImportRoutes = require('./routes/excelImport');
const syncRoutes = require('./routes/sync');
const { core: savingsAppCoreRoutes, razorpayV2: savingsAppRazorpayV2Routes } = require('./routes/savingsAppCore');

const app = express();
const server = http.createServer(app);

// ─── Allowed Origins (ERP client + Savings App + Capacitor native) ───────────
const ALLOWED_ORIGINS = [
  process.env.CLIENT_URL      || 'http://localhost:5173',
  process.env.MOBILE_APP_URL  || 'http://localhost:3000',
  'http://localhost:8100',
  'capacitor://localhost',
  'http://localhost',
  // Desktop app (Electron) serves the client from this same Express server —
  // Chromium still sends an Origin header on same-origin fetch/XHR, so it
  // must be allowed too.
  `http://localhost:${process.env.PORT || 5000}`,
].filter(Boolean);

// ─── Socket.io ──────────────────────────────────────────────────────────────
const io = new Server(server, {
  cors: {
    origin: (origin, callback) => {
      if (!origin || ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
      callback(new Error(`Socket CORS: origin ${origin} not allowed`));
    },
    methods: ['GET', 'POST'],
    credentials: true,
  },
});
initDisplayHub(io);
app.set('io', io);

// ─── Security & Middleware ───────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));
app.use(compression());

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    callback(new Error(`CORS: origin ${origin} not allowed`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Data-Mode'],
};

app.use(cors(corsOptions));
// verify: stashes the raw pre-parsed body buffer on req.rawBody — needed by
// routes/webhooks.js to compute Razorpay's HMAC signature over the EXACT
// bytes Razorpay signed, not a re-serialized (and potentially non-identical)
// copy of the parsed JSON. Harmless extra buffer capture for every other
// route that never reads it.
app.use(express.json({ limit: '5mb', verify: (req, res, buf) => { req.rawBody = buf; } }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// ─── Rate Limiting ──────────────────────────────────────────────────────────
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 20,
  message: { success: false, message: 'Too many login attempts. Please try again later.' },
});
const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 min
  max: 1500,
  message: { success: false, message: 'Too many requests. Please slow down.' },
});

// ─── Global Middleware Chain ─────────────────────────────────────────────────
app.use('/api', apiLimiter);
app.use('/api', setTenantContext);
app.use('/api', validateLicense);
app.use('/api', setDataMode);   // injects req.dataMode (1/2/3) on every request
app.use('/api', setBranchContext);   // injects req.branchId (specific branch / 'ALL' / null) on every request

// ─── Routes ─────────────────────────────────────────────────────────────────
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/license', licenseRoutes);
app.use('/api/master', masterRoutes);
app.use('/api/ornaments', ornamentsRoutes);
app.use('/api/customers', customersRoutes);
app.use('/api/karigar', karigarRoutes);
app.use('/api/sales', salesRoutes);
app.use('/api/invoice', invoiceRoutes);
app.use('/api/display', displayRoutes);
app.use('/api/tenant', tenantRoutes);
app.use('/api/gold-rate', goldRateRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/floors', floorsRoutes);
app.use('/api/printer-config', printerConfigRoutes);
app.use('/api/print-log', printLogRoutes);
app.use('/api/old-gold', oldGoldRoutes);
app.use('/api/transfer', transferRoutes);
app.use('/api/purchase', purchaseRoutes);
app.use('/api/customer-advance', customerAdvanceRoutes);
app.use('/api/repair', repairRoutes);
app.use('/api/scheme', schemeRoutes);
app.use('/api/super-admin', superAdminRoutes);
app.use('/api/invoice-studio', invoiceStudioRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/savings', savingsSchemeRoutes);
// Public compatibility routes for the savings_app mobile frontend — see
// the file header comment in savingsAppCore.js for why these exist and
// why they're public rather than behind `authenticate`.
app.use('/api/core', savingsAppCoreRoutes);
app.use('/api/razorpay/v2', savingsAppRazorpayV2Routes);
app.use('/api/day-close', dayCloseRoutes);
app.use('/api/branches', branchesRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/modules', modulesRoutes);
app.use('/api/catalog', productCatalogRoutes);
app.use('/api/mobile', mobileAuthRoutes);
// Deliberately NOT mounted — routes/payments.js is dead legacy code with a
// real security/accounting-integrity risk: its create-order route accepts
// a CLIENT-SUPPLIED key_id/key_secret and uses them for a real Razorpay
// API call, and its verify route bypasses recordSchemeCollection() entirely
// (writes tbl_scheme_members/tbl_scheme_transactions directly, so it never
// reaches the real ledger). Confirmed zero callers anywhere in the
// codebase — savingsAppCore.js's razorpayV2Router + /api/core/payForScheme
// is the one real, hardened payment path. Left in the tree rather than
// deleted in case anything about its PhonePe handlers is still wanted
// later, but it must not be live.
// app.use('/api/payments', paymentsRoutes);
app.use('/api/bin', binManagementRoutes);
app.use('/api/packet-stock', packetStockRoutes);
app.use('/api/jobcard-prediction', jobcardPredictionRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/sms-config', smsConfigRoutes);
app.use('/api/push-config', pushConfigRoutes);
app.use('/api/device-licenses', deviceLicensesRoutes);
app.use('/api/webhooks', webhooksRoutes);
app.use('/api/policies', policiesRoutes);
app.use('/api/approval', approvalRoutes);
app.use('/api/pawnbroking', pawnbrokingRoutes);
app.use('/api/insurance-amc', insuranceAmcRoutes);
app.use('/api/hr', hrRoutes);
app.use('/api/crm', crmRoutes);
app.use('/api/bank-cheque', bankChequeRoutes);
app.use('/api/rate-agent', rateBookingAgentRoutes);
app.use('/api/compliance', complianceRoutes);
app.use('/api/manufacturing', manufacturingRoutes);
app.use('/api/inventory-ops', inventoryOpsRoutes);
app.use('/api/accounting', accountingRoutes);
app.use('/api/tally', tallyRoutes);
app.use('/api/permissions', permissionsRoutes);
app.use('/api/excel-import', excelImportRoutes);
app.use('/api/sync', syncRoutes);
// Serve uploaded files as static assets
app.use('/uploads', require('express').static(require('./utils/uploadsDir').getUploadsRoot()));

// ─── Health Check ────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'Jewellery ERP API',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  });
});

// ─── Serve the built client (desktop app / same-origin production deploy) ───
// Only kicks in when a production client build is present — dev keeps using
// the Vite dev server at :5173 and never touches this.
const path = require('path');
const fs = require('fs');
const clientDistDir = process.env.CLIENT_DIST_DIR || path.join(__dirname, '../../client/dist');
if (fs.existsSync(path.join(clientDistDir, 'index.html'))) {
  app.use(express.static(clientDistDir));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) return next();
    res.sendFile(path.join(clientDistDir, 'index.html'));
  });
}

// ─── 404 Handler ────────────────────────────────────────────────────────────
app.use('*', (req, res) => {
  sendError(res, 404, `Route ${req.method} ${req.originalUrl} not found.`);
});

// ─── Global Error Handler ────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  sendError(res, 500, 'An unexpected error occurred.');
});

// ─── Start Server ────────────────────────────────────────────────────────────
// Guarded so the test suite can `require('../src/index').app` for supertest
// without also binding the port (and colliding with a real dev server
// already running on it) — only actually listens when this file is the
// process entrypoint, exactly what `npm start`/`node src/index.js` are.
const PORT = process.env.PORT || 5000;
if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`\n🚀 Jewellery ERP Server running on port ${PORT}`);
    console.log(`📡 Socket.io ready at ws://localhost:${PORT}`);
    console.log(`🌐 API: http://localhost:${PORT}/api`);
    console.log(`💚 Health: http://localhost:${PORT}/health\n`);
  });
}

module.exports = { app, server };
