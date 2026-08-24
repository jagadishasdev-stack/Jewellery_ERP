/**
 * The standard Chart of Accounts every tenant starts with — shared between
 * the one-time migration that seeded this for existing tenants
 * (20260809100300_seed_coa_and_backfill_entries.js) and tenant.js's
 * create-tenant flow, which seeds the identical set for every brand-new
 * tenant going forward. Kept in one place so the two never drift apart.
 */
const STANDARD_ACCOUNTS = [
  // Assets
  { code: '1001', name: 'Cash Account', group: 'Assets', sub: 'Cash' },
  { code: '1002', name: 'Customer Receivable Account', group: 'Assets', sub: 'Receivable' },
  { code: '1003', name: 'Input CGST Account', group: 'Assets', sub: 'Tax Credit' },
  { code: '1004', name: 'Input SGST Account', group: 'Assets', sub: 'Tax Credit' },
  { code: '1005', name: 'Input IGST Account', group: 'Assets', sub: 'Tax Credit' },
  { code: '1006', name: 'Gold Stock Account', group: 'Assets', sub: 'Inventory' },
  { code: '1007', name: 'Silver Stock Account', group: 'Assets', sub: 'Inventory' },
  { code: '1008', name: 'Diamond Stock Account', group: 'Assets', sub: 'Inventory' },
  { code: '1009', name: 'Old Gold Stock Account', group: 'Assets', sub: 'Inventory' },
  { code: '1010', name: 'Finished Jewellery Stock Account', group: 'Assets', sub: 'Inventory' },
  { code: '1011', name: 'Advance to Karigar Account', group: 'Assets', sub: 'Receivable' },
  { code: '1012', name: 'Furniture & Fixtures Account', group: 'Assets', sub: 'Fixed Asset' },
  { code: '1013', name: 'Computer & Equipment Account', group: 'Assets', sub: 'Fixed Asset' },
  { code: '1099', name: 'Bank Account (Unassigned — pre-dates per-bank ledgers)', group: 'Assets', sub: 'Bank' },
  // Liabilities
  { code: '2001', name: 'Supplier Payable Account', group: 'Liabilities', sub: 'Payable' },
  { code: '2002', name: 'Output CGST Account', group: 'Liabilities', sub: 'Tax Payable' },
  { code: '2003', name: 'Output SGST Account', group: 'Liabilities', sub: 'Tax Payable' },
  { code: '2004', name: 'Output IGST Account', group: 'Liabilities', sub: 'Tax Payable' },
  { code: '2005', name: 'Customer Advance Account', group: 'Liabilities', sub: 'Advance' },
  { code: '2006', name: 'Customer Scheme Deposit Account', group: 'Liabilities', sub: 'Advance' },
  { code: '2007', name: 'Scheme Bonus Provision Account', group: 'Liabilities', sub: 'Provision' },
  { code: '2008', name: 'Gift Voucher Account', group: 'Liabilities', sub: 'Advance' },
  { code: '2009', name: 'Bank Loan Account', group: 'Liabilities', sub: 'Loan' },
  { code: '2010', name: 'Outstanding Expenses Account', group: 'Liabilities', sub: 'Provision' },
  // Capital
  { code: '3001', name: 'Owner Capital Account', group: 'Capital', sub: 'Capital' },
  { code: '3002', name: 'Drawings Account', group: 'Capital', sub: 'Capital' },
  { code: '3003', name: 'Retained Earnings Account', group: 'Capital', sub: 'Capital' },
  // Income
  { code: '4001', name: 'Sales Account', group: 'Income', sub: 'Direct Income' },
  { code: '4002', name: 'Making Charges Account', group: 'Income', sub: 'Direct Income' },
  { code: '4003', name: 'Repair Income Account', group: 'Income', sub: 'Direct Income' },
  { code: '4004', name: 'Old Gold Purchase Discount Account', group: 'Income', sub: 'Indirect Income' },
  { code: '4005', name: 'Interest Income Account', group: 'Income', sub: 'Indirect Income' },
  { code: '4006', name: 'Other Income Account', group: 'Income', sub: 'Indirect Income' },
  // Expenses
  { code: '5001', name: 'Cost of Goods Sold Account', group: 'Expenses', sub: 'Direct Expense' },
  { code: '5002', name: 'Salary Account', group: 'Expenses', sub: 'Indirect Expense' },
  { code: '5003', name: 'Rent Account', group: 'Expenses', sub: 'Indirect Expense' },
  { code: '5004', name: 'Electricity Account', group: 'Expenses', sub: 'Indirect Expense' },
  { code: '5005', name: 'Bank Charges Account', group: 'Expenses', sub: 'Indirect Expense' },
  { code: '5006', name: 'Advertisement Account', group: 'Expenses', sub: 'Indirect Expense' },
  { code: '5007', name: 'Transport Account', group: 'Expenses', sub: 'Indirect Expense' },
  { code: '5008', name: 'Insurance Account', group: 'Expenses', sub: 'Indirect Expense' },
  { code: '5009', name: 'Depreciation Account', group: 'Expenses', sub: 'Indirect Expense' },
  { code: '5010', name: 'Making Charges Paid to Karigar Account', group: 'Expenses', sub: 'Direct Expense' },
  { code: '5011', name: 'Wastage Loss Account', group: 'Expenses', sub: 'Direct Expense' },
  { code: '5012', name: 'Other Expenses Account', group: 'Expenses', sub: 'Indirect Expense' },
];

module.exports = { STANDARD_ACCOUNTS };
