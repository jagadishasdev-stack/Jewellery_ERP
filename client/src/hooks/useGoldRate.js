import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useCartStore } from '../store/cartStore';
import { useBranch } from '../contexts/BranchContext';
import { goldRateApi } from '../api/modules';

/**
 * useGoldRate — fetches THIS TENANT's gold rate, and now this BRANCH's
 * own rate if one was set (falls back to the tenant-wide default
 * otherwise — see goldRate.js). selectedBranchId is in the query key
 * specifically so switching branches in the header refetches instead of
 * silently serving the previous branch's cached rate — the request
 * itself already carries the right X-Branch-ID header regardless (see
 * api/axios.js), but react-query has no way to know that on its own.
 */
export const useGoldRate = () => {
  const setCartGoldRate = useCartStore((s) => s.setGoldRate);
  const { selectedBranchId } = useBranch();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['gold-rate-tenant', selectedBranchId],
    queryFn: () => goldRateApi.getLive().then((r) => r.data.data),
    refetchInterval: 5 * 60 * 1000,
    staleTime: 4 * 60 * 1000,
  });

  useEffect(() => {
    if (data?.rate_22k) setCartGoldRate(data.rate_22k);
  }, [data]);

  return {
    goldRate: data?.rate_22k || 6200,
    rates: data || { rate_24k: 6850, rate_22k: 6200, rate_18k: 4650, rate_silver: 82, rate_platinum: 3200 },
    loading: isLoading,
    refetch,
    updatedAt: data?.updated_at,
    rateDate: data?.rate_date,
    setBy: data?.set_by,
    isBranchSpecific: !!data?.is_branch_specific,
  };
};
