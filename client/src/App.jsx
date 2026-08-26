import React, { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/authStore';
import { useUiThemeStore } from './store/uiThemeStore';
import { uiThemeApi } from './api/modules';
import { initPrintService } from './utils/printService';

// Layouts
import MainLayout from './components/layout/MainLayout';
import AuthLayout from './components/layout/AuthLayout';

// Pages
import LoginPage from './pages/auth/LoginPage';
import DashboardPage from './pages/DashboardPage';
import HelpCenterPage from './pages/help/HelpCenterPage';
import POSPage from './pages/pos/POSPage';
import BillingHub from './pages/billing/BillingHub';
import InventoryPage from './pages/inventory/InventoryPage';
import StockManagementPage from './pages/inventory/StockManagementPage';
import AddOrnamentPage from './pages/inventory/AddOrnamentPage';
import KarigarListPage from './pages/karigar/KarigarListPage';
import KarigarIssuePage from './pages/karigar/KarigarIssuePage';
import ApprovalIssuePage from './pages/approval/ApprovalIssuePage';
import ApprovalReceivePage from './pages/approval/ApprovalReceivePage';
import ApprovalPendingListPage from './pages/approval/ApprovalPendingListPage';
import ApprovalCompletedListPage from './pages/approval/ApprovalCompletedListPage';
import NonTagIssuePage from './pages/approval/NonTagIssuePage';
import NonTagReceivePage from './pages/approval/NonTagReceivePage';
import ApprovalPartyPage from './pages/approval/ApprovalPartyPage';
import ApprovalReportsPage from './pages/reports/ApprovalReportsPage';
import KarigarReturnPage from './pages/karigar/KarigarReturnPage';
import KarigarSettlementPage from './pages/karigar/KarigarSettlementPage';
import CustomersPage from './pages/customers/CustomersPage';
import SalesHistoryPage from './pages/reports/SalesHistoryPage';
import SalesBillHistoryPage from './pages/reports/SalesBillHistoryPage';
import PurchaseReportPage from './pages/reports/PurchaseReportPage';
import KarigarReportPage from './pages/reports/KarigarReportPage';
import BranchPerformancePage from './pages/reports/BranchPerformancePage';
import DayClosePage from './pages/reports/DayClosePage';
import InvoiceTemplatePage from './pages/invoice/InvoiceTemplatePage';
import InvoiceStudio from './pages/invoice/InvoiceStudio';
import CustomerDisplayPage from './pages/customer-display/CustomerDisplayPage';
import TenantManagePage from './pages/admin/TenantManagePage';
import DeviceLicensesPage from './pages/admin/DeviceLicensesPage';
import MasterDataPage from './pages/admin/MasterDataPage';
import CompleteMasterPage from './pages/admin/CompleteMasterPage';
import MasterHub from './pages/admin/MasterHub';
import UsersPage from './pages/admin/UsersPage';
import DisplaySettingsPage from './pages/admin/DisplaySettingsPage';
import SmsSettingsPage from './pages/admin/SmsSettingsPage';
import PoliciesPage from './pages/admin/PoliciesPage';
import RoleManagementPage from './pages/admin/RoleManagementPage';
import SuperAdminDashboard from './pages/admin/SuperAdminDashboard';
import FloorsPage from './pages/floors/FloorsPage';
import HiddenStockPage from './pages/floors/HiddenStockPage';
import SpecialStockPage from './pages/inventory/SpecialStockPage';
import PrinterSettingsPage from './pages/admin/PrinterSettingsPage';
import ThemeSettingsPage from './pages/admin/ThemeSettingsPage';
import LabelDesignerPage from './pages/admin/LabelDesignerPage';
import TransferPage from './pages/transfer/TransferPage';
import PurchasePage from './pages/purchase/PurchasePage';
import PurchaseHub from './pages/purchase/PurchaseHub';
import ReportsHub from './pages/reports/ReportsHub';
import SalesReportsPage from './pages/reports/SalesReportsPage';
import InventoryReportsPage from './pages/reports/InventoryReportsPage';
import FinancialReportsPage from './pages/reports/FinancialReportsPage';
import CustomerReportsPage from './pages/reports/CustomerReportsPage';
import SchemeReportsPage from './pages/reports/SchemeReportsPage';
import ManagementReportsPage from './pages/reports/ManagementReportsPage';
import ClosingReportPage from './pages/reports/ClosingReportPage';
import RepairPage from './pages/repair/RepairPage';
import PawnbrokingPage from './pages/pawnbroking/PawnbrokingPage';
import InsuranceAmcPage from './pages/insurance-amc/InsuranceAmcPage';
import HrPayrollPage from './pages/hr/HrPayrollPage';
import CrmPage from './pages/crm/CrmPage';
import BankChequePage from './pages/bank-cheque/BankChequePage';
import AccountingDashboardPage from './pages/accounting/AccountingDashboardPage';
import ChartOfAccountsPage from './pages/accounting/ChartOfAccountsPage';
import LedgerPage from './pages/accounting/LedgerPage';
import TrialBalancePage from './pages/accounting/TrialBalancePage';
import BranchOpeningBalancesPage from './pages/accounting/BranchOpeningBalancesPage';
import DayBookPage from './pages/accounting/DayBookPage';
import VouchersPage from './pages/accounting/VouchersPage';
import RateAgentPage from './pages/rate-agent/RateAgentPage';
import CompliancePage from './pages/compliance/CompliancePage';
import ManufacturingPage from './pages/manufacturing/ManufacturingPage';
import InventoryOpsPage from './pages/inventory-ops/InventoryOpsPage';
import TallyPage from './pages/tally/TallyPage';
import PermissionsPage from './pages/permissions/PermissionsPage';
import JobCardReport from './pages/repair/JobCardReport';
import SchemePage from './pages/scheme/SchemePage';
import SavingsDashboard from './pages/savings/SavingsDashboard';
import SchemeAdjustmentPage from './pages/savings/SchemeAdjustmentPage';
import SchemeMasterPage from './pages/savings/SchemeMasterPage';
import SchemeGroupsPage from './pages/savings/SchemeGroupsPage';
import MembersPage from './pages/savings/MembersPage';
import CollectionPage from './pages/savings/CollectionPage';
import PDCPage from './pages/savings/PDCPage';
import DrawAndReportsPage from './pages/savings/DrawAndReportsPage';
import AgentManagementPage from './pages/savings/AgentManagementPage';
import BinManagementPage from './pages/bin/BinManagementPage';
import ProductCatalogPage from './pages/catalog/ProductCatalogPage';
import AdminDashboard from './pages/admin/AdminDashboard';
import AuditSecurityPage from './pages/admin/AuditSecurityPage';
import ModuleManagementPage from './pages/admin/ModuleManagementPage';
import ExcelImportPage from './pages/admin/ExcelImportPage';

const ProtectedRoute = ({ children, permission }) => {
  const { isAuthenticated, user } = useAuthStore();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (permission && !user?.permissions?.[permission]) {
    return <Navigate to="/dashboard" replace />;
  }
  return children;
};

function App() {
  const { isAuthenticated, initAuth } = useAuthStore();
  const setTheme = useUiThemeStore((s) => s.setTheme);

  useEffect(() => {
    initAuth();
    initPrintService(); // warm up the QZ Tray connection ahead of any print click
  }, []);

  // Tenant-wide theme (font/color/case) — loaded once per login, applies to
  // every user of the tenant, not just whoever set it (see ThemeSettingsPage).
  useEffect(() => {
    if (!isAuthenticated) return;
    uiThemeApi.get()
      .then((res) => setTheme(res.data.data))
      .catch(() => {}); // fall back to the CSS/antd defaults if this fails
  }, [isAuthenticated, setTheme]);

  return (
    <Routes>
      {/* Customer Display — no layout, fullscreen */}
      <Route path="/customer-display" element={<CustomerDisplayPage />} />

      {/* Auth Routes */}
      <Route element={<AuthLayout />}>
        <Route path="/login" element={<LoginPage />} />
      </Route>

      {/* Protected App Routes */}
      <Route
        element={
          <ProtectedRoute>
            <MainLayout />
          </ProtectedRoute>
        }
      >
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/help" element={<HelpCenterPage />} />
        <Route path="/billing" element={<ProtectedRoute permission="sales"><BillingHub /></ProtectedRoute>} />
        <Route path="/pos" element={<ProtectedRoute permission="sales"><POSPage /></ProtectedRoute>} />
        <Route path="/inventory" element={<StockManagementPage />} />
        <Route path="/inventory/add" element={<AddOrnamentPage />} />
        <Route path="/inventory/old" element={<InventoryPage />} />
        <Route path="/karigar" element={<KarigarListPage />} />
        <Route path="/karigar/issue" element={<ProtectedRoute permission="karigar_management"><KarigarIssuePage /></ProtectedRoute>} />
        <Route path="/karigar/return" element={<ProtectedRoute permission="karigar_management"><KarigarReturnPage /></ProtectedRoute>} />
        <Route path="/karigar/settlement" element={<ProtectedRoute permission="karigar_management"><KarigarSettlementPage /></ProtectedRoute>} />
        <Route path="/approval" element={<ApprovalPendingListPage />} />
        <Route path="/approval/completed" element={<ApprovalCompletedListPage />} />
        <Route path="/approval/parties" element={<ApprovalPartyPage />} />
        <Route path="/approval/issue" element={<ProtectedRoute permission="approval_management"><ApprovalIssuePage /></ProtectedRoute>} />
        <Route path="/approval/receive" element={<ProtectedRoute permission="approval_management"><ApprovalReceivePage /></ProtectedRoute>} />
        <Route path="/approval/non-tag/issue" element={<ProtectedRoute permission="approval_management"><NonTagIssuePage /></ProtectedRoute>} />
        <Route path="/approval/non-tag/receive" element={<ProtectedRoute permission="approval_management"><NonTagReceivePage /></ProtectedRoute>} />
        <Route path="/customers" element={<CustomersPage />} />
        <Route path="/reports/sales" element={<SalesHistoryPage />} />
        <Route path="/reports/sales-bill-history" element={<SalesBillHistoryPage />} />
        <Route path="/reports/purchase" element={<PurchaseReportPage />} />
        <Route path="/reports/karigar" element={<KarigarReportPage />} />
        <Route path="/reports/branch-performance" element={<BranchPerformancePage />} />
        <Route path="/reports/day-close" element={<DayClosePage />} />
        <Route path="/invoice/template" element={<InvoiceTemplatePage />} />
        <Route path="/invoice/studio" element={<InvoiceStudio />} />
        <Route path="/admin/tenants" element={<ProtectedRoute permission="global_master"><TenantManagePage /></ProtectedRoute>} />
        <Route path="/admin/device-licenses" element={<ProtectedRoute permission="global_master"><DeviceLicensesPage /></ProtectedRoute>} />
        <Route path="/admin/sa-dashboard" element={<ProtectedRoute permission="global_master"><SuperAdminDashboard /></ProtectedRoute>} />
        <Route path="/admin/master" element={<ProtectedRoute permission="global_master"><MasterDataPage /></ProtectedRoute>} />
        <Route path="/admin/masters" element={<CompleteMasterPage />} />
        <Route path="/masters" element={<MasterHub />} />
        <Route path="/admin/users" element={<ProtectedRoute permission="tenant_management"><UsersPage /></ProtectedRoute>} />
        <Route path="/admin/roles" element={<ProtectedRoute permission="tenant_management"><RoleManagementPage /></ProtectedRoute>} />
        <Route path="/admin/display" element={<ProtectedRoute permission="tenant_management"><DisplaySettingsPage /></ProtectedRoute>} />
        <Route path="/admin/sms-settings" element={<ProtectedRoute permission="global_master"><SmsSettingsPage /></ProtectedRoute>} />
        <Route path="/admin/policies" element={<ProtectedRoute permission="tenant_management"><PoliciesPage /></ProtectedRoute>} />
        <Route path="/admin/excel-import" element={<ProtectedRoute permission="tenant_management"><ExcelImportPage /></ProtectedRoute>} />
        <Route path="/admin/printer-settings" element={<ProtectedRoute permission="tenant_management"><PrinterSettingsPage /></ProtectedRoute>} />
        <Route path="/admin/theme-settings" element={<ProtectedRoute permission="tenant_management"><ThemeSettingsPage /></ProtectedRoute>} />
        {/* tenant_management, not global_master — every tenant admin designs their own tag now, not just Super Admin (who has both permissions anyway) */}
        <Route path="/admin/label-designer" element={<ProtectedRoute permission="tenant_management"><LabelDesignerPage /></ProtectedRoute>} />
        <Route path="/floors" element={<FloorsPage />} />
        <Route path="/floors/hidden-stock" element={<ProtectedRoute permission="tenant_management"><HiddenStockPage /></ProtectedRoute>} />
        <Route path="/inventory/special-stock" element={<ProtectedRoute permission="tenant_management"><SpecialStockPage /></ProtectedRoute>} />
        <Route path="/transfer" element={<ProtectedRoute permission="inventory"><TransferPage /></ProtectedRoute>} />
        <Route path="/purchase" element={<PurchasePage />} />
        <Route path="/purchase/hub" element={<PurchaseHub />} />
        <Route path="/reports" element={<ReportsHub />} />
        <Route path="/reports/sales-reports" element={<SalesReportsPage />} />
        <Route path="/reports/inventory-reports" element={<InventoryReportsPage />} />
        <Route path="/reports/financial-reports" element={<FinancialReportsPage />} />
        <Route path="/reports/customer-reports" element={<CustomerReportsPage />} />
        <Route path="/reports/scheme-reports" element={<SchemeReportsPage />} />
        <Route path="/reports/approval" element={<ApprovalReportsPage />} />
        <Route path="/reports/management-reports" element={<ManagementReportsPage />} />
        <Route path="/reports/closing-report" element={<ClosingReportPage />} />
        <Route path="/repair" element={<RepairPage />} />
        <Route path="/repair/job-cards" element={<JobCardReport />} />
        <Route path="/pawnbroking" element={<PawnbrokingPage />} />
        <Route path="/insurance-amc" element={<InsuranceAmcPage />} />
        <Route path="/hr-payroll" element={<ProtectedRoute permission="accounts"><HrPayrollPage /></ProtectedRoute>} />
        <Route path="/crm" element={<CrmPage />} />
        <Route path="/bank-cheque" element={<BankChequePage />} />
        <Route path="/accounting" element={<ProtectedRoute permission="accounts"><AccountingDashboardPage /></ProtectedRoute>} />
        <Route path="/accounting/chart-of-accounts" element={<ProtectedRoute permission="accounts"><ChartOfAccountsPage /></ProtectedRoute>} />
        <Route path="/accounting/ledger" element={<ProtectedRoute permission="accounts"><LedgerPage /></ProtectedRoute>} />
        <Route path="/accounting/trial-balance" element={<ProtectedRoute permission="accounts"><TrialBalancePage /></ProtectedRoute>} />
        <Route path="/accounting/branch-opening-balances" element={<ProtectedRoute permission="accounts"><BranchOpeningBalancesPage /></ProtectedRoute>} />
        <Route path="/accounting/day-book" element={<ProtectedRoute permission="accounts"><DayBookPage /></ProtectedRoute>} />
        <Route path="/accounting/vouchers" element={<ProtectedRoute permission="accounts"><VouchersPage /></ProtectedRoute>} />
        <Route path="/rate-agent" element={<RateAgentPage />} />
        <Route path="/compliance" element={<CompliancePage />} />
        <Route path="/manufacturing" element={<ManufacturingPage />} />
        <Route path="/inventory-ops" element={<InventoryOpsPage />} />
        <Route path="/tally" element={<TallyPage />} />
        <Route path="/permissions" element={<PermissionsPage />} />
        <Route path="/scheme" element={<SchemePage />} />
        <Route path="/savings" element={<SavingsDashboard />} />
        <Route path="/savings/schemes" element={<SchemeMasterPage />} />
        <Route path="/savings/groups" element={<SchemeGroupsPage />} />
        <Route path="/savings/members" element={<MembersPage />} />
        <Route path="/savings/collect" element={<CollectionPage />} />
        <Route path="/savings/pdc" element={<PDCPage />} />
        <Route path="/savings/reports" element={<DrawAndReportsPage />} />
        <Route path="/savings/agents" element={<AgentManagementPage />} />
        <Route path="/savings/adjustment" element={<ProtectedRoute permission="accounts"><SchemeAdjustmentPage /></ProtectedRoute>} />
        <Route path="/catalog" element={<ProductCatalogPage />} />
        <Route path="/bin" element={<BinManagementPage />} />
        {/* Admin-only routes */}
        <Route path="/admin/dashboard" element={<ProtectedRoute permission="tenant_management"><AdminDashboard /></ProtectedRoute>} />
        <Route path="/admin/audit" element={<ProtectedRoute permission="tenant_management"><AuditSecurityPage /></ProtectedRoute>} />
        <Route path="/admin/modules" element={<ProtectedRoute permission="global_master"><ModuleManagementPage /></ProtectedRoute>} />
      </Route>

      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

export default App;
