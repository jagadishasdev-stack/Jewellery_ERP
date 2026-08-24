/**
 * Socket.io Display Hub
 * Manages the Dual-Screen (Ctrl+F5) real-time communication.
 * Operator updates cart → Customer display screen updates instantly.
 */

// Map: sessionId -> Set of socketIds
const sessionConnections = new Map();
// Map: socketId -> { sessionId, role }
const socketMeta = new Map();

const initDisplayHub = (io) => {
  const displayNS = io.of('/display');

  displayNS.on('connection', (socket) => {
    console.log(`[DisplayHub] Socket connected: ${socket.id}`);

    // ── Operator or Customer screen connects ─────────────────────────────────
    socket.on('join-session', ({ sessionId, role, tenantId }) => {
      if (!sessionId) return;

      socket.join(sessionId);
      socketMeta.set(socket.id, { sessionId, role, tenantId });

      if (!sessionConnections.has(sessionId)) {
        sessionConnections.set(sessionId, new Set());
      }
      sessionConnections.get(sessionId).add(socket.id);

      console.log(`[DisplayHub] ${role} joined session ${sessionId}`);
      socket.emit('joined', { sessionId, role });
    });

    // ── Operator updates cart ─────────────────────────────────────────────────
    socket.on('cart-update', (cartData) => {
      const meta = socketMeta.get(socket.id);
      if (!meta) return;

      // Mask sensitive fields before broadcasting to customer display
      const maskedCart = maskCartData(cartData);

      // Broadcast to all sockets in this session EXCEPT the sender
      socket.to(meta.sessionId).emit('cart-updated', maskedCart);
      console.log(`[DisplayHub] Cart updated in session ${meta.sessionId}`);
    });

    // ── Checkout complete ─────────────────────────────────────────────────────
    socket.on('checkout-complete', ({ sessionId, invoice }) => {
      socket.to(sessionId).emit('payment-complete', {
        invoiceNumber: invoice?.Invoice_Number,
        total: invoice?.Net_Payable_Amount,
        message: 'Thank you for your purchase!',
      });
    });

    // ── Clear customer display ────────────────────────────────────────────────
    socket.on('clear-display', () => {
      const meta = socketMeta.get(socket.id);
      if (!meta) return;
      socket.to(meta.sessionId).emit('display-cleared');
    });

    // ── Gold rate update (broadcast to all in tenant) ─────────────────────────
    socket.on('gold-rate-update', ({ tenantId, rate, purity }) => {
      displayNS.to(`tenant-${tenantId}`).emit('gold-rate-updated', { rate, purity, updatedAt: new Date() });
    });

    socket.on('join-tenant', ({ tenantId }) => {
      socket.join(`tenant-${tenantId}`);
    });

    // ── Disconnect ────────────────────────────────────────────────────────────
    socket.on('disconnect', () => {
      const meta = socketMeta.get(socket.id);
      if (meta) {
        const { sessionId } = meta;
        const connections = sessionConnections.get(sessionId);
        if (connections) {
          connections.delete(socket.id);
          if (connections.size === 0) {
            sessionConnections.delete(sessionId);
          }
        }
        socketMeta.delete(socket.id);
      }
      console.log(`[DisplayHub] Socket disconnected: ${socket.id}`);
    });
  });

  return displayNS;
};

/**
 * Removes sensitive business data before sending to customer display.
 * CRITICAL: Purchase_Cost, margins, supplier info must never reach the customer screen.
 */
const maskCartData = (cart) => {
  return {
    items: (cart.items || []).map((item) => ({
      itemName: item.itemName || item.Item_Type_Name,
      purity: item.purity || item.Purity_Code,
      grossWeight: item.grossWeight || item.Gross_Weight,
      makingCharge: item.makingCharge || item.Making_Charge_Applied,
      discount: item.discount || item.Discount_Amount_Applied || 0,
      price: item.price || item.Total_Line_Price,
      articleNumber: item.articleNumber || item.Article_Number,
    })),
    subtotal: cart.subtotal || cart.Subtotal_Amount || 0,
    discount: cart.discount || cart.Discount_Amount || 0,
    gst: cart.gst || cart.GST_Amount || 0,
    total: cart.total || cart.Net_Payable_Amount || 0,
    customerName: cart.customerName || cart.Customer_Name,
    goldRate: cart.goldRate,
    // Explicitly excluded: purchaseCost, margin, supplierInfo
  };
};

module.exports = { initDisplayHub };
