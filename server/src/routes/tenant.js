const router = require('express').Router();
const { body, validationResult } = require('express-validator');
const bcrypt = require('bcryptjs');
const db = require('../db/knex');
const { sendSuccess, sendError, sendValidationError } = require('../utils/response');
const { authenticate, requireSuperAdmin, requirePermission } = require('../middleware/auth');
const { STANDARD_ACCOUNTS } = require('../utils/standardChartOfAccounts');
const { resolveShortcuts } = require('../utils/shortcuts');

// ─── GET /api/tenant/branches ─────────────────────────────────────────────────
// includeInactive=true (Super Admin only) also returns deactivated branches,
// so the Manage Branches screen has a way to find and reactivate one —
// every other caller (branch selectors elsewhere in the app) keeps getting
// active-only results by default.
router.get('/branches', authenticate, async (req, res) => {
  try {
    const tenantId = req.user.roleName === 'Super Admin' && req.query.tenantId
      ? req.query.tenantId : req.user.tenantId;
    const includeInactive = req.user.roleName === 'Super Admin' && req.query.includeInactive === 'true';

    let query = db('tbl_branch_master').where({ Tenant_ID: tenantId });
    if (!includeInactive) query = query.andWhere({ Is_Active: true });

    const branches = await query.orderBy('Is_Head_Office', 'desc').orderBy('Branch_Name');

    return sendSuccess(res, branches);
  } catch (err) {
    return sendError(res, 500, 'Failed to fetch branches.');
  }
});

// ─── POST /api/tenant/branches — Super Admin creates a branch for a tenant ────
router.post('/branches', authenticate, requireSuperAdmin, [
  body('tenantId').trim().notEmpty().withMessage('Tenant ID required'),
  body('branchName').trim().notEmpty().withMessage('Branch name required'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return sendValidationError(res, errors.array());

  const { tenantId, branchName, branchCode, address1, address2, city, state, pincode, phone, email, gstNo } = req.body;

  try {
    const tenant = await db('tbl_tenant_master').where({ Tenant_ID: tenantId }).first();
    if (!tenant) return sendError(res, 404, 'Tenant not found.');

    const [{ c }] = await db('tbl_branch_master').where({ Tenant_ID: tenantId }).count('Branch_ID as c');
    const seq = String(parseInt(c) + 1).padStart(3, '0');

    const [branch] = await db('tbl_branch_master').insert({
      Branch_ID: `${tenantId}_${seq}`,
      Tenant_ID: tenantId,
      Branch_Name: branchName,
      Branch_Code: branchCode || seq,
      Address_Line1: address1 || null,
      Address_Line2: address2 || null,
      City: city || tenant.City,
      State: state || null,
      Pincode: pincode || null,
      Phone: phone || null,
      Email: email || null,
      GST_No: gstNo || null,
      Is_Head_Office: false,
      Is_Active: true,
    }).returning('*');

    return sendSuccess(res, branch, 'Branch created successfully.', 201);
  } catch (err) {
    console.error('Create branch error:', err.message);
    return sendError(res, 500, 'Failed to create branch.');
  }
});

// ─── PUT /api/tenant/branches/:id — Super Admin edits/deactivates a branch ────
router.put('/branches/:id', authenticate, requireSuperAdmin, async (req, res) => {
  const { branchName, branchCode, address1, address2, city, state, pincode, phone, email, gstNo, isActive } = req.body;

  try {
    const branch = await db('tbl_branch_master').where({ Branch_ID: req.params.id }).first();
    if (!branch) return sendError(res, 404, 'Branch not found.');

    if (isActive === false && branch.Is_Head_Office) {
      return sendError(res, 400, 'Cannot deactivate the Head Office branch. Set a different branch as Head Office first.');
    }

    const updates = { Modified_Date: new Date() };
    if (branchName !== undefined) updates.Branch_Name = branchName;
    if (branchCode !== undefined) updates.Branch_Code = branchCode;
    if (address1 !== undefined) updates.Address_Line1 = address1;
    if (address2 !== undefined) updates.Address_Line2 = address2;
    if (city !== undefined) updates.City = city;
    if (state !== undefined) updates.State = state;
    if (pincode !== undefined) updates.Pincode = pincode;
    if (phone !== undefined) updates.Phone = phone;
    if (email !== undefined) updates.Email = email;
    if (gstNo !== undefined) updates.GST_No = gstNo;
    if (isActive !== undefined) updates.Is_Active = isActive;

    const [updated] = await db('tbl_branch_master').where({ Branch_ID: req.params.id }).update(updates).returning('*');
    return sendSuccess(res, updated, 'Branch updated successfully.');
  } catch (err) {
    console.error('Update branch error:', err.message);
    return sendError(res, 500, 'Failed to update branch.');
  }
});

// ─── GET /api/tenant/stats ────────────────────────────────────────────────────
router.get('/stats', authenticate, async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const [ornamentsCount] = await db('tbl_ornament_master').where({ Tenant_ID: tenantId, Is_Active: true, Is_Sold: false }).count('Ornament_ID as c');
    const [customersCount] = await db('tbl_customer_master').where({ Tenant_ID: tenantId, Is_Active: true }).count('Customer_ID as c');
    const [salesCount] = await db('tbl_sales_header').where({ Tenant_ID: tenantId }).count('Sale_ID as c');
    const [salesAmount] = await db('tbl_sales_header').where({ Tenant_ID: tenantId }).whereNot('Payment_Status', 'Cancelled').sum('Net_Payable_Amount as total');
    const [karigarPending] = await db('tbl_issue_to_karigar').where({ Tenant_ID: tenantId, Status: 'Issued' }).count('Issue_ID as c');

    return sendSuccess(res, {
      activeStock: parseInt(ornamentsCount.c),
      totalCustomers: parseInt(customersCount.c),
      totalSales: parseInt(salesCount.c),
      totalRevenue: parseFloat(salesAmount.total) || 0,
      pendingKarigar: parseInt(karigarPending.c),
    });
  } catch (err) {
    return sendError(res, 500, 'Failed to fetch stats.');
  }
});

// ─── GET /api/tenant/settings ──────────────────────────────────────────────────
// PUT /settings has existed the whole time — nothing in the client ever
// called it (found via audit: no page fetches or edits GST_No, address, or
// Loyalty_Point_Value anywhere). This is the read half it needed.
router.get('/settings', authenticate, async (req, res) => {
  try {
    const tenant = await db('tbl_tenant_master')
      .where({ Tenant_ID: req.user.tenantId })
      .select('Company_Name', 'Brand_Code', 'Address_Line1', 'Address_Line2', 'City', 'State', 'Pincode',
        'Phone', 'Email', 'GST_No', 'PAN_No', 'Business_Type', 'Loyalty_Point_Value',
        'Monthly_Sales_Target', 'Monthly_Collection_Target', 'TDS_Percentage')
      .first();
    if (!tenant) return sendError(res, 404, 'Tenant not found.');
    return sendSuccess(res, tenant);
  } catch (err) {
    return sendError(res, 500, 'Failed to fetch settings.');
  }
});

// ─── PUT /api/tenant/settings ─────────────────────────────────────────────────
router.put('/settings', authenticate, requirePermission('tenant_management'), async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    // Prevent modification of license fields
    const { License_Key, License_Expiry_Date, Is_Active, Max_Users, Max_Branches, ...safeFields } = req.body;

    const [tenant] = await db('tbl_tenant_master')
      .where({ Tenant_ID: tenantId })
      .update({ ...safeFields, Modified_Date: new Date() })
      .returning('*');

    return sendSuccess(res, tenant, 'Settings updated.');
  } catch (err) {
    return sendError(res, 500, 'Failed to update settings.');
  }
});

// ─── Super Admin: GET all tenants ─────────────────────────────────────────────
router.get('/all', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const tenants = await db('tbl_tenant_master').orderBy('Company_Name');
    return sendSuccess(res, tenants);
  } catch (err) {
    return sendError(res, 500, 'Failed to fetch tenants.');
  }
});

// The platform owner's own standard default admin credential, handed to
// every newly onboarded tenant before they set their own — deliberately
// exempted from the 8-character minimum below (7 chars) since it's a
// single fixed, known value the owner chose on purpose, not something a
// stranger could brute-force-guess their way into via the general rule.
// Typing anything else still requires the full 8+ characters.
const PLATFORM_DEFAULT_ADMIN_PASSWORD = 'Jsphere';

// ─── Super Admin: Create tenant ───────────────────────────────────────────────
router.post('/create', authenticate, requireSuperAdmin, [
  body('Tenant_ID').trim().notEmpty().withMessage('Tenant ID required'),
  body('Company_Name').trim().notEmpty().withMessage('Company name required'),
  body('Brand_Code').trim().notEmpty().withMessage('Brand code required'),
  body('License_Key').trim().notEmpty().withMessage('License key required'),
  body('License_Expiry_Date').isISO8601().withMessage('Valid expiry date required'),
  body('adminUsername').trim().notEmpty().withMessage('Admin username required'),
  body('adminPassword').custom((v) => v === PLATFORM_DEFAULT_ADMIN_PASSWORD || (typeof v === 'string' && v.length >= 8))
    .withMessage('Password must be at least 8 characters.'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return sendValidationError(res, errors.array());

  const trx = await db.transaction();
  try {
    const { adminUsername, adminPassword, ...tenantData } = req.body;

    // Create tenant
    await trx('tbl_tenant_master').insert({
      ...tenantData,
      Is_Active: true,
      Created_By: req.user.username,
    });

    // Create head office branch
    await trx('tbl_branch_master').insert({
      Branch_ID: `${tenantData.Tenant_ID}_001`,
      Tenant_ID: tenantData.Tenant_ID,
      Branch_Name: 'Main Branch',
      Branch_Code: '001',
      Is_Head_Office: true,
      City: tenantData.City || 'Bangalore',
    });

    // Create admin user
    const salt = await bcrypt.genSalt(12);
    const hash = await bcrypt.hash(adminPassword, salt);
    const adminRole = await trx('tbl_role_master').where({ Role_Name: 'Client Admin' }).first();

    await trx('tbl_user_master').insert({
      Tenant_ID: tenantData.Tenant_ID,
      Username: adminUsername,
      Password_Hash: hash,
      Password_Salt: salt,
      // Default_Password intentionally not written — see auth.js's note near
      // its own Default_Password write for why storing plaintext passwords
      // was stopped (flagged as a real security exposure; old rows are left
      // as-is, this just stops the column from growing further).
      Role_ID: adminRole.Role_ID,
      Full_Name: `${tenantData.Company_Name} Admin`,
      Is_Active: true,
      Is_Admin: true,
      // Multi-Branch Management — this IS the tenant's own owner/admin
      // account, created with the single Main Branch above; defaults to
      // seeing every branch (can still be narrowed later per-user, same as
      // any other Client Admin — see utils/branchAccess.js).
      All_Branch_Access: true,
      Created_By: req.user.username,
    });

    // Create default display settings
    await trx('tbl_customer_display_settings').insert({
      Tenant_ID: tenantData.Tenant_ID,
      Header_Message: `Welcome to ${tenantData.Company_Name}`,
      Footer_Message: '100% BIS Hallmarked Gold',
      Created_By: req.user.username,
    });

    // Standard Chart of Accounts — same list every existing tenant was
    // backfilled with (see the seed migration + utils/standardChartOfAccounts.js).
    // Without this, a brand-new tenant's first sale would still work (the
    // posting engine auto-creates any account it doesn't find), but only
    // the handful of accounts actually used would ever exist, with
    // auto-generated codes instead of the real, complete standard set.
    await trx('tbl_chart_of_accounts').insert(
      STANDARD_ACCOUNTS.map((a) => ({
        Tenant_ID: tenantData.Tenant_ID,
        Account_Code: a.code,
        Account_Name: a.name,
        Account_Group: a.group,
        Account_Sub_Group: a.sub,
        Is_System: true,
      }))
    );

    // Copy global invoice templates — serialize JSON columns explicitly
    const globalTemplates = await trx('tbl_invoice_template_master').whereNull('Tenant_ID');
    if (globalTemplates.length > 0) {
      const JSON_COLS = ['Field_Visibility', 'Field_Order', 'Field_Labels', 'Slideshow_Image_URLs'];
      // Sync_UUID must be stripped too — leaving it in copies the GLOBAL
      // template's own UUID onto every cloned tenant row, which collides
      // with the unique constraint the moment more than one tenant is ever
      // created (found by actually testing tenant creation end-to-end;
      // every clone was reusing the same UUID as the row it was copied
      // from instead of getting its own fresh one from the column's
      // gen_random_uuid() default).
      const tenantTemplates = globalTemplates.map(({ Template_ID, Tenant_ID, Sync_UUID, Created_Date, Last_Updated_Date, Last_Updated_By, ...tmpl }) => {
        // Ensure JSONB columns are passed as JSON strings, not plain objects
        const row = { ...tmpl };
        JSON_COLS.forEach(col => {
          if (row[col] !== null && row[col] !== undefined && typeof row[col] === 'object') {
            row[col] = JSON.stringify(row[col]);
          }
        });
        row.Tenant_ID = tenantData.Tenant_ID;
        row.Created_By = req.user.username;
        return row;
      });
      await trx('tbl_invoice_template_master').insert(tenantTemplates);
    }

    await trx.commit();

    // ── Auto-provision modules based on business type (non-blocking) ─────────
    const businessType = tenantData.Business_Type || 'HYBRID';
    const btColMap = { RETAILER: 'Default_Retailer', WHOLESALER: 'Default_Wholesaler', MANUFACTURER: 'Default_Manufacturer', HYBRID: 'Default_Hybrid' };
    const btCol = btColMap[businessType] || 'Default_Hybrid';
    const allModules = await db('tbl_erp_modules');
    if (allModules.length > 0) {
      const moduleRows = allModules.map(m => ({
        Tenant_ID: tenantData.Tenant_ID,
        Module_Key: m.Module_Key,
        Is_Enabled: m.Is_Core ? true : !!m[btCol],
        Enabled_By: req.user.username,
      }));
      await db('tbl_tenant_modules').insert(moduleRows).onConflict(['Tenant_ID','Module_Key']).ignore();
    }

    return sendSuccess(res, { tenantId: tenantData.Tenant_ID }, 'Tenant created successfully.', 201);
  } catch (err) {
    await trx.rollback();
    console.error('Tenant create error:', err.message);
    console.error('Tenant create code:', err.code);
    console.error('Tenant create detail:', err.detail);
    if (err.code === '23505') return sendError(res, 409, 'Tenant ID or License Key already exists.');
    return sendError(res, 500, `Failed to create tenant: ${err.message}`);
  }
});

// ─── GET /api/tenant/display-settings ────────────────────────────────────────
router.get('/display-settings', authenticate, async (req, res) => {
  const { type, id } = req.query;
  if (!type || !id) return sendError(res, 400, 'type and id required.');
  try {
    const row = await db('tbl_display_settings')
      .where({ Tenant_ID: req.user.tenantId, Setting_Type: type, Reference_ID: String(id) })
      .first();
    return sendSuccess(res, { matrix: row?.Matrix_JSON ? JSON.parse(row.Matrix_JSON) : null });
  } catch (err) {
    // Table may not exist yet — return empty
    return sendSuccess(res, { matrix: null });
  }
});

// ─── POST /api/tenant/display-settings ───────────────────────────────────────
router.post('/display-settings', authenticate, async (req, res) => {
  const { type, id, matrix } = req.body;
  if (!type || !id || !matrix) return sendError(res, 400, 'type, id, and matrix required.');
  try {
    const existing = await db('tbl_display_settings')
      .where({ Tenant_ID: req.user.tenantId, Setting_Type: type, Reference_ID: String(id) })
      .first();

    if (existing) {
      await db('tbl_display_settings')
        .where({ Setting_ID: existing.Setting_ID })
        .update({ Matrix_JSON: JSON.stringify(matrix), Updated_By: req.user.username, Updated_Date: new Date() });
    } else {
      await db('tbl_display_settings').insert({
        Tenant_ID: req.user.tenantId,
        Setting_Type: type,
        Reference_ID: String(id),
        Matrix_JSON: JSON.stringify(matrix),
        Created_By: req.user.username,
      });
    }

    const { auditLog } = require('../utils/auditLogger');
    await auditLog({
      tenantId: req.user.tenantId, userId: req.user.userId,
      tableName: 'tbl_display_settings', recordId: id,
      actionType: 'UPDATE',
      description: `Display settings updated for ${type} ID ${id} by ${req.user.username}`,
      req,
    });

    return sendSuccess(res, null, 'Display settings saved.');
  } catch (err) {
    console.error('Display settings save error:', err.message);
    return sendError(res, 500, 'Failed to save display settings.');
  }
});

// ─── Users management ─────────────────────────────────────────────────────────
router.get('/users', authenticate, async (req, res) => {
  try {
    const users = await db('tbl_user_master as u')
      .join('tbl_role_master as r', 'u.Role_ID', 'r.Role_ID')
      .where({ 'u.Tenant_ID': req.user.tenantId })
      .orderBy('u.Full_Name')
      .select(
        'u.User_ID', 'u.Username', 'u.Full_Name', 'u.Email', 'u.Mobile',
        'u.Is_Active', 'u.Is_Admin', 'u.Last_Login_Date', 'u.Created_Date',
        'u.Role_ID', 'u.Branch_ID', 'u.Employee_Code', 'u.Department',
        'u.Custom_Permissions', 'u.Login_Attempts', 'u.Locked_Until',
        'r.Role_Name', 'r.Permissions as Role_Permissions',
        // Never send the actual PIN_Hash to the client — just whether one's
        // set, same reasoning as passwords never being shown either.
        db.raw('("u"."PIN_Hash" IS NOT NULL) as "Has_Pin"'),
      );
    return sendSuccess(res, users);
  } catch (err) {
    return sendError(res, 500, 'Failed to fetch users.');
  }
});

router.post('/users', authenticate, requirePermission('tenant_management'), [
  body('Username').trim().notEmpty().withMessage('Username required'),
  body('Password').isLength({ min: 8 }).withMessage('Password min 8 chars'),
  body('Full_Name').trim().notEmpty().withMessage('Full name required'),
  body('Role_ID').isInt().withMessage('Role required'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return sendValidationError(res, errors.array());
  try {
    const { Password, Custom_Permissions, ...userData } = req.body;
    const salt = await bcrypt.genSalt(12);
    const hash = await bcrypt.hash(Password, salt);
    // Multi-Branch Management — a newly created Client Admin defaults to
    // seeing every branch (matches how the tenant's original admin account
    // is created above); any other role defaults to needing explicit
    // per-branch grants (routes/branches.js), unless the caller explicitly
    // set All_Branch_Access themselves. See utils/branchAccess.js.
    let allBranchAccess = req.body.All_Branch_Access;
    if (allBranchAccess === undefined) {
      const role = await db('tbl_role_master').where({ Role_ID: req.body.Role_ID }).first('Role_Name');
      allBranchAccess = role?.Role_Name === 'Client Admin';
    }
    const [user] = await db('tbl_user_master').insert({
      ...userData,
      Tenant_ID: req.user.tenantId,
      Password_Hash: hash,
      Password_Salt: salt,
      // Default_Password intentionally not written — see auth.js's note.
      All_Branch_Access: allBranchAccess,
      Custom_Permissions: Custom_Permissions ? JSON.stringify(Custom_Permissions) : null,
      Is_Active: req.body.Is_Active !== undefined ? req.body.Is_Active : true,
      Created_By: req.user.username,
    }).returning('User_ID, Username, Full_Name, Email, Is_Active'.split(', '));
    return sendSuccess(res, user, 'User created.', 201);
  } catch (err) {
    if (err.code === '23505') return sendError(res, 409, 'Username already exists.');
    console.error('User create error:', err.message);
    return sendError(res, 500, 'Failed to create user.');
  }
});

// ─── PUT /api/tenant/users/:id — Edit user ────────────────────────────────────
router.put('/users/:id', authenticate, requirePermission('tenant_management'), async (req, res) => {
  try {
    const { Password, PIN, Custom_Permissions, ...updateData } = req.body;
    // Prevent changing tenant
    delete updateData.Tenant_ID;

    // Guard: cannot change your own role, even with tenant_management —
    // otherwise a Client Admin editing their own account could silently
    // widen their own access (or a compromised admin session could
    // self-escalate further) with no second person ever reviewing it.
    if (parseInt(req.params.id) === req.user.userId && updateData.Role_ID !== undefined) {
      return sendError(res, 400, 'You cannot change your own role.');
    }

    // If password reset requested
    if (Password) {
      if (Password.length < 8) return sendError(res, 400, 'Password must be at least 8 characters.');
      const salt = await bcrypt.genSalt(12);
      updateData.Password_Hash = await bcrypt.hash(Password, salt);
      updateData.Password_Salt = salt;
      // Default_Password intentionally not written — see auth.js's note.
      updateData.Login_Attempts = 0;
      updateData.Locked_Until = null;
    }

    // Staff PIN — lets this person be identified on the Image App (a shared
    // device) without a full login. PIN: null/'' explicitly clears it
    // (revokes their ability to use the PIN login), a 4-6 digit string sets
    // a new one; omitted entirely leaves whatever's already there alone.
    if (PIN !== undefined) {
      if (PIN === null || PIN === '') {
        updateData.PIN_Hash = null;
        updateData.PIN_Set_Date = null;
      } else {
        if (!/^\d{4,6}$/.test(PIN)) return sendError(res, 400, 'PIN must be 4-6 digits.');
        const pinSalt = await bcrypt.genSalt(10);
        updateData.PIN_Hash = await bcrypt.hash(PIN, pinSalt);
        updateData.PIN_Set_Date = new Date();
      }
    }

    if (Custom_Permissions !== undefined) {
      updateData.Custom_Permissions = Custom_Permissions ? JSON.stringify(Custom_Permissions) : null;
    }

    // Guard: cannot deactivate yourself
    if (parseInt(req.params.id) === req.user.userId && updateData.Is_Active === false) {
      return sendError(res, 400, 'You cannot deactivate your own account.');
    }

    const [updated] = await db('tbl_user_master')
      .where({ User_ID: req.params.id, Tenant_ID: req.user.tenantId })
      .update({ ...updateData, Modified_Date: new Date() })
      .returning(['User_ID', 'Username', 'Full_Name', 'Email', 'Mobile', 'Is_Active', 'Role_ID']);

    if (!updated) return sendError(res, 404, 'User not found.');

    const { auditLog } = require('../utils/auditLogger');
    await auditLog({
      tenantId: req.user.tenantId, userId: req.user.userId,
      tableName: 'tbl_user_master', recordId: req.params.id,
      actionType: 'UPDATE',
      description: `User "${updated.Username}" updated by ${req.user.username}`,
      req,
    });

    return sendSuccess(res, updated, 'User updated.');
  } catch (err) {
    console.error('User update error:', err.message);
    return sendError(res, 500, 'Failed to update user.');
  }
});

// ─── DELETE /api/tenant/users/:id — Soft delete ───────────────────────────────
router.delete('/users/:id', authenticate, requirePermission('tenant_management'), async (req, res) => {
  try {
    const userId = parseInt(req.params.id);

    // Guard: cannot delete yourself
    if (userId === req.user.userId) return sendError(res, 400, 'You cannot delete your own account.');

    // Guard: cannot delete last Super Admin
    const target = await db('tbl_user_master as u')
      .join('tbl_role_master as r', 'u.Role_ID', 'r.Role_ID')
      .where('u.User_ID', userId)
      .select('u.Username', 'r.Role_Name')
      .first();

    if (!target) return sendError(res, 404, 'User not found.');

    if (target.Role_Name === 'Super Admin') {
      const [{ count }] = await db('tbl_user_master as u')
        .join('tbl_role_master as r', 'u.Role_ID', 'r.Role_ID')
        .where({ 'r.Role_Name': 'Super Admin', 'u.Is_Active': true })
        .count('u.User_ID as count');
      if (parseInt(count) <= 1) return sendError(res, 400, 'Cannot delete the last Super Admin.');
    }

    // Soft delete
    await db('tbl_user_master')
      .where({ User_ID: userId, Tenant_ID: req.user.tenantId })
      .update({ Is_Active: false, Modified_Date: new Date() });

    const { auditLog } = require('../utils/auditLogger');
    await auditLog({
      tenantId: req.user.tenantId, userId: req.user.userId,
      tableName: 'tbl_user_master', recordId: userId,
      actionType: 'DELETE',
      description: `User "${target.Username}" soft-deleted by ${req.user.username}`,
      req,
    });

    return sendSuccess(res, null, 'User deleted (deactivated).');
  } catch (err) {
    console.error('User delete error:', err.message);
    return sendError(res, 500, 'Failed to delete user.');
  }
});

// ─── POST /api/tenant/users/:id/unlock — Unlock account ──────────────────────
router.post('/users/:id/unlock', authenticate, requirePermission('tenant_management'), async (req, res) => {
  try {
    await db('tbl_user_master')
      .where({ User_ID: req.params.id, Tenant_ID: req.user.tenantId })
      .update({ Login_Attempts: 0, Locked_Until: null });
    return sendSuccess(res, null, 'Account unlocked.');
  } catch (err) {
    return sendError(res, 500, 'Failed to unlock account.');
  }
});

// ─── GET /api/tenant/roles ────────────────────────────────────────────────────
router.get('/roles', authenticate, async (req, res) => {
  try {
    const roles = await db('tbl_role_master').orderBy('Role_Name');
    return sendSuccess(res, roles);
  } catch (err) {
    return sendError(res, 500, 'Failed to fetch roles.');
  }
});

// ─── POST /api/tenant/roles ───────────────────────────────────────────────────
router.post('/roles', authenticate, requirePermission('tenant_management'), [
  body('Role_Name').trim().notEmpty().withMessage('Role name required'),
  body('Permissions').isObject().withMessage('Permissions must be an object'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return sendValidationError(res, errors.array());
  try {
    const [role] = await db('tbl_role_master').insert({
      Role_Name: req.body.Role_Name,
      Description: req.body.Description || null,
      Permissions: JSON.stringify(req.body.Permissions),
      Created_By: req.user.username,
    }).returning('*');
    return sendSuccess(res, role, 'Role created.', 201);
  } catch (err) {
    if (err.code === '23505') return sendError(res, 409, 'Role name already exists.');
    console.error('Role create error:', err.message);
    return sendError(res, 500, 'Failed to create role.');
  }
});

// ─── PUT /api/tenant/roles/:id ────────────────────────────────────────────────
router.put('/roles/:id', authenticate, requirePermission('tenant_management'), async (req, res) => {
  try {
    const existing = await db('tbl_role_master').where('Role_ID', req.params.id).first();
    if (!existing) return sendError(res, 404, 'Role not found.');
    if (existing.Role_Name === 'Super Admin') return sendError(res, 403, 'Super Admin role cannot be modified.');
    // Guard: cannot widen the permissions of your OWN role — otherwise a
    // Client Admin (who has tenant_management) could silently grant
    // themselves more access with no second person ever reviewing it.
    if (parseInt(req.params.id) === req.user.roleId && req.body.Permissions) {
      return sendError(res, 400, 'You cannot change your own role\'s permissions. Ask another admin.');
    }

    const updateData = {};
    if (req.body.Role_Name) updateData.Role_Name = req.body.Role_Name;
    if (req.body.Description !== undefined) updateData.Description = req.body.Description;
    if (req.body.Permissions) updateData.Permissions = JSON.stringify(req.body.Permissions);
    updateData.Modified_Date = new Date();

    const [updated] = await db('tbl_role_master')
      .where('Role_ID', req.params.id)
      .update(updateData)
      .returning('*');

    const { auditLog } = require('../utils/auditLogger');
    await auditLog({
      tenantId: req.user.tenantId, userId: req.user.userId,
      tableName: 'tbl_role_master', recordId: req.params.id,
      actionType: 'UPDATE',
      description: `Role "${updated.Role_Name}" permissions updated by ${req.user.username}`,
      oldData: { Permissions: existing.Permissions },
      newData: { Permissions: updateData.Permissions },
      req,
    });

    return sendSuccess(res, updated, 'Role updated.');
  } catch (err) {
    console.error('Role update error:', err.message);
    return sendError(res, 500, 'Failed to update role.');
  }
});

// ─── DELETE /api/tenant/roles/:id ─────────────────────────────────────────────
router.delete('/roles/:id', authenticate, requirePermission('tenant_management'), async (req, res) => {
  try {
    const role = await db('tbl_role_master').where('Role_ID', req.params.id).first();
    if (!role) return sendError(res, 404, 'Role not found.');
    if (['Super Admin', 'Client Admin'].includes(role.Role_Name)) {
      return sendError(res, 403, 'System roles cannot be deleted.');
    }
    const [{ count }] = await db('tbl_user_master').where('Role_ID', req.params.id).count('User_ID as count');
    if (parseInt(count) > 0) return sendError(res, 400, `Cannot delete role — ${count} user(s) are assigned to it.`);
    await db('tbl_role_master').where('Role_ID', req.params.id).del();
    return sendSuccess(res, null, 'Role deleted.');
  } catch (err) {
    return sendError(res, 500, 'Failed to delete role.');
  }
});

// ─── PUT /api/tenant/users/:id/permissions — User-wise custom permissions ─────
router.put('/users/:id/permissions', authenticate, requirePermission('tenant_management'), async (req, res) => {
  try {
    const { permissions } = req.body;
    if (parseInt(req.params.id) === req.user.userId) {
      return sendError(res, 400, 'You cannot change your own custom permissions.');
    }
    const [updated] = await db('tbl_user_master')
      .where({ User_ID: req.params.id, Tenant_ID: req.user.tenantId })
      .update({ Custom_Permissions: JSON.stringify(permissions), Modified_Date: new Date() })
      .returning(['User_ID', 'Username', 'Custom_Permissions']);
    if (!updated) return sendError(res, 404, 'User not found.');

    const { auditLog } = require('../utils/auditLogger');
    await auditLog({
      tenantId: req.user.tenantId, userId: req.user.userId,
      tableName: 'tbl_user_master', recordId: req.params.id,
      actionType: 'UPDATE',
      description: `Custom permissions updated for user "${updated.Username}" by ${req.user.username}`,
      req,
    });
    return sendSuccess(res, updated, 'Custom permissions saved.');
  } catch (err) {
    return sendError(res, 500, 'Failed to save permissions.');
  }
});

// ─── GET /api/tenant/ui-theme ──────────────────────────────────────────────────
// Public to any authenticated user of the tenant — every screen needs to read
// it to render correctly, not just admins.
router.get('/ui-theme', authenticate, async (req, res) => {
  try {
    const theme = await db('tbl_tenant_ui_theme').where({ Tenant_ID: req.user.tenantId }).first();
    return sendSuccess(res, theme || {
      Font_Family: 'Inter', Font_Weight: 400, Primary_Color: '#B8860B', Text_Case: 'none',
      Logo_URL: null, Logo_Size: 100,
    });
  } catch (err) {
    return sendError(res, 500, 'Failed to load theme settings.');
  }
});

// ─── PUT /api/tenant/ui-theme ──────────────────────────────────────────────────
// Admin-only — applies tenant-wide, for every user, not just the saver.
router.put('/ui-theme', authenticate, requirePermission('tenant_management'), [
  body('Font_Weight').optional().isInt({ min: 100, max: 900 }),
  body('Primary_Color').optional().matches(/^#[0-9A-Fa-f]{6}$/),
  body('Text_Case').optional().isIn(['none', 'uppercase', 'lowercase']),
  body('Logo_Size').optional().isInt({ min: 50, max: 200 }),
  body('Logo_URL').optional({ nullable: true }).isString(),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return sendValidationError(res, errors.array());

  const { Font_Family, Font_Weight, Primary_Color, Text_Case, Logo_URL, Logo_Size } = req.body;
  try {
    const tenantId = req.user.tenantId;
    const existing = await db('tbl_tenant_ui_theme').where({ Tenant_ID: tenantId }).first();
    const payload = {
      Font_Family: Font_Family || 'Inter',
      Font_Weight: Font_Weight || 400,
      Primary_Color: Primary_Color || '#B8860B',
      Text_Case: Text_Case || 'none',
      Logo_URL: Logo_URL || null,
      Logo_Size: Logo_Size || 100,
      Updated_By: req.user.username,
      Updated_Date: new Date(),
    };
    let row;
    if (existing) {
      [row] = await db('tbl_tenant_ui_theme').where({ Tenant_ID: tenantId }).update(payload).returning('*');
    } else {
      [row] = await db('tbl_tenant_ui_theme').insert({ Tenant_ID: tenantId, ...payload }).returning('*');
    }
    return sendSuccess(res, row, 'Theme updated for the whole tenant.');
  } catch (err) {
    return sendError(res, 500, 'Failed to save theme settings.');
  }
});

// ─── GET /api/tenant/shortcuts ─────────────────────────────────────────────────
// Every user of a tenant reads the SAME resolved map — shortcuts are set
// tenant-wide (see superAdmin.js's PUT for how they're changed), not
// per-user. Merges defaults with whatever this tenant has overridden, so
// the frontend never needs to know the defaults itself.
router.get('/shortcuts', authenticate, async (req, res) => {
  try {
    const row = await db('tbl_tenant_shortcuts').where({ Tenant_ID: req.user.tenantId }).first();
    return sendSuccess(res, resolveShortcuts(row?.Shortcuts));
  } catch (err) {
    return sendError(res, 500, 'Failed to load shortcuts.');
  }
});

module.exports = router;
