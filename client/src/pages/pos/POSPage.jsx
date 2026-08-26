/**
 * Professional POS — Senior Developer Build
 * Features:
 * - 3-panel layout: Customer Left | Cart Center | Bill Right
 * - Multi-payment split (Cash + UPI + Scheme + Old Gold + Voucher...)
 * - Live remaining balance always visible
 * - PAN mandatory when bill > ₹2,00,000
 * - Scheme balance auto-fetched when customer selected
 * - Gift voucher validation
 * - Barcode/Article/Design search
 */
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Row, Col, Card, Input, Button, Table, Space, Typography,
  Modal, Select, InputNumber, Divider, Tag, message,
  Tooltip, Empty, Badge, Alert, Progress, Statistic, Steps,
  Drawer, List, Image, Grid,
} from 'antd';
import {
  ScanOutlined, DeleteOutlined, UserOutlined, PrinterOutlined,
  ClearOutlined, SearchOutlined, GoldOutlined,
  ShopOutlined, PlusOutlined, MinusCircleOutlined,
  CheckCircleFilled, ExclamationCircleOutlined, TagOutlined,
  WalletOutlined, BankOutlined, PictureOutlined, HistoryOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { ornamentsApi, customersApi, salesApi, savingsApi, dayCloseApi, oldGoldApi, tenantApi, bankChequeApi } from '../../api/modules';
import api from '../../api/axios';
import { useCartStore } from '../../store/cartStore';
import { useCounterStore } from '../../store/counterStore';
import { useAuthStore } from '../../store/authStore';
import { useDataMode } from '../../contexts/DataModeContext';
import { useSocket } from '../../hooks/useSocket';
import { useGoldRate } from '../../hooks/useGoldRate';
import { formatCurrency, formatWeight, calculateOldGoldExchange } from '../../utils/calculations';
import CustomerSearchModal from './CustomerSearchModal';
import { printThermalReceipt } from '../../utils/thermalReceipt';
import PageTour from '../../components/PageTour';
import { useActionShortcuts } from '../../hooks/useActionShortcuts';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { Option } = Select;

const PAYMENT_MODES = [
  { key: 'Cash',          icon: '💵', label: 'Cash',          ledger: 'Cash' },
  { key: 'UPI',           icon: '📱', label: 'UPI',           ledger: 'Bank' },
  { key: 'Debit Card',    icon: '💳', label: 'Debit Card',    ledger: 'Bank' },
  { key: 'Credit Card',   icon: '💳', label: 'Credit Card',   ledger: 'Bank' },
  { key: 'NEFT',          icon: '🏦', label: 'NEFT',          ledger: 'Bank' },
  { key: 'RTGS',          icon: '🏦', label: 'RTGS',          ledger: 'Bank' },
  { key: 'IMPS',          icon: '🏦', label: 'IMPS',          ledger: 'Bank' },
  { key: 'Bank Transfer', icon: '🏦', label: 'Bank Transfer', ledger: 'Bank' },
  { key: 'Cheque',        icon: '📋', label: 'Cheque',        ledger: 'Bank' },
  { key: 'Gift Voucher',  icon: '🎁', label: 'Gift Voucher',  ledger: 'Voucher' },
  { key: 'Advance',       icon: '💰', label: 'Advance Adjustment', ledger: 'Customer' },
];
// These modes post to the shared "Bank Account (Unassigned)" ledger unless
// a specific real bank is picked at billing time (see sales.js's
// postSaleAccountingEntries) — UPI/Credit Card are excluded since they have
// their own dedicated clearing/settlement ledgers, not a real bank, and
// Cheque posts to "Cheque In Hand" until it's cleared later through the
// Bank/Cheque register, which is where its bank gets picked.
const BANK_SELECT_MODES = new Set(['Debit Card', 'NEFT', 'RTGS', 'IMPS', 'Bank Transfer']);

// Scheme adjustments are NOT a selectable payment mode — they only apply
// through the "🪙 Scheme Adjustment" card (left panel), which links the
// deduction to a real member and reduces their balance. A payment-mode
// entry here would just be a text label with no member attached.

const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
const PAN_THRESHOLD = 200000;
const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

export default function POSPage() {
  // ── Responsive layout ────────────────────────────────────────────────────────
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.lg;

  // ── Counter / Auth ─────────────────────────────────────────────────────────
  const { isUnofficial } = useDataMode();
  const { counterName: rawCounterName, counterId } = useCounterStore();
  const counterName = rawCounterName || 'Billing Counter';
  const { goldRate, rates } = useGoldRate();
  const { emitCartUpdate, emitCheckoutComplete, emitClearDisplay } = useSocket();
  const { user } = useAuthStore();
  const navigate = useNavigate();

  // ── Recent Bills quick-access panel ─────────────────────────────────────────
  const [recentBillsOpen, setRecentBillsOpen] = useState(false);
  const [reprintingId, setReprintingId] = useState(null);
  const { data: recentBills, isFetching: recentBillsLoading } = useQuery({
    queryKey: ['recent-bills-pos'],
    queryFn: () => salesApi.list({ limit: 10 }).then((r) => r.data.data.items),
    enabled: recentBillsOpen,
  });
  const reprintBill = async (saleId) => {
    setReprintingId(saleId);
    try {
      const res = await salesApi.getById(saleId);
      const { sale, items: saleItems } = res.data.data;
      await printThermalReceipt(sale, saleItems, { Company_Name: user?.companyName, GST_No: user?.gstNo });
      message.success('Reprinted.');
    } catch {
      message.error('Failed to reprint this bill.');
    } finally {
      setReprintingId(null);
    }
  };
  const {
    items, customer, addItem, removeItem, clearCart, setCustomer,
    getCartTotals, getSocketCartData, setOldGold,
  } = useCartStore();

  // ── Billing employee (who actually billed this sale — may differ from the
  // logged-in till account when several staff share one counter login) ──────
  const { data: staffList } = useQuery({
    queryKey: ['tenant-users-for-billing'],
    queryFn: () => tenantApi.getUsers().then(r => (r.data.data || []).filter(u => u.Is_Active)),
    staleTime: 5 * 60 * 1000,
  });
  const [billedByUserId, setBilledByUserId] = useState(() => user?.userId || null);

  // Real bank accounts, for the "which bank did this land in" selector on
  // bank-type payment splits — lets that specific payment post against its
  // own Chart of Accounts ledger instead of the shared "Unassigned" one
  // (see accountingEngine.js / sales.js's Bank_Account_ID resolution).
  const { data: bankAccounts } = useQuery({
    queryKey: ['bank-accounts-for-billing'],
    queryFn: () => bankChequeApi.getAccounts().then(r => r.data.data || []),
    staleTime: 5 * 60 * 1000,
  });

  // Remove counter gate — POS opens directly without counter selection
  // Counter is optional — defaults to "Main Counter" if not selected

  // ── State ──────────────────────────────────────────────────────────────────
  const [searchInput, setSearchInput] = useState('');
  const [searchType, setSearchType] = useState('barcode');
  const [lastScannedItem, setLastScannedItem] = useState(null);
  const [customerModalOpen, setCustomerModalOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [checkoutStep, setCheckoutStep] = useState(0); // 0=payments, 1=confirm

  // Walk-in customer name/mobile — kept separate from `customer` (which only
  // ever holds a real selected customer row from the search modal) so typing
  // here can't flip `!customer` conditions elsewhere on the page.
  const [walkInName, setWalkInName] = useState('');
  const [walkInMobile, setWalkInMobile] = useState('');

  // Multi-payment splits
  const [paymentSplits, setPaymentSplits] = useState([{ mode: 'Cash', amount: 0, reference: '' }]);
  const [panNumber, setPanNumber] = useState('');
  // Sale_Type/Invoice_Type were always hardcoded 'Retail'/'Tax Invoice' —
  // there was no way to bill a Wholesale sale or issue a Cash Memo from
  // POS at all, even though both values are already real, distinct
  // fields the backend and reports (gst-summary/gstr1 explicitly filter
  // on Invoice_Type='Tax Invoice') already understand.
  const [saleType, setSaleType] = useState('Retail');
  const [invoiceType, setInvoiceType] = useState('Tax Invoice');
  const [panVerified, setPanVerified] = useState(false);

  // Unofficial mode sales are cash-only — collapse any non-cash splits back
  // to a single Cash entry (server also enforces this, this is just the UX).
  useEffect(() => {
    if (isUnofficial) {
      setPaymentSplits(prev => [{ mode: 'Cash', amount: prev.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0), reference: '' }]);
    }
  }, [isUnofficial]);

  // Adjustments
  const [oldGoldEntry, setOldGoldEntry] = useState({
    weight: 0, purity: 91.67, meltDeduct: 2, rate: 0,
    value: 0, applied: false, exchangeId: null, voucherNumber: null,
  });
  const [schemeSearchQuery, setSchemeSearchQuery] = useState('');
  const [schemeSearchTrigger, setSchemeSearchTrigger] = useState('');
  const [schemeDrafts, setSchemeDrafts] = useState({}); // { [Member_ID]: { balance, bonus } }
  const [appliedSchemeAdjustments, setAppliedSchemeAdjustments] = useState([]); // [{Member_ID, Member_Number, Member_Name, balanceAmount, bonusAmount}]
  const [voucherCode, setVoucherCode] = useState('');
  const [voucherEntry, setVoucherEntry] = useState({ voucherId: null, availableBalance: 0, applyAmount: 0, applied: false });
  // Loyalty points were only ever displayed at checkout, never actually
  // redeemable for a discount anywhere — Loyalty_Points_Used was accepted
  // and stored by the API but never subtracted from what the customer owed.
  const [loyaltyPointsUsed, setLoyaltyPointsUsed] = useState(0);
  const { data: tenantSettings } = useQuery({
    queryKey: ['tenant-settings-pos'],
    queryFn: () => tenantApi.getSettings().then((r) => r.data.data),
    staleTime: 10 * 60 * 1000,
  });
  const loyaltyPointValue = parseFloat(tenantSettings?.Loyalty_Point_Value ?? 1);

  // ── Walkthrough tour refs ───────────────────────────────────────────────────
  const searchRef = useRef(null);
  const customerRef = useRef(null);
  const adjustmentsRef = useRef(null);
  const cartRef = useRef(null);
  const billRef = useRef(null);
  const checkoutRef = useRef(null);
  const billedByRef = useRef(null);
  const barcodeInputRef = useRef(null);
  const tourSteps = [
    { title: '1. Scan / Search Items', description: 'Scan a barcode or type an Article/Design number here, then press Add (or Enter) to add the item to the cart.', target: () => searchRef.current },
    { title: '2. Cart', description: 'Every item you add shows here with its weight, making charges and price. Click the trash icon to remove an item.', target: () => cartRef.current },
    { title: '3. Customer', description: 'Click Select to attach a customer to this bill — needed for loyalty points, scheme adjustments, and GST invoices above ₹50,000.', target: () => customerRef.current },
    { title: '4. Optional Adjustments', description: 'Exchange old gold, apply a Savings Scheme balance, or redeem a gift voucher here — each reduces the net payable amount before checkout. Scheme balances are ONLY ever reduced through this card — there is no "Scheme" payment mode at checkout, since that would have no member attached to it.', target: () => adjustmentsRef.current },
    { title: '5. Live Bill Summary', description: 'The running total, weights and any adjustments update here automatically as you work.', target: () => billRef.current },
    { title: '6. Checkout & Print', description: 'When ready, click this to open the payment screen. It opens with a "Billed By" dropdown first — pick which staff member is actually billing this sale (useful when several people share one counter login) — then split payment across Cash/UPI/Card, enter PAN if the bill exceeds ₹2 lakh, and confirm to print the receipt.', target: () => checkoutRef.current },
  ];

  // Old Gold rate defaults to the live gold rate once known, still editable
  useEffect(() => {
    if (goldRate && !oldGoldEntry.rate) setOldGoldEntry(prev => ({ ...prev, rate: goldRate }));
  }, [goldRate]);

  const cartTotals = getCartTotals();

  // ── Derived billing calculations ───────────────────────────────────────────
  // IMPORTANT: cartTotals.netPayable already excludes oldGoldAmount from cartStore.
  // We ignore oldGoldAmount from cartStore and handle ALL adjustments here in POSPage
  // so the bill panel shows the correct breakdown.
  const cartSubtotal = useMemo(() => {
    // Always recalculate from item fields — never trust stored Taxable_Value alone
    // Use Total_Price (MRP) as the true selling price per item
    const total = items.reduce((s, i) => s + parseFloat(i.Total_Price || 0), 0);
    const gst   = items.reduce((s, i) => s + parseFloat(i.GST_Amount  || 0), 0);
    return { total, gst, beforeGST: total - gst };
  }, [items]);

  const adjustments = useMemo(() => {
    const billTotal  = cartSubtotal.total;       // sum of MRP of all items
    // Required sequence: Old Gold → Scheme → Bonus → Gift Voucher → Final Payable
    const oldGold    = oldGoldEntry.applied  ? parseFloat(oldGoldEntry.value) : 0;
    const scheme     = appliedSchemeAdjustments.reduce((s, a) => s + parseFloat(a.balanceAmount || 0), 0);
    const bonus      = appliedSchemeAdjustments.reduce((s, a) => s + parseFloat(a.bonusAmount || 0), 0);
    const voucher    = voucherEntry.applied  ? parseFloat(voucherEntry.applyAmount) : 0;
    const loyalty    = round2(loyaltyPointsUsed * loyaltyPointValue);
    const netPayable = Math.max(0, billTotal - oldGold - scheme - bonus - voucher - loyalty);
    const totalPaid  = paymentSplits.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);
    const remaining  = Math.max(0, netPayable - totalPaid);
    const isPanRequired = netPayable >= PAN_THRESHOLD;
    const isSettled  = remaining <= 0.5;
    return { oldGold, scheme, bonus, voucher, loyalty, billTotal, netPayable, totalPaid, remaining, isPanRequired, isSettled };
  }, [cartSubtotal, oldGoldEntry, appliedSchemeAdjustments, voucherEntry, loyaltyPointsUsed, loyaltyPointValue, paymentSplits]);

  // Auto-fill first payment split with full amount when checkout opens
  useEffect(() => {
    if (checkoutOpen) {
      setPaymentSplits([{ mode: 'Cash', amount: adjustments.netPayable, reference: '' }]);
      setCheckoutStep(0);
    }
  }, [checkoutOpen, adjustments.netPayable]);

  // Broadcast cart to customer display
  useEffect(() => {
    emitCartUpdate({
      ...getSocketCartData(),
      counterName,
      schemeAmount: adjustments.scheme,
      bonusAmount: adjustments.bonus,
      oldGoldAmount: adjustments.oldGold,
      voucherAmount: adjustments.voucher,
      loyaltyAmount: adjustments.loyalty,
    });
  }, [items, customer, adjustments]);

  // ── Savings Club member search (Member ID / Mobile / Name) ────────────────
  const { data: schemeSearchResults, isFetching: schemeSearching } = useQuery({
    queryKey: ['scheme-search-pos', schemeSearchTrigger],
    queryFn: () => savingsApi.searchForPos(schemeSearchTrigger).then(r => r.data.data || []),
    enabled: schemeSearchTrigger.trim().length >= 3,
  });

  const runSchemeSearch = () => setSchemeSearchTrigger(schemeSearchQuery.trim());

  const setSchemeDraft = (memberId, field, value) =>
    setSchemeDrafts(prev => ({ ...prev, [memberId]: { ...prev[memberId], [field]: value } }));

  const applySchemeAdjustment = (member) => {
    const draft = schemeDrafts[member.Member_ID] || {};
    const balanceAmount = parseFloat(draft.balance || 0);
    const bonusAmount = parseFloat(draft.bonus || 0);
    if (balanceAmount <= 0 && bonusAmount <= 0) return;
    setAppliedSchemeAdjustments(prev => {
      const idx = prev.findIndex(a => a.Member_ID === member.Member_ID);
      const entry = { Member_ID: member.Member_ID, Member_Number: member.Member_Number, Member_Name: member.Member_Name, balanceAmount, bonusAmount };
      if (idx >= 0) { const next = [...prev]; next[idx] = entry; return next; }
      return [...prev, entry];
    });
    message.success(`${member.Member_Number} adjustment applied.`);
  };

  const removeSchemeAdjustment = (memberId) =>
    setAppliedSchemeAdjustments(prev => prev.filter(a => a.Member_ID !== memberId));

  // ── Barcode / Article / Design search ─────────────────────────────────────
  const handleSearch = async () => {
    if (!searchInput.trim()) return;
    try {
      let ornament = null;
      if (searchType === 'barcode' || searchType === 'article') {
        const res = await ornamentsApi.getByBarcode(searchInput.trim());
        ornament = res.data.data;
      } else {
        const res = await ornamentsApi.getAll({ search: searchInput.trim(), limit: 1 });
        ornament = res.data.data?.items?.[0];
      }
      if (!ornament) { message.error('Item not found'); return; }
      if (ornament.Is_Sold) { message.warning('Already sold.'); return; }
      if (!ornament.Is_Stock_Available) { message.warning('Not available.'); return; }
      addItem(ornament);
      setLastScannedItem(ornament);
      setSearchInput('');
      message.success(`${ornament.Type_Name || 'Item'} added — ${formatCurrency(ornament.Total_Price)}`);
    } catch { message.error('Not found.'); }
  };

  // ── Gift Voucher validation ────────────────────────────────────────────────
  const applyVoucher = async () => {
    if (!voucherCode.trim()) return;
    try {
      const res = await dayCloseApi.checkVoucher(voucherCode.trim());
      const v = res.data.data;
      setVoucherEntry({ voucherId: v.Voucher_ID, availableBalance: parseFloat(v.Balance_Amount), applyAmount: Math.min(parseFloat(v.Balance_Amount), adjustments.netPayable), applied: true });
      setVoucherCode('');
      message.success(`Gift voucher applied — ₹${parseFloat(v.Balance_Amount).toLocaleString('en-IN')} available`);
    } catch (err) { message.error(err.response?.data?.message || 'Invalid voucher.'); }
  };

  // ── Old gold calculation (live preview before voucher creation) ────────────
  const oldGoldPreview = useMemo(() => {
    const { weight, purity, rate, meltDeduct } = oldGoldEntry;
    if (!weight || !purity || !rate) return { netWeight: 0, value: 0 };
    const result = calculateOldGoldExchange({ weight, purityPercent: purity, goldRate: rate, meltingDeductPercent: meltDeduct || 2 });
    return { netWeight: parseFloat(result.netWeight), value: parseFloat(result.value) };
  }, [oldGoldEntry.weight, oldGoldEntry.purity, oldGoldEntry.rate, oldGoldEntry.meltDeduct]);

  // ── Create a real Old Gold Exchange voucher, then apply it to the bill ─────
  const createOldGoldMutation = useMutation({
    mutationFn: () => oldGoldApi.createExchange({
      Customer_ID: customer?.Customer_ID || null,
      Old_Gold_Weight: oldGoldEntry.weight,
      Purity_Percentage: oldGoldEntry.purity,
      Melting_Deduction_Percent: oldGoldEntry.meltDeduct,
      Gold_Rate_At_Exchange: oldGoldEntry.rate,
    }),
    onSuccess: (res) => {
      const v = res.data.data;
      const value = parseFloat(v.Total_Value);
      setOldGoldEntry(prev => ({ ...prev, value, applied: true, exchangeId: v.Exchange_ID, voucherNumber: v.Voucher_Number }));
      setOldGold(oldGoldEntry.weight, value);
      message.success(`Old gold voucher ${v.Voucher_Number} created — ${formatCurrency(value)}`);
    },
    onError: (err) => message.error(err.response?.data?.message || 'Failed to create old gold voucher.'),
  });

  // ── Payment splits management ─────────────────────────────────────────────
  const updateSplit = (idx, field, value) => {
    setPaymentSplits(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: value };
      return next;
    });
  };

  const addSplit = () => setPaymentSplits(prev => [...prev, { mode: 'UPI', amount: adjustments.remaining, reference: '' }]);
  const removeSplit = (idx) => setPaymentSplits(prev => prev.filter((_, i) => i !== idx));

  // ── PAN validation ─────────────────────────────────────────────────────────
  const validatePAN = (pan) => {
    if (!pan) return false;
    return PAN_REGEX.test(pan.toUpperCase());
  };

  // ── Create sale ────────────────────────────────────────────────────────────
  const createSaleMutation = useMutation({
    mutationFn: (data) => salesApi.create(data),
    onSuccess: (res) => {
      const { sale, items: saleItems } = res.data.data;
      message.success(`✅ Invoice ${sale.Invoice_Number} created!`);
      emitCheckoutComplete(sale);
      printThermalReceipt(sale, saleItems, { Company_Name: user?.companyName, GST_No: user?.gstNo });
      clearCart();
      setPaymentSplits([{ mode: 'Cash', amount: 0, reference: '' }]);
      setOldGoldEntry({ weight: 0, purity: 91.67, meltDeduct: 2, rate: goldRate || 0, value: 0, applied: false, exchangeId: null, voucherNumber: null });
      setAppliedSchemeAdjustments([]);
      setSchemeDrafts({});
      setSchemeSearchQuery('');
      setSchemeSearchTrigger('');
      setVoucherEntry({ voucherId: null, availableBalance: 0, applyAmount: 0, applied: false });
      setLoyaltyPointsUsed(0);
      setPanNumber('');
      setSaleType('Retail');
      setInvoiceType('Tax Invoice');
      setWalkInName('');
      setWalkInMobile('');
      setLastScannedItem(null);
      setCheckoutOpen(false);
    },
    onError: (err) => message.error(err.response?.data?.message || 'Sale failed.'),
  });

  const confirmSale = () => {
    if (adjustments.isPanRequired && !validatePAN(panNumber)) {
      message.error('Valid PAN number required for bills above ₹2,00,000.');
      return;
    }
    if (!adjustments.isSettled) {
      message.warning(`Balance of ${formatCurrency(adjustments.remaining)} is still pending.`);
      return;
    }
    if (!billedByUserId) {
      message.error('Select which staff member is billing this sale.');
      return;
    }
    const billedByStaff = (staffList || []).find(s => s.User_ID === billedByUserId);
    createSaleMutation.mutate({
      Counter_ID: counterId,
      Counter_Name: counterName,
      Operator_Name: billedByStaff?.Full_Name || user?.fullName || user?.username,
      PAN_Number: panNumber || null,
      PAN_Verified: validatePAN(panNumber),
      Scheme_Adjustments: appliedSchemeAdjustments.map(a => ({
        Member_ID: a.Member_ID, Amount: a.balanceAmount, BonusAmount: a.bonusAmount,
      })),
      Voucher_Amount: adjustments.voucher,
      Voucher_ID: voucherEntry.applied ? voucherEntry.voucherId : null,
      Old_Gold_Exchange_ID: oldGoldEntry.exchangeId,
      Old_Gold_Exchange_Amount: adjustments.oldGold,
      Old_Gold_Weight: oldGoldEntry.weight,
      Loyalty_Points_Used: loyaltyPointsUsed,
      payments: paymentSplits.filter(p => parseFloat(p.amount) > 0)
        .map(p => ({ ...p, Bank_Account_ID: BANK_SELECT_MODES.has(p.mode) ? (p.bankAccountId || null) : null })),
      items: items.map(i => ({
        Ornament_ID: i.Ornament_ID, Article_Number: i.Article_Number,
        Item_Type_Name: i.Type_Name, Quantity: 1,
        Gross_Weight: i.Gross_Weight, Net_Gold_Weight: i.Net_Gold_Weight,
        Stone_Weight: i.Stone_Weight || 0, Purity_Code: i.Purity_Code,
        Gold_Rate_Per_Gram: i.Current_Gold_Rate,
        Making_Charge_Applied: i.Final_Making_Charge_Total,
        Wastage_Amount_Applied: i.Wastage_Amount || 0,
        Discount_Amount_Applied: i.Discount_Amount || 0,
        Taxable_Value: i.Taxable_Value, GST_Percentage_Applied: 3,
        GST_Amount: i.GST_Amount, Total_Line_Price: i.Total_Price,
      })),
      Customer_ID: customer?.Customer_ID || null,
      Customer_Name: customer?.Customer_Name || walkInName.trim() || 'Walk-in',
      Customer_Mobile: customer?.Mobile_1 || walkInMobile.trim() || null,
      Payment_Mode: paymentSplits[0]?.mode || 'Cash',
      Payment_Reference: paymentSplits[0]?.reference || null,
      Amount_Paid: adjustments.totalPaid,
      Balance_Amount: adjustments.remaining,
      Payment_Status: adjustments.isSettled ? 'Paid' : 'Partial',
      Sale_Type: saleType, Invoice_Type: invoiceType,
    });
  };

  // ── Keyboard shortcuts (tenant-configurable — see ShortcutContext) ─────────
  // save: no checkout open -> open it (if the cart has items); checkout open
  //   -> confirm the sale, same as clicking the big green button.
  // new: clear the cart and start over, same as the "Clear" button.
  // search: jumps focus to the barcode/article/design box.
  // lookup (F2): opens the Customer Search modal — the "show me everything
  //   for this field" the F2 spec calls for, applied to the field a
  //   cashier looks up mid-sale most often.
  // cancel: closes whichever modal is currently open.
  useActionShortcuts({
    onSave: () => {
      if (checkoutOpen) { confirmSale(); return; }
      if (items.length === 0) { message.warning('Add at least one item before checkout.'); return; }
      setCheckoutOpen(true);
    },
    onNew: () => { clearCart(); setLastScannedItem(null); },
    onSearch: () => barcodeInputRef.current?.focus(),
    onLookup: () => setCustomerModalOpen(true),
    onCancel: () => {
      if (checkoutOpen) setCheckoutOpen(false);
      else if (customerModalOpen) setCustomerModalOpen(false);
    },
  });

  // ── Cart table columns ────────────────────────────────────────────────────
  const cartColumns = [
    { title: '#', width: 28, render: (_, __, i) => <Text style={{ color: '#888', fontSize: 10 }}>{i+1}</Text> },
    { title: '', width: 44, render: (_, r) => (
      <div style={{ width: 36, height: 36, borderRadius: 6, overflow: 'hidden', background: '#f5f5f5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {r.Product_Image_URL
          ? <Image src={r.Product_Image_URL} width={36} height={36} style={{ objectFit: 'cover' }} />
          : <PictureOutlined style={{ fontSize: 14, color: '#ccc' }} />}
      </div>
    )},
    { title: 'Item', render: (_, r) => (
      <div>
        <Text strong style={{ fontSize: 12 }}>{r.Type_Name || 'Item'}</Text>
        <br /><Text style={{ fontSize: 10, color: '#888' }}>{r.Article_Number}</Text>
        {r.Purity_Code && <Tag color="gold" style={{ fontSize: 9, padding: '0 4px', marginLeft: 4 }}>{r.Purity_Code}</Tag>}
      </div>
    )},
    { title: 'Gross Wt', width: 72, render: (_, r) => (
      <div style={{ fontSize: 10 }}>
        <div style={{ fontWeight: 600 }}>{formatWeight(r.Gross_Weight)}</div>
        {parseFloat(r.Stone_Weight||0) > 0 && <div style={{ color: '#888' }}>St: {formatWeight(r.Stone_Weight)}</div>}
      </div>
    )},
    { title: 'Net Wt', width: 68, render: (_, r) => {
      const net = parseFloat(r.Net_Gold_Weight || r.Gross_Weight || 0) - parseFloat(r.Stone_Weight || 0);
      return (
        <div style={{ fontSize: 10 }}>
          <Text style={{ color: '#B8860B', fontWeight: 600 }}>{formatWeight(Math.max(0, net))}</Text>
          <div style={{ color: '#aaa', fontSize: 9 }}>gold wt</div>
        </div>
      );
    }},
    { title: 'Making', width: 72, dataIndex: 'Final_Making_Charge_Total', render: v => <Text style={{ fontSize: 10 }}>{formatCurrency(v)}</Text> },
    { title: 'Amount', width: 100, dataIndex: 'Total_Price', render: v => <Text strong style={{ color: '#B8860B', fontSize: 12 }}>{formatCurrency(v)}</Text> },
    { title: '', width: 28, render: (_, r) => <Button type="text" danger size="small" icon={<DeleteOutlined />} onClick={() => removeItem(r.Ornament_ID)} /> },
  ];

  // ── Cart grid card (mobile) ─────────────────────────────────────────────────
  const renderCartCard = (r, i) => {
    const net = parseFloat(r.Net_Gold_Weight || r.Gross_Weight || 0) - parseFloat(r.Stone_Weight || 0);
    return (
      <div key={r.Ornament_ID} className="pos-cart-card">
        <div className="pos-cart-card-thumb">
          {r.Product_Image_URL
            ? <Image src={r.Product_Image_URL} width={56} height={56} style={{ objectFit: 'cover' }} />
            : <PictureOutlined style={{ fontSize: 20, color: '#ccc' }} />}
        </div>
        <div className="pos-cart-card-body">
          <div className="pos-cart-card-title">
            <Text strong style={{ fontSize: 12 }}>{r.Type_Name || 'Item'}</Text>
            {r.Purity_Code && <Tag color="gold" style={{ fontSize: 9, padding: '0 4px', margin: 0 }}>{r.Purity_Code}</Tag>}
          </div>
          <Text style={{ fontSize: 10, color: '#888' }}>{r.Article_Number}</Text>
          <div className="pos-cart-card-meta">
            <span>Gr {formatWeight(r.Gross_Weight)}</span>
            <span style={{ color: '#B8860B', fontWeight: 600 }}>Au {formatWeight(Math.max(0, net))}</span>
            <span>Mkg {formatCurrency(r.Final_Making_Charge_Total)}</span>
          </div>
        </div>
        <div className="pos-cart-card-side">
          <Text strong style={{ color: '#B8860B', fontSize: 13 }}>{formatCurrency(r.Total_Price)}</Text>
          <Button type="text" danger size="small" icon={<DeleteOutlined />} onClick={() => removeItem(r.Ornament_ID)} />
        </div>
      </div>
    );
  };

  return (
    <div style={{ height: 'calc(100vh - 128px)', display: 'flex', flexDirection: 'column' }}>
      {/* Counter Header */}
      <div style={{
        background: 'linear-gradient(135deg, #1a1a1a, #262626)',
        borderLeft: '3px solid #B8860B',
        padding: '9px 18px', display: 'flex', alignItems: 'center', gap: 14,
        borderRadius: 8, marginBottom: 10,
      }}>
        <Space size={8}>
          <ShopOutlined style={{ color: '#FFD700', fontSize: 15 }} />
          <Text style={{ color: '#FFD700', fontWeight: 700, letterSpacing: 0.3 }}>{counterName}</Text>
        </Space>
        <Divider type="vertical" style={{ borderColor: 'rgba(255,255,255,0.15)', height: 18, margin: 0 }} />
        <Space size={10}>
          {[{ l: '22K', v: rates?.rate_22k }, { l: 'Silver', v: rates?.rate_silver }].map(r => r.v && (
            <Space key={r.l} size={4} style={{ fontSize: 11, color: '#ccc' }}>
              <Tag color="gold" style={{ fontSize: 9, margin: 0 }}>{r.l}</Tag>
              ₹{parseFloat(r.v).toLocaleString('en-IN')}/g
            </Space>
          ))}
        </Space>
        <Button
          size="small" icon={<HistoryOutlined />} style={{ marginLeft: 'auto', borderColor: '#B8860B', color: '#B8860B', background: 'transparent' }}
          onClick={() => setRecentBillsOpen(true)}
        >
          Recent Bills
        </Button>
      </div>

      <Row gutter={10} style={{ flex: 1, minHeight: 0 }}>
        {/* ── LEFT: Customer + Adjustments ─────────────────────────── */}
        <Col xs={{ span: 24, order: 3 }} lg={{ span: 5, order: 1 }}>
          <Space direction="vertical" style={{ width: '100%' }} size={8}>
            {/* Customer */}
            <div ref={customerRef}>
            <Card size="small" title="Customer" style={{ borderRadius: 8 }}
              extra={<Button type="link" size="small" icon={<UserOutlined />} onClick={() => setCustomerModalOpen(true)}>Select</Button>}>
              {customer ? (
                <Space direction="vertical" size={2} style={{ width: '100%' }}>
                  <Text strong style={{ fontSize: 12 }}>{customer.Customer_Name}</Text>
                  <Text type="secondary" style={{ fontSize: 11 }}>{customer.Mobile_1}</Text>
                  <Tag color="blue" style={{ fontSize: 10 }}>Loyalty: {customer.Loyalty_Points || 0} pts</Tag>
                  {/* Redemption was accrue-only everywhere in the app —
                      Loyalty_Points_Used was accepted by the API and
                      stored, but never actually reduced what was owed. */}
                  {parseInt(customer.Loyalty_Points || 0, 10) > 0 && (
                    <Space size={4} style={{ marginTop: 2 }}>
                      <InputNumber size="small" min={0} max={parseInt(customer.Loyalty_Points || 0, 10)}
                        value={loyaltyPointsUsed} onChange={(v) => setLoyaltyPointsUsed(Math.max(0, parseInt(v || 0, 10)))}
                        style={{ width: 80 }} placeholder="Redeem" />
                      <Text type="secondary" style={{ fontSize: 10 }}>
                        pts {loyaltyPointsUsed > 0 ? `= -${formatCurrency(round2(loyaltyPointsUsed * loyaltyPointValue))}` : `(₹${loyaltyPointValue}/pt)`}
                      </Text>
                    </Space>
                  )}
                </Space>
              ) : <Text type="secondary" style={{ fontSize: 12 }}>Walk-in Customer</Text>}
            </Card>
            </div>

            <div ref={adjustmentsRef} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {/* Old Gold */}
            <Card size="small" title={<span><TagOutlined /> Old Gold Exchange</span>} style={{ borderRadius: 8 }}>
              {oldGoldEntry.applied ? (
                <Space direction="vertical" size={2} style={{ width: '100%' }}>
                  <Text style={{ fontSize: 10, color: '#888' }}>{oldGoldEntry.voucherNumber}</Text>
                  <Text style={{ fontSize: 11, color: '#fa8c16' }}>{oldGoldEntry.weight}g @ {oldGoldEntry.purity}% exchanged</Text>
                  <Text strong style={{ color: '#B8860B' }}>-{formatCurrency(oldGoldEntry.value)}</Text>
                  <Button size="small" danger onClick={() => setOldGoldEntry({ weight: 0, purity: 91.67, meltDeduct: 2, rate: goldRate || 0, value: 0, applied: false, exchangeId: null, voucherNumber: null })}>Remove</Button>
                </Space>
              ) : (
                <Space direction="vertical" size={6} style={{ width: '100%' }}>
                  <Row gutter={6}>
                    <Col xs={12}>
                      <Text style={{ fontSize: 10, color: '#888' }}>Gross Wt (g)</Text>
                      <InputNumber style={{ width: '100%' }} step={0.001} min={0.001} size="small"
                        value={oldGoldEntry.weight}
                        onChange={v => setOldGoldEntry(p => ({ ...p, weight: v || 0 }))} />
                    </Col>
                    <Col xs={12}>
                      <Text style={{ fontSize: 10, color: '#888' }}>Purity</Text>
                      <Select size="small" style={{ width: '100%' }} value={oldGoldEntry.purity}
                        onChange={v => setOldGoldEntry(p => ({ ...p, purity: v }))}>
                        <Option value={99.9}>24K (99.9%)</Option><Option value={91.67}>22K (91.67%)</Option>
                        <Option value={75}>18K (75%)</Option><Option value={70}>Mixed (70%)</Option>
                      </Select>
                    </Col>
                  </Row>
                  <Row gutter={6}>
                    <Col xs={12}>
                      <Text style={{ fontSize: 10, color: '#888' }}>Rate (₹/g)</Text>
                      <InputNumber style={{ width: '100%' }} min={1} size="small"
                        value={oldGoldEntry.rate}
                        onChange={v => setOldGoldEntry(p => ({ ...p, rate: v || 0 }))} />
                    </Col>
                    <Col xs={12}>
                      <Text style={{ fontSize: 10, color: '#888' }}>Melting Ded. %</Text>
                      <InputNumber style={{ width: '100%' }} min={0} max={20} size="small"
                        value={oldGoldEntry.meltDeduct}
                        onChange={v => setOldGoldEntry(p => ({ ...p, meltDeduct: v || 0 }))} />
                    </Col>
                  </Row>
                  {oldGoldPreview.value > 0 && (
                    <div style={{ fontSize: 10, color: '#888', display: 'flex', justifyContent: 'space-between' }}>
                      <span>Net Wt: {oldGoldPreview.netWeight}g</span>
                      <Text strong style={{ color: '#B8860B', fontSize: 12 }}>{formatCurrency(oldGoldPreview.value)}</Text>
                    </div>
                  )}
                  {oldGoldPreview.value > 0 && (
                    <Button size="small" block loading={createOldGoldMutation.isPending}
                      style={{ background: '#fa8c16', borderColor: '#fa8c16', color: '#fff' }}
                      onClick={() => createOldGoldMutation.mutate()}>
                      Create Voucher & Apply {formatCurrency(oldGoldPreview.value)}
                    </Button>
                  )}
                </Space>
              )}
            </Card>

            {/* Scheme */}
            <Card size="small" title={<span><GoldOutlined /> 🪙 Scheme Adjustment</span>} style={{ borderRadius: 8 }}>
              <Space direction="vertical" size={6} style={{ width: '100%' }}>
                <Space.Compact style={{ width: '100%' }}>
                  <Input size="small" placeholder="Member ID / Mobile / Name" value={schemeSearchQuery}
                    onChange={e => setSchemeSearchQuery(e.target.value)} onPressEnter={runSchemeSearch} />
                  <Button size="small" icon={<SearchOutlined />} loading={schemeSearching} onClick={runSchemeSearch} />
                </Space.Compact>

                {(schemeSearchResults || []).map(s => {
                  const draft = schemeDrafts[s.Member_ID] || {};
                  const alreadyApplied = appliedSchemeAdjustments.find(a => a.Member_ID === s.Member_ID);
                  return (
                    <div key={s.Member_ID} style={{ padding: '6px 8px', background: '#fafafa', borderRadius: 6, border: '1px solid #f0f0f0' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                        <Text style={{ fontSize: 11, fontWeight: 600 }}>{s.Member_Name}</Text>
                        <Tag color={s.Status === 'Matured' ? 'gold' : 'blue'} style={{ fontSize: 9 }}>{s.Status}</Tag>
                      </div>
                      <Text style={{ fontSize: 10, color: '#888' }}>{s.Member_Number} · {s.Mobile}</Text>

                      <Row gutter={4} style={{ marginTop: 4 }}>
                        <Col xs={12}>
                          <Tooltip title={!s.Balance_Eligible ? 'Active scheme — balance adjustment not enabled by admin' : `Available: ${formatCurrency(s.Available_Balance)}`}>
                            <InputNumber size="small" style={{ width: '100%' }} min={0} max={s.Available_Balance}
                              disabled={!s.Balance_Eligible || s.Available_Balance <= 0}
                              placeholder={`Bal ₹${parseFloat(s.Available_Balance).toLocaleString('en-IN')}`}
                              value={draft.balance}
                              onChange={v => setSchemeDraft(s.Member_ID, 'balance', v || 0)} />
                          </Tooltip>
                        </Col>
                        <Col xs={12}>
                          <Tooltip title={!s.Bonus_Eligible ? 'Active scheme — bonus adjustment not enabled by admin' : `Available bonus: ${formatCurrency(s.Available_Bonus)}`}>
                            <InputNumber size="small" style={{ width: '100%' }} min={0} max={s.Available_Bonus}
                              disabled={!s.Bonus_Eligible || s.Available_Bonus <= 0}
                              placeholder={`Bonus ₹${parseFloat(s.Available_Bonus).toLocaleString('en-IN')}`}
                              value={draft.bonus}
                              onChange={v => setSchemeDraft(s.Member_ID, 'bonus', v || 0)} />
                          </Tooltip>
                        </Col>
                      </Row>
                      <Button size="small" block style={{ marginTop: 4, background: '#52c41a', borderColor: '#52c41a', color: '#fff', fontSize: 10 }}
                        disabled={!draft.balance && !draft.bonus}
                        onClick={() => applySchemeAdjustment(s)}>
                        {alreadyApplied ? 'Update' : 'Apply'}
                      </Button>
                    </div>
                  );
                })}

                {appliedSchemeAdjustments.map(a => (
                  <div key={a.Member_ID} style={{ padding: '6px 8px', background: '#f6ffed', borderRadius: 6, border: '1px solid #b7eb8f' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Text style={{ fontSize: 11, color: '#52c41a' }}>✅ {a.Member_Number}</Text>
                      <Button size="small" danger type="text" icon={<MinusCircleOutlined />} onClick={() => removeSchemeAdjustment(a.Member_ID)} />
                    </div>
                    {a.balanceAmount > 0 && <Text style={{ fontSize: 11, color: '#B8860B', display: 'block' }}>Balance: -{formatCurrency(a.balanceAmount)}</Text>}
                    {a.bonusAmount > 0 && <Text style={{ fontSize: 11, color: '#722ed1', display: 'block' }}>Bonus: -{formatCurrency(a.bonusAmount)}</Text>}
                  </div>
                ))}
              </Space>
            </Card>

            {/* Gift Voucher */}
            <Card size="small" title={<span><WalletOutlined /> Gift Voucher</span>} style={{ borderRadius: 8 }}>
              {voucherEntry.applied ? (
                <Space direction="vertical" size={2} style={{ width: '100%' }}>
                  <Text style={{ fontSize: 11, color: '#722ed1' }}>✅ Voucher Applied</Text>
                  <Text strong style={{ color: '#B8860B' }}>-{formatCurrency(voucherEntry.applyAmount)}</Text>
                  <Button size="small" danger onClick={() => setVoucherEntry({ voucherId: null, availableBalance: 0, applyAmount: 0, applied: false })}>Remove</Button>
                </Space>
              ) : (
                <Space.Compact style={{ width: '100%' }}>
                  <Input size="small" placeholder="Voucher code" value={voucherCode} onChange={e => setVoucherCode(e.target.value)} onPressEnter={applyVoucher} />
                  <Button size="small" onClick={applyVoucher} style={{ background: '#722ed1', borderColor: '#722ed1', color: '#fff' }}>Apply</Button>
                </Space.Compact>
              )}
            </Card>
            </div>
          </Space>
        </Col>

        {/* ── CENTER: Search + Cart ───────────────────────────────── */}
        <Col xs={{ span: 24, order: 1 }} lg={{ span: 12, order: 2 }}>
          <div ref={searchRef}>
          <Space.Compact style={{ width: '100%', marginBottom: 8 }}>
            <Select value={searchType} onChange={setSearchType} style={{ width: 130 }} size="large">
              <Option value="barcode"><ScanOutlined /> Barcode</Option>
              <Option value="article">Article No</Option>
              <Option value="design">Design No</Option>
            </Select>
            <Input ref={barcodeInputRef} placeholder="Scan barcode or enter article number" size="large"
              value={searchInput} onChange={e => setSearchInput(e.target.value)} onPressEnter={handleSearch} style={{ flex: 1 }} />
            <Button type="primary" size="large" icon={<SearchOutlined />} onClick={handleSearch}
              style={{ background: '#B8860B', borderColor: '#B8860B' }}>Add</Button>
          </Space.Compact>
          </div>

          {lastScannedItem && (
            <Card size="small" style={{ marginBottom: 8, borderRadius: 8, background: '#FFFDF5', border: '1px solid #F0D999' }} bodyStyle={{ padding: 8 }}>
              <Space align="start" size={10}>
                <div style={{
                  width: 60, height: 60, borderRadius: 6, overflow: 'hidden', flexShrink: 0,
                  background: '#f5f5f5', display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {lastScannedItem.Product_Image_URL
                    ? <Image src={lastScannedItem.Product_Image_URL} alt={lastScannedItem.Type_Name} width={60} height={60} style={{ objectFit: 'cover' }} />
                    : <PictureOutlined style={{ fontSize: 22, color: '#ccc' }} />}
                </div>
                <div style={{ minWidth: 0 }}>
                  <Space size={4}>
                    <Text strong style={{ fontSize: 12 }}>{lastScannedItem.Type_Name || 'Item'}</Text>
                    {lastScannedItem.Purity_Code && <Tag color="gold" style={{ fontSize: 9, margin: 0 }}>{lastScannedItem.Purity_Code}</Tag>}
                  </Space>
                  <div style={{ fontSize: 11, color: '#888' }}>
                    {lastScannedItem.Article_Number} · {formatWeight(lastScannedItem.Gross_Weight)}
                  </div>
                  <Text strong style={{ color: '#B8860B', fontSize: 12 }}>{formatCurrency(lastScannedItem.Total_Price)}</Text>
                </div>
              </Space>
            </Card>
          )}

          <div ref={cartRef}>
          <Card size="small"
            title={<Space><Text strong>Cart — {counterName}</Text><Badge count={items.length} style={{ background: '#B8860B' }} /></Space>}
            extra={<Button size="small" icon={<ClearOutlined />} onClick={() => { clearCart(); emitClearDisplay(); setLastScannedItem(null); }}>Clear</Button>}
            style={{ borderRadius: 8 }} bodyStyle={{ padding: 0 }}>
            {items.length === 0
              ? <Empty description="Scan items to add to cart" style={{ padding: '28px 0' }} />
              : isMobile
                ? <div className="pos-cart-grid">{items.map(renderCartCard)}</div>
                : <Table
              scroll={{ x: "max-content" }} columns={cartColumns} dataSource={items} rowKey="Ornament_ID" pagination={false} size="small" />
            }
          </Card>
          </div>
        </Col>

        {/* ── RIGHT: Live Bill Summary ────────────────────────────── */}
        <Col xs={{ span: 24, order: 2 }} lg={{ span: 7, order: 3 }}>
          <div ref={billRef}>
          <Card size="small" title="Bill Summary" style={{ borderRadius: 8, height: '100%' }} bodyStyle={{ padding: '14px 16px' }}>
            <Space direction="vertical" style={{ width: '100%' }} size={5}>
              {/* Breakdown */}
              {[
                { label: 'Gold Value', value: items.reduce((s, i) => s + parseFloat(i.Net_Gold_Weight||0)*parseFloat(i.Current_Gold_Rate||0), 0) },
                { label: 'Making Charges', value: items.reduce((s, i) => s + parseFloat(i.Final_Making_Charge_Total||0), 0) },
                { label: 'Wastage', value: items.reduce((s, i) => s + parseFloat(i.Wastage_Amount||0), 0) },
                { label: 'GST (3%)', value: cartSubtotal.gst },
              ].map(r => (
                <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                  <Text type="secondary">{r.label}</Text>
                  <Text>{formatCurrency(r.value)}</Text>
                </div>
              ))}

              <Divider style={{ margin: '6px 0' }} />

              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <Text strong>Subtotal (MRP)</Text>
                <Text strong>{formatCurrency(cartSubtotal.total)}</Text>
              </div>

              {/* Adjustments */}
              {adjustments.oldGold > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                  <Text style={{ color: '#fa8c16' }}>Old Gold Exchange</Text>
                  <Text style={{ color: '#fa8c16' }}>- {formatCurrency(adjustments.oldGold)}</Text>
                </div>
              )}
              {adjustments.scheme > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                  <Text style={{ color: '#52c41a' }}>Scheme Adjustment</Text>
                  <Text style={{ color: '#52c41a' }}>- {formatCurrency(adjustments.scheme)}</Text>
                </div>
              )}
              {adjustments.bonus > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                  <Text style={{ color: '#722ed1' }}>Scheme Bonus</Text>
                  <Text style={{ color: '#722ed1' }}>- {formatCurrency(adjustments.bonus)}</Text>
                </div>
              )}
              {adjustments.voucher > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                  <Text style={{ color: '#722ed1' }}>Gift Voucher</Text>
                  <Text style={{ color: '#722ed1' }}>- {formatCurrency(adjustments.voucher)}</Text>
                </div>
              )}
              {adjustments.loyalty > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                  <Text style={{ color: '#1890ff' }}>Loyalty Points ({loyaltyPointsUsed} pts)</Text>
                  <Text style={{ color: '#1890ff' }}>- {formatCurrency(adjustments.loyalty)}</Text>
                </div>
              )}

              <Divider style={{ margin: '6px 0' }} />

              {/* Net Payable */}
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <Text strong style={{ fontSize: 15 }}>NET PAYABLE</Text>
                <Text strong style={{ fontSize: 20, color: '#B8860B' }}>{formatCurrency(adjustments.netPayable)}</Text>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                <Text type="secondary">Total Gross Weight</Text>
                <Text>{formatWeight(items.reduce((s,i)=>s+parseFloat(i.Gross_Weight||0),0))}</Text>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                <Text type="secondary">Total Net Gold Weight</Text>
                <Text style={{ color: '#B8860B', fontWeight: 600 }}>
                  {formatWeight(items.reduce((s,i)=>s+parseFloat(i.Net_Gold_Weight||i.Gross_Weight||0),0))}
                </Text>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                <Text type="secondary">Total Stone Weight</Text>
                <Text>{formatWeight(items.reduce((s,i)=>s+parseFloat(i.Stone_Weight||0),0))}</Text>
              </div>

              {/* PAN Warning */}
              {adjustments.isPanRequired && (
                <Alert message={<span><ExclamationCircleOutlined /> PAN required (bill &gt; ₹2 Lakh)</span>}
                  type="warning" showIcon style={{ fontSize: 11, padding: '4px 8px' }} />
              )}

              <Divider style={{ margin: '8px 0 6px' }} />
              <Button ref={checkoutRef} type="primary" block size="large" disabled={items.length === 0}
                onClick={() => setCheckoutOpen(true)}
                style={{ background: '#B8860B', borderColor: '#B8860B', height: 44, fontWeight: 700 }}
                icon={<PrinterOutlined />}>
                CHECKOUT & PRINT
              </Button>
            </Space>
          </Card>
          </div>
        </Col>
      </Row>

      {/* ── Customer Search Modal ─────────────────────────────────── */}
      <CustomerSearchModal open={customerModalOpen} onClose={() => setCustomerModalOpen(false)}
        onSelect={c => { setCustomer(c); setLoyaltyPointsUsed(0); setCustomerModalOpen(false); }} />

      {/* ── Checkout Modal with Multi-Payment ────────────────────── */}
      <Modal title={`Checkout — ${counterName}`} open={checkoutOpen}
        onCancel={() => setCheckoutOpen(false)} footer={null} width={560} destroyOnClose>

        {/* Bill Summary at top */}
        <div style={{ background: '#f9f9f9', borderRadius: 8, padding: '12px 16px', marginBottom: 16 }}>
          <Row gutter={16}>
            <Col xs={8}><Statistic title="Bill Total" value={adjustments.billTotal} formatter={v => formatCurrency(v)} valueStyle={{ fontSize: 15, color: '#B8860B' }} /></Col>
            <Col xs={8}><Statistic title="Adjustments" value={adjustments.oldGold + adjustments.scheme + adjustments.bonus + adjustments.voucher + adjustments.loyalty} formatter={v => `- ${formatCurrency(v)}`} valueStyle={{ fontSize: 15, color: '#52c41a' }} /></Col>
            <Col xs={8}><Statistic title="Net Payable" value={adjustments.netPayable} formatter={v => formatCurrency(v)} valueStyle={{ fontSize: 16, fontWeight: 700, color: '#B8860B' }} /></Col>
          </Row>
        </div>

        {/* Billing Staff — who actually processed this sale (may differ from the login) */}
        <div ref={billedByRef} style={{ marginBottom: 14 }}>
          <Text style={{ fontSize: 12, color: '#888', display: 'block', marginBottom: 4 }}>Billed By</Text>
          <Select
            size="large"
            style={{ width: '100%' }}
            placeholder="Select the staff member billing this sale"
            value={billedByUserId}
            onChange={setBilledByUserId}
            showSearch
            optionFilterProp="children"
          >
            {(staffList || []).map(s => (
              <Option key={s.User_ID} value={s.User_ID}>{s.Full_Name} {s.Role_Name ? `— ${s.Role_Name}` : ''}</Option>
            ))}
          </Select>
        </div>

        {/* Sale Type / Invoice Type */}
        <Row gutter={12} style={{ marginBottom: 14 }}>
          <Col xs={12}>
            <Text style={{ fontSize: 12, color: '#888', display: 'block', marginBottom: 4 }}>Sale Type</Text>
            <Select size="large" style={{ width: '100%' }} value={saleType} onChange={setSaleType}>
              <Option value="Retail">Retail</Option>
              <Option value="Wholesale">Wholesale</Option>
            </Select>
          </Col>
          <Col xs={12}>
            <Text style={{ fontSize: 12, color: '#888', display: 'block', marginBottom: 4 }}>Invoice Type</Text>
            <Select size="large" style={{ width: '100%' }} value={invoiceType} onChange={setInvoiceType}>
              <Option value="Tax Invoice">Tax Invoice</Option>
              <Option value="Cash Memo">Cash Memo</Option>
            </Select>
          </Col>
        </Row>

        {/* PAN Field */}
        {adjustments.isPanRequired && (
          <div style={{ marginBottom: 14 }}>
            <Alert message="Bill exceeds ₹2,00,000 — PAN number is mandatory as per GST law" type="warning" showIcon style={{ marginBottom: 8, fontSize: 11 }} />
            <Input
              size="large"
              placeholder="Enter PAN Number (e.g. ABCDE1234F)"
              value={panNumber}
              onChange={e => { const v = e.target.value.toUpperCase(); setPanNumber(v); setPanVerified(validatePAN(v)); }}
              suffix={panVerified ? <CheckCircleFilled style={{ color: '#52c41a' }} /> : <ExclamationCircleOutlined style={{ color: '#fa8c16' }} />}
              style={{ borderColor: panVerified ? '#52c41a' : panNumber ? '#fa8c16' : undefined }}
            />
            {panNumber && !panVerified && <Text type="danger" style={{ fontSize: 11 }}>Invalid PAN format. Expected: ABCDE1234F</Text>}
          </div>
        )}

        {/* Customer Name if walk-in */}
        {!customer?.Customer_ID && (
          <Row gutter={12} style={{ marginBottom: 12 }}>
            <Col xs={14}><Input placeholder="Customer Name (optional)" size="large" value={walkInName} onChange={e => setWalkInName(e.target.value)} /></Col>
            <Col xs={10}><Input placeholder="Mobile (optional)" size="large" value={walkInMobile} onChange={e => setWalkInMobile(e.target.value)} /></Col>
          </Row>
        )}

        {/* Multi-Payment Splits */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <Text strong style={{ fontSize: 13 }}>Payment Breakdown</Text>
            {!isUnofficial && (
              <Button size="small" icon={<PlusOutlined />} onClick={addSplit}
                style={{ borderColor: '#B8860B', color: '#B8860B' }}>Add Payment Mode</Button>
            )}
          </div>
          {isUnofficial && (
            <Alert type="warning" showIcon style={{ marginBottom: 8 }}
              message="Unofficial mode — Cash only" />
          )}
          {paymentSplits.map((split, idx) => (
            <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <Select value={split.mode} onChange={v => updateSplit(idx, 'mode', v)} style={{ width: 165 }} size="large" disabled={isUnofficial}>
                  {(isUnofficial ? PAYMENT_MODES.filter(m => m.key === 'Cash') : PAYMENT_MODES).map(m => <Option key={m.key} value={m.key}>{m.icon} {m.label}</Option>)}
                </Select>
                <InputNumber
                  size="large" style={{ flex: 1 }} min={0}
                  value={split.amount}
                  onChange={v => updateSplit(idx, 'amount', v || 0)}
                  formatter={v => `₹ ${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                />
                <Input size="large" placeholder="Ref / UTR" style={{ width: 100 }}
                  value={split.reference} onChange={e => updateSplit(idx, 'reference', e.target.value)} />
                {paymentSplits.length > 1 && !isUnofficial && (
                  <Button size="large" danger type="text" icon={<MinusCircleOutlined />} onClick={() => removeSplit(idx)} />
                )}
              </div>
              {BANK_SELECT_MODES.has(split.mode) && (
                <Select
                  placeholder="Which bank did this land in?"
                  allowClear size="middle" style={{ width: '100%' }}
                  value={split.bankAccountId || undefined}
                  onChange={v => updateSplit(idx, 'bankAccountId', v || null)}
                >
                  {(bankAccounts || []).map(b => (
                    <Option key={b.Account_ID} value={b.Account_ID}>🏦 {b.Bank_Name} ({b.Account_Number})</Option>
                  ))}
                </Select>
              )}
            </div>
          ))}
        </div>

        {/* Live Balance Tracker */}
        <div style={{ background: adjustments.isSettled ? '#f6ffed' : '#fff7e6', border: `1px solid ${adjustments.isSettled ? '#52c41a' : '#ffa940'}`, borderRadius: 8, padding: '12px 16px', marginBottom: 16 }}>
          <Row gutter={16}>
            <Col xs={8}>
              <Text type="secondary" style={{ fontSize: 11 }}>Amount Entered</Text>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#1890ff' }}>{formatCurrency(adjustments.totalPaid)}</div>
            </Col>
            <Col xs={8}>
              <Text type="secondary" style={{ fontSize: 11 }}>Net Payable</Text>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#B8860B' }}>{formatCurrency(adjustments.netPayable)}</div>
            </Col>
            <Col xs={8}>
              <Text type="secondary" style={{ fontSize: 11 }}>
                {adjustments.isSettled ? '✅ Settled' : '⏳ Remaining'}
              </Text>
              <div style={{ fontSize: 18, fontWeight: 900, color: adjustments.isSettled ? '#52c41a' : '#ff4d4f' }}>
                {adjustments.isSettled ? 'PAID' : formatCurrency(adjustments.remaining)}
              </div>
            </Col>
          </Row>
          {!adjustments.isSettled && (
            <Progress
              percent={Math.min(100, Math.round((adjustments.totalPaid / adjustments.netPayable) * 100))}
              strokeColor="#B8860B" style={{ marginTop: 8, marginBottom: 0 }} size="small"
            />
          )}
        </div>

        {/* Confirm Button */}
        <Button
          type="primary" block size="large"
          loading={createSaleMutation.isPending}
          disabled={!adjustments.isSettled || (adjustments.isPanRequired && !panVerified)}
          onClick={confirmSale}
          style={{ background: adjustments.isSettled ? '#52c41a' : '#d9d9d9', borderColor: adjustments.isSettled ? '#52c41a' : '#d9d9d9', height: 50, fontWeight: 700, fontSize: 15 }}>
          {adjustments.isSettled
            ? '✅ Confirm Sale & Print Invoice'
            : `Enter ₹${formatCurrency(adjustments.remaining)} more to proceed`}
        </Button>
      </Modal>

      {/* ── Recent Bills quick-access panel ───────────────────────── */}
      <Drawer
        title="Recent Bills" placement="right" width={400}
        open={recentBillsOpen} onClose={() => setRecentBillsOpen(false)}
        extra={<Button size="small" onClick={() => { setRecentBillsOpen(false); navigate('/reports/sales-bill-history'); }}>View Full History</Button>}
      >
        <List
          loading={recentBillsLoading}
          dataSource={recentBills || []}
          locale={{ emptyText: 'No bills yet' }}
          renderItem={(bill) => (
            <List.Item
              actions={[
                <Button key="reprint" type="text" size="small" icon={<PrinterOutlined />}
                  loading={reprintingId === bill.Sale_ID} onClick={() => reprintBill(bill.Sale_ID)} />,
              ]}
            >
              <List.Item.Meta
                title={<Text code style={{ fontSize: 11, color: '#B8860B' }}>{bill.Invoice_Number}</Text>}
                description={
                  <Space direction="vertical" size={0}>
                    <Text style={{ fontSize: 12 }}>{bill.Customer_Name || 'Walk-in'}</Text>
                    <Text type="secondary" style={{ fontSize: 11 }}>{dayjs(bill.Sale_Date).format('DD-MMM HH:mm')} · {formatCurrency(bill.Net_Payable_Amount)}</Text>
                  </Space>
                }
              />
            </List.Item>
          )}
        />
      </Drawer>

      <PageTour steps={tourSteps} />
    </div>
  );
}
