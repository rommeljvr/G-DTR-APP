import { useState, useEffect, useCallback } from 'react';
import { Bell, CheckCheck, ChevronLeft, Loader2, RefreshCw, ThumbsDown, Eye } from 'lucide-react';
import { User, AppNotification, NotificationType } from '../types';
import { getNotifications, markNotificationsRead, acknowledgeLeave, rejectLeave } from '../utils/sheets';

interface Props {
  user: User;
  onBack: () => void;
  onRead: () => void;
}

const TYPE_META: Record<NotificationType, { label: string; icon: string; color: string }> = {
  LEAVE_FILED:        { label: 'Leave Filed',        icon: '📋', color: 'bg-blue-500/15 border-blue-400/20 text-blue-300' },
  LEAVE_SUBMITTED:    { label: 'Leave Submitted',    icon: '📋', color: 'bg-blue-500/15 border-blue-400/20 text-blue-300' },
  PENDING_APPROVAL:   { label: 'Approval Required',  icon: '⏳', color: 'bg-amber-500/15 border-amber-400/20 text-amber-300' },
  LEAVE_ACKNOWLEDGED: { label: 'Acknowledged',       icon: '👁️', color: 'bg-violet-500/15 border-violet-400/20 text-violet-300' },
  LEAVE_APPROVED:     { label: 'Approved',           icon: '✅', color: 'bg-emerald-500/15 border-emerald-400/20 text-emerald-300' },
  LEAVE_REJECTED:     { label: 'Rejected',           icon: '❌', color: 'bg-red-500/15 border-red-400/20 text-red-300' },
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins  = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days  = Math.floor(diff / 86400000);
  if (mins  < 1)  return 'just now';
  if (mins  < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days  < 7)  return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function NotificationInbox({ user, onBack, onRead }: Props) {
  const [items, setItems]           = useState<AppNotification[]>([]);
  const [loading, setLoading]       = useState(true);
  const [actingId, setActingId]     = useState<string | null>(null);
  const [toast, setToast]           = useState<{ msg: string; ok: boolean } | null>(null);
  const [rejectTarget, setRejectTarget] = useState<AppNotification | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const showToast = (msg: string, ok: boolean) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  };

  const load = useCallback(async () => {
    setLoading(true);
    const data = await getNotifications(user.email);
    const unreadItems = data.filter((n) => !n.isRead);
    setItems(unreadItems);
    setLoading(false);
    if (unreadItems.length < data.length) onRead();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.email]);

  useEffect(() => { load(); }, [load]);

  const dismiss = async (id: string) => {
    await markNotificationsRead(user.email, id);
    setItems((prev) => prev.filter((n) => n.id !== id));
  };

  const dismissAll = async () => {
    await markNotificationsRead(user.email);
    setItems([]);
    onRead();
  };

  const handleAcknowledge = async (n: AppNotification) => {
    if (!n.leaveId) return;
    setActingId(n.id);
    const res = await acknowledgeLeave(n.leaveId, user.email);
    setActingId(null);
    if (res.success) {
      showToast('Leave acknowledged and forwarded.', true);
      await dismiss(n.id);
      onRead();
    } else {
      showToast(res.message || 'Failed to acknowledge.', false);
    }
  };

  const handleRejectSubmit = async () => {
    if (!rejectTarget?.leaveId || !rejectReason.trim()) return;
    setActingId(rejectTarget.id);
    const res = await rejectLeave(rejectTarget.leaveId, user.email, rejectReason);
    setActingId(null);
    if (res.success) {
      showToast('Leave rejected.', true);
      const id = rejectTarget.id;
      setRejectTarget(null);
      setRejectReason('');
      await dismiss(id);
      onRead();
    } else {
      showToast(res.message || 'Failed to reject.', false);
      setRejectTarget(null);
      setRejectReason('');
    }
  };

  const unread = items.filter((n) => !n.isRead).length;

  return (
    <div className="min-h-dvh flex flex-col bg-gradient-to-b from-slate-950 to-slate-900">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 pt-12 pb-4">
        <button onClick={onBack} className="w-9 h-9 flex items-center justify-center rounded-xl bg-white/8 active:scale-90 transition-transform">
          <ChevronLeft className="w-5 h-5 text-white" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-white font-bold text-lg leading-tight">Notifications</h1>
          {unread > 0 && <p className="text-white/40 text-xs">{unread} unread</p>}
        </div>
        <button onClick={load} disabled={loading} className="w-9 h-9 flex items-center justify-center rounded-xl bg-white/8 active:scale-90 transition-transform disabled:opacity-50">
          <RefreshCw className={`w-4 h-4 text-white ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Toast */}
      {toast && (
        <div className={`mx-4 mb-2 rounded-xl px-4 py-3 text-sm flex items-center gap-2 ${toast.ok ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-400/20' : 'bg-red-500/10 text-red-300 border border-red-400/20'}`}>
          {toast.ok ? '✅' : '❌'} {toast.msg}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 px-4 pb-8 space-y-2">
        {loading && (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
            <p className="text-white/40 text-sm">Loading notifications…</p>
          </div>
        )}

        {!loading && items.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <div className="w-14 h-14 rounded-2xl bg-white/5 flex items-center justify-center">
              <Bell className="w-7 h-7 text-white/20" />
            </div>
            <p className="text-white/40 text-sm">All caught up!</p>
          </div>
        )}

        {!loading && items.map((n) => {
          const meta = TYPE_META[n.type] ?? { label: n.type, icon: '🔔', color: 'bg-white/10 border-white/10 text-white/60' };
          const isPendingAction = n.type === 'PENDING_APPROVAL' && !!n.leaveId;
          const isActing = actingId === n.id;
          return (
            <div key={n.id} className="relative rounded-2xl border bg-white/6 border-white/12 p-4 transition-all">
              {!n.isRead && <span className="absolute top-3 right-3 w-2.5 h-2.5 rounded-full bg-red-500" />}
              <div className="flex items-start gap-3">
                <span className="text-xl mt-0.5 shrink-0">{meta.icon}</span>
                <div className="flex-1 min-w-0 pr-4">
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${meta.color}`}>{meta.label}</span>
                  <p className="text-white/80 text-sm leading-relaxed mt-1.5">{n.message}</p>
                  <p className="text-white/30 text-[11px] mt-1.5">{timeAgo(n.createdAt)}</p>
                </div>
              </div>

              {/* Action buttons for PENDING_APPROVAL */}
              {isPendingAction ? (
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={() => handleAcknowledge(n)}
                    disabled={isActing}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-blue-500/20 border border-blue-400/30 text-blue-300 text-xs font-semibold active:scale-[0.97] transition-transform disabled:opacity-50"
                  >
                    {isActing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Eye className="w-3.5 h-3.5" />}
                    Acknowledge
                  </button>
                  <button
                    onClick={() => { setRejectTarget(n); setRejectReason(''); }}
                    disabled={isActing}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-red-500/15 border border-red-400/30 text-red-300 text-xs font-semibold active:scale-[0.97] transition-transform disabled:opacity-50"
                  >
                    <ThumbsDown className="w-3.5 h-3.5" />
                    Reject
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => dismiss(n.id)}
                  className="mt-3 w-full py-2 rounded-xl bg-white/6 text-white/50 text-xs font-medium active:scale-[0.97] transition-transform hover:bg-white/10"
                >
                  Dismiss
                </button>
              )}
            </div>
          );
        })}

        {!loading && items.length > 0 && (
          <button onClick={dismissAll} className="w-full flex items-center justify-center gap-2 py-3 text-white/40 text-sm hover:text-white/60 transition-colors">
            <CheckCheck className="w-4 h-4" />
            Dismiss all
          </button>
        )}
      </div>

      {/* Reject reason modal */}
      {rejectTarget && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-end justify-center">
          <div className="bg-slate-900 border border-white/10 rounded-t-3xl w-full max-w-lg px-5 pt-5 pb-8">
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
                onClick={() => { setRejectTarget(null); setRejectReason(''); }}
                className="flex-1 bg-white/8 text-white/60 rounded-xl py-3 font-medium text-sm active:scale-95"
              >
                Cancel
              </button>
              <button
                onClick={handleRejectSubmit}
                disabled={!rejectReason.trim() || actingId === rejectTarget.id}
                className="flex-1 bg-red-500/20 border border-red-400/30 text-red-300 rounded-xl py-3 font-semibold text-sm flex items-center justify-center gap-2 active:scale-95 disabled:opacity-60"
              >
                {actingId === rejectTarget.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <ThumbsDown className="w-4 h-4" />}
                Confirm Reject
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
