/**
 * Gold Rate Route — PER-TENANT
 * Every client has their own rates. No global/shared rates.
 */
const router = require('express').Router();
const { sendSuccess, sendError } = require('../utils/response');
const { authenticate } = require('../middleware/auth');
const db = require('../db/knex');
const dayjs = require('dayjs');

// ─── GET /api/gold-rate/live ───────────────────────────────────────────────────
// Returns TODAY's rate for the authenticated tenant.
// Falls back to yesterday if today not set yet.
router.get('/live', authenticate, async (req, res) => {
  const tenantId = req.user.tenantId;
  try {
    // Try today first, then most recent rate
    const rate = await db('tbl_tenant_rates')
      .where('Tenant_ID', tenantId)
      .orderBy('Rate_Date', 'desc')
      .first();

    if (rate) {
      return sendSuccess(res, {
        tenant_id: tenantId,
        rate_24k: parseFloat(rate.Rate_24K),
        rate_22k: parseFloat(rate.Rate_22K),
        rate_18k: parseFloat(rate.Rate_18K),
        rate_14k: parseFloat(rate.Rate_14K),
        rate_silver: parseFloat(rate.Rate_Silver_925),
        rate_platinum: parseFloat(rate.Rate_Platinum),
        rate_date: rate.Rate_Date,
        set_by: rate.Set_By,
        source: rate.Source,
        updated_at: rate.Created_Date,
      });
    }

    // No rate set yet — return defaults so app doesn't crash
    return sendSuccess(res, {
      tenant_id: tenantId,
      rate_24k: 6850, rate_22k: 6250, rate_18k: 4687,
      rate_14k: 3646, rate_silver: 82, rate_platinum: 3200,
      rate_date: dayjs().format('YYYY-MM-DD'),
      set_by: 'default', source: 'default',
      updated_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error('Gold rate error:', err);
    return sendError(res, 500, 'Failed to fetch gold rate.');
  }
});

// ─── POST /api/gold-rate/set ───────────────────────────────────────────────────
// Sets TODAY's rate for the tenant. Previously gated on nothing beyond
// plain login — any authenticated user, including one with zero real
// module permissions, could change the shop's live rate (it feeds every
// bill's calculation immediately, tenant-wide, via socket broadcast).
// Deliberately NOT locked to an admin-only permission or a real
// approval workflow — rate changes happen many times a day and are core
// to daily billing at a real counter; over-restricting who can set it
// could break real staff who currently rely on doing this themselves.
// This closes only the actual gap: a user needs at least one real
// operational permission (billing, inventory, or accounts), not zero.
router.post('/set', authenticate, async (req, res) => {
  const tenantId = req.user.tenantId;
  const perms = req.user.permissions || {};
  if (!perms.sales && !perms.inventory && !perms.accounts && !perms.tenant_management) {
    return sendError(res, 403, 'You do not have permission to set the gold rate.');
  }
  const { rate_22k, rate_24k, rate_18k, rate_14k, rate_silver, rate_platinum } = req.body;

  if (!rate_22k) return sendError(res, 400, '22K rate is required.');

  const today = dayjs().format('YYYY-MM-DD');

  try {
    // Upsert today's rate
    const existing = await db('tbl_tenant_rates')
      .where({ Tenant_ID: tenantId, Rate_Date: today })
      .first();

    let savedRate;
    if (existing) {
      [savedRate] = await db('tbl_tenant_rates')
        .where({ Tenant_ID: tenantId, Rate_Date: today })
        .update({
          Rate_24K: rate_24k || (rate_22k * 1.0968).toFixed(2),
          Rate_22K: rate_22k,
          Rate_18K: rate_18k || (rate_22k * 0.75).toFixed(2),
          Rate_14K: rate_14k || (rate_22k * 0.5833).toFixed(2),
          Rate_Silver_925: rate_silver || 82,
          Rate_Silver_999: rate_silver ? (rate_silver * 1.08).toFixed(2) : 89,
          Rate_Platinum: rate_platinum || 3200,
          Set_By: req.user.username,
          Source: 'Manual',
        }).returning('*');
    } else {
      [savedRate] = await db('tbl_tenant_rates').insert({
        Tenant_ID: tenantId,
        Rate_Date: today,
        Rate_24K: rate_24k || (rate_22k * 1.0968).toFixed(2),
        Rate_22K: rate_22k,
        Rate_18K: rate_18k || (rate_22k * 0.75).toFixed(2),
        Rate_14K: rate_14k || (rate_22k * 0.5833).toFixed(2),
        Rate_Silver_925: rate_silver || 82,
        Rate_Silver_999: rate_silver ? (rate_silver * 1.08).toFixed(2) : 89,
        Rate_Platinum: rate_platinum || 3200,
        Set_By: req.user.username,
        Source: 'Manual',
      }).returning('*');
    }

    // Broadcast to all connected displays for this tenant
    const io = req.app.get('io');
    if (io) {
      io.of('/display').to(`tenant-${tenantId}`).emit('gold-rate-updated', {
        rate: parseFloat(rate_22k),
        rate_22k: parseFloat(rate_22k),
        rate_24k: parseFloat(savedRate.Rate_24K),
        rate_18k: parseFloat(savedRate.Rate_18K),
        rate_silver: parseFloat(savedRate.Rate_Silver_925),
        tenantId,
        updatedAt: new Date(),
      });
    }

    return sendSuccess(res, savedRate, `Gold rate set: 22K = ₹${rate_22k}/g`);
  } catch (err) {
    console.error('Set rate error:', err);
    return sendError(res, 500, 'Failed to set gold rate.');
  }
});

// ─── GET /api/gold-rate/history ───────────────────────────────────────────────
router.get('/history', authenticate, async (req, res) => {
  const tenantId = req.user.tenantId;
  try {
    const history = await db('tbl_tenant_rates')
      .where('Tenant_ID', tenantId)
      .orderBy('Rate_Date', 'desc')
      .limit(30);
    return sendSuccess(res, history);
  } catch (err) {
    return sendError(res, 500, 'Failed to fetch rate history.');
  }
});

// ─── GET /api/gold-rate/all-tenants (Super Admin only) ───────────────────────
router.get('/all-tenants', authenticate, async (req, res) => {
  if (req.user.roleName !== 'Super Admin') return sendError(res, 403, 'Super Admin only.');
  try {
    const rates = await db('tbl_tenant_rates as r')
      .join('tbl_tenant_master as t', 'r.Tenant_ID', 't.Tenant_ID')
      .where('r.Rate_Date', dayjs().format('YYYY-MM-DD'))
      .select('r.*', 't.Company_Name', 't.City');
    return sendSuccess(res, rates);
  } catch (err) {
    return sendError(res, 500, 'Failed.');
  }
});

module.exports = router;
