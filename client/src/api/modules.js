import api from './axios';

// ─── Auth ─────────────────────────────────────────────────────────────────────
export const authApi = {
  login: (data) => api.post('/auth/login', data),
  logout: (sessionId) => api.post('/auth/logout', { sessionId }),
  refresh: (refreshToken) => api.post('/auth/refresh', { refreshToken }),
  validate: () => api.get('/auth/validate'),
  changePassword: (currentPassword, newPassword) => api.put('/auth/change-password', { currentPassword, newPassword }),
};

// ─── License ──────────────────────────────────────────────────────────────────
export const licenseApi = {
  validate: (data) => api.post('/license/validate', data),
  info: () => api.get('/license/info'),
  create: (data) => api.post('/license/create', data),
  revoke: (data) => api.post('/license/revoke', data),
};

// ─── Master ───────────────────────────────────────────────────────────────────
export const masterApi = {
  getItemTypes: () => api.get('/master/item-types'),
  createItemType: (data) => api.post('/master/item-types', data),
  updateItemType: (id, data) => api.put(`/master/item-types/${id}`, data),
  getDesigns: () => api.get('/master/designs'),
  createDesign: (data) => api.post('/master/designs', data),
  getGemstones: () => api.get('/master/gemstones'),
  createGemstone: (data) => api.post('/master/gemstones', data),
  getPurities: () => api.get('/master/purities'),
  createPurity: (data) => api.post('/master/purities', data),
};

// ─── Ornaments / Inventory ────────────────────────────────────────────────────
export const ornamentsApi = {
  getAll: (params) => api.get('/ornaments', { params }),
  getById: (id) => api.get(`/ornaments/${id}`),
  getByBarcode: (code) => api.get(`/ornaments/barcode/${code}`),
  getStockAlerts: () => api.get('/ornaments/stock-level'),
  create: (data) => api.post('/ornaments', data),
  update: (id, data) => api.put(`/ornaments/${id}`, data),
  setCatalogVisibility: (ornamentIds, showInCatalog) =>
    api.put('/ornaments/catalog-visibility', { ornamentIds, showInCatalog }),
  setStockClassification: (data) => api.put('/ornaments/stock-classification', data),
  setStockClassificationByLocation: (data) => api.put('/ornaments/stock-classification/by-location', data),
  classificationSummary: () => api.get('/reports/stock-classification-summary'),
};

// ─── Customers ────────────────────────────────────────────────────────────────
export const customersApi = {
  getAll: (params) => api.get('/customers', { params }),
  search: (params) => api.get('/customers/search', { params }),
  getById: (id) => api.get(`/customers/${id}`),
  getHistory: (id) => api.get(`/customers/${id}/history`),
  create: (data) => api.post('/customers', data),
  update: (id, data) => api.put(`/customers/${id}`, data),
};

// ─── Karigar ──────────────────────────────────────────────────────────────────
export const karigarApi = {
  getList: () => api.get('/karigar/list'),
  getVendors: (params) => api.get('/karigar/vendors', { params }),
  createVendor: (data) => api.post('/karigar/vendor', data),
  updateVendor: (id, data) => api.put(`/karigar/vendor/${id}`, data),
  deactivateVendor: (id) => api.patch(`/karigar/vendor/${id}/deactivate`),
  reactivateVendor: (id) => api.patch(`/karigar/vendor/${id}/reactivate`),
  getOutstanding: () => api.get('/karigar/outstanding'),
  issueGold: (data) => api.post('/karigar/issue', data),
  getIssues: (params) => api.get('/karigar/issues', { params }),
  getIssueById: (id) => api.get(`/karigar/issue/${id}`),
  returnGoods: (data) => api.post('/karigar/return', data),
  getSettlement: (params) => api.get('/karigar/settlement', { params }),
  processSettlement: (data) => api.post('/karigar/settle', data),
};

// ─── Sales ────────────────────────────────────────────────────────────────────
export const salesApi = {
  create: (data) => api.post('/sales/create', data),
  list: (params) => api.get('/sales', { params }),
  getById: (id) => api.get(`/sales/${id}`),
  getByInvoice: (number) => api.get(`/sales/invoice/${number}`),
  cancel: (id, data) => api.post(`/sales/${id}/cancel`, data),
  return: (id, data) => api.post(`/sales/${id}/return`, data),
  receivePayment: (id, data) => api.post(`/sales/${id}/receive-payment`, data),
  dailyReport: (date) => api.get('/sales/reports/daily', { params: { date } }),
};

// ─── Invoice Templates ────────────────────────────────────────────────────────
export const invoiceApi = {
  getTemplates: () => api.get('/invoice/templates'),
  getByType: (type) => api.get(`/invoice/template/${type}`),
  saveTemplate: (data) => api.post('/invoice/template', data),
  generate: (data) => api.post('/invoice/generate', data, { responseType: 'blob' }),
  preview: (data) => api.post('/invoice/template/preview', data),
};

// ─── Customer Display ─────────────────────────────────────────────────────────
export const displayApi = {
  getSettings: () => api.get('/display/settings'),
  updateSettings: (data) => api.put('/display/settings', data),
  getCurrentState: () => api.get('/display/current-state'),
};

// ─── Gold Rate (per-tenant) ───────────────────────────────────────────────────
export const goldRateApi = {
  getLive: () => api.get('/gold-rate/live'),
  setRate: (data) => api.post('/gold-rate/set', data),
  getHistory: () => api.get('/gold-rate/history'),
  getAllTenants: () => api.get('/gold-rate/all-tenants'),
};

// ─── Super Admin ──────────────────────────────────────────────────────────────
export const superAdminApi = {
  getDashboard: () => api.get('/super-admin/dashboard'),
  search: (q) => api.get('/super-admin/search', { params: { q } }),
  getTenantDetail: (id) => api.get(`/super-admin/tenant/${id}`),
  setStoreType: (id, store_type) => api.put(`/super-admin/tenant/${id}/store-type`, { store_type }),
  // Tenant user management (SA cross-tenant)
  getTenantUsers: (tenantId) => api.get(`/super-admin/tenant/${tenantId}/users`),
  resetTenantUserPassword: (tenantId, userId, newPassword) =>
    api.put(`/super-admin/tenant/${tenantId}/users/${userId}/reset-password`, { newPassword }),
  updateTenantUser: (tenantId, userId, data) =>
    api.put(`/super-admin/tenant/${tenantId}/users/${userId}`, data),
  // Savings Club cross-tenant view
  getTenantSavingsSummary: (tenantId) => api.get(`/super-admin/tenant/${tenantId}/savings-summary`),
  createTenantAgent: (tenantId, data) => api.post(`/super-admin/tenant/${tenantId}/agents`, data),
  createTenantUser: (tenantId, data) => api.post(`/super-admin/tenant/${tenantId}/users`, data),
  getTenantShortcuts: (tenantId) => api.get(`/super-admin/tenant/${tenantId}/shortcuts`),
  updateTenantShortcuts: (tenantId, overrides) => api.put(`/super-admin/tenant/${tenantId}/shortcuts`, { overrides }),
  getPaymentGateway: (tenantId) => api.get(`/super-admin/tenant/${tenantId}/payment-gateway`),
  savePaymentGateway: (tenantId, data) => api.put(`/super-admin/tenant/${tenantId}/payment-gateway`, data),
  updateTenantSettings: (id, data) => api.put(`/super-admin/tenant/${id}/settings`, data),
  toggleTenantModule: (tenantId, moduleKey, enabled) => api.post('/super-admin/tenant-module-toggle', { tenantId, moduleKey, enabled }),
  provisionTenant: (tenantId, businessType) => api.post('/super-admin/tenant-provision', { tenantId, businessType }),
  getTenantModules: (tenantId) => api.get(`/super-admin/tenant/${tenantId}/modules`),
};

// ─── Reports ──────────────────────────────────────────────────────────────────
export const reportsApi = {
  salesSummary: (params) => api.get('/reports/sales-summary', { params }),
  inventoryValue: (params = {}) => api.get('/reports/inventory-value', { params }),
  karigarSummary: () => api.get('/reports/karigar-summary'),
  customerLedger: (id) => api.get(`/reports/customer-ledger/${id}`),
  customerOutstanding: () => api.get('/reports/customer-outstanding'),
  supplierOutstanding: () => api.get('/reports/supplier-outstanding'),
  gstSummary: (params) => api.get('/reports/gst-summary', { params }),
  gstr1: (params) => api.get('/reports/gstr1', { params }),
  gstr3b: (params) => api.get('/reports/gstr3b', { params }),
  counterSummary: (params) => api.get('/reports/counter-summary', { params }),
  itemWiseSales: (params) => api.get('/reports/item-wise-sales', { params }),
  branchWiseSales: (params) => api.get('/reports/branch-wise-sales', { params }),
  salesReturns: (params) => api.get('/reports/sales-returns', { params }),
  salesByMetal: (params) => api.get('/reports/sales-by-metal', { params }),
  itemMovement: () => api.get('/reports/item-movement'),
  catalogHiddenStock: () => api.get('/reports/catalog-hidden-stock'),
  financial: (params) => api.get('/reports/financial', { params }),
  schemeAdjustments: (params) => api.get('/reports/scheme-adjustments', { params }),
  oldGoldAdjustments: (params) => api.get('/reports/old-gold-adjustments', { params }),
  combinedAdjustments: (params) => api.get('/reports/combined-adjustments', { params }),
  approvalPending: (params) => api.get('/reports/approval-pending', { params }),
  approvalIssue: (params) => api.get('/reports/approval-issue', { params }),
  approvalReceive: (params) => api.get('/reports/approval-receive', { params }),
  approvalOutstanding: (params) => api.get('/reports/approval-outstanding', { params }),
  closingReport: (params) => api.get('/reports/closing-report', { params }),
  closingReportPdf: (params) => api.get('/reports/closing-report/pdf', { params, responseType: 'blob' }),
  karigarPerformance: () => api.get('/reports/karigar-performance'),
  designPerformance: () => api.get('/reports/design-performance'),
  branchPerformance: () => api.get('/reports/branch-performance'),
};

// ─── Floors & Counters ────────────────────────────────────────────────────────
export const floorsApi = {
  getAll: (params) => api.get('/floors', { params }),
  create: (data) => api.post('/floors', data),
  update: (id, data) => api.put(`/floors/${id}`, data),
  remove: (id) => api.delete(`/floors/${id}`),
  getCounters: (floorId) => api.get(`/floors/${floorId}/counters`),
  createCounter: (data) => api.post('/floors/counters', data),
  updateCounter: (id, data) => api.put(`/floors/counters/${id}`, data),
  removeCounter: (id) => api.delete(`/floors/counters/${id}`),
  getTrays: (counterId) => api.get(`/floors/counters/${counterId}/trays`),
  createTray: (data) => api.post('/floors/trays', data),
  updateTray: (id, data) => api.put(`/floors/trays/${id}`, data),
  removeTray: (id) => api.delete(`/floors/trays/${id}`),
  getHiddenLocations: () => api.get('/floors/hidden-locations'),
  createHiddenLocation: (data) => api.post('/floors/hidden-locations', data),
  updateHiddenLocation: (id, data) => api.put(`/floors/hidden-locations/${id}`, data),
  removeHiddenLocation: (id) => api.delete(`/floors/hidden-locations/${id}`),
  getHiddenStock: () => api.get('/floors/hidden-stock'),
  getVisibilityComparison: () => api.get('/floors/reports/visibility-comparison'),
  getHiddenStockSales: (params) => api.get('/floors/reports/hidden-stock-sales', { params }),
  getLiveStock: (params) => api.get('/floors/stock', { params }),
};

// ─── Stock Transfer ───────────────────────────────────────────────────────────
export const transferApi = {
  getAll: (params) => api.get('/transfer', { params }),
  getById: (id) => api.get(`/transfer/${id}`),
  create: (data) => api.post('/transfer/create', data),
  approve: (id, data) => api.post(`/transfer/${id}/approve`, data),
  reject: (id) => api.post(`/transfer/${id}/reject`),
  hideStock: (data) => api.post('/transfer/hide', data),
  unhideStock: (data) => api.post('/transfer/unhide', data),
};

// ─── Purchase ─────────────────────────────────────────────────────────────────
export const purchaseApi = {
  getAll: (params) => api.get('/purchase', { params }),
  getById: (id) => api.get(`/purchase/${id}`),
  create: (data) => api.post('/purchase/create', data),
  approve: (id) => api.post(`/purchase/${id}/approve`),
  paySupplier: (id, data) => api.post(`/purchase/${id}/pay-supplier`, data),
};

// ─── Customer Advance ───────────────────────────────────────────────────────
export const customerAdvanceApi = {
  create: (data) => api.post('/customer-advance', data),
  getBalance: (customerId) => api.get(`/customer-advance/balance/${customerId}`),
  apply: (customerId, data) => api.post(`/customer-advance/${customerId}/apply`, data),
};

// ─── Repair ───────────────────────────────────────────────────────────────────
// ─── Multi-Branch Management ──────────────────────────────────────────────────
export const branchesApi = {
  myAccess: () => api.get('/branches/my-access'),
  getUserAccess: (userId) => api.get(`/branches/access/${userId}`),
  grant: (userId, branchId) => api.post('/branches/access', { User_ID: userId, Branch_ID: branchId }),
  revoke: (accessId) => api.delete(`/branches/access/${accessId}`),
  setAllBranchAccess: (userId, allBranchAccess) => api.put(`/branches/access/${userId}/all-access`, { All_Branch_Access: allBranchAccess }),
};

export const repairApi = {
  getAll: (params) => api.get('/repair', { params }),
  create: (data) => api.post('/repair', data),
  update: (id, data) => api.put(`/repair/${id}`, data),
  deliver: (id, data) => api.post(`/repair/${id}/deliver`, data),
  lookupByInvoice: (invoiceNumber) => api.get(`/repair/lookup-by-invoice/${invoiceNumber}`),
};

// ─── Gold Saving Scheme ───────────────────────────────────────────────────────
export const schemeApi = {
  getSchemes: () => api.get('/scheme'),
  createScheme: (data) => api.post('/scheme', data),
  enroll: (data) => api.post('/scheme/enroll', data),
  getEnrollments: (params) => api.get('/scheme/enrollments', { params }),
  payInstallment: (data) => api.post('/scheme/pay-installment', data),
};
export const uiThemeApi = {
  get: () => api.get('/tenant/ui-theme'),
  update: (data) => api.put('/tenant/ui-theme', data),
};

export const shortcutsApi = {
  get: () => api.get('/tenant/shortcuts'),
};

export const tenantApi = {
  getBranches: (tenantId, extraParams = {}) => api.get('/tenant/branches', { params: { tenantId, ...extraParams } }),
  createBranch: (data) => api.post('/tenant/branches', data),
  updateBranch: (id, data) => api.put(`/tenant/branches/${id}`, data),
  getStats: () => api.get('/tenant/stats'),
  getSettings: () => api.get('/tenant/settings'),
  updateSettings: (data) => api.put('/tenant/settings', data),
  getAllTenants: () => api.get('/tenant/all'),
  createTenant: (data) => api.post('/tenant/create', data),
  getUsers: () => api.get('/tenant/users'),
  createUser: (data) => api.post('/tenant/users', data),
  updateUser: (id, data) => api.put(`/tenant/users/${id}`, data),
  deleteUser: (id) => api.delete(`/tenant/users/${id}`),
  unlockUser: (id) => api.post(`/tenant/users/${id}/unlock`),
  updateUserPermissions: (id, permissions) => api.put(`/tenant/users/${id}/permissions`, { permissions }),
  getRoles: () => api.get('/tenant/roles'),
  createRole: (data) => api.post('/tenant/roles', data),
  updateRole: (id, data) => api.put(`/tenant/roles/${id}`, data),
  deleteRole: (id) => api.delete(`/tenant/roles/${id}`),
};

// ─── Approval Issue / Receive ───────────────────────────────────────────────
export const approvalApi = {
  getParties: (params) => api.get('/approval/parties', { params }),
  createParty: (data) => api.post('/approval/parties', data),
  getPartyById: (id) => api.get(`/approval/parties/${id}`),
  searchOrnaments: (q) => api.get('/approval/ornaments/search', { params: { q } }),
  createIssue: (data) => api.post('/approval/issue', data),
  getIssueById: (id) => api.get(`/approval/issue/${id}`),
  getIssues: (params) => api.get('/approval/issues', { params }),
  getIssueByVoucher: (voucherNumber) => api.get(`/approval/issue/by-voucher/${voucherNumber}`),
  cancelIssue: (id, data) => api.post(`/approval/issue/${id}/cancel`, data),
  createReceive: (data) => api.post('/approval/receive', data),
  getReceives: (params) => api.get('/approval/receives', { params }),
  createNonTagIssue: (data) => api.post('/approval/non-tag/issue', data),
  getNonTagIssueById: (id) => api.get(`/approval/non-tag/issue/${id}`),
  getNonTagIssues: (params) => api.get('/approval/non-tag/issues', { params }),
  getNonTagIssueByVoucher: (voucherNumber) => api.get(`/approval/non-tag/issue/by-voucher/${voucherNumber}`),
  cancelNonTagIssue: (id, data) => api.post(`/approval/non-tag/issue/${id}/cancel`, data),
  createNonTagReceive: (data) => api.post('/approval/non-tag/receive', data),
  getNonTagReceives: (params) => api.get('/approval/non-tag/receives', { params }),
};

// ─── Savings Club ─────────────────────────────────────────────────────────────
export const savingsApi = {
  getDashboard: () => api.get('/savings/dashboard'),
  getSchemes: () => api.get('/savings/schemes'),
  createScheme: (d) => api.post('/savings/schemes', d),
  updateScheme: (id, d) => api.put(`/savings/schemes/${id}`, d),
  getGroups: (p) => api.get('/savings/groups', { params: p }),
  createGroup: (d) => api.post('/savings/groups', d),
  updateGroup: (id, d) => api.put(`/savings/groups/${id}`, d),
  getGroupById: (id) => api.get(`/savings/groups/${id}`),
  getMembers: (p) => api.get('/savings/members', { params: p }),
  createMember: (d) => api.post('/savings/members', d),
  getMemberById: (id) => api.get(`/savings/members/${id}`),
  updateMember: (id, data) => api.put(`/savings/members/${id}`, data),
  closeMember: (id) => api.delete(`/savings/members/${id}`),
  collect: (d) => api.post('/savings/collect', d),
  getCollections: (p) => api.get('/savings/collections', { params: p }),
  getPDC: (p) => api.get('/savings/pdc', { params: p }),
  createPDC: (d) => api.post('/savings/pdc', d),
  updatePDCStatus: (id, d) => api.put(`/savings/pdc/${id}/status`, d),
  conductDraw: (d) => api.post('/savings/draw/conduct', d),
  getDrawHistory: () => api.get('/savings/draw/history'),
  goldConvert: (d) => api.post('/savings/gold-convert', d),
  redeemMember: (id, d) => api.post(`/savings/members/${id}/redeem`, d),
  adjustAgainstInvoice: (id, d) => api.post(`/savings/members/${id}/adjust-invoice`, d),
  forecloseMember: (id, d) => api.post(`/savings/members/${id}/foreclose`, d),
  reportCollection: (p) => api.get('/savings/reports/collection', { params: p }),
  reportLedger: (id) => api.get(`/savings/reports/member-ledger/${id}`),
  reportOverdue: () => api.get('/savings/reports/overdue'),
  reportMaturityDue: (p) => api.get('/savings/reports/maturity-due', { params: p }),
  sendReminders: () => api.post('/savings/notify/send-reminders'),
  getNotifications: () => api.get('/savings/notifications'),
  searchForPos: (q) => api.get('/savings/members/search-for-pos', { params: { q } }),
  getSchemeSettings: () => api.get('/savings/scheme-settings'),
  updateSchemeSettings: (data) => api.put('/savings/scheme-settings', data),
};

// ─── Old Gold Exchange ──────────────────────────────────────────────────────
export const oldGoldApi = {
  createExchange: (data) => api.post('/old-gold/exchange', data),
  getExchange: (id) => api.get(`/old-gold/exchange/${id}`),
};

// ─── Savings Club Agents ────────────────────────────────────────────────────
export const agentsApi = {
  getAll: (params) => api.get('/savings/agents', { params }),
  getReport: (agentId, params) => api.get(`/savings/agents/${agentId}/report`, { params }),
  create: (data) => api.post('/savings/agents', data),
  update: (id, data) => api.put(`/savings/agents/${id}`, data),
  deactivate: (id) => api.delete(`/savings/agents/${id}`),
};

// ─── SMS Gateway / Templates ────────────────────────────────────────────────
export const smsApi = {
  getGatewayConfig: (params) => api.get('/sms-config/gateway-config', { params }),
  saveGatewayConfig: (data, params) => api.put('/sms-config/gateway-config', data, { params }),
  getTemplates: (params) => api.get('/sms-config/templates', { params }),
  saveTemplate: (data, params) => api.post('/sms-config/templates', data, { params }),
  getLog: (params) => api.get('/sms-config/log', { params }),
};

// ─── Push Notifications (Firebase Admin SDK) ───────────────────────────────────
export const pushApi = {
  getConfig: (params) => api.get('/push-config/config', { params }),
  saveConfig: (data, params) => api.put('/push-config/config', data, { params }),
  testSend: (data, params) => api.post('/push-config/test-send', data, { params }),
  getLog: (params) => api.get('/push-config/log', { params }),
};

// ─── Image App per-device licensing ────────────────────────────────────────────
export const deviceLicenseApi = {
  list: (params) => api.get('/device-licenses', { params }),
  approve: (id) => api.post(`/device-licenses/${id}/approve`),
  revoke: (id) => api.post(`/device-licenses/${id}/revoke`),
  reject: (id) => api.post(`/device-licenses/${id}/reject`),
};

// ─── Policies (Terms/About/Privacy/Return/Shipping) ────────────────────────────
export const policiesApi = {
  getAll: (params) => api.get('/policies', { params }),
  create: (data, params) => api.post('/policies', data, { params }),
  update: (id, data, params) => api.put(`/policies/${id}`, data, { params }),
  remove: (id, params) => api.delete(`/policies/${id}`, { params }),
};

// ─── Day Close & Vouchers ──────────────────────────────────────────────────────
export const dayCloseApi = {
  getToday: () => api.get('/day-close/today'),
  close: (data) => api.post('/day-close/close', data),
  getHistory: () => api.get('/day-close/history'),
  getVouchers: () => api.get('/day-close/vouchers'),
  createVoucher: (data) => api.post('/day-close/vouchers/create', data),
  checkVoucher: (code) => api.get(`/day-close/vouchers/${code}`),
  getLoyalty: (customerId) => api.get(`/day-close/loyalty/${customerId}`),
};

// ─── Audit & Security ─────────────────────────────────────────────────────────
export const auditApi = {
  getLogs:          (p) => api.get('/audit/logs', { params: p }),
  getUserActivity:  (p) => api.get('/audit/user-activity', { params: p }),
  getDeletedEntries:()  => api.get('/audit/deleted-entries'),
  getEditHistory:   (table, id) => api.get(`/audit/edit-history/${table}/${id}`),
  getActiveSessions:()  => api.get('/audit/active-sessions'),
  terminateSession: (id) => api.delete(`/audit/sessions/${id}`),
  getSummary:       ()  => api.get('/audit/summary'),
  getLoginHistory:  (p) => api.get('/audit/login-history', { params: p }),
};

// ─── Product Catalog (Image App migration) ────────────────────────────────────
export const catalogApi = {
  search:          (params) => api.get('/catalog/search', { params }),
  getItem:         (barcode) => api.get(`/catalog/item/${barcode}`),
  getPublic:       (barcode) => api.get(`/catalog/public/${barcode}`),
  // Images — always linked to an ornament (single source of truth)
  getImages:       (params) => api.get('/catalog/images', { params }),
  uploadImage:     (formData) => api.post('/catalog/upload-image', formData, { headers: { 'Content-Type': undefined } }),
  setPrimaryImage: (imageId, data) => api.put(`/catalog/images/${imageId}/set-primary`, data),
  deleteImage:     (imageId) => api.delete(`/catalog/images/${imageId}`),
  // Catalog
  getExhibition:   () => api.get('/catalog/exhibition'),
  toggleExhibition:(id, display) => api.put(`/catalog/exhibition/${id}`, { is_display: display }),
  getDesigns:      () => api.get('/catalog/designs'),
  getSoldReport:   (params) => api.get('/catalog/sold-report', { params }),
  // Wishlist
  addToWishlist:   (data) => api.post('/catalog/wishlist', data),
  getWishlist:     (mobile) => api.get('/catalog/wishlist', { params: { customer_mobile: mobile } }),
  removeFromWishlist:(id) => api.delete(`/catalog/wishlist/${id}`),
  // Orders
  createOrder:     (data) => api.post('/catalog/orders', data),
  getOrders:       (params) => api.get('/catalog/orders', { params }),
  placeOrderRequest: (data) => api.post('/catalog/order-request', data),
  updateOrderStatus: (id, status, reason) => api.put(`/catalog/orders/${id}/status`, { status, reason }),
};

// ─── Mobile Auth (Image App + Savings App login) ───────────────────────────────
export const mobileAuthApi = {
  validateLicense: (licenseKey) => api.post('/mobile/validate-license', { licenseKey }),
  login:           (data) => api.post('/mobile/login', data),
  getTenantInfo:   (tenantId) => api.get(`/mobile/tenant-info/${tenantId}`),
};

// ─── Module Management ────────────────────────────────────────────────────────
// tenantId param on getAll/getTenantContext/toggle/provision is optional and
// Super-Admin-only server-side (see modules.js's resolveTenantId) — lets the
// Module Management page manage a specific customer instead of only ever
// the logged-in user's own tenant. Omit it and every call behaves exactly
// as before (acts on your own tenant).
export const modulesApi = {
  getAll:         (tenantId)  => api.get('/modules', { params: tenantId ? { tenantId } : {} }),
  getTenantContext: (tenantId) => api.get('/modules/tenant-context', { params: tenantId ? { tenantId } : {} }),
  toggle:         (key, enabled, tenantId) => api.put(`/modules/${key}`, { enabled }, { params: tenantId ? { tenantId } : {} }),
  provision:      (businessType, tenantId) => api.post('/modules/provision', { businessType }, { params: tenantId ? { tenantId } : {} }),
  getTiers:       ()          => api.get('/modules/tiers'),
  setTier:        (tenantId, planName, billingCycle) => api.put(`/modules/tier/${tenantId}`, { Plan_Name: planName, Billing_Cycle: billingCycle }),
};

// ─── Payments (Razorpay + PhonePe — migrated from savings_app) ────────────────
export const paymentsApi = {
  // Razorpay
  razorpayCreateOrder: (data) => api.post('/payments/razorpay/create-order', data),
  razorpayVerify:      (data) => api.post('/payments/razorpay/verify', data),
  // PhonePe
  phonepeInitiate:     (data) => api.post('/payments/phonepe/initiate', data),
  phonepeVerify:       (data) => api.post('/payments/phonepe/verify', data),
  // History
  getHistory:          (params) => api.get('/payments/history', { params }),
};

// ─── Excel Bulk Import (admin-only) ─────────────────────────────────────────────
const importFile = (endpoint, file) => {
  const fd = new FormData();
  fd.append('file', file);
  return api.post(`/excel-import/${endpoint}`, fd, { headers: { 'Content-Type': undefined } });
};

export const excelImportApi = {
  importStock: (file) => importFile('stock', file),
  importCustomers: (file) => importFile('customers', file),
  importItemTypes: (file) => importFile('itemtypes', file),
  importDesigns: (file) => importFile('designs', file),
  importPurity: (file) => importFile('purity', file),
  importGemstones: (file) => importFile('gemstones', file),
  importVendors: (file) => importFile('vendors', file),
  downloadTemplate: (type) => api.get(`/excel-import/template/${type}`, { responseType: 'blob' }),
};

// ─── Generic File Upload (logos, stamps, signatures, scheme-groups, etc.) ─────
export const uploadApi = {
  uploadImage: (file, type) => {
    const fd = new FormData();
    fd.append('file', file);
    return api.post('/upload/image', fd, {
      params: { type },
      headers: { 'Content-Type': undefined },
    });
  },
};

// ─── Pawnbroking ────────────────────────────────────────────────────────────────
export const pawnbrokingApi = {
  getLoans: (params) => api.get('/pawnbroking/loans', { params }),
  getLoan: (id) => api.get(`/pawnbroking/loans/${id}`),
  createLoan: (data) => api.post('/pawnbroking/loans', data),
  addTransaction: (id, data) => api.post(`/pawnbroking/loans/${id}/transactions`, data),
  auction: (id, data) => api.post(`/pawnbroking/loans/${id}/auction`, data),
  getOverdue: () => api.get('/pawnbroking/overdue'),
};

// ─── Insurance & AMC ─────────────────────────────────────────────────────────────
export const insuranceAmcApi = {
  getPolicies: () => api.get('/insurance-amc/policies'),
  createPolicy: (data) => api.post('/insurance-amc/policies', data),
  getCustomerInsurance: (params) => api.get('/insurance-amc/customer-insurance', { params }),
  createCustomerInsurance: (data) => api.post('/insurance-amc/customer-insurance', data),
  claimCustomerInsurance: (id, data) => api.post(`/insurance-amc/customer-insurance/${id}/claim`, data),
  getAmcPlans: () => api.get('/insurance-amc/amc-plans'),
  createAmcPlan: (data) => api.post('/insurance-amc/amc-plans', data),
  getAmcEnrollments: (params) => api.get('/insurance-amc/amc-enrollments', { params }),
  createAmcEnrollment: (data) => api.post('/insurance-amc/amc-enrollments', data),
  logAmcService: (id) => api.post(`/insurance-amc/amc-enrollments/${id}/service`),
};

// ─── HR / Attendance / Payroll ───────────────────────────────────────────────────
export const hrApi = {
  getStaff: () => api.get('/hr/staff'),
  getHolidays: () => api.get('/hr/holidays'),
  createHoliday: (data) => api.post('/hr/holidays', data),
  getAttendance: (params) => api.get('/hr/attendance', { params }),
  saveAttendance: (records) => api.post('/hr/attendance', { records }),
  getSalaryStructure: (userId) => api.get(`/hr/salary-structure/${userId}`),
  saveSalaryStructure: (data) => api.post('/hr/salary-structure', data),
  getIncentiveSlabs: () => api.get('/hr/incentive-slabs'),
  createIncentiveSlab: (data) => api.post('/hr/incentive-slabs', data),
  getSalesIncentives: (params) => api.get('/hr/sales-incentive', { params }),
  getPayrollRuns: () => api.get('/hr/payroll/runs'),
  getPayrollRun: (id) => api.get(`/hr/payroll/runs/${id}`),
  generatePayroll: (data) => api.post('/hr/payroll/runs', data),
  finalizePayroll: (id) => api.post(`/hr/payroll/runs/${id}/finalize`),
};

// ─── CRM ──────────────────────────────────────────────────────────────────────────
export const crmApi = {
  getLeads: (params) => api.get('/crm/leads', { params }),
  createLead: (data) => api.post('/crm/leads', data),
  updateLead: (id, data) => api.put(`/crm/leads/${id}`, data),
  convertLead: (id) => api.post(`/crm/leads/${id}/convert`),
  getFollowups: (params) => api.get('/crm/followups', { params }),
  createFollowup: (data) => api.post('/crm/followups', data),
  getFeedback: (params) => api.get('/crm/feedback', { params }),
  createFeedback: (data) => api.post('/crm/feedback', data),
  resolveFeedback: (id, data) => api.put(`/crm/feedback/${id}/resolve`, data),
};

// ─── Bank Accounts & Cheque Register ────────────────────────────────────────────
export const bankChequeApi = {
  getAccounts: () => api.get('/bank-cheque/accounts'),
  createAccount: (data) => api.post('/bank-cheque/accounts', data),
  getCheques: (params) => api.get('/bank-cheque/cheques', { params }),
  createCheque: (data) => api.post('/bank-cheque/cheques', data),
  depositCheque: (id) => api.post(`/bank-cheque/cheques/${id}/deposit`),
  clearCheque: (id) => api.post(`/bank-cheque/cheques/${id}/clear`),
  bounceCheque: (id, data) => api.post(`/bank-cheque/cheques/${id}/bounce`, data),
};

// ─── Rate Booking & Agent Commission ────────────────────────────────────────────
export const rateAgentApi = {
  getAgents: () => api.get('/rate-agent/agents'),
  createAgent: (data) => api.post('/rate-agent/agents', data),
  getRateBookings: (params) => api.get('/rate-agent/rate-bookings', { params }),
  createRateBooking: (data) => api.post('/rate-agent/rate-bookings', data),
  utilizeRateBooking: (id, data) => api.post(`/rate-agent/rate-bookings/${id}/utilize`, data),
  getCommissions: (params) => api.get('/rate-agent/commissions', { params }),
  createCommission: (data) => api.post('/rate-agent/commissions', data),
  payCommission: (id, data) => api.post(`/rate-agent/commissions/${id}/pay`, data),
};

// ─── Compliance (HSN / e-Invoice / Loyalty) ─────────────────────────────────────
export const complianceApi = {
  getHsn: () => api.get('/compliance/hsn'),
  createHsn: (data) => api.post('/compliance/hsn', data),
  getEinvoiceLog: (params) => api.get('/compliance/einvoice', { params }),
  generateEinvoice: (data) => api.post('/compliance/einvoice/generate', data),
  cancelEinvoice: (id, data) => api.post(`/compliance/einvoice/${id}/cancel`, data),
  getLoyaltySlabs: () => api.get('/compliance/loyalty-slabs'),
  createLoyaltySlab: (data) => api.post('/compliance/loyalty-slabs', data),
  calculateLoyaltyPoints: (params) => api.get('/compliance/loyalty-slabs/calculate', { params }),
};

// ─── Manufacturing / BOM ──────────────────────────────────────────────────────────
export const manufacturingApi = {
  getDepartments: () => api.get('/manufacturing/departments'),
  createDepartment: (data) => api.post('/manufacturing/departments', data),
  getBoms: (params) => api.get('/manufacturing/bom', { params }),
  getBom: (id) => api.get(`/manufacturing/bom/${id}`),
  createBom: (data) => api.post('/manufacturing/bom', data),
  getProduction: (params) => api.get('/manufacturing/production', { params }),
  createProduction: (data) => api.post('/manufacturing/production', data),
  completeProduction: (id, data) => api.put(`/manufacturing/production/${id}/complete`, data),
  getMeltingRefining: (params) => api.get('/manufacturing/melting-refining', { params }),
  createMeltingRefining: (data) => api.post('/manufacturing/melting-refining', data),
  getMoulds: () => api.get('/manufacturing/moulds'),
  createMould: (data) => api.post('/manufacturing/moulds', data),
  adjustMouldStock: (id, delta) => api.put(`/manufacturing/moulds/${id}/stock`, { delta }),
};

// ─── Inventory Ops (Certification / Reorder / RFID / Card Charges) ─────────────
export const inventoryOpsApi = {
  getCertificates: (params) => api.get('/inventory-ops/certificates', { params }),
  createCertificate: (data) => api.post('/inventory-ops/certificates', data),
  getReorderRequests: (params) => api.get('/inventory-ops/reorder-requests', { params }),
  createReorderRequest: (data) => api.post('/inventory-ops/reorder-requests', data),
  updateReorderRequest: (id, data) => api.put(`/inventory-ops/reorder-requests/${id}`, data),
  autoScanReorder: () => api.post('/inventory-ops/reorder-requests/auto-scan'),
  getRfidScans: (params) => api.get('/inventory-ops/rfid-scans', { params }),
  logRfidScan: (data) => api.post('/inventory-ops/rfid-scans', data),
  getCardCharges: () => api.get('/inventory-ops/card-charges'),
  createCardCharge: (data) => api.post('/inventory-ops/card-charges', data),
};

// ─── Tally Bridge ─────────────────────────────────────────────────────────────────
export const tallyApi = {
  getConfig: () => api.get('/tally/config'),
  saveConfig: (data) => api.put('/tally/config', data),
  getSyncLog: (params) => api.get('/tally/sync-log', { params }),
  queueSync: (data) => api.post('/tally/sync', data),
  updateSyncLog: (id, data) => api.put(`/tally/sync-log/${id}`, data),
  exportLedgersXml: () => api.get('/tally/export/ledgers', { responseType: 'blob' }),
  exportVouchersXml: (params) => api.get('/tally/export/vouchers', { params, responseType: 'blob' }),
  exportVouchersExcel: (params) => api.get('/tally/export/vouchers-excel', { params, responseType: 'blob' }),
  pushToTally: () => api.post('/tally/push'),
};

// ─── Accounting — Chart of Accounts, Ledger/TB/Day-Book/Cash-Book/Bank-Book/
// P&L/Balance-Sheet reports, the dashboard KPI strip, and manual vouchers ────────
export const accountingApi = {
  getChartOfAccounts: () => api.get('/accounting/chart-of-accounts'),
  createAccount: (data) => api.post('/accounting/chart-of-accounts', data),
  deactivateAccount: (id) => api.patch(`/accounting/chart-of-accounts/${id}/deactivate`),
  getLedger: (accountId, params) => api.get(`/accounting/ledger/${accountId}`, { params }),
  getTrialBalance: (params) => api.get('/accounting/trial-balance', { params }),
  getDayBook: (params) => api.get('/accounting/day-book', { params }),
  getCashBook: (params) => api.get('/accounting/cash-book', { params }),
  getBankBook: (params) => api.get('/accounting/bank-book', { params }),
  getProfitLoss: (params) => api.get('/accounting/profit-loss', { params }),
  getBalanceSheet: (params) => api.get('/accounting/balance-sheet', { params }),
  getDashboard: () => api.get('/accounting/dashboard'),
  postReceipt: (data) => api.post('/accounting/voucher/receipt', data),
  postPayment: (data) => api.post('/accounting/voucher/payment', data),
  postContra: (data) => api.post('/accounting/voucher/contra', data),
  postJournalVoucher: (data) => api.post('/accounting/voucher/journal', data),
  getVouchers: (params) => api.get('/accounting/vouchers', { params }),
  reverseVoucher: (id) => api.post(`/accounting/voucher/${id}/reverse`),
  getBranchOpeningBalances: (branchId) => api.get('/accounting/branch-opening-balances', { params: { branchId } }),
  saveBranchOpeningBalance: (data) => api.put('/accounting/branch-opening-balances', data),
  reconcileBranchOpeningBalance: (accountId) => api.get('/accounting/branch-opening-balances/reconcile', { params: { accountId } }),
  getFinancialYearCloses: () => api.get('/accounting/financial-year-closes'),
  closeFinancialYear: (data) => api.post('/accounting/close-financial-year', data),
};

// ─── User Permission Overrides ───────────────────────────────────────────────────
export const permissionsApi = {
  getOverrides: (userId) => api.get(`/permissions/overrides/${userId}`),
  createOverride: (data) => api.post('/permissions/overrides', data),
  deleteOverride: (id) => api.delete(`/permissions/overrides/${id}`),
  getBinAccess: (userId) => api.get(`/permissions/bin-access/${userId}`),
  createBinAccess: (data) => api.post('/permissions/bin-access', data),
  deleteBinAccess: (id) => api.delete(`/permissions/bin-access/${id}`),
};

// ─── Extended Master ───────────────────────────────────────────────────────────
export const masterExtApi = {
  getCollections: () => api.get('/master/collections'),
  createCollection: (data) => api.post('/master/collections', data),
  getSubCategories: () => api.get('/master/sub-categories'),
  createSubCategory: (data) => api.post('/master/sub-categories', data),
  getBrands: () => api.get('/master/brands'),
  createBrand: (data) => api.post('/master/brands', data),
  getMakingCharges: () => api.get('/master/making-charges'),
  createMakingCharge: (data) => api.post('/master/making-charges', data),
  getDiamondQuality: () => api.get('/master/diamond-quality'),
  getDiamondColor: () => api.get('/master/diamond-color'),
  getDiamondShape: () => api.get('/master/diamond-shape'),
  checkHUID: (number) => api.get(`/master/huid/${number}`),
  registerHUID: (data) => api.post('/master/huid', data),
};
