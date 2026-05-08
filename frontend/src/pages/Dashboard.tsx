import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Package, ClipboardList, AlertTriangle, TrendingUp,
  DollarSign, Activity, ArrowRight, Clock, CheckCircle
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar
} from 'recharts';
import { format, parseISO } from 'date-fns';
import { api } from '../api/client';
import { DashboardData } from '../types';
import { useAuth } from '../context/AuthContext';
import LoadingSpinner from '../components/LoadingSpinner';
import Badge, { statusColors } from '../components/Badge';

const StatCard: React.FC<{
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ReactNode;
  color: string;
  to?: string;
}> = ({ title, value, subtitle, icon, color, to }) => {
  const content = (
    <div className={`stat-card hover:shadow-md transition-shadow ${to ? 'cursor-pointer' : ''}`}>
      <div className={`flex-shrink-0 w-12 h-12 rounded-xl ${color} flex items-center justify-center`}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-slate-500 font-medium">{title}</p>
        <p className="text-2xl font-bold text-slate-900 leading-tight">{value}</p>
        {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
      </div>
      {to && <ArrowRight size={16} className="text-slate-400 flex-shrink-0" />}
    </div>
  );
  return to ? <Link to={to}>{content}</Link> : content;
};

const Dashboard: React.FC = () => {
  const { user } = useAuth();
  const { data, isLoading } = useQuery<DashboardData>({
    queryKey: ['dashboard'],
    queryFn: async () => {
      const { data } = await api.get('/reports/dashboard');
      return data;
    },
    refetchInterval: 60_000,
  });

  const { data: pendingRequests } = useQuery({
    queryKey: ['requests', 'pending', 'count'],
    queryFn: async () => {
      const { data } = await api.get('/requests?status=pending&limit=5');
      return data;
    },
  });

  if (isLoading) return <LoadingSpinner message="Loading dashboard..." />;

  const stock = data?.stock;
  const reqToday = data?.requests_today;

  const dailyData = (data?.daily_usage ?? []).map(d => ({
    date: format(parseISO(d.date), 'dd MMM'),
    qty: Number(d.qty_used),
    revenue: Number(d.revenue),
  }));

  return (
    <div className="space-y-6">
      {/* Welcome */}
      <div>
        <h2 className="text-2xl font-bold text-slate-900">
          Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening'}, {user?.name.split(' ')[0]}
        </h2>
        <p className="text-slate-500 text-sm mt-1">
          {format(new Date(), 'EEEE, d MMMM yyyy')} — Here's your inventory overview
        </p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          title="Active Items"
          value={stock?.active_items ?? 0}
          subtitle={`${stock?.total_items ?? 0} total`}
          icon={<Package size={22} className="text-blue-600" />}
          color="bg-blue-50"
          to="/inventory"
        />
        <StatCard
          title="Low Stock Alerts"
          value={stock?.low_stock_count ?? 0}
          subtitle="Need reordering"
          icon={<AlertTriangle size={22} className="text-amber-600" />}
          color="bg-amber-50"
          to="/inventory?low_stock=true"
        />
        <StatCard
          title="Pending Requests"
          value={reqToday?.pending ?? 0}
          subtitle="Awaiting nurse action"
          icon={<ClipboardList size={22} className="text-purple-600" />}
          color="bg-purple-50"
          to="/requests?status=pending"
        />
        <StatCard
          title="Stock Value"
          value={`$${Number(stock?.total_value ?? 0).toLocaleString('en-AU', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`}
          subtitle="At billing price"
          icon={<DollarSign size={22} className="text-emerald-600" />}
          color="bg-emerald-50"
          to="/reports"
        />
      </div>

      {/* Charts + Alerts row */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Usage chart */}
        <div className="xl:col-span-2 card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-slate-900 flex items-center gap-2">
              <TrendingUp size={18} className="text-blue-500" />
              30-Day Usage Trend
            </h3>
          </div>
          {dailyData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={dailyData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{ background: '#1e293b', border: 'none', borderRadius: '8px', color: '#f1f5f9', fontSize: '12px' }}
                  formatter={(v: number) => [`$${v.toFixed(2)}`, 'Revenue']}
                />
                <Area type="monotone" dataKey="revenue" stroke="#3b82f6" strokeWidth={2} fill="url(#colorRevenue)" />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[220px] flex items-center justify-center text-slate-400 text-sm">
              No usage data in the last 30 days
            </div>
          )}
        </div>

        {/* Top used items */}
        <div className="card p-5">
          <h3 className="font-semibold text-slate-900 flex items-center gap-2 mb-4">
            <Activity size={18} className="text-emerald-500" />
            Top Used Items (30d)
          </h3>
          {(data?.top_used ?? []).length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart
                data={(data?.top_used ?? []).slice(0, 5).map(i => ({ name: i.name.length > 18 ? i.name.slice(0, 18) + '…' : i.name, qty: Number(i.total_used) }))}
                layout="vertical"
                margin={{ top: 0, right: 10, left: 0, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: '#64748b' }} width={90} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{ background: '#1e293b', border: 'none', borderRadius: '8px', color: '#f1f5f9', fontSize: '12px' }}
                />
                <Bar dataKey="qty" fill="#10b981" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[220px] flex items-center justify-center text-slate-400 text-sm">
              No usage data yet
            </div>
          )}
        </div>
      </div>

      {/* Alerts + Activity row */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Low stock */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-slate-900 flex items-center gap-2">
              <AlertTriangle size={17} className="text-amber-500" />
              Low Stock
            </h3>
            <Link to="/inventory?low_stock=true" className="text-blue-600 text-xs hover:underline flex items-center gap-1">
              View all <ArrowRight size={12} />
            </Link>
          </div>
          {(data?.low_stock ?? []).length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-6">
              <CheckCircle size={28} className="text-emerald-400" />
              <p className="text-sm text-slate-400">All stock levels healthy</p>
            </div>
          ) : (
            <div className="space-y-2">
              {(data?.low_stock ?? []).slice(0, 6).map(item => (
                <Link key={item.id} to={`/inventory`} className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-50 group">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">{item.name}</p>
                    <p className="text-xs text-slate-400">{item.category_name}</p>
                  </div>
                  <div className="text-right flex-shrink-0 ml-2">
                    <span className="text-sm font-bold text-red-600">{item.quantity_on_hand}</span>
                    <span className="text-xs text-slate-400">/{item.reorder_threshold} {item.unit}</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Expiring soon */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-slate-900 flex items-center gap-2">
              <Clock size={17} className="text-orange-500" />
              Expiring Soon
            </h3>
            <Link to="/reports" className="text-blue-600 text-xs hover:underline flex items-center gap-1">
              View all <ArrowRight size={12} />
            </Link>
          </div>
          {(data?.expiring_soon ?? []).length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-6">
              <CheckCircle size={28} className="text-emerald-400" />
              <p className="text-sm text-slate-400">No items expiring soon</p>
            </div>
          ) : (
            <div className="space-y-2">
              {(data?.expiring_soon ?? []).slice(0, 6).map((item, i) => {
                const daysLeft = Math.round((new Date(item.expiry_date).getTime() - Date.now()) / 86400000);
                return (
                  <div key={i} className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-50">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">{item.name}</p>
                      <p className="text-xs text-slate-400">Batch: {item.batch_number}</p>
                    </div>
                    <div className="text-right flex-shrink-0 ml-2">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${daysLeft <= 14 ? 'bg-red-100 text-red-700' : daysLeft <= 30 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>
                        {daysLeft}d
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Recent activity */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-slate-900 flex items-center gap-2">
              <Activity size={17} className="text-blue-500" />
              Recent Activity
            </h3>
          </div>
          {(data?.recent_activity ?? []).length === 0 ? (
            <p className="text-sm text-slate-400 py-6 text-center">No recent activity</p>
          ) : (
            <div className="space-y-3">
              {(data?.recent_activity ?? []).map((item, i) => (
                <div key={i} className="flex gap-3">
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-1.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-slate-600 leading-snug">
                      <span className="font-medium">{item.user_name}</span>{' '}
                      {item.action.replace(/_/g, ' ').toLowerCase()}{' '}
                      {item.entity_name && <span className="font-medium">{item.entity_name}</span>}
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {format(parseISO(item.created_at), 'dd MMM, HH:mm')}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Quick actions for doctors */}
      {user?.role === 'doctor' && (
        <div className="card p-5">
          <h3 className="font-semibold text-slate-900 mb-4">Quick Actions</h3>
          <div className="flex flex-wrap gap-3">
            <Link to="/requests" className="btn-primary">
              <ClipboardList size={16} />
              New Stock Request
            </Link>
            <Link to="/inventory" className="btn-secondary">
              <Package size={16} />
              Browse Inventory
            </Link>
          </div>
        </div>
      )}

      {/* Quick actions for nurses */}
      {user?.role === 'nurse' && pendingRequests?.total > 0 && (
        <div className="card p-5 border-amber-200 bg-amber-50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <AlertTriangle size={20} className="text-amber-600" />
              <div>
                <p className="font-semibold text-amber-900">
                  {pendingRequests.total} pending request{pendingRequests.total !== 1 ? 's' : ''} awaiting fulfillment
                </p>
                <p className="text-sm text-amber-700">Doctor orders need your attention</p>
              </div>
            </div>
            <Link to="/requests?status=pending" className="btn bg-amber-600 text-white hover:bg-amber-700">
              View Requests <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
