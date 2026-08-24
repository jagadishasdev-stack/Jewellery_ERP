import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useCartStore } from '../store/cartStore';
import api from '../api/axios';

/**
 * useGoldRate — fetches THIS TENANT's gold rate.
 * Every shop has independent rates — never shared.
 */
export const useGoldRate = () => {
  const setCartGoldRate = useCartStore((s) => s.setGoldRate);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['gold-rate-tenant'],
    queryFn: () => api.get('/gold-rate/live').then((r) => r.data.data),
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
  };
};
