import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
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

const ProtectedRoute: React.FC<{ children: React.ReactNode; roles?: string[] }> = ({
  children, roles,
}) => {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-slate-500 text-sm">Loading...</p>
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
          <Route index element={<Dashboard />} />
          <Route path="inventory" element={<Inventory />} />
          <Route path="requests" element={<Requests />} />
          <Route path="requests/:id" element={<RequestDetail />} />
          <Route path="pos" element={
            <ProtectedRoute roles={['nurse', 'admin']}>
              <POS />
            </ProtectedRoute>
          } />
          <Route path="order" element={
            <ProtectedRoute roles={['doctor', 'admin']}>
              <DoctorOrder />
            </ProtectedRoute>
          } />
          <Route path="stocktakes" element={<Stocktakes />} />
          <Route path="stocktakes/:id" element={<StocktakeSession />} />
          <Route path="invoices" element={<Invoices />} />
          <Route path="invoices/:id" element={<InvoiceDetail />} />
          <Route path="reports" element={<Reports />} />
          <Route path="users" element={
            <ProtectedRoute roles={['admin']}>
              <Users />
            </ProtectedRoute>
          } />
          <Route path="audit" element={
            <ProtectedRoute roles={['admin']}>
              <AuditLog />
            </ProtectedRoute>
          } />
          <Route path="settings" element={
            <ProtectedRoute roles={['admin']}>
              <Settings />
            </ProtectedRoute>
          } />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
