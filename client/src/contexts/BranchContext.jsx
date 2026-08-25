/**
 * BranchContext — Multi-Branch Management, client-side selector/context.
 * Mirrors DataModeContext.jsx's shape deliberately: a small piece of
 * client state, persisted, read by api/axios.js on every request as the
 * X-Branch-ID header. Real enforcement lives entirely on the server
 * (utils/branchAccess.js) — this context can only ever narrow what a
 * user SEES/asks for, never grant access a header alone couldn't; the
 * server independently validates every request regardless of what this
 * context thinks the user is allowed to do.
 *
 * Unlike Data_Mode (sessionStorage, deliberately reset every browser
 * session so nobody stays in Unofficial mode by accident), a branch
 * preference persists in localStorage — there's no equivalent "don't
 * leave me here by accident" risk for a branch selection, and re-picking
 * your branch every time you open the app is just friction.
 *
 * Switching branches hard-navigates to the Dashboard, same reasoning as
 * DataModeContext's mode switch: guarantees every query on the new page
 * refetches under the new X-Branch-ID header rather than leaving stale,
 * wrong-branch data on screen.
 */
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { branchesApi } from '../api/modules';

export const BranchContext = createContext();

const STORAGE_KEY = 'erp_branch_id';
export const ALL_BRANCHES = 'ALL';

export const BranchProvider = ({ children }) => {
  const [selectedBranchId, setSelectedBranchId] = useState(() => localStorage.getItem(STORAGE_KEY) || null);
  const [allBranches, setAllBranches] = useState(false);
  const [branches, setBranches] = useState([]);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await branchesApi.myAccess();
      const { allBranches: canAll, branches: list } = res.data.data;
      setAllBranches(canAll);
      setBranches(list || []);

      // First time ever (nothing stored yet) — default to a sensible
      // starting context rather than leaving it unset: the user's single
      // branch if they only have one, otherwise ALL if they're allowed,
      // otherwise the first branch they can see.
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) {
        const initial = list?.length === 1 ? list[0].Branch_ID : (canAll ? ALL_BRANCHES : (list?.[0]?.Branch_ID || null));
        if (initial) {
          localStorage.setItem(STORAGE_KEY, initial);
          setSelectedBranchId(initial);
        }
      }
    } catch (_) {
      // No access yet (e.g. not logged in) — leave defaults as-is.
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const switchBranch = useCallback((branchId) => {
    localStorage.setItem(STORAGE_KEY, branchId);
    setSelectedBranchId(branchId);
    window.location.href = '/dashboard';
  }, []);

  const isAllBranches = selectedBranchId === ALL_BRANCHES;
  const currentBranch = branches.find((b) => b.Branch_ID === selectedBranchId) || null;

  return (
    <BranchContext.Provider value={{
      selectedBranchId, switchBranch, allBranches, branches, loaded,
      isAllBranches, currentBranch, refreshBranches: refresh, ALL_BRANCHES,
    }}>
      {children}
    </BranchContext.Provider>
  );
};

export const useBranch = () => useContext(BranchContext);
