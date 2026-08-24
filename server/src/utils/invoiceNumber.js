const { nextNumber } = require('./numberFormat');

const tenantCode = (tenantId) => tenantId.replace('_', '');

/**
 * Generates a unique invoice number: INV-{TENANT}-{YYYYMMDD}-{SEQ}
 * e.g. INV-VJBLR-20260626-0001 (or INV-0001 if the tenant has opted into
 * Short Number Format — see utils/numberFormat.js)
 *
 * containsHiddenStock=true switches the prefix to HINV instead — hidden-
 * stock sales get their own independent sequence (the regex-anchored match
 * in nextNumber() means HINV- numbers never collide with or skip INV-
 * numbers), so a hidden-stock bill is visually and numerically distinct
 * and easy to isolate in reports without a join back to ornament data.
 */
const generateInvoiceNumber = async (tenantId, containsHiddenStock = false) => nextNumber({
  tenantId, table: 'tbl_sales_header', column: 'Invoice_Number',
  prefix: containsHiddenStock ? 'HINV' : 'INV', tenantCode: tenantCode(tenantId), padWidth: 4,
});

/**
 * Generates a unique issue number for karigar: ISS-{TENANT}-{SEQ}
 */
const generateIssueNumber = async (tenantId) => nextNumber({
  tenantId, table: 'tbl_issue_to_karigar', column: 'Issue_Number',
  prefix: 'ISS', tenantCode: tenantCode(tenantId), padWidth: 4,
});

/**
 * Generates a unique return number: RET-{TENANT}-{SEQ}
 */
const generateReturnNumber = async (tenantId) => nextNumber({
  tenantId, table: 'tbl_return_from_karigar', column: 'Return_Number',
  prefix: 'RET', tenantCode: tenantCode(tenantId), padWidth: 4,
});

/**
 * Generates Article Number (barcode) for ornaments: ART-{TENANT}-{SEQ}
 */
const generateArticleNumber = async (tenantId) => nextNumber({
  tenantId, table: 'tbl_ornament_master', column: 'Article_Number',
  prefix: 'ART', tenantCode: tenantCode(tenantId), padWidth: 5,
});

/**
 * Generates a unique stock transfer number: TRF-{TENANT}-{YYYYMMDD}-{SEQ}
 */
const generateTransferNumber = async (tenantId) => nextNumber({
  tenantId, table: 'tbl_stock_transfer', column: 'Transfer_Number',
  prefix: 'TRF', tenantCode: tenantCode(tenantId), padWidth: 4,
});

/**
 * Generates a unique Scheme Adjustment voucher number: SCH-{TENANT}-{YYYYMMDD}-{SEQ}
 * Stored in tbl_scheme_transactions.Receipt_Number for Txn_Type='Adjustment' rows —
 * distinct from the regular SCM- prefix used for normal installment collections.
 */
const generateSchemeAdjustmentNumber = async (tenantId) => nextNumber({
  tenantId, table: 'tbl_scheme_transactions', column: 'Receipt_Number',
  prefix: 'SCH', tenantCode: tenantCode(tenantId), padWidth: 4,
});

/**
 * Generates a unique Old Gold Adjustment voucher number: OGA-{TENANT}-{YYYYMMDD}-{SEQ}
 */
const generateOldGoldAdjustmentNumber = async (tenantId) => nextNumber({
  tenantId, table: 'tbl_old_gold_exchange', column: 'Voucher_Number',
  prefix: 'OGA', tenantCode: tenantCode(tenantId), padWidth: 4,
});

/**
 * Generates a unique Approval Issue voucher number: APR-ISS-{TENANT}-{YYYYMMDD}-{SEQ}
 */
const generateApprovalIssueNumber = async (tenantId) => nextNumber({
  tenantId, table: 'tbl_approval_issue_header', column: 'Voucher_Number',
  prefix: 'APR-ISS', tenantCode: tenantCode(tenantId), padWidth: 4,
});

/**
 * Generates a unique Approval Receive voucher number: APR-REC-{TENANT}-{YYYYMMDD}-{SEQ}
 */
const generateApprovalReceiveNumber = async (tenantId) => nextNumber({
  tenantId, table: 'tbl_approval_receive_header', column: 'Voucher_Number',
  prefix: 'APR-REC', tenantCode: tenantCode(tenantId), padWidth: 4,
});

/**
 * Generates a unique Non-Tag Approval Issue voucher number: NTA-ISS-{TENANT}-{YYYYMMDD}-{SEQ}
 */
const generateNonTagIssueNumber = async (tenantId) => nextNumber({
  tenantId, table: 'tbl_non_tag_issue_header', column: 'Voucher_Number',
  prefix: 'NTA-ISS', tenantCode: tenantCode(tenantId), padWidth: 4,
});

/**
 * Generates a unique Non-Tag Approval Receive voucher number: NTA-REC-{TENANT}-{YYYYMMDD}-{SEQ}
 */
const generateNonTagReceiveNumber = async (tenantId) => nextNumber({
  tenantId, table: 'tbl_non_tag_receive_header', column: 'Voucher_Number',
  prefix: 'NTA-REC', tenantCode: tenantCode(tenantId), padWidth: 4,
});

module.exports = {
  generateInvoiceNumber, generateIssueNumber, generateReturnNumber, generateArticleNumber, generateTransferNumber,
  generateSchemeAdjustmentNumber, generateOldGoldAdjustmentNumber,
  generateApprovalIssueNumber, generateApprovalReceiveNumber, generateNonTagIssueNumber, generateNonTagReceiveNumber,
};
