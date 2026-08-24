/**
 * Mobile App Authentication Routes
 * Supports: Image App + Savings App login
 * New flow: License Key → Tenant Validation → Username/Password → JWT
 * Replaces: IP address entry (Image App) + store_id login (Savings App)
 */
const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const db = require('../db/knex');
const { sendSuccess, sendError } = require('../utils/response');
const { auditLog } = require('../utils/auditLogger');
const { sendSms } = require('../utils/smsService');
const { authenticate } = require('../middleware/auth');

// ─── Step 1: Validate License Key ─────────────────────────────────────────────
// POST /api/mobile/validate-license
// Savings App / Image App calls this FIRST to get tenant info
router.post('/validate-license', async (req, res) => {
  const { licenseKey } = req.body;
  if (!licenseKey?.trim()) return sendError(res, 400, 'License key is required.');

  try {
    const tenant = await db('tbl_tenant_master')
      .where('License_Key', licenseKey.trim())
      .where('Is_Active', true)
      .select(
        'Tenant_ID', 'Company_Name', 'Brand_Code', 'City', 'GST_No',
        'Phone', 'Email', 'License_Expiry_Date', 'Business_Type',
        'Store_Type',
      )
      .first();

    if (!tenant) return sendError(res, 404, 'Invalid license key or tenant not found.');

    const isExpired = new Date(tenant.License_Expiry_Date) < new Date();
    if (isExpired) return sendError(res, 403, 'License has expired. Please renew.');

    const daysLeft = Math.ceil((new Date(tenant.License_Expiry_Date) - new Date()) / (1000 * 60 * 60 * 24));

    return sendSuccess(res, {
      tenantId:     tenant.Tenant_ID,
      companyName:  tenant.Company_Name,
      brandCode:    tenant.Brand_Code,
      city:         tenant.City,
      businessType: tenant.Business_Type || 'HYBRID',
      licenseExpiry: tenant.License_Expiry_Date,
      daysLeft,
      // ERP gold rate for display
    }, 'License valid. Please enter your credentials.');
  } catch (err) {
    console.error('License validate error:', err.message);
    return sendError(res, 500, 'License validation failed.');
  }
});

// ─── Request per-device access — Image App ────────────────────────────────────
// POST /api/mobile/request-device-access
// Only meaningful for a tenant on License_Mode='PER_DEVICE'. The app captures
// a stable Device_ID on install (Capacitor Device.getId()) and sends it here
// BEFORE it has any license key. This just files a pending request — the
// Super Admin reviews it in the dashboard and, if approved, hands the store a
// License_Key out of band (call/message) that will only activate on this
// exact Device_ID. Idempotent: re-requesting the same device+tenant while a
// request is still pending/approved returns the existing row instead of
// piling up duplicates.
router.post('/request-device-access', async (req, res) => {
  const { tenantId, deviceId, deviceModel, contactNote } = req.body;
  if (!tenantId?.trim() || !deviceId?.trim()) {
    return sendError(res, 400, 'tenantId and deviceId are required.');
  }

  try {
    const tenant = await db('tbl_tenant_master')
      .where({ Tenant_ID: tenantId.trim(), Is_Active: true })
      .first();
    if (!tenant) return sendError(res, 404, 'Tenant not found. Check the Tenant ID and try again.');

    const existing = await db('tbl_device_licenses')
      .where({ Tenant_ID: tenantId.trim(), Device_ID: deviceId.trim() })
      .whereIn('Status', ['PENDING', 'APPROVED'])
      .first();
    if (existing) {
      return sendSuccess(res, { status: existing.Status }, 'Request already on file.');
    }

    await db('tbl_device_licenses').insert({
      Tenant_ID: tenantId.trim(),
      Device_ID: deviceId.trim(),
      Device_Model: deviceModel || null,
      Contact_Note: contactNote || null,
      Status: 'PENDING',
    });

    return sendSuccess(res, { status: 'PENDING' }, 'Request sent. Your provider will issue a license key once approved.');
  } catch (err) {
    console.error('Request device access error:', err.message);
    return sendError(res, 500, 'Failed to submit device access request.');
  }
});

// ─── License-only activation — Image App ──────────────────────────────────────
// POST /api/mobile/license-login
// The Image App has no signup/login of its own: entering a valid license key
// IS the full authentication. This mints a tenant-scoped JWT directly off the
// license key so every subsequent request automatically resolves to that
// tenant's own database via the `authenticate` middleware's tenant-DB resolver.
// Short-lived (7d) — the app silently re-calls this on every cold start (see
// Image_App's TenantContext) so a revoked/expired license locks it out within
// a week without ever asking the user to re-enter anything.
//
// deviceId is always sent by the app now (see TenantContext.jsx). For a
// TENANT_WIDE tenant it's just recorded for information; for a PER_DEVICE
// tenant the key must match an APPROVED tbl_device_licenses row for THAT
// exact device — the same key typed into a second device is rejected.
router.post('/license-login', async (req, res) => {
  const { licenseKey, deviceId } = req.body;
  if (!licenseKey?.trim()) return sendError(res, 400, 'License key is required.');

  try {
    const tenant = await db('tbl_tenant_master')
      .where('License_Key', licenseKey.trim())
      .where('Is_Active', true)
      .select(
        'Tenant_ID', 'Company_Name', 'Brand_Code', 'City', 'GST_No',
        'Phone', 'Email', 'License_Expiry_Date', 'Business_Type', 'License_Mode',
      )
      .first();

    let deviceLicense = null;
    if (!tenant) {
      // Not a tenant-wide key — maybe it's a per-device key instead.
      deviceLicense = await db('tbl_device_licenses')
        .where({ License_Key: licenseKey.trim(), Status: 'APPROVED' })
        .first();
      if (!deviceLicense) return sendError(res, 404, 'Invalid license key or tenant not found.');
      if (!deviceId?.trim() || deviceLicense.Device_ID !== deviceId.trim()) {
        return sendError(res, 403, 'This license key is registered to a different device.');
      }
    }

    const resolvedTenant = tenant || await db('tbl_tenant_master')
      .where({ Tenant_ID: deviceLicense.Tenant_ID, Is_Active: true })
      .select(
        'Tenant_ID', 'Company_Name', 'Brand_Code', 'City', 'GST_No',
        'Phone', 'Email', 'License_Expiry_Date', 'Business_Type', 'License_Mode',
      )
      .first();
    if (!resolvedTenant) return sendError(res, 404, 'Invalid license key or tenant not found.');

    // A tenant-wide key entered for a tenant now switched to PER_DEVICE mode
    // no longer works on its own — that tenant's devices must go through the
    // request/approve flow instead.
    if (tenant && resolvedTenant.License_Mode === 'PER_DEVICE') {
      return sendError(res, 403, 'This tenant now requires per-device approval. Please request access for this device.');
    }

    const isExpired = new Date(resolvedTenant.License_Expiry_Date) < new Date();
    if (isExpired) return sendError(res, 403, 'License has expired. Please contact your ERP administrator.');

    const daysLeft = Math.ceil((new Date(resolvedTenant.License_Expiry_Date) - new Date()) / (1000 * 60 * 60 * 24));

    const token = jwt.sign({
      tenantId:  resolvedTenant.Tenant_ID,
      roleName:  'Image App',
      username:  `IMGAPP_${resolvedTenant.Tenant_ID}`,
      loginType: 'license-device',
      deviceId:  deviceId || null,
      permissions: {},
    }, process.env.JWT_SECRET, { expiresIn: '7d' });

    return sendSuccess(res, {
      token,
      tenantId:     resolvedTenant.Tenant_ID,
      companyName:  resolvedTenant.Company_Name,
      brandCode:    resolvedTenant.Brand_Code,
      city:         resolvedTenant.City,
      businessType: resolvedTenant.Business_Type || 'HYBRID',
      licenseExpiry: resolvedTenant.License_Expiry_Date,
      daysLeft,
    }, 'License activated.');
  } catch (err) {
    console.error('License login error:', err.message);
    return sendError(res, 500, 'License activation failed.');
  }
});

// ─── Step 2: Mobile Login ──────────────────────────────────────────────────────
// POST /api/mobile/login
// Works for both Image App users and Savings App members/agents
router.post('/login', async (req, res) => {
  const { licenseKey, tenantId, username, password, mobile, otp, loginType = 'staff' } = req.body;

  // Resolve tenant from either licenseKey or tenantId
  let resolvedTenantId = tenantId;
  if (!resolvedTenantId && licenseKey) {
    const t = await db('tbl_tenant_master').where('License_Key', licenseKey).first();
    if (!t) return sendError(res, 404, 'Invalid license key.');
    resolvedTenantId = t.Tenant_ID;
  }
  if (!resolvedTenantId) return sendError(res, 400, 'tenantId or licenseKey required.');

  try {
    const tenant = await db('tbl_tenant_master').where('Tenant_ID', resolvedTenantId).first();
    if (!tenant || !tenant.Is_Active) return sendError(res, 403, 'Tenant inactive.');
    if (new Date(tenant.License_Expiry_Date) < new Date()) return sendError(res, 403, 'License expired.');

    // ── loginType: 'customer' — mobile OTP based (Savings App customers) ──────
    if (loginType === 'customer' && mobile) {
      // For customer mobile login — find or create customer record
      let customer = await db('tbl_customer_master')
        .where({ Tenant_ID: resolvedTenantId })
        .where(function() { this.where('Mobile_1', mobile).orWhere('Mobile_2', mobile); })
        .first();

      if (!customer) {
        // Check scheme members table (savings app legacy)
        const member = await db('tbl_scheme_members')
          .where({ Tenant_ID: resolvedTenantId, Mobile: mobile })
          .first();

        if (!member) return sendError(res, 404, 'Customer/member not found. Please register first.');

        // Create JWT for member
        const token = jwt.sign({
          memberId:  member.Member_ID,
          tenantId:  resolvedTenantId,
          mobile:    mobile,
          roleName:  'Customer',
          username:  mobile,
          fullName:  member.Member_Name,
          loginType: 'customer',
          permissions: { savings_scheme: true },
        }, process.env.JWT_SECRET, { expiresIn: '7d' });

        return sendSuccess(res, {
          token,
          user: {
            memberId:   member.Member_ID,
            memberName: member.Member_Name,
            mobile:     mobile,
            tenantId:   resolvedTenantId,
            companyName: tenant.Company_Name,
            roleName:   'Customer',
            loginType:  'customer',
          },
        }, 'Customer login successful.');
      }

      // Customer exists in CRM
      const token = jwt.sign({
        customerId: customer.Customer_ID,
        tenantId:   resolvedTenantId,
        mobile:     mobile,
        roleName:   'Customer',
        username:   mobile,
        fullName:   customer.Customer_Name,
        loginType:  'customer',
        permissions: { savings_scheme: true, retail_sales: false },
      }, process.env.JWT_SECRET, { expiresIn: '7d' });

      return sendSuccess(res, {
        token,
        user: {
          customerId:  customer.Customer_ID,
          customerName: customer.Customer_Name,
          mobile,
          tenantId:    resolvedTenantId,
          companyName: tenant.Company_Name,
          roleName:    'Customer',
          loginType:   'customer',
        },
      }, 'Customer login successful.');
    }

    // ── loginType: 'staff' — username/password (ERP standard) ─────────────────
    if (!username || !password) return sendError(res, 400, 'Username and password required.');

    const user = await db('tbl_user_master as u')
      .join('tbl_role_master as r', 'u.Role_ID', 'r.Role_ID')
      .where({ 'u.Tenant_ID': resolvedTenantId, 'u.Username': username, 'u.Is_Active': true })
      .select('u.*', 'r.Role_Name', 'r.Permissions')
      .first();

    if (!user) return sendError(res, 401, 'Invalid username or password.');

    const valid = await bcrypt.compare(password, user.Password_Hash);
    if (!valid) {
      await db('tbl_user_master').where('User_ID', user.User_ID).update({
        Login_Attempts: (user.Login_Attempts || 0) + 1,
      });
      return sendError(res, 401, 'Invalid username or password.');
    }

    const permissions = typeof user.Permissions === 'string' ? JSON.parse(user.Permissions) : user.Permissions;

    const token = jwt.sign({
      userId:      user.User_ID,
      tenantId:    resolvedTenantId,
      roleId:      user.Role_ID,
      roleName:    user.Role_Name,
      username:    user.Username,
      fullName:    user.Full_Name,
      loginType:   'staff',
      permissions,
    }, process.env.JWT_SECRET, { expiresIn: '24h' });

    // Session
    const sessionId = uuidv4();
    await db('tbl_session_master').insert({
      Session_ID: sessionId, Tenant_ID: resolvedTenantId,
      User_ID: user.User_ID, IP_Address: req.ip,
      Device_Info: req.headers['user-agent'], Is_Active: true,
    }).catch(() => {});

    await db('tbl_user_master').where('User_ID', user.User_ID).update({
      Last_Login_Date: new Date(), Login_Attempts: 0, Locked_Until: null,
    });

    await auditLog({
      tenantId: resolvedTenantId, userId: user.User_ID,
      tableName: 'tbl_session_master', recordId: sessionId,
      actionType: 'LOGIN',
      description: `Mobile staff login: "${username}"`,
      req: { ...req, user: { username, fullName: user.Full_Name } },
    });

    return sendSuccess(res, {
      token,
      sessionId,
      user: {
        userId:     user.User_ID,
        username:   user.Username,
        fullName:   user.Full_Name,
        tenantId:   resolvedTenantId,
        companyName: tenant.Company_Name,
        businessType: tenant.Business_Type || 'HYBRID',
        roleName:   user.Role_Name,
        permissions,
        loginType:  'staff',
      },
    }, 'Login successful.');
  } catch (err) {
    console.error('Mobile login error:', err.message);
    return sendError(res, 500, `Login failed: ${err.message}`);
  }
});

// ─── GET /api/mobile/tenant-info — get tenant config for mobile app ───────────
// Used by both apps on startup to get theme/logo/config
// PUBLIC — no auth needed, called before login to get rates + branding
router.get('/tenant-info/:tenantId', async (req, res) => {
  try {
    const tenant = await db('tbl_tenant_master')
      .where({ Tenant_ID: req.params.tenantId, Is_Active: true })
      .select('Tenant_ID', 'Company_Name', 'Brand_Code', 'City', 'Phone',
              'Business_Type', 'License_Expiry_Date')
      .first();

    if (!tenant) return sendError(res, 404, 'Tenant not found.');

    // Try to get rates from tenant_rates table first
    const goldRate = await db('tbl_tenant_rates')
      .where('Tenant_ID', req.params.tenantId)
      .orderBy('Rate_Date', 'desc')
      .first()
      .catch(() => null);

    // Fallback to live gold rate table if no tenant-specific rate
    const liveRate = !goldRate ? await db('tbl_gold_rates')
      .orderBy('Rate_Date', 'desc')
      .first()
      .catch(() => null) : null;

    const rate = goldRate || liveRate || {};

    return sendSuccess(res, {
      Tenant_ID:    tenant.Tenant_ID,
      Company_Name: tenant.Company_Name,
      Brand_Code:   tenant.Brand_Code,
      City:         tenant.City,
      Business_Type: tenant.Business_Type,
      gold_rate_22k: parseFloat(rate.Rate_22K || rate.rate_22k || 0),
      gold_rate_24k: parseFloat(rate.Rate_24K || rate.rate_24k || 0),
      silver_rate:   parseFloat(rate.Rate_Silver || rate.rate_silver || 0),
    });
  } catch (err) {
    console.error('tenant-info error:', err.message);
    return sendError(res, 500, 'Failed.');
  }
});

// ─── GET /api/mobile/check-member/:tenantId/:mobile ───────────────────────────
// Public pre-signup check: is this mobile already an enrolled scheme member?
// No JWT exists yet at this point in the signup flow, so this must stay public —
// it intentionally returns only a boolean, not member details.
router.get('/check-member/:tenantId/:mobile', async (req, res) => {
  const { tenantId, mobile } = req.params;
  try {
    const member = await db('tbl_scheme_members')
      .where({ Tenant_ID: tenantId, Mobile: mobile, Status: 'Active' })
      .first();
    return sendSuccess(res, { enrolled: !!member });
  } catch (err) {
    console.error('Check member error:', err.message);
    return sendError(res, 500, 'Failed to check member status.');
  }
});

// ─── POST /api/mobile/send-otp ─────────────────────────────────────────────────
// Sends OTP to mobile number (customer or agent login)
// purpose: LOGIN | REGISTER
router.post('/send-otp', async (req, res) => {
  const { mobile, tenantId, purpose = 'LOGIN' } = req.body;
  if (!mobile || !tenantId) return sendError(res, 400, 'mobile and tenantId required.');

  try {
    // Verify tenant exists
    const tenant = await db('tbl_tenant_master').where({ Tenant_ID: tenantId, Is_Active: true }).first();
    if (!tenant) return sendError(res, 404, 'Tenant not found.');

    // Determine requester type
    const isAgent = await db('tbl_agent_master')
      .where({ Tenant_ID: tenantId, Mobile: mobile, Status: 'Active' })
      .first();
    const isMember = await db('tbl_scheme_members')
      .where({ Tenant_ID: tenantId, Mobile: mobile, Status: 'Active' })
      .first();
    const isCustomer = await db('tbl_customer_master')
      .where({ Tenant_ID: tenantId })
      .where(function () { this.where('Mobile_1', mobile).orWhere('Mobile_2', mobile); })
      .first();

    if (purpose === 'LOGIN' && !isAgent && !isMember && !isCustomer) {
      return sendError(res, 404, 'Mobile number not registered. Please visit the store to enroll first.');
    }

    // Generate 6-digit OTP — fixed value in dev/local so testing doesn't
    // require checking the server console every time; real random OTP in production.
    const otp = process.env.NODE_ENV === 'production'
      ? String(Math.floor(100000 + Math.random() * 900000))
      : '234789';
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Invalidate previous OTPs for this mobile
    await db('tbl_mobile_otp')
      .where({ Mobile: mobile, Purpose: purpose, Is_Used: false })
      .update({ Is_Used: true });

    // Insert new OTP
    await db('tbl_mobile_otp').insert({
      Mobile: mobile,
      OTP: otp,
      Purpose: purpose,
      Is_Used: false,
      Expires_At: expiresAt,
    });

    // Always log to console too, useful while watching the server during testing
    console.log(`[OTP] Mobile: ${mobile} | OTP: ${otp} | Purpose: ${purpose}`);

    // Send the real SMS via the configured DLT gateway (tbl_sms_gateway_config /
    // tbl_sms_templates). Never blocks/breaks the OTP flow if it fails — the
    // dev OTP fallback below still lets local testing continue either way.
    const smsResult = await sendSms({
      tenantId,
      mobile,
      purpose: 'OTP',
      variables: { '<OTP>': otp },
    });

    return sendSuccess(res, {
      mobile,
      purpose,
      otpSent: true,
      smsSent: smsResult.success,
      // Return OTP in dev mode only — remove in production
      ...(process.env.NODE_ENV !== 'production' && { devOtp: otp }),
    }, 'OTP sent successfully.');
  } catch (err) {
    console.error('Send OTP error:', err.message);
    return sendError(res, 500, 'Failed to send OTP.');
  }
});

// ─── POST /api/mobile/verify-otp ──────────────────────────────────────────────
// Verify OTP and issue JWT for customer or agent
router.post('/verify-otp', async (req, res) => {
  const { mobile, otp, tenantId, branchId, purpose = 'LOGIN', signupData } = req.body;
  if (!mobile || !otp || !tenantId) return sendError(res, 400, 'mobile, otp, tenantId required.');

  try {
    const tenant = await db('tbl_tenant_master').where({ Tenant_ID: tenantId, Is_Active: true }).first();
    if (!tenant) return sendError(res, 404, 'Tenant not found.');
    if (new Date(tenant.License_Expiry_Date) < new Date()) return sendError(res, 403, 'License expired.');

    // Fixed dev OTP (see send-otp) — reusable across repeated test attempts
    // in dev, unlike a real one-time code, so testing doesn't require a
    // fresh send-otp call every time. Never applies in production.
    const isDevFixedOtp = process.env.NODE_ENV !== 'production' && otp === '234789';

    if (!isDevFixedOtp) {
      // Validate OTP
      const otpRecord = await db('tbl_mobile_otp')
        .where({ Mobile: mobile, OTP: otp, Purpose: purpose, Is_Used: false })
        .where('Expires_At', '>', new Date())
        .orderBy('Created_Date', 'desc')
        .first();

      if (!otpRecord) return sendError(res, 401, 'Invalid or expired OTP.');

      // Mark OTP as used
      await db('tbl_mobile_otp').where('OTP_ID', otpRecord.OTP_ID).update({ Is_Used: true });
    }

    // ── Check if Agent ────────────────────────────────────────────────────────
    const agent = await db('tbl_agent_master')
      .where({ Tenant_ID: tenantId, Mobile: mobile, Status: 'Active' })
      .first();

    if (agent) {
      const token = jwt.sign({
        agentId:   agent.Agent_ID,
        agentCode: agent.Agent_Code,
        tenantId,
        branchId:  branchId || agent.Branch_ID,
        mobile,
        fullName:  agent.Agent_Name,
        roleName:  'Agent',
        loginType: 'agent',
        permissions: { savings_scheme: true, collect_installment: true },
      }, process.env.JWT_SECRET, { expiresIn: '12h' });

      return sendSuccess(res, {
        token,
        loginType: 'agent',
        user: {
          agentId:    agent.Agent_ID,
          agentCode:  agent.Agent_Code,
          agentName:  agent.Agent_Name,
          mobile,
          tenantId,
          branchId:   branchId || agent.Branch_ID,
          companyName: tenant.Company_Name,
          roleName:   'Agent',
        },
      }, 'Agent login successful.');
    }

    // ── Check Customer in CRM ─────────────────────────────────────────────────
    let customer = await db('tbl_customer_master')
      .where({ Tenant_ID: tenantId })
      .where(function () { this.where('Mobile_1', mobile).orWhere('Mobile_2', mobile); })
      .first();

    if (!customer) {
      // Fallback: check scheme members
      const member = await db('tbl_scheme_members')
        .where({ Tenant_ID: tenantId, Mobile: mobile })
        .first();

      if (!member) {
        // No existing agent/customer/member for this mobile — only OK if this
        // is a self-registration (purpose=REGISTER); create the customer now.
        // (For purpose=LOGIN this correctly falls through to a 404 below.)
        if (purpose !== 'REGISTER') return sendError(res, 404, 'User not found for this tenant.');

        const custCount = await db('tbl_customer_master').where({ Tenant_ID: tenantId }).count('Customer_ID as c').first();
        const customerCode = `CUST-${tenantId.replace(/_/g, '')}-${String(parseInt(custCount.c) + 1).padStart(5, '0')}`;

        const [newCustomer] = await db('tbl_customer_master').insert({
          Tenant_ID: tenantId,
          Customer_Code: customerCode,
          Customer_Name: signupData?.name?.trim() || `Customer ${mobile}`,
          Mobile_1: mobile,
          Email: signupData?.email || null,
          Address_Line1: signupData?.address1 || null,
          Pincode: signupData?.pincode || null,
          Created_By: 'self-signup',
        }).returning('*');

        const token = jwt.sign({
          customerId: newCustomer.Customer_ID,
          tenantId,
          branchId:   branchId || null,
          mobile,
          fullName:   newCustomer.Customer_Name,
          roleName:   'Customer',
          loginType:  'customer',
          permissions: { savings_scheme: true },
        }, process.env.JWT_SECRET, { expiresIn: '7d' });

        return sendSuccess(res, {
          token,
          loginType: 'customer',
          user: {
            customerId:  newCustomer.Customer_ID,
            customerName: newCustomer.Customer_Name,
            mobile,
            tenantId,
            branchId:    branchId || null,
            companyName: tenant.Company_Name,
            roleName:    'Customer',
          },
        }, 'Registration successful.', 201);
      }

      const token = jwt.sign({
        memberId:  member.Member_ID,
        tenantId,
        branchId:  branchId || member.Branch_ID,
        mobile,
        fullName:  member.Member_Name,
        roleName:  'Customer',
        loginType: 'customer',
        permissions: { savings_scheme: true },
      }, process.env.JWT_SECRET, { expiresIn: '7d' });

      return sendSuccess(res, {
        token,
        loginType: 'customer',
        user: {
          memberId:    member.Member_ID,
          memberName:  member.Member_Name,
          mobile,
          tenantId,
          branchId:    branchId || member.Branch_ID,
          companyName: tenant.Company_Name,
          roleName:    'Customer',
        },
      }, 'Customer login successful.');
    }

    const token = jwt.sign({
      customerId: customer.Customer_ID,
      tenantId,
      branchId:   branchId || null,
      mobile,
      fullName:   customer.Customer_Name,
      roleName:   'Customer',
      loginType:  'customer',
      permissions: { savings_scheme: true },
    }, process.env.JWT_SECRET, { expiresIn: '7d' });

    return sendSuccess(res, {
      token,
      loginType: 'customer',
      user: {
        customerId:  customer.Customer_ID,
        customerName: customer.Customer_Name,
        mobile,
        tenantId,
        branchId:    branchId || null,
        companyName: tenant.Company_Name,
        roleName:    'Customer',
      },
    }, 'Customer login successful.');
  } catch (err) {
    console.error('Verify OTP error:', err.message);
    return sendError(res, 500, 'OTP verification failed.');
  }
});

// ─── GET /api/mobile/branches/:tenantId ───────────────────────────────────────
// PUBLIC — no auth needed. Called right after license validation.
router.get('/branches/:tenantId', async (req, res) => {
  try {
    const tenant = await db('tbl_tenant_master')
      .where({ Tenant_ID: req.params.tenantId, Is_Active: true })
      .first();
    if (!tenant) return sendError(res, 404, 'Tenant not found.');

    const branches = await db('tbl_branch_master')
      .where({ Tenant_ID: req.params.tenantId, Is_Active: true })
      .orderBy('Is_Head_Office', 'desc')
      .orderBy('Branch_Name')
      .select('Branch_ID', 'Branch_Name', 'Branch_Code', 'City', 'Is_Head_Office');

    return sendSuccess(res, branches);
  } catch (err) {
    console.error('Branches fetch error:', err.message);
    return sendError(res, 500, 'Failed to fetch branches.');
  }
});

// ─── GET /api/mobile/app-config/:tenantId ──────────────────────────────────────
// Returns full tenant app config (theme, colors, feature flags)
router.get('/app-config/:tenantId', async (req, res) => {
  try {
    const cfg = await db('tbl_tenant_app_config')
      .where('Tenant_ID', req.params.tenantId)
      .first();

    if (!cfg) return sendError(res, 404, 'App config not found for this tenant.');

    return sendSuccess(res, cfg);
  } catch (err) {
    return sendError(res, 500, 'Failed to load app config.');
  }
});

// ─── GET /api/mobile/policies/:tenantId ───────────────────────────────────────
// Public — Terms & Conditions / About Us / Privacy / Return / Shipping content
// for the savings_app policy dialogs. Grouped by Policy_Type; a type falls
// back to the global default rows only if the tenant has none of its own for
// that type (per-type fallback, not merged).
router.get('/policies/:tenantId', async (req, res) => {
  try {
    const tenantRows = await db('tbl_scheme_policies')
      .where({ Tenant_ID: req.params.tenantId, Is_Active: true })
      .orderBy(['Policy_Type', 'Sort_Order']);

    const coveredTypes = new Set(tenantRows.map(r => r.Policy_Type));

    const globalRows = await db('tbl_scheme_policies')
      .whereNull('Tenant_ID')
      .where({ Is_Active: true })
      .modify(qb => { if (coveredTypes.size) qb.whereNotIn('Policy_Type', [...coveredTypes]); })
      .orderBy(['Policy_Type', 'Sort_Order']);

    const byType = new Map();
    [...tenantRows, ...globalRows].forEach(r => {
      if (!byType.has(r.Policy_Type)) byType.set(r.Policy_Type, []);
      byType.get(r.Policy_Type).push({ id: r.Policy_ID, title: r.Section_Title, content: r.Section_Content });
    });

    const policies = Array.from(byType.entries()).map(([policy_type, subPolicies]) => ({ policy_type, subPolicies }));
    return sendSuccess(res, { policies });
  } catch (err) {
    console.error('Get policies error:', err.message);
    return sendError(res, 500, 'Failed to load policies.');
  }
});

// ─── Staff PIN identification — Image App (shared-device attribution) ────────
// The Image App's own session (from license-login) has no per-person
// identity at all — every write is attributed to the device, not whoever's
// actually holding it. These two routes let a real staff member identify
// themselves without a full username/password login every time the tablet
// changes hands: pick your name, enter your PIN, and every stock edit/image
// upload for the rest of that session is attributed to YOU, not the device.
//
// GET /api/mobile/staff-list — requires the device's own token (authenticate)
// so this can't be enumerated by an unactivated caller. Only lists staff who
// actually have a PIN set — someone with no PIN can't use this flow at all
// and correctly doesn't show up as an option.
router.get('/staff-list', authenticate, async (req, res) => {
  try {
    const staff = await db('tbl_user_master')
      .where({ Tenant_ID: req.user.tenantId, Is_Active: true })
      .whereNotNull('PIN_Hash')
      .select('User_ID', 'Full_Name', 'Username')
      .orderBy('Full_Name');
    return sendSuccess(res, staff);
  } catch (err) {
    console.error('Staff list error:', err.message);
    return sendError(res, 500, 'Failed to load staff list.');
  }
});

// POST /api/mobile/staff-pin-login — body: { userId, pin }. Also requires the
// device's own token, so a PIN can only ever be tried from an already
// license-activated device for that same tenant — not brute-forceable from
// an anonymous caller with no license at all.
router.post('/staff-pin-login', authenticate, async (req, res) => {
  const { userId, pin } = req.body;
  if (!userId || !pin) return sendError(res, 400, 'userId and pin are required.');

  try {
    const user = await db('tbl_user_master')
      .where({ User_ID: userId, Tenant_ID: req.user.tenantId, Is_Active: true })
      .whereNotNull('PIN_Hash')
      .first();
    if (!user) return sendError(res, 404, 'Staff member not found or has no PIN set.');

    const valid = await bcrypt.compare(String(pin), user.PIN_Hash);
    if (!valid) return sendError(res, 401, 'Incorrect PIN.');

    const role = await db('tbl_role_master').where({ Role_ID: user.Role_ID }).first();

    // Short-lived on purpose — this identifies who's using the device for
    // roughly one shift, not a long-term session like the license-device
    // token (which stays valid for the same 7d as before, underneath this).
    const token = jwt.sign({
      userId: user.User_ID,
      tenantId: req.user.tenantId,
      roleId: user.Role_ID,
      roleName: role?.Role_Name || null,
      username: user.Username,
      fullName: user.Full_Name,
      loginType: 'staff-pin',
      permissions: {},
    }, process.env.JWT_SECRET, { expiresIn: '12h' });

    return sendSuccess(res, {
      token,
      user: { userId: user.User_ID, fullName: user.Full_Name, username: user.Username, roleName: role?.Role_Name || null },
    }, `Signed in as ${user.Full_Name}.`);
  } catch (err) {
    console.error('Staff PIN login error:', err.message);
    return sendError(res, 500, 'PIN login failed.');
  }
});

module.exports = router;
