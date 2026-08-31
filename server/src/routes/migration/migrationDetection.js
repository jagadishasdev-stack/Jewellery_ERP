/**
 * Data Migration Center — rule-based sheet→entity and column→field
 * detection with a 0-100 confidence score. Deliberately no AI/LLM call in
 * this pass — the source design doc itself frames AI mapping as an
 * enhancement for ambiguous cases, not a requirement, and a deterministic
 * engine is a clean, well-labeled thing to build an AI layer on top of
 * later rather than something to silently wire in now.
 *
 * Only the MVP entity set is covered here (Customers, Vendors, Products —
 * the master-data entities a sheet can be confidently auto-detected from
 * by its own columns). Purchases/Sales/Payments are transactional and
 * depend on already-resolved master IDs, so their field lists are used
 * for column mapping once an entity is picked, but are not part of sheet
 * auto-detection scoring (a "Sales Register" sheet is identified by its
 * own name/columns just as reliably, but the harder, genuinely valuable
 * case to get right here is the master data an entire migration hinges
 * on).
 */

// Confidence thresholds — doc's own numbers, kept as named constants so
// they're the one place to tune later rather than magic numbers scattered
// through the scoring logic.
const AUTO_APPROVE_THRESHOLD = 90;
const REVIEW_THRESHOLD = 70;

const ENTITY_DEFS = {
  customer: {
    label: 'Customers',
    sheetKeywords: ['customer master', 'customer', 'client master', 'client', 'cust master', 'cust'],
    fields: {
      Customer_Name: ['customer_name', 'customername', 'cust_name', 'custname', 'name', 'client_name', 'party_name'],
      Mobile_1: ['mobile_no', 'mobile', 'mobileno', 'phone', 'contact_no', 'cell', 'mobile_number', 'phone_no'],
      Mobile_2: ['mobile2', 'alternate_mobile', 'mobile_no_2', 'phone2'],
      Email: ['email', 'email_id', 'emailaddress', 'e-mail'],
      Address_Line1: ['address', 'address1', 'addr', 'address_line1', 'addr1'],
      Address_Line2: ['address2', 'addr2', 'address_line2'],
      City: ['city', 'town'],
      State: ['state'],
      Pincode: ['pincode', 'pin', 'zip', 'zipcode', 'postal_code'],
      GST_No: ['gst', 'gstin', 'gst_no', 'gst_number'],
      PAN_No: ['pan', 'pan_no', 'pannumber', 'pan_number'],
      Date_Of_Birth: ['dob', 'date_of_birth', 'birthday', 'birth_date'],
      Anniversary_Date: ['anniversary', 'anniversary_date', 'anvsry'],
      Customer_Code: ['customer_id', 'custid', 'cust_code', 'code', 'cust_id'],
    },
  },
  vendor: {
    label: 'Suppliers',
    sheetKeywords: ['supplier master', 'supplier', 'vendor master', 'vendor'],
    fields: {
      Vendor_Name: ['vendor_name', 'supplier_name', 'name', 'party_name'],
      Contact_Person: ['contact_person', 'contact', 'contactname'],
      Mobile_1: ['mobile', 'mobile_no', 'phone', 'contact_no', 'mobile_number'],
      Email: ['email', 'email_id'],
      GST_No: ['gst', 'gstin', 'gst_no'],
      PAN_No: ['pan', 'pan_no'],
      Address_Line1: ['address', 'address1', 'addr'],
      City: ['city'],
      State: ['state'],
      Opening_Balance: ['opening_balance', 'opebal', 'old_balance', 'opening_bal'],
    },
  },
  product: {
    label: 'Products',
    sheetKeywords: ['item master', 'product master', 'stock', 'item', 'stock master', 'inventory'],
    fields: {
      Article_Number: ['item_code', 'sku', 'barcode', 'tag_no', 'tagno', 'article_no', 'article_number', 'itemcode'],
      Gross_Weight: ['gross_wt', 'gross_weight', 'grosswt', 'gross_wgt'],
      Net_Gold_Weight: ['net_wt', 'net_weight', 'netwt', 'net_wgt'],
      Stone_Weight: ['stone_wt', 'stone_weight', 'stonewt'],
      Purchase_Cost: ['purchase_rate', 'cost', 'rate', 'purchase_cost'],
      Hallmark_Certificate_No: ['hallmark_no', 'hallmark', 'huid', 'huid_no'],
    },
  },
  purchase: {
    label: 'Purchases',
    sheetKeywords: ['purchase register', 'purchase', 'purchases'],
    fields: {
      Supplier_Name: ['supplier_name', 'vendor_name', 'party_name'],
      Purchase_Date: ['purchase_date', 'date', 'invoice_date'],
      Supplier_Invoice_No: ['invoice_no', 'supplier_invoice_no', 'bill_no'],
      Total_Amount: ['total_amount', 'amount', 'total', 'net_amount'],
    },
  },
  sale: {
    label: 'Sales',
    sheetKeywords: ['sales register', 'sale', 'sales', 'invoice register'],
    fields: {
      Invoice_Number: ['invoice_no', 'invoice_number', 'bill_no', 'billno'],
      Sale_Date: ['sale_date', 'date', 'invoice_date', 'bill_date'],
      Customer_Name: ['customer_name', 'customer', 'party_name'],
      Net_Payable_Amount: ['net_amount', 'total_amount', 'amount', 'net_payable'],
    },
  },
  payment: {
    label: 'Payments',
    sheetKeywords: ['receipt register', 'payment', 'payments', 'receipts'],
    fields: {
      Amount: ['amount', 'paid_amount', 'receipt_amount'],
      Payment_Mode: ['mode', 'payment_mode', 'pmode'],
      Payment_Date: ['date', 'payment_date', 'receipt_date'],
      Payment_Reference: ['reference', 'ref_no', 'utr'],
    },
  },
};

function normalize(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Plain Levenshtein edit distance — no library needed for header strings
// this short.
function levenshtein(a, b) {
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

function similarityScore(header, synonym) {
  const h = normalize(header), s = normalize(synonym);
  if (!h || !s) return 0;
  if (h === s) return 99;
  if (h.includes(s) || s.includes(h)) return 90;
  const dist = levenshtein(h, s);
  const maxLen = Math.max(h.length, s.length);
  const pct = Math.round((1 - dist / maxLen) * 100);
  return pct >= 50 ? pct : 0;
}

/**
 * Best target-field match for one source header, within one entity's
 * field dictionary. Returns null if nothing scores above the floor.
 */
function bestFieldMatch(header, entityKey) {
  const def = ENTITY_DEFS[entityKey];
  if (!def) return null;
  let best = null;
  for (const [targetField, synonyms] of Object.entries(def.fields)) {
    for (const syn of synonyms) {
      const score = similarityScore(header, syn);
      if (score > 0 && (!best || score > best.confidence)) {
        best = { targetField, confidence: score };
      }
    }
  }
  return best;
}

/**
 * Detects which entity a sheet most likely represents, from its name and
 * its column headers. Sheet-name keyword match is a strong, near-certain
 * signal (matches the doc's own "Customer Master → Customers" examples);
 * column-header scoring is the fallback/confirmation signal.
 */
function detectSheetEntity(sheetName, headers) {
  const normSheet = normalize(sheetName);
  const scores = {};
  for (const [key, def] of Object.entries(ENTITY_DEFS)) {
    let score = 0;
    if (def.sheetKeywords.some((kw) => normSheet.includes(normalize(kw)))) score += 60;
    let matchedFields = 0;
    for (const header of headers) {
      const match = bestFieldMatch(header, key);
      if (match && match.confidence >= REVIEW_THRESHOLD) matchedFields++;
    }
    score += Math.min(40, matchedFields * 10); // up to 40 more points from column matches
    scores[key] = score;
  }
  const [bestKey, bestScore] = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
  return bestScore >= 40 ? { entityType: bestKey, label: ENTITY_DEFS[bestKey].label, confidence: Math.min(99, bestScore) } : null;
}

/**
 * Full column mapping for one sheet, once its entity type is known
 * (auto-detected or manually chosen).
 */
function suggestColumnMapping(headers, entityType) {
  return headers.map((header) => {
    const match = bestFieldMatch(header, entityType);
    return {
      sourceField: header,
      targetField: match ? match.targetField : null,
      confidence: match ? match.confidence : 0,
      status: !match ? 'unmapped' : match.confidence >= AUTO_APPROVE_THRESHOLD ? 'auto' : match.confidence >= REVIEW_THRESHOLD ? 'review' : 'manual',
    };
  });
}

module.exports = {
  ENTITY_DEFS, AUTO_APPROVE_THRESHOLD, REVIEW_THRESHOLD,
  normalize, levenshtein, similarityScore, bestFieldMatch, detectSheetEntity, suggestColumnMapping,
};
