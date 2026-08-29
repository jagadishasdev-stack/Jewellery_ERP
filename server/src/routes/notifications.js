/**
 * Notifications — an in-app alert summary. Previously didn't exist at all
 * (the header's Bell icon was a dead placeholder — Badge count={0} always,
 * see MainLayout.jsx). This reuses data that already existed in each
 * module rather than building a new event/trigger system; every count
 * here reads real, already-queryable state.
 *
 * Not every category from the spec's Notifications list is covered —
 * only the ones with an honest, unambiguous "pending" signal already in
 * the schema:
 *   - pendingApprovalReceipt: approval vouchers not fully received
 *   - pendingBranchTransfer: interbranch transfers awaiting approval
 *   - repairReady: repairs finished, awaiting customer pickup
 *   - pendingCustomerOrder: Order Bin entries not yet delivered
 *   - insuranceExpiring: active policies expiring within 30 days
 *   - failedSync: sync log failures in the last 7 days
 * Deliberately NOT included: workshop-pending (no unambiguous "pending"
 * status on tbl_production_transaction beyond what's already visible on
 * the Manufacturing page itself), payment/scheme due and backup-failure
 * (no real signal to read yet — inventing one would just be a fake
 * number, not a notification).
 */
const router = require('express').Router();
const db = require('../db/tenantDb').tenantDb;
const { sendSuccess, sendError } = require('../utils/response');
const { authenticate } = require('../middleware/auth');
const dayjs = require('dayjs');

router.get('/summary', authenticate, async (req, res) => {
  const tenantId = req.user.tenantId;
  try {
    const [
      pendingApprovalReceipt,
      pendingBranchTransfer,
      repairReady,
      pendingCustomerOrder,
      insuranceExpiring,
      failedSync,
    ] = await Promise.all([
      db('tbl_approval_issue_header').where({ Tenant_ID: tenantId }).whereIn('Status', ['Pending', 'Partial']).count('Issue_ID as c').first(),
      db('tbl_stock_transfer').where({ Tenant_ID: tenantId, Status: 'Pending' }).count('Transfer_ID as c').first(),
      db('tbl_repair_orders').where({ Tenant_ID: tenantId, Status: 'Ready' }).count('Repair_ID as c').first(),
      db('tbl_bin_orders').where({ Tenant_ID: tenantId }).whereNotIn('Status', ['Delivered', 'Cancelled']).count('Order_ID as c').first(),
      db('tbl_customer_insurance').where({ Tenant_ID: tenantId, Status: 'Active' })
        .where('Expiry_Date', '<=', dayjs().add(30, 'day').format('YYYY-MM-DD')).count('Insurance_ID as c').first(),
      db('tbl_sync_log').where({ Tenant_ID: tenantId, Status: 'FAILED' })
        .where('Synced_Date', '>=', dayjs().subtract(7, 'day').toISOString()).count('Log_ID as c').first(),
    ]);

    const counts = {
      pendingApprovalReceipt: parseInt(pendingApprovalReceipt?.c || 0),
      pendingBranchTransfer: parseInt(pendingBranchTransfer?.c || 0),
      repairReady: parseInt(repairReady?.c || 0),
      pendingCustomerOrder: parseInt(pendingCustomerOrder?.c || 0),
      insuranceExpiring: parseInt(insuranceExpiring?.c || 0),
      failedSync: parseInt(failedSync?.c || 0),
    };
    const total = Object.values(counts).reduce((s, n) => s + n, 0);
    return sendSuccess(res, { counts, total });
  } catch (err) {
    console.error('Notifications summary error:', err.message);
    return sendError(res, 500, 'Failed to fetch notification summary.');
  }
});

module.exports = router;
