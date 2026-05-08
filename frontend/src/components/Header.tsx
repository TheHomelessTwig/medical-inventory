import React from 'react';
import { Menu, Bell } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';

const pageTitles: Record<string, string> = {
  '/': 'Dashboard',
  '/inventory': 'Inventory',
  '/requests': 'Stock Requests',
  '/stocktakes': 'Stocktakes',
  '/invoices': 'Invoices',
  '/reports': 'Reports',
  '/users': 'User Management',
  '/audit': 'Audit Log',
  '/change-password': 'Change Password',
};

interface HeaderProps {
  onMenuClick: () => void;
}

const Header: React.FC<HeaderProps> = ({ onMenuClick }) => {
  const location = useLocation();
  const title = pageTitles[location.pathname] || 'S.H.I.T.';

  const { data: lowStockCount } = useQuery({
    queryKey: ['low-stock-count'],
    queryFn: async () => {
      const { data } = await api.get('/reports/low-stock');
      return Array.isArray(data) ? data.length : 0;
    },
    refetchInterval: 5 * 60 * 1000,
    staleTime: 2 * 60 * 1000,
  });

  return (
    <header className="h-16 bg-white border-b border-slate-200 flex items-center px-4 sm:px-6 gap-4 flex-shrink-0">
      <button
        onClick={onMenuClick}
        className="lg:hidden p-2 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-700"
        aria-label="Open menu"
      >
        <Menu size={20} />
      </button>

      <h1 className="text-lg font-semibold text-slate-900 flex-1">{title}</h1>

      <div className="flex items-center gap-2">
        {(lowStockCount ?? 0) > 0 && (
          <div className="relative">
            <button className="p-2 rounded-lg text-amber-600 hover:bg-amber-50">
              <Bell size={18} />
            </button>
            <span className="absolute -top-1 -right-1 w-4 h-4 bg-amber-500 rounded-full text-white text-[10px] font-bold flex items-center justify-center">
              {lowStockCount}
            </span>
          </div>
        )}
      </div>
    </header>
  );
};

export default Header;
