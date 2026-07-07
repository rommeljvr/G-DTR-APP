import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ArrowLeft, RefreshCw, Loader2, Search, CheckCircle2, AlertCircle,
  ChevronDown, ChevronUp, X, Clock, MapPin, Navigation,
  Coffee, FileText, Calendar, Home, ShieldCheck,
  Smartphone, ExternalLink, Send, Unlock, Eye, Zap,
} from 'lucide-react';
import {
  User, GeneratedDTR, GeneratedDTRDay, AttendanceClassification,
} from '../types';
import {
  getGeneratedDTRList, getGeneratedDTR, updateDTRDay, sendDTRForReview, reopenDTR,
} from '../utils/sheets';
import DriveImage from './DriveImage';
import EmployeeAvatar from './EmployeeAvatar';
import { exportDTRToPrint, exportDTRToCSV } from '../utils/dtrExport';

interface Props {
  user: User;
  onBack: () => void;
}

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

const CLASSIFICATIONS: AttendanceClassification[] = [
  'Present', 'Late', 'Absent', 'Holiday', 'Rest Day',
  'Approved Leave', 'Official Business', 'Work From Home', 'Half Day',
];

function fmtDate(val: string): string {
  if (!val) return '—';
  const d = new Date(val);
  if (isNaN(d.getTime())) return val;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtTime(val: string): string {
  if (!val) return '—';
  // ISO datetime: 2025-07-01T08:30:00+08:00 — show date + time (overnight records span next day)
  const isoMatch = val.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (isoMatch) {
    const dateLabel = `${parseInt(isoMatch[2], 10)}/${parseInt(isoMatch[3], 10)}/${isoMatch[1]}`;
    const h = parseInt(isoMatch[4], 10), m = isoMatch[5];
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    return `${dateLabel} ${h12}:${m} ${ampm}`;
  }
  // Combined "M/d/yyyy h:mm a" from Attendance Date+Time columns — return as-is (already has date)
  if (/^\d{1,2}\/\d{1,2}\/\d{4}\s+\d{1,2}:\d{2}/i.test(val)) return val;
  // Plain time like "8:30 AM" or "08:30"
  if (/^\d{1,2}:\d{2}/.test(val)) return val;
  // Google Sheets serialized time (comes back as full Date string with Dec 30 1899)
  const d = new Date(val);
  if (!isNaN(d.getTime())) {
    return d.toLocaleString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
  }
  return val;
}

function fmtHours(h: number): string {
  if (!h) return '—';
  const hrs = Math.floor(h);
  const mins = Math.round((h - hrs) * 60);
  return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
}

function extractDriveId(url: string): string | null {
  if (!url) return null;
  const m = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
  return m ? m[1] : null;
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

const STATUS_STYLE: Record<string, string> = {
  'Generated':        'bg-blue-500/15 text-blue-300 border-blue-400/20',
  'Under Validation': 'bg-amber-500/15 text-amber-300 border-amber-400/20',
  'Ready for Review': 'bg-violet-500/15 text-violet-300 border-violet-400/20',
  'Acknowledged':     'bg-emerald-500/15 text-emerald-300 border-emerald-400/20',
  'Reopened':         'bg-rose-500/15 text-rose-300 border-rose-400/20',
};

// ── Expandable Day Row ───────────────────────────────────────────────────────
function DayRow({
  day, dtrId, userEmail, locked, onDayUpdated,
}: {
  day: GeneratedDTRDay;
  dtrId: string;
  userEmail: string;
  locked: boolean;
  onDayUpdated: (date: string, updatedDay: Partial<GeneratedDTRDay>) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [localClass, setLocalClass] = useState(day.attendanceClassification);
  const [localLateH, setLocalLateH] = useState(String(day.lateHours || 0));
  const [localLateM, setLocalLateM] = useState(String(day.lateMinutes || 0));
  const [localRemarks, setLocalRemarks] = useState(day.attendanceRemarks || '');
  const [localValidatedOT, setLocalValidatedOT] = useState(String(day.validatedOT ?? day.approvedOT ?? 0));
  const [otReason, setOtReason] = useState('');
  const [editRemarks, setEditRemarks] = useState('');

  const isEditable = !locked;
  const orig = day.originalRecord;

  const handleSaveField = async (field: string, value: string) => {
    setSaving(true);
    const res = await updateDTRDay({ dtrId, date: day.date, userEmail, field, value, remarks: editRemarks || undefined });
    setSaving(false);
    if (res.success && res.day) {
      onDayUpdated(day.date, res.day);
    }
  };

  const handleClassChange = async (val: AttendanceClassification) => {
    setLocalClass(val);
    await handleSaveField('attendanceClassification', val);
  };

  const handleLateSave = async () => {
    await handleSaveField('lateHours', localLateH);
    await handleSaveField('lateMinutes', localLateM);
  };

  const handleRemarksSave = async () => {
    await handleSaveField('attendanceRemarks', localRemarks);
  };

  const handleValidatedOTSave = async () => {
    setSaving(true);
    const res = await updateDTRDay({ dtrId, date: day.date, userEmail, field: 'validatedOT', value: localValidatedOT, remarks: otReason || undefined });
    setSaving(false);
    if (res.success && res.day) {
      onDayUpdated(day.date, res.day);
      setOtReason('');
    }
  };

  return (
    <>
      {lightbox && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          onClick={() => setLightbox(null)}>
          <img src={lightbox} alt="Photo" className="max-w-full max-h-[80vh] rounded-2xl object-contain" />
          <button className="absolute top-4 right-4 w-10 h-10 flex items-center justify-center rounded-full bg-white/10">
            <X className="w-5 h-5 text-white" />
          </button>
        </div>
      )}

      <div className="border-b border-white/5">
        {/* Compact row */}
        <button
          className="w-full flex items-center gap-1.5 px-3 py-2.5 active:bg-white/5 transition-colors"
          onClick={() => setExpanded(v => !v)}
        >
          <div className="w-16 text-left shrink-0">
            <p className="text-white text-[11px] font-medium">{fmtDate(day.date)}</p>
            <p className="text-white/30 text-[9px]">{day.dayOfWeek}</p>
          </div>
          <div className="w-24 text-[9px] text-white/70 text-center shrink-0 leading-tight">{fmtTime(day.timeIn || '')}</div>
          <div className="w-24 text-[9px] text-white/70 text-center shrink-0 leading-tight">{fmtTime(day.timeOut || '')}</div>
          <div className="w-12 text-[10px] text-white/50 text-center shrink-0">{day.totalHoursWorked ? fmtHours(day.totalHoursWorked) : '—'}</div>
          <div className="w-10 text-[9px] text-white/50 text-center shrink-0">{day.actualOT ? fmtHours(day.actualOT) : '—'}</div>
          <div className="w-10 text-[9px] text-emerald-400/70 text-center shrink-0">{day.approvedOT ? fmtHours(day.approvedOT) : '—'}</div>
          <div className="w-10 text-[9px] text-violet-400/70 text-center shrink-0 font-semibold">{(day.validatedOT ?? day.approvedOT) ? fmtHours(day.validatedOT ?? day.approvedOT) : '—'}</div>
          <div className="w-6 text-center shrink-0">
            {day.mealEligibility ? <span className="text-[9px] text-amber-300">YES</span> : <span className="text-[9px] text-white/20">—</span>}
          </div>
          <span className={`text-[8px] font-semibold px-1.5 py-0.5 rounded-full border shrink-0 flex-1 text-center ${CLASS_BADGE[day.attendanceClassification] || 'bg-white/10 text-white/40 border-white/10'}`}>
            {day.attendanceClassification}
          </span>
          {expanded ? <ChevronUp className="w-3 h-3 text-white/30 shrink-0" /> : <ChevronDown className="w-3 h-3 text-white/30 shrink-0" />}
        </button>

        {/* Expanded detail */}
        {expanded && (
          <div className="px-3 pb-4 space-y-3 bg-white/[0.02]">

            {/* ── ORIGINAL RECORD REFERENCE ─────────────── */}
            <div className="bg-slate-800/50 border border-white/8 rounded-xl p-3 space-y-2">
              <p className="text-white/40 text-[10px] font-semibold uppercase tracking-wider flex items-center gap-1.5">
                <Eye className="w-3 h-3" /> Original Record
              </p>
              <div className="grid grid-cols-2 gap-2 text-[10px]">
                <div><span className="text-white/30">Time In:</span> <span className="text-white/70">{fmtTime(orig.timeIn || '')}</span></div>
                <div><span className="text-white/30">Time Out:</span> <span className="text-white/70">{fmtTime(orig.timeOut || '')}</span></div>
              </div>
              {orig.address && (
                <div className="flex items-start gap-1.5">
                  <MapPin className="w-3 h-3 text-emerald-400 shrink-0 mt-0.5" />
                  <span className="text-white/50 text-[10px]">{orig.address}</span>
                </div>
              )}
              {!!(orig.latitude && orig.longitude) && (
                <div className="flex items-center gap-1.5">
                  <Navigation className="w-3 h-3 text-violet-400 shrink-0" />
                  <a href={`https://maps.google.com/?q=${orig.latitude},${orig.longitude}`}
                    target="_blank" rel="noopener noreferrer"
                    className="text-violet-300 text-[10px] underline">
                    {orig.latitude.toFixed(5)}, {orig.longitude.toFixed(5)}
                  </a>
                </div>
              )}
              {orig.deviceInfo && (
                <div className="flex items-center gap-1.5">
                  <Smartphone className="w-3 h-3 text-white/30 shrink-0" />
                  <span className="text-white/40 text-[9px]">{orig.deviceInfo}</span>
                </div>
              )}
              {/* Photos */}
              {(orig.timeInImageId || orig.timeInImageUrl || orig.timeOutImageId || orig.timeOutImageUrl) && (
                <div className="flex gap-2 mt-1">
                  {(orig.timeInImageId || orig.timeInImageUrl) && (
                    <div className="flex flex-col items-center gap-0.5">
                      <DriveImage
                        imageId={orig.timeInImageId || extractDriveId(orig.timeInImageUrl ?? '') || undefined}
                        alt="Time In" className="w-12 h-12 rounded-lg" thumbnail
                        onClick={(src) => setLightbox(src)}
                      />
                      <span className="text-white/30 text-[8px]">In</span>
                    </div>
                  )}
                  {(orig.timeOutImageId || orig.timeOutImageUrl) && (
                    <div className="flex flex-col items-center gap-0.5">
                      <DriveImage
                        imageId={orig.timeOutImageId || extractDriveId(orig.timeOutImageUrl ?? '') || undefined}
                        alt="Time Out" className="w-12 h-12 rounded-lg" thumbnail
                        onClick={(src) => setLightbox(src)}
                      />
                      <span className="text-white/30 text-[8px]">Out</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* ── EDITABLE CLASSIFICATION ─────────────── */}
            {isEditable && (
              <div className="bg-white/5 border border-white/10 rounded-xl p-3 space-y-2">
                <p className="text-white/50 text-[10px] font-semibold uppercase tracking-wider">Classification</p>
                <select
                  value={localClass}
                  onChange={e => handleClassChange(e.target.value as AttendanceClassification)}
                  disabled={saving}
                  className="w-full bg-slate-800 border border-white/10 text-white text-xs rounded-lg px-3 py-2 outline-none"
                >
                  {CLASSIFICATIONS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>

                {/* Late adjustment — only visible if classification is Late */}
                {localClass === 'Late' && (
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-white/40 text-[10px]">Late:</span>
                    <input type="number" min="0" max="24" value={localLateH}
                      onChange={e => setLocalLateH(e.target.value)}
                      className="w-12 bg-slate-800 border border-white/10 text-white text-xs rounded-lg px-2 py-1.5 text-center outline-none"
                    />
                    <span className="text-white/30 text-[10px]">h</span>
                    <input type="number" min="0" max="59" value={localLateM}
                      onChange={e => setLocalLateM(e.target.value)}
                      className="w-12 bg-slate-800 border border-white/10 text-white text-xs rounded-lg px-2 py-1.5 text-center outline-none"
                    />
                    <span className="text-white/30 text-[10px]">m</span>
                    <button onClick={handleLateSave} disabled={saving}
                      className="ml-auto text-[9px] bg-blue-500/20 text-blue-300 border border-blue-400/20 px-2 py-1 rounded-lg font-semibold disabled:opacity-50">
                      {saving ? '...' : 'Save'}
                    </button>
                  </div>
                )}

                {/* Remarks */}
                <div className="mt-2">
                  <input type="text" value={localRemarks}
                    onChange={e => setLocalRemarks(e.target.value)}
                    onBlur={handleRemarksSave}
                    placeholder="Attendance remarks..."
                    className="w-full bg-slate-800 border border-white/10 text-white text-xs rounded-lg px-3 py-2 outline-none placeholder-white/20"
                  />
                </div>

                {/* Reason for change */}
                <input type="text" value={editRemarks}
                  onChange={e => setEditRemarks(e.target.value)}
                  placeholder="Reason for adjustment (optional)..."
                  className="w-full bg-slate-800/50 border border-white/5 text-white/60 text-[10px] rounded-lg px-3 py-1.5 outline-none placeholder-white/20"
                />
              </div>
            )}

            {/* ── LINKED: MEAL ALLOWANCE ─────────────── */}
            {day.mealAllowances.length > 0 && (
              <div className="bg-amber-500/5 border border-amber-400/15 rounded-xl p-3 space-y-2">
                <p className="text-amber-300/80 text-[10px] font-semibold uppercase tracking-wider flex items-center gap-1.5">
                  <Coffee className="w-3 h-3" /> Meal Allowance ({day.mealAllowances.length})
                </p>
                {day.mealAllowances.map(ma => (
                  <div key={ma.id} className="flex items-start gap-2 bg-white/5 rounded-lg p-2">
                    {(ma.imageId || ma.imageUrl) && (
                      <DriveImage
                        imageId={ma.imageId || extractDriveId(ma.imageUrl ?? '') || undefined}
                        alt="Meal" className="w-10 h-10 rounded-lg shrink-0" thumbnail
                        onClick={(src) => setLightbox(src)}
                      />
                    )}
                    <div className="flex-1 min-w-0 text-[10px]">
                      <p className="text-white/70">Meal #{ma.sequence}</p>
                      {ma.address && <p className="text-white/40 truncate">{ma.address}</p>}
                      <p className="text-white/30">{fmtTime(ma.timestamp)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* ── LINKED: TIME CORRECTION ─────────────── */}
            {day.timeCorrections.length > 0 && (
              <div className="bg-blue-500/5 border border-blue-400/15 rounded-xl p-3 space-y-2">
                <p className="text-blue-300/80 text-[10px] font-semibold uppercase tracking-wider flex items-center gap-1.5">
                  <Clock className="w-3 h-3" /> Time Correction ({day.timeCorrections.length})
                </p>
                {day.timeCorrections.map(tc => (
                  <div key={tc.id} className="bg-white/5 rounded-lg p-2 text-[10px] space-y-1">
                    <span className={`px-1.5 py-0.5 rounded-full border text-[8px] font-semibold ${
                      tc.status === 'Approved' ? 'bg-emerald-500/15 text-emerald-300 border-emerald-400/20' :
                      tc.status === 'Rejected' ? 'bg-red-500/15 text-red-300 border-red-400/20' :
                      'bg-amber-500/15 text-amber-300 border-amber-400/20'
                    }`}>{tc.status}</span>
                    <div className="grid grid-cols-2 gap-1 mt-1">
                      <div><span className="text-white/30">Corr In:</span> <span className="text-blue-300">{tc.correctedTimeIn || '—'}</span></div>
                      <div><span className="text-white/30">Corr Out:</span> <span className="text-blue-300">{tc.correctedTimeOut || '—'}</span></div>
                    </div>
                    {tc.reason && <p className="text-white/40 italic">{tc.reason}</p>}
                    {tc.documentUrl && (
                      <a href={tc.documentUrl} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-blue-300 underline text-[9px]">
                        <ExternalLink className="w-2.5 h-2.5" /> Attachment
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* ── LINKED: LEAVE ─────────────────────────── */}
            {day.leaves.length > 0 && (
              <div className="bg-teal-500/5 border border-teal-400/15 rounded-xl p-3 space-y-2">
                <p className="text-teal-300/80 text-[10px] font-semibold uppercase tracking-wider flex items-center gap-1.5">
                  <Calendar className="w-3 h-3" /> Leave
                </p>
                {day.leaves.map(lv => (
                  <div key={lv.id} className="bg-white/5 rounded-lg p-2 text-[10px]">
                    <span className="text-white/70 font-medium">{lv.leaveType}</span>
                    <span className={`ml-2 px-1.5 py-0.5 rounded-full border text-[8px] font-semibold ${
                      lv.status === 'Approved' ? 'bg-emerald-500/15 text-emerald-300 border-emerald-400/20' : 'bg-amber-500/15 text-amber-300 border-amber-400/20'
                    }`}>{lv.status}</span>
                  </div>
                ))}
              </div>
            )}

            {/* ── LINKED: WFH ───────────────────────────── */}
            {day.wfh.length > 0 && (
              <div className="bg-violet-500/5 border border-violet-400/15 rounded-xl p-3 space-y-2">
                <p className="text-violet-300/80 text-[10px] font-semibold uppercase tracking-wider flex items-center gap-1.5">
                  <Home className="w-3 h-3" /> Work From Home
                </p>
                {day.wfh.map(w => (
                  <div key={w.id} className="bg-white/5 rounded-lg p-2 text-[10px] space-y-1">
                    <span className={`px-1.5 py-0.5 rounded-full border text-[8px] font-semibold ${
                      w.status === 'Approved' ? 'bg-emerald-500/15 text-emerald-300 border-emerald-400/20' : 'bg-violet-500/15 text-violet-300 border-violet-400/20'
                    }`}>{w.status}</span>
                    {w.eodSummary && <p className="text-white/40 italic mt-1">EOD: {w.eodSummary}</p>}
                    {w.attachments && w.attachments.length > 0 && (
                      <div className="flex gap-1 flex-wrap mt-1">
                        {w.attachments.map((att, i) => (
                          <a key={i} href={att.fileUrl} target="_blank" rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-violet-300 underline text-[9px]">
                            <FileText className="w-2.5 h-2.5" />{att.fileName}
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* ── LINKED: OVERTIME ──────────────────────── */}
            {day.overtimes && day.overtimes.length > 0 && (
              <div className="bg-violet-500/5 border border-violet-400/15 rounded-xl p-3 space-y-2">
                <p className="text-violet-300/80 text-[10px] font-semibold uppercase tracking-wider flex items-center gap-1.5">
                  <Zap className="w-3 h-3" /> Overtime ({day.overtimes.length})
                </p>
                {day.overtimes.map(ot => (
                  <div key={ot.id} className="bg-white/5 rounded-lg p-2 text-[10px] space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="bg-emerald-500/15 text-emerald-300 border border-emerald-400/20 text-[8px] font-semibold px-1.5 py-0.5 rounded-full">Approved</span>
                      <span className="text-white/60 font-medium">{ot.otType}</span>
                      <span className="text-white/40 ml-auto">{ot.approvedHours != null ? fmtHours(ot.approvedHours) : '—'} approved</span>
                    </div>
                    {ot.otType === 'Pre-Shift' && (ot.preShiftStart || ot.preShiftEnd) && (
                      <div className="grid grid-cols-2 gap-1">
                        <div><span className="text-white/30">Start:</span> <span className="text-white/60">{fmtTime(ot.preShiftStart || '')}</span></div>
                        <div><span className="text-white/30">End:</span> <span className="text-white/60">{fmtTime(ot.preShiftEnd || '')}</span></div>
                      </div>
                    )}
                    {ot.otType === 'Post-Shift' && (ot.postShiftStart || ot.postShiftEnd) && (
                      <div className="grid grid-cols-2 gap-1">
                        <div><span className="text-white/30">Start:</span> <span className="text-white/60">{fmtTime(ot.postShiftStart || '')}</span></div>
                        <div><span className="text-white/30">End:</span> <span className="text-white/60">{fmtTime(ot.postShiftEnd || '')}</span></div>
                      </div>
                    )}
                    {ot.reason && <p className="text-white/40 italic">{ot.reason}</p>}
                    <div className="flex items-center justify-between text-[9px] text-white/25">
                      {ot.approverName && <span>Approved by: <span className="text-white/40">{ot.approverName}</span></span>}
                      {ot.approvedAt && <span>{fmtDate(ot.approvedAt)}</span>}
                    </div>
                    {ot.attachmentUrl && (
                      <a href={ot.attachmentUrl} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-violet-300 underline text-[9px]">
                        <FileText className="w-2.5 h-2.5" /> Supporting Document
                      </a>
                    )}
                  </div>
                ))}

                {/* ── OT ADJUSTMENT (admin only while not locked) ── */}
                {isEditable && (
                  <div className="border-t border-violet-400/10 pt-2 space-y-2 mt-1">
                    <p className="text-violet-300/60 text-[10px] font-semibold uppercase tracking-wider">Payroll OT Adjustment</p>
                    <div className="grid grid-cols-3 gap-2 text-[10px]">
                      <div className="bg-white/5 rounded-lg p-2 text-center">
                        <p className="text-white/30 text-[9px] mb-0.5">Actual OT</p>
                        <p className="text-white/70 font-semibold">{day.actualOT ? fmtHours(day.actualOT) : '—'}</p>
                      </div>
                      <div className="bg-white/5 rounded-lg p-2 text-center">
                        <p className="text-white/30 text-[9px] mb-0.5">Approved OT</p>
                        <p className="text-emerald-300/80 font-semibold">{day.approvedOT ? fmtHours(day.approvedOT) : '—'}</p>
                      </div>
                      <div className="bg-violet-500/10 rounded-lg p-2 text-center">
                        <p className="text-violet-300/60 text-[9px] mb-0.5">Validated OT</p>
                        <p className="text-violet-300 font-semibold">{fmtHours(Number(localValidatedOT) || 0)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-white/40 text-[10px] shrink-0">Payroll OT (hrs):</span>
                      <input
                        type="number" min="0" step="0.25" value={localValidatedOT}
                        onChange={e => setLocalValidatedOT(e.target.value)}
                        className="w-20 bg-slate-800 border border-violet-400/30 text-white text-xs rounded-lg px-2 py-1.5 text-center outline-none"
                      />
                    </div>
                    <input
                      type="text" value={otReason}
                      onChange={e => setOtReason(e.target.value)}
                      placeholder="Reason for OT adjustment (required)..."
                      className="w-full bg-slate-800/50 border border-white/5 text-white/60 text-[10px] rounded-lg px-3 py-1.5 outline-none placeholder-white/20"
                    />
                    <button
                      onClick={handleValidatedOTSave} disabled={saving || !otReason.trim()}
                      className="flex items-center gap-1.5 bg-violet-500/20 text-violet-300 border border-violet-400/20 text-[10px] font-semibold px-3 py-1.5 rounded-xl disabled:opacity-40 active:scale-95 transition-transform"
                    >
                      {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
                      Save OT Adjustment
                    </button>
                  </div>
                )}
              </div>
            )}

            {day.lastModifiedBy && (
              <p className="text-white/20 text-[9px] pt-1">Last modified by {day.lastModifiedBy} • {fmtDate(day.lastModifiedAt || '')}</p>
            )}
          </div>
        )}
      </div>
    </>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────
export default function DTRValidation({ user, onBack }: Props) {
  const [records, setRecords] = useState<GeneratedDTR[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDTR, setSelectedDTR] = useState<string | null>(null);
  const [dtrData, setDtrData] = useState<GeneratedDTR | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [acting, setActing] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  const showToast = (type: 'success' | 'error', msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3500);
  };

  const loadRecords = useCallback(async () => {
    setLoading(true);
    const res = await getGeneratedDTRList(user.email);
    setRecords(res.records || []);
    setLoading(false);
  }, [user.email]);

  useEffect(() => { loadRecords(); }, [loadRecords]);

  const loadDetail = async (dtrId: string) => {
    setSelectedDTR(dtrId);
    setDetailLoading(true);
    const res = await getGeneratedDTR(dtrId, user.email);
    if (res.success && res.data) {
      setDtrData(res.data);
    } else {
      showToast('error', res.message || 'Failed to load DTR');
      setSelectedDTR(null);
    }
    setDetailLoading(false);
  };

  const handleDayUpdated = (date: string, updatedDay: Partial<GeneratedDTRDay>) => {
    if (!dtrData) return;
    setDtrData({
      ...dtrData,
      days: dtrData.days.map(d => d.date === date ? { ...d, ...updatedDay } : d),
    });
  };

  const handleSendForReview = async () => {
    if (!dtrData) return;
    setActing(true);
    const res = await sendDTRForReview(dtrData.id, user.email);
    setActing(false);
    if (res.success) {
      setDtrData({ ...dtrData, status: 'Ready for Review' });
      showToast('success', 'DTR sent for employee review');
    } else {
      showToast('error', res.message);
    }
  };

  const handleReopen = async () => {
    if (!dtrData) return;
    setActing(true);
    const res = await reopenDTR(dtrData.id, user.email, 'Reopened by admin');
    setActing(false);
    if (res.success) {
      setDtrData({ ...dtrData, status: 'Reopened' });
      showToast('success', 'DTR reopened');
    } else {
      showToast('error', res.message);
    }
  };

  const filtered = useMemo(() => {
    if (!search.trim()) return records;
    const q = search.toLowerCase();
    return records.filter(r =>
      r.employeeName.toLowerCase().includes(q) || r.employeeEmail.toLowerCase().includes(q)
    );
  }, [records, search]);

  const isLocked = dtrData?.status === 'Acknowledged';

  // Summary stats
  const summary = dtrData?.summary;

  // ─── DTR Selection Screen ─────────────────────
  if (!selectedDTR) {
    return (
      <div className="min-h-dvh bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex flex-col pb-20">
        {toast && (
          <div className={`fixed top-4 left-4 right-4 z-50 rounded-xl px-4 py-3 text-sm font-medium text-white shadow-2xl border flex items-center gap-2 ${
            toast.type === 'success' ? 'bg-emerald-600/90 border-emerald-400/30' : 'bg-red-600/90 border-red-400/30'
          }`}>
            {toast.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
            {toast.msg}
          </div>
        )}

        <div className="bg-slate-900/80 backdrop-blur-xl border-b border-white/10 px-4 pt-12 pb-4 sticky top-0 z-30">
          <div className="flex items-center gap-3 mb-3">
            <button onClick={onBack} className="w-8 h-8 flex items-center justify-center rounded-xl bg-white/10 active:scale-90 transition-transform">
              <ArrowLeft className="w-4 h-4 text-white" />
            </button>
            <div className="flex-1">
              <h1 className="text-white font-bold text-base">DTR Validation</h1>
              <p className="text-white/40 text-xs">Select a Generated DTR</p>
            </div>
            <button onClick={loadRecords} className="w-8 h-8 flex items-center justify-center rounded-xl bg-white/10 active:scale-90 transition-transform">
              <RefreshCw className={`w-4 h-4 text-white ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-3 py-2">
            <Search className="w-3.5 h-3.5 text-white/30 shrink-0" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search employee..." className="bg-transparent text-white text-xs flex-1 outline-none placeholder-white/30" />
            {search && <button onClick={() => setSearch('')}><X className="w-3.5 h-3.5 text-white/30" /></button>}
          </div>
        </div>

        <div className="flex-1 px-4 pt-4 space-y-2">
          {loading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="bg-white/5 border border-white/8 rounded-2xl h-20 animate-pulse" />
            ))
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center py-16 gap-2">
              <ShieldCheck className="w-12 h-12 text-white/10" />
              <p className="text-white/40 text-sm">No Generated DTRs found</p>
            </div>
          ) : filtered.map(r => (
            <button key={r.id} onClick={() => loadDetail(r.id)}
              className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 text-left active:bg-white/8 transition-colors">
              <div className="flex items-center gap-3">
                <EmployeeAvatar src={r.employeeImage} name={r.employeeName} size="sm" />
                <div className="flex-1 min-w-0">
                  <p className="text-white font-medium text-sm truncate">{r.employeeName}</p>
                  <p className="text-white/40 text-[10px] truncate">{r.employeeEmail}</p>
                </div>
                <div className="text-right shrink-0">
                  <span className={`text-[8px] font-semibold px-1.5 py-0.5 rounded-full border ${STATUS_STYLE[r.status] || 'bg-white/10 text-white/40 border-white/10'}`}>
                    {r.status}
                  </span>
                  <p className="text-white/40 text-[10px] mt-1">{MONTHS[(r.month || 1) - 1]} {r.year} • {r.cutOff}</p>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ─── DTR Detail / Validation Screen ───────────────
  return (
    <div className="min-h-dvh bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex flex-col pb-20">
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
        <div className="flex items-center gap-3 mb-2">
          <button onClick={() => { setSelectedDTR(null); setDtrData(null); }}
            className="w-8 h-8 flex items-center justify-center rounded-xl bg-white/10 active:scale-90 transition-transform">
            <ArrowLeft className="w-4 h-4 text-white" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-white font-bold text-sm truncate">{dtrData?.employeeName || 'Loading...'}</h1>
            {dtrData && (
              <p className="text-white/40 text-[10px]">
                {MONTHS[(dtrData.month || 1) - 1]} {dtrData.year} • {dtrData.cutOff} Cut-Off
              </p>
            )}
          </div>
          {dtrData && (
            <span className={`text-[9px] font-semibold px-2 py-1 rounded-full border ${STATUS_STYLE[dtrData.status] || ''}`}>
              {dtrData.status}
            </span>
          )}
        </div>

        {/* Action buttons */}
        {dtrData && (
          <div className="flex gap-2 mt-2">
            {(dtrData.status === 'Generated' || dtrData.status === 'Under Validation' || dtrData.status === 'Reopened') && (
              <button onClick={handleSendForReview} disabled={acting}
                className="flex items-center gap-1.5 bg-violet-500/20 text-violet-300 border border-violet-400/20 text-[10px] font-semibold px-3 py-2 rounded-xl disabled:opacity-50">
                {acting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                Send for Review
              </button>
            )}
            {dtrData.status === 'Acknowledged' && (
              <button onClick={handleReopen} disabled={acting}
                className="flex items-center gap-1.5 bg-rose-500/20 text-rose-300 border border-rose-400/20 text-[10px] font-semibold px-3 py-2 rounded-xl disabled:opacity-50">
                {acting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Unlock className="w-3 h-3" />}
                Reopen
              </button>
            )}
            <button onClick={() => dtrData && exportDTRToPrint(dtrData)} title="Print / PDF"
              className="flex items-center gap-1 bg-white/10 text-white/70 text-[10px] font-medium px-2.5 py-2 rounded-xl active:scale-95 ml-auto">
              <FileText className="w-3 h-3" /> PDF
            </button>
            <button onClick={() => dtrData && exportDTRToCSV(dtrData)} title="Export CSV"
              className="flex items-center gap-1 bg-white/10 text-white/70 text-[10px] font-medium px-2.5 py-2 rounded-xl active:scale-95">
              <ExternalLink className="w-3 h-3" /> CSV
            </button>
            <button onClick={() => selectedDTR && loadDetail(selectedDTR)}
              className="w-8 h-8 flex items-center justify-center rounded-xl bg-white/10 active:scale-90">
              <RefreshCw className={`w-3.5 h-3.5 text-white ${detailLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 px-3 pt-4 space-y-4">
        {detailLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
          </div>
        ) : !dtrData ? (
          <div className="flex flex-col items-center py-16 gap-2">
            <AlertCircle className="w-10 h-10 text-white/10" />
            <p className="text-white/40 text-sm">No data</p>
          </div>
        ) : (
          <>
            {/* Summary cards */}
            {summary && (
              <div className="space-y-1.5">
                <div className="grid grid-cols-4 gap-1.5 text-center">
                  <div className="bg-white/5 rounded-xl p-2 border border-white/5">
                    <p className="text-xs font-bold text-emerald-300">{summary.presentDays}</p>
                    <p className="text-white/30 text-[8px]">Present</p>
                  </div>
                  <div className="bg-white/5 rounded-xl p-2 border border-white/5">
                    <p className="text-xs font-bold text-red-300">{summary.absentDays}</p>
                    <p className="text-white/30 text-[8px]">Absent</p>
                  </div>
                  <div className="bg-white/5 rounded-xl p-2 border border-white/5">
                    <p className="text-xs font-bold text-teal-300">{summary.leaveDays}</p>
                    <p className="text-white/30 text-[8px]">Leave</p>
                  </div>
                  <div className="bg-white/5 rounded-xl p-2 border border-white/5">
                    <p className="text-xs font-bold text-white">{fmtHours(summary.totalHoursWorked)}</p>
                    <p className="text-white/30 text-[8px]">Hours</p>
                  </div>
                </div>
                {(summary.totalApprovedOT > 0 || summary.totalValidatedOT > 0) && (
                  <div className="grid grid-cols-3 gap-1.5 text-center">
                    <div className="bg-white/5 rounded-xl p-2 border border-white/5">
                      <p className="text-xs font-bold text-white/60">{fmtHours(summary.totalActualOT)}</p>
                      <p className="text-white/30 text-[8px]">Actual OT</p>
                    </div>
                    <div className="bg-emerald-500/8 rounded-xl p-2 border border-emerald-400/10">
                      <p className="text-xs font-bold text-emerald-300">{fmtHours(summary.totalApprovedOT)}</p>
                      <p className="text-white/30 text-[8px]">Approved OT</p>
                    </div>
                    <div className="bg-violet-500/10 rounded-xl p-2 border border-violet-400/15">
                      <p className="text-xs font-bold text-violet-300">{fmtHours(summary.totalValidatedOT ?? summary.totalApprovedOT)}</p>
                      <p className="text-white/30 text-[8px]">Payroll OT</p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Timesheet table */}
            <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2.5 border-b border-white/10">
                <h2 className="text-white/60 text-[10px] font-semibold uppercase tracking-wider">Timesheet Details</h2>
                {isLocked && <span className="text-[9px] text-amber-300 bg-amber-500/15 border border-amber-400/20 px-1.5 py-0.5 rounded-full font-semibold">Locked</span>}
              </div>
              {/* Column headers */}
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-white/3 border-b border-white/5 text-[8px] text-white/30 font-medium">
                <span className="w-16">Date</span>
                <span className="w-24 text-center">TIME IN</span>
                <span className="w-24 text-center">TIME OUT</span>
                <span className="w-12 text-center">HOURS</span>
                <span className="w-10 text-center">ACT OT</span>
                <span className="w-10 text-center">APR OT</span>
                <span className="w-10 text-center text-violet-300/60">VAL OT</span>
                <span className="w-6 text-center">MEAL</span>
                <span className="flex-1 text-center">STATUS</span>
                <span className="w-3" />
              </div>
              {dtrData.days.map(day => (
                <DayRow
                  key={day.date}
                  day={day}
                  dtrId={dtrData.id}
                  userEmail={user.email}
                  locked={isLocked}
                  onDayUpdated={handleDayUpdated}
                />
              ))}
            </div>

            {/* Audit Trail */}
            {dtrData.auditTrail.length > 0 && (
              <div className="bg-white/3 border border-white/8 rounded-2xl overflow-hidden">
                <div className="px-4 py-3 border-b border-white/5">
                  <h2 className="text-white/40 text-[10px] font-semibold uppercase tracking-wider">Audit Trail</h2>
                </div>
                <div className="px-4 py-3 space-y-2.5 max-h-60 overflow-y-auto">
                  {dtrData.auditTrail.map((entry, i) => (
                    <div key={i} className="flex items-start gap-2.5">
                      <div className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 bg-blue-400" />
                      <div className="text-[10px]">
                        <p className="text-white/60">
                          <span className="font-medium text-white/80">{entry.field}</span>: {entry.originalValue} → {entry.updatedValue}
                        </p>
                        <p className="text-white/30 text-[9px]">
                          by {entry.modifiedBy} • {fmtDate(entry.modifiedAt)} {fmtTime(entry.modifiedAt)}
                        </p>
                        {entry.remarks && <p className="text-white/40 text-[9px] italic">"{entry.remarks}"</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
