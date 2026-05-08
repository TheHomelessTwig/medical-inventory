import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Package, ClipboardList, Stethoscope,
  FileText, BarChart3, Users, Shield, X, LogOut, Settings,
  Activity, ShoppingCart, Sun, Moon, UserCircle, ArrowLeftRight,
  Truck
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import toast from 'react-hot-toast';

interface NavItem {
  to: string;
  label: string;
  icon: React.ReactNode;
  roles?: string[];
}

const navItems: NavItem[] = [
  { to: '/',                label: 'Dashboard',       icon: <LayoutDashboard size={18} /> },
  { to: '/inventory',       label: 'Inventory',       icon: <Package size={18} /> },
  { to: '/order',           label: 'New Order',       icon: <ClipboardList size={18} />,  roles: ['doctor', 'admin', 'locum_doctor'] },
  { to: '/pos',             label: 'Quick Charge',    icon: <ShoppingCart size={18} />,   roles: ['nurse', 'admin'] },
  { to: '/requests',        label: 'Requests',        icon: <ClipboardList size={18} />,  roles: ['admin', 'doctor', 'nurse', 'practice_manager', 'locum_doctor'] },
  { to: '/stocktakes',      label: 'Stocktakes',      icon: <Activity size={18} />,       roles: ['admin', 'nurse', 'practice_manager'] },
  { to: '/returns',         label: 'Returns',         icon: <ArrowLeftRight size={18} />, roles: ['admin', 'nurse', 'practice_manager'] },
  { to: '/purchase-orders', label: 'Purchase Orders', icon: <Truck size={18} />,          roles: ['admin', 'practice_manager'] },
  { to: '/invoices',        label: 'Invoices',        icon: <FileText size={18} />,       roles: ['admin', 'practice_manager'] },
  { to: '/reports',         label: 'Reports',         icon: <BarChart3 size={18} />,      roles: ['admin', 'doctor', 'nurse', 'practice_manager', 'locum_doctor'] },
  { to: '/users',           label: 'Users',           icon: <Users size={18} />,          roles: ['admin', 'practice_manager'] },
  { to: '/audit',           label: 'Audit Log',       icon: <Shield size={18} />,         roles: ['admin', 'practice_manager'] },
  { to: '/settings',        label: 'Settings',        icon: <Settings size={18} />,       roles: ['admin', 'practice_manager'] },
];

const roleColors: Record<string, string> = {
  admin:            'bg-purple-500/20 text-purple-300',
  doctor:           'bg-blue-500/20 text-blue-300',
  nurse:            'bg-emerald-500/20 text-emerald-300',
  practice_manager: 'bg-amber-500/20 text-amber-300',
  receptionist:     'bg-slate-500/20 text-slate-300',
  locum_doctor:     'bg-cyan-500/20 text-cyan-300',
};

interface SidebarProps { onClose?: () => void }

const Sidebar: React.FC<SidebarProps> = ({ onClose }) => {
  const { user, logout } = useAuth();
  const { mode, toggleMode } = useTheme();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    toast.success('Logged out');
    navigate('/login');
  };

  const visibleItems = navItems.filter(
    item => !item.roles || (user && item.roles.includes(user.role))
  );

  return (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="flex items-center justify-between px-5 h-16 border-b border-slate-700/50">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'var(--accent)' }}>
            <Stethoscope size={16} className="text-white" />
          </div>
          <div>
            <div className="text-white font-black text-sm leading-none tracking-widest">S.H.I.T.</div>
            <div className="text-slate-400 text-xs leading-none mt-0.5">Sam's Inventory</div>
          </div>
        </div>
        {onClose && (
          <button onClick={onClose} className="lg:hidden p-1 text-slate-400 hover:text-white">
            <X size={18} />
          </button>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {visibleItems.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            onClick={onClose}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                isActive
                  ? 'text-white'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`
            }
            style={({ isActive }) => isActive ? { backgroundColor: 'var(--accent)' } : {}}
          >
            {item.icon}
            {item.label}
          </NavLink>
        ))}
      </nav>

      {/* Bottom controls */}
      {user && (
        <div className="px-3 py-4 border-t border-slate-700/50 space-y-1">
          {/* User card → profile link */}
          <NavLink
            to="/profile"
            onClick={onClose}
            className="flex items-center gap-3 px-3 py-2 rounded-lg bg-slate-800/50 hover:bg-slate-800 transition-colors w-full text-left"
          >
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-semibold flex-shrink-0"
              style={{ backgroundColor: 'var(--accent)' }}>
              {user.name.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-white text-sm font-medium truncate">{user.name}</div>
              <span className={`badge text-xs mt-0.5 ${roleColors[user.role] || 'bg-slate-500/20 text-slate-300'}`}>
                {user.role}
              </span>
            </div>
            <UserCircle size={15} className="text-slate-500 flex-shrink-0" />
          </NavLink>

          {/* Dark mode toggle */}
          <button
            onClick={toggleMode}
            className="flex items-center gap-3 px-3 py-2 w-full rounded-lg text-sm font-medium text-slate-400 hover:text-white hover:bg-slate-800 transition-all"
          >
            {mode === 'dark'
              ? <Sun size={16} className="text-amber-400" />
              : <Moon size={16} />}
            {mode === 'dark' ? 'Light mode' : 'Dark mode'}
          </button>

          {/* Sign out */}
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 px-3 py-2 w-full rounded-lg text-sm font-medium text-slate-400 hover:text-red-400 hover:bg-slate-800 transition-all"
          >
            <LogOut size={16} />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
};

export default Sidebar;
