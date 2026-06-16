import { useState, useEffect, useCallback } from 'react';
import {
  ChevronLeft, CheckCircle2, XCircle, Clock, Loader2,
  AlertCircle, User as UserIcon, CalendarDays, FileText,
  ThumbsUp, ThumbsDown, Eye,
} from 'lucide-react';
import { User, LeaveApplication, LeaveApprovalRecord } from '../types';
import { getPendingApprovals, acknowledgeLeave, approveLeave, rejectLeave, markNotificationsRead } from '../utils/sheets';

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
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center">
          <div className="bg-slate-900 border border-white/10 rounded-t-3xl sm:rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto slide-up">
            {/* Modal header */}
            <div className="sticky top-0 bg-slate-900 border-b border-white/10 px-5 py-4 flex items-center justify-between">
              <h2 className="text-white font-bold">Leave Request Detail</h2>
              <button onClick={() => setSelected(null)} className="w-8 h-8 bg-white/8 rounded-full flex items-center justify-center">
                <XCircle className="w-4 h-4 text-white/60" />
              </button>
            </div>

            <div className="px-5 py-4 space-y-4">
              {/* Employee */}
              <div className="bg-white/5 rounded-xl p-3 flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center shrink-0">
                  <UserIcon className="w-5 h-5 text-blue-300" />
                </div>
                <div>
                  <p className="text-white font-semibold text-sm">{selected.employeeName}</p>
                  <p className="text-white/50 text-xs">{selected.email}</p>
                </div>
                <span className={`ml-auto text-[10px] font-medium px-2 py-0.5 rounded-full border ${STATUS_STYLE[selected.status] || 'bg-white/10 text-white/50 border-transparent'}`}>
                  {selected.status}
                </span>
              </div>

              {/* Leave details */}
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="bg-white/5 rounded-xl p-3">
                  <p className="text-white/40 text-[10px] uppercase tracking-wide mb-1">Leave Type</p>
                  <p className="text-white font-medium">{selected.leaveType}</p>
                </div>
                <div className="bg-white/5 rounded-xl p-3">
                  <p className="text-white/40 text-[10px] uppercase tracking-wide mb-1">Duration</p>
                  <p className="text-white font-medium">{selected.totalDays} day{selected.totalDays !== 1 ? 's' : ''}</p>
                </div>
                <div className="bg-white/5 rounded-xl p-3">
                  <p className="text-white/40 text-[10px] uppercase tracking-wide mb-1">From</p>
                  <p className="text-white font-medium">{formatDate(selected.startDate)}</p>
                </div>
                <div className="bg-white/5 rounded-xl p-3">
                  <p className="text-white/40 text-[10px] uppercase tracking-wide mb-1">To</p>
                  <p className="text-white font-medium">{formatDate(selected.endDate)}</p>
                </div>
              </div>

              {/* Reason */}
              {selected.reason && (
                <div className="bg-white/5 rounded-xl p-3">
                  <p className="text-white/40 text-[10px] uppercase tracking-wide mb-1">Reason</p>
                  <p className="text-white/80 text-sm leading-relaxed">{selected.reason}</p>
                </div>
              )}

              {/* Rejection reason */}
              {selected.rejectionReason && (
                <div className="bg-red-500/10 border border-red-400/20 rounded-xl p-3">
                  <p className="text-red-300/70 text-[10px] uppercase tracking-wide mb-1">Rejection Reason</p>
                  <p className="text-red-300 text-sm">{selected.rejectionReason}</p>
                </div>
              )}

              {/* Workflow info */}
              <div className="bg-white/5 rounded-xl p-3 text-xs text-white/50 space-y-1">
                <p><span className="text-white/30">Workflow:</span> {selected.workflowType === 'TWO_STEP' ? 'Two-Step (TL → Approver)' : 'Direct Approval'}</p>
                {selected.teamLeadEmail && <p><span className="text-white/30">Team Lead:</span> {selected.teamLeadEmail}</p>}
                {selected.approverEmail && <p><span className="text-white/30">Approver:</span> {selected.approverEmail}</p>}
                <p><span className="text-white/30">Submitted:</span> {formatTs(selected.submittedAt)}</p>
              </div>

              {/* Approval history timeline */}
              {selected.approvalHistory && selected.approvalHistory.length > 0 && (
                <div>
                  <p className="text-white/40 text-[10px] uppercase tracking-wide mb-2">Approval History</p>
                  <div className="space-y-2">
                    {(selected.approvalHistory as LeaveApprovalRecord[]).map((h) => (
                      <div key={h.id} className="flex items-start gap-3 bg-white/5 rounded-xl p-3">
                        <div className={`mt-0.5 text-xs font-bold ${ACTION_STYLE[h.action] || 'text-white/50'}`}>
                          {h.action === 'Approve' ? <ThumbsUp className="w-3.5 h-3.5" /> :
                           h.action === 'Reject'  ? <ThumbsDown className="w-3.5 h-3.5" /> :
                           <Clock className="w-3.5 h-3.5 text-blue-300" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-white/80 text-xs font-medium">{h.approverName}</p>
                          <p className={`text-[11px] ${ACTION_STYLE[h.action] || 'text-white/40'}`}>{h.action}</p>
                          {h.reason && <p className="text-white/50 text-[11px] mt-0.5">{h.reason}</p>}
                        </div>
                        <p className="text-white/30 text-[10px] shrink-0">{formatTs(String(h.timestamp))}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Action buttons */}
              <div className="flex flex-col gap-2 pt-1 pb-2">
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
              </div>
            </div>
          </div>
        </div>
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
