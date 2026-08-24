/**
 * Counter Store — tracks which POS counter this window is.
 * Each browser window gets its own counter identity.
 * Persisted in sessionStorage (not localStorage) so each window is independent.
 */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export const useCounterStore = create(
  persist(
    (set, get) => ({
      counterId: null,        // FK to tbl_counter_master
      counterName: null,      // e.g. "Counter A", "Counter 2"
      windowId: null,         // UUID for this browser window
      isCounterSelected: false,

      setCounter: (counterId, counterName) => {
        const windowId = get().windowId || crypto.randomUUID();
        set({ counterId, counterName, windowId, isCounterSelected: true });
      },

      clearCounter: () => set({
        counterId: null, counterName: null, isCounterSelected: false,
      }),

      getWindowId: () => {
        const { windowId } = get();
        if (windowId) return windowId;
        const id = crypto.randomUUID();
        set({ windowId: id });
        return id;
      },
    }),
    {
      name: 'jewellery-counter',
      // Use sessionStorage so each browser window/tab is independent
      storage: createJSONStorage(() => sessionStorage),
    }
  )
);
