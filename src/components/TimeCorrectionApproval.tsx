import { useState, useEffect, useCallback } from 'react';
import {
  ChevronLeft, Clock, Calendar, FileText, CheckCircle2,
  AlertCircle, Loader2, XCircle, ThumbsUp, ThumbsDown,
  ExternalLink, RotateCcw, User as UserIcon, Search, X,
} from 'lucide-react';
import { User, TimeCorrectionFiling } from '../types';
import { getPendingTimeCorrectionApprovals, approveTimeCorrection, rejectTimeCorrection } from '../utils/sheets';

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

function formatDate(val: string): string {
  if (!val) return '';
  const d = new Date(val.replace(/-/g, '/'));
  return isNaN(d.getTime()) ? val : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDateTime(val: string): string {
  if (!val) return '';
  try {
    return new Date(val).toLocaleString('en-US', {
      timeZone: 'Asia/Manila', month: 'short', day: 'numeric',
      year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true,
    });
  } catch { return val; }
}

export default function TimeCorrectionApproval({ user, onBack }: Props) {
  const [records, setRecords]       = useState<TimeCorrectionFiling[]>([]);
  const [loading, setLoading]       = useState(true);
  const [selected, setSelected]     = useState<TimeCorrectionFiling | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason]       = useState('');
  const [rejectTarget, setRejectTarget]       = useState<TimeCorrectionFiling | null>(null);
  const [search, setSearch]             = useState('');
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await getPendingTimeCorrectionApprovals(user.email);
    setRecords(res.records || []);
    setLoading(false);
  }, [user.email]);

  useEffect(() => { load(); }, [load]);

  const notify = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 4000);
  };

  const handleApprove = async (rec: TimeCorrectionFiling) => {
    setActionLoading(true);
    const res = await approveTimeCorrection(rec.id, user.email);
    setActionLoading(false);
    if (res.success) {
      notify('success', 'Time Correction approved');
      setSelected(null);
      load();
    } else {
      notify('error', res.message || 'Approval failed');
    }
  };

  const handleRejectConfirm = async () => {
    if (!rejectTarget) return;
    if (!rejectReason.trim()) { notify('error', 'Rejection reason is required'); return; }
    setActionLoading(true);
    const res = await rejectTimeCorrection(rejectTarget.id, user.email, rejectReason.trim());
    setActionLoading(false);
    if (res.success) {
      notify('success', 'Time Correction rejected');
      setShowRejectModal(false);
      setRejectReason('');
      setRejectTarget(null);
      setSelected(null);
      load();
    } else {
      notify('error', res.message || 'Rejection failed');
    }
  };

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

      {/* Reject modal */}
      {showRejectModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-40 flex items-end sm:items-center justify-center px-4 pb-4">
          <div className="bg-slate-900/95 border border-white/10 rounded-2xl p-6 w-full max-w-sm">
            <h3 className="text-white font-bold text-lg mb-1">Reject Request</h3>
            <p className="text-blue-200/60 text-xs mb-4">Provide a reason for rejection</p>
            <textarea
              rows={3}
              value={rejectReason}
              onChange={(e: { target: HTMLTextAreaElement }) => setRejectReason(e.target.value)}
              placeholder="Enter rejection reason..."
              className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white text-sm placeholder-white/30 focus:outline-none focus:border-red-400/50 resize-none mb-4"
            />
            <div className="flex gap-3">
              <button onClick={() => { setShowRejectModal(false); setRejectReason(''); }}
                className="flex-1 py-2.5 rounded-xl border border-white/20 text-white/70 text-sm hover:bg-white/10 transition-colors">
                Cancel
              </button>
              <button onClick={handleRejectConfirm} disabled={actionLoading}
                className="flex-1 py-2.5 rounded-xl bg-red-500/80 hover:bg-red-500 text-white text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2 transition-colors">
                {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ThumbsDown className="w-4 h-4" />}
                Reject
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="bg-white/5 backdrop-blur-xl border-b border-white/10 px-4 py-4 flex items-center gap-3">
        <button onClick={selected ? () => setSelected(null) : onBack}
          className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors">
          <ChevronLeft className="w-5 h-5 text-white" />
        </button>
        <div className="flex-1">
          <h1 className="text-white font-bold text-lg">TC Approvals</h1>
          <p className="text-blue-200/60 text-xs">{records.length} pending request{records.length !== 1 ? 's' : ''}</p>
        </div>
        <button onClick={load} className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors">
          <RotateCcw className="w-4 h-4 text-white" />
        </button>
      </div>

      {/* Detail view */}
      {selected ? (
        <div className="flex-1 overflow-y-auto px-4 py-5 space-y-4 pb-8">
          <span className={`inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full ${STATUS_STYLE[selected.status]}`}>
            <Clock className="w-3 h-3" /> {selected.status}
          </span>

          {/* Employee info */}
          <div className="bg-white/5 border border-white/10 rounded-xl p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center shrink-0">
              <UserIcon className="w-5 h-5 text-blue-300" />
            </div>
            <div>
              <p className="text-white font-semibold text-sm">{selected.employeeName}</p>
              <p className="text-blue-200/50 text-xs">{selected.department} · {selected.designation}</p>
              <p className="text-blue-200/40 text-xs">{selected.email}</p>
            </div>
          </div>

          {/* Attendance date + times */}
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
                <p className="text-emerald-300 text-sm font-bold">{selected.correctedTimeIn || '—'}</p>
              </div>
              <div className="bg-emerald-500/10 rounded-lg p-3">
                <p className="text-emerald-300/60 text-xs mb-1">Corrected Time Out</p>
                <p className="text-emerald-300 text-sm font-bold">{selected.correctedTimeOut || '—'}</p>
              </div>
            </div>
          </div>

          {/* Reason */}
          <div className="bg-white/5 border border-white/10 rounded-xl p-4">
            <p className="text-blue-200/60 text-xs font-semibold uppercase tracking-wider mb-2">Reason</p>
            <p className="text-white/80 text-sm leading-relaxed">{selected.reason}</p>
          </div>

          {/* Document */}
          {selected.documentUrl && (
            <a href={selected.documentUrl} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-2 bg-blue-500/10 border border-blue-400/20 rounded-xl p-4 text-blue-300 text-sm hover:bg-blue-500/20 transition-colors">
              <FileText className="w-4 h-4" />
              View Supporting Document
              <ExternalLink className="w-3.5 h-3.5 ml-auto" />
            </a>
          )}

          <p className="text-white/30 text-xs px-1">Submitted: {formatDateTime(selected.submittedAt)}</p>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              onClick={() => { setRejectTarget(selected); setShowRejectModal(true); }}
              disabled={actionLoading}
              className="flex-1 py-3.5 rounded-xl border border-red-400/30 bg-red-500/10 text-red-300 font-semibold hover:bg-red-500/20 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors">
              <ThumbsDown className="w-4 h-4" /> Reject
            </button>
            <button
              onClick={() => handleApprove(selected)}
              disabled={actionLoading}
              className="flex-1 py-3.5 rounded-xl bg-emerald-500/80 hover:bg-emerald-500 text-white font-semibold disabled:opacity-50 flex items-center justify-center gap-2 transition-colors">
              {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ThumbsUp className="w-4 h-4" />}
              Approve
            </button>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto px-4 py-5 pb-8">
          {/* Search */}
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30 pointer-events-none" />
            <input
              type="text"
              placeholder="Search by name, date, department…"
              value={search}
              onChange={(e: { target: HTMLInputElement }) => setSearch(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-9 py-2.5 text-white text-sm placeholder-white/30 focus:outline-none focus:border-blue-400/40"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
            </div>
          ) : records.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <CheckCircle2 className="w-12 h-12 text-emerald-400/40" />
              <p className="text-blue-200/40 text-sm">No pending Time Correction requests</p>
            </div>
          ) : (() => {
            const sq = search.trim().toLowerCase();
            const visible = sq
              ? records.filter((r: TimeCorrectionFiling) =>
                  r.employeeName.toLowerCase().includes(sq) ||
                  r.attendanceDate.toLowerCase().includes(sq) ||
                  (r.department || '').toLowerCase().includes(sq)
                )
              : records;
            return visible.length === 0 ? (
              <div className="text-center py-20 text-blue-200/40 text-sm">No results for "{search}"</div>
            ) : (
            <div className="space-y-3">
              {visible.map((rec: TimeCorrectionFiling) => (
                <button key={rec.id} onClick={() => setSelected(rec)}
                  className="w-full text-left bg-white/5 border border-white/10 rounded-xl p-4 hover:bg-white/10 hover:border-blue-400/30 transition-all">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div>
                      <p className="text-white font-semibold text-sm">{rec.employeeName}</p>
                      <p className="text-blue-200/50 text-xs">{rec.department}</p>
                    </div>
                    <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full ${STATUS_STYLE[rec.status]}`}>
                      {rec.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-white/60 text-xs mt-1">
                    <Calendar className="w-3.5 h-3.5" />
                    {formatDate(rec.attendanceDate)}
                  </div>
                  <div className="flex gap-3 mt-2">
                    {rec.correctedTimeIn && (
                      <span className="text-xs text-white/40">In → <span className="text-emerald-300">{rec.correctedTimeIn}</span></span>
                    )}
                    {rec.correctedTimeOut && (
                      <span className="text-xs text-white/40">Out → <span className="text-emerald-300">{rec.correctedTimeOut}</span></span>
                    )}
                  </div>
                  <p className="text-white/30 text-xs mt-2">{formatDateTime(rec.submittedAt)}</p>
                </button>
              ))}
            </div>
            );})()}
        </div>
      )}
    </div>
  );
}
