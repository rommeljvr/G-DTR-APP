import { getNotifications } from './sheets';

const STORAGE_KEY = 'dtr_last_notif_ids';

function getSeenIds(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

function saveSeenIds(ids: Set<string>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]));
  } catch { /* ignore */ }
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  const result = await Notification.requestPermission();
  return result === 'granted';
}

export function getNotificationPermission(): NotificationPermission | 'unsupported' {
  if (!('Notification' in window)) return 'unsupported';
  return Notification.permission;
}

const NOTIF_ICONS: Record<string, string> = {
  LEAVE_FILED:        '📋',
  PENDING_APPROVAL:   '⏳',
  LEAVE_ACKNOWLEDGED: '👁️',
  LEAVE_APPROVED:     '✅',
  LEAVE_REJECTED:     '❌',
};

const NOTIF_TITLES: Record<string, string> = {
  LEAVE_FILED:        'Leave Filed',
  PENDING_APPROVAL:   'Approval Required',
  LEAVE_ACKNOWLEDGED: 'Leave Acknowledged',
  LEAVE_APPROVED:     'Leave Approved',
  LEAVE_REJECTED:     'Leave Rejected',
};

export async function checkAndFirePushNotifications(email: string): Promise<void> {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;

  const notifications = await getNotifications(email);
  if (!notifications.length) return;

  const seen = getSeenIds();
  const newOnes = notifications.filter((n) => !n.isRead && !seen.has(n.id));

  for (const n of newOnes) {
    const icon = NOTIF_ICONS[n.type] ?? '🔔';
    const title = NOTIF_TITLES[n.type] ?? 'DTR Notification';
    try {
      const notif = new Notification(`${icon} ${title}`, {
        body: n.message,
        icon: '/logo.png',
        badge: '/logo.png',
        tag: n.id,
      });
      notif.onclick = () => {
        window.focus();
        notif.close();
      };
    } catch (e) {
      console.warn('Browser notification error:', e);
    }
    seen.add(n.id);
  }

  saveSeenIds(seen);
}
