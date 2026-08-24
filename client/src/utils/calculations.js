/**
 * Jewellery pricing calculations
 */

/**
 * Calculate complete pricing for an ornament.
 */
export const calculateOrnamentPrice = ({
  netGoldWeight,
  goldRate,
  makingChargePerGram,
  wastagePercent = 3,
  discountPercent = 0,
  gstPercent = 3,
  stoneValue = 0,
}) => {
  const net = parseFloat(netGoldWeight) || 0;
  const rate = parseFloat(goldRate) || 0;
  const making = parseFloat(makingChargePerGram) || 0;
  const wastage = parseFloat(wastagePercent) || 0;
  const discount = parseFloat(discountPercent) || 0;
  const gst = parseFloat(gstPercent) || 0;

  const goldValue = net * rate;
  const makingChargeTotal = net * making;
  const wastageWeight = (net * wastage) / 100;
  const wastageAmount = wastageWeight * rate;
  const subtotal = goldValue + makingChargeTotal + wastageAmount + parseFloat(stoneValue);
  const discountAmount = (subtotal * discount) / 100;
  const taxableValue = subtotal - discountAmount;
  const gstAmount = (taxableValue * gst) / 100;
  const totalPrice = taxableValue + gstAmount;

  return {
    goldValue: goldValue.toFixed(2),
    makingChargeTotal: makingChargeTotal.toFixed(2),
    wastageWeight: wastageWeight.toFixed(3),
    wastageAmount: wastageAmount.toFixed(2),
    discountAmount: discountAmount.toFixed(2),
    taxableValue: taxableValue.toFixed(2),
    gstAmount: gstAmount.toFixed(2),
    totalPrice: totalPrice.toFixed(2),
  };
};

/**
 * Format currency in Indian style: ₹1,23,456.78
 */
export const formatCurrency = (value) => {
  const num = parseFloat(value) || 0;
  return '₹' + num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

/**
 * Format weight: 25.350g
 */
export const formatWeight = (value) => {
  return parseFloat(value || 0).toFixed(3) + 'g';
};

/**
 * Calculate old gold exchange value
 */
export const calculateOldGoldExchange = ({ weight, purityPercent, goldRate, meltingDeductPercent = 2 }) => {
  const w = parseFloat(weight) || 0;
  const purity = parseFloat(purityPercent) / 100;
  const rate = parseFloat(goldRate) || 0;
  const meltDeduct = parseFloat(meltingDeductPercent) / 100;

  const pureGoldWeight = w * purity;
  const meltingDeductWeight = pureGoldWeight * meltDeduct;
  const netWeight = pureGoldWeight - meltingDeductWeight;
  const value = netWeight * rate;

  return {
    pureGoldWeight: pureGoldWeight.toFixed(3),
    meltingDeductWeight: meltingDeductWeight.toFixed(3),
    netWeight: netWeight.toFixed(3),
    value: value.toFixed(2),
  };
};

/**
 * Calculate karigar settlement
 */
export const calculateKarigarSettlement = (items) => {
  const totals = items.reduce((acc, item) => {
    const issued = parseFloat(item.Gold_Weight_Issued || 0);
    const returned = parseFloat(item.Gross_Weight_Returned || 0);
    const wastage = parseFloat(item.Wastage_Weight || 0);
    const wagesRate = parseFloat(item.Karigar_Wages_Rate || 0);

    const grossWages = returned * wagesRate;
    const wastageDeduction = wastage * wagesRate;

    acc.totalIssued += issued;
    acc.totalReturned += returned;
    acc.totalWastage += wastage;
    acc.totalGrossWages += grossWages;
    acc.totalWastageDeduction += wastageDeduction;
    acc.totalNetWages += grossWages - wastageDeduction;
    return acc;
  }, { totalIssued: 0, totalReturned: 0, totalWastage: 0, totalGrossWages: 0, totalWastageDeduction: 0, totalNetWages: 0 });

  return totals;
};
