/**
 * The 4 bin_* module keys added in 20260808190000 didn't exist yet when
 * Gold/Platinum/Diamond's Features_JSON arrays were seeded — so any tenant
 * with an active subscription (e.g. DLJ, on Platinum) would have lost
 * access to Master Bin entirely the moment that migration ran, purely
 * because the tier's allowlist predates the key. Caught by actually
 * checking DLJ's live /api/modules response after adding the keys, not
 * assumed to be fine.
 *
 * Master Bin was never tier-gated before this session (it had NO module
 * key at all) — every existing tenant already relies on it. So this adds
 * all 4 keys to every tier's list, Gold included, rather than picking a
 * "which tier deserves Bin" cutoff that would take something away from
 * whoever's currently on a lower tier than that cutoff.
 */
const BIN_KEYS = ['bin_purchase', 'bin_sales_return', 'bin_orders', 'bin_pure_gold'];

exports.up = async function (knex) {
  const plans = await knex('tbl_subscription_plan_master').whereIn('Plan_Name', ['Gold', 'Platinum', 'Diamond']);
  for (const plan of plans) {
    const current = typeof plan.Features_JSON === 'string' ? JSON.parse(plan.Features_JSON) : (plan.Features_JSON || []);
    const merged = [...new Set([...current, ...BIN_KEYS])];
    await knex('tbl_subscription_plan_master').where('Plan_ID', plan.Plan_ID).update({ Features_JSON: JSON.stringify(merged) });
  }
};

exports.down = async function (knex) {
  const plans = await knex('tbl_subscription_plan_master').whereIn('Plan_Name', ['Gold', 'Platinum', 'Diamond']);
  for (const plan of plans) {
    const current = typeof plan.Features_JSON === 'string' ? JSON.parse(plan.Features_JSON) : (plan.Features_JSON || []);
    const reverted = current.filter((k) => !BIN_KEYS.includes(k));
    await knex('tbl_subscription_plan_master').where('Plan_ID', plan.Plan_ID).update({ Features_JSON: JSON.stringify(reverted) });
  }
};
