import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format, parseISO, subDays } from 'date-fns';
import { Shield, Download, Filter, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { api, getErrorMessage } from '../api/client';
import { AuditLog as AuditLogType } from '../types';
import LoadingSpinner from '../components/LoadingSpinner';
import toast from 'react-hot-toast';

const actionColors: Record<string, string> = {
  LOGIN: 'bg-blue-100 text-blue-700',
  LOGOUT: 'bg-slate-100 text-slate-600',
  LOGIN_FAILED: 'bg-red-100 text-red-700',
  INVENTORY_CREATED: 'bg-emerald-100 text-emerald-700',
  INVENTORY_UPDATED: 'bg-blue-100 text-blue-700',
  INVENTORY_ARCHIVED: 'bg-slate-100 text-slate-600',
  STOCK_ADJUSTED: 'bg-amber-100 text-amber-700',
  REQUEST_CREATED: 'bg-purple-100 text-purple-700',
  REQUEST_ACCEPTED: 'bg-blue-100 text-blue-700',
  REQUEST_FULFILLED: 'bg-emerald-100 text-emerald-700',
  REQUEST_CANCELLED: 'bg-red-100 text-red-700',
  STOCKTAKE_CREATED: 'bg-cyan-100 text-cyan-700',
  STOCKTAKE_COMPLETED: 'bg-emerald-100 text-emerald-700',
  INVOICE_CREATED: 'bg-purple-100 text-purple-700',
  INVOICE_POSTED: 'bg-emerald-100 text-emerald-700',
  USER_CREATED: 'bg-blue-100 text-blue-700',
  USER_UPDATED: 'bg-amber-100 text-amber-700',
  USER_DEACTIVATED: 'bg-red-100 text-red-700',
  PASSWORD_CHANGED: 'bg-amber-100 text-amber-700',
};

const AuditLog: React.FC = () => {
  const [page, setPage] = useState(1);
  const [action, setAction] = useState('');
  const [entityType, setEntityType] = useState('');
  const [from, setFrom] = useState(format(subDays(new Date(), 7), 'yyyy-MM-dd'));
  const [to, setTo] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [showFilters, setShowFilters] = useState(false);
  const LIMIT = 100;

  const { data, isLoading } = useQuery({
    queryKey: ['audit', page, action, entityType, from, to],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), limit: String(LIMIT) });
      if (action) params.set('action', action);
      if (entityType) params.set('entity_type', entityType);
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      return (await api.get(`/audit?${params}`)).data;
    },
  });

  const logs: AuditLogType[] = data?.logs || [];

  const handleExport = async () => {
    try {
      const params = new URLSearchParams({ format: 'csv', limit: '10000' });
      if (action) params.set('action', action);
      if (entityType) params.set('entity_type', entityType);
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      const res = await api.get(`/audit?${params}`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url; a.download = `audit_log_${from}_to_${to}.csv`; a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  const entityTypes = ['inventory_item', 'stock_request', 'stocktake', 'invoice', 'user'];

  return (
    <div className="space-y-5">
      <div className="page-header">
        <div className="flex items-center gap-3">
          <Shield size={24} className="text-slate-600" />
          <div>
            <h1 className="page-title">Audit Log</h1>
            <p className="text-sm text-slate-500 mt-0.5">{data?.total || 0} entries</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowFilters(!showFilters)} className={`btn-secondary btn-sm ${showFilters ? 'bg-blue-50 border-blue-300 text-blue-700' : ''}`}>
            <Filter size={14} /> Filters
          </button>
          <button onClick={handleExport} className="btn-secondary btn-sm">
            <Download size={14} /> Export CSV
          </button>
        </div>
      </div>

      {/* Filters */}
      {showFilters && (
        <div className="card p-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="label text-xs">From Date</label>
              <input type="date" value={from} onChange={e => { setFrom(e.target.value); setPage(1); }} className="input text-sm" />
            </div>
            <div>
              <label className="label text-xs">To Date</label>
              <input type="date" value={to} onChange={e => { setTo(e.target.value); setPage(1); }} className="input text-sm" />
            </div>
            <div>
              <label className="label text-xs">Action Filter</label>
              <input value={action} onChange={e => { setAction(e.target.value); setPage(1); }} placeholder="e.g. STOCK_ADJUSTED" className="input text-sm" />
            </div>
            <div>
              <label className="label text-xs">Entity Type</label>
              <select value={entityType} onChange={e => { setEntityType(e.target.value); setPage(1); }} className="input text-sm">
                <option value="">All types</option>
                {entityTypes.map(t => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Log table */}
      <div className="card overflow-hidden">
        {isLoading ? (
          <LoadingSpinner />
        ) : logs.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16">
            <Shield size={40} className="text-slate-300" />
            <p className="text-slate-500">No audit entries found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="table-th whitespace-nowrap">Date / Time</th>
                  <th className="table-th">User</th>
                  <th className="table-th">Action</th>
                  <th className="table-th">Entity</th>
                  <th className="table-th">Details</th>
                  <th className="table-th">IP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {logs.map(log => (
                  <tr key={log.id} className="hover:bg-slate-50">
                    <td className="table-td whitespace-nowrap text-xs text-slate-500">
                      {format(parseISO(log.created_at), 'dd MMM yyyy')}
                      <br />
                      <span className="font-mono">{format(parseISO(log.created_at), 'HH:mm:ss')}</span>
                    </td>
                    <td className="table-td">
                      <p className="font-medium text-slate-900">{log.user_name || 'System'}</p>
                      {log.user_role && <p className="text-xs text-slate-400 capitalize">{log.user_role}</p>}
                    </td>
                    <td className="table-td">
                      <span className={`badge text-xs ${actionColors[log.action] || 'bg-slate-100 text-slate-600'}`}>
                        {log.action.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="table-td">
                      {log.entity_type && (
                        <div>
                          <p className="text-xs text-slate-400">{log.entity_type.replace('_', ' ')}</p>
                          {log.entity_name && <p className="text-sm font-medium text-slate-700 truncate max-w-[150px]">{log.entity_name}</p>}
                        </div>
                      )}
                    </td>
                    <td className="table-td max-w-[200px]">
                      {log.new_values && (
                        <details className="cursor-pointer">
                          <summary className="text-xs text-blue-600 hover:underline select-none">View details</summary>
                          <pre className="mt-1 text-[10px] bg-slate-50 p-2 rounded overflow-auto max-h-32 text-slate-600">
                            {JSON.stringify(log.new_values, null, 2)}
                          </pre>
                        </details>
                      )}
                    </td>
                    <td className="table-td text-xs text-slate-400 font-mono">{log.ip_address || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {data && data.pages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200">
            <p className="text-sm text-slate-500">Page {page} of {data.pages} ({data.total} entries)</p>
            <div className="flex gap-2">
              <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="btn-secondary btn-sm disabled:opacity-40">
                <ChevronLeft size={14} />
              </button>
              <button disabled={page >= data.pages} onClick={() => setPage(p => p + 1)} className="btn-secondary btn-sm disabled:opacity-40">
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AuditLog;
