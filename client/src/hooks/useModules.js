/**
 * useModules — Returns the tenant's enabled module keys and business type.
 * Used by sidebar and dashboard to show only relevant modules.
 * Falls back to HYBRID (all enabled) if API fails.
 */
import { useQuery } from '@tanstack/react-query';
import { modulesApi } from '../api/modules';
import { useAuthStore } from '../store/authStore';

export const useModules = () => {
  const { isAuthenticated } = useAuthStore();

  const { data, isLoading } = useQuery({
    queryKey: ['tenant-context'],
    queryFn: () => modulesApi.getTenantContext().then(r => r.data.data),
    enabled: isAuthenticated,
    staleTime: 5 * 60 * 1000, // 5 min cache — modules don't change often
    retry: false,
  });

  // If loading or error → default everything enabled (safe fallback)
  const enabledModules = data?.enabledModules || [
    'dashboard', 'masters', 'inventory', 'stock_transfer', 'barcode',
    'retail_sales', 'wholesale_sales', 'estimate', 'order_booking', 'sales_return',
    'purchase', 'old_gold', 'goldsmith', 'manufacturing', 'job_work', 'repair',
    'customers', 'dealers', 'savings_scheme', 'digi_gold', 'lucky_draw',
    'accounts', 'day_close', 'reports', 'gst_reports', 'floors', 'invoice_studio',
    'settings',
  ];

  const businessType = data?.businessType || 'HYBRID';

  /**
   * Check if a module key is enabled for this tenant.
   * @param {string} key - Module key e.g. 'retail_sales'
   */
  const isEnabled = (key) => enabledModules.includes(key);

  /**
   * Check if any of the given module keys are enabled.
   */
  const anyEnabled = (...keys) => keys.some(k => enabledModules.includes(k));

  return { enabledModules, businessType, isEnabled, anyEnabled, isLoading };
};
