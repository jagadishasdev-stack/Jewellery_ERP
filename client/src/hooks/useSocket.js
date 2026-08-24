import { useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import { useAuthStore } from '../store/authStore';

let socketInstance = null;

export const useSocket = () => {
  const { user, sessionId } = useAuthStore();
  const socketRef = useRef(null);

  useEffect(() => {
    if (!user) return;

    if (!socketInstance) {
      socketInstance = io('/display', {
        transports: ['websocket'],
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionAttempts: 10,
      });
    }

    socketRef.current = socketInstance;

    socketInstance.on('connect', () => {
      console.log('Socket connected:', socketInstance.id);
      if (sessionId) {
        socketInstance.emit('join-session', {
          sessionId,
          role: 'operator',
          tenantId: user.tenantId,
        });
        socketInstance.emit('join-tenant', { tenantId: user.tenantId });
      }
    });

    return () => {
      // Don't disconnect on unmount — keep connection alive
    };
  }, [user, sessionId]);

  const emitCartUpdate = useCallback((cartData) => {
    socketInstance?.emit('cart-update', cartData);
  }, []);

  const emitCheckoutComplete = useCallback((invoice) => {
    if (sessionId) {
      socketInstance?.emit('checkout-complete', { sessionId, invoice });
    }
  }, [sessionId]);

  const emitClearDisplay = useCallback(() => {
    socketInstance?.emit('clear-display');
  }, []);

  const emitGoldRateUpdate = useCallback((rate, purity) => {
    if (user?.tenantId) {
      socketInstance?.emit('gold-rate-update', { tenantId: user.tenantId, rate, purity });
    }
  }, [user]);

  return { socket: socketRef.current, emitCartUpdate, emitCheckoutComplete, emitClearDisplay, emitGoldRateUpdate };
};
