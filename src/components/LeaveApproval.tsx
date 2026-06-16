import { useState, useEffect, useCallback } from 'react';
import {
  ChevronLeft, CheckCircle2, Loader2,
  AlertCircle, User as UserIcon, CalendarDays,
  ThumbsUp, ThumbsDown, Eye,
} from 'lucide-react';
import { User, LeaveApplication } from '../types';
import { getPendingApprovals, acknowledgeLeave, approveLeave, rejectLeave, markNotificationsRead } from '../utils/sheets';
import LeaveDetailModal from './LeaveDetailModal';

interface Props {
  user: User;
  onBack: () => void;
  onUnreadChange?: () => void;
}

function formatDate(val: string): string {
  if (!val) return '';
  const d = new Date(val.replace(/-/g, '/'));
  return isNaN(d.getTime()) ? val : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatTs(val: string): string {
  if (!val) return '';
  const d = new Date(val);
  return isNaN(d.getTime()) ? val : d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const STATUS_STYLE: Record<string, string> = {
  Pending:      'bg-amber-400/15 text-amber-300 border-amber-400/30',
  Acknowledged: 'bg-blue-400/15 text-blue-300 border-blue-400/30',
  Approved:     'bg-emerald-400/15 text-emerald-300 border-emerald-400/30',
  Rejected:     'bg-red-400/15 text-red-300 border-red-400/30',
};

const ACTION_STYLE: Record<string, string> = {
  Acknowledge: 'text-blue-300',
  Approve:     'text-emerald-300',
  Reject:      'text-red-300',
};

export default function LeaveApproval({ user, onBack, onUnreadChange }: Props) {
  const [records, setRecords] = useState<LeaveApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<LeaveApplication | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    const data = await getPendingApprovals(user.email);
    setRecords(data);
    setLoading(false);
  }, [user.email]);

  useEffect(() => { load(); }, [load]);

  const notify = (msg: string, isError = false) => {
    if (isError) setError(msg); else setSuccess(msg);
    setTimeout(() => { setError(''); setSuccess(''); }, 3500);
  };

  const handleAcknowledge = async (leave: LeaveApplication) => {
    setActionLoading(true);
    const res = await acknowledgeLeave(leave.id, user.email);
    setActionLoading(false);
    if (res.success) {
      notify('Leave acknowledged and forwarded for approval.');
      setSelected(null);
      load();
      await markNotificationsRead(user.email);
      onUnreadChange?.();
    } else {
      notify(res.message || 'Failed to acknowledge', true);
    }
  };

  const handleApprove = async (leave: LeaveApplication) => {
    setActionLoading(true);
    const res = await approveLeave(leave.id, user.email);
    setActionLoading(false);
    if (res.success) {
      notify('Leave approved successfully.');
      setSelected(null);
      load();
      await markNotificationsRead(user.email);
      onUnreadChange?.();
    } else {
      notify(res.message || 'Failed to approve', true);
    }
  };

  const handleRejectSubmit = async () => {
    if (!rejectReason.trim()) { notify('Rejection reason is required.', true); return; }
    if (!selected) return;
    setActionLoading(true);
    const res = await rejectLeave(selected.id, user.email, rejectReason);
    setActionLoading(false);
    if (res.success) {
      notify('Leave rejected.');
      setShowRejectModal(false);
      setRejectReason('');
      setSelected(null);
      load();
      await markNotificationsRead(user.email);
      onUnreadChange?.();
    } else {
      notify(res.message || 'Failed to reject', true);
    }
  };

  const isTL = (leave: LeaveApplication) =>
    leave.workflowType === 'TWO_STEP' &&
    leave.status === 'Pending' &&
    leave.teamLeadEmail?.toLowerCase() === user.email.toLowerCase();

  const isApprover = (leave: LeaveApplication) => {
    const approverMatch = leave.approverEmail?.toLowerCase() === user.email.toLowerCase();
    if (leave.workflowType === 'TWO_STEP') return leave.status === 'Acknowledged' && approverMatch;
    return leave.status === 'Pending' && approverMatch;
  };

  return (
    <div className="min-h-dvh flex flex-col bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900">
      {/* Header */}
      <div className="px-4 pt-10 pb-4 bg-slate-900/80 border-b border-white/10">
        <div className="flex items-center gap-3 mb-1">
          <button onClick={onBack} className="w-8 h-8 flex items-center justify-center rounded-full bg-white/8 active:scale-90 transition-transform">
            <ChevronLeft className="w-4 h-4 text-white/70" />
          </button>
          <div>
            <h1 className="text-white font-bold text-base leading-tight">Leave Approvals</h1>
            <p className="text-blue-200/60 text-[11px]">
              {loading ? 'Loading…' : `${records.length} pending action${records.length !== 1 ? 's' : ''}`}
            </p>
          </div>
        </div>
      </div>

      {/* Toast */}
      {(error || success) && (
        <div className={`mx-4 mt-3 rounded-xl px-4 py-3 flex items-center gap-2 text-sm ${error ? 'bg-red-500/10 text-red-300 border border-red-400/20' : 'bg-emerald-500/10 text-emerald-300 border border-emerald-400/20'}`}>
          {error ? <AlertCircle className="w-4 h-4 shrink-0" /> : <CheckCircle2 className="w-4 h-4 shrink-0" />}
          {error || success}
        </div>
      )}

      {/* List */}
      <div className="flex-1 px-4 py-3 space-y-3 max-w-lg mx-auto w-full">
        {loading && (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
            <p className="text-white/40 text-sm">Loading pending approvals…</p>
          </div>
        )}

        {!loading && records.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <CheckCircle2 className="w-10 h-10 text-emerald-400/40" />
            <p className="text-white/40 text-sm">No pending approvals</p>
          </div>
        )}

        {!loading && records.map((leave) => (
          <button
            key={leave.id}
            onClick={() => setSelected(leave)}
            className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 text-left active:scale-[0.98] transition-transform hover:bg-white/8"
          >
            <div className="flex items-start justify-between gap-3 mb-2">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center shrink-0">
                  <UserIcon className="w-4 h-4 text-blue-300" />
                </div>
                <div className="min-w-0">
                  <p className="text-white font-semibold text-sm truncate">{leave.employeeName}</p>
                  <p className="text-white/40 text-[11px] truncate">{leave.email}</p>
                </div>
              </div>
              <span className={`shrink-0 text-[10px] font-medium px-2 py-0.5 rounded-full border ${STATUS_STYLE[leave.status] || 'bg-white/10 text-white/50 border-transparent'}`}>
                {leave.status}
              </span>
            </div>
            <div className="flex items-center gap-4 text-[11px] text-white/50 mt-1">
              <span className="flex items-center gap-1"><CalendarDays className="w-3 h-3" />{leave.leaveType}</span>
              <span>{formatDate(leave.startDate)} → {formatDate(leave.endDate)}</span>
              <span>{leave.totalDays}d</span>
            </div>
            <div className="mt-2 flex items-center gap-1 text-[11px] text-blue-300/70">
              <Eye className="w-3 h-3" />
              {isTL(leave) ? 'Tap to Acknowledge' : isApprover(leave) ? 'Tap to Approve / Reject' : 'View details'}
            </div>
          </button>
        ))}
      </div>

      {/* Detail Modal */}
      {selected && (
        <LeaveDetailModal
          leave={selected}
          onClose={() => setSelected(null)}
          actions={
            <>
              {isTL(selected) && (
                <button
                  onClick={() => handleAcknowledge(selected)}
                  disabled={actionLoading}
                  className="w-full bg-blue-500/20 border border-blue-400/30 text-blue-300 rounded-xl py-3 font-semibold text-sm flex items-center justify-center gap-2 active:scale-[0.97] transition-transform disabled:opacity-60"
                >
                  {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  Acknowledge & Forward
                </button>
              )}
              {isApprover(selected) && (
                <>
                  <button
                    onClick={() => handleApprove(selected)}
                    disabled={actionLoading}
                    className="w-full bg-emerald-500/20 border border-emerald-400/30 text-emerald-300 rounded-xl py-3 font-semibold text-sm flex items-center justify-center gap-2 active:scale-[0.97] transition-transform disabled:opacity-60"
                  >
                    {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ThumbsUp className="w-4 h-4" />}
                    Approve
                  </button>
                  <button
                    onClick={() => setShowRejectModal(true)}
                    disabled={actionLoading}
                    className="w-full bg-red-500/15 border border-red-400/30 text-red-300 rounded-xl py-3 font-semibold text-sm flex items-center justify-center gap-2 active:scale-[0.97] transition-transform disabled:opacity-60"
                  >
                    <ThumbsDown className="w-4 h-4" />
                    Reject
                  </button>
                </>
              )}
              {!isTL(selected) && !isApprover(selected) && (
                <p className="text-center text-white/30 text-xs py-2">No actions available for your role on this request.</p>
              )}
            </>
          }
        />
      )}

      {/* Reject reason modal */}
      {showRejectModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[60] flex items-end sm:items-center justify-center">
          <div className="bg-slate-900 border border-white/10 rounded-t-3xl sm:rounded-2xl w-full max-w-md px-5 pt-5 pb-8 slide-up">
            <h3 className="text-white font-bold mb-1">Rejection Reason</h3>
            <p className="text-white/40 text-xs mb-4">Required — will be visible to the employee.</p>
            <textarea
              value={rejectReason}
              onChange={(e: { target: { value: string } }) => setRejectReason(e.target.value)}
              rows={4}
              placeholder="Enter reason for rejection…"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder-white/30 focus:outline-none focus:border-red-400/50 resize-none mb-4"
            />
            <div className="flex gap-2">
              <button
                onClick={() => { setShowRejectModal(false); setRejectReason(''); }}
                className="flex-1 bg-white/8 text-white/60 rounded-xl py-3 font-medium text-sm active:scale-95"
              >
                Cancel
              </button>
              <button
                onClick={handleRejectSubmit}
                disabled={actionLoading || !rejectReason.trim()}
                className="flex-1 bg-red-500/20 border border-red-400/30 text-red-300 rounded-xl py-3 font-semibold text-sm flex items-center justify-center gap-2 active:scale-95 disabled:opacity-60"
              >
                {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ThumbsDown className="w-4 h-4" />}
                Confirm Reject
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
