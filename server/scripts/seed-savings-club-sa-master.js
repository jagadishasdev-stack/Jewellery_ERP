/**
 * Same Savings Club demo-data seed as scripts/seed-savings-club-test-tenant.js,
 * adapted for SA_MASTER (the user's actual working tenant for checking this,
 * per explicit request — SA_MASTER had zero schemes/members/stock, unlike
 * TEST_TENANT which already had some from earlier work).
 *
 * Uses a temporary, disposable helper login (never the real superadmin's
 * own credentials/password) to drive the real API routes — deleted at the
 * end; the schemes/groups/members/transactions/journals it creates persist
 * independently of that login (Created_By is just a text snapshot, not an FK).
 *
 * Run once: `node scripts/seed-savings-club-sa-master.js`
 */
process.env.NODE_ENV = 'development';
const request = require('supertest');
const bcrypt = require('bcryptjs');
const { app } = require('../src/index');
const db = require('../src/db/knex');

const TENANT_ID = 'SA_MASTER';
const HELPER_USERNAME = 'seed_script_temp_helper';
const HELPER_PASSWORD = 'SeedHelper@2026Temp';

let token, helperUserId;
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
    const role = await db('tbl_role_master').where({ Role_Name: 'Super Admin' }).first();
    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(HELPER_PASSWORD, salt);
    const [helper] = await db('tbl_user_master').insert({
      Tenant_ID: TENANT_ID, Username: HELPER_USERNAME, Password_Hash: hash, Password_Salt: salt,
      Role_ID: role.Role_ID, Full_Name: 'Temporary Seed Helper', Is_Active: true, Is_Admin: true,
      Created_By: 'system',
    }).returning('*');
    helperUserId = helper.User_ID;

    const login = await api().post('/api/auth/login').send({ username: HELPER_USERNAME, password: HELPER_PASSWORD, tenantId: TENANT_ID });
    if (login.status !== 200) throw new Error('Login failed: ' + JSON.stringify(login.body));
    token = login.body.data.token;
    console.log('Logged in as temporary helper @', TENANT_ID);

    // ── 1. Enable active-scheme adjustment/bonus ──
    await must(api().put('/api/savings/scheme-settings').set(auth()).send({
      Allow_Active_Scheme_Adjustment: true, Allow_Active_Scheme_Bonus: true,
    }), 'Enable active-scheme adjustment settings');

    // ── 2. Schemes (SA_MASTER had none) ──
    const goldScheme = await must(api().post('/api/savings/schemes').set(auth()).send({
      Scheme_Code: 'GOLD11', Scheme_Name: 'Gold Savings 11+1', Scheme_Type: 'Gold',
      Collection_Frequency: 'Monthly', Duration_Months: 11, Default_Monthly_Amount: 2000, Bonus_Type: 'Fixed', Bonus_Value: 2000,
    }), 'Create Gold Savings scheme');
    const digiScheme = await must(api().post('/api/savings/schemes').set(auth()).send({
      Scheme_Code: 'DIGIGOLD1', Scheme_Name: 'Digi Gold Flexi', Scheme_Type: 'Gold',
      Collection_Frequency: 'Monthly', Duration_Months: 12, Default_Monthly_Amount: 3000, Bonus_Type: 'Fixed', Bonus_Value: 500,
    }), 'Create Digi Gold scheme');

    // ── 3. Groups ──
    const goldGroup = await must(api().post('/api/savings/groups').set(auth()).send({
      Scheme_ID: goldScheme.Scheme_ID, Group_Code: 'GOLD11-2026', Group_Name: 'Gold Savings — 2026 Batch',
      Start_Date: '2026-01-01', Monthly_Amount: 2000, Total_Installments: 11, Member_Limit: 50, Bonus_Amount: 2000,
    }), 'Create Gold Savings group');
    const digiGroup = await must(api().post('/api/savings/groups').set(auth()).send({
      Scheme_ID: digiScheme.Scheme_ID, Group_Code: 'DIGIGOLD1-2026', Group_Name: 'Digi Gold Flexi — 2026 Batch',
      Start_Date: '2026-01-01', Monthly_Amount: 3000, Total_Installments: 12, Member_Limit: 100, Bonus_Amount: 500, Draw_Applicable: true,
    }), 'Create Digi Gold group');

    // ── 4. Second collection agent (there's already 1: "raju") ──
    const agent2 = await must(api().post('/api/savings/agents').set(auth()).send({
      Agent_Name: 'Priya Collection Agent', Mobile: '9900011199', Commission_Pct: 1.5,
    }), 'Create second agent (Priya)');

    // ── 5. Customers + members ──
    const customerDefs = [
      { Customer_Name: 'Ganesh Bhat', Mobile_1: '9900077701' },
      { Customer_Name: 'Farida Khan', Mobile_1: '9900077702' },
      { Customer_Name: 'Arjun Nayak', Mobile_1: '9900077703' },
      { Customer_Name: 'Meena Iyer', Mobile_1: '9900077704' },
    ];
    const customers = [];
    for (const c of customerDefs) customers.push(await must(api().post('/api/customers').set(auth()).send(c), `Create customer ${c.Customer_Name}`));

    // Member A — Gold Savings, agent-referred, completes ALL 11 installments (Matured + bonus)
    const memberA = await must(api().post('/api/savings/members').set(auth()).send({
      Member_Name: 'Ganesh Bhat', Mobile: '9900077701', Customer_ID: customers[0].Customer_ID,
      Scheme_ID: goldScheme.Scheme_ID, Group_ID: goldGroup.Group_ID, Joining_Date: '2026-01-05',
      Installment_Amount: 2000, Join_Source: 'Agent',
    }), 'Enroll Member A (Ganesh, Gold Savings)');
    const modesA = ['Cash', 'UPI', 'Cheque', 'Cash', 'UPI', 'Cash', 'Cheque', 'Cash', 'UPI', 'Cash', 'Cash'];
    for (let i = 0; i < 11; i++) {
      await must(api().post('/api/savings/collect').set(auth()).send({
        Member_ID: memberA.Member_ID, Amount: 2000, Payment_Mode: modesA[i], Agent_Code: agent2.Agent_Code, Collection_Source: 'Agent',
      }), `Ganesh installment ${i + 1}/11 (${modesA[i]})`);
    }

    // Member B — Digi Gold, agent-referred, completes ALL 12 installments (Matured + Digi Gold bonus)
    const memberB = await must(api().post('/api/savings/members').set(auth()).send({
      Member_Name: 'Farida Khan', Mobile: '9900077702', Customer_ID: customers[1].Customer_ID,
      Scheme_ID: digiScheme.Scheme_ID, Group_ID: digiGroup.Group_ID, Joining_Date: '2026-01-05',
      Installment_Amount: 3000, Join_Source: 'Agent',
    }), 'Enroll Member B (Farida, Digi Gold)');
    const modesB = ['Cash', 'UPI', 'Cheque', 'Cash', 'UPI', 'Cash', 'Cheque', 'Cash', 'UPI', 'Cash', 'Cash', 'UPI'];
    for (let i = 0; i < 12; i++) {
      await must(api().post('/api/savings/collect').set(auth()).send({
        Member_ID: memberB.Member_ID, Amount: 3000, Payment_Mode: modesB[i], Agent_Code: agent2.Agent_Code, Collection_Source: 'Agent',
      }), `Farida installment ${i + 1}/12 (${modesB[i]})`);
    }

    // Member C — Digi Gold, counter, only 4/12 (stays Active — feeds overdue/dashboard)
    const memberC = await must(api().post('/api/savings/members').set(auth()).send({
      Member_Name: 'Arjun Nayak', Mobile: '9900077703', Customer_ID: customers[2].Customer_ID,
      Scheme_ID: digiScheme.Scheme_ID, Group_ID: digiGroup.Group_ID, Joining_Date: '2026-01-10',
      Installment_Amount: 3000, Join_Source: 'Counter',
    }), 'Enroll Member C (Arjun, Digi Gold)');
    for (let i = 0; i < 4; i++) {
      await must(api().post('/api/savings/collect').set(auth()).send({
        Member_ID: memberC.Member_ID, Amount: 3000, Payment_Mode: 'Cash', Collection_Source: 'Counter',
      }), `Arjun installment ${i + 1}/12`);
    }

    // Member D — Gold Savings, agent-referred, 3/11, then FORECLOSED via Adjustment against an invoice
    const memberD = await must(api().post('/api/savings/members').set(auth()).send({
      Member_Name: 'Meena Iyer', Mobile: '9900077704', Customer_ID: customers[3].Customer_ID,
      Scheme_ID: goldScheme.Scheme_ID, Group_ID: goldGroup.Group_ID, Joining_Date: '2026-02-01',
      Installment_Amount: 2000, Join_Source: 'Agent',
    }), 'Enroll Member D (Meena, Gold Savings)');
    for (let i = 0; i < 3; i++) {
      await must(api().post('/api/savings/collect').set(auth()).send({
        Member_ID: memberD.Member_ID, Amount: 2000, Payment_Mode: 'UPI', Agent_Code: agent2.Agent_Code, Collection_Source: 'Agent',
      }), `Meena installment ${i + 1}/11`);
    }

    // ── 6. SA_MASTER has zero stock — create two ornaments for the invoice-based flows ──
    const typeId = (await db('tbl_item_type_master').first()).Type_ID;
    const ornamentDefs = [
      { Gross_Weight: 5, Net_Gold_Weight: 4.6, Current_Gold_Rate: 6200, Base_Making_Charge_Per_Gram: 400, Purchase_Cost: 25000, Total_Price: 32500 },
      { Gross_Weight: 10, Net_Gold_Weight: 9.4, Current_Gold_Rate: 6200, Base_Making_Charge_Per_Gram: 450, Purchase_Cost: 52000, Total_Price: 66401.01 },
    ];
    const ornaments = [];
    for (const o of ornamentDefs) {
      ornaments.push(await must(api().post('/api/ornaments').set(auth()).send({ Type_ID: typeId, Metal_Type: 'Gold', ...o }), 'Create demo ornament for invoicing'));
    }

    // ── 7. Foreclose Meena against a real invoice (Settlement_Mode='Adjustment') ──
    const saleD = await must(api().post('/api/sales/create').set(auth()).send({
      Customer_ID: customers[3].Customer_ID, Customer_Name: 'Meena Iyer', Customer_Mobile: '9900077704',
      Payment_Mode: 'Cash', Amount_Paid: 0, Subtotal_Amount: ornaments[0].Total_Price,
      Net_Payable_Amount: ornaments[0].Total_Price, Balance_Amount: ornaments[0].Total_Price,
      items: [{ Ornament_ID: ornaments[0].Ornament_ID, Article_Number: ornaments[0].Article_Number, Total_Line_Price: ornaments[0].Total_Price }],
    }), 'Create invoice for Meena (to foreclose against)');
    await must(api().post(`/api/savings/members/${memberD.Member_ID}/foreclose`).set(auth()).send({
      Settlement_Mode: 'Adjustment', Invoice_Number: saleD.sale.Invoice_Number,
      Deduction_Amount: 100, Reason: 'Customer needed funds sooner than planned',
    }), 'Foreclose Meena against her invoice');

    // ── 8. Adjust-invoice: redeem Ganesh's now-matured Gold Savings balance against a fresh invoice ──
    const saleA = await must(api().post('/api/sales/create').set(auth()).send({
      Customer_ID: customers[0].Customer_ID, Customer_Name: 'Ganesh Bhat', Customer_Mobile: '9900077701',
      Payment_Mode: 'Cash', Amount_Paid: 0, Subtotal_Amount: ornaments[1].Total_Price,
      Net_Payable_Amount: ornaments[1].Total_Price, Balance_Amount: ornaments[1].Total_Price,
      items: [{ Ornament_ID: ornaments[1].Ornament_ID, Article_Number: ornaments[1].Article_Number, Total_Line_Price: ornaments[1].Total_Price }],
    }), 'Create invoice for Ganesh (to adjust matured scheme balance against)');
    await must(api().post(`/api/savings/members/${memberA.Member_ID}/adjust-invoice`).set(auth()).send({
      Invoice_Number: saleA.sale.Invoice_Number, Amount: 22000,
      Reason: 'Redeeming matured Gold Savings scheme against new purchase',
    }), 'Adjust Ganesh\'s matured balance against his invoice');

    // ── 9. PDC variety ──
    const pdc1 = await must(api().post('/api/savings/pdc').set(auth()).send({
      Member_ID: memberC.Member_ID, Bank_Name: 'HDFC Bank', Cheque_Number: '000551', Amount: 3000, Cheque_Date: '2026-09-10',
    }), 'PDC for Arjun');
    await must(api().put(`/api/savings/pdc/${pdc1.PDC_ID}/status`).set(auth()).send({ status: 'Deposited' }), 'Mark Arjun PDC Deposited');
    const pdc2 = await must(api().post('/api/savings/pdc').set(auth()).send({
      Member_ID: memberB.Member_ID, Bank_Name: 'ICICI Bank', Cheque_Number: '000552', Amount: 3000, Cheque_Date: '2026-06-15',
    }), 'PDC for Farida');
    await must(api().put(`/api/savings/pdc/${pdc2.PDC_ID}/status`).set(auth()).send({ status: 'Bounced', bounce_charge: 250, remarks: 'Insufficient funds' }), 'Mark Farida PDC Bounced');
    const pdc3 = await must(api().post('/api/savings/pdc').set(auth()).send({
      Member_ID: memberC.Member_ID, Bank_Name: 'SBI', Cheque_Number: '000553', Amount: 3000, Cheque_Date: '2026-10-05',
    }), 'PDC for Arjun (2nd, stays Pending)');

    // ── 10. Lucky draw on the Digi Gold group (Farida + Arjun both eligible) ──
    const draw = await must(api().post('/api/savings/draw/conduct').set(auth()).send({
      Scheme_ID: digiScheme.Scheme_ID, Group_ID: digiGroup.Group_ID, Draw_Type: 'Monthly',
      Draw_Name: 'Digi Gold — August Lucky Draw', Prize_Type: 'Cash', Prize_Value: 1000, Prize_Description: '₹1,000 cash prize',
    }), 'Conduct Digi Gold lucky draw');

    // ══════════════ VERIFICATION ══════════════
    console.log('\n========== VERIFICATION ==========\n');
    const dashboard = await must(api().get('/api/savings/dashboard').set(auth()), 'GET dashboard');
    console.log('Dashboard:', JSON.stringify(dashboard, null, 2));

    const tb = await must(api().get('/api/accounting/trial-balance').set(auth()), 'GET trial balance');
    console.log('Trial balance isBalanced:', tb.isBalanced);

    const financial = await must(api().get('/api/reports/financial').set(auth()).query({ fromDate: '2026-01-01', toDate: '2027-12-31' }), 'GET financial/balance-sheet');
    console.log('Balance sheet:', JSON.stringify(financial.balanceSheet));

    console.log('\n========== DONE ==========');
    console.log('Schemes:', goldScheme.Scheme_ID, digiScheme.Scheme_ID, '| Groups:', goldGroup.Group_ID, digiGroup.Group_ID);
    console.log('Members: Ganesh(A,Matured)=' + memberA.Member_ID, 'Farida(B,Matured)=' + memberB.Member_ID, 'Arjun(C,Active)=' + memberC.Member_ID, 'Meena(D,Closed)=' + memberD.Member_ID);
    console.log('Second agent:', agent2.Agent_Code);

    // Clean up ONLY the temporary login — the seeded business data stays.
    await db('tbl_user_master').where({ User_ID: helperUserId }).del();
    console.log('Temporary helper login removed (seeded data kept).');

    await db.destroy();
  } catch (err) {
    console.error('\nSEED SCRIPT FAILED:', err.message);
    if (helperUserId) await db('tbl_user_master').where({ User_ID: helperUserId }).del().catch(() => {});
    await db.destroy();
    process.exit(1);
  }
})();
