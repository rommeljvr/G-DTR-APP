import { useState } from 'react';
import {
  ArrowLeft, CheckCircle2, AlertCircle, Clock, MapPin,
  User as UserIcon, Building2, Briefcase, ChevronDown,
  ChevronUp, X, Loader2, RotateCcw, FileText, Navigation,
  ThumbsUp, MessageSquare, Lock, ShieldCheck,
} from 'lucide-react';
import { User, DTRRecord, DTRDayRecord, DTRIssueType, AttendanceStatus } from '../types';
import { acknowledgeDTR, reportDTRIssue } from '../utils/sheets';
import DriveImage from './DriveImage';

function extractDriveId(url: string): string | null {
  if (!url) return null;
  const m = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
  return m ? m[1] : null;
}

interface Props {
  dtr: DTRRecord;
  user: User;
  isAdmin: boolean;
  onBack: () => void;
  onRegenerate?: (id: string) => void;
  onResolveIssue?: (issueId: string) => void;
}

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

const ISSUE_TYPES: DTRIssueType[] = [
  'Missing Time In','Missing Time Out','Incorrect Schedule','Incorrect Leave',
  'Wrong Attendance Status','Missing Photo','Incorrect Location','Other',
];

const STATUS_BADGE: Record<AttendanceStatus, string> = {
  'Present':          'bg-emerald-500/15 text-emerald-300 border-emerald-400/20',
  'Late':             'bg-amber-500/15 text-amber-300 border-amber-400/20',
  'Absent':           'bg-red-500/15 text-red-300 border-red-400/20',
  'Half Day':         'bg-orange-500/15 text-orange-300 border-orange-400/20',
  'Official Business':'bg-blue-500/15 text-blue-300 border-blue-400/20',
  'Holiday':          'bg-violet-500/15 text-violet-300 border-violet-400/20',
  'Rest Day':         'bg-slate-500/15 text-slate-400 border-slate-400/20',
  'Approved Leave':   'bg-teal-500/15 text-teal-300 border-teal-400/20',
  'Missing Time In':  'bg-rose-500/15 text-rose-300 border-rose-400/20',
  'Missing Time Out': 'bg-pink-500/15 text-pink-300 border-pink-400/20',
};

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
  const d = new Date(val.replace(/-/g, '/'));
  if (!isNaN(d.getTime())) {
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  }
  return val;
}

function fmtHours(h: number): string {
  if (!h) return '—';
  const hrs = Math.floor(h);
  const mins = Math.round((h - hrs) * 60);
  return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
}

function DayRow({ day, idx }: { day: DTRDayRecord; idx: number }) {
  const [expanded, setExpanded] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const isRestOrHoliday = day.status === 'Rest Day' || day.status === 'Holiday';

  return (
    <>
      {lightbox && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          onClick={() => setLightbox(null)}>
          <img src={lightbox} alt="Attendance photo" className="max-w-full max-h-[80vh] rounded-2xl object-contain" />
          <button className="absolute top-4 right-4 w-10 h-10 flex items-center justify-center rounded-full bg-white/10">
            <X className="w-5 h-5 text-white" />
          </button>
        </div>
      )}

      <div className={`border-b border-white/5 ${isRestOrHoliday ? 'opacity-50' : ''}`}>
        <button
          className="w-full flex items-center gap-2 px-4 py-3 active:bg-white/5 transition-colors"
          onClick={() => !isRestOrHoliday && setExpanded(v => !v)}
        >
          <span className="w-7 text-center text-white/30 text-xs font-medium shrink-0">{idx + 1}</span>
          <div className="flex-1 min-w-0 text-left">
            {day.workPeriodLabel ? (
              <>
                <p className="text-white text-xs font-medium leading-tight">{fmtDate(day.date)}</p>
                <p className="text-amber-300/70 text-[10px]">→ {fmtDate(day.timeOutDate ?? '')}</p>
              </>
            ) : (
              <>
                <p className="text-white text-xs font-medium">{fmtDate(day.date)}</p>
                <p className="text-white/30 text-[10px]">{day.dayOfWeek}</p>
              </>
            )}
          </div>
          <div className="text-right mr-2">
            <p className="text-white text-xs">{fmtTime(day.timeIn ?? '')}</p>
            <p className="text-white/50 text-[10px]">
              {fmtTime(day.timeOut ?? '')}
              {day.timeOutDate && <span className="text-amber-300/60 ml-1">+1</span>}
            </p>
          </div>
          <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full border shrink-0 ${STATUS_BADGE[day.status] || 'bg-white/10 text-white/40 border-white/10'}`}>
            {day.status}
          </span>
          {!isRestOrHoliday && (
            expanded
              ? <ChevronUp className="w-3.5 h-3.5 text-white/30 shrink-0" />
              : <ChevronDown className="w-3.5 h-3.5 text-white/30 shrink-0" />
          )}
        </button>

        {expanded && (
          <div className="px-4 pb-4 space-y-3 bg-white/3">
            {/* Cross-day period label */}
            {day.workPeriodLabel && (
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-400/20 text-amber-300">
                  Overnight / Multi-day Shift
                </span>
              </div>
            )}

            {/* Working hours */}
            {!!day.workingHours && (
              <div className="flex items-center gap-2">
                <Clock className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                <span className="text-white/60 text-xs">Working Hours: <span className="text-white font-medium">{fmtHours(day.workingHours)}</span></span>
              </div>
            )}

            {/* Address */}
            {day.address && (
              <div className="flex items-start gap-2">
                <MapPin className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                <span className="text-white/60 text-xs leading-relaxed">{day.address}</span>
              </div>
            )}

            {/* GPS */}
            {!!(day.latitude && day.longitude) && (
              <div className="flex items-center gap-2">
                <Navigation className="w-3.5 h-3.5 text-violet-400 shrink-0" />
                <a
                  href={`https://maps.google.com/?q=${day.latitude},${day.longitude}`}
                  target="_blank" rel="noopener noreferrer"
                  className="text-violet-300 text-xs underline"
                >
                  {day.latitude.toFixed(5)}, {day.longitude.toFixed(5)}
                </a>
              </div>
            )}

            {/* Photos */}
            {(day.timeInImageId || day.timeInImageUrl || day.timeOutImageId || day.timeOutImageUrl) && (
              <div className="flex gap-2">
                {(day.timeInImageId || day.timeInImageUrl) && (
                  <div className="flex flex-col items-center gap-1">
                    <DriveImage
                      imageId={day.timeInImageId || extractDriveId(day.timeInImageUrl ?? '') || undefined}
                      alt="Time In"
                      className="w-16 h-16 rounded-xl"
                      thumbnail
                      onClick={(src) => setLightbox(src)}
                    />
                    <span className="text-white/30 text-[9px]">Time In</span>
                  </div>
                )}
                {(day.timeOutImageId || day.timeOutImageUrl) && (
                  <div className="flex flex-col items-center gap-1">
                    <DriveImage
                      imageId={day.timeOutImageId || extractDriveId(day.timeOutImageUrl ?? '') || undefined}
                      alt="Time Out"
                      className="w-16 h-16 rounded-xl"
                      thumbnail
                      onClick={(src) => setLightbox(src)}
                    />
                    <span className="text-white/30 text-[9px]">Time Out</span>
                  </div>
                )}
              </div>
            )}

            {/* Timestamps */}
            <div className="grid grid-cols-2 gap-2">
              {day.timeInTimestamp && (
                <div className="bg-white/5 rounded-xl p-2">
                  <p className="text-white/30 text-[9px] mb-0.5">Time In Timestamp</p>
                  <p className="text-white/70 text-[10px]">{fmtDate(day.timeInTimestamp)} {fmtTime(day.timeInTimestamp)}</p>
                </div>
              )}
              {day.timeOutTimestamp && (
                <div className="bg-white/5 rounded-xl p-2">
                  <p className="text-white/30 text-[9px] mb-0.5">Time Out Timestamp</p>
                  <p className="text-white/70 text-[10px]">{fmtDate(day.timeOutTimestamp)} {fmtTime(day.timeOutTimestamp)}</p>
                </div>
              )}
            </div>

            {day.remarks && (
              <p className="text-white/40 text-xs italic">Remarks: {day.remarks}</p>
            )}
          </div>
        )}
      </div>
    </>
  );
}

export default function DTRView({ dtr, user, isAdmin, onBack, onRegenerate, onResolveIssue }: Props) {
  const [showAckModal, setShowAckModal]     = useState(false);
  const [showIssueModal, setShowIssueModal] = useState(false);
  const [issueType, setIssueType]           = useState<DTRIssueType>('Missing Time In');
  const [issueComment, setIssueComment]     = useState('');
  const [submitting, setSubmitting]         = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  // Local ack state — updates optimistically so UI reflects immediately
  const [ackState, setAckState] = useState<{
    acknowledgedAt: string; acknowledgedBy: string; acknowledgedRole: string;
  } | null>(
    dtr.acknowledgedAt
      ? { acknowledgedAt: dtr.acknowledgedAt, acknowledgedBy: dtr.acknowledgedBy ?? '', acknowledgedRole: dtr.acknowledgedRole ?? '' }
      : null
  );

  const isOwner = user.email.toLowerCase() === dtr.employeeEmail.toLowerCase();
  const isFinalized = !!ackState;
  const canAcknowledge = (isOwner || isAdmin) && !isFinalized && dtr.status !== 'Regenerated';

  const showToast = (type: 'success' | 'error', msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3500);
  };

  const handleAcknowledge = async () => {
    setSubmitting(true);
    const res = await acknowledgeDTR(dtr.id, user.email);
    setSubmitting(false);
    setShowAckModal(false);
    if (res.success) {
      setAckState({
        acknowledgedAt:   res.acknowledgedAt   ?? new Date().toISOString(),
        acknowledgedBy:   res.acknowledgedBy   ?? user.email,
        acknowledgedRole: res.acknowledgedRole ?? (isAdmin ? 'Administrator' : 'Employee'),
      });
      showToast('success', 'DTR acknowledged and finalized');
    } else {
      showToast('error', res.message);
    }
  };

  const handleReportIssue = async () => {
    if (!issueComment.trim()) { showToast('error', 'Please describe the issue'); return; }
    setSubmitting(true);
    const res = await reportDTRIssue({
      dtrId: dtr.id, employeeEmail: user.email, issueType, comments: issueComment,
    });
    setSubmitting(false);
    setShowIssueModal(false);
    if (res.success) { showToast('success', 'Issue submitted'); setIssueComment(''); }
    else showToast('error', res.message);
  };

  const s = dtr.summary;
  const monthName = MONTHS[(dtr.month || 1) - 1];
  const cutOffRange = dtr.cutOff === '1st'
    ? `${monthName} 1–15, ${dtr.year}`
    : `${monthName} 16–${new Date(dtr.year, dtr.month, 0).getDate()}, ${dtr.year}`;

  const summaryCards = [
    { label: 'Working Days', value: s.totalWorkingDays, color: 'text-white' },
    { label: 'Present', value: s.daysPresent, color: 'text-emerald-300' },
    { label: 'Absent', value: s.daysAbsent, color: 'text-red-300' },
    { label: 'On Leave', value: s.approvedLeave, color: 'text-teal-300' },
    { label: 'Late', value: s.lateCount, color: 'text-amber-300' },
    { label: 'Missing In', value: s.missingTimeIn, color: 'text-rose-300' },
    { label: 'Missing Out', value: s.missingTimeOut, color: 'text-pink-300' },
    { label: 'Total Hours', value: fmtHours(s.totalHoursWorked), color: 'text-blue-300' },
  ];

  return (
    <div className="min-h-dvh bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex flex-col pb-24">
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
          <button onClick={onBack} className="w-8 h-8 flex items-center justify-center rounded-xl bg-white/10 active:scale-90 transition-transform">
            <ArrowLeft className="w-4 h-4 text-white" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-white font-bold text-base truncate">Daily Time Record</h1>
            <p className="text-white/40 text-xs truncate">{cutOffRange}</p>
          </div>
          <span className={`text-[10px] font-semibold px-2 py-1 rounded-full border flex items-center gap-1 ${
            isFinalized ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400/20' :
            dtr.status === 'Returned for Review' ? 'bg-amber-500/20 text-amber-300 border-amber-400/20' :
            'bg-blue-500/20 text-blue-300 border-blue-400/20'
          }`}>
            {isFinalized && <Lock className="w-2.5 h-2.5" />}
            {isFinalized ? 'Acknowledged' : dtr.status}
          </span>
        </div>
      </div>

      {/* Finalized banner */}
      {isFinalized && (
        <div className="mx-4 mt-3 flex items-center gap-2.5 bg-emerald-500/10 border border-emerald-400/20 rounded-2xl px-4 py-3">
          <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-emerald-300 text-xs font-semibold">Finalized &amp; Locked</p>
            <p className="text-emerald-300/50 text-[10px]">This DTR has been officially acknowledged. No further changes are permitted.</p>
          </div>
        </div>
      )}

      <div className="flex-1 px-4 pt-4 space-y-4">

        {/* Employee info card */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center shrink-0">
              <UserIcon className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white font-semibold text-sm truncate">{dtr.employeeName}</p>
              <p className="text-white/40 text-xs truncate">{dtr.employeeEmail}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            {dtr.employeeNumber && (
              <div className="flex items-center gap-1.5 text-white/50">
                <FileText className="w-3 h-3 text-white/30" />
                <span>#{dtr.employeeNumber}</span>
              </div>
            )}
            {dtr.department && (
              <div className="flex items-center gap-1.5 text-white/50">
                <Building2 className="w-3 h-3 text-white/30" />
                <span>{dtr.department}</span>
              </div>
            )}
            {dtr.designation && (
              <div className="flex items-center gap-1.5 text-white/50">
                <Briefcase className="w-3 h-3 text-white/30" />
                <span>{dtr.designation}</span>
              </div>
            )}
            {dtr.branch && (
              <div className="flex items-center gap-1.5 text-white/50">
                <MapPin className="w-3 h-3 text-white/30" />
                <span>{dtr.branch}</span>
              </div>
            )}
          </div>
          <div className="mt-3 pt-3 border-t border-white/5 grid grid-cols-2 gap-2 text-xs">
            <div>
              <p className="text-white/30 text-[10px]">Cut-Off Period</p>
              <p className="text-white/70">{dtr.cutOff} Cut-Off</p>
            </div>
            <div>
              <p className="text-white/30 text-[10px]">Coverage</p>
              <p className="text-white/70">{fmtDate(dtr.coverageStart)} – {fmtDate(dtr.coverageEnd)}</p>
            </div>
            <div>
              <p className="text-white/30 text-[10px]">Generated</p>
              <p className="text-white/70">{fmtDate(dtr.generatedAt)}</p>
            </div>
            <div>
              <p className="text-white/30 text-[10px]">By</p>
              <p className="text-white/70 truncate">{dtr.generatedBy}</p>
            </div>
            {ackState && (
              <div className="col-span-2 bg-emerald-500/8 border border-emerald-400/15 rounded-xl p-2.5 space-y-1.5">
                <div className="flex items-center gap-1.5 mb-1">
                  <ShieldCheck className="w-3 h-3 text-emerald-400" />
                  <span className="text-emerald-300 text-[10px] font-semibold uppercase tracking-wider">Acknowledgment Details</span>
                </div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                  <div>
                    <p className="text-white/30 text-[9px]">Acknowledged By</p>
                    <p className="text-white/70 text-[10px] truncate">{ackState.acknowledgedBy}</p>
                  </div>
                  <div>
                    <p className="text-white/30 text-[9px]">Role</p>
                    <p className="text-emerald-300 text-[10px] font-medium">{ackState.acknowledgedRole || '—'}</p>
                  </div>
                  <div>
                    <p className="text-white/30 text-[9px]">Date</p>
                    <p className="text-white/70 text-[10px]">{fmtDate(ackState.acknowledgedAt)}</p>
                  </div>
                  <div>
                    <p className="text-white/30 text-[9px]">Time</p>
                    <p className="text-white/70 text-[10px]">{fmtTime(ackState.acknowledgedAt)}</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-white/30 text-[9px]">Revision</p>
                    <p className="text-white/70 text-[10px]">Version {dtr.version}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Summary cards */}
        <div>
          <h2 className="text-white/50 text-xs font-semibold uppercase tracking-wider mb-2">Attendance Summary</h2>
          <div className="grid grid-cols-4 gap-2">
            {summaryCards.map(sc => (
              <div key={sc.label} className="bg-white/5 border border-white/5 rounded-xl p-2 text-center">
                <p className={`text-base font-bold ${sc.color}`}>{sc.value}</p>
                <p className="text-white/30 text-[9px] leading-tight mt-0.5">{sc.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Attendance table */}
        <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
            <h2 className="text-white/70 text-xs font-semibold uppercase tracking-wider">Attendance Log</h2>
            <span className="text-white/30 text-xs">{dtr.days.length} days</span>
          </div>
          {/* Column headers */}
          <div className="flex items-center gap-2 px-4 py-2 bg-white/3 border-b border-white/5">
            <span className="w-7 text-center text-white/20 text-[10px]">#</span>
            <span className="flex-1 text-white/20 text-[10px]">Date</span>
            <span className="text-white/20 text-[10px] w-20 text-right">In / Out</span>
            <span className="text-white/20 text-[10px] w-20 text-right">Status</span>
          </div>
          {dtr.days.map((day, i) => (
            <DayRow key={day.date} day={day} idx={i} />
          ))}
        </div>

        {/* Issues section */}
        {(dtr.issues && dtr.issues.length > 0) && (
          <div className="bg-amber-500/5 border border-amber-400/15 rounded-2xl overflow-hidden">
            <div className="px-4 py-3 border-b border-amber-400/10">
              <h2 className="text-amber-300/80 text-xs font-semibold uppercase tracking-wider">Reported Issues</h2>
            </div>
            {dtr.issues.map(issue => (
              <div key={issue.id} className="px-4 py-3 border-b border-amber-400/5 last:border-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <p className="text-amber-300 text-xs font-medium">{issue.issueType}</p>
                    <p className="text-white/50 text-xs mt-0.5">{issue.comments}</p>
                    <p className="text-white/30 text-[10px] mt-1">{fmtDate(issue.submittedAt)}</p>
                  </div>
                  {issue.resolvedAt ? (
                    <span className="text-[9px] bg-emerald-500/15 text-emerald-300 border border-emerald-400/20 px-1.5 py-0.5 rounded-full shrink-0">Resolved</span>
                  ) : (
                    isAdmin && onResolveIssue && (
                      <button
                        onClick={() => onResolveIssue(issue.id)}
                        className="text-[9px] bg-blue-500/15 text-blue-300 border border-blue-400/20 px-2 py-1 rounded-full shrink-0 active:scale-95 transition-transform"
                      >
                        Resolve
                      </button>
                    )
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Audit trail */}
        {(dtr.auditTrail && dtr.auditTrail.length > 0) && (
          <div className="bg-white/3 border border-white/8 rounded-2xl overflow-hidden">
            <div className="px-4 py-3 border-b border-white/5">
              <h2 className="text-white/40 text-xs font-semibold uppercase tracking-wider">Audit Trail</h2>
            </div>
            <div className="px-4 py-3 space-y-3">
              {dtr.auditTrail.map((entry, i) => (
                <div key={i} className="flex items-start gap-3">
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-1.5 shrink-0" />
                  <div>
                    <p className="text-white/70 text-xs font-medium">{entry.action}</p>
                    <p className="text-white/30 text-[10px]">by {entry.performedBy} • {fmtDate(entry.performedAt)}</p>
                    {entry.note && <p className="text-white/40 text-[10px] italic mt-0.5">{entry.note}</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Bottom action bar */}
      {(canAcknowledge || (isAdmin && !isFinalized)) && (
        <div className="fixed bottom-0 left-0 right-0 bg-slate-900/95 backdrop-blur-xl border-t border-white/10 px-4 py-4 flex gap-3">
          {canAcknowledge && !isAdmin && (
            <button
              onClick={() => setShowIssueModal(true)}
              className="flex-1 flex items-center justify-center gap-2 bg-amber-500/15 text-amber-300 border border-amber-400/20 text-sm font-medium py-3 rounded-xl active:scale-[0.98] transition-transform"
            >
              <MessageSquare className="w-4 h-4" />
              Report Issue
            </button>
          )}
          {canAcknowledge && (
            <button
              onClick={() => setShowAckModal(true)}
              className="flex-1 flex items-center justify-center gap-2 bg-emerald-500 text-white font-semibold text-sm py-3 rounded-xl active:scale-[0.98] transition-transform"
            >
              <ThumbsUp className="w-4 h-4" />
              {isAdmin ? 'Acknowledge as Admin' : 'Acknowledge'}
            </button>
          )}
          {isAdmin && onRegenerate && !isFinalized && (
            <button
              onClick={() => onRegenerate(dtr.id)}
              className="flex-1 flex items-center justify-center gap-2 bg-orange-500/15 text-orange-300 border border-orange-400/20 text-sm font-medium py-3 rounded-xl active:scale-[0.98] transition-transform"
            >
              <RotateCcw className="w-4 h-4" />
              Regenerate
            </button>
          )}
        </div>
      )}

      {/* Acknowledge confirm modal */}
      {showAckModal && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/60 backdrop-blur-sm"
          onClick={e => { if (e.target === e.currentTarget) setShowAckModal(false); }}>
          <div className="w-full bg-slate-900 border-t border-white/10 rounded-t-3xl px-5 pt-5 pb-10">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-white font-bold text-base">Acknowledge DTR</h2>
              <button onClick={() => setShowAckModal(false)} className="w-8 h-8 flex items-center justify-center rounded-xl bg-white/10">
                <X className="w-4 h-4 text-white" />
              </button>
            </div>
            <div className="bg-white/5 rounded-2xl p-4 mb-4 space-y-3">
              <p className="text-white/70 text-sm leading-relaxed">
                {isAdmin
                  ? <>You are acknowledging this DTR as <strong className="text-white">Administrator</strong> on behalf of <strong className="text-white">{dtr.employeeName}</strong> for <strong className="text-white">{cutOffRange}</strong>.</>
                  : <>By acknowledging this DTR, you confirm that you have reviewed your attendance record for <strong className="text-white">{cutOffRange}</strong> and agree that it is accurate.</>
                }
              </p>
              <div className="flex items-center gap-1.5">
                <Lock className="w-3 h-3 text-amber-400 shrink-0" />
                <p className="text-amber-300/70 text-xs">This action is irreversible. The DTR will be finalized and locked.</p>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowAckModal(false)}
                className="flex-1 py-3 rounded-xl bg-white/5 text-white/60 text-sm font-medium active:scale-[0.98] transition-transform"
              >
                Cancel
              </button>
              <button
                onClick={handleAcknowledge}
                disabled={submitting}
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-emerald-500 text-white text-sm font-semibold disabled:opacity-60 active:scale-[0.98] transition-transform"
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                {submitting ? 'Submitting...' : 'Confirm Acknowledge'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Report issue modal */}
      {showIssueModal && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/60 backdrop-blur-sm"
          onClick={e => { if (e.target === e.currentTarget) setShowIssueModal(false); }}>
          <div className="w-full bg-slate-900 border-t border-white/10 rounded-t-3xl px-5 pt-5 pb-10 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-white font-bold text-base">Report an Issue</h2>
              <button onClick={() => setShowIssueModal(false)} className="w-8 h-8 flex items-center justify-center rounded-xl bg-white/10">
                <X className="w-4 h-4 text-white" />
              </button>
            </div>

            <div>
              <label className="text-white/50 text-xs mb-1.5 block">Issue Type</label>
              <div className="grid grid-cols-2 gap-2">
                {ISSUE_TYPES.map(t => (
                  <button key={t} onClick={() => setIssueType(t)}
                    className={`text-xs px-3 py-2 rounded-xl border text-left transition-colors ${
                      issueType === t ? 'bg-amber-500/20 text-amber-300 border-amber-400/30' : 'bg-white/5 text-white/50 border-white/10'
                    }`}>
                    {t}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-white/50 text-xs mb-1.5 block">Comments</label>
              <textarea
                value={issueComment}
                onChange={e => setIssueComment(e.target.value)}
                placeholder="Describe the issue..."
                rows={3}
                className="w-full bg-white/5 border border-white/10 text-white text-sm rounded-xl px-3 py-2.5 outline-none placeholder-white/30 resize-none"
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowIssueModal(false)}
                className="flex-1 py-3 rounded-xl bg-white/5 text-white/60 text-sm font-medium active:scale-[0.98] transition-transform"
              >
                Cancel
              </button>
              <button
                onClick={handleReportIssue}
                disabled={submitting}
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-amber-500/80 text-white text-sm font-semibold disabled:opacity-60 active:scale-[0.98] transition-transform"
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageSquare className="w-4 h-4" />}
                {submitting ? 'Submitting...' : 'Submit Issue'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
