import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format, subDays } from 'date-fns';
import {
  BarChart3, Download, TrendingUp, AlertTriangle, Clock,
  Package, DollarSign, TrendingDown, Filter, Users, FileText
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell,
  LineChart, Line, Legend,
} from 'recharts';
import { api, getErrorMessage } from '../api/client';
import LoadingSpinner from '../components/LoadingSpinner';
import toast from 'react-hot-toast';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#f97316', '#64748b'];

type ReportTab = 'overview' | 'usage' | 'expiring' | 'low-stock' | 'valuation' | 'movements' | 'invoices' | 'wastage' | 'patient-ledger';

const Reports: React.FC = () => {
  const [tab, setTab] = useState<ReportTab>('overview');
  const [dateFrom, setDateFrom] = useState(format(subDays(new Date(), 30), 'yyyy-MM-dd'));
  const [dateTo, setDateTo] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [groupBy, setGroupBy] = useState<'item' | 'doctor' | 'nurse' | 'category'>('item');
  const [period, setPeriod] = useState<'day' | 'week' | 'month'>('day');
  const [expiringDays, setExpiringDays] = useState(60);

  const { data: lowStock, isLoading: llLoading } = useQuery({
    queryKey: ['report-low-stock'],
    queryFn: async () => (await api.get('/reports/low-stock')).data,
    enabled: tab === 'low-stock' || tab === 'overview',
  });

  const { data: expiring, isLoading: expLoading } = useQuery({
    queryKey: ['report-expiring', expiringDays],
    queryFn: async () => (await api.get(`/reports/expiring?days=${expiringDays}`)).data,
    enabled: tab === 'expiring' || tab === 'overview',
  });

  const { data: valuation, isLoading: valLoading } = useQuery({
    queryKey: ['report-valuation'],
    queryFn: async () => (await api.get('/reports/valuation')).data,
    enabled: tab === 'valuation' || tab === 'overview',
  });

  const { data: usage, isLoading: usageLoading } = useQuery({
    queryKey: ['report-usage', dateFrom, dateTo, groupBy, period],
    queryFn: async () => (await api.get(
      `/reports/usage?from=${dateFrom}&to=${dateTo}&group_by=${groupBy}&period=${period}`
    )).data,
    enabled: tab === 'usage',
  });

  const { data: movements, isLoading: movLoading } = useQuery({
    queryKey: ['report-movements', dateFrom, dateTo],
    queryFn: async () => (await api.get(`/reports/movements?from=${dateFrom}&to=${dateTo}&limit=200`)).data,
    enabled: tab === 'movements',
  });

  const { data: invoiceReport, isLoading: invLoading } = useQuery({
    queryKey: ['report-invoices', dateFrom, dateTo],
    queryFn: async () => (await api.get(`/reports/invoices?from=${dateFrom}&to=${dateTo}`)).data,
    enabled: tab === 'invoices',
  });

  const { data: wastageReport, isLoading: wastageLoading } = useQuery({
    queryKey: ['report-wastage', dateFrom, dateTo],
    queryFn: async () => (await api.get(`/reports/wastage?from=${dateFrom}&to=${dateTo}`)).data,
    enabled: tab === 'wastage',
  });

  const [patientRef, setPatientRef] = useState('');
  const [patientSearch, setPatientSearch] = useState('');
  const { data: patientLedger, isLoading: patientLoading, refetch: searchPatient } = useQuery({
    queryKey: ['patient-ledger', patientSearch],
    queryFn: async () => (await api.get(`/requests/patient-ledger?patient_ref=${encodeURIComponent(patientSearch)}`)).data,
    enabled: patientSearch.length >= 2,
  });

  const handleExport = async (endpoint: string, filename: string, params = '') => {
    try {
      const res = await api.get(`${endpoint}?format=csv&from=${dateFrom}&to=${dateTo}${params}`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url; a.download = `${filename}_${format(new Date(), 'yyyy-MM-dd')}.csv`; a.click();
      URL.revokeObjectURL(url);
    } catch (err) { toast.error(getErrorMessage(err)); }
  };

  const tabs: { key: ReportTab; label: string; icon: React.ReactNode }[] = [
    { key: 'overview', label: 'Overview', icon: <BarChart3 size={15} /> },
    { key: 'usage', label: 'Usage', icon: <TrendingUp size={15} /> },
    { key: 'wastage', label: 'Wastage', icon: <AlertTriangle size={15} /> },
    { key: 'patient-ledger', label: 'Patient Ledger', icon: <Users size={15} /> },
    { key: 'expiring', label: 'Expiring', icon: <Clock size={15} /> },
    { key: 'low-stock', label: 'Low Stock', icon: <TrendingDown size={15} /> },
    { key: 'valuation', label: 'Valuation', icon: <DollarSign size={15} /> },
    { key: 'invoices', label: 'Invoices', icon: <FileText size={15} /> },
    { key: 'movements', label: 'Movements', icon: <Package size={15} /> },
  ];

  // ── Trend chart data from period-based query ─────────────────────────────
  const trendData = (usage?.trend ?? []).map((d: Record<string, unknown>) => ({
    label: d.period_start ? format(new Date(String(d.period_start)), period === 'month' ? 'MMM yy' : period === 'week' ? 'dd MMM' : 'dd MMM') : '',
    revenue: Number(d.revenue || 0),
    qty: Number(d.qty_used || 0),
  }));

  const labelKey = (gb: string) =>
    gb === 'nurse' ? 'nurse_name' : gb === 'doctor' ? 'doctor_name' : gb === 'category' ? 'category_name' : 'item_name';

  return (
    <div className="space-y-5">
      <div className="page-header">
        <h1 className="page-title">Reports</h1>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => handleExport('/reports/stock-on-hand', 'stock_on_hand')} className="btn-secondary btn-sm">
            <Download size={14} /> Stock Export
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 flex-wrap p-1 bg-slate-100 rounded-xl w-fit">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${tab === t.key ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* Date range + group controls */}
      {['usage', 'movements', 'invoices'].includes(tab) && (
        <div className="card p-4 flex flex-wrap items-center gap-4">
          <Filter size={15} className="text-slate-400" />
          <div className="flex items-center gap-2">
            <label className="text-sm text-slate-600">From:</label>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="input py-1.5 text-sm" />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm text-slate-600">To:</label>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="input py-1.5 text-sm" />
          </div>

          {tab === 'usage' && (
            <>
              <div className="flex items-center gap-2">
                <label className="text-sm text-slate-600">Group by:</label>
                <select value={groupBy} onChange={e => setGroupBy(e.target.value as typeof groupBy)} className="input py-1.5 text-sm">
                  <option value="item">Item</option>
                  <option value="doctor">Doctor</option>
                  <option value="nurse">Nurse ★</option>
                  <option value="category">Category</option>
                </select>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-sm text-slate-600">Trend period:</label>
                <select value={period} onChange={e => setPeriod(e.target.value as typeof period)} className="input py-1.5 text-sm">
                  <option value="day">Daily</option>
                  <option value="week">Weekly ★</option>
                  <option value="month">Monthly ★</option>
                </select>
              </div>
            </>
          )}

          <div className="flex gap-2 ml-auto">
            {tab === 'usage' && (
              <button onClick={() => handleExport('/reports/usage', `usage_${groupBy}`, `&group_by=${groupBy}`)} className="btn-secondary btn-sm">
                <Download size={14} /> Export
              </button>
            )}
            {tab === 'movements' && (
              <button onClick={() => handleExport('/reports/movements', 'movements')} className="btn-secondary btn-sm">
                <Download size={14} /> Export
              </button>
            )}
            {tab === 'invoices' && (
              <button onClick={() => handleExport('/reports/invoices', 'invoices')} className="btn-secondary btn-sm">
                <Download size={14} /> Export CSV
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Overview ── */}
      {tab === 'overview' && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="card p-5">
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">Stock Value (at sell)</p>
              <p className="text-3xl font-bold text-slate-900">${Number(valuation?.totals?.total_sell || 0).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
            </div>
            <div className="card p-5">
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">Stock Value (at cost)</p>
              <p className="text-3xl font-bold text-slate-900">${Number(valuation?.totals?.total_cost || 0).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
            </div>
            <div className="card p-5">
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">Gross Margin</p>
              <p className="text-3xl font-bold text-emerald-600">
                ${(Number(valuation?.totals?.total_sell || 0) - Number(valuation?.totals?.total_cost || 0)).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
            <div className="card p-5">
              <h3 className="font-semibold text-slate-900 mb-4">Low Stock ({(lowStock || []).length} items)</h3>
              {llLoading ? <LoadingSpinner size="sm" /> : (lowStock || []).length === 0 ? (
                <p className="text-slate-400 text-sm py-4 text-center">All stock levels are healthy ✓</p>
              ) : (
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-slate-100"><th className="text-left py-1 text-xs text-slate-500">Item</th><th className="text-right py-1 text-xs text-slate-500">On Hand</th><th className="text-right py-1 text-xs text-slate-500">Min</th></tr></thead>
                  <tbody>
                    {(lowStock || []).slice(0, 8).map((item: Record<string, unknown>) => (
                      <tr key={String(item.id)} className="border-b border-slate-50">
                        <td className="py-1.5 font-medium">{String(item.name)}</td>
                        <td className="text-right py-1.5 text-red-600 font-semibold">{Number(item.quantity_on_hand).toFixed(0)} {String(item.unit)}</td>
                        <td className="text-right py-1.5 text-slate-400">{Number(item.reorder_threshold).toFixed(0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div className="card p-5">
              <h3 className="font-semibold text-slate-900 mb-4">Value by Category</h3>
              {valLoading ? <LoadingSpinner size="sm" /> : (
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie
                      data={(valuation?.by_category || []).filter((c: Record<string, unknown>) => Number(c.cost_value) > 0).map((c: Record<string, unknown>) => ({ name: String(c.category || 'Uncategorised'), value: Number(c.cost_value) }))}
                      cx="50%" cy="50%" outerRadius={80} dataKey="value"
                      label={({ name, percent }) => `${String(name).slice(0, 12)} ${(percent * 100).toFixed(0)}%`}
                      labelLine={false}
                    >
                      {(valuation?.by_category || []).map((_: unknown, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v: number) => `$${v.toFixed(2)}`} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Usage ── */}
      {tab === 'usage' && (
        <div className="space-y-5">
          {usageLoading ? <LoadingSpinner /> : (
            <>
              {/* Trend chart — weekly/monthly ← NEW */}
              {trendData.length > 0 && (
                <div className="card p-5">
                  <h3 className="font-semibold text-slate-900 mb-4">
                    {period === 'month' ? 'Monthly' : period === 'week' ? 'Weekly' : 'Daily'} Revenue Trend
                  </h3>
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={trendData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} />
                      <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
                      <Tooltip formatter={(v: number) => `$${v.toFixed(2)}`} contentStyle={{ background: '#1e293b', border: 'none', borderRadius: '8px', color: '#f1f5f9', fontSize: '12px' }} />
                      <Legend />
                      <Line type="monotone" dataKey="revenue" stroke="#3b82f6" strokeWidth={2} dot={false} name="Revenue ($)" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Summary bar chart */}
              {!(usage?.data?.length) ? (
                <div className="card p-16 text-center text-slate-400">No usage data for this period</div>
              ) : (
                <>
                  <div className="card p-5">
                    <h3 className="font-semibold text-slate-900 mb-4">
                      Usage by {groupBy === 'nurse' ? 'Nurse ★' : groupBy.charAt(0).toUpperCase() + groupBy.slice(1)}
                    </h3>
                    <ResponsiveContainer width="100%" height={280}>
                      <BarChart
                        data={(usage?.data || []).slice(0, 15).map((d: Record<string, unknown>) => ({
                          name: String(d[labelKey(groupBy)] || '').slice(0, 20),
                          value: Number(d.total_charge || 0),
                        }))}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                        <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} angle={-20} textAnchor="end" height={50} />
                        <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
                        <Tooltip formatter={(v: number) => `$${v.toFixed(2)}`} />
                        <Bar dataKey="value" fill={groupBy === 'nurse' ? '#10b981' : '#3b82f6'} radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="card overflow-hidden">
                    <table className="w-full text-sm">
                      <thead><tr className="border-b border-slate-200">
                        <th className="table-th">{groupBy === 'nurse' ? 'Nurse' : groupBy === 'doctor' ? 'Doctor' : groupBy === 'category' ? 'Category' : 'Item'}</th>
                        {groupBy === 'nurse' && <th className="table-th text-right">Fulfillments</th>}
                        {groupBy === 'doctor' && <th className="table-th text-right">Requests</th>}
                        {groupBy === 'item' && <th className="table-th">SKU</th>}
                        <th className="table-th text-right">Qty Used</th>
                        <th className="table-th text-right">Total Charge</th>
                      </tr></thead>
                      <tbody className="divide-y divide-slate-50">
                        {(usage?.data || []).map((d: Record<string, unknown>, i: number) => (
                          <tr key={i} className="hover:bg-slate-50">
                            <td className="table-td font-medium">{String(d[labelKey(groupBy)] || '—')}</td>
                            {groupBy === 'nurse' && <td className="table-td text-right">{Number(d.fulfillment_count || 0)}</td>}
                            {groupBy === 'doctor' && <td className="table-td text-right">{Number(d.request_count || 0)}</td>}
                            {groupBy === 'item' && <td className="table-td font-mono text-xs text-slate-400">{String(d.sku || '—')}</td>}
                            <td className="table-td text-right">{Number(d.total_qty_used || 0).toFixed(2)}</td>
                            <td className="table-td text-right font-semibold">${Number(d.total_charge || 0).toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Expiring ── */}
      {tab === 'expiring' && (
        <div className="space-y-4">
          <div className="card p-4 flex items-center gap-4">
            <label className="text-sm text-slate-600 flex-shrink-0">Show items expiring within:</label>
            <select value={expiringDays} onChange={e => setExpiringDays(Number(e.target.value))} className="input py-1.5 text-sm w-32">
              <option value={30}>30 days</option>
              <option value={60}>60 days</option>
              <option value={90}>90 days</option>
              <option value={180}>180 days</option>
            </select>
            <button onClick={() => handleExport('/reports/expiring', 'expiring_stock', `&days=${expiringDays}`)} className="btn-secondary btn-sm ml-auto">
              <Download size={14} /> Export
            </button>
          </div>
          <div className="card overflow-hidden">
            {expLoading ? <LoadingSpinner /> : !(expiring || []).length ? (
              <div className="p-16 text-center text-slate-400">No items expiring within {expiringDays} days ✓</div>
            ) : (
              <table className="w-full">
                <thead><tr className="border-b border-slate-200">
                  <th className="table-th">Item</th><th className="table-th">Batch #</th>
                  <th className="table-th">Category</th><th className="table-th text-right">Qty</th>
                  <th className="table-th text-right">Expiry Date</th><th className="table-th text-right">Days Left</th>
                </tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {(expiring || []).map((item: Record<string, unknown>, i: number) => {
                    const days = Number(item.days_until_expiry);
                    return (
                      <tr key={i} className="hover:bg-slate-50">
                        <td className="table-td font-medium">{String(item.name)}</td>
                        <td className="table-td font-mono text-xs text-slate-500">{String(item.batch_number || '—')}</td>
                        <td className="table-td text-slate-500 text-sm">{String(item.category || '—')}</td>
                        <td className="table-td text-right">{Number(item.quantity).toFixed(2)} {String(item.unit)}</td>
                        <td className="table-td text-right text-sm">{String(item.expiry_date)}</td>
                        <td className="table-td text-right">
                          <span className={`font-bold ${days <= 14 ? 'text-red-600' : days <= 30 ? 'text-amber-600' : 'text-slate-600'}`}>{days}d</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* ── Low Stock ── */}
      {tab === 'low-stock' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button onClick={() => handleExport('/reports/low-stock', 'low_stock')} className="btn-secondary btn-sm">
              <Download size={14} /> Export
            </button>
          </div>
          <div className="card overflow-hidden">
            {llLoading ? <LoadingSpinner /> : !(lowStock || []).length ? (
              <div className="p-16 text-center text-slate-400">All stock levels are healthy ✓</div>
            ) : (
              <table className="w-full">
                <thead><tr className="border-b border-slate-200">
                  <th className="table-th">Item</th><th className="table-th">Category</th>
                  <th className="table-th">Supplier</th><th className="table-th text-right">On Hand</th>
                  <th className="table-th text-right">Threshold</th><th className="table-th text-right">Deficit</th>
                </tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {(lowStock || []).map((item: Record<string, unknown>) => (
                    <tr key={String(item.id)} className="hover:bg-slate-50">
                      <td className="table-td font-medium">{String(item.name)}</td>
                      <td className="table-td text-slate-500 text-sm">{String(item.category_name || '—')}</td>
                      <td className="table-td text-slate-500 text-sm">{String(item.supplier_name || '—')}</td>
                      <td className="table-td text-right font-bold text-red-600">{Number(item.quantity_on_hand).toFixed(0)} {String(item.unit)}</td>
                      <td className="table-td text-right text-slate-500">{Number(item.reorder_threshold).toFixed(0)}</td>
                      <td className="table-td text-right text-red-600 font-semibold">{Number(item.deficit).toFixed(0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* ── Valuation ── */}
      {tab === 'valuation' && (
        <div className="space-y-5">
          {valLoading ? <LoadingSpinner /> : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {[
                  { label: 'Total Cost Value', value: valuation?.totals?.total_cost, color: 'text-slate-900' },
                  { label: 'Total Sell Value', value: valuation?.totals?.total_sell, color: 'text-slate-900' },
                  { label: 'Gross Margin', value: Number(valuation?.totals?.total_sell || 0) - Number(valuation?.totals?.total_cost || 0), color: 'text-emerald-600' },
                ].map(({ label, value, color }) => (
                  <div key={label} className="card p-5">
                    <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">{label}</p>
                    <p className={`text-2xl font-bold ${color}`}>${Number(value || 0).toLocaleString('en-AU', { minimumFractionDigits: 2 })}</p>
                  </div>
                ))}
              </div>
              <div className="flex justify-end">
                <button onClick={() => handleExport('/reports/valuation', 'valuation')} className="btn-secondary btn-sm">
                  <Download size={14} /> Export
                </button>
              </div>
              <div className="card overflow-hidden">
                <table className="w-full">
                  <thead><tr className="border-b border-slate-200">
                    <th className="table-th">Category</th><th className="table-th text-right">Items</th>
                    <th className="table-th text-right">Total Units</th><th className="table-th text-right">Cost Value</th>
                    <th className="table-th text-right">Sell Value</th><th className="table-th text-right">Margin</th>
                  </tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {(valuation?.by_category || []).map((cat: Record<string, unknown>, i: number) => (
                      <tr key={i} className="hover:bg-slate-50">
                        <td className="table-td font-medium">{String(cat.category || 'Uncategorised')}</td>
                        <td className="table-td text-right text-slate-500">{Number(cat.item_count)}</td>
                        <td className="table-td text-right text-slate-500">{Number(cat.total_units).toFixed(2)}</td>
                        <td className="table-td text-right">${Number(cat.cost_value).toFixed(2)}</td>
                        <td className="table-td text-right">${Number(cat.sell_value).toFixed(2)}</td>
                        <td className="table-td text-right text-emerald-600 font-semibold">${Number(cat.gross_margin).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Invoices ← NEW ── */}
      {tab === 'invoices' && (
        <div className="card overflow-hidden">
          {invLoading ? <LoadingSpinner /> : !(invoiceReport || []).length ? (
            <div className="p-16 text-center text-slate-400">No invoices in this period</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-slate-200">
                  <th className="table-th">Invoice #</th><th className="table-th">Supplier</th>
                  <th className="table-th">Received</th><th className="table-th">Item</th>
                  <th className="table-th">Batch</th><th className="table-th text-right">Qty</th>
                  <th className="table-th text-right">Unit Cost</th><th className="table-th text-right">Total</th>
                  <th className="table-th">Status</th>
                </tr></thead>
                <tbody className="divide-y divide-slate-50">
                  {(invoiceReport || []).map((row: Record<string, unknown>, i: number) => (
                    <tr key={i} className="hover:bg-slate-50">
                      <td className="table-td font-mono text-xs font-semibold text-blue-700">{String(row.invoice_number)}</td>
                      <td className="table-td">{String(row.supplier_name)}</td>
                      <td className="table-td text-slate-500 text-xs">{String(row.received_date || '').slice(0, 10)}</td>
                      <td className="table-td font-medium">{String(row.item_name)}</td>
                      <td className="table-td font-mono text-xs text-slate-400">{String(row.batch_number || '—')}</td>
                      <td className="table-td text-right">{Number(row.quantity).toFixed(2)}</td>
                      <td className="table-td text-right">${Number(row.unit_cost).toFixed(4)}</td>
                      <td className="table-td text-right font-semibold">${Number(row.total_cost || 0).toFixed(2)}</td>
                      <td className="table-td"><span className="badge bg-slate-100 text-slate-600 text-xs">{String(row.status)}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Movements ── */}
      {tab === 'movements' && (
        <div className="card overflow-hidden">
          {movLoading ? <LoadingSpinner /> : !(movements || []).length ? (
            <div className="p-16 text-center text-slate-400">No movements in this period</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-slate-200">
                  <th className="table-th">Date/Time</th><th className="table-th">Item</th>
                  <th className="table-th">Type</th><th className="table-th text-right">Change</th>
                  <th className="table-th text-right">Before</th><th className="table-th text-right">After</th>
                  <th className="table-th">Reason</th><th className="table-th">By</th>
                </tr></thead>
                <tbody className="divide-y divide-slate-50">
                  {(movements || []).map((m: Record<string, unknown>, i: number) => (
                    <tr key={i} className="hover:bg-slate-50">
                      <td className="table-td text-xs text-slate-500 whitespace-nowrap">{String(m.created_at).slice(0, 16).replace('T', ' ')}</td>
                      <td className="table-td font-medium">{String(m.item_name)}</td>
                      <td className="table-td"><span className="badge bg-slate-100 text-slate-600 text-xs">{String(m.adjustment_type)}</span></td>
                      <td className={`table-td text-right font-semibold ${Number(m.quantity_change) < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                        {Number(m.quantity_change) > 0 ? '+' : ''}{Number(m.quantity_change).toFixed(2)}
                      </td>
                      <td className="table-td text-right text-slate-500">{m.quantity_before != null ? Number(m.quantity_before).toFixed(2) : '—'}</td>
                      <td className="table-td text-right text-slate-500">{m.quantity_after != null ? Number(m.quantity_after).toFixed(2) : '—'}</td>
                      <td className="table-td text-xs text-slate-500 max-w-[200px] truncate">{String(m.reason || '—')}</td>
                      <td className="table-td text-xs text-slate-500">{String(m.adjusted_by_name || '—')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
      {/* ── Wastage ──────────────────────────────────────────────────────────── */}
      {tab === 'wastage' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100">Wastage Record</h3>
            <button onClick={() => handleExport('/reports/wastage', 'wastage')} className="btn-secondary btn-sm">
              <Download size={14} /> Export CSV
            </button>
          </div>
          {wastageLoading ? <LoadingSpinner /> : !wastageReport ? null : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {Object.entries(wastageReport.summary || {}).map(([reason, cost]) => (
                  <div key={reason} className="card p-4">
                    <p className="text-xs text-slate-500 dark:text-slate-400 uppercase mb-1 capitalize">{reason.replace(/_/g, ' ')}</p>
                    <p className="text-lg font-bold text-red-600">${Number(cost).toFixed(2)}</p>
                  </div>
                ))}
                <div className="card p-4 border-red-200 bg-red-50 dark:bg-red-900/20">
                  <p className="text-xs text-red-600 dark:text-red-400 uppercase mb-1">Total Cost</p>
                  <p className="text-lg font-bold text-red-700 dark:text-red-400">${Number(wastageReport.total_cost || 0).toFixed(2)}</p>
                </div>
              </div>
              <div className="card overflow-hidden">
                <table className="w-full">
                  <thead><tr>
                    <th className="table-th">Date</th>
                    <th className="table-th">Item</th>
                    <th className="table-th">Reason</th>
                    <th className="table-th text-right">Qty</th>
                    <th className="table-th text-right">Est. Cost</th>
                    <th className="table-th">Recorded by</th>
                  </tr></thead>
                  <tbody className="divide-y divide-slate-50 dark:divide-slate-700">
                    {wastageReport.records?.map((r: { created_at: string; item_name: string; unit: string; wastage_reason: string; quantity_change: number; estimated_cost: number; adjusted_by_name: string }) => (
                      <tr key={r.created_at + r.item_name}>
                        <td className="table-td text-xs">{format(new Date(r.created_at), 'dd MMM HH:mm')}</td>
                        <td className="table-td font-medium">{r.item_name}</td>
                        <td className="table-td"><span className="badge bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 capitalize">{String(r.wastage_reason || 'other').replace(/_/g, ' ')}</span></td>
                        <td className="table-td text-right">{Math.abs(r.quantity_change)} {r.unit}</td>
                        <td className="table-td text-right text-red-600">${Number(r.estimated_cost || 0).toFixed(2)}</td>
                        <td className="table-td text-xs text-slate-500">{r.adjusted_by_name}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Patient Ledger ───────────────────────────────────────────────────── */}
      {tab === 'patient-ledger' && (
        <div className="space-y-4">
          <div className="flex gap-3">
            <input
              type="text"
              placeholder="Search by patient name or reference (min. 2 chars)…"
              value={patientRef}
              onChange={e => setPatientRef(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && patientRef.length >= 2 && setPatientSearch(patientRef)}
              className="input flex-1"
            />
            <button
              onClick={() => setPatientSearch(patientRef)}
              disabled={patientRef.length < 2}
              className="btn-primary"
            >
              Search
            </button>
          </div>

          {patientSearch && patientLoading && <LoadingSpinner />}
          {patientLedger && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div className="card p-4">
                  <p className="text-xs text-slate-500 dark:text-slate-400 uppercase mb-1">Total Requests</p>
                  <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">{patientLedger.totals?.requests || 0}</p>
                </div>
                <div className="card p-4">
                  <p className="text-xs text-slate-500 dark:text-slate-400 uppercase mb-1">Total Charges</p>
                  <p className="text-2xl font-bold text-emerald-600">${Number(patientLedger.totals?.charges || 0).toFixed(2)}</p>
                </div>
              </div>
              <div className="card overflow-hidden">
                <table className="w-full">
                  <thead><tr>
                    <th className="table-th">Ref #</th>
                    <th className="table-th">Patient</th>
                    <th className="table-th">Doctor</th>
                    <th className="table-th">Date</th>
                    <th className="table-th">Type</th>
                    <th className="table-th text-right">Charge</th>
                  </tr></thead>
                  <tbody className="divide-y divide-slate-50 dark:divide-slate-700">
                    {patientLedger.requests?.map((r: { id: string; request_number: string; patient_name?: string; patient_ref?: string; doctor_name: string; created_at: string; is_quick_charge: boolean; total_charge: string }) => (
                      <tr key={r.id}>
                        <td className="table-td font-mono text-xs">{r.request_number}</td>
                        <td className="table-td">
                          <p className="font-medium text-slate-900 dark:text-slate-100">{r.patient_name || '—'}</p>
                          <p className="text-xs text-slate-400">{r.patient_ref}</p>
                        </td>
                        <td className="table-td text-sm">{r.doctor_name}</td>
                        <td className="table-td text-xs">{format(new Date(r.created_at), 'dd MMM yyyy')}</td>
                        <td className="table-td">
                          <span className={`badge ${r.is_quick_charge ? 'bg-indigo-100 text-indigo-700' : 'bg-blue-100 text-blue-700'}`}>
                            {r.is_quick_charge ? 'Quick Charge' : 'Request'}
                          </span>
                        </td>
                        <td className="table-td text-right font-semibold">${Number(r.total_charge || 0).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default Reports;
