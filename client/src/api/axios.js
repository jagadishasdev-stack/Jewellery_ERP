import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
});

// Request interceptor — attach token + Data_Mode header on every request
api.interceptors.request.use((config) => {
  try {
    // JWT token
    const stored = localStorage.getItem('jewellery-erp-auth');
    if (stored) {
      const parsed = JSON.parse(stored);
      const token = parsed?.state?.token;
      if (token) config.headers['Authorization'] = `Bearer ${token}`;
    }
    // Data Mode — read from sessionStorage (set by DataModeContext)
    const mode = parseInt(sessionStorage.getItem('erp_data_mode'), 10);
    config.headers['X-Data-Mode'] = [1, 2, 3].includes(mode) ? mode : 3;
    // Branch context — read from localStorage (set by BranchContext).
    // Absent entirely until a branch is actually selected — see
    // BranchContext.jsx's own comment for why that's the safe default
    // (server treats a missing header as "don't filter," not as an error).
    const branchId = localStorage.getItem('erp_branch_id');
    if (branchId) config.headers['X-Branch-ID'] = branchId;
  } catch (_) {}
  return config;
}, (error) => Promise.reject(error));

// Response interceptor — handle 401 token expiry
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      try {
        // Try refresh token
        const stored = localStorage.getItem('jewellery-erp-auth');
        const refreshToken = stored ? JSON.parse(stored)?.state?.refreshToken : null;

        if (refreshToken) {
          const res = await axios.post('/api/auth/refresh', { refreshToken });
          const newToken = res.data?.data?.token;
          if (newToken) {
            // Update token in localStorage via zustand persist
            const current = JSON.parse(localStorage.getItem('jewellery-erp-auth') || '{}');
            current.state = { ...current.state, token: newToken };
            localStorage.setItem('jewellery-erp-auth', JSON.stringify(current));

            originalRequest.headers['Authorization'] = `Bearer ${newToken}`;
            return api(originalRequest);
          }
        }
      } catch (_) {}

      // Refresh failed — redirect to login
      localStorage.removeItem('jewellery-erp-auth');
      window.location.href = '/login';
    }

    return Promise.reject(error);
  }
);

export default api;
