import { useState, useEffect, useCallback, ReactElement } from 'react';
import {
  ChevronLeft, Clock, Calendar, FileText, CheckCircle2,
  AlertCircle, Loader2, XCircle, ExternalLink, RotateCcw, Search, X,
} from 'lucide-react';
import { User, TimeCorrectionFiling } from '../types';
import { getTimeCorrectionHistory, cancelTimeCorrection } from '../utils/sheets';

interface Props {
  user: User;
  onBack: () => void;
}

const STATUS_STYLE: Record<string, string> = {
  Pending:   'bg-amber-400/15 text-amber-300 border border-amber-400/30',
  Approved:  'bg-emerald-400/15 text-emerald-300 border border-emerald-400/30',
  Rejected:  'bg-red-400/15 text-red-300 border border-red-400/30',
  Cancelled: 'bg-slate-400/15 text-slate-300 border border-slate-400/30',
};

const STATUS_ICON: Record<string, ReactElement> = {
  Pending:   <Clock className="w-3.5 h-3.5" />,
  Approved:  <CheckCircle2 className="w-3.5 h-3.5" />,
  Rejected:  <XCircle className="w-3.5 h-3.5" />,
  Cancelled: <XCircle className="w-3.5 h-3.5" />,
};

function formatDate(val: string): string {
  if (!val) return '';
  const d = new Date(val.replace(/-/g, '/'));
  return isNaN(d.getTime()) ? val : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDateTime(val: string): string {
  if (!val) return '';
  try {
    return new Date(val).toLocaleString('en-US', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true });
  } catch { return val; }
}

export default function TimeCorrectionReport({ user, onBack }: Props) {
  const [records, setRecords]         = useState<TimeCorrectionFiling[]>([]);
  const [loading, setLoading]         = useState(true);
  const [selected, setSelected]       = useState<TimeCorrectionFiling | null>(null);
  const [cancelling, setCancelling]   = useState(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [filter, setFilter]           = useState<'All' | 'Pending' | 'Approved' | 'Rejected' | 'Cancelled'>('All');
  const [search, setSearch]           = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const res = await getTimeCorrectionHistory(user.email);
    setRecords(res.records || []);
    setLoading(false);
  }, [user.email]);

  useEffect(() => { load(); }, [load]);

  const notify = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 4000);
  };

  const handleCancel = async (rec: TimeCorrectionFiling) => {
    setCancelling(true);
    const res = await cancelTimeCorrection(rec.id, user.email);
    setCancelling(false);
    if (res.success) {
      notify('success', 'Request cancelled');
      setSelected(null);
      load();
    } else {
      notify('error', res.message || 'Cancellation failed');
    }
  };

  const q = search.trim().toLowerCase();
  const filtered = records
    .filter((r: TimeCorrectionFiling) => filter === 'All' || r.status === filter)
    .filter((r: TimeCorrectionFiling) => !q ||
      r.attendanceDate.toLowerCase().includes(q) ||
      r.reason.toLowerCase().includes(q) ||
      (r.correctedTimeIn || '').toLowerCase().includes(q) ||
      (r.correctedTimeOut || '').toLowerCase().includes(q)
    );

  return (
    <div className="min-h-dvh bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex flex-col">
      {/* Notification */}
      {notification && (
        <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-xl shadow-xl flex items-center gap-2 text-sm font-medium
          ${notification.type === 'success' ? 'bg-emerald-500/90 text-white' : 'bg-red-500/90 text-white'}`}>
          {notification.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {notification.message}
        </div>
      )}

      {/* Header */}
      <div className="bg-white/5 backdrop-blur-xl border-b border-white/10 px-4 py-4 flex items-center gap-3">
        <button onClick={selected ? () => setSelected(null) : onBack}
          className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors">
          <ChevronLeft className="w-5 h-5 text-white" />
        </button>
        <div className="flex-1">
          <h1 className="text-white font-bold text-lg">My Time Corrections</h1>
          <p className="text-blue-200/60 text-xs">{records.length} total filing{records.length !== 1 ? 's' : ''}</p>
        </div>
        <button onClick={load} className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors">
          <RotateCcw className="w-4 h-4 text-white" />
        </button>
      </div>

      {/* Detail view */}
      {selected ? (
        <div className="flex-1 overflow-y-auto px-4 py-5 space-y-4 pb-8">
          <div className={`inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full ${STATUS_STYLE[selected.status]}`}>
            {STATUS_ICON[selected.status]} {selected.status}
          </div>

          <div className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-3">
            <p className="text-blue-200/60 text-xs font-semibold uppercase tracking-wider">Attendance Record</p>
            <div className="flex items-center gap-2 text-white/80 text-sm">
              <Calendar className="w-4 h-4 text-blue-300" />
              {formatDate(selected.attendanceDate)}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white/5 rounded-lg p-3">
                <p className="text-white/40 text-xs mb-1">Original Time In</p>
                <p className="text-white text-sm font-medium">{selected.originalTimeIn || '—'}</p>
              </div>
              <div className="bg-white/5 rounded-lg p-3">
                <p className="text-white/40 text-xs mb-1">Original Time Out</p>
                <p className="text-white text-sm font-medium">{selected.originalTimeOut || '—'}</p>
              </div>
              <div className="bg-emerald-500/10 rounded-lg p-3">
                <p className="text-emerald-300/60 text-xs mb-1">Corrected Time In</p>
                <p className="text-emerald-300 text-sm font-medium">{selected.correctedTimeIn || '—'}</p>
              </div>
              <div className="bg-emerald-500/10 rounded-lg p-3">
                <p className="text-emerald-300/60 text-xs mb-1">Corrected Time Out</p>
                <p className="text-emerald-300 text-sm font-medium">{selected.correctedTimeOut || '—'}</p>
              </div>
            </div>
          </div>

          <div className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-2">
            <p className="text-blue-200/60 text-xs font-semibold uppercase tracking-wider">Reason</p>
            <p className="text-white/80 text-sm leading-relaxed">{selected.reason}</p>
          </div>

          {selected.rejectionReason && (
            <div className="bg-red-500/10 border border-red-400/20 rounded-xl p-4">
              <p className="text-red-300/60 text-xs font-semibold uppercase tracking-wider mb-1">Rejection Reason</p>
              <p className="text-red-200/80 text-sm">{selected.rejectionReason}</p>
            </div>
          )}

          {selected.documentUrl && (
            <a href={selected.documentUrl} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-2 bg-blue-500/10 border border-blue-400/20 rounded-xl p-4 text-blue-300 text-sm hover:bg-blue-500/20 transition-colors">
              <FileText className="w-4 h-4" />
              View Supporting Document
              <ExternalLink className="w-3.5 h-3.5 ml-auto" />
            </a>
          )}

          <div className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-1">
            <p className="text-blue-200/60 text-xs font-semibold uppercase tracking-wider">Submission Details</p>
            <p className="text-white/50 text-xs">Submitted: {formatDateTime(selected.submittedAt)}</p>
            {selected.approverEmail && <p className="text-white/50 text-xs">Approver: {selected.approverEmail}</p>}
          </div>

          {selected.status === 'Pending' && (
            <button
              onClick={() => handleCancel(selected)}
              disabled={cancelling}
              className="w-full py-3 rounded-xl font-semibold text-red-300 border border-red-400/30 bg-red-500/10 hover:bg-red-500/20 disabled:opacity-50 transition-all flex items-center justify-center gap-2">
              {cancelling ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
              Cancel Request
            </button>
          )}
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto pb-8">
          {/* Filter chips + Search */}
          <div className="px-4 pt-4 pb-2 flex gap-2 overflow-x-auto no-scrollbar">
            {(['All', 'Pending', 'Approved', 'Rejected', 'Cancelled'] as const).map(f => (
              <button key={f} onClick={() => setFilter(f)}
                className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors
                  ${filter === f ? 'bg-blue-500 text-white' : 'bg-white/10 text-white/60 hover:bg-white/20'}`}>
                {f}
              </button>
            ))}
          </div>
          <div className="px-4 pb-2 relative">
            <Search className="absolute left-7 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30 pointer-events-none" />
            <input
              type="text"
              placeholder="Search by date, reason, time…"
              value={search}
              onChange={(e: { target: HTMLInputElement }) => setSearch(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-9 py-2.5 text-white text-sm placeholder-white/30 focus:outline-none focus:border-blue-400/40"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-7 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-20 text-blue-200/40 text-sm">No {filter !== 'All' ? filter.toLowerCase() : ''} filings found</div>
          ) : (
            <div className="px-4 py-2 space-y-3">
              {filtered.map((rec: TimeCorrectionFiling) => (
                <button key={rec.id} onClick={() => setSelected(rec)}
                  className="w-full text-left bg-white/5 border border-white/10 rounded-xl p-4 hover:bg-white/10 hover:border-blue-400/30 transition-all">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-blue-300 shrink-0" />
                      <span className="text-white font-medium text-sm">{formatDate(rec.attendanceDate)}</span>
                    </div>
                    <span className={`shrink-0 inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${STATUS_STYLE[rec.status]}`}>
                      {STATUS_ICON[rec.status]} {rec.status}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    {rec.correctedTimeIn && (
                      <div className="text-xs text-white/50">
                        <span className="text-white/30">In → </span>
                        <span className="text-emerald-300">{rec.correctedTimeIn}</span>
                      </div>
                    )}
                    {rec.correctedTimeOut && (
                      <div className="text-xs text-white/50">
                        <span className="text-white/30">Out → </span>
                        <span className="text-emerald-300">{rec.correctedTimeOut}</span>
                      </div>
                    )}
                  </div>
                  <p className="text-white/40 text-xs mt-2 line-clamp-1">{rec.reason}</p>
                  <p className="text-white/25 text-xs mt-1">Filed {formatDateTime(rec.submittedAt)}</p>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
