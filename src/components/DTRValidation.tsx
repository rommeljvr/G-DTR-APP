import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ArrowLeft, RefreshCw, Loader2, Search, CheckCircle2, AlertCircle,
  ChevronDown, ChevronUp, X, Clock, MapPin, Navigation,
  Coffee, FileText, Calendar, Briefcase, Home, Flag, ShieldCheck,
  Smartphone, ExternalLink,
} from 'lucide-react';
import {
  User, DTRRecord, DTRValidationData, DTRValidationDay,
  ValidationStatus,
} from '../types';
import {
  getDTRList, getDTRValidationData, validateDTRDay,
} from '../utils/sheets';
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

function extractDriveId(url: string): string | null {
  if (!url) return null;
  const m = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
  return m ? m[1] : null;
}

const STATUS_BADGE: Record<string, string> = {
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

const VAL_BADGE: Record<ValidationStatus, string> = {
  'Pending':   'bg-slate-500/20 text-slate-300 border-slate-400/20',
  'Validated': 'bg-emerald-500/20 text-emerald-300 border-emerald-400/20',
  'Flagged':   'bg-red-500/20 text-red-300 border-red-400/20',
};

// ── Expandable Validation Day Row ────────────────────────────────────────────
function ValidationDayRow({
  day, dtrId, adminEmail, onValidated,
}: {
  day: DTRValidationDay;
  dtrId: string;
  adminEmail: string;
  onValidated: (date: string, status: ValidationStatus, by: string, at: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [acting, setActing] = useState(false);
  const [showFlagModal, setShowFlagModal] = useState(false);
  const [flagRemarks, setFlagRemarks] = useState('');
  const isRestOrHoliday = day.attendanceStatus === 'Rest Day' || day.attendanceStatus === 'Holiday';


  const handleValidate = async () => {
    setActing(true);
    const res = await validateDTRDay({ dtrId, date: day.date, adminEmail, validationStatus: 'Validated' });
    setActing(false);
    if (res.success) onValidated(day.date, 'Validated', res.validatedBy || adminEmail, res.validatedAt || '');
  };

  const handleFlag = async () => {
    if (!flagRemarks.trim()) return;
    setActing(true);
    const res = await validateDTRDay({ dtrId, date: day.date, adminEmail, validationStatus: 'Flagged', remarks: flagRemarks.trim() });
    setActing(false);
    if (res.success) {
      onValidated(day.date, 'Flagged', res.validatedBy || adminEmail, res.validatedAt || '');
      setShowFlagModal(false);
      setFlagRemarks('');
    }
  };

  const handleClearFlag = async () => {
    setActing(true);
    const res = await validateDTRDay({ dtrId, date: day.date, adminEmail, validationStatus: 'Pending', remarks: 'Flag cleared' });
    setActing(false);
    if (res.success) onValidated(day.date, 'Pending', '', '');
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

      {showFlagModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4"
          onClick={e => { if (e.target === e.currentTarget) setShowFlagModal(false); }}>
          <div className="w-full max-w-sm bg-slate-900 border border-white/10 rounded-3xl px-5 pt-5 pb-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-white font-bold text-sm flex items-center gap-2">
                <Flag className="w-4 h-4 text-red-400" /> Flag Day — {fmtDate(day.date)}
              </h3>
              <button onClick={() => setShowFlagModal(false)} className="w-7 h-7 flex items-center justify-center rounded-lg bg-white/10">
                <X className="w-3.5 h-3.5 text-white" />
              </button>
            </div>
            <textarea
              value={flagRemarks}
              onChange={e => setFlagRemarks(e.target.value)}
              placeholder="Describe the issue or reason for flagging..."
              rows={3}
              className="w-full bg-white/5 border border-white/10 text-white text-sm rounded-xl px-3 py-2.5 outline-none placeholder-white/30 resize-none"
            />
            <div className="flex gap-3">
              <button onClick={() => setShowFlagModal(false)}
                className="flex-1 py-2.5 rounded-xl bg-white/5 text-white/60 text-sm font-medium">
                Cancel
              </button>
              <button onClick={handleFlag} disabled={acting || !flagRemarks.trim()}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-red-500/80 text-white text-sm font-semibold disabled:opacity-50">
                {acting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Flag className="w-3.5 h-3.5" />}
                Flag
              </button>
            </div>
          </div>
        </div>
      )}

      <div className={`border-b border-white/5 ${isRestOrHoliday ? 'opacity-50' : ''}`}>
        {/* Compact row */}
        <button
          className="w-full flex items-center gap-2 px-4 py-3 active:bg-white/5 transition-colors"
          onClick={() => setExpanded(v => !v)}
        >
          {/* Validation dot */}
          <span className={`w-2 h-2 rounded-full shrink-0 ${
            day.validationStatus === 'Validated' ? 'bg-emerald-400' :
            day.validationStatus === 'Flagged' ? 'bg-red-400' : 'bg-white/20'
          }`} />

          <div className="flex-1 min-w-0 text-left">
            <p className="text-white text-xs font-medium">{fmtDate(day.date)}</p>
            <p className="text-white/30 text-[10px]">{day.dayOfWeek}</p>
          </div>

          <div className="text-right mr-1">
            <p className="text-white text-[11px]">{day.timeIn || '—'}</p>
            <p className="text-white/50 text-[10px]">{day.timeOut || '—'}</p>
          </div>

          <span className="text-white/40 text-[10px] w-10 text-right">{day.workingHours ? fmtHours(day.workingHours) : '—'}</span>

          <span className={`text-[8px] font-semibold px-1.5 py-0.5 rounded-full border shrink-0 ${STATUS_BADGE[day.attendanceStatus] || 'bg-white/10 text-white/40 border-white/10'}`}>
            {day.attendanceStatus}
          </span>

          {/* Linked indicators */}
          {day.mealAllowances.length > 0 && <Coffee className="w-3 h-3 text-amber-400 shrink-0" />}
          {day.timeCorrections.length > 0 && <Clock className="w-3 h-3 text-blue-400 shrink-0" />}
          {day.leaves.length > 0 && <Calendar className="w-3 h-3 text-teal-400 shrink-0" />}
          {day.wfh.length > 0 && <Home className="w-3 h-3 text-violet-400 shrink-0" />}

          {expanded ? <ChevronUp className="w-3.5 h-3.5 text-white/30 shrink-0" /> : <ChevronDown className="w-3.5 h-3.5 text-white/30 shrink-0" />}
        </button>

        {/* Expanded detail */}
        {expanded && (
          <div className="px-4 pb-4 space-y-3 bg-white/3">
            {/* Validation status banner */}
            <div className="flex items-center gap-2">
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${VAL_BADGE[day.validationStatus]}`}>
                {day.validationStatus}
              </span>
              {day.validatedBy && (
                <span className="text-white/30 text-[10px]">by {day.validatedBy} • {fmtDate(day.validatedAt || '')}</span>
              )}
              {day.validationRemarks && (
                <span className="text-red-300/70 text-[10px] italic ml-1">"{day.validationRemarks}"</span>
              )}
            </div>

            {/* ─── ATTENDANCE ─────────────────────────────── */}
            <div className="bg-white/5 border border-white/8 rounded-xl p-3 space-y-2">
              <p className="text-white/50 text-[10px] font-semibold uppercase tracking-wider">Attendance</p>
              <div className="grid grid-cols-2 gap-2 text-xs">
                {day.timeInTimestamp && (
                  <div>
                    <p className="text-white/30 text-[9px]">Clock-In</p>
                    <p className="text-white/70">{fmtTime(day.timeInTimestamp)}</p>
                  </div>
                )}
                {day.timeOutTimestamp && (
                  <div>
                    <p className="text-white/30 text-[9px]">Clock-Out</p>
                    <p className="text-white/70">{fmtTime(day.timeOutTimestamp)}</p>
                  </div>
                )}
              </div>

              {/* Photos */}
              {(day.timeInImageId || day.timeInImageUrl || day.timeOutImageId || day.timeOutImageUrl) && (
                <div className="flex gap-2 mt-1">
                  {(day.timeInImageId || day.timeInImageUrl) && (
                    <div className="flex flex-col items-center gap-0.5">
                      <DriveImage
                        imageId={day.timeInImageId || extractDriveId(day.timeInImageUrl ?? '') || undefined}
                        alt="Time In"
                        className="w-14 h-14 rounded-lg"
                        thumbnail
                        onClick={(src) => setLightbox(src)}
                      />
                      <span className="text-white/30 text-[8px]">In</span>
                    </div>
                  )}
                  {(day.timeOutImageId || day.timeOutImageUrl) && (
                    <div className="flex flex-col items-center gap-0.5">
                      <DriveImage
                        imageId={day.timeOutImageId || extractDriveId(day.timeOutImageUrl ?? '') || undefined}
                        alt="Time Out"
                        className="w-14 h-14 rounded-lg"
                        thumbnail
                        onClick={(src) => setLightbox(src)}
                      />
                      <span className="text-white/30 text-[8px]">Out</span>
                    </div>
                  )}
                </div>
              )}

              {/* GPS/Location */}
              {day.address && (
                <div className="flex items-start gap-1.5 mt-1">
                  <MapPin className="w-3 h-3 text-emerald-400 shrink-0 mt-0.5" />
                  <span className="text-white/50 text-[10px] leading-relaxed">{day.address}</span>
                </div>
              )}
              {!!(day.latitude && day.longitude) && (
                <div className="flex items-center gap-1.5">
                  <Navigation className="w-3 h-3 text-violet-400 shrink-0" />
                  <a href={`https://maps.google.com/?q=${day.latitude},${day.longitude}`}
                    target="_blank" rel="noopener noreferrer"
                    className="text-violet-300 text-[10px] underline">
                    {day.latitude.toFixed(5)}, {day.longitude.toFixed(5)}
                  </a>
                </div>
              )}

              {/* Device */}
              {day.deviceInfo && (
                <div className="flex items-center gap-1.5">
                  <Smartphone className="w-3 h-3 text-white/30 shrink-0" />
                  <span className="text-white/40 text-[10px]">{day.deviceInfo}</span>
                </div>
              )}
            </div>

            {/* ─── MEAL ALLOWANCE ─────────────────────────── */}
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
                        alt="Meal"
                        className="w-10 h-10 rounded-lg shrink-0"
                        thumbnail
                        onClick={(src) => setLightbox(src)}
                      />
                    )}
                    <div className="flex-1 min-w-0 text-[10px]">
                      <p className="text-white/70">Meal #{ma.sequence}</p>
                      {ma.address && <p className="text-white/40 truncate">{ma.address}</p>}
                      <p className="text-white/30">{fmtTime(ma.timestamp)}</p>
                      {ma.remarks && <p className="text-white/40 italic">{ma.remarks}</p>}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* ─── TIME CORRECTION ───────────────────────── */}
            {day.timeCorrections.length > 0 && (
              <div className="bg-blue-500/5 border border-blue-400/15 rounded-xl p-3 space-y-2">
                <p className="text-blue-300/80 text-[10px] font-semibold uppercase tracking-wider flex items-center gap-1.5">
                  <Clock className="w-3 h-3" /> Time Correction ({day.timeCorrections.length})
                </p>
                {day.timeCorrections.map(tc => (
                  <div key={tc.id} className="bg-white/5 rounded-lg p-2 text-[10px] space-y-1">
                    <div className="flex items-center gap-2">
                      <span className={`px-1.5 py-0.5 rounded-full border text-[8px] font-semibold ${
                        tc.status === 'Approved' ? 'bg-emerald-500/15 text-emerald-300 border-emerald-400/20' :
                        tc.status === 'Rejected' ? 'bg-red-500/15 text-red-300 border-red-400/20' :
                        'bg-amber-500/15 text-amber-300 border-amber-400/20'
                      }`}>{tc.status}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-1">
                      <div><span className="text-white/30">Orig In:</span> <span className="text-white/60">{tc.originalTimeIn || '—'}</span></div>
                      <div><span className="text-white/30">Orig Out:</span> <span className="text-white/60">{tc.originalTimeOut || '—'}</span></div>
                      <div><span className="text-white/30">Corr In:</span> <span className="text-blue-300">{tc.correctedTimeIn || '—'}</span></div>
                      <div><span className="text-white/30">Corr Out:</span> <span className="text-blue-300">{tc.correctedTimeOut || '—'}</span></div>
                    </div>
                    {tc.reason && <p className="text-white/40 italic">Reason: {tc.reason}</p>}
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

            {/* ─── LEAVE ─────────────────────────────────── */}
            {day.leaves.length > 0 && (
              <div className="bg-teal-500/5 border border-teal-400/15 rounded-xl p-3 space-y-2">
                <p className="text-teal-300/80 text-[10px] font-semibold uppercase tracking-wider flex items-center gap-1.5">
                  <Calendar className="w-3 h-3" /> Leave ({day.leaves.length})
                </p>
                {day.leaves.map(lv => (
                  <div key={lv.id} className="bg-white/5 rounded-lg p-2 text-[10px] space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-white/70 font-medium">{lv.leaveType}</span>
                      <span className={`px-1.5 py-0.5 rounded-full border text-[8px] font-semibold ${
                        lv.status === 'Approved' ? 'bg-emerald-500/15 text-emerald-300 border-emerald-400/20' :
                        lv.status === 'Rejected' ? 'bg-red-500/15 text-red-300 border-red-400/20' :
                        'bg-amber-500/15 text-amber-300 border-amber-400/20'
                      }`}>{lv.status}</span>
                    </div>
                    <p className="text-white/40">{fmtDate(lv.startDate)} – {fmtDate(lv.endDate)} ({lv.totalDays}d)</p>
                  </div>
                ))}
              </div>
            )}

            {/* ─── WFH ───────────────────────────────────── */}
            {day.wfh.length > 0 && (
              <div className="bg-violet-500/5 border border-violet-400/15 rounded-xl p-3 space-y-2">
                <p className="text-violet-300/80 text-[10px] font-semibold uppercase tracking-wider flex items-center gap-1.5">
                  <Home className="w-3 h-3" /> Work From Home ({day.wfh.length})
                </p>
                {day.wfh.map(w => (
                  <div key={w.id} className="bg-white/5 rounded-lg p-2 text-[10px] space-y-1">
                    <div className="flex items-center gap-2">
                      <span className={`px-1.5 py-0.5 rounded-full border text-[8px] font-semibold ${
                        w.status === 'Approved' ? 'bg-emerald-500/15 text-emerald-300 border-emerald-400/20' :
                        w.status === 'Rejected' ? 'bg-red-500/15 text-red-300 border-red-400/20' :
                        'bg-violet-500/15 text-violet-300 border-violet-400/20'
                      }`}>{w.status}</span>
                    </div>
                    <p className="text-white/50">{w.workDescription}</p>
                    {w.eodSummary && <p className="text-white/40 italic">EOD: {w.eodSummary}</p>}
                    {w.eodSubmittedAt && <p className="text-white/30">Submitted: {fmtTime(w.eodSubmittedAt)}</p>}
                    {w.attachments && w.attachments.length > 0 && (
                      <div className="flex gap-1 mt-1 flex-wrap">
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

            {/* ─── ACTIONS ───────────────────────────────── */}
            {!isRestOrHoliday && (
              <div className="flex gap-2 pt-1">
                {day.validationStatus !== 'Validated' && (
                  <button onClick={handleValidate} disabled={acting}
                    className="flex items-center gap-1.5 bg-emerald-500/15 text-emerald-300 border border-emerald-400/20 text-[10px] font-semibold px-3 py-2 rounded-xl active:scale-95 transition-transform disabled:opacity-50">
                    {acting ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
                    Validate
                  </button>
                )}
                {day.validationStatus !== 'Flagged' && (
                  <button onClick={() => setShowFlagModal(true)} disabled={acting}
                    className="flex items-center gap-1.5 bg-red-500/15 text-red-300 border border-red-400/20 text-[10px] font-semibold px-3 py-2 rounded-xl active:scale-95 transition-transform disabled:opacity-50">
                    <Flag className="w-3 h-3" />
                    Flag
                  </button>
                )}
                {day.validationStatus !== 'Pending' && (
                  <button onClick={handleClearFlag} disabled={acting}
                    className="flex items-center gap-1.5 bg-white/5 text-white/50 border border-white/10 text-[10px] font-medium px-3 py-2 rounded-xl active:scale-95 transition-transform disabled:opacity-50">
                    Reset
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────
export default function DTRValidation({ user, onBack }: Props) {
  const [records, setRecords] = useState<DTRRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDTR, setSelectedDTR] = useState<string | null>(null);
  const [valData, setValData] = useState<DTRValidationData | null>(null);
  const [valLoading, setValLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  const showToast = (type: 'success' | 'error', msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3500);
  };

  const loadRecords = useCallback(async () => {
    setLoading(true);
    const res = await getDTRList(user.email);
    setRecords(res.records || []);
    setLoading(false);
  }, [user.email]);

  useEffect(() => { loadRecords(); }, [loadRecords]);

  const loadValidation = async (dtrId: string) => {
    setSelectedDTR(dtrId);
    setValLoading(true);
    const res = await getDTRValidationData(dtrId, user.email);
    if (res.success && res.data) {
      setValData(res.data);
    } else {
      showToast('error', res.message || 'Failed to load validation data');
      setSelectedDTR(null);
    }
    setValLoading(false);
  };

  const handleDayValidated = (date: string, status: ValidationStatus, by: string, at: string) => {
    if (!valData) return;
    setValData({
      ...valData,
      days: valData.days.map(d => d.date === date ? { ...d, validationStatus: status, validatedBy: by, validatedAt: at } : d),
    });
    showToast('success', `${fmtDate(date)} → ${status}`);
  };

  // Filter records for DTR picker
  const filtered = useMemo(() => {
    if (!search.trim()) return records;
    const q = search.toLowerCase();
    return records.filter(r =>
      r.employeeName.toLowerCase().includes(q) || r.employeeEmail.toLowerCase().includes(q)
    );
  }, [records, search]);

  // Validation summary stats
  const valStats = useMemo(() => {
    if (!valData) return { total: 0, validated: 0, flagged: 0, pending: 0 };
    const days = valData.days.filter(d => d.attendanceStatus !== 'Rest Day' && d.attendanceStatus !== 'Holiday');
    return {
      total: days.length,
      validated: days.filter(d => d.validationStatus === 'Validated').length,
      flagged: days.filter(d => d.validationStatus === 'Flagged').length,
      pending: days.filter(d => d.validationStatus === 'Pending').length,
    };
  }, [valData]);

  // ─── DTR Selection Screen ───────────────────────
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
              <p className="text-white/40 text-xs">Select a DTR to validate</p>
            </div>
            <button onClick={loadRecords} className="w-8 h-8 flex items-center justify-center rounded-xl bg-white/10 active:scale-90 transition-transform">
              <RefreshCw className={`w-4 h-4 text-white ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-3 py-2">
            <Search className="w-3.5 h-3.5 text-white/30 shrink-0" />
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search employee..."
              className="bg-transparent text-white text-xs flex-1 outline-none placeholder-white/30"
            />
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
              <p className="text-white/40 text-sm">No DTR records found</p>
            </div>
          ) : filtered.map(r => (
            <button key={r.id} onClick={() => loadValidation(r.id)}
              className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 text-left active:bg-white/8 transition-colors">
              <div className="flex items-center gap-3">
                <EmployeeAvatar src={r.employeeImage} name={r.employeeName} size="sm" />
                <div className="flex-1 min-w-0">
                  <p className="text-white font-medium text-sm truncate">{r.employeeName}</p>
                  <p className="text-white/40 text-[10px] truncate">{r.employeeEmail}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-white/60 text-[10px]">{MONTHS[(r.month || 1) - 1]} {r.year}</p>
                  <p className="text-white/40 text-[10px]">{r.cutOff} Cut-Off</p>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ─── Validation Detail Screen ──────────────────────
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
        <div className="flex items-center gap-3 mb-3">
          <button onClick={() => { setSelectedDTR(null); setValData(null); }}
            className="w-8 h-8 flex items-center justify-center rounded-xl bg-white/10 active:scale-90 transition-transform">
            <ArrowLeft className="w-4 h-4 text-white" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-white font-bold text-base truncate">DTR Validation</h1>
            {valData && (
              <p className="text-white/40 text-xs truncate">
                {valData.employeeName} — {MONTHS[(valData.month || 1) - 1]} {valData.year}, {valData.cutOff} Cut-Off
              </p>
            )}
          </div>
          <button onClick={() => selectedDTR && loadValidation(selectedDTR)}
            className="w-8 h-8 flex items-center justify-center rounded-xl bg-white/10 active:scale-90 transition-transform">
            <RefreshCw className={`w-4 h-4 text-white ${valLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Stats */}
        {valData && (
          <div className="grid grid-cols-4 gap-2">
            <div className="bg-white/5 rounded-xl p-2 text-center border border-white/5">
              <p className="text-sm font-bold text-white">{valStats.total}</p>
              <p className="text-white/40 text-[9px]">Total</p>
            </div>
            <div className="bg-white/5 rounded-xl p-2 text-center border border-white/5">
              <p className="text-sm font-bold text-emerald-300">{valStats.validated}</p>
              <p className="text-white/40 text-[9px]">Validated</p>
            </div>
            <div className="bg-white/5 rounded-xl p-2 text-center border border-white/5">
              <p className="text-sm font-bold text-red-300">{valStats.flagged}</p>
              <p className="text-white/40 text-[9px]">Flagged</p>
            </div>
            <div className="bg-white/5 rounded-xl p-2 text-center border border-white/5">
              <p className="text-sm font-bold text-slate-300">{valStats.pending}</p>
              <p className="text-white/40 text-[9px]">Pending</p>
            </div>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 px-4 pt-4 space-y-4">
        {valLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
          </div>
        ) : !valData ? (
          <div className="flex flex-col items-center py-16 gap-2">
            <AlertCircle className="w-10 h-10 text-white/10" />
            <p className="text-white/40 text-sm">No data loaded</p>
          </div>
        ) : (
          <>
            {/* Employee info */}
            <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
              <div className="flex items-center gap-3">
                <EmployeeAvatar src={valData.employeeImage} name={valData.employeeName} size="md" />
                <div className="flex-1 min-w-0">
                  <p className="text-white font-semibold text-sm truncate">{valData.employeeName}</p>
                  <p className="text-white/40 text-xs truncate">{valData.employeeEmail}</p>
                  <div className="flex items-center gap-3 mt-1 text-[10px] text-white/40">
                    {valData.department && <span className="flex items-center gap-1"><Briefcase className="w-2.5 h-2.5" />{valData.department}</span>}
                    {valData.designation && <span>{valData.designation}</span>}
                  </div>
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-white/5 grid grid-cols-2 gap-2 text-xs">
                <div>
                  <p className="text-white/30 text-[9px]">Coverage</p>
                  <p className="text-white/70">{fmtDate(valData.coverageStart)} – {fmtDate(valData.coverageEnd)}</p>
                </div>
                <div>
                  <p className="text-white/30 text-[9px]">Cut-Off</p>
                  <p className="text-white/70">{valData.cutOff} Cut-Off</p>
                </div>
              </div>
            </div>

            {/* Day records table */}
            <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
                <h2 className="text-white/70 text-xs font-semibold uppercase tracking-wider">Daily Records</h2>
                <span className="text-white/30 text-xs">{valData.days.length} days</span>
              </div>
              {/* Column headers */}
              <div className="flex items-center gap-2 px-4 py-2 bg-white/3 border-b border-white/5 text-[9px] text-white/30">
                <span className="w-2" />
                <span className="flex-1">Date</span>
                <span className="w-12 text-right">In/Out</span>
                <span className="w-10 text-right">Hours</span>
                <span className="w-16 text-right">Status</span>
                <span className="w-4" />
              </div>
              {valData.days.map(day => (
                <ValidationDayRow
                  key={day.date}
                  day={day}
                  dtrId={valData.dtrId}
                  adminEmail={user.email}
                  onValidated={handleDayValidated}
                />
              ))}
            </div>

            {/* Audit Trail */}
            {valData.auditTrail.length > 0 && (
              <div className="bg-white/3 border border-white/8 rounded-2xl overflow-hidden">
                <div className="px-4 py-3 border-b border-white/5">
                  <h2 className="text-white/40 text-xs font-semibold uppercase tracking-wider">Validation Audit Trail</h2>
                </div>
                <div className="px-4 py-3 space-y-3 max-h-64 overflow-y-auto">
                  {valData.auditTrail.map((entry, i) => (
                    <div key={i} className="flex items-start gap-3">
                      <div className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${
                        entry.action === 'FLAGGED' ? 'bg-red-400' :
                        entry.action === 'VALIDATED' ? 'bg-emerald-400' : 'bg-blue-400'
                      }`} />
                      <div>
                        <p className="text-white/70 text-[10px] font-medium">
                          {entry.action} — {entry.field && <span className="text-white/40">{fmtDate(entry.field)}</span>}
                        </p>
                        <p className="text-white/30 text-[9px]">
                          by {entry.by} • {fmtDate(entry.timestamp)} {fmtTime(entry.timestamp)}
                        </p>
                        {entry.remarks && <p className="text-white/40 text-[9px] italic mt-0.5">"{entry.remarks}"</p>}
                        {entry.previousValue && entry.updatedValue && (
                          <p className="text-white/30 text-[9px]">{entry.previousValue} → {entry.updatedValue}</p>
                        )}
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
