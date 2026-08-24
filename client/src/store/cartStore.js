import { create } from 'zustand';

export const useCartStore = create((set, get) => ({
  items: [],
  customer: null,
  goldRate: 0,
  discountAmount: 0,
  oldGoldWeight: 0,
  oldGoldAmount: 0,
  paymentMode: 'Cash',

  setGoldRate: (rate) => set({ goldRate: rate }),
  setCustomer: (customer) => set({ customer }),
  setPaymentMode: (mode) => set({ paymentMode: mode }),

  addItem: (ornament) => {
    const { items } = get();
    const exists = items.find((i) => i.Ornament_ID === ornament.Ornament_ID);
    if (exists) return; // already in cart

    set({ items: [...items, { ...ornament, cartKey: Date.now() }] });
  },

  removeItem: (ornamentId) => {
    set({ items: get().items.filter((i) => i.Ornament_ID !== ornamentId) });
  },

  clearCart: () => set({ items: [], customer: null, discountAmount: 0, oldGoldWeight: 0, oldGoldAmount: 0 }),

  setDiscount: (amount) => set({ discountAmount: amount }),
  setOldGold: (weight, amount) => set({ oldGoldWeight: weight, oldGoldAmount: amount }),

  // Computed totals
  getCartTotals: () => {
    const { items, discountAmount, oldGoldAmount } = get();

    const subtotal = items.reduce((sum, i) => sum + parseFloat(i.Taxable_Value || i.Total_Price || 0), 0);
    const totalGST = items.reduce((sum, i) => sum + parseFloat(i.GST_Amount || 0), 0);
    const totalDiscount = parseFloat(discountAmount || 0);
    const afterDiscount = subtotal - totalDiscount;
    const netPayable = Math.round(afterDiscount + totalGST - parseFloat(oldGoldAmount || 0));
    const totalGrossWeight = items.reduce((sum, i) => sum + parseFloat(i.Gross_Weight || 0), 0);

    return {
      subtotal: subtotal.toFixed(2),
      totalGST: totalGST.toFixed(2),
      discount: totalDiscount.toFixed(2),
      oldGoldDeduction: parseFloat(oldGoldAmount || 0).toFixed(2),
      netPayable: netPayable.toFixed(2),
      totalGrossWeight: totalGrossWeight.toFixed(3),
      itemCount: items.length,
    };
  },

  // Prepare cart data for Socket.io broadcast (includes full item info)
  getSocketCartData: () => {
    const { items, customer, goldRate } = get();
    const totals = get().getCartTotals();

    return {
      items: items.map((i) => ({
        itemName: i.Type_Name || i.Item_Type_Name || 'Item',
        purity: i.Purity_Code || '-',
        grossWeight: parseFloat(i.Gross_Weight || 0).toFixed(3),
        makingCharge: parseFloat(i.Final_Making_Charge_Total || 0),
        discount: parseFloat(i.Discount_Amount || 0),
        price: parseFloat(i.Total_Price || i.Total_Line_Price || 0),
        articleNumber: i.Article_Number,
        Ornament_ID: i.Ornament_ID,
        Gross_Weight: i.Gross_Weight,
        Net_Gold_Weight: i.Net_Gold_Weight,
        Making_Charge_Applied: i.Final_Making_Charge_Total,
        Taxable_Value: i.Taxable_Value,
        GST_Amount: i.GST_Amount,
        Total_Line_Price: i.Total_Price,
        Purity_Code: i.Purity_Code,
        Gold_Rate_Per_Gram: i.Current_Gold_Rate,
        Wastage_Amount_Applied: i.Wastage_Amount,
        Discount_Amount_Applied: i.Discount_Amount,
        Article_Number: i.Article_Number,
        Item_Type_Name: i.Type_Name,
        GST_Percentage_Applied: 3,
      })),
      subtotal: totals.subtotal,
      discount: totals.discount,
      gst: totals.totalGST,
      total: totals.netPayable,
      customerName: customer?.Customer_Name,
      goldRate,
    };
  },
}));
