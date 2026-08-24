/**
 * Standalone demo-data script for the Approval Issue/Receive module —
 * TULASI_BLR only. Deliberately NOT a knex seed file: `npm run seed` reruns
 * every file in src/db/seeds/ including 001 (which deletes+recreates
 * tbl_role_master, wiping the approval_management permission grant) and 002
 * (which deletes+recreates all tenants). Run directly instead:
 *
 *   node seed_approval_demo.js
 *
 * Idempotent — safe to re-run; it only ever touches rows it created itself
 * (identified by the two demo party names below).
 */
const db = require('./src/db/knex');

const TENANT_ID = 'TULASI_BLR';
const OPERATOR = 'tulasiadmin';
const PARTY_A_NAME = 'Sri Ganesh Jewellers';
const PARTY_B_NAME = 'Lakshmi Silks & Jewellery';

async function generateVoucher(table, col, prefix) {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const fullPrefix = `${prefix}-${TENANT_ID.replace('_', '')}-${dateStr}-`;
  const last = await db(table).where('Tenant_ID', TENANT_ID).where(col, 'like', `${fullPrefix}%`).orderBy(col, 'desc').first();
  const seq = last ? parseInt(last[col].split('-').pop(), 10) + 1 : 1;
  return `${fullPrefix}${String(seq).padStart(4, '0')}`;
}

async function main() {
  console.log('Cleaning any previous run of this demo script...');
  const oldParties = await db('tbl_approval_party_master').where('Tenant_ID', TENANT_ID).whereIn('Party_Name', [PARTY_A_NAME, PARTY_B_NAME]);
  const oldPartyIds = oldParties.map(p => p.Party_ID);
  if (oldPartyIds.length) {
    const oldIssues = await db('tbl_approval_issue_header').whereIn('Party_ID', oldPartyIds);
    const oldIssueIds = oldIssues.map(i => i.Issue_ID);
    const oldNta = await db('tbl_non_tag_issue_header').whereIn('Party_ID', oldPartyIds);
    const oldNtaIds = oldNta.map(i => i.NTA_Issue_ID);

    // restore any ornaments this old run left on-approval
    const oldItems = oldIssueIds.length ? await db('tbl_approval_issue_items').whereIn('Issue_ID', oldIssueIds) : [];
    if (oldItems.length) {
      await db('tbl_ornament_master').whereIn('Ornament_ID', oldItems.map(i => i.Ornament_ID)).update({
        Is_On_Approval: false, Is_Stock_Available: true,
        Approval_Issue_ID: null, Approval_Out_By: null, Approval_Out_Date: null,
        Approval_Receive_ID: null, Approval_Received_By: null, Approval_Received_Date: null,
      });
    }
    if (oldIssueIds.length) {
      await db('tbl_approval_receive_header').whereIn('Issue_ID', oldIssueIds).del();
      await db('tbl_approval_issue_items').whereIn('Issue_ID', oldIssueIds).del();
      await db('tbl_approval_issue_header').whereIn('Issue_ID', oldIssueIds).del();
    }
    if (oldNtaIds.length) {
      await db('tbl_non_tag_receive_header').whereIn('NTA_Issue_ID', oldNtaIds).del();
      await db('tbl_non_tag_issue_items').whereIn('NTA_Issue_ID', oldNtaIds).del();
      await db('tbl_non_tag_issue_header').whereIn('NTA_Issue_ID', oldNtaIds).del();
    }
    await db('tbl_approval_party_master').whereIn('Party_ID', oldPartyIds).del();
  }

  console.log('Creating demo parties...');
  const [partyA] = await db('tbl_approval_party_master').insert({
    Tenant_ID: TENANT_ID, Party_Name: PARTY_A_NAME, Shop_Name: 'Sri Ganesh Gold Palace',
    Contact_Person: 'Ganesh Rao', Mobile: '9880011223', GST_Number: '29AAGCS1234F1Z8',
    Address: 'Ashoka Road, Mysore', City: 'Mysore', Created_By: OPERATOR,
  }).returning('*');
  const [partyB] = await db('tbl_approval_party_master').insert({
    Tenant_ID: TENANT_ID, Party_Name: PARTY_B_NAME, Shop_Name: 'Lakshmi Jewellery Mart',
    Contact_Person: 'Lakshmi Devi', Mobile: '9880033445', GST_Number: '29AALCS5678F1Z2',
    Address: 'Commercial Street, Bangalore', City: 'Bangalore', Created_By: OPERATOR,
  }).returning('*');

  console.log('Picking available ornaments...');
  const available = await db('tbl_ornament_master')
    .where({ Tenant_ID: TENANT_ID, Is_Sold: false, Is_Stock_Available: true, Is_On_Approval: false })
    .limit(5);
  if (available.length < 5) throw new Error(`Need 5 available ornaments for TULASI_BLR, found ${available.length}. Aborting — nothing was left in a half-done state.`);
  const purityRows = await db('tbl_purity_master').whereIn('Purity_ID', available.map(o => o.Purity_ID).filter(Boolean));
  const purityMap = {}; purityRows.forEach(p => { purityMap[p.Purity_ID] = p.Purity_Code; });

  const [oIssue1a, oIssue1b, oIssue1c, oIssue2a, oIssue2b] = available;

  // ── Tagged Issue 1 — Partial (2 of 3 received back) ────────────────────────
  console.log('Creating tagged issue #1 (Partial)...');
  const tenDaysAgo = new Date(Date.now() - 10 * 86400000).toISOString().slice(0, 10);
  const eightDaysAgo = new Date(Date.now() - 8 * 86400000).toISOString().slice(0, 10);
  const voucher1 = await generateVoucher('tbl_approval_issue_header', 'Voucher_Number', 'APR-ISS');
  const issue1Items = [oIssue1a, oIssue1b, oIssue1c];
  const [issue1] = await db('tbl_approval_issue_header').insert({
    Tenant_ID: TENANT_ID, Voucher_Number: voucher1, Party_ID: partyA.Party_ID,
    Issue_Date: tenDaysAgo, Expected_Return_Date: new Date(Date.now() + 4 * 86400000).toISOString().slice(0, 10),
    Total_Items_Issued: issue1Items.length,
    Total_Weight_Issued: issue1Items.reduce((s, o) => s + parseFloat(o.Gross_Weight), 0),
    Total_Value_Issued: issue1Items.reduce((s, o) => s + parseFloat(o.Total_Price), 0),
    Status: 'Pending', Remarks: 'Sample on-approval issue for exhibition display', Data_Mode: 3, Created_By: OPERATOR,
  }).returning('*');
  const issue1ItemRows = await db('tbl_approval_issue_items').insert(issue1Items.map(o => ({
    Issue_ID: issue1.Issue_ID, Tenant_ID: TENANT_ID, Ornament_ID: o.Ornament_ID,
    Article_Number: o.Article_Number, Gross_Weight: o.Gross_Weight, Net_Gold_Weight: o.Net_Gold_Weight,
    Purity_Code: purityMap[o.Purity_ID] || null, Approx_Value: o.Total_Price,
    Item_Status: 'Pending', Created_By: OPERATOR,
  }))).returning('*');
  await db('tbl_ornament_master').whereIn('Ornament_ID', issue1Items.map(o => o.Ornament_ID)).update({
    Is_On_Approval: true, Is_Stock_Available: false,
    Approval_Issue_ID: issue1.Issue_ID, Approval_Out_By: OPERATOR, Approval_Out_Date: tenDaysAgo,
  });

  // Receive back 2 of the 3 items
  const toReceive1 = issue1ItemRows.slice(0, 2);
  const recVoucher1 = await generateVoucher('tbl_approval_receive_header', 'Voucher_Number', 'APR-REC');
  const [rec1] = await db('tbl_approval_receive_header').insert({
    Tenant_ID: TENANT_ID, Voucher_Number: recVoucher1, Issue_ID: issue1.Issue_ID, Receive_Date: eightDaysAgo,
    Items_Received_Count: toReceive1.length,
    Total_Weight_Received: toReceive1.reduce((s, i) => s + parseFloat(i.Gross_Weight), 0),
    Total_Value_Received: toReceive1.reduce((s, i) => s + parseFloat(i.Approx_Value), 0),
    Remarks: 'Partial return from exhibition', Data_Mode: 3, Created_By: OPERATOR,
  }).returning('*');
  await db('tbl_approval_issue_items').whereIn('Issue_Item_ID', toReceive1.map(i => i.Issue_Item_ID)).update({
    Item_Status: 'Received', Received_In_Receive_ID: rec1.Receive_ID, Received_Date: eightDaysAgo,
  });
  await db('tbl_ornament_master').whereIn('Ornament_ID', toReceive1.map(i => i.Ornament_ID)).update({
    Is_On_Approval: false, Is_Stock_Available: true,
    Approval_Receive_ID: rec1.Receive_ID, Approval_Received_By: OPERATOR, Approval_Received_Date: eightDaysAgo,
  });
  await db('tbl_approval_issue_header').where({ Issue_ID: issue1.Issue_ID }).update({ Status: 'Partial' });

  // ── Tagged Issue 2 — Completed (both items received back) ─────────────────
  console.log('Creating tagged issue #2 (Completed)...');
  const twentyDaysAgo = new Date(Date.now() - 20 * 86400000).toISOString().slice(0, 10);
  const fifteenDaysAgo = new Date(Date.now() - 15 * 86400000).toISOString().slice(0, 10);
  const voucher2 = await generateVoucher('tbl_approval_issue_header', 'Voucher_Number', 'APR-ISS');
  const issue2Items = [oIssue2a, oIssue2b];
  const [issue2] = await db('tbl_approval_issue_header').insert({
    Tenant_ID: TENANT_ID, Voucher_Number: voucher2, Party_ID: partyB.Party_ID,
    Issue_Date: twentyDaysAgo, Expected_Return_Date: fifteenDaysAgo,
    Total_Items_Issued: issue2Items.length,
    Total_Weight_Issued: issue2Items.reduce((s, o) => s + parseFloat(o.Gross_Weight), 0),
    Total_Value_Issued: issue2Items.reduce((s, o) => s + parseFloat(o.Total_Price), 0),
    Status: 'Pending', Remarks: 'Sample on-approval issue — trial for customer', Data_Mode: 3, Created_By: OPERATOR,
  }).returning('*');
  const issue2ItemRows = await db('tbl_approval_issue_items').insert(issue2Items.map(o => ({
    Issue_ID: issue2.Issue_ID, Tenant_ID: TENANT_ID, Ornament_ID: o.Ornament_ID,
    Article_Number: o.Article_Number, Gross_Weight: o.Gross_Weight, Net_Gold_Weight: o.Net_Gold_Weight,
    Purity_Code: purityMap[o.Purity_ID] || null, Approx_Value: o.Total_Price,
    Item_Status: 'Pending', Created_By: OPERATOR,
  }))).returning('*');
  await db('tbl_ornament_master').whereIn('Ornament_ID', issue2Items.map(o => o.Ornament_ID)).update({
    Is_On_Approval: true, Is_Stock_Available: false,
    Approval_Issue_ID: issue2.Issue_ID, Approval_Out_By: OPERATOR, Approval_Out_Date: twentyDaysAgo,
  });

  const recVoucher2 = await generateVoucher('tbl_approval_receive_header', 'Voucher_Number', 'APR-REC');
  const [rec2] = await db('tbl_approval_receive_header').insert({
    Tenant_ID: TENANT_ID, Voucher_Number: recVoucher2, Issue_ID: issue2.Issue_ID, Receive_Date: fifteenDaysAgo,
    Items_Received_Count: issue2ItemRows.length,
    Total_Weight_Received: issue2ItemRows.reduce((s, i) => s + parseFloat(i.Gross_Weight), 0),
    Total_Value_Received: issue2ItemRows.reduce((s, i) => s + parseFloat(i.Approx_Value), 0),
    Remarks: 'Full return — customer declined', Data_Mode: 3, Created_By: OPERATOR,
  }).returning('*');
  await db('tbl_approval_issue_items').where({ Issue_ID: issue2.Issue_ID }).update({
    Item_Status: 'Received', Received_In_Receive_ID: rec2.Receive_ID, Received_Date: fifteenDaysAgo,
  });
  await db('tbl_ornament_master').whereIn('Ornament_ID', issue2Items.map(o => o.Ornament_ID)).update({
    Is_On_Approval: false, Is_Stock_Available: true,
    Approval_Receive_ID: rec2.Receive_ID, Approval_Received_By: OPERATOR, Approval_Received_Date: fifteenDaysAgo,
  });
  await db('tbl_approval_issue_header').where({ Issue_ID: issue2.Issue_ID }).update({ Status: 'Completed' });

  // ── Non-Tagged Issue — Pending (nothing received yet) ──────────────────────
  console.log('Creating non-tagged issue (Pending)...');
  const fiveDaysAgo = new Date(Date.now() - 5 * 86400000).toISOString().slice(0, 10);
  const ntaVoucher = await generateVoucher('tbl_non_tag_issue_header', 'Voucher_Number', 'NTA-ISS');
  const ntaItemsInput = [
    { Item_Type: 'Necklace', Design_Type: 'Antique', Category: 'Bridal', Gross_Weight: 42.5, Metal_Type: 'Gold', Approx_Value: 285000, Remarks: 'Temple design, customer approval' },
    { Item_Type: 'Bangle Set', Design_Type: 'Kundan', Category: 'Wedding', Gross_Weight: 28.0, Metal_Type: 'Gold', Approx_Value: 195000, Remarks: 'Set of 4' },
  ];
  const [ntaIssue] = await db('tbl_non_tag_issue_header').insert({
    Tenant_ID: TENANT_ID, Voucher_Number: ntaVoucher, Party_ID: partyA.Party_ID,
    Issue_Date: fiveDaysAgo, Expected_Return_Date: new Date(Date.now() + 9 * 86400000).toISOString().slice(0, 10),
    Total_Items_Issued: ntaItemsInput.length,
    Total_Weight_Issued: ntaItemsInput.reduce((s, i) => s + i.Gross_Weight, 0),
    Total_Value_Issued: ntaItemsInput.reduce((s, i) => s + i.Approx_Value, 0),
    Status: 'Pending', Remarks: 'Sample non-tagged issue — bridal collection preview', Data_Mode: 3, Created_By: OPERATOR,
  }).returning('*');
  await db('tbl_non_tag_issue_items').insert(ntaItemsInput.map(i => ({
    NTA_Issue_ID: ntaIssue.NTA_Issue_ID, Tenant_ID: TENANT_ID, ...i, Item_Status: 'Pending', Created_By: OPERATOR,
  })));

  console.log('\nDone. Demo data created for TULASI_BLR:');
  console.log(`  Parties: ${partyA.Party_Name}, ${partyB.Party_Name}`);
  console.log(`  ${voucher1}  (Partial — 1 item still pending: ${issue1ItemRows[2].Article_Number})`);
  console.log(`  ${voucher2}  (Completed — both items returned)`);
  console.log(`  ${ntaVoucher}  (Pending — non-tagged, nothing received yet)`);
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
