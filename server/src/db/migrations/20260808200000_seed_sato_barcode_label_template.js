/**
 * Seeds the actual working SATO 92×15mm barcode tag layout — supplied
 * as a real ZPL template file (sato_sk 92x15.txt) already in production
 * use on a physical SATO thermal printer — as the platform's global
 * default BARCODE_LABEL template (Tenant_ID = null, resolved for every
 * tenant that hasn't set their own override — see GET
 * /api/invoice-studio/resolve/BARCODE_LABEL and its Tenant_ID > null
 * fallback order).
 *
 * Field mapping from the source ZPL, left column top-to-bottom then right
 * column top-to-bottom (^FT/^FO y-coordinates converted dots→mm at 203dpi,
 * ^FO18,29 / ^FT28,84 / etc.):
 *   <TAGNO>            → barcode_128 (encoded value = Article_Number)
 *   PARVATI(/JEWELLERS)→ shop_name   (was hardcoded to another shop's name
 *                                     in the source file — replaced with
 *                                     {{shop_name}} so it prints each
 *                                     tenant's own name, same as every
 *                                     other label component)
 *   <ITEMCODE>         → article_no
 *   <FLOOR> <SUPPCODE> → floor_location + supplier_code
 *   G:<GROSS>          → gross_wt
 *   <WAST1><MC1>       → wastage + making_charge
 *   <BEEDS1> <BVALUE1> → stone_count + stone_value (BVALUE1's real source
 *                        is unknown — no stored "stone value" column exists
 *                        anywhere in this schema, so stone_value prints a
 *                        computed carat × gemstone-rate ESTIMATE, clearly
 *                        marked "(est.)" on the tag. Confirm against the
 *                        old SATO printouts before trusting it for pricing.)
 *   Q:<QTY> <PURITY>   → quantity + purity
 *   <DESIGN>           → design_code
 *
 * Not reproduced: the barcode's font (^A0) and Code128 check-digit mode
 * (the ",A" in ^BCN,36,N,N,,A) — the browser-print pipeline this app uses
 * (see labelRenderer.js) goes through JsBarcode + the installed Windows
 * printer driver, not raw ZPL, so those ZPL-specific flags have no
 * equivalent here; the printer driver handles the actual thermal encoding.
 */
const BLOCK_UNITS_PER_MM = 10; // must match client/src/utils/labelRenderer.js's constant
const mm = (v) => Math.round(v * BLOCK_UNITS_PER_MM);

const mk = (id, type, x, y, w, h, content = {}) => ({
  id, type, x: mm(x), y: mm(y), w: mm(w), h: mm(h),
  content: { ...defaultContentFor(type), ...content },
});

// Mirrors labelRenderer.js's defaultLabelContent() defaults closely enough
// for seed purposes — the Designer UI re-derives real defaults for any
// NEW block a user adds by hand; this only needs to be correct for the
// fields actually used below.
function defaultContentFor(type) {
  const map = {
    shop_name: { text: '{{shop_name}}', fontSize: 8, bold: true, align: 'center' },
    barcode_128: {},
    article_no: { fontSize: 7, bold: true, align: 'left', prefix: '' },
    floor_location: { fontSize: 6, bold: false, align: 'left', prefix: '' },
    supplier_code: { fontSize: 6, bold: false, align: 'left', prefix: '' },
    gross_wt: { fontSize: 7, bold: false, align: 'left', prefix: 'G: ', suffix: 'g' },
    wastage: { fontSize: 6, bold: false, align: 'left', prefix: 'W: ', suffix: '%' },
    making_charge: { fontSize: 6, bold: false, align: 'left', prefix: 'MC: ', suffix: '' },
    stone_count: { fontSize: 6, bold: false, align: 'left', prefix: 'Beads: ', suffix: '' },
    stone_value: { fontSize: 6, bold: false, align: 'left', prefix: '₹', suffix: ' (est.)' },
    quantity: { fontSize: 6, bold: false, align: 'left', prefix: 'Q: ', suffix: '' },
    purity: { fontSize: 6, bold: true, align: 'left', badge: false }, // badge off — no room at this font size/row height
    design_code: { fontSize: 7, bold: false, align: 'left', prefix: '' },
  };
  return map[type] || {};
}

const BLOCKS = [
  // ── Left column (barcode + identity) ──────────────────────────────────
  mk('shop_name', 'shop_name', 1, 0.3, 25, 2.2),
  mk('barcode', 'barcode_128', 1, 2.7, 24, 5.5),
  mk('itemcode', 'article_no', 1, 8.4, 25, 2.3),
  mk('floor', 'floor_location', 1, 11.0, 12, 2.2),
  mk('suppcode', 'supplier_code', 13, 11.0, 13, 2.2),
  // ── Right column (weight / charges / stones / design) ───────────────────
  mk('gross', 'gross_wt', 28, 0.5, 61, 2.2),
  mk('wastage', 'wastage', 28, 2.9, 25, 2.2),
  mk('making_charge', 'making_charge', 54, 2.9, 35, 2.2),
  mk('stones', 'stone_count', 28, 5.3, 25, 2.2),
  mk('stone_value', 'stone_value', 54, 5.3, 35, 2.2),
  mk('qty', 'quantity', 28, 7.7, 25, 2.2),
  mk('purity', 'purity', 54, 7.7, 35, 2.2),
  mk('design', 'design_code', 28, 10.1, 61, 2.4),
];

exports.up = async function (knex) {
  const existing = await knex('tbl_invoice_studio_templates')
    .where({ Document_Type: 'BARCODE_LABEL' })
    .whereNull('Tenant_ID')
    .first();
  if (existing) return; // don't clobber a template someone already customized in the Designer

  await knex('tbl_invoice_studio_templates').insert({
    Tenant_ID: null,
    Document_Type: 'BARCODE_LABEL',
    Template_Name: 'SATO Barcode Tag (92×15mm)',
    Template_Code: 'SATO_92X15_DEFAULT',
    Is_Default: true,
    Is_Active: true,
    Paper_Size: 'Custom',
    Canvas_Width_MM: 92,
    Canvas_Height_MM: 15,
    Components: JSON.stringify(BLOCKS),
  });
};

exports.down = async function (knex) {
  await knex('tbl_invoice_studio_templates')
    .where({ Document_Type: 'BARCODE_LABEL', Template_Code: 'SATO_92X15_DEFAULT' })
    .whereNull('Tenant_ID')
    .del();
};
