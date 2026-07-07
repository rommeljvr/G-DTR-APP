import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ArrowLeft, RefreshCw, Loader2, Search, CheckCircle2, AlertCircle,
  ChevronDown, ChevronUp, X, Clock, MapPin, Calendar, Coffee,
  FileText, Home, Smartphone, Eye,
} from 'lucide-react';
import { User, GeneratedDTR, GeneratedDTRDay } from '../types';
import { getGeneratedDTRList, getGeneratedDTR, acknowledgeDTRNew } from '../utils/sheets';
import DriveImage from './DriveImage';
import EmployeeAvatar from './EmployeeAvatar';

interface Props {
  user: User;
  onBack: () => void;
}

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

function fmtDate(val: string): string {
  if (!val) return '—';
  const d = new Date(val);
  if (isNaN(d.getTime())) return val;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtTime(val: string): string {
  if (!val) return '—';
  const isoMatch = val.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (isoMatch) {
    const h = parseInt(isoMatch[4], 10), m = isoMatch[5];
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    return `${h12}:${m} ${ampm}`;
  }
  if (/^\d{1,2}:\d{2}/.test(val)) return val;
  const d = new Date(val.replace(/-/g, '/'));
  if (!isNaN(d.getTime())) return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  return val;
}

function fmtHours(h: number): string {
  if (!h) return '—';
  const hrs = Math.floor(h);
  const mins = Math.round((h - hrs) * 60);
  return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
}

const CLASS_BADGE: Record<string, string> = {
  'Present':          'bg-emerald-500/15 text-emerald-300 border-emerald-400/20',
  'Late':             'bg-amber-500/15 text-amber-300 border-amber-400/20',
  'Absent':           'bg-red-500/15 text-red-300 border-red-400/20',
  'Half Day':         'bg-orange-500/15 text-orange-300 border-orange-400/20',
  'Official Business':'bg-blue-500/15 text-blue-300 border-blue-400/20',
  'Holiday':          'bg-violet-500/15 text-violet-300 border-violet-400/20',
  'Rest Day':         'bg-slate-500/15 text-slate-400 border-slate-400/20',
  'Approved Leave':   'bg-teal-500/15 text-teal-300 border-teal-400/20',
  'Work From Home':   'bg-indigo-500/15 text-indigo-300 border-indigo-400/20',
};

function extractDriveId(url: string): string | null {
  if (!url) return null;
  const m = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
  return m ? m[1] : null;
}

const STATUS_STYLE: Record<string, string> = {
  'Generated':        'bg-blue-500/15 text-blue-300 border-blue-400/20',
  'Under Validation': 'bg-amber-500/15 text-amber-300 border-amber-400/20',
  'Ready for Review': 'bg-violet-500/15 text-violet-300 border-violet-400/20',
  'Acknowledged':     'bg-emerald-500/15 text-emerald-300 border-emerald-400/20',
  'Reopened':         'bg-rose-500/15 text-rose-300 border-rose-400/20',
};

// ── Read-only Day Row for employee review ────────────────────────────────────
function ReviewDayRow({ day }: { day: GeneratedDTRDay }) {
  const [expanded, setExpanded] = useState(false);
  const cls = day.attendanceClassification || 'Present';

  return (
    <div className="border border-white/8 rounded-xl overflow-hidden">
      {/* Summary row */}
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-white/3 transition-colors"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-white text-xs font-medium">{day.date}</span>
            <span className="text-white/30 text-[10px]">{day.dayOfWeek}</span>
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-white/50 text-[11px]">
              {day.timeIn ? fmtTime(day.originalRecord?.timeIn || day.timeIn) : '—'} → {day.timeOut ? fmtTime(day.originalRecord?.timeOut || day.timeOut) : '—'}
            </span>
            <span className="text-white/30 text-[10px]">{fmtHours(day.totalHoursWorked)}</span>
          </div>
        </div>
        <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-md border ${CLASS_BADGE[cls] || 'bg-white/10 text-white/50 border-white/10'}`}>
          {cls}
        </span>
        {expanded ? <ChevronUp className="w-3.5 h-3.5 text-white/30 shrink-0" /> : <ChevronDown className="w-3.5 h-3.5 text-white/30 shrink-0" />}
      </button>

      {/* Expanded details */}
      {expanded && (
        <div className="border-t border-white/5 px-3 py-3 space-y-3 bg-white/[0.02]">
          {/* Late info */}
          {(day.lateHours > 0 || day.lateMinutes > 0) && (
            <div className="flex items-center gap-2">
              <Clock className="w-3.5 h-3.5 text-amber-400" />
              <span className="text-amber-300 text-xs">Late: {day.lateHours}h {day.lateMinutes}m</span>
            </div>
          )}

          {/* Location */}
          {day.originalRecord?.address && (
            <div className="flex items-start gap-2">
              <MapPin className="w-3.5 h-3.5 text-blue-400 shrink-0 mt-0.5" />
              <span className="text-white/50 text-xs leading-relaxed">{day.originalRecord.address}</span>
            </div>
          )}

          {/* Device */}
          {day.originalRecord?.deviceInfo && (
            <div className="flex items-center gap-2">
              <Smartphone className="w-3.5 h-3.5 text-white/30" />
              <span className="text-white/30 text-xs">{day.originalRecord.deviceInfo}</span>
            </div>
          )}

          {/* Photos */}
          {(day.originalRecord?.timeInImageUrl || day.originalRecord?.timeOutImageUrl) && (
            <div className="flex gap-2">
              {day.originalRecord?.timeInImageUrl && (
                <div className="w-16 h-16 rounded-lg overflow-hidden border border-white/10">
                  <DriveImage imageId={day.originalRecord.timeInImageId || extractDriveId(day.originalRecord.timeInImageUrl) || undefined} alt="Time In" className="w-full h-full object-cover" />
                </div>
              )}
              {day.originalRecord?.timeOutImageUrl && (
                <div className="w-16 h-16 rounded-lg overflow-hidden border border-white/10">
                  <DriveImage imageId={day.originalRecord.timeOutImageId || extractDriveId(day.originalRecord.timeOutImageUrl) || undefined} alt="Time Out" className="w-full h-full object-cover" />
                </div>
              )}
            </div>
          )}

          {/* Meal Allowances */}
          {day.mealAllowances && day.mealAllowances.length > 0 && (
            <div className="space-y-1">
              <p className="text-white/40 text-[10px] font-medium flex items-center gap-1">
                <Coffee className="w-3 h-3" /> Meal Allowance ({day.mealAllowances.length})
              </p>
              {day.mealAllowances.map(ma => (
                <div key={ma.id} className="text-white/40 text-[10px] pl-4">
                  #{ma.sequence} — {ma.address || 'No location'} {ma.remarks && `• ${ma.remarks}`}
                </div>
              ))}
            </div>
          )}

          {/* Leaves */}
          {day.leaves && day.leaves.length > 0 && (
            <div className="space-y-1">
              <p className="text-white/40 text-[10px] font-medium flex items-center gap-1">
                <Calendar className="w-3 h-3" /> Leave
              </p>
              {day.leaves.map(l => (
                <div key={l.id} className="text-white/40 text-[10px] pl-4">
                  {l.leaveType} • {l.status} • {l.totalDays}d
                </div>
              ))}
            </div>
          )}

          {/* WFH */}
          {day.wfh && day.wfh.length > 0 && (
            <div className="space-y-1">
              <p className="text-white/40 text-[10px] font-medium flex items-center gap-1">
                <Home className="w-3 h-3" /> Work From Home
              </p>
              {day.wfh.map(w => (
                <div key={w.id} className="text-white/40 text-[10px] pl-4">
                  {w.workDescription} • {w.status}
                </div>
              ))}
            </div>
          )}

          {/* Remarks */}
          {day.attendanceRemarks && (
            <div className="text-white/40 text-xs italic border-l-2 border-white/10 pl-2">
              {day.attendanceRemarks}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────
export default function DTRAcknowledgement({ user, onBack }: Props) {
  const [records, setRecords] = useState<GeneratedDTR[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<GeneratedDTR | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [acknowledging, setAcknowledging] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const [filterSearch, setFilterSearch] = useState('');
  const [confirmAck, setConfirmAck] = useState(false);

  const showToast = (type: 'success' | 'error', msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3500);
  };

  const load = useCallback(async () => {
    setLoading(true);
    const res = await getGeneratedDTRList(user.email);
    if (res.success && res.records) {
      setRecords(res.records);
    }
    setLoading(false);
  }, [user.email]);

  useEffect(() => { load(); }, [load]);

  const openDTR = async (id: string) => {
    setLoadingDetail(true);
    const res = await getGeneratedDTR(id, user.email);
    setLoadingDetail(false);
    if (res.success && res.data) {
      setSelected(res.data);
    } else {
      showToast('error', res.message || 'Failed to load DTR');
    }
  };

  const handleAcknowledge = async () => {
    if (!selected) return;
    setAcknowledging(true);
    const res = await acknowledgeDTRNew(selected.id, user.email);
    setAcknowledging(false);
    setConfirmAck(false);
    if (res.success) {
      showToast('success', 'DTR acknowledged successfully');
      setSelected({ ...selected, status: 'Acknowledged' });
      load(); // refresh list
    } else {
      showToast('error', res.message || 'Failed to acknowledge');
    }
  };

  // Filter records
  const filtered = useMemo(() => {
    if (!filterSearch.trim()) return records;
    const q = filterSearch.toLowerCase();
    return records.filter(r =>
      MONTHS[r.month - 1]?.toLowerCase().includes(q) ||
      String(r.year).includes(q) ||
      r.status.toLowerCase().includes(q) ||
      r.cutOff.toLowerCase().includes(q)
    );
  }, [records, filterSearch]);

  // ── Detail View ──
  if (selected) {
    const isLocked = selected.status === 'Acknowledged';
    const canAcknowledge = selected.status === 'Ready for Review' || selected.status === 'Reopened';

    return (
      <div className="min-h-dvh bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex flex-col pb-20">
        {/* Toast */}
        {toast && (
          <div className={`fixed top-4 left-4 right-4 z-50 rounded-xl px-4 py-3 text-sm font-medium text-white shadow-2xl border flex items-center gap-2 ${
            toast.type === 'success' ? 'bg-emerald-600/90 border-emerald-400/30' : 'bg-red-600/90 border-red-400/30'
          }`}>
            {toast.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
            {toast.msg}
          </div>
        )}

        {/* Header */}
        <div className="bg-slate-900/80 backdrop-blur-xl border-b border-white/10 px-4 pt-12 pb-4 sticky top-0 z-30">
          <div className="flex items-center gap-3">
            <button onClick={() => setSelected(null)} className="w-8 h-8 flex items-center justify-center rounded-xl bg-white/10 active:scale-90 transition-transform">
              <ArrowLeft className="w-4 h-4 text-white" />
            </button>
            <div className="flex-1 min-w-0">
              <h1 className="text-white font-bold text-sm truncate">DTR Review</h1>
              <p className="text-white/40 text-xs">
                {MONTHS[selected.month - 1]} {selected.year} • {selected.cutOff} Cut-Off
              </p>
            </div>
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${STATUS_STYLE[selected.status] || 'bg-white/10 text-white/50 border-white/10'}`}>
              {selected.status}
            </span>
          </div>
        </div>

        {/* Summary Card */}
        <div className="px-4 pt-4">
          <div className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-3">
            <div className="flex items-center gap-3">
              <EmployeeAvatar src={selected.employeeImage} name={selected.employeeName} size="md" />
              <div className="flex-1 min-w-0">
                <p className="text-white font-semibold text-sm truncate">{selected.employeeName}</p>
                <p className="text-white/40 text-xs">{selected.department} • {selected.designation}</p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-white/5 rounded-xl p-2 text-center">
                <p className="text-emerald-300 text-sm font-bold">{selected.summary?.presentDays || 0}</p>
                <p className="text-white/30 text-[9px]">Present</p>
              </div>
              <div className="bg-white/5 rounded-xl p-2 text-center">
                <p className="text-red-300 text-sm font-bold">{selected.summary?.absentDays || 0}</p>
                <p className="text-white/30 text-[9px]">Absent</p>
              </div>
              <div className="bg-white/5 rounded-xl p-2 text-center">
                <p className="text-blue-300 text-sm font-bold">{fmtHours(selected.summary?.totalHoursWorked || 0)}</p>
                <p className="text-white/30 text-[9px]">Total Hrs</p>
              </div>
            </div>
            {selected.summary && (selected.summary.totalLateHours > 0 || selected.summary.totalLateMinutes > 0) && (
              <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-400/20 rounded-xl px-3 py-2">
                <Clock className="w-3.5 h-3.5 text-amber-400" />
                <span className="text-amber-300 text-xs">Total Late: {selected.summary.totalLateHours}h {selected.summary.totalLateMinutes}m</span>
              </div>
            )}
            {isLocked && (
              <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-400/20 rounded-xl px-3 py-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-emerald-300 text-xs">Acknowledged {fmtDate(selected.acknowledgedAt || '')}</span>
              </div>
            )}
          </div>
        </div>

        {/* Day Records */}
        <div className="px-4 pt-4 space-y-2">
          <h2 className="text-white/60 text-xs font-semibold uppercase tracking-wider">Daily Records</h2>
          {selected.days.map(day => (
            <ReviewDayRow key={day.date} day={day} />
          ))}
        </div>

        {/* Acknowledge Button */}
        {canAcknowledge && (
          <div className="px-4 pt-6">
            <button
              onClick={() => setConfirmAck(true)}
              className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm py-3.5 rounded-xl active:scale-[0.98] transition-all shadow-lg shadow-emerald-500/20"
            >
              <CheckCircle2 className="w-4 h-4" />
              Acknowledge DTR
            </button>
            <p className="text-white/30 text-[10px] text-center mt-2">
              By acknowledging, you confirm this DTR is accurate. It will be locked from further changes.
            </p>
          </div>
        )}

        {/* Confirmation Modal */}
        {confirmAck && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4" onClick={e => { if (e.target === e.currentTarget) setConfirmAck(false); }}>
            <div className="w-full max-w-sm bg-slate-900 border border-white/10 rounded-3xl p-5 space-y-4 shadow-2xl">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                </div>
                <div>
                  <h3 className="text-white font-bold text-sm">Confirm Acknowledgement</h3>
                  <p className="text-white/40 text-xs">This action cannot be undone by you.</p>
                </div>
              </div>
              <p className="text-white/60 text-xs leading-relaxed">
                You are about to acknowledge your DTR for <span className="text-white font-medium">{MONTHS[selected.month - 1]} {selected.year} ({selected.cutOff} Cut-Off)</span>. 
                Once acknowledged, this record will be locked. If you find any issues after, please contact your administrator.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setConfirmAck(false)}
                  className="flex-1 py-2.5 rounded-xl text-white/60 text-sm font-medium bg-white/5 border border-white/10 active:scale-95 transition-transform"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAcknowledge}
                  disabled={acknowledging}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-semibold active:scale-95 transition-transform disabled:opacity-50"
                >
                  {acknowledging ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  {acknowledging ? 'Processing…' : 'Acknowledge'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── List View ──
  return (
    <div className="min-h-dvh bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex flex-col pb-20">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 left-4 right-4 z-50 rounded-xl px-4 py-3 text-sm font-medium text-white shadow-2xl border flex items-center gap-2 ${
          toast.type === 'success' ? 'bg-emerald-600/90 border-emerald-400/30' : 'bg-red-600/90 border-red-400/30'
        }`}>
          {toast.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="bg-slate-900/80 backdrop-blur-xl border-b border-white/10 px-4 pt-12 pb-4 sticky top-0 z-30">
        <div className="flex items-center gap-3 mb-3">
          <button onClick={onBack} className="w-8 h-8 flex items-center justify-center rounded-xl bg-white/10 active:scale-90 transition-transform">
            <ArrowLeft className="w-4 h-4 text-white" />
          </button>
          <div className="flex-1">
            <h1 className="text-white font-bold text-base">My DTR</h1>
            <p className="text-white/40 text-xs">Review & Acknowledge</p>
          </div>
          <button onClick={load} className="w-8 h-8 flex items-center justify-center rounded-xl bg-white/10 active:scale-90 transition-transform">
            <RefreshCw className={`w-4 h-4 text-white ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Search */}
        <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-3 py-2">
          <Search className="w-3.5 h-3.5 text-white/30 shrink-0" />
          <input
            value={filterSearch}
            onChange={e => setFilterSearch(e.target.value)}
            placeholder="Search by month, year, status…"
            className="bg-transparent text-white text-xs flex-1 outline-none placeholder-white/30"
          />
          {filterSearch && <button onClick={() => setFilterSearch('')}><X className="w-3.5 h-3.5 text-white/30" /></button>}
        </div>
      </div>

      {/* List */}
      <div className="flex-1 px-4 pt-4 space-y-3">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
            <p className="text-white/40 text-sm">Loading your DTR records…</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <FileText className="w-12 h-12 text-white/10" />
            <p className="text-white/40 text-sm">No DTR records found</p>
            <p className="text-white/20 text-xs">Your generated DTRs will appear here</p>
          </div>
        ) : filtered.map(r => {
          const needsAction = r.status === 'Ready for Review' || r.status === 'Reopened';
          return (
            <button
              key={r.id}
              onClick={() => openDTR(r.id)}
              disabled={loadingDetail}
              className="w-full text-left bg-white/5 border border-white/10 rounded-2xl overflow-hidden hover:bg-white/[0.07] transition-colors active:scale-[0.99] disabled:opacity-50"
            >
              <div className="px-4 pt-4 pb-3">
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-semibold text-sm">
                      {MONTHS[r.month - 1]} {r.year}
                    </p>
                    <p className="text-white/40 text-xs">
                      {r.cutOff} Cut-Off • {r.coverageStart} – {r.coverageEnd}
                    </p>
                  </div>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border shrink-0 ${STATUS_STYLE[r.status] || 'bg-white/10 text-white/50 border-white/10'}`}>
                    {r.status}
                  </span>
                </div>
              </div>
              <div className="px-4 pb-3 border-t border-white/5 pt-2.5 flex items-center gap-3">
                <div className="flex items-center gap-1.5 text-white/30 text-[10px]">
                  <Clock className="w-3 h-3" />
                  Generated {fmtDate(r.generatedAt)}
                </div>
                {needsAction && (
                  <span className="ml-auto flex items-center gap-1 text-violet-300 text-[10px] font-medium bg-violet-500/15 border border-violet-400/20 px-2 py-0.5 rounded-full">
                    <Eye className="w-3 h-3" />
                    Review needed
                  </span>
                )}
                {r.status === 'Acknowledged' && (
                  <span className="ml-auto flex items-center gap-1 text-emerald-300 text-[10px] font-medium">
                    <CheckCircle2 className="w-3 h-3" />
                    Done
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
