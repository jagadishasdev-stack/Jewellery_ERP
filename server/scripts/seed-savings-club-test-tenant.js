/**
 * One-time demo-data seed for the Savings Club module (the live
 * /api/savings module — tbl_scheme_master/groups/members/transactions/
 * bonuses/pdc/draws — NOT the dead tbl_saving_scheme_master table),
 * scoped to TEST_TENANT (an explicitly designated throwaway tenant).
 *
 * Everything here goes through the REAL API routes (never raw inserts),
 * so every code path's own business logic AND accounting posting runs
 * exactly as it would for a real user — installment collections, bonus
 * accrual on maturity, Digi Gold's distinct liability ledger, PDC,
 * a lucky draw, a post-hoc scheme-to-invoice adjustment, and a
 * foreclosure settled against an invoice.
 *
 * Run once: `node scripts/seed-savings-club-test-tenant.js`
 */
process.env.NODE_ENV = 'development';
const request = require('supertest');
const { app } = require('../src/index');
const db = require('../src/db/knex');

const TENANT_ID = 'TEST_TENANT';
const USERNAME = 'test_admin';
const PASSWORD = 'TestTenant@2026';

let token;
const auth = () => ({ Authorization: `Bearer ${token}` });
const api = () => request(app);

async function must(promise, label) {
  const res = await promise;
  if (res.status >= 400) {
    console.error(`FAILED: ${label} ->`, res.status, JSON.stringify(res.body));
    throw new Error(`${label} failed with ${res.status}`);
  }
  console.log(`OK: ${label} -> ${res.status}`);
  return res.body.data;
}

(async () => {
  try {
    const login = await api().post('/api/auth/login').send({ username: USERNAME, password: PASSWORD, tenantId: TENANT_ID });
    if (login.status !== 200) throw new Error('Login failed: ' + JSON.stringify(login.body));
    token = login.body.data.token;
    console.log('Logged in as', USERNAME, '@', TENANT_ID);

    // ── 1. Enable active-scheme adjustment/bonus (so we can demo that path too, not just matured) ──
    await must(api().put('/api/savings/scheme-settings').set(auth()).send({
      Allow_Active_Scheme_Adjustment: true, Allow_Active_Scheme_Bonus: true,
    }), 'Enable active-scheme adjustment settings');

    // ── 2. Second collection agent (there was already 1 — this gives the agent report real variety) ──
    const agent2 = await must(api().post('/api/savings/agents').set(auth()).send({
      Agent_Name: 'Priya Collection Agent', Mobile: '9900011122', Commission_Pct: 1.5,
    }), 'Create second agent (Priya)');

    // ── 3. Activate the Digi Gold scheme (Scheme_ID 182 — DIGIGOLD1) with a real group ──
    // Draw_Applicable and Bonus_Amount are only settable at creation — the
    // PUT /groups/:id route only allows Name/Image/Terms/Status/Bonus_Amount,
    // not Draw_Applicable, so this can't be added after the fact.
    const digiGroup = await must(api().post('/api/savings/groups').set(auth()).send({
      Scheme_ID: 182, Group_Code: 'DIGIGOLD1-2026', Group_Name: 'Digi Gold Flexi — 2026 Batch',
      Start_Date: '2026-01-01', Monthly_Amount: 3000, Total_Installments: 12,
      Member_Limit: 100, Bonus_Amount: 500, Draw_Applicable: true,
    }), 'Create Digi Gold group');

    // ── 4. Three new customers to enroll as scheme members ──
    const customers = [];
    for (const c of [
      { Customer_Name: 'Farida Khan', Mobile_1: '9845077701' },
      { Customer_Name: 'Arjun Nayak', Mobile_1: '9845077702' },
      { Customer_Name: 'Meena Iyer', Mobile_1: '9845077703' },
    ]) {
      customers.push(await must(api().post('/api/customers').set(auth()).send(c), `Create customer ${c.Customer_Name}`));
    }

    // ── 5a. Member A — Digi Gold, agent-referred, will complete ALL 12 installments
    //        (Matured + Digi Gold Liability ledger + Digi Gold bonus accrual) ──
    const memberA = await must(api().post('/api/savings/members').set(auth()).send({
      Member_Name: 'Farida Khan', Mobile: '9845077701', Customer_ID: customers[0].Customer_ID,
      Scheme_ID: 182, Group_ID: digiGroup.Group_ID, Joining_Date: '2026-01-05',
      Installment_Amount: 3000, Join_Source: 'Agent',
    }), 'Enroll Member A (Farida, Digi Gold)');

    const modesA = ['Cash', 'UPI', 'Cheque', 'Cash', 'UPI', 'Cash', 'Cheque', 'Cash', 'UPI', 'Cash', 'Cash', 'UPI'];
    for (let i = 0; i < 12; i++) {
      await must(api().post('/api/savings/collect').set(auth()).send({
        Member_ID: memberA.Member_ID, Amount: 3000, Payment_Mode: modesA[i], Agent_Code: agent2.Agent_Code,
        Collection_Source: 'Agent',
      }), `Farida installment ${i + 1}/12 (${modesA[i]})`);
    }

    // ── 5b. Member B — Digi Gold, counter, only 4/12 (stays Active — feeds overdue/dashboard) ──
    const memberB = await must(api().post('/api/savings/members').set(auth()).send({
      Member_Name: 'Arjun Nayak', Mobile: '9845077702', Customer_ID: customers[1].Customer_ID,
      Scheme_ID: 182, Group_ID: digiGroup.Group_ID, Joining_Date: '2026-01-10',
      Installment_Amount: 3000, Join_Source: 'Counter',
    }), 'Enroll Member B (Arjun, Digi Gold)');
    for (let i = 0; i < 4; i++) {
      await must(api().post('/api/savings/collect').set(auth()).send({
        Member_ID: memberB.Member_ID, Amount: 3000, Payment_Mode: 'Cash', Collection_Source: 'Counter',
      }), `Arjun installment ${i + 1}/12`);
    }

    // ── 5c. Member C — Gold11 (existing MAR26 group), agent-referred, 3/11, then FORECLOSED
    //        via Settlement_Mode='Adjustment' against a real invoice (the one foreclosure-
    //        via-Adjustment code path not yet exercised on this tenant). ──
    const memberC = await must(api().post('/api/savings/members').set(auth()).send({
      Member_Name: 'Meena Iyer', Mobile: '9845077703', Customer_ID: customers[2].Customer_ID,
      Scheme_ID: 181, Group_ID: 182, Joining_Date: '2026-02-01',
      Installment_Amount: 2000, Join_Source: 'Agent',
    }), 'Enroll Member C (Meena, Gold11)');
    for (let i = 0; i < 3; i++) {
      await must(api().post('/api/savings/collect').set(auth()).send({
        Member_ID: memberC.Member_ID, Amount: 2000, Payment_Mode: 'UPI', Agent_Code: agent2.Agent_Code,
        Collection_Source: 'Agent',
      }), `Meena installment ${i + 1}/11`);
    }

    // A real invoice to foreclose Meena's scheme against — reuse an existing
    // in-stock ornament rather than fabricating a new one.
    const ornament = await db('tbl_ornament_master').where({ Tenant_ID: TENANT_ID, Is_Sold: false, Is_Active: true, Is_Stock_Available: true }).orderBy('Ornament_ID').first();
    if (!ornament) throw new Error('No available ornament in TEST_TENANT to build a demo invoice from.');
    const saleC = await must(api().post('/api/sales/create').set(auth()).send({
      Customer_ID: customers[2].Customer_ID, Customer_Name: 'Meena Iyer', Customer_Mobile: '9845077703',
      Payment_Mode: 'Cash', Amount_Paid: 0, Subtotal_Amount: parseFloat(ornament.Total_Price),
      Net_Payable_Amount: parseFloat(ornament.Total_Price), Balance_Amount: parseFloat(ornament.Total_Price),
      items: [{ Ornament_ID: ornament.Ornament_ID, Article_Number: ornament.Article_Number, Total_Line_Price: parseFloat(ornament.Total_Price) }],
    }), 'Create invoice for Meena (to foreclose against)');

    await must(api().post(`/api/savings/members/${memberC.Member_ID}/foreclose`).set(auth()).send({
      Settlement_Mode: 'Adjustment', Invoice_Number: saleC.sale.Invoice_Number,
      Deduction_Amount: 100, Reason: 'Customer needed funds sooner than planned',
    }), 'Foreclose Meena against her invoice');

    // ── 6. Adjust-invoice: redeem the EXISTING matured member (Ganesh Bhat, #183,
    //      never yet redeemed) against a fresh invoice — the post-hoc code path.
    //      The first ornament is already sold (Meena's invoice above), so this
    //      needs a second available one. ──
    const ornament2 = await db('tbl_ornament_master').where({ Tenant_ID: TENANT_ID, Is_Sold: false, Is_Active: true, Is_Stock_Available: true }).whereNot('Ornament_ID', ornament.Ornament_ID).orderBy('Ornament_ID').first();
    if (!ornament2) throw new Error('No second available ornament in TEST_TENANT for Ganesh\'s demo invoice.');
    const saleGanesh = await must(api().post('/api/sales/create').set(auth()).send({
      Customer_Name: 'Ganesh Bhat', Customer_Mobile: '9900000001',
      Payment_Mode: 'Cash', Amount_Paid: 0, Subtotal_Amount: parseFloat(ornament2.Total_Price),
      Net_Payable_Amount: parseFloat(ornament2.Total_Price), Balance_Amount: parseFloat(ornament2.Total_Price),
      items: [{ Ornament_ID: ornament2.Ornament_ID, Article_Number: ornament2.Article_Number, Total_Line_Price: parseFloat(ornament2.Total_Price) }],
    }), 'Create invoice for Ganesh Bhat (to adjust scheme balance against)');

    await must(api().post('/api/savings/members/183/adjust-invoice').set(auth()).send({
      Invoice_Number: saleGanesh.sale.Invoice_Number, Amount: 22000, Refund_Mode: 'Cash',
      Reason: 'Redeeming matured Gold Savings scheme against new purchase',
    }), 'Adjust Ganesh Bhat\'s matured balance against his invoice (partial settlement + cash refund of the rest)');

    // ── 7. PDC variety — one already existed (Pending); add Deposited + Bounced ──
    const pdc1 = await must(api().post('/api/savings/pdc').set(auth()).send({
      Member_ID: memberB.Member_ID, Bank_Name: 'HDFC Bank', Cheque_Number: '000451',
      Amount: 3000, Cheque_Date: '2026-09-10',
    }), 'PDC for Arjun');
    await must(api().put(`/api/savings/pdc/${pdc1.PDC_ID}/status`).set(auth()).send({ status: 'Deposited' }), 'Mark Arjun PDC Deposited');

    const pdc2 = await must(api().post('/api/savings/pdc').set(auth()).send({
      Member_ID: memberA.Member_ID, Bank_Name: 'ICICI Bank', Cheque_Number: '000452',
      Amount: 3000, Cheque_Date: '2026-06-15',
    }), 'PDC for Farida');
    await must(api().put(`/api/savings/pdc/${pdc2.PDC_ID}/status`).set(auth()).send({ status: 'Bounced', bounce_charge: 250, remarks: 'Insufficient funds' }), 'Mark Farida PDC Bounced');

    // ── 8. Lucky draw on the Digi Gold group (Farida + Arjun both eligible) ──
    await must(api().post('/api/savings/draw/conduct').set(auth()).send({
      Scheme_ID: 182, Group_ID: digiGroup.Group_ID, Draw_Type: 'Monthly',
      Draw_Name: 'Digi Gold — August Lucky Draw', Prize_Type: 'Cash',
      Prize_Value: 1000, Prize_Description: '₹1,000 cash prize',
    }), 'Conduct Digi Gold lucky draw');

    // ══════════════════════════════════════════════════════════════════════
    // VERIFICATION — pull every report the module exposes, plus the
    // accounting side, and print it all so it's actually checkable.
    // ══════════════════════════════════════════════════════════════════════
    console.log('\n========== VERIFICATION ==========\n');

    const dashboard = await must(api().get('/api/savings/dashboard').set(auth()), 'GET dashboard');
    console.log('Dashboard:', JSON.stringify(dashboard, null, 2));

    const today = require('dayjs')().format('YYYY-MM-DD');
    const monthStart = require('dayjs')().startOf('month').format('YYYY-MM-DD');
    const collectionReport = await must(api().get('/api/savings/reports/collection').set(auth()).query({ fromDate: '2026-01-01', toDate: today }), 'GET collection report');
    console.log('Collection report summary:', JSON.stringify(collectionReport.summary));
    console.log('Collection report byMode:', JSON.stringify(collectionReport.byMode));
    console.log('Collection report bySource:', JSON.stringify(collectionReport.bySource));

    const overdue = await must(api().get('/api/savings/reports/overdue').set(auth()), 'GET overdue report');
    console.log('Overdue members:', overdue.length);

    const maturityDue = await must(api().get('/api/savings/reports/maturity-due').set(auth()).query({ month: '2027-01' }), 'GET maturity-due report');
    console.log('Maturity due (2027-01):', maturityDue.length);

    const ledgerFarida = await must(api().get(`/api/savings/reports/member-ledger/${memberA.Member_ID}`).set(auth()), 'GET Farida member ledger');
    console.log('Farida ledger summary:', JSON.stringify(ledgerFarida.summary));

    const agentReport = await must(api().get(`/api/savings/agents/${agent2.Agent_ID}/report`).set(auth()), 'GET Priya\'s agent report');
    console.log('Priya agent report summary:', JSON.stringify(agentReport.summary));

    const drawHistory = await must(api().get('/api/savings/draw/history').set(auth()), 'GET draw history');
    console.log('Draw history count:', drawHistory.length, '- winner:', drawHistory[0]?.Member_Name);

    const pdcList = await must(api().get('/api/savings/pdc').set(auth()), 'GET PDC list');
    console.log('PDC entries:', pdcList.length, pdcList.map((p) => `${p.Member_Name}:${p.Status}`));

    // ── Accounting side ──
    const trialBalance = await must(api().get('/api/accounting/trial-balance').set(auth()), 'GET trial balance');
    const schemeLines = (trialBalance.lines || trialBalance).filter?.((l) =>
      /Scheme|Digi Gold/i.test(l.Account_Name || l.account || '')) || [];
    console.log('Trial balance scheme-related lines:', JSON.stringify(schemeLines));

    const schemeAdjustments = await must(api().get('/api/reports/scheme-adjustments').set(auth()).query({ fromDate: '2026-01-01', toDate: '2027-12-31' }).catch((e) => e), 'GET scheme-adjustments report');
    console.log('Scheme adjustments report:', JSON.stringify(schemeAdjustments).slice(0, 500));

    console.log('\n========== DONE ==========');
    console.log('Digi Gold group:', digiGroup.Group_ID, '| Members: Farida(A)=' + memberA.Member_ID, 'Arjun(B)=' + memberB.Member_ID, 'Meena(C)=' + memberC.Member_ID);
    console.log('Second agent:', agent2.Agent_Code);

    await db.destroy();
  } catch (err) {
    console.error('\nSEED SCRIPT FAILED:', err.message);
    await db.destroy();
    process.exit(1);
  }
})();
