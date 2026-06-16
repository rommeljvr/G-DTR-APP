import { useState, useEffect, useCallback } from 'react';
import { Bell, CheckCheck, ChevronLeft, Loader2, RefreshCw } from 'lucide-react';
import { User, AppNotification, NotificationType } from '../types';
import { getNotifications, markNotificationsRead } from '../utils/sheets';

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
  const [items, setItems]     = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const data = await getNotifications(user.email);
    // Only show unread — read ones were already dismissed and should stay gone
    const unreadItems = data.filter((n) => !n.isRead);
    setItems(unreadItems);
    setLoading(false);
    if (unreadItems.length < data.length) {
      // Some were already read — badge should be clear
      onRead();
    }
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

  const unread = items.filter((n) => !n.isRead).length;

  return (
    <div className="min-h-dvh flex flex-col bg-gradient-to-b from-slate-950 to-slate-900">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 pt-12 pb-4">
        <button
          onClick={onBack}
          className="w-9 h-9 flex items-center justify-center rounded-xl bg-white/8 active:scale-90 transition-transform"
        >
          <ChevronLeft className="w-5 h-5 text-white" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-white font-bold text-lg leading-tight">Notifications</h1>
          {unread > 0 && (
            <p className="text-white/40 text-xs">{unread} unread</p>
          )}
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="w-9 h-9 flex items-center justify-center rounded-xl bg-white/8 active:scale-90 transition-transform disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 text-white ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

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
          const isUnread = !n.isRead;
          return (
            <div
              key={n.id}
              className={`relative rounded-2xl border p-4 transition-all ${
                isUnread ? 'bg-white/6 border-white/12' : 'bg-white/3 border-white/8'
              }`}
            >
              {isUnread && (
                <span className="absolute top-3 right-3 w-2.5 h-2.5 rounded-full bg-red-500" />
              )}
              <div className="flex items-start gap-3">
                <span className="text-xl mt-0.5 shrink-0">{meta.icon}</span>
                <div className="flex-1 min-w-0 pr-4">
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${meta.color}`}>
                    {meta.label}
                  </span>
                  <p className="text-white/80 text-sm leading-relaxed mt-1.5">{n.message}</p>
                  <p className="text-white/30 text-[11px] mt-1.5">{timeAgo(n.createdAt)}</p>
                </div>
              </div>
              <button
                onClick={() => dismiss(n.id)}
                className="mt-3 w-full py-2 rounded-xl bg-white/6 text-white/50 text-xs font-medium active:scale-[0.97] transition-transform hover:bg-white/10"
              >
                Dismiss
              </button>
            </div>
          );
        })}

        {!loading && items.length > 0 && (
          <button
            onClick={dismissAll}
            className="w-full flex items-center justify-center gap-2 py-3 text-white/40 text-sm hover:text-white/60 transition-colors"
          >
            <CheckCheck className="w-4 h-4" />
            Dismiss all
          </button>
        )}
      </div>
    </div>
  );
}
