const router = require('express').Router();
const { body, validationResult } = require('express-validator');
const db = require('../db/tenantDb').tenantDb;
const { sendSuccess, sendError, sendValidationError } = require('../utils/response');
const { authenticate, requirePermission } = require('../middleware/auth');
const dayjs = require('dayjs');
const crypto = require('crypto');
const { modeVal } = require('../utils/dataModeFilter');
const { postJournal } = require('../utils/accountingEngine');
const { resolveLedgerForPayment } = require('../utils/paymentLedgerMap');
const { generateSchemeAdjustmentNumber } = require('../utils/invoiceNumber');
const { nextNumber } = require('../utils/numberFormat');
const { resolveBranchForInsert } = require('../utils/branchAccess');

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

// ── Member Number Generator ────────────────────────────────────────────────────
const genMemberNumber = async (tenantId) => {
  const last = await db('tbl_scheme_members')
    .where('Tenant_ID', tenantId)
    .orderBy('Member_ID', 'desc').first();
  const seq = last ? parseInt(last.Member_Number.split('-').pop()) + 1 : 1;
  return `${tenantId.replace('_','')}-${String(seq).padStart(5,'0')}`;
};

// ── Receipt Number Generator ───────────────────────────────────────────────────
const genReceiptNumber = async (tenantId) => nextNumber({
  tenantId, table: 'tbl_scheme_transactions', column: 'Receipt_Number',
  prefix: 'SCM', tenantCode: tenantId.replace('_',''), padWidth: 4,
});

// ════════════════════════════════════════════════════════════════════════
// DASHBOARD
// ════════════════════════════════════════════════════════════════════════
router.get('/dashboard', authenticate, async (req, res) => {
  const tid = req.user.tenantId;
  const dm  = modeVal(req);
  const today = dayjs().format('YYYY-MM-DD');
  const monthStart = dayjs().startOf('month').format('YYYY-MM-DD');
  try {
    const [activeMembers]  = await db('tbl_scheme_members').where({ Tenant_ID: tid, Status: 'Active',  Data_Mode: dm }).count('Member_ID as c');
    const [maturedMembers] = await db('tbl_scheme_members').where({ Tenant_ID: tid, Status: 'Matured', Data_Mode: dm }).count('Member_ID as c');
    const [todayCollection]= await db('tbl_scheme_transactions').where('Tenant_ID', tid).where('Data_Mode', dm).whereRaw('DATE("Payment_Date") = ?', [today]).where('Txn_Type','Collection').sum('Net_Amount as total');
    const [monthCollection]= await db('tbl_scheme_transactions').where('Tenant_ID', tid).where('Data_Mode', dm).whereRaw('DATE("Payment_Date") >= ?', [monthStart]).where('Txn_Type','Collection').sum('Net_Amount as total');
    const [pendingInstallments] = await db('tbl_scheme_transactions').where({ Tenant_ID: tid, Status: 'Pending', Data_Mode: dm }).count('Txn_ID as c').catch(() => [{ c: 0 }]);
    const [totalGroups]    = await db('tbl_scheme_groups').where({ Tenant_ID: tid, Status: 'Active', Data_Mode: dm }).count('Group_ID as c');
    const [appCollection]  = await db('tbl_scheme_transactions').where({ Tenant_ID: tid, Collection_Source: 'App', Data_Mode: dm }).whereRaw('DATE("Payment_Date") = ?', [today]).sum('Net_Amount as total');
    const counterCollection = (parseFloat(todayCollection?.total || 0) - parseFloat(appCollection?.total || 0));
    const overdueMembers = await db('tbl_scheme_members').where({ Tenant_ID: tid, Status: 'Active', Data_Mode: dm }).whereRaw('"Joining_Date" < ?', [dayjs().subtract(35,'day').format('YYYY-MM-DD')]).andWhere(function() { this.where('Installments_Paid', 0).orWhereRaw('"Total_Amount_Paid" < ("Installment_Amount" * "Installments_Paid")'); }).count('Member_ID as c').first().catch(() => ({ c: 0 }));
    const [maturityDue] = await db('tbl_scheme_members').where('Tenant_ID', tid).where('Data_Mode', dm).whereRaw('DATE("Maturity_Date") BETWEEN ? AND ?', [today, dayjs().endOf('month').format('YYYY-MM-DD')]).count('Member_ID as c');
    return sendSuccess(res, {
      active_members:         parseInt(activeMembers?.c  || 0),
      matured_members:        parseInt(maturedMembers?.c || 0),
      total_groups:           parseInt(totalGroups?.c    || 0),
      today_collection:       parseFloat(todayCollection?.total  || 0),
      month_collection:       parseFloat(monthCollection?.total  || 0),
      app_collection:         parseFloat(appCollection?.total    || 0),
      counter_collection:     counterCollection,
      overdue_members:        parseInt(overdueMembers?.c || 0),
      maturity_due_this_month:parseInt(maturityDue?.c   || 0),
    });
  } catch(err) { console.error('Dashboard err:', err); return sendError(res, 500, 'Dashboard failed.'); }
});

// ════════════════════════════════════════════════════════════════════════
// SCHEME MASTER CRUD
// ════════════════════════════════════════════════════════════════════════
router.get('/schemes', authenticate, async (req, res) => {
  try {
    const schemes = await db('tbl_scheme_master').where({ Tenant_ID: req.user.tenantId }).orderBy('Scheme_Name');
    return sendSuccess(res, schemes);
  } catch(err) { return sendError(res, 500, 'Failed.'); }
});

router.post('/schemes', authenticate, [
  body('Scheme_Code').notEmpty(), body('Scheme_Name').notEmpty(),
  body('Duration_Months').isInt({ min: 1 }),
  body('Default_Monthly_Amount').isFloat({ min: 1 }),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return sendValidationError(res, errors.array());
  try {
    const [scheme] = await db('tbl_scheme_master').insert({ ...req.body, Tenant_ID: req.user.tenantId, Created_By: req.user.username }).returning('*');
    return sendSuccess(res, scheme, 'Scheme created.', 201);
  } catch(err) {
    if (err.code === '23505') return sendError(res, 409, 'Scheme code already exists.');
    return sendError(res, 500, 'Failed to create scheme.');
  }
});

router.put('/schemes/:id', authenticate, async (req, res) => {
  try {
    const [s] = await db('tbl_scheme_master').where({ Scheme_ID: req.params.id, Tenant_ID: req.user.tenantId }).update({ ...req.body, Modified_Date: new Date() }).returning('*');
    if (!s) return sendError(res, 404, 'Not found.');
    return sendSuccess(res, s);
  } catch(err) { return sendError(res, 500, 'Failed.'); }
});

// ════════════════════════════════════════════════════════════════════════
// SCHEME GROUPS
// ════════════════════════════════════════════════════════════════════════
router.get('/groups', authenticate, async (req, res) => {
  const { schemeId, status } = req.query;
  try {
    let qb = db('tbl_scheme_groups as g').join('tbl_scheme_master as s','g.Scheme_ID','s.Scheme_ID')
      .where('g.Tenant_ID', req.user.tenantId)
      .where('g.Data_Mode', modeVal(req))
      .select('g.*','s.Scheme_Name','s.Scheme_Type','s.Bonus_Type','s.Maturity_Type');
    if (schemeId) qb = qb.where('g.Scheme_ID', schemeId);
    if (status) qb = qb.where('g.Status', status);
    return sendSuccess(res, await qb.orderBy('g.Start_Date','desc'));
  } catch(err) { return sendError(res, 500, 'Failed.'); }
});

router.post('/groups', authenticate, [
  body('Scheme_ID').isInt(), body('Group_Code').notEmpty(),
  body('Group_Name').notEmpty(), body('Start_Date').isISO8601(),
  body('Monthly_Amount').isFloat({ min: 1 }),
  body('Total_Installments').isInt({ min: 1 }),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return sendValidationError(res, errors.array());
  try {
    const start = dayjs(req.body.Start_Date);
    const maturityDate = start.add(req.body.Total_Installments, 'month').format('YYYY-MM-DD');
    const [group] = await db('tbl_scheme_groups').insert({
      ...req.body, Tenant_ID: req.user.tenantId,
      Maturity_Date: maturityDate, Data_Mode: modeVal(req), Created_By: req.user.username,
    }).returning('*');
    return sendSuccess(res, group, 'Group created.', 201);
  } catch(err) {
    if (err.code === '23505') return sendError(res, 409, 'Group code exists for this scheme.');
    return sendError(res, 500, 'Failed.');
  }
});

router.put('/groups/:id', authenticate, async (req, res) => {
  // Partial update — primarily for Group_Image_URL (app design/banner image)
  // and Group_Terms_Text (per-group T&C shown at enrollment), general enough
  // for other simple field edits later.
  //
  // App_Join_Allowed / Counter_Join_Allowed were only ever settable at
  // Create Group time — a tenant with 10 existing groups had no way to
  // open just 5 of them to the app afterward. This is what
  // GET /api/core/getGroups (the app's own group list) actually checks —
  // see savingsAppCore.js.
  const { Group_Name, Group_Image_URL, Group_Terms_Text, Status, Bonus_Amount, App_Join_Allowed, Counter_Join_Allowed } = req.body;
  const updates = {};
  if (Group_Name !== undefined) updates.Group_Name = Group_Name;
  if (Group_Image_URL !== undefined) updates.Group_Image_URL = Group_Image_URL;
  if (Group_Terms_Text !== undefined) updates.Group_Terms_Text = Group_Terms_Text;
  if (Status !== undefined) updates.Status = Status;
  if (Bonus_Amount !== undefined) updates.Bonus_Amount = Bonus_Amount;
  if (App_Join_Allowed !== undefined) updates.App_Join_Allowed = App_Join_Allowed;
  if (Counter_Join_Allowed !== undefined) updates.Counter_Join_Allowed = Counter_Join_Allowed;

  try {
    const [group] = await db('tbl_scheme_groups')
      .where({ Group_ID: req.params.id, Tenant_ID: req.user.tenantId })
      .update(updates)
      .returning('*');
    if (!group) return sendError(res, 404, 'Not found.');
    return sendSuccess(res, group, 'Group updated.');
  } catch (err) {
    return sendError(res, 500, 'Failed to update group.');
  }
});

router.get('/groups/:id', authenticate, async (req, res) => {
  try {
    const group = await db('tbl_scheme_groups as g').join('tbl_scheme_master as s','g.Scheme_ID','s.Scheme_ID')
      .where('g.Group_ID', req.params.id).select('g.*','s.Scheme_Name','s.Scheme_Type').first();
    if (!group) return sendError(res, 404, 'Not found.');
    const members = await db('tbl_scheme_members').where({ Group_ID: req.params.id, Tenant_ID: req.user.tenantId });
    return sendSuccess(res, { group, members });
  } catch(err) { return sendError(res, 500, 'Failed.'); }
});

// ════════════════════════════════════════════════════════════════════════
// MEMBERS
// ════════════════════════════════════════════════════════════════════════
router.get('/members', authenticate, async (req, res) => {
  const { status, schemeId, groupId, search, page = 1, limit = 50 } = req.query;
  try {
    let qb = db('tbl_scheme_members as m')
      .leftJoin('tbl_scheme_master as s','m.Scheme_ID','s.Scheme_ID')
      .leftJoin('tbl_scheme_groups as g','m.Group_ID','g.Group_ID')
      .where('m.Tenant_ID', req.user.tenantId)
      .where('m.Data_Mode', modeVal(req))
      .select('m.*','s.Scheme_Name','s.Scheme_Type','g.Group_Name');
    if (status)   qb = qb.where('m.Status', status);
    if (schemeId) qb = qb.where('m.Scheme_ID', schemeId);
    if (groupId)  qb = qb.where('m.Group_ID', groupId);
    if (search)   qb = qb.where(function() {
      this.where('m.Member_Name','ilike',`%${search}%`)
        .orWhere('m.Mobile','like',`%${search}%`)
        .orWhere('m.Member_Number','ilike',`%${search}%`);
    });
    const [{ count }] = await db('tbl_scheme_members')
      .where({ Tenant_ID: req.user.tenantId, Data_Mode: modeVal(req) })
      .count('Member_ID as count');
    const data = await qb.orderBy('m.Created_Date','desc').limit(parseInt(limit)).offset((parseInt(page)-1)*parseInt(limit));
    return sendSuccess(res, { items: data, total: parseInt(count) });
  } catch(err) { console.error(err); return sendError(res, 500, 'Failed.'); }
});

router.post('/members', authenticate, [
  body('Member_Name').trim().notEmpty(),
  body('Mobile').trim().notEmpty(),
  body('Scheme_ID').isInt(),
  body('Group_ID').isInt(),
  body('Joining_Date').isISO8601(),
  body('Installment_Amount').isFloat({ min: 1 }),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return sendValidationError(res, errors.array());
  const trx = await db.transaction();
  try {
    const tid = req.user.tenantId;
    const memberNumber = await genMemberNumber(tid);
    const group = await trx('tbl_scheme_groups').where({ Group_ID: req.body.Group_ID }).first();
    if (!group) { await trx.rollback(); return sendError(res, 404, 'Group not found.'); }
    if (group.Member_Limit > 0 && group.Current_Members >= group.Member_Limit) {
      await trx.rollback(); return sendError(res, 400, 'Group is full.');
    }
    const maturityDate = dayjs(req.body.Joining_Date).add(group.Total_Installments, 'month').format('YYYY-MM-DD');
    const maturityValue = parseFloat(req.body.Installment_Amount) * (group.Total_Installments + (group.Bonus_Amount > 0 ? 1 : 0));
    const [member] = await trx('tbl_scheme_members').insert({
      ...req.body, Tenant_ID: tid, Member_Number: memberNumber,
      Total_Installments: group.Total_Installments,
      Maturity_Date: maturityDate, Maturity_Value: maturityValue,
      Join_Source: req.body.Join_Source || 'Counter',
      Status: 'Active', Data_Mode: modeVal(req), Created_By: req.user.username,
    }).returning('*');
    // Increment group member count
    await trx('tbl_scheme_groups').where('Group_ID', req.body.Group_ID).increment('Current_Members', 1);
    await trx.commit();
    // Queue welcome notification (non-blocking)
    queueNotification(tid, member.Member_ID, 'Welcome', 'WhatsApp', `Welcome to ${group.Group_Name}! Your Member ID: ${memberNumber}`).catch(() => {});
    return sendSuccess(res, member, `Member ${memberNumber} enrolled.`, 201);
  } catch(err) {
    await trx.rollback();
    if (err.code === '23505') return sendError(res, 409, 'Mobile already enrolled in this scheme.');
    console.error('Member create err:', err);
    return sendError(res, 500, 'Failed.');
  }
});

// ── GET /api/savings/members/search-for-pos ───────────────────────────────────
// Search-by-mobile/name/member-number for POS billing. Registered BEFORE
// GET /members/:id so Express doesn't swallow "search-for-pos" as an :id.
// Returns each matched member's real available balance/bonus for adjustment,
// gated by this tenant's tbl_scheme_settings (Active schemes are eligible
// only if the owner has explicitly turned that on — off by default).
router.get('/members/search-for-pos', authenticate, async (req, res) => {
  const { q } = req.query;
  if (!q || !q.trim()) return sendSuccess(res, []);
  const tenantId = req.user.tenantId;
  const dm = modeVal(req);
  try {
    const settings = await db('tbl_scheme_settings').where({ Tenant_ID: tenantId }).first();
    const allowActiveAdjustment = !!settings?.Allow_Active_Scheme_Adjustment;
    const allowActiveBonus = !!settings?.Allow_Active_Scheme_Bonus;

    const members = await db('tbl_scheme_members as m')
      .leftJoin('tbl_scheme_master as s', 'm.Scheme_ID', 's.Scheme_ID')
      .where('m.Tenant_ID', tenantId).where('m.Data_Mode', dm)
      .whereIn('m.Status', ['Active', 'Matured'])
      .where(function () {
        this.where('m.Member_Name', 'ilike', `%${q}%`)
          .orWhere('m.Mobile', 'like', `%${q}%`)
          .orWhere('m.Member_Number', 'ilike', `%${q}%`);
      })
      .select(
        'm.Member_ID', 'm.Member_Number', 'm.Member_Name', 'm.Mobile', 'm.Status',
        'm.Total_Amount_Paid', 'm.Amount_Redeemed', 'm.Customer_ID', 's.Scheme_Name'
      );

    const memberIds = members.map((m) => m.Member_ID);
    const bonusRows = memberIds.length
      ? await db('tbl_scheme_bonuses').where('Tenant_ID', tenantId).whereIn('Member_ID', memberIds).where('Is_Redeemed', false)
      : [];
    const bonusByMember = {};
    bonusRows.forEach((b) => {
      bonusByMember[b.Member_ID] = (bonusByMember[b.Member_ID] || 0) + parseFloat(b.Bonus_Amount || 0);
    });

    const result = members.map((m) => {
      const isMatured = m.Status === 'Matured';
      const balanceEligible = isMatured || allowActiveAdjustment;
      const bonusEligible = isMatured || allowActiveBonus;
      const availableBalance = Math.max(0, parseFloat(m.Total_Amount_Paid || 0) - parseFloat(m.Amount_Redeemed || 0));
      return {
        Member_ID: m.Member_ID,
        Member_Number: m.Member_Number,
        Member_Name: m.Member_Name,
        Mobile: m.Mobile,
        Status: m.Status,
        Scheme_Name: m.Scheme_Name,
        // Always show the real balance/bonus — *_Eligible only gates whether
        // it can be applied, so staff can still see what a customer has
        // saved even when the admin hasn't enabled active-scheme adjustment.
        Available_Balance: availableBalance,
        Available_Bonus: bonusByMember[m.Member_ID] || 0,
        Balance_Eligible: balanceEligible,
        Bonus_Eligible: bonusEligible,
      };
    });
    return sendSuccess(res, result);
  } catch (err) {
    console.error('POS member search error:', err);
    return sendError(res, 500, 'Failed to search members.');
  }
});

// ── GET/PUT /api/savings/scheme-settings ──────────────────────────────────────
// Per-tenant admin toggle: whether Active (not-yet-matured) schemes may be
// partially adjusted/bonus-used at POS. Defaults to false (matured-only)
// until the owner explicitly opts in.
router.get('/scheme-settings', authenticate, async (req, res) => {
  try {
    const row = await db('tbl_scheme_settings').where({ Tenant_ID: req.user.tenantId }).first();
    return sendSuccess(res, row || { Allow_Active_Scheme_Adjustment: false, Allow_Active_Scheme_Bonus: false });
  } catch (err) {
    return sendError(res, 500, 'Failed to fetch scheme settings.');
  }
});

router.put('/scheme-settings', authenticate, requirePermission('tenant_management'), async (req, res) => {
  const { Allow_Active_Scheme_Adjustment, Allow_Active_Scheme_Bonus } = req.body;
  try {
    const existing = await db('tbl_scheme_settings').where({ Tenant_ID: req.user.tenantId }).first();
    const payload = {
      Allow_Active_Scheme_Adjustment: !!Allow_Active_Scheme_Adjustment,
      Allow_Active_Scheme_Bonus: !!Allow_Active_Scheme_Bonus,
      Updated_By: req.user.username,
      Updated_Date: new Date(),
    };
    let row;
    if (existing) {
      [row] = await db('tbl_scheme_settings').where({ Setting_ID: existing.Setting_ID }).update(payload).returning('*');
    } else {
      [row] = await db('tbl_scheme_settings').insert({ ...payload, Tenant_ID: req.user.tenantId }).returning('*');
    }
    return sendSuccess(res, row, 'Scheme settings saved.');
  } catch (err) {
    console.error('Save scheme settings error:', err);
    return sendError(res, 500, 'Failed to save scheme settings.');
  }
});

router.get('/members/:id', authenticate, async (req, res) => {
  try {
    const member = await db('tbl_scheme_members as m')
      .leftJoin('tbl_scheme_master as s','m.Scheme_ID','s.Scheme_ID')
      .leftJoin('tbl_scheme_groups as g','m.Group_ID','g.Group_ID')
      .where('m.Member_ID', req.params.id)
      .select('m.*','s.Scheme_Name','s.Scheme_Type','s.Bonus_Type','s.Maturity_Type','g.Group_Name').first();
    if (!member) return sendError(res, 404, 'Not found.');
    const transactions = await db('tbl_scheme_transactions').where({ Member_ID: req.params.id }).orderBy('Payment_Date','desc');
    const bonuses = await db('tbl_scheme_bonuses').where({ Member_ID: req.params.id });
    const pdc = await db('tbl_scheme_pdc').where({ Member_ID: req.params.id }).orderBy('Cheque_Date');
    return sendSuccess(res, { member, transactions, bonuses, pdc });
  } catch(err) { return sendError(res, 500, 'Failed.'); }
});

// PUT /api/savings/members/:id — self-service / staff profile edit
router.put('/members/:id', authenticate, async (req, res) => {
  const { Member_Name, Mobile, Email, Address_Line1, Pincode, Installment_Amount } = req.body;
  const updates = {};
  if (Member_Name !== undefined) updates.Member_Name = Member_Name;
  if (Mobile !== undefined) updates.Mobile = Mobile;
  if (Email !== undefined) updates.Email = Email;
  if (Address_Line1 !== undefined) updates.Address_Line1 = Address_Line1;
  if (Pincode !== undefined) updates.Pincode = Pincode;
  if (Installment_Amount !== undefined) updates.Installment_Amount = Installment_Amount;

  try {
    const [member] = await db('tbl_scheme_members')
      .where({ Member_ID: req.params.id, Tenant_ID: req.user.tenantId })
      .update(updates)
      .returning('*');
    if (!member) return sendError(res, 404, 'Member not found.');
    return sendSuccess(res, member, 'Profile updated.');
  } catch (err) {
    if (err.code === '23505') return sendError(res, 409, 'Mobile number already in use.');
    console.error('Update member error:', err.message);
    return sendError(res, 500, 'Failed to update profile.');
  }
});

// NOTE: a custom password-based member login (PUT /members/:id/set-password
// + POST /member-login) used to live here. It's been removed — the real,
// shipped savings_app mobile frontend uses OTP login instead (see
// server/src/routes/mobileAuth.js: /api/mobile/send-otp, /verify-otp),
// which is more complete (no per-member password to manage/reset) and was
// already the pre-existing, more thoroughly built mechanism. The
// tbl_scheme_members.Password_Hash/Password_Salt/App_Login_Enabled columns
// (migration 20260820000000) are left in place, unused, rather than
// dropped — harmless to keep, and dropping a column is a one-way door a
// removed route is not.

// DELETE /api/savings/members/:id — soft close (account deletion request)
router.delete('/members/:id', authenticate, async (req, res) => {
  try {
    const [member] = await db('tbl_scheme_members')
      .where({ Member_ID: req.params.id, Tenant_ID: req.user.tenantId })
      .update({ Status: 'Closed' })
      .returning('*');
    if (!member) return sendError(res, 404, 'Member not found.');
    return sendSuccess(res, null, 'Account closed.');
  } catch (err) {
    return sendError(res, 500, 'Failed to close account.');
  }
});

// ════════════════════════════════════════════════════════════════════════
// COLLECTIONS
// ════════════════════════════════════════════════════════════════════════
router.post('/collect', authenticate, [
  body('Member_ID').isInt(),
  body('Amount').isFloat({ min: 1 }),
  body('Payment_Mode').notEmpty(),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return sendValidationError(res, errors.array());
  const trx = await db.transaction();
  try {
    const tid = req.user.tenantId;
    const member = await trx('tbl_scheme_members').where({ Member_ID: req.body.Member_ID, Tenant_ID: tid }).first();
    if (!member) { await trx.rollback(); return sendError(res, 404, 'Member not found.'); }
    if (member.Status !== 'Active') { await trx.rollback(); return sendError(res, 400, `Cannot collect — member status: ${member.Status}`); }
    const receiptNumber = await genReceiptNumber(tid);
    const penaltyAmount = parseFloat(req.body.Penalty_Amount || 0);
    const netAmount = parseFloat(req.body.Amount) + penaltyAmount;
    const newInstallmentNo = member.Installments_Paid + 1;
    const [txn] = await trx('tbl_scheme_transactions').insert({
      Tenant_ID: tid, Receipt_Number: receiptNumber,
      Member_ID: req.body.Member_ID,
      Tenant_Member_No: member.Member_Number,
      Txn_Type: 'Collection',
      Installment_No: newInstallmentNo,
      Due_Date: req.body.Due_Date || null,
      Amount: req.body.Amount,
      Penalty_Amount: penaltyAmount,
      Net_Amount: netAmount,
      Payment_Mode: req.body.Payment_Mode,
      Payment_Reference: req.body.Payment_Reference || null,
      Bank_Name: req.body.Bank_Name || null,
      Cheque_Number: req.body.Cheque_Number || null,
      Cheque_Date: req.body.Cheque_Date || null,
      Collection_Source: req.body.Collection_Source || 'Counter',
      Collected_By: req.user.userId,
      // Active X-Branch-ID context now wins over a raw client-supplied
      // Branch_ID (same resolveBranchForInsert convention every other
      // module uses) — this used to trust req.body.Branch_ID directly,
      // ignoring the active branch context entirely.
      Branch_ID: resolveBranchForInsert(req, req.body.Branch_ID),
      Agent_Code: req.body.Agent_Code || req.user.agentCode || null,
      Data_Mode: modeVal(req),
      Created_By: req.user.username,
    }).returning('*');

    // Update member totals
    const newPaid = member.Installments_Paid + 1;
    const newTotal = parseFloat(member.Total_Amount_Paid) + netAmount;
    const isComplete = newPaid >= member.Total_Installments;
    const updateData = {
      Installments_Paid: newPaid, Total_Amount_Paid: newTotal,
      Status: isComplete ? 'Matured' : 'Active', Modified_Date: new Date(),
    };
    await trx('tbl_scheme_members').where('Member_ID', req.body.Member_ID).update(updateData);

    // ── ACCOUNTING ENTRIES ─────────────────────────────────────────────────
    // Rule: Collections are LIABILITIES, not income.
    // Dr  Cash/Bank A/c           (asset increases)
    // Cr  Scheme Deposit A/c      (liability increases)
    // For Digi Gold:
    // Dr  Cash/Bank A/c           Cr  Digi Gold Liability A/c
    const schemeInfo = await trx('tbl_scheme_master').where('Scheme_ID', member.Scheme_ID).first().catch(() => null);
    const isDigiGold = schemeInfo?.Scheme_Type?.toLowerCase().includes('digi') || schemeInfo?.Scheme_Name?.toLowerCase().includes('digi');

    const creditLedger = isDigiGold
      ? { account: 'Digi Gold Liability Account', group: 'Liabilities', sub: 'Advance' }
      : { account: 'Customer Scheme Deposit Account', group: 'Liabilities', sub: 'Advance' };
    // A plain read (no writes) — safe to resolve before commit even though
    // it isn't run through trx; it just picks which ledger name to use.
    const debitLedger = await resolveLedgerForPayment(db, tid, req.body.Payment_Mode, req.body.Bank_Account_ID);
    const entryNarration = `Scheme collection | ${member.Member_Number} | ${receiptNumber} | Inst ${newInstallmentNo}/${member.Total_Installments}`;

    // Bonus provision on maturity — computed now (still inside the trx, so
    // it either commits together with everything else or not at all), the
    // actual ledger posts for both this and the collection itself happen
    // after commit below.
    let bonusGroup = null;
    if (isComplete) {
      bonusGroup = await trx('tbl_scheme_groups').where('Group_ID', member.Group_ID).first();
      if (bonusGroup?.Bonus_Amount > 0) {
        await trx('tbl_scheme_bonuses').insert({
          Tenant_ID: tid, Member_ID: member.Member_ID,
          Bonus_Type: 'Cash', Bonus_Amount: bonusGroup.Bonus_Amount,
          Credit_Date: new Date(), Created_By: 'system',
        });
      }
    }

    await trx.commit();

    // ── POST TO THE REAL LEDGER — this used to ONLY write into a separate,
    // disconnected tbl_scheme_accounting_entries table that never reached
    // tbl_accounting_journal, so scheme collections never showed up in
    // Trial Balance, Ledger, Day Book, the Accounting Dashboard, or Tally
    // (see reports.js's balance-sheet comment on this exact gap). The
    // shadow-table insert below stays too — it's this module's own
    // scheme-specific audit trail — but the money now also actually lands
    // in the books. Awaited (was fire-and-forget until now, despite this
    // comment once claiming otherwise) — the response used to go out
    // before the journal was guaranteed committed, the same race every
    // other module in this codebase was already fixed for.
    await (async () => {
      await db('tbl_scheme_accounting_entries').insert({
        Tenant_ID: tid, Txn_ID: txn.Txn_ID, Entry_Date: new Date(), Receipt_No: receiptNumber, Member_ID: member.Member_ID,
        Debit_Account: debitLedger.account, Credit_Account: creditLedger.account, Amount: netAmount,
        Narration: entryNarration, Created_By: req.user.username,
      }).catch(() => {}); // non-fatal if table doesn't exist yet

      await postJournal({
        tenantId: tid, sourceType: 'RECEIPT', sourceId: txn.Txn_ID, reference: receiptNumber, narration: entryNarration, branchId: txn.Branch_ID,
        createdBy: req.user.username,
        lines: [
          { account: debitLedger.account, group: debitLedger.group, sub: debitLedger.sub, type: 'Dr', amount: netAmount },
          { account: creditLedger.account, group: creditLedger.group, sub: creditLedger.sub, type: 'Cr', amount: netAmount },
        ],
      });

      if (isComplete && bonusGroup?.Bonus_Amount > 0) {
        const bonusNarration = `Scheme maturity bonus | ${member.Member_Number}`;
        await db('tbl_scheme_accounting_entries').insert({
          Tenant_ID: tid, Entry_Date: new Date(), Receipt_No: `BONUS-${receiptNumber}`, Member_ID: member.Member_ID,
          Debit_Account: 'Scheme Bonus Expense Account', Credit_Account: 'Scheme Bonus Provision Account',
          Amount: bonusGroup.Bonus_Amount, Narration: bonusNarration, Created_By: 'system',
        }).catch(() => {});
        await postJournal({
          tenantId: tid, sourceType: 'JOURNAL', reference: `BONUS-${receiptNumber}`, narration: bonusNarration, createdBy: 'system', branchId: txn.Branch_ID,
          lines: [
            { account: 'Scheme Bonus Expense Account', group: 'Expenses', sub: 'Indirect Expense', type: 'Dr', amount: bonusGroup.Bonus_Amount },
            { account: 'Scheme Bonus Provision Account', group: 'Liabilities', sub: 'Provision', type: 'Cr', amount: bonusGroup.Bonus_Amount },
          ],
        });
      }
    })().catch((err) => console.error('[SavingsScheme] Ledger post failed (collection itself still recorded fine):', err.message));

    // Send receipt notification
    queueNotification(tid, member.Member_ID, 'Collection', 'WhatsApp',
      `Receipt: ${receiptNumber} | Installment ${newInstallmentNo} of ${member.Total_Installments} | ₹${netAmount} received.`
    ).catch(() => {});

    return sendSuccess(res, {
      transaction:    txn,
      receipt_number: receiptNumber,
      is_complete:    isComplete,
      accounting: {
        debit:  debitLedger.account,
        credit: creditLedger.account,
        amount: netAmount,
      },
    }, 'Collection recorded.', 201);
  } catch(err) {
    await trx.rollback();
    console.error('Collection error:', err.message);
    return sendError(res, 500, `Collection failed: ${err.message}`);
  }
});

router.get('/collections', authenticate, async (req, res) => {
  const { memberId, date, source, mode, page = 1, limit = 50 } = req.query;
  try {
    let qb = db('tbl_scheme_transactions as t')
      .leftJoin('tbl_scheme_members as m','t.Member_ID','m.Member_ID')
      .where('t.Tenant_ID', req.user.tenantId)
      .where('t.Data_Mode', modeVal(req))
      .where('t.Txn_Type','Collection')
      .select('t.*','m.Member_Name','m.Mobile','m.Member_Number');
    if (memberId) qb = qb.where('t.Member_ID', memberId);
    if (date)     qb = qb.whereRaw('DATE("t"."Payment_Date") = ?', [date]);
    if (source)   qb = qb.where('t.Collection_Source', source);
    if (mode)     qb = qb.where('t.Payment_Mode', mode);
    const data = await qb.orderBy('t.Payment_Date','desc').limit(parseInt(limit)).offset((parseInt(page)-1)*parseInt(limit));
    return sendSuccess(res, { items: data });
  } catch(err) { return sendError(res, 500, 'Failed.'); }
});

// ════════════════════════════════════════════════════════════════════════
// PDC MANAGEMENT
// ════════════════════════════════════════════════════════════════════════
router.get('/pdc', authenticate, async (req, res) => {
  const { status, memberId } = req.query;
  try {
    let qb = db('tbl_scheme_pdc as p').leftJoin('tbl_scheme_members as m','p.Member_ID','m.Member_ID')
      .where('p.Tenant_ID', req.user.tenantId).select('p.*','m.Member_Name','m.Member_Number','m.Mobile');
    if (status) qb = qb.where('p.Status', status);
    if (memberId) qb = qb.where('p.Member_ID', memberId);
    return sendSuccess(res, await qb.orderBy('p.Cheque_Date'));
  } catch(err) { return sendError(res, 500, 'Failed.'); }
});

router.post('/pdc', authenticate, [
  body('Member_ID').isInt(), body('Bank_Name').notEmpty(),
  body('Cheque_Number').notEmpty(), body('Amount').isFloat({ min: 1 }),
  body('Cheque_Date').isISO8601(),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return sendValidationError(res, errors.array());
  try {
    const [pdc] = await db('tbl_scheme_pdc').insert({ ...req.body, Tenant_ID: req.user.tenantId, Status: 'Pending', Created_By: req.user.username }).returning('*');
    return sendSuccess(res, pdc, 'PDC recorded.', 201);
  } catch(err) { return sendError(res, 500, 'Failed.'); }
});

router.put('/pdc/:id/status', authenticate, async (req, res) => {
  try {
    const { status, bounce_charge, remarks } = req.body;
    const [pdc] = await db('tbl_scheme_pdc').where({ PDC_ID: req.params.id, Tenant_ID: req.user.tenantId })
      .update({ Status: status, Bounce_Charge: bounce_charge || 0, Remarks: remarks, Deposit_Date: status === 'Deposited' ? new Date() : undefined, Clearing_Date: status === 'Cleared' ? new Date() : undefined }).returning('*');
    if (!pdc) return sendError(res, 404, 'Not found.');
    return sendSuccess(res, pdc, 'PDC status updated.');
  } catch(err) { return sendError(res, 500, 'Failed.'); }
});

// ════════════════════════════════════════════════════════════════════════
// LUCKY DRAW
// ════════════════════════════════════════════════════════════════════════
router.post('/draw/conduct', authenticate, requirePermission('tenant_management'), async (req, res) => {
  const { Scheme_ID, Group_ID, Draw_Date, Draw_Type, Draw_Name, Prize_Type, Prize_Value, Prize_Description } = req.body;
  const drawType = Draw_Type || 'Monthly';
  try {
    const tid = req.user.tenantId;

    // Both flags default false — a scheme/group must EXPLICITLY opt into
    // draws (Enable_Draw / Draw_Applicable, set on the scheme/group itself).
    // Previously neither was ever checked here at all, so a draw could run
    // against a scheme/group that had the feature turned off.
    if (Scheme_ID) {
      const scheme = await db('tbl_scheme_master').where({ Scheme_ID, Tenant_ID: tid }).first();
      if (!scheme) return sendError(res, 404, 'Scheme not found.');
      if (!scheme.Enable_Draw) return sendError(res, 400, `"${scheme.Scheme_Name}" does not have Lucky Draw enabled.`);
    }
    if (Group_ID) {
      const group = await db('tbl_scheme_groups').where({ Group_ID, Tenant_ID: tid }).first();
      if (!group) return sendError(res, 404, 'Group not found.');
      if (!group.Draw_Applicable) return sendError(res, 400, `"${group.Group_Name}" is not eligible for Lucky Draw.`);
    }

    // Recurring draw types (Monthly/Quarterly) must not run twice for the
    // same scheme/group in the same period — Festival/Special draws are
    // named, one-off events and are exempt from this check on purpose.
    if (drawType === 'Monthly' || drawType === 'Quarterly') {
      const drawDate = dayjs(Draw_Date || new Date());
      const periodStart = drawType === 'Monthly'
        ? drawDate.startOf('month')
        : drawDate.startOf('month').subtract((drawDate.month() % 3), 'month').startOf('month');
      const periodEnd = drawType === 'Monthly' ? drawDate.endOf('month') : periodStart.add(3, 'month').subtract(1, 'day').endOf('day');
      let dupQb = db('tbl_scheme_draws').where({ Tenant_ID: tid, Draw_Type: drawType })
        .whereBetween('Draw_Date', [periodStart.toDate(), periodEnd.toDate()]);
      dupQb = Scheme_ID ? dupQb.where('Scheme_ID', Scheme_ID) : dupQb.whereNull('Scheme_ID');
      dupQb = Group_ID ? dupQb.where('Group_ID', Group_ID) : dupQb.whereNull('Group_ID');
      const existing = await dupQb.first();
      if (existing) {
        return sendError(res, 400, `A ${drawType.toLowerCase()} draw for this scheme/group already ran this period (${existing.Draw_Date}).`);
      }
    }

    // Get eligible members (Active, paid at least 1 installment)
    let eligibleQb = db('tbl_scheme_members').where({ Tenant_ID: tid, Status: 'Active' }).where('Installments_Paid', '>', 0);
    if (Scheme_ID) eligibleQb = eligibleQb.where('Scheme_ID', Scheme_ID);
    if (Group_ID) eligibleQb = eligibleQb.where('Group_ID', Group_ID);
    const eligible = await eligibleQb;
    if (eligible.length === 0) return sendError(res, 400, 'No eligible members for draw.');
    // Random winner — crypto.randomInt (not Math.random) so the pick isn't
    // derived from a predictable PRNG seed; still a fair uniform pick, just
    // not one a caller could feasibly influence/predict.
    const winner = eligible[crypto.randomInt(0, eligible.length)];
    const [draw] = await db('tbl_scheme_draws').insert({
      Tenant_ID: tid, Scheme_ID, Group_ID, Draw_Date: Draw_Date || new Date(),
      Draw_Type: drawType, Draw_Name, Winner_Member_ID: winner.Member_ID,
      Prize_Type, Prize_Value, Prize_Description, Eligible_Members: eligible.length,
      Conducted_By: req.user.username,
    }).returning('*');
    // Notify winner
    queueNotification(tid, winner.Member_ID, 'Draw Winner', 'WhatsApp', `🎉 Congratulations! You won the ${Draw_Name || 'Lucky Draw'}! Prize: ${Prize_Description || Prize_Type}`).catch(() => {});
    return sendSuccess(res, { draw, winner: { Member_ID: winner.Member_ID, Member_Name: winner.Member_Name, Member_Number: winner.Member_Number, Mobile: winner.Mobile } }, '🎉 Draw conducted!');
  } catch(err) { console.error(err); return sendError(res, 500, 'Draw failed.'); }
});

router.get('/draw/history', authenticate, async (req, res) => {
  try {
    const draws = await db('tbl_scheme_draws as d')
      .leftJoin('tbl_scheme_members as m','d.Winner_Member_ID','m.Member_ID')
      .where('d.Tenant_ID', req.user.tenantId)
      .select('d.*','m.Member_Name','m.Mobile','m.Member_Number')
      .orderBy('d.Draw_Date','desc');
    return sendSuccess(res, draws);
  } catch(err) { return sendError(res, 500, 'Failed.'); }
});

// ════════════════════════════════════════════════════════════════════════
// GOLD CONVERSION
// ════════════════════════════════════════════════════════════════════════
router.post('/gold-convert', authenticate, [
  body('Member_ID').isInt(),
  body('Amount_To_Convert').isFloat({ min: 1 }),
  body('Gold_Rate').isFloat({ min: 1 }),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return sendValidationError(res, errors.array());
  const trx = await db.transaction();
  try {
    const tid = req.user.tenantId;
    const member = await trx('tbl_scheme_members').where({ Member_ID: req.body.Member_ID, Tenant_ID: tid }).first();
    if (!member) { await trx.rollback(); return sendError(res, 404, 'Member not found.'); }
    const amount = parseFloat(req.body.Amount_To_Convert);
    const rate = parseFloat(req.body.Gold_Rate);
    if (amount > member.Total_Amount_Paid) { await trx.rollback(); return sendError(res, 400, `Amount exceeds total paid (₹${member.Total_Amount_Paid}).`); }
    const goldWeight = parseFloat((amount / rate).toFixed(3));
    const remaining = parseFloat(member.Total_Amount_Paid) - amount;
    const [conversion] = await trx('tbl_scheme_gold_conversion').insert({
      Tenant_ID: tid, Member_ID: req.body.Member_ID,
      Conversion_Date: req.body.Conversion_Date || new Date(),
      Amount_Converted: amount, Gold_Rate_Used: rate,
      Gold_Weight_Credited: goldWeight, Remaining_Balance: remaining,
      Rate_Mode: req.body.Rate_Mode || 'Current Rate',
      Created_By: req.user.username,
    }).returning('*');
    // Update member gold balance
    await trx('tbl_scheme_members').where('Member_ID', req.body.Member_ID).update({
      Gold_Balance_Grams: db.raw('"Gold_Balance_Grams" + ?', [goldWeight]),
    });
    await trx.commit();
    return sendSuccess(res, { conversion, gold_weight: goldWeight, remaining_balance: remaining }, `${goldWeight}g gold credited.`);
  } catch(err) { await trx.rollback(); console.error(err); return sendError(res, 500, 'Conversion failed.'); }
});

// ════════════════════════════════════════════════════════════════════════
// REPORTS
// ════════════════════════════════════════════════════════════════════════
router.get('/reports/collection', authenticate, async (req, res) => {
  const { fromDate, toDate, groupBy = 'day' } = req.query;
  if (!fromDate || !toDate) return sendError(res, 400, 'Date range required.');
  try {
    const tid = req.user.tenantId;
    const byMode = await db('tbl_scheme_transactions').where('Tenant_ID', tid)
      .whereRaw('DATE("Payment_Date") BETWEEN ? AND ?', [fromDate, toDate])
      .where('Txn_Type','Collection')
      .groupBy('Payment_Mode')
      .select('Payment_Mode', db.raw('COUNT(*) as count'), db.raw('SUM("Net_Amount") as total'));
    const bySource = await db('tbl_scheme_transactions').where('Tenant_ID', tid)
      .whereRaw('DATE("Payment_Date") BETWEEN ? AND ?', [fromDate, toDate])
      .where('Txn_Type','Collection')
      .groupBy('Collection_Source')
      .select('Collection_Source', db.raw('COUNT(*) as count'), db.raw('SUM("Net_Amount") as total'));
    const daily = await db('tbl_scheme_transactions').where('Tenant_ID', tid)
      .whereRaw('DATE("Payment_Date") BETWEEN ? AND ?', [fromDate, toDate])
      .where('Txn_Type','Collection')
      .groupByRaw('DATE("Payment_Date")')
      .select(db.raw('DATE("Payment_Date") as date'), db.raw('COUNT(*) as count'), db.raw('SUM("Net_Amount") as total'))
      .orderBy('date');
    const [summary] = await db('tbl_scheme_transactions').where('Tenant_ID', tid)
      .whereRaw('DATE("Payment_Date") BETWEEN ? AND ?', [fromDate, toDate])
      .where('Txn_Type','Collection')
      .select(db.raw('COUNT(*) as total_count'), db.raw('SUM("Net_Amount") as total_amount'), db.raw('SUM("Penalty_Amount") as total_penalty'));
    return sendSuccess(res, { summary, byMode, bySource, daily });
  } catch(err) { return sendError(res, 500, 'Failed.'); }
});

router.get('/reports/member-ledger/:id', authenticate, async (req, res) => {
  try {
    const member = await db('tbl_scheme_members as m').leftJoin('tbl_scheme_master as s','m.Scheme_ID','s.Scheme_ID').leftJoin('tbl_scheme_groups as g','m.Group_ID','g.Group_ID').where('m.Member_ID', req.params.id).select('m.*','s.Scheme_Name','g.Group_Name').first();
    if (!member) return sendError(res, 404, 'Not found.');
    const transactions = await db('tbl_scheme_transactions').where({ Member_ID: req.params.id }).orderBy('Payment_Date','asc');
    const pending = member.Total_Installments - member.Installments_Paid;
    const pendingAmount = pending * member.Installment_Amount;
    return sendSuccess(res, { member, transactions, summary: { paid: member.Installments_Paid, pending, paid_amount: member.Total_Amount_Paid, pending_amount: pendingAmount, maturity_value: member.Maturity_Value } });
  } catch(err) { return sendError(res, 500, 'Failed.'); }
});

router.get('/reports/overdue', authenticate, async (req, res) => {
  try {
    const overdue = await db('tbl_scheme_members as m')
      .leftJoin('tbl_scheme_groups as g','m.Group_ID','g.Group_ID')
      .where('m.Tenant_ID', req.user.tenantId)
      .where('m.Status','Active')
      .whereRaw(`(m."Total_Installments" - m."Installments_Paid") > 0`)
      .select('m.*','g.Group_Name')
      .orderBy('m.Installments_Paid');
    return sendSuccess(res, overdue);
  } catch(err) { return sendError(res, 500, 'Failed.'); }
});

router.get('/reports/maturity-due', authenticate, async (req, res) => {
  const { month } = req.query; // YYYY-MM
  const targetMonth = month || dayjs().format('YYYY-MM');
  try {
    const members = await db('tbl_scheme_members as m')
      .leftJoin('tbl_scheme_master as s','m.Scheme_ID','s.Scheme_ID')
      .leftJoin('tbl_scheme_groups as g','m.Group_ID','g.Group_ID')
      .where('m.Tenant_ID', req.user.tenantId)
      .whereRaw(`TO_CHAR("m"."Maturity_Date", 'YYYY-MM') = ?`, [targetMonth])
      .where('m.Status','Active')
      .select('m.*','s.Scheme_Name','g.Group_Name');
    return sendSuccess(res, { members, total: members.length, total_value: members.reduce((s,m) => s + parseFloat(m.Maturity_Value || 0), 0) });
  } catch(err) { return sendError(res, 500, 'Failed.'); }
});

// ════════════════════════════════════════════════════════════════════════
// NOTIFICATIONS
// ════════════════════════════════════════════════════════════════════════
async function queueNotification(tenantId, memberId, type, channel, message) {
  try {
    await db('tbl_scheme_notifications').insert({ Tenant_ID: tenantId, Member_ID: memberId, Type: type, Channel: channel, Message: message, Status: 'Pending' });
  } catch(e) { /* non-fatal */ }
}

router.post('/notify/send-reminders', authenticate, async (req, res) => {
  try {
    const tid = req.user.tenantId;
    const dueIn3Days = dayjs().add(3,'day').format('YYYY-MM-DD');
    // Find members with upcoming due date
    const dueMember = await db('tbl_scheme_members').where({ Tenant_ID: tid, Status: 'Active' }).whereRaw(`DATE("Maturity_Date") = ?`, [dueIn3Days]);
    let count = 0;
    for (const m of dueMember) {
      await queueNotification(tid, m.Member_ID, 'Due Reminder', 'WhatsApp', `Dear ${m.Member_Name}, your installment of ₹${m.Installment_Amount} is due on ${dayjs(dueIn3Days).format('DD-MMM-YYYY')}. Please pay on time.`);
      count++;
    }
    return sendSuccess(res, { reminders_queued: count }, `${count} reminders queued.`);
  } catch(err) { return sendError(res, 500, 'Failed.'); }
});

router.get('/notifications', authenticate, async (req, res) => {
  try {
    const notifs = await db('tbl_scheme_notifications').where({ Tenant_ID: req.user.tenantId }).orderBy('Created_Date','desc').limit(100);
    return sendSuccess(res, notifs);
  } catch(err) { return sendError(res, 500, 'Failed.'); }
});

// ── MATURITY REDEMPTION ────────────────────────────────────────────────────────
router.post('/members/:id/redeem', authenticate, async (req, res) => {
  const trx = await db.transaction();
  try {
    const member = await trx('tbl_scheme_members').where({ Member_ID: req.params.id, Tenant_ID: req.user.tenantId }).first();
    if (!member) { await trx.rollback(); return sendError(res, 404, 'Not found.'); }
    if (member.Status !== 'Matured') { await trx.rollback(); return sendError(res, 400, 'Member has not matured yet.'); }
    await trx('tbl_scheme_members').where('Member_ID', req.params.id).update({ Status: 'Redeemed', Redemption_Date: new Date(), Redemption_Sale_ID: req.body.Sale_ID || null });
    await trx.commit();
    return sendSuccess(res, null, 'Scheme redeemed successfully.');
  } catch(err) { await trx.rollback(); return sendError(res, 500, 'Failed.'); }
});

// ════════════════════════════════════════════════════════════════════════
// STANDALONE SCHEME ADJUSTMENT — decoupled from a live POS cart
// ════════════════════════════════════════════════════════════════════════
// POST /members/:id/adjust-invoice — same redemption POS's "🪙 Scheme
// Adjustment" card does, but against a bill that's already been created
// (search it by invoice number instead of needing an in-progress cart).
// If that invoice still owes something, this settles it; if the invoice
// was already paid in full, the amount becomes a real cash/bank refund —
// the scheme money is now covering something cash already covered.
router.post('/members/:id/adjust-invoice', authenticate, requirePermission('accounts'), [
  body('Invoice_Number').notEmpty(),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return sendValidationError(res, errors.array());
  const tid = req.user.tenantId;
  const amount = parseFloat(req.body.Amount || 0);
  const bonusAmount = parseFloat(req.body.BonusAmount || 0);
  if (amount <= 0 && bonusAmount <= 0) return sendError(res, 400, 'Enter a balance amount or bonus amount to adjust.');

  const trx = await db.transaction();
  try {
    const member = await trx('tbl_scheme_members').where({ Member_ID: req.params.id, Tenant_ID: tid }).forUpdate().first();
    if (!member) { await trx.rollback(); return sendError(res, 404, 'Member not found.'); }
    if (!['Active', 'Matured'].includes(member.Status)) {
      await trx.rollback();
      return sendError(res, 400, `${member.Member_Number}'s scheme is ${member.Status} and can't be adjusted.`);
    }

    const sale = await trx('tbl_sales_header').where({ Invoice_Number: req.body.Invoice_Number, Tenant_ID: tid }).forUpdate().first();
    if (!sale) { await trx.rollback(); return sendError(res, 404, `Invoice ${req.body.Invoice_Number} not found.`); }

    // Same eligibility rules as the live POS card — an active (not yet
    // matured) scheme can only be adjusted if the tenant's settings allow it.
    const schemeSettings = await trx('tbl_scheme_settings').where({ Tenant_ID: tid }).first();
    const isMatured = member.Status === 'Matured';
    if (!isMatured && amount > 0 && !schemeSettings?.Allow_Active_Scheme_Adjustment) {
      await trx.rollback();
      return sendError(res, 400, `${member.Member_Number} is an active (not yet matured) scheme — balance adjustment isn't enabled for active schemes.`);
    }
    if (!isMatured && bonusAmount > 0 && !schemeSettings?.Allow_Active_Scheme_Bonus) {
      await trx.rollback();
      return sendError(res, 400, `${member.Member_Number} is an active (not yet matured) scheme — bonus adjustment isn't enabled for active schemes.`);
    }

    const availableBalance = Math.max(0, parseFloat(member.Total_Amount_Paid || 0) - parseFloat(member.Amount_Redeemed || 0));
    if (amount > availableBalance + 0.01) {
      await trx.rollback();
      return sendError(res, 400, `Adjustment amount exceeds ${member.Member_Number}'s available balance (₹${availableBalance.toFixed(2)}).`);
    }

    let bonusRows = [];
    if (bonusAmount > 0) {
      bonusRows = await trx('tbl_scheme_bonuses').where({ Tenant_ID: tid, Member_ID: member.Member_ID, Is_Redeemed: false }).forUpdate();
      const availableBonus = bonusRows.reduce((s, b) => s + parseFloat(b.Bonus_Amount || 0), 0);
      if (bonusAmount > availableBonus + 0.01) {
        await trx.rollback();
        return sendError(res, 400, `Bonus adjustment exceeds ${member.Member_Number}'s available bonus (₹${availableBonus.toFixed(2)}).`);
      }
    }

    // Split: whatever the invoice still owes gets settled first; anything
    // left over is a real refund.
    const currentBalanceOwed = Math.max(0, parseFloat(sale.Balance_Amount || 0));
    const netAdjustment = round2(amount + bonusAmount);
    const appliedToInvoice = Math.min(netAdjustment, currentBalanceOwed);
    const refundAmount = round2(netAdjustment - appliedToInvoice);

    if (refundAmount > 0 && !req.body.Refund_Mode) {
      await trx.rollback();
      return sendError(res, 400, `Invoice ${sale.Invoice_Number} is already settled — ₹${refundAmount.toFixed(2)} of this adjustment would be a refund. Choose a Refund_Mode (Cash/Bank) to continue.`);
    }

    // ── Apply the redemption to the member (identical bookkeeping to the live POS flow) ──
    let remainingBonus = bonusAmount;
    for (const b of bonusRows) {
      if (remainingBonus <= 0.01) break;
      await trx('tbl_scheme_bonuses').where({ Bonus_ID: b.Bonus_ID }).update({ Is_Redeemed: true, Redemption_Date: new Date() });
      remainingBonus -= parseFloat(b.Bonus_Amount || 0);
    }
    const newAmountRedeemed = round2(parseFloat(member.Amount_Redeemed || 0) + amount);
    const newAvailableBalance = Math.max(0, round2(parseFloat(member.Total_Amount_Paid || 0) - newAmountRedeemed));
    const remainingBonusRows = bonusAmount > 0
      ? await trx('tbl_scheme_bonuses').where({ Tenant_ID: tid, Member_ID: member.Member_ID, Is_Redeemed: false }).count('Bonus_ID as c').first()
      : { c: 0 };
    const shouldClose = isMatured && newAvailableBalance <= 0.01 && parseInt(remainingBonusRows.c || 0) === 0;
    const memberUpdate = { Amount_Redeemed: newAmountRedeemed, Modified_Date: new Date() };
    if (shouldClose) { memberUpdate.Status = 'Redeemed'; memberUpdate.Redemption_Date = new Date(); memberUpdate.Redemption_Sale_ID = sale.Sale_ID; }
    await trx('tbl_scheme_members').where('Member_ID', member.Member_ID).update(memberUpdate);

    // ── Update the invoice itself ────────────────────────────────────────────
    if (appliedToInvoice > 0) {
      const newBalance = round2(currentBalanceOwed - appliedToInvoice);
      await trx('tbl_sales_header').where('Sale_ID', sale.Sale_ID).update({
        Balance_Amount: newBalance,
        Amount_Paid: round2(parseFloat(sale.Amount_Paid || 0) + appliedToInvoice),
        Scheme_Adjustment_Amount: round2(parseFloat(sale.Scheme_Adjustment_Amount || 0) + appliedToInvoice),
        Payment_Status: newBalance <= 0.01 ? 'Paid' : 'Partial',
      });
      await trx('tbl_sales_payments').insert({
        Sale_ID: sale.Sale_ID, Tenant_ID: tid, Payment_Mode: 'Scheme Adjustment', Amount: appliedToInvoice,
        Reference: member.Member_Number, Scheme_Enrollment_ID: member.Member_ID, Created_By: req.user.username, Data_Mode: modeVal(req),
      });
    }

    const schemeVoucherNumber = await generateSchemeAdjustmentNumber(tid);
    const [txn] = await trx('tbl_scheme_transactions').insert({
      Tenant_ID: tid, Receipt_Number: schemeVoucherNumber, Member_ID: member.Member_ID, Tenant_Member_No: member.Member_Number,
      Txn_Type: 'Adjustment', Installment_No: 0, Amount: netAdjustment, Net_Amount: netAdjustment,
      Payment_Mode: 'Scheme Adjustment', Payment_Reference: sale.Invoice_Number, Collection_Source: 'Counter', Collected_By: req.user.userId,
      Notes: req.body.Reason || `Post-hoc adjustment against invoice ${sale.Invoice_Number}`, Created_By: req.user.username,
    }).returning('*');

    // Shadow audit row — Debit_Account reflects whichever liability was
    // actually drawn down (bonus redemptions draw the Provision account,
    // not the main deposit account; a mixed adjustment isn't perfectly
    // representable as one Dr/Cr pair here, so this picks the larger side —
    // the real ledger posting below is always the accurate one).
    await trx('tbl_scheme_accounting_entries').insert({
      Tenant_ID: tid, Txn_ID: txn.Txn_ID, Entry_Date: new Date(), Receipt_No: schemeVoucherNumber, Member_ID: member.Member_ID,
      Debit_Account: bonusAmount > amount ? 'Scheme Bonus Provision Account' : 'Customer Scheme Deposit Account',
      Credit_Account: refundAmount > 0 && appliedToInvoice === 0 ? 'Cash Account' : 'Customer Receivable Account', Amount: netAdjustment,
      Narration: `Scheme adjustment (post-hoc) | ${member.Member_Number} | ${sale.Invoice_Number}`, Created_By: req.user.username,
    }).catch(() => {});

    await trx.commit();

    // ── Post to the real ledger — awaited (see /collect's own comment above for why) ──
    await (async () => {
      const lines = [];
      if (amount > 0) lines.push({ account: 'Customer Scheme Deposit Account', group: 'Liabilities', sub: 'Advance', type: 'Dr', amount });
      if (bonusAmount > 0) lines.push({ account: 'Scheme Bonus Provision Account', group: 'Liabilities', sub: 'Provision', type: 'Dr', amount: bonusAmount });
      // NOT "Sales Account" — the invoice's full value was already credited
      // there at the time of the original sale (any unpaid remainder was
      // booked to Customer Receivable Account instead, per sales.js's own
      // "Customer Receivable" synthetic payment line). Settling that
      // remainder now draws down the receivable, exactly like a later cash
      // Receipt would — crediting Sales Account again would double-book revenue.
      if (appliedToInvoice > 0) lines.push({ account: 'Customer Receivable Account', group: 'Assets', sub: 'Receivable', type: 'Cr', amount: appliedToInvoice });
      if (refundAmount > 0) {
        const refundLedger = await resolveLedgerForPayment(db, tid, req.body.Refund_Mode, req.body.Bank_Account_ID);
        lines.push({ account: refundLedger.account, group: refundLedger.group, sub: refundLedger.sub, type: 'Cr', amount: refundAmount });
      }
      if (lines.length) {
        await postJournal({
          tenantId: tid, sourceType: 'JOURNAL', reference: schemeVoucherNumber, branchId: sale.Branch_ID,
          narration: `Scheme adjustment (post-hoc) | ${member.Member_Number} | ${sale.Invoice_Number}`, createdBy: req.user.username,
          lines,
        });
      }
    })().catch((err) => console.error('[SavingsScheme] adjust-invoice ledger post failed:', err.message));

    return sendSuccess(res, {
      receipt_number: schemeVoucherNumber, applied_to_invoice: appliedToInvoice, refund_amount: refundAmount,
      invoice_balance_remaining: round2(currentBalanceOwed - appliedToInvoice),
    }, refundAmount > 0
      ? `₹${appliedToInvoice.toFixed(2)} adjusted against the invoice; ₹${refundAmount.toFixed(2)} refunded.`
      : `₹${appliedToInvoice.toFixed(2)} adjusted against invoice ${sale.Invoice_Number}.`, 201);
  } catch (err) {
    await trx.rollback();
    console.error('Adjust-invoice error:', err.message);
    return sendError(res, 500, `Adjustment failed: ${err.message}`);
  }
});

// POST /members/:id/foreclose — a customer stopping their scheme BEFORE it
// matures. Unlike DELETE /members/:id (a bare status flip with no money
// movement, kept as-is for simple zero-balance closures), this actually
// settles what's owed: staff manually enters a deduction (early-exit
// penalty, kept as the business's income) and/or a discretionary bonus,
// then either pays out the net amount in cash/bank or applies it against
// a sale invoice — same mechanism as adjust-invoice above.
router.post('/members/:id/foreclose', authenticate, requirePermission('accounts'), [
  body('Settlement_Mode').isIn(['Cash', 'Bank', 'Adjustment']),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return sendValidationError(res, errors.array());
  const tid = req.user.tenantId;
  const deduction = parseFloat(req.body.Deduction_Amount || 0);
  const bonus = parseFloat(req.body.Bonus_Amount || 0);
  if (req.body.Settlement_Mode === 'Adjustment' && !req.body.Invoice_Number) {
    return sendError(res, 400, 'Invoice_Number is required when settling by Adjustment.');
  }
  if (req.body.Settlement_Mode === 'Bank' && !req.body.Bank_Account_ID) {
    return sendError(res, 400, 'Bank_Account_ID is required when settling by Bank.');
  }

  const trx = await db.transaction();
  try {
    const member = await trx('tbl_scheme_members').where({ Member_ID: req.params.id, Tenant_ID: tid }).forUpdate().first();
    if (!member) { await trx.rollback(); return sendError(res, 404, 'Member not found.'); }
    if (member.Status !== 'Active') {
      await trx.rollback();
      return sendError(res, 400, `${member.Member_Number}'s scheme is ${member.Status}, not Active — foreclosure is only for stopping an in-progress scheme early. A Matured scheme should be redeemed/adjusted normally instead.`);
    }

    const availableBalance = round2(Math.max(0, parseFloat(member.Total_Amount_Paid || 0) - parseFloat(member.Amount_Redeemed || 0)));
    if (deduction > availableBalance + 0.01) {
      await trx.rollback();
      return sendError(res, 400, `Deduction (₹${deduction.toFixed(2)}) can't exceed the amount actually collected so far (₹${availableBalance.toFixed(2)}).`);
    }
    const netPayout = round2(availableBalance - deduction + bonus);
    if (netPayout < 0) { await trx.rollback(); return sendError(res, 400, 'This would result in a negative payout — check the deduction/bonus amounts.'); }

    let sale = null;
    let appliedToInvoice = 0;
    let refundAmount = netPayout;
    if (req.body.Settlement_Mode === 'Adjustment') {
      sale = await trx('tbl_sales_header').where({ Invoice_Number: req.body.Invoice_Number, Tenant_ID: tid }).forUpdate().first();
      if (!sale) { await trx.rollback(); return sendError(res, 404, `Invoice ${req.body.Invoice_Number} not found.`); }
      const currentBalanceOwed = Math.max(0, parseFloat(sale.Balance_Amount || 0));
      appliedToInvoice = Math.min(netPayout, currentBalanceOwed);
      refundAmount = round2(netPayout - appliedToInvoice);
      if (appliedToInvoice > 0) {
        const newBalance = round2(currentBalanceOwed - appliedToInvoice);
        await trx('tbl_sales_header').where('Sale_ID', sale.Sale_ID).update({
          Balance_Amount: newBalance,
          Amount_Paid: round2(parseFloat(sale.Amount_Paid || 0) + appliedToInvoice),
          Scheme_Adjustment_Amount: round2(parseFloat(sale.Scheme_Adjustment_Amount || 0) + appliedToInvoice),
          Payment_Status: newBalance <= 0.01 ? 'Paid' : 'Partial',
        });
        await trx('tbl_sales_payments').insert({
          Sale_ID: sale.Sale_ID, Tenant_ID: tid, Payment_Mode: 'Scheme Adjustment', Amount: appliedToInvoice,
          Reference: member.Member_Number, Scheme_Enrollment_ID: member.Member_ID, Created_By: req.user.username, Data_Mode: modeVal(req),
        });
      }
    }

    await trx('tbl_scheme_members').where('Member_ID', member.Member_ID).update({
      Status: 'Closed', Closure_Reason: (req.body.Reason || 'Foreclosed before maturity').slice(0, 200),
      Amount_Redeemed: parseFloat(member.Total_Amount_Paid || 0), // the whole collected amount is now accounted for — paid out, adjusted, or kept as deduction income
      Redemption_Date: new Date(), Redemption_Sale_ID: sale?.Sale_ID || null, Modified_Date: new Date(),
    });

    const schemeVoucherNumber = await generateSchemeAdjustmentNumber(tid);
    const [txn] = await trx('tbl_scheme_transactions').insert({
      Tenant_ID: tid, Receipt_Number: schemeVoucherNumber, Member_ID: member.Member_ID, Tenant_Member_No: member.Member_Number,
      Txn_Type: 'Foreclosure', Installment_No: 0, Amount: availableBalance, Penalty_Amount: deduction, Net_Amount: netPayout,
      Payment_Mode: req.body.Settlement_Mode, Payment_Reference: sale?.Invoice_Number || null, Collection_Source: 'Counter', Collected_By: req.user.userId,
      Notes: req.body.Reason || 'Foreclosed before maturity', Created_By: req.user.username,
    }).returning('*');

    await trx('tbl_scheme_accounting_entries').insert({
      Tenant_ID: tid, Txn_ID: txn.Txn_ID, Entry_Date: new Date(), Receipt_No: schemeVoucherNumber, Member_ID: member.Member_ID,
      Debit_Account: 'Customer Scheme Deposit Account',
      Credit_Account: req.body.Settlement_Mode === 'Adjustment' ? 'Customer Receivable Account' : (req.body.Settlement_Mode === 'Bank' ? 'Bank Account (Unassigned — pre-dates per-bank ledgers)' : 'Cash Account'),
      Amount: availableBalance, Narration: `Scheme foreclosure | ${member.Member_Number} | ${req.body.Reason || 'early closure'}`, Created_By: req.user.username,
    }).catch(() => {});

    await trx.commit();

    // ── Post to the real ledger — awaited (see /collect's own comment above for why) ──
    await (async () => {
      const lines = [
        { account: 'Customer Scheme Deposit Account', group: 'Liabilities', sub: 'Advance', type: 'Dr', amount: availableBalance },
      ];
      if (bonus > 0) lines.push({ account: 'Scheme Bonus Expense Account', group: 'Expenses', sub: 'Indirect Expense', type: 'Dr', amount: bonus });
      if (deduction > 0) lines.push({ account: 'Scheme Foreclosure Income Account', group: 'Income', sub: 'Indirect Income', type: 'Cr', amount: deduction });
      // Same reasoning as adjust-invoice above — draws down the existing
      // receivable, doesn't re-credit Sales Account (already booked at sale time).
      if (appliedToInvoice > 0) lines.push({ account: 'Customer Receivable Account', group: 'Assets', sub: 'Receivable', type: 'Cr', amount: appliedToInvoice });
      if (refundAmount > 0) {
        const payoutLedger = await resolveLedgerForPayment(db, tid, req.body.Settlement_Mode === 'Bank' ? 'Bank Transfer' : 'Cash', req.body.Bank_Account_ID);
        lines.push({ account: payoutLedger.account, group: payoutLedger.group, sub: payoutLedger.sub, type: 'Cr', amount: refundAmount });
      }
      await postJournal({
        // sale is only set for Settlement_Mode === 'Adjustment' — a pure
        // Cash/Bank payout has no invoice to inherit a branch from, and
        // tbl_scheme_members/tbl_scheme_groups have no Branch_ID at all,
        // so there's genuinely no real branch signal to stamp in that
        // case (left null/tenant-wide rather than guessed).
        tenantId: tid, sourceType: 'JOURNAL', reference: schemeVoucherNumber, branchId: sale?.Branch_ID || null,
        narration: `Scheme foreclosure | ${member.Member_Number} | ${req.body.Reason || 'early closure'}`, createdBy: req.user.username,
        lines,
      });
    })().catch((err) => console.error('[SavingsScheme] foreclose ledger post failed:', err.message));

    return sendSuccess(res, {
      receipt_number: schemeVoucherNumber, available_balance: availableBalance, deduction, bonus, net_payout: netPayout,
      applied_to_invoice: appliedToInvoice, refund_amount: refundAmount,
    }, `${member.Member_Number}'s scheme foreclosed — ₹${netPayout.toFixed(2)} settled.`, 201);
  } catch (err) {
    await trx.rollback();
    console.error('Foreclose error:', err.message);
    return sendError(res, 500, `Foreclosure failed: ${err.message}`);
  }
});

// ════════════════════════════════════════════════════════════════════════
// AGENT MASTER — CRUD (ERP Admin creates agents; agents login via mobile OTP)
// ════════════════════════════════════════════════════════════════════════

// ── Agent Code Generator ──────────────────────────────────────────────────────
// Agent_Code has a GLOBAL unique constraint (not scoped per tenant), but
// this used to generate "AGT-01001", "AGT-01002", ... from only THIS
// tenant's own agent count — so any two tenants' first agent collided on
// "AGT-01001" and failed outright (confirmed for real: DLJ already held
// "AGT1" from the OTHER agent-creation path before this fix, and this
// one would have collided the same way the moment a second tenant used
// it). Prefixing with the tenant ID makes it actually unique.
const genAgentCode = async (tenantId) => {
  const last = await db('tbl_agent_master')
    .where('Tenant_ID', tenantId)
    .orderBy('Agent_ID', 'desc').first();
  const seq = last ? parseInt((last.Agent_Code || '').replace(/\D/g, '')) + 1 : 1001;
  return `AGT-${tenantId.replace('_', '')}-${String(seq).padStart(5, '0')}`;
};

// GET /api/savings/agents — list all agents for tenant
router.get('/agents', authenticate, async (req, res) => {
  const { status, branchId, search, page = 1, limit = 50 } = req.query;
  try {
    let qb = db('tbl_agent_master')
      .where('Tenant_ID', req.user.tenantId);
    if (status)   qb = qb.where('Status', status);
    if (branchId) qb = qb.where('Branch_ID', branchId);
    if (search)   qb = qb.where(function () {
      this.where('Agent_Name', 'ilike', `%${search}%`)
        .orWhere('Mobile', 'like', `%${search}%`)
        .orWhere('Agent_Code', 'ilike', `%${search}%`);
    });
    const [{ count }] = await db('tbl_agent_master').where('Tenant_ID', req.user.tenantId).count('Agent_ID as count');
    const data = await qb
      .orderBy('Created_Date', 'desc')
      .limit(parseInt(limit))
      .offset((parseInt(page) - 1) * parseInt(limit));
    return sendSuccess(res, { items: data, total: parseInt(count) });
  } catch (err) { console.error(err); return sendError(res, 500, 'Failed to fetch agents.'); }
});

// GET /api/savings/agents/:id — single agent + their collection summary
router.get('/agents/:id', authenticate, async (req, res) => {
  try {
    const agent = await db('tbl_agent_master')
      .where({ Agent_ID: req.params.id, Tenant_ID: req.user.tenantId })
      .first();
    if (!agent) return sendError(res, 404, 'Agent not found.');

    // Collection stats
    const [stats] = await db('tbl_scheme_transactions')
      .where({ Tenant_ID: req.user.tenantId, Agent_Code: agent.Agent_Code, Txn_Type: 'Collection' })
      .sum('Net_Amount as totalCollected')
      .count('Txn_ID as totalTransactions');

    const today = dayjs().format('YYYY-MM-DD');
    const [todayStats] = await db('tbl_scheme_transactions')
      .where({ Tenant_ID: req.user.tenantId, Agent_Code: agent.Agent_Code, Txn_Type: 'Collection' })
      .whereRaw('DATE("Payment_Date") = ?', [today])
      .sum('Net_Amount as todayAmount')
      .count('Txn_ID as todayCount');

    return sendSuccess(res, {
      agent,
      stats: {
        totalCollected:    parseFloat(stats?.totalCollected || 0),
        totalTransactions: parseInt(stats?.totalTransactions || 0),
        todayAmount:       parseFloat(todayStats?.todayAmount || 0),
        todayCount:        parseInt(todayStats?.todayCount || 0),
      },
    });
  } catch (err) { return sendError(res, 500, 'Failed.'); }
});

// POST /api/savings/agents — create agent (ERP admin only)
router.post('/agents', authenticate, [
  body('Agent_Name').trim().notEmpty().withMessage('Agent name required.'),
  body('Mobile').trim().matches(/^\d{10}$/).withMessage('Valid 10-digit mobile required.'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return sendValidationError(res, errors.array());
  try {
    const tid = req.user.tenantId;

    // Check duplicate mobile within tenant
    const existing = await db('tbl_agent_master').where({ Tenant_ID: tid, Mobile: req.body.Mobile }).first();
    if (existing) return sendError(res, 409, 'Mobile number already registered as agent.');

    const agentCode = req.body.Agent_Code || await genAgentCode(tid);
    const [agent] = await db('tbl_agent_master').insert({
      ...req.body,
      Tenant_ID:   tid,
      Agent_Code:  agentCode,
      Status:      req.body.Status || 'Active',
      Created_By:  req.user.username,
    }).returning('*');

    return sendSuccess(res, agent, 'Agent created successfully.', 201);
  } catch (err) {
    if (err.code === '23505') return sendError(res, 409, 'Agent code already exists.');
    console.error(err);
    return sendError(res, 500, 'Failed to create agent.');
  }
});

// PUT /api/savings/agents/:id — update agent
router.put('/agents/:id', authenticate, async (req, res) => {
  try {
    const [agent] = await db('tbl_agent_master')
      .where({ Agent_ID: req.params.id, Tenant_ID: req.user.tenantId })
      .update({ ...req.body, Modified_Date: new Date() })
      .returning('*');
    if (!agent) return sendError(res, 404, 'Agent not found.');
    return sendSuccess(res, agent, 'Agent updated.');
  } catch (err) { return sendError(res, 500, 'Failed.'); }
});

// DELETE /api/savings/agents/:id — deactivate (soft delete)
router.delete('/agents/:id', authenticate, async (req, res) => {
  try {
    await db('tbl_agent_master')
      .where({ Agent_ID: req.params.id, Tenant_ID: req.user.tenantId })
      .update({ Status: 'Inactive', Modified_Date: new Date() });
    return sendSuccess(res, null, 'Agent deactivated.');
  } catch (err) { return sendError(res, 500, 'Failed.'); }
});

// GET /api/savings/agents/:id/report — agent collection report
router.get('/agents/:id/report', authenticate, async (req, res) => {
  const { fromDate, toDate, page = 1, limit = 50 } = req.query;
  try {
    const agent = await db('tbl_agent_master')
      .where({ Agent_ID: req.params.id, Tenant_ID: req.user.tenantId })
      .first();
    if (!agent) return sendError(res, 404, 'Agent not found.');

    let qb = db('tbl_scheme_transactions as t')
      .leftJoin('tbl_scheme_members as m', 't.Member_ID', 'm.Member_ID')
      .where({ 't.Tenant_ID': req.user.tenantId, 't.Agent_Code': agent.Agent_Code, 't.Txn_Type': 'Collection' })
      .select(
        't.Txn_ID', 't.Receipt_Number', 't.Payment_Date', 't.Net_Amount',
        't.Payment_Mode', 't.Installment_No as Installment_Number', 't.Notes',
        'm.Member_Name', 'm.Mobile', 'm.Member_Number',
      );

    if (fromDate) qb = qb.whereRaw('DATE("t"."Payment_Date") >= ?', [fromDate]);
    if (toDate)   qb = qb.whereRaw('DATE("t"."Payment_Date") <= ?', [toDate]);

    const [{ count }] = await qb.clone().clearSelect().count('t.Txn_ID as count');
    const [{ total }] = await qb.clone().clearSelect().sum('t.Net_Amount as total');
    const rows = await qb
      .orderBy('t.Payment_Date', 'desc')
      .limit(parseInt(limit))
      .offset((parseInt(page) - 1) * parseInt(limit));

    return sendSuccess(res, {
      agent: { agentId: agent.Agent_ID, agentCode: agent.Agent_Code, agentName: agent.Agent_Name },
      summary: { totalAmount: parseFloat(total || 0), totalCount: parseInt(count || 0) },
      items: rows,
      total: parseInt(count || 0),
    });
  } catch (err) { console.error(err); return sendError(res, 500, 'Failed.'); }
});

module.exports = router;
