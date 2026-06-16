import { useState, useEffect, useMemo } from 'react';
import {
  ChevronLeft, ChevronRight, Search, X, Filter, RefreshCw, Loader2,
  FileText, Calendar, Clock, ChevronDown, ChevronUp,
  ExternalLink, AlertCircle, Eye, Download, ThumbsUp, ThumbsDown,
} from 'lucide-react';
import { User } from '../types';
import { getLeaveHistory, cancelLeave, LeaveRecord } from '../utils/sheets';

interface Props {
  user: User;
  onBack: () => void;
}

type SortField = 'submittedAt' | 'startDate' | 'status' | 'leaveType';
type SortDir   = 'asc' | 'desc';

const LEAVE_TYPES = ['All', 'Vacation Leave', 'Sick Leave', 'Birthday Leave', 'Emergency Leave'];
const STATUSES    = ['All', 'Pending', 'Approved', 'Rejected', 'Cancelled'];
const PAY_OPTS    = ['All', 'Paid', 'Unpaid'];
const PAGE_SIZE   = 10;

const STATUS_STYLE: Record<string, string> = {
  Pending:   'bg-yellow-400/15 text-yellow-300 border-yellow-400/30',
  Approved:  'bg-green-400/15 text-green-300 border-green-400/30',
  Rejected:  'bg-red-400/15 text-red-300 border-red-400/30',
  Cancelled: 'bg-white/10 text-white/50 border-white/20',
};

function fmtDate(val: string): string {
  if (!val) return '—';
  const d = new Date(val);
  if (isNaN(d.getTime())) return val;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtDateTime(val: string): string {
  if (!val) return '—';
  const d = new Date(val);
  if (isNaN(d.getTime())) return val;
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
}

function shortId(id: string): string {
  return id ? id.substring(0, 8).toUpperCase() : '—';
}

export default function LeaveReport({ user, onBack }: Props) {
  const [records, setRecords]     = useState<LeaveRecord[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState('');
  const [selected, setSelected]   = useState<LeaveRecord | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [cancelError, setCancelError] = useState('');

  // Filters
  const [search, setSearch]       = useState('');
  const [filterType, setFilterType]   = useState('All');
  const [filterStatus, setFilterStatus] = useState('All');
  const [filterPay, setFilterPay] = useState('All');
  const [fromDate, setFromDate]   = useState('');
  const [toDate, setToDate]       = useState('');

  // Sort & page
  const [sortField, setSortField] = useState<SortField>('submittedAt');
  const [sortDir, setSortDir]     = useState<SortDir>('desc');
  const [page, setPage]           = useState(1);

  const load = async () => {
    setLoading(true);
    setError('');
    const email = user.email || '';
    const res = await getLeaveHistory(email);
    if (res.success) {
      setRecords(res.records);
    } else {
      setError(res.message);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const clearFilters = () => {
    setSearch(''); setFilterType('All'); setFilterStatus('All');
    setFilterPay('All'); setFromDate(''); setToDate(''); setPage(1);
  };

  const toggleSort = (field: SortField) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('desc'); }
    setPage(1);
  };

  const filtered = useMemo(() => {
    let r = [...records];
    const q = search.toLowerCase();
    if (q) r = r.filter(x =>
      x.employeeName.toLowerCase().includes(q) ||
      x.email.toLowerCase().includes(q) ||
      x.id.toLowerCase().includes(q) ||
      x.leaveType.toLowerCase().includes(q)
    );
    if (filterType !== 'All') r = r.filter(x => x.leaveType === filterType);
    if (filterStatus !== 'All') r = r.filter(x => x.status === filterStatus);
    if (filterPay !== 'All') r = r.filter(x => x.paymentStatus === filterPay);
    if (fromDate) r = r.filter(x => x.startDate >= fromDate);
    if (toDate)   r = r.filter(x => x.endDate <= toDate);

    r.sort((a, b) => {
      let va: string | number = a[sortField] ?? '';
      let vb: string | number = b[sortField] ?? '';
      if (sortField === 'submittedAt' || sortField === 'startDate') {
        va = new Date(va as string).getTime() || 0;
        vb = new Date(vb as string).getTime() || 0;
      }
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return r;
  }, [records, search, filterType, filterStatus, filterPay, fromDate, toDate, sortField, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const hasActiveFilters = search || filterType !== 'All' || filterStatus !== 'All' || filterPay !== 'All' || fromDate || toDate;

  const exportCSV = () => {
    const headers = ['Ref No','Employee','Email','Leave Type','Start','End','Days','Payment','Status','Filed'];
    const rows = filtered.map(r => [
      shortId(r.id), r.employeeName, r.email, r.leaveType,
      r.startDate, r.endDate, r.totalDays, r.paymentStatus, r.status, r.submittedAt
    ]);
    const csv = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `leave-report-${Date.now()}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const handleCancel = async () => {
    if (!selected) return;
    setCancelling(true);
    setCancelError('');
    const res = await cancelLeave(selected.id, user.email || '');
    setCancelling(false);
    if (res.success) {
      const updated = { ...selected, status: 'Cancelled' };
      setSelected(updated);
      setRecords(prev => prev.map(r => r.id === selected.id ? updated : r));
      setShowConfirm(false);
    } else {
      setCancelError(res.message);
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ChevronDown className="w-3 h-3 opacity-30" />;
    return sortDir === 'asc'
      ? <ChevronUp className="w-3 h-3 text-blue-400" />
      : <ChevronDown className="w-3 h-3 text-blue-400" />;
  };

  return (
    <div className="min-h-dvh flex flex-col pb-6 bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900">

      {/* Cancel confirmation dialog */}
      {showConfirm && selected && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[60] flex items-center justify-center px-4">
          <div className="bg-slate-900 border border-white/10 rounded-2xl p-6 w-full max-w-sm slide-up">
            <div className="text-center mb-5">
              <div className="w-12 h-12 rounded-full bg-red-500/15 flex items-center justify-center mx-auto mb-3">
                <AlertCircle className="w-6 h-6 text-red-400" />
              </div>
              <h3 className="text-white font-bold text-base mb-1">Cancel Application?</h3>
              <p className="text-white/50 text-sm">
                This will cancel your <span className="text-white/80 font-medium">{selected.leaveType}</span> request
                from <span className="text-white/80 font-medium">{fmtDate(selected.startDate)}</span>. This cannot be undone.
              </p>
              {cancelError && (
                <p className="mt-3 text-red-400 text-xs bg-red-500/10 border border-red-400/20 rounded-xl px-3 py-2">{cancelError}</p>
              )}
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => { setShowConfirm(false); setCancelError(''); }}
                disabled={cancelling}
                className="flex-1 py-3 rounded-xl bg-white/10 text-white/70 text-sm font-semibold active:scale-95 transition-transform disabled:opacity-40"
              >
                Keep
              </button>
              <button
                onClick={handleCancel}
                disabled={cancelling}
                className="flex-1 py-3 rounded-xl bg-red-500 text-white text-sm font-semibold active:scale-95 transition-transform disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {cancelling ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {cancelling ? 'Cancelling…' : 'Yes, Cancel'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detail modal */}
      {selected && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center px-0 sm:px-4">
          <div className="bg-slate-900 border border-white/10 rounded-t-3xl sm:rounded-2xl w-full sm:max-w-lg max-h-[90dvh] overflow-auto slide-up">
            <div className="sticky top-0 bg-slate-900/95 backdrop-blur-xl border-b border-white/10 px-5 py-4 flex items-center justify-between">
              <div>
                <p className="text-white/50 text-[10px] font-semibold uppercase tracking-widest">Leave Application</p>
                <p className="text-white font-bold text-sm font-mono">{shortId(selected.id)}</p>
              </div>
              <button onClick={() => setSelected(null)} className="w-8 h-8 flex items-center justify-center rounded-xl bg-white/10 active:scale-90 transition-transform">
                <X className="w-4 h-4 text-white" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* Status badge */}
              <div className="flex justify-center">
                <span className={`inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-semibold border ${STATUS_STYLE[selected.status] || STATUS_STYLE.Pending}`}>
                  {selected.status}
                </span>
              </div>

              {/* Info grid */}
              <div className="bg-white/5 rounded-2xl divide-y divide-white/5">
                {[
                  { label: 'Employee', value: selected.employeeName },
                  { label: 'Email', value: selected.email },
                  { label: 'Leave Type', value: selected.leaveType },
                  { label: 'Start Date', value: fmtDate(selected.startDate) },
                  { label: 'End Date', value: fmtDate(selected.endDate) },
                  { label: 'Mode', value: selected.mode + (selected.halfDayPeriod ? ` (${selected.halfDayPeriod})` : '') },
                  { label: 'Total Days', value: `${selected.totalDays} day${selected.totalDays !== 1 ? 's' : ''}` },
                  { label: 'Payment', value: selected.paymentStatus },
                  { label: 'Date Filed', value: fmtDateTime(selected.submittedAt) },
                ].map(({ label, value }) => (
                  <div key={label} className="flex justify-between items-start gap-3 px-4 py-3">
                    <span className="text-white/40 text-xs shrink-0 mt-0.5">{label}</span>
                    <span className="text-white/90 text-xs text-right">{value || '—'}</span>
                  </div>
                ))}
              </div>

              {/* Reason */}
              {selected.reason && (
                <div className="bg-white/5 rounded-2xl p-4">
                  <p className="text-white/40 text-[10px] font-semibold uppercase tracking-wider mb-1.5">Reason</p>
                  <p className="text-white/80 text-sm leading-relaxed">{selected.reason}</p>
                </div>
              )}

              {/* Rejection reason */}
              {selected.rejectionReason && (
                <div className="bg-red-500/10 border border-red-400/20 rounded-2xl p-4">
                  <p className="text-red-300/70 text-[10px] font-semibold uppercase tracking-wider mb-1.5">Rejection Reason</p>
                  <p className="text-red-300 text-sm leading-relaxed">{selected.rejectionReason}</p>
                </div>
              )}

              {/* Approval history timeline */}
              {selected.approvalHistory && selected.approvalHistory.length > 0 && (
                <div>
                  <p className="text-white/40 text-[10px] font-semibold uppercase tracking-wider mb-2">Approval History</p>
                  <div className="space-y-2">
                    {selected.approvalHistory.map((h) => (
                      <div key={h.id} className="flex items-start gap-3 bg-white/5 rounded-xl p-3">
                        <div className="mt-0.5 shrink-0">
                          {h.action === 'Approve'
                            ? <ThumbsUp className="w-3.5 h-3.5 text-emerald-300" />
                            : h.action === 'Reject'
                            ? <ThumbsDown className="w-3.5 h-3.5 text-red-300" />
                            : <Clock className="w-3.5 h-3.5 text-blue-300" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-white/80 text-xs font-medium">{h.approverName}</p>
                          <p className={`text-[11px] ${
                            h.action === 'Approve' ? 'text-emerald-300'
                            : h.action === 'Reject' ? 'text-red-300'
                            : 'text-blue-300'
                          }`}>{h.action}</p>
                          {h.reason && <p className="text-white/50 text-[11px] mt-0.5">{h.reason}</p>}
                        </div>
                        <p className="text-white/30 text-[10px] shrink-0">{fmtDateTime(String(h.timestamp))}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Document link */}
              {selected.docUrl && (
                <a href={selected.docUrl} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-3 bg-blue-500/10 border border-blue-400/20 rounded-2xl px-4 py-3 active:scale-[0.98] transition-transform">
                  <FileText className="w-4 h-4 text-blue-400 shrink-0" />
                  <span className="text-blue-300 text-sm flex-1">View Supporting Document</span>
                  <ExternalLink className="w-3.5 h-3.5 text-blue-400/60" />
                </a>
              )}
            </div>

            <div className="px-5 pb-6 space-y-2">
              {selected.status === 'Pending' && (
                <button
                  onClick={() => { setCancelError(''); setShowConfirm(true); }}
                  className="w-full flex items-center justify-center gap-2 bg-red-500/10 border border-red-400/20 text-red-400 font-semibold py-3 rounded-xl active:scale-95 transition-transform text-sm"
                >
                  <X className="w-4 h-4" />
                  Cancel Application
                </button>
              )}
              <button onClick={() => { setSelected(null); setCancelError(''); setShowConfirm(false); }}
                className="w-full bg-gradient-to-r from-blue-500 to-blue-700 text-white font-semibold py-3 rounded-xl active:scale-95 transition-transform">
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="sticky top-0 z-30 bg-slate-900/90 backdrop-blur-xl border-b border-white/10">
        <div className="flex items-center gap-3 px-4 py-3 max-w-lg mx-auto">
          <button onClick={onBack} className="w-9 h-9 flex items-center justify-center rounded-xl bg-white/10 active:scale-90 transition-transform">
            <ChevronLeft className="w-5 h-5 text-white" />
          </button>
          <div className="flex-1">
            <h1 className="text-white font-bold text-base">Leave Reports</h1>
            <p className="text-white/40 text-[11px]">{filtered.length} record{filtered.length !== 1 ? 's' : ''}</p>
          </div>
          <button onClick={exportCSV} disabled={filtered.length === 0}
            className="w-9 h-9 flex items-center justify-center rounded-xl bg-white/10 active:scale-90 transition-transform disabled:opacity-40">
            <Download className="w-4 h-4 text-white" />
          </button>
          <button onClick={load} disabled={loading}
            className="w-9 h-9 flex items-center justify-center rounded-xl bg-white/10 active:scale-90 transition-transform disabled:opacity-40">
            <RefreshCw className={`w-4 h-4 text-white ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Search + filter toggle */}
        <div className="px-4 pb-3 max-w-lg mx-auto flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30" />
            <input
              type="text"
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search name, email, ref no…"
              className="w-full bg-white/5 border border-white/10 rounded-xl pl-8 pr-3 py-2 text-white text-xs placeholder-white/25 focus:outline-none focus:border-blue-400/50"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2">
                <X className="w-3.5 h-3.5 text-white/40" />
              </button>
            )}
          </div>
          <button
            onClick={() => setShowFilters(v => !v)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-medium transition-colors ${
              hasActiveFilters ? 'bg-blue-500/20 border-blue-400/40 text-blue-300' : 'bg-white/5 border-white/10 text-white/50'
            }`}>
            <Filter className="w-3.5 h-3.5" />
            Filters
            {hasActiveFilters && <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />}
          </button>
        </div>

        {/* Expanded filters */}
        {showFilters && (
          <div className="px-4 pb-3 max-w-lg mx-auto space-y-2">
            <div className="grid grid-cols-3 gap-2">
              <div>
                <p className="text-white/40 text-[10px] uppercase tracking-wider mb-1">Leave Type</p>
                <select value={filterType} onChange={e => { setFilterType(e.target.value); setPage(1); }}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-2 py-1.5 text-white text-xs focus:outline-none">
                  {LEAVE_TYPES.map(t => <option key={t} value={t} className="bg-slate-800">{t === 'All' ? 'All Types' : t.replace(' Leave','')}</option>)}
                </select>
              </div>
              <div>
                <p className="text-white/40 text-[10px] uppercase tracking-wider mb-1">Status</p>
                <select value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setPage(1); }}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-2 py-1.5 text-white text-xs focus:outline-none">
                  {STATUSES.map(s => <option key={s} value={s} className="bg-slate-800">{s}</option>)}
                </select>
              </div>
              <div>
                <p className="text-white/40 text-[10px] uppercase tracking-wider mb-1">Payment</p>
                <select value={filterPay} onChange={e => { setFilterPay(e.target.value); setPage(1); }}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-2 py-1.5 text-white text-xs focus:outline-none">
                  {PAY_OPTS.map(p => <option key={p} value={p} className="bg-slate-800">{p}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <p className="text-white/40 text-[10px] uppercase tracking-wider mb-1">From Date</p>
                <input type="date" value={fromDate} onChange={e => { setFromDate(e.target.value); setPage(1); }}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-2 py-1.5 text-white text-xs focus:outline-none" />
              </div>
              <div>
                <p className="text-white/40 text-[10px] uppercase tracking-wider mb-1">To Date</p>
                <input type="date" value={toDate} onChange={e => { setToDate(e.target.value); setPage(1); }}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-2 py-1.5 text-white text-xs focus:outline-none" />
              </div>
            </div>
            {hasActiveFilters && (
              <button onClick={clearFilters}
                className="w-full text-center text-white/40 text-xs py-1 hover:text-white/70 transition-colors">
                Clear all filters
              </button>
            )}
          </div>
        )}

        {/* Sort bar */}
        <div className="px-4 pb-2 max-w-lg mx-auto flex gap-2 overflow-x-auto scrollbar-hide">
          {([['submittedAt','Filed'], ['startDate','Start'], ['status','Status'], ['leaveType','Type']] as [SortField, string][]).map(([f, label]) => (
            <button key={f} onClick={() => toggleSort(f)}
              className={`flex items-center gap-1 px-3 py-1 rounded-lg text-[11px] font-medium whitespace-nowrap transition-colors ${
                sortField === f ? 'bg-blue-500/20 text-blue-300 border border-blue-400/30' : 'bg-white/5 text-white/40 border border-white/10'
              }`}>
              {label}
              <SortIcon field={f} />
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 px-4 pt-3 max-w-lg mx-auto w-full">

        {loading && (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
            <p className="text-white/40 text-sm">Loading leave records…</p>
          </div>
        )}

        {!loading && error && (
          <div className="flex items-start gap-3 bg-red-500/10 border border-red-400/20 rounded-2xl p-4 mt-2">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <p className="text-red-300 text-sm">{error}</p>
          </div>
        )}

        {!loading && !error && filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-center px-8">
            <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center">
              <FileText className="w-7 h-7 text-white/20" />
            </div>
            <p className="text-white/50 text-sm font-medium">No leave applications found</p>
            {hasActiveFilters && (
              <p className="text-white/30 text-xs">
                No records match the selected filters.{' '}
                <button onClick={clearFilters} className="text-blue-400 underline">Clear filters</button>
              </p>
            )}
          </div>
        )}

        {!loading && !error && paged.length > 0 && (
          <div className="space-y-2.5">
            {paged.map(rec => (
              <button key={rec.id} onClick={() => setSelected(rec)}
                className="w-full text-left bg-white/5 border border-white/10 rounded-2xl p-4 active:scale-[0.99] transition-transform hover:bg-white/8">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-white/30 text-[10px] font-mono">#{shortId(rec.id)}</span>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${STATUS_STYLE[rec.status] || STATUS_STYLE.Pending}`}>
                        {rec.status}
                      </span>
                    </div>
                    <p className="text-white font-semibold text-sm truncate">{rec.leaveType}</p>
                    <p className="text-white/40 text-xs">{rec.employeeName}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-blue-300 font-bold text-base">{rec.totalDays.toFixed(1)}</p>
                    <p className="text-white/30 text-[10px]">days</p>
                  </div>
                </div>
                <div className="flex items-center justify-between text-[11px]">
                  <div className="flex items-center gap-1 text-white/40">
                    <Calendar className="w-3 h-3" />
                    <span>{fmtDate(rec.startDate)}</span>
                    {rec.startDate !== rec.endDate && <><span>→</span><span>{fmtDate(rec.endDate)}</span></>}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] ${rec.paymentStatus === 'Paid' ? 'text-emerald-400/80' : 'text-orange-400/80'}`}>
                      {rec.paymentStatus}
                    </span>
                    <Eye className="w-3 h-3 text-white/20" />
                  </div>
                </div>
                <div className="mt-1.5 flex items-center gap-1 text-white/25 text-[10px]">
                  <Clock className="w-2.5 h-2.5" />
                  Filed {fmtDateTime(rec.submittedAt)}
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Pagination */}
        {!loading && totalPages > 1 && (
          <div className="flex items-center justify-between mt-5 px-1">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white/60 text-xs disabled:opacity-30 active:scale-95 transition-transform">
              <ChevronLeft className="w-3.5 h-3.5" /> Prev
            </button>
            <span className="text-white/40 text-xs">Page {page} of {totalPages}</span>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white/60 text-xs disabled:opacity-30 active:scale-95 transition-transform">
              Next <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        <div className="h-6" />
      </div>
    </div>
  );
}
