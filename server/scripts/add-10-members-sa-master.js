/**
 * Adds 10 more Savings Club members to SA_MASTER, spread across both
 * existing groups (Gold Savings 11+1 / Digi Gold Flexi), with varied
 * installment progress, payment modes, and Agent/Counter sourcing —
 * a bigger, more realistic spread for the dashboard/reports to show.
 *
 * Same safe pattern as before: a temporary, disposable helper login
 * drives the real API, then gets deleted — the real superadmin login
 * is never touched, and the seeded data persists independently of it.
 *
 * Run once: `node scripts/add-10-members-sa-master.js`
 */
process.env.NODE_ENV = 'development';
const request = require('supertest');
const bcrypt = require('bcryptjs');
const { app } = require('../src/index');
const db = require('../src/db/knex');

const TENANT_ID = 'SA_MASTER';
const HELPER_USERNAME = 'seed_script_temp_helper2';
const HELPER_PASSWORD = 'SeedHelper@2026Temp2';

const GOLD_GROUP_ID = 630;   // GOLD11-2026, 11 installments, 2000/month, bonus 2000
const DIGI_GROUP_ID = 631;   // DIGIGOLD1-2026, 12 installments, 3000/month, bonus 500
const GOLD_SCHEME_ID = 626;
const DIGI_SCHEME_ID = 627;
const AGENT_RAJU = '0001';
const AGENT_PRIYA = 'AGT-SAMASTER-00002';

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

// 10 members: mixed group, mixed progress, mixed source/agent, mixed payment modes.
const PLAN = [
  { name: 'Rekha Pillai',    mobile: '9900088801', group: GOLD_GROUP_ID, scheme: GOLD_SCHEME_ID, amount: 2000, count: 11, source: 'Agent',   agent: AGENT_RAJU,  modes: cycle(['Cash','UPI']) },   // matures + bonus
  { name: 'Suresh Kamath',   mobile: '9900088802', group: GOLD_GROUP_ID, scheme: GOLD_SCHEME_ID, amount: 2000, count: 6,  source: 'Counter', agent: null,        modes: cycle(['Cash']) },
  { name: 'Lakshmi Rao',     mobile: '9900088803', group: GOLD_GROUP_ID, scheme: GOLD_SCHEME_ID, amount: 2000, count: 2,  source: 'Agent',   agent: AGENT_PRIYA, modes: cycle(['UPI']) },
  { name: 'Manoj Hegde',     mobile: '9900088804', group: GOLD_GROUP_ID, scheme: GOLD_SCHEME_ID, amount: 2000, count: 9,  source: 'Counter', agent: null,        modes: cycle(['Cash','Cheque']) },
  { name: 'Divya Menon',     mobile: '9900088805', group: DIGI_GROUP_ID, scheme: DIGI_SCHEME_ID, amount: 3000, count: 12, source: 'Agent',   agent: AGENT_PRIYA, modes: cycle(['Cash','UPI','Cheque']) }, // matures + Digi Gold bonus
  { name: 'Ibrahim Sait',    mobile: '9900088806', group: DIGI_GROUP_ID, scheme: DIGI_SCHEME_ID, amount: 3000, count: 5,  source: 'Counter', agent: null,        modes: cycle(['Cash']) },
  { name: 'Nandini Shetty',  mobile: '9900088807', group: DIGI_GROUP_ID, scheme: DIGI_SCHEME_ID, amount: 3000, count: 8,  source: 'Agent',   agent: AGENT_RAJU,  modes: cycle(['UPI','Cash']) },
  { name: 'Vikram Achar',    mobile: '9900088808', group: DIGI_GROUP_ID, scheme: DIGI_SCHEME_ID, amount: 3000, count: 1,  source: 'Counter', agent: null,        modes: cycle(['Cash']) },
  { name: 'Shalini D\'Souza', mobile: '9900088809', group: GOLD_GROUP_ID, scheme: GOLD_SCHEME_ID, amount: 2000, count: 4,  source: 'Agent',   agent: AGENT_RAJU,  modes: cycle(['Cash','UPI']) },
  { name: 'Praveen Kulkarni', mobile: '9900088810', group: DIGI_GROUP_ID, scheme: DIGI_SCHEME_ID, amount: 3000, count: 10, source: 'Counter', agent: null,        modes: cycle(['UPI','Cheque']) },
];

function cycle(arr) {
  let i = 0;
  return () => arr[i++ % arr.length];
}

(async () => {
  try {
    const role = await db('tbl_role_master').where({ Role_Name: 'Super Admin' }).first();
    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(HELPER_PASSWORD, salt);
    const [helper] = await db('tbl_user_master').insert({
      Tenant_ID: TENANT_ID, Username: HELPER_USERNAME, Password_Hash: hash, Password_Salt: salt,
      Role_ID: role.Role_ID, Full_Name: 'Temporary Seed Helper 2', Is_Active: true, Is_Admin: true,
      Created_By: 'system',
    }).returning('*');
    helperUserId = helper.User_ID;

    const login = await api().post('/api/auth/login').send({ username: HELPER_USERNAME, password: HELPER_PASSWORD, tenantId: TENANT_ID });
    if (login.status !== 200) throw new Error('Login failed: ' + JSON.stringify(login.body));
    token = login.body.data.token;
    console.log('Logged in as temporary helper @', TENANT_ID);

    const created = [];
    for (const p of PLAN) {
      const customer = await must(api().post('/api/customers').set(auth()).send({ Customer_Name: p.name, Mobile_1: p.mobile }), `Create customer ${p.name}`);
      const member = await must(api().post('/api/savings/members').set(auth()).send({
        Member_Name: p.name, Mobile: p.mobile, Customer_ID: customer.Customer_ID,
        Scheme_ID: p.scheme, Group_ID: p.group, Joining_Date: '2026-01-15',
        Installment_Amount: p.amount, Join_Source: p.source,
      }), `Enroll ${p.name}`);
      for (let i = 0; i < p.count; i++) {
        const mode = p.modes();
        await must(api().post('/api/savings/collect').set(auth()).send({
          Member_ID: member.Member_ID, Amount: p.amount, Payment_Mode: mode,
          ...(p.agent ? { Agent_Code: p.agent, Collection_Source: 'Agent' } : { Collection_Source: 'Counter' }),
        }), `${p.name} installment ${i + 1}/${p.count === 11 || p.count === 12 ? p.count : p.count} (${mode})`);
      }
      created.push({ name: p.name, memberId: member.Member_ID, installments: p.count });
    }

    console.log('\n========== VERIFICATION ==========\n');
    const dashboard = await must(api().get('/api/savings/dashboard').set(auth()), 'GET dashboard');
    console.log('Dashboard:', JSON.stringify(dashboard, null, 2));

    const members = await must(api().get('/api/savings/members').set(auth()).query({ limit: 50 }), 'GET all members');
    console.log('Total members now:', members.total);
    console.log('Status breakdown:', JSON.stringify(
      members.items.reduce((acc, m) => { acc[m.Status] = (acc[m.Status] || 0) + 1; return acc; }, {})
    ));

    const tb = await must(api().get('/api/accounting/trial-balance').set(auth()), 'GET trial balance');
    console.log('Trial balance isBalanced:', tb.isBalanced);

    console.log('\n========== DONE ==========');
    console.log('New members:', JSON.stringify(created, null, 2));

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
