/**
 * Approval Issue / Approval Receive Management Module.
 *
 * Tagged items (real ornaments) are tracked per-unit — each issued ornament
 * gets its own tbl_approval_issue_items row with an Item_Status
 * (Pending/Received/Cancelled), because the required UX is "tick individual
 * items on a checklist and receive the selected subset," not a running
 * weight/amount balance like Karigar Issue/Return.
 *
 * Non-tagged items (manually described, never in inventory) mirror the same
 * shape in a parallel set of tables, since they carry different item fields
 * but the same header/party/voucher/status lifecycle.
 */
const router = require('express').Router();
const { body, validationResult } = require('express-validator');
const db = require('../db/tenantDb').tenantDb;
const { sendSuccess, sendError, sendValidationError } = require('../utils/response');
const { authenticate, requirePermission } = require('../middleware/auth');
const {
  generateApprovalIssueNumber, generateApprovalReceiveNumber,
  generateNonTagIssueNumber, generateNonTagReceiveNumber,
} = require('../utils/invoiceNumber');
const { auditLog } = require('../utils/auditLogger');
const { modeVal, applyStockVisibility } = require('../utils/dataModeFilter');

// ── Recompute a tagged issue voucher's Status from its line items ────────────
async function recomputeIssueStatus(trx, issueId) {
  const [{ total, pending }] = await trx('tbl_approval_issue_items')
    .where({ Issue_ID: issueId })
    .select(
      trx.raw('count(*) as total'),
      trx.raw(`count(*) filter (where "Item_Status" = 'Pending') as pending`)
    );
  const totalNum = parseInt(total, 10);
  const pendingNum = parseInt(pending, 10);
  const status = pendingNum === 0 ? 'Completed' : (pendingNum < totalNum ? 'Partial' : 'Pending');
  await trx('tbl_approval_issue_header').where({ Issue_ID: issueId }).update({ Status: status, Modified_Date: new Date() });
  return status;
}

async function recomputeNonTagIssueStatus(trx, ntaIssueId) {
  const [{ total, pending }] = await trx('tbl_non_tag_issue_items')
    .where({ NTA_Issue_ID: ntaIssueId })
    .select(
      trx.raw('count(*) as total'),
      trx.raw(`count(*) filter (where "Item_Status" = 'Pending') as pending`)
    );
  const totalNum = parseInt(total, 10);
  const pendingNum = parseInt(pending, 10);
  const status = pendingNum === 0 ? 'Completed' : (pendingNum < totalNum ? 'Partial' : 'Pending');
  await trx('tbl_non_tag_issue_header').where({ NTA_Issue_ID: ntaIssueId }).update({ Status: status, Modified_Date: new Date() });
  return status;
}

// ═══════════════════════════════ Parties ═════════════════════════════════════

router.get('/parties', authenticate, async (req, res) => {
  const { search } = req.query;
  try {
    let qb = db('tbl_approval_party_master').where('Tenant_ID', req.user.tenantId).where('Is_Active', true);
    if (search) {
      qb = qb.where(function () {
        this.where('Party_Name', 'ilike', `%${search}%`)
          .orWhere('Shop_Name', 'ilike', `%${search}%`)
          .orWhere('Mobile', 'like', `%${search}%`);
      });
    }
    const parties = await qb.orderBy('Party_Name');
    return sendSuccess(res, parties);
  } catch (err) { return sendError(res, 500, 'Failed to fetch parties.'); }
});

router.post('/parties', authenticate, requirePermission('approval_management'), [
  body('Party_Name').notEmpty().withMessage('Party name required'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return sendValidationError(res, errors.array());
  try {
    const { Party_Name, Shop_Name, Contact_Person, Mobile, Alt_Mobile, GST_Number, Address, City, Remarks } = req.body;
    const [party] = await db('tbl_approval_party_master').insert({
      Tenant_ID: req.user.tenantId, Party_Name, Shop_Name, Contact_Person,
      Mobile: Mobile || null, Alt_Mobile: Alt_Mobile || null, GST_Number: GST_Number || null,
      Address: Address || null, City: City || null, Remarks: Remarks || null,
      Created_By: req.user.username,
    }).returning('*');
    await auditLog({
      tenantId: req.user.tenantId, userId: req.user.userId, tableName: 'tbl_approval_party_master',
      recordId: party.Party_ID, actionType: 'INSERT', description: `Approval party "${Party_Name}" created`, req,
    });
    return sendSuccess(res, party, 'Party created.', 201);
  } catch (err) {
    if (err.code === '23505') return sendError(res, 400, 'A party with this mobile number already exists.');
    return sendError(res, 500, 'Failed to create party.');
  }
});

router.get('/parties/:id', authenticate, async (req, res) => {
  try {
    const party = await db('tbl_approval_party_master').where({ Party_ID: req.params.id, Tenant_ID: req.user.tenantId }).first();
    if (!party) return sendError(res, 404, 'Party not found.');
    const issues = await db('tbl_approval_issue_header').where({ Party_ID: req.params.id }).orderBy('Issue_Date', 'desc');
    const ntaIssues = await db('tbl_non_tag_issue_header').where({ Party_ID: req.params.id }).orderBy('Issue_Date', 'desc');
    return sendSuccess(res, { party, issues, ntaIssues });
  } catch (err) { return sendError(res, 500, 'Failed to fetch party.'); }
});

// ═══════════════════════════════ Tagged: Ornament Picker ═════════════════════

router.get('/ornaments/search', authenticate, async (req, res) => {
  const { q } = req.query;
  if (!q || !q.trim()) return sendSuccess(res, []);
  try {
    let qb = db('tbl_ornament_master as o')
      .leftJoin('tbl_item_type_master as t', 'o.Type_ID', 't.Type_ID')
      .leftJoin('tbl_design_master as d', 'o.Design_ID', 'd.Design_ID')
      .leftJoin('tbl_purity_master as p', 'o.Purity_ID', 'p.Purity_ID')
      .where('o.Tenant_ID', req.user.tenantId)
      .where('o.Is_Active', true)
      .where('o.Is_Sold', false)
      .where('o.Is_Stock_Available', true)
      .where(function () {
        this.where('o.Article_Number', 'ilike', `%${q}%`)
          .orWhere('t.Type_Name', 'ilike', `%${q}%`)
          .orWhere('d.Design_Name', 'ilike', `%${q}%`);
      })
      .select('o.Ornament_ID', 'o.Article_Number', 'o.Gross_Weight', 'o.Net_Gold_Weight', 'o.Total_Price',
        'o.Product_Image_URL', 't.Type_Name', 'd.Design_Name', 'p.Purity_Code')
      .limit(20);
    qb = applyStockVisibility(qb, req, 'o');
    const items = await qb;
    return sendSuccess(res, items);
  } catch (err) { return sendError(res, 500, 'Ornament search failed.'); }
});

// ═══════════════════════════════ Tagged: Issue ═══════════════════════════════

router.post('/issue', authenticate, requirePermission('approval_management'), [
  body('Issue_Date').notEmpty().withMessage('Issue date required'),
  body('items').isArray({ min: 1 }).withMessage('At least one item required'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return sendValidationError(res, errors.array());

  const tenantId = req.user.tenantId;
  const dm = modeVal(req);
  const { Party_ID, Issue_Date, Expected_Return_Date, Remarks, items } = req.body;

  const trx = await db.transaction();
  try {
    const ornamentIds = items.map(i => i.Ornament_ID);
    const ornaments = await trx('tbl_ornament_master')
      .where('Tenant_ID', tenantId).whereIn('Ornament_ID', ornamentIds).forUpdate();

    if (ornaments.length !== ornamentIds.length) {
      await trx.rollback();
      return sendError(res, 404, 'One or more selected items were not found.');
    }
    const notAvailable = ornaments.find(o => o.Is_Sold || !o.Is_Stock_Available || o.Is_On_Approval);
    if (notAvailable) {
      await trx.rollback();
      return sendError(res, 400, `${notAvailable.Article_Number} is not currently available to issue on approval.`);
    }

    const purityRows = await trx('tbl_purity_master').whereIn('Purity_ID', ornaments.map(o => o.Purity_ID).filter(Boolean));
    const purityMap = {};
    purityRows.forEach(p => { purityMap[p.Purity_ID] = p.Purity_Code; });

    const voucherNumber = await generateApprovalIssueNumber(tenantId);
    const totalWeight = ornaments.reduce((s, o) => s + parseFloat(o.Gross_Weight || 0), 0);
    const totalValue = ornaments.reduce((s, o) => s + parseFloat(o.Total_Price || 0), 0);

    const [issue] = await trx('tbl_approval_issue_header').insert({
      Tenant_ID: tenantId, Branch_ID: req.body.Branch_ID || null, Voucher_Number: voucherNumber,
      Party_ID: Party_ID || null, Issue_Date, Expected_Return_Date: Expected_Return_Date || null,
      Total_Items_Issued: ornaments.length, Total_Weight_Issued: totalWeight, Total_Value_Issued: totalValue,
      Status: 'Pending', Remarks: Remarks || null, Data_Mode: dm, Created_By: req.user.username,
    }).returning('*');

    const itemRows = ornaments.map(o => ({
      Issue_ID: issue.Issue_ID, Tenant_ID: tenantId, Ornament_ID: o.Ornament_ID,
      Article_Number: o.Article_Number, Gross_Weight: o.Gross_Weight, Net_Gold_Weight: o.Net_Gold_Weight,
      Purity_Code: purityMap[o.Purity_ID] || null, Approx_Value: o.Total_Price,
      Item_Status: 'Pending', Created_By: req.user.username,
    }));
    await trx('tbl_approval_issue_items').insert(itemRows);

    await trx('tbl_ornament_master').whereIn('Ornament_ID', ornamentIds).update({
      Is_On_Approval: true, Is_Stock_Available: false,
      Approval_Issue_ID: issue.Issue_ID, Approval_Out_By: req.user.username, Approval_Out_Date: new Date(),
    });

    await trx.commit();

    await auditLog({
      tenantId, userId: req.user.userId, tableName: 'tbl_approval_issue_header', recordId: issue.Issue_ID,
      actionType: 'INSERT', description: `Approval issue ${voucherNumber}: ${ornaments.length} item(s), ₹${totalValue.toFixed(2)}`, req,
    });

    return sendSuccess(res, { ...issue, items: itemRows }, 'Approval issue created.', 201);
  } catch (err) {
    await trx.rollback();
    console.error('Approval issue error:', err);
    return sendError(res, 500, `Failed to create approval issue: ${err.message}`);
  }
});

router.get('/issue/:id', authenticate, async (req, res) => {
  try {
    const issue = await db('tbl_approval_issue_header as h')
      .leftJoin('tbl_approval_party_master as p', 'h.Party_ID', 'p.Party_ID')
      .where({ 'h.Issue_ID': req.params.id, 'h.Tenant_ID': req.user.tenantId })
      .select('h.*', 'p.Party_Name', 'p.Shop_Name', 'p.Mobile as Party_Mobile')
      .first();
    if (!issue) return sendError(res, 404, 'Approval issue not found.');
    const items = await db('tbl_approval_issue_items').where({ Issue_ID: req.params.id }).orderBy('Issue_Item_ID');
    return sendSuccess(res, { issue, items });
  } catch (err) { return sendError(res, 500, 'Failed to fetch approval issue.'); }
});

router.get('/issues', authenticate, async (req, res) => {
  const { status, partyId, fromDate, toDate, page = 1, limit = 50 } = req.query;
  try {
    let qb = db('tbl_approval_issue_header as h')
      .leftJoin('tbl_approval_party_master as p', 'h.Party_ID', 'p.Party_ID')
      .where('h.Tenant_ID', req.user.tenantId).where('h.Data_Mode', modeVal(req));
    if (status) qb = qb.where('h.Status', status);
    if (partyId) qb = qb.where('h.Party_ID', partyId);
    if (fromDate) qb = qb.where('h.Issue_Date', '>=', fromDate);
    if (toDate) qb = qb.where('h.Issue_Date', '<=', toDate);
    const [{ count }] = await qb.clone().count('h.Issue_ID as count');
    const data = await qb.clone().select('h.*', 'p.Party_Name', 'p.Shop_Name', 'p.Mobile as Party_Mobile')
      .orderBy('h.Issue_Date', 'desc').limit(parseInt(limit)).offset((parseInt(page) - 1) * parseInt(limit));
    return sendSuccess(res, { items: data, total: parseInt(count) });
  } catch (err) { return sendError(res, 500, 'Failed to fetch approval issues.'); }
});

router.post('/issue/:id/cancel', authenticate, requirePermission('approval_management'), async (req, res) => {
  const trx = await db.transaction();
  try {
    const issue = await trx('tbl_approval_issue_header').where({ Issue_ID: req.params.id, Tenant_ID: req.user.tenantId }).forUpdate().first();
    if (!issue) { await trx.rollback(); return sendError(res, 404, 'Approval issue not found.'); }
    if (issue.Status !== 'Pending') {
      await trx.rollback();
      return sendError(res, 400, 'Only a voucher with nothing yet received can be cancelled.');
    }

    const items = await trx('tbl_approval_issue_items').where({ Issue_ID: issue.Issue_ID, Item_Status: 'Pending' });
    await trx('tbl_approval_issue_items').where({ Issue_ID: issue.Issue_ID, Item_Status: 'Pending' }).update({ Item_Status: 'Cancelled' });
    await trx('tbl_ornament_master').whereIn('Ornament_ID', items.map(i => i.Ornament_ID)).update({
      Is_On_Approval: false, Is_Stock_Available: true,
      Approval_Issue_ID: null, Approval_Out_By: null, Approval_Out_Date: null,
    });
    await trx('tbl_approval_issue_header').where({ Issue_ID: issue.Issue_ID }).update({
      Status: 'Cancelled', Cancelled_By: req.user.username, Cancelled_Date: new Date(),
      Cancellation_Reason: req.body.reason || null,
    });
    await trx.commit();

    await auditLog({
      tenantId: req.user.tenantId, userId: req.user.userId, tableName: 'tbl_approval_issue_header',
      recordId: issue.Issue_ID, actionType: 'UPDATE',
      description: `Approval issue ${issue.Voucher_Number} cancelled — ${items.length} item(s) restored to stock`, req,
    });
    return sendSuccess(res, null, 'Approval issue cancelled.');
  } catch (err) {
    await trx.rollback();
    return sendError(res, 500, 'Failed to cancel approval issue.');
  }
});

// ═══════════════════════════════ Tagged: Receive ═════════════════════════════

router.get('/issue/by-voucher/:voucherNumber', authenticate, async (req, res) => {
  try {
    const issue = await db('tbl_approval_issue_header as h')
      .leftJoin('tbl_approval_party_master as p', 'h.Party_ID', 'p.Party_ID')
      .where({ 'h.Voucher_Number': req.params.voucherNumber, 'h.Tenant_ID': req.user.tenantId })
      .select('h.*', 'p.Party_Name', 'p.Shop_Name', 'p.Mobile as Party_Mobile')
      .first();
    if (!issue) return sendError(res, 404, 'Approval issue voucher not found.');
    if (issue.Status === 'Cancelled') return sendError(res, 400, 'This voucher has been cancelled.');
    const pendingItems = await db('tbl_approval_issue_items').where({ Issue_ID: issue.Issue_ID, Item_Status: 'Pending' }).orderBy('Issue_Item_ID');
    return sendSuccess(res, { issue, pendingItems });
  } catch (err) { return sendError(res, 500, 'Failed to fetch approval issue by voucher.'); }
});

router.post('/receive', authenticate, requirePermission('approval_management'), [
  body('Issue_ID').notEmpty().withMessage('Issue_ID required'),
  body('Receive_Date').notEmpty().withMessage('Receive date required'),
  body('issueItemIds').isArray({ min: 1 }).withMessage('At least one item must be selected'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return sendValidationError(res, errors.array());

  const tenantId = req.user.tenantId;
  const dm = modeVal(req);
  const { Issue_ID, Receive_Date, Remarks, issueItemIds } = req.body;

  const trx = await db.transaction();
  try {
    const issue = await trx('tbl_approval_issue_header').where({ Issue_ID, Tenant_ID: tenantId }).forUpdate().first();
    if (!issue) { await trx.rollback(); return sendError(res, 404, 'Approval issue not found.'); }

    const items = await trx('tbl_approval_issue_items')
      .where({ Issue_ID }).whereIn('Issue_Item_ID', issueItemIds).forUpdate();
    if (items.length !== issueItemIds.length) {
      await trx.rollback();
      return sendError(res, 400, 'One or more selected items do not belong to this voucher.');
    }
    const notPending = items.find(i => i.Item_Status !== 'Pending');
    if (notPending) {
      await trx.rollback();
      return sendError(res, 400, `${notPending.Article_Number} is not pending — it may already have been received.`);
    }

    const voucherNumber = await generateApprovalReceiveNumber(tenantId);
    const totalWeight = items.reduce((s, i) => s + parseFloat(i.Gross_Weight || 0), 0);
    const totalValue = items.reduce((s, i) => s + parseFloat(i.Approx_Value || 0), 0);

    const [receive] = await trx('tbl_approval_receive_header').insert({
      Tenant_ID: tenantId, Branch_ID: req.body.Branch_ID || null, Voucher_Number: voucherNumber,
      Issue_ID, Receive_Date, Items_Received_Count: items.length,
      Total_Weight_Received: totalWeight, Total_Value_Received: totalValue,
      Remarks: Remarks || null, Data_Mode: dm, Created_By: req.user.username,
    }).returning('*');

    await trx('tbl_approval_issue_items').where({ Issue_ID }).whereIn('Issue_Item_ID', issueItemIds).update({
      Item_Status: 'Received', Received_In_Receive_ID: receive.Receive_ID, Received_Date: new Date(),
    });

    await trx('tbl_ornament_master').whereIn('Ornament_ID', items.map(i => i.Ornament_ID)).update({
      Is_On_Approval: false, Is_Stock_Available: true,
      Approval_Receive_ID: receive.Receive_ID, Approval_Received_By: req.user.username, Approval_Received_Date: new Date(),
    });

    const newStatus = await recomputeIssueStatus(trx, Issue_ID);
    await trx.commit();

    await auditLog({
      tenantId, userId: req.user.userId, tableName: 'tbl_approval_receive_header', recordId: receive.Receive_ID,
      actionType: 'INSERT',
      description: `Approval receive ${voucherNumber} against ${issue.Voucher_Number}: ${items.length} item(s) — voucher now ${newStatus}`, req,
    });

    return sendSuccess(res, { ...receive, status: newStatus }, 'Items received.', 201);
  } catch (err) {
    await trx.rollback();
    console.error('Approval receive error:', err);
    return sendError(res, 500, `Failed to process receive: ${err.message}`);
  }
});

router.get('/receives', authenticate, async (req, res) => {
  const { fromDate, toDate, page = 1, limit = 50 } = req.query;
  try {
    let qb = db('tbl_approval_receive_header as r')
      .join('tbl_approval_issue_header as h', 'r.Issue_ID', 'h.Issue_ID')
      .leftJoin('tbl_approval_party_master as p', 'h.Party_ID', 'p.Party_ID')
      .where('r.Tenant_ID', req.user.tenantId).where('r.Data_Mode', modeVal(req));
    if (fromDate) qb = qb.where('r.Receive_Date', '>=', fromDate);
    if (toDate) qb = qb.where('r.Receive_Date', '<=', toDate);
    const [{ count }] = await qb.clone().count('r.Receive_ID as count');
    const data = await qb.clone().select('r.*', 'h.Voucher_Number as Issue_Voucher_Number', 'p.Party_Name')
      .orderBy('r.Receive_Date', 'desc').limit(parseInt(limit)).offset((parseInt(page) - 1) * parseInt(limit));
    return sendSuccess(res, { items: data, total: parseInt(count) });
  } catch (err) { return sendError(res, 500, 'Failed to fetch approval receives.'); }
});

// ═══════════════════════════════ Non-Tagged: Issue ═══════════════════════════

router.post('/non-tag/issue', authenticate, requirePermission('approval_management'), [
  body('Issue_Date').notEmpty().withMessage('Issue date required'),
  body('items').isArray({ min: 1 }).withMessage('At least one item required'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return sendValidationError(res, errors.array());

  const tenantId = req.user.tenantId;
  const dm = modeVal(req);
  const { Party_ID, Issue_Date, Expected_Return_Date, Remarks, items } = req.body;

  const trx = await db.transaction();
  try {
    const voucherNumber = await generateNonTagIssueNumber(tenantId);
    const totalWeight = items.reduce((s, i) => s + parseFloat(i.Gross_Weight || 0), 0);
    const totalValue = items.reduce((s, i) => s + parseFloat(i.Approx_Value || 0), 0);

    const [issue] = await trx('tbl_non_tag_issue_header').insert({
      Tenant_ID: tenantId, Branch_ID: req.body.Branch_ID || null, Voucher_Number: voucherNumber,
      Party_ID: Party_ID || null, Issue_Date, Expected_Return_Date: Expected_Return_Date || null,
      Total_Items_Issued: items.length, Total_Weight_Issued: totalWeight, Total_Value_Issued: totalValue,
      Status: 'Pending', Remarks: Remarks || null, Data_Mode: dm, Created_By: req.user.username,
    }).returning('*');

    const itemRows = items.map(i => ({
      NTA_Issue_ID: issue.NTA_Issue_ID, Tenant_ID: tenantId,
      Type_ID: i.Type_ID || null, Item_Type: i.Item_Type || null,
      Design_ID: i.Design_ID || null, Design_Type: i.Design_Type || null,
      Category: i.Category || null, Gross_Weight: i.Gross_Weight || null,
      Purity_ID: i.Purity_ID || null, Metal_Type: i.Metal_Type || null,
      Approx_Value: i.Approx_Value || null, Image_URL: i.Image_URL || null, Remarks: i.Remarks || null,
      Item_Status: 'Pending', Created_By: req.user.username,
    }));
    const insertedItems = await trx('tbl_non_tag_issue_items').insert(itemRows).returning('*');

    await trx.commit();

    await auditLog({
      tenantId, userId: req.user.userId, tableName: 'tbl_non_tag_issue_header', recordId: issue.NTA_Issue_ID,
      actionType: 'INSERT', description: `Non-tag approval issue ${voucherNumber}: ${items.length} item(s), ₹${totalValue.toFixed(2)}`, req,
    });

    return sendSuccess(res, { ...issue, items: insertedItems }, 'Non-tag approval issue created.', 201);
  } catch (err) {
    await trx.rollback();
    console.error('Non-tag approval issue error:', err);
    return sendError(res, 500, `Failed to create non-tag approval issue: ${err.message}`);
  }
});

router.get('/non-tag/issue/:id', authenticate, async (req, res) => {
  try {
    const issue = await db('tbl_non_tag_issue_header as h')
      .leftJoin('tbl_approval_party_master as p', 'h.Party_ID', 'p.Party_ID')
      .where({ 'h.NTA_Issue_ID': req.params.id, 'h.Tenant_ID': req.user.tenantId })
      .select('h.*', 'p.Party_Name', 'p.Shop_Name', 'p.Mobile as Party_Mobile')
      .first();
    if (!issue) return sendError(res, 404, 'Non-tag approval issue not found.');
    const items = await db('tbl_non_tag_issue_items').where({ NTA_Issue_ID: req.params.id }).orderBy('NTA_Issue_Item_ID');
    return sendSuccess(res, { issue, items });
  } catch (err) { return sendError(res, 500, 'Failed to fetch non-tag approval issue.'); }
});

router.get('/non-tag/issues', authenticate, async (req, res) => {
  const { status, partyId, fromDate, toDate, page = 1, limit = 50 } = req.query;
  try {
    let qb = db('tbl_non_tag_issue_header as h')
      .leftJoin('tbl_approval_party_master as p', 'h.Party_ID', 'p.Party_ID')
      .where('h.Tenant_ID', req.user.tenantId).where('h.Data_Mode', modeVal(req));
    if (status) qb = qb.where('h.Status', status);
    if (partyId) qb = qb.where('h.Party_ID', partyId);
    if (fromDate) qb = qb.where('h.Issue_Date', '>=', fromDate);
    if (toDate) qb = qb.where('h.Issue_Date', '<=', toDate);
    const [{ count }] = await qb.clone().count('h.NTA_Issue_ID as count');
    const data = await qb.clone().select('h.*', 'p.Party_Name', 'p.Shop_Name', 'p.Mobile as Party_Mobile')
      .orderBy('h.Issue_Date', 'desc').limit(parseInt(limit)).offset((parseInt(page) - 1) * parseInt(limit));
    return sendSuccess(res, { items: data, total: parseInt(count) });
  } catch (err) { return sendError(res, 500, 'Failed to fetch non-tag approval issues.'); }
});

router.post('/non-tag/issue/:id/cancel', authenticate, requirePermission('approval_management'), async (req, res) => {
  const trx = await db.transaction();
  try {
    const issue = await trx('tbl_non_tag_issue_header').where({ NTA_Issue_ID: req.params.id, Tenant_ID: req.user.tenantId }).forUpdate().first();
    if (!issue) { await trx.rollback(); return sendError(res, 404, 'Non-tag approval issue not found.'); }
    if (issue.Status !== 'Pending') {
      await trx.rollback();
      return sendError(res, 400, 'Only a voucher with nothing yet received can be cancelled.');
    }
    await trx('tbl_non_tag_issue_items').where({ NTA_Issue_ID: issue.NTA_Issue_ID, Item_Status: 'Pending' }).update({ Item_Status: 'Cancelled' });
    await trx('tbl_non_tag_issue_header').where({ NTA_Issue_ID: issue.NTA_Issue_ID }).update({
      Status: 'Cancelled', Cancelled_By: req.user.username, Cancelled_Date: new Date(),
      Cancellation_Reason: req.body.reason || null,
    });
    await trx.commit();

    await auditLog({
      tenantId: req.user.tenantId, userId: req.user.userId, tableName: 'tbl_non_tag_issue_header',
      recordId: issue.NTA_Issue_ID, actionType: 'UPDATE',
      description: `Non-tag approval issue ${issue.Voucher_Number} cancelled`, req,
    });
    return sendSuccess(res, null, 'Non-tag approval issue cancelled.');
  } catch (err) {
    await trx.rollback();
    return sendError(res, 500, 'Failed to cancel non-tag approval issue.');
  }
});

// ═══════════════════════════════ Non-Tagged: Receive ═════════════════════════

router.get('/non-tag/issue/by-voucher/:voucherNumber', authenticate, async (req, res) => {
  try {
    const issue = await db('tbl_non_tag_issue_header as h')
      .leftJoin('tbl_approval_party_master as p', 'h.Party_ID', 'p.Party_ID')
      .where({ 'h.Voucher_Number': req.params.voucherNumber, 'h.Tenant_ID': req.user.tenantId })
      .select('h.*', 'p.Party_Name', 'p.Shop_Name', 'p.Mobile as Party_Mobile')
      .first();
    if (!issue) return sendError(res, 404, 'Non-tag approval issue voucher not found.');
    if (issue.Status === 'Cancelled') return sendError(res, 400, 'This voucher has been cancelled.');
    const pendingItems = await db('tbl_non_tag_issue_items').where({ NTA_Issue_ID: issue.NTA_Issue_ID, Item_Status: 'Pending' }).orderBy('NTA_Issue_Item_ID');
    return sendSuccess(res, { issue, pendingItems });
  } catch (err) { return sendError(res, 500, 'Failed to fetch non-tag approval issue by voucher.'); }
});

router.post('/non-tag/receive', authenticate, requirePermission('approval_management'), [
  body('NTA_Issue_ID').notEmpty().withMessage('NTA_Issue_ID required'),
  body('Receive_Date').notEmpty().withMessage('Receive date required'),
  body('issueItemIds').isArray({ min: 1 }).withMessage('At least one item must be selected'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return sendValidationError(res, errors.array());

  const tenantId = req.user.tenantId;
  const dm = modeVal(req);
  const { NTA_Issue_ID, Receive_Date, Remarks, issueItemIds } = req.body;

  const trx = await db.transaction();
  try {
    const issue = await trx('tbl_non_tag_issue_header').where({ NTA_Issue_ID, Tenant_ID: tenantId }).forUpdate().first();
    if (!issue) { await trx.rollback(); return sendError(res, 404, 'Non-tag approval issue not found.'); }

    const items = await trx('tbl_non_tag_issue_items')
      .where({ NTA_Issue_ID }).whereIn('NTA_Issue_Item_ID', issueItemIds).forUpdate();
    if (items.length !== issueItemIds.length) {
      await trx.rollback();
      return sendError(res, 400, 'One or more selected items do not belong to this voucher.');
    }
    const notPending = items.find(i => i.Item_Status !== 'Pending');
    if (notPending) {
      await trx.rollback();
      return sendError(res, 400, 'One or more selected items are not pending — they may already have been received.');
    }

    const voucherNumber = await generateNonTagReceiveNumber(tenantId);
    const totalWeight = items.reduce((s, i) => s + parseFloat(i.Gross_Weight || 0), 0);
    const totalValue = items.reduce((s, i) => s + parseFloat(i.Approx_Value || 0), 0);

    const [receive] = await trx('tbl_non_tag_receive_header').insert({
      Tenant_ID: tenantId, Branch_ID: req.body.Branch_ID || null, Voucher_Number: voucherNumber,
      NTA_Issue_ID, Receive_Date, Items_Received_Count: items.length,
      Total_Weight_Received: totalWeight, Total_Value_Received: totalValue,
      Remarks: Remarks || null, Data_Mode: dm, Created_By: req.user.username,
    }).returning('*');

    await trx('tbl_non_tag_issue_items').where({ NTA_Issue_ID }).whereIn('NTA_Issue_Item_ID', issueItemIds).update({
      Item_Status: 'Received', Received_In_Receive_ID: receive.NTA_Receive_ID, Received_Date: new Date(),
    });

    const newStatus = await recomputeNonTagIssueStatus(trx, NTA_Issue_ID);
    await trx.commit();

    await auditLog({
      tenantId, userId: req.user.userId, tableName: 'tbl_non_tag_receive_header', recordId: receive.NTA_Receive_ID,
      actionType: 'INSERT',
      description: `Non-tag approval receive ${voucherNumber} against ${issue.Voucher_Number}: ${items.length} item(s) — voucher now ${newStatus}`, req,
    });

    return sendSuccess(res, { ...receive, status: newStatus }, 'Items received.', 201);
  } catch (err) {
    await trx.rollback();
    console.error('Non-tag approval receive error:', err);
    return sendError(res, 500, `Failed to process non-tag receive: ${err.message}`);
  }
});

router.get('/non-tag/receives', authenticate, async (req, res) => {
  const { fromDate, toDate, page = 1, limit = 50 } = req.query;
  try {
    let qb = db('tbl_non_tag_receive_header as r')
      .join('tbl_non_tag_issue_header as h', 'r.NTA_Issue_ID', 'h.NTA_Issue_ID')
      .leftJoin('tbl_approval_party_master as p', 'h.Party_ID', 'p.Party_ID')
      .where('r.Tenant_ID', req.user.tenantId).where('r.Data_Mode', modeVal(req));
    if (fromDate) qb = qb.where('r.Receive_Date', '>=', fromDate);
    if (toDate) qb = qb.where('r.Receive_Date', '<=', toDate);
    const [{ count }] = await qb.clone().count('r.NTA_Receive_ID as count');
    const data = await qb.clone().select('r.*', 'h.Voucher_Number as Issue_Voucher_Number', 'p.Party_Name')
      .orderBy('r.Receive_Date', 'desc').limit(parseInt(limit)).offset((parseInt(page) - 1) * parseInt(limit));
    return sendSuccess(res, { items: data, total: parseInt(count) });
  } catch (err) { return sendError(res, 500, 'Failed to fetch non-tag approval receives.'); }
});

module.exports = router;
