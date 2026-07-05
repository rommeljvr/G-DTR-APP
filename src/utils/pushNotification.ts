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
  LEAVE_FILED:             '📋',
  LEAVE_SUBMITTED:         '📋',
  PENDING_APPROVAL:        '⏳',
  LEAVE_ACKNOWLEDGED:      '👁️',
  LEAVE_APPROVED:          '✅',
  LEAVE_REJECTED:          '❌',
  TC_FILED:                '🕐',
  TC_ACKNOWLEDGED:         '👁️',
  TC_APPROVED:             '✅',
  TC_REJECTED:             '❌',
  TC_CANCELLED:            '🚫',
  DTR_GENERATED:           '📄',
  DTR_REGENERATED:         '🔄',
  DTR_ISSUE_SUBMITTED:     '⚠️',
  WFH_SUBMITTED:           '🏠',
  WFH_EOD_SUBMITTED:       '📝',
  WFH_APPROVED:            '✅',
  WFH_REJECTED:            '❌',
  WFH_REVISION_REQUESTED:  '🔁',
  WFH_RESUBMITTED:         '🔄',
  WFH_PENDING_APPROVAL:    '⏳',
};

const NOTIF_TITLES: Record<string, string> = {
  LEAVE_FILED:             'Leave Filed',
  LEAVE_SUBMITTED:         'Leave Submitted',
  PENDING_APPROVAL:        'Approval Required',
  LEAVE_ACKNOWLEDGED:      'Leave Acknowledged',
  LEAVE_APPROVED:          'Leave Approved',
  LEAVE_REJECTED:          'Leave Rejected',
  TC_FILED:                'TC Request Filed',
  TC_ACKNOWLEDGED:         'TC Acknowledged',
  TC_APPROVED:             'TC Approved',
  TC_REJECTED:             'TC Rejected',
  TC_CANCELLED:            'TC Cancelled',
  DTR_GENERATED:           'DTR Generated',
  DTR_REGENERATED:         'DTR Regenerated',
  DTR_ISSUE_SUBMITTED:     'DTR Issue Reported',
  WFH_SUBMITTED:           'WFH Registered',
  WFH_EOD_SUBMITTED:       'EOD Report Submitted',
  WFH_APPROVED:            'WFH Approved',
  WFH_REJECTED:            'WFH Rejected',
  WFH_REVISION_REQUESTED:  'WFH Revision Requested',
  WFH_RESUBMITTED:         'WFH Resubmitted',
  WFH_PENDING_APPROVAL:    'WFH Approval Required',
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
