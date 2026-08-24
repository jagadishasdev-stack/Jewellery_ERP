const router = require('express').Router();
const db = require('../db/tenantDb').tenantDb;
const { sendSuccess, sendError } = require('../utils/response');
const { authenticate } = require('../middleware/auth');

// ─── GET /api/display/settings ────────────────────────────────────────────────
router.get('/settings', authenticate, async (req, res) => {
  try {
    let settings = await db('tbl_customer_display_settings')
      .where({ Tenant_ID: req.user.tenantId })
      .first();

    if (!settings) {
      // Return defaults
      settings = {
        Tenant_ID: req.user.tenantId,
        Display_Logo: true,
        Show_Gold_Rate_Live: true,
        Show_Customer_Name: true,
        Show_Cost_Price: false,
        Show_Making_Charge_Individual: true,
        Show_Discount_Line: true,
        Show_QR_Code: true,
        Show_UPI_QR: true,
        Background_Color: '#1A1A1A',
        Text_Color: '#FFFFFF',
        Accent_Color: '#FFD700',
        Font_Scale_Factor: 1.00,
        Header_Message: 'Welcome to Our Jewellery Store',
        Footer_Message: '100% BIS Hallmarked Gold',
        Auto_Clear_After_Seconds: 10,
        Show_Slideshow_When_Idle: true,
        Is_Keyboard_Blocked: true,
        Is_Mouse_Blocked: true,
        Is_Fullscreen: true,
      };
    }

    // Never expose cost price setting to non-admins
    if (!['Super Admin', 'Client Admin'].includes(req.user.roleName)) {
      settings.Show_Cost_Price = false;
    }

    return sendSuccess(res, settings);
  } catch (err) {
    return sendError(res, 500, 'Failed to fetch display settings.');
  }
});

// ─── PUT /api/display/settings ────────────────────────────────────────────────
router.put('/settings', authenticate, async (req, res) => {
  try {
    const tenantId = req.user.tenantId;

    // Force cost price to false for security
    req.body.Show_Cost_Price = false;

    const existing = await db('tbl_customer_display_settings').where({ Tenant_ID: tenantId }).first();

    let settings;
    if (existing) {
      [settings] = await db('tbl_customer_display_settings')
        .where({ Tenant_ID: tenantId })
        .update({ ...req.body, Last_Updated_By: req.user.username, Last_Updated_Date: new Date() })
        .returning('*');
    } else {
      [settings] = await db('tbl_customer_display_settings')
        .insert({ ...req.body, Tenant_ID: tenantId, Created_By: req.user.username })
        .returning('*');
    }

    return sendSuccess(res, settings, 'Display settings updated.');
  } catch (err) {
    return sendError(res, 500, 'Failed to update display settings.');
  }
});

// ─── GET /api/display/current-state ──────────────────────────────────────────
// Returns current cart state for the customer display screen
router.get('/current-state', authenticate, async (req, res) => {
  try {
    const session = await db('tbl_session_master')
      .where({ User_ID: req.user.userId, Is_Active: true })
      .orderBy('Session_Start', 'desc')
      .first();

    if (!session || !session.Current_Active_Cart_ID) {
      return sendSuccess(res, { hasActiveCart: false, items: [], total: 0 });
    }

    return sendSuccess(res, { hasActiveCart: true, sessionId: session.Session_ID });
  } catch (err) {
    return sendError(res, 500, 'Failed to fetch current state.');
  }
});

module.exports = router;
