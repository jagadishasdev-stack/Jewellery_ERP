import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { formatCurrency, formatWeight } from '../../utils/calculations';
import { displayApi, goldRateApi } from '../../api/modules';

/**
 * Customer-facing display screen.
 *
 * URL params:
 *   /customer-display?counter=Counter%20A&session=<sessionId>
 *
 * Each counter opens its own display window.
 * This screen connects to Socket.io and shows live cart for that counter.
 */
export default function CustomerDisplayPage() {
  const [cartData, setCartData] = useState(null);
  const [isIdle, setIsIdle] = useState(true);
  const [paymentComplete, setPaymentComplete] = useState(false);
  const [shopInfo, setShopInfo] = useState({ name: 'Jewellery Store', footer: '100% BIS Hallmarked Gold' });
  const [goldRates, setGoldRates] = useState({ rate_22k: null, rate_24k: null });
  const socketRef = useRef(null);
  const idleTimer = useRef(null);

  const params = new URLSearchParams(window.location.search);
  const counterName = params.get('counter') || 'Billing Counter';
  const sessionId = params.get('session')
    || (() => { try { return JSON.parse(localStorage.getItem('jewellery-erp-auth') || '{}')?.state?.sessionId; } catch { return null; } })();

  // ── Load shop info and gold rate from API ────────────────────────────────────
  useEffect(() => {
    // Fetch display settings for shop name / messages
    displayApi.getSettings().then(r => {
      const s = r.data.data;
      setShopInfo({
        name: s.Header_Message || 'Welcome',
        footer: s.Footer_Message || '100% BIS Hallmarked Gold',
        bgColor: s.Background_Color || '#1A1A1A',
        accentColor: s.Accent_Color || '#FFD700',
      });
    }).catch(() => {});

    // Fetch this tenant's gold rate
    goldRateApi.getLive().then(r => {
      setGoldRates(r.data.data);
    }).catch(() => {});
  }, []);

  // ── Socket.io connection ─────────────────────────────────────────────────────
  useEffect(() => {
    // Block keyboard/right-click on this TV/display window
    const block = (e) => { e.preventDefault(); };
    document.addEventListener('keydown', block);
    document.addEventListener('contextmenu', block);

    socketRef.current = io('/display', {
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 500,
      reconnectionAttempts: 20,
    });

    socketRef.current.on('connect', () => {
      if (sessionId) {
        socketRef.current.emit('join-session', {
          sessionId, role: 'customer', tenantId: 'display',
        });
      }
      // Also join tenant room for gold rate broadcasts
      const tenantId = (() => { try { return JSON.parse(localStorage.getItem('jewellery-erp-auth') || '{}')?.state?.user?.tenantId; } catch { return null; } })();
      if (tenantId) socketRef.current.emit('join-tenant', { tenantId });
    });

    socketRef.current.on('cart-updated', (data) => {
      setCartData(data);
      setIsIdle(false);
      setPaymentComplete(false);
      resetIdleTimer(30);
    });

    socketRef.current.on('display-cleared', () => {
      setCartData(null);
      setIsIdle(true);
      setPaymentComplete(false);
    });

    socketRef.current.on('payment-complete', () => {
      setPaymentComplete(true);
      setTimeout(() => { setPaymentComplete(false); setCartData(null); setIsIdle(true); }, 7000);
    });

    socketRef.current.on('gold-rate-updated', (rateData) => {
      setGoldRates(prev => ({ ...prev, rate_22k: rateData.rate_22k || rateData.rate, rate_24k: rateData.rate_24k }));
    });

    return () => {
      document.removeEventListener('keydown', block);
      document.removeEventListener('contextmenu', block);
      socketRef.current?.disconnect();
      clearTimeout(idleTimer.current);
    };
  }, [sessionId]);

  const resetIdleTimer = (seconds) => {
    clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => { setIsIdle(true); setCartData(null); }, seconds * 1000);
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // PAYMENT COMPLETE
  // ─────────────────────────────────────────────────────────────────────────────
  if (paymentComplete) {
    return (
      <div style={S.screen}>
        <div style={S.paymentComplete}>
          <div style={S.checkmark}>✓</div>
          <div style={{ fontSize: 48, fontWeight: 900, color: '#FFD700', marginBottom: 12 }}>Thank You!</div>
          <div style={{ fontSize: 24, color: '#ccc' }}>Payment Received Successfully</div>
          <div style={{ fontSize: 16, color: '#888', marginTop: 16 }}>Please visit us again 💎</div>
          <div style={{ marginTop: 32, fontSize: 14, color: '#555' }}>{shopInfo.footer}</div>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // IDLE / WELCOME SCREEN
  // ─────────────────────────────────────────────────────────────────────────────
  if (isIdle || !cartData) {
    return (
      <div style={S.screen}>
        <div style={S.idleScreen}>
          <div style={{ fontSize: 72, marginBottom: 16 }}>💎</div>
          <div style={{ fontSize: 52, fontWeight: 900, color: '#FFD700', marginBottom: 8 }}>
            {shopInfo.name}
          </div>
          <div style={{ fontSize: 18, color: '#888', marginBottom: 40 }}>
            {counterName}
          </div>

          {/* Live Gold Rates Box */}
          {goldRates.rate_22k && (
            <div style={S.goldRateBox}>
              <div style={{ fontSize: 12, color: '#aaa', marginBottom: 10, letterSpacing: 2 }}>
                TODAY'S GOLD RATES
              </div>
              <div style={{ display: 'flex', gap: 32, justifyContent: 'center' }}>
                {[
                  { label: '24K', value: goldRates.rate_24k },
                  { label: '22K', value: goldRates.rate_22k },
                  { label: '18K', value: goldRates.rate_18k },
                  { label: 'Silver', value: goldRates.rate_silver },
                ].filter(r => r.value).map(r => (
                  <div key={r.label} style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 12, color: '#aaa', marginBottom: 4 }}>{r.label}</div>
                    <div style={{ fontSize: 22, fontWeight: 700, color: '#FFD700' }}>
                      ₹{parseFloat(r.value).toLocaleString('en-IN')}
                    </div>
                    <div style={{ fontSize: 10, color: '#666' }}>per gram</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={S.bisTag}>✅ 100% BIS Hallmarked Gold</div>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // ACTIVE CART
  // ─────────────────────────────────────────────────────────────────────────────
  const { items = [], subtotal, discount, gst, total, customerName, schemeAmount, oldGoldAmount } = cartData;

  return (
    <div style={S.screen}>
      {/* Header */}
      <div style={S.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 26 }}>💎</span>
          <div>
            <div style={{ color: '#FFD700', fontWeight: 700, fontSize: 16 }}>{shopInfo.name}</div>
            <div style={{ color: '#888', fontSize: 11 }}>{counterName}</div>
          </div>
        </div>
        {customerName && (
          <div style={S.customerBadge}>👤 {customerName}</div>
        )}
        {goldRates.rate_22k && (
          <div style={{ color: '#aaa', fontSize: 13 }}>
            22K: ₹{parseFloat(goldRates.rate_22k).toLocaleString('en-IN')}/g
          </div>
        )}
      </div>

      {/* Items Table */}
      <div style={{ flex: 1, padding: '0 28px', overflow: 'hidden' }}>
        <div style={S.tableHeader}>
          <span style={{ flex: 3 }}>Item</span>
          <span style={{ flex: 1, textAlign: 'center' }}>Purity</span>
          <span style={{ flex: 1, textAlign: 'center' }}>Wt (g)</span>
          <span style={{ flex: 1, textAlign: 'center' }}>Making</span>
          <span style={{ flex: 1.5, textAlign: 'right' }}>Amount</span>
        </div>
        <div style={{ overflowY: 'auto', maxHeight: 'calc(100vh - 320px)' }}>
          {items.map((item, idx) => (
            <div key={idx} style={{
              ...S.itemRow,
              background: idx % 2 === 0 ? 'transparent' : '#1f1f1f',
              animation: idx === items.length - 1 ? 'fadeIn 0.3s ease' : 'none',
            }}>
              <span style={{ flex: 3, fontWeight: 600, fontSize: 15 }}>{item.itemName || 'Item'}</span>
              <span style={{ flex: 1, textAlign: 'center' }}>
                <span style={S.purityBadge}>{item.purity}</span>
              </span>
              <span style={{ flex: 1, textAlign: 'center', color: '#bbb', fontSize: 14 }}>
                {parseFloat(item.grossWeight || 0).toFixed(3)}
              </span>
              <span style={{ flex: 1, textAlign: 'center', color: '#999', fontSize: 13 }}>
                {formatCurrency(item.makingCharge)}
              </span>
              <span style={{ flex: 1.5, textAlign: 'right', color: '#FFD700', fontWeight: 700, fontSize: 16 }}>
                {formatCurrency(item.price)}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Bill Summary + Total */}
      <div style={S.summaryContainer}>
        <div style={{ flex: 1 }}>
          {[
            { label: 'Subtotal', value: subtotal },
            parseFloat(discount || 0) > 0 && { label: 'Discount', value: discount, minus: true },
            parseFloat(schemeAmount || 0) > 0 && { label: 'Scheme Redeemed', value: schemeAmount, minus: true, special: true },
            parseFloat(oldGoldAmount || 0) > 0 && { label: 'Old Gold Adjusted', value: oldGoldAmount, minus: true, special: true },
            { label: 'GST (3%)', value: gst },
          ].filter(Boolean).map((r, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15, marginBottom: 6 }}>
              <span style={{ color: r.special ? '#52c41a' : '#aaa' }}>{r.label}</span>
              <span style={{ color: r.minus ? '#ff6b6b' : 'white' }}>
                {r.minus ? '- ' : ''}{formatCurrency(r.value)}
              </span>
            </div>
          ))}
        </div>

        <div style={S.totalBox}>
          <div style={{ fontSize: 13, color: '#1a1a1a', fontWeight: 600, letterSpacing: 2, marginBottom: 6 }}>
            TOTAL PAYABLE
          </div>
          <div style={{ fontSize: 46, fontWeight: 900, color: '#1a1a1a', lineHeight: 1 }}>
            {formatCurrency(total)}
          </div>
          <div style={{ fontSize: 13, color: '#2a2a2a', marginTop: 6 }}>
            {items.length} item{items.length !== 1 ? 's' : ''}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div style={S.footer}>
        <span>✅ {shopInfo.footer}</span>
        <span>|</span>
        <span>{counterName}</span>
        <span>|</span>
        <span>E. & O.E.</span>
      </div>
    </div>
  );
}

const S = {
  screen: {
    background: '#1A1A1A', color: '#FFF',
    minHeight: '100vh', display: 'flex', flexDirection: 'column',
    fontFamily: "'Inter', Arial, sans-serif", overflow: 'hidden',
  },
  header: {
    background: '#111', padding: '14px 28px',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    borderBottom: '2px solid #B8860B',
  },
  customerBadge: {
    background: '#B8860B22', border: '1px solid #B8860B',
    padding: '5px 14px', borderRadius: 20, fontSize: 14, color: '#FFD700',
  },
  tableHeader: {
    display: 'flex', padding: '10px 16px',
    background: '#B8860B', color: 'white', fontWeight: 700,
    fontSize: 13, borderRadius: 6, marginTop: 14, marginBottom: 6,
  },
  itemRow: {
    display: 'flex', padding: '12px 16px',
    borderBottom: '1px solid #2a2a2a', alignItems: 'center',
  },
  purityBadge: {
    background: '#B8860B22', border: '1px solid #B8860B',
    color: '#FFD700', padding: '2px 8px', borderRadius: 10, fontSize: 11,
  },
  summaryContainer: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '18px 28px', background: '#111', borderTop: '2px solid #B8860B', gap: 28,
  },
  totalBox: {
    background: '#B8860B', borderRadius: 12,
    padding: '18px 32px', textAlign: 'center', minWidth: 220,
  },
  footer: {
    background: '#0d0d0d', padding: '10px 28px',
    display: 'flex', justifyContent: 'center', gap: 16,
    fontSize: 12, color: '#555', borderTop: '1px solid #222',
  },
  idleScreen: {
    flex: 1, display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center', padding: 40,
  },
  goldRateBox: {
    background: '#111', border: '2px solid #B8860B',
    borderRadius: 14, padding: '20px 40px', marginBottom: 28,
  },
  bisTag: {
    background: '#1a3a1a', border: '1px solid #52c41a',
    color: '#52c41a', padding: '8px 20px', borderRadius: 20, fontSize: 15,
  },
  paymentComplete: {
    flex: 1, display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center',
  },
  checkmark: {
    width: 110, height: 110, borderRadius: '50%', background: '#52c41a',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 60, color: 'white', marginBottom: 28,
  },
};
