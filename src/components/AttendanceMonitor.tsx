import { useState, useEffect, useMemo } from 'react';
import {
  ArrowLeft,
  RefreshCw,
  Loader2,
  User as UserIcon,
  MapPin,
  Navigation,
  Clock,
  CheckCircle2,
  XCircle,
  CalendarOff,
  Users,
  Search,
  X,
  History,
  ChevronDown,
  ChevronUp,
  Building2,
  Briefcase,
} from 'lucide-react';
import { User } from '../types';
import { getAttendanceMonitor, getLeaveHistory, AttendanceMonitorRecord } from '../utils/sheets';

interface Props {
  user: User;
  onBack: () => void;
}

function formatDisplayDate(val: string): string {
  if (!val) return '';
  const d = new Date(val.replace(/-/g, '/'));
  if (!isNaN(d.getTime())) {
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }
  return val;
}

function formatDisplayTime(val: string): string {
  if (!val) return '';
  const isIso = /^\d{4}-\d{2}-\d{2}T/.test(val);
  const d = new Date(val);
  if (!isNaN(d.getTime())) {
    const hrs  = isIso ? d.getUTCHours()   : d.getHours();
    const mins = isIso ? d.getUTCMinutes() : d.getMinutes();
    const ampm = hrs >= 12 ? 'PM' : 'AM';
    const h    = hrs % 12 || 12;
    return `${h}:${mins.toString().padStart(2, '0')} ${ampm}`;
  }
  // already a formatted time string (e.g. "8:05:00 AM") — strip seconds
  const m = val.match(/(\d+):(\d+)(?::\d+)?\s*(AM|PM)/i);
  if (m) {
    const h = parseInt(m[1], 10);
    const min = m[2].padStart(2, '0');
    return `${h}:${min} ${m[3].toUpperCase()}`;
  }
  return val;
}

type StatusFilter = 'All' | 'Active' | 'Completed' | 'On Leave' | 'Absent';

const STATUS_CONFIG: Record<string, {
  label: string;
  icon: typeof CheckCircle2;
  badge: string;
  card: string;
  dot: string;
}> = {
  Active:    { label: 'Active',    icon: CheckCircle2,  badge: 'bg-emerald-400/15 text-emerald-300 border border-emerald-400/30', card: 'border-emerald-500/20', dot: 'bg-emerald-400' },
  Completed: { label: 'Completed', icon: CheckCircle2,  badge: 'bg-blue-400/15 text-blue-300 border border-blue-400/30',         card: 'border-blue-500/20',   dot: 'bg-blue-400'   },
  'On Leave':{ label: 'On Leave',  icon: CalendarOff,   badge: 'bg-violet-400/15 text-violet-300 border border-violet-400/30',   card: 'border-violet-500/20', dot: 'bg-violet-400' },
  Absent:    { label: 'Absent',    icon: XCircle,       badge: 'bg-red-400/15 text-red-300 border border-red-400/30',            card: 'border-red-500/20',    dot: 'bg-red-400'    },
};

const FILTERS: StatusFilter[] = ['All', 'Active', 'Completed', 'On Leave', 'Absent'];

function ProfileAvatar({ image, name, size = 'md' }: { image?: string; name: string; size?: 'sm' | 'md' | 'lg' }) {
  const [err, setErr] = useState(false);
  useEffect(() => { setErr(false); }, [image]);
  const validUrl = image && image.startsWith('http') && !err;
  const dim = size === 'sm' ? 'w-8 h-8' : size === 'lg' ? 'w-14 h-14' : 'w-11 h-11';
  const iconDim = size === 'sm' ? 'w-3.5 h-3.5' : size === 'lg' ? 'w-6 h-6' : 'w-5 h-5';
  return (
    <div className={`${dim} rounded-full overflow-hidden bg-gradient-to-br from-blue-400 to-blue-700 flex items-center justify-center shrink-0`}>
      {validUrl
        ? <img src={image} alt={name} className="w-full h-full object-cover" onError={() => setErr(true)} />
        : <UserIcon className={`${iconDim} text-white`} />}
    </div>
  );
}

function DetailModal({
  record,
  onClose,
}: {
  record: AttendanceMonitorRecord;
  onClose: () => void;
}) {
  const [showHistory, setShowHistory] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyRecords, setHistoryRecords] = useState<{ id: string; action: string; date: string; days: string; status: string }[]>([]);

  const cfg = STATUS_CONFIG[record.status] || STATUS_CONFIG['Absent'];

  const openMaps = (lat?: number, lng?: number) => {
    if (!lat || !lng) return;
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`, '_blank');
  };

  const viewLocation = (lat?: number, lng?: number) => {
    if (!lat || !lng) return;
    window.open(`https://www.google.com/maps?q=${lat},${lng}`, '_blank');
  };

  const loadHistory = async () => {
    if (showHistory) { setShowHistory(false); return; }
    setHistoryLoading(true);
    const res = await getLeaveHistory(record.email);
    const todayMs = new Date().setHours(0, 0, 0, 0);
    const parseLocalDate = (s: string) => {
      const norm = s ? s.replace(/-/g, '/') : '';
      const d = new Date(norm);
      return isNaN(d.getTime()) ? 0 : d.setHours(0, 0, 0, 0);
    };
    const todayLeaves = (res.records || [])
      .filter((r: import('../utils/sheets').LeaveRecord) => {
        if (r.status !== 'Approved') return false;
        const start = parseLocalDate(r.startDate);
        const end   = parseLocalDate(r.endDate);
        return start <= todayMs && todayMs <= end;
      })
      .map((r: import('../utils/sheets').LeaveRecord) => ({
        id: r.id,
        action: r.leaveType,
        date: r.startDate === r.endDate
          ? formatDisplayDate(r.startDate)
          : `${formatDisplayDate(r.startDate)} – ${formatDisplayDate(r.endDate)}`,
        days: `${r.totalDays}d`,
        status: r.status,
      }));
    setHistoryRecords(todayLeaves);
    setHistoryLoading(false);
    setShowHistory(true);
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[80] flex items-end sm:items-center justify-center">
      <div className="bg-slate-900 border border-white/10 rounded-t-2xl sm:rounded-2xl w-full max-w-md max-h-[90dvh] overflow-y-auto slide-up">

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-white/10 sticky top-0 bg-slate-900 z-10">
          <div className="flex items-center gap-3">
            <ProfileAvatar image={record.image} name={record.name} size="md" />
            <div>
              <p className="text-white font-semibold text-sm leading-tight">{record.name}</p>
              {record.designation && (
                <p className="text-white/40 text-[11px] flex items-center gap-1">
                  <Briefcase className="w-2.5 h-2.5" />{record.designation}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-xl bg-white/10 active:scale-90 transition-transform"
          >
            <X className="w-4 h-4 text-white" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">

          {/* Status badge */}
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full ${cfg.badge}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
              {record.status}
            </span>
            {record.department && (
              <span className="text-[11px] text-emerald-400/80 bg-emerald-500/10 px-2 py-0.5 rounded font-medium">
                {record.department}
              </span>
            )}
          </div>

          {/* Time In */}
          {record.timeIn && (
            <div className="bg-white/5 rounded-xl p-3 space-y-2">
              <div className="flex items-center gap-2 mb-1">
                <div className="w-2 h-2 rounded-full bg-emerald-400" />
                <span className="text-white/60 text-xs font-semibold uppercase tracking-wider">Time In</span>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span className="text-white text-sm font-medium">{formatDisplayTime(record.timeIn)}</span>
              </div>
              {record.timeInAddress && (
                <div className="flex items-start gap-2">
                  <MapPin className="w-3.5 h-3.5 text-blue-400 shrink-0 mt-0.5" />
                  <span className="text-white/60 text-xs leading-relaxed">{record.timeInAddress}</span>
                </div>
              )}
              {record.timeInLatitude && record.timeInLongitude && (
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => viewLocation(record.timeInLatitude, record.timeInLongitude)}
                    className="flex-1 flex items-center justify-center gap-1.5 bg-blue-500/15 text-blue-300 border border-blue-400/20 text-xs font-medium py-2 rounded-lg active:scale-95 transition-transform"
                  >
                    <MapPin className="w-3.5 h-3.5" />
                    View Location
                  </button>
                  <button
                    onClick={() => openMaps(record.timeInLatitude, record.timeInLongitude)}
                    className="flex-1 flex items-center justify-center gap-1.5 bg-emerald-500/15 text-emerald-300 border border-emerald-400/20 text-xs font-medium py-2 rounded-lg active:scale-95 transition-transform"
                  >
                    <Navigation className="w-3.5 h-3.5" />
                    Navigate
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Time Out */}
          {record.timeOut && (
            <div className="bg-white/5 rounded-xl p-3 space-y-2">
              <div className="flex items-center gap-2 mb-1">
                <div className="w-2 h-2 rounded-full bg-blue-400" />
                <span className="text-white/60 text-xs font-semibold uppercase tracking-wider">Time Out</span>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                <span className="text-white text-sm font-medium">{formatDisplayTime(record.timeOut)}</span>
              </div>
              {record.timeOutAddress && (
                <div className="flex items-start gap-2">
                  <MapPin className="w-3.5 h-3.5 text-blue-400 shrink-0 mt-0.5" />
                  <span className="text-white/60 text-xs leading-relaxed">{record.timeOutAddress}</span>
                </div>
              )}
              {record.timeOutLatitude && record.timeOutLongitude && (
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => viewLocation(record.timeOutLatitude, record.timeOutLongitude)}
                    className="flex-1 flex items-center justify-center gap-1.5 bg-blue-500/15 text-blue-300 border border-blue-400/20 text-xs font-medium py-2 rounded-lg active:scale-95 transition-transform"
                  >
                    <MapPin className="w-3.5 h-3.5" />
                    View Location
                  </button>
                  <button
                    onClick={() => openMaps(record.timeOutLatitude, record.timeOutLongitude)}
                    className="flex-1 flex items-center justify-center gap-1.5 bg-emerald-500/15 text-emerald-300 border border-emerald-400/20 text-xs font-medium py-2 rounded-lg active:scale-95 transition-transform"
                  >
                    <Navigation className="w-3.5 h-3.5" />
                    Navigate
                  </button>
                </div>
              )}
            </div>
          )}

          {/* No attendance today */}
          {!record.timeIn && record.status !== 'On Leave' && (
            <div className="bg-white/5 rounded-xl p-4 text-center">
              <XCircle className="w-8 h-8 text-white/20 mx-auto mb-2" />
              <p className="text-white/40 text-sm">No attendance recorded today</p>
            </div>
          )}

          {/* Leave history toggle */}
          <button
            onClick={loadHistory}
            className="w-full flex items-center justify-between px-4 py-3 bg-white/5 rounded-xl text-sm font-medium text-white/70 active:scale-[0.98] transition-transform"
          >
            <div className="flex items-center gap-2">
              <History className="w-4 h-4 text-blue-400" />
              Leave History
            </div>
            {historyLoading
              ? <Loader2 className="w-4 h-4 animate-spin text-white/40" />
              : showHistory ? <ChevronUp className="w-4 h-4 text-white/40" /> : <ChevronDown className="w-4 h-4 text-white/40" />}
          </button>

          {showHistory && (
            <div className="space-y-2">
              {historyRecords.length === 0 ? (
                <p className="text-white/30 text-xs text-center py-3">No leave records found</p>
              ) : historyRecords.map((h: { id: string; action: string; date: string; days: string; status: string }) => (
                <div key={h.id} className="bg-white/5 rounded-xl px-4 py-2.5 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-white/80 text-xs font-medium">{h.action}</p>
                    <p className="text-white/40 text-[11px]">{h.date}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-white/50 text-[11px]">{h.days}</p>
                    <p className={`text-[10px] font-semibold ${
                      h.status === 'Approved' ? 'text-emerald-400' :
                      h.status === 'Pending'  ? 'text-amber-400'   : 'text-red-400'
                    }`}>{h.status}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function AttendanceMonitor({ user, onBack }: Props) {
  const [records, setRecords]           = useState<AttendanceMonitorRecord[]>([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState('');
  const [date, setDate]                 = useState('');
  const [filter, setFilter]             = useState<StatusFilter>('All');
  const [search, setSearch]             = useState('');
  const [selected, setSelected]         = useState<AttendanceMonitorRecord | null>(null);
  const [lastRefresh, setLastRefresh]   = useState<Date | null>(null);

  const load = async () => {
    setLoading(true);
    setError('');
    const res = await getAttendanceMonitor(user.email);
    if (res.success) {
      setRecords(res.records);
      setDate(res.date);
      setLastRefresh(new Date());
    } else {
      setError(res.message);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const counts = useMemo(() => ({
    total:     records.length,
    active:    records.filter((r: AttendanceMonitorRecord) => r.status === 'Active').length,
    completed: records.filter((r: AttendanceMonitorRecord) => r.status === 'Completed').length,
    onLeave:   records.filter((r: AttendanceMonitorRecord) => r.status === 'On Leave').length,
    absent:    records.filter((r: AttendanceMonitorRecord) => r.status === 'Absent').length,
  }), [records]);

  const displayed = useMemo(() => {
    let list = records;
    if (filter !== 'All') list = list.filter((r: AttendanceMonitorRecord) => r.status === filter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (r: AttendanceMonitorRecord) => r.name.toLowerCase().includes(q) ||
               r.email.toLowerCase().includes(q) ||
               r.department.toLowerCase().includes(q) ||
               r.designation.toLowerCase().includes(q)
      );
    }
    return list;
  }, [records, filter, search]);

  const summaryCards = [
    { label: 'Total',     value: counts.total,     color: 'text-white',         bg: 'bg-white/8' },
    { label: 'Active',    value: counts.active,     color: 'text-emerald-300',   bg: 'bg-emerald-500/10' },
    { label: 'Completed', value: counts.completed,  color: 'text-blue-300',      bg: 'bg-blue-500/10' },
    { label: 'On Leave',  value: counts.onLeave,    color: 'text-violet-300',    bg: 'bg-violet-500/10' },
    { label: 'Absent',    value: counts.absent,     color: 'text-red-300',       bg: 'bg-red-500/10'     },
  ];

  return (
    <div className="min-h-dvh flex flex-col pb-4">

      {/* Detail modal */}
      {selected && (
        <DetailModal
          record={selected}
          onClose={() => setSelected(null)}
        />
      )}

      {/* Header */}
      <div className="bg-gradient-to-br from-blue-800 via-blue-900 to-indigo-900 px-4 pt-4 pb-5">
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-white/70 hover:text-white active:scale-95 transition-all"
          >
            <ArrowLeft className="w-5 h-5" />
            <span className="text-sm font-medium">Back</span>
          </button>
          <button
            onClick={load}
            disabled={loading}
            className="w-8 h-8 flex items-center justify-center rounded-xl bg-white/10 active:scale-90 transition-transform disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 text-white ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        <div className="flex items-center gap-3 mb-1">
          <div className="w-9 h-9 bg-white/10 rounded-xl flex items-center justify-center">
            <Users className="w-4.5 h-4.5 text-blue-300" />
          </div>
          <div>
            <h1 className="text-white font-bold text-base leading-tight">Attendance Monitor</h1>
            <p className="text-blue-200/60 text-[11px]">
              {date ? `Today · ${date}` : 'Real-time attendance status'}
              {lastRefresh && ` · Updated ${lastRefresh.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`}
            </p>
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-3 gap-2 mt-4">
          {summaryCards.map((c) => (
            <button
              key={c.label}
              onClick={() => setFilter(c.label === 'Total' ? 'All' : c.label as StatusFilter)}
              className={`${c.bg} rounded-xl px-3 py-2.5 text-center active:scale-95 transition-transform border ${
                (filter === c.label || (c.label === 'Total' && filter === 'All'))
                  ? 'border-white/20' : 'border-transparent'
              }`}
            >
              <p className={`text-xl font-bold leading-none ${c.color}`}>{c.value}</p>
              <p className="text-white/50 text-[10px] font-medium mt-0.5">{c.label}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Search + filter */}
      <div className="px-4 py-3 space-y-2 bg-slate-900/80 border-b border-white/10 sticky top-0 z-20">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
          <input
            type="text"
            value={search}
            onChange={(e: { target: { value: string } }) => setSearch(e.target.value)}
            placeholder="Search employee, department…"
            className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-9 py-2.5 text-white text-sm placeholder-white/30 focus:outline-none focus:border-blue-400/50"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2">
              <X className="w-4 h-4 text-white/30" />
            </button>
          )}
        </div>
        <div className="flex gap-1.5 overflow-x-auto pb-0.5 scrollbar-hide">
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`shrink-0 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors active:scale-95 ${
                filter === f
                  ? 'bg-blue-500/20 text-blue-300 border border-blue-400/30'
                  : 'bg-white/5 text-white/50 border border-transparent'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 px-4 py-3 max-w-lg mx-auto w-full">

        {loading && (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
            <p className="text-white/40 text-sm">Loading attendance data…</p>
          </div>
        )}

        {!loading && error && (
          <div className="bg-red-500/10 border border-red-400/20 rounded-2xl p-5 text-center mt-4">
            <XCircle className="w-8 h-8 text-red-400 mx-auto mb-2" />
            <p className="text-red-300 text-sm font-medium mb-1">Failed to load</p>
            <p className="text-red-300/60 text-xs mb-4">{error}</p>
            <button
              onClick={load}
              className="text-xs font-medium text-blue-300 border border-blue-400/20 px-4 py-2 rounded-lg active:scale-95 transition-transform"
            >
              Retry
            </button>
          </div>
        )}

        {!loading && !error && displayed.length === 0 && (
          <div className="text-center py-20">
            <Users className="w-12 h-12 text-white/10 mx-auto mb-3" />
            <p className="text-white/30 text-sm">
              {search || filter !== 'All' ? 'No employees match the filter' : 'No employee data available'}
            </p>
          </div>
        )}

        {!loading && !error && displayed.length > 0 && (
          <div className="space-y-2">
            {displayed.map((rec: AttendanceMonitorRecord) => {
              const cfg = STATUS_CONFIG[rec.status] || STATUS_CONFIG['Absent'];
              const StatusIcon = cfg.icon;
              return (
                <button
                  key={rec.email}
                  onClick={() => setSelected(rec)}
                  className={`w-full bg-white/5 border ${cfg.card} rounded-2xl p-3.5 flex items-center gap-3 text-left active:scale-[0.98] transition-transform`}
                >
                  <div className="relative shrink-0">
                    <ProfileAvatar image={rec.image} name={rec.name} size="md" />
                    <span className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-slate-900 ${cfg.dot}`} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-0.5">
                      <p className="text-white font-semibold text-sm truncate">{rec.name}</p>
                      <span className={`shrink-0 inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ${cfg.badge}`}>
                        <StatusIcon className="w-2.5 h-2.5" />
                        {rec.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      {rec.department && (
                        <span className="flex items-center gap-0.5 text-[10px] text-emerald-400/70">
                          <Building2 className="w-2.5 h-2.5" />{rec.department}
                        </span>
                      )}
                      {rec.timeIn && (
                        <span className="flex items-center gap-0.5 text-[10px] text-white/40">
                          <Clock className="w-2.5 h-2.5" />IN {formatDisplayTime(rec.timeIn)}
                        </span>
                      )}
                      {rec.timeOut && (
                        <span className="flex items-center gap-0.5 text-[10px] text-white/40">
                          <Clock className="w-2.5 h-2.5" />OUT {formatDisplayTime(rec.timeOut)}
                        </span>
                      )}
                    </div>
                    {rec.timeInAddress && !rec.timeOut && (
                      <p className="text-white/30 text-[10px] truncate mt-0.5">
                        <MapPin className="w-2.5 h-2.5 inline-block mr-0.5" />
                        {rec.timeInAddress}
                      </p>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
