import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Inventory from './pages/Inventory';
import Requests from './pages/Requests';
import RequestDetail from './pages/RequestDetail';
import Stocktakes from './pages/Stocktakes';
import StocktakeSession from './pages/StocktakeSession';
import Invoices from './pages/Invoices';
import InvoiceDetail from './pages/InvoiceDetail';
import Reports from './pages/Reports';
import Users from './pages/Users';
import AuditLog from './pages/AuditLog';
import ChangePassword from './pages/ChangePassword';
import Settings from './pages/Settings';
import POS from './pages/POS';
import DoctorOrder from './pages/DoctorOrder';
import Profile from './pages/Profile';
import Returns from './pages/Returns';
import PurchaseOrders from './pages/PurchaseOrders';

type Role =
  | 'admin' | 'doctor' | 'nurse'
  | 'practice_manager' | 'receptionist' | 'locum_doctor';

// Roles that can dispense / fulfill stock
const DISPENSE_ROLES: Role[] = ['nurse', 'admin'];
// Roles that can place orders
const ORDER_ROLES: Role[]    = ['doctor', 'admin', 'locum_doctor'];
// Roles that can manage inventory settings
const MANAGE_ROLES: Role[]   = ['admin', 'practice_manager'];
// Roles with access to financial views
const FINANCE_ROLES: Role[]  = ['admin', 'practice_manager'];

const ProtectedRoute: React.FC<{ children: React.ReactNode; roles?: string[] }> = ({
  children, roles,
}) => {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-slate-500 text-sm">Loading…</p>
        </div>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  if (user.must_change_password && window.location.pathname !== '/change-password') {
    return <Navigate to="/change-password" replace />;
  }

  return <>{children}</>;
};

function App() {
  return (
    <ErrorBoundary context="application root">
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />

          <Route path="/change-password" element={
            <ProtectedRoute>
              <ChangePassword />
            </ProtectedRoute>
          } />

          <Route path="/" element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }>
            <Route index element={
              <ErrorBoundary context="Dashboard"><Dashboard /></ErrorBoundary>
            } />
            <Route path="inventory" element={
              <ErrorBoundary context="Inventory"><Inventory /></ErrorBoundary>
            } />
            <Route path="requests" element={
              <ErrorBoundary context="Requests"><Requests /></ErrorBoundary>
            } />
            <Route path="requests/:id" element={
              <ErrorBoundary context="Request Detail"><RequestDetail /></ErrorBoundary>
            } />
            <Route path="pos" element={
              <ProtectedRoute roles={DISPENSE_ROLES}>
                <ErrorBoundary context="Quick Charge"><POS /></ErrorBoundary>
              </ProtectedRoute>
            } />
            <Route path="order" element={
              <ProtectedRoute roles={ORDER_ROLES}>
                <ErrorBoundary context="New Order"><DoctorOrder /></ErrorBoundary>
              </ProtectedRoute>
            } />
            <Route path="stocktakes" element={
              <ErrorBoundary context="Stocktakes"><Stocktakes /></ErrorBoundary>
            } />
            <Route path="stocktakes/:id" element={
              <ErrorBoundary context="Stocktake Session"><StocktakeSession /></ErrorBoundary>
            } />
            <Route path="invoices" element={
              <ProtectedRoute roles={FINANCE_ROLES}>
                <ErrorBoundary context="Invoices"><Invoices /></ErrorBoundary>
              </ProtectedRoute>
            } />
            <Route path="invoices/:id" element={
              <ProtectedRoute roles={FINANCE_ROLES}>
                <ErrorBoundary context="Invoice Detail"><InvoiceDetail /></ErrorBoundary>
              </ProtectedRoute>
            } />
            <Route path="purchase-orders" element={
              <ProtectedRoute roles={FINANCE_ROLES}>
                <ErrorBoundary context="Purchase Orders"><PurchaseOrders /></ErrorBoundary>
              </ProtectedRoute>
            } />
            <Route path="reports" element={
              <ErrorBoundary context="Reports"><Reports /></ErrorBoundary>
            } />
            <Route path="users" element={
              <ProtectedRoute roles={MANAGE_ROLES}>
                <ErrorBoundary context="Users"><Users /></ErrorBoundary>
              </ProtectedRoute>
            } />
            <Route path="audit" element={
              <ProtectedRoute roles={MANAGE_ROLES}>
                <ErrorBoundary context="Audit Log"><AuditLog /></ErrorBoundary>
              </ProtectedRoute>
            } />
            <Route path="settings" element={
              <ProtectedRoute roles={MANAGE_ROLES}>
                <ErrorBoundary context="Settings"><Settings /></ErrorBoundary>
              </ProtectedRoute>
            } />
            <Route path="profile" element={
              <ErrorBoundary context="Profile"><Profile /></ErrorBoundary>
            } />
            <Route path="returns" element={
              <ProtectedRoute roles={[...DISPENSE_ROLES, 'practice_manager']}>
                <ErrorBoundary context="Returns"><Returns /></ErrorBoundary>
              </ProtectedRoute>
            } />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  );
}

export default App;
